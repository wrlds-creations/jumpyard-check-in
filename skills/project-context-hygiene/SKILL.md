---
name: project-context-hygiene
description: Audit and maintain long-running WRLDS project context so active tickets stay short, validated, archived, and safe for future Codex work.
---

# Project Context Hygiene

Use this skill when the repository memory itself needs maintenance: stale ticket handoff state, oversized project context, long validation history, followup table drift, or forward backlog planning.

## Principles

- Audit before moving content.
- Write workflow docs, skills, audit reports, ticket summaries, decisions, and validators in English by default.
- Preserve exact Swedish only when it is user-facing UX copy, staff/admin UI labels, product or operational terminology that appears in the app/business process, quoted source evidence, or archived raw historical material intentionally copied verbatim.
- Do not translate or normalize Swedish UI strings such as `Betalning`, `Presentkort`, `Klippkort`, `Lämna ut vid incheckning`, `Hämtas efter hoppet`, and `Övrigt i bokningen`.
- When summarizing Swedish chat or history into active source-of-truth docs, summarize in English unless exact Swedish wording matters.
- Validators should not enforce a general language choice.
- Prefer validators before large rewrites.
- Archive before deleting. Deletion requires explicit user approval and a recoverable source location.
- Keep the active snapshot short enough for agents to read at ticket start.
- Keep historical material searchable in repository files instead of relying on chat memory.
- Do not change application behavior, AWS resources, Roller data, credentials, deployments, SMS, email, or UI copy during context hygiene unless the ticket explicitly allows it.

## Audit Checklist

1. Compare `CODEX_TASK.md` and `REPO_CURRENT_STATE.md`.
   - Confirm the active ticket id matches.
   - If `REPO_CURRENT_STATE.md` says no active ticket, confirm `CODEX_TASK.md` does not still describe a completed ticket.
   - Confirm recommended next tickets are not already completed.
2. Review size and shape of `PROJECT_CONTEXT.md`.
   - Identify long completed-ticket narrative that can later move to `docs/history/`.
   - Keep confirmed current project facts in place.
3. Review size and shape of `REPO_CURRENT_STATE.md`.
   - Keep the snapshot, current structure, current ticket, confirmed next tickets, and recent validation status short.
   - Identify older completed-ticket and validation history that can later move after validators support the new location.
4. Review `FOLLOWUPS.md`.
   - Flag duplicate followup ids.
   - Flag `Done` rows that still live under `## Open Followups`.
   - Do not renumber or move rows until the ticket explicitly scopes that migration.
5. Check whether a 50-ticket forward backlog belongs in `docs/roadmap/backlog.md` instead of `REPO_CURRENT_STATE.md`.
6. Record findings in an audit report before broad edits.

## Target Archive Structure

Use these destinations for future migrations after validators are ready:

- `docs/history/completed-tickets.md`
- `docs/history/validation-log.md`
- `docs/history/sprint-1-ticket-history.md`
- `docs/history/followups-done.md`
- `docs/roadmap/backlog.md`

## Safe Migration Order

1. Add or update validators for the current file shape.
2. Write an audit report with exact future moves.
3. Add validators that understand both old and new locations if moving history.
4. Move one category of history at a time.
5. Run `npm run validate`.
6. Update `REPO_CURRENT_STATE.md`, `PROJECT_CONTEXT.md`, and `DECISIONS.md` only with stable facts and workflow decisions.

## Report Format

Include:

- Current state summary
- Found issues with risk levels
- Files inspected
- What changed in the hygiene ticket
- What was intentionally not moved
- Recommended future tickets
- Validators added or deferred
- Remaining risks and user approvals needed
