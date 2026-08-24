const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const sessionPath = path.join(root, 'infra', 'lambda', 'session', 'index.js');
const bookingSource = fs.readFileSync(bookingPath, 'utf8');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const redeemSource = read('infra', 'lambda', 'redeem', 'index.js');
const adminSource = read('jumpyard-checkin-admin', 'src', 'app', 'page.tsx');
const packageSource = read('package.json');

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

function loadInternals(sourcePath, source, names, send) {
  const module = { exports: {} };
  const localDirectory = path.dirname(sourcePath);
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
      throw new Error('Unexpected network call during GH-289 validation.');
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
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-289 validation.`);
    },
    setTimeout,
  };
  vm.runInNewContext(
    `${source}\nmodule.exports.__gh289 = { ${names.join(', ')} };`,
    sandbox,
    { filename: sourcePath },
  );
  return module.exports.__gh289;
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

async function validateBookingStatePropagation() {
  const calls = [];
  const internals = loadInternals(
    bookingPath,
    bookingSource,
    [
      'confirmKioskAddProductReconciliation',
      'markKioskReconciliationNeedsStaff',
      'recordKioskTerminalOutcome',
    ],
    async (input) => {
      calls.push(input);
      if (/UPDATE jumpyard\.prepayment_booking_drafts/.test(input.sql)) {
        return rdsResult([{
          add_on_group_id: 'synthetic-group',
          booking_confirmation_status: 'pending',
          booking_date: '2026-08-20',
          flow_type: 'add_product',
          original_roller_unique_id: 'synthetic-original',
          payment_attempt_status: 'approved',
          roller_draft_unique_id: 'synthetic-linked',
          status: 'payment_pending',
        }]);
      }
      return rdsResult([]);
    },
  );

  await internals.recordKioskTerminalOutcome({
    paymentAttemptId: 'synthetic-attempt',
    prepaymentDraftId: 'synthetic-draft',
  }, 'approved');
  const approvalSql = calls.at(-1).sql;
  assert.match(approvalSql, /WITH updated_draft AS/);
  assert.match(approvalSql, /effective_sync AS/);
  assert.match(approvalSql, /UPDATE jumpyard\.checkin_sessions AS session/);
  assert.match(approvalSql, /'bookingSyncStatus', sync\.booking_sync_status/);
  assert.match(approvalSql, /target\.booking_confirmation_status = 'pending' OR EXISTS/);
  assert.match(approvalSql, /candidate\.prepayment_draft_id <> target\.prepayment_draft_id/);
  assert.match(approvalSql, /candidate\.booking_confirmation_status = 'pending'/);
  assert.match(approvalSql, /candidate\.booking_confirmation_status = 'needs_staff'/);
  assert.match(approvalSql, /candidate\.payment_attempt_status IN \('approved', 'reconciled'\)/);
  assert.match(approvalSql, /session\.roller_unique_id = sync\.original_roller_unique_id/);
  assert.match(approvalSql, /session\.status IN \('guest_in_progress', 'ready_for_staff', 'staff_in_progress'\)/);

  calls.length = 0;
  await internals.confirmKioskAddProductReconciliation({
    paymentAttemptId: 'synthetic-attempt',
    prepaymentDraftId: 'synthetic-draft',
  }, { bookingReference: 'synthetic-reference' });
  const confirmationSql = calls.at(-1).sql;
  assert.match(confirmationSql, /WITH confirmed_draft AS/);
  assert.match(confirmationSql, /booking_confirmation_status = 'confirmed'/);
  assert.match(confirmationSql, /FROM confirmed_draft AS target/);
  assert.match(confirmationSql, /'bookingSyncStatus', sync\.booking_sync_status/);
  assert.match(confirmationSql, /candidate\.booking_confirmation_status = 'pending'/);

  calls.length = 0;
  await internals.markKioskReconciliationNeedsStaff({
    paymentAttemptId: 'synthetic-attempt',
    prepaymentDraftId: 'synthetic-draft',
  }, 'synthetic_reconciliation_exhausted');
  assert.equal(calls.length, 1, 'draft and session exhaustion state must be propagated atomically');
  const needsStaffSql = calls[0].sql;
  assert.match(needsStaffSql, /WITH updated_draft AS/);
  assert.match(needsStaffSql, /updated_provisional_session AS/);
  assert.match(needsStaffSql, /updated_linked_session AS/);
  assert.match(needsStaffSql, /'bookingSyncStatus', sync\.booking_sync_status/);
  assert.match(needsStaffSql, /'linkedAddOnSyncSource', 'kiosk_terminal_add_product'/);
  assert.match(needsStaffSql, /draft\.booking_confirmation_status <> 'confirmed'/);

  calls.length = 0;
  await internals.markKioskReconciliationNeedsStaff({
    paymentAttemptId: 'synthetic-attempt',
    prepaymentDraftId: 'synthetic-draft',
  }, 'synthetic_late_failure');
  assert.equal(calls.length, 1);
  assert.match(
    calls[0].sql,
    /WHEN booking_confirmation_status = 'confirmed' THEN booking_confirmation_status/,
    'a late failure must not regress an already confirmed linked add-on draft',
  );
  assert.match(
    calls[0].sql,
    /ELSE 'confirmed'[\s\S]*END AS booking_sync_status/,
    'a linked Handoff returns to confirmed only when no approved pending or needs-staff draft remains',
  );
}

async function validateProvisionalLinkedItems() {
  let selectInput = null;
  const internals = loadInternals(
    sessionPath,
    sessionSource,
    ['findProvisionalLinkedAddOnStaffItems'],
    async (input) => {
      selectInput = input;
      return rdsResult([{
        add_on_group_id: 'synthetic-group',
        items_summary: JSON.stringify([
          {
            bookingDate: '2026-08-20',
            productId: 'socks',
            productName: 'Jumpstrumpor',
            productType: 'merchandise',
            quantity: 2,
          },
          {
            bookingDate: '2026-08-20',
            productId: 'water',
            productName: 'Jumpy Vattenflaska',
            productType: 'merchandise',
            quantity: 1,
          },
        ]),
        linked_roller_unique_id: 'synthetic-linked',
      }]);
    },
  );

  const items = JSON.parse(JSON.stringify(
    await internals.findProvisionalLinkedAddOnStaffItems('synthetic-original', 'synthetic-venue'),
  ));
  assert.deepEqual(items.map((item) => [item.productName, item.quantity]), [
    ['Jumpstrumpor', 2],
    ['Jumpy Vattenflaska', 1],
  ]);
  assert.ok(items.every((item) => item.fulfillmentSource === 'linked_add_on'));
  assert.ok(items.every((item) => item.linkedBookingReference === null));
  assert.ok(items.every((item) => item.linkedRollerUniqueId === null));
  assert.ok(items.every((item) => /^linked-provisional:[a-f0-9]{16}:/.test(item.bookingItemKey)));

  assert.match(selectInput.sql, /draft\.payment_channel = 'card_present'/);
  assert.match(selectInput.sql, /draft\.payment_attempt_status IN \('approved', 'reconciled'\)/);
  assert.match(selectInput.sql, /draft\.booking_confirmation_status IN \('pending', 'needs_staff'\)/);
  assert.match(selectInput.sql, /original_booking\.venue_id = :staffVenueId/);
  assert.match(selectInput.sql, /NOT EXISTS[\s\S]*jumpyard\.roller_booking_items AS authoritative_item/);
  assert.doesNotMatch(selectInput.sql, /payment_attempt_status IN \([^)]*created/);
}

async function validateStaffDetailComposition() {
  const internals = loadInternals(
    sessionPath,
    sessionSource,
    ['findStaffSessionDetail'],
    async (input) => {
      if (/WHERE cs\.checkin_session_id = :checkinSessionId/.test(input.sql)) {
        return rdsResult([{
          booking_reference: 'synthetic-reference',
          booking_sync_status: 'pending',
          checkin_session_id: 'synthetic-session',
          handoff_code: 'SYNTHETIC',
          handoff_status: 'ready_for_staff',
          item_count: 4,
          roller_unique_id: 'synthetic-original',
          safety_status: 'completed',
          selected_ticket_ids: '[]',
          status: 'ready_for_staff',
          ticket_count: 0,
          visit_date: '2026-08-20',
        }]);
      }
      if (/WITH staff_items AS/.test(input.sql)) {
        return rdsResult([
          {
            booking_date: '2026-08-20',
            booking_item_key: 'original-session-1',
            fulfillment_source: 'original',
            product_id: 'session-60',
            product_name: '60 min entré',
            quantity: 1,
          },
          {
            booking_date: '2026-08-20',
            booking_item_key: 'original-session-2',
            fulfillment_source: 'original',
            product_id: 'session-60',
            product_name: '60 min entré',
            quantity: 1,
          },
        ]);
      }
      if (/SELECT[\s\S]*draft\.add_on_group_id/.test(input.sql)) {
        return rdsResult([{
          add_on_group_id: 'synthetic-group',
          items_summary: JSON.stringify([
            { productId: 'socks', productName: 'Jumpstrumpor', quantity: 2 },
            { productId: 'water', productName: 'Jumpy Vattenflaska', quantity: 1 },
          ]),
          linked_roller_unique_id: 'synthetic-linked',
        }]);
      }
      return rdsResult([]);
    },
  );

  const detail = JSON.parse(JSON.stringify(
    await internals.findStaffSessionDetail('synthetic-session', 'synthetic-venue'),
  ));
  assert.equal(detail.checkinSessionId, 'synthetic-session');
  assert.equal(detail.bookingSyncStatus, 'pending');
  assert.deepEqual(detail.items.map((item) => [item.productName, item.quantity, item.fulfillmentSource]), [
    ['60 min entré', 1, 'original'],
    ['60 min entré', 1, 'original'],
    ['Jumpstrumpor', 2, 'linked_add_on'],
    ['Jumpy Vattenflaska', 1, 'linked_add_on'],
  ]);
}

function validateAuthoritativeReadbackOverridesStalePending() {
  const calls = [];
  const sessionInternals = loadInternals(
    sessionPath,
    sessionSource,
    ['refreshLinkedAddOnEffectiveSyncState'],
    async (input) => {
      calls.push(input);
      return rdsResult([{ updated_session_count: 1 }]);
    },
  );

  return sessionInternals.refreshLinkedAddOnEffectiveSyncState('synthetic-session', 'synthetic-venue')
    .then((updatedCount) => {
      assert.equal(updatedCount, 1);
      assert.equal(calls.length, 1);
      const sql = calls[0].sql;
      assert.match(sql, /WITH linked_state AS/);
      assert.match(sql, /draft\.payment_attempt_status IN \('approved', 'reconciled'\)/);
      assert.match(sql, /NOT state\.authoritative[\s\S]*state\.booking_confirmation_status = 'pending'[\s\S]*THEN 'pending'/);
      assert.match(sql, /WHEN COUNT\(\*\) FILTER \(WHERE NOT state\.authoritative\) > 0 THEN 'needs_staff'/);
      assert.match(sql, /ELSE 'confirmed'/);
      assert.match(sql, /linked_booking\.venue_id = original_booking\.venue_id/);
      assert.match(sql, /linked_booking\.amount_owing_cents = 0/);
      assert.match(sql, /jumpyard\.roller_booking_items AS authoritative_item/);
      assert.match(sql, /authoritative_item\.roller_unique_id = link\.linked_roller_unique_id/);
      assert.match(sql, /UPDATE jumpyard\.checkin_sessions AS session/);
      assert.match(sql, /IS DISTINCT FROM sync\.booking_sync_status/);
      assert.match(sql, /'linkedAddOnSyncSource', 'authoritative_linked_add_on_readback'/);
      assert.match(sql, /session\.checkin_session_id = :checkinSessionId/);
      assert.match(sql, /original_booking\.venue_id = :staffVenueId/);
      assert.doesNotMatch(sql, /payment_attempt_status IN \([^)]*created/);
      assert.match(redeemSource, /COALESCE\(cs\.session_summary ->> 'bookingSyncStatus', 'confirmed'\)/);
      assert.doesNotMatch(redeemSource, /jumpyard\.booking_links/);
    });
}

async function main() {
  await validateBookingStatePropagation();
  await validateProvisionalLinkedItems();
  await validateStaffDetailComposition();
  await validateAuthoritativeReadbackOverridesStalePending();

  assert.match(
    bookingSource,
    /persistKioskReconciliationBookingSnapshot\(existing, readback\);[\s\S]*confirmKioskAddProductReconciliation\(request, readback\)/,
  );
  assert.match(sessionSource, /const items = \[\.\.\.baseItems, \.\.\.provisionalLinkedAddOns\]/);
  assert.match(sessionSource, /SUM\(jsonb_array_length\(linked_draft\.items_summary\)\)/);
  assert.match(redeemSource, /if \(session\.bookingSyncStatus !== 'confirmed'\)/);
  assert.match(redeemSource, /reason: 'booking_sync_pending'/);
  assert.match(adminSource, /detail\?\.bookingSyncStatus !== "pending"/);
  assert.match(adminSource, /window\.setTimeout\([\s\S]*5_000/);
  assert.match(adminSource, /item\.fulfillmentSource === "linked_add_on"/);
  assert.match(packageSource, /validate:gh289-handoff-linked-addons/);

  console.log('GH-289 provisional linked add-on Handoff validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
