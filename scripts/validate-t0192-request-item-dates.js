const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_DATE = '2026-07-13';
const SECOND_APPROVED_DATE = '2026-07-14';
const OUTSIDE_DATE = '2026-10-01';

function loadBooking(environment) {
  const counters = { awsCalls: 0, networkCalls: 0 };
  const source = fs.readFileSync(path.join(ROOT, 'infra/lambda/booking/index.js'), 'utf8');
  const module = { exports: {} };

  function fakeAwsModule() {
    return new Proxy(
      {},
      {
        get(_target, property) {
          return class FakeAwsClientOrCommand {
            constructor(input) {
              this.input = input;
              this.name = String(property);
            }

            async send() {
              counters.awsCalls += 1;
              throw new Error(`Unexpected AWS call through ${String(property)} during T0192 validation.`);
            }
          };
        },
      },
    );
  }

  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async () => {
      counters.networkCalls += 1;
      throw new Error('Unexpected network call during T0192 validation.');
    },
    module,
    exports: module.exports,
    process: { env: { ...environment } },
    require(moduleId) {
      if (moduleId === './package-contents') return require(path.join(ROOT, 'infra/lambda/booking/package-contents.js'));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      if (moduleId === './kiosk-terminal-contract') {
        return require(path.join(ROOT, 'infra/lambda/booking/kiosk-terminal-contract.js'));
      }
      if (moduleId === './phone-product-catalog') {
        return require(path.join(ROOT, 'infra/lambda/booking/phone-product-catalog.js'));
      }
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) in booking handler.`);
    },
    setTimeout,
  };

  vm.runInNewContext(
    `${source}\nmodule.exports.__t0192 = { validateT0176FullFlowRequestItemDates };`,
    sandbox,
    { filename: path.join(ROOT, 'infra/lambda/booking/index.js') },
  );

  return {
    counters,
    gate: module.exports.__t0192.validateT0176FullFlowRequestItemDates,
    handler: module.exports.handler,
  };
}

function fullFlowEnvironment(overrides = {}) {
  return {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: `${APPROVED_DATE},${SECOND_APPROVED_DATE}`,
    T0176_FULL_FLOW_VENUE_ID: '50871',
    ...overrides,
  };
}

function item(bookingDate) {
  return {
    bookingDate,
    productId: 1189806,
    quantity: 1,
    startTime: '10:00',
  };
}

function event(routeKey, rawPath, body) {
  return {
    body: JSON.stringify(body),
    headers: { 'x-correlation-id': 't0192-validation' },
    pathParameters: rawPath.includes('add-products') ? { bookingReference: '123456' } : undefined,
    rawPath,
    routeKey,
  };
}

function responseBody(response) {
  return JSON.parse(response.body);
}

function assertBlockedGate(result, expectedCode = 't0176_full_flow_item_date_not_allowed') {
  assert.equal(result.ok, false);
  assert.equal(result.code, expectedCode);
  assert.equal(result.statusCode, expectedCode === 't0176_full_flow_config_error' ? 500 : 403);
}

function validatePureGate() {
  const booking = loadBooking(fullFlowEnvironment());

  assert.equal(booking.gate([item(APPROVED_DATE)]).ok, true, 'One approved item date must pass.');
  assert.equal(
    booking.gate([item(APPROVED_DATE), item(SECOND_APPROVED_DATE)]).ok,
    true,
    'Multiple approved item dates must pass.',
  );
  assertBlockedGate(booking.gate([item(OUTSIDE_DATE)]));
  assertBlockedGate(booking.gate([item(APPROVED_DATE), item(OUTSIDE_DATE)]));
  assertBlockedGate(booking.gate([]));
  assertBlockedGate(booking.gate([{ ...item(APPROVED_DATE), bookingDate: null }]));
  assertBlockedGate(booking.gate([item('2026-02-30')]));

  const missingConfig = loadBooking(fullFlowEnvironment({ T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: '' }));
  assertBlockedGate(missingConfig.gate([item(APPROVED_DATE)]), 't0176_full_flow_config_error');

  const malformedConfig = loadBooking(
    fullFlowEnvironment({ T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: `${APPROVED_DATE},not-a-date` }),
  );
  assertBlockedGate(malformedConfig.gate([item(APPROVED_DATE)]), 't0176_full_flow_config_error');

  const disabledFullFlow = loadBooking(fullFlowEnvironment({ ENABLE_T0176_FULL_FLOW_REHEARSAL: 'false' }));
  assert.equal(disabledFullFlow.gate([item(OUTSIDE_DATE)]).ok, true, 'Older scoped smoke modes must remain independent.');

  const dev = loadBooking(
    fullFlowEnvironment({ ENABLE_T0176_FULL_FLOW_REHEARSAL: 'false', JUMPYARD_ENVIRONMENT: 'dev' }),
  );
  assert.equal(dev.gate([item(OUTSIDE_DATE)]).ok, true, 'Dev must remain controlled by its normal validation and gates.');
}

async function validateRouteGate({ body, rawPath, routeKey }) {
  const booking = loadBooking(fullFlowEnvironment());
  const response = await booking.handler(event(routeKey, rawPath, body));
  const parsed = responseBody(response);

  assert.equal(response.statusCode, 403, `${routeKey} must reject an out-of-window item date.`);
  assert.equal(parsed.status, 'blocked');
  assert.equal(parsed.error.code, 't0176_full_flow_item_date_not_allowed');
  assert.equal(booking.counters.awsCalls, 0, `${routeKey} must block before any AWS call.`);
  assert.equal(booking.counters.networkCalls, 0, `${routeKey} must block before any Roller call.`);
}

async function validateHandlersBlockBeforeSideEffects() {
  const quoteBody = { items: [item(OUTSIDE_DATE)] };
  const draftBody = {
    confirmDraft: true,
    customer: {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'Guest',
      phone: '+46700000000',
    },
    idempotencyKey: 't0192-new-draft',
    items: [item(OUTSIDE_DATE)],
  };
  const addOnDraftBody = {
    confirmDraft: true,
    idempotencyKey: 't0192-addon-draft',
    items: [item(OUTSIDE_DATE)],
  };

  await validateRouteGate({
    body: quoteBody,
    rawPath: '/v1/bookings/quote',
    routeKey: 'POST /v1/bookings/quote',
  });
  await validateRouteGate({
    body: draftBody,
    rawPath: '/v1/bookings/draft',
    routeKey: 'POST /v1/bookings/draft',
  });
  await validateRouteGate({
    body: quoteBody,
    rawPath: '/v1/bookings/123456/add-products/quote',
    routeKey: 'POST /v1/bookings/{bookingReference}/add-products/quote',
  });
  await validateRouteGate({
    body: addOnDraftBody,
    rawPath: '/v1/bookings/123456/add-products',
    routeKey: 'POST /v1/bookings/{bookingReference}/add-products',
  });
}

async function validateMalformedHandlerInputStillFailsClosed() {
  const booking = loadBooking(fullFlowEnvironment());
  const response = await booking.handler(
    event('POST /v1/bookings/quote', '/v1/bookings/quote', { items: [item('not-a-date')] }),
  );
  const parsed = responseBody(response);

  assert.equal(response.statusCode, 400);
  assert.equal(parsed.error.code, 'booking_date_invalid');
  assert.equal(booking.counters.awsCalls, 0);
  assert.equal(booking.counters.networkCalls, 0);
}

async function main() {
  validatePureGate();
  await validateHandlersBlockBeforeSideEffects();
  await validateMalformedHandlerInputStillFailsClosed();
  console.log('[pass] T0192 request-item dates require the exact approved full-flow operating-date allowlist');
  console.log('[pass] T0192 rejects mixed, missing, malformed, and out-of-window item dates fail closed');
  console.log('[pass] T0192 blocks all four quote/draft routes before AWS, Roller, or idempotency side effects');
  console.log('[pass] T0192 preserves non-full-flow park-test smoke and dev behavior');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
