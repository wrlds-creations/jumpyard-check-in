# Project Context

This is the living project memory for confirmed durable facts. Operational planning lives in the private [JumpYard Check-in GitHub Project](https://github.com/orgs/wrlds-creations/projects/5), while approved scope lives in repository Issues. Ticket history is archived in [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md). Unknowns remain `TBD`.

## Project Identity

- Project: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- App: JumpYard check-in app suite
- Current phase: `Sprint 2 closed`; Sprint 3 uses the existing park-test foundation as pre-production.

## Current Phase And Scope

Sprint 2 is closed. The path is `dev/Playground -> existing park-test/Live pre-production -> separate production after GO`; no parallel staging stack is planned. JumpYard staff and guests do not require uninterrupted access to park-test during Sprints 3 or 4, so WRLDS may use approved maintenance windows while building and rehearsing the booking-ingestion and T-30 messaging chain there.

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
- Current evidence: [Sprint roadmap](docs/assets/jumpyard-next-sprint-roadmap.pdf), [environment contract](docs/t0191-park-test-preproduction-contract.md), [foundation qualification](docs/t0192-park-test-foundation-qualification.md), [API protection](docs/t0193-api-protection.md), and [staff identity](docs/t0194-staff-identity.md).

## Durable Architecture Facts

- Frontend apps must not call Roller directly in the real production architecture.
- Roller remains the source of truth for bookings, products, payments, and ticket redemption.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, session status, idempotency, audit events, and guest messaging state.
- The production booking index uses an approved initial backfill, scheduled morning seed, idempotent webhook updates/reconciliation, and live REST confirmation. Roller remains authoritative; Aurora is the operational cache.
- The production guest-message target sends one SMS and one email with a secure JumpYard Cloud check-in link 30 minutes before the selected booking time only after sender, consent, domain, provider, duplicate-suppression, and kill-switch gates pass.
- Check-in is modeled as ticket-level redemption through Roller `POST /redemptions`, not a booking-level flag.
- JumpYard Cloud keeps normalized operational state and Roller ids, not broad raw Roller-owned data.
- Raw payment JWTs are response-only and are not persisted in Aurora or logs.
- Dev is Playground. Existing park-test is the sole Live-backed pre-production environment for T0194-T0204; production is separate and requires T0204 GO plus new approval.
- Park-test work is gated by approved repository Issues; AWS changes, Live reads/writes, payments, redemptions, webhooks, frontend rehearsal, UI/UX, and visitor traffic require explicit scope and approval.
- Park-test is a separate WRLDS environment in account `376129878018`, region `eu-north-1`, namespace `jumpyard-check-in-park-test`, with server-side Roller Live Nacka access.
- Park-test keeps its name, prefix, tags, data, and frontend targets; it is neither cloned nor reused as production.
- `infra/config/park-test.json` is the normal closed config; approved Issue-specific configs open reviewed gates.
- Park-test resources and gates are recorded in [AWS_RESOURCES.md](AWS_RESOURCES.md) and [the gate runbook](docs/t0170-park-test-gate-runbook.md); runtime variables stay ticket-numbered until scoped migration.
- The Nacka `50871` full-flow window for `2026-06-29` through `2026-09-30` remains open until Love asks to close it; Issue/PR closeout is not a close-window deploy.
- Park-test phone PWA builds must set `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` to the park-test API, or the app falls back to dev.
- Park-test post-payment sync only refreshes a recent local `new_booking` prepayment draft.
- Deployed gates stop on emergency value `true`/missing/invalid, require configured plus observed venue `50871`, and reject any request item outside the date allowlist before side effects.
- The deployed API has 26 explicit routes: six internal/legacy `AWS_IAM`, four Cognito `JWT`, and sixteen Lambda-protected `NONE` routes.
- Protection is aggregate per route rather than per IP and passed 120 guests/20 minutes plus a 40-device two-second burst behind shared park Wi-Fi with no modeled false `429`.
- T0194 gives staff PIN-only login and administrators Cognito/TOTP. Park-test admin passwords now allow eight characters with upper/lowercase and a digit; symbols are optional.
- Staff/admin views share the phone font, black copy/icons, red actions, and mobile-safe layout. Cognito stays English/Open Sans; custom fonts/Swedish are unsupported.

## Durable Workflow Facts

- Private GitHub Project #5, linked to and defaulting issue creation to `wrlds-creations/jumpyard-check-in`, is the only operational source of truth for status, priority, work type, track, and owner.
- Unapproved work remains a Project draft. Love's approval is required before conversion to a repository Issue; an Issue is required before implementation.
- Approved branches use `codex/gh-<issue-number>-<short-slug>` and pull requests close their Issue. Work reaches `main` through review/merge, never by direct push.
- `CODEX_TASK.md` is a static resolver, not a mutable ticket ledger. `FOLLOWUPS.md` is policy only; completed legacy followups and the one-time mapping remain historical evidence.
- Legacy ticket IDs are preserved for traceability. GitHub issue `#192` and legacy ticket `T0192` are unrelated and must retain their prefixes.

## Current Implemented Flow Facts

- Phone lookup uses Aurora first and Roller-authoritative refresh when needed. Park-test accepts reference/email/phone, enforces Nacka/date scope, and picks the nearest same-day start.
- Phone check-in starts or resumes a server-owned check-in session before progressing from a ready booking.
- Scoped lookup/link resolution provides a booking-bound opaque guest credential held only in phone memory; Aurora stores only its hash, and protected session/add-on actions require it.
- Guest safety completion marks a JumpYard Cloud session ready for staff and shows a server-owned handoff code/QR.
- Park-test staff uses personal PINs, transactional session replacement, lifecycle controls, credential-free audit, and coalesced queue refreshes.
- Buy-entry and existing-booking add-ons use server-owned Roller draft/payment paths; add-ons create a separate linked booking instead of mutating the original.
- Park-test product validation uses approved Nacka parents plus Roller Live slot availability, not static child ids; display mapping is separate from write gates.
- Park-test PWA drafts request Roller-native confirmation/receipt email with `sendConfirmations=true`; new-booking delivery is proven.

## Data And Integration Facts

- Aurora dev stores normalized Roller booking, booking item, ticket, payment, product cache, guest contact, webhook, check-in session, token, SMS/email delivery, and prepayment draft/link state.
- Data API ingestion uses modified-date windows and must be treated as an operational cache/index, not source of truth.
- Booking webhooks are registered in Roller Playground and use the confirmed `x-roller-apikey` header in dev; production webhook auth/signature/IP policy remains open.
- Daily dev Data API sync runs internally; guest messaging uses opaque `jy_token` links resolved server-side.
- Park-test daily Data API sync is disabled; T0196 owns approved Live backfill and morning seed.
- Park-test Aurora contains only scoped Live smoke snapshots, not a broad booking import or all-day guest list.
- Same-day indexing remains deferred; park-test lookup uses scoped REST-on-demand paths and add-ons stay separately gated.
- Live webhook processing remains off for the current assisted park-test posture; payment/add-on/redeem confirmation uses scoped REST/direct responses plus Aurora audit/manual fallback.

## Security And Operational Constraints

- Roller Live, production credentials, `.env`, AWS resources/deploys, Aurora migrations, payment package/vendor source, SMS/email sending, and app behavior must not be changed by context-hygiene Issues.
- AWS deploys require reading [AWS_RESOURCES.md](AWS_RESOURCES.md), using `skills/aws-project-infrastructure/`, and confirming account/region/environment/owner/tags/data/cost metadata first.
- Dev guest messaging remains gated by SNS/SES sandbox and sender-readiness constraints; unattended real sends remain disabled until production-readiness gates pass.
- Staff/admin PII is staff-only and must not be exposed in public guest UI or unauthenticated APIs.

## Language Policy

Repository source-of-truth docs are written in English by default. Preserve exact Swedish for user-facing UX copy, staff/admin labels, product terminology, quoted evidence, and intentional archive history.

## Current Readiness Gates

- The remaining Sprint/production-readiness outcomes are unapproved drafts in the [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5), with legacy T0195-T0205 references retained for traceability. T0192 has qualified park-test; the future complete-rehearsal outcome decides GO/NO-GO before any separately approved production creation/cutover.
- Remaining blockers include alarm routing, sender access/setup, retention, rollback, Live backfill/cutover, and webhook verification.
- Payment must stay on Roller's approved package; method visibility is Roller/Adyen controlled.

## Current Open Questions

Candidate investigations and decisions are maintained in the [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5), not duplicated here. Durable provider-owned questions and current safe boundaries remain under [External Gates](docs/roadmap/backlog.md#external-gates). Neither a Project draft nor an external gate is implementation approval.
