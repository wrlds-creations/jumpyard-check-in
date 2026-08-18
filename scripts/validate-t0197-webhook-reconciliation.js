const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const handlerPath = path.join(repoRoot, 'infra', 'lambda', 'webhook', 'index.js');
const stackPath = path.join(repoRoot, 'infra', 'lib', 'jumpyard-cloud-stack.ts');
const configPath = path.join(repoRoot, 'infra', 'config', 'park-test-full-flow-rehearsal.json');
const closedConfigPath = path.join(repoRoot, 'infra', 'config', 'park-test.json');
const migrationPath = path.join(repoRoot, 'infra', 'migrations', '0015_t0197_webhook_reconciliation.sql');
const eventLogMigrationPath = path.join(repoRoot, 'infra', 'migrations', '0016_t0197_event_log_conflict_key.sql');
const signedBookingAmountPath = path.join(
  repoRoot,
  'infra',
  'migrations',
  '0017_gh_212_signed_booking_amount_owing.sql',
);
const operatorPath = path.join(repoRoot, 'infra', 'scripts', 'roller-live-webhook-reconciliation.ts');
const handlerSource = fs.readFileSync(handlerPath, 'utf8');
const stackSource = fs.readFileSync(stackPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');
const eventLogMigrationSource = fs.readFileSync(eventLogMigrationPath, 'utf8');
const signedBookingAmountSource = fs.readFileSync(signedBookingAmountPath, 'utf8');
const operatorSource = fs.readFileSync(operatorPath, 'utf8');
const liveConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const closedConfig = JSON.parse(fs.readFileSync(closedConfigPath, 'utf8'));
const { __test } = require(handlerPath);

async function main() {
  const originalEnv = { ...process.env };
  try {
    testExactAuthenticationAndLiveGuard();
    await testFastDurableIntake();
    await testSafeInvalidDuplicateAndFailureResponses();
    await testBoundedAutomaticRecovery();
    testSignalAndQueueValidation();
    testVenueAndRetentionScope();
    await testPacingAndRetry();
    await testAuthoritativeIdempotentProcessing();
    testInfrastructureAndLeastPrivilege();
  } finally {
    __test.reset();
    process.env = originalEnv;
  }
}

function setLiveEnv() {
  process.env.DATABASE_CLUSTER_ARN = 'arn:aws:rds:eu-north-1:376129878018:cluster:test';
  process.env.DATABASE_SECRET_ARN = 'arn:aws:secretsmanager:eu-north-1:376129878018:secret:test';
  process.env.ENABLE_ROLLER_WEBHOOK_PROCESSING = 'true';
  process.env.JUMPYARD_EMERGENCY_STOP = 'false';
  process.env.JUMPYARD_ENVIRONMENT = 'park-test';
  process.env.ROLLER_WEBHOOK_BOOKING_RETENTION_DAYS = '30';
  process.env.ROLLER_WEBHOOK_LIVE_APPROVAL = 'T0197_LIVE_WEBHOOK_PROCESSING_APPROVED';
  process.env.ROLLER_WEBHOOK_MAX_RECOVERY_ATTEMPTS = '5';
  process.env.ROLLER_WEBHOOK_REQUEST_INTERVAL_MS = '1000';
  process.env.ROLLER_WEBHOOK_VENUE_ID = '50871';
  process.env.WEBHOOK_AUTH_HEADER = 'x-roller-apikey';
  process.env.WEBHOOK_DEV_TOKEN = 'exact-test-token';
  process.env.WEBHOOK_QUEUE_URL = 'https://sqs.eu-north-1.amazonaws.com/376129878018/test.fifo';
  process.env.WEBHOOK_RUNTIME_MODE = 'intake';
  process.env.ROLLER_BASE_URL_PARAMETER_NAME = '/test/roller/base-url';
  process.env.ROLLER_CREDENTIALS_SECRET_ARN = 'arn:aws:secretsmanager:eu-north-1:376129878018:secret:roller';
  process.env.ROLLER_ENV_PARAMETER_NAME = '/test/roller/env';
}

async function testSafeInvalidDuplicateAndFailureResponses() {
  setLiveEnv();
  __test.reset();
  let databaseCalls = 0;
  let queueCalls = 0;
  __test.setHooks({
    executeStatement: async () => {
      databaseCalls += 1;
      return { records: [] };
    },
    sendQueue: async () => {
      queueCalls += 1;
      return {};
    },
  });

  const malformed = await __test.handleWebhookIntake({ ...httpEvent({}), body: '{' });
  assert.equal(malformed.statusCode, 200);
  assert.equal(JSON.parse(malformed.body).error.code, 'invalid_json');
  const oversized = await __test.handleWebhookIntake({
    ...httpEvent({}),
    body: JSON.stringify({ value: 'x'.repeat(256 * 1024) }),
  });
  assert.equal(oversized.statusCode, 200);
  assert.equal(JSON.parse(oversized.body).error.code, 'payload_too_large');
  assert.equal(databaseCalls, 0);
  assert.equal(queueCalls, 0);

  __test.reset();
  __test.setHooks({
    executeStatement: async (command) => {
      if (/INSERT INTO jumpyard\.roller_webhook_events/.test(command.input.sql)) return { records: [] };
      if (/SELECT status, enrichment_attempts/.test(command.input.sql)) {
        return { records: [[{ stringValue: 'processed' }, { longValue: 1 }]] };
      }
      return { records: [] };
    },
    sendQueue: async () => {
      queueCalls += 1;
      return {};
    },
  });
  const duplicate = await __test.handleWebhookIntake(httpEvent({
    eventId: 'evt-processed',
    eventType: 'Updated',
    bookingReference: 'BOOKING-1',
  }));
  assert.equal(JSON.parse(duplicate.body).status, 'duplicate');
  assert.equal(queueCalls, 0);

  __test.reset();
  __test.setHooks({
    executeStatement: async (command) => {
      if (/INSERT INTO jumpyard\.roller_webhook_events/.test(command.input.sql)) return { records: [] };
      if (/SELECT status, enrichment_attempts/.test(command.input.sql)) {
        return { records: [[{ stringValue: 'failed' }, { longValue: 5 }]] };
      }
      return { records: [] };
    },
    sendQueue: async () => {
      queueCalls += 1;
      return {};
    },
  });
  const exhaustedDuplicate = await __test.handleWebhookIntake(httpEvent({
    eventId: 'evt-exhausted',
    eventType: 'Updated',
    bookingReference: 'BOOKING-1',
  }));
  assert.equal(JSON.parse(exhaustedDuplicate.body).status, 'duplicate');
  assert.equal(queueCalls, 0);

  __test.reset();
  __test.setHooks({ executeStatement: async () => { throw new Error('hidden database failure'); } });
  const persistenceFailure = await __test.handleWebhookIntake(httpEvent({
    eventId: 'evt-persist-fail',
    eventType: 'Updated',
    bookingReference: 'BOOKING-1',
  }));
  assert.equal(persistenceFailure.statusCode, 500);
  assert.equal(JSON.parse(persistenceFailure.body).status, 'intake_failed');

  __test.reset();
  __test.setHooks({
    executeStatement: async (command) => (
      /INSERT INTO jumpyard\.roller_webhook_events/.test(command.input.sql)
        ? { records: [[{ stringValue: 'evt-queue-fail' }]] }
        : { records: [] }
    ),
    sendQueue: async () => { throw new Error('hidden queue failure'); },
  });
  const queueFailure = await __test.handleWebhookIntake(httpEvent({
    eventId: 'evt-queue-fail',
    eventType: 'Updated',
    bookingReference: 'BOOKING-1',
  }));
  assert.equal(queueFailure.statusCode, 500);
  assert.equal(JSON.parse(queueFailure.body).status, 'intake_failed');
  assert.doesNotMatch(queueFailure.body, /hidden queue failure/);
  console.log('[pass] malformed, oversized, duplicate, persistence, and queue outcomes fail safely');
}

async function testBoundedAutomaticRecovery() {
  setLiveEnv();
  process.env.WEBHOOK_RUNTIME_MODE = 'processor';
  __test.reset();
  let selectorSql = '';
  let selectorParameters = [];
  __test.setHooks({
    executeStatement: async (command) => {
      selectorSql = command.input.sql;
      selectorParameters = command.input.parameters || [];
      return { records: [] };
    },
  });

  const result = await __test.handleWebhookRecovery();
  const maxAttempts = selectorParameters.find((entry) => entry.name === 'maxRecoveryAttempts');
  assert.match(selectorSql, /enrichment_attempts < :maxRecoveryAttempts/);
  assert.equal(maxAttempts.value.longValue, 5);
  assert.equal(result.status, 'completed');
  assert.equal(result.maxRecoveryAttempts, 5);
  assert.equal(__test.isWebhookEventAutomaticallyRetryable({ status: 'failed', enrichmentAttempts: 4 }), true);
  assert.equal(__test.isWebhookEventAutomaticallyRetryable({ status: 'failed', enrichmentAttempts: 5 }), false);
  assert.equal(__test.isWebhookEventAutomaticallyRetryable({ status: 'processed', enrichmentAttempts: 0 }), false);
  console.log('[pass] automatic recovery and duplicate requeue stop at the configured attempt limit');
}

function testExactAuthenticationAndLiveGuard() {
  setLiveEnv();
  assert.equal(__test.getWebhookAuthToken({ headers: { authorization: 'Bearer exact-test-token' } }), null);
  assert.equal(
    __test.getWebhookAuthToken({ headers: { 'X-Roller-ApiKey': 'exact-test-token' } }),
    'exact-test-token',
  );
  assert.deepEqual(
    __test.validateRollerConfig({
      env: 'live',
      baseUrl: 'https://api.roller.app',
      clientId: 'client',
      clientSecret: 'secret',
    }),
    [],
  );
  process.env.ROLLER_WEBHOOK_LIVE_APPROVAL = '';
  assert.match(
    __test.validateRollerConfig({
      env: 'live',
      baseUrl: 'https://api.roller.app',
      clientId: 'client',
      clientSecret: 'secret',
    }).join(' '),
    /exact approved park-test\/Nacka Live scope/,
  );
  console.log('[pass] T0197 requires the exact Roller header and exact Live/Nacka approval');
}

async function testFastDurableIntake() {
  setLiveEnv();
  __test.reset();
  let rollerCalls = 0;
  let databaseCalls = 0;
  const queued = [];
  __test.setHooks({
    executeStatement: async (command) => {
      databaseCalls += 1;
      if (/INSERT INTO jumpyard\.roller_webhook_events/.test(command.input.sql)) {
        return { records: [[{ stringValue: 'evt-1' }]] };
      }
      return { records: [] };
    },
    fetch: async () => {
      rollerCalls += 1;
      throw new Error('Public intake must not call Roller.');
    },
    sendQueue: async (command) => {
      queued.push(command.input);
      return { MessageId: 'message-1' };
    },
  });

  const response = await __test.handleWebhookIntake(httpEvent({
    eventId: 'evt-1',
    eventType: 'Created',
    bookingReference: 'BOOKING-1',
  }));
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'accepted');
  assert.equal(body.webhook.queued, true);
  assert.equal(rollerCalls, 0);
  assert.equal(databaseCalls, 2);
  assert.equal(queued.length, 1);
  assert.equal(JSON.parse(queued[0].MessageBody).eventId, 'evt-1');
  assert.equal(queued[0].MessageGroupId, 'roller-booking-webhooks');

  databaseCalls = 0;
  const unauthorized = await __test.handleWebhookIntake({
    ...httpEvent({ eventId: 'unauthorized', eventType: 'Created', bookingReference: 'BOOKING-2' }),
    headers: { 'x-roller-apikey': 'wrong-token' },
  });
  assert.equal(JSON.parse(unauthorized.body).status, 'ignored_unauthorized');
  assert.equal(databaseCalls, 0);
  console.log('[pass] T0197 intake authenticates, persists, and queues without a Roller REST call');
}

function httpEvent(body) {
  return {
    body: JSON.stringify(body),
    headers: { 'x-roller-apikey': 'exact-test-token' },
    isBase64Encoded: false,
    rawPath: '/v1/roller/webhooks/bookings',
    requestContext: { http: { method: 'POST' } },
    routeKey: 'POST /v1/roller/webhooks/bookings',
  };
}

function testSignalAndQueueValidation() {
  assert.throws(
    () => __test.validateWebhookSignal({ eventId: 'x', eventType: 'Other', bookingReference: 'B' }),
    /approved Roller booking signal/,
  );
  assert.throws(
    () => __test.validateWebhookSignal({ eventId: 'x', eventType: 'Updated' }),
    /usable booking identifier/,
  );
  assert.deepEqual(
    __test.parseWebhookQueueMessage(JSON.stringify({
      correlationId: 'corr-1',
      eventId: 'evt-1',
      operation: 'reconcile_booking_webhook',
    })),
    { correlationId: 'corr-1', eventId: 'evt-1' },
  );
  assert.throws(() => __test.parseWebhookQueueMessage('{'), /valid JSON/);
  console.log('[pass] T0197 rejects unsupported signals and fail-closes queue message shape');
}

function testVenueAndRetentionScope() {
  setLiveEnv();
  __test.reset();
  __test.setHooks({ now: () => Date.parse('2026-07-15T10:00:00Z') });
  const futureBooking = {
    venueId: '50871',
    items: [
      { bookingDate: '2026-06-14', tickets: [] },
      { bookingDate: '2026-12-01', tickets: [] },
    ],
  };
  const accepted = __test.applyWebhookBookingScope(futureBooking, 'live');
  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.items.map((item) => item.bookingDate), ['2026-12-01']);
  assert.equal(__test.applyWebhookBookingScope({ ...futureBooking, venueId: '99999' }, 'live').accepted, false);
  assert.equal(
    __test.applyWebhookBookingScope({ venueId: '50871', items: [{ bookingDate: '2026-06-14' }] }, 'live').reason,
    'booking_outside_retention_window',
  );
  console.log('[pass] T0197 keeps future visits and rejects wrong-venue/expired Live snapshots');
}

async function testPacingAndRetry() {
  setLiveEnv();
  __test.reset();
  let now = 1_000;
  const requestTimes = [];
  const responses = [fakeResponse(429, '2'), fakeResponse(200, null), fakeResponse(200, null)];
  __test.setHooks({
    fetch: async () => {
      requestTimes.push(now);
      return responses.shift();
    },
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  });
  await __test.requestRoller('https://api.roller.app/bookings/1', { method: 'GET' }, 'test');
  await __test.requestRoller('https://api.roller.app/bookings/2', { method: 'GET' }, 'test');
  assert.deepEqual(requestTimes, [1_000, 3_000, 4_000]);
  console.log('[pass] T0197 honors Retry-After and separates sequential Roller request starts by at least one second');
}

async function testAuthoritativeIdempotentProcessing() {
  setLiveEnv();
  process.env.WEBHOOK_RUNTIME_MODE = 'processor';
  __test.reset();
  const statuses = new Map([
    ['evt-newer', 'received'],
    ['evt-older', 'failed'],
  ]);
  let bookingReads = 0;
  let deleteCalls = 0;
  const writtenAmountOwingCents = [];
  const writtenBookingStatuses = [];
  const authoritativeBooking = {
    bookingReference: 'BOOKING-AUTHORITATIVE',
    uniqueId: 'ROLLER-AUTHORITATIVE',
    status: 'Confirmed',
    paymentStatus: 'Paid',
    amountOwing: -3716,
    total: 38456,
    items: [{
      bookingItemId: 'item-1',
      bookingDate: '2026-12-01',
      productId: 10,
      quantity: 1,
      startTime: '10:00:00',
      endTime: '11:00:00',
      tickets: [{ ticketId: 'ticket-1', locations: [] }],
    }],
  };

  __test.setHooks({
    now: () => Date.parse('2026-07-15T10:00:00Z'),
    readParameter: async (name) => name.includes('/env') ? 'live' : 'https://api.roller.app',
    readSecret: async () => ({ clientId: 'client', clientSecret: 'secret' }),
    sleep: async () => {},
    fetch: async (url) => {
      const value = String(url);
      if (value.endsWith('/token')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 300 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value.includes('/bookings/')) {
        bookingReads += 1;
        return new Response(JSON.stringify(authoritativeBooking), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value.endsWith('/venues/me')) {
        return new Response(JSON.stringify({ id: '50871' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (value.endsWith('/products')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected mocked Roller path: ${value}`);
    },
    executeStatement: async (command) => {
      const sql = command.input.sql;
      const parameterEntry = (name) => command.input.parameters?.find((entry) => entry.name === name);
      const parameter = (name) => parameterEntry(name)?.value?.stringValue;
      if (/SELECT\s+event_id_or_hash,[\s\S]*FROM jumpyard\.roller_webhook_events/.test(sql)) {
        const eventId = parameter('eventId');
        return {
          columnMetadata: [
            { name: 'event_id_or_hash' },
            { name: 'event_type' },
            { name: 'booking_reference' },
            { name: 'roller_unique_id' },
            { name: 'payload_hash' },
            { name: 'status' },
            { name: 'enrichment_attempts' },
          ],
          records: [[
            { stringValue: eventId },
            { stringValue: eventId === 'evt-older' ? 'Created' : 'Updated' },
            { stringValue: 'BOOKING-AUTHORITATIVE' },
            { isNull: true },
            { stringValue: 'safe-hash' },
            { stringValue: statuses.get(eventId) },
            { longValue: eventId === 'evt-older' ? 99 : 0 },
          ]],
        };
      }
      if (/SET status = 'pending_enrichment'/.test(sql)) statuses.set(parameter('eventId'), 'pending_enrichment');
      if (/SET status = :status/.test(sql)) statuses.set(parameter('eventId'), parameter('status'));
      if (/INSERT INTO jumpyard\.roller_bookings/.test(sql)) {
        writtenBookingStatuses.push(parameter('bookingStatus'));
        writtenAmountOwingCents.push(parameterEntry('amountOwingCents')?.value?.longValue);
      }
      if (/INSERT INTO jumpyard\.roller_booking_items/.test(sql)) {
        return { records: [[{ stringValue: parameter('bookingItemKey') }]] };
      }
      if (/DELETE FROM jumpyard\.roller_booking_(tickets|items)/.test(sql)) deleteCalls += 1;
      return { records: [] };
    },
  });

  const newer = await __test.processWebhookEventById('evt-newer', 'correlation-newer');
  const older = await __test.processWebhookEventById('evt-older', 'correlation-older');
  assert.equal(newer.status, 'processed');
  assert.equal(older.status, 'processed');
  assert.equal(bookingReads, 2);
  assert.deepEqual(writtenBookingStatuses, ['Confirmed', 'Confirmed']);
  assert.deepEqual(writtenAmountOwingCents, [-371600, -371600]);
  assert.equal(deleteCalls, 4);

  const readsBeforeDuplicate = bookingReads;
  const duplicate = await __test.processWebhookEventById('evt-newer', 'correlation-duplicate');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(bookingReads, readsBeforeDuplicate);
  console.log('[pass] signed amount owing is preserved and explicit replay can recover an exhausted failed event');
}

function fakeResponse(status, retryAfter) {
  return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter } };
}

function testInfrastructureAndLeastPrivilege() {
  assert.equal(liveConfig.safetyGates.rollerWebhookProcessingEnabled, true);
  assert.equal(liveConfig.webhookProcessing.liveApproval, 'T0197_LIVE_WEBHOOK_PROCESSING_APPROVED');
  assert.equal(liveConfig.webhookProcessing.venueId, '50871');
  assert.equal(liveConfig.webhookProcessing.recoveryScheduleEnabled, true);
  assert.equal(closedConfig.safetyGates.rollerWebhookProcessingEnabled, false);
  assert.equal(closedConfig.webhookProcessing.liveApproval, '');
  assert.match(stackSource, /queueName: `\$\{config\.resourcePrefix\}-webhook-events\.fifo`/);
  assert.match(stackSource, /new SqsEventSource\(webhookQueue/);
  assert.match(stackSource, /functionNameSuffix: 'webhook-processor'/);
  assert.match(stackSource, /reservedConcurrentExecutions: 1/);
  assert.match(stackSource, /WebhookRecoveryRule/);
  assert.match(stackSource, /WebhookDlqVisibleAlarm/);
  assert.match(stackSource, /WebhookQueueAgeAlarm/);
  assert.match(stackSource, /WebhookProcessingFailureAlarm/);
  assert.match(stackSource, /WebhookRetryExhaustedAlarm/);
  assert.match(stackSource, /visibilityTimeout: Duration\.minutes\(12\)/);
  const intakeSection = handlerSource.slice(
    handlerSource.indexOf('async function handleWebhookIntake'),
    handlerSource.indexOf('function isSqsEvent'),
  );
  assert.doesNotMatch(intakeSection, /getBookingDetail|enrichWebhookEvent|getRollerAccessToken/);
  assert.match(handlerSource, /applyWebhookBookingScope/);
  assert.match(handlerSource, /deleteMissingWebhookChildren/);
  assert.match(handlerSource, /status IN \('received', 'pending_enrichment', 'failed'\)[\s\S]*enrichment_attempts < :maxRecoveryAttempts/);
  assert.match(handlerSource, /createHash\('sha256'\)[\s\S]*timingSafeEqual/);
  assert.match(migrationSource, /GRANT DELETE ON[\s\S]*roller_booking_tickets[\s\S]*roller_booking_items[\s\S]*jumpyard_webhook_runtime/);
  assert.doesNotMatch(migrationSource, /roller_bookings,|guest_profiles|GRANT ALL|TRUNCATE|DROP TABLE/);
  assert.match(eventLogMigrationSource, /GRANT SELECT \(event_id\) ON jumpyard\.event_log TO jumpyard_webhook_runtime/);
  assert.doesNotMatch(eventLogMigrationSource, /GRANT SELECT ON|event_payload|subject_ref|GRANT ALL|TRUNCATE|DROP TABLE/);
  assert.match(
    signedBookingAmountSource,
    /DROP CONSTRAINT IF EXISTS roller_bookings_amount_owing_nonnegative/,
  );
  assert.doesNotMatch(signedBookingAmountSource, /UPDATE|DELETE|TRUNCATE|DROP TABLE|GRANT/);
  assert.match(operatorSource, /I_APPROVE_T0197_PARK_TEST_SYNTHETIC_WEBHOOK/);
  assert.match(operatorSource, /I_APPROVE_T0197_PARK_TEST_EVENT_REPLAY/);
  assert.match(operatorSource, /method: "GET"/);
  assert.doesNotMatch(operatorSource, /method: "(PUT|PATCH|DELETE)"/);
  console.log('[pass] T0197 FIFO worker, recovery, alarms, kill switch, and child-only DELETE grant are codified');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
