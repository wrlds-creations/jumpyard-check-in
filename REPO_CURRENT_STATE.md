# Repo Current State

Use this file as the short snapshot of what actually exists. Operational work state lives in GitHub, durable facts live in repository documentation, and historical evidence lives in the linked archives.

## Snapshot

- Date: 2026-08-20
- Latest merged product baseline: `57b5140`; PR #283 lets an authoritative fresh ROLLER webhook or lookup attach a late paid kiosk booking and its tickets to the one existing provisional Handoff session by exact external id/payment-attempt identity.
- Latest deployed baseline: release `32362877976` and protected Park run `32363338474` deployed backend `57b5140`; public frontends remain on compatible `96022c8`. CloudFormation is `UPDATE_COMPLETE`/`IN_SYNC`; the combined verifier stopped only on the pre-existing booking-index-stale alarm.
- Operational planning: private [JumpYard Check-in Project](https://github.com/orgs/wrlds-creations/projects/5), linked only to `wrlds-creations/jumpyard-check-in`; Love confirmed the same repository as the Project's default in GitHub Settings.
- Initial migration evidence: 29 unique drafts were migrated with complete Status, Priority, Work Type, Track, Owner, and exact-once canonical Legacy ID fields; current mutable state is read from GitHub rather than copied here.
- Product/runtime state: Park has 202 resources, migrations through `0020`, and 27 routes. Public frontends `96022c8` target backend `57b5140`; purchase, PIN redemption, persistent success, kiosk-created booking redemption, and late kiosk Handoff attachment are Motorola-verified. Phone/Park expose Weekday Combo `1242135`/`1242136`. Handoff refreshes every five seconds and remains fail-closed until authoritative tickets. T-30 and general sends are off.
- Latest legacy baseline: `T0200`; GitHub Issues and the Project now own current implementation state, and legacy ticket history was not backfilled into the Project.
- Product approval and implementation status are read from GitHub Issues and the Project rather than copied into this merged-mainline snapshot.

GitHub issue `#192` and legacy ticket `T0192` are unrelated; preserve both prefixes.

## Operational Source Of Truth

- Project drafts hold unapproved ideas and candidate outcomes.
- Repository Issues hold approved scope, requirements, non-goals, acceptance criteria, dependencies, and validation.
- Project fields hold mutable status, priority, work type, track, and owner.
- Approved work uses one `codex/gh-<issue-number>-<short-slug>` branch and an issue-linked pull request. Work reaches `main` through review/merge, never direct push.
- `CODEX_TASK.md` is a static branch-to-Issue resolver and is not edited per Issue.
- `FOLLOWUPS.md` is policy only. New out-of-scope findings become unapproved Project drafts; durable external gates remain in repository docs.
- `PROJECT_CONTEXT.md`, `DECISIONS.md`, `AWS_RESOURCES.md`, and implementation/history docs preserve confirmed durable facts.

The full working agreement is in `AGENTS.md` and [references/github-collaboration-workflow.md](references/github-collaboration-workflow.md). The one-time reconciliation is in [docs/history/github-project-migration-2026-07-14.md](docs/history/github-project-migration-2026-07-14.md).

## Current Product Baseline

- The production architecture remains `check-in app -> JumpYard Cloud/server API -> Roller API`; Roller is authoritative and Aurora is an operational cache.
- Issue #264 makes technical `park-test` Nacka's sharp pilot backend without changing its AWS/data identity; issue #276's protected public run `32242663090` most recently promoted both public origins. Multi-park remains separate.
- The park-test full-flow posture remains scoped to Nacka `50871` and dates `2026-06-29` through `2026-09-30`. It permits the already approved lookup, booking/payment, add-on, staff-auth, redeem, morning index, and durable booking-webhook paths. The T0201 controlled messaging runtime is deployed, but its single-booking control is disarmed and the general guest-send gate remains closed.
- The full-flow window remains open until Love explicitly approves closing it; documentation closeout is not a deployment instruction.
- T0192's fail-closed venue/date/request-item model and T0193's explicit API protection are deployed. Shared-IP-safe route buckets were modeled for 120 guests in 20 minutes and a 40-device two-second burst.
- Guest actions use short-lived booking-bound proof stored hash-only server-side and in phone memory client-side; token query parameters are removed immediately.
- T0194 gives ordinary staff PIN-only login and administrators a separate Cognito/TOTP flow. The deployed backend uses keyed PIN lookup, scrypt verification, hash-only opaque sessions, transactional replacement, named audit, individual invalidation, venue boundaries, and failed-login brakes that do not throttle guest traffic or existing sessions.
- Staff/admin Pages are mobile safe and use the phone font, black copy/icons, and red actions. Queue requests are coalesced by stable session/query so user activity cannot amplify traffic.
- The 202-resource/27-route stack's deployed `57b5140` template matches the release and is `IN_SYNC`. The protected run stopped after deployment because `jumpyard-check-in-park-test-booking-index-stale` was already in `ALARM`; no alarm was reset or suppressed.
- GitHub-native release `32362877976` and Park run `32363338474` deployed backend `57b5140`; public run `32242663090` remains the latest frontend promotion at `96022c8`. Redeem handles missing venue, preserves staff state and kiosk item keys, and keeps success visible until staff acts. Exact lookup repair changed the affected session from `needs_staff`/zero tickets to `confirmed`/two tickets, and USB Motorola readback showed `Paid`, the correct entry plus SkyRider handout, and enabled `Slutför` without performing redemption.
- T0200/T0201 provide verified DKIM, SES suppression/telemetry, six alarms, and restricted application sending. Three direct proofs plus one automatic proof delivered with zero provider failures; the general gate is false and the T0201 control is disarmed.
- T0196 completed all 53 unique modified-date windows through `2026-07-15`. Aurora contains 6,174 Live/Nacka bookings, 8,921 items, 6,662 tickets, 6,127 payments, and 983 guest profiles; zero bookings are older than 30 days, 92 are for the current date, 120 are future, and future visits extend through `2026-12-30`. Roller remains authoritative and critical writes still refresh/confirm against Roller.
- Migrations `0010`-`0020` are deployed to park-test. `0018` adds safe kiosk payment-attempt state and a partial unique index, `0019` adds bounded reconciliation state and timing, and `0020` adds the least-privilege provisional kiosk handoff state. The earlier lifecycle dry-run predates the booking-index import; lifecycle apply must be replanned/recounted and remains separately gated.

## Durable Documents And History

- Stable project facts: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
- Durable decisions: [DECISIONS.md](DECISIONS.md)
- AWS inventory and rules: [AWS_RESOURCES.md](AWS_RESOURCES.md)
- Project policy, product guardrails, and external gates: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
- Completed ticket archive: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 narrative: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Completed followup archive: [docs/history/followups-done.md](docs/history/followups-done.md)
- GitHub Project migration mapping: [docs/history/github-project-migration-2026-07-14.md](docs/history/github-project-migration-2026-07-14.md)
- Controlled release and rollback evidence: [docs/t0198-controlled-cicd.md](docs/t0198-controlled-cicd.md)
- Email sender rollout and DNS handoff: [docs/t0200-email-sender-readiness.md](docs/t0200-email-sender-readiness.md)
- Latest application design/evidence: [docs/t0197-webhook-reconciliation.md](docs/t0197-webhook-reconciliation.md), [docs/t0196-booking-index-morning-seed.md](docs/t0196-booking-index-morning-seed.md), [docs/t0195-data-lifecycle-policy.md](docs/t0195-data-lifecycle-policy.md), and [docs/t0195-aurora-recovery-rehearsal.md](docs/t0195-aurora-recovery-rehearsal.md)

## Validation Baseline

Current workflow and product checks are defined in [TEST_PLAN.md](TEST_PLAN.md). The closeout entrypoints are:

- `npm run validate`
- `npm run infra:check`
- `git diff --check`
- live readback of Project link, fields, item count, field completeness, and legacy-ID coverage

The approved T0197 rollout passed exact Roller registration readback, negative auth/body tests, authenticated intake, authoritative normalized update, duplicate/out-of-order stability, guarded replay, direct recovery, retry/DLQ contract, migrations through `0016`, 187-resource deploy, aggregate retention checks, clean diff, and zero-drift checks. No natural Roller delivery occurred during the short validation window, so observing the next real booking change remains a bounded manual check. No Roller business write, guest send, lifecycle deletion, secret mutation, Cloudflare, or production change occurred.

The T0198 rehearsal built final commit `bdd2d25` once, promoted it, rolled back to the immutable `020a84c` artifact, and re-promoted `bdd2d25`. The final run passed exact AWS account/stack/template checks, `IN_SYNC` drift, zero alarms, empty queues, migrations through `0016`, Cloudflare commit readback for both fixed Pages projects, and public HTTP/config checks. Required PR checks and protected-environment approval remain enforced; routine local park-test deployment is disabled by policy except for separately approved break-glass recovery.

The T0200 rollout built `f74239e` once in release run `29568860560` and promoted it through protected run `29569173836`. The exact live plan added nine resources and removed none. Post-deploy verification passed with 196 resources, identical selected/deployed templates, `IN_SYNC` drift, zero alarms in `ALARM`, empty queues, migrations complete through `0016`, and exact Cloudflare commit readback. The later explicitly approved controlled proof delivered three messages with zero provider failure events and restored configuration-set sending to false; no application send gate or SES send IAM permission was opened.

Issue #212's first promotion applied `0017` and the retry alarm but exposed API Gateway ARN normalization in final drift verification. PR #214 corrected it; release `30765157585` re-promoted as run `30765356271` with only `DefaultStage` changed and all AWS, Cloudflare, migration, queue, alarm, drift, and public checks green. The two failed rows, five classified DLQ messages, and a new safe signal all processed. No rollback, Roller business write, guest send, secret output, broad purge, or production change occurred.

## Current Risks And Boundaries

- Project drafts remain unapproved planning material, not implementation authorization.
- External provider/approval dependencies remain under [External Gates](docs/roadmap/backlog.md#external-gates) and do not become Issues until actionable scope is approved.
- No new production stack, backend rename, data copy, kiosk change, or multi-park cutover is authorized. #264 is live; iPhone, credentialed admin, rollback/re-promotion, and dev-project deletion evidence remain.
- T0195 source migration, stack rollout, regression, and lifecycle dry-run are complete. Lifecycle apply, a post-provisioning full restore rehearsal, and eventual snapshot-retention/deletion decision remain separately gated; no temporary restore compute/network cost remains.
