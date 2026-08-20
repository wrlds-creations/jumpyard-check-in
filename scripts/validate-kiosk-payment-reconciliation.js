const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeDraftFinalizeAction,
  publicKioskPaymentStatus,
} = require('../infra/lambda/booking/kiosk-terminal-contract');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const bookingSource = read('infra', 'lambda', 'booking', 'index.js');
const lookupSource = read('infra', 'lambda', 'lookup', 'index.js');
const webhookSource = read('infra', 'lambda', 'webhook', 'index.js');
const stackSource = read('infra', 'lib', 'jumpyard-cloud-stack.ts');
const migrationSource = read('infra', 'migrations', '0019_kiosk_payment_reconciliation.sql');
const provisionalMigrationSource = read('infra', 'migrations', '0020_provisional_kiosk_handoff.sql');

assert.equal(normalizeDraftFinalizeAction(undefined), 'result');
assert.equal(normalizeDraftFinalizeAction('result'), 'result');
assert.equal(normalizeDraftFinalizeAction('status'), 'status');
assert.equal(normalizeDraftFinalizeAction('retry'), null);

assert.deepEqual(
  publicKioskPaymentStatus({
    booking_confirmation_status: 'pending',
    payment_attempt_status: 'approved',
    status: 'payment_pending',
  }),
  {
    status: 'pending',
    payment: { status: 'approved' },
    booking: { bookingReference: null, status: 'pending' },
  },
);
const provisionalStatus = publicKioskPaymentStatus({
  booking_confirmation_status: 'pending',
  booking_date: '2026-08-18',
  checkin_session_id: 'jycs_test',
  customer_first_name: 'Love',
  customer_last_name: 'Wrlds',
  guest_access_expires_at: '2026-08-18T12:00:00.000Z',
  handoff_status: 'not_ready',
  items_summary: JSON.stringify([{
    bookingDate: '2026-08-18',
    durationMinutes: 60,
    endTime: '11:00',
    productId: '101',
    productName: 'Entré 60 min',
    productType: 'entry',
    quantity: 1,
    startTime: '10:00',
  }]),
  payment_attempt_id: 'jytp_123456789012345678',
  payment_attempt_status: 'approved',
  roller_draft_unique_id: 'draft-a',
  safety_status: 'not_started',
  session_expires_at: '2026-08-18T12:00:00.000Z',
  session_status: 'guest_in_progress',
  status: 'payment_pending',
});
assert.equal(provisionalStatus.status, 'pending');
assert.equal(provisionalStatus.provisionalHandoff.booking.paymentStatus, 'paid');
assert.equal(provisionalStatus.provisionalHandoff.guestAccess.token, 'jytp_123456789012345678');
assert.equal(provisionalStatus.provisionalHandoff.session.bookingSyncStatus, 'pending');
assert.deepEqual(provisionalStatus.provisionalHandoff.booking.items[0], {
  bookingDate: '2026-08-18',
  durationMinutes: 60,
  endTime: '11:00',
  parentProductId: null,
  parentProductName: null,
  parentType: null,
  productId: '101',
  productName: 'Entré 60 min',
  productSubType: null,
  productType: 'entry',
  quantity: 1,
  startTime: '10:00',
  tickets: [],
});
assert.deepEqual(
  publicKioskPaymentStatus({
    booking_confirmation_status: 'confirmed',
    payment_attempt_status: 'reconciled',
    roller_booking_reference: 'safe-booking-reference',
    status: 'published',
  }),
  {
    status: 'confirmed',
    payment: { status: 'reconciled' },
    booking: { bookingReference: 'safe-booking-reference', status: 'confirmed' },
  },
);
assert.equal(
  publicKioskPaymentStatus({ payment_attempt_status: 'cancelled', status: 'cancelled' }).status,
  'failed',
);
assert.equal(
  publicKioskPaymentStatus({ payment_attempt_status: 'unknown', status: 'payment_pending' }).status,
  'needs_staff',
);
for (const outcome of ['failed', 'cancelled']) {
  assert.equal(
    publicKioskPaymentStatus({ payment_attempt_status: outcome, status: outcome }).status,
    'failed',
  );
}

assert.match(bookingSource, /KIOSK_PUBLISH_SETTLEMENT_DELAY_MS = 10_000/);
const publishRetryOffsetsSource = bookingSource.match(/KIOSK_PUBLISH_RETRY_OFFSETS_MS = \[([\s\S]*?)\];/)?.[1] ?? '';
const publishRetryOffsets = [...publishRetryOffsetsSource.matchAll(/\b\d[\d_]*\b/g)].map((match) =>
  Number(match[0].replaceAll('_', '')),
);
assert.deepEqual(publishRetryOffsets, [10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000]);
assert.match(bookingSource, /KIOSK_RECONCILIATION_OFFSETS_MS = \[[\s\S]*75_000,[\s\S]*\]/);
assert.match(bookingSource, /const waitMs = startedAt \+ offsetMs - Date\.now\(\)/);
assert.doesNotMatch(bookingSource, /await wait\(offsetMs\)/);
const offsetsSource = bookingSource.match(/KIOSK_RECONCILIATION_OFFSETS_MS = \[([\s\S]*?)\];/)?.[1] ?? '';
const offsets = [...offsetsSource.matchAll(/\b\d[\d_]*\b/g)].map((match) => Number(match[0].replaceAll('_', '')));
assert.deepEqual(offsets, Array.from({ length: 16 }, (_, index) => index * 5_000));
assert.match(bookingSource, /InvocationType: 'Event'/);
assert.match(bookingSource, /process\.env\.AWS_LAMBDA_FUNCTION_NAME/);
assert.match(bookingSource, /publish_attempted_at IS NULL/);
assert.match(bookingSource, /reconciliation_claimed_at < now\(\) - interval '3 minutes'/);
assert.match(bookingSource, /WHEN payment_attempt_status = 'approved' AND :outcome <> 'approved' THEN payment_attempt_status/);
assert.match(bookingSource, /booking_confirmation_status = 'confirmed'/);
assert.match(bookingSource, /booking\.kiosk_terminal_reconciliation_exhausted/);
assert.match(bookingSource, /KioskApprovalToBookingLatency/);
assert.match(bookingSource, /KioskTerminalOutcomeCount/);
assert.match(bookingSource, /KioskPublishConflictCount/);
assert.match(bookingSource, /KioskReconciliationDispatchFailureCount/);
assert.match(bookingSource, /payload: \{ failureClass \}/);
assert.match(bookingSource, /request\.action === 'status'/);
assert.match(bookingSource, /ensureProvisionalKioskHandoff\(request\)/);
assert.match(bookingSource, /selected_ticket_ids = CAST\(:selectedTicketIds AS jsonb\)/);
assert.match(bookingSource, /(?:bookingSyncStatus:|'bookingSyncStatus',) 'needs_staff'/);
assert.match(provisionalMigrationSource, /jumpyard\.checkin_sessions/);
assert.match(provisionalMigrationSource, /jumpyard_booking_runtime/);
assert.match(bookingSource, /if \(publishResult\.ok\) \{[\s\S]*normalizeBookingReadback\(publishResult\.body(?:,\s*\{[\s\S]*?\})?\)/);
assert.match(bookingSource, /candidate\?\.rollerUniqueId[\s\S]*readbackIdentifiers\.push\(candidate\.rollerUniqueId\)/);
assert.match(bookingSource, /for \(const identifier of readbackIdentifiers\)/);
assert.ok(
  bookingSource.indexOf('recordKioskPublishResult') < bookingSource.indexOf('await recordKioskReconciliationAttempt'),
  'a rejected, conflicting, or ambiguous publish must still continue into bounded booking readback',
);
assert.ok(
  bookingSource.indexOf('publishRetryAllowed = await claimKioskPublishAttempt(request)') <
    bookingSource.indexOf(
      'publishNoPaymentDraft(config, token',
      bookingSource.indexOf('publishRetryAllowed = await claimKioskPublishAttempt(request)'),
    ),
  'the durable publish-sequence claim must execute before the first provider publish call',
);
assert.ok(
  bookingSource.indexOf('offsetMs >= KIOSK_PUBLISH_SETTLEMENT_DELAY_MS') <
    bookingSource.indexOf('publishNoPaymentDraft(config, token', bookingSource.indexOf('offsetMs >= KIOSK_PUBLISH_SETTLEMENT_DELAY_MS')),
  'the first provider publish must wait for the bounded terminal-payment settlement window',
);
assert.match(
  bookingSource,
  /publishRetryAllowed && KIOSK_PUBLISH_RETRY_OFFSETS_MS\.includes\(offsetMs\)/,
);
assert.match(bookingSource, /const retryableConflict = publishResult\.status === 409/);
assert.match(bookingSource, /publishRetryAllowed = retryableConflict/);
assert.match(bookingSource, /catch \{[\s\S]*publishRetryAllowed = false;[\s\S]*'transport_unknown'/);
assert.doesNotMatch(bookingSource, /retryableConflict\s*=\s*publishResult\.status\s*>=/);
assert.ok(
  bookingSource.indexOf("WHEN payment_attempt_status = 'approved' AND :outcome <> 'approved'") > -1,
  'late cancelled/failed/unknown callbacks must not regress an approved attempt',
);

assert.match(stackSource, /timeout: Duration\.minutes\(2\)/);
assert.match(stackSource, /actions: \['lambda:InvokeFunction'\]/);
assert.match(stackSource, /arnFormat: ArnFormat\.COLON_RESOURCE_NAME/);
assert.equal(
  (stackSource.match(/routeKey: 'POST \/v1\/bookings\/draft\/finalize'/g) ?? []).length,
  1,
  'reconciliation must reuse the existing finalize route instead of creating another public route',
);

assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS booking_confirmation_status/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS reconciliation_attempt_count/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS publish_attempted_at/);
assert.match(migrationSource, /IN \('pending', 'confirmed', 'failed', 'needs_staff'\)/);
assert.match(migrationSource, /prepayment_booking_drafts_confirmation_pending_idx/);

for (const source of [lookupSource, webhookSource]) {
  assert.match(source, /payment_attempt_status = CASE/);
  assert.match(source, /booking_confirmation_status = CASE/);
  assert.match(source, /roller_booking_reference = CASE/);
  assert.match(source, /reconciliation_completed_at = CASE/);
}

assert.doesNotMatch(bookingSource, /paymentJwt\s*[:=].*console\.log/);
assert.doesNotMatch(bookingSource, /deviceId\s*[:=].*console\.log/);
assert.doesNotMatch(bookingSource, /terminalId\s*[:=].*console\.log/);

console.log('Kiosk payment reconciliation validation passed.');
