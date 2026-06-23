# T0155 Live Webhook Registration

Date: 2026-06-23

## Scope

T0155 registered or matched the Roller Live booking webhook for park-test and verified the JumpYard Cloud intake path safely.

The ticket allowed:

- Roller Live auth and `GET /webhooks`.
- One guarded `POST /webhooks` only if the exact park-test endpoint was missing.
- A synthetic intake smoke against the park-test webhook endpoint while webhook processing remained disabled.

The ticket did not allow AWS resource changes, frontend traffic, booking/draft/payment creation, redemptions, SMS, email, secret printing, raw Roller payload printing, or enabling webhook processing.

## Tooling Added

Added `infra/scripts/roller-live-webhook-register.ts`.

The script:

- Loads `infra/config/park-test.json`.
- Verifies AWS account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller env `live`, Roller base URL `https://api.roller.app`, and required WRLDS tags.
- Verifies sensitive park-test gates remain closed, including `rollerWebhookProcessingEnabled=false`.
- Reads AWS identity, CloudFormation stack output, SSM Roller env/base-url parameters, Secrets Manager values needed for Roller auth and webhook auth, and Aurora admin secret metadata.
- Does not print secret values, Roller tokens, raw Roller payloads, raw webhook payloads, or PII.
- Calls only Roller Live `POST /token`, `GET /webhooks`, and guarded `POST /webhooks`.
- Blocks bookings, drafts, costs, payments, redemptions, customers, tickets, webhook deletion, and non-scoped endpoints in self-test.
- Requires `ROLLER_LIVE_WEBHOOK_REGISTER_ALLOW_WRITE=I_UNDERSTAND_THIS_REGISTERS_LIVE_WEBHOOK_FOR_JUMPYARD_NACKA` before any registration write.
- Reuses an existing exact URL match instead of duplicating it.

New npm scripts:

- `npm --prefix infra run register:webhook:live:park-test`
- `npm --prefix infra run register:webhook:live:park-test:apply`
- `npm --prefix infra run validate:roller-live-webhook-register`

## Registration Result

Initial dry-run/list mode:

- AWS account: `376129878018`.
- AWS region: `eu-north-1`.
- Stack: `jumpyard-check-in-park-test-stack`, status `UPDATE_COMPLETE`.
- Roller target: `live` at `https://api.roller.app`.
- Existing Live webhook count before registration: `1`.
- Exact park-test endpoint match before registration: `false`.
- No webhook was created in dry-run mode.

Guarded registration used the explicit write phrase and registered the missing park-test endpoint. Follow-up list mode confirmed:

- Existing Live webhook count: `2`.
- Exact park-test endpoint match: `true`.
- Registered Live webhook id: `1465`.
- Webhook enabled: `true`.
- Events: `Created`, `Updated`, `Cancelled`.
- Include setting: `tickets=true`.
- Endpoint: `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`.
- Delivery auth value source: Secrets Manager `/jumpyard-check-in-park-test/webhooks/dev-token`.
- Rollback endpoint: `https://api.roller.app/webhooks/1465`.

The dev Playground webhook `238` was not touched.

## Safe Intake Smoke

The safe intake smoke posted one synthetic webhook-shaped payload directly to the park-test JumpYard Cloud endpoint with the configured `x-roller-apikey` header value.

Result:

- HTTP status: `200`.
- Response status: `ignored_disabled`.
- Smoke event id: `t0155-smoke-20260623060627-1d738702-a5f3-41a6-a75f-0fc005d12a39`.
- Aurora rows before for that event id: `0`.
- Aurora rows after for that event id: `0`.
- Expected no Aurora insert: `true`.

This proves the endpoint/auth path is reachable while park-test webhook processing remains disabled. It did not process, enrich, or persist the event.

## Rollback

Rollback should target only the recorded Live webhook id:

```text
DELETE https://api.roller.app/webhooks/1465
```

The rollback command must first obtain a Roller Live access token through the same guarded auth path and must not touch the dev Playground webhook `238`.

## Commands Run

Passed:

```powershell
npm --prefix infra run build
npm --prefix infra run validate:roller-live-webhook-register
npm --prefix infra run register:webhook:live:park-test
npx ts-node --prefer-ts-exts scripts/roller-live-webhook-register.ts --config ./config/park-test.json --profile wrlds-dev --json
$env:ROLLER_LIVE_WEBHOOK_REGISTER_ALLOW_WRITE='I_UNDERSTAND_THIS_REGISTERS_LIVE_WEBHOOK_FOR_JUMPYARD_NACKA'
npx ts-node --prefer-ts-exts scripts/roller-live-webhook-register.ts --config ./config/park-test.json --profile wrlds-dev --apply --json
Remove-Item Env:ROLLER_LIVE_WEBHOOK_REGISTER_ALLOW_WRITE
```

The final closeout validation commands are recorded in [docs/history/validation-log.md](history/validation-log.md).

## Safety Outcome

T0155 did not:

- Create, update, deploy, or delete AWS resources.
- Enable park-test webhook processing.
- Insert the smoke event into Aurora.
- Create bookings, drafts, quotes, payments, redemptions, SMS, or email.
- Connect frontend traffic.
- Print or commit secret values, access tokens, raw PII, raw Roller payloads, or raw webhook payloads.

## Required Next Gate

T0156 should configure a separate park-test frontend API target using the same phone/admin source code.

Webhook processing remains closed until a later scoped ticket explicitly opens it.
