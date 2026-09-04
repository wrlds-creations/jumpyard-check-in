const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_DATE = '2026-07-10';
const APPROVED_VENUE = '50871';

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
            throw new Error(`Unexpected AWS call through ${String(property)} during T0190 validation.`);
          }
        };
      },
    },
  );
}

function loadHandler(relativePath, environment, internalNames) {
  const absolutePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
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
      throw new Error('Unexpected network call during T0190 validation.');
    },
    module,
    exports: module.exports,
    process: { env: { ...environment } },
    require(moduleId) {
      if (moduleId === './package-contents') return require(path.join(path.dirname(absolutePath), 'package-contents.js'));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      if (relativePath === 'infra/lambda/session/index.js' && moduleId === './email-template') {
        return require(path.join(path.dirname(absolutePath), 'email-template.js'));
      }
      if (relativePath === 'infra/lambda/booking/index.js' && moduleId === './kiosk-terminal-contract') {
        return require(path.join(path.dirname(absolutePath), 'kiosk-terminal-contract.js'));
      }
      if (relativePath === 'infra/lambda/booking/index.js' && moduleId === './phone-product-catalog') {
        return require(path.join(path.dirname(absolutePath), 'phone-product-catalog.js'));
      }
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) in ${relativePath}.`);
    },
    setTimeout,
  };

  const testExports = internalNames.join(', ');
  vm.runInNewContext(
    `${source}\nmodule.exports.__t0190 = { ${testExports} };`,
    sandbox,
    { filename: absolutePath },
  );

  return {
    gates: module.exports.__t0190,
    handler: module.exports.handler,
  };
}

function responseBody(response) {
  return JSON.parse(response.body);
}

function fullFlowEnvironment(overrides = {}) {
  return {
    ENABLE_GUEST_MESSAGE_SENDS: 'true',
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_ROLLER_REDEEM_WRITES: 'true',
    ENABLE_STAFF_AUTH: 'true',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'true',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    ENABLE_T0171_ASSISTED_LOOKUP: 'true',
    ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL: 'false',
    ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: APPROVED_DATE,
    T0171_ASSISTED_LOOKUP_VENUE_ID: APPROVED_VENUE,
    T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: APPROVED_DATE,
    T0176_FULL_FLOW_VENUE_ID: APPROVED_VENUE,
    ...overrides,
  };
}

function lookupBooking(venueId) {
  return {
    venueId,
    items: [{ bookingDate: APPROVED_DATE }],
  };
}

function redeemContext(venueId) {
  return {
    booking: {
      bookingDate: APPROVED_DATE,
      bookingReference: '123456',
      rollerUniqueId: 'booking-uuid',
      venueId,
    },
    tickets: [{ bookingDate: APPROVED_DATE, ticketId: 'ticket-1' }],
  };
}

async function validateVenueEvidence() {
  const lookup = loadHandler(
    'infra/lambda/lookup/index.js',
    fullFlowEnvironment(),
    ['validateParkTestBookingScope'],
  ).gates;
  const lookupAccess = { lookupDate: APPROVED_DATE, mode: 'assisted_lookup' };
  const lookupRequest = { expectedDate: APPROVED_DATE, venueId: null };

  const correctLookup = lookup.validateParkTestBookingScope(
    lookupAccess,
    lookupRequest,
    { venueId: APPROVED_VENUE },
    lookupBooking(APPROVED_VENUE),
  );
  assert.equal(correctLookup.ok, true, 'Lookup must allow observed Nacka venue 50871.');
  assert.equal(correctLookup.venueId, APPROVED_VENUE);

  const wrongLookup = lookup.validateParkTestBookingScope(
    lookupAccess,
    lookupRequest,
    { venueId: '99999' },
    lookupBooking('99999'),
  );
  assert.equal(wrongLookup.ok, false, 'Lookup must reject the wrong observed venue.');

  const missingLookup = lookup.validateParkTestBookingScope(
    lookupAccess,
    lookupRequest,
    {},
    lookupBooking(null),
  );
  assert.equal(missingLookup.ok, false, 'Lookup must reject missing booking and provider venue evidence.');

  const providerVerifiedLookup = lookup.validateParkTestBookingScope(
    lookupAccess,
    lookupRequest,
    {},
    lookupBooking(null),
    APPROVED_VENUE,
  );
  assert.equal(
    providerVerifiedLookup.ok,
    true,
    'Lookup must allow missing booking venue when the authenticated Roller venue matches Nacka.',
  );
  assert.equal(providerVerifiedLookup.venueId, APPROVED_VENUE);

  const wrongProviderLookup = lookup.validateParkTestBookingScope(
    lookupAccess,
    lookupRequest,
    {},
    lookupBooking(null),
    '99999',
  );
  assert.equal(wrongProviderLookup.ok, false, 'Lookup must reject the wrong authenticated Roller venue.');

  const explicitWrongLookup = lookup.validateParkTestBookingScope(
    lookupAccess,
    lookupRequest,
    { venueId: '99999' },
    lookupBooking('99999'),
    APPROVED_VENUE,
  );
  assert.equal(
    explicitWrongLookup.ok,
    false,
    'An explicit wrong booking venue must override the authenticated account venue and remain blocked.',
  );

  const lookupWithoutApprovedVenue = loadHandler(
    'infra/lambda/lookup/index.js',
    fullFlowEnvironment({ T0171_ASSISTED_LOOKUP_VENUE_ID: '' }),
    ['validateParkTestBookingScope'],
  ).gates.validateParkTestBookingScope(
    lookupAccess,
    lookupRequest,
    { venueId: APPROVED_VENUE },
    lookupBooking(APPROVED_VENUE),
  );
  assert.equal(lookupWithoutApprovedVenue.ok, false, 'Lookup must reject missing approved-venue config.');
  assert.equal(lookupWithoutApprovedVenue.code, 'lookup_config_error');

  const booking = loadHandler(
    'infra/lambda/booking/index.js',
    fullFlowEnvironment(),
    ['validateT0176FullFlowOriginalBookingAccess'],
  ).gates;
  assert.equal(
    booking.validateT0176FullFlowOriginalBookingAccess({
      bookingDate: APPROVED_DATE,
      venueId: APPROVED_VENUE,
    }).ok,
    true,
    'Add-on access must allow observed Nacka venue 50871.',
  );
  assert.equal(
    booking.validateT0176FullFlowOriginalBookingAccess({
      bookingDate: APPROVED_DATE,
      venueId: '99999',
    }).ok,
    false,
    'Add-on access must reject the wrong venue.',
  );
  assert.equal(
    booking.validateT0176FullFlowOriginalBookingAccess({
      bookingDate: APPROVED_DATE,
      venueId: null,
    }).ok,
    false,
    'Add-on access must reject missing venue evidence.',
  );

  const bookingWithoutApprovedVenue = loadHandler(
    'infra/lambda/booking/index.js',
    fullFlowEnvironment({ T0176_FULL_FLOW_VENUE_ID: '' }),
    ['validateT0176FullFlowOriginalBookingAccess'],
  ).gates.validateT0176FullFlowOriginalBookingAccess({
    bookingDate: APPROVED_DATE,
    venueId: APPROVED_VENUE,
  });
  assert.equal(bookingWithoutApprovedVenue.ok, false, 'Add-on access must reject missing approved-venue config.');
  assert.equal(bookingWithoutApprovedVenue.code, 't0176_full_flow_config_error');

  const redeem = loadHandler(
    'infra/lambda/redeem/index.js',
    fullFlowEnvironment(),
    ['evaluateRedeemWriteGate', 'normalizeBooking'],
  ).gates;
  const request = {
    bookingReference: '123456',
    expectedDate: APPROVED_DATE,
    identifier: '123456',
    rollerUniqueId: 'booking-uuid',
  };
  const decision = { selectedTicketIds: ['ticket-1'] };

  const normalizedAuthoritativeBooking = redeem.normalizeBooking(
    {
      bookingReference: '123456',
      items: [{ bookingDate: APPROVED_DATE, venue: { id: APPROVED_VENUE } }],
      uniqueId: 'booking-uuid',
    },
    { byId: new Map() },
  );
  assert.equal(
    normalizedAuthoritativeBooking.venueId,
    APPROVED_VENUE,
    'Final Roller redeem refresh must carry authoritative venue evidence into Aurora.',
  );

  assert.equal(
    redeem.evaluateRedeemWriteGate(redeemContext(APPROVED_VENUE), request, decision).enabled,
    true,
    'Redeem must allow observed Nacka venue 50871 inside the approved date.',
  );
  assert.equal(
    redeem.evaluateRedeemWriteGate(redeemContext('99999'), request, decision).enabled,
    false,
    'Redeem must reject the wrong venue.',
  );
  assert.equal(
    redeem.evaluateRedeemWriteGate(redeemContext(null), request, decision).enabled,
    false,
    'Redeem must reject missing venue evidence.',
  );

  const redeemWithoutApprovedVenue = loadHandler(
    'infra/lambda/redeem/index.js',
    fullFlowEnvironment({ T0176_FULL_FLOW_VENUE_ID: '' }),
    ['evaluateRedeemWriteGate'],
  ).gates.evaluateRedeemWriteGate(redeemContext(APPROVED_VENUE), request, decision);
  assert.equal(redeemWithoutApprovedVenue.enabled, false, 'Redeem must reject missing approved-venue config.');
}

async function validateEmergencyStopPrecedence() {
  const stoppedEnvironment = fullFlowEnvironment({
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'true',
    ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'true',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '123456,booking-uuid,ticket-1',
  });
  const stoppedBookingModule = loadHandler(
    'infra/lambda/booking/index.js',
    stoppedEnvironment,
    ['isEmergencyStopEnabled', 'isNewBookingDraftWriteEnabled', 'isAddProductDraftWriteEnabled'],
  );
  assert.equal(stoppedBookingModule.gates.isEmergencyStopEnabled(), true);
  assert.equal(stoppedBookingModule.gates.isNewBookingDraftWriteEnabled(), false);
  assert.equal(stoppedBookingModule.gates.isAddProductDraftWriteEnabled(), false);

  const stoppedAvailability = await stoppedBookingModule.handler({
    body: JSON.stringify({ bookingDate: APPROVED_DATE, startTime: '10:00' }),
    routeKey: 'POST /v1/bookings/availability',
  });
  assert.equal(stoppedAvailability.statusCode, 409, 'Emergency stop must block read-only park-test booking operations.');
  assert.equal(responseBody(stoppedAvailability).error.code, 'emergency_stop_active');

  const stoppedLookup = loadHandler(
    'infra/lambda/lookup/index.js',
    stoppedEnvironment,
    ['isEmergencyStopEnabled', 'validateParkTestLookupAccess'],
  ).gates;
  const lookupAccess = await stoppedLookup.validateParkTestLookupAccess({
    expectedDate: APPROVED_DATE,
    identifier: '123456',
    identifierType: 'bookingReference',
  });
  assert.equal(lookupAccess.ok, false, 'Emergency stop must block all park-test lookup modes.');
  assert.equal(lookupAccess.code, 'emergency_stop_active');

  const stoppedSessionModule = loadHandler(
    'infra/lambda/session/index.js',
    stoppedEnvironment,
    ['isEmergencyStopEnabled', 'isGuestMessagingSendEnabled', 'isStaffAuthEnabled'],
  );
  assert.equal(stoppedSessionModule.gates.isStaffAuthEnabled(), false);
  assert.equal(stoppedSessionModule.gates.isGuestMessagingSendEnabled(), false);
  const stoppedStaffList = await stoppedSessionModule.handler({
    headers: {},
    rawPath: '/v1/staff/check-in/sessions',
    routeKey: 'GET /v1/staff/check-in/sessions',
  });
  assert.equal(stoppedStaffList.statusCode, 409, 'Emergency stop must block staff routes before token verification.');
  assert.equal(responseBody(stoppedStaffList).error.code, 'emergency_stop_active');

  const stoppedRedeem = loadHandler(
    'infra/lambda/redeem/index.js',
    stoppedEnvironment,
    ['evaluateRedeemWriteGate'],
  ).gates.evaluateRedeemWriteGate(
    redeemContext(APPROVED_VENUE),
    { bookingReference: '123456', expectedDate: APPROVED_DATE, identifier: '123456' },
    { selectedTicketIds: ['ticket-1'] },
  );
  assert.equal(stoppedRedeem.enabled, false, 'Emergency stop must block redeem despite all override flags.');
  assert.equal(stoppedRedeem.reason, 'emergency_stop_active');

  const stoppedWebhook = loadHandler(
    'infra/lambda/webhook/index.js',
    { ...stoppedEnvironment, ENABLE_ROLLER_WEBHOOK_PROCESSING: 'true' },
    ['isRollerWebhookProcessingEnabled'],
  ).gates;
  assert.equal(stoppedWebhook.isRollerWebhookProcessingEnabled(), false);

  const missingStopBooking = loadHandler(
    'infra/lambda/booking/index.js',
    fullFlowEnvironment({ JUMPYARD_EMERGENCY_STOP: undefined }),
    ['isEmergencyStopEnabled', 'isNewBookingDraftWriteEnabled'],
  ).gates;
  assert.equal(missingStopBooking.isEmergencyStopEnabled(), true, 'Missing emergency-stop config must fail closed.');
  assert.equal(missingStopBooking.isNewBookingDraftWriteEnabled(), false);
}

async function validateReleasedStopStillNeedsNarrowGates() {
  const activeBooking = loadHandler(
    'infra/lambda/booking/index.js',
    fullFlowEnvironment(),
    ['isNewBookingDraftWriteEnabled', 'isAddProductDraftWriteEnabled'],
  ).gates;
  assert.equal(activeBooking.isNewBookingDraftWriteEnabled(), true);
  assert.equal(activeBooking.isAddProductDraftWriteEnabled(), true);

  const unscopedBooking = loadHandler(
    'infra/lambda/booking/index.js',
    fullFlowEnvironment({
      ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
      ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
      ENABLE_T0176_FULL_FLOW_REHEARSAL: 'false',
    }),
    ['isNewBookingDraftWriteEnabled', 'isAddProductDraftWriteEnabled'],
  ).gates;
  assert.equal(unscopedBooking.isNewBookingDraftWriteEnabled(), false);
  assert.equal(unscopedBooking.isAddProductDraftWriteEnabled(), false);

  const activeSession = loadHandler(
    'infra/lambda/session/index.js',
    fullFlowEnvironment(),
    ['isGuestMessagingSendEnabled', 'isStaffAuthEnabled'],
  ).gates;
  assert.equal(activeSession.isStaffAuthEnabled(), true);
  assert.equal(activeSession.isGuestMessagingSendEnabled(), true);

  const unscopedSession = loadHandler(
    'infra/lambda/session/index.js',
    fullFlowEnvironment({
      ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
      ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL: 'false',
      ENABLE_T0176_FULL_FLOW_REHEARSAL: 'false',
    }),
    ['isStaffAuthEnabled'],
  ).gates;
  assert.equal(unscopedSession.isStaffAuthEnabled(), false);

  const unscopedRedeem = loadHandler(
    'infra/lambda/redeem/index.js',
    fullFlowEnvironment({
      ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
      ENABLE_T0176_FULL_FLOW_REHEARSAL: 'false',
    }),
    ['evaluateRedeemWriteGate'],
  ).gates.evaluateRedeemWriteGate(
    redeemContext(APPROVED_VENUE),
    { bookingReference: '123456', expectedDate: APPROVED_DATE, identifier: '123456' },
    { selectedTicketIds: ['ticket-1'] },
  );
  assert.equal(unscopedRedeem.enabled, false);
  assert.equal(unscopedRedeem.reason, 'park_test_redeem_not_approved');

  const allowedSmokeRedeem = loadHandler(
    'infra/lambda/redeem/index.js',
    fullFlowEnvironment({
      ENABLE_T0166_LIVE_REDEEM_SMOKE: 'true',
      ENABLE_T0176_FULL_FLOW_REHEARSAL: 'false',
      T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '123456,booking-uuid,ticket-1',
    }),
    ['evaluateRedeemWriteGate'],
  ).gates.evaluateRedeemWriteGate(
    redeemContext(APPROVED_VENUE),
    {
      bookingReference: '123456',
      expectedDate: APPROVED_DATE,
      identifier: '123456',
      rollerUniqueId: 'booking-uuid',
    },
    { selectedTicketIds: ['ticket-1'] },
  );
  assert.equal(allowedSmokeRedeem.enabled, true, 'Released stop must still require and honor the exact smoke allowlist.');

  const activeLookup = loadHandler(
    'infra/lambda/lookup/index.js',
    fullFlowEnvironment(),
    ['validateParkTestLookupAccess'],
  ).gates;
  const activeLookupAccess = await activeLookup.validateParkTestLookupAccess({
    expectedDate: APPROVED_DATE,
    identifier: '123456',
    identifierType: 'bookingReference',
  });
  assert.equal(activeLookupAccess.ok, true);
  assert.equal(activeLookupAccess.mode, 'assisted_lookup');

  const activeWebhook = loadHandler(
    'infra/lambda/webhook/index.js',
    fullFlowEnvironment({ ENABLE_ROLLER_WEBHOOK_PROCESSING: 'true' }),
    ['isRollerWebhookProcessingEnabled'],
  ).gates;
  assert.equal(activeWebhook.isRollerWebhookProcessingEnabled(), true);
}

function validateDevBehaviorRemainsIndependent() {
  const devEnvironment = {
    ENABLE_GUEST_MESSAGE_SENDS: 'true',
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_ROLLER_REDEEM_WRITES: 'true',
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'true',
    ENABLE_STAFF_AUTH: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'dev',
  };

  const booking = loadHandler(
    'infra/lambda/booking/index.js',
    devEnvironment,
    ['isAddProductDraftWriteEnabled', 'isNewBookingDraftWriteEnabled'],
  ).gates;
  assert.equal(booking.isNewBookingDraftWriteEnabled(), true);
  assert.equal(booking.isAddProductDraftWriteEnabled(), true);

  const session = loadHandler(
    'infra/lambda/session/index.js',
    devEnvironment,
    ['isGuestMessagingSendEnabled', 'isStaffAuthEnabled'],
  ).gates;
  assert.equal(session.isStaffAuthEnabled(), true);
  assert.equal(session.isGuestMessagingSendEnabled(), true);

  const redeem = loadHandler(
    'infra/lambda/redeem/index.js',
    devEnvironment,
    ['evaluateRedeemWriteGate'],
  ).gates.evaluateRedeemWriteGate({}, {}, {});
  assert.equal(redeem.enabled, true);

  const webhook = loadHandler(
    'infra/lambda/webhook/index.js',
    devEnvironment,
    ['isRollerWebhookProcessingEnabled'],
  ).gates;
  assert.equal(webhook.isRollerWebhookProcessingEnabled(), true);
}

async function main() {
  await validateVenueEvidence();
  await validateEmergencyStopPrecedence();
  await validateReleasedStopStillNeedsNarrowGates();
  validateDevBehaviorRemainsIndependent();
  console.log('[pass] T0190 venue evidence fails closed across lookup, add-on, and redeem gates');
  console.log('[pass] T0190 emergency stop overrides lookup, booking, staff, messaging, webhook, and redeem gates');
  console.log('[pass] T0190 released stop still requires the approved narrow park-test gate');
  console.log('[pass] T0190 preserves normal dev base-gate behavior when its stop is released');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
