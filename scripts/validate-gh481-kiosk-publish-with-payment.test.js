// GH-481 (D0238): an approved kiosk terminal payment is published to ROLLER together with its
// payment, once and at once; everything else falls back to readback of ROLLER's own booking.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');
const source = fs.readFileSync(path.join(root, 'infra/lambda/booking/index.js'), 'utf8');
const capability = 'C'.repeat(43); // Synthetic fixture, never a provisioned credential.
const installationId = `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}`;
const transactionRef = 'PSP4817OK0000001';
const merchantId = 'RollerPay_JumpYardNacka';
const draftUniqueId = 'synthetic-draft-uuid';
const prepaymentDraftId = `jypd_${'1'.repeat(18)}`;
const paymentAttemptId = `jytp_${'2'.repeat(18)}`;
// Objects built inside the VM realm carry its own prototypes; compare their plain JSON shape.
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadBackend(overrides = {}) {
  const module = { exports: {} };
  const fakeAws = new Proxy({}, { get: () => class {
    constructor(input) { this.input = input; }
    async send() { throw new Error('No AWS calls allowed in GH481 tests'); }
  } });
  const sandbox = { Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, console, crypto, module,
    exports: module.exports, process: { env: {} }, setTimeout, clearTimeout, overrides,
    fetch: () => { throw new Error('No network allowed'); },
    require(name) {
      if (name.startsWith('@aws-sdk/')) return fakeAws;
      if (name === 'crypto') return crypto;
      if (name === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (name === './package-contents') return require('../infra/lambda/shared/package-contents');
      if (name.startsWith('./')) return require(path.join(root, 'infra/lambda/booking', name));
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  vm.runInNewContext(source + '\n' + Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n') +
    '\nmodule.exports.tests = { handleDraft, handleDraftFinalize, handleKioskPaymentReconciliation, persistPrepaymentDraft, recordKioskTerminalOutcome, claimKioskReconciliation };', sandbox);
  return module.exports.tests;
}

const confirmedBooking = (extra = {}) => ({
  uniqueId: draftUniqueId,
  bookingReference: '171849053',
  paymentStatus: 'Paid',
  costs: { amountOwing: 0 },
  items: [{ productId: '101', tickets: [{ ticketId: 'synthetic-ticket' }] }],
  ...extra,
});

// A worker run against scripted ROLLER answers. `readbacks` is consumed per GET; when it runs
// out, ROLLER still has no booking (404).
function workerFixture({ claimed = {}, flowType = 'new_booking', publish, readbacks = [], publishClaim = true } = {}) {
  const calls = { posts: [], gets: [], publishResults: [], needsStaff: [], confirmations: 0, publishClaims: 0 };
  const row = { payment_attempt_status: 'approved', booking_confirmation_status: 'pending', status: 'payment_pending',
    flow_type: flowType, roller_draft_unique_id: draftUniqueId, payment_attempt_id: paymentAttemptId };
  const backend = loadBackend({
    findKioskPrepaymentAttempt: async () => ({ ...row }),
    isEmergencyStopEnabled: () => false,
    isNewBookingDraftWriteEnabled: () => true,
    isAddProductDraftWriteEnabled: () => true,
    claimKioskReconciliation: async () => ({ roller_draft_unique_id: draftUniqueId,
      payment_approved_at: new Date().toISOString(), amount_owing_cents: 20000,
      kiosk_installation_id: installationId, terminal_transaction_ref: transactionRef,
      terminal_merchant_id: merchantId, ...claimed }),
    getRollerConfig: async () => ({ env: 'playground' }),
    getRollerAccessToken: async () => ({ accessToken: 'synthetic-access' }),
    claimKioskPublishAttempt: async () => { calls.publishClaims += 1; return publishClaim && calls.publishClaims === 1; },
    postRollerJson: async (_config, _token, endpoint, payload) => {
      calls.posts.push({ endpoint, payload });
      if (publish instanceof Error) throw publish;
      return publish ?? { ok: true, status: 201, body: { uniqueId: draftUniqueId, bookingReference: '171849053' } };
    },
    getRollerJson: async (_config, _token, endpoint) => {
      calls.gets.push(endpoint);
      const next = readbacks.shift();
      return next ?? { ok: false, status: 404, body: null };
    },
    recordKioskPublishResult: async (_request, status, result) => { calls.publishResults.push({ status, result }); },
    recordKioskReconciliationAttempt: async () => {},
    persistKioskReconciliationBookingSnapshot: async () => {},
    confirmKioskReconciliation: async () => {
      calls.confirmations += 1;
      return { attached_session_count: 1, attached_token_count: 1, reconciliation_attempt_count: 1 };
    },
    confirmKioskAddProductReconciliation: async () => { calls.confirmations += 1; return { add_on_group_id: 'jyao_synthetic' }; },
    markKioskReconciliationNeedsStaff: async (_request, reason) => { calls.needsStaff.push(reason); },
    writeBookingEventLog: async () => {},
    emitKioskReconciliationMetric: () => {},
    emitKioskPublishMetric: () => {},
    wait: async () => {},
  });
  const run = () => backend.handleKioskPaymentReconciliation({ prepaymentDraftId, paymentAttemptId }, 'test-correlation');
  return { calls, run };
}

test('An approved attempt with its transaction id is published once, at once, with the payment', async () => {
  const { calls, run } = workerFixture({ readbacks: [{ ok: true, status: 200, body: confirmedBooking() }] });
  assert.deepEqual(plain(await run()), { status: 'confirmed' });
  assert.equal(calls.posts.length, 1);
  assert.deepEqual(plain(calls.posts[0]), {
    endpoint: '/bookings/draft/publish',
    payload: { uniqueId: draftUniqueId,
      payment: { id: transactionRef, paymentType: 'CreditCard', amount: 200, MerchantId: merchantId } },
  });
  assert.deepEqual(calls.publishResults, [{ status: 201, result: 'accepted' }]);
  assert.equal(calls.gets.length, 1, 'one readback after the publish confirms the booking');
  assert.equal(calls.confirmations, 1);
  assert.deepEqual(calls.needsStaff, []);
});

test('A publish response that already carries the paid booking needs no readback', async () => {
  const { calls, run } = workerFixture({ publish: { ok: true, status: 201, body: confirmedBooking() } });
  assert.deepEqual(plain(await run()), { status: 'confirmed' });
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.gets.length, 0);
});

for (const [name, publish, result] of [
  ['a 409', { ok: false, status: 409, body: null }, { status: 409, result: 'provider_rejected' }],
  ['any other rejection', { ok: false, status: 400, body: null }, { status: 400, result: 'provider_rejected' }],
  ['a transport ambiguity', new Error('socket hang up'), { status: 0, result: 'transport_unknown' }],
]) {
  test(`After ${name} the worker never publishes again and waits for ROLLER's own booking`, async () => {
    const readbacks = Array.from({ length: 10 }, () => ({ ok: false, status: 404, body: null }));
    readbacks.push({ ok: true, status: 200, body: confirmedBooking() });
    const { calls, run } = workerFixture({ publish, readbacks });
    assert.deepEqual(plain(await run()), { status: 'confirmed' });
    assert.equal(calls.posts.length, 1);
    assert.deepEqual(calls.publishResults, [result]);
    assert.equal(calls.gets.length, 11);
  });
}

test('Exhausted readback after a rejected publish ends in needs_staff without another provider write', async () => {
  const { calls, run } = workerFixture({ publish: { ok: false, status: 409, body: null } });
  assert.deepEqual(plain(await run()), { status: 'needs_staff' });
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.gets.length, 16);
  assert.deepEqual(calls.needsStaff, ['confirmation_timeout']);
});

for (const [name, claimed] of [
  ['no transaction id', { terminal_transaction_ref: null }],
  ['no merchant account (gateway refunds would fail)', { terminal_merchant_id: null }],
  ['a legacy-alias draft', { kiosk_installation_id: null }],
  ['no verified amount owing', { amount_owing_cents: null }],
]) {
  test(`With ${name} nothing is published and ROLLER's own booking is read back`, async () => {
    const { calls, run } = workerFixture({ claimed, readbacks: [
      { ok: false, status: 404, body: null },
      { ok: true, status: 200, body: confirmedBooking() },
    ] });
    assert.deepEqual(plain(await run()), { status: 'confirmed' });
    assert.equal(calls.posts.length, 0);
    assert.equal(calls.publishClaims, 0);
  });
}

test('A second worker for the same attempt cannot publish the payment again', async () => {
  const { calls, run } = workerFixture({ publishClaim: false, readbacks: [{ ok: true, status: 200, body: confirmedBooking() }] });
  assert.deepEqual(plain(await run()), { status: 'confirmed' });
  assert.equal(calls.publishClaims, 1);
  assert.equal(calls.posts.length, 0);
});

test('An existing-booking add-on payment is published the same way', async () => {
  const addOnBooking = confirmedBooking({ items: [{ productId: '202', tickets: [] }] });
  const { calls, run } = workerFixture({ flowType: 'add_product', readbacks: [{ ok: true, status: 200, body: addOnBooking }] });
  assert.deepEqual(plain(await run()), { status: 'confirmed' });
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.posts[0].payload.payment.paymentType, 'CreditCard');
  assert.equal(calls.confirmations, 1);
});

// The finalize request: only an approval may carry a well-formed transaction id.
function finalizeFixture() {
  const statements = [];
  const queued = [];
  const backend = loadBackend({
    findKioskPrepaymentAttempt: async () => ({ prepayment_draft_id: prepaymentDraftId, payment_attempt_id: paymentAttemptId,
      roller_draft_unique_id: draftUniqueId, payment_attempt_status: 'created', booking_confirmation_status: 'pending',
      status: 'payment_pending', flow_type: 'new_booking' }),
    executeStatement: async (sql, parameters) => {
      statements.push({ sql, parameters });
      return { columnMetadata: [{ name: 'prepayment_draft_id' }], records: [[{ stringValue: prepaymentDraftId }]] };
    },
    ensureProvisionalKioskHandoff: async () => null,
    markExistingProvisionalKioskSafetyResume: async () => {},
    queueKioskPaymentReconciliation: async (request) => { queued.push(request); },
    isEmergencyStopEnabled: () => false,
    isNewBookingDraftWriteEnabled: () => true,
    isAddProductDraftWriteEnabled: () => true,
    emitKioskTerminalOutcomeMetric: () => {},
    emitKioskReconciliationMetric: () => {},
    writeBookingEventLog: async () => {},
  });
  const finalize = (body) => backend.handleDraftFinalize({ headers: {} }, {
    idempotencyKey: 'synthetic-finalize', paymentAttemptId, prepaymentDraftId, rollerDraftUniqueId: draftUniqueId, ...body,
  }, 'test-correlation');
  const storedParameter = (name) => {
    const update = statements.find(({ sql }) => sql.includes('terminal_transaction_ref = CASE'));
    assert.ok(update, 'the outcome update stores the transaction id and merchant account');
    const parameter = update.parameters.find((p) => p.name === name);
    return parameter.value.isNull ? null : parameter.value.stringValue;
  };
  const storedRef = () => storedParameter('terminalTransactionRef');
  const storedMerchant = () => storedParameter('terminalMerchantId');
  return { finalize, queued, storedRef, storedMerchant };
}

test('An approval forwards a well-formed transaction id to the outcome update', async () => {
  const { finalize, queued, storedRef, storedMerchant } = finalizeFixture();
  const response = await finalize({ outcome: 'approved', terminalTransactionId: ` ${transactionRef} `, terminalMerchantId: merchantId });
  assert.equal(response.statusCode, 202, response.body);
  assert.equal(storedRef(), transactionRef);
  assert.equal(storedMerchant(), merchantId);
  assert.equal(queued.length, 1);
  assert.ok(!response.body.includes(transactionRef), 'the response never echoes the transaction id');
  assert.ok(!response.body.includes(merchantId), 'the response never echoes the merchant account');
});

for (const [name, body] of [
  ['a missing id', { outcome: 'approved' }],
  ['a malformed id', { outcome: 'approved', terminalTransactionId: 'not valid; DROP' }],
  ['a non-string id', { outcome: 'approved', terminalTransactionId: 8816178952380553 }],
]) {
  test(`An approval with ${name} is still recorded, without a transaction id`, async () => {
    const { finalize, queued, storedRef } = finalizeFixture();
    const response = await finalize(body);
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(storedRef(), null);
    assert.equal(queued.length, 1);
  });
}

for (const [name, value] of [['a missing', undefined], ['a malformed', 'has space; DROP'], ['a non-string', 42]]) {
  test(`An approval with ${name} merchant account is still recorded, without one`, async () => {
    const { finalize, queued, storedRef, storedMerchant } = finalizeFixture();
    const response = await finalize({ outcome: 'approved', terminalTransactionId: transactionRef, terminalMerchantId: value });
    assert.equal(response.statusCode, 202, response.body);
    assert.equal(storedRef(), transactionRef);
    assert.equal(storedMerchant(), null);
    assert.equal(queued.length, 1);
  });
}

for (const outcome of ['failed', 'cancelled', 'unknown']) {
  test(`A ${outcome} result never stores a transaction id`, async () => {
    const { finalize, storedRef, storedMerchant } = finalizeFixture();
    const response = await finalize({ outcome, terminalTransactionId: transactionRef, terminalMerchantId: merchantId });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(storedRef(), null);
    assert.equal(storedMerchant(), null);
  });
}

// Draft creation records the installation only when its capability was verified.
function persistFixture() {
  const statements = [];
  const backend = loadBackend({
    buildPrepaymentItemsSummary: async () => [],
    executeStatement: async (sql, parameters) => {
      statements.push({ sql, parameters });
      return { columnMetadata: [{ name: 'prepayment_draft_id' }, { name: 'payment_attempt_id' }],
        records: [[{ stringValue: prepaymentDraftId }, { stringValue: paymentAttemptId }]] };
    },
  });
  const persist = (request) => backend.persistPrepaymentDraft({
    config: { env: 'playground' },
    draft: { uniqueId: draftUniqueId, costs: { total: 200, amountOwing: 200 } },
    externalId: 'JY-D-synthetic', idempotencyKey: 'synthetic-draft', jwtSummary: { present: true },
    paymentConfig: { available: true },
    request: { items: [{ productId: 101, quantity: 1, bookingDate: '2026-10-05', startTime: '12:00' }],
      customer: { firstName: 'Test', lastName: 'Fixture', email: 'test@example.invalid', phone: '+46000000000' },
      ...request },
  });
  const storedInstallation = () => {
    const insert = statements.find(({ sql }) => sql.includes('INSERT INTO jumpyard.prepayment_booking_drafts'));
    const parameter = insert.parameters.find((p) => p.name === 'kioskInstallationId');
    return parameter.value.isNull ? null : parameter.value.stringValue;
  };
  return { persist, storedInstallation };
}

test('A capability-verified kiosk draft records its installation; legacy and phone drafts do not', async () => {
  for (const [request, expected] of [
    [{ channel: 'kiosk', reservedPaymentAttemptId: paymentAttemptId, verifiedKioskInstallationId: installationId }, installationId],
    [{ channel: 'kiosk', reservedPaymentAttemptId: paymentAttemptId, verifiedKioskInstallationId: null }, null],
    [{ verifiedKioskInstallationId: installationId }, null],
  ]) {
    const { persist, storedInstallation } = persistFixture();
    await persist(request);
    assert.equal(storedInstallation(), expected, JSON.stringify(request));
  }
});

test('Only the installation identity path yields an installation id for the draft', () => {
  const config = {
    env: 'playground', kioskVenueId: '50871', allowLegacyKioskTerminalAlias: true,
    kioskInstallations: contract.normalizeKioskInstallationMap({
      [installationId]: { active: true, allowedProfileIds: ['nacka-forum-kiosk-2'], venueId: '50871' },
    }),
    kioskProfiles: contract.normalizeKioskProfileMap({
      'nacka-forum-kiosk-2': { active: true, paymentTerminalAlias: 'primary', venueId: '50871' },
    }),
    paymentTerminals: contract.normalizePaymentTerminalMap({
      primary: { terminalId: 'synthetic-terminal', deviceId: 'synthetic-device', lockId: `kt_${'4'.repeat(32)}` },
    }),
  };
  const bound = contract.resolveKioskPaymentTerminal(config, { channel: 'kiosk', kioskInstallationId: installationId,
    kioskCapability: capability, kioskProfileId: 'nacka-forum-kiosk-2' });
  assert.equal(bound.installationId, installationId);
  const legacy = contract.resolveKioskPaymentTerminal(config, { channel: 'kiosk', paymentTerminalAlias: 'primary' });
  assert.equal(legacy.error, undefined);
  assert.equal(legacy.installationId, undefined);
});

test('PostgreSQL: the transaction id is kept once, only for an installation-bound approval', {
  skip: process.env.GH481_DATABASE_TEST !== 'true',
}, async () => {
  const { Pool } = require('../infra/node_modules/pg');
  const port = Number(process.env.GH481_PGPORT || 55481);
  assert.ok([55481, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const connection = { host: '127.0.0.1', port, database: 'jumpyard_cloud',
    user: port === 55481 ? 'gh481_test' : 'gh345_test', password: '', ssl: false };
  const admin = new Pool(connection);
  const runtime = new Pool({ ...connection, max: 4, options: '-c role=jumpyard_booking_runtime' });
  const prefix = `gh481_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const executeStatement = async (sql, parameters) => {
    const indexes = new Map(parameters.map((p, i) => [p.name, i + 1]));
    const prepared = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (m, name) => indexes.has(name) ? `$${indexes.get(name)}` : m);
    const result = await runtime.query(prepared, parameters.map((p) => p.value.stringValue ?? p.value.longValue ?? null));
    return { columnMetadata: result.fields.map((f) => ({ name: f.name })),
      records: result.rows.map((r) => result.fields.map((f) => ({ stringValue: r[f.name] }))) };
  };
  const backend = loadBackend({ executeStatement });
  const insertDraft = async (suffix, installation) => {
    const draftId = `jypd_${crypto.createHash('sha256').update(prefix + suffix).digest('hex').slice(0, 18)}`;
    const attemptId = `jytp_${crypto.createHash('sha256').update(prefix + suffix + 'attempt').digest('hex').slice(0, 18)}`;
    await admin.query(`INSERT INTO jumpyard.prepayment_booking_drafts
      (prepayment_draft_id, roller_draft_unique_id, external_id, idempotency_key, roller_env, flow_type, payment_channel,
       payment_attempt_id, payment_attempt_status, booking_confirmation_status, kiosk_installation_id, amount_owing_cents)
      VALUES ($1, $1, $1, $1, 'playground', 'new_booking', 'card_present', $2, 'created', 'pending', $3, 20000)`,
    [draftId, attemptId, installation]);
    return { prepaymentDraftId: draftId, paymentAttemptId: attemptId };
  };
  const storedRef = async (attempt) => (await admin.query(
    'SELECT terminal_transaction_ref FROM jumpyard.prepayment_booking_drafts WHERE payment_attempt_id = $1',
    [attempt.paymentAttemptId])).rows[0].terminal_transaction_ref;
  try {
    const bound = await insertDraft('bound', installationId);
    await backend.recordKioskTerminalOutcome({ ...bound, terminalTransactionRef: transactionRef, terminalMerchantId: merchantId }, 'approved');
    assert.equal(await storedRef(bound), transactionRef);
    await backend.recordKioskTerminalOutcome({ ...bound, terminalTransactionRef: 'PSP4817OTHER0002', terminalMerchantId: 'OtherMerchant' }, 'approved');
    assert.equal(await storedRef(bound), transactionRef, 'the first reported id is never overwritten');
    const claimed = await backend.claimKioskReconciliation(bound);
    assert.deepEqual(contract.kioskTerminalPublishPayment(claimed),
      { id: transactionRef, paymentType: 'CreditCard', amount: 200, MerchantId: merchantId });

    const legacy = await insertDraft('legacy', null);
    await backend.recordKioskTerminalOutcome({ ...legacy, terminalTransactionRef: transactionRef, terminalMerchantId: merchantId }, 'approved');
    assert.equal(await storedRef(legacy), null, 'a legacy-alias draft never stores a transaction id');
    const legacyMerchant = (await admin.query('SELECT terminal_merchant_id FROM jumpyard.prepayment_booking_drafts WHERE payment_attempt_id = $1',
      [legacy.paymentAttemptId])).rows[0].terminal_merchant_id;
    assert.equal(legacyMerchant, null, 'a legacy-alias draft never stores a merchant account');

    await assert.rejects(admin.query(`UPDATE jumpyard.prepayment_booking_drafts SET terminal_transaction_ref = 'bad ref'
      WHERE payment_attempt_id = $1`, [legacy.paymentAttemptId]), /terminal_transaction_ref_check/);
    await assert.rejects(admin.query(`UPDATE jumpyard.prepayment_booking_drafts SET terminal_merchant_id = 'bad merchant'
      WHERE payment_attempt_id = $1`, [bound.paymentAttemptId]), /terminal_merchant_id_check/);
    await assert.rejects(admin.query(`UPDATE jumpyard.prepayment_booking_drafts SET kiosk_installation_id = 'primary'
      WHERE payment_attempt_id = $1`, [legacy.paymentAttemptId]), /kiosk_installation_id_check/);
  } finally {
    await admin.query(`DELETE FROM jumpyard.prepayment_booking_drafts
      WHERE prepayment_draft_id = ANY($1)`, [['bound', 'legacy'].map((suffix) =>
      `jypd_${crypto.createHash('sha256').update(prefix + suffix).digest('hex').slice(0, 18)}`)]);
    await runtime.end(); await admin.end();
  }
});
