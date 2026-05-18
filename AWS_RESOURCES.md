# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

Use this file together with the `aws-project-infrastructure` skill before creating, changing, reviewing, deploying, tagging, or deleting AWS resources.

## Required Resource Inventory

No project-managed AWS resources are currently documented in this repository.

| Resource Name | AWS Service | Client | Project | Environment | Region | Managed By | Repository | Data Classification | Exportable | Cost Center | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `TBD` | `TBD` | `JumpYard` | `jumpyard-check-in` | `TBD` | `TBD` | `TBD` | `wrlds-creations/jumpyard-check-in` | `TBD` | `TBD` | `JumpYard` | Add resources here when AWS work is introduced. |

## Deleted Or Replaced Resources

| Resource Name | AWS Service | Environment | Region | Deleted Or Replaced On | Reason | Follow-Up |
|---|---|---|---|---|---|---|
| `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |

## AWS Governance Notes

- Required tags are documented in `references/aws-tagging-standard.md`.
- CI/CD expectations are documented in `references/aws-cicd-standard.md`.
- Do not use long-lived AWS access keys unless explicitly approved.
- Prefer Infrastructure as Code for project-managed resources.
- Confirm deployment target and environment before creating any AWS resource.

## Required WRLDS Tags

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
