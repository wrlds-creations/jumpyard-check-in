import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { excludeKlarnaFromPaymentSession } from './paymentMethodPolicy.ts';

const require = createRequire(import.meta.url);
const flowRoot = path.dirname(fileURLToPath(import.meta.url));
const harnessFile = path.join(flowRoot, 'phonePaymentRecovery.test.mjs');
const harnessSource = fs.readFileSync(harnessFile, 'utf8');
const firstTest = harnessSource.search(/^test\(/m);
assert.ok(firstTest > 0);
// The real React component, recovery code and installed Roller SDK execute.
// Reuse the existing offline host without registering its unrelated tests.
const hostModule = harnessSource.slice(0, firstTest)
  .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(harnessFile).href))
  .replace("from 'typescript'", `from '${pathToFileURL(require.resolve('typescript')).href}'`);
const { createHarness, paymentSession, config } = await import(
  `data:text/javascript;base64,${Buffer.from(`${hostModule}\nexport { createHarness, paymentSession, config };`).toString('base64')}`
);
const recoveryFile = path.join(flowRoot, 'paymentRecovery.ts');
const providerFile = path.join(path.dirname(require.resolve('@roller/ecom-payments')), 'adyen.js');
const copy = value => JSON.parse(JSON.stringify(value));
const klarna = ['klarna', 'klarna_account', 'klarna_paynow'];

for (const kind of ['new_booking', 'add_product']) {
  for (const applePayAvailable of [false, true]) {
    test(`${kind}: the actual SDK session excludes Klarna and preserves Apple Pay eligibility (${applePayAvailable})`, async t => {
      const host = createHarness(t);
      if (applePayAvailable) {
        // Only replace the device capability probe; session creation is the SDK's.
        host.load(providerFile).AdyenCheckoutProvider.prototype.canUseApplePay = () => true;
      }
      const session = paymentSession(`merchant:${kind}`);
      const view = host.mount({ identity: kind, kind, paymentSession: session });
      await host.settle();
      assert.equal(view.status(), 'ready');
      assert.equal(host.records.sessions.length, 1);
      const request = host.records.sessions[0];
      assert.deepEqual(request.unsupportedPaymentMethods, applePayAvailable ? klarna : ['applepay', ...klarna]);
      assert.equal(request.unsupportedPaymentMethods.includes('scheme'), false);
      assert.equal(request.unsupportedPaymentMethods.includes('googlepay'), false);
      assert.equal(request.jwt, session.jwt, 'Exclusion must keep the original payment identity');
      assert.equal(request.provider, 1);
      assert.equal(request.hasRecurringBilling, false);
      assert.equal(request.redirectUrl, 'https://phone.invalid/');
      assert.equal(request.browser.locale, 'sv-SE');
      assert.equal(host.records.mounts.length, 1);
      assert.equal(host.records.submissions.length, 0, 'Rendering choices does not submit a payment');
      assert.ok(host.records.writes.every(write => !write.value.includes(session.jwt)));
    });
  }

  for (const resultCode of ['Authorised', 'Cancelled']) {
    test(`${kind}: a pre-existing Klarna return (${resultCode}) is reconciled without a new session`, async t => {
      const host = createHarness(t, {
        url: 'https://phone.invalid/?sessionId=old-klarna-session&redirectResult=synthetic-klarna-return',
        redirectResult: resultCode,
      });
      const recovery = host.load(recoveryFile);
      recovery.beginPaymentRecovery({ attemptId: 'old-klarna', bookingIdentifier: 'old-booking', kind, config });
      await recovery.bindPaymentRecoverySession('old-klarna', 'old-klarna-session');
      const record = recovery.readPaymentRecovery();
      const view = host.mount({
        identity: 'old-klarna', bookingIdentifier: 'old-booking', kind, returnAttempt: record,
        paymentSession: { jwtPresent: false, config },
      });
      await host.settle();
      const expected = resultCode === 'Authorised' ? 'approved' : 'failed';
      assert.equal(view.status(), expected);
      assert.equal(recovery.readPaymentRecovery().outcome, expected);
      assert.equal(host.records.sessions.length, 0);
      assert.equal(host.records.mounts.length, 0);
      assert.equal(host.records.submissions.length, 1);
      assert.equal(host.records.submissions[0].sessionId, 'old-klarna-session');
      assert.ok(host.records.requests.every(request => request.method === 'GET'), 'No session policy is sent on the return path');
      assert.ok(host.records.writes.every(write => !write.value.includes('synthetic-klarna-return')));
    });
  }

  test(`${kind}: an unresolved old payment still blocks a replacement checkout`, async t => {
    const host = createHarness(t);
    const recovery = host.load(recoveryFile);
    recovery.beginPaymentRecovery({ attemptId: 'old-pending', bookingIdentifier: 'old-booking', kind, config });
    await recovery.bindPaymentRecoverySession('old-pending', 'old-session');
    recovery.setPaymentRecoveryOutcome('old-pending', 'unknown');
    const original = copy(recovery.readPaymentRecovery());
    const view = host.mount({ identity: 'replacement', kind, paymentSession: paymentSession('replacement') });
    await host.settle();
    assert.equal(view.status(), 'unknown');
    assert.equal(host.records.sessions.length, 0);
    assert.equal(host.records.mounts.length, 0);
    assert.deepEqual(copy(recovery.readPaymentRecovery()), original);
  });
}

test('session policy retains other provider exclusions, order fields and the input object', () => {
  const input = Object.freeze({
    provider: 1, jwt: 'synthetic', redirectUrl: 'https://phone.invalid/',
    unsupportedPaymentMethods: Object.freeze(['applepay', 'ideal', 'klarna_account']),
    browser: Object.freeze({ locale: 'sv-SE' }), hasRecurringBilling: false,
  });
  const result = excludeKlarnaFromPaymentSession(input, 1);
  assert.deepEqual(result.unsupportedPaymentMethods, ['applepay', 'ideal', 'klarna_account', 'klarna', 'klarna_paynow']);
  assert.deepEqual({ ...result, unsupportedPaymentMethods: input.unsupportedPaymentMethods }, input);
  assert.deepEqual(input.unsupportedPaymentMethods, ['applepay', 'ideal', 'klarna_account']);
  assert.deepEqual(excludeKlarnaFromPaymentSession(result, 1), result, 'Applying the policy twice must not duplicate exclusions');
});

test('another payment provider is left untouched', () => {
  const input = Object.freeze({ provider: 2, jwt: 'synthetic', unsupportedPaymentMethods: ['unrelated'] });
  assert.equal(excludeKlarnaFromPaymentSession(input, 1), input);
});

test('an incompatible Adyen exclusion contract fails before a request can be sent', () => {
  for (const input of [null, [], 'invalid', { provider: 1, unsupportedPaymentMethods: 'applepay' },
    { provider: 1, unsupportedPaymentMethods: [null] }]) {
    assert.throws(() => excludeKlarnaFromPaymentSession(input, 1), /Invalid payment/);
  }
});
