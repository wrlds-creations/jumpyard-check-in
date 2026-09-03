import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('BuyTickets.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Run the actual component's handlers with an isolated state/cloud host. These
// tests make no network calls and do not replace the handler implementations.
function declaration(name) {
  let result;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(sourceFile) === name) {
      result = ts.isFunctionDeclaration(node)
        ? node.getText(sourceFile)
        : `const ${name} = ${node.initializer.getText(sourceFile)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  assert.ok(result, `Missing actual ${name} declaration`);
  return result;
}

function load(names, globals) {
  const context = vm.createContext(globals);
  const input = names.map(declaration).join('\n') + `\nglobalThis.handlers = { ${names.join(', ')} };`;
  const output = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInContext(output, context);
  return context.handlers;
}

const draft = {
  draft: { uniqueId: 'booking-original', bookingReference: 'reference-original', costs: { amountOwing: 200 } },
  prepayment: { prepaymentDraftId: 'attempt-original', amountOwing: 200, status: 'payment_pending' },
};

function recoveryHarness({ failure = 'unknown', outcome = failure, lookup = async () => ({ paid: false }) } = {}) {
  const events = [];
  const state = {
    draft,
    paymentFailure: failure,
    paymentStatusCheckingRef: { current: false },
    paymentResolutionStartedRef: { current: false },
    activePaymentAttemptRef: { current: 'attempt-original' },
    readPaymentRecovery: () => ({ attemptId: 'attempt-original', outcome }),
    readBuyFlowRecovery: () => ({
      currentFlowStep: 'PAYMENT', bookingReference: 'reference-original', draftUniqueId: 'booking-original',
      draftState: { paymentApproved: false }, quantity: 2, addonQty: { socks: 2 },
      contact: { firstName: 'Test', lastName: 'Guest', email: 'test@example.invalid', phone: 'synthetic' },
    }),
    writeBuyFlowRecovery: value => events.push(['retry-recovery', value]),
    clearPaymentRecovery: id => { events.push(['clear-payment', id]); return true; },
    clearBuyFlowRecovery: () => events.push(['clear-basket']),
    setPaymentRecoveryOutcome: (id, result) => events.push(['outcome', id, result]),
    setPaymentFailure: value => { state.paymentFailure = value; events.push(['failure', value]); },
    setPaymentStatusChecking: value => events.push(['checking', value]),
    setPaymentApprovedForSync: value => events.push(['approved', value]),
    setDraft: value => events.push(['draft', value]),
    setQuote: value => events.push(['quote', value]),
    setSubmitError: value => events.push(['submit-error', value]),
    clearPaymentSyncState: () => events.push(['clear-sync']),
    setStep: value => events.push(['step', value]),
    onBack: () => events.push(['back']),
    lookupBooking: async identifier => { events.push(['lookup', identifier]); return lookup(); },
    resolvePaidDraftBooking: async (...args) => events.push(['resolve-paid', ...args]),
  };
  const handlers = load([
    'getDraftPaymentAttemptId', 'clearConfirmedFailedPayment',
    'retryFailedPayment', 'restartFailedPayment', 'checkPaymentStatus',
  ], state);
  return { ...handlers, state, events };
}

test('payment snapshots retain quantities, add-ons and contact without payment secrets', () => {
  const previous = {
    quantity: 3,
    addonQty: { socks: 2, water_bottle: 1 },
    contact: { firstName: 'Test', lastName: 'Guest', email: 'test@example.invalid', phone: 'synthetic' },
    alreadyHasApprovedSocks: true,
    alreadyHasWaterBottle: false,
    skyriderConsentConfirmed: true,
    paymentOptionsHadValues: true,
    jwt: 'must-not-copy',
    giftCardNumber: 'must-not-copy',
    redirectResult: 'must-not-copy',
  };
  let saved;
  const handlers = load(['getDraftAmountOwing', 'writeDraftRecovery'], {
    readBuyFlowRecovery: () => previous,
    writeBuyFlowRecovery: value => { saved = value; },
  });
  handlers.writeDraftRecovery('PAYMENT', draft, { key: 'E60', productId: 'entry', startTime: '10:00', type: 'entry' }, '10:00', 3, false);
  assert.equal(saved.quantity, 3);
  assert.deepEqual(saved.addonQty, previous.addonQty);
  assert.deepEqual(saved.contact, previous.contact);
  assert.equal(saved.skyriderConsentConfirmed, true);
  assert.equal(saved.alreadyHasApprovedSocks, true);
  assert.equal(saved.alreadyHasWaterBottle, false);
  assert.equal(saved.paymentOptionsHadValues, true);
  assert.equal(saved.draftUniqueId, 'booking-original');
  assert.equal(saved.draftState.paymentApproved, false);
  assert.doesNotMatch(JSON.stringify(saved), /must-not-copy|redirectResult|giftCardNumber|jwt/);
});

test('another method after confirmed failure restores CONTACT without creating a draft or clearing the basket', () => {
  const harness = recoveryHarness({ failure: 'failed' });
  harness.retryFailedPayment();
  const savedBeforeClearing = harness.events[0];
  assert.equal(savedBeforeClearing[0], 'retry-recovery');
  assert.equal(savedBeforeClearing[1].currentFlowStep, 'CONTACT');
  assert.equal(savedBeforeClearing[1].draftState, null);
  assert.equal(savedBeforeClearing[1].draftUniqueId, null);
  assert.equal(savedBeforeClearing[1].bookingReference, null);
  assert.equal(savedBeforeClearing[1].quantity, 2);
  assert.equal(savedBeforeClearing[1].contact.email, 'test@example.invalid');
  assert.equal(savedBeforeClearing[1].addonQty.socks, 2);
  assert.deepEqual(harness.events.slice(1), [
    ['clear-payment', 'attempt-original'], ['draft', null], ['quote', null],
    ['submit-error', null], ['clear-sync'], ['step', 'CONTACT'],
  ]);
});

test('explicit start-over only clears the confirmed failed attempt and basket', () => {
  const harness = recoveryHarness({ failure: 'failed' });
  harness.restartFailedPayment();
  assert.deepEqual(harness.events, [['clear-payment', 'attempt-original'], ['clear-basket'], ['back']]);
});

test('unknown, upgraded or mismatched attempts cannot become a new purchase', () => {
  const unknown = recoveryHarness();
  unknown.retryFailedPayment();
  unknown.restartFailedPayment();
  assert.deepEqual(unknown.events, []);

  for (const record of [
    { attemptId: 'attempt-original', outcome: 'approved' },
    { attemptId: 'another-attempt', outcome: 'failed' },
  ]) {
    const harness = recoveryHarness({ failure: 'failed' });
    harness.state.readPaymentRecovery = () => record;
    harness.retryFailedPayment();
    assert.deepEqual(harness.events, [['failure', 'unknown']]);
  }
});

test('an unpaid status check only looks up the original booking and leaves it unresolved', async () => {
  const harness = recoveryHarness();
  await harness.checkPaymentStatus();
  assert.deepEqual(harness.events, [['checking', true], ['lookup', 'booking-original'], ['checking', false]]);
  assert.equal(harness.state.paymentFailure, 'unknown');
});

test('authoritative paid lookup reuses the same result for the existing approved confirmation', async () => {
  const booking = { id: 'reference-original', rollerUniqueId: 'booking-original', paid: true };
  const harness = recoveryHarness({ lookup: async () => booking });
  await harness.checkPaymentStatus();
  assert.deepEqual(harness.events, [
    ['checking', true], ['lookup', 'booking-original'], ['outcome', 'attempt-original', 'approved'],
    ['failure', null], ['approved', true], ['step', 'APPROVED'],
    ['resolve-paid', undefined, true, booking], ['checking', false],
  ]);
});

test('a paid response for another booking cannot approve the current purchase', async () => {
  const harness = recoveryHarness({ lookup: async () => ({
    id: 'other-reference', rollerUniqueId: 'other-booking', paid: true,
  }) });
  await harness.checkPaymentStatus();
  assert.deepEqual(harness.events, [['checking', true], ['lookup', 'booking-original'], ['checking', false]]);
  assert.equal(harness.state.paymentFailure, 'unknown');
});

test('network failure does not clear recovery or offer another payment', async () => {
  const harness = recoveryHarness({ lookup: async () => { throw new Error('offline'); } });
  await harness.checkPaymentStatus();
  assert.deepEqual(harness.events, [['checking', true], ['lookup', 'booking-original'], ['checking', false]]);
  assert.equal(harness.state.paymentFailure, 'unknown');
});

test('repeated clicks coalesce and an unmounted or replaced attempt ignores a late lookup', async () => {
  let finish;
  const harness = recoveryHarness({ lookup: () => new Promise(resolve => { finish = resolve; }) });
  const first = harness.checkPaymentStatus();
  await harness.checkPaymentStatus();
  harness.state.activePaymentAttemptRef.current = null;
  finish({ paid: true });
  await first;
  assert.deepEqual(harness.events, [['checking', true], ['lookup', 'booking-original'], ['checking', false]]);
});

test('a provider approval racing a manual lookup is not prepared a second time', async () => {
  let finish;
  const harness = recoveryHarness({ lookup: () => new Promise(resolve => { finish = resolve; }) });
  const check = harness.checkPaymentStatus();
  harness.state.paymentResolutionStartedRef.current = true;
  finish({ paid: true });
  await check;
  assert.deepEqual(harness.events, [['checking', true], ['lookup', 'booking-original'], ['checking', false]]);
});
