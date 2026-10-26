'use strict';

// GH-596 (D0288): on 2026-10-26 ROLLER's POST /bookings/draft/costs refused one email-first kiosk purchase
// seven times at Pay (11:16-11:17) with 409 "A valid booking owner email is required", and Cloud kept no
// reason. The kiosk cost check now keeps ROLLER's reason without guest values, in one codes-only log line,
// the event log and the answer, and a refused email becomes the guest's invalid_email.
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
const capability = 'H'.repeat(43); // Synthetic fixture, never a provisioned credential.
const installationId = `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}`;
// The typed contact of an email-first kiosk purchase and its D0234 placeholders. Its address passes Cloud's
// format, so a refusal stands for a ROLLER rule Cloud does not know yet.
const TYPED = { firstName: 'Annie', email: 'annie.gh596@example.invalid' };
// The Nacka typo's kind: a dot just before the @.
const NACKA_TYPO = 'annie.gh596.@example.invalid';
const RESOLVED = { ...TYPED, lastName: 'Gäst', phone: '0700000000' };
// The booking's ROLLER guest for an add-on (D0260).
const GUEST = { firstName: 'Bertil', lastName: 'Testsson', email: 'bertil.gh596@example.invalid', phone: '0701740696' };
const PRIVATE_VALUES = ['Annie', 'annie.gh596', 'Bertil', 'Testsson', 'bertil.gh596', '0701740696', '701740696'];
const ITEMS = [{ productId: 101, quantity: 1, bookingDate: '2026-10-26', startTime: '12:30' }];
const EMAIL_REFUSAL = { errors: [{ message: 'A valid booking owner email is required' }] };
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
      k1: { terminalId: 'synthetic-terminal-k1', lockId: `kt_${'5'.repeat(32)}` },
    }),
  };
}

function load(overrides, logs) {
  const module = { exports: {} };
  const aws = new Proxy({}, {
    get: () => class {
      constructor(input) { this.input = input; }
      async send() { throw new Error('No AWS calls allowed in GH-596 tests'); }
    },
  });
  const record = (level) => (line) => logs.push({ level, line: String(line) });
  const sandbox = {
    AbortSignal, Buffer, Date, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout, crypto, module, overrides,
    console: { log: record('log'), warn: record('warn'), info: record('info'), error: record('error') },
    exports: module.exports,
    fetch: async () => { throw new Error('No network allowed in GH-596 tests'); },
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
    `${source}\n${assignments}\nmodule.exports.__gh596 = { handleDraft, handleAddProductDraft };`,
    sandbox,
    { filename: bookingPath },
  );
  return module.exports.__gh596;
}

// ROLLER answers the kiosk cost check with `costs`; a draft call would be a test failure.
function fixture(costs, { customer = TYPED } = {}) {
  const logs = [];
  const events = [];
  const idempotency = [];
  const rollerPosts = [];
  const statements = [];
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
    getBookingReferenceFromPath: () => 'original-596',
    resolveOriginalBookingContext: async () => ({
      ok: true, venueId: '50871', bookingReference: 'original-596', rollerUniqueId: 'original-id', rollerCustomerId: 'guest-596',
    }),
    getRollerJson: async (_config, _token, endpoint) => {
      if (endpoint === '/guests/guest-596') return { ok: true, status: 200, body: { ...GUEST } };
      throw new Error(`Unexpected ROLLER read ${endpoint}`);
    },
    // D0234: the email was not found, so the typed first name and email travel with the placeholders.
    resolveDraftContact: async (request) => ({ ok: true, mode: 'email_first', outcome: 'not_found', customer: { ...request.customer, ...RESOLVED } }),
    executeStatement: async (sql) => {
      statements.push(sql);
      if (/FROM jumpyard\.kiosk_installations/.test(sql)) return { columnMetadata: [], records: [] };
      throw new Error(`Unexpected SQL during GH-596 validation: ${sql.slice(0, 80)}`);
    },
    postRollerJson: async (_config, _token, endpoint, payload) => {
      rollerPosts.push({ endpoint, payload: plain(payload) });
      if (endpoint === '/bookings/draft/costs') return costs;
      throw new Error(`Unexpected ROLLER write ${endpoint}`);
    },
    writeBookingEventLog: async (entry) => { events.push(plain(entry)); },
  }, logs);
  const body = {
    confirmDraft: true, idempotencyKey: `gh596-${crypto.randomUUID()}`, customer: { ...customer }, items: ITEMS, sendConfirmations: true,
    channel: 'kiosk', kioskInstallationId: installationId, kioskCapability: capability, kioskProfileId: profile,
  };
  return { backend, body, events, idempotency, logs, rollerPosts, statements };
}

const parse = (response) => JSON.parse(response.body);
const refusalLines = (logs, eventType) => logs.filter((entry) => entry.level === 'warn')
  .map((entry) => JSON.parse(entry.line)).filter((line) => line.eventType === eventType);

function assertNoPrivateValues(label, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of PRIVATE_VALUES) assert.ok(!text.includes(secret), `${label} must not contain ${secret}`);
}

test('the Nacka typo is refused before Pay reaches ROLLER: 400 invalid_email, no lookup, reservation or ROLLER call', async () => {
  const f = fixture({ ok: true, status: 200, body: { costs: { total: 239, amountOwing: 239 } } }, { customer: { ...TYPED, email: NACKA_TYPO } });
  const response = await f.backend.handleDraft({}, f.body, 'gh596-corr');
  assert.equal(response.statusCode, 400);
  assert.deepEqual(parse(response).error, { code: 'invalid_email', message: 'customer.email must be a valid email address.' });
  assert.deepEqual(f.rollerPosts, []);
  assert.deepEqual(f.idempotency, []);
  assert.deepEqual(f.statements, []);
});

test('a ROLLER refusal of the email: invalid_email for the guest, ROLLER\'s reason kept, no draft and no kiosk claim', async () => {
  const f = fixture({ ok: false, status: 409, body: EMAIL_REFUSAL });
  const response = await f.backend.handleDraft({}, f.body, 'gh596-corr');
  assert.equal(response.statusCode, 409);
  assert.deepEqual(parse(response), {
    correlationId: 'gh596-corr',
    status: 'rejected',
    error: { code: 'invalid_email', message: 'customer.email must be a valid email address.' },
    roller: { statusCode: 409, error: {
      code: null, message: null, reason: 'booking_owner_email_invalid',
      errors: [{ code: null, message: 'A valid booking owner email is required', name: null, reason: 'booking_owner_email_invalid' }],
    } },
  });
  // The cost check carried the resolved customer and the confirmation flag, as at Nacka.
  assert.deepEqual(f.rollerPosts.map((post) => post.endpoint), ['/bookings/draft/costs']);
  assert.deepEqual(f.rollerPosts[0].payload.customer, RESOLVED);
  assert.equal(f.rollerPosts[0].payload.sendConfirmations, true);
  assert.deepEqual(f.idempotency, [{ status: 'failed', ref: 'roller_quote_http_409' }], 'the monitor\'s idempotency reference is unchanged');
  assert.ok(f.statements.every((sql) => !/kiosk_terminal_binding|idempotency_records/.test(sql)), 'no D0220 claim was reserved');
  const [event] = f.events;
  assert.equal(f.events.length, 1);
  assert.equal(event.eventType, 'booking.kiosk_quote_failed');
  assert.deepEqual(event.payload, {
    endpoint: 'POST /bookings/draft/costs',
    itemCount: 1,
    rollerErrors: [{ code: null, message: 'A valid booking owner email is required', name: null, reason: 'booking_owner_email_invalid' }],
    rollerReason: 'booking_owner_email_invalid',
    rollerStatus: 409,
  });
  assert.equal(event.summary, 'ROLLER kiosk quote failed with HTTP 409: booking_owner_email_invalid.');
  assert.deepEqual(refusalLines(f.logs, 'booking.kiosk_quote_failed'), [{
    eventType: 'booking.kiosk_quote_failed', handler: 'booking', providerStatusCode: 409,
    reason: 'booking_owner_email_invalid', reasons: { booking_owner_email_invalid: 1 },
  }]);
  assertNoPrivateValues('answer', response.body);
  assertNoPrivateValues('event log', f.events);
  assertNoPrivateValues('logs', f.logs.map((entry) => entry.line));
});

test('a ROLLER message that repeats the contact keeps its words but no guest value', async () => {
  const f = fixture({ ok: false, status: 409, body: {
    message: 'Booking owner Annie Gäst (annie.gh596@example.invalid, 070-000 00 00) is invalid',
    errors: [{ name: 'Customer', message: 'A valid booking owner email is required: annie.gh596@example.invalid' }],
  } });
  const body = parse(await f.backend.handleDraft({}, f.body, 'gh596-corr'));
  assert.equal(body.error.code, 'invalid_email');
  assert.equal(body.roller.error.message, 'Booking owner [guest] [guest] ([guest], [guest]) is invalid');
  assert.equal(body.roller.error.errors[0].message, 'A valid booking owner email is required: [guest]');
  assertNoPrivateValues('answer', body);
  assertNoPrivateValues('event log', f.events);
});

test('any other refusal keeps roller_kiosk_quote_failed with its reason; a ROLLER error stays 502', async () => {
  const capacity = fixture({ ok: false, status: 409, body: { errors: [{ name: 'VenueCapacity', message: 'Venue capacity will be exceeded' }] } });
  const capacityBody = parse(await capacity.backend.handleDraft({}, capacity.body, 'gh596-corr'));
  assert.equal(capacityBody.status, 'rejected');
  assert.equal(capacityBody.error.code, 'roller_kiosk_quote_failed');
  assert.equal(capacityBody.roller.error.reason, 'capacity_exceeded');
  assert.equal(capacity.events[0].payload.rollerReason, 'capacity_exceeded');

  const unknown = fixture({ ok: false, status: 409, body: { errors: [{ message: 'Something new' }] } });
  assert.equal(parse(await unknown.backend.handleDraft({}, unknown.body, 'gh596-corr')).roller.error.reason, 'other');

  const outage = fixture({ ok: false, status: 503, body: null });
  const response = await outage.backend.handleDraft({}, outage.body, 'gh596-corr');
  assert.equal(response.statusCode, 502);
  assert.equal(parse(response).status, 'roller_error');
  assert.equal(parse(response).error.code, 'roller_kiosk_quote_failed');
  assert.equal(parse(response).roller.error.reason, 'unknown');
  assert.deepEqual(outage.idempotency, [{ status: 'failed', ref: 'roller_quote_http_503' }]);
  // Even a 503 naming the email is no guest typo.
  const odd = fixture({ ok: false, status: 503, body: EMAIL_REFUSAL });
  assert.equal(parse(await odd.backend.handleDraft({}, odd.body, 'gh596-corr')).error.code, 'roller_kiosk_quote_failed');
});

test('an add-on keeps its code, since the email is the booking\'s ROLLER guest, and still logs ROLLER\'s reason', async () => {
  const f = fixture({ ok: false, status: 409, body: {
    errors: [{ message: 'A valid booking owner email is required for Bertil Testsson, 0701740696' }],
  } });
  const response = await f.backend.handleAddProductDraft({}, f.body, 'gh596-corr');
  assert.equal(response.statusCode, 409);
  const body = parse(response);
  assert.equal(body.error.code, 'roller_kiosk_add_product_quote_failed');
  assert.equal(body.roller.error.reason, 'booking_owner_email_invalid');
  assert.equal(body.roller.error.errors[0].message, 'A valid booking owner email is required for [guest] [guest], [guest]');
  assert.deepEqual(f.rollerPosts[0].payload.customer, GUEST, 'D0260: the ROLLER guest is priced unchanged');
  assert.deepEqual(f.idempotency, [{ status: 'failed', ref: 'roller_quote_http_409' }]);
  const [event] = f.events;
  assert.equal(event.eventType, 'booking.kiosk_add_product_quote_failed');
  assert.equal(event.subjectRef, 'original-596');
  assert.equal(event.payload.originalBookingReference, 'original-596');
  assert.equal(event.payload.rollerReason, 'booking_owner_email_invalid');
  assert.deepEqual(refusalLines(f.logs, 'booking.kiosk_add_product_quote_failed').map((line) => line.reasons),
    [{ booking_owner_email_invalid: 1 }]);
  assertNoPrivateValues('answer', response.body);
  assertNoPrivateValues('event log', f.events);
  assertNoPrivateValues('logs', f.logs.map((entry) => entry.line));
});
