# Repo Current State

Use this file as the short snapshot of what actually exists. Operational work state lives in GitHub, durable facts live in repository documentation, and historical evidence lives in the linked archives.

## Snapshot

- Date: 2026-09-24
- Backend/Park/public: `a03e191`, immutable release `35881871355`, protected Park `35970858632` and public `35975609844`. [#437 email opt-in](docs/gh-437-phone-email-marketing.md#rollout-evidence): the switch appears when the email field opens and a checked choice travels with the ROLLER draft (D0225). [#409 restoration](docs/gh409-no-phone-contact.md#protected-restoration-rollout--2026-09-23) requires entered phone and creates drafts without the additional customer match or automatic placeholder; only existing Booking Lambda code changes. Kiosk #100 publishes matching source `18cfda1` as `fd9b4b40`. [#432 completion](docs/gh432-phone-completion.md#protected-rollout--2026-09-22), [#426 transitions](docs/gh426-flow-rollout.md#follow-up-publication--2026-09-18) and [#421 quote reuse](docs/gh421-quote-reuse-rollout.md) remain. [#327](docs/gh-327-kiosk-terminal-binding.md): V210/P400 paid; Kiosk 2 active. #343 SV/EN video; #403 lookup grant; #345 handout/daily codes/early café; APK accepted (#401). #353 Klarna; #340 diagnostics; #335 alarms; #374 Apple Pay.
- Operations: private [Project](https://github.com/orgs/wrlds-creations/projects/5), shared across all four JumpYard repositories; each new item names its exact Target repository.
- Runtime: Park has 208 resources, migrations through `0023`, and 28 routes. Daily sync, cached prices, purchase, linked add-on Handoff, PIN/kiosk redemption and late Handoff attachment are proven. Definitive kiosk payment approval returns its provisional session and bounded `safety` hint before ROLLER readback; redemption still requires authoritative synchronization. Physical proof: kiosk #61. Phone/Park expose Weekday Combo `1242135`/`1242136`; guest sends are off.
- Latest legacy baseline: `T0200`; GitHub Issues and the Project now own current implementation state, and legacy ticket history was not backfilled into the Project.
- Product approval and implementation status live in GitHub Issues and the Project; current mutable state is read from GitHub rather than copied here.

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

- Ready phone completion uses the approved kiosk red hero/number and shadowed, enlargeable session QR; completed/missing/kiosk fallbacks and safe reset stay intact. [#432 evidence](docs/gh432-phone-completion.md).
- Phone/kiosk contact requires name, email and an entered phone, with an empty initial phone field and the kiosk numeric keyboard restored. New/unindexed emails no longer require our extra customer match. ROLLER retains ordinary email matching/contact updates; a different entered number can update an existing guest. Public phone lookup remains disabled and placeholder SMS/ingestion guards remain. Existing payments preserve their identity; open no-phone clients need reload. A supported no-phone/non-overwriting provider contract and physical/live purchase acceptance remain open ([#409](docs/gh409-no-phone-contact.md)).

- Phone prepares safety before receipt (#374/D0209); #331 and #330/D0208 preserved. SV/EN video: #343/D0210/D0219.
- Catalog refresh precedes booking reads; public failure omits Combo (#339/#341).
- The production architecture remains `check-in app -> JumpYard Cloud/server API -> Roller API`; Roller is authoritative and Aurora is an operational cache.
- Water selection, unchanged 24-hour cache and historical-payment compatibility: [#315 evidence](docs/gh-315-water-product.md).
- Compact phone add-ons retain #324 Continue. Approved payment enters safety before Roller confirms, with a paid check at handoff (#331/D0199). Purchase-bound recovery (#351/D0201) adds proven pre-submit wallet retry and guarded completed-booking exits (#361/D0203/D0206); [evidence](docs/gh361-phone-wallet-recovery.md). Tiny top-right SV/EN control, both languages only on start screens (#350/D0205).
- Issue #264 makes technical `park-test` Nacka's sharp pilot backend without changing its AWS/data identity. The latest protected public promotion is recorded in the snapshot above. Multi-park remains separate.
- The park-test full-flow posture remains scoped to Nacka `50871` and dates `2026-06-29` through `2026-09-30`. It permits the already approved lookup, booking/payment, add-on, staff-auth, redeem, morning index, and durable booking-webhook paths. The T0201 controlled messaging runtime is deployed, but its single-booking control is disarmed and the general guest-send gate remains closed.
- The full-flow window remains open until Love explicitly approves closing it; documentation closeout is not a deployment instruction.
- T0192's fail-closed venue/date/request-item model and T0193's explicit API protection are deployed. Shared-IP-safe route buckets were modeled for 120 guests in 20 minutes and a 40-device two-second burst.
- Guest actions use short-lived booking-bound proof stored hash-only server-side and in phone memory client-side; token query parameters are removed immediately.
- T0194 gives ordinary staff PIN-only login and administrators a separate Cognito/TOTP flow. The deployed backend uses keyed PIN lookup, scrypt verification, hash-only opaque sessions, transactional replacement, named audit, individual invalidation, venue boundaries, and failed-login brakes that do not throttle guest traffic or existing sessions.
- Staff/admin Pages are mobile safe with the phone font and red actions. Queue and PIN heartbeat requests are coalesced; #334 retries transient heartbeat failures without extending session deadlines (D0200).
- The earlier `a150767` resume rollout passed template equality, `IN_SYNC` drift, alarms, queues and migrations through `0020` in Park run `32738465477`; public run `32738931583` promoted that phone output. The current backend release is recorded in the snapshot above.
- GitHub-native release `32372219796` and Park run `32372746116` deployed the existing-booking kiosk terminal add-on contract. Kiosk drafts resolve the terminal alias server-side, return a fresh card-present attempt identity, and finalize/status the add-product operation without a second guest check-in or Handoff session. Phone/Park keep ecommerce behavior. A safe negative public probe reached the new route contract and failed before provider mutation as expected; supervised physical payment proof remains open on issue #285.
- T0200/T0201 provide verified DKIM, SES suppression/telemetry, six alarms, and restricted application sending. Three direct proofs plus one automatic proof delivered with zero provider failures; the general gate is false and the T0201 control is disarmed.
- T0196 completed all 53 unique modified-date windows through `2026-07-15`. Aurora contains 6,174 Live/Nacka bookings, 8,921 items, 6,662 tickets, 6,127 payments, and 983 guest profiles; zero bookings are older than 30 days, 92 are for the current date, 120 are future, and future visits extend through `2026-12-30`. Roller remains authoritative and critical writes still refresh/confirm against Roller.
- Park migrations through `0023` are deployed. `0018`: kiosk payment attempts/partial unique index; `0019`: bounded reconciliation/timing; `0020`: restricted provisional kiosk handoff; `0021`: retained counters, ownership/receipts; `0022`: ready café before admission. Lifecycle dry-run predates the booking-index import; apply requires replanning/recounting and separate approval.

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

Use TEST_PLAN.md for current checks. [#409 restoration evidence](docs/gh409-no-phone-contact.md#protected-restoration-rollout--2026-09-23) records required CI (including native PostgreSQL), immutable-artifact checks, protected deployment and independent runtime/static verification. Prior dated release/run evidence remains in [the pre-upgrade snapshot](docs/history/workflow-0.2-baseline/REPO_CURRENT_STATE.md#validation-baseline).

## Current Risks And Boundaries

- Project drafts remain unapproved planning material, not implementation authorization.
- External provider/approval dependencies remain under [External Gates](docs/roadmap/backlog.md#external-gates) and do not become Issues until actionable scope is approved.
- No new production stack, backend rename, data copy, kiosk change, or multi-park cutover is authorized. #264 is live; iPhone, credentialed admin, rollback/re-promotion, and dev-project deletion evidence remain.
- T0195 source migration, stack rollout, regression, and lifecycle dry-run are complete. Lifecycle apply, a post-provisioning full restore rehearsal, and eventual snapshot-retention/deletion decision remain separately gated; no temporary restore compute/network cost remains.
