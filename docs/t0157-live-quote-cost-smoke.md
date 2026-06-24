# T0157 Live Quote/Cost Smoke

Date: 2026-06-23

## Scope

T0157 runs the first controlled Roller Live quote/cost smoke for JumpYard Nacka Forum.

The ticket is quote-only:

- No booking draft creation.
- No payment start.
- No redeem.
- No webhook processing enablement.
- No frontend visitor traffic.
- No SMS or email.
- No Aurora writes.
- No secret values printed.

## Tooling

T0157 adds a guarded local script:

```powershell
npx ts-node --prefer-ts-exts scripts/roller-live-quote-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29
```

The script:

- Reads park-test AWS config and confirms account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller env `live`, and Roller base URL `https://api.roller.app`.
- Reads Roller Live credentials from `/jumpyard-check-in-park-test/roller/credentials` without printing secret values.
- Requires park-test safety gates to remain closed in config.
- Allows only:
  - `AUTH /token`
  - `GET /product-availability`
  - `POST /bookings/draft/costs`
- Blocks non-T0157 endpoints such as `/bookings/draft`, `/bookings/draft/publish`, `/payments`, `/redemptions`, `/webhooks`, `/customers`, `/guests`, and `/bookings/{id}`.

## Smoke Result

Command:

```powershell
npx ts-node --prefer-ts-exts scripts/roller-live-quote-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29
```

Result:

| Field | Value |
|---|---|
| AWS account | `376129878018` |
| AWS region | `eu-north-1` |
| Roller env | `live` |
| Roller base URL | `https://api.roller.app` |
| Credential source | `/jumpyard-check-in-park-test/roller/credentials` |
| Parent product | `1189805` |
| Selected child product | `1189808` |
| Selected product name | `Biljetter (200 kr)` |
| Booking date | `2026-06-29` |
| Start time | `10:00` |
| Quantity | `1` |
| Online sales open | `true` |
| Capacity remaining | `160` |
| Unit price | `200` |
| Quote endpoint | `POST /bookings/draft/costs` |
| Quote HTTP status | `200` |
| Total | `200` |
| Tax | `11.32` |
| Fees | `0` |
| Discount | `0` |
| Amount owing | `200` |

Roller Live returned costs under `bookingCosts`; the T0157 script normalizes that response shape.

## Gate Readback

Read-only Lambda environment checks after the smoke:

| Lambda | Gate | Value |
|---|---|---|
| `jumpyard-check-in-park-test-stack-booking` | `JUMPYARD_EMERGENCY_STOP` | `true` |
| `jumpyard-check-in-park-test-stack-booking` | `ENABLE_ROLLER_BOOKING_DRAFT_WRITES` | `false` |
| `jumpyard-check-in-park-test-stack-redeem` | `JUMPYARD_EMERGENCY_STOP` | `true` |
| `jumpyard-check-in-park-test-stack-redeem` | `ENABLE_ROLLER_REDEEM_WRITES` | `false` |
| `jumpyard-check-in-park-test-stack-session` | `JUMPYARD_EMERGENCY_STOP` | `true` |
| `jumpyard-check-in-park-test-stack-session` | `ENABLE_STAFF_AUTH` | `false` |
| `jumpyard-check-in-park-test-stack-session` | `ENABLE_GUEST_MESSAGE_SENDS` | `false` |
| `jumpyard-check-in-park-test-stack-webhook` | `JUMPYARD_EMERGENCY_STOP` | `true` |
| `jumpyard-check-in-park-test-stack-webhook` | `ENABLE_ROLLER_WEBHOOK_PROCESSING` | `false` |

## Validation

Performed validation:

```powershell
npm --prefix infra run build
npm --prefix infra run validate:roller-live-quote-smoke
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-booking --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,DraftWrites:Environment.Variables.ENABLE_ROLLER_BOOKING_DRAFT_WRITES}" --output json
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-redeem --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,RedeemWrites:Environment.Variables.ENABLE_ROLLER_REDEEM_WRITES}" --output json
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-session --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,StaffAuth:Environment.Variables.ENABLE_STAFF_AUTH,GuestSends:Environment.Variables.ENABLE_GUEST_MESSAGE_SENDS}" --output json
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-webhook --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,WebhookProcessing:Environment.Variables.ENABLE_ROLLER_WEBHOOK_PROCESSING}" --output json
npx ts-node --prefer-ts-exts scripts/roller-live-quote-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29
```

The initial attempt to pass `--date` through `npm --prefix infra run quote:live:park-test -- --date 2026-06-29` stopped at local argument validation before any AWS or Roller request because the flag was not forwarded as expected on Windows.

## Safety Outcome

T0157 performed:

- One Roller auth request.
- One Roller Live availability read.
- One Roller Live cost quote request.

T0157 did not:

- Deploy AWS changes.
- Create or update AWS resources.
- Call the public park-test API.
- Write Aurora rows.
- Create a Roller booking draft.
- Start payment.
- Redeem tickets.
- Enable or process webhooks.
- Send SMS or email.
- Send frontend visitor traffic.
- Print secret values.

## Next Gate

The next planned ticket is `T0158`, controlled Live draft smoke. It must remain separate and requires explicit approval before any draft-write gate handling or Roller draft creation.
