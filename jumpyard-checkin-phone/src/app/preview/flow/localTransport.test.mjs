import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function harness(hostname = '127.0.0.1', mode = 'development') {
  const forwarded = [];
  const original = async (...args) => { forwarded.push(args); return Response.json({ asset: true }); };
  const window = { fetch: original };
  const location = { hostname, origin: `http://${hostname}:3017`, href: `http://${hostname}:3017/preview/flow` };
  const code = ts.transpileModule(fs.readFileSync(new URL('./localTransport.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function('exports', 'window', 'location', 'process', code)(exports, window, location, { env: { NODE_ENV: mode } });
  return { ...exports, window, original, forwarded };
}

test('preview refuses production and non-loopback hosts', () => {
  for (const h of [harness('example.com'), harness('127.0.0.1', 'production')]) {
    assert.throws(() => h.installLocalTransport({ delay: () => 0, fail: () => false }), /localhost/);
    assert.equal(h.window.fetch, h.original);
  }
});

test('preview never forwards external/API reads or writes; cleanup restores asset transport', async () => {
  const h = harness();
  const restore = h.installLocalTransport({ delay: () => 0, fail: () => false });
  const result = await h.window.fetch('https://example.invalid/v1/bookings/availability', { method: 'POST', body: JSON.stringify({ startTimes: ['17:00'] }) });
  assert.equal((await result.json()).status, 'available');
  assert.equal((await h.window.fetch('https://example.invalid/v1/bookings/draft', { method: 'POST' })).status, 409);
  assert.equal((await h.window.fetch('http://127.0.0.1:3017/v1/check-in/session', { method: 'POST' })).status, 409);
  assert.equal(h.forwarded.length, 0);
  await h.window.fetch('/video.mp4');
  assert.equal(h.forwarded.length, 1);
  restore(); assert.equal(h.window.fetch, h.original);
});

test('simulated failure stays local and can recover without reloading', async () => {
  const h = harness(); let fail = true;
  h.installLocalTransport({ delay: () => 0, fail: () => fail });
  const url = 'https://example.invalid/v1/bookings/availability';
  assert.equal((await h.window.fetch(url)).status, 503);
  fail = false;
  assert.equal((await h.window.fetch(url)).status, 200);
  assert.equal(h.forwarded.length, 0);
});
