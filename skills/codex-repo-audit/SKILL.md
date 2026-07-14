---
name: codex-repo-audit
description: Audit a repository for GitHub-native WRLDS Codex readiness, durable context, validation, infrastructure ownership, and reusable workflows.
---

# Codex Repo Audit

Use this skill to evaluate whether a repository is ready for reliable WRLDS Codex work.

## Checklist

Check whether:

- `AGENTS.md` defines source-of-truth, scope, branch, PR, and approval rules.
- `PROJECT_CONTEXT.md` contains stable project facts and boundaries.
- `DECISIONS.md` records meaningful decisions and superseded decisions.
- `CODEX_TASK.md` is a static resolver for issue-backed branches.
- Approved scope can be loaded from a repository Issue with `gh issue view`.
- A linked GitHub Project owns unapproved drafts and mutable status, priority, work type, track, and owner.
- `REPO_CURRENT_STATE.md` describes the resulting merged-mainline baseline rather than feature-branch progress.
- `FOLLOWUPS.md` is policy only and routes new findings to unapproved Project drafts.
- Roadmap Markdown contains only durable policy, guardrails, external gates, and migration evidence rather than an operational queue.
- Package scripts, setup commands, and validation entrypoints are documented.
- `AWS_RESOURCES.md` exists and is current when AWS is used.
- `skills/` covers reusable local workflows without contradicting the active GitHub model.
- Historical evidence and legacy ID mappings remain searchable and validated.
- Missing project information is represented as an external gate, durable open question, or unapproved Project draft as appropriate.

## Output

Report ready items, gaps, risks, recommended file or Project updates, and questions that block reliable work. Do not make broad edits unless the user asks for the findings to be applied.
