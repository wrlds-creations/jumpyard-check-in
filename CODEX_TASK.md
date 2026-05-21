# CODEX_TASK.md

## Ticket ID

T0022

## Goal

Lock the phone-to-staff redeem handoff design so the phone flow can progress toward real check-in completion without exposing dev/prod redeem power to the frontend.

## Dependencies

- T0021 completed, pushed, and merged to `main`.
- Dev `POST /v1/check-in/redeem` can safely plan redemptions and can execute controlled Playground redemption only with a dev token.
- T0021 confirmed Roller redemption consumes ticket state, so production phone UI wiring must be designed before exposing any check-in completion action.

## Current Status

Completed locally on branch `codex/t0022-phone-staff-redeem-handoff-design`.

Validation result:

- `npm run validate`: passed.

## Allowed Areas

- `CODEX_TASK.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`

## Do Not Touch

- Phone UI implementation
- Kiosk UI
- Admin UI
- Assets
- Deliverables
- Lambda implementation
- CDK/AWS resources
- Database migrations
- Booking creation implementation
- Payment implementation
- Add-product implementation
- Production config
- Production credentials
- `.env`

## Requirements

1. Document that the guest phone app must not directly execute Roller redemption.
2. Document that the dev-only redeem token from T0021 is for controlled backend testing only and must never be placed in frontend config.
3. Define the intended pilot handoff shape:
   - phone lookup displays booking state from JumpYard Cloud
   - phone starts or resumes a server-owned check-in session
   - JumpYard Cloud owns session state, safety status, handoff status, idempotency, and audit
   - staff/admin or a server-trusted confirmation step performs final redeem
   - final redeem still performs live Roller refresh before `POST /redemptions`
4. Define proposed future API responsibilities without implementing them.
5. Define the expected Aurora ownership model for session/handoff state without creating migrations in this ticket.
6. Add a decision that phone UI must not hold redeem secrets or directly redeem tickets.
7. Update current-state and test-plan docs with the T0022 scope and the next recommended implementation ticket.

## Non-Goals

- Do not wire phone UI to redeem.
- Do not add staff/admin UI.
- Do not create session endpoints.
- Do not create new database tables.
- Do not deploy AWS changes.
- Do not call Roller.
- Do not redeem additional tickets.
- Do not add payment logic.
- Do not add booking creation logic.

## Acceptance Criteria

- Source-of-truth docs clearly state that the phone app cannot directly execute Roller redemption.
- The recommended pilot flow is clear: phone starts a JumpYard Cloud session, staff/server confirmation executes final redeem.
- The contract identifies future server endpoints and state ownership without implementing them.
- `DECISIONS.md` contains the new handoff/redeem boundary decision.
- `REPO_CURRENT_STATE.md` recommends the next implementation ticket.
- No app code, infra code, AWS resources, migrations, assets, deliverables, credentials, or `.env` files are changed.

## Manual Verification

Review:

- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `REPO_CURRENT_STATE.md`
- `TEST_PLAN.md`

Confirm a new Codex session can understand why phone lookup and phone start-check-in are separate from final Roller redemption.

## Automated Validation

Run:

- `npm run validate`
