# Project Context Hygiene Audit

Date: 2026-06-15
Ticket: T0127
Scope: documentation, workflow, and validation only

## Current State Summary

The repository has passed 120 completed tickets and now carries substantial working memory in `PROJECT_CONTEXT.md`, `REPO_CURRENT_STATE.md`, `FOLLOWUPS.md`, `TEST_PLAN.md`, and supporting runbooks. This is valuable history, especially because it preserves Swedish business wording and detailed Roller/AWS validation evidence, but the active context is becoming long enough that future agents can miss the small state that matters for the next ticket.

The immediate hygiene issue found at T0127 start was stale active-ticket state:

- `REPO_CURRENT_STATE.md` said T0125 was completed and no active ticket remained after T0125 correction.
- `CODEX_TASK.md` still described T0125.
- `REPO_CURRENT_STATE.md` correctly reserved T0126 for the final Pelle/Anders demo rehearsal.

T0127 should fix this mismatch and add validation so the same stale state fails locally next time. It should not move large historical sections yet.

## Found Issues

| Issue | Risk | Evidence | Recommendation |
|---|---|---|---|
| Stale active-ticket handoff between `CODEX_TASK.md` and `REPO_CURRENT_STATE.md`. | High | T0125 was completed, but `CODEX_TASK.md` still described T0125. | Add dedicated current-ticket validation and update `CODEX_TASK.md` to T0127. |
| `PROJECT_CONTEXT.md` contains long ticket-by-ticket narrative. | Medium | The file preserves many implementation paragraphs through T0125. | Keep current facts in place now; later move old ticket narrative to `docs/history/sprint-1-ticket-history.md` after validators support links. |
| `REPO_CURRENT_STATE.md` combines current snapshot, completed tickets, validation status, known issues, and historical evidence. | Medium | The file is still useful, but its completed-ticket and validation sections are large. | Later archive completed-ticket table and old validation logs into `docs/history/` while keeping a short current snapshot. |
| `FOLLOWUPS.md` has done rows under `## Open Followups`. | Medium | Several rows in the open table have Status `Done`. | Defer automatic validation until a migration moves done rows safely to `docs/history/followups-done.md` or `## Resolved Followups`. |
| `FOLLOWUPS.md` has duplicate followup ids. | Medium | Observed duplicate ids include `FU-043` and `FU-083`. | Defer strict duplicate-id validation until rows are intentionally renumbered or archived in a scoped followup hygiene ticket. |
| A 50-ticket forward backlog would bloat `REPO_CURRENT_STATE.md` if placed there. | Medium | Current confirmed-next rows are useful for near-term work only. | Put broad roadmap planning in `docs/roadmap/backlog.md`; keep only the current ticket and a few confirmed next tickets in repo state. |
| Prompt handoff files can become accidental repo clutter. | Low | A prompt `.txt` file is present locally and should be deleted later by explicit user action. | Do not delete in T0127; mention cleanup separately. |

## Recommended Target File Structure

Future context migrations should use this structure:

```text
docs/
|-- context-hygiene-audit.md
|-- history/
|   |-- completed-tickets.md
|   |-- validation-log.md
|   |-- sprint-1-ticket-history.md
|   `-- followups-done.md
`-- roadmap/
    `-- backlog.md
```

`REPO_CURRENT_STATE.md` should remain the short operational entrypoint:

- current branch
- current ticket
- current status
- completed-ticket summary or link
- confirmed next tickets
- recent validation status
- current risks and blockers only

`PROJECT_CONTEXT.md` should remain the stable project memory:

- project identity
- architecture and ownership facts
- durable product decisions and constraints
- recent active-flow facts
- links to archived history instead of long old narratives

## Exact Proposed Future Tickets

| Proposed Ticket | Goal | Notes |
|---|---|---|
| T0128 | Followup hygiene validation and resolved-row migration. | Add `scripts/validate-followups.js`, resolve duplicate ids, and move `Done` open rows to a safe resolved/history location. |
| T0129 | Validator-aware completed-ticket archive. | Move older completed-ticket rows from `REPO_CURRENT_STATE.md` to `docs/history/completed-tickets.md` after validation can read the new location. |
| T0130 | Validation-log archive. | Move older validation bullets from `REPO_CURRENT_STATE.md` and `TEST_PLAN.md` into `docs/history/validation-log.md` without losing evidence. |
| T0131 | Project-context history split. | Move older ticket narrative from `PROJECT_CONTEXT.md` to `docs/history/sprint-1-ticket-history.md`; keep stable current facts and links. |
| T0132 | 50-ticket forward backlog foundation. | Create `docs/roadmap/backlog.md` with planned status fields so broad roadmap planning does not bloat repo state. |
| T0133 | Current snapshot compression. | After archive files exist, shorten `REPO_CURRENT_STATE.md` to current operational state plus links. |

T0126 should remain reserved for the final Pelle/Anders demo rehearsal unless the user explicitly reprioritizes.

## What Should Not Change Yet

- Do not move completed-ticket history in T0127.
- Do not move validation history in T0127.
- Do not renumber followups in T0127.
- Do not delete prompt files or historical context in T0127.
- Do not edit phone, admin, kiosk, backend, AWS, Roller, payment, SMS, or email behavior.
- Do not translate or rewrite Swedish UX/business terms while moving context.

## Validator Changes Needed Before Moving History

Before moving historical sections, validators should support the future locations:

- Completed ticket checks should read both `REPO_CURRENT_STATE.md` and `docs/history/completed-tickets.md`.
- Validation-history checks should tolerate archived logs when a source file intentionally links to them.
- Followup checks should fail on duplicate ids and `Done` rows under `## Open Followups`, but only after the existing rows have been migrated safely.
- Roadmap checks should ensure broad backlog items live in `docs/roadmap/backlog.md`, while `REPO_CURRENT_STATE.md` keeps only active and near-term tickets.

## Phased Migration Plan

1. T0127: add active-ticket validation, context-hygiene skill, and this audit report.
2. T0128: clean and validate followups.
3. T0129: add archive-aware completed-ticket validation, then move completed-ticket history.
4. T0130: archive older validation logs.
5. T0131: archive old project-context ticket narrative.
6. T0132: create the 50-ticket forward backlog outside repo state.
7. T0133: compress current snapshot files after links and validators are proven.

## Supporting 50 Forward Tickets

Use `docs/roadmap/backlog.md` for the broad backlog. Suggested fields:

- Ticket id
- Theme
- Goal
- Dependencies
- Risk level
- Scope boundary
- Validation expectation
- Status

Keep `REPO_CURRENT_STATE.md` limited to the active ticket plus a small confirmed-next list. This prevents the current snapshot from becoming another backlog database.

## Preserving Swedish Working History

When archiving Swedish history:

- copy text exactly unless the ticket explicitly scopes cleanup
- preserve ticket ids, dates, names, and product terms
- keep Swedish UX copy such as `Betalning`, `Presentkort`, `Klippkort`, `Lämna ut vid incheckning`, and `Hämtas efter hoppet`
- add links from the shorter source files to archive files
- avoid summarizing away operational decisions that were reached in Swedish chat context

## T0127 Decisions

T0127 should add only the low-risk current-ticket validator. Followup validation is intentionally deferred because the current followup table already contains duplicate ids and `Done` rows under open followups; making that strict now would require a broader migration.

## Remaining Risks

- The current repository still has large historical files after T0127.
- Followup hygiene remains partially manual until T0128.
- Future agents must use the new validation command instead of relying on visual inspection only.
- The local prompt `.txt` file still needs explicit user-approved cleanup later.
