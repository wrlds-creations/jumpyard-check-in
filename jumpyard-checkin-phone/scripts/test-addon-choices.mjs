import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { hasAddonPurchase } from '../src/flow/addonChoices.ts';
import { previewHosts, previewResponse } from './preview-phone-addons.mjs';

const initial = ['socks', 'water_bottle'].map(id => ({ id, quantity: 0, included: 0, available: true }));
const source = name => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');

test('#457: Continue never asks for a socks or water tick on either path', () => {
  const code = source('components/AddonChoices.tsx');
  assert.doesNotMatch(code, /type="checkbox"|ownSocks|ownBottle|onOwn|validate|attempted|role="alert"|useImperativeHandle/);
  for (const file of ['BuyTickets', 'AddonsOffer']) {
    const path = source('components/' + file + '.tsx');
    assert.match(path, /<AddonChoices\s+(?:rows=\{BUY_ADDON_ROWS\}\s+)?entries=\{/);
    assert.doesNotMatch(path, /addonChoicesRef|AddonChoicesHandle|\.validate\(\)|alreadyHas|AlreadyHas|SocksConfirmation|WaterBottleConfirmation/);
    assert.doesNotMatch(path, /disabled=\{[^}]*RequirementMet/);
  }
  const copy = source('context/LanguageContext.tsx');
  assert.doesNotMatch(copy, /ownSocks:|ownBottle:|socksRequired:|bottleRequired:/);
  assert.doesNotMatch(source('flow/buyFlowRecovery.ts'), /alreadyHas/);
});

test('a purchase or an included item marks the offer as covered, nothing else does', () => {
  for (const e of initial) {
    assert.equal(hasAddonPurchase(e), false);
    assert.equal(hasAddonPurchase({ ...e, quantity: 1 }), true);
    assert.equal(hasAddonPurchase({ ...e, included: 1, quantity: 1, available: false }), true);
    assert.equal(hasAddonPurchase({ ...e, available: false, quantity: 2 }), false);
  }
  assert.equal(hasAddonPurchase(undefined), false);
  const code = source('components/AddonChoices.tsx');
  assert.match(code, /className="addon-shop-row" data-selected=\{hasAddonPurchase\(water\)\}/);
  assert.match(code, /\{hasAddonPurchase\(water\) && <JumpyardIcon name="success-check" className="addon-shop-badge" \/>\}/);
  // #515: the socks block marks the booking's own pairs with the same check.
  assert.match(source('components/SocksQuantity.tsx'), /\{included > 0 && <JumpyardIcon name="success-check" className="addon-shop-badge" \/>\}/);
});

test('plus and minus are the only purchase buttons and adjust one item at a time', () => {
  const code = source('components/AddonChoices.tsx');
  assert.equal((code.match(/<button\b/g) || []).length, 2);
  assert.match(code, /Math.min\(entry.max, entry.quantity \+ 1\)/);
  assert.match(code, /Math.max\(entry.included, entry.quantity - 1\)/);
  assert.doesNotMatch(code, /guestCount|getRecommendedSocksToAdd|copy\.addSocks|copy\.addBottle/);
});

test('Hylla: water comes first as a row and the optional add-ons follow on a three-tile shelf; socks are never a row (#515)', () => {
  const code = source('components/AddonChoices.tsx');
  const css = source('app/globals.css');
  assert.match(code, /copy\.firstGroupBottle[\s\S]*data-testid="addon-choice-water_bottle"[\s\S]*copy\.optionalGroup[\s\S]*className="addon-shop-shelf"/);
  // #515 (Love, 2026-10-12): both paths show socks in SocksQuantity, on the quantity step or above an existing booking's list.
  assert.doesNotMatch(code, /FIRST_ROWS|FirstRow|rows\?:|copy\.firstGroup\b|socksTitle|socksBenefit/);
  const buy = source('components/BuyTickets.tsx');
  assert.doesNotMatch(buy, /BUY_ADDON_ROWS|rows=\{/);
  assert.match(buy, /entries=\{buyAddons\.filter\(\(addon\) => addon\.id !== 'socks'/);
  const existing = source('components/AddonsOffer.tsx');
  assert.doesNotMatch(existing, /rows=\{/);
  assert.match(existing, /<SocksQuantity[\s\S]*?included=\{minQty\.socks\}[\s\S]*?<AddonChoices\s+entries=\{catalog\.filter\(\(entry\) => entry\.id !== 'socks'\)/);
  assert.match(code, /const SHELF_ORDER: AddonId\[\] = \['skyrider', 'lock', 'coffee'\];/);
  assert.match(css, /\.addon-shop-row-main \{\s+display: grid;\s+grid-template-columns: 36px minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.addon-shop-shelf \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  // Water keeps its offer even when the catalog cannot sell it.
  assert.match(code, /Keep the water offer visible even when the catalog cannot sell it\./);
  assert.match(code, /\{water\.available \? copy\.bottleEnvironment : copy\.unavailableRequired\}/);
});

test('#457 leaves sock sizes out', () => {
  const code = source('components/AddonChoices.tsx');
  assert.doesNotMatch(code, /sockSizes|SizeSheet|storlek|\bsizes?\b/i);
  assert.equal(existsSync(new URL('../src/components/addonlook', import.meta.url)), false);
});

test('paid quantity is locked; displayed new quantity and purchase callbacks are bounded', () => {
  const code = source('components/AddonChoices.tsx');
  assert.match(code, /disabled=\{entry.quantity <= entry.included\}/);
  assert.match(code, /Math.max\(entry.included, entry.quantity - 1\)/);
  assert.match(code, /Math.min\(entry.max, entry.quantity \+ 1\)/);
  assert.match(code, /Math.max\(0, entry.quantity - entry.included\)/);
  assert.match(code, /fill\(copy.included, \{ count: entry.included \}\)/);
});

test('mobile keeps approved concise bilingual benefits and the Sky Rider note', () => {
  const code = source('components/AddonChoices.tsx');
  const copy = source('context/LanguageContext.tsx');
  assert.doesNotMatch(code, /copy\.(intro|optionalTitle|purchaseKept)/);
  assert.match(copy, /skyRiderBenefit: 'Se parken från ovan i vår höghöjdsbana\.'/);
  assert.match(copy, /skyRiderBenefit: 'See the park from above on our high ropes course\.'/);
  // #548 (Love, 2026-10-15): no cups for the environment, but a water station for refills.
  assert.match(copy, /bottleEnvironment: 'Av miljöskäl delar vi tyvärr inte ut muggar, men du kan fylla på flaskan vid vattenstationen\.'/);
  assert.match(copy, /bottleEnvironment: "To reduce waste, we don't hand out cups, but you can refill the bottle at the water station\."/);
  // #548 (Love, 2026-10-15): SkyRider's label is its rule, "det måste vara ett 'måste'", not a tip.
  assert.match(code, /entry\.id === 'skyrider' && entry\.available && <p className="addon-shop-tile-rule">\{copy\.skyRiderRule\}<\/p>/);
  assert.match(copy, /skyRiderRule: 'Måste åkas efter hopptiden'/);
  assert.match(copy, /skyRiderRule: 'Must be ridden after jump time'/);
  assert.doesNotMatch(copy, /Vårt tips|Our pick/);
  assert.doesNotMatch(code, /copy\.recommended\b/);
});

test('component does not fetch prices, use kiosk dimensions or expose purchase-removing controls', () => {
  const code = source('components/AddonChoices.tsx');
  assert.doesNotMatch(code, /\bfetch\(|getNewBookingAvailability|rollerProductId|kiosk-/);
  const css = source('app/globals.css');
  assert.match(css, /--shop-control: 44px/);
  assert.match(css, /\.addon-shop-scroll \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.addon-shop-stepper button \{[\s\S]*?width: var\(--shop-control\);\s+height: var\(--shop-control\);/);
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

test('compact rows keep readable copy and full touch targets beside the name and price', () => {
  const code = source('components/AddonChoices.tsx');
  const css = source('app/globals.css');
  const copy = source('context/LanguageContext.tsx');
  assert.match(code, /<div className="addon-shop-row-main">[\s\S]*?<h3 id=\{waterTitleId\}>[\s\S]*?\{stepper\(water\)\}\s*<\/div>/);
  assert.match(css, /--shop-control: 44px/);
  assert.match(css, /font-size: 14px/);
  assert.match(css, /\.addon-shop-row-note \{[\s\S]*?font-size: 12px;/);
  assert.doesNotMatch(copy, /bottleBenefit|Fyll på din flaska vid vattenstationen|Refill your bottle at the water station/);
  assert.doesNotMatch(css, /line-clamp|text-overflow:\s*ellipsis/);
});

test('every tile keeps its selling copy as its description and full-size controls', () => {
  const code = source('components/AddonChoices.tsx');
  assert.match(code, /entry.id === 'lock' \? copy.lockBenefit : entry.id === 'coffee' \? copy.coffeeBenefit : entry.id === 'skyrider' \? copy.skyRiderBenefit : entry.description/);
  assert.match(code, /aria-describedby=\{sell \? sellId : undefined\}/);
  assert.match(code, /\{stepper\(entry, 'addon-shop-stepper addon-shop-tile-stepper', false\)\}/);
  const css = source('app/globals.css');
  assert.doesNotMatch(css, /\.addon-shop-optional > \.addon-shop-stepper|grid-row:/);
});

test('phone omits the Tips row, miniature socks and separate add buttons', () => {
  const code = source('components/AddonChoices.tsx');
  assert.doesNotMatch(code, /socksRecommendation|visibleSocks|addon-shop-sock-icon|addon-shop-recommendation/);
  assert.doesNotMatch(source('context/LanguageContext.tsx'), /socksRecommendation|addSocks|addBottle/);
  assert.doesNotMatch(source('app/globals.css'), /addon-shop-recommendation|addon-shop-sock-icon|addon-shop-add/);
  assert.match(code, /<JumpyardIcon name=\{water\.icon\} className="addon-shop-icon"/);
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

test('Continue sits above the nav row and the total sits between the Back and Exit discs', () => {
  const css = source('app/globals.css');
  for (const [file, label] of [['BuyTickets', 't.buy.total'], ['AddonsOffer', 't.addons.total']]) {
    const code = source('components/' + file + '.tsx');
    assert.match(code, new RegExp('<div className="addon-shop-footer">\\s*<button[\\s\\S]*?</button>\\s*<p className="addon-shop-total" aria-live="polite" aria-atomic="true">\\s*<span className="addon-shop-total-label">\\{' + label.replaceAll('.', '\\.') + '\\}</span>'));
  }
  assert.match(css, /margin-bottom: calc\(16px \+ env\(safe-area-inset-bottom, 0px\) - max\(12px, env\(safe-area-inset-bottom, 0px\)\)\);/);
  assert.match(css, /\.phone-flow-shell:has\(\.addon-shop-total\) \[data-testid="flow-nav-spacer"\] \{ display: none; \}/);
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

test('#470: SkyRider needs 125 cm and JumpSocks are required for everyone in the trampoline area', () => {
  const copy = source('context/LanguageContext.tsx');
  assert.doesNotMatch(copy, /100 cm/);
  for (const line of [
    "requirementTitle: 'Minst 125 cm'",
    "requirementTitle: 'Minimum 125 cm'",
    "confirmCheckbox: 'Jag bekräftar att alla SkyRider-åkare är minst 125 cm.'",
    "confirmCheckbox: 'I confirm that all SkyRider riders are at least 125 cm.'",
    // #491 (Love 2026-10-08): the rule names everyone in the trampoline area, parents who do not jump too.
    "socksBenefit: 'Halkfria strumpor är obligatoriska i JumpYard och måste bäras av alla i trampolinområdet, även icke-hoppande föräldrar.'",
    `socksBenefit: "Non-slip socks are required at JumpYard and must be worn by everyone in the trampoline area, including parents who aren't jumping."`,
  ]) assert.ok(copy.includes(line), line);
});

test('#548: SkyRider must be ridden after the jump time, on its tile and its step, never only recommended', () => {
  const copy = source('context/LanguageContext.tsx');
  for (const line of [
    "description: 'Kolla höjdkravet och när SkyRider åks.'",
    "description: 'Check the height requirement and when to ride SkyRider.'",
    "timingTitle: 'Åks efter hopptiden'",
    "timingTitle: 'Ride after jump time'",
    "timingText: 'SkyRider måste åkas efter hopptiden.'",
    "timingText: 'SkyRider must be ridden after your jump time.'",
    // Love, 2026-10-15: the water card names the filled 0.5 l bottle the guest buys.
    "bottleTitle: '0,5 liter vatten'",
    "bottleTitle: '0.5 litres of water'",
  ]) assert.ok(copy.includes(line), line);
  assert.doesNotMatch(copy, /passar bäst|fits best|Best after jump time|rekommenderar att SkyRider|recommend doing SkyRider/i);
  // The rule shows on every screen height, red like the other labels.
  const css = source('app/globals.css');
  assert.match(css, /\.addon-shop-tile-rule \{[^}]*color: var\(--primary\);[^}]*text-transform: uppercase;/);
  assert.doesNotMatch(css, /\.addon-shop-tile-rule \{[^}]*display: none/);
});

test('#491/#515: the water row carries "Rekommenderas", as on the kiosk, in the Sky Rider tip style; socks sit in SocksQuantity', () => {
  const code = source('components/AddonChoices.tsx');
  const copy = source('context/LanguageContext.tsx');
  const css = source('app/globals.css');
  assert.match(code, /\{water\.available && <span className="addon-shop-note addon-shop-row-tag">\{copy\.waterRecommended\}<\/span>\}/);
  assert.match(copy, /waterRecommended: 'Rekommenderas'/);
  assert.match(copy, /waterRecommended: 'Recommended'/);
  assert.match(css, /\.addon-shop-row-tag \{ left: 12px; transform: none; \}/);
  // #504 (Love, 2026-10-12): plain water with Love's own bottle drawing, not the sports bottle.
  assert.match(source('flow/addonCatalog.ts'), /water_bottle: \{\s+icon: 'water'/);
  const buy = source('components/BuyTickets.tsx');
  assert.match(buy, /<SocksQuantity[\s\S]*?onQuantity=\{\(next\) => setOneAddon\('socks', next\)\}/);
  // Love 2026-10-08: the socks are called JumpSocks everywhere. Since #515 a purchase's quantity step and an
  // existing booking's add-on step both render SocksQuantity, so they show the same title and text.
  assert.equal(copy.match(/socksTitle: 'JumpSocks',/g)?.length, 2, 'the title is JumpSocks in SV and EN');
  assert.doesNotMatch(copy, /socksQuantityTitle|socksQuantityRule|Hoppsockor|Grip socks/);
  assert.match(code, /<h3 id=\{waterTitleId\}>\{copy\.bottleTitle\}<\/h3>/);
  const socksQuantity = source('components/SocksQuantity.tsx');
  assert.match(socksQuantity, /<h3 id=\{titleId\} className="buy-socks-title">\{copy\.socksTitle\}<\/h3>/);
  assert.match(socksQuantity, /\{sellable \? <SocksRule text=\{copy\.socksBenefit\} parents=\{copy\.socksParents\} \/> : copy\.unavailableRequired\}/);
  assert.match(copy, /coffeeLabel: 'Bryggkaffe'/);
});
