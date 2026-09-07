# Issue #340: Safe server-error diagnostics

## Scope and authority

Love approved implementation on 2026-09-07 with "kör" after the explanation of the missing server-error evidence, the bounded backend change, privacy safeguards and isolated validation. The issue is [#340](https://github.com/wrlds-creations/jumpyard-check-in/issues/340).

Base: `origin/main` at `46350039b5d907b709b61a72fd42fb697bf096d5` (PR #386). Worktree/branch: `jumpyard-check-in-gh340` / `codex/gh-340-safe-server-errors`. The original checkout is preserved.

This approval covers lookup, booking and redeem diagnostics, their regression tests/loader adapters, the existing repository validation entrypoint and supporting evidence. Love subsequently approved review, commit and PR publication with "kör", then explicitly approved "kör merge och driftsättning" on 2026-09-07. The latter authorizes the existing immutable Park/public promotion path and its reviewed protected approvals. It does not authorize real booking/payment/redemption, guest sends, provider configuration, schema, dependency or lockfile changes.

## Implemented contract

- Each completed invocation returning HTTP 500–599 emits one structured `cloud.server_error` record. A caught exception and an explicit 502 response both receive coverage. A nested staff-to-internal redeem call shares the outer invocation and emits once.
- `operation` is a source-owned name such as `lookup`, `quote`, `draft`, `add_product_draft` or `staff_redeem`. `stage` identifies the observed boundary: configuration, database, ROLLER authentication/read/write/redemption, normalization, guest access or reconciliation. The deepest observed throwing boundary wins over its caller.
- Exception classes and categories are allowlisted. Categories distinguish configuration, database, provider, timeout, invalid response and application errors. Known explicit refresh failures are classified even when their existing response status is `blocked`. A category identifies an investigation boundary; it does not prove a provider's internal root cause.
- API Gateway `requestId` connects the report to the existing API access log. Lambda `lambdaRequestId` connects it to runtime logs. `diagnosticId` is a fresh server-generated UUID and also appears as ordinary metadata on existing ROLLER API metric log records.
- Caller correlation values remain unchanged in API responses and the existing application audit contract. Diagnostic reports store only their SHA-256 hash, because a syntactically valid caller id could contain a name, PIN or other sensitive text. Neither the raw value nor any request body/header is copied into the report.
- Error message, stack, arbitrary error code/name, SQL, database parameters, URLs, booking/customer/payment/session/terminal ids, raw provider responses and credentials are excluded. Numeric provider HTTP status may be included when the returned error actually concerns the provider.
- Expected 2xx/4xx outcomes produce no new server-error report. Existing `RollerApiCallCount`/`RollerApiErrorCount` values, dimensions and alarm behavior remain unchanged. In particular the known normal-404 metric issue stays in its existing Project draft.
- The existing nonfatal redeem-bookkeeping warning now uses the same safe classification and correlation fields, retaining warning severity and the successful redemption response. Unknown error names/codes are omitted rather than copied.
- Request state uses Node's built-in `AsyncLocalStorage`; overlapping requests/dependencies and reused Lambda instances cannot borrow each other's error context. No retry, timeout, sleep, provider call, database call or business operation is added. A logger failure cannot change the original result.
- The same dependency-free helper is packaged in the three existing standalone Lambda asset directories. Tests enforce byte equality; CDK asset boundaries and resource definitions are unchanged. Existing isolated test loaders load the real helper, not a mock implementation.

## Using the deployed evidence

Use a short incident time window and select only the existing lookup, booking and redeem Lambda log groups. Safe aggregate summary in CloudWatch Logs Insights:

```text
fields @timestamp, eventType, handler, operation, stage, failureCategory
| filter eventType = "cloud.server_error"
| stats count(*) as errors by handler, operation, stage, failureCategory
```

For the relevant interval, inspect the safe request-level fields:

```text
fields @timestamp, handler, operation, stage, failureCategory, failureClass,
       statusCode, providerStatusCode, requestId, lambdaRequestId, diagnosticId
| filter eventType = "cloud.server_error"
| sort @timestamp desc
| limit 50
```

Select a returned API Gateway request id and search that exact value in the API access log and Lambda logs. API access records already include `requestId` and HTTP status. Existing ROLLER metric log records now carry the same `requestId` and `diagnosticId`, so their operation/status evidence can be joined without booking or guest identifiers. If only a caller correlation id is available, hash the exact value locally and search `correlationIdHash`; do not paste the raw caller value into a persisted query.

The existing #335 `api-5xx` and sustained ROLLER alarm routes continue to notify Love. This issue adds no alarm, subscription, metric dimension or custom metric. Counts above are computed from logs. Additional log storage consists of one bounded report per server failure and three fixed-length tracing fields on each existing provider metric record; no measured cost or capacity claim is made.

## Validation

The dedicated suite exercises the actual exported handlers with isolated AWS/provider adapters: database faults in all three handlers; explicit provider 429/500/503; authentication failure; fetch/body timeout and malformed JSON; missing configuration; 404 and invalid input; successful and failed quotes; safe nonfatal bookkeeping; nested redeem; overlapping dependencies; reused invocation state; 40 overlapping lookup requests; and a failing logger. Canary contact/PIN/token/payload/error values must not appear in diagnostic output. The existing #333 recovery suite verifies that a bookkeeping fault cannot undo an accepted redemption.

Commands and final results are recorded in the local-validation closeout below. All provider and database effects in these tests are synthetic. Production traffic, iPhone, park Wi-Fi and live CloudWatch correlation have not been exercised.

## Limits and release boundary

- A platform timeout, process crash, out-of-memory termination or initialization/import failure can prevent application code from running this reporter. Existing API Gateway/Lambda metrics and runtime logs remain the evidence for those cases. This issue does not add a request deadline or solve #342.
- The report supplies a safe category and stage, not unrestricted stack traces or SQL details. Some application failures still require source inspection from the deployed commit.
- A nonfatal provider failure already handled by fallback can retain its original provider metric without becoming a new server-error report. This preserves catalog resilience and ordinary 404 behavior.
- New diagnostics become available only after a reviewed PR and an explicitly authorized immutable release/protected Park promotion. The corresponding deployed request-id join must then be verified with existing safe evidence; no artificial live failure or business transaction is authorized here.
- The rollout evidence below records release and deployment runs. Existing #335 notification routing and the resource inventory are preserved.

## Local-validation closeout

Completed on 2026-09-07:

- `npm run validate:gh340-server-errors`: 23 tests passed, zero failures/skips. The 40-request scenario is an isolated correlation/concurrency check, not a claim about physical park capacity.
- `npm run validate`: passed the complete repository pipeline, including existing payment, staff, safety, guest access, webhook, lifecycle, catalog and notification contracts.
- `npm run infra:check`: passed TypeScript, infrastructure/configuration/security validators, isolated operator self-tests and CDK synth.
- `node scripts/validate-gh333-staff-redeem-recovery.js`: all existing recovery cases passed after replacing its expectation of an arbitrary error code with the safe database category.
- `node scripts/validate-gh339-addon-catalog.js` and `node scripts/validate-gh341-catalog-availability.js`: all catalog/fallback cases passed (3 and 14 respectively).
- `node --check` for all three edited handlers and `git diff --check`: passed.
- Manual source review confirmed no change to frontend, business outcomes, call counts, dependencies, lockfiles, CDK/configuration, permissions, gates or schema. The original checkout remains clean.

The first repository run stopped at the existing Windows context-size issue: CRLF checkout lengths were 12,058/12,045 characters while the identical committed LF documents were 11,950/11,960. Validation was rerun with the committed LF representation; no context content was removed, validator relaxed or new cleanup scope implemented. The new #340 context line also stays within the committed-text limit. The existing Project draft about Windows line endings already owns that validator issue.

At implementation closeout, durable changes were this evidence, the short `PROJECT_CONTEXT.md` implementation fact and D0215. `REPO_CURRENT_STATE.md` and `AWS_RESOURCES.md` were unchanged before merge and deployment. No new Project drafts were created. The existing normal-404 metric and worker-throttle drafts remain separate.

Reviewed [PR #387](https://github.com/wrlds-creations/jumpyard-check-in/pull/387) merged as `11fdcb3d82f10fbc011a0161d59ede73e6146544` under Love's later merge/deployment instruction. All four PR and merged-main CI jobs passed. The following rollout record distinguishes deployed evidence from the synthetic failure tests above.

## Protected rollout — 2026-09-07

Love's explicit instruction was "kör merge och driftsättning". The implementation PR merged at `2026-09-07T08:57:26Z`. The existing protected workflow performed every AWS/Cloudflare mutation; no local CDK/Wrangler deployment, rebuild during promotion, migration apply or real business transaction occurred.

| Evidence | Result |
|---|---|
| Immutable release | [34103357175](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34103357175), exact SHA `11fdcb3d82f10fbc011a0161d59ede73e6146544` |
| Artifact | `10011585061`, digest `sha256:ffd631f0fea1d3fedcda5f812af9046512347f6a3d500eff80c0d0be01fee5d3`; all 595 checksums passed locally and in the workflow |
| Manifest | SHA-256 `63812a3c28a7102dfc1661aafa95de312f2af542a29731a11fc2715c6c825786` |
| Park promotion | [34104000787](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34104000787), successful |
| Public promotion | [34104120749](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34104120749), successful; same immutable phone/admin outputs |
| Prior rollback candidate | Successful, unexpired release `33880879052`, SHA `32fcb57f0c3a9aa88b331dc7ebf9403b5c0e0eef`, artifact `9939991649` (expires 2026-12-03) |

The actual Park plan was downloaded and independently reproduced against live AWS before approval. Both showed 205 resources before/after, no additions/removals or section changes, and changes only to `Properties.Code.S3Key` and `Metadata.aws:asset:path` for `BookingHandler5D1461BB`, `LookupHandler5950B7B5` and `RedeemHandler3A94EE00`. Current template hash was `45be018ca5b478d3b1e1962135df2370356044dce4a66d52e9f885af902c6abe`; selected/deployed hash is `12f145b9b225ec4abb84845c0e1add67c8d6c1cd7d5c7ad3fac0be2e441ac3eb`. Both protected approvals identify the exact SHA, run, targets and reviewed scope. Public approval followed successful Park verification.

Confirmed metadata: client/cost center `JumpYard`; project `jumpyard-check-in`; environment `park-test`; owner/creator `love`; repository `wrlds-creations/jumpyard-check-in`; managed by `cdk`; classification `confidential`; exportable `true`; account `376129878018`; region `eu-north-1`. Nacka venue/date scope, IAM, configuration, schema, alarms and runtime gates are unchanged. Migrations remain applied through `0020`, with apply disabled.

Independent readback fetched the deployed template and the three Lambda code archives, validated each AWS code hash and byte-compared every packaged file to the selected artifact. Lookup/Booking/Redeem matched 3/6/2 files respectively, were `Active`, and had `LastUpdateStatus=Successful`. All copies of `server-diagnostics.js` have SHA-256 `fc721e5179575b8ebfd0916435ac5cee3ae02c08657da641597824789a9304c7`. No function environment values or signed code-download URLs were printed or persisted.

The protected verifier passed template equality, successful stack status, `IN_SYNC` drift, zero alarms in `ALARM`, empty queues, exact-SHA Pages, HTTP/domain/CORS/Cognito/Apple association checks and migration status. Independent Node HTTP readback byte-matched 30 responses per lane (60 total), covering phone, staff/admin and auth callback HTML, referenced JS/CSS and Apple association. A preliminary Python client received Cloudflare 403; the repository's standard Node HTTP verifier and byte comparisons passed without changing any access policy.

A malformed-JSON request to the deployed `POST /v1/check-in/lookup` returned the expected `400 invalid_request / invalid_json`, before database/provider calls. The returned request id `DUjlZh0YAi0EQpw=` matched the API access record at `2026-09-07T09:11:23.631Z`, with the exact route and status 400, after allowing for log ingestion. An initial manual probe used the nonexistent `/v1/bookings/lookup` and returned API Gateway 404; the live probe and isolated test fixtures were corrected to the declared routes. These checks made no booking, payment, redemption or guest-send action. The fixture correction changes no deployed runtime code; all 23 diagnostics tests passed again, along with documentation/resolver, AWS-tag and whitespace validators.

The bounded CloudWatch query over the three Lambda log groups for `09:07:15–09:09:58 UTC` returned no diagnostic records (zero records scanned). No natural 5xx correlation is claimed from that short sample; log ingestion and absence of traffic limit the observation. The safe failure categories, redaction and 5xx correlation chain are proven by the isolated tests, while deployment identity and ordinary invalid-input handling are proven live. Platform termination and initialization failures remain outside the application reporter's coverage.

`AWS_RESOURCES.md` records the code update and `REPO_CURRENT_STATE.md` records the merged/deployed version. D0215 and the implementation context fact remain unchanged. No new Project draft, rollback or re-promotion was required. Supporting local records are under `%TEMP%/jumpyard-gh340-validation-20260907`; these Actions runs and this document are the durable rollout evidence.
