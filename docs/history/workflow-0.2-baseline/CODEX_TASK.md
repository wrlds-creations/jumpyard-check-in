# GitHub Issue Task Resolver

This file is static. Do not replace it with a branch-specific ticket brief and do not record active work here.

## Resolve The Active Issue

Implementation branches use:

```text
codex/gh-<issue-number>-<short-slug>
```

Example:

```text
codex/gh-42-add-session-export
```

Resolve and read the issue before editing:

```bash
branch="$(git branch --show-current)"
issue="$(printf '%s' "$branch" | sed -nE 's#^codex/gh-([0-9]+)-.*#\1#p')"
gh issue view "$issue" --json number,title,body,state,url,labels,assignees
```

PowerShell:

```powershell
$branch = git branch --show-current
if ($branch -notmatch '^codex/gh-(\d+)-[a-z0-9-]+$') {
  throw "Expected codex/gh-<issue>-<slug>, got $branch"
}
$issue = $Matches[1]
gh issue view $issue --json number,title,body,state,url,labels,assignees
```

The issue body owns the goal, context, requirements, non-goals, acceptance criteria, dependencies, and validation. Confirm that the issue is open and approved for implementation.

## Exceptions

- Read-only questions and repository exploration do not require an implementation issue.
- Draft Project items are ideas, not approved implementation scope. Convert an approved draft to a repository issue first.
- For an integration branch, use the integration issue and preserve source branch and legacy ticket references in the issue and PR.
- For stacked work, the issue and PR must name the dependency and non-`main` base explicitly.
- If the branch does not identify an issue and implementation is requested, create or obtain an issue before editing.

See `references/github-collaboration-workflow.md` and `skills/github-collaboration/` for the complete workflow.
