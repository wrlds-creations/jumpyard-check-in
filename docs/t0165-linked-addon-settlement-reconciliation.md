# T0165 Linked Add-On Settlement Reconciliation

## Goal

Reconcile the paid linked add-on booking from T0164 back into Aurora/local link state before controlled redeem.

## Scope

- Linked add-on booking reference `166497194`.
- Linked add-on Roller unique id `4a092241-6947-436a-97ea-04813a8404aa`.
- Original booking reference `166490323`.
- The smoke may read the exact linked add-on booking through JumpYard Cloud and update Aurora after observing a settled Roller Live snapshot.
- No new payment, refund, redeem, broad booking import, webhook processing enablement, SMS, email, staff auth enablement, or normal visitor traffic.

## Planned Gate

T0165 adds a separate settlement gate:

- `ENABLE_T0165_LINKED_ADDON_SETTLEMENT`
- `T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS`

This gate is separate from the T0160 lookup smoke gate and the T0162 add-on payment gate. It exists only to let the lookup Lambda read and reconcile the exact paid linked add-on booking.

## Implementation Notes

- CDK config: `infra/config/park-test-live-addon-settlement-smoke.json`.
- Lookup reconciliation now updates both `prepayment_booking_drafts` and `booking_links` when the authoritative Roller booking is settled.
- Webhook reconciliation uses the same link update behavior for future consistency, but webhook processing remains disabled in this ticket.

## Before State

Safe Aurora readback before opening the T0165 gate:

- Prepayment draft `jypd_8bdb1d1035b84d30b2`.
- Roller draft/linked unique id `4a092241-6947-436a-97ea-04813a8404aa`.
- Flow type `add_product`.
- Original booking reference `166490323`.
- Add-on group `jyao_6024ae4dcd3b43ea9a`.
- Draft status `payment_pending`.
- Draft total `4500` cents; amount owing `4500` cents.
- Booking link `jyl_f35c09033efb40ba94`.
- Link type `add_product_draft`.
- Link status `payment_pending`.
- Link `linked_booking_reference` was `null`.
- No `prepayment_draft.published` or `booking_link.published` event existed for the linked unique id.

## AWS Gate Opening

Pre-deploy checks:

- `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- `npm --prefix infra run build` passed.
- `npm --prefix infra run validate:config-guards` passed.
- `npm --prefix infra run validate:park-test-synth` passed.
- `npm --prefix infra run synth:park-test-addon-settlement-smoke` passed.

Opened with:

```powershell
npm --prefix infra run deploy:park-test-addon-settlement-smoke
```

CDK diff changed only existing Lambda resources:

- `LookupHandler`
  - code package updated
  - added `ENABLE_T0165_LINKED_ADDON_SETTLEMENT`
  - added `T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS`
- `WebhookHandler`
  - code package updated for future-consistent reconciliation logic

No new AWS resources were created.

Readback after opening:

- Lookup env: `park-test`, emergency stop `true`, T0160 lookup smoke `false`, T0160 allowlist empty, T0165 settlement `true`, T0165 allowlist `166497194,4a092241-6947-436a-97ea-04813a8404aa`.

## Reconciliation Evidence

Public park-test API lookup:

- Endpoint: `POST /v1/check-in/lookup`.
- Identifier: `166497194`.
- HTTP `200`.
- Status `found`.
- Booking reference `166497194`.
- Roller unique id `4a092241-6947-436a-97ea-04813a8404aa`.
- Booking/payment status `Paid`.
- Total `45`.
- Amount owing `0`.
- Item count `1`.
- Ticket count `1`.
- Source system `roller`.
- `refreshedFromRoller=true`.

Safe Aurora readback after lookup:

- Prepayment draft `jypd_8bdb1d1035b84d30b2` is now `published`.
- Draft total remains `4500` cents.
- Draft amount owing is now `0` cents.
- Booking link `jyl_f35c09033efb40ba94` is now `published`.
- Link `linked_booking_reference` is now `166497194`.
- Settlement events exist:
  - `prepayment_draft.published`, subject `166497194`.
  - `booking_link.published`, subject `166490323`.

Conclusion:

- The linked add-on payment is reconciled in Aurora.
- Staff/admin handout state can now trust the linked add-on booking reference/status for this controlled booking.
- The original booking was not directly mutated by JumpYard Cloud.
- No new payment, refund, redeem, webhook processing, SMS, email, or broad booking import was performed.

## Closeout

Closed with:

```powershell
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
```

Readback after closing:

- Lookup env: `park-test`, emergency stop `true`, T0160 lookup smoke `false`, T0160 allowlist empty, T0165 settlement `false`, T0165 allowlist empty.
- Booking env: `park-test`, emergency stop `true`, draft writes `false`, T0159 payment smoke `false`, T0162 add-on smoke `false`, T0162 allowlist empty.
- Webhook env: `park-test`, emergency stop `true`, webhook processing `false`.
- `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.

Closed-gate API checks:

- `POST /v1/check-in/lookup` for `166497194` returned HTTP `409`, status `blocked`, code `live_lookup_disabled`.
- `POST /v1/bookings/166490323/add-products/quote` with a valid quote body returned HTTP `409`, status `blocked`, code `live_addon_smoke_disabled`.

Note: one extra closeout synth precheck was mistyped from the `infra/` directory as `npm --prefix infra run synth:park-test`, which looked for `infra/infra/package.json` and failed before the deploy command. The actual closing `cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never` succeeded, and the post-deploy environment/API/diff checks above verified the normal closed state.

## Validation Log

- `npm --prefix infra run build` passed.
- `npm --prefix infra run validate:config-guards` passed.
- `npm --prefix infra run validate:park-test-synth` passed.
- `npm --prefix infra run synth:park-test-addon-settlement-smoke` passed.
- `npm --prefix infra run deploy:park-test-addon-settlement-smoke` passed.
- `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never` passed.
- `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
