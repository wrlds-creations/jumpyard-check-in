# Phone completion — #432

Love approved the local kiosk-style phone completion and stronger QR shadow on 2026-09-22, then explicitly requested commit, push, merge and deployment. Base: `8f31c5459658aeff591441e809ad5c2d11410ad2`. The issue supersedes the original preview-only boundary.

## Implementation

`PhoneCompletion` renders the red hero, official kiosk Acumin font/success asset, full server-owned number, diagonal edge, QR card, pickup rows and optional café/other groups. Its native dialog enlarges the same QR, with an accessible title, focused close action and Escape support. It never calls the backend or resets automatically.

The existing `ConfirmationScreen` remains the data projection and chooses the new presentation only for an identified, numbered, ready phone session. All prior completed/missing/kiosk behavior stays on the existing path. Number leading zeros, long legacy codes, issue day, package quantities and existing callback semantics are preserved. The page hides the ordinary navigation only while that same readiness predicate applies; the final view owns language switching and its full-width hero. The production flow never imports fixtures.

The local completion route now renders the real confirmation component with synthetic ready/datetime/legacy/missing/completed/SMS and standard/Combo fixtures. Production renders a not-found page. The preview's local session identity is intentionally invalid for real staff use.

## Validation

- Focused component/ready-state, completed-booking and package tests: 25 pass, including executable callback preservation.
- All phone flow/component tests with Node type stripping: 347 pass. Full phone lint: no errors, four existing image warnings. TypeScript and production webpack compilation pass. Production preview-404 guard and its eight tests pass.
- `npm run infra:check`, repository template/current-ticket validators and `git diff --check`: pass.
- Original local design review and user-requested shadow are recorded in [design QA](design/gh-432/design-qa.md); production-component verification and release evidence are appended below when complete.
- Root validation initially stopped at the unchanged admin build because Turbopack cannot follow this worktree's dependency junction outside its root. The required clean-install GitHub Repository check is authoritative for that suite; no application code is changed to bypass it.

Physical phone/scanner and live guest/payment/redemption acceptance are not claimed. No provider transaction or guest send is needed to verify this presentation change. No unrelated follow-up is implemented.

## Protected rollout — 2026-09-22

Implementation [PR #433](https://github.com/wrlds-creations/jumpyard-check-in/pull/433) merged as `9170e9b6c032aa893f60b06bb63967a7683a382c`. All seven PR checks passed ([CI 35739785050](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/35739785050), workflow validation 35739785205), including the clean-install Repository check that supersedes the local junction limitation. Main CI [35740312123](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/35740312123) also passed.

Immutable release [35740310293](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/35740310293) built the selected source once. Artifact `10699414499`, `park-test-release-9170e9b6c032aa893f60b06bb63967a7683a382c`, has digest `sha256:5d6cc9367d7876be9195bb444d399f53df788dba78d7080320f091cab1c9a7fe`.

Park plan [35741130608](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/35741130608) was reviewed before protected approval under Love's explicit deployment instruction. The main-scoped OIDC identity verified account `376129878018`, region `eu-north-1`. Current and selected templates contain 208 resources with zero additions, changes or removals, identical SHA-256 `f1981878b54225e49cf944bfe128b792d71ec857cce2ff50c6b6b64ae9a2fbd9`; `apply_migrations=false`.

The Park run completed successfully. CDK reported no changes; post-deploy verification required the exact selected template, `IN_SYNC` drift, zero alarms in ALARM, empty visible/in-flight queues and no pending migrations through `0023`. Phone: `https://3da69000.jumpyard-check-in-park-test.pages.dev`; admin: `https://4d908b29.jumpyard-checkin-admin-park-test.pages.dev`.

Public plan and deployment [35741671433](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/35741671433) then passed using the same release without rebuilding. Its reviewed plan verified all 687 artifact files and only the two existing public Pages targets. Protected approval was recorded after plan review under the same explicit user instruction. Public phone: `https://581aa514.jumpyard-check-in-production.pages.dev` behind `https://checkin.jumpyard.se`; public staff/admin: `https://47d972e9.jumpyard-checkin-admin-production.pages.dev` behind `https://staff-checkin.jumpyard.se`.

Public readback verified both deployment commit identities against the full selected SHA; phone, staff, admin and callback routes returned HTTP 200 with the exact existing API/Cognito targets. Apple Pay association SHA-256 remained `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`. Independent public/immutable-Park comparison verified 27 HTML/JS/CSS files byte-for-byte plus the two copied assets against merged source (29 files total); the public phone chunks contain the new completion and approved shadow. [File-hash evidence](gh432-public-assets.json). The completion preview returns the static not-found document with no synthetic session (HTTP 200 from static hosting); it exposes no preview controls or functioning fixture.

The public start page also rendered successfully in the browser with both booking choices and SV/EN controls; no guest flow was submitted. No AWS resources, migrations, backend contracts, provider transactions or guest sends changed. AWS_RESOURCES therefore needs no inventory change. No out-of-scope draft was created. The optional physical handset/scanner check remains separate; all issue-required implementation, automated checks, browser component review and protected publication are complete. The dependent evidence PR updates REPO_CURRENT_STATE after the implementation merge; its documentation-only release is not promoted.

Rollback candidate: the prior successful release [35353838050](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/35353838050), source `75c7964afab85bf703690e1712cc2117226ae101`, artifact `10550923040`, digest `sha256:cad245258540d4f2837ea49968f2454814384506d0b4ce349bc364079a21aab0`. Its successful Park/public runs were `35354516205` / `35354947918`; artifact availability was rechecked before promotion. Rollback and re-promotion were not executed for this presentation-only issue; the same protected workflow can select that existing artifact without rebuilding.
