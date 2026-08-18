const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PARK_API = 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com';
const PUBLIC_PHONE = 'https://checkin.jumpyard.se';
const PUBLIC_ADMIN = 'https://staff-checkin.jumpyard.se';
const PARK_ORIGINS = [
  'https://jumpyard-check-in-park-test.pages.dev',
  'https://jumpyard-checkin-admin-park-test.pages.dev',
  'https://jumpyard-check-in-kiosk.pages.dev',
  PUBLIC_PHONE,
  PUBLIC_ADMIN,
];
const CALLBACKS = [
  'https://jumpyard-checkin-admin-park-test.pages.dev/auth/callback',
  `${PUBLIC_ADMIN}/auth/callback`,
];
const LOGOUTS = [
  'https://jumpyard-checkin-admin-park-test.pages.dev/admin',
  `${PUBLIC_ADMIN}/admin`,
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function requireText(relativePath, ...values) {
  const source = read(relativePath);
  for (const value of values) assert.ok(source.includes(value), `${relativePath} must include ${value}`);
  return source;
}

function validateProfiles() {
  const configRoot = path.join(ROOT, 'infra', 'config');
  const profiles = fs.readdirSync(configRoot).filter((name) => /^park-test.*\.json$/.test(name)).sort();
  assert.ok(profiles.length >= 10, 'all established Park profiles must be checked');
  for (const name of profiles) {
    const config = readJson(`infra/config/${name}`);
    assert.deepEqual(config.api.allowedCorsOrigins, PARK_ORIGINS, `${name} CORS origins`);
    assert.deepEqual(config.staffIdentity.callbackUrls, CALLBACKS, `${name} callbacks`);
    assert.deepEqual(config.staffIdentity.logoutUrls, LOGOUTS, `${name} logout URLs`);
    assert.equal(config.awsAccount, '376129878018');
    assert.equal(config.awsRegion, 'eu-north-1');
    assert.equal(config.resourcePrefix, 'jumpyard-check-in-park-test');
    assert.equal(config.tags['WRLDS:Environment'], 'park-test');
    assert.equal(config.roller.environment, 'live');
  }
}

function validateDomainContract() {
  const contract = readJson('config/production-domains.json');
  assert.equal(contract.schemaVersion, 3);
  assert.equal(contract.environment, 'nacka-pilot-production');
  assert.equal(contract.technicalBackendEnvironment, 'park-test');
  assert.equal(contract.api.browserBaseUrl, PARK_API);
  assert.equal(contract.cutover.authorized, true);
  assert.equal(contract.cutover.owner, 'issue-264');
  assert.equal(contract.pilotProduction.approved, true);
  assert.equal(contract.pilotProduction.approvedByIssue, 264);
  assert.equal(contract.pilotProduction.createsNewBackend, false);
  assert.equal(contract.pilotProduction.renamesExistingResources, false);
  assert.equal(contract.pilotProduction.futureMultiParkArchitectureDeferred, true);
  assert.deepEqual(contract.pilotProduction.publicOrigins, [PUBLIC_PHONE, PUBLIC_ADMIN]);
  assert.deepEqual(contract.parkTestBaseline.allowedCorsOrigins, PARK_ORIGINS);
  assert.equal(contract.controlledParkTestAlias.approvedByIssue, 220, 'issue #220 evidence must remain historical');
}

function validateWorkflows() {
  const release = requireText(
    '.github/workflows/release.yml',
    'name: Build Park pilot release',
    'Backend target: technically named',
    'Frontend targets: Park-test verification first',
  );
  assert.ok(!release.includes('Target: park-test only'));

  const park = requireText(
    '.github/workflows/deploy-park-test.yml',
    'environment:',
    'name: park-test',
    '.result.source == null',
    'jumpyard-check-in-park-test',
    'jumpyard-checkin-admin-park-test',
  );
  assert.ok(!park.includes('environment: production'));

  const publicPromotion = requireText(
    '.github/workflows/deploy-checkin-domain-test.yml',
    'name: Deploy or roll back Nacka pilot public frontends',
    'I_APPROVE_NACKA_PILOT_PRODUCTION_',
    'PHONE_PROJECT: jumpyard-check-in-production',
    'ADMIN_PROJECT: jumpyard-checkin-admin-production',
    'release/phone/out',
    'release/admin/out',
    '.result.source == null',
    'probe_cors "$STAFF_ORIGIN"',
    'probe_callback "https://staff-checkin.jumpyard.se/auth/callback"',
    'verify-public-checkin-domain.js',
  );
  assert.ok(!publicPromotion.includes('configure-aws-credentials'));
  assert.ok(!publicPromotion.includes('aws-access-key-id'));
  assert.ok(!publicPromotion.includes('aws-secret-access-key'));
}

function validateDurableDecision() {
  requireText(
    'DECISIONS.md',
    '`D0189`',
    'sharp pilot-production backend for the single-park Nacka pilot',
    'This supersedes D0149/D0150',
  );
  requireText(
    'PROJECT_CONTEXT.md',
    'technical `park-test` is Nacka pilot production',
    'Merges to `main` build one immutable Park artifact but deploy nothing',
  );
  requireText(
    'docs/gh-264-nacka-pilot-production.md',
    'No second AWS backend is created',
    'A merge therefore builds a candidate automatically but does not publish it',
    'jumpyard-check-in-production',
    'jumpyard-checkin-admin-production',
  );
  requireText('AWS_RESOURCES.md', 'Issue #264 Nacka Pilot-Production Role');
}

function main() {
  validateProfiles();
  validateDomainContract();
  validateWorkflows();
  validateDurableDecision();
  console.log('[pass] issue #264 Nacka pilot-production role, protected release path, and no-new-backend boundary');
}

main();
