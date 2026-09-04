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

## Validation

- `node --test infra/lambda/shared/package-contents.test.js`: 8 passed. Exact identity/quantity, isolated Lambda copies, cached/live response-only mapping, guest/staff/linked/provisional projection, per-unit availability and unchanged ticket authority.
- `node --test jumpyard-checkin-phone/src/flow/packageContents.test.mjs`: 7 passed. One/two packages, mixed admission/coffee/socks, session-link resume, unknown/legacy fallback, actual Swedish/English QR and booking/purchase rows, and purchase-request separation.
- `node --test jumpyard-checkin-admin/src/lib/packageContents.test.mjs`: 5 passed. One/two packages, mixed/linked items, unknown/family fallback and actual Handoff section rendering.
- `npx tsc --noEmit` in phone, both app lint commands, and both production builds passed. Phone lint retains four existing `no-img-element` warnings; builds retain the existing baseline-browser-mapping age notice. No dependency upgrade was made.
- Existing #253/#289/#300 handoff/linked-item checks and the six public catalog tests passed. Ten restrictive VM validators needed only exact local helper allowlist entries; all ten passed.
- `npm run validate` and `npm run infra:check`: passed, including final local CDK synth. No AWS operation or deploy was performed.
- `git diff --check`: passed.

Browser inspection used actual component markup and production CSS with synthetic data, not live customer data: Handoff at 390px (one package) and 320px (two packages); phone QR in Swedish at 390px and English at 320px; booking and purchase contents at 320px. Band/pizza counts, deferred collection, wrapping and absence of horizontal page overflow were verified. The purchase package name was changed to wrap instead of truncate. Fixtures live outside the repository under `%TEMP%/jumpyard-gh367-preview/`. They are static rendering checks, not proof of a hydrated payment or physical handset flow.

## Changed files and completion boundary

- `infra/lambda/{booking,lookup,session}/index.js` and their `package-contents.js` assets; canonical helper/test under `infra/lambda/shared/`. Lambda assets are separate directories, so the focused test checks byte-identical helper copies.
- Phone: `BookingSummary.tsx`, `BuyTickets.tsx`, `ConfirmationScreen.tsx`, new `PackageContentRows.tsx`, `flow/cloudClient.ts`, `flow/types.ts`, and new `flow/packageContents.ts`/test.
- Admin: `src/app/page.tsx`, `src/lib/adminApi.ts`, new `src/lib/packageContents.test.mjs`, and the existing phone pizza icon copied to admin public assets.
- Validation wiring in `package.json`, exact helper allowances in ten existing `scripts/validate-*.js` harnesses, and the focused command in `TEST_PLAN.md`.
- Durable docs: this note, `PROJECT_CONTEXT.md`, `DECISIONS.md` (D0207) and `JUMPYARD_CLOUD_CONTRACT.md`. `REPO_CURRENT_STATE.md` is unchanged because this is unmerged work.

The 2026-09-03 implementation and local checks performed no commit, deployment or live business write. On 2026-09-04 Love approved commit, reviewed PR, immutable release and protected Park/public promotion under #367 so he can test on his phone. Physical handset acceptance remains separate from synthetic local checks; rollout evidence follows the protected jobs.

No follow-up Project drafts were needed. Next step: reviewed PR and the approved protected immutable-artifact promotion path, followed by a real handset check. Product-content mapping must be revisited if JumpYard changes the offer; price and public availability remain Roller-owned.
