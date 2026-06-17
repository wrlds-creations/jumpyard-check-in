# T0146 Park-Test Environment Contract

Date: 2026-06-17

Ticket: `T0146`

Status: Contract locked for future implementation tickets. T0146 does not create resources, credentials, config files, deploys, Live API calls, webhooks, payments, redemptions, SMS, or email.

## Purpose

`park-test` is a limited pre-production environment for the JumpYard Nacka park test. It exists to test the same JumpYard Cloud architecture against Roller Live under explicit ticket gates, without disturbing the current dev/Playground implementation.

This is not a broad production rollout, not a public launch, and not an approval to create AWS resources or call Roller Live. Future tickets must implement, deploy, and smoke the environment one step at a time.

## Environment Identity

| Field | Contract |
|---|---|
| WRLDS environment name | `park-test` |
| Purpose | Limited staff-controlled park test for JumpYard Nacka |
| AWS account | Same account as dev: `376129878018` |
| AWS region | Same region as dev: `eu-north-1` |
| Deployment model | Separate CDK-managed resources from dev |
| Resource namespace | `jumpyard-check-in-park-test` |
| Expected stack name | `jumpyard-check-in-park-test-stack` |
| Repository | `wrlds-creations/jumpyard-check-in` |
| Frontend source | Same phone/admin source code as dev; environment-specific deployment config only |
| Roller target | Roller Live for JumpYard Nacka, server-side only |
| Current status | Planned only; no park-test AWS resources or Live credentials are active |

## Separation Rules

| Area | Dev/Playground | Park-test contract |
|---|---|---|
| Environment name | `dev` | `park-test` |
| AWS account/region | `376129878018` / `eu-north-1` | Same account/region |
| Resource prefix | `jumpyard-check-in-dev` | `jumpyard-check-in-park-test` |
| API Gateway | Existing dev API `m0uo5g4mde` | Separate future API; URL unknown until deploy |
| Database | Existing dev Aurora cluster/database | Separate future Aurora cluster/database |
| Secrets | `/jumpyard-check-in-dev/...` | `/jumpyard-check-in-park-test/...` |
| SSM parameters | `/jumpyard-check-in-dev/...` | `/jumpyard-check-in-park-test/...` |
| SQS/EventBridge/logs/alarms | Existing dev resources | Separate future resources and schedules |
| Roller | Playground only | Live JumpYard Nacka only after explicit gates |
| Frontend API target | Dev API | Park-test API through deployment env/config |

Dev and park-test must not share API Gateway endpoints, Aurora clusters/databases, Secrets Manager secret names, SSM parameter names, queues, EventBridge schedules, CloudWatch log groups, webhook registrations, or frontend deployment origins.

## Roller Boundary

- Frontend apps must not call Roller directly.
- Park-test uses the same boundary as dev: `phone/admin -> JumpYard Cloud/server API -> Roller API`.
- Roller Live credentials are stored server-side only in park-test Secrets Manager references.
- Roller Live reads are first allowed only in `T0153`.
- Roller Live writes are separately gated by later tickets: webhook registration in `T0155`, draft creation in `T0158`, payment in `T0159`, and redeem in `T0160`.
- Dev must remain fail-closed against Roller Live; park-test must remain fail-closed until its reviewed config, secrets, and live-write gates exist.

## Data Contract

Park-test handles real JumpYard Nacka visitor and operational data, so it must use a dedicated database and dedicated operational state.

| Data area | Contract |
|---|---|
| Aurora | Separate park-test Aurora cluster/database, not shared with dev |
| Schema | Same migration set as dev, applied to park-test only in `T0151` |
| Local state | Park-test owns its own sessions, handoff codes, idempotency rows, event logs, messaging audit rows, webhook events, product cache, and prepayment draft metadata |
| Roller state | Roller Live remains source of truth for bookings, products, payments, and redemption |
| Raw payment JWTs | Response-only/in-memory; never persisted in Aurora or logs |
| PII | Staff-only where applicable; no public guest exposure beyond existing guest-owned flow contracts |
| Data classification | `confidential` for future park-test AWS tags because real visitor/payment-adjacent operational data may be present |
| Exportable | `true`, matching the current project exportability requirement |

Before `T0151`, future work must verify the migration baseline. T0145 identified docs drift in `AWS_RESOURCES.md`: one top-level sentence says dev migrations through `0007`, while the schema inventory and migration files show `0008` as the latest known migration.

## Planned WRLDS Metadata

These values are the contract for future synth/deploy tickets. `T0149`/`T0150` must re-confirm them before any resource creation.

| Tag | Park-test value |
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

## Future Config Contract

`T0146` does not add a synthable `park-test` config file. That belongs to `T0148` after `T0147` updates the config guards.

Future config work must satisfy this contract:

- It must represent the app/AWS environment as `park-test`.
- It must keep `dev` restricted to Roller Playground and `https://api.play.roller.app`.
- It must target Roller Live only for `park-test`.
- It must require a separate resource prefix, separate secret references, and separate SSM parameters.
- It must require explicit CORS origins; no wildcard origins.
- It must default live-write actions, scheduled real sends, draft creation, payment, redeem, and webhook registration to off until their ticket gates enable them.
- It must avoid hardcoding the park-test API URL into shared frontend source code.

## Future Frontend Contract

- Phone and admin source code remains shared with dev.
- Park-test frontend deployments point to the future park-test API using deployment-specific environment/config.
- Dev Cloudflare Pages deployments remain available and continue pointing at the dev API.
- Admin CSP/connect-src must include the park-test API in the park-test deployment path when `T0156` runs.
- Kiosk is out of scope unless a later ticket explicitly adds it.

## Rollback And Stop Criteria

Because park-test resources are separate from dev, rollback should be able to disable or remove park-test surfaces without affecting dev/Playground.

Future tickets must preserve these stop criteria:

- Any attempt to use dev resources with Roller Live stops the ticket.
- Any attempt to use park-test resources with dev/Playground secrets stops the ticket unless explicitly scoped for a read-only comparison.
- Any missing or ambiguous Live credential, webhook token, staff auth, payment, or redeem gate stops the ticket.
- Any unexpected dev diff during park-test synth/diff/deploy stops the ticket.
- Any Live write path without the ticket-specific explicit approval stops the ticket.

## Open Items For Later Tickets

| Item | Owning ticket |
|---|---|
| Config validator support for `park-test` and fail-closed Live/dev rules | `T0147` |
| Synthable `infra/config/park-test.json` skeleton | `T0148` |
| Deploy and rollback runbook, including preflight metadata confirmation | `T0149` |
| Actual AWS resource creation and resource inventory update | `T0150` |
| Park-test database migration status and dev migration drift verification | `T0151` |
| Separate secret references and live-write kill switches | `T0152` |
| Roller Live JumpYard Nacka venue/product/payment read-only confirmation | `T0153` |
| Park-test frontend deployment/API target/CORS/CSP | `T0156` |

## T0146 Conclusion

The park-test environment is now defined as a separate WRLDS environment in the existing AWS account and region, with its own resource namespace, database, secrets, and deployment/config surfaces. It targets Roller Live JumpYard Nacka only through JumpYard Cloud, while dev remains a separate Roller Playground environment.

No resources or credentials exist for park-test yet. Future tickets must implement this contract without weakening dev/Playground safety.
