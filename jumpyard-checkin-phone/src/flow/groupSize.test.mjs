import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import { ADDON_MAX_QUANTITY } from './addonCatalog.ts';
import { MAX_JUMPERS_PER_PURCHASE, getMaxBookingProductQuantity } from './productVisibility.ts';

// #549 (D0272, Love 2026-10-15): "vi måste låsa upp så man kan köpa upp till 20 entreer, att man alltid
// kan köpa hur många skyrides, vatten, kaffe och hänglås som man vill oavsett antal entreer", then
// "Ja, kör 50." for 50 entries.
const buySource = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
const offerSource = fs.readFileSync(new URL('../components/AddonsOffer.tsx', import.meta.url), 'utf8');
const buyAst = ts.createSourceFile('BuyTickets.tsx', buySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function declaration(name) {
  let found;
  function visit(node) {
    if (!found && ts.isFunctionDeclaration(node) && node.name?.getText(buyAst) === name) found = node.getText(buyAst);
    ts.forEachChild(node, visit);
  }
  visit(buyAst);
  assert.ok(found, `Missing BuyTickets declaration ${name}`);
  return found;
}

function compile(names, globals) {
  const context = vm.createContext(globals);
  const code = `${names.map(declaration).join('\n')}\nglobalThis.handlers = { ${names.join(', ')} };`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.handlers;
}

function product(overrides = {}) {
  return {
    available: true, capacityRemaining: null, durationMinutes: 60, endTime: '15:00', jumpersPerUnit: 1, key: 'E60',
    label: '60 min entré', onlineSalesOpen: true, parentProductId: 'parent-1', productId: '1189812', productName: 'Entré',
    requiresAvailability: true, startTime: '14:00', type: 'entry', unitPrice: 199, unitPriceCents: 19900, ...overrides,
  };
}

const addon = (id, overrides = {}) => ({
  id, label: id, price: 20, unit: 'st', maxPerGuest: 4, icon: 'water', rollerProductId: 1000, requiresAvailability: false,
  ...overrides,
});

const handlers = compile(['getAddonMaxQuantity'], {
  ADDON_MAX_QUANTITY, SOCKS_UNLIMITED_MAX: Number.MAX_SAFE_INTEGER, Math,
});

test('a purchase holds up to 50 jumpers: 50 entries, 25 combos or 12 families', () => {
  assert.equal(MAX_JUMPERS_PER_PURCHASE, 50);
  assert.equal(getMaxBookingProductQuantity(product()), 50, 'no capacity figure: 50 entries');
  assert.equal(getMaxBookingProductQuantity(product({ capacityRemaining: 120 })), 50);
  assert.equal(getMaxBookingProductQuantity(product({ capacityRemaining: 34 })), 34, 'ROLLER capacity still applies');
  assert.equal(getMaxBookingProductQuantity(product({ capacityRemaining: 0 })), 0);
  assert.equal(getMaxBookingProductQuantity(product({ type: 'combo', jumpersPerUnit: 2, capacityRemaining: 120 })), 25);
  assert.equal(getMaxBookingProductQuantity(product({ type: 'family', jumpersPerUnit: 4, capacityRemaining: 120 })), 12);
  assert.equal(getMaxBookingProductQuantity(product({ type: 'family', jumpersPerUnit: 4 })), 12);
  assert.equal(getMaxBookingProductQuantity(product({ type: 'family', jumpersPerUnit: 4, capacityRemaining: 9 })), 2);
  assert.equal(getMaxBookingProductQuantity(product({ available: false })), 0);
});

test('SkyRider, water, coffee and padlocks go up to 99 whatever the number of jumpers', () => {
  assert.equal(ADDON_MAX_QUANTITY, 99);
  for (const id of ['water_bottle', 'coffee', 'lock']) {
    assert.equal(handlers.getAddonMaxQuantity(addon(id), null), 99, id);
  }
  const skyrider = addon('skyrider', { requiresAvailability: true });
  const slot = (capacityRemaining, available = true) => ({ ...product({ key: 'skyrider' }), available, capacityRemaining });
  assert.equal(handlers.getAddonMaxQuantity(skyrider, slot(null)), 99);
  assert.equal(handlers.getAddonMaxQuantity(skyrider, slot(150)), 99);
  assert.equal(handlers.getAddonMaxQuantity(skyrider, slot(30)), 30, "ROLLER's free SkyRider places still apply");
  assert.equal(handlers.getAddonMaxQuantity(skyrider, slot(0)), 0);
  assert.equal(handlers.getAddonMaxQuantity(skyrider, slot(30, false)), 0);
  assert.equal(handlers.getAddonMaxQuantity(skyrider, null), 0);
  // The maximum no longer takes the number of jumpers at all.
  assert.match(declaration('getAddonMaxQuantity'), /^function getAddonMaxQuantity\(\s*addon: BuyAddonEntry,\s*addonAvailability: NewBookingProduct \| null\s*\)/);
  assert.doesNotMatch(buySource, /jumperCount \* addon\.maxPerGuest/);
});

test('the socks rule is unchanged', () => {
  // A purchase: as many pairs as the guest wants, next to the jumpers, and the reminder as before.
  assert.equal(handlers.getAddonMaxQuantity(addon('socks'), null), Number.MAX_SAFE_INTEGER);
  assert.match(buySource, /max=\{socksEntry \? getBuyAddonMax\(socksEntry\) : 0\}/);
  assert.match(buySource, /if \(shouldRemindAboutSocks\(\{\s*socksAvailable: socksSellable,\s*socksQuantity: addonQty\.socks,/);
  // An existing booking: still up to four pairs per guest.
  assert.match(offerSource, /max=\{Math\.max\(minQty\.socks, 1, guestCount \* \(socksEntry\?\.maxPerGuest \?\? 0\)\)\}/);
});

test('fewer jumpers no longer lowers the add-ons, and an existing booking takes 99 of each', () => {
  const update = buySource.slice(buySource.indexOf('const updateQuantity = '), buySource.indexOf('const setOneAddon = '));
  assert.match(update, /setQuantity\(clampedQuantity\);/);
  assert.doesNotMatch(update, /setAddonQty/);
  assert.match(offerSource, /included: minQty\[entry\.id\], max: Math\.max\(minQty\[entry\.id\], ADDON_MAX_QUANTITY\),/);
  assert.doesNotMatch(offerSource, /guestCount \* entry\.maxPerGuest/);
});
