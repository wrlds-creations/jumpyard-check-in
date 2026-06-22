# T0153 Roller Live Read-Only Preflight

Date: 2026-06-22

## Scope

T0153 adds and runs a fail-closed Roller Live read-only preflight for the park-test environment.

The intended read-only checks are:

- Roller Live venue/context through `GET /venues/me`.
- Roller Live product catalog through `GET /products`.
- 60-minute entry candidate detection from the product catalog.
- Availability-relevant inputs through `GET /product-availability`.
- Payment/settings visibility from the venue response.

No quote/cost, draft, payment, webhook registration, redeem, frontend, SMS, email, or data mutation is in scope.

## Tooling Added

Added `infra/scripts/roller-live-readonly-preflight.ts`.

The script:

- Loads the reviewed park-test config from `infra/config/park-test.json`.
- Verifies AWS account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller env `live`, and base URL `https://api.roller.app`.
- Verifies park-test safety gates remain closed.
- Reads park-test SSM/Secrets Manager configuration without printing secret values.
- Allows only these Roller data endpoints:
  - `GET /venues/me`
  - `GET /products`
  - `GET /product-availability`
- Blocks write-like and sensitive endpoints including bookings, drafts, webhooks, redemptions, payments, guests, customers, and tickets.
- Treats `POST /token` as the auth step only; it does not create Roller business data.

New npm scripts:

- `npm --prefix infra run preflight:roller-live:park-test`
- `npm --prefix infra run validate:roller-live-readonly-preflight`

## Credential Findings

Park-test primary credential source:

- Secrets Manager `/jumpyard-check-in-park-test/roller/credentials`
- Final result: populated with Live-capable credentials and used successfully.
- Secret values were not printed.

Earlier fallback credential source tested before park-test credentials were populated:

- Secrets Manager `/jumpyard-check-in-dev/roller/credentials`
- Result: `POST https://api.roller.app/token` returned HTTP `400`.
- Secret values, access tokens, and raw auth payloads were not printed.

## Preflight Result

T0153 passed the Roller Live read-only preflight after the park-test secret was populated.

Confirmed:

- AWS identity was in account `376129878018` with SSO role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- Park-test config points at Roller Live base URL `https://api.roller.app`.
- Park-test safety gates remain closed.
- The read-only script guard passed locally.
- Roller auth succeeded with the park-test secret.
- `GET /venues/me` returned venue `JumpYard Nacka Forum`, venue id `50871`, currency `SEK`, and Stockholm/Central European timezone metadata.
- Venue payment settings are visible: API URL, configuration id, and integration id are present.
- `GET /products` returned HTTP `200`, with 98 top-level products and 502 flattened product rows.
- 60-minute entry candidates were found:
  - `Entré 60 min`, parent product id `1189805`.
  - `Entré 60 min - Familj`, parent product id `1189814`.
  - Child ticket price variants under `Entré 60 min` include `17000`, `18000`, `19000`, `20000`, `22000`, and `24000` cents.
- `GET /product-availability` for `2026-06-29` and product ids `1189805,1189814` returned HTTP `200`, 38 sessions, and online sales open for the returned sessions.

## Commands Run

Passed:

```bash
npm --prefix infra run build
npm --prefix infra run validate:roller-live-readonly-preflight
aws sts get-caller-identity --profile wrlds-dev --region eu-north-1 --output json
npx ts-node --prefer-ts-exts scripts/roller-live-readonly-preflight.ts --config ./config/park-test.json --profile wrlds-dev --json
```

Expected safe stop:

```bash
npm --prefix infra run preflight:roller-live:park-test
```

Result: primary park-test credentials secret is placeholder-only.

Expected safe stop, run directly so the fallback flag is passed unambiguously:

```bash
npx ts-node --prefer-ts-exts scripts/roller-live-readonly-preflight.ts --config ./config/park-test.json --profile wrlds-dev --fallback-secret /jumpyard-check-in-dev/roller/credentials --json
```

Result: Roller Live token request failed with HTTP `400`.

Final successful command:

```bash
npx ts-node --prefer-ts-exts scripts/roller-live-readonly-preflight.ts --config ./config/park-test.json --profile wrlds-dev --json
```

Final successful Roller calls:

- `POST /token` auth returned HTTP `200`.
- `GET /venues/me` returned HTTP `200`.
- `GET /products` returned HTTP `200`.
- `GET /product-availability` returned HTTP `200`.

## Safety Outcome

T0153 did not:

- Create, update, deploy, or delete AWS resources.
- Print secret values or access tokens.
- Create quotes, costs, drafts, payments, bookings, redemptions, webhook registrations, frontend traffic, SMS, or email.

The only AWS state change was the user-provided update of the existing `/jumpyard-check-in-park-test/roller/credentials` secret value through the AWS Console. No CDK deploy or AWS resource shape change occurred.

## Required Next Gate

T0153 unlocks the next scoped read/write gates, but does not approve them automatically.

Next safe options:

- T0154: prepare Live webhook dry-run only.
- T0157: run a scoped Live quote/cost smoke for `Entré 60 min`; no draft, payment, redeem, webhook registration, frontend traffic, SMS, or email.
