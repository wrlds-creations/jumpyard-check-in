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
