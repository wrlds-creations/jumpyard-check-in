const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildKioskQuotePayload,
  normalizeBookingReadback,
  normalizePaymentTerminalMap,
  normalizeTerminalOutcome,
  redactPaymentTerminalValues,
  resolveKioskPaymentTerminal,
  verifyKioskDraftPayment,
} = require('../infra/lambda/booking/kiosk-terminal-contract');

const root = path.resolve(__dirname, '..');
const bookingSource = fs.readFileSync(path.join(root, 'infra/lambda/booking/index.js'), 'utf8');
const terminalContractSource = fs.readFileSync(
  path.join(root, 'infra/lambda/booking/kiosk-terminal-contract.js'),
  'utf8',
);
const stackSource = fs.readFileSync(path.join(root, 'infra/lib/jumpyard-cloud-stack.ts'), 'utf8');
const migrationSource = fs.readFileSync(
  path.join(root, 'infra/migrations/0018_kiosk_terminal_payment_attempts.sql'),
  'utf8',
);

const terminalMap = normalizePaymentTerminalMap({
  primary: {
    amount: 49.95,
    deviceId: ' server-owned-device ',
    promptForTip: true,
    terminalId: ' server-owned-terminal ',
  },
  legacyString: 'server-owned-reference',
  missingDevice: { terminalId: 'server-owned-terminal' },
  missingTerminal: { deviceId: 'server-owned-device' },
  ignored: 123,
});
assert.deepEqual(terminalMap, {
  primary: {
    deviceId: 'server-owned-device',
    terminalId: 'server-owned-terminal',
    promptForTip: false,
  },
});
assert.deepEqual(resolveKioskPaymentTerminal({ paymentTerminals: terminalMap }, { channel: null }), {
  enabled: false,
  paymentTerminal: null,
});
assert.deepEqual(
  resolveKioskPaymentTerminal(
    { paymentTerminals: terminalMap },
    { channel: 'kiosk', paymentTerminalAlias: 'primary' },
  ).paymentTerminal,
  {
    deviceId: 'server-owned-device',
    terminalId: 'server-owned-terminal',
    promptForTip: false,
  },
);
assert.equal(
  resolveKioskPaymentTerminal(
    { paymentTerminals: terminalMap },
    { channel: 'kiosk', paymentTerminalAlias: 'missing' },
  ).error.code,
  'kiosk_payment_terminal_not_configured',
);

const kioskDraftPayload = {
  externalId: 'safe-external-reference',
  items: [{ productId: 'safe-product-reference', quantity: 1 }],
  paymentTerminal: terminalMap.primary,
};
const kioskQuotePayload = buildKioskQuotePayload(kioskDraftPayload);
assert.deepEqual(kioskQuotePayload, {
  externalId: 'safe-external-reference',
  items: [{ productId: 'safe-product-reference', quantity: 1 }],
});
assert.equal(Object.hasOwn(kioskQuotePayload, 'paymentTerminal'), false);
assert.deepEqual(kioskDraftPayload.paymentTerminal, {
  deviceId: 'server-owned-device',
  terminalId: 'server-owned-terminal',
  promptForTip: false,
});
assert.equal(Object.hasOwn(kioskDraftPayload.paymentTerminal, 'amount'), false);

assert.equal(
  redactPaymentTerminalValues(
    'ROLLER rejected server-owned-device and server-owned-terminal.',
    terminalMap.primary,
  ),
  'ROLLER rejected [REDACTED_TERMINAL] and [REDACTED_TERMINAL].',
);

const jwt = makeJwt({ currency: 'SEK', merchantReference: 'safe-reference' });
assert.deepEqual(
  verifyKioskDraftPayment({
    draftBody: { costs: { amountOwing: 220 }, currency: 'SEK' },
    paymentJwt: jwt,
    quoteBody: { costs: { amountOwing: 220 }, currency: 'SEK' },
  }),
  { amountOwingCents: 22000, currency: 'SEK', ok: true },
);
assert.equal(
  verifyKioskDraftPayment({
    draftBody: { costs: { amountOwing: 221 }, currency: 'SEK' },
    paymentJwt: jwt,
    quoteBody: { costs: { amountOwing: 220 }, currency: 'SEK' },
  }).error.code,
  'kiosk_payment_amount_mismatch',
);
assert.equal(
  verifyKioskDraftPayment({
    draftBody: { costs: { amountOwing: 220 }, currency: 'USD' },
    paymentJwt: jwt,
    quoteBody: { costs: { amountOwing: 220 }, currency: 'USD' },
  }).error.code,
  'kiosk_payment_currency_mismatch',
);

assert.equal(normalizeTerminalOutcome('approved'), 'approved');
assert.equal(normalizeTerminalOutcome('failed'), 'failed');
assert.equal(normalizeTerminalOutcome('cancelled'), 'cancelled');
assert.equal(normalizeTerminalOutcome('unknown'), 'unknown');
assert.equal(normalizeTerminalOutcome('success'), null);

assert.deepEqual(
  normalizeBookingReadback({
    amountOwing: 0,
    bookingReference: '123456789',
    items: [
      {
        bookingDate: '2026-08-18',
        id: 'item-a',
        productId: '101',
        quantity: 1,
        startTime: '10:00',
        tickets: [{ ticketId: 'ticket-a', status: 'NotRedeemed' }],
      },
    ],
    paymentStatus: 'Paid',
    uniqueId: 'booking-a',
  }),
  {
    bookingReference: '123456789',
    confirmed: true,
    items: [
      {
        bookingDate: '2026-08-18',
        bookingItemId: 'item-a',
        endTime: null,
        itemIndex: 0,
        productId: '101',
        productName: null,
        quantity: 1,
        startTime: '10:00',
        tickets: [{ redeemStatus: 'NotRedeemed', ticketId: 'ticket-a' }],
      },
    ],
    paymentStatus: 'Paid',
    rollerUniqueId: 'booking-a',
    ticketIds: ['ticket-a'],
  },
);
assert.equal(
  normalizeBookingReadback({
    amountOwing: 0,
    bookingReference: '123456789',
    paymentStatus: 'Paid',
    uniqueId: 'booking-a',
  }).confirmed,
  false,
);
assert.equal(normalizeBookingReadback({ amountOwing: 220, paymentStatus: 'Pending' }).confirmed, false);
assert.equal(normalizeBookingReadback({ paymentStatus: 'Paid' }).confirmed, false);

assert.match(stackSource, /routeKey: 'POST \/v1\/bookings\/draft\/finalize'/);
assert.match(bookingSource, /paymentTerminals: normalizePaymentTerminalMap/);
assert.match(bookingSource, /paymentTerminalAlias: request\.paymentTerminalAlias/);
assert.match(bookingSource, /if \(request\.paymentTerminal\) payload\.paymentTerminal = request\.paymentTerminal/);
assert.match(bookingSource, /const kioskQuotePayload = buildKioskQuotePayload\(payload\)/);
assert.match(
  bookingSource,
  /postRollerJson\(config, token, '\/bookings\/draft\/costs', kioskQuotePayload\)/,
);
assert.match(bookingSource, /postRollerJson\(config, token, '\/bookings\/draft', payload\)/);
assert.match(bookingSource, /payment_attempt_status = 'reconciled'/);
assert.match(bookingSource, /WHEN payment_attempt_status = 'approved' AND :outcome <> 'approved'/);
assert.match(bookingSource, /booking\.kiosk_terminal_reconciled/);
assert.match(bookingSource, /request\.action === 'status'/);
assert.match(terminalContractSource, /\[REDACTED_TERMINAL\]/);
assert.doesNotMatch(bookingSource, /server-owned-reference/);

assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS payment_channel/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS payment_attempt_id/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS payment_attempt_status/);
assert.match(migrationSource, /CREATE UNIQUE INDEX IF NOT EXISTS prepayment_booking_drafts_payment_attempt_id_idx/);

console.log('Kiosk terminal backend validation passed.');

function makeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
}
