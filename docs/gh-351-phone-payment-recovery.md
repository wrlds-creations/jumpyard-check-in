# Phone payment recovery — issue #351

## Scope and decision

Love approved the recovery implementation on 2026-09-03. [#351](https://github.com/wrlds-creations/jumpyard-check-in/issues/351) owns the change; [#353](https://github.com/wrlds-creations/jumpyard-check-in/issues/353) separately owns the Klarna/BankID investigation and any method-visibility decision. D0201 records the recovery policy. There are no backend, vendor, dependency, infrastructure, live-payment or deployment changes.

Implementation branch: `codex/gh-351-phone-payment-recovery`, initially based on `414ffc5` and brought forward to `7c845de` before commit. The intervening mainline change only records #331 rollout evidence. Investigation references in the issue use `a42559b`; the relevant phone sources were unchanged between those bases. Work is isolated from the other local task.

Love subsequently explicitly authorized commit, push, merge and protected deployment on 2026-09-03 so he can test the fix at the configured public phone origin, `https://checkin.jumpyard.se`. This authorizes the existing immutable-artifact promotion path, not new resources, migrations, provider/merchant changes or agent-initiated live transactions. The selected artifact and plan must be reviewed before each protected approval. User acceptance remains pending until Love tests the deployed version.

## Cause and resulting behavior

The previous wrapper prioritized any `redirectResult` in the URL over the current draft. Start over cleared JumpYard state but left that return in the URL. The installed Roller SDK `1.0.217` could therefore process the old cancelled session and skip setting up the new payment methods. An offline test using the actual SDK reproduced that mechanism. The old recovery retry only looked up a booking; it did not process the provider return. These findings explain the reported sequence, but the exact incident session and original Klarna failure were not captured.

The wrapper now binds each session to its purchase, stores only its hash and bounded recovery metadata, and processes a matching return once. Return processing bootstraps from public configuration and does not require a persisted JWT. The SDK captures the URL before its first await, so the wrapper removes only `redirectResult` and `sessionId` immediately after calling the redirect handler. The outer SDK promise is not treated as payment completion. Unrelated query parameters and the URL fragment are preserved.

| Situation | Guest behavior |
| --- | --- |
| Confirmed cancellation/refusal | Explain failure and offer **Välj ett annat betalsätt**. Restore the basket/contact step, refresh availability and price, and create a fresh draft only when the guest proceeds. **Börja om** is a separate explicit action. |
| Back before submitting payment | Release the unsubmitted local attempt and allow payment methods to open again for the retained or changed selection. |
| Submitted, unresolved, expired or mismatched evidence | Keep the original purchase context. Check that purchase only; do not create a new charge or treat uncertainty as a cancellation. |
| Delayed completion for the current attempt | Accept a definitive result even after the recovery notice appears. Obsolete callbacks cannot update a newer purchase. |
| Approved payment | Keep the explicit receipt confirmation and guest Continue action from #324. Prepare the existing safety continuation in the background; #331 still reconfirms paid status before staff handoff. |
| Reload after entering safety | Preserve the approved purchase even if its lookup is temporarily unavailable. A lookup error cannot expose a new checkout. |
| Add-on purchase | Pass its separate draft identity through the shared wrapper. Its unknown lookup cannot approve the original already-paid booking. An orphan add-on return fails closed rather than becoming a new-entry check-in. |

The exceptional unresolved-payment wording also works at home:

> **Vi kan inte bekräfta betalningen ännu**
>
> Betala inte igen för samma köp. Kontrollera status igen om en stund. Om problemet kvarstår hjälper vi dig att kontrollera köpet på plats när du kommer till JumpYard.

The action is **Kontrollera betalningen**. This is a fallback for unresolved evidence, not the ordinary response to a confirmed failed method. Its real-world frequency is not measured. It does not promise a confirmed booking, reserved time, check-in or an immediate staff response.

## Recovery boundaries

- Recovery uses a fixed 12-hour device-clock lifetime with detected clock rollback failing closed. Basket/contact reuse retains the existing contact-retention rules. No new raw JWT, redirect payload, BankID data, session data or payment diagnostic logging is added. The unchanged SDK retains its own existing provider storage behavior.
- A failed retry durably writes the safe CONTACT snapshot before releasing the failed marker. Missing or mismatched metadata cannot authorize a restart. An unprocessed orphan return remains in the URL so a reload cannot silently erase its only evidence.
- Bootstrap/result waiting is bounded at 30 seconds. A late bootstrap/ready callback cannot reopen the payment UI after uncertainty. Same-attempt definitive completion can still resolve it. Submission locks navigation synchronously using the installed SDK's `onBeforeSubmit` hook.
- This is browser-local recovery, not a new server-owned idempotency or cross-tab transaction protocol. SDK internals remain unchanged. The broader normal-result classification is #329; lost-response/idempotency work is #337. Cross-device recovery and full add-product return reconstruction are outside this issue.
- Manual status checks reuse `lookupBooking`. Its existing transport has no request timeout: an indefinitely unsettled request keeps the check busy until browser recovery/reload. No payment is created by that check.
- A return from a payment begun before this fix may lack the new session binding. It follows the conservative original-purchase status check/help path rather than pretending that the outcome is known.

## Local verification

The new suites exercise the recovery helper, real component callbacks with the actual installed SDK and mocked HTTP/Adyen, and actual BuyTickets/page handler declarations. They cover cancellation then restart with the same selection, preserved basket/contact, no-JWT returns, matching/mismatched/missing/expired evidence, duplicates and delayed callbacks, unknown checks, approved lookup failure, and safe back navigation. No provider or Cloud API was called by these tests.

Final results on 2026-09-03:

- `test:payment-recovery`: 67 passing tests (12 helper, 30 actual-SDK component, 10 BuyTickets and 15 page tests).
- Existing `test:payment-confirmation`, `test:paid-confirmation` and `test:exit-flow`: 32 passing tests. The combined final Node test run passed **99/99**, with no skips or failures.
- `npm run lint`: passes with no errors and four pre-existing image-element warnings.
- `node node_modules/next/dist/bin/next build --webpack`: production compilation, TypeScript validation and static export pass after the final page changes. A separate `npx tsc --noEmit` also passed.
- `git diff --check`, `validate:template` and `validate:current-ticket`: pass.

Changed production files are `src/flow/paymentRecovery.ts`, `src/components/RollerPaymentDropIn.tsx`, `src/components/BuyTickets.tsx`, `src/components/AddonsOffer.tsx`, `src/app/page.tsx` and `src/context/LanguageContext.tsx` under `jumpyard-checkin-phone`. Four focused test files and one existing exit-policy assertion accompany the change, with a phone package-script entry. Durable documentation is this evidence document, D0201 in `DECISIONS.md` and the recovery reference in `PROJECT_CONTEXT.md`.

Build environment note: the isolated checkout shares existing dependency directories through Windows junctions. Default Turbopack refuses a `node_modules` junction outside its filesystem root. `node node_modules/next/dist/bin/next build --webpack` successfully builds and statically exports the same phone sources without configuration/dependency changes.

Repository validation note: template and static issue-resolver checks passed. At the initial implementation baseline, `validate:history-archives` flagged the unchanged `REPO_CURRENT_STATE.md` because Windows CRLF made it 12,010 characters versus 11,926 with LF. A separate unapproved Project draft, **Make context-size validation consistent for Windows line endings** (`PVTI_lADOBXiXg84BdXuJzg5PU2I`), records this environment-dependent validator issue. The subsequent rollout snapshot records only verified merged/deployed facts.

## Protected rollout — 2026-09-03

[Implementation PR #355](https://github.com/wrlds-creations/jumpyard-check-in/pull/355) passed all four required CI jobs and independent review, then merged as `9f262114f3a6e5ea31e6ccd3313472963c80a353`. The GitHub phone build and immutable release both passed the ordinary Turbopack build with isolated dependencies. The issue remains open for Love's manual acceptance; technical publication is complete.

| Stage | Evidence |
| --- | --- |
| Implementation commit | `b7154c5666b088e8750bb36a5af5fdf04a08a9ed` |
| PR CI | [33735750396](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33735750396): Repository, Infrastructure, Phone and Admin passed |
| Immutable release | [33736067939](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33736067939): success, artifact `9885940293`, 505 checked files |
| Artifact digest | `sha256:241c2ca14a30610d19c4527f80d7d2c287c864253b9fe1fd23105ce24a4890ee` |
| Manifest SHA256 | `75963d696da6261d23a2cd207c10ed231058a41d76f88b880880348aeacbdb4c` |
| Park promotion | [33736643450](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33736643450): reviewed plan and delegated protected approval, all ordinary verification passed |
| Park Pages | Phone `9ef437c4`, admin `ab39745b` |
| Public promotion | [33737047547](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33737047547): same artifact, reviewed plan and delegated protected approval; success at 09:08 UTC |
| Public Pages | Phone `c3a967b2` at `https://checkin.jumpyard.se`; unchanged admin `03a6c7d5` at `https://staff-checkin.jumpyard.se` |
| Rollback candidate | Available [release 33731059247](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33731059247), `bee28edcdb89a0dfc2ac5a52d95c3364a393d552`, artifact `9884020961`; preserves #331/#334 |
| Rollback / re-promotion | Not needed or performed |

The Park plan compared identical template hash `b227888a573552adb362baebbf0cd866c5e0eeec9ffab06e13e908ad191ecf07`, with 202 resources and no additions, removals, property or template-section changes. CDK reported no changes. Migration apply was false, with all migrations through `0020` already applied. The ordinary exact-template, successful-stack, `IN_SYNC` drift, zero-alarm, empty-queue and exact-Pages-release gates passed. Public domain/CORS/Cognito/Apple Pay and API-target verification also passed. No gate was bypassed or reconfigured.

Independent readback compared each served root's exact JS/CSS asset set and every referenced file byte-for-byte against the validated selected artifact. Park passed at 09:06:42–43 UTC; public passed at 09:08:45–46 UTC. Each stage checked 12 phone and 10 admin assets plus both root HTML files, all identical. Across both stages: 48 static GETs, four matching roots and 44 matching JS/CSS responses. No JavaScript, business API, authenticated flow, booking, payment or guest message was executed by this readback.

AWS account `376129878018`, region `eu-north-1`, the ten WRLDS metadata values, backend `ebc7598`, schema, routes, IAM, secrets, venue/date scope and runtime gates are unchanged. `AWS_RESOURCES.md` and `REPO_CURRENT_STATE.md` record the verified deployment; the existing D0201/PROJECT_CONTEXT recovery policy needs no new decision. Klarna remains a separate investigation in #353. The next action is Love's phone/PWA test of the scenarios below; this rollout is not itself a successful live payment test.

## Manual handset verification still required

Use an explicitly approved test environment/payment fixture before promotion; local implementation approval does not authorize live purchases.

1. On the phone browser and installed PWA, start a purchase, leave for the provider authentication flow and return with a controlled cancellation/refusal. Verify readable failure, preserved time/quantity/add-ons/contact, and fresh methods after choosing another method.
2. Choose explicit Start over after confirmed failure; select the same time and basket. Verify methods render and no stale `Cancelled` response is replayed.
3. Go back before payment submission, then return with unchanged and changed selections. Verify methods remain usable. Once submitted, verify back/restart cannot abandon an unresolved purchase.
4. Simulate a delayed result, network interruption, reload and repeated return. Verify only the original purchase can be checked; a late definitive result for it is accepted, while an old result cannot change a new purchase.
5. Complete a controlled card payment. Verify a persistent receipt confirmation, explicit Continue, safety steps and the #331 paid check before handoff. Reload during delayed booking synchronization; verify no new payment is offered.
6. Check the shared add-on flow and its separate purchase identity. An unknown add-on return must not check in its stock-only purchase as an admission booking.
7. Check Swedish and English on a narrow phone viewport. Unresolved copy must remain understandable at home and must not promise a booking or staff response.

Commit, push, reviewed merge and protected Park/public deployment are complete as recorded above. Love performs the manual phone acceptance. Any rollback must select the previous successful immutable artifact and use the same reviewed protected workflows; it must not rebuild or remove stored purchase recovery.
