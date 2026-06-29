# T0169 Post-Payment Booking Sync

## Goal

Make the park-test PWA reconcile a newly paid booking after payment instead of showing `Betalningen ar klar men bokningen har inte hunnit synkas` as the normal successful checkout outcome.

## Scope

- New-booking post-payment sync only.
- Keep the `phone PWA -> JumpYard Cloud -> Roller Live` boundary.
- Use the local prepayment draft row created before payment as the authority for the post-payment lookup.
- Do not open broad existing-booking lookup, existing-booking add-ons, redeem, webhook processing, SMS/email, broad same-day import, or visitor traffic.

## Finding

The frontend already retries `lookupBooking(...)` after a payment succeeds, but it previously preferred the draft `bookingReference` over the draft `uniqueId`.

In park-test, the Lookup Lambda previously allowed only:

- exact allowlisted Live lookup smoke identifiers, or
- exact allowlisted linked add-on settlement identifiers.

That meant a normal newly paid booking could not pass the lookup gate because the new draft id is not known before checkout. The frontend therefore ended in the sync-failed recovery state even when Roller had created and paid the booking.

Plain-language version: the checkout made an internal receipt number that we had saved in our own notebook, but the app first tried the public booking number. The new gate can safely trust the internal receipt number because our own backend created it before payment.

## Implementation

T0169 adds a separate post-payment sync gate:

- Config approval phrase: `safetyGates.livePostPaymentSyncApproval = "T0169_POST_PAYMENT_SYNC_APPROVED"`.
- Lookup Lambda env var: `ENABLE_T0169_POST_PAYMENT_SYNC`.
- Smoke config: `infra/config/park-test-live-payment-sync-smoke.json`.
- CDK scripts: `synth:park-test-payment-sync-smoke`, `diff:park-test-payment-sync-smoke`, and `deploy:park-test-payment-sync-smoke`.

When the T0169 gate is open, the Lookup Lambda may call Roller Live only if the requested identifier matches a recent local `jumpyard.prepayment_booking_drafts` row with:

- `flow_type = 'new_booking'`,
- `roller_env = 'live'`,
- `status IN ('payment_pending', 'payment_blocked', 'published')`,
- and `created_at` within the last 24 hours.

The existing lookup reconciliation then refreshes the paid Roller booking, upserts the normalized booking snapshot into Aurora, and marks the matching prepayment draft as `published`.

The phone PWA now uses the draft `uniqueId` before `bookingReference` during the payment-complete retry so the request matches the stored prepayment draft context.

## Safety Outcome

This is not broad Live lookup.

The new smoke mode opens only:

- new-booking draft/payment writes,
- and post-payment lookup for the same locally recorded new-booking draft.

It keeps closed:

- exact/general existing-booking lookup smoke,
- existing-booking add-on writes,
- linked add-on settlement smoke,
- redeem writes,
- staff auth,
- webhook processing,
- guest SMS/email sends,
- and broad same-day import.

## Validation

Completed before deploy:

```powershell
node --check infra/lambda/lookup/index.js
npm --prefix infra run build
npm --prefix infra run validate:config-guards
npm --prefix jumpyard-checkin-phone run lint
npm run validate
npm --prefix infra run validate:park-test-synth
npm --prefix infra run synth:park-test-payment-sync-smoke
npm run infra:check
npm --prefix jumpyard-checkin-phone run build
git diff --check
```

Completed AWS/frontend proof:

1. Deploy `infra/config/park-test-live-payment-sync-smoke.json`.
2. Read back Booking and Lookup Lambda env vars.
3. Run one controlled park-test PWA new-booking payment.
4. Confirm the payment-complete retry finds the booking instead of ending in the sync-failed state.
5. Redeploy normal `infra/config/park-test.json`.
6. Read back that the payment and post-payment sync gates are closed again.

Proof outcome:

- The smoke deploy temporarily opened `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true`, and `ENABLE_T0169_POST_PAYMENT_SYNC=true`.
- The user completed a Live park-test PWA new-booking payment and reached the safety and done steps.
- The post-payment path found/reconciled the paid booking instead of ending in the previous sync-failed state.
- A direct stable Cloudflare deploy was made for `https://jumpyard-check-in-park-test.pages.dev` with the park-test API target.
- A closed-gate lookup check for unrelated booking `166490323` still returned `live_lookup_not_allowed`, confirming the T0169 gate did not become broad existing-booking lookup.
- The normal `infra/config/park-test.json` config was redeployed after proof. Readback confirmed payment writes, T0169 post-payment sync, broad lookup, existing-booking add-ons, redeem, staff auth, webhook processing, and guest message sends are closed again; `JUMPYARD_EMERGENCY_STOP=true` remains set.

User-observed follow-ups from the same phone proof:

- The ready-for-entry/staff handout state needs to show the purchased ticket type/duration, such as 60/90/120 minutes, not only wristband/add-on rows.
- The final ready-for-entry screen must restore the Playground-style visible QR/handoff code; the current park-test proof reached safety/done but did not show the QR the user expected.
- Card payment worked. Apple Pay opened briefly on iPhone and collapsed, and Swish was not visible; this needs a payment-method readiness ticket before real visitor testing.

## Next Gate

Next planned ticket after T0169: `T0171` park-test lookup mode for existing visitor bookings.
