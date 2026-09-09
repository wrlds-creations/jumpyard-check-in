# Lookup audit permission (#403)

[Approved issue](https://github.com/wrlds-creations/jumpyard-check-in/issues/403).
Love approved the explained correction on 2026-09-09 for handset testing.
The existing September 7 database-error Project draft was converted in place;
its earlier cause has not been independently established.

Branch: `codex/gh-403-lookup-audit-permission`, from current main
`822384309ece85fc95f0e5e951e048c6eca39601`. No unmerged dependency; local #396
work remains untouched in its original checkout. Current main already owns
migration `0022`, so the correction is the new forward migration `0023`.
Before publication, main `01fd179acf35fd4be54986fc97e4323f1e759c17` was merged
without rewriting history. The one context-document conflict retains the current
#345 handset acceptance and this issue's lookup grant; runtime code is unchanged.

## Confirmed incident

Read-only evidence from Nacka pilot AWS `376129878018` / `eu-north-1`, technical
`park-test`, Aurora `jumpyard-check-in-park-test-aurora`, database
`jumpyard_cloud`, on September 9:

| Stockholm time | Observation |
|---|---|
| 11:42:48.104 | Lookup `DbOD2ihdAi0ENEg=` starts; returns HTTP 500 after 5,978 ms. |
| 11:42:51.665 | ROLLER booking detail already returned HTTP 200. |
| 11:42:54.080 | Safe diagnostic `3960ec46-7212-4315-9ae9-7b12ec56a714`: database / DatabaseErrorException. |
| 11:42:54 | Aurora log `error/postgresql.log.2026-09-09-0900`: permission denied for table event_log, on INSERT INTO jumpyard.event_log. |
| 11:42:59.121 | Retry `DbOFki1BAi0ENEg=` returns HTTP 200 in 2,498 ms. |
| 11:43:01.670 | Session creation returns HTTP 201 in 473 ms. |

Approximately 14 seconds elapsed, including #374's five-second failure backoff.
The Lambda cold initialization was 363 ms; it does not account for the retry.
Live read-only inspection as `jumpyard_lookup_runtime` returned INSERT=true and
SELECT(event_id)=false. No guest values, raw SQL parameters, credentials, payment
tokens or raw exception payloads are retained here.

## Cause and bounded correction

Both lookup settlement audit functions use `ON CONFLICT (event_id) DO NOTHING`.
PostgreSQL requires read access to the conflict key. Migration `0011` grants
lookup INSERT but omits that column read. Migration `0016` already supplies the
equivalent narrow grant to webhook. The lookup status update commits before the
failed audit insert, so a retry may skip this audit path; success on retry does
not prove that the first audit record was saved.

Migration `0023_lookup_event_log_conflict_key.sql` grants only
`SELECT (event_id)` on `jumpyard.event_log` to `jumpyard_lookup_runtime`.
Applied migrations are unchanged. There is no application-code change, new
resource, table/column creation, IAM expansion, other-role grant, customer-data
edit, audit backfill, payment change or retry-schedule change. Existing event
payload, subject, summary and other content remain unreadable to lookup.

## Verification

The new test extracts and executes both actual lookup audit functions against
disposable PostgreSQL. It temporarily recreates the missing permission, asserts
the original 42501 failure, applies the migration twice, checks the exact
privilege delta across roles, inserts each event once, retries the same IDs,
and proves event content reads and UPDATE/DELETE remain denied. All synthetic
rows and temporary permission changes run in one rolled-back transaction.

The root validator checks the migration boundary and audit SQL; the existing
PostgreSQL CI job explicitly runs the native tests with all migrations applied.
No new dependency is required.

Local evidence: PostgreSQL 17.11 ran all 23 migrations in a separate cluster on
127.0.0.1:55403. All seven focused tests passed with zero skips; post-test readback
found zero synthetic audit rows. `npm run validate` passed with the native #403
tests enabled. CI YAML parsed and explicitly enables the native regression. All
22 existing migration Git blobs match the base; `git diff --check` passed.
`npm run infra:check` also passed, including TypeScript, least-privilege checks,
configuration gates and synth. The final history-policy and whitespace checks
passed after the documentation update. No handset or live transaction was performed.

Changed files: the new migration, `scripts/validate-gh403-lookup-audit.test.js`,
`package.json`, `.github/workflows/ci.yml`, `PROJECT_CONTEXT.md`, `DECISIONS.md`
(D0163 clarification), `TEST_PLAN.md`, and this evidence note. No application
runtime source, dependency lockfile, `AWS_RESOURCES.md` or
`REPO_CURRENT_STATE.md` changed. The disposable local database was stopped after
verification.

## Publication and acceptance

Love explicitly approved commit and publication on 2026-09-09 after reviewing
the completed correction and validation. The approval covers issue-owned commits,
reviewed PR merge, immutable release, review of each exact plan followed by
delegated protected approval, explicit migration apply and same-artifact public
promotion. Love performs the financial handset test.
The selected artifact must include `0023`; dispatch must explicitly enable
forward migration apply, and its exact plan must precede protected approval.
The existing runner records its normal version/checksum receipt in
`jumpyard.schema_migrations`; no guest or payment rows are edited by the migration.
Scope remains the existing Nacka backend and approved origins; no break-glass
local grant or deployment is allowed.

After promotion, inspect the restricted lookup role's privilege metadata and
EXPLAIN the actual audit inserts without ANALYZE or guest writes. Confirm only
the intended migration was pending and that all previous checksums match.
Application rollback retains the additive column grant and applied migration;
do not reverse it or rebuild a previous release.

Love performs the real phone purchase and measures approval-to-safety readiness.
The correction removes this known failure/retry, but does not guarantee a fixed
latency or solve unrelated provider/network delay. Existing lost audit evidence
is not backfilled by this change. Keep the issue open for rollout and handset
acceptance. No new follow-up Project draft was created.

## Protected rollout — 2026-09-09

[Implementation PR #404](https://github.com/wrlds-creations/jumpyard-check-in/pull/404)
was reviewed at head `d6a2a55631aa9750d1a97e7f9e1bd3bfb8f84b95`; all six CI
jobs passed in [34341392540](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34341392540),
including the explicit native database regression. The implementing agent recorded
its review; no independent human review is claimed. Merge commit:
`bad087f7bda40a640d833744a9987fe32c88f529`.

| Stage | Exact evidence |
|---|---|
| Immutable release | [34341707774](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34341707774), artifact `10100210328`, all 663 checksums verified. |
| Protected Park | [34342369893](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34342369893), successful; `apply_migrations=true`. |
| Protected public | [34342753755](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34342753755), successful; the same immutable artifact was promoted after exact-plan review. |
| Rollback candidate | Previous deployed [34327287544](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34327287544), SHA `971d9013d577db66fa8799bbd9d2db408b98607a`, artifact `10094475142`; unexpired and all 662 checksums verified. |

The actual Park plan was downloaded and matched to an independently read live
CloudFormation template before delegated protected approval. Both template hashes
are `e411cfc2b29802172b5f7f351f5a29fed23244d625788e59059eece5ce81e1a2`:
208 resources, no resource or template-section changes. CDK reported no changes.
All 22 previous migration files match the previous deployed artifact byte for byte;
read-only migration status also checked their live checksums. Only 0023 was pending.
The protected runner applied it at 10:52:02 UTC (12:52:02 Stockholm), recording
its ordinary schema-migration receipt. Afterward all 23 migrations were applied
with matching checksums. No customer, booking or payment content was edited.

Park's required postchecks passed: exact selected/deployed template, successful
stack state, `IN_SYNC` drift, zero active alarms, empty queues, exact-SHA Pages,
HTTP/API configuration and Apple Pay association. The same-artifact public plan
was inspected from completed job `102437138314` before its delegated approval,
after Park success and the independent runtime checks below. It targets only
`checkin.jumpyard.se` and `staff-checkin.jumpyard.se` on the existing approved
Cloudflare projects. No rebuild or local deployment was used. Public checks passed exact-SHA Pages,
custom domains, allowed/blocked CORS, Cognito callbacks, phone/staff HTTP/API
configuration and Apple Pay association. Independent reads returned HTTP 200
and byte-identical artifact HTML on all four Park/public phone/admin origins.
Phone HTML SHA256: `49bb98d84296c4a934c34c791497250aeee31a3b607bef4ecd2a5c0b0e31f025`;
admin: `d84fe72dcf9d5aa0ee4e4c4d5e9c5d4ba7a64da2c8c58be145734ce036d671e2`.

Independent Data API inspection used the actual lookup Lambda's configured
runtime secret, without retrieving or displaying its value. Before/after checks
confirmed `current_user=jumpyard_lookup_runtime`: INSERT remains true;
SELECT(event_id) changed false to true; full-table SELECT, UPDATE, DELETE and
reads of correlation_id, event_type, subject_ref, summary, event_payload and
created_at remain false. Both actual production audit functions produced valid
`EXPLAIN (FORMAT JSON) INSERT ... ON CONFLICT (event_id) DO NOTHING` plans.
There was no ANALYZE and neither insert executed; parameters were synthetic.
This proves deployed permission acceptance, not measured purchase latency.

Account `376129878018`, region `eu-north-1`, existing Nacka stack, complete
WRLDS metadata, 208 resources, 28 routes, venue/date gates and general guest-send
closure remain. Only the approved lookup column grant expands. No resource,
IAM, secret, provider setting, financial transaction, guest message, historical
backfill, rollback or re-promotion was performed. A rollback must retain 0023.

This dependent evidence update also refreshes `AWS_RESOURCES.md` and
`REPO_CURRENT_STATE.md` to the verified merged/deployed facts. The implementation
already updated project context, D0163 and the test plan. Original local #396
work remains untouched. No new Project draft was created. Keep #403 open for
Love's handset test: record its approximate time and payment-to-safety delay,
then correlate any remaining delay without assuming it is this fixed error.

Evidence-only closeout passed history-policy, AWS inventory/tag, static issue
resolver and whitespace validation. Its PR changes only these three documents.
