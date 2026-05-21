# CODEX_TASK.md

## Ticket ID
T0026

## Goal
Build the first staff/admin handoff list and detail view for sessions marked ready for staff.

## Dependencies
- T0025 completed and merged.
- Dev JumpYard Cloud session API exists.
- Dev Aurora contains `jumpyard.checkin_sessions`.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- .env.example
- `infra/lib/jumpyard-cloud-stack.ts`
- `infra/lambda/session/index.js`
- `jumpyard-checkin-admin/`

## Do not touch
- Phone check-in flow
- Kiosk flow
- Existing Roller lookup behavior
- Roller redeem execution behavior
- Payment logic
- Booking creation/add-product logic
- Production credentials
- Live Roller config
- Unrelated assets or deliverables

## Requirements

1. Add read-only staff handoff endpoints in JumpYard Cloud:
   - `GET /v1/staff/check-in/sessions`
   - `GET /v1/staff/check-in/sessions/{checkinSessionId}`

2. The staff endpoints must:
   - Read from Aurora only.
   - Return sessions with `handoff_status='ready_for_staff'`.
   - Return booking/session/ticket/item summary needed for staff inspection.
   - Avoid exposing guest email, phone, or full PII in the response.
   - Not call Roller.
   - Not redeem tickets.
   - Not mutate session state.

3. Update the staff/admin app to:
   - List ready-for-staff sessions.
   - Search/filter by handoff code, booking reference, session id, or visit date.
   - Show a selected session detail view.
   - Show selected tickets, booking items, booking status, payment status, safety status, and handoff code.
   - Avoid any final redeem action in this ticket.

4. Update source-of-truth docs with:
   - T0026 status.
   - Staff handoff endpoint contract.
   - AWS route/resource notes.
   - Validation results.
   - Recommended next ticket: T0027 Staff-confirmed redeem from session.

## Non-goals
- Do not implement final redeem from the staff UI.
- Do not add staff authentication yet.
- Do not create new database tables.
- Do not add guest PII to the staff endpoint.
- Do not create or edit Roller bookings.
- Do not change the phone guest flow.

## Acceptance criteria
- Staff list/detail endpoints are deployed to dev.
- The admin app renders real ready-for-staff sessions from JumpYard Cloud.
- A ready session from booking `5032210` can be inspected in the admin app.
- `npm run validate` passes.
- Infra checks pass.
- Admin lint/build pass.
- No phone app source files are changed.

## Manual verification
1. Ensure a paid booking has reached the phone confirmation screen and is marked `ready_for_staff`.
2. Open the staff/admin app.
3. Confirm the handoff code appears in the list.
4. Select the session and confirm details show booking status, payment status, products, tickets, safety status, and selected ticket count.
5. Confirm there is no staff redeem button/action yet.

## Automated validation
Run:
- `npm run validate`
- `node --check infra/lambda/session/index.js`
- `npm --prefix infra run build`
- `npm --prefix infra run synth:dev`
- `npm --prefix jumpyard-checkin-admin run lint`
- `npm --prefix jumpyard-checkin-admin run build`
