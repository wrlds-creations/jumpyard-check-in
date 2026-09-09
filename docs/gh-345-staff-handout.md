# #345 Staff handout and daily numbers

Initial implementation: `codex/gh-345-staff-handoff`, based on `6b938a9`. Live-feedback refinements: `codex/gh-345-staff-speed`, based on merged `c3cf035`.
Scope: [#345](https://github.com/wrlds-creations/jumpyard-check-in/issues/345).
The reviewed #389 prototype is design input. This implementation uses the real staff root, personal PIN sessions, Cloud API and operational database. It does not ship the prototype's fixtures or a second production app.

## Android acceptance and closeout — 2026-09-09

Love accepted the installed JumpYard Personal v1.0.0 app: **“Jag testade och jag är nöjd.”** This completes the owner acceptance checkpoint for #345. It is general acceptance, not an itemized report of optical ticket-QR or two-phone tests. Earlier pending-acceptance statements below are historical rollout evidence.

[PR #401](https://github.com/wrlds-creations/jumpyard-check-in/pull/401) merged as `822384309ece85fc95f0e5e951e048c6eca39601` after implementation-agent source review and all six [CI jobs](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34334993759) passed at `66f1f007b3a134897db3770de9d707a8c5e2aa93`; no independent human code review or merge bypass is claimed. [The Android runbook](../jumpyard-checkin-android/README.md) records exact package, APK/certificate hashes, local validation and Motorola evidence, including a successful in-place update and matching installed APK readback.

The tested APK is retained unchanged. AirDroid locking is colleague-owned and excluded from closure. Signing-key backup before wider distribution remains the separate Project draft **Escrow staff Android signing key before wider device rollout**. No new backend/web deployment, rollback or re-promotion was needed; `971d901` remains live through release `34327287544`, Park `34327943053` and public `34328439965`. Automatic mainline artifact builds do not deploy.

## Guest and staff behavior

1. Finish guest check-in on phone or kiosk. The existing shared ready endpoint assigns the session a four-digit number and keeps its stable QR identity.
2. Entrance opens Ready for the next actual pass. Staff can choose Started, Upcoming or Checked-in, another pass, earlier arrivals, or search across today's passes and states. The date picker is removed; the server owns today in Stockholm. Bookings without a session are visible but cannot skip guest payment/safety.
3. Open a guest without claiming them. The first product selection saves both ownership and selected quantities. Another operator sees the owner and cannot overwrite that selection. Closing/reopening retains it; a resume action returns to the exact pending session.
4. Select the purchased bands/socks or other entrance goods and confirm. One tap selects all remaining entrance goods of that kind; entrance quantity steppers are removed. Bands represent the selected admission group. Café retains partial quantities. The existing ROLLER redemption/recovery path remains authoritative.
5. The same guest number/session QR works in Café as soon as guest check-in is ready, even before entrance admission. Purchases are visible immediately, including read-only views for guests still preparing. Each counter can collect only its own goods. One of two coffees can be collected, leaving one for later. Each receipt retains product identity, quantity, staff member and time. Café never redeems admission or marks a ready session redeemed.

White surfaces, black text, JumpYard red, existing brand PNG icons and the reviewed compact typography replace the previous production list for PIN staff. Admin Cognito/TOTP and legacy dev authentication remain available in the browser. The scanner uses the existing camera reader. Love extended #345 on September 9 to include a [staff Android APK](../jumpyard-checkin-android/README.md) opening this same staff root; AirDroid locking belongs to his colleague.

## Daily allocation and lookup

`ready_staff_session` locks the session, atomically reserves a number in `handoff_day_counters`, and attaches it in one transaction. The database clock in `Europe/Stockholm` decides the allocation date, independently of the phone or database session timezone. New allocations start at `0001` each calendar day and park; the last number is `9999`. A ready session's expiry covers the visit day.

The display number is not an access credential. Its identity is `(park, allocation day, number)`. `handoffDay` is displayed on the phone. The staff app searches today's **visit date**, including codes allocated on an earlier day. If the same number identifies multiple groups visiting today, show every candidate, including separate groups on one booking; never select one silently. Search preserves each exact session rather than substituting an admitted café session. Existing sessions retain their number across midnight. Stable QR remains the unambiguous identity. Older API callers without `scope=today` retain allocation-date lookup.

The stable formats remain `JY_HANDOFF:<code>:<checkinSessionId>` and `JY_SESSION:<checkinSessionId>`. Old JY codes keep their existing values. Searching an earlier group's number still finds that session when another group starts on the same booking. Café can open the previously admitted group in that case.

When a day's series is full, readiness succeeds with no short code and the stable session QR. The series never wraps within the day. Counters contain aggregate integers, survive guest/session retention, and are never decremented by application code. On a database restore, keep application traffic stopped: reconcile the restored counters with the latest trustworthy high-water evidence. If today's high-water cannot be proven, set that park/day to `9999` before traffic and use session QR for the rest of the day. Do not guess a lower counter or reuse numbers. Restore/apply remains its existing separately controlled operation.

## Data, concurrency and recovery

- Migration `0021_staff_daily_handout.sql` adds allocation day/venue, scoped uniqueness, aggregate counters, per-visit/area claims and immutable collection operations. No new runtime service is added. Forward migration `0022_staff_cafe_ready_collection.sql` replaces only the collection function's admission prerequisite for café. Applied `0021` stays byte-identical; ready/safety/sync/expiry, ownership, item-area and quantity guards remain. An operation containing admission items still requires confirmed redemption before its receipt completes.
- Claim selection uses actor and visit locks, row locking and revision checks. One operator holds one active selection; entrance and café have separate owners. Ownership expires after three minutes without selection/confirmation. Read-only polling does not prolong a lease. Expired unfinished selections may be replaced; uncertain confirmed operations must be resumed with their original identity.
- Before a ROLLER write, the exact selected operation is persisted. A lost response resumes that operation. Admission uses `staff-redeem:<sessionId>` and #333's durable receipt/ticket-state recovery. Collection finalization and claim release are atomic; replay does not create another receipt.
- A pending operation reserves its item identity even if a later catalog correction moves the product between entrance and café. The other counter must resume the original operation rather than create another receipt for the same goods.
- A pending confirmation cannot be silently edited/released. If ROLLER, payment or product state becomes inconsistent, show the blocker and retain the intent for reconciliation. No automatic reversal of physical handout or ROLLER redemption is invented. Staff must inspect the authoritative booking before further physical action.
- Product identity comes from original/linked ROLLER booking and item IDs plus visit date, not a mutable label. Only paid, active, same-park purchased lines create entitlements; exact payment classification matches #338. Linked goods are refreshed before confirmation. Unknown packages do not manufacture extra goods. The verified Weekday Combo mapping remains two 60-minute bands and one later pizza per package.
- Only the redeem role can change claims/receipts. The session role can read them and allocate numbers. Public EXECUTE is revoked. Guest state follows existing booking/session deletion cascades; aggregate counters remain. PIN tokens and raw guest data are not added to logs or receipts.

## API changes

`GET /v1/staff/check-in/sessions?view=board&scope=today&q=...&cursor=...` requires staff read permission and venue. The server selects the Stockholm date, ignoring a supplied `day` for this scope. It returns paginated day bookings, including `booking:<id>` rows without guest sessions, selected-session details, active claims, café remaining counts and an admitted `cafeSession` when available. `nextCursor` must be consumed until absent. The app fails visibly rather than silently showing an incomplete day. The legacy list without `view=board` and board callers using `day` without `scope=today` are preserved. Existing linked-payment reconciliation runs before the first board page.

`GET /v1/staff/check-in/sessions/{id}` includes authoritative `handout.items`, `claims`, `receipts`, available quantities and admission actor. Opening it never acquires a claim.

Visible PIN guest details refresh every two seconds, including completed admission and café. Whole-day queue polling starts at two seconds, scales with the number of 100-booking pages, and spaces pagination requests by at least 300 ms. This bounds shared route traffic without changing the selected guest. A synthetic token-bucket check covers five simultaneous staff clients, 205–5,000 bookings/day, open details and product selection/confirmation. It is a configured API-rate model, not a live latency/load guarantee; a very large whole-day list refreshes more slowly. Database ownership remains authoritative immediately.

`POST /v1/staff/check-in/sessions/{id}/handout` requires personal staff operator authorization. Request: `{ area: "entrance" | "cafe", action: "select" | "release" | "confirm", revision, selection?: [{ id, quantity }] }`. Responses include authoritative handout state and session. Conflicts return a specific code; `staff_busy`/`handout_resume_required` include the exact session/area to resume. A network timeout is uncertain until state/retry resolves it. The old redeem endpoint respects active handout ownership.

Raw scanned booking references and ticket/custom-ticket identifiers use authorized board search across filters. Unsupported URLs are not decoded through a guessed provider parser. Existing kiosk QR evidence is retained in its repository. The available ROLLER PDF inspected on September 8 was a tax receipt **without a QR**; it does not prove an incoming ticket-QR format. A real website ticket QR and physical camera behavior remain part of Love's handset acceptance.

## Validation

See `jumpyard-checkin-admin/PREVIEW.md` for the local walkthrough. Automated checks include:

- Native PostgreSQL 17 with all migrations and actual restricted roles: 24 concurrent allocations, same-session retries, independent parks, midnight/DST boundaries, legacy values, full-series fallback and retained counters.
- Claims/revisions, two operators, one active selection, session-specific group limits, separate café access, partial quantities, exactly-once receipts, newer-session recovery, exact linked-payment semantics and complete 205-booking pagination/search.
- Actual redeem Lambda plus native PostgreSQL: synthetic ROLLER acceptance followed by lost response; local receipt failure before/after commit; recovery without a second provider write; café reuse; permission/emergency/venue and malformed-input guards. Only identity verification and provider network responses are simulated.
- Actual frontend component rendering/handlers: first-tap ownership, reopened selections, colleague locks, partial coffee, pending recovery and next-pass defaults. Existing payment, staff heartbeat, kiosk synchronization, package and #333 regressions remain in the suite.

Run `npm run validate:gh345-staff-handout`. Native tests explicitly skip without `GH345_PSQL`; set it to the local `psql` executable to run against the disposable `127.0.0.1:55435/jumpyard_cloud`, user `gh345_test`. CI provisions PostgreSQL 17 and runs both native suites. `pg@8.23.0` is a locked **development-only** infrastructure dependency for the test bridge; it is absent from Lambda runtime bundles.

Initial release validation, September 8 (before the live-feedback refinements below):

| Check | Result |
| --- | --- |
| `npm run validate` | Passed full repository suite; affected queue/identity/capacity and #345 checks rerun after final review fixes |
| `npm --prefix infra run check` | Passed full infrastructure/configuration/CDK/protected-workflow suite |
| All migrations `0001`–`0021` in a new PostgreSQL 17 database | 21 passed, including a final clean-database run after the pending-item reservation fix |
| `GH345_PSQL=... npm run validate:gh345-staff-handout` | 26/26 database/API/pure tests and 6/6 actual frontend/model tests; no skips |
| Staff lint, `tsc --noEmit`, `node --test src/lib/*.test.mjs`, build | Passed; 84/84 tests; no `/preview` route in the production export |
| Phone lint, `tsc --noEmit`, payment/safety/package/mock-boundary checks and build | Passed, including 137/137 payment-recovery tests; preview routes export only not-found pages |
| Browser walkthrough | 320, 390 and 1,100 px; same-session QR payload, first selection, reopen/recovery, entrance, partial café, attributed history, and live colleague ownership/release update without reload |
| `git diff --check`, history/context validator | Passed |

The browser uses synthetic bookings and a temporary local API. Native API integration tests execute the real redemption/recovery handler with simulated identity/provider responses; browser QA itself stubs admission. No live customer payment, admission, café collection, messaging or load test was performed.

A read-only Nacka data check before promotion confirmed 20 applied migrations, 103 sessions and 90 existing legacy codes. Actual purchased/catalog shapes classify admission, socks, coffee and Combo correctly. The check also showed quantity-only product variants (`Antal`) and the purchased `Pizza & Saft` line: display now uses the parent product for generic quantity labels and preserves the full purchased food name. No product entitlement or quantity is added by that display correction.

Dependency audit: the existing CDK development toolchain still has three high-severity package entries, already present in base `6b938a9` (`aws-cdk-lib`, bundled `brace-expansion` and `fast-uri`). Evidence was added to the existing Project draft **Resolve the aws-cdk brace-expansion advisory** (`PVTI_lADOBXiXg84BdXuJzgyxz_Q`); no duplicate draft or unrelated dependency upgrade was created. The added development-only PostgreSQL test driver is not affected by these findings.

## Promotion and rollback plan

This sequence records the initial handout rollout. The subsequent refinement changes only the existing session/redeem code and adds migration `0022`; its exact publication evidence is below.

Target: existing `jumpyard-check-in-park-test-stack`, account `376129878018`, `eu-north-1`, Nacka `50871`; existing Park verification frontends and `https://checkin.jumpyard.se` / `https://staff-checkin.jumpyard.se`.

Exact existing metadata: Client `JumpYard`, Project `jumpyard-check-in`, Environment `park-test`, Owner `love`, Repository `wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, DataClassification `confidential`, Exportable `true`, CostCenter `JumpYard`, CreatedBy `love`. No venue/date expansion, new multi-park infrastructure or guest-send activation.

1. Local validation and complete-diff review are finished. On September 8 Love explicitly authorized commit, push, merge and deployment of the finished #345 change, resolving the earlier no-commit checkpoint. Use a reviewed #345 PR, then the immutable release built for its merged SHA. Review each actual plan before exercising that delegated authorization through its protected environment gate.
2. Inspect the selected artifact and exact currently deployed rollback candidate. Expected infrastructure delta: session/redeem code, one handout API route/integration/permission (205 to 208 CloudFormation resources), route throttling and migration `0021`. No replacement database, Lambda or credential is intended.
3. Dispatch protected Park promotion for that exact release run/full SHA with `apply_migrations=true`. Review the real plan before the protected approval. Use the artifact's migration runner, then its backend/frontends; no local deploy or rebuild.
4. Verify migration status, deployed template/code, alarms, queues, drift and the Park frontend bytes. Promote the same artifact through the protected Nacka public workflow, then verify both public outputs and API origin.
5. Reload shared staff phones onto the selected release before opening the new flow. Old clients can still use legacy sessions/QRs during transition, but have no café ledger UI. Avoid operating mixed staff versions during physical handout.

Migration `0021` is forward-only. Never reverse it or decrement counters on application rollback. An older artifact may understand legacy readiness/admission but lacks the new handout endpoint/UI; it is **not** an operationally equivalent café rollback. A known compatible #345 artifact is preferred. Before reverting to a pre-#345 artifact, stop physical handout, retain the ledger, review outstanding selections/receipts, use stable session/booking identity rather than old undated number search, and explicitly agree the reduced operation. An incompatible rollback requires a corrective immutable release.

## Protected rollout — 2026-09-08

This is the historical initial promotion, superseded by the refinement release below. [PR #393](https://github.com/wrlds-creations/jumpyard-check-in/pull/393) merged the staff flow as `e13df7ab3537c41bea7d30ec427bc7af2edf47f3`; [PR #394](https://github.com/wrlds-creations/jumpyard-check-in/pull/394) corrected the actual purchased product labels and merged as **`ca38fec4515d135f642d10de3f839871d07e2498`**, the initially deployed version. Both had documented Codex source review, successful required checks and normal protected squash merges; no independent human code review is claimed. CI runs [34228164584](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34228164584) and [34229265041](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34229265041) passed all five jobs, including native PostgreSQL 17 tests.

| Evidence | Exact value |
| --- | --- |
| Immutable release | [34229583004](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34229583004), successful; 661 file checksums verified |
| Artifact | `10057451678`, `park-test-release-ca38fec4515d135f642d10de3f839871d07e2498`, 26,470,337 bytes |
| Artifact SHA256 | `e14880668278c0daa860a88e70a2763b50c92d078c4b35028697eff0e54580cf` |
| Manifest SHA256 | `183e52ce33857b6ac69e6fd08a895f28feaec9307264bab9dd1c3ea069f70c53` |
| Park promotion | [34230754910](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34230754910), successful at 13:23:13 UTC; `apply_migrations=true` |
| Public promotion | [34231738633](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34231738633), successful at 13:25:55 UTC |
| Deployed template SHA256 | `84778ba5e89d189496317b65c3267e4747dc48574d1d38bd77bf55dc47de3cbd` |
| Migration `0021` SHA256 | `c49572b60853b8b4eee46145aa335ef08473bacd6cb24bedcc617f7e1e4abb57` |
| Park Pages deployments | phone `9fd88425`; staff `e69c34a9` |
| Public Pages deployments | phone `f827016f`; staff `87371033` |

Love's explicit commit/push/merge/deploy instruction also authorized delegated approval through the existing protected `park-test` gate. Before Park approval, the downloaded actual plan was independently reproduced against live AWS with exact equality: 205 to 208 resources, only the handout route/integration/invoke permission added, and stage/session/redeem updated. There were no removals or other template section changes; the code updates changed asset references only. All 20 previously applied SQL checksums matched before the single pending migration was approved. Protected deployment record: `6328433738`.

Public approval followed successful Park verification. Actual plan job `102079321621` verified the same artifact digest, all 661 files, the exact two production Pages projects/public origins and existing Nacka API. Protected deployment record: `6328619024`. The workflow made no AWS mutations. Neither promotion rebuilt source or bypassed the environment gate.

Post-deployment verification:

- Park reached `UPDATE_COMPLETE`; selected/deployed templates match, drift is `IN_SYNC`, no monitored alarm is in `ALARM`, and both queue counts are zero. The API has 28 routes: six IAM, four JWT and eighteen with caller-specific Lambda authorization. The new handout route uses rate/burst `20/40`.
- Migration `0021` applied at 13:20:32 UTC. An independent read-only query matched all **21** migration checksums against the selected artifact. The pre-existing **103 sessions and 90 legacy codes** remained unchanged at readback; no daily code was allocated by deployment or verification.
- Independent retrieval of both active Lambda ZIPs matched **all ten packaged files** to the selected artifact. Session code SHA256 (base64): `Dogw/9zcddOeoh9W2RM29uLgyL+Zm700aJYCUhHouCc=`; redeem: `eea0P2GUKs6fHV3ulyL5D5ZzIuMLdiEejo17Bd4f1MM=`. Both updates reported `Successful`.
- The selected release's actual board SQL ran read-only with **`jumpyard_session_runtime`**, the real restricted production database role: all **33** Nacka bookings for September 8 returned in one page. This verifies SQL/grants with real data, not a credentialed browser/PIN acceptance test.
- Unauthenticated board and handout requests returned HTTP **401**, `staff_auth_session_required`, before customer/provider mutation.
- Exact-SHA Cloudflare metadata, active public domains, allowed/blocked CORS, Cognito callbacks and Apple Pay association checks passed. Independent byte comparison matched **30 responses per lane, 60 total**: phone root/linked assets/Apple association and staff root/admin/callback/linked assets. The public staff page rendered the existing PIN login in the browser.

Account, region, full WRLDS metadata, Nacka venue/date limits and closed general guest messaging remain as specified above. There was no live customer purchase, admission, physical collection, guest send, load test or financial-provider setting change. Documentation-only evidence merges do not replace the deployed `ca38fec` artifact.

### Rollback availability

The previously deployed pre-#345 fallback is [release 34207599674](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34207599674), SHA `c60f4d3d9a901ebae625af9f1ad03c3ddfa47f4f`, artifact `10048622809`, digest `2f5261ed8cad4f9279c71dd49a5963cbbf9d960061975bd4925a6c3814970519`. It was verified unexpired on September 8 and previously passed Park `34208225791` / public `34208537881`. It preserves Klarna exclusions and #333 admission recovery but lacks the new collection ledger UI/endpoint, so the reduced-operation constraints above apply.

A same-schema #345 candidate also exists: successful [release 34228621504](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34228621504), SHA `e13df7ab3537c41bea7d30ec427bc7af2edf47f3`, artifact `10056994786`, digest `d1fd54b070fd0ab1b4adc97dfcb26f505cdae72211e9fc96f302501aa7cea9be`. Only the subsequent product-label correction differs. This candidate is built/CI-validated and unexpired, **not previously deployed or Park-proven**. Never reverse migration `0021` or decrement counters. No rollback or re-promotion was requested/performed during this rollout, so there are no such new run IDs.

### Love's live walkthrough

Open [the guest app](https://checkin.jumpyard.se) and [the staff app](https://staff-checkin.jumpyard.se). Reload every shared staff phone before testing and log in with existing personal PINs. Use a visit containing the relevant purchased goods; do not expect coffee on a booking that did not buy it.

1. Finish a fresh guest check-in and verify the four-digit number and allocation date. Earlier JY sessions retain their old codes; midnight starts a new series without renumbering an existing guest.
2. In Café, find/scan the ready guest before entrance admission. Collect one of two purchased coffees and verify one remains. First selection should display ownership on a second staff phone; café must leave admission untouched.
3. Present the same session QR/number in Entré. Select purchased bands/socks with whole-quantity taps and confirm. Completed goods have green outlines without counts; café goods are visible but read-only. Return to Café for the remaining coffee and attributed history.
4. Reopen on the second phone and verify ownership, saved state and already-collected quantities prevent duplicate handout. Keep an uncertain confirmation open and use its recovery action before physical repetition.
5. Test the physical Motorola camera and an actual website booking ticket QR. The previously inspected PDF had no QR; unsupported provider URL formats have not been guessed. The stable JumpYard session QR and raw booking/ticket identifiers retain their supported search paths.

Love completed the practical acceptance checkpoint on September 9, as recorded above. The Android extension supersedes the original APK exclusion; a live load benchmark remains outside this delivery. Local automation and server readback do not substitute for physical collection proof.

## Live clarity refinements — 2026-09-09

Love reported six beside the guest icon for a mixed purchase whose detail showed one guest. A read-only live browser observation confirmed the queue value; the detail value is reported evidence because that browser subsequently returned to PIN login. The board SQL counted every selected product ticket as an admission. The correction uses the same paid manifest classification, verified package contents and selected-ticket limits as the detail endpoint. It labels entrances explicitly and never falls back to product-ticket totals. Zero/unknown values are omitted; a café shortcut to an earlier group also omits the newer group's count.

The approved refinement orders entrance tabs Kommande → Påbörjade → Redo → Incheckade while preserving the Ready/next-pass default. Välj alla now has a clear selected state and can clear the selection. Other-counter products have informational rows without checkbox controls. The compact staff-switch button uses the existing profile icon. Detail loads and saves show accessible spinners with reduced-motion support; successful physical-handout state still requires the server response.

Native PostgreSQL/API/pure validation passed 30 tests without skips, including six mixed product tickets producing one entrance, extra-only selection producing zero, selected Combo groups producing two/four entrances, unstarted bookings, and completed group counts. The 16 focused UI/client tests cover the count/label consistency, tab order/default, other-counter controls, select/clear all, staff logout and retained delayed/failed-save guards. The full staff suite passed 94 tests. Local browser review at 320/390/1,100 px covered mixed purchase queue/detail, five-second selection delay, seven-second confirmation delay, untouched café goods at entrance, one-of-two coffee collection, attributed history and staff switching back to PIN. No horizontal overflow occurred. Fixtures use local PostgreSQL and synthetic identity/provider responses; no live customer write or provider call was made. Screenshots are in the local `gh345-staff-clarity-20260909` folder.

No dependency, schema, route, permission, AWS resource or provider setting changes are needed. The unrelated #396 worktree and #389 design source remain untouched. The protected publication below replaces the September 8 refinement. The rollback candidate is that previously deployed release `34239775713` / `653c09676201b9856d5b744d0ef716bf6a510088`; retain schema 0022, receipts and counters.

### Protected clarity rollout

[PR #399](https://github.com/wrlds-creations/jumpyard-check-in/pull/399) merged as **`971d9013d577db66fa8799bbd9d2db408b98607a`** after documented Codex source review of `4f116490565c990e877db15f7ca9ce706b62aaac` (review `5151434769`) and all five successful [PR CI jobs](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34326898817). [Main CI 34327287534](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34327287534) also passed all five jobs. Normal protected squash merge used no bypass; no independent human code review is claimed. Full local repository/infrastructure validation, staff lint/TypeScript/build and the 94/30/16 test suites above passed. An initial concurrent local Next build caused a lock collision; serial validation passed afterward.

| Evidence | Exact value |
| --- | --- |
| Successful immutable release | [34327287544](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34327287544), all 662 files verified |
| Artifact | `10094475142`, `park-test-release-971d9013d577db66fa8799bbd9d2db408b98607a`, 26,481,877 bytes |
| Artifact SHA256 | `430251eeedda0bcec5c8c1d754b055d9499b5c2ba90199aecf6e18f84753a712` |
| Manifest SHA256 | `e7440ea69bedff5a44b30d2fe10a090a891bb52a3760ad229065e2417045ce1a` |
| Successful Park promotion | [34327943053](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34327943053), `apply_migrations=false` |
| Successful public promotion | [34328439965](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34328439965) |
| Selected/deployed template SHA256 | `e411cfc2b29802172b5f7f351f5a29fed23244d625788e59059eece5ce81e1a2` |
| Park Pages deployments | phone `430b2421`; staff `008ca201` |
| Public Pages deployments | phone `8c7e761d`; staff `3722db94` |

Love's existing publication instruction authorized delegated protected approvals. Actual Park plan job `102389485736` matched the independently reproduced live AWS plan exactly: 208 resources before/after, only `SessionHandler3CE835D7` changed, solely its code asset and asset metadata. All other configuration, template sections and the 22 previously applied SQL checksums matched. Protected deployment record: `6345450947`. After Park and independent readbacks passed, actual public plan job `102391090190` verified the same artifact digest, 662 files and exact existing Nacka public targets; approval record `6345540623`. Neither lane rebuilt source or bypassed the protected environment. Public promotion made no AWS mutations.

Independent readbacks matched all ten files from the two active Lambda packages and all 30 Park plus 30 public static responses. Session code SHA256 (base64): `4D9pOgVavZWchkAlUURTQtzD/UIMUzCaZDWSaBH0vEI=`; Redeem remains `fKJuzwcz6PltaqQeI9LAn9XGIekI+vgni6QyHwrQi84=`. All 22 live migration checksums remain identical; early café, readiness and admission guards remain. Aggregate code counts were unchanged across deployment. The actual restricted `jumpyard_session_runtime` principal returned six admissions with the old query and one with the corrected query for the reported purchase; the installed artifact also returned one. Its whole-day query returned seven bookings in 96 ms. These are bounded Data API reads, not client latency or load measurements, and do not mutate the customer's booking.

Park reached `UPDATE_COMPLETE`; template equality, `IN_SYNC` drift, zero active monitored alarms, empty queues, exact-SHA Pages, public HTTP/domain/CORS/Cognito and Apple association checks passed. Unauthenticated board/fake-session handout requests returned 401 before mutation. A fresh public browser tab rendered PIN login. Existing Nacka account/region/WRLDS metadata, 28 routes, venue/date gates and closed general guest messaging remain.

The [staff app](https://staff-checkin.jumpyard.se) and [guest app](https://checkin.jumpyard.se) serve `971d901`. Reload staff phones before testing. The earlier release `34239775713` / `653c096` was reverified unexpired: artifact `10061675619`, digest `e13f0bb37d54f2cf2f55d006e375de8826da3c0b350f80ff6aab4452031e72be`, all 662 checksums valid, previously proven by Park `34240532179` / public `34241257794`. It retains schema 0022 and existing collections but restores the misleading count/UI. Never undo receipts or rewind counters. No rollback or re-promotion was performed. No new Project draft was needed. Issue #345 stays open for Love's physical Motorola/camera, website QR and two-phone collection acceptance; synthetic browser tests and live readbacks do not constitute those physical tests.

## Live-feedback refinements — 2026-09-08

Love approved keeping #345 open and improving the published app. Café collection is authorized “Ja, så snart gästens check-in är klar”, independently of entrance admission. The UI changes and API/date compatibility are described above. Applied migration 0021 is unchanged; 0022 replaces its collection function while preserving grants, counters, all other guards and immutable pending operations. No new AWS resource, route, permission, dependency or provider write is introduced.

### Performance evidence

Read-only CloudWatch aggregates from the existing API access log over one hour: board 166 successful requests, mean 7,031 ms and p95 7,907 ms; detail 336 requests, mean 623 ms and p95 794 ms; handout 20 requests, mean 1,513 ms (selection and confirmation share this route). This is server latency, not browser/network timing.

The same restricted live session database principal read 42 bookings for September 8. The deployed board query took 10,808 ms in a timed Data API call; the local revised query took 141 ms. Separate EXPLAIN ANALYZE runs measured 15,830 vs 111 ms: the old entitlement join examined unrelated bookings and performed roughly 772,000 item-index probes; the new query first limits each row to its own booking and linked purchases. These are bounded diagnostic samples, not a load test or a promise of every end-to-end response time. No customer write occurred.

### Validation and rollout status

Focused native PostgreSQL/Lambda/pure checks: 29/29; staff component, selection-buffer and client checks: 13/13; full staff test suite: 91/91. Cases include café before admission with a lost committed receipt and safe replay; retained safety/readiness/expiry/payment/area guards; whole-day pagination; earlier allocations and ambiguous groups; rapid/coalesced taps, failed/cancelled saves, and preserving another selected group.

Local lint, TypeScript, full repository validation and the staff production build passed. All 22 migrations also applied to a new PostgreSQL 17 database. Browser review at 320/390/1,100 px verified instant multi-product selection with five-second delayed responses; accepted revision ordering; green completed goods without counts; café visibility before guest readiness with disabled collection; partial café collection before admission; recovery after a lost committed selection; logout discarding the unsent second selection; and an older delayed board response preserving the accepted selection. No horizontal overflow was present at 320 or 1,100 px. Physical Motorola/camera, real ticket QR and customer handout remain Love's acceptance.

### Protected refinement rollout

[PR #397](https://github.com/wrlds-creations/jumpyard-check-in/pull/397) merged as **`653c09676201b9856d5b744d0ef716bf6a510088`** after documented Codex source review of head `c26607680cd2b744ef2900e0c3b0e4b0d970534d` and successful [PR CI 34239328567](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34239328567). [Main CI 34239775762](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34239775762) also passed all five jobs. The normal protected squash merge used no bypass; no independent human code review is claimed. The unrelated #396 phone worktree and #389 prototype were preserved.

| Evidence | Exact value |
| --- | --- |
| Selected immutable release | [34239775713](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34239775713), successful; 662 file checksums verified |
| Artifact | `10061675619`, `park-test-release-653c09676201b9856d5b744d0ef716bf6a510088`, 26,480,934 bytes |
| Artifact SHA256 | `e13f0bb37d54f2cf2f55d006e375de8826da3c0b350f80ff6aab4452031e72be` |
| Manifest SHA256 | `5c7da36fb9ca1759a5361af5bd47ad6ceb327aafac8f7b110f10996df9cf0801` |
| Park promotion | [34240532179](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34240532179), successful at 14:52:25 UTC; `apply_migrations=true` |
| Public promotion | [34241257794](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34241257794), successful at 14:55:30 UTC |
| Selected/deployed template SHA256 | `b053900d5b4ef8ea4abef6555660d0ce84b1b960f36e8c2f9f134735cdedab43` |
| Migration `0022` SHA256 | `ea9e4f27458fe03ae144e10a8837cdb7e39e733242987a425a6ab03f45211179` |
| Park Pages deployments | phone `61218558`; staff `7231085e` |
| Public Pages deployments | phone `94fbd6be`; staff `45be6aed` |

Love's existing publication instruction authorized delegated approval through the protected environment. Actual Park plan job `102109234518` was downloaded and independently reproduced against live AWS with exact equality: 208 resources before/after, only `SessionHandler3CE835D7` and `RedeemHandler3A94EE00` changed, and only their code assets differed. No resource additions/removals, IAM/configuration or other template section changes. All 21 previously applied SQL checksums matched before the single pending forward migration was approved. Protected deployment record: `6330285680`.

After Park and independent readbacks succeeded, actual public plan job `102111712176` verified the same artifact digest, all 662 files, both exact production Pages projects/public origins and the existing Nacka API. Delegated approval recorded protected deployment `6330405220`. Public promotion made no AWS mutations; neither workflow rebuilt source or bypassed the protected gate.

Independent verification of the installed release:

- Both active Lambda ZIPs matched **all ten packaged files** from the selected artifact. Session code SHA256 (base64): `Wr15ngVZF+YjxyZmgqv64Q0YTFaf5hAuAnQcgrb2gOg=`; redeem: `fKJuzwcz6PltaqQeI9LAn9XGIekI+vgni6QyHwrQi84=`. Both updates reported `Successful`.
- All **22 live migration checksums** matched the artifact. The installed collection function permits early café while retaining readiness and admission-item guards. Applied `0021` remains `c49572b60853b8b4eee46145aa335ef08473bacd6cb24bedcc617f7e1e4abb57`. Aggregate code inventory at readback remained 104 sessions, 91 allocated codes, including 90 legacy and one daily code; deployment/verification allocated no codes.
- The selected artifact's today-only query read **58 Nacka bookings** through the actual restricted `jumpyard_session_runtime` principal in **343 ms** for the Data API call. This later snapshot has a different booking count from the diagnostic comparison above; it is not an end-to-end or load benchmark.
- Park reached `UPDATE_COMPLETE`; selected/deployed template equality, `IN_SYNC` drift, zero active monitored alarms, empty queues, exact-SHA Pages, allowed/blocked CORS, Cognito callbacks and Apple association checks passed. Existing account/region, WRLDS metadata, 208 resources, 28 routes, venue/date gates and closed general guest messaging remain.
- Independent byte comparisons matched **30 Park and 30 public responses**, including phone root/assets/Apple association and staff root/admin/callback/assets. A fresh public staff browser tab rendered the PIN login. Unauthenticated board and fake-session handout requests returned **401** before mutation.

The [staff app](https://staff-checkin.jumpyard.se) and [guest app](https://checkin.jumpyard.se) served `653c096` until the September 9 clarity rollout above. Documentation-only evidence merges do not replace a deployed artifact. Physical Motorola/camera, real website ticket QR and two-phone customer collection remain Love's practical acceptance; no live customer write, guest send, physical collection or load test is claimed. No new Project draft was needed; the existing CDK advisory draft remains unchanged.

Rollback candidate is the previously deployed `ca38fec4515d135f642d10de3f839871d07e2498` from successful release `34229583004`, artifact `10057451678`, digest `e14880668278c0daa860a88e70a2763b50c92d078c4b35028697eff0e54580cf`. It was reverified unexpired with all 661 files matching, and previously passed Park `34230754910` / public `34231738633`. Keep 0022 applied on rollback: old Lambda code independently blocks early café collection, but existing café receipts and daily counters remain intact. Staff must resume outstanding receipts with a compatible artifact; never undo physical collection or roll counters back. No rollback or re-promotion was performed, so there are no new run IDs for either.
