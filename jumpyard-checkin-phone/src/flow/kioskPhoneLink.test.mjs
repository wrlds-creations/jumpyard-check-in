import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// GH-484 (D0240): the kiosk shows a QR with a check-in link minted together with the number. A
// kiosk purchase's booking is confirmed by ROLLER a few seconds later, so a scan in between gets
// booking_not_fresh; the phone waits ("Vi hämtar din lapp…") instead of showing an error.
const require = createRequire(import.meta.url);
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
const resumed = {
  status: 'session_resumed',
  booking: { bookingReference: 'K484', rollerUniqueId: 'roller-484', paymentStatus: 'Paid', amountOwing: 0, items: [] },
  eligibility: { canCheckIn: true, reason: 'ready', paymentState: 'paid' },
  guestAccess: { token: 'guest-484' },
  session: { checkinSessionId: 'jycs_484', status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: '0484' },
};
const notFresh = { status: 'blocked', error: { code: 'booking_not_fresh', message: 'syncing' } };

async function withAnswers(answers, run) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    const [status, body] = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  };
  try { return { result: await run(), calls: () => calls }; }
  catch (error) { return { error, calls: () => calls }; }
  finally { globalThis.fetch = originalFetch; }
}

test('a kiosk link opened before ROLLER confirmed the purchase waits and then shows the number', async () => {
  let waited = 0;
  const outcome = await withAnswers([[409, notFresh], [409, notFresh], [200, resumed]],
    () => cloud.resolveCheckInSessionLink('kiosk-token', { onWaitingForBooking: () => { waited += 1; }, retryDelaysMs: [0, 0, 0] }));
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.result.checkinSession.handoffCode, '0484');
  assert.equal(outcome.calls(), 3);
  assert.equal(waited, 2, 'the phone shows "Vi hämtar din lapp…" while it waits');
});

test('the wait is bounded and ends in the ordinary error', async () => {
  const outcome = await withAnswers([[409, notFresh]],
    () => cloud.resolveCheckInSessionLink('kiosk-token', { retryDelaysMs: [0, 0] }));
  assert.ok(outcome.error instanceof cloud.CloudSessionError);
  assert.equal(outcome.error.reason, 'booking_not_fresh');
  assert.equal(outcome.calls(), 3, 'one try and two retries');
});

test('other link answers never wait', async () => {
  const outcome = await withAnswers([[200, resumed]],
    () => cloud.resolveCheckInSessionLink('kiosk-token', { onWaitingForBooking: () => assert.fail('no wait'), retryDelaysMs: [0, 0] }));
  assert.equal(outcome.calls(), 1);
  assert.equal(outcome.result.checkinSession.handoffCode, '0484');
});

test('the loading screen says the slip is being fetched while waiting', () => {
  const page = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const copy = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  assert.match(page, /resolveCheckInSessionLink\(linkToken, \{ onWaitingForBooking: \(\) => \{ if \(alive\) setWaitingForLinkedBooking\(true\); \} \}\)/);
  assert.match(page, /\{waitingForLinkedBooking \? t\.common\.fetchingSlip : t\.common\.loading\}/);
  assert.match(copy, /fetchingSlip: 'Vi hämtar din lapp…'/);
  assert.match(copy, /fetchingSlip: 'Fetching your slip…'/);
});
