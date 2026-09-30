'use strict';

// GH-473/D0234: email-first contact resolution. Synthetic data only: example.invalid addresses,
// PTS fiction numbers (070-174 06 05..99), documentation IPs and invented names/addresses.
// No Klaviyo, ROLLER, AWS or database call leaves this process.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const lookup = require('./contact-lookup');

const EMAIL = 'Annie.Testsson+jy473@example.invalid';
const LOOKUP_EMAIL = EMAIL.toLowerCase();
const KEY = 'pk_synthetic473_fixture_0000000000';
const SECRET_ARN = 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:/synthetic/klaviyo/profiles-read';
const EXPECTED_URL = 'https://a.klaviyo.com/api/profiles?filter=equals(email%2C%22annie.testsson%2Bjy473%40example.invalid%22)' +
  '&fields[profile]=email,first_name,last_name,phone_number,location';
const FULL_PROFILE = {
  first_name: 'Anna',
  last_name: 'Testsson',
  phone_number: '+46701740605',
  location: {
    address1: 'Fiktiva gatan 1', address2: 'Uppgång B', city: 'Fiktivstad', country: 'Sweden', region: 'Fiktiv region',
    zip: '999 99', ip: '192.0.2.1', latitude: 1.5, longitude: 2.5, timezone: 'Europe/Stockholm',
  },
};
// Every value that must never reach a response, a log line or an event payload.
const PRIVATE_VALUES = ['Testsson', '0701740605', '+46701740605', '701740605', 'Fiktiva gatan', 'Fiktivstad',
  '999 99', 'Uppgång', 'Fiktiv region', '192.0.2.1', 'Sweden', KEY, EMAIL, LOOKUP_EMAIL];
const typedCustomer = { acceptMarketing: false, acceptMarketingSms: false, email: EMAIL, firstName: 'Annie', lastName: null, phone: null };
const plain = (value) => JSON.parse(JSON.stringify(value));

function profilesBody(profiles, next = null) {
  return {
    data: profiles.map((attributes, index) => ({
      type: 'profile', id: `01SYNTHETIC${index}`, attributes: { email: LOOKUP_EMAIL, ...attributes },
    })),
    links: { self: 'https://a.klaviyo.com/api/profiles', next },
  };
}

function httpResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, body: { cancel: async () => {} } };
}

function recordingFetch(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return typeof answer === 'function' ? answer(url, init) : answer;
  };
  return { calls, fetchImpl };
}

function keyProvider(secretValue, counters = { reads: 0 }, now = Date.now) {
  return lookup.createApiKeyProvider({
    secretId: SECRET_ARN,
    now,
    readSecretString: async (secretId) => {
      assert.equal(secretId, SECRET_ARN);
      counters.reads += 1;
      if (secretValue instanceof Error) throw secretValue;
      return secretValue;
    },
  });
}

function awsError(name) {
  const error = new Error(`synthetic ${name}`);
  error.name = name;
  return error;
}

async function resolveWith(answer, { secret = KEY, enabled = true, timeoutMs = 1500, customer = typedCustomer } = {}) {
  const fetch = recordingFetch(answer);
  const counters = { reads: 0 };
  const result = await lookup.resolveEmailFirstCustomer(customer, {
    enabled, timeoutMs, apiKeys: keyProvider(secret, counters), fetchImpl: fetch.fetchImpl,
  });
  return { result: plain(result), calls: fetch.calls, reads: counters.reads };
}

// Mode, URL, key and phone rules.

test('only a first name plus email is email-first; every other shape keeps the four-field contract', () => {
  assert.equal(lookup.draftContactMode({ firstName: 'Annie', email: EMAIL }), 'email_first');
  assert.equal(lookup.draftContactMode({ firstName: 'Annie', email: EMAIL, lastName: ' ', phone: '' }), 'email_first');
  for (const customer of [
    { firstName: 'Annie', email: EMAIL, lastName: 'Testsson', phone: '0701740606' },
    { firstName: 'Annie', email: EMAIL, lastName: 'Testsson' },
    { firstName: 'Annie', email: EMAIL, phone: '0701740606' },
    { email: EMAIL },
    { firstName: 'Annie' },
    {},
    null,
  ]) {
    assert.equal(lookup.draftContactMode(customer), 'full', JSON.stringify(customer));
  }
});

test('the exact-email request asks only for the approved profile fields', () => {
  assert.equal(lookup.buildProfileLookupUrl(LOOKUP_EMAIL), EXPECTED_URL);
  const url = new URL(EXPECTED_URL);
  assert.equal(url.origin, 'https://a.klaviyo.com');
  assert.equal(url.pathname, '/api/profiles');
  assert.equal(url.searchParams.get('filter'), `equals(email,"${LOOKUP_EMAIL}")`);
  assert.equal(url.searchParams.get('fields[profile]'), 'email,first_name,last_name,phone_number,location');
  assert.deepEqual([...url.searchParams.keys()], ['filter', 'fields[profile]']);
});

test('the key is the plain Profiles:Read key or {"apiKey": ...}; anything else is unusable', () => {
  assert.equal(lookup.parseApiKey(KEY), KEY);
  assert.equal(lookup.parseApiKey(`  ${KEY}\n`), KEY);
  assert.equal(lookup.parseApiKey(JSON.stringify({ apiKey: KEY })), KEY);
  for (const value of [null, '', '   ', 'SET_IN_AWS_ONLY', 'pk_', 'sk_synthetic473_fixture', `${KEY} extra`, '{"apiKey":1}',
    '{"key":"pk_synthetic473_fixture_0000000000"}', '{not json', '[]']) {
    assert.equal(lookup.parseApiKey(value), null, String(value));
  }
});

test('Klaviyo E.164 phones return to the national Swedish form; other countries keep E.164', () => {
  assert.equal(lookup.rollerPhone('+46701740605'), '0701740605');
  assert.equal(lookup.rollerPhone('+46 70 174 06 06'), '0701740606');
  assert.equal(lookup.rollerPhone('+460701740607'), '0701740607');
  assert.equal(lookup.rollerPhone('+46700000000'), '0700000000');
  assert.equal(lookup.rollerPhone('+4799999999'), '+4799999999');
  for (const value of ['0701740605', '46701740605', '+46', 'phone', '+0701740605', '']) {
    assert.equal(lookup.rollerPhone(value), null, value);
  }
});

// Outcomes.

test('found (complete): Klaviyo name, national phone and only the mapped address fields', async () => {
  const { result, calls, reads } = await resolveWith(httpResponse(profilesBody([FULL_PROFILE])));
  assert.equal(reads, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, EXPECTED_URL);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(plain(calls[0].init.headers), {
    accept: 'application/vnd.api+json', authorization: `Klaviyo-API-Key ${KEY}`, revision: '2026-07-15',
  });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'found');
  assert.equal(typeof result.latencyMs, 'number');
  assert.deepEqual(result.customer, {
    ...typedCustomer,
    firstName: 'Anna',
    lastName: 'Testsson',
    phone: '0701740605',
    address: { postcode: '999 99' },
  });
});

test('found (partial): only a missing field gets its placeholder; no location means no address', async () => {
  const cases = [
    [{ first_name: 'Anna', phone_number: '+46701740605' }, { firstName: 'Anna', lastName: 'Gäst', phone: '0701740605' }],
    [{ first_name: 'Anna', last_name: 'Testsson' }, { firstName: 'Anna', lastName: 'Testsson', phone: '0700000000' }],
    [{ last_name: 'Testsson', phone_number: '+46701740605', location: null },
      { firstName: 'Annie', lastName: 'Testsson', phone: '0701740605' }],
    [{ first_name: '  ', last_name: null, phone_number: null, location: { zip: null, city: '' } },
      { firstName: 'Annie', lastName: 'Gäst', phone: '0700000000' }],
    [{ first_name: 'Anna', last_name: 'Testsson', phone_number: '+46701740605', location: { zip: '999 99', ip: '192.0.2.1' } },
      { firstName: 'Anna', lastName: 'Testsson', phone: '0701740605', address: { postcode: '999 99' } }],
    [{}, { firstName: 'Annie', lastName: 'Gäst', phone: '0700000000' }],
  ];
  for (const [profile, expected] of cases) {
    const { result } = await resolveWith(httpResponse(profilesBody([profile])));
    assert.equal(result.outcome, 'found', JSON.stringify(profile));
    assert.deepEqual(result.customer, { ...typedCustomer, ...expected }, JSON.stringify(profile));
  }
});

test('not found: typed first name, last name Gäst, placeholder phone and no address', async () => {
  const { result, calls } = await resolveWith(httpResponse(profilesBody([])));
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'not_found');
  assert.deepEqual(result.customer, { ...typedCustomer, lastName: 'Gäst', phone: '0700000000' });
});

test('several profiles are uncertain, including a further result page', async () => {
  for (const body of [profilesBody([FULL_PROFILE, FULL_PROFILE]), profilesBody([FULL_PROFILE], 'https://a.klaviyo.com/api/profiles?page[cursor]=x')]) {
    const { result } = await resolveWith(httpResponse(body));
    assert.deepEqual(result, { ok: false, outcome: 'uncertain', reason: 'multiple', latencyMs: result.latencyMs });
    assert.equal(result.customer, undefined);
  }
});

test('HTTP errors are uncertain and a rejected key is read again', async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
    const { result } = await resolveWith(httpResponse({ errors: [{ detail: 'synthetic' }] }, status));
    assert.equal(result.ok, false);
    assert.equal(result.reason, `http_${status}`);
  }
  const counters = { reads: 0 };
  const apiKeys = keyProvider(KEY, counters);
  const unauthorized = recordingFetch(httpResponse({}, 401));
  await lookup.resolveEmailFirstCustomer(typedCustomer, { enabled: true, apiKeys, fetchImpl: unauthorized.fetchImpl });
  await lookup.resolveEmailFirstCustomer(typedCustomer, { enabled: true, apiKeys, fetchImpl: unauthorized.fetchImpl });
  assert.equal(counters.reads, 2, 'a 401 drops the cached key so a replaced key applies at once');
});

test('a timeout while connecting or reading the body is uncertain', async () => {
  // AbortSignal.timeout does not keep a process alive; in Lambda the open socket does. Here a
  // synthetic handle stands in for that socket.
  const keepAlive = setInterval(() => {}, 5);
  try {
    const waitForAbort = (init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
    const connecting = await resolveWith((url, init) => waitForAbort(init), { timeoutMs: 25 });
    assert.equal(connecting.result.reason, 'timeout');
    assert.ok(connecting.result.latencyMs >= 15, String(connecting.result.latencyMs));
    const reading = await resolveWith((url, init) => ({ ok: true, status: 200, json: () => waitForAbort(init) }), { timeoutMs: 25 });
    assert.equal(reading.result.reason, 'timeout');
  } finally {
    clearInterval(keepAlive);
  }
});

test('network failures and malformed answers are uncertain', async () => {
  const network = await resolveWith(() => { throw new TypeError('fetch failed'); });
  assert.equal(network.result.reason, 'network');
  const malformed = [
    { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } },
    httpResponse(null),
    httpResponse({ data: {} }),
    httpResponse({ data: [], links: { next: 7 } }),
    httpResponse({ data: [], links: { next: 'https://a.klaviyo.com/api/profiles?page[cursor]=x' } }),
    httpResponse({ data: [{ type: 'event', attributes: { email: LOOKUP_EMAIL } }] }),
    httpResponse({ data: [{ type: 'profile', attributes: { email: null } }] }),
    httpResponse(profilesBody([{ first_name: 42 }])),
    httpResponse(profilesBody([{ last_name: ['Testsson'] }])),
    httpResponse(profilesBody([{ phone_number: '0701740605' }])),
    httpResponse(profilesBody([{ phone_number: 46701740605 }])),
    httpResponse(profilesBody([{ location: 'Fiktivstad' }])),
    httpResponse(profilesBody([{ location: { zip: 99999 } }])),
  ];
  for (const answer of malformed) {
    const { result } = await resolveWith(answer);
    assert.equal(result.reason, 'malformed', JSON.stringify(answer));
  }
  const mismatch = await resolveWith(httpResponse({ data: [{ type: 'profile', attributes: { email: 'other@example.invalid' } }] }));
  assert.equal(mismatch.result.reason, 'email_mismatch');
  const caseOnly = await resolveWith(httpResponse({ data: [{ type: 'profile', attributes: { email: EMAIL.toUpperCase(), ...FULL_PROFILE } }] }));
  assert.equal(caseOnly.result.outcome, 'found', 'Klaviyo email case does not matter');
});

test('missing, empty, unreadable or invalid keys are uncertain without a Klaviyo call', async () => {
  const cases = [
    [awsError('ResourceNotFoundException'), 'key_missing'],
    [null, 'key_missing'],
    ['', 'key_missing'],
    ['SET_IN_AWS_ONLY', 'key_invalid'],
    ['{"apiKey":"not-a-key"}', 'key_invalid'],
    [awsError('AccessDeniedException'), 'key_unavailable'],
    [awsError('ThrottlingException'), 'key_unavailable'],
  ];
  for (const [secret, reason] of cases) {
    const { result, calls } = await resolveWith(httpResponse(profilesBody([FULL_PROFILE])), { secret });
    assert.equal(result.reason, reason, String(secret));
    assert.equal(calls.length, 0);
  }
  const unconfigured = lookup.createApiKeyProvider({ secretId: () => '', readSecretString: async () => KEY });
  const fetch = recordingFetch(httpResponse(profilesBody([])));
  const result = await lookup.resolveEmailFirstCustomer(typedCustomer, { enabled: true, apiKeys: unconfigured, fetchImpl: fetch.fetchImpl });
  assert.equal(result.reason, 'key_unconfigured');
  assert.equal(fetch.calls.length, 0);
  const json = await resolveWith(httpResponse(profilesBody([])), { secret: JSON.stringify({ apiKey: KEY }) });
  assert.equal(json.result.outcome, 'not_found');
});

test('the key is read once per cache period; a missing key is retried after a minute', async () => {
  let time = 1_000_000;
  const counters = { reads: 0 };
  const apiKeys = keyProvider(KEY, counters, () => time);
  assert.equal((await apiKeys.get()).key, KEY);
  time += 4 * 60 * 1000;
  await apiKeys.get();
  assert.equal(counters.reads, 1);
  time += 60 * 1000 + 1;
  await apiKeys.get();
  assert.equal(counters.reads, 2);

  const missing = { reads: 0 };
  const missingKeys = keyProvider(awsError('ResourceNotFoundException'), missing, () => time);
  await missingKeys.get();
  time += 59 * 1000;
  await missingKeys.get();
  assert.equal(missing.reads, 1);
  time += 1001;
  await missingKeys.get();
  assert.equal(missing.reads, 2);
});

test('a disabled lookup or an unsupported email never reads the key or calls Klaviyo', async () => {
  const disabled = await resolveWith(httpResponse(profilesBody([FULL_PROFILE])), { enabled: false });
  assert.deepEqual(disabled.result, { ok: false, outcome: 'uncertain', reason: 'disabled', latencyMs: null });
  assert.equal(disabled.reads, 0);
  assert.equal(disabled.calls.length, 0);
  for (const email of ['a"b@example.invalid', 'annie(x)@example.invalid', 'annie,x@example.invalid', 'annie@example', 'annie @example.invalid']) {
    const unsupported = await resolveWith(httpResponse(profilesBody([])), { customer: { ...typedCustomer, email } });
    assert.equal(unsupported.result.reason, 'email_unsupported', email);
    assert.equal(unsupported.calls.length + unsupported.reads, 0);
  }
});

test('the module itself never logs and the only logged detail is the outcome class', () => {
  const source = fs.readFileSync(path.join(__dirname, 'contact-lookup.js'), 'utf8');
  assert.doesNotMatch(source, /console\./);
  assert.equal(lookup.describeOutcome({ outcome: 'found', customer: { lastName: 'Testsson' } }), 'found');
  assert.equal(lookup.describeOutcome({ outcome: 'not_found' }), 'not_found');
  assert.equal(lookup.describeOutcome({ outcome: 'uncertain', reason: 'timeout' }), 'uncertain:timeout');
});

// Booking handler integration: the real index.js with synthetic providers.

function loadBooking(overrides = {}, env = {}) {
  const module = { exports: {} };
  const logs = [];
  const aws = new Proxy({}, {
    get: (_, name) => String(name).endsWith('Client')
      ? class { async send() { throw new Error('Unexpected AWS operation'); } }
      : class { constructor(input) { this.input = input; } },
  });
  const sandbox = {
    module, exports: module.exports, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder, AbortSignal,
    setTimeout, clearTimeout, overrides,
    console: { log: (line) => logs.push(String(line)), error: (line) => logs.push(String(line)) },
    process: { env: { ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true', JUMPYARD_EMERGENCY_STOP: 'false', ...env } },
    fetch: async () => { throw new Error('Unexpected network operation'); },
    require(name) {
      if (name === 'crypto') return crypto;
      if (name.startsWith('@aws-sdk/')) return aws;
      if (name.startsWith('./')) return require(path.resolve(__dirname, name));
      throw new Error(name);
    },
  };
  const names = ['handleDraft', 'handleQuote', 'validateDraftRequest'];
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')}\n${assignments}\n` +
    `module.exports.test = {${names.join(',')}};`, sandbox);
  return { ...module.exports.test, logs };
}

const LOOKUP_ENV = {
  ENABLE_GH473_KLAVIYO_CONTACT_LOOKUP: 'true',
  GH473_KLAVIYO_LOOKUP_TIMEOUT_MS: '1500',
  KLAVIYO_PROFILES_READ_SECRET_ARN: SECRET_ARN,
};
const DRAFT_ID = '00000000-0000-4000-8000-000000000473';
const ITEMS = [{ productId: 1189805, quantity: 1, bookingDate: '2026-10-17', startTime: '17:00' }];

function draftBody(customer, extra = {}) {
  return { confirmDraft: true, idempotencyKey: 'phone-draft:synthetic-473', customer, items: ITEMS, name: 'Annie',
    sendConfirmations: true, ...extra };
}

function bookingHarness({ klaviyo = httpResponse(profilesBody([FULL_PROFILE])), env = LOOKUP_ENV, secret = KEY, draftAnswer = null } = {}) {
  const events = [];
  const state = { hashes: [], completions: [], rollerPosts: [], statements: [], eventLogs: [], klaviyo: [], secretReads: 0 };
  const booking = loadBooking({
    reserveIdempotencyKey: async (operation, key, hash) => { events.push('reserve'); state.hashes.push(hash); return { ok: true }; },
    completeIdempotencyKey: async (key, status, resultRef) => { state.completions.push([status, resultRef]); },
    readSecretString: async () => { state.secretReads += 1; if (secret instanceof Error) throw secret; return secret; },
    fetch: async (url, init) => { events.push('klaviyo'); state.klaviyo.push({ url, init }); return typeof klaviyo === 'function' ? klaviyo(url, init) : klaviyo; },
    getRollerConfig: async () => { events.push('roller_config'); return { env: 'playground', baseUrl: 'https://api.play.roller.app' }; },
    getRollerAccessToken: async () => ({ accessToken: 'synthetic-token', tokenType: 'Bearer' }),
    postRollerJson: async (_config, _token, endpoint, payload) => {
      events.push(endpoint);
      state.rollerPosts.push({ endpoint, payload: plain(payload) });
      if (endpoint === '/bookings/draft/costs') return { ok: true, status: 200, body: { costs: { total: 200, amountOwing: 200 } } };
      return draftAnswer
        ?? { ok: true, status: 201, body: { uniqueId: DRAFT_ID, costs: { total: 200, amountOwing: 200 }, paymentJwt: 'header.payload.signature' } };
    },
    getVenuePaymentConfig: async () => ({ available: true, apiUrl: 'https://payments.example.invalid' }),
    buildPrepaymentItemsSummary: async () => [],
    executeStatement: async (sql, parameters) => {
      state.statements.push({ sql, parameters: plain(parameters) });
      return sql.includes('INSERT INTO jumpyard.prepayment_booking_drafts')
        ? { columnMetadata: [{ name: 'prepayment_draft_id' }, { name: 'payment_attempt_id' }], records: [[{ stringValue: 'jypd_synthetic473' }, { isNull: true }]] }
        : {};
    },
    writeBookingEventLog: async (entry) => { state.eventLogs.push(plain(entry)); },
  }, env);
  return { booking, events, state };
}

function persistedCustomer(state) {
  const insert = state.statements.find(({ sql }) => sql.includes('INSERT INTO jumpyard.prepayment_booking_drafts'));
  const value = (name) => {
    const parameter = insert.parameters.find((entry) => entry.name === name).value;
    return parameter.isNull ? null : parameter.stringValue;
  };
  return { firstName: value('customerFirstName'), lastName: value('customerLastName'), phone: value('customerPhone'), email: value('customerEmail') };
}

function contactLookupLogs(logs) {
  return logs.filter((line) => line.includes('booking.contact_lookup')).map((line) => JSON.parse(line));
}

function assertNoPrivateValues(label, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of PRIVATE_VALUES) assert.ok(!text.includes(secret), `${label} must not contain ${secret}`);
}

test('handler, found: exact ROLLER draft, resolved record, nothing private in the response or logs', async () => {
  const { booking, events, state } = bookingHarness();
  const response = await booking.handleDraft({}, draftBody({ firstName: 'Annie', email: EMAIL }), 'synthetic-correlation');
  assert.equal(response.statusCode, 201, response.body);
  assert.deepEqual(events, ['reserve', 'klaviyo', 'roller_config', '/bookings/draft'], 'Klaviyo answers before any ROLLER work');
  assert.equal(state.rollerPosts.length, 1);
  const payload = state.rollerPosts[0].payload;
  assert.deepEqual(payload.customer, {
    email: EMAIL,
    firstName: 'Anna',
    lastName: 'Testsson',
    phone: '0701740605',
    address: { postcode: '999 99' },
  });
  assert.equal(payload.name, 'Annie', 'the booking name is what the phone sent');
  assert.deepEqual(persistedCustomer(state), { firstName: 'Anna', lastName: 'Testsson', phone: '0701740605', email: EMAIL });
  assert.equal(state.secretReads, 1);
  assert.equal(state.klaviyo[0].url, EXPECTED_URL);
  assertNoPrivateValues('draft response', response.body.replace(EMAIL, ''));
  const succeeded = state.eventLogs.find((entry) => entry.eventType === 'booking.draft_succeeded');
  assert.equal(succeeded.payload.contactMode, 'email_first');
  assert.equal(succeeded.payload.contactLookup, 'found');
  assertNoPrivateValues('event log', state.eventLogs);
  const lines = contactLookupLogs(booking.logs);
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(lines[0]).sort(), ['event', 'latencyMs', 'outcome']);
  assert.equal(lines[0].outcome, 'found');
  assert.equal(typeof lines[0].latencyMs, 'number');
  assertNoPrivateValues('logs', booking.logs);
  assert.ok(!booking.logs.join('\n').includes('Annie'), 'logs do not carry the typed name either');
});

test('handler, not found: placeholders reach ROLLER, the record keeps no placeholder phone, SMS stays off', async () => {
  const { booking, state } = bookingHarness({ klaviyo: httpResponse(profilesBody([])) });
  const response = await booking.handleDraft({}, draftBody({ firstName: 'Annie', email: EMAIL, acceptMarketingSms: true }), 'synthetic');
  assert.equal(response.statusCode, 201, response.body);
  assert.deepEqual(state.rollerPosts[0].payload.customer, { email: EMAIL, firstName: 'Annie', lastName: 'Gäst', phone: '0700000000' });
  assert.deepEqual(persistedCustomer(state), { firstName: 'Annie', lastName: 'Gäst', phone: null, email: EMAIL });
  assert.equal(state.eventLogs.find((entry) => entry.eventType === 'booking.draft_succeeded').payload.contactLookup, 'not_found');
  assert.equal(contactLookupLogs(booking.logs)[0].outcome, 'not_found');
});

test('handler, uncertain: 409 contact_details_required, failed reservation, no ROLLER call', async () => {
  const cases = [
    [{ klaviyo: httpResponse({}, 503) }, 'uncertain:http_503'],
    [{ klaviyo: httpResponse(profilesBody([FULL_PROFILE, FULL_PROFILE])) }, 'uncertain:multiple'],
    [{ klaviyo: () => { throw new TypeError('fetch failed'); } }, 'uncertain:network'],
    [{ klaviyo: httpResponse({ data: 'x' }) }, 'uncertain:malformed'],
    [{ secret: awsError('ResourceNotFoundException') }, 'uncertain:key_missing'],
    [{ secret: 'not-a-key' }, 'uncertain:key_invalid'],
    [{ env: { ...LOOKUP_ENV, ENABLE_GH473_KLAVIYO_CONTACT_LOOKUP: 'false' } }, 'uncertain:disabled'],
    [{ env: {} }, 'uncertain:disabled'],
  ];
  for (const [options, outcome] of cases) {
    const { booking, events, state } = bookingHarness(options);
    const response = await booking.handleDraft({}, draftBody({ firstName: 'Annie', email: EMAIL }), 'synthetic');
    assert.equal(response.statusCode, 409, outcome);
    assert.deepEqual(JSON.parse(response.body), {
      correlationId: 'synthetic',
      status: 'blocked',
      error: { code: 'contact_details_required', message: 'Last name and phone are required to complete this purchase.' },
    });
    assert.deepEqual(state.completions, [['failed', 'contact_details_required']], outcome);
    assert.ok(!events.includes('roller_config') && state.rollerPosts.length === 0, `${outcome}: no ROLLER work`);
    assert.equal(state.statements.length + state.eventLogs.length, 0, `${outcome}: no draft record`);
    assert.equal(contactLookupLogs(booking.logs)[0].outcome, outcome);
    assertNoPrivateValues(outcome, booking.logs);
    if (outcome === 'uncertain:disabled') assert.equal(state.secretReads + state.klaviyo.length, 0);
  }
});

test('handler, four fields: today\'s path exactly, without a key read or a Klaviyo call', async () => {
  const { booking, state } = bookingHarness();
  const customer = { firstName: 'Annie', lastName: 'Testsson', email: EMAIL, phone: '070-174 06 06' };
  const response = await booking.handleDraft({}, draftBody(customer), 'synthetic');
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(state.secretReads + state.klaviyo.length, 0);
  assert.deepEqual(state.rollerPosts[0].payload.customer, customer);
  assert.deepEqual(persistedCustomer(state), { ...customer });
  const succeeded = state.eventLogs.find((entry) => entry.eventType === 'booking.draft_succeeded');
  assert.equal(succeeded.payload.contactMode, 'full');
  assert.equal(succeeded.payload.contactLookup, null);
  assert.equal(contactLookupLogs(booking.logs).length, 0);
});

test('handler: the idempotency hash depends on the submitted contact, never on the Klaviyo answer', async () => {
  const hashes = [];
  for (const klaviyo of [httpResponse(profilesBody([FULL_PROFILE])), httpResponse(profilesBody([])), httpResponse({}, 500)]) {
    const { booking, state } = bookingHarness({ klaviyo });
    await booking.handleDraft({}, draftBody({ firstName: 'Annie', email: EMAIL }), 'synthetic');
    hashes.push(state.hashes[0]);
  }
  assert.equal(new Set(hashes).size, 1);
  const { booking, state } = bookingHarness();
  await booking.handleDraft({}, draftBody({ firstName: 'Annie', lastName: 'Testsson', email: EMAIL, phone: '0701740606' }), 'synthetic');
  assert.notEqual(state.hashes[0], hashes[0], 'the resubmission with all four fields is a different request');
});

test('handler: the email choice still travels with an email-first draft; SMS is never sent', async () => {
  const { booking, state } = bookingHarness();
  const choice = { granted: true, copyVersion: 'phone-email-2026-09-23-v3', locale: 'sv' };
  const response = await booking.handleDraft({}, draftBody({ firstName: 'Annie', email: EMAIL }, { emailMarketingConsent: choice }), 'synthetic');
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(state.rollerPosts[0].payload.customer.acceptMarketing, true);
  assert.equal(state.rollerPosts[0].payload.customer.acceptMarketingSms, undefined);
});

test('handler: a ROLLER rejection of an email-first draft returns codes only', async () => {
  const draftAnswer = { ok: false, status: 409, body: {
    message: 'Customer Testsson 0701740605 rejected',
    errors: [{ code: 'synthetic_code', name: 'Customer.Phone', message: 'Phone 0701740605 invalid' }],
  } };
  const { booking, state } = bookingHarness({ draftAnswer });
  const response = await booking.handleDraft({}, draftBody({ firstName: 'Annie', email: EMAIL }), 'synthetic');
  assert.equal(response.statusCode, 409);
  const body = JSON.parse(response.body);
  assert.equal(body.error.code, 'roller_draft_failed');
  assert.deepEqual(body.roller.error, {
    code: null, message: null, errors: [{ code: 'synthetic_code', message: null, name: 'Customer.Phone' }],
  });
  assertNoPrivateValues('rejection', response.body);
  assert.deepEqual(state.completions, [['failed', 'roller_http_409']]);

  const legacy = bookingHarness({ draftAnswer });
  const customer = { firstName: 'Annie', lastName: 'Testsson', email: EMAIL, phone: '0701740606' };
  const legacyResponse = await legacy.booking.handleDraft({}, draftBody(customer), 'synthetic');
  assert.equal(JSON.parse(legacyResponse.body).roller.error.message, 'Customer Testsson 0701740605 rejected',
    'the four-field path keeps its existing provider summary');
});

test('validation: email-first needs a valid email; partial four-field contacts keep customer_required', () => {
  const { validateDraftRequest } = loadBooking();
  const base = { confirmDraft: true, idempotencyKey: 'synthetic', items: ITEMS, discounts: [], giftCards: [] };
  assert.equal(validateDraftRequest({ ...base, customer: { firstName: 'Annie', email: EMAIL } }), null);
  assert.equal(validateDraftRequest({ ...base, customer: { firstName: 'Annie', email: 'not-an-email' } }).code, 'customer_email_invalid');
  const noPhone = validateDraftRequest({ ...base, customer: { firstName: 'Annie', lastName: 'Testsson', email: EMAIL } });
  assert.equal(noPhone.code, 'customer_required');
  assert.match(noPhone.message, /customer\.phone/);
  const noLastName = validateDraftRequest({ ...base, customer: { firstName: 'Annie', email: EMAIL, phone: '0701740606' } });
  assert.match(noLastName.message, /customer\.lastName/);
  assert.match(validateDraftRequest({ ...base, customer: { email: EMAIL } }).message, /customer\.firstName/);
});

test('quotes never price with a partial customer; a complete customer is unchanged', async () => {
  for (const [customer, expected] of [
    [{ firstName: 'Annie', email: EMAIL }, { firstName: 'JumpYard', lastName: 'Quote', email: 'jumpyard.quote@example.invalid', phone: '+46700000000' }],
    [{ firstName: 'Annie', lastName: '', email: EMAIL, phone: '' }, { firstName: 'JumpYard', lastName: 'Quote', email: 'jumpyard.quote@example.invalid', phone: '+46700000000' }],
    [undefined, { firstName: 'JumpYard', lastName: 'Quote', email: 'jumpyard.quote@example.invalid', phone: '+46700000000' }],
    [{ firstName: 'Annie', lastName: 'Testsson', email: EMAIL, phone: '0701740606' }, { firstName: 'Annie', lastName: 'Testsson', email: EMAIL, phone: '0701740606' }],
  ]) {
    const { booking, state } = bookingHarness();
    const response = await booking.handleQuote({}, { items: ITEMS, ...(customer ? { customer } : {}) }, 'synthetic');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(state.rollerPosts.map(({ endpoint }) => endpoint), ['/bookings/draft/costs']);
    assert.deepEqual(state.rollerPosts[0].payload.customer, expected);
    assert.equal(state.secretReads + state.klaviyo.length, 0, 'quotes never look up Klaviyo');
  }
});
