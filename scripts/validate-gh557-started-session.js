#!/usr/bin/env node
'use strict';

// GH-557: run the real availability validation and quote handler with isolated providers to prove
// that a session ROLLER still sells after its start is accepted, that a started session ROLLER has
// closed answers `session_started`, and that full or closed future sessions keep `capacity_unavailable`.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bookingPath = path.resolve(__dirname, '../infra/lambda/booking/index.js');
const catalogPath = path.join(path.dirname(bookingPath), 'phone-product-catalog.js');
const DATE = '2026-10-15';
const E60 = { parentId: '1189805', parentName: 'Entré 60 min', productId: '1189808', kronor: 200 };
// ROLLER's answer on 2026-10-15 at 14:34 (read-only): every session of the day is listed, and a
// session stays on sale until 10 minutes after its start, then `onlineSalesOpen` turns false.
const SESSIONS = [
  { startTime: '14:00', endTime: '15:00', capacityRemaining: 133, onlineSalesOpen: false },
  { startTime: '14:30', endTime: '15:30', capacityRemaining: 133, onlineSalesOpen: true },
  { startTime: '15:00', endTime: '16:00', capacityRemaining: 0, onlineSalesOpen: true },
  { startTime: '16:00', endTime: '17:00', capacityRemaining: 50, onlineSalesOpen: false },
];

const cacheRows = [
  { parent_product_id: null, parent_product_name: null, id: E60.parentId, name: E60.parentName, price_cents: null },
  {
    parent_product_id: E60.parentId, parent_product_name: E60.parentName, id: E60.productId,
    name: `Biljetter (${E60.kronor} kr)`, price_cents: E60.kronor * 100,
  },
];

const providerAvailability = [{
  id: E60.parentId,
  parentProductId: E60.parentId,
  name: E60.parentName,
  products: [{ id: E60.productId, name: `Biljetter (${E60.kronor} kr)`, cost: E60.kronor, isSuspended: false }],
  sessions: SESSIONS.map((session) => ({
    ...session,
    allocations: [{ productId: E60.productId, capacityRemaining: session.capacityRemaining }],
  })),
}];

function rdsResult(rows, columns) {
  return {
    columnMetadata: columns.map((name) => ({ name })),
    records: rows.map((row) => columns.map((name) => (
      row[name] === null || row[name] === undefined ? { isNull: true } : { stringValue: String(row[name]) }
    ))),
  };
}

function load(nowIso) {
  const calls = { availability: [], costs: [], events: [] };
  const failExternal = () => { throw new Error('Unexpected external call or business write in GH-557 checks.'); };
  const catalogModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(catalogPath, 'utf8'), {
    module: catalogModule, exports: catalogModule.exports, URL, AbortController, setTimeout, clearTimeout,
    fetch: failExternal,
  }, { filename: catalogPath });

  const module = { exports: {} };
  const aws = new Proxy({}, { get: () => class { send() { return failExternal(); } } });
  vm.runInNewContext(`${fs.readFileSync(bookingPath, 'utf8')}
    module.exports.__gh557 = {
      handleQuote,
      hasVenueSessionStarted,
      validateItemsAvailable,
      inject(stubs) {
        currentVenueTime = stubs.now;
        getRollerConfig = stubs.config;
        getRollerAccessToken = stubs.token;
        executeStatement = stubs.execute;
        getRollerJson = stubs.availability;
        postRollerJson = stubs.costs;
        writeBookingEventLog = stubs.event;
        emitRollerApiMetric = () => {};
      }
    };`, {
    module, exports: module.exports, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout,
    console: { log() {}, error() {}, info() {}, warn() {} },
    process: { env: { JUMPYARD_ENVIRONMENT: 'park-test' } }, fetch: failExternal,
    require(id) {
      if (id === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (id === 'crypto') return crypto;
      if (id.startsWith('@aws-sdk/')) return aws;
      if (id === './phone-product-catalog') return catalogModule.exports;
      if (id.startsWith('./')) return require(path.join(path.dirname(bookingPath), id));
      throw new Error(`Unexpected module ${id}`);
    },
  }, { filename: bookingPath });

  const api = module.exports.__gh557;
  api.inject({
    now: () => new Date(nowIso),
    config: async () => ({ env: 'live' }),
    token: async () => ({ accessToken: 'synthetic-not-a-credential', tokenType: 'Bearer' }),
    execute: async (sql, parameters = []) => {
      if (/AS product_id/.test(sql)) {
        const ids = parameters.filter((parameter) => /^productId\d+$/.test(parameter.name)).map((parameter) => parameter.value.stringValue);
        const rows = cacheRows.filter((row) => ids.includes(row.id)).map((row) => ({
          product_id: row.id,
          parent_product_id: row.parent_product_id ?? row.id,
          product_name: row.name,
          parent_product_name: row.parent_product_name,
          price_cents: row.price_cents,
        }));
        return rdsResult(rows, ['product_id', 'parent_product_id', 'product_name', 'parent_product_name', 'price_cents']);
      }
      throw new Error(`Unexpected SQL in GH-557 checks: ${sql.slice(0, 80)}`);
    },
    availability: async (_config, _token, endpoint) => {
      const url = new URL(endpoint, 'https://synthetic.invalid');
      assert.equal(url.pathname, '/product-availability', 'only the existing read endpoint is allowed');
      calls.availability.push(url.searchParams.get('Date'));
      return { ok: true, status: 200, body: providerAvailability };
    },
    costs: async (_config, _token, endpoint, payload) => {
      assert.equal(endpoint, '/bookings/draft/costs', 'quotes only price; they never create drafts');
      calls.costs.push(payload);
      return { ok: true, status: 200, body: { bookingCosts: { total: E60.kronor, subTotal: E60.kronor, amountOwing: E60.kronor } } };
    },
    event: async (event) => calls.events.push(event),
  });
  return { api, calls };
}

function item(startTime, quantity = 1, bookingDate = DATE) {
  return { bookingDate, productId: Number(E60.productId), quantity, requiresAvailability: true, startTime };
}

async function main() {
  const failures = [];
  async function check(label, work) {
    try { await work(); console.log(`[pass] ${label}`); }
    catch (error) { failures.push(label); console.error(`[fail] ${label}: ${error.message}`); }
  }

  // 12:34 UTC is 14:34 in Stockholm (CEST), as in Gustav's case on 2026-10-15.
  const AT_1434 = '2026-10-15T12:34:00Z';

  await check('a session ROLLER still sells four minutes after its start is accepted with one read', async () => {
    const { api, calls } = load(AT_1434);
    assert.equal(await api.validateItemsAvailable({ env: 'live' }, {}, [item('14:30')]), null);
    assert.equal(calls.availability.length, 1, 'the single existing availability read');
  });

  await check('a started session ROLLER has closed answers session_started with the unchanged message', async () => {
    const { api } = load(AT_1434);
    const error = await api.validateItemsAvailable({ env: 'live' }, {}, [item('14:00')]);
    assert.equal(error?.code, 'session_started');
    assert.equal(error.message, `Product ${E60.productId} is not available for ${DATE} 14:00.`);
  });

  await check('full sessions and closed future sessions keep capacity_unavailable', async () => {
    const { api } = load(AT_1434);
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('15:00')]))?.code, 'capacity_unavailable');
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('16:00')]))?.code, 'capacity_unavailable');
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('14:30', 134)]))?.code, 'capacity_unavailable');
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('14:15')]))?.code, 'capacity_unavailable',
      'a start ROLLER does not list is not a session');
  });

  await check('a closed session of an earlier day counts as started', async () => {
    const { api } = load(AT_1434);
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('16:00', 1, '2026-10-14')]))?.code, 'session_started');
  });

  await check('the start is read on the venue clock across summer and winter time', async () => {
    const { api } = load(AT_1434);
    const at = (iso) => new Date(iso);
    assert.equal(api.hasVenueSessionStarted('2026-10-15', '14:00', at('2026-10-15T11:59:00Z')), false, '13:59 CEST');
    assert.equal(api.hasVenueSessionStarted('2026-10-15', '14:00', at('2026-10-15T12:00:00Z')), true, '14:00 CEST');
    assert.equal(api.hasVenueSessionStarted('2026-11-02', '14:00', at('2026-11-02T12:59:00Z')), false, '13:59 CET');
    assert.equal(api.hasVenueSessionStarted('2026-11-02', '14:00', at('2026-11-02T13:00:00Z')), true, '14:00 CET');
    assert.equal(api.hasVenueSessionStarted('2026-10-16', '00:00', at('2026-10-15T21:59:00Z')), false, 'tomorrow');
    assert.equal(api.hasVenueSessionStarted('2026-10-15', 'later', at(AT_1434)), false, 'unreadable start');
  });

  await check('a quote for the closed started session is refused before ROLLER prices it', async () => {
    const { api, calls } = load(AT_1434);
    const body = {
      customer: { firstName: 'Synthetic', email: 'synthetic@example.invalid' },
      items: [item('14:00', 2)],
      requireAvailability: true,
    };
    const result = await api.handleQuote({ headers: {} }, body, 'synthetic-gh557');
    assert.equal(result.statusCode, 409, result.body);
    const parsed = JSON.parse(result.body);
    assert.equal(parsed.status, 'blocked');
    assert.equal(parsed.error.code, 'session_started');
    assert.equal(calls.costs.length, 0, 'no ROLLER pricing for a closed session');
    assert.equal(calls.availability.length, 1, 'the quote keeps its single availability read');
  });

  await check('a quote for the just-started session ROLLER still sells is priced as today', async () => {
    const { api, calls } = load(AT_1434);
    const body = {
      customer: { firstName: 'Synthetic', email: 'synthetic@example.invalid' },
      items: [item('14:30', 2)],
      requireAvailability: true,
    };
    const result = await api.handleQuote({ headers: {} }, body, 'synthetic-gh557');
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(calls.costs.length, 1);
    assert.equal(calls.availability.length, 1);
  });

  await check('draft and add-on routes share the same availability validation', async () => {
    const source = fs.readFileSync(bookingPath, 'utf8');
    const callers = source.match(/request\.requireAvailability \? await validateItemsAvailable\(config, token, request\.items\) : null/g) ?? [];
    assert.equal(callers.length, 4, 'quote, draft, add-on quote and add-on draft');
  });

  if (failures.length > 0) {
    console.error(`GH-557 started-session checks failed: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('GH-557 started-session checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
