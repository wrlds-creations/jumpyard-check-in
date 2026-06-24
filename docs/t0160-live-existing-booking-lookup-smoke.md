# T0160 Live Existing-Booking Lookup Smoke

## Goal

Prove that the paid Roller Live booking from T0159 can be found through JumpYard Cloud lookup in park-test without opening broad booking export or any write path.

## Controlled Targets

- Booking reference: `166447399`
- Roller unique id: `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e`
- Environment: `park-test`
- Roller target: Live, server-side only
- Venue intent: JumpYard Nacka Forum

## Scope

- Open only the T0160 lookup smoke gate for the controlled identifiers.
- Keep public draft/payment writes closed.
- Keep redeem writes closed.
- Keep webhook processing closed.
- Keep staff auth, SMS, and email closed.
- Do not create new bookings, payments, refunds, redemptions, webhooks, or AWS resources.
- Keep public validation output free from raw names, email, phone, payment JWTs, and secrets.

## Implementation Plan

- Add a dedicated `park-test-live-lookup-smoke` config that requires the T0160 approval phrase and exact identifier allowlist.
- Keep normal `park-test.json` closed.
- Make park-test lookup fail closed unless the T0160 lookup smoke gate is enabled.
- Let the lookup handler accept only the controlled booking reference and unique id while the gate is open.
- Normalize public Live lookup responses without ticket-holder names or customer identity.
- Deploy the lookup-smoke config, run controlled API smokes, then deploy normal `park-test.json` to close the gate again.

## Validation

- `npm --prefix infra run build` passed.
- `npm --prefix infra run validate:config-guards` passed.
- `npm --prefix infra run validate:park-test-synth` passed.
- `git diff --check` passed with only existing CRLF normalization warnings.
- AWS identity readback used account `376129878018`, region `eu-north-1`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- Opening diff for `infra/config/park-test-live-lookup-smoke.json` changed only `LookupHandler` code plus `ENABLE_T0160_LIVE_LOOKUP_SMOKE` and `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS`.
- Opening deploy used `npx cdk deploy -c config=./config/park-test-live-lookup-smoke.json --profile wrlds-dev --require-approval never`; stack reached `UPDATE_COMPLETE`.
- Open-gate Lambda readback confirmed `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_T0160_LIVE_LOOKUP_SMOKE=true`, allowlist `166447399,68b3bbb4-9a46-4379-96ac-bc7157f2fb3e`, and `JUMPYARD_ENVIRONMENT=park-test`.
- API smoke for booking reference `166447399` returned HTTP `200`, status `found`, Roller Live booking status `Paid`, payment status `Paid`, total `200`, amount owing `0`, date `2026-06-24`, start `12:00`, item count `1`, ticket count `1`, eligibility `ready`, source `roller`, environment `live`, and `publicPiiFieldsPresent=false`.
- API smoke for unique id `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e` returned HTTP `200`, status `found`, source `jumpyard_cloud`, lookup path `aurora:roller_unique_id`, freshness `fresh`, and `publicPiiFieldsPresent=false`.
- Negative API smoke for identifier `123456789` returned HTTP `403`, status `blocked`, error code `live_lookup_not_allowed`.
- Aurora readback found one normalized booking row: booking reference `166447399`, unique id `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e`, Roller env `live`, status `Paid`, payment status `Paid`, amount owing `0`, total `20000` cents, booking date `2026-06-24`, start time `12:00:00`, freshness `fresh`, source `roller_live_lookup`, item count `1`, ticket count `1`.
- Aurora readback found prepayment draft `jypd_56a8f1ca817c42a4b7` moved to status `published`, amount owing `0`, total `20000` cents, `payment_jwt_present=true`, and `payment_config_available=true`.
- Aurora `event_log` readback found one `prepayment_draft.published` event for subject `166447399`.
- Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; stack reached `UPDATE_COMPLETE`.
- Closed-gate Lambda readback confirmed `ENABLE_T0160_LIVE_LOOKUP_SMOKE=false`, allowlist empty, `JUMPYARD_EMERGENCY_STOP=true`, and `JUMPYARD_ENVIRONMENT=park-test`.
- Closed-gate API smoke for `166447399` returned HTTP `409`, status `blocked`, error code `live_lookup_disabled`.
- Closing `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
- `npm run validate` passed.
- `npm run infra:check` passed. CDK output included existing notice `37949`.

## Result

T0160 passed. JumpYard Cloud found the controlled paid Roller Live booking through the park-test lookup endpoint, stored a safe normalized booking snapshot in Aurora, reconciled the matching prepayment draft to `published`, and closed the lookup gate again.

No new bookings, payments, refunds, redemptions, webhooks, SMS, email, broad booking export, frontend code changes, new AWS resources, secret prints, raw payment JWT prints, or public PII output were introduced.
