import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import { getAddonBackRule } from './addonPaymentNavigation.ts';

// #520 (Love, 2026-10-13): "om jag ska lägga till en extra vattenflaska så får jag upp sammanställningen
// innan säkerhetsvideo, den ska komma efter precis som när man köper entré". An existing booking that adds
// something to pay for watches the safety film right after the add-ons, then sees the summary and pays.
// These tests run the real AddonsOffer handlers and the page's progress mapping.
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const source = Object.fromEntries([
  ['addons', '../components/AddonsOffer.tsx'], ['page', '../app/page.tsx'],
].map(([key, file]) => [key, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)]));

function find(file, predicate) {
  let result;
  const visit = node => {
    if (!result && predicate(node)) result = node;
    ts.forEachChild(node, visit);
  };
  visit(source[file]);
  assert.ok(result, `Missing production node in ${file}`);
  return result;
}

function declaration(file, name) {
  const node = find(file, node => (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
    && node.name?.getText(source[file]) === name);
  return ts.isFunctionDeclaration(node) ? node.getText(source[file])
    : `const ${name} = ${node.initializer.getText(source[file])};`;
}

function prop(file, tag, name) {
  const element = find(file, node => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
    && node.tagName.getText(source[file]) === tag
    && node.attributes.properties.some(attribute => attribute.name?.getText(source[file]) === name));
  const attribute = element.attributes.properties.find(attribute => attribute.name?.getText(source[file]) === name);
  return attribute.initializer.expression.getText(source[file]);
}

// The effect that handles the page's shared Back action inside the add-on flow.
function effect(file, marker) {
  const call = find(file, node => ts.isCallExpression(node) && node.expression.getText(source[file]) === 'useEffect'
    && node.arguments[0]?.getText(source[file]).includes(marker));
  return call.arguments[0].getText(source[file]);
}

function compile(input, context) {
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context;
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const approvedAt = '2026-10-13T10:00:00.000Z';
const WATER = { id: 'water_bottle', label: 'Vattenflaska', price: 20, qty: 1, rollerProductId: 1040 };
const SKYRIDER = { id: 'skyrider', label: 'SkyRider', price: 40, qty: 1, rollerProductId: 1765443, requiresAvailability: true };

function harness({ safetyBeforePayment = true, earlierApproval = null, added = [WATER], quote } = {}) {
  const steps = [];
  const calls = { quote: 0, draft: 0, complete: 0 };
  class CloudBookingError extends Error {}
  const ctx = {
    Promise, Error, Date, CloudBookingError, getAddonBackRule,
    useCallback: callback => callback,
    t: { addons: { quoteFailed: 'Vi kunde inte räkna ut tillägget.', draftFailed: 'Draft failed', unsupportedSelection: 'Unsupported' } },
    booking: { id: 'DEMO', guestAccessToken: 'synthetic' },
    safetyBeforePayment,
    step: 'SELECT',
    safetyApprovedAt: earlierApproval,
    quote: null,
    draft: null,
    submitting: false,
    submitError: null,
    paymentFailure: null,
    paymentNavigationLocked: false,
    catalogLoading: false,
    catalogError: null,
    addedAddons: added,
    addedSkyrider: added.some(addon => addon.id === 'skyrider'),
    skyriderConsentConfirmed: false,
    requireAvailability: added.some(addon => addon.requiresAvailability === true),
    paymentAttemptId: '',
    backRequest: 0,
    handledBackRequest: { current: 0 },
    reviewRequestRef: { current: 0 },
    reviewQuoteInFlightRef: { current: false },
    activePaymentAttemptRef: { current: '' },
    paymentApprovedRef: { current: false },
    paymentNavigationLockedRef: { current: false },
    buildItems: () => ctx.addedAddons.map(addon => ({ productId: addon.rollerProductId, quantity: addon.qty })),
    completeAddons: () => { calls.complete += 1; },
    canStartPayment: () => true,
    readPaymentRecovery: () => null,
    clearPaymentRecoveryAfterCompletion: async () => true,
    quoteAddProducts: async (...args) => {
      calls.quote += 1;
      if (quote) return quote(...args);
      return { externalId: 'quote', costs: { total: 20, amountOwing: 20 } };
    },
    createAddProductDraft: async () => {
      calls.draft += 1;
      return { draft: { uniqueId: 'addon-draft', costs: { amountOwing: 20 } }, paymentSession: { jwtPresent: true } };
    },
    setStep: value => { ctx.step = value; steps.push(value); },
    setSafetyApprovedAt: value => { ctx.safetyApprovedAt = typeof value === 'function' ? value(ctx.safetyApprovedAt) : value; },
    setQuote: value => { ctx.quote = value; },
    setDraft: value => { ctx.draft = value; },
    setSubmitting: value => { ctx.submitting = value; },
    setSubmitError: value => { ctx.submitError = value; },
    setPaymentFailure: value => { ctx.paymentFailure = value; },
    setPaymentNavigationLocked: value => { ctx.paymentNavigationLocked = value; },
    setSkyriderConsentConfirmed: value => { ctx.skyriderConsentConfirmed = value; },
  };
  // Rendered from the current step, as on every render of the offer.
  Object.defineProperty(ctx, 'backRule', {
    enumerable: true,
    get: () => getAddonBackRule({ step: ctx.step, paymentNavigationLocked: ctx.paymentNavigationLocked, paymentFailure: ctx.paymentFailure }),
  });
  compile([
    ...['needsSkyRiderConsent', 'returnToSelect', 'handleSelectContinue', 'goToStepAfterAddons', 'goToReview', 'confirmSkyRider', 'createDraft']
      .map(name => declaration('addons', name)),
    `const approveSafety = ${prop('addons', 'SafetyVideo', 'onApprove')};`,
    `const handleBack = ${effect('addons', 'handledBackRequest.current = backRequest')};`,
    'globalThis.handlers = { handleSelectContinue, confirmSkyRider, createDraft, approveSafety, handleBack, returnToSelect };',
  ].join('\n'), ctx);
  const back = () => { ctx.backRequest += 1; ctx.handlers.handleBack(); };
  return { ...ctx.handlers, ctx, steps, calls, back };
}

test('an extra water bottle: add-ons, then the film, then the summary and payment, with one quote', async () => {
  const host = harness();
  host.handleSelectContinue();
  assert.equal(host.ctx.step, 'SAFETY', 'Continue on the add-ons opens the film');
  assert.equal(host.calls.quote, 0, 'no price is asked before the film');
  host.approveSafety(approvedAt);
  assert.equal(host.ctx.submitting, true, 'the approval shows its busy state while the price is asked');
  await settle();
  assert.equal(host.ctx.step, 'REVIEW', 'the summary follows the approval');
  assert.equal(host.ctx.safetyApprovedAt, approvedAt);
  assert.equal(host.ctx.quote.costs.amountOwing, 20);
  assert.equal(host.calls.quote, 1);
  await host.createDraft();
  assert.equal(host.ctx.step, 'PAYMENT');
  assert.equal(host.calls.draft, 1);
  assert.deepEqual(host.steps, ['SAFETY', 'REVIEW', 'PAYMENT']);
});

test('Back from the summary returns to the film; approving again keeps the summary and its quote', async () => {
  const host = harness();
  host.handleSelectContinue();
  host.approveSafety(approvedAt);
  await settle();
  host.back();
  assert.equal(host.ctx.step, 'SAFETY', 'Back from the summary shows the film again');
  assert.ok(host.ctx.quote, 'the summary keeps its price');
  host.approveSafety(host.ctx.safetyApprovedAt);
  await settle();
  assert.equal(host.ctx.step, 'REVIEW');
  assert.equal(host.calls.quote, 1, 'at most one add-products quote per summary');
  assert.equal(host.ctx.safetyApprovedAt, approvedAt, 'the first approval keeps its time');
  host.back();
  host.back();
  assert.equal(host.ctx.step, 'SELECT', 'Back from the film returns to the add-ons');
  assert.equal(host.ctx.quote, null);
  assert.deepEqual(host.steps, ['SAFETY', 'REVIEW', 'SAFETY', 'REVIEW', 'SAFETY', 'SELECT']);
});

test('an approval already given goes straight to the summary, as today', async () => {
  const host = harness({ earlierApproval: approvedAt });
  host.handleSelectContinue();
  assert.equal(host.ctx.submitting, true, 'Continue shows its busy state on the add-ons while the price is asked');
  await settle();
  assert.deepEqual(host.steps, ['REVIEW']);
  assert.equal(host.calls.quote, 1);

  // The same in one visit: back through the film to the add-ons, then Continue again.
  const visit = harness();
  visit.handleSelectContinue();
  visit.approveSafety(approvedAt);
  await settle();
  visit.back();
  visit.back();
  visit.handleSelectContinue();
  await settle();
  assert.deepEqual(visit.steps, ['SAFETY', 'REVIEW', 'SAFETY', 'SELECT', 'REVIEW']);
  assert.equal(visit.calls.quote, 2, 'one quote for each summary');
});

test('Back from the film while its price is on the way stays on the add-ons', async () => {
  const pending = deferred();
  const host = harness({ quote: () => pending.promise });
  host.handleSelectContinue();
  host.approveSafety(approvedAt);
  host.back();
  assert.equal(host.ctx.step, 'SELECT');
  pending.resolve({ externalId: 'late', costs: { total: 20, amountOwing: 20 } });
  await settle();
  assert.equal(host.ctx.step, 'SELECT', 'a late quote never opens the summary');
  assert.equal(host.ctx.quote, null);
  assert.equal(host.ctx.submitting, false);
  assert.deepEqual(host.steps, ['SAFETY', 'SELECT']);
});

test('a failed quote after the film returns to the add-ons with its message; Continue then opens the summary', async () => {
  let failures = 1;
  const host = harness({ quote: async () => {
    if (failures-- > 0) throw new Error('offline');
    return { externalId: 'retry', costs: { total: 20, amountOwing: 20 } };
  } });
  host.handleSelectContinue();
  host.approveSafety(approvedAt);
  await settle();
  assert.equal(host.ctx.step, 'SELECT');
  assert.equal(host.ctx.submitError, 'Vi kunde inte räkna ut tillägget.');
  assert.equal(host.ctx.safetyApprovedAt, approvedAt, 'the approval stands');
  host.handleSelectContinue();
  await settle();
  assert.deepEqual(host.steps, ['SAFETY', 'SELECT', 'REVIEW'], 'no second film');
  assert.equal(host.ctx.submitError, null);
});

test('SkyRider is confirmed first, then the film, then the summary', async () => {
  const host = harness({ added: [SKYRIDER] });
  host.handleSelectContinue();
  assert.equal(host.ctx.step, 'SKYRIDER_ATTEST');
  host.confirmSkyRider();
  assert.equal(host.ctx.step, 'SAFETY');
  assert.equal(host.calls.quote, 0);
  host.approveSafety(approvedAt);
  await settle();
  assert.deepEqual(host.steps, ['SKYRIDER_ATTEST', 'SAFETY', 'REVIEW']);
  assert.equal(host.calls.quote, 1);
});

test('a declined payment returns to the add-ons, and the next summary follows without a second film', async () => {
  const host = harness();
  host.handleSelectContinue();
  host.approveSafety(approvedAt);
  await settle();
  await host.createDraft();
  // "Välj annat betalsätt" after a confirmed decline closes the attempt and reopens the add-ons.
  host.ctx.paymentFailure = 'failed';
  await host.returnToSelect();
  assert.equal(host.ctx.step, 'SELECT');
  assert.equal(host.ctx.quote, null);
  assert.equal(host.ctx.draft, null);
  host.handleSelectContinue();
  await settle();
  assert.deepEqual(host.steps, ['SAFETY', 'REVIEW', 'PAYMENT', 'SELECT', 'REVIEW']);
  assert.equal(host.calls.quote, 2);
});

test('nothing to pay and the old order are unchanged', async () => {
  const free = harness({ added: [] });
  free.handleSelectContinue();
  assert.equal(free.calls.complete, 1, 'no add-ons: the page continues to its own safety step');
  assert.deepEqual(free.steps, []);

  const old = harness({ safetyBeforePayment: false });
  old.handleSelectContinue();
  await settle();
  assert.equal(old.ctx.step, 'REVIEW');
  old.back();
  assert.equal(old.ctx.step, 'SELECT', 'without safety before payment Back from the summary returns to the add-ons');
});

test('the progress bar lights up Safety for the film and Payment for the summary', () => {
  const context = compile(`${declaration('page', 'getSafetyFirstStepIndex')}\nglobalThis.index = getSafetyFirstStepIndex;`, {});
  const index = step => context.index('APP_ADDONS', step);
  assert.equal(index('SELECT'), 1);
  assert.equal(index('SKYRIDER_ATTEST'), 1);
  assert.equal(index('SAFETY'), 2);
  assert.equal(index('REVIEW'), 3);
  assert.equal(index('PAYMENT'), 3);
  assert.equal(index('APPROVED'), 3);
});
