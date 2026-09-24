# Kiosk email marketing choice (#444)

## Scope and authority

[Issue #444](https://github.com/wrlds-creations/jumpyard-check-in/issues/444) brings the phone's optional email choice (#437, D0225) to kiosk new-ticket purchases. Love approved it on 2026-09-24 after #437 went live on `checkin.jumpyard.se`. The kiosk UI is [kiosk issue #129](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/129), which depends on this Cloud change reaching Park first.

## Contract (D0226)

- Kiosk new-purchase drafts (`channel: "kiosk"`) accept the same Cloud-only `emailMarketingConsent` object and copy version as the phone. A valid choice sets `acceptMarketing: true` on that draft's ROLLER customer only. Any other channel is still rejected with `email_marketing_channel_invalid`.
- Before this change every kiosk purchase sent an explicit `acceptMarketing: false` and `acceptMarketingSms: false`. ROLLER matches guests by email and updates supplied fields, so a returning guest's earlier consent could be overwritten. Kiosk new purchases now omit both flags unless the choice is checked, and SMS acceptance is never sent.
- The kiosk terminal cost-verification payload (`buildKioskQuotePayload`) strips both marketing flags, so only the draft carries the choice. Phone and kiosk quotes never receive it.
- Evidence is recorded as `sent_with_draft` with source `kiosk_new_booking`. The after-payment worker stays closed and ignores non-phone sources.
- Existing-booking add-on flows (`flowType: add_product`) keep their current customer contract.

## Validation

- 19 consent and real-handler tests. They cover kiosk checked → `true`, kiosk unchecked → both flags omitted, phone unchanged, a single `withEmailMarketingChoice: true` call site, kiosk consent accepted while other channels and retired copy versions are rejected, and kiosk evidence source with add-ons skipped.
- `scripts/validate-kiosk-terminal-backend.js` asserts that the cost payload drops the marketing flags. GH409 phone policy and the delivery-gate validator still pass.

## Rollout

Deploy through the immutable release and protected Park run before publishing kiosk #129; until then Cloud rejects the kiosk field. Known upstream gap (see #437): a returning guest who first bought without consent and opts in later stays Never subscribed in Klaviyo.
