# T0191 Park-Test Pre-Production Contract

> Superseded for the Nacka pilot on 2026-08-18 by D0189 and [issue #264](https://github.com/wrlds-creations/jumpyard-check-in/issues/264). The existing technical environment name, resources, tags, data, and safeguards remain `park-test`, but its approved business role is now Nacka pilot production. No separate AWS backend will be created for this single-park pilot. The original T0191 contract below is retained as historical decision evidence; see [the current #264 contract](gh-264-nacka-pilot-production.md).

Date: 2026-07-10

Ticket: `T0191`

Status: Approved documentation contract. No AWS or runtime change was made.

## Plain-Language Decision

The existing `park-test` environment is Sprint 3's only Live-backed pre-production environment.

Think of it as the rehearsal room that is already built. We will inspect it, repair what is missing, and run the full dress rehearsal there. Building a second identical rehearsal room would add cost and more things to keep synchronized without making Roller Live test data safer.

`park-test` is not production. After a successful rehearsal and an explicit GO decision, production will be created as a separate environment through its own approved ticket.

## Environment Model

| Environment | Roller target | Role | Availability expectation |
|---|---|---|---|
| `dev` | Playground | Development and safe lower-level testing. | Keep separate from Live work. |
| `park-test` | Live, Nacka only | Sole pre-production environment for qualification, controlled proof, and the final Sprint 3 rehearsal. | JumpYard does not need it continuously during Sprints 3 or 4; approved maintenance windows are allowed. |
| Production | Live, approved production scope | Future guest/staff service after GO. | Does not exist as an approved project environment yet; create separately in T0205 only after T0204 GO and new explicit approvals. |

The path is:

```text
dev / Playground
  -> existing park-test / Live pre-production
  -> future separate production after GO
```

There is no parallel `staging` stack in this plan.

## What Stays Unchanged

- Keep the technical environment name `park-test`.
- Keep resource prefix `jumpyard-check-in-park-test` and stack name `jumpyard-check-in-park-test-stack`.
- Keep `WRLDS:Environment=park-test` and the existing environment-specific resource, secret, database, and frontend identities.
- Do not rename park-test to production, clone it into staging, or copy its operational data into production.
- Continue to use the same reviewed phone/admin artifacts with environment-specific configuration.
- Roller remains the booking source of truth; JumpYard Cloud remains the server-side boundary and operational state owner.

## Why This Is The Safer Choice

- The deployed foundation already contains the environment pieces that a second staging foundation would duplicate.
- Repository infrastructure currently has reviewed `dev` and `park-test` contracts; adding another environment would introduce more configuration and drift risk.
- A second environment connected to Roller Live would not create a separate Roller test universe. Both would still need strict venue, date, write, webhook, and messaging gates.
- Fewer environments reduce AWS cost and the number of secrets, databases, domains, alarms, and deployment targets that must stay synchronized.

The important safety boundary is therefore not the label `staging`; it is whether park-test is qualified, fail-closed, observable, recoverable, and able to prove the whole production-intent flow.

## What T0192 Must Prove Before Building Forward

T0192 changes from “create staging” to “qualify and harden existing park-test.” It must:

1. Resolve or explicitly block on `FU-096`, the missing full-flow operating-date protection for new-booking and submitted add-on items.
2. Plan and review one coherent deployment of T0190's corrected code and configuration before changing the running environment.
3. Inventory deployed resources and compare them with the repository's IaC, tags, secrets references, data boundary, gates, alarms, and rollback path.
4. Prove the normal default is closed and that only explicitly approved park-test modes can open narrower behavior.
5. Record drift, missing controls, cost impact, and rollback evidence.
6. Treat any genuinely missing AWS resource as a separately itemized change requiring explicit approval; this contract alone authorizes no resource creation.

T0192 is complete only when park-test is trustworthy enough to receive the later Sprint 3 work. It does not have to be available to JumpYard while this qualification is in progress.

## Revised Sprint 3 Sequence

- T0192 qualifies and hardens existing park-test instead of creating staging.
- T0193-T0198 add and prove the required API, identity, data, webhook, and deployment controls in park-test.
- T0199 prepares production domain ownership and routing but does not route production traffic.
- T0200-T0202 prove sender readiness, automatic T-30 SMS/email, and operations in controlled park-test scope.
- T0203 closes remaining approved phone/admin feedback.
- T0204 rehearses the complete chain in park-test and records GO/NO-GO; it creates no production resources.
- T0205, only after GO and new approvals, creates the separate production foundation and performs a controlled cutover.

## AWS Governance Record

The current park-test identity remains:

| Field | Confirmed value |
|---|---|
| Client | `JumpYard` |
| Project | `jumpyard-check-in` |
| Environment | `park-test` |
| AWS account | `376129878018` |
| AWS region | `eu-north-1` |
| Owner / created by | `love` |
| Repository | `wrlds-creations/jumpyard-check-in` |
| Managed by | `cdk` |
| Data classification | `confidential` |
| Exportable | `true` |
| Cost center | `JumpYard` (updated by issue #233) |

Before T0205 creates anything, production must receive its own confirmed account, region, environment name, prefix, owner, repository, tags, data classification, exportability, cost center, secrets, domain, rollback, and budget approvals. Park-test values are not automatic production approval.

## Explicit Exclusions

T0191 does not:

- call, create, change, deploy, or delete AWS resources;
- change app, Lambda, CDK, migration, configuration, gate, secret, or dependency files;
- call Roller or create bookings, payments, redemptions, webhooks, or imports;
- send SMS or email;
- change Cloudflare, DNS, domains, or running phone/admin behavior; or
- approve T0192 implementation or any future production launch.

## Result

The repository now has one unambiguous environment truth: develop in `dev`, qualify and rehearse in the existing `park-test`, and create a separate production environment only after T0204 GO through T0205.
