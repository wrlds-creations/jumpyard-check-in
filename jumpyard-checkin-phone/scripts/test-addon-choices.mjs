import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { getMissingAddonChoices, hasAddonPurchase } from '../src/flow/addonChoices.ts';
import { previewHosts, previewResponse } from './preview-phone-addons.mjs';

const noOwn = { socks: false, water_bottle: false };
const initial = ['socks', 'water_bottle'].map(id => ({ id, quantity: 0, included: 0, available: true }));
const source = name => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');

test('each decision is explicit, in socks then water order', () => {
  assert.deepEqual(getMissingAddonChoices(initial, noOwn), ['socks', 'water_bottle']);
  assert.deepEqual(getMissingAddonChoices(initial, { socks: true, water_bottle: false }), ['water_bottle']);
  assert.deepEqual(getMissingAddonChoices(initial, { socks: false, water_bottle: true }), ['socks']);
  assert.deepEqual(getMissingAddonChoices(initial, { socks: true, water_bottle: true }), []);
});

test('positive purchases satisfy the decision, not a mandatory quantity per guest', () => {
  assert.deepEqual(getMissingAddonChoices(initial.map(e => ({ ...e, quantity: 1 })), noOwn), []);
  assert.deepEqual(getMissingAddonChoices([{ ...initial[0], quantity: 1 }, initial[1]], { ...noOwn, water_bottle: true }), []);
});

test('included paid products count even if the current catalog cannot sell them', () => {
  assert.deepEqual(getMissingAddonChoices(initial.map(e => ({ ...e, included: 1, quantity: 1, available: false })), noOwn), []);
});

test('missing or unpriced products never silently count as purchases', () => {
  assert.deepEqual(getMissingAddonChoices([], noOwn), ['socks', 'water_bottle']);
  assert.deepEqual(getMissingAddonChoices(initial.map(e => ({ ...e, available: false, quantity: 2 })), noOwn), ['socks', 'water_bottle']);
});

test('own-item choice hides on purchase and returns when the last new item is removed', () => {
  for (const e of initial) {
    assert.equal(hasAddonPurchase(e), false);
    assert.equal(hasAddonPurchase({ ...e, quantity: 1 }), true);
    assert.equal(hasAddonPurchase({ ...e, quantity: 0 }), false);
    assert.equal(hasAddonPurchase({ ...e, included: 1, quantity: 1, available: false }), true);
  }
  assert.equal(hasAddonPurchase(undefined), false);
  assert.match(source('components/AddonChoices.tsx'), /!hasAddonPurchase\(entry\) && <label/);
});

test('plus and minus are the only purchase buttons and adjust one item at a time', () => {
  const code = source('components/AddonChoices.tsx');
  assert.equal((code.match(/<button\b/g) || []).length, 2);
  assert.match(code, /Math.min\(entry.max, entry.quantity \+ 1\)/);
  assert.match(code, /Math.max\(entry.included, entry.quantity - 1\)/);
  assert.doesNotMatch(code, /guestCount|getRecommendedSocksToAdd|copy\.addSocks|copy\.addBottle/);
});

test('both entry paths use the same validator and ownership cannot mutate quantities', () => {
  for (const file of ['BuyTickets', 'AddonsOffer']) {
    const code = source('components/' + file + '.tsx');
    assert.match(code, /<AddonChoices ref=\{addonChoicesRef\}/);
    assert.match(code, /if \(!addonChoicesRef.current\?\.validate\(\)\) return;/);
    assert.doesNotMatch(code, /disabled=\{[^}]*RequirementMet/);
    for (const name of ['setSocksConfirmation', 'setWaterBottleConfirmation']) {
      const handler = code.split('const ' + name + ' =')[1]?.split('\n  };')[0]?.split('\n    };')[0];
      assert.ok(handler);
      assert.doesNotMatch(handler, /setAddonQty|setQty/);
    }
    assert.doesNotMatch(code, /nextQty.*setAlreadyHas/);
  }
  const buy = source('components/BuyTickets.tsx');
  assert.match(buy, /const recoveredAlreadyHasSocks =\s+recoverySnapshot.alreadyHasApprovedSocks === true/);
  assert.match(buy, /const recoveredAlreadyHasWaterBottle =\s+recoverySnapshot.alreadyHasWaterBottle === true/);
});

test('warnings are only activated by Continue and focus the first missing choice', () => {
  const code = source('components/AddonChoices.tsx');
  assert.match(code, /\[attempted, setAttempted\] = useState\(false\)/);
  assert.match(code, /validate\(\) \{\s+setAttempted\(true\)/);
  assert.equal((code.match(/setAttempted\(/g) || []).length, 1);
  assert.match(code, /const hasError = attempted && missing.includes\(id\)/);
  assert.match(code, /cards.current\[missing\[0\]\]\?\.focus\(\)/);
  assert.match(code, /aria-describedby=\{hasError \? errorId : undefined\}/);
  assert.match(code, /\{hasError && <p id=\{errorId\} role="alert"/);
});

test('paid quantity is locked; displayed new quantity and purchase callbacks are bounded', () => {
  const code = source('components/AddonChoices.tsx');
  assert.match(code, /disabled=\{entry.quantity <= entry.included\}/);
  assert.match(code, /Math.max\(entry.included, entry.quantity - 1\)/);
  assert.match(code, /Math.min\(entry.max, entry.quantity \+ 1\)/);
  assert.match(code, /Math.max\(0, entry.quantity - entry.included\)/);
  assert.match(code, /countText\(copy.included, entry.included\)/);
});

test('mobile keeps approved concise bilingual benefits and transparent branded warning', () => {
  const code = source('components/AddonChoices.tsx');
  const copy = source('context/LanguageContext.tsx');
  assert.doesNotMatch(code, /copy\.(intro|optionalTitle|purchaseKept)/);
  assert.match(code, /name="warning-transparent"/);
  assert.match(copy, /skyRiderBenefit: 'Se parken från ovan i vår höghöjdsbana\.'/);
  assert.match(copy, /skyRiderBenefit: 'See the park from above on our high ropes course\.'/);
  assert.match(copy, /bottleEnvironment: 'Inga engångsmuggar av miljöskäl\.'/);
  assert.match(copy, /bottleEnvironment: 'No disposable cups, to reduce waste\.'/);
  assert.match(code, /entry.id === 'skyrider' && entry.available && <p className="addon-shop-note"/);
  const png = readFileSync(new URL('../public/jumpyard-next-icons/warning-transparent.png', import.meta.url));
  assert.equal(png[25], 6, 'approved asset must retain its RGBA alpha channel');
});

test('component does not fetch prices, use kiosk dimensions or expose purchase-removing controls', () => {
  const code = source('components/AddonChoices.tsx');
  assert.doesNotMatch(code, /\bfetch\(|getNewBookingAvailability|rollerProductId|kiosk-/);
  const css = source('app/globals.css');
  assert.match(css, /--shop-control: 44px/);
  assert.match(css, /\.addon-shop-scroll \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.addon-shop-purchase \{\s+display: grid;\s+grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.addon-shop-footer \{ flex-shrink: 0;/);
});

test('preview uses synthetic prices/ids consistently, including linked add-on quotes', () => {
  const [, result] = previewResponse('POST', '/v1/bookings/availability', { startTimes: ['14:00'] });
  const bottle = result.availability.slots[0].products.find(p => p.key === 'water_bottle');
  assert.equal(bottle.unitPrice, 20);
  assert.match(bottle.productId, /^900000/);
  for (const path of ['/v1/bookings/quote', '/v1/bookings/DEMO318PAID/add-products/quote']) {
    const [status, quote] = previewResponse('POST', path, { items: [{ productId: bottle.productId, quantity: 2 }] });
    assert.equal(status, 200);
    assert.equal(quote.quote.costs.amountOwing, 40);
  }
});

test('preview never forwards financial writes and refuses real identifiers', () => {
  assert.equal(previewResponse('POST', '/v1/check-in/lookup', { identifier: 'NOT-A-DEMO' })[0], 404);
  for (const path of ['/v1/bookings/drafts','/v1/bookings/DEMO318/add-products/drafts','/v1/payment/finalize','/v1/check-in/sessions/real/ready-for-staff']) {
    assert.equal(previewResponse('POST', path, {})[0], 403);
  }
  assert.equal(previewResponse('POST', '/v1/bookings/quote', {items:[{productId:970411,quantity:1}]})[0], 400);
  const [, paid] = previewResponse('POST', '/v1/check-in/lookup', { identifier: 'DEMO318PAID' });
  assert.equal(paid.booking.items.length, 3);
});

test('same-WiFi preview requires explicit opt-in to an assigned private address', () => {
  const interfaces = { WiFi: [{ address: '192.168.2.230', internal: false }, { address: '8.8.8.8', internal: false }] };
  assert.deepEqual(previewHosts('', interfaces), ['127.0.0.1']);
  assert.deepEqual(previewHosts('192.168.2.230', interfaces), ['127.0.0.1', '192.168.2.230']);
  for (const address of ['0.0.0.0', '8.8.8.8', '192.168.2.231', '127.0.0.1', '::', '192.168.2.999']) {
    assert.throws(() => previewHosts(address, interfaces), /private IPv4 address assigned/);
  }
});

test('compact cards keep readable copy and full touch targets while sharing rows', () => {
  const code = source('components/AddonChoices.tsx');
  const css = source('app/globals.css');
  const copy = source('context/LanguageContext.tsx');
  assert.match(code, /className="addon-shop-purchase"/);
  assert.doesNotMatch(code, /addon-shop-purchase-copy/);
  assert.match(css, /--shop-control: 44px/);
  assert.match(css, /font-size: 14px/);
  assert.match(css, /\.addon-shop-selling-copy \{\s+min-width: 0;\s+font-size: 13px;\s+line-height: 1.35;\s+overflow-wrap: anywhere;/);
  assert.doesNotMatch(copy, /bottleBenefit|Fyll på din flaska vid vattenstationen|Refill your bottle at the water station/);
  assert.match(copy, /bottleEnvironment: 'Inga engångsmuggar av miljöskäl\.'/);
  assert.doesNotMatch(css, /line-clamp|text-overflow:\s*ellipsis/);
});

test('every card keeps selling copy beside the full-size quantity controls', () => {
  const code = source('components/AddonChoices.tsx');
  const rows = code.match(/<div className="addon-shop-purchase">\s*<div className="addon-shop-selling-copy">[\s\S]*?<\/div>\s*\{stepper\(entry\)\}\s*<\/div>/g) || [];
  assert.equal(rows.length, 2, 'required and optional products must share the same side-by-side row');
  assert.match(rows[0], /copy\.socksBenefit[\s\S]*copy\.bottleEnvironment/);
  assert.match(rows[1], /copy\.lockBenefit[\s\S]*copy\.coffeeBenefit[\s\S]*copy\.skyRiderBenefit/);
  const css = source('app/globals.css');
  assert.match(css, /--shop-control: 44px/);
  assert.doesNotMatch(css, /\.addon-shop-optional > \.addon-shop-stepper|grid-row:/);
});

test('phone omits the Tips row, miniature socks and separate add buttons', () => {
  const code = source('components/AddonChoices.tsx');
  assert.doesNotMatch(code, /socksRecommendation|visibleSocks|addon-shop-sock-icon|addon-shop-recommendation/);
  assert.doesNotMatch(source('context/LanguageContext.tsx'), /socksRecommendation|addSocks|addBottle/);
  assert.doesNotMatch(source('app/globals.css'), /addon-shop-recommendation|addon-shop-sock-icon|addon-shop-add/);
  assert.match(code, /<JumpyardIcon name=\{entry.icon\} className="addon-shop-icon"/);
  assert.doesNotMatch(code, /addon-shop-add|addon-shop-purchase-copy/);
});

test('both add-on paths share the remaining viewport without fixed header-height deductions', () => {
  const css = source('app/globals.css');
  const page = source('app/page.tsx');
  const buy = source('components/BuyTickets.tsx');
  const existing = source('components/AddonsOffer.tsx');
  assert.match(css, /\.phone-flow-shell:has\(\.addon-shop-screen\) \{\s+height: 100dvh;\s+padding-bottom: max\(12px, env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(css, /\.addon-shop-screen \{\s+flex: 1;\s+min-height: 0;\s+\}/);
  for (const name of ['phone-flow-shell', 'phone-flow', 'phone-flow-content']) {
    assert.match(page, new RegExp('className="' + name + ' '));
  }
  assert.match(buy, /className="phone-buy-flow /);
  assert.match(buy, /step === 'ADDONS'[\s\S]*?className="addon-shop-screen /);
  assert.match(existing, /step === 'SELECT' \? 'addon-shop-screen pt-3' : 'py-3'/);
  assert.match(existing, /style=\{step === 'SELECT' \? undefined : \{ maxHeight:/);
});

test('coffee is labelled as brewed coffee and the removed Sky Rider sentence stays out of the list', () => {
  const copy = source('context/LanguageContext.tsx');
  assert.match(copy, /coffeeLabel: 'Bryggkaffe'/);
  assert.match(copy, /coffeeLabel: 'Filter coffee'/);
  assert.doesNotMatch(source('components/AddonChoices.tsx'), /skyRiderRequirement/);
  assert.doesNotMatch(copy, /Minst 100 cm\. Rekommenderas efter hopptiden\./);
  // Only the repeated shop copy is removed, not the existing safety step.
  assert.match(source('components/BuyTickets.tsx'), /<SkyRiderAttest/);
  assert.match(source('components/AddonsOffer.tsx'), /<SkyRiderAttest/);
});

test('both entry paths retain native scrolling without the discarded more-add-ons control', () => {
  for (const file of ['BuyTickets', 'AddonsOffer']) {
    const code = source('components/' + file + '.tsx');
    assert.match(code, /<div className="addon-shop-scroll">[\s\S]*?<AddonChoices[\s\S]*?<\/div>\s*<div className="addon-shop-footer">/);
    assert.doesNotMatch(code, /AddonShopScroll|hasMoreAddons|nextAddonScrollTop|addon-shop-more/);
  }
  assert.match(source('app/globals.css'), /\.addon-shop-scroll \{[\s\S]*?overflow-y: auto/);
  assert.doesNotMatch(source('app/globals.css'), /addon-shop-more/);
  assert.doesNotMatch(source('context/LanguageContext.tsx'), /moreAddons:|Fler tillägg/);
  assert.equal(existsSync(new URL('../src/components/AddonShopScroll.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/flow/addonScroll.ts', import.meta.url)), false);
});
