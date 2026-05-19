# CODEX_TASK.md

## Ticket ID

T0003

## Goal

Define the JumpYard Cloud contract, data ownership model, Roller endpoint map, and proposed AWS target architecture for the first phone-focused check-in flows.

## Dependencies

- T0000 completed and merged.
- T0001 completed and merged.
- T0002 completed and merged.
- Local source materials are available:
  - `jumpyard-processes/editor/index.html`
  - `jumpyard-processes/editor/src/data/pilotFlow.ts`
  - `jumpyard-processes/editor/src/App.tsx`
  - `Roller_Response_v1_260414.pdf`
  - `Roller_Response_v2_260423.pdf`
  - `Roller_Response_v3_260429.pdf`
  - `ROLLER Rest API - Reference from website.pdf`

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`
- New root-level contract/architecture markdown file if needed

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

1. Read the BPMN/process material and Roller response/reference PDFs.
2. Document the first JumpYard Cloud API contract for:
   - existing booking lookup
   - ticket-level check-in/redeem
   - new booking quote/draft
   - existing booking add-product quote and separate linked add-on booking path
3. Document the Roller endpoint map, including confidence and known constraints.
4. Document data ownership:
   - Roller-owned data
   - JumpYard Cloud-owned pilot state
   - short-lived cache/audit data
   - PII/secrets handling
5. Propose a scalable AWS target architecture without creating resources.
6. Propose an Aurora PostgreSQL data model v1 without implementing it.
7. Capture open questions and follow-up tickets.
8. Update source-of-truth docs so a future Codex session can continue without chat history.

## Non-Goals

- Do not implement API endpoints.
- Do not create or edit Roller bookings.
- Do not redeem tickets.
- Do not implement payment.
- Do not change phone/kiosk/admin UI.
- Do not create AWS infrastructure.
- Do not add dependencies.
- Do not commit unless explicitly requested.

## Acceptance Criteria

- A JumpYard Cloud contract document exists.
- `PROJECT_CONTEXT.md` points future work to the contract.
- `DECISIONS.md` records the architecture/data decisions made in T0003.
- `AWS_RESOURCES.md` still clearly states no AWS resources were created and lists only proposed resources if useful.
- `REPO_CURRENT_STATE.md` marks T0003 as current/completed and recommends T0004.
- `FOLLOWUPS.md` captures unresolved Roller/AWS questions.
- `TEST_PLAN.md` explains validation for this docs-only ticket.
- No app code, UI, assets, package dependencies, deployment config, or AWS resources are changed.

## Manual Verification

Open the updated source-of-truth documents and confirm:

- The phone app points to JumpYard Cloud, not Roller.
- Booking lookup uses `GET /bookings/{uniqueId or bookingReference}` as the primary read path.
- Create booking uses draft/cost patterns.
- Existing booking add-product uses a separate linked add-on booking as the primary pilot path.
- Check-in/redeem is ticket-level.
- JumpYard Cloud stores audit/pilot state and Roller ids, not raw Roller ownership data.

## Automated Validation

Run:

- `npm run validate`

Optional read-only verification if local Roller Playground credentials are available:

- `npm run roller:env:check`
- Read-only `GET /bookings/{knownPlaygroundBookingReference}`
