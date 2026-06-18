# T0149 Park-Test Deploy And Rollback Preflight

Date: 2026-06-18

Ticket: `T0149`

Status: Completed as a deployment and rollback preflight/runbook. T0149 did not deploy park-test, populate credentials, call Roller, run migrations, register webhooks, create drafts/payments, redeem tickets, send SMS/email, or change app behavior.

## Purpose

T0149 defines the required preflight and rollback steps before the first `park-test` AWS foundation deploy in T0150.

The intended environment remains the T0146/T0148 target: a separate `park-test` JumpYard Cloud stack in the existing AWS account and region, using separate resources from dev and targeting Roller Live only through server-side JumpYard Cloud code after later gates approve it.

## Confirmed Target

| Field | Value |
|---|---|
| AWS profile | `wrlds-dev` |
| AWS account | `376129878018` |
| AWS region | `eu-north-1` |
| Environment | `park-test` |
| Resource prefix | `jumpyard-check-in-park-test` |
| Stack name | `jumpyard-check-in-park-test-stack` |
| Config file | `infra/config/park-test.json` |
| Roller target in config | `live` / `https://api.roller.app` |
| Data classification | `confidential` |
| Exportable | `true` |
| Cost center | `unassigned` |
| Owner / created by | `love` |
| Repository | `wrlds-creations/jumpyard-check-in` |
| Managed by | `cdk` |

Required WRLDS tags for park-test remain:

| Tag | Value |
|---|---|
| `WRLDS:Client` | `JumpYard` |
| `WRLDS:Project` | `jumpyard-check-in` |
| `WRLDS:Environment` | `park-test` |
| `WRLDS:Owner` | `love` |
| `WRLDS:Repository` | `wrlds-creations/jumpyard-check-in` |
| `WRLDS:ManagedBy` | `cdk` |
| `WRLDS:DataClassification` | `confidential` |
| `WRLDS:Exportable` | `true` |
| `WRLDS:CostCenter` | `unassigned` |
| `WRLDS:CreatedBy` | `love` |

## T0149 Preflight Evidence

| Check | Result |
|---|---|
| AWS SSO | `aws sso login --profile wrlds-dev` succeeded. |
| AWS identity | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018` and assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`. |
| Dev stack | `jumpyard-check-in-dev-stack` exists in `eu-north-1` and is `UPDATE_COMPLETE`; last updated `2026-06-09T12:36:07.525000+00:00`. |
| Park-test stack | No park-test stack exists after T0149 cleanup, as expected before T0150 deploy. |
| Config guards | `npm --prefix infra run validate:config-guards` passed. |
| Park-test synth guard | `npm --prefix infra run validate:park-test-synth` passed. |
| Dev synth | `npm --prefix infra run synth:dev` passed. |
| Park-test synth | `npm --prefix infra run synth:park-test` passed. |
| Infra check | `npm run infra:check` passed. |
| Dev template diff | `npx cdk diff -c config=./config/dev.json --profile wrlds-dev --method=template` passed with `There were no differences` and `Number of stacks with differences: 0`. |
| Park-test template diff | `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` passed and showed one new stack with additive resources only. |

The CDK CLI printed the existing aws-cdk-lib notice `37949`; it did not fail validation.

## CDK Diff Handling

For the first never-deployed `park-test` stack, use template diff during preflight:

```powershell
cd infra
npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template
```

Do not run park-test and dev CDK commands in parallel from the same `infra/cdk.out` directory; local synth lock files can collide.

Avoid the default change-set diff for the first park-test preflight unless the reviewer explicitly accepts CDK's new-stack behavior. T0149 found that a default `cdk diff` for a never-deployed stack can leave an empty CloudFormation stack shell in `REVIEW_IN_PROGRESS`. The T0149 shell had no stack resources and no change sets, and it was deleted immediately. Post-cleanup lookup confirmed the stack no longer exists.

## T0150 Deploy Preflight

Before any `cdk deploy` in T0150:

1. Confirm the user explicitly approves AWS resource creation for T0150 in the current conversation.
2. Run `aws sso login --profile wrlds-dev` if the SSO session is stale.
3. Run `aws sts get-caller-identity --profile wrlds-dev --output json` and confirm account `376129878018`.
4. Confirm the intended region is `eu-north-1`.
5. Confirm `AWS_RESOURCES.md` has been read in the ticket.
6. Confirm `skills/aws-project-infrastructure/` has been read in the ticket.
7. Confirm WRLDS metadata: client, project, environment, owner, repository, tags, data classification, exportability, and cost center.
8. Confirm `infra/config/park-test.json` still uses `WRLDS:Environment=park-test`, `WRLDS:DataClassification=confidential`, and resource prefix `jumpyard-check-in-park-test`.
9. Confirm no `jumpyard-check-in-park-test-stack` exists before the first deploy, or stop and explain why it exists.
10. Run local validation:

```powershell
npm --prefix infra run validate:config-guards
npm --prefix infra run validate:park-test-synth
npm --prefix infra run synth:dev
npm --prefix infra run synth:park-test
npm run infra:check
```

11. Run sequential template diffs:

```powershell
cd infra
npx cdk diff -c config=./config/dev.json --profile wrlds-dev --method=template
npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template
```

12. Dev diff must show no differences unless the active ticket explicitly approves a dev change.
13. Park-test diff must show only the expected first-stack additions under the park-test namespace.
14. Review that the park-test template includes separate API, Aurora, Secrets Manager names, SSM parameters, SQS/DLQ, EventBridge, CloudWatch, S3, logs, IAM roles, and Lambda names.
15. Confirm no Roller Live credentials have been populated before the owning ticket.
16. Confirm booking-time guest messaging remains unscheduled for park-test and `bookingTimeSms.confirmSend=false`.
17. Confirm the daily data-sync rule is either accepted as fail-closed/no-Live-credentials until later tickets, or explicitly disabled by an approved T0150/T0152 change before deploy.
18. Confirm placeholder CORS origins are accepted only for non-visitor infrastructure deploy; T0156 must replace or confirm real phone/admin origins before visitor traffic.
19. Confirm the exact deploy command before running it. A likely T0150 command is:

```powershell
cd infra
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
```

Do not add a permanent deploy script unless the deploy ticket explicitly scopes that change.

## Stop Criteria

Stop T0150 before deploy if any of these are true:

- AWS identity is not account `376129878018`.
- Region is not `eu-north-1`.
- `jumpyard-check-in-dev-stack` has unexpected drift or a non-ready status.
- Dev template diff shows unapproved changes.
- Park-test stack already exists unexpectedly.
- Park-test resources do not use the `jumpyard-check-in-park-test` namespace.
- Required WRLDS tags are missing or have wrong values.
- Park-test data classification is not `confidential`.
- Park-test config points to Roller Playground, or dev config points to Roller Live.
- Any deploy path would reuse dev API, dev Aurora, dev secrets, dev SSM parameters, dev queues, dev schedules, or dev frontend API target.
- Roller Live credentials are present or are about to be populated before T0152/T0153 approval.
- Any Live read or write would occur before its owning ticket.
- Webhook registration, draft creation, payment, redeem, SMS/email send, or visitor traffic is being bundled into T0150.
- The data-sync schedule behavior is not explicitly accepted or disabled for park-test.
- The placeholder CORS origins are being used for real visitor testing instead of infrastructure-only deploy.
- Rollback owner, cleanup plan, and post-deploy smoke are not agreed before deploy.

## Post-Deploy Smoke For T0150

After a successful T0150 deploy, run only foundation-level checks:

- Confirm CloudFormation stack status is `CREATE_COMPLETE`.
- Record the park-test API endpoint and generated resource identifiers in `AWS_RESOURCES.md`.
- Confirm all created resources are tagged with the required WRLDS tags.
- Confirm dev stack still reports `UPDATE_COMPLETE`.
- Confirm dev template diff remains clean after the park-test deploy.
- Hit only a safe health or no-side-effect endpoint if one exists and the route behavior is explicitly approved in T0150.
- Do not call Roller Live, run migrations, populate credentials, register webhooks, create drafts/payments, redeem tickets, or send messages.

## Rollback Plan

### Before Traffic

If T0150 deploy fails or the stack is created but no frontend points to it yet:

- Stop further changes and preserve CloudFormation events.
- Confirm whether CloudFormation already rolled back.
- If a stack remains and the rollback decision is approved, delete only `jumpyard-check-in-park-test-stack`.
- Verify no park-test API endpoint is used by phone/admin.
- Verify dev stack and dev API remain unchanged.
- Record the rollback result in `AWS_RESOURCES.md` and `docs/history/validation-log.md`.

### Frontend

Park-test frontend rollback should be independent from dev:

- Repoint or remove the park-test phone/admin deployment environment variable for `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL`.
- Keep the existing dev phone/admin deployments pointing to the dev API.
- Do not fork frontend source code to undo a park-test target problem.
- If a Cloudflare deployment was created later, roll back that deployment or disable the park-test route without touching dev.

### API And Stack

- Remove traffic first by disabling frontend/API target references.
- If the park-test API itself is unsafe, delete or roll back `jumpyard-check-in-park-test-stack` only after approval.
- Do not delete or modify `jumpyard-check-in-dev-stack`.
- Preserve logs/events long enough to understand the failure unless deletion is the safer approved action.

### Live-Write Gates

- Keep Live write gates off unless their owning ticket enables them.
- If a later ticket enables a gate, rollback starts by flipping that specific park-test gate off.
- Do not use dev tokens or dev secrets as park-test emergency switches.

### Secrets Rotation

- If any park-test secret is exposed, rotate that park-test secret immediately.
- If Roller Live client credentials, webhook tokens, staff auth, or message-provider secrets are involved, rotate the external provider credential too.
- Never reuse dev/Playground secrets in park-test.
- Do not print secret values in logs, docs, PRs, or chat.

### Webhook Removal

No Live webhook exists from T0149/T0150. If T0155 later registers one, rollback must:

- Record the Roller webhook id when it is created.
- Disable or delete that specific Roller Live webhook registration.
- Verify duplicate registrations do not remain.
- Keep the dev Playground webhook `238` untouched.

### Schedule Shutdown

- Disable park-test EventBridge schedules before deleting shared dependencies or investigating repeated failures.
- The daily data-sync rule is expected in the synthesized stack, but it must not be allowed to make unsafe Live calls before the later Live-read/secrets gates.
- Booking-time guest messaging remains unscheduled for park-test in T0148/T0149.
- If any later ticket enables guest messaging, rollback must disable the park-test schedule and set send confirmation gates off before cleanup.

### Migrations

T0149 and T0150 must not run migrations. T0151 owns park-test schema migration.

Before T0151 applies migrations, define backup/restore handling for the park-test database. If a migration fails, stop, capture `schema_migrations`, CloudFormation, and Aurora evidence, and restore or repair only the park-test database through the approved T0151 rollback path.

## Known Follow-On Decisions

- T0150 must decide whether to accept the data-sync rule's fail-closed behavior before credentials/migrations, or change the park-test schedule behavior in scope.
- T0151 must reconcile the documented migration drift where one top-level AWS status sentence says dev migrations through `0007`, while the schema inventory and migration files show `0008`.
- T0152 owns separate secret references and explicit Live write kill switches.
- T0153 is the first ticket allowed to read Roller Live.
- T0156 must replace or confirm the real park-test phone/admin CORS origins before visitor testing.

## Conclusion

Park-test is ready for an explicitly approved T0150 foundation deploy preflight, not for deploy inside T0149. The current safe next step is to open T0150, reconfirm AWS identity and metadata, run sequential template diffs, review the expected additive park-test resources, and only then deploy if the user explicitly approves AWS resource creation.
