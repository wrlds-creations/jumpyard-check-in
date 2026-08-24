const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sessionPath = path.join(root, 'infra', 'lambda', 'session', 'index.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const contractSource = fs.readFileSync(path.join(root, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function fakeAwsModule(send) {
  class FakeCommand {
    constructor(input) {
      this.input = input;
    }
  }

  class FakeClient {
    send(command) {
      return send(command.input);
    }
  }

  return new Proxy({}, {
    get(_target, property) {
      return String(property).endsWith('Client') ? FakeClient : FakeCommand;
    },
  });
}

function loadSessionInternals(names, send) {
  const module = { exports: {} };
  const localDirectory = path.dirname(sessionPath);
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: async () => {
      throw new Error('Unexpected network call during GH-300 validation.');
    },
    module,
    process: {
      env: {
        DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
        DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
      },
    },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule(send);
      if (moduleId.startsWith('./')) return require(path.join(localDirectory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-300 validation.`);
    },
    setTimeout,
  };

  vm.runInNewContext(
    `${sessionSource}\nmodule.exports.__gh300 = { ${names.join(', ')} };`,
    sandbox,
    { filename: sessionPath },
  );
  return module.exports.__gh300;
}

function rdsResult(rows) {
  if (rows.length === 0) return { columnMetadata: [], records: [] };
  const columns = Object.keys(rows[0]);
  return {
    columnMetadata: columns.map((name) => ({ name })),
    records: rows.map((row) => columns.map((name) => {
      const value = row[name];
      if (value === null || value === undefined) return { isNull: true };
      if (typeof value === 'number') return { longValue: value };
      if (typeof value === 'boolean') return { booleanValue: value };
      return { stringValue: String(value) };
    })),
  };
}

function baseContext() {
  return {
    booking: {
      amountOwingCents: 0,
      bookingReference: 'synthetic-original-reference',
      bookingStatus: 'Confirmed',
      endTime: '11:00:00',
      freshnessStatus: 'fresh',
      paymentStatus: 'Paid',
      rollerEnv: 'live',
      rollerUniqueId: 'synthetic-original',
      startTime: '10:00:00',
      venueId: 'synthetic-venue',
    },
    tickets: [{ ticketId: 'synthetic-ticket' }],
  };
}

function originalPhoneRow() {
  return {
    booking_date: '2026-08-24',
    booking_item_id: 'synthetic-original-item',
    end_time: '11:00:00',
    parent_product_id: 'family-parent',
    parent_product_name: 'Familjeband',
    product_id: 'family-60',
    product_name: '60 min familjeband',
    product_type: 'entry',
    quantity: 1,
    start_time: '10:00:00',
    tickets_json: JSON.stringify([{ ticketId: 'synthetic-ticket' }]),
  };
}

function originalStaffRow() {
  return {
    booking_date: '2026-08-24',
    booking_item_id: 'synthetic-original-item',
    booking_item_key: 'synthetic-original-key',
    fulfillment_source: 'original',
    item_summary: JSON.stringify({ productType: 'entry' }),
    parent_product_id: 'family-parent',
    parent_product_name: 'Familjeband',
    product_id: 'family-60',
    product_name: '60 min familjeband',
    quantity: 1,
    start_time: '10:00:00',
    end_time: '11:00:00',
  };
}

function authoritativeCoffeeRow() {
  return {
    booking_date: '2026-08-24',
    booking_item_id: 'synthetic-linked-item',
    booking_item_key: 'synthetic-linked-key',
    fulfillment_source: 'linked_add_on',
    item_summary: JSON.stringify({ productType: 'merchandise' }),
    linked_booking_reference: 'must-not-leave-server',
    linked_roller_unique_id: 'must-not-leave-server',
    parent_product_id: 'coffee-parent',
    parent_product_name: 'Kaffe',
    product_id: 'coffee-product',
    product_name: 'Bryggkaffe',
    quantity: 1,
    start_time: '10:00:00',
  };
}

async function validateAuthoritativeComposition() {
  const sqlCalls = [];
  const internals = loadSessionInternals(
    ['buildPhoneSessionBookingResponse'],
    async (input) => {
      sqlCalls.push(input.sql);
      if (/WITH staff_items AS/.test(input.sql)) {
        return rdsResult([originalStaffRow(), authoritativeCoffeeRow()]);
      }
      if (/draft\.add_on_group_id/.test(input.sql)) return rdsResult([]);
      if (/FROM jumpyard\.roller_booking_items AS item/.test(input.sql)) {
        return rdsResult([originalPhoneRow()]);
      }
      return rdsResult([]);
    },
  );

  const response = JSON.parse(JSON.stringify(
    await internals.buildPhoneSessionBookingResponse(baseContext()),
  ));

  assert.deepEqual(response.booking.items.map((item) => [item.productName, item.quantity]), [
    ['60 min familjeband', 1],
    ['Bryggkaffe', 1],
  ]);
  const coffee = response.booking.items[1];
  assert.equal(coffee.bookingItemId, null);
  assert.deepEqual(coffee.tickets, []);
  assert.equal(Object.hasOwn(coffee, 'linkedBookingReference'), false);
  assert.equal(Object.hasOwn(coffee, 'linkedRollerUniqueId'), false);
  assert.doesNotMatch(JSON.stringify(response), /must-not-leave-server/);
  assert.ok(sqlCalls.some((sql) => /linked_booking\.venue_id = :staffVenueId/.test(sql)));
}

async function validateProvisionalCompositionAndGuards() {
  const sqlCalls = [];
  const internals = loadSessionInternals(
    ['findGuestLinkedAddOnPhoneItems'],
    async (input) => {
      sqlCalls.push(input.sql);
      if (/WITH staff_items AS/.test(input.sql)) return rdsResult([originalStaffRow()]);
      if (/draft\.add_on_group_id/.test(input.sql)) {
        return rdsResult([{
          add_on_group_id: 'synthetic-group',
          items_summary: JSON.stringify([
            { productId: 'socks', productName: 'Strumpor', productType: 'merchandise', quantity: 2 },
            { productId: 'water', productName: 'Vattenflaska', productType: 'merchandise', quantity: 1 },
          ]),
          linked_roller_unique_id: 'synthetic-linked',
        }]);
      }
      return rdsResult([]);
    },
  );

  const items = JSON.parse(JSON.stringify(
    await internals.findGuestLinkedAddOnPhoneItems('synthetic-original', 'synthetic-venue'),
  ));

  assert.deepEqual(items.map((item) => [item.productName, item.quantity]), [
    ['Strumpor', 2],
    ['Vattenflaska', 1],
  ]);
  assert.ok(items.every((item) => item.bookingItemId === null));
  assert.ok(items.every((item) => Array.isArray(item.tickets) && item.tickets.length === 0));

  const provisionalSql = sqlCalls.find((sql) => /draft\.add_on_group_id/.test(sql));
  assert.match(provisionalSql, /draft\.payment_channel = 'card_present'/);
  assert.match(provisionalSql, /draft\.payment_attempt_status IN \('approved', 'reconciled'\)/);
  assert.match(provisionalSql, /draft\.booking_confirmation_status IN \('pending', 'needs_staff'\)/);
  assert.match(provisionalSql, /NOT EXISTS[\s\S]*jumpyard\.roller_booking_items AS authoritative_item/);
  assert.match(provisionalSql, /original_booking\.venue_id = :staffVenueId/);
  assert.doesNotMatch(provisionalSql, /payment_attempt_status IN \([^)]*created/);
  assert.doesNotMatch(provisionalSql, /payment_attempt_status IN \([^)]*cancelled/);
}

async function validateNoLinkedAddOnsIsUnchanged() {
  const internals = loadSessionInternals(
    ['findGuestLinkedAddOnPhoneItems'],
    async () => rdsResult([]),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(
      await internals.findGuestLinkedAddOnPhoneItems('synthetic-original', 'synthetic-venue'),
    )),
    [],
  );
}

async function main() {
  await validateAuthoritativeComposition();
  await validateProvisionalCompositionAndGuards();
  await validateNoLinkedAddOnsIsUnchanged();

  assert.match(sessionSource, /const items = \[\.\.\.baseItems, \.\.\.linkedAddOnItems\]/);
  assert.match(sessionSource, /authoritativeItems\.filter\(\(item\) => item\.fulfillmentSource === 'linked_add_on'\)/);
  assert.match(sessionSource, /bookingItemId: null/);
  assert.match(contractSource, /includeBooking=true/);
  assert.match(contractSource, /approved linked add-ons/);
  assert.match(packageSource, /validate:gh300-guest-linked-addons/);

  console.log('GH-300 guest linked add-on resume validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
