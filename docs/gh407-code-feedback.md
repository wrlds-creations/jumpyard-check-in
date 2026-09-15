# Phone Discount-Code Feedback (#407)

## Protected rollout — 2026-09-15

Love asked for commit, push, merge and deploy of the phone and kiosk work.
Reviewed [PR #415](https://github.com/wrlds-creations/jumpyard-check-in/pull/415)
merged as `4bd7501c62997180d6177006c9827443b5495d32` (branch `5cf5229` plus a merge of
main that renumbered this decision to D0221 and folded the #407 pointer into the
flow-facts line). All six PR CI jobs passed on Linux, including repository
validation and the whitespace check. Review was performed by the implementation
agent; no independent human review is claimed. The kiosk counterpart shipped as
kiosk PR #107 / release evidence PR #108.

### Exact artifact and Park verification

- Immutable [release 34977478153](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34977478153),
  artifact `10400526044`, digest
  `sha256:9594b167742775be2c2c907b09680159798906a232811ad235f2d9657a338086`,
  manifest SHA256 `592a80ad968ef0a11ace27895870a1d0afb1acbd4f526437d9a7eba9c0552bde`.
- Protected [Park run 34978297036](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34978297036)
  passed (plan job `104411639224`, deployment job `104411768211`). The uploaded
  plan was read before delegated approval under Love's instruction: 208 current
  and 208 release resources, Added/Removed/Changed none, identical current and
  release template SHA256
  `ae412badf5c7d0d6fde1ba93e30c2440a85ef4b0dec9b39f7b0181e36a8981e6`, apply
  migrations false, zero alarms in `ALARM` before dispatch.
- Post-deploy verification in the same job passed: template equality, `IN_SYNC`
  drift, zero active alarms, empty queues and exact-SHA Pages checks. Park phone
  deployment `https://53b3bcc3.jumpyard-check-in-park-test.pages.dev` serves the
  new chooser text (chunk readback); admin deployment
  `https://1e15e78f.jumpyard-checkin-admin-park-test.pages.dev`.
- No backend, schema, gate, IAM, provider or infrastructure change. Account
  `376129878018`, region `eu-north-1` and the Nacka `50871` stack are unchanged.

### Nacka public promotion

- Protected [public run 34978711381](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34978711381)
  promoted the same artifact (plan job `104413086026`, deployment job
  `104413154417`): identical artifact id, digest and manifest, allowed public
  origins `https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se`.
- Production Pages deployments: phone
  `https://20ab2766.jumpyard-check-in-production.pages.dev`, admin
  `https://48d53fe0.jumpyard-checkin-admin-production.pages.dev`; the workflow's
  public domain verification passed.
- Readback: before promotion none of the ten `https://checkin.jumpyard.se`
  page chunks contained the chooser text; after promotion a page chunk does and
  four chunk names changed.
- Rollback candidate: release run `34975928084` (`96c2221`, previous public
  frontend `65efb38`). Public handset acceptance by Love remains the final check.

## Scope And Provenance

- Issue: [#407](https://github.com/wrlds-creations/jumpyard-check-in/issues/407).
- Approved by Love on 2026-09-15 after the proposal to clarify the shared discount input and remove premature acceptance.
- Branch: `codex/gh-407-discount-code-feedback`, based on `origin/main` at `93ce93c893e896d12ec5d81b0670152b38ace3ba`.
- Dedicated worktree preserves the unrelated, uncommitted #396 recovery changes. No unmerged dependency.
- The [existing investigation](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=229915730) owns fixture/provider follow-up. MVP is deferred; no raw code is recorded here.

## Behavior

The contact step now exposes one **Rabattkod eller presentkort** / **Discount code or gift card** section. Love reviewed the first version on 2026-09-15 and asked for one code at a time and a less clumsy action, so the section holds the question **Vad vill du använda?** / **What would you like to use?** above a three-way segmented choice **Rabattkod** / **Medlem** / **Presentkort** (icon plus label), a single code field with **Applicera / Apply** inline at the end of the field, and one status line under the field. Selecting another type or typing in either field clears the other value, so the discountCodes and giftCards payloads stay separate but never travel together. Love asked on 2026-09-15 for the membership option ahead of member codes existing; until a membership route exists a member code travels through the existing discountCodes payload with its own label and placeholder, so no API change is involved. An accepted code shows a green status card (**Koden är godkänd** / **Presentkortet är godkänt**, amount deducted) with an X to remove it; a rejected code shows a red warning card (**Koden kunde inte användas**). A typed but unapplied code shows **Koden kontrolleras när du går vidare.** Continue always rechecks the current code: an accepted code continues straight on, and a rejected one opens a dialog (Love's idiot-proofing request, 2026-09-15) offering **Fortsätt utan kod**, which clears the code and books at the regular price with empty code payloads, or **Ändra kod**. Continue is therefore no longer disabled by a rejected code, and no duplicate submit-error text is shown. The Continue button reads **Slutför bokning** / **Complete booking** when the verified amount owing is zero.

Love's follow-up explicitly requires **Applicera / Apply** before continuing, in both phone and kiosk. Apply only requests a quote and stays on Contact, displaying the verified discount and amount owing. It does not create a draft or start payment, including when the amount owing becomes zero. The action requires valid contact details and explains that requirement when they are missing. Continue separately obtains a fresh quote before the existing draft/payment flow.

New values stay neutral with only the inline Apply as the affordance (the discount type shows **Gäller även klippkort.** / **Also for clip cards.**). Missing summaries, absent requested codes, zero/non-finite application and empty error lists alone never produce acceptance. Positive application from the current quote enables the accepted state and applied amount; explicit errors remain rejected. The known generic API rejection is presented using the selected language and generic code terminology. An immediate quote-operation lock prevents duplicate checks and concurrent checkout preparation in either click order, before React rerenders.

Code, gift-card, contact and basket changes clear quote feedback and totals together. A request version invalidates old quote success/failure on changes, Back during quote preparation and unmount. A stale quote cannot create a draft. Contact/code inputs remain locked while checkout preparation runs. Existing discount/gift-card payloads, paid/free continuation and payment recovery remain intact.

## Validation

- Focused synthetic regression and existing payment recovery/confirmation/navigation checks.
- Phone ESLint, TypeScript/production export and production mock-boundary check.
- Repository validation, infrastructure check and whitespace checks.
- Production-export browser checks at 320/390px in Swedish/English against a loopback-only synthetic API; no provider calls or real booking/payment actions.

Verified on 2026-09-15:

| Check | Result |
| --- | --- |
| `npm run validate:gh407-payment-options` | 34 synthetic tests passed, including standalone Apply, fresh Continue, one-code-at-a-time clearing, type switching and remove checks; also included in root validation. |
| Phone `npm run test:payment-recovery` | 137 tests passed. |
| Phone `npm run test:payment-confirmation` | 55 tests passed. |
| Phone `npm run test:addon-back` | 11 tests passed. |
| Phone `npm run lint` | Passed, with four existing `no-img-element` warnings in unchanged files. |
| Phone `npm run build` | TypeScript, production export and mock-boundary check passed. |
| `npm run validate` | Passed; the final mutual-exclusion refinement was then covered by focused and confirmation reruns. |
| `npm run infra:check` | Passed, including local example synthesis; no deployment. |
| `git diff --check` | Passed. |

Browser verification used the production export at `127.0.0.1:4187` and a synthetic API at `127.0.0.1:4188`. Swedish 320px and English 390px layouts had no horizontal overflow. The final section heading is **Rabattkod eller presentkort** / **Discount code or gift card**, and the shorter placeholder is **Ange kod** / **Enter code**. Screenshots confirmed readable wrapping.

Observed flows: initial neutral status at 200 kr; localized rejection without acceptance; full discount accepted at 0 kr; editing/removing a code clearing prior feedback; separate gift card initially neutral, then accepted for 100 kr and removed back to 200 kr; disabled contact/code inputs during preparation; Back during an eight-second quote returning to Summary and remaining there after the response, with neutral feedback on returning to Contact.

The first iteration's browser fixture could not complete draft creation because its CORS allow-list omitted the draft idempotency header. That historical connection error is superseded by the final standalone Apply checks: rejection and full coverage stay on Contact without any draft request. English 390px and Swedish 320px show Apply, accepted discount and updated amount owing before Continue. Paid/free draft continuation is covered by executable component tests; no complete browser purchase is claimed. The local build points only to the loopback fixture and is not a release artifact.

UX revision check on 2026-09-15 (Swedish, 375px production export against the loopback fixture): rejected code shows one inline red line and disables Continue; a full-coverage code shows Godkänd · -200 kr, 0 kr and Slutför bokning with an X to remove; switching to Presentkort clears the code and shows the gift-card placeholder; the three-way chooser with Medlem was added afterwards and rechecked in the same way. Phone lint, TypeScript and the production export passed after the revision.

Kiosk parity has its own implementation and evidence under [kiosk #99](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/99), including the touch keyboard and required promo punctuation.

## Delivery Boundary

The rollout above covers commit, PR, release and both protected promotions; no ROLLER business write, AWS resource change or guest message is included. Public handset acceptance by Love remains. `REPO_CURRENT_STATE.md` is unchanged because this work is unmerged. D0221 records the label/feedback policy; D0218 belongs to the separate #396 work.
