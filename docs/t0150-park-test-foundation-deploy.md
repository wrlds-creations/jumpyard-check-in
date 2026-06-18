# T0150 Park-Test Foundation Deploy

Date: 2026-06-18

Ticket: `T0150`

Status: Completed. The separate park-test JumpYard Cloud AWS foundation was deployed to account `376129878018`, region `eu-north-1`.

T0150 did not populate Roller Live credentials, call Roller Live, run migrations, register webhooks, create drafts/payments, redeem tickets, send SMS/email, connect frontend traffic, or change app behavior.

## Purpose

T0150 creates the first real `park-test` AWS foundation so later tickets can migrate the dedicated database, add separate secret gates, perform read-only Roller Live checks, and eventually connect park-test frontend traffic.

The deploy follows the T0149 runbook and keeps park-test separate from dev.

## Confirmed Metadata

| Field | Value |
|---|---|
| AWS profile | `wrlds-dev` |
| AWS account | `376129878018` |
| AWS region | `eu-north-1` |
| Environment | `park-test` |
| Resource prefix | `jumpyard-check-in-park-test` |
| Stack name | `jumpyard-check-in-park-test-stack` |
| Config file | `infra/config/park-test.json` |
| Repository | `wrlds-creations/jumpyard-check-in` |
| Managed by | `cdk` |
| Data classification | `confidential` |
| Exportable | `true` |
| Cost center | `unassigned` |
| Owner / created by | `love` |

## Preflight

| Check | Result |
|---|---|
| AWS identity | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018` and role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`. |
| Dev stack | `jumpyard-check-in-dev-stack` was `UPDATE_COMPLETE`, last updated `2026-06-09T12:36:07.525000+00:00`. |
| Park-test stack before deploy | `jumpyard-check-in-park-test-stack` did not exist before deploy. |
| Config guard | `npm --prefix infra run validate:config-guards` passed. |
| Park-test synth guard | `npm --prefix infra run validate:park-test-synth` passed. |
| Infra build | `npm --prefix infra run build` passed. |
| Dev synth | `npm --prefix infra run synth:dev` passed. |
| Park-test synth | `npm --prefix infra run synth:park-test` passed. |
| Dev template diff | `npx cdk diff -c config=./config/dev.json --profile wrlds-dev --method=template` showed no differences. |
| Park-test template diff | `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` passed and showed the first additive park-test stack. |

The CDK CLI printed the existing aws-cdk-lib notice `37949`; it did not fail validation.

## Pre-Deploy Safety Fix

T0150 found that the synthesized park-test stack would have created a second `SmsDeliveryStatusAttributes` custom resource that calls SNS `setSMSAttributes`.

SNS SMS attributes are account-wide, not environment-scoped. Deploying that custom resource for park-test would have pointed account-level SMS delivery diagnostics at a park-test role and could have affected dev SMS diagnostics.

The CDK stack now creates the SNS SMS delivery-status custom resource only for `WRLDS:Environment=dev`. The park-test synth validator now proves:

- dev still includes `jumpyard-check-in-dev-sns-sms-delivery-status`;
- park-test does not include `jumpyard-check-in-park-test-sns-sms-delivery-status`.

Post-deploy, `aws sns get-sms-attributes` still showed `DeliveryStatusIAMRole=arn:aws:iam::376129878018:role/jumpyard-check-in-dev-sns-sms-delivery-status`, and no park-test SMS delivery-status role exists.

## Deploy Result

Command:

```powershell
cd infra
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
```

Result:

| Output | Value |
|---|---|
| Stack status | `CREATE_COMPLETE` |
| Stack ARN | `arn:aws:cloudformation:eu-north-1:376129878018:stack/jumpyard-check-in-park-test-stack/159bdd20-6ae4-11f1-8f4c-069284999d99` |
| API endpoint | `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |
| Aurora cluster ARN | `arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora` |
| Raw payload bucket | `jumpyard-check-in-park-test-raw-376129878018-eu-north-1` |
| Roller credentials secret name | `/jumpyard-check-in-park-test/roller/credentials` |

## Resource Summary

| Resource | Identifier |
|---|---|
| CloudFormation stack | `jumpyard-check-in-park-test-stack` |
| API Gateway HTTP API | `ij4rnaui2b` |
| API endpoint | `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |
| Aurora cluster | `jumpyard-check-in-park-test-aurora` |
| Aurora writer | `jumpyard-check-in-park-test-aurora-writer` |
| Aurora subnet group | `jumpyard-check-in-park-test-aurora-subnets` |
| VPC | `vpc-0fb3aec1a310d3600` |
| Isolated subnets | `subnet-0dfe19348e09a46be`, `subnet-0da9943155e44511d` |
| Aurora security group | `sg-0f143d36f71241c8a` |
| Raw payload bucket | `jumpyard-check-in-park-test-raw-376129878018-eu-north-1` |
| Roller operations queue | `jumpyard-check-in-park-test-roller-ops` |
| Roller operations DLQ | `jumpyard-check-in-park-test-roller-ops-dlq` |
| Event bus | `jumpyard-check-in-park-test-events` |
| Daily data sync rule | `jumpyard-check-in-park-test-data-api-daily-sync` |
| Dashboard | `jumpyard-check-in-park-test-ops` |
| Lambda handlers | `jumpyard-check-in-park-test-stack-lookup`, `jumpyard-check-in-park-test-stack-booking`, `jumpyard-check-in-park-test-stack-redeem`, `jumpyard-check-in-park-test-stack-session`, `jumpyard-check-in-park-test-stack-webhook`, `jumpyard-check-in-park-test-stack-data-sync` |
| SSM parameters | `/jumpyard-check-in-park-test/roller/env=live`, `/jumpyard-check-in-park-test/roller/base-url=https://api.roller.app` |
| Secrets | `/jumpyard-check-in-park-test/aurora/admin`, `/jumpyard-check-in-park-test/roller/credentials`, `/jumpyard-check-in-park-test/webhooks/dev-token`, `/jumpyard-check-in-park-test/redeem/dev-token`, `/jumpyard-check-in-park-test/staff/auth`, `/jumpyard-check-in-park-test/checkin-links/dev-token` |

Secret containers were created by CDK, but T0150 did not populate Roller Live credential values or print secret values.

## Post-Deploy Validation

| Check | Result |
|---|---|
| Park-test stack | `CREATE_COMPLETE`. |
| Park-test tagged resources | Resource Groups Tagging API found 54 resources tagged `WRLDS:Environment=park-test`. |
| Stack tags | All required WRLDS tags are present on the CloudFormation stack. |
| Aurora | `available`, `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion protection enabled, Data API enabled. |
| API CORS preflight | `OPTIONS /v1/check-in/lookup` from `https://park-test.jumpyard.example` returned `204` with the expected CORS headers. This did not invoke Lambda or Roller. |
| Dev stack | `jumpyard-check-in-dev-stack` remained `UPDATE_COMPLETE`. |
| Dev template diff after deploy | No differences. |
| Park-test template diff after deploy | No differences. |
| CloudWatch alarms | 17 `jumpyard-check-in-park-test-*` alarms exist and were `OK` after deploy. |
| Lambda log retention | Six park-test Lambda log groups exist with 30-day retention. |
| SNS SMS account attributes | Still point to the dev SMS delivery-status role; no park-test SMS delivery-status role exists. |

## Boundaries Preserved

- No Roller Live API call was made.
- No database migrations were run.
- No frontend deployment points to park-test yet.
- No Live webhook was registered.
- No draft, payment, redeem, SMS, or email action was executed.
- The booking-time guest messaging schedule remains absent because `bookingTimeSms.scheduleEnabled=false`.
- The daily data-sync schedule exists and is enabled, as expected from the synthesized foundation. It must remain fail-closed/no-Live-credentials until T0152/T0153 decide the next gate.

## Next Step

T0151 should apply the existing schema migrations to the dedicated park-test Aurora database and verify schema readiness. It must not touch the dev database and must not call Roller.
