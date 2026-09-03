import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function declaration(name) {
  let result;
  function visit(node) {
    const effectMarker = name === 'initialRecoveryGate' ? 'setRecoveryGateReady(true)'
      : name === 'initialLinkResolution' ? 'resolveCheckInSessionLink(linkToken)' : null;
    if (effectMarker && ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'useEffect'
      && node.arguments[0]?.getText(sourceFile).includes(effectMarker)) {
      result = `const ${name} = ${node.arguments[0].getText(sourceFile)};`;
    }
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(sourceFile) === name) {
      result = ts.isFunctionDeclaration(node) ? node.getText(sourceFile)
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
  vm.runInContext(ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.handlers;
}

function seedSnapshot() {
  return {
    currentFlowStep: 'PAYMENT', bookingReference: 'reference-original', draftUniqueId: 'booking-original',
    draftState: { prepaymentDraftId: 'attempt-original', uniqueId: 'booking-original', paymentApproved: false, amountOwing: 200 },
    selectedStartTime: '10:00', quantity: 2, addonQty: { socks: 2 },
    contact: { firstName: 'Test', email: 'test@example.invalid' },
  };
}

function harness({ outcome = 'unknown', kind = 'new_booking', lookup = async () => ({ paid: false }), recordMissing = false } = {}) {
  let record = recordMissing ? null : { attemptId: 'attempt-original', bookingIdentifier: 'booking-original', kind, outcome, createdAt: 1 };
  let saved = seedSnapshot();
  const events = [];
  const state = {
    recoveryReturnRecord: record,
    buyRecoverySnapshot: saved,
    buyRecoveryStatus: 'payment-unknown',
    state: 'KIOSK_CHOICE', linkToken: null, recoveryGateReady: false,
    recoveryRunRef: { current: 0 }, recoveryCheckingRef: { current: false },
    recoveryPreparingRef: { current: false }, recoveryContinuationRef: { current: null },
    recoveryContinueRequestedRef: { current: false }, paidConfirmationRunRef: { current: 0 },
    pendingSafetyAttestedAtRef: { current: null }, addonsAvailabilityPrefetchRef: { current: null },
    guestResumeStepWriteRef: { current: null },
    readPaymentRecovery: () => record,
    readBuyFlowRecovery: () => saved,
    clearPaymentRecovery: id => { events.push(['clear-payment', id]); record = null; return true; },
    clearBuyFlowRecovery: () => { events.push(['clear-basket']); saved = null; },
    writeBuyFlowRecovery: value => { saved = JSON.parse(JSON.stringify(value)); events.push(['write-basket', saved]); },
    setPaymentRecoveryOutcome: (id, next) => { events.push(['outcome', id, next]); record = { ...record, outcome: next }; return true; },
    getBuyFlowRecoveryIdentifier: value => value?.bookingReference ?? value?.draftUniqueId ?? value?.draftState?.uniqueId ?? null,
    getBuyFlowRecoveryTargetState: () => 'APP_SAFETY_VIDEO',
    isPrePaymentBuyFlowRecovery: value => value?.currentFlowStep === 'CONTACT' && !value.draftState && !value.draftUniqueId && !value.bookingReference,
    hasPaymentRedirect: () => false,
    consumePaymentRedirect: () => events.push(['consume-url']),
    lookupBooking: async id => { events.push(['lookup', id]); return lookup(); },
    showApprovedRecovery: (...args) => events.push(['show-approved', ...args]),
    preparePaidNewBooking: async (...args) => { events.push(['prepare-paid', ...args]); return () => events.push(['continue']); },
    resolvePaidConfirmation: async () => ({ status: 'unavailable' }),
    resolveCheckInSessionLink: async () => { events.push(['resolve-link']); return {}; },
    revealRecoveredPurchase: (...args) => events.push(['reveal', ...args]),
    initialContext: () => ({}), effectiveChannel: 'park-qr',
    scrollToTop: () => events.push(['scroll']),
  };
  for (const name of [
    'setActiveReturnAttempt', 'setRecoveryGateReady', 'setRecoveryReturnRecord', 'setBuyRecoveryStatus', 'setState', 'setExitDialogOpen',
    'setRecoveryContinuePending', 'setRecoverySyncFailed', 'setBuyRecoverySnapshot',
    'setAlreadyCheckedIn', 'setSessionStartError', 'setReadyForStaffError', 'setIsStartingSession',
    'setIsMarkingReadyForStaff', 'setPaidConfirmationState', 'setAddonsStep', 'setAddonsBackRequest',
    'setBuyStep', 'setSafetyExitLocked', 'setAddonsAvailabilityPrefetch', 'setCtx',
  ]) state[name] = value => {
    events.push([name, value]);
    if (name === 'setBuyRecoveryStatus') state.buyRecoveryStatus = value;
  };
  const handlers = load([
    'recoveryMatchesBooking', 'recoveryMatchesDraft', 'recoveryStillCurrent',
    'resetToStart', 'retryFailedPayment', 'checkRecoveryPayment', 'prepareRecoveredPurchase', 'resumeBuyFlowRecovery',
    'isBuyEntryRecoveryState', 'initialRecoveryGate', 'initialLinkResolution',
  ], state);
  return { ...handlers, state, events, readSaved: () => saved, readRecord: () => record };
}

test('pending, unknown and unresolved URL recovery cannot clear the purchase or expose a new checkout', () => {
  for (const outcome of ['pending', 'unknown']) {
    const host = harness({ outcome });
    host.resetToStart();
    assert.equal(host.readRecord().outcome, outcome);
    assert.ok(host.readSaved());
    assert.ok(host.events.some(event => event[0] === 'setBuyRecoveryStatus' && event[1] === 'payment-unknown'));
    assert.ok(!host.events.some(event => event[0].startsWith('clear-')));
  }
  const missing = harness({ recordMissing: true });
  missing.state.buyRecoveryStatus = 'failed';
  missing.state.hasPaymentRedirect = () => true;
  missing.resetToStart();
  assert.ok(missing.readSaved());
  assert.ok(!missing.events.some(event => event[0].startsWith('clear-')));
});

test('approved payment markers cannot be discarded by Start over', () => {
  const host = harness({ outcome: 'approved' });
  host.state.buyRecoveryStatus = 'payment-approved';
  host.resetToStart();
  assert.equal(host.readRecord().outcome, 'approved');
  assert.ok(host.readSaved());
  assert.deepEqual(host.events, []);
});

test('failed return retry durably restores CONTACT before releasing the failed attempt', () => {
  const host = harness({ outcome: 'failed' });
  host.retryFailedPayment();
  const saved = host.readSaved();
  assert.equal(saved.currentFlowStep, 'CONTACT');
  assert.equal(saved.draftState, null);
  assert.equal(saved.draftUniqueId, null);
  assert.equal(saved.bookingReference, null);
  assert.equal(saved.selectedStartTime, '10:00');
  assert.equal(saved.quantity, 2);
  assert.equal(saved.addonQty.socks, 2);
  assert.equal(saved.contact.email, 'test@example.invalid');
  assert.equal(host.events[0][0], 'write-basket');
  assert.equal(host.events[1][0], 'clear-payment');
  assert.ok(!host.events.some(event => event[0] === 'lookup' || event[0] === 'prepare-paid'));
});

test('an unpaid recheck stays unknown and does not start a new purchase or claim success', async () => {
  const host = harness();
  await host.checkRecoveryPayment();
  assert.deepEqual(host.events.filter(event => event[0] === 'lookup'), [['lookup', 'booking-original']]);
  assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
  assert.ok(!host.events.some(event => ['outcome', 'show-approved', 'prepare-paid', 'clear-payment', 'clear-basket'].includes(event[0])));
});

test('only a paid result matching the original booking can enter approved recovery', async () => {
  const booking = { id: 'reference-original', rollerUniqueId: 'booking-original', paid: true };
  const host = harness({ lookup: async () => booking });
  await host.checkRecoveryPayment();
  assert.equal(host.events.filter(event => event[0] === 'lookup').length, 1);
  assert.equal(host.readRecord().outcome, 'approved');
  const shown = host.events.find(event => event[0] === 'show-approved');
  assert.equal(shown[3], booking);

  const mismatch = harness({ lookup: async () => ({ ...booking, id: 'other-reference', rollerUniqueId: 'other-booking' }) });
  await mismatch.checkRecoveryPayment();
  assert.equal(mismatch.state.buyRecoveryStatus, 'payment-unknown');
  assert.ok(!mismatch.events.some(event => event[0] === 'show-approved'));
});

test('an add-on payment cannot be recovered as a new-entry booking or new-entry retry', async () => {
  const host = harness({ outcome: 'failed', kind: 'add_product', lookup: async () => ({ paid: true }) });
  await host.checkRecoveryPayment();
  host.retryFailedPayment();
  assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
  assert.equal(host.readRecord().kind, 'add_product');
  assert.ok(!host.events.some(event => ['lookup', 'show-approved', 'clear-payment', 'clear-basket'].includes(event[0])));
});

test('approved-payment lookup failure retains approved recovery and has no restart side effect', async () => {
  const host = harness({ outcome: 'approved' });
  host.state.buyRecoveryStatus = 'payment-approved';
  host.readSaved().draftState.paymentApproved = true;
  await host.prepareRecoveredPurchase(host.readRecord(), host.readSaved());
  assert.equal(host.state.buyRecoveryStatus, 'payment-approved');
  assert.equal(host.readRecord().outcome, 'approved');
  assert.equal(host.readSaved().draftState.paymentApproved, true);
  assert.ok(host.events.some(event => event[0] === 'setRecoverySyncFailed' && event[1] === true));
  assert.ok(!host.events.some(event => ['clear-payment', 'clear-basket', 'prepare-paid', 'reveal'].includes(event[0])));
});

test('repeated unknown-status clicks coalesce and a replaced attempt ignores a late paid lookup', async () => {
  let complete;
  const host = harness({ lookup: () => new Promise(resolve => { complete = resolve; }) });
  const first = host.checkRecoveryPayment();
  await host.checkRecoveryPayment();
  host.state.readPaymentRecovery = () => ({ ...host.readRecord(), attemptId: 'newer-attempt' });
  complete({ id: 'reference-original', rollerUniqueId: 'booking-original', paid: true });
  await first;
  assert.equal(host.events.filter(event => event[0] === 'lookup').length, 1);
  assert.ok(!host.events.some(event => event[0] === 'show-approved'));
});

test('a saved approved safety purchase remains protected when its reload lookup is unavailable', async () => {
  const host = harness({ recordMissing: true, lookup: async () => { throw new Error('offline'); } });
  host.readSaved().currentFlowStep = 'APP_SAFETY_VIDEO';
  host.readSaved().draftState.paymentApproved = true;
  host.state.buyRecoveryStatus = null;
  await host.resumeBuyFlowRecovery(host.readSaved());
  host.resetToStart();
  assert.ok(host.readSaved(), 'The approved purchase must survive a failed reload lookup and attempted restart');
  assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
});

test('initial recovery routes valid unconsumed returns to their original attempt before opening checkout', () => {
  const host = harness({ outcome: 'pending' });
  host.state.buyRecoveryStatus = null;
  host.state.hasPaymentRedirect = () => true;
  host.initialRecoveryGate();
  assert.ok(host.events.some(event => event[0] === 'setBuyRecoveryStatus' && event[1] === 'payment-return'));
  assert.ok(!host.events.some(event => ['lookup', 'show-approved', 'consume-url', 'clear-payment'].includes(event[0])));
});

test('missing or add-on return context fails closed before normal or linked check-in', () => {
  for (const options of [{ recordMissing: true }, { kind: 'add_product' }]) {
    const host = harness(options);
    host.state.buyRecoveryStatus = null;
    host.state.state = 'APP_MOBILE';
    host.state.linkToken = 'synthetic-link';
    host.state.hasPaymentRedirect = () => true;
    host.initialRecoveryGate();
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
    assert.ok(host.events.some(event => event[0] === 'setState' && event[1] === 'KIOSK_CHOICE'));
    assert.ok(!host.events.some(event => ['lookup', 'show-approved', 'resolve-link', 'clear-payment'].includes(event[0])));
  }
  const notInspected = harness();
  notInspected.state.state = 'APP_MOBILE';
  notInspected.state.linkToken = 'synthetic-link';
  notInspected.initialLinkResolution();
  assert.deepEqual(notInspected.events, []);
});

test('a legacy unapproved PAYMENT snapshot offers only original-status recovery', () => {
  const host = harness({ recordMissing: true });
  host.state.buyRecoveryStatus = null;
  host.initialRecoveryGate();
  assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
  assert.ok(!host.events.some(event => ['lookup', 'show-approved', 'clear-basket'].includes(event[0])));
});

test('finishing one purchase cannot erase another saved approved purchase', () => {
  const host = harness({ recordMissing: true });
  host.readSaved().draftState.paymentApproved = true;
  host.readSaved().currentFlowStep = 'APP_SAFETY_VIDEO';
  host.state.state = 'APP_PRESENT';
  host.state.buyRecoveryStatus = null;
  host.state.ctx = { booking: { id: 'another-reference', rollerUniqueId: 'another-booking' }, paymentCompleted: true };
  host.resetToStart();
  assert.ok(host.readSaved());
  assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
});

test('explicit completion can reset its own finished purchase', () => {
  const host = harness({ recordMissing: true });
  host.readSaved().draftState.paymentApproved = true;
  host.readSaved().currentFlowStep = 'APP_PRESENT';
  host.state.state = 'APP_PRESENT';
  host.state.buyRecoveryStatus = null;
  host.state.ctx = { booking: { id: 'reference-original', rollerUniqueId: 'booking-original' }, paymentCompleted: true };
  host.resetToStart();
  assert.equal(host.readSaved(), null);
  assert.ok(host.events.some(event => event[0] === 'clear-basket'));
});

test('saved safety recovery refuses a paid lookup for another booking', async () => {
  const host = harness({ recordMissing: true, lookup: async () => ({
    paid: true, id: 'other-reference', rollerUniqueId: 'other-booking',
  }) });
  host.readSaved().draftState.paymentApproved = true;
  host.readSaved().currentFlowStep = 'APP_SAFETY_VIDEO';
  await host.resumeBuyFlowRecovery(host.readSaved());
  assert.ok(!host.events.some(event => event[0] === 'prepare-paid'));
  assert.ok(host.readSaved());
});
