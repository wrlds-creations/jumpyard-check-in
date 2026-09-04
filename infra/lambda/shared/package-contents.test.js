'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { withBookingPackageContents, withPackageContents } = require('./package-contents');

const lambdaRoot = path.resolve(__dirname, '..');
const combo = (quantity = 1) => ({
  bookingItemId: 'synthetic-combo-item',
  productId: 1242136,
  parentProductId: 1242135,
  productName: 'Weekday Combo',
  quantity,
  tickets: [{ ticketId: 'synthetic-admission-1' }, { ticketId: 'synthetic-admission-2' }],
});
const expectedContents = (quantity = 1) => [
  { kind: 'admission', quantity: quantity * 2, collection: 'checkin', durationMinutes: 60 },
  { kind: 'pizza', quantity, collection: 'later' },
];

function loadLambda(name, internals, overrides = {}) {
  const filename = path.join(lambdaRoot, name, 'index.js');
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  class FakeCommand { constructor(input) { this.input = input; } }
  class FakeClient { async send() { throw new Error('Unexpected AWS operation in package display test.'); } }
  const aws = new Proxy({}, {
    get(_target, property) { return String(property).endsWith('Client') ? FakeClient : FakeCommand; },
  });
  const sandbox = {
    Buffer, URL, URLSearchParams, TextDecoder, TextEncoder, console, clearTimeout, setTimeout,
    exports: module.exports,
    module,
    overrides,
    process: { env: {} },
    fetch: async () => { throw new Error('Unexpected network operation in package display test.'); },
    require(id) {
      if (id === 'crypto') return crypto;
      if (id.startsWith('@aws-sdk/')) return aws;
      if (id.startsWith('./')) return require(path.resolve(path.dirname(filename), id));
      throw new Error(`Unexpected module ${id}`);
    },
  };
  const assignments = Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n');
  vm.runInNewContext(`${source}\n${assignments}\nmodule.exports.test = { ${internals.join(', ')} };`, sandbox, { filename });
  return { ...module.exports.test, handler: module.exports.handler };
}

function rdsRows(rows) {
  const columns = Object.keys(rows[0] ?? {});
  return {
    columnMetadata: columns.map((name) => ({ name })),
    records: rows.map((row) => columns.map((name) => {
      const value = row[name];
      if (value === null || value === undefined) return { isNull: true };
      return typeof value === 'number' ? { longValue: value } : { stringValue: String(value) };
    })),
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('one and two verified packages produce admission and deferred pizza rows without changing authority', () => {
  for (const quantity of [1, 2]) {
    const source = Object.freeze(combo(quantity));
    const result = withPackageContents(source);
    assert.deepEqual(result.packageContents, expectedContents(quantity));
    assert.equal(result.quantity, quantity);
    assert.equal(result.bookingItemId, source.bookingItemId);
    assert.equal(result.tickets, source.tickets);
    assert.equal(source.packageContents, undefined);
  }
});

test('exact identity and explicit package quantity are required; names and parent-only matches do not infer contents', () => {
  for (const patch of [
    { productId: 'unrecognized-child' },
    { productId: null },
    { productId: 1242135 },
    { productId: 1318777 },
    { parentProductId: 'unrecognized-parent' },
    { quantity: null },
    { quantity: undefined },
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 1.5 },
    { quantity: Number.MAX_SAFE_INTEGER },
  ]) {
    const source = { ...combo(), ...patch };
    assert.equal(withPackageContents(source), source);
    assert.equal(withPackageContents(source).packageContents, undefined);
  }
  assert.deepEqual(withPackageContents({ ...combo(), parentProductId: null }).packageContents, expectedContents());
  assert.deepEqual(withPackageContents({ ...combo(), productId: '1242136', parentProductId: '1242135' }).packageContents, expectedContents());
});

test('mixed bookings preserve ordinary entry, family, coffee and original item/ticket arrays', () => {
  const source = {
    bookingReference: 'synthetic-booking',
    items: [combo(2),
      { productId: 100, productType: 'entry', quantity: 3, tickets: [{ ticketId: 'entry' }] },
      { productId: 200, productType: 'family', quantity: 1 },
      { productId: 970352, productType: 'stock', productName: 'Coffee', quantity: 1 }],
  };
  const before = JSON.stringify(source);
  const result = withBookingPackageContents(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal(result.items.length, 4);
  assert.deepEqual(result.items[0].packageContents, expectedContents(2));
  assert.deepEqual(result.items.slice(1), source.items.slice(1));
  assert.equal(result.items[0].tickets, source.items[0].tickets);
  assert.deepEqual(withBookingPackageContents(result), result, 'reprojecting must not multiply or append contents');
});

test('isolated Lambda assets contain the exact canonical helper', () => {
  const canonical = fs.readFileSync(path.join(__dirname, 'package-contents.js'), 'utf8');
  for (const name of ['booking', 'lookup', 'session']) {
    assert.equal(fs.readFileSync(path.join(lambdaRoot, name, 'package-contents.js'), 'utf8'), canonical, name);
  }
});

test('cached and live lookup responses project contents only after authority operations', async () => {
  for (const cached of [true, false]) {
    const booking = { rollerUniqueId: 'synthetic-booking', items: [combo()] };
    const authorityInputs = [];
    const recordAuthority = async (value) => { authorityInputs.push(plain(value)); };
    const lookup = loadLambda('lookup', [], {
      parseRequest: () => ({ identifier: 'synthetic-booking' }),
      shouldTryLocalLookup: () => true,
      getLocalBooking: async () => ({ status: cached ? 'found' : 'missing', booking, metadata: {} }),
      shouldUseLocalBooking: () => true,
      validateParkTestBookingScope: () => ({ ok: true }),
      reconcilePrepaymentDraftFromPaidBooking: recordAuthority,
      evaluateEligibility: (value) => { authorityInputs.push(plain(value)); return { reason: 'ready' }; },
      createGuestAccessToken: async () => ({ token: 'synthetic-access' }),
      getRollerConfig: async () => ({ env: 'live' }),
      getRollerAccessToken: async () => 'synthetic-provider-token',
      getProductCatalogBestEffort: async () => ({ byId: new Map(), status: 'available' }),
      shouldUseRollerBookingSearch: () => false,
      getBookingDetail: async () => ({ ok: true, body: booking }),
      normalizeBooking: () => booking,
      needsVerifiedAssistedLookupVenue: () => false,
      upsertLiveBooking: recordAuthority,
    });
    const response = await lookup.handler({});
    assert.equal(response.statusCode, 200);
    const result = JSON.parse(response.body);
    assert.deepEqual(result.booking.items[0].packageContents, expectedContents());
    assert.equal(result.booking.items[0].quantity, 1);
    assert.deepEqual(result.booking.items[0].tickets, booking.items[0].tickets);
    assert.ok(authorityInputs.length >= 2);
    for (const input of authorityInputs) assert.equal(input.items[0].packageContents, undefined);
    assert.equal(booking.items[0].packageContents, undefined);
  }
});

test('staff and resumed guest projections preserve linked/provisional identity and ticket scope', async () => {
  const row = {
    booking_item_key: 'synthetic-combo-key', booking_item_id: 'synthetic-combo-item',
    product_id: '1242136', parent_product_id: '1242135', product_name: 'Weekday Combo',
    quantity: 2, item_summary: '{}', tickets_json: JSON.stringify(combo().tickets),
  };
  const session = loadLambda('session', ['mapStaffBookingItem', 'findPhoneBookingItems', 'toGuestLinkedAddOnPhoneItem'], {
    executeStatement: async () => rdsRows([row]),
  });
  for (const fulfillmentSource of ['original', 'provisional', 'linked_add_on']) {
    const item = session.mapStaffBookingItem({ ...row, fulfillment_source: fulfillmentSource });
    assert.deepEqual(plain(item.packageContents), expectedContents(2));
    assert.equal(item.fulfillmentSource, fulfillmentSource);
    assert.equal(item.bookingItemKey, row.booking_item_key);
    assert.equal(item.quantity, 2);
    assert.equal(item.summary.packageContents, undefined);
    const guest = session.toGuestLinkedAddOnPhoneItem(item);
    assert.deepEqual(plain(guest.packageContents), expectedContents(2));
    assert.deepEqual(plain(guest.tickets), []);
    assert.equal(guest.bookingItemId, null);
  }
  const [guest] = await session.findPhoneBookingItems('synthetic-booking');
  assert.deepEqual(plain(guest.packageContents), expectedContents(2));
  assert.deepEqual(plain(guest.tickets), combo().tickets);
  assert.equal(guest.quantity, 2);
});

test('new purchase availability exposes per-package contents without changing price or booked quantity', () => {
  const booking = loadLambda('booking', ['buildPhoneAvailability']);
  const definition = {
    key: 'COMBO60', type: 'combo', label: 'Weekday Combo', parentProductId: '1242135',
    availabilityProductIds: ['1242136'], jumpersPerUnit: 2, durationMinutes: 60,
  };
  const request = { date: '2026-09-03', startTimes: ['17:00'] };
  const provider = [{ parentProductId: 1242135,
    products: [{ id: 1242136, name: 'Weekday Combo', cost: 450 }],
    sessions: [{ startTime: '17:00', endTime: '18:00', capacityRemaining: 20 }],
  }];
  const result = booking.buildPhoneAvailability(request, [definition], provider);
  const product = result.products[0];
  assert.deepEqual(plain(product.packageContents), expectedContents());
  assert.equal(product.unitPrice, 450);
  assert.equal(product.jumpersPerUnit, 2);
  assert.equal(product.quantity, undefined);
  assert.equal(product.productId, '1242136');
  assert.equal(product, result.slots[0].products[0]);
  const unavailable = booking.buildPhoneAvailability(request, [definition], []);
  assert.equal(unavailable.products[0].packageContents, undefined, 'a missing child must not claim contents');
  assert.equal(definition.packageContents, undefined);
  assert.equal(provider[0].products[0].packageContents, undefined);
});

test('presentation contents never add ticket redemption authority, including deferred food', () => {
  for (const name of ['session', 'redeem']) {
    const handler = loadLambda(name, ['splitRedeemableTickets']);
    const item = withPackageContents(combo());
    const tickets = [
      ...item.tickets.map((ticket) => ({ ...ticket, itemProductType: 'sessionpass' })),
      { ticketId: 'synthetic-food', itemProductType: 'stock', packageContents: item.packageContents },
    ];
    const result = handler.splitRedeemableTickets(tickets);
    assert.deepEqual(plain(result.redeemableTickets.map((ticket) => ticket.ticketId)), item.tickets.map((ticket) => ticket.ticketId));
    assert.deepEqual(plain(result.excludedTickets.map((ticket) => ticket.ticketId)), ['synthetic-food']);
    assert.equal(item.quantity, 1);
  }
});
