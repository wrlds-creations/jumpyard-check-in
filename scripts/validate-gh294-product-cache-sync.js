const assert = require('assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const dataSyncPath = path.join(repoRoot, 'infra', 'lambda', 'data-sync', 'index.js');
const bookingPath = path.join(repoRoot, 'infra', 'lambda', 'booking', 'index.js');
const dataSyncTest = require(dataSyncPath).__test;
const bookingTest = require(bookingPath).__test;

const context = {
  clusterArn: 'arn:aws:rds:eu-north-1:000000000000:cluster:test',
  secretArn: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:test',
};

async function main() {
  try {
    await testStableBookingItemConflictTarget();
    await testKeyFallbackConflictTarget();
    await testIndependentProductCommitSurvivesLaterFailure();
    await testProductTransactionRollsBackOnProductFailure();
    testCachedAddonPriceAndFailClosedFallback();
  } finally {
    dataSyncTest.reset();
  }
}

async function testStableBookingItemConflictTarget() {
  const statements = [];
  dataSyncTest.setHooks({
    rdsSend: async (command) => {
      statements.push(command.input);
      return {
        numberOfRecordsUpdated: 1,
        records: [[{ stringValue: 'existing-booking-item-key' }]],
      };
    },
  });

  const updated = await dataSyncTest.upsertBookingItem(
    context,
    bookingItem({ bookingItemId: 'roller-item-1', bookingItemKey: 'new-derived-key' }),
    'booking-transaction',
  );

  assert.equal(updated, 1);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /ON CONFLICT \(booking_item_id\) WHERE booking_item_id IS NOT NULL DO UPDATE/);
  assert.match(statements[0].sql, /WHERE jumpyard\.roller_booking_items\.roller_unique_id = EXCLUDED\.roller_unique_id/);
  assert.doesNotMatch(statements[0].sql, /booking_item_key = EXCLUDED\.booking_item_key/);
  assert.equal(statements[0].transactionId, 'booking-transaction');
  console.log('[pass] existing ROLLER booking-item ids update their current row without replacing the referenced local key');
}

async function testKeyFallbackConflictTarget() {
  const statements = [];
  dataSyncTest.setHooks({
    rdsSend: async (command) => {
      statements.push(command.input);
      return {
        numberOfRecordsUpdated: 1,
        records: [[{ stringValue: 'derived-key-only' }]],
      };
    },
  });

  const updated = await dataSyncTest.upsertBookingItem(
    context,
    bookingItem({ bookingItemId: null, bookingItemKey: 'derived-key-only' }),
    'booking-transaction',
  );

  assert.equal(updated, 1);
  assert.match(statements[0].sql, /ON CONFLICT \(booking_item_key\) DO UPDATE/);
  assert.doesNotMatch(statements[0].sql, /ON CONFLICT \(booking_item_id\)/);
  console.log('[pass] booking items without a stable ROLLER item id retain the derived-key fallback');
}

async function testIndependentProductCommitSurvivesLaterFailure() {
  const commands = [];
  let beginCount = 0;
  dataSyncTest.setHooks({
    rdsSend: async (command) => {
      const name = command.constructor.name;
      commands.push({ name, input: command.input });
      if (name === 'BeginTransactionCommand') {
        beginCount += 1;
        return { transactionId: beginCount === 1 ? 'product-transaction' : 'booking-transaction' };
      }
      if (name === 'ExecuteStatementCommand' && command.input.transactionId === 'booking-transaction') {
        throw new Error('simulated later booking import failure');
      }
      if (name === 'ExecuteStatementCommand') {
        return { numberOfRecordsUpdated: 1, records: [] };
      }
      return {};
    },
  });

  const productUpserts = await dataSyncTest.persistProductCatalog(
    context,
    [cachedProduct('1765445', 4900)],
    'live',
    '50871',
  );
  assert.equal(productUpserts, 1);

  const bookingTransactionId = await dataSyncTest.beginTransaction(context);
  await assert.rejects(
    () =>
      dataSyncTest.upsertBookingItem(
        context,
        bookingItem({ bookingItemId: 'roller-item-2', bookingItemKey: 'later-booking-key' }),
        bookingTransactionId,
      ),
    /simulated later booking import failure/,
  );
  await dataSyncTest.rollbackTransaction(context, bookingTransactionId);

  const productCommitIndex = commands.findIndex(
    (command) => command.name === 'CommitTransactionCommand' && command.input.transactionId === 'product-transaction',
  );
  const bookingRollbackIndex = commands.findIndex(
    (command) => command.name === 'RollbackTransactionCommand' && command.input.transactionId === 'booking-transaction',
  );
  assert.ok(productCommitIndex >= 0);
  assert.ok(bookingRollbackIndex > productCommitIndex);
  assert.equal(
    commands.some(
      (command) => command.name === 'RollbackTransactionCommand' && command.input.transactionId === 'product-transaction',
    ),
    false,
  );
  assert.equal(
    commands.filter(
      (command) =>
        command.name === 'ExecuteStatementCommand' && /product_catalog_cache/.test(command.input.sql || ''),
    ).length,
    1,
  );
  console.log('[pass] the daily product cache commits before and independently of a later booking import rollback');
}

async function testProductTransactionRollsBackOnProductFailure() {
  const commands = [];
  dataSyncTest.setHooks({
    rdsSend: async (command) => {
      const name = command.constructor.name;
      commands.push({ name, input: command.input });
      if (name === 'BeginTransactionCommand') return { transactionId: 'failed-product-transaction' };
      if (name === 'ExecuteStatementCommand') throw new Error('simulated product persistence failure');
      return {};
    },
  });

  await assert.rejects(
    () =>
      dataSyncTest.persistProductCatalog(
        context,
        [cachedProduct('1765445', 4900)],
        'live',
        '50871',
      ),
    /simulated product persistence failure/,
  );
  assert.equal(
    commands.some(
      (command) =>
        command.name === 'RollbackTransactionCommand' && command.input.transactionId === 'failed-product-transaction',
    ),
    true,
  );
  console.log('[pass] a failed product refresh rolls back only its own transaction');
}

function testCachedAddonPriceAndFailClosedFallback() {
  const cached = bookingTest.mapPhoneAddonProducts(
    [
      {
        id: '1765445',
        name: 'JumpSocks',
        parent_product_id: '970337',
        parent_product_name: 'JumpSocks',
        price_cents: '4900',
      },
    ],
    'live',
  );
  const socks = cached.find((product) => product.key === 'socks');
  assert.ok(socks);
  assert.equal(socks.unitPriceCents, 4900);
  assert.equal(socks.unitPrice, 49);

  const expiredOrMissing = bookingTest.mapPhoneAddonProducts([], 'live');
  assert.equal(expiredOrMissing.some((product) => product.key === 'socks'), false);
  assert.equal(
    expiredOrMissing.some(
      (product) => product.requiresAvailability === false && Number.isFinite(product.unitPriceCents),
    ),
    false,
  );
  console.log('[pass] the add-on list uses SEK 49 from cache and never invents the removed SEK 45 fallback');
}

function bookingItem(overrides) {
  return {
    bookingDate: '2026-08-24',
    bookingItemId: null,
    bookingItemKey: 'booking-item-key',
    endTime: '11:30:00',
    itemSummary: { source: 'test' },
    productId: '1765445',
    quantity: 1,
    rollerUniqueId: 'roller-booking-1',
    startTime: '10:30:00',
    ...overrides,
  };
}

function cachedProduct(id, priceCents) {
  const summary = {
    id,
    name: 'JumpSocks',
    parentProductId: '970337',
    parentProductName: 'JumpSocks',
    priceCents,
    source: 'scheduled_data_api_sync_products',
  };
  return {
    cacheKey: `roller_product:live:50871:${id}`,
    id,
    productHash: 'test-product-hash',
    summary,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
