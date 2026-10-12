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
/** #504: the count of a chip, and the one word under it. */
const chipCounts = (html) => [...html.matchAll(/class="chipCount">(\d+)<\/strong>/g)].map(([, count]) => Number(count));
const chipWords = (html) => [...html.matchAll(/class="chipWord"[^>]*>(?:<span class="swatch"[^>]*><\/span>)?([^<]+)<\/span>/g)].map(([, word]) => word);

test('ready phone keeps the server number, day and quantity one, and shows no QR code (GH-456)', () => {
    const html = render({ selectedAddons: [{ id: 'socks', label: 'Strumpor', price: 45, qty: 1 }] });
    for (const value of ['data-phone-completion="true"', 'Du är incheckad', '>0001</strong>', 'data-handoff-code="0001"',
        'Nummer från', `data-day="${TODAY}"`]) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /Numret gäller hela dagen|\bstationen\b/i, 'Love, 2026-10-06: no "all day" line and no "stationen"');
    // #504: one chip for the socks and one for the band, each with its count and one word.
    assert.deepEqual(chipCounts(html), [1, 1]);
    assert.deepEqual(chipWords(html), ['Strumpor', 'Band']);
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
    assert.doesNotMatch(html, /Bandutlämning|Caféet|step-bands|step-cafe|number-issued|route-heading/);
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

test('Combo uses two bands and one later pizza, with no invented extras', () => {
    const html = render({ booking: { ...booking, admissionItems: [{ label: 'Weekday Combo', quantity: 1, packageContents: [
        { kind: 'admission', quantity: 2, durationMinutes: 60, collection: 'checkin' },
        { kind: 'pizza', quantity: 1, collection: 'later' },
    ] }] } });
    const [handout, later] = html.split('data-testid="confirmation-later"');
    assert.deepEqual([chipCounts(handout), chipWords(handout)], [[2], ['Band']]);
    assert.deepEqual([chipCounts(later), chipWords(later)], [[1], ['Pizza']]);
    for (const value of ['Bandutlämningen', 'Hämta band<', 'Caféet', 'combo-pizza.png']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /Strumpstation/, 'no socks bought, so no sock station');
    assert.doesNotMatch(html, /Strumpor|Vattenflaska|>Vatten</);
});

// GH-459: band colours come from JumpYard Cloud's scheme; the phone only shows them.
const { bandColourForAdmission, bandColourForEndTime } = require('../../../infra/lambda/shared/band-colours.js');
const { normalizeBandColour } = load('flow/bandColours.ts');
const cloudBand = (startTime, durationMinutes, quantity) => ({
    ...normalizeBandColour(bandColourForAdmission({ startTime, durationMinutes })), quantity });

test('ready phone shows the band colour as a swatch and its Swedish or English name on the band chip (#504)', () => {
    const coloured = { ...booking, time: '11:30', durationMinutes: 90, productLabel: '90 min entré', jumpers: 3,
        bandColours: [cloudBand('11:30', 90, 3)] };
    const sv = render({ booking: coloured, jumperCount: 3 });
    for (const value of ['data-band-colour="morkbla"', 'background:#1F3A93', '>Mörkblå<']) assert.ok(sv.includes(value), value);
    assert.deepEqual(chipCounts(sv), [3], 'one chip for all three bands of one colour');
    assert.doesNotMatch(sv, / × |Armbandsfärg/, 'the chip carries the count; the swatch says it is the band');
    const en = render({ booking: coloured, jumperCount: 3 }, 'en');
    assert.ok(en.includes('>Dark blue<'));
    assert.equal((en.match(/data-band-colour=/g) ?? []).length, 1);
});

test('two-tone bands draw both colours; the 120-minute example shows Gul', () => {
    const twoTone = render({ booking: { ...booking, bandColours: [cloudBand('14:00', 60, 1)] } });
    assert.ok(twoTone.includes('linear-gradient(90deg, #141414 50%, #E2231A 50%)'));
    assert.ok(twoTone.includes('>Svart/Röd<'));
    const gul = render({ booking: { ...booking, jumpers: 2, bandColours: [cloudBand('13:30', 120, 2)] }, jumperCount: 2 });
    assert.ok(gul.includes('data-band-colour="gul"') && gul.includes('>Gul<'));
});

test('mixed durations get one chip per colour; a Combo shows its colour on the bands, never on the pizza', () => {
    const mixed = render({ booking: { ...booking, jumpers: 3, bandColours: [cloudBand('11:30', 90, 2), cloudBand('11:30', 60, 1)] }, jumperCount: 3 });
    assert.match(mixed, /data-band-colour="morkbla"><span class="chipTop">[\s\S]*?class="chipCount">2<\/strong>/);
    assert.match(mixed, /data-band-colour="rod"><span class="chipTop">[\s\S]*?class="chipCount">1<\/strong>/);
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
    for (const value of ['You are checked in', 'Your number', 'Wristband desk', 'Number from', 'data-presence="arrived"',
        'When you arrive at JumpYard', 'Skip the till and go straight to step 1.']) {
        assert.ok(html.includes(value), value);
    }
    assert.doesNotMatch(html, /Receipt sent/, 'a home check-in paid nothing now, so no receipt line');
    assert.doesNotMatch(html, /scan the sign|You are all set|Enlarge QR code|What to do now/);
    assert.doesNotMatch(html, /confirmation-start-over/);
    assert.match(render({ onStartOver() { assert.fail('Render must never reset'); } }), /confirmation-start-over/);
});

test('Cloud café lines replace the phone grouping and show what is left (GH-453)', () => {
    const withCafe = { ...session, cafe: [
        { id: 'pizza-1', kind: 'pizza', name: 'Pizza', detail: 'Weekday Combo', quantity: 1, collected: 1, remaining: 0 },
        { id: 'coffee-1', kind: 'coffee', name: 'Kaffe', detail: null, quantity: 2, collected: 0, remaining: 2 },
    ] };
    const html = render({ checkinSession: withCafe, selectedAddons: [{ id: 'coffee', label: 'Coffee', qty: 9, price: 0 }] });
    for (const value of ['Kvar i caféet', '>Kaffe<', 'combo-pizza.png', 'data-collected="true"']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /class="chipCount">9<\/strong>/, 'the phone no longer counts café items itself when Cloud answered');
    const none = render({ checkinSession: { ...session, cafe: [] }, selectedAddons: [{ id: 'coffee', label: 'Coffee', qty: 1, price: 0 }] });
    assert.doesNotMatch(none, /confirmation-later/, 'an empty Cloud list means nothing to collect at the café');
});

// GH-453/GH-456: day states of the completion view. #491: the places to collect things.
// #504 (Love, 2026-10-12, "A lättare"): a route of numbered steps with chips, then the café.
const { PhoneCompletion, buildCompletionChips, bandsStepTitle } = load('components/PhoneCompletion.tsx');
const station = [
    { key: 'socks', title: '', items: [{ icon: 'grip-socks', label: 'Strumpor', qty: 2, kind: 'socks' }] },
    { key: 'bands', title: '', items: [{ icon: 'visitor-wristband', label: 'Besöksband 60 min', qty: 2, kind: 'admission' }] },
];
const cafe = (pizza, coffee) => [...station, { key: 'later', title: '', items: [
    { icon: 'combo-pizza', label: 'Pizza att dela', qty: 1 - pizza, collected: pizza, kind: 'pizza' },
    { icon: 'drink-cup', label: 'Bryggkaffe', qty: 2 - coffee, collected: coffee },
] }];
function day(props, lang = 'sv') {
    return renderToStaticMarkup(React.createElement(PhoneCompletion, { lang, onLanguageChange() {}, handoffCode: '0427',
        handoffPayload: 'JY_HANDOFF:0427:synthetic-session', sessionId: 'synthetic-session', groups: cafe(0, 0), ...props }));
}
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('arrived shows the check-in time and the route: 1 socks, 2 bands, 3 jump, then the café (#504)', () => {
    const html = day({ presence: 'arrived', checkedInAt: '13:45', onSite: true });
    for (const value of ['Du är incheckad', 'Sedan 13:45', 'data-presence="arrived"', 'data-on-site="true"']) assert.ok(html.includes(value), value);
    assert.match(text(html), /Gör så här nu 1 Strumpstationen Hämta strumpor 2 Strumpor 2 Bandutlämningen · Visa numret Hämta band 2 Band 3 Hoppa! Caféet När ni vill · Visa numret 1 Pizza 2 Bryggkaffe/);
    assert.match(html, /data-step="socks" data-first="true"/, 'step 1 is red');
    assert.doesNotMatch(html, /data-step="bands" data-first/);
    assert.doesNotMatch(html, /Gå förbi kassan/, 'on site the guest is already past the till');
    // Love: short words, no sentences with dashes, no grey.
    assert.doesNotMatch(html, /[–—]|Hämta på plats|Innan ni hoppar|Efter hoppet|Ta själv\./);
    const en = text(day({ presence: 'arrived', checkedInAt: '13:45', onSite: true }, 'en'));
    assert.match(en, /What to do now 1 Sock station Get your socks 2 Socks 2 Wristband desk · Show your number Get your bands 2 Wristband 3 Jump! The café Whenever you like · Show your number 1 Pizza 2 Bryggkaffe/);
    assert.match(day({ presence: 'arrived', checkedInAt: '2026-10-17T11:45:00.000Z' }), /Sedan 13:45/, 'ISO times show in Nacka time');
});

test('away from the park the route says what to do on arrival, past the till (#504)', () => {
    const html = day({ presence: 'arrived' });
    assert.ok(html.includes('data-on-site="false"'));
    assert.match(text(html), /När ni kommer till JumpYard Gå förbi kassan, direkt till steg 1\. 1 Strumpstationen Hämta strumpor/);
    assert.doesNotMatch(html, /Gör så här nu/);
});

test('steps are numbered from 1 by what there is to collect; the bands title names the extras (#504)', () => {
    const bandsOnly = day({ presence: 'arrived', onSite: true, groups: [station[1]] });
    assert.match(text(bandsOnly), /Gör så här nu 1 Bandutlämningen · Visa numret Hämta band 2 Band 2 Hoppa!/);
    assert.match(bandsOnly, /data-step="bands" data-first="true"/, 'without socks the desk is step 1, in red');
    assert.doesNotMatch(bandsOnly, /Strumpstationen|confirmation-later/);
    const extras = [{ icon: 'visitor-wristband', label: '90 min entré', qty: 2, kind: 'admission' },
        { icon: 'padlock', label: 'Hänglås', qty: 1, kind: 'lock' }, { icon: 'zipline', label: 'SkyRider', qty: 1, kind: 'skyrider' }];
    assert.equal(bandsStepTitle(extras, 'sv'), 'Hämta band och tillbehör');
    assert.equal(bandsStepTitle(extras, 'en'), 'Get bands and extras');
    assert.equal(bandsStepTitle(extras.slice(0, 1), 'sv'), 'Hämta band');
    assert.equal(bandsStepTitle(extras.slice(1), 'sv'), 'Hämta tillbehör');
});

test('band chips merge rows of one colour and keep a plain band for bands without one (#504)', () => {
    const gul = { id: 'gul', name: { sv: 'Gul', en: 'Yellow' }, swatch: ['#FFD200'] };
    const rod = { id: 'rod', name: { sv: 'Röd', en: 'Red' }, swatch: ['#E2231A'] };
    const chips = buildCompletionChips([
        { icon: 'visitor-wristband', label: '90 min entré', qty: 2, kind: 'admission', bandColours: [{ ...gul, quantity: 2 }] },
        { icon: 'visitor-wristband', label: '90 min familj', qty: 3, kind: 'admission', bandColours: [{ ...gul, quantity: 2 }, { ...rod, quantity: 1 }] },
        { icon: 'visitor-wristband', label: 'Okänd', qty: 1, kind: 'admission' },
        { icon: 'padlock', label: 'Hänglås', qty: 1, kind: 'lock' },
        { icon: 'connected-band', label: 'Connected-band', qty: 2, kind: 'connected' },
    ], 'sv');
    assert.deepEqual(chips.map((chip) => [chip.word, chip.qty, chip.colourId ?? null]),
        [['Gul', 4, 'gul'], ['Röd', 1, 'rod'], ['Band', 1, null], ['Hänglås', 1, null], ['Connected', 2, null]]);
});

test('a guest who just paid sees that the receipt was emailed, in the footer above the new booking (#504)', () => {
    const html = day({ presence: 'arrived', receiptSent: true, onStartOver() {} });
    assert.match(html, /data-testid="receipt-sent"><img src="\/jumpyard-next-icons\/email-confirmed\.png"[^>]*><span>Kvitto skickat till din e-post<\/span>/);
    assert.ok(html.indexOf('step-jump') < html.indexOf('receipt-sent') && html.indexOf('receipt-sent') < html.indexOf('confirmation-start-over'),
        'after the route, above "Gör en ny bokning", so the steps come first');
    assert.ok(day({ presence: 'arrived', receiptSent: true }, 'en').includes('Receipt sent to your email'));
    assert.doesNotMatch(day({ presence: 'arrived' }), /receipt-sent/, 'no payment now, no receipt line');
    assert.doesNotMatch(day({ presence: 'ended', receiptSent: true }), /receipt-sent/, 'not on an earlier day');
});

test('café chips show what is left, what was collected, and when everything is collected', () => {
    const partial = day({ presence: 'arrived', groups: cafe(1, 0) });
    assert.ok(partial.includes('Kvar i caféet'));
    assert.ok(partial.includes('data-collected="true"'));
    assert.ok(partial.includes('>Hämtat<'));
    const done = day({ presence: 'arrived', groups: cafe(1, 2) });
    assert.ok(done.includes('Allt i caféet är hämtat'));
    assert.match(done, /data-tone="done"/);
    assert.doesNotMatch(done.split('data-testid="step-cafe"')[1], /Visa numret/, 'nothing left to show the number for at the café');
});

test('after the visit day there is no QR code and no café list', () => {
    const html = day({ presence: 'ended', visitDayLabel: 'lördag 17 oktober' });
    assert.ok(html.includes('Besöket är avslutat'));
    assert.ok(html.includes('Nummer 0427 gällde bara lördag 17 oktober.'));
    assert.doesNotMatch(html, /ready-entry-handoff-qr|JY_HANDOFF|Caféet|Bandutlämning|Strumpstation|number-issued|data-on-site/);
});

// #491 (workshop 2026-10-07): three places replace "Hämta på plats"; water is collected in the café.
const { buildPickupGroups, PICKUP_PLACE_BY_ADDON } = load('flow/pickupPlaces.ts');
const shopping = [
    { id: 'socks', label: 'Strumpor', qty: 2, price: 49 }, { id: 'water_bottle', label: 'Vatten', qty: 1, price: 20 },
    { id: 'coffee', label: 'Bryggkaffe', qty: 2, price: 35 }, { id: 'lock', label: 'Hänglås', qty: 1, price: 45 },
    { id: 'skyrider', label: 'SkyRider', qty: 2, price: 40 },
];

test('every add-on has one place: socks at the station, bands, SkyRider and padlocks at the desk, coffee and water at the café', () => {
    assert.deepEqual({ ...PICKUP_PLACE_BY_ADDON }, { socks: 'socks', connected: 'bands', lock: 'bands', skyrider: 'bands',
        coffee: 'later', water_bottle: 'later', extra_person: 'other' });
    const groups = buildPickupGroups({ contentRows: [{ key: 'entry', kind: 'admission', quantity: 2, collection: 'checkin', label: '90 min entré' }],
        selectedAddons: shopping, cloudCafe: null, labels: { connectedBands: 'Connected-band', later: 'Hämtas efter hoppet', other: 'Övrigt' } });
    assert.deepEqual(groups.map((group) => [group.key, group.items.map((item) => [item.label, item.kind ?? null, item.icon])]), [
        ['socks', [['Strumpor', 'socks', 'grip-socks']]],
        ['bands', [['90 min entré', 'admission', 'visitor-wristband'], ['Hänglås', 'lock', 'padlock'], ['SkyRider', 'skyrider', 'zipline']]],
        ['later', [['Vatten', 'water', 'water'], ['Bryggkaffe', null, 'drink-cup']]],
    ]);
});

test('completion with water and coffee: sock station, desk with colour and extras, café with both, receipt line', () => {
    const html = render({ booking: { ...booking, jumpers: 2, durationMinutes: 90, productLabel: '90 min entré', bandColours: [cloudBand('14:00', 90, 2)] },
        jumperCount: 2, selectedAddons: shopping, receiptSent: true, onSite: true });
    const [beforeBands, afterBands] = html.split('data-testid="step-bands"');
    const [bands, cafePart] = afterBands.split('data-testid="step-cafe"');
    assert.ok(beforeBands.includes('Strumpstationen') && beforeBands.includes('>Strumpor<') && beforeBands.includes('Gör så här nu'));
    assert.ok(bands.startsWith('>Hämta band och tillbehör<'), 'the desk hands out more than bands');
    for (const value of ['data-band-colour=', 'Hänglås', 'SkyRider', 'zipline.png', 'padlock.png']) assert.ok(bands.includes(value), value);
    for (const value of ['Caféet', '>Vatten<', '/jumpyard-next-icons/water.png', 'Bryggkaffe']) assert.ok(cafePart.includes(value), value);
    assert.doesNotMatch(bands, /Vatten/, 'water is not handed out at the desk');
    assert.doesNotMatch(html, /Vattenflaska|water-bottle/);
    assert.match(html, /Kvitto skickat till din e-post/);
});

test('completion of a Weekday Combo: two coloured bands at the desk, the pizza at the café, no sock station', () => {
    const html = render({ booking: { ...booking, jumpers: 2, admissionItems: [{ label: 'Weekday Combo', quantity: 1,
        bandColour: normalizeBandColour(bandColourForAdmission({ startTime: '14:00', durationMinutes: 60 })), packageContents: [
            { kind: 'admission', quantity: 2, durationMinutes: 60, collection: 'checkin' },
            { kind: 'pizza', quantity: 1, collection: 'later' },
        ] }] }, jumperCount: 2, receiptSent: true });
    const [bands, cafePart] = html.split('data-testid="step-cafe"');
    assert.ok(bands.includes('Bandutlämningen') && bands.includes('data-band-colour="svart-rod"') && bands.includes('>Svart/Röd<'));
    assert.deepEqual(chipCounts(bands), [2]);
    assert.ok(cafePart.includes('>Pizza<') && cafePart.includes('combo-pizza.png'));
    assert.doesNotMatch(html, /Strumpstation|step-socks/);
});

test('Cloud café lines carry water with its icon; a Cloud before #491 still shows the bought water at the café', () => {
    const withWater = { ...session, cafe: [
        { id: 'water-1', kind: 'water', name: 'JumpYard Vatten', detail: null, quantity: 1, collected: 0, remaining: 1 },
        { id: 'coffee-1', kind: 'coffee', name: 'Bryggkaffe', detail: null, quantity: 2, collected: 0, remaining: 2 },
    ] };
    const html = render({ checkinSession: withWater, selectedAddons: shopping });
    const cafePart = html.split('data-testid="step-cafe"')[1];
    assert.deepEqual(chipWords(cafePart), ['Vatten', 'Bryggkaffe'], 'ROLLER\'s "JumpYard Vatten" is plain "Vatten" on the chip');
    assert.ok(cafePart.includes('/jumpyard-next-icons/water.png'));
    const oldCloud = render({ checkinSession: { ...session, cafe: [withWater.cafe[1]] }, selectedAddons: shopping });
    const [beforeCafe, oldCafe] = oldCloud.split('data-testid="step-cafe"');
    assert.deepEqual(chipWords(oldCafe), ['Bryggkaffe', 'Vatten']);
    assert.doesNotMatch(beforeCafe, />Vatten</);
});

// #504: the guest is on site after the sign link or the kiosk's phone link; the tab remembers it for the day.
const { isSignArrival, rememberOnSite, wasOnSiteToday } = load('flow/arrival.ts');

test('the sign link marks the guest as on site for the day in this tab (#504)', () => {
    assert.equal(isSignArrival(new URLSearchParams('skylt=nacka')), true);
    assert.equal(isSignArrival(new URLSearchParams('skylt=')), false);
    assert.equal(isSignArrival(new URLSearchParams('jy_token=abc&park=1')), false, 'the email link and the old park link are not the sign');
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    assert.equal(wasOnSiteToday(storage, '2026-10-17'), false);
    rememberOnSite(storage, '2026-10-17');
    assert.equal(wasOnSiteToday(storage, '2026-10-17'), true);
    assert.equal(wasOnSiteToday(storage, '2026-10-18'), false, 'the next day starts away again');
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => rememberOnSite(broken, '2026-10-17'));
    assert.equal(wasOnSiteToday(broken, '2026-10-17'), false);
    assert.match(render({ onSite: true }), /Gör så här nu/);
    assert.match(render(), /När ni kommer till JumpYard/);
});

test('the page reads the sign and the kiosk link and hands the result to the last page (#504)', () => {
    const page = fs.readFileSync(new URL('app/page.tsx', root), 'utf8');
    assert.match(page, /if \(isSignArrival\(params\)\) rememberOnSite\(\);\s+return wasOnSiteToday\(\);/);
    assert.match(page, /\.then\(\(\{ booking, checkinSession, arrival \}\) => \{\s+if \(!alive\) return;\s+if \(arrival === 'kiosk'\) \{\s+rememberOnSite\(\);\s+setOnSite\(true\);/);
    assert.match(page, /receiptSent=\{ctx\.paymentCompleted\}\s+onSite=\{onSite\}/);
    const client = fs.readFileSync(new URL('flow/cloudClient.ts', root), 'utf8');
    assert.match(client, /arrival: body\.arrival === 'kiosk' \? 'kiosk' : null,/);
});

test('water is plain "Vatten" wherever the phone names it, also for water already in a booking (#504)', () => {
    for (const file of ['flow/cloudClient.ts', 'context/LanguageContext.tsx', 'flow/pickupPlaces.ts', 'components/PhoneCompletion.tsx']) {
        const source = fs.readFileSync(new URL(file, root), 'utf8');
        assert.doesNotMatch(source, /[Vv]attenflaska|Water bottle|water bottle/, file);
    }
    assert.match(fs.readFileSync(new URL('flow/cloudClient.ts', root), 'utf8'), /water_bottle: 'Vatten',/);
});
