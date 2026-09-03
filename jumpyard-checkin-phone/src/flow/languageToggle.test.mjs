import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

// Transpiles one source file under src/ and its relative TypeScript imports;
// package imports come from the installed dependencies.
function load(name, overrides = {}) {
  const output = ts.transpileModule(source(name), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = id => {
    if (id in overrides) return overrides[id];
    if (!id.startsWith('.')) return require(id);
    const base = path.posix.join(path.posix.dirname(name), id);
    const file = ['.ts', '.tsx'].map(ext => base + ext).find(candidate => fs.existsSync(new URL('../' + candidate, import.meta.url)));
    assert.ok(file, `unresolved import ${id} from ${name}`);
    return load(file, overrides);
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(localRequire, mod, mod.exports);
  return mod.exports;
}

// Renders the real provider and control with a fake stored preference, the way a
// returning guest's browser would present it.
function render(stored, props = {}) {
  const storage = new Map(stored === undefined ? [] : [['jy.lang', stored]]);
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.window = { localStorage };
  globalThis.localStorage = localStorage;
  try {
    const context = load('context/LanguageContext.tsx');
    const { LanguageToggle } = load('components/LanguageToggle.tsx', { '@/context/LanguageContext': context });
    return renderToStaticMarkup(React.createElement(context.LanguageProvider, null, React.createElement(LanguageToggle, props)));
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
}

const option = (markup, code) => {
  const match = markup.match(new RegExp(`<button[^>]*data-testid="language-option-${code}"[^>]*>([^<]*)</button>`));
  assert.ok(match, `missing ${code} option in ${markup}`);
  return { tag: match[0], text: match[1] };
};

test('both languages stay visible with own-language accessible names and pressed state', () => {
  const markup = render();
  assert.match(markup, /<div role="group" aria-label="Språk" data-testid="language-toggle"/);
  const sv = option(markup, 'sv');
  const en = option(markup, 'en');
  assert.equal(sv.text, 'SV');
  assert.equal(en.text, 'EN');
  for (const { tag } of [sv, en]) assert.match(tag, /type="button"/);
  assert.match(sv.tag, /lang="sv"/);
  assert.match(sv.tag, /aria-label="Svenska"/);
  assert.match(sv.tag, /aria-pressed="true"/);
  assert.match(en.tag, /lang="en"/);
  assert.match(en.tag, /aria-label="English"/);
  assert.match(en.tag, /aria-pressed="false"/);
});

test('a saved English preference renders English as pressed with an English group name', () => {
  const markup = render('en');
  assert.match(markup, /aria-label="Language"/);
  assert.match(option(markup, 'en').tag, /aria-pressed="true"/);
  assert.match(option(markup, 'sv').tag, /aria-pressed="false"/);
});

test('an unknown saved value falls back to Swedish', () => {
  assert.match(option(render('de'), 'sv').tag, /aria-pressed="true"/);
});

test('each option sets its exact language and the document language follows the choice', () => {
  const toggle = source('components/LanguageToggle.tsx');
  assert.match(toggle, /onClick=\{\(\) => setLang\(option\.code\)\}/);
  assert.doesNotMatch(toggle, /toggleLang/);
  const context = source('context/LanguageContext.tsx');
  assert.match(context, /document\.documentElement\.lang = lang;/);
});

test('inside the flow only the other language is offered, with an understandable name', () => {
  const sv = render(undefined, { compact: true });
  assert.doesNotMatch(sv, /role="group"/);
  assert.doesNotMatch(sv, /language-option-sv/);
  const en = option(sv, 'en');
  assert.equal(en.text, 'EN');
  assert.match(en.tag, /aria-label="Byt språk till English"/);
  assert.doesNotMatch(en.tag, /aria-pressed/);

  const stored = render('en', { compact: true });
  assert.doesNotMatch(stored, /language-option-en/);
  const back = option(stored, 'sv');
  assert.equal(back.text, 'SV');
  assert.match(back.tag, /aria-label="Switch language to Svenska"/);
});

test('the control sits once in the top-right corner of the flow, full on start screens and compact after them', () => {
  const page = source('app/page.tsx');
  assert.match(page, /<LanguageToggle compact=\{!isStartState\(progressState\)\} className="absolute top-2 right-2 z-20" \/>\s*<ProgressBar/);
  assert.equal((page.match(/<LanguageToggle\b/g) || []).length, 1);
  assert.match(page, /if \(!hasProgressBar\(state\)\) return null;/);
  assert.match(page, /\$\{hasProgressBar\(progressState\) \? '' : 'pr-10'\}/);
  assert.doesNotMatch(source('components/BuyTickets.tsx'), /LanguageToggle/);
  const policy = load('flow/exitFlowPolicy.ts');
  assert.equal(policy.isStartState('KIOSK_CHOICE'), true);
  assert.equal(policy.isStartState('APP_MOBILE'), true);
  assert.equal(policy.isStartState('KIOSK_LOOKUP'), false);
  assert.equal(policy.isStartState('KIOSK_BUY'), false);
  assert.equal(policy.isStartState('APP_BOOKING'), false);
});
