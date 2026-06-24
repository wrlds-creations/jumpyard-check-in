# T0161 Live Catalog And Booking Index Readiness

## Goal

Verify the Roller Live product/add-on catalog for JumpYard Nacka Forum and decide whether the first park test needs a same-day booking index or only REST lookup by guest-entered booking code.

## Scope

- Read Roller Live venue, products, and product availability only.
- Do not read bookings, customers, guests, tickets, payments, or Data API exports.
- Do not create drafts, bookings, payments, refunds, redemptions, webhooks, SMS, email, visitor traffic, AWS resources, deploys, or Aurora writes.
- Keep park-test runtime gates closed.

## Tooling Added

Added `infra/scripts/roller-live-catalog-index-readiness.ts`.

The script:

- Validates the reviewed `park-test` config: AWS account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller Live base URL `https://api.roller.app`, and safety gates closed.
- Reads the existing park-test Roller credential secret and SSM env/base-url values without printing secret values.
- Allows only:
  - `POST /token` for auth.
  - `GET /venues/me`.
  - `GET /products`.
  - `GET /product-availability`.
- Blocks bookings, Data API, customers, guests, tickets, drafts, payments, redemptions, and webhooks.

New npm scripts:

- `npm --prefix infra run catalog:index:live:park-test`
- `npm --prefix infra run validate:roller-live-catalog-index-readiness`

## Live Catalog Result

Command:

```powershell
npx ts-node --prefer-ts-exts scripts/roller-live-catalog-index-readiness.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29
```

Result:

| Area | Result |
|---|---|
| Venue | `JumpYard Nacka Forum` |
| Venue id | `50871` |
| Currency | `SEK` |
| Top-level products | `100` |
| Flattened product rows | `506` |
| Availability probe | HTTP `200`, `108` sessions, `108` online-sales-open sessions |

Required entry parents:

| Key | Live parent product | Status |
|---|---|---|
| `E60` | `1189805` `Entré 60 min` | Ready |
| `E90` | `1189823` `Entré 90 min` | Ready |
| `E120` | `1189771` `Entré 120 min` | Ready |
| `F60` | `1189814` `Entré 60 min - Familj` | Ready |
| `F90` | `1189832` `Entré 90 min - Familj` | Ready |
| `F120` | `1189794` `Entré 120 min - Familj` | Ready |

Required add-ons:

| Add-on | Playground id currently used in code | Live id for park-test | Parent | Price | Status |
|---|---:|---:|---:|---:|---|
| `skyrider` | `1765443` | `970335` parent, availability selects child such as `970336` | `970335` | `40` SEK child seen in catalog | Ready |
| `socks` | `1765445` | `970338` | `970337` | `45` SEK | Ready |
| `lock` | `1765441` | `970334` | `970333` | `45` SEK | Ready |
| `coffee` | `1765452` | `970352` | `970346` | `35` SEK | Ready |

Important implementation note for T0162:

- The Playground add-on ids must not be used for Live.
- The current server/phone code still contains Playground-era static add-on ids for some add-ons.
- T0162 should either refresh/use a park-test Live product cache or introduce a server-owned per-environment mapping before opening an existing-booking add-on smoke.

## Booking Index Decision

Decision for the first park test: use REST-on-demand lookup by the guest-entered booking code, then store only the normalized looked-up booking snapshot in Aurora.

Do not import a broad same-day booking list before the first assisted park test.

Rationale:

- T0160 already proved exact Live booking lookup through JumpYard Cloud.
- The first park test is assisted and limited, so an all-day guest list is not required to start safely.
- Avoiding `/data` booking export minimizes Live guest-data exposure.
- Aurora can still cache the booking that the guest or staff explicitly looks up.
- Webhook processing and/or Data API indexing can be enabled later if broader traffic, staff queue dashboards, or staff search require it.

## Safety Outcome

T0161 performed:

- One Roller auth request.
- One Roller Live venue read.
- One Roller Live product catalog read.
- One Roller Live product availability read.
- AWS identity and existing secret/SSM reads.

T0161 did not:

- Create, update, deploy, or delete AWS resources.
- Write Aurora rows.
- Read bookings, Data API exports, customers, guests, tickets, or payments.
- Create drafts, bookings, payments, refunds, redemptions, or webhooks.
- Open public API gates.
- Enable webhook processing, staff auth, SMS, or email.
- Print secret values, access tokens, raw PII, or payment JWTs.

## Validation

Passed:

```powershell
npm --prefix infra run build
npm --prefix infra run validate:roller-live-catalog-index-readiness
npx ts-node --prefer-ts-exts scripts/roller-live-catalog-index-readiness.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29
```

The first Live command attempt stopped before AWS/Roller calls because the AWS SSO token had expired. `aws sso login --profile wrlds-dev` refreshed the session, then the read-only Live readiness passed.

## Next Gate

Next planned ticket: `T0162` existing-booking add-on smoke.

T0162 must stay controlled and should first handle Live product mapping/cache readiness for the add-on payload before any draft/payment write path is opened.
