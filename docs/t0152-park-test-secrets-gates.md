# T0152 Park-Test Secrets And Gates

Date: 2026-06-22

## Scope

T0152 adds explicit park-test runtime gates for the sensitive paths that must stay closed before controlled Roller Live testing:

- Roller booking draft/payment-start writes.
- Roller ticket redemption writes.
- Roller webhook processing/enrichment.
- Staff auth token issuing.
- Real guest SMS/email sends.
- Environment-wide emergency stop for those gates.

No secret values were added to the repository, printed, or read. No Roller Live API call was made.

## Secret References

Park-test continues to resolve only park-test AWS names through the `jumpyard-check-in-park-test` resource prefix:

| Purpose | AWS location |
|---|---|
| Roller credentials | Secrets Manager `/jumpyard-check-in-park-test/roller/credentials` |
| Webhook shared token | Secrets Manager `/jumpyard-check-in-park-test/webhooks/dev-token` |
| Redeem confirmation token | Secrets Manager `/jumpyard-check-in-park-test/redeem/dev-token` |
| Staff auth config | Secrets Manager `/jumpyard-check-in-park-test/staff/auth` |
| Check-in link creation token | Secrets Manager `/jumpyard-check-in-park-test/checkin-links/dev-token` |
| Roller environment | SSM Parameter Store `/jumpyard-check-in-park-test/roller/env` |
| Roller base URL | SSM Parameter Store `/jumpyard-check-in-park-test/roller/base-url` |

The `dev-token` suffix is an existing implementation name for shared internal tokens. The environment isolation comes from the full `/jumpyard-check-in-park-test/...` path, not from the suffix.

## Gate Defaults

`infra/config/dev.json` keeps today's Playground behavior enabled. `infra/config/park-test.json` keeps the park-test gates closed.

| Gate | Dev | Park-test |
|---|---:|---:|
| `safetyGates.emergencyStop` | `false` | `true` |
| `safetyGates.staffAuthEnabled` | `true` | `false` |
| `safetyGates.guestMessagingSendsEnabled` | `true` | `false` |
| `safetyGates.rollerWebhookProcessingEnabled` | `true` | `false` |
| `safetyGates.rollerBookingDraftWritesEnabled` | `true` | `false` |
| `safetyGates.rollerRedeemWritesEnabled` | `true` | `false` |

CDK maps those config values into Lambda environment variables:

- `JUMPYARD_ENVIRONMENT`
- `JUMPYARD_EMERGENCY_STOP`
- `ENABLE_STAFF_AUTH`
- `ENABLE_GUEST_MESSAGE_SENDS`
- `ENABLE_ROLLER_WEBHOOK_PROCESSING`
- `ENABLE_ROLLER_BOOKING_DRAFT_WRITES`
- `ENABLE_ROLLER_REDEEM_WRITES`

## Runtime Enforcement

- Booking draft routes return `roller_booking_draft_writes_disabled` before idempotency, DB, or Roller write work starts.
- Redeem returns `redeem_write_disabled` before calling Roller `POST /redemptions` when the write gate or emergency stop is closed.
- Staff auth login returns `staff_auth_disabled` before reading the staff auth secret.
- Confirmed SMS/email sends return `guest_message_sends_disabled`; dry-run planning remains possible.
- Webhook requests still require the shared token, but when processing is disabled they return `ignored_disabled` without persisting or enriching the webhook.

## Validation

Passed locally:

- `npm --prefix infra run build`
- `npm --prefix infra run validate:config-guards`
- `npm --prefix infra run validate:park-test-synth`
- `npm --prefix infra run check`
- `npm --prefix infra run synth:park-test`

Local runtime smokes:

- Booking draft with gates closed returned `409 roller_booking_draft_writes_disabled`.
- Staff auth with gates closed returned `409 staff_auth_disabled`.
- Confirmed SMS send with gates closed returned `409 guest_message_sends_disabled`.
- Webhook processing with gates closed returned `200 ignored_disabled`.

## AWS Deploy

Preflight:

- `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018` and SSO role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- Park-test stack was `CREATE_COMPLETE`.
- Dev stack was `UPDATE_COMPLETE`.

Deploy:

- Pre-deploy `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed Lambda env/code updates only.
- `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never` completed successfully.
- CloudFormation stack `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE` at `2026-06-22T09:06:57.672000+00:00`.
- Outputs remained: API `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`, Aurora `arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora`, raw bucket `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`, Roller credentials secret `/jumpyard-check-in-park-test/roller/credentials`.

Post-deploy:

- `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
- Lambda env readback confirmed `JUMPYARD_ENVIRONMENT=park-test` and `JUMPYARD_EMERGENCY_STOP=true`.
- Booking Lambda readback confirmed `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false`.
- Redeem Lambda readback confirmed `ENABLE_ROLLER_REDEEM_WRITES=false`.
- Session Lambda readback confirmed `ENABLE_STAFF_AUTH=false` and `ENABLE_GUEST_MESSAGE_SENDS=false`.
- Webhook Lambda readback confirmed `ENABLE_ROLLER_WEBHOOK_PROCESSING=false`.
- Safe API smoke `POST /v1/staff/auth/login` returned `409 staff_auth_disabled`.
- Safe API smoke `POST /v1/bookings/draft` returned `409 roller_booking_draft_writes_disabled`.

T0152 did not populate secret values, call Roller Live, register webhooks, create drafts/payments, redeem tickets, send SMS/email, connect frontend traffic, or run visitor flows.
