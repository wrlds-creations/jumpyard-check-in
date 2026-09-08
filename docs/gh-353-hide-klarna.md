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

The local implementation/validation performed no live payment, booking, refund, provider outreach, AWS/Cloudflare change, release, promotion or rollback. No new follow-up draft was needed. #353 must not close until both the Klarna rollout acceptance and the separate Google Pay dependency are resolved.

## Reviewed implementation — 2026-09-08

[PR #390](https://github.com/wrlds-creations/jumpyard-check-in/pull/390) was reviewed at head `372c35ef93e85e6a4e4e7d0bb3f63c6818699da9`. The recorded code review found no blocking issue in the fresh-session scope, SDK contract, preserved request fields or return/unknown-attempt protections; this was Codex's review, not an independent human approval. All four required checks (Repository, Infrastructure, Phone, Admin) passed in [CI 34207335079](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34207335079). Normal protected merge produced `c60f4d3d9a901ebae625af9f1ad03c3ddfa47f4f`; no direct-main push or protection bypass was used.

Love chose to perform the post-publication check on his own phone. Physical Nacka Live verification of method visibility for fresh entry and linked add-on sessions remains pending his report. No payment submission is needed for this acceptance; do not clear or replace an existing unresolved attempt. Static asset checks and offline SDK/browser tests do not establish Live enforcement or a successful payment.

## Immutable release and protected plan — 2026-09-08

[Release 34207599674](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34207599674) built `c60f4d3d9a901ebae625af9f1ad03c3ddfa47f4f` successfully. Artifact `10048622809` is `park-test-release-c60f4d3d9a901ebae625af9f1ad03c3ddfa47f4f`; its GitHub digest is `sha256:2f5261ed8cad4f9279c71dd49a5963cbbf9d960061975bd4925a6c3814970519`. Both release validators passed locally after download, including all 595 file checksums and exact Park/public targets.

| Component | SHA256 |
|---|---|
| Manifest | `2c5f427f74fa06b7ad3f9da06f1c00eabe85837500fccd5008373279930cb453` |
| Phone output | `cf075869762316a9d831559347b099108d816cd8905421e7e98d6068a9545bb3` |
| Admin output | `15e7955859df93d660421ae1f7e5e0678cc952c8986b4fa98307bb7359f8330a` |
| CDK assembly | `2c4c5ec3ac8b71b9b67bdf2cd2ca7cee071ab847e8dde74295118336fc5fc50e` |
| Migration runtime | `e1bb391d5ebd1add6bdd03025341bfd1103db22f059042824f4c883b8171cd3d` |

The actual read-only plan in [Park 34208225791](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34208225791), artifact `park-test-plan-34208225791`, showed 205 current/release resources and no changed resources or template sections. Current and selected canonical template hashes both equal `12f145b9b225ec4abb84845c0e1add67c8d6c1cd7d5c7ad3fac0be2e441ac3eb`. The exact plan and artifact were reviewed before approving the normal protected `park-test` job on Love's behalf, as expressly authorized in #353. Migration apply is false; source backend/admin/workflows are unchanged from the previously published `11fdcb3`.

The reviewed target remains AWS account `376129878018`, `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, Nacka venue `50871`, operating dates through `2026-09-30`. Existing WRLDS tags remain client/cost center `JumpYard`, project `jumpyard-check-in`, environment `park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, managed by `cdk`, data classification `confidential`, exportable `true`. No new resource, migration, IAM, schema, credential, provider setting, guest-send gate or alarm-route change is included.

Previously published [release 34103357175](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34103357175), SHA `11fdcb3d82f10fbc011a0161d59ede73e6146544`, artifact `10011585061`, was confirmed unexpired until `2026-12-06T08:57:30Z`. Its successful Park/public runs are `34104000787` / `34104120749`. It remains the selected rollback candidate through the same immutable-artifact/protected-plan path; no rollback or re-promotion rehearsal was requested.

## Protected rollout — 2026-09-08

Park run `34208225791` succeeded. CDK reported no changes. The workflow passed exact selected/deployed template equality, `IN_SYNC` drift, zero alarms in `ALARM`, empty visible/in-flight queues, migrations applied through `0020` with migration apply disabled, exact release-SHA metadata on both Pages projects, and HTTP/API/Apple-association checks. A separate read-only byte comparison matched 14 phone and 16 admin responses, including root/route HTML, referenced JS/CSS and the phone Apple association, against the selected immutable artifact.

After Park succeeded, [public run 34208537881](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34208537881) selected the same release run, SHA and artifact. Completed plan job `102003755205` revalidated the 595 files and exact public origins/projects, with no AWS mutation, ROLLER write or guest message in the frontend workflow. This actual plan was read before delegated approval of the normal protected `park-test` job; no bypass or rebuild was used.

Public promotion succeeded for `https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se`, with exact-SHA Pages metadata, active domains, expected API/Cognito settings, CORS allow/block probes and the unchanged Apple association SHA256 `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`. Independent readback matched the public phone's 14 responses immediately. The staff root HTML initially differed just after publication; a subsequent direct read and full repeated byte comparison matched all 16 staff responses without any intervention. This transient is consistent with publication propagation but its cache layer was not diagnosed.

Final independent evidence therefore contains 30 exact matches per lane, 60 total, saved outside the repository in `%TEMP%/jumpyard-gh353-static-park.json` and `%TEMP%/jumpyard-gh353-static-public.json`. The read-only fixture `%TEMP%/jumpyard-gh353-static-readback.cjs` compares selected artifact bytes with HTTPS responses; it does not create provider sessions or transactions. No rollback, re-promotion, Live purchase, refund, guest send or provider outreach occurred. `AWS_RESOURCES.md` records this no-resource-change rollout, and `REPO_CURRENT_STATE.md` records the published SHA. Physical Klarna/alternative-method acceptance remains with Love; Google Pay/Pabel remains unresolved and #353 stays open/Blocked.
