# GitHub issue resolver

This file is static. GitHub owns issue scope and Project status; local branch progress belongs in ignored .wrlds-local notes.

## Implementation

Branches use codex/gh-<issue-number>-<short-slug>. Resolve the branch against the repository in .wrlds.json and the Git origin:

```sh
node scripts/wrlds/resolve-issue.js
```

The command reads the issue through GitHub CLI, validates its identity and minimum task content, and prints the source and timestamp. It does not create issues, change status or infer user approval.

Read the returned issue, including requirements, non-goals, dependencies, acceptance criteria and validation. Existing explicit user authorization applies. Draft ideas alone do not authorize implementation. Before a new branch, an explicitly supplied owner/repository#number or full GitHub issue URL may be passed with --issue; on an issue branch the two identities must agree.

## Offline continuation

To save an online snapshot locally, add --save-cache. The ignored snapshot is .wrlds-local/issue.json. Later, --offline reads only a matching snapshot and reports its age. It never claims fresh GitHub state or grants new permission.

Continue previously authorized local work when the snapshot and current user instructions are sufficient. Keep pending external updates in .wrlds-local/pending.md. Before publishing or changing remote status, fetch fresh state, reconcile newer edits, and apply only authorized changes. Missing task content or a material scope conflict requires clarification.

Read-only exploration does not need an issue. Stacked work and legacy references follow [the collaboration workflow](references/github-collaboration-workflow.md).
