# Followups

Use this file for out-of-scope findings, deferred improvements, and future tickets. Codex should add findings here instead of widening the current ticket.

## Open Followups

| ID | Source Ticket | Type | Description | Priority | Owner | Status |
|---|---|---|---|---|---|---|
| `FU-008` | `T0003` | Add-product architecture | Define exact link model between original Roller booking and separate add-on Roller booking in JumpYard Cloud. | High | `TBD` | Open |
| `FU-009` | `T0003` | Roller clarification | Confirm which tenders work in the new add-on booking checkout flow: gift card, membership code, and multi-visit value. | High | `TBD` | Open |
| `FU-010` | `T0003` | Product configuration | Identify which add-ons must be reconfigured from stock/add-on products to ticket/session products if JumpYard wants API-driven redemption and webhook counting. | High | `TBD` | Open |
| `FU-011` | `T0003` | Roller clarification | Confirm the exact `POST /redemptions` response shape for full success, partial success, already redeemed, and invalid ticket cases. | Medium | `TBD` | Open |
| `FU-013` | `T0003` | Architecture validation | Load-test or simulate Roller one-call-per-second throttling before pilot traffic. | Medium | `TBD` | Open |
| `FU-014` | `T0003` | Roller clarification | Confirm the preferred availability-display pattern for core jump-entry products and durations before implementing new booking UI logic. | Medium | `TBD` | Open |
| `FU-015` | `T0003` | Data ingestion | Confirm Roller Data API endpoint, credentials, date range, and payload shape for the daily morning booking seed. | High | `TBD` | Open |
| `FU-018` | `T0004` | Dependency security | Evaluate the `aws-cdk-lib` bundled `brace-expansion` audit warning and any available `npm audit fix` path in a dedicated dependency ticket. | Medium | `TBD` | Open |
| `FU-019` | `T0005` | Data ingestion | Confirm exact Data API query parameters, paging, credentials, and date-window support for Get tickets, Get payments, and Get customers in Playground. Bookingitems/Get bookings was confirmed in T0011. | High | `TBD` | Open |
| `FU-020` | `T0005` | Webhook security | Confirm Roller webhook event id, signature/verification method, retry behavior, and event names before exposing webhook intake beyond dev. | High | `TBD` | Open |
| `FU-021` | `T0005` | Data retention | Confirm retention period for normalized booking snapshots, event logs, sync runs, and any approved raw payload storage. | Medium | `TBD` | Open |
| `FU-022` | `T0005` | Ingestion freshness | Confirm operational freshness thresholds for lookup display, SMS readiness, and mandatory live refresh before redeem. | Medium | `TBD` | Open |
| `FU-026` | `T0008` | Test data | Add an already-redeemed Playground seed scenario after `POST /redemptions` is implemented and safely tested. | Medium | `TBD` | Open |
| `FU-027` | `T0010` | Phone operating date | Replace the T0008 demo expected-date default with a venue operating-date source before pilot/production. | High | `TBD` | Open |

## Resolved Followups

| ID | Resolved In | Resolution | Date |
|---|---|---|---|
| `FU-006` | `T0002` | Confirmed `/products` is usable as the harmless read-only smoke endpoint for current Playground credentials; `npm run roller:smoke` returned HTTP 200, and later Playground sync returned 96 products. | 2026-05-18 |
| `FU-007` | `T0002` | Confirmed ROLLER's documented Playground base URL is `https://api.play.roller.app`; guard now accepts `play` and `playground` markers while still blocking live/prod markers. | 2026-05-18 |
| `FU-012` | `T0006` | Confirmed first deploy target from Bluetooth Hub dev setup and user input: account `376129878018`, region `eu-north-1`, environment `dev`, owner `love`, data classification `internal`, exportable `true`, and cost center `unassigned`. | 2026-05-19 |
| `FU-016` | `T0008` | Added a protected Playground seed tool that creates deterministic paid, pending-payment, wrong-date, SkyRider/add-on, original-booking, and linked add-on bookings. Already-redeemed seed data is deferred to `FU-026` because T0008 does not call redemption. | 2026-05-20 |
| `FU-017` | `T0006` | Added confirmed non-secret dev deployment config at `infra/config/dev.json`. | 2026-05-19 |
| `FU-023` | `T0006` | Confirmed T0006 WRLDS deploy metadata and wrote it to source-of-truth docs. | 2026-05-19 |
| `FU-024` | `T0006` | AWS SSO login succeeded for profile `wrlds-dev`; `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and region `eu-north-1` is configured. | 2026-05-19 |
| `FU-025` | `T0009` | Real Roller Playground credentials were stored in AWS Secrets Manager secret `/jumpyard-check-in-dev/roller/credentials` and used successfully by the deployed lookup Lambda. | 2026-05-20 |
