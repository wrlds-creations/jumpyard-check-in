const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expectIncludes(relativePath, source, ...needles) {
  for (const needle of needles) {
    assert.ok(source.includes(needle), `${relativePath} must include ${needle}`);
  }
}

function expectExcludes(relativePath, source, ...needles) {
  for (const needle of needles) {
    assert.ok(!source.includes(needle), `${relativePath} must not include ${needle}`);
  }
}

function validateWorkflow(relativePath, required) {
  const source = read(relativePath);
  expectIncludes(relativePath, source, ...required);
  expectExcludes(
    relativePath,
    source,
    'aws-access-key-id',
    'aws-secret-access-key',
    'wrlds-dev',
    'environment: production',
    'project-name jumpyard-check-in.pages',
  );
  for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
    const action = match[1];
    assert.match(action, /@[0-9a-f]{40}$/, `${relativePath} action must be pinned to a full commit: ${action}`);
  }
  return source;
}

function testTemplateComparison() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 't0198-plan-'));
  try {
    const currentPath = path.join(temporaryRoot, 'current.json');
    const releasePath = path.join(temporaryRoot, 'release.json');
    const outputPath = path.join(temporaryRoot, 'plan.json');
    fs.writeFileSync(
      currentPath,
      JSON.stringify({ Resources: { Stable: { Type: 'AWS::S3::Bucket', Properties: { Versioning: false } } } }),
    );
    fs.writeFileSync(
      releasePath,
      JSON.stringify({
        Resources: {
          Added: { Type: 'AWS::SQS::Queue' },
          Stable: { Type: 'AWS::S3::Bucket', Properties: { Versioning: true } },
        },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, 'scripts', 'compare-cloudformation-templates.js'),
        '--current',
        currentPath,
        '--release',
        releasePath,
        '--output',
        outputPath,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.deepEqual(plan.resources.added, ['Added']);
    assert.deepEqual(plan.resources.changed, ['Stable']);
    assert.deepEqual(plan.resources.removed, []);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function main() {
  const ci = validateWorkflow('.github/workflows/ci.yml', [
    'name: Repository',
    'name: Infrastructure',
    'name: Phone',
    'name: Admin',
    'npm run validate',
    'npm run infra:check',
    'synth:github-deployment-access',
    'synth:park-test-full-flow-rehearsal',
  ]);
  const release = validateWorkflow('.github/workflows/release.yml', [
    'Build Park pilot release',
    'refs/heads/main',
    'merge-base --is-ancestor',
    'build-park-test-release.js',
    'validate-park-test-release.js',
    'include-hidden-files: true',
    'retention-days: 90',
    'park-test-release-',
  ]);
  const deploy = validateWorkflow('.github/workflows/deploy-park-test.yml', [
    'Plan selected release',
    'Approved park-test deployment',
    'environment:',
    'name: park-test',
    'I_APPROVE_PARK_TEST_',
    'jumpyard-check-in-park-test-github-actions-plan',
    'jumpyard-check-in-park-test-github-actions-deploy',
    'secrets.CLOUDFLARE_API_TOKEN',
    'apply_migrations',
    'detect-stack-drift',
    'deployment_trigger.metadata.commit_hash',
    'deployments?env=production&per_page=1',
    'validate-park-test-release.js',
    'compare-cloudformation-templates.js',
    'verify-public-park-test.js',
    '--commit-hash',
    'jumpyard-check-in-park-test',
    'jumpyard-checkin-admin-park-test',
    '.result.source == null',
  ]);
  assert.match(ci, /pull_request:/);
  assert.match(release, /workflow_dispatch:/);
  assert.match(deploy, /workflow_dispatch:/);
  assert.doesNotMatch(deploy, /source\.config\.commit_hash/);

  const accessStack = read('infra/lib/github-deployment-access-stack.ts');
  expectIncludes(
    'infra/lib/github-deployment-access-stack.ts',
    accessStack,
    'repo:${REPOSITORY}:ref:refs/heads/main',
    'repo:${REPOSITORY}:environment:park-test',
    'cloudformation:DetectStackResourceDrift',
    'cloudformation:GetTemplate',
    'sts:AssumeRole',
    'rds-data:ExecuteStatement',
    'WRLDS:DataClassification',
    "'confidential'",
  );
  expectExcludes('infra/lib/github-deployment-access-stack.ts', accessStack, 'PowerUserAccess', 'AdministratorAccess');

  const infraPackage = JSON.parse(read('infra/package.json'));
  assert.ok(infraPackage.scripts['synth:github-deployment-access']);
  assert.ok(infraPackage.scripts['deploy:github-deployment-access']);

  const config = JSON.parse(read('infra/config/park-test-full-flow-rehearsal.json'));
  assert.equal(config.awsAccount, '376129878018');
  assert.equal(config.awsRegion, 'eu-north-1');
  assert.equal(config.safetyGates.emergencyStop, false);
  assert.equal(config.safetyGates.guestMessagingSendsEnabled, false);
  assert.equal(config.safetyGates.rollerBookingDraftWritesEnabled, true);
  assert.equal(config.safetyGates.rollerRedeemWritesEnabled, true);
  assert.equal(config.safetyGates.rollerWebhookProcessingEnabled, true);
  assert.equal(config.safetyGates.staffAuthEnabled, true);
  assert.equal(config.safetyGates.fullFlowRehearsalVenueId, '50871');
  assert.equal(config.safetyGates.fullFlowRehearsalAllowedOperatingDates.at(-1), '2026-09-30');

  for (const relativePath of [
    'AGENTS.md',
    'README.md',
    'PROJECT_CONTEXT.md',
    'OPERATIONS_RUNBOOK.md',
    'jumpyard-checkin-phone/README.md',
    'jumpyard-checkin-admin/README.md',
  ]) {
    const source = read(relativePath);
    expectIncludes(relativePath, source, 'GitHub', 'park-test');
  }
  for (const relativePath of [
    'references/aws-cicd-standard.md',
    'references/github-collaboration-workflow.md',
    'skills/github-collaboration/SKILL.md',
  ]) {
    expectIncludes(relativePath, read(relativePath), 'GitHub', 'immutable');
  }

  testTemplateComparison();
  console.log('[pass] T0198 GitHub-native CI/CD, OIDC, immutable release, target guard, and rollback contracts');
}

main();
