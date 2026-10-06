import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

// GH-453 (D0229) and GH-456 (D0230): the saved visit and the check-in window notice.
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

function memoryStorage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key), values };
}

const { saveVisit, readSavedVisit, clearSavedVisit } = load('flow/savedVisit.ts');
const { stockholmToday } = load('flow/phoneCompletion.ts');
const today = stockholmToday();
const booking = { id: 'ABC123', jumpers: 2, time: '14:00', products: 1, paid: true, guestAccessToken: 'secret-booking-token' };
const session = { checkinSessionId: 'jycs_1', status: 'redeemed', handoffCode: '0427', handoffDay: today,
    guestAccessToken: 'secret-session-token', guestAccessExpiresAt: '2026-10-17T13:00:00Z' };

test('a checked-in visit is saved for the day without any guest access token', () => {
    const storage = memoryStorage();
    globalThis.window = { localStorage: storage };
    try {
        saveVisit(booking, session);
        const raw = [...storage.values.values()][0];
        assert.ok(raw, 'saved');
        assert.doesNotMatch(raw, /secret-/, 'short-lived tokens never reach local storage');
        const visit = readSavedVisit();
        assert.equal(visit.identifier, 'ABC123');
        assert.equal(visit.session.handoffCode, '0427');
        assert.equal(visit.visitDate, today);
        clearSavedVisit();
        assert.equal(readSavedVisit(), null);
    } finally { delete globalThis.window; }
});

test('a visit from another day is ignored and removed; a missing number is never saved', () => {
    const storage = memoryStorage();
    globalThis.window = { localStorage: storage };
    try {
        saveVisit(booking, { ...session, handoffDay: '2026-09-22' });
        assert.equal(readSavedVisit(), null);
        assert.equal(storage.values.size, 0, 'the old visit is removed');
        saveVisit(booking, { ...session, handoffCode: null });
        assert.equal(storage.values.size, 0);
    } finally { delete globalThis.window; }
});

test('blocked storage never breaks the flow', () => {
    globalThis.window = { get localStorage() { throw new Error('blocked'); } };
    try {
        assert.doesNotThrow(() => saveVisit(booking, session));
        assert.equal(readSavedVisit(), null);
        assert.doesNotThrow(() => clearSavedVisit());
    } finally { delete globalThis.window; }
});

const { BookingSummary } = load('components/BookingSummary.tsx');
const { LanguageProvider } = load('context/LanguageContext.tsx');
function summary(sessionStartError, lang = 'sv') {
    globalThis.window = { localStorage: { getItem: () => lang } };
    try {
        return renderToStaticMarkup(React.createElement(LanguageProvider, null, React.createElement(BookingSummary, {
            booking: { ...booking, endTime: '15:00', durationMinutes: 60 }, onContinue() {}, sessionStartError,
        })));
    } finally { delete globalThis.window; }
}

test('outside the check-in window the booking page says when to come back instead of offering a start', () => {
    const early = summary('checkin_too_early');
    assert.match(early, /Incheckningen öppnar 12:00<\/strong>[\s\S]*Två timmar före ert pass\./);
    assert.match(early, /data-window="checkin_too_early"/);
    assert.doesNotMatch(early, /booking-start-checkin/, 'no start button that would fail again');
    const late = summary('checkin_too_late', 'en');
    assert.match(late, /Your jump time has ended<\/strong>[\s\S]*Go to the front desk and we will help you\./);
    assert.doesNotMatch(late, /booking-start-checkin/);
    assert.match(summary(null), /booking-start-checkin/, 'inside the window the start button is there');
});
