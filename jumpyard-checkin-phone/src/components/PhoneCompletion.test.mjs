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
const { isPhoneCompletionReady } = load('flow/phoneCompletion.ts');
const booking = { id: 'SYNTHETIC', jumpers: 1, time: '14:00', durationMinutes: 60, products: 1, paid: true, productLabel: '60 min entré' };
const session = { checkinSessionId: 'synthetic-session', status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: '0001', handoffDay: '2026-09-22' };
function render(overrides = {}, lang = 'sv') {
    globalThis.window = { localStorage: { getItem: () => lang } };
    try { return renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(ConfirmationScreen, {
        booking, checkinSession: session, jumperCount: 1, selectedAddons: [], channel: 'park-qr', ...overrides,
    }))); } finally { delete globalThis.window; }
}

test('ready phone keeps server number, full session-bound payload, day and quantity one', () => {
    const html = render({ selectedAddons: [{ id: 'socks', label: 'Strumpor', price: 45, qty: 1 }] });
    for (const value of ['data-phone-completion="true"', 'Du är incheckad', '>0001</strong>',
        'JY_HANDOFF:0001:synthetic-session', 'Nummer från', '2026-09-22', '60 min entré', 'Strumpor']) assert.ok(html.includes(value), value);
    assert.equal((html.match(/class="quantity">1<\/strong>/g) ?? []).length, 2);
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
    ['redeemed', { checkinSession: { ...session, status: 'redeemed' } }],
    ['completed handoff', { checkinSession: { ...session, handoffStatus: 'completed' } }],
    ['already checked in', { alreadyCheckedIn: true }],
    ['kiosk channel', { channel: 'kiosk' }],
]) test(`${label}: does not claim a new ready phone handoff`, () => {
    const html = render(changes);
    assert.doesNotMatch(html, /data-phone-completion="true"|Du är incheckad/);
    assert.equal(isPhoneCompletionReady(changes.checkinSession === undefined ? session : changes.checkinSession,
        changes.channel ?? 'park-qr', changes.alreadyCheckedIn), false);
});

test('completed view retains booking identity and QR for café use', () => {
    const html = render({ checkinSession: { ...session, status: 'completed' } });
    assert.match(html, /Redan incheckad/);
    assert.match(html, /SYNTHETIC/);
    assert.match(html, /JY_HANDOFF:0001:synthetic-session/);
});

test('long legacy code is unchanged and uses wrapping treatment', () => {
    const code = 'ABCDEFGHIJKLMNOP0123456789';
    const html = render({ checkinSession: { ...session, handoffCode: code } });
    assert.match(html, /data-long="true"/);
    assert.ok(html.includes(`>${code}</strong>`));
    assert.ok(html.includes(`JY_HANDOFF:${code}:synthetic-session`));
});

test('Combo uses two bands and one later pizza, keeping package detail and no invented extras', () => {
    const html = render({ booking: { ...booking, admissionItems: [{ label: 'Weekday Combo', quantity: 1, packageContents: [
        { kind: 'admission', quantity: 2, durationMinutes: 60, collection: 'checkin' },
        { kind: 'pizza', quantity: 1, collection: 'later' },
    ] }] } });
    for (const value of ['Besöksband 60 min', 'class="quantity">2</strong>', 'Pizza att dela',
        'class="quantity">1</strong>', 'confirmation-later', 'Weekday Combo', 'caféet']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /Strumpor|Vattenflaska/);
});

test('English and remote arrival copy are retained without introducing a reset callback', () => {
    const html = render({ channel: 'sms' }, 'en');
    for (const value of ['You are checked in', 'Your number', 'arrive at the park', 'Enlarge QR code']) assert.ok(html.includes(value), value);
    assert.doesNotMatch(html, /confirmation-start-over/);
    assert.match(render({ onStartOver() { assert.fail('Render must never reset'); } }), /confirmation-start-over/);
});
