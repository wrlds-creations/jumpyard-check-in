# T0195 Data Lifecycle, Secret, And Recovery Policy

Status: repository implementation for GitHub issue [#194](https://github.com/wrlds-creations/jumpyard-check-in/issues/194). The policy and tooling in this branch are not deployed. No migration, live purge, secret mutation, snapshot, restore, or other AWS write is authorized by this document.

## Repository Audit

This audit was completed before the durable project documents were updated. It covered the current schema migrations, all six Lambda handlers, the CDK stack, phone-local recovery storage, existing AWS inventory, deployed T0190-T0194 boundaries, and the approved issue scope.

Confirmed gaps on the approved base were:

- Aurora had no complete lifecycle runner, so expired access rows and old operational/contact data could remain indefinitely.
- Every Lambda used the Aurora administrator secret, and several handlers retained AWS permissions that their code did not use.
- The staff PIN pepper had no version/re-enrollment contract, so replacing it directly would make existing PIN material fail without controlled recovery.
- Seven-day automated Aurora backup existed, but no isolated, evidence-backed restore path had been codified.
- Phone contact recovery state had a 12-hour read-time check but was not actively removed at the deadline while the app remained open.

The audit found no justification to persist raw Roller/webhook payloads, raw payment JWTs, access tokens, staff PINs, secret values, or unmasked credentials. Those data classes remain prohibited.

## Policy Clocks And Owners

All lifecycle comparisons use a caller-supplied UTC `referenceAt` that is included in the reviewed plan digest. Booking visit time is derived from `booking_date` plus end time, start time, or end-of-day fallback in `Europe/Stockholm`. The lifecycle operator is WRLDS; Roller remains authoritative for booking/product/payment/redemption facts, and JumpYard Cloud owns only the operational cache and audit/recovery state.

The lifecycle runner is the enforcement owner for Aurora. The phone application owns its local browser state. The AWS platform owner enforces managed-service retention. The security owner controls identity and secret changes.

## Aurora Inventory

| Table / data class | Retention owner | Clock | Approved action | Dependency and restore behavior |
| --- | --- | --- | --- | --- |
| `roller_bookings` | JumpYard Cloud lifecycle; Roller authoritative | Visit end/start/local day | Delete 30 days after the visit | Protect future/active/unknown-date bookings and live operational references. Delete last, after audit references are pseudonymized and child rows are gone. Restores must rerun lifecycle before traffic. |
| `roller_booking_items` | JumpYard Cloud lifecycle | Parent booking visit | Delete 30 days after visit | Delete after tickets and before booking parent. Reapply after restore. |
| `roller_booking_tickets` | JumpYard Cloud lifecycle | Parent booking visit | Delete 30 days after visit | Child-first deletion; active/future booking protection applies. Reapply after restore. |
| `roller_booking_payments` | JumpYard Cloud lifecycle | Parent booking visit | Delete 30 days after visit | Stores normalized metadata only, never raw payment JWTs. Child-first deletion. |
| `guest_profiles` | JumpYard Cloud lifecycle | Later of Roller last-seen and row update | Delete after 30 days | Keep while a protected booking or recent draft still needs the contact. Reapply after restore. |
| `checkin_tokens` | JumpYard Cloud lifecycle | `expires_at` | Delete no later than 24 hours after expiry | Hash-only token rows; delete before aged booking state. |
| `checkin_attempts` | JumpYard Cloud lifecycle/audit | `created_at`, or eligible parent visit | At 30 days remove direct booking/ticket/idempotency references and keep only pseudonymous provider/booking evidence; delete at 90 days | Anonymize before booking deletion. Restores use the same original clocks. |
| `handoff_sessions` | JumpYard Cloud lifecycle | Completion, otherwise expiry | Delete after 30 days | Active/unexpired handoffs remain protected. |
| `booking_links` | JumpYard Cloud lifecycle/audit | `created_at`, or eligible linked visit | At 30 days pseudonymize original/linked booking and add-on identifiers; delete at 90 days | Anonymize before either booking parent is deleted. |
| `idempotency_records` | JumpYard Cloud lifecycle | `expires_at` | Delete no later than 24 hours after expiry | Runtime may reuse a key only after its expiry; live windows remain protected. |
| `product_catalog_cache` | JumpYard Cloud lifecycle | Explicit expiry, otherwise fetch time plus 24 hours | Delete when effectively expired | Runtime reads enforce the same effective expiry; Roller remains authoritative. |
| `roller_webhook_events` | JumpYard Cloud lifecycle/audit | `received_at` | At 30 days remove direct booking identifiers and error detail, retaining pseudonymous status metadata; delete at 90 days | No raw payload storage. Reapply after restore. |
| `booking_seed_runs` | JumpYard Cloud lifecycle/audit | Finish time, otherwise start time | Clear error detail at 30 days; delete at 90 days | Aggregate run evidence only; no raw imported payload. |
| `event_log` | JumpYard Cloud lifecycle/audit | `created_at` | At 30 days pseudonymize subject and clear summaries/payload; delete at 90 days | Keep safe audit category/result/correlation only during the audit window. |
| `checkin_sessions` | JumpYard Cloud lifecycle | Parent booking visit | Delete 30 days after visit | Protect active/future booking sessions. Delete before booking parent. |
| `prepayment_booking_drafts` | JumpYard Cloud lifecycle | Later of booking visit, expiry, and update | At 30 days remove contact fields and pseudonymize direct provider, capacity, external, and idempotency references; delete row at 90 days | Raw payment JWT remains prohibited. Recent drafts protect matching guest contact. |
| `sms_deliveries` | JumpYard Cloud lifecycle/audit | `created_at`, or eligible parent visit | At 30 days remove token/direct booking/error detail and retain pseudonymous delivery status; delete at 90 days | Anonymize before booking deletion. Guest sends remain disabled until separately approved. |
| `email_deliveries` | JumpYard Cloud lifecycle/audit | `created_at`, or eligible parent visit | At 30 days remove token/direct booking/error detail and retain pseudonymous delivery status; delete at 90 days | Anonymize before booking deletion. Guest sends remain disabled until separately approved. |
| `staff_identities` | Security/identity owner; lifecycle enforces | `deactivated_at` | Retain active identities; 90 days after deactivation remove names, provider subject, PIN/MFA replacement material, and retain only `Former staff` plus pseudonymous audit id | All staff sessions must be gone first. Anonymized identities cannot be reactivated. Cognito user cleanup is an operator responsibility described below. |
| `staff_auth_sessions` | Security owner; lifecycle enforces | Earliest token, idle, absolute, or revocation expiry | Delete no later than 24 hours after effective end | PIN/version/role/deactivation changes revoke sessions immediately. |
| `staff_pin_auth_limits` | Security owner; lifecycle enforces | Later of limiter window, last failure, block end, and update | Delete no later than 24 hours after effective window | Current blocks remain protected. Scope hashes, not PINs, are stored. |
| `staff_pin_pepper_state` | Security/database owner | Environment lifetime | Retain for the life of the environment | Non-secret current-version fence only. A database trigger rejects any usable local PIN credential derived from an older version. |
| `data_lifecycle_runs` | Lifecycle operator | `finished_at` | Retain aggregate completed evidence for 90 days, then delete | Contains counts/digests and safe correlation metadata only. Restore acceptance must match a completed database row, not a receipt file alone. |
| `schema_migrations` | Database migration owner | Migration application time | Retain for the life of the database | Integrity/control data, not guest data. A restore must match the expected migration set and checksums. |

The mutation order is deterministic and bounded: expired cache/access rows; draft/contact/handoff state; 30-day audit pseudonymization; booking tickets/payments/sessions/items; booking parents; disabled staff anonymization; and 90-day audit/run deletion. Foreign-key or surviving-reference checks may intentionally defer a parent until a later idempotent run.

## Other Persisted Stores

| Store / data class | Owner | Retention/action | Restore or recovery rule |
| --- | --- | --- | --- |
| Phone browser buy-flow contact snapshot | Phone application | Expire no later than 12 hours after `updatedAt` under the device clock; while open, delete at the module-scoped monotonic deadline and checkpoint the nondecreasing observation time every minute | Contact is a convenience cache only. `expiresAt` cannot be extended, detected clock rollback fails closed, and storage/page-show/visibility/cross-tab events validate before reuse. A fully closed/offline browser cannot execute deletion or prove unobserved real elapsed time after device-clock rollback; a strict adversarial-clock guarantee would require a server-trusted time gate. |
| Private raw-payload S3 bucket | AWS platform owner | 30-day object lifecycle; raw payload persistence remains prohibited by application policy | Retained bucket must not be copied into production. Versioned objects follow the configured lifecycle. |
| Lambda, API, and provider custom-resource logs | AWS platform owner | 30 days | Logs must contain no PII, tokens, PIN material, secrets, or raw payloads. |
| Main SQS queue | AWS platform owner | Four days | Operational retry only; payload policy still forbids raw/secret material. |
| Dead-letter SQS queue | AWS platform owner | Fourteen days | Diagnose with safe metadata, then redrive/delete through a separately approved operation. |
| Cognito administrator identities | Security/identity owner | Retain enabled named administrators; disable promptly when access ends and delete the disabled provider identity within 90 days after audit/replacement needs end | Aurora registry anonymization does not delete a Cognito user. This is a controlled operator action, not an automatic lifecycle mutation in this issue. |
| Secrets Manager values | Security/platform owner | Retain until an approved replacement or environment decommission; all stack-managed secrets use retain-on-delete/update-replace | Never copy park-test secrets to production. Previous versions are rollback/containment material and require controlled cleanup. |
| Aurora automated backups/PITR | AWS platform owner | Seven days in park-test; future production configuration must preserve the deterministic guard until separately approved | Restore only to an isolated, tagged, non-public cluster with no application attachment. |
| Manual/pre-change DB snapshot | Recovery operator | Retain until the approved rehearsal/change is verified; deletion is a separate explicit action | Never restore or copy park-test operational data into production. |
| External lifecycle evidence receipt | Lifecycle operator | Aggregate-only evidence follows the same 90-day run-evidence limit, then is deleted from the access-controlled operator location | A restore verifier accepts it only when every safe field matches the restored database's completed run row. |
| External restore state/evidence file | Recovery operator | Retain through verified cleanup and review, then delete within 90 days of rehearsal completion | Contains resource ids, safe timestamps/digests, and cleanup state only; never credentials or application row values. It stays outside the repository. |

## Lifecycle Execution Contract

The lifecycle tool defaults to deterministic plan mode and makes no mutation. It records the exact environment, cluster, reference time, batch size, maximum mutation count, per-action eligible/planned counts, policy version, and plan digest.

Apply requires all of the following:

- a non-disabled kill switch;
- the approved environment and exact target cluster;
- the reviewed plan digest and reference time;
- an explicit apply flag and exact deletion/anonymization confirmation phrase;
- a bounded batch size and global maximum-mutation guard;
- a dedicated lifecycle database secret rather than a handler or administrator runtime identity.

Apply takes an advisory lock, recounts candidates inside one transaction, fails if the reviewed plan changed, uses `FOR UPDATE SKIP LOCKED`, records only aggregate evidence, and rolls back the entire run on any error or guard violation. After commit, the safe external receipt must match the completed `data_lifecycle_runs` row. A committed deletion cannot be undone by the runner; containment is to keep traffic closed, preserve evidence, stop further runs, and use a separately approved pre-change snapshot/restore when recovery is required.

No scheduler is added in this repository-only phase. Scheduling and first live dry-run/apply require the external-write checkpoint.

The local synthetic proof makes no AWS call:

```powershell
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/data-lifecycle.ts --self-test
```

After migrations, roles, and deploy receive the separate checkpoint, an operator runs a read-only plan from `infra/` with one reviewed reference time:

```powershell
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/data-lifecycle.ts `
  --config ./config/park-test.json `
  --profile wrlds-dev `
  --reference-at <reviewed-ISO-8601-time>
```

Apply must repeat the same arguments and add the reviewed `--plan-digest`, `--apply`, and an absolute external `--evidence-out` path while three environment locks are set exactly: `DATA_LIFECYCLE_KILL_SWITCH=DISABLED_FOR_APPROVED_MAINTENANCE`, `DATA_LIFECYCLE_ALLOW_APPLY=I_UNDERSTAND_THIS_DELETES_OR_ANONYMIZES_DATA`, and `DATA_LIFECYCLE_APPLY_ENVIRONMENT=park-test`. Never paste credentials or row values into CLI arguments.

## Database Least Privilege

Park-test and every non-`dev` future environment use one retained Secrets Manager database identity per handler plus a separate lifecycle identity. `dev` keeps its legacy administrator path until separately migrated. The administrator secret is restricted to migrations, role provisioning, and guarded operations; it is not placed in non-dev handler environments.

The role migration revokes broad/public privileges, creates non-superuser/non-owner login roles, and grants only the tables and operations each handler needs. Runtime handlers receive Data API statement permissions, with transaction permissions only where their code needs them. They do not receive lifecycle evidence or schema-migration table access. Runtime roles have no direct access to the non-secret PIN-version fence; a narrowly scoped, fixed-query trigger performs a locking read so a credential write sees the latest committed version after any concurrent promotion wait, while only the guarded administrator operation can advance the fence. Unused handler S3, SQS, and EventBridge access is removed. SNS/SES access exists only for the session handler when the already-approved guest-send gates are enabled; normal park-test keeps those sends and permissions closed.

Deployment ordering is mandatory: review synth/diff, take a separately approved snapshot if required, apply migrations `0010`-`0012`, deploy the stack so database roles/passwords are provisioned, then run denied-path and application regressions. Deploying the runtime secret switch before the database roles exist would break handlers.

That sequence applies to the existing park-test cluster. A brand-new non-dev environment cannot use a one-shot deployment because its writer must exist before migrations, while restricted handlers must not start on the administrator identity. Production therefore requires a separately approved two-stage bootstrap that first creates an isolated database foundation, then applies migrations before enabling role provisioning and application handlers. T0195 does not add or authorize that future production bootstrap.

## Secret Inventory And Rotation

| Secret | Owner and consumers | Cache/activation | Trigger and rollback/containment |
| --- | --- | --- | --- |
| `/<prefix>/roller/credentials` | Integration owner; booking, lookup, redeem, data-sync, webhook | Roller configuration cache is bounded to five minutes | Coordinated manual provider change with separate approval. Keep/reinstate prior version until read-only verification passes. No rotation in this ticket. |
| `/<prefix>/webhooks/dev-token` | Integration/security owner; webhook handler | Direct-token cache bounded to 60 seconds | Change only with coordinated Roller delivery-header update and rollback plan. Webhook processing gate remains unchanged. |
| `/<prefix>/redeem/dev-token` | Security owner; redeem handler | Direct-token cache bounded to 60 seconds | Manual security event/config change; preserve previous version until the service-auth regression passes. |
| `/<prefix>/staff/auth` | Security owner; session handler | Structured `{purpose, version, pinPepper}` value; 30-second cache, forced refresh on admin create/reset | No scheduled rotation. Use the security-driven re-enrollment sequence below. Never print or accept a PIN/pepper as a CLI argument. |
| `/<prefix>/checkin-links/dev-token` | Security owner; session handler | Cache bounded to 60 seconds | Manual approved change; old guest credentials may be invalidated, so coordinate activation and rollback explicitly. |
| `/<prefix>/aurora/admin` | Database owner; migrations/role provisioner/guarded tools only | Read per controlled operation | Rotate manually with separate approval and verify migration/provisioner access. Never restore it to non-dev Lambda runtime. |
| `/<prefix>/aurora/runtime/{handler}` | Database owner; exactly one of booking, data-sync, lookup, redeem, session, webhook | RDS Data API resolves the secret for calls; role password is provisioned from the retained secret | Controlled stack/database operation. A value change requires an explicitly reviewed bump of `DATABASE_RUNTIME_ROLE_CONFIGURATION_VERSION`; an unchanged redeploy does not reprovision passwords. Retain the prior secret version for rollback; handler roles remain isolated. |
| `/<prefix>/aurora/lifecycle` | Database/lifecycle owner; lifecycle CLI only | Read for one guarded run | Rotate manually after review; validate plan/read access before any apply. It cannot administer schema or other roles. |

Automatic Secrets Manager rotation remains disabled. “Cadence” for every listed secret is event-driven/manual, not calendar-driven, until a provider-compatible rotation design is separately approved. T0195 implements the guarded PIN-pepper sequence only; other secret replacements remain separate approved operations.

## Security-Driven PIN Pepper Re-enrollment

Ordinary staff still sign in using PIN only. No authenticator, email, password, username, or device registration is added.

The guarded sequence is:

1. Validate stack/account/region/environment/tags, require a security reason/change id, generate the next secret value locally, and stage it as `AWSPENDING` without printing it.
2. In one database transaction, take the maintenance lock, recount the bounded identity set, enforce `--max-identities` against that locked count and the actual affected count, mark those local-PIN identities as requiring re-enrollment, clear lookup/verifier material, retain the old non-secret version as invalidation evidence, and revoke every staff session. Parallel rotation or credential/session writes cannot change the reviewed count or evidence while the lock is held.
3. Take the same short maintenance lock, reverify that no old local PIN material or active staff session remains, and atomically advance the non-secret database version fence to the next version. Commit that fail-closed fence before moving `AWSPENDING` to `AWSCURRENT`: stale or cached old-version admin writes are rejected by the database, while a failed secret promotion can be retried without reopening old credentials.
4. Move the staged secret to `AWSCURRENT`, wait beyond the bounded cache interval, then let administrators issue replacement PINs through the existing create/reset flow. Those operations force-refresh the secret, while the database trigger independently requires the written version to match its current fence.

Before step 2, containment can discard the pending version. After step 2, old PIN hashes must not be restored. If step 3 commits but the Secrets Manager promotion fails, the database remains deliberately fail-closed at the next version; retry `promote` with the same staged version. Keep staff sessions closed and complete administrator re-enrollment. This intentionally favors revocation over silent rollback to compromised material.

The safe local commands from `infra/` make no AWS call:

```powershell
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/rotate-staff-pin-pepper.ts --self-test
node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/rotate-staff-pin-pepper.ts plan
```

For a real security event, first generate and review separate `stage`, `require-reenrollment`, and `promote` plans with `--next-version`, one of the approved non-scheduled `--reason` values, a non-PII `--change-id`, and a maximum identity count. Each write then requires its own invocation with `--apply --confirm I_APPROVE_T0195_PIN_PEPPER_ROTATION_AND_STAFF_REENROLLMENT`. PINs, peppers, and secret values are rejected as command-line arguments.

## Isolated Backup And Restore Rehearsal

The recovery tool defaults to a local plan and performs no AWS calls. Every mutation action requires the global approval plus an action-specific exact phrase. Snapshot creation, restore creation, restore cleanup, and snapshot deletion are separately gated.

An approved rehearsal must:

- verify the exact park-test account, region, source cluster, tags, engine/version, encryption, deletion protection, Data API, and seven-day backup window;
- create a uniquely named, tagged pre-change snapshot or choose an approved point in time;
- restore into private subnets with an isolated no-ingress security group, a temporary serverless writer, no public endpoint, and no application/API attachment;
- keep state outside the repository and expose only aggregate identifiers/timing/evidence;
- verify engine/version, encryption, migration names/checksums, schema tables, aggregate row counts/fingerprints, and measured data age without outputting PII;
- run/reapply the lifecycle policy against the exact restore cluster and require a safe receipt that matches the restore database's completed lifecycle row;
- keep the environment closed to application traffic throughout; and
- require explicit cleanup approval and revalidate deterministic names, account/region ARNs, engine, encryption, private isolation, source binding, and exact rehearsal tags immediately before deleting temporary instance/cluster resources or the snapshot.

Recovery duration and data age are measurements from the rehearsal, not a production RTO/RPO commitment. A future production environment needs its own approved target, secrets, tags, retention decision, rehearsal, and cutover approval.

## Validation And External Checkpoint

Local acceptance consists of deterministic synthetic 24-hour/30-day/90-day/12-hour tests; handler SQL/grant and denied-path checks; PIN version/re-enrollment/session invalidation tests; restore plan/approval/receipt tests; full T0190-T0194 regression; frontend checks; CDK synth/read-only diff; and `git diff --check`.

Love separately approved and completed the 2026-07-14 park-test source migrations, CDK rollout, regression, and read-only lifecycle dry-run after the snapshot/restore evidence. Source reached migration `0012`; the stack reached 170 resources with restricted roles; the dry-run performed no mutation. The following still require new explicit approval:

- applying the lifecycle plan or any other deletion/anonymization to live data;
- creating a new restore or deleting the retained snapshot;
- changing/promoting any secret or provider credential;
- making Roller writes, enabling webhook processing, sending guest messages, or creating production.

## Non-goals

This issue does not implement booking backfill/morning seed, webhook reconciliation, automatic T-30 SMS/email, sender setup, production, DNS/Cloudflare/CI changes, visible UI redesign, kiosk/terminal/printing, JumpyBoard/AirHive, or any Roller booking/payment/add-on/redeem write.
