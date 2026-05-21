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
| `FU-020` | `T0005/T0018` | Webhook security | Confirm Roller production webhook auth/signature policy and whether to use EMEA IP allowlisting before exposing webhook intake beyond dev. Playground delivery header `x-roller-apikey`, event id, and payload shape were confirmed in T0018. | High | `TBD` | Open |
| `FU-021` | `T0005` | Data retention | Confirm retention period for normalized booking snapshots, event logs, sync runs, and any approved raw payload storage. | Medium | `TBD` | Open |
| `FU-022` | `T0005` | Ingestion freshness | Confirm operational freshness thresholds for lookup display, SMS readiness, and mandatory live refresh before redeem. | Medium | `TBD` | Open |
| `FU-026` | `T0008` | Test data | Add an already-redeemed Playground seed scenario after `POST /redemptions` is implemented and safely tested. | Medium | `TBD` | Open |
| `FU-027` | `T0010/T0019` | Phone operating date | Replace the T0019 temporary `Europe/Stockholm` current-date fallback with a real venue operating-date source before pilot/production. | High | `TBD` | Open |
| `FU-029` | `T0014` | Gift cards | Add `/data/giftcards` ingestion when gift card payment/check-in flows are explicitly scoped. | Medium | `TBD` | Open |
| `FU-031` | `T0016` | Lookup fallback | Add supported `GET /bookings` search fallback for cases where direct `GET /bookings/{identifier}` cannot resolve an imprecise guest input. | Medium | `TBD` | Open |
| `FU-032` | `T0017` | Webhook scaling | Move webhook enrichment off the request path to SQS/EventBridge before production if latency, retries, or traffic volume require faster acknowledgement. | Medium | `TBD` | Open |
| `FU-035` | `T0021` | Redeem configuration | Decide whether JumpYard Cloud should send a configured Roller `redemptionDevice` name before production. Roller rejects non-existent device names, so T0021 omits it by default. | Medium | `TBD` | Open |
| `FU-036` | `T0022` | Staff auth | Choose the staff/admin authentication model that will authorize final redeem in the pilot. | High | `TBD` | Open |
| `FU-037` | `T0022` | Session expiry | Define TTL, resume behavior, and cleanup rules for check-in sessions and handoff codes. | Medium | `TBD` | Open |
| `FU-038` | `T0022` | Safety gate | Confirm which guest-side safety/video/waiver states must be complete before staff/server-confirmed redeem. | High | `TBD` | Open |
| `FU-039` | `T0023` | Staff/admin UI | Build staff/admin list/detail for `ready_for_staff` sessions after phone wiring exists. | High | `TBD` | Open |
| `FU-040` | `T0024` | SMS/session resume | Replace the current mock SMS-token path with a real JumpYard Cloud token/session restore flow when SMS links are scoped. | High | `TBD` | Open |

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
| `FU-028` | `T0014` | Added structured email and phone fields to `jumpyard.guest_profiles`; T0014 imports `/data/customers` into full structured fields plus masked/hash values, while excluding names, addresses, notes, and raw payloads. | 2026-05-20 |
| `FU-030` | `T0018` | Registered Roller Playground booking webhook id `238` against the dev endpoint and confirmed real delivery. Roller sends the configured token in `x-roller-apikey`; booking `5032443` produced a real `Created` event that enriched Aurora with status `processed`. | 2026-05-21 |
| `FU-033` | `T0021` | Added a separate dev redeem token, final Roller REST refresh, Aurora re-evaluation, and protected dev-only `POST /redemptions` execution path. | 2026-05-21 |
| `FU-034` | `T0021` | Created dedicated paid Playground booking `5032454` for controlled redeem smoke and redeemed ticket `5032454-21397335`, leaving the normal `5032210` lookup fixture unused. | 2026-05-21 |
