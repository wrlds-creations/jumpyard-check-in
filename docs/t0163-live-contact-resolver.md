# T0163 Live Existing-Booking Contact Resolver Investigation

## Goal

Find where Roller Live exposes reusable customer contact for existing booking `166490323`, then update JumpYard Cloud's server-side resolver if the approved read-only response contains complete contact for add-on draft creation.

## Scope

- Exact Roller Live booking identifier: `166490323`.
- Read-only Roller Live calls only.
- No add-on draft, payment, redeem, webhook processing, broad booking export, SMS, email, visitor traffic, or public PII output.
- Frontend continues to avoid direct Roller calls and does not receive raw customer contact for this resolver.

## Findings

The guarded T0163 read-only tool found:

| Check | Result |
|---|---|
| `GET /bookings/166490323` | HTTP `200` |
| Direct contact fields in booking detail | none found |
| Guest/customer id candidate | `body.customerId` |
| `GET /guests/{body.customerId}` | HTTP `200` |
| Guest detail contact | first name, last name, email, and phone all present |

This explains T0162: the booking detail had the pointer to the customer/guest, but the add-on resolver only looked at direct booking fields, local prepayment drafts, and local `guest_profiles`.

## Implementation

Added `infra/scripts/roller-live-contact-resolver.ts` with:

- exact booking allowlist for `166490323`;
- endpoint guard permitting only `GET /bookings/166490323` and `GET /guests/{id}`;
- self-test that blocks draft, payment, redeem, webhook, customer, Data API, products, and non-approved booking endpoints;
- safe output showing only field presence and paths, not full PII or secrets.

Updated `infra/lambda/booking/index.js` so existing-booking add-product quote/draft resolution now:

1. reads Roller booking detail;
2. tries direct booking/customer/contact fields;
3. tries local prepayment draft / `guest_profiles` contact;
4. if still incomplete, reads `GET /guests/{customerId}` from candidate ids in the booking detail;
5. uses that contact server-side for the separate linked add-on draft payload.

The public frontend still does not receive raw customer contact.

## AWS Deploy

T0163 deployed the normal closed `park-test.json` config after a template diff showed only the existing `BookingHandler` Lambda code asset changed.

Post-deploy checks:

- CloudFormation stack reached `UPDATE_COMPLETE`.
- `BookingHandler` readback confirmed `JUMPYARD_ENVIRONMENT=park-test`.
- `JUMPYARD_EMERGENCY_STOP=true`.
- `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false`.
- `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=false`.
- `ENABLE_T0162_LIVE_ADDON_SMOKE=false`.
- `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS` empty.
- Post-deploy CDK diff for `park-test.json` showed no differences.

No new AWS resources were created.

## Validation

Passed:

```powershell
npm --prefix infra run validate:roller-live-contact-resolver
npm --prefix infra run build
node --check infra/lambda/booking/index.js
npm --prefix infra run contact:live:park-test
npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template
```

## Result

Completed.

T0163 proved that existing Roller Live bookings can expose reusable contact through `GET /guests/{customerId}` when booking detail lacks direct email/phone fields. JumpYard Cloud now has a deployed server-side fallback for that path while all park-test write gates remain closed.

T0164 can retry the existing-booking add-on payment smoke through the phone frontend with the scoped add-on/payment gates opened only for the controlled test.
