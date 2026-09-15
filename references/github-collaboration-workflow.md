# GitHub collaboration

## Information ownership

| Information | Owner |
|---|---|
| Goal, requirements, non-goals, acceptance and validation | Repository issue |
| Priority, planning state, owner and scheduling | Linked GitHub Project |
| Implementation/review evidence | Issue-backed branch and PR |
| Durable facts and decisions | Project context and decision log |
| Latest merged technical baseline | Repository current-state document |
| Temporary local execution/offline notes | Ignored .wrlds-local directory |

CODEX_TASK.md is a static resolver. Do not copy mutable fields into it. Configure the exact repository and Project URL in .wrlds.json. A draft is a proposal; approval can be given in the current user request and does not require a second ceremony.

## Start authorized work

Read the relevant issue with the repository explicitly specified. Use node scripts/wrlds/resolve-issue.js for validated identity/content. Check current git status and the approved base. An explicit implementation request permits creating its concrete repository issue and work branch if needed; preserve unrelated changes. Use one issue per branch/worktree.

Default branch names are codex/gh-<issue-number>-<short-slug>. The issue URL includes its repository; bare numbers and legacy T#### IDs are not globally unique identities.

## Permission boundaries

| Action | Authorization |
|---|---|
| Read repository/issues/Project | Normal task investigation |
| Necessary local edits, tests and docs | Approved implementation scope |
| Create/update an issue or Project item for the task | Requested issue/Project coordination, including an approved plan containing these actions |
| Post comments or contact collaborators | Explicit messaging instruction or an explicitly invoked skill that authorizes it |
| Commit/push | Explicit user request under WRLDS policy |
| Merge, close an issue, deploy or change cloud resources | Required task-specific authorization and completion evidence |

Do not ask again when the same action is already authorized. A cached status, issue label or unrelated historical approval is not new authorization. Preserve existing Project fields; avoid duplicates by searching before creation.

## Completion states

Use the Project's existing equivalent states; do not rename its taxonomy merely to adopt the template.

- In progress: implementation or required local verification is ongoing.
- In review: a verified change is ready for the agreed review/integration step. State whether a PR has actually been published.
- Blocked: a named external dependency prevents the remaining work; continue independent approved work.
- Done: the issue's full acceptance, integration and any specified release/manual checks are satisfied.

Local completion does not imply merge, CI execution or deployment. The final PR may use Closes #42 when merging really completes all issue criteria. Use Refs #42 when later rollout evidence is required, and keep the issue open.

## Offline work

The resolver's --save-cache stores issue identity, body and source timestamps in .wrlds-local/issue.json. --offline validates its repository/branch and reports snapshot age without pretending it is current. Continue sufficiently specified, already authorized local work. Capture pending updates separately. Refresh before remote changes and reconcile rather than replacing newer issue content or Project fields. Ask only when missing/conflicting information blocks the next action.

## Stacked work and integration

Independent work starts from current approved mainline. If an issue truly depends on unmerged work, state Depends on owner/repository#number and the exact base branch/SHA in the issue and PR. Preserve the dependency chain and revalidate after its base changes.

For stale shared branches, create a clean integration branch from the approved current base. Inspect original scope and intended combined behavior. Port relevant changes and resolve docs semantically; never select an entire document only because its timestamp is newer. Do not force-push another contributor's branch. Review the combined result and keep source references.

## Legacy migration

Inventory source rows, issues, drafts and branches before migration. Reuse existing issues; do not renumber history. Map each unique legacy reference together with its source repository to its canonical issue/Project URL. Compare source and destination records, preserve useful history, then replace duplicate queues with pointers. Archive first; do not silently drop gates or unresolved work.

## Project setup

Reuse a suitable existing Project and its fields. If a new Project is authorized, create it in the intended owner account, link the repository, and choose status/priority fields appropriate to that team. Confirm access with GitHub CLI or the connector before relying on writes. Record the URL and available statuses; never invent Project IDs or tool permissions.

## Release And Deployment

Repository review and environment promotion are separate controls:

1. Merge implementation through a reviewed, issue-backed PR.
2. Build one immutable release artifact for the eligible `main` commit and record its full SHA and hashes.
3. Plan the selected artifact against the exact target with a read-only identity.
4. Approve the protected environment only after the plan is visible.
5. Deploy the already-built artifact without rebuilding and record post-deploy evidence.
6. Roll back by selecting a prior successful artifact and passing it through the same plan, approval, target guards, and verification.

Do not store long-lived AWS access keys. Use GitHub OIDC with exact repository/branch/environment trust. Keep external-provider credentials scoped to the intended deployment capability and protected environment. Production requires its own Issue, identity, environment, and approval path.

When a new workflow cannot be exercised safely until it exists on `main`, use a reviewed implementation PR followed by a dependent rollout-evidence PR under the same open Issue. The first PR references the Issue without closing it; the evidence PR uses `Closes #<issue>` only after deploy and rollback proof are complete.


## Project-specific boundary

- Phone/staff-admin and required Cloud/API scope. Kiosk and JumpyBoard remain separate except approved interface contracts.
- Roller is authoritative; Aurora is the operational cache. Frontends use JumpYard Cloud, never direct Roller REST.
- Technical park-test is Nacka pilot production. Preserve its venue/date gates and current full-flow window.
- Main merges build an immutable artifact only. Promotion/rollback select the exact successful run/SHA, require reviewed plan and protected approval, and never rebuild.
- Workflow cleanup authorizes no cloud, Roller, payment, messaging, secret, lifecycle or product mutation. Read Security And Operational Constraints for those tasks.
