import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function loadFlowNav() {
  const output = ts.transpileModule(source('components/FlowNav.tsx'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const overrides = {
    '@/context/LanguageContext': { useTranslation: () => ({ t: { common: { back: 'Tillbaka', exit: 'Avsluta' } } }) },
    '@/components/JumpyardIcon': { JumpyardIcon: () => null },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => overrides[id] ?? require(id), mod, mod.exports);
  return mod.exports.FlowNav;
}

const FlowNav = loadFlowNav();
const nav = source('components/FlowNav.tsx');
const page = source('app/page.tsx');
const buy = source('components/BuyTickets.tsx');

test('server output reserves the in-flow spacer only, and nothing without an action', () => {
  const markup = renderToStaticMarkup(React.createElement(FlowNav, { onBack: () => {} }));
  assert.match(markup, /data-testid="flow-nav-spacer"/);
  assert.doesNotMatch(markup, /<button/);
  assert.equal(renderToStaticMarkup(React.createElement(FlowNav, { onBack: null, onExit: null })), '');
});

test('the buttons float in the bottom corners and step aside for the keyboard and dialogs', () => {
  assert.match(nav, /createPortal\(/);
  assert.match(nav, /document\.body,/);
  assert.match(nav, /fixed inset-x-0 bottom-0/);
  assert.match(nav, /env\(safe-area-inset-bottom\)/);
  assert.match(nav, /const hidden = typing \|\| dialogOpen;/);
  assert.match(nav, /inert=\{hidden\}/);
  assert.match(nav, /document\.querySelector\('\[aria-modal="true"\]'\)/);
  assert.match(nav, /isTextField\(document\.activeElement\)/);
  assert.match(nav, /h-12 w-12/);
  assert.match(nav, /aria-label=\{t\.common\.back\}/);
  assert.match(nav, /aria-label=\{t\.common\.exit\} data-testid=\{exitTestId\}/);
  assert.match(nav, /exitTestId = 'exit-flow-open'/);
  assert.match(nav, /<JumpyardIcon name="home"/);
});

test('the page renders Back/Exit at the bottom with the unchanged rules', () => {
  assert.match(page, /<\/FlowTransition>\s*\{\/\* BuyTickets owns its own Back\/Exit while buying\. \*\/\}\s*\{!phoneCompletion && state !== 'KIOSK_BUY' && \(\s*<FlowNav/);
  assert.match(page, /onExit=\{exitFlowMode === 'confirm' \? \(\) => setExitDialogOpen\(true\) : null\}/);
  assert.equal((page.match(/<FlowNav\b/g) || []).length, 1);
  assert.doesNotMatch(page, /ArrowLeft/);
  assert.doesNotMatch(page, /pr-10/);
});

test('ticket purchase keeps its own guarded Back/Exit, now at the bottom', () => {
  assert.match(buy, /<FlowNav\s+onBack=\{backNavigationLocked \? null : backFromStep\}\s+onExit=\{inlineExitVisible && onRequestExit \? onRequestExit : null\}\s+exitTestId="buy-exit-flow-open"\s+\/>\s*<\/FlowScreen>\s*<\/FlowTransitionBoundary>/);
  assert.doesNotMatch(buy, /ArrowLeft/);
});
