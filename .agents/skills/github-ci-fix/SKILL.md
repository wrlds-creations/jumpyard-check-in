---
name: github-ci-fix
description: Diagnose and fix failing GitHub Actions jobs when CI logs or a workflow failure are the task.
---

# GitHub CI repair

Identify the first meaningful failing command and inspect its logs. Reproduce locally when useful, fix the cause within the issue scope and run the affected checks. Broaden validation when the change or remaining uncertainty justifies it.

Preserve unrelated failures and user work. Do not deploy as a test or rerun a mutating workflow without the required authorization. Report the failure, correction, evidence and remaining blocker.
