#!/usr/bin/env node
'use strict';

// GH-501: run the real availability, quote validation and quote handlers with isolated
// providers to prove entries sell as ROLLER's Drop-In siblings without extra ROLLER calls.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bookingPath = path.resolve(__dirname, '../infra/lambda/booking/index.js');
const catalogPath = path.join(path.dirname(bookingPath), 'phone-product-catalog.js');
const DATE = '2026-10-10';
const START_TIMES = ['10:00', '13:00', '17:00'];

// Nacka variants as cached on 2026-10-09: [id, name, kronor]. Web per slot follows ROLLER's
// Saturday 2026-10-10 availability. F120 17:00 uses the 870 kr tier whose sibling is mispriced.
const ENTRIES = [
  {
    key: 'E60', parentId: '1189805', parentName: 'Entré 60 min',
    web: [['1189807', 180], ['1189808', 200], ['1189809', 220]],
    dropIn: [['1407467', 169], ['1189810', 190], ['1189811', 200], ['1189812', 220], ['1407468', 239], ['1189813', 240]],
    slots: { '10:00': '1189808', '13:00': '1189809', '17:00': '1189807' },
    expected: { '10:00': ['1189812', 22000], '13:00': ['1189813', 24000], '17:00': ['1189811', 20000] },
  },
  {
    key: 'E90', parentId: '1189823', parentName: 'Entré 90 min',
    web: [['1189825', 230], ['1189826', 250], ['1189827', 270]],
    dropIn: [['1407481', 219], ['1189828', 240], ['1189829', 250], ['1189830', 270], ['1407482', 289], ['1189831', 290]],
    slots: { '10:00': '1189826', '13:00': '1189827', '17:00': '1189825' },
    expected: { '10:00': ['1189830', 27000], '13:00': ['1189831', 29000], '17:00': ['1189829', 25000] },
    capacity: { '13:00': 1 },
  },
  {
    key: 'E120', parentId: '1189771', parentName: 'Entré 120 min',
    web: [['1189773', 280], ['1189775', 300], ['1189776', 320]],
    dropIn: [['1407533', 269], ['1189777', 280], ['1189778', 300], ['1189779', 310], ['1189780', 320], ['1407534', 339], ['1189781', 340]],
    slots: { '10:00': '1189775', '13:00': '1189776', '17:00': '1189773' },
    expected: { '10:00': ['1189780', 32000], '13:00': ['1189781', 34000], '17:00': ['1189778', 30000] },
  },
  {
    key: 'F60', parentId: '1189814', parentName: 'Entré 60 min - Familj',
    web: [['1189815', 540], ['1189817', 600], ['1189818', 660]],
    dropIn: [['1407674', 509], ['1189819', 600], ['1189820', 630], ['1189821', 660], ['1407675', 719], ['1189822', 720]],
    slots: { '10:00': '1189817', '13:00': '1189818', '17:00': '1189815' },
    expected: { '10:00': ['1189821', 66000], '13:00': ['1189822', 72000], '17:00': ['1189819', 60000] },
  },
  {
    key: 'F90', parentId: '1189832', parentName: 'Entré 90 min - Familj',
    web: [['1189834', 690], ['1189835', 750], ['1189836', 810]],
    dropIn: [['1407686', 659], ['1189837', 720], ['1189838', 750], ['1189839', 810], ['1407687', 869], ['1189840', 870]],
    slots: { '10:00': '1189835', '13:00': '1189836', '17:00': '1189834' },
    expected: { '10:00': ['1189839', 81000], '13:00': ['1189840', 87000], '17:00': ['1189838', 75000] },
  },
  {
    key: 'F120', parentId: '1189794', parentName: 'Entré 120 min - Familj',
    web: [['1189796', 840], ['1189797', 870], ['1189798', 900], ['1189799', 960]],
    dropIn: [['1407698', 809], ['1189800', 840], ['1189801', 870], ['1189802', 900], ['1189803', 960], ['1407699', 1019], ['1189804', 1020]],
    slots: { '10:00': '1189798', '13:00': '1189799', '17:00': '1189797' },
    expected: { '10:00': ['1189803', 96000], '13:00': ['1189804', 102000], '17:00': ['1189797', 87000] },
  },
];
const COMBO = { parentId: '1242135', parentName: 'Weekday Combo', childId: '1242136', kronor: 450 };
const SKYRIDER_DROP_IN = { id: '5550001', name: 'Biljetter (Drop-In - 60 kr)', parentId: '970335', parentName: 'SkyRider', kronor: 60 };

const webName = (kronor) => `Biljetter (${kronor} kr)`;
const dropInName = (kronor) => `Biljetter (Drop-In - ${kronor} kr)`;

const cacheRows = [
  ...ENTRIES.flatMap((entry) => [
    { parent_product_id: null, parent_product_name: null, id: entry.parentId, name: entry.parentName, price_cents: null },
    ...entry.web.map(([id, kronor]) => ({
      parent_product_id: entry.parentId, parent_product_name: entry.parentName, id, name: webName(kronor), price_cents: kronor * 100,
    })),
    ...entry.dropIn.map(([id, kronor]) => ({
      parent_product_id: entry.parentId, parent_product_name: entry.parentName, id, name: dropInName(kronor), price_cents: kronor * 100,
    })),
  ]),
  { parent_product_id: null, parent_product_name: null, id: COMBO.parentId, name: COMBO.parentName, price_cents: null },
  { parent_product_id: COMBO.parentId, parent_product_name: COMBO.parentName, id: COMBO.childId, name: COMBO.parentName, price_cents: COMBO.kronor * 100 },
  {
    parent_product_id: SKYRIDER_DROP_IN.parentId, parent_product_name: SKYRIDER_DROP_IN.parentName,
    id: SKYRIDER_DROP_IN.id, name: SKYRIDER_DROP_IN.name, price_cents: SKYRIDER_DROP_IN.kronor * 100,
  },
];

const providerAvailability = [
  ...ENTRIES.map((entry) => ({
    id: entry.parentId,
    parentProductId: entry.parentId,
    name: entry.parentName,
    products: entry.web.map(([id, kronor]) => ({ id, name: webName(kronor), cost: kronor, isSuspended: false })),
    sessions: START_TIMES.map((startTime) => ({
      startTime,
      endTime: '20:00',
      capacityRemaining: entry.capacity?.[startTime] ?? 40,
      onlineSalesOpen: true,
      allocations: [{ productId: entry.slots[startTime], capacityRemaining: entry.capacity?.[startTime] ?? 40 }],
    })),
  })),
  {
    id: COMBO.parentId,
    parentProductId: COMBO.parentId,
    name: COMBO.parentName,
    products: [{ id: COMBO.childId, name: COMBO.parentName, cost: COMBO.kronor, isSuspended: false }],
    sessions: START_TIMES.map((startTime) => ({
      startTime, endTime: '20:00', capacityRemaining: 10, onlineSalesOpen: true, allocations: [{ productId: COMBO.childId }],
    })),
  },
  {
    id: SKYRIDER_DROP_IN.parentId,
    parentProductId: SKYRIDER_DROP_IN.parentId,
    name: SKYRIDER_DROP_IN.parentName,
    products: [{ id: '970336', name: 'SkyRider', cost: 40, isSuspended: false }],
    sessions: START_TIMES.map((startTime) => ({
      startTime, endTime: '20:00', capacityRemaining: 10, onlineSalesOpen: true, allocations: [{ productId: '970336' }],
    })),
  },
];

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

function load() {
  const calls = { availability: [], catalogs: 0, costs: [], events: [], sql: [], warnings: [] };
  const failExternal = () => { throw new Error('Unexpected external call or business write in GH-501 checks.'); };
  const catalogModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(catalogPath, 'utf8'), {
    module: catalogModule, exports: catalogModule.exports, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url) => {
      calls.catalogs += 1;
      assert.equal(new URL(url).pathname, '/api/checkout/boka/products');
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: Number(COMBO.parentId), name: COMBO.parentName }]) };
    },
  }, { filename: catalogPath });

  const module = { exports: {} };
  const aws = new Proxy({}, { get: () => class { send() { return failExternal(); } } });
  vm.runInNewContext(`${fs.readFileSync(bookingPath, 'utf8')}
    module.exports.__gh501 = {
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

  const api = module.exports.__gh501;
  api.inject({
    config: async () => ({ env: 'live' }),
    token: async () => ({ accessToken: 'synthetic-not-a-credential', tokenType: 'Bearer' }),
    execute: async (sql, parameters = []) => {
      calls.sql.push(sql);
      if (/AS price_cents/.test(sql) && /parentProductName' IN \(/.test(sql)) {
        return rdsResult(cacheRows, ['parent_product_id', 'parent_product_name', 'id', 'name', 'price_cents']);
      }
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
      throw new Error(`Unexpected SQL in GH-501 checks: ${sql.slice(0, 80)}`);
    },
    addons: async () => [SOCKS],
    availability: async (_config, _token, endpoint) => {
      const url = new URL(endpoint, 'https://synthetic.invalid');
      assert.equal(url.pathname, '/product-availability', 'only the existing read endpoint is allowed');
      assert.equal(url.searchParams.get('Date'), DATE);
      calls.availability.push(url.searchParams.get('ProductIds'));
      return { ok: true, status: 200, body: providerAvailability };
    },
    costs: async (_config, _token, endpoint, payload) => {
      assert.equal(endpoint, '/bookings/draft/costs', 'quotes only price; they never create drafts');
      calls.costs.push(payload);
      const total = payload.items.reduce((sum, item) => {
        const row = cacheRows.find((candidate) => candidate.id === String(item.productId));
        return sum + (Number(row?.price_cents ?? 0) / 100) * item.quantity;
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

async function main() {
  const failures = [];
  async function check(label, work) {
    try { await work(); console.log(`[pass] ${label}`); }
    catch (error) { failures.push(label); console.error(`[fail] ${label}: ${error.message}`); }
  }

  await check('availability returns the Drop-In sibling for every entry slot from one ROLLER read', async () => {
    const { api, calls } = load();
    const result = await api.handleAvailability({ date: DATE, startTimes: START_TIMES }, 'synthetic-gh501');
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body);
    for (const slot of body.availability.slots) {
      for (const entry of ENTRIES) {
        const product = slot.products.find((candidate) => candidate.key === entry.key);
        const [productId, cents] = entry.expected[slot.startTime];
        assert.equal(product.productId, productId, `${entry.key} ${slot.startTime} product`);
        assert.equal(product.unitPriceCents, cents, `${entry.key} ${slot.startTime} price`);
        assert.equal(product.unitPrice, cents / 100);
        assert.equal(product.available, true);
        assert.equal(product.parentProductId, entry.parentId);
      }
      const combo = slot.products.find((candidate) => candidate.key === 'COMBO60');
      assert.equal(combo.productId, COMBO.childId, 'Combo keeps its only variant');
      assert.equal(combo.unitPriceCents, COMBO.kronor * 100);
      const socks = slot.products.find((candidate) => candidate.key === 'socks');
      assert.equal(socks.productId, SOCKS.productId, 'add-ons keep their product');
      assert.equal(socks.unitPriceCents, SOCKS.unitPriceCents);
    }
    assert.match(body.availability.slots[1].products.find((product) => product.key === 'E60').productName, /Drop-In - 240 kr/);
    assert.equal(calls.availability.length, 1, 'exactly the one existing ROLLER availability read');
    assert.equal(calls.costs.length, 0);
    assert.equal(calls.sql.length, 1, 'the existing entry catalog read carries the Drop-In siblings');
  });

  await check('a web price without a Drop-In pair keeps the web variant and is reported without guest data', async () => {
    const { api, calls } = load();
    await api.handleAvailability({ date: DATE, startTimes: START_TIMES }, 'synthetic-gh501');
    const event = calls.events.find((candidate) => candidate.eventType === 'booking.availability_succeeded');
    assert.equal(event.payload.dropInPricedSlotCount, ENTRIES.length * START_TIMES.length - 1);
    const missing = JSON.parse(JSON.stringify(event.payload.dropInMissingProducts));
    assert.deepEqual(missing, [{ key: 'F120', webPriceCents: 87000, webProductId: '1189797' }]);
    assert.equal(calls.warnings.length, 1);
    const warning = JSON.parse(calls.warnings[0]);
    assert.equal(warning.eventType, 'booking.drop_in_price_missing');
    assert.deepEqual(Object.keys(warning).sort(), ['correlationId', 'date', 'eventType', 'products']);
    assert.deepEqual(warning.products, missing);
  });

  await check('validation accepts the returned Drop-In ids at their own slots with one read per item, as today', async () => {
    const { api, calls } = load();
    for (const entry of ENTRIES) {
      for (const startTime of START_TIMES) {
        const [productId] = entry.expected[startTime];
        assert.equal(await api.validateItemsAvailable({ env: 'live' }, {}, [item(productId, startTime)]), null,
          `${entry.key} ${startTime} ${productId}`);
      }
    }
    assert.equal(calls.availability.length, ENTRIES.length * START_TIMES.length);
    assert.equal(calls.costs.length, 0);
  });

  await check('validation rejects a Drop-In id from another price tier, the mispriced tier and non-entry parents', async () => {
    const { api } = load();
    const cases = [
      ['1189812', '13:00', 'cheaper 220 kr Drop-In at the 240 kr slot'],
      ['1189813', '10:00', 'dearer 240 kr Drop-In at the 220 kr slot'],
      ['1189821', '13:00', 'family Drop-In from the wrong tier'],
      ['1189801', '17:00', 'Drop-In 870 kr that equals the 870 kr web price'],
      [SKYRIDER_DROP_IN.id, '13:00', 'a Drop-In name outside the entry products'],
    ];
    for (const [productId, startTime, label] of cases) {
      const error = await api.validateItemsAvailable({ env: 'live' }, {}, [item(productId, startTime)]);
      assert.equal(error?.code, 'drop_in_price_mismatch', label);
    }
  });

  await check('web ids, capacity and unknown products keep their existing validation results', async () => {
    const { api } = load();
    assert.equal(await api.validateItemsAvailable({ env: 'live' }, {}, [item('1189809', '13:00')]), null);
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('1189809', '10:00')]))?.code, 'capacity_unavailable');
    assert.equal(await api.validateItemsAvailable({ env: 'live' }, {}, [item('1189831', '13:00', 1)]), null);
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('1189831', '13:00', 2)]))?.code, 'capacity_unavailable');
    assert.equal((await api.validateItemsAvailable({ env: 'live' }, {}, [item('8888888', '13:00')]))?.code, 'availability_product_missing');
  });

  await check('a quote sends the Drop-In id to ROLLER costs unchanged and returns ROLLER\'s total', async () => {
    const { api, calls } = load();
    const body = {
      customer: { firstName: 'Synthetic', email: 'synthetic@example.invalid' },
      items: [item('1189813', '13:00', 2)],
      requireAvailability: true,
    };
    const result = await api.handleQuote({ headers: {} }, body, 'synthetic-gh501');
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(calls.costs.length, 1);
    assert.deepEqual(calls.costs[0].items.map((entry) => [entry.productId, entry.quantity, entry.startTime]), [[1189813, 2, '13:00']]);
    assert.equal(JSON.parse(result.body).quote.costs.total, 480);
    assert.equal(calls.availability.length, 1, 'the quote validation keeps its single availability read');
  });

  if (failures.length > 0) {
    console.error(`GH-501 validation failed: ${failures.length} check(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('GH-501 drop-in entry price validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
