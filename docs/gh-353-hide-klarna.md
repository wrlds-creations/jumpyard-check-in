# #353 — Exclude Klarna from phone checkout

## Decision and scope

On September 8, 2026, Love confirmed Anders's September 7 decision that Klarna must not be used in phone checkout. Love requested implementation under [issue #353](https://github.com/wrlds-creations/jumpyard-check-in/issues/353). Google Pay still awaits Pabel/ROLLER; the issue stays open and its Project status stays Blocked. Re-enabling Klarna requires a new explicit product decision.

Implementation branch: `codex/gh-353-hide-klarna`, based on `origin/main` at `52c16555d1e6380fc49f3632a5c716ddc022344c`. The previous #367 working directory was preserved. Love subsequently approved reviewed PR/publication and Live phone visibility verification on September 8. The exact target and bounded checkout-preparation authority are recorded in #353; stop before any payment submission. Google Pay keeps the issue open.

## Implementation and evidence

The shared phone `RollerPaymentDropIn` already supplies the Roller SDK's HTTP adapter. Its fresh `payment/session` POST now passes through `excludeKlarnaFromPaymentSession`, which merges `klarna`, `klarna_account` (Delbetalning), and `klarna_paynow` into `unsupportedPaymentMethods`. Other fields and existing exclusions are preserved without mutating the SDK request. This applies to both `BuyTickets` and `AddonsOffer` through their existing shared component.

The request contract is present in the unchanged, pinned Roller ECOM 1.0.217 package:

- `vendor/ecom-payments/dist/payment.model.d.ts`: `IEcomPaymentRequest.unsupportedPaymentMethods?: string[]`.
- `vendor/ecom-payments/dist/adyen.js`, `createSession`: constructs this list and adds unavailable Apple Pay before sending `payment/session` through the supplied HTTP adapter.
- `vendor/ecom-payments/dist/payment-provider.js`: uses that adapter for its payment requests.

The adapter supplies the policy after the SDK constructs its request. Passing an unrecognized option to `service.setup()` would be ignored by this version; neither that approach nor a DOM/CSS hiding rule is used. No vendor patch, package upgrade, additional runtime dependency, global fetch interception, backend change or merchant configuration change is needed.

Adyen documents [transaction-specific exclusions through the session API](https://docs.adyen.com/api-explorer/Checkout/69/post/sessions). This corroborates the session-level approach, but is not independent proof of ROLLER's internal mapping. The pinned SDK is the evidence for the Roller request field. Its actual enforcement in Nacka Live must be checked after promotion; no real provider session was created for these tests.

Card, Google Pay and eligible Apple Pay are not added to the exclusion list. Existing Apple Pay device exclusions remain. Another provider's request is unchanged. The return branch does not create a fresh session or apply this policy; old submitted Klarna attempts retain their original session, outcome classification and recovery protections. Unknown payments still block a replacement charge. No method is cancelled by hiding its choice.

## Changed files

- `jumpyard-checkin-phone/src/components/RollerPaymentDropIn.tsx`: apply the policy to fresh session POSTs only.
- `jumpyard-checkin-phone/src/flow/paymentMethodPolicy.ts`: preserve and extend the SDK exclusion list.
- `jumpyard-checkin-phone/src/flow/paymentMethodPolicy.test.mjs`: real component/SDK request and recovery regression coverage with offline transport.
- Root and phone `package.json`: add the focused suite to normal repository validation.
- `PROJECT_CONTEXT.md`, `DECISIONS.md` (D0216), `TEST_PLAN.md`, and this note: durable decision, scope and verification. `REPO_CURRENT_STATE.md` is unchanged.

## Validation

- `npm run validate:gh353-klarna-policy`: 13 tests pass. Covers both purchase kinds, available/unavailable Apple Pay, original JWT and request fields, old approved/cancelled returns, unresolved-payment replacement protection, another provider, preservation of other exclusions and malformed input.
- `npm --prefix jumpyard-checkin-phone run test:payment-recovery`: all 137 tests pass, including the existing Google Pay submission-phase and completed-booking recovery cases.
- `npm --prefix jumpyard-checkin-phone run lint`: no errors; four pre-existing image warnings.
- `npm --prefix jumpyard-checkin-phone run build`: passes TypeScript, production export and the production mock-boundary check.
- `git diff --check`: passes.
- `npm run infra:check`: passes all local infrastructure checks, operator self-tests and example synthesis; no deployment or provider business operation.
- Full `npm run validate` with the two Markdown reads normalized to CI-style LF in memory: passes, including the new 13-test suite. See the raw Windows baseline limitation below.

The raw Windows `npm run validate` stops at the known context-size/line-ending problem already tracked by Project draft **Make context-size validation consistent for Windows line endings** (`PVTI_lADOBXiXg84BdXuJzg5PU2I`). At untouched base, `PROJECT_CONTEXT.md` is 12,108 characters with CRLF / 11,998 with LF; `REPO_CURRENT_STATE.md` is 12,043 / 11,958. The threshold is 12,000 characters. The updated project context is 11,996 characters with LF. No validator or threshold was changed and no duplicate draft was created.

A separate full validation run normalizes only those two Markdown reads to LF in memory, matching CI checkout content. Its temporary preload does not change any repository file or other validation input. Record this separately from the failing raw Windows invocation.

## Local visual verification

Eight headless Chromium cases pass: both purchase kinds, Swedish/English, and 320/390 px widths. The real phone component, Roller ECOM 1.0.217 and Adyen Web 5.71.2 execute. All network requests are intercepted locally; synthetic Roller session and Adyen setup responses honor the observed outgoing exclusion list. Card and Google Pay render, Klarna/Delbetalning do not, and no horizontal overflow or browser exception remains. Two resulting screenshots were also visually inspected.

The isolated fixture is outside the repository at `%TEMP%/jumpyard-gh353-ui/verify.cjs`, with `results.json` and eight screenshots beside it. Provider icons and device-fingerprinting content are inert local fixtures. There is no production preview route. These checks demonstrate local integration/layout under the stated provider contract; they do not prove real merchant enforcement, wallet eligibility, or a successful payment. Apple Pay eligibility preservation is covered by the SDK request tests, not by an iPhone purchase.

## Remaining acceptance and next step

Publication is approved through the normal immutable release and protected Park/public promotion. On the selected artifact, verify Klarna and Delbetalning are absent for fresh entry and add-on purchases on real phones, card/eligible Apple Pay remain available, and Google Pay remains offered while its provider question is unresolved. Check old-attempt returns without clearing or replacing any uncertain payment. If ROLLER does not honor the exclusion list, keep this acceptance open and ask for its exact supported mapping/channel contract.

The local implementation/validation performed no live payment, booking, refund, provider outreach, AWS/Cloudflare change, release, promotion or rollback. Publication evidence follows separately. No new follow-up draft was needed. #353 must not close until both the Klarna rollout acceptance and the separate Google Pay dependency are resolved.
