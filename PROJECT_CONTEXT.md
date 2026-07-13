# Project Context

This is the living project memory for confirmed durable facts. Ticket history is archived in [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md). Unknowns remain `TBD`.

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
- Sprint 3 environment contract: [docs/t0191-park-test-preproduction-contract.md](docs/t0191-park-test-preproduction-contract.md)
- Park-test foundation qualification: [docs/t0192-park-test-foundation-qualification.md](docs/t0192-park-test-foundation-qualification.md)
- Park-test API protection: [docs/t0193-api-protection.md](docs/t0193-api-protection.md)

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
- Park-test work is gated by scoped tickets; AWS changes, Live reads/writes, payments, redemptions, webhooks, frontend rehearsal, UI/UX, and visitor traffic require approval.
- Park-test is a separate WRLDS environment in account `376129878018`, region `eu-north-1`, namespace `jumpyard-check-in-park-test`, with server-side Roller Live Nacka access.
- Park-test keeps its name, prefix, tags, data, and frontend targets; it is neither cloned nor reused as production.
- CDK config validation keeps `dev` Playground-only and `park-test` on the reviewed account/region/prefix/Live/data-classification contract.
- `infra/config/park-test.json` is the normal closed config; ticket-specific configs open reviewed gates.
- Park-test resources, Live access, webhook `1465`, frontend/CORS, and smokes are in [AWS_RESOURCES.md](AWS_RESOURCES.md).
- Park-test human gate names are aliases in [docs/t0170-park-test-gate-runbook.md](docs/t0170-park-test-gate-runbook.md); runtime variables stay ticket-numbered until a scoped migration.
- The Nacka `50871` full-flow window for `2026-06-29` through `2026-09-30` remains open until Love asks to close it; ticket closeout is not a close-window deploy.
- Park-test phone PWA builds must set `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` to the park-test API, or the app falls back to dev.
- Park-test post-payment sync only refreshes a recent local `new_booking` prepayment draft.
- Deployed gates stop on emergency value `true`/missing/invalid, require configured plus observed venue `50871`, and reject any request item outside the date allowlist before side effects.
- T0193 gives all 21 API routes explicit trust/auth/rate controls: six internal/legacy routes use AWS IAM plus app tokens; guest, staff, and Roller routes enforce caller-specific proof in Lambda.
- Protection is aggregate per route rather than per IP and passed 120 guests/20 minutes plus a 40-device two-second burst behind shared park Wi-Fi with no modeled false `429`.

## Current Implemented Flow Facts

- Phone lookup uses Aurora first and Roller-authoritative refresh when needed. Park-test accepts reference/email/phone, enforces Nacka/date scope, and picks the nearest same-day start.
- Phone check-in starts or resumes a server-owned check-in session before progressing from a ready booking.
- Scoped lookup/link resolution provides a booking-bound opaque guest credential held only in phone memory; Aurora stores only its hash, and protected session/add-on actions require it.
- Guest safety completion marks a JumpYard Cloud session ready for staff and shows a server-owned handoff code/QR.
- Staff/admin handoff uses server-owned staff auth in dev and can list, search, inspect, and staff-confirm redeem ready sessions.
- Buy-entry and existing-booking add-ons use server-owned Roller draft/payment paths; add-ons create a separate linked booking instead of mutating the original.
- Park-test product validation uses approved Nacka parents plus Roller Live slot availability, not static child ids; display mapping is separate from write gates.
- Park-test PWA drafts request Roller-native confirmation/receipt email with `sendConfirmations=true`; new-booking delivery is proven.
- Park-test T0176 full-flow rehearsal opens Nacka/date-scoped payment, lookup, add-ons, staff auth, and redeem for `2026-06-29` through `2026-09-30` while keeping webhook processing and JumpYard-owned guest sends closed.

## Data And Integration Facts

- Aurora dev stores normalized Roller booking, booking item, ticket, payment, product cache, guest contact, webhook, check-in session, token, SMS/email delivery, and prepayment draft/link state.
- Data API ingestion uses modified-date windows and must be treated as an operational cache/index, not source of truth.
- Booking webhooks are registered in Roller Playground and use the confirmed `x-roller-apikey` header in dev; production webhook auth/signature/IP policy remains open.
- Daily dev Data API sync runs internally from EventBridge to Lambda in planning/operational dev mode; guest messaging uses opaque `jy_token` links resolved server-side.
- Park-test daily Data API sync is disabled; T0196 owns approved Live backfill and morning seed.
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
- The approved T0190-T0205 sequence is in [the backlog](docs/roadmap/backlog.md): T0192 has qualified park-test, T0204 decides GO/NO-GO there, and T0205 owns separately approved production creation/cutover.
- Main pre-production/production blockers include alarm routing, SMS/SES access, sender/domain setup, staff identity, retention, rollback, Live backfill/cutover, and webhook verification.
- Payment must stay on Roller's approved package; method visibility is Roller/Adyen controlled.

## Current Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which products must be ticket/session products for API redemption and webhook counters? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | Open |
| What production retention/encryption applies to guest email/phone? | Needed before production data commitments. | `T0195` | Open |
| Should `/data/giftcards` be imported, and in which ticket? | Optional audit/display/reconciliation work should stay separate from payment UI. | `TBD` | Open |
| What webhook auth/signature/IP policy replaces dev `x-roller-apikey`? | Required for T0197 park-test proof and T0205 production registration. | `T0197/T0205` | Open |
| Should JumpYard Cloud send a real Roller redemption device name? | Roller rejects non-existent device names; dev omits the field. | `TBD` | Open |
| Which staff/admin auth model authorizes final redeem? | T0047 dev staff auth is not final production identity. | `T0194` | Open |
