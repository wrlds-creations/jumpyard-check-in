import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import {
  FEW_SPOTS_BELOW,
  SLOT_AVAILABILITY_REUSE_MS,
  availabilityCovers,
  findAvailabilitySlot,
  findSixtyMinuteEntry,
  getSlotCapacity,
  isAvailabilityFresh,
  isSlotSelectable,
} from './slotCapacity.ts';
import { isPopularBookingProduct, sortPopularFirst } from './productVisibility.ts';
import { formatClock, formatStartsIn, minutesUntil, msUntilNextMinute } from './slotClock.ts';

// #491 (workshop 2026-10-07): spots per start time, socks next to the jumpers, no summary step.
const buySource = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
const buyAst = ts.createSourceFile('BuyTickets.tsx', buySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

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

function product(overrides = {}) {
  return {
    available: true, capacityRemaining: 40, durationMinutes: 60, endTime: null, jumpersPerUnit: 1, key: 'E60', label: '60 min entré',
    onlineSalesOpen: true, parentProductId: 'p60', productId: '1001', productName: 'Entré 60 min', requiresAvailability: true,
    startTime: '14:00', type: 'entry', unitPrice: 200, unitPriceCents: 20000, ...overrides,
  };
}
const slot = (startTime, products) => ({ date: '2026-10-17', startTime, products });
// Values made inside the vm context have that realm's prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the 60-minute entry decides the slot: N spots, few under 10, full at 0 or when 60 min cannot be sold', () => {
  assert.equal(FEW_SPOTS_BELOW, 10);
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: 34 })])), { state: 'open', remaining: 34 });
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: 10 })])), { state: 'open', remaining: 10 });
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: 9 })])), { state: 'few', remaining: 9 });
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: 1 })])), { state: 'few', remaining: 1 });
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: 0, available: false })])), { state: 'full', remaining: 0 });
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: 0 })])), { state: 'full', remaining: 0 });
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: 30, available: false, onlineSalesOpen: false })])),
    { state: 'full', remaining: 0 }, 'closed online sales on 60 min also close the slot');
  // 60 min decides, even when 90 or 120 minutes still have room.
  const sixtyFull = slot('14:00', [product({ capacityRemaining: 0, available: false }),
    product({ key: 'E90', durationMinutes: 90, capacityRemaining: 12 }), product({ key: 'F60', type: 'family', capacityRemaining: 8 })]);
  assert.equal(getSlotCapacity(sixtyFull).state, 'full');
  assert.equal(isSlotSelectable(getSlotCapacity(sixtyFull)), false);
  // No number from ROLLER: selectable, nothing shown.
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ capacityRemaining: null })])), { state: 'open', remaining: null });
  // No answer for the time (loading, failed, or no 60-minute entry): selectable, the product step decides.
  assert.deepEqual(getSlotCapacity(null), { state: 'unknown', remaining: null });
  assert.deepEqual(getSlotCapacity(slot('14:00', [product({ key: 'E90', durationMinutes: 90 })])), { state: 'unknown', remaining: null });
  assert.equal(isSlotSelectable(getSlotCapacity(null)), true);
});

test('Cloud\'s E60 wins over other 60-minute entries; families never count as the 60-minute entry', () => {
  const chosen = findSixtyMinuteEntry(slot('14:00', [product({ key: 'X60', capacityRemaining: 3 }), product({ capacityRemaining: 22 })]));
  assert.equal(chosen.capacityRemaining, 22);
  assert.equal(findSixtyMinuteEntry(slot('14:00', [product({ key: 'F60', type: 'family' })])), null);
  assert.equal(findSixtyMinuteEntry(slot('14:00', [product({ key: 'entry-60' })])).key, 'entry-60', 'local fixtures use other keys');
});

test('one answer covers all shown times and is reused while it is fresh', () => {
  const availability = { date: '2026-10-17', slots: ['14:00', '14:30', '15:00'].map((time) => slot(time, [product({ startTime: time })])) };
  assert.equal(availabilityCovers(availability, ['14:00', '14:30', '15:00']), true);
  assert.equal(availabilityCovers(availability, ['14:00', '15:30']), false);
  assert.equal(availabilityCovers(null, ['14:00']), false);
  assert.equal(findAvailabilitySlot(availability, '14:30').startTime, '14:30');
  const now = Date.parse('2026-10-17T12:00:00Z');
  assert.equal(SLOT_AVAILABILITY_REUSE_MS, 5 * 60 * 1000);
  assert.equal(isAvailabilityFresh(now - 60_000, now), true);
  assert.equal(isAvailabilityFresh(now - SLOT_AVAILABILITY_REUSE_MS, now), false);
  assert.equal(isAvailabilityFresh(null, now), false);
  assert.equal(isAvailabilityFresh(now + 1000, now), false, 'a clock that went back is not fresh');
});

test('90 minutes is "Populärt" for entry and family; 60, 120 and the Combo are not', () => {
  assert.equal(isPopularBookingProduct({ type: 'entry', durationMinutes: 90 }), true);
  assert.equal(isPopularBookingProduct({ type: 'family', durationMinutes: 90 }), true);
  for (const [type, durationMinutes] of [['entry', 60], ['entry', 120], ['family', 60], ['combo', 60], ['addon', 90]]) {
    assert.equal(isPopularBookingProduct({ type, durationMinutes }), false, `${type} ${durationMinutes}`);
  }
  assert.match(buySource, /\{popular && available && <span className="buy-product-tag">\{t\.buy\.popular\}<\/span>\}/);
});

function continueHarness({ availability = null, loadedAt = null, selectedTime = '14:30', pending = null, reply } = {}) {
  const requests = [];
  const state = {
    availability, availabilityLoadedAt: loadedAt, selectedTime, loadingAvailability: false, slots: ['14:00', '14:30', '15:00'],
    steps: [], errors: [], selected: [],
    availabilityRequestRef: { current: pending },
    availabilityCovers, findAvailabilitySlot, getSlotCapacity, isAvailabilityFresh, isSlotSelectable,
    CloudBookingError: class CloudBookingError extends Error {},
    t: { buy: { availabilityFailed: 'Vi kunde inte hämta lediga tider.' } },
    Date,
    useCallback: (fn) => fn,
    getNewBookingAvailability: async (times) => { requests.push(times); return reply(times); },
  };
  for (const name of ['setStep', 'setAvailability', 'setAvailabilityLoadedAt', 'setLoadingAvailability', 'setAvailabilityError',
    'setSelectedTime', 'setSlotAvailabilityPending']) {
    state[name] = (value) => {
      if (name === 'setStep') state.steps.push(value);
      if (name === 'setAvailabilityError') state.errors.push(value);
      if (name === 'setSelectedTime') state.selected.push(value);
      if (name === 'setAvailability') state.availability = value;
    };
  }
  const handlers = compile(['requestSlotAvailability', 'continueFromTimeslot'], state);
  return { ...handlers, state, requests };
}

const threeSlots = (capacities) => ({ date: '2026-10-17', slots: ['14:00', '14:30', '15:00'].map((time, index) =>
  slot(time, [product({ startTime: time, capacityRemaining: capacities[index], available: capacities[index] !== 0 })])) });

test('Continue reuses the loaded spots: the product step opens with no second request (#427)', async () => {
  const host = continueHarness({ availability: threeSlots([34, 6, 0]), loadedAt: Date.now(), reply: () => assert.fail('no new read') });
  await host.continueFromTimeslot();
  assert.deepEqual(host.state.steps, ['PRODUCT']);
  assert.deepEqual(host.requests, []);
});

test('Continue while the step\'s read is still running waits for that same read, never a second one', async () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  const host = continueHarness({ pending: { key: '14:00,14:30,15:00', promise }, reply: () => assert.fail('no new read') });
  const continued = host.continueFromTimeslot();
  resolve(threeSlots([34, 6, 0]));
  await continued;
  assert.deepEqual(host.state.steps, ['PRODUCT']);
  assert.deepEqual(host.requests, []);
});

test('without a loaded answer Continue reads all shown times once; a stale answer is read again', async () => {
  const host = continueHarness({ reply: () => threeSlots([34, 6, 0]) });
  await host.continueFromTimeslot();
  assert.deepEqual(plain(host.requests), [['14:00', '14:30', '15:00']]);
  assert.deepEqual(host.state.steps, ['PRODUCT']);
  const stale = continueHarness({ availability: threeSlots([34, 6, 0]), loadedAt: Date.now() - SLOT_AVAILABILITY_REUSE_MS - 1,
    reply: () => threeSlots([30, 5, 0]) });
  await stale.continueFromTimeslot();
  assert.equal(stale.requests.length, 1);
  assert.deepEqual(stale.state.steps, ['PRODUCT']);
});

test('a time that filled up while the guest chose stays on the start-time step, now marked full', async () => {
  const host = continueHarness({ selectedTime: '15:00', reply: () => threeSlots([34, 6, 0]) });
  await host.continueFromTimeslot();
  assert.deepEqual(host.state.steps, []);
  assert.deepEqual(host.state.selected, [null]);
  const fresh = continueHarness({ selectedTime: '15:00', availability: threeSlots([34, 6, 0]), loadedAt: Date.now(),
    reply: () => assert.fail('no new read') });
  await fresh.continueFromTimeslot();
  assert.deepEqual(fresh.state.steps, [], 'a full time never opens the product step');
});

test('a failed read shows the existing error and retry; nothing else changes', async () => {
  const host = continueHarness({ reply: () => { throw new Error('offline'); } });
  await host.continueFromTimeslot();
  assert.deepEqual(host.state.steps, []);
  assert.deepEqual(host.state.errors, [null, 'Vi kunde inte hämta lediga tider.']);
});

test('the step reads every shown time once when it opens and shares an in-flight read', () => {
  const requests = [];
  const state = {
    availabilityRequestRef: { current: null }, useCallback: (fn) => fn, Date,
    getNewBookingAvailability: (times) => { requests.push(times); return new Promise(() => undefined); },
    setAvailability() {}, setAvailabilityLoadedAt() {}, setSlotAvailabilityPending() {},
  };
  const { requestSlotAvailability } = compile(['requestSlotAvailability'], state);
  const first = requestSlotAvailability(['14:00', '14:30', '15:00']);
  const second = requestSlotAvailability(['14:00', '14:30', '15:00']);
  assert.equal(first, second);
  assert.deepEqual(plain(requests), [['14:00', '14:30', '15:00']]);
  // The effect that opens the step: one read for every shown time, skipped while a fresh answer covers them.
  assert.match(buySource, /if \(step !== 'TIMESLOT' \|\| restoringPrePaymentRef\.current \|\| slots\.length === 0\) return;\s*if \(availabilityCovers\(availability, slots\) && isAvailabilityFresh\(availabilityLoadedAt\)\) return;\s*void requestSlotAvailability\(slots\)/);
  // A restored purchase asks for the saved time together with the shown times, still one read.
  assert.match(buySource, /getNewBookingAvailability\(\[\.\.\.new Set\(\[\.\.\.slots, savedStartTime\]\)\]\)/);
  // A full time cannot be selected, and a chosen time that turns full cannot continue.
  assert.match(buySource, /disabled=\{full\}/);
  assert.match(buySource, /disabled=\{!selectedTime \|\| !isSlotSelectable\(getSlotCapacity\(findAvailabilitySlot\(availability, selectedTime\)\)\)\}/);
  assert.match(buySource, /const handleTimeSelect = \(time: string\) => \{\s*if \(!isSlotSelectable\(getSlotCapacity\(findAvailabilitySlot\(availability, time\)\)\)\) return;/);
});

test('socks on the quantity step become the same JumpSocks purchase line the add-on step used', () => {
  const addons = [
    { id: 'socks', label: 'Strumpor', price: 49, unit: 'st', maxPerGuest: 4, icon: 'grip-socks', rollerProductId: 1765445, requiresAvailability: false },
    { id: 'water_bottle', label: 'Vattenflaska', price: 20, unit: 'st', maxPerGuest: 4, icon: 'water-bottle', rollerProductId: 1040, requiresAvailability: false },
  ];
  const { getSelectedAddonsForState, buildItemsForState } = compile(
    ['getAddonMaxQuantity', 'isPricedAddon', 'getAddonAvailabilityById', 'isKnownBuyAddonId', 'getSelectedAddonsForState', 'buildItemsForState'],
    { SOCKS_UNLIMITED_MAX: Number.MAX_SAFE_INTEGER, BUY_ENTRY_ADDON_IDS: ['socks', 'water_bottle', 'skyrider', 'lock', 'coffee'], Map, Number },
    'getSelectedAddonsForState, buildItemsForState');
  const qty = { skyrider: 0, connected: 0, coffee: 0, extra_person: 0, lock: 0, socks: 3, water_bottle: 1 };
  const selected = getSelectedAddonsForState(qty, null, addons, 2);
  assert.deepEqual(selected.map(({ id, qty: count, rollerProductId }) => ({ id, count, rollerProductId })),
    [{ id: 'socks', count: 3, rollerProductId: 1765445 }, { id: 'water_bottle', count: 1, rollerProductId: 1040 }]);
  const items = buildItemsForState({ date: '2026-10-17', slots: [] }, product({ productId: '1002', startTime: '14:00' }), 2, selected);
  assert.deepEqual(JSON.parse(JSON.stringify(items)), [
    { bookingDate: '2026-10-17', productId: 1002, quantity: 2, requiresAvailability: true, startTime: '14:00' },
    { bookingDate: '2026-10-17', productId: 1765445, quantity: 3, requiresAvailability: false, startTime: '14:00' },
    { bookingDate: '2026-10-17', productId: 1040, quantity: 1, requiresAvailability: false, startTime: '14:00' },
  ]);
  // More socks than jumpers are allowed (parents wear socks too).
  assert.equal(getSelectedAddonsForState({ ...qty, socks: 9 }, null, addons, 2)[0].qty, 9);
  // The quantity step binds the stepper to that same line and adds it to its total; the add-on step no longer offers socks.
  assert.match(buySource, /<SocksQuantity[\s\S]*?quantity=\{socksSellable \? addonQty\.socks : 0\}[\s\S]*?onQuantity=\{\(next\) => setOneAddon\('socks', next\)\}/);
  assert.match(buySource, /\{formatMoney\(entryTotal \+ socksTotal\)\}/);
  assert.match(buySource, /<AddonChoices\s+rows=\{BUY_ADDON_ROWS\}\s+entries=\{buyAddons\.filter\(\(addon\) => addon\.id !== 'socks'/);
  // Nothing is preselected: the stepper starts at what the guest chose (0 for a new product).
  assert.match(buySource, /const handleProductSelect = \(product: NewBookingProduct\) => \{[\s\S]*?setAddonQty\(createEmptyAddonQty\(\)\);/);
});

test('the summary step is gone: add-ons go to safety, then contact with the order shown open', () => {
  const steps = [];
  const base = {
    safetyBeforePayment: true, safetyApprovedAt: null, skyriderSelected: false, skyriderConsentConfirmed: false,
    setSubmitError() {}, setStep: (value) => steps.push(value),
  };
  const run = (overrides) => {
    const handlers = compile(['goToStepAfterAddons', 'needsSkyRiderConsent', 'continueFromAddons'], { ...base, ...overrides });
    handlers.continueFromAddons();
  };
  run({});
  run({ safetyApprovedAt: '2026-10-07T10:00:00.000Z' });
  run({ safetyApprovedAt: null, skyriderSelected: true, skyriderConsentConfirmed: false });
  assert.deepEqual(steps, ['SAFETY', 'CONTACT', 'SKYRIDER_ATTEST']);
  assert.doesNotMatch(buySource, /step === 'REVIEW' &&|setStep\('REVIEW'\)|reviewTitle/);
  assert.match(buySource, /onComplete=\{\(\) => \{\s*setSkyriderConsentConfirmed\(true\);\s*goToStepAfterAddons\(\);/);
  // A purchase saved on the old summary step continues where that step led.
  assert.match(buySource, /if \(recoverySnapshot\.currentFlowStep === 'REVIEW'\) \{\s*setStep\(needsRecoveredSkyRiderConsent \? 'SKYRIDER_ATTEST' : recoveredStepAfterAddons\);/);
  // Contact shows "Att betala" with every line, open, and no toggle.
  const contact = buySource.slice(buySource.indexOf("{step === 'CONTACT' && selectedProduct && ("), buySource.indexOf("{step === 'SAFETY' && ("));
  assert.match(contact, /data-testid="buy-contact-summary"[\s\S]*?\{t\.buy\.toPay\}[\s\S]*?\{t\.buy\.startTimeLabel\} \{selectedProduct\.startTime\}[\s\S]*?basketLines\.map/);
  assert.doesNotMatch(buySource, /checkoutBreakdownOpen/);
  // The progress bar is unchanged.
  assert.match(buySource, /if \(step === 'ADDONS' \|\| step === 'SKYRIDER_ATTEST' \|\| step === 'REVIEW'\) return 1;\s*if \(step === 'SAFETY'\) return 2;/);
});

// #491 review round 1 (Love 2026-10-08).
test('round 1: 90 minutes leads entry and family, entry leads the page, with a red outline and glow', () => {
  const products = [
    product({ key: 'E60' }), product({ key: 'E90', durationMinutes: 90 }), product({ key: 'E120', durationMinutes: 120 }),
  ];
  assert.deepEqual(plain(sortPopularFirst(products).map((item) => item.key)), ['E90', 'E60', 'E120']);
  const family = [product({ key: 'F60', type: 'family' }), product({ key: 'F90', type: 'family', durationMinutes: 90 })];
  assert.deepEqual(plain(sortPopularFirst(family).map((item) => item.key)), ['F90', 'F60']);
  assert.deepEqual(plain(sortPopularFirst([product({ key: 'COMBO60', type: 'combo' })]).map((item) => item.key)), ['COMBO60']);
  assert.match(buySource, /const entryProducts = sortPopularFirst\(visibleProductSections\.entry\);/);
  assert.match(buySource, /const familyProducts = sortPopularFirst\(visibleProductSections\.family\);/);
  const productStep = buySource.slice(buySource.indexOf("{step === 'PRODUCT' && ("), buySource.indexOf("{step === 'QUANTITY' && selectedProduct && ("));
  assert.ok(productStep.indexOf('entryProducts.map') < productStep.indexOf('comboProducts.map'), 'entry before the Weekday Combo');
  assert.ok(productStep.indexOf('comboProducts.map') < productStep.indexOf('familyProducts.map'), 'family last');
  assert.match(buySource, /'buy-product-popular bg-white border-2 border-primary shadow-\[0_0_22px_rgba\(239,23,66,0\.26\)\] active:scale-\[0\.98\]'/);
  const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.buy-product-tag \{[\s\S]*?background: var\(--primary\);[\s\S]*?color: #fff;/);
});

test('round 1: the start-time step shows the time now and how soon each time starts, live on the minute', () => {
  assert.equal(formatClock(new Date(2026, 9, 8, 13, 42, 30)), '13:42');
  assert.equal(formatClock('9:05'), '09:05');
  assert.equal(minutesUntil('14:00', '13:42'), 18);
  assert.equal(minutesUntil('15:00', new Date(2026, 9, 8, 13, 42)), 78);
  assert.equal(minutesUntil('nonsense', '13:42'), null);
  const copy = { startsIn: 'om {time}', startsNow: 'startar nu' };
  assert.equal(formatStartsIn(18, copy), 'om 18 min');
  assert.equal(formatStartsIn(60, copy), 'om 1 h');
  assert.equal(formatStartsIn(78, copy), 'om 1 h 18 min');
  assert.equal(formatStartsIn(0, copy), 'startar nu');
  assert.equal(formatStartsIn(-2, copy), 'startar nu');
  assert.equal(formatStartsIn(null, copy), null);
  assert.equal(formatStartsIn(18, { startsIn: 'in {time}', startsNow: 'starts now' }), 'in 18 min');
  assert.equal(msUntilNextMinute(new Date(2026, 9, 8, 13, 42, 45, 500)), 14_500);
  assert.equal(msUntilNextMinute(new Date(2026, 9, 8, 13, 42, 59, 999)), 250, 'never a busy loop');
  assert.match(buySource, /<p className="buy-clock" data-testid="buy-clock">[\s\S]*?\{t\.buy\.clockNow\}[\s\S]*?<time className="buy-clock-time">\{formatClock\(clock\)\}<\/time>/);
  assert.match(buySource, /data-testid="slot-starts-in">\s*\{formatStartsIn\(minutesUntil\(time, clock\), t\.buy\)\}/);
  assert.match(buySource, /timer = window\.setTimeout\(tick, msUntilNextMinute\(\)\);/);
  assert.match(buySource, /const clock = clockNow \?\? liveClock;/);
  const copyFile = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  assert.match(copyFile, /clockNow: 'Klockan är'/);
  assert.match(copyFile, /clockNow: 'The time is'/);
});

test('round 1: Back from contact returns to the safety film; Back from the film returns to the add-ons', () => {
  const run = (step, safetyBeforePayment = true) => {
    const steps = [];
    const handlers = compile(['backFromStep'], {
      step, safetyBeforePayment, backNavigationLocked: false, draft: null, paymentFailure: null,
      invalidateQuote() {}, retryFailedPayment() {}, clearBuyFlowRecovery() {}, onBack() { steps.push('exit'); },
      setStep: (value) => steps.push(value),
    });
    handlers.backFromStep();
    return steps;
  };
  assert.deepEqual(run('CONTACT'), ['SAFETY']);
  assert.deepEqual(run('SAFETY'), ['ADDONS']);
  assert.deepEqual(run('SKYRIDER_ATTEST'), ['ADDONS']);
  assert.deepEqual(run('CONTACT', false), ['ADDONS'], 'the old order has no film before contact');
  assert.deepEqual(run('PAYMENT'), ['CONTACT']);
});

test('round 1: "Gör en ny bokning" keeps today’s visit for the way back instead of deleting it', () => {
  const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /onStartOver=\{ctx\.channel === 'park-qr' \? \(\) => \{ parkSavedVisit\(\); resetToStart\(\); \} : undefined\}/);
  assert.doesNotMatch(page, /clearSavedVisit/);
  // A reload opens a parked visit no more; the first screen offers it instead.
  assert.match(page, /if \(visit && !visit\.parkedAt\) restoreSavedVisit\(visit\);/);
  assert.match(page, /savedVisitCode=\{savedVisitOffer\?\.session\.handoffCode \?\? null\}/);
  assert.match(page, /onResumeSavedVisit=\{savedVisitOffer \? \(\) => restoreSavedVisit\(savedVisitOffer\) : undefined\}/);
});
