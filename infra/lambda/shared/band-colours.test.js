'use strict';

// GH-459: JumpYard's fixed band colour scheme. Pure checks plus the real guest and staff
// projections with synthetic data; no AWS, ROLLER or network operation is possible.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  BAND_COLOUR_SCHEME, admissionEndTime, bandColourForAdmission, bandColourForEndTime, bandColourForItem,
  groupBandColours,
} = require('./band-colours');
const { withBandColour, withGuestBookingDetails, withGuestItemDetails } = require('./package-contents');
const { buildManifest, classifyItem } = require('./staff-handout');
const { createStaffBoard } = require('../session/staff-board');

const lambdaRoot = path.resolve(__dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));
const idFor = (startTime, durationMinutes) => bandColourForAdmission({ startTime, durationMinutes })?.id ?? null;

// The laminated "Sluttid" chart at the Nacka desk, delivered 2026-09-30, row by row.
const CHART = [
  ['09:00', null, null], ['09:30', null, null],
  ['10:00', 'svart-rod', 'Svart/Röd'], ['10:30', 'gul', 'Gul'], ['11:00', 'gron', 'Grön'],
  ['11:30', 'ljusbla', 'Ljusblå'], ['12:00', 'rosa-lila', 'Rosa/Lila'], ['12:30', 'rod', 'Röd'],
  ['13:00', 'morkbla', 'Mörkblå'], ['13:30', 'lila', 'Lila'], ['14:00', 'svart', 'Svart'],
  ['14:30', 'orange', 'Orange'], ['15:00', 'svart-rod', 'Svart/Röd'], ['15:30', 'gul', 'Gul'],
  ['16:00', 'gron', 'Grön'], ['16:30', 'ljusbla', 'Ljusblå'], ['17:00', 'rosa-lila', 'Rosa/Lila'],
  ['17:30', 'rod', 'Röd'], ['18:00', 'morkbla', 'Mörkblå'], ['18:30', 'lila', 'Lila'],
  ['19:00', 'svart', 'Svart'], ['19:30', 'orange', 'Orange'], ['20:00', 'svart-rod', 'Svart/Röd'],
];

test('every row of the delivered chart maps to exactly its colour', () => {
  for (const [endTime, id, name] of CHART) {
    const colour = bandColourForEndTime(endTime);
    if (!id) { assert.equal(colour, null, `${endTime} is blank on the chart`); continue; }
    assert.equal(colour.id, id, endTime);
    assert.equal(colour.name.sv, name, endTime);
    assert.equal(colour.endTime, endTime);
    assert.equal(colour.schemeVersion, BAND_COLOUR_SCHEME.version);
    // The same row through start + duration for each admission length sold in Nacka.
    for (const duration of [60, 90, 120]) {
      const [hours, minutes] = endTime.split(':').map(Number);
      const start = hours * 60 + minutes - duration;
      const startTime = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
      assert.equal(idFor(startTime, duration), id, `${duration} min from ${startTime}`);
    }
  }
  assert.deepEqual(Object.keys(BAND_COLOUR_SCHEME.endTimes), CHART.filter(([, id]) => id).map(([time]) => time));
});

test('Gustav’s examples: the colour follows the end time, not the start time', () => {
  assert.equal(idFor('12:00', 60), 'morkbla', '60 min at 12:00 ends 13:00');
  assert.equal(idFor('11:30', 90), 'morkbla', '90 min at 11:30 also ends 13:00');
  assert.equal(idFor('13:30', 120), 'gul', '120 min at 13:30 ends 15:30');
  assert.equal(bandColourForAdmission({ startTime: '11:30', endTime: '13:00' }).name.sv, 'Mörkblå');
  assert.notEqual(idFor('12:00', 90), idFor('12:00', 60), 'the same start time can need different bands');
});

test('unmapped end times get no colour: before 10:00, after 20:00 or off the half-hour grid', () => {
  for (const [startTime, durationMinutes, why] of [
    ['08:30', 60, 'ends 09:30, blank on the chart'], ['08:00', 60, 'ends 09:00, blank on the chart'],
    ['07:00', 60, 'ends 08:00, before the chart'], ['19:00', 90, 'ends 20:30, after the chart'],
    ['20:00', 120, 'ends 22:00, after the chart'], ['11:15', 60, 'ends 12:15, off the grid'],
    ['11:00', 45, 'ends 11:45, off the grid'], ['12:00', 61, 'ends 13:01, off the grid'],
  ]) assert.equal(bandColourForAdmission({ startTime, durationMinutes }), null, why);
  for (const endTime of ['09:30', '20:30', '12:15', '21:00', '13:00:30', '24:00', '13:60', '1300', '', null, undefined, 1300])
    assert.equal(bandColourForEndTime(endTime), null, String(endTime));
});

test('the transcription is a ten-colour half-hour cycle; two-tone bands have two swatches', () => {
  const ids = Object.values(BAND_COLOUR_SCHEME.endTimes);
  assert.equal(ids.length, 21);
  ids.forEach((id, index) => { if (index >= 10) assert.equal(id, ids[index - 10], `row ${index}`); });
  assert.equal(new Set(ids.slice(0, 10)).size, 10);
  assert.deepEqual(Object.keys(BAND_COLOUR_SCHEME.colours).sort(), [...new Set(ids)].sort());
  for (const [id, colour] of Object.entries(BAND_COLOUR_SCHEME.colours)) {
    assert.ok(colour.sv && colour.en, id);
    assert.equal(colour.swatch.length, colour.sv.includes('/') ? 2 : 1, id);
    for (const hex of colour.swatch) assert.match(hex, /^#[0-9A-F]{6}$/, id);
  }
  assert.deepEqual(BAND_COLOUR_SCHEME.colours['svart-rod'].swatch,
    [BAND_COLOUR_SCHEME.colours.svart.swatch[0], BAND_COLOUR_SCHEME.colours.rod.swatch[0]]);
  assert.deepEqual(BAND_COLOUR_SCHEME.colours['rosa-lila'].swatch.slice(1), BAND_COLOUR_SCHEME.colours.lila.swatch);
  assert.equal(BAND_COLOUR_SCHEME.colours.lila.en, 'Purple', 'Lila is purple even though the chart prints it pink');
});

test('the scheme is read-only and every answer is a fresh copy', () => {
  assert.ok(Object.isFrozen(BAND_COLOUR_SCHEME) && Object.isFrozen(BAND_COLOUR_SCHEME.colours.gul.swatch));
  const first = bandColourForEndTime('15:30');
  first.swatch.push('#000000');
  first.name.sv = 'changed';
  assert.deepEqual(bandColourForEndTime('15:30'), { id: 'gul', name: { sv: 'Gul', en: 'Yellow' }, swatch: ['#FFD400'],
    endTime: '15:30', schemeVersion: 'nacka-2026-09-30' });
});

test('end time is start + duration; an explicit duration wins over the item end time', () => {
  assert.equal(admissionEndTime({ startTime: '11:30:00', endTime: '13:00:00' }), '13:00', 'Aurora time text');
  assert.equal(admissionEndTime({ startTime: '9:30', durationMinutes: 90 }), '11:00');
  assert.equal(admissionEndTime({ startTime: '12:00', durationMinutes: '60' }), '13:00');
  assert.equal(admissionEndTime({ startTime: '12:00', durationMinutes: 60, endTime: '14:30' }), '13:00');
  assert.equal(admissionEndTime({ startTime: '12:00', durationMinutes: 0, endTime: '13:30' }), '13:30');
  for (const admission of [{}, { startTime: '12:00' }, { startTime: '12:00', endTime: '12:00' },
    { startTime: '18:00', endTime: '17:00' }, { startTime: '23:30', durationMinutes: 60 },
    { startTime: '12:00:15', durationMinutes: 60 }, { startTime: 'noon', durationMinutes: 60 },
    { startTime: '12:00', durationMinutes: 59.5 }]) assert.equal(admissionEndTime(admission), null, JSON.stringify(admission));
});

const sessionPass = (overrides = {}) => ({ bookingItemId: 'entry', productId: '1189823', productName: 'Biljetter',
  parentProductName: 'Entré 90 min', productType: 'sessionpass', quantity: 2, bookingDate: '2026-10-01',
  startTime: '11:30', endTime: '13:00', tickets: [{ ticketId: 'T1' }, { ticketId: 'T2' }], ...overrides });
const combo = (overrides = {}) => ({ bookingItemId: 'combo', productId: '1242136', parentProductId: '1242135',
  productName: 'Weekday Combo', parentProductName: 'Weekday Combo', productType: 'partypackage', quantity: 1,
  bookingDate: '2026-10-01', startTime: '12:00', endTime: '14:30', tickets: [], ...overrides });

test('only admission products get a band: Combo by verified identity, others by staff admission types', () => {
  assert.equal(withBandColour(sessionPass()).bandColour.id, 'morkbla');
  assert.equal(withBandColour(combo()).bandColour.id, 'morkbla', 'Weekday Combo admits 60 minutes, not the item end');
  assert.equal(withBandColour(combo({ productType: null })).bandColour.endTime, '13:00');
  assert.equal(withBandColour(combo()).packageContents, undefined, 'the colour alone adds no contents');
  assert.equal(withBandColour(sessionPass({ productType: null, summary: { parentType: 'Session Pass' } })).bandColour.id, 'morkbla');
  for (const [label, item] of [
    ['add-on', sessionPass({ productType: 'addon', parentProductName: 'SkyRider' })],
    ['gift card', sessionPass({ productType: 'giftcard' })],
    ['gift card admission', sessionPass({ productSubType: 'giftCard' })],
    ['food', sessionPass({ productType: 'food', parentProductName: 'Pizza' })],
    ['unknown type', sessionPass({ productType: null })],
    ['unmapped end', sessionPass({ endTime: '13:15' })],
    ['no time', sessionPass({ startTime: null, endTime: null })],
  ]) {
    const source = Object.freeze(item);
    assert.equal(withBandColour(source), source, label);
    assert.equal(bandColourForItem(source), null, label);
  }
  // Guest and staff agree on what an admission is.
  for (const type of ['sessionpass', 'standardPass', 'membership', 'partypackage', 'addon', 'giftcard', 'food', null]) {
    const admission = Boolean(withBandColour(sessionPass({ productType: type })).bandColour);
    assert.equal(admission, classifyItem({ summary: { productType: type }, productName: 'Biljetter' }) === 'admission', String(type));
  }
});

test('mixed durations in one booking: one colour per item group', () => {
  const booking = { bookingReference: 'synthetic', items: [
    sessionPass(), sessionPass({ bookingItemId: 'short', parentProductName: 'Entré 60 min', endTime: '12:30', quantity: 1 }),
    combo({ quantity: 2 }), sessionPass({ bookingItemId: 'socks', productType: 'addon', parentProductName: 'JumpSocks' }),
  ] };
  const before = JSON.stringify(booking);
  const result = withGuestBookingDetails(booking);
  assert.equal(JSON.stringify(booking), before, 'the source booking is not changed');
  assert.deepEqual(result.items.map((item) => item.bandColour?.id ?? null), ['morkbla', 'rod', 'morkbla', null]);
  assert.equal(result.items[2].packageContents[0].quantity, 4, 'Combo contents still apply');
  assert.deepEqual(withGuestBookingDetails(result), result, 'reprojecting is stable');
  assert.deepEqual(plain(withGuestItemDetails(combo())).packageContents.map((content) => content.kind), ['admission', 'pizza']);
});

function loadLambda(name, internals, overrides = {}) {
  const filename = path.join(lambdaRoot, name, 'index.js');
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  class FakeCommand { constructor(input) { this.input = input; } }
  class FakeClient { async send() { throw new Error('Unexpected AWS operation in band colour test.'); } }
  const aws = new Proxy({}, { get(_target, property) { return String(property).endsWith('Client') ? FakeClient : FakeCommand; } });
  const sandbox = {
    Buffer, URL, URLSearchParams, TextDecoder, TextEncoder, console, clearTimeout, setTimeout,
    exports: module.exports, module, overrides, process: { env: {} },
    fetch: async () => { throw new Error('Unexpected network operation in band colour test.'); },
    require(id) {
      if (id === 'crypto') return crypto;
      if (id.startsWith('@aws-sdk/')) return aws;
      if (id.startsWith('./')) return require(path.resolve(path.dirname(filename), id));
      throw new Error(`Unexpected module ${id}`);
    },
  };
  const assignments = Object.keys(overrides).map((key) => `${key} = overrides.${key};`).join('\n');
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

test('guest lookup responses carry the colour after authority operations, cached and live', async () => {
  for (const cached of [true, false]) {
    const booking = { rollerUniqueId: 'synthetic-booking', items: [sessionPass(), sessionPass({ bookingItemId: 'late', endTime: '20:30', startTime: '19:00' })] };
    const authorityInputs = [];
    const record = async (value) => { authorityInputs.push(plain(value)); };
    const lookup = loadLambda('lookup', [], {
      parseRequest: () => ({ identifier: 'synthetic-booking' }),
      shouldTryLocalLookup: () => true,
      getLocalBooking: async () => ({ status: cached ? 'found' : 'missing', booking, metadata: {} }),
      shouldUseLocalBooking: () => true,
      validateParkTestBookingScope: () => ({ ok: true }),
      reconcilePrepaymentDraftFromPaidBooking: record,
      evaluateEligibility: (value) => { authorityInputs.push(plain(value)); return { reason: 'ready' }; },
      createGuestAccessToken: async () => ({ token: 'synthetic-access' }),
      getRollerConfig: async () => ({ env: 'live' }),
      getRollerAccessToken: async () => 'synthetic-provider-token',
      getProductCatalogBestEffort: async () => ({ byId: new Map(), status: 'available' }),
      shouldUseRollerBookingSearch: () => false,
      getBookingDetail: async () => ({ ok: true, body: booking }),
      normalizeBooking: () => booking,
      needsVerifiedAssistedLookupVenue: () => false,
      upsertLiveBooking: record,
    });
    const response = await lookup.handler({});
    assert.equal(response.statusCode, 200);
    const [entry, late] = JSON.parse(response.body).booking.items;
    assert.equal(entry.bandColour.id, 'morkbla');
    assert.deepEqual(entry.bandColour.name, { sv: 'Mörkblå', en: 'Dark blue' });
    assert.equal(late.bandColour, undefined, '20:30 is not on the chart');
    for (const input of authorityInputs) assert.ok(input.items.every((item) => item.bandColour === undefined));
  }
});

test('session-link resume carries the same colours as lookup', async () => {
  const row = { booking_item_id: 'entry', product_id: '1189771', parent_product_id: '1189770', product_name: 'Biljetter',
    parent_product_name: 'Entré 120 min', product_type: 'sessionpass', quantity: 3, booking_date: '2026-10-01',
    start_time: '13:30:00', end_time: '15:30:00', tickets_json: '[]' };
  const session = loadLambda('session', ['findPhoneBookingItems', 'toGuestLinkedAddOnPhoneItem'], {
    executeStatement: async () => rdsRows([row]),
  });
  const [resumed] = await session.findPhoneBookingItems('synthetic-booking');
  assert.equal(resumed.bandColour.id, 'gul');
  assert.equal(resumed.bandColour.endTime, '15:30');
  assert.equal(session.toGuestLinkedAddOnPhoneItem({ ...sessionPass(), bookingItemId: 'x' }).bandColour.id, 'morkbla');
  assert.equal(session.toGuestLinkedAddOnPhoneItem({ ...sessionPass(), productType: 'addon' }).bandColour, undefined);
});

// Purchases before ROLLER confirms them: items as Cloud stores them with the draft
// (normalizeItemsSummary), typed with Cloud's own product definitions.
const purchaseItems = [
  { productId: '1189823', parentProductName: 'Entré 90 min', productType: 'entry',
    durationMinutes: 90, startTime: '11:30', endTime: '13:00', quantity: 2, bookingDate: '2026-10-01' },
  { productId: '1242136', parentProductId: '1242135', productName: 'Weekday Combo', parentProductName: 'Weekday Combo',
    productType: 'combo', durationMinutes: 60, startTime: '12:00', endTime: '13:00', quantity: 1, bookingDate: '2026-10-01' },
  { productId: '1765445', productName: 'JumpSocks', productType: 'addon', durationMinutes: 0, startTime: '11:30', quantity: 2 },
];
const comboContents = [
  { kind: 'admission', quantity: 2, collection: 'checkin', durationMinutes: 60 },
  { kind: 'pizza', quantity: 1, collection: 'later' },
];

test('a Weekday Combo bought on the phone carries its bands, colour and later pizza like a looked-up one', () => {
  const booking = loadLambda('booking', ['publicPhoneProvisionalHandoff']);
  const draft = { roller_draft_unique_id: 'synthetic-draft', customer_first_name: 'Alex', customer_last_name: 'Gäst',
    items_summary: JSON.stringify(purchaseItems) };
  const handoff = booking.publicPhoneProvisionalHandoff(draft, { checkin_session_id: 'jycs_synthetic' }, { token: 'synthetic' });
  const [entryItem, comboItem, socksItem] = plain(handoff.booking.items);
  assert.equal(entryItem.bandColour.id, 'morkbla');
  assert.equal(entryItem.packageContents, undefined);
  assert.deepEqual(comboItem.packageContents, comboContents, 'two 60-minute bands now, one pizza later (D0207)');
  assert.deepEqual([comboItem.quantity, comboItem.bandColour.id, comboItem.bandColour.endTime], [1, 'morkbla', '13:00']);
  assert.equal(socksItem.bandColour, undefined);
  assert.equal(socksItem.packageContents, undefined);
  assert.deepEqual(plain(withGuestBookingDetails({ items: handoff.booking.items }).items), plain(handoff.booking.items),
    'the purchase already has the projection a looked-up booking gets');
});

test('the kiosk purchase status carries the same band colours and Combo contents as a kiosk lookup', () => {
  const { publicKioskPaymentStatus } = require('../booking/kiosk-terminal-contract');
  const status = publicKioskPaymentStatus({ booking_confirmation_status: 'pending', checkin_session_id: 'jycs_kiosk',
    payment_attempt_id: 'jytp_123456789012345678', payment_attempt_status: 'approved', roller_draft_unique_id: 'draft-k',
    items_summary: JSON.stringify(purchaseItems), status: 'payment_pending' });
  const items = plain(status.provisionalHandoff.booking.items);
  assert.deepEqual(items.map((item) => item.bandColour?.id ?? null), ['morkbla', 'morkbla', null]);
  assert.deepEqual(items[1].packageContents, comboContents);
  assert.deepEqual(items[0].bandColour, plain(bandColourForAdmission({ startTime: '11:30', durationMinutes: 90 })));
  assert.equal(publicKioskPaymentStatus({ payment_attempt_status: 'approved', status: 'payment_pending' }).provisionalHandoff, undefined);
});

test('purchase items use Cloud’s verified product definitions; a Combo name alone never becomes a band', () => {
  for (const [label, item, expected] of [
    ['entry definition', { productType: 'entry', durationMinutes: 120, startTime: '13:30' }, 'gul'],
    ['family definition', { productType: 'family', durationMinutes: 60, startTime: '14:00', endTime: '15:00' }, 'svart-rod'],
    ['ROLLER parent type', { productType: null, parentType: 'sessionpass', durationMinutes: 90, startTime: '11:30' }, 'morkbla'],
    ['unverified Combo', { productId: '1318777', productType: 'combo', durationMinutes: 60, startTime: '12:00' }, null],
    ['add-on', { productType: 'addon', durationMinutes: 60, startTime: '12:00' }, null],
    ['entry off the chart', { productType: 'entry', durationMinutes: 60, startTime: '19:30' }, null],
  ]) assert.equal(withBandColour({ quantity: 1, ...item }).bandColour?.id ?? null, expected, label);
});

test('the scheme is Nacka’s, the only venue every Park configuration serves', () => {
  assert.equal(BAND_COLOUR_SCHEME.venueId, '50871');
  const configDir = path.resolve(lambdaRoot, '..', 'config');
  const venues = [];
  const collect = (value, key = '') => {
    if (value && typeof value === 'object') for (const [child, nested] of Object.entries(value)) collect(nested, child);
    else if (/venueid$/i.test(key) && value) venues.push(String(value));
  };
  for (const file of fs.readdirSync(configDir).filter((name) => /^park-test.*\.json$/.test(name))) {
    collect(JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8')));
  }
  assert.ok(venues.length >= 4);
  assert.deepEqual([...new Set(venues)], [BAND_COLOUR_SCHEME.venueId],
    'another venue needs its own band scheme before it is served (D0233)');
});

test('staff manifest: admission rows carry the colour, other goods never do', () => {
  const day = '2026-10-01';
  const raw = (overrides) => ({ rollerUniqueId: 'b1', bookingItemId: 'i1', productId: 'p1', productName: 'Biljetter',
    parentProductName: 'Entré 90 min', quantity: 3, bookingDate: day, summary: { productType: 'sessionpass' },
    startTime: '11:30:00', endTime: '13:00:00', ...overrides });
  const manifest = buildManifest([
    raw(),
    raw({ bookingItemId: 'i2', parentProductName: 'Entré 60 min', quantity: 1, endTime: '12:30:00', selectedUnits: 1 }),
    raw({ bookingItemId: 'i3', productId: '1242136', parentProductId: '1242135', productName: 'Weekday Combo',
      parentProductName: 'Weekday Combo', quantity: 1, startTime: '13:00:00', endTime: '15:00:00' }),
    raw({ bookingItemId: 'i4', productName: 'Bryggkaffe', parentProductName: null, summary: { productType: 'food' } }),
    raw({ bookingItemId: 'i5', startTime: '19:30:00', endTime: '20:30:00' }),
  ], day);
  assert.deepEqual(manifest.map((item) => [item.bookingItemId, item.kind, item.bandColour?.id ?? null]), [
    ['i1', 'admission', 'morkbla'], ['i2', 'admission', 'rod'], ['i3', 'admission', 'svart'], ['i3', 'pizza', null],
    ['i4', 'coffee', null], ['i5', 'admission', null],
  ]);
  assert.deepEqual(groupBandColours(manifest).map(({ id, quantity }) => [id, quantity]),
    [['morkbla', 3], ['rod', 1], ['svart', 2]]);
});

test('staff board rows summarise the colours with the admission count', async () => {
  const day = '2026-10-01';
  const catalog = [
    { rollerUniqueId: 'b1', bookingItemId: 'i1', productId: 'p1', productName: 'Biljetter', parentProductName: 'Entré 90 min',
      quantity: 2, bookingDate: day, startTime: '11:30:00', endTime: '13:00:00', selectedUnits: null, summary: { productType: 'sessionpass' } },
    { rollerUniqueId: 'b1', bookingItemId: 'i2', productId: 'p2', productName: 'Biljetter', parentProductName: 'Entré 120 min',
      quantity: 1, bookingDate: day, startTime: '13:30:00', endTime: '15:30:00', selectedUnits: null, summary: { productType: 'sessionpass' } },
    { rollerUniqueId: 'b1', bookingItemId: 'i3', productId: 'p3', productName: 'JumpSocks', quantity: 3, bookingDate: day,
      startTime: '11:30:00', endTime: '13:00:00', selectedUnits: null, summary: { productType: 'addon' } },
  ];
  const queries = [];
  const board = createStaffBoard({
    executeStatement: async (query) => { queries.push(query); return [{ board_cursor: 'b1', visit_date: day, handout_catalog: JSON.stringify(catalog) }]; },
    mappedRows: (rows) => rows,
    stringParameter: (name, value) => ({ name, value }),
    mapSession: () => ({ checkinSessionId: 'booking:b1', counts: { tickets: 3 } }),
  });
  const { sessions } = await board.list({ day, search: null, cursor: null, venueId: '50871' });
  assert.match(queries[0], /'startTime', i\.start_time::text, 'endTime', i\.end_time::text/);
  assert.equal(sessions[0].counts.admission, 3);
  assert.deepEqual(sessions[0].bandColours.map(({ id, quantity, name }) => [id, quantity, name.sv]),
    [['morkbla', 2, 'Mörkblå'], ['gul', 1, 'Gul']]);
});

test('isolated Lambda assets contain the exact canonical scheme', () => {
  const canonical = fs.readFileSync(path.join(__dirname, 'band-colours.js'), 'utf8');
  for (const name of ['booking', 'lookup', 'session', 'redeem']) {
    assert.equal(fs.readFileSync(path.join(lambdaRoot, name, 'band-colours.js'), 'utf8'), canonical, name);
  }
});
