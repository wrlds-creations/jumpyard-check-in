const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  kioskTerminalPublishPayment,
  normalizeDraftFinalizeAction,
  normalizeTerminalMerchantId,
  normalizeTerminalTransactionRef,
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
const publishMigrationSource = read('infra', 'migrations', '0024_kiosk_terminal_payment_publish.sql');
const merchantMigrationSource = read('infra', 'migrations', '0026_kiosk_terminal_merchant_id.sql');

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
  session_guest_resume_step: 'safety',
  session_status: 'guest_in_progress',
  status: 'payment_pending',
});
assert.equal(provisionalStatus.status, 'pending');
assert.equal(provisionalStatus.provisionalHandoff.booking.paymentStatus, 'paid');
assert.equal(provisionalStatus.provisionalHandoff.guestAccess.token, 'jytp_123456789012345678');
assert.equal(provisionalStatus.provisionalHandoff.session.bookingSyncStatus, 'pending');
assert.equal(provisionalStatus.provisionalHandoff.session.guestResumeStep, 'safety');
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
  // GH-459: 10:00 + 60 min ends at 11:00, Grön on JumpYard's band scheme.
  bandColour: { id: 'gron', name: { sv: 'Grön', en: 'Green' }, swatch: ['#00A651'], endTime: '11:00',
    schemeVersion: 'nacka-2026-09-30' },
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

// GH-481 (D0238): ROLLER publishes a card-present draft only together with its payment, so the
// former settlement wait and the no-payment 409 retries are gone.
assert.doesNotMatch(bookingSource, /KIOSK_PUBLISH_SETTLEMENT_DELAY_MS|KIOSK_PUBLISH_RETRY_OFFSETS_MS/);
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
assert.match(bookingSource, /session\.session_summary ->> 'guestResumeStep' AS session_guest_resume_step/);
assert.match(bookingSource, /bookingSyncStatus: 'pending',[\s\S]*guestResumeStep: 'safety'/);
assert.match(bookingSource, /markExistingProvisionalKioskSafetyResume\(prepayment\)/);
assert.match(bookingSource, /jsonb_build_object\('guestResumeStep', 'safety'\)/);
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
const workerSource = bookingSource.slice(
  bookingSource.indexOf('async function handleKioskPaymentReconciliation('),
  bookingSource.indexOf('async function handleKioskAuthoritativeConfirmation('),
);
assert.match(workerSource, /const terminalPayment = kioskTerminalPublishPayment\(claimed\)/);
assert.match(workerSource, /let publishPending = Boolean\(terminalPayment\)/);
assert.ok(
  workerSource.indexOf('publishPending = false;') < workerSource.indexOf('await claimKioskPublishAttempt(request)') &&
    workerSource.indexOf('await claimKioskPublishAttempt(request)') <
      workerSource.indexOf('publishDraftWithTerminalPayment('),
  'one publish per worker, and the durable claim must execute before the provider publish call',
);
assert.doesNotMatch(workerSource, /publishNoPaymentDraft\(/, 'a card-present draft is never published without its payment');
assert.match(workerSource, /const resultCode = publishResult\.ok \? 'accepted' : 'provider_rejected'/);
assert.match(workerSource, /catch \{\s*await recordKioskPublishResult\(request, 0, 'transport_unknown'\)/);
assert.match(bookingSource, /'\/bookings\/draft\/publish', \{\s*uniqueId: rollerDraftUniqueId,\s*payment,\s*\}/);
assert.match(bookingSource, /request\.verifiedKioskInstallationId = terminalSelection\.installationId \?\? null/);
assert.match(bookingSource, /terminal_transaction_ref = CASE\s*WHEN :outcome = 'approved'\s*AND terminal_transaction_ref IS NULL\s*AND kiosk_installation_id IS NOT NULL/);
assert.match(bookingSource, /terminal_merchant_id = CASE\s*WHEN :outcome = 'approved'\s*AND terminal_merchant_id IS NULL\s*AND kiosk_installation_id IS NOT NULL/);
assert.match(bookingSource, /RETURNING[\s\S]*?amount_owing_cents,\s*kiosk_installation_id,\s*terminal_transaction_ref,\s*terminal_merchant_id`/);

const installationId = `ki_${'a'.repeat(24)}`;
const approvedRow = {
  amount_owing_cents: 20_000,
  kiosk_installation_id: installationId,
  terminal_merchant_id: 'RollerPay_JumpYardNacka',
  terminal_transaction_ref: 'PSP1234567890ABC',
};
// ROLLER (2026-10-07): `MerchantId` links the published payment to its gateway transaction.
assert.deepEqual(kioskTerminalPublishPayment(approvedRow), {
  id: 'PSP1234567890ABC', paymentType: 'CreditCard', amount: 200, MerchantId: 'RollerPay_JumpYardNacka',
});
assert.deepEqual(kioskTerminalPublishPayment({ ...approvedRow, amount_owing_cents: '19950' }).amount, 199.5);
for (const change of [
  { terminal_transaction_ref: null },
  { terminal_transaction_ref: 'short' },
  { terminal_transaction_ref: 'has space 123456' },
  { terminal_merchant_id: null },
  { terminal_merchant_id: '' },
  { terminal_merchant_id: 'has space' },
  { terminal_merchant_id: 'x'.repeat(81) },
  { kiosk_installation_id: null },
  { kiosk_installation_id: 'primary' },
  { amount_owing_cents: 0 },
  { amount_owing_cents: null },
  { amount_owing_cents: -100 },
  { amount_owing_cents: 12.5 },
]) {
  assert.equal(kioskTerminalPublishPayment({ ...approvedRow, ...change }), null, JSON.stringify(change));
}
assert.equal(normalizeTerminalTransactionRef(' 8816178952380553 '), '8816178952380553');
for (const value of [undefined, null, '', 42, 'x'.repeat(65), 'abc-123456', 'abc.1234567']) {
  assert.equal(normalizeTerminalTransactionRef(value), null, String(value));
}
assert.equal(normalizeTerminalMerchantId(' RollerPay_JumpYard.Nacka-1 '), 'RollerPay_JumpYard.Nacka-1');
for (const value of [undefined, null, '', 42, 'x'.repeat(81), 'has space', 'semi;colon', 'quote"']) {
  assert.equal(normalizeTerminalMerchantId(value), null, String(value));
}

assert.match(publishMigrationSource, /ADD COLUMN IF NOT EXISTS kiosk_installation_id text/);
assert.match(publishMigrationSource, /ADD COLUMN IF NOT EXISTS terminal_transaction_ref text/);
assert.match(publishMigrationSource, /kiosk_installation_id ~ '\^ki_\[a-f0-9\]\{24\}\$'/);
assert.match(publishMigrationSource, /terminal_transaction_ref ~ '\^\[A-Za-z0-9\]\{8,64\}\$'/);
assert.match(merchantMigrationSource, /ADD COLUMN IF NOT EXISTS terminal_merchant_id text/);
assert.match(merchantMigrationSource, /terminal_merchant_id ~ '\^\[A-Za-z0-9_\.-\]\{1,80\}\$'/);
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
