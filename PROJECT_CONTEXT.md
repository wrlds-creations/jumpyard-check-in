# Project Context

This file is the living project memory for JumpYard Next. Confirmed durable facts belong here. Historical ticket-by-ticket implementation narrative is archived in [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md). Unknowns remain `TBD`.

## Project Identity

- Project: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- App: existing JumpYard check-in app suite
- Current phase: `Sprint 1`

## Current Phase And Scope

Sprint 1 connects the existing check-in app suite to Roller Playground and park-test Live through a server-side layer. The target production architecture remains:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The Sprint 1 API/data contract is in [JUMPYARD_CLOUD_CONTRACT.md](JUMPYARD_CLOUD_CONTRACT.md). The park-test sequence is in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). Park-test has setup, controlled smokes, lookup, webhook-off readiness, and temporary T0176 full-flow rehearsal.

## Context Archives

- Completed ticket table: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 ticket narrative: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Done followups: [docs/history/followups-done.md](docs/history/followups-done.md)
- Forward roadmap/backlog: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
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
- `infra/config/park-test.json` is synthable, contains no credentials, and uses the reviewed park-test Cloudflare Pages origins for API CORS.
- T0150 deployed `jumpyard-check-in-park-test-stack`; T0151 applied SQL migrations `0001` through `0008` to park-test Aurora.
- Park-test CDK no longer creates the account-wide SNS SMS delivery-status custom resource; that account-level setting remains owned by dev until park-test guest messaging is explicitly scoped.
- T0152 deployed park-test safety gates in CDK/config and Lambda runtime; park-test has `JUMPYARD_EMERGENCY_STOP=true` and sensitive gates closed.
- Park-test human gate names are aliases in [docs/t0170-park-test-gate-runbook.md](docs/t0170-park-test-gate-runbook.md); runtime variables stay ticket-numbered until a scoped migration.
- Park-test has Live access, webhook `1465`, frontend/CORS, smokes through redeem, lookup, webhook-off readiness, and T0176 full-flow rehearsal. Sensitive gates remain closed unless a scoped config opens them.
- Park-test phone PWA builds must set `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` to the park-test API, or the app falls back to dev.
- Park-test post-payment new-booking sync is draft-backed and only refreshes a recent local `new_booking` prepayment draft created by JumpYard Cloud.

## Current Implemented Flow Facts

- Phone booking lookup calls JumpYard Cloud, which uses Aurora-first lookup with Roller-authoritative refresh when local data is missing or unsafe.
- Phone check-in starts or resumes a server-owned check-in session before progressing from a ready booking.
- Guest safety completion marks a JumpYard Cloud session ready for staff and shows a server-owned handoff code/QR.
- Staff/admin handoff uses server-owned staff auth in dev and can list, search, inspect, and staff-confirm redeem ready sessions.
- Buy-entry can create a Roller draft/payment path through JumpYard Cloud using the approved Roller payment package.
- Existing-booking add-products create a separate linked add-on draft booking; the original Roller booking is not mutated in that path.
- Park-test Live phone add-on catalog mapping is read-only display/quote-prep data and is separate from existing-booking add-on write gates.
- Park-test product validation uses approved Nacka entry/family parents plus Roller Live slot availability, not static child ids.
- Park-test assisted existing-booking lookup is a single-code/date/venue-scoped read gate for `2026-06-29` through `2026-07-05`; it does not import same-day lists or open writes.
- Park-test PWA drafts request Roller-native confirmation/receipt email with `sendConfirmations=true`; new-booking delivery is proven.
- Ready-for-entry/staff handout UI shows QR/handoff code plus entry duration/ticket type before visitor testing.
- Park-test Apple Pay has the Adyen domain-association file live on the park-test Cloudflare Pages domain. The iPhone sheet opens but collapses at processing; the code track is paused pending Pabel/Roller/Adyen merchant-validation/session/payment logs, with card as fallback.
- Park-test T0176 full-flow rehearsal opens Nacka/date-scoped payment, lookup, add-ons, staff auth, and redeem while keeping webhook processing and JumpYard-owned guest sends closed.
- Gift card and Klippkort inputs are payment-prep inputs because Roller applies them during booking costs/draft creation.
- Current V1 membership/`10-Kort` behavior is code validation/amount reduction through `discounts: [{ code }]`, not remaining-visit balance display.
- SkyRider is the first capacity-gated add-on and requires height/consent before quote/draft/payment side effects.
- Staff/admin handout grouping uses exact operational labels such as `Lämna ut vid incheckning`, `Hämtas efter hoppet`, and `Övrigt i bokningen`.

## Data And Integration Facts

- Aurora dev stores normalized Roller booking, booking item, ticket, payment, product cache, guest contact, webhook, check-in session, token, SMS/email delivery, and prepayment draft/link state.
- Data API ingestion uses modified-date windows and must be treated as an operational cache/index, not source of truth.
- Booking webhooks are registered in Roller Playground and use the confirmed `x-roller-apikey` header in dev; production webhook auth/signature/IP policy remains open.
- Daily dev Data API sync runs internally from EventBridge to Lambda in planning/operational dev mode.
- Guest messaging through SMS/email uses opaque `jy_token` links resolved server-side by JumpYard Cloud.
- Park-test Aurora contains only scoped Live smoke snapshots, not a broad booking import or all-day guest list.
- T0161/T0171 selected REST-on-demand lookup by entered booking code; same-day indexing remains deferred and add-ons stay separately gated.
- T0172 blocks public email lookup until Roller confirms a narrow API; staff can search Roller by email and enter the booking code in the PWA.
- T0173 keeps Live webhook processing off for first assisted park-test; payment/add-on state uses scoped REST refresh, and redeem uses direct `POST /redemptions` success plus Aurora audit/manual fallback.
- Existing-booking add-ons require server-resolved customer contact for the separate linked draft. T0163 confirmed Roller Live booking detail may expose `customerId` while `GET /guests/{customerId}` contains the complete first/last/email/phone contact needed server-side.
- T0164-T0169 proved add-on payment, linked settlement, one exact Live redemption, Roller email delivery, add-on visibility, and post-payment sync.

## Security And Operational Constraints

- Roller Live, production credentials, `.env`, AWS resources/deploys, Aurora migrations, payment package/vendor source, SMS/email sending, and app behavior must not be changed by context-hygiene tickets.
- AWS deploys require reading [AWS_RESOURCES.md](AWS_RESOURCES.md), using `skills/aws-project-infrastructure/`, and confirming account/region/environment/owner/tags/data/cost metadata first.
- Dev guest messaging remains gated by SNS/SES sandbox and sender-readiness constraints; unattended real sends remain disabled until production-readiness gates pass.
- Staff/admin PII is staff-only and must not be exposed in public guest UI or unauthenticated APIs.

## Language Policy

Repository source-of-truth workflow docs, ticket summaries, decisions, validators, archive notes, and audit reports are written in English by default. Preserve exact Swedish only for user-facing UX copy, staff/admin UI labels, product/operational terminology used by the app or business process, quoted source evidence, and raw archived history intentionally copied verbatim. Do not normalize exact UI strings such as `Betalning`, `Presentkort`, `Klippkort`, `Lämna ut vid incheckning`, `Hämtas efter hoppet`, and `Övrigt i bokningen`. Validators should not enforce a general language choice.

## Current Readiness Gates

- Production readiness remains partial and should be handled through scoped future tickets, not opportunistic context hygiene.
- Main staging/live blockers include production environment config, route auth/WAF or equivalent edge protection, alarm notification routing, SMS/SES production access, sender/domain setup, dev-token replacement, retention policy, deployment rollback, live backfill/cutover, and webhook production verification.
- Payment must stay on Roller's approved package; method visibility is Roller/Adyen controlled.

## Current Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which products must be configured as ticket/session products to support API-driven redemption and webhook-based counters? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | Open |
| Which exact production retention/encryption policy should apply to stored guest email and phone? | Needed before production data retention and export/deletion commitments. | `TBD` | Open |
| Should `/data/giftcards` be imported for gift-card flows, and in which ticket? | Optional audit/display/reconciliation work should stay scoped separately from payment UI. | `TBD` | Open |
| Which exact production auth header/signature and optional IP allowlisting should Roller webhook intake use beyond the confirmed Playground `x-roller-apikey` header? | Required before production webhook registration. | `TBD` | Open |
| Which real Roller redemption device name should JumpYard Cloud send, if any, before production check-in? | Roller rejects non-existent device names; dev omits the field by default. | `TBD` | Open |
| Which staff/admin authentication model should authorize final redeem in the pilot? | T0047 dev staff auth is not final production identity. | `TBD` | Open |
