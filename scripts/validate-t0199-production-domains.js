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
  'https://checkin.jumpyard.se',
  'https://staff-checkin.jumpyard.se',
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

  add(contract?.schemaVersion === 3, 'schemaVersion must be 3');
  add(contract?.contract === 'jumpyard-check-in-production-web-domains', 'contract name is invalid');
  add(contract?.environment === 'nacka-pilot-production', 'environment must be Nacka pilot production');
  add(contract?.technicalBackendEnvironment === 'park-test', 'technical backend environment must remain park-test');
  add(
    contract?.state === 'pilot-production-approved-guest-live-staff-pending-protected-rollout',
    'state must record the approved pilot-production rollout posture',
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
    if (key === 'guest') {
      add(pages?.applicationDeployments === 2, 'surfaces.guest.cloudflarePages must record the initial protected deployment and re-promotion');
      add(
        pages?.status === 'pilot-production-guest-active',
        'surfaces.guest.cloudflarePages.status must record the active pilot-production guest origin',
      );
      add(
        pages?.deploymentPolicy === 'selected-immutable-park-pilot-artifact-only',
        'surfaces.guest.cloudflarePages.deploymentPolicy is invalid',
      );
    } else {
      add(pages?.applicationDeployments === 0, `surfaces.${key}.cloudflarePages must remain empty`);
      add(
        pages?.status === 'pilot-production-approved-pending-deployment',
        `surfaces.${key}.cloudflarePages.status must record the pending protected deployment`,
      );
      add(
        pages?.deploymentPolicy === 'selected-immutable-park-pilot-artifact-only',
        `surfaces.${key}.cloudflarePages.deploymentPolicy is invalid`,
      );
    }
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
  add(
    contract?.api?.browserBaseUrl === 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com',
    'pilot-production API base URL must be the existing Park API',
  );
  add(
    contract?.api?.browserBaseUrlSource === 'existing-park-backend-approved-as-nacka-pilot-production-by-issue-264',
    'pilot-production API base URL source is invalid',
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
  add(contract?.cutover?.authorized === true, 'Nacka pilot-production cutover must be authorized');
  add(contract?.cutover?.owner === 'issue-264', 'cutover owner is invalid');
  add(contract?.pilotProduction?.approved === true, 'pilot production must be approved');
  add(contract?.pilotProduction?.approvedByIssue === 264, 'pilot production issue owner is invalid');
  add(contract?.pilotProduction?.technicalEnvironment === 'park-test', 'pilot technical environment is invalid');
  add(contract?.pilotProduction?.createsNewBackend === false, 'pilot production must not create a new backend');
  add(contract?.pilotProduction?.renamesExistingResources === false, 'pilot production must not rename resources');
  add(
    sameValues(contract?.pilotProduction?.publicOrigins, EXPECTED_ORIGINS),
    'pilot production origins must match the approved public origins',
  );
  add(contract?.parkTestBaseline?.mustRemainUnchanged === false, 'park-test must record the approved CORS-only change');
  add(
    contract?.parkTestBaseline?.approvedChange === 'nacka-pilot-production-public-origins-and-staff-cognito',
    'park-test approved change is invalid',
  );
  add(sameValues(contract?.parkTestBaseline?.allowedCorsOrigins, EXPECTED_PARK_TEST_ORIGINS), 'park-test baseline origins are invalid');

  const alias = contract?.controlledParkTestAlias;
  add(alias?.approved === true, 'controlled alias must be approved');
  add(alias?.approvedByIssue === 220, 'controlled alias must be owned by issue 220');
  add(alias?.deployed === true, 'controlled alias must record the protected deployment evidence');
  add(alias?.guestOrigin === EXPECTED_ORIGINS[0], 'controlled alias guest origin is invalid');
  add(alias?.cloudflareProject === 'jumpyard-check-in-production', 'controlled alias Cloudflare project is invalid');
  add(
    alias?.sourceArtifact === 'selected-successful-immutable-park-test-release-phone-output',
    'controlled alias source artifact is invalid',
  );
  add(alias?.apiOrigin === 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com', 'controlled alias API target is invalid');
  add(alias?.rollerEnvironment === 'live', 'controlled alias Roller environment is invalid');
  add(alias?.rollerVenueId === '50871', 'controlled alias venue is invalid');
  add(alias?.protectedEnvironment === 'park-test', 'controlled alias protected environment is invalid');
  add(alias?.productionCutover === false, 'controlled alias must not authorize production cutover');
  add(alias?.staffAdminDeployment === false, 'controlled alias must not deploy staff/admin');
  add(alias?.guestMessagingOpened === false, 'controlled alias must not open guest messaging');
  add(
    alias?.messageLinkOrigin === 'https://jumpyard-check-in-park-test.pages.dev/',
    'controlled alias must not change message links',
  );
  add(alias?.manualApplePayPaymentOwner === 'Love', 'manual Apple Pay payment owner is invalid');
  add(alias?.manualApplePayStatus === 'passed', 'manual Apple Pay result must record Love\'s successful test');
  add(alias?.manualApplePayVerifiedAt === '2026-08-17', 'manual Apple Pay verification date is invalid');
  add(
    alias?.manualApplePayResult === 'payment-options-loaded-and-apple-pay-payment-succeeded',
    'manual Apple Pay result detail is invalid',
  );
  add(
    alias?.manualApplePayEvidenceSource === 'Love manual iPhone test report',
    'manual Apple Pay evidence source is invalid',
  );
  add(alias?.awsCorsReleaseRunId === 30832695522, 'controlled alias AWS CORS release run is invalid');
  add(alias?.awsCorsDeploymentRunId === 30833080999, 'controlled alias AWS CORS deployment run is invalid');
  add(alias?.initialDomainDeploymentRunId === 30833724481, 'controlled alias initial domain run is invalid');
  add(alias?.selectedReleaseSha === '9ffe379e6deb13da509114e70665b56bcaeb471a', 'controlled alias selected release SHA is invalid');
  add(alias?.selectedReleaseRunId === 30834669772, 'controlled alias selected release run is invalid');
  add(alias?.successfulDomainRepromotionRunId === 30835107405, 'controlled alias successful re-promotion run is invalid');
  add(alias?.publicVerification?.rootHttpStatus === 200, 'controlled alias root verification is invalid');
  add(alias?.publicVerification?.appleAssociationHttpStatus === 200, 'controlled alias Apple association HTTP result is invalid');
  add(alias?.publicVerification?.approvedCorsOrigins === 4, 'controlled alias approved CORS count is invalid');
  add(alias?.publicVerification?.unapprovedOriginBlocked === true, 'controlled alias unapproved origin must remain blocked');

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
  candidate.surfaces.guest.cloudflarePages.applicationDeployments = 0;
  expectInvalid('application deployment evidence', candidate, 'must record the initial protected deployment and re-promotion');

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
    `${EXPECTED_ORIGINS[1]}/auth/callback`,
  ]);
  assert.deepStrictEqual(parkTest.staffIdentity.logoutUrls, [
    `${EXPECTED_PARK_TEST_ORIGINS[1]}/admin`,
    `${EXPECTED_ORIGINS[1]}/admin`,
  ]);
  assert.deepStrictEqual(contract.parkTestBaseline.allowedCorsOrigins, parkTest.api.allowedCorsOrigins);

  const contractText = fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8');
  const parkTestText = fs.readFileSync(path.join(root, 'infra/config/park-test.json'), 'utf8');
  assert.ok(parkTestText.includes(EXPECTED_ORIGINS[0]), 'park-test config must include the approved controlled guest origin');
  assert.ok(parkTestText.includes(EXPECTED_ORIGINS[1]), 'park-test config must include the approved staff/admin origin');
  for (const blocked of ['api-checkin.jumpyard.se']) {
    assert.ok(!contractText.includes(blocked), `production domain contract must not expand into ${blocked}`);
  }

  assert.equal(
    parkTest.guestEmail.fromAddress,
    'nackaforum@jumpyard.se',
    'T0200 owns the approved park-test sender without changing the T0199 production web-domain contract',
  );
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const errors = validateContract(contract);
  assert.deepStrictEqual(errors, [], `production domain contract is invalid:\n- ${errors.join('\n- ')}`);
  runNegativeCases(contract);
  validateParkTestBaseline(contract);
  console.log('[pass] T0199 domains plus issue #264 Nacka pilot-production decision and issue #220 evidence');
}

main();
