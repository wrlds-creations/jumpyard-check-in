import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(`${page}\nexport { groupHandoutItems, ItemRows };`, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const loadedModule = { exports: {} };
vm.runInNewContext(compiled, {
  exports: loadedModule.exports,
  module: loadedModule,
  require(id) {
    if (id.startsWith('@/lib/')) return {};
    if (id === 'next/image') {
      return { __esModule: true, default: (props) => React.createElement('img', props) };
    }
    return require(id);
  },
}, { filename: 'staff-package-contents.tsx' });
const { groupHandoutItems, ItemRows } = loadedModule.exports;

function item(overrides = {}) {
  return {
    bookingDate: '2026-09-03',
    bookingItemId: 'combo-item',
    bookingItemKey: 'combo-item-key',
    durationMinutes: 60,
    endTime: '18:00',
    fulfillmentSource: 'original',
    parentProductId: '1242135',
    parentProductName: 'Weekday Combo',
    parentType: 'combo',
    productId: '1242136',
    productName: 'Weekday Combo',
    quantity: 1,
    startTime: '17:00',
    ...overrides,
  };
}

function combo(quantity = 1, overrides = {}) {
  return item({
    quantity,
    packageContents: [
      { kind: 'admission', quantity: 2 * quantity, collection: 'checkin', durationMinutes: 60 },
      { kind: 'pizza', quantity, collection: 'later' },
    ],
    ...overrides,
  });
}

function find(groups, key) {
  return groups.find((group) => group.key === key);
}

for (const quantity of [1, 2]) {
  test(`${quantity} Weekday Combo package(s) use server content totals without counting packages again`, () => {
    const source = combo(quantity);
    const before = structuredClone(source);
    const groups = groupHandoutItems([source]);
    assert.equal(groups.length, 2);
    assert.equal(find(groups, 'wristband-60-min').quantity, 2 * quantity);
    assert.equal(find(groups, 'wristband-60-min').section, 'checkin');
    assert.equal(find(groups, 'pizza').quantity, quantity);
    assert.equal(find(groups, 'pizza').section, 'later');
    assert.match(find(groups, 'pizza').note, /Hämtas efter hoppet/);
    assert.equal(find(groups, 'wristband-60-min').items[0], source);
    assert.equal(find(groups, 'pizza').items[0], source);
    assert.deepEqual(source, before, 'presentation must preserve provider identity and package quantity');
  });
}

test('mixed original and linked contents preserve quantities, provenance and normal add-on grouping', () => {
  const original = combo();
  const linked = combo(1, {
    fulfillmentSource: 'linked_add_on',
    bookingItemId: 'linked-combo',
    bookingItemKey: 'linked-combo-key',
    linkedBookingReference: 'linked-reference',
    linkedRollerUniqueId: 'linked-booking',
  });
  const entry = item({ parentProductName: 'Entré 60 min', productName: 'Entry', productId: 'entry', parentType: 'admission' });
  const socks = item({ parentProductName: 'Strumpor', productId: 'socks', parentType: 'stock', quantity: 2 });
  const coffee = item({ parentProductName: 'Kaffe', productId: 'coffee', parentType: 'stock' });
  const groups = groupHandoutItems([entry, original, linked, socks, coffee]);
  assert.equal(find(groups, 'wristband-60-min').quantity, 5);
  assert.equal(find(groups, 'pizza').quantity, 2);
  assert.equal(find(groups, 'socks').quantity, 2);
  assert.equal(find(groups, 'coffee').quantity, 1);
  assert.equal(find(groups, 'coffee').section, 'later');
  assert.equal(find(groups, 'wristband-60-min').hasLinkedAddOn, true);
  assert.equal(find(groups, 'pizza').hasLinkedAddOn, true);
  assert.equal(find(groups, 'pizza').items[1].linkedRollerUniqueId, 'linked-booking');
  const markup = renderToStaticMarkup(React.createElement(ItemRows, { items: [entry, original, linked, socks, coffee] }));
  assert.match(markup, /Entré 60 min, Weekday Combo/);
  assert.match(markup, /Tillägg/);
});

test('package-like names without server contents and unknown products retain the existing fallback', () => {
  const lookalike = item({ parentProductId: 'unverified', productId: 'unverified-child' });
  const family = item({ parentProductName: 'Familj 90 min', productId: 'family', durationMinutes: 90, quantity: 4 });
  const unknown = item({ parentProductName: 'Mystery product', productName: null, parentType: null, productId: 'mystery', parentProductId: 'unknown' });
  const groups = groupHandoutItems([lookalike, family, unknown]);
  assert.equal(find(groups, 'pizza'), undefined);
  assert.equal(find(groups, 'wristband-60-min').quantity, 1);
  assert.equal(find(groups, 'wristband-90-min').quantity, 4);
  assert.equal(find(groups, 'product-mystery').section, 'other');
  assert.equal(find(groups, 'product-mystery').label, 'Mystery product');
});

test('actual Handoff rows render two wristbands at check-in and pizza only in the later section', () => {
  const markup = renderToStaticMarkup(React.createElement(ItemRows, { items: [combo()] }));
  const checkin = markup.match(/<section data-testid="handout-section-checkin"[\s\S]*?<\/section>/)?.[0];
  const later = markup.match(/<section data-testid="handout-section-later"[\s\S]*?<\/section>/)?.[0];
  assert.ok(checkin);
  assert.ok(later);
  assert.match(checkin, /Besöksband 60 min/);
  assert.match(checkin, />2 st</);
  assert.doesNotMatch(checkin, /data-handout-category="pizza"|Pizza att dela/);
  assert.match(later, /data-handout-category="pizza"/);
  assert.match(later, /Pizza att dela/);
  assert.match(later, />1 st</);
  assert.match(later, /Ingår i Weekday Combo\. Hämtas efter hoppet\./);
  assert.doesNotMatch(markup, /data-handout-category="socks"|data-handout-category="coffee"|data-handout-category="water-bottle"/);
});
