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

## Review and rollout status

Love authorized commit, push, reviewed merge and protected publication of #347 on 2026-09-04. Implementation is independent of blocked #337/#342. Publish the immutable mainline artifact through Park verification and then the two public Nacka origins; no migration, new AWS resource or business transaction is authorized. Preserve the existing 205-resource Park backend and its verified alarm routing. Review the actual plan before protected approval. The successful Park release `33876169856` / `1783cd468caa0198755841641fc3a55962bdeda0` is the backend-compatible rollback candidate; verify its unexpired artifact before dispatch. Final PR, run IDs and readback evidence will be added after rollout. Physical handset verification has not been performed by the agent.
