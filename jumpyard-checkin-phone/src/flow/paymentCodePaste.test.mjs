import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { classifyPaymentCode } from './paymentCodeShape.ts';
import { PASTED_CODE_CONTACT_SETTLE_MS, decidePastedCodeCheck, toPastedPaymentCode } from './paymentCodePaste.ts';

// #505 (D0250): "Klistra in" on the phone's contact step. Synthetic numbers in ROLLER's email shapes.
const GIFT_CARD = '4000123456';
const MEMBER = '178000001-602000001';
const paste = (raw, chosen = 'discount', max = 32) => toPastedPaymentCode(classifyPaymentCode(raw, chosen), max);
const plain = (value) => JSON.parse(JSON.stringify(value));

test('a paste takes the type its shape shows, whatever type is chosen, and the clean number', () => {
  for (const chosen of ['discount', 'member', 'giftCard']) {
    assert.deepEqual(paste(`#${GIFT_CARD}`, chosen), { kind: 'giftCard', value: GIFT_CARD, autoCheck: true });
    assert.deepEqual(paste(`#${MEMBER}`, chosen), { kind: 'member', value: MEMBER, autoCheck: true });
  }
  assert.deepEqual(paste(' #4000 123 456\n'), { kind: 'giftCard', value: GIFT_CARD, autoCheck: true });
  assert.deepEqual(paste('178000001–602000001'), { kind: 'member', value: MEMBER, autoCheck: true });
  // Anything else keeps the chosen type, Rabattkod by default.
  assert.deepEqual(paste('SOMMAR25'), { kind: 'discount', value: 'SOMMAR25', autoCheck: true });
  assert.deepEqual(paste('GC-12AB', 'giftCard'), { kind: 'giftCard', value: 'GC-12AB', autoCheck: true });
  assert.deepEqual(paste('123456789', 'member'), { kind: 'member', value: '123456789', autoCheck: true });
});

test('an empty paste, spaces or a lone "#" fill in nothing, so the long-press line shows', () => {
  for (const raw of ['', '   ', '#', '\n#\t']) assert.equal(paste(raw), null, JSON.stringify(raw));
});

test('text longer than the field is cut to its 32 characters and never checked automatically', () => {
  const long = paste('Ditt presentkort fran JumpYard har nummer');
  assert.equal(long.value, 'DittpresentkortfranJumpYardharnu');
  assert.equal(long.value.length, 32);
  assert.equal(long.autoCheck, false);
  assert.equal(paste('A'.repeat(32)).autoCheck, true);
});

const field = (overrides = {}) => ({
  kind: 'giftCard', value: GIFT_CARD, unchecked: true, contactReady: true, busy: false, ...overrides,
});

test('a number pasted with a ready contact is checked at once', () => {
  const pending = { kind: 'giftCard', value: GIFT_CARD, waitsForContact: false };
  assert.deepEqual(decidePastedCodeCheck(pending, field()), { action: 'check', delayMs: 0 });
});

test('a number pasted before the contact waits, then is checked once the contact has settled', () => {
  const pending = { kind: 'giftCard', value: GIFT_CARD, waitsForContact: true };
  assert.deepEqual(decidePastedCodeCheck(pending, field({ contactReady: false })), { action: 'wait', reason: 'contact' });
  assert.deepEqual(decidePastedCodeCheck(pending, field()), { action: 'check', delayMs: PASTED_CODE_CONTACT_SETTLE_MS });
  assert.ok(PASTED_CODE_CONTACT_SETTLE_MS >= 500 && PASTED_CODE_CONTACT_SETTLE_MS <= 1500);
});

test('a running quote, draft or another step makes the pasted number wait', () => {
  const pending = { kind: 'member', value: MEMBER, waitsForContact: false };
  assert.deepEqual(decidePastedCodeCheck(pending, field({ kind: 'member', value: MEMBER, busy: true })), { action: 'wait', reason: 'busy' });
});

test('an edit, another type or an answered quote ends the wait for good', () => {
  const pending = { kind: 'giftCard', value: GIFT_CARD, waitsForContact: true };
  assert.deepEqual(decidePastedCodeCheck(null, field()), { action: 'none' });
  assert.deepEqual(decidePastedCodeCheck(pending, field({ value: '400012345' })), { action: 'none' });
  assert.deepEqual(decidePastedCodeCheck(pending, field({ kind: 'discount' })), { action: 'none' });
  assert.deepEqual(decidePastedCodeCheck(pending, field({ unchecked: false })), { action: 'none' });
});

// Execute the real BuyTickets handlers and effect with synthetic state; no network or provider.
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
  assert.ok(result, `Missing actual declaration ${name}`);
  return result;
}
function pastedCodeEffect() {
  const found = [];
  function visit(node) {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(ast) === 'useEffect' && node.getText(ast).includes('pastedCodeCheck')) {
      found.push(node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(found.length, 1, 'one effect owns the automatic check');
  return found[0];
}
function compile(code, state) {
  vm.runInContext(ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, vm.createContext(state));
  return state;
}

function pasteHarness({ chosen = 'discount', customerValid = true, clipboard } = {}) {
  const events = [];
  const state = {
    classifyPaymentCode, toPastedPaymentCode, PAYMENT_OPTION_CODE_MAX_LENGTH: 32, useCallback: (fn) => fn,
    quoteRequestVersionRef: { current: 0 }, appliedQuoteRef: { current: null },
    paymentOptionType: chosen, customerValid, giftCardNumber: '', clipCardCode: 'old-code',
    paymentOptionsOpen: false, pasteHelpVisible: false, pendingPastedCode: null, quote: { stale: true },
    paymentCodeInputRef: { current: { focus: () => events.push('focus') } },
    navigator: { clipboard },
    setPaymentOptionsOpen: (value) => { state.paymentOptionsOpen = value; },
    setPasteHelpVisible: (value) => { state.pasteHelpVisible = value; },
    setPaymentOptionType: (value) => { state.paymentOptionType = value; },
    setPendingPastedCode: (value) => { state.pendingPastedCode = value; },
    setGiftCardNumber: (value) => { state.giftCardNumber = value; },
    setClipCardCode: (value) => { state.clipCardCode = value; },
    setQuote: (value) => { state.quote = value; },
    setDraft: () => {}, setSubmitError: () => {}, clearPaymentSyncState: () => {},
  };
  const names = ['invalidateQuote', 'clampPaymentOptionCode', 'updateGiftCardNumber', 'updateClipCardCode',
    'pastePaymentCode', 'pastePaymentCodeFromClipboard'];
  compile(`${names.map(declaration).join('\n')}\nglobalThis.handlers = { ${names.join(', ')} };`, state);
  return { state, events, ...state.handlers };
}

test('pasting fills the type and the clean number, opens the section and owes one check', () => {
  const host = pasteHarness({ chosen: 'member' });
  assert.equal(host.pastePaymentCode(`#${GIFT_CARD}`), true);
  assert.equal(host.state.paymentOptionType, 'giftCard');
  assert.equal(host.state.giftCardNumber, GIFT_CARD);
  assert.equal(host.state.clipCardCode, '', 'one code at a time');
  assert.equal(host.state.paymentOptionsOpen, true);
  assert.equal(host.state.quote, null, 'an earlier answer no longer counts');
  assert.deepEqual(plain(host.state.pendingPastedCode), { kind: 'giftCard', value: GIFT_CARD, waitsForContact: false });

  const early = pasteHarness({ chosen: 'giftCard', customerValid: false });
  early.pastePaymentCode(`#${MEMBER}`);
  assert.equal(early.state.paymentOptionType, 'member');
  assert.equal(early.state.clipCardCode, MEMBER);
  assert.equal(early.state.giftCardNumber, '');
  assert.deepEqual(plain(early.state.pendingPastedCode), { kind: 'member', value: MEMBER, waitsForContact: true });

  const long = pasteHarness();
  long.pastePaymentCode('x'.repeat(40));
  assert.equal(long.state.clipCardCode.length, 32);
  assert.equal(long.state.pendingPastedCode, null, 'text longer than any code is not checked by itself');
});

test('an empty paste changes nothing and reports that nothing was pasted', () => {
  const host = pasteHarness();
  assert.equal(host.pastePaymentCode('  # '), false);
  assert.equal(host.state.clipCardCode, 'old-code');
  assert.equal(host.state.paymentOptionsOpen, false);
  assert.equal(host.state.pendingPastedCode, null);
});

test('Klistra in reads the clipboard inside the tap and pastes what it gets', async () => {
  let reads = 0;
  const host = pasteHarness({ clipboard: { readText: () => { reads += 1; return Promise.resolve(` #${MEMBER} `); } } });
  const running = host.pastePaymentCodeFromClipboard();
  assert.equal(reads, 1, 'readText starts synchronously in the click handler');
  await running;
  assert.equal(host.state.paymentOptionType, 'member');
  assert.equal(host.state.clipCardCode, MEMBER);
  assert.equal(host.state.pasteHelpVisible, false);
  assert.deepEqual(host.events, []);
});

test('a refused, missing or empty clipboard focuses the field and shows the long-press line', async () => {
  const refused = pasteHarness({ clipboard: { readText: () => Promise.reject(new Error('NotAllowedError')) } });
  await refused.pastePaymentCodeFromClipboard();
  for (const clipboard of [{ readText: () => Promise.resolve('') }, { readText: () => Promise.resolve(' # ') }]) {
    const empty = pasteHarness({ clipboard });
    await empty.pastePaymentCodeFromClipboard();
    assert.equal(empty.state.pasteHelpVisible, true);
  }
  assert.equal(refused.state.pasteHelpVisible, true);
  assert.deepEqual(refused.events, ['focus']);
  assert.equal(refused.state.clipCardCode, 'old-code');
  assert.equal(refused.state.pendingPastedCode, null);

  // Without the API the field is focused before the handler yields, so iOS can still raise the keyboard.
  const missing = pasteHarness({ clipboard: undefined });
  const running = missing.pastePaymentCodeFromClipboard();
  assert.deepEqual(missing.events, ['focus']);
  assert.equal(missing.state.pasteHelpVisible, true);
  await running;
});

function effectHarness(initial) {
  const applied = [];
  let now = 0;
  let nextTimer = 0;
  let cleanup = null;
  let timers = [];
  const state = {
    decidePastedCodeCheck,
    step: 'CONTACT', submitting: false, applyingCodes: false, draft: null,
    paymentOptionType: 'giftCard', paymentOptionValue: GIFT_CARD, paymentOptionState: 'ready', customerValid: true,
    pendingPastedCode: null, ...initial,
    window: {
      setTimeout: (fn, ms) => { nextTimer += 1; timers.push({ id: nextTimer, at: now + ms, fn }); return nextTimer; },
      clearTimeout: (id) => { timers = timers.filter((timer) => timer.id !== id); },
    },
    setPendingPastedCode: (value) => { state.pendingPastedCode = value; },
    applyPaymentOptions: async () => { applied.push(state.paymentOptionValue); },
    // React runs an effect without dependencies after every render, after the previous cleanup.
    useEffect: (effect) => { cleanup?.(); cleanup = effect() ?? null; },
  };
  compile(`globalThis.render = () => {\n${declaration('pastedCodeCheck')}\n${pastedCodeEffect()}\n};`, state);
  const advance = (ms) => {
    now += ms;
    for (const timer of timers.filter((entry) => entry.at <= now)) {
      timers = timers.filter((entry) => entry !== timer);
      timer.fn();
      state.render();
    }
  };
  return { state, applied, render: () => state.render(), advance };
}

test('the real effect checks a number pasted with a ready contact once, at once', () => {
  const host = effectHarness({ pendingPastedCode: { kind: 'giftCard', value: GIFT_CARD, waitsForContact: false } });
  host.render();
  host.advance(0);
  assert.deepEqual(host.applied, [GIFT_CARD]);
  assert.equal(host.state.pendingPastedCode, null);
  // Later contact edits clear the quote but never start another automatic check.
  for (let key = 0; key < 5; key += 1) { host.render(); host.advance(PASTED_CODE_CONTACT_SETTLE_MS); }
  assert.deepEqual(host.applied, [GIFT_CARD]);
});

test('the real effect waits for the contact and checks once the guest pauses typing, never per keystroke', () => {
  const host = effectHarness({
    customerValid: false, pendingPastedCode: { kind: 'giftCard', value: GIFT_CARD, waitsForContact: true },
  });
  host.render();
  host.advance(5000);
  assert.deepEqual(host.applied, [], 'nothing is checked without a ready contact');
  // "anna@x.s", "anna@x.se", ...: valid on every keystroke, a keystroke every 200 ms.
  host.state.customerValid = true;
  for (let key = 0; key < 4; key += 1) { host.render(); host.advance(200); }
  assert.deepEqual(host.applied, [], 'a half-typed email does not use up the one check');
  host.advance(PASTED_CODE_CONTACT_SETTLE_MS);
  assert.deepEqual(host.applied, [GIFT_CARD]);
  for (let key = 0; key < 5; key += 1) { host.render(); host.advance(PASTED_CODE_CONTACT_SETTLE_MS); }
  assert.deepEqual(host.applied, [GIFT_CARD], 'each pasted number is checked automatically once');
});

test('the real effect leaves an edited number and a running check alone', () => {
  const edited = effectHarness({
    paymentOptionValue: '400012345', pendingPastedCode: { kind: 'giftCard', value: GIFT_CARD, waitsForContact: false },
  });
  edited.render();
  edited.advance(PASTED_CODE_CONTACT_SETTLE_MS);
  assert.deepEqual(edited.applied, []);

  const busy = effectHarness({ applyingCodes: true, pendingPastedCode: { kind: 'giftCard', value: GIFT_CARD, waitsForContact: false } });
  busy.render();
  busy.advance(PASTED_CODE_CONTACT_SETTLE_MS);
  assert.deepEqual(busy.applied, [], 'waits while another check runs');
  busy.state.applyingCodes = false;
  busy.render();
  busy.advance(0);
  assert.deepEqual(busy.applied, [GIFT_CARD]);
});

test('Applicera, Enter, a typed edit and Continue take over from the pending automatic check', () => {
  const field = source.slice(source.indexOf('data-testid="payment-code-input"'), source.indexOf('data-testid="payment-code-hint"'));
  // #510: a typed edit replaces the pending check with its own (a complete number) or none.
  assert.match(field, /onChange=\{\(event\) => typePaymentCode\(event\.target\.value\)\}/);
  assert.match(source, /const typePaymentCode = [\s\S]*?setPendingPastedCode\(isCompletePaymentCode\(kind, value\) \? \{ kind, value, waitsForContact: !customerValid \} : null\);/);
  assert.match(field, /event\.key !== 'Enter'[\s\S]*?setPendingPastedCode\(null\);\s*void applyPaymentOptions\(\);/);
  assert.match(field, /data-testid="payment-code-apply"\s+onClick=\{\(\) => \{\s*setPendingPastedCode\(null\);\s*void applyPaymentOptions\(\);/);
  assert.match(field, /onPaste=\{\(event\) => \{[\s\S]*?if \(pastePaymentCode\(event\.clipboardData\.getData\('text'\)\)\) event\.preventDefault\(\);/);
  assert.match(source, /onClick=\{\(\) => \{\s*\/\/ #505[^\n]*\n\s*setPendingPastedCode\(null\);\s*if \(draft\) \{/);
});

test('the field keeps the normal text keyboard, shows Klistra in only while empty, and its hints are black', () => {
  const field = source.slice(source.indexOf('ref={paymentCodeInputRef}'), source.indexOf('data-testid="payment-code-hint"'));
  assert.match(field, /type="text"/);
  assert.doesNotMatch(field, /inputMode|type="(?:tel|number)"/);
  assert.match(field, /paymentOptionState === 'empty' \? \(\s*<button[\s\S]*?data-testid="payment-code-paste"[\s\S]*?\{t\.buy\.paymentCodePaste\}/);
  const paste = field.slice(field.indexOf('data-testid="payment-code-paste"'), field.indexOf('{t.buy.paymentCodePaste}'));
  const apply = field.slice(field.indexOf('data-testid="payment-code-apply"'), field.indexOf('{applyingCodes ?'));
  const style = (text) => /className="([^"]+)"/.exec(text)[1];
  assert.equal(style(paste), style(apply), 'Klistra in has the small bold italic red style of Applicera');
  const hint = source.slice(source.indexOf('data-testid="payment-code-hint"'), source.indexOf('{paymentOptionHint}'));
  assert.match(hint, /text-foreground/);
  assert.doesNotMatch(hint, /text-muted/);
});

test('Swedish and English copy for Klistra in, its fallback line and the waiting line', () => {
  const copy = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  for (const line of [
    "paymentCodePaste: 'Klistra in',",
    "paymentCodePasteHelp: 'Håll in i fältet och välj Klistra in.',",
    "paymentCodePasteWaiting: 'Fyll i förnamn och e-post så kollar vi kortet.',",
    "paymentCodePasteWaitingCode: 'Fyll i förnamn och e-post så kollar vi koden.',",
    "memberAcceptedTitle: 'Medlemskortet är godkänt',",
    "paymentCodePaste: 'Paste',",
    "paymentCodePasteHelp: 'Press and hold in the field and choose Paste.',",
    "paymentCodePasteWaiting: 'Fill in your first name and email and we will check the card.',",
    "paymentCodePasteWaitingCode: 'Fill in your first name and email and we will check the code.',",
    "memberAcceptedTitle: 'Membership accepted',",
    // #510 (D0251): the one field's label, placeholder and the hint while digits are typed.
    "paymentCodeLabel: 'Kod',",
    "paymentCodePlaceholder: 'Kod eller kortnummer',",
    "cardShapeHint: 'Presentkort har 10 siffror. Medlemskort har ett bindestreck.',",
    "paymentCodeLabel: 'Code',",
    "paymentCodePlaceholder: 'Code or card number',",
    "cardShapeHint: 'Gift cards have 10 digits. Membership numbers have a hyphen.',",
  ]) assert.ok(copy.includes(line), line);
  // #510: the type chooser and its per-type labels are gone.
  assert.doesNotMatch(copy, /paymentOptionTypeQuestion|giftCardPlaceholder|memberCodePlaceholder/);
});
