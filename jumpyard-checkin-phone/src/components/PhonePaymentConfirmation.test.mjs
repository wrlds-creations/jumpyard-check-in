import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');

function load(name) {
  const source = fs.readFileSync(new URL(name, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => {
    if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (id === './JumpyardIcon') return load('JumpyardIcon.tsx');
    return require(id);
  }, mod, mod.exports);
  return mod.exports;
}

const { PhonePaymentConfirmation } = load('PhonePaymentConfirmation.tsx');

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

function render(props) {
  const tree = PhonePaymentConfirmation({
    amountLabel: '200 kr', onContinueToSafety: () => assert.fail('Unexpected safety navigation'), ...props,
  });
  return { tree, markup: renderToStaticMarkup(tree) };
}

const expected = {
  sv: {
    preparing: 'Vi slutför ditt köp …', ready: 'Betalningen är klar', receipt: 'Kvittot skickas via e-post.',
    continue: 'Till säkerhetsgenomgången', continuing: 'Fortsätter …', retry: 'Kontrollera igen',
    delayed: 'Det tar lite längre tid', doNotPayAgain: 'Betala inte igen.',
  },
  en: {
    preparing: 'We’re completing your purchase …', ready: 'Payment complete', receipt: 'Your receipt will be emailed.',
    continue: 'Continue to safety briefing', continuing: 'Continuing …', retry: 'Check again',
    delayed: 'This is taking a little longer', doNotPayAgain: 'Do not pay again.',
  },
};

function assertNoConfirmation(markup, copy) {
  for (const absent of [copy.ready, copy.receipt, copy.continue, '200 kr', 'success-check.png', 'receipt.png']) {
    assert.ok(!markup.includes(absent), `Premature confirmation: ${absent}`);
  }
}

for (const language of ['sv', 'en']) {
  const copy = expected[language];

  test(`${language}: preparation renders an announced status immediately without a receipt or safety action`, () => {
    const { tree, markup } = render({ language, preparationState: 'preparing' });
    assert.equal(tree.props.lang, language);
    const statuses = nodes(tree, node => node.props?.role === 'status');
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].props['aria-live'], 'polite');
    assert.equal(statuses[0].props['aria-atomic'], 'true');
    assert.equal(content(nodes(statuses[0], node => node.type === 'h1')[0]), copy.preparing);
    assert.ok(markup.includes(copy.preparing));
    assert.equal(nodes(tree, node => node.type === 'button').length, 0);
    const spinner = nodes(tree, node => node.props?.className === 'spinner');
    assert.equal(spinner.length, 1);
    assert.equal(spinner[0].props['aria-hidden'], 'true');
    assertNoConfirmation(markup, copy);
  });

  test(`${language}: delayed preparation replaces the spinner with help and only retries the supplied purchase check`, () => {
    let checks = 0;
    const onRetryPreparation = () => { checks += 1; };
    const { tree, markup } = render({ language, preparationState: 'delayed', onRetryPreparation });
    assert.equal(content(nodes(tree, node => node.type === 'h1')[0]), copy.delayed);
    assert.ok(markup.includes(copy.doNotPayAgain));
    assert.equal(nodes(tree, node => node.props?.className === 'spinner').length, 0);
    const buttons = nodes(tree, node => node.type === 'button');
    assert.equal(buttons.length, 1);
    assert.equal(content(buttons[0]), copy.retry);
    assert.equal(buttons[0].props.onClick, onRetryPreparation);
    buttons[0].props.onClick();
    assert.equal(checks, 1);
    assertNoConfirmation(markup, copy);
  });

  test(`${language}: readiness reveals the receipt and enables explicit guest navigation`, () => {
    let navigations = 0;
    const onContinueToSafety = () => { navigations += 1; };
    const { tree, markup } = render({ language, preparationState: 'ready', onContinueToSafety });
    assert.equal(content(nodes(tree, node => node.type === 'h1')[0]), copy.ready);
    for (const present of ['success-check.png', '200 kr', 'receipt.png', copy.receipt]) {
      assert.ok(markup.includes(present), `Missing confirmation: ${present}`);
    }
    assert.equal(navigations, 0, 'Rendering must never navigate automatically');
    const buttons = nodes(tree, node => node.type === 'button');
    assert.equal(buttons.length, 1);
    assert.equal(content(buttons[0]), copy.continue);
    assert.equal(buttons[0].props.disabled, false);
    assert.equal(buttons[0].props['aria-busy'], false);
    assert.equal(buttons[0].props.onClick, onContinueToSafety);
    buttons[0].props.onClick();
    assert.equal(navigations, 1);
  });

  test(`${language}: an in-flight continuation has readable progress as well as a disabled button`, () => {
    const { tree, markup } = render({ language, preparationState: 'ready', isContinuing: true });
    const button = nodes(tree, node => node.type === 'button')[0];
    assert.equal(button.props.disabled, true);
    assert.equal(button.props['aria-busy'], true);
    assert.equal(content(button), copy.continuing);
    assert.ok(markup.includes(copy.continuing));
    assert.equal(content(nodes(button, node => node.props?.['aria-live'] === 'polite')[0]), copy.continuing);
    assert.equal(nodes(button, node => node.props?.['aria-hidden'] === 'true').length, 1);
  });
}

test('the existing static preview keeps its ready default', () => {
  const { markup } = render({ language: 'sv' });
  assert.ok(markup.includes(expected.sv.ready));
  assert.ok(markup.includes(expected.sv.continue));
});

test('progress remains readable without animation under reduced motion', () => {
  const css = fs.readFileSync(new URL('PhonePaymentConfirmation.module.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.spinner \{ animation: none; \}/);
  const { markup } = render({ language: 'sv', preparationState: 'preparing' });
  assert.ok(markup.includes(expected.sv.preparing));
});
