# Weekday Combo contents in phone and Handoff

Scope: [issue #367](https://github.com/wrlds-creations/jumpyard-check-in/issues/367). Love's 2026-09-03 handset evidence shows one wristband in Handoff for a package covering two people. The approved correction covers phone purchase/booking summaries, the final QR session and staff Handoff, including refreshed or resumed sessions.

## Verified product evidence

Read-only verification on 2026-09-03 returned HTTP 200 from the [official Nacka checkout catalog](https://api.roller.app/api/checkout/boka/products), using the existing public routing in `infra/lambda/booking/phone-product-catalog.js`: venue `jumpyardnackaforum`, checkout `boka`, cell `e`, origin `1`, and [Nacka's official booking origin](https://boka-nackaforum.jumpyard.se/). No authentication credential or provider write was needed.

| Catalog fact | Verified value |
|---|---|
| Parent / variation | Weekday Combo `1242135` / `1242136` |
| People per package | `groupSize: 2` |
| Jumping duration | `duration: 60`, `durationType: perSession` |
| Food per package | One pizza to share, stated in the product description |
| Eligible days / observed price | Weekdays / 450 SEK; price is evidence, not a fallback |
| Structured food product | None: pizza is descriptive inclusion; no pizza variation or modifier is returned |

The catalog's summary says: "2 personer", "60 min hoppning", "1 pizza att dela", "Gäller vardagar". It lists JumpSocks, SkyRider and padlock as optional add-ons; none belongs to the combo entitlement. The description includes no drink. The [official Nacka price page](https://jumpyard.se/nackaforum/priser/) independently describes JumpSocks as a separate purchase or online add-on.

Pizza collection after jumping is Love's explicit requirement in issue #367, matching the existing coffee separation. The current Nacka catalog does not specify an exact collection time; the UI must not invent one. D0187/#254 remains the authority for current sale eligibility. Retired ComboDeal IDs `1318777`-`1318780` are absent from the current public catalog and are not inferred from a name match.

## Cause and response contract

The original staff grouping assigns one handout category to each booking item and uses that item's package quantity. One Weekday Combo therefore becomes one wristband, while its descriptive pizza inclusion disappears. Phone summaries likewise receive the package row without separate included contents. The provider's package quantity and its two ticket identities serve different purposes and must remain distinct.

JumpYard Cloud adds optional, response-only `item.packageContents` for the exact verified variation, rejecting a conflicting parent identity. Names alone never establish an entitlement. Each content has `kind` (`admission` or `pizza`), `quantity`, `collection` (`checkin` or `later`), and optional `durationMinutes`. Booking/session content quantities are already totals for that item; clients must not multiply them again. Availability describes one purchasable package and therefore returns per-unit contents.

For a booking item with `quantity: 2`:

```json
{
  "packageContents": [
    { "kind": "admission", "quantity": 4, "collection": "checkin", "durationMinutes": 60 },
    { "kind": "pizza", "quantity": 2, "collection": "later" }
  ]
}
```

Phone and staff presentations expand those contents into separate rows, using their existing check-in/later grouping. Unknown products and items without contents retain their existing presentation. Source item identity, package quantity, linked-item replacement/deduplication, prices, payment totals and authoritative Roller ticket/redemption IDs remain intact. Pizza is a display/collection entitlement, never a synthetic redeemable ticket. No new storage, provider catalog configuration or generic package administration is introduced.

## Implementation validation

- `node --test infra/lambda/shared/package-contents.test.js`: 8 passed. Exact identity/quantity, isolated Lambda copies, cached/live response-only mapping, guest/staff/linked/provisional projection, per-unit availability and unchanged ticket authority.
- `node --test jumpyard-checkin-phone/src/flow/packageContents.test.mjs`: 7 passed. One/two packages, mixed admission/coffee/socks, session-link resume, unknown/legacy fallback, actual Swedish/English QR and booking/purchase rows, and purchase-request separation.
- `node --test jumpyard-checkin-admin/src/lib/packageContents.test.mjs`: 5 passed. One/two packages, mixed/linked items, unknown/family fallback and actual Handoff section rendering.
- `npx tsc --noEmit` in phone, both app lint commands, and both production builds passed. Phone lint retains four existing `no-img-element` warnings; builds retain the existing baseline-browser-mapping age notice. No dependency upgrade was made.
- Existing #253/#289/#300 handoff/linked-item checks and the six public catalog tests passed. Ten restrictive VM validators needed only exact local helper allowlist entries; all ten passed.
- `npm run validate` and `npm run infra:check`: passed, including final local CDK synth. No AWS operation or deploy was performed.
- `git diff --check`: passed.

Browser inspection used actual component markup and production CSS with synthetic data, not live customer data: Handoff at 390px (one package) and 320px (two packages); phone QR in Swedish at 390px and English at 320px; booking and purchase contents at 320px. Band/pizza counts, deferred collection, wrapping and absence of horizontal page overflow were verified. The purchase package name was changed to wrap instead of truncate. Fixtures live outside the repository under `%TEMP%/jumpyard-gh367-preview/`. They are static rendering checks, not proof of a hydrated payment or physical handset flow.

## Changed files and completion boundary

Publication integration on 2026-09-04 preserves source commit `4fd5735` and merges it on current main `dc62869` in `codex/gh-367-publish-combo-contents`. Main's #361 completed-booking recovery and D0206 remain intact; the combo decision is D0207. The existing completed-booking component test loader now resolves the real package helper. All 137 payment-recovery tests and the 20 package tests pass on the combined tree; independent review found no remaining code blocker.

- `infra/lambda/{booking,lookup,session}/index.js` and their `package-contents.js` assets; canonical helper/test under `infra/lambda/shared/`. Lambda assets are separate directories, so the focused test checks byte-identical helper copies.
- Phone: `BookingSummary.tsx`, `BuyTickets.tsx`, `ConfirmationScreen.tsx`, new `PackageContentRows.tsx`, `flow/cloudClient.ts`, `flow/types.ts`, and new `flow/packageContents.ts`/test.
- Admin: `src/app/page.tsx`, `src/lib/adminApi.ts`, new `src/lib/packageContents.test.mjs`, and the existing phone pizza icon copied to admin public assets.
- Validation wiring in `package.json`, exact helper allowances in ten existing `scripts/validate-*.js` harnesses, and the focused command in `TEST_PLAN.md`.
- Durable implementation docs: this note, `PROJECT_CONTEXT.md`, `DECISIONS.md` (D0207) and `JUMPYARD_CLOUD_CONTRACT.md`. The dependent rollout evidence also updates `AWS_RESOURCES.md` and `REPO_CURRENT_STATE.md` with verified merged/deployed facts.

The 2026-09-03 implementation and local checks performed no commit, deployment or live business write. On 2026-09-04 Love approved commit, reviewed PR, immutable release and protected Park/public promotion under #367 so he can test on his phone. Physical handset acceptance remains separate from synthetic local checks; rollout evidence follows the protected jobs.

No new follow-up Project draft was needed; rollout findings were added to the existing verification-diagnostics draft described below. Physical handset acceptance remains for Love. Product-content mapping must be revisited if JumpYard changes the offer; price and public availability remain Roller-owned.

## Publication evidence — 2026-09-04

Love's "kör så jag kan testa på telefon" instruction approved the bounded publication in #367. Reviewed [PR #371](https://github.com/wrlds-creations/jumpyard-check-in/pull/371) merged as `4d3e68d58ed69d48f7164a95e3977cc4af44857d` after all four required checks passed in [CI 33847336818](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33847336818). Independent agent review covered the integrated source and the existing recovery-test loader repair; it was recorded transparently as agent review, not human approval. No branch-protection bypass was used.

Main [CI 33847988147](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33847988147) and immutable [release 33847988150](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33847988150) passed. Selected artifact `9927575535` is `park-test-release-4d3e68d58ed69d48f7164a95e3977cc4af44857d`, digest `sha256:bc0e5101cd367b24300aa6b42db580c12ee172abb5b3a81d7b2f14d5a668fd7d`, retained until `2026-12-03T07:16:37Z`. Dependency installation was unusually slow but successful; it did not require a workflow or dependency change.

The actual read-only plan in [Park run 33848969487](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33848969487) retained 202 resources, with no additions/removals or template-section changes. Only `BookingHandler5D1461BB`, `LookupHandler5950B7B5` and `SessionHandler3CE835D7` changed. Current template hash was `70b058da41cfb971574065376c3b7f562a2653907dea7a4ef1e6b81530b9b28c`; selected release hash is `1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`. The protected `park-test` approval was exercised through the normal permitted reviewer path after this exact plan was visible, under Love's #367 instruction. Migration apply was false. Target: account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, Nacka `50871`, existing dates through `2026-09-30`; WRLDS tags and all existing runtime gates remain unchanged.

Independent selected-artifact comparison confirmed only those three Lambda `Code.S3Key` properties and corresponding asset-path metadata changed. Local bulk artifact download was slow, so a bounded authenticated ZIP-range extraction obtained the manifest, checksum index, template and relevant frontend files instead. All 34 extracted payloads matched the selected checksum index; manifest hash `c2f19adc09df9bd68d139b852200cfc4edcac26c3c263b1a36a8196af0f6f64b` matched the protected workflow's validation output, and normalized template hash matched the actual plan. The full archive digest was verified by GitHub's download action, not independently recomputed locally.

At `07:34:36Z`, one normal read-only availability query for six Nacka slots on `2026-09-04` returned the exact combo identity with two 60-minute check-in bands and one later pizza in every slot; 66 other product rows retained no package contents. The response reported `source.wroteBooking: false`. At `07:41:58Z`, 32 independent Park HTTP readbacks (15 phone, 17 admin) byte-matched selected artifact files: app/admin-auth HTML, all referenced JS/CSS, both pizza icons and the phone Apple association. No booking, payment, refund, redemption, provider catalog write, guest message or session mutation was performed; the availability query generated ordinary operational audit/metrics only.

Park `33848969487` nevertheless failed its combined final verifier at `07:42:14Z`, before public HTTP and final migration checks. Its Lambda/Pages deployments had succeeded (`UPDATE_COMPLETE`, phone `80e328c1`, admin `498c307e`). Read-only AWS diagnostics after routine SSO refresh confirmed `IN_SYNC`, no visible/in-flight messages in all four queues, and the sole active `roller-api-errors` alarm. Aggregate Logs Insights query `35530d2d-85d9-4f8a-8f4d-2082feba18fe` isolated one Lookup `get_booking_detail` GET 404 at `07:37:20.730Z`; no customer identifier or raw message was exposed. Existing lookup code counts this ordinary `booking_not_found` response as a provider error before returning it. The silent verifier does not identify its first failing assertion, but this active alarm was a verified blocker. The 300-second, 1-of-1 alarm uses `notBreaching` for missing data; it was allowed to return to normal without suppression or fabricated metric samples. The retry plan in [33850212562](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33850212562) shows identical current/release templates, 202 resources and zero changes. Public [plan 33849552330](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33849552330) validated the same full artifact digest and both exact production origins; its protected deployment waited for successful Park verification.

The existing Project draft **Diagnose silent Park post-deploy verification failure** (`PVTI_lADOBXiXg84BdXuJzg3SW24`) was updated with this evidence and the normal-404 alarm observation. No duplicate draft was created, and no workflow/alarm/queue/gate change is authorized by that draft.

The alarm naturally returned `OK` at `07:53:41.795Z`. Fresh readback found zero active alarms among all 30 Park alarms, and aggregate query `fa8bd0d0-4162-4fde-a7e6-d42753b164cc` confirmed no newer provider error. After an additional zero-alarm read, the unchanged retry plan was approved through the same normal protected reviewer path. Independent `node scripts/verify-public-park-test.js` also passed phone/admin/admin-route HTTP 200, API target and Apple association checks. No protection was bypassed or relaxed.

Protected Park retry `33850212562` completed successfully. CDK reported `no changes`; migrations were complete through `0020` before and after with apply disabled. Exact deployed-template equality, successful stack status, `IN_SYNC`, zero active alarms, empty queues, exact-SHA Pages metadata and HTTP/API-target/Apple association checks all passed. Park phone deployment is `06258d1a`, admin `d46dea9e`. Only then was the waiting public plan `33849552330` approved for the same immutable phone/admin outputs and exact public origins.

Public run `33849552330` completed successfully at `08:14:16Z`: phone deployment `6ee4cd70`, admin `18089925`. Both exact-SHA Cloudflare production outputs, Git-disconnected projects, public domains, CORS, Cognito callbacks and Apple association checks passed. The existing public origins now serve the selected version; no AWS mutation occurred in this workflow. No rollback was needed or performed. Love received both public links with instructions to reload the whole browser page; a real handset purchase/check-in/QR/Handoff test remains the acceptance step, not an automated-test claim.

At `08:15:31Z`, a final independent readback byte-matched all 32 public responses against the selected artifact (15 phone, 17 staff), including HTML, all referenced JS/CSS, both pizza icons and the Apple association. Public root hashes also matched the verified Park roots. Reports and selected-file evidence are under `%TEMP%/jumpyard-gh367-range-release/`; workflow plans, logs and the hashes above provide the durable release provenance. Rollout-document checks `validate:history-archives`, `validate:aws`, `validate:current-ticket` and `git diff --check` passed; the evidence PR's required CI validates its exact head.

The retained rollback candidate is the actually deployed previous release [33774429052](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33774429052), SHA `7d5ca45e003bb2ec9030572059be439bfbeba0e2`, artifact `9901144866`, digest `sha256:f1822e3200f03819c0afb986496736fcafb120c517fe419df51be2cdb57f2b48`. It passed Park `33775277602` and public `33775819505`; an independent preflight byte-matched all four deployed roots to that bundle. The artifact was unexpired through `2026-12-02T15:44:36Z`. A rollback would select that exact release through both protected workflows; no rebuild or rollback rehearsal is authorized or needed for this rollout.
