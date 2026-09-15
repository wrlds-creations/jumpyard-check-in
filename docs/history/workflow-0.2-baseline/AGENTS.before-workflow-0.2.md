# WRLDS Codex Workflow

This project uses the WRLDS GitHub-native Codex workflow. `AGENTS.md` is the first file Codex should read, but it is not the full project memory.

## Required Reading Order

Start every implementation issue by reading:

1. Read `PROJECT_CONTEXT.md`.
2. Read `DECISIONS.md`.
3. Read `REPO_CURRENT_STATE.md`.
4. Read the static task resolver in `CODEX_TASK.md`, resolve the issue number from the current branch, and load the issue with `gh issue view`.
5. Check `skills/` for a matching domain or workflow skill, including `github-collaboration` for branch, PR, Project, integration, release, or deployment work.

Before AWS work, also read `AWS_RESOURCES.md` and use the `aws-project-infrastructure` skill.

## Source Of Truth

- Do not treat chat history as the source of truth when confirmed project or GitHub records exist.
- GitHub Issues own active implementation scope: goal, context, requirements, non-goals, acceptance criteria, dependencies, and validation.
- GitHub Projects own operational planning: priority, status, work type, track, owner, and draft ideas.
- Use `PROJECT_CONTEXT.md` for confirmed project facts, constraints, commands, environments, and open questions.
- Use `DECISIONS.md` for meaningful decisions, rationale, impact, and revisit triggers.
- Use `AWS_RESOURCES.md` for AWS resources affecting cost, security, data, deployment, or ownership.
- Use `REPO_CURRENT_STATE.md` for the latest merged mainline snapshot and known validation state. Do not record feature-branch progress there.
- `CODEX_TASK.md` is a static issue resolver. Do not rewrite it per branch.
- Create out-of-scope findings and follow-up ideas as GitHub Project draft issues instead of editing a shared operational ledger.
- Use `FOLLOWUPS.md` and `docs/roadmap/backlog.md` only for durable external gates, product guardrails, and migration pointers that belong in version control.
- Use `docs/history/` for archived historical evidence that remains useful after Issues and PRs close.

## Context Hygiene

- Use `skills/project-context-hygiene/` before moving, archiving, compressing, or deleting project memory content.
- Audit before moving content, run validators before large rewrites, and archive useful history before deleting it.
- Keep active project context short and current while preserving historical material in searchable repository files.
- Source-of-truth docs are English by default. Preserve exact non-English wording only for user-facing copy, business terminology, quoted evidence, or intentionally verbatim raw history.
- Validators should check structure and consistency, not enforce a human language choice.

## Working Rules

- Ask focused questions only when missing information blocks the issue.
- Work on one approved repository issue at a time. Draft issues are not implementation authorization.
- Explain an implementation issue to Love in plain language before approval: what changes and why, a useful analogy when needed, what is included and excluded, risk/cost/dependencies, verification, and any remaining decision.
- Stay inside the issue requirements and non-goals. Ask before materially broadening scope.
- When confirmed project facts change, update `PROJECT_CONTEXT.md`.
- When a meaningful decision is made, update `DECISIONS.md`.
- When AWS infrastructure changes, update `AWS_RESOURCES.md`.
- Update `REPO_CURRENT_STATE.md` only when merged repository facts, structure, commands, dependencies, or validation baseline change.
- Create a Project draft for out-of-scope work instead of fixing it automatically.
- Do not implement future-issue features unless explicitly asked.
- Prefer small, reviewable diffs and explain new dependencies.
- Do not touch files outside the issue's allowed scope unless Love explicitly approves it.
- Do not push directly to `main`.
- Do not commit unless explicitly asked.
- Local development and validation are normal. A merge to `main` builds an immutable Park release but does not deploy it. Park verification and Nacka public pilot-production promotion must use that selected artifact through the protected `park-test` environment.
- Do not rebuild during deploy or rollback. Select the successful release workflow run and exact commit SHA, review the plan, then promote that same artifact.
- Local CDK or Wrangler deployment to park-test is break-glass only. It requires an approved Issue that explicitly authorizes the exception, the exact target and reason, and a follow-up record in GitHub.

## Branch And PR Workflow

- Use one dedicated branch per approved issue unless stacked work is explicitly documented.
- Name branches `codex/gh-<issue-number>-<short-slug>`, for example `codex/gh-42-add-session-export`.
- Create the branch from the current approved base, normally current `origin/main`.
- Stage and commit only issue-owned files; preserve unrelated user changes.
- A PR must include `Closes #<issue>`, its base and dependencies, validation results, manual verification, and unresolved risks.
- Bring work into `main` through a reviewed PR.
- Follow `references/github-collaboration-workflow.md` for drafts, stacked work, stale branch integration, duplicate legacy IDs, and semantic documentation merges.
- A release/deploy Issue may use one implementation PR and one dependent rollout-evidence PR when the protected workflow can only be proven after its workflow files reach `main`. Keep the Issue open until rollout evidence is merged.

## Project Boundary

- Sprint 3 implementation scope is the phone check-in app, the staff/admin app, and the JumpYard Cloud capabilities required by those surfaces.
- Roller remains the booking source of truth; Aurora is an operational cache for lookup, scheduling, handoff, audit, and recovery.
- The production architecture remains `check-in app -> JumpYard Cloud/server API -> Roller API`; frontends do not call Roller directly.
- Kiosk/print/terminal and JumpyBoard/AirHive activity-data implementation remain separate workstreams. Only explicit interface contracts may cross those boundaries.

## AWS Work

Before creating, changing, deploying, or deleting AWS resources:

1. Read `AWS_RESOURCES.md`.
2. Use `skills/aws-project-infrastructure/`.
3. Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center.
4. Update `AWS_RESOURCES.md` when AWS resources change.

No AWS resources should be created for an issue unless the issue explicitly allows AWS work.

For routine park-test releases after T0198:

1. Merge reviewed code through a PR and let `.github/workflows/release.yml` build the immutable artifact.
2. Dispatch `.github/workflows/deploy-park-test.yml` from `main` with the successful release run ID, full SHA, intent, and exact approval phrase.
3. Review the read-only plan before approving the protected `park-test` job.
4. Use the same workflow and an earlier successful release artifact for rollback; never rebuild the old source during rollback.

New multi-park production infrastructure remains disabled and requires a separate approved Issue. Issue #264 approves the existing technically named `park-test` backend as Nacka pilot production and separately gates promotion of its phone/admin artifacts to the two public origins.

## Completion Summary

Always summarize:

- Issue and PR
- Changed files
- Commands and validation run
- Manual verification performed or still needed
- Durable docs updated
- Risks or unresolved questions
- Project drafts created for follow-ups
- Release, deployment, rollback, and re-promotion run IDs when deployment work occurred
- Recommended next step
