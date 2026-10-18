import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(new URL('./BookingLookup.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function find(tree, id) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.props?.['data-testid'] === id) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const result = find(child, id); if (result) return result; }
  return null;
}
class FakeLookupError extends Error { constructor(reason) { super(reason); this.reason = reason; } }
function KalasWelcome() { return null; }
function harness(lookupBooking, onSuccess, options = {}) {
  const slots = []; let cursor = 0;
  const copy = new Proxy({}, { get: (_, key) => key });
  const react = { ...require('react'),
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, value => { slots[index].value = value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(effect) { const index = cursor++; slots[index] ??= { cleanup: effect() }; },
  };
  const exports = {};
  new Function('require', 'exports', compiled)(id => {
    if (id === 'react') return react;
    if (id === '@/components/FlowTransition') return { FlowScreen: 'div' };
    if (id === '@/components/JumpyardIcon') return { JumpyardIcon: 'span' };
    if (id === '@/components/KalasWelcome') return { KalasWelcome };
    if (id === '@/context/LanguageContext') return { useTranslation: () => ({ t: { lookup: copy, common: copy } }) };
    if (id === '@/flow/cloudClient') return { lookupBooking, CloudLookupError: FakeLookupError };
    return require(id);
  }, exports);
  const render = () => { cursor = 0; return exports.BookingLookup({ onSuccess, onBack: options.onBack ?? (() => {}), initialIssue: options.initialIssue }); };
  const input = () => find(render(), 'booking-lookup-input');
  const button = () => find(render(), 'booking-lookup-submit');
  return { render, input, button, enter(value) { input().props.onChange({ target: { value } }); }, unmount() { slots.forEach(slot => slot.cleanup?.()); } };
}

test('lookup remains busy through async session routing and successful handoff without a second actionable Search frame', async () => {
  const lookup = deferred(), route = deferred(); let calls = 0, routed = 0;
  const h = harness(() => { calls++; return lookup.promise; }, async booking => { assert.equal(booking.id, 'DEMO'); routed++; await route.promise; });
  h.enter(' DEMO ');
  const originalButton = h.button();
  const operation = originalButton.props.onClick();
  await originalButton.props.onClick(); // Same-render double tap must also be locked.
  h.input().props.onKeyDown({ key: 'Enter', preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.input().props.disabled, true);
  lookup.resolve({ id: 'DEMO' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(routed, 1);
  assert.equal(h.button().props['aria-busy'], true);
  assert.doesNotMatch(h.button().props.className, /opacity-40/);
  route.resolve(); await operation;
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.button().props['aria-busy'], true);
  h.unmount();
});

test('failed reads or routing release the lock for an explicit retry', async () => {
  for (const failure of ['lookup', 'routing']) {
    let calls = 0, routed = 0;
    const h = harness(async () => { calls++; if (failure === 'lookup' && calls === 1) throw new Error('Offline'); return { id: 'DEMO' }; },
      async () => { routed++; if (failure === 'routing' && routed === 1) throw new Error('Routing failed'); });
    h.enter('DEMO'); await h.button().props.onClick();
    assert.equal(h.button().props.disabled, false);
    assert.equal(h.input().props.disabled, false);
    await h.button().props.onClick();
    assert.equal(calls, 2);
    assert.equal(h.button().props['aria-busy'], true);
    h.unmount();
  }
});

test('leaving lookup before the read resolves cannot hand an old result to the parent', async () => {
  const lookup = deferred(); let routed = 0;
  const h = harness(() => lookup.promise, () => { routed++; });
  h.enter('DEMO'); const operation = h.button().props.onClick();
  h.unmount(); lookup.resolve({ id: 'DEMO' }); await operation;
  assert.equal(routed, 0);
});

test('GH-571: a kalas is never checked in; lookup shows the glad kalas screen, and Klar goes back', async () => {
  let routed = 0, back = 0;
  const h = harness(async () => { throw new FakeLookupError('party_package'); }, () => { routed++; }, { onBack() { back++; } });
  h.enter('177249113'); await h.button().props.onClick();
  const screen = h.render();
  assert.equal(screen.type, KalasWelcome, 'the glad kalas screen replaces the lookup form');
  assert.equal(routed, 0, 'no check-in starts');
  screen.props.onDone();
  assert.equal(back, 1);
  h.unmount();
  // A kalas link arrives with the issue already known (page.tsx passes it on).
  const linked = harness(async () => ({ id: 'X' }), () => {}, { initialIssue: 'party_package' });
  assert.equal(linked.render().type, KalasWelcome);
  // Other lookup issues keep the small message under the form.
  const other = harness(async () => { throw new FakeLookupError('wrong_date'); }, () => {});
  other.enter('X'); await other.button().props.onClick();
  assert.notEqual(other.render().type, KalasWelcome);
  assert.equal(other.button().props.disabled, false);
});
