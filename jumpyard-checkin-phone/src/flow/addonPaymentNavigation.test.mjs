import assert from 'node:assert/strict';
import fs from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import { getAddonBackRule, getFlowBackAction } from './addonPaymentNavigation.ts';
import {
  PAYMENT_RECOVERY_MAX_AGE_MS,
  acquirePaymentRecoveryOwnership,
  beginPaymentRecovery,
  clearPaymentRecovery,
  readPaymentRecovery,
  setPaymentRecoveryOutcome,
} from './paymentRecovery.ts';

const addonsSource = fs.readFileSync(new URL('../components/AddonsOffer.tsx', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const paymentSource = fs.readFileSync(new URL('../components/RollerPaymentDropIn.tsx', import.meta.url), 'utf8');

const rule = (step, paymentNavigationLocked = false, paymentFailure = null) =>
  getAddonBackRule({ step, paymentNavigationLocked, paymentFailure });

// #330 criterion 3: approved, declined and unknown payments follow different Back rules.

test('before submission and after a confirmed failure Back returns to the add-on selection', () => {
  assert.equal(rule('PAYMENT'), 'select', 'ready: the fresh attempt is discarded and the basket kept');
  assert.equal(rule('PAYMENT', false, 'failed'), 'select', 'declined: the failed attempt is closed first');
  for (const step of ['SKYRIDER_ATTEST', 'REVIEW', 'PENDING']) {
    assert.equal(rule(step), 'select');
    assert.equal(rule(step, true, 'unknown'), 'select', `${step} shows no checkout, so payment flags cannot apply`);
  }
});

test('a submitted, unresolved or approved add-on payment hides Back entirely', () => {
  assert.equal(rule('PAYMENT', true), 'hidden', 'received: the same attempt must reach its outcome');
  assert.equal(rule('PAYMENT', true, 'failed'), 'hidden', 'a lock always wins over a stale failure flag');
  assert.equal(rule('PAYMENT', false, 'unknown'), 'hidden', 'unknown: only the status check remains');
  assert.equal(rule('APPROVED'), 'hidden', 'approved: only forward into safety');
  assert.equal(rule('APPROVED', false, 'failed'), 'hidden');
});

test('the selection step leaves Back to the page', () => {
  assert.equal(rule('SELECT'), 'page');
  assert.equal(rule('SELECT', true, 'unknown'), 'page');
});

test('the shared navigation row follows the add-on rule only while the offer is shown', () => {
  assert.equal(getFlowBackAction({ state: 'APP_ADDONS', backState: 'APP_BOOKING', addonsBackRule: 'hidden' }), null);
  assert.equal(getFlowBackAction({ state: 'APP_ADDONS', backState: 'APP_BOOKING', addonsBackRule: 'select' }), 'addons');
  assert.equal(getFlowBackAction({ state: 'APP_ADDONS', backState: null, addonsBackRule: 'select' }), 'addons');
  assert.equal(getFlowBackAction({ state: 'APP_ADDONS', backState: 'APP_BOOKING', addonsBackRule: 'page' }), 'page');
  assert.equal(getFlowBackAction({ state: 'APP_BOOKING', backState: 'KIOSK_CHOICE', addonsBackRule: 'hidden' }), 'page');
  assert.equal(getFlowBackAction({ state: 'KIOSK_BUY', backState: null, addonsBackRule: 'hidden' }), null);
});

// #330 criterion 1: Back during payment never opens a parallel attempt.

test('the add-on offer applies the rule to its own Back handling and reports it to the page', () => {
  assert.match(addonsSource, /const backRule = getAddonBackRule\(\{ step, paymentNavigationLocked, paymentFailure \}\);/);
  assert.match(
    addonsSource,
    /const returnToSelect = useCallback\(async \(\) => \{\s*if \(getAddonBackRule\(\{ step, paymentNavigationLocked: paymentNavigationLockedRef\.current, paymentFailure \}\) !== 'select'\) return;/
  );
  assert.match(addonsSource, /if \(backRule !== 'select'\) return;\s*returnToSelect\(\);/);
  assert.match(addonsSource, /onBackRuleChange\?\.\(backRule\);/);
  assert.match(addonsSource, /onStepChange\?\.\('SELECT'\);\s*onBackRuleChange\?\.\('page'\);/);
  assert.match(
    addonsSource,
    /onNavigationLockChange=\{\(locked\) => \{ paymentNavigationLockedRef\.current = locked; setPaymentNavigationLocked\(locked\); \}\}/
  );
  // A confirmed failure is closed before the selection reopens; unknown and approved stay protected.
  assert.match(
    addonsSource,
    /recovery\?\.attemptId === paymentAttemptId && \(recovery\.outcome === 'unknown' \|\| recovery\.outcome === 'approved'\)\) return;/
  );
  assert.match(addonsSource, /recovery\.outcome === 'failed'\s*&& !await clearPaymentRecoveryAfterCompletion\(paymentAttemptId\)\) return;/);
});

test('the page hides the shared Back action whenever the offer reports it hidden', () => {
  assert.match(pageSource, /const flowBackAction = getFlowBackAction\(\{ state, backState, addonsBackRule \}\);/);
  assert.match(pageSource, /\{flowBackAction && \(\s*<button/);
  assert.match(pageSource, /if \(flowBackAction === 'addons'\) \{\s*setAddonsBackRequest\(\(request\) => request \+ 1\);/);
  assert.match(pageSource, /onBackRuleChange=\{setAddonsBackRule\}/);
  assert.match(pageSource, /if \(state !== 'APP_ADDONS'\) \{\s*setAddonsStep\('SELECT'\);\s*setAddonsBackRule\('page'\);/);
  assert.doesNotMatch(pageSource, /addonsHandlesBack/);
});

// #330 criterion 2: a late result from a closed checkout cannot touch another purchase.

test('a retired checkout instance ignores its late result and releases ownership', () => {
  assert.match(paymentSource, /const current = \(\) => !cancelled && !terminal && ownership !== null && ownsCurrentRecord\(\);/);
  assert.match(paymentSource, /onPaymentCompleted: \(result: unknown\) => \{\s*if \(!current\(\)\) return;/);
  assert.match(paymentSource, /return \(\) => \{\s*cancelled = true;[\s\S]*?ownership\?\.release\(\);\s*ownership = null;\s*\};/);
  assert.match(paymentSource, /record\.bookingIdentifier === bookingIdentifier && record\.kind === kind/);
  // A late approval reaches the add-on offer only for the attempt that is still active.
  assert.match(addonsSource, /const handlePaymentApproved = \(\) => \{\s*if \(paymentApprovedRef\.current\) return;/);
  assert.match(addonsSource, /activePaymentAttemptRef\.current !== paymentAttemptId \|\| paymentApprovedRef\.current\) return;/);
});

// #330 extension approved by Love on 2026-09-04: no Back after a completed payment in either flow.

function pageDeclaration(name) {
  const sourceFile = ts.createSourceFile('page.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(sourceFile) === name) result = node.getText(sourceFile);
    ts.forEachChild(node, visit);
  });
  assert.ok(result, `Missing actual ${name} declaration`);
  return result;
}

const { getBackState } = (() => {
  const context = vm.createContext({ exports: {} });
  const input = `${pageDeclaration('prePaymentBack')}\n${pageDeclaration('getBackState')}\nexports.getBackState = getBackState;`;
  vm.runInContext(ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
})();

test('after a completed payment the safety video offers no way back into the purchase screens', () => {
  const ctx = (patch = {}) => ({
    channel: 'park-qr', connectedSelected: false, skyriderSelected: false, skyriderHeightConfirmed: false,
    paymentTotal: 0, paymentCompleted: false, ...patch,
  });
  assert.equal(getBackState('APP_SAFETY_VIDEO', ctx()), 'APP_ADDONS', 'an existing booking without a purchase may still return to the offer');
  assert.equal(getBackState('APP_SAFETY_VIDEO', ctx({ paymentTotal: 250 })), 'APP_PAYMENT', 'an unpaid legacy payment step keeps its return');
  assert.equal(getBackState('APP_SAFETY_VIDEO', ctx({ paymentCompleted: true })), null, 'paid add-ons: no Back');
  assert.equal(getBackState('APP_SAFETY_VIDEO', ctx({ paymentCompleted: true, paymentTotal: 250 })), null, 'paid entry: no Back');
  assert.equal(getBackState('APP_SAFETY_VIDEO', ctx({ paymentCompleted: true, connectedSelected: true })), null);
  assert.equal(getBackState('APP_SAFETY_ATTEST', ctx({ paymentCompleted: true })), 'APP_SAFETY_VIDEO', 'rewatching the video stays inside the safety block');
  assert.equal(getBackState('APP_CONFIRM', ctx({ paymentCompleted: true })), null);
  assert.match(pageSource, /case 'APP_SAFETY_VIDEO':\s*\/\/ #330[^\n]*\n\s*if \(ctx\.paymentCompleted\) return null;/);
});

const RECOVERY_CONFIG = {
  available: true,
  apiUrl: 'https://payments.example.test/api/',
  configurationId: 'config-1',
  integrationId: 'integration-1',
};
const attempt = (attemptId) => ({ attemptId, bookingIdentifier: 'booking-existing', kind: 'add_product', config: RECOVERY_CONFIG });
const originalNow = Date.now;
const originalWindow = globalThis.window;
let now = 1_900_000_000_000;
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
    location: { href: 'https://phone.example.test/?channel=park-qr#addons' },
    history: { state: null, replaceState() {} },
  };
});

afterEach(() => {
  Date.now = originalNow;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test('an add-on attempt discarded before submission cannot approve the replacement that followed it', async () => {
  const ownership = await acquirePaymentRecoveryOwnership();
  assert.ok(ownership, 'The checkout owner is required for discarding its own fresh attempt');
  assert.equal(beginPaymentRecovery(attempt('addon-attempt-1'))?.outcome, 'pending');
  // Back while the checkout is only ready: the clean exit discards the unsubmitted attempt.
  assert.equal(clearPaymentRecovery('addon-attempt-1'), true);
  now += 1;
  assert.equal(beginPaymentRecovery(attempt('addon-attempt-2'))?.outcome, 'pending');
  // The old checkout reports late; it may not touch the new purchase.
  assert.equal(setPaymentRecoveryOutcome('addon-attempt-1', 'approved'), false);
  assert.equal(clearPaymentRecovery('addon-attempt-1'), false);
  assert.equal(readPaymentRecovery()?.attemptId, 'addon-attempt-2');
  assert.equal(readPaymentRecovery()?.outcome, 'pending');
  ownership.release();
});

test('a submitted or approved add-on attempt blocks any replacement until it reaches its own outcome', async () => {
  const ownership = await acquirePaymentRecoveryOwnership();
  assert.equal(beginPaymentRecovery(attempt('addon-attempt-1'))?.outcome, 'pending');
  assert.equal(setPaymentRecoveryOutcome('addon-attempt-1', 'unknown'), true);
  now += 1;
  assert.equal(beginPaymentRecovery(attempt('addon-attempt-2')), null, 'Back cannot open a second checkout while the first is unresolved');
  assert.equal(clearPaymentRecovery('addon-attempt-1'), false);
  assert.equal(setPaymentRecoveryOutcome('addon-attempt-1', 'approved'), true);
  assert.equal(beginPaymentRecovery(attempt('addon-attempt-2')), null, 'An approved add-on may only continue forward');
  assert.equal(setPaymentRecoveryOutcome('addon-attempt-1', 'failed'), false, 'A late error cannot downgrade the approval');
  assert.equal(readPaymentRecovery()?.attemptId, 'addon-attempt-1');
  ownership.release();
});

test('a declined add-on attempt may be replaced, and its late approval is then ignored', async () => {
  const ownership = await acquirePaymentRecoveryOwnership();
  assert.equal(beginPaymentRecovery(attempt('addon-attempt-1'))?.outcome, 'pending');
  assert.equal(setPaymentRecoveryOutcome('addon-attempt-1', 'failed'), true);
  now += 1;
  assert.equal(beginPaymentRecovery(attempt('addon-attempt-2'))?.outcome, 'pending');
  assert.equal(setPaymentRecoveryOutcome('addon-attempt-1', 'approved'), false);
  assert.equal(readPaymentRecovery()?.attemptId, 'addon-attempt-2');
  assert.equal(readPaymentRecovery()?.outcome, 'pending');
  ownership.release();
});
