import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { hasSavedContactDetails, isContactReady, toNewBookingCustomer } from './contactDetails.ts';

function load(relative, names, globals = {}) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node)) && names.includes(node.name?.getText(ast))) {
      declarations.set(node.name.getText(ast), ts.isVariableDeclaration(node)
        ? `const ${node.name.getText(ast)} = ${node.initializer.getText(ast)};`
        : node.getText(ast).replace(/^export /, ''));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) assert.ok(declarations.has(name), name);
  const output = ts.transpileModule([...declarations.values()].join('\n') + `\nresult = {${names.join(',')}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const host = { ...globals };
  vm.runInNewContext(output, host);
  return host.result;
}

// GH-473/D0234: first name and email by default; all four fields once Cloud asks for them.
test('email-first checkout needs first name and email; the fallback needs last name and phone too', () => {
  for (const [firstName, lastName, email, phone, detailsRequired, valid] of [
    ['Guest', '', 'guest@example.invalid', '', false, true],
    ['', '', 'guest@example.invalid', '', false, false],
    ['Guest', '', 'invalid', '', false, false],
    ['Guest', 'Test', 'guest@example.invalid', '0701740605', true, true],
    ['Guest', 'Test', 'guest@example.invalid', '+44 7700 900123', true, true],
    ['Guest', 'Test', 'guest@example.invalid', '', true, false],
    ['Guest', 'Test', 'guest@example.invalid', '123', true, false],
    ['Guest', '', 'guest@example.invalid', '0701740605', true, false],
    ['', 'Test', 'guest@example.invalid', '0701740605', true, false],
    ['Guest', 'Test', 'invalid', '0701740605', true, false],
  ]) {
    const h = load('../components/BuyTickets.tsx', ['customerValid', 'buildCustomer'], {
      firstName, lastName, email, phone, contactDetailsRequired: detailsRequired, isContactReady, toNewBookingCustomer,
    });
    assert.equal(h.customerValid, valid, JSON.stringify([firstName, lastName, email, phone, detailsRequired]));
    const customer = JSON.parse(JSON.stringify(h.buildCustomer()));
    assert.deepEqual(customer, detailsRequired
      ? { firstName: firstName.trim(), email: email.trim(), lastName: lastName.trim(), phone: phone.trim() }
      : { firstName: firstName.trim(), email: email.trim() }, 'email-first never sends an invented last name or phone');
  }
});

test('a saved email-first purchase is valid; a started four-field contact still needs both fields', () => {
  const h = load('../components/BuyTickets.tsx', ['isValidRecoveredCustomer', 'toRecoveredCustomer', 'getSafeContact'], {
    isContactReady, hasSavedContactDetails, toNewBookingCustomer,
  });
  const emailFirst = h.getSafeContact({ firstName: 'Guest', email: 'guest@example.invalid' });
  assert.equal(h.isValidRecoveredCustomer(emailFirst), true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.toRecoveredCustomer(emailFirst))), { firstName: 'Guest', email: 'guest@example.invalid' });
  const lastNameOnly = h.getSafeContact({ ...emailFirst, lastName: 'Test' });
  assert.equal(h.isValidRecoveredCustomer(lastNameOnly), false);
  const complete = h.getSafeContact({ ...lastNameOnly, phone: '+46701740605' });
  assert.equal(h.isValidRecoveredCustomer(complete), true);
  assert.equal(h.toRecoveredCustomer(complete).phone, '+46701740605');
  assert.equal(h.toRecoveredCustomer(complete).lastName, 'Test');
});

test('an existing draft resumes its payment without requiring a new phone or creating another draft', async () => {
  const steps = [];
  const draft = { draft: { uniqueId: 'existing-draft' }, prepayment: { paymentAttemptId: 'existing-attempt' } };
  const h = load('../components/BuyTickets.tsx', ['createDraft'], {
    draft, customerValid: false, phone: '',
    setStep: step => steps.push(step),
    createNewBookingDraft: () => { throw new Error('Must not create a replacement draft'); },
  });
  await h.createDraft();
  assert.deepEqual(steps, ['PAYMENT']);
  assert.equal(draft.draft.uniqueId, 'existing-draft');
  assert.equal(draft.prepayment.paymentAttemptId, 'existing-attempt');
});

test('phone searches produce a guest-facing error before any request', async () => {
  let calls = 0;
  const h = load('./cloudClient.ts', ['CloudLookupError', 'isLikelyPhoneIdentifier', 'inferIdentifierType', 'lookupBooking'], {
    fetch: async () => { calls++; throw new Error('Unexpected fetch'); },
  });
  for (const value of ['0700000000', '070 00 00 00 0', '+46700000000', '0046700000000', '46700000000', '0701234567', '+1 (202) 555-0123']) {
    await assert.rejects(h.lookupBooking(value), e => e.reason === 'phone_lookup_disabled');
  }
  assert.equal(calls, 0);
  assert.equal(h.inferIdentifierType('166797742'), 'bookingReference');
  assert.equal(h.inferIdentifierType('guest@example.invalid'), 'email');
  assert.equal(h.inferIdentifierType('68b3bbb4-9a46-4379-96ac-bc7157f2fb3e'), 'rollerUniqueId');
});

test('both languages retain booking/email lookup and restore a labelled phone input', () => {
  const text = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /bokningsnummer, mejl eller telefonnummer|booking number, email, or phone|namn, telefon eller e-post|Name, phone, or email/);
  assert.equal((text.match(/phoneLookupDisabledDesc:/g) || []).length, 2);
  assert.equal((text.match(/phoneLabel:/g) || []).length, 2);
  const component = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  assert.match(component, /type="tel"/);
  assert.match(component, /autoComplete="tel"/);
});

test('#448: the Contact button reads as busy, not disabled, while the booking is created', () => {
  const buy = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  assert.match(buy, /data-testid="buy-contact-continue"\s+disabled=\{!customerValid \|\| submitting \|\| applyingCodes\}\s+aria-busy=\{submitting\}/);
  assert.match(buy, /\$\{submitting \? 'cursor-wait' : 'disabled:opacity-40 disabled:cursor-not-allowed'\}/);
  assert.match(buy, /\{submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" \/>\}/);
});

// GH-473: the real Continue handler with synthetic Cloud answers. Only network and React setters are stubbed.
function draftHarness(answers) {
  const source = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('BuyTickets.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  (function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
      && ['invalidateQuote', 'hasPaymentOptionQuoteErrors', 'getDraftAmountOwing', 'createDraft'].includes(node.name?.getText(ast))) {
      declarations.push(ts.isFunctionDeclaration(node) ? node.getText(ast) : `const ${node.name.getText(ast)} = ${node.initializer.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  })(ast);
  assert.equal(declarations.length, 4);
  const calls = [];
  const state = {
    contact: { firstName: 'Guest', lastName: '', email: 'guest@example.invalid', phone: '' },
    contactDetailsRequired: false,
    contactDetailsAsked: false,
    useCallback: fn => fn,
    pendingEmailMarketingConsent: () => undefined, emailMarketingChecked: false, lang: 'sv',
    // #458: no safety approval travels with these drafts.
    draftSafetyAttestation: undefined,
    quoteRequestVersionRef: { current: 0 }, appliedQuoteRef: { current: null }, quoteOperationInFlightRef: { current: false },
    contactDetailsFocusPendingRef: { current: false },
    draft: null, submitting: false, step: 'CONTACT', error: null, quote: null, codeRejectedDialogOpen: false,
    selectedProduct: { productId: '1189805', startTime: '17:00' },
    get customerValid() { return isContactReady(state.contact, state.contactDetailsRequired); },
    paymentInputsBlockingErrors: false, needsSkyRiderConsent: () => false,
    giftCardInputs: [], discountCodeInputs: [{ code: 'SYNTHETIC10' }], basketLines: [{ key: 'entry', qty: 2 }],
    shouldPrecheckBasketAvailability: true,
    buildCustomer: () => toNewBookingCustomer(state.contact, state.contactDetailsRequired),
    buildItems: () => [{ productId: 1189805, quantity: 2 }],
    productLabels: new Map(), t: { buy: { draftFailed: 'draft-failed' } },
    formatBuyFlowError: error => `formatted:${error.code}`,
    setQuote: value => { state.quote = value; }, setDraft: value => { state.draft = value; },
    setSubmitting: value => { state.submitting = value; }, setSubmitError: value => { state.error = value; },
    setStep: value => { state.step = value; }, setCodeRejectedDialogOpen: value => { state.codeRejectedDialogOpen = value; },
    setContactDetailsRequired: value => { state.contactDetailsRequired = value; },
    setContactDetailsAsked: value => { state.contactDetailsAsked = value; },
    clearPaymentSyncState: () => {},
    quoteNewBooking: async (...args) => { calls.push(['quote', JSON.parse(JSON.stringify(args[0]))]); return { costs: { total: 400, amountOwing: 400 } }; },
    createDraftBooking: async (...args) => {
      calls.push(['draft', JSON.parse(JSON.stringify(args[0])), args[4], args[5]]);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    },
    canStartPayment: () => true, resolvePaidDraftBooking: () => {},
  };
  const context = vm.createContext(state);
  vm.runInContext(ts.transpileModule(`${declarations.join('\n')}\nglobalThis.createDraft = createDraft;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return { state, calls };
}

function cloudError(code) {
  return Object.assign(new Error('synthetic cloud answer'), { code, httpStatus: 409 });
}

test('GH-473: contact_details_required reveals last name and phone, keeps email and codes, then sends all four', async () => {
  const draft = { draft: { costs: { amountOwing: 400 } }, prepayment: { amountOwing: 400 } };
  const { state, calls } = draftHarness([cloudError('contact_details_required'), draft]);
  await state.createDraft();
  assert.deepEqual(calls.map(([kind, customer]) => [kind, customer]), [
    ['quote', { firstName: 'Guest', email: 'guest@example.invalid' }],
    ['draft', { firstName: 'Guest', email: 'guest@example.invalid' }],
  ]);
  assert.equal(state.contactDetailsRequired, true);
  assert.equal(state.contactDetailsAsked, true, 'only Cloud\'s request shows the notice');
  assert.equal(state.contactDetailsFocusPendingRef.current, true, 'the revealed last name receives focus');
  assert.equal(state.error, null, 'no error text; the form asks for the fields instead');
  assert.equal(state.draft, null);
  assert.equal(state.step, 'CONTACT');
  assert.equal(state.submitting, false);
  assert.equal(state.contact.email, 'guest@example.invalid');
  assert.deepEqual(state.discountCodeInputs, [{ code: 'SYNTHETIC10' }]);

  await state.createDraft();
  assert.equal(calls.length, 2, 'Continue waits for last name and phone');
  state.contact = { ...state.contact, lastName: 'Test', phone: '070-174 06 05' };
  await state.createDraft();
  const [, customer, giftCards, discountCodes] = calls.at(-1);
  assert.deepEqual(customer, { firstName: 'Guest', email: 'guest@example.invalid', lastName: 'Test', phone: '070-174 06 05' });
  assert.deepEqual(giftCards, []);
  assert.deepEqual(discountCodes, [{ code: 'SYNTHETIC10' }]);
  assert.equal(state.draft, draft);
  assert.equal(state.step, 'PAYMENT');
});

test('GH-473: other draft failures keep today\'s error text and the email-first form', async () => {
  const { state } = draftHarness([cloudError('roller_draft_failed')]);
  await state.createDraft();
  assert.equal(state.error, 'formatted:roller_draft_failed');
  assert.equal(state.contactDetailsRequired, false);
  assert.equal(state.contactDetailsAsked, false);
  assert.equal(state.contactDetailsFocusPendingRef.current, false);
});

test('GH-473: a Cloud without #473 (customer_required) also gets the four-field form, once', async () => {
  const { state } = draftHarness([cloudError('customer_required'), cloudError('customer_required')]);
  await state.createDraft();
  assert.equal(state.contactDetailsRequired, true);
  assert.equal(state.error, null);
  state.contact = { ...state.contact, lastName: 'Test', phone: '070-174 06 05' };
  await state.createDraft();
  assert.equal(state.error, 'formatted:customer_required', 'with all four fields it is a real validation error');
});

test('GH-473: last name and phone render only after Cloud asks; both languages explain why', () => {
  const buy = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  // #491: the summary step is gone; safety follows the contact markup.
  const contactStart = buy.indexOf("{step === 'CONTACT' && selectedProduct && (");
  const contactStep = buy.slice(contactStart, buy.indexOf("{step === 'SAFETY' && (", contactStart));
  assert.ok(contactStart > 0 && contactStep.length > 0 && contactStep.length < 20_000, 'the contact step markup is found on its own');
  assert.match(contactStep, /\{contactDetailsRequired && \(\s*<label>[\s\S]*?ref=\{lastNameInputRef\}[\s\S]*?autoComplete="family-name"/);
  assert.match(contactStep, /\{contactDetailsRequired && \(\s*<label className="block">[\s\S]*?type="tel"[\s\S]*?autoComplete="tel"/);
  assert.match(contactStep, /autoComplete="given-name"/);
  assert.match(contactStep, /autoComplete="email"/);
  assert.match(contactStep, /\{contactDetailsRequired && contactDetailsAsked && \(\s*<div\s+role="status"\s+data-testid="buy-contact-details-required"[\s\S]*?t\.buy\.contactDetailsRequiredTitle[\s\S]*?t\.buy\.contactDetailsRequiredDesc/,
    'a restored four-field contact shows the fields without the notice');
  assert.match(contactStep, /<EmailMarketingOptIn/);
  const text = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  assert.match(text, /contactDetailsRequiredTitle: 'Vi behöver lite fler uppgifter'/);
  assert.match(text, /contactDetailsRequiredTitle: 'We need a little more information'/);
  assert.equal((text.match(/contactDetailsRequiredDesc:/g) || []).length, 2);
});

test('GH-473: quotes never carry a partial customer and the booking name never invents a last name', async () => {
  const requests = [];
  const h = load('./cloudClient.ts', [
    'DEFAULT_CLOUD_API_BASE_URL', 'CloudBookingError', 'getApiBaseUrl', 'getNewBookingName', 'getCompleteQuoteCustomer',
    'parseBookingResponse', 'createBookingError', 'quoteNewBooking', 'createDraftBooking',
  ], {
    process: { env: {} },
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      requests.push({ url, body });
      if (url.endsWith('/v1/bookings/quote')) return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'quoted', quote: { costs: {} } }) };
      if (body.customer.lastName) {
        return { ok: true, status: 201, text: async () => JSON.stringify({ status: 'draft_created', draft: { costs: {} }, paymentSession: { jwtPresent: false } }) };
      }
      return { ok: false, status: 409, text: async () => JSON.stringify({ status: 'blocked', error: { code: 'contact_details_required', message: 'Last name and phone are required to complete this purchase.' } }) };
    },
  });
  const emailFirst = { firstName: ' Guest ', email: 'guest@example.invalid' };
  const complete = { firstName: 'Guest', lastName: 'Test', email: 'guest@example.invalid', phone: '0701740605' };
  await h.quoteNewBooking(emailFirst, [], true);
  await h.quoteNewBooking(complete, [], true);
  assert.equal('customer' in requests[0].body, false, 'Cloud prices an email-first contact with its own quote customer');
  assert.equal(requests[0].body.name, 'Guest');
  assert.deepEqual(requests[1].body.customer, complete);
  assert.equal(requests[1].body.name, 'Guest Test');
  await assert.rejects(h.createDraftBooking(emailFirst, [], 'phone-draft:synthetic'),
    error => error.code === 'contact_details_required' && error.httpStatus === 409);
  assert.deepEqual(requests[2].body.customer, emailFirst);
  assert.equal(requests[2].body.name, 'Guest');
  assert.doesNotMatch(JSON.stringify(requests[2].body), /undefined|lastName|"phone"/);
  await h.createDraftBooking(complete, [], 'phone-draft:synthetic-2');
  assert.equal(requests[3].body.name, 'Guest Test');
  assert.equal(h.getNewBookingName({ firstName: '', email: 'guest@example.invalid' }), 'JumpYard booking');
});
