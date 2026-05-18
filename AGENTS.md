# WRLDS Codex Agreement

This repo uses the WRLDS Codex workflow. Keep it practical: understand the project, work in branches, document decisions, and handle AWS carefully.

## Before Coding

1. Read `PROJECT_CONTEXT.md`.
2. Read `DECISIONS.md`.
3. Read `REPO_CURRENT_STATE.md` when it exists.
4. Check local `skills/` for a matching workflow.

Use project files as the source of truth. Do not rely on chat history when the repo has confirmed context.
Use `FOLLOWUPS.md` for out-of-scope issues, deferred improvements, and follow-up tickets.

## Working Rules

- Ask focused questions only when missing information blocks the task.
- Work in a feature branch. Do not push directly to `main`.
- Do not commit unless explicitly asked.
- Implement one scoped task or ticket at a time.
- Do not implement future-ticket features unless explicitly asked.
- Do not refactor unrelated systems unless required for the current task.
- Prefer small, reviewable diffs.
- When confirmed project facts change, update `PROJECT_CONTEXT.md`.
- When a meaningful decision is made, update `DECISIONS.md`.
- When a ticket is completed, update `REPO_CURRENT_STATE.md` if repo structure, commands, dependencies, validation status, or next steps changed.
- When out-of-scope work is discovered, record it in `FOLLOWUPS.md` instead of fixing it automatically.
- When a workflow becomes reusable, suggest creating or updating a skill.

## Repository Shape

- `jumpyard-checkin-phone/`: customer phone check-in web app.
- `jumpyard-checkin-kiosk/`: in-park kiosk check-in web app.
- `jumpyard-checkin-admin/`: staff PWA for redemption and handout workflows.
- Root workflow files document project context, current state, decisions, followups, and validation.

## AWS Work

Before creating, changing, deploying, or deleting AWS resources:

1. Read `AWS_RESOURCES.md`.
2. Use `skills/aws-project-infrastructure/`.
3. Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center.
4. Update `AWS_RESOURCES.md` when AWS changes.

## Handoff

Always summarize changed files, commands run, validation performed, manual verification performed or still needed, docs updated or still needed, risks or open questions, follow-up tickets, and the recommended next step.
