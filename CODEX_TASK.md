# CODEX_TASK.md

## Ticket ID

T0000

## Goal

Set up the repository source-of-truth documents for the WRLDS Codex workflow.

## Dependencies

None.

## Allowed Areas

- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `CODEX_TASK.md`
- `REPO_CURRENT_STATE.md`
- `FOLLOWUPS.md`
- `AWS_RESOURCES.md`
- `TEST_PLAN.md`

## Do Not Touch

- App source code
- UI files
- Package dependencies
- Build configuration
- Deployment configuration
- Roller integration code
- AWS resources

## Requirements

1. Create any missing source-of-truth files:
   - `AGENTS.md`
   - `PROJECT_CONTEXT.md`
   - `DECISIONS.md`
   - `CODEX_TASK.md`
   - `REPO_CURRENT_STATE.md`
   - `FOLLOWUPS.md`
   - `AWS_RESOURCES.md`
   - `TEST_PLAN.md`
2. Update `AGENTS.md` with Codex working rules:
   - Work on one ticket only.
   - Do not broaden scope.
   - Do not implement future features.
   - Do not refactor unrelated code.
   - Do not commit unless explicitly requested.
   - Do not push to main.
   - Put out-of-scope findings in `FOLLOWUPS.md`.
   - Update `REPO_CURRENT_STATE.md` after the ticket.
3. Update `PROJECT_CONTEXT.md` with:
   - Project name: JumpYard Next.
   - Sprint 1 focus: connect the existing check-in app to Roller Playground through a server-side layer.
   - Target architecture: check-in app -> JumpYard Cloud/server API -> Roller API.
   - Roller is source of truth for bookings.
   - JumpYard Cloud/server API owns pilot state such as safety status, handoff code and session status.
   - Frontend must not call Roller directly in the real architecture.
4. Add this decision to `DECISIONS.md`:
   - `D0001`: Frontend must not call Roller directly in production architecture.
5. Initialize `REPO_CURRENT_STATE.md` with:
   - Current status: source-of-truth setup in progress.
   - Completed tickets: none.
   - Current ticket: T0000.
   - Known validation commands: list existing commands if obvious, otherwise write "Unknown".
   - Recommended next ticket: T0001 Roller Playground connectivity spike.
6. Initialize `FOLLOWUPS.md` with an empty section for future findings.
7. Initialize `AWS_RESOURCES.md` with:
   - No AWS resources created yet.
8. Initialize `TEST_PLAN.md` with placeholder sections:
   - Automated validation
   - Manual validation
   - Roller Playground validation
   - Staff handoff validation

## Non-Goals

- Do not implement Roller API calls.
- Do not create backend endpoints.
- Do not create AWS resources.
- Do not modify app functionality.
- Do not add payment logic.
- Do not add redeem logic.

## Acceptance Criteria

- All source-of-truth files exist.
- `AGENTS.md` clearly explains how Codex should work.
- `PROJECT_CONTEXT.md` clearly states Sprint 1 scope and target architecture.
- `DECISIONS.md` contains `D0001`.
- `REPO_CURRENT_STATE.md` recommends `T0001` as the next ticket.
- No app code was changed.

## Manual Verification

Open each source-of-truth file and confirm a new Codex session can understand the project without chat history.

## Automated Validation

Run markdown formatting or linting only if the repo already has such commands. Otherwise state that no automated validation was available for this docs-only ticket.
