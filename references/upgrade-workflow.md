# Selective workflow upgrade

## Establish the baseline

Identify the intended Git repository, remote, Project and approved base. Record status, current SHA, relevant instructions, module use and existing validation. If the working copy is dirty, use a separate worktree; do not reset or overwrite it. If the source folder is a stale non-Git export, compare it to current main and preserve unique useful material before changing either.

Open or reuse the authorized upgrade issue. Independent work starts from approved mainline. If the actual application still lives in an unmerged dependency chain, name that dependency and exact base; do not fabricate a mainline snapshot.

## Merge the workflow

- Add .wrlds.json using the project's actual identity and selected modules. Keep unknown Project URLs null until verified.
- Install scripts/wrlds alongside existing scripts. Add namespaced commands if useful, preserving all application package fields and existing commands.
- Merge AGENTS.md and CODEX_TASK.md around current constraints and the GitHub-native resolver. Preserve project-specific release gates, data boundaries, language and product requirements.
- Move each existing matching skill to .agents/skills once. Compare project customizations before applying shared guidance. Keep other existing project skills; do not replace them with template copies.
- Install only the selected domain packages. Reconcile their policies with stricter project requirements, and preserve actual inventory values. Relative references must work after migration.
- Keep current technical facts, decisions and histories. Move only obsolete narrative/duplicates into a linked archive. Never copy generic TBD placeholders over confirmed facts.
- Preserve existing Project taxonomy and repository issue forms. Adapt mandatory fields and PR links where needed.
- Add the isolated workflow-validation CI job without changing release/deployment jobs.

The dry-run plan is an inventory aid, not an automatic merge decision. Do not overwrite package.json, .env files, active user work or application assets.

## Verify and restore

Run portable workflow tests and validation, check diff whitespace, inspect semantic constraints and verify native discovery. App code/dependencies should be unchanged for a workflow-only rollout; run any project-mandated checks and explain evidence limits. Use the pilot protocol before proceeding to the next repository.

Record template version, original base, changed file list, hashes for preserved contracts, validation evidence and any unavailable checks in the issue-linked history record. Review the diff before publication. Commit, push, merge and deploy retain their existing authorization requirements.

Before publication, abandoning the isolated worktree restores the original checkout without undoing user work. After an approved merge, restore through a reviewed revert of the workflow change; do not reset a shared branch. A rollback must preserve subsequent project edits and keep the issue/Project history truthful.

Historical AGENTS instructions must use a non-triggering archive filename, such as AGENTS.before-workflow-0.2.md, so the archive cannot override current instructions.
