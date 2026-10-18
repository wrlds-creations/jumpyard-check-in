'use strict';

// GH-571 (D0281): ROLLER's API never redeems a party package (kalas), so Cloud never checks a kalas in. Kassan
// checks it in. "Hitta bokning" and a scanned booking (the Lookup Lambda) answer `party_package` instead of
// ready, so the phone and the kiosk show the kalas guest a glad "ask the staff" screen. The check-in start
// refuses a kalas too (links, old kiosks), and the staff board marks every kalas from the morning, paid or not.
// The kalas mark comes from ROLLER's catalog: the package has productType partypackage, and its "Antal" variant
// carries it only as the catalog's parentType.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const LOOKUP_DIR = path.join(ROOT, 'infra', 'lambda', 'lookup');
const SESSION_DIR = path.join(ROOT, 'infra', 'lambda', 'session');
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function fakeAws() {
  return new Proxy({}, {
    get(_target, property) {
      return class FakeAwsClientOrCommand {
        constructor(input) { this.input = input; this.name = String(property); }
        async send() { throw new Error(`Unexpected AWS call ${String(property)} during GH-571 validation.`); }
      };
    },
  });
}

function load(dir, names) {
  const file = path.join(dir, 'index.js');
  const module = { exports: {} };
  vm.runInNewContext(`${fs.readFileSync(file, 'utf8')}\nmodule.exports.__gh571 = { ${names.join(', ')} };`, {
    AbortSignal, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports, module,
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:synthetic', DATABASE_SECRET_ARN: 'arn:synthetic' } },
    require(moduleId) {
      if (moduleId.startsWith('./')) return require(path.join(dir, moduleId));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAws();
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-571 validation.`);
    },
  }, { filename: file });
  return module.exports.__gh571;
}

// Lookup items as both lookup paths give them: productType falls back to the catalog's parentType.
const lookupItem = (productType, extra = {}) => ({ productType, productName: 'Antal', parentProductName: 'MIDI 1 timme och 40 minuter',
  bookingDate: TODAY, quantity: 2, tickets: [{ ticketId: 'k1' }, { ticketId: 'k2' }], ...extra });
const lookupBooking = (items, extra = {}) => ({ status: 'Paid', paymentStatus: 'Paid', amountOwing: 0, items, ...extra });

test('lookup: a kalas answers party_package and is never ready', () => {
  const { evaluateEligibility } = load(LOOKUP_DIR, ['evaluateEligibility']);
  const kalas = evaluateEligibility(lookupBooking([lookupItem('partypackage'),
    lookupItem('addon', { productName: 'Godispåse', parentProductName: 'Extra Födelsedagsfest' })]), { expectedDate: TODAY });
  assert.equal(kalas.canCheckIn, false);
  assert.equal(kalas.reason, 'party_package');
  assert.equal(kalas.requiresStaff, true);
  for (const variant of ['PartyPackage', 'party_package', 'Party Package']) {
    assert.equal(evaluateEligibility(lookupBooking([lookupItem(variant)]), {}).reason, 'party_package', variant);
  }
  assert.equal(evaluateEligibility(lookupBooking([lookupItem('sessionpass', { productName: 'Biljetter (180 kr)' })]),
    { expectedDate: TODAY }).reason, 'ready', 'an ordinary booking is unchanged');
  // A kalas that still owes money is a kalas first; a kalas on another day keeps the date message.
  assert.equal(evaluateEligibility(lookupBooking([lookupItem('partypackage')], { amountOwing: 500, paymentStatus: 'PartiallyPaid' }),
    {}).reason, 'party_package');
  assert.equal(evaluateEligibility(lookupBooking([lookupItem('partypackage')]), { expectedDate: '2099-01-01' }).reason, 'wrong_date');
  // Without the catalog's mark (for example an expired cache) nothing is blocked; ROLLER's refusal then shows in the staff app.
  assert.equal(evaluateEligibility(lookupBooking([lookupItem(null)]), { expectedDate: TODAY }).reason, 'ready');
});

const sessionTicket = (overrides = {}) => ({ ticketId: 't1', bookingDate: TODAY, redeemStatusLastSeen: null,
  ticketProductType: null, ticketProductSubType: null, itemProductType: null, itemProductSubType: null, itemParentType: null,
  productCatalogType: null, productCatalogSubType: null, productCatalogParentType: null,
  ticketSource: 'scheduled_data_api_sync_tickets', ...overrides });
const sessionContext = (tickets, booking = {}) => ({ booking: { bookingDate: TODAY, bookingStatus: 'Paid', paymentStatus: 'Paid',
  amountOwingCents: 0, freshnessStatus: 'fresh', isTombstoned: false, ...booking }, tickets });

test('check-in start: a kalas is refused with party_package, before payment, date and ticket checks', () => {
  const { evaluateStartContext } = load(SESSION_DIR, ['evaluateStartContext']);
  const request = { expectedDate: TODAY, ticketIds: [] };
  // The "Antal" variant: only the catalog's parentType says partypackage.
  const antal = evaluateStartContext(sessionContext([sessionTicket({ productCatalogParentType: 'partypackage' }),
    sessionTicket({ ticketId: 't2', productCatalogType: 'addon' })]), request);
  assert.equal(antal.canStart, false);
  assert.equal(antal.reason, 'party_package');
  for (const field of ['ticketProductType', 'itemProductType', 'itemParentType', 'productCatalogType']) {
    assert.equal(evaluateStartContext(sessionContext([sessionTicket({ [field]: 'PartyPackage' })]), request).reason, 'party_package', field);
  }
  assert.equal(evaluateStartContext(sessionContext([sessionTicket({ productCatalogParentType: 'partypackage' })],
    { amountOwingCents: 50000, paymentStatus: 'PartiallyPaid' }), request).reason, 'party_package', 'a kalas owing money');
  assert.equal(evaluateStartContext(sessionContext([sessionTicket({ itemProductType: 'sessionpass' })]), request).reason, 'ready');
  // Inactive and not-fresh bookings keep their own answers.
  assert.equal(evaluateStartContext(sessionContext([sessionTicket({ productCatalogParentType: 'partypackage' })],
    { bookingStatus: 'Cancelled' }), request).reason, 'booking_not_active');
});

test('check-in start answers 409 party_package, and pre-arrival emails skip a kalas', () => {
  const source = fs.readFileSync(path.join(SESSION_DIR, 'index.js'), 'utf8');
  assert.match(source, /blocked\('party_package', 'A kalas is checked in at kassan, not on the phone or kiosk\.'/);
  // The generic blocked answer carries the reason as the error code.
  assert.match(source, /return jsonResponse\(409, correlationId, \{\s*status: 'blocked',\s*error: \{\s*code: decision\.reason,/);
  // Pre-arrival email eligibility goes through the same start decision, so a kalas gets no check-in email.
  assert.match(source, /const decision = evaluateStartContext\(context, \{ expectedDate: candidate\.booking_date, ticketIds: \[\] \}\);/);
});

test('staff board: every kalas is marked from the morning, paid or not, with its package size', () => {
  const source = fs.readFileSync(path.join(SESSION_DIR, 'staff-board.js'), 'utf8');
  const kalasColumn = source.slice(source.indexOf('GH-571 (D0281)'), source.indexOf('AS kalas_products') + 'AS kalas_products'.length);
  assert.match(kalasColumn, /FROM jumpyard\.roller_booking_items i/);
  assert.match(kalasColumn, /lower\(kalas_catalog\.summary ->> 'parentType'\)/, 'the Antal variant is marked through the catalog');
  assert.doesNotMatch(kalasColumn, /paidBookingSql/, 'a kalas that still owes money is marked too');
  assert.match(source, /kalas: kalasOf\(row\.kalas_products\),/);
  const kalasOf = new Function(`${source.match(/function kalasOf[\s\S]*?\n\}/)[0]}; return kalasOf;`)();
  assert.deepEqual(kalasOf('MIDI 1 timme och 40 minuter'), { package: 'MIDI' });
  assert.deepEqual(kalasOf('Extra Födelsedagsfest|MAXI 2 timmar och 40 minuter (SkyRider)'), { package: 'MAXI' });
  assert.deepEqual(kalasOf('mini 1 timme och 40 minuter'), { package: 'MINI' });
  assert.deepEqual(kalasOf('Kalaspaket'), { package: null }, 'a kalas without a size in its name is still a kalas');
  assert.deepEqual(kalasOf('MINIMAL'), { package: null });
  assert.equal(kalasOf(null), null, 'no kalas items, no mark');
});

test('the kalas block is documented in the contract', () => {
  const contract = fs.readFileSync(path.join(ROOT, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8');
  assert.match(contract, /party_package/);
  assert.match(contract, /#571/);
});
