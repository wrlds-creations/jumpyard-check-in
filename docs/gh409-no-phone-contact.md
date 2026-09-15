# Visitor contact policy — issue #409

## Scope and review state

- [Cloud/phone #409](https://github.com/wrlds-creations/jumpyard-check-in/issues/409); dependent [kiosk #100](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/100).
- Branch `codex/gh-409-remove-phone-contact`, based on `65efb3811a5ee226aa38e72b4449e72f985da09c`. Isolated worktree preserves unrelated #396 changes.
- Love approved implementation and explicitly required preserving existing real ROLLER guest phone numbers on 2026-09-15.
- Initial local validation preceded publication authorization. Love subsequently requested commit, push, reviewed merge and deployment after the limitation below was disclosed. No live transaction or provider message is authorized. Release IDs are recorded after observed deployment.
- **Functional limitation retained in the authorized release:** new/unindexed guests currently stop before draft creation. The external contract below remains unresolved, so the issue is not complete.

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

An empty recent-booking search cannot establish that a new/unindexed email has no older guest profile. Sending the placeholder anyway could overwrite a real number, contrary to Love's explicit decision. A live read followed by a write is also not atomic against a concurrent profile edit. These limitations require a supported ROLLER contract and controlled verification before enabling general new/unindexed-guest checkout.

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
- Focused tests and package validation commands; `PROJECT_CONTEXT.md`, `DECISIONS.md` (D0222), `JUMPYARD_CLOUD_CONTRACT.md`, `TEST_PLAN.md` and this evidence. Mainline snapshot is unchanged.
- Kiosk's pre-existing infra lockfile problem already has Project draft `PVTI_lADOBXiXg84BdXuJzg7CgDI` ("Reconcile kiosk infra dependency lockfile for clean installs"). No duplicate or other follow-up draft was created for this issue.

## Next step

Obtain the supported contact-preservation contract, replace/complete the conservative resolver and verify new, returning, duplicate-email and concurrent-update cases. The authorized guarded release can be reviewed and promoted separately; this provider work remains necessary before general new/unindexed-guest checkout can be enabled.

## Integration and release authorization

Love requested "bra pusha mergea deploy" after the limitation was reported. Issue-owned publication is authorized; the missing provider contract and physical verification remain open. No provider communication or real purchase is included. Shared Cloud is promoted before phone/kiosk frontends.

Integration branch `codex/gh-409-integrate-no-phone` starts from `950843916c7ecfa24a13cf7b41f648dde112f8be` and preserves source commit `364f8b6`. It retains #327 installation binding and #407 code Apply behavior, removing only phone requirements. Decision D0222 avoids a collision with the intervening terminal decision.

Integrated verification: 38 code-application tests, 137 payment-recovery tests, the 13+4 contact tests, phone lint/typecheck and documentation validators pass. Current CI will validate the exact PR head; no independent human review is claimed.

Before merge, current main advanced to `fe77d42` with WRLDS 0.2. The integration retains its native skills, validators and compact context without changing runtime behavior.

CI integration correction: run 34982978611 exposed the older #327 terminal fixture treating every SQL read as a reservation. The new contact guard correctly rejected its missing guest evidence. The terminal fixture now supplies a verified contact prerequisite, while GH409 retains actual resolver tests; two new handler checks prove unverified contact performs neither terminal reservation nor provider writes. Native PostgreSQL reservation checks are unchanged.

## Protected rollout — 2026-09-15

### Source, artifact and approval

- [PR #422](https://github.com/wrlds-creations/jumpyard-check-in/pull/422) merged as `84b28a588aaad91365cc2273c357c8b6be4d0dfb`. Every required check in [CI 34983412043](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34983412043) passed, including native PostgreSQL terminal-reservation tests. The implementing agent reviewed the combined change; no independent human review is claimed.
- Successful immutable [release 34984038346](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34984038346), artifact `10402867670`, verified all 664 files. Manifest SHA256: `01970e44bb99ee88c4c0b5e18e4c7f41906465d6715926264304de2b95f46ccd`.
- The actual plan from [Park 34984709902](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34984709902) matched an independent live-template comparison before delegated protected approval under Love's explicit instruction. Only `Properties.Code` and `Metadata.aws:asset:path` change on Booking, Lookup, Session, DataSync and both Webhook functions. Resources remain 208; no route, schema, IAM, configuration or gate changes. Migration apply is false.
- Existing account `376129878018`, region `eu-north-1`, Nacka/date scope and all ten WRLDS metadata values were reverified. Selected template SHA256: `f1981878b54225e49cf944bfe128b792d71ec857cce2ff50c6b6b64ae9a2fbd9`.

### Initial deployment and verification stop

Park run `34984709902` installed the selected AWS and Park Pages artifacts, then stopped at its zero-active-alarms check. AWS was `UPDATE_COMPLETE` and `IN_SYNC`; an independent readback matched all 17 files across the six changed Lambda functions. The sole ROLLER error alarm was caused by a `lookup/get_booking_detail` GET returning 404 at **14:56:49 UTC**. Its displayed 14:52 datapoint is the start of a five-minute metric window, not the individual request time. An allowlisted metadata-only log inspection from 14:45 through the investigation found this single provider error; no guest identifiers or provider response bodies were retained. No alarm state, threshold or deployment gate was changed.

Independent public reads matched 26 Park HTML/JavaScript/CSS responses to the selected artifact. Four synthetic lookup requests covering inferred phone, formatted/international phone, misleading identifier types and explicitly declared phone returned 400 `phone_lookup_disabled`. Those requests reject before AWS/provider/access work. The existing `verify-public-park-test.js` also passed. Python HTTP readback received 403 and curl-based bulk reads timed out locally; the repository's Node fetch transport and byte-for-byte verification completed successfully. These local transport failures were separate from the workflow's alarm stop.

### Compatible combined release

Approved quote-reuse PR #423 / issue #421 merged on top of this change as `02155e55230cd989b337cc0af8250bb2d6cbcb05`. Its [release 34984915362](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34984915362), artifact `10402513777`, independently passed all 664 checksums; manifest `e660c8f9f0fa58a07ae5c5b5709c4e5c8673ecfbce0899fbf91fa1d15b4156c3`. Both releases have identical CloudFormation templates and backend assets. The newer [Park plan 34985824066](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34985824066) shows no AWS changes. Overlapping older-source re-promotion `34985919160` and public plan `34985923581` were cancelled before approval or writes so the compatible newer frontend is preserved. The paired kiosk PR #113 similarly retains #100 and adds quote reuse.

After the alarm returned naturally to OK, the implementing agent independently compared the newer actual plan and artifact, then exercised delegated protected approval. **Park run `34985824066` succeeded**: CDK reported no changes, selected/deployed template equality and `IN_SYNC` drift passed, there were no active alarms, queues were empty, all 23 migrations were applied with apply disabled, and exact-SHA Pages/HTTP/Apple checks passed. A second independent byte comparison matched 26 static responses to the combined artifact. Park phone/admin deployment previews: `889be38e` / `ffc4d33d`. No backend or frontend was rebuilt during promotion.

### Successful public and kiosk publication

After Park success and independent readback, the implementing agent reviewed the actual [public plan 34987254267](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34987254267) and exercised delegated protected approval for the same `34984915362` / `02155e5` artifact. **Public run `34987254267` succeeded**. Existing phone/admin projects and `checkin.jumpyard.se` / `staff-checkin.jumpyard.se`, live CORS/Cognito prerequisites, exact release SHA and Apple association checks passed. Phone/admin previews: `a10e8c63` / `df68e582`. Another 26 independently fetched HTML/JavaScript/CSS responses matched the combined artifact exactly. No AWS mutation occurs in that frontend workflow.

The paired quote-reuse publication installed kiosk source `4ac26eb8c50bf2ce75714a47ffcb0e51bf636b97` (includes #100) as deployment `eacfdd1d-03a2-48ad-b45d-9902df71f869` on `jumpyard-check-in-kiosk.pages.dev`. Independent Cloudflare readback confirmed production/main/source identity; 13 hosted static responses match the existing #111 built output byte for byte, and the compiled Park API guard passed across 79 text files. Our older `3b0d6c9` output was not uploaded. No duplicate kiosk deployment was needed. Prior kiosk deployment `c8239a54-1409-4efc-99f5-8f8b31c7e83d` / `93b0e9b` remains the recovery candidate.

The combined result is published and verified on the existing targets. No rollback occurred; the overlapping older-source re-promotion was cancelled before writes. Issue #409 remains open for the provider contract and physical acceptance, not for publication. `AWS_RESOURCES.md` and `REPO_CURRENT_STATE.md` record observed deployed facts; the source context/contract/decision/test-plan changes were already merged in PR #422.

### Recovery candidate and remaining acceptance

Previous successful release `34977478153` / `4bd7501c62997180d6177006c9827443b5495d32`, artifact `10400526044`, was independently downloaded and verified (664 files; manifest `592a80ad968ef0a11ace27895870a1d0afb1acbd4f526437d9a7eba9c0552bde`). Its template matched the pre-deploy live template exactly. Prior successful Park/public runs were `34978297036` / `34978711381`. Retain this artifact for the protected rollback path; no rollback has been performed.

The release keeps the pre-payment rejection for new/unindexed, ambiguous or unverifiable contacts. It does not establish a complete email directory or atomic protection against concurrent ROLLER profile changes. Provider-backed successful purchases, payment/reload, physical handset/kiosk, scanner, terminal and next-guest reset acceptance remain open. No provider communication, booking/payment/redemption, guest message, bulk data change, new resource or Android/APK publication occurred. Issues #409 and kiosk #100 remain open/Blocked for the provider contract and physical acceptance.
