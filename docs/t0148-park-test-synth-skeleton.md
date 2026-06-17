# T0148 Park-Test CDK Synth Skeleton

Date: 2026-06-17

Ticket: `T0148`

Status: Completed as a synthesis-only CDK/config skeleton. T0148 does not deploy, create credentials, call AWS, call Roller, create resources, register webhooks, create drafts/payments, redeem tickets, send SMS/email, or change app behavior.

## Purpose

T0148 adds the first synthable `park-test` infrastructure config so the planned JumpYard Nacka park-test environment can be reviewed as a separate CDK plan before any deploy approval.

The skeleton exists to prove that park-test can synthesize with separate names, tags, resource prefix, and Roller Live config while dev remains a separate Roller Playground environment.

## Added Config Surface

| Field | Value |
|---|---|
| Config file | `infra/config/park-test.json` |
| AWS account | `376129878018` |
| AWS region | `eu-north-1` |
| Resource prefix | `jumpyard-check-in-park-test` |
| Stack name | `jumpyard-check-in-park-test-stack` |
| Roller environment | `live` |
| Roller base URL | `https://api.roller.app` |
| Data classification | `confidential` |
| Booking-time guest messaging | `scheduleEnabled=false`, `confirmSend=false` |
| Email sender | Empty until a later approved sender ticket |
| CORS origins | Placeholder explicit origins only: `https://park-test.jumpyard.example`, `https://park-test-admin.jumpyard.example` |

The placeholder CORS origins make the stack synthable without wildcard origins. T0156 must replace or confirm the exact park-test phone/admin deployment origins before visitor testing.

## Separation Checks

The local synth validator `infra/scripts/validate-park-test-synth.ts` synthesizes both `infra/config/dev.json` and `infra/config/park-test.json` without AWS or Roller calls, then checks:

- dev stack name remains `jumpyard-check-in-dev-stack`;
- dev template keeps Roller Playground and `https://api.play.roller.app`;
- dev template does not contain `jumpyard-check-in-park-test`;
- park-test stack name is `jumpyard-check-in-park-test-stack`;
- park-test template uses Roller Live and `https://api.roller.app`;
- park-test template contains `WRLDS:Environment=park-test` and `WRLDS:DataClassification=confidential`;
- park-test template does not contain `jumpyard-check-in-dev`;
- park-test Secrets Manager, SSM, API, Aurora, SQS, EventBridge, CloudWatch, logs, and Lambda names use park-test names;
- park-test booking-time guest messaging schedule remains absent.

## S3 Bucket Naming Finding

CDK synth initially failed because the standard raw-payload bucket pattern:

```text
{resourcePrefix}-raw-payloads-{account}-{region}
```

would exceed S3's 63-character bucket-name limit for `jumpyard-check-in-park-test`.

T0148 updates the CDK helper so existing shorter prefixes keep the standard bucket pattern, preserving the dev bucket name, while longer prefixes use:

```text
{resourcePrefix}-raw-{account}-{region}
```

For park-test this synthesizes:

```text
jumpyard-check-in-park-test-raw-376129878018-eu-north-1
```

## Validation

- `npm --prefix infra run build` passed.
- `npm --prefix infra run validate:config-guards` passed.
- `npm --prefix infra run validate:park-test-synth` passed.
- `npm --prefix infra run synth:dev` passed.
- `npm --prefix infra run synth:park-test` passed.
- `npm run infra:check` passed.

The CDK CLI printed the existing feature-flag and aws-cdk-lib notice `37949`; it did not fail validation.

## Stop Line

T0148 is not an approval to deploy park-test. T0149 must create the deploy/rollback preflight, and T0150 still requires explicit user approval before any AWS resource creation.
