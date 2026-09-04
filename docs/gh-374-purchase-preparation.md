# Phone purchase preparation (#374)

Approved issue: [#374](https://github.com/wrlds-creations/jumpyard-check-in/issues/374).
Love approved implementation on 4 September 2026 after explicitly confirming that
the correction must preserve #331, rather than restore its unpaid-summary bug.
The original Project draft was converted in place. Branch:
`codex/gh-374-purchase-preparation`, from `origin/main`
`0a3105da1613ab176d2d4727209d7b1c7ef1075e`.

For publication, preserve source commit `7d7c387` and integrate it on
`codex/gh-374-integrate-purchase-preparation`, based on current main
`668a476d21173a14c7bd449784ab7ef53247f502` (#330/PR #372). The add-on Back rules
remain intact; both phone test commands are retained. Main already owns D0208,
so the new purchase-preparation decision is D0209. Page wiring merged cleanly.

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
- Integration with #330: **217 tests passed** across confirmation, recovery,
  paid-confirmation, add-on Back and exit suites. TypeScript and staged whitespace
  checks passed. Independent review found no blockers in combined page wiring;
  the PR's required CI validates the complete integrated repository and builds.

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

Durable docs updated: this evidence, D0209 in `DECISIONS.md`, and the implemented
flow reference in `PROJECT_CONTEXT.md`. After publication, `REPO_CURRENT_STATE.md`
and `AWS_RESOURCES.md` record the verified deployed release.

## Delivery boundary

Love subsequently authorized everything required for handset Apple Pay testing:
commit, reviewed PR/merge, immutable release, exact plan review and protected Park
then public promotion. Use the existing Nacka pilot and retain the current mainline
corrections. The rollout evidence below records the selected SHA and completed runs.
Love performs the physical Apple Pay transaction and acceptance. No new follow-up
draft was created; #329 and the existing normal-404 alarm draft remain separate.

## Protected rollout — 2026-09-04

Reviewed [PR #375](https://github.com/wrlds-creations/jumpyard-check-in/pull/375)
merged as `4ed47e5c1aab56f0417866e4ad10a2e5419a0a7f` after all four required checks
passed in [CI 33863877905](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33863877905).
The source/integration branches remain preserved. The separate #330 rollout
completed before this release was promoted.

Target metadata is unchanged: account `376129878018`, `eu-north-1`,
`jumpyard-check-in-park-test-stack`; Client/CostCenter `JumpYard`, Project
`jumpyard-check-in`, Environment `park-test`, Owner/CreatedBy `love`, Repository
`wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, DataClassification
`confidential`, Exportable `true`. Only the existing Nacka `50871` date window is
used, with migration apply disabled. Public origins are `https://checkin.jumpyard.se`
and `https://staff-checkin.jumpyard.se`.

Main CI [33864750791](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33864750791)
also passed all four checks. Before #374 promotion, #330 completed both protected
[Park 33863602024](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33863602024)
and [public 33863606635](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33863606635).
Its immutable release `33862373255`, SHA `668a476d21173a14c7bd449784ab7ef53247f502`,
artifact `9933035732` (digest
`sha256:4d7f911de3d16e82c464c3310e47e3f3642c3e07cb8038b324ad7dabdf9b1764`,
expires `2026-12-03T10:15:39Z`) is the verified compatible rollback candidate.

Selected successful [release 33864750849](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33864750849)
contains artifact `9934011980`, digest
`sha256:b46f416c064ac043e60b0cd25e823ef3dff0e297610801b97d4f43ea6a378d0a`,
expires `2026-12-03T10:45:42Z`. Local validation matched all 545 file checksums;
manifest SHA256 is `7816e844826d6f4f95098d6216ac70d3efee50e607542d6f0d05f2a5c31d3cc4`.

[Park run 33866158981](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33866158981)
was dispatched with that run/SHA, intent `promote`, and migration apply disabled.
The reviewed plan artifact `9934043454` has identical current/release template
`1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`, 202 resources,
and zero resource or section changes. Delegated approval under Love's instruction
followed that exact plan review; protected deployment id `6262966681` targets the
existing `park-test` environment `18183060938`.

Park completed successfully. CDK reported no changes; the ordinary verifier passed
the successful stack state, exact template, `IN_SYNC` drift, zero active alarms,
empty related queues, migrations already applied through `0020`, and exact-SHA
Cloudflare output checks. No migration was applied by this rollout. Independent
readback at `2026-09-04T11:14:39.931Z` matched all 32 HTTP 200 responses: four HTML
routes, 25 referenced JS/CSS files, the Apple association and two static images.
Evidence: `%TEMP%/jumpyard-gh374-live-exact-assets-park.json`.

Only after Park success, [public run 33867049758](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33867049758)
was dispatched for the same release/SHA. Its completed plan job `101004172237`
revalidated the 545 checksums, identical manifest hash, exact public Pages projects
and origins, and the existing Park API target. The plan performs no AWS mutation.
Delegated approval followed that review; protected deployment id `6263123898`.

Public promotion completed successfully. Exact-SHA Pages readback, public domains,
API/Cognito configuration, allowed/blocked CORS and Apple association checks passed.
Independent public readback at `2026-09-04T11:21:22.203Z` matched all 32 HTTP 200
responses: four HTML routes, 25 referenced JS/CSS files, the Apple association and
two static images. The 9,094-byte Apple file retains SHA256
`8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`.
Evidence: `%TEMP%/jumpyard-gh374-live-exact-assets-public.json`.

Both public origins now serve `4ed47e5`. No rebuild, rollback, re-promotion, live
payment, provider-setting change, guest message or new resource was performed.
Issue #374 remains open for Love's physical Apple Pay acceptance. The publication
evidence is recorded in this file, `AWS_RESOURCES.md`, `REPO_CURRENT_STATE.md` and
the linked GitHub issue. The separate #329 and existing normal-404 alarm draft
remain outside this correction; no new follow-up draft was created.

The dependent evidence PR #377 integrates #330's rollout documentation from
PR #376. Its first CI run `33868746713` passed Phone, Infrastructure and Admin,
but Repository rejected the 12,000-character current-state limit. Only the two
new summary lines were shortened; this report retains the complete evidence,
both AWS histories remain, and #330's acceptance document is unchanged from main.
The existing history/archive validator then passed. No application change or
additional publication was needed for this documentation correction.

### Handset acceptance

After verified public promotion, open the public guest link afresh in Safari and
perform the Apple Pay purchase personally. While preparation is needed, visible
progress should precede the receipt. Once ready, one Continue action should open
the safety video. An immediately ready booking may show the receipt promptly;
there is no artificial minimum delay. If booking preparation takes longer, the
delayed view must offer one same-purchase retry and instruct the guest not to pay
again. A real payment or staff redemption is not part of automated rollout smoke.
