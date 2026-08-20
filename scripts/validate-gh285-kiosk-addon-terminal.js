const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  normalizeBookingReadback,
  publicKioskPaymentStatus,
} = require('../infra/lambda/booking/kiosk-terminal-contract');

const root = path.resolve(__dirname, '..');
const bookingPath = path.join(root, 'infra', 'lambda', 'booking', 'index.js');
const bookingSource = fs.readFileSync(bookingPath, 'utf8');
const contractSource = fs.readFileSync(path.join(root, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function fakeAwsModule() {
  return new Proxy({}, {
    get(_target, property) {
      return class FakeAwsClientOrCommand {
        constructor(input) {
          this.input = input;
        }

        async send() {
          throw new Error(`Unexpected AWS call through ${String(property)} during GH-285 validation.`);
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
      throw new Error('Unexpected network call during GH-285 validation.');
    },
    module,
    exports: module.exports,
    process: { env: {} },
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
    `${bookingSource}\nmodule.exports.__gh285 = { normalizeAddProductDraftRequest, validateAddProductDraftRequest };`,
    sandbox,
    { filename: bookingPath },
  );
  return module.exports.__gh285;
}

const internals = loadBookingInternals();
const kioskRequest = JSON.parse(JSON.stringify(internals.normalizeAddProductDraftRequest(
  { headers: {} },
  {
    channel: 'kiosk',
    confirmDraft: true,
    idempotencyKey: 'kiosk-add-product-draft',
    items: [{ bookingDate: '2026-08-20', productId: 1324123, quantity: 1, startTime: '12:00' }],
    paymentTerminalAlias: 'primary',
  },
  'safe-original-reference',
)));
assert.equal(kioskRequest.channel, 'kiosk');
assert.equal(kioskRequest.paymentTerminalAlias, 'primary');
assert.equal(internals.validateAddProductDraftRequest(kioskRequest), null);

const phoneRequest = JSON.parse(JSON.stringify(internals.normalizeAddProductDraftRequest(
  { headers: {} },
  {
    confirmDraft: true,
    idempotencyKey: 'phone-add-product-draft',
    items: [{ bookingDate: '2026-08-20', productId: 1324123, quantity: 1, startTime: '12:00' }],
  },
  'safe-original-reference',
)));
assert.equal(phoneRequest.channel, null);
assert.equal(phoneRequest.paymentTerminalAlias, null);
assert.equal(internals.validateAddProductDraftRequest(phoneRequest), null);
assert.equal(
  internals.validateAddProductDraftRequest({ ...kioskRequest, paymentTerminalAlias: null }).code,
  'payment_terminal_alias_required',
);
assert.equal(
  internals.validateAddProductDraftRequest({ ...phoneRequest, paymentTerminalAlias: 'primary' }).code,
  'payment_terminal_alias_not_allowed',
);
assert.equal(
  internals.validateAddProductDraftRequest({ ...phoneRequest, channel: 'unsupported' }).code,
  'payment_channel_invalid',
);

const paidStockBooking = {
  amountOwing: 0,
  bookingReference: 'safe-linked-reference',
  items: [{ id: 'item-a', productId: '1324123', productName: 'Jumpy Vattenflaska', quantity: 1 }],
  paymentStatus: 'Paid',
  uniqueId: 'safe-linked-unique-id',
};
assert.equal(normalizeBookingReadback(paidStockBooking).confirmed, false);
assert.equal(normalizeBookingReadback(paidStockBooking, { requireTickets: false }).confirmed, true);
assert.equal(
  normalizeBookingReadback({ ...paidStockBooking, items: [] }, { requireTickets: false }).confirmed,
  false,
);

const linkedDraft = {
  booking_confirmation_status: 'confirmed',
  flow_type: 'add_product',
  payment_attempt_status: 'reconciled',
  roller_booking_reference: 'safe-linked-reference',
  status: 'published',
};
assert.equal(publicKioskPaymentStatus(linkedDraft).status, 'confirmed');

assert.match(bookingSource, /const terminalSelection = resolveKioskPaymentTerminal\(config, request\)/);
assert.match(bookingSource, /booking\.kiosk_add_product_terminal_contract_failed/);
assert.match(bookingSource, /paymentChannel: terminalSelection\.enabled \? 'card_present' : 'ecommerce'/);
assert.match(bookingSource, /draft\.flow_type IN \('new_booking', 'add_product'\)/);
assert.match(bookingSource, /if \(prepayment\.flow_type === 'new_booking'\) \{[\s\S]*ensureProvisionalKioskHandoff/);
assert.match(bookingSource, /confirmKioskAddProductReconciliation\(request, readback\)/);
assert.match(bookingSource, /INSERT INTO jumpyard\.booking_links/);
assert.match(bookingSource, /requireTickets: existing\.flow_type !== 'add_product'/);
const addProductHandlerStart = bookingSource.indexOf('async function handleAddProductDraft');
const addProductHandlerEnd = bookingSource.indexOf('function normalizeQuoteRequest', addProductHandlerStart);
const addProductHandlerSource = bookingSource.slice(addProductHandlerStart, addProductHandlerEnd);
assert.ok(
  addProductHandlerSource.indexOf('await persistAddOnBookingLink') <
    addProductHandlerSource.indexOf('return jsonResponse(201'),
  'the durable add-on link must be stored before a terminal-capable draft response is returned',
);
const addProductConfirmStart = bookingSource.indexOf('async function confirmKioskAddProductReconciliation');
const addProductConfirmEnd = bookingSource.indexOf('async function persistKioskReconciliationBookingSnapshot', addProductConfirmStart);
const addProductConfirmSource = bookingSource.slice(addProductConfirmStart, addProductConfirmEnd);
assert.match(addProductConfirmSource, /draft\.add_on_group_id IS NOT NULL/);
assert.doesNotMatch(addProductConfirmSource, /booking_links/);
assert.doesNotMatch(bookingSource, /paymentJwt\s*[:=].*console\.log/);
assert.doesNotMatch(bookingSource, /deviceId\s*[:=].*console\.log/);
assert.doesNotMatch(bookingSource, /terminalId\s*[:=].*console\.log/);

assert.match(contractSource, /existing-booking kiosk card-present path/);
assert.match(contractSource, /must not create a second check-in or Handoff session/);
assert.match(packageSource, /validate:gh285-kiosk-addon-terminal/);

console.log('GH-285 kiosk existing-booking add-on terminal validation passed.');
