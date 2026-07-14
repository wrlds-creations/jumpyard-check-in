# GitHub Collaboration Workflow

This reference defines the reusable WRLDS collaboration model for people and AI working in parallel.

## Sources Of Truth

| Concern | Source of truth |
|---|---|
| Unapproved idea | GitHub Project draft issue |
| Approved implementation scope | Repository issue |
| Priority, status, type, track, owner | GitHub Project fields |
| Implementation and review | Issue-backed branch and PR |
| Merged repository facts | `REPO_CURRENT_STATE.md` and code on `main` |
| Durable project facts | `PROJECT_CONTEXT.md` |
| Durable decisions | `DECISIONS.md` |
| External gates and product guardrails | `docs/roadmap/backlog.md` or `FOLLOWUPS.md` |
| Completed work | Closed issues and merged PRs |
| Legacy evidence | `docs/history/` |

Do not maintain a second operational queue in Markdown.

## Project Setup

GitHub CLI project operations require the `project` token scope:

```bash
gh auth refresh -h github.com -s project
gh auth status
```

Create and link an organization project:

```bash
gh project create --owner <organization> --title "<Project name>"
gh project link <project-number> --owner <organization> --repo <repository-name>
```

Set the default repository in the Project settings. Recommended status options are `Inbox`, `Backlog`, `Ready`, `In progress`, `In review`, `Blocked`, `Parked`, and `Done`. Common fields are `Priority`, `Type`, `Track`, and `Owner`; migrations may add `Legacy ID` temporarily.

Create custom fields with commands such as:

```bash
gh project field-create <project-number> --owner <organization> --name Priority --data-type SINGLE_SELECT --single-select-options "P0,P1,P2,P3"
gh project field-create <project-number> --owner <organization> --name Track --data-type SINGLE_SELECT --single-select-options "Product,Platform,ML,Operations"
```

Field options are project-specific. Inspect IDs before automating updates:

```bash
gh project field-list <project-number> --owner <organization> --format json
```

## Draft Issue Triage

Create a draft for an idea that is not yet approved:

```bash
gh project item-create <project-number> --owner <organization> \
  --title "Short outcome-oriented title" \
  --body "Context, desired outcome, scope boundary, dependencies, risk, and validation expectation."
```

Triage the draft by setting Project fields and adding enough context to make an approval decision. Drafts may remain in `Inbox`, `Backlog`, `Blocked`, or `Parked`; they are not implementation authorization.

When approved, convert the existing draft to a repository issue from the Project item menu or an available GitHub API integration. Select the linked/default repository and use the implementation issue form fields. Do not create a second issue and leave an ambiguous duplicate draft. Verify the resulting issue with:

```bash
gh issue view <issue-number> --repo <organization>/<repository>
```

## Approved Issue Contract

An implementation issue owns:

- Goal
- Context
- Requirements
- Non-goals
- Acceptance criteria
- Dependencies and approved base
- Validation

Project fields own priority, status, type, track, and owner. Avoid copying those mutable fields into source-controlled task files.

## Branch And PR

Create a branch from the current approved base:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/gh-42-add-session-export
```

Use `codex/gh-<issue-number>-<short-slug>` for new work. Read the issue before editing:

```bash
gh issue view 42 --json number,title,body,state,url,labels,assignees
```

The PR must:

- contain `Closes #42`;
- name the base branch and dependencies;
- summarize intended behavior rather than only files changed;
- report automated and manual validation;
- identify unresolved risks and follow-up drafts;
- avoid unrelated changes.

## Stacked Work

Stack only when issue B truly depends on unmerged issue A.

1. Create B from A's branch.
2. Record `Depends on #A` and `Base: <A branch>` in issue B and PR B.
3. Target PR B at A's branch while A is open.
4. Do not duplicate A's commits in review summaries.
5. After A merges, update B from current `origin/main` and retarget B to `main`.
6. Rebase or force-push only a branch you own and only when collaborators have agreed. Never rewrite a colleague's branch.

Independent work should branch from `main`, even when it begins before another PR is merged.

## Permanent Integration Rule

Never merge a stale shared branch directly into `main`.

1. Fetch all remote state.
2. Preserve the contributor's source branch unchanged.
3. Create a clean worktree from current `origin/main`.
4. Create an issue-backed integration branch named `codex/gh-<issue>-integrate-<topic>`.
5. Merge the source branch into the integration branch without rebasing or force-pushing the source branch.
6. Resolve source code according to intended combined behavior and tests.
7. Regenerate generated files using the canonical command instead of manually combining generated output.
8. Resolve shared documentation semantically.
9. Validate the integrated behavior.
10. Open a reviewed PR to `main` with `Closes #<integration-issue>`.

Example:

```bash
git fetch origin
git worktree add ..\repo-integrate origin/main
cd ..\repo-integrate
git switch -c codex/gh-84-integrate-camera-work
git merge --no-ff --no-commit origin/codex/legacy-camera-work
# Resolve, regenerate, validate, then commit.
```

## Semantic Conflict Resolution

Do not select an entire shared Markdown file because one copy is newer.

- Preserve independent durable decisions from both branches.
- Combine append-only history; dates may order entries but do not determine truth.
- Resolve conflicting facts from merged code, canonical generated output, and validation evidence.
- Keep `REPO_CURRENT_STATE.md` focused on the resulting merged mainline, not either branch's progress narrative.
- Keep the latest mainline operational policy when a stale branch contains an old backlog or task ledger.
- Create Project drafts for still-actionable findings instead of restoring legacy tables.

## Duplicate Legacy Ticket IDs

Historical branches may contain the same manual `T####` ID for unrelated work. Do not rewrite commits or renumber history.

Preserve enough context to disambiguate each reference:

- legacy ID;
- ticket title or outcome;
- source branch;
- source commit or PR when available.

The integration issue and new GitHub issue number become canonical. A migration record can map each legacy reference to its issue or Project item URL.

## Backlog Migration

Migrate from reconciled `main`, not from a stale feature branch.

1. Inspect existing issues, Project drafts, open branches, and merged PRs.
2. Count actionable legacy rows.
3. Create one migration issue and branch for repository-document changes.
4. Convert each still-actionable row to one Project draft, preserving legacy ID, goal, dependencies, risk, scope boundary, validation expectation, and status.
5. Do not migrate completed work or external approval gates.
6. Keep external gates and durable product guardrails in repository docs.
7. Replace operational backlog tables with the Project link, policy, gates, guardrails, and a one-time migration record link.
8. Compare final Project item count and legacy IDs against the source count before merging.

New ideas go directly to Project drafts. Create a separate proposal document only when the design is too complex for an issue body.
