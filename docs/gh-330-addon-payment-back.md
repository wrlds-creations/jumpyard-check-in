# Back during the phone add-on payment — #330

## Scope and base

Approved issue: [#330](https://github.com/wrlds-creations/jumpyard-check-in/issues/330), item 3 of the
park-readiness list. Branch `codex/gh-330-addon-payment-back` from `origin/main`
`4d3e68d` (after #367 / PR #371). Love approved implementation in chat on 2026-09-04 ("go")
after a plain-language walkthrough with the park scenario below.

The issue asks for three things while a guest pays for add-ons on the phone:

1. Back must not open a parallel payment attempt.
2. A late result from a closed checkout must not change another purchase.
3. Approved, refused and unknown payments must follow different navigation rules.

## Park scenario

A parent buys socks on the phone inside the park. She taps **Betala**, the park Wi-Fi is slow and
the screen keeps spinning. After ten seconds she taps **Tillbaka**. Nothing must let her pay twice,
nothing from the first attempt may be attributed to a later one, and what Back does must depend on
how the payment ended.

## Walkthrough of the merged code before this change

The checkout wrapper (`RollerPaymentDropIn`) reports a navigation lock for `received` and `approved`
(and for its own `unknown` state) through `onNavigationLockChange`; `AddonsOffer` kept that lock in
a ref and its `returnToSelect` ignored Back while locked or while the payment was unknown. The
page-level Back button, however, only knew the offer's step (`addonsHandlesBack`), so it could not
follow the payment state.

| Payment state | Back before this change | Protection | Gap |
|---|---|---|---|
| Ready, before Betala | Returns to the selection. The checkout cleanup discards the unsubmitted recovery record, the basket (quantities) is kept and the next Continue creates a new draft with a new key. | Existing | None |
| Submitted, waiting for the result | Button visible, tap ignored by the lock. | Existing lock | Inert button, no explanation |
| Unknown, no result | Button visible, tap ignored; only **Kontrollera status** works. | Existing lock and `paymentFailure === 'unknown'` | Inert button |
| Refused | Returns to the selection after the failed attempt is closed (`clearPaymentRecoveryAfterCompletion`); **Prova annan betalmetod** does the same. | Existing | None |
| Approved | Offer step `APPROVED` handed Back to the page, whose state for `APP_ADDONS` is `APP_BOOKING`. The button was active and left the confirmation; a later add-on attempt was blocked by the approved recovery record and showed recovery instead of the shop. | Recovery record | Active button after payment |
| Safety video after payment | `getBackState('APP_SAFETY_VIDEO')` fell back to the pre-payment screen once `paymentTotal` was 0, so a paid new entry and a paid add-on both showed Tillbaka toward the add-on shop, where a second add-on purchase could start. | None | Active button after payment, both flows |

Criterion 2 was already enforced: the wrapper's `current()` requires that the instance is not
cancelled or terminal, still holds ownership and still matches the exact current record (attempt id,
booking identifier and kind); its cleanup sets `cancelled` and releases ownership, so a late SDK
result for a closed instance is ignored. `AddonsOffer` additionally guards approval with
`activePaymentAttemptRef` and `paymentApprovedRef`. The new-entry checkout (`BuyTickets`) already
hid its own Back in the same payment states; the add-on flow did not.

## Change

- `src/flow/addonPaymentNavigation.ts` (new). `getAddonBackRule` maps the offer step, the checkout
  navigation lock and the failure state to one of `page` (selection step: page-level Back applies),
  `select` (before submission, after a confirmed refusal and on the non-payment steps) or `hidden`
  (submitted, unknown or approved). `getFlowBackAction` decides what the shared navigation row
  offers: `addons`, `page` or nothing.
- `src/components/AddonsOffer.tsx`. Mirrors the lock into React state next to the existing ref,
  derives `backRule`, applies the same rule in `returnToSelect` and in the Back-request effect,
  reports it through the new `onBackRuleChange` prop, and resets it on unmount and when a new draft
  starts. Returning to the selection also clears the lock state.
- `src/app/page.tsx`. Holds `addonsBackRule`, replaces `addonsHandlesBack` with
  `getFlowBackAction`, hides the button when the rule is `hidden` and resets the rule when the flow
  leaves `APP_ADDONS`. `getBackState` returns no Back state for the safety video once
  `paymentCompleted` is set, in the new-entry and add-on flows alike; the attest screen keeps its
  return to the video, which never reaches a purchase screen and is the only way to watch it again.
- `src/flow/addonPaymentNavigation.test.mjs` (new), `test:addon-back` in the phone package and
  `validate:gh330-addon-payment-back` in the root `validate` chain.

Unchanged: recovery storage and ownership, `RollerPaymentDropIn`, backend, contract, kiosk,
provider configuration. Browser Back (`popstate`) keeps its existing handling: leaving the document
retains the recovery record, and the repeated-Back limitation accepted in #361 stands. A Roller draft
created before an in-app Back in the ready state remains with Roller until it expires; reusing the
same attempt on retry is #337.

## Validation — 2026-09-04, base `4d3e68d`

- `npm --prefix jumpyard-checkin-phone run test:addon-back`: 11/11 pass. Rule table for every step
  and payment state, page and offer wiring, the actual `getBackState` after a completed payment,
  the retired-instance guard, and add-on recovery cases
  (discarded fresh attempt cannot approve its replacement; submitted or approved attempts block a
  replacement and cannot be downgraded; a refused attempt may be replaced and its late approval is
  ignored). No provider or network call.
- All other phone flow suites plus the payment preview test: 187/187 pass.
- `npx tsc --noEmit`: pass. `npm run lint`: 0 errors, the 4 pre-existing `<img>` warnings.
- `npx next build --webpack`: pass. Webpack is used locally because this worktree shares the
  dependency directory through a junction; release builds are unchanged.
- `git diff --check`, `validate:current-ticket`, `validate:template`, `validate:followups`: pass.
- `node scripts/validate-history-archives.js` keeps the known local Windows CRLF limitation owned by
  the existing Project draft **Make context-size validation consistent for Windows line endings**;
  `PROJECT_CONTEXT.md` is 11,967 LF bytes against the 12,000 limit and was therefore not extended.
  The durable rule is recorded as D0208 in `DECISIONS.md`.
- Not performed: a browser or handset run of a live add-on payment, because reaching the payment
  step creates a Roller draft on Live Nacka. The post-promotion handset check is: Back during a slow
  add-on payment (no button), after approval (no button, only **Fortsätt**), on the safety video after
  a paid entry or paid add-on (no button), before Betala (returns to the shop with the basket kept)
  and after a refusal (**Prova annan betalmetod** and Back both return to the shop).

## Extension approved during implementation

The walkthrough found that after a completed payment the safety-video screen still offered
Tillbaka toward the add-on shop in both flows. Love confirmed in chat on 2026-09-04 that no Back
arrow may exist after a completed payment, for a regular booking as well, and approved handling
it inside #330. A resumed session that reaches the safety step without a payment in this flow
keeps its existing Back to the offer; the exit action was already hidden there by the server
safety state.

## Protected rollout — 2026-09-04

Love asked Codex to finish the interrupted #330 release after the implementation agent merged
[PR #372](https://github.com/wrlds-creations/jumpyard-check-in/pull/372). The selected source is
`668a476d21173a14c7bd449784ab7ef53247f502`. No implementation change was needed during takeover.
Documentation branch `codex/gh-330-rollout-evidence` was reconciled with `main` at `4ed47e5`
before committing. This report describes the dated #330 rollout; #374 owns its later promotion.

[CI 33859902705](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33859902705)
passed Repository, Infrastructure, Phone and Admin. Repository dependency installation took
19 minutes 38 seconds; its validation took 72 seconds. The successful immutable
[release 33862373255](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33862373255)
built the selected source once. No deployment or rollback rebuild was used.

| Release evidence | Verified value |
|---|---|
| Artifact | `9933035732`, `park-test-release-668a476d21173a14c7bd449784ab7ef53247f502` |
| Artifact ZIP SHA256 | `4d7f911de3d16e82c464c3310e47e3f3642c3e07cb8038b324ad7dabdf9b1764` |
| Manifest SHA256 | `7b77bd10f6cfd0d31e9c3c7d7a438c1ef43df795d30d0d812a031342e615ccc9` |
| Validated files | 545 |
| Canonical current/release template SHA256 | `1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3` |
| CDK assembly SHA256 | `36d3b0cae830b09a67fdf78cb485bed1e355b8e1b4a92e414ffcea4d65d7ddf2` |
| Phone tree SHA256 | `d2acf867c2a9b6b5d087a3ef9f9e07851e34285f7cdc615c3e374e4c44bd4bd5` |
| Admin tree SHA256 | `5cc873a875e670a66ce6dbbc54322d63b789e38b42d1a9305880ea6343dc5fbb` |

Independent preflight byte-matched all four live root HTML responses and their 44 referenced
JS/CSS responses to the previously deployed `4d3e68d58ed69d48f7164a95e3977cc4af44857d`
artifact. The selected source adds only #330 and #367 rollout documentation to that baseline.
Its CDK assembly, migration runtime and deployment config are identical to the baseline.

The protected [Park plan 33863602024](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33863602024)
validated the exact artifact and AWS account `376129878018`, region `eu-north-1`, and stack
`jumpyard-check-in-park-test-stack`. It compared 202 current and selected resources, with no
added, changed or removed resource or template section. Migration apply was explicitly false.
The plan was reviewed before delegated approval under Love's takeover instruction. Existing
WRLDS metadata, Nacka venue `50871`, dates through `2026-09-30`, and runtime gates remain intact.

Park run `33863602024` passed every step. CDK reported `no changes`; migrations `0001` through
`0020` were already applied before and after, with no migration apply. Successful stack status,
exact template equality, `IN_SYNC` drift, zero active alarms, empty queues, exact-SHA Pages
metadata, HTTP/API-target and Apple association checks all passed. Park phone deployment is
`49cf5678`; Park admin deployment is `81a1adc6`. An independent byte comparison matched both
Park root HTML responses and all 22 root-referenced JS/CSS responses to the selected artifact.

The [public plan 33863606635](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33863606635)
validated the same artifact and the fixed phone/admin targets for `https://checkin.jumpyard.se`
and `https://staff-checkin.jumpyard.se`. Delegated public approval followed successful Park
verification and independent artifact readback; the public workflow performs no AWS mutation.

Public run `33863606635` completed successfully at `10:51:35Z`. Phone deployment `d8069039`
and admin deployment `ea8ffa4e` carry the selected full SHA. Git-disconnected project/domain
checks, allowed and rejected CORS origins, Cognito callbacks, exact-SHA deployment metadata,
public HTTP/API configuration and the Apple association checksum all passed.

At `2026-09-04T10:51:50.175Z`, final independent readback byte-matched all four Park/public
root HTML responses and all 44 referenced JS/CSS responses to the selected artifact. The two
phone roots share SHA256 `36ef6e8bbbd5c0dbfdabda21d42346a7a759a3cfd8195bdd1945ae18a04736e2`;
the two staff roots share `77c85d5abbff2f622f585a13004b49a85bbba12818a85af44c5fea55a900d83a`.
Local artifact and readback reports are under `%TEMP%/jumpyard-gh330-evidence-20260904/`;
the linked workflow plans, logs and artifact hashes provide durable release provenance.

Initial evidence-document validation passed `node scripts/validate-current-ticket.js`,
`node scripts/validate-aws-tags.js`, `node scripts/validate-template.js`,
`node scripts/validate-followups.js` and `git diff --check`. The history-archive validator reported
only the pre-existing Windows CRLF size failure for the then-unchanged `PROJECT_CONTEXT.md`
(12,074 characters locally, 11,967 with LF). Its existing Project draft owns that correction;
the selected source already passed the complete Linux CI/release checks. No application code
was changed or rebuilt while writing this evidence.

Before committing on the reconciled `4ed47e5` base, the same four documentation validators,
`node scripts/validate-history-archives.js` and `git diff --check` all passed. The mainline
`PROJECT_CONTEXT.md` now checks out within the size limit; no validator was changed.

For the #330 rollout, the retained rollback candidate was the actually deployed previous
[release 33847988150](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33847988150),
SHA `4d3e68d58ed69d48f7164a95e3977cc4af44857d`, artifact `9927575535`, ZIP SHA256
`bc0e5101cd367b24300aa6b42db580c12ee172abb5b3a81d7b2f14d5a668fd7d`.
It passed Park `33850212562` and public `33849552330` and was unexpired through
`2026-12-03T07:16:37Z`. Rollback of that rollout would select the same artifact through both
protected workflows, restoring the previous Back behavior without reversing payment or guest state.

No live booking, payment, redemption, guest message, provider setting, rollback or re-promotion
was performed during this takeover. No new follow-up Project draft was needed; #337 and the
existing Windows line-ending validation draft retain the previously documented limitations.
Love explicitly accepted closure on 2026-09-04: "snyggt! Vi kan stänga den!" after receiving
the behavior explanation and handset checklist. No itemized handset outcomes or additional
live-payment evidence were supplied. The dated rollout evidence and that acceptance are
recorded in the [GitHub closeout comment](https://github.com/wrlds-creations/jumpyard-check-in/issues/330#issuecomment-5539582893).
Love subsequently authorized committing this documentation. Passing automated checks and
deployed-file equality do not stand in for a real slow/refused/approved payment flow on a handset.
