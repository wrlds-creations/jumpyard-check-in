const assert = require('assert');

const { __test } = require('../infra/lambda/webhook/index.js');

async function main() {
  const originalEnv = { ...process.env };
  try {
    process.env.DATABASE_CLUSTER_ARN = 'arn:aws:rds:eu-north-1:376129878018:cluster:test';
    process.env.DATABASE_SECRET_ARN = 'arn:aws:secretsmanager:eu-north-1:376129878018:secret:test';

    await testExistingProvisionalItemIsUpdatedInPlace();
    await testDifferentBookingCollisionFailsClosed();
    await testItemsWithoutRollerIdKeepKeyConflictPath();
  } finally {
    __test.reset();
    process.env = originalEnv;
  }
}

async function testExistingProvisionalItemIsUpdatedInPlace() {
  __test.reset();
  const calls = [];
  __test.setHooks({
    executeStatement: async (command) => {
      calls.push(command.input);
      if (/INSERT INTO jumpyard\.roller_booking_items/.test(command.input.sql)) {
        return { records: [[{ stringValue: 'jybi_existing_provisional_key' }]] };
      }
      return { records: [] };
    },
  });

  const item = {
    bookingItemId: '310018557',
    productId: '1189808',
    productName: 'Entré 60 min',
    quantity: 1,
    bookingDate: '2026-08-18',
    startTime: '11:00:00',
    endTime: '12:00:00',
  };
  const retainedKey = await __test.upsertWebhookBookingItem('roller-booking-a', item);
  assert.equal(retainedKey, 'jybi_existing_provisional_key');

  const upsert = calls.find((call) => /INSERT INTO jumpyard\.roller_booking_items/.test(call.sql));
  assert.match(upsert.sql, /ON CONFLICT \(booking_item_id\) WHERE booking_item_id IS NOT NULL DO UPDATE SET/);
  assert.match(
    upsert.sql,
    /WHERE jumpyard\.roller_booking_items\.roller_unique_id = EXCLUDED\.roller_unique_id/,
  );
  assert.match(upsert.sql, /RETURNING booking_item_key/);

  await __test.deleteMissingWebhookChildren(
    { rollerUniqueId: 'roller-booking-a', items: [item] },
    [retainedKey],
  );
  const itemCleanup = calls.find((call) => /DELETE FROM jumpyard\.roller_booking_items/.test(call.sql));
  const retainedParameter = itemCleanup.parameters.find((entry) => entry.name === 'bookingItemKey0');
  assert.equal(retainedParameter.value.stringValue, 'jybi_existing_provisional_key');
  console.log('[pass] authoritative enrichment retains the provisional item key through upsert and cleanup');
}

async function testDifferentBookingCollisionFailsClosed() {
  __test.reset();
  __test.setHooks({ executeStatement: async () => ({ records: [] }) });

  await assert.rejects(
    () => __test.upsertWebhookBookingItem('roller-booking-b', {
      bookingItemId: '310018557',
      productId: '1189808',
      quantity: 1,
    }),
    (error) => error.code === 'webhook_booking_item_identity_conflict',
  );
  console.log('[pass] a booking-item id owned by another booking remains a fail-closed invariant violation');
}

async function testItemsWithoutRollerIdKeepKeyConflictPath() {
  __test.reset();
  let sql = '';
  __test.setHooks({
    executeStatement: async (command) => {
      sql = command.input.sql;
      return { records: [[{ stringValue: 'bookingitem:fallback' }]] };
    },
  });

  const retainedKey = await __test.upsertWebhookBookingItem('roller-booking-c', {
    bookingItemId: null,
    productId: '1189808',
    quantity: 1,
  });
  assert.equal(retainedKey, 'bookingitem:fallback');
  assert.match(sql, /ON CONFLICT \(booking_item_key\) DO UPDATE SET/);
  console.log('[pass] id-less webhook items retain the deterministic primary-key upsert path');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
