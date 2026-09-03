# Phone wallet failure recovery — #361

## Completed-booking recovery follow-up

Love reported that the iPhone still showed the unknown-payment card after opening the clean `https://checkin.jumpyard.se/` URL and suspected an old booking. The iPhone's actual stored attempt has not been inspected. This report does not establish its payment method, outcome or booking identity.

An offline reproduction found that a failed lookup of a saved completed purchase was classified as an unknown payment. The app's lookup requests today's visit date, so an old booking can fail restoration without becoming unpaid. The completed/already-checked-in view also hid its supplied **Gör en ny bokning** action.

The follow-up correction, based on `208a06fe272e74f2aa7dce1d217d31013bed81b1`, preserves #350/#338/#361/#351 and changes only phone recovery and its tests:

- Save a minimal `completion` marker containing the booking identifier and ready/completed status only after confirmed-paid context and the server handoff/completion path. It has the existing snapshot's 12-hour retention, contains no session credentials, and cannot be inferred from ordinary `APP_CONFIRM`, payment approval text or elapsed time.
- Recognize the legacy safety writer's `APP_PRESENT` only with consistent booking identities, explicit approved/not-required flags and no payment-draft identifier. Invalid or explicitly empty new metadata cannot fall back to this compatibility rule. This permits retiring completed UI state, never payment evidence.
- Show a distinct previous-booking restoration error with **Försök igen** and **Gör en ny bokning**. A completed restore cannot silently fall back into unfinished safety when its session is unavailable. The progress indicator retains the completed stage.
- Recheck the exact saved snapshot inside an exclusive payment ownership lease before the new fallback clears it. Raw payment, submission or observation data, return parameters, unreadable storage and clock rollback block the action. A previously observed unresolved attempt is not forgotten when storage expires. Pending lookups are invalidated before the snapshot is cleared.
- Retain **Gör en ny bokning** on completed/already-checked-in confirmation views. Live confirmed completion uses the same raw-empty checks; browsers genuinely lacking Web Locks retain their former live-completion behavior without a claim of cross-tab exclusivity. The new metadata-only restoration fallback requires Web Locks. Ordinary pre-payment exits are unchanged.

This correction does **not** establish a supported way to resume or cancel an unresolved submitted Klarna attempt. The Motorola browser-Back case and missing resume/termination contract remain open in #361 and #353. Google Pay/Klarna merchant readiness and any supported hiding decision remain #353. No payment evidence from Love's phones was cleared, and no new live purchase, provider setting or email send is part of this work.

The original rollout below is historical evidence for the pre-submit correction. The completed-booking follow-up has separate validation and rollout evidence here; neither proves that the actual iPhone record is a completed booking. #361 stays open for the remaining provider contract and combined handset acceptance.

### Follow-up validation

- `npm --prefix jumpyard-checkin-phone run test:payment-recovery`: 137/137 pass, including actual recovery-storage reads/writes, lease races, completed restore through the real page handlers, legacy/expiry/return/orphan protection and actual rendered confirmation/recovery components in Swedish and English. All business/provider responses are mocked; no live payment or booking request was made.
- Existing exit-flow, payment-confirmation/preview, paid-confirmation and language-toggle suites: 38/38 pass.
- Phone `npx tsc --noEmit`, `npm run lint` and local `npx next build --webpack` passed during implementation. Full lint retains four existing image warnings. All four exact PR CI gates subsequently passed before merge; the local build is not a deployment artifact.
- Template, static issue resolver and phone-local-contact retention validators pass; `git diff --check` passes.
- Independent source/test review found and verified corrections for expired snapshots, foreign prepayment snapshots and completed existing-booking screens. No remaining implementation blocker was found.
- No physical handset or live payment acceptance is claimed. The actual iPhone attempt and the submitted Klarna browser-Back contract remain unverified. No new dependency, AWS/backend/provider change or follow-up draft was introduced. PROJECT_CONTEXT.md and D0206 record the durable behavior; deployment facts are recorded only after protected promotion.

### Completed-booking protected rollout — 2026-09-03

Reviewed [PR #368](https://github.com/wrlds-creations/jumpyard-check-in/pull/368) merged as `7d5ca45e003bb2ec9030572059be439bfbeba0e2`, preserving #350 language selection, #338 exact paid-state checks, #333 redeem recovery/25-second timeout, #334 heartbeat and the prior #351/#361 corrections. All four required jobs passed in [PR CI 33773815357](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33773815357). No push-triggered main CI/release run was observed for this merge, so the existing `release.yml` was dispatched with that exact source SHA. Its full source/infrastructure/frontend validation passed; no separate main CI pass or cause for the absent automatic run is claimed.

| Evidence | Exact identity / result |
|---|---|
| Immutable release | [33774429052](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33774429052), successful; SHA `7d5ca45e003bb2ec9030572059be439bfbeba0e2` |
| Artifact | `9901144866`; digest `sha256:f1822e3200f03819c0afb986496736fcafb120c517fe419df51be2cdb57f2b48`; expires `2026-12-02T15:44:36Z` |
| Manifest validation | 505 files verified; SHA-256 `7847f5e1ae23265d949ab26611836268f5c994a3a0c2ab7a9084731bd3f6da01` |
| Park promotion | [33775277602](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33775277602), successful |
| Nacka public promotion | [33775819505](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33775819505), successful; same selected artifact |
| Rollback candidate | Previously deployed successful release `33763734057`, SHA `b99a41c192373e9a92491aa7c31fb5afef5939bb`, artifact `9896775164`; verified unexpired through `2026-12-02T13:54:10Z` |

Both exact artifact/target plans were read before normal delegated protected `park-test` approvals under Love's existing #361 publication instruction. Park's current/release template hash was identical: `70b058da41cfb971574065376c3b7f562a2653907dea7a4ef1e6b81530b9b28c`, with 202 resources and no resource or template-section changes. CDK reported no changes. `apply_migrations=false`; migrations `0001` through `0020` were already applied. Template equality, successful stack state, `IN_SYNC` drift, zero active alarms, empty related queues, exact Cloudflare release versions and ordinary endpoint checks passed.

Account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, API `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` and the existing Nacka `50871`/through-2026-09-30 scope are retained. Confirmed WRLDS metadata: Client/CostCenter `JumpYard`, Project `jumpyard-check-in`, Environment `park-test`, Owner/CreatedBy `love`, Repository `wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, DataClassification `confidential`, Exportable `true`. No schema, resource, IAM, secret, route, gate, provider setting, live business write or guest message changed. The public workflow promotes the same phone/admin files and performs no AWS mutation. No rollback or re-promotion was needed or performed; the recorded prior artifact must be selected through the same protected path without rebuilding.

Public promotion passed domain, CORS, Cognito, Apple Pay and exact Cloudflare release checks. Wrangler initially could not ascertain the phone upload's final status; the subsequent required exact-SHA/status verification and independent byte comparison both passed without redeployment. Immutable public outputs are `https://3fe72f0e.jumpyard-check-in-production.pages.dev` and `https://0daaeffe.jumpyard-checkin-admin-production.pages.dev`.

Independent static readback passed for Park at 15:58:14–15:58:15 UTC and the public origins at 16:02:33–16:02:35 UTC. All four root HTML files and 44 referenced JS/CSS responses matched the selected artifact byte for byte (48 static GETs, no mismatch or retry). These checks execute no app scripts or business API calls and do not prove a payment.

Implementation files: `src/app/page.tsx`, `src/flow/buyFlowRecovery.ts`, `src/flow/paymentRecovery.ts`, `src/components/ConfirmationScreen.tsx`, `src/context/LanguageContext.tsx`, four recovery/view test files and the phone test command, all under `jumpyard-checkin-phone`; PROJECT_CONTEXT.md, D0206 in DECISIONS.md and this evidence document record the durable behavior. The dependent rollout evidence also updates AWS_RESOURCES.md and REPO_CURRENT_STATE.md. No new Project draft was created; #353 retains the provider question.

Next handset check: reload the clean public URL on the affected iPhone. A recognized completed booking that cannot be restored should show **Vi kan inte visa din tidigare bokning**, with retry and **Gör en ny bokning**; confirmed ready/completed screens should also retain the new-booking action. If the unknown-payment card remains, do not clear its payment evidence or infer that no charge happened: the actual stored attempt still needs diagnosis. The full submitted Klarna Back-recovery contract, provider readiness and combined final-artifact payment/QR acceptance remain open in #361/#353.

## Incident and boundary

Love reported Google Pay `OR_BIBED_06` on an iPhone web checkout on 2026-09-03 around 13:43 CEST. Browser Back showed the payment-status recovery card; reload showed the same card without the booking progress indicator. The exact browser, handset callback and authorization status were not captured.

An offline reproduction executes the installed Adyen 5.71.2 `GooglePay.submit`, Roller ECOM 1.0.217 and the phone wrapper with all Google/HTTP calls mocked. A merchant error before wallet token submission is forwarded by Roller as generic `Error` and was recorded as unknown. Cancellation was retryable; a generic error after submission correctly remained protected. Roller's `onError` discards the original error code/context, so text matching cannot safely distinguish these cases.

The correction uses the existing `onBeforeSubmit` boundary, not a provider patch. The SDK releases its submission action even if this hook rejects. A blocked or obsolete hook must therefore remain pending, not reject or resolve.

## Recovery contract

- Only a fresh, exact checkout instance with durable pre-submit proof and exclusive current-version tab ownership can retire an explicit pre-submit failure and expose the existing choose-another-method action.
- The submitted phase is saved before releasing the SDK action. Loss of identity, storage or ownership prevents release.
- Received/approved/submitted/returned attempts, missing proof and legacy records remain protected. Browser Back, reload, timeout, error wording and an unpaid/404 lookup are never proof of no payment.
- Retired callbacks cannot release a late wallet token into payment or affect a replacement purchase. Recovery storage contains bounded identity/phase metadata, never raw payment JWTs, wallet tokens or return payloads.
- Web Locks support the fast recovery path across cooperating current-version tabs. Unsupported browsers retain conservative legacy recovery. This does not claim cross-device idempotency or coordination with an already-open older application version; #337 owns server idempotency.
- The failed-method action retains basket/contact and refreshes availability before a new checkout. Recovered payment views retain the booking progress indicator. Unresolved attempts still offer the original purchase status check and help on arrival.

Love's already trapped legacy attempt has no submission proof and is not cleared by this change. Exact provider reconciliation is needed to establish its outcome.

## Provider follow-up

#353 owns Google Pay/Klarna activation, domain/merchant configuration and any supported temporary phone-only suppression. The unsent Pabel draft includes the Google Pay error/time, a request to trace whether authorization occurred, Klarna after BankID, and the two older terminal questions. No provider message, configuration change or live transaction is part of #361.

## Validation and rollout

Validated locally on 2026-09-03, based on `24d0a2c`:

- `npm --prefix jumpyard-checkin-phone run test:payment-recovery`: 95/95 pass. This includes 15 actual Google Pay/SDK boundary cases, fresh failure/cancellation, post-submit/received/approved protection, storage failure, stale callbacks, separate tab ownership and stale observation/cleanup interleavings. All external calls are mocked.
- Existing exit, payment-confirmation/preview and paid-booking-confirmation tests: 32/32 pass. Final-QR new-booking behavior is covered by the recovery suite.
- Phone `npx tsc --noEmit`, `npm run lint` and `npx next build --webpack`: pass. Lint retains four existing image warnings. Webpack is used locally because this checkout shares dependency-directory junctions; release builds are unchanged.
- `git diff --check`, template/current-ticket and phone-local-contact validators: pass.
- The 52 repository validators were invoked individually: 50 passed. The history-size validator encounters the existing Windows line-ending issue (unchanged mainline state: 12,025 CRLF characters versus 11,941 LF characters; limit 12,000). The existing Project draft **Make context-size validation consistent for Windows line endings** owns that follow-up. The unrelated admin frontend validator lacks local admin dependencies; rerunning its heartbeat tests with the installed TypeScript path passed, then its admin build reported missing Next. No full local repository-validation pass is claimed.
- Independent read-only review approved the final code, UI callers, tests and this boundary. No remaining implementation blocker was found.

Changed surfaces: payment wrapper; recovery storage and ownership; BuyTickets, AddonsOffer and page recovery callers; their focused tests/test command. AddonsOffer only adapts its existing shared recovery calls. Durable decisions are recorded in D0203 and linked from PROJECT_CONTEXT.md. Implementation changed no provider configuration, backend or AWS resource; this rollout record also updates REPO_CURRENT_STATE.md and AWS_RESOURCES.md. No new dependency or new follow-up draft was created.

## Protected rollout — 2026-09-03

For [#361](https://github.com/wrlds-creations/jumpyard-check-in/issues/361), Love explicitly approved commit, push, PR merge and protected deployment for a handset test (the spoken "561" referred to this correction). [PR #362](https://github.com/wrlds-creations/jumpyard-check-in/pull/362) merged as `df69ecbe387c2e870bcc62adbc3d3c00563f6ca0`. All four required jobs passed in [PR CI 33755221668](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33755221668); [main CI 33755593230](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33755593230) also passed. These Linux CI results are separate from the local Windows limitations above.

| Evidence | Exact identity / result |
|---|---|
| Immutable release | [33755593134](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33755593134), successful; SHA `df69ecbe387c2e870bcc62adbc3d3c00563f6ca0` |
| Artifact | `9893479442`; digest `sha256:bca85ba5755a099b7d0659d57ffb968ce0a4f463785091a52a120ca1fc197de8` |
| Manifest validation | 505 files verified; SHA-256 `1a6f168f6e68ab3c1a8bbff3a3a8828a5e00872f5cde41139140d784e4e02ffb` |
| Park promotion | [33756140550](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33756140550), successful |
| Nacka public promotion | [33756585589](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33756585589), successful; same selected artifact |
| Rollback candidate | Successful release `33741393453`, SHA `409aa58d4cfeab9d1e120b576724649a5d651280`, artifact `9888027527`; verified unexpired |

Each exact artifact/target plan was reviewed before delegated protected `park-test` approval. Park's current/release template hash was identical: `0791f5bb04d17daa029e5cd8f9b50454c08f647a6041671b0c4fb8aff77c1a2a`, with 202 resources and no resource or template-section changes. CDK reported no changes. `apply_migrations=false`; migrations `0001` through `0020` were already applied. Template equality, successful stack state, `IN_SYNC` drift, zero active alarms, empty queues, exact Cloudflare release versions and ordinary endpoint checks passed. Public promotion then passed domain, CORS, Cognito and Apple Pay prerequisites and exact-version checks; that workflow performs no AWS mutation.

Independent static readback passed for Park at 12:40:07 UTC and the public origins at 12:43:13 UTC. All four phone/admin roots and all 44 referenced JS/CSS responses matched the selected artifact byte for byte: 48 static GETs, with no failure or retry. Static readback executes no app scripts or business APIs and does not prove a payment. The #333 redeem backend/admin, including its 25-second timeout, #334 heartbeat and accepted #351 recovery/QR behavior are retained. No schema, IAM, secret, route, runtime gate, venue/date scope, provider setting, live payment or guest message changed. No rollback or re-promotion was performed; rollback must select the recorded earlier immutable artifact through the same protected path without rebuilding.

## Original pre-submit acceptance — historical rollout

The original `33755593134` / `df69ecb` rollout requested handset acceptance for pre-submit failure to another method, browser Back/reload, successful purchase/QR and **Gör en ny bokning**. Love later confirmed the fresh Google Pay retry on Motorola; the subsequent Klarna Back case remained unresolved until its manual provider Close. Current test instructions and the remaining combined acceptance belong to the completed-booking follow-up above and #361. Do not use or clear the legacy unresolved attempt for acceptance without provider reconciliation.

Love will send the Pabel draft himself. #353 remains open/Blocked, and pilot readiness requires a decision to fix or seek supported phone-only suppression of Klarna/Google Pay if the provider has not resolved them. The pilot date is not yet confirmed; the existing pilot GO/no-go item owns that gate.
