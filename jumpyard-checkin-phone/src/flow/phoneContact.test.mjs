import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

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

test('new checkout needs a phone and sends the entered number', () => {
  for (const [firstName, lastName, email, phone, valid] of [
    ['Guest', 'Test', 'guest@example.invalid', '0701234567', true],
    ['Guest', 'Test', 'guest@example.invalid', '+44 7700 900123', true],
    ['Guest', 'Test', 'guest@example.invalid', '', false],
    ['Guest', 'Test', 'guest@example.invalid', '123', false],
    ['', 'Test', 'guest@example.invalid', '0701234567', false],
    ['Guest', '', 'guest@example.invalid', '0701234567', false],
    ['Guest', 'Test', 'invalid', '0701234567', false],
  ]) {
    const h = load('../components/BuyTickets.tsx', ['isValidEmail', 'isValidPhone', 'customerValid', 'buildCustomer'], {
      firstName, lastName, email, phone,
    });
    assert.equal(h.customerValid, valid);
    assert.equal(h.buildCustomer().phone, phone);
    assert.equal(h.buildCustomer().email, email);
  }
});

test('unsubmitted no-phone recovery needs contact entry; entered phone survives recovery', () => {
  const h = load('../components/BuyTickets.tsx', ['isValidEmail', 'isValidPhone', 'isValidRecoveredCustomer', 'toRecoveredCustomer', 'getSafeContact']);
  const fresh = h.getSafeContact({ firstName: 'Guest', lastName: 'Test', email: 'guest@example.invalid' });
  assert.equal(h.isValidRecoveredCustomer(fresh), false);
  const legacy = h.getSafeContact({ ...fresh, phone: '+46701234567' });
  assert.equal(h.isValidRecoveredCustomer(legacy), true);
  assert.equal(h.toRecoveredCustomer(legacy).phone, '+46701234567');
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
