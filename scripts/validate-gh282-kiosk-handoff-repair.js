const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { publicKioskPaymentStatus } = require('../infra/lambda/booking/kiosk-terminal-contract');
const webhook = require('../infra/lambda/webhook/index.js').__test;

const root = path.resolve(__dirname, '..');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const bookingSource = fs.readFileSync(bookingPath, 'utf8');
const lookupSource = fs.readFileSync(path.join(root, 'infra', 'lambda', 'lookup', 'index.js'), 'utf8');
const webhookSource = fs.readFileSync(path.join(root, 'infra', 'lambda', 'webhook', 'index.js'), 'utf8');
const stackSource = fs.readFileSync(path.join(root, 'infra', 'lib', 'jumpyard-cloud-stack.ts'), 'utf8');

function fakeAwsModule() {
  return new Proxy({}, {
    get(_target, property) {
      return class FakeAwsClientOrCommand {
        constructor(input) {
          this.input = input;
          this.name = String(property);
        }

        async send() {
          throw new Error(`Unexpected AWS call through ${String(property)} during GH-282 validation.`);
        }
      };
    },
  });
}

function loadBookingInternals() {
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async () => {
      throw new Error('Unexpected network call during GH-282 validation.');
    },
    module,
    exports: module.exports,
    process: { env: { ROLLER_DATA_SYNC_VENUE_ID: '50871' } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      if (moduleId === './kiosk-terminal-contract') {
        return require(path.join(path.dirname(bookingPath), 'kiosk-terminal-contract.js'));
      }
      if (moduleId === './phone-product-catalog') {
        return require(path.join(path.dirname(bookingPath), 'phone-product-catalog.js'));
      }
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) in booking handler.`);
    },
    setTimeout,
  };
  vm.runInNewContext(
    `${bookingSource}\nmodule.exports.__gh282 = { isKioskHandoffAuthoritativelyAttached, validateKioskAuthoritativeConfirmationCandidates };`,
    sandbox,
    { filename: bookingPath },
  );
  return module.exports.__gh282;
}

function rdsResult(rows) {
  const names = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    columnMetadata: names.map((name) => ({ name })),
    records: rows.map((row) => names.map((name) => {
      const value = row[name];
      if (typeof value === 'number') return { longValue: value };
      if (typeof value === 'boolean') return { booleanValue: value };
      if (value === null || value === undefined) return { isNull: true };
      return { stringValue: String(value) };
    })),
  };
}

async function testWebhookDispatch() {
  const previousFunctionName = process.env.KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME;
  const previousClusterArn = process.env.DATABASE_CLUSTER_ARN;
  const previousSecretArn = process.env.DATABASE_SECRET_ARN;
  process.env.KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME = 'booking-function';
  process.env.DATABASE_CLUSTER_ARN = 'test-cluster';
  process.env.DATABASE_SECRET_ARN = 'test-secret';
  const invocations = [];
  webhook.reset();
  webhook.setHooks({
    executeStatement: async () => rdsResult([{
      payment_attempt_id: 'jytp_123456789012345678',
      prepayment_draft_id: 'jypd_123456789012345678',
    }]),
    invokeLambda: async (command) => {
      invocations.push(command.input);
      return { Payload: Buffer.from(JSON.stringify({ status: 'confirmed' })) };
    },
  });

  await webhook.requestKioskAuthoritativeConfirmation({
    bookingReference: '12345678',
    externalId: 'JY-D-authoritative',
    rollerUniqueId: 'roller-booking-id',
  }, 'roller_webhook_enrichment', 'correlation-safe');
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].FunctionName, 'booking-function');
  assert.equal(invocations[0].InvocationType, 'RequestResponse');
  const event = JSON.parse(Buffer.from(invocations[0].Payload).toString('utf8'));
  assert.equal(event.source, 'jumpyard.kiosk-authoritative-confirmation');
  assert.deepEqual(event.detail, {
    bookingReference: '12345678',
    correlationId: 'correlation-safe',
    externalId: 'JY-D-authoritative',
    paymentAttemptId: 'jytp_123456789012345678',
    prepaymentDraftId: 'jypd_123456789012345678',
    rollerUniqueId: 'roller-booking-id',
    trigger: 'roller_webhook_enrichment',
  });

  webhook.reset();
  webhook.setHooks({
    executeStatement: async () => rdsResult([
      { payment_attempt_id: 'one', prepayment_draft_id: 'one' },
      { payment_attempt_id: 'two', prepayment_draft_id: 'two' },
    ]),
    invokeLambda: async () => {
      throw new Error('Ambiguous candidates must not invoke the booking function.');
    },
  });
  await assert.rejects(
    webhook.requestKioskAuthoritativeConfirmation({
      bookingReference: '12345678',
      externalId: 'JY-D-ambiguous',
      rollerUniqueId: 'roller-booking-id',
    }, 'roller_webhook_enrichment', 'correlation-safe'),
    (error) => error.code === 'kiosk_confirmation_ambiguous',
  );

  webhook.reset();
  if (previousFunctionName === undefined) delete process.env.KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME;
  else process.env.KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME = previousFunctionName;
  if (previousClusterArn === undefined) delete process.env.DATABASE_CLUSTER_ARN;
  else process.env.DATABASE_CLUSTER_ARN = previousClusterArn;
  if (previousSecretArn === undefined) delete process.env.DATABASE_SECRET_ARN;
  else process.env.DATABASE_SECRET_ARN = previousSecretArn;
}

async function main() {
  const internals = loadBookingInternals();
  const candidate = {
    amount_owing_cents: 0,
    booking_currency: null,
    booking_date: '2026-08-20',
    booking_external_id: 'JY-D-authoritative',
    booking_reference: '12345678',
    booking_roller_env: 'Live',
    booking_status: 'Confirmed',
    booking_total_cents: 24000,
    draft_booking_date: '2026-08-20',
    draft_currency: 'SEK',
    draft_roller_env: 'Live',
    draft_total_cents: 24000,
    external_id: 'JY-D-authoritative',
    freshness_status: 'fresh',
    is_tombstoned: false,
    last_seen_from_roller_at: '2026-08-20T12:00:00.000Z',
    payment_status: 'FullyPaid',
    roller_unique_id: 'roller-booking-id',
    source_last_updated_by: 'roller_webhook_enrichment',
    ticket_ids: JSON.stringify(['ticket-one']),
    venue_id: '50871',
  };
  const request = {
    bookingReference: '12345678',
    externalId: 'JY-D-authoritative',
    rollerUniqueId: 'roller-booking-id',
  };

  assert.equal(internals.validateKioskAuthoritativeConfirmationCandidates([candidate], request), null);
  assert.equal(internals.validateKioskAuthoritativeConfirmationCandidates([], request), 'authoritative_booking_not_found');
  assert.equal(
    internals.validateKioskAuthoritativeConfirmationCandidates([candidate, candidate], request),
    'authoritative_booking_ambiguous',
  );
  assert.equal(
    internals.validateKioskAuthoritativeConfirmationCandidates([{ ...candidate, booking_total_cents: 23999 }], request),
    'authoritative_total_mismatch',
  );
  assert.equal(
    internals.validateKioskAuthoritativeConfirmationCandidates([{ ...candidate, ticket_ids: '[]' }], request),
    'authoritative_tickets_missing',
  );
  assert.equal(
    internals.validateKioskAuthoritativeConfirmationCandidates([{ ...candidate, amount_owing_cents: 1 }], request),
    'authoritative_payment_not_settled',
  );
  assert.equal(
    internals.validateKioskAuthoritativeConfirmationCandidates([{ ...candidate, amount_owing_cents: null }], request),
    'authoritative_payment_not_settled',
  );
  assert.equal(internals.isKioskHandoffAuthoritativelyAttached({
    checkin_session_id: 'session-one',
    confirmed_booking_reference: '12345678',
    confirmed_roller_unique_id: 'roller-booking-id',
    selected_ticket_ids: '["ticket-one"]',
    session_booking_sync_status: 'confirmed',
  }), true);

  const stuckStatus = publicKioskPaymentStatus({
    booking_confirmation_status: 'confirmed',
    checkin_session_id: 'session-one',
    confirmed_roller_unique_id: 'draft-id',
    payment_attempt_status: 'reconciled',
    selected_ticket_ids: '[]',
    session_booking_sync_status: 'needs_staff',
    status: 'published',
  });
  assert.equal(stuckStatus.status, 'needs_staff');
  assert.equal(stuckStatus.provisionalHandoff.session.bookingSyncStatus, 'needs_staff');

  await testWebhookDispatch();

  for (const source of [lookupSource, webhookSource]) {
    assert.match(source, /external_id = :externalId/);
    assert.match(source, /InvocationType: 'RequestResponse'/);
    assert.match(source, /source: 'jumpyard\.kiosk-authoritative-confirmation'/);
  }
  assert.match(bookingSource, /booking\.normalized_summary ->> 'externalId' = draft\.external_id/);
  assert.match(bookingSource, /authoritative_booking_ambiguous/);
  assert.match(bookingSource, /authoritative_total_mismatch/);
  assert.match(bookingSource, /authoritative_tickets_missing/);
  assert.match(bookingSource, /attached_session_count/);
  assert.match(bookingSource, /attached_token_count/);
  assert.match(lookupSource, /normalized_summary ->> 'externalId' AS external_id/);
  assert.equal((stackSource.match(/bookingHandler\.grantInvoke\(/g) ?? []).length >= 2, true);
  assert.equal((stackSource.match(/KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME/g) ?? []).length, 2);

  console.log('GH-282 late kiosk Handoff repair validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
