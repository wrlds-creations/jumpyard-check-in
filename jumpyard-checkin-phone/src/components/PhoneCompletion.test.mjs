import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = new URL('../', import.meta.url);
const cache = new Map();
function load(name) {
    if (cache.has(name)) return cache.get(name);
    const source = fs.readFileSync(new URL(name, root), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', output)(id => {
        if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
        if (!id.startsWith('.') && !id.startsWith('@/')) return require(id);
        const base = id.startsWith('@/') ? id.slice(2) : path.posix.join(path.posix.dirname(name), id);
        const file = ['.ts', '.tsx'].map(ext => base + ext).find(file => fs.existsSync(new URL(file, root)));
        assert.ok(file, `Unresolved ${id}`);
        return load(file);
    }, mod, mod.exports);
    cache.set(name, mod.exports);
    return mod.exports;
}
const { ConfirmationScreen } = load('components/ConfirmationScreen.tsx');
const { LanguageProvider } = load('context/LanguageContext.tsx');
const { isPhoneCompletionReady, isVisitDayOver, stockholmToday } = load('flow/phoneCompletion.ts');
const booking = { id: 'SYNTHETIC', jumpers: 1, time: '14:00', durationMinutes: 60, products: 1, paid: true, productLabel: '60 min entré' };
// GH-453: the completion view belongs to today's visit; another day says the visit is over.
const TODAY = stockholmToday();
const session = { checkinSessionId: 'synthetic-session', status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: '0001', handoffDay: TODAY };
function render(overrides = {}, lang = 'sv') {
    globalThis.window = { localStorage: { getItem: () => lang } };
    try { return renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(ConfirmationScreen, {
        booking, checkinSession: session, jumperCount: 1, selectedAddons: [], channel: 'park-qr', ...overrides,
    }))); } finally { delete globalThis.window; }
}

test('ready phone keeps the server number, day and quantity one, and shows no QR code (GH-456)', () => {
    const html = render({ selectedAddons: [{ id: 'socks', label: 'Strumpor', price: 45, qty: 1 }] });
    for (const value of ['data-phone-completion="true"', 'Du är incheckad', '>0001</strong>', 'data-handoff-code="0001"',
        'Nummer från', `data-day="${TODAY}"`, '60 min entré', 'Strumpor']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /Numret gäller hela dagen|\bstationen\b/i, 'Love, 2026-10-06: no "all day" line and no "stationen"');
    assert.equal((html.match(/class="quantity">1<\/strong>/g) ?? []).length, 2);
    assert.doesNotMatch(html, /ready-entry-handoff-qr|JY_HANDOFF|Förstora QR-kod/, 'the number is enough; the QR stays in the backend');
    assert.doesNotMatch(html, /Ny besökare|Skriv ut|NOT_A_VALID|DESIGN_PREVIEW/);
});

test('ready phone and shell eligibility agree for sms/park, preserving case-insensitive server status', () => {
    for (const channel of ['sms', 'park-qr']) {
        assert.equal(isPhoneCompletionReady({ ...session, status: 'READY_FOR_STAFF', handoffStatus: 'not_ready' }, channel), true);
        assert.match(render({ channel }), /data-phone-completion="true"/);
    }
});

for (const [label, changes] of [
    ['null session', { checkinSession: null }],
    ['missing session id', { checkinSession: { ...session, checkinSessionId: '' } }],
    ['missing number', { checkinSession: { ...session, handoffCode: '' } }],
    ['not ready', { checkinSession: { ...session, status: 'active', handoffStatus: 'not_ready' } }],
    ['already checked in', { alreadyCheckedIn: true }],
    ['kiosk channel', { channel: 'kiosk' }],
]) test(`${label}: does not claim a new ready phone handoff`, () => {
    const html = render(changes);
    assert.doesNotMatch(html, /data-phone-completion="true"|Du är incheckad/);
    assert.equal(isPhoneCompletionReady(changes.checkinSession === undefined ? session : changes.checkinSession,
        changes.channel ?? 'park-qr', changes.alreadyCheckedIn), false);
});

// GH-453 (D0229): after admission the same visit day keeps its number instead of a dead end.
for (const [label, changes] of [
    ['redeemed', { status: 'redeemed' }],
    ['completed handoff', { handoffStatus: 'completed' }],
    ['completed', { status: 'completed' }],
]) test(`${label} today: keeps the number and says checked in`, () => {
    const admitted = { ...session, ...changes, completedAt: `${TODAY}T11:45:00.000Z` };
    assert.equal(isPhoneCompletionReady(admitted, 'park-qr', true), true);
    const html = render({ checkinSession: admitted, alreadyCheckedIn: true });
    for (const value of ['data-presence="arrived"', 'Du är incheckad', '>0001</strong>', 'Sedan 13:45']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /Redan incheckad/);
});

test('a session of an earlier day says the visit is over and shows no list', () => {
    const old = { ...session, status: 'redeemed', handoffDay: '2026-09-22' };
    assert.equal(isVisitDayOver(old), true);
    assert.equal(isVisitDayOver(session), false);
    const html = render({ checkinSession: old });
    for (const value of ['data-presence="ended"', 'Besöket är avslutat', 'Nummer 0001 gällde bara tisdag 22 september.']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /Bandutlämning|Caféet|step-bands|step-cafe|number-issued/);
});

test('a redemption without our session (for example at kassan) still shows the generic already-checked-in view', () => {
    const html = render({ checkinSession: null, alreadyCheckedIn: true });
    assert.match(html, /Redan incheckad/);
    assert.match(html, /SYNTHETIC/);
});

test('long legacy code is unchanged and uses wrapping treatment', () => {
    const code = 'ABCDEFGHIJKLMNOP0123456789';
    const html = render({ checkinSession: { ...session, handoffCode: code } });
    assert.match(html, /data-long="true"/);
    assert.ok(html.includes(`>${code}</strong>`));
});

test('Combo uses two bands and one later pizza, keeping package detail and no invented extras', () => {
    const html = render({ booking: { ...booking, admissionItems: [{ label: 'Weekday Combo', quantity: 1, packageContents: [
        { kind: 'admission', quantity: 2, durationMinutes: 60, collection: 'checkin' },
        { kind: 'pizza', quantity: 1, collection: 'later' },
    ] }] } });
    for (const value of ['Besöksband 60 min', 'class="quantity">2</strong>', 'Pizza att dela',
        'class="quantity">1</strong>', 'confirmation-later', 'Weekday Combo', 'Caféet', 'Bandutlämning']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /Strumpstation/, 'no socks bought, so no sock station');
    assert.doesNotMatch(html, /Strumpor|Vattenflaska/);
});

// GH-459: band colours come from JumpYard Cloud's scheme; the phone only shows them.
const { bandColourForAdmission, bandColourForEndTime } = require('../../../infra/lambda/shared/band-colours.js');
const { normalizeBandColour } = load('flow/bandColours.ts');
const cloudBand = (startTime, durationMinutes, quantity) => ({
    ...normalizeBandColour(bandColourForAdmission({ startTime, durationMinutes })), quantity });

test('ready phone shows the band colour with a swatch and its Swedish or English name', () => {
    const coloured = { ...booking, time: '11:30', durationMinutes: 90, productLabel: '90 min entré', jumpers: 3,
        bandColours: [cloudBand('11:30', 90, 3)] };
    const sv = render({ booking: coloured, jumperCount: 3 });
    for (const value of ['data-testid="band-colours"', 'data-band-colour="morkbla"', 'background:#1F3A93', '>Mörkblå<', '>Armbandsfärg:<']) {
        assert.ok(sv.includes(value), value);
    }
    assert.doesNotMatch(sv, / × /, 'one colour for the whole row needs no count');
    const en = render({ booking: coloured, jumperCount: 3 }, 'en');
    assert.ok(en.includes('>Dark blue<') && en.includes('>Wristband colour:<'));
    assert.equal((en.match(/data-band-colour=/g) ?? []).length, 1);
});

test('two-tone bands draw both colours; the 120-minute example shows Gul', () => {
    const twoTone = render({ booking: { ...booking, bandColours: [cloudBand('14:00', 60, 1)] } });
    assert.ok(twoTone.includes('linear-gradient(90deg, #141414 50%, #E2231A 50%)'));
    assert.ok(twoTone.includes('>Svart/Röd<'));
    const gul = render({ booking: { ...booking, jumpers: 2, bandColours: [cloudBand('13:30', 120, 2)] }, jumperCount: 2 });
    assert.ok(gul.includes('data-band-colour="gul"') && gul.includes('>Gul<'));
});

test('mixed durations count each colour; a Combo shows its colour on the bands, never on the pizza', () => {
    const mixed = render({ booking: { ...booking, jumpers: 3, bandColours: [cloudBand('11:30', 90, 2), cloudBand('11:30', 60, 1)] }, jumperCount: 3 });
    assert.ok(mixed.includes('>2 × Mörkblå<') && mixed.includes('>1 × Röd<'));
    const combo = render({ booking: { ...booking, admissionItems: [{ label: 'Weekday Combo', quantity: 1,
        bandColour: normalizeBandColour(bandColourForAdmission({ startTime: '12:00', durationMinutes: 60 })), packageContents: [
            { kind: 'admission', quantity: 2, durationMinutes: 60, collection: 'checkin' },
            { kind: 'pizza', quantity: 1, collection: 'later' },
        ] }] } });
    const [handout, later] = combo.split('data-testid="confirmation-later"');
    assert.ok(handout.includes('data-band-colour="morkbla"'));
    assert.doesNotMatch(later, /data-band-colour/);
});

test('no colour is shown when Cloud sends none, or sends something malformed', () => {
    assert.doesNotMatch(render(), /band-colours|data-band-colour/);
    assert.equal(bandColourForAdmission({ startTime: '19:30', durationMinutes: 60 }), null, '20:30 is not on the chart');
    for (const value of [null, {}, { id: 'x', name: { sv: 'X' }, swatch: ['#000000'] },
        { id: 'x', name: { sv: 'X', en: 'X' }, swatch: ['red'] }, { id: 'x', name: { sv: 'X', en: 'X' }, swatch: ['#000000;x'] },
        { id: 'x', name: { sv: 'X', en: 'X' }, swatch: ['#000000', '#111111', '#222222'] }]) assert.equal(normalizeBandColour(value), undefined);
});

test('the local completion preview uses exactly the colours Cloud sends', () => {
    const { PREVIEW_BAND_COLOURS } = load('app/preview/completion/bandFixtures.ts');
    for (const [endTime, colour] of Object.entries(PREVIEW_BAND_COLOURS)) {
        assert.deepEqual(colour, normalizeBandColour(bandColourForEndTime(endTime)), endTime);
    }
});

test('a home check-in through the email link is checked in too, without a reset callback (GH-456)', () => {
    const html = render({ channel: 'sms' }, 'en');
    for (const value of ['You are checked in', 'Your number', 'Wristband desk', 'Number from', 'data-presence="arrived"']) {
        assert.ok(html.includes(value), value);
    }
    assert.doesNotMatch(html, /Receipt sent/, 'a home check-in paid nothing now, so no receipt line');
    assert.doesNotMatch(html, /scan the sign|You are all set|Enlarge QR code/);
    assert.doesNotMatch(html, /confirmation-start-over/);
    assert.match(render({ onStartOver() { assert.fail('Render must never reset'); } }), /confirmation-start-over/);
});

test('Cloud café lines replace the phone grouping and show what is left (GH-453)', () => {
    const withCafe = { ...session, cafe: [
        { id: 'pizza-1', kind: 'pizza', name: 'Pizza', detail: 'Weekday Combo', quantity: 1, collected: 1, remaining: 0 },
        { id: 'coffee-1', kind: 'coffee', name: 'Kaffe', detail: null, quantity: 2, collected: 0, remaining: 2 },
    ] };
    const html = render({ checkinSession: withCafe, selectedAddons: [{ id: 'coffee', label: 'Coffee', qty: 9, price: 0 }] });
    for (const value of ['Kvar i caféet', 'Kaffe', 'combo-pizza.png', 'data-collected="true"']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /class="quantity">9<\/strong>/, 'the phone no longer counts café items itself when Cloud answered');
    const none = render({ checkinSession: { ...session, cafe: [] }, selectedAddons: [{ id: 'coffee', label: 'Coffee', qty: 1, price: 0 }] });
    assert.doesNotMatch(none, /confirmation-later/, 'an empty Cloud list means nothing to collect at the café');
});

// GH-453/GH-456: day states of the completion view. #491: three places to collect things.
const { PhoneCompletion } = load('components/PhoneCompletion.tsx');
const station = [
    { key: 'socks', title: '', items: [{ icon: 'grip-socks', label: 'Strumpor', qty: 2 }] },
    { key: 'bands', title: '', items: [{ icon: 'visitor-wristband', label: 'Besöksband 60 min', qty: 2 }] },
];
const cafe = (pizza, coffee) => [...station, { key: 'later', title: '', items: [
    { icon: 'combo-pizza', label: 'Pizza att dela', qty: 1 - pizza, collected: pizza },
    { icon: 'drink-cup', label: 'Kaffe', qty: 2 - coffee, collected: coffee },
] }];
function day(props, lang = 'sv') {
    return renderToStaticMarkup(React.createElement(PhoneCompletion, { lang, onLanguageChange() {}, handoffCode: '0427',
        handoffPayload: 'JY_HANDOFF:0427:synthetic-session', sessionId: 'synthetic-session', groups: cafe(0, 0), ...props }));
}

test('arrived shows the check-in time and one banner per place: sock station, wristband desk, café (#491)', () => {
    const html = day({ presence: 'arrived', checkedInAt: '13:45' });
    for (const value of ['Du är incheckad', 'Sedan 13:45', 'data-presence="arrived"']) assert.ok(html.includes(value), value);
    assert.match(html, /data-tone="socks" data-testid="step-socks">[\s\S]*>Strumpstation<\/span><span class="stepHint">Ta själv\.</);
    assert.match(html, /data-tone="bands" data-testid="step-bands">[\s\S]*>Bandutlämning<\/span><span class="stepHint">Visa numret\.</);
    assert.match(html, /data-tone="cafe" data-testid="step-cafe">[\s\S]*>Caféet<\/span><span class="stepHint">Visa numret\.</);
    assert.ok(html.indexOf('step-socks') < html.indexOf('step-bands') && html.indexOf('step-bands') < html.indexOf('step-cafe'),
        'the order the guest meets them');
    // The café also hands out the water bottle, so its line no longer says "after jumping".
    assert.doesNotMatch(html, /Hämta på plats|Innan ni hoppar|Efter hoppet/);
    // Love, 2026-10-06: short sentences without dashes.
    assert.doesNotMatch(html, /[–—]/);
    const en = day({ presence: 'arrived', checkedInAt: '13:45' }, 'en');
    for (const value of ['Sock station', 'Help yourself.', 'Wristband desk', 'The café', 'Show your number.'])
        assert.ok(en.includes(value), value);
    assert.doesNotMatch(en, /Collect on site|After jumping/);
    assert.match(day({ presence: 'arrived', checkedInAt: '2026-10-17T11:45:00.000Z' }), /Sedan 13:45/, 'ISO times show in Nacka time');
});

test('a guest who just paid sees that the receipt was emailed, with the brand icon (#491)', () => {
    const html = day({ presence: 'arrived', receiptSent: true });
    assert.match(html, /data-testid="receipt-sent"><img src="\/jumpyard-next-icons\/email-confirmed\.png"[^>]*><span>Kvitto skickat till din e-post<\/span>/);
    assert.ok(html.indexOf('receipt-sent') < html.indexOf('step-socks'), 'right under the number');
    assert.ok(day({ presence: 'arrived', receiptSent: true }, 'en').includes('Receipt sent to your email'));
    assert.doesNotMatch(day({ presence: 'arrived' }), /receipt-sent/, 'no payment now, no receipt line');
    assert.doesNotMatch(day({ presence: 'ended', receiptSent: true }), /receipt-sent/, 'not on an earlier day');
});

test('café rows show what is left, what was collected, and when everything is collected', () => {
    const partial = day({ presence: 'arrived', groups: cafe(1, 0) });
    assert.ok(partial.includes('Kvar i caféet'));
    assert.ok(partial.includes('data-collected="true"'));
    assert.ok(partial.includes('Hämtat'));
    const done = day({ presence: 'arrived', groups: cafe(1, 2) });
    assert.ok(done.includes('Allt i caféet är hämtat'));
    assert.match(done, /data-tone="done"/);
    assert.doesNotMatch(done.split('data-testid="step-cafe"')[1], /Visa numret\./, 'nothing left to show the number for at the café');
});

test('after the visit day there is no QR code and no café list', () => {
    const html = day({ presence: 'ended', visitDayLabel: 'lördag 17 oktober' });
    assert.ok(html.includes('Besöket är avslutat'));
    assert.ok(html.includes('Nummer 0427 gällde bara lördag 17 oktober.'));
    assert.doesNotMatch(html, /ready-entry-handoff-qr|JY_HANDOFF|Caféet|Bandutlämning|Strumpstation|number-issued/);
});

// #491 (workshop 2026-10-07): three places replace "Hämta på plats"; water is collected in the café.
const { buildPickupGroups, PICKUP_PLACE_BY_ADDON } = load('flow/pickupPlaces.ts');
const shopping = [
    { id: 'socks', label: 'Strumpor', qty: 2, price: 49 }, { id: 'water_bottle', label: 'Vattenflaska', qty: 1, price: 20 },
    { id: 'coffee', label: 'Bryggkaffe', qty: 2, price: 35 }, { id: 'lock', label: 'Hänglås', qty: 1, price: 45 },
    { id: 'skyrider', label: 'SkyRider', qty: 2, price: 40 },
];

test('every add-on has one place: socks at the station, bands, SkyRider and padlocks at the desk, coffee and water at the café', () => {
    assert.deepEqual({ ...PICKUP_PLACE_BY_ADDON }, { socks: 'socks', connected: 'bands', lock: 'bands', skyrider: 'bands',
        coffee: 'later', water_bottle: 'later', extra_person: 'other' });
    const groups = buildPickupGroups({ contentRows: [{ key: 'entry', kind: 'admission', quantity: 2, collection: 'checkin', label: '90 min entré' }],
        selectedAddons: shopping, cloudCafe: null, labels: { connectedBands: 'Connected-band', later: 'Hämtas efter hoppet', other: 'Övrigt' } });
    assert.deepEqual(groups.map((group) => [group.key, group.items.map((item) => item.label)]), [
        ['socks', ['Strumpor']], ['bands', ['90 min entré', 'Hänglås', 'SkyRider']], ['later', ['Vattenflaska', 'Bryggkaffe']],
    ]);
});

test('completion with water and coffee: sock station, wristband desk with colour, café with both, receipt line', () => {
    const html = render({ booking: { ...booking, jumpers: 2, durationMinutes: 90, productLabel: '90 min entré', bandColours: [cloudBand('14:00', 90, 2)] },
        jumperCount: 2, selectedAddons: shopping, receiptSent: true });
    const [beforeBands, afterBands] = html.split('data-testid="step-bands"');
    const [bands, cafePart] = afterBands.split('data-testid="step-cafe"');
    assert.ok(beforeBands.includes('Strumpstation') && beforeBands.includes('Strumpor'));
    for (const value of ['90 min entré', '>Armbandsfärg:<', 'Hänglås', 'SkyRider', 'zipline.png', 'padlock.png']) assert.ok(bands.includes(value), value);
    for (const value of ['Caféet', 'Vattenflaska', 'water-bottle.png', 'Bryggkaffe']) assert.ok(cafePart.includes(value), value);
    assert.doesNotMatch(bands, /Vattenflaska/, 'water is no longer handed out at the entrance');
    assert.match(html, /Kvitto skickat till din e-post/);
});

test('completion of a Weekday Combo: two coloured bands at the desk, the pizza at the café, no sock station', () => {
    const html = render({ booking: { ...booking, jumpers: 2, admissionItems: [{ label: 'Weekday Combo', quantity: 1,
        bandColour: normalizeBandColour(bandColourForAdmission({ startTime: '14:00', durationMinutes: 60 })), packageContents: [
            { kind: 'admission', quantity: 2, durationMinutes: 60, collection: 'checkin' },
            { kind: 'pizza', quantity: 1, collection: 'later' },
        ] }] }, jumperCount: 2, receiptSent: true });
    const [bands, cafePart] = html.split('data-testid="step-cafe"');
    assert.ok(bands.includes('Bandutlämning') && bands.includes('Besöksband 60 min') && bands.includes('data-band-colour="svart-rod"'));
    assert.ok(cafePart.includes('Pizza att dela') && cafePart.includes('combo-pizza.png'));
    assert.doesNotMatch(html, /Strumpstation|step-socks/);
});

test('Cloud café lines carry water with its bottle icon; a Cloud before #491 still shows the bought bottle at the café', () => {
    const withWater = { ...session, cafe: [
        { id: 'water-1', kind: 'water', name: 'JumpYard Vatten', detail: null, quantity: 1, collected: 0, remaining: 1 },
        { id: 'coffee-1', kind: 'coffee', name: 'Bryggkaffe', detail: null, quantity: 2, collected: 0, remaining: 2 },
    ] };
    const html = render({ checkinSession: withWater, selectedAddons: shopping });
    const cafePart = html.split('data-testid="step-cafe"')[1];
    assert.ok(cafePart.includes('JumpYard Vatten') && cafePart.includes('water-bottle.png'));
    assert.doesNotMatch(cafePart, />Vattenflaska</, 'Cloud\'s line replaces the phone\'s own row');
    const oldCloud = render({ checkinSession: { ...session, cafe: [withWater.cafe[1]] }, selectedAddons: shopping });
    const oldCafe = oldCloud.split('data-testid="step-cafe"')[1];
    assert.ok(oldCafe.includes('Vattenflaska') && oldCafe.includes('Bryggkaffe'));
    assert.doesNotMatch(oldCloud.split('data-testid="step-cafe"')[0], /Vattenflaska/);
});
