import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  BUY_FLOW_RECOVERY_MAX_AGE_MS,
  getBuyFlowRecoveryIdentifier,
  hasCompletedBuyFlowRecovery,
  readBuyFlowRecovery,
  writeBuyFlowRecovery,
} from './buyFlowRecovery.ts';

const KEY = 'jumpyard.buyFlowRecovery.v1';
const originalNow = Date.now;
const originalWindow = globalThis.window;
let now = 1_800_000_000_000;
let values;

beforeEach(() => {
  now += BUY_FLOW_RECOVERY_MAX_AGE_MS * 3;
  Date.now = () => now;
  values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    },
    dispatchEvent: () => true,
  };
});

afterEach(() => {
  Date.now = originalNow;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function completedSnapshot(step = 'APP_PRESENT') {
  return {
    currentFlowStep: step,
    bookingReference: 'reference-original',
    draftUniqueId: 'unique-original',
    selectedStartTime: '10:00',
    selectedProduct: null,
    jumperCount: 2,
    draftState: {
      bookingReference: 'reference-original', uniqueId: 'unique-original', prepaymentDraftId: null,
      amountOwing: 0, status: 'paid', paymentApproved: true, paymentRequired: false,
    },
    completion: { bookingIdentifier: 'reference-original', status: step === 'APP_CONFIRM' ? 'ready_for_staff' : 'completed' },
  };
}

function readRaw(input) {
  values.set(KEY, JSON.stringify({
    ...input, version: 1, updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + BUY_FLOW_RECOVERY_MAX_AGE_MS).toISOString(), lastObservedAt: new Date(now).toISOString(),
  }));
  return readBuyFlowRecovery();
}

test('confirmed ready and completed metadata round-trip through real storage with only their two allowed fields', () => {
  for (const step of ['APP_CONFIRM', 'APP_PRESENT']) {
    const input = completedSnapshot(step);
    input.completion.jwt = 'DO_NOT_STORE';
    input.completion.sessionData = 'DO_NOT_STORE';
    writeBuyFlowRecovery(input);
    const restored = readBuyFlowRecovery();
    assert.equal(hasCompletedBuyFlowRecovery(restored), true);
    assert.deepEqual(restored.completion, {
      bookingIdentifier: getBuyFlowRecoveryIdentifier(restored),
      status: step === 'APP_CONFIRM' ? 'ready_for_staff' : 'completed',
    });
    assert.doesNotMatch(values.get(KEY), /DO_NOT_STORE|jwt|sessionData/);
  }
});

test('completion must bind to the primary identifier, while a unique id can be primary when references are absent', () => {
  const input = completedSnapshot();
  input.completion.bookingIdentifier = input.draftUniqueId;
  assert.equal(hasCompletedBuyFlowRecovery(readRaw(input)), false);
  input.bookingReference = null;
  input.draftState.bookingReference = null;
  const restored = readRaw(input);
  assert.equal(getBuyFlowRecoveryIdentifier(restored), 'unique-original');
  assert.equal(hasCompletedBuyFlowRecovery(restored), true);
});

test('inconsistent, absent or invalid booking identities never gain completion through normalization', () => {
  const cases = [
    input => { input.draftState.bookingReference = 'other-reference'; },
    input => { input.draftState.uniqueId = 'other-unique'; },
    input => { input.bookingReference = 'guest@example.invalid'; },
    input => { input.bookingReference = 123; },
    input => { input.draftState.uniqueId = ''; },
    input => {
      input.bookingReference = null; input.draftUniqueId = null;
      input.draftState.bookingReference = null; input.draftState.uniqueId = null;
    },
  ];
  for (const mutate of cases) {
    const input = completedSnapshot(); mutate(input);
    const restored = readRaw(input);
    assert.ok(restored);
    assert.equal(restored.completion, null);
    assert.equal(hasCompletedBuyFlowRecovery(restored), false);
  }
});

test('explicit invalid or null completion never falls back to a legacy completed snapshot', () => {
  for (const completion of [null, false, [], {}, { status: 'completed' },
    { bookingIdentifier: 'other-booking', status: 'completed' },
    { bookingIdentifier: 'reference-original', status: 'ready_for_staff' },
    { bookingIdentifier: 'reference-original', status: 'pending' }]) {
    const restored = readRaw({ ...completedSnapshot(), completion });
    assert.equal(Object.hasOwn(restored, 'completion'), true);
    assert.equal(restored.completion, null);
    assert.equal(hasCompletedBuyFlowRecovery(restored), false);
    assert.equal(hasCompletedBuyFlowRecovery(readBuyFlowRecovery()), false, 'A second read must not turn invalid metadata into legacy evidence');
  }
  writeBuyFlowRecovery({ ...completedSnapshot(), completion: undefined });
  assert.equal(readBuyFlowRecovery().completion, null, 'An explicit undefined field must not serialize as absent legacy evidence');
  assert.equal(hasCompletedBuyFlowRecovery(readBuyFlowRecovery()), false);
});

test('only truly absent metadata preserves the narrow legacy APP_PRESENT completion rule', () => {
  const legacy = completedSnapshot();
  delete legacy.completion;
  const restored = readRaw(legacy);
  assert.equal(Object.hasOwn(restored, 'completion'), false);
  assert.equal(hasCompletedBuyFlowRecovery(restored), true);
  writeBuyFlowRecovery(restored);
  assert.equal(Object.hasOwn(readBuyFlowRecovery(), 'completion'), false);
  assert.equal(hasCompletedBuyFlowRecovery(readBuyFlowRecovery()), true);

  legacy.currentFlowStep = 'APP_CONFIRM';
  assert.equal(hasCompletedBuyFlowRecovery(readRaw(legacy)), false);
  legacy.currentFlowStep = 'APP_PRESENT';
  legacy.draftState.prepaymentDraftId = 'unresolved-draft';
  assert.equal(hasCompletedBuyFlowRecovery(readRaw(legacy)), false);
});

test('legacy malformed flags and identifiers cannot become completion evidence through normalized defaults', () => {
  for (const mutate of [
    input => { delete input.draftState.paymentRequired; },
    input => { input.draftState.paymentRequired = 'false'; },
    input => { input.draftState.paymentApproved = 'true'; },
    input => { input.draftState.prepaymentDraftId = ''; },
    input => { input.bookingReference = 123; },
    input => { input.draftState.bookingReference = 'other-reference'; },
  ]) {
    const input = completedSnapshot(); delete input.completion; mutate(input);
    const restored = readRaw(input);
    assert.equal(restored.completion, null);
    assert.equal(hasCompletedBuyFlowRecovery(restored), false);
  }
});

test('payment and safety stages and unapproved or payment-required flags remain incomplete', () => {
  for (const step of ['PAYMENT', 'PENDING', 'APP_SAFETY_VIDEO', 'APP_SAFETY_ATTEST']) {
    assert.equal(hasCompletedBuyFlowRecovery(readRaw({ ...completedSnapshot(), currentFlowStep: step })), false);
  }
  for (const flags of [{ paymentApproved: false }, { paymentRequired: true }, { paymentRequired: undefined }]) {
    const input = completedSnapshot(); Object.assign(input.draftState, flags);
    assert.equal(hasCompletedBuyFlowRecovery(readRaw(input)), false);
  }
  for (const value of [null, undefined, false, [], {}]) assert.equal(hasCompletedBuyFlowRecovery(value), false);
});

test('completion does not extend the existing twelve-hour expiry and expires with the entire snapshot', () => {
  writeBuyFlowRecovery(completedSnapshot());
  const first = readBuyFlowRecovery();
  now += BUY_FLOW_RECOVERY_MAX_AGE_MS - 1;
  const last = readBuyFlowRecovery();
  assert.equal(last.updatedAt, first.updatedAt);
  assert.equal(last.expiresAt, first.expiresAt);
  assert.equal(hasCompletedBuyFlowRecovery(last), true);
  now += 1;
  assert.equal(readBuyFlowRecovery(), null);
  assert.equal(values.has(KEY), false);
  assert.equal(hasCompletedBuyFlowRecovery(readBuyFlowRecovery()), false);
});

test('a detected clock rollback rejects a completed snapshot just like any other recovery data', () => {
  writeBuyFlowRecovery(completedSnapshot());
  now += 60_000;
  assert.equal(hasCompletedBuyFlowRecovery(readBuyFlowRecovery()), true);
  now -= 1;
  assert.equal(readBuyFlowRecovery(), null);
  assert.equal(values.has(KEY), false);
});
