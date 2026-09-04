import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const source = Object.fromEntries([
  ['buy', '../components/BuyTickets.tsx'], ['page', '../app/page.tsx'], ['recovery', './buyFlowRecovery.ts'],
].map(([key, file]) => [key, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)]));

function find(file, predicate) {
  let result;
  function visit(node) {
    if (!result && predicate(node)) result = node;
    ts.forEachChild(node, visit);
  }
  visit(source[file]);
  assert.ok(result, `Missing production node in ${file}`);
  return result;
}

function declaration(file, name) {
  const node = find(file, node => (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
    && node.name?.getText(source[file]) === name);
  return ts.isFunctionDeclaration(node) ? node.getText(source[file]).replace(/^export\s+/, '')
    : `const ${name} = ${node.initializer.getText(source[file])};`;
}

function prop(file, tag, name) {
  const element = find(file, node => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
    && node.tagName.getText(source[file]) === tag
    && node.attributes.properties.some(attribute => attribute.name?.getText(source[file]) === name));
  const attribute = element.attributes.properties.find(attribute => attribute.name?.getText(source[file]) === name);
  assert.ok(attribute.initializer && ts.isJsxExpression(attribute.initializer));
  return attribute.initializer.expression.getText(source[file]);
}

function lifetime(file, marker) {
  const effect = find(file, node => ts.isCallExpression(node) && node.expression.getText(source[file]) === 'useEffect'
    && node.arguments[0]?.getText(source[file]).includes(marker));
  return effect.arguments[0].getText(source[file]);
}

function compile(input, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context;
}

const preparation = compile(read('./purchasePreparation.ts'), { exports: {}, AbortController, setTimeout, clearTimeout }).exports;
const paidConfirmation = compile(read('./paidBookingConfirmation.ts'), { exports: {}, setTimeout }).exports;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function settleUntil(predicate, message = 'The expected async state was not reached') {
  for (let i = 0; i < 100 && !predicate(); i += 1) await Promise.resolve();
  assert.ok(predicate(), message);
}
async function flush() { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }

const draft = {
  draft: { uniqueId: 'booking-original', bookingReference: 'reference-original', costs: { amountOwing: 200 } },
  prepayment: { prepaymentDraftId: 'attempt-original', amountOwing: 200, status: 'payment_pending' },
};
const booking = { id: 'reference-original', rollerUniqueId: 'booking-original', paid: true, jumpers: 2, existingAddons: [] };
const session = { checkinSessionId: 'session-original', status: 'active', guestResumeStep: 'safety', handoffStatus: 'pending' };
const snapshot = {
  currentFlowStep: 'PAYMENT', bookingReference: 'reference-original', draftUniqueId: 'booking-original',
  draftState: { prepaymentDraftId: 'attempt-original', uniqueId: 'booking-original', paymentApproved: true, amountOwing: 200 },
  quantity: 2, selectedStartTime: '10:00',
};
const payment = { attemptId: 'attempt-original', bookingIdentifier: 'booking-original', kind: 'new_booking', outcome: 'approved', createdAt: 1 };

// Execute production handlers and JSX callback expressions together, including
// BuyTickets -> page preparation. Only network, storage and React state setters
// are hosted here; the actual bounded lookup helper runs with injected no-wait
// retry delays. A synthetic draft API is added only for the zero-payment test;
// approved purchase recovery never receives a new-payment or new-draft API.
function harness({ recovery = false, zeroPurchase = false, lookup = async () => booking, startSession = async () => session, clearPayment } = {}) {
  const events = [];
  let saved = structuredClone(snapshot);
  let record = zeroPurchase ? null : { ...payment };
  const state = {
    AbortController, Error,
    draft: zeroPurchase ? null : draft,
    selectedProduct: { productId: 'entry-original', type: 'entry', startTime: '10:00' }, selectedTime: '10:00', jumperCount: 2,
    step: 'PAYMENT', paymentReadyForSafety: false, paymentSyncError: null, paymentContinuePending: false,
    paymentResolutionStartedRef: { current: false }, paymentContinuationRef: { current: null },
    paymentContinueRequestedRef: { current: false }, paymentPreparationAbortRef: { current: null },
    activePaymentAttemptRef: { current: 'attempt-original' },
    ctx: { channel: 'park-qr' }, state: recovery ? 'KIOSK_CHOICE' : 'KIOSK_BUY',
    recoveryRunRef: { current: 0 }, recoveryPreparingRef: { current: false }, recoveryContinuationRef: { current: null },
    recoveryApprovalRef: { current: null },
    recoveryContinueRequestedRef: { current: false }, recoveryPreparationAbortRef: { current: null },
    recoveryReadyForSafety: false, recoverySyncFailed: false, recoveryContinuePending: false,
    buyRecoverySnapshot: saved, recoveryReturnRecord: record,
    t: { buy: { paymentSyncFailed: 'synthetic-delayed' } },
    readBuyFlowRecovery: () => saved,
    readPaymentRecovery: () => record,
    writeBuyFlowRecovery: value => { saved = value; events.push(['save', value.draftUniqueId]); },
    clearPaymentRecoveryAfterCompletion: async id => {
      events.push(['retire', id]);
      if (clearPayment) await clearPayment();
      if (record?.attemptId === id) record = null;
      return true;
    },
    lookupBooking: async (id, options) => { events.push(['lookup', id, options?.signal]); return lookup(id, options); },
    startCheckInSession: async (value, step, options) => {
      events.push(['session', value.rollerUniqueId, step, options?.signal]);
      return startSession(value, step, options);
    },
    resolvePurchasePreparation: (request, id, options) => preparation.resolvePurchasePreparation(request, id, {
      ...options, wait: async delay => { events.push(['backoff', delay]); },
    }),
    runPurchasePreparationRequest: preparation.runPurchasePreparationRequest,
    resolvePaidConfirmation: zeroPurchase ? paidConfirmation.resolvePaidConfirmation
      : () => assert.fail('Approved preparation must not enter the old payment confirmation wait'),
    wait: async () => undefined,
    scrollToTop: () => events.push(['scroll']),
    CloudSessionError: class CloudSessionError extends Error {},
  };
  for (const name of [
    'setStep', 'setPaymentFailure', 'setPaymentApprovedForSync', 'setPaymentSyncing', 'setPaymentReadyForSafety',
    'setPaymentSyncError', 'setPaymentContinuePending', 'setCtx', 'setState', 'setAlreadyCheckedIn', 'setSessionStartError',
    'setBuyRecoveryStatus', 'setRecoveryContinuePending', 'setRecoverySyncFailed', 'setRecoveryReadyForSafety',
    'setRecoveryReturnRecord', 'setBuyRecoverySnapshot', 'setDraft', 'setQuote', 'setSubmitting',
    'setSubmitError', 'setGiftCardInputDirty', 'setClipCardInputDirty', 'setPaymentNavigationLocked',
  ]) state[name] = value => {
    const key = name.charAt(3).toLowerCase() + name.slice(4);
    state[key] = typeof value === 'function' ? value(state[key]) : value;
    events.push([key, state[key]]);
  };
  if (zeroPurchase) Object.assign(state, {
    customerValid: true, submitting: false, paymentInputsBlockingErrors: false,
    needsSkyRiderConsent: () => false, shouldPrecheckBasketAvailability: false, giftCardInputs: [], discountCodeInputs: [],
    buildCustomer: () => ({ email: 'synthetic@example.invalid' }), buildItems: () => [], basketLines: [],
    hasPaymentOptionQuoteErrors: () => false,
    quoteNewBooking: async () => ({ costs: { amountOwing: 0 } }),
    createDraftBooking: async () => {
      events.push(['create-zero-draft']);
      return { ...draft, draft: { ...draft.draft, costs: { amountOwing: 0 } }, prepayment: { ...draft.prepayment, amountOwing: 0 } };
    },
    formatBuyFlowError: error => { throw error; }, productLabels: {},
  });
  const shared = [
    ...['getBuyFlowRecoveryIdentifier', 'getBuyFlowRecoveryTargetState'].map(name => declaration('recovery', name)),
    ...['preparePaidNewBooking', 'getResumeState', 'isCompletedSession', 'isReadyForStaffSession'].map(name => declaration('page', name)),
  ];
  const specific = recovery ? [
    ...['recoveryMatchesBooking', 'recoveryMatchesDraft', 'recoveryStillCurrent', 'prepareRecoveredPurchase', 'showApprovedRecovery',
      'handlePaymentReturnResult', 'revealRecoveredPurchase', 'continueRecoveredPurchase'].map(name => declaration('page', name)),
    `const preparationState = () => (${prop('page', 'PhonePaymentConfirmation', 'preparationState')});`,
    `const retry = ${prop('page', 'PhonePaymentConfirmation', 'onRetryPreparation')};`,
    `const setupLifetime = ${lifetime('page', 'recoveryPreparationAbortRef.current?.abort()')};`,
    'globalThis.handlers = { prepareRecoveredPurchase, showApprovedRecovery, handlePaymentReturnResult, continueRecoveredPurchase, preparationState, retry, setupLifetime };',
  ] : [
    ...['getDraftAmountOwing', 'getDraftPaymentAttemptId', 'writeDraftRecovery',
      'resolvePaidDraftBooking', 'continueAfterApprovedPayment'].map(name => declaration('buy', name)),
    ...(zeroPurchase ? ['createDraft', 'clearPaymentSyncState'].map(name => declaration('buy', name)) : []),
    `const onBookingReady = ${prop('page', 'BuyTickets', 'onBookingReady')};`,
    `const approve = ${prop('buy', 'RollerPaymentDropIn', 'onApproved')};`,
    `const retry = ${prop('buy', 'PhonePaymentConfirmation', 'onRetryPreparation')};`,
    `const preparationState = () => (${prop('buy', 'PhonePaymentConfirmation', 'preparationState')});`,
    `const setupDraftTracking = ${lifetime('buy', 'activePaymentAttemptRef.current = getDraftPaymentAttemptId(draft)')};`,
    `const setupLifetime = ${lifetime('buy', 'paymentPreparationAbortRef.current?.abort()')};`,
    `globalThis.handlers = { resolvePaidDraftBooking, continueAfterApprovedPayment, approve, retry, preparationState, setupDraftTracking, setupLifetime${zeroPurchase ? ', createDraft' : ''} };`,
  ];
  compile([...shared, ...specific].join('\n'), state);
  const cleanup = state.handlers.setupLifetime();
  let cleanupDraft = state.handlers.setupDraftTracking?.();
  return {
    ...state.handlers, state, events,
    cleanup: () => { cleanupDraft?.(); cleanup(); },
    flushDraftEffect: () => { cleanupDraft?.(); cleanupDraft = state.handlers.setupDraftTracking(); },
    replace: () => {
      record = { ...payment, attemptId: 'attempt-replacement', bookingIdentifier: 'booking-replacement', createdAt: 2 };
      saved = { ...snapshot, draftUniqueId: 'booking-replacement', bookingReference: 'reference-replacement',
        draftState: { ...snapshot.draftState, prepaymentDraftId: 'attempt-replacement', uniqueId: 'booking-replacement' } };
      state.activePaymentAttemptRef.current = record.attemptId;
      return { record, snapshot: saved };
    },
    readPayment: () => record, readSnapshot: () => saved,
    navigation: () => events.filter(event => event[0] === 'state'),
    lookups: () => events.filter(event => event[0] === 'lookup'),
  };
}

test('new purchase stays preparing through deferred lookup and session, then continues explicitly once', async () => {
  const lookup = deferred();
  const startSession = deferred();
  const retirement = deferred();
  const host = harness({ lookup: () => lookup.promise, startSession: () => startSession.promise, clearPayment: () => retirement.promise });
  host.approve();
  assert.equal(host.state.step, 'APPROVED');
  assert.equal(host.preparationState(), 'preparing');
  assert.equal(host.readSnapshot().currentFlowStep, 'PAYMENT');
  await settleUntil(() => host.lookups().length === 1);
  host.approve();
  host.retry();
  await host.continueAfterApprovedPayment();
  assert.equal(host.lookups().length, 1);
  assert.deepEqual(host.navigation(), []);
  lookup.resolve(booking);
  await settleUntil(() => host.events.some(event => event[0] === 'session'));
  assert.equal(host.preparationState(), 'preparing');
  assert.equal(host.readSnapshot().currentFlowStep, 'PAYMENT', 'Reload must return to preparation while its session is pending');
  await host.continueAfterApprovedPayment();
  assert.deepEqual(host.navigation(), []);
  startSession.resolve(session);
  await settleUntil(() => host.preparationState() === 'ready');
  assert.deepEqual(host.navigation(), []);
  assert.equal(host.readSnapshot().currentFlowStep, 'PAYMENT', 'A ready receipt still awaits the guest’s Continue action');
  const first = host.continueAfterApprovedPayment();
  await host.continueAfterApprovedPayment();
  assert.equal(host.events.filter(event => event[0] === 'retire').length, 1);
  retirement.resolve();
  await first;
  await host.continueAfterApprovedPayment();
  assert.deepEqual(host.navigation(), [['state', 'APP_SAFETY_VIDEO']]);
  assert.equal(host.readSnapshot().currentFlowStep, 'APP_SAFETY_VIDEO');
  assert.equal(host.readPayment(), null);
  host.cleanup();
});

test('approved but unpaid booking becomes ready for safety without returning to payment-required summary', async () => {
  const host = harness({ lookup: async () => ({ ...booking, paid: false }) });
  host.approve();
  await settleUntil(() => host.preparationState() === 'ready');
  assert.equal(host.events.filter(event => event[0] === 'session').length, 0);
  assert.equal(host.state.ctx.paymentCompleted, true);
  assert.equal(host.state.ctx.booking.paid, false);
  assert.equal(host.state.ctx.checkinSession, null);
  assert.deepEqual(host.navigation(), []);
  await host.continueAfterApprovedPayment();
  assert.deepEqual(host.navigation(), [['state', 'APP_SAFETY_VIDEO']]);
  host.cleanup();
});

test('temporary session failure preserves the approved safety path instead of requesting another payment', async () => {
  const host = harness({ startSession: async () => { throw new Error('temporary session error'); } });
  host.approve();
  await settleUntil(() => host.preparationState() === 'ready');
  await host.continueAfterApprovedPayment();
  assert.equal(host.state.ctx.checkinSession, null);
  assert.deepEqual(host.navigation(), [['state', 'APP_SAFETY_VIDEO']]);
  host.cleanup();
});

test('exhausted lookup becomes delayed and a single retry prepares the same purchase without another draft or charge', async () => {
  let available = false;
  const retryLookup = deferred();
  const host = harness({ lookup: async () => {
    if (!available) throw new Error('booking not found');
    return retryLookup.promise;
  } });
  host.approve();
  await settleUntil(() => host.preparationState() === 'delayed');
  assert.equal(host.lookups().length, 3);
  assert.equal(host.readPayment().attemptId, 'attempt-original');
  assert.equal(host.readSnapshot().draftUniqueId, 'booking-original');
  await host.continueAfterApprovedPayment();
  assert.deepEqual(host.navigation(), []);
  available = true;
  host.retry();
  host.retry();
  assert.equal(host.preparationState(), 'preparing');
  await settleUntil(() => host.lookups().length === 4);
  retryLookup.resolve(booking);
  await settleUntil(() => host.preparationState() === 'ready');
  assert.deepEqual(host.lookups().map(event => event[1]), Array(4).fill('booking-original'));
  assert.deepEqual(host.navigation(), []);
  host.cleanup();
});

for (const pending of ['lookup', 'session']) {
  test(`unmount aborts an unfinished ${pending} and never exposes late readiness or navigation`, async () => {
    const work = deferred();
    const host = harness(pending === 'lookup' ? { lookup: () => work.promise } : { startSession: () => work.promise });
    host.approve();
    await settleUntil(() => host.events.some(event => event[0] === pending));
    const event = host.events.find(event => event[0] === pending);
    const signal = event.at(-1);
    host.cleanup();
    assert.equal(signal.aborted, true);
    work.resolve(pending === 'lookup' ? booking : session);
    await flush();
    assert.equal(host.preparationState(), 'preparing');
    assert.deepEqual(host.navigation(), []);
    assert.equal(host.state.ctx.booking, undefined);
  });
}

test('replacing a purchase during session preparation cannot publish the previous purchase readiness', async () => {
  const work = deferred();
  const host = harness({ startSession: () => work.promise });
  host.approve();
  await settleUntil(() => host.events.some(event => event[0] === 'session'));
  host.replace();
  work.resolve(session);
  await flush();
  assert.equal(host.preparationState(), 'preparing');
  assert.equal(host.state.ctx.booking, undefined);
  assert.deepEqual(host.navigation(), []);
  host.cleanup();
});

test('zero-payment draft preparation survives the old draft effect cleanup and opens safety', async () => {
  const work = deferred();
  const host = harness({ zeroPurchase: true, lookup: () => work.promise });
  await host.createDraft();
  assert.equal(host.state.step, 'PENDING');
  assert.equal(host.lookups().length, 1);
  const preparationSignal = host.state.paymentPreparationAbortRef.current.signal;
  // React runs the prior [draft] effect cleanup after the create handler has
  // synchronously started preparation for the newly returned zero-cost draft.
  host.flushDraftEffect();
  assert.equal(preparationSignal.aborted, false);
  work.resolve(booking);
  await settleUntil(() => host.navigation().length === 1 && host.state.paymentSyncing === false);
  assert.deepEqual(host.navigation(), [['state', 'APP_SAFETY_VIDEO']]);
  assert.equal(host.state.paymentSyncing, false);
  assert.equal(host.events.filter(event => event[0] === 'create-zero-draft').length, 1);
  host.cleanup();
});

test('approved return recovery keeps processing until its session is prepared and then needs one explicit continuation', async () => {
  const lookup = deferred();
  const startSession = deferred();
  const host = harness({ recovery: true, lookup: () => lookup.promise, startSession: () => startSession.promise });
  host.showApprovedRecovery(host.readPayment(), host.readSnapshot());
  assert.equal(host.preparationState(), 'preparing');
  await settleUntil(() => host.lookups().length === 1);
  host.retry();
  host.continueRecoveredPurchase();
  assert.equal(host.lookups().length, 1);
  assert.deepEqual(host.navigation(), []);
  lookup.resolve(booking);
  await settleUntil(() => host.events.some(event => event[0] === 'session'));
  assert.equal(host.preparationState(), 'preparing');
  host.continueRecoveredPurchase();
  assert.deepEqual(host.navigation(), []);
  startSession.resolve(session);
  await settleUntil(() => host.preparationState() === 'ready');
  assert.deepEqual(host.navigation(), []);
  host.continueRecoveredPurchase();
  host.continueRecoveredPurchase();
  await settleUntil(() => host.navigation().length === 1);
  host.continueRecoveredPurchase();
  await flush();
  assert.deepEqual(host.navigation(), [['state', 'APP_SAFETY_VIDEO']]);
  assert.equal(host.events.filter(event => event[0] === 'retire').length, 1);
  assert.equal(host.readSnapshot().currentFlowStep, 'APP_SAFETY_VIDEO');
  host.cleanup();
});

test('approved but unpaid recovered purchase retains the same #331 safety path', async () => {
  const host = harness({ recovery: true, lookup: async () => ({ ...booking, paid: false }) });
  host.showApprovedRecovery(host.readPayment(), host.readSnapshot());
  await settleUntil(() => host.preparationState() === 'ready');
  assert.equal(host.events.filter(event => event[0] === 'session').length, 0);
  assert.deepEqual(host.navigation(), []);
  host.continueRecoveredPurchase();
  await settleUntil(() => host.navigation().length === 1);
  assert.deepEqual(host.navigation(), [['state', 'APP_SAFETY_VIDEO']]);
  host.cleanup();
});

test('repeated approved return callbacks reuse preparation and never restart a ready purchase', async t => {
  const work = deferred();
  const host = harness({ recovery: true, lookup: () => work.promise });
  t.after(() => { host.cleanup(); work.resolve(booking); });
  const original = host.readPayment();
  host.handlePaymentReturnResult(original, { status: 'approved' });
  await settleUntil(() => host.lookups().length === 1);
  host.handlePaymentReturnResult(original, { status: 'approved' });
  await flush();
  assert.equal(host.lookups().length, 1, 'The same return callback must share the in-flight preparation');
  work.resolve(booking);
  await settleUntil(() => host.preparationState() === 'ready');
  host.handlePaymentReturnResult(original, { status: 'approved' });
  await flush();
  assert.equal(host.lookups().length, 1, 'A ready continuation must not be rebuilt for the same callback');
  assert.equal(host.preparationState(), 'ready');
  assert.deepEqual(host.navigation(), []);
});

test('a redelivered approved return leaves delayed help in place until the guest explicitly checks again', async () => {
  let available = false;
  const host = harness({ recovery: true, lookup: async () => {
    if (!available) throw new Error('booking not found');
    return booking;
  } });
  const original = host.readPayment();
  host.handlePaymentReturnResult(original, { status: 'approved' });
  await settleUntil(() => host.preparationState() === 'delayed');
  assert.equal(host.lookups().length, 3);
  host.handlePaymentReturnResult(original, { status: 'approved' });
  await flush();
  assert.equal(host.lookups().length, 3, 'Duplicate callback must not reset the bounded request budget');
  assert.equal(host.preparationState(), 'delayed');
  assert.equal(host.readPayment().attemptId, 'attempt-original');
  available = true;
  host.retry();
  await settleUntil(() => host.preparationState() === 'ready');
  assert.deepEqual(host.lookups().map(event => event[1]), Array(4).fill('booking-original'));
  assert.deepEqual(host.navigation(), []);
  host.cleanup();
});

test('a late continuation from the previous recovery cannot clear the replacement’s ready continuation', async () => {
  const retirement = deferred();
  const host = harness({ recovery: true, clearPayment: () => retirement.promise, lookup: async id => (
    id === 'booking-original' ? booking : { ...booking, rollerUniqueId: id, id: 'reference-replacement', paid: false }
  ) });
  host.showApprovedRecovery(host.readPayment(), host.readSnapshot());
  await settleUntil(() => host.preparationState() === 'ready');
  host.continueRecoveredPurchase();
  await settleUntil(() => host.events.some(event => event[0] === 'retire'));
  const next = host.replace();
  host.showApprovedRecovery(next.record, next.snapshot);
  await settleUntil(() => host.preparationState() === 'ready');
  const replacementContinuation = host.state.recoveryContinuationRef.current;
  assert.equal(typeof replacementContinuation, 'function');
  retirement.resolve();
  await flush();
  assert.equal(host.state.recoveryContinuationRef.current, replacementContinuation);
  assert.equal(host.state.recoveryReturnRecord.attemptId, 'attempt-replacement');
  assert.equal(host.readPayment().attemptId, 'attempt-replacement');
  assert.equal(host.preparationState(), 'ready');
  assert.deepEqual(host.navigation(), []);
  host.cleanup();
});

test('a replacement recovery aborts the old request and only the new purchase may become ready', async () => {
  const oldLookup = deferred();
  const nextLookup = deferred();
  const host = harness({ recovery: true, lookup: id => id === 'booking-original' ? oldLookup.promise : nextLookup.promise });
  host.showApprovedRecovery(host.readPayment(), host.readSnapshot());
  await settleUntil(() => host.lookups().length === 1);
  const oldSignal = host.lookups()[0][2];
  const next = host.replace();
  host.showApprovedRecovery(next.record, next.snapshot);
  await settleUntil(() => host.lookups().length === 2);
  assert.equal(oldSignal.aborted, true);
  oldLookup.resolve(booking);
  await flush();
  assert.equal(host.preparationState(), 'preparing');
  assert.equal(host.state.ctx.booking, undefined);
  nextLookup.resolve({ ...booking, id: 'reference-replacement', rollerUniqueId: 'booking-replacement', paid: false });
  await settleUntil(() => host.preparationState() === 'ready');
  assert.equal(host.state.ctx.booking.rollerUniqueId, 'booking-replacement');
  assert.deepEqual(host.navigation(), []);
  host.cleanup();
});

test('recovery unmount cancels session preparation and ignores a late session', async () => {
  const work = deferred();
  const host = harness({ recovery: true, startSession: () => work.promise });
  host.showApprovedRecovery(host.readPayment(), host.readSnapshot());
  await settleUntil(() => host.events.some(event => event[0] === 'session'));
  const signal = host.events.find(event => event[0] === 'session')[3];
  host.cleanup();
  assert.equal(signal.aborted, true);
  work.resolve(session);
  await flush();
  assert.equal(host.preparationState(), 'preparing');
  assert.equal(host.state.ctx.booking, undefined);
  assert.deepEqual(host.navigation(), []);
});
