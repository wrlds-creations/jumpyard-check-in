import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('./FlowTransition.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source + '\nexports.TestLifecycle = TransitionLifecycle;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness({ reduced = false, animateSupported = true, snapshotAvailable = true, captureThrows = false, animationThrows = false } = {}) {
  const events = [], timers = new Map(); let serial = 0;
  const animation = target => (frames, options) => {
    events.push(['animate', target, frames, options]);
    if (animationThrows) throw new Error('Animation unavailable');
    return { cancel: () => events.push(['cancel', target]) };
  };
  const heading = { focus: options => events.push(['focus', options]) };
  const element = { content: 'start',
    ownerDocument: { body: { appendChild: layer => events.push(['append', layer]) } },
    querySelector: selector => { assert.equal(selector, 'h1, h2'); return heading; },
    ...(animateSupported ? { animate: animation('incoming') } : {}),
  };
  const captureFlowSnapshot = root => {
    events.push(['capture', root.content]);
    if (captureThrows) throw new Error('Snapshot unavailable');
    if (!snapshotAvailable) return null;
    return { layer: { animate: animation('outgoing'), remove: () => events.push(['remove']) },
      restoreScroll: () => events.push(['restore-scroll']) };
  };
  const exports = {};
  new Function('require', 'exports', 'window', 'setTimeout', 'clearTimeout', compiled)(
    id => id === './flowSnapshot' ? { captureFlowSnapshot } : id === 'framer-motion' ? {} : require(id), exports,
    { scrollTo: options => events.push(['scroll', options]) },
    (callback, duration) => { const id = ++serial; timers.set(id, { callback, duration }); return id; },
    id => timers.delete(id));
  const instance = new exports.TestLifecycle({ root: { current: element }, screenKey: 'start', reduced, children: 'start' });
  return { events, heading, timers,
    update(key, options = {}) {
      const previous = instance.props;
      instance.props = { ...previous, ...options, screenKey: key, children: key };
      const snapshot = instance.getSnapshotBeforeUpdate(previous);
      element.content = key;
      instance.componentDidUpdate(previous, undefined, snapshot);
      assert.equal(instance.render(), key, 'business content is available immediately');
    },
    finish() { for (const { callback, duration } of [...timers.values()]) { assert.equal(duration, 240); callback(); } },
    unmount() { instance.componentWillUnmount(); },
  };
}
test('initial and same-screen renders do not replay motion or steal input focus', () => {
  const h = harness(); h.update('start'); h.update('start'); assert.deepEqual(h.events, []);
});

test('next-guest reset crossfades for the full duration without translating the home screen or delaying reset', () => {
  const h = harness();
  h.update('home', { variant: 'fade' });
  const animations = h.events.filter(e => e[0] === 'animate');
  assert.deepEqual(animations.map(e => e[3].duration), [240, 240]);
  assert.deepEqual(animations[1][2], [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal(h.events.filter(e => e[0] === 'focus').length, 1);
  h.finish(); assert.equal(h.timers.size, 0);
});

test('loading phases crossfade without moving focus, and a fast result cancels the previous presentation', () => {
  const h = harness();
  h.update('TIMESLOT:loading', { focusHeading: false });
  assert.equal(h.events.filter(e => e[0] === 'animate').length, 2);
  assert.equal(h.events.filter(e => e[0] === 'focus').length, 0);
  h.update('PRODUCT', { focusHeading: true });
  assert.equal(h.events.filter(e => e[0] === 'focus').length, 1);
  assert.equal(h.events.filter(e => e[0] === 'remove').length, 1);
  assert.equal(h.timers.size, 1);
  h.finish();
  assert.equal(h.timers.size, 0);
});
test('captures outgoing DOM before mutation and navigates immediately with coordinated fades', () => {
  const h = harness(); h.update('lookup', { resetDocumentScroll: true });
  assert.deepEqual(h.events.map(e => e[0]), ['capture', 'scroll', 'focus', 'append', 'restore-scroll', 'animate', 'animate']);
  assert.deepEqual(h.events[0], ['capture', 'start']);
  assert.deepEqual(h.events[1][1], { top: 0, left: 0, behavior: 'instant' });
  assert.deepEqual(h.events[2][1], { preventScroll: true }); assert.equal(h.heading.tabIndex, -1);
  const animations = h.events.filter(e => e[0] === 'animate');
  assert.equal(animations[0][3].duration, 180); assert.equal(animations[1][3].duration, 240);
  assert.deepEqual(animations[1][2], [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }]);
  h.finish(); assert.equal(h.timers.size, 0); assert.equal(h.events.filter(e => e[0] === 'remove').length, 1);
});
test('rapid Back/forward and unmount clean up previous layers without waiting', () => {
  const h = harness(); h.update('lookup'); h.update('start'); assert.equal(h.timers.size, 1); h.unmount();
  assert.equal(h.timers.size, 0); assert.equal(h.events.filter(e => e[0] === 'remove').length, 2);
  assert.equal(h.events.filter(e => e[0] === 'cancel').length, 4); assert.equal(h.events.filter(e => e[0] === 'focus').length, 2);
});
test('reduced motion and unavailable animation API skip snapshots but retain focus/scroll', () => {
  for (const options of [{ reduced: true }, { animateSupported: false }]) {
    const h = harness(options); h.update('lookup', { resetDocumentScroll: true });
    assert.deepEqual(h.events.map(e => e[0]), ['scroll', 'focus']); assert.equal(h.timers.size, 0);
  }
});
test('enabling reduced motion clears an active transition without stealing focus', () => {
  const h = harness(); h.update('lookup'); h.update('lookup', { reduced: true });
  assert.equal(h.timers.size, 0); assert.equal(h.events.filter(e => e[0] === 'remove').length, 1);
  assert.equal(h.events.filter(e => e[0] === 'focus').length, 1);
});
test('disabled coordination leaves legacy focus and scrolling untouched', () => {
  const h = harness(); h.update('lookup', { enabled: false, resetDocumentScroll: true }); assert.deepEqual(h.events, []);
});
test('unsafe or failed snapshot capture falls back to a bounded incoming fade', () => {
  for (const options of [{ snapshotAvailable: false }, { captureThrows: true }]) {
    const h = harness(options); h.update('lookup'); const animations = h.events.filter(e => e[0] === 'animate');
    assert.equal(animations.length, 1); assert.equal(animations[0][1], 'incoming');
    assert.equal(animations[0][2][0].opacity, 0.15); assert.equal(h.events.filter(e => e[0] === 'append').length, 0); h.finish();
  }
});
test('animation failure removes the inert copy and leaves navigation complete', () => {
  const h = harness({ animationThrows: true }); h.update('lookup');
  assert.equal(h.events.filter(e => e[0] === 'remove').length, 1); assert.equal(h.events.filter(e => e[0] === 'focus').length, 1); assert.equal(h.timers.size, 0);
});
test('real snapshot helper refuses provider frames before cloning', () => {
  const helper = fs.readFileSync(new URL('./flowSnapshot.ts', import.meta.url), 'utf8'); const exports = {};
  new Function('exports', ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports);
  for (const tag of ['iframe', 'object', 'embed']) {
    const element = { querySelector: selector => { assert.equal(selector, 'iframe, object, embed'); return { tagName: tag }; } };
    assert.equal(exports.captureFlowSnapshot(element), null);
  }
});
