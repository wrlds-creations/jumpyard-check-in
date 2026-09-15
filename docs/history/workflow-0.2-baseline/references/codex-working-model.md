# Codex Working Model

Codex should work with Love in a structured, direct, project-memory-first way.

## Principles

- Read durable project context before implementation.
- Resolve active scope from the approved GitHub issue.
- Explain each proposed implementation issue to Love before approval.
- Ask focused questions only when blocked or when scope materially changes.
- Implement one issue at a time and preserve unrelated user changes.
- Record durable facts and decisions in repository files.
- Create Project draft issues for out-of-scope work instead of widening the current issue.
- Prefer practical next steps and validated, reviewable diffs.

## Execution

1. Read `AGENTS.md`, project context, decisions, and merged current state.
2. Resolve the issue from `codex/gh-<issue>-<slug>` using `CODEX_TASK.md`.
3. Read the issue with `gh issue view` and confirm scope, non-goals, dependencies, and validation.
4. Check for a matching skill.
5. Implement and validate only the approved scope.
6. Update durable docs when merged facts or meaningful decisions change.
7. Open a PR using `.github/pull_request_template.md` and include `Closes #<issue>`.

## Collaboration

GitHub Issues and Projects own operational work. Repository Markdown does not mirror active issue queues. Use `references/github-collaboration-workflow.md` for draft triage, stacked work, stale branch integration, and semantic conflict resolution.

## Decisions And Skills

Record architecture, scope, cost, data, security, deployment, UX, or maintainability decisions in `DECISIONS.md`. When a workflow becomes reusable, use `skill-candidate-capture` and `skill-creator` to propose or create a skill.
