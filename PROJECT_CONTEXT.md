# Project Context

This file holds confirmed durable facts. The private [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5) owns operations, repository Issues own approved scope, and [Sprint 1 history](docs/history/sprint-1-ticket-history.md) is archived. Unknowns remain `TBD`.

## Project Identity

- Project: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- App: JumpYard check-in app suite
- Current phase: `Sprint 2 closed`; technical `park-test` is Nacka pilot production.

## Current Phase And Scope

The Nacka path is `dev/Playground -> Park verification -> protected public promotion`, using the existing technical `park-test` Live backend. Multi-park topology needs a separate decision; no duplicate pilot backend is planned.

The [2026-06-11 roadmap](docs/assets/jumpyard-next-sprint-roadmap.pdf) covers phone, admin, and required cloud work in Sprint 3. Kiosk/print/terminal and JumpyBoard/AirHive are separate.

The check-in app suite connects to Roller Playground and park-test Live through a server-side layer. The target production architecture remains:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The API/data contract is in [JUMPYARD_CLOUD_CONTRACT.md](JUMPYARD_CLOUD_CONTRACT.md). Project policy, durable guardrails, and external gates are in [docs/roadmap/backlog.md](docs/roadmap/backlog.md); that file is not an operational queue.

## Current Workstream Ownership

- Sprint 3 covers `jumpyard-checkin-phone`, `jumpyard-checkin-admin`, and required Cloud/API/AWS work. Every implementation needs a plain-language explanation, Love's approval, an Issue, and an issue-linked branch/PR.
- Kiosk UI/print/terminal and JumpyBoard/AirHive remain separate workstreams; only approved interface contracts may cross into shared Cloud/API.

## Context Archives

- History: [completed tickets](docs/history/completed-tickets.md), [validation evidence](docs/history/validation-log.md), [Sprint 1 narrative](docs/history/sprint-1-ticket-history.md), and [done followups](docs/history/followups-done.md).
- Planning migration: [Project policy/gates](docs/roadmap/backlog.md) and [legacy-to-Project mapping](docs/history/github-project-migration-2026-07-14.md).
- Current evidence: [roadmap](docs/assets/jumpyard-next-sprint-roadmap.pdf), `docs/t0191-*` through `docs/t0199-*`, and [email sender readiness](docs/t0200-email-sender-readiness.md).

## Durable Architecture Facts

- Frontend apps must not call Roller directly in the real production architecture.
- [Releases](REPO_CURRENT_STATE.md); [contract](config/production-domains.json). Motorola-proven purchase/PIN/redemption preserve venue checks, staff state and item keys.
- Roller remains the source of truth for bookings, products, payments, and ticket redemption.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, session status, idempotency, audit events, and guest messaging state.
- The production booking index uses an approved initial backfill, scheduled morning seed, idempotent webhook updates/reconciliation, and live REST confirmation. Roller remains authoritative; Aurora is the operational cache.
- The Sprint 3 guest-message target is one transactional email with a secure JumpYard Cloud check-in link 30 minutes before the selected booking time, only after sender, consent, domain, provider, duplicate-suppression, and kill-switch gates pass. SMS is deferred outside the Sprint 3 critical path.
- Check-in is modeled as ticket-level redemption through Roller `POST /redemptions`, not a booking-level flag.
- JumpYard Cloud keeps normalized operational state and Roller ids, not broad raw Roller-owned data.
- Raw payment JWTs are response-only and are not persisted in Aurora or logs.
- Kiosk safety/handoff may follow durable terminal approval; redemption requires confirmed ROLLER booking and ticket ids.
- Raw payloads, access tokens, PINs, secrets, and unmasked credentials are prohibited persisted data. Booking/contact state is removed or anonymized 30 days after visit; pseudonymous audit/run metadata at 90 days; expired access rows within 24 hours. Disabled staff lose display PII after 90 days; PIN-pepper changes require versioned security-driven re-enrollment. Non-dev handlers have restricted DB principals; Aurora admin is only for migrations, provisioning, and guarded recovery.
- Dev is retired Playground and its Aurora auto-pauses. The existing Park environment is the sole Live backend and sharp pilot-production environment for Nacka.
- Park work requires an approved Issue and explicit scope. Its technical identity remains `WRLDS:Environment=park-test` in `376129878018`/`eu-north-1`, namespace `jumpyard-check-in-park-test`, with server-side Roller Live Nacka. Pilot production is a business role, not a rename or wider venue authority.
- `infra/config/park-test.json` is the normal closed config; approved Issue-specific configs open reviewed gates.
- Park-test resources and gates are recorded in [AWS_RESOURCES.md](AWS_RESOURCES.md) and [the gate runbook](docs/t0170-park-test-gate-runbook.md); runtime variables stay ticket-numbered until scoped migration.
- The Nacka `50871` full-flow window for `2026-06-29` through `2026-09-30` remains open until Love asks to close it; Issue/PR closeout is not a close-window deploy.
- Park-test phone PWA builds must set `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` to the park-test API, or the app falls back to dev.
- Park-test post-payment sync only refreshes a recent local `new_booking` prepayment draft.
- Deployed gates fail closed, require Nacka `50871` plus allowed dates, and reject invalid request items before side effects. The 27 routes use six IAM, four Cognito JWT, and seventeen Lambda-auth boundaries; shared-IP-safe route limits passed the 120-guest/20-minute and 40-device burst models.
- T0194 gives staff PIN-only login and admins Cognito/TOTP with the approved eight-character upper/lowercase/digit policy. Staff/admin views use the phone style and mobile-safe layout; Cognito remains English/Open Sans.

## Durable Workflow Facts

- Private GitHub Project #5 owns operational fields; drafts require Love's approval before conversion to an Issue.
- AWS billing uses the exact JumpYard pair `WRLDS:Client=JumpYard` and `WRLDS:CostCenter=JumpYard`. Client, Project, Environment, and CostCenter are management-account cost allocation keys; active check-in configs fail closed if the JumpYard cost center differs.
- Approved branches use `codex/gh-<issue-number>-<short-slug>`; reviewed PRs are the only route to `main`.
- Merges to `main` build one immutable Park artifact but deploy nothing. Park and public promotion each require its selected artifact, reviewed plan, and protected approval; rollback never rebuilds. AWS uses scoped OIDC and Cloudflare a protected token.
- New multi-park production infrastructure remains disabled. Local Park CDK/Wrangler deployment is break-glass only under an explicit approved Issue and follow-up.
- `CODEX_TASK.md` is a static resolver. `FOLLOWUPS.md` is policy only; completed followups and migration mapping are historical.
- Legacy ticket IDs are preserved for traceability. GitHub issue `#192` and legacy ticket `T0192` are unrelated and must retain their prefixes.

## Current Implemented Flow Facts

- Lookup is Aurora-first with Roller-authoritative refresh, Nacka/date scope, and nearest same-day selection. Ready bookings start/resume a server session; opaque booking-bound guest proof stays in phone memory and hash-only in Aurora.
- Safety completion produces a server-owned staff handoff; an approved phone purchase enters safety before Roller confirms payment and is reconfirmed at the handoff (D0199/#331). Staff uses personal PINs, transactional session replacement, credential-free audit, and coalesced queue refreshes.
- Buy-entry/add-ons use server-owned Roller paths and approved Nacka products plus Live availability. `COMBO60` maps to Weekday Combo `1242135`/`1242136` and requires its parent in Roller's public catalog; catalog failures retry and frontends never call Roller.
- Live water: `970411`/`970363` (D0195).
- D0196/D0197: compact mobile add-ons use plus/minus, native scroll and Continue validation.
- PWA drafts request Roller-native confirmation/receipt email with `sendConfirmations=true`; new-booking delivery is proven.

## Data And Integration Facts

- Aurora stores normalized booking, item, ticket, payment, product, contact, webhook, session, token, delivery, and draft/link state. Data API windows populate an operational cache, never the source of truth.
- Booking webhooks use `x-roller-apikey`; the Park pilot-production backend validates its secret value. A broader multi-park webhook and credential model remains open.
- Dev schedules are off for Aurora auto-pause; manual operations wake it. Guest messaging resolves opaque `jy_token` links server-side.
- Park-test Live/Nacka index sync runs daily with bounded traffic, 30-day-past/all-future retention, and freshness monitoring. Webhook `1465` feeds durable FIFO intake and a serialized authoritative worker with DLQ/recovery/replay. Critical actions still confirm against Roller. See [T0196](docs/t0196-booking-index-morning-seed.md) and [T0197](docs/t0197-webhook-reconciliation.md).

## Security And Operational Constraints

- Context-hygiene Issues cannot change Roller Live, credentials, `.env`, AWS/deploys, Aurora migrations, payment source, messaging, or app behavior.
- AWS work requires [AWS_RESOURCES.md](AWS_RESOURCES.md), `skills/aws-project-infrastructure/`, and confirmed metadata. Park-test releases follow [the T0198 runbook](docs/t0198-controlled-cicd.md); migrations are explicit and forward-only.
- Guest messaging remains gated. #216 proved one automatic Nacka T-30 email, then disarmed its control. The scheduler exists but the general gate is false. Broader delivery needs an approved time window; #220 changes neither message links nor send authority. Peak remains 3,000/day and 5/minute.
- Staff/admin PII is staff-only and must not be exposed in public guest UI or unauthenticated APIs.
- Phone-local contact recovery uses a 12-hour device-clock expiry, active monotonic cleanup, minute checkpoints, and fail-closed detected rollback before reuse; a fully closed/offline browser cannot execute deletion or prove unobserved real time. Park-test Lambda/API logs and the private raw-payload bucket retain data for 30 days, while Aurora automated backup/PITR remains seven days.
- Aurora lifecycle apply, migration apply, secret mutation, deploy, snapshot, and isolated restore are separate external-write checkpoints. A restored database must reapply lifecycle policy and prove database-backed aggregate evidence before any application attachment or traffic.

## Language Policy

Repository source-of-truth docs are written in English by default. Preserve exact Swedish for user-facing UX copy, staff/admin labels, product terminology, quoted evidence, and intentional archive history.

## Current Readiness Gates

- The [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5) owns readiness. T0195-T0197 are deployed; gated actions remain. [AWS_RESOURCES.md](AWS_RESOURCES.md) holds evidence. #264 approves the pilot role; each promotion still needs protected plan/approval.
- Remaining blockers include lifecycle recovery/apply, alarm routing, integrated rehearsal, messaging-window approval, #264 Park/public rollout evidence, and natural webhook observation.
- Payment must stay on Roller's approved package; method visibility is Roller/Adyen controlled.

## Current Open Questions

Candidate investigations and decisions are maintained in the [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5), not duplicated here. Durable provider-owned questions and current safe boundaries remain under [External Gates](docs/roadmap/backlog.md#external-gates). Neither a Project draft nor an external gate is implementation approval.
