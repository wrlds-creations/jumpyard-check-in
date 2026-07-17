# Roadmap And Project Policy

Operational work is managed in the private [JumpYard Check-in GitHub Project](https://github.com/orgs/wrlds-creations/projects/5). The Project is the only source of truth for candidate-work status, priority, work type, track, and owner. Repository Issues are the source of truth for approved implementation scope.

This file contains durable policy, product guardrails, external dependencies, and migration evidence only. It is not a parallel backlog.

## Source Of Truth

- Unapproved ideas and findings are GitHub Project draft issues.
- Love's approval is required before a draft becomes a repository Issue.
- Approved work uses one Issue, one `codex/gh-<issue-number>-<short-slug>` branch, and one linked pull request.
- Project fields describe operational state. Issue bodies describe approved goal, requirements, non-goals, acceptance criteria, dependencies, and validation.
- Completed legacy tickets remain in [completed-tickets.md](../history/completed-tickets.md); validation evidence remains in [validation-log.md](../history/validation-log.md).
- Every implementation Issue must be explained to Love before approval: what changes and why, a useful analogy when needed, what is included and excluded, risk/cost/dependencies, completion evidence, and any remaining decision.

The latest supplied cross-project roadmap is [jumpyard-next-sprint-roadmap.pdf](../assets/jumpyard-next-sprint-roadmap.pdf), dated 2026-06-11. For this repository, Sprint 3 covers the phone app, staff/admin app, and the JumpYard Cloud capabilities required by those surfaces. Kiosk/print/terminal and JumpyBoard/AirHive remain separate workstreams; only explicit interface contracts may cross those boundaries.

## Durable Product Guardrails

- The production path remains `check-in app -> JumpYard Cloud/server API -> Roller API`; frontends do not call Roller directly.
- Roller remains authoritative. Aurora is an operational cache for lookup, scheduling, handoff, audit, and recovery.
- The complete Sprint 3 production target includes approved initial booking backfill, scheduled morning seed, Roller webhook processing/reconciliation, normalized Aurora state, and one automatic transactional email link 30 minutes before selected booking time. SMS is deferred and does not block Sprint 3.
- Dev/Playground stays available unless an approved Issue explicitly changes it. Existing park-test is the sole Live-backed pre-production environment; production is separate and follows a successful complete rehearsal and GO decision.
- The current Nacka park-test window remains open until Love explicitly approves closing it. Documentation closeout alone is not a close-window deployment.
- AWS resource changes, Roller Live reads/writes, webhook registration/processing, payment, redeem, guest messaging, production domains, deployment, and cutover each require explicit approved scope.
- Refund/cancel after an internal Live payment remains manual outside the app unless a later approved Issue explicitly adds it.
- External provider or approval gates never authorize implementation by themselves.

## External Gates

These seven rows preserve durable external facts that cannot be represented only by Project workflow fields. Their legacy references are historical lookup keys, not approved implementation Issues.

| Gate | Legacy references | Required evidence or decision | Owner | Current boundary |
|---|---|---|---|---|
| Gate-01: Roller remaining-balance API evidence | `FU-009` | Obtain provider evidence for whether any current Nacka API/fixture exposes an authoritative remaining balance after code use. | Josh / Joao / Pabel | This is the technical source-contract gate. Do not infer or locally calculate a balance. |
| Gate-02: SMS production access and consent inputs | `FU-045` | Provide expected volume/peak, countries, final transactional copy, consent and opt-out/support wording, sender goal, public URL, and approval for AWS support requests. | Love / AWS Support | Deferred outside Sprint 3; sandbox/approved test destinations only and no unattended production SMS. |
| Gate-03: SES production domain and sending access | `FU-063`, `T0200`, `#208` | Verify `jumpyard.se` with DKIM, obtain SES production access, and prove the approved `JumpYard Nacka <nackaforum@jumpyard.se>` sender, same Reply-To, suppression, telemetry, and controlled receipt. | Love / AWS Support / João | Issue #208 is approved and in progress; sandbox identity/configuration remains fail closed until rollout, DNS, and production-access evidence pass. |
| Gate-04: SMS Sender ID/display approval | `FU-069` | Obtain provider approval/setup and confirm the actual handset sender display. | Love / AWS Support | `JumpYard` is a goal, not a confirmed sender label. |
| Gate-05: Payment-method enablement and Apple Pay evidence | `Park-09`, `FU-071`, `FU-094` | Roller/Adyen must explain Swish/Apple Pay coexistence and provide the merchant-validation/session/payment failure evidence. | Pabel / Roller / Adyen | Card remains the park-test fallback. |
| Gate-06: Adyen postal-code UX decision | `Park-10`, `FU-072` | Confirm whether Swedish postal-code collection can or should be hidden or locale-adjusted. | Pabel / Roller | Existing collection behavior remains unchanged. |
| Gate-07: Multi-visit product and V1 behavior approval | `Park-11`, `FU-081` | After the technical source evidence is available, approve the guest-facing behavior for Nacka multi-visit products and whether code-only validation is the permanent V1 contract. | Love / JumpYard / Josh / Joao / Pabel | This is the product-boundary gate. Until approved, V1 may validate/reduce amount but never show remaining visits. |

## Migration Record

The one-time Markdown-to-Project reconciliation is preserved in [github-project-migration-2026-07-14.md](../history/github-project-migration-2026-07-14.md). It maps all 47 formerly open followups to 29 unique unapproved Project drafts, the seven external gates above, or two completed archive entries. It also records all legacy `T*`, `TBD-*`, `Park-*`, and `FU-*` references without turning completed work into new Issues.

Do not update candidate status here. Open the [GitHub Project](https://github.com/orgs/wrlds-creations/projects/5) instead.
