# Staff design integration for #345

The approved `/preview` design from `codex/gh-389-staff-preview` is implemented in the production staff root on `codex/gh-345-staff-handoff`. The source preview worktree and return patch remain untouched. #389 is design provenance; #345 owns this product change.

## Differences from RETURN.md

- The real route is `/`, not `/preview`. No synthetic preview route or fixture data is included in the production staff export.
- `src/components/staff/StaffExperience.tsx`, `flow.ts` and `ui.tsx` integrate the reviewed white/black/red design with `src/app/page.tsx`'s existing PIN, identity, heartbeat, scanner and request lifecycle.
- Product selection, ownership, daily codes and receipts use the real API. Opening is read-only; the first product tap claims and persists selection.
- Entrance uses all-remaining toggles; café retains partial quantities. Café shows Kvar att hämta/Utlämnat and collapses entrance history. The same session QR remains visible on the phone after admission.
- Claim expiry, stale-version conflicts, interrupted confirmation, a second group on the same booking, authoritative package quantities and payment/safety blockers have real backend handling.
- Tests use actual components and native PostgreSQL. The old prototype model tests do not describe the new backend and are not copied into this branch.

## Local review

Development URL used on September 8: `http://127.0.0.1:3002/`.
The browser review used a temporary local API on port `4005`, native PostgreSQL on `55435`, synthetic bookings and three test identities. It did not contact AWS or ROLLER. Those fixtures/configuration are outside the repository and outside production builds.

Verified walkthrough at 390 x 844: Sara selects three bands and three socks; closing/reopening preserves the choice; confirmation records admission and entrance goods. Maja reopens the same guest in Café, selects one of two coffees, and confirms. One remains; admission still names Sara and the café receipt names Maja. Reloading restores the saved selection; actionable error recovery opens the exact pending session.

Screenshots are in the local `gh345-live-flow-20260908` visualization folder: entrance selection, partial coffee, saved coffee, 320 px queue, live colleague ownership at 320 px, and 1,100 px café/history. There is no horizontal overflow at 320 or 1,100 px. While Maja kept Erik open, a separate local API client selected goods as Sara; the open page automatically displayed Sara and disabled editing. Releasing Sara's claim automatically restored the controls. The same `JY_HANDOFF:0001:jycs_qa345_0` QR payload reopened Anna after admission; this validates payload handling, not a physical camera.

The selected guest polls every two seconds in the real PIN flow. Whole-day polling adapts for larger days and spaces pages to fit shared staff route limits. A five-device synthetic request model covers 205–5,000 daily bookings without modeled route throttling; it is not live load evidence. State labels use a slightly smaller size below 360 px so all four fit.

## Validation commands

From this app: `npm run lint`, `npx tsc --noEmit`, `node --test src/lib/*.test.mjs`, `npm run build`.
From repository root: `npm run validate`, `npm run infra:check`, `npm run validate:gh345-staff-handout`.
The native database tests require the disposable PostgreSQL instance described in [the issue runbook](../docs/gh-345-staff-handout.md).

Initial release results on September 8: lint, TypeScript, all 84 staff tests and production build passed. Repository and infrastructure suites passed. #345 passed 26 native/API/pure checks plus six frontend/model tests without skips; all 21 migrations also passed against a newly created database. Phone validation/build passed. Current refinement results follow below.

Following Love's explicit publication approval, PRs #393/#394 merged and immutable release `34229583004` / `ca38fec4515d135f642d10de3f839871d07e2498` passed protected Park `34230754910` and public `34231738633`. All 60 independently fetched Park/public static responses matched. This initial artifact was subsequently replaced by the refinement below. [Historical initial rollout evidence](../docs/gh-345-staff-handout.md#protected-rollout--2026-09-08).

Physical Motorola/camera, two-phone collection and ordinary website ticket QR acceptance remain for Love's live walkthrough. APK packaging remains outside #345. The old localhost `/preview` is not the deployed app.

## Live-feedback refinement review — 2026-09-08

Branch `codex/gh-345-staff-speed` continues #345. It removes the date picker and redundant continuation/success/history text. Completed products keep a white surface with a green outline/glow/checkmark and no remaining/completed numbers. Entrance has no quantity steppers and cannot collect café goods. Café purchases appear immediately and can be collected once guest check-in is ready, before bands; partial café quantities and attributed history remain.

Selection feedback is immediate. A serialized buffer retains the latest complete selection, uses accepted revisions, and blocks confirmation until saving finishes. Failed/lost responses recover through authoritative detail reads; logout invalidates queued work. Selection replies update the queue directly instead of triggering a full-day read per tap. Independent detail reads run concurrently; fresh request-local manifests are reused. The booking query restricts product lookup to the original and explicitly linked bookings before checking entitlement, eliminating repeated scans of unrelated bookings.

Lint, TypeScript, repository/infrastructure validation, all **91 staff tests** and the production build passed. The focused suite passed **29 native/API/pure** and **13 component/client** tests without skips; all **22 migrations** applied to a fresh PostgreSQL 17 database. Mobile/desktop review at 320/390/1,100 px covered rapid taps with five-second delays, accepted revision ordering, café before entrance, completed styling, lost-response recovery, logout cancellation and stale polling. No horizontal overflow was present at 320 or 1,100 px. Screenshots: local `gh345-staff-speed-20260908` folder. Browser writes use isolated PostgreSQL fixtures; live timing queries are read-only.

[PR #397](https://github.com/wrlds-creations/jumpyard-check-in/pull/397) merged the refinement as `653c09676201b9856d5b744d0ef716bf6a510088`. Immutable release `34239775713` passed protected Park `34240532179` and public `34241257794`; the [staff app](https://staff-checkin.jumpyard.se) and [guest app](https://checkin.jumpyard.se) now serve that exact artifact. Independent verification matched all 22 migration checksums, ten packaged Lambda files and 60 Park/public static responses. The installed today query returned 58 bookings in a 343 ms Data API sample. A fresh public browser tab rendered the PIN login. Reload staff phones before practical acceptance.

[Current approval, hashes, validation, performance limits and rollback evidence](../docs/gh-345-staff-handout.md#protected-refinement-rollout). Documentation-only evidence merges do not replace the deployed artifact. Physical Motorola/camera, real ticket QR and two-phone customer collection remain Love's acceptance.
