---
name: github-collaboration
description: Manage WRLDS GitHub Project drafts, approved issues, issue-backed branches and PRs, controlled releases/deployments, stacked work, stale branch integration, backlog migration, and semantic documentation conflicts without mutable shared ticket ledgers.
---

# GitHub Collaboration

Use this skill for operational planning, issue creation or triage, branch and PR preparation, controlled release/deployment work, stacked work, legacy branch integration, or migration away from Markdown ticket ledgers.

## Workflow

1. Identify the linked GitHub Project and repository.
2. Determine whether the work is an unapproved draft, approved issue, active PR, stacked dependency, or integration task.
3. Read `../../references/github-collaboration-workflow.md`.
4. Keep drafts in the Project until approved; convert approved drafts to repository issues.
5. Resolve active scope from `codex/gh-<issue>-<slug>` and `gh issue view`.
6. Preserve unrelated work and never rewrite a colleague's branch.
7. Use a clean current-main integration branch for stale shared branches.
8. Resolve source and documentation conflicts by intended combined behavior and evidence.
9. Validate before opening a PR and include `Closes #<issue>`.
10. Put new out-of-scope work into Project drafts.
11. For deployment work, build one immutable artifact, plan it before protected approval, deploy without rebuilding, and use the same path for a selected prior-artifact rollback.

## Guardrails

- Do not implement a Project draft before approval.
- Do not allocate new manual `T####` IDs.
- Do not rewrite `CODEX_TASK.md` per branch.
- Do not mirror mutable Project fields in Markdown.
- Do not merge stale branches directly into `main`.
- Do not force-push a colleague's branch.
- Do not choose an entire conflicted document based only on timestamp.
- Do not deploy an arbitrary branch, rebuild during promotion/rollback, or bypass a protected environment with a routine local command.
- Do not close a release Issue until post-merge deploy and rollback evidence are merged; use a dependent evidence PR when necessary.

## Completion

Report the issue/PR URLs, Project items created or changed, branch/base/dependencies, validation, release/deploy/rollback run IDs, semantic conflict decisions, durable docs updated, and unresolved risks.
