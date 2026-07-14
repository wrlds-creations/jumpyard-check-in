# Repo Current State

Use this file as the short snapshot of what actually exists. Operational work state lives in GitHub, durable facts live in repository documentation, and historical evidence lives in the linked archives.

## Snapshot

- Date: 2026-07-14
- Latest product baseline: `775804f` after merged PR #191 and completed legacy ticket T0194.
- Workflow baseline: GitHub-native collaboration adopted through issue [#192](https://github.com/wrlds-creations/jumpyard-check-in/issues/192); no product or runtime behavior changed.
- Operational planning: private [JumpYard Check-in Project](https://github.com/orgs/wrlds-creations/projects/5), linked only to `wrlds-creations/jumpyard-check-in`; Love confirmed the same repository as the Project's default in GitHub Settings.
- Initial migration state: 29 unique unapproved draft issues plus issue #192, with complete Status, Priority, Work Type, Track, Owner, and exact-once canonical Legacy ID fields.
- Product/runtime state: unchanged by issue #192. T0194's deployed PIN/Cognito identity and T0193's protected API remain the latest application baseline.
- Completed legacy tickets: 192, latest `T0194`. They remain history and were not backfilled into the Project.
- Product approval state: no product implementation Issue is approved. The draft carrying legacy reference T0195 remains unapproved and has no authority until Love approves its explained scope and it is converted to a repository Issue.

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
- The park-test full-flow posture remains scoped to Nacka `50871` and dates `2026-06-29` through `2026-09-30`. It permits the already approved lookup, booking/payment, add-on, staff-auth, and redeem paths while broad imports, Live webhook processing, and JumpYard-owned guest sends remain closed.
- The full-flow window remains open until Love explicitly approves closing it; documentation closeout is not a deployment instruction.
- T0192's fail-closed venue/date/request-item model and T0193's explicit API protection are deployed. Shared-IP-safe route buckets were modeled for 120 guests in 20 minutes and a 40-device two-second burst.
- Guest actions use short-lived booking-bound proof stored hash-only server-side and in phone memory client-side; token query parameters are removed immediately.
- T0194 gives ordinary staff PIN-only login and administrators a separate Cognito/TOTP flow. The deployed backend uses keyed PIN lookup, scrypt verification, hash-only opaque sessions, transactional replacement, named audit, individual invalidation, venue boundaries, and failed-login brakes that do not throttle guest traffic or existing sessions.
- Staff/admin Pages are mobile safe and use the phone font, black copy/icons, and red actions. Queue requests are coalesced by stable session/query so user activity cannot amplify traffic.
- The stack has 154 resources and 26 routes (6 IAM, 4 JWT, 16 Lambda-protected); the latest T0194 closeout recorded 17 alarms OK, clean drift, clean post-deploy diff, and a complete live staff-account lifecycle.
- Aurora still contains only scoped park-test smoke/test state. Approved initial backfill, morning seed, webhook reconciliation, automatic T-30 messaging, production observability, and cutover remain future Project outcomes.

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
- Latest application design/evidence: [docs/t0194-staff-identity.md](docs/t0194-staff-identity.md)

## Validation Baseline

Current workflow and product checks are defined in [TEST_PLAN.md](TEST_PLAN.md). The closeout entrypoints are:

- `npm run validate`
- `npm run infra:check`
- `git diff --check`
- live readback of Project link, fields, item count, field completeness, and legacy-ID coverage

Issue #192 changes documentation, workflow templates, local skills, and validators only. It must not call or mutate AWS, Roller, Aurora, Cloudflare, payment, redeem, SMS, email, or deployed application behavior.

## Current Risks And Boundaries

- The Project's 29 drafts are unapproved planning material, not implementation authorization.
- External provider/approval dependencies remain under [External Gates](docs/roadmap/backlog.md#external-gates) and do not become Issues until actionable scope is approved.
- T0195 must not begin inside issue #192. Its draft must first be explained, approved, converted to a repository Issue, and placed on a fresh issue branch.
- Production stays separate. No production resource, DNS, sender, webhook, data copy, or cutover is authorized by this workflow migration.
- No CI/CD, OIDC, branch protection, ruleset, remote legacy-branch cleanup, deployment, or application behavior change is included in issue #192.
