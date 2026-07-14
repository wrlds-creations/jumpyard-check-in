const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const handlerPath = path.join(repoRoot, 'infra', 'lambda', 'data-sync', 'index.js');
const stackPath = path.join(repoRoot, 'infra', 'lib', 'jumpyard-cloud-stack.ts');
const configPath = path.join(repoRoot, 'infra', 'config', 'park-test-full-flow-rehearsal.json');
const closedConfigPath = path.join(repoRoot, 'infra', 'config', 'park-test.json');
const operatorPath = path.join(repoRoot, 'infra', 'scripts', 'roller-live-booking-index.ts');
const conflictGrantPath = path.join(repoRoot, 'infra', 'migrations', '0013_t0196_data_sync_conflict_keys.sql');
const signedPaymentPath = path.join(repoRoot, 'infra', 'migrations', '0014_t0196_signed_payment_amounts.sql');
const handlerSource = fs.readFileSync(handlerPath, 'utf8');
const stackSource = fs.readFileSync(stackPath, 'utf8');
const operatorSource = fs.readFileSync(operatorPath, 'utf8');
const conflictGrantSource = fs.readFileSync(conflictGrantPath, 'utf8');
const signedPaymentSource = fs.readFileSync(signedPaymentPath, 'utf8');
const liveConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const closedConfig = JSON.parse(fs.readFileSync(closedConfigPath, 'utf8'));
const { __test } = require(handlerPath);

async function main() {
  const originalEnv = { ...process.env };
  try {
    testLiveAndPlaygroundGuards();
    testWindowAndScopeBoundaries();
    await testPacingAndRetry();
    testInfrastructureAndOperatorGuards();
  } finally {
    __test.reset();
    process.env = originalEnv;
  }
}

function setLiveEnv() {
  process.env.JUMPYARD_ENVIRONMENT = 'park-test';
  process.env.ENABLE_ROLLER_LIVE_DATA_SYNC = 'true';
  process.env.ROLLER_DATA_SYNC_LIVE_APPROVAL = 'T0196_LIVE_BOOKING_INDEX_APPROVED';
  process.env.ROLLER_DATA_SYNC_VENUE_ID = '50871';
  process.env.ROLLER_DATA_SYNC_MAX_WINDOW_DAYS = '31';
  process.env.ROLLER_DATA_SYNC_MAX_PAGES = '50';
  process.env.ROLLER_DATA_SYNC_PAGE_SIZE = '100';
  process.env.ROLLER_DATA_SYNC_REQUEST_INTERVAL_MS = '1000';
}

function testLiveAndPlaygroundGuards() {
  setLiveEnv();
  assert.deepEqual(
    __test.validateRollerConfig({
      env: 'live',
      baseUrl: 'https://api.roller.app',
      clientId: 'client',
      clientSecret: 'secret',
    }),
    [],
  );
  process.env.ROLLER_DATA_SYNC_LIVE_APPROVAL = '';
  assert.match(
    __test.validateRollerConfig({
      env: 'live',
      baseUrl: 'https://api.roller.app',
      clientId: 'client',
      clientSecret: 'secret',
    }).join(' '),
    /exact approved park-test\/Nacka/,
  );
  process.env.JUMPYARD_ENVIRONMENT = 'dev';
  process.env.ENABLE_ROLLER_LIVE_DATA_SYNC = 'false';
  assert.deepEqual(
    __test.validateRollerConfig({
      env: 'playground',
      baseUrl: 'https://api.play.roller.app',
      clientId: 'client',
      clientSecret: 'secret',
    }),
    [],
  );
  console.log('[pass] T0196 accepts only exact approved Live/Nacka config and preserves Playground');
}

function testWindowAndScopeBoundaries() {
  setLiveEnv();
  __test.validateDateWindow('2026-06-14', '2026-07-15');
  assert.throws(() => __test.validateDateWindow('2026-06-13', '2026-07-15'), /cannot exceed 31 days/);
  assert.throws(
    () => __test.resolveControls({ pageSize: 101 }, { startDate: '2026-07-14', endDate: '2026-07-15' }),
    /deployed bound/,
  );
  assert.deepEqual(__test.buildDailyWindows({ startDate: '2026-07-07', endDate: '2026-07-14' }), [
    { startDate: '2026-07-07', endDate: '2026-07-08' },
    { startDate: '2026-07-08', endDate: '2026-07-09' },
    { startDate: '2026-07-09', endDate: '2026-07-10' },
    { startDate: '2026-07-10', endDate: '2026-07-11' },
    { startDate: '2026-07-11', endDate: '2026-07-12' },
    { startDate: '2026-07-12', endDate: '2026-07-13' },
    { startDate: '2026-07-13', endDate: '2026-07-14' },
  ]);
  const bookingImport = __test.normalizeBookingItems([
    { bookingUniqueId: 'future-id', bookingReference: 'FUTURE', bookingDate: '2026-12-01', bookingCustomerId: 'customer-future' },
  ]);
  assert.equal(bookingImport.bookings[0].bookingDate, '2026-12-01');
  const scope = {
    approvedBookingReferences: new Set(['FUTURE']),
    approvedCustomerIds: new Set(['customer-future']),
    retentionCutoff: '2026-06-14',
  };
  const related = __test.normalizeRelated(
    [
      { ticketId: 'approved-ticket', bookingReference: 'FUTURE', bookingDate: '2026-12-01', customerId: 'customer-future' },
      { ticketId: 'other-ticket', bookingReference: 'OTHER', bookingDate: '2026-12-01', customerId: 'other-customer' },
      { ticketId: 'expired-ticket', bookingReference: 'FUTURE', bookingDate: '2026-06-01', customerId: 'customer-future' },
    ],
    [
      { bookingReference: 'FUTURE', bookingPaymentId: 'approved-payment' },
      { bookingReference: 'OTHER', bookingPaymentId: 'other-payment' },
    ],
    [
      { customerId: 'customer-future', email: 'future@example.test' },
      { customerId: 'other-customer', email: 'other@example.test' },
    ],
    scope,
  );
  assert.deepEqual(related.tickets.map((ticket) => ticket.ticketId), ['approved-ticket']);
  assert.deepEqual(related.payments.map((payment) => payment.bookingPaymentId), ['approved-payment']);
  assert.deepEqual(related.customers.map((customer) => customer.rollerCustomerId), ['customer-future']);
  console.log('[pass] T0196 preserves future visits and filters related Live rows to the approved booking set');
}

async function testPacingAndRetry() {
  setLiveEnv();
  __test.reset();
  let now = 10_000;
  const requestTimes = [];
  const responses = [fakeResponse(429, false, '2'), fakeResponse(200, true, null), fakeResponse(200, true, null)];
  __test.setHooks({
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
    fetch: async () => {
      requestTimes.push(now);
      return responses.shift();
    },
  });
  const first = await __test.requestRoller('https://api.roller.app/data/bookingitems', { method: 'GET' }, 'test');
  assert.equal(first.status, 200);
  await __test.requestRoller('https://api.roller.app/data/tickets', { method: 'GET' }, 'test');
  assert.equal(requestTimes.length, 3);
  assert.ok(requestTimes[1] - requestTimes[0] >= 2000);
  assert.ok(requestTimes[2] - requestTimes[1] >= 1000);
  console.log('[pass] T0196 enforces one-request-per-second pacing and bounded Retry-After handling');
}

function fakeResponse(status, ok, retryAfter) {
  return {
    status,
    ok,
    headers: { get: () => retryAfter },
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function testInfrastructureAndOperatorGuards() {
  assert.equal(liveConfig.dataSync.scheduleEnabled, true);
  assert.equal(liveConfig.dataSync.liveApproval, 'T0196_LIVE_BOOKING_INDEX_APPROVED');
  assert.equal(liveConfig.dataSync.venueId, '50871');
  assert.equal(closedConfig.dataSync.scheduleEnabled, false);
  assert.match(stackSource, /reservedConcurrentExecutions: 1/);
  assert.match(stackSource, /BookingIndexFreshnessAlarm/);
  assert.match(stackSource, /enabled: config\.dataSync\.scheduleEnabled/);
  assert.match(handlerSource, /loadApprovedBookingScope/);
  assert.match(handlerSource, /totalPages > controls\.maxPages/);
  assert.match(handlerSource, /providerWindowCount/);
  for (const [name, nextName] of [
    ['upsertTicket', 'upsertPayment'],
    ['upsertPayment', 'upsertCustomer'],
    ['upsertCustomer', 'upsertProduct'],
  ]) {
    const section = handlerSource.slice(
      handlerSource.indexOf(`async function ${name}`),
      handlerSource.indexOf(`async function ${nextName}`),
    );
    assert.doesNotMatch(section, /EXCLUDED\./, `${name} must not require broad target-row SELECT privileges.`);
  }
  assert.match(operatorSource, /I_APPROVE_T0196_PARK_TEST_AURORA_BACKFILL/);
  assert.match(operatorSource, /I_APPROVE_T0196_ROLLER_LIVE_DATA_API_READS/);
  assert.doesNotMatch(operatorSource, /POST \/bookings|\/redemptions|send-due-messages/);
  assert.match(conflictGrantSource, /GRANT SELECT \(ticket_id\)[\s\S]*roller_booking_tickets/);
  assert.match(conflictGrantSource, /GRANT SELECT \(payment_key\)[\s\S]*roller_booking_payments/);
  assert.match(conflictGrantSource, /GRANT SELECT \(guest_profile_id, last_seen_from_roller_at\)[\s\S]*guest_profiles/);
  assert.doesNotMatch(conflictGrantSource, /GRANT SELECT ON|GRANT ALL/);
  assert.match(
    signedPaymentSource,
    /ALTER TABLE jumpyard\.roller_booking_payments[\s\S]*DROP CONSTRAINT IF EXISTS roller_booking_payments_amount_nonnegative/,
  );
  assert.doesNotMatch(signedPaymentSource, /DROP TABLE|ALTER COLUMN|DELETE FROM|UPDATE /);
  console.log('[pass] T0196 schedule, concurrency, freshness alarm, truncation guard, and operator locks are codified');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
