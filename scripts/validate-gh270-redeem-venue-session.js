#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APPROVED_VENUE = '50871';

function fakeAwsModule() {
  return new Proxy(
    {},
    {
      get() {
        return class FakeAwsClientOrCommand {
          async send() {
            throw new Error('Unexpected AWS call during GH-270 validation.');
          }
        };
      },
    },
  );
}

function loadRedeemInternals(fetchImpl, environment = {}) {
  const absolutePath = path.join(ROOT, 'infra', 'lambda', 'redeem', 'index.js');
  const source = fs.readFileSync(absolutePath, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports,
    fetch: fetchImpl,
    module,
    process: {
      env: {
        JUMPYARD_ENVIRONMENT: 'park-test',
        STAFF_IDENTITY_VENUE_ID: APPROVED_VENUE,
        T0176_FULL_FLOW_VENUE_ID: APPROVED_VENUE,
        ...environment,
      },
    },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-270 validation.`);
    },
    setTimeout(callback) {
      callback();
      return 0;
    },
  };
  vm.runInNewContext(
    `${source}\nmodule.exports.__gh270 = { extractRollerVenueIdentity, getVerifiedRollerVenueId, resolveVerifiedRedeemVenue };`,
    sandbox,
    { filename: absolutePath },
  );
  return { internals: module.exports.__gh270, source };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

async function validateRedeemVenueFallback() {
  const config = { baseUrl: 'https://api.roller.app', env: 'live' };
  const token = { accessToken: 'test-token', tokenType: 'Bearer' };
  const requestedUrls = [];
  const matching = loadRedeemInternals(async (url) => {
    requestedUrls.push(String(url));
    return response(200, JSON.stringify({ id: Number(APPROVED_VENUE) }));
  });
  const accepted = await matching.internals.resolveVerifiedRedeemVenue(
    config,
    token,
    null,
    APPROVED_VENUE,
  );
  assert.equal(accepted.ok, true);
  assert.equal(accepted.venueId, APPROVED_VENUE);
  assert.deepEqual(requestedUrls, ['https://api.roller.app/venues/me']);

  let explicitMismatchCalls = 0;
  const explicitMismatch = loadRedeemInternals(async () => {
    explicitMismatchCalls += 1;
    return response(200, JSON.stringify({ id: Number(APPROVED_VENUE) }));
  });
  const rejectedMismatch = await explicitMismatch.internals.resolveVerifiedRedeemVenue(
    config,
    token,
    '99999',
    APPROVED_VENUE,
  );
  assert.equal(rejectedMismatch.ok, false);
  assert.equal(explicitMismatchCalls, 0, 'Explicit booking venue must stay authoritative.');

  for (const providerFailure of [
    async () => response(200, '{'),
    async () => response(200, JSON.stringify({ id: 99999 })),
    async () => response(503, ''),
    async () => { throw new Error('simulated network failure'); },
  ]) {
    const failed = loadRedeemInternals(providerFailure);
    const result = await failed.internals.resolveVerifiedRedeemVenue(config, token, null, APPROVED_VENUE);
    assert.equal(result.ok, false);
    assert.equal(result.venueId, null);
  }

  let nonLiveCalls = 0;
  const nonLive = loadRedeemInternals(async () => {
    nonLiveCalls += 1;
    return response(200, JSON.stringify({ id: Number(APPROVED_VENUE) }));
  });
  assert.equal(
    (await nonLive.internals.resolveVerifiedRedeemVenue(
      { ...config, env: 'playground' },
      token,
      null,
      APPROVED_VENUE,
    )).ok,
    false,
  );
  assert.equal(nonLiveCalls, 0, 'Non-Live provider identity must not be queried.');

  let inconsistentConfigCalls = 0;
  const inconsistent = loadRedeemInternals(
    async () => {
      inconsistentConfigCalls += 1;
      return response(200, JSON.stringify({ id: Number(APPROVED_VENUE) }));
    },
    { T0176_FULL_FLOW_VENUE_ID: '99999' },
  );
  assert.equal(
    (await inconsistent.internals.resolveVerifiedRedeemVenue(config, token, null, APPROVED_VENUE)).ok,
    false,
  );
  assert.equal(inconsistentConfigCalls, 0, 'Inconsistent venue configuration must fail before Roller.');

  const resolveIndex = matching.source.indexOf('const verifiedVenue = await resolveVerifiedRedeemVenue(');
  const assignIndex = matching.source.indexOf('booking.venueId = verifiedVenue.venueId;', resolveIndex);
  const upsertIndex = matching.source.indexOf('await upsertLiveBooking(booking, config.env);', resolveIndex);
  assert.ok(resolveIndex >= 0 && assignIndex > resolveIndex && upsertIndex > assignIndex);
}

function extractAuthenticationFailureCodes(source) {
  const match = source.match(
    /const STAFF_AUTHENTICATION_FAILURE_CODES = new Set<string>\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(match, 'Missing explicit staff authentication failure code set.');
  return new Set(Array.from(match[1].matchAll(/"([a-z0-9_]+)"/g), (item) => item[1]));
}

function validateFrontendFailureClassification() {
  const apiSource = fs.readFileSync(
    path.join(ROOT, 'jumpyard-checkin-admin', 'src', 'lib', 'adminApi.ts'),
    'utf8',
  );
  const pageSource = fs.readFileSync(
    path.join(ROOT, 'jumpyard-checkin-admin', 'src', 'app', 'page.tsx'),
    'utf8',
  );
  const authenticationFailures = extractAuthenticationFailureCodes(apiSource);
  assert.equal(authenticationFailures.has('staff_auth_session_required'), true);
  assert.equal(authenticationFailures.has('staff_auth_session_revoked'), true);
  assert.equal(authenticationFailures.has('staff_auth_token_expired'), true);
  assert.equal(authenticationFailures.has('staff_identity_not_authorized'), true);
  assert.equal(authenticationFailures.has('staff_venue_mismatch'), false);
  assert.equal(authenticationFailures.has('staff_role_forbidden'), false);
  assert.equal(authenticationFailures.has('emergency_stop_active'), false);
  assert.equal(authenticationFailures.has('staff_auth_disabled'), false);
  assert.equal(authenticationFailures.has('staff_identity_mode_disabled'), false);

  assert.match(
    apiSource,
    /get isAuthenticationFailure\(\) \{\s*return isStaffAuthenticationFailure\(this\.code\);\s*\}/,
  );
  assert.doesNotMatch(apiSource, /return this\.status === 401 \|\| this\.status === 403/);

  const handlerStart = pageSource.indexOf('const handleProtectedAuthFailure = useCallback(');
  const handlerEnd = pageSource.indexOf('const selectSession = useCallback', handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = pageSource.slice(handlerStart, handlerEnd);
  assert.match(
    handler,
    /requestError instanceof StaffApiError && requestError\.isAuthenticationFailure/,
  );
  assert.doesNotMatch(handler, /emergency_stop_active|staff_auth_disabled|staff_identity_mode_disabled/);
}

async function main() {
  await validateRedeemVenueFallback();
  validateFrontendFailureClassification();
  console.log('[pass] final redeem accepts missing venue only after exact authenticated Live Nacka verification');
  console.log('[pass] explicit mismatch, malformed identity, provider failure, non-Live, and inconsistent config fail closed');
  console.log('[pass] staff logout is limited to explicit authentication/session failures, not business or venue 403 responses');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
