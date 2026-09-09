# Lookup audit permission (#403)

[Approved issue](https://github.com/wrlds-creations/jumpyard-check-in/issues/403).
Love approved the explained correction on 2026-09-09 for handset testing.
The existing September 7 database-error Project draft was converted in place;
its earlier cause has not been independently established.

Branch: `codex/gh-403-lookup-audit-permission`, from current main
`822384309ece85fc95f0e5e951e048c6eca39601`. No unmerged dependency; local #396
work remains untouched in its original checkout. Current main already owns
migration `0022`, so the correction is the new forward migration `0023`.

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
