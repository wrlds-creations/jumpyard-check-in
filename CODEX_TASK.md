# CODEX_TASK.md

## Ticket ID

T0005

## Goal

Define the booking index ingestion contract for JumpYard Cloud: daily Roller Data API seed, booking webhook intake/enrichment, and live REST lookup reconciliation.

## Dependencies

- T0000 completed and merged.
- T0001 completed and merged.
- T0002 completed and merged.
- T0003 completed and merged.
- T0004 completed and merged.
- Local source materials are available:
  - `jumpyard-processes/editor/src/data/pilotFlow.ts`
  - `ROLLER Rest API - Reference from website.pdf`
  - `Roller_Response_v1_260414.pdf`
  - `Roller_Response_v2_260423.pdf`
  - `Roller_Response_v3_260429.pdf`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- New root-level ingestion contract markdown file if needed

## Do Not Touch

- App source code
- UI files
- Assets
- Deliverables
- Package dependencies
- Build configuration
- Deployment configuration
- Roller write integration code
- AWS resources
- Production config
- `.env`

## Requirements

1. Document the daily booking index seed contract:
   - cadence
   - expected Roller Data API sources
   - date-window assumptions
   - idempotency
   - upsert targets
   - failure behavior
2. Document booking webhook intake:
   - purpose
   - dedupe/idempotency
   - normalized event state
   - when to enrich with live booking detail
   - open verification/signature questions
3. Document live REST reconciliation:
   - when to refresh from `GET /bookings/{id}`
   - how freshness/staleness should affect lookup and redeem flows
   - how conflicts should be routed
4. Document Aurora model additions/indexes needed for ingestion.
5. Document observability, PII, and retention expectations.
6. Update source-of-truth docs so future implementation tickets can continue without chat history.
7. Document the confirmed post-T0005 ticket roadmap:
   - T0006 AWS dev deploy
   - T0007 Aurora schema/migrations
   - T0008 Playground test booking seed tool
   - T0009 Booking lookup endpoint
   - T0010 Daily seed job
   - T0011 Booking webhook intake

## Non-Goals

- Do not implement jobs.
- Do not implement webhook handlers.
- Do not implement API endpoints.
- Do not create database migrations.
- Do not call Roller writes.
- Do not create, update, redeem, or pay Roller bookings.
- Do not deploy AWS infrastructure.
- Do not add package dependencies.

## Acceptance Criteria

- A booking index ingestion contract document exists.
- Daily seed, booking webhook intake/enrichment, and live REST reconciliation are described separately.
- The contract keeps Roller as source of truth and the local index as operational cache.
- Open Roller Data API and webhook questions are captured.
- `REPO_CURRENT_STATE.md` marks T0005 as current/completed locally and recommends the next ticket.
- Post-T0005 roadmap clearly states when CDK/AWS deploy happens.
- No app code, UI, assets, package dependencies, deployment config, Roller write logic, or AWS resources are changed.

## Manual Verification

Open the updated source-of-truth documents and confirm:

- The daily seed uses Get bookings, Get tickets, Get payments, and Get customers as the expected sources.
- Booking webhooks are treated as same-day change signals.
- Live booking detail remains authoritative before check-in-critical writes.
- Attendance is not used as the expected-guest seed.
- PII/raw payload storage is minimized and explicitly deferred where needed.

## Automated Validation

Run:

- `npm run validate`
