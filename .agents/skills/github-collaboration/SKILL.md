---
name: github-collaboration
description: Coordinate WRLDS GitHub issues, Projects, PR dependencies or integration work when the task needs repository collaboration.
---

# GitHub collaboration

Use [the collaboration workflow](../../../references/github-collaboration-workflow.md) for the relevant operation: information ownership, permissions, offline work, completion states, stacking or legacy migration.

Inspect the actual repository, Project and existing items before writing. Preserve prior explicit authorization and project-specific release gates. Keep mutable task status in GitHub and local execution notes ignored. Do not allocate another manual ticket ID or rewrite the static task resolver per branch.

A request to implement code is not permission to contact reviewers, merge, force-push, or deploy. Report actual issue/PR URLs and observed state; identify any remaining external action without implying it already happened.

Release work follows immutable-artifact policy: plan before protected approval, no rebuild on promotion/rollback, and keep the release issue open until required rollout evidence is merged. Read the project collaboration reference.
