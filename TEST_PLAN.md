# Test Plan

Use this file to define validation for the current project or milestone.

## Automated Validation

| Command | Purpose | Result | Notes |
|---|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Passed | Passed on 2026-05-18. |

## Manual Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Source-of-truth document review | A new Codex session can understand Sprint 1 scope and constraints without chat history. | Pending | Review `AGENTS.md`, `PROJECT_CONTEXT.md`, `DECISIONS.md`, `CODEX_TASK.md`, `REPO_CURRENT_STATE.md`, `FOLLOWUPS.md`, `AWS_RESOURCES.md`, and `TEST_PLAN.md`. |

## Roller Playground Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Roller Playground connectivity | Server-side layer can connect to Roller Playground. | Not started | Planned for `T0001`. |

## Staff Handoff Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Staff handoff flow | Staff can use a server-owned handoff code/session status. | Not started | Future ticket; no redeem logic in `T0000`. |
