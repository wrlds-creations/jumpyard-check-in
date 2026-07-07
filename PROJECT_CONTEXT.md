# Project Context

This file is the living project memory for JumpYard Next. Confirmed durable facts belong here. Historical ticket-by-ticket implementation narrative is archived in [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md). Unknowns remain `TBD`.

## Project Identity

- Project: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- App: JumpYard check-in app suite
- Current phase: `Sprint 2 closed`; Sprint 3/4 pending.

## Current Phase And Scope

Sprint 2 is closed. Sprint 3/4 is pending. Nacka park-test stays open through 2026-09-30.

The latest roadmap artifact is [docs/assets/jumpyard-next-sprint-roadmap.pdf](docs/assets/jumpyard-next-sprint-roadmap.pdf), updated 2026-06-11. It frames Sprint 3 as production cloud plus Sprint 2 response work, and Sprint 4 as kiosk, QR print, terminal preparation, and AirHive/JumpyBoard testing.

The check-in app suite connects to Roller Playground and park-test Live through a server-side layer. The target production architecture remains:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The Sprint 1 API/data contract is in [JUMPYARD_CLOUD_CONTRACT.md](JUMPYARD_CLOUD_CONTRACT.md). The latest roadmap PDF and forward planning are reflected in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). The park feedback improvement queue is captured in [docs/roadmap/park-test-feedback-improvements.md](docs/roadmap/park-test-feedback-improvements.md).

## Context Archives

- Completed ticket table: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 ticket narrative: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Done followups: [docs/history/followups-done.md](docs/history/followups-done.md)
- Forward roadmap/backlog: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
- Latest Sprint roadmap PDF: [docs/assets/jumpyard-next-sprint-roadmap.pdf](docs/assets/jumpyard-next-sprint-roadmap.pdf)
- Park-test gate naming/runbook: [docs/t0170-park-test-gate-runbook.md](docs/t0170-park-test-gate-runbook.md)

## Durable Architecture Facts

- Frontend apps must not call Roller directly in the real production architecture.
- Park-test planning preserves the same boundary: phone/admin deployments may point at a park-test JumpYard Cloud API by environment config, but Roller Live access remains server-side only.
- Roller remains the source of truth for bookings, products, payments, and ticket redemption.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, session status, idempotency, audit events, and guest messaging state.
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

## Current Implemented Flow Facts

- Phone booking lookup calls JumpYard Cloud, which uses Aurora-first lookup with Roller-authoritative refresh when local data is missing or unsafe. Park-test lookup accepts booking reference/email/phone, enforces Nacka/date scope, and picks the nearest upcoming same-day start.
- Park testing was positive; feedback is primarily clarity, accessibility, copy, and robustness work rather than a new base design.
- Phone check-in starts or resumes a server-owned check-in session before progressing from a ready booking.
- Guest safety completion marks a JumpYard Cloud session ready for staff and shows a server-owned handoff code/QR.
- Staff/admin handoff uses server-owned staff auth in dev and can list, search, inspect, and staff-confirm redeem ready sessions.
- Buy-entry can create a Roller draft/payment path through JumpYard Cloud using the approved Roller payment package.
- Existing-booking add-products create a separate linked add-on draft booking; the original Roller booking is not mutated in that path.
- Existing-booking add-on availability may be prefetched after a successful booking lookup/session resolution so the add-on step feels faster; that prefetch is read-only availability and must not create drafts, payments, add-ons, redemptions, or other write side effects before the guest continues.
- Park-test product validation uses approved Nacka entry/family parents plus Roller Live slot availability, not static child ids. Live phone add-on catalog mapping is read-only display/quote-prep data and separate from write gates.
- Park-test PWA drafts request Roller-native confirmation/receipt email with `sendConfirmations=true`; new-booking delivery is proven.
- Ready-for-entry/staff handout UI shows a QR plus entry duration/ticket type; the visible guest fallback is now name-to-staff rather than a displayed handoff code.
- Park-test Apple Pay domain association is live, but processing is paused pending Pabel/Roller/Adyen diagnostics; card remains fallback.
- Park-test T0176 full-flow rehearsal opens Nacka/date-scoped payment, lookup, add-ons, staff auth, and redeem for `2026-06-29` through `2026-09-30` while keeping webhook processing and JumpYard-owned guest sends closed.
- Gift card, Klippkort, and current V1 membership/`10-Kort` handling are payment-prep code inputs applied by Roller during costs/draft creation; `10-Kort` is code validation/amount reduction, not remaining-visit balance display.
- SkyRider is the first capacity-gated add-on and requires height/consent before quote/draft/payment side effects.
- Water bottle add-on maps to Roller Live product `1324123`; users choose quantity or confirm own bottle.
- ComboDeal maps to Roller Live parent product `1318777` with child price products `1318778`, `1318779`, and `1318780`; one package counts as two jumpers and includes 60 minutes of jumping plus one pizza to share according to Roller product copy.
- Older/technically inexperienced guest fallback is deferred to the later kiosk/staff-help track.
- Staff/admin handout grouping uses exact operational labels such as `Lämna ut vid incheckning`, `Hämtas efter hoppet`, and `Övrigt i bokningen`.

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
- Main staging/live blockers include production environment config, route auth/WAF or equivalent edge protection, alarm notification routing, SMS/SES production access, sender/domain setup, dev-token replacement, retention policy, deployment rollback, live backfill/cutover, and webhook production verification.
- Payment must stay on Roller's approved package; method visibility is Roller/Adyen controlled.

## Current Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which products must be ticket/session products for API redemption and webhook counters? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | Open |
| What production retention/encryption applies to guest email/phone? | Needed before production data commitments. | `TBD` | Open |
| Should `/data/giftcards` be imported, and in which ticket? | Optional audit/display/reconciliation work should stay separate from payment UI. | `TBD` | Open |
| What production webhook auth/signature/IP policy replaces dev `x-roller-apikey`? | Required before production webhook registration. | `TBD` | Open |
| Should JumpYard Cloud send a real Roller redemption device name? | Roller rejects non-existent device names; dev omits the field. | `TBD` | Open |
| Which staff/admin auth model authorizes final redeem? | T0047 dev staff auth is not final production identity. | `TBD` | Open |
