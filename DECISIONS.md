# Decisions

This file is the source of truth for meaningful project decisions. Add entries when a choice affects architecture, scope, cost, data ownership, security, deployment, UX direction, or future maintainability.

## Decision Log

| ID | Date | Decision | Rationale | Impact | Revisit Trigger |
|---|---|---|---|---|---|
| `D0001` | 2026-05-18 | Frontend must not call Roller directly in production architecture. | Roller credentials must not be exposed in frontend. A server-side layer is needed for logging, retries, error handling, and controlled fallbacks. JumpYard Cloud/server API will own pilot operational state. | Production architecture uses `check-in app -> JumpYard Cloud/server API -> Roller API`. Frontend work must target server-owned contracts rather than Roller directly. | Revisit only if Roller provides a credential-safe frontend integration model and WRLDS explicitly approves an architecture change. |

## Active Constraints

| Constraint | Source | Impact | Revisit Trigger |
|---|---|---|---|
| Roller is the source of truth for bookings. | Sprint 1 project context | Booking validation must reconcile with Roller. | Revisit if JumpYard chooses another booking system. |
| JumpYard Cloud/server API owns pilot operational state. | Sprint 1 project context | Safety status, handoff code, and session status should not be owned by the frontend. | Revisit after pilot state model is finalized. |
| Work one scoped ticket at a time. | WRLDS Codex workflow | Prevents implementation scope from expanding into future tickets. | Revisit only if workflow changes. |

## Deferred Decisions

| Decision | Why Deferred | Needed By | Owner |
|---|---|---|---|
| Server-side runtime and hosting for Sprint 1 | T0000 is docs-only and does not allow backend or deployment changes. | Before backend endpoint implementation. | `TBD` |
| Roller booking lookup contract | T0001 will spike Roller Playground connectivity first. | T0001 | `TBD` |

## Reversed Decisions

| ID | Date | Reversed Decision | Replacement Decision | Rationale |
|---|---|---|---|---|
| `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |
