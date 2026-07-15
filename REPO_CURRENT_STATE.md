# Repo Current State

Use this file as the short snapshot of what actually exists. Operational work state lives in GitHub, durable facts live in repository documentation, and historical evidence lives in the linked archives.

## Snapshot

- Date: 2026-07-15
- Latest merged baseline before the current issue: `df45d4c` after PR #198 merged and closed the approved T0196 booking-index rollout for issue [#197](https://github.com/wrlds-creations/jumpyard-check-in/issues/197).
- Latest deployed product baseline: T0197 durable Roller Live webhook reconciliation on top of the T0196 booking-index baseline, T0195 lifecycle/least-privilege runtime, T0194 staff identity, and T0193 API boundary.
- Operational planning: private [JumpYard Check-in Project](https://github.com/orgs/wrlds-creations/projects/5), linked only to `wrlds-creations/jumpyard-check-in`; Love confirmed the same repository as the Project's default in GitHub Settings.
- Initial migration evidence: 29 unique drafts were migrated with complete Status, Priority, Work Type, Track, Owner, and exact-once canonical Legacy ID fields; current mutable state is read from GitHub rather than copied here.
- Product/runtime state: T0197 is deployed to park-test with migrations through `0016`, 187 stack resources, authenticated fast intake, FIFO queue/DLQ, a serialized worker, five-minute recovery, guarded replay, and seven webhook alarms. T0196 morning sync, T0194 PIN/Cognito identity, and T0193 protected API remain intact.
- Completed legacy ticket after the current PR merges: latest `T0197`. Legacy ticket history was not backfilled into the Project.
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
- Existing park-test is the sole Live-backed pre-production environment. Production remains a separate future environment requiring complete rehearsal, GO, and explicit resource/cutover approval.
- The park-test full-flow posture remains scoped to Nacka `50871` and dates `2026-06-29` through `2026-09-30`. It permits the already approved lookup, booking/payment, add-on, staff-auth, redeem, morning index, and durable booking-webhook paths while JumpYard-owned guest sends remain closed.
- The full-flow window remains open until Love explicitly approves closing it; documentation closeout is not a deployment instruction.
- T0192's fail-closed venue/date/request-item model and T0193's explicit API protection are deployed. Shared-IP-safe route buckets were modeled for 120 guests in 20 minutes and a 40-device two-second burst.
- Guest actions use short-lived booking-bound proof stored hash-only server-side and in phone memory client-side; token query parameters are removed immediately.
- T0194 gives ordinary staff PIN-only login and administrators a separate Cognito/TOTP flow. The deployed backend uses keyed PIN lookup, scrypt verification, hash-only opaque sessions, transactional replacement, named audit, individual invalidation, venue boundaries, and failed-login brakes that do not throttle guest traffic or existing sessions.
- Staff/admin Pages are mobile safe and use the phone font, black copy/icons, and red actions. Queue requests are coalesced by stable session/query so user activity cannot amplify traffic.
- The stack has 187 resources and 26 routes (6 IAM, 4 JWT, 16 Lambda-protected). Six restricted handler database identities plus one lifecycle identity remain deployed. The intake/worker are `Active`, worker concurrency is one, recovery is enabled every five minutes, queue/DLQ are empty, post-deploy CDK diff is clean, and drift is `IN_SYNC`.
- T0196 completed all 53 unique modified-date windows through `2026-07-15`. Aurora contains 6,174 Live/Nacka bookings, 8,921 items, 6,662 tickets, 6,127 payments, and 983 guest profiles; zero bookings are older than 30 days, 92 are for the current date, 120 are future, and future visits extend through `2026-12-30`. Roller remains authoritative and critical writes still refresh/confirm against Roller.
- T0195 migrations `0010`-`0012`, T0196 migrations `0013`-`0014`, and T0197 migrations `0015`-`0016` are deployed to park-test. T0197 grants only child-row DELETE and the event-log conflict-key read needed by the restricted webhook role. The earlier lifecycle dry-run predates the booking-index import; lifecycle apply must be replanned/recounted and remains separately gated.

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
- Latest application design/evidence: [docs/t0197-webhook-reconciliation.md](docs/t0197-webhook-reconciliation.md), [docs/t0196-booking-index-morning-seed.md](docs/t0196-booking-index-morning-seed.md), [docs/t0195-data-lifecycle-policy.md](docs/t0195-data-lifecycle-policy.md), and [docs/t0195-aurora-recovery-rehearsal.md](docs/t0195-aurora-recovery-rehearsal.md)

## Validation Baseline

Current workflow and product checks are defined in [TEST_PLAN.md](TEST_PLAN.md). The closeout entrypoints are:

- `npm run validate`
- `npm run infra:check`
- `git diff --check`
- live readback of Project link, fields, item count, field completeness, and legacy-ID coverage

The approved T0197 rollout passed exact Roller registration readback, negative auth/body tests, authenticated intake, authoritative normalized update, duplicate/out-of-order stability, guarded replay, direct recovery, retry/DLQ contract, migrations through `0016`, 187-resource deploy, aggregate retention checks, clean diff, and zero-drift checks. No natural Roller delivery occurred during the short validation window, so observing the next real booking change remains a bounded manual check. No Roller business write, guest send, lifecycle deletion, secret mutation, Cloudflare, or production change occurred.

## Current Risks And Boundaries

- Project drafts remain unapproved planning material, not implementation authorization.
- External provider/approval dependencies remain under [External Gates](docs/roadmap/backlog.md#external-gates) and do not become Issues until actionable scope is approved.
- Production stays separate. No production resource, DNS, sender, webhook, data copy, or cutover is authorized by this workflow migration.
- T0195 source migration, stack rollout, regression, and lifecycle dry-run are complete. Lifecycle apply, a post-provisioning full restore rehearsal, and eventual snapshot-retention/deletion decision remain separately gated; no temporary restore compute/network cost remains.
