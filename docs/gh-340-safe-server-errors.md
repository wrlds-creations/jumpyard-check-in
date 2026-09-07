# Issue #340: Safe server-error diagnostics

## Scope and authority

Love approved implementation on 2026-09-07 with "kör" after the explanation of the missing server-error evidence, the bounded backend change, privacy safeguards and isolated validation. The issue is [#340](https://github.com/wrlds-creations/jumpyard-check-in/issues/340).

Base: `origin/main` at `46350039b5d907b709b61a72fd42fb697bf096d5` (PR #386). Worktree/branch: `jumpyard-check-in-gh340` / `codex/gh-340-safe-server-errors`. The original checkout is preserved.

This approval covers lookup, booking and redeem diagnostics, their regression tests/loader adapters, the existing repository validation entrypoint and supporting evidence. Love subsequently approved review, commit and PR publication with "kör" on 2026-09-07. Merge and deployment remain separate approval steps. No AWS read/write, real booking/payment/redemption, guest send, provider configuration, schema, dependency or lockfile change is required for implementation or PR publication.

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

## Using the evidence after a separately approved rollout

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
- No issue #340 deployment, rollback or re-promotion run exists. Existing #335 notification routing and all infrastructure resources remain as deployed.

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

Durable changes are this evidence, the short `PROJECT_CONTEXT.md` implementation fact and D0215. `REPO_CURRENT_STATE.md` and `AWS_RESOURCES.md` have no semantic change; nothing has been merged or deployed. No new Project drafts were created. The existing normal-404 metric and worker-throttle drafts remain separate.

Commit and PR publication are authorized. The issue-backed branch is ready for PR review against the unchanged base above; GitHub owns current PR and Project status. Merge, immutable release promotion and live correlation verification remain separate steps. Local validation is not deployed evidence.
