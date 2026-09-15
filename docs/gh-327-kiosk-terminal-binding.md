# Kiosk installation and terminal binding

Scope: [Cloud #327](https://github.com/wrlds-creations/jumpyard-check-in/issues/327), paired with [kiosk #86](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/86).

## Contract

One APK and one hosted application serve both Nacka profiles. Draft requests use `channel=kiosk`, `kioskInstallationId`, `kioskCapability`, and `kioskProfileId`. The two supported profiles are `nacka-forum-kiosk-1` and `nacka-forum-kiosk-2`. The backend derives the installation fingerprint from the capability and checks its active allowlist, selected profile, and configured Nacka venue before provider writes. Existing-booking purchases also check the authoritative original booking venue. Phone requests cannot supply kiosk identity fields.

The existing private provider configuration holds `kioskInstallations` (active, venue, allowed profiles), `kioskProfiles` (active, venue, terminal alias), and `paymentTerminals`. Each bound terminal has a random stable `lockId` as well as the private provider terminal value. Aliases for the same physical terminal must share the same lock id. Never regenerate that id to bypass a pending payment. The installation id supplies ROLLER's application `deviceId`; only the backend supplies `terminalId`. The lock id is excluded from ROLLER payloads and public responses. No real identifiers, capability values, or hashes belong in this document or GitHub.

## Persistent concurrency guard

The existing `idempotency_records` table reserves the installation and the terminal in sorted order with one `INSERT ... ON CONFLICT` statement. A request must claim every required key before creating a provider draft. A losing request releases only its own unused partial claim. A random payment-attempt id is allocated before the provider write and retained by the resulting prepayment draft.

The keys contain an opaque installation id and a random terminal lock id, never a provider identifier or capability. Active reservations have no clock-based expiration. A crash, lost provider response, missing prepayment row, `created`, `unknown`, or approved-but-unconfirmed payment therefore remains blocked. A later request can replace the claim only after the stored attempt is definitively failed/cancelled/reconciled or its booking is published. This also permits safe profile changes following a resolved attempt. No schema, route, IAM permission, or resource is added.

These bounded operational locks are not an audit archive. Partial claims expire immediately; active claims retain only their opaque owner until resolved/replaced. A decommissioned or orphaned claim needs supervised recovery: inspect the originating attempt and provider evidence, establish that no unresolved charge or payment prompt exists, then release only the reviewed claim using an approved operator path. There is deliberately no time-based or guest-controlled unlock. Retention deletion of the associated draft must never be treated as proof of a safe retry.

## Coordinated rollout and recovery

1. Review both implementations on current mainline, including kiosk commissioning and payment recovery tests. Merge through separate reviewed PRs. Implementation merge alone is not physical certification or issue closure.
2. Privately verify the supplied ROLLER terminal reference against the required API field. Support case `00244700`, supplied by Love on 2026-09-15, identifies the Nacka Forum POS assignment and reports the device offline, last seen September 9. This is provider identification evidence, not a successful API/payment test.
3. Review the exact private configuration: preserve unrelated fields and the existing P400 mapping; provision active installations and allowed profiles, and stable terminal lock ids. The narrow existing-secret change is authorized by #327; a protected deployment remains a separate checkpoint. Cached provider configuration may take up to five minutes to refresh after reassignment/revocation; wait for that boundary and verify rejection before treating revocation as effective.
4. Promote a selected immutable backend release through the protected Park workflow. Install/publish the paired kiosk version in a supervised idle window. Temporary `allowLegacyKioskTerminalAlias` compatibility accepts only `primary`; it cannot route a legacy caller to V210. Once a terminal has a lock id, both legacy and provisioned callers reserve the same terminal. Disable compatibility after the P400 installation is commissioned and all older clients are retired. Drain existing legacy attempts before changing routing or rollback.
5. Verify unknown/revoked/wrong-profile requests fail before provider writes. Verify terminal assignment and online state without starting a draft or payment. Keep an immutable rollback release and restore matching client/config compatibility only after resolving active attempts; rollback never clears locks or retries an uncertain payment.
6. Love supervises and approves the exact cart, amount, card, and attended V210 for at most one minimal payment. Record the definitive outcome and authoritative booking, or diagnose the unresolved result without a second attempt. Kiosk #86's physical P400 check remains required; a new P400 charge requires separate approval.

## Validation

- `npm run validate:gh327-kiosk-terminal-binding`: handler, normalization, authorization, legacy compatibility, quote separation, unchanged phone behavior and reservation ordering.
- `GH327_DATABASE_TEST=true GH327_PGPORT=55327 npm run validate:gh327-kiosk-terminal-binding`: disposable loopback PostgreSQL, all existing migrations, real `jumpyard_booking_runtime` permissions, twelve competing connections, cross-terminal/profile/replacement guards and definitive release. CI uses its existing isolated PostgreSQL service on port 55435. Fixtures are synthetic and removed after the test.
- Existing kiosk terminal, reconciliation, add-product and exact-payment-state regressions; full repository and infrastructure checks before handoff.

Local PostgreSQL 17.11 passed all 14 focused tests on 2026-09-15, including all twelve concurrent requests. The atomic conflict behavior is defined by [PostgreSQL INSERT](https://www.postgresql.org/docs/17/sql-insert.html). `npm run infra:check` and the full validation chain passed. The full chain used an in-memory LF normalization for the two bounded context documents, matching Linux CI; the default Windows CRLF checkout exceeds their raw-character limits. This existing validator issue has a Project draft, and no unrelated history or mainline snapshot was rewritten. `git diff --check` passed. No live provider request, secret update, deployment or physical payment was part of this local evidence.

## Protected backend rollout — 2026-09-15

Love's explicit green light authorized the coordinated release. Reviewed [backend PR #411](https://github.com/wrlds-creations/jumpyard-check-in/pull/411) and [kiosk PR #101](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/pull/101) are merged. Backend CI [34966043543](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34966043543) passed all six jobs, including real PostgreSQL concurrency. The paired source remains one APK and one web application. Both Issues remain open for commissioning and physical proof.

| Evidence | Selected value / result |
| --- | --- |
| Backend source | `ce7c795c1fd460936b552323805790d8bf657827` |
| Immutable release | [34966352071](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34966352071), artifact `10394873499` |
| Local artifact validation | 664 files; manifest SHA256 `01bf0b9dfc9380f8c87538ec5b32b79a07303f669b793adb012043a28bbaf809` |
| Protected plan/deployment | [34967225013](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34967225013), successful |
| Exact plan | 208 resources before/after; only Booking Lambda `Code` changes; no resource additions/removals or other template changes |
| Deployed template | `ae412badf5c7d0d6fde1ba93e30c2440a85ef4b0dec9b39f7b0181e36a8981e6` |
| Runtime readback | Active/successful Lambda; all six deployed code files exactly match the immutable artifact |
| Operational checks | Template equality, `IN_SYNC` drift, zero active alarms, empty queues, exact-SHA Park Pages, public Park probes; migrations through `0023`, no migration apply |
| Rollback artifact retained | Release [34963769097](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34963769097), source `65efb3811a5ee226aa38e72b4449e72f985da09c`; all 664 files independently verified |

The actual GitHub plan was reviewed and independently compared with the running AWS template before normal delegated protected-environment approval. The existing account `376129878018`, region `eu-north-1`, stack and ten WRLDS metadata values match the Issue. IAM, schema, routes, venue/date window, messaging gates and resource counts are unchanged. The deployed booking runtime's existing DB permissions also passed a non-executing `EXPLAIN` of the exact reservation statement; it wrote no rows. No local CDK deployment, rebuild, rollback, re-promotion or public phone/admin promotion occurred. Public frontends remain on #343's approved source.

Four safe live probes returned the expected rejection: malformed and unknown new-booking identities returned `409 kiosk_installation_not_authorized`; incomplete add-on identity returned `400 kiosk_installation_identity_incomplete`; the phone channel rejected kiosk identity with `400 kiosk_installation_identity_not_allowed`. They used synthetic data and stopped before provider calls; the new-booking probes produced only failed local idempotency records. An aggregate query under the actual restricted booking DB identity reported zero card-present attempts in the previous 24 hours after the probes. No ROLLER draft, payment, booking, refund, redemption or guest message was created.

## Commissioning status at backend publication

The existing provider secret was read privately and remains unchanged. Its P400 `primary` mapping is preserved; no installation/profile records or terminal lock ids have been applied yet. The provider support case identifies V210 but does not prove it is currently online. Secret registration must follow native identity creation, exact private plan review and version-guarded apply/readback.

The kiosk source is `aca0f33c59f18d75611607d2a1dc728ed2b1c974`. Its tested site and `0.1.6-debug` APK are frozen with a 143-file checksum manifest. Wireless ADB pairing succeeded and read-only checks found one physical Android 14 kiosk; duplicate ADB aliases refer to that same device. The installed APK was retained for rollback without copying app data. Installation and publication await the requested confirmation that the kiosk is idle and has no unresolved guest purchase. The existing installed APK uses the same version label but has different contents, so package version alone is not release proof.

After the idle-window confirmation: install the frozen APK preserving app data, create/register its private installation identity, publish the frozen site, and verify the authenticated Android profile selector, cancellation, persistence and relaunch. The installer enters the Android device credential personally. Then verify mapping/online status and negative authorization cases before requesting the exact attended V210 cart/amount/card approval. At most one V210 attempt is allowed; an ambiguous result requires diagnosis without retry. Physical P400 regression remains open and no new P400 charge is authorized.

Follow-up planning remains separate: the kiosk Project draft **Restore a reproducible kiosk reference infra dependency install** records its existing copied-infra lockfile issue; the Windows context-validator newline draft records the existing local-only size discrepancy. Neither changes this release's scope.

## V210 registration and kiosk publication — 2026-09-15

Love confirmed the physical kiosk was idle before installation. All 143 frozen kiosk files passed SHA256 validation and the production-target guard passed (79 text build files). The same-package `adb install -r` succeeded without clearing app data. Independent readback of the installed package exactly matched the frozen `0.1.6-debug` APK. The launcher created its private installation identity. The previous installed APK remains available for supervised rollback; no rollback occurred.

The initial private plan included P400 lock provisioning. A broader read-only check then found six unresolved historical card-present drafts dated August 15–31: four `unknown` and two `created`. None originated in the preceding 24 hours. They are unresolved stored records, not proof of six charges or an active terminal prompt. The applied plan was narrowed before any secret mutation: preserve `primary` exactly, provision only Kiosk 1/V210, and defer P400 lock migration and Kiosk 2 registration. No historical row, payment outcome, recovery identity or claim was altered. The separate unapproved Project investigation is **Reconcile six legacy card-present attempts before P400 commissioning**, item `PVTI_lADOBXiXg84BdXuJzg7DGv8` in [Project #5](https://github.com/orgs/wrlds-creations/projects/5). Existing kiosk #96 concerns future runtime classification and does not resolve these records.

The reviewed V210-only configuration was applied to the existing secret at 12:35 UTC using a staged version and a guarded `AWSCURRENT` promotion against the previously read version. Exact readback passed. It contains one active installation, one allowed profile and two terminal mappings. All unrelated fields, P400 values and the legacy setting remain unchanged. Local resolution with the actual private configuration verifies V210, the installation/terminal claim pair, denied Kiosk 2 and denied revoked configuration. Live disallowed-profile, wrong-venue and tampered-capability probes each returned `409 kiosk_installation_not_authorized`; no valid purchase request or provider operation was sent. Private values remained in process memory only.

The frozen kiosk export from `aca0f33c59f18d75611607d2a1dc728ed2b1c974` was published without rebuilding as Pages deployment `c4f8799f-ea38-401b-be04-cfe9e99aa388`. Production metadata and hosted HTML matched the artifact. The prior deployment `96589b8a-fccd-4ff5-b4fb-7fae7c71a395` was checked immediately before upload and retained for rollback. Chrome and the wrapper were restarted without clearing their data. No additional backend deployment was needed after Park run `34967225013`.

Love physically verified that holding and releasing the logo opens the technician entry and that it correctly rejects a missing Android device credential. Security settings were opened for Love to set a private screen lock; the app/agent does not choose, read or enter that credential. Authenticated profile save, persistence/relaunch, current terminal-online status and the exact attended V210 transaction remain pending. No financial attempt has started.

The concurrent safety-video task detected the changed production baseline before uploading its older pre-commissioning export. That older export was not published. Kiosk #102 instead published a newly frozen integrated main `743c1cd524c79f7a488033c73af0e93b5fe40672` as `4ef676cc-ef68-4108-9f75-ac9b718a49e5`, retaining #86 unchanged. Independent production metadata readback, all 143 artifact hashes, and exact hosted comparisons of 16 files (HTML, JS/CSS, Android asset links and both videos) passed. This is the web version to reload and verify on the physical kiosk before testing. The compatible web rollback is now `c4f8799f`, which already includes kiosk binding. No device restart, configuration or payment was performed by that task.

## Physical V210 payment evidence — 2026-09-15

Love set a private Android screen lock, authenticated in technician settings and saved Kiosk 1. Independent native readback and a supervised wrapper/Chrome restart verified the same capability and selected profile persisted without clearing data. The browser captured Kiosk 1, removed the private URL fragment and loaded scripts matching the integrated `743c1cd` artifact. No credential or installation value was printed or retained in evidence.

Love confirmed the attended V210 and available card, entered contact details privately on the kiosk, and explicitly approved one 60-minute entry irrespective of price. Immediately before the single agent-initiated click, the expanded checkout contained exactly `1 x 60 MIN ENTRÉ`, no add-ons, and SEK 200. A cart-state guard and an exclusive local start marker prevented another agent initiation. The server quote and card-present draft independently confirmed SEK 200. Love was asked to verify that amount on V210 before tapping.

The observed test contained **two attempts**, not the planned one-attempt sequence. The agent initiated only the first. After its definitive cancellation, Love reported having missed it and independently retried on the kiosk; the observers captured that second attempt. No further attempt was initiated or requested.

| Attempt | Observed provider/client result | Final restricted database readback |
| --- | --- | --- |
| First | One dispatch; UI timed out at 120,233 ms, followed by definitive `cancelled` at 135,705 ms. Love reported the cancellation. | `cancelled` / payment `cancelled` / confirmation `failed`; no approval, publication, booking reference, settled booking or attached session. |
| Second, started by Love | Fresh draft and dispatch for SEK 200; definitive `approved` after 21,559 ms. The kiosk displayed payment complete and returned provisional handoff. | `published` / payment `reconciled` / confirmation `confirmed`; SEK 200 total, zero amount owing, one settled booking and one attached session. |

Passive browser observation counted exactly two draft requests and two provider-payment dispatches, with one cancellation and one approval. The paid attempt briefly required staff while ROLLER confirmation lagged; read-only follow-up then verified automatic authoritative confirmation and completed reconciliation. Its stored bounded reconciliation count was 16 and last publish HTTP status 409; final authoritative state, rather than that intermediate publish response, establishes success. No operator repair, forced publish, new payment, refund or manual lock release was used. This evidence proves one approved attempt and one settled booking; it is not a separate bank-statement audit.

The kiosk subsequently returned to its Swedish home with Kiosk 1 retained, the private fragment absent and purchase recovery state cleared. The agent did not submit a safety attestation, redeem, print, send a guest message or cancel a real booking. End-to-end safety/handout was not independently observed during this payment proof. No deployment, secret mutation, rollback or re-promotion occurred during the physical test; the selected backend remains release `34966352071` / Park `34967225013` and the web remains `4ef676cc` / `743c1cd`.

V210 routing, payment and booking reconciliation now have physical evidence. Keep #327 and kiosk #86 open until the remaining P400 physical regression/commissioning boundary is resolved. The six older unresolved records and P400 lock migration remain unchanged under the existing Project investigation. Automated two-profile and phone/P400 regressions remain the implementation evidence; this test did not provision Kiosk 2 or execute a P400 payment.

## Authorized historical cache cleanup — 2026-09-15

Love subsequently requested disposal of the six obsolete local attempts and completion of P400 commissioning. The Project draft became approved [#417](https://github.com/wrlds-creations/jumpyard-check-in/issues/417). Its [guarded cleanup evidence](gh-417-legacy-attempt-cleanup.md) records exactly six deleted local rows, unchanged bookings/current attempts/terminal claims and zero provider business writes. Unknown historical financial outcomes remain unknown. This supersedes the earlier six-record investigation gate; it does not release any claim, prove a safe retry or change runtime guards. A fresh P400 test must independently verify idle hardware, no kiosk recovery, definitively resolved current claims, unchanged existing provider routing values and one stable P400 lock before its own exact-cart approval.

## P400 configuration and native reassignment — 2026-09-15

Love confirmed P400 was powered on and attended with a card, then explicitly verified its ordinary start screen without an amount or payment prompt. The current physical kiosk was idle with no new-booking/add-on recovery, and the database independently contained zero unresolved current card-present attempts and zero unresolved terminal claims. This is new-purchase commissioning; no historical attempt is retried.

At 14:21:56 UTC the existing secret received the reviewed, version-guarded P400 delta: add profile `nacka-forum-kiosk-2` pointing to existing `primary`; add one random stable P400 lock; change this evaluation installation's single allowed profile from Kiosk 1 to Kiosk 2. Exact readback and independent reconstruction of the prior configuration prove that P400 provider device/terminal values, V210 mapping/lock, the legacy setting and every unrelated field remain identical. Local resolution verifies two claims for this installation, the same terminal claim for legacy P400 callers, denial of Kiosk 1 for this installation and fail-closed revocation. No existing lock was regenerated or released. Both profile definitions exist; only Kiosk 2 is allowed for this one physical kiosk. A future second physical installation still needs its own enrollment.

Love authenticated with the private Android credential and saved Kiosk 2. Native readback confirmed the choice; the existing browser initially retained Kiosk 1. A supervised wrapper/Chrome restart, while still idle, preserved the native settings/capability and loaded Kiosk 2 with the private fragment removed and no purchase recovery. Browser scripts match the already-published kiosk #99 source `93b0e9b` / Pages `c8239a54-1409-4efc-99f5-8f8b31c7e83d`, which retains #86 and #102. The installed hash-verified `0.1.6-debug` APK is unchanged. No app data was cleared.

After 14:26:56 UTC, beyond the five-minute configuration cache boundary, live old-profile, wrong-venue and tampered-capability probes each returned `409 kiosk_installation_not_authorized` before provider writes. The focused binding suite passed all 13 local contract/handler tests; its PostgreSQL test is exercised by CI, including the green #417 run `34980177627`, rather than an additional local database run. Physical P400 purchase approval, displayed amount, definitive outcome, authoritative booking and final recovery/reset evidence remain pending. No provider business request or payment was started by configuration or restart. No deployment, rollback or re-promotion occurred; the current parallel #407 backend release/plan is recorded in the #417 evidence.

## Physical P400 purchase and authoritative confirmation — 2026-09-15

Love prepared the new-entry cart on Kiosk 2. At the agent's read-only review, the contact screen showed one `60 MIN ENTRÉ`, no add-ons and SEK 200, with the payment action enabled. The agent requested action-time confirmation but did **not** click the payment action. Love independently completed the purchase and reported "funkar!". No agent start marker was created and no second purchase was initiated. The final price differed from the earlier cart: authoritative ROLLER readback shows a SEK 100 discount and one **SEK 100 card payment**, with zero tip. Record the final provider result, not SEK 200, for this test. The actual card tap and amount on the physical terminal were not directly observed by the agent; a follow-up confirmation was requested.

| Evidence | Final result |
| --- | --- |
| New card-present attempts since P400 configuration | Exactly 1 |
| Draft created / approval stored (UTC) | 14:30:31 / 14:30:43 |
| Reconciliation completed (UTC) | 14:31:39 |
| Stored final state | `published` / `reconciled` / `confirmed` |
| ROLLER direct booking read | Same draft/booking identity; fully paid; SEK 100 total, zero amount owing |
| ROLLER payment collection | Exactly 1 card payment, SEK 100, zero tip |
| Booking contents | 1 item, quantity 1, 1 ticket; the kiosk receipt labels it 60-minute entry |
| Operational attachment | 1 matching session; both the installation claim and configured P400 terminal claim belong to this exact attempt |
| Reconciliation metadata | 12 bounded attempts; last publish HTTP 409; authoritative final read confirms completion |

The kiosk success screen was directly read as `DU ÄR INCHECKAD`, with the 60-minute entry and `KLAR, NÄSTA GÄST`. No client error was shown. The passive CDP observers lost their connection before recording the transaction, so they establish **no SDK dispatch count or timing** for this test; their zero captured requests must not be presented as zero actual requests. Backend/provider evidence above and Love's success report establish the outcome. This is not a separate bank-statement audit.

The wireless ADB connection subsequently went offline. One reconnect of the already-paired transport did not restore access. The agent asked Love to verify next-guest reset; it has not been independently observed after this P400 purchase. Earlier V210 next-guest reset and the unchanged recovery implementation remain covered by their existing evidence/tests. The agent did not submit safety attestations, initiate print/redemption, cancel/refund a booking, force publication, release a lock or retry a payment. User-driven print/safety actions are not separately certified by this terminal test.

Current installation assignment remains **Kiosk 2 / P400**; V210 remains configured with its original stable lock, but this installation's sole allowlist entry is Kiosk 2. Switching it back requires a reviewed server allowlist change while its current attempt is resolved, followed by authenticated native selection and relaunch; neither APK nor site needs rebuilding. Legacy `primary` compatibility is retained and shares P400's new lock. Production signing/device management and broader end-to-end printer/language acceptance remain separate scopes.
