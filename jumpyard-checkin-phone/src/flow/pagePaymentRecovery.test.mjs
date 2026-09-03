import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const sourceFile = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function loadFlowModule(name) {
  const input = fs.readFileSync(new URL(name, import.meta.url), 'utf8');
  const context = vm.createContext({ exports: {} });
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
    const effectMarker = name === 'persistSafetyRecovery' ? 'writeSafetyRecovery(state, ctx)'
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

function harness({ outcome = 'unknown', kind = 'new_booking', lookup = async () => ({ paid: false }), recordMissing = false, renderState = false } = {}) {
  let record = recordMissing ? null : { attemptId: 'attempt-original', bookingIdentifier: 'booking-original', kind, outcome, createdAt: 1 };
  let saved = seedSnapshot();
  const events = [];
  const pendingState = new Map();
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
    ctx: flowMachine.initialContext('park-qr'), isMarkingReadyForStaff: false,
    readPaymentRecovery: () => record,
    readBuyFlowRecovery: () => saved,
    clearPaymentRecovery: id => { events.push(['clear-payment', id]); record = null; return true; },
    clearBuyFlowRecovery: () => { events.push(['clear-basket']); saved = null; },
    writeBuyFlowRecovery: value => { saved = JSON.parse(JSON.stringify(value)); events.push(['write-basket', saved]); },
    setPaymentRecoveryOutcome: (id, next) => { events.push(['outcome', id, next]); record = { ...record, outcome: next }; return true; },
    getBuyFlowRecoveryIdentifier: recoveryHelpers.getBuyFlowRecoveryIdentifier,
    getBuyFlowRecoveryTargetState: recoveryHelpers.getBuyFlowRecoveryTargetState,
    isPrePaymentBuyFlowRecovery: recoveryHelpers.isPrePaymentBuyFlowRecovery,
    hasPaymentRedirect: () => false,
    consumePaymentRedirect: () => events.push(['consume-url']),
    lookupBooking: async id => { events.push(['lookup', id]); return lookup(); },
    showApprovedRecovery: (...args) => events.push(['show-approved', ...args]),
    preparePaidNewBooking: async (...args) => { events.push(['prepare-paid', ...args]); return () => events.push(['continue']); },
    resolvePaidConfirmation: async () => ({ status: 'unavailable' }),
    resolveCheckInSessionLink: async () => { events.push(['resolve-link']); return {}; },
    revealRecoveredPurchase: (...args) => events.push(['reveal', ...args]),
    initialContext: flowMachine.initialContext, nextState: flowMachine.nextState, effectiveChannel: 'park-qr',
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
    if (renderState) pendingState.set(name.charAt(3).toLowerCase() + name.slice(4), value);
    else if (name === 'setBuyRecoveryStatus') state.buyRecoveryStatus = value;
  };
  const handlers = load([
    'recoveryMatchesBooking', 'recoveryMatchesDraft', 'recoveryStillCurrent',
    'resetToStart', 'retryFailedPayment', 'checkRecoveryPayment', 'prepareRecoveredPurchase', 'resumeBuyFlowRecovery',
    'isBuyEntryRecoveryState', 'initialRecoveryGate', 'initialLinkResolution',
    'advance', 'completeSafetyAndReadyForStaff', 'writeSafetyRecovery', 'persistSafetyRecovery',
    'isReadyForStaffSession', 'isCompletedSession', 'getResumeState',
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

function runRecoveryEffects(host) {
  host.initialRecoveryGate();
  host.persistSafetyRecovery();
  host.flushRender();
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

  host.resetToStart();
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

test('a ready QR cannot discard another pending or unknown payment when starting over', () => {
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
    host.resetToStart();
    host.flushRender();
    runRecoveryEffects(host);
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
    assert.equal(JSON.stringify(host.readSaved()), purchaseBefore);
    assert.equal(JSON.stringify(host.readRecord()), paymentBefore);
    assert.ok(!host.events.some(event => event[0].startsWith('clear-')));
  }
});

test('an approved purchase before the QR handoff remains protected by recovery', () => {
  for (const step of ['APP_SAFETY_VIDEO', 'APP_SAFETY_ATTEST']) {
    const host = paidSafetyHarness();
    host.state.state = step;
    host.state.ctx.booking = { ...host.state.ctx.booking, paid: false, paymentStatus: 'pending', amountOwing: 200 };
    runRecoveryEffects(host);
    assert.equal(host.readSaved().draftState.paymentApproved, true);
    const purchaseBefore = JSON.stringify(host.readSaved());
    host.resetToStart();
    host.flushRender();
    runRecoveryEffects(host);
    assert.equal(host.state.buyRecoveryStatus, 'payment-unknown');
    assert.equal(JSON.stringify(host.readSaved()), purchaseBefore);
    assert.ok(!host.events.some(event => event[0].startsWith('clear-')));
  }
});

test('APP_CONFIRM alone cannot retire a purchase without a ready-for-staff session', () => {
  for (const session of [null, { checkinSessionId: 'session-original', status: 'active', handoffStatus: 'pending' }]) {
    const host = paidSafetyHarness();
    host.state.state = 'APP_CONFIRM';
    host.state.ctx.checkinSession = session;
    runRecoveryEffects(host);
    const purchaseBefore = JSON.stringify(host.readSaved());
    host.resetToStart();
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
