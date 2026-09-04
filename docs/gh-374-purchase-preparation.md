# Phone purchase preparation (#374)

Approved issue: [#374](https://github.com/wrlds-creations/jumpyard-check-in/issues/374).
Love approved implementation on 4 September 2026 after explicitly confirming that
the correction must preserve #331, rather than restore its unpaid-summary bug.
The original Project draft was converted in place. Branch:
`codex/gh-374-purchase-preparation`, from `origin/main`
`0a3105da1613ab176d2d4727209d7b1c7ef1075e`.

## Finding and behavior

#324 introduced persistent payment confirmation and bypassed the old loading card.
The new view only faded its button after a guest clicked while preparation was
unfinished. Three failed booking lookups then produced a generic sync error.
#331 separately fixed successful but still-unpaid booking responses routing to the
payment-required summary. These are distinct behaviors.

The phone now shows **Vi slutför ditt köp …** and a visible loading indicator while
preparing the safety continuation. The success checkmark, paid amount, receipt
message and safety button appear together only when that continuation exists.
The ready confirmation remains until the guest explicitly continues. Preparation
is never deferred until that click. The corresponding English states are provided.

An exhausted preparation attempt shows **Det tar lite längre tid**, an instruction
not to pay again, and one **Kontrollera igen** action. It does not falsely describe
an approved payment as failed. Navigation itself also has readable busy feedback.

Initial new-purchase and approved return/reload preparation use the same helper:

- At most three sequential booking lookups: immediate, then after 5 and 15 seconds
  when the preceding lookup fails. This spreads the same maximum request count
  across the observed short booking-availability delay.
- One 45-second deadline includes lookup responses, response bodies and backoff.
  Timeout/replacement/unmount abort the request; late results cannot become ready.
- A successful unpaid booking returns immediately. It still enters safety under
  #331; there is no polling for paid status on the payment screen.
- Approved session preparation has a separate 35-second bound. Its existing #331
  fallback still permits safety without a session, with authoritative payment and
  session creation required before staff handoff. A worst-case new-entry
  preparation is therefore bounded by 45 + 35 seconds, not an indefinite spinner.
- Manual retry checks the original purchase with the same bounded policy.
  Repeated taps and provider callbacks cannot overlap/restart an active attempt.

The saved purchase remains at `PAYMENT` during preparation and the ready receipt
screen. It advances to saved safety immediately before explicit navigation and
payment-marker release. Reload during preparation therefore follows the bounded
approved-recovery path; existing safety/completed recovery keeps its semantics.

Existing-booking add-ons already have a usable safety route and keep immediate
receipt confirmation. Their background resume-hint write is not an extra readiness
gate. Zero-payment purchases retain their automatic continuation without acquiring
a payment confirmation. #351/#361 recovery and #367 combo contents are preserved.

## Scope and review

Changed production areas: shared phone confirmation/styles, BuyTickets, page
preparation/recovery wiring, the initial preparation helper and optional abort
signals on the two existing Cloud-client requests. No dependency was added.
The existing development-only payment preview exposes preparing/delayed fixtures.
Focused rendered, handler and transport tests cover the correction.
The phone CI job runs payment-confirmation, paid-confirmation and recovery tests.
The workflow YAML was parsed after adding those steps.

Independent review caught and corrected draft-effect cleanup aborting a freshly
created zero-payment lookup, saving safety before the guest continued, and duplicate
approved-return callbacks restarting preparation. Regression tests exercise these
paths through the actual handlers and JSX wiring.

Payment-result interpretation is unchanged. Open #329 separately owns the normal
SDK callback's Pending/Received classification; the supplied images do not prove
that outcome. No backend, infrastructure, schema, provider configuration, kiosk,
Handoff or receipt-delivery behavior changed.

## Validation

Local validation:

- Combined Node test run: **206 passed**, zero failures or skips. Coverage includes
  confirmation/preparation/preview (55), paid confirmation (9), payment recovery
  (137), and exit policy (5). The run uses `--experimental-strip-types` and the
  test files listed in the phone package's payment/exit scripts.
- `npx tsc --noEmit`: passed.
- `node node_modules/next/dist/bin/next build --webpack`: passed, including
  TypeScript and static export, with the configured Park API base URL. The exported
  `/preview/payment` is a 404 and contains no development fixture controls.
- `npm run lint`: passed, with the four existing image-element warnings in page,
  JumpyardIcon, ParkChoice and SafetyVideo. No lint errors or new warnings.
- `git diff --check`: passed.
- Full repository `npm run validate`: passed with exit 0 through all stages,
  including the final #367 combo-content suites.

Headless Edge exercised the existing local preview in Swedish/English at widths
320 and 393 px, including preparing, delayed and ready states. Twelve screenshots
were captured with no horizontal overflow or page errors. Delayed retry changed
to preparation, then ready confirmation, then safety only on the guest action.
Representative Swedish screenshots were visually inspected. This is fixture
verification, not a real Apple Pay transaction or physical iPhone test.

Local worktree setup: phone and infrastructure dependencies reuse the existing
checkout's dependency directories. The admin Turbopack gate rejected an external
dependency junction, so that junction was moved reversibly to the ignored
`node_modules/.gh374-admin-dependency-link-backup` and admin dependencies were
installed inside this worktree with `npm ci --no-audit --no-fund`. The first
installation had stalled on the registry audit request. The original checkout's
dependencies remain intact; no dependency or lockfile change is part of #374.

Durable docs updated: this evidence, D0208 in `DECISIONS.md`, and the implemented
flow reference in `PROJECT_CONTEXT.md`. `REPO_CURRENT_STATE.md` and
`AWS_RESOURCES.md` remain the existing merged/deployed baseline.

## Delivery boundary

Love subsequently authorized everything required for handset Apple Pay testing:
commit, reviewed PR/merge, immutable release, exact plan review and protected Park
then public promotion. Use the existing Nacka pilot and retain the current mainline
corrections. Rollout evidence will record the selected SHA and runs after completion.
Love performs the physical Apple Pay transaction and acceptance. No new follow-up
draft was created; #329 and the existing normal-404 alarm draft remain separate.
