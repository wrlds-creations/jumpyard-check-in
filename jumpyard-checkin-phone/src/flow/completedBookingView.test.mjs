import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function compile(input, localRequire, globals = {}) {
  const output = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)(localRequire, mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}

function load(name, overrides = {}) {
  return compile(read(name), id => {
    if (id in overrides) return overrides[id];
    if (!id.startsWith('.')) return require(id);
    const base = path.posix.join(path.posix.dirname(name), id);
    const target = ['.ts', '.tsx'].map(ext => base + ext)
      .find(candidate => fs.existsSync(new URL('../' + candidate, import.meta.url)));
    assert.ok(target, `Unresolved import ${id} from ${name}`);
    return load(target, overrides);
  });
}

const language = load('context/LanguageContext.tsx');
const motion = { div: ({ children, ...props }) => {
  for (const key of ['initial', 'animate', 'exit']) delete props[key];
  return React.createElement('div', props, children);
} };
const icon = () => null;
const { ConfirmationScreen } = load('components/ConfirmationScreen.tsx', {
  '@/context/LanguageContext': language,
  '@/flow/packageContents': load('flow/packageContents.ts'),
  'framer-motion': { motion },
  '@/components/JumpyardIcon': { JumpyardIcon: icon },
  '@/components/QrCode': { QrCode: ({ value, testId }) => React.createElement('span', { 'data-testid': testId, 'data-qr-value': value }) },
});
const page = ts.createSourceFile('page.tsx', read('app/page.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const cardDeclaration = page.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'BuyRecoveryCard');
assert.ok(cardDeclaration, 'The actual recovery card must exist');
const { BuyRecoveryCard } = compile(cardDeclaration.getText(page) + '\nexports.BuyRecoveryCard = BuyRecoveryCard;', require, {
  useTranslation: language.useTranslation, motion, JumpyardIcon: icon, AlertCircle: icon, RefreshCw: icon, RotateCcw: icon,
});

// Render the actual components with their real translations, and keep the React
// element tree so button behavior is verified as well as the visible markup.
function render(Component, props, lang = 'sv') {
  let tree;
  let translations;
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => lang } };
  function Probe() {
    translations = language.useTranslation().t;
    tree = Component(props);
    return tree;
  }
  try {
    const markup = renderToStaticMarkup(React.createElement(language.LanguageProvider, null, React.createElement(Probe)));
    return { tree, markup, t: translations };
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree && typeof tree === 'object' ? content(tree.props?.children) : '';
}

const booking = { id: 'reference-original', paid: true, durationMinutes: 60, productLabel: '60 min entré' };
const readySession = { checkinSessionId: 'session-original', status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: 'handoff-original' };

test('ready and completed confirmation screens render and invoke the supplied New booking action in both languages', () => {
  for (const lang of ['sv', 'en']) {
    for (const state of ['ready', 'completed', 'already-checked-in']) {
      let clicks = 0;
      const onStartOver = () => { clicks += 1; };
      const session = state === 'completed' ? { ...readySession, status: 'completed', handoffStatus: 'completed' }
        : state === 'already-checked-in' ? null : readySession;
      const { tree, markup, t } = render(ConfirmationScreen, {
        booking, checkinSession: session, jumperCount: 2, selectedAddons: [], onStartOver,
        alreadyCheckedIn: state === 'already-checked-in',
      }, lang);
      const buttons = nodes(tree, node => node.type === 'button');
      assert.equal(buttons.length, 1, `${lang}/${state}`);
      assert.equal(buttons[0].props['data-testid'], 'confirmation-start-over');
      assert.equal(content(buttons[0]), lang === 'sv' ? 'Gör en ny bokning' : 'Make a new booking');
      assert.equal(buttons[0].props.onClick, onStartOver);
      buttons[0].props.onClick();
      assert.equal(clicks, 1);
      assert.equal(content(nodes(tree, node => node.type === 'h1')[0]), state === 'ready' ? t.confirm.title : t.confirm.alreadyCheckedInTitle);
      assert.equal(markup.includes('data-testid="ready-entry-handoff-qr"'), state === 'ready');
      assert.equal(markup.includes('data-testid="already-checked-in-card"'), state !== 'ready');
    }
  }
});

test('confirmation screens without an onStartOver callback expose no New booking action', () => {
  for (const completed of [false, true]) {
    const { tree, markup } = render(ConfirmationScreen, {
      booking, checkinSession: completed ? { ...readySession, status: 'completed' } : readySession,
      jumperCount: 2, selectedAddons: [],
    });
    assert.equal(nodes(tree, node => node.type === 'button').length, 0);
    assert.doesNotMatch(markup, /confirmation-start-over/);
  }
});

test('completed-unavailable card explains the old booking and provides executable retry and New booking actions', () => {
  for (const lang of ['sv', 'en']) {
    const clicks = [];
    const { tree, t, markup } = render(BuyRecoveryCard, {
      status: 'completed-unavailable', onRetry: () => clicks.push('retry'), onRestart: () => clicks.push('new'),
    }, lang);
    assert.equal(content(nodes(tree, node => node.type === 'h2')[0]), t.buyRecovery.completedUnavailableTitle);
    assert.equal(content(nodes(tree, node => node.type === 'p')[0]), t.buyRecovery.completedUnavailableDescription);
    const buttons = nodes(tree, node => node.type === 'button');
    assert.deepEqual(buttons.map(button => content(button).trim()), [t.buyRecovery.retry, t.confirm.done]);
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    assert.deepEqual(clicks, ['retry', 'new']);
    assert.match(markup, /data-buy-recovery-status="completed-unavailable"/);
  }
});

test('unresolved payment and safety recovery cards never expose New booking', () => {
  for (const status of ['payment-unknown', 'payment-checking', 'checking', 'unsafe', 'failed']) {
    let restarts = 0;
    let retries = 0;
    const { tree, t } = render(BuyRecoveryCard, {
      status, onRestart: () => { restarts += 1; }, onRetry: () => { retries += 1; },
    });
    const buttons = nodes(tree, node => node.type === 'button');
    assert.ok(!buttons.some(button => content(button).includes(t.confirm.done)));
    for (const button of buttons) button.props.onClick();
    assert.equal(restarts, 0, status);
    if (status === 'payment-unknown') {
      assert.equal(content(nodes(tree, node => node.type === 'h2')[0]), t.buy.paymentRecoveryTitle);
      assert.equal(buttons.length, 1);
      assert.equal(content(buttons[0]).trim(), t.buy.paymentCheckStatus);
      assert.equal(retries, 1);
    }
  }
});
