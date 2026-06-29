# T0173 Webhook And Reconciliation Readiness

## Goal

Decide whether the first assisted park-test should use Roller Live webhook processing for payment settlement, booking updates, add-ons, or redeem confirmation, or keep processing closed and rely on scoped REST reads plus synchronous write responses.

## Current State Reviewed

- Roller Live webhook `1465` is registered for the park-test booking endpoint `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`.
- Registered shape from T0155: booking events `Created`, `Updated`, and `Cancelled`, `tickets=true`, delivery auth through `x-roller-apikey`.
- Park-test config keeps `safetyGates.rollerWebhookProcessingEnabled=false`, which becomes `ENABLE_ROLLER_WEBHOOK_PROCESSING=false` in the webhook Lambda.
- With processing disabled, the handler verifies auth and returns `ignored_disabled`; it does not insert `jumpyard.roller_webhook_events`, enrich bookings, or mutate Aurora.
- If processing is enabled, the handler can persist an intake row, call `GET /bookings/{identifier}`, upsert normalized booking/item/ticket snapshots, update guest profile summary fields, and run the same prepayment/add-on settlement reconciliation used by lookup.
- Current webhook registration is booking-event based. It is not currently documented as a dedicated payment-success or redemption-success signal.

## Recommendation

Keep Roller Live webhook processing closed for the first assisted park-test.

Use webhooks as an installed but unplugged doorbell: the wire is in place, the endpoint and token path are proven, but the bell should not start changing local state until the test needs background automation. For this park-test, the safer posture is to ask Roller directly at the moment we need the answer.

## Park-Test Confirmation Plan

| Need | Park-test confirmation method | Webhook role | Why |
|---|---|---|---|
| New booking payment completed through the PWA | T0169 draft-backed post-payment sync: lookup may refresh only the recent local `new_booking` draft id and store the paid Roller snapshot. | Not primary. | Confirms the exact booking the guest just paid for without opening broad lookup or background imports. |
| Existing booking lookup | T0171 assisted lookup: guest/staff enters one booking reference or UUID, then JumpYard Cloud calls `GET /bookings/{identifier}` and validates Nacka/date scope before writing the normalized snapshot. | Not primary. | The visitor's booking code is the narrowest key. No all-day guest list is needed. |
| Existing booking add-on settlement | Scoped linked-add-on settlement should refresh the exact paid linked booking and mark the matching `prepayment_booking_drafts` and `booking_links` rows `published`. | Optional later accelerator. | T0165 already proved exact settlement by REST. Webhook could automate this later, but broad Live processing is more data than the first assisted test needs. |
| Redeem/check-in write | Staff-confirmed flow calls Roller `POST /redemptions`; HTTP success is the immediate authority. JumpYard Cloud records `checkin.redeem_succeeded`, `checkin_attempts.status='redeemed'`, and sets local ticket `redeem_status_last_seen='redeemed'`. | Not required for immediate confirmation. | This is like watching the cashier stamp the ticket. A webhook would be a later receipt, not the stamp itself. |
| Redeem timeout or uncertain network result | Do not guess or blindly retry. Use the local idempotency/audit state, then staff/manual Roller UI readback or a future scoped readback/reconciliation ticket. | Useful as future backup evidence. | Double-redeeming is worse than asking staff to verify an uncertain case. |
| Booking changed or cancelled after lookup | For first assisted test, refresh on lookup/session flow and use staff fallback if the booking changes after the guest starts. | Useful later. | A webhook can keep a queue/dashboard fresh, but the first assisted test can stay synchronous and supervised. |

## Why Not Open Processing Now

- The webhook would accept external Roller Live events, not only events caused by our PWA.
- Current processing would write normalized Live booking/item/ticket snapshots into park-test Aurora for delivered events that pass auth.
- The registration covers booking created/updated/cancelled events, not a confirmed dedicated redemption result event.
- Production-grade webhook auth/signature/IP policy is still an open readiness item beyond the confirmed shared header token path.
- Broad background processing is not needed to prove the later frontend redeem rehearsal.

## When To Revisit

Open webhook processing only in a separate scoped ticket when at least one of these becomes necessary:

- Staff need a background queue/dashboard that updates without entering booking codes.
- Add-on settlement must become automatic rather than an exact REST refresh after payment.
- Unassisted visitor traffic needs local state to update when Roller changes bookings outside our app.
- Roller confirms a reliable payment-specific or redemption-specific webhook/event contract.
- Production/cutover work needs replay, retry, alerting, signature/IP policy, and rollback procedures.

That later ticket should define the open/close config, event allowlist, venue/date filters, idempotency/replay behavior, data written to Aurora, safe readback checks, rollback, and support owner.

## Decision

T0173 keeps `ENABLE_ROLLER_WEBHOOK_PROCESSING=false` for park-test. The T0176 frontend redeem rehearsal can proceed without depending on webhook processing: redeem confirmation comes from the synchronous Roller redemption response plus local Aurora audit, with staff/manual Roller fallback for uncertain cases.

## Validation

- Reviewed `infra/lambda/webhook/index.js`, `infra/lambda/lookup/index.js`, `infra/lambda/redeem/index.js`, `infra/config/park-test.json`, and T0154/T0155/T0165/T0166/T0169/T0170 docs.
- `npm run validate` passed.
- `git diff --check` passed with existing CRLF normalization warnings only.
- No AWS deploy, Roller Live call, Aurora query/write, webhook processing, payment, add-on, redeem, SMS/email, or visitor traffic was performed.
