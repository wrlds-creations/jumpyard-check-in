import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

import { shouldRemindAboutSocks } from './socksReminder.ts';

// #533 (Love, 2026-10-13): "går man vidare och inte har fyllt in någon strumpor alls så får man upp en snäll
// pop-up ... som bara säger typ du glömmer inte strumpor med en glad smiley". A purchase meets the reminder when
// leaving Entré, an existing booking when leaving its add-on step. These tests run the real handlers.
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const files = {
  buy: '../components/BuyTickets.tsx',
  addons: '../components/AddonsOffer.tsx',
  dialog: '../components/SocksReminderDialog.tsx',
  socks: '../components/SocksQuantity.tsx',
  page: '../app/page.tsx',
};
const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const ast = Object.fromEntries(Object.entries(files).map(([key, file]) =>
  [key, ts.createSourceFile(file, text[key], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)]));

function declaration(file, name) {
  let found;
  const visit = node => {
    if (!found && (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast[file]) === name) {
      found = ts.isFunctionDeclaration(node) ? node.getText(ast[file]) : `const ${name} = ${node.initializer.getText(ast[file])};`;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast[file]);
  assert.ok(found, `Missing ${file} declaration ${name}`);
  return found;
}

function compile(file, names, globals) {
  const context = vm.createContext({ shouldRemindAboutSocks, ...globals });
  const code = names.map(name => declaration(file, name)).join('\n') + `\nglobalThis.handlers = { ${names.join(', ')} };`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { context, handlers: context.handlers };
}

const counter = (state, key) => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };

test('the reminder asks only when socks can be added and none are chosen, included or answered', () => {
  const ask = overrides => shouldRemindAboutSocks({ socksAvailable: true, socksQuantity: 0, socksIncluded: 0, answered: false, ...overrides });
  assert.equal(ask({}), true);
  assert.equal(ask({ socksQuantity: 1 }), false, 'never when socks are chosen');
  assert.equal(ask({ socksIncluded: 1, socksQuantity: 1 }), false, 'never when the booking has socks ("✓ 1 ingår")');
  assert.equal(ask({ socksIncluded: 2, socksQuantity: 2 }), false);
  assert.equal(ask({ answered: true }), false, 'at most once per visit, and never after "Vi har egna"');
  assert.equal(ask({ socksAvailable: false }), false, 'never where socks cannot be added');
});

function buyHarness(overrides = {}) {
  const state = { step: 'QUANTITY', open: false, shown: false, attention: 0, ...overrides.state };
  const { context, handlers } = compile('buy', ['continueFromQuantity', 'addSocksFromReminder', 'continueWithOwnSocks'], {
    socksSellable: true,
    addonQty: { socks: 0, water_bottle: 0 },
    socksReminderShown: false,
    setStep: value => { state.step = value; },
    setSocksReminderOpen: value => { state.open = value; },
    setSocksReminderShown: value => { state.shown = value; context.socksReminderShown = value; },
    setSocksAttention: counter(state, 'attention'),
    ...overrides.globals,
  });
  return { state, context, ...handlers };
}

test('purchase: leaving Entré without socks opens the reminder once and stays on Entré', () => {
  const buy = buyHarness();
  buy.continueFromQuantity();
  assert.deepEqual({ step: buy.state.step, open: buy.state.open, shown: buy.state.shown }, { step: 'QUANTITY', open: true, shown: true });

  // "Lägg till strumpor" closes it at the socks block, which is called to attention; the step stays.
  buy.addSocksFromReminder();
  assert.deepEqual({ step: buy.state.step, open: buy.state.open, attention: buy.state.attention }, { step: 'QUANTITY', open: false, attention: 1 });

  // Continue again without socks: no second reminder in this visit.
  buy.continueFromQuantity();
  assert.equal(buy.state.open, false);
  assert.equal(buy.state.step, 'ADDONS');
});

test('purchase: "Vi har egna" closes the reminder and goes on to the add-ons', () => {
  const buy = buyHarness();
  buy.continueFromQuantity();
  buy.continueWithOwnSocks();
  assert.deepEqual({ step: buy.state.step, open: buy.state.open, attention: buy.state.attention }, { step: 'ADDONS', open: false, attention: 0 });
});

test('purchase: chosen socks, unsellable socks or an earlier reminder go straight on', () => {
  for (const globals of [
    { addonQty: { socks: 2, water_bottle: 0 } },
    { socksSellable: false },
    { socksReminderShown: true },
  ]) {
    const buy = buyHarness({ globals });
    buy.continueFromQuantity();
    assert.deepEqual({ step: buy.state.step, open: buy.state.open }, { step: 'ADDONS', open: false }, JSON.stringify(globals));
  }
});

function addonsHarness(overrides = {}) {
  const state = { step: 'SELECT', open: false, shownHere: false, pageShown: 0, attention: 0, completed: [], afterAddons: 0, error: null };
  const { context, handlers } = compile('addons', [
    'isPricedCatalogEntry', 'handleSelectContinue', 'continueFromSelect', 'addSocksFromReminder', 'continueWithOwnSocks',
  ], {
    catalogLoading: false,
    catalogError: null,
    socksEntry: { id: 'socks', price: 49, rollerProductId: 7001, maxPerGuest: 2 },
    qty: { socks: 0, water_bottle: 0 },
    minQty: { socks: 0, water_bottle: 0 },
    socksReminderShown: false,
    socksReminderShownHere: false,
    addedAddons: [],
    t: { addons: { unsupportedSelection: 'unsupported' } },
    buildItems: () => context.addedAddons.map(addon => ({ productId: addon.rollerProductId })),
    needsSkyRiderConsent: () => false,
    completeAddons: paymentHandled => { state.completed.push(paymentHandled); },
    goToStepAfterAddons: () => { state.afterAddons += 1; },
    setStep: value => { state.step = value; },
    setSubmitError: value => { state.error = value; },
    setSocksReminderOpen: value => { state.open = value; },
    setSocksReminderShownHere: value => { state.shownHere = value; context.socksReminderShownHere = value; },
    onSocksReminderShown: () => { state.pageShown += 1; },
    setSocksAttention: counter(state, 'attention'),
    ...overrides,
  });
  return { state, context, ...handlers };
}

test('booking: continuing from the add-ons without socks opens the reminder and tells the page', () => {
  const addons = addonsHarness();
  addons.handleSelectContinue();
  assert.deepEqual({ open: addons.state.open, shownHere: addons.state.shownHere, pageShown: addons.state.pageShown, completed: addons.state.completed },
    { open: true, shownHere: true, pageShown: 1, completed: [] });

  addons.addSocksFromReminder();
  assert.deepEqual({ open: addons.state.open, attention: addons.state.attention, step: addons.state.step, completed: addons.state.completed },
    { open: false, attention: 1, step: 'SELECT', completed: [] });

  // Still no socks: Continue goes on as before the reminder (safety film without add-ons).
  addons.handleSelectContinue();
  assert.equal(addons.state.open, false);
  assert.deepEqual(addons.state.completed, [false]);
});

test('booking: "Vi har egna" continues exactly as Continue does', () => {
  const nothingAdded = addonsHarness();
  nothingAdded.handleSelectContinue();
  nothingAdded.continueWithOwnSocks();
  assert.equal(nothingAdded.state.open, false);
  assert.deepEqual(nothingAdded.state.completed, [false], 'no add-ons: on to the safety film');

  const water = addonsHarness({ addedAddons: [{ id: 'water_bottle', qty: 1, price: 30, rollerProductId: 7002 }] });
  water.handleSelectContinue();
  assert.equal(water.state.open, true, 'a water bottle without socks still gets the reminder');
  water.continueWithOwnSocks();
  assert.equal(water.state.afterAddons, 1, 'with add-ons: on to the film, then the summary (#520)');
  assert.deepEqual(water.state.completed, []);
});

test('booking: included socks, chosen socks, an earlier reminder or unsellable socks never ask', () => {
  for (const overrides of [
    { qty: { socks: 2, water_bottle: 0 }, minQty: { socks: 2, water_bottle: 0 } },
    { qty: { socks: 1, water_bottle: 0 } },
    { socksReminderShown: true },
    { socksReminderShownHere: true },
    { socksEntry: { id: 'socks', price: null, rollerProductId: 7001, maxPerGuest: 2 } },
    { socksEntry: null },
  ]) {
    const addons = addonsHarness(overrides);
    addons.handleSelectContinue();
    assert.equal(addons.state.open, false, JSON.stringify(overrides));
    assert.equal(addons.state.pageShown, 0);
    assert.deepEqual(addons.state.completed, [false]);
  }
});

test('booking: a loading or failed catalog keeps its own handling, without the reminder', () => {
  const loading = addonsHarness({ catalogLoading: true });
  loading.handleSelectContinue();
  assert.deepEqual({ open: loading.state.open, completed: loading.state.completed }, { open: false, completed: [] });

  const failed = addonsHarness({ catalogError: 'Kunde inte hämta tillägg.' });
  failed.handleSelectContinue();
  assert.deepEqual({ open: failed.state.open, error: failed.state.error, completed: failed.state.completed },
    { open: false, error: 'Kunde inte hämta tillägg.', completed: [] });
});

function loadDialog(reactOverride) {
  const output = ts.transpileModule(text.dialog, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const copy = { socksReminder: { title: 'Glöm inte strumporna! 😊', add: 'Lägg till strumpor', own: 'Vi har egna' } };
  const overrides = {
    react: reactOverride ?? React,
    '@/context/LanguageContext': { useTranslation: () => ({ t: copy }) },
    '@/components/JumpyardIcon': { JumpyardIcon: ({ name }) => React.createElement('img', { 'data-icon': name }) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => overrides[id] ?? require(id), mod, mod.exports);
  return mod.exports.SocksReminderDialog;
}

test('the dialog: brand socks icon, the heading with its smiley and two buttons, red first', () => {
  const Dialog = loadDialog();
  assert.equal(renderToStaticMarkup(React.createElement(Dialog, { open: false, onAddSocks() {}, onOwnSocks() {} })), '');
  const markup = renderToStaticMarkup(React.createElement(Dialog, { open: true, onAddSocks() {}, onOwnSocks() {} }));
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/, 'Back and Exit step aside while it is open (FlowNav)');
  assert.match(markup, /data-icon="grip-socks"/);
  assert.match(markup, /<h2 id="socks-reminder-title"[^>]*>Glöm inte strumporna! 😊<\/h2>/);
  const add = markup.indexOf('data-testid="socks-reminder-add"');
  const own = markup.indexOf('data-testid="socks-reminder-own"');
  assert.ok(add > 0 && own > add, 'the red "Lägg till strumpor" comes first');
  assert.match(markup, /class="[^"]*bg-primary[^"]*"[^>]*data-testid="socks-reminder-add"[^>]*>Lägg till strumpor</);
  assert.match(markup, /class="[^"]*border-foreground[^"]*"[^>]*data-testid="socks-reminder-own"[^>]*>Vi har egna</);
  assert.doesNotMatch(markup, /text-muted|text-gray|text-zinc/, 'no grey text');
});

test('the dialog: each button calls its own choice, and a tap outside means "Lägg till strumpor"', () => {
  const calls = [];
  const Dialog = loadDialog({ ...React, useEffect: () => undefined });
  const tree = Dialog({ open: true, onAddSocks: () => calls.push('add'), onOwnSocks: () => calls.push('own') });
  const find = (node, testId) => {
    if (!node || typeof node !== 'object') return null;
    if (node.props?.['data-testid'] === testId) return node;
    for (const child of [node.props?.children].flat()) {
      const found = find(child, testId);
      if (found) return found;
    }
    return null;
  };
  find(tree, 'socks-reminder-add').props.onClick();
  find(tree, 'socks-reminder-own').props.onClick();
  tree.props.onMouseDown({ target: tree, currentTarget: tree });
  tree.props.onMouseDown({ target: {}, currentTarget: tree });
  assert.deepEqual(calls, ['add', 'own', 'add']);
});

test('both steps render the reminder outside their transition root and call the socks block to attention', () => {
  for (const [file, step] of [['buy', 'QUANTITY'], ['addons', 'SELECT']]) {
    assert.match(text[file], new RegExp(`</FlowScreen>\\s*\\{/\\* #533[^}]*\\*/\\}\\s*<SocksReminderDialog\\s+open=\\{socksReminderOpen && step === '${step}'\\}\\s+onAddSocks=\\{addSocksFromReminder\\}\\s+onOwnSocks=\\{continueWithOwnSocks\\}\\s*/>\\s*</FlowTransitionBoundary>`), file);
    assert.match(text[file], /attention=\{socksAttention\}/, file);
  }
  assert.match(text.buy, /data-testid="buy-quantity-continue"\s+onClick=\{continueFromQuantity\}/);
  // The page keeps the answer for the visit, so Back from the safety film does not ask again.
  assert.match(text.page, /socksReminderShown=\{ctx\.socksReminderShown\}/);
  assert.match(text.page, /onSocksReminderShown=\{\(\) => setCtx\(current => \(\{ \.\.\.current, socksReminderShown: true \}\)\)\}/);
  assert.match(read('./machine.ts'), /socksReminderShown: false,/);
  // The block scrolls into view, focuses its + and pulses; a block mounted later does not replay it.
  assert.match(text.socks, /const handledAttention = useRef\(attention\);/);
  assert.match(text.socks, /scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/);
  assert.match(text.socks, /addRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  const css = read('../app/globals.css');
  assert.match(css, /\.buy-socks \.addon-shop-row\[data-attention\] \{ animation: socks-attention 600ms ease-in-out 2; \}/);
  const keyframes = css.slice(css.indexOf('@keyframes socks-attention'), css.indexOf('}', css.indexOf('50%')) + 1);
  assert.doesNotMatch(keyframes, /transform|height|width|margin/, 'only colour pulses');
});

test('the copy is short, friendly and in both languages', () => {
  const language = read('../context/LanguageContext.tsx');
  assert.match(language, /socksReminder: \{\s+title: 'Glöm inte strumporna! 😊',\s+add: 'Lägg till strumpor',\s+own: 'Vi har egna',\s+\}/);
  assert.match(language, /socksReminder: \{\s+title: "Don't forget your socks! 😊",\s+add: 'Add socks',\s+own: 'We have our own',\s+\}/);
});
