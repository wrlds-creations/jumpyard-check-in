const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INFRA = path.join(ROOT, 'infra');
const migration = fs.readFileSync(
  path.join(INFRA, 'migrations', '0012_staff_pin_pepper_version.sql'),
  'utf8',
);
const session = fs.readFileSync(path.join(INFRA, 'lambda', 'session', 'index.js'), 'utf8');
const cli = fs.readFileSync(path.join(INFRA, 'scripts', 'rotate-staff-pin-pepper.ts'), 'utf8');

function validateMigration() {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS pin_pepper_version integer/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS pin_reenrollment_required_at timestamptz/);
  assert.match(migration, /SET pin_pepper_version = 1[\s\S]*identity_provider = 'local_pin'/);
  assert.match(
    migration,
    /pin_pepper_version IS NOT NULL[\s\S]*pin_pepper_version > 0[\s\S]*pin_reenrollment_required_at IS NULL/,
  );
  assert.match(
    migration,
    /pin_lookup_hash IS NULL[\s\S]*pin_verifier IS NULL[\s\S]*pin_changed_at IS NULL[\s\S]*pin_pepper_version > 0[\s\S]*pin_reenrollment_required_at IS NOT NULL/,
  );
  assert.match(
    migration,
    /identity_provider = 'cognito'[\s\S]*pin_pepper_version IS NULL[\s\S]*pin_reenrollment_required_at IS NULL[\s\S]*role = 'staff_admin'/,
  );
  assert.match(migration, /OLD\.pin_pepper_version IS DISTINCT FROM NEW\.pin_pepper_version/);
  assert.match(
    migration,
    /OLD\.pin_reenrollment_required_at IS DISTINCT FROM NEW\.pin_reenrollment_required_at/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OF[\s\S]*pin_pepper_version,[\s\S]*pin_reenrollment_required_at/,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS jumpyard\.staff_pin_pepper_state[\s\S]*environment text PRIMARY KEY[\s\S]*current_version integer NOT NULL/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[^;]*staff_pin_pepper_state[^;]*jumpyard_session_runtime/i,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION jumpyard\.enforce_staff_pin_pepper_version\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, jumpyard[\s\S]*NEW\.pin_lookup_hash IS NOT NULL[\s\S]*FOR SHARE[\s\S]*NEW\.pin_pepper_version IS DISTINCT FROM database_version[\s\S]*staff_pin_pepper_version_stale/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION jumpyard\.enforce_staff_pin_pepper_version\(\) FROM PUBLIC/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER staff_identities_enforce_pin_pepper_version_trigger[\s\S]*BEFORE INSERT OR UPDATE OF[\s\S]*pin_pepper_version[\s\S]*EXECUTE FUNCTION jumpyard\.enforce_staff_pin_pepper_version\(\)/,
  );
  assert.doesNotMatch(migration, /\bpin\s+(?:text|varchar|char)\b/i);
}

function validateRuntimeContract() {
  assert.match(session, /const STAFF_AUTH_CONFIG_CACHE_MS = 30 \* 1000/);
  assert.match(session, /const CHECKIN_LINK_DEV_TOKEN_CACHE_MS = 60 \* 1000/);
  assert.match(
    session,
    /cachedCheckinLinkDevTokenExpiresAt > now[\s\S]*cachedCheckinLinkDevTokenExpiresAt = now \+ CHECKIN_LINK_DEV_TOKEN_CACHE_MS/,
  );
  assert.match(session, /VersionStage: 'AWSCURRENT'/);
  assert.match(session, /JSON\.parse\(secretString\)\.purpose/);
  assert.match(session, /JSON\.parse\(secretString\)\.version/);
  assert.match(session, /purpose !== 'staff-pin-pepper'/);
  assert.match(session, /cachedStaffPinPepper = \{ value: pepper, version \}/);
  assert.match(
    session,
    /pin_pepper_version = CAST\(:pinPepperVersion AS integer\)[\s\S]*pin_reenrollment_required_at IS NULL/,
  );
  assert.match(
    session,
    /pin_lookup_hash = :pinLookupHash[\s\S]*pin_verifier = :pinVerifier[\s\S]*pin_pepper_version = CAST\(:pinPepperVersion AS integer\)[\s\S]*FOR UPDATE/,
  );
  assert.match(
    session,
    /pin_pepper_version, pin_reenrollment_required_at[\s\S]*CAST\(:pinPepperVersion AS integer\), NULL/,
  );
  assert.match(
    session,
    /pin_pepper_version = CAST\(:pinPepperVersion AS integer\), pin_reenrollment_required_at = NULL/,
  );
  assert.ok(
    (session.match(/forceRefresh: true/g) ?? []).length >= 2,
    'Administrator create/reset must bypass a stale pepper cache after promotion.',
  );
  assert.match(
    session,
    /staff_pin_pepper_version_stale[\s\S]*stale\.code = 'staff_pin_rotation_retry'/,
  );
  assert.match(
    session,
    /error\.code === 'staff_pin_rotation_retry'[\s\S]*statusCode: 409[\s\S]*code: 'staff_pin_rotation_retry'/,
  );
  assert.match(session, /code: 'staff_pin_reenrollment_required'/);
  assert.match(session, /if \(!pin \|\| !\/\^\\d\{6\}\$\/.test\(pin\)\)/);
  assert.doesNotMatch(session, /staff.*(?:email|password).*login/i);
}

function validateGuardedCliSource() {
  const requireStart = cli.indexOf('async function requireReenrollment');
  const promoteStart = cli.indexOf('async function promotePending');
  const fenceStart = cli.indexOf('async function ensureDatabasePepperFence');
  const removePendingStart = cli.indexOf('async function removePendingStage');
  assert.ok(requireStart >= 0 && promoteStart > requireStart && fenceStart > promoteStart);
  const requireSource = cli.slice(requireStart, promoteStart);
  const promoteSource = cli.slice(promoteStart, fenceStart);
  const fenceSource = cli.slice(fenceStart, removePendingStart);

  assert.match(cli, /const APPLY_CONFIRMATION = "I_APPROVE_T0195_PIN_PEPPER_ROTATION_AND_STAFF_REENROLLMENT"/);
  assert.match(cli, /policy: "security-driven-only"/);
  assert.match(cli, /RotationEnabled === true/);
  assert.match(
    cli,
    /const EXPECTED_CLUSTER_ARN =[^;]+EXPECTED_RESOURCE_PREFIX}-aurora`/s,
  );
  assert.match(cli, /if \(clusterArn !== EXPECTED_CLUSTER_ARN\)/);
  assert.match(cli, /assertExpectedClusterArn\(clusterArn\)/);
  assert.match(cli, /VersionStages: \["AWSPENDING"\]/);
  assert.match(cli, /VersionStage: "AWSCURRENT"/);
  assert.match(cli, /MoveToVersionId: pendingId/);
  assert.match(cli, /RemoveFromVersionId: currentId/);
  assert.match(
    requireSource,
    /requireReenrollment[\s\S]*Rotation database transaction start[\s\S]*promotionLockSql\(\)[\s\S]*loadDatabasePepperVersion\(runtime, transactionId\)[\s\S]*loadRotationState\(runtime, current\.version, transactionId\)[\s\S]*locked local identity count exceeds --max-identities/,
  );
  assert.match(
    requireSource,
    /affectedLocalIdentities !== before\.enrolledCurrent[\s\S]*affectedLocalIdentities > args\.maxIdentities/,
  );
  assert.match(
    promoteSource,
    /ensureDatabasePepperFence\(runtime, current\.version, nextVersion\)[\s\S]*AWSPENDING promotion/,
  );
  assert.match(
    fenceSource,
    /Promotion database transaction start[\s\S]*promotionLockSql\(\)[\s\S]*loadPromotionReadiness\(runtime, transactionId\)[\s\S]*loadDatabasePepperVersion\(runtime, transactionId\)[\s\S]*advanceDatabasePepperFenceSql\(\)[\s\S]*Promotion database transaction commit/,
  );
  assert.match(
    cli,
    /LOCK TABLE jumpyard\.staff_pin_pepper_state, jumpyard\.staff_identities, jumpyard\.staff_auth_sessions[\s\S]*SHARE ROW EXCLUSIVE MODE NOWAIT/,
  );
  assert.match(cli, /identity_provider = 'local_pin'/);
  assert.match(cli, /pin_lookup_hash = NULL/);
  assert.match(cli, /pin_verifier = NULL/);
  assert.match(cli, /pin_reenrollment_required_at = COALESCE/);
  assert.match(cli, /UPDATE jumpyard\.staff_auth_sessions[\s\S]*WHERE environment = :environment/);
  assert.match(cli, /revoke_reason = COALESCE\(revoke_reason, 'pin_pepper_rotation'\)/);
  assert.match(cli, /staff\.pin_pepper_reenrollment_required/);
  assert.match(cli, /containsPinOrSecretMaterial: false/);
  assert.match(cli, /if \(!args\.apply \|\| args\.command === "plan"\)/);
  assert.match(cli, /--max-identities/);
  assert.doesNotMatch(cli, /console\.(?:log|error)\([^\n]*(?:pinPepper|SecretString)/);
}

function runCli(args) {
  const tsNodeBin = path.join(INFRA, 'node_modules', 'ts-node', 'dist', 'bin.js');
  const result = spawnSync(
    process.execPath,
    [tsNodeBin, '--prefer-ts-exts', 'scripts/rotate-staff-pin-pepper.ts', ...args],
    { cwd: INFRA, encoding: 'utf8', env: { ...process.env, AWS_PROFILE: '' } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function validateNoAwsSelfTests() {
  const selfTestOutput = runCli(['--self-test']);
  assert.match(selfTestOutput, /self-test passed \(no AWS calls\)/);

  const planOutput = runCli(['plan', '--config', './config/park-test.json']);
  const plan = JSON.parse(planOutput.split(/\r?\n/).at(-1));
  assert.equal(plan.mode, 'local-plan');
  assert.equal(plan.awsCalls, false);
  assert.equal(plan.externalWriteCheckpointRequired, true);
  assert.equal(plan.policy, 'security-driven-only');
  assert.deepEqual(plan.sequence, [
    'stage-new-contract-as-AWSPENDING',
    'clear-local-PIN-material-and-revoke-all-staff-sessions-in-one-database-transaction',
    'advance-database-version-fence-then-promote-AWSPENDING-to-AWSCURRENT',
    'wait-31-seconds-before-admin-reenrollment',
  ]);

  const exactConfirmation = 'I_APPROVE_T0195_PIN_PEPPER_ROTATION_AND_STAFF_REENROLLMENT';
  const dryRunOutput = runCli([
    'stage',
    '--config', './config/park-test.json',
    '--next-version', '2',
    '--reason', 'security_incident',
    '--change-id', 'issue-194-test',
    '--confirm', exactConfirmation,
  ]);
  const dryRun = JSON.parse(dryRunOutput.split(/\r?\n/).at(-1));
  assert.equal(dryRun.awsCalls, false);
  assert.equal(dryRun.action, 'stage');
}

validateMigration();
validateRuntimeContract();
validateGuardedCliSource();
validateNoAwsSelfTests();

console.log('[pass] migration stores a locking non-secret pepper-version fence and re-enrollment evidence');
console.log('[pass] staff PIN login/create/reset reject credentials derived from stale AWSCURRENT versions');
console.log('[pass] guarded CLI locks/recounts mutation bounds and advances the fail-closed fence before promotion');
console.log('[pass] CLI self-test and action plans made no AWS calls and exposed no PIN/pepper material');
