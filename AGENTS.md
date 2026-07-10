# WRLDS Codex Agreement

This repository uses the WRLDS Codex workflow. Treat the source-of-truth files in the repository as more reliable than chat history.

## Start Every Ticket

1. Read `PROJECT_CONTEXT.md`.
2. Read `DECISIONS.md`.
3. Read `REPO_CURRENT_STATE.md`.
4. Read the current ticket in `CODEX_TASK.md`.
5. Check local `skills/` for a matching workflow when relevant.

## Working Rules

- Work on one ticket only.
- Do not broaden scope beyond the current ticket.
- Do not implement future-ticket features unless explicitly asked.
- Do not refactor unrelated code.
- Do not touch files outside the ticket's allowed areas unless the user explicitly approves it.
- Put out-of-scope findings in `FOLLOWUPS.md` instead of fixing them automatically.
- Update `REPO_CURRENT_STATE.md` after the ticket.
- Update `PROJECT_CONTEXT.md` when confirmed project facts change.
- Update `DECISIONS.md` when a meaningful architecture, scope, data, security, deployment, or maintainability decision is made.
- Do not commit unless explicitly asked.
- Do not push directly to `main`.

## Branch And Commit Workflow

- Use one dedicated branch per ticket unless the user explicitly says otherwise.
- Name ticket branches with the `codex/` prefix, for example `codex/t0003-booking-lookup-contract`.
- Create each ticket branch from the current approved base, preferably `main` or the latest merged ticket branch.
- A commit saves changes only to the current branch; it does not update `main` by itself.
- Stage and commit only files that belong to the current ticket.
- Leave unrelated local assets, deliverables, and user changes unstaged unless the ticket explicitly includes them.
- Push ticket branches to GitHub only when explicitly requested.
- Bring work into `main` through a review/merge step, not by committing or pushing directly to `main`.

## Project Direction

- Sprint 2 is closed. The active Sprint 3 workstream covers the phone check-in app, the staff/admin app, and the JumpYard Cloud capabilities required by those two surfaces.
- The complete Sprint 3 production target includes approved initial booking backfill, scheduled morning seed, Roller webhook processing/reconciliation, normalized Aurora state, and automatic SMS plus email check-in links 30 minutes before the selected booking time.
- Roller remains the booking source of truth; the Aurora booking index is an operational cache used for lookup, scheduling, handoff, audit, and recovery.
- Kiosk/print/terminal implementation and JumpyBoard/AirHive activity-data implementation belong to separate project folders/workstreams. Keep only explicit interface-contract dependencies in this ticket queue.
- The production architecture must be `check-in app -> JumpYard Cloud/server API -> Roller API`.
- Roller is the source of truth for bookings.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, and session status.
- The frontend must not call Roller directly in the real architecture.

## Ticket Explanation

Before activating an implementation ticket, explain it to Love in plain language:

- what changes and why;
- a useful analogy when the technical reason is not obvious;
- what is included and explicitly excluded;
- the main risk, cost, and dependency;
- how completion will be verified; and
- which approval or decision is still required.

Planned backlog rows are not implementation approval. Work only on the single ticket recorded as active in `CODEX_TASK.md`.

## AWS Work

Before creating, changing, deploying, or deleting AWS resources:

1. Read `AWS_RESOURCES.md`.
2. Use `skills/aws-project-infrastructure/`.
3. Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center.
4. Update `AWS_RESOURCES.md` when AWS resources change.

No AWS resources should be created for a ticket unless the ticket explicitly allows AWS work.

## Handoff

Summarize changed files, validation performed, manual verification performed or still needed, docs updated, risks or open questions, follow-up tickets, and the recommended next step.
