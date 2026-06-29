# T0176 Frontend Redeem And Full-Flow Rehearsal

## Goal

Let Love rehearse the deployed park-test admin redeem UI before a real assisted visitor uses it.

Plain-language version: T0166 already turned the real key once and proved Roller accepted the redeem. T0176 puts the already-used key on the table so the staff UI can be inspected, but the lock that can consume tickets stays closed.

After the staff-auth-only rehearsal was deployed, Love explicitly asked for a short full-flow test window to run real card purchases, POS-created booking lookup, add-ons, safety, staff admin, and redeem before the assisted park-test. T0176 now also owns that deployed full-flow rehearsal window.

## Scope

- Open staff auth only for the park-test admin UI.
- Allow staff/admin detail access only for the already-redeemed T0166 check-in session `jycs_mqtimdxf_bb33c94c`.
- Keep Roller Live redeem writes off.
- Keep booking draft/payment writes, lookup gates, add-on writes, webhook processing, guest SMS/email sends, and broad visitor traffic off.
- Do not create a new booking, payment, refund, add-on, or redemption.

Full-flow extension scope:

- Open new booking/payment writes through the park-test phone PWA.
- Open post-payment sync for bookings created by JumpYard Cloud.
- Open assisted existing-booking lookup for JumpYard Nacka Forum and operating dates `2026-06-29` through `2026-07-05`.
- Open existing-booking add-on draft/payment writes for bookings that pass the same Nacka/date scope.
- Open staff auth and Roller redeem writes for bookings that pass the same Nacka/date scope.
- Keep webhook processing, guest SMS/email sends, and broad same-day booking import off.
- Keep `JUMPYARD_EMERGENCY_STOP=true`; only the named service doors above pass through it.

## Gate Model

T0176 adds a separate frontend rehearsal config:

- `infra/config/park-test-frontend-redeem-rehearsal.json`
- approval phrase `T0176_FRONTEND_REDEEM_REHEARSAL_APPROVED`
- `frontendRedeemRehearsalAllowedSessionIds=["jycs_mqtimdxf_bb33c94c"]`
- `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=true`
- `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS=jycs_mqtimdxf_bb33c94c`

This is separate from T0166:

| Area | T0166 controlled redeem smoke | T0176 frontend rehearsal |
|---|---|---|
| Purpose | Prove a real Roller Live redeem write. | Let Love inspect/rehearse staff UI safely. |
| Staff auth | On. | On. |
| Roller redeem writes | On for exact booking/ticket allowlist. | Off. |
| Allowed object | Exact booking/unique id/ticket id. | Exact check-in session id only. |
| Risk | Consumes a real ticket. | Cannot consume a real ticket because redeem writes stay off. |

T0176 also adds a full-flow rehearsal config:

- `infra/config/park-test-full-flow-rehearsal.json`
- approval phrase `T0176_FULL_FLOW_REHEARSAL_APPROVED`
- `fullFlowRehearsalAllowedOperatingDates=["2026-06-29", ..., "2026-07-05"]`
- `fullFlowRehearsalVenueId="50871"`
- `ENABLE_T0176_FULL_FLOW_REHEARSAL=true`
- `T0176_FULL_FLOW_ALLOWED_OPERATING_DATES=2026-06-29,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-04,2026-07-05`
- `T0176_FULL_FLOW_VENUE_ID=50871`

Think of the full-flow config as opening one supervised reception lane for this week's Nacka test. It does not unlock the whole venue: webhooks, SMS, JumpYard email sends, and broad imports stay closed.

| Area | Full-flow rehearsal posture |
|---|---|
| New booking/payment | Open through `BookingHandler` for park-test PWA. |
| Post-payment sync | Open through `LookupHandler` only for locally created drafts. |
| Existing booking lookup | Open through `LookupHandler` for Nacka/date-scoped booking code or UUID lookup. |
| Existing booking add-ons | Open through `BookingHandler` after the original booking resolves and passes date/venue scope. |
| Staff auth | Open. Temporary test passcode is stored only in AWS Secrets Manager, not in the repo. |
| Redeem writes | Open through `RedeemHandler` only when the local booking/tickets match the approved date window and venue. |
| Webhook processing | Closed. |
| Guest SMS/email sends | Closed. Roller-native booking confirmation emails may still be requested in booking draft payloads. |
| Emergency stop | Still `true`; T0176 full-flow is the scoped bypass. |

## AWS Deploy

No new AWS resources were created.

Changed existing resource:

- Staff-auth-only rehearsal: `SessionHandler` Lambda code/environment only.
- Full-flow rehearsal: existing `LookupHandler`, `BookingHandler`, `RedeemHandler`, and `SessionHandler` Lambda code/environment only.

Deploy command:

```powershell
npm --prefix infra run deploy:park-test-frontend-redeem-rehearsal
```

Full-flow deploy command:

```powershell
npm --prefix infra run deploy:park-test-full-flow-rehearsal
```

Diff before deploy showed only:

- `SessionHandler` code hash update.
- `ENABLE_STAFF_AUTH=false -> true`.
- Add `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=true`.
- Add `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS=jycs_mqtimdxf_bb33c94c`.

## Readback

After deploy:

| Handler | Readback |
|---|---|
| Session | `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_STAFF_AUTH=true`, `ENABLE_T0166_LIVE_REDEEM_SMOKE=false`, `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=true`, `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS=jycs_mqtimdxf_bb33c94c`, `ENABLE_GUEST_MESSAGE_SENDS=false` |
| Redeem | `ENABLE_ROLLER_REDEEM_WRITES=false`, `ENABLE_T0166_LIVE_REDEEM_SMOKE=false`, T0166 allowlist empty |
| Booking | draft/payment/add-on write gates all `false` |
| Lookup | T0160/T0165/T0169/T0171 lookup modes all `false` |
| Webhook | `ENABLE_ROLLER_WEBHOOK_PROCESSING=false` |

Public API probe without a passcode returned `400 staff_passcode_required`, confirming staff auth is reachable without reading or printing the staff secret.

After the full-flow deploy:

| Handler | Readback |
|---|---|
| Booking | `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true`, `ENABLE_T0162_LIVE_ADDON_SMOKE=true`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=true`, dates `2026-06-29` through `2026-07-05`, venue `50871` |
| Lookup | `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_T0169_POST_PAYMENT_SYNC=true`, `ENABLE_T0171_ASSISTED_LOOKUP=true`, dates `2026-06-29` through `2026-07-05`, venue `50871`, T0160/T0165 off |
| Redeem | `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_ROLLER_REDEEM_WRITES=true`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=true`, dates `2026-06-29` through `2026-07-05`, venue `50871`, T0166 off |
| Session | `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_STAFF_AUTH=true`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=true`, `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=false`, guest sends off |
| Webhook | `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_ROLLER_WEBHOOK_PROCESSING=false` |

Safe smokes after deploy:

- Staff login with the temporary test passcode returned `authenticated` and bearer token presence; the token value was not printed.
- `POST /v1/bookings/availability` for Nacka returned `available`; no draft booking was created by the smoke.

## Manual Rehearsal Steps

Use the deployed admin app:

```text
https://jumpyard-checkin-admin-park-test.pages.dev
```

1. Log in with the park-test staff passcode.
2. Paste this session id in the handoff/search field:

```text
jycs_mqtimdxf_bb33c94c
```

Alternative QR payload format:

```text
JY_SESSION:jycs_mqtimdxf_bb33c94c
```

Expected result:

- Admin opens the T0166 handoff detail.
- Detail shows the already-completed/redeemed state.
- Ticket/product rows and handout context are visible for inspection.
- The UI should not offer a successful new redeem because the session is already completed and backend redeem writes are closed.

## Limitation

The original staff-auth-only T0176 mode does not prove clicking the staff redeem button on a fresh Live booking, because it intentionally avoided consuming another Roller Live ticket.

The full-flow extension does allow Love to perform a fresh true button-click redeem rehearsal during the approved Nacka/date test window. This consumes real Roller Live tickets and should be used only for the intended assisted testing. Card payments are real; refunds remain a manual Roller/Adyen/card-provider process outside the app.

## Manual Feedback Fix Pass

After Love tested a real card purchase, a POS-created booking, add-ons, safety, and staff redeem, T0176 received a scoped code fix pass for the blocking rehearsal friction:

- Ready-for-entry `Att hämta` now uses the add-ons bag section icon, and the entry handout row shows the actual entry product/duration directly instead of `Armband` plus a smaller detail line.
- Existing-booking summary now displays the entry product with quantity, for example `Entré 60 minuter x 1`.
- Existing-booking add-ons now show a clean add-on loading state instead of dimmed product cards while the Live catalog loads.
- SkyRider no longer gets the red/primary highlight only in the existing-booking add-on flow; the view is aligned with the new-booking add-on treatment.
- Existing-booking add-ons prefill socks to the number of jumpers when no socks are already on the booking, while still letting the guest reduce the quantity.
- Add-on review rows now show product, quantity, unit price, and row total before payment.
- Lookup normalization now keeps Roller booking/customer display name and customer id when returned by Roller, and assisted lookup refreshes from Roller when the local cache lacks a display name. This is intended to prevent POS-created bookings from appearing as only `Gäst` in the phone/admin handoff surfaces.

Deployment/readback after PR #176:

- PR #176 was squash-merged to `main` as commit `e3c5d58`.
- Cloudflare Pages production deployments for both `jumpyard-check-in-park-test` and `jumpyard-checkin-admin-park-test` report source commit `e3c5d58`.
- The deployed phone bundle contains the park-test API id `ij4rnaui2b` and does not contain the dev API id `m0uo5g4mde`.
- CDK diff for `infra/config/park-test-full-flow-rehearsal.json` showed only the existing `LookupHandler` Lambda code hash changing.
- `npm --prefix infra run deploy:park-test-full-flow-rehearsal` completed with CloudFormation `UPDATE_COMPLETE`; readback confirmed `LookupHandler` was modified at `2026-06-29T14:18:15.000+0000` and kept post-payment sync plus assisted lookup open for Nacka `50871` and dates `2026-06-29` through `2026-07-05`.

## Validation

- `npm --prefix infra run build`
- `npm --prefix infra run validate:config-guards`
- `npm --prefix infra run validate:park-test-synth`
- `npm --prefix infra run synth:park-test-frontend-redeem-rehearsal`
- `npm --prefix infra run diff:park-test-frontend-redeem-rehearsal -- --method=template`
- `npm --prefix infra run deploy:park-test-frontend-redeem-rehearsal`
- `npm --prefix infra run synth:park-test-full-flow-rehearsal`
- `npm --prefix infra run diff:park-test-full-flow-rehearsal`
- `npm --prefix infra run deploy:park-test-full-flow-rehearsal`
- AWS Lambda environment readback for Session, Redeem, Booking, Lookup, and Webhook handlers.
- Safe public API probe for staff login route without passcode.
- Park-test staff auth secret rotated in AWS Secrets Manager for the manual rehearsal; the value is intentionally not stored in this repository. Login probe confirmed authentication and printed only token presence, not the bearer token.
- `node --check infra/lambda/booking/index.js`
- `node --check infra/lambda/redeem/index.js`
- `node --check infra/lambda/session/index.js`
- `node --check infra/lambda/lookup/index.js`
- `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings only.
- `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` notices only.
- `npm run validate`
- `git diff --check` passed with existing CRLF normalization warnings only.
- `gh pr merge 176 --squash --delete-branch` merged PR #176 to `main`.
- `npx --yes wrangler pages deployment list --project-name jumpyard-check-in-park-test` confirmed production source `e3c5d58`.
- `npx --yes wrangler pages deployment list --project-name jumpyard-checkin-admin-park-test` confirmed production source `e3c5d58`.
- Remote phone bundle check confirmed `ContainsParkTestApi=true` and `ContainsDevApi=false`.
- `npm --prefix infra run synth:park-test-full-flow-rehearsal`
- `npm --prefix infra run diff:park-test-full-flow-rehearsal` showed only `LookupHandler` code changing.
- `npm --prefix infra run deploy:park-test-full-flow-rehearsal`
- AWS CloudFormation readback confirmed stack `UPDATE_COMPLETE`.
- AWS Lambda readback confirmed `LookupHandler` keeps `ENABLE_T0169_POST_PAYMENT_SYNC=true`, `ENABLE_T0171_ASSISTED_LOOKUP=true`, approved dates `2026-06-29` through `2026-07-05`, venue `50871`, and `JUMPYARD_EMERGENCY_STOP=true`.
- Public park-test phone/admin URLs returned HTTP `200`.
- CORS preflight from `https://jumpyard-check-in-park-test.pages.dev` to `POST /v1/check-in/lookup` returned HTTP `204`.
- Read-only `POST /v1/bookings/availability` for `2026-06-29 13:30` returned HTTP `200`, status `available`, one slot, and ten products; no draft booking was created.

## Result

T0176 is ready for Love's manual full-flow rehearsal. The deployed park-test API currently opens new booking/payment, post-payment sync, assisted Nacka/date-scoped lookup, existing-booking add-ons, staff auth, and Nacka/date-scoped redeem. Webhook processing, guest SMS/email sends, and broad imports remain closed. The manual feedback fix pass is merged, deployed to Cloudflare production for phone/admin, and deployed to the park-test `LookupHandler`.
