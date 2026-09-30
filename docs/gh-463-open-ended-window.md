# #463 Open-ended Nacka full-flow window

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/463. Decision: D0236. Branch `codex/gh-463-open-ended-window` from `origin/main` `4431c1b`.

## Scope

Love, 2026-09-29 (found during #460): "förläng 30/9 tills för alltid och att jag måste gå in och stänga av". The explicit window ended on 2026-09-30. From 2026-10-01, Booking, Lookup and Redeem would have returned 403 for every Nacka visit, including the 2026-10-17 self-service test.

- Nacka `50871` new purchases, add-ons, assisted lookup and staff/kiosk redemption stay open with no end date.
- Unchanged: the venue check, emergency stop, draft/redeem write gates, closed general guest sends, the #392 date lock, Klarna policy, frontends and AWS resources. No dependency or migration.

## Design

- **Config.** `safetyGates.fullFlowRehearsalOpenEndedFromDate: "2026-06-29"` in `infra/config/park-test-full-flow-rehearsal.json`. The explicit 94-date list (2026-06-29 to 2026-09-30) is unchanged. Lambda environment variables share a 4 KB limit, so the list cannot keep growing.
- **Guards** (`infra/lib/config.ts`, fail closed). The value must be a string and a real calendar date `YYYY-MM-DD`. It is accepted only with `T0176_FULL_FLOW_REHEARSAL_APPROVED`, so the closed `park-test.json`, the other park-test profiles and dev must leave it empty.
- **Stack.** `T0176_FULL_FLOW_OPEN_ENDED_FROM_DATE` is set on Booking, Lookup and Redeem. It is empty unless the full-flow approval is active, so an assisted-lookup-only (T0171) profile never receives it. No other function has it.
- **Runtime.** A date passes when it is in the explicit list, or when it is a valid date on or after the start. A malformed start allows nothing: Booking item dates return `500 t0176_full_flow_config_error`, Lookup returns `500 lookup_config_error` and Redeem stays blocked.
  - Booking: `validateT0176FullFlowRequestItemDates` checks every quote/draft item for new purchases and add-ons; `validateT0176FullFlowOriginalBookingAccess` checks the add-on booking date and venue.
  - Lookup: assisted lookup access and booking scope check the expected date (or the venue's today) and the venue.
  - Redeem: `isT0176FullFlowRedeemAllowed` checks the requested, booking and ticket dates and the venue.
- **Release contract.** The manifest records `target.fullFlow.openEndedFromDate`. `scripts/validate-park-test-release.js` accepts `2026-06-29` or no value (older artifacts) and requires it to match the copied config. `validate:t0198-cicd` pins the source value.

## Closing (Love's explicit decision only)

1. Love asks to close the window.
2. A reviewed PR removes `fullFlowRehearsalOpenEndedFromDate` from the release config. It also updates the pins (`scripts/validate-t0198-cicd.js`, `infra/scripts/validate-park-test-synth.ts`, the release-config case in `infra/scripts/validate-config-guards.ts`) and D0236/`PROJECT_CONTEXT.md`.
3. The merge builds the immutable release. The protected `park-test` plan should change only the Booking, Lookup and Redeem environments; Love approves it.
4. Readback shows `T0176_FULL_FLOW_OPEN_ENDED_FROM_DATE` empty on the three functions. The explicit list ends at 2026-09-30, so later Nacka dates are rejected again.

- A full close to the closed profile `park-test.json` is outside the routine release contract, because the release builder requires the full-flow gates. It needs its own approved issue.
- After 2026-09-30, a rollback to a release built before #463 also closes new Nacka dates. Unless that is the intent, roll back only to #463 or later releases.

## Validation (local, 2026-09-29)

- **Focused suites** (the two Lambda suites fail against the pre-#463 Lambda code and pass after):
  - `validate:t0192-request-item-dates`: item dates 2026-06-29, 2026-10-01 and 2027-06-01 pass; 2026-06-28, mixed, missing, `2026-13-01` and `2027-02-30` fail; a malformed start fails closed. All four quote/draft routes still block 2026-06-28 before any AWS or Roller call; a 2027-06-01 quote passes the gate and reaches the Roller configuration read.
  - `validate:t0190-safety-gates`: Booking add-on access, Lookup (access and booking scope) and Redeem accept Nacka on 2026-10-01 and 2027-06-01 and reject venue `99999`. They reject 2026-06-28, a ticket dated before the start, 2026-10-01 without the setting, and a malformed start. The emergency stop still wins: lookup and redeem are refused and booking writes are disabled.
  - `infra validate:config-guards`: 11 new cases. The release config carries `2026-06-29`, the closed and dev configs carry none, and the setting is refused in the closed, assisted-lookup-only and dev profiles and when it is a non-ISO string, an impossible date, a word or a number.
  - `infra validate:park-test-synth`: the full-flow profile sets `2026-06-29` on exactly the three functions; closed, assisted-lookup and dev profiles set it empty; no other Lambda has the key.
- **Full suites:** `npm run infra:check` passes (all 31 steps). The `npm run validate` steps, run one by one, pass 65 of 67, plus the 24 `prevalidate` tests. The two failures are local-only and identical on untouched `origin/main`:
  - `validate:history-archives` counts CRLF characters. On an LF checkout, `PROJECT_CONTEXT.md` has 11,963 of 12,000 characters (unchanged by this issue), and the validator passes on LF copies.
  - In `validate:t0194-staff-identity-frontend`, the admin Turbopack build refuses the worktree's `node_modules` junction.
- **Synth diff** against `origin/main` `4431c1b` (repository plan tool): 207 resources before and after, nothing added or removed, no Outputs/Parameters change. Only `BookingHandler5D1461BB`, `LookupHandler5950B7B5` and `RedeemHandler3A94EE00` change: the code asset and one new environment key.
- **Environment size** (literal bytes plus 160 bytes per CloudFormation reference): Booking about 2.4 KB, Redeem 2.6 KB and Lookup 2.9 KB of 4 KB; each grows by 46 bytes.
- **Release tooling:** a local end-to-end run of the builder and validator with a placeholder bundle accepted a #463 release, a release without the setting and a pre-#463 manifest. It rejected another start date and any mismatch between manifest and copied config.

## Deployment

Not started. Commit, PR, merge, release and the protected promotion wait for Love's explicit go; the change must be live before the first guests arrive on 2026-10-01. After deployment, record the run IDs and the Lambda environment readback in `AWS_RESOURCES.md` and `REPO_CURRENT_STATE.md`.
