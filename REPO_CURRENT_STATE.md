# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-07-13
- Current branch: `codex/t0192-park-test-foundation-qualification`
- Current status: T0192 is complete. The existing park-test foundation is qualified and coherently hardened; no implementation ticket is active.
- Current ticket: None active
- Completed tickets: archived in `docs/history/completed-tickets.md` (190 completed tickets; latest closed `T0192`).
- Recommended next step: explain T0193 API protection in plain language and obtain Love's explicit approval before activation.

## Current Structure

Active source-of-truth files:

- `PROJECT_CONTEXT.md`: stable project facts, architecture, constraints, current flow facts, language policy, and active open questions.
- `DECISIONS.md`: durable architecture, workflow, scope, data, security, deployment, and maintainability decisions.
- `CODEX_TASK.md`: the current active ticket or `NO_ACTIVE_TICKET`.
- `REPO_CURRENT_STATE.md`: this short current operational snapshot.
- `FOLLOWUPS.md`: active out-of-scope findings only; completed followups are archived.
- `TEST_PLAN.md`: current validation entrypoint only; historical evidence is archived.

History and planning archives:

- Completed tickets: [docs/history/completed-tickets.md](docs/history/completed-tickets.md)
- Historical validation evidence and old validation-command inventory: [docs/history/validation-log.md](docs/history/validation-log.md)
- Sprint 1 implementation narrative and old repo-state issue snapshot: [docs/history/sprint-1-ticket-history.md](docs/history/sprint-1-ticket-history.md)
- Done followups: [docs/history/followups-done.md](docs/history/followups-done.md)
- Forward roadmap/backlog: [docs/roadmap/backlog.md](docs/roadmap/backlog.md)
- Latest Sprint roadmap PDF: [docs/assets/jumpyard-next-sprint-roadmap.pdf](docs/assets/jumpyard-next-sprint-roadmap.pdf)
- Park-test feedback improvement placeholders: [docs/roadmap/park-test-feedback-improvements.md](docs/roadmap/park-test-feedback-improvements.md)
- Park-test ticket docs: `docs/t0145-*.md` through `docs/t0180-*.md`
- Park-test mobile viewport and phone UX polish: [docs/t0182-mobile-viewport-layout.md](docs/t0182-mobile-viewport-layout.md)
- Park-test safety closeout: [docs/t0183-safety-video-rules-closeout.md](docs/t0183-safety-video-rules-closeout.md)
- Park-test older guest support closeout: [docs/t0184-older-guest-support-closeout.md](docs/t0184-older-guest-support-closeout.md)
- Park-test socks confirmation closeout: [docs/t0185-socks-confirmation-closeout.md](docs/t0185-socks-confirmation-closeout.md)
- Sprint 3 phone/admin scope and ticket plan: [docs/t0188-sprint-3-phone-admin-plan.md](docs/t0188-sprint-3-phone-admin-plan.md)
- Complete Sprint 3 target and revised ticket plan: [docs/t0189-complete-sprint-3-target-plan.md](docs/t0189-complete-sprint-3-target-plan.md)
- Park-test pre-production contract: [docs/t0191-park-test-preproduction-contract.md](docs/t0191-park-test-preproduction-contract.md)
- Park-test foundation qualification: [docs/t0192-park-test-foundation-qualification.md](docs/t0192-park-test-foundation-qualification.md)

Current park-test status:

- Park-test phone/admin Cloudflare Pages targets exist, and the phone bundle points at the park-test API.
- Roller Live access and controlled quote/draft/payment/lookup/add-on/settlement/redeem/receipt/sync smokes have passed for Nacka.
- Aurora contains only scoped smoke/test state; it is not a broad same-day booking import.
- Current full-flow runtime posture allows scoped Nacka lookup, booking/payment, add-ons, staff auth, and redeem for `2026-06-29` through `2026-09-30`; webhook processing and JumpYard-owned guest sends remain closed.
- T0182 closed the phone mobile robustness, UX/copy polish, socks confirmation, contact/payment consolidation, and read-only existing-booking add-on availability prefetch pass without changing public API contracts, new AWS resources, or Roller ownership.
- T0183 closed as satisfied by T0182 safety-flow polish; no additional code or deploy was needed.
- T0184 closed as deferred to the later kiosk/staff-help track; no additional phone-flow code or deploy was needed.
- T0185 closed as satisfied by the T0182 socks confirmation guard; no additional code or deploy was needed.
- T0186 closed after adding the park-test water bottle add-on as `water_bottle`, mapped server-side to Roller Live product `1324123` (`Jumpy Vattenflaska`), with buy-or-own-bottle confirmation in the phone add-on step and water-bottle icon handling in phone/admin handout surfaces.
- T0187 closed after adding the park-test ComboDeal buy-entry product above standard entry products, mapped server-side to Roller Live parent `1318777` with child price products `1318778`, `1318779`, and `1318780`; one package counts as two jumpers and the phone card shows `2 personer + 60 min + 1 pizza` with approved offer styling.
- T0178-T0180 are closed from the park-test readiness/test/outcome pass. Park feedback was positive and future improvements remain in the roadmap.
- The latest Sprint roadmap PDF is archived in `docs/assets/`. It frames Sprint 3 as production cloud plus response to Sprint 2 park feedback, and Sprint 4 as kiosk/QR print/terminal preparation plus first AirHive/JumpyBoard test scope.
- The current T0176/T0177 full-flow runtime posture remains intentionally open so the app keeps working for park testing until Love says otherwise. The date scope is now explicitly extended through 2026-09-30 for Nacka only; this does not broaden venue scope, webhooks, broad imports, or JumpYard-owned guest messaging.
- T0191 designated this park-test foundation as Sprint 3's sole pre-production environment. It keeps its current name, prefix, tags, data, and frontend targets; it is not staging to copy or production to rename.
- T0192 deployed the coherent fail-closed emergency-stop, venue, and request-item date model to the existing stack. All four full-flow quote/draft paths reject missing, malformed, mixed, or out-of-window item dates before side effects.
- The existing daily Data API EventBridge rule is disabled because the current sync Lambda is Playground-only; T0196 owns approved Live backfill and morning seed. Park-test CORS preserves the existing phone, admin, and kiosk origins as interface contracts only.
- Post-deploy readback found 134 healthy resources, 61 tagged resources with zero WRLDS-tag mismatch, 17 alarms `OK`, and zero CloudFormation drift. No AWS resource was added, removed, or replaced.

## Known Validation Commands

Current closeout entrypoints:

- `npm run validate`
- `npm run infra:check`
- `git diff --check`
- `node scripts/validate-t0192-request-item-dates.js`
- `node scripts/validate-t0190-safety-gates.js`
- `node scripts/validate-t0177-contact-lookup.js`
- `npm --prefix infra run validate:roller-live-quote-smoke`
- `npm --prefix infra run validate:roller-live-draft-smoke`
- `npm --prefix infra run validate:roller-live-catalog-index-readiness`
- `npm --prefix infra run validate:roller-live-contact-resolver`
- `npm --prefix infra run synth:park-test-addon-settlement-smoke`
- `npm --prefix infra run synth:park-test-redeem-smoke`
- `npm --prefix infra run synth:park-test-frontend-redeem-rehearsal`
- `npm --prefix infra run synth:park-test-full-flow-rehearsal`

Historical command evidence lives in [docs/history/validation-log.md](docs/history/validation-log.md) and ticket-specific docs.

## Completed Tickets

Completed-ticket history is archived in [docs/history/completed-tickets.md](docs/history/completed-tickets.md).

- Archived completed-ticket count: 190
- Latest closed ticket: `T0192`
- Current active ticket: None

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| None active | Preserve the T0192 closeout state until the next ticket is approved. | None | T0193 must be explained and explicitly approved before activation. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0193` | Protect guest, staff, internal, scheduler, and webhook API routes in park-test. | Planned | Starts only after T0192 closes and receives its own explanation and approval. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- T0192 implementation, AWS inventory/diff/deploy/readback, negative date proof, clean afterdiff, and drift evidence are recorded in [docs/history/validation-log.md](docs/history/validation-log.md) and [docs/t0192-park-test-foundation-qualification.md](docs/t0192-park-test-foundation-qualification.md).
- T0191 environment-contract evidence is recorded in [docs/history/validation-log.md](docs/history/validation-log.md) and [docs/t0191-park-test-preproduction-contract.md](docs/t0191-park-test-preproduction-contract.md).
- T0190 safety-gate evidence remains in [docs/history/validation-log.md](docs/history/validation-log.md) and [docs/t0190-critical-safety-gates.md](docs/t0190-critical-safety-gates.md).
- Older validation is archived in [docs/history/validation-log.md](docs/history/validation-log.md) and the referenced ticket docs.

## Current Risks And Open Questions

- Park-test AWS exists with dedicated API, Aurora, raw bucket, secrets, and gates. It is now the sole Sprint 3 pre-production environment; current resources are in [AWS_RESOURCES.md](AWS_RESOURCES.md).
- Roller Live access and controlled smokes through receipt/sync/redeem have passed for Nacka. The full-flow rehearsal window remains open at runtime by Love's request until a normal `park-test.json` close-window deploy is explicitly approved.
- The current window allows real Live bookings/payments/add-ons, scoped redeem, and date-scoped guest contact lookup through the deployed park-test flow. It does not allow webhooks, JumpYard-owned guest messages, broad same-day imports, new AWS resources, or broader venue/date scope.
- The corrected fail-closed model is deployed and `FU-096` is resolved as archived `FU-097`. Remaining qualification findings are future-ticket work: alarm actions (`FU-056`), secret rotation (`FU-058`), termination/versioned rollback safety (`FU-059`), and cost attribution (`FU-098`).
- Production remains a separate future environment. T0204 must decide GO/NO-GO before T0205 can receive new AWS/resource/cutover approvals.
- Remaining readiness work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
