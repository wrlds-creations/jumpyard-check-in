# Park alarm routing — #335

## Finding

Read-only inventory on 2026-09-03 (account `376129878018`, region `eu-north-1`): all 30 `jumpyard-check-in-park-test-*` CloudWatch alarms had zero alarm, OK or insufficient-data actions, and the account had no SNS topic for them. CloudWatch had no configured native notification path. External monitoring was not established by this inventory.

The previous agent recorded this 30-day alarm history (314 park-test state updates). The takeover did not independently reproduce that history:

| Alarm | Transitions to `ALARM` | Assessment |
|---|---|---|
| `webhook-processor-lambda-throttles` | 71 | Expected: the worker runs with reserved concurrency one, so throttling is normal queueing. |
| `roller-api-errors` | 39 | Mixed: counts every non-OK Roller answer, including an unknown booking code typed by a guest. 775 error responses out of 17,774 Roller calls; the longest run of consecutive failing five-minute periods was four. |
| `api-5xx` | 32 | Real signal: guest-facing server errors, mostly on test days. No Lambda error alarm fired at the same times, which points at integration timeouts rather than crashes. |
| `data-sync-lambda-errors` | 7 | Real signal: the nightly booking-index seed failed its first attempt on seven mornings (2026-08-19 to 2026-08-24, 2026-08-30) without a configured native alarm action. |
| `webhook-retry-exhausted`, `webhook-queue-stale`, `webhook-processing-failures`, `webhook-dlq-visible`, `booking-index-stale` | 2, 2, 2, 1, 1 | Real signals during webhook test days. |
| The other 21 alarms | 0 | Quiet. |

The previous agent modelled email volume for the routed set below over the same 30 days: 48 ALARM emails (about 1.6 per day; zero on 15 of 30 days; the busiest days were 2026-08-18 with 10 and 2026-08-20 with 9), plus the same number of OK emails. Routing the three excluded alarms would have added 110 more. The previous model predicted one sustained Roller alarm (2026-08-08 09:20 UTC) instead of 39 raw-alarm transitions. This estimate has not been revalidated against the corrected missing-data expression and is not a delivery or future-noise guarantee.

## Decision (D0212)

- One SNS topic `jumpyard-check-in-park-test-alarms` with one email subscription to the WRLDS forwarding alias `aws-alarm@wrlds.com`, forwarding to Love at `love@wrlds.com`, as requested on 2026-09-04. A separate mailbox is not required, but Love confirmed the alias exists on 2026-09-04; the SNS subscription and end-to-end delivery remain unverified. SMS is outside this issue.
- 28 alarms send both ALARM and OK notifications: `api-5xx`, `api-high-4xx`, `api-throttled-requests`, Lambda errors for all seven handlers, Lambda throttles for `lookup`, `booking`, `redeem`, `session` and `webhook`, `roller-ops-dlq-visible`, `webhook-dlq-visible`, `webhook-queue-stale`, `webhook-processing-failures`, `webhook-retry-exhausted`, `booking-index-stale`, the six `email-*` alarms and the new `roller-api-errors-sustained`.
- Dashboard-only: `webhook-processor-lambda-throttles`, `data-sync-lambda-throttles` and the single-period `roller-api-errors`.
- New alarm `roller-api-errors-sustained`: `RollerApiErrorCount` sum per five minutes, threshold 1, three consecutive periods, with `FILL(errors,0)` so older sparse error datapoints cannot bridge a gap. Missing data is otherwise not breaching. This is at least one error per period, not an error-rate threshold.
- Configuration: `alarmNotifications.emailAddresses` and `okNotifications` in `infra/config`. Park-test accepts only the pinned alias; dev must stay empty so the hibernated Playground stack gains no resources. The release profile `park-test-full-flow-rehearsal.json` and the containment profile `park-test.json` both carry the alias; the historical smoke profiles do not route alarms.
- The topic keeps the default same-account policy and no customer-managed key: notifications contain alarm names, metric values and timestamps only.

## Previous-agent validation (local, branch `codex/gh-335-park-alarm-routing`, base `9600165`)

- `npm --prefix infra run build` (type-check): pass.
- Release-profile synth: 205 resources (202 before), 31 alarms, one topic, one email subscription, 28 alarms with `AlarmActions` and `OKActions`, three without.
- `npm --prefix infra run validate:config-guards` and `validate:park-test-synth`: pass.
- `scripts/validate-t0193-api-protection.js` and `scripts/validate-t0194-staff-identity-infra.js`: pass with the resource count updated from 202 to 205.
- New `scripts/validate-gh335-alarm-routing.js` (wired into `npm run validate` and `infra:check`): pass for the release profile, the containment profile and dev.
- Read-only `cdk diff` against the deployed Park stack: exactly `[+]` topic, `[+]` subscription, `[+]` sustained alarm, and `[~]` in-place `AlarmActions`/`OKActions` on the 28 routed alarms; no replacement, no other change.
- `npm run infra:check` (the CI infrastructure chain, including the new validator and the example synth): pass.
- The 53 repository `validate:*` scripts were run individually: 51 pass. `validate:history-archives` fails only because the Windows checkout uses CRLF (`REPO_CURRENT_STATE.md` and `PROJECT_CONTEXT.md` are 11,990 and 11,982 characters with LF as in CI, above 12,000 with CRLF); neither file is touched here and the existing Project draft about Windows line endings owns it. `validate:t0194-staff-identity-frontend` runs the admin Next.js build and needs a real admin dependency install in the checkout; it passes on the main checkout, and no admin or phone file changes here. `git diff --check`: clean.

The previous agent committed `93450fe340c7b73ac5eea6389ffc71c54785174a` and opened [PR #370](https://github.com/wrlds-creations/jumpyard-check-in/pull/370). No AWS resource was created or changed by that implementation. The PR remains unmerged; the new integration described below has no commit or deployment.

## Rollout plan

1. Merge through a reviewed PR; the release workflow builds the immutable artifact.
2. Protected Park deploy with the reviewed plan. The deploy verifier still requires zero alarms in `ALARM`, unchanged from before.
3. Love receives the forwarded subscription email and confirms through authenticated `ConfirmSubscription` with `AuthenticateOnUnsubscribe=true`. Read back the exact alias, confirmed subscription and authentication attribute, plus 28 alarms with ALARM and OK actions. See the recipient setup in `OPERATIONS_RUNBOOK.md`.
4. In a separately approved window, one controlled `set-alarm-state` ALARM/OK test on an otherwise healthy routed alarm must produce both emails in Love's inbox. Verify the SNS-only action list first, record action history and receipt, and finish with naturally evaluated OK. This exercises the notification actions, not a business transaction.
5. Rollback is the previous release artifact; it removes the topic and subscription, and a later re-creation needs a fresh confirmation.

## Open items and follow-up candidates

- `api-5xx` fired 32 times in 30 days without a matching Lambda error alarm; the cause (likely API integration timeouts) deserves its own investigation before real park traffic.
- The two dashboard-only throttle alarms can still block the protected deploy verifier while they are in `ALARM`; they fire during normal operation and should be redefined or excluded from that gate in a separate change.
- Only one recipient tier exists. Escalation beyond the alias is a routine, not an automatic second channel, until SMS or pager delivery is approved.

## Takeover and current local validation — 2026-09-04

Love requested takeover of #335 and the path `aws-alarm@wrlds.com -> love@wrlds.com`, then confirmed that the alias exists. This is owner confirmation of mailbox configuration, not a received SNS notification. [AWS supports email endpoints and mailing lists](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html); the existing alias can receive and forward the confirmation. No separate mailbox or guest-email/SES change is required.

The original PR #370 at `93450fe340c7b73ac5eea6389ffc71c54785174a` conflicts with main. Following the repository's integration rule, its branch was preserved and merged locally without a commit into `codex/gh-335-integrate-alarm-routing`, based on `5e163356cc7c30cd7b7d5b381db9472f42381172` (short ref `5e16335`). AWS inventory and package scripts preserve both mainline additions and #335. The unmerged alarm decision formerly used `D0205`, which main uses for #350; its integrated reference is `D0212`. No historical commit was rewritten.

Review corrected two implementation problems:

- The extra sustained Roller alarm is now limited to profiles with notifications; dev and historical unrouted profiles keep their previous alarm set.
- Sparse error metrics use `FILL(errors,0)` before the 3-of-3 evaluation. Without zero filling, CloudWatch may use older real datapoints across gaps, invalidating the promised consecutive-period filter. The raw dashboard alarm is unchanged. [AWS missing-data evaluation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html).

Current validation:

| Check | Result |
|---|---|
| `npm --prefix infra run build` | Pass |
| `npm --prefix infra run validate:config-guards` | Pass |
| `node scripts/validate-gh335-alarm-routing.js` | Pass: release 28 routed / 3 dashboard-only; containment 27 / 3; dev and historical lookup smoke have no topic, subscription or additional sustained alarm |
| `node scripts/validate-history-archives.js` | Pass |
| `node scripts/validate-aws-tags.js` | Pass |
| `node --check scripts/validate-gh335-alarm-routing.js` | Pass |
| Read-only `cdk diff -c config=./config/park-test-full-flow-rehearsal.json --profile wrlds-dev --method template --quiet` | Exactly three additions (topic, subscription, sustained alarm), ALARM/OK actions on 27 existing alarms, and one topic-ARN output. No deletion, replacement, Lambda, IAM, database or business-flow change |
| `git diff --cached --check` | Pass |

The complete repository/phone/admin CI suite was not rerun during this takeover. The four-profile synth and config guards cover the scoped infrastructure correction; normal PR checks still apply before merge.

Read-only AWS identity and stack/tag checks confirmed account `376129878018`, region `eu-north-1`, stack `UPDATE_COMPLETE`; Client/CostCenter `JumpYard`, Project `jumpyard-check-in`, Environment `park-test`, Owner/CreatedBy `love`, Repository `wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, DataClassification `confidential`, Exportable `true`. All 30 existing Park alarms were OK with empty ALARM/OK actions and there was no Park SNS topic. DNS MX resolved to Microsoft 365; it cannot verify an individual alias.

Updated files: `AWS_RESOURCES.md`, `DECISIONS.md`, `OPERATIONS_RUNBOOK.md`, this evidence document, both active Park config files, `infra/lib/config.ts`, `infra/lib/jumpyard-cloud-stack.ts`, root/infra `package.json`, and the #335/T0193/T0194 infrastructure validators. `PROJECT_CONTEXT.md` and `REPO_CURRENT_STATE.md` remain unchanged because routing is not yet merged or deployed.

At the initial local handoff, no new commit, PR update, AWS apply, mail send, release, deploy, rollback or re-promotion had occurred. Love subsequently authorized commit, push, merge and the first email in this conversation. The operator will use the protected immutable Park workflow, review the exact plan before approval and perform the bounded SNS confirmation/notification proof; no unrelated guest sending or business transaction is authorized. The implementation PR must keep #335 open until confirmed subscription, actual ALARM/OK receipt, acknowledgement/escalation ownership and rollout evidence are complete. One forwarding alias still has only one responder; backup coverage and external monitoring remain unresolved.

Follow-up ownership was checked against all 176 existing Project items before creating a new draft. API 5xx diagnostic gaps remain in [#340](https://github.com/wrlds-creations/jumpyard-check-in/issues/340). The existing Project items for silent deploy-verifier failures and expected Roller 404s were retained. A new unapproved draft, **Review expected worker-throttle alarms in protected Park verification**, was created in [Project #5](https://github.com/orgs/wrlds-creations/projects/5), item `PVTI_lADOBXiXg84BdXuJzg5cfo4`, solely for the two reserved-concurrency worker throttle signals. It authorizes no alarm reset, gate weakening, AWS change or implementation.

Before publication, current main `0e04fb4f3a86d11366687e4aa7b4cd232d1fc4ce` was integrated without rewriting the original source branch. This preserves the approved #339/#341 catalog change and #343 rollout records; the only new merge conflict was validation-script wiring, resolved by retaining both suites. Main assigned D0211 to catalog resilience, so the alarm decision uses D0212. #335 promotion will follow the already authorized #339/#341 rollout to avoid reverting or incidentally introducing another issue's runtime change.
