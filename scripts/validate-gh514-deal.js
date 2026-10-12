#!/usr/bin/env node
'use strict';

// GH-514: run the real availability, quote validation and quote handlers with isolated providers
// to prove ROLLER's "2 timmar för 1" deal sells at its Drop-In price without extra ROLLER calls,
// and only while the public web checkout lists it and ROLLER has a session for the start time.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bookingPath = path.resolve(__dirname, '../infra/lambda/booking/index.js');
const catalogPath = path.join(path.dirname(bookingPath), 'phone-product-catalog.js');
const DATE = '2026-10-13'; // a Tuesday: the deal is sold Monday to Thursday
const START_TIMES = ['10:00', '13:00', '17:00'];

// Nacka variants as cached on 2026-10-12: [id, kronor]. Every web price has one Drop-In at +20 kr.
const DEAL = {
  key: 'DEAL120', parentId: '1416422', parentName: '2 timmar för 1',
  web: [['1416423', 160], ['1416425', 179], ['1416427', 180], ['1416429', 200], ['1416431', 210]],
  dropIn: [['1416424', 180], ['1416426', 199], ['1416428', 200], ['1416430', 220], ['1416432', 230]],
  slots: { '10:00': '1416427', '13:00': '1416429', '17:00': '1416431' },
  expected: { '10:00': ['1416428', 20000], '13:00': ['1416430', 22000], '17:00': ['1416432', 23000] },
};
// The six required entry parents, one web and one Drop-In variant each (their pricing is GH-501's).
const ENTRIES = [
  ['E60', '1189805', 'Entré 60 min', '1189809', 220, '1189813', 240],
  ['E90', '1189823', 'Entré 90 min', '1189827', 270, '1189831', 290],
  ['E120', '1189771', 'Entré 120 min', '1189776', 320, '1189781', 340],
  ['F60', '1189814', 'Entré 60 min - Familj', '1189818', 660, '1189822', 720],
  ['F90', '1189832', 'Entré 90 min - Familj', '1189836', 810, '1189840', 870],
  ['F120', '1189794', 'Entré 120 min - Familj', '1189799', 960, '1189804', 1020],
].map(([key, parentId, parentName, webId, web, dropInId, dropIn]) => ({ key, parentId, parentName, webId, web, dropInId, dropIn }));

const dealWebName = (kronor) => `2 timmar för 1 (${kronor} kr)`;
const dealDropInName = (kronor) => `2 timmar för 1 (Drop-In - ${kronor} kr)`;

function cacheRows({ withDeal = true } = {}) {
  return [
    ...ENTRIES.flatMap((entry) => [
      { parent_product_id: entry.parentId, parent_product_name: entry.parentName, id: entry.parentId, name: entry.parentName, price_cents: null },
      { parent_product_id: entry.parentId, parent_product_name: entry.parentName, id: entry.webId, name: `Biljetter (${entry.web} kr)`, price_cents: entry.web * 100 },
      { parent_product_id: entry.parentId, parent_product_name: entry.parentName, id: entry.dropInId, name: `Biljetter (Drop-In - ${entry.dropIn} kr)`, price_cents: entry.dropIn * 100 },
    ]),
    ...(withDeal ? [
      { parent_product_id: DEAL.parentId, parent_product_name: DEAL.parentName, id: DEAL.parentId, name: DEAL.parentName, price_cents: null },
      ...DEAL.web.map(([id, kronor]) => ({
        parent_product_id: DEAL.parentId, parent_product_name: DEAL.parentName, id, name: dealWebName(kronor), price_cents: kronor * 100,
      })),
      ...DEAL.dropIn.map(([id, kronor]) => ({
        parent_product_id: DEAL.parentId, parent_product_name: DEAL.parentName, id, name: dealDropInName(kronor), price_cents: kronor * 100,
      })),
    ] : []),
  ];
}

function providerAvailability({ dealSessions = true } = {}) {
  return [
    ...ENTRIES.map((entry) => ({
      id: entry.parentId,
      parentProductId: entry.parentId,
      name: entry.parentName,
      products: [{ id: entry.webId, name: `Biljetter (${entry.web} kr)`, cost: entry.web, isSuspended: false }],
      sessions: START_TIMES.map((startTime) => ({
        startTime, endTime: '20:00', capacityRemaining: 40, onlineSalesOpen: true,
        allocations: [{ productId: entry.webId, capacityRemaining: 40 }],
      })),
    })),
    {
      id: DEAL.parentId,
      parentProductId: DEAL.parentId,
      name: DEAL.parentName,
      products: DEAL.web.map(([id, kronor]) => ({ id, name: dealWebName(kronor), cost: kronor, isSuspended: false })),
      // ROLLER keeps the parent but has no sessions on days the deal is not sold (Friday to Sunday).
      sessions: dealSessions ? START_TIMES.map((startTime) => ({
        startTime, endTime: '20:00', capacityRemaining: 40, onlineSalesOpen: true,
        allocations: [{ productId: DEAL.slots[startTime], capacityRemaining: 40 }],
      })) : [],
    },
  ];
}

const SOCKS = {
  key: 'socks', productId: '970338', parentProductId: '970337', productName: 'Antal', label: 'Strumpor',
  type: 'addon', durationMinutes: 0, jumpersPerUnit: 1, requiresAvailability: false, unitPrice: 45, unitPriceCents: 4500,
};

function rdsResult(rows, columns) {
  return {
    columnMetadata: columns.map((name) => ({ name })),
    records: rows.map((row) => columns.map((name) => (
      row[name] === null || row[name] === undefined ? { isNull: true } : { stringValue: String(row[name]) }
    ))),
  };
}

function load({ catalog = 'listed', dealSessions = true, withDeal = true } = {}) {
  const calls = { availability: [], catalogs: 0, costs: [], events: [], sql: [], warnings: [] };
  const rows = cacheRows({ withDeal });
  const failExternal = () => { throw new Error('Unexpected external call or business write in GH-514 checks.'); };
  const catalogModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(catalogPath, 'utf8'), {
    module: catalogModule, exports: catalogModule.exports, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      calls.catalogs += 1;
      assert.equal(new URL(url).pathname, '/api/checkout/boka/products');
      if (catalog === 'failed') return { ok: false, status: 500, text: async () => JSON.stringify([{ id: Number(DEAL.parentId) }]) };
      const listed = catalog === 'listed' ? [{ id: Number(DEAL.parentId), name: DEAL.parentName }] : [];
      return { ok: true, status: 200, text: async () => JSON.stringify([...listed, { id: 1189823, name: 'Entré 90 min' }]) };
    },
  }, { filename: catalogPath });

  const module = { exports: {} };
  const aws = new Proxy({}, { get: () => class { send() { return failExternal(); } } });
  vm.runInNewContext(`${fs.readFileSync(bookingPath, 'utf8')}
    module.exports.__gh514 = {
      handleAvailability,
      handleQuote,
      validateItemsAvailable,
      inject(stubs) {
        getRollerConfig = stubs.config;
        getRollerAccessToken = stubs.token;
        executeStatement = stubs.execute;
        loadPhoneAddonProducts = stubs.addons;
        getRollerJson = stubs.availability;
        postRollerJson = stubs.costs;
        writeBookingEventLog = stubs.event;
        emitRollerApiMetric = () => {};
      }
    };`, {
    module, exports: module.exports, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout,
    console: { log() {}, error() {}, info() {}, warn: (line) => calls.warnings.push(line) },
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

  const api = module.exports.__gh514;
  api.inject({
    config: async () => ({ env: 'live' }),
    token: async () => ({ accessToken: 'synthetic-not-a-credential', tokenType: 'Bearer' }),
    execute: async (sql, parameters = []) => {
      calls.sql.push(sql);
      if (/AS price_cents/.test(sql) && /parentProductName' IN \(/.test(sql)) {
        assert.match(sql, /'2 timmar för 1'/, 'the entry catalog read names the deal parent');
        return rdsResult(rows, ['parent_product_id', 'parent_product_name', 'id', 'name', 'price_cents']);
      }
      if (/AS product_id/.test(sql)) {
        const ids = parameters.filter((parameter) => /^productId\d+$/.test(parameter.name)).map((parameter) => parameter.value.stringValue);
        const found = rows.filter((row) => ids.includes(row.id)).map((row) => ({
          product_id: row.id,
          parent_product_id: row.parent_product_id ?? row.id,
          product_name: row.name,
          parent_product_name: row.parent_product_name,
          price_cents: row.price_cents,
        }));
        return rdsResult(found, ['product_id', 'parent_product_id', 'product_name', 'parent_product_name', 'price_cents']);
      }
      throw new Error(`Unexpected SQL in GH-514 checks: ${sql.slice(0, 80)}`);
    },
    addons: async () => [SOCKS],
    availability: async (_config, _token, endpoint) => {
      const url = new URL(endpoint, 'https://synthetic.invalid');
      assert.equal(url.pathname, '/product-availability', 'only the existing read endpoint is allowed');
      assert.equal(url.searchParams.get('Date'), DATE);
      calls.availability.push(url.searchParams.get('ProductIds'));
      return { ok: true, status: 200, body: providerAvailability({ dealSessions }) };
    },
    costs: async (_config, _token, endpoint, payload) => {
      assert.equal(endpoint, '/bookings/draft/costs', 'quotes only price; they never create drafts');
      calls.costs.push(payload);
      const total = payload.items.reduce((sum, entry) => {
        const row = rows.find((candidate) => candidate.id === String(entry.productId));
        return sum + (Number(row?.price_cents ?? 0) / 100) * entry.quantity;
      }, 0);
      return { ok: true, status: 200, body: { bookingCosts: { total, subTotal: total, amountOwing: total } } };
    },
    event: async (event) => calls.events.push(event),
  });
  return { api, calls };
}

function item(productId, startTime, quantity = 1) {
  return { bookingDate: DATE, productId: Number(productId), quantity, requiresAvailability: true, startTime };
}

async function availability(options) {
  const { api, calls } = load(options);
  const result = await api.handleAvailability({ date: DATE, startTimes: START_TIMES }, 'synthetic-gh514');
  assert.equal(result.statusCode, 200, result.body);
  return { body: JSON.parse(result.body), calls };
}

function assertEntriesUnchanged(slot) {
  for (const entry of ENTRIES) {
    const product = slot.products.find((candidate) => candidate.key === entry.key);
    assert.equal(product?.productId, entry.dropInId, `${entry.key} keeps its GH-501 Drop-In price`);
    assert.equal(product.available, true);
  }
}

async function main() {
  const failures = [];
  async function check(label, work) {
    try { await work(); console.log(`[pass] ${label}`); }
    catch (error) { failures.push(label); console.error(`[fail] ${label}: ${error.message}`); }
  }

  await check('a deal day returns the deal at its Drop-In price in every slot from the one ROLLER read', async () => {
    const { body, calls } = await availability();
    for (const slot of body.availability.slots) {
      const deal = slot.products.find((candidate) => candidate.key === DEAL.key);
      const [productId, cents] = DEAL.expected[slot.startTime];
      assert.ok(deal, `deal present at ${slot.startTime}`);
      assert.equal(deal.type, 'deal');
      assert.equal(deal.label, '2 timmar för 1');
      assert.equal(deal.durationMinutes, 120);
      assert.equal(deal.jumpersPerUnit, 1);
      assert.equal(deal.parentProductId, DEAL.parentId);
      assert.equal(deal.productId, productId, `deal ${slot.startTime} product`);
      assert.equal(deal.unitPriceCents, cents, `deal ${slot.startTime} price`);
      assert.equal(deal.unitPrice, cents / 100);
      assert.equal(deal.available, true);
      assert.equal(deal.packageContents, undefined, 'the deal is a plain admission, no package contents');
      assertEntriesUnchanged(slot);
    }
    assert.match(body.availability.slots[1].products.find((product) => product.key === DEAL.key).productName, /Drop-In - 220 kr/);
    assert.equal(calls.availability.length, 1, 'exactly the one existing ROLLER availability read');
    assert.ok(calls.availability[0].split(',').includes(DEAL.parentId), 'the deal parent joins that read');
    assert.equal(calls.catalogs, 1, 'the existing public catalog read decides eligibility');
    assert.equal(calls.costs.length, 0);
    assert.equal(calls.sql.length, 1, 'the existing entry catalog read carries the deal and its Drop-In siblings');
    assert.equal(calls.warnings.length, 0, 'every deal slot found its Drop-In sibling');
  });

  await check('the deal disappears when the public web checkout no longer lists it; entries are unchanged', async () => {
    const { body, calls } = await availability({ catalog: 'unlisted' });
    for (const slot of body.availability.slots) {
      assert.equal(slot.products.some((product) => product.key === DEAL.key), false, slot.startTime);
      assertEntriesUnchanged(slot);
    }
    assert.equal(calls.availability.length, 1);
    assert.equal(calls.availability[0].split(',').includes(DEAL.parentId), false, 'an unlisted deal is not even read');
  });

  await check('a failed public catalog read omits the deal (fail closed) and never blocks the entries', async () => {
    const { body } = await availability({ catalog: 'failed' });
    for (const slot of body.availability.slots) {
      assert.equal(slot.products.some((product) => product.key === DEAL.key), false, slot.startTime);
      assertEntriesUnchanged(slot);
    }
  });

  await check('a day without deal sessions (Friday to Sunday) returns the deal as unavailable, so the apps hide it', async () => {
    const { body } = await availability({ dealSessions: false });
    for (const slot of body.availability.slots) {
      const deal = slot.products.find((product) => product.key === DEAL.key);
      assert.equal(deal?.available ?? false, false, slot.startTime);
      assertEntriesUnchanged(slot);
    }
  });

  await check('a cache without the deal (renamed or removed in ROLLER) is optional: entries still sell', async () => {
    const { body } = await availability({ withDeal: false });
    for (const slot of body.availability.slots) {
      assert.equal(slot.products.some((product) => product.key === DEAL.key), false, slot.startTime);
      assertEntriesUnchanged(slot);
    }
  });

  await check('validation accepts the returned deal Drop-In ids at their own slots and rejects other tiers', async () => {
    const { api } = load();
    for (const startTime of START_TIMES) {
      const [productId] = DEAL.expected[startTime];
      assert.equal(await api.validateItemsAvailable({ env: 'live' }, {}, [item(productId, startTime)]), null, `${startTime} ${productId}`);
    }
    const cases = [
      ['1416428', '13:00', 'the 200 kr Drop-In at the slot whose web price is 200 kr'],
      ['1416432', '10:00', 'the 230 kr Drop-In at the 180 kr web slot'],
    ];
    for (const [productId, startTime, label] of cases) {
      const error = await api.validateItemsAvailable({ env: 'live' }, {}, [item(productId, startTime)]);
      assert.equal(error?.code, 'drop_in_price_mismatch', label);
    }
  });

  await check('a deal quote sends the Drop-In id to ROLLER costs unchanged and returns ROLLER\'s total', async () => {
    const { api, calls } = load();
    const body = {
      customer: { firstName: 'Synthetic', email: 'synthetic@example.invalid' },
      items: [item('1416430', '13:00', 2)],
      requireAvailability: true,
    };
    const result = await api.handleQuote({ headers: {} }, body, 'synthetic-gh514');
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(calls.costs.length, 1);
    assert.deepEqual(calls.costs[0].items.map((entry) => [entry.productId, entry.quantity, entry.startTime]), [[1416430, 2, '13:00']]);
    assert.equal(JSON.parse(result.body).quote.costs.total, 440);
    assert.equal(calls.availability.length, 1, 'the quote validation keeps its single availability read');
  });

  if (failures.length > 0) {
    console.error(`GH-514 validation failed: ${failures.length} check(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('GH-514 deal validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
