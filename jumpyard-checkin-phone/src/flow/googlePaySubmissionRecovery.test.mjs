import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const flowRoot = path.dirname(fileURLToPath(import.meta.url));
const recoveryFile = path.join(flowRoot, 'paymentRecovery.ts');
const harnessFile = path.join(flowRoot, 'phonePaymentRecovery.test.mjs');
const harnessSource = fs.readFileSync(harnessFile, 'utf8');
const firstTest = harnessSource.search(/^test\(/m);
assert.ok(firstTest > 0, 'The shared offline host must precede its test declarations');

// Reuse the existing offline React/HTTP host without registering its tests or
// copying its implementation. The component, recovery module and Roller SDK
// continue to execute unchanged inside that host.
const hostModule = harnessSource.slice(0, firstTest)
  .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(harnessFile).href))
  .replace("from 'typescript'", `from '${pathToFileURL(require.resolve('typescript')).href}'`);
const { createHarness, paymentSession } = await import(
  `data:text/javascript;base64,${Buffer.from(`${hostModule}\nexport { createHarness, paymentSession };`).toString('base64')}`
);

const adyenPackage = path.dirname(require.resolve('@adyen/adyen-web/package.json'));
const sourceMap = JSON.parse(fs.readFileSync(path.join(adyenPackage, 'dist/adyen.js.map'), 'utf8'));
const googleSourceIndex = sourceMap.sources.indexOf('../src/components/GooglePay/GooglePay.tsx');
assert.ok(googleSourceIndex >= 0, 'The installed Adyen package must provide its Google Pay source');
const googleAst = ts.createSourceFile('GooglePay.tsx', sourceMap.sourcesContent[googleSourceIndex], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const googleClass = googleAst.statements.find(ts.isClassDeclaration);
const submitMember = googleClass?.members.find(member => member.name?.getText(googleAst) === 'submit');
assert.ok(submitMember, 'Exercise the installed GooglePay.submit, never a hand-written replacement');
const googleSubmitSource = ts.transpileModule(
  `class GooglePay extends UIElement { ${submitMember.getText(googleAst)} }; exports.GooglePay = GooglePay;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

const syntheticErrorText = 'OR_BIBED_06 synthetic merchant error';
const walletData = {
  paymentMethodData: {
    tokenizationData: { token: 'synthetic-google-token' },
    info: { cardNetwork: 'VISA' },
  },
};
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const merchantFailure = () => ({ statusCode: 'DEVELOPER_ERROR', toString: () => syntheticErrorText });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

async function fixture(t, identity = 'google-attempt', options = {}) {
  const host = createHarness(t, options);
  const recovery = host.load(recoveryFile);
  const view = host.mount({ identity, paymentSession: paymentSession(`merchant:${identity}`) });
  await host.settle();
  assert.equal(view.status(), 'ready');
  const observations = { baseSubmissions: [], releases: [], rejections: [], forwardedResults: [] };
  const sdkDirectory = path.dirname(require.resolve('@roller/ecom-payments'));
  const Provider = host.load(path.join(sdkDirectory, 'adyen.js')).AdyenCheckoutProvider;
  const originalGetResult = Provider.prototype.getPaymentResult;
  Provider.prototype.getPaymentResult = function (raw) {
    const result = originalGetResult.call(this, raw);
    observations.forwardedResults.push(copy(result));
    return result;
  };

  class CheckoutError extends Error {
    constructor(type, message, options) {
      super(message);
      this.name = type;
      this.type = type;
      this.cause = options?.cause;
    }
  }

  function wallet(initiatePayment, checkoutIndex = 0) {
    // Google Pay's real submit waits for the wallet token before calling its
    // base UI submission. Route that base boundary into the real Roller
    // beforeSubmit hook, observing whether its Adyen action is released.
    class BaseElement {
      submit() {
        observations.baseSubmissions.push(checkoutIndex);
        const checkout = host.records.checkouts[checkoutIndex];
        checkout.configuration.beforeSubmit({ paymentMethod: { type: 'googlepay' } }, checkout.element, {
          resolve() {
            observations.releases.push({ checkoutIndex, record: copy(recovery.readPaymentRecovery()) });
          },
          reject() { observations.rejections.push(checkoutIndex); },
        });
      }
    }
    const context = vm.createContext({
      UIElement: BaseElement,
      AdyenCheckoutError: CheckoutError,
      ANALYTICS_SELECTED_STR: 'selected',
      ANALYTICS_INSTANT_PAYMENT_BUTTON: 'instant',
      exports: {},
    });
    new vm.Script(googleSubmitSource, { filename: 'installed-GooglePay.submit.js' }).runInContext(context);
    const google = new context.exports.GooglePay();
    google.props = { onClick: resolve => resolve() };
    google.googlePay = { initiatePayment };
    google.setState = () => undefined;
    google.handleError = error => {
      const checkout = host.records.checkouts[checkoutIndex];
      const callback = error.type === 'CANCEL' ? checkout.configuration.onCancel : checkout.configuration.onError;
      callback(error, checkout.element);
    };
    return google;
  }

  t.after(() => {
    assert.equal(host.records.writes.some(write => write.value.includes(syntheticErrorText)), false,
      'Raw wallet errors must not be persisted');
    assert.equal(host.records.unexpectedRequests.length, 0, 'All provider and HTTP boundaries stay offline');
  });
  return { host, recovery, view, observations, wallet };
}

test('Google Pay merchant rejection before submission permits another method even though Roller drops the error context', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  await wallet(async () => { throw merchantFailure(); }).submit();
  await host.settle();

  assert.equal(observations.baseSubmissions.length, 0);
  assert.equal(observations.releases.length, 0, 'No Adyen payment submission was released');
  assert.equal(observations.forwardedResults.at(-1)?.rawResult?.resultCode, 'Error');
  assert.equal(view.status(), 'failed', 'An owned explicit pre-submit failure must expose the existing method retry');
  assert.equal(recovery.readPaymentRecovery().outcome, 'failed');
  assert.equal(host.records.callbacks.at(-1)?.result.status, 'failed');
  assert.equal(host.records.locks.at(-1)?.locked, false);
  assert.equal(host.records.sessions.length, 1, 'Failure handling must not silently create another checkout');
});

test('Google Pay CANCELED remains a terminal cancellation before submission', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  await wallet(async () => { throw { statusCode: 'CANCELED', toString: () => 'Synthetic user cancellation' }; }).submit();
  await host.settle();

  assert.equal(observations.baseSubmissions.length, 0);
  assert.equal(observations.releases.length, 0);
  assert.equal(view.status(), 'failed');
  assert.equal(recovery.readPaymentRecovery().outcome, 'failed');
});

test('a generic wallet error after an actual Google Pay submission remains unknown', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  await wallet(async () => walletData).submit();
  await host.settle();
  assert.equal(observations.baseSubmissions.length, 1);
  assert.equal(observations.releases.length, 1);

  await wallet(async () => { throw merchantFailure(); }).submit();
  await host.settle();
  assert.equal(observations.releases.length, 1);
  assert.equal(view.status(), 'unknown');
  assert.equal(recovery.readPaymentRecovery().outcome, 'unknown');
  assert.equal(host.records.locks.at(-1)?.locked, true);
  assert.equal(observations.releases[0].record?.submission?.phase, 'submitted',
    'The exact attempt must be durably marked submitted before the Adyen action is released');
});

test('a retired Google Pay instance cannot release a delayed token or alter the replacement attempt', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  const token = deferred();
  const oldSubmission = wallet(() => token.promise).submit();
  await host.settle();
  await wallet(async () => { throw merchantFailure(); }).submit();
  await host.settle();
  assert.equal(view.status(), 'failed');

  const replacement = host.mount({ identity: 'replacement-attempt', paymentSession: paymentSession('merchant:replacement') });
  await host.settle();
  assert.equal(replacement.status(), 'ready');
  const callbacksBeforeLateResult = host.records.callbacks.length;
  token.resolve(walletData);
  await oldSubmission;
  await host.settle();
  host.complete(0, 'Authorised');
  await host.settle();

  assert.equal(observations.baseSubmissions.length, 1, 'The old Google window really delivered its delayed token');
  assert.equal(observations.releases.length, 0, 'The retired Adyen action must remain blocked');
  assert.equal(host.records.callbacks.length, callbacksBeforeLateResult);
  assert.equal(recovery.readPaymentRecovery().attemptId, 'replacement-attempt');
  assert.equal(recovery.readPaymentRecovery().outcome, 'pending');
  assert.equal(replacement.status(), 'ready');
  assert.equal(host.records.sessions.length, 2, 'Only the explicit replacement creates a second checkout');
});

for (const storagePrefix of ['jumpyard.paymentObservation.', 'jumpyard.paymentSubmission.']) {
  test(`${storagePrefix} persistence failure never releases the Google Pay action`, async t => {
    const { host, recovery, view, observations, wallet } = await fixture(t);
    const recoveryKey = host.records.writes.find(write => write.key.startsWith(storagePrefix))?.key;
    assert.ok(recoveryKey, 'The active attempt must have established its durable evidence');
    const originalSetItem = host.window.localStorage.setItem;
    let rejectedWrites = 0;
    host.window.localStorage.setItem = function (key, value) {
      if (key === recoveryKey) {
        rejectedWrites += 1;
        throw new Error('Synthetic quota failure');
      }
      return originalSetItem.call(this, key, value);
    };
    try {
      await wallet(async () => walletData).submit();
      await host.settle();
      assert.equal(observations.baseSubmissions.length, 1);
      assert.ok(rejectedWrites > 0, 'The storage fault must occur on the actual submission path');
      assert.equal(observations.releases.length, 0, 'An unrecorded submission must never leave the browser');
      assert.equal(view.status(), 'unknown');
      assert.notEqual(recovery.readPaymentRecovery()?.outcome, 'failed');
    } finally {
      host.window.localStorage.setItem = originalSetItem;
    }
  });
}

test('a successful Google Pay result still reaches the approved confirmation exactly once', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  await wallet(async () => walletData).submit();
  await host.settle();
  assert.equal(observations.releases.length, 1);
  host.complete(0, 'Authorised');
  host.complete(0, 'Authorised');
  await host.settle();
  assert.equal(view.status(), 'approved');
  assert.equal(recovery.readPaymentRecovery().outcome, 'approved');
  assert.equal(host.records.callbacks.filter(callback => callback.kind === 'approved').length, 1);
});

test('an authoritative approval cannot be downgraded by a later Google Pay error', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  await wallet(async () => walletData).submit();
  await host.settle();
  host.complete(0, 'Authorised');
  await host.settle();
  const callbacksAtApproval = host.records.callbacks.length;
  await wallet(async () => { throw merchantFailure(); }).submit();
  await host.settle();
  assert.equal(observations.releases.length, 1);
  assert.equal(view.status(), 'approved');
  assert.equal(recovery.readPaymentRecovery().outcome, 'approved');
  assert.equal(host.records.callbacks.length, callbacksAtApproval);
});

for (const receivedCode of ['Pending', 'Received']) {
  test(`${receivedCode} before a Google Pay error invalidates pre-submit failure recovery`, async t => {
    const { host, recovery, view, observations, wallet } = await fixture(t);
    host.complete(0, receivedCode);
    await host.settle();
    assert.equal(view.status(), 'received', 'The real Roller pending path must notify the wrapper');
    await wallet(async () => { throw merchantFailure(); }).submit();
    await host.settle();
    assert.equal(observations.baseSubmissions.length, 0);
    assert.equal(observations.releases.length, 0);
    assert.equal(view.status(), 'unknown');
    assert.equal(recovery.readPaymentRecovery().outcome, 'unknown');
    assert.equal(host.records.callbacks.some(callback => callback.result.status === 'failed'), false);
  });
}

test('pagehide and remount without a terminal wallet result cannot create a new payment opportunity', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  const token = deferred();
  const oldSubmission = wallet(() => token.promise).submit();
  await host.settle();
  host.window.dispatchEvent({ type: 'pagehide', persisted: true });
  view.unmount();
  const restored = host.mount({ identity: 'google-attempt', paymentSession: paymentSession('merchant:google-attempt') });
  await host.settle();
  host.window.dispatchEvent({ type: 'pageshow', persisted: true });
  host.window.dispatchEvent({ type: 'popstate' });
  await host.settle();
  assert.equal(restored.status(), 'unknown');
  assert.equal(host.records.sessions.length, 1, 'Browser navigation is not evidence of failed payment');

  token.resolve(walletData);
  await oldSubmission;
  await host.settle();
  assert.equal(observations.baseSubmissions.length, 1);
  assert.equal(observations.releases.length, 0, 'The prior document cannot release a delayed Google token');
  assert.equal(recovery.readPaymentRecovery().outcome, 'unknown');
  assert.equal(restored.status(), 'unknown');
});

test('a retained browser-back owner may recover an explicit pre-submit error while its delayed token stays blocked', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  const token = deferred();
  const oldSubmission = wallet(() => token.promise).submit();
  await host.settle();
  host.window.dispatchEvent({ type: 'pagehide', persisted: true });
  host.window.dispatchEvent({ type: 'pageshow', persisted: true });
  await host.settle();
  await wallet(async () => { throw merchantFailure(); }).submit();
  await host.settle();
  assert.equal(view.status(), 'failed', 'The still-owned prepared instance received an explicit error');
  assert.equal(recovery.readPaymentRecovery().outcome, 'failed');

  token.resolve(walletData);
  await oldSubmission;
  await host.settle();
  host.complete(0, 'Authorised');
  await host.settle();
  assert.equal(observations.baseSubmissions.length, 1);
  assert.equal(observations.releases.length, 0);
  assert.equal(recovery.readPaymentRecovery().outcome, 'failed');
  assert.equal(view.status(), 'failed');
  assert.equal(host.records.sessions.length, 1);
  assert.equal(host.records.callbacks.some(callback => callback.kind === 'approved'), false);
});

test('without browser ownership locks a Google Pay error retains legacy unknown recovery', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t, 'google-attempt', { lockManager: null });
  await wallet(async () => { throw merchantFailure(); }).submit();
  await host.settle();
  assert.equal(observations.baseSubmissions.length, 0);
  assert.equal(observations.releases.length, 0);
  assert.equal(view.status(), 'unknown');
  assert.equal(recovery.readPaymentRecovery().outcome, 'unknown');
  assert.equal(host.records.callbacks.some(callback => callback.result.status === 'failed'), false);
});

test('a second browser context cannot change the owned attempt or create a competing checkout', async t => {
  const { host, recovery, view, observations, wallet } = await fixture(t);
  const initialNow = recovery.readPaymentRecovery().createdAt;
  const other = createHarness(t, { lockManager: host.navigator.locks, localStorage: host.window.localStorage, initialNow });
  const otherRecovery = other.load(recoveryFile);
  assert.equal(otherRecovery.setPaymentRecoveryOutcome('google-attempt', 'failed'), false);
  assert.equal(otherRecovery.setPaymentRecoveryOutcome('google-attempt', 'approved'), false);
  assert.equal(await otherRecovery.approvePaymentRecovery('google-attempt'), false,
    'Another tab cannot acquire the protected writer lease while this checkout owns it');
  assert.equal(otherRecovery.claimPaymentRedirect('google-attempt'), false);
  assert.equal(recovery.readPaymentRecovery().outcome, 'pending');
  assert.equal(recovery.readPaymentRecovery().submission.phase, 'prepared');

  const competing = other.mount({ identity: 'competing-attempt', paymentSession: paymentSession('merchant:competing') });
  await other.settle();
  await host.settle();
  assert.equal(competing.status(), 'unknown');
  assert.equal(other.records.sessions.length, 0);
  assert.equal(recovery.readPaymentRecovery().attemptId, 'google-attempt');
  assert.equal(view.status(), 'ready');

  await wallet(async () => walletData).submit();
  await host.settle();
  host.complete(0, 'Authorised');
  await host.settle();
  assert.equal(observations.releases.length, 1, 'Only the original owner can release the payment');
  assert.equal(view.status(), 'approved');
  assert.equal(recovery.readPaymentRecovery().outcome, 'approved');
});

test('a replacement in another tab survives stale storage reads and the old Google wallet token', async t => {
  const first = await fixture(t);
  const token = deferred();
  const oldSubmission = first.wallet(() => token.promise).submit();
  await first.host.settle();
  await first.wallet(async () => { throw merchantFailure(); }).submit();
  await first.host.settle();
  assert.equal(first.view.status(), 'failed');
  const sharedStorage = first.host.window.localStorage;
  const recoveryKey = first.host.records.writes.find(write => write.key.startsWith('jumpyard.paymentRecovery.')).key;
  const oldBase = sharedStorage.getItem(recoveryKey);
  const initialNow = first.recovery.readPaymentRecovery().createdAt;
  const second = await fixture(t, 'other-tab-replacement', {
    lockManager: first.host.navigator.locks,
    localStorage: sharedStorage,
    initialNow,
  });
  const replacementRecord = copy(second.recovery.readPaymentRecovery());

  // A third tab began reading before the owner replaced the failed checkout.
  // Finish that read after the real replacement has established its proof.
  const stale = createHarness(t, { lockManager: first.host.navigator.locks, localStorage: sharedStorage, initialNow });
  const staleRecovery = stale.load(recoveryFile);
  const originalGetItem = sharedStorage.getItem;
  let staleReadDelivered = false;
  sharedStorage.getItem = function (key) {
    if (key === recoveryKey && !staleReadDelivered) {
      staleReadDelivered = true;
      return oldBase;
    }
    return originalGetItem.call(this, key);
  };
  try {
    staleRecovery.readPaymentRecovery();
  } finally {
    sharedStorage.getItem = originalGetItem;
  }
  assert.equal(staleReadDelivered, true);
  assert.equal(JSON.parse(sharedStorage.getItem(recoveryKey)).attemptId, 'other-tab-replacement',
    'An observation must never overwrite a newer checkout identity');
  const afterObservation = second.recovery.readPaymentRecovery();
  assert.equal(afterObservation.outcome, 'pending');
  assert.equal(afterObservation.sessionHash, replacementRecord.sessionHash);
  assert.equal(afterObservation.submission.phase, 'prepared');
  assert.equal(afterObservation.submission.ownerId, replacementRecord.submission.ownerId);
  assert.equal(afterObservation.submission.sessionHash, replacementRecord.submission.sessionHash);

  token.resolve(walletData);
  await oldSubmission;
  await first.host.settle();
  first.host.complete(0, 'Authorised');
  await first.host.settle();
  await second.host.settle();
  assert.equal(first.observations.baseSubmissions.length, 1);
  assert.equal(first.observations.releases.length, 0);
  assert.equal(second.recovery.readPaymentRecovery().attemptId, 'other-tab-replacement');
  assert.equal(second.recovery.readPaymentRecovery().outcome, 'pending');
  assert.equal(second.view.status(), 'ready');
  assert.equal(second.host.records.callbacks.length, 0);
});
