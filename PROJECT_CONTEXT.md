# Project Context

This is the living project memory for confirmed durable facts. Operational planning lives in the private [JumpYard Check-in GitHub Project](https://github.com/orgs/wrlds-creations/projects/5), while approved scope lives in repository Issues. Ticket history is archived in [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md). Unknowns remain `TBD`.

## Project Identity

- Project: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- App: JumpYard check-in app suite
- Current phase: `Sprint 2 closed`; Sprint 3 uses the existing park-test foundation as pre-production.

## Current Phase And Scope

Sprint 2 is closed. The path is `dev/Playground -> park-test/Live pre-production -> separate production after GO`; no parallel staging stack is planned. Approved Sprint 3/4 maintenance windows may use park-test for ingestion and T-30 messaging rehearsals.

The [latest roadmap](docs/assets/jumpyard-next-sprint-roadmap.pdf) is dated 2026-06-11. Sprint 3 covers phone, admin, and required cloud work; kiosk/print/terminal and JumpyBoard/AirHive belong to separate workstreams.

The check-in app suite connects to Roller Playground and park-test Live through a server-side layer. The target production architecture remains:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The API/data contract is in [JUMPYARD_CLOUD_CONTRACT.md](JUMPYARD_CLOUD_CONTRACT.md). Project policy, durable guardrails, and external gates are in [docs/roadmap/backlog.md](docs/roadmap/backlog.md); that file is not an operational queue.

## Current Workstream Ownership

- The Sprint 3 Project covers `jumpyard-checkin-phone`, `jumpyard-checkin-admin`, and their required JumpYard Cloud/API/AWS work. Drafts are unapproved; each implementation requires a plain-language explanation, Love's approval, a repository Issue, and an issue-linked branch/PR.
- `jumpyard-checkin-kiosk`, including kiosk-owned staff help, print, and terminal work, is a separate project-folder workstream.
- JumpyBoard/AirHive, Bluetooth bands, and activity data belong to the separate Connected Experience workstream. Only explicit interface contracts may cross workstream boundaries.

## Context Archives

- History: [completed tickets](docs/history/completed-tickets.md), [validation evidence](docs/history/validation-log.md), [Sprint 1 narrative](docs/history/sprint-1-ticket-history.md), and [done followups](docs/history/followups-done.md).
- Planning migration: [Project policy/gates](docs/roadmap/backlog.md) and [legacy-to-Project mapping](docs/history/github-project-migration-2026-07-14.md).
- Current evidence: [Sprint roadmap](docs/assets/jumpyard-next-sprint-roadmap.pdf) and the T0191-T0195 [environment](docs/t0191-park-test-preproduction-contract.md), [foundation](docs/t0192-park-test-foundation-qualification.md), [API](docs/t0193-api-protection.md), [identity](docs/t0194-staff-identity.md), and [lifecycle](docs/t0195-data-lifecycle-policy.md) records.

## Durable Architecture Facts

- Frontend apps must not call Roller directly in the real production architecture.
- Roller remains the source of truth for bookings, products, payments, and ticket redemption.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, session status, idempotency, audit events, and guest messaging state.
- The production booking index uses an approved initial backfill, scheduled morning seed, idempotent webhook updates/reconciliation, and live REST confirmation. Roller remains authoritative; Aurora is the operational cache.
- The production guest-message target sends one SMS and one email with a secure JumpYard Cloud check-in link 30 minutes before the selected booking time only after sender, consent, domain, provider, duplicate-suppression, and kill-switch gates pass.
- Check-in is modeled as ticket-level redemption through Roller `POST /redemptions`, not a booking-level flag.
- JumpYard Cloud keeps normalized operational state and Roller ids, not broad raw Roller-owned data.
- Raw payment JWTs are response-only and are not persisted in Aurora or logs.
- Raw payloads, access tokens, PINs, secrets, and unmasked credentials are prohibited persisted data. Booking/contact state is removed or anonymized 30 days after visit; pseudonymous audit/run metadata at 90 days; expired access rows within 24 hours. Disabled staff lose display PII after 90 days; PIN-pepper changes require versioned security-driven re-enrollment. Non-dev handlers have restricted DB principals; Aurora admin is only for migrations, provisioning, and guarded recovery.
- Dev is Playground. Existing park-test is the sole Live-backed pre-production environment for T0194-T0204; production is separate and requires T0204 GO plus new approval.
- Park-test work is gated by approved repository Issues; AWS changes, Live reads/writes, payments, redemptions, webhooks, frontend rehearsal, UI/UX, and visitor traffic require explicit scope and approval.
- Park-test is a separate WRLDS environment in account `376129878018`, region `eu-north-1`, namespace `jumpyard-check-in-park-test`, with server-side Roller Live Nacka access.
- Park-test keeps its name, prefix, tags, data, and frontend targets; it is neither cloned nor reused as production.
- `infra/config/park-test.json` is the normal closed config; approved Issue-specific configs open reviewed gates.
- Park-test resources and gates are recorded in [AWS_RESOURCES.md](AWS_RESOURCES.md) and [the gate runbook](docs/t0170-park-test-gate-runbook.md); runtime variables stay ticket-numbered until scoped migration.
- The Nacka `50871` full-flow window for `2026-06-29` through `2026-09-30` remains open until Love asks to close it; Issue/PR closeout is not a close-window deploy.
- Park-test phone PWA builds must set `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` to the park-test API, or the app falls back to dev.
- Park-test post-payment sync only refreshes a recent local `new_booking` prepayment draft.
- Deployed gates fail closed, require Nacka `50871` plus allowed dates, and reject invalid request items before side effects. The 26 routes use six IAM, four Cognito JWT, and sixteen Lambda-auth boundaries; shared-IP-safe route limits passed the 120-guest/20-minute and 40-device burst models.
- T0194 gives staff PIN-only login and admins Cognito/TOTP with the approved eight-character upper/lowercase/digit policy. Staff/admin views use the phone style and mobile-safe layout; Cognito remains English/Open Sans.

## Durable Workflow Facts

- Private GitHub Project #5, linked to and defaulting issue creation to `wrlds-creations/jumpyard-check-in`, is the only operational source of truth for status, priority, work type, track, and owner.
- Unapproved work remains a Project draft. Love's approval is required before conversion to a repository Issue; an Issue is required before implementation.
- Approved branches use `codex/gh-<issue-number>-<short-slug>` and pull requests close their Issue. Work reaches `main` through review/merge, never by direct push.
- `CODEX_TASK.md` is a static resolver, not a mutable ticket ledger. `FOLLOWUPS.md` is policy only; completed legacy followups and the one-time mapping remain historical evidence.
- Legacy ticket IDs are preserved for traceability. GitHub issue `#192` and legacy ticket `T0192` are unrelated and must retain their prefixes.

## Current Implemented Flow Facts

- Lookup is Aurora-first with Roller-authoritative refresh, Nacka/date scope, and nearest same-day selection. Ready bookings start/resume a server session; opaque booking-bound guest proof stays in phone memory and hash-only in Aurora.
- Safety completion produces a server-owned staff handoff. Staff uses personal PINs, transactional session replacement, credential-free audit, and coalesced queue refreshes.
- Buy-entry/add-ons use server-owned Roller draft/payment paths; add-ons create linked bookings. Product writes use approved Nacka parents plus Live slot availability, while display mapping remains separate.
- PWA drafts request Roller-native confirmation/receipt email with `sendConfirmations=true`; new-booking delivery is proven.

## Data And Integration Facts

- Aurora stores normalized booking, item, ticket, payment, product, contact, webhook, session, token, delivery, and draft/link state. Data API windows populate an operational cache, never the source of truth.
- Booking webhooks are registered in Roller Playground and use the confirmed `x-roller-apikey` header in dev; production webhook auth/signature/IP policy remains open.
- Daily dev Data API sync runs internally; guest messaging uses opaque `jy_token` links resolved server-side.
- Park-test daily sync is disabled; T0196 owns Live backfill/morning seed. Aurora contains scoped smoke snapshots only; lookup stays REST-on-demand, add-ons separately gated, and Live webhook processing off. Payment/add-on/redeem confirmation uses scoped responses plus Aurora audit/manual fallback.

## Security And Operational Constraints

- Roller Live, production credentials, `.env`, AWS resources/deploys, Aurora migrations, payment package/vendor source, SMS/email sending, and app behavior must not be changed by context-hygiene Issues.
- AWS deploys require reading [AWS_RESOURCES.md](AWS_RESOURCES.md), using `skills/aws-project-infrastructure/`, and confirming account/region/environment/owner/tags/data/cost metadata first.
- Dev guest messaging remains gated by SNS/SES sandbox and sender-readiness constraints; unattended real sends remain disabled until production-readiness gates pass.
- Staff/admin PII is staff-only and must not be exposed in public guest UI or unauthenticated APIs.
- Phone-local contact recovery uses a 12-hour device-clock expiry, active monotonic cleanup, minute checkpoints, and fail-closed detected rollback before reuse; a fully closed/offline browser cannot execute deletion or prove unobserved real time. Park-test Lambda/API logs and the private raw-payload bucket retain data for 30 days, while Aurora automated backup/PITR remains seven days.
- Aurora lifecycle apply, migration apply, secret mutation, deploy, snapshot, and isolated restore are separate external-write checkpoints. A restored database must reapply lifecycle policy and prove database-backed aggregate evidence before any application attachment or traffic.

## Language Policy

Repository source-of-truth docs are written in English by default. Preserve exact Swedish for user-facing UX copy, staff/admin labels, product terminology, quoted evidence, and intentional archive history.

## Current Readiness Gates

- Sprint/production-readiness outcomes remain in the [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5), with legacy T0196-T0205 retained. T0195 migrations and least-privilege runtime are deployed; lifecycle apply, complete restore proof, snapshot deletion, and secret changes remain gated. [AWS_RESOURCES.md](AWS_RESOURCES.md) holds the evidence. T0192 qualified park-test, while T0204 still decides GO/NO-GO before separately approved production.
- Remaining blockers include lifecycle apply/recovery proof, alarm routing, sender setup, Live backfill/cutover, and webhook verification.
- Payment must stay on Roller's approved package; method visibility is Roller/Adyen controlled.

## Current Open Questions

Candidate investigations and decisions are maintained in the [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5), not duplicated here. Durable provider-owned questions and current safe boundaries remain under [External Gates](docs/roadmap/backlog.md#external-gates). Neither a Project draft nor an external gate is implementation approval.
