// GH-581 (D0284): a kassan change to a kiosk booking that is already confirmed is an ordinary
// booking refresh, so it no longer holds the single FIFO group for about 15 minutes. A kiosk check
// that waiting cannot heal is recorded once and the queue moves on; a transient reason still gets
// the GH-346 retries. The cases replay Sunday 2026-10-18 at Nacka (kiosk group 0088).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { afterEach, test } = require('node:test');

const root = path.resolve(__dirname, '..');
const webhookPath = path.join(root, 'infra', 'lambda', 'webhook', 'index.js');
const bookingSource = fs.readFileSync(path.join(root, 'infra', 'lambda', 'booking', 'index.js'), 'utf8');
const webhook = require(webhookPath).__test;

const QUEUE_URL = 'https://sqs.eu-north-1.amazonaws.com/376129878018/test-webhook-events.fifo';
const EXTERNAL_ID = 'JY-D-20261018124503-0088abcd';
const originalEnv = { ...process.env };

afterEach(() => {
  webhook.reset();
  process.env = { ...originalEnv };
});

function setProcessorEnv() {
  process.env.DATABASE_CLUSTER_ARN = 'arn:aws:rds:eu-north-1:376129878018:cluster:test';
  process.env.DATABASE_SECRET_ARN = 'arn:aws:secretsmanager:eu-north-1:376129878018:secret:test';
  process.env.ENABLE_ROLLER_WEBHOOK_PROCESSING = 'true';
  process.env.JUMPYARD_EMERGENCY_STOP = 'false';
  process.env.JUMPYARD_ENVIRONMENT = 'park-test';
  process.env.KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME = 'booking-function';
  process.env.ROLLER_BASE_URL_PARAMETER_NAME = '/test/roller/base-url';
  process.env.ROLLER_CREDENTIALS_SECRET_ARN = 'arn:aws:secretsmanager:eu-north-1:376129878018:secret:roller';
  process.env.ROLLER_ENV_PARAMETER_NAME = '/test/roller/env';
  process.env.ROLLER_WEBHOOK_BOOKING_RETENTION_DAYS = '30';
  process.env.ROLLER_WEBHOOK_LIVE_APPROVAL = 'T0197_LIVE_WEBHOOK_PROCESSING_APPROVED';
  process.env.ROLLER_WEBHOOK_MAX_RECOVERY_ATTEMPTS = '5';
  process.env.ROLLER_WEBHOOK_REQUEST_INTERVAL_MS = '1000';
  process.env.ROLLER_WEBHOOK_VENUE_ID = '50871';
  process.env.WEBHOOK_QUEUE_URL = QUEUE_URL;
  process.env.WEBHOOK_RUNTIME_MODE = 'processor';
}

function rdsResult(rows) {
  const names = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    columnMetadata: names.map((name) => ({ name })),
    records: rows.map((row) => names.map((name) => (row[name] === null ? { isNull: true } : { stringValue: String(row[name]) }))),
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

// ROLLER after kassan removed one Drop-In entry: the kiosk sold 480 kr, ROLLER now says 240 kr.
const kassanChangedBooking = {
  amountOwing: 0,
  bookingReference: '177982403',
  externalId: EXTERNAL_ID,
  items: [{
    bookingDate: '2026-10-18',
    bookingItemId: 'item-0088',
    endTime: '16:00:00',
    productId: 10,
    quantity: 1,
    startTime: '15:00:00',
    tickets: [{ locations: [], ticketId: 'ticket-0088-1' }],
  }],
  paymentStatus: 'Paid',
  status: 'Confirmed',
  total: 240,
  uniqueId: 'roller-0088',
};

// The kiosk draft as Park stores it: the Booking Lambda attached its Handoff at 14:47.
const attachedDraft = {
  booking_confirmation_status: 'confirmed',
  payment_attempt_id: 'jytp_124e12c5cf7d4277ad',
  prepayment_draft_id: 'jypd_124e12c5cf7d4277ad',
  reconciliation_last_result: 'confirmed',
};
// Marked paid by this worker a moment ago; the Booking Lambda has not attached the Handoff yet.
const unattachedDraft = { ...attachedDraft, reconciliation_last_result: 'confirmed_by_webhook' };

function updatedEvent(overrides = {}) {
  return {
    booking_reference: '177982403',
    enrichment_attempts: 0,
    event_id_or_hash: 'evt-0088-updated',
    event_type: 'Updated',
    payload_hash: 'hash',
    roller_unique_id: 'roller-0088',
    status: 'received',
    ...overrides,
  };
}

function sqsRecord(receiveCount = '1') {
  return {
    attributes: { ApproximateReceiveCount: receiveCount },
    body: JSON.stringify({ correlationId: 'jy_gh581', eventId: 'evt-0088-updated', operation: 'reconcile_booking_webhook' }),
    eventSource: 'aws:sqs',
    messageId: 'message-0088',
    receiptHandle: 'receipt-message-0088',
  };
}

// One queue delivery against a scripted database, ROLLER and Booking Lambda.
async function deliver({ draft, event = updatedEvent(), kioskAnswer = null, receiveCount = '1' }) {
  setProcessorEnv();
  const seen = { bookingReads: 0, bookingTotals: [], errors: [], eventUpdates: [], invokes: [], queueCommands: [] };
  webhook.setHooks({
    executeStatement: async (command) => {
      const sql = command.input.sql;
      const entry = (name) => command.input.parameters?.find((parameter) => parameter.name === name)?.value;
      if (/SELECT\s+event_id_or_hash,[\s\S]*FROM jumpyard\.roller_webhook_events/.test(sql)) return rdsResult([event]);
      if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) seen.bookingTotals.push(entry('totalCents')?.longValue);
      if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) {
        return { records: [[{ stringValue: entry('bookingItemKey').stringValue }]] };
      }
      if (/FROM jumpyard\.prepayment_booking_drafts\s+WHERE external_id = :externalId/.test(sql)) {
        return rdsResult(draft ? [draft] : []);
      }
      if (/SET status = :status/.test(sql)) {
        seen.eventUpdates.push({
          errorSummary: entry('errorSummary')?.stringValue ?? null,
          status: entry('status').stringValue,
        });
        return { records: [[{ longValue: Number(event.enrichment_attempts) + 1 }]] };
      }
      return { records: [] };
    },
    fetch: async (url) => {
      const value = String(url);
      if (value.endsWith('/token')) return jsonResponse({ access_token: 'token', expires_in: 300 });
      if (value.endsWith('/venues/me')) return jsonResponse({ id: '50871' });
      if (value.endsWith('/products')) return jsonResponse([]);
      if (value.includes('/bookings/')) {
        seen.bookingReads += 1;
        return jsonResponse(kassanChangedBooking);
      }
      throw new Error(`Unexpected ROLLER path ${value}`);
    },
    invokeLambda: async (command) => {
      seen.invokes.push(JSON.parse(Buffer.from(command.input.Payload).toString('utf8')));
      return { Payload: Buffer.from(JSON.stringify(kioskAnswer)) };
    },
    now: () => Date.parse('2026-10-18T13:10:14Z'),
    readParameter: async (name) => (name.includes('/env') ? 'live' : 'https://api.roller.app'),
    readSecret: async () => ({ clientId: 'client', clientSecret: 'secret' }),
    sendQueue: async (command) => {
      seen.queueCommands.push(command);
      return {};
    },
    sleep: async () => {},
  });
  const originalError = console.error;
  const originalLog = console.log;
  console.error = (line) => seen.errors.push(JSON.parse(line));
  console.log = () => {};
  try {
    seen.result = await webhook.handleWebhookQueue({ Records: [sqsRecord(receiveCount)] });
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
  seen.kioskChecks = seen.invokes.filter((payload) => payload.source === 'jumpyard.kiosk-authoritative-confirmation');
  return seen;
}

// What the Booking Lambda answered each time on Sunday, had it been asked.
const sundayAnswer = { reason: 'authoritative_total_mismatch', status: 'needs_staff' };

test('0088: an Updated webhook for a confirmed kiosk booking at 240 kr instead of 480 is one ordinary refresh', async () => {
  const seen = await deliver({ draft: attachedDraft, kioskAnswer: sundayAnswer });

  assert.deepEqual(seen.result, { batchItemFailures: [] });
  assert.equal(seen.queueCommands.length, 0, 'the message keeps no visibility delay, so the queue is not held');
  assert.equal(seen.kioskChecks.length, 0, 'the attached Handoff is not checked against the kiosk sale again');
  assert.equal(seen.bookingReads, 1);
  assert.deepEqual(seen.bookingTotals, [24000], 'the cache takes ROLLER\'s new total');
  assert.deepEqual(seen.eventUpdates, [{ errorSummary: null, status: 'processed' }]);
  assert.deepEqual(seen.errors, []);
});

test('the two DLQ messages from Sunday process in one delivery when they are redriven after the release', async () => {
  const seen = await deliver({
    draft: attachedDraft,
    event: updatedEvent({ enrichment_attempts: 8, status: 'failed' }),
    kioskAnswer: sundayAnswer,
  });

  assert.deepEqual(seen.result, { batchItemFailures: [] });
  assert.equal(seen.kioskChecks.length, 0);
  assert.deepEqual(seen.eventUpdates, [{ errorSummary: null, status: 'processed' }]);
});

test('a kiosk check that waiting cannot heal is recorded once, and the queue moves on', async () => {
  const seen = await deliver({ draft: unattachedDraft, kioskAnswer: sundayAnswer });

  assert.equal(seen.kioskChecks.length, 1, 'a Handoff that is not attached yet is still checked');
  assert.deepEqual(seen.result, { batchItemFailures: [] });
  assert.equal(seen.queueCommands.length, 0);
  assert.deepEqual(seen.bookingTotals, [24000]);
  assert.deepEqual(seen.eventUpdates, [{
    errorSummary: 'kiosk_confirmation_not_retried: authoritative_total_mismatch',
    status: 'processed',
  }]);
  assert.deepEqual(seen.errors, [{ code: 'kiosk_confirmation_failed', reason: 'authoritative_total_mismatch', status: 'not_retried' }]);
});

test('a transient reason still comes back after a minute, as in the GH-346 race', async () => {
  const seen = await deliver({
    draft: unattachedDraft,
    kioskAnswer: { reason: 'authoritative_source_invalid', status: 'needs_staff' },
  });

  assert.deepEqual(seen.result, { batchItemFailures: [{ itemIdentifier: 'message-0088' }] });
  assert.equal(seen.queueCommands.length, 1);
  assert.equal(seen.queueCommands[0].constructor.name, 'ChangeMessageVisibilityCommand');
  assert.equal(seen.queueCommands[0].input.VisibilityTimeout, 60);
  assert.equal(seen.eventUpdates.length, 1);
  assert.equal(seen.eventUpdates[0].status, 'failed');
  assert.deepEqual(seen.errors, [{
    code: 'kiosk_confirmation_failed',
    messageId: 'message-0088',
    reason: 'authoritative_source_invalid',
    retryInSeconds: 60,
    status: 'failed',
  }]);
});

test('each kiosk answer is either final or retried, and only the Booking Lambda\'s attachment skips the check', async () => {
  setProcessorEnv();
  const booking = { bookingReference: '177982403', externalId: EXTERNAL_ID, rollerUniqueId: 'roller-0088' };
  const ask = async (draft, answer) => {
    let invokes = 0;
    webhook.setHooks({
      executeStatement: async () => rdsResult([draft]),
      invokeLambda: async () => {
        invokes += 1;
        return answer;
      },
    });
    const originalError = console.error;
    console.error = () => {};
    try {
      return { invokes, result: await webhook.requestKioskAuthoritativeConfirmation(booking, 'roller_webhook_enrichment', 'jy_gh581') };
    } catch (error) {
      return { error, invokes };
    } finally {
      console.error = originalError;
    }
  };
  const payload = (body) => ({ Payload: Buffer.from(JSON.stringify(body)) });

  const attached = await ask(attachedDraft, payload({ status: 'confirmed' }));
  assert.deepEqual(attached.result, { status: 'already_confirmed' });
  // A draft that this worker or the lookup marked paid is still checked.
  for (const result of ['confirmed_by_webhook', 'confirmed_by_lookup', 'readback_pending', null]) {
    const answer = await ask({ ...attachedDraft, reconciliation_last_result: result }, payload({ status: 'confirmed' }));
    assert.deepEqual(answer.result, { status: 'confirmed' }, String(result));
  }

  for (const reason of webhook.KIOSK_CONFIRMATION_FINAL_REASONS) {
    const answer = await ask(unattachedDraft, payload({ reason, status: 'needs_staff' }));
    assert.deepEqual(answer.result, { reason, status: 'not_retried' }, reason);
  }
  const invalidRequest = await ask(unattachedDraft, payload({ status: 'invalid_authoritative_confirmation_request' }));
  assert.deepEqual(invalidRequest.result, { reason: 'invalid_authoritative_confirmation_request', status: 'not_retried' });

  for (const [answer, reason] of [
    [payload({ reason: 'authoritative_tickets_missing', status: 'needs_staff' }), 'authoritative_tickets_missing'],
    [payload({ reason: 'Guest Anna 0701234567', status: 'needs_staff' }), 'unknown'],
    [{ FunctionError: 'Unhandled', Payload: Buffer.from('{}') }, 'function_error'],
  ]) {
    const failed = await ask(unattachedDraft, answer);
    assert.equal(failed.error?.code, 'kiosk_confirmation_failed', reason);
    assert.equal(failed.error.reason, reason);
  }
});

test('every reason the Booking Lambda can give is classified, and no final reason is misspelled', () => {
  const validator = bookingSource.slice(
    bookingSource.indexOf('function validateKioskAuthoritativeConfirmationCandidates('),
    bookingSource.indexOf('function isKioskHandoffAuthoritativelyAttached('),
  );
  const bookingReasons = new Set([
    ...[...validator.matchAll(/return '([a-z_]+)'/g)].map((match) => match[1]),
    ...[...bookingSource.matchAll(/'(authoritative_handoff_attachment_missing|invalid_authoritative_confirmation_request)'/g)]
      .map((match) => match[1]),
  ]);
  // These can heal: the next attempt rewrites the booking row, ROLLER adds the tickets or settles
  // the payment, or the Handoff session appears.
  const transient = new Set([
    'authoritative_booking_not_found',
    'authoritative_booking_not_fresh',
    'authoritative_handoff_attachment_missing',
    'authoritative_payment_not_settled',
    'authoritative_source_invalid',
    'authoritative_tickets_missing',
  ]);
  const final = webhook.KIOSK_CONFIRMATION_FINAL_REASONS;

  assert.ok(bookingReasons.size >= 17, `found ${bookingReasons.size} Booking Lambda reasons`);
  for (const reason of bookingReasons) {
    assert.ok(final.has(reason) !== transient.has(reason), `${reason} must be final or transient, not both or neither`);
  }
  for (const reason of [...final, ...transient]) {
    assert.ok(bookingReasons.has(reason), `${reason} is not a Booking Lambda reason`);
  }
});
