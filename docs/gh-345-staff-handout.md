# #345 Staff handout and daily numbers

Implementation branch: `codex/gh-345-staff-handoff`, based on `6b938a9`.
Scope: [#345](https://github.com/wrlds-creations/jumpyard-check-in/issues/345).
The reviewed #389 prototype is design input. This implementation uses the real staff root, personal PIN sessions, Cloud API and operational database. It does not ship the prototype's fixtures or a second production app.

## Guest and staff behavior

1. Finish guest check-in on phone or kiosk. The existing shared ready endpoint assigns the session a four-digit number and keeps its stable QR identity.
2. Entrance opens Ready for the next actual pass. Staff can choose Started, Upcoming or Checked-in, another pass/date, earlier arrivals, or search across the selected day's passes and states. Bookings without a session are visible but cannot skip guest payment/safety.
3. Open a guest without claiming them. The first product selection saves both ownership and selected quantities. Another operator sees the owner and cannot overwrite that selection. Closing/reopening retains it; a resume action returns to the exact pending session.
4. Select the purchased bands/socks or other entrance goods and confirm. Bands represent the selected admission group. Non-admission products can be collected in smaller quantities. The existing ROLLER redemption/recovery path remains authoritative.
5. The same guest number/session QR works in Café after admission. One of two coffees can be collected, leaving one for later. Each receipt retains product identity, quantity, staff member and time. Café never redeems admission a second time.

White surfaces, black text, JumpYard red, existing brand PNG icons and the reviewed compact typography replace the previous production list for PIN staff. Admin Cognito/TOTP and legacy dev authentication remain available. The scanner uses the existing camera reader. No APK is created.

## Daily allocation and lookup

`ready_staff_session` locks the session, atomically reserves a number in `handoff_day_counters`, and attaches it in one transaction. The database clock in `Europe/Stockholm` decides the allocation date, independently of the phone or database session timezone. New allocations start at `0001` each calendar day and park; the last number is `9999`. A ready session's expiry covers the visit day.

The display number is not an access credential. Its identity is `(park, allocation day, number)`. `handoffDay` is displayed on the phone and used by exact staff number search; the queue date normally selects visit date. For four-digit searches it selects **allocation date**, which may differ if a guest prepared earlier. Staff still see the visit date and guest before confirmation. Earlier allocated sessions retain their number across midnight and after admission. Staff can select the issuance date or scan the session QR instead of guessing an old number's date.

The stable formats remain `JY_HANDOFF:<code>:<checkinSessionId>` and `JY_SESSION:<checkinSessionId>`. Old JY codes keep their existing values. Searching an earlier group's number still finds that session when another group starts on the same booking. Café can open the previously admitted group in that case.

When a day's series is full, readiness succeeds with no short code and the stable session QR. The series never wraps within the day. Counters contain aggregate integers, survive guest/session retention, and are never decremented by application code. On a database restore, keep application traffic stopped: reconcile the restored counters with the latest trustworthy high-water evidence. If today's high-water cannot be proven, set that park/day to `9999` before traffic and use session QR for the rest of the day. Do not guess a lower counter or reuse numbers. Restore/apply remains its existing separately controlled operation.

## Data, concurrency and recovery

- Migration `0021_staff_daily_handout.sql` adds allocation day/venue, scoped uniqueness, aggregate counters, per-visit/area claims and immutable collection operations. No new runtime service is added.
- Claim selection uses actor and visit locks, row locking and revision checks. One operator holds one active selection; entrance and café have separate owners. Ownership expires after three minutes without selection/confirmation. Read-only polling does not prolong a lease. Expired unfinished selections may be replaced; uncertain confirmed operations must be resumed with their original identity.
- Before a ROLLER write, the exact selected operation is persisted. A lost response resumes that operation. Admission uses `staff-redeem:<sessionId>` and #333's durable receipt/ticket-state recovery. Collection finalization and claim release are atomic; replay does not create another receipt.
- A pending operation reserves its item identity even if a later catalog correction moves the product between entrance and café. The other counter must resume the original operation rather than create another receipt for the same goods.
- A pending confirmation cannot be silently edited/released. If ROLLER, payment or product state becomes inconsistent, show the blocker and retain the intent for reconciliation. No automatic reversal of physical handout or ROLLER redemption is invented. Staff must inspect the authoritative booking before further physical action.
- Product identity comes from original/linked ROLLER booking and item IDs plus visit date, not a mutable label. Only paid, active, same-park purchased lines create entitlements; exact payment classification matches #338. Linked goods are refreshed before confirmation. Unknown packages do not manufacture extra goods. The verified Weekday Combo mapping remains two 60-minute bands and one later pizza per package.
- Only the redeem role can change claims/receipts. The session role can read them and allocate numbers. Public EXECUTE is revoked. Guest state follows existing booking/session deletion cascades; aggregate counters remain. PIN tokens and raw guest data are not added to logs or receipts.

## API changes

`GET /v1/staff/check-in/sessions?view=board&day=YYYY-MM-DD&q=...&cursor=...` requires staff read permission and venue. It returns paginated day bookings, including `booking:<id>` rows without guest sessions, selected-session details, active claims, café remaining counts and an admitted `cafeSession` when available. `nextCursor` must be consumed until absent. The app fails visibly rather than silently showing an incomplete day. The legacy list without `view=board` is preserved. Existing linked-payment reconciliation runs before the first board page.

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

Final local results, September 8:

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

Target: existing `jumpyard-check-in-park-test-stack`, account `376129878018`, `eu-north-1`, Nacka `50871`; existing Park verification frontends and `https://checkin.jumpyard.se` / `https://staff-checkin.jumpyard.se`.

Exact existing metadata: Client `JumpYard`, Project `jumpyard-check-in`, Environment `park-test`, Owner `love`, Repository `wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, DataClassification `confidential`, Exportable `true`, CostCenter `JumpYard`, CreatedBy `love`. No venue/date expansion, new multi-park infrastructure or guest-send activation.

1. Local validation and complete-diff review are finished. On September 8 Love explicitly authorized commit, push, merge and deployment of the finished #345 change, resolving the earlier no-commit checkpoint. Use a reviewed #345 PR, then the immutable release built for its merged SHA. Review each actual plan before exercising that delegated authorization through its protected environment gate.
2. Inspect the selected artifact and exact currently deployed rollback candidate. Expected infrastructure delta: session/redeem code, one handout API route/integration/permission (205 to 208 CloudFormation resources), route throttling and migration `0021`. No replacement database, Lambda or credential is intended.
3. Dispatch protected Park promotion for that exact release run/full SHA with `apply_migrations=true`. Review the real plan before the protected approval. Use the artifact's migration runner, then its backend/frontends; no local deploy or rebuild.
4. Verify migration status, deployed template/code, alarms, queues, drift and the Park frontend bytes. Promote the same artifact through the protected Nacka public workflow, then verify both public outputs and API origin.
5. Reload shared staff phones onto the selected release before opening the new flow. Old clients can still use legacy sessions/QRs during transition, but have no café ledger UI. Avoid operating mixed staff versions during physical handout.

Migration `0021` is forward-only. Never reverse it or decrement counters on application rollback. An older artifact may understand legacy readiness/admission but lacks the new handout endpoint/UI; it is **not** an operationally equivalent café rollback. A known compatible #345 artifact is preferred. Before reverting to a pre-#345 artifact, stop physical handout, retain the ledger, review outstanding selections/receipts, use stable session/booking identity rather than old undated number search, and explicitly agree the reduced operation. An incompatible rollback requires a corrective immutable release.

## Release status

Local implementation and validation are complete; protected rollout is pending. Love has explicitly authorized commit, push, merge and deployment. The rollout evidence will identify the reviewed PR and exact release, database apply and backend/public versions. Keep the issue open until the selected artifact is verified and physical acceptance limits are recorded.

The currently deployed pre-#345 fallback is release `34207599674`, SHA `c60f4d3d9a901ebae625af9f1ad03c3ddfa47f4f`, artifact `10048622809` (verified unexpired on September 8). It preserves Klarna exclusions and #333 admission recovery but lacks the new collection ledger UI/endpoint, so the reduced-operation rollback constraints above apply. No rollback is requested or performed by this promotion.

Love's live walkthrough after promotion: prepare a visit; confirm the four-digit number; give out bands/socks; scan the same code at Café; collect one coffee; check one remains and both staff names are correct; repeat from a second phone and verify duplicate collection is blocked.
