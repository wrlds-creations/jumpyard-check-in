# JumpYard Cloud Dev Operations Runbook

This runbook is the first operational response layer for the current JumpYard Cloud dev environment. It is scoped to Roller Playground and AWS dev only.

## Scope

- AWS account: `376129878018`
- AWS profile: `wrlds-dev`
- AWS region: `eu-north-1`
- Environment: `dev`
- Resource prefix: `jumpyard-check-in-dev`
- Database: Aurora PostgreSQL database `jumpyard_cloud`, schema `jumpyard`
- Public phone app: `https://jumpyard-check-in.pages.dev`
- Public staff/admin app: `https://jumpyard-checkin-admin.pages.dev`

Do not use this runbook against Roller Live or production AWS resources.

## First Response Rules

1. Confirm the environment is dev/Playground before any action.
2. Do read-only checks first: dashboard, alarms, logs, and Aurora query counts.
3. Do not blindly retry Roller writes such as draft creation, payment publish, or redemption.
4. Mask phone numbers, emails, gift cards, Klippkort codes, access tokens, and payment JWTs in screenshots and notes.
5. If a booking/payment/redeem decision is unclear, refresh from Roller REST through the existing server path before telling staff or guests to proceed.

## AWS Console Map

| Area | Where To Look | What It Tells You |
|---|---|---|
| CloudWatch dashboard | CloudWatch > Dashboards > `jumpyard-check-in-dev-ops` | API traffic, API errors, latency, Lambda errors/throttles, SQS/DLQ depth, Roller outbound calls/errors. |
| CloudWatch alarms | CloudWatch > Alarms, prefix `jumpyard-check-in-dev` | Whether API, Lambda, Roller API, throttling, or DLQ signals are firing. |
| Lambda logs | CloudWatch > Log groups > `/aws/lambda/jumpyard-check-in-dev-stack-*` | Handler-level failure details without raw secrets or raw payment JWTs. |
| API access logs | CloudWatch > Log groups > `/aws/apigateway/jumpyard-check-in-dev-api-access` | Route, status, integration status, latency, and 429 throttling rows. |
| SMS delivery logs | CloudWatch > Log groups > `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber*` | Provider delivery success/failure for SNS SMS sends. |
| Aurora data | Aurora and RDS > Query Editor | Local booking/session/delivery/event state. Use the admin secret ARN, database `jumpyard_cloud`. |
| EventBridge schedules | EventBridge > Rules, prefix `jumpyard-check-in-dev` | Daily Data API sync and booking-time message planning schedules. |

## Current Dev Signals

| Signal | Current Resource | Meaning | Safe First Action |
|---|---|---|---|
| API 5xx alarm | `jumpyard-check-in-dev-api-5xx` | Public API route is failing at gateway/integration level. | Check API access logs for route/status, then matching Lambda log group. |
| High API 4xx alarm | `jumpyard-check-in-dev-api-high-4xx` | Many client/auth/validation failures or bad public requests. | Check route distribution in access logs; verify public app version and token/config state. |
| API throttled alarm | `jumpyard-check-in-dev-api-throttled-requests` | API Gateway returned at least one 429. | Check request spike source and route; do not raise limits until abuse/traffic is understood. |
| Lambda error/throttle alarms | `jumpyard-check-in-dev-*-lambda-errors/throttles` | A specific handler is failing or concurrency-limited. | Tail that handler log group for the latest `ERROR` or timeout. |
| Roller API error alarm | `jumpyard-check-in-dev-roller-api-errors` | Any Roller-calling Lambda emitted a safe outbound error metric. | Use dashboard operation labels/logs to identify token, booking detail, costs, draft, payment, product, or redemption failure. |
| Roller ops DLQ alarm | `jumpyard-check-in-dev-roller-ops-dlq-visible` | Background Roller operation queue has dead-lettered work. | Inspect DLQ message count/age; do not replay without understanding idempotency and write type. |
| Data sync run status | `jumpyard.booking_seed_runs` | Daily Data API import succeeded/failed and counts imported rows. | Query latest scheduled rows before rerunning any import. |
| Webhook event status | `jumpyard.roller_webhook_events` | Roller webhook intake/enrichment status. | Check event status and error summary; Roller will retry non-200 failures. |
| SMS/email audit rows | `jumpyard.sms_deliveries`, `jumpyard.email_deliveries` | Planned/sent/dry-run delivery status without raw token/full destination. | Confirm dry-run vs real send, provider id, and destination mask. |
| Business event stream | `jumpyard.event_log` | Append-only safe events for draft, publish, session, messaging, and redeem flows. | Use recent event names to follow one booking across systems. |

## Flow Runbooks

### 1. Data API Daily Sync

Symptoms:

- Data sync Lambda alarm fires.
- Morning bookings are missing from Aurora.
- `booking_seed_runs` has status `failed`.
- Roller API error alarm fired around the scheduled run.

AWS checks:

```powershell
aws logs tail /aws/lambda/jumpyard-check-in-dev-stack-data-sync --profile wrlds-dev --region eu-north-1 --since 60m
```

Aurora checks:

```sql
select run_id, source, status, window_start_date, window_end_date, source_record_count,
       booking_upsert_count, ticket_upsert_count, product_upsert_count, error_summary, finished_at
from jumpyard.booking_seed_runs
order by started_at desc
limit 10;
```

Safe first action:

- If the error is `403`, check Roller Playground API key status before rerunning.
- If the error is transient 5xx/timeout, rerun a narrow dry-run backfill window first.
- Only apply backfill after confirming the window and environment.

Useful commands:

```powershell
npm.cmd --prefix infra run import:data-api-backfill:dev -- 2026-06-03 2026-06-04
npm.cmd --prefix infra run import:data-api-backfill:dev:apply -- 2026-06-03 2026-06-04
```

Escalate to Roller/Josh/Joao/Pabel when:

- Playground API access disappears from Venue Manager.
- Valid credentials suddenly return 401/403.
- Data API response shape changes or records disappear from supported endpoints.

### 2. Roller Webhook Processing

Symptoms:

- New or updated Playground bookings do not appear fresh in Aurora.
- Roller webhook alarm/log shows errors.
- `roller_webhook_events` rows are `failed` or stuck.

AWS checks:

```powershell
aws logs tail /aws/lambda/jumpyard-check-in-dev-stack-webhook --profile wrlds-dev --region eu-north-1 --since 60m
```

Aurora checks:

```sql
select event_id, event_type, booking_reference, status, enrichment_attempts,
       error_summary, received_at, processed_at
from jumpyard.roller_webhook_events
order by received_at desc
limit 20;
```

Safe first action:

- Confirm Roller webhook id `238` still points to the dev endpoint.
- Confirm the dev webhook token still matches AWS Secrets Manager.
- Use lookup/live refresh for one booking before changing webhook registration.

Escalate to Roller/Josh/Joao/Pabel when:

- Roller disables the webhook after retries.
- Header/auth behavior changes.
- Playground webhook deliveries stop despite new Venue Manager changes.

### 3. Booking Quote, Draft, Payment, Gift Card, And Klippkort

Symptoms:

- Availability loads but quote/draft fails.
- Card/Swish payment screen does not load.
- Gift card or Klippkort code is rejected unexpectedly.
- Paid booking does not continue to safety/QR.

AWS checks:

```powershell
aws logs tail /aws/lambda/jumpyard-check-in-dev-stack-booking --profile wrlds-dev --region eu-north-1 --since 60m
```

Aurora checks:

```sql
select draft_id, flow_type, status, roller_booking_reference, amount_owing_cents,
       payment_jwt_present, payment_status, created_at, updated_at
from jumpyard.prepayment_booking_drafts
order by created_at desc
limit 20;

select event_name, booking_reference, created_at
from jumpyard.event_log
where event_name like 'prepayment_%'
order by created_at desc
limit 20;
```

Safe first action:

- For `403` or auth failures, check Roller API key status before retrying.
- For payment UI issues, confirm public domain allowlisting and Roller payment settings from `GET /venues/me`.
- For gift cards, validate through `Booking Costs/Create Draft Booking`; do not use Payment Link as the main path.
- For Klippkort, treat the code as accepted only if Roller reduces `amountOwing` or returns a positive discount.
- Do not show or calculate remaining Klippkort visits locally.

Escalate to Roller/Pabel when:

- Valid gift cards stop reducing costs.
- Valid Klippkort codes stop reducing entry/session costs.
- Payment methods disappear or payment package setup fails.
- Draft/publish semantics change.

Escalate to JumpYard/Gustav when:

- Product eligibility or code coverage is unclear.
- A code should cover entry products but not add-ons and Roller product configuration disagrees.

### 4. Guest Email And Deferred SMS

Symptoms:

- Expected pre-check-in email is not planned or sent.
- Email is planned but not delivered, bounced, rejected, or complained about.
- A link opens the wrong booking state.

AWS checks:

```powershell
aws logs tail /aws/lambda/jumpyard-check-in-dev-stack-session --profile wrlds-dev --region eu-north-1 --since 60m
aws sesv2 get-account --profile wrlds-dev --region eu-north-1
aws sesv2 get-email-identity --email-identity jumpyard.se --profile wrlds-dev --region eu-north-1
aws sesv2 get-configuration-set --configuration-set-name jumpyard-check-in-park-test-email --profile wrlds-dev --region eu-north-1
aws sesv2 list-suppressed-destinations --query "length(SuppressedDestinationSummaries)" --output text --profile wrlds-dev --region eu-north-1
aws cloudwatch describe-alarms --alarm-name-prefix jumpyard-check-in-park-test-email --profile wrlds-dev --region eu-north-1
```

Aurora checks:

```sql
select delivery_id, booking_reference, status, dry_run, provider, destination_masked,
       template_id, sent_at, provider_message_id, error_summary, created_at
from jumpyard.sms_deliveries
order by created_at desc
limit 20;

select delivery_id, booking_reference, status, dry_run, provider, destination_masked,
       template_id, sent_at, provider_message_id, error_summary, created_at
from jumpyard.email_deliveries
order by created_at desc
limit 20;
```

Safe first action:

- Check whether the job is planning-only (`confirmSend=false`). T0200 keeps the booking-time schedule and application guest sends disabled.
- Before the controlled proof, confirm SES production access, `jumpyard.se`/DKIM verification, exact From/Reply-To, and that the configuration-set state matches the reviewed rollout.
- A disabled `jumpyard-check-in-park-test-email` configuration set is expected before the external gates pass; do not enable it manually in the console.
- On bounce or complaint, do not retry the destination or remove it from suppression without a separately reviewed operational reason.
- On reject or rendering failure, keep sends closed, inspect only masked audit/provider evidence, correct the cause through reviewed code/config, and rerun validation.
- Treat a bounce rate at or above 2% or a complaint rate at or above 0.05% as an early warning. Stop the controlled proof and investigate before AWS review thresholds are approached.
- SMS remains deferred for Sprint 3; if inspected, keep it inside the existing sandbox/approved-test boundary.
- Resolve `jy_token` through the public phone app only; do not share raw token values in notes.

Escalate to AWS Support when:

- SES production access, account-health review, DKIM/domain, or SES deliverability setup is needed.

Escalate to João when:

- An exact AWS-generated DKIM CNAME is missing or does not match public `jumpyard.se` DNS. Send only the three CloudFormation output name/value pairs from the protected rollout; do not request MX or mailbox changes.

Escalate to Roller only if:

- Booking contact data is missing from Roller/webhook/Data API and cannot be enriched.

### 5. Staff Handoff And Redeem

Symptoms:

- Staff login fails.
- Ready queue does not show a completed phone session.
- QR/manual code opens the wrong handoff.
- Redeem fails or is slow.

AWS checks:

```powershell
aws logs tail /aws/lambda/jumpyard-check-in-dev-stack-session --profile wrlds-dev --region eu-north-1 --since 60m
aws logs tail /aws/lambda/jumpyard-check-in-dev-stack-redeem --profile wrlds-dev --region eu-north-1 --since 60m
```

Aurora checks:

```sql
select checkin_session_id, booking_reference, status, handoff_status, handoff_code,
       safety_status, updated_at
from jumpyard.checkin_sessions
order by updated_at desc
limit 20;

select attempt_id, booking_reference, status, roller_status_code, error_summary, created_at
from jumpyard.checkin_attempts
order by created_at desc
limit 20;
```

Safe first action:

- Confirm staff is using `https://jumpyard-checkin-admin.pages.dev`.
- Confirm the booking session is `ready_for_staff`.
- If redeem fails, check whether selected tickets are already redeemed or product type is not redeemable.
- Do not rerun confirmed redeem until idempotency and Roller ticket state are understood.

Escalate to Roller/Josh/Joao/Pabel when:

- Roller `POST /redemptions` rejects tickets that should be redeemable.
- Roller booking detail conflicts with Venue Manager display.

## Severity Guide

| Severity | Example | Action |
|---|---|---|
| P0 | New bookings/payments or staff redeem fail for all guests. | Stop new write testing, check alarms/logs, notify Love/WRLDS, contact Roller or AWS if external dependency is implicated. |
| P1 | One integration path is degraded, such as webhook or daily sync. | Use manual lookup/live refresh/backfill where safe; open follow-up with exact signal and owner. |
| P2 | One booking, product, gift card, or code behaves unexpectedly. | Reproduce with read-only quote/detail first, then route to JumpYard product config or Roller support. |

## Useful Read-Only Commands

```powershell
aws cloudwatch list-dashboards --dashboard-name-prefix jumpyard-check-in-dev --profile wrlds-dev --region eu-north-1
aws cloudwatch describe-alarms --alarm-name-prefix jumpyard-check-in-dev --profile wrlds-dev --region eu-north-1
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/jumpyard-check-in-dev-stack --profile wrlds-dev --region eu-north-1
```

## Validation Commands

```powershell
npm.cmd run validate
git diff --check
```

## Park-Test Release And Rollback

Routine park-test changes are deployed from GitHub, not from an operator laptop:

1. Merge the approved Issue PR to `main` after the required `Repository`, `Infrastructure`, `Phone`, and `Admin` checks pass.
2. Open the successful **Build park-test release** run for the intended full commit SHA and note its run ID.
3. Dispatch **Deploy or roll back park-test** from `main` with that run ID, full SHA, intent, and `I_APPROVE_PARK_TEST_<full SHA>`.
4. Inspect the read-only CloudFormation plan in the run summary, then approve the protected `park-test` job.
5. Record the deployment run and post-deploy evidence in the Issue/PR.

Rollback uses the same steps with `intent=rollback` and an earlier successful release run/SHA. The old source is not rebuilt. Re-promotion selects the intended newer artifact with `intent=re-promote`. Migration apply defaults to false and may be enabled only when the approved Issue explicitly includes the pending forward-only migrations; rollback does not reverse migrations.

See [docs/t0198-controlled-cicd.md](docs/t0198-controlled-cicd.md) for exact targets, artifact contract, verification, and the emergency path. A local park-test CDK or Wrangler command is break-glass only and requires a separate explicit Issue approval and follow-up record. T0101 added the original runbook without changing AWS resources; T0198 supersedes its routine local-deploy wording for park-test.
