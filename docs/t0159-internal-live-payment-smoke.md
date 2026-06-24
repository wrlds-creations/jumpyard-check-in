# T0159 Internal Live Payment Smoke

Date: 2026-06-24

## Scope

T0159 performed the first internal paid Roller Live booking smoke through the park-test phone PWA.

The ticket allowed exactly one controlled internal paid booking path:

- Park-test phone URL: `https://jumpyard-check-in-park-test.pages.dev`
- Park-test JumpYard Cloud API: `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`
- Roller Live, JumpYard Nacka Forum
- One `60 min entre` ticket, quantity `1`
- Real internal payment by the user

The ticket did not allow normal visitor rollout, redeem, webhook processing, guest message sends, refund automation, cancellation automation, new AWS resources, new frontend source copies, or broad Live booking lookup.

## Implementation

T0159 added a temporary reviewed park-test config for the payment smoke:

- `infra/config/park-test-live-payment-smoke.json`
- `npm --prefix infra run synth:park-test-payment-smoke`
- `npm --prefix infra run diff:park-test-payment-smoke`
- `npm --prefix infra run deploy:park-test-payment-smoke`

The normal `infra/config/park-test.json` remains the default closed config.

The payment-smoke config keeps `safetyGates.emergencyStop=true`, but adds the exact approval phrase `T0159_INTERNAL_LIVE_PAYMENT_SMOKE_APPROVED` so the booking Lambda may create one Live draft/payment-start path while the rest of park-test remains closed.

The T0159-specific runtime behavior is limited to `JUMPYARD_ENVIRONMENT=park-test` and `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true`. It allows the booking Lambda to use Roller Live only for the payment smoke path. It does not open lookup, redeem, webhook processing, staff auth, SMS, or email.

Because park-test product cache was not yet populated for Live products, T0159 also added a narrow fallback for the known Nacka `60 min entre` mapping:

| Field | Value |
|---|---|
| Parent product id | `1189805` |
| Child product id | `1189808` |
| Product key | `E60` |

That fallback is active only when the T0159 Live payment smoke override is enabled.

## Preflight

Before opening the gate:

- `npm run validate` passed.
- `npm --prefix infra run check` passed.
- AWS identity confirmed account `376129878018`, region `eu-north-1`.
- Park-test phone/admin Cloudflare origins returned HTTP `200`.
- API CORS preflight for `https://jumpyard-check-in-park-test.pages.dev` returned HTTP `204`.
- Lambda readback confirmed emergency stop on and all sensitive gates closed.

Opening diff showed only the expected park-test booking Lambda code/environment changes. No new AWS resources were created.

## API Smoke Before Payment

Availability through the same park-test API used by the phone PWA returned HTTP `200`.

| Field | Value |
|---|---|
| Date | `2026-06-24` |
| Start times checked | `11:30`, `12:00`, `12:30` |
| Roller env | `live` |
| Endpoint | `GET /product-availability` through JumpYard Cloud |
| Product returned | `60 min entre` / `Biljetter (200 kr)` |
| Product id | `1189808` |
| Wrote booking | `false` |

Quote through the same park-test API returned HTTP `200`.

| Field | Value |
|---|---|
| Date | `2026-06-24` |
| Start time | `11:30` |
| Quantity | `1` |
| Endpoint | `POST /bookings/draft/costs` through JumpYard Cloud |
| Total | `200` |
| Amount owing | `200` |
| Tax | `11.32` |
| Fees | `0` |
| Discount | `0` |
| Wrote booking | `false` |

## Payment Result

The user completed the real internal payment through the park-test phone PWA.

Observed result:

| Field | Value |
|---|---|
| Draft unique id | `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e` |
| Roller booking reference | `166447399` |
| Roller booking status | `Paid` |
| Roller total | `200` |
| Roller amount owing | `0` |
| Roller item count | `1` |
| User-observed card charge | `200 SEK` |
| Secret values printed | `false` |
| Raw payment JWT printed | `false` |

Read-only Roller Live verification used `GET /bookings/{uniqueId}` and returned HTTP `200`.

## Post-Payment Sync Outcome

After payment, the phone PWA showed the Swedish payment-sync fallback:

```text
Betalningen ar klar men bokningen har inte hunnit synkas.
```

This was expected once the code path was inspected. The booking Lambda was opened for T0159, but the lookup Lambda still has the older fail-closed Roller Playground guard. The frontend tries to call `POST /v1/check-in/lookup` after payment using the paid draft's identifier. That lookup returned:

| Field | Value |
|---|---|
| HTTP status | `500` |
| Status | `config_error` |
| Code | `lookup_config_error` |
| Message | `JumpYard Cloud lookup configuration is incomplete or unsafe.` |

Root cause: T0159 intentionally did not open the Live existing-booking lookup gate. T0160 owns that next gate.

## Aurora Readback

Read-only Aurora Data API check found the safe prepayment draft row:

| Field | Value |
|---|---|
| `prepayment_draft_id` | `jypd_56a8f1ca817c42a4b7` |
| `roller_draft_unique_id` | `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e` |
| `flow_type` | `new_booking` |
| `status` | `payment_pending` |
| `booking_date` | `2026-06-24` |
| `start_time` | `12:00:00` |
| `total_cents` | `20000` |
| `amount_owing_cents` | `20000` |
| `payment_jwt_present` | `true` |
| `payment_config_available` | `true` |

`jumpyard.roller_bookings` remained empty because Live lookup/sync was blocked by the T0160 gate and was not opened in T0159.

The local draft status staying `payment_pending` while Roller is `Paid` is the expected result until an authoritative Live lookup/webhook/data-sync path reconciles the paid booking.

## Gate Closure

After collecting evidence, T0159 deployed the normal closed config:

```powershell
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
```

The close diff changed only these booking Lambda environment values from `true` to `false`:

- `ENABLE_ROLLER_BOOKING_DRAFT_WRITES`
- `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES`

Post-close readback:

| Lambda | Gate | Value |
|---|---|---|
| `jumpyard-check-in-park-test-stack-booking` | `JUMPYARD_EMERGENCY_STOP` | `true` |
| `jumpyard-check-in-park-test-stack-booking` | `ENABLE_ROLLER_BOOKING_DRAFT_WRITES` | `false` |
| `jumpyard-check-in-park-test-stack-booking` | `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES` | `false` |
| `jumpyard-check-in-park-test-stack-lookup` | `JUMPYARD_EMERGENCY_STOP` | `true` |
| `jumpyard-check-in-park-test-stack-redeem` | `ENABLE_ROLLER_REDEEM_WRITES` | `false` |
| `jumpyard-check-in-park-test-stack-webhook` | `ENABLE_ROLLER_WEBHOOK_PROCESSING` | `false` |

## Manual Cleanup

Refund/cancel remains outside the app by scope.

Manual follow-up required:

- Refund or cancel booking reference `166447399` in Roller/Adyen/admin tooling as appropriate.
- Keep any refund/cancel evidence out of the repository if it contains card, payment-provider, or customer PII.

## Safety Outcome

T0159 did:

- Open only the scoped booking draft/payment-start path.
- Run one internal real payment through the park-test phone PWA.
- Confirm Roller Live booking `166447399` is paid.
- Write one safe Aurora prepayment draft row without raw payment JWT storage.
- Confirm the post-payment sync failure is caused by lookup still being Live-gated.
- Close the booking draft/payment-start gate again.

T0159 did not:

- Create new AWS resources.
- Leave draft writes enabled.
- Enable lookup Live sync.
- Enable webhook processing.
- Enable redeem writes.
- Enable staff auth.
- Enable guest message sends.
- Send SMS or email.
- Print secret values.
- Print or persist raw payment JWT values.
- Implement refund or cancel automation.

## Next Gate

The next planned ticket is `T0160`, Live existing-booking lookup smoke. It should use the paid booking from T0159 as the controlled lookup target and open only the minimum lookup/sync path needed to prove guest-entered booking reference lookup through JumpYard Cloud.
