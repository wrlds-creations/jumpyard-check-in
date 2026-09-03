import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  PAYMENT_RECOVERY_MAX_AGE_MS,
  acquirePaymentRecoveryOwnership,
  beginPaymentRecovery,
  bindPaymentRecoverySession,
  claimPaymentRedirect,
  classifyPaymentResult,
  clearPaymentRecovery,
  clearPaymentRecoveryAfterCompletion,
  consumePaymentRedirect,
  getPaymentRedirect,
  hasPaymentRedirect,
  matchesPaymentRedirect,
  initializePaymentRecoverySubmission,
  markPaymentRecoverySubmitted,
  failUnsubmittedPaymentRecovery,
  purgeExpiredPaymentRecovery,
  readPaymentRecovery,
  setPaymentRecoveryOutcome,
} from './paymentRecovery.ts';

const KEY = 'jumpyard.paymentRecovery.v1';
const PROOF_KEY = 'jumpyard.paymentSubmission.v1';
const OBSERVATION_KEY = 'jumpyard.paymentObservation.v1';
const originalNow = Date.now;
const originalWindow = globalThis.window;
const config = {
  available: true,
  apiUrl: 'https://payments.example.test/api/',
  configurationId: 'config-1',
  integrationId: 'integration-1',
};
const input = (attemptId = 'draft-1', overrides = {}) => ({
  attemptId,
  bookingIdentifier: `booking-${attemptId}`,
  kind: 'new_booking',
  config,
  ...overrides,
});
let now = 1_800_000_000_000;
let values;

beforeEach(() => {
  // Stay ahead of any rollback floor left by a previous isolated scenario.
  now += 3 * PAYMENT_RECOVERY_MAX_AGE_MS;
  Date.now = () => now;
  values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
    location: { href: 'https://phone.example.test/?channel=park-qr#buy' },
    history: {
      state: { preserved: true },
      replaceState(state, _title, url) {
        assert.deepEqual(state, { preserved: true });
        window.location.href = new URL(url, window.location.href).href;
      },
    },
  };
});

afterEach(() => {
  Date.now = originalNow;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test('persists only bounded identifiers, public configuration and a hash, without payment secrets', async () => {
  const record = beginPaymentRecovery(input('draft-1', {
    jwt: 'DO_NOT_STORE_JWT',
    contact: { email: 'DO_NOT_STORE_CONTACT' },
    config: { ...config, jwt: 'DO_NOT_STORE_CONFIG_JWT', sessionData: 'DO_NOT_STORE_SESSION_DATA' },
  }));
  assert.equal(record.outcome, 'pending');
  assert.equal(record.sessionHash, null);
  assert.equal(record.returnConsumed, false);
  assert.equal(await bindPaymentRecoverySession('draft-1', 'DO_NOT_STORE_RAW_SESSION_ID'), true);
  const stored = JSON.parse(values.get(KEY));
  assert.match(stored.sessionHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(stored.config).sort(), ['apiUrl', 'available', 'configurationId', 'integrationId']);
  assert.doesNotMatch(values.get(KEY), /DO_NOT_STORE|jwt|sessionData|contact|redirectResult/);
});

test('repeated setup keeps the same identity and expiry, while unresolved and approved purchases block another', () => {
  const first = beginPaymentRecovery(input());
  now += 5_000;
  const repeated = beginPaymentRecovery(input());
  assert.equal(repeated.createdAt, first.createdAt);
  assert.equal(repeated.expiresAt, first.expiresAt);
  assert.equal(repeated.lastObservedAt, now);
  assert.equal(beginPaymentRecovery(input('draft-2')), null);
  assert.equal(beginPaymentRecovery(input('draft-1', { bookingIdentifier: 'other-booking' })), null);
  assert.equal(beginPaymentRecovery(input('draft-1', { config: { ...config, configurationId: 'other' } })), null);
  assert.equal(setPaymentRecoveryOutcome('draft-1', 'unknown'), true);
  assert.equal(beginPaymentRecovery(input('draft-2')), null);
  assert.equal(setPaymentRecoveryOutcome('draft-1', 'approved'), true);
  assert.equal(beginPaymentRecovery(input('draft-2')), null);
  assert.equal(setPaymentRecoveryOutcome('draft-1', 'failed'), false);
  assert.equal(setPaymentRecoveryOutcome('draft-1', 'unknown'), false);
  assert.equal(readPaymentRecovery().outcome, 'approved');
});

test('a new draft replaces a confirmed failure, and old callbacks cannot mutate or clear it', async () => {
  beginPaymentRecovery(input());
  await bindPaymentRecoverySession('draft-1', 'session-old');
  assert.equal(claimPaymentRedirect('draft-1'), true);
  assert.equal(setPaymentRecoveryOutcome('draft-1', 'failed'), true);
  now += 1;
  const replacement = beginPaymentRecovery(input('draft-2'));
  assert.equal(replacement.outcome, 'pending');
  assert.equal(replacement.returnConsumed, false);
  assert.equal(replacement.sessionHash, null);
  assert.equal(setPaymentRecoveryOutcome('draft-1', 'approved'), false);
  assert.equal(clearPaymentRecovery('draft-1'), false);
  assert.equal(readPaymentRecovery().attemptId, 'draft-2');
});

test('session binding rejects different sessions, wrong identities and a digest completing after replacement', async () => {
  beginPaymentRecovery(input());
  assert.equal(await bindPaymentRecoverySession('wrong-draft', 'session-1'), false);
  assert.equal(await bindPaymentRecoverySession('draft-1', ''), false);
  assert.equal(await bindPaymentRecoverySession('draft-1', 'session-1'), true);
  assert.equal(await bindPaymentRecoverySession('draft-1', 'session-1'), true);
  assert.equal(await bindPaymentRecoverySession('draft-1', 'session-other'), false);
  const lateBinding = bindPaymentRecoverySession('draft-1', 'session-1');
  setPaymentRecoveryOutcome('draft-1', 'failed');
  beginPaymentRecovery(input('draft-2'));
  assert.equal(await lateBinding, false);
  assert.equal(readPaymentRecovery().sessionHash, null);
});

test('a matched return is claimed once and remains unknown if processing is interrupted', async () => {
  beginPaymentRecovery(input());
  assert.equal(claimPaymentRedirect('draft-1'), false);
  await bindPaymentRecoverySession('draft-1', 'session-1');
  const record = readPaymentRecovery();
  const redirect = { sessionId: 'session-1', redirectResult: 'opaque-return' };
  assert.equal(await matchesPaymentRedirect(record, { ...redirect, sessionId: 'wrong' }), false);
  assert.equal(await matchesPaymentRedirect(record, redirect), true);
  assert.equal(claimPaymentRedirect('wrong-draft'), false);
  assert.equal(claimPaymentRedirect('draft-1'), true);
  assert.equal(claimPaymentRedirect('draft-1'), false);
  assert.equal(readPaymentRecovery().returnConsumed, true);
  assert.equal(readPaymentRecovery().outcome, 'unknown');
  assert.equal(await matchesPaymentRedirect(record, redirect), false);
  assert.equal(beginPaymentRecovery(input('draft-2')), null);
  assert.doesNotMatch(values.get(KEY), /opaque-return/);
});

test('the twelve-hour lifetime is fixed; expired reads reject immediately and leased cleanup removes data', async () => {
  const first = beginPaymentRecovery(input());
  now = first.expiresAt - 1;
  assert.equal(readPaymentRecovery().expiresAt, first.expiresAt);
  setPaymentRecoveryOutcome('draft-1', 'unknown');
  assert.equal(readPaymentRecovery().expiresAt, first.expiresAt);
  now = first.expiresAt;
  assert.equal(readPaymentRecovery(), null);
  await purgeExpiredPaymentRecovery();
  assert.equal(values.has(KEY), false);
});

test('detected clock rollback fails closed for reading and beginning until observed time is restored', () => {
  beginPaymentRecovery(input());
  now += 1000;
  const latest = readPaymentRecovery();
  now -= 500;
  assert.equal(readPaymentRecovery(), null);
  assert.equal(values.has(KEY), true, 'Clock observation must not remove the purchase during a read');
  assert.equal(beginPaymentRecovery(input('draft-2')), null);
  now = latest.lastObservedAt;
  assert.equal(readPaymentRecovery().attemptId, 'draft-1');
  assert.equal(beginPaymentRecovery(input('draft-2')), null, 'Restoring the clock does not prove the old payment failed');
});

test('invalid record shape, tampered retention and unsafe configuration are rejected', () => {
  const valid = beginPaymentRecovery(input());
  for (const patch of [
    { expiresAt: valid.expiresAt + 1 },
    { createdAt: 'today' },
    { sessionHash: 'raw-session-id' },
    { returnConsumed: 'yes' },
    { returnConsumed: true },
    { outcome: 'paid' },
    { bookingIdentifier: 'guest@example.test' },
    { config: { ...config, apiUrl: 'https://user:secret@example.test/' } },
    { config: { ...config, apiUrl: 'https://example.test/?token=secret' } },
    { config: { ...config, apiUrl: 'http://example.test/' } },
  ]) {
    values.set(KEY, JSON.stringify({ ...valid, ...patch }));
    assert.equal(readPaymentRecovery(), null, JSON.stringify(patch));
  }
  assert.equal(beginPaymentRecovery(input('draft-2', { config: { ...config, available: false } })), null);
  assert.equal(beginPaymentRecovery(input('draft-2', { attemptId: 'a'.repeat(257) })), null);
});

test('legacy optional consumed flag defaults false and returned fields are whitelisted without rewriting stored identity', () => {
  const record = beginPaymentRecovery(input());
  delete record.returnConsumed;
  values.set(KEY, JSON.stringify({ ...record, jwt: 'DO_NOT_STORE', config: { ...config, rawPayload: 'DO_NOT_STORE' } }));
  const raw = values.get(KEY);
  const recovered = readPaymentRecovery();
  assert.equal(recovered.returnConsumed, false);
  assert.doesNotMatch(JSON.stringify(recovered), /DO_NOT_STORE|rawPayload|jwt/);
  assert.equal(values.get(KEY), raw);
});

test('unavailable storage or a failed observation write never opens a replacement attempt', () => {
  beginPaymentRecovery(input());
  const realSetItem = window.localStorage.setItem;
  let failNextWrite = true;
  window.localStorage.setItem = (...args) => {
    if (failNextWrite) { failNextWrite = false; throw new Error('quota'); }
    return realSetItem(...args);
  };
  assert.equal(beginPaymentRecovery(input('draft-2')), null);
  assert.equal(readPaymentRecovery().attemptId, 'draft-1');
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('unavailable'); } });
  assert.equal(readPaymentRecovery(), null);
  assert.equal(beginPaymentRecovery(input('draft-2')), null);
  assert.equal(clearPaymentRecovery(), false);
});

test('redirect capture stays in memory, rejects incomplete/duplicate parameters and preserves unrelated routing', () => {
  window.location.href = 'https://phone.example.test/checkout?channel=park-qr&sessionId=session-1&redirectResult=opaque%2Breturn&keep=two+words#buy';
  assert.equal(hasPaymentRedirect(), true);
  assert.deepEqual(getPaymentRedirect(), { sessionId: 'session-1', redirectResult: 'opaque+return' });
  assert.equal(values.size, 0);
  consumePaymentRedirect();
  assert.equal(hasPaymentRedirect(), false);
  assert.equal(getPaymentRedirect(), null);
  const clean = new URL(window.location.href);
  assert.equal(clean.pathname, '/checkout');
  assert.equal(clean.searchParams.get('channel'), 'park-qr');
  assert.equal(clean.searchParams.get('keep'), 'two words');
  assert.equal(clean.hash, '#buy');
  for (const query of ['redirectResult=x', 'sessionId=s', 'sessionId=s&redirectResult=', 'sessionId=s&sessionId=t&redirectResult=x', 'sessionId=s&redirectResult=x&redirectResult=y']) {
    window.location.href = `https://phone.example.test/?${query}`;
    assert.equal(getPaymentRedirect(), null, query);
  }
});

test('only authoritative approval and explicit refusal/cancellation are terminal; generic SDK enums stay unknown', () => {
  const sdk = { approved: 1, failed: 2 };
  for (const resultCode of ['Pending', 'Received', 'Error', 'AuthenticationFinished', '']) {
    assert.equal(classifyPaymentResult({ result: sdk.approved, rawResult: { resultCode } }, sdk), 'unknown');
  }
  assert.equal(classifyPaymentResult({ result: 1, rawResult: { resultCode: 'Authorised' } }, sdk), 'approved');
  for (const resultCode of ['Cancelled', 'Refused']) {
    assert.equal(classifyPaymentResult({ result: 2, rawResult: { resultCode } }, sdk), 'failed');
    assert.equal(classifyPaymentResult({ result: 2, message: resultCode }, sdk), 'failed');
  }
  assert.equal(classifyPaymentResult({ rawResult: { eventCode: 'AUTHORISATION', isSuccess: true } }), 'approved');
  assert.equal(classifyPaymentResult({ rawResult: { eventCode: 'AUTHORISATION', isSuccess: false } }), 'failed');
  for (const value of [null, undefined, {}, { result: 1 }, { result: 2 }, { result: 2, message: 'Error' }, { result: 1, message: 'Pending' }]) {
    assert.equal(classifyPaymentResult(value, sdk), 'unknown');
  }
});

async function protectedOwnership() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const held = new Set();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    async request(name, _options, callback) {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  } } });
  const ownership = await acquirePaymentRecoveryOwnership();
  assert.equal(ownership.protected, true);
  return { ownership, restore() {
    ownership.release();
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  } };
}

test('durable submitted proof precedes release and prevents pre-submit retirement despite stale base data', async () => {
  const lease = await protectedOwnership();
  try {
    const record = beginPaymentRecovery(input());
    assert.equal(initializePaymentRecoverySubmission(record, lease.ownership), true);
    await bindPaymentRecoverySession(record.attemptId, 'session-1');
    const preparedBase = values.get(KEY);
    assert.equal(markPaymentRecoverySubmitted(record, lease.ownership), true);
    assert.equal(JSON.parse(values.get(PROOF_KEY)).phase, 'submitted');
    values.set(KEY, preparedBase);
    assert.equal(readPaymentRecovery().submission.phase, 'submitted');
    assert.equal(failUnsubmittedPaymentRecovery(record, lease.ownership), false);
    assert.equal(setPaymentRecoveryOutcome(record.attemptId, 'unknown'), true);
    assert.equal(failUnsubmittedPaymentRecovery(record, lease.ownership), false);
  } finally { lease.restore(); }
});

test('retiring a proven fresh failure is terminal and terminal clearing removes its exact bounded metadata', async () => {
  const lease = await protectedOwnership();
  try {
    const record = beginPaymentRecovery(input());
    assert.equal(initializePaymentRecoverySubmission(record, lease.ownership), true);
    await bindPaymentRecoverySession(record.attemptId, 'session-1');
    assert.equal(failUnsubmittedPaymentRecovery(record, lease.ownership), true);
    let preparedRetry = false;
    assert.equal(await clearPaymentRecoveryAfterCompletion(record.attemptId, () => {
      preparedRetry = true;
      assert.equal(readPaymentRecovery().outcome, 'failed');
    }), true);
    assert.equal(preparedRetry, true);
    for (const key of [KEY, PROOF_KEY, OBSERVATION_KEY]) assert.equal(values.has(key), false, key);
  } finally { lease.restore(); }
});

test('unexpired orphan submission proof blocks replacement and expires under the same bounded cleanup', async () => {
  const lease = await protectedOwnership();
  try {
    const record = beginPaymentRecovery(input());
    initializePaymentRecoverySubmission(record, lease.ownership);
    await bindPaymentRecoverySession(record.attemptId, 'session-1');
    markPaymentRecoverySubmitted(record, lease.ownership);
    values.delete(KEY);
    assert.equal(beginPaymentRecovery(input('draft-2')), null);
    now = record.expiresAt;
    await purgeExpiredPaymentRecovery();
    for (const key of [KEY, PROOF_KEY, OBSERVATION_KEY]) assert.equal(values.has(key), false, key);
    assert.equal(beginPaymentRecovery(input('draft-2')).attemptId, 'draft-2');
  } finally { lease.restore(); }
});

test('a delayed cleanup reads current keys under ownership and preserves an unexpired replacement', async () => {
  const lease = await protectedOwnership();
  try {
    const old = beginPaymentRecovery(input());
    setPaymentRecoveryOutcome(old.attemptId, 'failed');
    now = old.expiresAt - 1;
    const replacement = beginPaymentRecovery(input('draft-2'));
    initializePaymentRecoverySubmission(replacement, lease.ownership);
    await bindPaymentRecoverySession(replacement.attemptId, 'session-2');
    now = old.expiresAt;
    await purgeExpiredPaymentRecovery();
    assert.equal(readPaymentRecovery().attemptId, replacement.attemptId);
    assert.equal(readPaymentRecovery().submission.phase, 'prepared');
    assert.equal(await clearPaymentRecoveryAfterCompletion(old.attemptId, () => assert.fail('Stale retry callback ran')), false);
  } finally { lease.restore(); }
});
