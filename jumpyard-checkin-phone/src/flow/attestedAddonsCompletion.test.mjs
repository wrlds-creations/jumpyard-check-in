import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// #458 (D0231): on an existing booking the guest approves safety after the add-ons and before
// the add-on payment. The guest is done the moment that payment is approved (Love 2026-09-30):
// the visit is marked ready at once and ROLLER confirms the add-on booking in the background.
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

function compile(input, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context;
}

const attestedAt = '2026-09-30T09:40:00.000Z';
const session = { checkinSessionId: 'session-original', status: 'guest_in_progress', handoffStatus: 'not_ready' };

async function settleUntil(predicate, message = 'The expected async state was not reached') {
  for (let i = 0; i < 200 && !predicate(); i += 1) await Promise.resolve();
  assert.ok(predicate(), message);
}

function harness({ attested = true, lookup = async () => ({ paid: true }), markReady } = {}) {
  const events = [];
  const delays = [];
  let record = { attemptId: 'addon-attempt', outcome: 'approved' };
  class CloudSessionError extends Error {
    constructor(reason) { super(reason); this.reason = reason; }
  }
  const state = {
    Promise, Error, CloudSessionError,
    // AddonsOffer scope
    draft: { draft: { uniqueId: 'addon-draft', bookingReference: 'addon-reference' }, prepayment: { prepaymentDraftId: 'addon-attempt' } },
    paymentAttemptId: 'addon-attempt',
    activePaymentAttemptRef: { current: 'addon-attempt' },
    attestedConfirmInFlightRef: { current: false },
    paymentApprovedRef: { current: false },
    safetyBeforePayment: attested,
    safetyApprovedAt: attested ? attestedAt : null,
    selectedAddons: [{ id: 'socks', qty: 2 }],
    addonsTotal: 98,
    addedSkyrider: false,
    skyriderConsentConfirmed: false,
    qty: { connected: 0 },
    paidConfirmState: 'confirming',
    setPaidConfirmState: value => { state.paidConfirmState = value; events.push(['wait-state', value]); },
    setStep: value => { state.step = value; events.push(['step', value]); },
    onPaymentApproved: result => events.push(['payment-approved', result.safetyAttestedAt]),
    readPaymentRecovery: () => record,
    clearPaymentRecoveryAfterCompletion: async id => { events.push(['retire', id]); record = null; return true; },
    lookupBooking: async id => { events.push(['lookup', id]); return lookup(id); },
    scheduleRollerConfirmationNudges: (_lookup, identifier) => { events.push(['nudges', identifier]); },
    setTimeout: (resolve, ms) => { delays.push(ms); resolve(); },
    // page scope
    ctx: { booking: { id: 'original' }, checkinSession: session, paymentCompleted: true, baseTotal: 0 },
    markSessionReadyForStaff: async (value, status) => {
      events.push(['ready', value.checkinSessionId, status]);
      if (markReady) return markReady(value, status);
      return { ...value, status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: '0042' };
    },
    setCtx: value => { state.ctx = typeof value === 'function' ? value(state.ctx) : value; },
    setState: value => events.push(['state', value]),
    advance: patch => events.push(['advance', patch.safetyAttestedAt ?? null]),
    routeAlreadyCheckedIn: () => events.push(['already-checked-in']),
  };
  compile([
    ...['getAddonsFlowPatch', 'completeAttestedAddons'].map(name => declaration('page', name)),
    `const onContinue = ${prop('page', 'AddonsOffer', 'onContinue')};`,
    ...['getCompletionResult', 'completeAddons', 'handlePaymentApproved', 'confirmAttestedAddons'].map(name => declaration('addons', name)),
    `const preparationState = () => (${prop('addons', 'PhonePaymentConfirmation', 'preparationState')});`,
    `const retry = ${prop('addons', 'PhonePaymentConfirmation', 'onRetryPreparation')};`,
    'globalThis.handlers = { completeAddons, handlePaymentApproved, preparationState, retry };',
  ].join('\n'), state);
  return { ...state.handlers, state, events, delays, navigation: () => events.filter(event => event[0] === 'state') };
}

test('an attested add-on payment marks the visit ready at once, without waiting for ROLLER', async () => {
  const host = harness();
  host.handlePaymentApproved();
  assert.equal(host.state.step, 'APPROVED');
  await settleUntil(() => host.navigation().length === 1 && host.events.some(event => event[0] === 'nudges'));
  assert.deepEqual(host.events.filter(event => event[0] === 'ready'), [['ready', 'session-original', 'completed']]);
  assert.deepEqual(host.navigation(), [['state', 'APP_CONFIRM']]);
  assert.equal(host.state.ctx.checkinSession.handoffCode, '0042');
  assert.equal(host.state.ctx.safetyAttestedAt, attestedAt);
  assert.ok(!host.events.some(event => event[0] === 'lookup'), 'nothing waits for ROLLER');
  assert.deepEqual(host.delays, []);
  assert.deepEqual(host.events.filter(event => event[0] === 'nudges'), [['nudges', 'addon-draft']]);
  assert.ok(host.events.findIndex(event => event[0] === 'retire') < host.events.findIndex(event => event[0] === 'ready'));
  assert.ok(!host.events.some(event => event[0] === 'advance'), 'never the old safety step');
});

test('a failed ready-for-staff keeps the calm wait with its retry instead of losing the visit', async () => {
  let failures = 1;
  const host = harness({ markReady: async (value) => {
    if (failures-- > 0) throw new Error('network');
    return { ...value, status: 'ready_for_staff', handoffCode: '0043' };
  } });
  host.handlePaymentApproved();
  await settleUntil(() => host.preparationState() === 'delayed');
  assert.deepEqual(host.navigation(), []);
  host.retry();
  await settleUntil(() => host.navigation().length === 1);
  assert.equal(host.state.ctx.checkinSession.handoffCode, '0043');
});

test('an approval stands when the guest drops the add-ons after a declined payment', async () => {
  const host = harness();
  await host.completeAddons(false);
  assert.deepEqual(host.events.filter(event => event[0] === 'ready'), [['ready', 'session-original', 'completed']]);
  assert.deepEqual(host.navigation(), [['state', 'APP_CONFIRM']]);
  assert.ok(!host.events.some(event => event[0] === 'lookup'), 'nothing was paid, so nothing waits for ROLLER');
});

test('without an approval before payment the existing Continue and safety step remain', async () => {
  const host = harness({ attested: false });
  host.handlePaymentApproved();
  assert.equal(host.preparationState(), 'ready');
  await Promise.resolve();
  assert.ok(!host.events.some(event => event[0] === 'lookup' || event[0] === 'ready'));
  await host.completeAddons(true);
  assert.deepEqual(host.events.filter(event => event[0] === 'advance'), [['advance', null]]);
  assert.deepEqual(host.navigation(), []);
});
