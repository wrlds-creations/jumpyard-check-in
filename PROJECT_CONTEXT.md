# Project Context

This file is the living project memory for JumpYard Next. Confirmed durable facts belong here. Historical ticket-by-ticket implementation narrative is archived in [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md). Unknowns remain `TBD`.

## Project Identity

- Project: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- App: JumpYard check-in app suite
- Current phase: `Sprint 2 closed`; Sprint 3 target approved; repository safety-gate correction complete without deployment.

## Current Phase And Scope

Sprint 2 is closed. The complete Sprint 3 plan includes booking ingestion and T-30 messaging. Repository safety gates now fail closed; deployed Nacka park-test remains unchanged through 2026-09-30.

The latest roadmap is [docs/assets/jumpyard-next-sprint-roadmap.pdf](docs/assets/jumpyard-next-sprint-roadmap.pdf), updated 2026-06-11. Here, Sprint 3 covers phone, admin, and their required JumpYard Cloud work. Kiosk/print/terminal and JumpyBoard/AirHive activity data belong to separate project workstreams.

The check-in app suite connects to Roller Playground and park-test Live through a server-side layer. The target production architecture remains:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The API/data contract is in [JUMPYARD_CLOUD_CONTRACT.md](JUMPYARD_CLOUD_CONTRACT.md); forward planning is in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Current Workstream Ownership

- The active Sprint 3 queue covers `jumpyard-checkin-phone`, `jumpyard-checkin-admin`, and their required JumpYard Cloud/API/AWS work. Each ticket requires a plain-language explanation and Love's approval before activation.
- `jumpyard-checkin-kiosk`, including kiosk-owned staff help, print, and terminal work, is a separate project-folder workstream.
- JumpyBoard/AirHive, Bluetooth bands, and activity data belong to the separate Connected Experience workstream. Only explicit interface contracts may cross workstream boundaries.

## Context Archives

- Completed ticket table: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 ticket narrative: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Done followups: [docs/history/followups-done.md](docs/history/followups-done.md)
- Forward roadmap/backlog: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
- Latest Sprint roadmap PDF: [docs/assets/jumpyard-next-sprint-roadmap.pdf](docs/assets/jumpyard-next-sprint-roadmap.pdf)
- Park-test gate naming/runbook: [docs/t0170-park-test-gate-runbook.md](docs/t0170-park-test-gate-runbook.md)
- Sprint 3 phone/admin scope and ticket plan: [docs/t0188-sprint-3-phone-admin-plan.md](docs/t0188-sprint-3-phone-admin-plan.md)
- Complete Sprint 3 target and revised ticket plan: [docs/t0189-complete-sprint-3-target-plan.md](docs/t0189-complete-sprint-3-target-plan.md)

## Durable Architecture Facts

- Frontend apps must not call Roller directly in the real production architecture.
- Roller remains the source of truth for bookings, products, payments, and ticket redemption.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, session status, idempotency, audit events, and guest messaging state.
- The production booking index uses an approved initial backfill, scheduled morning seed, idempotent webhook updates/reconciliation, and live REST confirmation. Roller remains authoritative; Aurora is the operational cache.
- The production guest-message target sends one SMS and one email with a secure JumpYard Cloud check-in link 30 minutes before the selected booking time only after sender, consent, domain, provider, duplicate-suppression, and kill-switch gates pass.
- Check-in is modeled as ticket-level redemption through Roller `POST /redemptions`, not a booking-level flag.
- JumpYard Cloud keeps normalized operational state and Roller ids, not broad raw Roller-owned data.
- Raw payment JWTs are response-only and are not persisted in Aurora or logs.
- AWS dev is the current implementation environment; non-dev/staging/live work requires separate reviewed config and preflight.
- Park-test work is gated by scoped tickets; AWS changes, Live reads/writes, payments, redemptions, webhooks, frontend rehearsal, UI/UX, and visitor traffic require approval.
- Park-test is a separate WRLDS environment in account `376129878018`, region `eu-north-1`, namespace `jumpyard-check-in-park-test`, with server-side Roller Live Nacka access.
- CDK config validation keeps `dev` Playground-only and `park-test` on the reviewed account/region/prefix/Live/data-classification contract.
- `infra/config/park-test.json` is the normal closed config; ticket-specific configs open reviewed gates.
- Park-test AWS resources, Live access, webhook `1465`, frontend/CORS, and smokes are documented in [AWS_RESOURCES.md](AWS_RESOURCES.md) and ticket docs.
- Park-test human gate names are aliases in [docs/t0170-park-test-gate-runbook.md](docs/t0170-park-test-gate-runbook.md); runtime variables stay ticket-numbered until a scoped migration.
- The T0176/T0177 full-flow park-test runtime posture remains intentionally open after T0178-T0180 until Love asks to close it; ticket closeout must not be interpreted as a close-window deploy. The approved Nacka operating-date window now runs from 2026-06-29 through 2026-09-30.
- Park-test phone PWA builds must set `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` to the park-test API, or the app falls back to dev.
- Park-test post-payment new-booking sync is draft-backed and only refreshes a recent local `new_booking` prepayment draft created by JumpYard Cloud.
- Repository safety gates treat emergency stop `true`/missing/invalid as stopped and require both configured and observed venue `50871`; releasing the stop never replaces narrower gates.

## Current Implemented Flow Facts

- Phone booking lookup calls JumpYard Cloud, which uses Aurora-first lookup with Roller-authoritative refresh when local data is missing or unsafe. Park-test lookup accepts booking reference/email/phone, enforces Nacka/date scope, and picks the nearest upcoming same-day start.
- Phone check-in starts or resumes a server-owned check-in session before progressing from a ready booking.
- Guest safety completion marks a JumpYard Cloud session ready for staff and shows a server-owned handoff code/QR.
- Staff/admin handoff uses server-owned staff auth in dev and can list, search, inspect, and staff-confirm redeem ready sessions.
- Buy-entry and existing-booking add-ons use server-owned Roller draft/payment paths; add-ons create a separate linked booking instead of mutating the original.
- Existing-booking add-on availability may be prefetched read-only; it must not create drafts, payments, add-ons, redemptions, or other writes.
- Park-test product validation uses approved Nacka parents plus Roller Live slot availability, not static child ids; display mapping is separate from write gates.
- Park-test PWA drafts request Roller-native confirmation/receipt email with `sendConfirmations=true`; new-booking delivery is proven.
- Ready-for-entry/staff handout UI shows a QR plus entry duration/ticket type; the visible guest fallback is now name-to-staff rather than a displayed handoff code.
- Park-test Apple Pay domain association is live, but processing is paused pending Pabel/Roller/Adyen diagnostics; card remains fallback.
- Park-test T0176 full-flow rehearsal opens Nacka/date-scoped payment, lookup, add-ons, staff auth, and redeem for `2026-06-29` through `2026-09-30` while keeping webhook processing and JumpYard-owned guest sends closed.
- Server-owned product/payment rules cover gift cards, `Klippkort`, SkyRider, water bottle, and ComboDeal; exact mappings and guest rules are preserved in `DECISIONS.md` and completed-ticket history.

## Data And Integration Facts

- Aurora dev stores normalized Roller booking, booking item, ticket, payment, product cache, guest contact, webhook, check-in session, token, SMS/email delivery, and prepayment draft/link state.
- Data API ingestion uses modified-date windows and must be treated as an operational cache/index, not source of truth.
- Booking webhooks are registered in Roller Playground and use the confirmed `x-roller-apikey` header in dev; production webhook auth/signature/IP policy remains open.
- Daily dev Data API sync runs internally from EventBridge to Lambda in planning/operational dev mode; guest messaging uses opaque `jy_token` links resolved server-side.
- Park-test Aurora contains only scoped Live smoke snapshots, not a broad booking import or all-day guest list.
- Same-day indexing remains deferred; park-test lookup uses scoped REST-on-demand paths and add-ons stay separately gated.
- Live webhook processing remains off for the current assisted park-test posture; payment/add-on/redeem confirmation uses scoped REST/direct responses plus Aurora audit/manual fallback.

## Security And Operational Constraints

- Roller Live, production credentials, `.env`, AWS resources/deploys, Aurora migrations, payment package/vendor source, SMS/email sending, and app behavior must not be changed by context-hygiene tickets.
- AWS deploys require reading [AWS_RESOURCES.md](AWS_RESOURCES.md), using `skills/aws-project-infrastructure/`, and confirming account/region/environment/owner/tags/data/cost metadata first.
- Dev guest messaging remains gated by SNS/SES sandbox and sender-readiness constraints; unattended real sends remain disabled until production-readiness gates pass.
- Staff/admin PII is staff-only and must not be exposed in public guest UI or unauthenticated APIs.

## Language Policy

Repository source-of-truth docs are written in English by default. Preserve exact Swedish only for user-facing UX copy, staff/admin labels, product/operational terminology, quoted evidence, and intentionally copied archive history. Do not normalize exact UI strings such as `Betalning`, `Presentkort`, `Klippkort`, `Lämna ut vid incheckning`, `Hämtas efter hoppet`, and `Övrigt i bokningen`.

## Current Readiness Gates

- Production readiness remains partial and should be handled through scoped future tickets, not opportunistic context hygiene.
- The approved Sprint 3 sequence is T0190-T0204 in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). T0190 is complete without deployment; T0191 still needs explanation and approval.
- Main staging/live blockers include production environment config, route auth/WAF or equivalent edge protection, alarm notification routing, SMS/SES production access, sender/domain setup, dev-token replacement, retention policy, deployment rollback, live backfill/cutover, and webhook production verification.
- Payment must stay on Roller's approved package; method visibility is Roller/Adyen controlled.

## Current Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which products must be ticket/session products for API redemption and webhook counters? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | Open |
| What production retention/encryption applies to guest email/phone? | Needed before production data commitments. | `T0195` | Open |
| Should `/data/giftcards` be imported, and in which ticket? | Optional audit/display/reconciliation work should stay separate from payment UI. | `TBD` | Open |
| What production webhook auth/signature/IP policy replaces dev `x-roller-apikey`? | Required before production webhook registration. | `T0197` | Open |
| Should JumpYard Cloud send a real Roller redemption device name? | Roller rejects non-existent device names; dev omits the field. | `TBD` | Open |
| Which staff/admin auth model authorizes final redeem? | T0047 dev staff auth is not final production identity. | `T0194` | Open |
