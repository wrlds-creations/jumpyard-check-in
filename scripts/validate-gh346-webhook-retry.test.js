// GH-346 (D0262): one failed webhook event no longer holds the single FIFO group for the queue's
// 12-minute visibility. A failure the worker sees itself is retried after 1, 2, 4 and 8 minutes, a
// ROLLER request that hangs fails after about 15 s, the kiosk confirmation's reason code is logged,
// and the automatic check-in's final refresh counts as an authoritative booking row.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const webhookPath = path.join(root, 'infra', 'lambda', 'webhook', 'index.js');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const webhookSource = fs.readFileSync(webhookPath, 'utf8');
const bookingSource = fs.readFileSync(bookingPath, 'utf8');
const stackSource = fs.readFileSync(path.join(root, 'infra', 'lib', 'jumpyard-cloud-stack.ts'), 'utf8');
const webhook = require(webhookPath).__test;

const QUEUE_URL = 'https://sqs.eu-north-1.amazonaws.com/376129878018/test-webhook-events.fifo';
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
  process.env.ROLLER_WEBHOOK_REQUEST_INTERVAL_MS = '1000';
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

function sqsRecord({ body = '{', receiveCount = '1', messageId = 'message-1' } = {}) {
  return {
    attributes: { ApproximateReceiveCount: receiveCount },
    body,
    eventSource: 'aws:sqs',
    messageId,
    receiptHandle: `receipt-${messageId}`,
  };
}

// Runs the queue handler with captured queue commands and error log lines.
async function runQueue(records, hooks = {}) {
  const queueCommands = [];
  const errors = [];
  webhook.setHooks({
    sendQueue: async (command) => {
      queueCommands.push(command);
      return {};
    },
    ...hooks,
  });
  const originalError = console.error;
  console.error = (line) => errors.push(JSON.parse(line));
  try {
    const result = await webhook.handleWebhookQueue({ Records: records });
    return { errors, queueCommands, result };
  } finally {
    console.error = originalError;
  }
}

test('a seen failure comes back after 1, 2, 4 and 8 minutes, then goes straight to the DLQ', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(webhook.webhookRetryDelaySeconds), [60, 120, 240, 480, 0, 0]);
  for (const missing of [undefined, Number.NaN, 0, -1, 1.5]) {
    assert.equal(webhook.webhookRetryDelaySeconds(missing), 60);
  }
});

test('a failed record is rescheduled with its own receipt and still reported as a batch failure', async () => {
  setProcessorEnv();
  const { errors, queueCommands, result } = await runQueue([sqsRecord({ receiveCount: '1' })]);

  assert.deepEqual(result, { batchItemFailures: [{ itemIdentifier: 'message-1' }] });
  assert.equal(queueCommands.length, 1);
  assert.equal(queueCommands[0].constructor.name, 'ChangeMessageVisibilityCommand');
  assert.deepEqual(queueCommands[0].input, {
    QueueUrl: QUEUE_URL,
    ReceiptHandle: 'receipt-message-1',
    VisibilityTimeout: 60,
  });
  assert.deepEqual(errors, [{
    code: 'invalid_queue_message',
    messageId: 'message-1',
    reason: null,
    retryInSeconds: 60,
    status: 'failed',
  }]);
});

test('each later delivery waits longer, and the fifth is released at once', async () => {
  setProcessorEnv();
  const delays = [];
  for (const receiveCount of ['2', '3', '4', '5']) {
    const { queueCommands } = await runQueue([sqsRecord({ receiveCount })]);
    delays.push(queueCommands[0].input.VisibilityTimeout);
  }
  assert.deepEqual(delays, [120, 240, 480, 0]);
});

test('if the message cannot be rescheduled, the queue visibility applies and the failure still counts', async () => {
  setProcessorEnv();
  const { errors, result } = await runQueue([sqsRecord()], {
    sendQueue: async () => {
      throw new Error('hidden queue failure');
    },
  });
  assert.deepEqual(result, { batchItemFailures: [{ itemIdentifier: 'message-1' }] });
  assert.equal(errors[0].retryInSeconds, null);

  delete process.env.WEBHOOK_QUEUE_URL;
  const withoutQueue = await runQueue([sqsRecord()]);
  assert.equal(withoutQueue.queueCommands.length, 0);
  assert.deepEqual(withoutQueue.result, { batchItemFailures: [{ itemIdentifier: 'message-1' }] });
  assert.equal(withoutQueue.errors[0].retryInSeconds, null);
});

test('a processed record is acknowledged without touching its visibility', async () => {
  setProcessorEnv();
  const { errors, queueCommands, result } = await runQueue([sqsRecord({
    body: JSON.stringify({ correlationId: 'corr-ok', eventId: 'event-1', operation: 'reconcile_booking_webhook' }),
  })], {
    executeStatement: async () => rdsResult([{
      booking_reference: '12345678',
      enrichment_attempts: null,
      event_id_or_hash: 'event-1',
      event_type: 'Created',
      payload_hash: 'hash',
      roller_unique_id: 'roller-booking-id',
      status: 'processed',
    }]),
  });
  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(queueCommands.length, 0);
  assert.equal(errors.length, 0);
});

function kioskCandidateHooks(invokeResult) {
  return {
    executeStatement: async () => rdsResult([{
      payment_attempt_id: 'jytp_123456789012345678',
      prepayment_draft_id: 'jypd_123456789012345678',
    }]),
    invokeLambda: async () => invokeResult,
  };
}

const kioskBooking = { bookingReference: '12345678', externalId: 'JY-D-346', rollerUniqueId: 'roller-booking-id' };

test('a kiosk confirmation that is not confirmed carries its reason code, never booking data', async () => {
  setProcessorEnv();
  process.env.KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME = 'booking-function';
  const payload = (body) => ({ Payload: Buffer.from(JSON.stringify(body)) });

  webhook.setHooks(kioskCandidateHooks(payload({ status: 'needs_staff', reason: 'authoritative_source_invalid' })));
  await assert.rejects(
    webhook.requestKioskAuthoritativeConfirmation(kioskBooking, 'roller_webhook_enrichment', 'corr-346'),
    (error) => error.code === 'kiosk_confirmation_failed' &&
      error.reason === 'authoritative_source_invalid' &&
      error.message.includes('(authoritative_source_invalid)'),
  );

  webhook.setHooks(kioskCandidateHooks(payload({ status: 'needs_staff', reason: 'Guest Anna 0701234567' })));
  await assert.rejects(
    webhook.requestKioskAuthoritativeConfirmation(kioskBooking, 'roller_webhook_enrichment', 'corr-346'),
    (error) => error.reason === 'unknown' && !error.message.includes('Anna'),
  );

  webhook.setHooks(kioskCandidateHooks({ FunctionError: 'Unhandled', Payload: Buffer.from('{}') }));
  await assert.rejects(
    webhook.requestKioskAuthoritativeConfirmation(kioskBooking, 'roller_webhook_enrichment', 'corr-346'),
    (error) => error.reason === 'function_error',
  );

  webhook.setHooks(kioskCandidateHooks(payload({ status: 'confirmed' })));
  assert.deepEqual(
    await webhook.requestKioskAuthoritativeConfirmation(kioskBooking, 'roller_webhook_enrichment', 'corr-346'),
    { status: 'confirmed' },
  );
});

test('a ROLLER request gets a timeout signal, and a hang fails the attempt as roller_request_timeout', async () => {
  setProcessorEnv();
  const seen = [];
  const options = { method: 'GET', headers: { accept: 'application/json' } };
  webhook.setHooks({
    fetch: async (url, requestOptions) => {
      seen.push(requestOptions);
      return { headers: { get: () => null }, ok: true, status: 200 };
    },
    sleep: async () => {},
  });
  const response = await webhook.requestRoller('https://roller.invalid/bookings/1', options, 'get_booking_detail');
  assert.equal(response.status, 200);
  assert.ok(seen[0].signal instanceof AbortSignal);
  assert.equal(seen[0].method, 'GET');
  assert.equal(options.signal, undefined);

  webhook.setHooks({
    fetch: async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    },
  });
  await assert.rejects(
    webhook.requestRoller('https://roller.invalid/bookings/1', options, 'get_booking_detail'),
    (error) => error.code === 'roller_request_timeout' && error.message.includes('get_booking_detail'),
  );

  webhook.setHooks({
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
  });
  await assert.rejects(
    webhook.requestRoller('https://roller.invalid/bookings/1', options, 'get_booking_detail'),
    (error) => error instanceof TypeError && error.code === undefined,
  );
  assert.match(webhookSource, /ROLLER_REQUEST_TIMEOUT_MS = 15_000/);
  assert.match(webhookSource, /AbortSignal\.timeout\(ROLLER_REQUEST_TIMEOUT_MS \+ intervalMs\)/);
});

function fakeAwsModule() {
  return new Proxy({}, {
    get(_target, property) {
      return class FakeAwsClientOrCommand {
        constructor(input) {
          this.input = input;
          this.name = String(property);
        }

        async send() {
          throw new Error(`Unexpected AWS call through ${String(property)} during GH-346 validation.`);
        }
      };
    },
  });
}

function loadKioskConfirmationCheck() {
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async () => {
      throw new Error('Unexpected network call during GH-346 validation.');
    },
    module,
    exports: module.exports,
    process: { env: { ROLLER_DATA_SYNC_VENUE_ID: '50871' } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      if (moduleId.startsWith('./')) return require(path.join(path.dirname(bookingPath), moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) in booking handler.`);
    },
    setTimeout,
  };
  vm.runInNewContext(
    `${bookingSource}\nmodule.exports.__gh346 = { validateKioskAuthoritativeConfirmationCandidates };`,
    sandbox,
    { filename: bookingPath },
  );
  return module.exports.__gh346.validateKioskAuthoritativeConfirmationCandidates;
}

test('the automatic check-in final refresh is an authoritative booking row for the kiosk confirmation', () => {
  const validate = loadKioskConfirmationCheck();
  const candidate = {
    amount_owing_cents: 0,
    booking_currency: null,
    booking_date: '2026-10-12',
    booking_external_id: 'JY-D-346',
    booking_reference: '12345678',
    booking_roller_env: 'Live',
    booking_status: 'Confirmed',
    booking_total_cents: 22000,
    draft_booking_date: '2026-10-12',
    draft_currency: 'SEK',
    draft_roller_env: 'Live',
    draft_total_cents: 22000,
    external_id: 'JY-D-346',
    freshness_status: 'fresh',
    is_tombstoned: false,
    last_seen_from_roller_at: '2026-10-12T13:04:40.000Z',
    payment_status: 'FullyPaid',
    roller_unique_id: 'roller-booking-id',
    source_last_updated_by: 'roller_redeem_final_refresh',
    ticket_ids: JSON.stringify(['ticket-one']),
    venue_id: '50871',
  };
  const request = { bookingReference: '12345678', externalId: 'JY-D-346', rollerUniqueId: 'roller-booking-id' };

  for (const source of ['roller_live_lookup', 'roller_redeem_final_refresh', 'roller_webhook_enrichment']) {
    assert.equal(validate([{ ...candidate, source_last_updated_by: source }], request), null, source);
  }
  // A partial kiosk snapshot, a provisional row or the nightly sync still do not count.
  for (const source of ['kiosk_payment_reconciliation', 'roller_data_api_sync', 'roller_webhook_cancelled_not_found', null]) {
    assert.equal(validate([{ ...candidate, source_last_updated_by: source }], request), 'authoritative_source_invalid');
  }
  // The other checks still apply to a refreshed row.
  assert.equal(validate([{ ...candidate, ticket_ids: '[]' }], request), 'authoritative_tickets_missing');
  assert.equal(validate([{ ...candidate, amount_owing_cents: 1 }], request), 'authoritative_payment_not_settled');
});

test('the queue itself is unchanged: one group, one worker, 12-minute visibility and five deliveries', () => {
  const queueBlock = stackSource.slice(stackSource.indexOf("new sqs.Queue(this, 'WebhookQueue'"));
  const queueDefinition = queueBlock.slice(0, queueBlock.indexOf('});'));
  assert.match(queueDefinition, /maxReceiveCount: 5,/);
  assert.match(queueDefinition, /visibilityTimeout: Duration\.minutes\(12\)/);
  assert.match(webhookSource, /WEBHOOK_QUEUE_MAX_RECEIVE_COUNT = 5;/);
  assert.match(webhookSource, /MessageGroupId: 'roller-booking-webhooks'/);
  assert.match(stackSource, /functionNameSuffix: 'webhook-processor',\s+memorySize: 512,\s+reservedConcurrentExecutions: 1,/);
  assert.match(stackSource, /new SqsEventSource\(webhookQueue, \{\s+batchSize: 1,\s+reportBatchItemFailures: true,/);
  const delays = webhookSource.match(/WEBHOOK_RETRY_DELAY_SECONDS = \[([^\]]+)\]/)[1].split(',').map(Number);
  assert.deepEqual(delays, [60, 120, 240, 480]);
  assert.ok(Math.max(...delays) < 12 * 60, 'every retry wait stays shorter than the queue visibility');
});
