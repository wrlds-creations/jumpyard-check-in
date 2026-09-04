# Park alarm routing — #335

## Finding

Read-only inventory on 2026-09-03 (account `376129878018`, region `eu-north-1`): all 30 `jumpyard-check-in-park-test-*` CloudWatch alarms had zero alarm, OK or insufficient-data actions, and the account had no SNS topic for them. An alarm therefore only changed colour in the console.

Complete 30-day alarm history (314 park-test state updates, not truncated):

| Alarm | Transitions to `ALARM` | Assessment |
|---|---|---|
| `webhook-processor-lambda-throttles` | 71 | Expected: the worker runs with reserved concurrency one, so throttling is normal queueing. |
| `roller-api-errors` | 39 | Mixed: counts every non-OK Roller answer, including an unknown booking code typed by a guest. 775 error responses out of 17,774 Roller calls; the longest run of consecutive failing five-minute periods was four. |
| `api-5xx` | 32 | Real signal: guest-facing server errors, mostly on test days. No Lambda error alarm fired at the same times, which points at integration timeouts rather than crashes. |
| `data-sync-lambda-errors` | 7 | Real signal: the nightly booking-index seed failed its first attempt on seven mornings (2026-08-19 to 2026-08-24, 2026-08-30) and nobody was told. |
| `webhook-retry-exhausted`, `webhook-queue-stale`, `webhook-processing-failures`, `webhook-dlq-visible`, `booking-index-stale` | 2, 2, 2, 1, 1 | Real signals during webhook test days. |
| The other 21 alarms | 0 | Quiet. |

Modelled email volume for the routed set below over the same 30 days: 48 ALARM emails (about 1.6 per day; zero on 15 of 30 days; the busiest days were 2026-08-18 with 10 and 2026-08-20 with 9), plus the same number of OK emails. Routing the three excluded alarms would have added 110 more. The new sustained Roller alarm would have fired once (2026-08-08 09:20 UTC) instead of 39 times.

## Decision (D0205)

- One SNS topic `jumpyard-check-in-park-test-alarms` with one email subscription to the WRLDS forwarding alias `aws-alarm@wrlds.com`, provided by Felix von Heland and chosen by Love on 2026-09-03. Email is used because the account remains in the SNS SMS sandbox.
- 28 alarms send both ALARM and OK notifications: `api-5xx`, `api-high-4xx`, `api-throttled-requests`, Lambda errors for all seven handlers, Lambda throttles for `lookup`, `booking`, `redeem`, `session` and `webhook`, `roller-ops-dlq-visible`, `webhook-dlq-visible`, `webhook-queue-stale`, `webhook-processing-failures`, `webhook-retry-exhausted`, `booking-index-stale`, the six `email-*` alarms and the new `roller-api-errors-sustained`.
- Dashboard-only: `webhook-processor-lambda-throttles`, `data-sync-lambda-throttles` and the single-period `roller-api-errors`.
- New alarm `roller-api-errors-sustained`: `RollerApiErrorCount` sum per five minutes, threshold 1, three consecutive periods, missing data not breaching.
- Configuration: `alarmNotifications.emailAddresses` and `okNotifications` in `infra/config`. Park-test accepts only the pinned alias; dev must stay empty so the hibernated Playground stack gains no resources. The release profile `park-test-full-flow-rehearsal.json` and the containment profile `park-test.json` both carry the alias; the historical smoke profiles do not route alarms.
- The topic keeps the default same-account policy and no customer-managed key: notifications contain alarm names, metric values and timestamps only.

## Validation (local, branch `codex/gh-335-park-alarm-routing`, base `9600165`)

- `npm --prefix infra run build` (type-check): pass.
- Release-profile synth: 205 resources (202 before), 31 alarms, one topic, one email subscription, 28 alarms with `AlarmActions` and `OKActions`, three without.
- `npm --prefix infra run validate:config-guards` and `validate:park-test-synth`: pass.
- `scripts/validate-t0193-api-protection.js` and `scripts/validate-t0194-staff-identity-infra.js`: pass with the resource count updated from 202 to 205.
- New `scripts/validate-gh335-alarm-routing.js` (wired into `npm run validate` and `infra:check`): pass for the release profile, the containment profile and dev.
- Read-only `cdk diff` against the deployed Park stack: exactly `[+]` topic, `[+]` subscription, `[+]` sustained alarm, and `[~]` in-place `AlarmActions`/`OKActions` on the 28 routed alarms; no replacement, no other change.
- `npm run infra:check` (the CI infrastructure chain, including the new validator and the example synth): pass.
- The 53 repository `validate:*` scripts were run individually: 51 pass. `validate:history-archives` fails only because the Windows checkout uses CRLF (`REPO_CURRENT_STATE.md` and `PROJECT_CONTEXT.md` are 11,990 and 11,982 characters with LF as in CI, above 12,000 with CRLF); neither file is touched here and the existing Project draft about Windows line endings owns it. `validate:t0194-staff-identity-frontend` runs the admin Next.js build and needs a real admin dependency install in the checkout; it passes on the main checkout, and no admin or phone file changes here. `git diff --check`: clean.

No AWS resource was created or changed. No commit, PR, release or deployment has been made.

## Rollout plan

1. Merge through a reviewed PR; the release workflow builds the immutable artifact.
2. Protected Park deploy with the reviewed plan. The deploy verifier still requires zero alarms in `ALARM`, unchanged from before.
3. The alias owner confirms the single `AWS Notification - Subscription Confirmation` email. Readback: `list-subscriptions-by-topic` shows a confirmed subscription and `describe-alarms` shows 28 alarms with one action each.
4. In a separately approved window, one controlled `set-alarm-state` test on a routed alarm proves ALARM and OK delivery. This changes alarm state only.
5. Rollback is the previous release artifact; it removes the topic and subscription, and a later re-creation needs a fresh confirmation.

## Open items and follow-up candidates

- `api-5xx` fired 32 times in 30 days without a matching Lambda error alarm; the cause (likely API integration timeouts) deserves its own investigation before real park traffic.
- The two dashboard-only throttle alarms can still block the protected deploy verifier while they are in `ALARM`; they fire during normal operation and should be redefined or excluded from that gate in a separate change.
- Only one recipient tier exists. Escalation beyond the alias is a routine, not an automatic second channel, until SMS or pager delivery is approved.
