'use strict';

// GH-570 (D0278): ROLLER's draft call is tried once more after a server error or a lost connection, with
// the same payload and externalId, and a draft step that fails before its prepayment row exists releases
// the kiosk's own D0220 claims. On 2026-10-17 two ROLLER 500s (13:30 and 13:34) left K1 and K3 refusing
// about 15 purchases with kiosk_payment_busy until a manual release at 14:07.
// Synthetic data only: no ROLLER, AWS, database or network call leaves this process.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const source = fs.readFileSync(bookingPath, 'utf8');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');

const profile = 'nacka-forum-kiosk-1';
const capability = 'G'.repeat(43); // Synthetic fixture, never a provisioned credential.
const installationId = `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}`;
const CUSTOMER = { firstName: 'Test', lastName: 'Fixture', email: 'gh570@example.invalid', phone: '+46000000570' };
const ITEMS = [{ productId: 101, quantity: 1, bookingDate: '2026-10-19', startTime: '12:00' }];
const JWT = `h.${Buffer.from(JSON.stringify({ currency: 'SEK', merchantReference: 'synthetic-570' })).toString('base64url')}.s`;
const COSTS = { total: 220, amountOwing: 220 };
const plain = (value) => JSON.parse(JSON.stringify(value));

function configuration() {
  return {
    env: 'live', baseUrl: 'https://api.roller.app', kioskVenueId: '50871', allowLegacyKioskTerminalAlias: false,
    kioskInstallations: contract.normalizeKioskInstallationMap({
      [installationId]: { active: true, allowedProfileIds: [profile], venueId: '50871' },
    }),
    kioskProfiles: contract.normalizeKioskProfileMap({
      [profile]: { active: true, paymentTerminalAlias: 'k1', venueId: '50871' },
    }),
    paymentTerminals: contract.normalizePaymentTerminalMap({
      k1: { terminalId: 'synthetic-terminal-k1', lockId: `kt_${'7'.repeat(32)}` },
    }),
  };
}

// The D0220 claim rows and prepayment rows, with the semantics of the three claim statements.
function claimStore() {
  const claims = new Map();
  const draftAttempts = new Set();
  const statements = [];
  const rows = (keys) => ({ columnMetadata: [{ name: 'idempotency_key' }], records: keys.map((key) => [{ stringValue: key }]) });
  const param = (parameters, name) => parameters.find((p) => p.name === name)?.value.stringValue;
  async function executeStatement(sql, parameters = []) {
    if (/FROM jumpyard\.kiosk_installations/.test(sql)) return { columnMetadata: [], records: [] };
    const attemptId = param(parameters, 'attemptId');
    if (/INSERT INTO jumpyard\.idempotency_records AS existing/.test(sql)) {
      statements.push({ kind: 'reserve', attemptId });
      const claimed = [];
      for (const key of JSON.parse(param(parameters, 'keys'))) {
        const existing = claims.get(key);
        if (!existing || existing.status === 'released') {
          claims.set(key, { status: 'started', resultRef: attemptId });
          claimed.push(key);
        }
      }
      return rows(claimed);
    }
    if (/UPDATE jumpyard\.idempotency_records/.test(sql) && /NOT EXISTS/.test(sql)) {
      assert.match(sql, /claim\.operation = 'kiosk_terminal_binding'/);
      assert.match(sql, /claim\.status = 'started'/);
      assert.match(sql, /draft\.payment_attempt_id = :attemptId/);
      statements.push({ kind: 'release', attemptId });
      const released = [];
      if (!draftAttempts.has(attemptId)) {
        for (const [key, claim] of claims) {
          if (claim.status === 'started' && claim.resultRef === attemptId) {
            claims.set(key, { status: 'released', resultRef: null });
            released.push(key);
          }
        }
      }
      return rows(released);
    }
    if (/UPDATE jumpyard\.idempotency_records/.test(sql)) {
      statements.push({ kind: 'partial_release', attemptId });
      for (const [key, claim] of claims) if (claim.resultRef === attemptId) claims.set(key, { status: 'released', resultRef: null });
      return rows([]);
    }
    throw new Error(`Unexpected SQL during GH-570 validation: ${sql.slice(0, 80)}`);
  }
  return { claims, draftAttempts, executeStatement, statements };
}

// ROLLER's draft endpoint as a script of answers. `created_500` creates the draft and still answers 500;
// with `dedupe` ROLLER answers a repeated externalId with the draft it already holds.
function fakeRoller(script, { clock, dedupe = false, rollerMs = 0 } = {}) {
  const drafts = new Map();
  const calls = [];
  const answers = [...script];
  async function postRollerJson(_config, _token, endpoint, payload, options = {}) {
    if (endpoint === '/bookings/draft/costs') return { ok: true, status: 200, body: { costs: COSTS, currency: 'SEK' } };
    if (endpoint !== '/bookings/draft') throw new Error(`Unexpected ROLLER write ${endpoint}`);
    calls.push({ payload: plain(payload), timeoutMs: options.timeoutMs ?? null });
    if (clock) clock.now += typeof rollerMs === 'function' ? rollerMs(calls.length) : rollerMs;
    const answer = answers.shift();
    if (answer === undefined) throw new Error('ROLLER was called more often than the test allows');
    const held = drafts.get(payload.externalId);
    if (dedupe && held) return { ok: true, status: 200, body: held };
    if (answer === 'network') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    if (answer === 'timeout') throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    if (typeof answer === 'number') return { ok: false, status: answer, body: { error: `synthetic ${answer}` } };
    const draft = { uniqueId: `roller-draft-${drafts.size + 1}`, costs: COSTS, currency: 'SEK', paymentJwt: JWT };
    drafts.set(payload.externalId, draft);
    if (answer === 'created_500') return { ok: false, status: 500, body: { error: 'synthetic 500 after create' } };
    return { ok: true, status: 201, body: draft };
  }
  return { calls, drafts, postRollerJson };
}

function load(overrides, { clock, logs, fetchImpl = null }) {
  const module = { exports: {} };
  const aws = new Proxy({}, {
    get: () => class {
      constructor(input) { this.input = input; }
      async send() { throw new Error('No AWS calls allowed in GH-570 tests'); }
    },
  });
  const record = (level) => (line) => logs.push({ level, line: String(line) });
  class ClockDate extends Date { static now() { return clock.now; } }
  const sandbox = {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout, crypto, module, overrides,
    Date: ClockDate,
    console: { log: record('log'), warn: record('warn'), info: record('info'), error: record('error') },
    exports: module.exports,
    fetch: fetchImpl ?? (async () => { throw new Error('No network allowed in GH-570 tests'); }),
    process: { env: {} },
    require(name) {
      if (name === 'crypto' || name === 'node:crypto') return crypto;
      if (name.startsWith('@aws-sdk/')) return aws;
      if (name === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (name.startsWith('./')) return require(path.join(path.dirname(bookingPath), name));
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(
    `${source}\n${assignments}\nmodule.exports.__gh570 = { handleDraft, handleAddProductDraft, postRollerJson, ` +
      `ROLLER_DRAFT_RETRY_PAUSE_MS, ROLLER_DRAFT_RETRY_LATEST_START_MS, ROLLER_DRAFT_DEADLINE_MS };`,
    sandbox,
    { filename: bookingPath },
  );
  return module.exports.__gh570;
}

function fixture(script, { channel = 'kiosk', dedupe = false, rollerMs = 0, store = claimStore(), extra = {} } = {}) {
  const clock = { now: Date.parse('2026-10-19T11:30:00Z') };
  const logs = [];
  const roller = fakeRoller(script, { clock, dedupe, rollerMs });
  const events = [];
  const idempotency = [];
  const pauses = [];
  const saved = [];
  const backend = load({
    getRollerConfig: async () => configuration(),
    getRollerAccessToken: async () => ({ accessToken: 'synthetic', tokenType: 'Bearer' }),
    reserveIdempotencyKey: async () => ({ ok: true }),
    completeIdempotencyKey: async (key, status, ref) => { idempotency.push({ status, ref }); },
    isNewBookingDraftWriteEnabled: () => true,
    isAddProductDraftWriteEnabled: () => true,
    validateT0176FullFlowRequestItemDates: () => ({ ok: true }),
    validateT0162AddOnSmokeAccess: () => ({ ok: true }),
    validateT0176FullFlowOriginalBookingAccess: () => ({ ok: true }),
    verifyGuestAccessForBooking: async () => ({ ok: true }),
    getBookingReferenceFromPath: () => 'original-570',
    resolveOriginalBookingContext: async () => ({
      ok: true, venueId: '50871', bookingReference: 'original-570', rollerUniqueId: 'original-id', rollerCustomerId: 'guest-570',
    }),
    getRollerJson: async (_config, _token, endpoint) => {
      if (endpoint === '/guests/guest-570') return { ok: true, status: 200, body: { ...CUSTOMER } };
      throw new Error(`Unexpected ROLLER read ${endpoint}`);
    },
    executeStatement: store.executeStatement,
    postRollerJson: roller.postRollerJson,
    wait: async (ms) => { pauses.push(ms); clock.now += ms; },
    capturePhoneEmailMarketing: async () => {},
    captureSafetyAttestation: async () => {},
    getVenuePaymentConfig: async () => ({ available: true, apiUrl: 'https://example.invalid' }),
    persistPrepaymentDraft: async ({ request, draft }) => {
      if (request.reservedPaymentAttemptId) store.draftAttempts.add(request.reservedPaymentAttemptId);
      saved.push({ attemptId: request.reservedPaymentAttemptId ?? null, uniqueId: draft.uniqueId });
      return { paymentAttemptId: request.reservedPaymentAttemptId ?? null, prepaymentDraftId: `jypd_570_${saved.length}` };
    },
    persistAddOnBookingLink: async () => ({}),
    writeBookingEventLog: async (entry) => { events.push(plain(entry)); },
    ...extra,
  }, { clock, logs });
  const body = {
    confirmDraft: true, idempotencyKey: `gh570-${crypto.randomUUID()}`, customer: { ...CUSTOMER }, items: ITEMS,
    ...(channel === 'kiosk' ? { channel: 'kiosk', kioskInstallationId: installationId, kioskCapability: capability, kioskProfileId: profile } : {}),
  };
  return { backend, body, clock, events, idempotency, logs, pauses, roller, saved, store };
}

const parse = (response) => JSON.parse(response.body);
const warnings = (logs, event) => logs.filter((entry) => entry.level === 'warn')
  .map((entry) => JSON.parse(entry.line)).filter((line) => line.event === event);

for (const method of ['handleDraft', 'handleAddProductDraft']) {
  const failedEvent = method === 'handleDraft' ? 'booking.draft_failed' : 'booking.add_product_draft_failed';
  const succeededEvent = method === 'handleDraft' ? 'booking.draft_succeeded' : 'booking.add_product_draft_succeeded';
  const failedCode = method === 'handleDraft' ? 'roller_draft_failed' : 'roller_add_product_draft_failed';

  test(`${method}: a first 500 then success gives one draft after one 1 s pause, with the same payload`, async () => {
    const f = fixture([500, 'created'], { rollerMs: 6_000 });
    const response = await f.backend[method]({}, f.body, 'gh570-corr');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(f.roller.calls.length, 2);
    assert.deepEqual(f.roller.calls[1].payload, f.roller.calls[0].payload, 'the retry resends the same externalId');
    assert.deepEqual(f.pauses, [1_000]);
    assert.equal(f.roller.drafts.size, 1);
    assert.equal(f.saved.length, 1);
    assert.equal(parse(response).draft.uniqueId, 'roller-draft-1');
    const succeeded = f.events.find((entry) => entry.eventType === succeededEvent);
    assert.deepEqual(succeeded.payload.rollerDraftAttempts.map((a) => a.status), [500, 201]);
    assert.deepEqual(f.idempotency.map((entry) => entry.status), ['succeeded']);
    // The claims now belong to the persisted draft (D0220): nothing releases them.
    assert.deepEqual(f.store.statements.map((s) => s.kind), ['reserve']);
    assert.ok([...f.store.claims.values()].every((claim) => claim.status === 'started'));
    const [line] = warnings(f.logs, 'roller_draft_attempt_failed');
    assert.equal(line.next, 'retry');
    assert.equal(line.externalId, f.roller.calls[0].payload.externalId);
  });

  test(`${method}: two 500s give today's error and release the kiosk's claims`, async () => {
    const f = fixture([500, 500], { rollerMs: 6_000 });
    const response = await f.backend[method]({}, f.body, 'gh570-corr');
    assert.equal(response.statusCode, 502);
    assert.equal(parse(response).status, 'roller_error');
    assert.equal(parse(response).error.code, failedCode);
    assert.equal(f.roller.calls.length, 2);
    assert.deepEqual(f.pauses, [1_000]);
    assert.deepEqual(f.idempotency, [{ status: 'failed', ref: 'roller_http_500' }]);
    const failed = f.events.find((entry) => entry.eventType === failedEvent);
    assert.deepEqual(failed.payload.rollerDraftAttempts.map((a) => a.status), [500, 500]);
    assert.deepEqual(f.store.statements.map((s) => s.kind), ['reserve', 'release']);
    assert.equal(f.store.statements[1].attemptId, f.store.statements[0].attemptId);
    assert.ok([...f.store.claims.values()].every((claim) => claim.status === 'released'));
    assert.deepEqual(warnings(f.logs, 'roller_draft_attempt_failed').map((line) => line.next), ['retry', 'stop']);
    assert.deepEqual(warnings(f.logs, 'kiosk_claims_released').map((line) => line.releasedCount), [2]);
  });

  for (const status of [400, 404, 409, 422, 429]) {
    test(`${method}: a ROLLER ${status} is not retried and releases the claims`, async () => {
      const f = fixture([status]);
      const response = await f.backend[method]({}, f.body, 'gh570-corr');
      assert.equal(response.statusCode, status === 409 ? 409 : 502);
      assert.equal(f.roller.calls.length, 1);
      assert.deepEqual(f.pauses, []);
      assert.deepEqual(warnings(f.logs, 'roller_draft_attempt_failed'), []);
      assert.deepEqual(f.store.statements.map((s) => s.kind), ['reserve', 'release']);
      assert.ok([...f.store.claims.values()].every((claim) => claim.status === 'released'));
    });
  }

  test(`${method}: a draft ROLLER created despite its 500 is reused, not duplicated`, async () => {
    const f = fixture(['created_500', 'created'], { dedupe: true });
    const response = await f.backend[method]({}, f.body, 'gh570-corr');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(f.roller.drafts.size, 1, 'ROLLER holds one draft');
    assert.equal(parse(response).draft.uniqueId, 'roller-draft-1');
    assert.equal(f.roller.calls[1].payload.externalId, f.roller.calls[0].payload.externalId);
    assert.deepEqual(f.saved.map((row) => row.uniqueId), ['roller-draft-1']);
  });

  test(`${method}: a lost connection is retried; two lost connections throw as before and release the claims`, async () => {
    const retried = fixture(['network', 'created']);
    assert.equal((await retried.backend[method]({}, retried.body, 'gh570-corr')).statusCode, 201);
    assert.equal(retried.roller.calls.length, 2);
    assert.equal(warnings(retried.logs, 'roller_draft_attempt_failed')[0].attempts[0].failure, 'TypeError');

    const lost = fixture(['network', 'timeout']);
    await assert.rejects(lost.backend[method]({}, lost.body, 'gh570-corr'), /aborted due to timeout/);
    assert.equal(lost.roller.calls.length, 2);
    assert.deepEqual(lost.store.statements.map((s) => s.kind), ['reserve', 'release']);
    assert.ok([...lost.store.claims.values()].every((claim) => claim.status === 'released'));
    assert.deepEqual(warnings(lost.logs, 'roller_draft_attempt_failed').at(-1).attempts.map((a) => a.failure),
      ['TypeError', 'TimeoutError']);
  });

  test(`${method}: a 500 that came after 12 s is not retried, and every try stops 25 s after the request began`, async () => {
    const late = fixture([500], { rollerMs: 11_500 });
    assert.equal((await late.backend[method]({}, late.body, 'gh570-corr')).statusCode, 502);
    assert.equal(late.roller.calls.length, 1, 'a second try could pass the API Gateway limit');
    assert.deepEqual(late.pauses, []);
    assert.equal(warnings(late.logs, 'roller_draft_attempt_failed')[0].next, 'stop');
    assert.equal(late.roller.calls[0].timeoutMs, 25_000);

    const early = fixture([500, 'created'], { rollerMs: (call) => (call === 1 ? 7_000 : 1_500) });
    assert.equal((await early.backend[method]({}, early.body, 'gh570-corr')).statusCode, 201);
    assert.deepEqual(early.roller.calls.map((call) => call.timeoutMs), [25_000, 17_000]);
  });

  test(`${method}: an error after the draft but before its row releases the claims; after the row it keeps them`, async () => {
    const before = fixture(['created'], { extra: { getVenuePaymentConfig: async () => { throw new Error('synthetic venue read'); } } });
    await assert.rejects(before.backend[method]({}, before.body, 'gh570-corr'), /synthetic venue read/);
    assert.deepEqual(before.store.statements.map((s) => s.kind), ['reserve', 'release']);
    assert.ok([...before.store.claims.values()].every((claim) => claim.status === 'released'));

    const after = fixture(['created'], {
      extra: { writeBookingEventLog: async () => { throw new Error('synthetic audit write'); } },
    });
    await assert.rejects(after.backend[method]({}, after.body, 'gh570-corr'), /synthetic audit write/);
    assert.deepEqual(after.store.statements.map((s) => s.kind), ['reserve', 'release']);
    assert.ok([...after.store.claims.values()].every((claim) => claim.status === 'started'), 'D0220 keeps a drafted attempt');
    assert.deepEqual(warnings(after.logs, 'kiosk_claims_released').map((line) => line.releasedCount), [0]);
  });

  test(`${method}: the phone gets the same retry and has no claims to release`, async () => {
    const f = fixture([503, 'created'], { channel: 'phone' });
    assert.equal((await f.backend[method]({}, f.body, 'gh570-corr')).statusCode, 201);
    assert.equal(f.roller.calls.length, 2);
    assert.deepEqual(f.store.statements, []);
  });
}

test('K1 after two ROLLER 500s takes the next purchase instead of answering kiosk_payment_busy', async () => {
  const store = claimStore();
  const failing = fixture([500, 500], { store });
  assert.equal((await failing.backend.handleDraft({}, failing.body, 'gh570-k1-first')).statusCode, 502);
  const next = fixture(['created'], { store });
  const response = await next.backend.handleDraft({}, next.body, 'gh570-k1-next');
  assert.equal(response.statusCode, 201, response.body);
  assert.notEqual(parse(response).error?.code, 'kiosk_payment_busy');
  // A drafted attempt still holds the kiosk until a D0220 outcome, exactly as before.
  const blocked = fixture(['created'], { store });
  const busy = await blocked.backend.handleDraft({}, blocked.body, 'gh570-k1-busy');
  assert.equal(busy.statusCode, 409);
  assert.equal(parse(busy).error.code, 'kiosk_payment_busy');
  assert.equal(blocked.roller.calls.length, 0);
});

test('Only the draft call gets a deadline; other ROLLER writes keep waiting as before', async () => {
  const seen = [];
  const fetchImpl = async (_url, init) => { seen.push(init); return { ok: true, status: 201, text: async () => '{}' }; };
  const backend = load({}, { clock: { now: Date.now() }, logs: [], fetchImpl });
  const config = { baseUrl: 'https://api.roller.app' };
  const token = { accessToken: 'synthetic', tokenType: 'Bearer' };
  await backend.postRollerJson(config, token, '/bookings/draft', { externalId: 'JY-D-570' }, { timeoutMs: 25_000 });
  await backend.postRollerJson(config, token, '/bookings/draft/publish', { uniqueId: 'roller-draft-570' });
  assert.ok(seen[0].signal instanceof AbortSignal, 'the draft call carries the deadline');
  assert.equal(seen[1].signal, undefined, 'a publish keeps waiting as before');
  assert.equal(backend.ROLLER_DRAFT_RETRY_PAUSE_MS, 1_000);
  assert.equal(backend.ROLLER_DRAFT_RETRY_LATEST_START_MS, 12_000);
  assert.equal(backend.ROLLER_DRAFT_DEADLINE_MS, 25_000);
});
