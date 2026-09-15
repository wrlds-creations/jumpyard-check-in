---
name: project-context-hygiene
description: Audit and maintain long-running WRLDS project memory so durable context stays short, validated, archived, and consistent with GitHub Issues and Projects.
---

# Project Context Hygiene

Use this skill when repository memory needs maintenance: oversized context, stale merged-state claims, long validation history, archived legacy ledgers, or drift between durable docs and the GitHub-native workflow.

## Principles

- Audit before moving content.
- GitHub Issues own approved implementation scope; GitHub Project drafts and fields own operational planning.
- Repository Markdown owns durable facts, decisions, product guardrails, external gates, migration mappings, and useful history. Do not recreate a mutable work queue.
- Write workflow docs, skills, audit reports, Issue summaries, decisions, and validators in English by default.
- Preserve exact Swedish only for user-facing UX copy, staff/admin labels, product/business terminology, quoted evidence, or intentionally verbatim archive history.
- Prefer validators before broad rewrites.
- Archive before deleting. Deletion requires explicit user approval and a recoverable source location.
- Keep startup context short enough to read before every approved Issue.
- Keep historical material searchable in repository files instead of relying on chat memory.
- Do not change application behavior, AWS resources, Roller data, credentials, deployments, SMS, email, or UI copy unless the approved Issue explicitly allows it.

## Audit Checklist

1. Verify the GitHub-native handoff.
   - `CODEX_TASK.md` must remain a static resolver for `codex/gh-<issue>-<slug>`.
   - The branch must resolve to an approved repository Issue loaded with `gh issue view`.
   - Project drafts must remain explicitly unapproved and Project fields must not be mirrored in Markdown.
2. Review `PROJECT_CONTEXT.md`.
   - Keep confirmed current facts and constraints.
   - Move completed implementation narrative to `docs/history/` when it no longer helps every new Issue.
3. Review `REPO_CURRENT_STATE.md`.
   - Keep only the resulting merged-mainline structure, runtime baseline, validation entrypoints, and current boundaries.
   - Remove feature-branch progress, mutable priority/order, and pseudo-active-ticket tables.
4. Review followup and roadmap policy.
   - `FOLLOWUPS.md` must point new findings to unapproved Project drafts and must not contain an operational ledger.
   - `docs/roadmap/backlog.md` may retain policy, durable guardrails, external gates, and a migration pointer, but not status/priority queues.
   - Validate archived legacy IDs before moving or deleting source rows.
5. Review `DECISIONS.md`, `AWS_RESOURCES.md`, and history links for contradictions with merged code, infrastructure, and Project policy.
6. Record findings in an audit report before broad edits.

## Target Archive Structure

- `docs/history/completed-tickets.md`
- `docs/history/validation-log.md`
- `docs/history/sprint-1-ticket-history.md`
- `docs/history/followups-done.md`
- `docs/history/github-project-migration-*.md`
- `docs/roadmap/backlog.md` for policy, guardrails, external gates, and migration links only

## Safe Migration Order

1. Reconcile from current approved `main` and inspect Issues, Project items, branches, and PR history.
2. Write an audit report with exact intended moves and non-goals.
3. Add validators for both the preserved archive and the new source-of-truth shape.
4. Move one category at a time and preserve legacy mappings.
5. Run `npm run validate` and relevant domain checks.
6. Update durable context and decisions with the resulting merged facts.

## Report Format

Include:

- Current-state summary
- Findings and risk levels
- Files and GitHub state inspected
- What changed and what stayed out of scope
- Archive and migration mappings
- Validators run or deferred
- Remaining risks, external gates, and approvals
