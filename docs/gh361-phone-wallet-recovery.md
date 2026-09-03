# Phone wallet failure recovery — #361

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

## Manual acceptance and remaining gate

#361 remains open for Love's handset acceptance against release `33755593134` / `df69ecb`: pre-submit failure to another method, browser Back/reload, successful purchase/QR and **Gör en ny bokning**. No new handset result is claimed. Do not use or clear the legacy unresolved attempt for acceptance without provider reconciliation.

Love will send the Pabel draft himself. #353 remains open/Blocked, and pilot readiness requires a decision to fix or seek supported phone-only suppression of Klarna/Google Pay if the provider has not resolved them. The pilot date is not yet confirmed; the existing pilot GO/no-go item owns that gate.
