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

- One SNS topic `jumpyard-check-in-park-test-alarms` with one email subscription to the WRLDS forwarding alias `aws-alarm@wrlds.com`, forwarding to Love at `love@wrlds.com`, as requested on 2026-09-04. A separate mailbox is not required. Love confirmed the alias exists; authenticated SNS confirmation and actual ALARM/OK delivery were subsequently verified on the same date as recorded below. SMS is outside this issue.
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

The previous agent committed `93450fe340c7b73ac5eea6389ffc71c54785174a` and opened [PR #370](https://github.com/wrlds-creations/jumpyard-check-in/pull/370). That agent performed no deployment. PR #370 was later closed as superseded by the reviewed integration PR #381; its source branch was preserved.

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

## Takeover and pre-merge validation — 2026-09-04

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

The complete repository/phone/admin CI suite was not rerun locally during takeover. All four required CI jobs subsequently passed on the final integration head before merge, as recorded below.

Read-only AWS identity and stack/tag checks confirmed account `376129878018`, region `eu-north-1`, stack `UPDATE_COMPLETE`; Client/CostCenter `JumpYard`, Project `jumpyard-check-in`, Environment `park-test`, Owner/CreatedBy `love`, Repository `wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, DataClassification `confidential`, Exportable `true`. All 30 existing Park alarms were OK with empty ALARM/OK actions and there was no Park SNS topic. DNS MX resolved to Microsoft 365; it cannot verify an individual alias.

Implementation files: `AWS_RESOURCES.md`, `DECISIONS.md`, `OPERATIONS_RUNBOOK.md`, this evidence document, both active Park config files, `infra/lib/config.ts`, `infra/lib/jumpyard-cloud-stack.ts`, root/infra `package.json`, and the #335/T0193/T0194 infrastructure validators. `PROJECT_CONTEXT.md` and `REPO_CURRENT_STATE.md` were left unchanged before merge; the rollout evidence updates them now that routing is deployed.

At the initial local handoff, no new commit, PR update, AWS apply, mail send, release, deploy, rollback or re-promotion had occurred. Love subsequently authorized commit, push, merge and the first email in this conversation. The approved protected rollout and bounded notification proof are recorded below. The implementation PR kept #335 open for rollout evidence and operational confirmation. One forwarding alias still has only one responder; existing external monitoring remains unconfirmed.

Follow-up ownership was checked against all 176 existing Project items before creating a new draft. API 5xx diagnostic gaps remain in [#340](https://github.com/wrlds-creations/jumpyard-check-in/issues/340). The existing Project items for silent deploy-verifier failures and expected Roller 404s were retained. A new unapproved draft, **Review expected worker-throttle alarms in protected Park verification**, was created in [Project #5](https://github.com/orgs/wrlds-creations/projects/5), item `PVTI_lADOBXiXg84BdXuJzg5cfo4`, solely for the two reserved-concurrency worker throttle signals. It authorizes no alarm reset, gate weakening, AWS change or implementation.

Before publication, current main `0e04fb4f3a86d11366687e4aa7b4cd232d1fc4ce` was integrated without rewriting the original source branch. This preserves the approved #339/#341 catalog change and #343 rollout records; the only new merge conflict was validation-script wiring, resolved by retaining both suites. Main assigned D0211 to catalog resilience, so the alarm decision uses D0212. #335 promotion followed the already authorized #339/#341 rollout. Its evidence PR #382 was merged before preparing this rollout record, and its records are preserved.

## Protected rollout and delivery proof — 2026-09-04

Love explicitly authorized commit, push, merge and the first email after the protected deployment and controlled-test approach had been explained. [PR #381](https://github.com/wrlds-creations/jumpyard-check-in/pull/381) merged `1783cd468caa0198755841641fc3a55962bdeda0` at 13:05:41Z. Independent review found no remaining implementation blocker. [CI 33875783932](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33875783932) passed Repository, Infrastructure, Phone and Admin on the exact reviewed integration head.

| Evidence | Value |
|---|---|
| Immutable release | [33876169856](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33876169856), successful |
| Artifact | `9938138226`, `park-test-release-1783cd468caa0198755841641fc3a55962bdeda0` |
| Artifact digest | `sha256:da2cdd6b42f23fd2bec900fe0579bee67c550cf49fb3d6847725ab5583c40ac0` |
| Manifest SHA-256 | `55521e5372edfeb20bfbe0878db6bb2f91623dd3b1bc7194f392554b757afe6f`; all 556 files verified |
| Protected Park run | [33876824492](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33876824492), successful at 13:17:23Z; deployment `6265052886` |
| Current template before promotion | `cc997a77255d49c435b16e2d004bd52c8fb97cb79e9d1192a67fb5f88aa0cfb2` |
| Selected/deployed template | `45be018ca5b478d3b1e1962135df2370356044dce4a66d52e9f885af902c6abe` |
| Target | Account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack` |

The exact read-only plan was reviewed before approving the protected environment under Love's authorization. It adds `AlarmNotificationsTopic818FA54D`, `AlarmNotificationsTopicawsalarmwrldscom37EB8929`, and `RollerApiErrorsSustainedAlarm7B99A5F1`; 27 existing alarms gain ALARM/OK actions. The only other differences are CDK analytics metadata and the topic-ARN output. No resource removal, replacement, business code, IAM, schema, migration, guest-send gate or Nacka-scope change is present. Resource count increases from 202 to 205. Required tags and ownership remain as recorded above.

The standard workflow passed exact template equality, successful stack state, `IN_SYNC` drift, alarm/queue checks, migrations through `0020` with apply disabled, and the Park frontend checks. Independent AWS readback confirmed 31 alarms, all actions enabled, 28 with the exact topic in both ALARM/OK lists and three dashboard-only. The new alarm is `FILL(errors,0)`, threshold one, 3/3 five-minute periods. No public-origin promotion was needed for this infrastructure change.

### Authenticated alias confirmation

The confirmation email arrived in Love's Outlook inbox at **15:15 Europe/Stockholm** from `no-reply@sns.amazonaws.com`, with subject `AWS Notification - Subscription Confirmation` and the exact Park topic. The confirmation link was submitted through the authenticated AWS SNS console session for account `376129878018`; the console reported success. No token or confirmation URL was written to GitHub, files or logs.

Readback of subscription `arn:aws:sns:eu-north-1:376129878018:jumpyard-check-in-park-test-alarms:3a40e93f-12f3-46e2-b7af-5ec59ac615f0` confirmed endpoint `aws-alarm@wrlds.com`, protocol `email`, `PendingConfirmation=false`, and `ConfirmationWasAuthenticated=true`. This protects the subscription from an unauthenticated unsubscribe link. The new sustained alarm naturally left initial `INSUFFICIENT_DATA` and produced an initial OK email at 15:17; this was not a second controlled test.

### One controlled ALARM test and natural recovery

After the protected workflow succeeded, `jumpyard-check-in-park-test-api-5xx` was checked as healthy/OK with actions enabled, exactly the Park SNS topic as its sole ALARM and OK action, and no insufficient-data action. The confirmed/authenticated subscription was also rechecked. A single `aws cloudwatch set-alarm-state` changed its state to ALARM with this explicit reason:

> GH335_NOTIFICATION_TEST: Approved email routing proof. No production fault was induced; this test changes alarm state only.

| Event | UTC | Inbox evidence (Europe/Stockholm) |
|---|---|---|
| Controlled ALARM | 13:18:20.837Z | **15:18**, `ALARM: "jumpyard-check-in-park-test-api-5xx" in EU (Stockholm)`, with the exact test reason |
| SNS ALARM action succeeded | 13:18:20.881Z | Same ALARM message |
| Natural metric evaluation restored OK | 13:18:58.259Z | **15:19**, `OK: "jumpyard-check-in-park-test-api-5xx" in EU (Stockholm)` |
| SNS OK action succeeded | 13:18:58.293Z | Same OK message |

Both actual messages were observed in the logged-in `love@wrlds.com` Outlook inbox. They were left unread for Love. The alarm was not manually forced back to OK; its normal evaluator restored it after about 37 seconds. Post-test readback found **all 31 alarms OK**. The test changed alarm state only, without changing metrics, generating a production fault or invoking a booking/payment/check-in/queue replay. Successful SNS actions plus actual inbox receipt prove the intended forwarding path for both state transitions; they do not prove incident recovery, future delivery latency or staffed coverage.

### Rollback and remaining closeout

The verified, unexpired rollback candidate is [release 33875422657](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33875422657), SHA `0e04fb4f3a86d11366687e4aa7b4cd232d1fc4ce`, artifact `9937812376`, digest `sha256:4e7fd8491991a5c558089c4e17a1979d183276463aa65e357abd4b5e2326a4ca`, already successful in Park run `33875994276`. Rollback uses that immutable artifact through the protected workflow. No rollback, re-promotion or rebuild occurred. Removing/recreating the topic would require a new authenticated subscription confirmation.

Delivery is complete. The runbook names Love as first responder and specifies acknowledgement, impact assessment, first actions and provider escalation. #335 remains open because its explicit requirement to confirm any existing external monitoring has not been answered; empty historical alarm-action lists cannot establish its absence. No second responder, response deadline or out-of-hours guarantee is claimed. These coverage limits do not prevent this verified email route from operating. The existing #340 and the worker-throttle Project draft retain their separate scopes; no additional implementation or deployment is needed to deliver these alarms.

The rollout record updates `AWS_RESOURCES.md`, `OPERATIONS_RUNBOOK.md`, `PROJECT_CONTEXT.md`, `REPO_CURRENT_STATE.md` and this document. D0212 already records the design. This evidence change requires no redeployment.
