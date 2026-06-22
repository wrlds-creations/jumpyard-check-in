# T0154 Live Webhook Dry-Run

Date: 2026-06-22

## Scope

T0154 prepares the park-test Roller Live booking webhook registration as a dry-run only.

The dry-run shows:

- The exact park-test JumpYard Cloud booking webhook endpoint.
- The Roller Live webhook registration endpoint.
- The expected delivery auth header.
- The event list and include settings.
- The duplicate-handling plan for T0155.
- The rollback command template for the webhook id recorded in T0155.

T0154 does not call Roller Live, does not register or change webhooks, does not create or update AWS resources, does not enable webhook processing, and does not print secret values.

## Tooling Added

Added `infra/scripts/roller-live-webhook-dry-run.ts`.

The script:

- Loads `infra/config/park-test.json`.
- Verifies account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller env `live`, and Roller base URL `https://api.roller.app`.
- Verifies park-test safety gates remain closed, including `rollerWebhookProcessingEnabled=false`.
- Verifies the required WRLDS tags for park-test.
- Reads AWS identity, CloudFormation stack output, SSM Roller env/base-url parameters, and webhook token secret metadata.
- Reads no secret values.
- Makes no Roller requests.
- Rejects write-like arguments such as `--apply`, `--register`, `--delete`, and `--webhook-id`.

New npm scripts:

- `npm --prefix infra run webhook:live:park-test:dry-run`
- `npm --prefix infra run validate:roller-live-webhook-dry-run`

## Dry-Run Result

Confirmed dry-run plan:

- AWS account: `376129878018`.
- AWS region: `eu-north-1`.
- Stack: `jumpyard-check-in-park-test-stack`, status `UPDATE_COMPLETE`.
- Roller target: `live` at `https://api.roller.app`.
- JumpYard Cloud booking webhook endpoint: `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`.
- Roller registration request: `POST https://api.roller.app/webhooks`.
- Delivery auth header expected from Roller: `x-roller-apikey`.
- Header value source: Secrets Manager `/jumpyard-check-in-park-test/webhooks/dev-token`.
- Events: `Created`, `Updated`, `Cancelled`.
- Include setting: `tickets=true`.
- Webhook processing gate remains closed for park-test, so a correctly authenticated delivery would currently return `ignored_disabled` instead of persisting/enriching.

Payload preview, with the secret value intentionally redacted:

```json
{
  "url": "https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings",
  "enabled": true,
  "authentication": {
    "apiKey": "<value from Secrets Manager /jumpyard-check-in-park-test/webhooks/dev-token>"
  },
  "webhooks": {
    "booking": {
      "events": ["Created", "Updated", "Cancelled"],
      "include": {
        "tickets": true
      }
    }
  }
}
```

## Duplicate Behavior

T0155 must not blindly create a new Live webhook.

Required behavior for T0155:

- `GET https://api.roller.app/webhooks` first.
- Match existing webhooks by exact URL `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`.
- If an enabled webhook already matches the URL and event shape, record that webhook id and skip `POST`.
- If a disabled or mismatched webhook uses the same URL, stop for manual review.
- If no match exists, create exactly one webhook and record the returned webhook id.

## Rollback Template

T0155 must record the Live webhook id. Rollback can then target only that id.

Endpoint template:

```text
DELETE https://api.roller.app/webhooks/<recorded-live-webhook-id>
```

Command template:

```bash
curl --fail --request DELETE "https://api.roller.app/webhooks/<recorded-live-webhook-id>" --header "Authorization: Bearer <roller-access-token-from-t0155-auth-step>" --header "Accept: application/json"
```

The dev Playground webhook `238` must stay untouched.

## Commands Run

Passed:

```bash
npm --prefix infra run build
npm --prefix infra run validate:roller-live-webhook-dry-run
npm --prefix infra run webhook:live:park-test:dry-run
npx ts-node --prefer-ts-exts scripts/roller-live-webhook-dry-run.ts --config ./config/park-test.json --profile wrlds-dev --json
npm --prefix infra run check
npm run validate
git diff --check
```

Read-only AWS checks performed by the dry-run:

- `sts get-caller-identity`
- `cloudformation describe-stacks`
- `ssm get-parameter`
- `secretsmanager describe-secret`

No `secretsmanager get-secret-value`, Roller request, CDK deploy, or AWS write command was performed by the T0154 dry-run.

`git diff --check` printed CRLF conversion warnings only and exited `0`.

## Safety Outcome

T0154 did not:

- Register, update, disable, delete, or inspect Roller Live webhooks.
- Call Roller Live at all.
- Create, update, deploy, or delete AWS resources.
- Print secret values, access tokens, raw PII, raw Roller payloads, or raw webhook payloads.
- Enable park-test webhook processing, frontend traffic, payments, redemptions, SMS, or email.

## Required Next Gate

T0155 may register or match the Roller Live webhook only after explicit approval.

T0155 must keep the scope to webhook registration/intake verification only: no customer flow rollout, payment, redeem, frontend traffic, SMS, or email.
