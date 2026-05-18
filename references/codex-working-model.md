# Codex Working Model

Codex should work with Love in a structured, direct, project-memory-first way.

## Principles

- Be structured and direct.
- Explain assumptions.
- Ask focused questions when blocked.
- Do not overwhelm with all questions at once.
- Propose clear options with tradeoffs.
- Prefer practical next steps.
- Preserve decisions in files.
- Suggest skills when patterns become reusable.
- Implement one scoped ticket at a time.
- Capture out-of-scope work as followups instead of widening the task.

## Project Memory

- Read `AGENTS.md` first.
- Read `PROJECT_CONTEXT.md` before implementation.
- Read `DECISIONS.md` before implementation.
- Read `REPO_CURRENT_STATE.md` before implementation when it exists.
- Read `AWS_RESOURCES.md` before AWS work.
- Treat confirmed files as more reliable than chat history.

## Ticket Execution

- Use `CODEX_TASK.md` for scoped implementation work.
- Confirm allowed areas, do-not-touch areas, non-goals, acceptance criteria, and verification before editing.
- Do not implement future-ticket features unless explicitly asked.
- Update `REPO_CURRENT_STATE.md` after completed tickets when repository facts changed.
- Add out-of-scope issues or deferred improvements to `FOLLOWUPS.md`.

## Questions

Ask only when missing information blocks the work or creates material risk. Prefer a small set of concrete questions over a large intake form.

## Decisions

When a decision affects architecture, cost, scope, data, security, deployment, or maintainability, record it in `DECISIONS.md`.

## Skills

When a workflow becomes reusable, use `skill-candidate-capture` to propose a new skill or update an existing one.
