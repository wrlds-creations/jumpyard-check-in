# Repo Current State

Use this file as the short operational snapshot of what actually exists in the repository. Historical detail lives in the linked archives.

## Snapshot

- Date: 2026-07-07
- Current branch: `codex/t0183-t0185-closeouts`
- Current status: No active ticket. T0185 is closed as documentation-only because its socks confirmation guard was already satisfied by T0182. The temporary full-flow AWS gate posture intentionally remains open for Nacka dates through 2026-09-30 until Love asks to close it.
- Current ticket: `NO_ACTIVE_TICKET`
- Completed tickets: archived in `docs/history/completed-tickets.md` (183 completed tickets; latest closed `T0185`).
- Recommended next step: keep the park-test flow available for continued review, then pick T0186 if water-bottle handling is still needed. Do not close the park-test full-flow window unless Love explicitly asks.

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

Current park-test status:

- Park-test phone/admin Cloudflare Pages targets exist, and the phone bundle points at the park-test API.
- Roller Live access and controlled quote/draft/payment/lookup/add-on/settlement/redeem/receipt/sync smokes have passed for Nacka.
- Aurora contains only scoped smoke/test state; it is not a broad same-day booking import.
- Current full-flow runtime posture allows scoped Nacka lookup, booking/payment, add-ons, staff auth, and redeem for `2026-06-29` through `2026-09-30`; webhook processing and JumpYard-owned guest sends remain closed.
- T0182 closed the phone mobile robustness, UX/copy polish, socks confirmation, contact/payment consolidation, and read-only existing-booking add-on availability prefetch pass without changing public API contracts, new AWS resources, or Roller ownership.
- T0183 closed as satisfied by T0182 safety-flow polish; no additional code or deploy was needed.
- T0184 closed as deferred to the later kiosk/staff-help track; no additional phone-flow code or deploy was needed.
- T0185 closed as satisfied by the T0182 socks confirmation guard; no additional code or deploy was needed.
- T0178-T0180 are closed from the park-test readiness/test/outcome pass. Park feedback was positive and future improvements remain in the roadmap.
- The latest Sprint roadmap PDF is archived in `docs/assets/`. It frames Sprint 3 as production cloud plus response to Sprint 2 park feedback, and Sprint 4 as kiosk/QR print/terminal preparation plus first AirHive/JumpyBoard test scope.
- The current T0176/T0177 full-flow runtime posture remains intentionally open so the app keeps working for park testing until Love says otherwise. The date scope is now explicitly extended through 2026-09-30 for Nacka only; this does not broaden venue scope, webhooks, broad imports, or JumpYard-owned guest messaging.

## Known Validation Commands

Current closeout entrypoints:

- `npm run validate`
- `npm run infra:check`
- `git diff --check`
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

- Archived completed-ticket count: 183
- Latest closed ticket: `T0185`
- Current active ticket: None

## Current Ticket

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `NO_ACTIVE_TICKET` | None active. | Closed | T0185 is closed as docs-only/no-op. Full-flow gates remain in the existing T0176/T0177/T0180 posture until Love asks to close them. |

## Confirmed Next Tickets

| Ticket | Goal | Status | Notes |
|---|---|---|---|
| `T0186` | Water bottle add-on. | Planned | Add water bottle add-on/bring-own confirmation with environmental copy. |
| `T0187` | Booking flow and Roller product semantics. | Planned | Evaluate contact/payment simplification and fix actual jumper counting for Family/Combo/session products. |

Broad future planning lives in [docs/roadmap/backlog.md](docs/roadmap/backlog.md).

## Validation Status

Historical validation evidence is archived in [docs/history/validation-log.md](docs/history/validation-log.md).

- Latest docs-only closeout evidence is recorded in [docs/t0185-socks-confirmation-closeout.md](docs/t0185-socks-confirmation-closeout.md), [docs/t0184-older-guest-support-closeout.md](docs/t0184-older-guest-support-closeout.md), [docs/t0183-safety-video-rules-closeout.md](docs/t0183-safety-video-rules-closeout.md), and [docs/history/validation-log.md](docs/history/validation-log.md). Latest phone-app validation and park-test frontend deploy evidence remains in [docs/t0182-mobile-viewport-layout.md](docs/t0182-mobile-viewport-layout.md).
- Older validation is archived in [docs/history/validation-log.md](docs/history/validation-log.md) and the referenced ticket docs.

## Current Risks And Open Questions

- Park-test AWS exists with dedicated API, Aurora, raw bucket, secrets, and gates; current resource details are in [AWS_RESOURCES.md](AWS_RESOURCES.md).
- Roller Live access and controlled smokes through receipt/sync/redeem have passed for Nacka. The full-flow rehearsal window remains open at runtime by Love's request until a normal `park-test.json` close-window deploy is explicitly approved.
- The current window allows real Live bookings/payments/add-ons, scoped redeem, and date-scoped guest contact lookup through the deployed park-test flow. It does not allow webhooks, JumpYard-owned guest messages, broad same-day imports, new AWS resources, or broader venue/date scope.
- Production readiness remains partial; active future work is tracked in [FOLLOWUPS.md](FOLLOWUPS.md), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), and [docs/roadmap/backlog.md](docs/roadmap/backlog.md).
- Unrelated local work was stashed as `stash@{0}: pre-t0128-local-unrelated-work` before the T0128 branch was created.
