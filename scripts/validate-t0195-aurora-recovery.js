const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INFRA = path.join(ROOT, 'infra');
const TOOL = path.join(INFRA, 'scripts', 'aurora-recovery-rehearsal.ts');
const RUNBOOK = path.join(ROOT, 'docs', 't0195-aurora-recovery-rehearsal.md');
const TS_NODE = path.join(INFRA, 'node_modules', 'ts-node', 'dist', 'bin.js');
const CONFIG = path.join(INFRA, 'config', 'park-test.json');

function currentRunId() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z').toLowerCase();
  return `${timestamp}-a1b2c3`;
}

function runTool(args, env = {}) {
  return spawnSync(process.execPath, [TS_NODE, '--prefer-ts-exts', TOOL, ...args], {
    cwd: INFRA,
    encoding: 'utf8',
    env: {
      ...process.env,
      AWS_PROFILE: '',
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
      AWS_SESSION_TOKEN: '',
      T0195_EXTERNAL_WRITE_APPROVAL: '',
      T0195_AURORA_SNAPSHOT_APPROVAL: '',
      T0195_AURORA_RESTORE_APPROVAL: '',
      T0195_AURORA_CLEANUP_APPROVAL: '',
      T0195_AURORA_SNAPSHOT_DELETE_APPROVAL: '',
      ...env,
    },
  });
}

function expectFailure(result, pattern, label) {
  assert.notEqual(result.status, 0, `${label} unexpectedly succeeded.`);
  assert.match(`${result.stdout || ''}${result.stderr || ''}`, pattern, `${label} failed for the wrong reason.`);
}

assert.ok(fs.existsSync(TOOL), 'Missing guarded Aurora recovery rehearsal tool.');
assert.ok(fs.existsSync(RUNBOOK), 'Missing Aurora recovery rehearsal runbook.');

const source = fs.readFileSync(TOOL, 'utf8');
const runbook = fs.readFileSync(RUNBOOK, 'utf8');

for (const required of [
  '376129878018',
  'eu-north-1',
  'jumpyard-check-in-park-test',
  'WRLDS:DataClassification',
  'confidential',
  'WRLDS:Exportable',
  'WRLDS:CostCenter',
  'I_APPROVE_T0195_EXTERNAL_AWS_WRITE_CHECKPOINT',
  'I_APPROVE_PARK_TEST_PRECHANGE_SNAPSHOT',
  'I_APPROVE_ISOLATED_PARK_TEST_AURORA_RESTORE',
  'I_APPROVE_DELETING_ISOLATED_PARK_TEST_RESTORE',
  'I_APPROVE_DELETING_PARK_TEST_PRECHANGE_SNAPSHOT',
  '--no-publicly-accessible',
  'create-security-group',
  'IpPermissions',
  'trafficEligible: false',
  'lifecycle-apply',
  'aggregate_fingerprint',
  'schema_migrations',
  'jumpyard.data_lifecycle_runs',
  'affected_counts_digest',
  'cluster_arn AS "clusterArn"',
  'policy_definition_digest AS "policyDefinitionDigest"',
  'policyDefinitionDigest',
  'receiptDatabaseMatch',
]) {
  assert.ok(source.includes(required), `Recovery tool is missing required guard/evidence text: ${required}`);
}

assert.doesNotMatch(source, /authorize-security-group-ingress/);
assert.doesNotMatch(source, /modify-db-cluster\b/);
assert.doesNotMatch(source, /(?:lambda|apigateway|cloudformation)",\s*"(?:create|delete|update|modify)/i);
assert.match(source, /Recovery state must stay outside the repository/);
assert.match(source, /not a production RPO\/RTO commitment/);
assert.match(source, /noPiiTokensPinsOrSecretsPrinted: true/);
assert.match(source, /ORDER BY finished_at DESC, run_id DESC LIMIT 1/);
assert.match(source, /Lifecycle receipt does not match the latest completed database run/);
assert.match(source, /evidence\.clusterArn !== expectedClusterArn/);
assert.match(source, /receipt policy-definition digest/);
assert.match(source, /"policyDefinitionDigest",/);
assert.match(source, /lifecycle policy-definition receipt\/database mismatch/);
assert.match(
  source,
  /if \(writer\) \{[\s\S]*validateCleanupWriter\(config, args\.profile, state, writer\)[\s\S]*"delete-db-instance"/,
);
assert.match(
  source,
  /function validateCleanupWriter[\s\S]*const cluster = readCluster\(config, profile, state\.restoreClusterIdentifier\)[\s\S]*cluster\.arn !== expectedClusterArn/,
);
assert.match(
  source,
  /instance\.DBInstanceArn !== expectedWriterArn[\s\S]*instance\.DBClusterIdentifier !== names\.clusterIdentifier[\s\S]*instance\.Engine !== EXPECTED_ENGINE[\s\S]*instance\.PubliclyAccessible !== false/,
);
assert.match(source, /assertTags\(tags, temporaryTags\(state\.runId, "restore-rehearsal"\), "cleanup restore writer"\)/);
assert.match(
  source,
  /function assertCleanupClusterOwnership[\s\S]*cluster\.DBClusterArn !== expectedRestoreClusterArn[\s\S]*cluster\.Engine !== EXPECTED_ENGINE[\s\S]*cluster\.StorageEncrypted !== true[\s\S]*cluster\.DeletionProtection !== false/,
);
assert.match(
  source,
  /securityGroupIds\.length !== 1[\s\S]*memberIds\.some\(\(memberId\) => memberId !== names\.writerIdentifier\)/,
);
assert.match(source, /validateCleanupTargets\(config, args\.profile, state\)[\s\S]*"delete-db-cluster"/);
assert.doesNotMatch(source, /affected_counts::text/);
assert.doesNotMatch(source, /\b(?:eligible_counts|planned_counts|affected_counts)\b/);

const selfTest = runTool(['--self-test']);
assert.equal(selfTest.status, 0, `Recovery self-test failed.\n${selfTest.stdout}${selfTest.stderr}`);
const selfTestJson = JSON.parse(selfTest.stdout);
assert.equal(selfTestJson.localPlanNoAwsCalls, true);
assert.equal(selfTestJson.productionRejected, true);
assert.equal(selfTestJson.stateOutsideRepositoryChecked, true);
assert.equal(selfTestJson.aggregateOnlySqlChecked, true);
assert.equal(selfTestJson.lifecycleDatabaseCorroborationChecked, true);
assert.equal(selfTestJson.cleanupClusterOwnershipChecked, true);
assert.equal(selfTestJson.cleanupWriterOwnershipChecked, true);
assert.equal(selfTestJson.staleCleanupRunIdsAllowed, true);

const runId = currentRunId();
const emptyPathEnv = { PATH: '', Path: '' };
const plan = runTool(['--config', CONFIG, '--run-id', runId, '--json'], emptyPathEnv);
assert.equal(plan.status, 0, `Local recovery plan attempted an external command or failed.\n${plan.stdout}${plan.stderr}`);
const planJson = JSON.parse(plan.stdout);
assert.equal(planJson.mode, 'local-plan');
assert.equal(planJson.noAwsCallsMade, true);
assert.equal(planJson.noAwsWritesMade, true);
assert.equal(planJson.target.account, '376129878018');
assert.equal(planJson.target.region, 'eu-north-1');
assert.equal(planJson.target.environment, 'park-test');
assert.equal(planJson.target.tags['WRLDS:DataClassification'], 'confidential');
assert.equal(planJson.target.tags['WRLDS:TrafficEligible'], 'false');
assert.equal(planJson.isolation.applicationAttachmentAllowed, false);
assert.equal(planJson.isolation.publicInstanceAllowed, false);
assert.equal(planJson.isolation.inboundSecurityGroupRulesAllowed, 0);
assert.equal(planJson.isolation.productionAllowed, false);
assert.equal(planJson.lifecycleReapply.requiredBeforeTraffic, true);
assert.equal(planJson.lifecycleReapply.trafficEnableSupportedByThisTool, false);
assert.equal(planJson.lifecycleReapply.externalConfigContract.environmentTag, 'park-test-restore-rehearsal');
assert.match(planJson.lifecycleReapply.dryRunCommandTemplate, /--cluster-identifier jy-park-test-restore-.*-aurora/);
assert.match(
  planJson.lifecycleReapply.dryRunCommandTemplate,
  /--secret-id \/jumpyard-check-in-park-test\/aurora\/lifecycle/,
);
assert.doesNotMatch(planJson.lifecycleReapply.dryRunCommandTemplate, /aurora\/(?:admin|runtime)/);
assert.match(planJson.lifecycleReapply.secretRequirement, /handler and administrator secrets are forbidden/);
assert.match(planJson.lifecycleReapply.applyCommandTemplate, /--evidence-out <absolute-external-lifecycle-evidence\.json>/);
assert.equal(planJson.lifecycleReapply.receipt.policyVersion, 't0195-v1');
assert.equal(planJson.lifecycleReapply.receipt.affectedCountsDigest, 'sha256');
assert.equal(
  planJson.lifecycleReapply.receipt.clusterArn,
  `arn:aws:rds:eu-north-1:376129878018:cluster:${planJson.identifiers.clusterIdentifier}`,
);
assert.match(planJson.lifecycleReapply.receipt.policyDefinitionDigest, /lowercase sha256/);
assert.match(planJson.lifecycleReapply.verification, /latest completed jumpyard\.data_lifecycle_runs row/);
assert.match(planJson.identifiers.clusterIdentifier, /^jy-park-test-restore-/);
assert.match(planJson.identifiers.snapshotIdentifier, /^jy-park-test-prechange-/);
assert.notEqual(planJson.identifiers.clusterIdentifier, 'jumpyard-check-in-park-test-aurora');

expectFailure(
  runTool(['--action', 'snapshot', '--config', CONFIG, '--run-id', runId]),
  /plan-only unless --apply/,
  'Snapshot without --apply',
);
expectFailure(
  runTool(['--action', 'snapshot', '--apply', '--config', CONFIG, '--run-id', runId], emptyPathEnv),
  /T0195_EXTERNAL_WRITE_APPROVAL=I_APPROVE_T0195_EXTERNAL_AWS_WRITE_CHECKPOINT/,
  'Snapshot without external-write checkpoint',
);
expectFailure(
  runTool(
    ['--action', 'restore', '--apply', '--config', CONFIG, '--run-id', runId, '--state-file', path.join(os.tmpdir(), 't0195.json')],
    {
      ...emptyPathEnv,
      T0195_EXTERNAL_WRITE_APPROVAL: 'I_APPROVE_T0195_EXTERNAL_AWS_WRITE_CHECKPOINT',
    },
  ),
  /T0195_AURORA_RESTORE_APPROVAL=I_APPROVE_ISOLATED_PARK_TEST_AURORA_RESTORE/,
  'Restore without action-specific approval',
);

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpyard-t0195-recovery-'));
try {
  const unsafeConfig = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  unsafeConfig.tags['WRLDS:Environment'] = 'production';
  const unsafeConfigPath = path.join(temporaryDirectory, 'production.json');
  fs.writeFileSync(unsafeConfigPath, JSON.stringify(unsafeConfig));
  expectFailure(
    runTool(['--config', unsafeConfigPath, '--run-id', runId, '--json'], emptyPathEnv),
    /WRLDS:Environment must be park-test|Production tags are forbidden/,
    'Production-tagged plan',
  );
} finally {
  fs.rmSync(temporaryDirectory, { force: true, recursive: true });
}

for (const required of [
  'No AWS action in this runbook is approved by repository implementation alone.',
  'zero inbound rules',
  'never attached to the application',
  'aggregate-only',
  'lifecycle receipt',
  'latest completed `jumpyard.data_lifecycle_runs` row',
  'Handler runtime secrets and the Aurora administrator secret are forbidden',
  '`policyDefinitionDigest` must be a lowercase SHA-256 value and exactly match the database row',
  'receipt and database row match exactly',
  'not a production RPO or RTO',
  'explicit cleanup approval',
  'after migrations `0010`-`0012` and restricted-role password provisioning',
  'does not apply migrations or rebind database-role passwords',
  'separately reviewed and approved migration/credential-recovery procedure',
]) {
  assert.ok(runbook.includes(required), `Recovery runbook is missing: ${required}`);
}

console.log('[pass] T0195 recovery plan is local-only and exact-account/region/tag guarded');
console.log('[pass] snapshot, restore, cleanup, and snapshot deletion require two explicit approval locks');
console.log('[pass] restore names are unique, private, ingress-free, non-production, and never app-attached');
console.log('[pass] restore verification is migration-aware and emits aggregate-only counts/fingerprints');
console.log('[pass] lifecycle receipt must match the latest completed database run before rehearsal completion');
console.log('[pass] no production RPO/RTO is claimed');
