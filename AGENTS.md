# WRLDS Codex workflow

Complete the user's approved issue through relevant verification. Preserve project facts and unrelated work.

## Read what the task needs

For implementation, resolve the repository issue using [CODEX_TASK.md](CODEX_TASK.md) and read the current **Must know** section of [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). A read-only question needs only relevant evidence.

- Project context: constraints, commands and environment boundaries.
- [DECISIONS.md](DECISIONS.md): relevant architecture or product decisions; current constraints must also be discoverable from Must know.
- [REPO_CURRENT_STATE.md](REPO_CURRENT_STATE.md): merged state when investigating repository readiness or integration.
- [TEST_PLAN.md](TEST_PLAN.md): applicable verification requirements.
- Matching skills in .agents/skills: only for the workflow at hand. Use github-collaboration for GitHub coordination; project-context-hygiene for substantial memory restructuring.
- For AWS resource work, use aws-project-infrastructure and AWS_RESOURCES.md when the AWS module is enabled.

## Authority and scope

GitHub Issues own requirements and acceptance criteria; GitHub Projects own planning fields. CODEX_TASK.md is a static resolver, not a second task ledger. [Collaboration guidance](references/github-collaboration-workflow.md) defines offline work, permissions and completion states.

The user's latest explicit instruction can revise earlier decisions. Update durable facts when confirmed. If code, configuration and documentation disagree, establish the current evidence and correct the affected record; do not treat an old note as fresh authorization.

Work on one implementation issue per branch/worktree. An approved implementation request permits preparing its issue and the necessary local code, tests and documentation. Expected areas guide the change; explicit Do Not Touch boundaries remain binding. Ask only for missing decisions or material scope/authority gaps. Do not repeat an authorization already given for the same action.

Preserve unrelated user changes. Explain new dependencies. Capture out-of-scope findings without implementing them; use the linked Project when authorized, otherwise local pending notes.

## Finish and hand off

Continue until acceptance criteria and relevant checks pass, fixing failures caused by the change. Recheck affected behavior after fixes; repeat broader suites only for a reason. If required verification is unavailable, record exactly what remains and why. A first implementation is not sufficient evidence of completion.

Use codex/gh-<issue-number>-<short-slug> from the approved base. Commit and push only when explicitly requested. Do not push directly to main, overwrite another person's branch, merge or deploy without the required authorization.

A verified implementation can be ready for review; Issue Done requires the issue's review, integration and any release criteria. Report the result, verification and remaining work concisely. Include changed files, commands, docs, risks and follow-ups when relevant to implementation.

Keep confirmed facts and decisions in their owning documents. REPO_CURRENT_STATE.md describes merged facts, not personal progress. Archive useful history under docs/history before removing it. Write durable docs in English by default, preserving exact user-facing copy, business terms and quoted evidence when needed.

## Project Boundary

- Sprint 3 implementation scope is the phone check-in app, the staff/admin app, and the JumpYard Cloud capabilities required by those surfaces.
- Roller remains the booking source of truth; Aurora is an operational cache for lookup, scheduling, handoff, audit, and recovery.
- The production architecture remains `check-in app -> JumpYard Cloud/server API -> Roller API`; frontends do not call Roller directly.
- Kiosk/print/terminal and JumpyBoard/AirHive activity-data implementation remain separate workstreams. Only explicit interface contracts may cross those boundaries.


## Release and operational boundary

- Local development and validation are normal. A merge to `main` builds an immutable Park release but does not deploy it. Park verification and Nacka public pilot-production promotion must use that selected artifact through the protected `park-test` environment.
- Do not rebuild during deploy or rollback. Select the successful release workflow run and exact commit SHA, review the plan, then promote that same artifact.
- Local CDK or Wrangler deployment to park-test is break-glass only. It requires an approved Issue that explicitly authorizes the exception, the exact target and reason, and a follow-up record in GitHub.
- A release/deploy Issue may use one implementation PR and one dependent rollout-evidence PR when the protected workflow can only be proven after its workflow files reach `main`. Keep the Issue open until rollout evidence is merged.

No AWS resources should be created for an issue unless the issue explicitly allows AWS work.

For routine park-test releases after T0198:

1. Merge reviewed code through a PR and let `.github/workflows/release.yml` build the immutable artifact.
2. Dispatch `.github/workflows/deploy-park-test.yml` from `main` with the successful release run ID, full SHA, intent, and exact approval phrase.
3. Review the read-only plan before approving the protected `park-test` job.
4. Use the same workflow and an earlier successful release artifact for rollback; never rebuild the old source during rollback.

New multi-park production infrastructure remains disabled and requires a separate approved Issue. Issue #264 approves the existing technically named `park-test` backend as Nacka pilot production and separately gates promotion of its phone/admin artifacts to the two public origins.


Explain new proposed scope to Love plainly before approval; reuse existing explicit approval. Include release/deployment/rollback/re-promotion run IDs when that work occurs.
