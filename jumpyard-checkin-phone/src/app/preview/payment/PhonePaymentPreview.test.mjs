import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL('../../../', import.meta.url));
const previewFile = fileURLToPath(new URL('./PhonePaymentPreview.tsx', import.meta.url));
const confirmationFile = path.join(appRoot, 'components/PhonePaymentConfirmation.tsx');

// Exercise the actual TSX with isolated hook state and an explicitly controlled clock.
// No DOM, live SDK or network is needed to verify the fixture transition boundaries.
function createHarness() {
  const slots = [];
  const timers = new Map();
  const cleanups = new Map();
  const modules = new Map();
  let cursor = 0;
  let nextTimer = 0;
  let now = 0;
  let effects = [];
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        effects.push(() => {
          cleanups.get(index)?.();
          const cleanup = effect();
          if (cleanup) cleanups.set(index, cleanup);
        });
      }
      slots[index] = deps;
    },
  };
  const setTimer = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  const clearTimer = id => timers.delete(id);
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const moduleRecord = { exports: {} };
    modules.set(filename, moduleRecord);
    const source = fs.readFileSync(filename, 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const localRequire = specifier => {
      if (specifier === 'react') return hooks;
      if (specifier.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const resolved = specifier.startsWith('@/') ? path.join(appRoot, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        const target = ['', '.tsx', '.ts'].map(extension => resolved + extension).find(candidate => fs.existsSync(candidate));
        assert.ok(target, `Unresolved test dependency: ${specifier}`);
        return load(target);
      }
      return require(specifier);
    };
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', js)(localRequire, moduleRecord, moduleRecord.exports, setTimer, clearTimer);
    return moduleRecord.exports;
  }
  const Preview = load(previewFile).default;
  return {
    load,
    render() {
      cursor = 0;
      effects = [];
      const tree = Preview();
      effects.forEach(effect => effect());
      return tree;
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        timers.delete(id);
        timer.callback();
      }
      now = end;
    },
    pending: () => timers.size,
    unmount: () => cleanups.forEach(cleanup => cleanup()),
  };
}

function find(tree, predicate) {
  if (!React.isValidElement(tree)) return undefined;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
}
const guest = tree => find(tree, element => element.props['data-preview-guest'] === 'true');
const guestMarkup = tree => renderToStaticMarkup(guest(tree));
const state = tree => guest(tree).props['data-preview-state'];
const select = (tree, label, value) => find(tree, element => element.type === 'select' && element.props['aria-label'] === label).props.onChange({ target: { value } });
const play = tree => find(tree, element => element.type === 'button').props.onClick();
const confirmation = tree => find(tree, element => element.type?.name === 'PhonePaymentConfirmation');

test('confirmation uses the approved Swedish title, receipt icon and one explicit forward action', () => {
  const harness = createHarness();
  const View = harness.load(confirmationFile).PhonePaymentConfirmation;
  let continued = 0;
  const tree = View({ language: 'sv', amountLabel: '200 kr', onContinueToSafety: () => continued++ });
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /Betalningen är klar/);
  assert.match(markup, /Kvittot skickas via e-post\./);
  assert.match(markup, /jumpyard-next-icons\/receipt\.png/);
  assert.match(markup, /Till säkerhetsgenomgången/);
  assert.equal((markup.match(/<button\b/g) || []).length, 1);
  assert.equal(continued, 0);
  find(tree, element => element.type === 'button').props.onClick();
  assert.equal(continued, 1);
  assert.equal(harness.pending(), 0);
});

for (const language of ['sv', 'en']) {
  for (const purchase of ['entry', 'addon']) {
    test(`${language} ${purchase} fixture shows the correct confirmed amount and receipt`, () => {
      const harness = createHarness();
      let tree = harness.render();
      select(tree, 'Köp', purchase);
      tree = harness.render();
      select(tree, 'Språk / Language', language);
      tree = harness.render();
      const markup = guestMarkup(tree);
      assert.equal(state(tree), 'approved');
      assert.match(markup, language === 'sv' ? /Kvittot skickas via e-post\./ : /Your receipt will be emailed\./);
      assert.match(markup, new RegExp(`aria-label="${language === 'sv' ? 'Betalt' : 'Paid'} [^"]*${purchase === 'entry' ? '200' : '20'}`));
      assert.match(markup, purchase === 'entry' ? /admission-ticket\.png/ : /booking-card\.png/);
    });
  }
}

test('simulated approval stays visible indefinitely and only the forward button opens simulated safety', () => {
  const harness = createHarness();
  play(harness.render());
  let tree = harness.render();
  assert.equal(state(tree), 'processing');
  assert.doesNotMatch(guestMarkup(tree), /receipt\.png|Kvittot|<button\b/);
  harness.advance(1800);
  tree = harness.render();
  assert.equal(state(tree), 'approved');
  assert.equal(harness.pending(), 0);
  harness.advance(120_000);
  tree = harness.render();
  assert.equal(state(tree), 'approved');
  confirmation(tree).props.onContinueToSafety();
  tree = harness.render();
  assert.equal(state(tree), 'safety');
  assert.match(guestMarkup(tree), /Simulerat nästa steg/);
  assert.doesNotMatch(guestMarkup(tree), /Kvittot|<button\b/);
});

for (const status of ['processing', 'declined', 'unknown']) {
  test(`${status} never claims success, shows a receipt, or offers guest navigation`, () => {
    const harness = createHarness();
    select(harness.render(), 'Visa läge', status);
    const tree = harness.render();
    assert.equal(state(tree), status);
    assert.doesNotMatch(guestMarkup(tree), /receipt\.png|Kvittot|Betalningen är klar|<button\b|<a\b/);
    if (status === 'unknown') assert.match(guestMarkup(tree), /Betala inte igen/);
  });
}

for (const change of ['path', 'state', 'language']) {
  test(`changing the ${change} fixture cancels an in-flight simulated approval`, () => {
    const harness = createHarness();
    play(harness.render());
    let tree = harness.render();
    if (change === 'path') select(tree, 'Köp', 'addon');
    else if (change === 'state') select(tree, 'Visa läge', 'unknown');
    else select(tree, 'Språk / Language', 'en');
    tree = harness.render();
    assert.equal(harness.pending(), 0);
    const expected = state(tree);
    harness.advance(120_000);
    assert.equal(state(harness.render()), expected);
  });
}

test('unmount clears the demo clock', () => {
  const harness = createHarness();
  play(harness.render());
  harness.render();
  assert.equal(harness.pending(), 1);
  harness.unmount();
  assert.equal(harness.pending(), 0);
});

test('route is development-only and presentation does not import live flows or invoke external effects', () => {
  const route = fs.readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  assert.match(route, /if \(process\.env\.NODE_ENV !== 'development'\) notFound\(\)/);
  for (const filename of [previewFile, confirmationFile]) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:localStorage|sessionStorage|XMLHttpRequest|WebSocket)\b|window\.location|router\.(?:push|replace)|from ['"][^'"]*(?:BuyTickets|AddonsOffer|RollerPaymentDropIn|cloudClient|ecom-payments)/);
  }
  assert.doesNotMatch(fs.readFileSync(confirmationFile, 'utf8'), /setTimeout|setInterval|useEffect/);
});

test('approved receipt asset is the existing transparent RGBA icon', () => {
  const icon = fs.readFileSync(path.resolve(appRoot, '../public/jumpyard-next-icons/receipt.png'));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), 1254);
  assert.equal(icon.readUInt32BE(20), 1254);
  assert.equal(icon[25], 6, 'PNG color type must retain an alpha channel');
});
