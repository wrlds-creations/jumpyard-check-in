import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const localRequire = id => {
    if (!id.startsWith('.') && !id.startsWith('@/')) return require(id);
    const base = id.startsWith('@/') ? id.slice(2) : path.posix.join(path.posix.dirname(name), id);
    const file = ['.ts', '.tsx'].map(ext => base + ext).find(candidate => fs.existsSync(new URL('../' + candidate, import.meta.url)));
    assert.ok(file, `unresolved import ${id} from ${name}`);
    return load(file);
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(localRequire, mod, mod.exports);
  cache.set(name, mod.exports);
  return mod.exports;
}

const { withPackageContents } = require('../../../infra/lambda/shared/package-contents.js');
const cloud = load('flow/cloudClient.ts');
const projection = load('flow/packageContents.ts');
const { LanguageProvider } = load('context/LanguageContext.tsx');
const { ConfirmationScreen } = load('components/ConfirmationScreen.tsx');
const { BookingSummary } = load('components/BookingSummary.tsx');
const { PackageContentRows } = load('components/PackageContentRows.tsx');

const baseItem = {
  productId: '1242136', parentProductId: '1242135', productName: 'Weekday Combo', parentProductName: 'Weekday Combo',
  productType: 'sessionpass', quantity: 1, bookingDate: '2026-09-03', startTime: '17:00', endTime: '18:00', tickets: [{ ticketId: 'A' }, { ticketId: 'B' }],
};
const item = (quantity = 1, overrides = {}) => withPackageContents({ ...baseItem, quantity, ...overrides });
const response = items => ({ status: 'found', booking: {
  bookingReference: 'DEMO367', rollerUniqueId: 'preview-only', paymentStatus: 'Paid', amountOwing: 0, items,
}, eligibility: { canCheckIn: true, reason: 'ready', paymentState: 'paid' }, guestAccess: { token: 'preview-only' } });

async function fromCloud(items, resume = false) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(resume
    ? { ...response(items), status: 'session_resumed', session: { checkinSessionId: 'preview-only', status: 'active', handoffCode: 'DEMO' } }
    : response(items)) });
  try { return resume ? (await cloud.resolveCheckInSessionLink('preview-only')).booking : await cloud.lookupBooking('DEMO367'); }
  finally { globalThis.fetch = originalFetch; }
}

function render(component, props, lang = 'sv') {
  globalThis.window = { localStorage: { getItem: () => lang } };
  try { return renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(component, props))); }
  finally { delete globalThis.window; }
}

test('lookup counts two people per package while keeping pizza out of purchasable add-ons', async () => {
  for (const quantity of [1, 2]) {
    const original = item(quantity);
    const before = structuredClone(original);
    const booking = await fromCloud([original]);
    assert.equal(booking.jumpers, quantity * 2);
    assert.equal(booking.productType, 'combo');
    assert.deepEqual(booking.existingAddons, []);
    assert.deepEqual(original, before);
    const rows = projection.getBookingContentRows(booking, 'Entry', booking.jumpers, 'sv');
    assert.deepEqual(rows.map(({ kind, quantity, collection }) => [kind, quantity, collection]), [
      ['admission', quantity * 2, 'checkin'], ['pizza', quantity, 'later'],
    ]);
  }
});

test('mixed booking preserves regular admission, coffee and linked socks without duplicating combo contents', async () => {
  const booking = await fromCloud([
    item(2),
    item(3, { productId: 'regular', parentProductId: 'ordinary', productName: '90 min', parentProductName: '90 min', endTime: '18:30' }),
    item(1, { productId: 'coffee', parentProductId: '', productName: 'Coffee', parentProductName: 'Coffee', productType: 'addon' }),
    item(2, { productId: 'socks', parentProductId: '', productName: 'Socks', parentProductName: 'Socks', productType: 'addon', fulfillmentSource: 'linked_add_on' }),
  ]);
  assert.equal(booking.jumpers, 7);
  assert.deepEqual(booking.existingAddons.map(({ id, qty }) => [id, qty]), [['coffee', 1], ['socks', 2]]);
  const rows = projection.getBookingContentRows(booking, 'Entry', 7, 'en');
  assert.deepEqual(rows.map(({ kind, quantity }) => [kind, quantity]), [['admission', 4], ['pizza', 2], ['admission', 3]]);
  assert.equal(rows[2].label, '90 min');
});

test('same package content survives guest session link resume', async () => {
  const lookup = await fromCloud([item(2)]);
  const resumed = await fromCloud([item(2)], true);
  assert.equal(resumed.jumpers, 4);
  assert.deepEqual(resumed.admissionItems, lookup.admissionItems);
});

test('unknown combo names, legacy products, family and normal entry do not acquire pizza', async () => {
  for (const productId of ['unknown', '1318778', 'family', 'entry']) {
    const booking = await fromCloud([item(3, { productId })]);
    assert.equal(booking.jumpers, 3);
    assert.equal(booking.admissionItems, undefined);
    assert.equal(projection.getBookingContentRows(booking, 'Entry', 3, 'sv').length, 1);
  }
});

test('actual Swedish/English QR screen separates bands from deferred pizza and coffee', async () => {
  const booking = await fromCloud([item()]);
  for (const [lang, band, pizza, later] of [
    ['sv', 'Besöksband 60 min', 'Pizza att dela', 'Hämtas efter hoppet'],
    ['en', 'Wristband 60 min', 'Pizza to share', 'Collect after jumping'],
  ]) {
    const markup = render(ConfirmationScreen, {
      booking, jumperCount: booking.jumpers, checkinSession: { checkinSessionId: 'preview-only', status: 'ready_for_staff', handoffCode: 'DEMO' },
      selectedAddons: [{ id: 'coffee', label: 'Coffee', qty: 1, price: 0 }, { id: 'socks', label: 'Socks', qty: 2, price: 0 }],
    }, lang);
    assert.match(markup, /data-qr-value="JY_HANDOFF:DEMO:preview-only"/);
    const [handout, deferred] = markup.split('data-testid="confirmation-later"');
    assert.ok(handout.includes(band));
    assert.ok(handout.includes('Socks'));
    assert.ok(!handout.includes(pizza));
    assert.ok(deferred.includes(later));
    assert.ok(deferred.includes(pizza));
    assert.ok(deferred.includes('Coffee'));
    assert.match(handout, /text-primary">2<\/span>/);
    assert.match(deferred, /text-primary">1<\/span>/);
  }
});

test('booking summary and purchase breakdown render each included item with package-scaled quantities', async () => {
  const booking = await fromCloud([item(2)]);
  const summary = render(BookingSummary, { booking, onContinue() {} });
  assert.match(summary, /data-booking-content="admission"/);
  assert.match(summary, /data-booking-content="pizza"/);
  assert.match(summary, /Hämtas efter hoppet/);
  assert.match(summary, />x4<\/span>/);
  assert.match(summary, />x2<\/span>/);
  const scaled = projection.scalePackageContents(item().packageContents, 2);
  assert.deepEqual(scaled, item(2).packageContents);
  const purchase = render(PackageContentRows, { contents: scaled }, 'en');
  assert.match(purchase, /Wristband 60 min/);
  assert.match(purchase, /Pizza to share/);
  assert.match(purchase, /Collect after jumping/);
  assert.match(purchase, />x4<\/span>/);
  assert.match(purchase, />x2<\/span>/);
});

test('package display never enters booking purchase requests', async () => {
  const contents = item().packageContents;
  const original = structuredClone(contents);
  projection.scalePackageContents(contents, 2);
  assert.deepEqual(contents, original);
  const source = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  const buildItems = source.slice(source.indexOf('const buildItems ='), source.indexOf('const buildItems =') + 1200);
  assert.doesNotMatch(buildItems, /packageContents|admissionItems|pizza/);
  assert.equal((source.match(/<PackageContentRows contents=\{selectedPackageContents\}/g) || []).length, 3);
});
