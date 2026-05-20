# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-19
- Current branch: `codex/t0006-aws-dev-deploy`
- Current status: T0006 AWS dev deploy completed in account `376129878018`, region `eu-north-1`.
- Current ticket: `T0006`
- Completed tickets: `T0000`, `T0001`, `T0002`, `T0003`, `T0004`, `T0005`, `T0006`
- Recommended next ticket: `T0007 Aurora schema/migrations`

## Current Structure

```text
.
|-- .env.example
|-- AGENTS.md
|-- PROJECT_CONTEXT.md
|-- DECISIONS.md
|-- CODEX_TASK.md
|-- JUMPYARD_CLOUD_CONTRACT.md
|-- BOOKING_INDEX_INGESTION_CONTRACT.md
|-- REPO_CURRENT_STATE.md
|-- FOLLOWUPS.md
|-- AWS_RESOURCES.md
|-- TEST_PLAN.md
|-- scripts/
|   |-- check-roller-env.js
|   |-- roller-client.js
|   `-- roller-smoke.js
|-- infra/
|   |-- bin/jumpyard-cloud.ts
|   |-- config/dev.json
|   |-- config/dev.example.json
|   |-- lib/config.ts
|   |-- lib/jumpyard-cloud-stack.ts
|   |-- cdk.json
|   |-- package.json
|   |-- package-lock.json
|   `-- tsconfig.json
|-- jumpyard-checkin-phone/
|-- jumpyard-checkin-kiosk/
`-- jumpyard-checkin-admin/
```

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Existing repository command. |
| `npm run infra:check` | Type-check and synthesize the deploy-blocked CDK foundation with example config. | Added in T0004; does not deploy or require AWS credentials. |
| `npm run infra:synth` | Synthesize the JumpYard Cloud CDK stack with `infra/config/dev.example.json`. | Added in T0004; example config is not approved for deploy. |
| `npm --prefix infra run synth:dev` | Synthesize the confirmed T0006 dev stack. | Uses `infra/config/dev.json`. |
| `npm --prefix infra run diff:dev` | Review AWS dev changes before deploy. | Must show only approved T0004 foundation resources. |
| `npm --prefix infra run deploy:dev` | Deploy the approved dev foundation. | Run only after account `376129878018` and region `eu-north-1` are verified. |
| `npm --prefix infra audit` | Audit infra dependencies. | Currently reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; automatic fix unavailable. |
| `npm run roller:env:check` | Validate Roller env guard against current environment variables. | Requires `ROLLER_ENV=playground` and a Playground-looking `ROLLER_BASE_URL`; client credentials are optional. |
| `npm run roller:smoke` | Verify local Roller Playground credentials with an OAuth token request and one read-only smoke request. | Loads local `.env`; does not print secrets or full Roller responses. |
| Read-only `GET /bookings/{bookingReference}` | Verify known Playground booking lookup behavior. | Run through the existing Roller client helper; do not print secrets or raw PII. |
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-phone && npm run build` | Build phone app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-admin && npm run build` | Build admin app. | Existing app command; not required unless app code changes. |

## Completed Tickets

| Ticket | Summary | Completed On | Notes |
|---|---|---|---|
| `T0000` | Set up source-of-truth docs for WRLDS Codex workflow. | 2026-05-18 | Committed as `5655fb1`. |
| `T0001` | Added Roller Playground env guard and client skeleton. | 2026-05-18 | Committed as `2bfde41`. |
| `T0002` | Added Roller Playground credential smoke test and branch workflow docs. | 2026-05-19 | Merged to `main` through PR #6 as merge commit `155c655`. |
| `T0003` | Defined JumpYard Cloud contract, data ownership, Roller endpoint map, Aurora data model, and proposed AWS target architecture. | 2026-05-19 | Merged to `main` through PR #7 as merge commit `b99cbfb`. |
| `T0004` | Added deploy-blocked JumpYard Cloud AWS CDK foundation. | 2026-05-19 | Merged to `main` through PR #8 as merge commit `bb9c660`. |
| `T0005` | Defined booking index ingestion contract and post-T0005 roadmap. | 2026-05-19 | Merged to `main` through PR #9 as merge commit `7ea23e9`. |
| `T0006` | Deployed the JumpYard Cloud AWS dev foundation. | 2026-05-19 | Stack `jumpyard-check-in-dev-stack`, API `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`, Aurora PostgreSQL `16.13`. Pending commit/merge. |

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0006` | Deploy the JumpYard Cloud CDK foundation to a real AWS dev environment. | Completed | Dev stack is deployed and post-deploy diff shows no differences. |

## Confirmed Next Tickets

| Ticket | Goal | Notes |
|---|---|---|
| `T0007` | Aurora schema/migrations | Create ingestion and operational tables/indexes in Aurora. |
| `T0008` | Playground test booking seed tool | Create deterministic fake bookings in Roller Playground through protected server-side tooling. |
| `T0009` | Booking lookup endpoint | Implement `POST /v1/check-in/lookup` against Roller Playground and local index shape. |
| `T0010` | Daily seed job | Implement Data API seed into Aurora. |
| `T0011` | Booking webhook intake | Implement webhook intake, idempotency, and enrichment. |

## Validation Status

- Automated root validation: `npm run validate` passed during T0005 on 2026-05-19.
- Infra validation: `npm run infra:check` passed during T0004.
- Infra synth: `npm run infra:synth` passed during T0004 using `infra/config/dev.example.json`.
- Metadata guard: missing `-c config=...` fails as expected before synth.
- AWS CLI preflight: `aws --version` passed on 2026-05-19.
- AWS identity preflight: `aws sts get-caller-identity` failed on 2026-05-19 because no AWS credentials are configured.
- AWS config preflight: `aws configure list` shows no profile, access key, secret key, or region.
- T0006 dev metadata: confirmed account `376129878018`, region `eu-north-1`, profile `wrlds-dev`, resource prefix `jumpyard-check-in-dev`, and WRLDS tags in `infra/config/dev.json`.
- AWS SSO login: `aws sso login --profile wrlds-dev` passed on 2026-05-19.
- AWS identity preflight after login: account `376129878018`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- AWS region preflight after login: `eu-north-1`.
- Dev synth: `npm --prefix infra run synth:dev` passed with `infra/config/dev.json`.
- Dev diff before deploy: `npm --prefix infra run diff:dev` showed only the approved foundation resources.
- First dev deploy attempt: failed because Aurora PostgreSQL `16.3` is not available in `eu-north-1`; rollback completed and retained empty S3 bucket was deleted.
- Final dev deploy: `npm --prefix infra run deploy:dev` passed after changing Aurora PostgreSQL to `16.13`.
- Post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- Placeholder API smoke: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup` returned HTTP `501`.
- Infra dependency audit: `npm --prefix infra audit` reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; `npm audit fix` cannot repair it automatically.
- Roller env validation: `npm run roller:env:check` passed with local `.env` during T0002.
- Roller smoke validation: `npm run roller:smoke` passed with local `.env`; `/products` returned HTTP 200 and 96 products on 2026-05-19.
- Booking lookup validation: read-only `GET /bookings/5001370` returned HTTP 200 with booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`, status `PendingPayment`, amount owing `260`, and ticket `5001370-21265504`.
- App lint/build: Not required for T0005 because app code is not changed.

## Known Issues Summary

- AWS dev foundation is deployed, but all API handlers are placeholders and return `501`.
- Roller credentials secret in AWS is still a placeholder and must be set before real Roller calls.
- JumpYard Cloud/server API business logic has not been implemented.
- Booking index ingestion from Roller Data API and booking webhooks has not been implemented.
- Exact Roller Data API query params, paging, credentials, and date-window support are still open.
- Webhook event id, signature/verification method, retry behavior, and event names are still open.
- Playground fake booking seed tooling has not been implemented.
- Staff handoff/redeem flow integration has not been implemented.
- Roller `POST /redemptions` has not been tested yet.
- Existing-booking add-product linked-booking flow has not been tested yet.
- `aws-cdk-lib` currently carries a moderate bundled dependency audit warning.

## Open Questions

- What is the exact JumpYard Cloud link model between original booking and separate add-on booking?
- Which tenders work in the new add-on booking checkout flow: gift card, membership code, and multi-visit value?
- Which products must be configured as ticket/session products to support API-driven redemption and webhook-based counters?
- Which exact Roller Data API query params, paging model, credentials, and date range should power the daily morning booking seed?
- Which webhook event id, signature/verification method, retry behavior, and event names does Roller provide in Playground and production?
