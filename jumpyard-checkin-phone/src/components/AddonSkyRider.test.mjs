import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./AddonsOffer.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AddonsOffer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = 'const ' + name + ' = ' + node.initializer.getText(ast) + ';';
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(found, name); return found;
}
function harness() {
  const steps = [], errors = [], quotes = []; let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const state = {
    submitting: false, skyriderConsentConfirmed: false, reviewQuoteInFlightRef: { current: false },
    booking: { id: 'DEMO', guestAccessToken: 'synthetic' }, requireAvailability: true,
    needsSkyRiderConsent: confirmed => !confirmed,
    buildItems: () => [{ productId: 1765443, quantity: 1 }],
    setSkyriderConsentConfirmed: value => { state.skyriderConsentConfirmed = value; },
    setSubmitting: value => { state.busy = value; }, setSubmitError: value => errors.push(value),
    setStep: value => steps.push(value), setQuote: value => quotes.push(value),
    quoteAddProducts: () => { state.calls++; return pending; }, calls: 0,
    t: { addons: { quoteFailed: 'Quote failed' } }, CloudBookingError: class extends Error {},
  };
  const code = declaration('goToReview') + declaration('confirmSkyRider') + ';globalThis.handlers={goToReview,confirmSkyRider};';
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, state);
  return { ...state.handlers, state, steps, errors, quotes, resolve, reject };
}
test('confirmed SkyRider remains on attestation while quoting and moves directly to review, once', async () => {
  const h = harness();
  h.confirmSkyRider(); h.confirmSkyRider();
  assert.equal(h.state.skyriderConsentConfirmed, true);
  assert.equal(h.state.calls, 1);
  assert.equal(h.state.busy, true);
  assert.deepEqual(h.steps, []);
  h.resolve({ costs: { amountOwing: 40 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.steps, ['REVIEW']);
  assert.equal(h.quotes.length, 1);
  assert.equal(h.state.busy, false);
});
test('failed quote keeps SkyRider confirmation and exposes a retryable error without showing selection', async () => {
  const h = harness(); h.confirmSkyRider(); h.reject(new Error('Offline'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.steps, []);
  assert.equal(h.errors.at(-1), 'Quote failed');
  assert.equal(h.state.busy, false);
  assert.equal(h.state.reviewQuoteInFlightRef.current, false);
  assert.equal(h.state.skyriderConsentConfirmed, true);
});
test('missing SkyRider consent still stops before requesting a quote', async () => {
  const h = harness(); await h.goToReview(false);
  assert.deepEqual(h.steps, ['SKYRIDER_ATTEST']); assert.equal(h.state.calls, 0);
});
