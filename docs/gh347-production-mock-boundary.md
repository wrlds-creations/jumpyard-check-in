# GH-347: Phone production mock boundary

Issue: [#347](https://github.com/wrlds-creations/jumpyard-check-in/issues/347). Base: `82566a33b50270a71f58179ce24e02cd44a44cb4` (updated from `1783cd4` by fast-forward; intervening changes are published rollout documentation). Branch: `codex/gh-347-production-mock-boundary`.

## Finding and change

The public `/extend` route rendered a simulated extension from 15:30 to 16:00 for SEK 50 and could invoke mock payment and QR creation. A read-only browser inspection confirmed the offer was reachable; no payment or real booking was performed. The main page also imported the old mock `PaymentView`, although normal entry and add-on purchases use the real payment components. `PresentCode` had no public import path.

`/extend` now renders the not-found page outside development. Its existing local preview remains available at the same development URL with an explicit simulation label. The main page no longer imports or renders `PaymentView`; an unhandled legacy balance returns to the real add-on flow. Every mock client operation rejects execution outside development, protecting against an accidental future import. Legitimate payment and safety previews retain their existing development-only boundaries.

No additional healthy-flow step, fixed wait, network call, dependency, infrastructure, schema, or kiosk change is introduced. This issue is independently reviewable and does not require the provider-dependent recovery work in #337/#342.

## Validation

- Eight isolated tests passed: all 11 mock operations reject in production, test, and unset environments before starting work; development previews remain usable; legacy state transitions cannot reach simulated payment; the public route import graph and preview boundaries are checked.
- The independent phone production build with Next.js 16.0.8 and webpack passed compilation, TypeScript and static export. The resulting extension, payment-preview and safety-preview files contain not-found content and no guest controls. The combined validation worktree also passed the production build on the same Next.js version; no rebuild is needed merely to add the command wiring recorded here.
- Six local production-browser cases passed in headless Edge at 390×844: `/extend`, its token and other query variants, both existing preview routes, and the normal public start page. All external requests were blocked; there were no JavaScript page errors. The extension exposed no payment button after hydration, and the normal start remained usable. Two screenshots were inspected.
- Related payment/navigation regressions passed after updating the old Back assertion to expect the real add-on flow. Targeted lint reported zero errors and one existing image warning. `git diff --check` passed.

Run `npm run validate:gh347-production-mock-boundary` from the repository root, or `npm --prefix jumpyard-checkin-phone run test:production-mock-boundary`. The root `validate` command includes the boundary suite. Phone `postbuild` runs `scripts/verify-production-mock-boundary.mjs` after the normal production build, including the existing CI/release build entrypoint.

Local evidence: `%TEMP%\jumpyard-gh347-build.log` and `%TEMP%\jumpyard-gh347-browser\results.json`, with `home.png` and `extend-not-found.png`. These temporary files are supporting local evidence, not committed artifacts.

## Protected rollout — 2026-09-04

Love authorized commit, push, reviewed merge and protected publication in [the issue record](https://github.com/wrlds-creations/jumpyard-check-in/issues/347#issuecomment-5541390282). Independent agent review found no blockers. [PR #385](https://github.com/wrlds-creations/jumpyard-check-in/pull/385) merged as `32fcb57f0c3a9aa88b331dc7ebf9403b5c0e0eef`, incorporating main `afb7ab2` documentation without a source conflict. Final [PR CI 33880562547](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33880562547) and [main CI 33880879123](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33880879123) passed Repository, Infrastructure, Phone and Admin, including the production export guard. Existing image/action-runtime warnings remain non-blocking.

| Evidence | Verified result |
| --- | --- |
| Immutable release | [33880879052](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33880879052), successful; exact merged SHA above |
| Artifact | `9939991649`; digest `sha256:3d7452341f34d9e47e0c0546773637b493b7ec499dce52d3a71269f137d0e865` |
| Local bundle checks | All 556 files and both Park/public target validators passed; manifest SHA256 `a6d18d7733f522f39e4245c815849338cf44a755ddc850d36ea3963a055b2847` |
| Protected Park promotion | [33881473361](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33881473361), successful; GitHub deployment `6265983654` |
| Protected public promotion | [33881809105](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33881809105), successful at `2026-09-04T14:07:47Z`; GitHub deployment `6266044499` |
| Pages deployments | Park phone `6e699d44`, admin `913fadd4`; public phone `1f835deb`, admin `ceb873f7`; all report the selected SHA |
| Independent static readback | 35 responses per lane, 70 total, byte-matched to the selected artifact: phone root, three disabled routes, admin root/admin/auth callback, referenced JS/CSS, combo icon and phone Apple association |
| Hosted browser checks | Six cases each on Park and public phone, 12 total, passed in Edge at 390×844; zero JavaScript errors |

Both completed plans were read before delegated `LoveWRLDS` approval under the explicit publication instruction. The Park plan retained 205 resources with identical current/release template hash `45be018ca5b478d3b1e1962135df2370356044dce4a66d52e9f885af902c6abe`, zero resource/section changes, and CDK `no changes`. Migrations remain applied through `0020`, with apply disabled. Successful stack state, exact template, `IN_SYNC` drift, zero active alarms, empty queues, exact Pages versions, public domains, CORS, Cognito callbacks and Apple association passed the existing workflow gates. Account `376129878018`, region `eu-north-1`, WRLDS metadata, backend, schema, IAM, runtime gates and verified #335 alarm routing are unchanged. The public workflow performs no AWS mutation.

On both phone origins, `/extend`, its token/query variants, `/preview/payment` and `/preview/safety` render not-found content after hydration with no button, video, form, canvas or simulated purchase control. Cloudflare returns HTTP 200 for these exported not-found files, so status alone is not the boundary check. The normal root is usable. Browser checks allowed only same-origin static GET requests; no business action was performed. Park/public screenshots were inspected.

Rollback candidate: successful prior Park release [33876169856](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33876169856), SHA `1783cd468caa0198755841641fc3a55962bdeda0`, artifact `9938138226`, verified unexpired until `2026-12-03T13:05:45Z`. Its 556 file checksums passed; digest `sha256:da2cdd6b42f23fd2bec900fe0579bee67c550cf49fb3d6847725ab5583c40ac0`. It preserves the current backend and alarm routing and has a successful Park deployment, rather than a prior public promotion. Use the protected workflows with that exact artifact and `intent=rollback`, without rebuilding; reverting it also reverts this phone boundary fix. No rollback or re-promotion was needed or executed.

Supporting local evidence is in `%TEMP%/gh347-release-33880879052`, `gh347-park-plan-33881473361`, `gh347-park-static-readback.json`, `gh347-public-static-readback.json`, `gh347-park-browser` and `gh347-public-browser`. The Actions runs and this document are the durable records.

No real booking, payment, redemption, guest message, physical handset test or capacity/Wi-Fi test was performed. Healthy-flow behavior has no added request, wait or visitor step. #337/#342 remain separate and provider-blocked; their uncommitted recovery changes are absent from this release. No follow-up Project draft was needed for #347.
