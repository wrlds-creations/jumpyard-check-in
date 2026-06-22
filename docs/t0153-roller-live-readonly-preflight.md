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
- Result: placeholder-only.
- Secret values were not printed.

Explicit fallback credential source tested:

- Secrets Manager `/jumpyard-check-in-dev/roller/credentials`
- Result: `POST https://api.roller.app/token` returned HTTP `400`.
- Secret values, access tokens, and raw auth payloads were not printed.

Because auth failed, no Roller Live read data request was made.

## Preflight Result

T0153 is blocked before the actual Roller Live data reads.

Confirmed:

- AWS identity was in account `376129878018` with SSO role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- Park-test config points at Roller Live base URL `https://api.roller.app`.
- Park-test safety gates remain closed.
- The read-only script guard passed locally.
- The park-test Roller credentials secret is not populated with real credentials.
- The documented dev fallback credentials are not accepted by the Roller Live token endpoint.

Not confirmed because auth failed:

- Live venue id/name/timezone/currency.
- Live payment settings visibility.
- Live product catalog.
- Live 60-minute entry product ids.
- Live availability-relevant product ids/sessions.

## Commands Run

Passed:

```bash
npm --prefix infra run build
npm --prefix infra run validate:roller-live-readonly-preflight
aws sts get-caller-identity --profile wrlds-dev --region eu-north-1 --output json
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

## Safety Outcome

T0153 did not:

- Create, update, deploy, or delete AWS resources.
- Change any AWS secret values.
- Print secret values or access tokens.
- Reach `GET /venues/me`, `GET /products`, or `GET /product-availability`.
- Create quotes, costs, drafts, payments, bookings, redemptions, webhook registrations, frontend traffic, SMS, or email.

## Required Next Gate

Before T0153 can pass and before T0154/T0157 should proceed, one of these must happen:

- Populate `/jumpyard-check-in-park-test/roller/credentials` with a Roller Live-capable credential for JumpYard Nacka.
- Or explicitly approve another read-only fallback credential source and document it before running the preflight.

After that, rerun:

```bash
npm --prefix infra run preflight:roller-live:park-test -- --json
```
