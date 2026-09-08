# Staff design integration for #345

The approved `/preview` design from `codex/gh-389-staff-preview` is implemented in the production staff root on `codex/gh-345-staff-handoff`. The source preview worktree and return patch remain untouched. #389 is design provenance; #345 owns this product change.

## Differences from RETURN.md

- The real route is `/`, not `/preview`. No synthetic preview route or fixture data is included in the production staff export.
- `src/components/staff/StaffExperience.tsx`, `flow.ts` and `ui.tsx` integrate the reviewed white/black/red design with `src/app/page.tsx`'s existing PIN, identity, heartbeat, scanner and request lifecycle.
- Product selection, ownership, daily codes and receipts use the real API. Opening is read-only; the first product tap claims and persists selection.
- Partial product quantities are supported. Café shows Kvar att hämta/Utlämnat and collapses entrance history. The same session QR remains visible on the phone after admission.
- Claim expiry, stale-version conflicts, interrupted confirmation, a second group on the same booking, authoritative package quantities and payment/safety blockers have real backend handling.
- Tests use actual components and native PostgreSQL. The old prototype model tests do not describe the new backend and are not copied into this branch.

## Local review

Development URL used on September 8: `http://127.0.0.1:3002/`.
The browser review used a temporary local API on port `4005`, native PostgreSQL on `55435`, synthetic bookings and three test identities. It did not contact AWS or ROLLER. Those fixtures/configuration are outside the repository and outside production builds.

Verified walkthrough at 390 x 844: Sara selects three bands and three socks; closing/reopening preserves the choice; confirmation records admission and entrance goods. Maja reopens the same guest in Café, selects one of two coffees, and confirms. One remains; admission still names Sara and the café receipt names Maja. Reloading restores the saved selection through the resume action.

Screenshots are in the local `gh345-live-flow-20260908` visualization folder: entrance selection, partial coffee, saved coffee, 320 px queue, live colleague ownership at 320 px, and 1,100 px café/history. There is no horizontal overflow at 320 or 1,100 px. While Maja kept Erik open, a separate local API client selected goods as Sara; the open page automatically displayed Sara and disabled editing. Releasing Sara's claim automatically restored the controls. The same `JY_HANDOFF:0001:jycs_qa345_0` QR payload reopened Anna after admission; this validates payload handling, not a physical camera.

The selected guest now polls every two seconds in the real PIN flow. Whole-day polling adapts for larger days and spaces pages to fit shared staff route limits. A five-device synthetic request model covers 205–5,000 daily bookings without modeled route throttling; it is not live load evidence. State labels use a slightly smaller size below 360 px so all four fit.

## Validation commands

From this app: `npm run lint`, `npx tsc --noEmit`, `node --test src/lib/*.test.mjs`, `npm run build`.
From repository root: `npm run validate`, `npm run infra:check`, `npm run validate:gh345-staff-handout`.
The native database tests require the disposable PostgreSQL instance described in [the issue runbook](../docs/gh-345-staff-handout.md).

Final results on September 8: lint, TypeScript, all 84 staff tests and production build passed. Repository and infrastructure suites passed. #345 passed 26 native/API/pure checks plus six frontend/model tests without skips; all 21 migrations also passed against a newly created database. Phone validation/build passed. Detailed results, known dependency follow-up and rollout/rollback plan are in the issue runbook.

Following Love's explicit publication approval, PRs #393/#394 merged and immutable release `34229583004` / `ca38fec4515d135f642d10de3f839871d07e2498` passed protected Park `34230754910` and public `34231738633`. The real [staff app](https://staff-checkin.jumpyard.se) and [guest app](https://checkin.jumpyard.se) now serve that artifact; all 60 independently fetched Park/public static responses matched. [Exact migration, backend, approval and public-version evidence](../docs/gh-345-staff-handout.md#protected-rollout--2026-09-08).

Physical Motorola/camera, two-phone collection and ordinary website ticket QR acceptance remain for Love's live walkthrough. APK packaging remains outside #345. The old localhost `/preview` is not the deployed app.
