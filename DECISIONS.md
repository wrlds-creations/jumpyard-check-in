# Decisions

This file is the source of truth for meaningful project decisions. Add entries when a choice affects architecture, scope, cost, data ownership, security, deployment, UX direction, or future maintainability.

## Decision Log

| Date | Decision | Rationale | Decided By | Impact | Revisit Trigger |
|---|---|---|---|---|---|
| 2026-05-18 | Adopt the WRLDS Codex workflow in this repository. | The project needs durable context, scoped tickets, decision tracking, followups, and local skills before continued implementation. | Love / WRLDS | Adds root workflow docs, validation scripts, local skills, and PR checklist without replacing app code. | Revisit if the workflow slows delivery or important project facts move outside repo files. |
| 2026-05-18 | Keep the existing three-app Next.js repository structure. | Check-in already has working phone, kiosk, and admin apps; the template is an operating model, not an app-code replacement. | Love / WRLDS | App directories remain separate with per-app package manifests and validation commands. | Revisit if shared code or deployment requirements justify a workspace refactor. |

## Active Constraints

| Constraint | Source | Impact | Revisit Trigger |
|---|---|---|---|
| Work should happen in feature branches and not be pushed directly to `main`. | WRLDS Codex workflow | Keeps changes reviewable and reduces accidental production-impacting changes. | Revisit only if repository governance changes. |
| Do not commit unless explicitly asked. | WRLDS Codex workflow | Keeps the human owner in control of commit boundaries. | Revisit only if automation policy changes. |
| Unknown project facts stay `TBD` until confirmed. | WRLDS Codex workflow | Prevents chat assumptions from becoming source-of-truth. | Revisit when facts are confirmed by project owner or implementation. |

## Deferred Decisions

| Decision | Why Deferred | Needed By | Owner |
|---|---|---|---|
| Production deployment model for phone and kiosk | Current repo has mixed Docker/static export signals and no documented deployment target. | Before production deployment work. | `TBD` |
| Real JumpYard/JY Cloud integration contracts | Current flows use mock/local adapters. | Before replacing mock clients. | `TBD` |
| Staff admin authentication | Admin app currently documents mock API usage; auth is not confirmed. | Before production staff rollout. | `TBD` |

## Reversed Decisions

| Date | Reversed Decision | Replacement Decision | Rationale | Decided By |
|---|---|---|---|---|
| `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |
