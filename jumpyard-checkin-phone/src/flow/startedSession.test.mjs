import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import { ADDON_CATALOG_CONFIG, ADDON_MAX_QUANTITY, BUY_ENTRY_ADDON_IDS } from './addonCatalog.ts';
import { findRecoveredBookingProduct, getMaxBookingProductQuantity } from './productVisibility.ts';
import { isSessionStartedError } from './sessionStarted.ts';
import { findAvailabilitySlot, getSlotCapacity, isSlotSelectable, isStartedSlotShown } from './slotCapacity.ts';
import { JUST_STARTED_MINUTES, buildSlotTimes, formatStartsIn, minutesUntil } from './slotClock.ts';

// GH-557 (D0273): a session can be bought until 10 minutes after its start, as on JumpYard's website, and a
// time ROLLER stopped selling after it began leads to "Tiden har redan börjat" and back to the contact step.
const buySource = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
const buyAst = ts.createSourceFile('BuyTickets.tsx', buySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const copyFile = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function declaration(name) {
  let found;
  function visit(node) {
    if (!found && (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(buyAst) === name) {
      found = ts.isFunctionDeclaration(node) ? node.getText(buyAst) : `const ${name} = ${node.initializer.getText(buyAst)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(buyAst);
  assert.ok(found, `Missing BuyTickets declaration ${name}`);
  return found;
}

function compile(names, globals, exportsLine) {
  const context = vm.createContext(globals);
  const code = names.map(declaration).join('\n') + `\nglobalThis.handlers = { ${exportsLine ?? names.join(', ')} };`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.handlers;
}

test('the time step offers a start for 10 minutes after it began, then the next three half hours', () => {
  assert.equal(JUST_STARTED_MINUTES, 10);
  assert.deepEqual(buildSlotTimes('13:59'), ['14:00', '14:30', '15:00']);
  assert.deepEqual(buildSlotTimes('14:00'), ['14:00', '14:30', '15:00'], 'a start this minute is one of the next three');
  assert.deepEqual(buildSlotTimes('14:01'), ['14:00', '14:30', '15:00', '15:30']);
  assert.deepEqual(buildSlotTimes('14:05'), ['14:00', '14:30', '15:00', '15:30']);
  assert.deepEqual(buildSlotTimes('14:09'), ['14:00', '14:30', '15:00', '15:30']);
  assert.deepEqual(buildSlotTimes('14:10'), ['14:30', '15:00', '15:30'], 'gone 10 minutes after the start');
  assert.deepEqual(buildSlotTimes('14:29'), ['14:30', '15:00', '15:30']);
  assert.deepEqual(buildSlotTimes('14:34'), ['14:30', '15:00', '15:30', '16:00']);
  assert.deepEqual(buildSlotTimes('14:40'), ['15:00', '15:30', '16:00']);
  assert.deepEqual(buildSlotTimes(new Date(2026, 9, 15, 14, 4, 50)), ['14:00', '14:30', '15:00', '15:30'], 'the phone clock');
  assert.deepEqual(buildSlotTimes('23:05'), ['23:00', '23:30'], 'never past midnight');
  assert.deepEqual(buildSlotTimes('not a time'), []);
});

test('a time that has begun reads "Har precis börjat"; the old copy still says "startar nu"', () => {
  const sv = { startsIn: 'om {time}', startsNow: 'startar nu', justStarted: 'Har precis börjat' };
  assert.equal(formatStartsIn(-4, sv), 'Har precis börjat');
  assert.equal(formatStartsIn(0, sv), 'startar nu');
  assert.equal(formatStartsIn(26, sv), 'om 26 min');
  assert.equal(formatStartsIn(-4, { startsIn: 'om {time}', startsNow: 'startar nu' }), 'startar nu');
  assert.match(copyFile, /justStarted: 'Har precis börjat',/);
  assert.match(copyFile, /justStarted: 'Just started',/);
});

test('Cloud\'s session_started, or an older Cloud\'s refusal of a time that has begun, opens the new-time path', () => {
  const message = (time) => `Product 1189808 is not available for 2026-10-15 ${time}.`;
  assert.equal(isSessionStartedError({ code: 'session_started', message: message('14:00') }, '14:00', '14:11'), true);
  assert.equal(isSessionStartedError({ code: 'capacity_unavailable', message: message('14:00') }, '14:00', '14:11'), true,
    'a Cloud from before #557');
  assert.equal(isSessionStartedError({ code: 'capacity_unavailable', message: message('14:30') }, '14:30', '14:11'), false,
    'a full time that has not begun stays "full"');
  assert.equal(isSessionStartedError({ code: 'capacity_unavailable', message: message('14:00') }, '14:30', '14:41'), false,
    'another item\'s time');
  assert.equal(isSessionStartedError({ code: 'roller_draft_failed', message: 'x' }, '14:00', '14:11'), false);
  assert.equal(isSessionStartedError(null, '14:00', '14:11'), false);
  assert.equal(isSessionStartedError({ code: 'capacity_unavailable', message: message('14:00') }, '14:00', new Date(2026, 9, 15, 14, 11)), true);
});

test('the time step shows a started time while ROLLER lists it, full or not, and follows the clock', () => {
  assert.doesNotMatch(buySource, /function generateSlots/);
  assert.match(buySource, /const shownTimesKey = slotKey \|\| buildSlotTimes\(clock\)\.join\(','\);/);
  assert.match(buySource, /const slots = useMemo\(\(\) => \(shownTimesKey \? shownTimesKey\.split\(','\) : \[\]\), \[shownTimesKey\]\);/);
  assert.match(buySource, /const visibleSlots = slots\.filter\(\(time\) => \{[\s\S]*?if \(minutes === null \|\| minutes >= 0\) return true;[\s\S]*?if \(closedStartTimes\.includes\(time\)\) return false;[\s\S]*?return isStartedSlotShown\(findAvailabilitySlot\(availability, time\)\);/);
  assert.match(buySource, /\{visibleSlots\.map\(\(time\) => \{/);
  assert.match(buySource, /if \(!visibleSlotsKey\.split\(','\)\.includes\(selectedTime\)\) setSelectedTime\(null\);/);
});

// GH-567 (Love 2026-10-17): a full started time stays as "Fullt" until 10 minutes after its start, like the other
// full times; one ROLLER has closed with places left still disappears.
const sixty = (overrides = {}) => product({ key: 'E60', durationMinutes: 60, productId: '1189808', ...overrides });
const startedAt = (startTime, overrides) => ({ date: '2026-10-17', startTime, products: [sixty({ startTime, ...overrides })] });
const sellable = { available: true, capacityRemaining: 34 };
const full = { available: false, capacityRemaining: 0 };
// After the online sales cut-off ROLLER keeps the session's places (read-only check, 2026-10-15).
const closed = { available: false, capacityRemaining: 133, onlineSalesOpen: false };

test('a started time stays while ROLLER sells it or it is full, and goes once ROLLER has closed it with places left', () => {
  assert.equal(isStartedSlotShown(startedAt('14:00', sellable)), true, 'sellable');
  assert.equal(isStartedSlotShown(startedAt('14:00', { capacityRemaining: 4 })), true, 'few places');
  assert.equal(isStartedSlotShown(startedAt('14:00', full)), true, 'full while ROLLER still sells it: "Fullt"');
  assert.equal(isStartedSlotShown(startedAt('14:00', { capacityRemaining: 0 })), true, 'no places left');
  assert.equal(isStartedSlotShown(startedAt('14:00', closed)), false, 'ROLLER closed it with places left');
  assert.equal(isStartedSlotShown(startedAt('14:00', { ...full, onlineSalesOpen: false })), true, 'full and closed: still "Fullt"');
  assert.equal(isStartedSlotShown(startedAt('14:00', { ...closed, capacityRemaining: null })), false, 'closed without a number');
  assert.equal(isStartedSlotShown(null), false, 'no answer yet');
  assert.equal(isStartedSlotShown({ date: '2026-10-17', startTime: '14:00', products: [product()] }), false, 'no 60-minute entry');
  // The full started time reads "Fullt" and cannot be chosen, like the other full times.
  assert.deepEqual(getSlotCapacity(startedAt('14:00', full)), { state: 'full', remaining: 0 });
  assert.equal(isSlotSelectable(getSlotCapacity(startedAt('14:00', full))), false);
});

test('the real time list at 14:04 keeps a full 14:00 as "Fullt", hides a closed one, and keeps the other full times', () => {
  const availability = (started) => ({ date: '2026-10-17', slots: [
    startedAt('14:00', started), startedAt('14:30', sellable), startedAt('15:00', full), startedAt('15:30', sellable),
  ] });
  const listAt = (clock, started, closedStartTimes = []) => plain(compile(['visibleSlots'], {
    slots: ['14:00', '14:30', '15:00', '15:30'], clock, closedStartTimes, availability: availability(started),
    minutesUntil, isStartedSlotShown, findAvailabilitySlot,
  }).visibleSlots);
  assert.deepEqual(listAt('14:04', sellable), ['14:00', '14:30', '15:00', '15:30'], 'sellable, as before');
  assert.deepEqual(listAt('14:04', full), ['14:00', '14:30', '15:00', '15:30'], 'full: "Fullt", like 15:00');
  assert.deepEqual(listAt('14:04', closed), ['14:30', '15:00', '15:30'], 'closed by ROLLER: gone');
  assert.deepEqual(listAt('14:04', sellable, ['14:00']), ['14:30', '15:00', '15:30'], 'refused as started: gone');
  const loading = plain(compile(['visibleSlots'], {
    slots: ['14:00', '14:30', '15:00', '15:30'], clock: '14:04', closedStartTimes: [], availability: null,
    minutesUntil, isStartedSlotShown, findAvailabilitySlot,
  }).visibleSlots);
  assert.deepEqual(loading, ['14:30', '15:00', '15:30'], 'no answer yet: only the coming times');
});

test('every refusal on the contact step opens "Tiden har redan börjat" instead of the red line', () => {
  const sessionChecks = buySource.match(/isSessionStartedError\(error, (?:recoveredProduct|selectedProduct)\.startTime, clockNow \?\? new Date\(\)\)/g) ?? [];
  assert.equal(sessionChecks.length, 3, 'the restored quote, Applicera and the draft');
  assert.match(buySource, /<SessionStartedDialog open=\{startedSessionTime !== null && step === 'CONTACT'\} onChooseNewTime=\{chooseNewTime\} \/>/);
  const dialog = fs.readFileSync(new URL('../components/SessionStartedDialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /data-testid="session-started-new-time"/);
  assert.match(copyFile, /title: 'Tiden har redan börjat',\s*text: 'Välj en ny tid\. Det du har valt ligger kvar\.',\s*chooseNewTime: 'Välj ny tid',/);
  assert.match(copyFile, /title: 'This time has already started',\s*text: 'Choose a new time\. Your choices are kept\.',\s*chooseNewTime: 'Choose a new time',/);
});

test('"Välj ny tid" reads the times again once and keeps the purchase when a new time is chosen', () => {
  const calls = [];
  const record = (name) => (value) => calls.push([name, value]);
  const state = {
    rebookingRef: { current: false },
    invalidateQuote: () => calls.push(['invalidateQuote']),
    clearPaymentSyncState: () => calls.push(['clearPaymentSyncState']),
  };
  for (const name of ['setStartedSessionTime', 'setDraft', 'setSubmitError', 'setSelectedTime', 'setAvailabilityLoadedAt', 'setStep']) {
    state[name] = record(name);
  }
  const { chooseNewTime } = compile(['chooseNewTime'], state);
  chooseNewTime();
  assert.equal(state.rebookingRef.current, true);
  assert.deepEqual(plain(calls), [
    ['setStartedSessionTime', null], ['invalidateQuote'], ['setDraft', null], ['clearPaymentSyncState'],
    ['setSubmitError', null], ['setSelectedTime', null], ['setAvailabilityLoadedAt', null], ['setStep', 'TIMESLOT'],
  ]);
  // Choosing the new time keeps tickets, add-ons, name and codes.
  assert.match(buySource, /setAvailabilityError\(null\);\s*\/\/ GH-557: a new time after "Tiden har redan börjat" keeps tickets, add-ons, name and codes\.\s*if \(rebookingRef\.current\) return;\s*setSelectedProduct\(null\);/);
});

function product(overrides = {}) {
  return {
    available: true, capacityRemaining: 40, durationMinutes: 90, endTime: null, jumpersPerUnit: 1, key: 'E90', label: '90 min',
    onlineSalesOpen: true, parentProductId: '1189823', productId: '1189830', productName: 'Biljetter (Drop-In - 270 kr)',
    requiresAvailability: true, startTime: '14:00', type: 'entry', unitPrice: 270, unitPriceCents: 27000, ...overrides,
  };
}

function addonProduct(key, overrides = {}) {
  return {
    available: true, capacityRemaining: 20, durationMinutes: 0, endTime: null, jumpersPerUnit: 1, key, label: key,
    onlineSalesOpen: true, parentProductId: `p-${key}`, productId: `9${key.length}0`, productName: key,
    requiresAvailability: key === 'skyrider', startTime: '14:30', type: 'addon', unitPrice: 60, unitPriceCents: 6000, ...overrides,
  };
}

function rebookHarness({ newSlotProducts, quantity = 2, addonQty = { socks: 2, skyrider: 2 }, selected = product() }) {
  const steps = [];
  const set = {};
  const empty = { skyrider: 0, connected: 0, coffee: 0, extra_person: 0, lock: 0, socks: 0, water_bottle: 0 };
  const state = {
    rebookingRef: { current: true },
    selectedProduct: selected,
    quantity,
    addonQty: { ...empty, ...addonQty },
    t: { addons: { products: { skyriderLabel: 'SkyRider', socksLabel: 'Strumpor', waterBottleLabel: 'Vatten', lockLabel: 'Lås', coffeeLabel: 'Kaffe' }, perJumper: '/hoppare', perPerson: '/person', each: 'st' } },
    findAvailabilitySlot, findRecoveredBookingProduct, getMaxBookingProductQuantity,
    ADDON_CATALOG_CONFIG, ADDON_MAX_QUANTITY, BUY_ENTRY_ADDON_IDS, SOCKS_UNLIMITED_MAX: Number.MAX_SAFE_INTEGER, Map, Number, Math,
    goToStepAfterAddons: () => steps.push('AFTER_ADDONS'),
    setStep: (step) => steps.push(step),
  };
  for (const name of ['setSelectedProduct', 'setQuantity', 'setAddonQty', 'setSkyriderConsentConfirmed']) {
    state[name] = (value) => { set[name] = value; };
  }
  const { rebookPurchaseTo } = compile([
    'createEmptyAddonQty', 'getJumperCount', 'getAddonMaxQuantity', 'getAddonLabel', 'getAddonUnit', 'numberProductId',
    'isKnownBuyAddonId', 'getDynamicAddonProduct', 'getAddonAvailabilityById', 'getBuyAddonEntriesForSlot', 'isPricedAddon',
    'toRecoveryProduct', 'toRecoveryAddonQty', 'clampRecoveredAddonQty', 'rebookPurchaseTo',
  ], state, 'rebookPurchaseTo');
  const answer = { date: '2026-10-15', slots: [{ date: '2026-10-15', startTime: '14:30', products: newSlotProducts }] };
  rebookPurchaseTo('14:30', answer);
  return { steps, set, state };
}

const sameTimeProducts = (overrides = {}) => [
  product({ startTime: '14:30', productId: '1189829', productName: 'Biljetter (Drop-In - 250 kr)', unitPrice: 250, unitPriceCents: 25000, ...overrides }),
  addonProduct('socks', { requiresAvailability: false }),
  addonProduct('skyrider'),
];

test('the same ticket at the new time goes straight back to the contact step, priced for that time', () => {
  const host = rebookHarness({ newSlotProducts: sameTimeProducts() });
  assert.equal(host.state.rebookingRef.current, false);
  assert.deepEqual(host.steps, ['AFTER_ADDONS'], 'contact, or safety when it was not approved yet');
  assert.equal(host.set.setSelectedProduct.productId, '1189829', 'the 14:30 variant and price');
  assert.equal(host.set.setSelectedProduct.unitPrice, 250);
  assert.equal(host.set.setQuantity, 2);
  assert.equal(host.set.setAddonQty.socks, 2);
  assert.equal(host.set.setAddonQty.skyrider, 2);
  assert.equal('setSkyriderConsentConfirmed' in host.set, false, 'the SkyRider approval stands');
});

test('a ticket not sold at the new time opens the product step; fewer places open the quantity step', () => {
  const missing = rebookHarness({ newSlotProducts: [product({ key: 'E60', durationMinutes: 60, productId: '1189812', startTime: '14:30' })] });
  assert.deepEqual(missing.steps, ['PRODUCT']);
  assert.equal(missing.set.setSelectedProduct, null);
  const fewer = rebookHarness({ newSlotProducts: sameTimeProducts({ capacityRemaining: 1 }) });
  assert.deepEqual(fewer.steps, ['QUANTITY']);
  assert.equal(fewer.set.setQuantity, 1);
});

test('an add-on not sold at the new time opens the add-on step and drops the SkyRider approval', () => {
  const host = rebookHarness({ newSlotProducts: sameTimeProducts().map((entry) => (
    entry.key === 'skyrider' ? { ...entry, available: false, capacityRemaining: 0 } : entry)) });
  assert.deepEqual(host.steps, ['ADDONS']);
  assert.equal(host.set.setAddonQty.skyrider, 0);
  assert.equal(host.set.setSkyriderConsentConfirmed, false);
});
