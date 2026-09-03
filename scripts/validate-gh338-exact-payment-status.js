#!/usr/bin/env node
'use strict';

// GH-338: payment status is interpreted exactly. "PartiallyPaid" and "Unpaid" must never count
// as paid through substring matching, a missing amount owing is not evidence of payment, and a
// partially paid booking is sent to the register by the lookup eligibility.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const LAMBDAS = ['lookup', 'session', 'redeem'];
const VISIT_DATE = '2026-09-03';

function lambdaPath(name) {
  return path.join(ROOT, 'infra', 'lambda', name, 'index.js');
}

function fakeAwsModule() {
  class FakeCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class FakeClient {
    async send(command) {
      throw new Error(`Unexpected AWS call ${command?.constructor?.name ?? ''} during GH-338 validation.`);
    }
  }
  return new Proxy({}, {
    get(_target, property) {
      return String(property).endsWith('Client') ? FakeClient : FakeCommand;
    },
  });
}

function loadInternals(name, names) {
  const absolutePath = lambdaPath(name);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: async () => {
      throw new Error('Unexpected network call during GH-338 validation.');
    },
    module,
    process: {
      env: {
        DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
        DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
        JUMPYARD_ENVIRONMENT: 'park-test',
      },
    },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      if (moduleId.startsWith('./')) return require(path.join(path.dirname(absolutePath), moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-338 validation.`);
    },
    setTimeout,
  };
  vm.runInNewContext(`${source}\nmodule.exports.__gh338 = { ${names.join(', ')} };`, sandbox, { filename: absolutePath });
  return module.exports.__gh338;
}

const failures = [];
function check(label, fn) {
  try {
    fn();
    console.log(`[pass] ${label}`);
  } catch (error) {
    failures.push(label);
    console.error(`[fail] ${label}\n       ${error.message}`);
  }
}

// --- 1. The classification block is identical in all three Lambdas ---------------------------
function classificationBlock(name) {
  const source = fs.readFileSync(lambdaPath(name), 'utf8').replace(/\r\n/g, '\n');
  const match = source.match(/\/\/ GH-338 payment-state classification \(begin\)[\s\S]*?\/\/ GH-338 payment-state classification \(end\)\./);
  assert.ok(match, `${name}: classification block missing`);
  return match[0];
}

check('classification block is present and identical in lookup, session and redeem', () => {
  const blocks = LAMBDAS.map(classificationBlock);
  assert.equal(blocks[1], blocks[0], 'session block differs from lookup');
  assert.equal(blocks[2], blocks[0], 'redeem block differs from lookup');
});

check('no substring payment matching remains in the three gates', () => {
  const needles = ["includes('paid')", "includes('pending')", "includes('partial')", "includes('unpaid')"];
  for (const name of LAMBDAS) {
    const source = fs.readFileSync(lambdaPath(name), 'utf8');
    for (const needle of needles) {
      assert.ok(!source.includes(needle), `${name} still uses ${needle}`);
    }
  }
});

// --- 2. classifyPaymentState: exact tokens, amount rules, missing fields -----------------------
const CLASSIFICATION_CASES = [
  // [paymentStatus, bookingStatus, amountOwing, expected state, expected evidence]
  ['Paid', 'Paid', null, 'paid', 'status'],
  ['Paid', 'Paid', 0, 'paid', 'status'],
  ['PaidInFull', null, null, 'paid', 'status'],
  ['No Payment Required', 'NoPaymentRequired', null, 'paid', 'status'],
  ['NO_PAYMENT_REQUIRED', null, null, 'paid', 'status'],
  ['PartiallyPaid', 'PartiallyPaid', null, 'partially_paid', 'status'],
  ['Partially Paid', null, 0, 'partially_paid', 'status'],
  ['partially_paid', null, 250, 'partially_paid', 'status'],
  ['Paid', 'PartiallyPaid', null, 'partially_paid', 'status'],
  ['PendingPayment', 'PendingPayment', null, 'pending', 'status'],
  ['Pending', null, 0, 'pending', 'status'],
  ['Unpaid', null, null, 'unpaid', 'status'],
  ['NotPaid', null, 0, 'unpaid', 'status'],
  ['Paid', 'Paid', 100, 'unpaid', 'amount'],
  ['Confirmed', 'Confirmed', 100, 'unpaid', 'amount'],
  ['Confirmed', 'Paid', null, 'paid', 'status'],
  ['Confirmed', null, 0, 'paid', 'amount'],
  ['Confirmed', null, null, 'unknown', 'none'],
  [null, null, null, 'unknown', 'none'],
  ['', '', 0, 'paid', 'amount'],
  ['Cancelled', 'Cancelled', null, 'unknown', 'none'],
];

const lookup = loadInternals('lookup', ['classifyPaymentState', 'evaluateEligibility', 'isPaymentSettled', 'isUnsettledPaymentState']);
const session = loadInternals('session', ['classifyPaymentState', 'evaluateStartContext', 'isPaymentComplete']);
const redeem = loadInternals('redeem', ['classifyPaymentState', 'evaluateRedeemContext', 'isPaymentComplete']);

for (const [name, internals] of [['lookup', lookup], ['session', session], ['redeem', redeem]]) {
  check(`${name}: classifyPaymentState matches every exact-token and amount case`, () => {
    for (const [paymentStatus, bookingStatus, amountOwing, state, evidence] of CLASSIFICATION_CASES) {
      const input = JSON.stringify([paymentStatus, bookingStatus, amountOwing]);
      const actual = internals.classifyPaymentState({ amountOwing, bookingStatus, paymentStatus });
      assert.equal(actual.state, state, `${input} -> ${actual.state}, expected ${state}`);
      assert.equal(actual.evidence, evidence, `${input} evidence ${actual.evidence}, expected ${evidence}`);
    }
  });
}

// --- 3. Lookup eligibility: partially paid goes to the register, paid stays ready ---------------
function lookupBooking(overrides = {}) {
  return {
    amountOwing: null,
    bookingReference: '5100001',
    items: [{ bookingDate: VISIT_DATE, tickets: [{ ticketId: 't1' }, { ticketId: 't2' }] }],
    paymentStatus: 'Paid',
    rollerUniqueId: 'roller-unique-1',
    status: 'Paid',
    ...overrides,
  };
}

const lookupRequest = { expectedDate: VISIT_DATE, ticketIds: [] };

check('lookup: PartiallyPaid with a missing amount owing is payment_required with paymentState partially_paid', () => {
  const eligibility = lookup.evaluateEligibility(lookupBooking({ paymentStatus: 'PartiallyPaid', status: 'PartiallyPaid' }), lookupRequest);
  assert.equal(eligibility.canCheckIn, false);
  assert.equal(eligibility.reason, 'payment_required');
  assert.equal(eligibility.requiresStaff, true);
  assert.equal(eligibility.paymentState, 'partially_paid');
  assert.equal(eligibility.amountOwing, 0);
});

check('lookup: PartiallyPaid with a known amount owing keeps the same answer', () => {
  const eligibility = lookup.evaluateEligibility(lookupBooking({ amountOwing: 150, paymentStatus: 'PartiallyPaid', status: 'PartiallyPaid' }), lookupRequest);
  assert.equal(eligibility.reason, 'payment_required');
  assert.equal(eligibility.paymentState, 'partially_paid');
  assert.equal(eligibility.amountOwing, 150);
});

check('lookup: PendingPayment and Unpaid are payment_required with their own state', () => {
  const pending = lookup.evaluateEligibility(lookupBooking({ paymentStatus: 'PendingPayment', status: 'PendingPayment' }), lookupRequest);
  assert.equal(pending.reason, 'payment_required');
  assert.equal(pending.paymentState, 'pending');
  const unpaid = lookup.evaluateEligibility(lookupBooking({ paymentStatus: 'Unpaid', status: 'Unpaid' }), lookupRequest);
  assert.equal(unpaid.reason, 'payment_required');
  assert.equal(unpaid.paymentState, 'unpaid');
});

check('lookup: Paid with an amount still owing is payment_required (amount evidence)', () => {
  const eligibility = lookup.evaluateEligibility(lookupBooking({ amountOwing: 99 }), lookupRequest);
  assert.equal(eligibility.reason, 'payment_required');
  assert.equal(eligibility.paymentState, 'unpaid');
});

check('lookup: Paid and NoPaymentRequired stay ready and report paymentState paid', () => {
  for (const status of ['Paid', 'NoPaymentRequired']) {
    const eligibility = lookup.evaluateEligibility(lookupBooking({ paymentStatus: status, status }), lookupRequest);
    assert.equal(eligibility.canCheckIn, true, `${status} should be ready`);
    assert.equal(eligibility.reason, 'ready');
    assert.equal(eligibility.paymentState, 'paid');
  }
});

check('lookup: wrong date still wins before the payment decision', () => {
  const eligibility = lookup.evaluateEligibility(lookupBooking({ paymentStatus: 'PartiallyPaid', status: 'PartiallyPaid' }), { expectedDate: '2026-09-04', ticketIds: [] });
  assert.equal(eligibility.reason, 'wrong_date');
});

check('lookup: isPaymentSettled needs an explicit paid status, never a zero or missing amount alone', () => {
  assert.equal(lookup.isPaymentSettled(lookupBooking()), true);
  assert.equal(lookup.isPaymentSettled(lookupBooking({ amountOwing: 0, paymentStatus: 'Confirmed', status: 'Confirmed' })), false);
  assert.equal(lookup.isPaymentSettled(lookupBooking({ paymentStatus: 'PartiallyPaid', status: 'PartiallyPaid' })), false);
  assert.equal(lookup.isPaymentSettled(lookupBooking({ amountOwing: 10 })), false);
  assert.equal(lookup.isUnsettledPaymentState('partially_paid'), true);
  assert.equal(lookup.isUnsettledPaymentState('unknown'), false);
});

// --- 4. Session start and staff redeem gates apply the same rule -------------------------------
function gateContext(overrides = {}) {
  return {
    booking: {
      amountOwingCents: null,
      bookingDate: VISIT_DATE,
      bookingReference: '5100001',
      bookingStatus: 'Paid',
      freshnessStatus: 'fresh',
      isTombstoned: false,
      paymentStatus: 'Paid',
      rollerUniqueId: 'roller-unique-1',
      ...overrides,
    },
    tickets: [
      { bookingDate: VISIT_DATE, redeemStatus: 'Unredeemed', ticketId: 't1', ticketProductType: 'Entry' },
      { bookingDate: VISIT_DATE, redeemStatus: 'Unredeemed', ticketId: 't2', ticketProductType: 'Entry' },
    ],
  };
}

const gateRequest = { expectedDate: VISIT_DATE, ticketIds: [] };

for (const [name, internals, evaluate] of [
  ['session', session, (context) => session.evaluateStartContext(context, gateRequest)],
  ['redeem', redeem, (context) => redeem.evaluateRedeemContext(context, gateRequest)],
]) {
  check(`${name}: isPaymentComplete rejects PartiallyPaid and Unpaid even without an amount owing`, () => {
    const complete = (paymentStatus, amountOwingCents) =>
      internals.isPaymentComplete({ amountOwingCents, bookingStatus: paymentStatus, paymentStatus });
    assert.equal(complete('PartiallyPaid', null), false);
    assert.equal(complete('PartiallyPaid', 0), false);
    assert.equal(complete('Unpaid', null), false);
    assert.equal(complete('PendingPayment', null), false);
    assert.equal(complete('Paid', 500), false);
    assert.equal(complete('Confirmed', null), false);
    assert.equal(complete('Paid', null), true);
    assert.equal(complete('NoPaymentRequired', null), true);
    assert.equal(complete('Confirmed', 0), true);
  });

  check(`${name}: a fresh, active PartiallyPaid booking is blocked with payment_required`, () => {
    const decision = evaluate(gateContext({ bookingStatus: 'PartiallyPaid', paymentStatus: 'PartiallyPaid' }));
    assert.equal(decision.reason, 'payment_required', JSON.stringify(decision));
  });

  check(`${name}: the same booking marked Paid passes the payment gate`, () => {
    const decision = evaluate(gateContext());
    assert.notEqual(decision.reason, 'payment_required', JSON.stringify(decision));
  });
}

// --- 5. Source contracts: phone, contract and package wiring -----------------------------------
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

check('phone: lookup client carries paymentState and never trusts local heuristics for an unsettled state', () => {
  const client = read('jumpyard-checkin-phone/src/flow/cloudClient.ts');
  assert.ok(client.includes('paymentState?: string;'), 'eligibility type lacks paymentState');
  assert.ok(client.includes('body.eligibility.paymentState'), 'lookupBooking does not pass paymentState');
  assert.ok(client.includes("normalizedPaymentState !== 'paid' && normalizedPaymentState !== 'unknown'"), 'paid override missing');
  const types = read('jumpyard-checkin-phone/src/flow/types.ts');
  assert.ok(types.includes("export type BookingPaymentState = 'paid' | 'partially_paid' | 'pending' | 'unpaid' | 'unknown';"));
});

check('phone: booking summary sends a partially paid booking to the register in both languages', () => {
  const summary = read('jumpyard-checkin-phone/src/components/BookingSummary.tsx');
  assert.ok(summary.includes("booking?.paymentState === 'partially_paid'"));
  assert.ok(summary.includes('t.booking.checkInAtRegisterHint'));
  assert.ok(summary.includes('t.booking.checkInAtRegisterCta'));
  const language = read('jumpyard-checkin-phone/src/context/LanguageContext.tsx');
  assert.ok(language.includes("checkInAtRegisterHint: 'Den här bokningen behöver checkas in i kassan.'"));
  assert.ok(language.includes("checkInAtRegisterHint: 'This booking needs to be checked in at the register.'"));
  assert.ok(language.includes("partiallyPaid: 'Delvis betald'"));
  assert.ok(language.includes("partiallyPaid: 'Partially paid'"));
});

check('contract and package wiring document the exact rule', () => {
  const contract = read('JUMPYARD_CLOUD_CONTRACT.md');
  assert.ok(contract.includes('paymentState'), 'contract lacks paymentState');
  assert.ok(contract.includes('PartiallyPaid'), 'contract lacks the PartiallyPaid rule');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['validate:gh338-exact-payment-status'], 'node scripts/validate-gh338-exact-payment-status.js');
  assert.ok(pkg.scripts.validate.includes('npm run validate:gh338-exact-payment-status'), 'validate chain lacks GH-338');
});

if (failures.length > 0) {
  console.error(`GH-338 exact payment status validation failed (${failures.length} failure(s)).`);
  process.exit(1);
}
console.log('GH-338 exact payment status validation passed.');
