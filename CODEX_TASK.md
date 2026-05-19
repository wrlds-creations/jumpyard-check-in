# CODEX_TASK.md

## Ticket ID

T0004

## Goal

Create the deploy-blocked JumpYard Cloud AWS foundation as Infrastructure as Code, without creating real AWS resources or adding Roller write behavior.

## Dependencies

- T0000 completed and merged.
- T0001 completed and merged.
- T0002 completed and merged.
- T0003 completed and merged.
- `skills/aws-project-infrastructure/` must be followed for AWS governance.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- `README.md`
- `.gitignore`
- `package.json`
- New `infra/` folder for AWS CDK TypeScript foundation

## Do Not Touch

- App source code
- UI files
- Assets
- Deliverables
- Roller write integration code
- Production credentials
- `.env`
- Real AWS resources
- GitHub deployment workflows unless explicitly requested

## Requirements

1. Add a TypeScript AWS CDK foundation under `infra/`.
2. Include a required WRLDS metadata/tag guard before synth.
3. Provide an example dev config that can synthesize locally but is clearly not a deployment credential/config source.
4. Define the first JumpYard Cloud resource shape:
   - API Gateway HTTP API
   - Lambda placeholder handlers for lookup, booking, redeem, and webhooks
   - Secrets Manager placeholder for Roller credentials
   - SSM parameters for non-secret Roller Playground config
   - Aurora PostgreSQL Serverless v2 operational database
   - S3 raw payload bucket
   - SQS queue and dead-letter queue for serialized Roller operations
   - EventBridge event bus
   - CloudWatch log retention for Lambdas
5. Lambda placeholders must not call Roller and must return a not-implemented response.
6. Add local validation commands:
   - `npm run infra:check`
   - `npm run infra:synth`
7. Update source-of-truth docs with:
   - T0004 scope
   - no resources created
   - metadata still required before first deploy
   - recommended next ticket: T0005 Booking index ingestion contract

## Non-Goals

- Do not deploy to AWS.
- Do not run `cdk deploy`.
- Do not create or change real AWS resources.
- Do not implement API business logic.
- Do not connect the phone app to JumpYard Cloud.
- Do not implement Roller API writes.
- Do not create, update, redeem, or pay Roller bookings.
- Do not add production credentials.

## Acceptance Criteria

- `infra/` contains a CDK TypeScript app for the JumpYard Cloud foundation.
- Required WRLDS metadata is validated before synth.
- Example synth works without AWS credentials.
- Root scripts expose infra validation.
- `AWS_RESOURCES.md` clearly states that no real AWS resources exist yet.
- `REPO_CURRENT_STATE.md` marks T0004 and recommends T0005.
- No app code, UI, assets, deliverables, Roller write logic, `.env`, or real AWS resources are changed.

## Manual Verification

Confirm the synthesized architecture matches the T0003 contract:

- phone-facing API boundary exists as API Gateway routes.
- Lambda handlers are placeholders only.
- Roller credentials are represented as a Secrets Manager secret, not committed values.
- Aurora, S3, SQS, EventBridge, and CloudWatch are defined but not deployed.
- Required WRLDS tags are represented in config and applied in CDK.

## Automated Validation

Run:

- `npm run validate`
- `npm run infra:check`
- `npm run infra:synth`
