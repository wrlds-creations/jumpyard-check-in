# T0188 Sprint 3 Phone/Admin Scope And Ticket Plan

## Purpose

T0188 cleans the project map before Sprint 3 implementation begins. The active Sprint 3 workstream in this repository covers the guest phone check-in app, the staff/admin app, and the JumpYard Cloud capabilities required by those two surfaces.

The latest roadmap PDF remains the cross-project roadmap. Kiosk, QR-print/terminal work owned by the kiosk track, and JumpyBoard/AirHive activity-data work remain visible there, but their implementation planning belongs to separate project folders/workstreams.

## Plain-Language Working Agreement

Before any implementation ticket starts, Love receives a short explanation of:

- what the ticket changes;
- why the change is needed;
- a plain-language analogy where useful;
- what is included and explicitly excluded;
- the main risk, cost, and external dependency;
- how completion will be verified; and
- which decision or approval is still needed.

Only one ticket is active at a time. A planned ticket is not implementation approval.

## Current State Summary

- Sprint 2 and the Nacka park-test outcome work are closed.
- T0182-T0187 completed the approved phone/admin feedback slices through mobile polish, safety/socks closeout, water-bottle handling, and ComboDeal.
- The Nacka/date-scoped full-flow park-test runtime posture remains intentionally open through 2026-09-30 until Love explicitly asks to close it.
- Sprint 3 implementation has not started. T0188 defined its scope and ticket map only and is now closed.

## Audit Findings

| Risk | Finding | T0188 Treatment |
|---|---|---|
| High | The roadmap promise mixes phone/admin production work with kiosk and JumpyBoard/AirHive work, while Love confirmed those are separate project folders/workstreams. | Record the ownership boundary and keep only cross-project dependencies in this backlog. |
| High | The previous backlog still listed completed T0187 as planned and did not contain the agreed Sprint 3 ticket sequence. | Remove the stale row and add T0189-T0200 with explicit scope and validation intent. |
| Medium | `AGENTS.md` still described Sprint 1 as the current project direction. | Replace it with the current phone/admin Sprint 3 direction and the separate-workstream boundary. |
| Medium | `README.md` described AWS as synth-only and the phone deployment target as TBD, despite deployed dev and park-test environments. | Correct setup/deployment wording without changing any environment. |
| Medium | `AWS_RESOURCES.md` still called the deployed park-test target planned and contained stale pre-deploy notes in the active inventory. | Correct status wording only; do not change AWS resources or runtime state. |
| Medium | `FU-031` remained open even though T0177 completed booking-reference/email/phone lookup. | Archive it as completed with T0177 evidence. |
| Low | D0141/D0142 appeared in Active Constraints but were missing from the primary Decision Log. | Restore the two already-confirmed decisions before adding the T0188 scope/workflow decisions. |
| Medium | The full root validation claims to be dependency-free but its T0177 validator imports AWS SDK dependencies. | Record as deferred tooling work; do not change scripts in this documentation-only ticket. |

## Sprint 3 Ticket Map

| Ticket | Plain-Language Outcome | Why It Exists | Key Boundary / Dependency | Completion Evidence |
|---|---|---|---|---|
| `T0189` | Make the current park-test safety gates truly fail closed. | Missing venue evidence and a bypassable emergency stop must not be production foundations. | Phone/admin cloud safety only; no broader venue/date scope. | Negative tests prove missing/wrong venue is blocked and the emergency stop always wins. |
| `T0190` | Agree the stage/production environment contract before creating resources. | Love must understand ownership, cost, data, naming, and rollback before AWS work starts. | Planning/preflight only; no AWS resource creation. | Approved environment contract with account, region, tags, data, cost, and rollback decisions. |
| `T0191` | Create the approved staging foundation. | Phone/admin need a safe dress-rehearsal environment separate from dev, park-test, and production. | Explicit AWS approval required; production remains untouched. | Reviewed CDK diff, deploy/readback, tags, closed gates, and rollback proof. |
| `T0192` | Protect the public API boundary. | CORS alone is not a lock; guest, staff, internal, and webhook routes need different protection. | Route auth, edge/abuse controls, and internal-route isolation; no UI redesign. | Route matrix and negative/positive security tests pass. |
| `T0193` | Replace the shared admin test passcode with production staff identity. | Staff actions need personal access, roles, session policy, and audit ownership. | Admin/staff only; identity choice requires Love/JumpYard approval. | Role/session/MFA policy and authenticated admin tests pass. |
| `T0194` | Decide and implement data, secret, permission, backup, and deletion rules. | Guest data and operational credentials need clear ownership and expiry. | No new data use without approval; retention policy is a user/business decision. | Retention/purge, least-privilege, rotation, backup, and restore evidence. |
| `T0195` | Build a controlled delivery path for phone, admin, and cloud. | Deployments need automated checks and human gates instead of relying on one local machine. | GitHub OIDC/CI/CD, environment targeting, approval, and rollback only. | CI, synth/diff, artifact target checks, approved deploy, and rollback rehearsal pass. |
| `T0196` | Put phone and admin on approved production domains. | Guests and staff need stable addresses that point to the correct API. | `checkin.jumpyard.se` plus an approved admin address; DNS access required. | DNS/TLS/CORS/bundle-target checks pass for phone and admin. |
| `T0197` | Prepare SMS and email for real guest use. | Sender identity, consent, copy, deliverability, and provider approval are external production gates. | No support request or real sending without Love's explicit approval. | Sender/domain readiness, approved copy, provider evidence, and controlled delivery tests. |
| `T0198` | Make monitoring actionable for operators. | A dashboard is not enough if alarms do not reach someone who knows what to do. | Phone/admin/cloud operations only; ownership and escalation need named decisions. | Alarm routing, runbook, backup/restore checks, and support rehearsal pass. |
| `T0199` | Close only the remaining approved Sprint 2 phone/admin feedback. | Completed feedback must not be rebuilt, while genuine remaining issues need an explicit decision. | No kiosk or activity-data implementation. | A reviewed done/remaining list plus ticket-specific phone/admin validation. |
| `T0200` | Run the staging dress rehearsal and make a production go/no-go decision. | Production should open only after the entire phone-to-admin journey and rollback path are proven. | No automatic production launch; Love approves the final go/no-go. | End-to-end evidence, open-risk list, rollback proof, and signed-off decision. |

## External Project Boundaries

The following roadmap promises are not implementation tickets in this Sprint 3 phone/admin queue:

- the kiosk app and staff-help implementation in the kiosk project/folder;
- QR printing and Roller terminal preparation owned by the kiosk track; and
- JumpyBoard/AirHive, Bluetooth band linking, and activity-data storage owned by the Connected Experience project/folder.

If one of those projects needs phone/admin data, a small interface-contract ticket may be proposed separately. That ticket may define the handoff but must not absorb the other project's implementation.

## Files Inspected

- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `CODEX_TASK.md`
- `README.md`
- `AWS_RESOURCES.md`
- `FOLLOWUPS.md`
- `TEST_PLAN.md`
- `docs/assets/jumpyard-next-sprint-roadmap.pdf`
- `docs/roadmap/backlog.md`
- `docs/roadmap/park-test-feedback-improvements.md`
- `docs/history/completed-tickets.md`
- `docs/history/followups-done.md`
- `docs/history/validation-log.md`
- current repository validators under `scripts/`

## Intentionally Unchanged

- Application and Lambda code
- AWS/CDK configuration and deployed resources
- Roller credentials, data, webhooks, bookings, payments, or redemptions
- Cloudflare Pages projects or deployments
- SMS/email provider configuration or sends
- The current Nacka/date-scoped full-flow runtime posture
- Kiosk or JumpyBoard/AirHive implementation files

## Outcome And Validation

T0188 closed as documentation-only on 2026-07-09. The dependency-free repository validators, `git diff --check`, and the manual T0189-T0200 sequence/source-of-truth review passed. The known clean-checkout dependency gap in the full `npm run validate` command is deferred to a tooling ticket rather than hidden or expanded into this documentation-only ticket.
