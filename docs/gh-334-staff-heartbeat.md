# Resilient staff PIN heartbeat (#334)

## Scope and implementation

Love approved [#334](https://github.com/wrlds-creations/jumpyard-check-in/issues/334)
and explicitly authorized commit, push, reviewed merge and protected deployment
on 2026-09-03. Implementation [PR #349](https://github.com/wrlds-creations/jumpyard-check-in/pull/349)
merged as `bee28edcdb89a0dfc2ac5a52d95c3364a393d552`, based on
`a42559bacc6d848a227a898380de2e194d433dc7` (#331 / PR #348).
The phone payment-confirmation fix from #331 is preserved unchanged.

The verified defect was unconditional local logout after a staff PIN heartbeat
failure, including temporary network errors, HTTP 429 and server failures.
The fix changes only the admin frontend, its regression validation and durable
context/decision documentation:

- `src/lib/adminApi.ts`: classify heartbeat response/transport failures and bound
  request plus body reads at 15 seconds; 401/403 fail immediately.
- `src/lib/staffIdentity.ts`: retain only matching, unexpired local credentials
  for transient status 0/408/429/5xx unless an explicit auth failure is reported;
  coalesce concurrent requests and persist 30/60/120-second retry backoff plus
  up to 20% jitter. These are earliest retry times; 30-second periodic checks
  and browser background throttling can delay the actual request. Resume and
  periodic checks use the same policy.
- `src/app/page.tsx`: reject stale resume results after credential replacement.
- `src/lib/staffIdentity.test.mjs` and the existing T0194 frontend validator:
  executable regression tests against actual TypeScript modules in CI.

Paths above are relative to `jumpyard-checkin-admin`, except the validator in
`scripts/validate-t0194-staff-identity-frontend.js`. `PROJECT_CONTEXT.md` and D0200
in `DECISIONS.md` document the policy. No backend, phone, kiosk, dependency,
AWS resource, permission, route or session-duration change was made.

Only verified success advances heartbeat time. Retries never advance activity
or expiry. The existing 15-minute local idle, server/token deadlines and
eight-hour absolute limit remain. HTTP 401/403, explicit auth failure and
identity mismatch still fail closed. Late heartbeat or logout results cannot
overwrite or clear a replacement login. Credentials stay in per-tab session
storage; cross-tab broadcasts still contain logout notification only.

## Automated validation and review

- 73 focused tests passed, including network/body failures; 408/429/5xx with
  JSON, empty and HTML responses; 401/403; timeout; recovery; concurrent calls;
  persistent capped backoff; expiry; permissions/identity mismatch; replacement races;
  activity during a pending request; and isolated parallel tabs.
- Admin TypeScript (`--noEmit --incremental false`) and ESLint passed locally.
- The existing T0194 validator passed both PIN and legacy production builds and
  frontend contracts. Local builds used `IS_WEBPACK_TEST=1` for the existing
  Windows dependency junction; no repository build setting was changed.
- Template, issue-resolver, history-archive, follow-up and diff checks passed.
- Independent agent review found no blocker. Its decision-table formatting nit
  was fixed before commit.
- [Required PR CI 33730762437](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33730762437)
  passed Repository, Infrastructure, Phone and Admin checks, including the
  normal CI build path and the new regression suite.

## Existing-log investigation

Read-only investigation verified AWS account `376129878018`, region
`eu-north-1`, API `ij4rnaui2b` and log group
`/aws/apigateway/jumpyard-check-in-park-test-api-access`.
The route is `POST /v1/staff/auth/session`.

| UTC day | Requests | HTTP 200 | HTTP 401 | HTTP 429 / 5xx |
|---|---:|---:|---:|---:|
| 2026-08-25 | 7,568 | 7,518 | 50 | 0 |
| 2026-08-26 | 2,325 | 2,316 | 9 | 0 |

The window is 2026-08-25 00:00 through 2026-08-27 00:00 UTC. All 9,893
request IDs are distinct, with one row each: this is not duplicate logging.
Consecutive-route gap median was 4.991 seconds and p95 15.08 seconds;
3,581 of 9,892 gaps were under one second. Each Aug25 15-21 UTC hour contained
687-698 calls. Maximum fixed-minute volume was 24, and maximum fixed-second
volume was six. Successful-request p95 latency was approximately 152-154 ms,
with maximum 899 ms. The live route limit was 2 requests/second, burst 10;
no 429 or 5xx was observed in the window.

The recent comparison window, 2026-09-02 07:56:49 through 2026-09-03 07:56:49
UTC, contained only six calls, all HTTP 200. It does not show an ongoing fast
loop. Normal source heartbeat cadence is five minutes; queue polling is a
separate route.

The live access-log format has no client/IP, User-Agent, staff-session identity
or action. Heartbeat and logout share the route. The historical volume is
verified, but its caller, number of devices, action, cause and reasons for 401
cannot be established. Network failures that never reach the API are invisible.
This is not evidence for one six-second client or an observed ten-device
capacity incident. Broader safe observability remains in #340.

CloudWatch Insights evidence IDs:

- Day/status/latency: `2b1ebf07-7d71-4d7f-8449-9b8e61f68750`.
- Timestamp/status aggregation: `f12f4249-1b2d-43c8-99c3-8d29e0e1e723`.
- Recent 24 hours: `fab83c92-bc49-4a60-8b4f-434809265e09`.
- Fixed-second peaks: `71c50ff3-789d-4bce-956a-e742fae0b34a`.
- Exact duplicate check: `49bd6cb6-5a30-4c8e-a32f-533484f2b09e`.

## Immutable release and Park verification

[Release 33731059247](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33731059247)
passed all exact-source checks and built `bee28edcdb89a0dfc2ac5a52d95c3364a393d552`
once. Artifact `9884020961`, named
`park-test-release-bee28edcdb89a0dfc2ac5a52d95c3364a393d552`, has GitHub digest
`sha256:2b46d534fb7a2a63463d46b7302def9222dca63a8fed4fced73c98b7ecace2d8`.
An independent download passed the canonical release validator for all 505
files. Manifest SHA256 is
`7b60ad47034e7fa7b0058cfbb553397ed84988eddfd3024d7ee056df623b76ad`.
Mainline CI `33731059085` also passed.

The read-only plan in protected [Park run 33731561158](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33731561158)
was reviewed before delegated approval: 202 resources, zero added, removed or
changed resources or template sections; identical current/release template hash
`b227888a573552adb362baebbf0cd866c5e0eeec9ffab06e13e908ad191ecf07`.
Account, region and all ten WRLDS tags matched the existing Nacka environment.
Migrations were already complete through `0020`, apply was disabled, and CDK
reported `no changes`. The same package was published to immutable Park origins
`https://64acadf3.jumpyard-check-in-park-test.pages.dev` and
`https://1fdc904b.jumpyard-checkin-admin-park-test.pages.dev`.

That first run failed in the combined silent final verifier at 08:09:20 UTC.
Readback found stack `UPDATE_COMPLETE`, `IN_SYNC` at 08:08:33 UTC, and no
modified/deleted resources. The existing `jumpyard-check-in-park-test-roller-api-errors`
alarm had entered `ALARM` at 07:55:41.702 UTC, before this deployment, for two
errors in the 07:50 UTC metric period. Its history still showed `ALARM` at the
failure time; this was a sufficient zero-alarm blocker, although the silent
step does not identify which assertion failed first. All other 29 alarms were
`OK`; all four Park queues had zero visible, in-flight and delayed messages at
08:10:12-18 UTC. No alarm, queue or metric was reset, suppressed or altered.

Independent static GET readback at 08:10:03-04 UTC returned HTTP 200 for both
stable Park roots, with all 10 admin and 12 phone root-referenced JS/CSS files
byte-identical to the selected artifact. The root-referenced heartbeat and API
bundles contain the new retry and timeout behavior. This proves served files,
not a successful workflow gate or real business-flow behavior. Public
promotion was held while the Park verification failure was investigated.

Metric readback additionally found one error in the 07:55 UTC period, but no
later datapoints through 08:12:51 UTC. The alarm returned naturally to `OK` at
08:12:41.701 UTC (missing data treated as not breaching); all 30 Park alarms
were `OK` at 08:12:51.338 UTC. No recovery action altered the alarm or metric.
The same immutable release was then selected for a fresh protected Park plan
and retry; no artifact was rebuilt and no verifier gate was bypassed.

Protected [Park retry 33732205303](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33732205303)
passed after a fresh identical-template, zero-change plan and delegated
approval. CDK again reported `no changes`. Full exact-template, `UPDATE_COMPLETE`,
`IN_SYNC`, zero-alarm, empty-queue, exact Cloudflare SHA and public HTTP/config
checks passed; migrations remained complete through `0020` with apply disabled.
Final immutable Park origins are
`https://89e8c67b.jumpyard-check-in-park-test.pages.dev` and
`https://b7c331d0.jumpyard-checkin-admin-park-test.pages.dev`.

The verified, unexpired rollback candidate is the already deployed #331 release
`33726425874`, SHA `a42559bacc6d848a227a898380de2e194d433dc7`, artifact
`9882266385`, digest
`sha256:ebe3e5d06a3eda172bea54a1d3e968846dde4decee710167da68cd23f896f4a7`.
It preserves #331 and must use the same protected selected-artifact workflow,
without rebuilding. No rollback was performed.

## Public promotion and independent readback

Protected [public run 33732520551](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33732520551)
passed after its exact-artifact/public-target plan was reviewed and approved.
It promoted the same release to `https://checkin.jumpyard.se` and
`https://staff-checkin.jumpyard.se`, with no rebuild or AWS mutation. Fixed
project/domain, CORS, Cognito callback, Apple Pay association, exact Cloudflare
SHA and public HTTP/config checks passed. Immutable origins are
`https://661046ee.jumpyard-check-in-production.pages.dev` and
`https://562c81df.jumpyard-checkin-admin-production.pages.dev`.

Independent readback on 2026-09-03 at 08:18:43-47 UTC checked all four stable
Park/public roots and their exact referenced JS/CSS sets: 10/10 files on each
admin origin, 12/12 on each phone origin, all HTTP 200 and byte-identical to
the validated release. This comparison made 48 static GET requests; four further
root-only GETs at 08:19:18 UTC confirmed no additional JS/CSS references. No page
JavaScript, login or business API was executed. On both admin origins:

- Heartbeat bundle `/_next/static/chunks/06pgeqgy7~iof.js` includes the new retry
  state; SHA256 `0880d643902279bc3da0dba3b5b644eeb6a5342515cb8798bdfdb04acc9a0822`.
- API bundle `/_next/static/chunks/0086pa-zhdpzt.js` includes the new timeout and
  transport handling; SHA256 `8612778020ba490f5d050602d5c4b172b43f5762393d5d6e9968fa3ebc319e50`.

The evidence-only follow-up does not require another runtime promotion; the
deployed application SHA remains `bee28edcdb89a0dfc2ac5a52d95c3364a393d552`.
Open staff tabs must reload to execute the new code. No rollback or separate
re-promotion was performed beyond the recorded same-artifact Park retry.

## Remaining physical verification

No real staff login, Wi-Fi interruption, booking, payment, check-in, queue replay,
data mutation or load test was performed. Physical verification should use a
separately approved staff test session: briefly interrupt Wi-Fi before a
heartbeat, restore it within the existing idle deadline and confirm recovery
without a PIN prompt; then verify true logout/expiry and replacement login.

At least 100 visitors/hour, arrival peaks and shared Wi-Fi remain the park
planning assumption, not a throughput result from these unit tests or historic
logs. Guest arrivals, active staff tabs and API calls are different quantities.
Bounded retry is per tab, not a cross-device rate limiter. A sufficiently long
outage still reaches the unchanged session deadline. No capacity or fault-free
operation guarantee is made.
