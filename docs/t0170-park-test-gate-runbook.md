# T0170 Park-Test Gate Naming And Runbook

## Scope

This runbook gives the park-test safety gates human-readable names. It does not rename the existing CDK keys or Lambda environment variables, and it does not deploy AWS changes.

The current model is:

```text
repo config file -> CDK synth/deploy -> Lambda environment variables -> Lambda runtime checks
```

Think of `infra/config/*.json` as the recipe, CDK deploy as the person putting that recipe into the control cabinet, and Lambda environment variables as the actual switches the running API reads.

## Source Files

| Purpose | File |
|---|---|
| Normal closed park-test config | `infra/config/park-test.json` |
| New booking/payment smoke config | `infra/config/park-test-live-payment-smoke.json` |
| New booking/payment sync smoke config | `infra/config/park-test-live-payment-sync-smoke.json` |
| Existing booking lookup smoke config | `infra/config/park-test-live-lookup-smoke.json` |
| Assisted existing-booking lookup config | `infra/config/park-test-assisted-lookup.json` |
| Existing booking add-on smoke config | `infra/config/park-test-live-addon-smoke.json` |
| Linked add-on settlement smoke config | `infra/config/park-test-live-addon-settlement-smoke.json` |
| Controlled redeem smoke config | `infra/config/park-test-live-redeem-smoke.json` |
| Frontend redeem rehearsal config | `infra/config/park-test-frontend-redeem-rehearsal.json` |
| Assisted full-flow rehearsal config | `infra/config/park-test-full-flow-rehearsal.json` |
| Approval phrases and config validation | `infra/lib/config.ts` |
| CDK to Lambda env-var mapping | `infra/lib/jumpyard-cloud-stack.ts` |
| Runtime enforcement | `infra/lambda/booking/index.js`, `infra/lambda/lookup/index.js`, `infra/lambda/redeem/index.js`, `infra/lambda/session/index.js`, `infra/lambda/webhook/index.js` |

## Gate Map

| Human gate name | What it controls | Repo config keys | Lambda env vars or code switches | Normal `park-test.json` state | Current park-test-day posture |
|---|---|---|---|---|---|
| Emergency stop | Default stop layer for park-test handlers. Some smoke paths can pass through only when their own narrow gate is approved. | `safetyGates.emergencyStop` | `JUMPYARD_EMERGENCY_STOP` | `true` | Keep on under the current model. Open only scoped service doors, not the whole building. |
| New booking + payment writes | Creating a new Roller Live draft/payment through the public park-test API. | `safetyGates.rollerBookingDraftWritesEnabled`, `safetyGates.livePaymentSmokeApproval` | `ENABLE_ROLLER_BOOKING_DRAFT_WRITES`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES` | `false`, empty approval | Closed except controlled checkout tests. T0169 must fix post-payment sync before this is comfortable for visitor use. |
| Post-payment new-booking sync | After a new booking is paid, reading that same Roller Live booking by the locally stored draft id and saving the finished snapshot to park-test Aurora. | `safetyGates.livePostPaymentSyncApproval` plus the new booking/payment write approval | `ENABLE_T0169_POST_PAYMENT_SYNC` in the Lookup Lambda | empty approval | Closed except T0169 checkout tests. It only accepts draft ids already created by our own backend in `jumpyard.prepayment_booking_drafts`. |
| Existing booking lookup smoke | Reading one exact Roller Live booking by allowlisted code/id and writing a normalized snapshot to park-test Aurora. | `safetyGates.liveLookupSmokeApproval`, `safetyGates.liveLookupSmokeAllowedIdentifiers` | `ENABLE_T0160_LIVE_LOOKUP_SMOKE`, `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS` | empty approval, empty allowlist | Keep as a narrow smoke/debug mode, not the first visitor posture. |
| Assisted existing booking lookup | Reading a single guest-entered Roller Live booking code/id for the approved Nacka/date park-test window, then writing only that normalized snapshot to Aurora. | `safetyGates.liveAssistedLookupApproval`, `safetyGates.liveAssistedLookupAllowedOperatingDates`, `safetyGates.liveAssistedLookupVenueId` | `ENABLE_T0171_ASSISTED_LOOKUP`, `T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES`, `T0171_ASSISTED_LOOKUP_VENUE_ID` | empty approval, empty date list, empty venue id | Planned park-test lookup posture after T0171 validation. Reads existing booking items/add-ons/tickets only; no broad import, payment, add-on write, redeem, webhook, staff auth, SMS, or email. |
| Existing booking add-ons | Creating a separate linked add-on draft/payment for a real existing Roller Live booking. | `safetyGates.rollerBookingDraftWritesEnabled`, `safetyGates.liveAddOnSmokeApproval`, `safetyGates.liveAddOnSmokeAllowedIdentifiers` | `ENABLE_ROLLER_BOOKING_DRAFT_WRITES`, `ENABLE_T0162_LIVE_ADDON_SMOKE`, `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS` | `false`, empty approval, empty allowlist | Closed until lookup/contact/payment recovery is ready for the park-test scenario. |
| Linked add-on settlement | Refreshing/reconciling a paid linked add-on booking back into Aurora state. | `safetyGates.liveLinkedAddOnSettlementApproval`, `safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers` | `ENABLE_T0165_LINKED_ADDON_SETTLEMENT`, `T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS` | empty approval, empty allowlist | Closed except a named settlement/reconciliation proof. T0173 recommends scoped REST settlement before any webhook automation. |
| Redeem/check-in writes | Staff/admin redemption against Roller Live tickets. This consumes real tickets. | `safetyGates.rollerRedeemWritesEnabled`, `safetyGates.staffAuthEnabled`, `safetyGates.liveRedeemSmokeApproval`, `safetyGates.liveRedeemSmokeAllowedIdentifiers` | `ENABLE_ROLLER_REDEEM_WRITES`, `ENABLE_STAFF_AUTH`, `ENABLE_T0166_LIVE_REDEEM_SMOKE`, `T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS` | `false`, `false`, empty approval, empty allowlist | Closed until frontend redeem rehearsal and UI/UX readiness. Any earlier proof must name exact booking/ticket identifiers. |
| Frontend redeem rehearsal | Staff/admin inspection of one already-known check-in session without enabling Roller redeem writes. | `safetyGates.staffAuthEnabled`, `safetyGates.frontendRedeemRehearsalApproval`, `safetyGates.frontendRedeemRehearsalAllowedSessionIds` | `ENABLE_STAFF_AUTH`, `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL`, `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS` | `false`, empty approval, empty allowlist | T0176-only rehearsal mode. It can show an allowlisted session in the admin app, but `ENABLE_ROLLER_REDEEM_WRITES` remains `false`. |
| Assisted full-flow rehearsal | One supervised Nacka/test-week lane covering new booking/payment, post-payment sync, existing-booking lookup, add-ons, staff auth, and redeem. | `safetyGates.fullFlowRehearsalApproval`, `safetyGates.fullFlowRehearsalAllowedOperatingDates`, `safetyGates.fullFlowRehearsalVenueId`, plus draft/redeem/staff gates true | `ENABLE_T0176_FULL_FLOW_REHEARSAL`, `T0176_FULL_FLOW_ALLOWED_OPERATING_DATES`, `T0176_FULL_FLOW_VENUE_ID`, plus the existing booking/lookup/redeem/staff env vars it intentionally opens | Empty approval, empty date list, empty venue id | Current T0176 test posture after Love's explicit approval: Nacka `50871`, dates `2026-06-29` through `2026-07-05`; webhook processing and JumpYard-owned sends stay closed. |
| Webhook processing | Whether incoming Roller Live webhooks write/enrich Aurora state. The webhook can exist while processing is disabled. | `safetyGates.rollerWebhookProcessingEnabled` | `ENABLE_ROLLER_WEBHOOK_PROCESSING` | `false` | Closed. T0173 recommends keeping processing off for the first assisted park-test and revisiting only through a scoped open/close ticket. |
| Guest SMS/email sends | JumpYard-owned guest messaging sends, including scheduled check-in messages. This is not the Roller-native booking confirmation email. | `safetyGates.guestMessagingSendsEnabled`, `bookingTimeSms.confirmSend`, `bookingTimeSms.confirmedSendApproval` | `ENABLE_GUEST_MESSAGE_SENDS`, scheduler detail `confirmSend` and `confirmedSendApproval` | `false`, `false`, empty approval | Closed for park-test unless a separate messaging ticket opens it. Roller-native confirmation email remains requested through booking draft payloads. |
| Live add-on catalog visibility | Showing known Nacka Live add-ons in the phone flow for display/quote preparation. | Static mapping in `LIVE_PHONE_ADDON_PRODUCTS` | Code path in `infra/lambda/booking/index.js` | Available after T0168 code fix, but not a write gate | Allowed as read-only display/quote-prep. It cannot create or pay for add-ons without the write gates above. |
| Frontend API target | Which JumpYard Cloud API the deployed PWA/admin talks to. | Cloudflare Pages env var `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` | Frontend build-time config, not Lambda | Project-specific | Keep park-test projects pointed at the park-test API; normal projects should point at the normal/dev API. |

## Risk And Owner Summary

| Human gate name | Risk | Change owner | Test-day owner |
|---|---|---|---|
| Emergency stop | Critical, because changing it affects multiple handlers at once. | WRLDS/Codex with AWS deploy approval. | WRLDS/Codex. |
| New booking + payment writes | High, because it creates real Roller Live bookings/payments. | WRLDS/Codex with Love approval before deploy. | Love/WRLDS plus JumpYard park lead. |
| Existing booking lookup | Medium-high, because it reads real guest booking data and writes normalized Aurora state. | WRLDS/Codex with Love approval before deploy. | Love/WRLDS plus JumpYard park lead. |
| Existing booking add-ons | High, because it creates real linked add-on drafts/payments. | WRLDS/Codex with Love approval before deploy. | Love/WRLDS plus JumpYard park lead. |
| Linked add-on settlement | Medium, because it updates local operational payment/link state from Roller Live data. | WRLDS/Codex. | WRLDS/Codex support during test. |
| Redeem/check-in writes | Critical, because it consumes real Roller Live tickets. | WRLDS/Codex with Love and park approval before deploy. | JumpYard staff action with WRLDS/Codex support. |
| Frontend redeem rehearsal | Medium, because it opens staff auth but does not permit Roller redeem writes. | WRLDS/Codex with Love approval before deploy. | Love/WRLDS. |
| Webhook processing | High, because it lets external Roller Live events mutate park-test Aurora. | WRLDS/Codex after T0172 decision. | WRLDS/Codex support during test. |
| Guest SMS/email sends | High, because it can message real visitors. | Separate messaging ticket owner. | Not part of current park-test baseline. |
| Live add-on catalog visibility | Low, because it is display/quote-prep data only. | WRLDS/Codex. | Guest-facing phone flow. |
| Frontend API target | Medium, because it decides which backend the deployed app talks to. | WRLDS/Codex or Cloudflare project owner. | WRLDS/Codex support during test. |

## Current Named Modes

| Mode | Config file | Opens |
|---|---|---|
| Closed park-test | `infra/config/park-test.json` | No Live public writes, no lookup, no redeem, no webhook processing, no guest messaging. |
| New booking/payment smoke | `infra/config/park-test-live-payment-smoke.json` | New booking draft/payment write gate only. |
| New booking/payment sync smoke | `infra/config/park-test-live-payment-sync-smoke.json` | New booking draft/payment write gate plus lookup of the same locally recorded draft after payment. |
| Existing booking lookup smoke | `infra/config/park-test-live-lookup-smoke.json` | Exact allowlisted booking lookup only. |
| Assisted existing-booking lookup | `infra/config/park-test-assisted-lookup.json` | Guest-entered booking-code/UUID lookup only for the approved Nacka/date window. |
| Existing booking add-on smoke | `infra/config/park-test-live-addon-smoke.json` | Exact allowlisted lookup plus exact allowlisted linked add-on write. |
| Linked add-on settlement smoke | `infra/config/park-test-live-addon-settlement-smoke.json` | Exact allowlisted settlement/reconciliation lookup only. |
| Controlled redeem smoke | `infra/config/park-test-live-redeem-smoke.json` | Exact allowlisted lookup, staff auth, and exact ticket redemption. |
| Frontend redeem rehearsal | `infra/config/park-test-frontend-redeem-rehearsal.json` | Staff auth plus admin access to an exact allowlisted check-in session; no Roller redeem writes. |
| Assisted full-flow rehearsal | `infra/config/park-test-full-flow-rehearsal.json` | New booking/payment, post-payment sync, assisted Nacka/date-scoped lookup, existing-booking add-ons, staff auth, and scoped redeem; webhook processing and JumpYard-owned sends stay closed. |

## Park-Test Day Gate Plan

The expected assisted park-test posture is not "open everything." It is a short checklist of the smallest gates needed for the chosen scenario.

| Scenario | Likely gates | Tickets that must define or prove it |
|---|---|---|
| Visitor creates a new booking and pays | New booking + payment writes, post-payment sync/recovery | T0169 before visitor use |
| Visitor pays with the intended park-test method | New booking + payment writes; payment method availability stays controlled by Roller/Adyen payment configuration | T0175 before visitor use if Apple Pay/Swish are required, or document card-only as the approved test posture |
| Visitor enters an existing booking code | Assisted existing booking lookup | T0171 before visitor use |
| Visitor buys socks or another add-on for an existing booking | Existing booking lookup, existing booking add-ons, linked settlement/reconciliation | T0171, T0173, and a scoped reopen of the add-on path |
| Staff can hand out correct entry band/color | No AWS gate by itself; phone/admin UI must show a visible QR/handoff code plus purchased ticket type/duration such as 60/90/120 minutes | T0174 before final UI/UX readiness |
| Staff rehearses already-completed handoff UI | Frontend redeem rehearsal only | T0176 before UI/UX readiness |
| Staff completes check-in | Staff auth, redeem/check-in writes | T0174 handout UI, T0175 payment readiness, T0176 frontend rehearsal, and T0177 UI/UX readiness before visitor use |
| Love runs a supervised full-flow rehearsal before UI/UX fixes | Assisted full-flow rehearsal | Current T0176 full-flow window, then close by redeploying `park-test.json` after testing |
| Background webhook reconciliation | Webhook processing if explicitly chosen | T0173 recommends leaving this closed for the first assisted park-test |
| JumpYard sends guest SMS/email | Guest SMS/email sends | Separate future messaging ticket, not part of the current park-test baseline |

## Close Or Roll Back

After any controlled smoke or assisted test window, close the gates by redeploying the normal closed config. This is an AWS action and must follow the AWS workflow before running.

From `infra/`, when approved:

```powershell
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
```

Useful preflight check before deployment:

```powershell
npm run synth:park-test
```

Useful readback after deployment is to inspect the relevant Lambda environment variables and confirm the closed values:

| Handler | Closed values to verify |
|---|---|
| Booking Lambda | `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=false`, `ENABLE_T0162_LIVE_ADDON_SMOKE=false`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=false`, `T0176_FULL_FLOW_ALLOWED_OPERATING_DATES=` empty, `T0176_FULL_FLOW_VENUE_ID=` empty |
| Lookup Lambda | `ENABLE_T0160_LIVE_LOOKUP_SMOKE=false`, `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS=` empty, `ENABLE_T0165_LINKED_ADDON_SETTLEMENT=false`, `ENABLE_T0169_POST_PAYMENT_SYNC=false`, `ENABLE_T0171_ASSISTED_LOOKUP=false`, `T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES=` empty, `T0171_ASSISTED_LOOKUP_VENUE_ID=` empty |
| Redeem Lambda | `ENABLE_ROLLER_REDEEM_WRITES=false`, `ENABLE_T0166_LIVE_REDEEM_SMOKE=false`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=false`, `T0176_FULL_FLOW_ALLOWED_OPERATING_DATES=` empty, `T0176_FULL_FLOW_VENUE_ID=` empty, `T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS=` empty |
| Session Lambda | `ENABLE_STAFF_AUTH=false`, `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=false`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=false`, `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS=` empty, `ENABLE_GUEST_MESSAGE_SENDS=false` |
| Webhook Lambda | `ENABLE_ROLLER_WEBHOOK_PROCESSING=false` |
| All park-test handlers | `JUMPYARD_EMERGENCY_STOP=true` |

## Naming Decision

The human names in this runbook are aliases for the current technical switches. The runtime variable names still include ticket numbers because those names are already deployed and covered by tests/validators.

Renaming the runtime variables directly should be a separate migration ticket because it touches CDK config, Lambda code, validators, deploy/readback, and rollback. Until then, this document is the translation table.
