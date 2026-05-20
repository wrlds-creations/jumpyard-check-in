# CODEX_TASK.md

## Ticket ID

T0006

## Goal

Deploy the JumpYard Cloud CDK foundation to a real AWS `dev` environment after AWS credentials, target account/region, and required WRLDS metadata are confirmed.

## Dependencies

- T0000 completed and merged.
- T0001 completed and merged.
- T0002 completed and merged.
- T0003 completed and merged.
- T0004 completed and merged.
- T0005 completed and merged.
- `skills/aws-project-infrastructure/` must be followed for AWS governance.

## Current Status

Completed.

Preflight and deploy result on 2026-05-19:

- `aws --version` works.
- `aws sso login --profile wrlds-dev` succeeded.
- `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- `aws configure list --profile wrlds-dev` returned region `eu-north-1`.
- Bluetooth Hub confirms the shared JumpYard dev target account `376129878018`, region `eu-north-1`, and local deploy profile `wrlds-dev`.
- User confirmed `JumpYard`, `jumpyard-check-in`, `dev`, `love`, and `love` as created-by metadata for this project.
- First deploy attempt failed on Aurora PostgreSQL `16.3`, rolled back, and its retained empty S3 bucket was deleted.
- Aurora engine version was changed to `16.13`, which is available in `eu-north-1`.
- Final CDK deploy completed successfully.
- Post-deploy `cdk diff` shows no differences.
- Placeholder API smoke check returned HTTP `501` as expected.

Confirmed T0006 dev config:

- AWS account id: `376129878018`
- AWS profile/login method: `wrlds-dev`
- AWS region: `eu-north-1`
- Environment: `dev`
- Resource prefix: `jumpyard-check-in-dev`
- `WRLDS:Client`: `JumpYard`
- `WRLDS:Project`: `jumpyard-check-in`
- `WRLDS:Owner`: `love`
- `WRLDS:Repository`: `wrlds-creations/jumpyard-check-in`
- `WRLDS:ManagedBy`: `cdk`
- `WRLDS:DataClassification`: `internal`
- `WRLDS:Exportable`: `true`
- `WRLDS:CostCenter`: `unassigned`
- `WRLDS:CreatedBy`: `love`

Deploy outputs:

- Stack: `jumpyard-check-in-dev-stack`
- API endpoint: `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`
- Aurora cluster ARN: `arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-dev-aurora`
- Raw payload bucket: `jumpyard-check-in-dev-raw-payloads-376129878018-eu-north-1`
- Roller credentials secret name: `/jumpyard-check-in-dev/roller/credentials`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- `infra/config/` for a confirmed non-secret dev deploy config
- `infra/` CDK files only if needed to make the existing foundation deploy safely

## Do Not Touch

- App source code
- UI files
- Assets
- Deliverables
- Roller write integration code
- Production credentials
- `.env`
- GitHub deployment workflows unless explicitly requested
- Staging or production AWS resources

## Requirements

1. Confirm AWS deploy target before any resource creation:
   - AWS account id
   - AWS profile/login method
   - AWS region
   - environment name
2. Confirm required WRLDS tags:
   - `WRLDS:Client`
   - `WRLDS:Project`
   - `WRLDS:Environment`
   - `WRLDS:Owner`
   - `WRLDS:Repository`
   - `WRLDS:ManagedBy`
   - `WRLDS:DataClassification`
   - `WRLDS:Exportable`
   - `WRLDS:CostCenter`
   - `WRLDS:CreatedBy`
3. Create or update a non-secret dev deploy config in `infra/config/`.
4. Run local validation:
   - `npm run validate`
   - `npm run infra:check`
   - `npm run infra:synth`
5. Run AWS preflight:
   - `aws sts get-caller-identity`
   - verify AWS account id matches the confirmed target
   - verify region matches the confirmed target
6. Run `cdk diff` for review before deploy.
7. Deploy only the T0004 placeholder foundation:
   - API Gateway HTTP API
   - placeholder Lambdas
   - Secrets Manager placeholder secret
   - SSM non-secret Roller Playground config
   - Aurora PostgreSQL Serverless v2
   - S3 raw payload bucket
   - SQS queue and dead-letter queue
   - EventBridge event bus
   - CloudWatch log groups
8. Update `AWS_RESOURCES.md` with actual created resource details.
9. Update source-of-truth docs with validation/deploy result.

## Non-Goals

- Do not implement API business logic.
- Do not connect phone/kiosk/admin apps to AWS.
- Do not add Aurora schema/migrations.
- Do not create Playground fake bookings.
- Do not call Roller writes.
- Do not create, update, redeem, or pay Roller bookings.
- Do not create staging or production AWS resources.
- Do not add production credentials.

## Acceptance Criteria

- Required AWS target and WRLDS metadata are confirmed before deploy.
- CDK synth and diff run successfully.
- CDK deploy creates only the approved `dev` foundation resources.
- `AWS_RESOURCES.md` lists the created resources.
- No app code, UI, assets, deliverables, Roller write logic, `.env`, or production config is changed.

## Manual Verification

After deploy, confirm:

- AWS account id matches the approved dev account.
- Region matches the approved dev region.
- API Gateway endpoint exists.
- Placeholder Lambdas exist and return `501` / not implemented.
- Aurora, S3, SQS/DLQ, EventBridge, SSM, Secrets Manager, and CloudWatch resources exist with WRLDS tags.
- No Roller credentials or production secrets are committed.

## Automated Validation

Run before deploy:

- `npm run validate`
- `npm run infra:check`
- `npm --prefix infra run synth:dev`
- `npm --prefix infra run diff:dev`

Run after deploy:

- `cdk diff` should show no unexpected changes
- API placeholder smoke check if endpoint output is available
