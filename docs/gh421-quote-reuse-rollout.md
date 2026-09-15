# Applied quote reuse: verified rollout (#421)

## Outcome
Love authorized commit, PR, push and deployment on 2026-09-15. [Implementation PR #423](https://github.com/wrlds-creations/jumpyard-check-in/pull/423) merged as `02155e55230cd989b337cc0af8250bb2d6cbcb05`. Continue reuses a successful current Apply quote without clearing the accepted discount/total. Changed inputs, leaving Contact, unmount and supplied expiry invalidate reuse. The draft keeps the code payload and determines the final amount.

The branch integrated approved contact-preservation work [#409 / PR #422](https://github.com/wrlds-creations/jumpyard-check-in/pull/422), preserving its restriction on unverified customers. Provider-contract and physical payment acceptance for that separate work are not resolved by this fix. Review was by the implementation agent; no independent human review is claimed.

## Selected artifact and verification
- [Release 34984915362](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34984915362): artifact `10402513777`, digest `sha256:337c11b35e93251b384a26785be5bfb01986d00ffb49c5ece9871df00b6be11d`.
- Manifest SHA256 `e660c8f9f0fa58a07ae5c5b5709c4e5c8673ecfbce0899fbf91fa1d15b4156c3`; all 664 files independently downloaded and verified locally. Public-origin guard passed for the exact SHA.
- [Park deployment 34985824066](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34985824066) succeeded. Plan job `104437531902`, deploy job `104437670682`. The uploaded and independent live plans matched: 208 resources, no resource/section changes, template SHA256 `f1981878b54225e49cf944bfe128b792d71ec857cce2ff50c6b6b64ae9a2fbd9`. Migrations were disabled and remain applied through 0023.
- Deployment was coordinated with #409. Its earlier Park run `34984709902` installed the contact backend but failed its health gate on one lookup GET/404 at 14:56:49 UTC. We inspected only safe operation/status aggregates. The alarm returned naturally to OK before approval; no alarm, metric or threshold was changed. The recorded delegated approval for the selected run explicitly covers #409 and #421. This task's later approval request found no pending approval and made no change.
- Park checks passed: exact template, `IN_SYNC` drift, no active alarms, empty queues, exact-SHA Pages and endpoint checks. Phone: `https://889be38e.jumpyard-check-in-park-test.pages.dev`; admin: `https://ffc4d33d.jumpyard-checkin-admin-park-test.pages.dev`. Independent readback matched all 13 phone script/style assets to the selected artifact.
- [Public promotion 34987254267](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34987254267) succeeded with the same artifact, following Park success. Plan job `104442443216`, deploy job `104442535502`; actual plan and artifact identity were inspected. Delegated approval was recorded through the coordinated #409 rollout. Duplicate dispatch `34987286439` was cancelled before deployment; it published nothing.
- Public phone: `https://a10e8c63.jumpyard-check-in-production.pages.dev`; admin: `https://df68e582.jumpyard-checkin-admin-production.pages.dev`. `https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se` returned HTTP 200; all 13 phone and 11 admin script/style responses independently matched the selected release bytes.
- No rebuild between Park and public promotion. No new backend/resource/schema/IAM/route/gate change belongs to #421; account `376129878018`, region `eu-north-1`, ten WRLDS tags and Nacka scope remain confirmed.

## Tests and review
Payment-option tests: 55 passed; payment confirmation: 55; recovery: 137. After merging main, 74 combined payment-option/contact/purchase-preparation cases passed. All seven PR checks passed (including full repository, infra, phone/admin, PostgreSQL and Android); lint retained four existing image warnings. Static build/TypeScript, WRLDS validator and whitespace checks passed.

Tests execute the actual component handlers with synthetic inputs: one quote and one draft for Apply then Continue; unchanged visible quote/total; partial/full discounts and gift cards; fresh checks after edits/expiry; rejected-code decisions and immediate duplicate locks. No real booking, payment, redemption or guest message was used for publication verification. Physical-device payment is not claimed. Recommended spot check: Apply a partial discount, Continue, then repeat after editing the code.

## Kiosk and recovery
[Kiosk #111 / PR #113](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/pull/113) shipped `4ac26eb8c50bf2ce75714a47ffcb0e51bf636b97` to deployment `eacfdd1d-03a2-48ad-b45d-9902df71f869`; its own repository holds checksums and readback.

Rollback candidate retaining the #409 contact baseline: successful release `34984038346` / `84b28a588aaad91365cc2273c357c8b6be4d0dfb`, artifact `10402867670`. All 664 files were independently verified; manifest `01970e44bb99ee88c4c0b5e18e4c7f41906465d6715926264304de2b95f46ccd`. Its earlier deployment's transient alarm failure is described above. Prior fully successful public release `34977478153` / `4bd7501` also remains historical recovery evidence. Any rollback selects the exact existing artifact through the reviewed protected path. No rollback or re-promotion was performed.

Changed product files: BuyTickets and focused test harnesses. PROJECT_CONTEXT.md and DECISIONS.md record the approved behavior; REPO_CURRENT_STATE.md records this merged/deployed state. No new Project draft was created.
