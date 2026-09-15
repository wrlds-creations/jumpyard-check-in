# Visitor contact policy — issue #409

## Scope and review state

- [Cloud/phone #409](https://github.com/wrlds-creations/jumpyard-check-in/issues/409); dependent [kiosk #100](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/100).
- Branch `codex/gh-409-remove-phone-contact`, based on `65efb3811a5ee226aa38e72b4449e72f985da09c`. Isolated worktree preserves unrelated #396 changes.
- Love approved implementation and explicitly required preserving existing real ROLLER guest phone numbers on 2026-09-15.
- Local implementation for review only. No commit, PR, live transaction, message, deployment or AWS resource change. No release/deploy/rollback run IDs.
- **Not ready for general rollout:** new/unindexed guests currently stop before draft creation. The external contract below remains unresolved, so the issue is not complete.

## Behavior

Phone and kiosk collect first name, last name and email. Fresh clients omit phone; saved drafts retain their existing identity and optional legacy contact values. Existing-booking add-ons continue using the original booking's contact context, followed by the same server contact-preservation guard.

Cloud looks up candidate guest IDs using the existing email cache index and ROLLER booking search, then confirms exact email through live guest detail. One verified guest's current phone is carried into the provider payload. A verified guest with no real number receives `0700000000`; the payload builder disables SMS marketing for this placeholder. Cached/submitted phone values are not evidence of the current provider profile.

Missing, ambiguous, failed or excessive candidate lookup returns `customer_phone_preservation_unverified` (409). Both draft handlers mark the idempotency reservation failed and stop before any provider draft, kiosk quote or payment initiation. The lookup adds paced provider reads (one search plus up to eight guest-detail reads); provider latency/concurrency still needs controlled verification.

Public phone searches, including forged identifier types and formatted variants, return `phone_lookup_disabled` (400) before AWS/provider/access work. Frontends explain that booking reference, email and QR are available. Numeric booking references and supported booking/QR identifiers retain their existing interpretation. Keyword search is email-only.

Webhook, scheduled ingestion and the related-data importer normalize dummy variants to missing contact. Session SMS destination validation also rejects old stored dummy values. Existing genuine contacts remain eligible under existing sending gates. No bulk purge is performed; legacy stored readiness bits may remain until normal reconciliation, but cannot bypass the destination guard.

## Authoritative provider evidence and remaining contract

Read on 2026-09-15:

1. [Create a Booking](https://docs.roller.app/docs/api/rest/operations/create-a-booking): customer matching uses email and differing supplied fields update the existing guest.
2. [Create Draft Booking](https://docs.roller.app/docs/api/rest/operations/create-draft-booking): phone is required in the documented customer shape.
3. [Search for Bookings](https://docs.roller.app/docs/api/rest/operations/search-for-bookings): fuzzy keywords return at most the 100 most recent non-cancelled bookings. This is not a complete guest directory.
4. [Get Guest Detail](https://docs.roller.app/docs/api/rest/operations/get-guest-detail): guest ID detail can confirm a known candidate; it does not document an exact-email existence lookup.

An empty recent-booking search cannot establish that a new/unindexed email has no older guest profile. Sending the placeholder anyway could overwrite a real number, contrary to Love's explicit decision. A live read followed by a write is also not atomic against a concurrent profile edit. These limitations require a supported ROLLER contract and controlled verification before rollout.

### Prepared question for ROLLER/Pabel — not sent

> We are removing visitor phone entry from JumpYard's phone and kiosk purchase forms. We must preserve any real phone already stored for the matching email. The documented draft customer requires phone, while booking creation matches email and updates supplied fields. What supported request or API guarantees that an existing guest's phone remains unchanged, including concurrent profile updates, while allowing a new guest to be booked without a phone? If complete exact-email guest lookup is the intended method, please confirm the endpoint, pagination, venue scope, duplicate-email behavior and how absence is proven. Please also confirm whether phone can be omitted/null on Create Draft Booking and what effect this has on an existing guest. The recent-booking search is capped at 100 and cannot establish absence. We would like to verify the supported behavior in Playground before a reviewed rollout.

## Validation

All checks were local and synthetic on 2026-09-15:

| Check | Result |
|---|---|
| `npm run validate:gh409-phone-policy` | 13 backend policy/handler tests plus four frontend tests pass. Real public lookup handler rejects phone before all AWS/network work. Both actual draft-handler functions fail before provider writes. |
| `npm --prefix jumpyard-checkin-phone run test:payment-recovery` | 137 existing recovery tests pass. Missing-phone and legacy-phone recovery also covered by the focused tests. |
| `npm run validate` | Pass, including the existing frontend/backend/infra/workflow suites. Native PostgreSQL checks that require explicit local database setup were not enabled. |
| `npm run infra:check` | Pass: local typecheck/synthesis, no resource changes. |
| Phone `npm run lint`, `npx tsc --noEmit` | Pass; lint retains four existing image warnings. |
| Phone production build with explicit Park API URL | Pass; static export and production mock boundary pass. No upload. |
| `git diff --check` | Pass. |

Browser checks used the local static export at `127.0.0.1:3409`, 390×844. All external Fetch/XHR requests were intercepted and fulfilled locally with synthetic availability, quote and a contact-preservation rejection. The contact form has no phone field; name/email enable continuation; captured quote/draft payloads omit phone; rejection shows staff help without initiating payment. Public phone lookup in Swedish/English displays the supported alternatives and emits zero API requests. Initial test-harness CORS configuration was corrected before asserting the draft result.

Physical handset/kiosk, scanner, terminal, provider-backed new/returning guest, concurrent-profile and successful payment/reload proof remain outstanding. No live evidence is claimed. Kiosk-specific checks are recorded in its issue evidence.

## Files and durable records

- `jumpyard-checkin-phone/src/components/{BuyTickets,BookingLookup,AddonsOffer}.tsx`, `src/context/LanguageContext.tsx`, `src/flow/cloudClient.ts`: form, search, optional contact and error copy.
- `infra/lambda/{booking,lookup,session,webhook,data-sync}/index.js`, `infra/scripts/import-related-data.ts`: provider preservation, lookup and placeholder guards.
- Focused tests and package validation commands; `PROJECT_CONTEXT.md`, `DECISIONS.md` (D0220), `JUMPYARD_CLOUD_CONTRACT.md`, `TEST_PLAN.md` and this evidence. Mainline snapshot is unchanged.
- Kiosk's pre-existing infra lockfile problem already has Project draft `PVTI_lADOBXiXg84BdXuJzg7CgDI` ("Reconcile kiosk infra dependency lockfile for clean installs"). No duplicate or other follow-up draft was created for this issue.

## Next step

Obtain the supported contact-preservation contract, replace/complete the conservative resolver and verify new, returning, duplicate-email and concurrent-update cases. Then request commit/PR work, review both repos and promote shared Cloud safeguards before either frontend using the protected immutable-artifact process.
