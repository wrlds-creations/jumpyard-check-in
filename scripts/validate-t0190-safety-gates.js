const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_DATE = '2026-07-10';
const APPROVED_VENUE = '50871';
// GH-463: open-ended window start and Nacka dates after the explicit list.
const OPEN_ENDED_FROM_DATE = '2026-06-29';
const BEFORE_OPEN_ENDED_DATE = '2026-06-28';
const OPEN_ENDED_DATES = ['2026-10-01', '2027-06-01'];
const OTHER_VENUE = '99999';

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
      if (moduleId === './email-marketing-consent') return require('../infra/lambda/booking/email-marketing-consent');
      if (moduleId === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (moduleId === './staff-handout-write') return require('../infra/lambda/redeem/staff-handout-write');
      if (moduleId === './staff-board') return require('../infra/lambda/session/staff-board');
      if (moduleId === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
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

function loadGh463Gates(environment) {
  return {
    booking: loadHandler('infra/lambda/booking/index.js', environment, [
      'isAddProductDraftWriteEnabled',
      'isNewBookingDraftWriteEnabled',
      'validateT0176FullFlowOriginalBookingAccess',
    ]).gates,
    lookup: loadHandler('infra/lambda/lookup/index.js', environment, [
      'validateParkTestBookingScope',
      'validateParkTestLookupAccess',
    ]).gates,
    redeem: loadHandler('infra/lambda/redeem/index.js', environment, ['evaluateRedeemWriteGate']).gates,
  };
}

function gh463LookupRequest(date) {
  return { expectedDate: date, identifier: '123456', identifierType: 'bookingReference' };
}

function gh463RedeemContext(date, venueId, ticketDate = date) {
  return {
    booking: { bookingDate: date, bookingReference: '123456', rollerUniqueId: 'booking-uuid', venueId },
    tickets: [{ bookingDate: ticketDate, ticketId: 'ticket-1' }],
  };
}

function gh463RedeemRequest(date) {
  return { bookingReference: '123456', expectedDate: date, identifier: '123456', rollerUniqueId: 'booking-uuid' };
}

// GH-463: with the open-ended start, Booking add-on access, Lookup, and Redeem accept Nacka dates
// after the explicit list and still reject other venues, earlier dates, bad config, and the stop.
async function validateGh463OpenEndedWindow() {
  const decision = { selectedTicketIds: ['ticket-1'] };
  const open = loadGh463Gates(fullFlowEnvironment({ T0176_FULL_FLOW_OPEN_ENDED_FROM_DATE: OPEN_ENDED_FROM_DATE }));

  for (const date of OPEN_ENDED_DATES) {
    const nackaAddOn = open.booking.validateT0176FullFlowOriginalBookingAccess({ bookingDate: date, venueId: APPROVED_VENUE });
    assert.equal(nackaAddOn.ok, true, `Add-on access must allow Nacka on ${date}.`);
    const otherAddOn = open.booking.validateT0176FullFlowOriginalBookingAccess({ bookingDate: date, venueId: OTHER_VENUE });
    assert.equal(otherAddOn.ok, false, `Add-on access must reject another venue on ${date}.`);

    const access = await open.lookup.validateParkTestLookupAccess(gh463LookupRequest(date));
    assert.equal(access.ok, true, `Lookup must allow ${date}.`);
    assert.equal(access.lookupDate, date);
    const lookupRequest = { expectedDate: date, venueId: null };
    const nackaScope = open.lookup.validateParkTestBookingScope(access, lookupRequest, { venueId: APPROVED_VENUE }, {
      items: [{ bookingDate: date }],
      venueId: APPROVED_VENUE,
    });
    assert.equal(nackaScope.ok, true, `Lookup must allow a Nacka booking on ${date}.`);
    const otherScope = open.lookup.validateParkTestBookingScope(access, lookupRequest, { venueId: OTHER_VENUE }, {
      items: [{ bookingDate: date }],
      venueId: OTHER_VENUE,
    });
    assert.equal(otherScope.ok, false, `Lookup must reject another venue on ${date}.`);

    const nackaRedeem = open.redeem.evaluateRedeemWriteGate(
      gh463RedeemContext(date, APPROVED_VENUE),
      gh463RedeemRequest(date),
      decision,
    );
    assert.equal(nackaRedeem.enabled, true, `Redeem must allow Nacka on ${date}.`);
    const otherRedeem = open.redeem.evaluateRedeemWriteGate(
      gh463RedeemContext(date, OTHER_VENUE),
      gh463RedeemRequest(date),
      decision,
    );
    assert.equal(otherRedeem.enabled, false, `Redeem must reject another venue on ${date}.`);
  }

  const early = BEFORE_OPEN_ENDED_DATE;
  assert.equal(
    open.booking.validateT0176FullFlowOriginalBookingAccess({ bookingDate: early, venueId: APPROVED_VENUE }).ok,
    false,
    'Add-on access must reject a date before the open-ended start.',
  );
  const earlyLookup = await open.lookup.validateParkTestLookupAccess(gh463LookupRequest(early));
  assert.equal(earlyLookup.code, 'live_lookup_not_allowed', 'Lookup must reject a date before the open-ended start.');
  assert.equal(
    open.redeem.evaluateRedeemWriteGate(gh463RedeemContext(early, APPROVED_VENUE), gh463RedeemRequest(early), decision)
      .enabled,
    false,
    'Redeem must reject a date before the open-ended start.',
  );
  const [afterList] = OPEN_ENDED_DATES;
  assert.equal(
    open.redeem.evaluateRedeemWriteGate(
      gh463RedeemContext(afterList, APPROVED_VENUE, early),
      gh463RedeemRequest(afterList),
      decision,
    ).enabled,
    false,
    'Redeem must reject a ticket dated before the open-ended start.',
  );

  // Without the open-ended start, the explicit list still ends the window (pre-#463 behavior).
  const listOnly = loadGh463Gates(fullFlowEnvironment());
  assert.equal(
    listOnly.booking.validateT0176FullFlowOriginalBookingAccess({ bookingDate: afterList, venueId: APPROVED_VENUE }).ok,
    false,
  );
  assert.equal(
    (await listOnly.lookup.validateParkTestLookupAccess(gh463LookupRequest(afterList))).code,
    'live_lookup_not_allowed',
  );
  assert.equal(
    listOnly.redeem.evaluateRedeemWriteGate(
      gh463RedeemContext(afterList, APPROVED_VENUE),
      gh463RedeemRequest(afterList),
      decision,
    ).enabled,
    false,
  );

  // A malformed open-ended start fails closed, even for listed dates.
  const malformed = loadGh463Gates(fullFlowEnvironment({ T0176_FULL_FLOW_OPEN_ENDED_FROM_DATE: '2026-13-01' }));
  assert.equal(
    malformed.booking.validateT0176FullFlowOriginalBookingAccess({ bookingDate: APPROVED_DATE, venueId: APPROVED_VENUE })
      .ok,
    false,
  );
  assert.equal(
    (await malformed.lookup.validateParkTestLookupAccess(gh463LookupRequest(APPROVED_DATE))).code,
    'lookup_config_error',
  );
  assert.equal(
    malformed.redeem.evaluateRedeemWriteGate(redeemContext(APPROVED_VENUE), gh463RedeemRequest(APPROVED_DATE), decision)
      .enabled,
    false,
  );

  // The emergency stop still overrides the open-ended window.
  const stopped = loadGh463Gates(
    fullFlowEnvironment({ JUMPYARD_EMERGENCY_STOP: 'true', T0176_FULL_FLOW_OPEN_ENDED_FROM_DATE: OPEN_ENDED_FROM_DATE }),
  );
  assert.equal(
    (await stopped.lookup.validateParkTestLookupAccess(gh463LookupRequest(afterList))).code,
    'emergency_stop_active',
  );
  assert.equal(
    stopped.redeem.evaluateRedeemWriteGate(
      gh463RedeemContext(afterList, APPROVED_VENUE),
      gh463RedeemRequest(afterList),
      decision,
    ).reason,
    'emergency_stop_active',
  );
  assert.equal(stopped.booking.isNewBookingDraftWriteEnabled(), false);
  assert.equal(stopped.booking.isAddProductDraftWriteEnabled(), false);
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
  await validateGh463OpenEndedWindow();
  console.log('[pass] T0190 venue evidence fails closed across lookup, add-on, and redeem gates');
  console.log('[pass] T0190 emergency stop overrides lookup, booking, staff, messaging, webhook, and redeem gates');
  console.log('[pass] T0190 released stop still requires the approved narrow park-test gate');
  console.log('[pass] T0190 preserves normal dev base-gate behavior when its stop is released');
  console.log('[pass] GH-463 add-on access, lookup, and redeem accept Nacka on 2026-10-01 and 2027-06-01 and reject another venue');
  console.log('[pass] GH-463 dates before 2026-06-29, list-only config, a malformed start, and the emergency stop stay closed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
