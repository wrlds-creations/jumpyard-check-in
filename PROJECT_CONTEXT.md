# Project Context

This file is the living project memory for JumpYard Next. Confirmed durable facts belong here. Historical ticket-by-ticket implementation narrative is archived in [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md). Unknowns remain `TBD`.

## Project Identity

- Project name: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- Current application: existing JumpYard check-in app suite
- Current phase: `Sprint 1`

## Current Phase And Scope

Sprint 1 connects the existing check-in app suite to Roller Playground through a server-side layer. The target production architecture remains:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The current Sprint 1 API/data contract is documented in [JUMPYARD_CLOUD_CONTRACT.md](JUMPYARD_CLOUD_CONTRACT.md). The park-test sequence is tracked in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). Park-test has AWS foundation, migrations, Live read-only/webhook/frontend setup, Cloudflare Pages targets, quote/draft/payment smokes, controlled Live lookup, and Live catalog/index readiness. Public draft writes and Live lookup were closed again after their smokes; add-on smoke, webhook processing, visitor traffic, payment-start writes, and redeem remain gated.

## Context Archives

- Completed ticket table: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 ticket narrative: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Done followups: [docs/history/followups-done.md](docs/history/followups-done.md)
- Forward roadmap/backlog: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
- Park-test reports live under `docs/` and are linked from [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Durable Architecture Facts

- Frontend apps must not call Roller directly in the real production architecture.
- Park-test planning preserves the same boundary: phone/admin deployments may point at a park-test JumpYard Cloud API by environment config, but Roller Live access remains server-side only.
- Roller remains the source of truth for bookings, products, payments, and ticket redemption.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, session status, idempotency, audit events, and guest messaging state.
- Check-in is modeled as ticket-level redemption through Roller `POST /redemptions`, not a booking-level flag.
- JumpYard Cloud keeps normalized operational state and Roller ids, not broad raw Roller-owned data.
- Raw payment JWTs are response-only and are not persisted in Aurora or logs.
- AWS dev is the current implementation environment; non-dev/staging/live work requires separate reviewed config and preflight.
- Park-test work is gated by scoped tickets; AWS creation, Roller Live reads/writes, existing-booking lookup, product/add-on catalog readiness, booking-index strategy, existing-booking add-ons, webhook registration, payments, and redemptions require the approvals listed in the active ticket/backlog.
- Park-test is a separate WRLDS environment in dev's AWS account/region: `376129878018`, `eu-north-1`, namespace `jumpyard-check-in-park-test`, own database/secrets/API/resources, and Roller Live Nacka access only through JumpYard Cloud.
- CDK config validation now separates `dev` and `park-test`: dev remains Roller Playground-only, while park-test must match the T0146 account/region/resource-prefix/Live-base/data-classification contract and keep `bookingTimeSms.confirmSend=false`.
- `infra/config/park-test.json` is synthable and uses separate park-test naming/tags/resource prefix. It does not contain credentials and now uses the reviewed park-test Cloudflare Pages origins for API CORS.
- Park-test raw payload storage synthesizes as `jumpyard-check-in-park-test-raw-376129878018-eu-north-1` so the bucket name stays within S3's 63-character limit without changing the existing dev raw-payload bucket naming pattern.
- The first park-test deploy must follow the T0149 preflight: verify AWS identity and metadata, run sequential CDK commands, require a clean dev template diff, review the additive park-test template diff, and get explicit T0150 deploy approval before creating resources.
- For a never-deployed park-test stack, template diff (`cdk diff --method=template`) is the preferred preflight check; default CDK change-set diff can leave an empty CloudFormation `REVIEW_IN_PROGRESS` stack shell that must be verified empty and deleted before continuing.
- T0150 deployed `jumpyard-check-in-park-test-stack`; details are in the T0150 report.
- T0151 applied SQL migrations `0001` through `0008` to the dedicated park-test Aurora database.
- Park-test CDK no longer creates the account-wide SNS SMS delivery-status custom resource; that account-level setting remains owned by dev until park-test guest messaging is explicitly scoped.
- T0152 deployed park-test safety gates in CDK/config and Lambda runtime for staff auth, guest message sends, webhook processing, Roller booking draft writes, Roller redemption writes, and an emergency stop. Dev remains configured for existing Playground behavior; park-test has `JUMPYARD_EMERGENCY_STOP=true` and sensitive gates closed.
- Park-test has confirmed Roller Live access, webhook `1465`, frontend targets/CORS, quote/draft/payment smokes, controlled existing-booking lookup, Live catalog/index readiness, and server-side guest-detail contact resolution for existing-booking add-ons. Public draft writes and Live lookup are closed again; webhook processing, visitor traffic, redeem, SMS, and email remain disabled.

## Current Implemented Flow Facts

- Phone booking lookup calls JumpYard Cloud, which uses Aurora-first lookup with Roller-authoritative refresh when local data is missing or unsafe.
- Phone check-in starts or resumes a server-owned check-in session before progressing from a ready booking.
- Guest safety completion marks a JumpYard Cloud session ready for staff and shows a server-owned handoff code/QR.
- Staff/admin handoff uses server-owned staff auth in dev and can list, search, inspect, and staff-confirm redeem ready sessions.
- Buy-entry can create a Roller draft/payment path through JumpYard Cloud using the approved Roller payment package.
- Existing-booking add-products create a separate linked add-on draft booking; the original Roller booking is not mutated in that path.
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
- Park-test Aurora now contains the controlled Live booking snapshot for `166447399` from T0160 and the matching prepayment draft `jypd_56a8f1ca817c42a4b7` is marked `published`; this is not a broad booking import or all-day guest list.
- T0161 selected REST-on-demand lookup by entered booking code for the first assisted park test; broad same-day booking indexing remains deferred.
- Existing-booking add-ons require server-resolved customer contact for the separate linked draft. T0163 confirmed Roller Live booking detail may expose `customerId` while `GET /guests/{customerId}` contains the complete first/last/email/phone contact needed server-side.

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
- Payment path should stay on Roller's approved payment package. T0159 proved one internal card payment could complete in Roller Live for Nacka, but Swish/Apple Pay visibility remains governed by the venue/payment configuration and should be reverified if those methods matter for the park test.

## Current Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which products must be configured as ticket/session products to support API-driven redemption and webhook-based counters? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | Open |
| Which exact production retention/encryption policy should apply to stored guest email and phone? | Needed before production data retention and export/deletion commitments. | `TBD` | Open |
| Should `/data/giftcards` be imported for gift-card flows, and in which ticket? | Optional audit/display/reconciliation work should stay scoped separately from payment UI. | `TBD` | Open |
| Which exact production auth header/signature and optional IP allowlisting should Roller webhook intake use beyond the confirmed Playground `x-roller-apikey` header? | Required before production webhook registration. | `TBD` | Open |
| Which real Roller redemption device name should JumpYard Cloud send, if any, before production check-in? | Roller rejects non-existent device names; dev omits the field by default. | `TBD` | Open |
| Which staff/admin authentication model should authorize final redeem in the pilot? | T0047 dev staff auth is not final production identity. | `TBD` | Open |
