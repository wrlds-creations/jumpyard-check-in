#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_DATE = '2026-08-10';
const APPROVED_VENUE = '50871';

function fakeAwsModule() {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return class FakeAwsClientOrCommand {
          async send() {
            throw new Error(`Unexpected AWS call through ${String(property)} during venue validation.`);
          }
        };
      },
    },
  );
}

function loadInternals(fetchImpl = async () => {
  throw new Error('Unexpected network call during assisted-lookup venue validation.');
}) {
  const absolutePath = path.join(ROOT, 'infra', 'lambda', 'lookup', 'index.js');
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
    fetch: fetchImpl,
    module,
    exports: module.exports,
    process: {
      env: {
        ENABLE_T0171_ASSISTED_LOOKUP: 'true',
        JUMPYARD_ENVIRONMENT: 'park-test',
        T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: APPROVED_DATE,
        T0171_ASSISTED_LOOKUP_VENUE_ID: APPROVED_VENUE,
      },
    },
    require(moduleId) {
      if (moduleId === './package-contents') return require(path.join(path.dirname(absolutePath), 'package-contents.js'));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during venue validation.`);
    },
    setTimeout(callback) {
      callback();
      return 0;
    },
  };
  const internals = [
    'extractRollerVenueIdentity',
    'getVerifiedRollerVenueId',
    'needsVerifiedAssistedLookupVenue',
    'validateParkTestBookingScope',
  ];
  vm.runInNewContext(
    `${source}\nmodule.exports.__assistedLookupVenue = { ${internals.join(', ')} };`,
    sandbox,
    { filename: absolutePath },
  );
  return module.exports.__assistedLookupVenue;
}

function booking(venueId = null) {
  return {
    bookingDate: APPROVED_DATE,
    items: [{ bookingDate: APPROVED_DATE }],
    venueId,
  };
}

async function validateProviderIdentity() {
  const liveConfig = { baseUrl: 'https://api.roller.app', env: 'live' };
  const token = { accessToken: 'test-token', tokenType: 'Bearer' };
  const requestedUrls = [];
  const matching = loadInternals(async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: Number(APPROVED_VENUE) }),
    };
  });
  assert.equal(
    await matching.getVerifiedRollerVenueId(liveConfig, token, APPROVED_VENUE),
    APPROVED_VENUE,
    'The authenticated Roller venue must be accepted only when it matches the approved venue.',
  );
  assert.deepEqual(requestedUrls, ['https://api.roller.app/venues/me']);

  const mismatch = loadInternals(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: 99999 }),
  }));
  assert.equal(await mismatch.getVerifiedRollerVenueId(liveConfig, token, APPROVED_VENUE), null);

  const unavailable = loadInternals(async () => ({ ok: false, status: 503, text: async () => '' }));
  assert.equal(await unavailable.getVerifiedRollerVenueId(liveConfig, token, APPROVED_VENUE), null);

  let nonLiveCalls = 0;
  const nonLive = loadInternals(async () => {
    nonLiveCalls += 1;
    throw new Error('Non-live provider identity must not be queried.');
  });
  assert.equal(
    await nonLive.getVerifiedRollerVenueId({ ...liveConfig, env: 'playground' }, token, APPROVED_VENUE),
    null,
  );
  assert.equal(nonLiveCalls, 0);
}

function validateScopeFallback() {
  const gates = loadInternals();
  const access = { lookupDate: APPROVED_DATE, mode: 'assisted_lookup' };
  const request = { expectedDate: APPROVED_DATE, venueId: null };

  assert.equal(gates.extractRollerVenueIdentity({ data: { venueId: APPROVED_VENUE } }), APPROVED_VENUE);
  assert.equal(gates.needsVerifiedAssistedLookupVenue(access, {}, booking()), true);
  assert.equal(gates.needsVerifiedAssistedLookupVenue(access, { venueId: APPROVED_VENUE }, booking()), false);

  const verifiedFallback = gates.validateParkTestBookingScope(
    access,
    request,
    {},
    booking(),
    APPROVED_VENUE,
  );
  assert.equal(verifiedFallback.ok, true);
  assert.equal(verifiedFallback.venueId, APPROVED_VENUE);

  assert.equal(gates.validateParkTestBookingScope(access, request, {}, booking()).ok, false);
  assert.equal(gates.validateParkTestBookingScope(access, request, {}, booking(), '99999').ok, false);
  assert.equal(
    gates.validateParkTestBookingScope(
      access,
      request,
      { venueId: '99999' },
      booking('99999'),
      APPROVED_VENUE,
    ).ok,
    false,
  );
}

async function main() {
  validateScopeFallback();
  await validateProviderIdentity();
  console.log('Assisted-lookup venue validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
