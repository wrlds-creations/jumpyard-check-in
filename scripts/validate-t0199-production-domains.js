#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const CONTRACT_PATH = 'config/production-domains.json';
const EXPECTED_ORIGINS = [
  'https://checkin.jumpyard.se',
  'https://staff-checkin.jumpyard.se',
];
const EXPECTED_SURFACES = {
  guest: {
    role: 'guest-check-in',
    hostname: 'checkin.jumpyard.se',
    origin: EXPECTED_ORIGINS[0],
    sourceDirectory: 'jumpyard-checkin-phone',
    logicalTarget: 'production-phone-pages',
    projectName: 'jumpyard-check-in-production',
    pagesDevOrigin: 'https://jumpyard-check-in-production.pages.dev',
    cnameTarget: 'jumpyard-check-in-production.pages.dev',
  },
  staffAdmin: {
    role: 'staff-admin',
    hostname: 'staff-checkin.jumpyard.se',
    origin: EXPECTED_ORIGINS[1],
    sourceDirectory: 'jumpyard-checkin-admin',
    logicalTarget: 'production-staff-admin-pages',
    projectName: 'jumpyard-checkin-admin-production',
    pagesDevOrigin: 'https://jumpyard-checkin-admin-production.pages.dev',
    cnameTarget: 'jumpyard-checkin-admin-production.pages.dev',
  },
};
const EXPECTED_PARK_TEST_ORIGINS = [
  'https://jumpyard-check-in-park-test.pages.dev',
  'https://jumpyard-checkin-admin-park-test.pages.dev',
  'https://jumpyard-check-in-kiosk.pages.dev',
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameValues(actual, expected) {
  return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected);
}

function validateOrigin(origin, expectedHostname, field, errors) {
  if (typeof origin !== 'string') {
    errors.push(`${field} must be a string`);
    return;
  }

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    errors.push(`${field} must be an absolute URL`);
    return;
  }

  if (parsed.protocol !== 'https:') errors.push(`${field} must use HTTPS`);
  if (origin !== parsed.origin) errors.push(`${field} must be an origin without path, query, hash, credentials, or trailing slash`);
  if (parsed.hostname !== expectedHostname) errors.push(`${field} must use ${expectedHostname}`);
  if (!parsed.hostname.endsWith('.jumpyard.se')) errors.push(`${field} must stay under jumpyard.se`);
  if (parsed.hostname.includes('park-test') || parsed.hostname.endsWith('.pages.dev')) {
    errors.push(`${field} must not use a park-test or pages.dev hostname`);
  }
}

function validateContract(contract) {
  const errors = [];
  const add = (condition, message) => {
    if (!condition) errors.push(message);
  };

  add(contract?.schemaVersion === 1, 'schemaVersion must be 1');
  add(contract?.contract === 'jumpyard-check-in-production-web-domains', 'contract name is invalid');
  add(contract?.environment === 'production', 'environment must be production');
  add(
    contract?.state === 'dns-and-tls-active-awaiting-application-deployment',
    'state must remain dns-and-tls-active-awaiting-application-deployment',
  );
  add(contract?.zone === 'jumpyard.se', 'zone must be jumpyard.se');
  add(sameValues(contract?.productionWebOrigins, EXPECTED_ORIGINS), 'productionWebOrigins must contain exactly the approved guest and staff origins');

  const surfaceKeys = Object.keys(contract?.surfaces || {}).sort();
  add(JSON.stringify(surfaceKeys) === JSON.stringify(['guest', 'staffAdmin']), 'surfaces must contain exactly guest and staffAdmin');

  for (const [key, expected] of Object.entries(EXPECTED_SURFACES)) {
    const surface = contract?.surfaces?.[key];
    add(Boolean(surface), `surfaces.${key} is required`);
    if (!surface) continue;

    add(surface.role === expected.role, `surfaces.${key}.role is invalid`);
    add(surface.hostname === expected.hostname, `surfaces.${key}.hostname is invalid`);
    add(surface.sourceDirectory === expected.sourceDirectory, `surfaces.${key}.sourceDirectory is invalid`);
    validateOrigin(surface.origin, expected.hostname, `surfaces.${key}.origin`, errors);

    const pages = surface.cloudflarePages;
    add(pages?.logicalTarget === expected.logicalTarget, `surfaces.${key}.cloudflarePages.logicalTarget is invalid`);
    add(pages?.projectName === expected.projectName, `surfaces.${key}.cloudflarePages.projectName is invalid`);
    add(pages?.pagesDevOrigin === expected.pagesDevOrigin, `surfaces.${key}.cloudflarePages.pagesDevOrigin is invalid`);
    add(pages?.gitProviderConnected === false, `surfaces.${key}.cloudflarePages must not connect a Git provider`);
    add(pages?.applicationDeployments === 0, `surfaces.${key}.cloudflarePages must remain empty`);
    add(pages?.status === 'created-empty', `surfaces.${key}.cloudflarePages.status must be created-empty`);
    add(
      pages?.createdBy === 'T0199-issue-206-explicit-scope-extension',
      `surfaces.${key}.cloudflarePages.createdBy is invalid`,
    );
    add(
      pages?.customDomainAssociation?.hostname === expected.hostname,
      `surfaces.${key}.cloudflarePages.customDomainAssociation.hostname is invalid`,
    );
    add(
      pages?.customDomainAssociation?.present === true,
      `surfaces.${key}.cloudflarePages custom-domain association must exist`,
    );
    add(
      pages?.customDomainAssociation?.status === 'active-ssl-enabled',
      `surfaces.${key}.cloudflarePages custom-domain status is invalid`,
    );

    const dns = surface.dns;
    add(dns?.recordType === 'CNAME', `surfaces.${key}.dns.recordType must be CNAME`);
    add(dns?.name === expected.hostname, `surfaces.${key}.dns.name must match its hostname`);
    add(dns?.cnameTarget === expected.cnameTarget, `surfaces.${key}.dns.cnameTarget is invalid`);
    add(
      dns?.status === 'published-and-publicly-verified',
      `surfaces.${key}.dns.status must be published-and-publicly-verified`,
    );
    add(dns?.ttlSeconds === 3600, `surfaces.${key}.dns.ttlSeconds must match public readback`);
    add(dns?.associationOrder === 'cloudflare-first', `surfaces.${key}.dns.associationOrder must be cloudflare-first`);

    add(surface?.tls?.status === 'active', `surfaces.${key}.tls.status must be active`);
    add(surface?.tls?.managedBy === 'Cloudflare', `surfaces.${key}.tls.managedBy is invalid`);
    add(surface?.tls?.dashboardReadback === 'SSL enabled', `surfaces.${key}.tls dashboard readback is invalid`);
  }

  add(
    sameValues(contract?.surfaces?.staffAdmin?.identity?.callbackUrls, [
      'https://staff-checkin.jumpyard.se/auth/callback',
    ]),
    'staff/admin callback URL is invalid',
  );
  add(
    sameValues(contract?.surfaces?.staffAdmin?.identity?.logoutUrls, [
      'https://staff-checkin.jumpyard.se/admin',
    ]),
    'staff/admin logout URL is invalid',
  );

  add(contract?.api?.customHostname === null, 'no API custom hostname is approved');
  add(contract?.api?.customHostnameApproved === false, 'API custom hostname approval must stay false');
  add(contract?.api?.browserBaseUrl === null, 'production API base URL must stay unset until production creation');
  add(
    contract?.api?.browserBaseUrlSource === 'production-api-created-by-separately-approved-issue',
    'production API base URL source is invalid',
  );
  add(sameValues(contract?.api?.corsAllowedOrigins, EXPECTED_ORIGINS), 'production CORS origins must match the two approved web origins exactly');
  add(
    contract?.api?.defaultExecuteApiEndpointPolicy === 'must-remain-enabled-without-approved-custom-api-hostname',
    'default execute-api endpoint policy is invalid',
  );
  add(contract?.api?.edgeIsolationClaimAllowed === false, 'edge isolation must not be claimed without a custom API hostname');
  add(!JSON.stringify(contract).includes('api-checkin'), 'api-checkin hostname expansion is not approved');

  add(contract?.dns?.owner === 'JumpYard / Joao Henriques', 'DNS owner is invalid');
  add(contract?.dns?.handoffReady === true, 'DNS handoff must be ready');
  add(contract?.dns?.recordsAuthorizedByOwner === true, 'DNS records must be authorized by the owner');
  add(contract?.dns?.recordsCreated === true, 'DNS records must match confirmed owner creation');
  add(contract?.dns?.publicReadbackVerified === true, 'public DNS readback must be verified');
  add(contract?.dns?.ttlSeconds === 3600, 'DNS TTL must match public readback');
  add(contract?.dns?.verifiedAt === '2026-07-16T17:09:40+02:00', 'DNS verification time is invalid');
  add(contract?.cutover?.authorized === false, 'production cutover is not authorized');
  add(contract?.cutover?.owner === 'T0205-or-separately-approved-production-issue', 'cutover owner is invalid');
  add(contract?.parkTestBaseline?.mustRemainUnchanged === true, 'park-test must remain unchanged');
  add(sameValues(contract?.parkTestBaseline?.allowedCorsOrigins, EXPECTED_PARK_TEST_ORIGINS), 'park-test baseline origins are invalid');

  return errors;
}

function expectInvalid(name, contract, expectedError) {
  const errors = validateContract(contract);
  assert.ok(errors.some((error) => error.includes(expectedError)), `${name} was not rejected as expected: ${errors.join('; ')}`);
}

function runNegativeCases(validContract) {
  let candidate = clone(validContract);
  candidate.surfaces.guest.origin = 'http://checkin.jumpyard.se';
  expectInvalid('HTTP origin', candidate, 'must use HTTPS');

  candidate = clone(validContract);
  candidate.surfaces.guest.hostname = 'checkin.jumpyard.com';
  candidate.surfaces.guest.origin = 'https://checkin.jumpyard.com';
  expectInvalid('wrong suffix', candidate, 'must use checkin.jumpyard.se');

  candidate = clone(validContract);
  candidate.surfaces.guest.origin = 'https://checkin.jumpyard.se/path';
  expectInvalid('path fragment', candidate, 'without path, query, hash');

  candidate = clone(validContract);
  candidate.surfaces.guest.origin = 'https://checkin.jumpyard.se?preview=true';
  expectInvalid('query fragment', candidate, 'without path, query, hash');

  candidate = clone(validContract);
  candidate.productionWebOrigins[1] = candidate.productionWebOrigins[0];
  expectInvalid('duplicate origin', candidate, 'exactly the approved guest and staff origins');

  candidate = clone(validContract);
  candidate.surfaces.guest.cloudflarePages.applicationDeployments = 1;
  expectInvalid('application deployment', candidate, 'must remain empty');

  candidate = clone(validContract);
  candidate.surfaces.guest.cloudflarePages.customDomainAssociation.present = false;
  expectInvalid('missing custom-domain association', candidate, 'association must exist');

  candidate = clone(validContract);
  candidate.surfaces.guest.dns.cnameTarget = 'jumpyard-check-in-park-test.pages.dev';
  expectInvalid('wrong CNAME target', candidate, 'cnameTarget is invalid');

  candidate = clone(validContract);
  candidate.surfaces.guest.hostname = 'jumpyard-check-in-park-test.pages.dev';
  candidate.surfaces.guest.origin = 'https://jumpyard-check-in-park-test.pages.dev';
  expectInvalid('park-test origin', candidate, 'must use checkin.jumpyard.se');

  candidate = clone(validContract);
  candidate.surfaces.api = { origin: 'https://api-checkin.jumpyard.se' };
  expectInvalid('extra API surface', candidate, 'exactly guest and staffAdmin');

  candidate = clone(validContract);
  candidate.api.customHostname = 'api-checkin.jumpyard.se';
  candidate.api.customHostnameApproved = true;
  expectInvalid('API hostname expansion', candidate, 'no API custom hostname is approved');
}

function validateParkTestBaseline(contract) {
  const parkTest = readJson('infra/config/park-test.json');
  assert.deepStrictEqual(parkTest.api.allowedCorsOrigins, EXPECTED_PARK_TEST_ORIGINS);
  assert.equal(parkTest.bookingTimeSms.checkinBaseUrl, `${EXPECTED_PARK_TEST_ORIGINS[0]}/`);
  assert.equal(parkTest.guestEmail.checkinBaseUrl, `${EXPECTED_PARK_TEST_ORIGINS[0]}/`);
  assert.deepStrictEqual(parkTest.staffIdentity.callbackUrls, [
    `${EXPECTED_PARK_TEST_ORIGINS[1]}/auth/callback`,
  ]);
  assert.deepStrictEqual(parkTest.staffIdentity.logoutUrls, [
    `${EXPECTED_PARK_TEST_ORIGINS[1]}/admin`,
  ]);
  assert.deepStrictEqual(contract.parkTestBaseline.allowedCorsOrigins, parkTest.api.allowedCorsOrigins);

  const contractText = fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8');
  const parkTestText = fs.readFileSync(path.join(root, 'infra/config/park-test.json'), 'utf8');
  for (const origin of EXPECTED_ORIGINS) {
    assert.ok(!parkTestText.includes(origin), `park-test config must not include production origin ${origin}`);
  }
  for (const blocked of ['nackaforum@jumpyard.se', 'api-checkin.jumpyard.se']) {
    assert.ok(!contractText.includes(blocked), `production domain contract must not expand into ${blocked}`);
  }
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const errors = validateContract(contract);
  assert.deepStrictEqual(errors, [], `production domain contract is invalid:\n- ${errors.join('\n- ')}`);
  runNegativeCases(contract);
  validateParkTestBaseline(contract);
  console.log('[pass] T0199 production web-domain contract, fail-closed negatives, and unchanged park-test baseline');
}

main();
