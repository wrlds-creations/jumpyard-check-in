# Test Plan

Use this file to define validation for the current project or milestone.

## Automated Validation

| Command | Purpose | Result | Notes |
|---|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Passed | Passed on 2026-05-19. |
| `npm run roller:env:check` | Confirm Roller env guard passes for local Playground config. | Passed | Passed with local `.env`. |
| `npm run roller:smoke` | Confirm Roller Playground auth works and one read-only request can run. | Passed | Passed with local `.env`; `/products` returned HTTP 200 and 96 products on 2026-05-19. |
| Read-only booking detail check | Confirm known Playground booking lookup path. | Passed | `GET /bookings/5001370` returned HTTP 200 on 2026-05-19. |
| `npm run infra:check` | Type-check and synthesize the deploy-blocked CDK foundation with example config. | Passed | Passed on 2026-05-19. |
| `npm run infra:synth` | Synthesize JumpYard Cloud CloudFormation locally with example config. | Passed | Passed on 2026-05-19; does not deploy or require AWS credentials. |
| `npm --prefix infra audit` | Check newly added infra dependencies. | Warning | Reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; `npm audit fix` cannot repair it automatically. |
| `aws --version` | Confirm AWS CLI is installed for T0006 preflight. | Passed | Passed on 2026-05-19. |
| `aws sso login --profile wrlds-dev` | Refresh local AWS SSO credentials. | Passed | Login succeeded on 2026-05-19. |
| `aws sts get-caller-identity --profile wrlds-dev` | Confirm the active AWS identity before deploy. | Passed | Returned account `376129878018`. |
| `aws configure list --profile wrlds-dev` | Confirm active AWS profile and region before deploy. | Passed | Region `eu-north-1`. |
| `npm --prefix infra run synth:dev` | Synthesize the confirmed T0006 dev stack. | Passed | Uses non-secret dev config. |
| `npm --prefix infra run diff:dev` | Review planned dev AWS resource creation before deploy. | Passed | Pre-deploy diff showed approved foundation resources; post-deploy diff showed no differences. |
| `npm --prefix infra run deploy:dev` | Deploy approved dev foundation. | Passed | First attempt failed on Aurora `16.3`; final deploy passed with Aurora `16.13`. |
| Placeholder API smoke | Confirm deployed placeholder API responds without Roller calls. | Passed | `POST /v1/check-in/lookup` returned HTTP `501`. |

## Manual Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Source-of-truth document review | A new Codex session can understand Sprint 1 scope and constraints without chat history. | Pending | Review root source-of-truth docs. |
| No app behavior change | Existing check-in app flow remains untouched. | Pending | Confirm changed files stay outside UI/app source. |
| JumpYard Cloud contract review | The contract explains phone API, Roller endpoints, data ownership, AWS target, and open questions. | Pending | Review `JUMPYARD_CLOUD_CONTRACT.md`. |

## Roller Playground Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Credential smoke test | `npm run roller:smoke` confirms whether local Playground credentials can obtain auth and read one harmless endpoint. | Passed | Local `.env` passes guard and `/products` returns HTTP 200. |
| Expected success case | Playground-looking config and valid credentials pass. | Passed | Uses ROLLER's `https://api.play.roller.app` Playground pattern. |
| Production URL rejection | Production/live-looking URL fails before token or read request. | Passed | Production/live-looking URL was rejected before auth/read call. |
| Missing credentials failure | Missing `ROLLER_CLIENT_ID` or `ROLLER_CLIENT_SECRET` fails with a helpful message. | Passed | Blank credentials were rejected without printing secrets. |
| Known booking lookup | `GET /bookings/5001370` returns the expected Playground booking summary. | Passed | Returned booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`, status `PendingPayment`, amount owing `260`, and ticket `5001370-21265504`. |

## JumpYard Cloud Contract Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Frontend boundary | Phone app contracts point to JumpYard Cloud, not Roller. | Documented | T0003 is docs-only; implementation pending. |
| Roller lookup contract | Existing booking lookup uses `GET /bookings/{uniqueId or bookingReference}` first and `GET /bookings` as fallback. | Documented | Playground read-only check passed for booking reference `5001370`. |
| Redeem contract | Check-in is modeled as ticket-level redemption via `POST /redemptions`. | Documented | No redeem call made in T0003. |
| Add-product contract | Separate linked add-on booking is the primary existing-booking add-product pattern for the pilot. | Documented | No write call made in T0003. |
| AWS target | Proposed AWS resources are listed without creating resources. | Documented | AWS metadata still required before T0004. |
| Booking index strategy | Daily Data API seed, booking webhook updates, and live REST confirmation are documented as separate responsibilities. | Documented | Implementation pending. |
| Playground test data | Test bookings are created by protected internal tooling, not public phone UI. | Documented | Implementation pending. |
| Booking index ingestion contract | Daily seed, webhook intake/enrichment, and live REST reconciliation are documented separately. | Documented | See `BOOKING_INDEX_INGESTION_CONTRACT.md`. |

## AWS Foundation Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| CDK metadata guard | Missing `-c config=...` fails with a helpful message. | Passed | Verified on 2026-05-19. |
| CDK example synth | `npm run infra:synth` produces a template using `infra/config/dev.example.json`. | Passed | Example config is not approved for deploy. |
| Placeholder handlers | Lambda inline code returns `501` and does not call Roller. | Passed | Source uses inline placeholder code only. |
| No AWS creation | No `cdk deploy` is run and `AWS_RESOURCES.md` keeps inventory empty. | Passed | Required for T0004 only; T0006 intentionally deployed dev. |

## Booking Index Ingestion Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Daily seed contract review | Get bookings, Get tickets, Get payments, and Get customers are identified as the expected source set. | Documented | T0005 contract only. |
| Webhook contract review | Booking webhook is treated as a same-day signal with dedupe, normalized event state, and enrichment rules. | Documented | T0005 contract only. |
| Live refresh contract review | `GET /bookings/{id}` remains authoritative before check-in-critical writes. | Documented | T0005 contract only. |
| Attendance separation | Get attendance is excluded from expected-guest seed and reserved for actual arrival/redeem reconciliation. | Documented | T0005 contract only. |
| PII/raw payload review | Raw payload storage is deferred and normalized storage is preferred. | Documented | T0005 contract only. |
| Roadmap review | T0006 deploys AWS dev before schema, seed tooling, lookup endpoint, daily seed, and webhook implementation. | Documented | No AWS deploy in T0005. |

## AWS Dev Deploy Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity preflight | `aws sts get-caller-identity` returns the approved dev account id. | Passed | Returned account `376129878018`. |
| AWS region preflight | Active region matches the approved dev region. | Passed | Region `eu-north-1`. |
| WRLDS tag review | All required WRLDS tags are confirmed before deploy. | Passed | Confirmed from Bluetooth Hub dev setup and user input; written to `infra/config/dev.json`. |
| CDK diff review | `cdk diff` shows only approved T0004 foundation resources. | Passed | Pre-deploy diff matched scope; post-deploy diff shows no differences. |
| CDK deploy | Dev foundation resources are created and recorded in `AWS_RESOURCES.md`. | Passed | Stack `jumpyard-check-in-dev-stack` is `CREATE_COMPLETE`. |

## Staff Handoff Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Staff handoff flow | Staff can use a server-owned handoff code/session status. | Not started | Future ticket; no redeem logic in `T0003`. |
