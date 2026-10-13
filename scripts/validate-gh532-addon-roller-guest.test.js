'use strict';

// GH-532 (D0260): an existing-booking add-on never changes the ROLLER guest behind it. ROLLER matches a draft's
// customer on email and overwrites that guest's supplied fields, and its booking detail has a title and a
// customerId but no names. The add-on draft therefore sends the guest exactly as GET /guests/{customerId}
// returns it, never a name split from the title ("Add-on for <ref>", "Kalas Elsa"), never a client customer,
// and never a marketing flag. The quote prices with Cloud's placeholder customer and reads no guest.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const REF = '170000000';
const GUEST_ID = 4242;
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());
const plain = (value) => JSON.parse(JSON.stringify(value));

function load(overrides) {
  const module = { exports: {} };
  const aws = new Proxy({}, {
    get: (_target, name) => String(name).endsWith('Client')
      ? class { async send() { throw new Error('Unexpected AWS operation during GH-532 validation.'); } }
      : class { constructor(input) { this.input = input; } },
  });
  const sandbox = {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { log() {}, warn() {}, info() {}, error() {} },
    exports: module.exports,
    fetch: async () => { throw new Error('Unexpected network call during GH-532 validation.'); },
    module,
    overrides,
    process: { env: {} },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return aws;
      if (moduleId === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (moduleId.startsWith('./')) return require(path.join(path.dirname(bookingPath), moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-532 validation.`);
    },
  };
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(
    `${fs.readFileSync(bookingPath, 'utf8')}\n${assignments}\nmodule.exports.__gh532 = { handleAddProductDraft, handleAddProductQuote };`,
    sandbox,
    { filename: bookingPath },
  );
  return module.exports.__gh532;
}

// ROLLER booking detail as a read-only Live read returned it on 2026-10-13: a title and a customerId, no names.
function bookingDetail(title, extra = {}) {
  return {
    bookingReference: REF, uniqueId: 'roller-original-532', createdDate: `${TODAY}T08:00:00+00:00`, source: 'Online',
    channel: 'Online', status: 'Paid', name: title, customerId: GUEST_ID, comments: null, bookingNotes: null, total: 200,
    remainder: 0, amountOwing: 0, fees: 0, discount: 0, payments: [], posNotes: null, customerFlags: [],
    items: [{ bookingDate: TODAY, productId: 1765836, quantity: 1, tickets: [{ ticketHolderName: 'Holder Name' }] }],
    ...extra,
  };
}

// ROLLER guest detail, with the response keys seen live.
function guestDetail(contact) {
  return {
    guestId: GUEST_ID, acceptMarketing: true, acceptMarketingSMS: true, address: { postcode: '13134' }, flags: [],
    ...contact,
  };
}

function fixture({ title = 'Anna Svensson', booking = bookingDetail(title), guest, guestStatus = 200 } = {}) {
  const gets = [];
  const posts = [];
  const saved = [];
  const backend = load({
    getRollerConfig: async () => ({ env: 'live', baseUrl: 'https://api.roller.app' }),
    getRollerAccessToken: async () => ({ accessToken: 'synthetic', tokenType: 'Bearer' }),
    reserveIdempotencyKey: async () => ({ ok: true }),
    completeIdempotencyKey: async () => {},
    isAddProductDraftWriteEnabled: () => true,
    validateT0176FullFlowRequestItemDates: () => ({ ok: true }),
    validateT0162AddOnSmokeAccess: () => ({ ok: true }),
    validateT0176FullFlowOriginalBookingAccess: () => ({ ok: true }),
    verifyGuestAccessForBooking: async () => ({ ok: true }),
    findLocalOriginalBooking: async () => null,
    // No Aurora contact copy may stand in for the guest: any statement fails the test.
    executeStatement: async (sql) => { throw new Error(`Unexpected SQL during GH-532 validation: ${sql.slice(0, 60)}`); },
    getRollerJson: async (_config, _token, endpoint) => {
      gets.push(endpoint);
      if (endpoint === `/bookings/${REF}`) return { ok: true, status: 200, body: booking };
      if (endpoint === `/guests/${GUEST_ID}`) {
        return guestStatus === 200
          ? { ok: true, status: 200, body: guest }
          : { ok: false, status: guestStatus, body: { error: 'synthetic' } };
      }
      throw new Error(`Unexpected ROLLER read ${endpoint}`);
    },
    postRollerJson: async (_config, _token, endpoint, payload) => {
      posts.push({ endpoint, payload: plain(payload) });
      const costs = { total: 40, amountOwing: 40 };
      if (endpoint === '/bookings/draft/costs') return { ok: true, status: 200, body: { costs } };
      if (endpoint === '/bookings/draft') {
        return { ok: true, status: 201, body: { uniqueId: 'roller-addon-532', bookingReference: null, costs, paymentJwt: 'h.p.s' } };
      }
      throw new Error(`Unexpected ROLLER write ${endpoint}`);
    },
    getVenuePaymentConfig: async () => ({ available: true, apiUrl: 'https://example.invalid' }),
    persistPrepaymentDraft: async ({ request }) => {
      saved.push(plain(request.customer));
      return { prepaymentDraftId: 'jypd_gh532', paymentAttemptId: null };
    },
    persistAddOnBookingLink: async () => ({}),
    writeBookingEventLog: async () => {},
  });
  return { backend, gets, posts, saved };
}

const event = { pathParameters: { bookingReference: REF }, headers: {} };
const items = [{ productId: 1324123, quantity: 1, bookingDate: TODAY, startTime: '12:00' }];
const draftBody = (extra = {}) => ({
  confirmDraft: true, idempotencyKey: `gh532-${crypto.randomUUID()}`, items, name: `Add-on for ${REF}`,
  requireAvailability: false, sendConfirmations: true, ...extra,
});
const contactOf = (guest) => ({ firstName: guest.firstName, lastName: guest.lastName, email: guest.email, phone: guest.phone });
const draftPost = (posts) => posts.find((post) => post.endpoint === '/bookings/draft');

const titles = [
  ['the owner name (web default)', 'Anna Svensson', { firstName: 'Anna', lastName: 'Svensson' }],
  ['a double first name', 'Anna Maria Svensson', { firstName: 'Anna Maria', lastName: 'Svensson' }],
  ['an email-first first name only', 'Anna', { firstName: 'Anna', lastName: 'Svensson' }],
  ['a typed two-word first name', 'Anna Maria', { firstName: 'Anna Maria', lastName: 'Svensson' }],
  ['an add-on booking of its own', `Add-on for ${REF}`, { firstName: 'Anna', lastName: 'Svensson' }],
  ['a staff title', 'Kalas Elsa 7 år', { firstName: 'Anna', lastName: 'Svensson' }],
  ['the generic fallback title', 'JumpYard booking', { firstName: 'Anna', lastName: 'Svensson' }],
];

for (const [label, title, names] of titles) {
  test(`a booking titled with ${label} sends the ROLLER guest unchanged`, async () => {
    const guest = guestDetail({ ...names, email: 'anna@example.invalid', phone: '0701740605' });
    const { backend, gets, posts, saved } = fixture({ title, guest });
    const result = await backend.handleAddProductDraft(event, draftBody(), 'gh532');
    assert.equal(result.statusCode, 201, result.body);
    const draft = draftPost(posts);
    assert.deepEqual(draft.payload.customer, contactOf(guest), 'exactly the guest, no flags, no address');
    assert.equal(draft.payload.name, `Add-on for ${REF}`, 'the add-on keeps its findable title');
    assert.deepEqual(gets, [`/bookings/${REF}`, `/guests/${GUEST_ID}`], 'one guest read per add-on draft');
    assert.deepEqual(saved, [contactOf(guest)], 'Aurora records the contact sent to ROLLER');
  });
}

test('a client customer never reaches ROLLER', async () => {
  const guest = guestDetail({ firstName: 'Anna', lastName: 'Svensson', email: 'anna@example.invalid', phone: '0701740605' });
  const { backend, posts } = fixture({ guest });
  const intruder = { firstName: 'Mallory', lastName: 'Other', email: 'other@example.invalid', phone: '0701740699',
    acceptMarketing: true, acceptMarketingSms: true };
  const result = await backend.handleAddProductDraft(event, draftBody({ customer: intruder }), 'gh532');
  assert.equal(result.statusCode, 201, result.body);
  assert.deepEqual(draftPost(posts).payload.customer, contactOf(guest));
});

test('values are sent exactly as ROLLER holds them, placeholder phone included', async () => {
  for (const contact of [
    { firstName: 'Anna Maria', lastName: 'von Svensson', email: 'Anna.Maria@Example.invalid', phone: '070-174 06 05' },
    { firstName: 'Anna', lastName: 'Gäst', email: 'anna@example.invalid', phone: '0700000000' },
  ]) {
    const { backend, posts } = fixture({ guest: guestDetail(contact) });
    const result = await backend.handleAddProductDraft(event, draftBody(), 'gh532');
    assert.equal(result.statusCode, 201, result.body);
    assert.deepEqual(draftPost(posts).payload.customer, contact);
  }
});

test('an incomplete or missing guest stops before any ROLLER write', async () => {
  const complete = { firstName: 'Anna', lastName: 'Svensson', email: 'anna@example.invalid', phone: '0701740605' };
  const cases = [
    { guest: guestDetail({ ...complete, phone: '' }) },
    { guest: guestDetail({ ...complete, lastName: null }) },
    { guest: guestDetail({ ...complete, firstName: '   ' }) },
    { guest: guestDetail({ ...complete, email: 'not-an-email' }) },
    { guest: null, guestStatus: 404 },
    { guest: guestDetail(complete), booking: bookingDetail('Anna Svensson', { customerId: null }) },
  ];
  for (const options of cases) {
    const { backend, gets, posts, saved } = fixture(options);
    const result = await backend.handleAddProductDraft(event, draftBody(), 'gh532');
    assert.equal(result.statusCode, 409, result.body);
    assert.equal(JSON.parse(result.body).error.code, 'original_booking_contact_unresolved');
    assert.deepEqual(posts, [], 'no costs, draft or publish');
    assert.deepEqual(saved, []);
    if (options.booking) assert.deepEqual(gets, [`/bookings/${REF}`], 'no guest read without a customerId');
  }
});

test('a ROLLER guest read failure is a provider error, not a contact problem', async () => {
  const { backend, posts } = fixture({ guest: null, guestStatus: 500 });
  const result = await backend.handleAddProductDraft(event, draftBody(), 'gh532');
  assert.equal(result.statusCode, 502, result.body);
  assert.equal(JSON.parse(result.body).error.code, 'roller_original_guest_lookup_failed');
  assert.deepEqual(posts, []);
});

test('the quote prices with the placeholder customer and reads no guest', async () => {
  const guest = guestDetail({ firstName: 'Anna', lastName: 'Svensson', email: 'anna@example.invalid', phone: '0701740605' });
  const { backend, gets, posts } = fixture({ title: `Add-on for ${REF}`, guest });
  const body = { items, name: `Add-on for ${REF}`, requireAvailability: false,
    customer: { firstName: 'Mallory', lastName: 'Other', email: 'other@example.invalid', phone: '0701740699' } };
  const result = await backend.handleAddProductQuote(event, body, 'gh532');
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(gets, [`/bookings/${REF}`]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].endpoint, '/bookings/draft/costs');
  assert.deepEqual(posts[0].payload.customer, {
    firstName: 'JumpYard', lastName: 'Quote', email: 'jumpyard.quote@example.invalid', phone: '+46700000000',
  });
  assert.equal(posts[0].payload.name, `Add-on for ${REF}`);
});

test('the package wires this validator into validate', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['validate:gh532-addon-roller-guest'], 'node --test scripts/validate-gh532-addon-roller-guest.test.js');
  assert.match(packageJson.scripts.validate, /npm run validate:gh532-addon-roller-guest/);
});
