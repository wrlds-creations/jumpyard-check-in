const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const CHECKIN_ORIGIN = 'https://checkin.jumpyard.se';
const MESSAGE_ORIGIN = 'https://jumpyard-check-in-park-test.pages.dev/';
const EXPECTED_ORIGINS = [
  'https://jumpyard-check-in-park-test.pages.dev',
  'https://jumpyard-checkin-admin-park-test.pages.dev',
  'https://jumpyard-check-in-kiosk.pages.dev',
  CHECKIN_ORIGIN,
];
const EXPECTED_ASSOCIATION_SHA256 = '8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6';

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');
}

function validateParkTestProfiles() {
  const configRoot = path.join(root, 'infra', 'config');
  const profiles = fs.readdirSync(configRoot).filter((name) => /^park-test.*\.json$/.test(name)).sort();
  assert.ok(profiles.length >= 10, 'all established park-test profiles must be validated');
  for (const name of profiles) {
    const relativePath = `infra/config/${name}`;
    const config = readJson(relativePath);
    assert.deepStrictEqual(config.api?.allowedCorsOrigins, EXPECTED_ORIGINS, `${relativePath} CORS origins`);
    assert.equal(config.bookingTimeSms?.checkinBaseUrl, MESSAGE_ORIGIN, `${relativePath} scheduled-message link origin`);
    assert.equal(config.guestEmail?.checkinBaseUrl, MESSAGE_ORIGIN, `${relativePath} email link origin`);
    assert.equal(config.safetyGates?.guestMessagingSendsEnabled, false, `${relativePath} general guest messaging gate`);
    assert.equal(config.tags?.['WRLDS:Environment'], 'park-test', `${relativePath} environment tag`);
  }
}

function validateDomainContract() {
  const contract = readJson('config/production-domains.json');
  const alias = contract.controlledParkTestAlias;
  assert.equal(contract.schemaVersion, 2);
  assert.equal(contract.state, 'guest-controlled-park-test-alias-approved-awaiting-deployment');
  assert.equal(alias.approved, true);
  assert.equal(alias.approvedByIssue, 220);
  assert.equal(alias.deployed, false);
  assert.equal(alias.guestOrigin, CHECKIN_ORIGIN);
  assert.equal(alias.cloudflareProject, 'jumpyard-check-in-production');
  assert.equal(alias.apiOrigin, 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com');
  assert.equal(alias.rollerEnvironment, 'live');
  assert.equal(alias.rollerVenueId, '50871');
  assert.equal(alias.productionCutover, false);
  assert.equal(alias.staffAdminDeployment, false);
  assert.equal(alias.guestMessagingOpened, false);
  assert.equal(alias.messageLinkOrigin, MESSAGE_ORIGIN);
  assert.equal(contract.cutover.authorized, false);
  assert.deepStrictEqual(contract.parkTestBaseline.allowedCorsOrigins, EXPECTED_ORIGINS);
  assert.equal(contract.surfaces.staffAdmin.cloudflarePages.applicationDeployments, 0);
  assert.equal(contract.surfaces.staffAdmin.cloudflarePages.status, 'created-empty');
}

function validateWorkflow() {
  const relativePath = '.github/workflows/deploy-checkin-domain-test.yml';
  const source = read(relativePath);
  for (const required of [
    'workflow_dispatch:',
    'I_APPROVE_CHECKIN_DOMAIN_TEST_',
    'name: park-test',
    'url: https://checkin.jumpyard.se',
    'CLOUDFLARE_PROJECT: jumpyard-check-in-production',
    'validate-park-test-release.js',
    'validate-checkin-domain-release.js',
    'verify-public-checkin-domain.js',
    'release/phone/out',
    '--commit-hash',
    'deployment_trigger.metadata.commit_hash',
    'Require live park-test CORS before publishing the alias',
    'https://unapproved.example',
  ]) {
    assert.ok(source.includes(required), `${relativePath} must include ${required}`);
  }
  for (const blocked of [
    'environment: production',
    'aws-access-key-id',
    'aws-secret-access-key',
    'configure-aws-credentials',
    'release/admin/out',
    'jumpyard-checkin-admin-production',
  ]) {
    assert.ok(!source.includes(blocked), `${relativePath} must not include ${blocked}`);
  }
  for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
    assert.match(match[1], /@[0-9a-f]{40}$/, `${relativePath} action must be pinned to a full commit: ${match[1]}`);
  }
}

function validateAppleAssociation() {
  const relativePath = 'jumpyard-checkin-phone/public/.well-known/apple-developer-merchantid-domain-association';
  assert.equal(sha256(relativePath), EXPECTED_ASSOCIATION_SHA256, 'Apple Pay association file must remain byte-identical');
  const releaseValidator = read('scripts/validate-checkin-domain-release.js');
  const publicVerifier = read('scripts/verify-public-checkin-domain.js');
  for (const source of [releaseValidator, publicVerifier]) {
    assert.ok(source.includes(EXPECTED_ASSOCIATION_SHA256));
    assert.ok(source.includes('checkin.jumpyard.se'));
  }
}

function main() {
  validateParkTestProfiles();
  validateDomainContract();
  validateWorkflow();
  validateAppleAssociation();
  console.log('[pass] T0202 controlled checkin.jumpyard.se park-test alias, immutable deployment, CORS, and Apple Pay guards');
}

main();
