import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// #603 (D0292): the phone's booking lookup against Cloud's real Park answers. Cloud refuses an identifier it does
// not look up (12345, any 10-digit number) with 403 `live_lookup_not_allowed` before calling ROLLER, and the guest
// gets the same answer as ROLLER's 404. The real client, search page, copy and preview fixture run here.

const require = createRequire(import.meta.url);
const React = require('react');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const localRequire = id => {
    if (!id.startsWith('.') && !id.startsWith('@/')) return require(id);
    const base = id.startsWith('@/') ? id.slice(2) : path.posix.join(path.posix.dirname(name), id);
    const file = ['.ts', '.tsx'].map(ext => base + ext).find(candidate => fs.existsSync(new URL('../' + candidate, import.meta.url)));
    assert.ok(file, `unresolved import ${id} from ${name}`);
    return load(file);
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(localRequire, mod, mod.exports);
  cache.set(name, mod.exports);
  return mod.exports;
}

const cloud = load('flow/cloudClient.ts');

// Cloud's Lookup Lambda bodies as Park sends them (infra/lambda/lookup/index.js).
const blocked = (status, code, message) => [status, { status: 'blocked', error: { code, message } }];
const CLOUD = {
  wrongShape: blocked(403, 'live_lookup_not_allowed', 'Only booking references, QR codes, or email are approved for assisted park-test lookup.'),
  otherVenue: blocked(403, 'live_lookup_not_allowed', 'This booking is outside the approved park-test venue.'),
  otherDate: blocked(403, 'live_lookup_not_allowed', 'Assisted park-test lookup is only approved for the current operating date.'),
  rollerNotFound: [404, { status: 'not_found', error: { code: 'booking_not_found', message: 'No Roller booking was found for the supplied identifier.' } }],
  rollerFailed: [502, { status: 'roller_error', error: { code: 'roller_lookup_failed', message: 'Roller lookup failed with HTTP 500.' } }],
  configError: [500, { status: 'config_error', error: { code: 'lookup_config_error', message: 'JumpYard Cloud lookup configuration is incomplete or unsafe.' } }],
  serverError: [500, { status: 'internal_error', error: { code: 'internal_error', message: 'JumpYard Cloud lookup failed.' } }],
  gateway: [503, { message: 'Service Unavailable' }],
  emptyTimeout: [504, null],
  emergencyStop: blocked(409, 'emergency_stop_active', 'Park-test booking lookup is disabled while the JumpYard emergency stop is active.'),
  lookupDisabled: blocked(409, 'live_lookup_disabled', 'Live lookup is disabled for park-test.'),
  rateLimited: blocked(429, 'guest_access_rate_limited', 'Too many active guest sessions exist for this booking. Try again later or ask staff for help.'),
  phone: [400, { status: 'invalid_request', error: { code: 'phone_lookup_disabled', message: 'Use a booking reference, QR code or email address.' } }],
  offline: 'offline',
};

function today() {
  return new Intl.DateTimeFormat('sv-SE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Stockholm' }).format(new Date());
}

const found = [200, { status: 'found', guestAccess: { token: 'test-only', expiresAt: null },
  eligibility: { canCheckIn: true, reason: 'ready', paymentState: 'paid' },
  booking: { bookingReference: '166797742', rollerUniqueId: null, paymentStatus: 'Paid', amountOwing: 0, items: [
    { productName: '60 min', parentProductName: 'Entré', productType: 'session', quantity: 2, bookingDate: today(), startTime: '17:00', endTime: '18:00', tickets: [] },
  ] } }];

/** Runs `action` with Cloud answering every request; nothing leaves the test. */
async function withCloud(answer, action, fetchImpl = null) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL;
  process.env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL = 'https://cloud.invalid';
  globalThis.fetch = fetchImpl ?? (async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (answer === 'offline') throw new TypeError('fetch failed');
    const [status, body] = answer;
    return new Response(body === null ? null : JSON.stringify({ correlationId: 'phone_test', ...body }), { status });
  });
  try {
    return await action(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL;
    else process.env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL = originalBase;
  }
}

const lookup = (identifier, answer) => withCloud(answer, async calls => ({
  error: await cloud.lookupBooking(identifier).then(() => null, error => error),
  calls,
}));

test('Cloud refusing 12345 or a 10-digit number is not found at once: one request, Cloud\'s code kept', async () => {
  for (const identifier of ['12345', '1234567890', 'ABC12']) {
    const { error, calls } = await lookup(identifier, CLOUD.wrongShape);
    assert.ok(error instanceof cloud.CloudLookupError, identifier);
    assert.equal(error.reason, 'not_found', identifier);
    assert.equal(error.httpStatus, 403);
    assert.equal(error.code, 'live_lookup_not_allowed');
    assert.equal(calls.length, 1, `${identifier}: one request, never retried`);
    assert.equal(calls[0].url, 'https://cloud.invalid/v1/check-in/lookup');
    assert.equal(calls[0].body.identifier, identifier);
  }
  // Cloud answers a booking outside today or the park with the same code, and the guest gets the same answer.
  for (const answer of [CLOUD.otherVenue, CLOUD.otherDate]) {
    assert.equal((await lookup('166797742', answer)).error.reason, 'not_found', answer[1].error.message);
  }
});

test('ROLLER\'s 404 is not found as before', async () => {
  const { error, calls } = await lookup('987654321', CLOUD.rollerNotFound);
  assert.equal(error.reason, 'not_found');
  assert.equal(error.httpStatus, 404);
  assert.equal(error.code, 'booking_not_found');
  assert.equal(calls.length, 1);
});

test('every other Cloud answer keeps its own, from a 5xx and a lost connection to the phone refusal', async () => {
  for (const [name, reason] of [
    ['rollerFailed', 'lookup_failed'], ['configError', 'lookup_failed'], ['serverError', 'lookup_failed'],
    ['gateway', 'lookup_failed'], ['emptyTimeout', 'lookup_failed'], ['emergencyStop', 'lookup_failed'],
    ['lookupDisabled', 'lookup_failed'], ['rateLimited', 'lookup_failed'], ['phone', 'phone_lookup_disabled'],
    ['offline', 'network_error'],
  ]) {
    const { error, calls } = await lookup('166797742', CLOUD[name]);
    assert.ok(error instanceof cloud.CloudLookupError, name);
    assert.equal(error.reason, reason, name);
    assert.equal(calls.length, 1, name);
  }
});

test('a real booking for today is still found', async () => {
  const booking = await withCloud(found, () => cloud.lookupBooking('166797742'));
  assert.equal(booking.id, '166797742');
  assert.equal(booking.paid, true);
  assert.equal(booking.guestAccessToken, 'test-only');
});

// The real Swedish and English copy: LanguageContext.tsx's `sv` and `en` objects.
const COPY = (() => {
  const source = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('LanguageContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers = {};
  const visit = node => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (['sv', 'en'].includes(declaration.name.getText(ast))) initializers[declaration.name.getText(ast)] = declaration.initializer.getText(ast);
      }
    }
  };
  ts.forEachChild(ast, visit);
  const { weekdayComboCopy } = load('context/weekdayComboCopy.ts');
  return Object.fromEntries(['sv', 'en'].map(lang => {
    const code = ts.transpileModule(`exports.copy = ${initializers[lang]};`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    new Function('exports', 'weekdayComboCopy', code)(exports, weekdayComboCopy);
    return [lang, exports.copy];
  }));
})();

const pageSource = ts.transpileModule(fs.readFileSync(new URL('../components/BookingLookup.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function findNode(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) {
    for (const child of tree) { const result = findNode(child, predicate); if (result) return result; }
    return null;
  }
  if (predicate(tree)) return tree;
  return findNode(tree.props?.children, predicate);
}

function texts(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return [];
  if (typeof tree === 'string' || typeof tree === 'number') return [String(tree)];
  if (Array.isArray(tree)) return tree.flatMap(texts);
  return texts(tree.props?.children);
}

/** The real search page with the real client and copy; hooks are a small stand-in, as in BookingLookup.test.mjs. */
function searchPage(lang) {
  const copy = COPY[lang];
  const slots = []; let cursor = 0;
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(effect) { const index = cursor++; slots[index] ??= { cleanup: effect() }; },
  };
  const exports = {};
  new Function('require', 'exports', pageSource)(id => {
    if (id === 'react') return react;
    if (id === '@/components/FlowTransition') return { FlowScreen: 'div' };
    if (id === '@/components/JumpyardIcon') return { JumpyardIcon: 'span' };
    if (id === '@/components/KalasWelcome') return { KalasWelcome: () => null };
    if (id === '@/context/LanguageContext') return { useTranslation: () => ({ t: copy }) };
    if (id === '@/flow/cloudClient') return cloud;
    return require(id);
  }, exports);
  const render = () => { cursor = 0; return exports.BookingLookup({ onSuccess: () => {}, onBack: () => {} }); };
  const byTestId = id => findNode(render(), node => node.props?.['data-testid'] === id);
  return async (identifier, answer) => withCloud(answer, async calls => {
    byTestId('booking-lookup-input').props.onChange({ target: { value: identifier } });
    await byTestId('booking-lookup-submit').props.onClick();
    const box = findNode(render(), node => String(node.props?.className ?? '').includes('bg-red-50'));
    return { answer: texts(box), calls: calls.length };
  });
}

test('the guest sees "Vi hittade ingen bokning idag." for 12345, as for ROLLER\'s 404; errors keep their texts', async () => {
  const notFound = ['Vi hittade ingen bokning idag.', 'Kontrollera uppgiften eller hämta personal.'];
  const search = searchPage('sv');
  assert.deepEqual(await search('12345', CLOUD.wrongShape), { answer: notFound, calls: 1 });
  assert.deepEqual(await search('1234567890', CLOUD.wrongShape), { answer: notFound, calls: 1 });
  assert.deepEqual(await search('987654321', CLOUD.rollerNotFound), { answer: notFound, calls: 1 });
  assert.deepEqual(await search('166797742', CLOUD.serverError),
    { answer: ['Något gick fel vid sökningen.', 'Kontrollera uppgiften eller hämta personal.'], calls: 1 });
  assert.deepEqual(await search('166797742', CLOUD.offline),
    { answer: ['Vi kunde inte nå bokningssystemet.', 'Försök igen eller hämta personal.'], calls: 1 });

  const english = searchPage('en');
  assert.deepEqual(await english('12345', CLOUD.wrongShape),
    { answer: ['We couldn\'t find a booking today.', 'Check the details or call staff.'], calls: 1 });
});

test('the /preview/flow fixture answers like Park: DEMO is found, 12345 is refused and 987654321 is ROLLER\'s 404', async () => {
  const code = ts.transpileModule(fs.readFileSync(new URL('../app/preview/flow/localTransport.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const forwarded = [];
  const window = { fetch: async (...args) => { forwarded.push(args); return Response.json({ asset: true }); } };
  const location = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:3017', href: 'http://127.0.0.1:3017/preview/flow' };
  const fixture = {};
  new Function('exports', 'window', 'location', 'process', code)(fixture, window, location, { env: { NODE_ENV: 'development' } });
  fixture.installLocalTransport({ delay: () => 0, fail: () => false });
  const viaFixture = identifier => withCloud(null, () => cloud.lookupBooking(identifier).then(booking => booking, error => error), window.fetch);

  assert.equal((await viaFixture('DEMO')).id, 'DEMO');
  assert.equal((await viaFixture('demo')).id, 'DEMO');
  const refused = await viaFixture('12345');
  assert.deepEqual([refused.reason, refused.httpStatus, refused.code], ['not_found', 403, 'live_lookup_not_allowed']);
  const missing = await viaFixture('987654321');
  assert.deepEqual([missing.reason, missing.httpStatus, missing.code], ['not_found', 404, 'booking_not_found']);
  assert.equal(forwarded.length, 0, 'the fixture never forwards a lookup');
});
