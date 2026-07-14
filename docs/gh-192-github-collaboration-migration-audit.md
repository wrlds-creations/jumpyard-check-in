# GitHub Collaboration Migration Audit

Issue: [#192](https://github.com/wrlds-creations/jumpyard-check-in/issues/192)

Reference: `wrlds-creations/wrlds-template@954c66cd311b`

Audit date: 2026-07-14

## Current State Summary

- `main` is clean at `775804f` after T0194 and the migration work is isolated on `codex/gh-192-github-collaboration-workflow`.
- Approved migration issue [#192](https://github.com/wrlds-creations/jumpyard-check-in/issues/192) is the first repository Issue in the new model; there are no open pull requests or GitHub Actions workflows.
- The one-time GitHub OAuth `project` scope grant is complete. Existing organization Projects were inspected before the dedicated private [JumpYard Check-in Project](https://github.com/orgs/wrlds-creations/projects/5) was created, linked only to this repository, and configured with `wrlds-creations/jumpyard-check-in` as its default repository. Love manually confirmed the separate Project Settings value on 2026-07-14 because the public GitHub API exposes links but not this setting.
- Project #5 has the approved eight Status options plus Priority, Work Type, Track, Owner, and Legacy ID fields. Issue #192 is `In review`; the remaining 29 items are unapproved drafts.
- The 29 drafts comprise 11 Sprint 3/production-readiness outcomes and 18 independent later/follow-up outcomes after deduplication. All items have complete workflow fields, every draft body explicitly states that it is unapproved, and each formerly open follow-up ID has one canonical Legacy ID owner.
- Mutable planning tables are being removed from `CODEX_TASK.md`, `REPO_CURRENT_STATE.md`, `FOLLOWUPS.md`, and `docs/roadmap/backlog.md`; the full legacy mapping is retained as immutable history.
- The 192 completed legacy tickets remain repository history and are not Project migration candidates.

## Findings And Risks

| Risk | Finding | Required treatment |
|---|---|---|
| High | Mutable planning state has multiple Markdown owners. | GitHub Project fields must become the only source for priority, status, type, track, and owner. |
| High | Legacy backlog rows and follow-ups overlap. | Reconcile by outcome and preserve every applicable legacy ID on one canonical Project item. |
| Resolved | Existing organization Projects could not initially be inspected without CLI `project` scope. | Love completed the one-time scope grant; inspection found no compatible repository Project, so dedicated Project #5 was created and linked. |
| Resolved | Linking a repository does not prove GitHub's separate default-repository setting. | Love opened Project Settings, selected `wrlds-creations/jumpyard-check-in` as Default repository, and confirmed completion on 2026-07-14. |
| Medium | GitHub issue #192 has the same digits as legacy ticket T0192. | Always use the `#192` and `T0192` prefixes and preserve the distinction in the migration record. |
| Medium | Existing validators require mutable ticket and follow-up ledgers. | Replace them with deterministic static-resolver and Project-policy validation before removing tables. |
| Medium | Several remote legacy branches remain although their pull requests were merged. | Preserve them; do not treat them as open work or rewrite/delete them in this issue. |
| Low | GitHub Projects does not itself add CI, OIDC, branch protection, or rulesets. | Keep that work in legacy T0198 and outside issue #192. |

## Files And Systems Inspected

- Repository workflow: `AGENTS.md`, `README.md`, `CODEX_TASK.md`, `REPO_CURRENT_STATE.md`, `PROJECT_CONTEXT.md`, `DECISIONS.md`, `FOLLOWUPS.md`, `TEST_PLAN.md`, and `docs/roadmap/backlog.md`.
- Repository automation: `.github/`, `package.json`, `scripts/validate-current-ticket.js`, `scripts/validate-followups.js`, `scripts/validate-history-archives.js`, and `scripts/validate-template.js`.
- Historical evidence: `docs/history/completed-tickets.md`, `docs/history/followups-done.md`, and `docs/history/validation-log.md`.
- GitHub state: issues, pull requests, labels, milestones, remote branches, repository permissions, Actions configuration, and organization Project access capability.
- WRLDS template: commit `954c66cd311b`, issue #6, PR #7, the collaboration reference, issue form, PR template, static resolver, local skill, and validators.

## Scoped Migration Changes

Issue #192 may:

- select or create one non-duplicate organization Project and link this repository;
- configure the approved Project statuses and fields;
- create 29 reconciled unapproved Project drafts and add issue #192 to the Project;
- add a one-time legacy-ID-to-Project-item migration record;
- add the WRLDS collaboration reference, skill, issue form, PR template, static resolver, and adapted validators;
- reduce Markdown planning files to durable policies, guardrails, external gates, and history pointers; and
- record the durable source-of-truth decision and merged-mainline workflow facts.

## Intentionally Not Moved Or Changed

- No completed T0001-T0194 ticket is backfilled into the Project.
- No external provider or approval gate is converted into implementation authorization.
- No application, API, UI, AWS, Roller, Aurora, secret, messaging, Cloudflare, deployment, CI/CD, OIDC, branch-protection, or ruleset behavior changes.
- T0195 remains unapproved and cannot be implemented as part of this migration.
- Existing legacy remote branches and merged PR history remain untouched.

## Validators

The migration must update deterministic validation before the legacy operational tables are removed. Closeout validation is:

- Project list/link/field readback;
- Project item count and legacy-ID coverage with no duplicate outcomes;
- exact-once canonical ownership for all 47 formerly open follow-up IDs and all 40 legacy backlog row IDs;
- `node scripts/validate-github-project-migration.js`;
- `node scripts/validate-current-ticket.js`;
- `node scripts/validate-followups.js`;
- `node scripts/validate-history-archives.js`;
- `npm run validate`;
- `npm run infra:check`; and
- `git diff --check`.

## Remaining Approval Or Access

- Love approved issue #192 and the workflow migration in chat on 2026-07-14.
- The required GitHub OAuth `project` scope is granted, the Project's default repository is manually confirmed, and Project creation/migration readback is complete.
- Commit, push, PR, and merge still require Love's explicit approval after the full diff and validation are ready.

## Recommended Next Step

Finish deterministic local validation and independent review, repeat live Project readback, then present the complete handoff to Love for explicit commit/push/PR/merge approval. T0195 remains unapproved and out of scope.
