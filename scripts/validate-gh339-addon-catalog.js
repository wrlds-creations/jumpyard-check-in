'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const bookingPath = path.resolve(__dirname, '../infra/lambda/booking/index.js');
const source = fs.readFileSync(bookingPath, 'utf8');
const localRequire = createRequire(bookingPath);
const columns = ['parent_product_id', 'parent_product_name', 'id', 'name', 'price_cents'];
const freshRows = [
  ['970337', 'JumpSocks', '970338', 'Antal', '4900'],
  ['970363', 'Cold Drinks', '970411', 'JumpYard Vatten', '2000'],
  ['970333', 'Lock', '970334', 'Lock', '4500'],
  ['970346', 'Coffee', '970352', 'Coffee', '3500'],
];

function load(rows) {
  const warnings = [];
  const reads = [];
  class NoAwsCalls {
    send() { throw new Error('AWS calls are forbidden in this test'); }
  }
  const context = vm.createContext({
    exports: {},
    process: { env: {} },
    console: { warn: (message) => warnings.push(JSON.parse(message)) },
    require: (name) => name.startsWith('@aws-sdk/')
      ? new Proxy({}, { get: () => NoAwsCalls })
      : localRequire(name),
    read: async (sql, parameters) => {
      reads.push({ sql, parameters });
      return {
        columnMetadata: columns.map((name) => ({ name })),
        records: rows.map((row) => row.map((value) => value === null ? { isNull: true } : { stringValue: value })),
      };
    },
  });
  vm.runInContext(`${source}\nexecuteStatement = read; exports.load = loadPhoneAddonProducts;`, context);
  return { run: () => context.exports.load('live'), warnings, reads };
}

test('available fresh stock prices are returned without a missing-price warning', async () => {
  const harness = load(freshRows);
  const products = await harness.run();
  assert.equal(products.find((product) => product.key === 'socks').unitPriceCents, 4900);
  assert.equal(products.find((product) => product.key === 'water_bottle').unitPriceCents, 2000);
  assert.equal(harness.reads.length, 1);
  assert.deepEqual(harness.warnings, []);
});

test('no current rows omit stock offers and diagnose the configured keys without raw data', async () => {
  const harness = load([]);
  const products = await harness.run();
  assert.equal(products.some((product) => product.requiresAvailability !== true), false);
  assert.equal(harness.reads.length, 1);
  assert.deepEqual(harness.warnings, [{
    eventType: 'booking.addon_catalog_incomplete',
    cacheStatus: 'missing_expired_or_invalid_price',
    omittedProductKeys: ['socks', 'water_bottle', 'lock', 'coffee'],
  }]);
});

test('one missing price does not hide other fresh stock products or leak the source row', async () => {
  const rows = freshRows.map((row) => [...row]);
  rows[1][3] = 'synthetic-sensitive-provider-text';
  rows[1][4] = null;
  const harness = load(rows);
  const products = await harness.run();
  assert.equal(products.some((product) => product.key === 'water_bottle'), false);
  assert.equal(products.find((product) => product.key === 'socks').unitPriceCents, 4900);
  assert.deepEqual(harness.warnings[0].omittedProductKeys, ['water_bottle']);
  assert.doesNotMatch(JSON.stringify(harness.warnings), /synthetic-sensitive|970411|4900/);
  assert.equal(harness.reads.length, 1);
});
