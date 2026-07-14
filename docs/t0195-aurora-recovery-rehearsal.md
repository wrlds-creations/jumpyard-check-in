# T0195 Aurora Recovery Rehearsal

This runbook defines the guarded park-test snapshot and isolated Aurora restore path for Issue #194. It is deliberately narrower than disaster-recovery automation: the tool can plan, create an approved pre-change snapshot, create one approved isolated restore, verify it with safe aggregate evidence, and clean up only the temporary resources it recorded.

No AWS action in this runbook is approved by repository implementation alone. Love separately approved the 2026-07-14 snapshot, isolated restore, migration test, cleanup, source-database migrations, stack rollout, and source lifecycle dry-run; those actions are complete. Snapshot deletion, a new restore, and lifecycle apply remain unapproved independent actions. Snapshot creation, restore creation, cleanup, and snapshot deletion each require the external-write checkpoint plus their exact action-specific approval.

## Fixed boundary

The tool accepts only this target:

- account `376129878018`;
- region `eu-north-1`;
- environment `park-test`;
- source cluster `jumpyard-check-in-park-test-aurora`;
- Aurora PostgreSQL `16.13`, encryption enabled, seven-day backup retention, deletion protection on, Data API on, and snapshot tag copy on;
- the ten approved WRLDS tags, including `DataClassification=confidential`, `Exportable=true`, and `CostCenter=unassigned`.

It rejects production-like metadata and identifiers. It does not create or modify Lambda, API Gateway, CloudFormation, DNS, Cloudflare, Roller, messaging, or application configuration.

## Local plan

Run from `infra/` with a unique UTC run id:

```powershell
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/aurora-recovery-rehearsal.ts `
  --config ./config/park-test.json `
  --run-id 20260714t120000z-a1b2c3 `
  --json
```

Plan mode reads the repository config only. It makes no AWS call and no write. A real run id uses `YYYYMMDDtHHMMSSz-` plus six fresh lowercase letters/numbers; identifiers are never reused.

## Approval model

Every mutation requires `--apply` and both locks below:

1. global checkpoint: `T0195_EXTERNAL_WRITE_APPROVAL=I_APPROVE_T0195_EXTERNAL_AWS_WRITE_CHECKPOINT`;
2. exactly one action lock:
   - snapshot: `T0195_AURORA_SNAPSHOT_APPROVAL=I_APPROVE_PARK_TEST_PRECHANGE_SNAPSHOT`;
   - restore: `T0195_AURORA_RESTORE_APPROVAL=I_APPROVE_ISOLATED_PARK_TEST_AURORA_RESTORE`;
   - restore cleanup: `T0195_AURORA_CLEANUP_APPROVAL=I_APPROVE_DELETING_ISOLATED_PARK_TEST_RESTORE`;
   - snapshot deletion: `T0195_AURORA_SNAPSHOT_DELETE_APPROVAL=I_APPROVE_DELETING_PARK_TEST_PRECHANGE_SNAPSHOT`.

Snapshot and restore creation require a run id less than 24 hours old. Cleanup and snapshot deletion accept an older valid deterministic run id so delayed evidence review cannot permanently block necessary cost/data cleanup. Age never replaces authorization: approval for one action does not approve another, and every delete still requires both the global lock and its action-specific lock.

Applying repository migrations to an already isolated restore is also separate from restore creation. It requires the same global checkpoint plus `T0195_RESTORE_MIGRATION_APPROVAL=I_APPROVE_T0195_MIGRATIONS_ON_ISOLATED_RESTORE`, the exact current restore run id, and that run's external state file at `stage=writer-available`. This approval never permits a source-cluster migration.

## Pre-change snapshot

After the external-write checkpoint, use `--action snapshot --apply` with the approved run id. The tool verifies caller account, source metadata, source tags, encryption, engine, seven-day backup policy, and snapshot-copy tagging before creating `jy-park-test-prechange-<run-id>`. It waits for full availability and returns only safe metadata.

For a full lifecycle rehearsal, select a restore point after migrations `0010`-`0012` and restricted-role password provisioning have completed, but before the approved lifecycle mutation being rehearsed. This ensures the restored database already contains the repository migration set and the dedicated lifecycle role/password required by the verifier. A snapshot taken before those changes remains useful as rollback evidence and can prove the migrations through the guarded isolated-migration procedure below, but it cannot prove lifecycle execution until the dedicated role/password exists.

Snapshot deletion is a separate `--action delete-snapshot --apply --snapshot-id ...` operation. It accepts only the deterministic identifier for the same run id and re-verifies the snapshot source, encryption, engine, and tags before deletion.

## Isolated restore

After approval, `--action restore --apply` supports:

- `--restore-source latest` for latest-restorable-time PITR;
- `--restore-source time --restore-to-time <ISO-8601>` for a point inside the live seven-day PITR window;
- `--restore-source snapshot --snapshot-id jy-park-test-prechange-<run-id>` for the guarded manual snapshot.

The recovery tool itself does not apply migrations or rebind database-role passwords. When the restore predates migrations `0010`-`0012` but still matches the current administrator credential, the separately approved guarded migration runner may target only the deterministic isolated cluster named by the restore state file:

```powershell
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/run-migrations.ts `
  --config ./config/park-test.json `
  --profile wrlds-dev `
  --restore-run-id <run-id> `
  --restore-state-file <absolute-external-state-file>
```

The runner derives the cluster ARN from the exact run id, accepts only account `376129878018`, region `eu-north-1`, the park-test config, state `writer-available`, `TrafficEligible=false`, and the deterministic cluster/writer identifiers. It uses the Aurora administrator credential only for schema migration. It never authorizes that credential for lifecycle dry-run/apply. If the restore predates restricted-role password provisioning or contains a database password that no longer matches the current administrator secret, stop for a new reviewed recovery procedure.

Restore also requires an absolute `--state-file` path outside the repository. The state file contains resource ids, stages, safe timing, and cleanup data only; it never contains credentials, PII, PINs, tokens, or secret values. Keep it in an access-controlled operator directory through cleanup review, then delete it within 90 days of rehearsal completion. The aggregate lifecycle receipt follows the same 90-day limit.

The restore creates:

- a unique security group with zero inbound rules;
- one encrypted Aurora cluster using the existing isolated DB subnet group;
- one `db.serverless` writer with public accessibility disabled.

All temporary resources carry exact project tags plus `Issue=194`, run id, purpose, `TrafficEligible=false`, and `LifecycleReapplied=false`. The restore security group is not a source/application group. The restore is never attached to the application, and the tool has no promotion or traffic-enable action.

On partial failure, the tool records the last safe stage and stops. It does not destroy evidence or resources without the separate cleanup approval. An exact same-run resume is allowed only from a recorded `failed/isolation-created` state when the existing cluster, tags, encryption, Data API, zero-ingress group, identifiers, source, and absence of any attached instance all revalidate. Any other partial state requires cleanup or a new reviewed procedure.

AWS exposes Data API state as `HttpEndpointEnabled` on readback and does not accept `--enable-http-endpoint` on snapshot restore. The tool therefore restores the cluster first, enables Data API through the dedicated RDS action, waits for the asynchronous change, and verifies the flag before creating the private writer.

## Safe verification

`--action verify --state-file <external-file>` is read-only against AWS and Aurora. Supply only an approved operator credential ARN through `T0195_RESTORE_VERIFICATION_SECRET_ARN`; the secret value is never read by the script or printed.

Verification checks:

- source and restored engine/version;
- encryption, Data API, restored cluster tags, and exact isolation security group;
- private writer state and zero inbound rules;
- repository migration versions and SHA-256 checksums against `jumpyard.schema_migrations`;
- the supplied lifecycle receipt against the latest completed `jumpyard.data_lifecycle_runs` row;
- one aggregate-only row count and server-computed fingerprint per `jumpyard` table;
- observed restore duration and source-data age.

Table values never leave Aurora. The output contains table names, counts, and fingerprints only when `--aggregate-json` is explicitly requested; otherwise it returns set digests and counts. These fingerprints are rehearsal evidence, not a cryptographic backup certification.

Observed duration and data age are measurements for this individual rehearsal. They are not a production RPO or RTO, service commitment, or production approval.

## Lifecycle reapplication gate

A restored database must receive the approved Issue #194 lifecycle policy before the rehearsal can be complete. Pass `--lifecycle-evidence <file>` only after the separately gated lifecycle apply succeeds against the restored cluster. The evidence contract is:

Use an external, non-secret restore config with account `376129878018`, region `eu-north-1`, resource prefix `jy-park-test-restore-<run-id>`, and `WRLDS:Environment=park-test-restore-rehearsal`. The lifecycle dry-run must explicitly name both the restore cluster and the dedicated source park-test lifecycle credential. The only accepted secret is `/jumpyard-check-in-park-test/aurora/lifecycle`, or its exact Secrets Manager ARN in account `376129878018` and region `eu-north-1` with the AWS-generated six-character suffix. Handler runtime secrets and the Aurora administrator secret are forbidden; there is no credential fallback. A snapshot/PITR restore preserves the dedicated lifecycle database role and password that this secret represents:

```powershell
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/data-lifecycle.ts `
  --config <absolute-external-restore-config.json> `
  --cluster-identifier jy-park-test-restore-<run-id>-aurora `
  --secret-id /jumpyard-check-in-park-test/aurora/lifecycle `
  --reference-at <reviewed-ISO-8601-reference-time>
```

After reviewing that deterministic plan, the separately approved lifecycle apply repeats the same target and adds `--apply`, the reviewed `--plan-digest`, and `--evidence-out <absolute-external-lifecycle-evidence.json>`. The evidence file is created atomically only after the database transaction commits and must not overwrite an earlier receipt.

```json
{
  "schemaVersion": 1,
  "issue": 194,
  "action": "lifecycle-apply",
  "result": "succeeded",
  "runId": "jylc_0123456789abcdefabcd",
  "planDigest": "<64 lowercase hex characters>",
  "referenceAt": "2026-07-14T12:00:00.000Z",
  "clusterIdentifier": "jy-park-test-restore-<run-id>-aurora",
  "clusterArn": "arn:aws:rds:eu-north-1:376129878018:cluster:jy-park-test-restore-<run-id>-aurora",
  "environment": "park-test-restore-rehearsal",
  "policyVersion": "t0195-v1",
  "policyDefinitionDigest": "<64 lowercase hex characters>",
  "completedAt": "2026-07-14T12:30:00.000Z",
  "affectedTotal": 12,
  "affectedCountsDigest": "<64 lowercase hex characters>",
  "aggregateOnly": true,
  "containsSensitiveData": false
}
```

The lifecycle tool obtains `runId`, `completedAt`, `affectedTotal`, and `affectedCountsDigest` from the same committed transaction metadata recorded in the restored database. The reviewed `planDigest` binds the exact restore cluster ARN, policy-definition digest, action definitions, counts, reference time, and apply guards. During verification, the recovery tool reads only safe metadata from the latest completed `jumpyard.data_lifecycle_runs` row: run id, policy version and policy-definition digest, environment, cluster identifier and ARN, reference and completion timestamps, plan digest, affected total, and affected-counts digest. It does not read lifecycle candidate records, PII, PINs, tokens, or secret values.

The receipt must name exactly `arn:aws:rds:eu-north-1:376129878018:cluster:<restore-identifier>`, and `policyDefinitionDigest` must be a lowercase SHA-256 value and exactly match the database row. The receipt and database row match exactly on every database-backed field before lifecycle reapplication is accepted. The verifier then stores only a SHA-256 digest of the receipt in the external state file. Missing evidence, a missing completed database run, or any mismatch keeps `rehearsalComplete=false` by failing verification. Even a matched receipt keeps `trafficEligible=false`: this rehearsal tool can never connect the restore to app traffic.

## Cleanup

After evidence review and explicit cleanup approval, `--action cleanup --apply --state-file <external-file>`:

1. re-verifies the unique run id, deterministic resource names, exact account/region ARNs, Aurora PostgreSQL engine, encryption, non-public writer, isolated security group, cluster membership, and full temporary tags immediately before deletion;
2. confirms the source cluster is not a target;
3. deletes the private temporary writer;
4. deletes the temporary restore cluster without creating another snapshot;
5. deletes the ingress-free temporary security group;
6. records `stage=cleaned` in the external state file.

Cleanup does not delete the source cluster or pre-change snapshot. A missing or mismatched ownership signal fails closed before deletion. Snapshot retention/deletion remains the separate guarded action above and independently revalidates its exact source, engine, encryption, and tags.

The 2026-07-14 approved cleanup completed for runs `20260714t155812z-ilzs0e` and `20260714t154842z-ghunbv`. Both external state files reached `stage=cleaned`; final AWS readback found no `jy-park-test-restore-*` cluster, instance, or security group. The source remained available, encrypted, Data API enabled, deletion-protected, and on migration `0009`. Snapshot `jy-park-test-prechange-20260714t154842z-ghunbv` remained available and encrypted.

## Local validation

The local checks make no AWS call:

```powershell
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/aurora-recovery-rehearsal.ts --self-test
node ..\scripts\validate-t0195-aurora-recovery.js
```

Before an eventual external-write checkpoint, also review a fresh plan, the current AWS inventory, current source backup metadata, estimated temporary Aurora cost, the maintenance window, lifecycle apply evidence format, and who owns approved cleanup.
