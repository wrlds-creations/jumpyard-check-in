# T0158 Controlled Live Draft Smoke

Date: 2026-06-23

## Scope

T0158 creates exactly one controlled Roller Live draft for JumpYard Nacka Forum.

The ticket is draft-only:

- One Roller Live draft may be created.
- No payment is started.
- No draft is published.
- No redeem is called.
- No public park-test API/Lambda booking route is opened or called.
- No AWS resources are created or changed.
- No Aurora rows are written.
- No webhook processing is enabled.
- No frontend visitor traffic is sent.
- No SMS or email is sent.
- No secret values or raw payment JWT values are printed.

## Tooling

T0158 adds a guarded local script:

```powershell
$env:ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE='I_UNDERSTAND_THIS_CREATES_ONE_ROLLER_LIVE_DRAFT_FOR_JUMPYARD_NACKA'
npx ts-node --prefer-ts-exts scripts/roller-live-draft-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29 --start-time 10:00 --apply
Remove-Item Env:\ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE
```

The script:

- Confirms AWS account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller env `live`, and Roller base URL `https://api.roller.app`.
- Reads Roller Live credentials from `/jumpyard-check-in-park-test/roller/credentials` without printing secret values.
- Requires park-test config safety gates to remain closed.
- Requires both `--apply` and the exact `ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE` phrase.
- Allows only:
  - `AUTH /token`
  - `GET /product-availability`
  - `POST /bookings/draft/costs`
  - `POST /bookings/draft`
- Blocks non-T0158 endpoints such as `/bookings/draft/publish`, `/payments`, `/redemptions`, `/webhooks`, `/customers`, `/guests`, and `/bookings/{id}`.

## Smoke Result

Command:

```powershell
$env:ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE='I_UNDERSTAND_THIS_CREATES_ONE_ROLLER_LIVE_DRAFT_FOR_JUMPYARD_NACKA'
npx ts-node --prefer-ts-exts scripts/roller-live-draft-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29 --start-time 10:00 --apply
Remove-Item Env:\ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE
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
| Quote total | `200` |
| Quote tax | `11.32` |
| Quote fees | `0` |
| Quote discount | `0` |
| Quote amount owing | `200` |
| Draft endpoint | `POST /bookings/draft` |
| Draft HTTP status | `201` |
| Roller draft unique id | `f81e46e5-5cf7-4193-b578-44a1b8140599` |
| Booking reference | Not returned for this draft response |
| Payment JWT | Present, raw value not printed |

The Roller draft response summary contained `uniqueId`, `capacityReservationId`, `costs`, `discounts`, and `giftCards`, plus a present `paymentJwt`. Only the JWT presence and safe header/payload key summary are handled by tooling; the raw JWT value is not printed, persisted, or committed.

## Gate Readback

Read-only checks after the smoke confirmed park-test AWS gates stayed closed:

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

## Aurora Readback

Read-only Aurora Data API query after the smoke returned `0` rows for:

- `jumpyard.prepayment_booking_drafts`
- `jumpyard.event_log`
- `jumpyard.idempotency_records`
- `jumpyard.roller_webhook_events`

This is expected because T0158 used local guarded tooling and did not call the public park-test API/Lambda path.

## Validation

Performed validation:

```powershell
npm --prefix infra run build
npm --prefix infra run validate:roller-live-draft-smoke
node scripts/validate-current-ticket.js
aws sso login --profile wrlds-dev
npx ts-node --prefer-ts-exts scripts/roller-live-draft-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29 --start-time 10:00 --apply
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-booking --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,DraftWrites:Environment.Variables.ENABLE_ROLLER_BOOKING_DRAFT_WRITES}" --output json
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-redeem --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,RedeemWrites:Environment.Variables.ENABLE_ROLLER_REDEEM_WRITES}" --output json
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-session --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,StaffAuth:Environment.Variables.ENABLE_STAFF_AUTH,GuestSends:Environment.Variables.ENABLE_GUEST_MESSAGE_SENDS}" --output json
aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-webhook --profile wrlds-dev --region eu-north-1 --query "{Function:FunctionName,Env:Environment.Variables.JUMPYARD_ENVIRONMENT,Emergency:Environment.Variables.JUMPYARD_EMERGENCY_STOP,WebhookProcessing:Environment.Variables.ENABLE_ROLLER_WEBHOOK_PROCESSING}" --output json
aws rds-data execute-statement --resource-arn arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora --database jumpyard_cloud --sql "SELECT ... row counts ..."
```

The first draft-smoke attempt stopped before any Roller call because AWS SSO had expired. `aws sso login --profile wrlds-dev` refreshed the session, then the guarded draft smoke passed.

## Safety Outcome

T0158 performed:

- One AWS SSO refresh.
- One Roller auth request.
- One Roller Live availability read.
- One Roller Live cost quote request.
- One Roller Live draft creation request.
- Read-only Lambda environment checks.
- One read-only Aurora row-count check.

T0158 did not:

- Deploy AWS changes.
- Create or update AWS resources.
- Open park-test public API/Lambda draft writes.
- Call the public park-test API.
- Write Aurora rows.
- Start payment.
- Publish the draft.
- Redeem tickets.
- Enable or process webhooks.
- Send frontend visitor traffic.
- Send SMS or email.
- Print secret values.
- Print, persist, or commit raw payment JWT values.

## Next Gate

The next planned ticket is `T0159`, internal Live payment smoke. It must remain separate and requires explicit approval before any real payment attempt.
