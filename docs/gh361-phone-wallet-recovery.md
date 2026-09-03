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
- The 52 repository validators were invoked individually: 50 passed. The history-size validator encounters the existing Windows line-ending issue (unchanged mainline state: 12,025 CRLF characters versus 11,941 LF characters; limit 12,000). The existing Project draft **Make context-size validation consistent for Windows line endings** owns that follow-up. The unrelated admin frontend validator lacks local admin dependencies; rerunning its heartbeat tests with the installed TypeScript path passed, then its admin build reported missing Next. No full repository-validation pass is claimed.
- Independent read-only review approved the final code, UI callers, tests and this boundary. No remaining implementation blocker was found.

Changed surfaces: payment wrapper; recovery storage and ownership; BuyTickets, AddonsOffer and page recovery callers; their focused tests/test command. AddonsOffer only adapts its existing shared recovery calls. Durable decisions are recorded in D0203 and linked from PROJECT_CONTEXT.md. REPO_CURRENT_STATE.md, provider configuration, backend and AWS resources are unchanged. No new dependency or new follow-up draft was created.

Issue: [#361](https://github.com/wrlds-creations/jumpyard-check-in/issues/361). On 2026-09-03 Love explicitly approved commit, push, PR merge and protected deployment for a handset test (the spoken "561" refers to this #361 correction). Promote the reviewed immutable artifact through Park verification and then the Nacka public origins, retaining the existing backend/admin and migration/gate posture. Record release/promotion evidence after execution; keep the issue open for handset acceptance. Check pre-submit failure to another method, browser Back/reload, successful purchase/QR and Make a new booking. Do not use or clear the legacy unresolved attempt for that acceptance without provider reconciliation. Love will send the Pabel draft himself; #353 stays open/Blocked, with a decision before the pilot to fix or seek supported phone-only suppression of Klarna/Google Pay if the provider has not resolved them.
