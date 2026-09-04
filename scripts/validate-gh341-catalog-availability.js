#!/usr/bin/env node
'use strict';

// Exercise the actual availability handler and public-catalog parser with isolated providers.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bookingPath = path.resolve(__dirname, '../infra/lambda/booking/index.js');
const catalogPath = path.join(path.dirname(bookingPath), 'phone-product-catalog.js');
const request = { date: '2026-09-04', startTimes: ['18:00', '19:00'] };
const definitions = ['E60', 'E90', 'E120', 'F60', 'F90', 'F120'].map((key, index) => ({
  key,
  parentProductId: String(1189805 + index),
  label: key,
  type: key.startsWith('F') ? 'family' : 'entry',
  durationMinutes: Number(key.slice(1)),
  jumpersPerUnit: key.startsWith('F') ? 4 : 1,
}));
definitions.push({
  key: 'COMBO60', parentProductId: '1242135', availabilityProductIds: ['1242136'],
  publicCatalogRequired: true, label: 'Weekday Combo', type: 'combo',
  durationMinutes: 60, jumpersPerUnit: 2,
});
const comboCatalog = [{ id: 1242135, name: 'Weekday Combo' }];
const providerAvailability = definitions.map((definition, index) => {
  const childId = definition.availabilityProductIds?.[0] ?? String(2000000 + index);
  return {
    parentProductId: definition.parentProductId,
    products: [{ id: childId, name: definition.label, cost: 200, isSuspended: false }],
    sessions: request.startTimes.map((startTime) => ({
      startTime,
      endTime: '20:00',
      capacityRemaining: 20,
      onlineSalesOpen: !(definition.key === 'E90' && startTime === '19:00'),
      allocations: [{ productId: childId }],
    })),
  };
});

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function fakeClock() {
  const pending = new Map();
  const scheduled = [];
  let id = 0;
  return {
    pending, scheduled,
    setTimeout(callback, delay) {
      scheduled.push(delay);
      pending.set(++id, { callback, delay });
      return id;
    },
    clearTimeout(timer) { pending.delete(timer); },
    runDeadline() {
      assert.equal(pending.size, 1, 'a stalled catalog must have one bounded deadline');
      const [timer, entry] = [...pending.entries()][0];
      assert.equal(entry.delay, 2000, 'catalog deadline must not exceed the agreed two seconds');
      pending.delete(timer);
      entry.callback();
    },
  };
}

async function flushMicrotasks() {
  for (let iteration = 0; iteration < 30; iteration += 1) await Promise.resolve();
}

function load(catalogFetch, options = {}) {
  const calls = { catalogs: [], availability: [], events: [], metrics: [], cacheReads: 0 };
  const clock = fakeClock();
  const failExternal = () => { throw new Error('Unexpected external call or business write in GH-341 tests.'); };
  const catalogModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(catalogPath, 'utf8'), {
    module: catalogModule, exports: catalogModule.exports, URL, AbortController,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    fetch: async (url, init) => {
      calls.catalogs.push({ url: String(url), init });
      assert.equal(init.method, 'GET');
      assert.equal(new URL(url).pathname, '/api/checkout/boka/products');
      return catalogFetch(url, init);
    },
  }, { filename: catalogPath });

  const module = { exports: {} };
  const aws = new Proxy({}, { get: () => class { send() { return failExternal(); } } });
  vm.runInNewContext(`${fs.readFileSync(bookingPath, 'utf8')}
    module.exports.__gh341 = {
      handleAvailability,
      inject(stubs) {
        getRollerConfig = stubs.config;
        getRollerAccessToken = stubs.token;
        loadPhoneBookingParentProducts = stubs.parents;
        loadPhoneAddonProducts = stubs.addons;
        getRollerJson = stubs.availability;
        writeBookingEventLog = stubs.event;
        emitRollerApiMetric = stubs.metric;
      }
    };`, {
    module, exports: module.exports, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout, console: { log() {}, error() {} },
    process: { env: { JUMPYARD_ENVIRONMENT: 'park-test' } }, fetch: failExternal,
    require(id) {
      if (id === 'crypto') return crypto;
      if (id.startsWith('@aws-sdk/')) return aws;
      if (id === './phone-product-catalog') return catalogModule.exports;
      if (id.startsWith('./')) return require(path.join(path.dirname(bookingPath), id));
      throw new Error(`Unexpected module ${id}`);
    },
  }, { filename: bookingPath });
  const api = module.exports.__gh341;
  api.inject({
    config: async () => ({ env: options.environment ?? 'live' }),
    token: async () => ({ accessToken: 'synthetic-not-a-credential' }),
    parents: async () => { calls.cacheReads += 1; return definitions; },
    addons: async () => { calls.cacheReads += 1; return []; },
    availability: async (_config, _token, endpoint) => {
      const url = new URL(endpoint, 'https://synthetic.invalid');
      assert.equal(url.pathname, '/product-availability', 'only the existing read endpoint is allowed');
      assert.equal(url.searchParams.get('Date'), request.date);
      calls.availability.push(url);
      return options.availability ?? { ok: true, status: 200, body: providerAvailability };
    },
    event: async (event) => calls.events.push(event),
    metric: (metric) => calls.metrics.push(metric),
  });
  return { calls, clock, run: async () => {
    const result = await api.handleAvailability(request, 'synthetic-gh341');
    return { status: result.statusCode, body: JSON.parse(result.body) };
  } };
}

function assertNormalEntries(result, api, { catalogStatus = 'unavailable', combo = false, skipped = false } = {}) {
  assert.equal(result.status, 200, 'catalog failure must not block authoritative entry availability');
  assert.equal(result.body.status, 'available');
  assert.equal(result.body.source.catalogStatus, catalogStatus);
  assert.equal(result.body.source.wroteBooking, false);
  assert.equal(api.calls.catalogs.length, skipped ? 0 : 1, 'catalog requests must not retry');
  assert.equal(api.calls.availability.length, 1, 'exactly one authoritative availability request is required');
  assert.equal(api.calls.cacheReads, 2, 'the existing booking and add-on cache reads are sufficient');
  const queriedParents = api.calls.availability[0].searchParams.get('ProductIds').split(',');
  assert.deepEqual(queriedParents.slice().sort(), definitions
    .filter((definition) => combo || definition.key !== 'COMBO60')
    .map((definition) => definition.parentProductId).sort());
  for (const slot of result.body.availability.slots) {
    assert.equal(slot.products.some((product) => product.key === 'COMBO60'), combo);
    for (const key of ['E60', 'E90', 'E120', 'F60', 'F90', 'F120']) {
      const product = slot.products.find((item) => item.key === key);
      assert.ok(product, `${key} must remain present`);
      assert.equal(product.available, !(key === 'E90' && slot.startTime === '19:00'),
        `${key} at ${slot.startTime} must preserve the authoritative provider result`);
      assert.equal(product.unitPriceCents, 20000);
    }
  }
  assert.equal(api.clock.pending.size, 0, 'finished requests must clean up their deadline');
}

async function main() {
  const failures = [];
  async function check(label, work) {
    try { await work(); console.log(`[pass] ${label}`); }
    catch (error) { failures.push(label); console.error(`[fail] ${label}: ${error.message}`); }
  }

  const failuresToSimulate = [
    ['HTTP failure', async () => response({ error: 'unavailable' }, 503)],
    ['HTTP 500 containing valid-looking Combo IDs', async () => response(comboCatalog, 500)],
    ['network rejection', async () => { throw new Error('synthetic connection failure'); }],
    ['malformed JSON', async () => ({ ok: true, status: 200, text: async () => '{broken' })],
    ['wrong response shape', async () => response({ products: comboCatalog })],
    ['unreadable response body', async () => ({ ok: true, status: 200, text: async () => { throw new Error('body lost'); } })],
  ];
  for (const [label, fetch] of failuresToSimulate) {
    await check(`${label}: ordinary entries survive and Combo stays hidden`, async () => {
      const api = load(fetch);
      assertNormalEntries(await api.run(), api);
      assert.equal(api.calls.events.filter((event) => event.eventType === 'booking.public_catalog_failed').length, 1);
      assert.equal(api.calls.metrics.filter((metric) => metric.operation === 'get_public_checkout_products' && !metric.ok).length, 1);
    });
  }

  for (const [label, fetch] of [
    ['fetch rejects synchronously on abort', (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true });
    })],
    ['fetch ignores abort', async () => new Promise(() => {})],
    ['response body never settles', async () => ({ ok: true, status: 200, text: () => new Promise(() => {}) })],
  ]) {
    await check(`${label}: two-second deadline releases ordinary availability`, async () => {
      const api = load(fetch);
      const result = api.run();
      await flushMicrotasks();
      api.clock.runDeadline();
      assertNormalEntries(await result, api);
      assert.equal(api.calls.catalogs[0].init.signal.aborted, true);
      const failure = api.calls.events.find((event) => event.eventType === 'booking.public_catalog_failed');
      assert.equal(failure?.payload.timedOut, true, 'timeout diagnosis must survive synchronous abort rejection');
    });
  }

  await check('verified hidden catalog omits Combo without hiding entry tickets', async () => {
    const api = load(async () => response([]));
    assertNormalEntries(await api.run(), api, { catalogStatus: 'verified' });
  });
  await check('verified visible Combo remains sellable and ordinary E90 stays closed at 19:00', async () => {
    const api = load(async () => response(comboCatalog));
    assertNormalEntries(await api.run(), api, { catalogStatus: 'verified', combo: true });
    assert.equal(api.calls.events.some((event) => event.eventType === 'booking.public_catalog_failed'), false);
  });
  await check('a later catalog outage cannot reuse a previously visible Combo', async () => {
    let invocation = 0;
    const api = load(async () => ++invocation === 1 ? response(comboCatalog) : response(comboCatalog, 500));
    assertNormalEntries(await api.run(), api, { catalogStatus: 'verified', combo: true });
    api.calls.catalogs.length = 0;
    api.calls.availability.length = 0;
    api.calls.cacheReads = 0;
    assertNormalEntries(await api.run(), api);
  });
  await check('Playground keeps its existing catalog-independent availability', async () => {
    const api = load(() => { throw new Error('Playground must not fetch the Live public catalog'); }, { environment: 'playground' });
    assertNormalEntries(await api.run(), api, { catalogStatus: 'not_required', combo: true, skipped: true });
  });
  await check('real authoritative availability failure still blocks after catalog failure', async () => {
    const api = load(async () => response(comboCatalog, 500), {
      availability: { ok: false, status: 503, body: { message: 'synthetic provider unavailable' } },
    });
    const result = await api.run();
    assert.equal(result.status, 502);
    assert.equal(result.body.error.code, 'roller_availability_failed');
    assert.equal(result.body.availability, undefined);
    assert.equal(api.calls.catalogs.length, 1);
    assert.equal(api.calls.availability.length, 1);
  });
  if (failures.length) throw new Error(`${failures.length} GH-341 behavioral regression(s) failed.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
