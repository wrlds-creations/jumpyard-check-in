import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function loadFlowModule(name, globals = {}) {
  const input = fs.readFileSync(new URL(name, import.meta.url), 'utf8');
  const context = vm.createContext({ exports: {}, ...globals });
  vm.runInContext(ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}

const flowMachine = loadFlowModule('./machine.ts');
const recoveryHelpers = loadFlowModule('./buyFlowRecovery.ts');

function declaration(name) {
  let result;
  function visit(node) {
    const effectMarker = name === 'persistSafetyRecovery' ? 'writeSafetyRecovery(state, ctx, alreadyCheckedIn)'
      : name === 'initialRecoveryGate' ? 'setRecoveryGateReady(true)'
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

function harness({ outcome = 'unknown', kind = 'new_booking', lookup = async () => ({ paid: false }), recordMissing = false, renderState = false, actualPreparation = false, globals = {} } = {}) {
  let record = recordMissing ? null : { attemptId: 'attempt-original', bookingIdentifier: 'booking-original', kind, outcome, createdAt: 1 };
  let saved = seedSnapshot();
  const events = [];
  const pendingState = new Map();
  const state = {
    AbortController,
    recoveryPreparationAbortRef: { current: null },
    recoveryApprovalRef: { current: null },
    runPurchasePreparationRequest: (request) => request(new AbortController().signal),
    recoveryReturnRecord: record,
    buyRecoverySnapshot: saved,
    buyRecoveryStatus: 'payment-unknown',
    state: 'KIOSK_CHOICE', linkToken: null, recoveryGateReady: false,
    recoveryRunRef: { current: 0 }, recoveryCheckingRef: { current: false },
    recoveryPreparingRef: { current: false }, recoveryContinuationRef: { current: null },
    recoveryContinueRequestedRef: { current: false }, paidConfirmationRunRef: { current: 0 },
    pendingSafetyAttestedAtRef: { current: null }, addonsAvailabilityPrefetchRef: { current: null },
    guestResumeStepWriteRef: { current: null },
    ctx: flowMachine.initialContext('park-qr'), isMarkingReadyForStaff: false, alreadyCheckedIn: false,
    readPaymentRecovery: () => record,
    readBuyFlowRecovery: () => saved,
    clearPaymentRecoveryAfterCompletion: async (id, beforeClear) => {
      if (beforeClear?.() === false) return false;
      events.push(['clear-payment', id]); record = null; return true;
    },
    clearBuyFlowRecovery: () => { events.push(['clear-basket']); saved = null; },
    withNoActivePaymentRecovery: async action => action() !== false,
    writeBuyFlowRecovery: value => { saved = JSON.parse(JSON.stringify(value)); events.push(['write-basket', saved]); },
    approvePaymentRecovery: async id => { events.push(['outcome', id, 'approved']); record = { ...record, outcome: 'approved' }; return true; },
    getBuyFlowRecoveryIdentifier: recoveryHelpers.getBuyFlowRecoveryIdentifier,
    getBuyFlowRecoveryTargetState: recoveryHelpers.getBuyFlowRecoveryTargetState,
    isPrePaymentBuyFlowRecovery: recoveryHelpers.isPrePaymentBuyFlowRecovery,
    hasCompletedBuyFlowRecovery: recoveryHelpers.hasCompletedBuyFlowRecovery,
    hasPaymentRedirect: () => false,
    consumePaymentRedirect: () => events.push(['consume-url']),
    lookupBooking: async id => { events.push(['lookup', id]); return lookup(); },
    showApprovedRecovery: (...args) => events.push(['show-approved', ...args]),
    preparePaidNewBooking: async (...args) => { events.push(['prepare-paid', ...args]); return () => events.push(['continue']); },
    resolvePaidConfirmation: async () => ({ status: 'unavailable' }),
    resolvePurchasePreparation: async () => ({ status: 'unavailable' }),
    resolveCheckInSessionLink: async () => { events.push(['resolve-link']); return {}; },
    revealRecoveredPurchase: (...args) => events.push(['reveal', ...args]),
    initialContext: flowMachine.initialContext, nextState: flowMachine.nextState, effectiveChannel: 'park-qr',
    scrollToTop: () => events.push(['scroll']),
  };
  for (const name of [
    'setActiveReturnAttempt', 'setRecoveryGateReady', 'setRecoveryReturnRecord', 'setBuyRecoveryStatus', 'setState', 'setExitDialogOpen',
    'setRecoveryContinuePending', 'setRecoverySyncFailed', 'setRecoveryReadyForSafety', 'setBuyRecoverySnapshot',
    'setAlreadyCheckedIn', 'setSessionStartError', 'setReadyForStaffError', 'setIsStartingSession',
    'setIsMarkingReadyForStaff', 'setPaidConfirmationState', 'setAddonsStep', 'setAddonsBackRequest',
    'setBuyStep', 'setSafetyExitLocked', 'setAddonsAvailabilityPrefetch', 'setCtx',
  ]) state[name] = value => {
    events.push([name, value]);
    if (renderState) pendingState.set(name.charAt(3).toLowerCase() + name.slice(4), value);
    else if (name === 'setBuyRecoveryStatus') state.buyRecoveryStatus = value;
  };
  Object.assign(state, globals);
  const handlers = load([
    'recoveryMatchesBooking', 'recoveryMatchesDraft', 'recoveryStillCurrent', 'sameBuyRecoverySnapshot',
    'resetToStart', 'retryFailedPayment', 'checkRecoveryPayment', 'prepareRecoveredPurchase', 'resumeBuyFlowRecovery',
    'isBuyEntryRecoveryState', 'initialRecoveryGate', 'initialLinkResolution',
    'advance', 'completeSafetyAndReadyForStaff', 'writeSafetyRecovery', 'persistSafetyRecovery',
    'isReadyForStaffSession', 'isCompletedSession', 'getResumeState',
    ...(actualPreparation ? ['preparePaidNewBooking', 'confirmApprovedPurchaseAndReadyForStaff', 'routeAlreadyCheckedIn'] : []),
  ], state);
  const flushRender = () => {
    for (const [key, update] of pendingState) state[key] = typeof update === 'function' ? update(state[key]) : update;
    pendingState.clear();
  };
  return { ...handlers, state, events, flushRender, readSaved: () => saved, readRecord: () => record };
}

function paidSafetyHarness() {
  const host = harness({ recordMissing: true, renderState: true });
  const booking = {
    id: 'reference-original', rollerUniqueId: 'booking-original', jumpers: 2,
    time: '10:00', endTime: '11:00', date: '2026-09-03', durationMinutes: 60,
    products: 2, paid: true, paymentStatus: 'paid', amountOwing: 0,
    guestName: 'Test Guest', productLabel: '60 minutes', productType: 'entry', existingAddons: [],
  };
  const checkinSession = {
    checkinSessionId: 'session-original', status: 'active', guestResumeStep: 'safety',
    handoffStatus: 'pending', handoffCode: null, safetyStatus: 'pending',
  };
  host.state.ctx = {
    ...flowMachine.initialContext('park-qr'), booking, checkinSession,
    buyEntryFlow: true, paymentCompleted: true, safetyVideoSeenAt: '2026-09-03T09:29:00Z',
  };
  host.state.state = 'APP_SAFETY_ATTEST';
  host.state.buyRecoveryStatus = null;
  host.state.recoveryGateReady = true;
  host.state.markSessionReadyForStaff = async (session, safetyStatus) => {
    host.events.push(['mark-ready', session.checkinSessionId, safetyStatus]);
    return { ...session, status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: 'synthetic-handoff', safetyStatus };
  };
  return host;
}

test('continuing a paid purchase still opens safety after retiring its own recovery record', async () => {
  let record = { attemptId: 'attempt-original', kind: 'new_booking', outcome: 'approved', bookingIdentifier: 'booking-original' };
  const events = [];
  const host = load(['continuePreparedPurchase'], {
    booking: { rollerUniqueId: 'booking-original' },
    isCurrent: () => record !== null,
    recoveryRunRef: { current: 1 },
    readPaymentRecovery: () => record,
    clearPaymentRecoveryAfterCompletion: async () => { record = null; return true; },
    setBuyRecoveryStatus: status => events.push(['recovery', status]),
    setState: state => events.push(['state', state]),
    scrollToTop: () => events.push(['scroll']),
  });
  await host.continuePreparedPurchase('APP_SAFETY_VIDEO')();
  assert.deepEqual(events, [['recovery', null], ['state', 'APP_SAFETY_VIDEO'], ['scroll']]);
});

function runRecoveryEffects(host) {
  host.initialRecoveryGate();
  host.persistSafetyRecovery();
  host.flushRender();
}

test('pending, unknown and unresolved URL recovery cannot clear the purchase or expose a new checkout', async () => {
  for (const outcome of ['pending', 'unknown']) {
    const host = harness({ outcome });
    await host.resetToStart();
    assert.equal(host.readRecord().outcome, outcome);
    assert.ok(host.readSaved());
    assert.ok(host.events.some(event => event[0] === 'setBuyRecoveryStatus' && event[1] === 'payment-unknown'));
    assert.ok(!host.events.some(event => event[0].startsWith('clear-')));
  }
  const missing = harness({ recordMissing: true });
  missing.state.buyRecoveryStatus = 'failed';
  missing.state.hasPaymentRedirect = () => true;
  await missing.resetToStart();
  assert.ok(missing.readSaved());
  assert.ok(!missing.events.some(event => event[0].startsWith('clear-')));
});

test('approved payment markers cannot be discarded by Start over', async () => {
  const host = harness({ outcome: 'approved' });
  host.state.buyRecoveryStatus = 'payment-approved';
  await host.resetToStart();
  assert.equal(host.readRecord().outcome, 'approved');
  assert.ok(host.readSaved());
  assert.deepEqual(host.events, []);
});

test('failed return retry durably restores CONTACT before releasing the failed attempt', async () => {
  const host = harness({ outcome: 'failed' });
  await host.retryFailedPayment();
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

test('paid recovery remains checkable when another tab owns the payment', async () => {
  const host = harness({ lookup: async () => ({ paid: true, rollerUniqueId: 'booking-original' }) });
  host.state.approvePaymentRecovery = async () => false;
  await host.checkRecoveryPayment();
  assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
  assert.equal(host.state.recoveryCheckingRef.current, false);
  assert.ok(!host.events.some(event => event[0] === 'show-approved'));
});

test('a replaced recovery run cannot reveal an old paid result after saving approval', async () => {
  const host = harness({ lookup: async () => ({ paid: true, rollerUniqueId: 'booking-original' }) });
  host.state.approvePaymentRecovery = async () => {
    host.state.recoveryRunRef.current += 1;
    return true;
  };
  await host.checkRecoveryPayment();
  assert.ok(!host.events.some(event => event[0] === 'show-approved'));
});

test('an add-on payment cannot be recovered as a new-entry booking or new-entry retry', async () => {
  const host = harness({ outcome: 'failed', kind: 'add_product', lookup: async () => ({ paid: true }) });
  await host.checkRecoveryPayment();
  await host.retryFailedPayment();
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
  await host.resetToStart();
  assert.ok(host.readSaved(), 'The approved purchase must survive a failed reload lookup and attempted restart');
  assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
});

test('initial recovery routes valid unconsumed returns to their original attempt before opening checkout', async () => {
  const host = harness({ outcome: 'pending' });
  host.state.buyRecoveryStatus = null;
  host.state.hasPaymentRedirect = () => true;
  host.initialRecoveryGate();
  assert.ok(host.events.some(event => event[0] === 'setBuyRecoveryStatus' && event[1] === 'payment-return'));
  assert.ok(!host.events.some(event => ['lookup', 'show-approved', 'consume-url', 'clear-payment'].includes(event[0])));
});

test('missing or add-on return context fails closed before normal or linked check-in', async () => {
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

test('a legacy unapproved PAYMENT snapshot offers only original-status recovery', async () => {
  const host = harness({ recordMissing: true });
  host.state.buyRecoveryStatus = null;
  host.initialRecoveryGate();
  assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
  assert.ok(!host.events.some(event => ['lookup', 'show-approved', 'clear-basket'].includes(event[0])));
});

test('finishing one purchase cannot erase another saved approved purchase', async () => {
  const host = harness({ recordMissing: true });
  host.readSaved().draftState.paymentApproved = true;
  host.readSaved().currentFlowStep = 'APP_SAFETY_VIDEO';
  host.state.state = 'APP_PRESENT';
  host.state.buyRecoveryStatus = null;
  host.state.ctx = { booking: { id: 'another-reference', rollerUniqueId: 'another-booking' }, paymentCompleted: true };
  await host.resetToStart();
  assert.ok(host.readSaved());
  assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
});

test('explicit completion can reset its own finished purchase', async () => {
  const host = harness({ recordMissing: true });
  host.readSaved().draftState.paymentApproved = true;
  host.readSaved().currentFlowStep = 'APP_PRESENT';
  host.state.state = 'APP_PRESENT';
  host.state.buyRecoveryStatus = null;
  host.state.ctx = { booking: { id: 'reference-original', rollerUniqueId: 'booking-original' }, paymentCompleted: true };
  await host.resetToStart();
  assert.equal(host.readSaved(), null);
  assert.ok(host.events.some(event => event[0] === 'clear-basket'));
});

test('the normal paid safety-to-QR route can start a new booking without reopening recovery', async () => {
  const host = paidSafetyHarness();
  await host.completeSafetyAndReadyForStaff('2026-09-03T09:30:00Z');
  host.flushRender();
  assert.equal(host.state.state, 'APP_CONFIRM', 'The actual flow machine stops at the ready-for-entry QR view');
  assert.equal(host.state.ctx.checkinSession.status, 'ready_for_staff');
  assert.equal(host.state.ctx.checkinSession.safetyStatus, 'completed');
  assert.equal(host.state.ctx.booking.paid, true);
  runRecoveryEffects(host);
  assert.equal(host.readSaved().currentFlowStep, 'APP_CONFIRM');
  assert.equal(recoveryHelpers.getBuyFlowRecoveryIdentifier(host.readSaved()), host.state.ctx.booking.id);

  await host.resetToStart();
  host.flushRender();
  runRecoveryEffects(host);
  assert.equal(host.state.buyRecoveryStatus, null, 'New booking must not reopen the completed purchase as unknown');
  assert.equal(host.state.state, 'KIOSK_CHOICE');
  assert.equal(host.state.ctx.booking, null);
  assert.equal(host.readSaved(), null, 'The safety persistence effect must not recreate the retired purchase');
  assert.equal(host.readRecord(), null);
  assert.ok(!host.events.some(event => ['lookup', 'show-approved', 'prepare-paid'].includes(event[0])));

  host.advance({}, 'buy');
  host.flushRender();
  runRecoveryEffects(host);
  assert.equal(host.state.state, 'KIOSK_BUY');
  assert.equal(host.state.buyRecoveryStatus, null);
  assert.equal(host.readSaved(), null);
});

test('a ready QR cannot discard another pending or unknown payment when starting over', async () => {
  for (const outcome of ['pending', 'unknown']) {
    const host = harness({ outcome, renderState: true });
    host.state.ctx = {
      ...flowMachine.initialContext('park-qr'), buyEntryFlow: true, paymentCompleted: true,
      booking: { id: 'different-reference', rollerUniqueId: 'different-booking', paid: true },
      checkinSession: { checkinSessionId: 'different-session', status: 'ready_for_staff', handoffStatus: 'ready_for_staff', safetyStatus: 'completed' },
    };
    host.state.state = 'APP_CONFIRM';
    host.state.buyRecoveryStatus = null;
    host.state.recoveryGateReady = true;
    const purchaseBefore = JSON.stringify(host.readSaved());
    const paymentBefore = JSON.stringify(host.readRecord());
    await host.resetToStart();
    host.flushRender();
    runRecoveryEffects(host);
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
    assert.equal(JSON.stringify(host.readSaved()), purchaseBefore);
    assert.equal(JSON.stringify(host.readRecord()), paymentBefore);
    assert.ok(!host.events.some(event => event[0].startsWith('clear-')));
  }
});

test('an approved purchase before the QR handoff remains protected by recovery', async () => {
  for (const step of ['APP_SAFETY_VIDEO', 'APP_SAFETY_ATTEST']) {
    const host = paidSafetyHarness();
    host.state.state = step;
    host.state.ctx.booking = { ...host.state.ctx.booking, paid: false, paymentStatus: 'pending', amountOwing: 200 };
    runRecoveryEffects(host);
    assert.equal(host.readSaved().draftState.paymentApproved, true);
    const purchaseBefore = JSON.stringify(host.readSaved());
    await host.resetToStart();
    host.flushRender();
    runRecoveryEffects(host);
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
    assert.equal(JSON.stringify(host.readSaved()), purchaseBefore);
    assert.ok(!host.events.some(event => event[0].startsWith('clear-')));
  }
});

test('APP_CONFIRM alone cannot retire a purchase without a ready-for-staff session', async () => {
  for (const session of [null, { checkinSessionId: 'session-original', status: 'active', handoffStatus: 'pending' }]) {
    const host = paidSafetyHarness();
    host.state.state = 'APP_CONFIRM';
    host.state.ctx.checkinSession = session;
    runRecoveryEffects(host);
    const purchaseBefore = JSON.stringify(host.readSaved());
    await host.resetToStart();
    host.flushRender();
    runRecoveryEffects(host);
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
    assert.equal(JSON.stringify(host.readSaved()), purchaseBefore);
    assert.ok(!host.events.some(event => event[0].startsWith('clear-')));
  }
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

const BUY_KEY = 'jumpyard.buyFlowRecovery.v1';
const PAYMENT_KEY = 'jumpyard.paymentRecovery.v1';
const PROOF_KEY = 'jumpyard.paymentSubmission.v1';
const paidBooking = {
  id: 'reference-original', rollerUniqueId: 'booking-original', jumpers: 2,
  time: '10:00', date: '2026-09-03', durationMinutes: 60, paid: true,
  paymentStatus: 'paid', amountOwing: 0, productLabel: '60 minutes', existingAddons: [],
};
const readySession = {
  checkinSessionId: 'session-original', status: 'ready_for_staff',
  handoffStatus: 'ready_for_staff', handoffCode: 'synthetic-handoff', safetyStatus: 'completed',
};

// Use the production storage modules and handlers together. Only network, browser
// primitives and React's render scheduling are supplied by this harness.
function storageHarness({ values = new Map(), locks = true, now = 1_800_000_000_000,
  lookup = async () => { throw new Error('offline'); }, startSession = async () => readySession } = {}) {
  const clock = { now };
  const lease = { held: false, beforeAcquire: null, requests: 0 };
  const browser = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    },
    dispatchEvent: () => true,
    location: { href: 'https://checkin.example.invalid/' },
  };
  const globals = {
    window: browser, Event, URL, TextEncoder, crypto: webcrypto,
    Date: class extends Date { static now() { return clock.now; } },
    navigator: locks ? { locks: { request: async (_name, _options, callback) => {
      lease.requests += 1;
      if (lease.beforeAcquire) await lease.beforeAcquire();
      if (lease.held) return callback(null);
      lease.held = true;
      try { return await callback({ name: 'payment-owner' }); }
      finally { lease.held = false; }
    } } } : {},
  };
  const buy = loadFlowModule('./buyFlowRecovery.ts', globals);
  const payment = loadFlowModule('./paymentRecovery.ts', globals);
  const host = harness({ recordMissing: true, renderState: true, actualPreparation: true, lookup,
    globals: {
      ...buy, ...payment,
      CloudSessionError: class CloudSessionError extends Error {},
      startCheckInSession: startSession,
    },
  });
  host.state.buyRecoveryStatus = null;
  host.state.buyRecoverySnapshot = null;
  host.state.recoveryReturnRecord = null;
  const clear = buy.clearBuyFlowRecovery;
  host.state.clearBuyFlowRecovery = () => { host.events.push(['clear-basket']); clear(); };
  return { ...host, buy, payment, values, browser, lease, clock,
    readSaved: buy.readBuyFlowRecovery, readRecord: payment.readPaymentRecovery };
}

function saveFinishedPurchase(host, step = 'APP_CONFIRM') {
  host.state.state = step;
  host.state.ctx = {
    ...flowMachine.initialContext('park-qr'), booking: paidBooking, buyEntryFlow: true, paymentCompleted: true,
    checkinSession: step === 'APP_PRESENT'
      ? { ...readySession, status: 'completed', handoffStatus: 'completed' } : readySession,
  };
  host.writeSafetyRecovery(step, host.state.ctx, false);
  return host.readSaved();
}

async function settleRender(host) {
  await new Promise(resolve => setImmediate(resolve));
  host.flushRender();
}

async function failedCompletedReload(options = {}) {
  const before = storageHarness();
  const saved = saveFinishedPurchase(before, options.step ?? 'APP_CONFIRM');
  const host = storageHarness({ values: before.values, ...options });
  host.initialRecoveryGate();
  await settleRender(host);
  assert.equal(host.state.buyRecoveryStatus, 'completed-unavailable');
  assert.equal(host.state.buyRecoverySnapshot.completion.status, saved.completion.status);
  return host;
}

function startUnresolvedPayment(host, outcome = 'pending') {
  const record = host.payment.beginPaymentRecovery({
    attemptId: 'attempt-newer', bookingIdentifier: 'booking-newer', kind: 'new_booking',
    config: { available: true, apiUrl: 'https://payments.example.invalid', configurationId: 'config', integrationId: 'integration' },
  });
  assert.ok(record);
  if (outcome !== 'pending') assert.equal(host.payment.setPaymentRecoveryOutcome(record.attemptId, outcome), true);
  return host.readRecord();
}

function addOrphanProof(host) {
  host.values.set(PROOF_KEY, JSON.stringify({
    version: 1, ownerId: 'another-owner', protected: true, phase: 'submitted',
    attemptId: 'attempt-orphan', bookingIdentifier: 'booking-orphan',
    createdAt: host.clock.now, expiresAt: host.clock.now + host.payment.PAYMENT_RECOVERY_MAX_AGE_MS,
    sessionHash: 'a'.repeat(64),
  }));
}

test('real ready and completed snapshots survive reload failure and New booking retires only that finished purchase', async () => {
  for (const step of ['APP_CONFIRM', 'APP_PRESENT']) {
    const host = await failedCompletedReload({ step });
    assert.deepEqual(host.events.filter(event => event[0] === 'lookup'), [['lookup', 'reference-original']]);
    assert.equal(host.buy.hasCompletedBuyFlowRecovery(host.readSaved()), true);
    await host.resetToStart();
    host.flushRender();
    runRecoveryEffects(host);
    assert.equal(host.state.state, 'KIOSK_CHOICE');
    assert.equal(host.state.buyRecoveryStatus, null);
    assert.equal(host.state.ctx.booking, null);
    assert.equal(host.values.has(BUY_KEY), false);
    assert.equal(host.readRecord(), null);
    assert.equal(host.lease.requests, 1, 'The explicit completed reset must acquire the production payment lease');
  }
});

test('the safety writer records completion only after the paid booking reaches its completed or ready session', () => {
  for (const step of ['APP_CONFIRM', 'APP_PRESENT']) {
    for (const invalid of ['unpaid', 'unconfirmed-payment', 'active-session', 'missing-session']) {
      const host = storageHarness();
      saveFinishedPurchase(host, step);
      if (invalid === 'unpaid') host.state.ctx.booking = { ...paidBooking, paid: false };
      if (invalid === 'unconfirmed-payment') host.state.ctx.paymentCompleted = false;
      if (invalid === 'active-session') host.state.ctx.checkinSession = { status: 'active', handoffStatus: 'pending' };
      if (invalid === 'missing-session') host.state.ctx.checkinSession = null;
      host.writeSafetyRecovery(step, host.state.ctx, false);
      assert.equal(host.readSaved().completion, null, `${step}/${invalid}`);
      assert.equal(host.buy.hasCompletedBuyFlowRecovery(host.readSaved()), false);
    }
  }
});

test('legacy APP_CONFIRM, safety and unknown payment snapshots remain protected after an unavailable reload', async () => {
  for (const step of ['APP_CONFIRM', 'APP_SAFETY_VIDEO', 'APP_SAFETY_ATTEST', 'PAYMENT', 'PENDING']) {
    const before = storageHarness();
    const snapshot = saveFinishedPurchase(before);
    snapshot.currentFlowStep = step;
    delete snapshot.completion;
    before.buy.writeBuyFlowRecovery(snapshot);
    const host = storageHarness({ values: before.values });
    host.initialRecoveryGate();
    await settleRender(host);
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown', step);
    const retained = host.values.get(BUY_KEY);
    await host.resetToStart();
    host.flushRender();
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
    assert.equal(host.values.get(BUY_KEY), retained);
    assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
  }
});

test('completed fallback cannot discard a pending or unknown payment, orphan submission proof, or return URL', async () => {
  for (const evidence of ['pending', 'unknown', 'orphan-proof', 'sessionId', 'redirectResult']) {
    const host = await failedCompletedReload();
    if (evidence === 'pending' || evidence === 'unknown') startUnresolvedPayment(host, evidence);
    if (evidence === 'orphan-proof') addOrphanProof(host);
    if (evidence === 'sessionId' || evidence === 'redirectResult') host.browser.location.href += `?${evidence}=original-return`;
    const retained = host.values.get(BUY_KEY);
    const rawPayment = host.values.get(PAYMENT_KEY);
    const rawProof = host.values.get(PROOF_KEY);
    await host.resetToStart();
    host.flushRender();
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown', evidence);
    assert.equal(host.values.get(BUY_KEY), retained);
    assert.equal(host.values.get(PAYMENT_KEY), rawPayment);
    assert.equal(host.values.get(PROOF_KEY), rawProof);
    assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
  }
});

test('a replacement saved purchase before New booking, including prepayment, cannot be discarded by the old card', async () => {
  for (const replacement of ['prepayment', 'completed']) {
    const host = await failedCompletedReload();
    const snapshot = host.readSaved();
    if (replacement === 'prepayment') {
      host.buy.writeBuyFlowRecovery({ ...snapshot, currentFlowStep: 'CONTACT', completion: null,
        bookingReference: null, draftUniqueId: null, draftState: null });
    } else {
      host.buy.writeBuyFlowRecovery({ ...snapshot, bookingReference: 'reference-newer',
        draftState: { ...snapshot.draftState, bookingReference: 'reference-newer' },
        completion: { bookingIdentifier: 'reference-newer', status: 'ready_for_staff' } });
    }
    const retained = host.values.get(BUY_KEY);
    await host.resetToStart();
    host.flushRender();
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown', replacement);
    assert.equal(host.values.get(BUY_KEY), retained);
    assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
  }
});

test('payment or purchase replacement while the reset awaits its lease is rechecked before any clearing', async () => {
  for (const replacement of ['payment', 'prepayment', 'return']) {
    const host = await failedCompletedReload();
    let release;
    host.lease.beforeAcquire = () => new Promise(resolve => { release = resolve; });
    const reset = host.resetToStart();
    assert.equal(typeof release, 'function');
    if (replacement === 'payment') startUnresolvedPayment(host);
    if (replacement === 'prepayment') host.buy.writeBuyFlowRecovery({ ...seedSnapshot(),
      currentFlowStep: 'CONTACT', bookingReference: null, draftUniqueId: null, draftState: null });
    if (replacement === 'return') host.browser.location.href += '?sessionId=late-return';
    host.readSaved();
    const retained = host.values.get(BUY_KEY);
    host.lease.beforeAcquire = null;
    release();
    await reset;
    host.flushRender();
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown', replacement);
    assert.equal(host.values.get(BUY_KEY), retained);
    assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
  }
});

test('a late lookup after completed reset cannot restore its old booking or overwrite a replacement', async () => {
  let finishLookup;
  const host = await failedCompletedReload();
  host.state.lookupBooking = () => new Promise(resolve => { finishLookup = resolve; });
  const lookup = host.resumeBuyFlowRecovery(host.state.buyRecoverySnapshot);
  // React has not committed the checking render yet, so an already queued click
  // still uses the displayed completed card. Its reset must invalidate the lookup.
  await host.resetToStart();
  host.flushRender();
  assert.equal(host.state.state, 'KIOSK_CHOICE');
  host.buy.writeBuyFlowRecovery({ ...seedSnapshot(), currentFlowStep: 'CONTACT',
    bookingReference: null, draftUniqueId: null, draftState: null });
  const replacement = host.values.get(BUY_KEY);
  const afterReset = host.events.length;
  finishLookup(paidBooking);
  await lookup;
  host.flushRender();
  assert.equal(host.state.ctx.booking, null);
  assert.equal(host.values.get(BUY_KEY), replacement);
  assert.ok(!host.events.slice(afterReset).some(event => ['setCtx', 'setState'].includes(event[0])));
});

test('previously observed unresolved payment cannot become completed recovery after its local expiry', async () => {
  const host = await failedCompletedReload();
  host.state.recoveryReturnRecord = startUnresolvedPayment(host, 'unknown');
  host.state.buyRecoveryStatus = 'payment-unknown';
  host.clock.now += host.payment.PAYMENT_RECOVERY_MAX_AGE_MS + 1;
  assert.equal(host.readRecord(), null);
  await host.payment.purgeExpiredPaymentRecovery();
  await host.resumeBuyFlowRecovery(host.state.buyRecoverySnapshot);
  await host.resetToStart();
  host.flushRender();
  assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
  assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
  assert.equal(host.events.filter(event => event[0] === 'lookup').length, 1);
});

test('completed restore rejects unavailable or active sessions without falling back into safety', async () => {
  for (const failure of ['offline', 'active', 'unpaid']) {
    const host = storageHarness({
      startSession: async () => {
        if (failure === 'offline') throw new Error('offline');
        return { status: 'active', handoffStatus: 'pending', guestResumeStep: 'safety' };
      },
    });
    await assert.rejects(host.preparePaidNewBooking({ ...paidBooking, paid: failure !== 'unpaid' }, null,
      { paymentApproved: true, completedRecovery: true }));
    host.flushRender();
    assert.equal(host.state.ctx.booking, null);
    assert.ok(!host.events.some(event => event[0] === 'setState' || event[0] === 'setCtx'));
  }
});

test('a successful completed restore reaches its QR and retains orphan or return protection on New booking', async () => {
  for (const evidence of ['none', 'orphan-proof', 'sessionId']) {
    const before = storageHarness();
    saveFinishedPurchase(before);
    const host = storageHarness({ values: before.values, lookup: async () => paidBooking });
    host.initialRecoveryGate();
    await settleRender(host);
    assert.equal(host.state.state, 'APP_CONFIRM');
    assert.equal(host.state.ctx.checkinSession.status, 'ready_for_staff');
    host.persistSafetyRecovery();
    if (evidence === 'orphan-proof') addOrphanProof(host);
    if (evidence === 'sessionId') host.browser.location.href += '?sessionId=orphan-return';
    host.readSaved();
    const retained = host.values.get(BUY_KEY);
    await host.resetToStart();
    host.flushRender();
    assert.equal(host.state.buyRecoveryStatus, evidence === 'none' ? null : 'payment-unknown');
    assert.equal(host.values.get(BUY_KEY), evidence === 'none' ? undefined : retained);
  }
});

test('live completed views keep the raw payment guard even after their saved purchase expires or disappears', async () => {
  for (const step of ['APP_CONFIRM', 'APP_PRESENT']) {
    for (const absence of ['expired', 'removed']) {
      for (const evidence of ['orphan-proof', 'sessionId']) {
        const host = storageHarness();
        saveFinishedPurchase(host, step);
        if (absence === 'expired') host.clock.now += host.buy.BUY_FLOW_RECOVERY_MAX_AGE_MS + 1;
        else host.values.delete(BUY_KEY);
        if (evidence === 'orphan-proof') addOrphanProof(host);
        else host.browser.location.href += '?sessionId=orphan-return';
        assert.equal(host.readSaved(), null);
        await host.resetToStart();
        host.flushRender();
        assert.equal(host.state.buyRecoveryStatus, 'payment-unknown', `${step}/${absence}/${evidence}`);
        assert.ok(host.state.ctx.booking, 'The completed UI must not clear context while raw payment evidence remains');
        assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
      }
    }
  }
});

test('saved completion requires Web Locks but the live QR retains its existing legacy-browser exit', async () => {
  const fallback = await failedCompletedReload({ locks: false });
  await fallback.resetToStart();
  fallback.flushRender();
  assert.equal(fallback.state.buyRecoveryStatus, 'payment-unknown');
  assert.ok(fallback.readSaved());
  const live = storageHarness({ locks: false });
  saveFinishedPurchase(live);
  await live.resetToStart();
  live.flushRender();
  assert.equal(live.state.state, 'KIOSK_CHOICE');
  assert.equal(live.state.buyRecoveryStatus, null);
  assert.equal(live.readSaved(), null);
});

test('existing-booking ready and completed views guard raw evidence while preserving safe and legacy exits', async () => {
  for (const locks of [true, false]) {
    for (const completion of ['ready', 'completed', 'already-checked-in']) {
      for (const evidence of ['none', 'orphan-proof', 'sessionId']) {
        const host = storageHarness({ locks });
        host.state.state = completion === 'ready' ? 'APP_CONFIRM' : 'APP_PRESENT';
        host.state.ctx = { ...flowMachine.initialContext('park-qr'), booking: paidBooking,
          checkinSession: completion === 'ready' ? readySession
            : completion === 'completed' ? { ...readySession, status: 'completed' } : null };
        host.state.alreadyCheckedIn = completion === 'already-checked-in';
        assert.equal(host.state.ctx.paymentCompleted, false);
        assert.equal(host.readSaved(), null);
        if (evidence === 'orphan-proof') addOrphanProof(host);
        if (evidence === 'sessionId') host.browser.location.href += '?sessionId=orphan-return';
        await host.resetToStart();
        host.flushRender();
        assert.equal(host.state.buyRecoveryStatus, evidence === 'none' ? null : 'payment-unknown', `${locks}/${completion}/${evidence}`);
        assert.equal(host.state.ctx.booking === null, evidence === 'none');
        assert.equal(host.events.some(event => event[0] === 'clear-basket'), evidence === 'none');
      }
    }
  }
});

test('a completed live page cannot erase a different prepayment basket', async () => {
  const host = storageHarness();
  saveFinishedPurchase(host);
  host.buy.writeBuyFlowRecovery({ ...seedSnapshot(), currentFlowStep: 'CONTACT',
    bookingReference: null, draftUniqueId: null, draftState: null });
  host.readSaved();
  const replacement = host.values.get(BUY_KEY);
  await host.resetToStart();
  host.flushRender();
  assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
  assert.equal(host.values.get(BUY_KEY), replacement);
  assert.ok(!host.events.some(event => event[0] === 'clear-basket'));
});

test('a completed booking lookup cannot restore over a replacement saved while it was pending', async () => {
  let finishLookup;
  const before = storageHarness();
  saveFinishedPurchase(before);
  const host = storageHarness({ values: before.values, lookup: () => new Promise(resolve => { finishLookup = resolve; }) });
  const lookup = host.resumeBuyFlowRecovery(host.readSaved());
  host.buy.writeBuyFlowRecovery({ ...seedSnapshot(), currentFlowStep: 'CONTACT',
    bookingReference: null, draftUniqueId: null, draftState: null });
  host.readSaved();
  const replacement = host.values.get(BUY_KEY);
  finishLookup(paidBooking);
  await lookup;
  host.flushRender();
  assert.equal(host.state.ctx.booking, null);
  assert.equal(host.state.state, 'KIOSK_CHOICE');
  assert.equal(host.values.get(BUY_KEY), replacement);
  assert.ok(!host.events.some(event => event[0] === 'setCtx'));
});

test('ordinary prepayment exit remains synchronous and does not wait for a payment lease', () => {
  const host = storageHarness();
  host.buy.writeBuyFlowRecovery({ ...seedSnapshot(), currentFlowStep: 'CONTACT',
    bookingReference: null, draftUniqueId: null, draftState: null });
  host.state.state = 'KIOSK_BUY';
  void host.resetToStart();
  host.flushRender();
  assert.equal(host.state.state, 'KIOSK_CHOICE');
  assert.equal(host.readSaved(), null);
  assert.equal(host.lease.requests, 0);
});

test('an already-redeemed session after paid confirmation saves the confirmed booking completion', async () => {
  const host = storageHarness();
  host.state.ctx = { ...flowMachine.initialContext('park-qr'), buyEntryFlow: true, paymentCompleted: true,
    booking: { ...paidBooking, paid: false, amountOwing: 200, paymentStatus: 'pending' } };
  host.state.state = 'APP_SAFETY_ATTEST';
  host.state.getApprovedPurchaseIdentifier = booking => booking.rollerUniqueId;
  host.state.resolvePaidConfirmation = async () => ({ status: 'paid', booking: paidBooking });
  host.state.delay = async () => undefined;
  host.state.startCheckInSession = async () => {
    const error = new host.state.CloudSessionError('Already redeemed');
    error.reason = 'already_redeemed';
    throw error;
  };
  await host.confirmApprovedPurchaseAndReadyForStaff('2026-09-03T09:30:00Z');
  host.flushRender();
  assert.equal(host.state.state, 'APP_PRESENT');
  assert.equal(host.state.ctx.booking.paid, true);
  assert.equal(host.state.alreadyCheckedIn, true);
  host.persistSafetyRecovery();
  const snapshot = host.readSaved();
  assert.equal(host.buy.hasCompletedBuyFlowRecovery(snapshot), true);
  assert.equal(snapshot.completion.status, 'completed');
  assert.equal(snapshot.draftState.amountOwing, 0);
});
