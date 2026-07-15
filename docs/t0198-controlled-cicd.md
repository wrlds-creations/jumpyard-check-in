# T0198 Controlled CI/CD And Versioned Rollback

## Outcome

Park-test uses GitHub as the routine release control plane. A reviewed commit is built once, stored as one hashed artifact, planned against the current AWS target with a read-only identity, approved through the protected `park-test` environment, and deployed to AWS plus both Cloudflare Pages projects without rebuilding.

Production is not represented in these workflows. The existing Nacka `50871` full-flow profile and operating dates through `2026-09-30` are the only deployable application posture.

## Control Flow

```text
Issue -> PR CI -> merge to main -> immutable release artifact
                                      |
                                      v
                            read-only AWS plan
                                      |
                                      v
                         protected park-test approval
                                      |
                                      v
                   migrations (explicit) -> CDK -> Pages
                                      |
                                      v
                          exact post-deploy checks
```

Rollback is the same lower half of the flow with an earlier successful artifact. It is not a fresh build of an old branch.

## Exact Targets

| Target | Required value |
|---|---|
| Repository | `wrlds-creations/jumpyard-check-in` |
| Source | Full commit SHA reachable from `main` |
| GitHub environment | `park-test` |
| AWS account / region | `376129878018` / `eu-north-1` |
| Application stack | `jumpyard-check-in-park-test-stack` |
| Release config | `infra/config/park-test-full-flow-rehearsal.json` |
| API | `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |
| Phone Pages project | `jumpyard-check-in-park-test` |
| Admin Pages project | `jumpyard-checkin-admin-park-test` |
| Cloudflare account | `dc0a3855bc8a0b1db8fc27ee62bf7d40` |

The manifest validator fails closed if any value, approved gate, Nacka venue, or full-flow end date differs. The artifact contains the CDK cloud assembly and Lambda assets, phone/admin static outputs, exact migration runner/config/SQL, `manifest.json`, and a checksum for every file. Hidden output such as the Apple Pay association directory is included. GitHub retains the artifact for 90 days.

## Workflows

### Pull Request CI

`.github/workflows/ci.yml` runs repository contracts, infrastructure checks plus both synth targets, and phone/admin lint, type-check, and exact park-test builds. Third-party Actions are pinned to full commits. Pull requests never receive AWS or Cloudflare write credentials.

### Release Build

`.github/workflows/release.yml` runs on eligible `main` commits. A manual historical build is allowed only for a full commit reachable from `main`, which makes a pre-T0198 baseline available for the first rollback rehearsal. Trusted tooling is checked out separately from the exact source so historical commits use the current artifact contract without altering their source.

The release workflow validates the source, synthesizes the full-flow CDK assembly, builds phone/admin with exact public configuration, creates checksums, validates the bundle, and uploads `park-test-release-<full SHA>`. It performs no AWS, Roller, Aurora, Cloudflare, messaging, or production write.

### Plan, Approval, Deploy

`.github/workflows/deploy-park-test.yml` is manual and serialized. Inputs are:

- successful release workflow run ID;
- full release SHA;
- `promote`, `rollback`, or `re-promote` intent;
- exact `I_APPROVE_PARK_TEST_<full SHA>` phrase; and
- explicit forward-only migration apply boolean, false by default.

The plan job verifies the GitHub run, downloads the named artifact, validates every hash/target, assumes the main-scoped read-only plan role through OIDC, fetches the deployed CloudFormation template, and publishes the resource/property diff. Only then does GitHub request approval for the protected `park-test` deploy job.

The approved job downloads and validates the same artifact again. Its environment-scoped OIDC role may assume only the account's eu-north-1 CDK bootstrap roles plus the exact migration and readback permissions. It cannot be assumed from an arbitrary branch or non-environment job.

Cloudflare receives only the two artifact outputs, fixed project names, `main` production branch, and exact release commit hash. `CLOUDFLARE_API_TOKEN` is a protected environment secret scoped to Account / Cloudflare Pages / Edit; the account ID is non-secret and fixed in the workflow.

## Migrations

The artifact-contained runner first reports migration status. Pending migrations stop the release unless the dispatch set `apply_migrations=true` before the protected approval. Migrations are forward-only and checksum-verified. Selecting older application code for rollback never deletes or reverses already-applied schema. A code rollback is permitted only while that older release remains compatible with the forward schema; otherwise a new approved corrective release is required.

## Post-Deploy Evidence

The protected job requires:

- exact AWS account and successful stack status;
- deployed CloudFormation template equal to the selected assembly;
- completed `IN_SYNC` drift detection;
- zero park-test alarms in `ALARM`;
- empty visible/in-flight park-test queues;
- latest successful production Pages deployment for each fixed project carrying the selected commit SHA;
- HTTP `200` plus exact park-test API configuration on phone, staff, admin, and Apple Pay association routes; and
- no pending migration from the selected bundle.

The run summary records intent, source SHA, release run ID, deploy run ID, environment, and targets. Issue/PR closeout records deploy, rollback, and re-promotion run URLs.

## First Bootstrap

The AWS account already has `token.actions.githubusercontent.com` as an OIDC provider. T0198 reuses it and does not change its broad shared provider configuration. The approved one-time local bootstrap reached `CREATE_COMPLETE` on `2026-07-15` with exactly four resources: two roles and their two inline policies:

- `jumpyard-check-in-park-test-github-actions-plan`; and
- `jumpyard-check-in-park-test-github-actions-deploy`.

They live in the separate `jumpyard-check-in-park-test-github-deployment-access` stack, carry all required WRLDS tags, and are not managed by the application release stack. The existing broad `dev-github-actions` role is not used.

GitHub environment `park-test` permits only `main`, requires Love as deployment reviewer, and allows the reviewer who initiated the run to approve it. Its Cloudflare credential is an environment secret, never a repository secret. Branch protection and the secret are verified during rollout closeout because their required workflow/check names exist only after the implementation reaches GitHub.

## Operator Procedure

1. Find the successful **Build park-test release** run for the intended SHA.
2. Open **Deploy or roll back park-test**, select **Run workflow** on `main`, and enter the exact inputs.
3. Read the `Plan selected release` summary. Stop if the SHA, targets, resource additions/removals, or changed logical IDs are unexpected.
4. Approve the pending `park-test` job.
5. Wait for all AWS, Cloudflare, public, drift, alarm, queue, and migration checks.
6. Link the run in the Issue/PR.

For rollback, choose a known successful earlier release run/SHA and `intent=rollback`. After proof or containment, choose the intended later release with `intent=re-promote`. Both require a fresh plan and approval.

## Break-Glass Local Path

Local park-test CDK or Wrangler deployment is not a convenience fallback. It is allowed only when GitHub is unavailable or the protected workflow itself is the incident, and only when a repository Issue explicitly approves the exact artifact/SHA, target, reason, operator, validation, and restoration plan. The operator must use the immutable artifact where possible, record commands without secrets, run the same target and post-deploy checks, and create a follow-up Project item to restore/prove the GitHub path.

## Cost And Boundary

The IAM roles and GitHub environment have no AWS runtime charge. Expected incremental usage is GitHub Actions/artifact storage and normal deployment API requests. T0198 creates no production identity, application runtime service, Roller write, guest send, lifecycle apply, venue/date expansion, or staff-account change.

## Rollout Evidence

Implementation PR and live rollout evidence are intentionally separate because the protected workflows can run only after their definitions reach `main`. Issue #201 remains open through the implementation merge. The dependent evidence PR records the AWS bootstrap, GitHub protection/secret readback, release, promote, rollback, re-promotion, and final live checks before it closes the Issue.
