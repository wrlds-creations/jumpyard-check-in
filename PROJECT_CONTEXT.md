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

The current Sprint 1 API/data contract is documented in [JUMPYARD_CLOUD_CONTRACT.md](JUMPYARD_CLOUD_CONTRACT.md). T0128 completed the documentation/tooling-only context-hygiene migration. T0126 completed the final Pelle/Anders same-day Playground booking rehearsal preparation on 2026-06-15. T0144 documented the planned park-test ticket sequence `T0145` through `T0162` in [docs/roadmap/backlog.md](docs/roadmap/backlog.md). T0145 completed the read-only current-state audit in [docs/t0145-current-state-audit.md](docs/t0145-current-state-audit.md). T0146 locked the park-test environment contract in [docs/t0146-park-test-environment-contract.md](docs/t0146-park-test-environment-contract.md). T0147 added config guards for `dev` versus `park-test`. T0148 added a synthable park-test CDK/config skeleton in [docs/t0148-park-test-synth-skeleton.md](docs/t0148-park-test-synth-skeleton.md). T0149 added the park-test deploy/rollback preflight in [docs/t0149-park-test-deploy-rollback-preflight.md](docs/t0149-park-test-deploy-rollback-preflight.md). No park-test resources, Roller Live calls, webhooks, payments, or redemptions are active from those tickets.

## Context Archives

- Completed ticket table: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 ticket narrative: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Done followups: [docs/history/followups-done.md](docs/history/followups-done.md)
- Forward roadmap/backlog: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
- Park-test current-state audit: [docs/t0145-current-state-audit.md](docs/t0145-current-state-audit.md)
- Park-test environment contract: [docs/t0146-park-test-environment-contract.md](docs/t0146-park-test-environment-contract.md)
- Park-test synth skeleton: [docs/t0148-park-test-synth-skeleton.md](docs/t0148-park-test-synth-skeleton.md)
- Park-test deploy/rollback preflight: [docs/t0149-park-test-deploy-rollback-preflight.md](docs/t0149-park-test-deploy-rollback-preflight.md)

## Durable Architecture Facts

- Frontend apps must not call Roller directly in the real production architecture.
- Park-test planning preserves the same boundary: phone/admin deployments may point at a park-test JumpYard Cloud API by environment config, but Roller Live access remains server-side only.
- Roller remains the source of truth for bookings, products, payments, and ticket redemption.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, session status, idempotency, audit events, and guest messaging state.
- Check-in is modeled as ticket-level redemption through Roller `POST /redemptions`, not a booking-level flag.
- JumpYard Cloud keeps normalized operational state and Roller ids, not broad raw Roller-owned data.
- Raw payment JWTs are response-only and are not persisted in Aurora or logs.
- AWS dev is the current implementation environment; non-dev/staging/live work requires separate reviewed config and preflight.
- Park-test work is gated by scoped tickets; AWS resource creation, Roller Live reads/writes, webhook registration, payments, and redemptions require the explicit approvals listed in the active ticket/backlog.
- Park-test is a separate WRLDS environment in the same AWS account and region as dev: account `376129878018`, region `eu-north-1`, planned resource namespace `jumpyard-check-in-park-test`, its own database/secrets/API/resources, and Roller Live JumpYard Nacka access only through JumpYard Cloud.
- CDK config validation now separates `dev` and `park-test`: dev remains Roller Playground-only, while park-test must match the T0146 account/region/resource-prefix/Live-base/data-classification contract and keep `bookingTimeSms.confirmSend=false`.
- `infra/config/park-test.json` is synthable and uses separate park-test naming/tags/resource prefix. It is not a deploy approval, does not contain credentials, and uses placeholder explicit CORS origins until T0156 confirms the real phone/admin park-test origins.
- Park-test raw payload storage synthesizes as `jumpyard-check-in-park-test-raw-376129878018-eu-north-1` so the bucket name stays within S3's 63-character limit without changing the existing dev raw-payload bucket naming pattern.
- The first park-test deploy must follow the T0149 preflight: verify AWS identity and metadata, run sequential CDK commands, require a clean dev template diff, review the additive park-test template diff, and get explicit T0150 deploy approval before creating resources.
- For a never-deployed park-test stack, template diff (`cdk diff --method=template`) is the preferred preflight check; default CDK change-set diff can leave an empty CloudFormation `REVIEW_IN_PROGRESS` stack shell that must be verified empty and deleted before continuing.

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
- Payment path should stay on Roller's approved payment package; Swish/Apple Pay visibility remains governed by the venue/payment configuration and should be reverified during the first controlled Live payment test.

## Current Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which products must be configured as ticket/session products to support API-driven redemption and webhook-based counters? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | Open |
| Which exact production retention/encryption policy should apply to stored guest email and phone? | Needed before production data retention and export/deletion commitments. | `TBD` | Open |
| Should `/data/giftcards` be imported for gift-card flows, and in which ticket? | Optional audit/display/reconciliation work should stay scoped separately from payment UI. | `TBD` | Open |
| Which exact production auth header/signature and optional IP allowlisting should Roller webhook intake use beyond the confirmed Playground `x-roller-apikey` header? | Required before production webhook registration. | `TBD` | Open |
| Which real Roller redemption device name should JumpYard Cloud send, if any, before production check-in? | Roller rejects non-existent device names; dev omits the field by default. | `TBD` | Open |
| Which staff/admin authentication model should authorize final redeem in the pilot? | T0047 dev staff auth is not final production identity. | `TBD` | Open |
