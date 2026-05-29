# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

## Current Status

JumpYard Check-in dev AWS foundation is deployed, Aurora migrations through `0007` have been applied, the dev lookup endpoint uses Aurora-first booking lookup with Roller REST refresh, the dev booking endpoint reads Roller Playground availability, quotes costs, creates Roller Playground draft bookings server-side, persists safe pre-payment draft rows, and creates separate linked add-product draft bookings for existing bookings, the dev webhook endpoint records and enriches Roller webhook intake events, the dev data-sync Lambda is scheduled by EventBridge for daily Roller Data API reconciliation, the dev redeem endpoint plans/audits redemption, supports controlled Playground redemption behind a dev token, and exposes staff-confirmed session redeem protected by T0047 staff auth, the dev session endpoint creates/resumes server-owned check-in sessions, exposes staff-auth-protected handoff list/detail routes, creates/resolves hashed check-in session links with safe booking summaries for phone resume, can dry-run or explicitly send those links through AWS SNS with safe provider/Sender ID diagnostics, can dry-run or explicitly send SES-backed check-in email links with safe audit rows through verified dev identity `love@wrlds.com`, can plan booking-time guest messages for both SMS and email from one due-booking processor, and is invoked by a dev EventBridge booking-time messaging schedule in planning mode with a config/runtime guard for future confirmed sends, SNS SMS delivery diagnostics are configured for dev, the real Roller Playground booking webhook is registered, dev API CORS uses explicit allowed origins, API Gateway stage throttling is configured for dev, CloudWatch dashboard/alarms/API access logs are deployed for dev observability, safe Roller outbound API call counters and API throttled request counters are emitted through CloudWatch, and dev Aurora contains bookingitems, product catalog cache data, tickets, customer contact data, lookup-refreshed records, webhook-enriched records, scheduled sync run rows, session rows, check-in token hashes, SMS delivery audit rows, email delivery audit rows, pre-payment draft rows, booking links, idempotency rows, event logs, and redeem attempt audit rows.

T0058 production-readiness audit notes:

- AWS resources changed: none.
- Read-only AWS validation confirmed stack `jumpyard-check-in-dev-stack` status `UPDATE_COMPLETE`, API `m0uo5g4mde`, Aurora cluster `jumpyard-check-in-dev-aurora` status `available`, and SNS SMS sandbox status `IsInSandbox=true`.
- At T0058 audit time, `aws cloudwatch describe-alarms --alarm-name-prefix jumpyard-check-in-dev` returned no CloudWatch alarms; T0060 later added the first dev alarms.
- At T0058 audit time, API Gateway routes had `AuthorizationType=NONE` and wildcard CORS; T0060 later replaced dev wildcard CORS with explicit allowed origins, while route authorizers remain future production work.
- Dev is appropriate for Playground development and smoke testing, but staging/live must wait for the readiness gate documented in `PROJECT_CONTEXT.md`, `DECISIONS.md`, and `FOLLOWUPS.md`.

T0059 redeem eligibility notes:

- AWS resources changed: existing Lambda code only.
- Changed resources: `jumpyard-check-in-dev-stack-session` and `jumpyard-check-in-dev-stack-redeem`.
- Behavior: new sessions and final staff redeem exclude stock/add-on/retail/gift-card/fee ticket ids from Roller `POST /redemptions` while keeping pass/session/party-package/membership ticket ids.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Dev smoke: mixed booking `5063419` selected only entry tickets `5063419-21529629` and `5063419-21529630`; staff-confirmed Playground redeem succeeded for those two tickets, and add-on tickets `5063419-21529631` and `5063419-21529632` remained unredeemed in Aurora.

T0060 API security and observability notes:

- AWS resources changed: API Gateway CORS/stage settings, Lambda environment/code assets for Roller-calling handlers, CloudWatch dashboard, CloudWatch alarms, and API Gateway access log group.
- New dashboard: `jumpyard-check-in-dev-ops`.
- New log group: `/aws/apigateway/jumpyard-check-in-dev-api-access`.
- New alarms: `jumpyard-check-in-dev-api-5xx`, `jumpyard-check-in-dev-api-high-4xx`, `jumpyard-check-in-dev-roller-api-errors`, `jumpyard-check-in-dev-roller-ops-dlq-visible`, plus Lambda error/throttle alarms for lookup, booking, redeem, session, webhook, and data-sync.
- API CORS origins are now explicit: local phone/admin dev origins and `https://jumpyard-check-in.pages.dev`.
- Roller-calling Lambdas emit safe CloudWatch embedded metrics in namespace `JumpYard/Cloud`: `RollerApiCallCount` and `RollerApiErrorCount`, dimensioned by environment, handler, operation, and method. Metrics do not include secrets, access tokens, payment JWTs, raw Roller payloads, full phone numbers, or full emails.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Smoke: `POST /v1/bookings/availability` with `2026-05-28` and `10:00` returned `status=available` without creating a booking, and booking Lambda logs showed safe Roller API call metric entries for `oauth_token` and `get_product_availability`.

T0061 API protection boundary notes:

- AWS resources changed: API Gateway `$default` stage settings, CloudWatch dashboard, CloudWatch alarm, and CloudWatch Logs metric filter.
- API Gateway `$default` stage now has detailed metrics enabled plus default throttling: rate `25` requests/second and burst `50`.
- New metric filter on `/aws/apigateway/jumpyard-check-in-dev-api-access`: counts access log rows with status `429` into `JumpYard/Cloud` metric `ApiThrottledRequestCount`.
- Updated dashboard: `jumpyard-check-in-dev-ops` now includes API throttled requests in API request/error and last-5-minute widgets.
- New alarm: `jumpyard-check-in-dev-api-throttled-requests`.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Smoke: `POST /v1/bookings/availability` returned HTTP `200` after throttling was enabled, without creating a booking.

T0062 route auth and WAF/edge boundary notes:

- AWS resources changed: none.
- T0062 is documentation/design only; no CDK implementation, deploy, authorizer, WAF, CloudFront, custom domain, Lambda code, Aurora schema, or package dependency was changed.
- New source-of-truth file: `API_PROTECTION_BOUNDARY.md`.
- Route inventory is classified by trust boundary: guest public, guest token, guest write, staff auth entry, staff protected, internal operations, Roller webhook, and legacy/dev-only.
- Later implementation should apply route-specific limits, API-boundary staff identity, internal-only protection for operations routes, and WAF or equivalent edge controls before staging/live exposure.

T0063 guest messaging and email foundation notes:

- AWS resources changed: API Gateway route, session Lambda code/environment/IAM, and dev Aurora schema migration `0007`.
- Added route: `POST /v1/check-in/session-links/send-email`.
- Added Aurora table: `jumpyard.email_deliveries`.
- Email sends use the same `jumpyard.checkin_tokens` opaque `jy_token` model as SMS, with channel `email`.
- Dry-run email planning works without a verified SES sender and records masked/hashed destination details only.
- Confirmed email sends fail closed until `guestEmail.fromAddress` is configured with a verified SES sender/domain.
- SES account check in `eu-north-1` showed sending enabled but no email identities configured at T0063 start.
- Dev booking-time SMS remains planning-only with `confirmSend=false`; the dev check-in link base URL is now `https://jumpyard-check-in.pages.dev/`.

T0064 messaging-first roadmap notes:

- AWS resources changed: none.
- No CDK, Lambda, Aurora migration, AWS config, Roller config, secrets, or deployed resource was changed.
- Roadmap order changed only in source-of-truth docs: T0065 guest SMS completion, T0066 guest email completion, T0067 dev SES email smoke, and T0068 unified booking-time guest messaging now come before environment/cutover and broader production-readiness work.

T0065 guest SMS completion notes:

- AWS resources changed: existing session Lambda code only.
- Changed resource: `jumpyard-check-in-dev-stack-session`.
- Behavior: confirmed SMS responses now include safe `senderIdConfigured` and `senderIdRequested` diagnostics, and SMS copy includes the booking start time when Aurora has it.
- Link behavior: valid `jy_token` resolves for already-redeemed bookings now include safe booking context so the phone app can show the existing already-checked-in state instead of falling back to manual booking-code lookup.
- Dev config unchanged: scheduled booking-time SMS remains planning-only with `confirmSend=false`; SNS account remains in sandbox mode.
- Confirmed smoke: booking `5063420` sent through protected `POST /v1/check-in/session-links/send-sms` with public base URL `https://jumpyard-check-in.pages.dev/`, delivery `jysms_mppg15lj_7c660ef2`, masked destination `+46*****9508`, provider `aws_sns`, and provider message id present.
- Aurora verification: `jumpyard.sms_deliveries` row `jysms_mppg15lj_7c660ef2` has status `sent`, `dry_run=false`, provider `aws_sns`, and a provider message id.
- SNS verification: CloudWatch delivery status reported `SUCCESS` with provider response `Message has been accepted by phone.`
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28 for SMS diagnostics and again for the `jy_token` fallback fix; post-deploy `npm --prefix infra run diff:dev` showed no differences.

T0066 guest email completion notes:

- AWS resources changed: existing session Lambda code only.
- Changed resource: `jumpyard-check-in-dev-stack-session`.
- Behavior: protected email planning/sending responses now include safe `fromAddressConfigured` and `replyToConfigured` diagnostics, and email subject/body include the booking start time when Aurora has it.
- SES status: account `376129878018`, region `eu-north-1`, has sending enabled, `ProductionAccessEnabled=false`, max 200 emails per 24 hours, max send rate 1 email/second, and no configured email identities.
- Dry-run smoke: booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `email_planned`, delivery `jyem_mppic9ea_01a07299`, masked destination `t0***@example.invalid`, provider `aws_ses`, `fromAddressConfigured=false`, `replyToConfigured=false`, and preview subject `Dags att checka in kl 10:30`.
- Aurora verification: `jumpyard.email_deliveries` row `jyem_mppic9ea_01a07299` has status `planned`, `dry_run=true`, provider `aws_ses`, destination masked, and template `checkin_email_v1`.
- Confirmed-send guard: a confirmed email request returned HTTP `400` with `email_sender_not_configured`, so real sends remain blocked until a verified SES sender/domain is explicitly approved and configured.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; pre-deploy diff showed only the `SessionHandler` Lambda code asset changing.

T0067 real SES email smoke notes:

- AWS resources changed: SES email identity `love@wrlds.com` was created manually through AWS CLI in `eu-north-1`.
- Tags: the identity has the required WRLDS tags, with `WRLDS:ManagedBy=manual-aws-cli` because SES verification is a manual provider action.
- Status: SES reports `VerificationStatus=SUCCESS` and `VerifiedForSendingStatus=true`.
- Dev config: `infra/config/dev.json` sets `guestEmail.fromAddress` and `guestEmail.replyToAddresses` to `love@wrlds.com` for dev only.
- Deploy result: CDK diff showed only `SessionHandler` environment variables `EMAIL_FROM_ADDRESS` and `EMAIL_REPLY_TO_ADDRESSES`; deploy passed on 2026-05-28.
- Confirmed smoke: protected email route accepted two real SES sends for booking `5063420` to masked destination `l***@w***.com`; Aurora recorded sent deliveries `jyem_mppo8w07_296c1a5e` and `jyem_mppo99gl_3c888240` with provider message ids present.

T0068 unified booking-time messaging notes:

- AWS resources changed: existing session Lambda code, API Gateway route/integration/permission for `POST /v1/check-in/session-links/send-due-messages`, and existing EventBridge booking-time schedule target payload/description.
- New route: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-due-messages`.
- Existing compatibility route retained: `POST /v1/check-in/session-links/send-due-sms`.
- EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule` now sends trigger `scheduled_booking_time_messaging` with channels `sms` and `email`; the rule name is retained for continuity.
- Dev config remains `confirmSend=false`, so the schedule plans candidates only and does not send unattended real SMS or email.
- Deploy result: CDK deploy passed on 2026-05-28; post-deploy diff showed no differences.
- Smokes: protected unified route, legacy SMS route, and direct scheduled-event invoke all returned planning-mode responses with masked destinations only.

T0003 proposed the target JumpYard Cloud architecture only. T0004 added the CDK TypeScript foundation in `infra/`. T0005 defined the booking index ingestion contract only. T0006 deployed the foundation to AWS account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-dev-stack`. T0007 added and applied the first Aurora schema migration.

T0006 deploy notes:

- First deploy attempt failed because Aurora PostgreSQL `16.3` is not available in `eu-north-1`.
- The failed deploy rolled back. The retained empty S3 bucket was deleted, and the rollback stack record was removed before retry.
- Successful deploy uses Aurora PostgreSQL `16.13`.
- Post-deploy `cdk diff` shows no differences.
- Placeholder API smoke returned HTTP `501` as expected.

T0007 migration notes:

- Migration runner: `infra/scripts/run-migrations.ts`
- Migration command: `npm --prefix infra run migrate:dev`
- Status command: `npm --prefix infra run migrate:dev:status`
- Applied migration: `0001 initial schema`
- Aurora schema: `jumpyard`
- Verified tables: 15
- Verified indexes: 62

T0009 lookup deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-lookup`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Behavior: reads Roller credentials from Secrets Manager, reads Roller env/base URL from SSM Parameter Store, calls Roller `GET /bookings/{identifier}`, enriches product names from `/products`, and returns a normalized JumpYard response.
- Roller writes: none.
- Post-deploy diff: no differences.

T0012 dev data import notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to write normalized Roller Data API `/data/bookingitems` snapshots.
- Import command: `npm --prefix infra run import:bookingitems:dev:apply`
- Modified-date window: `2026-05-20 -> 2026-05-21`
- Imported rows matched after apply:
  - `jumpyard.roller_bookings`: 6 seed bookings
  - `jumpyard.roller_booking_items`: 9 booking items
  - `jumpyard.booking_seed_runs`: latest run `succeeded`
- Raw Roller payloads, customer names, emails, phone numbers, booking notes, secrets, and tokens were not printed or intentionally stored.

T0013 dev product cache notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to write normalized Roller REST `/products` cache rows and enrich existing booking item rows.
- Import command: `npm --prefix infra run import:products:dev:apply`
- Imported rows matched after apply:
  - `jumpyard.product_catalog_cache`: 491 product/variation rows
  - `jumpyard.roller_booking_items`: 9 existing booking item rows enriched with product names
- Raw Roller payloads, customer names, emails, phone numbers, booking notes, secrets, and tokens were not printed or intentionally stored.

T0014 related Data API import notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to apply migration `0002 related data sources`.
- Migration runner fix: migration checksums now normalize CRLF to LF before hashing so Windows line endings do not produce false checksum mismatches.
- Existing Aurora Data API was used to write normalized Roller Data API tickets, payments, and customers.
- Import command: `npm --prefix infra run import:related-data:dev:apply`
- Modified-date window: `2026-05-20 -> 2026-05-21`
- Imported rows matched after apply:
  - `jumpyard.roller_booking_tickets`: 6 ticket rows
  - `jumpyard.roller_booking_payments`: 0 payment rows
  - `jumpyard.guest_profiles`: 6 customer contact rows
- Email and phone are stored as explicit structured fields with hash/masked companion fields. Customer names, addresses, raw Roller payloads, booking notes, secrets, and tokens were not printed or intentionally stored.

T0015 webhook intake deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-webhook`
- Added secret: `/jumpyard-check-in-dev/webhooks/dev-token`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Behavior: verifies a dev token, parses Roller webhook JSON, deduplicates by event id or stable hash, stores normalized metadata in `jumpyard.roller_webhook_events`, and writes safe event-log rows for newly received events.
- Response behavior: HTTP `200` for accepted, duplicate, unauthorized, invalid JSON, and oversized requests; HTTP `500` for config/database/internal failures that should trigger Roller retry.
- Raw webhook payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0016 Aurora-first lookup deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-lookup`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Behavior: reads fresh local records from `jumpyard.roller_bookings`, `jumpyard.roller_booking_items`, and `jumpyard.roller_booking_tickets` before calling Roller; refreshes from Roller `GET /bookings/{identifier}` when local data is missing, stale, tombstoned, or unclear; and upserts refreshed booking/item/ticket metadata back into Aurora.
- Roller writes: none.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0017 booking webhook enrichment deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-webhook`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Behavior: verifies a dev token, deduplicates by event id or stable hash, refreshes accepted booking webhook events through Roller `GET /bookings/{identifier}`, enriches product names best-effort from `/products`, upserts booking/item/ticket metadata into Aurora, and marks webhook events `processed`, `pending_enrichment`, or `failed`.
- Roller writes: none.
- Real Roller Playground webhook registration: not done in T0017.
- Raw webhook payloads, raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0018 Roller Playground webhook registration notes:

- Changed AWS resource: `jumpyard-check-in-dev-stack-webhook`
- External Roller config changed: Roller Playground webhook id `238`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Registered events: `Created`, `Updated`, and `Cancelled`
- Registered include: `tickets=true`
- Confirmed delivery header: `x-roller-apikey`
- Behavior: real Roller `Created` events now reach the dev Lambda, pass dev-token verification, refresh `GET /bookings/{identifier}`, upsert Aurora booking/item/ticket snapshots, and mark webhook events `processed`.
- Verified real event: booking `5032443`, unique id `69ea56d8-969f-41a3-bda5-cb09ad8a67b2`, status `processed`.
- Raw webhook payloads, raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0020 redeem endpoint notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem`
- Behavior: resolves local Aurora booking/ticket snapshots, validates idempotency and Roller redemption request constraints, returns safe redeem plans, and records planned/blocked attempts in `jumpyard.checkin_attempts` plus safe business events in `jumpyard.event_log`.
- Roller writes: disabled in deployed dev config by `ENABLE_ROLLER_REDEEM_WRITES=false`.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0021 controlled redeem execution notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Added secret: `/jumpyard-check-in-dev/redeem/dev-token`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem`
- Behavior: `confirmRedeem=true` requires the dev redeem token, refreshes the booking from Roller REST, upserts the refreshed snapshot into Aurora, re-runs eligibility, and then calls Roller Playground `POST /redemptions`.
- Roller writes: enabled only for the protected dev path and still Playground-guarded.
- Controlled redeem smoke: dedicated booking `5032454` redeemed ticket `5032454-21397335` successfully through Roller Playground.
- Aurora verification: `jumpyard.checkin_attempts` contains the `redeemed` attempt and follow-up `already_redeemed` block; `jumpyard.roller_booking_tickets.redeem_status_last_seen='redeemed'` for `5032454-21397335`.
- Roller device note: an invalid `redemptionDevice` is rejected by Roller, so the dev Lambda omits `redemptionDevice` unless a real Roller device name is provided.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0023 check-in session API notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added routes:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions`
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions/{checkinSessionId}/ready-for-staff`
- Applied migration: `0003 checkin sessions`
- Added Aurora table: `jumpyard.checkin_sessions`
- Behavior: creates or resumes active server-owned check-in sessions from Aurora booking/ticket snapshots, blocks unpaid/wrong-date/inactive/already-redeemed contexts, marks sessions `ready_for_staff`, creates short handoff codes, and writes event-log rows.
- Roller calls: none.
- Roller writes: none.
- Verified session: booking `5032210` created/resumed session `jycs_mpfe3dum_7dc29b1b`, then marked it `ready_for_staff` with handoff code `JY6085`.
- Rejected smoke: booking `5032211` returned `payment_required`.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0026 staff handoff API notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added routes:
  - `GET https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions`
  - `GET https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions/{checkinSessionId}`
- Behavior: reads ready-for-staff sessions, booking summaries, booking item rows, and ticket summaries from Aurora for staff/admin inspection.
- Roller calls: none.
- Roller writes: none.
- Session writes: none.
- Contact PII: guest email and phone are not returned by the staff endpoints.

T0027 staff-confirmed redeem notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Added route:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions/{checkinSessionId}/redeem`
- Behavior: resolves the server-owned session from Aurora, requires `ready_for_staff` session/handoff state, requires completed safety status, requires the dev redeem token until staff auth exists, reuses the T0021 final Roller refresh and eligibility re-check, calls Roller Playground `POST /redemptions`, updates selected local tickets to `redeemed`, and marks the session `redeemed`/`completed`.
- Roller writes: enabled only for the protected dev path and still Playground-guarded.
- Token handling: admin users manually enter the temporary code for dev testing; it is not stored in source, browser env, localStorage, or sessionStorage.

T0031 booking quote/draft endpoint notes:

- Changed resource: `jumpyard-check-in-dev-stack-booking`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/quote`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/draft`
- Behavior: quote validates item input, reads Roller config/credentials server-side, fails closed unless configured for Playground, calls Roller `POST /bookings/draft/costs`, writes a safe event log, and returns normalized costs without creating a booking.
- Behavior: draft requires `confirmDraft=true` and an idempotency key, validates customer/items, calls Roller `POST /bookings/draft`, reads safe venue payment settings from `GET /venues/me`, writes idempotency and safe event-log rows, and returns draft/payment-session data for the future payment component.
- Roller writes: only the draft endpoint creates a Playground draft booking after explicit confirmation and idempotency; quote creates no booking.
- Payment JWT handling: raw `paymentJwt` is returned only in the API response for the future frontend payment component. It is not printed, logged, or persisted in Aurora.
- Deployed smoke: quote returned total `260`, amount owing `260`; draft returned unique id `2c1abf4f-944c-4122-a4ff-da8440c46321`, total `260`, amount owing `260`, `jwtPresent=true`, and `paymentConfigAvailable=true`.

T0033 phone pre-payment flow deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-booking`
- Added endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/availability`
- Applied migration: `0004 prepayment booking drafts`
- Added Aurora table: `jumpyard.prepayment_booking_drafts`
- Behavior: availability reads Roller Playground `GET /product-availability` through JumpYard Cloud, quote/draft re-check selected capacity before calling Roller draft cost/create endpoints, draft persists safe pre-payment metadata in Aurora, and the phone app stops at payment pending.
- Roller writes: only `POST /v1/bookings/draft` creates a Playground draft booking after `confirmDraft=true` and idempotency.
- Payment JWT handling: raw `paymentJwt` is response-only for future payment UI and is not persisted in `jumpyard.prepayment_booking_drafts`.
- Deployed smoke: availability returned product `E60` at `10:00` with capacity, quote returned total `200`, draft returned `paymentJwtPresent=true`, and Aurora row `jypd_5d96dca81de8429eb4` was verified.

T0034 add-product draft step 1 deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-booking`
- Endpoints:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/{bookingReference}/add-products/quote`
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/{bookingReference}/add-products`
- Applied migration: `0005 add product draft links`
- Changed Aurora table: `jumpyard.prepayment_booking_drafts` now has `flow_type`, `original_booking_reference`, `original_roller_unique_id`, and `add_on_group_id` for add-product draft tracking.
- Behavior: quote validates the original booking through Roller Playground and calls Roller draft costs without creating a draft or Aurora link; draft validates the original again, creates a separate Roller Playground draft booking, persists safe add-product pre-payment state, and links the original booking to the draft in `jumpyard.booking_links`.
- Roller writes: only `POST /v1/bookings/{bookingReference}/add-products` creates a Playground draft booking after `confirmDraft=true` and idempotency.
- Payment JWT handling: raw `paymentJwt` is response-only and is not persisted in Aurora; Aurora stores only `payment_jwt_present`.
- Deployed smoke: quote for original `5032210` and product `1765860` returned total `200` with `wroteBooking=false`; draft created Roller draft `18e85e91-9a53-4afd-a951-75d1a41eaf9f`, prepayment draft `jypd_2a5ad290e9c34eadaa`, and booking link `jyl_cf14c98651b4451aba`.

T0037 scheduled Data API sync deploy notes:

- Added resource: `jumpyard-check-in-dev-stack-data-sync`
- Added EventBridge rule: `jumpyard-check-in-dev-data-api-daily-sync`
- Schedule: `02:00 UTC` daily; imports the previous UTC modified-date window by default.
- Behavior: reads Roller Playground config from Secrets Manager and SSM, fails closed unless configured for Playground, imports `/data/bookingitems`, `/data/tickets`, `/data/bookingpayments`, `/data/customers`, refreshes REST `/products`, and upserts existing Aurora snapshot/cache tables.
- Public API routes: none.
- Roller writes: none.
- Run health: writes `scheduled-data-api:*` rows to `jumpyard.booking_seed_runs`.
- Manual smoke: run `scheduled-data-api:2026-05-20:2026-05-21:1779446219350` succeeded with 9 bookingitems, 6 tickets, 0 payments, 6 customers, 491 product rows, and no raw payload/PII output.
- Post-deploy diff: no differences.

T0038 check-in session link deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added secret: `/jumpyard-check-in-dev/checkin-links/dev-token`
- Added routes:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links`
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/resolve`
- Behavior: protected link creation validates an Aurora booking, generates a high-entropy raw token, stores only its SHA-256 hash in `jumpyard.checkin_tokens`, and returns the raw token/check-in URL only in the response. Public token resolution hashes the supplied token, marks the link opened, and starts or resumes a JumpYard Cloud check-in session without calling Roller.
- Roller calls: none.
- Roller writes: none.
- SMS provider calls: none.
- Raw token handling: raw tokens are not persisted, logged, printed in validation output, or committed.
- Deployed smoke: link creation returned `link_created` with token/url present, token resolution returned `session_started`, and Aurora `jumpyard.checkin_tokens` showed the hash row with `opened=true`, `consumed=false`, and `active=true`.
- Unauthorized smoke: link creation without the dev token returned HTTP `401`.
- Post-deploy diff: no differences.

T0039 SMS sending deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added route:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-sms`
- Applied migration: `0006 sms deliveries`
- Added Aurora table: `jumpyard.sms_deliveries`
- Added IAM permission: session Lambda can call `sns:Publish` for confirmed dev SMS sends.
- Behavior: protected SMS sending resolves an Aurora booking, creates a hashed check-in token, records a delivery audit row, defaults to dry-run, and calls AWS SNS only when `confirmSend=true`.
- Roller calls: none.
- Roller writes: none.
- Raw token handling: raw tokens and full check-in URLs are not returned by the SMS endpoint and are not persisted.
- Contact handling: response and audit use masked/hash destination only; raw phone is used only in memory for provider send.

T0041 controlled SMS smoke notes:

- AWS resources created or changed: none.
- Endpoint used: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-sms`
- Behavior tested: one protected confirmed send with `confirmSend=true` through the deployed T0039 path.
- Result: AWS SNS accepted the message for masked destination `+46*****9508`.
- Aurora verification: `jumpyard.sms_deliveries` row `jysms_mpgvzkpz_5b4ae399` has status `sent`, `dry_run=false`, provider `aws_sns`, provider message id present, token hash present, and sent timestamp present.
- Link note: the SMS used the current dev `http://localhost:3000/` base URL, so provider delivery can be verified before the link is mobile-reachable.
- Raw token handling: raw tokens and full check-in URLs were not printed or stored.
- Contact handling: docs and verification output use masked destination only.

T0042 SMS delivery diagnostics notes:

- Changed resource: `jumpyard-check-in-dev-stack`
- Added IAM role: `jumpyard-check-in-dev-sns-sms-delivery-status`
- Added CDK custom resource: `SmsDeliveryStatusAttributes`
- Configured SNS SMS attributes:
  - `DefaultSMSType=Transactional`
  - `DeliveryStatusSuccessSamplingRate=100`
  - `DeliveryStatusIAMRole=arn:aws:iam::376129878018:role/jumpyard-check-in-dev-sns-sms-delivery-status`
- Created/used CloudWatch Logs group: `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber/Failure`
- Diagnostic SMS result: Aurora row `jysms_mpgwlk9u_9566748e` is `sent`, `dry_run=false`, provider `aws_sns`, provider message id present, and token hash present.
- Delivery status result: CloudWatch SNS status is `FAILURE` with provider response `Sandboxed account unable to send to number.`
- SNS sandbox status: `IsInSandbox=true`.
- Raw token handling: raw tokens, full check-in URLs, SMS text, and full destination numbers were not printed or stored.

T0043 SNS sandbox phone verification notes:

- AWS resources created or changed: no CDK resources changed.
- External AWS SNS sandbox config changed: masked test phone `+46*****9508` is verified in SNS SMS sandbox.
- Endpoint used after verification: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-sms`
- Diagnostic SMS result: Aurora row `jysms_mpgxbla6_b59779cd` is `sent`, `dry_run=false`, provider `aws_sns`, provider message id present, and token hash present.
- Delivery status result: CloudWatch SNS status is `SUCCESS` with provider response `Message has been accepted by phone.`
- SNS sandbox status remains `IsInSandbox=true`, so only verified sandbox numbers can receive SMS until sandbox exit is approved.
- OTP handling: the sandbox OTP was used once through AWS SNS and was not stored or committed.
- Raw token handling: raw tokens, full check-in URLs, SMS text, and full destination numbers were not printed or stored.

T0044 phone SMS link resume notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Endpoint behavior changed: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/resolve`
- Behavior: successful token resolution now returns the server-owned check-in session plus a safe Aurora booking summary for phone UI rendering.
- Phone behavior: local phone app detects `jy_token`, calls the public resolve endpoint, opens guest-in-progress sessions at booking summary, opens ready-for-staff sessions at QR confirmation, and falls back to manual lookup for invalid or expired links.
- Roller calls: none.
- Roller writes: none.
- SMS provider calls: none.
- Contact handling: the resolve response does not return guest email or phone.
- Raw token handling: raw tokens remain request-only for resolution, are not stored in Aurora, and were not committed.

T0045 booking-time SMS trigger notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added route:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-due-sms`
- Behavior: protected endpoint plans upcoming Aurora bookings by booking date/start time using a default 30-minute lead and 10-minute window in `Europe/Stockholm`.
- Behavior: planning mode is the default and sends no SMS; real sends require `confirmSend=true` and reuse the existing T0039 SMS sender.
- Candidate rules: fresh active local booking snapshot, SMS-ready guest contact resolved from ticket customer id or booking-level `bookingCustomerId`, existing check-in session eligibility, and no recent real SMS delivery for the same booking/template.
- Roller calls: none.
- Roller writes: none.
- Scheduling: no EventBridge SMS schedule was created in T0045; automatic sending is deferred.
- Contact handling: response returns masked destinations only.
- Raw token handling: raw tokens and full check-in URLs are created only inside confirmed sends and are not returned by the due trigger or persisted.

T0046 scheduled booking-time SMS processing notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added EventBridge rule: `jumpyard-check-in-dev-booking-time-sms-schedule`
- Schedule: every 5 minutes in dev.
- Behavior: invokes the session Lambda internally with the T0045 due-SMS processor.
- Dev config: `confirmSend=false`, `leadMinutes=30`, `windowMinutes=10`, `limit=10`.
- Public API routes: none added; `POST /v1/check-in/session-links/send-due-sms` remains token-protected.
- Roller calls: none.
- Roller writes: none.
- Real SMS sends: disabled by dev config while the check-in app URL is still `http://localhost:3000/` and SNS sandbox constraints remain.
- Contact handling: scheduled results use the same masked-destination planning rules as T0045.
- Raw token handling: no raw tokens or full check-in URLs are created in planning mode.

T0049 confirmed scheduled SMS safety deploy notes:

- Changed resources: `jumpyard-check-in-dev-stack-session` Lambda code/config and EventBridge target payload for `jumpyard-check-in-dev-booking-time-sms-schedule`.
- Dev config remains `confirmSend=false`; scheduled real sends are not enabled by default.
- Scheduler config now carries an explicit `checkinBaseUrl` and `confirmedSendApproval` field.
- CDK config fails closed if `confirmSend=true` is set without approval phrase `I_APPROVE_CONFIRMED_SCHEDULED_SMS_SENDS` or without a public HTTPS check-in base URL.
- Runtime scheduled events also block confirmed sends when the approval phrase or public HTTPS URL is missing.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-25; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Public API routes: none added or changed.
- Roller calls/writes: none.
- SMS provider calls: unchanged for planning mode; no unattended SMS is sent by the safe dev config.
- Raw token handling: no raw tokens or full check-in URLs are created by scheduled planning runs.

T0047 staff auth deploy notes:

- Changed resources: `jumpyard-check-in-dev-stack-session`, `jumpyard-check-in-dev-stack-redeem`, and API routes.
- Added secret: `/jumpyard-check-in-dev/staff/auth`.
- Added route: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/auth/login`.
- Behavior: validates the AWS-stored staff passcode server-side and returns a short-lived staff token plus safe display metadata.
- Secret refresh: session and redeem Lambdas cache the staff auth secret for at most 30 seconds so dev passcode edits in Secrets Manager take effect without waiting for a cold Lambda start.
- Staff list/detail: require `Authorization: Bearer <staffToken>` or `x-jumpyard-staff-token`.
- Staff redeem: requires the staff token before delegating to the existing final Roller refresh/redeem path.
- Dev-token handling: the old direct redeem dev-token path remains only for controlled lower-level dev testing; the normal admin handoff UI no longer asks for it.
- Production note: this is a pilot/dev auth slice, not final Cognito/SSO/role-based staff identity.

T0056 payment draft reconciliation deploy notes:

- Changed resources: `jumpyard-check-in-dev-stack-lookup` and `jumpyard-check-in-dev-stack-webhook` Lambda code only.
- Behavior: when lookup or webhook enrichment sees a settled Roller booking snapshot, the matching `jumpyard.prepayment_booking_drafts` row is marked `published`, amount owing is set to zero, and a safe idempotent `prepayment_draft.published` event is written.
- Roller calls: lookup/webhook continue to use existing read-only Roller booking refresh paths.
- Roller writes: none.
- Aurora schema changes: none; T0056 uses the existing `published` draft status.
- Secret/JWT handling: no raw `paymentJwt`, access token, client secret, or full contact PII is persisted or logged.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-27; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Dev smoke result: lookup for paid booking `5063394` updated draft `jypd_835161973ab34210ac` to `published`, set `amount_owing_cents=0`, and wrote `prepayment_draft.published` to `jumpyard.event_log`.

Confirmed T0006 dev target:

| Field | Value |
|---|---|
| AWS account ID | `376129878018` |
| AWS profile/login method | `wrlds-dev` |
| AWS region | `eu-north-1` |
| Environment | `dev` |
| Resource prefix | `jumpyard-check-in-dev` |
| Config file | `infra/config/dev.json` |
| API endpoint | `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` |

## Resource Inventory

| Resource Name | AWS Service | Environment | Region | Managed By | Notes |
|---|---|---|---|---|---|
| `jumpyard-check-in-dev-stack` | CloudFormation | `dev` | `eu-north-1` | `cdk` | `CREATE_COMPLETE`. |
| `m0uo5g4mde` | API Gateway HTTP API | `dev` | `eu-north-1` | `cdk` | Endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`; lookup, booking availability/quote/draft, existing-booking add-product quote/draft, session, check-in session link, SMS/email link, staff auth/handoff, webhook, and redeem routes are implemented; CORS uses explicit dev origins; `$default` stage throttling is rate `25` requests/second and burst `50`. |
| `jumpyard-check-in-dev-ops` | CloudWatch Dashboard | `dev` | `eu-north-1` | `cdk` | T0060 operations dashboard for API requests/errors/latency, Lambda metrics, SQS/DLQ metrics, and Roller outbound API call/error metrics. |
| `jumpyard-check-in-dev-*` CloudWatch alarms | CloudWatch Alarms | `dev` | `eu-north-1` | `cdk` | T0060 alarms for API 5xx, high API 4xx, Roller API errors, Roller ops DLQ messages, and Lambda errors/throttles; T0061 adds API throttled request alarm `jumpyard-check-in-dev-api-throttled-requests`. |
| `jumpyard-check-in-dev-stack-lookup` | Lambda | `dev` | `eu-north-1` | `cdk` | T0016 lookup handler; reads Aurora first, refreshes from Roller Playground only when needed, and returns normalized phone-flow lookup response. |
| `jumpyard-check-in-dev-stack-booking` | Lambda | `dev` | `eu-north-1` | `cdk` | T0034 booking handler; reads Roller Playground availability, quotes Roller Playground draft costs, creates confirmed Playground draft bookings behind idempotency, creates separate linked add-product draft bookings for existing bookings, persists safe pre-payment draft rows, returns safe payment config and response-only `paymentJwt`, and writes safe audit rows. |
| `jumpyard-check-in-dev-stack-redeem` | Lambda | `dev` | `eu-north-1` | `cdk` | T0047 redeem handler; plans/validates server-side redemption from Aurora, requires a dev token for lower-level direct confirmed writes, refreshes live Roller state before write, supports staff-auth-protected session redeem, marks completed sessions, and records attempt audit. |
| `jumpyard-check-in-dev-stack-session` | Lambda | `dev` | `eu-north-1` | `cdk` | T0068 session handler config; creates/resumes Aurora-backed check-in sessions, marks sessions ready for staff, issues staff auth tokens, protects staff handoff list/detail, creates/resolves hashed check-in session links with safe booking summaries for phone resume, dry-runs or explicitly sends SMS links through AWS SNS with safe provider/Sender ID diagnostics, dry-runs or explicitly sends email links through SES with safe sender/reply-to diagnostics using verified dev sender `love@wrlds.com`, plans booking-time SMS/email candidates from Aurora through one processor, and blocks scheduled confirmed sends unless the approval phrase and public HTTPS URL are present. |
| `love@wrlds.com` | Amazon SES email identity | `dev` | `eu-north-1` | manual AWS CLI | T0067 verified dev test identity for real email smoke; created with WRLDS tags and verified for sending. Do not use as production sender/domain. |
| `jumpyard-check-in-dev-sns-sms-delivery-status` | IAM Role | `dev` | `eu-north-1` | `cdk` | Allows Amazon SNS to write SMS delivery status logs for JumpYard Cloud dev diagnostics. |
| `SmsDeliveryStatusAttributes` | CloudFormation Custom Resource | `dev` | `eu-north-1` | `cdk` | Sets dev SNS SMS attributes for transactional SMS and 100% delivery status sampling. |
| SNS SMS sandbox phone `+46*****9508` | Amazon SNS SMS sandbox | `dev` | `eu-north-1` | AWS CLI/manual verification | Verified test destination for dev SMS delivery while the account remains in SMS sandbox. |
| `jumpyard-check-in-dev-stack-webhook` | Lambda | `dev` | `eu-north-1` | `cdk` | T0018 webhook handler; accepts Roller Playground `x-roller-apikey`, validates a dev token, stores idempotent metadata, refreshes booking detail from Roller Playground, and upserts Aurora booking/item/ticket snapshots. |
| `jumpyard-check-in-dev-stack-data-sync` | Lambda | `dev` | `eu-north-1` | `cdk` | T0037 scheduled sync handler; imports Roller Data API modified-date windows and product cache data into Aurora, records run health, and performs no Roller writes. |
| Roller Playground webhook `238` | Roller Webhooks API | `dev`/Playground | External | Roller | Posts booking `Created`, `Updated`, and `Cancelled` events with `tickets=true` to the dev JumpYard Cloud webhook endpoint. |
| `/aws/lambda/jumpyard-check-in-dev-stack-lookup` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-booking` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-redeem` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-session` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/apigateway/jumpyard-check-in-dev-api-access` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | T0060 API Gateway HTTP API access logs with route, status, integration status, and latency fields; no request body, secrets, tokens, or PII. |
| `ApiThrottledRequestMetricFilter` | CloudWatch Logs Metric Filter | `dev` | `eu-north-1` | `cdk` | T0061 metric filter on API access logs that counts HTTP `429` rows into `JumpYard/Cloud` metric `ApiThrottledRequestCount`. |
| `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber/Failure` | CloudWatch Logs | `dev` | `eu-north-1` | SNS/CDK attributes | SNS SMS delivery status failure logs. T0042 confirmed sandbox rejection here. |
| `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber` | CloudWatch Logs | `dev` | `eu-north-1` | SNS/CDK attributes | SNS SMS delivery status success logs. T0043 confirmed verified-phone delivery acceptance here. |
| `/aws/lambda/jumpyard-check-in-dev-stack-webhook` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-data-sync` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `jumpyard-check-in-dev-aurora` | Aurora PostgreSQL Serverless v2 | `dev` | `eu-north-1` | `cdk` plus SQL migrations | Engine `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion protection enabled, Data API enabled, schema `jumpyard` created by T0007. |
| `jumpyard-check-in-dev-aurora-writer` | RDS DB instance | `dev` | `eu-north-1` | `cdk` | Serverless writer instance. |
| `jumpyard-check-in-dev-aurora-subnets` | RDS DB subnet group | `dev` | `eu-north-1` | `cdk` | Uses isolated subnets. |
| `/jumpyard-check-in-dev/aurora/admin` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Generated Aurora admin credentials. |
| `/jumpyard-check-in-dev/roller/credentials` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Placeholder Roller credentials; values must be set in AWS before real Roller calls. |
| `/jumpyard-check-in-dev/webhooks/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for Roller Playground webhook delivery. Do not print or commit the token value. |
| `/jumpyard-check-in-dev/redeem/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for controlled Roller Playground redemption execution. Do not print or commit the token value. |
| `/jumpyard-check-in-dev/staff/auth` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Generated staff passcode and token settings for T0047 pilot staff auth. Do not print or commit the passcode. |
| `/jumpyard-check-in-dev/checkin-links/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for creating check-in session links. Do not print or commit the token value. |
| `/jumpyard-check-in-dev/roller/env` | SSM Parameter Store | `dev` | `eu-north-1` | `cdk` | Value `playground`. |
| `/jumpyard-check-in-dev/roller/base-url` | SSM Parameter Store | `dev` | `eu-north-1` | `cdk` | Value `https://api.play.roller.app`. |
| `jumpyard-check-in-dev-raw-payloads-376129878018-eu-north-1` | S3 | `dev` | `eu-north-1` | `cdk` | Encrypted, public access blocked, versioned, 30-day lifecycle, retained on stack deletion. |
| `jumpyard-check-in-dev-roller-ops` | SQS | `dev` | `eu-north-1` | `cdk` | Roller operations queue with DLQ redrive. |
| `jumpyard-check-in-dev-roller-ops-dlq` | SQS | `dev` | `eu-north-1` | `cdk` | Dead-letter queue. |
| `jumpyard-check-in-dev-events` | EventBridge | `dev` | `eu-north-1` | `cdk` | Internal JumpYard Cloud event bus. |
| `jumpyard-check-in-dev-data-api-daily-sync` | EventBridge Rule | `dev` | `eu-north-1` | `cdk` | Invokes `jumpyard-check-in-dev-stack-data-sync` daily at `02:00 UTC` for the previous modified-date window. |
| `jumpyard-check-in-dev-booking-time-sms-schedule` | EventBridge Rule | `dev` | `eu-north-1` | `cdk` | Invokes `jumpyard-check-in-dev-stack-session` every 5 minutes for booking-time guest messaging in planning mode with `confirmSend=false`; T0068 target payload includes channels `sms` and `email` while retaining the existing rule name for continuity. |
| `vpc-0d3ec43331e52813e` | VPC | `dev` | `eu-north-1` | `cdk` | CIDR `10.72.0.0/16`. |
| `subnet-005b2679b14023edc` | EC2 subnet | `dev` | `eu-north-1a` | `cdk` | Isolated subnet A. |
| `subnet-07bc326946413a10a` | EC2 subnet | `dev` | `eu-north-1b` | `cdk` | Isolated subnet B. |
| `sg-0bd327f3b974b3d73` | EC2 security group | `dev` | `eu-north-1` | `cdk` | Aurora boundary security group. |
| `jumpyard-check-in-dev-sta-*ServiceRole*` | IAM | `dev` | `eu-north-1` | `cdk` | Lambda execution roles and scoped inline policies for Secrets Manager, SSM, RDS Data API, S3, SQS, EventBridge, and CloudWatch metrics. |

## Aurora Schema Inventory

T0007 created schema `jumpyard` in database `jumpyard_cloud`.

| Table | Purpose |
|---|---|
| `schema_migrations` | Tracks applied SQL migrations. Applied through `0007 email deliveries`. |
| `roller_bookings` | Latest normalized Roller booking snapshot from seed, webhook enrichment, or live refresh. T0016 and T0017 can upsert refreshed booking rows. |
| `roller_booking_items` | Normalized booking item/product rows. T0016 and T0017 can upsert refreshed item rows. |
| `roller_booking_tickets` | Ticket ids and redeem readiness context from `/data/tickets`, lookup live refresh, or webhook enrichment. |
| `roller_booking_payments` | Payment rows or summaries needed for check-in/payment decisions from `/data/bookingpayments`. |
| `guest_profiles` | Structured guest email/phone contact state plus masked/hash values for SMS/readiness and late enrichment. |
| `checkin_sessions` | Server-owned guest check-in session state, selected ticket ids, safety status, handoff status/code, expiry, and ready-for-staff state. |
| `prepayment_booking_drafts` | Safe Roller draft booking metadata for new-booking and add-product pre-payment flows, including status, selected item summary, totals, structured guest email/phone, masked/hash contact fields, add-product original booking link fields, and JWT/config presence flags without storing raw `paymentJwt`. |
| `checkin_tokens` | SMS/link/open token state. |
| `email_deliveries` | Email link delivery audit rows with masked/hashed destination values and no raw token/full URL storage. |
| `checkin_attempts` | Check-in and redeem attempt audit. |
| `handoff_sessions` | Staff handoff, safety, and band-pairing state. |
| `booking_links` | Internal links between original bookings and separate add-on bookings. |
| `idempotency_records` | Write protection for booking, payment, redeem, and add-on operations. |
| `product_catalog_cache` | Product cache metadata and normalized summary from Roller REST `/products`; T0013 stores one row per product/variation cache key. |
| `roller_webhook_events` | Idempotent booking webhook intake and enrichment state. T0018 confirmed real Roller deliveries update event status, enrichment attempts, processed time, and safe error summaries. |
| `booking_seed_runs` | Daily seed run tracking. |
| `event_log` | Append-only business and observability events. |

## Proposed Target Resources

| Proposed Resource | AWS Service | Environment | Purpose | Status |
|---|---|---|---|---|
| JumpYard Cloud API | API Gateway HTTP API | `dev` first, then `staging`/`prod` TBD | Phone app entrypoint for server-owned contracts. | Deployed to `dev` |
| JumpYard Cloud handlers | Lambda | `dev` first, then `staging`/`prod` TBD | Lookup, session, availability, quote, draft booking, add-product, redeem, webhook handlers. | Lookup, booking availability/quote/draft, existing-booking add-product quote/draft, session, webhook intake/enrichment, and redeem implemented in `dev` |
| Roller credentials | Secrets Manager | Per environment | Store Roller client id and client secret server-side. | Deployed and populated in `dev` |
| Roller non-secret config | SSM Parameter Store | Per environment | Store Roller environment and Playground base URL. | Deployed to `dev` |
| JumpYard operational database | Aurora PostgreSQL Serverless v2 | Per environment | Roller snapshot, operational state, check-in attempts, idempotency, handoff state, webhook events, event log. | Deployed to `dev` |
| Raw payload/archive storage | S3 | Per environment | Optional raw Roller payloads, Data API export files, and analysis dumps. | Deployed to `dev` with 30-day lifecycle |
| Roller rate-limit control | SQS plus DLQ | Per environment | Serialize Roller operations and provide dead-letter handling. | Deployed to `dev` |
| Async processing | EventBridge | Per environment | Webhook and reconciliation event bus. | Deployed to `dev` |
| JumpYard logs | CloudWatch Logs | Per environment | Operational logs and error traces with Lambda log retention. | Deployed to `dev` |
| Infrastructure deployment | CDK TypeScript | Per environment | Repeatable infrastructure with WRLDS tags. | `dev` deployed |

## Governance Notes

- Do not create AWS resources unless a ticket explicitly allows AWS deploy work.
- Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center before AWS deploy work.
- Update this file whenever AWS resources are created, changed, discovered, deleted, or replaced.
- `infra/config/dev.example.json` is for local synth validation only and is not an approved deployment config.
- `infra/config/dev.json` is the approved non-secret T0006 dev deployment config.
- Do not run future `cdk deploy` commands unless AWS identity matches account `376129878018` and region `eu-north-1`.
- Roller credentials in AWS must be populated through Secrets Manager only; do not commit secrets.

## Required WRLDS Tags

- `WRLDS:Client`
- `WRLDS:Project`
- `WRLDS:Environment`
- `WRLDS:Owner`
- `WRLDS:Repository`
- `WRLDS:ManagedBy`
- `WRLDS:DataClassification`
- `WRLDS:Exportable`
- `WRLDS:CostCenter`
- `WRLDS:CreatedBy`

## Confirmed T0006 WRLDS Tags

| Tag | Value |
|---|---|
| `WRLDS:Client` | `JumpYard` |
| `WRLDS:Project` | `jumpyard-check-in` |
| `WRLDS:Environment` | `dev` |
| `WRLDS:Owner` | `love` |
| `WRLDS:Repository` | `wrlds-creations/jumpyard-check-in` |
| `WRLDS:ManagedBy` | `cdk` |
| `WRLDS:DataClassification` | `internal` |
| `WRLDS:Exportable` | `true` |
| `WRLDS:CostCenter` | `unassigned` |
| `WRLDS:CreatedBy` | `love` |
