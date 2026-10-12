import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// #505 preview fixture: development and loopback only, quotes answered locally, nothing forwarded.
function load(file, globals) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const require = (name) => {
    assert.equal(name, '../flow/localTransport', `unexpected runtime import ${name}`);
    return load('../flow/localTransport.ts', globals);
  };
  new Function('exports', 'require', 'window', 'location', 'process', code)(exports, require, globals.window, globals.location, globals.process);
  return exports;
}

function harness(hostname = '127.0.0.1', mode = 'development') {
  const forwarded = [];
  const original = async (...args) => { forwarded.push(args); return Response.json({ asset: true }); };
  const globals = {
    window: { fetch: original },
    location: { hostname, origin: `http://${hostname}:3505`, href: `http://${hostname}:3505/preview/klistra-in` },
    process: { env: { NODE_ENV: mode } },
  };
  return { ...load('./pasteTransport.ts', globals), window: globals.window, original, forwarded };
}

const basket = [{ productId: 1020, quantity: 1 }, { productId: 1765445, quantity: 1 }];
async function quote(h, body) {
  const response = await h.window.fetch('http://127.0.0.1:9/v1/bookings/quote', { method: 'POST', body: JSON.stringify({ items: basket, ...body }) });
  assert.equal(response.status, 200);
  return (await response.json()).quote;
}

test('the preview refuses production and non-loopback hosts', () => {
  for (const h of [harness('example.com'), harness('127.0.0.1', 'production')]) {
    assert.throws(() => h.installPasteTransport({ delayMs: 0 }), /localhost/);
    assert.equal(h.window.fetch, h.original);
  }
});

test('the 60-minute entry costs its 220 kr drop-in price and socks 49 kr', async () => {
  const h = harness();
  const restore = h.installPasteTransport({ delayMs: 0 });
  const plain = await quote(h, {});
  assert.deepEqual(plain.costs, { total: 269, amountOwing: 269, discount: 0 });
  assert.equal(plain.discountCodes.requestedCount, 0);
  assert.equal(plain.giftCards.requestedCount, 0);
  restore();
  assert.equal(h.window.fetch, h.original);
});

test('a gift card covers the basket up to 866 kr', async () => {
  const h = harness();
  h.installPasteTransport({ delayMs: 0 });
  const covered = await quote(h, { giftCards: [{ giftCardNumber: '4000123456' }] });
  assert.deepEqual(covered.costs, { total: 269, amountOwing: 0, discount: 0 });
  assert.equal(covered.giftCards.totalApplied, 269);
  assert.deepEqual(covered.giftCards.errors, []);
  const response = await h.window.fetch('http://127.0.0.1:9/v1/bookings/quote', { method: 'POST', body: JSON.stringify({
    items: [{ productId: 1020, quantity: 5 }], giftCards: [{ giftCardNumber: '4000123456' }],
  }) });
  const large = (await response.json()).quote;
  assert.equal(large.giftCards.totalApplied, 866);
  assert.equal(large.costs.amountOwing, 1100 - 866);
});

test('a membership number takes 30 % off the entries only: -66 kr and 203 kr to pay', async () => {
  const h = harness();
  h.installPasteTransport({ delayMs: 0 });
  const member = await quote(h, { discountCodes: ['178000001-602000001'] });
  assert.deepEqual(member.costs, { total: 203, amountOwing: 203, discount: 66 });
  assert.equal(member.discountCodes.totalApplied, 66);
  assert.deepEqual(member.discountCodes.errors, []);
});

test('any other code or card is rejected and the price stays', async () => {
  const h = harness();
  h.installPasteTransport({ delayMs: 0 });
  for (const body of [{ discountCodes: ['SOMMAR25'] }, { discountCodes: ['123456789'] }, { giftCards: [{ giftCardNumber: '400012345' }] }]) {
    const rejected = await quote(h, body);
    assert.equal(rejected.costs.amountOwing, 269, JSON.stringify(body));
    const summary = body.giftCards ? rejected.giftCards : rejected.discountCodes;
    assert.equal(summary.errors.length, 1);
    assert.equal(summary.totalApplied, 0);
  }
});

test('drafts and every other API request stay local and blocked; assets pass through', async () => {
  const h = harness();
  h.installPasteTransport({ delayMs: 0 });
  for (const path of ['/v1/bookings/draft', '/v1/bookings/DEMO/add-products/quote', '/v1/check-in/lookup']) {
    assert.equal((await h.window.fetch(`http://127.0.0.1:9${path}`, { method: 'POST', body: '{}' })).status, 409, path);
  }
  const availability = await h.window.fetch('https://example.invalid/v1/bookings/availability', { method: 'POST', body: JSON.stringify({ startTimes: ['17:00'] }) });
  assert.equal((await availability.json()).availability.slots[0].products.find((product) => product.key === 'entry-60').unitPrice, 220);
  assert.equal(h.forwarded.length, 0);
  await h.window.fetch('/fonts/acumin.woff2');
  assert.equal(h.forwarded.length, 1);
});
