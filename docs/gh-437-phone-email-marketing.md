# Phone email marketing after payment (#437)

## Scope and authority

[Issue #437](https://github.com/wrlds-creations/jumpyard-check-in/issues/437) converts the existing implementation draft. Love approved phone-only implementation, testing and publication on September 23, 2026, explicitly selected **after completed payment**, and authorized commit/push/reviewed merge/publication after successful checks. Codex implemented the work in `codex/gh-437-phone-email-marketing` from `e813909`; on September 23 Love handed delivery to Claude, which ships the same changes plus the switch design from `codex/gh-437-email-optin`. The unrelated #396 worktree is untouched.

This implements the optional email choice, not a new marketing system. No kiosk/admin UX, direct Klaviyo API/key/list, SMS grant, campaign, bulk profile update, new AWS resource or additional paid transaction is included. The earlier gift-card payment authorization was fulfilled and is not a new allowance.

## Confirmed provider evidence

The separately authorized owned-address test on September 23 showed Klaviyo email subscription at 09:56:15 Europe/Stockholm, closely following an unpaid ROLLER draft at 09:56:14. The separate booking was published paid at approximately 10:06:43. User screenshots show Active Subscribers List membership at 09:56 and Nacka Forum Segment membership at 10:05, with SubscribedVenues containing Nacka Forum and General. These observations strongly indicate draft-time activation; they do not prove isolated-list behavior or preservation of existing opt-outs/suppressions.

A read-only check during initial implementation confirmed that the earlier paid booking has zero owing and matches its expected customer/external identity. Its owned test guest has email acceptance true and SMS acceptance false. The guest response uses `acceptMarketingSMS`; the documented writable field is `acceptMarketingSms`. No live writes were made during that initial implementation checkpoint; the subsequently authorized unpaid preservation probe is recorded below.

### Authorized unpaid preservation probe — September 23

Love separately approved one unpaid draft for the owned test alias, without new marketing consent, payment or gift-card use. Fresh read-only checks confirmed Live Nacka venue `50871`, the exact owned guest, its current contact fields and available September 23 13:30 slot (one Entré 60 min, variation `1189808`). The customer payload reused the freshly read contact values and omitted all email/SMS marketing fields; `sendConfirmations` was false.

- Before the write: email acceptance `true`, SMS acceptance `false`. The cost quote was 200 SEK total / 200 SEK owing and preserved every returned guest field.
- Exactly one `POST /bookings/draft` returned HTTP 201 at `2026-09-23T10:53:05.919Z` (12:53 Stockholm). Draft UUID: `78cecb56-0e25-4bb6-b0ca-61aaef42ed77`; external ID: `JY-GH437-NO-CONSENT-20260923-1330-01`. No booking reference was returned; the response did not include a status value. It remained unpaid (200 SEK owing) and was not published.
- Immediate guest readback at `10:53:06.020Z`: email `true`, SMS `false`, and **no changed guest fields**. A second read-only check at `10:56:55.373Z` still matched the owned email and both preferences.
- No payment, gift-card, publish, redemption, deletion or guest-update call was made. The draft was left as created. No AWS resource/configuration was changed and no credentials were recorded.

This establishes preservation by omission for this already-subscribed owned guest and current provider configuration, not every guest state or concurrent update. Klaviyo browser access timed out, so its post-probe subscription/list/flow state was **not** independently verified. Disabling ROLLER confirmations does not prove that downstream automations sent nothing. Paid-only propagation and suppression protection remain separate gates.

Love subsequently supplied a post-probe Klaviyo screenshot: the same owned alias remains email Subscribed; marketing and transactional SMS both remain Never subscribed. The visible subscription events still show September 23 09:56. A real campaign receipt/open is shown at 12:39, before the 12:53 preservation probe, confirming the test address participates in the existing live audience rather than an isolated test list. This screenshot closes the basic post-probe visual status check, not paid-only propagation or suppression protection.

## Proposed local contract

- The checkbox sits beneath the phone purchase email field, defaults off, is optional, and resets on restored contact or email changes. It is not restored from browser storage. Active draft/payment identity remains locked.
- The control is a 64px tappable tile directly beneath the email field: gift icon, a native checkbox exposed as `role="switch"`, and the consent sentence set as a larger `Ja tack!` / `Yes please!` lead plus body. The accessible name is the unchanged sentence. It switches on only for a complete email address; otherwise it asks for the email and focuses that field. Current SV: `Ja tack! Mejla mig erbjudanden & nyheter från JumpYard`; EN: `Yes please! Email me offers & news from JumpYard`. The label puts offers first without promising a specific discount. Withdrawal help remains visible below the tile, with a separate `Integritet` / `Privacy` link to the [JumpYard privacy policy](https://jumpyard.se/dataskyddspolicy/). Current version: `phone-email-2026-09-23-v3`, matched by server evidence; earlier unshipped wording is superseded. All opt-in/payment/provider gates are unchanged. No conversion uplift is claimed without measurement.
- A checked choice becomes Cloud-only metadata on the draft request. Quotes never receive it. Neither email nor SMS marketing flags are sent in phone new-purchase provider quotes/drafts. Unchecked means no new instruction, never `false`/unsubscribe. The owned subscribed-guest probe above passed preservation by omission; other states and downstream behavior are not established by that one observation.
- The server stores the choice against the returned draft unique ID, expected external ID, environment and hashed email, with its timestamp, exact copy/version, locale, privacy URL, source and Nacka venue. No raw email is added to consent records/logs.
- Existing paid lookup/webhook reconciliation queues the existing Booking Lambda. The worker rejects public HTTP masquerades, checks the provider gate, loads only its own pending record, rereads authoritative booking/payment state and verifies the current guest email. No browser success callback is trusted.
- A pending choice is valid for at most 24 hours. Cancelled/refunded/deleted, unpaid, partially paid, mismatched or uncertain bookings cannot activate it. Existing email acceptance is a consumed no-op.
- Before any PUT, an atomic durable database claim admits one writer. A claimed grant is never replayed, including ambiguous timeouts or a failure to record success. Failures before the claim may retry safe reads. Marketing capture/delivery failure does not invalidate booking/payment.
- The guest PUT uses freshly read, documented writable fields and current SMS preference. This reduces stale-data risk but **does not establish an atomic provider update**, complete optional-field semantics, or protection against another simultaneous guest update.

## Persistence and operations

Existing `jumpyard.idempotency_records` holds server-reserved `jymc_` records for 30 days; clients cannot reserve this prefix. Existing `event_log` holds capture/delivery evidence subject to its existing lifecycle: payload anonymization after 30 days and event deletion after 90 days. No new schema, retention extension or long-term consent archive is created. The evidence owner and adequacy of retention remain a rollout decision, not a legal compliance claim.

The worker requires `PHONE_EMAIL_MARKETING_PROVIDER_APPROVED=true`. That variable is deliberately **not enabled in the current infrastructure configuration**. Do not publish the visible checkbox while delivery is disabled and call the feature functional. The new function-name references reuse existing invoke permission; no AWS deployment has occurred.

## Validation checkpoint

Completed locally:

- 15 synthetic backend consent/real-handler tests and 3 phone consent tests passed: explicit/absent choice, quote/draft separation, exact identity, paid-only gate, current SMS preservation, repeat events, ambiguous write, stale consent, private invocation, pre-write claim and retryable internal read failure.
- Phone consent, actual payment-option handlers, purchase preparation, contact and 137 payment-recovery tests passed.
- Phone lint passed with four existing image warnings; TypeScript and production build passed. Production preview boundaries passed. The build reports the existing outdated browser-mapping warning.
- Infrastructure TypeScript, handler syntax, WRLDS validator and whitespace checks passed. Full root `npm run validate` and `npm run infra:check` passed. Focused consent tests were rerun after the final retry/fail-closed review corrections. These pipelines use synthetic/self-test/synthesis paths, not AWS or provider mutations.
- Manual synthetic browser preview: Swedish 390 × 844 and English 320 × 740; initially unchecked; complete contact permits continuation without opt-in; Space toggles the checkbox; changing email clears it; privacy link is separately focusable. Swedish layout measured no horizontal overflow; both layouts visually inspected. No real payment was started; physical-device/provider acceptance remains separate.

Commands: `npm run validate:gh437-email-marketing`; phone `npm run test:payment-options`, `npm run test:phone-contact`, `npm run test:payment-recovery`, `node --no-warnings --experimental-strip-types --test src/flow/purchasePreparationFlow.test.mjs`, `npm run lint`, `npx tsc --noEmit`, `npm run build`; root `npm run validate`, `npm run infra:check`, `node scripts/wrlds/validate.js`; handler `node --check`; and `git diff --check`.

## Changed areas

- Phone: `BuyTickets.tsx`, `LanguageContext.tsx`, `cloudClient.ts`, new `EmailMarketingOptIn` component/styles, the `reward-gift` icon name, new consent helper/test, two existing actual-handler test fixtures and the package test command.
- Cloud: Booking consent helper/unit/integration tests and handler; Lookup/Webhook paid-event dispatch; two existing-stack environment references. No new resources, migration or public route.
- Validation: root consent command/prevalidate, GH409 phone payload expectation, and eight existing VM import allowlists accepting the new local helper.
- Durable records: `PROJECT_CONTEXT.md`, `DECISIONS.md` (D0223), `TEST_PLAN.md`, `JUMPYARD_CLOUD_CONTRACT.md`, `AWS_RESOURCES.md` and this evidence document. `REPO_CURRENT_STATE.md` is unchanged because nothing is merged.

## Rollout gates and next step

### Local visual refinement — September 23

The user requested a less bulky checkbox and a localhost preview. Before/after screenshots confirmed that the shaded card and long supporting copy competed with contact fields. The updated control removes that card, shortens both languages, retains a 44px clickable label and separate privacy link, and uses the existing Check icon with a rounded brand-red checked state. The visible consent text and server evidence now share version `phone-email-2026-09-23-v2`; a new test checks their parity.

Revalidation passed: 15 backend consent tests, 4 phone consent tests, 57 payment-option tests, phone lint (the same four pre-existing image warnings), TypeScript (`--noEmit --incremental false`) and whitespace checks. Synthetic browser checks at 390×844 and 320×740 verified initial-off, Space toggle/visible focus, whole-label click, Tab to privacy, email-change reset, optional payment continuation and no horizontal overflow in Swedish/English. No payment was started. The local development preview uses synthetic transport and a non-provider fallback API address; the test contact was cleared and the visible page left in Swedish. Screenshot checks are not a full accessibility certification. Public rollout/provider gates are unchanged.

### Offers-first compact refinement (v3) — September 23

Love requested less whitespace, a smaller help line and a more inviting choice. The current label puts offers first with `Ja tack!` / `Yes please!`, semibold text and a brand-red checkbox outline. The visible withdrawal help is 10.5px / 14px, #6b7280 on white, with a measured 4px gap below the label. The unboxed layout, min-44px label, keyboard focus and separate privacy link remain. No specific discount, preselection, hidden withdrawal text or conversion uplift is implied. Client and server evidence both use v3.

Revalidation passed: 15 backend + 5 phone consent + 57 payment-option tests, phone TypeScript, lint (the same four existing image warnings), WRLDS and whitespace checks. Synthetic browser verification at 390×844 and 320×740 covered SV/EN layout, no horizontal overflow, whole-label click, Space toggle, Tab to privacy and email-change reset. No payment/provider write occurred in this refinement. The local preview was left with empty contact and unchecked consent. Existing paid-only and suppression gates are unchanged.

### Switch tile (v3 copy unchanged) — September 23

Love asked for a new localhost where the choice is very attractive to press, looks great when on and feels seamless, then approved the result. The checkbox row became the tile described in the contract above. On: the track fills brand red, a light pink wash grows from the switch across the tile, the gift makes one trampoline-style hop with short red sparks, and a footer shows `Du är med!` / `You're in!` with the entered address. Once, after a complete address, the gift and knob give one small invitation movement. A tap without a complete address shakes the tile, shows `Fyll i din e-post först` / `Enter your email first` and focuses the email field. Editing the email still switches it off. Reduced-motion users get plain state changes. The consent sentence and `phone-email-2026-09-23-v3` are unchanged; the two short status texts are new visible copy, not consent wording.

Validation passed: 15 backend + 5 phone consent tests (switch contract, lead/body equals the stored copy, help/privacy link visible), all 359 phone tests, TypeScript and lint (one existing image warning in the changed files). Synthetic preview at 375×812 Swedish and 320×740 English showed no horizontal overflow; `YES PLEASE!` wraps to two lines at 320 px. Tab from the email field focuses the switch with a red focus ring; keyboard activation relies on the native checkbox and was not verifiable in the Browser pane. Love tested the switch live in that preview. No payment or provider write occurred.

### Remaining gates

1. The separately authorized unpaid preservation probe passed in ROLLER for the owned subscribed guest; Love's subsequent screenshot confirms unchanged basic Klaviyo channel status (details above). No repeat draft is needed for that check.
2. Prove that updating an eligible guest **after** completed payment propagates through SmartSegments to Klaviyo without requiring draft-time consent or another payment. Do not reset/delete/unsuppress an existing protected profile to make a test pass.
3. Confirm the connector's treatment of manual, bounce/complaint and returning opt-out suppressions, plus optional/concurrent guest fields. The local code alone cannot inspect or guarantee Klaviyo suppression protection. Obtain the missing provider contract or revise the design with explicit authority.
4. Confirm sender/audience scope (the current connection includes General), copy and evidence ownership; only then add reviewed deployment configuration enabling the worker and rerun checks.
5. Review and merge the issue PR, select its successful immutable release run/full SHA, review the protected Park plan, and promote that same artifact to public phone origins. Do not rebuild or use a local break-glass deployment. Record actual runs, readback and rollback candidate.

Issue #437 remains open. The implementation PR uses `Refs #437`; Love approved Park deployment so the switch can be tested on a handset at the Park phone origin. Public promotion waits for Love's separate decision, because delivery stays disabled until gates 2–4 pass. No follow-up draft exists yet. Actual runs and readback belong in the rollout evidence.
