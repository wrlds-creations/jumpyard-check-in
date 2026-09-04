import assert from 'node:assert/strict';
import test from 'node:test';
import { createSafetyPlayback, SAFETY_VIDEO_TIMEOUT_MS } from './safetyPlayback.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness() {
  const pending = new Map();
  let clock = 0, timerId = 0, plays = 0, loads = 0;
  const events = [];
  const video = Object.assign(new EventTarget(), {
    currentTime: 0, duration: 15, paused: true, ended: false, readyState: 0, error: null,
    play: () => { plays++; video.paused = false; return Promise.resolve(); },
    pause: () => { video.paused = true; video.dispatchEvent(new Event('pause')); },
    load: () => { loads++; video.error = null; video.currentTime = 0; video.ended = false; },
  });
  const controller = createSafetyPlayback(video, state => events.push(state), {
    setTimeout: (fn, delay) => { pending.set(++timerId, { fn, at: clock + delay }); return timerId; },
    clearTimeout: id => pending.delete(id),
  });
  const emit = (event, fields = {}) => { Object.assign(video, fields); video.dispatchEvent(new Event(event)); };
  return {
    video, controller, events, emit,
    get state() { return events.at(-1); },
    get plays() { return plays; },
    get loads() { return loads; },
    get timers() { return pending.size; },
    advance(ms) {
      clock += ms;
      for (const [id, item] of pending) if (item.at <= clock) { pending.delete(id); item.fn(); }
    },
    play() { controller.start(); emit('playing', { paused: false, readyState: 4, ended: false }); },
    finish() { emit('timeupdate', { currentTime: 15 }); emit('ended', { ended: true, paused: true }); },
  };
}

test('a requested or resolved play stays visibly loading until playback actually starts', async () => {
  const h = harness();
  h.controller.start();
  await flush();
  assert.equal(h.state.phase, 'loading');
  h.emit('playing', { readyState: 4 });
  assert.equal(h.state.phase, 'playing');
  h.controller.dispose();
});

test('rejected play becomes recoverable error and retry restarts the whole video', async () => {
  const h = harness();
  h.video.play = () => Promise.reject(new Error('NotAllowedError'));
  h.controller.start();
  await flush();
  assert.equal(h.state.phase, 'error');
  assert.equal(h.timers, 0);
  h.video.currentTime = 8;
  h.video.play = () => { h.video.paused = false; return Promise.resolve(); };
  h.controller.start();
  assert.equal(h.loads, 1);
  assert.equal(h.video.currentTime, 0);
  assert.deepEqual(h.state, { phase: 'loading', progress: 0 });
});

test('synchronous playback failure is also recoverable', () => {
  const h = harness();
  h.video.play = () => { throw new Error('Media unavailable'); };
  h.controller.start();
  assert.equal(h.state.phase, 'error');
});

test('never-settling play is bounded; repeated waiting signals cannot extend it', () => {
  const h = harness();
  h.video.play = () => new Promise(() => {});
  h.controller.start();
  h.advance(SAFETY_VIDEO_TIMEOUT_MS - 1);
  h.emit('waiting');
  h.emit('stalled');
  h.advance(1);
  assert.equal(h.state.phase, 'error');
  assert.equal(h.video.paused, true);
});

test('buffering shows loading then returns to playing when frames progress', () => {
  const h = harness();
  h.play();
  h.emit('timeupdate', { currentTime: 2 });
  h.emit('waiting', { readyState: 2 });
  assert.equal(h.state.phase, 'loading');
  h.advance(6_000);
  h.emit('timeupdate', { currentTime: 3, readyState: 4 });
  assert.equal(h.state.phase, 'playing');
  h.advance(6_000);
  assert.equal(h.state.phase, 'playing');
  h.advance(6_000);
  assert.equal(h.state.phase, 'error');
});

test('stalled download with buffered frames does not cover continuing playback', () => {
  const h = harness();
  h.play();
  h.emit('stalled');
  assert.equal(h.state.phase, 'playing');
});

test('lack of frame progress times out even without a browser waiting event', () => {
  const h = harness();
  h.play();
  h.advance(SAFETY_VIDEO_TIMEOUT_MS);
  assert.equal(h.state.phase, 'error');
  h.emit('ended', { currentTime: 15, ended: true });
  assert.equal(h.state.phase, 'error');
});

test('repeated playing events without advancing frames do not extend the deadline', () => {
  const h = harness();
  h.play();
  h.advance(SAFETY_VIDEO_TIMEOUT_MS - 1);
  h.emit('waiting');
  h.emit('playing');
  h.advance(1);
  assert.equal(h.state.phase, 'error');
});

test('media error stops playback and ignores stale playing/end events', () => {
  const h = harness();
  h.play();
  h.emit('error', { error: { code: 2 } });
  assert.equal(h.state.phase, 'error');
  h.emit('playing', { paused: false });
  h.finish();
  assert.equal(h.state.phase, 'error');
});

test('a paused video offers explicit resume at the same position, never completion', () => {
  const h = harness();
  h.play();
  h.emit('timeupdate', { currentTime: 4 });
  h.video.pause();
  assert.equal(h.state.phase, 'paused');
  h.advance(60_000);
  assert.equal(h.state.phase, 'paused');
  h.controller.start();
  assert.equal(h.video.currentTime, 4);
  assert.equal(h.loads, 0);
  assert.equal(h.state.phase, 'loading');
});

test('duplicate starts use one play call; a late rejected promise cannot fail a retry', async () => {
  const h = harness();
  const first = deferred();
  h.video.play = () => first.promise;
  h.controller.start();
  h.controller.start();
  assert.equal(h.events.length, 1);
  h.advance(SAFETY_VIDEO_TIMEOUT_MS);
  h.video.play = () => Promise.resolve();
  h.play();
  first.reject(new Error('old attempt'));
  await flush();
  assert.equal(h.state.phase, 'playing');
});

test('only an active playback that actually reaches the end can show completion', () => {
  const h = harness();
  h.emit('ended', { ended: true, currentTime: 15 });
  assert.equal(h.state, undefined);
  h.play();
  h.emit('ended', { ended: true, currentTime: 1 });
  assert.notEqual(h.state.phase, 'done');
  h.finish();
  assert.deepEqual(h.state, { phase: 'done', progress: 100 });
  assert.equal(h.timers, 0);
  h.controller.start();
  assert.deepEqual(h.state, { phase: 'loading', progress: 0 });
  assert.equal(h.video.currentTime, 0);
});

test('dispose pauses media, clears timers, and prevents every late callback', async () => {
  const h = harness();
  const delayed = deferred();
  h.video.play = () => delayed.promise;
  h.controller.start();
  h.controller.dispose();
  const count = h.events.length;
  delayed.reject(new Error('unmounted'));
  await flush();
  h.play();
  h.finish();
  h.advance(60_000);
  assert.equal(h.events.length, count);
  assert.equal(h.timers, 0);
});
