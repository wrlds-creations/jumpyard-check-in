# T0166 Controlled Live Redeem Smoke

## Goal

Prove that the park-test phone/admin flow can redeem one controlled Roller Live ticket through JumpYard Cloud, then close the gates again.

## Scope

- Original booking reference: `166490323`.
- Roller unique id: `9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088`.
- Ticket id: `166490323-560714728`.
- Check-in session id: `jycs_mqtimdxf_bb33c94c`.
- Allowed path: lookup, start/resume session, complete guest safety, staff auth, staff detail, staff-confirmed redeem.
- No normal visitor traffic, broad lookup, broad redeem, draft/payment creation, refunds, webhook processing, SMS, or email.

## Implemented Gate

T0166 adds a separate redeem-smoke config:

- `infra/config/park-test-live-redeem-smoke.json`
- `PARK_TEST_LIVE_REDEEM_SMOKE_APPROVAL`
- `ENABLE_T0166_LIVE_REDEEM_SMOKE`
- `T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS`

The reviewed smoke config temporarily enables:

- exact lookup allowlist for `166490323` and `9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088`
- exact redeem allowlist for `166490323`, `9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088`, and `166490323-560714728`
- staff auth
- Roller redeem writes

It still keeps:

- `JUMPYARD_EMERGENCY_STOP=true`
- booking draft/payment-start writes off
- add-on smoke off
- webhook processing off
- SMS off
- email off

## Implementation Notes

- CDK config validation requires the approval phrase, a non-empty exact redeem allowlist, `rollerRedeemWritesEnabled=true`, and `staffAuthEnabled=true` for T0166.
- Without the T0166 approval phrase, park-test config validation requires redeem writes and staff auth to remain disabled.
- `SessionHandler` allows the temporary staff-auth path while emergency stop is on only when T0166 is enabled.
- `RedeemHandler` can use Roller Live only in `park-test` when T0166 is enabled, the base URL is exactly `https://api.roller.app`, redeem writes are enabled, and the booking/unique id plus every selected ticket id are in the exact allowlist.
- Final redeem refresh enriches product type/name from the Live product catalog and preserves existing safe item/ticket summaries so redeemability is not lost when a later Roller detail response omits classification fields.

## AWS Gate Opening

Pre-deploy validation:

- `npm --prefix infra run build` passed.
- `npm --prefix infra run validate:config-guards` passed.
- `npm --prefix infra run validate:park-test-synth` passed.
- `npm --prefix infra run synth:park-test-redeem-smoke` passed.
- `npm --prefix infra run diff:park-test-redeem-smoke` showed only existing Lambda code/environment changes.
- `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- `aws configure get region --profile wrlds-dev` returned `eu-north-1`.

Opened with:

```powershell
npm --prefix infra run deploy:park-test-redeem-smoke
```

Open-gate readback:

- Lookup env: `park-test`, emergency stop `true`, T0160 lookup smoke `true`, allowlist `166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088`.
- Session env: `park-test`, emergency stop `true`, staff auth `true`, T0166 `true`, SMS/email off.
- Redeem env: `park-test`, emergency stop `true`, redeem writes `true`, T0166 `true`, allowlist `166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088,166490323-560714728`.
- Booking env: draft/add-on/payment gates off.

No new AWS resources were created.

## Smoke Evidence

The controlled flow used the park-test public API and admin/staff route:

- Lookup for `166490323` returned the Live booking.
- Session `jycs_mqtimdxf_bb33c94c` was started.
- Guest safety completion moved the session to `ready_for_staff`.
- Staff auth/list/detail worked under the temporary T0166 staff-auth gate.
- Staff redeem succeeded after the final fixes:
  - HTTP `200`.
  - Session status `redeemed`.
  - Handoff status `completed`.
  - Roller response ref `roller_redemptions:http_200`.
  - Redeemed ticket id `166490323-560714728`.

Safe Aurora readback after the successful redeem:

- Session `jycs_mqtimdxf_bb33c94c`:
  - status `redeemed`
  - handoff `completed`
  - safety `completed`
  - selected tickets `["166490323-560714728"]`
  - completed at `2026-06-25 13:17:06.149725+00`
- Ticket `166490323-560714728`:
  - `redeem_status_last_seen='redeemed'`
  - item summary includes `productType: "sessionpass"`
- Redeem attempt `redeem_attempt:701798...`:
  - status `redeemed`
  - `roller_response_ref='roller_redemptions:http_200'`
  - selected tickets `["166490323-560714728"]`

Earlier failed attempts were fail-closed:

- First staff redeem hit a T0166 config guard gap because `RedeemHandler` still blocked Live config. No Roller redemption call was made.
- A later attempt returned `no_redeemable_tickets` because final refresh had overwritten product classification with less complete Roller detail. No Roller redemption call was made.
- The fix preserved/enriched product classification before the final redeem decision.

## Closeout

Closed with:

```powershell
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
```

Closed-gate readback:

- Lookup env: T0160 lookup smoke `false`, allowlist empty.
- Session env: staff auth `false`, T0166 `false`, allowlist empty.
- Redeem env: redeem writes `false`, T0166 `false`, allowlist empty.
- Booking env: draft/add-on/payment gates `false`.
- Webhook/SMS/email remained disabled.

Closed-gate API checks:

- Lookup for `166490323` returned HTTP `409`, code `live_lookup_disabled`.
- Staff auth with a bogus passcode returned HTTP `409`, code `staff_auth_disabled`.
- `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.

## Result

T0166 passed. One exact Live ticket was redeemed in Roller and reflected in Aurora through the staff-confirmed JumpYard Cloud flow.

The normal park-test config is closed again. T0166 does not approve broad lookup, broad staff auth, broad redeem, webhook processing, SMS/email, payments, or visitor traffic.

Follow-up added after closeout discussion:

- `T0176` Frontend redeem rehearsal should let Love run the deployed phone/admin redeem flow end to end before a real visitor uses it.
- This is separate from T0166 because T0166 proved the backend/staff-redeem chain and exact Roller Live write; T0176 proves the human frontend experience, button states, post-redeem UI, and recovery cues.

## Validation Log

- `npm --prefix infra run build` passed.
- `node --check infra\lambda\redeem\index.js` passed.
- `node --check infra\lambda\session\index.js` passed.
- `npm --prefix infra run validate:config-guards` passed.
- `npm --prefix infra run validate:park-test-synth` passed.
- `npm --prefix infra run synth:park-test-redeem-smoke` passed.
- `npm --prefix infra run diff:park-test-redeem-smoke` passed before opening and showed expected Lambda code/environment changes only.
- `npm --prefix infra run deploy:park-test-redeem-smoke` passed.
- `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never` passed for closeout.
- `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences after closeout.
