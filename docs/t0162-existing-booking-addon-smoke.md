# T0162 Existing-Booking Add-On Smoke

## Goal

Prove one controlled add-on path for an existing Roller Live booking in park-test.

## Controlled Target

| Field | Value |
|---|---|
| Original booking reference | `166490323` |
| Guest/test name | Love WRLDS |
| Venue | JumpYard Nacka Forum |
| Booking time | 2026-06-25 11:00 Europe/Stockholm |
| Planned add-on | `socks` / Live product `970338` |
| Mode | Separate linked add-on draft booking |

## Scope

- Temporarily open exact lookup for booking `166490323`.
- Temporarily open add-product quote/draft only for booking `166490323`.
- Keep the original Roller booking unmodified.
- Keep park-test emergency stop enabled.
- Keep redeem, webhook processing, staff auth, SMS, email, broad booking export/Data API indexing, and normal visitor traffic disabled.
- Do not print secrets, access tokens, raw payment JWTs, full guest PII, card data, or broad Live booking data.

## Implementation Notes

T0162 adds:

- `infra/config/park-test-live-addon-smoke.json`
- `safetyGates.liveAddOnSmokeApproval`
- `safetyGates.liveAddOnSmokeAllowedIdentifiers`
- `ENABLE_T0162_LIVE_ADDON_SMOKE`
- `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS`

The booking Lambda now separates:

- new-booking draft writes, still allowed only by the T0159 smoke override while emergency stop is enabled.
- existing-booking add-product draft writes, allowed only by the T0162 smoke override while emergency stop is enabled.

The T0162 gate also provides a temporary server-owned Live product map for the Nacka products verified in T0161, so the frontend/API does not fall back to Playground product ids.

## Validation Log

Passed before AWS deploy:

```powershell
npm --prefix infra run build
npm --prefix infra run validate:config-guards
npm --prefix infra run validate:park-test-synth
```

AWS SSO status:

- Initial `aws sts get-caller-identity --profile wrlds-dev` timed out because the SSO token had expired.
- Initial `cdk diff` stopped before AWS changes with `no credentials have been configured`.
- Device-flow SSO was started for user approval.
- AWS identity later verified account `376129878018`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.

Opening diff:

- `LookupHandler` environment only: `ENABLE_T0160_LIVE_LOOKUP_SMOKE=true`, allowlist `166490323`.
- `BookingHandler` code/environment only: `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, `ENABLE_T0162_LIVE_ADDON_SMOKE=true`, allowlist `166490323`.
- No new AWS resources.

Opening deploy:

```powershell
npx cdk deploy -c config=./config/park-test-live-addon-smoke.json --require-approval never
```

Result: CloudFormation stack `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE`.

Open-gate readback:

| Gate | Value |
|---|---|
| `ENABLE_T0160_LIVE_LOOKUP_SMOKE` | `true` |
| `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS` | `166490323` |
| `ENABLE_ROLLER_BOOKING_DRAFT_WRITES` | `true` |
| `ENABLE_T0162_LIVE_ADDON_SMOKE` | `true` |
| `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS` | `166490323` |
| `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES` | `false` |
| `JUMPYARD_EMERGENCY_STOP` | `true` |

API lookup smoke:

- `POST /v1/check-in/lookup` for booking `166490323` returned `found`.
- Source was Roller Live.
- Eligibility was `ready`.
- Public response had no raw customer name, email, or phone fields.
- Item count was `1`; ticket count was `0` in the public normalized response.

API availability smoke:

- `POST /v1/bookings/availability` for 2026-06-25 11:00 returned Live add-ons:
  - SkyRider child `970336`, parent `970335`, `40` SEK.
  - socks `970338`, parent `970337`, `45` SEK.
  - lock `970334`, parent `970333`, `45` SEK.
  - coffee `970352`, parent `970346`, `35` SEK.

API add-product quote smoke:

- `POST /v1/bookings/166490323/add-products/quote` for one socks add-on returned HTTP `409`.
- Error code: `original_booking_contact_unresolved`.
- Meaning: JumpYard Cloud found the original booking but could not resolve required email/phone contact server-side from Roller detail, local prepayment draft state, or `guest_profiles`.
- No add-on draft, payment session, booking link, or add-product event was created.

Safe Aurora readback:

| Check | Result |
|---|---:|
| `roller_bookings` rows for `166490323` | `1` |
| Original booking customer id present | `false` |
| Matching local prepayment draft contact | `false` |
| Matching guest profile contact | `false` |
| Add-on prepayment draft rows for `166490323` | `0` |
| Booking link rows for `166490323` | `0` |
| Add-product event rows for `166490323` | `0` |

Closing deploy:

```powershell
npx cdk deploy -c config=./config/park-test.json --require-approval never
```

Result: CloudFormation stack `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE`.

Closed-gate readback:

| Gate | Value |
|---|---|
| `ENABLE_T0160_LIVE_LOOKUP_SMOKE` | `false` |
| `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS` | empty |
| `ENABLE_ROLLER_BOOKING_DRAFT_WRITES` | `false` |
| `ENABLE_T0162_LIVE_ADDON_SMOKE` | `false` |
| `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS` | empty |
| `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES` | `false` |
| `JUMPYARD_EMERGENCY_STOP` | `true` |

Closed-gate API checks:

- Lookup for `166490323` returned `live_lookup_disabled`.
- Add-product quote for `166490323` returned `live_addon_smoke_disabled`.

## Next Tickets

- `T0163`: investigate where Roller Live exposes customer contact for existing bookings, compare Live with the Playground path, and update the server-side resolver if the approved response contains reusable contact.
- `T0164`: retry the existing-booking add-on payment smoke through the phone frontend after T0163 resolves/contact-handling is documented.
- `T0165`: controlled Live redeem smoke.
- `T0166`: staff-assisted visitor test.
- `T0167`: outcome and go/no-go documentation.

## Result

Passed as a safe blocker-finding smoke and stopped before writes.

T0162 proved the scoped gate, exact Live lookup, Live add-on product IDs, and closed-gate rollback. The add-product quote correctly failed closed because JumpYard Cloud did not yet resolve reusable customer contact details for booking `166490323`. The follow-up is not a T0162A ticket; it is the new T0163 contact resolver investigation.
