# Project Context

This file is the living project memory for JumpYard Next. Confirmed facts belong here. Unknowns remain `TBD`.

## Project Identity

- Project name: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- Current application: Existing JumpYard check-in app suite.
- Current phase: `Sprint 1`

## Sprint 1 Focus

Sprint 1 focuses on connecting the existing check-in app to Roller Playground through a server-side layer.

The target architecture is:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

The current Sprint 1 API and data contract is documented in `JUMPYARD_CLOUD_CONTRACT.md`.

The first AWS foundation is defined as a CDK TypeScript app in `infra/`. T0006 deployed the confirmed dev config in `infra/config/dev.json`.

T0007 added Aurora schema migrations in `infra/migrations/` and a dev migration runner in `infra/scripts/run-migrations.ts`. The first migration created the `jumpyard` schema in dev Aurora.

T0008 adds a protected local Roller Playground seed tool for deterministic fake bookings. The tool is dry-run by default and can only write bookings when Playground config passes and an explicit write-confirmation environment variable is set.

T0009 replaced the dev `POST /v1/check-in/lookup` placeholder with a deployed server-side Roller Playground lookup Lambda. The endpoint reads Roller credentials from Secrets Manager, env/base URL from SSM Parameter Store, calls `GET /bookings/{identifier}`, enriches product names from `/products`, and returns a normalized JumpYard response.

T0010 wires the phone app booking lookup step to the deployed JumpYard Cloud lookup API. The phone app calls JumpYard Cloud only, maps `ready` responses to the existing booking summary with active check-in CTA, maps `payment_required` responses to the existing booking summary with `Obetald` and blocked check-in CTA, and stops the flow for wrong-date, non-redeemable, not-found, and service-failure states.

T0012 added a dev Aurora importer for Roller Data API `/data/bookingitems`. It upserts normalized booking rows into `jumpyard.roller_bookings`, booking item rows into `jumpyard.roller_booking_items`, and run state into `jumpyard.booking_seed_runs` without storing raw Roller payloads.

T0013 added a dev Aurora importer for Roller REST `/products`. It caches normalized product rows in `jumpyard.product_catalog_cache` and enriches existing `jumpyard.roller_booking_items` rows with product names and parent product names.

T0014 added a dev Aurora migration and importer for related Roller Data API sources: `/data/tickets`, `/data/bookingpayments`, and `/data/customers`. It upserts ticket ids into `jumpyard.roller_booking_tickets`, payment rows into `jumpyard.roller_booking_payments`, and structured customer contact fields into `jumpyard.guest_profiles`.

T0015 replaced the dev webhook placeholder with a safe Roller webhook intake Lambda. The dev endpoint acknowledges Roller-style deliveries quickly, deduplicates by event id or payload hash, stores normalized metadata in `jumpyard.roller_webhook_events`, writes safe event-log rows, and uses a dev-only webhook token stored in Secrets Manager until Roller production webhook verification is confirmed.

T0016 changed `POST /v1/check-in/lookup` to use Aurora first. The lookup Lambda now reads `jumpyard.roller_bookings`, `jumpyard.roller_booking_items`, and `jumpyard.roller_booking_tickets` for fresh local records, refreshes from Roller REST only when the local record is missing or unsafe, and upserts refreshed booking/item/ticket data back into Aurora.

T0017 changed the dev booking webhook Lambda from metadata-only intake to booking snapshot enrichment. A new accepted booking webhook event now fetches `GET /bookings/{identifier}` from Roller Playground, enriches product names best-effort from `/products`, upserts booking/item/ticket snapshots into Aurora, and marks `jumpyard.roller_webhook_events` as `processed` or `failed`.

T0018 registered the real Roller Playground booking webhook against the deployed dev endpoint. Roller webhook id `238` posts booking `Created`, `Updated`, and `Cancelled` events to JumpYard Cloud, includes tickets, sends the dev token in header `x-roller-apikey`, and real created-booking delivery has been confirmed through Aurora status `processed`.

T0019 polished the phone lookup path for webhook-created Aurora bookings. The phone app now carries JumpYard Cloud source/freshness metadata into the booking model for non-visible verification, uses stable test hooks for lookup testing, keeps internal source labels hidden from guests, and defaults lookup expected date to today's date in `Europe/Stockholm` when no explicit override is set.

T0020 adds the first safe server-owned redeem endpoint shape. The dev `POST /v1/check-in/redeem` Lambda resolves bookings and ticket ids from Aurora, validates Roller `POST /redemptions` constraints, writes safe check-in attempt/event audit rows, and returns a redeem plan while real Roller redemption writes remain disabled in deployed dev config.

T0021 enables controlled Roller Playground redemption execution for dev only. Confirmed redeem requests require a separate dev-only redeem token, refresh the booking from Roller REST immediately before the write, upsert the refreshed snapshot into Aurora, re-run eligibility, and only then call Roller `POST /redemptions`. The first controlled Playground redemption succeeded for dedicated booking `5032454`.

T0022 locks the phone/staff redeem handoff design. The phone app may start or resume a server-owned check-in session, but it must not hold redeem secrets or directly execute Roller redemption. Final ticket redemption remains a JumpYard Cloud action after staff/admin or another trusted server-side confirmation step, with the T0021 final Roller refresh still required before `POST /redemptions`.

T0023 implements the server-owned check-in session API skeleton in dev. JumpYard Cloud now has a `jumpyard.checkin_sessions` Aurora table, a deployed session Lambda, `POST /v1/check-in/sessions`, and `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`. The session API reads Aurora booking/ticket context, creates or resumes active sessions, blocks unsafe contexts, marks sessions ready for staff, and never calls Roller or redeems tickets.

T0024 wires the phone app booking summary CTA to `POST /v1/check-in/sessions`. A paid ready booking now creates or resumes a JumpYard Cloud session before the phone flow leaves the booking summary. The phone flow stores the returned session id/status in local flow state, keeps unpaid bookings blocked, and still does not call Roller or expose redeem credentials.

T0025 wires the phone app safety attestation completion to `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`. The phone flow stores the returned handoff status/code and shows the server-owned code on the final confirmation screen. This still does not call Roller or redeem tickets.

T0026 adds the first staff/admin handoff list and detail surface. JumpYard Cloud exposes read-only dev endpoints for ready-for-staff sessions, and the admin app reads those endpoints to show handoff code, session state, booking status, payment status, booking items, and selected tickets without exposing guest contact PII. This still does not call Roller or redeem tickets.

T0027 adds and deploys staff-confirmed redeem from a server-owned check-in session. JumpYard Cloud exposes a dev staff redeem route backed by the existing T0021 redeem Lambda: it requires a temporary dev redeem token until staff auth exists, resolves the session in Aurora, requires `ready_for_staff` state and completed safety, performs the final Roller REST refresh and eligibility re-check, calls Roller Playground `POST /redemptions`, marks local selected tickets redeemed, and marks the session `redeemed`/`completed`. The admin app can trigger this action from the selected handoff detail without storing the temporary code in source, browser env, localStorage, or sessionStorage.

T0028 improves the phone-to-staff QR handoff. The phone confirmation screen keeps the server-owned payload `JY_HANDOFF:<handoffCode>:<checkinSessionId>` as the QR value, renders it with the proven `qrcode` library, shows only the scannable QR plus short code to guests, and keeps the payload in test/debug attributes. The admin app can scan QR codes with the existing browser QR library, paste a full QR payload, type a short handoff code, and open the exact session when the payload includes `checkinSessionId`. This is a frontend-only polish ticket and does not change AWS, Roller, or redeem logic.

T0029 improves phone-side session resume behavior without changing AWS or Roller logic. After a successful paid lookup, the phone app asks JumpYard Cloud to start or resume the server-owned session. When JumpYard Cloud returns a resumed `ready_for_staff` session, the phone app opens the final QR confirmation screen directly from search instead of showing booking summary or restarting add-ons/safety. When the session is completed/redeemed or the session start call reports `already_redeemed`, the phone app shows an already checked-in state instead of treating the booking as a fresh check-in.

T0030 confirms the first Roller Playground draft-booking payment path without building payment UI. A guarded local discovery command creates no booking by default, can explicitly create a Playground-only draft booking, and confirmed that `POST /bookings/draft` returns cost fields plus a `paymentJwt`. Roller Payments official docs state that custom checkout payment uses Roller's payment library with the returned JWT, requires ROLLER authorization, a public HTTPS allowlisted domain for test and production, and an approved payment package. Test card details and exact venue enablement remain open before phone UI payment implementation.

T0031 implements and deploys the server-side JumpYard Cloud new-booking quote/draft endpoints. `POST /v1/bookings/quote` calls Roller Playground `POST /bookings/draft/costs` and returns normalized costs without creating a booking. `POST /v1/bookings/draft` requires `confirmDraft=true` and an idempotency key, calls Roller Playground `POST /bookings/draft`, returns the draft unique id, normalized costs, safe venue payment config from `GET /venues/me`, and the raw `paymentJwt` only in the API response for the future payment component. The booking Lambda writes only safe audit/idempotency rows and does not persist or log the raw `paymentJwt`.

T0032 adds a local payment-package POC harness against the deployed JumpYard Cloud quote/draft endpoints. It calls `POST /v1/bookings/quote` by default without creating a booking, can create one guarded Playground draft booking through `POST /v1/bookings/draft`, and reports only safe payment-session metadata. The actual in-PWA payment drop-in remains blocked until Roller provides/authorizes the approved payment package, a public HTTPS allowlisted test origin, and fake/test card details.

T0033 implements the phone create-booking pre-payment flow. The phone app now calls JumpYard Cloud `POST /v1/bookings/availability` to show the next three half-hour start times and capacity-limited jump products, calls `POST /v1/bookings/quote` for server-side cost confirmation, creates a guarded Roller Playground draft through `POST /v1/bookings/draft`, and ends in a payment-pending state. JumpYard Cloud persists safe draft metadata in `jumpyard.prepayment_booking_drafts`, including structured guest email/phone plus masked/hash fields, but never stores raw `paymentJwt` values.

T0034 implements add-product architecture build step 1 for existing bookings. JumpYard Cloud now exposes `POST /v1/bookings/{bookingReference}/add-products/quote` and `POST /v1/bookings/{bookingReference}/add-products`: quote validates the original booking and returns Roller draft costs without creating a booking, while draft creates a separate Roller Playground add-on draft booking, records it as `flow_type='add_product'` in `jumpyard.prepayment_booking_drafts`, and links it to the original booking through `jumpyard.booking_links`. The original Roller booking is never modified in this path, and raw `paymentJwt` values remain response-only.

T0035 wires the phone existing-booking add-ons step to the T0034 JumpYard Cloud add-product quote/draft endpoints. The phone flow can select mapped add-ons such as JumpSocks, Hänglås, Bryggkaffe, and SkyRider, collects the contact fields required by Roller draft booking, shows a server-side quote, creates a separate add-on draft, and stops at payment pending. Stock-only add-on drafts such as socks-only or padlock-only are valid linked add-on drafts, but they are not treated as redeemable check-in bookings.

T0036 adds a local Data API backfill orchestrator for the manual foundation before scheduling. `npm --prefix infra run import:data-api-backfill:dev` splits an explicit modified-date range into daily windows, runs bookingitems before related Data API sources for each day, and refreshes the product cache for item-name enrichment. It is dry-run by default. Apply mode requires `--apply` plus `ROLLER_DATA_BACKFILL_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_DATA_API_BACKFILL`, then sets the existing per-import write confirmations for the child import scripts.

T0037 adds the scheduled dev AWS Data API sync. EventBridge rule `jumpyard-check-in-dev-data-api-daily-sync` invokes Lambda `jumpyard-check-in-dev-stack-data-sync` daily at `02:00 UTC` and the Lambda imports the previous UTC modified-date window by default. It reads Playground-only Roller config from AWS Secrets Manager and SSM, upserts bookingitems, tickets, bookingpayments, customers, and products into the existing Aurora snapshot/cache tables, records health in `jumpyard.booking_seed_runs`, and performs no Roller writes.

T0038 adds the JumpYard Cloud SMS token/session link foundation without sending SMS. Dev can create a protected check-in link for an Aurora booking through `POST /v1/check-in/session-links`; JumpYard Cloud stores only a SHA-256 token hash in `jumpyard.checkin_tokens`. The public `POST /v1/check-in/session-links/resolve` endpoint accepts the raw token, marks it opened, and starts or resumes the linked JumpYard Cloud check-in session without calling Roller.

T0039 adds the server-owned SMS sending foundation for those check-in links. Dev now has protected `POST /v1/check-in/session-links/send-sms`, which creates a hashed check-in token, records a safe `jumpyard.sms_deliveries` audit row, defaults to dry-run, and can send through AWS SNS only when explicitly confirmed. The endpoint does not call Roller, does not return raw tokens, and returns only masked destination details.

T0041 runs the first controlled real SMS smoke through the T0039 endpoint. AWS SNS accepted one confirmed dev SMS for booking `5032210` to the user-approved masked destination `+46*****9508`, and Aurora recorded delivery `jysms_mpgvzkpz_5b4ae399` as `sent` with `dry_run=false`, provider `aws_sns`, provider message id present, and token hash present. The SMS used the current dev `http://localhost:3000/` base URL, so receiving the SMS validates provider delivery but the link is not expected to open correctly on an iPhone until a public/mobile-reachable app URL is configured.

T0042 adds AWS SNS SMS delivery status diagnostics to the dev stack and runs a second protected diagnostic SMS with an AWS-owned HTTPS base URL. Aurora recorded delivery `jysms_mpgwlk9u_9566748e` as `sent`, but CloudWatch SNS delivery status logs show provider status `FAILURE` with `Sandboxed account unable to send to number.` The AWS account is in SNS SMS sandbox mode, so real SMS delivery requires verifying the destination phone in SNS sandbox or moving the account out of SMS sandbox before guest-facing SMS can work.

T0043 verifies the approved masked test phone `+46*****9508` in AWS SNS SMS sandbox and reruns the protected JumpYard Cloud SMS send. Aurora recorded delivery `jysms_mpgxbla6_b59779cd` as `sent`, and CloudWatch SNS delivery status logs show `SUCCESS` with provider response `Message has been accepted by phone.` The AWS account is still in SNS SMS sandbox, so only verified sandbox numbers can receive SMS until sandbox exit is requested and approved.

T0044 wires those server-owned SMS/check-in links into the phone app. The phone app now treats `jy_token` as the SMS entry channel, resolves it through JumpYard Cloud `POST /v1/check-in/session-links/resolve`, and routes from the returned server session state: guest-in-progress opens the booking summary, ready-for-staff opens the QR confirmation, and invalid/expired links fall back to manual booking lookup. The deployed session Lambda now includes a safe Aurora booking summary in successful token-resolution responses without returning contact PII, raw Roller payloads, or secrets.

T0045 adds the protected booking-time SMS trigger foundation. Dev now has `POST /v1/check-in/session-links/send-due-sms`, which plans upcoming Aurora bookings by booking date/start time, defaults to no-send planning mode, requires `confirmSend=true` before reusing the existing SMS sender, skips unsafe or already-recently-sent bookings, and returns only safe booking metadata plus masked destinations. It does not call Roller, schedule automatic SMS, or send to unverified SNS sandbox numbers.

T0046 adds the dev AWS schedule for booking-time SMS processing. EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule` invokes the session Lambda every 5 minutes with the same T0045 due-SMS logic, but dev config keeps `confirmSend=false` so the scheduled job plans candidates without sending real SMS while the app URL is still `localhost` and SNS remains sandbox-limited. The scheduled path is internal AWS invocation and does not require a staff/admin dev code; the public HTTP endpoint remains token-protected.

T0047 replaces the normal admin handoff temporary redeem-code flow with a first server-owned staff authentication slice. JumpYard Cloud now has `POST /v1/staff/auth/login`, backed by AWS Secrets Manager secret `/jumpyard-check-in-dev/staff/auth`, which validates a staff passcode server-side and issues a short-lived staff token. Staff list, detail, and staff-confirmed redeem routes require that token. The admin app shows a staff login screen, stores only the short-lived auth session in browser session storage, sends the token on staff requests, and no longer asks for the old temporary redeem dev code in the normal handoff panel. This is a pilot/dev auth slice, not final production SSO/Cognito.

T0048 polishes the staff/admin handoff app without changing backend behavior. The admin app now uses the same JumpYard icon asset style, system sans-serif font stack, red/neutral color tokens, rounded controls, and italic/uppercase emphasis as the check-in apps. It keeps QR scan/paste/manual code entry available and makes selected handoff detail appear before the waiting list on phone-sized screens so staff can review and redeem from a mobile device.

T0049 adds and deploys the safe configuration path for confirmed scheduled booking-time SMS sends. Dev scheduled SMS still runs in planning mode with `confirmSend=false`, but the CDK config now makes the check-in SMS base URL explicit and blocks `confirmSend=true` unless an approval phrase and public HTTPS app URL are configured. The session Lambda also blocks EventBridge-shaped confirmed sends at runtime if those safeguards are missing. No real unattended SMS is enabled in dev by default.

T0050 bootstraps the Roller Payments readiness path without payment execution. Pabel confirmed that the venue is authorized for Roller Payments via API if API keys can be generated, that payment configuration comes from `GET /venues/me` under `paymentSettings`, that the public test origin must be allowlisted, and that the Adyen test-card docs should be used with the Visa card ending `1142`. Pabel later confirmed that `https://jumpyard-check-in.pages.dev` is allowlisted for Playground payment testing. The readiness script checks Roller's version-history docs page at `https://docs.roller.app/docs/roller-payments/egj77d29eagwv-version-history` because the docs root is a navigation entry. T0040 is now treated as the old payment placeholder and is superseded by the T0050+ payment sequence.

T0051 integrates the Roller-approved `@roller/ecom-payments` package `v217` into the phone buy-entry flow for new booking drafts. The phone app now keeps using JumpYard Cloud for availability, quote, and draft creation, then passes the response-only draft `paymentJwt` and safe `paymentSettings` config to Roller's payment package in memory. The raw JWT is not persisted, logged, printed, or rendered. If the payment package cannot bootstrap its configuration, the phone app fails closed into a visible payment-unavailable state instead of spinning indefinitely. After an approved payment, the phone app attempts to resolve the newly paid booking through JumpYard Cloud lookup and continue into the normal check-in path; if Roller/webhook sync lags, it shows a retryable sync message. Add-product payment is intentionally deferred to T0052.

The booking index ingestion contract is documented in `BOOKING_INDEX_INGESTION_CONTRACT.md`.

## Architecture Principles

- Roller is the source of truth for bookings.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, and session status.
- The frontend must not call Roller directly in the real architecture.
- Roller credentials must stay server-side.
- Server-side integration should provide controlled logging, retries, error handling, and fallbacks.
- Roller integration must fail closed unless it is explicitly configured for Playground.
- Phone UI must not hold redeem tokens, Roller credentials, or final ticket-redemption authority.
- Staff/admin handoff in dev requires the T0047 staff auth token for list/detail/redeem; final production staff identity and roles remain a follow-up.
- Staff/admin handoff UI should be mobile-first and visually aligned with the phone check-in app while remaining an operational staff tool.

## JumpYard UI Rules

- Font stack: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Do not use Google font imports or historical display-font overrides in the current check-in app surfaces.
- Core color tokens: `#FFFFFF` background, `#1C1C1E` foreground, `#F4F4F5` surface, `#E4E4E7` surface/border, `#71717A` muted, `#E31837` primary red, `#B9102B` primary dark, `#10B981` success, `#F59E0B` warning, `#DC2626` danger.
- Type emphasis: headings, primary buttons, compact labels, and operational codes use bold or black weight, uppercase where useful, and italic emphasis in the established phone/kiosk style.
- Avoid heavy muted text. Muted copy should be light/supportive; strong labels and actions should use foreground, primary, success, warning, or danger colors.
- Shape and sizing: phone-first cards and controls generally use `rounded-2xl`, primary CTAs use large tap targets around `py-4`/`min-h-14`, compact labels use `text-[10px]` or `text-[11px]`, and staff tools must avoid horizontal overflow on phone viewports.

## Current Repository Shape

- `jumpyard-checkin-phone/`: guest-facing phone check-in web app.
- `jumpyard-checkin-kiosk/`: in-park kiosk check-in web app.
- `jumpyard-checkin-admin/`: staff PWA for redemption and handoff workflows.
- `infra/`: AWS CDK foundation for JumpYard Cloud, deployed to the confirmed dev AWS account.

## Delivery Workflow

- Work proceeds one ticket at a time.
- Each ticket should use a dedicated `codex/` branch.
- Local commits are made only when explicitly requested and belong to the current ticket branch.
- `main` is updated through a review/merge step, not by direct commits or direct pushes.
- Ticket commits should include only files that belong to the current ticket.

## Known Stack

- TypeScript
- Next.js
- React
- Tailwind CSS
- npm per app directory
- AWS CDK TypeScript for JumpYard Cloud infrastructure

## Current Data Ownership Model

- Booking data: Roller.
- Product catalog, availability, payment state, booking status, and ticket redemption state: Roller.
- Safety status, handoff code, staff handoff status, idempotency, and internal audit trail: JumpYard Cloud/server API.
- Short-lived normalized booking snapshots may be stored by JumpYard Cloud for UX, audit, and retry support, but Roller remains the source of truth.
- JumpYard Cloud should store Roller ids and minimal operational data, not full raw Roller payloads or unnecessary PII.
- Product catalog names/types may be cached because they are needed for display and normalization and are not guest PII.
- Guest email and phone may be stored as explicit structured contact fields for check-in/SMS readiness; free-text names, notes, addresses, and booking comments remain deferred.
- Check-in session state, staff handoff state, safety status, final redeem confirmation, idempotency, and audit are JumpYard Cloud-owned operational data.
- Check-in link tokens are JumpYard Cloud-owned operational data. Raw tokens are response-only; Aurora stores only token hashes plus expiry/opened/consumed timestamps.
- SMS delivery attempts are JumpYard Cloud-owned operational audit data. Aurora stores provider, delivery status, masked/hash destination, token hash, and safe error metadata; it must not store raw link URLs, raw tokens, or raw SMS message text.
- Pre-payment draft state is JumpYard Cloud operational state. It may store selected item summaries, totals, status, Roller draft ids, and structured guest email/phone with masked/hash fields, but raw payment JWTs remain response-only and must not be persisted.
- Existing-booking add-product drafts are JumpYard Cloud operational state linked to the original booking. Stock-only add-on drafts are handled as payment-pending add-ons and should not create guest check-in/redeem expectations by themselves.

## Phone-First Flow Targets

- `F1`: create a new booking through JumpYard Cloud using Roller draft/cost/payment patterns.
- `F2`: create a booking and check in by resolving Roller ticket ids and redeeming tickets server-side.
- `F3`: check in an existing booking and add products by creating a separate linked add-on booking, then linking original booking and add-on booking inside JumpYard Cloud.

For `F1`, the preferred target is to keep the guest inside the JumpYard PWA for booking creation and Playground/test payment using Roller draft booking `paymentJwt` and the approved Roller Payments package. T0033 implements the pre-payment booking flow: product/time selection, server-side availability/capacity check where required, server-side quote, guarded draft creation, and a clear payment-pending state. T0050 captures the payment readiness inputs from Pabel; payment package/drop-in execution is split into T0051 for new bookings and T0052 for add-product drafts. Pabel has confirmed the public-origin allowlist for `https://jumpyard-check-in.pages.dev`; the remaining payment proof is successful public browser smokes. Hosted payment links remain a fallback, not the preferred pilot UX.

## Phone/Staff Redeem Handoff

The pilot check-in completion path should separate guest phone progress from final Roller redemption:

1. Phone lookup reads a normalized booking from JumpYard Cloud.
2. Phone starts or resumes a JumpYard Cloud check-in session for that booking.
3. JumpYard Cloud owns the session state, safety gate status, selected ticket scope, handoff code/status, idempotency, and audit rows.
4. Staff/admin or another trusted server-side confirmation step authorizes final redeem.
5. JumpYard Cloud refreshes the booking from Roller REST, re-checks eligibility, then calls `POST /redemptions`.
6. Aurora stores the local attempt/result state, but Roller remains the source of truth for consumed ticket state.

The T0021 dev redeem token is only for controlled backend testing. It must never be shipped through phone app environment variables, browser storage, source code, or public network calls.

## Booking Index Strategy

- JumpYard Cloud should use an initial Roller Data API backfill to create the first Aurora booking index baseline.
- JumpYard Cloud should then run a daily Roller Data API modified-date sync to upsert new and changed records.
- Roller booking webhooks should update same-day booking changes after the latest sync.
- Live Roller REST lookup should still confirm check-in-critical state before writes such as redemption.
- The booking index is an operational cache/index, not the source of truth.
- Playground test bookings should be created by a protected internal seed tool or admin-only action, not by a public demo button in the phone check-in flow.
- Data API `startDate`/`endDate` windows are based on record modified date, while returned `bookingDate` is used for local visit-date filtering.
- Data API sync should use Get bookings, Get tickets, Get payments, and Get customers as the expected source set.
- Get attendance is for actual arrival/redeem reconciliation, not for seeding expected guests.
- Webhook payloads may be sufficient when configured with booking detail and payments, but JumpYard Cloud should enrich from live booking detail when data is incomplete, suspicious, stale, or check-in-critical.
- T0036 is the manual/local backfill foundation. T0037 schedules the same modified-date sync pattern in dev AWS instead of adding another import model.

## Confirmed Implementation Roadmap

This table is the source-of-truth ticket backlog for upcoming implementation. Keep it updated whenever the next-ticket order changes so future Codex sessions do not rely on chat history.

After T0007, the next tickets should proceed in this order:

| Ticket | Goal | Why This Order |
|---|---|---|
| `T0008 Playground test booking seed tool` | Create deterministic Roller Playground test bookings through protected server-side tooling. | Reliable test scenarios are needed before validating lookup and check-in flows. |
| `T0009 Booking lookup endpoint` | Implement `POST /v1/check-in/lookup` against Roller Playground and local index shape. | First real JumpYard Cloud API behavior for the phone flow. |
| `T0010 Phone UI lookup wiring` | Connect the phone check-in lookup step to JumpYard Cloud `POST /v1/check-in/lookup`. | Completed locally; lets the first mobile flow step use the deployed server-side Roller lookup. |
| `T0011 Data API access smoke` | Verify Roller Data API access and lock modified-date sync strategy. | Prevents building Aurora ingestion against the wrong Data API mental model. |
| `T0012 Data API bookingitems import` | Upsert `/data/bookingitems` records into Aurora. | Completed locally against dev; starts the local booking index with confirmed Data API payload shape. |
| `T0013 Product catalog cache` | Cache Roller products and enrich booking item product names in Aurora. | Lets the booking index show human-readable products instead of only Roller product IDs. |
| `T0014 Related Data API sources` | Add tickets, payments, and customer/contact data once endpoint docs/access are confirmed. | Completed locally against dev Aurora; completes payment/contact/ticket context for lookup, SMS, and redemption. |
| `T0015 Booking webhook intake` | Implement safe webhook intake and idempotency. | Completed locally and deployed to dev; provides the same-day change signal intake before enrichment/snapshot updates. |
| `T0016 Aurora-first lookup` | Use Aurora for lookup display, then refresh from Roller when missing or unsafe. | Completed locally and deployed to dev; lets phone lookup stop depending on a live Roller read for every normal display lookup. |
| `T0017 Booking webhook enrichment` | Refresh Roller booking detail from webhook events and update Aurora snapshots. | Completed locally and deployed to dev; turns same-day webhook signals into fresh booking snapshots once Roller delivery is registered. |
| `T0018 Roller Playground webhook registration` | Register the Playground booking webhook against the dev endpoint and confirm real delivery headers/body. | Completed locally and deployed to dev; real Roller deliveries now update Aurora through webhook enrichment. |
| `T0019 Phone lookup display/source polish` | Decide whether to expose source/freshness/debug status in phone/admin UX. | Completed locally; source/freshness metadata is available for verification but remains hidden from guests by default. |
| `T0020 Redeem spike/server endpoint` | Add a safe server-owned redeem planning endpoint and keep Roller redemption writes disabled until controlled execution is scoped. | Completed locally and deployed to dev; next step is controlled redeem execution with auth/session and final refresh rules. |
| `T0021 Controlled Playground redeem execution` | Protect confirmed dev redemption with a separate token, refresh live Roller state, then execute one controlled Playground redeem. | First real ticket-level check-in write, still dev-only and not wired to phone UI. |
| `T0022 Phone/staff redeem handoff design` | Lock how the phone flow hands a ready booking to staff/server-owned final redeem. | Prevents exposing the T0021 dev token or future production redeem authority to the frontend. |
| `T0023 Check-in session API skeleton` | Implement the server-owned check-in session/handoff endpoints without redeeming tickets from the phone UI. | Gives the phone flow a safe next step after lookup while keeping final Roller redemption behind staff/server confirmation. |
| `T0024 Phone start-check-in session wiring` | Wire the phone app start-check-in CTA to `POST /v1/check-in/sessions`. | Completed; lets the guest flow create/resume a server-owned session while still keeping final Roller redemption out of the phone UI. |
| `T0025 Phone ready-for-staff handoff wiring` | Call `ready-for-staff` from the phone flow after the required guest-side steps are complete. | Completed locally; the guest flow now ends with a server-owned staff handoff code and still does not redeem tickets. |
| `T0026 Staff/admin handoff list/detail` | Show sessions waiting for staff and let staff inspect booking/session state. | Completed locally; gives staff a read-only surface for the server-owned handoff before final redeem. |
| `T0027 Staff-confirmed redeem from session` | Redeem selected tickets from the server-owned session after staff confirmation and final Roller refresh. | Completed and deployed to dev; completes the first end-to-end existing-booking check-in write path in dev. |
| `T0028 QR/handoff lookup polish` | Improve how staff finds handoff sessions by QR payload or short code. | Completed locally; phone QR uses the server-owned handoff payload, and admin can scan/paste/open the exact session. |
| `T0029 Phone session resume` | If lookup finds an existing active session, resume the correct phone state instead of restarting the whole flow. | Completed locally; paid lookup now starts/resumes the session, `ready_for_staff` resumes directly from search to QR, completed/redeemed resumes to an already checked-in state, and guest-in-progress continues normally. |
| `T0030 New booking/payment discovery spike` | Confirm the exact Roller Playground path for draft booking, payment token, test/fake card, and whether payment can stay inside the PWA without a hosted payment-link detour. | Completed locally; draft booking and `paymentJwt` are confirmed, while Roller payment-library authorization, domain allowlisting, package download, and test card details remain prerequisites for full in-app payment. |
| `T0031 Server-side booking quote/draft` | Add JumpYard Cloud endpoints for new-booking quote and draft creation against Roller Playground, without phone UI payment yet. | Completed and deployed to dev; quote returns normalized costs without creating a booking, draft returns a Roller draft id plus payment-session data behind idempotency and confirmation. |
| `T0032 Payment package proof-of-concept` | Verify the Roller payment-library package, fake/test card flow, and public HTTPS allowlisting path against the T0031 draft response. | Completed locally as a safe POC harness; quote/draft can be exercised through JumpYard Cloud, but full payment execution remains blocked by external Roller prerequisites. |
| `T0033 Phone create-booking pre-payment flow` | Wire the phone app to product/time selection, server-side availability/capacity check where needed, quote, guarded draft creation, and a payment-pending state. | Completed and deployed to dev; phone buy-entry now reaches a Roller Playground draft and stores safe pre-payment draft state in Aurora without rendering payment UI. |
| `T0034 Existing-booking add-product draft step 1` | Add server-side quote and separate add-on draft creation for existing bookings, linked in JumpYard Cloud. | Completed and deployed to dev; no phone UI wiring or payment execution yet. |
| `T0035 Phone add-product UI wiring` | Wire existing-booking add-products in the phone flow to the T0034 quote/draft endpoints. | Completed locally; lets a guest add mapped add-ons to an existing check-in session, create a separate linked Playground draft, and stop at payment pending. |
| `T0036 Data API backfill and sync foundation` | Build a fuller Data API import path for bookingitems, tickets, payments, and customers/contact data so Aurora can be filled consistently from Roller exports. | Completed locally; gives JumpYard Cloud a repeatable booking baseline before SMS links and production-like operating workflows. |
| `T0037 Scheduled daily Data API sync` | Move the T0036 import path into a scheduled dev AWS sync that runs a daily modified-date window and records run status. | Completed in dev AWS; keeps Aurora reconciled even if webhooks are delayed, disabled, or out of order. |
| `T0038 SMS token/session link foundation` | Add secure JumpYard Cloud links that can resume or start a booking check-in session without exposing raw booking numbers as authority. | Completed and deployed to dev; prepares the phone flow for SMS delivery while keeping session ownership server-side. |
| `T0039 SMS sending` | Integrate the selected SMS provider and send check-in links from server-owned booking/session state. | Completed in dev AWS; dry-run is default, AWS SNS send is behind explicit confirmation, and audit rows are stored in `jumpyard.sms_deliveries`. |
| `T0040 Roller payment package/drop-in integration` | Old payment placeholder. | Superseded by T0050-T0053 so future sessions do not jump backward from T0049. |
| `T0041 Controlled SMS live smoke` | Send one confirmed dev SMS through JumpYard Cloud and document whether AWS SNS accepts it. | Completed locally against dev; provider accepted the message, but link usability still needs a public/mobile-reachable app URL. |
| `T0042 SMS delivery diagnostics` | Configure SNS delivery status logs and diagnose why the approved phone did not receive the accepted SMS. | Completed in dev AWS; delivery status logs show the AWS account is still in SNS SMS sandbox mode. |
| `T0043 SNS sandbox phone verification` | Verify the approved test phone in SNS sandbox and resend a JumpYard Cloud SMS. | Completed locally against dev; SNS delivery status logs show `SUCCESS` for the verified test phone. |
| `T0044 Phone SMS link resume` | Make SMS links open the phone app via `jy_token` and resolve through JumpYard Cloud. | Completed locally and deployed to dev; phone links now use server session state instead of mock token data. |
| `T0045 Booking-time SMS trigger` | Connect SMS sending to booking time windows, for example sending a check-in link before the jump time. | Completed in dev foundation; protected endpoint plans due bookings by time and sends only with explicit confirmation. |
| `T0046 Scheduled booking-time SMS processing` | Run the booking-time SMS trigger from EventBridge without staff/admin manually calling it. | Completed in dev AWS; dev schedule runs every 5 minutes in planning mode with real sending still disabled until public/mobile URL and SMS production readiness are approved. |
| `T0047 Staff auth replacement for temporary dev code` | Replace the normal admin handoff temporary redeem-code flow with server-owned staff login and short-lived staff tokens. | Completed locally and deployed to dev; production SSO/Cognito and roles remain follow-up work. |
| `T0048 Staff operations polish` | Make the staff/admin handoff app mobile-friendly and visually aligned with the phone check-in app. | Completed locally; historical display-font imports were removed from check-in app shells, and no backend, AWS, Roller, SMS, or payment behavior changed. |
| `T0049 Confirmed scheduled SMS sends` | Add the safe config/runtime gate required before scheduled booking-time SMS can send real messages unattended. | Completed and deployed to dev; dev remains planning-only until a public HTTPS app URL, approval phrase, SNS sender/sandbox policy, and messaging policy are approved. |
| `T0050 Payment readiness/bootstrap` | Lock payment prerequisites, verify `/venues/me` paymentSettings, set the public test origin, and document the T0040 replacement. | Completed and merged; no booking writes, payment UI, or AWS changes. |
| `T0051 New-booking payment execution` | Integrate the Roller Payments package/drop-in for new booking drafts created through the existing phone buy-entry flow. | Completed and merged with package `v217` vendored and phone buy-entry wired; public end-to-end payment smoke is now unblocked by Pabel's allowlist confirmation and still needs execution. |
| `T0052 Add-product payment execution` | Reuse the same payment execution path for separate linked add-product drafts. | Completed and merged; existing-booking add-product drafts now use the shared Roller payment component when JWT/config are present. |
| `T0053 New-booking basket before payment` | Move add-ons before contact/review/payment in the phone buy-entry flow. | Completed and merged; one Roller draft/payment now represents entry plus selected mapped add-ons. |
| `T0054 Public payment method smoke` | Confirm public payment-package behavior, explain Swish success, and lock the missing card/scheme blocker. | Completed and merged; Swish works publicly, while card/scheme needs Roller/Adyen configuration. |
| `T0055 New-booking paid continuation` | After a paid new booking, route directly into the check-in/safety/QR path and add a buy-entry progress bar. | Completed and merged; phone-flow only, no AWS/backend/payment-package changes. |
| `T0056 Payment draft status reconciliation` | Mark local prepayment draft rows as `published` after Roller confirms the paid/published booking through lookup or webhook enrichment. | Completed locally and deployed to dev; backend lifecycle reconciliation only. |
| `T0057 Integrated smoke test` | Run a focused end-to-end dev/Playground smoke across lookup, payment reconciliation, session, safety handoff, staff auth, staff detail, and redeem. | Completed and merged through PR #60; test/documentation only. |
| `T0058 Stack production readiness` | Audit the dev AWS stack, deployment config, environment separation, secrets, observability, rollback posture, and production cutover prerequisites before any staging/live setup. | Completed and merged through PR #61; docs-only, no AWS changes. |
| `T0059 Redeem eligibility filter` | Filter check-in session selection and final redeem so Roller receives only redeemable pass/session/party-package/membership ticket ids, not stock/add-on ticket ids. | Completed locally and deployed to dev; mixed booking smoke redeemed only entry tickets and left add-on tickets unredeemed. |
| `T0060 API security and observability hardening` | Add explicit dev API CORS origins, CloudWatch dashboard/alarms, API request visibility, and safe Roller outbound API call counters. | Completed locally and deployed to dev; no app behavior, Roller business logic, or Aurora schema changed. |

Deterministic Playground test bookings means fixed, repeatable test scenarios rather than random data. The seed tool should create known cases such as paid-ready, pending-payment, wrong-date, already-redeemed, SkyRider/add-on, and stock/add-on routing scenarios. It must be protected, server-side, Playground-only, and never part of the public phone UI.

T0008 uses `npm run roller:seed:playground` as the local seed command. It reads Roller products first, maps seed scenarios to child/variation product IDs, and defaults to dry-run. Writes require `--apply` plus `ROLLER_SEED_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_BOOKINGS`.

## AWS Dev Target

- AWS account id: `376129878018`
- AWS profile/login method: `wrlds-dev` profile, matching the Bluetooth Hub dev deploy workflow.
- AWS region: `eu-north-1`
- Environment: `dev`
- Resource prefix: `jumpyard-check-in-dev`
- Stack: `jumpyard-check-in-dev-stack`
- API endpoint: `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`
- Aurora PostgreSQL engine: `aurora-postgresql 16.13`
- Aurora database: `jumpyard_cloud`
- Aurora schema: `jumpyard`
- Aurora migration command: `npm --prefix infra run migrate:dev`
- `WRLDS:Client`: `JumpYard`
- `WRLDS:Project`: `jumpyard-check-in`
- `WRLDS:Owner`: `love`
- `WRLDS:Repository`: `wrlds-creations/jumpyard-check-in`
- `WRLDS:ManagedBy`: `cdk`
- `WRLDS:DataClassification`: `internal`
- `WRLDS:Exportable`: `true`
- `WRLDS:CostCenter`: `unassigned`
- `WRLDS:CreatedBy`: `love`

## Roller Playground Configuration

- `ROLLER_ENV` must be `playground`.
- `ROLLER_BASE_URL` must clearly point to a Playground environment. ROLLER's documented Playground base URL is `https://api.play.roller.app`.
- Production/live-looking Roller URLs must be rejected before any client is created.
- `ROLLER_CLIENT_ID` and `ROLLER_CLIENT_SECRET` are optional for basic environment validation during T0001.
- Roller secrets must never be logged or committed.

## Roller Smoke Test

- `npm run roller:smoke` loads local `.env` values and reuses the Playground environment guard.
- The smoke test obtains a short-lived OAuth token through the server-side Roller client and then makes one read-only smoke request.
- The default read endpoint path is `/products`; override with `ROLLER_SMOKE_PATH` only if Roller confirms a different harmless read path.
- The script reports status and response shape only; it does not print credentials, access tokens, or full Roller response payloads.

## Confirmed Roller Playground Facts

- `GET /products` returned 96 products in Playground on 2026-05-19.
- `GET /products` returned 96 top-level products and 491 flattened products/variations in Playground on 2026-05-20.
- T0008 dry-run resolved seed payload product IDs to child/variation IDs, including `1765836` for `Entré 120 min`, `1765445` for `JumpSocks`, `1765443` for `SkyRider`, and `1765441` for `Hänglås`.
- T0008 created six deterministic Playground bookings on 2026-05-20:
  - `5032210`: paid-ready, status `Paid`, amount owing `0`, total `610`.
  - `5032211`: pending-payment, status `PendingPayment`, amount owing `260`.
  - `5032212`: wrong-date, status `PendingPayment`, amount owing `260`.
  - `5032213`: SkyRider/add-on, status `PendingPayment`, amount owing `300`.
  - `5032214`: original booking for linked add-on flow, status `PendingPayment`, amount owing `260`.
  - `5032215`: separate linked add-on booking, status `PendingPayment`, amount owing `92`.
- `GET /bookings/5001370` returned HTTP 200 in Playground and accepted the booking reference as the path id.
- `GET /bookings?date=2026-05-19` returned one booking in Playground on 2026-05-19.
- Known Playground booking for lookup testing: booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`.
- Known Playground ticket from that booking: `5001370-21265504`.
- Dev `POST /v1/check-in/lookup` was deployed in T0009 and returned:
  - `5032210`: `found`, `ready`, `canCheckIn=true`.
  - `5032211`: `found`, `payment_required`, `canCheckIn=false`.
  - `5032212` with expected date `2026-05-21`: `found`, `wrong_date`, `canCheckIn=false`.
  - `999999999`: `not_found`, HTTP `404`.
- T0010 phone lookup uses public, non-secret config:
  - `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL`
  - `NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE`
- T0019 changed the phone lookup default expected date to today's date in `Europe/Stockholm` when no explicit `NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE` override is set.
- T0011 confirmed current Playground credentials can access Roller Data API `GET /data/bookingitems`.
- T0011 `npm run roller:data:smoke` for modified-date window `2026-05-20 -> 2026-05-21` returned:
  - response shape: `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, `items`
  - records returned: `9`
  - seed booking references found: `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, `5032215`
  - returned booking dates: `2026-05-21`, `2026-05-22`
  - modified date range: `2026-05-20T09:05:03Z -> 2026-05-20T09:05:05Z`
- T0012 imported the same modified-date window into dev Aurora:
  - `jumpyard.roller_bookings`: 6 seed booking rows matched
  - `jumpyard.roller_booking_items`: 9 seed booking item rows matched
  - latest `jumpyard.booking_seed_runs` status: `succeeded`
  - imported booking references: `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, `5032215`
- T0013 imported Roller product catalog data into dev Aurora:
  - `jumpyard.product_catalog_cache`: 491 product/variation rows matched
  - `jumpyard.roller_booking_items`: 9 seed booking item rows enriched with product names
  - sample enriched product names: `Biljetter (260 kr)`, `Antal`, `SkyRider 1 åk`, `Hänglås`, `Islatte`
- T0014 imported related Data API sources into dev Aurora:
  - `jumpyard.roller_booking_tickets`: 6 ticket rows matched
  - `jumpyard.roller_booking_payments`: 0 payment rows matched for the seed window
  - `jumpyard.guest_profiles`: 6 customer contact rows matched with structured email/phone plus masked/hash fields
  - `/data/bookingpayments` returning 0 rows for this seed window is a valid empty result, not a failure
- T0015 deployed dev webhook intake:
  - endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
  - dev token secret: `/jumpyard-check-in-dev/webhooks/dev-token`
  - unauthorized requests return HTTP `200` with `ignored_unauthorized` and are not persisted
  - authorized first delivery returns HTTP `200` with `accepted`
  - authorized duplicate delivery returns HTTP `200` with `duplicate`
  - Aurora row `t0015-smoke-booking-created-5032210` exists in `jumpyard.roller_webhook_events` with status `received`
- T0016 deployed Aurora-first lookup:
  - `5032210`: `found`, `ready`, source `jumpyard_cloud`, no Roller refresh
  - `5032211`: `found`, `payment_required`, source `jumpyard_cloud`, no Roller refresh
  - `5032212`: `found`, `wrong_date`, source `jumpyard_cloud`, no Roller refresh
  - `5001370`: live-refreshed once from Roller, upserted into Aurora, and now reads from `jumpyard_cloud`
  - `999999999`: `not_found`, HTTP `404`
  - invalid JSON: `invalid_json`, HTTP `400`
- T0017 deployed webhook enrichment:
  - event `t0017-deployed-webhook-enrich-5032210-20260521095241`: HTTP `200`, status `accepted`, enrichment `processed`
  - refreshed booking `5032210` from Roller REST into Aurora with 2 items and 4 tickets
  - matching `jumpyard.roller_webhook_events` row status is `processed`
- T0018 registered the real Roller Playground booking webhook:
  - Roller webhook id `238`
  - endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
  - subscribed events `created`, `updated`, and `cancelled`
  - include `tickets=true`
  - real Roller delivery uses header `x-roller-apikey`
  - real created-booking event for booking `5032443` reached AWS, enriched through Roller REST, and wrote `status=processed` in `jumpyard.roller_webhook_events`
- T0019 verified phone lookup for manually created Playground booking `5032444`:
  - dev API returned `found`, `payment_required`, source `jumpyard_cloud`, and freshness `fresh`
  - browser flow opened the booking summary, showed `Obetald`, kept `Betalning krävs` disabled, and confirmed metadata `sourceSystem=jumpyard_cloud`, `freshness=fresh`

T0020 confirmed Roller `POST /redemptions` request rules:

- request body uses `tickets[]`
- each ticket requires `ticketId`
- `redemptionDate` is optional
- `redemptionDevice` identifies the device name
- one call accepts at most 10 unique ticket ids

T0021 confirmed controlled Roller Playground redemption behavior:

- dev token secret: `/jumpyard-check-in-dev/redeem/dev-token`
- `confirmRedeem=true` without token returns HTTP `403` before Roller writes
- safe planning still works without token when `confirmRedeem=false`
- dedicated paid Playground booking `5032454` was created for the controlled redeem smoke
- dedicated ticket `5032454-21397335` redeemed successfully through Roller Playground
- Aurora marks ticket `5032454-21397335` with `redeem_status_last_seen='redeemed'`
- reusing the same booking/ticket is blocked locally as `already_redeemed`
- a non-existent `redemptionDevice` causes Roller HTTP `409` with `Redemption device not found`, so JumpYard Cloud omits `redemptionDevice` unless a real Roller device name is configured

T0022 locks the handoff boundary:

- the phone app may start or resume a JumpYard Cloud check-in session
- the phone app must not call the confirmed redeem path with a secret token
- final redeem must be staff/admin-confirmed or server-trusted
- the final redeem path still needs the T0021 live Roller refresh and eligibility re-check before writing to Roller

T0023 confirmed server-side session behavior:

- dev endpoint `POST /v1/check-in/sessions` creates or resumes a session from Aurora booking/ticket snapshots
- dev endpoint `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff` marks the session ready for staff and creates a handoff code
- booking `5032210` created session `jycs_mpfe3dum_7dc29b1b` and was later resumed
- booking `5032211` was blocked as `payment_required`
- session `jycs_mpfe3dum_7dc29b1b` was marked `ready_for_staff` with handoff code `JY6085`
- no Roller API calls or Roller writes happen in the session API

T0024 confirmed phone session-start behavior:

- phone endpoint client calls `POST /v1/check-in/sessions`
- paid booking `5032210` resumes session `jycs_mpfe3dum_7dc29b1b` before leaving booking summary
- phone flow stores `checkinSessionId` and session status in flow state
- unpaid booking `5032211` remains blocked on the booking summary with disabled `Betalning krävs`
- no Roller API calls, Roller secrets, or redeem tokens were added to phone code

T0025 confirmed phone ready-for-staff behavior:

- safety attestation completion calls `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`
- phone flow stores `handoffStatus` and `handoffCode` in flow state
- booking `5032210` reached `APP_CONFIRM` with session `jycs_mpfe3dum_7dc29b1b`
- final screen showed handoff code `JY6085` and QR payload `JY_HANDOFF:JY6085:jycs_mpfe3dum_7dc29b1b`
- no Roller API calls, Roller secrets, or redeem tokens were added to phone code

T0026 confirmed staff handoff list/detail behavior:

- dev endpoint `GET /v1/staff/check-in/sessions` lists active sessions with `handoff_status='ready_for_staff'`
- dev endpoint `GET /v1/staff/check-in/sessions/{checkinSessionId}` returns booking summary, booking items, tickets, and selected-ticket markers
- admin app reads JumpYard Cloud directly and shows handoff `JY6085` for booking `5032210`
- staff handoff list/detail returns no guest email or phone
- no Roller API calls, Roller writes, or redeem actions happen in staff list/detail

T0027 confirmed staff-confirmed redeem behavior:

- dev endpoint `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem` uses the existing redeem Lambda and T0021 final refresh path
- the endpoint requires the dev redeem token until staff auth is implemented
- a ready-for-staff session must have `safety_status='completed'`
- successful redeem marks selected local tickets as `redeemed`
- successful redeem marks the check-in session `status='redeemed'` and `handoff_status='completed'`
- admin app sends the temporary code only in the redeem request and does not persist it in browser storage or source

T0028 confirmed QR/handoff lookup behavior:

- phone QR payload remains `JY_HANDOFF:<handoffCode>:<checkinSessionId>`
- phone confirmation shows the QR plus short handoff code and keeps the full payload in DOM test/debug attributes
- admin app can parse `JY_HANDOFF:<handoffCode>:<checkinSessionId>`, `JY_SESSION:<checkinSessionId>`, raw `checkinSessionId`, and short `JY####` handoff codes
- full QR payload opens the exact session detail by `checkinSessionId`
- short handoff code selects a matching active waiting-list session
- browser camera scanning uses the existing admin `@zxing/browser` dependency and stops after success or close

T0029 confirmed phone session resume behavior:

- successful paid lookup starts/resumes the JumpYard Cloud session so active resume states can route before the booking summary
- `ready_for_staff` session resumes route directly to `APP_CONFIRM` from search
- completed/redeemed sessions or `already_redeemed` start responses route to `APP_PRESENT` with an already checked-in state
- guest-in-progress sessions still route through the normal add-ons/safety flow
- no Roller calls, redeem tokens, admin code, backend code, or AWS resources changed

T0030 confirmed Roller draft/payment discovery facts:

- `npm run roller:payment:discover` loads local `.env`, reuses the Playground guard, reads Roller products, selects a jump/session variation, and defaults to dry-run without creating a booking
- `npm run roller:payment:discover:apply-draft` fails closed without `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_DRAFT_BOOKING`
- guarded direct apply created Playground draft booking unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2` for `2026-05-22` at `10:00`
- the draft response returned HTTP `201`, total `260`, amount owing `260`, and a present three-part `paymentJwt`
- the script prints only safe response shape and never prints secrets, access tokens, or the raw payment JWT
- Roller Payments via API docs confirm the intended custom checkout flow: call `POST /bookings/draft`, pass the returned JWT to Roller's payment library, receive Adyen drop-in payment status, and use booking-created webhook as a success signal
- Pabel confirmed on 2026-05-26 that API-key access authorizes Roller Payments via API for this venue, payment config is under `paymentSettings` from `GET /venues/me`, `https://jumpyard-check-in.pages.dev` is allowlisted for Playground payment testing, and Adyen's Visa test card ending `1142` should be used from official Adyen docs

T0053 confirmed the buy-entry payment order:

- guests choose jump time, entry product, quantity, and add-ons before contact/review
- the phone flow creates one Roller Playground draft containing the entry item plus selected mapped add-ons
- the payment step is one payment for the combined basket, not a payment before add-ons
- existing-booking add-products stay on the separate linked add-on draft path from T0052

T0054 confirmed the public payment-package behavior after Pabel's allowlist:

- `https://jumpyard-check-in.pages.dev` runs the T0053 buy-entry order and can render the Roller/Adyen payment UI.
- A public Playground payment using Swish completed and produced paid booking `5063382`.
- JumpYard Cloud lookup returned booking `5063382` as `Paid`, amount owing `0`, and `canCheckIn=true`.
- The phone app does not filter out card payment methods; it passes the Roller payment package the payment JWT and public venue payment config.
- Roller's public ecom payment configuration currently returns no `scheme` card method for this Playground configuration, and the rendered payment UI exposes Swish/Google Pay but no card fields.
- Card entry with the Adyen Visa test card ending `1142` therefore needs Roller/Adyen configuration help, specifically enabling or confirming the card/scheme payment method for Playground custom checkout.

T0055 confirms the new-booking paid continuation direction:

- the `Köp entré` path shows a compact buy-entry progress indicator from the first time-selection screen
- the visible buy-entry progress path is entry, add-ons, payment, safety, done
- time, ticket selection, and jumper quantity are grouped under entry; contact and summary are grouped under payment; safety and the final QR handoff/done screen remain visible as their own final steps
- after approved payment and paid booking lookup, a new buy-entry booking starts or resumes the JumpYard Cloud check-in session and continues to safety instead of returning through the existing-booking summary/add-ons/payment loop
- ready-for-staff sessions still route directly to QR, and completed/redeemed sessions still show already checked in
- existing-booking lookup remains on the existing booking-summary path

T0056 reconciles the server-side prepayment draft lifecycle after Roller payment completion:

- `jumpyard.prepayment_booking_drafts` remains JumpYard Cloud operational state, while Roller remains the payment and booking source of truth
- lookup and webhook enrichment can mark a matching draft `published` when a settled Roller booking snapshot is seen
- matching uses the Roller unique id stored in `roller_draft_unique_id`
- pending, unpaid, partially paid, and positive-amount-owing snapshots do not publish the local draft
- raw payment JWTs remain response-only and are never persisted or logged
- dev smoke with paid booking `5063394` updated draft `jypd_835161973ab34210ac` to `published` and wrote a safe `prepayment_draft.published` event

T0057 is the integrated smoke-test checkpoint before more production hardening:

- no new app or AWS behavior should be built in this ticket
- the primary happy path should use dev/Playground only
- the smoke verified lookup, local payment-draft reconciliation, session start, ready-for-staff handoff, staff auth, staff detail, staff-confirmed redeem, and final Aurora state for today's entry-only Playground booking `5063420`
- the smoke also found that mixed entry plus stock/add-on bookings can select non-redeemable add-on tickets and fail Roller redeem with `Product type not accepted`
- smoke records use safe ids/statuses only and avoid secrets, raw JWTs, full phone numbers, and full email addresses
- T0058 is reserved for stack production readiness after this test checkpoint

T0058 audits the current dev stack for staging/live readiness before any new environment is created:

- no AWS resources were created, changed, deployed, or deleted
- AWS read-only checks confirmed account `376129878018`, region `eu-north-1`, stack status `UPDATE_COMPLETE`, API endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`, Aurora status `available`, and SNS SMS sandbox mode still enabled
- the dev stack is suitable for Playground development and controlled smoke tests, but it is not ready to copy directly to staging/live
- payment card/scheme remains parked on Roller/Adyen configuration until Pabel/Roller confirms the missing method

T0059 implements the `FU-054` redeem eligibility fix. Session creation now selects only Roller-redeemable ticket ids when a mixed booking has entry plus stock/add-on tickets, and final staff redeem re-applies the same filter after the required Roller refresh before calling `POST /redemptions`. The classifier uses structured product type metadata from Aurora tickets, booking items, and product catalog cache instead of fragile display-name rules. Dev smoke for mixed booking `5063419` selected and redeemed only entry tickets `5063419-21529629` and `5063419-21529630`, while add-on tickets `5063419-21529631` and `5063419-21529632` remained unredeemed.

T0060 closes the first dev observability gap from the T0058 readiness audit. Dev API CORS is now an explicit allow-list for local phone/admin origins and `https://jumpyard-check-in.pages.dev`. CloudWatch dashboard `jumpyard-check-in-dev-ops` shows API Gateway request/error/latency metrics, Lambda invocation/error/throttle/duration metrics, SQS/DLQ metrics, and custom Roller outbound API call/error metrics emitted safely from lookup, booking, redeem, webhook, and data-sync Lambdas. CloudWatch alarms with prefix `jumpyard-check-in-dev` now cover API 5xx, high API 4xx, Lambda errors/throttles, Roller API errors, and DLQ messages. This is still a dev hardening slice, not final production auth, WAF, rate limiting, incident routing, or runbook completion.

T0061 adds the first API Gateway protection boundary in dev. The `$default` stage now has environment-configured throttling with rate `25` requests/second and burst `50`, detailed route metrics stay enabled, API access logs feed a safe `JumpYard/Cloud` metric named `ApiThrottledRequestCount`, the operations dashboard includes throttled request visibility, and alarm `jumpyard-check-in-dev-api-throttled-requests` detects any HTTP `429` throttling. This protects the public API edge from accidental or abusive bursts without changing guest, staff, Roller, SMS, payment, webhook, session, or redeem behavior.

T0062 documents the production route boundary before implementing authorizers, WAF, CloudFront, custom domains, or route-specific limits. `API_PROTECTION_BOUNDARY.md` classifies every current JumpYard Cloud route as guest public, guest token, guest write, staff auth entry, staff protected, internal operations, Roller webhook, or legacy/dev-only. The key decision is that guest PWA routes can remain reachable but bounded, staff routes need API-boundary identity before staging/live, internal operations routes should not remain generally public, and Roller webhooks need production verification plus optional allowlisting.

T0063 adds the guest email messaging foundation next to the existing SMS link flow. JumpYard Cloud now supports a protected `POST /v1/check-in/session-links/send-email` route that creates the same opaque `jy_token` check-in link with channel `email`, writes safe audit rows to `jumpyard.email_deliveries`, supports dry-run preview without a verified sender, and fails closed for confirmed sends until an AWS SES sender/domain is configured. Dev scheduled SMS remains planning-only with `confirmSend=false`, while guest messaging base URLs now point at the public Cloudflare check-in app.

T0064 reorders the near-term roadmap after user direction: finish guest SMS and email before environment/cutover and broader staging/live readiness work. The implementation sequence became T0065 guest SMS completion, T0066 guest email completion, T0067 dev SES real-email smoke, then unified booking-time guest messaging. Environment/cutover, alarm runbooks, dev-token replacement, route auth/WAF, retention, rollback, and live backfill remain important, but they move after the messaging path is proven end to end.

T0065 completes the dev guest SMS path for the verified sandbox recipient. The protected SMS route still requires the check-in link dev token, keeps raw tokens/full links/full phone numbers out of responses and logs, now returns safe provider diagnostics including whether Sender ID is configured/requested, and uses booking start time in the short SMS copy when available. A confirmed smoke for booking `5063420` used the public Cloudflare check-in URL, wrote delivery `jysms_mppg15lj_7c660ef2` to Aurora as `sent`, and SNS delivery status reported `SUCCESS`. T0065 also fixes `jy_token` routing so a valid already-redeemed booking link shows the existing already-checked-in state instead of falling back to manual booking-code lookup. Dev scheduled booking-time SMS remains planning-only with `confirmSend=false`.

T0066 completes the dev guest email path as far as the current AWS SES setup allows. The protected email route still requires the check-in link dev token, keeps raw tokens/full links/full email addresses out of responses and logs, now returns safe provider diagnostics for sender/reply-to configuration, and uses booking start time in the email subject/body when available. A dry-run smoke for booking `5063420` used the public Cloudflare check-in URL, wrote delivery `jyem_mppic9ea_01a07299` to Aurora as `planned`, and kept the preview link as `[check-in-link]`. Real email sending remains intentionally blocked because SES in `eu-north-1` has `ProductionAccessEnabled=false` and no verified email/domain identities.

T0067 completes the first real SES-backed dev email smoke. AWS SES identity `love@wrlds.com` was created in account `376129878018`, region `eu-north-1`, with WRLDS tags after user approval to use that address for email testing, then verified successfully. Dev config now uses `love@wrlds.com` as the SES sender and reply-to address. Confirmed protected email smoke for booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`; SES accepted two test sends to masked destination `l***@w***.com`, and Aurora recorded sent delivery rows `jyem_mppo8w07_296c1a5e` and `jyem_mppo99gl_3c888240`.

T0068 unifies booking-time guest messaging. JumpYard Cloud now has a protected `POST /v1/check-in/session-links/send-due-messages` route and the existing EventBridge booking-time schedule invokes the same due-booking processor for both `sms` and `email` channels in planning mode. The legacy `send-due-sms` route remains compatible as SMS-only. Dev remains safe: `confirmSend=false` means the schedule plans candidates without sending real SMS or email, and confirmed scheduled sends still require the explicit approval phrase plus public HTTPS app URLs.

T0069 locks the next roadmap before broader staging/live readiness work. The team should first prove the current dev/Playground system as one integrated flow: Data API refresh, webhook enrichment, Aurora freshness, guest SMS/email messaging, phone check-in, staff handoff/redeem, and add-product/payment behavior. Environment/cutover, alarm runbooks, production auth/WAF, retention, deployment rollback, and live backfill remain required, but they should follow the stabilization tickets rather than starting immediately after T0068.

T0070 runs the first post-roadmap integrated dev smoke for the existing-booking check-in path. A fresh paid Roller Playground booking `5100836` for `2026-05-29` was created, found through JumpYard Cloud lookup from Aurora, started as a check-in session `jycs_mpqo1mlo_177e4e06`, marked `ready_for_staff`, staff-authenticated, staff-confirm redeemed, and ended with local session status `redeemed`, handoff status `completed`, and one local redeemed ticket. A leftover smoke retry session for booking `5100835` was also staff-redeemed as cleanup, leaving the staff ready list empty.

T0071 verifies Data API and webhook health after the integrated smoke. The dev EventBridge rule `jumpyard-check-in-dev-data-api-daily-sync` is enabled at `02:00 UTC` and targets `jumpyard-check-in-dev-stack-data-sync`. The latest scheduled run for `2026-05-28 -> 2026-05-29` succeeded, a manual current-day sync for `2026-05-29 -> 2026-05-30` succeeded with bookingitems, tickets, payments, customers, and products, and Aurora shows bookings `5100835` and `5100836` as fresh with item/ticket/payment rows. Recent Roller Playground booking webhooks for those bookings are `processed`, and lookup for `5100836` is served from `jumpyard_cloud` via `aurora:booking_reference` without a Roller refresh.

T0072 verifies guest SMS/email sender readiness without changing AWS resources or sending messages. Dev SMS remains constrained by SNS sandbox mode: one approved test phone is verified, `DefaultSMSType` is transactional, delivery status logging is configured, and the session Lambda requests sender id `JumpYard`, but actual handset sender display still needs a controlled T0073 smoke because the account has no default sender id attribute. Dev email remains constrained by SES sandbox mode: `love@wrlds.com` is verified for test sending, sending is enabled, but `ProductionAccessEnabled=false`, only an email-address identity exists, and no domain identity, DKIM signing, or custom MAIL FROM setup is in place. The booking-time EventBridge schedule still invokes the unified SMS/email processor every 5 minutes with `confirmSend=false`, so it plans only and does not send unattended guest messages.

T0073 proves the controlled unified booking-time guest message smoke. A scoped paid Roller Playground booking `5100877` for `2026-05-29 15:30` was created with only the verified test phone and verified dev email, then refreshed into Aurora by invoking the existing Data API sync for `2026-05-29 -> 2026-05-30`. The protected `POST /v1/check-in/session-links/send-due-messages` route first planned both channels and then processed one controlled `confirmSend=true` run with public base URL `https://jumpyard-check-in.pages.dev/`. Aurora recorded sent SMS delivery `jysms_mpqwyxay_e7fe6d3c` and sent email delivery `jyem_mpqwyxox_94ea00f5`, both with provider message ids present, and SNS delivery status reported `Message has been accepted by phone`. The user manually confirmed that both SMS and email arrived, and that the current message text is acceptable for now but needs copy polish before broader use. The normal EventBridge schedule remains planning-only with `confirmSend=false`; this does not unlock unattended sends to real guest phone/email yet.

T0074 prepares the SMS production unlock path without changing AWS resources. Read-only checks confirmed AWS account `376129878018`, region `eu-north-1`, SNS SMS sandbox `IsInSandbox=true`, AWS End User Messaging SMS `ACCOUNT_TIER=SANDBOX`, no sender IDs, no pools, SNS transactional SMS, monthly spend limit `1`, and 100 percent SNS SMS delivery-status sampling. Official AWS docs require an AWS Support production-access/sandbox-exit request before sending to unverified guest numbers, and the AWS End User Messaging SMS country table lists Sweden as supporting Sender IDs. Primary sources reviewed: `https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox-moving-to-production.html`, `https://docs.aws.amazon.com/sms-voice/latest/userguide/getting-started.html`, `https://docs.aws.amazon.com/sms-voice/latest/userguide/sender-id-request.html`, and `https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html`. The T0074 support-case draft should request transactional booking/check-in SMS for Sweden, public app URL `https://jumpyard-check-in.pages.dev/`, and sender/display goal `JumpYard`, but it still needs user-confirmed business details, estimated monthly volume, final message copy, opt-in/consent wording, and whether WRLDS submits now or waits. No support case is submitted in T0074, and scheduled guest messaging remains `confirmSend=false`.

T0074 AWS Support case draft:

```text
Subject: Request production SMS access for JumpYard check-in transactional messages

Account/Region: 376129878018, eu-north-1
Use case: Transactional booking-time check-in reminders for JumpYard visitors. The guest has a Roller booking and receives a link to complete check-in before arrival.
Application URL: https://jumpyard-check-in.pages.dev/
Countries: Sweden first. Add other countries later only when approved.
Message type: Transactional, not marketing.
Sender/display goal: JumpYard where supported.
Example SMS: Hej {firstName}, din hopptid börjar kl {time}. Checka in här: {secureLink}
Opt-in/consent: Customer provides phone number as part of the booking/check-in process and receives operational service messages about that booking. Final wording to be confirmed.
Opt-out/support: TBD before production rollout.
Expected volume: TBD by JumpYard/WRLDS before submission.
Peak rate: TBD by JumpYard/WRLDS before submission.
Data handling: Links use opaque JumpYard Cloud tokens; no Roller credentials or raw guest data are exposed in the frontend.
```

The post-T0074 guest messaging roadmap is locked in this order: T0075 unlocks email for real guest addresses through SES production access and sender-domain deliverability setup; T0076 deliberately enables unattended 30-minute-before booking-time sends only after SMS and email gates pass; T0077 adds channel-specific monitoring and runbooks. Broader environment/cutover, production auth, retention, and live backfill work follows after this messaging gate.

## T0058 Production Readiness Matrix

| Area | Result | Evidence | Before staging/live |
|---|---|---|---|
| Environment separation and naming | Partial | Only `infra/config/dev.json` and `infra/config/dev.example.json` exist; stack and resources are dev-prefixed and Playground-only. | Add reviewed staging/live config, names, tags, domains, and Roller environment split. |
| Secrets and parameters | Partial | Secrets Manager holds Roller creds, webhook token, redeem dev token, check-in link token, staff auth, and Aurora admin; SSM holds Playground env/base URL. | Replace dev tokens/passcode patterns, define rotation/ownership, and separate live secrets. |
| Data storage, retention, and PII | Partial | Aurora is encrypted, deletion-protected, backed up for 7 days, and stores structured email/phone plus masks/hashes; S3 raw bucket is encrypted, versioned, retained, and has 30-day lifecycle. | Lock retention/deletion/export policy for PII, event logs, snapshots, and any raw payload/archive use. |
| Public API exposure and auth | Partial | T0060 replaced wildcard CORS with explicit dev origins. T0061 added dev API Gateway stage throttling and 429 visibility. T0062 classifies every route boundary and documents the target live posture. API Gateway routes still have `AuthorizationType=NONE`; app-level tokens/staff auth protect only selected routes. | Implement the T0062 boundary with production auth, WAF or equivalent edge controls, route-specific limits, internal-only operations routes, and guest/staff public boundary rules. |
| Webhook security and retries | Partial | Playground webhook id `238` uses `x-roller-apikey`; Lambda stores idempotent events and can enrich from Roller REST. | Confirm production auth/signature/IP allowlisting and decide whether enrichment must move async before live traffic. |
| SMS/email readiness | In focus | EventBridge booking-time messaging schedule exists but dev config keeps `confirmSend=false`; SNS account is still sandboxed. T0065 confirmed manual SMS delivery to the verified sandbox phone using the public Cloudflare check-in URL. T0067 confirmed SES real-email delivery acceptance for verified dev identity `love@wrlds.com`. T0068 unified booking-time planning for SMS and email. T0072 confirmed SMS/email are still controlled-smoke ready only, not unattended-send ready. T0073 confirmed the unified due-message processor can send both SMS and email for one due booking to approved destinations. T0074 prepares the SMS production-access support package but does not submit it. | Before visitor-facing unattended sends: SMS production still needs AWS production access/sandbox exit, sender-display confirmation, final transactional copy, consent/support wording, expected volume, and any sender ID/provider setup. Email production still needs a verified domain or production from-address, recipient/sandbox policy, final sender/reply-to/consent text, DKIM/custom MAIL FROM where appropriate, and deliverability work. |
| Observability and alarms | Partial | T0060 added dashboard `jumpyard-check-in-dev-ops`, API/Lambda/DLQ/Roller API alarms, API Gateway access logs, and safe Roller outbound call metrics. T0061 added API throttling visibility and a 429 alarm. | Add notification routing, runbooks, Aurora health, scheduler-specific health, SMS failure metrics, webhook failure metrics, and production thresholds. |
| Rollback, migration, and deployment safety | Partial | CDK synth/build works; Aurora migrations are versioned; dev deploys have been manual and scoped. | Add release/runbook, preflight gates, rollback/restore plan, CI/CD identity, migration backup policy, and post-deploy smoke checklist. |
| Backfill, sync, and cutover | Partial | Daily Data API sync runs at `02:00 UTC`; manual backfill command exists; webhooks and lookup refresh update Aurora. | Define live backfill range, cutover order, webhook registration plan, freshness SLAs, and replay/reconciliation procedure. |
| Payment production readiness | Deferred | Swish works publicly; card/scheme is absent from current Roller/Adyen Playground methods. | Wait for Pabel/Roller before card smoke or card-specific production readiness. |

## Non-Goals For Current Ticket

- Do not build new app behavior or change UI files.
- Do not fix Roller/Adyen card method configuration.
- Do not enable real unattended SMS or email sends in T0074.
- Do not submit AWS Support cases or request Sender IDs in T0074.
- Do not change payment, staff auth, redeem, webhook, or Data API behavior in T0074.
- Do not write to Roller Live/production.
- Do not create staging or production AWS resources.

## Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| Which Roller Playground write scopes are enabled for create booking, draft booking, payment, and redemption? | Needed before booking/payment work. Draft booking creation is confirmed through T0030/T0031/T0032/T0033/T0034; Pabel confirmed Roller Payments API authorization when API keys can be generated. | `T0050/T0051` | `Partially answered` |
| Does Roller Playground support an in-app payment flow from draft booking `paymentJwt`, including documented test/fake card numbers and any domain allow-listing requirements? | Determines whether F1 can complete payment inside the JumpYard PWA or must use a hosted fallback. Pabel confirmed the docs, `paymentSettings`, Adyen test card ending `1142`, and that `https://jumpyard-check-in.pages.dev` is allowlisted. T0054 confirmed Swish works publicly, while card/scheme is missing from the current payment methods. | `T0050/T0054` | `Partially answered; card method blocked externally` |
| What is the best field or internal model for linking an original booking to a separate add-on booking? | T0034 selected `jumpyard.booking_links` with `add_on_group_id` plus add-product draft metadata in `jumpyard.prepayment_booking_drafts`. | `T0034` | `Answered for step 1` |
| Which products need reconfiguration from stock/add-on to ticket/session products for API-driven redemption? | Stock/add-on products are excluded from Roller ticket redemption webhook/API flow. | `TBD` | `Open` |
| Which Roller Data API endpoints and date ranges should power tickets, payments, and customers ingestion? | Required after bookingitems ingestion. | `T0036` | `Open` |
| Which webhook event id, signature, and payload fields does Roller provide in production? Playground delivery is confirmed with `x-roller-apikey`. | Required before exposing webhook intake beyond dev testing. | `TBD` | `Open` |
