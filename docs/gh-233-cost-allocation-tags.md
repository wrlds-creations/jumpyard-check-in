# Issue #233 Cost Allocation Runbook

This runbook makes JumpYard spend visible beside STIGA in the WRLDS management-account Cost Explorer. It covers the shared AWS member account `376129878018` in `eu-north-1`; it does not create, replace, deploy, or delete application infrastructure.

## Canonical billing metadata

The client and cost-center spelling is exact and case-sensitive:

| Tag | JumpYard value |
|---|---|
| `WRLDS:Client` | `JumpYard` |
| `WRLDS:CostCenter` | `JumpYard` |

The four user-defined cost allocation keys are:

- `WRLDS:Client`
- `WRLDS:Project`
- `WRLDS:Environment`
- `WRLDS:CostCenter`

The AWS Organizations management account owns activation, historical backfill, Cost Explorer, and saved reports. The member account owns resource tags.

## Issue #233 execution evidence

On 2026-08-11, read-only inventory found 179 supported resources tagged `WRLDS:Client=JumpYard`, all with the complete ten-tag WRLDS set and `WRLDS:CostCenter=unassigned`. The exact split was:

| Dimension | Value | Resources |
|---|---|---:|
| Project | `jumpyard-check-in` | 161 |
| Project | `jumpyard-jumpyboard` | 18 |
| Environment | `dev` | 70 |
| Environment | `park-test` | 109 |

Issue #233 initially changed only `WRLDS:CostCenter` on those 179 resources. During closeout, a separate JumpyBoard park-test deployment completed at 2026-08-11 14:12:55Z, expanded the visible inventory by eight taggable resources, and restored `unassigned` on 14 JumpyBoard resources from its owning source. After that stack returned to `UPDATE_COMPLETE`, issue #233 corrected those 14 tags as well. Final member-account readback returned 187/187 `JumpYard`, zero `unassigned`, and this split:

| Dimension | Value | Final resources |
|---|---|---:|
| Project | `jumpyard-check-in` | 161 |
| Project | `jumpyard-jumpyboard` | 26 |
| Environment | `dev` | 70 |
| Environment | `park-test` | 117 |

The generic Resource Groups Tagging API handled ordinary supported ARN types; service-native RDS and API Gateway v2 tagging handled Aurora clusters and API stages that the generic API rejected.

The management account accepted activation of all four cost allocation keys without errors and returned `Active` for each key. A backfill from `2026-07-01T00:00:00Z` was requested at `2026-08-11T13:58:27Z` and returned `SUCCEEDED` at `2026-08-11T14:05:44Z`.

On 2026-08-18, Cost Explorer exposed all four keys and their values. For July, the member-account client split was JumpYard USD `117.3027114282`, STIGA USD `2.3503836746`, WRLDS USD `0.0094885201`, and no-client USD `39.7499921485`. For 2026-08-01 through 2026-08-18, the estimated split was JumpYard USD `54.1099388131`, STIGA USD `0.3239520012`, WRLDS USD `0.0029626989`, and no-client USD `19.4092510936`.

JumpYard itself split exactly by project and environment. July was `jumpyard-check-in` USD `117.3027114282`, with `dev` USD `56.9900813797` and `park-test` USD `60.3126300485`. August through the 18th was `jumpyard-check-in` USD `54.0043541203`, `jumpyard-jumpyboard` USD `0.1055846928`, `dev` USD `19.9976160494`, and `park-test` USD `34.1123227637`.

Later park-test releases had reintroduced `WRLDS:CostCenter=unassigned` on the main stack and ten CloudWatch log groups because the source change had not yet merged. Issue #233 corrected those exact 11 resources on 2026-08-18. Final readback again returned 187/187 exact `JumpYard`, zero `unassigned`, and zero other cost-center values.

## Safe maintenance procedure

1. Confirm the management account before billing operations and the member account before resource tagging.
2. Inventory exact `WRLDS:Client=JumpYard` matches through Resource Groups Tagging API. Stop if another client or an unexpected cost-center value is present.
3. Change only `WRLDS:CostCenter` to `JumpYard`; do not rewrite project, environment, owner, repository, classification, exportability, or creator metadata.
4. Use service-native tagging for Aurora clusters and API Gateway v2 stages when the generic API rejects their inventory ARN.
5. Wait for every CloudFormation stack tag update to return to a terminal success state before continuing.
6. Read back all ten required tags, project/environment counts, and zero remaining `unassigned` values.
7. In the management account, activate the four allocation keys. Start a historical backfill only after all four read back as `Active`.
8. Re-run repository validation so active deployment configs cannot reintroduce `unassigned`.

Cost allocation tag activation can take time to appear in Cost Explorer. A historical backfill preserves the tag value assigned during the historical usage period; it does not rewrite July usage from the former `unassigned` value to the value applied in August.

## Saved Cost Explorer reports

Use monthly granularity, `Unblended cost`, the WRLDS payer view, and exclude tax from the operational reports. The following five views were verified through the Cost Explorer API on 2026-08-18; the names and filters are the canonical console shortcuts:

| Report name | Filter | Group by | Purpose |
|---|---|---|---|
| `WRLDS - Client` | Member account `376129878018` | Tag `WRLDS:Client` | Compare JumpYard with STIGA. |
| `WRLDS - Cost center` | Member account `376129878018` | Tag `WRLDS:CostCenter` | Give Love the direct JumpYard/STIGA cost-center view. |
| `WRLDS - JumpYard project` | Member account plus `WRLDS:Client=JumpYard` | Tag `WRLDS:Project` | Separate check-in from JumpyBoard. |
| `WRLDS - JumpYard environment` | Member account plus `WRLDS:Client=JumpYard` | Tag `WRLDS:Environment` | Separate dev from park-test. |
| `WRLDS - JumpYard service` | Member account plus `WRLDS:Client=JumpYard` | Service | Explain the AWS service mix. |

Saved Cost Explorer reports are console-owned objects. They are operational shortcuts, not durable audit evidence; repeat the CLI readback when exact numbers matter.

## Unallocated and historical-cost interpretation

- `No tag key` means AWS could not associate that usage with the selected active key. July no-client spend was USD `39.7499921485`: tax USD `31.89`, CloudWatch USD `7.6029906136`, SQS USD `0.1774688`, S3 USD `0.0530223261`, Cost Explorer USD `0.02`, ECR USD `0.0064004088`, and negligible Secrets Manager/IoT usage. August through the 18th was an estimated USD `19.4092510936`: tax USD `14.77`, CloudWatch USD `4.544257485`, Cost Explorer USD `0.05`, S3 USD `0.0273607286`, SQS USD `0.0141168`, ECR USD `0.00344108`, and negligible Secrets Manager/IoT usage. These are payer/shared or usage categories that did not inherit a resource tag; they are not silently assigned to JumpYard.
- July `WRLDS:CostCenter=unassigned` is historical truth because that was the resource value during July. Use `WRLDS:Client=JumpYard` for the historical JumpYard/STIGA split.
- Tax, credits, refunds, support, commitment fees, and some data-transfer or account-level charges may not inherit resource tags. Keep them visible as payer/shared cost unless finance approves an allocation rule.
- CloudFormation stacks are taggable governance objects but do not themselves create metered spend; Cost Explorer reports the billed underlying services.
- A missing or unsupported resource type must be recorded with its amount and reason before issue closeout. Do not infer an allocation from naming alone.

## Current verification state

| Check | State |
|---|---|
| 187/187 live JumpYard resources use `WRLDS:CostCenter=JumpYard` | Passed |
| Four required allocation keys read back `Active` | Passed |
| Backfill from 2026-07-01 | Passed (`SUCCEEDED`) |
| Cost Explorer values refreshed after backfill | Passed (2026-08-18) |
| Five canonical Cost Explorer views verified | Passed through management-account API; console shortcut names documented above |
| Residual unallocated cost measured and explained | Passed (2026-08-18) |

## Cross-repository follow-up

The 26 `jumpyard-jumpyboard` resources are correct live, but their owning infrastructure source is outside this repository. Project draft `PVTI_lADOBXiXg84BdXuJzg2HIp8`, **Persist WRLDS:CostCenter=JumpYard in JumpyBoard IaC**, records the required source follow-up. The 2026-08-11 park-test deployment proved that the current source restores `unassigned`, so the follow-up is required before another trusted deployment. Issue #233 must not edit those repositories without their own approved implementation issue.
