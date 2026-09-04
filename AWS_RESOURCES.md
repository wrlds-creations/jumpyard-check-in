# AWS Resources

All AWS resources created for this project must be represented here if they are managed by this project or materially affect cost, security, data, deployment, or ownership.

## Current Status

### Issues #339/#341 Catalog Resilience (Implementation; Not Deployed)

The approved combined change updates only existing Booking/DataSync Lambda source: persist the single daily product refresh before unrelated source reads, diagnose unavailable prices, and isolate a bounded public-catalog failure to catalog-gated offers. Existing 24-hour prices, request pacing, resources, schema, IAM, schedules, gates and Nacka scope remain unchanged. Read-only inspection on 2026-09-04 confirmed account `376129878018`, `eu-north-1`, active DataSync (600 s timeout; no product TTL override) and enabled daily `cron(0 2 * * ? *)`. No AWS mutation or promotion has occurred. [Scope and validation](docs/gh-339-gh-341-catalog-resilience.md).

### Issue #343 Phone Safety Video (Published; No AWS Resource Change)

Reviewed [PR #378](https://github.com/wrlds-creations/jumpyard-check-in/pull/378) merged `5e163356cc7c30cd7b7d5b381db9472f42381172`. Immutable [release 33873617274](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33873617274), artifact `9937052826`, passed protected [Park 33874038259](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33874038259) then [public 33874318192](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33874318192), after review and delegated approval of each exact plan. This publishes phone video recovery and the smaller approved media.

All 556 artifact checksums passed. Current/release templates were identical (`1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`), with 202 resources and zero resource/section changes; CDK reported no changes. The CDK assembly, migration runtime and deployment config matched #374. Migrations remained applied through `0020`, with apply disabled. Exact stack/template, `IN_SYNC` drift, zero active alarms, empty queues, domain/CORS/Cognito/Apple association and exact-version checks passed. Independent Park/public readback matched 33 responses each, including the video; hosted playback completed on both origins.

Account `376129878018`, region `eu-north-1`, WRLDS metadata, backend, schema, IAM, routes, gates and Nacka scope are unchanged. No real transaction, provider change or guest message occurred. Verified unexpired #374 release `33864750849` / `4ed47e5`, artifact `9934011980`, is the rollback candidate; no rollback or re-promotion was needed. Physical handset/kiosk/Wi-Fi testing is not claimed. [Hashes, approvals and closeout evidence](docs/gh-343-safety-video-recovery.md#protected-rollout--2026-09-04).

### Issue #374 Phone Purchase Preparation (Published; No AWS Resource Change)

Reviewed [PR #375](https://github.com/wrlds-creations/jumpyard-check-in/pull/375) merged `4ed47e5c1aab56f0417866e4ad10a2e5419a0a7f`, retaining #330 and #367. Immutable [release 33864750849](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33864750849), artifact `9934011980`, passed protected [Park 33866158981](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33866158981) then [public 33867049758](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33867049758), after each exact plan was reviewed and approved under Love's explicit publication instruction. The phone prepares the safety continuation before showing receipt confirmation; no backend behavior changed.

Current/release templates were identical (`1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`), with 202 resources and zero resource/section changes. CDK reported no changes. Migrations remained applied through `0020`, with apply disabled. Exact template, successful stack state, `IN_SYNC` drift, zero active alarms, empty queues, domain/CORS/Cognito/Apple association and exact-SHA frontend checks passed. Independent Park and public readback matched 32 responses each to the selected artifact. Account `376129878018`, region `eu-north-1`, WRLDS tags, API, routes, IAM, schema, secrets, gates and Nacka venue/date scope are unchanged. No real payment, provider change or guest message was performed.

The prior successfully deployed #330 release `33862373255` / `668a476d21173a14c7bd449784ab7ef53247f502`, artifact `9933035732`, remains the verified unexpired rollback candidate; no rollback or re-promotion was needed. Love's actual Apple Pay handset acceptance remains on #374. [Checksums, approvals, validation and acceptance evidence](docs/gh-374-purchase-preparation.md).

### Issue #330 Add-On Payment Back (Rollout Verified 2026-09-04; No AWS Resource Change)

[PR #372](https://github.com/wrlds-creations/jumpyard-check-in/pull/372) merged `668a476d21173a14c7bd449784ab7ef53247f502`. Immutable [release 33862373255](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33862373255), artifact `9933035732`, passed protected [Park 33863602024](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33863602024) and [public 33863606635](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33863606635). Each exact artifact/target plan was reviewed before delegated approval under Love's instruction to finish #330; public approval followed successful Park verification.

During this rollout, the selected/deployed canonical template hash was `1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`: 202 resources, zero changes, and CDK `no changes`. The entire CDK assembly, migration runtime and deployment config matched the previous release. Migrations were complete through `0020`, with apply disabled. Stack/template/drift, zero-alarm, empty-queue, exact-version, HTTP, domain/CORS/Cognito and Apple association checks passed. Account `376129878018`, region `eu-north-1`, WRLDS metadata, backend, schema, IAM, secrets, routes, gates and Nacka venue/date scope were unchanged. No live guest transaction, message, rollback or re-promotion occurred. The prior deployed release `33847988150` / `4d3e68d` was verified unexpired and retained for rollback of #330. [Detailed rollout and owner acceptance](docs/gh-330-addon-payment-back.md#protected-rollout--2026-09-04).

### Issue #367 Verified Combo Contents (Published)

Reviewed [PR #371](https://github.com/wrlds-creations/jumpyard-check-in/pull/371) merged `4d3e68d58ed69d48f7164a95e3977cc4af44857d`. Immutable [release 33847988150](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33847988150), artifact `9927575535`, adds response-only two-band/one-later-pizza contents for the verified Weekday Combo in phone and Handoff. The 202-resource plan changed only code and asset metadata for Booking, Lookup and Session; no resource, route, IAM, schema, secret, gate, venue/date or tag change was made. Account `376129878018`, `eu-north-1`, existing Nacka stack and WRLDS metadata remain intact.

Initial [Park run 33848969487](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33848969487) deployed successfully but its combined final verifier failed while the Roller error alarm was active after one ordinary booking-lookup 404. Read-only diagnosis confirmed `UPDATE_COMPLETE`, `IN_SYNC`, exact template and empty queues. The alarm cleared naturally at `07:53:41Z`; no alarm, metric or guard was changed. Protected same-artifact [retry 33850212562](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33850212562) then passed every check with a zero-change plan/CDK result, migrations complete through `0020` with apply disabled, template hash `1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`, zero alarms, empty queues and exact-SHA Pages outputs.

Public [run 33849552330](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33849552330) passed after the successful Park retry and actual artifact/target-plan review. It promoted the same immutable outputs to `https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se`; exact-SHA, domain, CORS, Cognito and Apple association checks passed. It performed no AWS mutation. Previous deployed release `33774429052` / `7d5ca45` remains the rollback candidate; no rollback or rebuild was performed. [Detailed evidence and remaining handset acceptance](docs/gh-367-combo-contents.md).

### Issue #361 Completed-Booking Recovery (Published; No AWS Resource Change)

Reviewed [PR #368](https://github.com/wrlds-creations/jumpyard-check-in/pull/368) merged `7d5ca45e003bb2ec9030572059be439bfbeba0e2`. Successful immutable [release 33774429052](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33774429052), artifact `9901144866`, passed protected [Park 33775277602](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33775277602) and [public 33775819505](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33775819505) after review of each exact artifact/target plan and delegated approval under Love's #361 publication instruction. The phone distinguishes unavailable completed bookings from unresolved payments and retains guarded new-booking actions. #350/#338/#333/#334 and the previous #351/#361 behavior are retained.

Current/release templates were identical (`70b058da41cfb971574065376c3b7f562a2653907dea7a4ef1e6b81530b9b28c`), with 202 resources and zero changes; CDK reported no changes. Migration apply was disabled, with migrations through `0020` already applied. Ordinary template, successful stack state, `IN_SYNC` drift, zero-alarm, empty-queue, domain/CORS/Cognito/Apple Pay and exact-version checks passed. Independent Park/public readback matched four root HTML files and 44 referenced JS/CSS responses to the selected artifact. Account `376129878018`, region `eu-north-1`, existing WRLDS metadata, API, backend, schema, IAM, secrets, routes, gates and Nacka venue/date scope are unchanged. No live payment, provider setting or guest message changed.

The previously deployed release `33763734057` / `b99a41c192373e9a92491aa7c31fb5afef5939bb`, artifact `9896775164`, is the verified unexpired rollback candidate; no rollback or re-promotion occurred. #361 remains open for actual handset acceptance and the submitted Klarna recovery contract owned with #353. [Artifact hashes, verification details and acceptance boundary](docs/gh361-phone-wallet-recovery.md#completed-booking-protected-rollout--2026-09-03).

### Issue #338 Exact Payment Status (Implemented; Protected Rollout Pending)

Love approved [issue #338](https://github.com/wrlds-creations/jumpyard-check-in/issues/338) on 2026-09-03. The lookup, session and redeem handlers now share one identical exact payment-state rule: only `Paid`, `PaidInFull` and `NoPaymentRequired` count as paid, `PartiallyPaid`, `PendingPayment` and `Unpaid` never match as paid by substring, and a missing amount owing is not evidence of payment. The lookup adds `eligibility.paymentState`; a partially paid booking keeps `payment_required`, the phone shows "checkas in i kassan" and the kiosk keeps its existing staff message. Read-only Aurora readback on 2026-09-03 found 21 `PartiallyPaid` and 6 `PendingPayment` rows without an amount owing, none due today or later. The change is Lambda code only: no new AWS resource, database grant, migration, IAM, secret, route, gate, venue/date, payment authority, messaging, or multi-park boundary changed. [Implementation evidence](docs/gh-338-exact-payment-status.md).

### Issue #361 Wallet Pre-Submit Recovery (Published; No AWS Resource Change)

[PR #362](https://github.com/wrlds-creations/jumpyard-check-in/pull/362) merged `df69ecbe387c2e870bcc62adbc3d3c00563f6ca0`. Immutable [release 33755593134](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33755593134), artifact `9893479442`, passed protected [Park 33756140550](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33756140550) and [public 33756585589](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33756585589) after review of each exact artifact/target plan and delegated approval under Love's #361 deployment instruction. The phone correction adds safe retry after a proven pre-submit wallet error; the #333 backend/admin, #334 heartbeat and accepted #351 recovery/QR behavior are retained.

The Park plan had identical current/release templates (`0791f5bb04d17daa029e5cd8f9b50454c08f647a6041671b0c4fb8aff77c1a2a`), 202 resources and zero changes; CDK reported no changes. Migration apply was disabled and `0001` through `0020` were already applied. Ordinary template, stack, drift, alarm, queue, domain/CORS/Cognito/Apple Pay and exact-version checks passed. Independent Park/public readback matched all four frontend roots and 44 JS/CSS responses to the selected artifact. Account `376129878018`, region `eu-north-1`, WRLDS tags, schema, IAM, secrets, routes and runtime gates are unchanged. No live payment, provider setting or guest message changed.

The verified unexpired rollback candidate is release `33741393453` / `409aa58d4cfeab9d1e120b576724649a5d651280`, artifact `9888027527`, preserving #333 and the accepted #351 QR correction. No rollback or re-promotion occurred. #361 remains open for Love's handset acceptance; the older unresolved payment cannot be cleared by this change. [Artifact hashes, validation and acceptance boundary](docs/gh361-phone-wallet-recovery.md).

### Issue #351 Final QR New-Booking Correction (Published; No AWS Resource Change)

[PR #358](https://github.com/wrlds-creations/jumpyard-check-in/pull/358) merged `409aa58d4cfeab9d1e120b576724649a5d651280`. After the separate #333 Park/public rollout completed, immutable [release 33741393453](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33741393453), artifact `9888027527`, passed protected [Park 33742197982](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33742197982) and [public 33742546868](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33742546868). Both plans and the exact artifact were reviewed before delegated approval under Love's #351 deployment instruction. The correction fixes explicit new-booking navigation from the successful QR screen and retains the deployed #333 RedeemHandler/admin behavior.

Current/release templates were identical (`0791f5bb04d17daa029e5cd8f9b50454c08f647a6041671b0c4fb8aff77c1a2a`), with 202 resources and zero changes. CDK reported no changes; migration apply was disabled, with migrations through `0020` already applied. Ordinary template, stack, drift, alarm, queue, domain/CORS/Cognito/Apple Pay and exact-version checks passed. Independent readback matched all four frontend roots and 44 JS/CSS responses to the selected artifact. Account `376129878018`, region `eu-north-1`, WRLDS tags, schema, IAM, secrets, routes and runtime gates remain unchanged. No live transaction or provider setting changed. Previous release `33740994168` remains available for rollback but retains the QR-reset defect; no rollback or re-promotion occurred. [Detailed evidence and manual acceptance](docs/gh-351-phone-payment-recovery.md).

### Issue #333 Resumable Staff Redeem (Published; Retained by #351)

Love approved [issue #333](https://github.com/wrlds-creations/jumpyard-check-in/issues/333) on 2026-09-03. The Redeem handler now writes one atomic local receipt (tickets, idempotency key, session completion) immediately after Roller accepts a redemption, resumes a retry from that receipt or from Roller's per-ticket redemption state, and reports a live concurrent attempt as `redeem_in_progress`; the staff app uses one stable idempotency key per session. The only infrastructure change is the existing `RedeemHandler` timeout from the 10 s default to 25 s in `infra/lib/jumpyard-cloud-stack.ts`, below the API Gateway ceiling. No new AWS resource, database grant, migration, IAM, secret, route, gate, venue/date, payment authority, messaging, or multi-park boundary changed; the least-privilege validator confirms the redeem runtime role needs no additional grant. Its owner completed release `33740994168` / `77faea7`, protected Park `33741484703` and public `33741950790` with recorded LoveWRLDS approvals before the later #351 correction. [Implementation evidence](docs/gh-333-staff-redeem-recovery.md); [rollout coordination and retained baseline](docs/gh-351-phone-payment-recovery.md#corrective-protected-rollout--2026-09-03). Verification after promotion: live `jumpyard-check-in-park-test-stack-redeem` readback showed timeout 25 s, `LastModified` 2026-09-03T09:58:06Z and state `Active`; Love's two staff check-ins at 11:19:51 and 11:19:58 UTC completed through the atomic receipt with `succeeded` keys and `redeemed`/`completed` sessions, and the Lambda log shows no error, warning or bookkeeping failure. [Verification evidence](docs/gh-333-staff-redeem-recovery.md#manual-verification).

### Issue #351 Phone Payment Recovery (Published; No AWS Resource Change)

[PR #355](https://github.com/wrlds-creations/jumpyard-check-in/pull/355) merged `9f262114f3a6e5ea31e6ccd3313472963c80a353`, retaining #331 and #334. Immutable [release 33736067939](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33736067939) produced artifact `9885940293`, digest `sha256:241c2ca14a30610d19c4527f80d7d2c287c864253b9fe1fd23105ce24a4890ee`. Protected [Park 33736643450](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33736643450) and [public 33737047547](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33737047547) promoted that same artifact after review and delegated approval under Love's explicit deployment instruction. The plan retained 202 resources with identical templates and zero changes; CDK reported no changes and migration apply was disabled. Migrations remain complete through `0020`.

Ordinary template, stack, `IN_SYNC` drift, zero-alarm, empty-queue, domain/CORS/Cognito/Apple Pay and exact-release checks passed. Independent static readback byte-matched all four Park/public phone/admin roots and their 44 referenced JS/CSS responses. Account `376129878018`, region `eu-north-1`, WRLDS tags, backend `ebc7598`, routes, IAM, schema, secrets and runtime gates are unchanged. No live transaction, provider/merchant setting or guest message was changed by rollout. The available previous release `33731059247` (`bee28ed`) remains the rollback candidate; no rollback was needed. Love's handset acceptance and the separate Klarna investigation #353 remain pending. [Detailed rollout evidence](docs/gh-351-phone-payment-recovery.md).

### Issue #334 Resilient Staff Heartbeat (Published; No AWS Resource Change)

[PR #349](https://github.com/wrlds-creations/jumpyard-check-in/pull/349) merged `bee28edcdb89a0dfc2ac5a52d95c3364a393d552`, retaining #331. Immutable [release 33731059247](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33731059247) produced artifact `9884020961`, digest `sha256:2b46d534fb7a2a63463d46b7302def9222dca63a8fed4fced73c98b7ecace2d8`. Both reviewed Park plans had identical templates, 202 resources and zero changes. First [run 33731561158](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33731561158) published the files but failed its combined final verifier while a pre-existing Roller API error alarm was active. That alarm recovered naturally; no metric, alarm or queue was altered. Protected [retry 33732205303](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33732205303) passed all ordinary template, drift, alarm, queue, migration and exact-SHA checks with the same artifact and no rebuild or gate bypass.

Protected [public run 33732520551](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33732520551) promoted that same artifact to `https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se`; domain, CORS, Cognito, Apple Pay and exact-SHA checks passed. Independent readback byte-matched all root-referenced JS/CSS on both Park and public phone/admin origins. Account `376129878018`, region `eu-north-1`, ten WRLDS tags, backend, routes, IAM, schema, secrets and runtime gates are unchanged; migrations remain complete through `0020` with apply disabled. No business write or load test was performed. The verified #331 release `33726425874` remains the rollback candidate; no rollback was needed. [Detailed tests, log investigation, failed-first-attempt evidence and manual limits](docs/gh-334-staff-heartbeat.md).

### Issue #321 Compact Phone Add-Ons (Published; No AWS Resource Change)

[PR #322](https://github.com/wrlds-creations/jumpyard-check-in/pull/322) merged the scoped compact phone/Park presentation as `b6142086e7b5d6be8222848a5be59e816b74d64f`. Immutable [release 33144446818](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144446818) produced artifact `9675268479`, digest `sha256:c139a0617d980600ea7ec0bb3091bad996b69aa30215254fed77c67b0edafe09`. Protected [Park run 33144666359](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144666359) passed a reviewed identical-template plan: 202 resources, zero resource or template-section changes. CDK reported `no changes`; migration apply was disabled and migrations remain complete through `0020`. Exact-template, successful stack status, `IN_SYNC`, zero-alarm, empty-queue and exact-SHA Pages verification passed. Account `376129878018`, region `eu-north-1`, WRLDS metadata, resources, routes, IAM, secrets, gates, schema and the #312/#315 backend are unchanged.

Protected [public run 33144851459](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144851459) promoted the same immutable phone and unchanged admin outputs on 2026-08-28. Public domain, CORS, Cognito and Apple Pay checks passed; this workflow performs no AWS mutation. Independent readback byte-matched all 11 root-referenced app assets plus the warning icon on both Park and `https://checkin.jumpyard.se`. No real booking, payment, refund, redemption, ROLLER write or guest message was performed. Previous public artifact `9650194100` remains a verified, unexpired frontend-only rollback candidate; no rollback was necessary or executed. [Detailed evidence](docs/gh-321-compact-phone-addons.md).

### Issue #318 Mobile Add-On Choices (Published; No AWS Resource Change)

[PR #319](https://github.com/wrlds-creations/jumpyard-check-in/pull/319) merged the scoped phone/Park UI as `d2283aaa59211a8425c98add95337ceae3c88c3e`. Immutable [release 33081106676](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33081106676) produced artifact `9650194100`, digest `sha256:a9d6820b929dfa79792eab0a7e2bae277da5c13ede04fdb1ddfbff6a0cd860f9`. Protected [Park run 33081517580](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33081517580) reviewed identical current/release templates, 202 resources and zero resource or section changes. CDK reported `no changes`; migrations remained complete through `0020` with apply disabled. Post-deploy exact-template, `UPDATE_COMPLETE`, `IN_SYNC`, zero-alarm, empty-queue and exact-SHA frontend checks passed. Account, region, WRLDS tags, runtime gates, routes, IAM, secrets, schema and the deployed #312/#315 backend remain unchanged.

The same immutable frontend outputs passed protected [public run 33081923334](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33081923334) and are live at `https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se`; admin source was unchanged. The public workflow performs no AWS mutation. Domain/CORS/Cognito/Apple Pay checks passed, and an independent readback byte-matched 11 app assets plus the warning icon on both Park and public phone against the release. No real booking, payment, refund, redemption, guest message or ROLLER catalog write was performed. The existing frontend-only rollback artifact remains available; no rollback was needed or executed. [Detailed evidence](docs/gh-318-phone-addon-choices.md).

### Issue #315 Exact Live Water Offer (Deployed)

[PR #316](https://github.com/wrlds-creations/jumpyard-check-in/pull/316) merged the approved water replacement as `ebc7598cbebe70e52fc7724b65617fde73c5e9e9`. Immutable release [33073309846](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33073309846) produced artifact `9646859303`, digest `sha256:189f65bda5f42d2eb32992c41a0fb9c120616a46da5f6ced939791fe97663c65`. Protected deployment [33073712214](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33073712214) succeeded on 2026-08-27 after the visible read-only plan and delegated approval for Love's scoped rollout request.

Target identity and WRLDS tags were confirmed: account `376129878018`, `eu-north-1`, `jumpyard-check-in-park-test-stack`, Client/CostCenter `JumpYard`, Project `jumpyard-check-in`, Environment `park-test`, Owner/CreatedBy `love`, Repository `wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, DataClassification `confidential`, Exportable `true`. The 202-to-202-resource plan changed only `BookingHandler5D1461BB`; no resources or template sections were added/removed. No schema, IAM, route, secret, schedule, runtime gate or venue/date change was made. Migrations remained complete through `0020` with apply disabled.

Post-deploy verification passed exact template equality, `UPDATE_COMPLETE`, `IN_SYNC` drift, zero Park alarms, empty related queues, exact same-SHA Park verification phone/admin outputs and HTTP/config checks. Public phone/admin and kiosk frontend releases were not promoted. Their existing clients consume the shared new water mapping. A bounded Live availability read returned only JumpYard Vatten `970411`/`970363` at 20 SEK, a read-only two-unit quote returned 40 SEK, and a retired-SKU quote returned HTTP 400 before provider work. The existing fresh 24-hour cache was retained. No real booking, payment, refund, redemption, guest message or ROLLER catalog edit was performed.

The previously successful compatible release `32833988322` (`ec60eaa`, artifact `9557991482`) remains available for the same protected rollback path. No rollback was needed or performed for #315. [Detailed evidence](docs/gh-315-water-product.md); physical terminal/Handoff verification remains in kiosk #69.

### Issue #312 Provisional Kiosk Safety Marker (Deployed; Supervised P400 Proof Pending)

Love approved [issue #312](https://github.com/wrlds-creations/jumpyard-check-in/issues/312) after a paid kiosk purchase incorrectly fell back to ordinary booking lookup and displayed a disabled booking summary while ROLLER synchronization was still pending. Implementation PR [#313](https://github.com/wrlds-creations/jumpyard-check-in/pull/313) merged as `ec60eaae0bef0d7ed973e797de67578dcefa088e`. A definitively approved new-booking terminal payment now returns the one provisional JumpYard Cloud session immediately with `guestResumeStep=safety`; repeated status recovery repairs and returns that same bounded marker. The kiosk does not wait for the 51-to-70-second ROLLER readback, while redemption remains blocked until authoritative booking synchronization and tickets are confirmed.

Immutable release run [32833988322](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32833988322) built and validated that exact merge commit. Protected Park run [32834381643](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32834381643) verified account `376129878018`, region `eu-north-1`, and a 202-to-202-resource plan with no additions or removals and only `BookingHandler5D1461BB` changed. Migrations were disabled and remained complete through `0020`. The exact assembly reached `UPDATE_COMPLETE`; selected and deployed templates matched, drift was `IN_SYNC`, zero Park alarms were in `ALARM`, related queues were empty, and exact phone/admin outputs returned HTTP `200` with the Park API target. No schema, route, IAM authority, secret, runtime gate, venue/date scope, ROLLER business mutation, payment, redemption, refund, or guest message was created by rollout verification. Physical acceptance remains in kiosk issue [#61](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/61).

### Issue #305 Cross-Device Safety Resume (Deployed; Supervised Physical Proof Pending)

Love approved [issue #305](https://github.com/wrlds-creations/jumpyard-check-in/issues/305) and the protected rollout checkpoint on 2026-08-24 after both a phone-originated and kiosk-originated paid flow reached safety, closed, and later returned to booking/add-ons when the same ROLLER confirmation QR was scanned. Implementation PR [#306](https://github.com/wrlds-creations/jumpyard-check-in/pull/306) merged as `a1507676a72542b5c224a820db8b5abb41402b42`. The existing guest link and access tokens still identify and authorize the same session; the active session may now additionally store only the bounded `guestResumeStep=safety` hint. Ready, completed, redeemed, expired, and blocked state remains authoritative, arbitrary routes are rejected, and recording the hint does not complete safety or make the session redeemable.

Immutable release run [32738019120](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32738019120) produced the exact Park artifact. Protected Park run [32738465477](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32738465477) verified account `376129878018`, region `eu-north-1`, and a 202-to-202-resource plan with no additions or removals and only `SessionHandler3CE835D7` changed. No migration was requested or applied; migrations remained complete through `0020`. CloudFormation reached `UPDATE_COMPLETE`, selected and deployed templates matched, drift was `IN_SYNC`, zero Park alarms were in `ALARM`, and related queues were empty.

The same immutable phone output was promoted first to the Park verification project and then through protected public run [32738931583](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32738931583) to `https://checkin.jumpyard.se`. Park and public phone roots returned HTTP `200`; their bundles contained the bounded resume contract and exact Park API target and excluded the dev API target. The frontend-only public promotion mutated no AWS resource. Rollout verification created no booking, payment, ROLLER write, redemption, refund, guest message, secret, route, runtime gate, venue/date scope, or Handoff transition. Supervised physical acceptance remains in kiosk issue [#57](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/57).

### Issue #300 Guest Resume With Paid Linked Add-Ons (Deployed; Supervised Kiosk Rescan Pending)

Love approved [issue #300](https://github.com/wrlds-creations/jumpyard-check-in/issues/300) and its protected promotion checkpoint on 2026-08-24 after Handoff correctly retained a terminal-paid coffee but a fully restarted kiosk showed only the original 60-minute booking when the original QR was scanned again. Implementation PR [#301](https://github.com/wrlds-creations/jumpyard-check-in/pull/301) merged as `3e1899aeec718e2a7a02be89e79bda660f847f6c`. A guest session response requested with `includeBooking=true` now composes the original booking with only approved/reconciled linked add-ons. Payment-approved provisional items remain visible while ROLLER readback is pending and are replaced without duplication by authoritative linked items. Unapproved states and internal link, draft, payment, terminal, device, credential, and PII fields remain excluded.

Immutable release run [32726906347](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32726906347) produced artifact `park-test-release-3e1899aeec718e2a7a02be89e79bda660f847f6c`, id `9520019703`, digest `sha256:ddaaad4329b16498db3ca2f8c81249ec44ac088e3c2f53f3684c151354e94c18`. Protected Park run [32727410550](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32727410550) reviewed a 202-to-202-resource plan with no additions or removals and changed only `SessionHandler3CE835D7`; parameters, outputs, rules, conditions, mappings, migrations, runtime gates, routes, IAM authority, secrets, schedules, venue/date boundaries, and multi-park scope were unchanged.

The exact selected assembly deployed, `SessionHandler` and the stack reached `UPDATE_COMPLETE`, the deployed template matched the release, drift was `IN_SYNC`, all Park alarms were `OK`, all queues were empty, and migrations remained applied through `0020`. Immutable phone/admin outputs are `https://7b259923.jumpyard-check-in-park-test.pages.dev` and `https://127f5221.jumpyard-checkin-admin-park-test.pages.dev`. Rollout validation created no booking, payment, redemption, refund, guest message, or ROLLER business mutation. The remaining checkpoint is the supervised original-QR rescan proof in kiosk issue [#48](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/48).

### Issue #294 Daily Product Cache And Booking Sync (Deployed And Live-Verified; Historical Alarm Evaluation Pending)

Love approved [issue #294](https://github.com/wrlds-creations/jumpyard-check-in/issues/294) on 2026-08-24 after the kiosk displayed a 339 kr review total but correctly requested 343 kr from the terminal. ROLLER's current product catalog proves JumpSocks `970338` costs 4,900 cents; the guest list had retained a 4,500-cent hard-coded fallback. Implementation PR [#295](https://github.com/wrlds-creations/jumpyard-check-in/pull/295) merged as `3a93c6a958854a953d0054ed10d2496dc6955311`. The scheduled product catalog now commits in its own transaction before the booking snapshot, stable ROLLER booking-item ids update their existing Aurora row without replacing referenced local keys, and guest stock add-ons omit themselves rather than inventing a price when the current 24-hour cache is absent or expired. The existing one-per-day central catalog fetch and checkout-time authoritative quote remain; no additional per-screen ROLLER product request was added.

Immutable release run [32715103894](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32715103894) produced artifact `park-test-release-3a93c6a958854a953d0054ed10d2496dc6955311`, id `9515727221`, digest `sha256:c779c4641e2f2cb9ad0abddf53c85faf14c26fcaa3a3554c07d44e3c19b160f2`. Protected Park run [32715739172](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32715739172) reviewed a 202-to-202-resource plan changing only `BookingHandler5D1461BB` and `DataSyncHandler2BB2FACC`, with no added/removed resources, parameters, outputs, rules, conditions, mappings, or migrations. The exact assembly deployed and CloudFormation reached `UPDATE_COMPLETE`.

An explicitly approved manual invocation of the existing `eventbridge.daily` path then completed in 450,811 ms with `status=succeeded`: 512 product rows committed independently, 2,024 retained booking items, 1,407 payments, 1,334 tickets, and 19 customer rows were upserted, and 22,650 item enrichments completed. The receipt reported zero skipped booking items and no duplicate-key failure. This is the first successful proof of the formerly failing nightly path since the 2026-08-18 incident window; it performed the already approved Live/Nacka provider reads and Aurora cache writes but no booking creation, payment, redemption, or guest message.

The first public readback exposed one remaining mapping defect: current cache rows for socks, lock, and coffee were present but the guest query still selected their older public ids, so only the water bottle was listed. Follow-up PR [#297](https://github.com/wrlds-creations/jumpyard-check-in/pull/297) merged as `80ffb5e288bd3cb1f3ef56a16c3f4df35083b479` and resolves those existing cached rows through the approved Live product ids without adding provider requests. Immutable release run [32718610270](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32718610270) produced artifact `park-test-release-80ffb5e288bd3cb1f3ef56a16c3f4df35083b479`, id `9517008515`, digest `sha256:6de612ab1c45c623e1e22f796669f7e68782e928aea0ff0aecd1010c68e2e435`. Protected Park run [32719040785](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32719040785) reviewed a 202-to-202-resource plan changing only `BookingHandler5D1461BB`; migrations stayed disabled. It deployed the exact assembly, reached CloudFormation `UPDATE_COMPLETE`, and published immutable phone/admin outputs at `https://b327fbbd.jumpyard-check-in-park-test.pages.dev` and `https://e5699fe5.jumpyard-checkin-admin-park-test.pages.dev`.

Post-deploy public availability readback returned all four stock add-ons directly from the current cache: socks 49 kr (`970338`), water bottle 49 kr (`1324123`), lock 45 kr (`970334`), and coffee 35 kr (`970352`). Both protected deploy workflows stopped at the global zero-alarm assertion after their deployment steps succeeded. Independent readback found exactly one active alarm, the historical `jumpyard-check-in-park-test-booking-index-stale` alarm last changed to `ALARM` on 2026-08-19. The successful manual sync emitted a new `BookingIndexSyncSuccess=1` datapoint at 2026-08-24 12:28 Europe/Stockholm; the six-hour/five-period alarm had not yet reevaluated that open period at closeout and was not reset or suppressed. No AWS resource, schema, migration, IAM authority, secret, route, schedule, queue, alarm definition, venue/date gate, payment authority, messaging gate, or multi-park boundary changed.

### Issue #289 Approved Linked Add-Ons in Handoff (Deployed And Physically Verified)

Love approved [issue #289](https://github.com/wrlds-creations/jumpyard-check-in/issues/289) on 2026-08-20 so staff can see definitively approved existing-booking kiosk add-ons while their separate linked ROLLER booking is still synchronizing. Implementation PR [#290](https://github.com/wrlds-creations/jumpyard-check-in/pull/290) merged as `c16cd32cccb4a5ab2b49964553fb39d007c429a0`. The existing Handoff session now keeps its original authoritative items and temporarily adds only payment-approved linked add-ons, remains pending or needs-staff and non-redeemable until authoritative synchronization, then replaces provisional rows without duplicates. It creates no second guest session or Handoff code, and unapproved drafts remain hidden.

Immutable release run [32388022682](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32388022682) produced artifact `park-test-release-c16cd32cccb4a5ab2b49964553fb39d007c429a0`, id `9413870863`, digest `sha256:ae7361979cd021df6c8f4ae859e1b7d07ab096f592ce03dc081af024959983dd`. The protected plan kept 202 resources, added/removed none, and changed only the existing `BookingHandler5D1461BB` and `SessionHandler3CE835D7`; parameters, outputs, rules, conditions, and mappings were unchanged. No route, schema, migration, secret, schedule, queue, alarm, IAM authority, venue/date boundary, messaging gate, or multi-park boundary changed. Migrations stayed disabled and complete through `0020`.

Protected Park run [32388576328](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32388576328) deployed the exact selected assembly, reached CloudFormation `UPDATE_COMPLETE`, and published immutable phone/admin outputs at `https://17a3f781.jumpyard-check-in-park-test.pages.dev` and `https://25a0aac6.jumpyard-checkin-admin-park-test.pages.dev`. Stable and immutable phone/admin origins each returned HTTP 200. A safe synthetic add-product request returned `idempotency_key_required` before any provider or booking mutation. The combined verifier stopped after deployment in its drift/alarm section without identifying the failed assertion; the independently pre-existing `jumpyard-check-in-park-test-booking-index-stale` alarm is the leading explanation but was not reset or suppressed. No real payment or ROLLER business write was performed by rollout validation.

A supervised 2026-08-24 test then proved one original 60-minute entry and one terminal-paid water bottle appeared immediately in the same Handoff session, redemption stayed disabled while pending, and only one payment and one copy of each item existed. ROLLER created the linked booking, but the Handoff summary stayed pending even after the authoritative linked item arrived. Follow-up PR [#292](https://github.com/wrlds-creations/jumpyard-check-in/pull/292) merged as `dbbec16bd76f02205de856c58fc9382c9cd24971`; authenticated Session queue/detail reads now atomically repair that stale operational flag only when the venue-matched linked booking is settled and has authoritative item rows. Incomplete groups remain fail-closed, and Redeem received no new database authority.

Immutable release run [32705582319](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32705582319) produced artifact `park-test-release-dbbec16bd76f02205de856c58fc9382c9cd24971`, id `9512258772`, digest `sha256:ade1e67bd0798113f73d3829d8b9e927b238af9e8efbf33bc827c7fe36252010`. The reviewed protected plan kept 202 resources, added/removed none, and changed only `SessionHandler3CE835D7`; parameters, outputs, rules, conditions, and mappings were unchanged, and migrations stayed disabled.

Protected Park run [32706052571](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32706052571) deployed the exact assembly, completed CloudFormation, and published immutable phone/admin outputs at `https://0ce4b407.jumpyard-check-in-park-test.pages.dev` and `https://f2ccaa65.jumpyard-checkin-admin-park-test.pages.dev`. Stable phone, admin, and staff origins returned HTTP 200. The combined verifier later exited inside its silent AWS/Cloudflare verification block; its log does not identify the failed assertion, so no specific drift or alarm cause is claimed or suppressed.

USB-assisted Motorola readback at about 10:43 Europe/Stockholm showed the same queue row ready and the detail API at HTTP 200 with `bookingSyncStatus=confirmed`, one authoritative original item, one authoritative `linked_add_on` water bottle, payment `Paid`, no syncing message, no duplicate, and enabled `Slutför`. The detail was not completed, so no redemption was performed. No customer, booking, payment, Handoff, staff, terminal, or device identifier is retained in this evidence.

### Issue #285 Existing-Booking Kiosk Terminal Add-Ons (Deployed; Supervised Physical Proof Pending)

Love approved [issue #285](https://github.com/wrlds-creations/jumpyard-check-in/issues/285) on 2026-08-20 to correct kiosk add-on checkout for a booking originally purchased on JumpYard's website. Implementation PR [#286](https://github.com/wrlds-creations/jumpyard-check-in/pull/286) merged as `31e2c54d8e0f4a140fa1a9994ddf4fcaf8309775`. Kiosk add-product drafts now resolve the configured terminal alias server-side and return a fresh card-present payment-attempt identity. Add-product finalize/status completes that operation without creating a second guest check-in or Handoff session. The phone/Park ecommerce path, booking linkage, idempotency, redemption authority, and ambiguous-result lock remain unchanged.

Immutable release run [32372219796](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32372219796) produced artifact `park-test-release-31e2c54d8e0f4a140fa1a9994ddf4fcaf8309775`, id `9407749734`, digest `sha256:5ba631b9310f57bd5508640db05ec5acd1663f6c12261b7ef595609bfb9e15f9`. The protected plan kept 202 resources, added/removed none, and changed only the existing `BookingHandler5D1461BB`; parameters, outputs, rules, conditions, and mappings were unchanged. No route, schema, migration, secret, schedule, queue, alarm, IAM authority, venue/date boundary, messaging gate, or multi-park boundary changed. Migrations stayed disabled and complete through `0020`.

Protected Park run [32372746116](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32372746116) revalidated the immutable artifact, deployed the exact CDK assembly and public outputs, and left CloudFormation `UPDATE_COMPLETE` with the Booking Lambda `Active` and its last update successful. The combined verifier then stopped on the independently pre-existing `jumpyard-check-in-park-test-booking-index-stale` alarm, whose state predates this issue; the alarm was not reset or suppressed. An independent safe negative request reached the deployed add-product contract and returned `idempotency_key_required` before any provider or booking mutation. No real payment or ROLLER business write was performed by rollout validation. The issue remains open for Love's supervised kiosk/terminal water-bottle proof.

### Issue #282 Late Kiosk Handoff Attachment (Deployed And Manually Verified; Independent Alarm Remains)

Love approved [issue #282](https://github.com/wrlds-creations/jumpyard-check-in/issues/282) on 2026-08-20 as the urgent backend correction ahead of kiosk issue #46. Implementation PR [#283](https://github.com/wrlds-creations/jumpyard-check-in/pull/283) merged as `57b5140f1bd0500d228ca2c51f9846a78b20d341`. Booking now owns the single authoritative mutation that attaches a paid ROLLER booking, booking reference, and tickets to the one existing provisional kiosk Handoff session and guest token. Lookup and Webhook Processor may request that mutation only after exact external-id/payment-attempt matching against one fresh Nacka booking with zero amount owing, settled status, matching date/total/environment, and non-empty tickets; ambiguity or mismatch remains `needs_staff`. This repairs confirmation that arrives after the original bounded payment worker has timed out without creating another booking, payment, session, token, or redemption.

Immutable release run [32362877976](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32362877976) produced artifact `park-test-release-57b5140f1bd0500d228ca2c51f9846a78b20d341`, id `9404314428`, digest `sha256:ad3266c0c7c3fcc5714c9e597ffe6069faa4b54e1586335e5b1367ca5be6ceca`. The protected plan kept 202 resources, added/removed none, and changed only the existing Booking, Lookup, Webhook ingress/processor Lambdas plus the two existing Lookup/Webhook Processor IAM policies needed to invoke Booking. No parameter, output, rule, condition, mapping, schema, migration, route, secret, schedule, queue, alarm, venue/date, payment authority, messaging gate, or multi-park boundary changed. Migrations stayed disabled and complete through `0020`.

Protected Park run [32363338474](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32363338474) deployed the exact assembly, reached CloudFormation `UPDATE_COMPLETE`, and left the stack `IN_SYNC` with zero drifted resources. Park phone/admin deployments are `https://0c39df46.jumpyard-check-in-park-test.pages.dev` and `https://6d222027.jumpyard-checkin-admin-park-test.pages.dev`. The combined verifier then stopped on the independently pre-existing `jumpyard-check-in-park-test-booking-index-stale` alarm, whose state dates from 2026-08-19; the alarm was not reset or suppressed.

A normal `POST /v1/check-in/lookup` for the affected existing booking returned HTTP 200 from fresh JumpYard Cloud state and invoked the new repair path. Redacted before/after readback preserved one booking, one card-present draft, and one Handoff session; draft state remained `published`/`confirmed`/`reconciled`, while that session changed from `needs_staff` with zero attached tickets to `confirmed` with exactly two attached tickets matching the two authoritative ROLLER ticket rows. USB-connected Motorola readback then showed the booking in `Redo för personal`; its detail showed `Paid`, total 240 kr, entry plus SkyRider handout, two tickets, and enabled `Slutför`. The detail was closed without pressing `Slutför`, so no redemption was performed.

### Issue #279 Kiosk Redeem Item Reconciliation (Deployed And Manually Verified; Verifier Follow-Up Pending)

Love approved [issue #279](https://github.com/wrlds-creations/jumpyard-check-in/issues/279) on 2026-08-20 as an urgent backend correction ahead of kiosk issue #46. Implementation PR [#280](https://github.com/wrlds-creations/jumpyard-check-in/pull/280) merged as `9631bf3aa4c5344254c7561c16819162b3f1f1c3`. During the mandatory final ROLLER refresh, the existing Redeem handler now reconciles a non-null provider booking-item id onto the row already owned by the same ROLLER booking, retains the persisted `jybi_*` key for ticket relationships, and fails closed if another booking owns that provider id. Items without a provider id keep their deterministic-key path. The final authoritative refresh, staff authorization, venue/date gates, payment checks, idempotency, and ROLLER redemption semantics remain unchanged.

Immutable release run [32350834677](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32350834677) produced artifact id `9399892625`, digest `sha256:fb43b5daba812fd302b0b5a3750ccd1e0fb6564b5a4f8962a86f0aadb8da60cd`. The protected Park plan kept 202 resources, added/removed none, and changed only the existing `RedeemHandler3A94EE00`; migrations stayed disabled and applied through `0020`. Protected Park run [32351230117](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32351230117) updated that Lambda and reached CloudFormation `UPDATE_COMPLETE`. Its verification rerun then showed identical current/release template hash `64df66427ea91c9d15f4ff3968af6204a7befa9b8da1558981f31473e8f5371e`, zero resource or section changes, and a no-change CDK deployment. Final immutable Park phone/admin deployments are `https://bf142b8f.jumpyard-check-in-park-test.pages.dev` and `https://a7819715.jumpyard-checkin-admin-park-test.pages.dev`.

Both deployment attempts still exited in the combined post-deploy verifier without emitting which drift/alarm/queue/Cloudflare assertion failed. The exact infrastructure deployment and Cloudflare deployment steps succeeded, and an independent external check passed HTTP/config validation for Park phone, Park admin, `/admin`, the exact Park API target, and Apple Pay association. Love then retried the previously failing kiosk-created booking through the USB-connected Motorola staff flow and confirmed redemption succeeds without `JumpYard Cloud redeem failed`. The unapproved Project draft `Diagnose silent Park post-deploy verification failure` owns the separate observability/investigation follow-up; it does not authorize suppressing a gate or mutating AWS. No AWS resource, schema, migration, IAM, secret, route, gate, venue/date, payment authority, messaging, or multi-park boundary changed.

### Issue #276 Persistent Redeem Confirmation (Deployed And Manually Verified)

Love approved [issue #276](https://github.com/wrlds-creations/jumpyard-check-in/issues/276) on 2026-08-19 to promote the presentation correction from [issue #274](https://github.com/wrlds-creations/jumpyard-check-in/issues/274) and PR [#275](https://github.com/wrlds-creations/jumpyard-check-in/pull/275). PR #275 merged as `96022c83a08f22179f06c12db9a8dae3962e4a48`; the mobile staff detail panel remains mounted while a redeem confirmation exists, so the five-second queue refresh can remove the redeemed session without dismissing the green result. The existing explicit return, scan-again, new-selection, and logout paths still clear it. No timer, dependency, backend contract, or persistent state was added.

Immutable release run [32241835729](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32241835729) produced artifact id `9361227395`, digest `sha256:2e297336f9fd73ae5360354adbee77b805fb4284e563f770e0d05ddcd80b8b2c`. The protected Park plan kept 202 resources, added/removed/changed none, and kept migrations disabled and complete through `0020`. Protected Park run [32242333784](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32242333784) passed exact selected/deployed template equality, `IN_SYNC` drift, zero alarms, empty queues, exact Cloudflare SHA, and public Park checks. Its immutable phone/admin deployments are `https://7c26229b.jumpyard-check-in-park-test.pages.dev` and `https://0441cc28.jumpyard-checkin-admin-park-test.pages.dev`.

Protected frontend-only run [32242663090](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32242663090) promoted the same immutable outputs to `checkin.jumpyard.se` and `staff-checkin.jumpyard.se` without rebuilding or mutating AWS. Immutable deployments `https://8c2c28cc.jumpyard-check-in-production.pages.dev` and `https://37f6ac98.jumpyard-checkin-admin-production.pages.dev` passed exact SHA, Git-disconnection, custom-domain, TLS, Park API, CORS, Cognito callback, staff-route, phone-route, and Apple association checks. Love then authorized a USB-connected Motorola moto g55 5G proof in a fresh normal Chrome session: personal-PIN login succeeded, booking `JY6259` appeared automatically from an empty queue, redemption succeeded, and the green confirmation remained visible for 15 seconds while the refreshed queue was already empty. `Tillbaka till kön` then cleared the confirmation and returned to the empty queue without logging out. No AWS resource, schema, migration, IAM, secret, route, gate, venue/date, payment authority, kiosk, messaging, or multi-park boundary changed.

### Issue #272 Redeem-Loop Correction (Deployed And Manually Verified)

Love approved [issue #272](https://github.com/wrlds-creations/jumpyard-check-in/issues/272) on 2026-08-19 to promote the correction from [issue #270](https://github.com/wrlds-creations/jumpyard-check-in/issues/270) and PR [#271](https://github.com/wrlds-creations/jumpyard-check-in/pull/271). PR #271 merged as `39930191c0c104566650667a05dd380d3ca27f07`; the Redeem handler now resolves the authenticated ROLLER venue when booking detail omits `venueId`, and the staff frontend clears a PIN session only for explicit authentication/session failures rather than every redeem error.

Immutable release run [32226856610](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32226856610) produced artifact id `9355931698`, digest `sha256:b908ba468be580b88c7f38163fc13784f41ed24a91add367335c17754a893191`. The protected Park plan kept 202 resources, added/removed none, and changed only the existing `RedeemHandler3A94EE00`; migrations remained disabled and complete through `0020`. Protected Park run [32227246989](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32227246989) passed `UPDATE_COMPLETE`, exact selected/deployed template equality, `IN_SYNC` drift, zero alarms, empty queues, exact Cloudflare SHA, and public Park checks. Its immutable phone/admin deployments are `https://0f29868c.jumpyard-check-in-park-test.pages.dev` and `https://477af1e9.jumpyard-checkin-admin-park-test.pages.dev`.

Protected frontend-only run [32227590881](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32227590881) promoted the same immutable phone/admin outputs to `checkin.jumpyard.se` and `staff-checkin.jumpyard.se` without rebuilding or mutating AWS. Immutable deployments `https://2fe2cf2f.jumpyard-check-in-production.pages.dev` and `https://27d05c61.jumpyard-checkin-admin-production.pages.dev` passed exact SHA, Git-disconnection, custom-domain, TLS, Park API, CORS, Cognito callback, staff-route, phone-route, and Apple association checks. Browser verification loaded both public flows without console warnings or errors. Love then completed a real public purchase, personal-PIN staff login, and one successful redemption without the prior logout/retry loop. The success view appeared but advanced automatically before Love acted; that separate presentation defect is outside #272 and requires its own Issue. No AWS resource, schema, migration, IAM, secret, route, gate, venue/date, payment authority, kiosk, messaging, or multi-park boundary changed.

### Issue #264 Nacka Pilot-Production Role (Deployed; Manual And Rollback Evidence Pending)

Love approved [issue #264](https://github.com/wrlds-creations/jumpyard-check-in/issues/264) on 2026-08-18: the existing technically named `park-test` environment is the sharp backend for the single-park Nacka pilot. The technical AWS identity remains account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, resource prefix and secret namespace `jumpyard-check-in-park-test`, `WRLDS:Environment=park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, `ManagedBy=cdk`, data classification `confidential`, exportable `true`, and `WRLDS:CostCenter=JumpYard`. Roller remains Live/Nacka venue `50871`.

Issue #264 created no second AWS backend, renamed no resource, changed no tag, and copied no operational data. Implementation PR [#268](https://github.com/wrlds-creations/jumpyard-check-in/pull/268) merged as `fc8e1c4cf1d42f25790dbcc817cdc9be483ca5f0`. Immutable release run [32145647163](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32145647163) produced artifact id `9327831112`, digest `sha256:cb4bada0d550085bd06b32b1054e80cc3f59a3db6307437b00bc5446a83f8a77`. The reviewed Park plan kept 202 resources, added/removed none, and changed only the existing Cognito app client and API Gateway CORS contract. Migrations remained disabled and complete through `0020`.

Protected Park run [32146182366](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32146182366) deployed the exact assembly and frontends; its final verifier correctly stopped on the pre-existing `jumpyard-check-in-park-test-roller-api-errors` alarm after an earlier transient ROLLER 409/404 publication sequence. No alarm was reset or suppressed. It returned naturally to `OK`, after which same-artifact re-promotion run [32146904664](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32146904664) passed `UPDATE_COMPLETE`, selected/deployed template equality, `IN_SYNC` drift, zero alarms, empty queues, migrations through `0020`, and exact Cloudflare commit readback. Its Park phone/admin deployments are `b2d938e3` and `d022214c`.

Protected frontend-only run [32147234728](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32147234728) promoted the same phone/admin outputs without rebuilding or mutating AWS to `checkin.jumpyard.se` and `staff-checkin.jumpyard.se`; deployments `a34804e0` and `835630e8` passed exact SHA, custom-domain, TLS, Park API, CORS, Cognito, staff-route, and Apple association checks. Direct Git source is disconnected on all four retained Pages projects. General guest messaging, kiosk, and future multi-park topology remain outside scope. Remaining gates are a selected-release iPhone payment, credentialed admin callback/logout/read-only proof, compatible no-rebuild rollback/re-promotion, and only then deletion of the two retired dev Pages projects.

### Issue #263 Live Handoff Queue (Deployed to Park-Test; Physical Proof Pending)

Love approved implementation [issue #263](https://github.com/wrlds-creations/jumpyard-check-in/issues/263) and rollout [issue #266](https://github.com/wrlds-creations/jumpyard-check-in/issues/266) on 2026-08-18 so the authenticated Handoff queue refreshes every five seconds while visible, refreshes immediately after returning to the foreground, and shows a compact pending-sync state without replacing the full queue with a loading screen. Selected detail continues to refresh, and `Slutför` remains unavailable until the authoritative ROLLER booking and tickets exist. Implementation PR [#265](https://github.com/wrlds-creations/jumpyard-check-in/pull/265) merged as `2f23725caf66cdd34b1f330a882a415c4aab2a09`.

The approved target remained the existing park-test stack in AWS account `376129878018`, region `eu-north-1`, client `JumpYard`, project `jumpyard-check-in`, environment `park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, `ManagedBy=cdk`, data classification `confidential`, exportable `true`, and `WRLDS:CostCenter=JumpYard`. Immutable release run [32141895289](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32141895289) produced artifact `park-test-release-2f23725caf66cdd34b1f330a882a415c4aab2a09`, id `9326340226`, digest `sha256:deb36797d896f82564ff2597bf5ae8dd56964970b38fb121666d2d64254f8609`. Protected promotion run [32142323722](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32142323722) reviewed an exact 202-to-202-resource plan with no additions, removals, or changes and kept migrations disabled and already applied through `0020`.

The exact CDK and Cloudflare release verifier passed `UPDATE_COMPLETE`, selected/deployed template equality, `IN_SYNC` drift, zero alarms in `ALARM`, empty queues, migrations through `0020`, exact phone/admin commit readback, and public checks. Phone deployment `a4c9b251` and admin deployment `aefb838a` completed, and both stable Pages URLs returned HTTP 200 after promotion. No AWS resource, route, Lambda, IAM policy, database object, migration, secret, schedule, queue, alarm, payment/terminal contract, ROLLER write, guest message, or production target changed. The remaining acceptance is one physical Handoff proof that a new provisional item appears automatically within five seconds after JumpYard Cloud exposes it, pending copy stays compact, and `Slutför` becomes available only after authoritative ticket enrichment.

### Issue #254 Weekday Combo Alignment (Deployed; Independent Webhook Alarms Remain)

Love approved implementation [issue #254](https://github.com/wrlds-creations/jumpyard-check-in/issues/254) and rollout [issue #260](https://github.com/wrlds-creations/jumpyard-check-in/issues/260) on 2026-08-18 so the Nacka phone flow follows the combo that ROLLER currently publishes to guests rather than a retired product that remains privately available in Venue Manager. The approved target remained the existing park-test stack in AWS account `376129878018`, region `eu-north-1`, client `JumpYard`, project `jumpyard-check-in`, environment `park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, `ManagedBy=cdk`, data classification `confidential`, exportable `true`, and `WRLDS:CostCenter=JumpYard`.

Implementation PR [#258](https://github.com/wrlds-creations/jumpyard-check-in/pull/258) merged as `2c383cc047efd529d769f1f6547d674995c4317d`. JumpYard Cloud now maps `COMBO60` to Weekday Combo parent `1242135` and child `1242136`, requires the parent in ROLLER's public Nacka checkout catalog, rejects stale or unexpected child ids, and keeps the phone behind the server-owned integration. No AWS resource, route, IAM policy, environment gate, database object, migration, secret, schedule, alarm, venue/date boundary, ROLLER write, payment, redemption, guest message, kiosk frontend, or production target changed.

Immutable release run [32132995405](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32132995405) produced `park-test-release-2c383cc047efd529d769f1f6547d674995c4317d`, artifact id `9323000559`, digest `sha256:248a5de22a82475de9add69ce3b29174a6ef4eb3621647a174b5a097c0ba6dde`. Protected promotion run [32133387124](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32133387124) reviewed a 202-to-202-resource plan with no additions or removals and only `BookingHandler5D1461BB` changed. Migrations remained off and already applied through `0020`. The exact CDK and phone/admin Cloudflare deployment steps succeeded. Phone deployment `2059e194` and admin deployment `9299bce8` are production deployments from branch `main` and source `2c383cc`; their immutable URLs and both stable Park-test URLs returned HTTP 200 with the park-test API target.

The workflow's final verifier stopped on its zero-alarm assertion because four webhook alarms were already active and the webhook main queue/DLQ were non-empty. Those signals are the exact provisional-item duplicate-key failure owned by [issue #257](https://github.com/wrlds-creations/jumpyard-check-in/issues/257), not a Weekday Combo deployment failure. Independent readback after the run confirmed CloudFormation `UPDATE_COMPLETE`, selected/deployed template equality, drift `IN_SYNC`, and the expected Cloudflare commit. A read-only Nacka availability request for 2026-08-18 returned Weekday Combo `1242135`/`1242136` at the current ROLLER price `450` with capacity for six tested morning slots and contained none of the retired ids `1318777`-`1318780`. The stable phone bundle contains `Weekday Combo`, `Vardagar`, and the park-test API, and contains neither `ComboDeal` nor `Alla dagar`. PR #259's later source fix for #257 merged as `67e6ffa`; deploying and recovering that webhook backlog remains separately owned by #257. Kiosk UI parity and its existing Pages project are tracked in [kiosk issue #42](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/42).

### Issue #249 Provisional Kiosk Handoff (Deployed to Park-Test; Physical Proof Pending)

Love approved [issue #249](https://github.com/wrlds-creations/jumpyard-check-in/issues/249) on 2026-08-18 so a definitively approved ROLLER card-present attempt can continue to safety and an opaque JumpYard handoff while the authoritative ROLLER booking is still synchronizing. The approved target remains the existing park-test stack in AWS account `376129878018`, region `eu-north-1`, client `JumpYard`, project `jumpyard-check-in`, environment `park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, `ManagedBy=cdk`, data classification `confidential`, exportable `true`, and `WRLDS:CostCenter=JumpYard`.

The implementation changes only the existing Booking, Session, and Redeem Lambda code, the existing staff/admin frontend contract, and the existing Aurora schema. Migration `0020_provisional_kiosk_handoff.sql` grants the Booking runtime the minimum table access required to create one idempotent provisional local booking, guest token, and check-in session after durable approval. Reconciliation later attaches the authoritative ROLLER booking and ticket ids to the same session. Staff redeem remains fail-closed until `bookingSyncStatus=confirmed`; bounded exhaustion becomes `needs_staff` and never authorizes another charge.

No AWS resource, API route, Lambda, queue, schedule, database, secret, terminal configuration, credential, alarm, external endpoint, production target, or direct Adyen integration was added. Implementation PR [#251](https://github.com/wrlds-creations/jumpyard-check-in/pull/251) merged as `5bc18a03e7e4843c1606617bdf8aa94146044bd4`. Immutable release run [32113533632](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32113533632) produced artifact `park-test-release-5bc18a03e7e4843c1606617bdf8aa94146044bd4` with digest `sha256:66c96f8c30f8c5551ba391e2a1a338adca46f872463cdf33be940fc00db1ccfd`.

Protected promotion run [32114023750](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32114023750) applied migration `0020` and deployed the exact selected release. Its reviewed plan kept 202 resources with no additions or removals. Property-level preflight found runtime changes only to the existing Booking, Session, and Redeem Lambda code plus the issue #233 cost-tag source correction. Final verification passed exact selected/deployed template equality, `UPDATE_COMPLETE`, `IN_SYNC` drift, zero alarms in `ALARM`, empty park-test queues, migrations applied through `0020`, exact phone/admin Cloudflare commit readback, and public HTTP/config checks. The remaining checkpoint is one supervised physical P400 proof through kiosk issue [#40](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/40).

### Issue #239 Kiosk Payment Reconciliation (Initial Rollout Deployed; Latency Correction Pending)

Love approved [issue #239](https://github.com/wrlds-creations/jumpyard-check-in/issues/239) on 2026-08-17 after the supervised P400 proof showed that a definitive card-present approval can arrive before ROLLER exposes the paid booking. The approved boundary is the existing park-test stack in AWS account `376129878018`, region `eu-north-1`, client `JumpYard`, project `jumpyard-check-in`, environment `park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, `ManagedBy=cdk`, data classification `confidential`, exportable `true`, and live `WRLDS:CostCenter=JumpYard` under the existing issue #233 exception.

The implementation changes only the existing Booking, Lookup, and Webhook Lambda code, the existing Booking Lambda timeout/IAM policy, and the existing Aurora schema. Booking records terminal approval before reconciliation, reuses `POST /v1/bookings/draft/finalize` for a minimal server-identifier status read, invokes the same Booking Lambda asynchronously, claims one bounded publish sequence, and performs bounded ROLLER readback before moving unresolved approvals to `needs_staff`. Within that sequence, only an explicit HTTP 409 permits another write for the same draft; transport ambiguity or any other response stops writes. Existing signed webhook and lookup paths can later complete the same monotonic record. Migration `0019_kiosk_payment_reconciliation.sql` adds only reconciliation status, timing, attempt-count, safe booking-reference, and publish-result columns plus one partial index to `jumpyard.prepayment_booking_drafts`.

The synthesized park-test stack remains at 27 routes. The existing Booking Lambda timeout is 120 seconds and its existing role receives `lambda:InvokeFunction` only for its exact own function ARN. No new API route, Lambda, queue, schedule, database, secret, alarm, external endpoint, production resource, or direct Adyen access is added.

Implementation PR [#242](https://github.com/wrlds-creations/jumpyard-check-in/pull/242) and IAM correction PR [#244](https://github.com/wrlds-creations/jumpyard-check-in/pull/244) are deployed from immutable release run [32027494285](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32027494285) through protected promotion run [32027926773](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32027926773). Migration `0019` is applied, CloudFormation reached `UPDATE_COMPLETE`, the Booking Lambda is `Active` with a successful last update, its exact self-invoke policy simulates as `allowed`, and no park-test alarm is in `ALARM`. The workflow's final status is red only because of the existing issue #233 `WRLDS:CostCenter` drift (`unassigned` in source versus `JumpYard` live), not the reconciliation rollout.

The first post-fix P400 trace recorded approval at `2026-08-17 12:16:24.283 UTC`, started the worker 208 ms later, received HTTP 409 from the immediate single draft-publish call, and confirmed the same booking 51.635 seconds after approval on reconciliation attempt five. The source had interpreted offsets `0, 5, 10, 15, 20, 25` seconds as sequential sleeps, producing actual checks around `0, 5, 15, 30, 50, 75` seconds. PR #245 corrected those waits to absolute five-second offsets and delayed the one provider write to 10 seconds. A subsequent physical trace still returned HTTP 409 and confirmed only after 55.470 seconds and 12 readbacks, proving that a single delayed write did not remove the ROLLER booking-visibility delay.

The next correction on the same issue retains one durable publish-sequence claim and retries the same draft at absolute offsets 10, 15, 20, 25, 30, 35, 40, and 45 seconds only when the preceding provider response is definitively HTTP 409. Success, transport ambiguity, and every other response stop provider writes; authoritative readback continues through 75 seconds. `publish_attempted_at` is claimed immediately before the first real provider call so live evidence measures the write accurately. The correction changes only existing Booking Lambda code and documentation; no resource, schema, route, IAM, secret, terminal configuration, or phone behavior changes. Protected deployment and a new supervised P400 timing proof remain pending.

### Issue #234 Retired Playground Dev Aurora Hibernation (Applied Live, IaC Pending Review)

Love approved [issue #234](https://github.com/wrlds-creations/jumpyard-check-in/issues/234) on 2026-08-11 to stop continuous Aurora compute charges for the unused Roller Playground-only `dev` environment without affecting park-test. Preflight confirmed AWS account `376129878018`, region `eu-north-1`, cluster `jumpyard-check-in-dev-aurora`, deletion protection, Aurora PostgreSQL `16.13`, and the complete live WRLDS metadata set. The live resource has `WRLDS:CostCenter=JumpYard`; that tag was preserved and is intentionally not reconciled in this issue because issue #233 owns cost-allocation-tag work.

The two existing dev EventBridge rules `jumpyard-check-in-dev-booking-time-sms-schedule` and `jumpyard-check-in-dev-data-api-daily-sync` were changed from `ENABLED` to `DISABLED`. The dev cluster's Serverless v2 configuration was changed from min `0.5`/max `2` ACU with no auto-pause to min `0`/max `2` ACU with `SecondsUntilAutoPause=300`. Deletion protection, encryption, Data API, the seven-day automated backup/PITR policy, database contents, schema, credentials, networking, and writer identity were unchanged. Auto-pause removes DB-instance compute charges while idle; storage, backup, I/O, and brief compute after an explicit Playground request can still incur small charges.

The live changes used exact AWS APIs rather than a CDK/CloudFormation deployment. A normal dev stack update was explicitly prohibited because current source synthesizes substantial unrelated changes against the live dev stack. This is intentional, documented CloudFormation drift until the issue's dev-only source settings are reviewed and later reconciled through a safe bounded stack plan. Source sets dev min `0`, max `2`, 300-second auto-pause, disables booking-time/data-sync/webhook-recovery schedules, and fails closed if park-test deviates from min `0.5`, max `2`, and continuous availability.

Immediate post-change readback confirmed both dev rules `DISABLED` and dev scaling min `0`, max `2`, auto-pause `300`. At `2026-08-11 16:15 Europe/Stockholm`, CloudWatch `ServerlessDatabaseCapacity` reported dev at `0.0` ACU and park-test at `0.5` ACU. Separate park-test readback remained `available` with min `0.5`, max `2`, no auto-pause, and all three pre-existing park-test schedules `ENABLED`; no park-test API, Lambda, EventBridge, Aurora, data, secret, or configuration was changed.
### Issue #233 JumpYard Cost Allocation (Live Tags and Cost Explorer Verified)

Love approved issue [#233](https://github.com/wrlds-creations/jumpyard-check-in/issues/233) to make JumpYard cost visible beside STIGA. On 2026-08-11, member-account inventory in `376129878018`/`eu-north-1` initially found 179 supported resources with `WRLDS:Client=JumpYard`, all ten required WRLDS tags present, and `WRLDS:CostCenter=unassigned`. The initial split was 161 `jumpyard-check-in` plus 18 `jumpyard-jumpyboard`, and 70 `dev` plus 109 `park-test`.

AWS resources changed by #233: the existing `WRLDS:CostCenter` tag only. During closeout, an independently running JumpyBoard park-test deployment completed at `2026-08-11T14:12:55.729Z`, expanded the inventory by eight taggable resources, and reintroduced `unassigned` on 14 resources from repository `wrlds-creations/jumpyard_bluetooth_hub`. After that stack returned to `UPDATE_COMPLETE`, #233 corrected those tags. Final readback is 187/187 exact `JumpYard`, zero `unassigned`: 161 check-in plus 26 JumpyBoard, and 70 dev plus 117 park-test. No resource, application code, environment variable, secret, database data, schedule, safety gate, booking/payment/redemption path, guest send, or production system was created, replaced, deleted, or opened by #233.

In the WRLDS management account `084766393094`, `WRLDS:Client`, `WRLDS:Project`, `WRLDS:Environment`, and `WRLDS:CostCenter` all changed from `Inactive` to `Active` without API errors. Historical backfill from `2026-07-01T00:00:00Z` was accepted at `2026-08-11T13:58:27Z` and returned `SUCCEEDED` at `2026-08-11T14:05:44Z`. Historical backfill preserves the value assigned during the usage period. On 2026-08-18 Cost Explorer exposed the values and proved the member-account client split plus JumpYard project, environment, and service splits. The remaining no-client spend was measured and is primarily tax plus account/shared CloudWatch usage. Later park-test releases had restored `unassigned` on the main stack and ten log groups; #233 corrected those exact 11 resources and final readback again returned 187/187 JumpYard resources with the exact `JumpYard` cost center. The runbook and verification evidence are in [docs/gh-233-cost-allocation-tags.md](docs/gh-233-cost-allocation-tags.md).

### Issue #230 Missing-Booking-Venue Lookup Correction (Deployed and Proven)

Love approved issue [#230](https://github.com/wrlds-creations/jumpyard-check-in/issues/230) after a controlled Nacka kiosk lookup showed that ROLLER Live returned valid booking detail without a venue field. Implementation PR [#231](https://github.com/wrlds-creations/jumpyard-check-in/pull/231) merged as `ae6391324fe71b8f6a8184250ee6b8c04210c80b`. The lookup handler now uses authenticated ROLLER Live `GET /venues/me` only when booking venue is absent and accepts the fallback only for exact configured venue `50871`. Explicit booking venue remains authoritative; mismatch, provider failure, malformed identity, missing configuration, and non-Live provider use remain fail-closed.

Immutable release run [31374270132](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31374270132) built the exact merge commit. Protected promotion run [31374686605](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31374686605) reviewed a 202-to-202-resource plan changing only `LookupHandler` code and CDK metadata. Migrations remained off and complete through `0018`. Final verification passed exact selected/deployed templates, `UPDATE_COMPLETE`, `IN_SYNC` drift, zero active alarms, empty queues, exact phone/admin Cloudflare release readback, and public endpoint checks. No AWS resource, route, IAM boundary, environment variable, database schema, secret, payment, booking, redemption, guest send, or production resource was created or changed beyond the existing Lambda code asset.

Post-deploy API proof returned HTTP 200 with `status=found`, `eligibility=ready`, and server-owned guest access without exposing customer data. The physical Android kiosk then found the controlled paid booking, skipped payment with zero payable additions, completed safety, and reached the ready-for-entry handoff screen. Native receipt printing remains owned by kiosk issue [#20](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/20), not this shared-backend correction.

### Issue #227 Kiosk Terminal Object Contract (Deployed, Secret Migrated, Physical Proof Pending)

Love approved issue [#227](https://github.com/wrlds-creations/jumpyard-check-in/issues/227) after a redacted, non-financial comparison proved that ROLLER Live accepts the kiosk booking-cost payload without `paymentTerminal` and rejects the otherwise identical cost payload when that terminal-only field is present. Implementation PR [#228](https://github.com/wrlds-creations/jumpyard-check-in/pull/228) merged as `b272c5f774bf7317dbeb6310370b654c89f93233`. The booking handler now derives a non-mutating cost payload without `paymentTerminal`, keeps the server-resolved opaque terminal value on the subsequent draft request, and retains fail-closed quote/draft amount and SEK verification.

Immutable release run [31200297119](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31200297119) built that exact SHA. Protected promotion run [31200740299](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31200740299) reviewed a 202-to-202-resource plan with no additions or removals and changes only to `BookingHandler5D1461BB` and `CDKMetadata`. Migrations remained off and complete through `0018`. Final verification passed exact selected/deployed template equality, `UPDATE_COMPLETE`, `IN_SYNC` drift, zero alarms in `ALARM`, empty queues, exact Cloudflare release readback, and public endpoint checks.

For that first #227 rollout, a post-deploy empty draft request returned HTTP 400 `idempotency_key_required` before database or ROLLER work. The existing server-owned `primary` terminal mapping was not changed or exposed. No ROLLER draft, booking, publish, payment, refund, redemption, terminal activation, guest send, or production change occurred. The remaining acceptance gate was one separately supervised kiosk attempt under kiosk issue [#17](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/17) to prove the deployed flow passes Booking Costs and reaches the physical terminal without duplicate drafts or charges.

ROLLER support later confirmed that Create Draft requires `paymentTerminal` to be an object containing `deviceId` and `terminalId`, not the legacy terminal-id string. PR [#236](https://github.com/wrlds-creations/jumpyard-check-in/pull/236) merged the fail-closed object contract as `506cbcb45ea20bfc1272db1e64c7bf4d35dec908`: both identifiers are required, tips are forced off, `amount` is omitted so ROLLER uses the verified booking remainder, Booking Costs still excludes the property, and provider errors redact both values.

Immutable release run [31876150698](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31876150698) built the exact merge commit. Protected promotion run [31876392673](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31876392673) reviewed a 202-to-202-resource plan with no additions or removals and changes only to `BookingHandler5D1461BB` and `CDKMetadata`; migrations remained off. The AWS CDK and Cloudflare deployment steps completed. The final verification step reported only the already known cost-center tag drift owned by issue [#233](https://github.com/wrlds-creations/jumpyard-check-in/issues/233): source expects `WRLDS:CostCenter=unassigned`, while the live resources carry `WRLDS:CostCenter=JumpYard`. This rollout did not reconcile that unrelated tag boundary. Direct readback confirmed the stack at `UPDATE_COMPLETE`, the Booking Lambda `Active` with `LastUpdateStatus=Successful`, zero park-test alarms in `ALARM`, and all four queues empty.

Before the secret mutation, the approved AWS boundary was reconfirmed as account `376129878018`, region `eu-north-1`, client `JumpYard`, project `jumpyard-check-in`, environment `park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, managed by `cdk`, data classification `confidential`, exportable `true`, and live cost center `JumpYard` under the #233 exception. After Love explicitly approved the non-secret caller identity `POS_DEVICE_001`, the existing `/jumpyard-check-in-park-test/roller/credentials` secret was migrated in place: `paymentTerminals.primary` changed from the legacy string to an object containing that `deviceId`, the preserved masked `terminalId`, `promptForTip=false`, and no `amount`. Guarded readback confirmed the new current version and every structural assertion without printing either terminal identifier. No secret resource, AWS resource, draft, booking, publish, payment, refund, redemption, physical-terminal action, guest send, or production resource was created. The remaining gate is one Love-supervised physical payment attempt; an ambiguous terminal result must be status-checked rather than retried.

### Issue #224 Shared Kiosk Terminal Backend (Deployed, Configuration Fail-Closed)

Love approved issue [#224](https://github.com/wrlds-creations/jumpyard-check-in/issues/224) to port the ROLLER card-present backend delta onto the current shared stack without regressing CJ's later runtime roles, webhook, SES/Cognito, or release controls. Implementation PR [#225](https://github.com/wrlds-creations/jumpyard-check-in/pull/225) merged as `e84df51bdb4ed5cebebebd5296b56fdf0ca675d5`. Immutable release run [31164063864](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31164063864) built that exact SHA; protected promotion run [31164423038](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31164423038) applied it with migrations enabled.

The reviewed plan moved the stack from 199 to 202 resources. It added only `POSTV1BookingsDraftFinalizeIntegration`, `POSTV1BookingsDraftFinalizeInvokePermission`, and `POSTV1BookingsDraftFinalizeRoute`; it removed nothing and changed only the existing BookingHandler, API stage, and CDK metadata. Migration `0018_kiosk_terminal_payment_attempts.sql` added card-present channel/attempt state and a partial unique attempt index to `prepayment_booking_drafts`. Final readback returned `UPDATE_COMPLETE`, 202 resources, 27 API routes, migration `0018` applied, exact selected/deployed release verification, and healthy existing Cloudflare targets. An empty finalize request returned HTTP 400 `idempotency_key_required` before database or ROLLER work.

Safe secret readback reports that neither the `paymentTerminals` map nor alias `primary` is present in `/jumpyard-check-in-park-test/roller/credentials`. The new route therefore remains fail-closed until an approved opaque ROLLER terminal value is supplied without printing or committing it. No identifier or secret was exposed or changed, and no ROLLER draft, booking, publish, payment, refund, redemption, physical-terminal operation, guest send, production change, removal, or replacement occurred.

### Issue #220 Controlled `checkin.jumpyard.se` Test Alias (Deployed, Automated and Manual Proof Complete)

Love approved issue [#220](https://github.com/wrlds-creations/jumpyard-check-in/issues/220) to serve the selected immutable park-test phone artifact at `https://checkin.jumpyard.se` for a controlled iPhone Apple Pay test. The existing Cloudflare project/domain is external and reused. No AWS resource was created, replaced, or deleted; production AWS/API/database/secrets/data remain absent.

Immutable release run [30832695522](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30832695522) supplied protected park-test promotion run [30833080999](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30833080999). Its reviewed 199-to-199-resource plan added and removed nothing and changed only the existing API Gateway CORS property. Readback confirmed exact allow-origin headers for `https://checkin.jumpyard.se` plus the existing park-test phone, admin, and kiosk origins; `https://unapproved.example` received no allow-origin header. Every repository park-test profile carries the same four-origin list so a later scoped profile promotion does not accidentally remove the alias.

The first protected Cloudflare run [30833724481](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30833724481) published the selected phone output but its immediate public check raced Cloudflare propagation and observed a transient HTTP 522. Twelve consecutive follow-up probes returned HTTP 200. PR [#222](https://github.com/wrlds-creations/jumpyard-check-in/pull/222) added a bounded two-minute propagation retry without weakening the exact API or Apple-file assertions. Immutable release run [30834669772](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30834669772) produced commit `9ffe379e6deb13da509114e70665b56bcaeb471a`; protected Cloudflare-only re-promotion run [30835107405](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30835107405) then completed successfully. It used no AWS identity and made no Roller write or guest send.

Final automated proof returned HTTP 200 for the public root and 9,094-byte Apple Pay association file, exact association SHA-256 `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`, the exact park-test API target `ij4rnaui2b`, and the exact selected Cloudflare commit SHA. The in-app browser displayed `JumpYard Connected Entry` with the booking and entry choices. Email/SMS links remain on the park-test Pages origin, `guestMessagingSendsEnabled=false`, and the T0201 hash-only control remains disarmed. Rollback selects an earlier immutable park-test release to remove the new CORS origin and fail the alias closed; Cloudflare rollback/re-promotion selects an earlier immutable artifact without rebuilding.

On 2026-08-17, Love separately reported that the exact custom origin loaded payment options and completed the controlled iPhone Apple Pay payment successfully. This closes the manual proof without changing the controlled alias's AWS, Cloudflare configuration, CORS, application runtime, or selected release artifact, and without Codex or deployment automation submitting a financial transaction. The alias remains park-test-backed and is not a production cutover.

### Issue #216 T0201 Controlled T-30 Email (Deployed, Proven, and Disarmed)

Love approved issue [#216](https://github.com/wrlds-creations/jumpyard-check-in/issues/216) for one automatic park-test email tied to one separately agreed Roller Live booking, start time, and retained booking email. PR #217 added the five-minute email-only EventBridge rule plus invoke permission, conditional session-to-lookup final Roller Live read, restricted session SES permission, hash-only single-booking control, and deterministic safety coverage. Its first controlled run selected the exact Aurora candidate and confirmed identifier, schedule, active state, and settled payment, but sent nothing because Roller booking detail omitted every venue field. The control was disarmed with zero delivery rows, failed sends, queued messages, or active alarms.

PR [#218](https://github.com/wrlds-creations/jumpyard-check-in/pull/218) corrected the venue proof without weakening the Nacka boundary: every controlled refresh now requires the same credentials to live-confirm Nacka `50871` through `/venues/me`; an optional venue field in booking detail must also match when present. Immutable release run [30811646770](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30811646770) produced commit `8cb73b3a569758de82cae1f7599eb86afb2c8883`. Protected promotion run [30812035906](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30812035906) reviewed a 199-to-199-resource plan that changed only `LookupHandler`, applied no migrations, and completed with exact template equality, `UPDATE_COMPLETE`, drift `IN_SYNC`, zero active alarms, empty queues, exact Cloudflare release readback, complete migrations through `0017`, and healthy public endpoints. No rollback or re-promotion was required.

For the successful proof, Love separately confirmed one exact Nacka booking, 15:00 Europe/Stockholm start, and retained booking recipient. Hash-only Aurora preflight returned exactly one fresh, active, settled venue-`50871` match. The 14:26 scheduler run correctly produced zero sends before the allowed boundary. The 14:31 run created exactly one non-dry-run Aurora email-delivery row with status `sent`, masked destination, and provider-message-id presence. The bounded SES window reported exactly `Send=1`, `Delivery=1`, and zero `Bounce`, `Complaint`, `Reject`, or `RenderingFailure`; Love confirmed receipt and approved the rendering.

The existing `/jumpyard-check-in-park-test/checkin-links/dev-token` control was disarmed before the next schedule. Safe readback confirmed `enabled=false`, empty approval/booking/start/recipient fields, zero active alarms, and empty queues. The deployed controlled profile leaves the five-minute rule, restricted SES permission, and configuration-set sending enabled, but `guestMessagingSendsEnabled=false` and the control tuple is absent, so the application cannot send another guest email. No raw booking identifier, recipient, token, or secret appears in repository evidence. No Roller booking/payment/redemption write, SMS, production change, or new resource occurred during the proof.

The steady controlled posture introduces no new paid secret and up to 288 short scheduler invocations per day; measured cost remains a follow-up before broader rollout. `checkin.jumpyard.se`, Apple Pay/payment-domain validation, production, and broad booking delivery remain outside #216. Love requested a separate time-bounded Nacka rollout Project draft whose exact start, end, audience, origin, release plan, monitoring, and stop behavior must be approved before conversion to an implementation/release issue.

### Issue #212 Deployed Webhook Reconciliation Repair

Love approved issue [#212](https://github.com/wrlds-creations/jumpyard-check-in/issues/212) to preserve legitimate signed Roller booking-level `amountOwing`, bound automatic webhook recovery, and reconcile the exact existing failed-event/DLQ backlog in park-test. Implementation PR [#213](https://github.com/wrlds-creations/jumpyard-check-in/pull/213) merged as `f1743f1734d27bfaae7b4c0674a1587ad2d230f5`. Migration `0017` removed only the obsolete nonnegative constraint from `jumpyard.roller_bookings.amount_owing_cents`; payment refund/credit semantics, daily booking-index behavior, least-privilege roles, retention, and venue/date boundaries were unchanged. Recovery now selects only rows below five enrichment attempts, remains explicitly replayable after repair, and emits `WebhookRetryExhausted` when the limit is reached. One alarm, `jumpyard-check-in-park-test-webhook-retry-exhausted`, was added, taking the stack from 196 to 197 resources.

Immutable release run [30763166954](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30763166954) supplied the first protected promotion run [30763549295](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30763549295). Its reviewed plan added only the retry-exhausted alarm, and its write stages applied migration `0017`, deployed the exact 197-resource CDK assembly, and deployed both exact Cloudflare outputs. Final verification exposed one declarative API Gateway `$default` stage mismatch: `LogGroup.Arn` synthesized a trailing `:*`, while API Gateway stores the same access-log destination without that suffix. PR [#214](https://github.com/wrlds-creations/jumpyard-check-in/pull/214) merged the canonical ARN synthesis and regression guard as `0aec9f8e6452692f18d920a093b6801a09b26708`. Immutable release run [30765157585](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30765157585) was then re-promoted by protected run [30765356271](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30765356271) with migrations off. The approved plan kept 197 resources, added and removed none, and changed only `DefaultStage`. Final readback passed with `UPDATE_COMPLETE`, drift `IN_SYNC`, zero alarms in `ALARM`, empty park-test queues, migrations applied through `0017`, exact Cloudflare commit readback, and public phone, admin, admin-route, and Apple Pay association HTTP 200 checks. No rollback run was needed.

The exact recovery processed both known high-attempt failed events and preserved the authoritative signed value `amount_owing_cents = -371600` for their one affected booking snapshot. All five DLQ messages were classified against five already processed event rows before guarded redrive; unknown messages were zero and exactly 5/5 messages moved. The main queue and DLQ ended at zero visible and zero in flight, no `received`, `pending_enrichment`, or `failed` database rows remained, all alarms returned to `OK`, and a new safe synthetic signal processed successfully with event-id hash `cb703ca664c2d117`. Roller webhook `1465` remains enabled only for booking `Created`, `Updated`, and `Cancelled` plus tickets at the existing endpoint. Guest messaging remained disabled, and no email/SMS, Roller business write, production change, secret mutation/output, raw payload output, arbitrary purge, or unmasked PII occurred.

### Issue #208 Deployed T0200 Email Sender Readiness (Controlled Proof Delivered)

Love approved issue [#208](https://github.com/wrlds-creations/jumpyard-check-in/issues/208) for the email-only Sprint 3 sender path. A 2026-07-17 read-only AWS console preflight confirmed account `376129878018`, region `eu-north-1`, SES sandbox quota `200/day` and `1/second`, account health `HEALTHY`, only verified identity `love@wrlds.com`, zero configuration sets, and enabled account-level suppression for bounce and complaint with zero suppressed destinations. No AWS resource, account setting, email, DNS record, or production-access request was changed by that preflight.

PR [#209](https://github.com/wrlds-creations/jumpyard-check-in/pull/209) merged as `f74239e5f3640850ce2e34a01f4e53e1ecc314c1`. Immutable release run [29568860560](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/29568860560) was promoted by protected deployment run [29569173836](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/29569173836) with migrations off. The reviewed plan added nine resources and removed none, taking the stack from 187 to 196 resources. Post-deploy verification proved exact selected/deployed templates, `UPDATE_COMPLETE`, drift `IN_SYNC`, zero alarms in `ALARM`, empty queues, migrations complete through `0016`, and exact Cloudflare commit readback.

The deployed resources are one Easy-DKIM `jumpyard.se` domain identity, one fail-closed `jumpyard-check-in-park-test-email` configuration set, one CloudWatch event destination, and six bounded SES delivery/reputation alarms. The exact application sender is `JumpYard Nacka <nackaforum@jumpyard.se>` with the same Reply-To. João published the three generated CNAME pairs; the 2026-07-22 readback reports identity verified, DKIM `SUCCESS`, production access enabled, `50,000/day`, and `14/second`.

Love explicitly approved the original two-address visual-client proof and, on 2026-08-02, one additional Gmail-only proof of the final single-CTA design. Guarded operator `scripts/send-t0200-controlled-email.js` revalidated account, region, sender, DKIM, production access, TLS/suppression/telemetry, recipient hashes, zero email alarms, disabled application guest sends, absent booking-time messaging rules, and denied session-Lambda SES permission. The original proof temporarily opened only configuration-set sending, SES accepted provider message ids `0110019f8a8336e8-dd8fd0e1-4870-4393-a28b-aac50769579b-000000` and `0110019f8a8341be-d407ee70-ddcb-4b4d-b901-acee3a0d896f-000000`, and the operator restored the configuration set in `finally`. The additional run used a recipient-count-specific one-message confirmation and the same fixed hash allowlist. Its wrapper exceeded the local 60-second reporting window after SES acceptance, so no provider id was retained; independent immediate readback proved configuration-set sending false and the bounded CloudWatch window reached exactly `Send=1`, `Delivery=1`, and zero `Bounce`, `Complaint`, `Reject`, or `RenderingFailure`. Cumulative T0200 controlled evidence is three sends and three deliveries with zero provider failure events. Love approved the delivered final single-CTA rendering on 2026-08-02. At #208 closeout, application guest sends were false, no booking-time messaging schedule existed, and the session Lambda lacked SES permission; issue #216 later superseded that schedule/permission posture while preserving the closed general guest-send gate. No AWS resource was created, deleted, or left changed by either T0200 proof.

### Issue #201 GitHub Deployment Access Bootstrap

Love approved issue [#201](https://github.com/wrlds-creations/jumpyard-check-in/issues/201) and the one-time local AWS bootstrap required before GitHub can own routine park-test releases. CloudFormation stack `jumpyard-check-in-park-test-github-deployment-access` reached `CREATE_COMPLETE` on `2026-07-15` with exactly four resources: two IAM roles and their two inline policies. It then reached `UPDATE_COMPLETE` when the live verifier proved that the protected deploy role needed the read-only `cloudformation:DetectStackResourceDrift` action on the exact application stack. The main-scoped plan role can only read the exact park-test application stack. The protected-environment deploy role can assume only the existing eu-north-1 CDK bootstrap roles and perform the exact migration and post-deploy readback operations documented for park-test. Both roles carry the complete WRLDS ownership, repository, environment, data-classification, exportability, and cost-center tags.

The existing account-level `token.actions.githubusercontent.com` OIDC provider was reused without modification. The pre-existing broad `dev-github-actions` role is not used. This bootstrap did not modify `jumpyard-check-in-park-test-stack`, Aurora, Lambda, API Gateway, queues, application secrets, Cloudflare, Roller, production, or user data. The post-update CDK diff for the access stack was clean.

The final release build [29420469399](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/29420469399), promotion [29420959168](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/29420959168), rollback [29421274304](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/29421274304), and re-promotion [29421631770](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/29421631770) all used the protected GitHub path. The application stack remained at 187 resources with identical selected/deployed template hashes, no planned resource or property changes, `UPDATE_COMPLETE`, and `IN_SYNC` drift. Migrations remained applied through `0016`, queues were empty, and no production, Roller, lifecycle, or user-data write was introduced. Full evidence is recorded in [docs/t0198-controlled-cicd.md](docs/t0198-controlled-cicd.md).

### Issue #199 Deployed T0197 Roller Live Webhook Reconciliation

Love approved issue [#199](https://github.com/wrlds-creations/jumpyard-check-in/issues/199), migrations `0015`-`0016`, the reviewed 16-resource park-test CDK delta, deployment, and bounded synthetic verification. The stack reached `UPDATE_COMPLETE` with 187 resources. Roller Live webhook `1465` is enabled for exactly booking `Created`, `Updated`, and `Cancelled` events with tickets included, endpoint `/v1/webhooks/roller`, and header `x-roller-apikey`. The public intake Lambda now authenticates, validates, stores idempotent metadata, and enqueues to a dedicated encrypted FIFO queue without calling Roller REST. A reserved-concurrency-one worker obtains the authoritative booking snapshot, verifies Live plus Nacka venue `50871`, applies the existing retention boundary, and updates Aurora. A five-minute recovery rule requeues stale received events, and the queue has a five-attempt FIFO DLQ plus dedicated queue-age, DLQ, processing-failure, worker-error, and worker-throttle alarms.

Deployed verification proved missing-token, malformed, oversized, and unsupported payload rejection; valid intake-to-processed flow; older-after-newer and duplicate-event idempotency with an unchanged authoritative snapshot; guarded replay; stale-event recovery; exact retry/DLQ wiring; empty main/DLQ queues; zero failed or stuck events; zero retention violations; clean post-deploy CDK diff; and CloudFormation drift `IN_SYNC` with zero drifted resources. Four early synthetic events were safely classified `ignored_scope` while the exact Roller venue proof was completed, and four later synthetic events processed successfully. No natural Roller webhook arrived during the bounded observation window, so natural delivery remains a manual operational observation rather than a release blocker. No Roller business write, guest send, secret mutation, lifecycle deletion, Cloudflare change, or production change occurred. Full evidence and recovery instructions are in [docs/t0197-webhook-reconciliation.md](docs/t0197-webhook-reconciliation.md).

### Issue #197 Deployed T0196 Live Booking Index

Love approved issue [#197](https://github.com/wrlds-creations/jumpyard-check-in/issues/197), the read-only Roller Live preflight, park-test CDK rollout, migrations `0013`-`0014`, bounded Aurora backfill, and scheduled-path smoke. The stack reached `UPDATE_COMPLETE` with 171 resources. The existing data-sync Lambda now accepts Live only for park-test, Nacka `50871`, and approval `T0196_LIVE_BOOKING_INDEX_APPROVED`; it has reserved concurrency `1`, one-request-per-second pacing, one-day provider windows, page/window caps, structured receipts, and 30-day-past plus all-future visit filtering. The existing EventBridge rule is enabled at `02:00 UTC`, and new alarm `jumpyard-check-in-park-test-booking-index-stale` is `OK`.

All 53 unique modified-date windows from `2025-07-14` through `2026-07-15` completed. Aggregate Aurora readback found 6,174 Live/Nacka bookings, 8,921 items, 6,662 tickets, 6,127 payments, and 983 guest profiles; zero bookings are older than 30 days, 92 are for the current date, 120 are future, and the maximum visit date is `2026-12-30`. Migration `0013` supplies only column-level conflict-key reads to the restricted data-sync role, and migration `0014` preserves signed Roller refunds/credits; 108 negative payment rows were verified. Webhook processing and JumpYard-owned guest sends were disabled at T0196 closeout and were enabled later only by T0197's separate reviewed scope. No Roller booking/payment/redeem/webhook write, secret mutation, production change, or lifecycle deletion occurred. Post-rollout CDK diff is clean and drift is `IN_SYNC` with zero drifted resources. Full evidence and rollback are in [docs/t0196-booking-index-morning-seed.md](docs/t0196-booking-index-morning-seed.md).

### Issue #194 Deployed Park-Test Data Lifecycle And Least-Privilege Runtime

Love approved issue [#194](https://github.com/wrlds-creations/jumpyard-check-in/issues/194) for repository implementation, then explicitly approved the 2026-07-14 snapshot, isolated restore, migration test, temporary-resource cleanup, source migration, CDK rollout, regression, and lifecycle dry-run checkpoints. The park-test source database now has migrations `0010`-`0012`, and the stack reached `UPDATE_COMPLETE` with 170 resources while preserving the Nacka `50871` full-flow dates through 2026-09-30. No lifecycle apply, PIN reset/rotation, Roller write, webhook enablement, guest send, production change, or source-data deletion occurred.

The rehearsal created encrypted manual snapshot `jy-park-test-prechange-20260714t154842z-ghunbv`, then restored the latest park-test PITR point into private cluster `jy-park-test-restore-20260714t155812z-ilzs0e-aurora` with private writer `jy-park-test-restore-20260714t155812z-ilzs0e-writer` and ingress-free security group `sg-04943ff0d41dcf891`. A first restore attempt stopped before cluster creation and left only ingress-free security group `sg-0974372d5d5e9dce2`. Both restore runs remained `TrafficEligible=false` and were never attached to an application. After Love's explicit cleanup approval, both external state files reached `stage=cleaned`; the temporary writer, restore cluster, and both security groups were deleted. Only the encrypted manual snapshot remains and incurs snapshot-storage cost.

The isolated restore first proved migrations `0010`-`0012`, all 12 repository checksums, 24 tables, unchanged aggregate data, usable version-1 local-PIN state, and future/old/unknown booking-date boundaries. The same migrations later applied to source park-test without changing its 25 bookings, 45 booking items, 59 tickets, zero guest profiles, or two staff identities. The deployed dedicated lifecycle identity completed a read-only dry-run: only 82 expired idempotency rows were eligible, a future apply would be bounded to 25, every booking/ticket/contact/staff action reported zero, and `data_lifecycle_runs` remained empty.

| Recovery resource | Service | Run id | Isolation / state | Cost / cleanup state |
| --- | --- | --- | --- | --- |
| `jy-park-test-prechange-20260714t154842z-ghunbv` | RDS cluster snapshot | `20260714t154842z-ghunbv` | Encrypted Aurora PostgreSQL 16.13 snapshot of source park-test | Snapshot storage cost; deletion not yet approved |
| `sg-0974372d5d5e9dce2` | EC2 security group | `20260714t154842z-ghunbv` | Was zero ingress; no cluster or writer was created in that failed attempt | Deleted 2026-07-14 after explicit cleanup approval |
| `jy-park-test-restore-20260714t155812z-ilzs0e-aurora` | RDS Aurora cluster | `20260714t155812z-ilzs0e` | Was encrypted, Data API enabled, isolated, and never app-attached | Deleted 2026-07-14 after explicit cleanup approval; no ongoing cluster cost |
| `jy-park-test-restore-20260714t155812z-ilzs0e-writer` | RDS DB instance | `20260714t155812z-ilzs0e` | Was private `db.serverless`, Aurora PostgreSQL 16.13 | Deleted 2026-07-14 after explicit cleanup approval; no ongoing compute cost |
| `sg-04943ff0d41dcf891` | EC2 security group | `20260714t155812z-ilzs0e` | Was exactly zero ingress and used only by the restore cluster | Deleted 2026-07-14 after explicit cleanup approval |

| Area | Confirmed deployed park-test fact | Issue #194 repository target | External-write boundary |
|---|---|---|---|
| Aurora | PostgreSQL `16.13`, encrypted, deletion-protected, Data API enabled, seven-day backup/PITR, migrations through `0012`; dry-run found only expired idempotency candidates | Bounded lifecycle runner and aggregate run evidence are deployed | Lifecycle apply remains separately gated because it deletes/anonymizes data |
| Database identities | Six handlers use distinct restricted runtime secrets/roles; the dedicated lifecycle role passed live read-only dry-run; administrator remains migration/provisioning/recovery only | Deployed target achieved | Database-role password/secret changes remain separately gated |
| IAM | Handler grants omit unused S3/SQS/EventBridge access and scope Data API/secret operations per handler; session messaging permissions remain tied to disabled guest-send gates | Deployed target achieved | Any future permission broadening requires a reviewed diff/deploy approval |
| Existing secrets | Six prior and seven new stack-managed secrets have retain-on-delete/update-replace behavior and bounded consumers; automatic provider rotation remains disabled | Deployed target achieved | No secret value was printed, rotated, promoted, or deleted during rollout |
| Staff PIN pepper | `/jumpyard-check-in-park-test/staff/auth` remains the server-only PIN pepper; migration `0012` adds the non-secret version/re-enrollment fence | Deployed target achieved without changing staff PINs | Stage, re-enrollment, fence promotion, or reset requires separate security approval |
| Logs/raw storage | Lambda/API logs and private versioned raw bucket use 30-day retention/lifecycle | Keep 30 days and prohibit application persistence of raw Roller/webhook payloads, payment JWTs, tokens, PINs, secrets, or unmasked credentials | No bucket/log resource change or object access is needed for local implementation |
| Recovery | Automated backups plus the retained encrypted snapshot above; all temporary restore compute/network resources are cleaned | Guarded restore tooling and isolated migration proof passed | A new post-provisioning restore/lifecycle apply is still needed for complete lifecycle-reapplication evidence; snapshot deletion remains separately gated |

The deployed T0195 CDK delta is exactly 16 resources above the prior 154-resource baseline: seven retained secrets at `/<prefix>/aurora/runtime/{booking,data-sync,lookup,redeem,session,webhook}` and `/<prefix>/aurora/lifecycle`; two 30-day log groups; two Lambda functions for the deployment-time role provisioner/provider; two IAM roles; two IAM policies; and one custom resource. Handler secret/IAM rewiring added no application route or gate. The dynamic temporary restore resources were not CloudFormation-managed and are deleted; the retained manual snapshot remains inventoried above.

The complete table/retention/secret/recovery inventory and operator boundaries are in [docs/t0195-data-lifecycle-policy.md](docs/t0195-data-lifecycle-policy.md), and the isolated procedure is in [docs/t0195-aurora-recovery-rehearsal.md](docs/t0195-aurora-recovery-rehearsal.md).

JumpYard Check-in dev AWS foundation is deployed, Aurora migrations through `0008` have been applied, the dev lookup endpoint uses Aurora-first booking lookup with Roller REST refresh, the dev booking endpoint reads Roller Playground availability including SkyRider as a capacity-gated add-on plus stock add-on product ids/prices from the Roller product catalog cache, quotes costs, creates Roller Playground draft bookings server-side, persists safe pre-payment draft rows, and creates separate linked add-product draft bookings for existing bookings, the dev webhook endpoint records and enriches Roller webhook intake events, the dev data-sync Lambda is scheduled by EventBridge for daily Roller Data API reconciliation, the dev redeem endpoint plans/audits redemption, supports controlled Playground redemption behind a dev token, and exposes staff-confirmed session redeem protected by T0047 staff auth, the dev session endpoint creates/resumes server-owned check-in sessions, exposes staff-auth-protected handoff list/detail routes, creates/resolves hashed check-in session links with safe booking summaries for phone resume, can dry-run or explicitly send those links through AWS SNS with safe provider/Sender ID diagnostics, can dry-run or explicitly send SES-backed check-in email links with safe audit rows through verified dev identity `love@wrlds.com`, can plan booking-time guest messages for both SMS and email from one due-booking processor, and is invoked by a dev EventBridge booking-time messaging schedule in planning mode with a config/runtime guard for future confirmed sends, SNS SMS delivery diagnostics are configured for dev, the real Roller Playground booking webhook is registered, dev API CORS uses explicit allowed origins, API Gateway stage throttling is configured for dev, CloudWatch dashboard/alarms/API access logs are deployed for dev observability, safe Roller outbound API call counters and API throttled request counters are emitted through CloudWatch, and dev Aurora contains bookingitems, product catalog cache data, tickets, customer contact data, lookup-refreshed records, webhook-enriched records, scheduled sync run rows, session rows, check-in token hashes, SMS delivery audit rows, email delivery audit rows, pre-payment draft rows, booking links, idempotency rows, event logs, and redeem attempt audit rows.

T0150 deployed the separate park-test AWS foundation stack `jumpyard-check-in-park-test-stack` in account `376129878018`, region `eu-north-1`, with API `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`, Aurora cluster `jumpyard-check-in-park-test-aurora`, and raw payload bucket `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`. T0151 applied existing SQL migrations through `0008` to the dedicated park-test Aurora database. Park-test resources and schema exist, Roller Live credentials were later populated in the park-test secret by the user, Roller Live webhook `1465` is registered, T0156 deployed API CORS for the reviewed park-test Cloudflare Pages origins, and the two park-test Cloudflare Pages projects were created through the authenticated Cloudflare Dashboard on 2026-06-23. T0158 created one controlled Roller Live draft through local guarded tooling while keeping AWS/runtime gates closed. T0159 temporarily opened only the booking draft/payment-start gate, completed one internal paid Live booking through the park-test phone PWA, then deployed the normal closed config again. T0160 temporarily opened only the exact-identifier Live lookup smoke gate for booking `166447399`, proved lookup and Aurora reconciliation, then deployed the normal closed config again. T0164 temporarily opened exact-identifier lookup and existing-booking add-on draft/payment gates for booking `166490323`, completed one paid linked add-on booking, then deployed the normal closed config again. T0165 temporarily opened only the exact linked add-on settlement lookup gate for booking `166497194`, reconciled the paid linked add-on state in Aurora, then deployed the normal closed config again. T0166 temporarily opened exact staff-auth and redeem gates for booking `166490323` and ticket `166490323-560714728`, completed one Roller Live redemption, then deployed the normal closed config again. On 2026-06-26, T0167 backend code was deployed to park-test, the payment-smoke config temporarily set `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true` plus `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true` for one controlled new-booking receipt proof, the user confirmed the Roller booking confirmation email was received, and the normal closed `park-test.json` config was redeployed again. On 2026-06-29, T0169 temporarily opened the same new-booking draft/payment gates plus `ENABLE_T0169_POST_PAYMENT_SYNC=true`, proved the park-test phone PWA could find the newly paid booking after payment and reach safety/done, then redeployed the normal closed `park-test.json` config. At T0169 closeout, webhook processing, public draft writes, broad Live lookup/sync, existing-booking add-ons, redemptions, staff auth, SMS, and JumpYard-owned email sends were inactive; the later T0176/T0192 full-flow posture supersedes that historical gate snapshot as documented below.

T0171 deployed the assisted lookup gate for single-code Nacka/date-scoped existing-booking lookup. AWS resources changed: existing `LookupHandler` Lambda code/environment only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-assisted-lookup`. Readback confirmed `ENABLE_T0171_ASSISTED_LOOKUP=true`, `T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES=2026-06-29,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-04,2026-07-05`, `T0171_ASSISTED_LOOKUP_VENUE_ID=50871`, T0160/T0165/T0169 lookup modes off, and `JUMPYARD_EMERGENCY_STOP=true`. Booking draft writes, add-on writes, redeem writes, staff auth, webhook processing, guest message sends, and exact lookup/redeem allowlists remained closed. Negative API checks rejected email-like input and rejected old booking `166490323` because it is outside the approved date window. Subsequent office lookup tests saved normalized Aurora snapshots for `166797742` and `166741849`; this was lookup snapshot persistence only, not payment/add-on/redeem/webhook work.

On 2026-06-29 after T0175, the park-test payment-sync smoke config was deployed so Love can run an iPhone Apple Pay/card checkout test. AWS resources changed: existing `BookingHandler` and `LookupHandler` Lambda environment variables only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-payment-sync-smoke`. Preflight confirmed AWS account `376129878018`, region `eu-north-1`, and CDK synth/diff for `infra/config/park-test-live-payment-sync-smoke.json`. Readback confirmed `BookingHandler` has `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true`, `ENABLE_T0162_LIVE_ADDON_SMOKE=false`, and `JUMPYARD_EMERGENCY_STOP=true`; `LookupHandler` has `ENABLE_T0169_POST_PAYMENT_SYNC=true`, `ENABLE_T0171_ASSISTED_LOOKUP=false`, T0171 date/venue values empty, T0160/T0165 lookup modes off, and `JUMPYARD_EMERGENCY_STOP=true`; `RedeemHandler` has redeem writes off; `SessionHandler` has staff auth and guest sends off; `WebhookHandler` has webhook processing off. This test mode opens only new-booking draft/payment writes plus post-payment lookup of the same locally recorded draft. Assisted existing-booking lookup is temporarily closed while this payment-sync smoke mode is deployed.

On 2026-06-29, a BookingHandler hotfix was deployed to the same payment-sync smoke mode so valid Roller Live child variations are accepted when they come from approved Nacka entry/family parent products and the selected slot's Live availability. AWS resources changed: existing `BookingHandler` Lambda code only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-payment-sync-smoke`. Readback kept booking draft/payment writes open and confirmed add-on smoke, redeem writes, staff auth, webhook processing, and guest message sends remained closed. Verification returned all 60/90/120 entry and 60/90/120 family products for `2026-06-29 13:30`, and quote smokes passed for `1189809` total `220` and family `1189818` total `660`; no draft booking was created by these smokes.

The same Apple Pay test window found the stable park-test phone Pages deployment was serving a bundle with the dev API fallback `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`, which caused browser CORS/network failures from `https://jumpyard-check-in-park-test.pages.dev` when loading availability. The phone app was rebuilt locally with `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` and direct-deployed with `npx --yes wrangler pages deploy jumpyard-checkin-phone/out --project-name jumpyard-check-in-park-test --branch main --commit-dirty=true`. Verification confirmed the stable Pages bundle now contains the park-test API URL, the Apple Pay association file still returns HTTP `200` with SHA256 `8939B5589A03BDBD9EA38686F90EF45E226F39EAC61E131E2C325FBF1A95DCD6`, and `POST /v1/bookings/availability` for `2026-06-29 13:30` returns HTTP `200` with CORS allowed for the park-test origin.

After Apple Pay was paused pending Pabel/Roller/Adyen diagnostics, the payment-sync smoke window was closed by redeploying the normal `infra/config/park-test.json` config. AWS resources changed: existing Lambda environment variables only; no new AWS resources were created. Readback confirmed `BookingHandler` has `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=false`, and `ENABLE_T0162_LIVE_ADDON_SMOKE=false`; `LookupHandler` has `ENABLE_T0169_POST_PAYMENT_SYNC=false`, `ENABLE_T0171_ASSISTED_LOOKUP=false`, and T0160/T0165 lookup modes off; `RedeemHandler` has `ENABLE_ROLLER_REDEEM_WRITES=false`; `SessionHandler` had staff auth and guest sends off; and `WebhookHandler` had webhook processing off. `JUMPYARD_EMERGENCY_STOP=true` remained set across park-test handlers.

T0176 deployed the frontend redeem rehearsal gate. AWS resources changed: existing `SessionHandler` Lambda code/environment only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-frontend-redeem-rehearsal`. The pre-deploy diff showed only `SessionHandler` code plus `ENABLE_STAFF_AUTH=false -> true`, `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=true`, and `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS=jycs_mqtimdxf_bb33c94c`. Readback confirmed `SessionHandler` has `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_STAFF_AUTH=true`, `ENABLE_T0166_LIVE_REDEEM_SMOKE=false`, `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=true`, T0176 allowed session id `jycs_mqtimdxf_bb33c94c`, and guest message sends off. `RedeemHandler` stayed closed with `ENABLE_ROLLER_REDEEM_WRITES=false` and T0166 off; `BookingHandler` stayed closed for draft/payment/add-on writes; `LookupHandler` stayed closed for T0160/T0165/T0169/T0171 lookup modes; and `WebhookHandler` stayed closed. A safe public API probe without passcode returned `staff_passcode_required`, confirming staff auth is reachable without reading or printing the staff secret.

For the T0176 manual admin rehearsal, the park-test staff auth secret `/jumpyard-check-in-park-test/staff/auth` was rotated in AWS Secrets Manager to the user-provided temporary test passcode. The secret value is not recorded in the repository. The update created a new AWSCURRENT secret version, preserved `displayName=JumpYard Staff` and `tokenTtlMinutes=720`, and a public staff-login probe confirmed authentication succeeded while printing only `tokenPresent=true`, not the bearer token. No Lambda code/env, CDK resource, Roller Live call, Aurora write, payment, redeem, webhook processing, SMS, or email change occurred.

After explicit user approval for a real assisted full-flow rehearsal, T0176 deployed `infra/config/park-test-full-flow-rehearsal.json`. AWS resources changed: existing `LookupHandler`, `BookingHandler`, `RedeemHandler`, and `SessionHandler` Lambda code/environment only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-full-flow-rehearsal`. Preflight confirmed account `376129878018`, region `eu-north-1`, and required WRLDS tags (`Client=JumpYard`, `Project=jumpyard-check-in`, `Environment=park-test`, `Owner=love`, `Repository=wrlds-creations/jumpyard-check-in`, `ManagedBy=cdk`, `DataClassification=confidential`, `Exportable=true`, `CostCenter=unassigned`, `CreatedBy=love`). The CDK diff showed only existing Lambda code/environment updates. Readback confirmed `BookingHandler` has `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true`, `ENABLE_T0162_LIVE_ADDON_SMOKE=true`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=true`, allowed dates `2026-06-29` through `2026-07-05`, venue `50871`, and `JUMPYARD_EMERGENCY_STOP=true`; `LookupHandler` has `ENABLE_T0169_POST_PAYMENT_SYNC=true`, `ENABLE_T0171_ASSISTED_LOOKUP=true`, the same allowed dates and venue, T0160/T0165 off, and emergency stop true; `RedeemHandler` has `ENABLE_ROLLER_REDEEM_WRITES=true`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=true`, the same allowed dates and venue, T0166 off, and emergency stop true; `SessionHandler` has `ENABLE_STAFF_AUTH=true`, `ENABLE_T0176_FULL_FLOW_REHEARSAL=true`, frontend-only rehearsal off, guest message sends off, and emergency stop true; `WebhookHandler` has `ENABLE_ROLLER_WEBHOOK_PROCESSING=false`. Safe smokes confirmed staff login with the temporary passcode authenticated and returned a bearer token without printing it, and a Nacka availability read returned `available` without creating a draft. This window opens real Live booking/payment/add-on/redeem paths for the scoped test; card payments are real and refunds remain manual outside the app. Close/rollback is the normal closed deploy: `npm --prefix infra run deploy:park-test`.

After PR #176 was squash-merged to `main` as `e3c5d58`, the T0176 manual feedback fix pass was deployed. Cloudflare Pages production deployments for `jumpyard-check-in-park-test` and `jumpyard-checkin-admin-park-test` read back source commit `e3c5d58`, and the deployed phone bundle contains the park-test API id `ij4rnaui2b` but not the dev API id `m0uo5g4mde`. AWS resources changed: existing `LookupHandler` Lambda code only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-full-flow-rehearsal`. The CDK diff showed only the `LookupHandler` code hash changing. CloudFormation reached `UPDATE_COMPLETE`, and readback confirmed `LookupHandler` last modified `2026-06-29T14:18:15.000+0000` with `ENABLE_T0169_POST_PAYMENT_SYNC=true`, `ENABLE_T0171_ASSISTED_LOOKUP=true`, allowed dates `2026-06-29` through `2026-07-05`, venue `50871`, and `JUMPYARD_EMERGENCY_STOP=true`. Public phone/admin Pages URLs returned HTTP `200`, lookup CORS preflight from the phone origin returned HTTP `204`, and a read-only Nacka availability smoke returned `available` without creating a draft booking.

T0177 deployed guest contact lookup to the current park-test full-flow rehearsal posture. AWS resources changed: existing `LookupHandler` Lambda code only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-full-flow-rehearsal`. Preflight confirmed account `376129878018`, region `eu-north-1`, and park-test WRLDS tags (`Client=JumpYard`, `Project=jumpyard-check-in`, `Environment=park-test`, `Owner=love`, `Repository=wrlds-creations/jumpyard-check-in`, `ManagedBy=cdk`, `DataClassification=confidential`, `Exportable=true`, `CostCenter=unassigned`, `CreatedBy=love`). CDK diff showed only `LookupHandler` code/S3Key changing. CloudFormation reached `UPDATE_COMPLETE`, and readback confirmed `LookupHandler` last modified `2026-06-30T08:57:15.000+0000` with `ENABLE_T0171_ASSISTED_LOOKUP=true`, `ENABLE_T0169_POST_PAYMENT_SYNC=true`, allowed dates `2026-06-29` through `2026-07-05`, venue `50871`, and `JUMPYARD_EMERGENCY_STOP=true`. Public negative email and phone lookup smokes for `2026-06-30` returned HTTP `404` with `booking_not_found`, not `live_lookup_not_allowed`. T0177 opened no new venue/date scope and did not enable webhooks, JumpYard-owned guest sends, broad same-day import, or new resources.

On 2026-07-07, Love asked to extend the park-test period to the end of September. AWS resources changed: existing `LookupHandler`, `BookingHandler`, and `RedeemHandler` Lambda environment variables only; no new AWS resources were created. Deploy command: `node node_modules/aws-cdk/bin/cdk deploy -c config=./config/park-test-full-flow-rehearsal.json --profile wrlds-dev --require-approval never` from `infra/`. Preflight confirmed account `376129878018`, region `eu-north-1`, and the existing park-test WRLDS tags. CDK diff showed only `T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES` on `LookupHandler` and `T0176_FULL_FLOW_ALLOWED_OPERATING_DATES` on `BookingHandler`/`RedeemHandler` changing from `2026-06-29` through `2026-07-05` to `2026-06-29` through `2026-09-30`. CloudFormation reached `UPDATE_COMPLETE`. Readback confirmed all three changed handlers have 94 approved dates including `2026-07-07` and `2026-09-30`, venue `50871`, and `JUMPYARD_EMERGENCY_STOP=true`; `SessionHandler` still has `ENABLE_GUEST_MESSAGE_SENDS=false`, and `WebhookHandler` still has `ENABLE_ROLLER_WEBHOOK_PROCESSING=false`. A public lookup smoke for booking `167441472` on `2026-07-07` returned HTTP `200` with `status=found`, confirming the previous `live_lookup_not_allowed` date gate was removed for the extended window.

T0186 deployed water bottle add-on support to the current park-test full-flow rehearsal posture. AWS resources changed: existing `BookingHandler` Lambda code only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-full-flow-rehearsal`. Pre-deploy diff showed only the `BookingHandler` code S3 key changing. CloudFormation reached `UPDATE_COMPLETE`. The phone add-on maps to existing Roller Live product `1324123` (`Jumpy Vattenflaska`) under parent `970508` (`Merchandise`) with price `49 kr`. A public availability smoke for `2026-07-07 14:00` returned `water_bottle` as available with `unitPriceCents=4900`, `requiresAvailability=false`, and the existing full-flow rehearsal gates unchanged.

T0187 deployed ComboDeal buy-entry support to the current park-test full-flow rehearsal posture. AWS resources changed: existing `BookingHandler` Lambda code only; no new AWS resources were created. Deploy command: `npm --prefix infra run deploy:park-test-full-flow-rehearsal`. Pre-deploy diff showed only the `BookingHandler` code S3 key changing. CloudFormation reached `UPDATE_COMPLETE`. The phone booking product maps to existing Roller Live parent product `1318777` (`ComboDeal`) with child price products `1318778`, `1318779`, and `1318780`; each package counts as two jumpers. A public availability smoke for `2026-07-07 17:00` returned `COMBO60` as available with `productId=1318778`, `unitPriceCents=43000`, `jumpersPerUnit=2`, and `requiresAvailability=true`. Cloudflare Pages project `jumpyard-check-in-park-test` was rebuilt with `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` and direct-deployed with `npx --yes wrangler pages deploy jumpyard-checkin-phone/out --project-name jumpyard-check-in-park-test --branch main --commit-dirty=true`; final visual-review deployment URL `https://6d6087ef.jumpyard-check-in-park-test.pages.dev`. The stable phone URL showed ComboDeal above standard entry products with two-person, 60-minute, and pizza inclusions, red plus separators, and red offer glow. Existing full-flow rehearsal gates remained unchanged.

T0190 changed repository-only park-test gate semantics and created no AWS change at its own closeout. The normal closed source config kept `emergencyStop=true`; reviewed active source profiles used `false`, while Lambda runtime checks made `true`, missing, or invalid values an unconditional stop and required configured plus observed venue `50871`. T0192 later deployed that coherent code/config model after closing the request-item date gap. At T0190 closeout, confirmed metadata was account `376129878018`, region `eu-north-1`, environment `park-test`, client `JumpYard`, project `jumpyard-check-in`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, managed by `cdk`, data classification `confidential`, exportable `true`, and cost center `unassigned`; issue #233 later superseded that cost-center value with `JumpYard`.

T0191 recorded the existing park-test foundation as Sprint 3's sole Live-backed pre-production environment. It kept the current account, region, resource names, prefix, stack, data, frontend targets, and `WRLDS:Environment=park-test`; it did not rename, clone, deploy, or mutate anything. No parallel staging foundation is planned. T0192 later qualified these resources, T0204 will run the full rehearsal here, and a separate production environment may be created only in T0205 after T0204 GO and new explicit AWS approvals. No AWS API call, resource change, deploy, Roller action, message send, or runtime change occurred in T0191.

T0192 qualified and hardened that existing foundation. The reviewed deploy updated code/environment on the six existing Lambdas and disabled the existing `jumpyard-check-in-park-test-data-api-daily-sync` EventBridge rule; it added, removed, and replaced no resource. The running full-flow posture now uses the coherent T0190/T0192 fail-closed emergency-stop, configured-plus-observed Nacka venue, and per-request-item operating-date model. Webhook processing and JumpYard-owned guest sends remain disabled, and the Nacka `50871` window remains `2026-06-29` through `2026-09-30`. Post-deploy readback confirmed CloudFormation `UPDATE_COMPLETE`, 134 complete resources, 61 taggable resources with zero mismatch across all ten WRLDS tags, Aurora available/encrypted/deletion-protected/Data API-enabled, 17 alarms `OK`, and CloudFormation drift `IN_SYNC` with zero drifted resources. Six Secrets Manager containers were inspected by metadata only; rotation is not enabled. The stack itself has termination protection disabled. Cost Explorer does not expose `WRLDS:Environment` as an allocation tag, so environment spend cannot yet be claimed reliably; `FU-098` owns that gap. Containment rollback remains `npm --prefix infra run deploy:park-test`.

T0193 deployed layered API protection to the same foundation. AWS changes were in-place updates to existing `LookupHandler`, `BookingHandler`, `RedeemHandler`, `SessionHandler`, and `WebhookHandler` code, all 21 existing API Gateway routes, and the existing `$default` stage; no resource was added, removed, or replaced and no new persistent cost was introduced. Readback confirmed exactly six `AWS_IAM` internal/legacy routes and 15 explicit `NONE` browser/Roller routes, default stage rate/burst `50/150`, all 21 route-specific settings, 134 total resources, unchanged endpoint/tags, and CloudFormation `UPDATE_COMPLETE` at `2026-07-13T15:29:06Z`. Runtime readback preserved Nacka `50871` and dates `2026-06-29` through `2026-09-30`, with webhook processing and guest-message sends still `false`. Safe smokes proved unsigned versus signed internal isolation, guest/staff/webhook denial/disabled boundaries, payload `413`, and CORS without real booking or message writes; the post-deploy full-flow diff is clean. The matching phone build was direct-deployed to Cloudflare Pages project `jumpyard-check-in-park-test` at immutable deployment `https://c5b9d4db.jumpyard-check-in-park-test.pages.dev`; both it and the stable URL returned HTTP `200`. Production was untouched.

T0194 deployed personal staff identity to the same park-test foundation after Love approved the reviewed resource, migration, secret-rotation, administrator, cost, and rollback plan. Migration `0009_staff_identity.sql` was applied before the Lambda update. CDK added 20 resources without removal or replacement: five Cognito/JWT administrator resources and five route/integration/permission triplets. The existing `/jumpyard-check-in-park-test/staff/auth` secret was rotated in place from the shared passcode configuration to a 64-character server-only `pinPepper`; only `SessionHandler` can read it. CloudFormation reached `UPDATE_COMPLETE` with 154 resources. API readback found 26 routes: six `AWS_IAM`, four Cognito `JWT`, and sixteen Lambda-protected `NONE`; the four admin routes share JWT authorizer `nnwcuy`. Cognito pool `eu-north-1_rmaqadThL` has Essentials tier, MFA `ON`, and deletion protection active. The first named `staff_admin` registry was created and its invitation was sent; Love later completed password setup, TOTP enrollment, and `/admin` sign-in, then created an ordinary staff record whose PIN-only sign-in succeeded. The final request-stable PIN/admin build was direct-deployed to Cloudflare Pages production at immutable URL `https://391533f3.jumpyard-checkin-admin-park-test.pages.dev` and stable URL `https://jumpyard-checkin-admin-park-test.pages.dev`. All three Pages routes returned HTTP `200`, and the active public configuration matches the park-test API, PIN mode, and deployed Cognito client/domain. Malformed PIN and unauthenticated session probes failed correctly, Cognito accepted the deployed client/callback, all 17 alarms were `OK`, drift was `IN_SYNC` with zero drifted resources, and the identity rollout after-diff had no differences. Automated validation created no ordinary staff account and performed no real Roller write, production resource change, or guest message send.

Later on 2026-07-14, Love explicitly approved a narrower administrator password rule for park-test. The reviewed CDK diff changed only the existing Cognito user pool `Policies.PasswordPolicy` in place: minimum length `12 -> 8` and required symbols `true -> false`; uppercase, lowercase, number, five-password history, seven-day temporary-password validity, required TOTP, Essentials tier, and deletion protection stayed unchanged. CloudFormation returned `UPDATE_COMPLETE`; the immediate live readback matched the policy and showed the invited administrator still enabled in `FORCE_CHANGE_PASSWORD` at that time. The stack remained at 154 resources, all 17 alarms were `OK`, fresh drift detection was `IN_SYNC` with zero drifted resources, and the after-diff was clean. No resource was added, removed, replaced, or interrupted; no frontend, API, Lambda, Aurora, secret, staff-PIN, cost, data, message, or Roller behavior changed. Returning to a stricter policy is an in-place CDK update, but an already accepted shorter password would require an explicit reset because policy changes are not assumed to invalidate it retroactively.

The same-day Cognito visual follow-up changed only the existing `AWS::Cognito::ManagedLoginBranding` settings. An initial logo-inclusive update was rejected because the available 441:513 vertical logo did not meet Cognito's form-logo aspect-ratio requirement; CloudFormation completed a clean `UPDATE_ROLLBACK_COMPLETE`. The corrected no-logo update then reached `UPDATE_COMPLETE` with the stack still at 154 resources. Live readback showed `UseCognitoProvidedValues=false`, black heading/body/label/description text, JumpYard-red primary actions, links, and focus states, rounded form/inputs/buttons, and no logo asset. No user pool, app client, domain, API, Lambda, IAM, Aurora, secret, or production resource was added, removed, replaced, or interrupted. Cognito Managed Login does not expose Swedish localization or a custom font family for this flow, so the hosted page remains English in provider-owned Open Sans.

The matching Cloudflare Pages follow-ups changed no AWS resource. The application reuses the phone check-in font stack, uses solid-black normal copy and active icons, and stays inside 320, 360, and 390 CSS-pixel viewports for staff login, the authenticated queue, administrator create/reset, and callback. Its final immutable deployment is `https://391533f3.jumpyard-checkin-admin-park-test.pages.dev`; the stable URL remains `https://jumpyard-checkin-admin-park-test.pages.dev`. The final build also prevents activity-driven queue request amplification with stable session keys, a persistent activity throttle, coalesced refreshes, stale-response suppression, and fast session-transition recovery. T0194's complete account lifecycle and named-audit smoke passed; Love accepted closeout without an additional post-fix manual traffic smoke.

T0152 deployed park-test safety gates for staff auth, guest message sends, webhook processing, booking draft/payment-start writes, redeem writes, and emergency stop. Park-test Lambda environment readback confirmed `JUMPYARD_EMERGENCY_STOP=true` and the sensitive operation gates set to `false`. No Roller Live calls, secret value reads/prints, webhooks, drafts/payments, redemptions, SMS/email sends, frontend traffic, or visitor flows were performed.

T0153 added local Roller Live read-only preflight tooling and passed the first Roller Live read-only preflight for JumpYard Nacka Forum. AWS resources changed: none. The existing park-test Roller credentials secret `/jumpyard-check-in-park-test/roller/credentials` was populated by the user through AWS Console; no secret values or tokens were printed or committed. Read-only Roller Live calls confirmed auth, venue `JumpYard Nacka Forum` id `50871`, product catalog, `Entré 60 min` id `1189805`, `Entré 60 min - Familj` id `1189814`, availability reads, and payment settings visibility. No drafts/payments, redemptions, webhooks, frontend traffic, SMS, or email occurred.

T0154 added dry-run-only Live webhook planning tooling. AWS resources changed: none. The dry-run read AWS identity, CloudFormation stack output, SSM Roller env/base-url parameters, and Secrets Manager metadata for `/jumpyard-check-in-park-test/webhooks/dev-token` without reading or printing secret values. The planned endpoint is `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`, with Roller delivery header `x-roller-apikey`, booking events `Created`, `Updated`, and `Cancelled`, and `tickets=true`. No Roller Live requests, webhook registration, AWS writes, frontend traffic, payments, redemptions, SMS, or email occurred.

T0155 registered/matched Roller Live webhook `1465` for park-test. AWS resources changed: none. The script first listed existing Live webhooks, then registered or reused the exact endpoint `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings` with `x-roller-apikey`, booking events `Created`, `Updated`, and `Cancelled`, and `tickets=true`. A follow-up check found two Live webhooks total and exactly one match for the park-test endpoint. Safe intake smoke returned HTTP `200` with `ignored_disabled`, and Aurora `jumpyard.roller_webhook_events` remained at `0` rows for the smoke event before and after. Rollback endpoint is `https://api.roller.app/webhooks/1465`. No AWS writes, webhook processing enablement, frontend traffic, drafts/payments, redemptions, SMS, or email occurred.

T0156 configured the park-test frontend target. AWS resources changed: existing park-test API Gateway HTTP API CORS configuration and existing `SessionHandler` environment values `CHECKIN_EMAIL_BASE_URL`/`CHECKIN_SMS_BASE_URL` only. Deploy command: `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`. Post-deploy diff showed no differences. CORS preflight returned HTTP `204` and matching `access-control-allow-origin` for `https://jumpyard-check-in-park-test.pages.dev` on `OPTIONS /v1/check-in/lookup` and for `https://jumpyard-checkin-admin-park-test.pages.dev` on `OPTIONS /v1/staff/auth/login`. The two Cloudflare Pages projects were created later through the authenticated Cloudflare Dashboard; this did not create AWS resources or enable visitor traffic. No new AWS resources, Roller calls, Aurora writes, frontend visitor traffic, webhook processing, drafts/payments, redemptions, SMS, or email occurred.

T0157 ran the first guarded Roller Live quote/cost smoke. AWS resources changed: none. Read-only Lambda environment checks confirmed `JUMPYARD_EMERGENCY_STOP=true`, booking draft writes disabled, redeem writes disabled, staff auth disabled, guest message sends disabled, and webhook processing disabled. The local guarded smoke used the park-test secret `/jumpyard-check-in-park-test/roller/credentials` without printing secret values and called only Roller auth, `GET /product-availability`, and `POST /bookings/draft/costs`. The quote selected parent product `1189805`, child product `1189808`, date `2026-06-29`, start `10:00`, quantity `1`, and returned total `200`, tax `11.32`, fees `0`, discount `0`, amount owing `200`. No AWS deploy, AWS resource change, public API call, Aurora write, booking draft, payment, redeem, webhook processing, frontend visitor traffic, SMS, or email occurred.

T0158 ran the first guarded Roller Live draft smoke. AWS resources changed: none. The local guarded smoke used the park-test secret `/jumpyard-check-in-park-test/roller/credentials` without printing secret values and called only Roller auth, `GET /product-availability`, `POST /bookings/draft/costs`, and `POST /bookings/draft`. It selected parent product `1189805`, child product `1189808`, date `2026-06-29`, start `10:00`, quantity `1`, quoted total `200`, tax `11.32`, fees `0`, discount `0`, amount owing `200`, and created Roller draft unique id `f81e46e5-5cf7-4193-b578-44a1b8140599` with `paymentJwtPresent=true`; no booking reference was returned. Read-only Lambda environment checks confirmed park-test emergency stop stayed `true`, booking draft writes disabled, redeem writes disabled, staff auth disabled, guest message sends disabled, and webhook processing disabled. Read-only Aurora row-count checks returned `0` rows for `prepayment_booking_drafts`, `event_log`, `idempotency_records`, and `roller_webhook_events`. No AWS deploy, AWS resource change, public API call, Aurora write, payment start, draft publish, redeem, webhook processing, frontend visitor traffic, SMS, email, secret print, or raw payment JWT print occurred.

T0159 ran the first internal paid Roller Live payment smoke through the park-test phone PWA. AWS resources changed: existing `BookingHandler` Lambda code/environment only; no new AWS resources were created. Opening deploy used `npx cdk deploy -c config=./config/park-test-live-payment-smoke.json --profile wrlds-dev --require-approval never` and temporarily set `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true` plus `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true` while keeping `JUMPYARD_EMERGENCY_STOP=true`. Availability and quote through the public park-test API returned HTTP `200` for Live product `1189808`, total `200`, and no booking write during quote. The user completed one real internal payment; read-only Roller Live verification returned booking reference `166447399`, unique id `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e`, status `Paid`, total `200`, amount owing `0`, and one item. Aurora contains safe prepayment draft `jypd_56a8f1ca817c42a4b7` without raw payment JWT storage. Phone post-payment sync failed because lookup Lambda still blocks Roller Live; T0160 owns that gate. Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; readback confirmed booking draft writes and the T0159 override are `false`, emergency stop remains `true`, redeem writes are `false`, and webhook processing is `false`. Refund/cancel remains manual outside the app.

T0160 ran the first controlled Roller Live existing-booking lookup smoke through the park-test API. AWS resources changed: existing `LookupHandler` Lambda code/environment only; no new AWS resources were created. Opening deploy used `npx cdk deploy -c config=./config/park-test-live-lookup-smoke.json --profile wrlds-dev --require-approval never` and temporarily set `ENABLE_T0160_LIVE_LOOKUP_SMOKE=true` plus `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS=166447399,68b3bbb4-9a46-4379-96ac-bc7157f2fb3e` while keeping `JUMPYARD_EMERGENCY_STOP=true`. API lookup for booking reference `166447399` returned the paid Live booking, date `2026-06-24`, start `12:00`, total `200`, amount owing `0`, one item, one ticket, and eligibility `ready`; lookup by unique id then returned from Aurora. A non-allowlisted id returned `live_lookup_not_allowed`. Aurora contains the safe normalized Live booking snapshot and prepayment draft `jypd_56a8f1ca817c42a4b7` is now `published`; one `prepayment_draft.published` event was recorded. Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; readback confirmed `ENABLE_T0160_LIVE_LOOKUP_SMOKE=false`, allowlist empty, emergency stop `true`, and closed-gate lookup returns `live_lookup_disabled`. No bookings, payments, refunds, redemptions, webhooks, SMS, email, broad booking export, secret prints, raw payment JWT prints, public PII output, or new AWS resources were created.

T0161 ran guarded Roller Live catalog/index readiness. AWS resources changed: none. The local read-only tooling used existing park-test SSM/Secrets Manager config without printing secret values and called only Roller auth, `GET /venues/me`, `GET /products`, and `GET /product-availability`. It confirmed Nacka venue `50871`, 100 top-level products, 506 flattened product rows, entry parents `1189805`, `1189823`, `1189771`, `1189814`, `1189832`, and `1189794`, plus add-ons SkyRider parent `970335`, socks `970338`, lock `970334`, and coffee `970352`. T0161 chose REST-on-demand lookup by guest-entered booking code for the first assisted park test instead of broad same-day import. No AWS deploy/resource change, Aurora write, booking/Data API/customer/guest/ticket/payment read, draft/payment/refund/redeem/webhook, public API gate opening, visitor traffic, SMS, email, secret print, raw payment JWT print, or public PII output occurred.

T0162 opened and then closed a scoped existing-booking add-on smoke gate for booking `166490323`. AWS resources changed: existing `LookupHandler` and `BookingHandler` Lambda code/environment only; no new AWS resources were created. Opening deploy used `npx cdk deploy -c config=./config/park-test-live-addon-smoke.json --require-approval never` with short-lived SSO role credentials and temporarily set `ENABLE_T0160_LIVE_LOOKUP_SMOKE=true`, `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS=166490323`, `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, `ENABLE_T0162_LIVE_ADDON_SMOKE=true`, and `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS=166490323` while keeping `JUMPYARD_EMERGENCY_STOP=true`, T0159 payment smoke off, redeem off, webhook processing off, staff auth off, SMS off, and email off. Public API lookup for `166490323` returned `found` and stored one safe normalized booking snapshot. Public API availability for 2026-06-25 11:00 returned Live add-ons SkyRider `970336`, socks `970338`, lock `970334`, and coffee `970352`. Add-product quote for one socks add-on failed closed with `original_booking_contact_unresolved` because no reusable original customer email/phone was available from Roller detail, local prepayment draft state, or `guest_profiles`. No add-on draft, payment session, booking link, add-product event, redemption, webhook processing, SMS, email, secret print, raw payment JWT print, or public PII output occurred. Closing deploy used `npx cdk deploy -c config=./config/park-test.json --require-approval never`; readback confirmed lookup/add-on/draft gates closed again and closed-gate API calls returned `live_lookup_disabled` and `live_addon_smoke_disabled`.

T0163 resolved the T0162 contact blocker with a read-only Live investigation and closed-gate code deploy. AWS resources changed: existing `BookingHandler` Lambda code only; no new AWS resources were created and no Lambda environment gates changed. The guarded tool called only Roller auth, `GET /bookings/166490323`, and `GET /guests/{customerId}` without printing secrets or full PII; it found direct booking detail had no contact but guest detail contained complete first/last/email/phone. Deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; post-deploy readback confirmed `JUMPYARD_EMERGENCY_STOP=true`, draft writes `false`, T0159 `false`, T0162 `false`, and the T0162 allowlist empty. Post-deploy diff showed no differences. No Aurora writes, draft/payment/redeem/webhook processing, SMS, email, public gate opening, or visitor traffic occurred.

T0164 opened and then closed the controlled existing-booking add-on payment smoke gate for booking `166490323`. AWS resources changed: existing `LookupHandler` and `BookingHandler` Lambda environment only; no new AWS resources were created. Opening deploy used `npx cdk deploy -c config=./config/park-test-live-addon-smoke.json --profile wrlds-dev --require-approval never` and temporarily set `ENABLE_T0160_LIVE_LOOKUP_SMOKE=true`, `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS=166490323`, `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, `ENABLE_T0162_LIVE_ADDON_SMOKE=true`, and `T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS=166490323` while keeping `JUMPYARD_EMERGENCY_STOP=true`, T0159 internal payment smoke off, redeem off, webhook processing off, staff auth off, SMS off, and email off. Safe preflight API lookup for `166490323` returned `found`, `Paid`, amount owing `0`, and add-product quote for one socks add-on returned total/amount owing `45` with `wroteBooking=false`. The user completed one phone frontend add-on payment; direct read-only Roller Live verification returned linked add-on booking `166497194`, status `Paid`, total `45`, amount owing `0`, one item, and one ticket. Aurora stored safe prepayment draft `jypd_8bdb1d1035b84d30b2` and booking link `jyl_f35c09033efb40ba94`, but local state remained `payment_pending` because linked add-on settlement reconciliation is not yet scoped. Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; readback confirmed lookup/add-on/draft gates closed again, and closed-gate API checks returned `live_lookup_disabled` and `live_addon_smoke_disabled`.

T0165 opened and then closed the scoped linked add-on settlement reconciliation gate for booking `166497194`. AWS resources changed: existing `LookupHandler` Lambda code/environment and existing `WebhookHandler` code only; no new AWS resources were created. Opening deploy used `npx cdk deploy -c config=./config/park-test-live-addon-settlement-smoke.json --profile wrlds-dev --require-approval never` and temporarily set `ENABLE_T0165_LINKED_ADDON_SETTLEMENT=true` plus `T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS=166497194,4a092241-6947-436a-97ea-04813a8404aa` while keeping `JUMPYARD_EMERGENCY_STOP=true`, T0160 lookup smoke off, booking draft writes off, T0159 payment smoke off, T0162 add-on smoke off, redeem off, webhook processing off, staff auth off, SMS off, and email off. Public API lookup for `166497194` returned the paid linked add-on booking from Roller Live and reconciled Aurora: prepayment draft `jypd_8bdb1d1035b84d30b2` is `published`, amount owing `0`, booking link `jyl_f35c09033efb40ba94` has linked booking reference `166497194` and status `published`, and `prepayment_draft.published` plus `booking_link.published` events exist. Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; readback confirmed lookup/add-on/draft/webhook gates closed again, closed-gate lookup returned `live_lookup_disabled`, closed-gate add-product quote returned `live_addon_smoke_disabled`, and `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.

T0166 opened and then closed the controlled Live redeem smoke gate for booking `166490323`. AWS resources changed: existing `LookupHandler`, `SessionHandler`, and `RedeemHandler` Lambda code/environment only; no new AWS resources were created. Opening deploy used `npx cdk deploy -c config=./config/park-test-live-redeem-smoke.json --profile wrlds-dev --require-approval never` and temporarily set `ENABLE_T0160_LIVE_LOOKUP_SMOKE=true`, exact lookup allowlist `166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088`, `ENABLE_STAFF_AUTH=true`, `ENABLE_ROLLER_REDEEM_WRITES=true`, `ENABLE_T0166_LIVE_REDEEM_SMOKE=true`, and `T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS=166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088,166490323-560714728` while keeping `JUMPYARD_EMERGENCY_STOP=true`, booking draft/add-on/payment-start gates off, webhook processing off, SMS off, and email off. The phone/admin flow looked up booking `166490323`, started session `jycs_mqtimdxf_bb33c94c`, marked it ready for staff, and staff redeem called Roller Live `POST /redemptions`; Roller returned HTTP `200`, Aurora marks the session `redeemed`, handoff `completed`, ticket `166490323-560714728` `redeemed`, and redeem attempt `redeem_attempt:701798...` `redeemed` with `roller_response_ref='roller_redemptions:http_200'`. Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; readback confirmed lookup/staff/redeem gates closed again, closed-gate lookup returned `live_lookup_disabled`, closed-gate staff auth returned `staff_auth_disabled`, and `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.

T0058 production-readiness audit notes:

- AWS resources changed: none.
- Read-only AWS validation confirmed stack `jumpyard-check-in-dev-stack` status `UPDATE_COMPLETE`, API `m0uo5g4mde`, Aurora cluster `jumpyard-check-in-dev-aurora` status `available`, and SNS SMS sandbox status `IsInSandbox=true`.
- At T0058 audit time, `aws cloudwatch describe-alarms --alarm-name-prefix jumpyard-check-in-dev` returned no CloudWatch alarms; T0060 later added the first dev alarms.
- At T0058 audit time, API Gateway routes had `AuthorizationType=NONE` and wildcard CORS. T0060 later replaced dev wildcard CORS with explicit origins, and T0193 later implemented the explicit 21-route IAM/application protection catalog in source plus deployed it to park-test.
- Dev is appropriate for Playground development and smoke testing; expanded park-test pre-production and future production use must wait for the readiness gates in `PROJECT_CONTEXT.md`, `DECISIONS.md`, and `FOLLOWUPS.md`.

T0087 staff/admin Cloudflare readiness notes:

- AWS resources changed: existing API Gateway HTTP API CORS configuration only.
- Confirmed Cloudflare Pages project: `jumpyard-checkin-admin`.
- Confirmed public admin origin: `https://jumpyard-checkin-admin.pages.dev`.
- Local validation: `npm --prefix infra run synth:dev` passed with the source CORS config that includes the admin origin.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-06-02 after AWS SSO refresh; CloudFormation stack `jumpyard-check-in-dev-stack` returned `UPDATE_COMPLETE`.
- Post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- CORS verification: API preflight for `POST /v1/staff/auth/login` with origin `https://jumpyard-checkin-admin.pages.dev` returned `access-control-allow-origin: https://jumpyard-checkin-admin.pages.dev`.
- Public admin smoke: `https://jumpyard-checkin-admin.pages.dev` logged in through JumpYard Cloud, loaded the ready queue, opened booking `5100992`/handoff `JY9056`, completed staff redeem, returned to queue count `0`, and opened QR scanner mode.
- Secrets: Cloudflare credentials, staff passcode, and JumpYard Cloud secrets are not stored in the repository; staff auth remains server-owned through JumpYard Cloud.

T0088 real-time guest-name enrichment notes:

- AWS resources changed: existing webhook Lambda code only.
- Changed resource: `WebhookHandler`.
- Behavior: webhook enrichment still reads Roller Playground booking detail first, then uses documented read-only `GET /guests/{guestId}` only when booking detail has a customer/guest id but lacks first/last/contact data.
- Data written: existing Aurora tables only; `jumpyard.guest_profiles` may receive Roller customer id, masked/hashed email and phone, and first/last name inside `latest_booking_context`; `jumpyard.roller_bookings.normalized_summary` includes `bookingCustomerId`; `jumpyard.roller_booking_tickets.roller_customer_id` can be set.
- Safety: Lambda responses and validation output expose only status/boolean fields for guest enrichment and do not print raw names, emails, phone numbers, Roller tokens, or secrets.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-06-02; pre-deploy diff showed only `WebhookHandler` Lambda code.
- Dev smoke: safe webhook event for booking `5100965` returned `guestDetailStatus=available` and `guestNamePresent=true`; Aurora readback booleans confirmed booking customer id, guest profile, first/last context, email, and phone were present without raw PII output.

T0089 guest messaging production unlock notes:

- AWS resources changed: none.
- Read-only checks only; no AWS Support cases, sender ids, pools, phone numbers, SES identities, DNS records, CDK resources, Lambda code, EventBridge payloads, or production sends were created or changed.
- SNS SMS state: `IsInSandbox=true`, `DefaultSMSType=Transactional`, `MonthlySpendLimit=1`, delivery success sampling `100`, no `DefaultSenderID`, no SNS origination numbers.
- AWS End User Messaging SMS state: account tier `SANDBOX`, no Sender IDs, no pools, no phone numbers, one verified dev destination phone masked as `+46*****9508`.
- SES state: `ProductionAccessEnabled=false`, `SendingEnabled=true`, enforcement `HEALTHY`, sandbox quota `200/day` and `1/sec`, only verified email identity `love@wrlds.com`, and no dedicated configuration set named `jumpyard-check-in-dev-email`.
- Source-of-truth unlock document: `GUEST_MESSAGING_PRODUCTION_UNLOCK.md`.
- Safety state: dev scheduled due-message processing remains planning-only with `confirmSend=false`; controlled manual smokes remain possible only within current sandbox limitations.

T0150 park-test foundation deploy notes:

- AWS resources changed: created the separate park-test foundation stack `jumpyard-check-in-park-test-stack`.
- Deploy document: `docs/t0150-park-test-foundation-deploy.md`.
- Deploy command: `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`.
- Deploy result: CloudFormation stack `CREATE_COMPLETE`; stack ARN `arn:aws:cloudformation:eu-north-1:376129878018:stack/jumpyard-check-in-park-test-stack/159bdd20-6ae4-11f1-8f4c-069284999d99`.
- Outputs: API endpoint `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`, Aurora cluster ARN `arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora`, raw payload bucket `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`, and Roller credentials secret name `/jumpyard-check-in-park-test/roller/credentials`.
- Created park-test resource inventory includes separate API Gateway, Aurora, VPC/subnets/security group, Secrets Manager secrets, SSM parameters, S3 bucket, SQS queue/DLQ, EventBridge event bus and daily data-sync rule, Lambda handlers, CloudWatch dashboard/alarms/log groups, and IAM roles/policies.
- Park-test stack tags include all required WRLDS tags: `WRLDS:Client=JumpYard`, `WRLDS:Project=jumpyard-check-in`, `WRLDS:Environment=park-test`, `WRLDS:Owner=love`, `WRLDS:Repository=wrlds-creations/jumpyard-check-in`, `WRLDS:ManagedBy=cdk`, `WRLDS:DataClassification=confidential`, `WRLDS:Exportable=true`, `WRLDS:CostCenter=unassigned`, and `WRLDS:CreatedBy=love`.
- Pre-deploy safety fix: park-test no longer creates the account-wide SNS SMS delivery-status custom resource. Post-deploy `aws sns get-sms-attributes` still points delivery diagnostics at `arn:aws:iam::376129878018:role/jumpyard-check-in-dev-sns-sms-delivery-status`, and no park-test SMS delivery-status role exists.
- Post-deploy validation: park-test stack is `CREATE_COMPLETE`; Aurora is `available`, encrypted, deletion-protected, and Data API enabled; API CORS preflight returned HTTP `204` for `https://park-test.jumpyard.example`; dev stack remained `UPDATE_COMPLETE`; dev and park-test template diffs are clean; 17 park-test CloudWatch alarms were `OK`; Resource Groups Tagging API found 54 resources tagged `WRLDS:Environment=park-test`.
- Live/traffic gate: T0150 did not populate Roller Live credentials, call Roller Live, run migrations, register webhooks, create drafts/payments, redeem tickets, send SMS/email, connect frontend traffic, or change app behavior.
- Schedule note: `jumpyard-check-in-park-test-data-api-daily-sync` was originally created enabled at `cron(0 2 * * ? *)`. T0192 disabled it because the current sync Lambda is explicitly Playground-only; T0196 owns any approved Live backfill/morning-seed schedule. Booking-time guest messaging remains unscheduled because `bookingTimeSms.scheduleEnabled=false`.

T0151 park-test database migration notes:

- AWS resources changed: existing park-test Aurora database schema only.
- Migration document: `docs/t0151-park-test-db-migrations.md`.
- Migration command: `npx ts-node --prefer-ts-exts scripts/run-migrations.ts --config ./config/park-test.json --profile wrlds-dev` from `infra/`.
- Preflight: AWS account `376129878018`, region `eu-north-1`, park-test stack `CREATE_COMPLETE`, dev stack `UPDATE_COMPLETE`, park-test Aurora `available`, encrypted, deletion-protected, and Data API enabled.
- Before migration, park-test had `0` `jumpyard` schemas and `0` `jumpyard` tables. Dev read-only verification showed migrations `0001` through `0008` already applied, resolving the older top-level docs drift that said `0007`.
- Applied migrations in park-test: `0001 initial schema`, `0002 related data sources`, `0003 checkin sessions`, `0004 prepayment booking drafts`, `0005 add product draft links`, `0006 sms deliveries`, `0007 email deliveries`, and `0008 prepayment draft customer names`.
- Post-migration verification: park-test `jumpyard.schema_migrations` contains `0001` through `0008` with checksums matching dev; 19 `jumpyard` tables exist; `prepayment_booking_drafts` includes `customer_first_name` and `customer_last_name`; park-test Aurora remained `available`.
- Data boundary: park-test row counts remained `0` for `roller_bookings`, `guest_profiles`, `prepayment_booking_drafts`, and `roller_webhook_events`.
- Live/traffic gate: T0151 did not populate Roller Live credentials, call Roller Live, run imports, connect frontend traffic, register webhooks, create drafts/payments, redeem tickets, send SMS/email, change app behavior, or write to dev DB.

T0152 park-test secrets and gates notes:

- AWS resources changed: existing park-test Lambda code/environment only.
- Changed resources: `jumpyard-check-in-park-test-stack-booking`, `jumpyard-check-in-park-test-stack-redeem`, `jumpyard-check-in-park-test-stack-session`, `jumpyard-check-in-park-test-stack-webhook`, plus `JUMPYARD_ENVIRONMENT` and `JUMPYARD_EMERGENCY_STOP` env vars on lookup/data-sync.
- Gate defaults deployed: `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false`, `ENABLE_ROLLER_REDEEM_WRITES=false`, `ENABLE_STAFF_AUTH=false`, `ENABLE_GUEST_MESSAGE_SENDS=false`, and `ENABLE_ROLLER_WEBHOOK_PROCESSING=false`.
- Park-test secret references remain environment-scoped under `/jumpyard-check-in-park-test/...`; no secret values were printed or changed.
- Deploy command: `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never` from `infra/`.
- Deploy result: CloudFormation stack `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE` on `2026-06-22T09:06:57.672000+00:00`.
- Post-deploy validation: park-test CDK diff showed no differences; Lambda env readback confirmed all gates; safe API smokes returned `409 staff_auth_disabled` and `409 roller_booking_draft_writes_disabled`.
- Live/traffic gate: T0152 did not populate Roller Live credentials, call Roller Live, register webhooks, create drafts/payments, redeem tickets, send SMS/email, connect frontend traffic, or run visitor flows.

T0149 park-test deploy/rollback preflight notes:

- Project AWS resources changed: none.
- Park-test resources created: none.
- Runbook document: `docs/t0149-park-test-deploy-rollback-preflight.md`.
- AWS SSO profile `wrlds-dev` was refreshed and read-only identity check confirmed account `376129878018` with role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- Dev stack check: `jumpyard-check-in-dev-stack` is `UPDATE_COMPLETE` in `eu-north-1`, last updated `2026-06-09T12:36:07.525000+00:00`.
- Park-test stack check after cleanup: `jumpyard-check-in-park-test-stack` does not exist, which is expected before T0150 deploy.
- CDK preflight: `npx cdk diff -c config=./config/dev.json --profile wrlds-dev --method=template` showed no dev differences; `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed one new additive park-test stack.
- CDK handling note: a default change-set diff for the never-deployed park-test stack briefly left an empty CloudFormation stack shell in `REVIEW_IN_PROGRESS`. It had no stack resources and no change sets, was deleted in T0149, and a post-cleanup lookup confirmed the park-test stack no longer exists. Future first-stack preflight should prefer `--method=template` and run CDK commands sequentially.
- Deploy gate: T0149 is not a deploy approval. T0150 must explicitly approve AWS resource creation, reconfirm target metadata, review the park-test diff, keep dev untouched, and follow the rollback plan before running any deploy.

T0146 park-test environment contract notes:

- AWS resources changed: none.
- Park-test resources created: none.
- Contract document: `docs/t0146-park-test-environment-contract.md`.
- Planned environment name: `park-test`.
- Planned AWS target: same account as dev, `376129878018`, and same region, `eu-north-1`.
- Planned resource namespace: `jumpyard-check-in-park-test`.
- Planned stack name: `jumpyard-check-in-park-test-stack`.
- Planned separation: own API, Aurora cluster/database, Secrets Manager names, SSM parameters, SQS/DLQ, EventBridge schedules, CloudWatch logs/alarms, S3 storage, and frontend API target. No park-test resource should reuse the existing `jumpyard-check-in-dev` resources.
- Planned Roller target: Roller Live / JumpYard Nacka through JumpYard Cloud only. Frontend apps must not call Roller directly.
- Planned park-test WRLDS tags: `WRLDS:Client=JumpYard`, `WRLDS:Project=jumpyard-check-in`, `WRLDS:Environment=park-test`, `WRLDS:Owner=love`, `WRLDS:Repository=wrlds-creations/jumpyard-check-in`, `WRLDS:ManagedBy=cdk`, `WRLDS:DataClassification=confidential`, `WRLDS:Exportable=true`, `WRLDS:CostCenter=unassigned`, and `WRLDS:CreatedBy=love`.
- Deploy gate: no park-test resources may be created until a later scoped ticket explicitly approves deploy work and reconfirms account, region, environment, owner, tags, data classification, exportability, and cost center.

T0147 config guard notes:

- AWS resources changed: none.
- Park-test resources created: none.
- IaC/config validation changed: `infra/lib/config.ts` now treats `WRLDS:Environment` as the environment selector for `dev` or `park-test`.
- Dev guard: `dev` config must use Roller Playground with base URL `https://api.play.roller.app`.
- Park-test guard: `park-test` config must use account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller Live base URL `https://api.roller.app`, `WRLDS:DataClassification=confidential`, and `bookingTimeSms.confirmSend=false`.
- Validation added: `infra/scripts/validate-config-guards.ts` and `npm --prefix infra run validate:config-guards` prove dev Playground passes, unsafe dev-to-Live fails, reviewed park-test Live config passes, and missing/unsafe park-test values fail closed.
- Deploy gate: T0147 does not add `infra/config/park-test.json`, does not synthesize a park-test stack, does not deploy, and does not create or change AWS resources.

T0148 park-test CDK synth skeleton notes:

- AWS resources changed: none.
- Park-test resources created: none.
- Added config: `infra/config/park-test.json`.
- Added validation: `infra/scripts/validate-park-test-synth.ts` and `npm --prefix infra run validate:park-test-synth`.
- Synth target: stack `jumpyard-check-in-park-test-stack`, account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller Live base URL `https://api.roller.app`, and WRLDS tags from the T0146 contract.
- Placeholder CORS origins were initially `https://park-test.jumpyard.example` and `https://park-test-admin.jumpyard.example`; T0156 later replaced them with the reviewed park-test Cloudflare Pages origins.
- Park-test raw payload bucket synth name: `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`. The compact `-raw-` suffix is required because the standard `-raw-payloads-` suffix would exceed S3's 63-character bucket-name limit for this prefix.
- Dev bucket naming remains unchanged because shorter prefixes still use the existing `${resourcePrefix}-raw-payloads-${account}-${region}` pattern.
- Local validation: dev synth remains Playground and contains no park-test prefix; park-test synth uses separate Secrets Manager names, SSM parameters, API, Aurora identifiers, SQS queues, EventBridge rule names, CloudWatch dashboard/alarms, log groups, and Lambda names.
- Deploy gate: T0148 does not deploy, create credentials, call AWS, call Roller, create resources, register webhooks, create drafts/payments, redeem tickets, send SMS/email, or change app behavior. T0149/T0150 remain required before any resource creation.

T0091 gift-card checkout notes:

- AWS resources changed: existing booking Lambda code only.
- Changed resource: `BookingHandler`.
- Behavior: `POST /v1/bookings/quote` and `POST /v1/bookings/draft` now accept optional `giftCards: [{ giftCardNumber }]`, forward them to Roller Playground Booking Costs/Create Draft Booking, return safe applied/error metadata, and redact gift-card numbers from logs/errors.
- Full gift-card behavior: when Roller returns `amountOwing=0` for a gift-card-backed draft, the booking Lambda calls Roller `POST /bookings/draft/publish` and persists the local prepayment draft as `published`; if publish fails, the flow fails closed.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-06-02; pre-deploy diff showed only `BookingHandler` Lambda code and post-deploy diff showed no differences.
- Dev smoke: invalid gift-card quote returned `giftCardErrorCount=1` with `amountOwing=200`; partial gift-card quote using the masked `100 kr` fixture reduced `amountOwing` to `100`; full gift-card quote using the masked `500 kr` fixture reduced `amountOwing` to `0`.
- No-payment smoke: full gift-card draft created Roller Playground booking `5101055`, returned `amountOwing=0`, and Aurora shows the local prepayment draft as `published` with `total_cents=20000` and `amount_owing_cents=0`.
- Safety: full gift-card numbers, Roller credentials, access tokens, and payment JWT values were not printed in validation output or documentation.

T0100 Klippkort deploy and smoke notes:

- AWS resources changed: existing booking Lambda code only.
- Changed resource: `BookingHandler`.
- Deploy result: `npm.cmd --prefix infra run deploy:dev` passed on 2026-06-04 after AWS SSO refresh; pre-deploy diff showed only `BookingHandler` Lambda code and post-deploy diff showed no differences.
- Dev Klippkort smoke: baseline quote returned `amountOwing=200`; invalid code returned one safe discount-code error with `amountOwing=200`; the masked paid `10-Kort` ticket/code from booking `5101046` reduced entry-only to `amountOwing=0`; mixed entry plus JumpSocks left `amountOwing=45`; no-payment publish created Roller Playground booking `5101133`.
- Regression smoke: active masked `100 kr` gift card still applied through `giftCards`, reducing `amountOwing` from `200` to `100` without using `discountCodes`.
- Safety: raw Klippkort codes, gift-card numbers, Roller credentials, access tokens, and payment JWT values were not printed in validation output or documentation; Aurora event readback showed only counts, amounts, and booking references.

T0104 SkyRider availability deploy notes:

- AWS resources changed: existing booking Lambda code only.
- Changed resource: `BookingHandler`.
- Behavior: deployed `POST /v1/bookings/availability` now includes SkyRider availability alongside entry/family availability. SkyRider is returned as `type='addon'` and key `skyrider`, allowing the public Cloudflare phone app to show SkyRider only when Roller availability says it is available.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-06-08; pre-deploy diff showed only `BookingHandler` Lambda code.
- Dev smoke: deployed availability for `2026-06-08` and tested slots `09:00`, `09:30`, `10:00`, `10:30`, `11:00`, and `16:00` returned `addon,entry,family` product types with `skyrider` present in each slot and product id `1765443`.
- Safety: no Roller bookings, drafts, payments, redemptions, Aurora migrations, secrets, or Cloudflare configuration changed.

T0113 dynamic add-on pricing deploy notes:

- AWS resources changed: existing booking Lambda code only.
- Changed resource: `BookingHandler`.
- Behavior: deployed `POST /v1/bookings/availability` now returns stock add-ons as `type='addon'` rows with product ids and prices read from `jumpyard.product_catalog_cache`; SkyRider remains capacity-gated through Roller `GET /product-availability`.
- Deploy guard: AWS identity was account `376129878018`, region `eu-north-1`; required WRLDS metadata/tags are the confirmed T0006 dev values in this file.
- CDK diff: pre-deploy diff showed only `BookingHandler` Lambda `Code` changing; no API routes, IAM, secrets, Aurora migrations, or new resources changed.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-06-09 and CloudFormation returned `UPDATE_COMPLETE`.
- Post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- Dev smoke: `POST /v1/bookings/availability` for `2026-06-09` slot `14:30` returned add-ons `skyrider=40`, `socks=45`, `lock=45`, and `coffee=35` with product ids present.
- Safety: no Roller bookings, drafts, payments, redemptions, Aurora migrations, secrets, SMS/email sends, or Cloudflare configuration changed.

T0108 Gustav demo regression deploy notes:

- AWS resources changed: existing session Lambda code only.
- Changed resource: `SessionHandler`.
- Reason: deploy the already-reviewed T0107 staff handoff behavior so public staff/admin can show paid linked add-on booking items before the Gustav demo.
- Deploy guard: AWS identity was account `376129878018`; CDK diff showed only `SessionHandler` Lambda `Code` S3 key changing.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-06-08 and CloudFormation returned `UPDATE_COMPLETE`.
- Post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- Public smoke: phone and admin Cloudflare pages returned HTTP `200`; `POST /v1/bookings/availability` returned entry, add-on, and SkyRider rows; staff auth/list/detail returned one ready session with 5 product rows, including 4 linked add-on rows.
- Health smoke: all 17 `jumpyard-check-in-dev-*` CloudWatch alarms were `OK`; Aurora readback showed 2 recent successful seed runs and 8 recent processed webhook events.
- Safety: no Roller bookings, drafts, payments, redemptions, Aurora migrations, secrets, SMS/email sends, or Cloudflare configuration changed.

T0059 redeem eligibility notes:

- AWS resources changed: existing Lambda code only.
- Changed resources: `jumpyard-check-in-dev-stack-session` and `jumpyard-check-in-dev-stack-redeem`.
- Behavior: new sessions and final staff redeem exclude stock/add-on/retail/gift-card/fee ticket ids from Roller `POST /redemptions` while keeping pass/session/party-package/membership ticket ids.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Dev smoke: mixed booking `5063419` selected only entry tickets `5063419-21529629` and `5063419-21529630`; staff-confirmed Playground redeem succeeded for those two tickets, and add-on tickets `5063419-21529631` and `5063419-21529632` remained unredeemed in Aurora.

T0060 API security and observability notes:

- AWS resources changed: API Gateway CORS/stage settings, Lambda environment/code assets for Roller-calling handlers, CloudWatch dashboard, CloudWatch alarms, and API Gateway access log group.
- New dashboard: `jumpyard-check-in-dev-ops`.
- New log group: `/aws/apigateway/jumpyard-check-in-dev-api-access`.
- New alarms: `jumpyard-check-in-dev-api-5xx`, `jumpyard-check-in-dev-api-high-4xx`, `jumpyard-check-in-dev-roller-api-errors`, `jumpyard-check-in-dev-roller-ops-dlq-visible`, plus Lambda error/throttle alarms for lookup, booking, redeem, session, webhook, and data-sync.
- API CORS origins are now explicit: local phone/admin dev origins and `https://jumpyard-check-in.pages.dev`.
- Roller-calling Lambdas emit safe CloudWatch embedded metrics in namespace `JumpYard/Cloud`: `RollerApiCallCount` and `RollerApiErrorCount`, dimensioned by environment, handler, operation, and method. Metrics do not include secrets, access tokens, payment JWTs, raw Roller payloads, full phone numbers, or full emails.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Smoke: `POST /v1/bookings/availability` with `2026-05-28` and `10:00` returned `status=available` without creating a booking, and booking Lambda logs showed safe Roller API call metric entries for `oauth_token` and `get_product_availability`.

T0061 API protection boundary notes:

- AWS resources changed: API Gateway `$default` stage settings, CloudWatch dashboard, CloudWatch alarm, and CloudWatch Logs metric filter.
- API Gateway `$default` stage now has detailed metrics enabled plus default throttling: rate `25` requests/second and burst `50`.
- New metric filter on `/aws/apigateway/jumpyard-check-in-dev-api-access`: counts access log rows with status `429` into `JumpYard/Cloud` metric `ApiThrottledRequestCount`.
- Updated dashboard: `jumpyard-check-in-dev-ops` now includes API throttled requests in API request/error and last-5-minute widgets.
- New alarm: `jumpyard-check-in-dev-api-throttled-requests`.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Smoke: `POST /v1/bookings/availability` returned HTTP `200` after throttling was enabled, without creating a booking.

T0101 operational runbook notes:

- AWS resources changed: none.
- Read-only AWS verification on 2026-06-04 confirmed dashboard `jumpyard-check-in-dev-ops` exists.
- Read-only AWS verification confirmed 17 `jumpyard-check-in-dev-*` alarms are present and `OK`: API 5xx, high API 4xx, API throttled requests, Roller API errors, Roller ops DLQ, and Lambda errors/throttles for lookup, booking, redeem, session, webhook, and data-sync.
- Read-only AWS verification confirmed the six main Lambda log groups have 30-day retention.
- Added source-of-truth runbook `OPERATIONS_RUNBOOK.md` for Data API sync, webhook, booking quote/draft/payment, gift card/Klippkort, SMS/email, staff handoff/redeem, Aurora checks, safe first actions, and escalation routing.
- No synth, diff, deploy, or AWS mutation was required because T0101 only documents the current dev operations layer.

T0062 route auth and WAF/edge boundary notes:

- AWS resources changed: none.
- T0062 is documentation/design only; no CDK implementation, deploy, authorizer, WAF, CloudFront, custom domain, Lambda code, Aurora schema, or package dependency was changed.
- New source-of-truth file: `API_PROTECTION_BOUNDARY.md`.
- Route inventory is classified by trust boundary: guest public, guest token, guest write, staff auth entry, staff protected, internal operations, Roller webhook, and legacy/dev-only.
- Later implementation should apply route-specific limits, API-boundary staff identity, internal-only protection for operations routes, and WAF or equivalent edge controls before expanded park-test pre-production or production exposure.

T0063 guest messaging and email foundation notes:

- AWS resources changed: API Gateway route, session Lambda code/environment/IAM, and dev Aurora schema migration `0007`.
- Added route: `POST /v1/check-in/session-links/send-email`.
- Added Aurora table: `jumpyard.email_deliveries`.
- Email sends use the same `jumpyard.checkin_tokens` opaque `jy_token` model as SMS, with channel `email`.
- Dry-run email planning works without a verified SES sender and records masked/hashed destination details only.
- Confirmed email sends fail closed until `guestEmail.fromAddress` is configured with a verified SES sender/domain.
- SES account check in `eu-north-1` showed sending enabled but no email identities configured at T0063 start.
- Dev booking-time SMS remains planning-only with `confirmSend=false`; the dev check-in link base URL is now `https://jumpyard-check-in.pages.dev/`.

T0064 messaging-first roadmap notes:

- AWS resources changed: none.
- No CDK, Lambda, Aurora migration, AWS config, Roller config, secrets, or deployed resource was changed.
- Roadmap order changed only in source-of-truth docs: T0065 guest SMS completion, T0066 guest email completion, T0067 dev SES email smoke, and T0068 unified booking-time guest messaging now come before environment/cutover and broader production-readiness work.

T0065 guest SMS completion notes:

- AWS resources changed: existing session Lambda code only.
- Changed resource: `jumpyard-check-in-dev-stack-session`.
- Behavior: confirmed SMS responses now include safe `senderIdConfigured` and `senderIdRequested` diagnostics, and SMS copy includes the booking start time when Aurora has it.
- Link behavior: valid `jy_token` resolves for already-redeemed bookings now include safe booking context so the phone app can show the existing already-checked-in state instead of falling back to manual booking-code lookup.
- Dev config unchanged: scheduled booking-time SMS remains planning-only with `confirmSend=false`; SNS account remains in sandbox mode.
- Confirmed smoke: booking `5063420` sent through protected `POST /v1/check-in/session-links/send-sms` with public base URL `https://jumpyard-check-in.pages.dev/`, delivery `jysms_mppg15lj_7c660ef2`, masked destination `+46*****9508`, provider `aws_sns`, and provider message id present.
- Aurora verification: `jumpyard.sms_deliveries` row `jysms_mppg15lj_7c660ef2` has status `sent`, `dry_run=false`, provider `aws_sns`, and a provider message id.
- SNS verification: CloudWatch delivery status reported `SUCCESS` with provider response `Message has been accepted by phone.`
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28 for SMS diagnostics and again for the `jy_token` fallback fix; post-deploy `npm --prefix infra run diff:dev` showed no differences.

T0066 guest email completion notes:

- AWS resources changed: existing session Lambda code only.
- Changed resource: `jumpyard-check-in-dev-stack-session`.
- Behavior: protected email planning/sending responses now include safe `fromAddressConfigured` and `replyToConfigured` diagnostics, and email subject/body include the booking start time when Aurora has it.
- SES status: account `376129878018`, region `eu-north-1`, has sending enabled, `ProductionAccessEnabled=false`, max 200 emails per 24 hours, max send rate 1 email/second, and no configured email identities.
- Dry-run smoke: booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `email_planned`, delivery `jyem_mppic9ea_01a07299`, masked destination `t0***@example.invalid`, provider `aws_ses`, `fromAddressConfigured=false`, `replyToConfigured=false`, and preview subject `Dags att checka in kl 10:30`.
- Aurora verification: `jumpyard.email_deliveries` row `jyem_mppic9ea_01a07299` has status `planned`, `dry_run=true`, provider `aws_ses`, destination masked, and template `checkin_email_v1`.
- Confirmed-send guard: a confirmed email request returned HTTP `400` with `email_sender_not_configured`, so real sends remain blocked until a verified SES sender/domain is explicitly approved and configured.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-28; pre-deploy diff showed only the `SessionHandler` Lambda code asset changing.

T0067 real SES email smoke notes:

- AWS resources changed: SES email identity `love@wrlds.com` was created manually through AWS CLI in `eu-north-1`.
- Tags: the identity has the required WRLDS tags, with `WRLDS:ManagedBy=manual-aws-cli` because SES verification is a manual provider action.
- Status: SES reports `VerificationStatus=SUCCESS` and `VerifiedForSendingStatus=true`.
- Dev config: `infra/config/dev.json` sets `guestEmail.fromAddress` and `guestEmail.replyToAddresses` to `love@wrlds.com` for dev only.
- Deploy result: CDK diff showed only `SessionHandler` environment variables `EMAIL_FROM_ADDRESS` and `EMAIL_REPLY_TO_ADDRESSES`; deploy passed on 2026-05-28.
- Confirmed smoke: protected email route accepted two real SES sends for booking `5063420` to masked destination `l***@w***.com`; Aurora recorded sent deliveries `jyem_mppo8w07_296c1a5e` and `jyem_mppo99gl_3c888240` with provider message ids present.

T0068 unified booking-time messaging notes:

- AWS resources changed: existing session Lambda code, API Gateway route/integration/permission for `POST /v1/check-in/session-links/send-due-messages`, and existing EventBridge booking-time schedule target payload/description.
- New route: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-due-messages`.
- Existing compatibility route retained: `POST /v1/check-in/session-links/send-due-sms`.
- EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule` now sends trigger `scheduled_booking_time_messaging` with channels `sms` and `email`; the rule name is retained for continuity.
- Dev config remains `confirmSend=false`, so the schedule plans candidates only and does not send unattended real SMS or email.
- Deploy result: CDK deploy passed on 2026-05-28; post-deploy diff showed no differences.
- Smokes: protected unified route, legacy SMS route, and direct scheduled-event invoke all returned planning-mode responses with masked destinations only.

T0070 integrated dev smoke notes:

- AWS resources changed: none.
- Existing dev API Gateway, session Lambda, redeem Lambda, staff auth, Aurora tables, and Roller Playground integration were used without CDK, Lambda, migration, config, or secret changes.
- Main smoke: fresh paid Playground booking `5100836` completed JumpYard Cloud lookup, session start, ready-for-staff handoff `JY2024`, staff auth, staff-confirmed redeem, and local completed session/ticket state.
- Cleanup: retry booking/session `5100835` / `jycs_mpqo02zt_3e4329f9` was staff-redeemed so the staff ready list returned count `0`.
- Roller writes: only scoped Playground booking creation and Playground ticket redemption for smoke data; no Roller Live/production writes.

T0071 Data API and webhook health verification notes:

- AWS resources changed: none.
- Reviewed resources: EventBridge rule `jumpyard-check-in-dev-data-api-daily-sync`, Lambda `jumpyard-check-in-dev-stack-data-sync`, Aurora tables, webhook events, and CloudWatch alarms.
- Schedule: the dev Data API rule is `ENABLED`, runs `cron(0 2 * * ? *)`, and targets the data-sync Lambda with input `{"source":"eventbridge.daily"}`.
- Latest scheduled Data API run: `2026-05-28 -> 2026-05-29` succeeded at `2026-05-29 02:00 UTC` with 2 bookingitems, 2 tickets, 0 payments, 0 customers, 491 products, and 1 booking upsert.
- Manual T0071 current-day sync: Lambda invoke for `2026-05-29 -> 2026-05-30` succeeded with 2 bookingitems, 2 tickets, 2 payments, 2 customers, 491 products, and 2 booking upserts.
- Webhook health: recent Roller booking `Created` events for `5100835` and `5100836` are `processed` with one enrichment attempt and no error summary.
- Aurora health: row counts after T0071 were 23 bookings, 31 booking items, 38 tickets, 10 payments, 26 guest profiles, 13 seed runs, and 19 webhook events.
- Alarms reviewed: data-sync Lambda errors/throttles, webhook Lambda errors/throttles, and Roller API errors are `OK`.

T0072 guest SMS/email sender readiness notes:

- AWS resources changed: none.
- Reviewed resources: SNS SMS sandbox/account attributes, SES account/identity state, EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule`, Lambda `jumpyard-check-in-dev-stack-session` environment, Aurora delivery audit tables, and CloudWatch alarms/log groups.
- SMS readiness: SNS SMS sandbox is still enabled, one masked test recipient is verified, `DefaultSMSType=Transactional`, monthly spend limit is `1`, delivery-status success sampling is `100`, and an SNS delivery-status IAM role is configured. The session Lambda requests sender id `JumpYard`, but the account has no `DefaultSenderID` attribute; actual handset sender display must be confirmed in a controlled T0073 smoke before relying on the brand display.
- Email readiness: SES sending is enabled but `ProductionAccessEnabled=false`, current quota is 200 messages per 24 hours and 1 message per second, and only email identity `love@wrlds.com` is verified for dev testing. No production sender domain identity, DKIM signing, or custom MAIL FROM setup is in place.
- Schedule safety: the existing booking-time EventBridge rule still invokes the unified SMS/email processor every 5 minutes with channels `sms` and `email`, but the payload keeps `confirmSend=false`; no unattended real SMS or email sends are enabled in dev.
- Delivery audit state: Aurora contains safe aggregate history for planned/sent SMS and email rows without raw tokens, full URLs, full phone numbers, or full email addresses.
- Observability gap: session Lambda alarms are `OK`, but there are not yet channel-specific SMS/email delivery alarms or runbooks, and SNS delivery status log groups have provider-managed/unset retention. Track this before enabling unattended visitor-facing sends.

T0073 controlled unified booking-time message smoke notes:

- AWS resources changed: none.
- Existing resources used: `jumpyard-check-in-dev-stack-data-sync`, protected route `POST /v1/check-in/session-links/send-due-messages`, Aurora delivery audit tables, SES identity `love@wrlds.com`, SNS SMS sandbox verified test recipient, and SNS delivery status log group.
- Scoped Playground data: paid booking `5100877` was created for `2026-05-29 15:30` with only approved test contact destinations; raw secrets, raw `jy_token` links, full phone numbers, and full email addresses were not printed or stored in docs.
- Aurora refresh: manual invoke of `jumpyard-check-in-dev-stack-data-sync` for `2026-05-29 -> 2026-05-30` succeeded and made the booking visible to the due-message processor.
- Unified processor result: planning mode found the booking for both `sms` and `email`; one controlled `confirmSend=true` run sent both channels using public base URL `https://jumpyard-check-in.pages.dev/`.
- Audit result: Aurora recorded SMS delivery `jysms_mpqwyxay_e7fe6d3c` and email delivery `jyem_mpqwyxox_94ea00f5` as `sent`, `dry_run=false`, with provider message ids present and masked destinations only.
- Provider result: SNS delivery status reported `Message has been accepted by phone` for the SMS. SES acceptance is represented by the stored SES provider message id; no SES delivery-event stream is configured yet.
- Manual receipt result: the user confirmed both SMS and email arrived; current text is acceptable for now but should be polished before broader guest rollout.
- Schedule safety: the EventBridge booking-time messaging rule still keeps `confirmSend=false`, so unattended scheduled sends remain disabled.

T0074 SMS production unlock preparation notes:

- AWS resources changed: none.
- Read-only checks reviewed: AWS identity, SNS SMS sandbox status, SNS SMS attributes, AWS End User Messaging SMS account attributes, sender IDs, and pools.
- Current SMS state: AWS account `376129878018`, region `eu-north-1`, SNS SMS sandbox `IsInSandbox=true`, AWS End User Messaging SMS `ACCOUNT_TIER=SANDBOX`, no End User Messaging sender IDs, and no End User Messaging pools.
- SNS attributes: `DefaultSMSType=Transactional`, `MonthlySpendLimit=1`, `DeliveryStatusSuccessSamplingRate=100`, and delivery status role `jumpyard-check-in-dev-sns-sms-delivery-status`.
- Official AWS production-access path: request production SMS access/sandbox exit through AWS Support with use case, website/app URL, countries, message type, opt-in/consent, sample messages, and volume/rate expectations.
- Sender/display implication: T0074 prepares the sender/display goal `JumpYard`, but no Sender ID is registered or changed. Actual sender display remains dependent on AWS/provider approval and country support.
- Safety: no AWS Support case was submitted, no sender resources were created, no SMS attributes were changed, and the booking-time EventBridge rule still keeps `confirmSend=false`.

T0003 proposed the target JumpYard Cloud architecture only. T0004 added the CDK TypeScript foundation in `infra/`. T0005 defined the booking index ingestion contract only. T0006 deployed the foundation to AWS account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-dev-stack`. T0007 added and applied the first Aurora schema migration.

T0006 deploy notes:

- First deploy attempt failed because Aurora PostgreSQL `16.3` is not available in `eu-north-1`.
- The failed deploy rolled back. The retained empty S3 bucket was deleted, and the rollback stack record was removed before retry.
- Successful deploy uses Aurora PostgreSQL `16.13`.
- Post-deploy `cdk diff` shows no differences.
- Placeholder API smoke returned HTTP `501` as expected.

T0007 migration notes:

- Migration runner: `infra/scripts/run-migrations.ts`
- Migration command: `npm --prefix infra run migrate:dev`
- Status command: `npm --prefix infra run migrate:dev:status`
- Applied migration: `0001 initial schema`
- Aurora schema: `jumpyard`
- Verified tables: 15
- Verified indexes: 62

T0009 lookup deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-lookup`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Behavior: reads Roller credentials from Secrets Manager, reads Roller env/base URL from SSM Parameter Store, calls Roller `GET /bookings/{identifier}`, enriches product names from `/products`, and returns a normalized JumpYard response.
- Roller writes: none.
- Post-deploy diff: no differences.

T0012 dev data import notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to write normalized Roller Data API `/data/bookingitems` snapshots.
- Import command: `npm --prefix infra run import:bookingitems:dev:apply`
- Modified-date window: `2026-05-20 -> 2026-05-21`
- Imported rows matched after apply:
  - `jumpyard.roller_bookings`: 6 seed bookings
  - `jumpyard.roller_booking_items`: 9 booking items
  - `jumpyard.booking_seed_runs`: latest run `succeeded`
- Raw Roller payloads, customer names, emails, phone numbers, booking notes, secrets, and tokens were not printed or intentionally stored.

T0013 dev product cache notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to write normalized Roller REST `/products` cache rows and enrich existing booking item rows.
- Import command: `npm --prefix infra run import:products:dev:apply`
- Imported rows matched after apply:
  - `jumpyard.product_catalog_cache`: 491 product/variation rows
  - `jumpyard.roller_booking_items`: 9 existing booking item rows enriched with product names
- Raw Roller payloads, customer names, emails, phone numbers, booking notes, secrets, and tokens were not printed or intentionally stored.

T0014 related Data API import notes:

- AWS resources created or changed: none.
- Existing Aurora Data API was used to apply migration `0002 related data sources`.
- Migration runner fix: migration checksums now normalize CRLF to LF before hashing so Windows line endings do not produce false checksum mismatches.
- Existing Aurora Data API was used to write normalized Roller Data API tickets, payments, and customers.
- Import command: `npm --prefix infra run import:related-data:dev:apply`
- Modified-date window: `2026-05-20 -> 2026-05-21`
- Imported rows matched after apply:
  - `jumpyard.roller_booking_tickets`: 6 ticket rows
  - `jumpyard.roller_booking_payments`: 0 payment rows
  - `jumpyard.guest_profiles`: 6 customer contact rows
- Email and phone are stored as explicit structured fields with hash/masked companion fields. Customer names, addresses, raw Roller payloads, booking notes, secrets, and tokens were not printed or intentionally stored.

T0015 webhook intake deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-webhook`
- Added secret: `/jumpyard-check-in-dev/webhooks/dev-token`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Behavior: verifies a dev token, parses Roller webhook JSON, deduplicates by event id or stable hash, stores normalized metadata in `jumpyard.roller_webhook_events`, and writes safe event-log rows for newly received events.
- Response behavior: HTTP `200` for accepted, duplicate, unauthorized, invalid JSON, and oversized requests; HTTP `500` for config/database/internal failures that should trigger Roller retry.
- Raw webhook payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0016 Aurora-first lookup deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-lookup`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup`
- Behavior: reads fresh local records from `jumpyard.roller_bookings`, `jumpyard.roller_booking_items`, and `jumpyard.roller_booking_tickets` before calling Roller; refreshes from Roller `GET /bookings/{identifier}` when local data is missing, stale, tombstoned, or unclear; and upserts refreshed booking/item/ticket metadata back into Aurora.
- Roller writes: none.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0017 booking webhook enrichment deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-webhook`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Behavior: verifies a dev token, deduplicates by event id or stable hash, refreshes accepted booking webhook events through Roller `GET /bookings/{identifier}`, enriches product names best-effort from `/products`, upserts booking/item/ticket metadata into Aurora, and marks webhook events `processed`, `pending_enrichment`, or `failed`.
- Roller writes: none.
- Real Roller Playground webhook registration: not done in T0017.
- Raw webhook payloads, raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0018 Roller Playground webhook registration notes:

- Changed AWS resource: `jumpyard-check-in-dev-stack-webhook`
- External Roller config changed: Roller Playground webhook id `238`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`
- Registered events: `Created`, `Updated`, and `Cancelled`
- Registered include: `tickets=true`
- Confirmed delivery header: `x-roller-apikey`
- Behavior: real Roller `Created` events now reach the dev Lambda, pass dev-token verification, refresh `GET /bookings/{identifier}`, upsert Aurora booking/item/ticket snapshots, and mark webhook events `processed`.
- Verified real event: booking `5032443`, unique id `69ea56d8-969f-41a3-bda5-cb09ad8a67b2`, status `processed`.
- Raw webhook payloads, raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0020 redeem endpoint notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem`
- Behavior: resolves local Aurora booking/ticket snapshots, validates idempotency and Roller redemption request constraints, returns safe redeem plans, and records planned/blocked attempts in `jumpyard.checkin_attempts` plus safe business events in `jumpyard.event_log`.
- Roller writes: disabled in deployed dev config by `ENABLE_ROLLER_REDEEM_WRITES=false`.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0021 controlled redeem execution notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Added secret: `/jumpyard-check-in-dev/redeem/dev-token`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/redeem`
- Behavior: `confirmRedeem=true` requires the dev redeem token, refreshes the booking from Roller REST, upserts the refreshed snapshot into Aurora, re-runs eligibility, and then calls Roller Playground `POST /redemptions`.
- Roller writes: enabled only for the protected dev path and still Playground-guarded.
- Controlled redeem smoke: dedicated booking `5032454` redeemed ticket `5032454-21397335` successfully through Roller Playground.
- Aurora verification: `jumpyard.checkin_attempts` contains the `redeemed` attempt and follow-up `already_redeemed` block; `jumpyard.roller_booking_tickets.redeem_status_last_seen='redeemed'` for `5032454-21397335`.
- Roller device note: an invalid `redemptionDevice` is rejected by Roller, so the dev Lambda omits `redemptionDevice` unless a real Roller device name is provided.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0023 check-in session API notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added routes:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions`
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/sessions/{checkinSessionId}/ready-for-staff`
- Applied migration: `0003 checkin sessions`
- Added Aurora table: `jumpyard.checkin_sessions`
- Behavior: creates or resumes active server-owned check-in sessions from Aurora booking/ticket snapshots, blocks unpaid/wrong-date/inactive/already-redeemed contexts, marks sessions `ready_for_staff`, creates short handoff codes, and writes event-log rows.
- Roller calls: none.
- Roller writes: none.
- Verified session: booking `5032210` created/resumed session `jycs_mpfe3dum_7dc29b1b`, then marked it `ready_for_staff` with handoff code `JY6085`.
- Rejected smoke: booking `5032211` returned `payment_required`.
- Raw Roller payloads, customer names, addresses, booking notes, secrets, and tokens are not printed or intentionally stored.

T0026 staff handoff API notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added routes:
  - `GET https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions`
  - `GET https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions/{checkinSessionId}`
- Behavior: reads ready-for-staff sessions, booking summaries, booking item rows, and ticket summaries from Aurora for staff/admin inspection.
- Roller calls: none.
- Roller writes: none.
- Session writes: none.
- Contact PII: guest email and phone are not returned by the staff endpoints.

T0027 staff-confirmed redeem notes:

- Changed resource: `jumpyard-check-in-dev-stack-redeem`
- Added route:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/check-in/sessions/{checkinSessionId}/redeem`
- Behavior: resolves the server-owned session from Aurora, requires `ready_for_staff` session/handoff state, requires completed safety status, requires the dev redeem token until staff auth exists, reuses the T0021 final Roller refresh and eligibility re-check, calls Roller Playground `POST /redemptions`, updates selected local tickets to `redeemed`, and marks the session `redeemed`/`completed`.
- Roller writes: enabled only for the protected dev path and still Playground-guarded.
- Token handling: admin users manually enter the temporary code for dev testing; it is not stored in source, browser env, localStorage, or sessionStorage.

T0031 booking quote/draft endpoint notes:

- Changed resource: `jumpyard-check-in-dev-stack-booking`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/quote`
- Endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/draft`
- Behavior: quote validates item input, reads Roller config/credentials server-side, fails closed unless configured for Playground, calls Roller `POST /bookings/draft/costs`, writes a safe event log, and returns normalized costs without creating a booking.
- Behavior: draft requires `confirmDraft=true` and an idempotency key, validates customer/items, calls Roller `POST /bookings/draft`, reads safe venue payment settings from `GET /venues/me`, writes idempotency and safe event-log rows, and returns draft/payment-session data for the future payment component.
- Roller writes: only the draft endpoint creates a Playground draft booking after explicit confirmation and idempotency; quote creates no booking.
- Payment JWT handling: raw `paymentJwt` is returned only in the API response for the future frontend payment component. It is not printed, logged, or persisted in Aurora.
- Deployed smoke: quote returned total `260`, amount owing `260`; draft returned unique id `2c1abf4f-944c-4122-a4ff-da8440c46321`, total `260`, amount owing `260`, `jwtPresent=true`, and `paymentConfigAvailable=true`.

T0033 phone pre-payment flow deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-booking`
- Added endpoint: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/availability`
- Applied migration: `0004 prepayment booking drafts`
- Added Aurora table: `jumpyard.prepayment_booking_drafts`
- Behavior: availability reads Roller Playground `GET /product-availability` through JumpYard Cloud, quote/draft re-check selected capacity before calling Roller draft cost/create endpoints, draft persists safe pre-payment metadata in Aurora, and the phone app stops at payment pending.
- Roller writes: only `POST /v1/bookings/draft` creates a Playground draft booking after `confirmDraft=true` and idempotency.
- Payment JWT handling: raw `paymentJwt` is response-only for future payment UI and is not persisted in `jumpyard.prepayment_booking_drafts`.
- Deployed smoke: availability returned product `E60` at `10:00` with capacity, quote returned total `200`, draft returned `paymentJwtPresent=true`, and Aurora row `jypd_5d96dca81de8429eb4` was verified.

T0034 add-product draft step 1 deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-booking`
- Endpoints:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/{bookingReference}/add-products/quote`
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/bookings/{bookingReference}/add-products`
- Applied migration: `0005 add product draft links`
- Changed Aurora table: `jumpyard.prepayment_booking_drafts` now has `flow_type`, `original_booking_reference`, `original_roller_unique_id`, and `add_on_group_id` for add-product draft tracking.
- Behavior: quote validates the original booking through Roller Playground and calls Roller draft costs without creating a draft or Aurora link; draft validates the original again, creates a separate Roller Playground draft booking, persists safe add-product pre-payment state, and links the original booking to the draft in `jumpyard.booking_links`.
- Roller writes: only `POST /v1/bookings/{bookingReference}/add-products` creates a Playground draft booking after `confirmDraft=true` and idempotency.
- Payment JWT handling: raw `paymentJwt` is response-only and is not persisted in Aurora; Aurora stores only `payment_jwt_present`.
- Deployed smoke: quote for original `5032210` and product `1765860` returned total `200` with `wroteBooking=false`; draft created Roller draft `18e85e91-9a53-4afd-a951-75d1a41eaf9f`, prepayment draft `jypd_2a5ad290e9c34eadaa`, and booking link `jyl_cf14c98651b4451aba`.

T0082 add-product contact-resolution deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-booking`
- AWS resources changed: existing booking Lambda code only.
- Behavior: no-customer existing-booking add-product draft creation can now reuse original JumpYard-created booking contact values stored in `jumpyard.prepayment_booking_drafts`, while still using Roller customer id plus Aurora `guest_profiles` when available.
- Safety: if required email/phone values cannot be resolved server-side, the draft path still fails closed; raw `paymentJwt`, access tokens, and full contact values are not persisted or printed.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-06-01; pre-deploy diff showed only `BookingHandler` Lambda code, and post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Dev smoke: no-customer add-product draft for original booking `5100965` created Roller draft `45ee1b0e-ab69-4e31-832f-d956af599365`, prepayment draft `jypd_7d8379902449415aab`, add-on group `jyao_f93769db16d840678e`, and booking link `jyl_7e8eac4758424c24bc`; Aurora shows `payment_pending`, `total_cents=4500`, and `payment_jwt_present=true`.

T0083 staff handoff identity/search deploy notes:

- Changed resources: `jumpyard-check-in-dev-stack-session`, `jumpyard-check-in-dev-stack-booking`, and `jumpyard-check-in-dev-stack-data-sync`
- AWS resources changed: existing Lambda code only; no new AWS resources were created.
- Aurora schema changed: migration `0008 prepayment draft customer names` added `customer_first_name` and `customer_last_name` to `jumpyard.prepayment_booking_drafts` and backfilled matched draft rows from `guest_profiles`.
- Behavior: staff-authenticated handoff list/detail routes now return limited guest identity fields with stored first/last name when available and masked email/phone, and the list route supports backend search by handoff code, booking reference, stored name, email, and phone.
- Behavior: booking Lambda stores first/last name for new prepayment draft rows; data-sync stores Roller Data API `/data/customers` first/last name in `guest_profiles.latest_booking_context`.
- Safety: raw email and raw phone are used only server-side for search and are not returned in the staff API response; public guest APIs/UI were not changed.
- Deploy result: staged `npm --prefix infra run deploy:dev` runs passed on 2026-06-01; CDK diffs were limited to `DataSyncHandler`, `BookingHandler`, and `SessionHandler` Lambda code, and final post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Dev smoke: controlled ready-for-staff session for booking `5100965` validated booking reference, first-name, derived last-name, and masked-contact search, and confirmed raw `email`/`phone` response fields were absent.

T0037 scheduled Data API sync deploy notes:

- Added resource: `jumpyard-check-in-dev-stack-data-sync`
- Added EventBridge rule: `jumpyard-check-in-dev-data-api-daily-sync`
- Schedule: `02:00 UTC` daily; imports the previous UTC modified-date window by default.
- Behavior: reads Roller Playground config from Secrets Manager and SSM, fails closed unless configured for Playground, imports `/data/bookingitems`, `/data/tickets`, `/data/bookingpayments`, `/data/customers`, refreshes REST `/products`, and upserts existing Aurora snapshot/cache tables.
- Public API routes: none.
- Roller writes: none.
- Run health: writes `scheduled-data-api:*` rows to `jumpyard.booking_seed_runs`.
- Manual smoke: run `scheduled-data-api:2026-05-20:2026-05-21:1779446219350` succeeded with 9 bookingitems, 6 tickets, 0 payments, 6 customers, 491 product rows, and no raw payload/PII output.
- Post-deploy diff: no differences.

T0038 check-in session link deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added secret: `/jumpyard-check-in-dev/checkin-links/dev-token`
- Added routes:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links`
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/resolve`
- Behavior: protected link creation validates an Aurora booking, generates a high-entropy raw token, stores only its SHA-256 hash in `jumpyard.checkin_tokens`, and returns the raw token/check-in URL only in the response. Public token resolution hashes the supplied token, marks the link opened, and starts or resumes a JumpYard Cloud check-in session without calling Roller.
- Roller calls: none.
- Roller writes: none.
- SMS provider calls: none.
- Raw token handling: raw tokens are not persisted, logged, printed in validation output, or committed.
- Deployed smoke: link creation returned `link_created` with token/url present, token resolution returned `session_started`, and Aurora `jumpyard.checkin_tokens` showed the hash row with `opened=true`, `consumed=false`, and `active=true`.
- Unauthorized smoke: link creation without the dev token returned HTTP `401`.
- Post-deploy diff: no differences.

T0039 SMS sending deploy notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added route:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-sms`
- Applied migration: `0006 sms deliveries`
- Added Aurora table: `jumpyard.sms_deliveries`
- Added IAM permission: session Lambda can call `sns:Publish` for confirmed dev SMS sends.
- Behavior: protected SMS sending resolves an Aurora booking, creates a hashed check-in token, records a delivery audit row, defaults to dry-run, and calls AWS SNS only when `confirmSend=true`.
- Roller calls: none.
- Roller writes: none.
- Raw token handling: raw tokens and full check-in URLs are not returned by the SMS endpoint and are not persisted.
- Contact handling: response and audit use masked/hash destination only; raw phone is used only in memory for provider send.

T0041 controlled SMS smoke notes:

- AWS resources created or changed: none.
- Endpoint used: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-sms`
- Behavior tested: one protected confirmed send with `confirmSend=true` through the deployed T0039 path.
- Result: AWS SNS accepted the message for masked destination `+46*****9508`.
- Aurora verification: `jumpyard.sms_deliveries` row `jysms_mpgvzkpz_5b4ae399` has status `sent`, `dry_run=false`, provider `aws_sns`, provider message id present, token hash present, and sent timestamp present.
- Link note: the SMS used the current dev `http://localhost:3000/` base URL, so provider delivery can be verified before the link is mobile-reachable.
- Raw token handling: raw tokens and full check-in URLs were not printed or stored.
- Contact handling: docs and verification output use masked destination only.

T0042 SMS delivery diagnostics notes:

- Changed resource: `jumpyard-check-in-dev-stack`
- Added IAM role: `jumpyard-check-in-dev-sns-sms-delivery-status`
- Added CDK custom resource: `SmsDeliveryStatusAttributes`
- Configured SNS SMS attributes:
  - `DefaultSMSType=Transactional`
  - `DeliveryStatusSuccessSamplingRate=100`
  - `DeliveryStatusIAMRole=arn:aws:iam::376129878018:role/jumpyard-check-in-dev-sns-sms-delivery-status`
- Created/used CloudWatch Logs group: `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber/Failure`
- Diagnostic SMS result: Aurora row `jysms_mpgwlk9u_9566748e` is `sent`, `dry_run=false`, provider `aws_sns`, provider message id present, and token hash present.
- Delivery status result: CloudWatch SNS status is `FAILURE` with provider response `Sandboxed account unable to send to number.`
- SNS sandbox status: `IsInSandbox=true`.
- Raw token handling: raw tokens, full check-in URLs, SMS text, and full destination numbers were not printed or stored.

T0043 SNS sandbox phone verification notes:

- AWS resources created or changed: no CDK resources changed.
- External AWS SNS sandbox config changed: masked test phone `+46*****9508` is verified in SNS SMS sandbox.
- Endpoint used after verification: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-sms`
- Diagnostic SMS result: Aurora row `jysms_mpgxbla6_b59779cd` is `sent`, `dry_run=false`, provider `aws_sns`, provider message id present, and token hash present.
- Delivery status result: CloudWatch SNS status is `SUCCESS` with provider response `Message has been accepted by phone.`
- SNS sandbox status remains `IsInSandbox=true`, so only verified sandbox numbers can receive SMS until sandbox exit is approved.
- OTP handling: the sandbox OTP was used once through AWS SNS and was not stored or committed.
- Raw token handling: raw tokens, full check-in URLs, SMS text, and full destination numbers were not printed or stored.

T0044 phone SMS link resume notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Endpoint behavior changed: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/resolve`
- Behavior: successful token resolution now returns the server-owned check-in session plus a safe Aurora booking summary for phone UI rendering.
- Phone behavior: local phone app detects `jy_token`, calls the public resolve endpoint, opens guest-in-progress sessions at booking summary, opens ready-for-staff sessions at QR confirmation, and falls back to manual lookup for invalid or expired links.
- Roller calls: none.
- Roller writes: none.
- SMS provider calls: none.
- Contact handling: the resolve response does not return guest email or phone.
- Raw token handling: raw tokens remain request-only for resolution, are not stored in Aurora, and were not committed.

T0045 booking-time SMS trigger notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added route:
  - `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/session-links/send-due-sms`
- Behavior: protected endpoint plans upcoming Aurora bookings by booking date/start time using a default 30-minute lead and 10-minute window in `Europe/Stockholm`.
- Behavior: planning mode is the default and sends no SMS; real sends require `confirmSend=true` and reuse the existing T0039 SMS sender.
- Candidate rules: fresh active local booking snapshot, SMS-ready guest contact resolved from ticket customer id or booking-level `bookingCustomerId`, existing check-in session eligibility, and no recent real SMS delivery for the same booking/template.
- Roller calls: none.
- Roller writes: none.
- Scheduling: no EventBridge SMS schedule was created in T0045; automatic sending is deferred.
- Contact handling: response returns masked destinations only.
- Raw token handling: raw tokens and full check-in URLs are created only inside confirmed sends and are not returned by the due trigger or persisted.

T0046 scheduled booking-time SMS processing notes:

- Changed resource: `jumpyard-check-in-dev-stack-session`
- Added EventBridge rule: `jumpyard-check-in-dev-booking-time-sms-schedule`
- Schedule: every 5 minutes in dev.
- Behavior: invokes the session Lambda internally with the T0045 due-SMS processor.
- Dev config: `confirmSend=false`, `leadMinutes=30`, `windowMinutes=10`, `limit=10`.
- Public API routes: none added; `POST /v1/check-in/session-links/send-due-sms` remains token-protected.
- Roller calls: none.
- Roller writes: none.
- Real SMS sends: disabled by dev config while the check-in app URL is still `http://localhost:3000/` and SNS sandbox constraints remain.
- Contact handling: scheduled results use the same masked-destination planning rules as T0045.
- Raw token handling: no raw tokens or full check-in URLs are created in planning mode.

T0049 confirmed scheduled SMS safety deploy notes:

- Changed resources: `jumpyard-check-in-dev-stack-session` Lambda code/config and EventBridge target payload for `jumpyard-check-in-dev-booking-time-sms-schedule`.
- Dev config remains `confirmSend=false`; scheduled real sends are not enabled by default.
- Scheduler config now carries an explicit `checkinBaseUrl` and `confirmedSendApproval` field.
- CDK config fails closed if `confirmSend=true` is set without approval phrase `I_APPROVE_CONFIRMED_SCHEDULED_SMS_SENDS` or without a public HTTPS check-in base URL.
- Runtime scheduled events also block confirmed sends when the approval phrase or public HTTPS URL is missing.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-25; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Public API routes: none added or changed.
- Roller calls/writes: none.
- SMS provider calls: unchanged for planning mode; no unattended SMS is sent by the safe dev config.
- Raw token handling: no raw tokens or full check-in URLs are created by scheduled planning runs.

T0047 staff auth deploy notes:

- Changed resources: `jumpyard-check-in-dev-stack-session`, `jumpyard-check-in-dev-stack-redeem`, and API routes.
- Added secret: `/jumpyard-check-in-dev/staff/auth`.
- Added route: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/staff/auth/login`.
- Behavior: validates the AWS-stored staff passcode server-side and returns a short-lived staff token plus safe display metadata.
- Secret refresh: session and redeem Lambdas cache the staff auth secret for at most 30 seconds so dev passcode edits in Secrets Manager take effect without waiting for a cold Lambda start.
- Staff list/detail: require `Authorization: Bearer <staffToken>` or `x-jumpyard-staff-token`.
- Staff redeem: requires the staff token before delegating to the existing final Roller refresh/redeem path.
- Dev-token handling: the old direct redeem dev-token path remains only for controlled lower-level dev testing; the normal admin handoff UI no longer asks for it.
- Production note: this is a pilot/dev auth slice, not final Cognito/SSO/role-based staff identity.

T0056 payment draft reconciliation deploy notes:

- Changed resources: `jumpyard-check-in-dev-stack-lookup` and `jumpyard-check-in-dev-stack-webhook` Lambda code only.
- Behavior: when lookup or webhook enrichment sees a settled Roller booking snapshot, the matching `jumpyard.prepayment_booking_drafts` row is marked `published`, amount owing is set to zero, and a safe idempotent `prepayment_draft.published` event is written.
- Roller calls: lookup/webhook continue to use existing read-only Roller booking refresh paths.
- Roller writes: none.
- Aurora schema changes: none; T0056 uses the existing `published` draft status.
- Secret/JWT handling: no raw `paymentJwt`, access token, client secret, or full contact PII is persisted or logged.
- Deploy result: `npm --prefix infra run deploy:dev` passed on 2026-05-27; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- Dev smoke result: lookup for paid booking `5063394` updated draft `jypd_835161973ab34210ac` to `published`, set `amount_owing_cents=0`, and wrote `prepayment_draft.published` to `jumpyard.event_log`.

Confirmed T0006 dev target:

| Field | Value |
|---|---|
| AWS account ID | `376129878018` |
| AWS profile/login method | `wrlds-dev` |
| AWS region | `eu-north-1` |
| Environment | `dev` |
| Resource prefix | `jumpyard-check-in-dev` |
| Config file | `infra/config/dev.json` |
| API endpoint | `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` |

## T0194 Deployed Park-Test Delta

The current park-test inventory has 154 CloudFormation resources, 26 API routes, Aurora migrations `0001` through `0009`, and the personal PIN staff runtime. It retains `POST /v1/staff/auth/login`, adds `POST /v1/staff/auth/session`, and adds four JWT-protected `/v1/admin/*` routes. Ordinary staff do not use Cognito, MFA, device registration, email, or a username at login.

The existing `/jumpyard-check-in-park-test/staff/auth` secret was repurposed and rotated to a generated server-only `pinPepper`; only the session Lambda reads it. Migration `0009_staff_identity.sql` added personal identities, hash-only sessions, and hashed failed-PIN limiter state to the existing encrypted Aurora cluster. No identity pool, browser IAM credential, new secret, device resource, WAF, CloudFront distribution, custom domain, production resource, or SMS MFA was added.

The approved 2026-07-14 deploy matched the reviewed `cdk diff --no-change-set --strict`: exactly 20 additions, no resource removal/replacement, the in-place secret change, one old redeem-secret read grant removed, five route settings, session/redeem code/environment changes, and three non-secret outputs. Migration, stack, secret rotation, first admin invitation, and Pages production deployment completed successfully. Automated readback, negative auth probes, alarm checks, drift detection, after-diff, administrator TOTP, staff creation/login/reset/logout, duplicate PIN rejection, disable/denied login, re-enable/restored login, and named credential-free audit all passed.

On 2026-07-14, live API access evidence showed a successful PIN login followed by HTTP `500` on the next login for the same identity because the original implementation used two unordered data-modifying CTEs while the database permits only one unrevoked local-PIN session per identity. The in-scope correction now locks the identity row and sequentially revokes/inserts the replacement session inside one Aurora Data API transaction with commit/rollback. The reviewed pre-deploy diff changed only the existing `SessionHandler` Lambda code asset; no environment value, IAM policy, database schema, route, resource, or other handler changed. Deployment as `Love` through profile `wrlds-dev` reached CloudFormation `UPDATE_COMPLETE` at `2026-07-14T09:58:46Z`; Lambda readback was `Active` with `LastUpdateStatus=Successful`, and the post-deploy full-flow-config diff reported no differences. Love then completed three PIN logins in sequence; all returned HTTP `200`, every issued session immediately authorized the staff queue, and safe Aurora aggregation showed exactly one unrevoked local-PIN session while three earlier sessions carried replacement revocation. Codex did not access the PIN or token.

Later access logs exposed roughly 40 successful staff queue reads in a few seconds because activity-driven auth object updates restarted the frontend queue effect. The final Pages-only correction keys effects by stable staff session, persists the activity throttle in a ref, coalesces one in-flight plus pending refresh, versions queries, ignores stale session/query results, preserves selected details, and recovers when a previous-session request overlaps a new PIN login. PIN/legacy builds, lint, TypeScript, focused assertions, independent race review, exact park-test build, three-route HTTP readback, and combined public-config verification passed. Final immutable deployment is `https://391533f3.jumpyard-checkin-admin-park-test.pages.dev`. This correction changed no AWS resource, Lambda, API route, Aurora row, IAM policy, secret, gate, or production environment. Love accepted closeout without a further manual traffic smoke, so no post-fix live request-count claim is made.

The final independent T0194 review found that the staff redeem entry point passed the authorized venue into its first check-in-session read only for the historical Cognito identity mode, not the active PIN mode. Although the nested trusted redeem path rechecked venue before Roller work, a known cross-venue session id could reach an earlier blocked-session response. The correction always supplies `auth.staff.venueId` when the authorized principal has one, while legacy dev principals without venue retain the prior null filter. The regression test now requires `AND booking.venue_id = :staffVenueId` with venue `50871` on the initial PIN redeem read. The reviewed CDK diff contained only the existing `RedeemHandler` code asset; deploy reached CloudFormation `UPDATE_COMPLETE` at `2026-07-14T11:35:59Z`, Lambda readback was `Active`/`Successful`, and the post-deploy diff had zero differences. No resource, environment value, IAM policy, route, schema, secret, Roller call/write, or production state changed.

The same review found a narrow reset/login race: an old PIN could finish slow verification just before an administrator reset committed, while the session transaction previously rechecked account state but not the exact credential material that had been verified. The locked identity read now requires the same keyed `pin_lookup_hash` and scrypt `pin_verifier` before any prior-session revoke or new-session insert. A mismatch rolls the transaction back, emits no success audit, returns the uniform `403 staff_pin_invalid` response, and never exposes the generated token. The regression simulates reset between the unlocked credential read and locked transaction. The reviewed diff contained only existing `SessionHandler` code; deploy reached CloudFormation `UPDATE_COMPLETE` at `2026-07-14T11:42:52Z`, Lambda readback was `Active`/`Successful`, and the post-deploy diff had zero differences. No resource, environment value, IAM policy, route, schema, secret value, Roller call/write, or production state changed.

## Resource Inventory

| Resource Name | AWS Service | Environment | Region | Managed By | Notes |
|---|---|---|---|---|---|
| `jumpyard-check-in-park-test-github-deployment-access` | CloudFormation | `park-test` | `eu-north-1` | `cdk` | Issue #201 release-access stack; `UPDATE_COMPLETE` on `2026-07-15` with exactly two IAM roles and two inline policies, including exact application-stack drift readback. Reuses the existing GitHub OIDC provider and is isolated from the application stack. |
| `jumpyard-check-in-park-test-github-actions-plan` | IAM Role | `park-test` | `eu-north-1` | `cdk` | Trusts only `wrlds-creations/jumpyard-check-in` on `refs/heads/main`; read-only access is limited to Describe/Get/List on the exact park-test application stack. |
| `jumpyard-check-in-park-test-github-actions-deploy` | IAM Role | `park-test` | `eu-north-1` | `cdk` | Trusts only the repository's protected `park-test` GitHub environment; can assume exact eu-north-1 CDK bootstrap roles and has bounded migration plus deployment-verification readback permissions. |
| `jumpyard-check-in-dev-stack` | CloudFormation | `dev` | `eu-north-1` | `cdk` | Deployed dev stack; documented later updates reached `UPDATE_COMPLETE`. |
| `jumpyard-check-in-park-test-stack` | CloudFormation | `park-test` | `eu-north-1` | `cdk` | T0197 rollout reached `UPDATE_COMPLETE` with 187 resources. Post-deploy CDK diff has zero differences and drift detection is `IN_SYNC` with zero drifted resources. Stack ARN `arn:aws:cloudformation:eu-north-1:376129878018:stack/jumpyard-check-in-park-test-stack/159bdd20-6ae4-11f1-8f4c-069284999d99`. |
| `ij4rnaui2b` | API Gateway HTTP API | `park-test` | `eu-north-1` | `cdk` | Endpoint unchanged. Current catalog has 27 explicit routes: six internal/legacy `AWS_IAM`, four administrator `JWT`, and seventeen browser/Roller `NONE` routes with caller-specific Lambda proof. Default rate/burst remains `50/150`; all 27 routes have settings and detailed metrics. CORS retains phone, admin, kiosk, and the controlled guest-alias origins. |
| `jumpyard-check-in-park-test-admin` / `eu-north-1_rmaqadThL` | Cognito User Pool | `park-test` | `eu-north-1` | `cdk` | Dedicated `staff_admin` identity only; Essentials tier, MFA `ON`, deletion protection active, and administrator-created users. Password policy is minimum eight characters with upper/lowercase and a number, symbols optional, five-password history, and seven-day temporary validity. Ordinary PIN staff are not Cognito users. |
| `4cm36dkcrptlpq9j163q45ae56` | Cognito public app client | `park-test` | `eu-north-1` | `cdk` | Public OAuth authorization-code plus PKCE client for the stable Pages `/auth/callback`; no client secret. |
| `jumpyard-check-in-park-test-admin-376129878018` | Cognito managed-login domain | `park-test` | `eu-north-1` | `cdk` | Domain `https://jumpyard-check-in-park-test-admin-376129878018.auth.eu-north-1.amazoncognito.com`; deployed client/callback probe redirects to managed login. |
| `jumpyard-check-in-park-test-admin` managed-login branding | Cognito managed login | `park-test` | `eu-north-1` | `cdk` | Existing resource updated in place with `UseCognitoProvidedValues=false`, black text, JumpYard-red actions/links/focus, rounded form/inputs/buttons, and no logo. Cognito owns the English/Open Sans hosted page and exposes neither Swedish localization nor custom-font controls for this flow. |
| `jumpyard-check-in-park-test-admin-jwt` / `nnwcuy` | API Gateway JWT authorizer | `park-test` | `eu-north-1` | `cdk` | Validates Cognito JWTs on exactly four `/v1/admin/*` routes; Aurora remains authoritative for active `staff_admin` role, venue, revocation, and server session state. |
| `jumpyard-checkin-admin-park-test` | Cloudflare Pages | `park-test` | External | direct Wrangler deploy | Stable URL `https://jumpyard-checkin-admin-park-test.pages.dev`; issue #266 deployment `https://aefb838a.jumpyard-checkin-admin-park-test.pages.dev` has active park-test API/PIN/Cognito configuration plus the visible-session five-second Handoff queue refresh, immediate foreground refresh, compact pending state, and authoritative redemption gate. Direct deploy does not resolve the separate Git-trigger follow-up. |
| `jumpyard-check-in-park-test-ops` | CloudWatch Dashboard | `park-test` | `eu-north-1` | `cdk` | T0150 operations dashboard for the park-test foundation. |
| `jumpyard-check-in-park-test-*` CloudWatch alarms | CloudWatch Alarms | `park-test` | `eu-north-1` | `cdk` | 23 alarms for API, Lambda, Roller API, queue/DLQ state, T0196 booking-index freshness, and T0197 webhook processing. Seven webhook-prefixed alarms cover intake/worker error and throttle signals plus processing failure, queue age, and DLQ visibility. A controlled invalid-message proof intentionally exercised the processing-failure alarm; it and all six other webhook alarms subsequently returned `OK`. |
| `jumpyard-check-in-park-test-booking-index-stale` | CloudWatch Alarm | `park-test` | `eu-north-1` | `cdk` | T0196 freshness alarm over `BookingIndexSyncSuccess`; five consecutive six-hour periods without success are treated as stale. Post-backfill and scheduled-path smoke state is `OK`. |
| `jumpyard-check-in-park-test-stack-lookup` | Lambda | `park-test` | `eu-north-1` | `cdk` | Scoped reference/email/phone lookup remains open for Nacka through 2026-09-30. It now uses restricted role `jumpyard_lookup_runtime`; broad imports remain closed. |
| `jumpyard-check-in-park-test-stack-booking` | Lambda | `park-test` | `eu-north-1` | `cdk` | Current Nacka/date booking/payment/add-on gates remain; the restricted `jumpyard_booking_runtime` handler now also resolves server-owned kiosk terminal aliases and reconciles approved drafts through ROLLER publish/readback. |
| `jumpyard-check-in-park-test-stack-redeem` | Lambda | `park-test` | `eu-north-1` | `cdk` | Staff redeem keeps personal session/venue/date/audit boundaries and now uses restricted role `jumpyard_redeem_runtime`; it has no PIN-pepper grant. |
| `jumpyard-check-in-park-test-stack-session` | Lambda | `park-test` | `eu-north-1` | `cdk` | PIN/admin/session/handoff behavior is unchanged, guest sends remain disabled, and database access now uses restricted role `jumpyard_session_runtime`. It remains the only application Lambda allowed to read the PIN pepper. |
| `jumpyard-check-in-park-test-stack-webhook` | Lambda | `park-test` | `eu-north-1` | `cdk` | T0197 public intake for Roller Live webhook `1465`; verifies `x-roller-apikey`, validates and normalizes booking events, persists idempotent metadata, and sends one FIFO message without calling Roller REST. It uses restricted role `jumpyard_webhook_runtime`. |
| `jumpyard-check-in-park-test-stack-webhook-processor` | Lambda | `park-test` | `eu-north-1` | `cdk` | T0197 asynchronous processor and recovery target with reserved concurrency `1`; obtains authoritative Roller Live state, verifies Nacka `50871`, applies retention boundaries, and reconciles Aurora without Roller business writes or guest sends. |
| `jumpyard-check-in-park-test-stack-data-sync` | Lambda | `park-test` | `eu-north-1` | `cdk` | T0196 Live/Nacka booking index with exact approval guard, one-day provider windows, one-request-per-second pacing, bounded provider retries, page/window caps, reserved concurrency `1`, related-row filtering, signed refund support, structured receipts, and restricted role `jumpyard_data_sync_runtime`. It performs no Roller writes or guest sends. |
| `/aws/lambda/jumpyard-check-in-park-test-stack-*` | CloudWatch Logs | `park-test` | `eu-north-1` | `cdk` | Seven application Lambda log groups with 30-day retention, including the T0197 webhook processor. |
| `/aws/apigateway/jumpyard-check-in-park-test-api-access` | CloudWatch Logs | `park-test` | `eu-north-1` | `cdk` | API Gateway access log group for the park-test API. |
| `jumpyard-check-in-park-test-aurora` | Aurora PostgreSQL Serverless v2 | `park-test` | `eu-north-1` | `cdk` | Engine `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion protection enabled, Data API enabled, 7-day backup retention, and snapshot tag copy enabled. Migrations `0001` through `0016` are applied. T0197 verification ended with four processed and four safely ignored-scope synthetic events, zero failed/stuck events, zero retention violations, and the latest authoritative target containing one booking, one item, and two tickets. |
| `jumpyard-check-in-park-test-aurora-writer` | RDS DB instance | `park-test` | `eu-north-1` | `cdk` | Serverless writer instance for the park-test cluster. |
| `jumpyard-check-in-park-test-aurora-subnets` | RDS DB subnet group | `park-test` | `eu-north-1` | `cdk` | Uses isolated subnets `subnet-0dfe19348e09a46be` and `subnet-0da9943155e44511d`. |
| `/jumpyard-check-in-park-test/aurora/admin` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | Generated Aurora admin credentials for park-test. Do not print secret values. |
| `/jumpyard-check-in-park-test/aurora/runtime/{booking,data-sync,lookup,redeem,session,webhook}` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | Six retained handler-specific credentials for least-privilege database roles. Each live credential successfully returned only its expected `current_user`; values were not printed. |
| `/jumpyard-check-in-park-test/aurora/lifecycle` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | Retained dedicated lifecycle credential. Read-only source dry-run passed; apply remains separately gated. |
| `jumpyard-check-in-park-test-database-runtime-role-provisioner` and `jumpyard-check-in-park-test-database-runtime-role-provider` | Lambda | `park-test` | `eu-north-1` | `cdk` | Deployment-only database password/role binding, with scoped IAM and 30-day log groups; both were created successfully by T0195. |
| `jumpyard-database-runtime-role-provisioner-v1` | CloudFormation Custom Resource | `park-test` | `eu-north-1` | `cdk` | Applied the migration-defined role grants and generated secret passwords during T0195 deploy; reached `CREATE_COMPLETE`. |
| `/jumpyard-check-in-park-test/roller/credentials` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | Secret container exists and was populated by the user before T0153. Do not print or commit credential values. |
| `/jumpyard-check-in-park-test/webhooks/dev-token` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | Generated token container used as Roller Live webhook `1465` `x-roller-apikey` value source. Do not print or commit the token value. |
| `/jumpyard-check-in-park-test/redeem/dev-token` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | Generated token container for the protected direct redeem path; current full-flow redeem remains staff-authenticated and venue/date gated. |
| `/jumpyard-check-in-park-test/staff/auth` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | T0194 repurposed and rotated this existing container to a generated 64-character server-only `pinPepper`; only `SessionHandler` can read it. Never print or commit the value. |
| `/jumpyard-check-in-park-test/checkin-links/dev-token` | Secrets Manager | `park-test` | `eu-north-1` | `cdk` | Retained generated check-in-link token container. Approved #216 source reuses a nested `t0201Control` object for the hash-only single-booking gate while preserving the token; no raw booking id/email is written, and the object is not armed before the separate proof checkpoint. |
| `/jumpyard-check-in-park-test/roller/env` | SSM Parameter Store | `park-test` | `eu-north-1` | `cdk` | Value `live`; server-side use remains controlled by the deployed stop, feature, venue, date, and approval gates. |
| `/jumpyard-check-in-park-test/roller/base-url` | SSM Parameter Store | `park-test` | `eu-north-1` | `cdk` | Value `https://api.roller.app`, used server-side only under the reviewed Live park-test contract. |
| `jumpyard-check-in-park-test-raw-376129878018-eu-north-1` | S3 | `park-test` | `eu-north-1` | `cdk` | Encrypted, public access blocked, versioned, 30-day lifecycle, retained on stack deletion; WRLDS tags verified. |
| `jumpyard-check-in-park-test-roller-ops` | SQS | `park-test` | `eu-north-1` | `cdk` | Roller operations queue with DLQ redrive. |
| `jumpyard-check-in-park-test-roller-ops-dlq` | SQS | `park-test` | `eu-north-1` | `cdk` | Dead-letter queue. |
| `jumpyard-check-in-park-test-webhook-events.fifo` | SQS FIFO | `park-test` | `eu-north-1` | `cdk` | Encrypted T0197 webhook work queue. Batch size `1`, 12-minute visibility, partial batch failures, and redrive after five receives serialize booking reconciliation. |
| `jumpyard-check-in-park-test-webhook-events-dlq.fifo` | SQS FIFO | `park-test` | `eu-north-1` | `cdk` | Encrypted T0197 dead-letter queue. Post-verification visible and in-flight counts were zero. |
| `jumpyard-check-in-park-test-events` | EventBridge | `park-test` | `eu-north-1` | `cdk` | Internal park-test event bus. |
| `jumpyard-check-in-park-test-data-api-daily-sync` | EventBridge Rule | `park-test` | `eu-north-1` | `cdk` | Enabled by the approved T0196 full-flow config at `cron(0 2 * * ? *)`; invokes the guarded Live/Nacka data-sync Lambda with source `eventbridge.daily`. Rollback is the normal closed `park-test.json` deploy. |
| `jumpyard-check-in-park-test-webhook-recovery` | EventBridge Rule | `park-test` | `eu-north-1` | `cdk` | Enabled T0197 recovery sweep at `rate(5 minutes)`; invokes the webhook processor to requeue bounded stale `received` events. |
| `vpc-0fb3aec1a310d3600` | VPC | `park-test` | `eu-north-1` | `cdk` | CIDR `10.72.0.0/16`. |
| `subnet-0dfe19348e09a46be` | EC2 subnet | `park-test` | `eu-north-1a` | `cdk` | Isolated subnet A. |
| `subnet-0da9943155e44511d` | EC2 subnet | `park-test` | `eu-north-1b` | `cdk` | Isolated subnet B. |
| `sg-0f143d36f71241c8a` | EC2 security group | `park-test` | `eu-north-1` | `cdk` | Aurora boundary security group. |
| `m0uo5g4mde` | API Gateway HTTP API | `dev` | `eu-north-1` | `cdk` | Endpoint `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`; lookup, booking availability/quote/draft, existing-booking add-product quote/draft, session, check-in session link, SMS/email link, staff auth/handoff, webhook, and redeem routes are implemented; CORS uses explicit dev origins; `$default` stage throttling is rate `25` requests/second and burst `50`. |
| `jumpyard-check-in-dev-ops` | CloudWatch Dashboard | `dev` | `eu-north-1` | `cdk` | T0060 operations dashboard for API requests/errors/latency, Lambda metrics, SQS/DLQ metrics, and Roller outbound API call/error metrics. |
| `jumpyard-check-in-dev-*` CloudWatch alarms | CloudWatch Alarms | `dev` | `eu-north-1` | `cdk` | T0060 alarms for API 5xx, high API 4xx, Roller API errors, Roller ops DLQ messages, and Lambda errors/throttles; T0061 adds API throttled request alarm `jumpyard-check-in-dev-api-throttled-requests`. |
| `OPERATIONS_RUNBOOK.md` | Operational Runbook | `dev` | `eu-north-1` | repo docs | T0101 source-of-truth runbook for where to look in AWS/Aurora, what each signal means, safe first actions, and when to contact Roller/Josh/Joao/Pabel, AWS Support, or JumpYard operations. |
| `jumpyard-check-in-dev-stack-lookup` | Lambda | `dev` | `eu-north-1` | `cdk` | T0016 lookup handler; reads Aurora first, refreshes from Roller Playground only when needed, and returns normalized phone-flow lookup response. |
| `jumpyard-check-in-dev-stack-booking` | Lambda | `dev` | `eu-north-1` | `cdk` | T0113 booking handler; reads Roller Playground availability including SkyRider as a capacity-gated add-on, returns stock add-on product ids/prices from `jumpyard.product_catalog_cache`, quotes Roller Playground draft costs, creates confirmed Playground draft bookings behind idempotency, creates separate linked add-product draft bookings for existing bookings, resolves original booking contact server-side for no-customer add-product drafts, persists safe pre-payment draft rows including first/last name for staff-only handoff use, returns safe payment config and response-only `paymentJwt`, and writes safe audit rows. |
| `jumpyard-check-in-dev-stack-redeem` | Lambda | `dev` | `eu-north-1` | `cdk` | T0047 redeem handler; plans/validates server-side redemption from Aurora, requires a dev token for lower-level direct confirmed writes, refreshes live Roller state before write, supports staff-auth-protected session redeem, marks completed sessions, and records attempt audit. |
| `jumpyard-check-in-dev-stack-session` | Lambda | `dev` | `eu-north-1` | `cdk` | T0083 session handler; creates/resumes Aurora-backed check-in sessions, marks sessions ready for staff, issues staff auth tokens, protects staff handoff list/detail, returns staff-only limited guest identity/search fields with masked contact data, creates/resolves hashed check-in session links with safe booking summaries for phone resume, dry-runs or explicitly sends SMS links through AWS SNS with safe provider/Sender ID diagnostics, dry-runs or explicitly sends email links through SES with safe sender/reply-to diagnostics using verified dev sender `love@wrlds.com`, plans booking-time SMS/email candidates from Aurora through one processor, and blocks scheduled confirmed sends unless the approval phrase and public HTTPS URL are present. |
| `love@wrlds.com` | Amazon SES email identity | `dev` | `eu-north-1` | manual AWS CLI | T0067 verified dev test identity for real email smoke; created with WRLDS tags and verified for sending. Do not use as production sender/domain. |
| `jumpyard-check-in-dev-sns-sms-delivery-status` | IAM Role | `dev` | `eu-north-1` | `cdk` | Allows Amazon SNS to write SMS delivery status logs for JumpYard Cloud dev diagnostics. |
| `SmsDeliveryStatusAttributes` | CloudFormation Custom Resource | `dev` | `eu-north-1` | `cdk` | Sets dev SNS SMS attributes for transactional SMS and 100% delivery status sampling. |
| SNS SMS sandbox phone `+46*****9508` | Amazon SNS SMS sandbox | `dev` | `eu-north-1` | AWS CLI/manual verification | Verified test destination for dev SMS delivery while the account remains in SMS sandbox. |
| `jumpyard-check-in-dev-stack-webhook` | Lambda | `dev` | `eu-north-1` | `cdk` | T0018 webhook handler; accepts Roller Playground `x-roller-apikey`, validates a dev token, stores idempotent metadata, refreshes booking detail from Roller Playground, and upserts Aurora booking/item/ticket snapshots. |
| `jumpyard-check-in-dev-stack-data-sync` | Lambda | `dev` | `eu-north-1` | `cdk` | T0083 scheduled sync handler; imports Roller Data API modified-date windows and product cache data into Aurora, stores customer first/last name in `guest_profiles.latest_booking_context`, records run health, and performs no Roller writes. |
| Roller Live webhook `1465` | Roller Webhooks API | `park-test`/Live | External | Roller | Enabled and posts exactly booking `Created`, `Updated`, and `Cancelled` events with `tickets=true` to the park-test `/v1/webhooks/roller` endpoint using `x-roller-apikey`. Rollback endpoint: `https://api.roller.app/webhooks/1465`; disabling processing requires a separately reviewed park-test deploy. |
| Roller Playground webhook `238` | Roller Webhooks API | `dev`/Playground | External | Roller | Posts booking `Created`, `Updated`, and `Cancelled` events with `tickets=true` to the dev JumpYard Cloud webhook endpoint. |
| `/aws/lambda/jumpyard-check-in-dev-stack-lookup` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-booking` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-redeem` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-session` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/apigateway/jumpyard-check-in-dev-api-access` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | T0060 API Gateway HTTP API access logs with route, status, integration status, and latency fields; no request body, secrets, tokens, or PII. |
| `ApiThrottledRequestMetricFilter` | CloudWatch Logs Metric Filter | `dev` | `eu-north-1` | `cdk` | T0061 metric filter on API access logs that counts HTTP `429` rows into `JumpYard/Cloud` metric `ApiThrottledRequestCount`. |
| `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber/Failure` | CloudWatch Logs | `dev` | `eu-north-1` | SNS/CDK attributes | SNS SMS delivery status failure logs. T0042 confirmed sandbox rejection here. |
| `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber` | CloudWatch Logs | `dev` | `eu-north-1` | SNS/CDK attributes | SNS SMS delivery status success logs. T0043 confirmed verified-phone delivery acceptance here. |
| `/aws/lambda/jumpyard-check-in-dev-stack-webhook` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `/aws/lambda/jumpyard-check-in-dev-stack-data-sync` | CloudWatch Logs | `dev` | `eu-north-1` | `cdk` | 30-day retention. |
| `jumpyard-check-in-dev-aurora` | Aurora PostgreSQL Serverless v2 | `dev` | `eu-north-1` | `cdk` plus SQL migrations; issue #234 direct cost containment | Engine `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion protection enabled, Data API enabled, schema `jumpyard` created by T0007. The retired Playground cluster uses min `0`, max `2` ACU and 300-second auto-pause; its booking-time and daily-sync rules are disabled. |
| `jumpyard-check-in-dev-aurora-writer` | RDS DB instance | `dev` | `eu-north-1` | `cdk` | Serverless writer instance. |
| `jumpyard-check-in-dev-aurora-subnets` | RDS DB subnet group | `dev` | `eu-north-1` | `cdk` | Uses isolated subnets. |
| `/jumpyard-check-in-dev/aurora/admin` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Generated Aurora admin credentials. |
| `/jumpyard-check-in-dev/roller/credentials` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Placeholder Roller credentials; values must be set in AWS before real Roller calls. |
| `/jumpyard-check-in-dev/webhooks/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for Roller Playground webhook delivery. Do not print or commit the token value. |
| `/jumpyard-check-in-dev/redeem/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for controlled Roller Playground redemption execution. Do not print or commit the token value. |
| `/jumpyard-check-in-dev/staff/auth` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Generated staff passcode and token settings for T0047 pilot staff auth. Do not print or commit the passcode. |
| `/jumpyard-check-in-dev/checkin-links/dev-token` | Secrets Manager | `dev` | `eu-north-1` | `cdk` | Development-only shared token for creating check-in session links. Do not print or commit the token value. |
| `/jumpyard-check-in-dev/roller/env` | SSM Parameter Store | `dev` | `eu-north-1` | `cdk` | Value `playground`. |
| `/jumpyard-check-in-dev/roller/base-url` | SSM Parameter Store | `dev` | `eu-north-1` | `cdk` | Value `https://api.play.roller.app`. |
| `jumpyard-check-in-dev-raw-payloads-376129878018-eu-north-1` | S3 | `dev` | `eu-north-1` | `cdk` | Encrypted, public access blocked, versioned, 30-day lifecycle, retained on stack deletion. |
| `jumpyard-check-in-dev-roller-ops` | SQS | `dev` | `eu-north-1` | `cdk` | Roller operations queue with DLQ redrive. |
| `jumpyard-check-in-dev-roller-ops-dlq` | SQS | `dev` | `eu-north-1` | `cdk` | Dead-letter queue. |
| `jumpyard-check-in-dev-events` | EventBridge | `dev` | `eu-north-1` | `cdk` | Internal JumpYard Cloud event bus. |
| `jumpyard-check-in-dev-data-api-daily-sync` | EventBridge Rule | `dev` | `eu-north-1` | `cdk` | Invokes `jumpyard-check-in-dev-stack-data-sync` daily at `02:00 UTC` for the previous modified-date window. |
| `jumpyard-check-in-dev-booking-time-sms-schedule` | EventBridge Rule | `dev` | `eu-north-1` | `cdk` | Invokes `jumpyard-check-in-dev-stack-session` every 5 minutes for booking-time guest messaging in planning mode with `confirmSend=false`; T0068 target payload includes channels `sms` and `email` while retaining the existing rule name for continuity. |
| `vpc-0d3ec43331e52813e` | VPC | `dev` | `eu-north-1` | `cdk` | CIDR `10.72.0.0/16`. |
| `subnet-005b2679b14023edc` | EC2 subnet | `dev` | `eu-north-1a` | `cdk` | Isolated subnet A. |
| `subnet-07bc326946413a10a` | EC2 subnet | `dev` | `eu-north-1b` | `cdk` | Isolated subnet B. |
| `sg-0bd327f3b974b3d73` | EC2 security group | `dev` | `eu-north-1` | `cdk` | Aurora boundary security group. |
| `jumpyard-check-in-dev-sta-*ServiceRole*` | IAM | `dev` | `eu-north-1` | `cdk` | Lambda execution roles and scoped inline policies for Secrets Manager, SSM, RDS Data API, S3, SQS, EventBridge, and CloudWatch metrics. |

## Aurora Schema Inventory

T0007 created schema `jumpyard` in database `jumpyard_cloud`. Park-test is applied through migration `0020`; the T0195-T0197 migrations remain the schema foundation, and migrations `0017`-`0020` add signed/refund-safe webhook state plus kiosk payment, reconciliation, and provisional-handoff state.

| Table | Purpose |
|---|---|
| `schema_migrations` | Tracks applied SQL migrations and checksums. Retained for database integrity; park-test is applied through `0020 provisional kiosk handoff`. |
| `roller_bookings` | Latest normalized Roller booking snapshot from seed, webhook enrichment, or live refresh. T0016 and T0017 can upsert refreshed booking rows. |
| `roller_booking_items` | Normalized booking item/product rows. T0016 and T0017 can upsert refreshed item rows. |
| `roller_booking_tickets` | Ticket ids and redeem readiness context from `/data/tickets`, lookup live refresh, or webhook enrichment. |
| `roller_booking_payments` | Payment rows or summaries needed for check-in/payment decisions from `/data/bookingpayments`. |
| `guest_profiles` | Structured guest email/phone contact state plus masked/hash values for SMS/readiness and late enrichment; T0083 also keeps customer first/last name inside `latest_booking_context` for staff-only handoff identity. |
| `checkin_sessions` | Server-owned guest check-in session state, selected ticket ids, safety status, handoff status/code, expiry, and ready-for-staff state. |
| `prepayment_booking_drafts` | Safe Roller draft booking metadata for new-booking and add-product pre-payment flows, including status, selected item summary, totals, structured/masked/hash contact fields, add-product links, JWT/config presence flags, and kiosk payment channel plus random attempt id/status without storing raw `paymentJwt`, terminal identifiers, card data, receipts, or provider payloads. |
| `checkin_tokens` | SMS/link/open token state. |
| `sms_deliveries` | SMS link delivery audit rows with masked/hashed destination values and no raw token/full URL storage. |
| `email_deliveries` | Email link delivery audit rows with masked/hashed destination values and no raw token/full URL storage. |
| `checkin_attempts` | Check-in and redeem attempt audit. |
| `handoff_sessions` | Staff handoff, safety, and band-pairing state. |
| `booking_links` | Internal links between original bookings and separate add-on bookings. |
| `idempotency_records` | Write protection for booking, payment, redeem, and add-on operations. |
| `product_catalog_cache` | Product cache metadata and normalized summary from Roller REST `/products`; T0013 stores one row per product/variation cache key. |
| `roller_webhook_events` | Idempotent booking webhook intake and reconciliation state. T0197 records safe metadata, durable enqueue/retry status, attempts, processed time, and bounded safe error summaries without raw webhook payload persistence. |
| `booking_seed_runs` | Daily seed run tracking. |
| `event_log` | Append-only business and observability events. |
| `staff_identities` | Named local-PIN staff and Cognito administrator registry, role/venue/revocation state, keyed PIN verifier material, credential-free audit subject, lifecycle deactivation/anonymization, and non-secret PIN-pepper version/re-enrollment evidence. |
| `staff_auth_sessions` | Hash-only staff sessions with token/idle/absolute expiry, replacement, revocation, and identity-version checks. |
| `staff_pin_auth_limits` | Aggregate/global and scoped failed-PIN limiter windows containing hashes rather than PIN values. |
| `data_lifecycle_runs` | T0195 aggregate-only lifecycle plan/apply evidence. The table exists in park-test; the approved dry-run created no row and lifecycle apply remains separately gated. |

## Proposed Target Resources

| Proposed Resource | AWS Service | Environment | Purpose | Status |
|---|---|---|---|---|
| JumpYard Cloud API | API Gateway HTTP API | `dev`; existing technical `park-test` as Nacka pilot production | Phone/admin entrypoint for server-owned contracts. | Deployed; no duplicate pilot-production API is planned |
| JumpYard Cloud handlers | Lambda | `dev`; existing technical `park-test` as Nacka pilot production | Lookup, session, availability, quote, draft booking, add-product, redeem, webhook handlers. | Implemented and deployed; future multi-park shape is deferred |
| Roller credentials | Secrets Manager | Per technical environment | Store Roller client id and client secret server-side. | Deployed to `dev` and Park; future parks/tenants require separate approval |
| Roller non-secret config | SSM Parameter Store | Per technical environment | Store Roller environment and base URL. | Deployed to `dev` and Park; future parks/tenants require separate approval |
| JumpYard operational database | Aurora PostgreSQL Serverless v2 | Per technical environment | Roller snapshot, operational state, check-in attempts, idempotency, handoff state, webhook events, event log. | Deployed to `dev` and Park; Park data remains the Nacka pilot-production state |
| Restricted diagnostic storage | S3 | Per technical environment | Private versioned storage with 30-day lifecycle; application policy prohibits persisting raw Roller/webhook payloads, payment JWTs, access tokens, PINs, secrets, or unmasked credentials. | Deployed to `dev` and Park; no #264 object or bucket change |
| Roller rate-limit control | SQS plus DLQ | Per technical environment | Serialize Roller operations and provide dead-letter handling. | General plus dedicated webhook queues are deployed in Park; future multi-park scaling is deferred |
| Async processing | EventBridge | Per technical environment | Scheduled reconciliation and recovery. | Deployed to `dev` and Park; Park's five-minute webhook recovery is the Nacka pilot-production path |
| JumpYard logs | CloudWatch Logs | Per technical environment | Operational logs and error traces with Lambda log retention. | Deployed to `dev` and Park; no #264 log resource change |
| Infrastructure deployment | CDK TypeScript | Per technical environment | Repeatable infrastructure with WRLDS tags. | `dev` and Park deployed; Park retains its technical names and tags |
| `jumpyard.se` guest email identity | Amazon SES | existing `park-test` | Easy DKIM domain identity for the exact Nacka transactional sender without MX/custom MAIL FROM changes. | Deployed; verified for sending with DKIM `SUCCESS` on 2026-07-22 |
| `jumpyard-check-in-park-test-email` | Amazon SES configuration set | existing `park-test` | Fail-closed TLS-required sending boundary with bounce/complaint suppression and dedicated event telemetry. | Deployed with `SendingEnabled=true` for the T0201 controlled profile; general application sends remain closed and the hash-only control is disarmed |
| Guest email delivery/reputation monitoring | SES event destination and CloudWatch | existing `park-test` | Send/delivery/bounce/complaint/reject/rendering-failure metrics plus bounded event and account-health alarms without recipient/body/token dimensions. | Deployed; controlled proofs reported four sends/deliveries and zero failure events, including one automatic T0201 application delivery |

## Park-Test Target

T0146 defined the separate technical `park-test` environment contract, and T0150 deployed it. T0191 originally classified that foundation as pre-production. D0189/issue #264 supersedes that business-role classification for the single-park Nacka pilot: Park is now the sharp pilot-production backend, while all technical identities remain unchanged. No parallel or replacement pilot stack will be created. Every future AWS change still requires a scoped Issue and explicit approval; multi-park production architecture remains separate.

| Field | Planned Value |
|---|---|
| AWS account ID | `376129878018` |
| AWS region | `eu-north-1` |
| Environment | `park-test` |
| Resource prefix | `jumpyard-check-in-park-test` |
| Stack name | `jumpyard-check-in-park-test-stack` |
| Roller target | Roller Live / JumpYard Nacka, server-side only |
| Database | Dedicated park-test Aurora/database; not shared with dev |
| Secrets/SSM | Dedicated `/jumpyard-check-in-park-test/...` names |
| Frontend | Same phone/admin source, separate deployment/API target |
| Raw payload bucket | Synthesizes as `jumpyard-check-in-park-test-raw-376129878018-eu-north-1` to satisfy S3 length limits |
| Status | Nacka pilot-production backend under D0189/#264, still technically named/tagged `park-test`. T0150 foundation is deployed with migrations through `0020` and 202 stack resources. Live webhook `1465` feeds the dedicated FIFO worker/recovery path; issue #257 deployed the provisional-item reconciliation repair without a migration or resource change, recovered both classified failed events, and left the main queue and DLQ empty. Issue #266 then deployed the live five-second Handoff queue refresh without an AWS or schema change. The Nacka/date full-flow window remains open through `2026-09-30`; broader venue scope remains closed. Current API has 27 routes, T0196 freshness is `OK`, all alarms are `OK`, drift is `IN_SYNC`, and the deployed template matches immutable release `2f23725`. Administrator TOTP and local-PIN staff flows remain validated. T0201 delivered exactly one automatic controlled email and was disarmed; the general guest-send gate remains false. Lifecycle apply, broad guest delivery, and multi-park expansion remain closed. The #264 public staff CORS/Cognito source delta and shared frontend promotion are not deployed yet. |

## Governance Notes

- Do not create AWS resources unless a ticket explicitly allows AWS deploy work.
- Confirm client, project, environment, owner, repository, tags, data classification, exportability, and cost center before AWS deploy work.
- Update this file whenever AWS resources are created, changed, discovered, deleted, or replaced.
- `infra/config/dev.example.json` is for local synth validation only and is not an approved deployment config.
- `infra/config/dev.json` is the approved non-secret T0006 dev deployment config.
- Do not run future `cdk deploy` commands unless AWS identity matches account `376129878018` and region `eu-north-1`.
- Roller credentials in AWS must be populated through Secrets Manager only; do not commit secrets.

## Required WRLDS Tags

- `WRLDS:Client`
- `WRLDS:Project`
- `WRLDS:Environment`
- `WRLDS:Owner`
- `WRLDS:Repository`
- `WRLDS:ManagedBy`
- `WRLDS:DataClassification`
- `WRLDS:Exportable`
- `WRLDS:CostCenter`
- `WRLDS:CreatedBy`

## Historical T0006 WRLDS Tags

| Tag | Value |
|---|---|
| `WRLDS:Client` | `JumpYard` |
| `WRLDS:Project` | `jumpyard-check-in` |
| `WRLDS:Environment` | `dev` |
| `WRLDS:Owner` | `love` |
| `WRLDS:Repository` | `wrlds-creations/jumpyard-check-in` |
| `WRLDS:ManagedBy` | `cdk` |
| `WRLDS:DataClassification` | `internal` |
| `WRLDS:Exportable` | `true` |
| `WRLDS:CostCenter` | `unassigned` |
| `WRLDS:CreatedBy` | `love` |

Issue #233 supersedes the historical T0006 cost-center value. Every active check-in deployment config and all 187 currently inventoried JumpYard resources now use `WRLDS:CostCenter=JumpYard`.
