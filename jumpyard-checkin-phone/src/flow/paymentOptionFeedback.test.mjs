import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { getPaymentOptionInputState } from './paymentOptionFeedback.ts';

const summary = (amount = 200, errors = []) => ({
  requestedCount: 1, appliedCount: amount > 0 ? 1 : 0, totalApplied: amount, applied: [], errors,
});
const quote = (amount = 200, errors = [], kind = 'discountCodes') => ({
  costs: { total: 200 - amount, amountOwing: 200 - amount, discount: kind === 'discountCodes' ? amount : 0 },
  [kind]: summary(amount, errors),
});

for (const kind of ['discountCodes', 'giftCards']) {
  test(`${kind}: empty and newly entered values have no acceptance without quote evidence`, () => {
    assert.equal(getPaymentOptionInputState('', summary(), 200), 'empty');
    assert.equal(getPaymentOptionInputState('  ', summary(), 200), 'empty');
    assert.equal(getPaymentOptionInputState('synthetic-code', undefined, null), 'ready');
    assert.equal(getPaymentOptionInputState('synthetic-code', { ...summary(), requestedCount: 0 }, 200), 'ready');
  });

  test(`${kind}: only positive finite application is accepted; errors override amounts`, () => {
    for (const amount of [null, 0, -1, NaN, Infinity]) {
      assert.equal(getPaymentOptionInputState('synthetic-code', summary(amount), amount), 'ready');
    }
    for (const amount of [25, 100, 200]) {
      assert.equal(getPaymentOptionInputState('synthetic-code', summary(amount), amount), 'applied');
    }
    assert.equal(getPaymentOptionInputState('synthetic-code', summary(200, [{ code: 'rejected' }]), 200), 'rejected');
  });
}

// Execute the real component handlers with synthetic state/provider functions.
// No network, provider writes or duplicate implementation of the handlers.
const source = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('BuyTickets.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name) {
  let result;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) {
      result = ts.isFunctionDeclaration(node) ? node.getText(ast) : `const ${name} = ${node.initializer.getText(ast)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `Missing actual handler ${name}`);
  return result;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness({ provider = async () => quote(), draftAmount = 0 } = {}) {
  const events = [];
  const state = {
    useCallback: fn => fn,
    PAYMENT_OPTION_CODE_MAX_LENGTH: 32,
    quoteRequestVersionRef: { current: 0 },
    appliedQuoteRef: { current: null },
    quoteOperationInFlightRef: { current: false },
    paymentInputsHaveValues: true,
    setApplyingCodes: value => { state.applyingCodes = value; },
    quote: null, draft: null, submitting: false, step: 'CONTACT',
    selectedProduct: { productId: '1', startTime: '15:00' },
    customerValid: true, paymentInputsBlockingErrors: false,
    needsSkyRiderConsent: () => false,
    giftCardInputs: [], discountCodeInputs: [{ code: 'synthetic-code' }],
    basketLines: [{ key: 'entry', qty: 1 }],
    shouldPrecheckBasketAvailability: true,
    buildCustomer: () => ({ email: 'test@example.invalid' }),
    buildItems: () => [{ productId: 1, quantity: 1 }],
    productLabels: new Map(), t: { buy: { paymentOptionsUpdateRequired: 'fix-code', draftFailed: 'request-failed' } },
    formatBuyFlowError: () => 'request-failed',
    setQuote: value => { state.quote = value; events.push(['quote', value]); },
    setDraft: value => { state.draft = value; events.push(['draft', value]); },
    setSubmitting: value => { state.submitting = value; },
    setSubmitError: value => { state.error = value; },
    setStep: value => { state.step = value; },
    giftCardNumber: '', clipCardCode: '', paymentOptionType: 'discount',
    setGiftCardNumber: value => { state.giftCardNumber = value; },
    setClipCardCode: value => { state.clipCardCode = value; },
    setPaymentOptionType: value => { state.paymentOptionType = value; },
    codeRejectedDialogOpen: false,
    setCodeRejectedDialogOpen: value => { state.codeRejectedDialogOpen = value; },
    clearPaymentSyncState: () => {},
    quoteNewBooking: async (...args) => { events.push(['request', args]); return provider(...args); },
    createDraftBooking: async (...args) => {
      events.push(['create', args]);
      return { draft: { costs: { amountOwing: draftAmount } }, prepayment: { amountOwing: draftAmount } };
    },
    canStartPayment: () => true,
    resolvePaidDraftBooking: result => events.push(['resolve', result]),
    backNavigationLocked: false,
  };
  const names = ['invalidateQuote', 'clampPaymentOptionCode', 'updateClipCardCode', 'updateGiftCardNumber',
    'updatePaymentOptionValue', 'removePaymentOption', 'selectPaymentOptionType', 'continueWithoutCode', 'editRejectedCode',
    'updateContact', 'hasPaymentOptionQuoteErrors', 'getDraftAmountOwing', 'applyPaymentOptions', 'createDraft', 'backFromStep'];
  const code = names.map(declaration).join('\n') + `\nglobalThis.handlers = {${names.join(',')}};`;
  vm.runInContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, vm.createContext(state));
  return { state, events, ...state.handlers };
}

for (const kind of ['discountCodes', 'giftCards']) {
  for (const amount of [100, 200]) {
    test(`Apply then Continue: ${kind} ${amount} keeps its accepted quote and makes one draft`, async () => {
      const host = harness({ provider: async () => quote(amount, [], kind), draftAmount: 200 - amount });
      if (kind === 'giftCards') {
        host.state.giftCardInputs = [{ giftCardNumber: 'synthetic-gift' }];
        host.state.discountCodeInputs = [];
      }
      await host.applyPaymentOptions();
      const accepted = host.state.quote;
      const eventCount = host.events.length;
      await host.createDraft();
      assert.equal(host.events.filter(([type]) => type === 'request').length, 1);
      assert.equal(host.events.filter(([type]) => type === 'create').length, 1);
      assert.equal(host.state.quote, accepted);
      assert.ok(host.events.slice(eventCount).every(([type, value]) => type !== 'quote' || value === accepted),
        'accepted feedback and discounted total never clear during Continue');
      const create = host.events.find(([type]) => type === 'create')[1];
      assert.equal(create[4], host.state.giftCardInputs);
      assert.equal(create[5], host.state.discountCodeInputs);
      assert.equal(host.state.step, amount === 200 ? 'PENDING' : 'PAYMENT');
    });
  }
}

for (const change of ['updateClipCardCode', 'updateGiftCardNumber', 'contact', 'basket', 'back', 'type', 'remove']) {
  test(`Continue requotes after an applied quote is invalidated by ${change}`, async () => {
    const host = harness({ draftAmount: 100 });
    await host.applyPaymentOptions();
    if (change === 'contact') host.updateContact(() => {}, 'changed@example.invalid');
    else if (change === 'basket') host.invalidateQuote();
    else if (change === 'back') host.backFromStep();
    else if (change === 'type') host.selectPaymentOptionType('giftCard');
    else if (change === 'remove') host.removePaymentOption();
    else host[change]('synthetic-new');
    assert.equal(host.state.quote, null);
    assert.equal(host.state.appliedQuoteRef.current, null);
    await host.createDraft();
    assert.equal(host.events.filter(([type]) => type === 'request').length, 2);
    assert.equal(host.events.filter(([type]) => type === 'create').length, 1);
  });
}

for (const expiresAt of [null, new Date(Date.now() + 86400000).toISOString(), '2000-01-01T00:00:00Z', 'invalid']) {
  test(`Continue only reuses an Apply quote within its supplied expiry: ${expiresAt}`, async () => {
    const host = harness({ provider: async () => ({ ...quote(100), expiresAt }), draftAmount: 100 });
    await host.applyPaymentOptions();
    await host.createDraft();
    const reusable = expiresAt === null || Date.parse(expiresAt) > Date.now();
    assert.equal(host.events.filter(([type]) => type === 'request').length, reusable ? 1 : 2);
    assert.equal(host.events.filter(([type]) => type === 'create').length, 1);
  });
}

test('rejected Apply cannot become a reusable quote or bypass the rejection decision', async () => {
  const host = harness({ provider: async () => quote(0, [{ code: 'synthetic-invalid' }]) });
  await host.applyPaymentOptions();
  assert.equal(host.state.appliedQuoteRef.current, null);
  host.state.paymentInputsBlockingErrors = true; // Derived by the next React render.
  await host.createDraft();
  assert.equal(host.state.codeRejectedDialogOpen, true);
  assert.equal(host.events.filter(([type]) => type === 'request').length, 1);
  assert.equal(host.events.filter(([type]) => type === 'create').length, 0);
});

test('Continue reusing Apply still locks concurrent actions and obeys the final draft amount', async () => {
  const host = harness({ provider: async () => quote(200) });
  await host.applyPaymentOptions();
  const accepted = host.state.quote;
  const pending = deferred();
  host.state.createDraftBooking = async (...args) => {
    host.events.push(['create', args]);
    return pending.promise;
  };
  host.state.setSubmitting = () => {}; // Before React rerenders, only the ref can guard.
  const checkout = host.createDraft();
  assert.equal(host.state.quote, accepted);
  await host.createDraft();
  await host.applyPaymentOptions();
  assert.equal(host.events.filter(([type]) => type === 'request').length, 1);
  assert.equal(host.events.filter(([type]) => type === 'create').length, 1);
  pending.resolve({ draft: { costs: { amountOwing: 100 } }, prepayment: { amountOwing: 100 } });
  await checkout;
  assert.equal(host.state.step, 'PAYMENT', 'draft amount remains authoritative even if the earlier quote was free');
  assert.equal(host.events.filter(([type]) => type === 'resolve').length, 0);
  assert.equal(host.state.quoteOperationInFlightRef.current, false);
});

for (const update of ['updateClipCardCode', 'updateGiftCardNumber']) {
  test(`${update}: initial entry, editing and removal discard previous totals and feedback`, () => {
    const host = harness();
    host[update]('synthetic-first');
    assert.equal(host.state.quote, null);
    host.state.quote = quote();
    host[update]('synthetic-second');
    assert.equal(host.state.quote, null);
    host.state.quote = quote();
    host[update]('');
    assert.equal(host.state.quote, null);
    assert.equal(host.state.quoteRequestVersionRef.current, 3);
  });
}

for (const kind of ['discountCodes', 'giftCards']) {
  test(`${kind}: quote rejection never creates a draft`, async () => {
    const host = harness({ provider: async () => quote(0, [{ code: 'synthetic-rejection' }], kind) });
    await host.createDraft();
    assert.equal(host.state.codeRejectedDialogOpen, true, 'Continue offers to proceed without the code');
    assert.equal(host.state.error, null);
    assert.equal(host.state.quote[kind].errors.length, 1);
    assert.equal(host.events.filter(([type]) => type === 'create').length, 0);
    assert.equal(host.state.submitting, false);
  });
}

for (const amount of [0, 100, 200]) {
  test(`verified discount ${amount}: preserves exactly one draft and the existing paid/free continuation`, async () => {
    const host = harness({ provider: async () => quote(amount), draftAmount: 200 - amount });
    if (amount === 0) host.state.discountCodeInputs = [];
    await host.createDraft();
    assert.equal(host.events.filter(([type]) => type === 'request').length, 1);
    assert.equal(host.events.filter(([type]) => type === 'create').length, 1);
    assert.equal(host.state.step, amount === 200 ? 'PENDING' : 'PAYMENT');
    assert.equal(host.events.filter(([type]) => type === 'resolve').length, amount === 200 ? 1 : 0);
  });
}

test('gift-card and discount values remain separate and unchanged through quote and draft', async () => {
  const host = harness({ draftAmount: 100 });
  host.state.discountCodeInputs = [{ code: '!%SYNTHETIC!%' }];
  host.state.giftCardInputs = [{ giftCardNumber: 'synthetic-gift' }];
  await host.createDraft();
  const request = host.events.find(([type]) => type === 'request')[1];
  const create = host.events.find(([type]) => type === 'create')[1];
  assert.equal(request[3], host.state.giftCardInputs);
  assert.equal(request[4], host.state.discountCodeInputs);
  assert.equal(create[4], host.state.giftCardInputs);
  assert.equal(create[5], host.state.discountCodeInputs);
});

for (const change of ['updateClipCardCode', 'updateGiftCardNumber', 'contact', 'basket', 'back']) {
  test(`a late quote after ${change} cannot restore feedback or create an old draft`, async () => {
    const pending = deferred();
    const host = harness({ provider: () => pending.promise });
    host.state.quote = quote(100);
    const running = host.createDraft();
    assert.equal(host.state.quote, null, 'previous acceptance is cleared before rechecking');
    if (change === 'contact') host.updateContact(() => {}, 'changed@example.invalid');
    else if (change === 'basket') host.invalidateQuote();
    else if (change === 'back') host.backFromStep();
    else host[change]('synthetic-new');
    pending.resolve(quote());
    await running;
    assert.equal(host.state.quote, null);
    assert.equal(host.events.filter(([type]) => type === 'create').length, 0);
    assert.equal(host.state.submitting, false);
  });
}

test('failed quotes leave no previous acceptance and stale failures cannot overwrite edited input', async () => {
  for (const editWhilePending of [false, true]) {
    const pending = deferred();
    const host = harness({ provider: () => pending.promise });
    host.state.quote = quote();
    const running = host.createDraft();
    if (editWhilePending) host.updateClipCardCode('synthetic-new');
    pending.reject(new Error('synthetic-network-failure'));
    await running;
    assert.equal(host.state.quote, null);
    assert.equal(host.state.error, editWhilePending ? null : 'request-failed');
    assert.equal(host.events.filter(([type]) => type === 'create').length, 0);
  }
});

for (const kind of ['discountCodes', 'giftCards']) {
  for (const amount of [100, 200]) {
    test(`Apply ${kind} ${amount}: updates quote on Contact without booking or payment`, async () => {
      const host = harness({ provider: async () => quote(amount, [], kind) });
      await host.applyPaymentOptions();
      assert.equal(host.state.quote.costs.amountOwing, 200 - amount);
      assert.equal(host.state.step, 'CONTACT');
      assert.equal(host.state.draft, null);
      assert.equal(host.events.filter(([type]) => ['create', 'resolve'].includes(type)).length, 0);
      assert.equal(host.state.applyingCodes, false);
    });
  }
}

test('Apply synchronously prevents duplicate requests and simultaneous Continue', async () => {
  const pending = deferred();
  const host = harness({ provider: () => pending.promise });
  const applying = host.applyPaymentOptions();
  await host.applyPaymentOptions();
  await host.createDraft();
  assert.equal(host.events.filter(([type]) => type === 'request').length, 1);
  assert.equal(host.state.applyingCodes, true);
  pending.resolve(quote());
  await applying;
  assert.equal(host.state.quoteOperationInFlightRef.current, false);
  await host.createDraft();
  assert.equal(host.events.filter(([type]) => type === 'request').length, 1, 'Continue reuses the completed Apply');
  assert.equal(host.events.filter(([type]) => type === 'create').length, 1);
});

for (const change of ['updateClipCardCode', 'updateGiftCardNumber', 'contact', 'basket', 'back']) {
  test(`Apply ignores a late response after ${change}`, async () => {
    const pending = deferred();
    const host = harness({ provider: () => pending.promise });
    const applying = host.applyPaymentOptions();
    if (change === 'contact') host.updateContact(() => {}, 'changed@example.invalid');
    else if (change === 'basket') host.invalidateQuote();
    else if (change === 'back') host.backFromStep();
    else host[change]('synthetic-changed');
    pending.resolve(quote());
    await applying;
    assert.equal(host.state.quote, null);
    assert.equal(host.state.applyingCodes, false);
    assert.equal(host.events.filter(([type]) => type === 'create').length, 0);
  });
}

test('Apply rejects bad codes, handles request failure and can retry', async () => {
  let call = 0;
  const host = harness({ provider: async () => {
    call += 1;
    if (call === 1) return quote(0, [{ code: 'synthetic-invalid' }]);
    if (call === 2) throw new Error('synthetic-network-error');
    return quote();
  } });
  await host.applyPaymentOptions();
  assert.equal(host.state.error, null, 'rejection is shown inline from the quote, not as a submit error');
  assert.equal(host.state.quote.discountCodes.errors.length, 1);
  await host.applyPaymentOptions();
  assert.equal(host.state.quote, null);
  assert.equal(host.state.error, 'request-failed');
  await host.applyPaymentOptions();
  assert.equal(host.state.error, null);
  assert.equal(host.state.quote.costs.amountOwing, 0);
  assert.equal(host.state.step, 'CONTACT');
});

test('Apply requires valid contact and code values and stays blocked during draft preparation', async () => {
  for (const overrides of [{customerValid:false}, {paymentInputsHaveValues:false}, {submitting:true}, {draft:{}}]) {
    const host = harness();
    Object.assign(host.state, overrides);
    await host.applyPaymentOptions();
    assert.equal(host.events.length, 0);
  }
});

test('Continue synchronously locks Apply and a second Continue before React rerenders', async () => {
  const pending = deferred();
  const host = harness({ provider: () => pending.promise });
  host.state.setSubmitting = () => {}; // Model the render still seeing submitting=false.
  const checkout = host.createDraft();
  await host.applyPaymentOptions();
  await host.createDraft();
  assert.equal(host.events.filter(([type]) => type === 'request').length, 1);
  pending.resolve(quote());
  await checkout;
  assert.equal(host.events.filter(([type]) => type === 'create').length, 1);
  assert.equal(host.state.quoteOperationInFlightRef.current, false);
});

test('one code type at a time: entering one code clears the other', () => {
  const host = harness();
  host.updateClipCardCode('synthetic-code');
  assert.equal(host.state.clipCardCode, 'synthetic-code');
  host.updateGiftCardNumber('synthetic-gift');
  assert.equal(host.state.giftCardNumber, 'synthetic-gift');
  assert.equal(host.state.clipCardCode, '');
  host.updateClipCardCode('synthetic-again');
  assert.equal(host.state.giftCardNumber, '');
  assert.equal(host.state.clipCardCode, 'synthetic-again');
});

test('selecting the other code type clears the entered code and previous quote', () => {
  const host = harness();
  host.state.quote = quote();
  host.state.clipCardCode = 'synthetic-code';
  host.selectPaymentOptionType('giftCard');
  assert.equal(host.state.paymentOptionType, 'giftCard');
  assert.equal(host.state.clipCardCode, '');
  assert.equal(host.state.giftCardNumber, '');
  assert.equal(host.state.quote, null);
  assert.equal(host.state.quoteRequestVersionRef.current, 1);
  host.selectPaymentOptionType('giftCard');
  assert.equal(host.state.quoteRequestVersionRef.current, 1, 'reselecting the active type changes nothing');
  host.state.paymentInputsHaveValues = false;
  host.selectPaymentOptionType('discount');
  assert.equal(host.state.paymentOptionType, 'discount');
  assert.equal(host.state.quoteRequestVersionRef.current, 1, 'switching without a code needs no new quote');
});

test('removing the applied code clears the active field and its quote', () => {
  const host = harness();
  host.state.paymentOptionType = 'giftCard';
  host.state.quote = quote(100, [], 'giftCards');
  host.removePaymentOption();
  assert.equal(host.state.giftCardNumber, '');
  assert.equal(host.state.quote, null);
});

test('member codes travel through the discount-code field and clear a gift card', () => {
  const host = harness();
  host.state.giftCardNumber = 'synthetic-gift';
  host.state.paymentOptionType = 'member';
  host.updatePaymentOptionValue('synthetic-member');
  assert.equal(host.state.clipCardCode, 'synthetic-member');
  assert.equal(host.state.giftCardNumber, '');
  assert.equal(host.state.quote, null);
});

test('Continue with an already rejected code asks before continuing, without a new quote', async () => {
  const host = harness();
  host.state.paymentInputsBlockingErrors = true;
  await host.createDraft();
  assert.equal(host.state.codeRejectedDialogOpen, true);
  assert.equal(host.events.filter(([type]) => type === 'request').length, 0);
  assert.equal(host.events.filter(([type]) => type === 'create').length, 0);
});

test('continuing without the code clears it and books at the regular price', async () => {
  const host = harness({ provider: async () => quote(0), draftAmount: 200 });
  host.state.clipCardCode = 'synthetic-bad';
  host.state.paymentInputsBlockingErrors = true;
  host.state.codeRejectedDialogOpen = true;
  await host.continueWithoutCode();
  assert.equal(host.state.codeRejectedDialogOpen, false);
  assert.equal(host.state.clipCardCode, '');
  const request = host.events.find(([type]) => type === 'request')[1];
  const create = host.events.find(([type]) => type === 'create')[1];
  // Arrays come from the vm realm, so compare shape rather than prototype identity.
  for (const codes of [request[3], request[4], create[4], create[5]]) assert.equal(codes.length, 0);
  assert.equal(host.state.step, 'PAYMENT');
});

test('editing the rejected code closes the dialog and keeps the code', () => {
  const host = harness();
  host.state.clipCardCode = 'synthetic-bad';
  host.state.codeRejectedDialogOpen = true;
  host.editRejectedCode();
  assert.equal(host.state.codeRejectedDialogOpen, false);
  assert.equal(host.state.clipCardCode, 'synthetic-bad');
});
