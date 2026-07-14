const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'infra', 'migrations', '0010_data_lifecycle.sql');
const runnerPath = path.join(root, 'infra', 'scripts', 'data-lifecycle.ts');

assert.equal(existsSync(migrationPath), true, 'Missing forward-only lifecycle migration.');
assert.equal(existsSync(runnerPath), true, 'Missing lifecycle runner.');

const migration = readFileSync(migrationPath, 'utf8');
const runner = readFileSync(runnerPath, 'utf8');

assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i, 'Migration must not purge rows when applied.');
assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i, 'Migration must be forward-only.');
assert.match(migration, /CREATE TABLE IF NOT EXISTS jumpyard\.data_lifecycle_runs/);
assert.match(migration, /cluster_identifier text NOT NULL/);
assert.match(migration, /cluster_arn text NOT NULL/);
assert.match(migration, /data_lifecycle_runs_cluster_arn_check/);
assert.match(migration, /policy_definition_digest text NOT NULL/);
assert.match(migration, /data_lifecycle_runs_policy_definition_digest_check/);
assert.match(migration, /eligible_counts jsonb/);
assert.match(migration, /planned_counts jsonb/);
assert.match(migration, /affected_counts jsonb/);
assert.match(migration, /affected_total integer/);
assert.match(migration, /affected_counts_digest text/);
assert.match(migration, /data_lifecycle_runs_finish_check/);
assert.match(migration, /audit_subject_id text/);
assert.match(migration, /assign_staff_identity_audit_subject/);
assert.match(migration, /BEFORE INSERT OR UPDATE OF staff_identity_id/);
assert.match(migration, /staff_identities_deactivation_lifecycle_insert_trigger/);
assert.match(migration, /BEFORE INSERT\s+ON jumpyard\.staff_identities/);
assert.match(migration, /deactivated_at timestamptz/);
assert.match(migration, /anonymized_at timestamptz/);
assert.match(migration, /An anonymized staff identity cannot be reactivated/);
assert.match(migration, /display_name = 'Former staff'/);
assert.match(migration, /provider_subject = 'anonymized:' \|\| audit_subject_id/);

const requiredActions = [
  'product_catalog_delete_expired',
  'checkin_token_delete_24h',
  'idempotency_delete_24h',
  'staff_session_delete_24h',
  'staff_pin_limiter_delete_24h',
  'prepayment_draft_delete_90d',
  'prepayment_draft_anonymize_30d',
  'guest_profile_delete_30d',
  'handoff_session_delete_30d',
  'checkin_attempt_anonymize_30d',
  'sms_delivery_anonymize_30d',
  'email_delivery_anonymize_30d',
  'webhook_event_anonymize_30d',
  'event_log_anonymize_30d',
  'booking_link_anonymize_30d',
  'booking_seed_run_anonymize_30d',
  'roller_booking_ticket_delete_30d',
  'roller_booking_payment_delete_30d',
  'checkin_session_delete_30d',
  'roller_booking_item_delete_30d',
  'roller_booking_delete_30d',
  'staff_identity_anonymize_90d',
  'checkin_attempt_delete_90d',
  'sms_delivery_delete_90d',
  'email_delivery_delete_90d',
  'webhook_event_delete_90d',
  'booking_seed_run_delete_90d',
  'booking_link_delete_90d',
  'event_log_delete_90d',
  'lifecycle_run_delete_90d',
];

let previousIndex = -1;
for (const action of requiredActions) {
  const index = runner.indexOf(`name: "${action}"`);
  assert.ok(index > previousIndex, `Missing or incorrectly ordered lifecycle action: ${action}`);
  previousIndex = index;
}

assert.match(runner, /interval '24 hours'/);
assert.match(runner, /interval '30 days'/);
assert.match(runner, /interval '90 days'/);
assert.match(runner, /AT TIME ZONE 'Europe\/Stockholm'/);
assert.match(runner, /const draftLifecycleAt[\s\S]*?GREATEST\(/);
assert.match(runner, /status IN \('guest_in_progress', 'ready_for_staff', 'staff_in_progress'\)/);
assert.match(runner, /active_session\.expires_at > \$\{reference\}/);
assert.match(runner, /active_token\.expires_at > \$\{reference\}/);
assert.match(runner, /active_handoff\.completed_at IS NULL/);
assert.match(runner, /SELECT 1 FROM jumpyard\.checkin_tokens AS token/);
assert.match(runner, /SELECT 1 FROM jumpyard\.handoff_sessions AS handoff/);
assert.match(runner, /\$\{alias\}\.booking_date IS NOT NULL/);
assert.match(runner, /lifecycle_item\.booking_date IS NULL/);
assert.match(runner, /lifecycle_ticket\.booking_date IS NULL/);
assert.match(runner, /lifecycle_ticket\.expiry_date IS NULL/);
assert.match(runner, /bookingItemLifecycleAt/);
assert.match(runner, /datedDayLifecycleAt/);
assert.match(runner, /bookingLinkSideCanAnonymize/);
assert.match(runner, /bookingLinkHasProtectedBooking/);
assert.match(runner, /NOT candidates\.anonymize_linked/);
assert.match(runner, /FOR UPDATE(?: OF [a-z_]+)? SKIP LOCKED/g);
assert.match(runner, /LIMIT CAST\(:batchSize AS integer\)/g);
assert.match(runner, /pg_try_advisory_xact_lock/);
assert.match(runner, /SET TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ WRITE/);
assert.match(runner, /IN SHARE ROW EXCLUSIVE MODE NOWAIT/);
assert.ok(
  runner.indexOf('await acquireMaintenanceTableLocks(context, transactionId)')
    < runner.indexOf('const lockedCounts = await loadEligibleCounts('),
  'Maintenance table locks must be acquired before the reviewed apply recount.',
);
for (const parentLockedChild of ['ticket', 'payment', 'checkin_session', 'item']) {
  assert.match(
    runner,
    new RegExp(`FOR UPDATE OF ${parentLockedChild}, booking SKIP LOCKED`),
  );
}
assert.match(runner, /RollbackTransactionCommand/);
assert.match(runner, /CommitTransactionCommand/);
assert.match(runner, /plan changed since dry-run/i);
assert.match(runner, /clusterIdentifier,/);
assert.match(runner, /clusterArn,/);
assert.match(runner, /policyDefinitionDigest/);
assert.match(runner, /plan_digest, policy_definition_digest, eligible_counts/);
assert.match(runner, /name: "policyDefinitionDigest", value: \{ stringValue: plan\.policyDefinitionDigest \}/);
assert.match(runner, /actionSpecs: readonly ActionSpec\[\] = ACTION_SPECS/);
assert.match(runner, /actionSpecs\.map\(\(\{ candidateSql, mutateSql, name \}\)/);
assert.match(runner, /plannedTotal > plan\.maxMutations/);
assert.match(runner, /sqlParameters\(plan\.referenceAt, source\.planned\)/);
assert.doesNotMatch(runner, /sqlParameters\(plan\.referenceAt, plan\.batchSize\)/);
assert.match(runner, /DATA_LIFECYCLE_KILL_SWITCH/);
assert.match(runner, /DATA_LIFECYCLE_ALLOW_APPLY/);
assert.match(runner, /DATA_LIFECYCLE_APPLY_ENVIRONMENT/);
assert.match(runner, /Apply requires --plan-digest from a prior dry-run/);
assert.match(runner, /--reference-at cannot be more than five minutes in the future/);
assert.match(runner, /\/aurora\/lifecycle/);
assert.match(runner, /APPROVED_LIFECYCLE_SECRET_NAME/);
assert.match(runner, /response\.Name !== APPROVED_LIFECYCLE_SECRET_NAME/);
assert.match(runner, /exact dedicated park-test lifecycle secret name or ARN/);
assert.doesNotMatch(runner, /args\.secretId \?\? `\/\$\{config\.resourcePrefix\}\/aurora\/admin`/);
assert.match(runner, /park-test-restore-rehearsal/);
for (const requiredTag of [
  'WRLDS:Client',
  'WRLDS:Project',
  'WRLDS:Environment',
  'WRLDS:Owner',
  'WRLDS:Repository',
  'WRLDS:ManagedBy',
  'WRLDS:DataClassification',
  'WRLDS:Exportable',
  'WRLDS:CostCenter',
  'WRLDS:CreatedBy',
]) {
  assert.ok(runner.includes(requiredTag), `Missing lifecycle config tag guard: ${requiredTag}`);
}
assert.match(runner, /allowlisted only for the approved park-test target or isolated restore rehearsal/);
assert.match(runner, /PARK_TEST_RESOURCE_PREFIX = "jumpyard-check-in-park-test"/);
assert.match(runner, /RESTORE_ACCOUNT = "376129878018"/);
assert.match(runner, /RESTORE_REGION = "eu-north-1"/);
assert.match(runner, /\^jy-park-test-restore-20\\d\{6\}t\\d\{6\}z-\[a-z0-9\]\{6\}-aurora\$/);
assert.match(runner, /--cluster-identifier/);
assert.match(runner, /--cluster-arn/);
assert.match(runner, /no source fallback is allowed/);
assert.match(runner, /Restore-rehearsal lifecycle runs require an explicit --secret-id/);
assert.match(runner, /--evidence-out must be an absolute \.json path/);
assert.match(runner, /Lifecycle apply requires --evidence-out for an aggregate post-commit receipt/);
assert.match(runner, /environment !== PARK_TEST_ENVIRONMENT && environment !== RESTORE_ENVIRONMENT/);
assert.match(runner, /linkSync\(temporaryPath, outputPath\)/);
assert.match(runner, /flag: "wx"/);
assert.match(runner, /Lifecycle evidence output already exists; overwrite is forbidden/);
assert.match(runner, /RETURNING run_id/);
assert.match(runner, /Lifecycle run completion could not be correlated to its applying run/);

for (const receiptField of [
  'schemaVersion: 1',
  'issue: 194',
  'action: "lifecycle-apply"',
  'result: "succeeded"',
  'runId: result.runId',
  'planDigest: plan.digest',
  'referenceAt: plan.referenceAt',
  'clusterArn: plan.clusterArn',
  'clusterIdentifier: plan.clusterIdentifier',
  'environment: plan.environment',
  'policyDefinitionDigest: plan.policyDefinitionDigest',
  'policyVersion: POLICY_VERSION',
  'completedAt: result.completedAt',
  'affectedTotal: result.affectedTotal',
  'affectedCountsDigest: result.affectedCountsDigest',
  'aggregateOnly: true',
  'containsSensitiveData: false',
]) {
  assert.ok(runner.includes(receiptField), `Missing restore lifecycle receipt field: ${receiptField}`);
}
assert.ok(
  runner.indexOf('if (!evidenceOut) {')
    < runner.indexOf('const applyResult = await applyPlan(context, plan)'),
  'Lifecycle apply must be blocked before mutation when no receipt path is available.',
);
assert.ok(
  runner.indexOf('const applyResult = await applyPlan(context, plan)')
    < runner.indexOf('writeEvidenceReceiptAtomically(evidenceOut, receipt)'),
  'Lifecycle evidence must be written only after the committed lifecycle apply returns.',
);

assert.match(runner, /customer_email = NULL/);
assert.match(runner, /customer_phone = NULL/);
assert.match(runner, /roller_draft_unique_id = CASE/);
assert.match(runner, /roller_capacity_reservation_id = CASE/);
assert.match(runner, /external_id = CASE/);
assert.match(runner, /original_booking_reference = CASE/);
assert.match(runner, /original_roller_unique_id = CASE/);
assert.match(runner, /add_on_group_id = CASE/);
assert.match(runner, /pin_lookup_hash = NULL/);
assert.match(runner, /pin_verifier = NULL/);
assert.match(runner, /pin_pepper_version = NULL/);
assert.match(runner, /pin_reenrollment_required_at = NULL/);
assert.match(runner, /mfa_replacement_email_hash = NULL/);
assert.match(runner, /\$\{linkAlias\}\.\$\{rollerUniqueIdColumn\} !~ '\^audit_/);
assert.match(runner, /SET error_summary = NULL/);
assert.match(runner, /selected_ticket_ids = '\[\]'::jsonb/);
assert.match(runner, /event_payload = '\{\}'::jsonb/);
assert.match(runner, /'audit_' \|\| md5/);
assert.match(runner, /RETURNING 1/g);
assert.doesNotMatch(runner, /RETURNING\s+(?:token_hash|idempotency_key|provider_subject|customer_email)/i);
assert.match(runner, /upstream diagnostic was suppressed to avoid exposing protected data/);
assert.doesNotMatch(runner, /console\.error\(error instanceof Error \? error\.message/);

const tsNodeBin = path.join(root, 'infra', 'node_modules', 'ts-node', 'dist', 'bin.js');
assert.equal(existsSync(tsNodeBin), true, 'Infra dependencies must be installed for lifecycle validation.');
const selfTest = spawnSync(
  process.execPath,
  [tsNodeBin, '--prefer-ts-exts', path.join('scripts', 'data-lifecycle.ts'), '--self-test'],
  {
    cwd: path.join(root, 'infra'),
    encoding: 'utf8',
    env: { ...process.env },
  },
);
assert.equal(
  selfTest.status,
  0,
  `Lifecycle synthetic self-test failed:\n${selfTest.stdout}\n${selfTest.stderr}`,
);
assert.match(selfTest.stdout, /lifecycle synthetic self-test passed/i);

console.log('T0195 data lifecycle validation passed.');
