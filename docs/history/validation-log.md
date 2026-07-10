# Validation Log Archive

This archive was created in T0128 to keep active source-of-truth files short while preserving historical validation evidence.

## T0190 Critical Safety Gates

- 2026-07-10: Audited lookup, booking/add-on, session/staff, redeem, webhook, CDK config, and synth behavior. Confirmed three venue fail-opens, multiple emergency-stop bypasses, missing-config fail-open behavior, and a redeem final-refresh venue evidence gap.
- 2026-07-10: Implemented exact configured-plus-observed venue matching for Nacka `50871`; missing configured venue, missing booking venue, and wrong venue now block lookup, add-on, and redeem. Final Roller redeem normalization/upsert now carries venue into Aurora before the second write-gate check.
- 2026-07-10: Changed runtime semantics so only exact `JUMPYARD_EMERGENCY_STOP=false` releases the stop. Booking operations, all park-test lookup modes, staff routes, confirmed redeem, webhook processing, and real guest sends cannot be opened by smoke/full-flow flags while stopped; released park-test mode still requires its narrow approval/allowlist/date/venue gates.
- 2026-07-10: Kept normal `park-test.json` stopped and changed reviewed active source profiles to release the stop explicitly. Config validation rejects stop-off without a recognized scoped approval. No CDK deploy, AWS mutation, Roller call, payment, redeem, webhook processing, SMS/email send, Cloudflare change, or running app behavior occurred; deployed full-flow remains on the previous runtime model.
- 2026-07-10: Added dependency-free `scripts/validate-t0190-safety-gates.js` and wired it into root validation and `infra:check`. Focused validation passed for correct/wrong/missing/unconfigured venue, emergency-stop override combinations, missing stop config, post-stop narrow gates, staff-route blocking, webhook/message behavior, and authoritative redeem venue normalization.
- 2026-07-10: Full `npm --prefix infra run check` and full root `npm run validate` passed, including TypeScript build, config guards, every dev/park-test synth profile, Roller guard self-tests, T0190 behavioral validation, and all repository source-of-truth validators. Syntax checks passed for all five changed Lambda handlers, and `git diff --check` passed.
- 2026-07-10: Project validation dependencies were installed locally without changing the lockfile; the existing lockfile is not clean-`npm ci` compatible because it omits transitive `jsonschema@1.4.1`.
- 2026-07-10: Recorded high-priority `FU-096` instead of widening T0190: new-booking quote/draft and submitted add-on item dates still need an explicit full-flow operating-date gate before the corrected model is deployed or used more broadly.

## T0189 Complete Sprint 3 Target And Ticket Correction

- 2026-07-10: Audited the T0188 plan against the confirmed production target and found that seed/backfill, production webhook/reconciliation, and automatic T-30 SMS/email were present in older architecture/followups but not explicit in the planned implementation queue.
- 2026-07-10: Published the exact T0190-T0204 sequence. T0196 owns initial backfill/morning seed, T0197 owns webhook/reconciliation, T0200 owns sender readiness, T0201 owns automatic T-30 SMS/email, T0202 owns monitoring/operations, and T0204 proves the complete chain.
- 2026-07-10: Removed duplicate candidate and parking-lot rows only after preserving their evidence and ownership in `FOLLOWUPS.md`, `DECISIONS.md`, `docs/t0189-complete-sprint-3-target-plan.md`, and Git history.
- 2026-07-10: `node scripts/validate-template.js`, `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `node scripts/validate-skills.js`, `node scripts/validate-aws-tags.js`, `node scripts/validate-park-test-frontend-target.js`, and `git diff --check` passed.
- 2026-07-10: Custom sequence/ownership validation confirmed exactly T0190-T0204 with no promoted duplicate rows. No application, Lambda, migration, infrastructure, AWS, Roller, deployment, Cloudflare, credential, SMS/email, or runtime-gate change occurred.
- 2026-07-10: The aggregate `npm run validate` was not used because its known T0177 validator dependency gap remains on a dependency-free clean checkout; all applicable dependency-free constituents passed.

## T0188 Sprint 3 Phone/Admin Scope And Ticket Plan

- 2026-07-09: Completed a documentation-only source-of-truth audit and published the T0189-T0200 phone/admin/JumpYard Cloud ticket map with plain-language purpose, scope boundary, dependencies, and completion evidence.
- 2026-07-09: Confirmed that kiosk/QR print/terminal work and JumpyBoard/AirHive activity-data work remain separate project workstreams, while the cross-project roadmap stays preserved.
- 2026-07-09: `node scripts/validate-template.js`, `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `node scripts/validate-skills.js`, `node scripts/validate-aws-tags.js`, `node scripts/validate-park-test-frontend-target.js`, and `git diff --check` passed.
- 2026-07-09: Manual sequence review confirmed exactly T0189-T0200 in the approved order. No application, Lambda, infrastructure configuration, AWS resource, Roller data, deployment, Cloudflare target, credential, SMS/email, or runtime-gate change occurred.
- 2026-07-09: The aggregate `npm run validate` was not used because its T0177 contact validator imports AWS SDK packages that are unavailable on a dependency-free clean checkout. T0188 recorded that tooling gap instead of expanding this documentation-only ticket; all applicable dependency-free constituent validators passed.

## T0187 ComboDeal Booking Product

- 2026-07-07: Implemented `COMBO60` as a phone buy-entry product sorted above standard entry products, mapped server-side to Roller Live parent `1318777` (`ComboDeal`) with child price products `1318778`, `1318779`, and `1318780`.
- 2026-07-07: Public park-test availability smoke for `2026-07-07 17:00` returned `COMBO60` with `productId=1318778`, `unitPriceCents=43000`, `jumpersPerUnit=2`, and `requiresAvailability=true`.
- 2026-07-07: Added transparent JumpYard-style combo icons for two people, 60 minutes, pizza, and summer/calendar; the final phone card uses two people, 60 minutes, and pizza with red plus separators and red offer glow.
- 2026-07-07: Deployed existing `BookingHandler` Lambda code to the current park-test full-flow rehearsal posture. CloudFormation reached `UPDATE_COMPLETE`; pre-deploy diff showed only `BookingHandler` Lambda code changing and no new AWS resources.
- 2026-07-07: Direct-deployed the phone park-test Cloudflare Pages build repeatedly during visual review with the park-test API target. Final browser check at cachebuster `t0187_combo_glow` verified `2 PERSONER + 60 MIN + 1 PIZZA`, red border/glow, plus separators, and no horizontal overflow at `390x844`.
- 2026-07-07: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, and `git diff --check` passed. Phone lint reported existing `<img>` warnings only; `git diff --check` reported CRLF normalization warnings only.
- 2026-07-07: Closed T0187 after user approval to commit, push, and merge the ComboDeal ticket.

## T0186 Water Bottle Add-On

- 2026-07-07: Implemented `water_bottle` as a phone add-on sorted after socks, with buy-or-own-bottle confirmation and environmental copy.
- 2026-07-07: Read-only Roller Live catalog search selected `1324123` / `Jumpy Vattenflaska` / `4900` cents under parent `970508` / `Merchandise`.
- 2026-07-07: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm --prefix jumpyard-checkin-admin run lint`, `npm --prefix jumpyard-checkin-admin run build`, `npm --prefix infra run build`, `npm --prefix infra run validate:roller-live-catalog-index-readiness`, and `npm --prefix infra run synth:park-test-full-flow-rehearsal` passed. Phone lint reported existing `<img>` warnings only.
- 2026-07-07: `npm --prefix infra run diff:park-test-full-flow-rehearsal` showed only existing `BookingHandler` Lambda code changing. `npm --prefix infra run deploy:park-test-full-flow-rehearsal` reached `UPDATE_COMPLETE`; no new AWS resources, gate changes, webhook changes, venue/date scope changes, or guest messaging sends were introduced.
- 2026-07-07: Park-test availability API smoke returned `water_bottle` with product `1324123`, price `49`, `requiresAvailability=false`, and `onlineSalesOpen=true`.
- 2026-07-07: Direct-deployed phone and admin park-test Cloudflare Pages builds with the park-test API target. Stable phone/admin URLs and phone/admin `water-bottle.png` assets returned HTTP `200`; the deployed phone bundle contains `water_bottle` and the park-test API id.
- 2026-07-07: Replaced the first 3D water bottle icon with the user-selected flatter green-background variant, converted it to transparent PNG, added `imagegen-flat-t0186` cache-busting in phone/admin icon rendering, rebuilt, and direct-deployed phone/admin again. Stable phone/admin URLs, `water-bottle.png?v=imagegen-flat-t0186`, and the deployed phone/admin bundles verified successfully.
- 2026-07-07: Final phone UI polish compacted the recommended socks count card, removed the grey capacity-loading surface, made small add-on copy black, and made add-on price text black/normal weight. Phone lint/build passed again, and stable phone URL checks passed with cachebusters `t0186_compact_socks` and `t0186_black_prices`.
- 2026-07-07: `git diff --check` passed with CRLF normalization warnings only.
- 2026-07-07: Closed T0186 after user approval to commit, push, and merge the water bottle add-on ticket.

## T0185 Socks Confirmation Guard Closeout

- 2026-07-07: Closed T0185 as documentation-only because the guest-facing socks confirmation guard was already delivered and reviewed during T0182.
- 2026-07-07: Added `docs/t0185-socks-confirmation-closeout.md` and updated active status, roadmap, feedback placeholders, and completed-ticket history. No app code, backend code, public API contract, AWS resource, Roller integration, gate, payment, redeem, webhook, SMS, email, Cloudflare deploy, or runtime behavior changed.
- 2026-07-07: `npm run validate` passed after T0185 closeout docs were updated.
- 2026-07-07: `git diff --check` passed with CRLF normalization warnings only.

## T0184 Older And Technically Inexperienced Guest Support Closeout

- 2026-07-07: Closed T0184 as documentation-only because Love confirmed the older/technically inexperienced guest support path should move to the later kiosk/staff-help setup instead of another immediate phone-flow change.
- 2026-07-07: Added `docs/t0184-older-guest-support-closeout.md`, recorded D0140, and updated active status, roadmap, feedback placeholders, and completed-ticket history. No app code, kiosk code, backend code, public API contract, AWS resource, Roller integration, gate, payment, redeem, webhook, SMS, email, Cloudflare deploy, or runtime behavior changed.
- 2026-07-07: `npm run validate` passed after T0184 closeout docs were updated.
- 2026-07-07: `git diff --check` passed with CRLF normalization warnings only.

## T0183 Safety Video, Rules, And Child Comprehension Closeout

- 2026-07-07: Closed T0183 as documentation-only because the safety video, safety rules, and responsible-adult/child-comprehension scope was already delivered and reviewed during T0182.
- 2026-07-07: Added `docs/t0183-safety-video-rules-closeout.md` and updated active status, roadmap, feedback placeholders, and completed-ticket history. No app code, backend code, public API contract, AWS resource, Roller integration, gate, payment, redeem, webhook, SMS, email, or Cloudflare deploy changed.
- 2026-07-07: `npm run validate` passed after T0183 closeout docs were updated.
- 2026-07-07: `git diff --check` passed with CRLF normalization warnings only.

## T0182 Mobile Viewport, UX Polish, And Add-On Prefetch

- 2026-07-06: Implemented a defensive phone-app viewport/layout robustness pass. The phone app now exports a Next viewport with `width: "device-width"`, `initialScale: 1`, and `viewportFit: "cover"` while preserving user pinch zoom.
- 2026-07-06: Added global mobile stability CSS for `html`/`body`, text-size adjustment, horizontal overflow containment, and media max-width.
- 2026-07-06: Hardened top-level phone flow containers, progress labels, booking references, product/add-on labels, payment rows, and handout rows against horizontal overflow using scoped `min-w-0`, max-width, wrap, and truncate rules.
- 2026-07-06: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only.
- 2026-07-06: `npm --prefix jumpyard-checkin-phone run build` passed. Next reported the existing `baseline-browser-mapping` age notices only.
- 2026-07-06: Local static `out` build was served on loopback for browser checks. Emulated mobile viewport checks passed for `/` and `/?park=1` at `375x667`, `390x844`, `360x740`, and `412x915`; for each entry URL, `document.documentElement.scrollWidth <= window.innerWidth` and `document.body.scrollWidth <= window.innerWidth`.
- 2026-07-06: Reachable key screens were checked in the same viewport matrix: start choice, booking lookup, and buy-entry first screen. All passed the same no-horizontal-overflow assertions.
- 2026-07-06: Visual inspection at `390x844` confirmed the first screens kept the same basic feel without the extreme zoomed state. Booking summary and ready-for-entry confirmation were not live-reached because no scoped test booking/API smoke was part of Del A.
- 2026-07-06: T0182 Del A changed phone frontend layout/metadata only. It did not change public APIs, backend, AWS, Roller, gates, data contracts, safety content, socks logic, water-bottle logic, or copy pass behavior.
- 2026-07-07: Continued T0182 with the user-approved phone UX/copy polish pass across the park-test PWA: start choice, start time, product selection, jumper quantity, add-ons, contact/payment, summary, payment loading/completion, safety video/rules, ready-for-entry QR, booking lookup, existing-booking summary, existing-booking add-ons, and SkyRider consent.
- 2026-07-07: Added the socks-step guard requiring either add-on quantity or active approved-socks confirmation, merged buy-entry contact details with payment prep, kept the QR on the ready-for-entry screen with shorter staff handoff copy, and preserved the tested base flow.
- 2026-07-07: Added read-only existing-booking add-on availability prefetch after booking lookup/session resolution and when starting check-in. The prefetch can reuse a matching availability result in `AddonsOffer`, but it does not create drafts, payments, add-ons, redemptions, or other write side effects.
- 2026-07-07: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only.
- 2026-07-07: `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com npm --prefix jumpyard-checkin-phone run build` passed; the bundle contained the park-test API target and excluded the dev/fake/local API targets.
- 2026-07-07: `npm run validate` passed after closeout docs were updated.
- 2026-07-07: `npm run validate:park-test-frontend-target` passed for the static phone output.
- 2026-07-07: `git diff --check` passed with CRLF normalization warnings only.
- 2026-07-07: Direct-deployed the static phone build to Cloudflare Pages project `jumpyard-check-in-park-test`. The stable URL returned HTTP `200`, and the in-app browser reloaded in a `390x844` mobile viewport with zero console errors.
- 2026-07-07: T0182 did not change public API contracts, create new AWS resources, broaden venue/date scope, enable webhooks, enable JumpYard-owned guest sends, or close the intentionally open park-test full-flow runtime window.

## T0177 Guest Contact Lookup Validation

- 2026-06-30: Implemented server-side booking reference/email/phone lookup for park-test. Email/phone uses Roller `GET /bookings?date&keywords` for the current Europe/Stockholm operating date, verifies candidates with booking detail, filters to Nacka/date scope, scopes response/snapshot items to that date, and selects the nearest upcoming same-day start time when multiple valid matches exist.
- 2026-06-30: Updated the phone lookup input and copy to accept booking reference, email, or phone without uppercasing the entered value.
- 2026-06-30: `node --check infra/lambda/lookup/index.js`, `node scripts/validate-t0177-contact-lookup.js`, and `npm --prefix jumpyard-checkin-phone run lint` passed. Phone lint reported only existing `<img>` warnings.
- 2026-06-30: AWS preflight confirmed account `376129878018`, region `eu-north-1`, and park-test WRLDS metadata. `npm --prefix infra run synth:park-test-full-flow-rehearsal` passed with existing CDK notice `37949`.
- 2026-06-30: `npm --prefix infra run diff:park-test-full-flow-rehearsal` showed only existing `LookupHandler` Lambda code/S3Key changing.
- 2026-06-30: `npm --prefix infra run deploy:park-test-full-flow-rehearsal` reached `UPDATE_COMPLETE`. Readback confirmed `LookupHandler` last modified `2026-06-30T08:57:15.000+0000`, `ENABLE_T0171_ASSISTED_LOOKUP=true`, `ENABLE_T0169_POST_PAYMENT_SYNC=true`, Nacka venue `50871`, dates `2026-06-29` through `2026-07-05`, and `JUMPYARD_EMERGENCY_STOP=true`.
- 2026-06-30: Public negative email and phone lookup smokes for `2026-06-30` returned HTTP `404` with `booking_not_found`, proving contact input reaches the new date-scoped search path instead of the old `live_lookup_not_allowed` guard. No real visitor/contact positive smoke was run because no user-approved real email or phone value was provided.
- 2026-06-30: `npm run validate`, `npm run infra:check`, `npm --prefix jumpyard-checkin-phone run build`, and `git diff --check` passed. Infra check reported existing CDK notice `37949`, phone build reported existing `baseline-browser-mapping` notices, and diff-check reported existing CRLF normalization warnings only.
- 2026-06-30: T0177 did not create AWS resources, add migrations, broaden venue/date scope, import same-day bookings, write Roller drafts/payments/redemptions, process webhooks, send SMS/email, print secrets, print raw payment JWTs, or expose raw contact PII in the public response.

## T0176 Frontend Redeem Rehearsal Validation

- 2026-06-29: Closeout UI quickfixes were implemented for the park-test phone PWA: QR-only ready-for-entry handoff copy, existing-booking add-on parity with the new-booking add-on socks card, no automatic socks add-on when none already exist, no top add-on count/scroll hint, and no duplicate top-level `Ingår redan` badge.
- 2026-06-29: `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings only, and `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` notices only.
- 2026-06-29: Static park-test phone output check confirmed the bundle contains the park-test API id, excludes the dev API id, removes the visible handoff-code test id, removes old QR help copy, removes old socks auto-fill markers, removes the add-on scroll hint, removes the top existing-add-on badge pattern, and preserves socks confirmation plus per-card `alreadyInBooking`.
- 2026-06-29: Direct-deployed the closeout phone UI quickfixes to `jumpyard-check-in-park-test` through Wrangler. Remote stable Pages bundle check for `https://jumpyard-check-in-park-test.pages.dev` confirmed the same markers after deploy.
- 2026-06-29: T0176 was closed in source-of-truth docs: `CODEX_TASK.md` moved to `NO_ACTIVE_TICKET`, `REPO_CURRENT_STATE.md` moved to none active, `docs/roadmap/backlog.md` removed T0176 from Now, and `docs/history/completed-tickets.md` lists T0176 as completed. Runtime note: the T0176 full-flow AWS gate posture remains open until a separate normal `park-test.json` close-window deploy is explicitly run.
- 2026-06-29: Implemented a manual feedback fix pass after full-flow testing: ready-for-entry handout row/icon copy, product quantity display, existing-booking add-on loading/review/socks defaults, SkyRider visual consistency, and POS booking display-name normalization.
- 2026-06-29: PR #176 was squash-merged to `main` as `e3c5d58`. Cloudflare Pages production deployments for phone/admin read back source `e3c5d58`, and the remote phone bundle contains the park-test API id while excluding the dev API id.
- 2026-06-29: Redeployed `infra/config/park-test-full-flow-rehearsal.json` after PR #176. CDK diff showed only `LookupHandler` code changing; CloudFormation reached `UPDATE_COMPLETE`; readback confirmed post-payment sync and assisted lookup remain open for Nacka `50871` and dates `2026-06-29` through `2026-07-05`.
- 2026-06-29: Public phone/admin URLs returned HTTP `200`, lookup CORS preflight returned HTTP `204`, and read-only availability for `2026-06-29 13:30` returned `available` with ten products and no draft creation.
- 2026-06-29: `node --check infra/lambda/lookup/index.js`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed. Phone lint still reports only existing `<img>` warnings, phone build still reports existing `baseline-browser-mapping` notices, and `git diff --check` reports existing CRLF normalization warnings only.
- 2026-06-29: After explicit user approval for a real full-flow rehearsal, added `infra/config/park-test-full-flow-rehearsal.json`, approval phrase `T0176_FULL_FLOW_REHEARSAL_APPROVED`, and Lambda env mapping for `ENABLE_T0176_FULL_FLOW_REHEARSAL`, `T0176_FULL_FLOW_ALLOWED_OPERATING_DATES`, and `T0176_FULL_FLOW_VENUE_ID`.
- 2026-06-29: Updated BookingHandler to let T0176 full-flow pass emergency stop for new booking/payment and existing-booking add-on writes, while validating existing-booking add-on originals against the approved operating dates and venue.
- 2026-06-29: Updated RedeemHandler to let T0176 full-flow pass emergency stop only when the local booking/ticket dates match `2026-06-29` through `2026-07-05` and the local booking venue is either Nacka `50871` or absent. T0166 exact allowlist behavior remains separate.
- 2026-06-29: `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, and `node --check` for Booking/Redeem/Session handlers passed after the full-flow changes.
- 2026-06-29: AWS preflight confirmed account `376129878018` and region `eu-north-1`. `npm --prefix infra run synth:park-test-full-flow-rehearsal` passed, and the opening CDK diff showed only existing Lookup/Booking/Redeem/Session Lambda code/environment changes.
- 2026-06-29: `npm --prefix infra run deploy:park-test-full-flow-rehearsal` reached `UPDATE_COMPLETE`.
- 2026-06-29: Lambda readback confirmed Booking writes, T0159 payment smoke bypass, T0162 add-on bypass, T0176 full-flow, T0169 post-payment sync, T0171 assisted lookup, staff auth, and Roller redeem writes are open for Nacka `50871` and dates `2026-06-29` through `2026-07-05`. Webhook processing, guest sends, T0160/T0165 exact lookup modes, T0166 exact redeem smoke, and frontend-only session allowlist are off. `JUMPYARD_EMERGENCY_STOP=true` remains set across handlers.
- 2026-06-29: Safe public smokes confirmed staff login with the temporary passcode returned an auth token without printing it, and Nacka availability returned `available` without creating a draft.
- 2026-06-29: T0176 was activated on branch `codex/t0176-frontend-redeem-rehearsal` after the park-test Live entry variation hotfix was squash-merged through PR #175.
- 2026-06-29: Added separate CDK/config gate `infra/config/park-test-frontend-redeem-rehearsal.json`, approval phrase `T0176_FRONTEND_REDEEM_REHEARSAL_APPROVED`, and `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL` / `T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS` environment mapping for `SessionHandler`.
- 2026-06-29: Runtime enforcement lets staff auth pass emergency stop only for T0166 or T0176 and, in T0176 mode, filters staff sessions to allowlisted check-in session ids and blocks non-allowlisted staff detail requests.
- 2026-06-29: Config guards require T0176 to name at least one allowed session id, require `staffAuthEnabled=true`, require `rollerRedeemWritesEnabled=false`, and reject combining T0176 with payment, lookup, add-on, settlement, redeem, draft-write, webhook, or guest-message gates.
- 2026-06-29: `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, and `npm --prefix infra run synth:park-test-frontend-redeem-rehearsal` passed.
- 2026-06-29: Opening CDK diff for `infra/config/park-test-frontend-redeem-rehearsal.json` changed only existing `SessionHandler` code/environment: `ENABLE_STAFF_AUTH=true`, `ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL=true`, and allowed session `jycs_mqtimdxf_bb33c94c`. No new AWS resources were planned.
- 2026-06-29: Deploy reached `UPDATE_COMPLETE`. Readback confirmed Session staff auth/T0176 on for `jycs_mqtimdxf_bb33c94c`, T0166 off, guest sends off, Redeem writes off, Booking draft/payment/add-on writes off, Lookup T0160/T0165/T0169/T0171 modes off, Webhook processing off, and `JUMPYARD_EMERGENCY_STOP=true`.
- 2026-06-29: Safe public API probe without a passcode returned `400 staff_passcode_required`, confirming staff auth is reachable without reading or printing the staff secret.
- 2026-06-29: T0176 did not create new AWS resources, call Roller Live, query/write Aurora, create bookings/payments/add-ons/refunds/redemptions/webhooks, process webhooks, send SMS/email, run visitor traffic, print secrets, print raw payment JWTs, or expose public PII.

## T0175 Payment Method Readiness Validation

- 2026-06-29: T0175 was activated on branch `codex/t0175-payment-method-readiness` after T0174 was squash-merged through PR #173.
- 2026-06-29: Inspected `RollerPaymentDropIn`, the vendored Roller `@roller/ecom-payments` wrapper, and BookingHandler payment settings normalization.
- 2026-06-29: Reviewed prior T0159/T0167/T0169 payment evidence and official Adyen Apple Pay/Swish/payment-method management docs.
- 2026-06-29: Public domain checks found both `https://jumpyard-check-in-park-test.pages.dev/.well-known/apple-developer-merchantid-domain-association` and `https://jumpyard-check-in.pages.dev/.well-known/apple-developer-merchantid-domain-association` returned HTTP `404` before the fix.
- 2026-06-29: Added the Adyen Apple Pay domain-association file to `jumpyard-checkin-phone/public/.well-known/apple-developer-merchantid-domain-association`; SHA-256 `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`, length `9094`.
- 2026-06-29: Added `jumpyard-checkin-phone/public/_headers` so Cloudflare Pages serves the association path as `text/plain`.
- 2026-06-29: `npm --prefix jumpyard-checkin-phone run build` passed and confirmed the association file exports to `jumpyard-checkin-phone/out/.well-known/apple-developer-merchantid-domain-association` with matching SHA-256.
- 2026-06-29: Documented `docs/t0175-payment-method-readiness.md` and D0131: Apple Pay should be actively unblocked before the park test, but still requires deploy, Roller/Adyen domain registration/approval, and iPhone smoke proof; card remains fallback if Apple Pay is not proven before Wednesday.
- 2026-06-29: Added FU-094 for Roller/Adyen/Pabel/Josh confirmation of Apple Pay enablement, park-test domain approval, merchant-validation errors, and separate Swish coexistence.
- 2026-06-29: `npm run validate` passed. `git diff --check` passed with existing CRLF normalization warnings only.
- 2026-06-29: T0175 did not deploy AWS, call/write Roller Live, query/write Aurora, create drafts/payments/refunds/redemptions/webhooks, process webhooks, send SMS/email, run visitor traffic, print secrets, print raw payment JWTs, or expose public PII.

## T0174 Ready-For-Entry Handout UI Validation

- 2026-06-29: T0174 was activated on branch `codex/t0174-ready-entry-handout-ui` after T0173 was squash-merged through PR #172.
- 2026-06-29: Renumbered the active readiness tickets so `T0174` is Ready-for-entry handout UI, `T0175` is Payment method readiness, and `T0176` is Frontend redeem rehearsal.
- 2026-06-29: Updated the phone confirmation screen to show a visible handoff QR/code and entry product/duration, and updated the admin handout grouping so wristband rows include duration when available.
- 2026-06-29: `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings only; `npm --prefix jumpyard-checkin-admin run lint` passed.
- 2026-06-29: `npm --prefix jumpyard-checkin-phone run build` and `npm --prefix jumpyard-checkin-admin run build` passed.
- 2026-06-29: Local phone/admin dev servers returned HTTP `200` at `http://127.0.0.1:3010/` and `http://127.0.0.1:3011/`.
- 2026-06-29: `npm run validate` passed. `git diff --check` passed with existing CRLF normalization warnings only.
- 2026-06-29: T0174 did not deploy AWS, deploy Cloudflare, call Roller Live APIs, query/write Aurora, create drafts/payments/add-ons/refunds/redemptions/webhooks, enable staff auth, process webhooks, send SMS/email, run visitor traffic, print secrets, or expose public PII.

## T0173 Webhook And Reconciliation Readiness Validation

- 2026-06-29: T0173 was activated on branch `codex/t0173-webhook-reconciliation-readiness` after T0172 was squash-merged through PR #171.
- 2026-06-29: Reviewed current webhook registration docs, park-test closed config, webhook handler gating/enrichment behavior, lookup reconciliation, linked add-on settlement, and redeem confirmation paths.
- 2026-06-29: Documented `docs/t0173-webhook-reconciliation-readiness.md` and D0129: first assisted park-test should keep `ENABLE_ROLLER_WEBHOOK_PROCESSING=false`, use scoped REST reads for payment/add-on state, and use synchronous Roller `POST /redemptions` success plus Aurora audit/manual fallback for redeem confirmation.
- 2026-06-29: `npm run validate` passed. `git diff --check` passed with existing CRLF normalization warnings only.
- 2026-06-29: T0173 did not deploy AWS, call Roller Live APIs, query/write Aurora, change Lambda runtime behavior, create drafts/payments/add-ons/refunds/redemptions/webhooks, enable staff auth, process webhooks, send SMS/email, run visitor traffic, print secrets, or expose public PII.

## T0172 Assisted Email Lookup Validation

- 2026-06-29: T0172 was activated on branch `codex/t0172-assisted-email-lookup` after T0171 was squash-merged through PR #170.
- 2026-06-29: Reviewed official Roller docs and support/academy material for booking detail, guest detail, API overview, Data API behavior, and Venue Manager booking search.
- 2026-06-29: Documented `docs/t0172-assisted-email-lookup.md` as a safe blocker: no public guest email lookup should be implemented until Roller confirms a narrow supported `email -> booking` API contract. Staff can search Roller Venue Manager by email and enter the discovered booking code into the T0171 PWA lookup.
- 2026-06-29: T0172 did not call Roller Live APIs, call AWS/Aurora, change Lambda runtime behavior, create drafts/payments/refunds/redemptions/webhooks, enable add-on writes, enable staff auth, process webhooks, send SMS/email, run visitor traffic, print secrets, or expose public PII.

## T0171 Park-Test Lookup Mode Validation

- 2026-06-29: T0171 was activated on branch `codex/t0171-park-test-lookup-mode`.
- 2026-06-29: Added separate assisted lookup config `infra/config/park-test-assisted-lookup.json`, approval phrase `T0171_ASSISTED_LOOKUP_APPROVED`, config guard fields `liveAssistedLookupApproval`, `liveAssistedLookupAllowedOperatingDates`, and `liveAssistedLookupVenueId`, plus Lookup Lambda env vars `ENABLE_T0171_ASSISTED_LOOKUP`, `T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES`, and `T0171_ASSISTED_LOOKUP_VENUE_ID`.
- 2026-06-29: Lookup runtime now accepts the assisted gate only for 6-9 digit booking-reference-like numeric ids or Roller UUIDs, rejects name/email/phone-style free-form lookup input, validates returned booking dates against the approved operating date list before Aurora writes, and rejects mismatched venue id if Roller returns one. Existing normalized booking items, add-ons, and tickets remain preserved in the lookup response/snapshot.
- 2026-06-29: `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, `npm --prefix infra run synth:park-test-assisted-lookup`, `node --check infra/lambda/lookup/index.js`, `npm run validate`, and `git diff --check` passed. The synth printed existing CDK notice `37949`; `git diff --check` reported existing CRLF normalization warnings only.
- 2026-06-29: The approved date window was expanded from only `2026-06-29` to `2026-06-29` through `2026-07-05` so office testing and the Wednesday park-test day are covered by the same assisted lookup gate.
- 2026-06-29: AWS identity was verified as account `376129878018`, region `eu-north-1`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-29: `npx cdk diff -c config=./config/park-test-assisted-lookup.json --profile wrlds-dev --method=template` showed only existing `LookupHandler` code plus three new T0171 environment variables. `npm --prefix infra run deploy:park-test-assisted-lookup` reached `UPDATE_COMPLETE`.
- 2026-06-29: Lambda readback confirmed lookup `ENABLE_T0171_ASSISTED_LOOKUP=true`, allowed dates `2026-06-29,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-04,2026-07-05`, venue `50871`, T0160/T0165/T0169 off, and `JUMPYARD_EMERGENCY_STOP=true`. Booking draft writes, add-on writes, redeem writes, staff auth, guest messaging, and webhook processing read back closed.
- 2026-06-29: Negative API checks passed: email-like input returned `403 live_lookup_not_allowed`; old booking `166490323` returned `403 live_lookup_not_allowed` because it is outside the approved operating date window.
- 2026-06-29: User-tested booking-code lookups for the office/park-test window succeeded; safe Aurora readback confirmed `166797742` and `166741849` were stored as fresh normalized Nacka snapshots with booking items/tickets present and no public PII output.
- 2026-06-29: T0171 was closed in source-of-truth docs: `CODEX_TASK.md` moved to `NO_ACTIVE_TICKET`, `REPO_CURRENT_STATE.md` moved to none active, `docs/roadmap/backlog.md` removed T0171 from Now, `docs/history/completed-tickets.md` lists T0171 as completed, and the next-ticket sequence was shifted to insert new T0172 assisted email lookup before webhook/reconciliation readiness.
- 2026-06-29: T0171 did not create drafts/payments/refunds/redemptions/webhooks, enable add-on writes, enable staff auth, process webhooks, send SMS/email, run visitor traffic, print secrets, or expose public PII.

## T0170 Park-Test Gate Naming And Runbook Validation

- 2026-06-29: T0170 was completed locally on branch `codex/t0170-park-test-gate-runbook`.
- 2026-06-29: Added `docs/t0170-park-test-gate-runbook.md` with human-readable gate names mapped to current CDK config keys, Lambda environment variables, default closed state, risk/owner posture, park-test-day plan, and close/readback guidance.
- 2026-06-29: Recorded D0124 so the friendly gate names are explicit aliases, not deployed runtime variable renames, and added FU-093 for any future dedicated runtime gate-name migration.
- 2026-06-29: T0170 did not rename AWS/CDK/Lambda variables, deploy AWS, call Roller, create drafts/payments, redeem tickets, process webhooks, send SMS/email, run visitor traffic, print secrets, print raw payment JWTs, or expose public PII.
- 2026-06-29: `npm --prefix infra run validate:config-guards`, `npm --prefix infra run synth:park-test`, `npm run validate`, and `git diff --check` passed. The first `npm run validate` attempt correctly failed because the completed-ticket archive count still said `167`; the count was updated to `168` and the rerun passed. `git diff --check` reported line-ending normalization warnings only. `npm --prefix infra run synth:park-test` printed existing CDK notice `37949`.

## T0169 Post-Payment Booking Sync Validation

- 2026-06-29: T0169 was validated on branch `codex/t0169-post-payment-booking-sync`.
- 2026-06-29: `node --check infra/lambda/lookup/index.js`, `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, `npm --prefix jumpyard-checkin-phone run lint`, `npm run validate`, `npm --prefix infra run validate:park-test-synth`, `npm --prefix infra run synth:park-test-payment-sync-smoke`, `npm run infra:check`, `npm --prefix jumpyard-checkin-phone run build`, and `git diff --check` passed before the controlled proof. Phone lint reported the existing `<img>` warnings only.
- 2026-06-29: AWS identity was verified for account `376129878018`, region `eu-north-1`. Deploying `infra/config/park-test-live-payment-sync-smoke.json` changed existing Lambda code/environment only and opened new-booking draft/payment writes plus draft-backed post-payment lookup.
- 2026-06-29: The park-test phone PWA was direct-deployed to Cloudflare Pages with API target `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`, and the stable URL `https://jumpyard-check-in-park-test.pages.dev/` served the park-test API bundle.
- 2026-06-29: The user completed one Live park-test PWA new-booking payment and reached safety/done; the previous payment-complete sync-failed state did not occur.
- 2026-06-29: A closed-gate check for unrelated booking `166490323` returned `live_lookup_not_allowed`, confirming T0169 did not open broad existing-booking lookup.
- 2026-06-29: Normal `infra/config/park-test.json` was redeployed after proof. Readback confirmed booking draft/payment gates, T0169 post-payment sync, lookup, existing-booking add-ons, redeem, staff auth, webhook processing, and guest message sends closed again, with `JUMPYARD_EMERGENCY_STOP=true`.
- 2026-06-29: T0169 was closed in source-of-truth docs: `CODEX_TASK.md` moved to `NO_ACTIVE_TICKET`, `REPO_CURRENT_STATE.md` moved to none active, `docs/roadmap/backlog.md` removed T0169 from Now, and `docs/history/completed-tickets.md` lists T0169 as completed.

## T0168 New-Booking Add-On Visibility Validation

- 2026-06-29: T0168 was completed on branch `codex/t0168-new-booking-addon-visibility`.
- 2026-06-29: Code trace found the phone UI hides new-booking add-ons unless availability returns a priced/mappable `type="addon"` product with max quantity above zero.
- 2026-06-29: Code trace found the BookingHandler only exposed known Nacka Live add-on ids/prices through the old T0162 existing-booking add-on smoke fallback, so T0167's T0159 new-booking payment proof could create the entry booking but did not return priced add-ons to the frontend.
- 2026-06-29: Updated `infra/lambda/booking/index.js` to separate read-only `LIVE_PHONE_ADDON_PRODUCTS` from the T0162 write/allowlist gate. Known Live add-ons are SkyRider parent `970335` with child `970336`, socks `970338`, lock `970334`, and coffee `970352`.
- 2026-06-29: T0168 did not call Roller Live, deploy AWS, open Lambda gates, write Aurora rows, create drafts/bookings/payments/refunds/redemptions/webhooks, process webhooks, send SMS/email, run visitor traffic, print secrets, print raw payment JWTs, or expose public PII.
- 2026-06-29: `node --check infra/lambda/booking/index.js`, `npm --prefix infra run build`, `npm --prefix jumpyard-checkin-phone run lint`, `npm run validate`, `git diff --check`, and `npm run infra:check` passed. Frontend lint reported four existing `@next/next/no-img-element` warnings only. `git diff --check` reported line-ending normalization warnings only.

## T0167 Receipt And Confirmation Handling Validation

- 2026-06-25: T0167 was activated on branch `codex/t0167-receipt-confirmation-handling` after T0166 was squash-merged through PR #165.
- 2026-06-25: Code trace found the phone frontend sent `sendConfirmations=false` for both new-booking drafts and existing-booking add-on drafts, while the booking Lambda already normalized and forwarded `sendConfirmations` to Roller `POST /bookings/draft`.
- 2026-06-25: Updated `jumpyard-checkin-phone/src/flow/cloudClient.ts` so `createDraftBooking` and `createAddProductDraft` send `sendConfirmations=true`.
- 2026-06-25: Updated `infra/lambda/booking/index.js` so `booking.draft_published_no_payment`, `booking.draft_succeeded`, and `booking.add_product_draft_succeeded` event payloads include the safe boolean `sendConfirmations`.
- 2026-06-25: Updated payment-complete guest copy so new-booking and add-on payment states say Roller sends confirmation/receipt to the booking email.
- 2026-06-25: Documented the receipt model in `docs/t0167-receipt-confirmation-handling.md`: Roller remains the receipt sender for park-test, JumpYard does not send a separate receipt email in this ticket, and actual Live email delivery must be proven on the next controlled paid PWA transaction after deployment.
- 2026-06-25: `node --check infra/lambda/booking/index.js`, `npm --prefix infra run build`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, `git diff --check`, and `npm run infra:check` passed. Frontend lint reported four existing `@next/next/no-img-element` warnings only.
- 2026-06-25: T0167 did not create AWS resources, deploy, create a new paid Live smoke, refund, redeem, process webhooks, send SMS/email, run visitor traffic, print secrets, print/persist raw payment JWTs, or expose public PII output.

## T0166 Controlled Live Redeem Smoke Validation

- 2026-06-25: T0166 was activated on branch `codex/t0166-controlled-live-redeem-smoke` after T0165 was squash-merged through PR #164.
- 2026-06-25: Added separate CDK/config gate `infra/config/park-test-live-redeem-smoke.json`, approval phrase `T0166_CONTROLLED_LIVE_REDEEM_SMOKE_APPROVED`, and `ENABLE_T0166_LIVE_REDEEM_SMOKE` / `T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS` environment mapping for `SessionHandler` and `RedeemHandler`.
- 2026-06-25: Config validation now requires exact redeem allowlist identifiers, staff auth enabled, and redeem writes enabled only when the T0166 approval phrase is present; without the approval phrase, park-test staff auth and redeem writes must stay disabled.
- 2026-06-25: `npm --prefix infra run build`, `node --check infra\lambda\redeem\index.js`, `node --check infra\lambda\session\index.js`, `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, and `npm --prefix infra run synth:park-test-redeem-smoke` passed.
- 2026-06-25: AWS identity verified account `376129878018`, region `eu-north-1`, through profile `wrlds-dev`.
- 2026-06-25: Opening CDK diff for `infra/config/park-test-live-redeem-smoke.json` changed only existing Lambda code/environment. No new AWS resources were planned.
- 2026-06-25: Opening deploy reached `UPDATE_COMPLETE`; readback confirmed lookup allowlist `166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088`, staff auth `true`, redeem writes `true`, T0166 `true`, redeem allowlist `166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088,166490323-560714728`, emergency stop `true`, and draft/add-on/webhook/SMS/email gates off.
- 2026-06-25: The controlled phone/admin flow looked up booking `166490323`, started session `jycs_mqtimdxf_bb33c94c`, completed guest safety, and moved the session to `ready_for_staff`.
- 2026-06-25: The first staff redeem attempt failed closed because the redeem handler still rejected Roller Live config outside Playground; no Roller redemption call was made before this guard was corrected.
- 2026-06-25: A later staff redeem attempt failed closed with `no_redeemable_tickets` because the final Roller refresh replaced local product classification with less complete detail; no Roller redemption call was made before this was corrected.
- 2026-06-25: The final T0166 staff redeem retry returned HTTP `200`, status `redeemed`, Roller response ref `roller_redemptions:http_200`, and redeemed ticket id `166490323-560714728`.
- 2026-06-25: Safe Aurora readback showed session `jycs_mqtimdxf_bb33c94c` status `redeemed`, handoff `completed`, selected ticket `166490323-560714728`, ticket `166490323-560714728` with `redeem_status_last_seen='redeemed'`, and redeem attempt `redeem_attempt:701798...` status `redeemed`.
- 2026-06-25: Closing deploy with normal `park-test.json` reached `UPDATE_COMPLETE`; readback confirmed lookup/staff/redeem gates closed, draft/add-on/webhook/SMS/email gates closed, and emergency stop still `true`.
- 2026-06-25: Closed-gate API checks returned HTTP `409` with `live_lookup_disabled` for lookup and HTTP `409` with `staff_auth_disabled` for staff auth.
- 2026-06-25: Closing `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
- 2026-06-25: T0166 did not create new AWS resources, create additional bookings/payments/refunds, enable broad lookup, leave staff auth or redeem enabled, process webhooks, send SMS/email, run normal visitor traffic, print secrets, print/persist raw payment JWTs, or expose public PII output.

## T0165 Linked Add-On Settlement Reconciliation Validation

- 2026-06-25: T0165 was activated on branch `codex/t0165-linked-addon-settlement-reconciliation` after T0164 completed but before T0164 docs were committed.
- 2026-06-25: Added separate CDK/config gate `infra/config/park-test-live-addon-settlement-smoke.json`, mapped `ENABLE_T0165_LINKED_ADDON_SETTLEMENT` and `T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS` to `LookupHandler`, and kept the gate independent from T0160 lookup smoke and T0162 add-on payment smoke.
- 2026-06-25: Updated lookup/webhook reconciliation so a settled linked add-on Roller booking marks both the matching `prepayment_booking_drafts` row and `booking_links` row as `published`, sets amount owing to `0`, records linked booking reference, and writes `prepayment_draft.published` plus `booking_link.published` events.
- 2026-06-25: `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, `npm --prefix infra run synth:park-test-addon-settlement-smoke`, and `git diff --check` passed before the smoke. Config guards prove T0165 settlement allows only exact identifiers and still blocks draft writes, redeem writes, webhook processing, staff auth, SMS, and email.
- 2026-06-25: AWS identity verified account `376129878018`, region `eu-north-1`, through profile `wrlds-dev`.
- 2026-06-25: Before-state Aurora readback showed prepayment draft `jypd_8bdb1d1035b84d30b2` and booking link `jyl_f35c09033efb40ba94` both `payment_pending`, link `linked_booking_reference=null`, and no settlement events for linked unique id `4a092241-6947-436a-97ea-04813a8404aa`.
- 2026-06-25: Opening CDK diff for `infra/config/park-test-live-addon-settlement-smoke.json` changed only existing `LookupHandler` code/env and existing `WebhookHandler` code; no new AWS resources were planned.
- 2026-06-25: Opening deploy reached `UPDATE_COMPLETE`; readback confirmed T0165 settlement `true`, allowlist `166497194,4a092241-6947-436a-97ea-04813a8404aa`, T0160 lookup smoke `false`, emergency stop `true`, and no booking/redeem/webhook/staff/SMS/email gates opened.
- 2026-06-25: Public park-test API lookup for `166497194` returned HTTP `200`, status `found`, Roller unique id `4a092241-6947-436a-97ea-04813a8404aa`, status/payment status `Paid`, total `45`, amount owing `0`, one item, one ticket, source `roller`, and `refreshedFromRoller=true`.
- 2026-06-25: After-state Aurora readback showed prepayment draft `jypd_8bdb1d1035b84d30b2` is `published` with amount owing `0`, booking link `jyl_f35c09033efb40ba94` is `published` with linked booking reference `166497194`, and settlement events `prepayment_draft.published` plus `booking_link.published` exist.
- 2026-06-25: Closing deploy with normal `park-test.json` reached `UPDATE_COMPLETE`; readback confirmed T0160/T0165 lookup gates closed, booking draft/T0159/T0162 gates closed, webhook processing closed, and emergency stop still `true`.
- 2026-06-25: Closed-gate API checks returned HTTP `409` with `live_lookup_disabled` for lookup and HTTP `409` with `live_addon_smoke_disabled` for add-product quote.
- 2026-06-25: Closing `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
- 2026-06-25: T0165 did not create new AWS resources, create payments, refund, redeem, process webhooks, send SMS/email, enable staff auth, run normal visitor traffic, print secrets, print/persist raw payment JWTs, print full PII, mutate the original Roller booking, or leave public gates open.

## T0164 Existing-Booking Add-On Payment Smoke Validation

- 2026-06-25: T0164 was activated on branch `codex/t0164-existing-booking-addon-payment-smoke` after T0163 was squash-merged through PR #163.
- 2026-06-25: AWS identity verified account `376129878018`, region `eu-north-1`, through profile `wrlds-dev`.
- 2026-06-25: Opening CDK diff for `infra/config/park-test-live-addon-smoke.json` changed only existing `LookupHandler` and `BookingHandler` environment variables: exact lookup/add-on allowlists for `166490323`, booking draft writes on, and T0162 add-on smoke on. No new AWS resources were planned.
- 2026-06-25: Opening deploy reached `UPDATE_COMPLETE`; readback confirmed lookup smoke `true`, add-on smoke `true`, draft writes `true`, allowlists `166490323`, emergency stop `true`, T0159 internal payment smoke `false`, redeem off, webhook processing off, staff auth off, SMS off, and email off.
- 2026-06-25: Preflight `POST /v1/check-in/lookup` returned HTTP `200`, status `found`, payment status `Paid`, amount owing `0`, eligibility `ready`, and no raw PII in the summarized output.
- 2026-06-25: Preflight `POST /v1/bookings/166490323/add-products/quote` returned HTTP `200`, status `quoted`, mode `separate_draft_booking`, one item, total `45`, amount owing `45`, and `wroteBooking=false`.
- 2026-06-25: User completed the phone frontend flow on `https://jumpyard-check-in-park-test.pages.dev`, added one socks add-on, and reported successful payment.
- 2026-06-25: Aurora Data API readback found add-product prepayment draft `jypd_8bdb1d1035b84d30b2`, Roller draft unique id `4a092241-6947-436a-97ea-04813a8404aa`, original booking `166490323`, add-on group `jyao_6024ae4dcd3b43ea9a`, total `4500`, amount owing `4500`, `payment_jwt_present=true`, `payment_config_available=true`, and local status `payment_pending`.
- 2026-06-25: Aurora link readback found booking link `jyl_f35c09033efb40ba94`, original booking `166490323`, linked Roller unique id `4a092241-6947-436a-97ea-04813a8404aa`, linked booking reference `null`, and status `payment_pending`.
- 2026-06-25: Aurora event readback found `booking.add_product_quote_succeeded` and `booking.add_product_draft_succeeded` events for `166490323`.
- 2026-06-25: Direct read-only Roller Live verification of linked unique id `4a092241-6947-436a-97ea-04813a8404aa` returned HTTP `200`, booking reference `166497194`, status `Paid`, total `45`, amount owing `0`, one item, and one ticket. Secret values and raw payment JWT values were not printed.
- 2026-06-25: Closing deploy with normal `park-test.json` reached `UPDATE_COMPLETE`; readback confirmed lookup smoke `false`, add-on smoke `false`, draft writes `false`, allowlists empty, and emergency stop `true`.
- 2026-06-25: Closed-gate API checks returned HTTP `409` with `live_lookup_disabled` for lookup and HTTP `409` with `live_addon_smoke_disabled` for add-product quote.
- 2026-06-25: Closing `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
- 2026-06-25: T0164 did not create AWS resources, leave public gates open, mutate the original Roller booking directly, redeem tickets, process webhooks, send SMS/email, run normal visitor traffic, print secrets, print/persist raw payment JWTs, or print full PII.

## T0163 Live Existing-Booking Contact Resolver Validation

- 2026-06-25: T0163 was activated on branch `codex/t0163-live-booking-contact-resolver` after T0162 was squash-merged through PR #162.
- 2026-06-25: AWS identity verified account `376129878018`, region `eu-north-1`, through profile `wrlds-dev`.
- 2026-06-25: Added `infra/scripts/roller-live-contact-resolver.ts` and npm scripts `contact:live:park-test` plus `validate:roller-live-contact-resolver`.
- 2026-06-25: `npm --prefix infra run validate:roller-live-contact-resolver` passed; guard self-test allowed only `GET /bookings/166490323` and `GET /guests/{id}` and rejected 10 write/sensitive endpoint cases.
- 2026-06-25: `npm --prefix infra run build` and `node --check infra/lambda/booking/index.js` passed.
- 2026-06-25: Guarded Live contact resolver run called only Roller auth, `GET /bookings/166490323`, and `GET /guests/{customerId}`; booking detail had no direct contact fields, `body.customerId` was present, and guest detail returned complete first/last/email/phone contact without printing full PII.
- 2026-06-25: Updated `BookingHandler` to fall back to `GET /guests/{customerId}` server-side when existing-booking add-on contact is incomplete after booking detail and local contact sources.
- 2026-06-25: Pre-deploy CDK diff for normal `park-test.json` showed only existing `BookingHandler` Lambda code asset changed; no environment gates or new resources changed.
- 2026-06-25: Closed-config deploy reached `UPDATE_COMPLETE`; post-deploy readback confirmed `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false`, `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=false`, `ENABLE_T0162_LIVE_ADDON_SMOKE=false`, and empty T0162 allowlist.
- 2026-06-25: Post-deploy `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
- 2026-06-25: Closeout validation `npm run validate`, `npm run infra:check`, `git diff --check`, and `node --check infra/lambda/booking/index.js` passed.
- 2026-06-25: T0163 did not create AWS resources, open public API gates, write Aurora rows, create add-on drafts/payments, redeem tickets, process webhooks, send SMS/email, run visitor traffic, print secrets, print raw payment JWTs, or print full PII.

## T0162 Existing-Booking Add-On Smoke Validation

- 2026-06-25: T0162 was activated on branch `codex/t0162-existing-booking-addon-smoke` for controlled Live booking `166490323`.
- 2026-06-25: `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, `npm run validate`, `npm run infra:check`, and `git diff --check` passed.
- 2026-06-25: Opening CDK diff for `infra/config/park-test-live-addon-smoke.json` changed only existing `LookupHandler` environment and existing `BookingHandler` code/environment; no new AWS resources were planned.
- 2026-06-25: Opening deploy reached `UPDATE_COMPLETE`; readback confirmed exact lookup allowlist `166490323`, T0162 add-on allowlist `166490323`, T0159 payment smoke off, emergency stop on, redeem off, webhook processing off, staff auth off, SMS off, and email off.
- 2026-06-25: API lookup for `166490323` returned `found`, source Roller Live, eligibility `ready`, and no public raw customer name/email/phone fields.
- 2026-06-25: API availability for 2026-06-25 11:00 returned Live add-ons SkyRider `970336`, socks `970338`, lock `970334`, and coffee `970352`.
- 2026-06-25: Add-product quote for one socks add-on failed closed with `original_booking_contact_unresolved`; safe Aurora readback found one `roller_bookings` row for `166490323`, no original customer id, no matching local contact, no add-on draft rows, no booking links, and no add-product events.
- 2026-06-25: Closing deploy with normal `park-test.json` reached `UPDATE_COMPLETE`; readback confirmed lookup/add-on/draft gates closed again. Closed-gate lookup returned `live_lookup_disabled`, and closed-gate add-product quote returned `live_addon_smoke_disabled`.

## T0161 Live Catalog And Booking Index Readiness Validation

- 2026-06-24: T0161 was activated after user approval on branch `codex/t0161-live-catalog-index-readiness`.
- 2026-06-24: Added `infra/scripts/roller-live-catalog-index-readiness.ts` and npm scripts `catalog:index:live:park-test` plus `validate:roller-live-catalog-index-readiness`.
- 2026-06-24: `npm --prefix infra run build` passed.
- 2026-06-24: `npm --prefix infra run validate:roller-live-catalog-index-readiness` passed; guard self-test allowed only venue/products/availability reads and rejected 11 write/sensitive endpoint cases.
- 2026-06-24: Initial Live readiness run stopped before AWS/Roller calls because AWS SSO had expired; `aws sso login --profile wrlds-dev` refreshed the session.
- 2026-06-24: `npx ts-node --prefer-ts-exts scripts/roller-live-catalog-index-readiness.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29` passed.
- 2026-06-24: Live readiness confirmed AWS account `376129878018`, region `eu-north-1`, Roller Live `https://api.roller.app`, venue `JumpYard Nacka Forum` id `50871`, 100 top-level products, 506 flattened product rows, 6/6 required entry parent products, 4/4 required add-ons, and product availability HTTP `200` with 108 online-sales-open sessions.
- 2026-06-24: Live add-on ids documented for T0162: SkyRider parent `970335` with availability child such as `970336`, socks `970338`, lock `970334`, and coffee `970352`.
- 2026-06-24: T0161 selected REST-on-demand lookup by guest-entered booking code for the first assisted park test; broad same-day booking export/Data API indexing remains deferred until explicitly scoped.
- 2026-06-24: T0161 did not create AWS resources, deploy, write Aurora rows, read bookings/Data API/customers/guests/tickets/payments, create drafts/payments/refunds/redemptions/webhooks, open public API gates, enable webhook processing/staff auth/SMS/email, print secrets, or expose public PII.

## T0160 Live Existing-Booking Lookup Smoke Validation

- 2026-06-24: T0160 was activated after user approval on branch `codex/t0160-live-existing-booking-lookup-smoke`, created from updated `main` after T0159 was squash-merged.
- 2026-06-24: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-24: Added `infra/config/park-test-live-lookup-smoke.json`, T0160 approval phrase `T0160_LIVE_LOOKUP_SMOKE_APPROVED`, exact lookup identifier allowlist, config guard tests, park-test synth tests, and narrow lookup-Lambda runtime handling for the controlled Live lookup smoke.
- 2026-06-24: `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, `git diff --check`, `npm run validate`, and `npm run infra:check` passed. CDK output included existing notice `37949`.
- 2026-06-24: AWS identity confirmed account `376129878018`, region `eu-north-1`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-24: Opening diff for `infra/config/park-test-live-lookup-smoke.json` changed only `LookupHandler` code plus `ENABLE_T0160_LIVE_LOOKUP_SMOKE` and `T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS`.
- 2026-06-24: Opening deploy used `npx cdk deploy -c config=./config/park-test-live-lookup-smoke.json --profile wrlds-dev --require-approval never`; CloudFormation stack `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE`. No new AWS resources were created.
- 2026-06-24: Open-gate Lambda readback confirmed lookup `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_T0160_LIVE_LOOKUP_SMOKE=true`, allowlist `166447399,68b3bbb4-9a46-4379-96ac-bc7157f2fb3e`, and `JUMPYARD_ENVIRONMENT=park-test`.
- 2026-06-24: Park-test API lookup smoke for booking reference `166447399` returned HTTP `200`, status `found`, Roller Live status `Paid`, payment status `Paid`, total `200`, amount owing `0`, date `2026-06-24`, start `12:00`, one item, one ticket, eligibility `ready`, source `roller`, environment `live`, and no public PII fields in the summarized response.
- 2026-06-24: Park-test API lookup smoke for unique id `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e` returned HTTP `200`, status `found`, source `jumpyard_cloud`, lookup path `aurora:roller_unique_id`, freshness `fresh`, and no public PII fields in the summarized response.
- 2026-06-24: Negative park-test API lookup smoke for identifier `123456789` returned HTTP `403`, status `blocked`, and error code `live_lookup_not_allowed`.
- 2026-06-24: Aurora Data API readback found one normalized Live booking row for `166447399`/`68b3bbb4-9a46-4379-96ac-bc7157f2fb3e`, status `Paid`, payment status `Paid`, amount owing `0`, total `20000` cents, date `2026-06-24`, start `12:00:00`, freshness `fresh`, source `roller_live_lookup`, item count `1`, and ticket count `1`.
- 2026-06-24: Aurora Data API readback found prepayment draft `jypd_56a8f1ca817c42a4b7` moved to status `published`, amount owing `0`, total `20000` cents, `payment_jwt_present=true`, and `payment_config_available=true`.
- 2026-06-24: Aurora `event_log` readback found one `prepayment_draft.published` event for subject `166447399`.
- 2026-06-24: Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; CloudFormation stack `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE`.
- 2026-06-24: Closed-gate Lambda readback confirmed `ENABLE_T0160_LIVE_LOOKUP_SMOKE=false`, allowlist empty, `JUMPYARD_EMERGENCY_STOP=true`, and `JUMPYARD_ENVIRONMENT=park-test`.
- 2026-06-24: Closed-gate API smoke for `166447399` returned HTTP `409`, status `blocked`, and error code `live_lookup_disabled`.
- 2026-06-24: Closing `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` showed no differences.
- 2026-06-24: T0160 did not create bookings/payments/refunds/redemptions/webhooks, leave lookup enabled, enable public draft/payment writes, enable redeem writes, enable webhook processing, enable staff auth, send SMS/email, create new AWS resources, print secrets, print/persist raw payment JWTs, or expose raw names/email/phone in public validation output.

## T0159 Internal Live Payment Smoke Validation

- 2026-06-24: T0159 was activated after user approval and branch `codex/t0159-internal-live-payment-smoke` was created from updated `main` after T0158 was squash-merged.
- 2026-06-24: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-24: Added `infra/config/park-test-live-payment-smoke.json`, T0159 approval phrase `T0159_INTERNAL_LIVE_PAYMENT_SMOKE_APPROVED`, config guard tests, park-test synth tests, and narrow booking-Lambda runtime handling for the internal Live payment smoke.
- 2026-06-24: `npm run validate`, `npm --prefix infra run check`, `npm --prefix infra run build`, `npm --prefix infra run validate:park-test-synth`, and CDK diff checks passed during the ticket. CDK output included existing notice `37949`.
- 2026-06-24: AWS identity confirmed account `376129878018`, region `eu-north-1`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-24: Opening deploy used `npx cdk deploy -c config=./config/park-test-live-payment-smoke.json --profile wrlds-dev --require-approval never`; CloudFormation stack `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE`. No new AWS resources were created.
- 2026-06-24: Open-gate Lambda readback confirmed booking `JUMPYARD_EMERGENCY_STOP=true`, `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=true`, and `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES=true`; redeem, webhook, staff auth, and guest sends remained disabled.
- 2026-06-24: Park-test API availability smoke from phone origin returned HTTP `200` for date `2026-06-24`, start times `11:30`, `12:00`, `12:30`, product `1189808`, and `wroteBooking=false`.
- 2026-06-24: Park-test API quote smoke returned HTTP `200` for one `1189808` item, total `200`, tax `11.32`, fees `0`, discount `0`, amount owing `200`, and `wroteBooking=false`.
- 2026-06-24: User completed the real internal payment through `https://jumpyard-check-in-park-test.pages.dev`; user observed a `200 SEK` card charge and confirmed the booking existed in Roller.
- 2026-06-24: Read-only Roller Live verification with `GET /bookings/{uniqueId}` returned HTTP `200` for unique id `68b3bbb4-9a46-4379-96ac-bc7157f2fb3e`, booking reference `166447399`, status `Paid`, total `200`, amount owing `0`, and one item. Secret values and raw payment JWT values were not printed.
- 2026-06-24: Aurora Data API readback found safe prepayment draft `jypd_56a8f1ca817c42a4b7`, status `payment_pending`, total `20000`, amount owing `20000`, `payment_jwt_present=true`, and `payment_config_available=true`. `jumpyard.roller_bookings` remained empty.
- 2026-06-24: Post-payment phone sync failed with the expected fallback card because `POST /v1/check-in/lookup` returned HTTP `500`, status `config_error`, code `lookup_config_error`; root cause is that lookup Lambda still blocks Roller Live and T0160 owns that gate.
- 2026-06-24: Closing deploy used `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never`; the close diff changed only `ENABLE_ROLLER_BOOKING_DRAFT_WRITES` and `ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES` from `true` to `false`.
- 2026-06-24: Post-close Lambda readback confirmed booking draft writes and T0159 override `false`, emergency stop `true`, lookup emergency stop `true`, redeem writes `false`, and webhook processing `false`.
- 2026-06-24: T0159 did not create new AWS resources, leave draft writes enabled, enable Live lookup sync, enable webhook processing, enable redeem writes, enable staff auth, enable guest message sends, send SMS/email, print secrets, print/persist raw payment JWTs, or implement refund/cancel automation.

## T0158 Controlled Live Draft Smoke Validation

- 2026-06-23: T0158 was activated after user approval and branch `codex/t0158-controlled-live-draft-smoke` was created from the current T0157 working tree.
- 2026-06-23: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-23: Added guarded local Roller Live draft smoke tooling in `infra/scripts/roller-live-draft-smoke.ts`, plus `npm --prefix infra run validate:roller-live-draft-smoke` and `npm --prefix infra run draft:live:park-test`.
- 2026-06-23: `npm --prefix infra run build`, `npm --prefix infra run validate:roller-live-draft-smoke`, and `node scripts/validate-current-ticket.js` passed before the Live write. The self-test allows only `GET /product-availability`, `POST /bookings/draft/costs`, and `POST /bookings/draft`, blocks publish/payment/redeem/webhook/customer/guest/booking-detail endpoints, and requires both `--apply` and `ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE`.
- 2026-06-23: First draft-smoke attempt stopped before Roller calls because AWS SSO had expired. `aws sso login --profile wrlds-dev` refreshed the session.
- 2026-06-23: Guarded draft smoke passed with `ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE=I_UNDERSTAND_THIS_CREATES_ONE_ROLLER_LIVE_DRAFT_FOR_JUMPYARD_NACKA` and direct command `npx ts-node --prefer-ts-exts scripts/roller-live-draft-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29 --start-time 10:00 --apply`.
- 2026-06-23: The smoke used AWS account `376129878018`, Roller Live base `https://api.roller.app`, and credential source `/jumpyard-check-in-park-test/roller/credentials` without printing secret values.
- 2026-06-23: The smoke made exactly one Roller auth request, one `GET /product-availability`, one `POST /bookings/draft/costs`, and one `POST /bookings/draft`. Selected Nacka parent product `1189805`, child product `1189808`, `Biljetter (200 kr)`, date `2026-06-29`, start `10:00`, quantity `1`, capacity remaining `160`.
- 2026-06-23: Roller Live quote returned HTTP `200`, total `200`, tax `11.32`, fees `0`, discount `0`, and amount owing `200`. Draft creation returned HTTP `201`, Roller draft unique id `f81e46e5-5cf7-4193-b578-44a1b8140599`, no booking reference, and `paymentJwtPresent=true`.
- 2026-06-23: Read-only Lambda environment checks confirmed park-test emergency stop stayed `true`; booking draft writes, redeem writes, staff auth, guest message sends, and webhook processing stayed `false`.
- 2026-06-23: Read-only Aurora row-count check returned `0` rows for `prepayment_booking_drafts`, `event_log`, `idempotency_records`, and `roller_webhook_events`.
- 2026-06-23: T0158 did not deploy, create/update AWS resources, open public API/Lambda draft writes, call the public park-test API, write Aurora rows, start payment, publish a draft, redeem tickets, enable webhook processing, send frontend visitor traffic, send SMS/email, or print secret/JWT values.

## T0157 Live Quote/Cost Smoke Validation

- 2026-06-23: T0157 was activated after user approval and the branch `codex/t0157-live-quote-cost-smoke` was created from `main`.
- 2026-06-23: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-23: Added guarded local Roller Live quote/cost smoke tooling in `infra/scripts/roller-live-quote-smoke.ts`, plus `npm --prefix infra run validate:roller-live-quote-smoke` and `npm --prefix infra run quote:live:park-test`.
- 2026-06-23: `npm --prefix infra run build` and `npm --prefix infra run validate:roller-live-quote-smoke` passed. The self-test allows only `GET /product-availability` and `POST /bookings/draft/costs`, and blocks draft, publish, payment, redeem, webhook, customer, guest, and booking-detail endpoints.
- 2026-06-23: Read-only Lambda environment checks confirmed park-test emergency stop stayed `true`; booking draft writes, redeem writes, staff auth, guest message sends, and webhook processing stayed `false`.
- 2026-06-23: Initial `npm --prefix infra run quote:live:park-test -- --date 2026-06-29` stopped at local argument validation before AWS or Roller requests because Windows/npm did not forward the `--date` flag as expected.
- 2026-06-23: Direct smoke command `npx ts-node --prefer-ts-exts scripts/roller-live-quote-smoke.ts --config ./config/park-test.json --profile wrlds-dev --date 2026-06-29` passed. It used AWS account `376129878018`, Roller Live base `https://api.roller.app`, and credential source `/jumpyard-check-in-park-test/roller/credentials` without printing secret values.
- 2026-06-23: The smoke made exactly one Roller auth request, one `GET /product-availability`, and one `POST /bookings/draft/costs`. Selected Nacka parent product `1189805`, child product `1189808`, `Biljetter (200 kr)`, date `2026-06-29`, start `10:00`, quantity `1`, capacity remaining `160`.
- 2026-06-23: Roller Live quote returned HTTP `200`, total `200`, tax `11.32`, fees `0`, discount `0`, and amount owing `200`. The Live costs response shape used `bookingCosts`.
- 2026-06-23: T0157 did not deploy, create/update AWS resources, call the public park-test API, write Aurora rows, create a booking draft, start payment, redeem tickets, enable webhook processing, send frontend visitor traffic, send SMS/email, or print secret values.

## T0156 Park-Test Frontend Target Validation

- 2026-06-23: T0156 was activated after T0155 was squash-merged to `main` and the branch `codex/t0156-park-test-frontend-target` was created from updated `main`.
- 2026-06-23: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-23: Inspected phone/admin API base URL wiring. Both apps default to dev API `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` and support `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL`; neither source file hardcodes the park-test API.
- 2026-06-23: Added park-test target docs for Cloudflare Pages projects `jumpyard-check-in-park-test` and `jumpyard-checkin-admin-park-test`, both using `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`.
- 2026-06-23: Updated `infra/config/park-test.json` CORS origins to `https://jumpyard-check-in-park-test.pages.dev` and `https://jumpyard-checkin-admin-park-test.pages.dev`, and pointed disabled guest-message base URLs at the park-test phone Pages URL.
- 2026-06-23: Updated admin CSP `connect-src` to allow the park-test API while preserving the dev API.
- 2026-06-23: `npx --yes wrangler whoami` reported Wrangler was not logged in, so T0156 did not create or update Cloudflare Pages projects from the local terminal.
- 2026-06-23: `node scripts/validate-park-test-frontend-target.js`, `npm --prefix infra run validate:config-guards`, and `npm --prefix infra run validate:park-test-synth` passed.
- 2026-06-23: Phone build passed with `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`; Next printed the existing `baseline-browser-mapping` age warning.
- 2026-06-23: Admin build passed with the same park-test API env var; Next printed the existing `baseline-browser-mapping` age warning.
- 2026-06-23: AWS identity check confirmed account `376129878018` and assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-23: Pre-deploy CDK diff for park-test showed only API Gateway CORS origins and `SessionHandler` disabled guest-message base URL environment values changing.
- 2026-06-23: `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never` updated `jumpyard-check-in-park-test-stack`; CloudFormation reached `UPDATE_COMPLETE`.
- 2026-06-23: Post-deploy CDK diff for park-test showed no differences.
- 2026-06-23: CORS preflight returned HTTP `204` with matching `access-control-allow-origin` for `https://jumpyard-check-in-park-test.pages.dev` on `OPTIONS /v1/check-in/lookup` and for `https://jumpyard-checkin-admin-park-test.pages.dev` on `OPTIONS /v1/staff/auth/login`.
- 2026-06-23: T0156 did not call Roller, create quotes/drafts/bookings/payments, redeem tickets, enable webhook processing, insert Aurora rows, send SMS/email, print secret values, duplicate frontend source, or change dev frontend/API targets.
- 2026-06-23: Closeout validation passed: `npm run validate`, `npm run infra:check`, and `git diff --check`. CDK synth printed existing CLI notice `37949`; `git diff --check` printed CRLF conversion notices only.

## T0155 Live Webhook Registration Validation

- 2026-06-23: T0155 was activated after T0154 was squash-merged to `main` and the branch `codex/t0155-register-live-webhook` was created from updated `main`.
- 2026-06-23: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-23: AWS SSO profile `wrlds-dev` was refreshed with user-assisted browser login.
- 2026-06-23: Added `infra/scripts/roller-live-webhook-register.ts`, `npm --prefix infra run register:webhook:live:park-test`, `npm --prefix infra run register:webhook:live:park-test:apply`, and `npm --prefix infra run validate:roller-live-webhook-register`.
- 2026-06-23: `npm --prefix infra run build` passed.
- 2026-06-23: `npm --prefix infra run validate:roller-live-webhook-register` passed, proving the write phrase is required and non-scoped Roller endpoints are blocked.
- 2026-06-23: Initial dry-run/list mode confirmed AWS account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack` status `UPDATE_COMPLETE`, Roller Live base URL `https://api.roller.app`, one existing Live webhook, and no exact match for the park-test endpoint. No webhook was created in dry-run mode.
- 2026-06-23: Guarded registration used `ROLLER_LIVE_WEBHOOK_REGISTER_ALLOW_WRITE=I_UNDERSTAND_THIS_REGISTERS_LIVE_WEBHOOK_FOR_JUMPYARD_NACKA` and registered the missing park-test Live webhook.
- 2026-06-23: Follow-up list mode confirmed two Live webhooks total and exactly one enabled match for `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`: webhook id `1465`, events `Created`, `Updated`, `Cancelled`, and `tickets=true`.
- 2026-06-23: Safe intake smoke in guarded apply mode reused existing webhook `1465` without creating a duplicate, returned HTTP `200` with `ignored_disabled`, and confirmed Aurora rows for smoke event `t0155-smoke-20260623060627-1d738702-a5f3-41a6-a75f-0fc005d12a39` stayed `0` before and `0` after.
- 2026-06-23: T0155 did not create/update AWS resources, enable park-test webhook processing, insert webhook rows, connect frontend traffic, create bookings/drafts/payments, redeem tickets, send SMS/email, print secret values, or touch the dev Playground webhook `238`.
- 2026-06-23: Closeout validation passed: `npm --prefix infra run build`, `npm --prefix infra run validate:roller-live-webhook-register`, `npm --prefix infra run check`, `npm run validate`, and `git diff --check`. CDK synth printed the existing CLI feature-flag/notice output and exited `0`; `git diff --check` printed CRLF conversion notices only.

## T0154 Live Webhook Dry-Run Validation

- 2026-06-22: T0154 was activated after T0153 was squash-merged to `main` and the branch `codex/t0154-live-webhook-dry-run` was created from updated `main`.
- 2026-06-22: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-22: Read-only AWS identity check confirmed account `376129878018`, region `eu-north-1`, and assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-22: Read-only CloudFormation and Secrets Manager metadata checks confirmed stack `jumpyard-check-in-park-test-stack` outputs API endpoint `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` and that secret `/jumpyard-check-in-park-test/webhooks/dev-token` exists. Secret values were not read or printed.
- 2026-06-22: Added `infra/scripts/roller-live-webhook-dry-run.ts`, `npm --prefix infra run webhook:live:park-test:dry-run`, and `npm --prefix infra run validate:roller-live-webhook-dry-run`.
- 2026-06-22: The dry-run output planned `POST https://api.roller.app/webhooks` with endpoint `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`, header `x-roller-apikey`, value source `/jumpyard-check-in-park-test/webhooks/dev-token`, events `Created`, `Updated`, `Cancelled`, and `tickets=true`.
- 2026-06-22: T0154 documented duplicate behavior and rollback template requiring the recorded Live webhook id from T0155.
- 2026-06-22: T0154 did not call Roller Live, inspect existing Live webhooks, register/change/delete webhooks, create/update AWS resources, read/print secret values, connect frontend traffic, create drafts/payments, redeem tickets, or send SMS/email.
- 2026-06-22: `npm --prefix infra run check`, direct JSON dry-run, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion warnings only.

## T0151 Park-Test Database Migrations Validation

- 2026-06-18: T0151 was activated after T0150 was merged to `main` and the branch `codex/t0151-park-test-db-migrations` was created from updated `main`.
- 2026-06-18: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, AWS tagging/resource-inventory/CDK references, and the active backlog row.
- 2026-06-18: `aws sts get-caller-identity --profile wrlds-dev --output json` confirmed account `376129878018` and assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-18: Read-only AWS preflight confirmed `jumpyard-check-in-park-test-stack` was `CREATE_COMPLETE`, `jumpyard-check-in-dev-stack` was `UPDATE_COMPLETE`, and park-test Aurora `jumpyard-check-in-park-test-aurora` was `available`, encrypted, deletion-protected, and Data API enabled.
- 2026-06-18: Park-test stack tags matched required WRLDS metadata: `WRLDS:Client=JumpYard`, `WRLDS:Project=jumpyard-check-in`, `WRLDS:Environment=park-test`, `WRLDS:Owner=love`, `WRLDS:Repository=wrlds-creations/jumpyard-check-in`, `WRLDS:ManagedBy=cdk`, `WRLDS:DataClassification=confidential`, `WRLDS:Exportable=true`, `WRLDS:CostCenter=unassigned`, and `WRLDS:CreatedBy=love`.
- 2026-06-18: Pre-migration read-only Aurora Data API query showed park-test had `0` `jumpyard` schemas and `0` `jumpyard` tables.
- 2026-06-18: Pre-migration dev read-only Aurora Data API query showed `jumpyard.schema_migrations` contained `0001` through `0008`; this reconciled the older `AWS_RESOURCES.md` top-level docs drift that said `0007`.
- 2026-06-18: From `infra/`, `npx ts-node --prefer-ts-exts scripts/run-migrations.ts --config ./config/park-test.json --profile wrlds-dev` applied `0001 initial schema`, `0002 related data sources`, `0003 checkin sessions`, `0004 prepayment booking drafts`, `0005 add product draft links`, `0006 sms deliveries`, `0007 email deliveries`, and `0008 prepayment draft customer names` to park-test.
- 2026-06-18: `npx ts-node --prefer-ts-exts scripts/run-migrations.ts --config ./config/park-test.json --profile wrlds-dev --status` reported `0001` through `0008` as `applied`.
- 2026-06-18: Post-migration read-only Aurora Data API queries confirmed park-test `jumpyard.schema_migrations` contains the same `0001` through `0008` versions and checksums as dev, 19 `jumpyard` tables exist, `prepayment_booking_drafts` contains `customer_first_name` and `customer_last_name`, and park-test row counts remained `0` for `roller_bookings`, `guest_profiles`, `prepayment_booking_drafts`, and `roller_webhook_events`.
- 2026-06-18: Post-migration dev read-only Aurora Data API query showed `jumpyard.schema_migrations` still contained the same `0001` through `0008` versions and checksums.
- 2026-06-18: Added `docs/t0151-park-test-db-migrations.md` and updated source-of-truth docs plus AWS inventory with the park-test migration evidence and rollback notes.
- 2026-06-18: T0151 did not populate Roller Live credentials, call Roller Live, run imports, connect frontend traffic, register webhooks, create drafts/payments, redeem tickets, send SMS/email, change app behavior, or write to dev DB.
- 2026-06-18: Final `npm run validate`, `npm run infra:check`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0150 Park-Test Foundation Deploy Validation

- 2026-06-18: T0150 was activated after T0149 was merged to `main` and the branch `codex/t0150-deploy-park-test-foundation` was created from updated `main`.
- 2026-06-18: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, the T0149 deploy/rollback preflight, and the active backlog row.
- 2026-06-18: User explicitly approved proceeding with T0150, including park-test AWS resource creation. Scope remained limited to the park-test foundation deploy; no Roller Live credentials/calls, migrations, frontend traffic, webhooks, drafts/payments, redemptions, SMS/email sends, or app behavior changes.
- 2026-06-18: `aws sts get-caller-identity --profile wrlds-dev --output json` confirmed account `376129878018` and assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-18: Read-only CloudFormation check confirmed `jumpyard-check-in-dev-stack` was `UPDATE_COMPLETE`, last updated `2026-06-09T12:36:07.525000+00:00`.
- 2026-06-18: Pre-deploy check confirmed `jumpyard-check-in-park-test-stack` did not exist.
- 2026-06-18: T0150 found that the park-test synth would create a second SNS SMS delivery-status custom resource, but SNS SMS attributes are account-wide. `infra/lib/jumpyard-cloud-stack.ts` now creates that custom resource only for `WRLDS:Environment=dev`, and `infra/scripts/validate-park-test-synth.ts` verifies park-test does not include `jumpyard-check-in-park-test-sns-sms-delivery-status`.
- 2026-06-18: `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, and `npm --prefix infra run synth:park-test` passed after the safety fix.
- 2026-06-18: `npx cdk diff -c config=./config/dev.json --profile wrlds-dev --method=template` passed with no dev differences.
- 2026-06-18: `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` passed with one additive park-test stack and zero `SmsDeliveryStatus`/`setSMSAttributes` matches.
- 2026-06-18: `npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never` completed successfully. Stack `jumpyard-check-in-park-test-stack` reached `CREATE_COMPLETE` after about 8.5 minutes.
- 2026-06-18: Stack outputs are API endpoint `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`, Aurora cluster ARN `arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora`, raw payload bucket `jumpyard-check-in-park-test-raw-376129878018-eu-north-1`, and Roller credentials secret name `/jumpyard-check-in-park-test/roller/credentials`.
- 2026-06-18: Post-deploy checks confirmed stack `CREATE_COMPLETE`, required WRLDS stack tags, 54 resources tagged `WRLDS:Environment=park-test`, Aurora `available` with Data API enabled, 17 park-test alarms `OK`, six Lambda log groups with 30-day retention, and daily data-sync rule `ENABLED` at `cron(0 2 * * ? *)`.
- 2026-06-18: API Gateway CORS preflight `OPTIONS /v1/check-in/lookup` from `https://park-test.jumpyard.example` returned HTTP `204` with expected CORS headers. This did not invoke Lambda or Roller.
- 2026-06-18: `aws sns get-sms-attributes` confirmed account SMS diagnostics still point to `arn:aws:iam::376129878018:role/jumpyard-check-in-dev-sns-sms-delivery-status`; `aws iam get-role --role-name jumpyard-check-in-park-test-sns-sms-delivery-status` confirmed no park-test SMS delivery-status role exists.
- 2026-06-18: Post-deploy `npx cdk diff -c config=./config/dev.json --profile wrlds-dev --method=template` and `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` both passed with no differences.
- 2026-06-18: Added `docs/t0150-park-test-foundation-deploy.md` and updated source-of-truth docs plus AWS inventory with the created park-test resources.
- 2026-06-18: Final `npm run validate`, `npm run infra:check`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0149 Park-Test Deploy And Rollback Preflight Validation

- 2026-06-18: T0149 was activated after T0148 was merged to `main` and the branch `codex/t0149-park-test-deploy-rollback-preflight` was created from updated `main`.
- 2026-06-18: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, local `skills/aws-project-infrastructure/`, the T0146 environment contract, the T0148 synth skeleton, `infra/config/park-test.json`, and the active backlog row.
- 2026-06-18: `aws sso login --profile wrlds-dev` succeeded after user-assisted browser login.
- 2026-06-18: `aws sts get-caller-identity --profile wrlds-dev --output json` confirmed account `376129878018` and assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- 2026-06-18: Read-only CloudFormation check confirmed `jumpyard-check-in-dev-stack` is `UPDATE_COMPLETE` in `eu-north-1`, last updated `2026-06-09T12:36:07.525000+00:00`.
- 2026-06-18: A default CDK change-set diff for the never-deployed park-test stack briefly left an empty CloudFormation stack shell `jumpyard-check-in-park-test-stack` in `REVIEW_IN_PROGRESS`. `list-stack-resources` returned `[]`, `list-change-sets` returned `[]`, and T0149 deleted that empty shell. A post-cleanup lookup confirmed the park-test stack no longer exists.
- 2026-06-18: `npm --prefix infra run validate:config-guards`, `npm --prefix infra run validate:park-test-synth`, `npm --prefix infra run synth:dev`, `npm --prefix infra run synth:park-test`, and `npm run infra:check` passed.
- 2026-06-18: `npx cdk diff -c config=./config/dev.json --profile wrlds-dev --method=template` passed with `There were no differences` and `Number of stacks with differences: 0`.
- 2026-06-18: `npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template` passed and showed one new additive park-test stack with separate VPC, Aurora, Secrets Manager, SSM, S3, SQS, EventBridge, CloudWatch, Lambda, API Gateway, and IAM resources.
- 2026-06-18: Added `docs/t0149-park-test-deploy-rollback-preflight.md` covering the T0150 preflight checklist, CDK diff handling, approval gates, stop criteria, post-deploy smoke boundary, and rollback steps for frontend, API, live-write gates, secrets rotation, webhook removal, schedule shutdown, and migrations.
- 2026-06-18: Final `npm run validate`, `npm run infra:check`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.
- 2026-06-18: T0149 did not deploy park-test, populate credentials, call Roller, run migrations, register webhooks, create drafts/payments, redeem tickets, send SMS/email, or change app behavior.

## T0148 Park-Test CDK Synth Skeleton Validation

- 2026-06-17: T0148 was activated after T0147 was merged to `main` and the branch `codex/t0148-park-test-cdk-skeleton` was created from updated `main`.
- 2026-06-17: Added synthable `infra/config/park-test.json` for stack `jumpyard-check-in-park-test-stack`, account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-park-test`, Roller Live base URL `https://api.roller.app`, and T0146 WRLDS tags.
- 2026-06-17: Added `infra/scripts/validate-park-test-synth.ts` and wired `npm --prefix infra run validate:park-test-synth` into `npm run infra:check`.
- 2026-06-17: Initial park-test synth found that `jumpyard-check-in-park-test-raw-payloads-376129878018-eu-north-1` exceeds S3's 63-character bucket-name limit. CDK now preserves the existing dev bucket naming pattern for shorter prefixes and uses compact `-raw-` suffix only when needed.
- 2026-06-17: `npm --prefix infra run build`, `npm --prefix infra run validate:config-guards`, and `npm --prefix infra run validate:park-test-synth` passed.
- 2026-06-17: `npm --prefix infra run synth:dev`, `npm --prefix infra run synth:park-test`, and `npm run infra:check` passed. The CDK CLI printed the existing feature-flag and aws-cdk-lib notice `37949`; validation still exited 0.
- 2026-06-17: Final `npm run infra:check`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.
- 2026-06-17: T0148 did not deploy, create credentials, call AWS, call Roller, create resources, register webhooks, create drafts/payments, redeem tickets, send SMS/email, or change app behavior.

## T0147 Config Guards Validation

- 2026-06-17: T0147 was activated after T0146 was merged to `main` and the branch `codex/t0147-config-guards` was created from updated `main`.
- 2026-06-17: `infra/lib/config.ts` now reads `WRLDS:Environment` as `dev` or `park-test`. Dev must use Roller Playground and `https://api.play.roller.app`; park-test must match the T0146 account, region, resource prefix, Roller Live base URL, confidential data classification, and `bookingTimeSms.confirmSend=false`.
- 2026-06-17: Added `infra/scripts/validate-config-guards.ts` and wired `npm --prefix infra run validate:config-guards` into `npm --prefix infra run check`.
- 2026-06-17: `npm --prefix infra run validate:config-guards` passed, proving dev Playground config passes, unsafe dev-to-Live config fails, reviewed park-test Live config passes, park-test missing `resourcePrefix` fails closed, park-test Playground config fails closed, park-test wrong data classification fails closed, and park-test confirmed scheduled sends fail closed.
- 2026-06-17: `npm run infra:check` passed; it ran TypeScript build, config-guard validation, and CDK synth with `infra/config/dev.example.json`.
- 2026-06-17: Final `npm run validate` and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.
- 2026-06-17: T0147 did not add `infra/config/park-test.json`, did not deploy, did not create credentials, did not call AWS or Roller, and did not change resources, webhooks, payments, redemptions, SMS, email, or app behavior.

## T0146 Park-Test Environment Contract Validation

- 2026-06-17: T0146 was activated after T0145 was merged to `main` and the branch `codex/t0146-park-test-environment-contract` was created from updated `main`.
- 2026-06-17: Read `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, local `project-context-hygiene` and `aws-project-infrastructure` skills, `AWS_RESOURCES.md`, T0145 audit output, `infra/config/dev.json`, `infra/config/dev.example.json`, and `infra/lib/config.ts`.
- 2026-06-17: Added `docs/t0146-park-test-environment-contract.md` to lock `park-test` as a separate WRLDS environment in account `376129878018`, region `eu-north-1`, with planned namespace `jumpyard-check-in-park-test`, own future database/resources/secrets/API, and Roller Live JumpYard Nacka access only through JumpYard Cloud.
- 2026-06-17: Updated `PROJECT_CONTEXT.md`, `DECISIONS.md`, and `AWS_RESOURCES.md` with the durable park-test environment contract and planned metadata. No AWS resources were created, changed, deployed, or deleted.
- 2026-06-17: T0146 changed source-of-truth documentation only. It did not create credentials, config files, Live API calls, deploys, webhooks, payments, redemptions, SMS, email, or app/backend/infra behavior changes.
- 2026-06-17: `npm run validate` and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0145 Current-State Audit Validation

- 2026-06-17: T0145 was activated after T0144 was merged to `main` and the branch `codex/t0145-current-state-audit` was created from updated `main`.
- 2026-06-17: The audit reviewed repository source-of-truth docs, infra config, CDK route/resource definitions, Lambda guard surfaces, app API-target code, app deploy docs, package scripts, local `.env` key names with values redacted, and `AWS_RESOURCES.md`.
- 2026-06-17: Read-only AWS identity check with `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` confirmed account `376129878018`. No AWS resources were created, changed, deployed, or deleted.
- 2026-06-17: `docs/t0145-current-state-audit.md` documents current dev surfaces, park-test blockers, and likely file/resource touch points for `T0146` through `T0162`.
- 2026-06-17: T0145 changed source-of-truth documentation only. It did not change app/backend/infra code, AWS state, Roller state, Cloudflare settings, credentials, bookings, drafts, payments, redemptions, SMS, or email.
- 2026-06-17: `npm run validate` and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0144 Park-Test Backlog Intake Validation

- 2026-06-17: T0144 was activated by explicit user request as a documentation-only backlog intake ticket using `C:/Users/lovea/Downloads/jumpyard_park_test_tickets.xlsx` as the ticket source.
- 2026-06-17: `docs/roadmap/backlog.md` now documents the planned park-test sequence `T0145` through `T0162`, with T0145 as the recommended next read-only audit ticket.
- 2026-06-17: `PROJECT_CONTEXT.md` and `DECISIONS.md` record the durable park-test guardrail: same frontend-to-JumpYard-Cloud boundary, shared phone/admin source code with environment-specific API targets, and separate approvals for AWS, Roller Live, webhook, payment, redeem, and visitor-test steps.
- 2026-06-17: T0144 changed source-of-truth documentation only. It did not change app/backend/infra/AWS/Roller/payment/SMS/email behavior, credentials, bookings, drafts, payments, redemptions, or deploys.
- 2026-06-17: `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `npm run validate`, and `git diff --check` passed.

## T0143 Phone Contact Icon Style Correction Validation

- 2026-06-16: T0143 was handled as a narrow follow-up after T0142 to correct only the phone contact icon asset style.
- 2026-06-16: `jumpyard-checkin-phone/public/jumpyard-next-icons/phone.png` was replaced with the selected built-in-imagegen iPhone/contact-screen option: black phone frame, red screen, white contact glyph, and JumpYard-style motion accents.
- 2026-06-16: Source scope was limited to the phone icon asset and source-of-truth ticket/archive docs. No backend, AWS, Roller, quote, draft, payment provider, session, redeem, staff/admin handoff, SMS, email, or app copy/contracts changed.
- 2026-06-16: PNG validation confirmed `phone.png` remains a 1024x1024 RGBA asset with transparent corners and non-empty alpha content.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0142 Buy-Entry Final Front Polish Validation

- 2026-06-16: T0142 was activated as a narrow phone frontend polish ticket after T0141.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now shows the socks recommendation as a compact visual panel with sock icons, the recommended jumper count, selected count, and progress bar. The panel remains visible after the recommended quantity is reached unless the guest confirms they already have approved socks.
- 2026-06-16: Manual socks quantity is no longer capped by jumper count or add-on `maxPerGuest`; other add-ons keep their existing caps and availability rules.
- 2026-06-16: A generated transparent JumpYard-style phone handset icon was added at `jumpyard-checkin-phone/public/jumpyard-next-icons/phone.png` and wired through `JumpyardIcon` for the contact phone label.
- 2026-06-16: The completed-payment loading check now uses the generated `success-check` JumpYard icon instead of a lucide check.
- 2026-06-16: Buy-entry safety/video/final copy no longer promises a check-in QR, and final confirmation no longer renders the guest-facing QR/code card. Backend/session/handoff data remains untouched and available to staff/server flows.
- 2026-06-16: The final `Gör en ny bokning` action now renders below the grey confirmation card instead of inside it.
- 2026-06-16: Source checks confirmed the uncapped socks max, socks selected-count copy, `phone` icon mapping/usage, no active confirmation QR card/import, no active check-in QR/personalkod copy in the changed phone surfaces, and `phone.png` as a 1024x1024 alpha PNG with transparent corners.
- 2026-06-16: Local dev server started at `http://127.0.0.1:3041` and returned HTTP 200 for preview in the already-open in-app browser.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0141 Buy-Entry Final Polish Follow-Up Validation

- 2026-06-16: T0141 was activated as a narrow phone buy-entry polish ticket after T0140.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now renders the approved-payment sync check in the red primary color and adds a short `Rekommenderat antal` socks recommendation row based on the current jumper count without auto-adding socks.
- 2026-06-16: `jumpyard-checkin-phone/src/components/SafetyAttest.tsx` and `jumpyard-checkin-phone/src/context/LanguageContext.tsx` now show the buy-entry safety-rules step as `Sista steget` with `Bekräfta säkerhetsreglerna.` and hide the header `safety-check` icon only for the buy-entry variant.
- 2026-06-16: `jumpyard-checkin-phone/src/app/page.tsx` now shows only the consistent circular loader while checking a saved buy-flow recovery booking, and the main phone surface uses dynamic viewport height plus vertical page overflow instead of locking all overflow.
- 2026-06-16: `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx` now makes the final `Gör en ny bokning` action smaller/red and renders the generated `add-jump-session` icon as white.
- 2026-06-16: Source checks confirmed the red payment sync check, socks recommendation key/copy, buy-entry-only safety header icon condition, recovery `role="status"` loader, mobile `min-h-dvh`/`overflow-x-hidden` surface, and red final action styling.
- 2026-06-16: Local dev server started at `http://127.0.0.1:3041` and returned HTTP 200. The in-app Browser plugin smoke could not run because the installed Browser plugin cache is missing `scripts/browser-client.mjs`; no standalone Playwright/browser fallback was used.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0140 Buy-Entry Final Polish Follow-Up Validation

- 2026-06-16: T0140 was activated as a small phone buy-entry polish ticket after T0138/T0139.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` now uses `Gör en ny bokning` / `Make a new booking` for the final action, shortens the buy-entry review metadata label to `Hoppare` / `Jumpers`, changes the payment sync title to `Betalning genomförd`, and changes buy-entry safety-video copy to `Säkerhetsgenomgång` plus short check-in QR handoff text.
- 2026-06-16: `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx` now uses the generated `add-jump-session` icon for the final action instead of a restart icon.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now uses the generated `group` icon for family product cards in jump-time selection and renders the approved-payment sync state with the same spinner structure as the availability loader plus a green check in the center.
- 2026-06-16: `jumpyard-checkin-phone/src/components/SafetyVideo.tsx` now hides the leading `safety-check` header icon only for the buy-entry safety-video variant while keeping the existing-booking safety video header icon unchanged.
- 2026-06-16: Local in-app browser smoke used a temporary mock JumpYard Cloud API at `http://127.0.0.1:43220` and Next dev at `http://127.0.0.1:3040/?park=1`. The smoke confirmed the family product card image source was `/jumpyard-next-icons/group.png`, the review restored/visible label was `Hoppare`, and `Antal hoppare` was not present in the review metadata.
- 2026-06-16: Source checks confirmed `Gör en ny bokning`, `Betalning genomförd`, `Säkerhetsgenomgång`, the capacity-loader-style payment sync spinner, and the buy-entry-only safety header icon condition are present.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0139 Pre-Payment Buy-Flow Recovery Validation

- 2026-06-16: T0139 was activated as a phone buy-entry client recovery ticket for safe local recovery before draft/payment exists.
- 2026-06-16: `jumpyard-checkin-phone/src/flow/buyFlowRecovery.ts` now supports pre-payment internal buy steps, selected product key, quantity, add-on quantities, socks confirmation, SkyRider consent, contact fields, and a boolean marker for payment-option values without storing raw Presentkort/Klippkort codes, raw payment JWTs, or payment-provider secrets.
- 2026-06-16: `jumpyard-checkin-phone/src/app/page.tsx` now routes pre-payment recovery snapshots back into `KIOSK_BUY` while keeping the existing T0136 post-draft/payment recovery lookup path unchanged.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now writes a safe pre-payment snapshot, restores from it after refresh, reloads availability before trusting saved time/product/add-ons, clamps unavailable or over-limit choices, falls back to safer earlier steps when needed, and clears pre-payment recovery when leaving buy-entry or moving into the existing post-draft/payment recovery path.
- 2026-06-16: Local in-app browser smoke used a temporary mock JumpYard Cloud API at `http://127.0.0.1:43219` and Next dev at `http://127.0.0.1:3039/?park=1`. The smoke selected `17:00`, `60 min`, 2 jumpers, 1 socks, 1 lock, filled contact, reached `REVIEW`, refreshed, and restored to `KIOSK_BUY` / `REVIEW` with `17:00`, `60 min`, 2 jumpers, socks, lock, and amount `496 kr`.
- 2026-06-16: The same browser smoke confirmed the socks checkbox count changed from `1` to `0` after socks quantity became 1 and that review recovery re-issued availability/quote calls with item ids only; the mock quote request contained no gift-card, Klippkort, raw JWT, payment session, configuration id, integration id, or API URL fields.
- 2026-06-16: Source search confirmed the pre-payment snapshot write stores only `paymentOptionsHadValues` for payment-option state and does not write `giftCardNumber`, `clipCardCode`, raw `jwt`, `paymentSession`, `apiUrl`, `configurationId`, or `integrationId`.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0138 Buy-Entry Small UI Polish Validation

- 2026-06-16: T0138 was activated as a narrow phone buy-entry UI polish ticket for socks checkbox visibility, review metadata icons, payment-code helper text, and post-payment sync display.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now shows the `Vi har redan godkända hoppstrumpor.` checkbox only while selected socks quantity is zero. Adding one or more socks hides the checkbox without auto-adding socks.
- 2026-06-16: Buy-entry review metadata now uses generated JumpYard icons for `Starttid`, `Hopptid`, and `Antal hoppare`: `time`, `trampoline-jump`, and `group`.
- 2026-06-16: Empty-state helper text under Presentkort and Klippkort inputs is no longer rendered, while ready/applied/rejected feedback remains conditional on actual input state.
- 2026-06-16: After the payment drop-in reports approved payment, the buy-entry payment step now swaps the Roller payment card out for the booking-sync state with the generated `booking-confirmed` icon plus spinner and `Hämtar bokningen...` copy. The previous `Betalning klar` approved card no longer remains visible underneath.
- 2026-06-16: Local Playwright smoke used a temporary mock JumpYard Cloud API at `http://127.0.0.1:43218` and Next dev at `http://127.0.0.1:3038/?park=1`. The smoke verified socks checkbox count `1 -> 0` after adding socks, review icon sources `time.png`, `trampoline-jump.png`, and `group.png`, empty payment-code helper count `0`, approved callback reached through the rendered `RollerPaymentDropIn` component boundary, sync card visible, Roller payment card count `0`, `Betalning klar` count `0`, `Hämtar bokningen...` count `1`, and `booking-confirmed.png` visible. One expected mock lookup HTTP 404 appeared while the UI stayed in the sync/loading state.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0137 Channel-Aware Final Confirmation Validation

- 2026-06-16: T0137 was activated as a phone confirmation/final-step UX ticket to make the final copy lighter and channel-aware without changing redeem behavior, staff/admin queue semantics, backend, AWS, Roller, quote, draft, payment, session, SMS, or email contracts.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` now uses `Check-in klar`, channel-specific short subtitles for park-QR/on-site, SMS/home, and kiosk copy, `Check-in QR` instead of `Personalkod`, and a shorter `Att hÃ¤mta` handout heading.
- 2026-06-16: `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx` now selects final-view subtitle by channel, keeps the existing QR payload shape unchanged, labels the QR as `Check-in QR`, shows wristbands as the entry handout, and renders the existing handout/add-on summary with a park-QR `BÃ¶rja om` action when provided.
- 2026-06-16: `jumpyard-checkin-phone/src/app/page.tsx` now passes the effective channel into confirmation and carries existing booking add-ons into `selectedAddons` when SMS/home links or park-QR lookup resume directly to a ready-for-staff final view, so socks, SkyRider, coffee, and similar selected items remain visible in the final summary.
- 2026-06-16: SMS/home browser smoke used a temporary local mock JumpYard Cloud API at `http://127.0.0.1:3037/?jy_token=sms-t0137`. The final view reported channel `sms`, title `Check-in klar`, subtitle `Visa din check-in QR nÃ¤r ni kommer till parken.`, QR label `Check-in QR`, no `Personalkod`/`Staff code` copy, and visible armband, strumpor, SkyRider, and Bryggkaffe summary items.
- 2026-06-16: On-site park-QR browser smoke used the real phone UI with mocked lookup/session responses at `http://127.0.0.1:3037/?park=1`. The final view reported channel `park-qr`, title `Check-in klar`, subtitle `Visa din check-in QR nÃ¤r ni hÃ¤mtar armband.`, QR label `Check-in QR`, `BÃ¶rja om`, no `Personalkod`/`Staff code` copy, and visible armband, strumpor, SkyRider, and Bryggkaffe summary items.
- 2026-06-16: Kiosk copy is source-supported through `channel === 'kiosk'` and `kioskSubtitle`, but the phone app intentionally maps bare/kiosk entry to `park-qr`; a browser kiosk final-view check was therefore not reachable without broad route changes outside T0137 scope.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0136 Buy-Flow Refresh Recovery Validation

- 2026-06-16: T0136 was activated as a phone UI ticket to persist safe client-side buy-flow recovery state after draft/payment creation and during buy-entry safety steps.
- 2026-06-16: `jumpyard-checkin-phone/src/flow/buyFlowRecovery.ts` now owns a typed local-storage snapshot with booking/draft identifiers, selected start time/product, jumper count, payment/draft status, and current flow step. The snapshot shape has no raw payment JWT or provider-token field.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` writes the recovery snapshot after a new-booking draft exists and updates it when the paid draft lookup hands off toward safety.
- 2026-06-16: `jumpyard-checkin-phone/src/app/page.tsx` reads the recovery snapshot on app start, tries to look up the saved booking through JumpYard Cloud, starts/resumes the server-owned check-in session, and routes recovered buy-entry guests back to safety video or safety rules. Server session state still controls ready-for-staff/final states.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` added calm recovery copy including `Vi hittade din senaste check-in.`, `Fortsätt där du var.`, retry, and start-over copy, with matching English copy.
- 2026-06-16: Browser smoke used a temporary local mock JumpYard Cloud API and the real phone UI. The flow selected the first visible dynamic start time, created a buy-entry draft with prepayment draft id `jypre_t0136`, reloaded the app, and recovered to `APP_SAFETY_VIDEO` with check-in session `jycs_t0136_resume`.
- 2026-06-16: Browser smoke then stopped the mock API and reloaded with the saved recovery snapshot. The app showed the recovery fallback copy `Vi hittade din senaste check-in.` and `Bokningen är sparad här, men vi kunde inte hämta den just nu. Försök igen eller börja om.`, and `Börja om` cleared recovery back to the normal park choice.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0135 Buy-Entry Safety Context Validation

- 2026-06-16: T0135 was activated as a phone UI ticket to add buy-entry-specific context before the safety video after purchase/payment while keeping existing-booking safety copy simpler.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` added buy-entry safety-video copy for `Betalning klar`, `Titta på säkerhetsfilmen innan ni får er check-in QR.`, and `Fortsätt`, plus rules context `Nästan klar. Bekräfta reglerna så visar vi din check-in QR.`, with matching English copy.
- 2026-06-16: `jumpyard-checkin-phone/src/components/SafetyVideo.tsx` and `jumpyard-checkin-phone/src/components/SafetyAttest.tsx` now accept a buy-entry flow flag and select buy-entry-specific copy only for that path. Existing-booking defaults remain unchanged.
- 2026-06-16: `jumpyard-checkin-phone/src/app/page.tsx` passes `ctx.buyEntryFlow` into the safety video and safety attest components. Video completion tracking, final redeem, staff handoff, backend, AWS, Roller, quote, draft, payment, SMS, and email behavior were not changed.
- 2026-06-16: Local in-app browser smoke used a temporary mock JumpYard Cloud API. The buy-entry flow reached the safety-video step and confirmed the visible copy `Betalning klar`, `Titta på säkerhetsfilmen innan ni får er check-in QR.`, and the pre-completion disabled button `Titta hela videon`.
- 2026-06-16: Existing-booking browser smoke with the same temporary mock API reached the safety-video step and confirmed it still showed the simpler existing copy `Säkerhetsvideo` and `Titta på videon innan du kan gå vidare.`
- 2026-06-16: Browser playback could not complete the local video in the hidden/in-app environment because the media stayed paused at `currentTime=0`; source review confirmed the rules copy is wired through `SafetyAttest` for the buy-entry flow, and a full rules-screen browser check remains a playable-media environment check if needed.
- 2026-06-16: Copy/source checks confirmed the required T0135 copy is present. Existing older strings still contain `Personalkod` and dash punctuation, but the new T0135 user-facing copy does not introduce `Personalkod`, en dashes, em dashes, or long dash punctuation.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0134 Post-Payment Loading State Validation

- 2026-06-16: T0134 was activated as a phone UI ticket to add a clear post-payment loading state after approved buy-entry payment while the paid booking is fetched for check-in.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` changed the approved-payment description to `Vi hämtar din bokning och förbereder check-in.`, added loader copy `Det tar bara några sekunder.`, added fallback copy `Försök igen eller visa detta för personalen.`, and kept matching English copy.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now tracks approved-payment sync separately from the lookup request, renders a prominent `Betalning klar` sync card with spinner/retry states under the payment drop-in, and clears stale sync state when the guest changes the basket, time, product, add-ons, or payment inputs.
- 2026-06-16: Code review confirmed the new sync card is only shown from the approved-payment/paid-booking sync path, the retry action reuses the existing paid-draft lookup, and no quote, draft, backend, AWS, Roller, payment provider, SMS, or email contract changed.
- 2026-06-16: Local in-app browser smoke used a temporary mock JumpYard Cloud API for availability, quote, and draft only. The flow reached the buy-entry `PAYMENT` step with a fake local payment session. The actual approved-payment callback was not exercised through visible UI because no real payment provider was present and no product-code test hook was added for this ticket.
- 2026-06-16: Copy/source checks confirmed the T0134 copy is present and no `Personalkod` copy was introduced by the ticket.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0133 SkyRider Attestation Copy Validation

- 2026-06-16: T0133 was activated as a phone UI copy ticket to tighten SkyRider attestation around height and timing only.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` changed SkyRider attestation copy to `Innan SkyRider`, `Minst 100 cm`, `Alla som åker SkyRider behöver vara minst 100 cm.`, `Passar bäst efter hopptiden`, `Vi rekommenderar att SkyRider görs efter hoppasset.`, and `Jag bekräftar att alla SkyRider-åkare är minst 100 cm.`, with matching English copy.
- 2026-06-16: `jumpyard-checkin-phone/src/components/SkyRiderAttest.tsx` now renders only the height and timing information rows. The existing confirmation state, disabled continue behavior before confirmation, and completion callback remain unchanged.
- 2026-06-16: Browser smoke at `http://localhost:3000/?codexSmoke=t0133` used a local mock JumpYard Cloud API only for availability. It selected SkyRider in the buy-entry add-ons step and confirmed the attestation showed only `Minst 100 cm` and `Passar bäst efter hopptiden`, did not show `Säkerhetscheck` or safety-check wording, kept `Fortsätt` disabled before confirmation, and enabled `Fortsätt` after clicking the height confirmation. No bookings, drafts, payments, redemptions, AWS resources, SMS, or email were created or changed.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `npm run validate` passed.
- 2026-06-16: `git diff --check` passed with CRLF conversion notices only.

## T0132 Jump-Socks Manual Choice Validation

- 2026-06-16: T0132 was activated as a phone UI ticket to present jump socks as an important manual choice in the buy-entry add-ons step.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` added socks-section copy for `Hoppstrumpor`, `Alla som hoppar behöver godkända hoppstrumpor.`, `Vi har redan godkända hoppstrumpor.`, and `Lägg till de strumpor ni behöver.`, with matching English copy.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now separates socks into a prominent top add-ons section, keeps sock quantity at `0` until the guest increments it, and clears selected socks when the guest confirms they already have approved socks. The existing selected add-on quantity model remains the only path into quote/draft payloads.
- 2026-06-16: Browser smoke at `http://localhost:3000` used a local mock JumpYard Cloud API only for availability. It confirmed `Hoppstrumpor` was shown above other add-ons, the approved-socks help and checkbox copy were visible, sock quantity stayed `0` by default, manually adding one pair changed total from `199 kr` to `244 kr`, and checking the already-have-socks box hid/cleared the sock quantity and returned total to `199 kr`. No bookings, drafts, payments, redemptions, AWS resources, SMS, or email were created or changed.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `npm run validate` passed.
- 2026-06-16: `git diff --check` passed with CRLF conversion notices only.

## T0131 Buy-Entry Jump-Duration Clarification Validation

- 2026-06-16: T0131 was activated as a phone UI ticket to clarify the buy-entry product step as jump duration after the selected start time.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` added buy-entry labels for `Välj hopptid`, `Starttid`, `idag`, and `Antal hoppare`, with matching English copy.
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now derives a duration display from the existing Roller product label, shows `Starttid [tid] idag` as static context, keeps Roller product selection semantics unchanged, and makes review show start time, jump duration, and jumper count separately.
- 2026-06-16: Browser smoke at `http://127.0.0.1:3031/?codexSmoke=t0131-*` used a local mock JumpYard Cloud API only for availability/quote. It confirmed the product step showed `Välj hopptid`, `Starttid 14:30 idag`, and `60 min`/`90 min`/`120 min`; the quantity step showed `Antal hoppare` and `2`; review showed `Starttid 14:30 idag`, `Hopptid 60 min`, and `Antal hoppare 2`. The live dev API was reachable from terminal but blocked by browser CORS from localhost, so the browser smoke stayed local and created no bookings, drafts, payments, redemptions, AWS resources, SMS, or email.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `npm run validate` passed.
- 2026-06-16: `git diff --check` passed with CRLF conversion notices only.

## T0130 Buy-Entry Start-Time/Date Clarification Validation

- 2026-06-16: T0130 was activated as a phone UI ticket to clarify the buy-entry time-selection step as start time with today's date context.
- 2026-06-16: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` changed Swedish buy-entry time copy to `Välj starttid`, `Idag`, and `Välj när ni vill börja hoppa.`; English copy now says `Choose start time`, `Today`, and `Choose when you want to start jumping.`
- 2026-06-16: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now formats today's date in the `Europe/Stockholm` time zone and shows `Idag, [datum]` between the time-step heading and help text.
- 2026-06-16: Browser smoke at `http://127.0.0.1:3030/?codexSmoke=t0130` clicked `Köp entré` and confirmed the time step visible text included `Välj starttid`, `Idag, 16 juni`, `Välj när ni vill börja hoppa.`, and the available start times.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings.
- 2026-06-16: `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices.
- 2026-06-16: `npm run validate` passed.
- 2026-06-16: `git diff --check` passed with CRLF conversion notices only.

## T0129 Buy-Flow UX Backlog Intake Validation

- 2026-06-16: T0129 was activated by explicit user request as a documentation-only backlog intake ticket.
- 2026-06-16: `docs/roadmap/backlog.md` now documents the next scoped buy-flow/check-in UX tickets `T0130` through `T0137` and the backlog lifecycle rule that completed tickets are removed from backlog and recorded in `docs/history/completed-tickets.md`.
- 2026-06-16: T0129 changed source-of-truth documentation only. It did not change app/backend/infra/AWS/Roller/payment/SMS/email behavior, credentials, bookings, drafts, payments, or redemptions.
- 2026-06-16: Initial `npm run validate` caught that recommended next ticket `T0130` needed to be listed under `REPO_CURRENT_STATE.md` Confirmed Next Tickets; the state file was updated accordingly.
- 2026-06-16: `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, `npm run validate`, and `git diff --check` passed. `git diff --check` printed CRLF conversion notices only.

## T0128 Closeout Validation

- 2026-06-15: `node scripts/validate-current-ticket.js`, `node scripts/validate-followups.js`, `node scripts/validate-history-archives.js`, and `npm run validate` passed after `CODEX_TASK.md` moved to `NO_ACTIVE_TICKET`, `REPO_CURRENT_STATE.md` moved to none active, and `docs/history/completed-tickets.md` listed T0128 as completed.
- 2026-06-15: `git diff --check` is part of the final T0128 handoff validation for this branch.

## T0126 Pelle/Anders Demo Rehearsal Validation

- 2026-06-15: T0126 was activated by explicit user request after T0128. Baseline `npm run validate`, `node scripts/validate-current-ticket.js`, and `git diff --check` passed before Playground writes.
- 2026-06-15: Roller env guard passed with `ROLLER_ENV=playground` and Playground base URL.
- 2026-06-15: Dev availability for 15:00, 15:30, 16:00, and 16:30 returned entry, family, SkyRider, JumpSocks, hänglås, and Bryggkaffe as available.
- 2026-06-15: Guarded Roller Playground booking write created same-day rehearsal bookings `5166994`, `5166995`, `5166996`, and `5166997` with zero write errors.
- 2026-06-15: JumpYard Cloud lookup returned `5166994`, `5166996`, and `5166997` as paid/ready and `5166995` as pending/payment-required.
- 2026-06-15: Public guest and staff/admin Cloudflare pages returned HTTP `200`.
- 2026-06-15: Existing-booking add-on quote for `5166997` returned `quoted`, total `165`, and `wroteBooking=false`.
- 2026-06-15: A ready-for-staff dev handoff was created for SkyRider booking `5166996`: handoff `JY3829`, session `jycs_mqf5s3e1_c6e6d961`. This does not redeem Roller tickets.

## Archived REPO_CURRENT_STATE.md Validation Status

## Validation Status

- T0127 implementation status: `CODEX_TASK.md` now records `NO_ACTIVE_TICKET`, `REPO_CURRENT_STATE.md` records none active after T0127, T0127 is listed as completed, and T0126 remains the reserved next Pelle/Anders demo rehearsal ticket. T0127 is documentation/tooling/validation-focused and does not change application behavior, AWS, Roller, credentials, deployment config, phone/admin/kiosk UX, SMS, or email behavior.
- T0127 validation: `node --check scripts/validate-current-ticket.js`, `node scripts/validate-current-ticket.js`, `npm run validate`, and `git diff --check` passed. Followup hygiene validation was intentionally deferred to a later ticket because the current `FOLLOWUPS.md` table already contains duplicate ids and `Done` rows under open followups, which needs a scoped migration before strict validation can pass.
- T0125 correction implementation status: `jumpyard-checkin-phone/src/components/ConfirmationScreen.tsx` now treats SkyRider as a check-in staff handout instead of an other/later add-on, and `jumpyard-checkin-admin/src/app/page.tsx` is restored so SkyRider belongs under `Lämna ut vid incheckning`.
- T0125 correction validation: `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings, `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` notices, `npm --prefix jumpyard-checkin-admin run lint` passed, `npm --prefix jumpyard-checkin-admin run build` passed, and `npm run validate` passed. A local browser smoke with mock JumpYard Cloud API verified admin SkyRider in `handout-section-checkin`, not `handout-section-later`, with coffee still later; the phone confirmation grouping was verified by an explicit component contract check confirming `skyrider` is in `HANDOUT_IDS` and absent from `EXPERIENCE_IDS`.
- T0124 implementation status: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now tracks gift-card and Klippkort payment-option dirty state separately. Empty cleared fields are treated as absent inputs, non-empty rejected codes still block checkout, and clearing a previously applied value still requires a quote refresh because the amount due can change.
- T0124 validation: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings, `npm --prefix jumpyard-checkin-phone run build` passed with the existing `baseline-browser-mapping` age notices, and in-app browser smoke used a local mock JumpYard Cloud API without Roller writes to reject `BADGIFT` and `BADCLIP`, clear each field, and create no-code draft requests with empty `giftCards` and `discountCodes` arrays.
- T0123 implementation status: `jumpyard-checkin-phone/src/context/LanguageContext.tsx` now changes the phone payment method/drop-in heading from `Kortbetalning` to `Betalning`, with matching English `Payment`; `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now routes back from `PAYMENT` to `REVIEW` instead of leaving the buy-entry flow, preserving the existing basket/contact/quote/payment-option state in component state.
- T0123 validation: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings, `npm --prefix jumpyard-checkin-phone run build` passed with the existing `baseline-browser-mapping` age notices, and `npm run validate` passed. In-app browser smoke used a local mock JumpYard Cloud API, reached the payment step without Roller writes, confirmed no `Kortbetalning` text was visible, returned from payment to `Sammanställning` with time/product/quantity/amount preserved, and re-entered payment again.
- T0109 implementation status: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` and `jumpyard-checkin-phone/src/components/AddonsOffer.tsx` now guard both quote and draft creation with the same SkyRider approval requirement used by the visible add-ons step, so a state mismatch cannot create a Roller quote, draft, or payment session before the 100 cm approval.
- T0109 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-08. Lint still reports the existing four `<img>` warnings, and the build still reports existing `baseline-browser-mapping` age notices.
- T0109 local browser smoke: phone dev server started on `http://127.0.0.1:3012/?codexSmoke=t0109` and the buy-entry path reached the time selection screen, but availability could not continue because local dev returned `Could not reach JumpYard Cloud`; this matches the prior T0106 local browser blocker and does not indicate a new code error. The temporary dev server was stopped.
- T0110 implementation status: `jumpyard-checkin-admin/src/app/page.tsx` now renders compact staff handout rows with product-specific JumpYard icons for entry, SkyRider, socks, padlock, coffee, and family/group where detectable, and removes the grey row subtitle plus the server-side final-check copy.
- T0110 validation: `npm --prefix jumpyard-checkin-admin run lint`, `npm --prefix jumpyard-checkin-admin run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-08. Diff check printed Git CRLF notices only. Local admin smoke at `http://127.0.0.1:3013/?codexSmoke=t0110` rendered login with no missing images, then the temporary server was stopped.
- T0116 implementation status: `jumpyard-checkin-phone/src/flow/addonCatalog.ts` now sets `lock.maxPerGuest=4` and `skyrider.maxPerGuest=4`. SkyRider still has `requiresAvailability=true`, so existing availability/capacity gating remains in the buy-entry and existing-booking add-on flows.
- T0116 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-09. Lint still reports the existing four `<img>` warnings, and the build still reports existing `baseline-browser-mapping` age notices. Local browser smoke with mock availability confirmed one-jumper SkyRider and Hänglås quantities can both increment to `2`.
- T0117 implementation status: `jumpyard-checkin-phone/src/components/SkyRiderAttest.tsx` now shows three clear SkyRider information rows for the 100 cm height requirement, staff safety check, and recommendation to ride after jump time. `LanguageContext.tsx` carries matching Swedish and English copy. The existing confirmation-required continue behavior remains unchanged.
- T0117 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-09. Browser smoke confirmed the SkyRider consent screen shows the new information and still keeps continue disabled until confirmation.
- T0118 implementation status: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now chooses a specific payment-options apply CTA from the current input values: `Applicera presentkort`, `Applicera klippkort`, both, or a neutral apply-change label when clearing codes. `LanguageContext.tsx` carries matching Swedish and English copy, and the existing quote-refresh handler remains unchanged.
- T0118 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-09. Browser smoke confirmed gift-card-only and Klippkort-only edits show the specific apply CTA labels and no longer show the old `Uppdatera belopp` CTA.
- T0119 implementation status: `jumpyard-checkin-phone/src/components/BuyTickets.tsx` now caps gift-card and Klippkort inputs at 32 characters, clamps pasted values, and shows empty, ready-to-apply, done, or rejected feedback based on dirty input and refreshed quote errors. `LanguageContext.tsx` carries matching Swedish and English copy. Quote refresh, dirty-input blocking, and quote/draft payload shape remain unchanged.
- T0119 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-09. Lint still reports the existing four `<img>` warnings, and the build still reports existing `baseline-browser-mapping` age notices. Browser smoke with a local mock API confirmed both fields clamp to 32 characters, dirty Klippkort shows `Redo att applicera`, accepted gift card shows `Klart`, and rejected Klippkort shows `Ej godkänt` with `aria-invalid=true`.
- T0120 implementation status: `jumpyard-checkin-admin/src/app/page.tsx` now formats staff visit dates as short Swedish labels such as `6 aug` in the handoff queue row and detail date tile, and formats staff-facing ready timestamps with the same readable date style such as `6 aug 10:30`. Missing dates still show `-`, and unparseable values fall back to the raw value. Staff API contracts, auth, sorting, filtering, redeem, handout logic, and backend behavior remain unchanged.
- T0120 validation: `npm --prefix jumpyard-checkin-admin run lint`, `npm --prefix jumpyard-checkin-admin run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-09. Browser smoke with a local mock staff API confirmed the queue row contains `6 aug`, the selected handoff detail contains `6 aug`, the ready timestamp shows `Redo: 6 aug 10:30`, and the detail text no longer contains raw `2026-08-06`.
- T0121 implementation status: `jumpyard-checkin-admin/src/app/page.tsx` now uses a responsive selected-handoff metadata grid so date/time/payment tiles stack on narrow staff/admin viewports and return to a compact three-column row on wider viewports. The date and time tile values stay intact without word-breaking. Date formatting, staff API contracts, auth, sorting, filtering, redeem, handout logic, and backend behavior remain unchanged.
- T0121 validation: `npm --prefix jumpyard-checkin-admin run lint`, `npm --prefix jumpyard-checkin-admin run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-09. Browser smoke with a local mock staff API confirmed the selected handoff detail date tile displays `6 aug` cleanly on a narrow viewport, stays within its tile, and the wider viewport still uses three metadata columns.
- T0122 implementation status: `jumpyard-checkin-admin/src/app/page.tsx` now groups selected handoff detail items into `Lämna ut vid incheckning`, `Hämtas efter hoppet`, and `Övrigt i bokningen`. Visitor wristbands, socks, padlocks, and SkyRider passes are check-in handouts; coffee is later collection; unknown items remain visible for staff review. Staff API contracts, auth, sorting, filtering, redeem, backend handout logic, and backend behavior remain unchanged.
- T0122 validation: `npm --prefix jumpyard-checkin-admin run lint`, `npm --prefix jumpyard-checkin-admin run build`, `npm run validate`, and scoped `git diff --check` passed on 2026-06-09. Browser smoke with a local mock staff API confirmed check-in handout categories for visitor wristbands, socks, padlocks, and SkyRider passes, coffee under later collection, and an unmatched item under review.
- T0090 docs verification: Roller Create draft booking docs describe gift card payments separately from discounts, booking costs uses the same booking payload family for safe cost calculation, and Help Center docs describe gift cards as stored-value tender.
- T0090 safe Roller Playground discovery: direct `POST /bookings/draft/costs` returned `bookingCosts.total=200` and `amountOwing=200` for entry product `1765860` at `2026-06-02 10:00`; adding an invalid gift card kept `amountOwing=200` and returned one `giftCardErrors` entry.
- T0090 gift-card data check: `/data/giftcards` first returned HTTP `200` but zero records for sampled Playground windows; after Venue Manager fixtures were created and paid, the `2026-06-02` window returned two gift cards for booking references `5101043` and `5101044` with balances `500` and `100`. Safe `POST /bookings/draft/costs` quotes using those gift cards applied one gift card with no errors; the `100 kr` card reduced a `200 kr` quote to `amountOwing=100`, and the `500 kr` card reduced it to `amountOwing=0`. `/products` contains `giftcard` products `Presentkort`, `Presentkort Återbetalningskort`, and `Julbox`.
- T0090 multi-visit discovery: product catalog contains `membership` products for `10-Kort`, `20-Kort`, and `30-Kort`; a safe cost quote for `10-Kort` variation `1765758` returned `total=1750`; paid booking `5101046` bought `10-Kort` and exposes membership-like ticket fields, but `GET /customers/4045520/multi-passes` returned zero balances and a costs quote with the same guest email returned `amountOwing=200` with empty `multiPassAllocations`. Help Center beta multi-pass docs describe automatic all-or-nothing application to eligible session passes by booking holder/email, but current `10-Kort` is not proven to be that model. Pabel/project notes indicate Nacka multi-visit may instead be validated as a membership/discount code; V1 should let Roller validate codes and should not show remaining visit balance.
- T0090 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, assets, deliverables, or production credentials changed.
- T0091 implementation status: `infra/lambda/booking/index.js` now returns safe gift-card applied/error metadata, redacts gift-card numbers from Roller errors, includes gift-card hashes in idempotency request hashes, and publishes full gift-card/no-payment drafts through `POST /bookings/draft/publish` when `amountOwing=0`. The phone buy-entry flow now has an optional gift-card field, sends `giftCards` to quote/draft, shows invalid/applied states, keeps partial gift-card bookings on card payment for the remainder, and routes full gift-card bookings into booking sync instead of card entry.
- T0091 local validation: `node --check infra/lambda/booking/index.js`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, `git diff --check`, and `npm --prefix infra run synth:dev` passed. Phone lint still reports the existing four Next.js `<img>` warnings, and `git diff --check` reports Git CRLF notices only.
- T0091 deploy: AWS profile `wrlds-dev` resolved account `376129878018`; pre-deploy `npm --prefix infra run diff:dev` showed only `BookingHandler` Lambda code; `npm --prefix infra run deploy:dev` passed on 2026-06-02; post-deploy diff showed no differences.
- T0091 browser sanity: local phone app loaded at `http://localhost:3000/?codexSmoke=t0091-gift-card-ui`; buy-entry flow reached the contact/payment group and showed the optional `Presentkort` input with the expected help text. Full public phone flow remains pending until T0091 is committed/merged and Cloudflare publishes the phone UI.
- T0091 dev API smoke: direct JumpYard Cloud quote calls with active masked gift-card fixtures passed. Invalid gift card returned HTTP `200`, `status=quoted`, `amountOwing=200`, and one safe gift-card error. The `100 kr` fixture reduced a `200 kr` quote to `amountOwing=100`. The `500 kr` fixture reduced a `200 kr` quote to `amountOwing=0`.
- T0091 no-payment draft smoke: direct JumpYard Cloud draft call with the full gift-card fixture created Roller Playground booking `5101055`, returned HTTP `201`, `amountOwing=0`, `giftCardAppliedCount=1`, and Aurora shows the local prepayment draft as `published` with `total_cents=20000` and `amount_owing_cents=0`.
- T0092 public smoke attempt: `https://jumpyard-check-in.pages.dev/?codexSmoke=t0092-gift-card` reached the buy-entry contact step, but the public UI did not show `Presentkort`. A cache-busted reload still lacked the field.
- T0092 public deploy verification: public HTML/JavaScript chunks for `https://jumpyard-check-in.pages.dev` did not contain `Presentkort`, `giftCard`, or `giftCards`; GitHub showed PR #93 merged as `9718b58` but no deployment/status for that merge commit.
- T0092 public UI retest: after Cloudflare updated, public phone app reached the buy-entry contact step and exposed the optional `Presentkort` field with help text.
- T0092 invalid gift-card public smoke: entering an invalid gift card produced safe text `Gift card could not be applied`, kept total `200 kr`, and disabled `Gå till betalning`.
- T0092 partial gift-card public smoke: the active `100 kr` fixture reduced a `200 kr` booking to `100 kr`, then rendered Roller/Adyen payment for `100 kr` with card, instalment, and Google Pay methods visible.
- T0092 full gift-card public smoke: the active full-cover fixture reduced a `200 kr` booking to `0 kr`, skipped card entry, and continued to the phone safety/check-in flow. Roller Data API showed paid API booking `5101070` for `2026-06-03`, and JumpYard Cloud lookup returned booking `5101070` as `found`, `Paid`, `amountOwing=0`, source `jumpyard_cloud`, lookup path `aurora:booking_reference`, freshness `fresh`, and one redeemable ticket.
- T0092 card-only regression smoke: a normal no-gift-card `200 kr` buy-entry flow still rendered Roller/Adyen payment for `200 kr`.
- T0092 direct Aurora CLI readback: not run because local AWS SSO for profile `wrlds-dev` had expired. Use `aws sso login --profile wrlds-dev` before any future direct RDS Data API verification.
- T0093 baseline costs smoke: direct Roller Playground `POST /bookings/draft/costs` for product `1765860`, `2026-06-03 10:00`, quantity `1`, returned `total=200`, `amountOwing=200`, `discount=0`, and empty `multiPassAllocations`.
- T0093 no-effect code smokes: invalid code, paid `10-Kort` booking reference, paid `10-Kort` unique id, paid `10-Kort` booking item id, and normal paid entry ticket id all returned HTTP `200` but kept `amountOwing=200` and `discount=0`. A returned/echoed discount row is not proof that the code applied.
- T0093 accepted code smoke: the masked paid `10-Kort` ticket id from booking `5101046` sent as `discounts: [{ code }]` reduced one `200 kr` entry to `amountOwing=0`, `discount=200`, and reduced quantity `2` from `400 kr` to `amountOwing=0`, `discount=400`; Roller returned it as a normal `percentOff=100` discount with empty `multiPassAllocations`.
- T0093 scope guard: no script files, app UI, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, assets, deliverables, production credentials, or `.env` changed.
- T0095 public phone regression: public phone app loaded, buy-entry time/product/quantity/add-on/contact path reached the optional `Presentkort` field, and live availability showed remaining capacity before product selection.
- T0095 payment regression: existing public card-only payment surface still rendered Roller/Adyen for `200 kr`, including card, instalment, Google Pay, and Swish. No payment was submitted.
- T0095 invalid gift-card regression: invalid gift-card input showed `Gift card could not be applied`, kept total `200 kr`, and disabled `Gå till betalning`.
- T0095 public staff/admin regression: public admin loaded, accepted the current dev staff code, and reached search, QR scan, and queue view. Queue was empty; no staff redeem was run.
- T0095 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, SMS/email sends, assets, deliverables, production credentials, or `.env` changed.
- T0096 public write/redeem rehearsal: public phone flow created booking `5101105` for `2026-06-03 14:30`, one normal `60 min entre`, no gift card, no membership/`10-Kort`, and no add-ons. Swish completed the `200 kr` Playground payment after card-field automation was blocked by cross-origin Adyen iframes.
- T0096 state verification: Roller Data API found booking `5101105` as `Paid`; JumpYard Cloud lookup returned `found`, eligibility `ready`, `source.system=jumpyard_cloud`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`.
- T0096 handoff/redeem: session `jycs_mpy1x4ne_910af158` was marked ready for staff with handoff `JY5397` and safety status `completed`; staff-confirmed redeem returned `redeemed` with one ticket consumed, and the public admin queue showed zero waiting handoffs afterwards.
- T0096 automation limits: the public phone app continued to `Sakerhetsvideo`, but the in-app browser runtime could not complete the loaded HTML5 safety video or type into cross-origin card fields. These are documented test-automation limits; no app/source changes were made.
- T0096 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller Live data, secrets, `.env`, SMS/email sends, assets, deliverables, or production credentials changed.
- T0097 official docs check: Roller Validate discount codes docs say that endpoint is being deprecated and Booking Costs should be used for discount validation. Roller Create Discount Codes docs confirm codes are first-class discount configuration artifacts, and membership redemption data exists as a Data API readback source.
- T0097 `10-Kort` fixture check: paid Playground booking `5101046` is still `Paid`, total `1750`, has customer id context, and contains membership-like markers. `GET /customers/4045520/multi-passes` returned HTTP `200` with zero balances.
- T0097 safe costs smokes: baseline one-entry quote returned `amountOwing=200`, invalid code kept `amountOwing=200` with `discount=0`, and the masked known `10-Kort` code sent as `discounts: [{ code }]` reduced one entry to `amountOwing=0`, `discount=200`, and quantity `2` to `amountOwing=0`, `discount=400`; `multiPassAllocations` stayed empty.
- T0097 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, AWS resources, Roller bookings, drafts, payments, redemptions, Live data, secrets, `.env`, assets, or deliverables changed.
- T0098 pre-write checks: `GET /bookings/5101046` returned `Paid`, customer id `4045520`, and one masked candidate code; `GET /customers/4045520/multi-passes` returned zero balances; a no-write costs quote with the masked code returned `amountOwing=0` and `discount=200`.
- T0098 controlled write: one dedicated Playground booking was created with the masked code. `POST /bookings/draft` returned HTTP `201`, `amountOwing=0`, and `paymentJwtPresent=true`; `POST /bookings/draft/publish` returned HTTP `201` and booking reference `5101114`.
- T0098 post-write checks: `GET /bookings/5101114` returned `Paid`; original and smoke customer `multi-passes` still returned zero balances; the same code still quoted as valid for up to ten entries, while quantity `11` left `amountOwing=200`.
- T0098 product coverage quotes: the masked code discounted representative entry/session pass products (`Entré 60 min`, `Entré 120 min`) and multi-quantity entry quotes, but did not discount JumpSocks, coffee/tea, SkyRider add-ons, or mixed-basket add-on amounts.
- T0098 Data API readback: `/data/bookingitems` found booking `5101114` with `bookingTotal=0`, `discountAmount=200`, one discount code/id, and no remaining-use balance. `/data/membershipredemptions` returned HTTP `400` with `startDate is required, endDate is required` despite supplied parameters, so Roller must clarify that endpoint before it can be used.
- T0099 implementation status: phone buy-entry checkout now has an optional `Klippkort` field, sends safe `discountCodes` to JumpYard Cloud quote/draft calls, displays applied/rejected state, and blocks no-effect codes. Booking Lambda returns safe discount-code metadata, hashes codes in idempotency material, redacts raw codes from Roller errors, and uses no-payment draft publish when gift card or klippkort coverage reduces `amountOwing` to zero.
- T0099 local validation: `node --check infra/lambda/booking/index.js`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed. Phone build reported existing baseline-browser-mapping age notices; `git diff --check` reported Git CRLF notices only.
- T0100 branch/deploy status: branch `codex/t0100-klippkort-deploy-smoke` was created on 2026-06-04. AWS SSO profile `wrlds-dev` resolved account `376129878018`; pre-deploy `npm.cmd --prefix infra run diff:dev` showed only `BookingHandler` Lambda code; `npm.cmd --prefix infra run deploy:dev` passed; post-deploy `npm.cmd --prefix infra run diff:dev` showed no differences.
- T0100 backend Klippkort smoke: dev JumpYard Cloud availability found entry product `1765860` at `10:00`. Baseline quote returned `amountOwing=200`; invalid code returned `amountOwing=200` with one safe discount-code error; the masked paid `10-Kort` ticket/code from booking `5101046` reduced entry-only to `amountOwing=0` with `discount=200`; mixed entry plus JumpSocks with `requireAvailability=false` left `amountOwing=45` and `discount=200`; a full-coverage draft was published without payment as Roller Playground booking `5101133`. Validation output and Aurora event rows used masked codes/counts only.
- T0100 regression smoke: the active masked `100 kr` gift card from booking `5101044` still applied separately through `giftCards`, reducing a `200 kr` quote to `amountOwing=100` with one applied gift card and no gift-card errors. PR #99 merged T0099/T0100 into `main`; after Cloudflare published, public bundle check for `https://jumpyard-check-in.pages.dev` found `Klippkort`, `clipCard`, and `discountCodes`. Public API smoke confirmed baseline `amountOwing=200`, invalid Klippkort kept `amountOwing=200` with one safe error, valid entry-only Klippkort reduced `amountOwing=0`, and mixed entry plus JumpSocks left `amountOwing=45`.
- T0089 AWS read-only checks: SNS SMS sandbox status is still enabled, SNS SMS type is transactional, monthly spend limit is `1` USD, no default Sender ID/origination number exists, AWS End User Messaging SMS is still sandbox tier with no sender ids/pools/phone numbers, SES production access is disabled, only `love@wrlds.com` is verified for SES, and no dedicated email configuration set exists.
- T0089 documentation: `GUEST_MESSAGING_PRODUCTION_UNLOCK.md` records SMS sandbox exit, SES production access, sender/domain identity gates, missing JumpYard/WRLDS inputs, and future approved implementation steps.
- T0089 scope guard: no app code, Lambda code, CDK resources, Aurora migrations, Roller config, support cases, sender identities, domains, SMS/email sends, EventBridge payloads, or `confirmSend` behavior changed.
- T0088 endpoint verification: official Roller docs page `Get guest detail` confirms `GET /guests/{guestId}` and states `guestId` is formerly/equivalent to `customerId`.
- T0088 deploy: `node --check infra/lambda/webhook/index.js`, `npm --prefix infra run synth:dev`, pre-deploy `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; CDK diff showed only `WebhookHandler` Lambda code.
- T0088 webhook smoke: safe Playground webhook event for booking `5100965` returned `status=accepted`, `enrichmentStatus=processed`, `guestDetailStatus=available`, and `guestNamePresent=true` without printing raw PII.
- T0088 Aurora readback: boolean-only query confirmed booking customer id, booking name flag, guest profile, first/last context, email, and phone were present without printing raw PII.
- T0081 branch setup: branch `codex/t0081-integrated-flow-rehearsal` was created from updated `main` after T0080 was merged through PR #82.
- T0081 new-booking smoke: public Cloudflare buy-entry flow created paid Playground booking `5100963` for `2026-06-01 14:00`, completed card payment with Adyen Visa ending `1142`, completed safety video and safety rules, and reached ready-for-staff session `jycs_mpv4s30n_b9f8b58c` with handoff `JY7597`.
- T0081 staff redeem smoke: staff login with the dev passcode returned a short-lived token, staff list/detail found booking `5100963`, and staff-confirmed redeem returned HTTP `200` with Roller status code `200`, redeemed ticket `5100963-21683812`, session status `redeemed`, and handoff status `completed`.
- T0081 Aurora/webhook readback: bookings `5100963` and `5100965` are `Paid`, `fresh`, and present in `jumpyard.roller_bookings`; their `Created` webhook events are `processed`; ticket `5100963-21683812` is locally marked `redeemed`, while `5100965-21683813` remains unredeemed for future testing.
- T0081 add-product blocker: public existing-booking add-product flow skipped visible contact fields and quote returned `45 kr`, but `RESERVERA TILLÄGG` failed closed with `customer.firstName is required for Roller draft booking creation` for old booking `5100926` and fresh paid booking `5100965`. Direct API confirmed quote succeeds but confirmed create fails without full resolved customer data.
- T0082 branch setup: branch `codex/t0082-add-product-contact-resolution` was created from updated `main` after T0081.
- T0082 backend fix: `infra/lambda/booking/index.js` now passes Roller `customerId` into local contact resolution, reads original JumpYard-created booking contact from `jumpyard.prepayment_booking_drafts`, and merges email/phone from Aurora guest profiles without inventing missing contact values.
- T0082 deploy: AWS preflight confirmed account `376129878018`, region `eu-north-1`, and approved dev tags. Pre-deploy CDK diff showed only `BookingHandler` Lambda code; deploy passed; post-deploy diff showed no differences.
- T0082 no-customer draft smoke: `POST /v1/bookings/5100965/add-products` with no `customer` payload created Roller Playground draft `45ee1b0e-ab69-4e31-832f-d956af599365`, prepayment draft `jypd_7d8379902449415aab`, add-on group `jyao_f93769db16d840678e`, and link `jyl_7e8eac4758424c24bc`; Aurora shows status `payment_pending`, total `4500` cents, and `payment_jwt_present=true`.
- T0083 branch setup: branch `codex/t0083-staff-identity-search` was created from updated `main` after T0082 was merged and pushed.
- T0083 backend/UI fix: `infra/lambda/session/index.js` adds staff-only guest identity mapping and backend search for handoff list; `infra/lambda/booking/index.js` stores first/last name on new prepayment drafts; `infra/lambda/data-sync/index.js` and `infra/scripts/import-related-data.ts` store Roller Data API customer first/last names in `guest_profiles.latest_booking_context`; `jumpyard-checkin-admin/src/lib/adminApi.ts` and `jumpyard-checkin-admin/src/app/page.tsx` show safe identity data, send search text to JumpYard Cloud, and show product names before ticket ids.
- T0083 migration/backfill: `npm --prefix infra run migrate:dev` applied `0008 prepayment draft customer names`, adding `customer_first_name` and `customer_last_name` to `jumpyard.prepayment_booking_drafts` and backfilling matched rows from `guest_profiles` where possible.
- T0083 deploy: AWS preflight confirmed account `376129878018`, region `eu-north-1`, and approved dev tags. CDK diffs were limited to `DataSyncHandler`, `BookingHandler`, and `SessionHandler` Lambda code over the staged deploys; deploys passed; final post-deploy diff showed no differences.
- T0083 staff API smoke: controlled ready-for-staff session for booking `5100965` was created without redeeming; staff search by booking reference, first name, derived last-name value, and masked contact found it, and the response included name plus masked email/phone flags while confirming raw `email`/`phone` fields were not returned.
- T0079 branch setup: branch `codex/t0079-add-product-ux-polish` was created from updated `main` after T0078 was merged through PR #80.
- T0079 backend behavior: existing-booking add-product quote/draft requests can omit `customer`; JumpYard Cloud resolves the original booking contact from Roller detail plus Aurora `guest_profiles` and fails closed if first name, last name, email, or phone cannot be resolved.
- T0079 phone behavior: the existing-booking add-product flow skips the visible contact form, quotes directly after add-on selection, sends no customer payload for add-product quote/draft, and shows a short payment-approved confirmation before continuing to the original safety/check-in path.
- T0079 validation: `node --check infra/lambda/booking/index.js`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed. Phone lint still reports only the pre-existing `<img>` warnings; local browser sanity loaded `http://localhost:3000/?codexSmoke=t0079-local`.
- T0078 branch setup: branch `codex/t0078-add-product-payment-flow` was created from updated `main` after T0077 was merged.
- T0078 public add-product smoke: `https://jumpyard-check-in.pages.dev` used paid existing booking `5100926`, entered the add-ons step, selected one `Strumpor`, collected add-on contact details, showed server quote `45 kr`, and created a separate linked add-on draft.
- T0078 linked-draft proof: the safe API response used `mode='separate_draft_booking'`, original booking `5100926`, Roller draft unique id `fe892301-95b7-490a-b4ad-dff311cfdd7f`, add-on group `jyao_32bbe440269649e7af`, link `jyl_77074c7ce26047b3b0`, and prepayment draft `jypd_529c13ed3a8a4d83a1`.
- T0078 payment continuation: the Roller/Adyen drop-in rendered card payment, secure iframes accepted the Adyen Visa test card ending `1142`, `Betala 45,00 kr` submitted, and the phone flow returned to the original booking's safety-video step.
- T0078 scope safety: no original booking mutation endpoint was used, no staff/admin redeem was performed, no AWS resources were changed, and no full guest contact data, Roller secrets, raw payment JWTs, access tokens, or full card data were printed.
- T0078 intermediate retry note: selector/debug attempts created unpaid pending linked add-on drafts for `5100929`, `5100928`, and `5100927`; the final successful payment pass was `5100926`.
- T0078 Aurora readback: direct read-only Aurora verification was not completed because the local AWS SSO token for profile `wrlds-dev` had expired.
- T0077 branch setup: branch `codex/t0077-existing-booking-happy-path` was created from updated `main` after T0076 was merged.
- T0077 merge: branch `codex/t0077-existing-booking-happy-path` was pushed and merged through PR #79 before T0078 started.
- T0077 paid booking discovery: read-only Roller Data API `/data/bookingitems` for modified-date window `2026-06-01 -> 2026-06-02` found paid booking `5100930`, booking date `2026-06-01`, session start `11:00`, product id `1765860`.
- T0077 public existing-booking smoke: `https://jumpyard-check-in.pages.dev/?codexSmoke=t0077-existing-5100930` used the existing-booking path, entered booking reference `5100930`, and reached the ready-for-staff QR/handoff screen without another payment.
- T0077 session resume behavior: the app resumed the existing server-owned ready-for-staff session and showed handoff/backup code `JY4704`, which confirms completed safety was not repeated.
- T0077 scope safety: no staff/admin redeem was performed, no AWS resources were changed, and no full guest contact data, Roller secrets, raw payment JWTs, or card data were printed.
- T0076 branch setup: branch `codex/t0076-new-booking-full-purchase-flow` was created from updated `main` after T0075 was merged.
- T0076 public browser smoke: `https://jumpyard-check-in.pages.dev` completed the new-booking path with 60 min entry at `11:00`, no add-ons, contact entry, basket review before payment, Adyen Visa test card ending `1142`, safety video, six safety confirmations, and final ready-for-staff QR/handoff state.
- T0076 payment/server path: captured public API flow included JumpYard Cloud availability, quote, draft creation, post-payment lookup, session creation, and ready-for-staff calls; frontend did not call Roller REST directly or receive Roller credentials.
- T0076 final handoff: successful smoke reached `REDO FOR PERSONAL`/ready-for-staff with handoff/backup code `JY4704` and one armband item.
- T0076 lookup timing: a short `404` lookup retry occurred immediately after payment before the paid booking became visible; the following lookup succeeded and the flow continued to handoff.
- T0076 Aurora readback: direct read-only Aurora verification was not completed because the local AWS SSO token for profile `wrlds-dev` had expired.
- T0075 branch setup: branch `codex/t0075-card-payment-unblock` was created successfully after permissions changed.
- T0075 payment readiness: `ROLLER_PAYMENT_ALLOWLIST_CONFIRMED=true npm.cmd run roller:payment:readiness -- --json` returned `ready_for_payment_implementation`, with venue payment settings available, docs reachable, public origin reachable, and no blockers.
- T0075 payment POC: `ROLLER_PAYMENT_PUBLIC_ORIGIN=https://jumpyard-check-in.pages.dev ROLLER_PAYMENT_TEST_CARD_CONFIRMED=true npm.cmd run roller:payment:poc -- --json` returned `ready_for_browser_payment_test`; the script now recognizes the vendored `@roller/ecom-payments` package `1.0.217`.
- T0075 public browser smoke: `https://jumpyard-check-in.pages.dev` rendered `Kortbetalning`, selected 60 min entry at `10:00`, filled the Adyen Visa test card ending `1142`, submitted `Betala 200,00 kr`, and reached the phone safety-video step with no captured request failures.
- T0075 in-app browser note: Codex in-app browser can verify card rendering but cannot type into Adyen cross-origin secure iframes; the actual card-entry smoke used Playwright with installed Chrome.
- T0075 payment-method follow-up: current public drop-in renders card, Delbetalning, and Google Pay; Swish is not visible after the card fix, and `FU-071` tracks Pabel/Roller confirmation for Swish and Apple Pay.
- T0074 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0074 SNS sandbox state: `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`; unverified guest phone numbers still cannot receive SMS.
- T0074 SNS SMS attributes: `DefaultSMSType=Transactional`, `MonthlySpendLimit=1`, `DeliveryStatusSuccessSamplingRate=100`, and delivery-status IAM role are configured; no `DefaultSenderID` is set.
- T0074 AWS End User Messaging SMS state: account tier is `SANDBOX`, and read-only checks found no sender IDs and no pools.
- T0074 official docs review: AWS production SMS access requires a support request with use case, website/app URL, target countries, message type, opt-in/consent, sample message copy, and volume/rate expectations.
- T0074 support package: `PROJECT_CONTEXT.md` contains a draft AWS Support case; user still needs to confirm expected monthly volume, peak rate, final transactional copy, opt-in/consent wording, opt-out/support wording, and approval to submit.
- T0074 safety: no AWS Support case was submitted, no sender resources were created, no SMS attributes were changed, and EventBridge booking-time messaging remains `confirmSend=false`.
- T0074 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0073 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0073 scoped booking: created paid Roller Playground booking `5100877` for `2026-05-29 15:30` with approved test SMS/email destinations only.
- T0073 Aurora refresh: manual Data API sync for `2026-05-29 -> 2026-05-30` succeeded with 4 bookingitems, 4 tickets, 4 payments, 5 customers, 491 products, and 4 booking upserts.
- T0073 unified planning: protected `POST /v1/check-in/session-links/send-due-messages` with `confirmSend=false` planned one SMS and one email for booking `5100877`, using masked destinations only.
- T0073 controlled confirmed send: protected `confirmSend=true` processed one SMS delivery `jysms_mpqwyxay_e7fe6d3c` and one email delivery `jyem_mpqwyxox_94ea00f5`, both recorded in Aurora as `sent`, `dry_run=false`, with provider message ids present.
- T0073 provider status: SNS delivery log reported `Message has been accepted by phone`; SES acceptance is represented by the stored SES provider message id because no SES delivery-event stream is configured.
- T0073 manual confirmation: user confirmed SMS and email arrived; current text is acceptable for now but needs copy polish before broader guest rollout.
- T0073 schedule safety: EventBridge booking-time messaging remains `confirmSend=false`, so unattended scheduled sends are still disabled.
- T0073 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0072 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0072 SMS readiness: SNS SMS sandbox is still enabled, one masked test recipient is verified, `DefaultSMSType=Transactional`, monthly spend limit is `1`, delivery-status success sampling is `100`, and a delivery-status role is configured. The session Lambda requests `SMS_SENDER_ID=JumpYard`, but no account `DefaultSenderID` is set, so actual handset sender display must be verified in T0073.
- T0072 email readiness: SES sending is enabled but `ProductionAccessEnabled=false`; quota is 200 messages per 24 hours and 1 message per second; only email identity `love@wrlds.com` is verified; no domain identity, DKIM signing, or custom MAIL FROM setup exists.
- T0072 schedule safety: EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule` invokes unified channels `sms` and `email` every 5 minutes with `confirmSend=false`, so scheduled runs remain planning-only.
- T0072 audit/monitoring: Aurora has safe planned/sent aggregate rows for SMS and email; session Lambda alarms are `OK`; channel-specific SMS/email alarms and runbooks are still open follow-ups.
- T0072 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0071 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`, and region is `eu-north-1`.
- T0071 Data API schedule: EventBridge rule `jumpyard-check-in-dev-data-api-daily-sync` is `ENABLED`, runs `cron(0 2 * * ? *)`, targets `jumpyard-check-in-dev-stack-data-sync`, and latest scheduled run `2026-05-28 -> 2026-05-29` succeeded.
- T0071 manual Data API sync: Lambda invoke for `2026-05-29 -> 2026-05-30` succeeded in about 31 seconds with 2 bookingitems, 2 tickets, 2 payments, 2 customers, 491 products, and 2 booking upserts.
- T0071 webhook/Aurora health: recent `Created` webhook events for bookings `5100835` and `5100836` are `processed`; both bookings are `Paid`, `fresh`, and have item/ticket/payment rows after sync.
- T0071 lookup freshness: `POST /v1/check-in/lookup` for `5100836` returned `found`, `ready`, source `jumpyard_cloud`, lookup path `aurora:booking_reference`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`.
- T0071 alarm check: data-sync Lambda errors/throttles, webhook Lambda errors/throttles, and Roller API error alarms are `OK`.
- T0071 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0070 integrated smoke: fresh paid Roller Playground booking `5100836` for `2026-05-29 10:30` looked up through JumpYard Cloud as `found/ready` from `aurora:booking_reference`, started session `jycs_mpqo1mlo_177e4e06`, marked handoff `JY2024` ready for staff, staff-authenticated, staff-confirm redeemed one ticket, and final staff detail showed session `redeemed`, handoff `completed`, and one local redeemed ticket.
- T0070 cleanup: earlier retry session `jycs_mpqo02zt_3e4329f9` for booking `5100835` was staff-redeemed as cleanup; the staff ready list then returned count `0`.
- T0070 observation: Roller `GET /bookings/5100836` returned HTTP `200` after redeem, but the booking-detail ticket object did not expose a clear redeemed status field. The authoritative Roller write was the successful staff-confirmed `POST /redemptions` path, and local Aurora staff detail reflected the redeemed state.
- T0070 final validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0069 docs validation: `npm run validate` and `git diff --check` passed on 2026-05-29; `git diff --check` reported CRLF line-ending notices only.
- T0068 syntax/build/synth: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed on 2026-05-28.
- T0068 AWS preflight/deploy: account `376129878018` and region `eu-north-1` were verified. CDK diff showed only the new `send-due-messages` route, session Lambda code asset, and EventBridge booking-time payload/description changes; deploy passed and post-deploy diff showed no differences.
- T0068 unified route smoke: protected `POST /v1/check-in/session-links/send-due-messages` planning mode returned `booking_time_messages_planned` with separate `sms` and `email` channel results and masked destinations only.
- T0068 legacy route smoke: protected `POST /v1/check-in/session-links/send-due-sms` still returned `booking_time_sms_planned` with SMS-only channel results.
- T0068 scheduled-event smoke: direct Lambda invoke with EventBridge-shaped `scheduled_booking_time_messaging` payload returned planning results for both channels without public dev-token auth and with `confirmSend=false`.
- T0068 final validation: `npm run validate` and `git diff --check` passed on 2026-05-28; `git diff --check` reported CRLF line-ending notices only.
- T0056 validation: `node --check infra/lambda/lookup/index.js`, `node --check infra/lambda/webhook/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-27. `git diff --check` reported CRLF notices only.
- T0056 AWS preflight/deploy: account `376129878018` and region `eu-north-1` were verified with short-lived credentials exported from the existing `wrlds-dev` SSO profile. Pre-deploy diff showed only `LookupHandler` and `WebhookHandler` Lambda code asset changes, deploy passed, and post-deploy diff showed no differences.
- T0056 dev smoke: lookup for known paid booking `5063394` returned `found`/`ready`, Roller unique id `abec3317-1dc1-4b44-917b-5b52ae104d69`, `paymentStatus=Paid`, and `amountOwing=0`. Aurora row `jypd_835161973ab34210ac` changed to `published`, `amount_owing_cents=0`, and `event_log` contains `prepayment_draft.published`.
- T0057 integrated smoke: booking `5063394` still looks up as `Paid`/`ready` with draft `jypd_835161973ab34210ac` already `published`.
- T0057 redeemable happy path: protected Playground seed booking `5063420` for `2026-05-27` completed lookup, session `jycs_mpns6nvd_bc6ab155`, handoff `JY2947`, staff auth/list/detail, staff-confirmed redeem, and Aurora final state `sessionStatus=redeemed`, `handoffStatus=completed`, `selectedTicketCount=1`, `redeemedTicketCount=1`.
- T0057 browser smoke: public phone app `https://jumpyard-check-in.pages.dev` loaded with buy-entry and booking lookup copy; local admin app was temporarily started on `127.0.0.1:3002`, rendered the handoff shell, and was stopped after verification.
- T0057 finding: mixed entry plus JumpSocks booking `5063419` reached ready-for-staff, but staff redeem was rejected by Roller with `Product type not accepted` because selected tickets included non-redeemable add-on tickets.
- T0058 read-only AWS audit: account `376129878018`, region `eu-north-1`, stack `UPDATE_COMPLETE`, API `m0uo5g4mde`, Aurora `available`, SNS SMS sandbox `true`, and zero `jumpyard-check-in-dev*` CloudWatch alarms were confirmed without changing resources.
- T0058 readiness result: dev is suitable for Playground development and controlled smoke tests, but staging/live is blocked by environment split, production auth/API guardrails, observability alarms, SMS production readiness, secrets lifecycle, retention/cutover, and deployment rollback runbooks.
- T0058 validation: `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-27. `git diff --check` reported CRLF notices only.
- T0059 validation: `node --check infra/lambda/redeem/index.js`, `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-28.
- T0059 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only `RedeemHandler` and `SessionHandler` Lambda code assets; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0059 mixed booking smoke: booking `5063419` plan selected entry tickets `5063419-21529629` and `5063419-21529630`, excluded add-on tickets `5063419-21529631` and `5063419-21529632`, and a new session selected only the two entry tickets. Staff-confirmed Playground redeem succeeded for the two entry tickets using the booking-date redemption timestamp; Aurora shows the two add-on tickets still unredeemed.
- T0059 entry-only regression: booking `5063394` plan selected one ticket, excluded zero, and remained ready; already-redeemed entry-only bookings `5063420` and `5032454` stayed blocked as `already_redeemed` with one selected ticket and zero excluded tickets.
- T0060 validation: `node --check` passed for lookup, booking, redeem, webhook, and data-sync Lambdas; `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run infra:check`, `npm run validate`, and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0060 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed explicit CORS, API access log group, CloudWatch dashboard/alarms, Lambda env updates, and Roller metric code; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0060 AWS verification: CloudWatch dashboard `jumpyard-check-in-dev-ops` exists; `describe-alarms --alarm-name-prefix jumpyard-check-in-dev` returned 16 alarms; API CORS origins are explicit and include `https://jumpyard-check-in.pages.dev`.
- T0060 smoke: `OPTIONS /v1/bookings/availability` from `https://jumpyard-check-in.pages.dev` returned HTTP `204` with that allowed origin; `POST /v1/bookings/availability` for `2026-05-28` at `10:00` returned `status=available`, source `roller`, `wroteBooking=false`, and booking Lambda logs showed safe Roller API call metric entries for `oauth_token` and `get_product_availability`.
- T0061 validation: `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run infra:check`, `npm run validate`, and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0061 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only API Gateway stage throttling, a CloudWatch Logs metric filter, one CloudWatch alarm, and dashboard updates; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0061 AWS verification: API Gateway `$default` stage has `DetailedMetricsEnabled=true`, `ThrottlingBurstLimit=50`, and `ThrottlingRateLimit=25`; CloudWatch Logs metric filter `ApiThrottledRequestMetricFilter...` writes `JumpYard/Cloud` metric `ApiThrottledRequestCount`; alarm `jumpyard-check-in-dev-api-throttled-requests` exists.
- T0061 smoke: `POST /v1/bookings/availability` returned HTTP `200` after throttling was enabled, with source `roller` and `wroteBooking=false`.
- T0062 validation: route inventory comparison found 19 CDK route declarations and 19 documented routes; `npm run validate` and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0062 roadmap adjustment: user chose to postpone the environment/cutover plan and prioritize guest messaging verification plus email service foundation as T0063.
- T0062 AWS/resource result: no AWS resources, app code, Lambda code, CDK code, Aurora schema, package dependencies, or Roller config were changed.
- T0063 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm run validate`, and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0063 AWS preflight: account `376129878018`, region `eu-north-1`; SES sending is enabled but `list-email-identities` returned no verified identities.
- T0063 migration/deploy: `npm --prefix infra run migrate:dev` applied `0007 email deliveries`; pre-deploy diff showed one email route, session Lambda code/env/IAM, and SMS base URL target update; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0063 email dry-run smoke: protected route `POST /v1/check-in/session-links/send-email` for booking `5063420` returned `email_planned`, delivery `jyem_mppbtp9i_5e98ee13`, provider `aws_ses`, masked destination `l***@e***.com`, and preview text with `[check-in-link]` placeholder instead of a raw token URL.
- T0063 Aurora verification: latest `jumpyard.email_deliveries` row has delivery `jyem_mppbtp9i_5e98ee13`, booking `5063420`, status `planned`, `dry_run=true`, provider `aws_ses`, and template `checkin_email_v1`.
- T0063 confirmed-send guard: confirmed email request returned HTTP `400` with `email_sender_not_configured` because no SES sender identity is configured yet.
- T0063 SMS safety smoke: protected SMS dry-run with public base URL returned `sms_planned`, delivery `jysms_mppbz4gm_e52cdd54`, provider `aws_sns`, and masked destination `+46*****9508`; dev scheduled SMS remains `confirmSend=false`.
- T0064 roadmap result: docs now prioritize guest SMS completion, guest email completion, and unified booking-time guest messaging before environment/cutover, alarm runbooks, dev-token replacement, route auth/WAF, retention, deployment rollback, and live backfill/cutover rehearsal.
- T0064 validation: `npm run validate` and `git diff --check` passed on 2026-05-28. `git diff --check` reported CRLF notices only.
- T0065 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed on 2026-05-28. Phone lint still reports the pre-existing four `<img>` warnings; `git diff --check` reported CRLF notices only.
- T0065 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only the `SessionHandler` Lambda code asset changing; `npm --prefix infra run deploy:dev` passed for SMS diagnostics, and the follow-up token fallback deploy also changed only `SessionHandler`.
- T0065 confirmed SMS smoke: protected `POST /v1/check-in/session-links/send-sms` for booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `sms_sent`, delivery `jysms_mppg15lj_7c660ef2`, provider `aws_sns`, provider message id present, sender ID configured/requested, and masked destination `+46*****9508`.
- T0065 Aurora/SNS verification: `jumpyard.sms_deliveries` contains delivery `jysms_mppg15lj_7c660ef2` with status `sent`, `dry_run=false`, and CloudWatch SNS delivery status reports `SUCCESS` with provider response `Message has been accepted by phone.`
- T0065 `jy_token` routing verification: local phone app opened an active token for booking `5063394` directly to `APP_BOOKING`; an already-redeemed token for booking `5063420` opened `APP_PRESENT` with `REDAN INCHECKAD`; an invalid token still fell back to `KIOSK_LOOKUP`.
- T0065 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0066 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, and AWS SES readiness checks passed on 2026-05-28 before deploy.
- T0066 deploy: AWS preflight confirmed account `376129878018` and region `eu-north-1`; pre-deploy diff showed only the `SessionHandler` Lambda code asset changing; `npm --prefix infra run deploy:dev` passed.
- T0066 SES readiness: `aws sesv2 get-account` returned `SendingEnabled=true`, `ProductionAccessEnabled=false`, max 200 emails per 24 hours, max send rate 1 email/second; `list-email-identities` returned no identities.
- T0066 email dry-run smoke: protected `POST /v1/check-in/session-links/send-email` for booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `email_planned`, delivery `jyem_mppic9ea_01a07299`, provider `aws_ses`, `fromAddressConfigured=false`, `replyToConfigured=false`, and masked destination `t0***@example.invalid`.
- T0066 Aurora verification: `jumpyard.email_deliveries` contains delivery `jyem_mppic9ea_01a07299` with status `planned`, `dry_run=true`, provider `aws_ses`, and template `checkin_email_v1`.
- T0066 confirmed-send guard: confirmed email request returned HTTP `400` with `email_sender_not_configured`, which is expected until a verified SES sender/domain is configured.
- T0067 AWS/SES preflight: account `376129878018`, region `eu-north-1`; SES remains sandboxed with `ProductionAccessEnabled=false`, sending enabled, max 200 emails per day, and max send rate 1 email/second.
- T0067 SES identity: created tagged SES email identity `love@wrlds.com`; current status is `VerificationStatus=SUCCESS` and `VerifiedForSendingStatus=true`.
- T0067 deploy: `infra/config/dev.json` now sets `guestEmail.fromAddress` and `guestEmail.replyToAddresses` to `love@wrlds.com`; CDK diff showed only `SessionHandler` environment variables changing, and deploy passed.
- T0067 real email smoke: protected `POST /v1/check-in/session-links/send-email` for booking `5063420` used public base URL `https://jumpyard-check-in.pages.dev/`, returned `email_sent`, and Aurora shows sent deliveries `jyem_mppo8w07_296c1a5e` and `jyem_mppo99gl_3c888240` with provider message ids present.
- T0055 validation: public Cloudflare smoke after merge created paid booking `5063394`, started/resumed a JumpYard Cloud session, and routed the phone flow to safety. The matching local prepayment draft still showed `payment_pending`, which is the T0056 reconciliation target.
- T0055 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, local browser progress smoke at `http://localhost:3000/`, `npm run validate`, and `git diff --check` passed on 2026-05-26. Browser smoke confirmed compact progress labels `Entré`, `Tillägg`, `Betalning`, `Säkerhet`, and `Klar`, and advanced through `TIMESLOT`, `PRODUCT`, `QUANTITY`, `ADDONS`, and `CONTACT`. Phone lint still reports the pre-existing four `<img>` warnings, and Next build still reports stale `baseline-browser-mapping` advisory warnings.
- T0054 validation: public Cloudflare smoke confirmed T0053 flow order, Swish payment created paid booking `5063382`, JumpYard Cloud lookup returned `Paid`/`amountOwing=0`/`canCheckIn=true`, safe payment-config inspection found no `scheme` card method for the current Playground custom-checkout configuration, and `git diff --check` passed with CRLF notices only.
- T0053 validation: `npm run validate`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, local browser flow smoke at `http://localhost:3000/`, and `git diff --check` passed on 2026-05-26. Browser smoke selected 60 min entry plus one socks add-on and reached review with both lines before draft/payment. Phone lint still reports the pre-existing four `<img>` warnings, and Next build still reports stale `baseline-browser-mapping` advisory warnings.
- T0052 validation: `npm run validate`, `cd jumpyard-checkin-phone && npm run lint`, `cd jumpyard-checkin-phone && npm run build`, source scan for raw JWT/logging, local browser smoke at `http://localhost:3000/`, and `git diff --check` passed on 2026-05-26. Phone lint still reports the pre-existing four `<img>` warnings, and Next build still reports stale `baseline-browser-mapping` advisory warnings. Public browser card smoke is now unblocked by Pabel's allowlist confirmation and remains pending execution.
- T0051 validation: `npm run validate`, `npm run roller:payment:readiness`, `cd jumpyard-checkin-phone && npm run lint`, `cd jumpyard-checkin-phone && npm run build`, source scan for raw JWT/logging, local browser smoke at `http://127.0.0.1:3000/`, and `git diff --check` passed on 2026-05-26. Pabel later confirmed the public-origin allowlist. `npm audit --omit=dev` warns on existing `next@16.0.8`/`postcss` advisories and is tracked as `FU-043`. A local payment bootstrap spinner was fixed so missing package configuration becomes a visible unavailable state.
- T0050 validation: `node --check scripts/roller-payment-readiness.js`, `npm run roller:payment:readiness`, `npm run validate`, and `git diff --check` passed. Readiness reported Roller `/venues/me` HTTP `200`, `paymentSettings` available, public origin HTTP `200`, Roller docs HTTP `200`, and blocker `public_origin_allowlist_confirmation`.
- T0049 validation: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, unsafe confirmed-send synth guards, runtime guard smoke, `npm run validate`, pre/post `npm --prefix infra run diff:dev`, `npm --prefix infra run deploy:dev`, and `git diff --check` passed.
- T0049 post-credential-recovery smoke: new Playground booking `5063366` for `2026-05-26` returned `ready` from JumpYard Cloud, existed in Aurora as `Paid`/`fresh` with 4 tickets, started check-in session `jycs_mpmg3swu_0c34710f`, reached `ready_for_staff` with handoff `JY8713`, and appeared in the staff-auth-protected handoff list/detail without redeeming tickets.
- T0048 validation: admin lint/build passed, phone lint/build passed with existing image optimization warnings, kiosk build passed, `npm run validate` passed, and `git diff --check` passed.
- T0048 kiosk lint: `npm --prefix jumpyard-checkin-kiosk run lint` is still blocked by pre-existing component/context lint errors outside the shell font change.
- T0048 browser validation: admin `http://127.0.0.1:3002/` and phone `http://localhost:3000/` both used the documented system sans-serif font stack and showed no horizontal overflow at `390x844` or `1280x800`.
- T0048 admin copy validation: browser checks on `http://localhost:3002/` showed the login surface no longer renders `Personal`, `Logga in`, `Logga ut`, or the previous login/input icons. Logged-in mobile header stays on one row, `Sök` and `Skanna QR` render as 900 italic, and the search placeholder is `Sök eller skanna QR`.
- Infra validation: `npm run infra:check` passed during T0007 on 2026-05-20.
- Infra synth: `npm run infra:synth` passed during T0004 using `infra/config/dev.example.json`.
- Metadata guard: missing `-c config=...` fails as expected before synth.
- AWS CLI preflight: `aws --version` passed on 2026-05-19.
- AWS identity preflight: `aws sts get-caller-identity` failed on 2026-05-19 because no AWS credentials are configured.
- AWS config preflight: `aws configure list` shows no profile, access key, secret key, or region.
- T0006 dev metadata: confirmed account `376129878018`, region `eu-north-1`, profile `wrlds-dev`, resource prefix `jumpyard-check-in-dev`, and WRLDS tags in `infra/config/dev.json`.
- AWS SSO login: `aws sso login --profile wrlds-dev` passed on 2026-05-19.
- AWS identity preflight after login: account `376129878018`, assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- AWS region preflight after login: `eu-north-1`.
- Dev synth: `npm --prefix infra run synth:dev` passed with `infra/config/dev.json`.
- Dev diff before deploy: `npm --prefix infra run diff:dev` showed only the approved foundation resources.
- First dev deploy attempt: failed because Aurora PostgreSQL `16.3` is not available in `eu-north-1`; rollback completed and retained empty S3 bucket was deleted.
- Final dev deploy: `npm --prefix infra run deploy:dev` passed after changing Aurora PostgreSQL to `16.13`.
- Post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- Placeholder API smoke: `POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/check-in/lookup` returned HTTP `501`.
- T0007 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018` on 2026-05-20 after SSO login refresh.
- T0007 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- Aurora migration status before apply: `npm --prefix infra run migrate:dev:status` showed `0001 initial schema: pending`.
- Aurora migration apply: `npm --prefix infra run migrate:dev` applied `0001 initial schema`.
- Aurora migration status after apply: `npm --prefix infra run migrate:dev:status` showed `0001 initial schema: applied`.
- Aurora migration idempotency: re-running `npm --prefix infra run migrate:dev` skipped the already-applied `0001 initial schema`.
- Aurora Data API verification: `jumpyard` schema contains 15 tables and 62 indexes.
- Infra dependency audit: `npm --prefix infra audit` reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; no dependency fix was applied in T0007.
- Roller env validation: `npm run roller:env:check` passed with local `.env` during T0002.
- Roller smoke validation: `npm run roller:smoke` passed with local `.env`; `/products` returned HTTP 200 and 96 products on 2026-05-19.
- Booking lookup validation: read-only `GET /bookings/5001370` returned HTTP 200 with booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`, status `PendingPayment`, amount owing `260`, and ticket `5001370-21265504`.
- T0008 seed dry-run: `npm run roller:seed:playground` passed on 2026-05-20, resolved 6 scenarios, and selected child/variation product IDs for `Entré 120 min`, `JumpSocks`, `SkyRider`, `Hänglås`, and coffee/tea.
- T0008 apply guard: `npm run roller:seed:playground:apply` without `ROLLER_SEED_ALLOW_WRITE` failed closed before writes.
- T0008 production URL rejection: `ROLLER_BASE_URL=https://api.roller.app` was rejected before auth/write.
- T0008 Playground seed apply: guarded apply created booking references `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, and `5032215` in Playground on 2026-05-20.
- T0008 seed readback: read-only `GET /bookings/{bookingReference}` returned HTTP 200 for all six new references. `5032210` is `Paid` with amount owing `0`; the others are `PendingPayment`.
- T0009 local handler smoke: paid, pending, wrong-date, and not-found lookup cases returned expected normalized responses using AWS Secrets Manager/SSM plus Roller Playground.
- T0009 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0009 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0009 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved lookup Lambda code change.
- T0009 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-lookup` successfully.
- T0009 deployed smoke: `POST /v1/check-in/lookup` returned `ready` for `5032210`, `payment_required` for `5032211`, `wrong_date` for `5032212` with expected date `2026-05-21`, and `not_found` for `999999999`.
- T0009 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0009 validation: `npm run validate` and `npm --prefix infra run check` passed.
- T0010 validation: `npm run validate` passed.
- T0010 phone lint: `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings.
- T0010 phone build: `cd jumpyard-checkin-phone && npm run build` passed.
- T0010 CORS preflight: `OPTIONS /v1/check-in/lookup` returned HTTP `204` with `access-control-allow-origin: *`.
- T0010 local dev server: `http://127.0.0.1:3000` returned HTTP `200`.
- T0010 headless browser automation: not run because Playwright is not installed in `jumpyard-checkin-phone`.
- T0011 script syntax: `node --check scripts/roller-data-api-smoke.js` passed.
- T0011 Data API smoke: `npm run roller:data:smoke` passed with local `.env`; `/data/bookingitems` returned 9 records for modified-date window `2026-05-20 -> 2026-05-21`.
- T0011 Data API seed reference check: Data API response included seed booking references `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, and `5032215`.
- T0011 Data API response shape: first page returned object keys `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, and `items`.
- T0011 production URL rejection: `ROLLER_BASE_URL=https://api.roller.app` was rejected before Data API calls.
- T0012 infra build: `npm --prefix infra run build` passed.
- T0012 dry-run: `npm --prefix infra run import:bookingitems:dev -- --start-date 2026-05-20 --end-date 2026-05-21` returned 9 records, 6 bookings, 9 booking items, and 0 skipped records without Aurora writes.
- T0012 write guard: `npm --prefix infra run import:bookingitems:dev:apply -- --start-date 2026-05-20 --end-date 2026-05-21` failed closed without `ROLLER_IMPORT_ALLOW_WRITE`.
- T0012 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0012 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0012 dev apply: guarded apply upserted 6 bookings and 9 booking items into Aurora.
- T0012 idempotency check: re-running guarded apply against the same window still matched 6 bookings and 9 booking items.
- T0012 Aurora verification: direct Data API query returned booking references `5032210` through `5032215` in `jumpyard.roller_bookings`.
- T0012 seed run verification: latest `jumpyard.booking_seed_runs` row for the import has status `succeeded` and counts 9 source records, 6 booking upserts, and 9 booking item upserts.
- T0013 infra build: `npm --prefix infra run build` passed.
- T0013 dry-run: `npm --prefix infra run import:products:dev` returned 96 top-level products and 491 flattened product/variation rows without Aurora writes.
- T0013 write guard: `npm --prefix infra run import:products:dev:apply` failed closed without `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE`.
- T0013 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0013 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0013 dev apply: guarded apply matched 491 `jumpyard.product_catalog_cache` rows and 9 `jumpyard.roller_booking_items` rows with product names.
- T0013 Aurora verification: seed booking item product names now include `Biljetter (260 kr)`, `Antal`, `SkyRider 1 åk`, `Hänglås`, and `Islatte`.
- T0014 Data API tickets smoke: `node scripts/roller-data-api-smoke.js --path /data/tickets --start-date 2026-05-20 --end-date 2026-05-21 --max-pages 2 --json` returned 6 records.
- T0014 Data API bookingpayments smoke: `node scripts/roller-data-api-smoke.js --path /data/bookingpayments --start-date 2026-05-20 --end-date 2026-05-21 --max-pages 2 --json` returned 0 records.
- T0014 Data API customers smoke: `node scripts/roller-data-api-smoke.js --path /data/customers --start-date 2026-05-20 --end-date 2026-05-21 --max-pages 2 --json` returned 6 records with contact fields.
- T0014 migration status before apply: `0001 initial schema` applied and `0002 related data sources` pending.
- T0014 migration apply: `npm --prefix infra run migrate:dev` applied `0002 related data sources`.
- T0014 migration status after apply: `0001` and `0002` applied.
- T0014 dry-run: `npm --prefix infra run import:related-data:dev -- --start-date 2026-05-20 --end-date 2026-05-21` returned 6 tickets, 0 payments, 6 customers, and 0 skipped records without Aurora writes.
- T0014 write guard: `npm --prefix infra run import:related-data:dev:apply -- --start-date 2026-05-20 --end-date 2026-05-21` failed closed without `ROLLER_RELATED_IMPORT_ALLOW_WRITE`.
- T0014 dev apply: guarded apply upserted 6 tickets, 0 payments, and 6 customers into Aurora.
- T0014 idempotency check: re-running guarded apply against the same window upserted the same records without duplicate rows.
- T0014 Aurora verification: direct Data API query returned 6 ticket rows, 0 payment rows, and 6 guest profile rows with masked contact output.
- T0015 webhook Lambda syntax: `node --check infra/lambda/webhook/index.js` passed.
- T0015 local handler smoke: unauthorized and invalid JSON requests returned HTTP `200`; missing database config returned HTTP `500`.
- T0015 infra build: `npm --prefix infra run build` passed.
- T0015 dev synth: `npm --prefix infra run synth:dev` passed.
- T0015 pre-deploy diff: `npm --prefix infra run diff:dev` showed the webhook Lambda asset and dev webhook-token secret changes.
- T0015 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0015 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0015 deploy: `npm --prefix infra run deploy:dev` passed; stack reported no changes because AWS was already in sync with the synthesized T0015 template.
- T0015 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0015 deployed unauthorized smoke: `POST /v1/roller/webhooks/bookings` without token returned HTTP `200` and `ignored_unauthorized`.
- T0015 deployed accepted smoke: `POST /v1/roller/webhooks/bookings` with dev token returned HTTP `200` and `accepted` for event `t0015-smoke-booking-created-5032210`.
- T0015 deployed duplicate smoke: repeating the same authorized request returned HTTP `200` and `duplicate`.
- T0015 Aurora verification: direct Data API query returned webhook event `t0015-smoke-booking-created-5032210` with status `received`.
- T0015 final validation: `npm run validate`, `npm --prefix infra run build`, and `node --check infra/lambda/webhook/index.js` passed.
- T0016 lookup Lambda syntax: `node --check infra/lambda/lookup/index.js` passed.
- T0016 local invalid JSON check: lookup handler returned HTTP `400` with `invalid_json`.
- T0016 local Aurora-first smoke: `5032210`, `5032211`, and `5032212` returned from source `jumpyard_cloud` without Roller refresh.
- T0016 local live-refresh smoke: first `5001370` lookup returned source `roller` and `refreshedFromRoller=true`; second `5001370` lookup returned source `jumpyard_cloud`.
- T0016 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0016 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0016 infra build: `npm --prefix infra run build` passed.
- T0016 dev synth: `npm --prefix infra run synth:dev` passed.
- T0016 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the lookup Lambda code asset change.
- T0016 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-lookup`.
- T0016 deployed smoke: `5032210` => `ready` from `jumpyard_cloud`; `5032211` => `payment_required` from `jumpyard_cloud`; `5032212` => `wrong_date` from `jumpyard_cloud`; `999999999` => HTTP `404` `not_found`; invalid JSON => HTTP `400` `invalid_json`.
- T0016 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0016 final validation: `npm run validate`, `npm --prefix infra run build`, and `node --check infra/lambda/lookup/index.js` passed.
- T0017 webhook Lambda syntax: `node --check infra/lambda/webhook/index.js` passed.
- T0017 local webhook enrichment smoke: event `t0017-local-webhook-enrich-5032210-20260521094844` returned HTTP `200`, enrichment `processed`, booking `5032210`, 2 items, and 4 tickets.
- T0017 local Aurora verification: direct Data API query showed the local smoke event with status `processed`, one enrichment attempt, and `processed_at`.
- T0017 infra build: `npm --prefix infra run build` passed.
- T0017 dev synth: `npm --prefix infra run synth:dev` passed.
- T0017 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the webhook Lambda code asset change.
- T0017 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-webhook`.
- T0017 deployed smoke: event `t0017-deployed-webhook-enrich-5032210-20260521095241` returned HTTP `200`, enrichment `processed`, booking `5032210`, 2 items, and 4 tickets.
- T0017 deployed Aurora verification: direct Data API query showed the deployed smoke event with status `processed`, one enrichment attempt, and `processed_at`.
- T0017 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0017 final validation: `npm run validate`, `npm --prefix infra run build`, and `node --check infra/lambda/webhook/index.js` passed.
- T0018 webhook registration dry-run: `npm --prefix infra run register:webhook:dev` passed and detected existing webhook id `238`.
- T0018 webhook registration apply: guarded apply registered Roller Playground webhook id `238` against the dev endpoint.
- T0018 real delivery discovery: Roller sends the configured webhook token in header `x-roller-apikey`.
- T0018 dev deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-webhook` with real Roller header support and event-type normalization.
- T0018 real Roller delivery: creating Playground booking `5032443` triggered a `Created` webhook, enriched booking `5032443`, and wrote `status=processed` in `jumpyard.roller_webhook_events`.
- T0018 final validation: `npm run validate`, `npm --prefix infra run build`, `node --check infra/lambda/webhook/index.js`, `npm --prefix infra run register:webhook:dev`, and post-deploy `npm --prefix infra run diff:dev` passed.
- T0019 API lookup verification: `POST /v1/check-in/lookup` for `5032444` returned `found`, `payment_required`, `source.system=jumpyard_cloud`, and `freshnessStatus=fresh`.
- T0019 browser verification: `http://localhost:3000` found `5032444`, opened booking summary, showed `Obetald`, disabled `Betalning krävs`, and exposed metadata `sourceSystem=jumpyard_cloud`, `freshness=fresh`.
- T0019 validation: `npm run validate`, `cd jumpyard-checkin-phone && npm run lint`, and `cd jumpyard-checkin-phone && npm run build` passed. Lint still reports the four pre-existing `<img>` warnings.
- T0020 redeem Lambda syntax: `node --check infra/lambda/redeem/index.js` passed.
- T0020 local request-shape smoke: invalid JSON, missing idempotency key, duplicate ticket ids, and more than 10 ticket ids returned expected stable errors before database or Roller work.
- T0020 validation: `npm run validate`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0020 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0020 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0020 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved redeem Lambda asset and `ENABLE_ROLLER_REDEEM_WRITES=false` environment change.
- T0020 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-redeem`.
- T0020 deployed smoke: missing idempotency returned HTTP `400`; booking `5032210` returned `planned` with 4 tickets; unpaid booking `5032211` returned `payment_required`; `confirmRedeem=true` returned `redeem_write_disabled`.
- T0020 Aurora audit verification: direct Data API query showed `planned`, `blocked`, and `write_disabled` rows in `jumpyard.checkin_attempts` for the smoke requests.
- T0020 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0021 validation: `npm run validate`, `node --check infra/lambda/redeem/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0021 AWS identity preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`.
- T0021 AWS region preflight: `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0021 pre-deploy diff: `npm --prefix infra run diff:dev` showed the approved redeem dev-token secret, CORS header, redeem Lambda asset/env change, and scoped Secrets Manager permission.
- T0021 first deploy: `npm --prefix infra run deploy:dev` created `/jumpyard-check-in-dev/redeem/dev-token`, enabled protected redeem writes, and updated the redeem Lambda.
- T0021 first controlled write smoke: `confirmRedeem=true` without token returned HTTP `403`; planning returned `planned`; first write attempt returned Roller HTTP `409` because default `redemptionDevice` did not exist in Roller.
- T0021 follow-up diff/deploy: removed the invalid default `redemptionDevice`; diff showed only the redeem Lambda asset; deploy passed.
- T0021 controlled redeem smoke: dedicated booking `5032454` returned HTTP `200` with status `redeemed`; ticket `5032454-21397335` was redeemed through Roller Playground.
- T0021 reuse smoke: a follow-up plan for booking `5032454` returned HTTP `409` with `already_redeemed`.
- T0021 Aurora verification: direct Data API query showed `redeemed` and `already_redeemed` attempt rows, and `roller_booking_tickets.redeem_status_last_seen='redeemed'` for `5032454-21397335`.
- T0021 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0022 validation: `npm run validate` passed; no app code, infra code, AWS resources, migrations, credentials, `.env`, or Roller calls were changed.
- T0023 validation: `npm run validate`, `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0023 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and region `eu-north-1` was confirmed.
- T0023 migration status before apply: `0001` and `0002` applied, `0003 checkin sessions` pending.
- T0023 migration apply: `npm --prefix infra run migrate:dev` applied `0003 checkin sessions`.
- T0023 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved session Lambda, log group, two API routes, invoke permissions, and scoped DB/log permissions.
- T0023 deploy: `npm --prefix infra run deploy:dev` created `jumpyard-check-in-dev-stack-session` and session API routes.
- T0023 deployed smoke: booking `5032210` returned `session_started` with session `jycs_mpfe3dum_7dc29b1b`; repeating start returned `session_resumed`; booking `5032211` returned `payment_required`; marking the session ready returned `ready_for_staff` with handoff code `JY6085`.
- T0023 Aurora verification: direct Data API query showed session `jycs_mpfe3dum_7dc29b1b` with `status='ready_for_staff'`, `handoff_status='ready_for_staff'`, and `safety_status='completed'`.
- T0023 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0024 phone lint: `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings.
- T0024 phone build: `cd jumpyard-checkin-phone && npm run build` passed.
- T0024 browser paid-session verification: booking `5032210` advanced from booking summary to add-ons only after session `jycs_mpfe3dum_7dc29b1b` was present in phone flow state.
- T0024 browser unpaid verification: booking `5032211` stayed on `APP_BOOKING`, showed disabled `Betalning krävs`, and had no session id.
- T0025 validation: `npm run validate`, `npm --prefix jumpyard-checkin-phone run lint`, and `npm --prefix jumpyard-checkin-phone run build` passed. Lint still reports the four pre-existing `<img>` warnings.
- T0025 browser ready-for-staff verification: booking `5032210` reached `APP_CONFIRM` with session `jycs_mpfe3dum_7dc29b1b`, session status `ready_for_staff`, handoff status `ready_for_staff`, and handoff code `JY6085`.
- T0026 validation: `npm run validate`, `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-admin run lint`, and `npm --prefix jumpyard-checkin-admin run build` passed.
- T0026 AWS deploy: `npm --prefix infra run deploy:dev` added `GET /v1/staff/check-in/sessions` and `GET /v1/staff/check-in/sessions/{checkinSessionId}`; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0026 API smoke: staff list returned one active ready session for booking `5032210`, session `jycs_mpfe3dum_7dc29b1b`, handoff code `JY6085`, 2 booking items, 4 selected tickets, and 4 total tickets.
- T0026 browser verification: local admin app at `http://127.0.0.1:3002/` rendered handoff code `JY6085`, booking `5032210`, product rows, and ticket rows from the dev JumpYard Cloud API.
- T0027 validation: `npm run validate`, `node --check infra/lambda/redeem/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-admin run lint`, and `npm --prefix jumpyard-checkin-admin run build` passed.
- T0027 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and region `eu-north-1` was confirmed.
- T0027 pre-deploy diff: `npm --prefix infra run diff:dev` showed only the approved staff redeem route, API Gateway integration/invoke permission, and redeem Lambda code asset.
- T0027 AWS deploy: `npm --prefix infra run deploy:dev` added `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0027 guard smoke: local Lambda invocation returned HTTP `400` for missing `confirmRedeem=true` and HTTP `403` for missing dev redeem token before DB/Roller work.
- T0027 API smoke: dedicated Playground booking `5032473`, session `jycs_mpfhz4jp_a4770adb`, handoff `JY3091` redeemed 1 selected ticket through the new staff route and returned `status='redeemed'`.
- T0027 post-redeem verification: staff detail returned session `redeemed`, handoff `completed`, `completedAt`, and 1 local redeemed ticket for `jycs_mpfhz4jp_a4770adb`; the session no longer appeared in the active waiting list.
- T0027 browser verification: local admin app at `http://127.0.0.1:3002/` rendered ready handoff `JY7166` for booking `5032474` with the staff redeem panel, temporary dev-code input, and disabled `Slutför` button until a code is entered.
- T0028 validation: `npm run validate`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm --prefix jumpyard-checkin-admin run lint`, and `npm --prefix jumpyard-checkin-admin run build` passed. Phone lint still reports the pre-existing `<img>` warnings.
- T0028 browser verification: local admin app at `http://127.0.0.1:3002/` rendered `Öppna` and `Skanna QR`, accepted full payload `JY_HANDOFF:JY2493:jycs_mpfh6ww7_9ff95b42`, opened handoff `JY2493`, and opened/closed the QR scanner cleanly.
- T0029 phone lint: `npm --prefix jumpyard-checkin-phone run lint` passed with the same pre-existing `<img>` warnings.
- T0029 phone build: `npm --prefix jumpyard-checkin-phone run build` passed.
- T0029 root validation: `npm run validate` passed.
- T0029 browser ready resume: local phone app at `http://localhost:3000` searched booking `5032469`, resumed fresh session `jycs_mpfm485d_f3717834`, and routed directly from search to QR confirmation with handoff code `JY1721`.
- T0029 browser already-redeemed resume: local phone app opened booking `5032454`, received the already-redeemed session-start block, and routed to `Redan incheckad` with `data-already-checked-in=true`.
- T0030 payment discovery syntax: `node --check scripts/roller-payment-discovery.js` passed.
- T0030 payment discovery dry-run: `npm run roller:payment:discover` passed, selected product `Biljetter (260 kr)` id `1765836`, and created no booking.
- T0030 payment discovery write guard: `npm run roller:payment:discover:apply-draft` failed closed without `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE`.
- T0030 guarded draft write: direct guarded apply created Playground draft booking unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2`; response returned HTTP `201`, total `260`, amount owing `260`, and `paymentJwtPresent=true` without printing the raw JWT.
- T0030 official docs check: Roller Payments via API docs confirm the custom checkout path uses Roller's payment library plus returned draft-booking JWT, but requires ROLLER authorization, public HTTPS domain allowlisting, and approved payment package access.
- T0030 root validation: `npm run validate` passed.
- T0031 booking Lambda syntax: `node --check infra/lambda/booking/index.js` passed.
- T0031 infra build: `npm --prefix infra run build` passed.
- T0031 infra synth: `npm --prefix infra run synth:dev` passed.
- T0031 CDK diff: scoped to `BookingHandler` code only. CDK needed temporary credentials exported from the `wrlds-dev` AWS CLI profile because direct SSO profile resolution failed inside the CDK process.
- T0031 dev deploy: deployed `jumpyard-check-in-dev-stack-booking` code through CDK; CloudFormation update completed successfully.
- T0031 deployed quote smoke: `POST /v1/bookings/quote` for product `1765836` on `2026-05-22` returned HTTP `200`, status `quoted`, total `260`, amount owing `260`, tax `14.72`, and `wroteBooking=false`.
- T0031 deployed draft smoke: `POST /v1/bookings/draft` with `confirmDraft=true` and a unique idempotency key returned HTTP `201`, draft unique id `2c1abf4f-944c-4122-a4ff-da8440c46321`, total `260`, amount owing `260`, `jwtPresent=true`, `jwtPartCount=3`, and `paymentConfigAvailable=true`. The raw JWT was not printed.
- T0031 post-deploy CDK diff: no differences.
- T0032 payment POC syntax: `node --check scripts/roller-payment-package-poc.js` passed.
- T0032 payment POC default: `npm run roller:payment:poc` returned quote HTTP `200`, total `260`, amount owing `260`, created no draft booking, and reported blockers `approved_payment_package`, `public_https_allowlisted_origin`, and `roller_fake_or_test_card_details`.
- T0032 payment POC write guard: `npm run roller:payment:poc:apply-draft` without confirmation failed closed before creating a draft.
- T0032 guarded payment POC draft: guarded apply created Playground draft `a8644795-a29d-4302-8a37-056d525e7bd4`, returned HTTP `201`, `paymentJwtPresent=true`, `paymentJwtPartCount=3`, and `venuePaymentConfigAvailable=true`; raw JWT was not printed.
- T0032 final validation: `npm run validate` and `git diff --check` passed.
- T0033 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0033 migration: `npm --prefix infra run migrate:dev` applied `0004 prepayment booking drafts`; post-apply status shows applied.
- T0033 deploy: `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack` with `POST /v1/bookings/availability` and booking Lambda changes; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0033 deployed API smoke: `POST /v1/bookings/availability` returned available jump products for `2026-05-22`, `POST /v1/bookings/quote` returned HTTP `200` with total `200`, and `POST /v1/bookings/draft` returned HTTP `201` with draft `045b9ed6-7541-4f33-9e61-bfbd5bf0f8a3`, `paymentJwtPresent=true`, and raw JWT not printed.
- T0033 Aurora verification: `jumpyard.prepayment_booking_drafts` contains deployed smoke row `jypd_5d96dca81de8429eb4` and browser smoke row `jypd_f78fea81bea24fdea2` with masked/hash contact fields and no raw payment JWT column.
- T0033 browser smoke: local phone buy-entry selected `10:00`, `60 min entré`, quantity `1`, quoted `200 kr`, created a Playground draft, and ended at `Betalning väntar` with `data-prepayment-status="payment_pending"`.
- T0033 final validation: `node --check infra/lambda/booking/index.js`, `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed. Phone lint still reports the existing four `<img>` warnings.
- T0034 AWS preflight: `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`, and `aws configure get region --profile wrlds-dev` returned `eu-north-1`.
- T0034 migration: first `0005` attempt failed because the migration runner cannot safely split `DO $$` blocks; migration was rewritten without a `DO` block, then `npm --prefix infra run migrate:dev` applied `0005 add product draft links`.
- T0034 deploy: `npm --prefix infra run diff:dev` showed only the booking Lambda code asset before deploy; `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-booking`; post-deploy `npm --prefix infra run diff:dev` showed no differences.
- T0034 deployed quote smoke: `POST /v1/bookings/5032210/add-products/quote` returned HTTP `200`, total `200`, amount owing `200`, `wroteBooking=false`, and Aurora `booking_links` count for original `5032210` remained unchanged.
- T0034 deployed draft smoke: `POST /v1/bookings/5032210/add-products` returned HTTP `201`, Roller draft `18e85e91-9a53-4afd-a951-75d1a41eaf9f`, add-on group `jyao_2b05e40abbda4bad9a`, link `jyl_cf14c98651b4451aba`, prepayment draft `jypd_2a5ad290e9c34eadaa`, and `paymentJwtPresent=true`.
- T0034 Aurora verification: `jumpyard.prepayment_booking_drafts` has `flow_type='add_product'` with original booking reference `5032210`; `jumpyard.booking_links` has `link_type='add_product_draft'`; the only JWT-related column is `payment_jwt_present`.
- T0035 validation: `npm --prefix jumpyard-checkin-phone run lint`, `npm --prefix jumpyard-checkin-phone run build`, `npm run validate`, and `git diff --check` passed on 2026-05-22; lint still reports only pre-existing `<img>` warnings.
- T0035 browser smoke: local phone app searched paid booking `5032443`, started a session, added one socks item, quoted `45 kr`, created add-product draft `jypd_740b8fc10ee446639b`, and stopped at payment pending.
- T0035 Aurora verification: draft `jypd_740b8fc10ee446639b` has `flow_type='add_product'`, `status='payment_pending'`, original booking `5032443`, `amount_owing_cents=4500`, `payment_jwt_present=true`, and a `booking_links.link_type='add_product_draft'` row.
- T0036 infra build: `npm --prefix infra run build` passed.
- T0036 dry-run: `npm --prefix infra run import:data-api-backfill:dev -- 2026-05-20 2026-05-21` passed and ran bookingitems, related data, and products with `apply=false`.
- T0036 apply guard: `npm --prefix infra run import:data-api-backfill:dev:apply -- 2026-05-20 2026-05-21` failed closed without `ROLLER_DATA_BACKFILL_ALLOW_WRITE`.
- T0037 syntax/build: `node --check infra/lambda/data-sync/index.js` and `npm --prefix infra run build` passed.
- T0037 synth/diff/deploy: `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed against account `376129878018`, region `eu-north-1`.
- T0037 manual Lambda smoke: invoking `jumpyard-check-in-dev-stack-data-sync` for `2026-05-20 -> 2026-05-21` succeeded with 9 bookingitems, 6 tickets, 0 payments, 6 customers, and 491 product rows; Aurora `booking_seed_runs` recorded `succeeded`.
- T0037 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0038 syntax/build: `node --check infra/lambda/session/index.js` and `npm --prefix infra run build` passed.
- T0038 synth/diff/deploy: `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed against account `376129878018`, region `eu-north-1`.
- T0038 deployed API smoke: protected link creation returned `link_created` with token/url present without printing raw token; public resolve returned `session_started`, and Aurora `jumpyard.checkin_tokens` showed the token hash row with `opened=true`, `consumed=false`, and `active=true`.
- T0038 unauthorized smoke: link creation without the dev token returned HTTP `401`.
- T0038 post-deploy diff: `npm --prefix infra run diff:dev` showed no differences.
- T0038 final validation: `npm run validate` and `git diff --check` passed.
- T0039 session Lambda syntax: `node --check infra/lambda/session/index.js` passed.
- T0039 infra build: `npm --prefix infra run build` passed.
- T0039 AWS preflight: account `376129878018`, region `eu-north-1`.
- T0039 migration apply: `npm --prefix infra run migrate:dev` applied `0006 sms deliveries`; status shows applied.
- T0039 synth/diff/deploy: `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0039 deployed unauthorized smoke: `POST /v1/check-in/session-links/send-sms` without the dev token returned HTTP `401`.
- T0039 deployed dry-run smoke: protected request for booking `5032210` returned `sms_planned`, provider `aws_sns`, dryRun `true`, and masked destination `+46*****0000` without sending SMS.
- T0039 Aurora verification: `jumpyard.sms_deliveries` row `jysms_mpgvgmyt_f49e7b7d` has status `planned`, dry_run `true`, provider `aws_sns`, masked destination, and a token hash.
- T0039 final validation: `npm run validate` and `git diff --check` passed.
- T0041 real SMS smoke: protected request for booking `5032210` with `confirmSend=true` returned `sms_sent`, provider `aws_sns`, `dryRun=false`, masked destination `+46*****9508`, and provider accepted the message.
- T0041 Aurora verification: `jumpyard.sms_deliveries` row `jysms_mpgvzkpz_5b4ae399` has status `sent`, dry_run `false`, provider `aws_sns`, masked destination, token hash present, provider message id present, and sent timestamp present.
- T0042 infra validation: AWS preflight account `376129878018`, region `eu-north-1`; `npm --prefix infra run build`, `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed for SNS delivery diagnostics.
- T0042 SNS attributes: `DefaultSMSType=Transactional`, `DeliveryStatusSuccessSamplingRate=100`, and delivery role `jumpyard-check-in-dev-sns-sms-delivery-status` are configured.
- T0042 diagnostic SMS: protected request for booking `5032210` with `confirmSend=true` created Aurora row `jysms_mpgwlk9u_9566748e` with status `sent`, provider `aws_sns`, `dry_run=false`, masked destination, provider message id present, and token hash present.
- T0042 CloudWatch delivery status: SNS failure log group reports `FAILURE` with provider response `Sandboxed account unable to send to number.`
- T0042 SNS sandbox status: `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`.
- T0043 SNS sandbox verification: masked destination `+46*****9508` is `Verified` in SNS SMS sandbox. The one-time password was used once and not stored.
- T0043 verified SMS smoke: protected request for booking `5032210` with `confirmSend=true` created Aurora row `jysms_mpgxbla6_b59779cd` with status `sent`, provider `aws_sns`, `dry_run=false`, masked destination, provider message id present, and token hash present.
- T0043 CloudWatch delivery status: SNS success log group reports `SUCCESS` with provider response `Message has been accepted by phone.`
- T0044 session Lambda syntax/build: `node --check infra/lambda/session/index.js` and `npm --prefix infra run build` passed.
- T0044 phone lint/build: `npm --prefix jumpyard-checkin-phone run lint` passed with the existing `<img>` warnings, and `npm --prefix jumpyard-checkin-phone run build` passed.
- T0044 root validation: `npm run validate` passed.
- T0044 AWS preflight: account `376129878018`, region `eu-north-1`.
- T0044 CDK diff/deploy: pre-deploy diff showed only `SessionHandler` Lambda code changing; `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences.
- T0044 deployed API smoke: protected link creation followed by public resolve returned `session_started`, included safe booking reference `5032210`, included 2 booking item rows, and returned source `jumpyard_cloud` / `checkin_link` without printing the raw token.
- T0044 browser smoke: local phone app opened a generated `?jy_token=...` link and reached `APP_BOOKING` with `checkinSessionStatus='guest_in_progress'`; invalid token fallback reached `KIOSK_LOOKUP`.
- T0045 session Lambda syntax/build/synth: `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed.
- T0045 root validation: `npm run validate` passed.
- T0045 AWS preflight: account `376129878018`, region `eu-north-1`.
- T0045 CDK diff/deploy: first diff showed the new `send-due-sms` route, invoke permission, and session Lambda code; fallback fix diff showed only session Lambda code; deploys passed and post-deploy diff showed no differences.
- T0045 deployed planning smoke: protected planning mode returned `booking_time_sms_planned` without sending SMS; booking `5032210` was skipped as `sms_already_sent_recently`, and booking `5032211` was skipped as `payment_required`, both with masked destinations only.


## Archived TEST_PLAN.md

The following content is the previous `TEST_PLAN.md` before T0128 compressed it to the active validation plan.

# Test Plan

Use this file to define validation for the current project or milestone.

## Automated Validation

| Command | Purpose | Result | Notes |
|---|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Passed | Passed on 2026-05-21 during T0023. |
| `npm run roller:env:check` | Confirm Roller env guard passes for local Playground config. | Passed | Passed with local `.env`. |
| `npm run roller:smoke` | Confirm Roller Playground auth works and one read-only request can run. | Passed | Passed with local `.env`; `/products` returned HTTP 200 and 96 products on 2026-05-19. |
| `npm run roller:seed:playground` | Plan deterministic Playground seed bookings without writes. | Passed | Passed on 2026-05-20; resolved six scenarios to child/variation product IDs. |
| `npm run roller:seed:playground:apply` without confirmation | Confirm seed writes fail closed unless explicitly confirmed. | Passed | Failed before writes without `ROLLER_SEED_ALLOW_WRITE`. |
| Guarded `npm run roller:seed:playground:apply` | Create deterministic Playground seed bookings. | Passed | Created booking references `5032210` through `5032215` in Playground on 2026-05-20. |
| T0008 seed readback | Confirm created seed bookings can be read by booking reference. | Passed | `GET /bookings/{bookingReference}` returned HTTP 200 for all six new references. |
| `node --check infra/lambda/lookup/index.js` | Confirm lookup Lambda JavaScript syntax. | Passed | Passed during T0009. |
| Local lookup handler smoke | Confirm lookup Lambda behavior before deploy. | Passed | Paid, pending, wrong-date, and not-found cases returned expected normalized responses. |
| Read-only booking detail check | Confirm known Playground booking lookup path. | Passed | `GET /bookings/5001370` returned HTTP 200 on 2026-05-19. |
| `npm run infra:check` | Type-check and synthesize the deploy-blocked CDK foundation with example config. | Passed | Passed on 2026-05-19. |
| `npm run infra:synth` | Synthesize JumpYard Cloud CloudFormation locally with example config. | Passed | Passed on 2026-05-19; does not deploy or require AWS credentials. |
| `npm --prefix infra audit` | Check newly added infra dependencies. | Warning | Reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; no dependency fix was applied in T0007. |
| `aws --version` | Confirm AWS CLI is installed for T0006 preflight. | Passed | Passed on 2026-05-19. |
| `aws sso login --profile wrlds-dev` | Refresh local AWS SSO credentials. | Passed | Login succeeded on 2026-05-19. |
| `aws sts get-caller-identity --profile wrlds-dev` | Confirm the active AWS identity before deploy. | Passed | Returned account `376129878018`. |
| `aws configure list --profile wrlds-dev` | Confirm active AWS profile and region before deploy. | Passed | Region `eu-north-1`. |
| `npm --prefix infra run synth:dev` | Synthesize the confirmed T0006 dev stack. | Passed | Uses non-secret dev config. |
| `npm --prefix infra run diff:dev` | Review planned dev AWS resource creation before deploy. | Passed | Pre-deploy diff showed approved foundation resources; post-deploy diff showed no differences. |
| `npm --prefix infra run deploy:dev` | Deploy approved dev foundation. | Passed | First attempt failed on Aurora `16.3`; final deploy passed with Aurora `16.13`. |
| Placeholder API smoke | Confirm initial deployed placeholder API responded without Roller calls before T0009. | Passed | Historical T0006/T0007 check: `POST /v1/check-in/lookup` returned HTTP `501` before lookup implementation. |
| T0009 deployed lookup smoke | Confirm deployed lookup endpoint calls Roller server-side and returns normalized responses. | Passed | `5032210` => `ready`; `5032211` => `payment_required`; `5032212` with expected date `2026-05-21` => `wrong_date`; `999999999` => `not_found`. |
| T0010 phone lint | Confirm phone app lint passes after lookup wiring. | Passed | `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings. |
| T0010 phone build | Confirm phone app static export build passes after lookup wiring. | Passed | `cd jumpyard-checkin-phone && npm run build` passed. |
| T0010 lookup CORS preflight | Confirm browser requests can POST from the phone app to JumpYard Cloud. | Passed | `OPTIONS /v1/check-in/lookup` returned `204` with `access-control-allow-origin: *`. |
| T0010 local phone server | Confirm local phone app starts for manual flow testing. | Passed | `http://127.0.0.1:3000` returned HTTP `200`. |
| `node --check scripts/roller-data-api-smoke.js` | Confirm T0011 Data API smoke script syntax. | Passed | Passed on 2026-05-20. |
| `npm run roller:data:smoke` | Confirm local Playground credentials can access Roller Data API `/data/bookingitems`. | Passed | Returned 9 records for modified-date window `2026-05-20 -> 2026-05-21` and found all six T0008 seed booking references. |
| `node --check scripts/roller-payment-discovery.js` | Confirm T0030 payment discovery script syntax. | Passed | Script parses before running Roller calls. |
| `npm run roller:payment:discover` | Confirm T0030 payment discovery dry-run path. | Passed | Loads local `.env`, validates Playground, reads products, selects product `1765836`, and creates no booking. |
| `npm run roller:payment:discover:apply-draft` without confirmation | Confirm T0030 draft write fails closed unless explicitly confirmed. | Passed | Failed before creating a draft without `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE`. |
| Guarded T0030 draft apply | Confirm Roller Playground draft booking returns payment shape. | Passed | Direct guarded apply created draft unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2`; response returned HTTP `201`, total `260`, amount owing `260`, and a present `paymentJwt` without printing the raw JWT. |
| `node --check infra/lambda/booking/index.js` | Confirm T0031 booking Lambda JavaScript syntax. | Passed | Passed before deploy. |
| Local T0031 invalid draft smoke | Confirm request validation runs before AWS/Roller work. | Passed | Missing idempotency key returned HTTP `400` with `idempotency_key_required`. |
| `npm --prefix infra run build` | Confirm T0031 infra TypeScript compiles. | Passed | Passed before deploy. |
| `npm --prefix infra run synth:dev` | Synthesize the T0031 dev stack. | Passed | Uses non-secret `infra/config/dev.json`. |
| T0031 CDK diff | Confirm deploy scope. | Passed | Diff showed only `BookingHandler` Lambda code changing. CDK required temporary credentials exported from `wrlds-dev` because direct SSO profile resolution failed inside CDK. |
| T0031 dev deploy | Deploy booking Lambda implementation. | Passed | CloudFormation updated `jumpyard-check-in-dev-stack-booking` successfully. |
| T0031 deployed quote smoke | Confirm server-side quote works without creating booking. | Passed | `POST /v1/bookings/quote` returned HTTP `200`, total `260`, amount owing `260`, tax `14.72`, and `wroteBooking=false`. |
| T0031 deployed draft smoke | Confirm server-side draft creation and payment-session response. | Passed | `POST /v1/bookings/draft` returned HTTP `201`, draft unique id `2c1abf4f-944c-4122-a4ff-da8440c46321`, total `260`, amount owing `260`, `jwtPresent=true`, `jwtPartCount=3`, and payment config available; raw JWT was not printed. |
| T0031 post-deploy CDK diff | Confirm deployed stack matches local template. | Passed | CDK diff showed no differences after deploy. |
| `node --check scripts/roller-payment-package-poc.js` | Confirm T0032 payment package POC script syntax. | Passed | Passed during T0032 validation. |
| `npm run roller:payment:poc` | Confirm T0032 quote/default POC path without booking creation. | Passed | Returned quote HTTP `200`, total `260`, amount owing `260`, and status `blocked_prerequisites` with no draft booking created. |
| `npm run roller:payment:poc:apply-draft` without confirmation | Confirm T0032 draft mode fails closed. | Passed | Failed before creating a Playground draft without `ROLLER_PAYMENT_POC_ALLOW_DRAFT`. |
| `node --check scripts/roller-payment-readiness.js` | Confirm T0050 payment readiness script syntax. | Passed | Passed on 2026-05-26. |
| `npm run roller:payment:readiness` | Confirm T0050 payment readiness without writes. | Passed | Reads local `.env`, confirms Roller Playground `/venues/me` payment settings, and checks the public test origin without printing secrets. Pabel later confirmed the origin allowlist. |
| `node --check infra/lambda/booking/index.js` | Confirm T0033 booking Lambda syntax. | Passed | Passed after availability/pre-payment changes. |
| `npm --prefix infra run build` | Confirm T0033 infra TypeScript compiles. | Passed | Passed after availability route and migration changes. |
| `npm --prefix infra run synth:dev` | Synthesize the T0033 dev stack. | Passed | Uses non-secret `infra/config/dev.json`. |
| `npm --prefix jumpyard-checkin-phone run lint` | Confirm phone lint passes after T0033 buy-entry changes. | Passed | Passed with the same pre-existing `<img>` warnings. |
| `npm --prefix jumpyard-checkin-phone run build` | Confirm phone app build passes after T0033 buy-entry changes. | Passed | Static export build passed. |
| T0033 deployed availability smoke | Confirm JumpYard Cloud reads Roller availability server-side. | Passed | `POST /v1/bookings/availability` returned HTTP `200` and available jump products for `2026-05-22`. |
| T0033 deployed quote/draft smoke | Confirm quote and draft work for the selected available slot. | Passed | Quote returned total `200`; draft returned HTTP `201`, `paymentJwtPresent=true`, and persisted pre-payment draft id `jypd_5d96dca81de8429eb4`. |
| T0011 Data API production URL rejection | Confirm Data API smoke fails closed for live-looking Roller URL. | Passed | `ROLLER_BASE_URL=https://api.roller.app` was rejected before Data API calls. |
| `npm --prefix infra run build` | Confirm T0012 TypeScript importer compiles. | Passed | Passed on 2026-05-20. |
| T0012 bookingitems dry-run | Confirm Data API bookingitems importer normalizes records without Aurora writes. | Passed | Returned 9 records, 6 bookings, 9 booking items, and 0 skipped records. |
| T0012 bookingitems apply guard | Confirm importer refuses dev Aurora writes without explicit confirmation. | Passed | Failed closed without `ROLLER_IMPORT_ALLOW_WRITE`. |
| T0012 AWS preflight | Confirm target account and region before dev Aurora write. | Passed | Account `376129878018`, region `eu-north-1`. |
| T0012 bookingitems dev apply | Import Data API bookingitems into dev Aurora. | Passed | Guarded apply matched 6 bookings and 9 booking items in Aurora. |
| T0012 idempotency check | Re-run guarded import against the same modified-date window. | Passed | Still matched 6 bookings and 9 booking items; no duplicate booking/item rows. |
| T0012 Aurora verification | Query dev Aurora for imported seed bookings and latest seed run. | Passed | `roller_bookings` has references `5032210` through `5032215`; latest `booking_seed_runs` status is `succeeded`. |
| T0013 product import dry-run | Confirm product importer reads Roller products without Aurora writes. | Passed | `npm --prefix infra run import:products:dev` found 96 top-level products and 491 flattened product/variation rows. |
| T0013 product import apply guard | Confirm product importer refuses dev Aurora writes without explicit confirmation. | Passed | Failed closed without `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE`. |
| T0013 AWS preflight | Confirm target account and region before dev Aurora write. | Passed | Account `376129878018`, region `eu-north-1`. |
| T0013 product import dev apply | Cache Roller products and enrich booking items in dev Aurora. | Passed | Guarded apply matched 491 product cache rows and 9 booking item rows with product names. |
| T0013 Aurora verification | Query dev Aurora for enriched seed booking products. | Passed | Seed booking item rows now include names such as `Biljetter (260 kr)`, `SkyRider 1 åk`, `Hänglås`, and `Islatte`. |
| T0014 Data API tickets smoke | Confirm `/data/tickets` access and safe response shape. | Passed | Returned 6 records for modified-date window `2026-05-20 -> 2026-05-21`. |
| T0014 Data API bookingpayments smoke | Confirm `/data/bookingpayments` access and safe empty response behavior. | Passed | Returned 0 records for the seed window; endpoint access is valid. |
| T0014 Data API customers smoke | Confirm `/data/customers` access and contact-field shape. | Passed | Returned 6 records with `customerId`, `email`, and `contactNumber` fields. |
| T0014 migration status before apply | Confirm `0002 related data sources` is pending before apply. | Passed | `0001` applied, `0002` pending. |
| T0014 migration apply | Apply related data columns/indexes to dev Aurora. | Passed | `npm --prefix infra run migrate:dev` applied `0002 related data sources`. |
| T0014 related data dry-run | Confirm related Data API importer normalizes records without Aurora writes. | Passed | Returned 6 tickets, 0 payments, 6 customers, and 0 skipped records. |
| T0014 related data apply guard | Confirm importer refuses dev Aurora writes without explicit confirmation. | Passed | Failed closed without `ROLLER_RELATED_IMPORT_ALLOW_WRITE`. |
| T0014 related data dev apply | Import related Data API sources into dev Aurora. | Passed | Guarded apply upserted 6 tickets, 0 payments, and 6 customers. |
| T0014 idempotency check | Re-run guarded import against the same modified-date window. | Passed | Re-run upserted the same 6 tickets and 6 customers without duplicate rows. |
| T0014 Aurora verification | Query dev Aurora for ticket, payment, and guest profile counts. | Passed | Counts: 6 tickets, 0 payments, 6 guest profiles; query output used masked contact values only. |
| T0036 infra build | Confirm Data API backfill orchestrator compiles. | Passed | `npm --prefix infra run build` passed. |
| T0036 backfill dry-run | Confirm the all-source backfill command reads a daily window without Aurora writes. | Passed | `npm --prefix infra run import:data-api-backfill:dev -- 2026-05-20 2026-05-21` passed with `apply=false`. |
| T0036 backfill apply guard | Confirm the all-source backfill command refuses writes without its top-level confirmation. | Passed | `npm --prefix infra run import:data-api-backfill:dev:apply -- 2026-05-20 2026-05-21` failed closed without `ROLLER_DATA_BACKFILL_ALLOW_WRITE`. |
| T0037 data-sync syntax | Confirm scheduled sync Lambda JavaScript syntax. | Passed | `node --check infra/lambda/data-sync/index.js` passed. |
| T0037 infra build | Confirm CDK TypeScript accepts the scheduled sync resources. | Passed | `npm --prefix infra run build` passed. |
| T0037 synth/diff/deploy | Confirm dev AWS contains the data-sync Lambda and EventBridge rule. | Passed | `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences. |
| T0037 manual Lambda smoke | Confirm the deployed Lambda can sync a small modified-date window. | Passed | Manual invoke for `2026-05-20 -> 2026-05-21` succeeded with 9 bookingitems, 6 tickets, 0 payments, 6 customers, and 491 product rows; Aurora `booking_seed_runs` recorded status `succeeded`. |
| T0038 session Lambda syntax | Confirm check-in link code is syntactically valid. | Passed | `node --check infra/lambda/session/index.js` passed. |
| T0038 infra build | Confirm CDK accepts the link routes and dev-token secret. | Passed | `npm --prefix infra run build` passed. |
| T0038 synth/diff/deploy | Confirm dev AWS contains the check-in link routes and secret. | Passed | `npm --prefix infra run synth:dev`, `npm --prefix infra run diff:dev`, and `npm --prefix infra run deploy:dev` passed; post-deploy diff showed no differences. |
| T0038 deployed link smoke | Confirm protected link creation and public token resolution work. | Passed | Created a link without printing the raw token, resolved it to `session_started`, and verified the token row has `opened=true`, `consumed=false`, `active=true`. |
| T0039 session Lambda syntax | Confirm SMS send route code is syntactically valid. | Passed | `node --check infra/lambda/session/index.js` passed. |
| T0039 infra build | Confirm CDK accepts SMS route/env/IAM changes. | Passed | `npm --prefix infra run build` passed. |
| T0039 migration apply | Confirm SMS delivery audit table exists in dev Aurora. | Passed | `npm --prefix infra run migrate:dev` applied `0006 sms deliveries`; status shows applied. |
| T0039 synth/diff/deploy | Confirm dev AWS contains the SMS send route and SNS permission. | Passed | Diff showed only the approved route, session Lambda env/code, and `sns:Publish`; deploy passed and post-deploy diff showed no differences. |
| T0039 deployed unauthorized smoke | Confirm SMS sending is protected. | Passed | `POST /v1/check-in/session-links/send-sms` without dev token returned HTTP `401`. |
| T0039 deployed dry-run smoke | Confirm SMS dry-run creates audit state without provider send. | Passed | Protected request returned `sms_planned`, provider `aws_sns`, dryRun `true`, masked destination `+46*****0000`. |
| T0041 real SMS smoke | Confirm AWS SNS accepts one protected confirmed SMS send. | Passed | Protected `confirmSend=true` request returned `sms_sent`, provider `aws_sns`, dryRun `false`, and masked destination `+46*****9508`. |
| T0042 SNS diagnostics deploy | Configure SNS SMS delivery status logs for dev. | Passed | CDK deploy added `jumpyard-check-in-dev-sns-sms-delivery-status` and set SNS attributes `DefaultSMSType=Transactional`, `DeliveryStatusSuccessSamplingRate=100`, and `DeliveryStatusIAMRole`. |
| T0042 diagnostic SMS smoke | Confirm a second protected SMS send is audited and provider delivery status is visible. | Passed | Aurora row `jysms_mpgwlk9u_9566748e` is `sent`; CloudWatch SNS delivery status is `FAILURE` with provider response `Sandboxed account unable to send to number.` |
| T0042 SNS sandbox status | Confirm whether the AWS account is still SMS sandboxed. | Passed | `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`. |
| T0043 sandbox phone verification | Verify one approved phone number in SNS SMS sandbox. | Passed | SNS sandbox list shows masked destination `+46*****9508` as `Verified`; OTP was not stored or committed. |
| T0043 verified SMS smoke | Confirm a protected SMS can be delivered to the verified sandbox number. | Passed | Aurora row `jysms_mpgxbla6_b59779cd` is `sent`; CloudWatch SNS delivery status is `SUCCESS` with provider response `Message has been accepted by phone.` |
| T0044 session Lambda syntax/build | Confirm session-link resolve response changes are valid. | Passed | `node --check infra/lambda/session/index.js` and `npm --prefix infra run build` passed. |
| T0044 phone lint/build | Confirm phone `jy_token` handling builds. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings; `npm --prefix jumpyard-checkin-phone run build` passed. |
| T0044 synth/diff/deploy | Deploy only the approved session Lambda code change. | Passed | AWS account `376129878018`, region `eu-north-1`; pre-deploy diff showed only `SessionHandler` code; deploy passed; post-deploy diff showed no differences. |
| T0044 deployed link resolve smoke | Confirm public resolve returns phone-renderable context. | Passed | Protected link creation followed by public resolve returned `session_started`, safe booking reference `5032210`, 2 booking item rows, and source `jumpyard_cloud` / `checkin_link` without printing the raw token. |
| T0044 phone browser smoke | Confirm phone app opens SMS links through JumpYard Cloud. | Passed | Local phone app opened `?jy_token=...` to `APP_BOOKING` with `checkinSessionStatus='guest_in_progress'`; invalid token fallback reached `KIOSK_LOOKUP`. |
| T0045 session Lambda syntax/build | Confirm booking-time SMS trigger code is valid. | Passed | `node --check infra/lambda/session/index.js`, `npm --prefix infra run build`, and `npm --prefix infra run synth:dev` passed. |
| T0045 synth/diff/deploy | Deploy only the approved session route/code change. | Passed | AWS account `376129878018`, region `eu-north-1`; diff showed new `send-due-sms` route and session Lambda code, then the fallback fix showed only session Lambda code; deploys passed and post-deploy diff showed no differences. |
| T0045 deployed planning smoke | Confirm booking-time trigger can plan without sending SMS. | Passed | Protected planning requests returned safe candidate/skip metadata with no raw tokens, full URLs, SMS text, or full phone numbers. |
| T0045 duplicate guard smoke | Confirm recent real sends are skipped. | Passed | Booking `5032210` was skipped as `sms_already_sent_recently`; unpaid booking `5032211` was skipped as `payment_required`; both returned masked destination only. |
| `node --check infra/lambda/webhook/index.js` | Confirm T0015 webhook Lambda JavaScript syntax. | Passed | Passed on 2026-05-20. |
| T0015 local webhook handler smoke | Confirm fast-ack and retry classification before deploy. | Passed | Unauthorized and invalid JSON returned HTTP `200`; missing database config returned HTTP `500`. |
| T0015 deployed unauthorized webhook smoke | Confirm unauthorized webhooks are acknowledged and ignored. | Passed | `POST /v1/roller/webhooks/bookings` without token returned HTTP `200` and `ignored_unauthorized`. |
| T0015 deployed accepted webhook smoke | Confirm authorized webhook delivery is persisted. | Passed | Authorized event `t0015-smoke-booking-created-5032210` returned HTTP `200` and `accepted`. |
| T0015 deployed duplicate webhook smoke | Confirm webhook idempotency. | Passed | Repeating the same authorized event returned HTTP `200` and `duplicate`. |
| T0015 Aurora webhook query | Confirm deployed webhook smoke wrote metadata into Aurora. | Passed | `jumpyard.roller_webhook_events` contains event `t0015-smoke-booking-created-5032210` with status `received`. |
| T0015 post-deploy CDK diff | Confirm dev stack matches local T0015 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| `node --check infra/lambda/lookup/index.js` | Confirm T0016 lookup Lambda JavaScript syntax. | Passed | Passed on 2026-05-21. |
| T0016 local invalid JSON check | Confirm bad JSON is handled by the Lambda response instead of API Gateway failure. | Passed | Returned HTTP `400` with `invalid_json`. |
| T0016 local Aurora-first smoke | Confirm seeded bookings read from Aurora without Roller refresh. | Passed | `5032210`, `5032211`, and `5032212` returned from source `jumpyard_cloud`. |
| T0016 local live-refresh smoke | Confirm missing local booking refreshes from Roller and is then cached. | Passed | First `5001370` returned source `roller`; second `5001370` returned source `jumpyard_cloud`. |
| T0016 deployed lookup smoke | Confirm dev API uses Aurora-first behavior. | Passed | `5032210` ready, `5032211` payment required, `5032212` wrong date, `999999999` not found, and invalid JSON returned expected responses. |
| T0016 post-deploy CDK diff | Confirm dev stack matches local T0016 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| `node --check infra/lambda/webhook/index.js` | Confirm T0017 webhook Lambda JavaScript syntax. | Passed | Passed on 2026-05-21. |
| T0017 local webhook enrichment smoke | Confirm a new authorized webhook event refreshes Roller detail and updates Aurora. | Passed | Event `t0017-local-webhook-enrich-5032210-20260521094844` returned enrichment `processed`, booking `5032210`, 2 items, and 4 tickets. |
| T0017 local Aurora webhook query | Confirm local smoke event status changed after enrichment. | Passed | `jumpyard.roller_webhook_events` showed status `processed`, one enrichment attempt, and `processed_at`. |
| T0017 deployed webhook enrichment smoke | Confirm deployed webhook endpoint enriches through API Gateway/Lambda. | Passed | Event `t0017-deployed-webhook-enrich-5032210-20260521095241` returned enrichment `processed`, booking `5032210`, 2 items, and 4 tickets. |
| T0017 deployed Aurora webhook query | Confirm deployed smoke event status changed after enrichment. | Passed | `jumpyard.roller_webhook_events` showed status `processed`, one enrichment attempt, and `processed_at`. |
| T0017 post-deploy CDK diff | Confirm dev stack matches local T0017 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| T0018 webhook registration dry-run | Confirm Roller Playground webhook registration can be inspected without writes. | Passed | `npm --prefix infra run register:webhook:dev` found existing webhook id `238` and printed no secrets. |
| T0018 guarded webhook registration apply | Register the Roller Playground booking webhook against the dev endpoint. | Passed | Guarded apply registered webhook id `238` for booking `Created`, `Updated`, and `Cancelled` with `tickets=true`. |
| T0018 webhook Lambda syntax | Confirm real Roller header support is syntactically valid. | Passed | `node --check infra/lambda/webhook/index.js` passed. |
| T0018 infra build | Confirm registration script and Lambda changes compile. | Passed | `npm --prefix infra run build` passed. |
| T0018 dev webhook deploy | Deploy real Roller header support and event-type normalization. | Passed | `npm --prefix infra run deploy:dev` updated `WebhookHandler`. |
| T0018 real Roller delivery | Confirm an actual Roller Playground webhook reaches AWS and updates Aurora. | Passed | Booking `5032443` created a real `Created` event with status `processed` and one enrichment attempt. |
| T0018 post-deploy CDK diff | Confirm dev stack matches local T0018 template. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| T0019 phone lint | Confirm phone app lint passes after lookup polish. | Passed | `cd jumpyard-checkin-phone && npm run lint` passed with four pre-existing `<img>` warnings. |
| T0019 phone build | Confirm phone app build passes after lookup polish. | Passed | `cd jumpyard-checkin-phone && npm run build` passed. |
| T0019 API lookup check | Confirm webhook-created booking can be found via Aurora-first lookup. | Passed | `5032444` returned `found`, `payment_required`, source `jumpyard_cloud`, freshness `fresh`. |
| T0019 browser lookup check | Confirm local phone flow finds `5032444`. | Passed | Booking summary opened, showed `Obetald`, disabled `Betalning krävs`, and metadata confirmed `jumpyard_cloud` plus `fresh`. |
| T0024 phone lint | Confirm phone app lint passes after session-start wiring. | Passed | Passed with the same four pre-existing `<img>` warnings. |
| T0024 phone build | Confirm phone app build passes after session-start wiring. | Passed | `cd jumpyard-checkin-phone && npm run build` passed. |
| T0025 root validation | Confirm source-of-truth docs still validate after ready-for-staff wiring. | Passed | `npm run validate` passed on 2026-05-21. |
| T0025 phone lint | Confirm phone app lint passes after ready-for-staff wiring. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the same four pre-existing `<img>` warnings. |
| T0025 phone build | Confirm phone app build passes after ready-for-staff wiring. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed. |
| T0025 browser flow | Confirm paid booking reaches server-owned handoff screen. | Passed | Booking `5032210` reached `APP_CONFIRM` with handoff status `ready_for_staff` and code `JY6085`. |
| T0026 root validation | Confirm source-of-truth docs still validate after staff handoff wiring. | Passed | `npm run validate` passed on 2026-05-21. |
| T0026 session Lambda syntax | Confirm staff list/detail code is syntactically valid. | Passed | `node --check infra/lambda/session/index.js` passed. |
| T0026 infra build | Confirm CDK changes compile. | Passed | `npm --prefix infra run build` passed. |
| T0026 dev synth | Confirm dev stack includes staff routes. | Passed | `npm --prefix infra run synth:dev` passed. |
| T0026 admin lint | Confirm admin app lint passes after staff API wiring. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed. |
| T0026 admin build | Confirm admin static export builds. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| T0026 staff API smoke | Confirm deployed list/detail reads ready sessions from Aurora. | Passed | Staff list/detail returned booking `5032210`, session `jycs_mpfe3dum_7dc29b1b`, handoff code `JY6085`, 2 booking items, and 4 selected tickets. |
| T0027 redeem Lambda syntax | Confirm staff redeem route code is syntactically valid. | Passed | `node --check infra/lambda/redeem/index.js` passed locally before deploy. |
| T0027 admin lint | Confirm admin app lint passes after staff redeem action. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed locally. |
| T0027 admin build | Confirm admin static export builds after staff redeem action. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed locally. |
| T0027 infra build | Confirm CDK route change compiles. | Passed | `npm --prefix infra run build` passed locally. |
| T0027 dev synth | Confirm dev stack includes staff redeem route. | Passed | `npm --prefix infra run synth:dev` passed and included `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`. |
| T0027 dev deploy | Deploy the staff redeem route and Lambda code. | Passed | `npm --prefix infra run deploy:dev` updated the redeem Lambda and added the staff redeem API route. |
| T0027 post-deploy diff | Confirm dev stack matches local T0027 template. | Passed | `npm --prefix infra run diff:dev` showed no differences after deploy. |
| T0027 staff route guard smoke | Confirm staff redeem route rejects unsafe requests before DB/Roller work. | Passed | Local Lambda invocation returned `confirm_redeem_required` without confirmation and `redeem_token_required` without token. |
| `npm --prefix infra run migrate:dev:status` | Confirm pending/applied Aurora migrations for dev. | Passed | Showed `0001 initial schema: pending` before apply and `applied` after apply on 2026-05-20. |
| `npm --prefix infra run migrate:dev` | Apply pending Aurora migrations to dev. | Passed | Applied `0001 initial schema` to the approved dev Aurora cluster on 2026-05-20. |
| Aurora Data API schema query | Confirm expected `jumpyard` tables and indexes exist. | Passed | Verified 15 tables and 62 indexes in schema `jumpyard`. |

## Manual Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Source-of-truth document review | A new Codex session can understand Sprint 1 scope and constraints without chat history. | Pending | Review root source-of-truth docs. |
| No app behavior change | Existing check-in app flow remains untouched. | Pending | Confirm changed files stay outside UI/app source. |
| JumpYard Cloud contract review | The contract explains phone API, Roller endpoints, data ownership, AWS target, and open questions. | Pending | Review `JUMPYARD_CLOUD_CONTRACT.md`. |
| T0010 phone paid-ready lookup | Enter `5032210` in the phone lookup step. | Pending | Expected: booking summary opens using JumpYard Cloud response. |
| T0010 phone pending-payment lookup | Enter `5032211` in the phone lookup step. | Pending | Expected: booking summary opens, payment status shows `Obetald` with payment icon, and the check-in CTA is blocked. |
| T0010 phone wrong-date lookup | Enter `5032212` in the phone lookup step. | Pending | Expected: wrong-date stop state with expected date `2026-05-21`. |
| T0010 phone not-found lookup | Enter `999999999` in the phone lookup step. | Pending | Expected: not-found stop state. |
| T0011 Data API smoke review | Review `npm run roller:data:smoke` output. | Passed | Output prints counts, shape, booking references, booking dates, and modified date range only; no secrets, tokens, customer names, emails, or phone numbers. |
| T0012 Query Editor review | Run the T0012 verification SQL in AWS Query Editor. | Pending | Expected: six seed bookings and nine booking item rows are visible in `jumpyard` schema. |
| T0013 Query Editor review | Run the T0013 product verification SQL in AWS Query Editor. | Pending | Expected: 491 product cache rows and product names on the nine seed booking item rows. |
| T0014 Query Editor review | Run the T0014 related data verification SQL in AWS Query Editor. | Pending | Expected: 6 tickets, 0 payments for the seed window, and 6 guest profiles with masked contact fields. |
| T0015 Query Editor review | Run the T0015 webhook verification SQL in AWS Query Editor. | Pending | Expected: smoke event `t0015-smoke-booking-created-5032210` is visible with status `received`. |
| T0016 Query Editor review | Run the T0016 lookup-refresh verification SQL in AWS Query Editor. | Pending | Expected: `5001370` exists in `roller_bookings` with `source_last_updated_by='roller_live_lookup'`. |
| T0017 Query Editor review | Run the T0017 webhook enrichment verification SQL in AWS Query Editor. | Pending | Expected: `t0017-deployed-webhook-enrich-5032210-20260521095241` is visible with status `processed`. |
| T0018 Query Editor review | Run the T0018 real webhook verification SQL in AWS Query Editor. | Pending | Expected: booking `5032443` is visible in `roller_webhook_events` with event type `Created` and status `processed`. |
| T0019 phone manual lookup | Enter `5032444` in the phone lookup step. | Passed | Expected and observed: booking summary opens, shows `Obetald`, keeps check-in CTA disabled. |
| T0025 phone handoff flow | Enter `5032210`, start check-in, complete safety, and confirm final screen. | Passed | Expected and observed: `APP_CONFIRM`, handoff status `ready_for_staff`, handoff code `JY6085`. |
| T0026 admin handoff view | Open the staff/admin app and inspect ready session `JY6085`. | Passed | Local browser verification at `http://127.0.0.1:3002/` showed `JY6085`, booking `5032210`, products, and tickets. |
| T0027 staff-confirmed redeem | Redeem a dedicated ready handoff through the new staff endpoint. | Passed | Booking `5032473`, session `jycs_mpfhz4jp_a4770adb`, handoff `JY3091` redeemed 1 ticket, marked session completed, and left the waiting list. |
| T0027 admin ready action | Open the admin app and inspect a ready handoff with redeem controls. | Passed | Browser verification showed booking `5032474`, handoff `JY7166`, token input, and disabled `Slutför` button until a code is entered. |
| T0038 Query Editor review | Inspect generated check-in token rows. | Passed | Deployed smoke confirmed the row exists by token hash only, with `opened_at` populated after token resolution. |
| T0039 Query Editor review | Inspect SMS delivery audit rows. | Passed | `jumpyard.sms_deliveries` row `jysms_mpgvgmyt_f49e7b7d` has status `planned`, dry_run `true`, provider `aws_sns`, masked destination, and token hash present. |
| T0041 Query Editor review | Inspect real SMS delivery audit row. | Passed | `jumpyard.sms_deliveries` row `jysms_mpgvzkpz_5b4ae399` has status `sent`, dry_run `false`, provider `aws_sns`, masked destination, token hash present, provider message id present, and sent timestamp present. |
| T0041 user receipt check | Confirm the approved phone received the SMS. | Failed as expected | T0042 delivery logs explain the missing receipt: SNS SMS sandbox rejected delivery to the unverified destination. |
| T0042 Query Editor review | Inspect diagnostic SMS delivery audit row. | Passed | `jumpyard.sms_deliveries` row `jysms_mpgwlk9u_9566748e` has status `sent`, dry_run `false`, provider `aws_sns`, masked destination, token hash present, provider message id present, and sent timestamp present. |
| T0042 CloudWatch delivery review | Inspect SNS SMS delivery status logs. | Passed | Failure log group `sns/eu-north-1/376129878018/DirectPublishToPhoneNumber/Failure` shows provider response `Sandboxed account unable to send to number.` |
| T0042 next receipt check | Confirm SMS delivery after sandbox verification or sandbox exit. | Passed | T0043 verified the masked test phone and SNS success logs now report `Message has been accepted by phone.` |
| T0043 user receipt check | Confirm the verified phone received the JumpYard Cloud SMS. | Pending | AWS provider status is `SUCCESS`; user should confirm the physical phone received it. |
| T0044 local phone link check | Open a generated dev `jy_token` link in the phone app. | Passed | Browser verification reached booking summary with server-owned session state. A public/mobile-reachable app URL is still required for iPhone SMS links outside localhost. |
| T0045 booking-time SMS planning review | Run the protected due-SMS endpoint against a narrow test window. | Passed | Planning mode sent no SMS; responses showed masked destinations for bookings with structured contacts and skip reasons for duplicate/unpaid cases. |

## Roller Playground Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Credential smoke test | `npm run roller:smoke` confirms whether local Playground credentials can obtain auth and read one harmless endpoint. | Passed | Local `.env` passes guard and `/products` returns HTTP 200. |
| Expected success case | Playground-looking config and valid credentials pass. | Passed | Uses ROLLER's `https://api.play.roller.app` Playground pattern. |
| Production URL rejection | Production/live-looking URL fails before token or read request. | Passed | Production/live-looking URL was rejected before auth/read call. |
| Missing credentials failure | Missing `ROLLER_CLIENT_ID` or `ROLLER_CLIENT_SECRET` fails with a helpful message. | Passed | Blank credentials were rejected without printing secrets. |
| Known booking lookup | `GET /bookings/5001370` returns the expected Playground booking summary. | Passed | Returned booking reference `5001370`, unique id `dbba266d-0951-4706-9adf-6c9d05edffbf`, status `PendingPayment`, amount owing `260`, and ticket `5001370-21265504`. |
| Dev API paid-ready lookup | `POST /v1/check-in/lookup` returns normalized ready response for `5032210`. | Passed | Status `found`, `eligibility.reason=ready`, `canCheckIn=true`. |
| Dev API pending-payment lookup | `POST /v1/check-in/lookup` returns payment-required response for `5032211`. | Passed | Status `found`, `eligibility.reason=payment_required`, `canCheckIn=false`. |
| Dev API wrong-date lookup | `POST /v1/check-in/lookup` returns wrong-date response for `5032212` when expected date is `2026-05-21`. | Passed | Status `found`, `eligibility.reason=wrong_date`, `canCheckIn=false`. |
| Dev API not-found lookup | `POST /v1/check-in/lookup` returns stable not-found response for unknown reference. | Passed | HTTP `404`, status `not_found`, error code `booking_not_found`. |
| T0008 paid-ready seed | Booking `5032210` can be read and is paid. | Passed | Status `Paid`, amount owing `0`, total `610`. |
| T0008 pending-payment seed | Booking `5032211` can be read and is unpaid. | Passed | Status `PendingPayment`, amount owing `260`. |
| T0008 wrong-date seed | Booking `5032212` can be read and uses the next-day date scenario. | Passed | Status `PendingPayment`, amount owing `260`. |
| T0008 SkyRider/add-on seed | Booking `5032213` can be read with jump entry plus SkyRider. | Passed | Status `PendingPayment`, amount owing `300`. |
| T0008 linked add-on seeds | Bookings `5032214` and `5032215` can be read separately for future JumpYard Cloud linking. | Passed | Original amount owing `260`; add-on amount owing `92`. |
| Data API bookingitems smoke | `GET /data/bookingitems` returns paged records for a modified-date window. | Passed | First page shape: `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, `items`. |
| Real booking webhook delivery | Creating a Playground booking triggers the registered JumpYard Cloud webhook. | Passed | Roller sent the configured token in `x-roller-apikey`; booking `5032443` reached Aurora as `Created` and `processed`. |
| Webhook-created phone lookup | A manually created Playground booking can be found from the phone flow after webhook enrichment. | Passed | Booking `5032444` returned from `jumpyard_cloud` with freshness `fresh`. |

## JumpYard Cloud Contract Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Frontend boundary | Phone app contracts point to JumpYard Cloud, not Roller. | Documented | T0003 is docs-only; implementation pending. |
| Roller lookup contract | Existing booking lookup uses `GET /bookings/{uniqueId or bookingReference}` first and `GET /bookings` as fallback. | Documented | Playground read-only check passed for booking reference `5001370`. |
| Redeem contract | Check-in is modeled as ticket-level redemption via `POST /redemptions`. | Documented | No redeem call made in T0003. |
| Add-product contract | Separate linked add-on booking is the primary existing-booking add-product pattern for the pilot. | Documented | No write call made in T0003. |
| AWS target | Proposed AWS resources are listed without creating resources. | Documented | AWS metadata still required before T0004. |
| Booking index strategy | Daily Data API seed, booking webhook updates, and live REST confirmation are documented as separate responsibilities. | Documented | Implementation pending. |
| Playground test data | Test bookings are created by protected internal tooling, not public phone UI. | Documented | Implementation pending. |
| Booking index ingestion contract | Daily seed, webhook intake/enrichment, and live REST reconciliation are documented separately. | Documented | See `BOOKING_INDEX_INGESTION_CONTRACT.md`. |

## AWS Foundation Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| CDK metadata guard | Missing `-c config=...` fails with a helpful message. | Passed | Verified on 2026-05-19. |
| CDK example synth | `npm run infra:synth` produces a template using `infra/config/dev.example.json`. | Passed | Example config is not approved for deploy. |
| Historical placeholder handlers | Unimplemented Lambda inline code returns `501` and does not call Roller. | Passed | Lookup, booking quote/draft, existing-booking add-product quote/draft, webhook, session, and redeem handlers are now implemented. |
| No AWS creation | No `cdk deploy` is run and `AWS_RESOURCES.md` keeps inventory empty. | Passed | Required for T0004 only; T0006 intentionally deployed dev. |

## Booking Index Ingestion Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Daily seed contract review | Get bookings, Get tickets, Get payments, and Get customers are identified as the expected source set. | Documented | T0005 contract only. |
| Webhook contract review | Booking webhook is treated as a same-day signal with dedupe, normalized event state, and enrichment rules. | Documented | T0005 contract only. |
| Live refresh contract review | `GET /bookings/{id}` remains authoritative before check-in-critical writes. | Documented | T0005 contract only. |
| Attendance separation | Get attendance is excluded from expected-guest seed and reserved for actual arrival/redeem reconciliation. | Documented | T0005 contract only. |
| PII/raw payload review | Raw payload storage is deferred and normalized storage is preferred. | Documented | T0005 contract only. |
| Roadmap review | T0006 deploys AWS dev before schema, seed tooling, lookup endpoint, daily seed, and webhook implementation. | Documented | No AWS deploy in T0005. |

## AWS Dev Deploy Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity preflight | `aws sts get-caller-identity` returns the approved dev account id. | Passed | Returned account `376129878018`. |
| AWS region preflight | Active region matches the approved dev region. | Passed | Region `eu-north-1`. |
| WRLDS tag review | All required WRLDS tags are confirmed before deploy. | Passed | Confirmed from Bluetooth Hub dev setup and user input; written to `infra/config/dev.json`. |
| CDK diff review | `cdk diff` shows only approved T0004 foundation resources. | Passed | Pre-deploy diff matched scope; post-deploy diff shows no differences. |
| CDK deploy | Dev foundation resources are created and recorded in `AWS_RESOURCES.md`. | Passed | Stack `jumpyard-check-in-dev-stack` is `CREATE_COMPLETE`. |
| T0009 CDK diff before deploy | Planned dev deploy changes only the lookup Lambda code asset. | Passed | `npm --prefix infra run diff:dev` showed only `LookupHandler` code changing from inline placeholder to S3 asset. |
| T0009 CDK deploy | Dev lookup Lambda is updated. | Passed | `npm --prefix infra run deploy:dev` updated `jumpyard-check-in-dev-stack-lookup`. |
| T0009 CDK diff after deploy | Dev stack is in sync after deploy. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| T0015 CDK deploy | Dev webhook Lambda and dev token secret are in the approved stack. | Passed | `npm --prefix infra run deploy:dev` passed and reported no changes because the stack was already in sync. |
| T0016 CDK deploy | Dev lookup Lambda is updated with Aurora-first code. | Passed | `npm --prefix infra run deploy:dev` updated only `LookupHandler`. |
| T0017 CDK deploy | Dev webhook Lambda is updated with enrichment code. | Passed | `npm --prefix infra run deploy:dev` updated only `WebhookHandler`. |
| T0018 CDK deploy | Dev webhook Lambda is updated for real Roller header support. | Passed | `npm --prefix infra run deploy:dev` updated only `WebhookHandler`. |
| T0023 CDK deploy | Dev session Lambda and session API routes are deployed. | Passed | `npm --prefix infra run deploy:dev` created `jumpyard-check-in-dev-stack-session` and session routes. |
| T0038 CDK deploy | Dev session link routes and dev-token secret are deployed. | Passed | Created `/jumpyard-check-in-dev/checkin-links/dev-token`, `POST /v1/check-in/session-links`, and `POST /v1/check-in/session-links/resolve`. |
| T0039 CDK deploy | Dev SMS send route and session SNS permission are deployed. | Passed | Created `POST /v1/check-in/session-links/send-sms`, added session Lambda SMS env values, and granted `sns:Publish` to the session Lambda. |
| T0042 CDK deploy | Dev SNS SMS delivery diagnostics are deployed. | Passed | Added SNS delivery status role plus custom resource that sets dev SMS attributes; post-deploy SNS attributes show delivery logging configured. |

## Aurora Schema Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Migration status before apply | `0001 initial schema` is pending. | Passed | `npm --prefix infra run migrate:dev:status`. |
| Migration apply | `0001 initial schema` applies successfully and records a row in `jumpyard.schema_migrations`. | Passed | `npm --prefix infra run migrate:dev`. |
| Migration status after apply | `0001 initial schema` is applied. | Passed | Re-running status showed `applied`. |
| Migration idempotency | Re-running migration command does not reapply `0001`. | Passed | Second `npm --prefix infra run migrate:dev` showed `0001 initial schema: applied` and made no pending changes. |
| T0039 SMS delivery migration | `0006 sms deliveries` creates `jumpyard.sms_deliveries`. | Passed | `npm --prefix infra run migrate:dev:status` shows `0006 sms deliveries: applied`. |
| Table inventory | `jumpyard` schema contains the expected ingestion and operational tables. | Passed | Direct Aurora Data API query returned 15 tables. |
| Index inventory | Lookup, webhook, seed, idempotency, and audit indexes exist. | Passed | Direct Aurora Data API query returned 62 indexes. |
| Secret handling | Migration runner resolves the Aurora admin secret without printing secret values. | Passed | Output prints cluster target and migration status only. |

## Staff Handoff Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Phone ready-for-staff handoff | Phone marks a server-owned session ready for staff after safety attestation. | Passed | T0025 stores handoff status/code in phone state and shows code `JY6085`; no Roller redeem occurs. |
| Staff handoff list/detail | Staff can view sessions with `handoff_status='ready_for_staff'`. | Passed | T0026 added read-only dev staff endpoints and the admin app renders handoff `JY6085` without a redeem action. |

## T0020 Redeem Planning Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Missing idempotency key | `POST /v1/check-in/redeem` returns HTTP `400` with `idempotency_key_required`. | Passed | Deployed endpoint returned HTTP `400` before Aurora or Roller work. |
| Duplicate ticket ids | Endpoint returns HTTP `400` with `duplicate_ticket_ids`. | Passed | Local request-shape smoke mirrors Roller uniqueness rule. |
| More than 10 tickets | Endpoint returns HTTP `400` with `too_many_tickets`. | Passed | Local request-shape smoke mirrors Roller max 10 rule. |
| Paid ready booking | Endpoint returns `planned` with ticket ids and writes check-in attempt/event audit rows. | Passed | Booking `5032210` returned `planned` with 4 tickets; Aurora attempt row status `planned`. |
| Unpaid booking | Endpoint returns HTTP `409` with `payment_required`. | Passed | Booking `5032211` returned `blocked`; Aurora attempt row status `blocked`. |
| Confirm redeem while write guard disabled | Endpoint returns HTTP `409` with `redeem_write_disabled`. | Passed | Booking `5032210` with `confirmRedeem=true` returned `blocked`; Aurora attempt row status `write_disabled`. |

## T0021 Controlled Redeem Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Confirm without token | `confirmRedeem=true` returns HTTP `403` before Roller writes. | Passed | Deployed endpoint returned `forbidden` with `redeem_token_required`. |
| Planning still works | `confirmRedeem=false` returns `planned` and does not write to Roller. | Passed | Booking `5032454` returned `planned`; booking `5032210` planning behavior also remained intact. |
| Final live refresh | Confirmed redeem refreshes `GET /bookings/{identifier}` and upserts Aurora before write. | Passed | Aurora `roller_bookings.source_last_updated_by='roller_redeem_final_refresh'` for booking `5032454`. |
| Controlled Playground redeem | Dedicated paid Playground booking returns `redeemed`. | Passed | Booking `5032454` redeemed ticket `5032454-21397335` through Roller Playground. |
| Local already-redeemed block | Reusing the redeemed ticket is blocked as `already_redeemed`. | Passed | Follow-up request returned HTTP `409`; ticket row has `redeem_status_last_seen='redeemed'`. |

## T0022 Handoff Design Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone secret boundary | Docs state that phone UI must not hold Roller credentials, Roller tokens, or the T0021 dev redeem token. | Documented | See `PROJECT_CONTEXT.md`, `DECISIONS.md`, and `JUMPYARD_CLOUD_CONTRACT.md`. |
| Session handoff boundary | Docs state that phone can start/resume a JumpYard Cloud check-in session, while final redeem is staff/server-confirmed. | Documented | No implementation or AWS change in T0022. |
| Final redeem safety | Docs preserve T0021 final live Roller refresh, eligibility re-check, idempotency, and audit before any `POST /redemptions`. | Documented | Future T0023 should implement session skeleton without phone-direct redeem. |
| No code/resource changes | T0022 changes only source-of-truth docs and contract files. | Passed | T0022 modified docs/contract files only; older local asset changes remain outside the ticket. |

## T0023 Check-in Session Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | `node --check infra/lambda/session/index.js` passes. | Passed | Validated before deploy. |
| Session migration | `0003 checkin sessions` applies to dev Aurora. | Passed | `npm --prefix infra run migrate:dev` applied the migration. |
| Paid booking start | Booking `5032210` creates a server-owned session. | Passed | Created session `jycs_mpfe3dum_7dc29b1b`. |
| Repeat start | Repeating the same booking start resumes the active session. | Passed | Returned `session_resumed` for `jycs_mpfe3dum_7dc29b1b`. |
| Unpaid booking block | Booking `5032211` is rejected before session progress. | Passed | Returned `payment_required`. |
| Ready for staff | A started session can be marked ready for staff. | Passed | Session `jycs_mpfe3dum_7dc29b1b` received handoff code `JY6085`. |
| No Roller write | Session endpoints do not call Roller or redeem tickets. | Passed | The Lambda only reads/writes Aurora and event-log/idempotency rows. |

## T0024 Phone Session Start Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Paid booking start | Phone booking summary calls `POST /v1/check-in/sessions` before advancing. | Passed | Booking `5032210` advanced to add-ons only after session `jycs_mpfe3dum_7dc29b1b` was present. |
| Session state storage | Phone flow stores returned session id/status. | Passed | Browser state attributes showed `checkinSessionId=jycs_mpfe3dum_7dc29b1b` and status `ready_for_staff` from the resumed dev smoke session. |
| Unpaid booking block | Pending-payment booking cannot start phone session progress. | Passed | Booking `5032211` stayed on `APP_BOOKING`, CTA was disabled, and no session id was present. |
| No frontend secrets | Phone code does not contain Roller credentials or redeem token usage. | Passed | T0024 added only public JumpYard Cloud session calls. |

## T0025 Phone Ready-For-Staff Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Safety completion handoff | Phone calls `ready-for-staff` after safety attestation. | Passed | Booking `5032210` advanced from safety attestation to `APP_CONFIRM` after the endpoint returned. |
| Handoff state storage | Phone flow stores returned session and handoff state. | Passed | Browser state attributes showed `status=ready_for_staff`, `handoffStatus=ready_for_staff`, and handoff code `JY6085`. |
| Confirmation display | Final screen shows the server-owned code. | Passed | Screen displayed `JY6085` and QR payload `JY_HANDOFF:JY6085:jycs_mpfe3dum_7dc29b1b`. |
| No frontend redeem | Phone ready-for-staff does not call Roller or redeem tickets. | Passed | T0025 added only public JumpYard Cloud session handoff calls. |

## T0026 Staff Handoff List/Detail Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Staff list endpoint | `GET /v1/staff/check-in/sessions` returns ready sessions. | Passed | Returned one active ready session for booking `5032210` with handoff code `JY6085`. |
| Staff detail endpoint | `GET /v1/staff/check-in/sessions/{checkinSessionId}` returns detail. | Passed | Returned booking summary, 2 product rows, 4 ticket rows, and selected-ticket markers for session `jycs_mpfe3dum_7dc29b1b`. |
| No contact PII | Staff endpoints avoid guest email and phone. | Passed | Response includes booking/session/product/ticket summaries only. |
| No Roller/redeem action | Staff list/detail is read-only. | Passed | T0026 endpoints only read Aurora; no Roller call or redeem route is called. |
| Admin browser check | Admin UI renders the dev staff API result. | Passed | Browser verification showed `JY6085`, booking `5032210`, `Produkter`, and `Biljetter`. |

## T0027 Staff-Confirmed Redeem Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Staff route requires confirmation | Missing `confirmRedeem=true` is rejected. | Passed | Local Lambda invocation returned HTTP `400` with `confirm_redeem_required`. |
| Staff route requires dev token | Confirmed request without token is rejected before DB/Roller work. | Passed | Local Lambda invocation returned HTTP `403` with `redeem_token_required`. |
| Staff route final refresh | Confirmed route reuses T0021 final Roller refresh before write. | Passed | Dedicated smoke booking `5032473` was redeemed through the deployed staff route, which delegates to the T0021 redeem path. |
| Staff route success | Successful route marks selected tickets redeemed and session completed. | Passed | Detail API returned `status='redeemed'`, `handoffStatus='completed'`, `completedAt`, and 1 redeemed ticket for `jycs_mpfhz4jp_a4770adb`. |
| Admin UI action | Admin detail shows a protected `Slutför` action and does not persist the temporary code. | Passed | Browser verification showed `JY7166`, a password input placeholder `Tillfällig dev-kod`, and `Slutför`; no token is stored in source or browser storage by the app code. |

## T0028 QR Handoff Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone QR payload | Confirmation QR uses `JY_HANDOFF:<handoffCode>:<checkinSessionId>`. | Passed | Phone QR component renders with the `qrcode` library and exposes `data-qr-value`; the card exposes `data-qr-payload` for verification. |
| Phone guest display | Guest sees the scannable QR plus short handoff code, not the full technical payload. | Passed | Full payload is no longer visible as text on the confirmation card. |
| Admin paste payload | Staff can paste a full `JY_HANDOFF` payload and open the exact session detail by `checkinSessionId`. | Passed | Manual paste path shares the same parser as scanner results. |
| Admin short code | Staff can type a short `JY####` handoff code and select a matching active waiting-list session. | Passed | Short code lookup stays local to the loaded active list. |
| Admin camera scanner | Staff can open a camera QR scanner, and scanning stops after success or close. | Pending camera device | Code uses existing `@zxing/browser`; real scanning requires camera permission on the staff device. |

## T0029 Phone Session Resume Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Ready-for-staff resume | Searching for a booking with a resumed `ready_for_staff` session opens the QR confirmation screen directly. | Passed | Browser verification with booking `5032469` resumed fresh session `jycs_mpfm485d_f3717834` directly from search and opened `APP_CONFIRM` with handoff code `JY1721`. |
| Already redeemed resume | Starting check-in for a completed/redeemed booking shows already checked in. | Passed | Browser verification with redeemed booking `5032454` routed to `APP_PRESENT`, showed `Redan incheckad`, and set `data-already-checked-in=true`. |
| Guest-in-progress resume | Searching for a new/guest-in-progress paid booking keeps the booking summary and then continues the normal guest flow. | Pending browser verification | Paid lookup may start/store the session, but no skip is applied unless the session is ready/completed. |
| Root validation | Source-of-truth docs and AWS tags validate after T0029. | Passed | `npm run validate` passed on 2026-05-21. |
| Phone lint | Phone app lint passes after resume routing. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing `<img>` warnings. |
| Phone build | Phone app builds after resume routing. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed. |

## T0030 New Booking Payment Discovery Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Dry-run discovery | Discovery command validates config, reads products, and creates no booking. | Passed | `npm run roller:payment:discover` selected `Biljetter (260 kr)` id `1765836`. |
| Apply guard | Apply command refuses writes without explicit one-off confirmation. | Passed | `npm run roller:payment:discover:apply-draft` failed closed without the confirmation env var. |
| Guarded Playground draft | Explicit guarded write creates only a Playground draft booking and does not process payment. | Passed | Draft unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2`; amount owing `260`; `paymentJwtPresent=true`. |
| Secret/JWT handling | Output never prints client secret, access token, or raw payment JWT. | Passed | Script reports only safe response shape and JWT metadata. |
| Official docs review | Roller custom checkout path is documented before UI work. | Passed | Official Roller Payments docs require ROLLER authorization, public HTTPS domain allowlisting, and approved payment package access. |
| Root validation | Source-of-truth docs and workflow checks pass after T0030. | Passed | `npm run validate` passed on 2026-05-21. |

## T0032 Payment Package POC Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Script syntax | `node --check scripts/roller-payment-package-poc.js` passes. | Passed | Passed during T0032 validation. |
| Quote-only default | `npm run roller:payment:poc` calls JumpYard Cloud quote and creates no booking. | Passed | Returned quote HTTP `200`, total `260`, amount owing `260`, and status `blocked_prerequisites`. |
| Draft guard | `npm run roller:payment:poc:apply-draft` fails closed without confirmation. | Passed | Failed before creating a Playground draft without `ROLLER_PAYMENT_POC_ALLOW_DRAFT`. |
| Guarded draft | Explicit guarded apply creates at most one Playground draft via JumpYard Cloud. | Passed | Created draft unique id `a8644795-a29d-4302-8a37-056d525e7bd4`, returned `paymentJwtPresent=true`, and did not print the raw JWT. |
| Payment package readiness | Missing package URL, public HTTPS origin, and fake/test card details are reported as blockers. | Passed | Current blockers: approved payment package, public HTTPS allowlisted origin, and Roller fake/test card details. |
| Root validation | Source-of-truth docs and workflow checks pass after T0032. | Passed | `npm run validate` passed on 2026-05-22. |

## T0033 Phone Pre-Payment Flow Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Booking Lambda syntax | `node --check infra/lambda/booking/index.js` passes. | Passed | Passed after T0033 implementation. |
| Infra build/synth | `npm --prefix infra run build` and `npm --prefix infra run synth:dev` pass. | Passed | Passed before dev deploy. |
| Dev migration/deploy | Migration `0004` applies and dev stack deploys only approved booking route/Lambda changes. | Passed | `npm --prefix infra run migrate:dev`, `npm --prefix infra run deploy:dev`, and post-deploy diff passed. |
| Availability smoke | Deployed `POST /v1/bookings/availability` returns normalized capacity for the next phone start times. | Passed | Returned available `Entré 60 min` at `10:00` for `2026-05-22`. |
| Quote/draft smoke | Deployed quote and draft endpoints work for an available product/time/quantity. | Passed | Quote total `200`; draft `045b9ed6-7541-4f33-9e61-bfbd5bf0f8a3`, `paymentJwtPresent=true`, raw JWT not printed. |
| Aurora persistence | Draft creation stores safe pre-payment metadata without raw `paymentJwt`. | Passed | Verified row `jypd_5d96dca81de8429eb4`; browser smoke row `jypd_f78fea81bea24fdea2` also persisted. |
| Phone browser smoke | Local phone buy-entry reaches payment-pending state after creating a draft. | Passed | Selected 60 min at 10:00, quantity 1, quoted `200 kr`, then showed `Betalning väntar`. |
| Phone lint/build | Phone lint and build pass after the buy-entry UI changes. | Passed | Lint passed with existing `<img>` warnings; build passed. |
| Root validation | Source-of-truth docs and workflow checks pass after T0033. | Passed | `npm run validate` and `git diff --check` passed on 2026-05-22. |

## T0034 Add-Product Draft Step 1 Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Booking Lambda syntax | `node --check infra/lambda/booking/index.js` passes. | Passed | Passed after T0034 implementation. |
| Infra build/synth | `npm --prefix infra run build` and `npm --prefix infra run synth:dev` pass. | Passed | Passed before dev deploy. |
| Dev migration/deploy | Migration `0005` applies and dev stack deploys only approved booking Lambda changes. | Passed | First migration attempt exposed the runner's `DO $$` limitation; migration was rewritten without a block, then apply/deploy passed. |
| Add-product quote smoke | Deployed quote validates original booking and returns costs without creating a draft or link. | Passed | `POST /v1/bookings/5032210/add-products/quote` returned HTTP `200`, total `200`, amount owing `200`, and `wroteBooking=false`; link count stayed unchanged. |
| Add-product draft smoke | Deployed draft creates a separate Roller Playground draft and Aurora link. | Passed | Created draft `18e85e91-9a53-4afd-a951-75d1a41eaf9f`, add-on group `jyao_2b05e40abbda4bad9a`, link `jyl_cf14c98651b4451aba`, and prepayment draft `jypd_2a5ad290e9c34eadaa`. |
| Aurora persistence | Add-product draft state is stored without raw `paymentJwt`. | Passed | `prepayment_booking_drafts.flow_type='add_product'`, `booking_links.link_type='add_product_draft'`, and the only JWT column is `payment_jwt_present`. |
| Root validation | Source-of-truth docs and workflow checks pass after T0034. | Passed | `npm run validate`, `node --check infra/lambda/booking/index.js`, `npm --prefix infra run migrate:dev:status`, and `git diff --check` passed on 2026-05-22. |

## T0035 Phone Add-Product UI Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone lint | Phone app lint passes after add-product UI wiring. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing `<img>` warnings. |
| Phone build | Phone app builds after add-product UI wiring. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed. |
| Socks quote smoke | Add-product quote supports a stock-only socks add-on without creating a draft. | Passed | Direct dev API quote for booking `5032210`, product `1765445`, quantity `1`, `requireAvailability=false` returned total `45`, amount owing `45`, and `wroteBooking=false`. |
| Browser add-product flow | Existing-booking phone flow can create a separate add-on draft and stop at payment pending. | Passed | Browser smoke with booking `5032443` added one socks item, quoted `45 kr`, created draft `jypd_740b8fc10ee446639b`, and showed `data-add-product-status="payment_pending"`. |
| Aurora persistence | Browser-created add-product draft is linked to the original booking. | Passed | Aurora row `jypd_740b8fc10ee446639b` has `flow_type='add_product'`, `status='payment_pending'`, original booking `5032443`, amount `4500`, `payment_jwt_present=true`, and `booking_links.link_type='add_product_draft'`. |
| Root validation | Source-of-truth docs and workflow checks pass after T0035. | Passed | `npm run validate` and `git diff --check` passed on 2026-05-22. |

## T0046 Scheduled Booking-Time SMS Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | `node --check infra/lambda/session/index.js` passes. | Passed | Passed after adding EventBridge internal invocation handling. |
| Infra build | `npm --prefix infra run build` passes. | Passed | TypeScript config and CDK stack compile with booking-time SMS config fields. |
| Dev synth | `npm --prefix infra run synth:dev` passes. | Passed | Passed with `infra/config/dev.json`. |
| Root validation | `npm run validate` passes. | Passed | Root workflow, skill, and AWS tag validation passed. |
| AWS preflight | Account `376129878018` and region `eu-north-1` are verified. | Passed | AWS SSO was refreshed; account and region matched the approved dev target. |
| CDK diff | Diff shows only the approved EventBridge rule/session Lambda/config changes. | Passed | Pre-deploy diff added the booking-time SMS rule, Lambda invoke permission, and session Lambda code asset only. |
| Dev deploy | Dev stack deploys the schedule safely. | Passed | `npm --prefix infra run deploy:dev` completed successfully; post-deploy diff showed no differences. |
| Scheduled payload smoke | Direct Lambda invoke with EventBridge-shaped payload returns planning result. | Passed | Returned `booking_time_sms_planned`, `confirmSend=false`, `sent=0`, and skipped booking `5032210` as already sent recently. |

## T0047 Staff Auth Replacement Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | `node --check infra/lambda/session/index.js` passes. | Passed | Validated staff auth login/list/detail syntax. |
| Redeem Lambda syntax | `node --check infra/lambda/redeem/index.js` passes. | Passed | Validated staff-token protected redeem syntax. |
| Admin lint/build | Admin app lint/build pass after replacing the temporary dev-code input. | Passed | `npm --prefix jumpyard-checkin-admin run lint` and `npm --prefix jumpyard-checkin-admin run build` passed. |
| Staff login without secret output | Deployed `POST /v1/staff/auth/login` returns a token for the AWS-stored passcode without printing the passcode. | Passed | Smoke returned `authenticated`, token present, expiry present, and did not print passcode/token; staff secret cache is capped at 30 seconds for dev passcode edits. |
| Staff list auth guard | Staff list rejects missing auth and succeeds with the staff token. | Passed | Missing auth returned HTTP `403`/`staff_auth_token_required`; token request returned `found`. |
| Staff redeem auth guard | Staff redeem rejects missing auth and passes auth for a fake session without redeeming a real Roller ticket. | Passed | Authenticated fake session returned HTTP `404`/`session_not_found`, confirming auth passed without a real redeem. |
| Admin UI login | Admin app shows staff login and removes the temporary dev-code input from the normal handoff panel. | Passed | Browser verification at `http://127.0.0.1:3002/` found `staff-auth-login` and no temporary dev-code text. |
| Dev deploy | Dev stack deploys the staff auth secret, route, grants, and Lambda code. | Passed | CDK diff matched T0047 scope, deploy completed, and post-deploy diff showed no differences. |

## T0048 Staff Operations Polish Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Admin lint | Admin app lint passes after visual polish. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed on 2026-05-25. |
| Admin build | Admin app static build passes after visual polish. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed on 2026-05-25. |
| Phone lint/build | Phone shell font change validates without flow changes. | Passed with warnings | `npm --prefix jumpyard-checkin-phone run lint` passed with existing `img` warnings; `npm --prefix jumpyard-checkin-phone run build` passed. |
| Kiosk build | Kiosk shell font change builds without flow changes. | Passed | `npm --prefix jumpyard-checkin-kiosk run build` passed. |
| Kiosk lint | Kiosk shell font change lint check is run. | Blocked by existing issues | `npm --prefix jumpyard-checkin-kiosk run lint` still fails on pre-existing component/context lint errors outside T0048 shell changes. |
| Mobile ergonomics | Staff login/list/detail/scanner/redeem UI fits phone-sized screens without horizontal overflow. | Passed | Browser viewport `390x844` showed no horizontal overflow; scanner panel opened and stayed within the viewport. |
| Visual alignment | Admin app reuses check-in app font stack, JumpYard icon style, rounded controls, and red/neutral color language. | Passed | Browser verification showed the system sans-serif stack active, JumpYard icon assets rendering, and no desktop horizontal overflow at `1280x800`. |
| Admin login copy and icons | Login surface avoids the rejected staff/personnel wording and decorative login/input icons. | Passed | Browser check on `http://localhost:3002/` rendered `HANDOFF`, `KOD`, and `FORTSÄTT`, with no `Personal`, `Logga in`, `Logga ut`, key icon, or login shield icon visible. |
| Admin compact header/search copy | Logged-in header stays compact and search actions are clear. | Passed | Browser check at `390x844` showed a one-row 61px header, no overflow, placeholder `Sök eller skanna QR`, and `Sök`/`Skanna QR` as 900 italic. |
| Historical display font cleanup | Check-in app shells and docs use the documented system sans-serif stack without Google font imports. | Passed | Targeted search for the old font import names and Google font import path returned no source/doc matches. |
| Phone shell visual check | Phone app uses the same system font stack after the shell change. | Passed | Browser checks at `390x844` and `1280x800` showed the documented font stack and no horizontal overflow on `http://localhost:3000/`. |
| Contract preservation | Staff auth/list/detail/redeem request behavior is unchanged. | Passed | T0048 does not modify Lambda/backend code, AWS resources, Roller logic, SMS logic, payment logic, or phone/kiosk flow components. |

## T0049 Confirmed Scheduled SMS Safety Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | `node --check infra/lambda/session/index.js` passes. | Passed | Passed on 2026-05-25. |
| Infra build | `npm --prefix infra run build` passes. | Passed | Confirms the new CDK config fields compile. |
| Dev synth | `npm --prefix infra run synth:dev` passes with safe planning config. | Passed | Dev remains `confirmSend=false` with local URL allowed only for planning mode. |
| Config safety gate | `confirmSend=true` requires approval phrase plus public HTTPS `checkinBaseUrl`. | Passed | Temp unsafe configs failed synth when approval phrase was missing and when approval phrase existed but URL was still `localhost`. |
| Runtime safety gate | EventBridge-shaped confirmed sends block without approval phrase or public HTTPS URL. | Passed | Stubbed local Lambda smoke returned HTTP `409`, `booking_time_sms_blocked`, and `dryRun=true` before DB/SNS calls. |
| Dev diff/deploy | Dev stack deploys only approved session Lambda and EventBridge payload changes. | Passed | Pre-deploy diff showed only session code plus booking-time SMS rule payload/description; deploy passed and post-deploy diff showed no differences. |
| Root validation | `npm run validate` passes. | Passed | Confirms source-of-truth and AWS tag checks still pass. |
| Post-credential-recovery integrated smoke | Today's Playground booking can flow through lookup, Aurora session, ready-for-staff, and staff handoff detail without redemption. | Passed | Booking `5063366` for `2026-05-26` returned `ready`, was `Paid`/`fresh` in Aurora with 4 tickets, created session `jycs_mpmg3swu_0c34710f`, reached handoff `JY8713`, and appeared in the staff-auth-protected handoff list/detail. |

## T0051 New-Booking Payment Execution Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Official package source | Roller-approved payment package is taken from the Version History download. | Passed | Vendored `@roller/ecom-payments` package `1.0.217` from the official `v217` package; downloaded archive/temp files are not committed. |
| Phone dependency install | Phone package manifest and lockfile include the Roller package and required Adyen/PayPal dependencies. | Passed | `npm install` completed after adding `file:vendor/ecom-payments`; npm audit reports 7 newly surfaced dependency vulnerabilities from the payment dependency tree. |
| Raw JWT handling | Raw `paymentJwt` remains response-only and is not persisted/logged/rendered. | Passed | Source scan found JWT use only in the booking Lambda response, phone in-memory payment component, and safe presence/summary fields; no `console.*` logging in the payment component. |
| Root validation | `npm run validate` passes after T0051 source-of-truth updates. | Passed | Passed on 2026-05-26. |
| Payment readiness | `npm run roller:payment:readiness` reports current external state without writes. | Passed | `/venues/me.paymentSettings` is available, public origin returns HTTP 200, and Pabel later confirmed the domain allowlist. |
| Phone production audit | `npm audit --omit=dev` documents current production dependency risk. | Warning | Reports advisories through `next@16.0.8` and bundled `postcss`; npm suggests non-major `next@16.2.6`. Tracked as `FU-043` because framework upgrade is outside T0051. |
| Phone lint | `cd jumpyard-checkin-phone && npm run lint` passes after payment wiring. | Passed with warnings | Passed with the pre-existing four `<img>` warnings. Vendor package is ignored by ESLint so Roller-approved package source is not rewritten. |
| Phone build | `cd jumpyard-checkin-phone && npm run build` passes after payment wiring. | Passed | Static export build passed; Next reported stale `baseline-browser-mapping` advisory warnings. |
| Diff whitespace | `git diff --check` passes. | Passed | Passed on 2026-05-26; line-ending warnings are Git CRLF notices only. |
| Local browser smoke | Local phone app loads after T0051 wiring. | Passed | Browser check at `http://127.0.0.1:3000/` loaded `JumpYard Connected Entry`, showed buy-entry copy, and had no console errors. |
| Payment bootstrap failure | Missing package bootstrap configuration fails closed visibly. | Passed | Local payment screen no longer stays in an indefinite `Startar betalning` state when the Roller payment package returns no bootstrap configuration. |
| Public browser payment smoke | Cloudflare URL renders the Roller/Adyen drop-in and accepts the Adyen Visa test card ending `1142`. | Pending manual | Domain allowlist is confirmed; run after T0053 is merged/deployed so the basket order is correct. |
| Approved payment continuation | Approved payment resolves the paid booking through JumpYard Cloud and continues into check-in. | Pending manual | Must be verified with a successful Playground payment on the public Cloudflare URL. |

## T0052 Add-Product Payment Execution Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Raw JWT handling | Add-product draft JWT stays response-only and in-memory. | Passed | Source scan found JWT use only in the client response type, in-memory payment component, and payment readiness gate; no logging or rendering was added. |
| Payment fallback | Add-product drafts without JWT/config keep the safe payment-pending fallback. | Passed | `AddonsOffer` only enters payment when JWT and config are present; otherwise it keeps the T0035 pending screen. |
| Payment drop-in | Existing-booking add-products render the Roller payment drop-in when JWT/config are present. | Passed | T0078 public smoke rendered Roller's card payment drop-in for a linked add-product draft on `https://jumpyard-check-in.pages.dev`. |
| Approved add-product continuation | Approved add-product payment continues the original booking check-in path. | Passed | T0078 public card smoke paid the linked add-product draft and continued to the original booking safety-video step. |
| Root validation | `npm run validate` passes after T0052 updates. | Passed | Passed on 2026-05-26. |
| Phone lint | `npm --prefix jumpyard-checkin-phone run lint` passes. | Passed with warnings | Passed with the pre-existing four `<img>` warnings. |
| Phone build | `npm --prefix jumpyard-checkin-phone run build` passes. | Passed | Static export build passed; Next reported stale `baseline-browser-mapping` advisory warnings. |
| Local browser smoke | Local phone app loads after T0052 wiring. | Passed | Browser check at `http://localhost:3000/` loaded `JumpYard Connected Entry`, rendered `KIOSK_CHOICE`, and reported no console errors. |
| Diff whitespace | `git diff --check` passes. | Passed | Passed on 2026-05-26; line-ending notices are Git CRLF warnings only. |

## T0054 Public Payment Method Smoke Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Public T0053 deploy | Cloudflare URL shows add-ons before contact/review/payment. | Passed | Public smoke on `https://jumpyard-check-in.pages.dev` reached review with 60 min entry plus JumpSocks before creating one draft. |
| Swish payment | Selecting Swish in Playground can complete payment and publish/create a paid Roller booking. | Passed | Public smoke returned to booking summary for booking `5063382`; JumpYard Cloud lookup reports `Paid`, amount owing `0`, and `canCheckIn=true`. |
| Card method visibility | Card fields should be visible only if Roller/Adyen exposes the card/scheme method. | Blocked externally | Rendered payment UI showed Swish/Google Pay but no card fields. Safe config/session inspection found no `scheme` method available from the current Playground payment configuration. |
| Raw secret/JWT handling | Payment investigation does not print secrets, access tokens, raw JWTs, or full card numbers. | Passed | Only safe status, booking reference, method names, and boolean summaries were inspected. |
| Root validation | Source-of-truth docs validate after T0054 updates. | Passed | `npm run validate` passed on 2026-05-26. |

## T0055 New-Booking Paid Continuation Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone lint | Phone app lint passes after buy-entry progress/routing changes. | Passed with warnings | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing four `<img>` warnings. |
| Phone build | Phone app builds after buy-entry progress/routing changes. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed on 2026-05-26. |
| Buy-entry progress start | Clicking `Köp entré` shows a compact progress indicator from the time-selection step. | Passed | Browser verification showed labels `Entré`, `Tillägg`, `Betalning`, `Säkerhet`, and `Klar`. |
| Buy-entry progress advances | Time, product, quantity, add-ons, and contact steps update the progress state. | Passed | Browser verification advanced from `TIMESLOT` to `PRODUCT`, `QUANTITY`, `ADDONS`, and `CONTACT` without horizontal overflow in the current browser viewport. |
| Paid new-booking continuation | Approved new-booking payment should start/resume a JumpYard Cloud check-in session and route to safety/QR instead of existing-booking add-ons/payment. | Code validated | The route is implemented in `handlePaidNewBookingReady`; full public payment continuation should be re-smoked after the next deploy because card is still externally blocked and Swish requires manual action. |

## T0056 Payment Draft Status Reconciliation Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Lookup syntax | `node --check infra/lambda/lookup/index.js` passes. | Passed | Passed on 2026-05-27. |
| Webhook syntax | `node --check infra/lambda/webhook/index.js` passes. | Passed | Passed on 2026-05-27. |
| Infra build/synth | `npm --prefix infra run build` and `npm --prefix infra run synth:dev` pass. | Passed | Passed on 2026-05-27. CDK synth reported the existing CDK notice `37949`. |
| Root validation | `npm run validate` passes after source-of-truth updates. | Passed | Passed on 2026-05-27. |
| Diff whitespace | `git diff --check` passes. | Passed with CRLF notices | Passed on 2026-05-27; output contains Git line-ending notices only. |
| AWS preflight | `aws sts get-caller-identity --profile wrlds-dev` verifies the dev account before deploy. | Passed | Short-lived credentials exported from the existing `wrlds-dev` SSO profile verified account `376129878018`, region `eu-north-1`, without printing secret values in docs. |
| Dev diff/deploy | CDK diff/deploy changes only lookup and webhook Lambda code. | Passed | Pre-deploy diff showed only `LookupHandler` and `WebhookHandler` code assets; deploy passed; post-deploy diff showed no differences. |
| Paid draft reconciliation | A settled Roller booking matching a prepayment draft updates the draft to `published`. | Passed | Lookup smoke for booking `5063394` returned `Paid`, amount owing `0`, and updated draft `jypd_835161973ab34210ac` to `published` with `amount_owing_cents=0`. |
| Event log | Reconciliation writes one safe idempotent `prepayment_draft.published` event. | Passed | Aurora query found event type `prepayment_draft.published` for booking `5063394`. |
| Pending draft safety | Pending/unpaid/partial Roller snapshots do not publish local draft state. | Passed | Post-smoke draft status summary still showed `payment_pending` rows alongside the one published draft. |

## T0057 Integrated Smoke Test

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Ticket numbering | Project docs identify T0057 as integrated smoke test and T0058 as stack production readiness. | Passed | `CODEX_TASK.md`, `PROJECT_CONTEXT.md`, and `REPO_CURRENT_STATE.md` were updated. |
| Lookup/payment state | Known paid booking `5063394` returns ready from JumpYard Cloud and its prepayment draft remains `published`. | Passed | Dev lookup returned `found`/`ready`, `Paid`, amount owing `0`; Aurora draft `jypd_835161973ab34210ac` remained `published`. |
| Historical smoke booking redeemability | Existing paid smoke booking should be redeemable only when it is valid for today's date. | Blocked as expected | Booking `5063394` reached ready-for-staff but Roller rejected redeem with `Ticket is not valid for this date` because its visit date is `2026-05-26`. |
| Mixed add-on basket redeemability | Mixed entry plus add-on baskets should not send non-redeemable add-on tickets to Roller redeem. | Follow-up required | Booking `5063419` reached ready-for-staff, but Roller rejected redeem with `Product type not accepted` for add-on ticket ids. Tracked in `FU-054`. |
| Session handoff | A paid today's booking can start a check-in session and be marked ready for staff. | Passed | Entry-only booking `5063420` started session `jycs_mpns6nvd_bc6ab155` and reached handoff `JY2947`. |
| Staff auth/list/detail | Staff-auth-protected endpoints can read the ready handoff session. | Passed | Staff auth returned `authenticated` without printing token/passcode; list contained the session before redeem and detail returned booking `5063420` with one selected ticket. |
| Staff redeem | Staff-confirmed redeem succeeds for a redeemable today's entry-only booking. | Passed | Staff redeem returned `redeemed` with one redeemed ticket; no Roller Live calls were made. |
| Final Aurora state | Session/ticket state reflects the final smoke outcome. | Passed | Aurora shows session `redeemed`, handoff `completed`, safety `completed`, one selected ticket, and one redeemed ticket for booking `5063420`; the session left the active ready list. |
| Browser smoke | Phone and staff/admin apps load enough to verify the shells. | Passed | Public phone app loaded with buy-entry and booking lookup copy; local admin app was temporarily started on `127.0.0.1:3002`, rendered the handoff shell, then was stopped. |
| Root validation | `npm run validate` passes after smoke docs are updated. | Passed | `npm run validate` and `git diff --check` passed on 2026-05-27; diff check reported CRLF notices only. |

## T0058 Stack Production Readiness Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity preflight | Read-only AWS checks use account `376129878018` and region `eu-north-1`. | Passed | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`; `aws configure get region --profile wrlds-dev` returned `eu-north-1`. |
| Stack read-only check | Current dev stack can be inspected without resource changes. | Passed | CloudFormation reported stack `jumpyard-check-in-dev-stack` status `UPDATE_COMPLETE` with API, Aurora, Roller secret, and raw payload bucket outputs. |
| API exposure audit | Current API auth/CORS posture is documented before staging/live. | Passed | `get-routes` reported `AuthorizationType=NONE` for HTTP API routes; `get-api` confirmed CORS `AllowOrigins=['*']`. |
| Observability audit | Missing production alarms are documented. | Passed | `describe-alarms --alarm-name-prefix jumpyard-check-in-dev` returned an empty list. |
| Aurora posture audit | Current dev database safety posture is documented. | Passed | RDS reported Aurora PostgreSQL `16.13`, encrypted storage, Data API enabled, deletion protection on, 7-day backup retention, and status `available`. |
| SMS sandbox audit | Current SNS production blocker is documented. | Passed | `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`. |
| Infra build | `npm --prefix infra run build` passes. | Passed | Passed on 2026-05-27; no AWS resources were changed. |
| Dev synth | `npm --prefix infra run synth:dev` passes. | Passed | Passed on 2026-05-27; CDK emitted the existing notice `37949`, and no deploy was run. |
| Root validation | `npm run validate` passes. | Passed | Passed on 2026-05-27 after T0058 source-of-truth updates. |
| Diff whitespace | `git diff --check` passes. | Passed with CRLF notices | Passed on 2026-05-27; output contains Git line-ending notices only. |

## T0059 Redeem Eligibility Filter Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Redeem Lambda syntax | `node --check infra/lambda/redeem/index.js` passes. | Passed | Passed locally on 2026-05-28. |
| Session Lambda syntax | `node --check infra/lambda/session/index.js` passes. | Passed | Passed locally on 2026-05-28. |
| Infra build | `npm --prefix infra run build` passes. | Passed | Passed locally on 2026-05-28. |
| Dev synth | `npm --prefix infra run synth:dev` passes. | Passed | Passed locally on 2026-05-28; CDK emitted the existing notice `37949`. |
| AWS preflight | Account `376129878018` and region `eu-north-1` are verified before deploy. | Passed | Passed on 2026-05-28 after AWS SSO refresh. |
| Dev diff/deploy | CDK diff/deploy changes only the scoped Lambda code. | Passed | Pre-deploy diff showed only `RedeemHandler` and `SessionHandler` code assets; deploy passed; post-deploy diff showed no differences. |
| Mixed booking plan | Mixed entry plus stock/add-on booking excludes add-on ticket ids before Roller redeem. | Passed | Booking `5063419` plan selected 2 entry tickets and excluded 2 add-on tickets. |
| Mixed session selection | A new mixed-booking check-in session stores only redeemable selected ticket ids. | Passed | New session `jycs_mpp5x4k4_a7351d4b` stored only the two entry ticket ids for booking `5063419`. |
| Mixed staff redeem | Staff-confirmed redeem succeeds for selected entry tickets and does not redeem add-on tickets. | Passed | Staff redeem succeeded for tickets `5063419-21529629` and `5063419-21529630`; Aurora shows `5063419-21529631` and `5063419-21529632` still unredeemed. The booking was dated 2026-05-27, so the smoke supplied that booking-date redemption timestamp. |
| Entry-only smoke | Entry-only booking still keeps its redeemable ticket id and remains redeemable. | Passed | Booking `5063394` plan selected 1 ticket, excluded 0, and remained `ready`; already-redeemed entry-only bookings still block as `already_redeemed` with no exclusions. |

## T0060 API Security And Observability Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Lambda syntax | Roller-calling Lambda files parse after metric instrumentation. | Passed | `node --check` passed for lookup, booking, redeem, webhook, and data-sync on 2026-05-28. |
| Infra build | CDK TypeScript compiles after API/CORS/CloudWatch changes. | Passed | `npm --prefix infra run build` passed on 2026-05-28. |
| Dev synth | Dev stack synthesizes with explicit CORS, dashboard, alarms, and access logs. | Passed | `npm --prefix infra run synth:dev` passed on 2026-05-28; CDK emitted the existing notice `37949`. |
| AWS preflight | Deploy uses the approved dev account and region. | Passed | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`; region is `eu-north-1`. |
| Dev diff/deploy | CDK diff/deploy changes only T0060 approved resources and Lambda metric code. | Passed | Pre-deploy diff showed explicit CORS, API access log group, dashboard, alarms, and Lambda code/env updates; deploy passed; post-deploy diff showed no differences. |
| CORS allow-list | Cloudflare Pages origin is allowed and wildcard is removed. | Passed | `get-api` returned the explicit allowed origins; `curl.exe OPTIONS` returned `204` and `access-control-allow-origin: https://jumpyard-check-in.pages.dev`. |
| Dashboard and alarms | CloudWatch dashboard and alarms exist. | Passed | `get-dashboard jumpyard-check-in-dev-ops` succeeded; `describe-alarms --alarm-name-prefix jumpyard-check-in-dev` returned 16 alarms. |
| Non-write API smoke | Availability endpoint still reads Roller through JumpYard Cloud without creating a booking. | Passed | `POST /v1/bookings/availability` for `2026-05-28` `10:00` returned `status=available`, source `roller`, and `wroteBooking=false`. |
| Roller API call metrics | Roller outbound calls emit safe metrics. | Passed | Booking Lambda logs showed embedded metrics for `oauth_token` and `get_product_availability`, with no secrets, tokens, raw payloads, full phones, or full emails. |

## T0061 API Gateway Protection Boundary Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Infra build | CDK TypeScript compiles after config and stack throttling changes. | Passed | `npm --prefix infra run build` passed on 2026-05-28. |
| Dev synth | Dev stack synthesizes with API Gateway stage throttling and throttled-request metric resources. | Passed | `npm --prefix infra run synth:dev` passed on 2026-05-28; CDK emitted the existing notice `37949`. |
| AWS preflight | Deploy uses the approved dev account and region. | Passed | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`; region is `eu-north-1`. |
| Dev diff/deploy | CDK diff/deploy changes only T0061 approved API protection resources. | Passed | Pre-deploy diff showed `$default` stage route settings, API throttled request metric filter, one CloudWatch alarm, and dashboard updates; deploy passed; post-deploy diff showed no differences. |
| Stage throttling | API Gateway `$default` stage has default throttling. | Passed | `get-stage` returned `DetailedMetricsEnabled=true`, `ThrottlingRateLimit=25`, and `ThrottlingBurstLimit=50`. |
| Throttle metric and alarm | Throttled requests are visible through CloudWatch. | Passed | Metric filter on `/aws/apigateway/jumpyard-check-in-dev-api-access` writes `JumpYard/Cloud` metric `ApiThrottledRequestCount`; alarm `jumpyard-check-in-dev-api-throttled-requests` exists. |
| Non-write API smoke | Availability endpoint still reads Roller through JumpYard Cloud after throttling. | Passed | `POST /v1/bookings/availability` returned HTTP `200`, source `roller`, and `wroteBooking=false`. |
| Root validation | Source-of-truth docs validate after T0061 updates. | Passed | `npm run validate` passed on 2026-05-28. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-28; output contains Git line-ending notices only. |

## T0062 Route Auth And WAF Boundary Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Route inventory | Every current CDK route is represented in the protection boundary document. | Passed | `rg` comparison found 19 CDK route declarations and 19 documented routes in `API_PROTECTION_BOUNDARY.md`. |
| Trust boundary | Each route has a target guest, staff, internal, webhook, or legacy/dev-only boundary. | Passed | Docs-only validation. |
| Roadmap | `REPO_CURRENT_STATE.md` locks the next production-readiness ticket roadmap. | Passed | Includes T0063 through T0070 plus deferred card/scheme smoke. |
| No AWS changes | T0062 makes no CDK or AWS resource changes. | Passed | Docs-only ticket. |
| Root validation | Source-of-truth docs validate after T0062 updates. | Passed | `npm run validate` passed on 2026-05-28. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-28; output contains Git line-ending notices only. |

## T0063 Guest Messaging And Email Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | Email route changes parse successfully. | Passed | `node --check infra/lambda/session/index.js` passed on 2026-05-28. |
| Infra build | CDK config and stack changes type-check. | Passed | `npm --prefix infra run build` passed. |
| Infra synth | Dev stack synthesizes with email config and route. | Passed | `npm --prefix infra run synth:dev` passed. |
| Migration | `0007 email deliveries` applies to dev Aurora. | Passed | `npm --prefix infra run migrate:dev` applied `0007 email deliveries`. |
| Deploy | Dev deploy adds email route and session Lambda updates only. | Passed | `npm --prefix infra run deploy:dev` added the email route, session Lambda env/IAM/code, and public SMS base URL target. |
| Email dry-run | Protected email route creates an email token and audit row without sending. | Passed | Booking `5063420` returned `email_planned`, delivery `jyem_mppbtp9i_5e98ee13`, masked destination only, and Aurora row status `planned`. |
| Confirmed-send guard | Confirmed email fails closed without configured SES sender. | Passed | Confirmed-send smoke returned HTTP `400` with `email_sender_not_configured`. |
| SMS safety | Scheduled booking-time SMS stays planning-only. | Passed | `bookingTimeSms.confirmSend=false`; SMS public-URL dry-run returned `sms_planned` for masked destination `+46*****9508`. |

## T0064 Messaging-First Roadmap Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Roadmap order | Guest SMS, guest email, and unified guest messaging are listed before environment/cutover work. | Passed | `REPO_CURRENT_STATE.md`, `PROJECT_CONTEXT.md`, and `FOLLOWUPS.md` now put T0065-T0068 messaging work before broader readiness work. |
| No implementation changes | T0064 changes source-of-truth docs only. | Passed | Only source-of-truth docs were edited for T0064; unrelated local asset/package changes remain outside this ticket. |
| Root validation | `npm run validate` passes after docs updates. | Passed | Passed on 2026-05-28. |
| Diff whitespace | `git diff --check` passes. | Passed with CRLF notices | Passed on 2026-05-28; output contains Git line-ending notices only. |

## T0065 Guest SMS Completion Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | SMS diagnostic/copy changes parse successfully. | Passed | `node --check infra/lambda/session/index.js` passed on 2026-05-28. |
| Infra build | CDK TypeScript still compiles after session Lambda packaging changes. | Passed | `npm --prefix infra run build` passed on 2026-05-28. |
| Infra synth | Dev stack synthesizes before deploy. | Passed | `npm --prefix infra run synth:dev` passed on 2026-05-28. |
| Dev diff/deploy | Dev deploy changes only the session Lambda code asset. | Passed | AWS account `376129878018`, region `eu-north-1`; diff showed only `SessionHandler` code, and deploy passed. |
| Confirmed SMS smoke | Protected manual SMS send succeeds only to the verified sandbox test phone. | Passed | Booking `5063420` returned `sms_sent`, delivery `jysms_mppg15lj_7c660ef2`, provider `aws_sns`, provider message id present, sender ID configured/requested, and masked destination only. |
| Aurora audit row | Confirmed send is recorded in `jumpyard.sms_deliveries`. | Passed | Delivery `jysms_mppg15lj_7c660ef2` has status `sent`, `dry_run=false`, provider `aws_sns`, and provider message id present. |
| SNS delivery status | Provider delivery status is checked after SNS publish acceptance. | Passed | CloudWatch SNS delivery status reported `SUCCESS` with provider response `Message has been accepted by phone.` |
| Scheduled SMS safety | T0065 does not enable unattended scheduled SMS sends. | Passed | Dev EventBridge booking-time SMS remains configured with `confirmSend=false`. |
| Root validation | Source-of-truth docs validate after T0065 updates. | Passed | `npm run validate` passed on 2026-05-28. |
| Post-deploy diff | Deployed dev stack matches the local CDK template. | Passed | `npm --prefix infra run diff:dev` showed no differences after deploy. |
| Diff whitespace | `git diff --check` passes. | Passed with CRLF notices | Passed on 2026-05-28; output contains Git line-ending notices only. |

## T0066 Guest Email Completion Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | Email diagnostic/copy changes parse successfully. | Passed | `node --check infra/lambda/session/index.js` passed on 2026-05-28. |
| Infra build | CDK TypeScript still compiles after session Lambda packaging changes. | Passed | `npm --prefix infra run build` passed on 2026-05-28. |
| Infra synth | Dev stack synthesizes before deploy. | Passed | `npm --prefix infra run synth:dev` passed on 2026-05-28. |
| SES readiness | Current AWS SES state is known before any real email send. | Passed | Account `376129878018`, region `eu-north-1`, has `SendingEnabled=true`, `ProductionAccessEnabled=false`, max 200 emails per day, max send rate 1/second, and no email identities. |
| Dev diff/deploy | Dev deploy changes only the session Lambda code asset. | Passed | Pre-deploy diff showed only `SessionHandler` code, and deploy passed. |
| Email dry-run smoke | Protected manual email dry-run creates a safe audit row without sending email. | Passed | Booking `5063420` returned `email_planned`, delivery `jyem_mppic9ea_01a07299`, provider `aws_ses`, `fromAddressConfigured=false`, `replyToConfigured=false`, and masked destination only. |
| Aurora audit row | Dry-run email is recorded in `jumpyard.email_deliveries`. | Passed | Delivery `jyem_mppic9ea_01a07299` has status `planned`, `dry_run=true`, provider `aws_ses`, and template `checkin_email_v1`. |
| Confirmed-send guard | Real email sends fail closed until a verified sender/domain is configured. | Passed | Confirmed send returned HTTP `400` with `email_sender_not_configured`. |
| Email preview safety | Dry-run preview avoids exposing the raw `jy_token` URL. | Passed | Preview text contains `[check-in-link]`, and subject includes the booking start time: `Dags att checka in kl 10:30`. |
| Root validation | Source-of-truth docs validate after T0066 updates. | Passed | `npm run validate` passed on 2026-05-28. |
| Post-deploy diff | Deployed dev stack matches the local CDK template. | Passed | `npm --prefix infra run diff:dev` showed no differences after deploy. |
| Diff whitespace | `git diff --check` passes. | Passed with CRLF notices | Passed on 2026-05-28; output contains Git line-ending notices only. |

## T0067 Real SES Email Smoke Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity preflight | Work targets the approved dev account and region. | Passed | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`; region is `eu-north-1`. |
| SES account state | SES can send only within current sandbox constraints. | Passed | `SendingEnabled=true`, `ProductionAccessEnabled=false`, max 200 emails per day, max send rate 1/second. |
| SES identity creation | User-approved test identity exists for real dev email smoke. | Passed | Created SES email identity `love@wrlds.com` with WRLDS tags; SES reports `VerificationStatus=SUCCESS` and `VerifiedForSendingStatus=true`. |
| Dev sender config | Dev sender/reply-to uses the verified identity only after verification. | Passed | `infra/config/dev.json` now sets `guestEmail.fromAddress` and `guestEmail.replyToAddresses` to `love@wrlds.com`; CDK diff showed only session Lambda environment changes. |
| Dev deploy | Session Lambda receives verified SES sender config. | Passed | `npx cdk deploy -c config=./config/dev.json --require-approval never` passed on 2026-05-28. |
| Confirmed email smoke | SES accepts a protected email send to `love@wrlds.com`. | Passed | Booking `5063420` returned `email_sent`; Aurora recorded sent deliveries `jyem_mppo8w07_296c1a5e` and `jyem_mppo99gl_3c888240` with provider message ids present. |
| Aurora audit row | Confirmed real sends are recorded without full recipient or link. | Passed | Latest rows use masked destination `l***@w***.com`, `dry_run=false`, provider `aws_ses`, and no raw token/full URL output. |

## T0068 Unified Booking-Time Messaging Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | Unified messaging code parses successfully. | Passed | `node --check infra/lambda/session/index.js` passed on 2026-05-28. |
| Infra build | CDK stack compiles with the new unified route and EventBridge payload. | Passed | `npm --prefix infra run build` passed. |
| Infra synth | Dev stack synthesizes with the unified booking-time messaging route. | Passed | `npm --prefix infra run synth:dev` passed. |
| CDK diff | AWS changes are scoped to the session Lambda, new route, and EventBridge payload. | Passed | Diff added `POST /v1/check-in/session-links/send-due-messages`, changed the session Lambda code asset, and updated the existing schedule payload to channels `sms` and `email`. |
| Dev deploy | Dev stack deploys the unified route and schedule payload. | Passed | `npx cdk deploy -c config=./config/dev.json --require-approval never` passed on 2026-05-28. |
| Post-deploy diff | Deployed dev stack matches local CDK. | Passed | Post-deploy diff showed no differences. |
| Unified planning smoke | Protected unified route plans both channels without sending. | Passed | `POST /v1/check-in/session-links/send-due-messages` returned `booking_time_messages_planned` with separate `sms` and `email` channel summaries and masked destinations only. |
| Legacy SMS smoke | Existing due-SMS route still works. | Passed | `POST /v1/check-in/session-links/send-due-sms` returned `booking_time_sms_planned` with only the `sms` channel. |
| Scheduled event smoke | EventBridge-shaped payload runs internally without public dev-token auth. | Passed | Direct Lambda invoke with `scheduled_booking_time_messaging` returned planning results for `sms` and `email` with `confirmSend=false`. |
| Real unattended sends | Schedule must not send real SMS or email in dev. | Passed | Dev EventBridge payload keeps `confirmSend=false`; no confirmed scheduled sends were enabled. |

## T0069 Stabilization Roadmap Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Roadmap gate | Stabilization and full-flow proof appear before broader production-readiness tickets. | Passed | `REPO_CURRENT_STATE.md` now puts the T0075-T0082 core-flow gate before environment/cutover, runbooks, production auth/WAF, retention, and live backfill work. |
| Follow-up ownership | Open follow-ups point to the reordered future tickets. | Passed | SMS/email follow-ups point to T0072/T0073; production-readiness follow-ups point to T0075-T0080. |
| No implementation changes | T0069 changes source-of-truth docs only. | Passed | No app code, Lambda code, CDK resources, AWS config, Roller config, package dependencies, or credentials were changed. |
| Root validation | Source-of-truth docs validate after T0069 updates. | Passed | `npm run validate` passed on 2026-05-29. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-29; output contains Git line-ending notices only. |

## T0070 Integrated Dev Smoke Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Fresh Playground booking | Create a scoped paid Playground booking for today's smoke. | Passed | Created booking `5100836` for `2026-05-29 10:30`, Roller unique id `4b1cc599-e36e-4d39-848d-56f8fd65e617`, without printing secrets, raw tokens, full phone, or full email. |
| JumpYard lookup | Lookup returns found and ready through JumpYard Cloud. | Passed | `POST /v1/check-in/lookup` returned `found`, eligibility reason `ready`, source `jumpyard_cloud`, and lookup path `aurora:booking_reference`. |
| Session start | Check-in session starts or resumes for the booking. | Passed | `POST /v1/check-in/sessions` returned session `jycs_mpqo1mlo_177e4e06` with one selected redeemable ticket. |
| Ready for staff | Guest safety handoff can mark the session ready. | Passed | `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff` returned handoff `JY2024` with status `ready_for_staff`. |
| Staff auth and detail | Staff auth works and can read the session detail. | Passed | `POST /v1/staff/auth/login` authenticated with the current dev staff passcode, and staff detail returned the same session. |
| Staff-confirmed redeem | Staff-confirmed redeem succeeds for selected redeemable tickets. | Passed | `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem` returned `redeemed` with one redeemed ticket. |
| Aurora final state | Local session and selected tickets reflect completion. | Passed | Final staff detail returned session status `redeemed`, handoff status `completed`, and one local ticket with redeemed status. |
| Roller post-redeem read | Roller booking detail remains readable after redeem. | Partial | `GET /bookings/5100836` returned HTTP `200`, but the returned ticket object exposed only `ticketId` plus location data, not a clear redeemed status field. Follow-up `FU-066` tracks the best Roller-side verification path. |
| Cleanup | No retry smoke session remains waiting in staff list. | Passed | Earlier retry session `jycs_mpqo02zt_3e4329f9` for booking `5100835` was staff-redeemed as cleanup; staff ready list returned count `0`. |
| Implementation scope | T0070 does not change runtime behavior. | Passed | Only source-of-truth docs were updated; no app code, Lambda code, CDK code, migration, package dependency, secret, or AWS resource changed. |
| Root validation | Source-of-truth docs validate after T0070 updates. | Passed | `npm run validate` passed on 2026-05-29. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-29; output contains Git line-ending notices only. |

## T0071 Data API And Webhook Health Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity | Verify dev AWS target before inspection. | Passed | `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`; region is `eu-north-1`. |
| Scheduled Data API rule | Daily sync rule exists and is enabled. | Passed | `jumpyard-check-in-dev-data-api-daily-sync` is `ENABLED`, uses `cron(0 2 * * ? *)`, and targets `jumpyard-check-in-dev-stack-data-sync`. |
| Latest scheduled run | Latest daily Data API run succeeded. | Passed | `booking_seed_runs` latest scheduled row for `2026-05-28 -> 2026-05-29` is `succeeded`, finished at `2026-05-29 02:00:38 UTC`, with 2 bookingitems, 2 tickets, 491 products, and no error summary. |
| Prior failure visibility | Previous Data API failure is visible. | Passed | `booking_seed_runs` contains three `2026-05-26` failures for `2026-05-25 -> 2026-05-26` with safe error summary `HTTP 403`; current runs recovered after Roller API access was re-enabled. Follow-up `FU-067` tracks a runbook. |
| Manual current-day sync | Manual dev-only sync can refresh today's modified window. | Passed | Invoked `jumpyard-check-in-dev-stack-data-sync` for `2026-05-29 -> 2026-05-30`; status `succeeded`, duration about 31 seconds, with 2 bookingitems, 2 tickets, 2 payments, 2 customers, 491 products, and 2 booking upserts. |
| Aurora table health | Expected local snapshot tables contain rows. | Passed | Counts after sync: 23 bookings, 31 booking items, 38 tickets, 10 payments, 26 guest profiles, 13 seed runs, and 19 webhook events. |
| Recent booking freshness | Recent smoke bookings have fresh local rows. | Passed | Bookings `5100835` and `5100836` are `Paid`, `fresh`, `source_last_updated_by=scheduled_data_api_sync`, each with 1 item, 1 ticket, and 1 payment row. |
| Webhook processing | Recent real Roller webhook events are processed. | Passed | Booking `Created` events for `5100835` and `5100836` are `processed`, each with one enrichment attempt, processed timestamps, and no error summary. |
| Lookup from Aurora | App lookup can use the fresh Aurora row. | Passed | `POST /v1/check-in/lookup` for `5100836` returned `found`, `ready`, source `jumpyard_cloud`, lookup path `aurora:booking_reference`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`. |
| Alarm state | Relevant dev alarms are not firing. | Passed | Data-sync Lambda errors/throttles, webhook Lambda errors/throttles, and Roller API error alarms are `OK`. |
| Implementation scope | T0071 does not change runtime behavior. | Passed | No app code, Lambda code, CDK code, migration, package dependency, secret, or AWS resource changed. |
| Root validation | Source-of-truth docs validate after T0071 updates. | Passed | `npm run validate` passed on 2026-05-29. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-29; output contains Git line-ending notices only. |

## T0072 Guest SMS/Email Sender Readiness Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity | Verify dev AWS target before inspection. | Passed | `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`; region is `eu-north-1`. |
| SNS sandbox state | Confirm whether unrestricted SMS sending is available. | Passed with blocker | `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`, so dev SMS can only reach verified sandbox recipients until sandbox exit or a verified-recipient policy is approved. |
| SNS verified recipients | Confirm test-recipient readiness without full phone output. | Passed | SNS sandbox list has one verified masked test recipient and zero pending recipients. |
| SNS SMS attributes | Confirm current SMS delivery diagnostics and sender posture. | Partial | `DefaultSMSType=Transactional`, `MonthlySpendLimit=1`, delivery-status IAM role is configured, and success sampling is `100`; no `DefaultSenderID` attribute is set. |
| Session SMS config | Confirm Lambda requests the intended sender/base URL. | Partial | Session Lambda env requests `SMS_SENDER_ID=JumpYard` and dev config uses `https://jumpyard-check-in.pages.dev/`; actual handset sender display still needs T0073 controlled smoke. |
| SES account state | Confirm whether unrestricted email sending is available. | Passed with blocker | SES has `SendingEnabled=true` and `ProductionAccessEnabled=false`, max 200 messages per day, max send rate 1/second. |
| SES identity state | Confirm dev sender readiness. | Partial | Only `love@wrlds.com` is verified for dev sending; no production domain identity, DKIM signing, or custom MAIL FROM setup exists. |
| Booking-time schedule safety | Confirm unattended real sends remain disabled. | Passed | EventBridge rule `jumpyard-check-in-dev-booking-time-sms-schedule` invokes unified channels `sms` and `email` every 5 minutes with `confirmSend=false`. |
| Delivery audit state | Confirm safe SMS/email audit rows exist. | Passed | Aurora aggregates show planned/sent SMS and email rows without printing raw tokens, full URLs, full phone numbers, or full email addresses. |
| Alarm/log posture | Confirm monitoring baseline and gaps. | Partial | Session Lambda alarms are `OK`; SNS delivery log groups exist, but no channel-specific SMS/email delivery alarms or runbooks exist yet. Follow-ups `FU-068` and `FU-069` track the gaps. |
| Implementation scope | T0072 does not change runtime behavior. | Passed | No app code, Lambda code, CDK code, migration, package dependency, secret, or AWS resource changed. |
| Root validation | Source-of-truth docs validate after T0072 updates. | Passed | `npm run validate` passed on 2026-05-29. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-29; output contains Git line-ending notices only. |

## T0073 Controlled Unified Booking-Time Message Smoke Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity | Verify dev AWS target before smoke. | Passed | `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`; region is `eu-north-1`. |
| Scoped Playground booking | Use one paid today's booking with approved test destinations only. | Passed | Created booking `5100877` for `2026-05-29 15:30`, product `1765860`, total `200`, with masked/approved phone and email only. |
| Aurora refresh | Existing sync path makes the booking visible to the due-message processor. | Passed | Manual invoke of `jumpyard-check-in-dev-stack-data-sync` for `2026-05-29 -> 2026-05-30` succeeded with 4 bookingitems, 4 tickets, 4 payments, 5 customers, 491 products, and 4 booking upserts. |
| Unified planning | Protected due-message route finds both SMS and email without sending. | Passed | `POST /v1/check-in/session-links/send-due-messages` with `confirmSend=false`, `now=2026-05-29T15:00:00+02:00`, `leadMinutes=30`, and `windowMinutes=10` planned one SMS and one email for booking `5100877`. |
| Controlled confirmed send | Protected due-message route sends both channels once. | Passed | Same route with `confirmSend=true` returned `sent=2`, no failures, and masked destinations only. |
| Aurora SMS audit | Sent SMS is recorded without raw token/full phone/full URL. | Passed | `jumpyard.sms_deliveries` row `jysms_mpqwyxay_e7fe6d3c` is `sent`, `dry_run=false`, provider `aws_sns`, provider message id present, and destination masked. |
| Aurora email audit | Sent email is recorded without raw token/full email/full URL. | Passed | `jumpyard.email_deliveries` row `jyem_mpqwyxox_94ea00f5` is `sent`, `dry_run=false`, provider `aws_ses`, provider message id present, and destination masked. |
| SMS provider status | SNS delivery status confirms provider acceptance. | Passed | CloudWatch SNS delivery status reported `Message has been accepted by phone` with dwell time 55 ms. |
| SES provider status | SES accepts the send and returns a provider message id. | Passed | Aurora stores a SES provider message id; no SES delivery-event stream is configured yet. |
| Manual receipt | User confirms real SMS and email were received. | Passed | User confirmed both SMS and email arrived; text is acceptable for now but needs copy polish before broader guest rollout. |
| Scheduled-send safety | T0073 does not enable unattended sends. | Passed | EventBridge booking-time messaging rule still uses `confirmSend=false`; T0073 used only a protected manual confirmed smoke. |
| Implementation scope | T0073 does not change runtime behavior. | Passed | No app code, Lambda code, CDK code, migration, package dependency, secret, or AWS resource changed. |
| Root validation | Source-of-truth docs validate after T0073 updates. | Passed | `npm run validate` passed on 2026-05-29. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-29; output contains Git line-ending notices only. |

## T0074 SMS Production Unlock Preparation Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity | Verify dev AWS target before SMS production-readiness inspection. | Passed | `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` returned account `376129878018`; region is `eu-north-1`. |
| SNS sandbox state | Confirm whether arbitrary guest phone numbers can receive SMS. | Passed with blocker | `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`, so unverified guest phone numbers still cannot receive SMS. |
| SNS SMS attributes | Confirm current SMS account attributes and diagnostics. | Passed | `DefaultSMSType=Transactional`, `MonthlySpendLimit=1`, `DeliveryStatusSuccessSamplingRate=100`, and delivery-status IAM role configured. No `DefaultSenderID` is set. |
| End User Messaging tier | Confirm AWS End User Messaging SMS production access state. | Passed with blocker | `aws pinpoint-sms-voice-v2 describe-account-attributes` returned `ACCOUNT_TIER=SANDBOX`. |
| Sender IDs and pools | Confirm whether sender-display resources already exist. | Passed with blocker | `describe-sender-ids` returned no sender IDs and `describe-pools` returned no pools. |
| Official AWS docs review | Confirm production unlock path from primary sources. | Passed | Reviewed official AWS docs for SMS sandbox production access and AWS End User Messaging SMS production access; docs require a support request with use case, countries, app URL, opt-in/consent, message samples, and volume expectations. |
| Support case draft | Prepare the request content without submitting it. | Passed | `PROJECT_CONTEXT.md` now contains a draft AWS Support request with placeholders for expected volume, peak rate, opt-out/support text, final copy, and approval to submit. |
| Implementation scope | T0074 changes no runtime behavior. | Passed | No app code, Lambda code, CDK code, migration, package dependency, secret, AWS resource, or Roller config changed. |
| Scheduled-send safety | T0074 does not enable unattended sends. | Passed | EventBridge booking-time messaging remains `confirmSend=false`; no support case or Sender ID registration was submitted. |
| Root validation | Source-of-truth docs validate after T0074 updates. | Passed | `npm run validate` passed on 2026-05-29. |
| Diff whitespace | Diff whitespace check passes. | Passed with CRLF notices | `git diff --check` passed on 2026-05-29; output contains Git line-ending notices only. |

## T0075 Card Payment Unblock Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Pabel confirmation | Roller confirms the Playground payment integration issue is fixed. | Passed | Pabel replied on 2026-06-01 that the challenge with the Playground payment integration is fixed and card payments should now show up. |
| Existing implementation path | Phone payment still uses Roller's approved payment package and response-only draft `paymentJwt`. | Passed by code review | `RollerPaymentDropIn` imports `@roller/ecom-payments`, bootstraps with safe payment settings, passes the raw JWT only in memory, and does not collect card data in JumpYard-owned fields. |
| Direct frontend Roller calls | Frontend must not call generic Roller REST APIs or receive Roller credentials. | Passed by code review | Phone payment uses the Roller payment package's public payment-session calls, while quote/draft creation still goes through JumpYard Cloud. |
| Local branch setup | Ticket branch should be created before work. | Passed | Branch `codex/t0075-card-payment-unblock` was created after permissions changed. Older unrelated local asset/package changes remain unstaged outside T0075. |
| Automated payment readiness | Safe readiness script should confirm payment prerequisites. | Passed | `ROLLER_PAYMENT_ALLOWLIST_CONFIRMED=true npm.cmd run roller:payment:readiness -- --json` returned `ready_for_payment_implementation`, with no blockers and safe output only. |
| Payment POC diagnostics | POC should recognize the currently vendored Roller payment package. | Passed | `npm.cmd run roller:payment:poc -- --json` returned `ready_for_browser_payment_test`; script now reports vendored `@roller/ecom-payments` version `1.0.217` instead of requiring an old package URL. |
| Browser card visibility | Public checkout should render card payment. | Passed | In-app browser and Playwright both showed `Kortbetalning` plus card brand icons on `https://jumpyard-check-in.pages.dev`. |
| Browser card smoke | Public checkout should approve the Adyen Visa test card ending `1142`. | Passed | Playwright with installed Chrome selected 60 min entry at `10:00`, filled the secure Adyen card iframes with the test Visa ending `1142`, submitted `Betala 200,00 kr`, and reached the phone safety-video step without request failures. |
| Payment method list | Available payment methods should come from Roller/Adyen configuration, not JumpYard filtering. | Follow-up open | Current public drop-in renders `Kortbetalning`, `Delbetalning`, and `Google Pay`; Swish no longer appears after the card fix. `FU-071` tracks Roller/Pabel confirmation for Swish and Apple Pay enablement. |

## T0076 New-Booking Full Purchase Flow Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Public checkout flow order | Guest chooses time, entry, optional add-ons, contact, and review before payment. | Passed | Public Cloudflare smoke selected 60 min entry at `11:00`, skipped add-ons, filled contact details, and saw the basket review before draft/payment. |
| Card payment | Roller payment drop-in accepts the approved Playground test card. | Passed | Secure Adyen iframes accepted the Visa test card ending `1142`; the app did not own raw card fields. |
| Post-payment continuation | Paid new booking continues into the phone safety/check-in flow. | Passed | After payment, lookup briefly returned `404`, then succeeded through the normal JumpYard Cloud path; the flow created/resumed the check-in session. |
| Safety gate | Guest can complete the safety video and required confirmations. | Passed | Browser smoke clicked video play, continued after the video step, and completed all six safety confirmations. |
| QR/handoff state | Final page shows ready-for-staff state and handoff code. | Passed | Final state showed ready-for-staff with handoff/backup code `JY4704` and one armband item. |
| Direct Aurora readback | Read-only Aurora state should be checked where practical. | Blocked | Local AWS SSO token for profile `wrlds-dev` had expired, so direct database readback was deferred. Browser/API flow proof still passed. |
| Payment method follow-up | Swish/Apple Pay visibility should not block the card-paid core flow. | Follow-up open | `FU-071` tracks Roller/Pabel confirmation; T0076 used card because card is the currently confirmed method. |

## T0077 Existing-Booking Happy Path Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Paid booking fixture | A paid booking for today's operating date is available for lookup. | Passed | Read-only Roller Data API lookup found booking `5100930`, status `Paid`, booking date `2026-06-01`, session start `11:00`. |
| Existing-booking lookup | Guest can enter a booking reference and find the booking through JumpYard Cloud. | Passed | Public browser smoke used the existing-booking path on `https://jumpyard-check-in.pages.dev/?codexSmoke=t0077-existing-5100930` and entered `5100930`. |
| No repeat payment | Paid existing booking should not ask the guest to pay again. | Passed | The app resumed to the existing ready-for-staff QR/handoff state instead of showing payment. |
| Ready-session resume | A booking already ready for staff should not repeat completed safety steps. | Passed | Booking `5100930` resumed directly to ready-for-staff because T0076 already completed safety for this session. |
| QR/handoff state | Final page shows the server-owned handoff code. | Passed | Final state showed handoff/backup code `JY4704` and one armband item. |
| Staff redeem | T0077 should not redeem tickets. | Passed | No staff/admin redeem action was performed. |

## T0078 Existing-Booking Add-Product Payment Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Paid booking fixture | A paid existing booking for today's operating date can enter add-ons instead of ready QR. | Passed | Booking `5100926` was found as `Paid` and opened the add-ons step rather than a completed QR state. |
| Add-on quote | Selecting one mapped add-on should quote through JumpYard Cloud before draft/payment. | Passed | Selected one `Strumpor`; `POST /v1/bookings/5100926/add-products/quote` returned `quoted`, amount owing `45`, item count `1`, and mode `separate_draft_booking`. |
| Separate linked draft | Add-product should create a separate linked draft, not mutate the original booking. | Passed | `POST /v1/bookings/5100926/add-products` returned draft unique id `fe892301-95b7-490a-b4ad-dff311cfdd7f`, add-on group `jyao_32bbe440269649e7af`, link `jyl_77074c7ce26047b3b0`, and prepayment draft `jypd_529c13ed3a8a4d83a1`. |
| Card payment | The shared Roller/Adyen payment package should accept the approved test card path. | Passed | Secure Adyen card iframes accepted the Visa test card ending `1142`; JumpYard did not own raw card fields or print the full card number. |
| Original flow continuation | Approved add-product payment should continue the original check-in flow. | Passed | After `Betala 45,00 kr`, the phone app left add-product payment and showed the original booking safety-video step. |
| Scope safety | T0078 must not redeem tickets, change AWS resources, or expose secrets/PII. | Passed | No staff/admin redeem was performed, no AWS resources changed, and output stayed to safe booking/draft/link identifiers only. |
| Direct Aurora readback | Read-only Aurora state should be checked where practical. | Blocked | Local AWS SSO token for profile `wrlds-dev` had expired, so direct database readback was deferred. The safe API response still proved linked draft metadata. |

## T0079 Existing-Booking Add-Product UX Polish Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Backend syntax | Booking Lambda should parse after add-product contact-resolution changes. | Passed | `node --check infra/lambda/booking/index.js` passed locally. |
| Phone lint | Phone app should lint after add-product UX changes. | Passed with warnings | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing four `<img>` warnings. |
| Phone build | Phone app should build after add-product UX changes. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed; Next reported only the existing stale `baseline-browser-mapping` advisory. |
| Root validation | Source-of-truth docs should validate after T0079 updates. | Passed | `npm run validate` passed. |
| Diff whitespace | Diff whitespace check should pass. | Passed with CRLF notices | `git diff --check` passed; output contains Git line-ending notices only. |
| Local browser sanity | Phone app should load locally after UI changes. | Passed | In-app browser loaded `http://localhost:3000/?codexSmoke=t0079-local` and showed the expected start choices. |
| Server-side contact reuse | Add-product quote/draft can omit `customer` and resolve original booking contact server-side. | Code validated | T0079 routes add-product quote/draft through `resolveAddProductCustomer`; it combines Roller booking detail and Aurora `guest_profiles` and fails closed if required contact fields are missing. |
| Visible contact step | Existing-booking add-products should not ask the guest to re-enter contact details. | Code validated | Phone add-product flow now quotes directly after add-on selection and sends no `customer` payload for add-product quote/draft calls. |
| Payment-approved confirmation | Approved add-product payment should show a brief confirmation before continuing. | Code validated | `AddonsOffer` now shows an `APPROVED` state for about 1.2 seconds before continuing the original safety/check-in flow. |
| Postal-code scope | T0079 should not change Roller/Adyen postal-code behavior. | Passed by code review | No payment-package, Adyen field, or Roller postal-code configuration was changed. |
| Public deployed smoke | Public Cloudflare and deployed Lambda should be checked after merge/deploy. | Passed for backend | T0080 confirmed the deployed dev booking Lambda accepts an add-product quote without `customer` for booking `5100926` and resolves original contact server-side. Full browser rehearsal remains T0081. |

## T0080 Data/Webhook/Aurora Verification

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity | Local profile should confirm dev account and region before read-only AWS checks. | Passed | `aws sso login --profile wrlds-dev` succeeded with user-assisted browser login; `aws sts get-caller-identity` returned account `376129878018` in `eu-north-1`. |
| EventBridge Data API rule | Daily sync rule should be read and confirmed enabled. | Passed | `jumpyard-check-in-dev-data-api-daily-sync` is `ENABLED`, uses `cron(0 2 * * ? *)`, and targets `jumpyard-check-in-dev-stack-data-sync` with input `{"source":"eventbridge.daily"}`. |
| Aurora seed runs | Latest `jumpyard.booking_seed_runs` rows should be queried directly. | Passed | Latest scheduled run `2026-05-31 -> 2026-06-01` succeeded at `2026-06-01 02:00 UTC`, refreshed 491 products, enriched 33 product names, and had no error summary. Prior two scheduled runs also succeeded. |
| Webhook events | Recent `jumpyard.roller_webhook_events` rows should be queried directly. | Passed | Recent `Created` webhook events for `5100930`, `5100926`, and `5100877` are `processed`, each with one enrichment attempt and no error summary. |
| Public lookup for existing booking | Known recent booking should return from JumpYard Cloud/Aurora. | Passed | `POST /v1/check-in/lookup` for `5100930` returned `found`, `ready`, `source.system=jumpyard_cloud`, `lookupPath=aurora:booking_reference`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`. |
| Public lookup for add-product fixture | Known add-product smoke booking should return from JumpYard Cloud/Aurora. | Passed | `POST /v1/check-in/lookup` for `5100926` returned `found`, `ready`, `source.system=jumpyard_cloud`, `lookupPath=aurora:booking_reference`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`. |
| Public lookup for messaging fixture | Known messaging smoke booking should return from JumpYard Cloud/Aurora. | Passed | `POST /v1/check-in/lookup` for `5100877` returned `found`, `ready`, `source.system=jumpyard_cloud`, `lookupPath=aurora:booking_reference`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`. |
| Aurora smoke booking rows | Recent smoke bookings should have local item/ticket context. | Passed | Aurora rows for `5100930`, `5100926`, and `5100877` are `Paid`, `fresh`, and each has one booking item plus one ticket. The 2026-05-29 messaging fixture has one payment row; today's webhook/live-lookup fixtures currently have no Data API payment row yet. |
| Add-product draft row | Successful linked add-product payment should be visible as published. | Passed | Add-product draft `jypd_529c13ed3a8a4d83a1` for original booking `5100926` is `published`, `flow_type=add_product`, `amount_owing_cents=0`, and `payment_jwt_present=true`; retry drafts for `5100927`-`5100929` remain `payment_pending` as expected. |
| Backend deploy check | T0079 no-customer add-product quote should work in deployed dev. | Passed | Safe no-write quote for booking `5100926` omitted `customer`, returned `status=quoted`, `amountOwing=45`, mode `separate_draft_booking`, and `wroteBooking=false`. |
| Relevant alarms | Data sync, webhook, and Roller API alarms should be OK. | Passed | CloudWatch alarms `jumpyard-check-in-dev-data-sync-lambda-errors`, `jumpyard-check-in-dev-data-sync-lambda-throttles`, `jumpyard-check-in-dev-webhook-lambda-errors`, `jumpyard-check-in-dev-webhook-lambda-throttles`, and `jumpyard-check-in-dev-roller-api-errors` are `OK`. |

## T0081 Integrated Flow Rehearsal

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| New booking purchase | Public app should create and pay a Roller Playground booking by card. | Passed | Public Cloudflare flow created booking `5100963` for `2026-06-01 14:00`; Adyen Visa test card ending `1142` submitted and payment settled to `Paid`. |
| New booking check-in | Paid new booking should continue through safety and reach staff handoff. | Passed | Booking `5100963` completed safety video plus six safety confirmations and reached session `jycs_mpv4s30n_b9f8b58c`, handoff `JY7597`, status `ready_for_staff`. |
| Staff handoff visibility | Staff API should list/detail the ready handoff. | Passed | Staff auth returned a token; list/detail found booking `5100963`, one booking item, one selected ticket, handoff `JY7597`, and payment status `Paid`. |
| Staff-confirmed redeem | Dedicated smoke session should redeem through the staff route only. | Passed | `POST /v1/staff/check-in/sessions/jycs_mpv4s30n_b9f8b58c/redeem` returned `redeemed`, Roller status code `200`, and ticket `5100963-21683812`. |
| Aurora readback | Booking/session/ticket state should match the rehearsal. | Passed | Aurora shows `5100963` as `Paid` and `fresh`; session status is `redeemed`, handoff status `completed`, and ticket `5100963-21683812` is locally `redeemed`. |
| Webhook readback | Created booking webhook should be processed. | Passed | `jumpyard.roller_webhook_events` has processed `Created` events for `5100963` and `5100965` with one enrichment attempt and no error summary. |
| Fresh add-product source booking | A second paid booking should be available for add-product rehearsal without redeeming. | Passed | Public card flow created paid booking `5100965`; Aurora shows `Paid`, `fresh`, source `roller_webhook_enrichment`, session `guest_in_progress`, and ticket `5100965-21683813` unredeemed. |
| Add-product no-contact UX | Existing-booking add-product flow should not show duplicate contact fields. | Passed | Public flow for `5100965` entered add-ons, selected one `Strumpor`, reached `KONTROLLERA TILLÄGG`, and had zero visible contact-like inputs. |
| Add-product quote | Add-product quote should work without creating a draft. | Passed | Public/API quote for `5100965` returned `45 kr`, `mode=separate_draft_booking`, and `wroteBooking=false`. |
| Add-product confirmed draft | Add-product draft should be created and paid without duplicate contact entry. | Blocked | `RESERVERA TILLÄGG` failed with `customer.firstName is required for Roller draft booking creation` for `5100965`; direct API confirmed quote succeeds but confirmed create fails without full resolved customer data. Tracked as `FU-074`/T0082. |
| Legacy add-product contact gap | Older bookings without full customer context should fail closed. | Confirmed | Booking `5100926` also failed closed at confirmed add-product draft creation with `customer.firstName is required`, matching the intended no-invented-contact safety behavior. |

## T0082 Add-Product Contact Resolution

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Booking Lambda syntax | Booking Lambda should parse after contact-resolution changes. | Passed | `node --check infra/lambda/booking/index.js` passed. |
| Infra build | CDK TypeScript should compile after Lambda code changes. | Passed | `npm --prefix infra run build` passed. |
| Infra synth | Dev stack should synthesize with approved config. | Passed | `npm --prefix infra run synth:dev` passed after AWS preflight confirmed account `376129878018`, region `eu-north-1`. |
| Deploy scope | Pre-deploy CDK diff should be limited to booking Lambda code. | Passed | `npm --prefix infra run diff:dev` showed only `BookingHandler` Lambda code before deploy. |
| Dev deploy | Existing booking Lambda code should deploy without resource changes. | Passed | `npm --prefix infra run deploy:dev` passed. |
| Post-deploy diff | Dev stack should match local CDK after deploy. | Passed | `npm --prefix infra run diff:dev` showed no differences after deploy. |
| No-customer add-product draft | Confirmed draft creation should succeed without a guest-supplied `customer` payload when original contact exists server-side. | Passed | `POST /v1/bookings/5100965/add-products` created add-on draft `jypd_7d8379902449415aab`, link `jyl_7e8eac4758424c24bc`, and add-on group `jyao_f93769db16d840678e` without printing raw JWT or full contact values. |
| Aurora linked draft readback | Safe add-product draft/link rows should exist in Aurora. | Passed | `jumpyard.prepayment_booking_drafts` shows `flow_type=add_product`, `status=payment_pending`, `total_cents=4500`, and `payment_jwt_present=true`; `jumpyard.booking_links` shows `link_type=add_product_draft` for the same add-on group. |
| Browser payment re-test | Full public add-product card payment should be re-run after backend fix. | Deferred | Payment UI was not changed in T0082; T0078 already proved the linked add-product card payment path before contact removal, and T0082 proves the server-side draft blocker is resolved. |

## T0083 Staff Handoff Identity/Search

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Session Lambda syntax | Session Lambda should parse after staff identity/search changes. | Passed | `node --check infra/lambda/session/index.js` passed. |
| Booking Lambda syntax | Booking Lambda should parse after draft-name persistence changes. | Passed | `node --check infra/lambda/booking/index.js` passed. |
| Data sync Lambda syntax | Data sync Lambda should parse after customer first/last import changes. | Passed | `node --check infra/lambda/data-sync/index.js` passed. |
| Admin build | Staff/admin app should compile after API contract and UI changes. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Infra build | CDK TypeScript should compile after Lambda code changes. | Passed | `npm --prefix infra run build` passed. |
| Customer name source | Roller Data API should provide first and last name where available. | Passed | Read-only `/data/customers` shape check confirmed `firstName` and `lastName` fields are available; validation did not print full PII. |
| Related-data backfill | Today's customer rows should be refreshed into Aurora. | Passed | Scoped related-data import for `2026-06-01 -> 2026-06-02` upserted 11 tickets, 13 payments, and 11 customers without printing raw PII. |
| Aurora migration | Existing draft rows can store customer first/last name. | Passed | `npm --prefix infra run migrate:dev` applied `0008 prepayment draft customer names` and backfilled matched draft rows. |
| Infra synth | Dev stack should synthesize with approved config. | Passed | `npm --prefix infra run synth:dev` passed after AWS preflight confirmed account `376129878018`, region `eu-north-1`. |
| Deploy scope | Pre-deploy CDK diff should be limited to scoped Lambda code. | Passed | Staged `npm --prefix infra run diff:dev` runs showed only `DataSyncHandler`, `BookingHandler`, and `SessionHandler` Lambda code changes. |
| Dev deploy | Existing Lambda code should deploy without resource-shape changes. | Passed | `npm --prefix infra run deploy:dev` passed for the scoped Lambda code changes. |
| Post-deploy diff | Dev stack should match local CDK after deploy. | Passed | `npm --prefix infra run diff:dev` showed no differences after deploy. |
| Staff search smoke | Staff-authenticated list should search a ready handoff by safe identifiers. | Passed | Controlled ready-for-staff session for booking `5100965` was created without redeeming. Search by booking reference, first name, derived last-name value, and stored masked contact matched the session. |
| PII boundary | Staff API should not return raw email or raw phone fields. | Passed | Smoke response contained masked contact presence and confirmed raw `email`/`phone` fields were not returned. |
| Name availability | Staff UI should show booking/customer name when Aurora stores it. | Passed | Staff API smoke for `5100965` returned a two-part guest name and matched searches by first name plus derived last-name value without returning raw contact fields. |
| Ticket row readability | Staff UI should not lead ticket rows with opaque Roller item ids. | Passed | Admin build passed after ticket rows were changed to show product name first and ticket id as secondary context. |

## T0084 Staff One-Page Handoff UX

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Admin build | Staff/admin app should compile after one-page UX changes. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Phone build | Guest phone app should compile after the pulled-forward backup-code UI fix. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed; Next reported stale `baseline-browser-mapping` advisory warnings only. |
| Mobile default view | Phone-sized staff layout should show search/scan first and queue below when no handoff is selected. | Passed | In-app browser loaded `http://localhost:3002/?codexSmoke=t0084`; search/QR controls and empty queue state were visible. |
| Mobile selected view | Phone-sized staff layout should switch to a focused compact summary when a handoff is selected. | Passed | Browser smoke found 2 ready rows, opened the first detail, showed the focused summary with X/back, and returned to search/queue with both rows still visible. |
| Desktop ordering | Desktop staff layout should keep queue and detail visible together. | Code validated | Desktop keeps the existing two-column operational layout with queue/search on the left and the selected compact detail on the right. |
| Compact summary content | Staff summary should avoid repeated/low-value fields. | Code validated | The focused summary hides masked contact details, removes separate booking/safety tiles, removes the separate visible ticket list, and keeps date/time/payment plus compact product rows. |
| Browser smoke | Local admin app should load with the updated staff handoff surface. | Passed | In-app browser loaded `http://localhost:3002/?codexSmoke=t0084`; search/QR controls, queue label, two rows, focused detail, and X/back return were verified. |
| Guest backup-code UI | Guest ready-for-staff confirmation should not show a separate backup-code box. | Passed | `ConfirmationScreen.tsx` no longer renders `t.confirm.backupLabel`; local phone app loaded at `http://localhost:3000/?codexSmoke=backup-code-fix`. QR and main staff/pickup code remain. |
| Root validation | Source-of-truth files should validate after T0084 docs updates. | Passed | `npm run validate` passed. |
| Diff whitespace | Diff whitespace check should pass. | Passed with CRLF notices | `git diff --check` passed; output contains Git line-ending notices only. |
| Backend scope | T0084 should not change JumpYard Cloud, Roller, AWS, payment, SMS, or email behavior. | Passed by code review | Only the admin page component, one guest confirmation UI component, and source-of-truth docs are changed. |

## T0085 Staff Redeem Confirmation Polish

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Admin build | Staff/admin app should compile after success-confirmation changes. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Success confirmation state | A successful staff redeem should replace the detail panel with a large green confirmation. | Code validated | `RedeemSuccessPanel` renders from `redeemState='success'` plus a local safe confirmation object after the existing `redeemStaffSession` call succeeds. |
| Manual next step | After successful redeem, staff should explicitly choose whether to return to search/QR plus queue or scan the next QR. | Code validated | Success state no longer auto-returns. It exposes `Tillbaka till kön` and `Scanna ny QR`; both clear the selected handoff and search text, and the scan action opens the QR scanner. |
| Scope guard | T0085 should not change backend, AWS, Roller, payment, SMS, email, package, or asset behavior. | Code validated | Only admin page source and source-of-truth docs are changed. |
| Browser smoke | Local admin app should load after the success-confirmation changes. | Passed | In-app browser loaded `http://localhost:3002/?codexSmoke=t0085-manual-next-step` and showed the staff handoff app. No real redeem was run to avoid consuming a Playground ticket without a dedicated test handoff. |
| Root validation | Source-of-truth files should validate after T0085 docs updates. | Passed | `npm run validate` passed. |
| Diff whitespace | Diff whitespace check should pass. | Passed with CRLF notices | `git diff --check` passed; output contains Git line-ending notices only. |

## T0086 Guest/Admin UI Polish Pass

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone build | Guest phone app should compile after text/CSS polish. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed; Next reported the existing stale `baseline-browser-mapping` advisory warnings only. |
| Admin build | Staff/admin app should compile after CSS polish. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Backup-code source cleanup | Phone/admin active source should not contain backup-code labels or backup-code copy. | Code validated | Targeted `rg` over `jumpyard-checkin-phone/src` and `jumpyard-checkin-admin/src` returned no `backupLabel`, `Backupkod`, `Backup code`, `backupkoden`, or `backup code` matches. |
| Font artifact cleanup | Phone/admin global CSS should not contain unused historical font-stretch helpers. | Code validated | Removed `.font-stretch-expanded` from phone/admin globals; targeted `rg` returned no source matches for `font-stretch-expanded`, `Space Grotesk`, `next/font`, Google font imports, or font stylesheet imports. |
| Browser smoke | Phone and staff/admin apps should still load locally. | Passed | In-app browser loaded `http://localhost:3000/?codexSmoke=t0086` and `http://localhost:3002/?codexSmoke=t0086`; both app shells loaded. |
| Root validation | Source-of-truth files should validate after T0086 docs updates. | Passed | `npm run validate` passed. |
| Diff whitespace | Diff whitespace check should pass. | Passed with CRLF notices | `git diff --check` passed; output contains Git line-ending notices only. |
| Scope guard | T0086 should not change backend, AWS, Roller, payment, SMS, email, package, asset, or flow behavior. | Code validated | Only source-of-truth docs, phone translation/present-code text, and phone/admin global CSS are changed. |

## T0087 Staff Admin Cloudflare Deployment

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Admin static export | Staff/admin app should compile for Cloudflare Pages output. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed; output directory is `jumpyard-checkin-admin/out`. |
| Admin Pages settings | Cloudflare deployment settings should be explicit. | Code documented | `jumpyard-checkin-admin/README.md` defines project name `jumpyard-checkin-admin`, root directory, build command, output directory, public API env var, and smoke checklist. |
| Admin static headers | Static export should include Cloudflare headers. | Code validated | `jumpyard-checkin-admin/public/_headers` defines security headers and allows API calls to JumpYard Cloud dev API. |
| Dev CORS source config | Intended admin origin should be in source CORS config. | Passed | `infra/config/dev.json` and `infra/config/dev.example.json` include `https://jumpyard-checkin-admin.pages.dev`. |
| Infra synth | Dev stack should synthesize with the new CORS origin. | Passed | `npm --prefix infra run synth:dev` passed and rendered the dev stack with the new source CORS origin. |
| Cloudflare project existence | Public admin URL should exist before public smoke. | Passed | `curl -I https://jumpyard-checkin-admin.pages.dev` returned HTTP `200`, and the HTML response contained the staff login screen. |
| Cloudflare authentication | Wrangler should be authenticated before CLI deploy. | Blocked externally | `npx --yes wrangler whoami` reported not logged in. No Cloudflare credentials or tokens were stored. |
| AWS CORS deploy | Public admin URL should be allowed to call JumpYard Cloud staff APIs. | Passed | CDK diff showed only the admin origin added to API Gateway CORS, deploy passed, post-deploy diff showed no differences, and preflight returned the expected origin header. |
| Public admin smoke | Login, queue, search/QR, detail, and redeem should work on the public URL. | Passed | Public smoke on `https://jumpyard-checkin-admin.pages.dev` logged in, loaded one ready handoff, opened booking `5100992`/handoff `JY9056`, completed staff redeem, returned to an empty queue, accepted a search query, and opened QR scanner mode. |
| Root validation | Source-of-truth files should validate after T0087 docs updates. | Passed | `npm run validate` passed. |
| Diff whitespace | Diff whitespace check should pass. | Passed with CRLF notices | `git diff --check` passed; output contains Git line-ending notices only. |

## T0088 Real-Time Guest-Name Enrichment

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Official endpoint verification | Guest detail endpoint should be documented before implementation. | Passed | Official Roller docs page `Get guest detail` confirms read-only `GET /guests/{guestId}` and notes `guestId` is formerly/equivalent to `customerId`. |
| Lambda syntax | Webhook Lambda should parse after enrichment changes. | Passed | `node --check infra/lambda/webhook/index.js` passed. |
| Infra synth | Dev stack should synthesize after webhook code changes. | Passed | `npm --prefix infra run synth:dev` passed. |
| CDK diff guard | Deploy should only update webhook Lambda code. | Passed | `npm --prefix infra run diff:dev` showed only `WebhookHandler` Lambda code S3 key changed. |
| Dev deploy | Webhook enrichment change should be deployed to dev. | Passed | `npm --prefix infra run deploy:dev` passed on 2026-06-02. |
| Webhook smoke | Webhook should enrich a booking through booking detail plus guest-detail fallback. | Passed | Safe event for booking `5100965` returned `status=accepted`, `enrichmentStatus=processed`, `guestDetailStatus=available`, and `guestNamePresent=true` without raw PII output. |
| Aurora readback | Aurora should show linked guest identity state without printing PII. | Passed | Boolean-only query confirmed booking customer id, booking name flag, guest profile, first/last context, email, and phone were present. |
| Scope guard | T0088 should not change UI, migrations, SMS/email, payment, packages, assets, or Roller writes. | Passed | T0088 changes are limited to docs and `infra/lambda/webhook/index.js`; Roller calls are read-only. |

## T0089 Guest Messaging Production Unlock

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| SNS SMS sandbox check | Current SMS production state should be known without changing AWS. | Passed | `aws sns get-sms-sandbox-account-status` returned `IsInSandbox=true`. |
| SNS SMS attributes check | Current SMS sender/message/spend settings should be known. | Passed | `DefaultSMSType=Transactional`, `MonthlySpendLimit=1`, delivery status sampling `100`, no `DefaultSenderID`. |
| SES account check | Current email production state should be known. | Passed | `aws sesv2 get-account` returned `ProductionAccessEnabled=false`, `SendingEnabled=true`, quota `200/day` and `1/sec`. |
| SES identity check | Verified sender identities should be known. | Passed | `aws sesv2 list-email-identities` returned only `love@wrlds.com` as verified. |
| End User Messaging SMS check | Newer SMS service tier and sender resources should be known. | Passed | Account tier is `SANDBOX`; no Sender IDs, pools, or phone numbers; one verified dev destination phone exists. |
| Dedicated email config set check | Determine whether a project-specific SES configuration set exists. | Passed | `jumpyard-check-in-dev-email` was not found. |
| Production unlock doc | A future session should know the gates and missing inputs. | Documented | Added `GUEST_MESSAGING_PRODUCTION_UNLOCK.md`. |
| Scope guard | T0089 should not change code, resources, support cases, sender identities, or unattended sends. | Passed | Read-only AWS checks and documentation only; `confirmSend=false` remains unchanged. |

## T0090-T0093 Gift Card And Multi-Visit Code Edge Cases

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Gift card costs payload | Roller costs should accept `giftCards` without creating a booking. | Passed in T0090 | Invalid gift-card quote returned HTTP `200`, kept `amountOwing=200`, and included one `giftCardErrors` entry. |
| Gift card Data API source | Determine whether current Playground has gift-card records for tests. | Passed with active fixtures | `/data/giftcards` first returned HTTP `200` and zero records; after Venue Manager fixtures were created and paid it returned two rows for `5101043` and `5101044`. |
| Gift card full payment | A gift card that covers the full amount should produce a no-card-required booking path if Roller supports it. | Passed in deployed dev API | The `500 kr` fixture applied to a `200 kr` quote, reduced `amountOwing` to `0`, and created/published no-payment Roller booking `5101055` through JumpYard Cloud. |
| Gift card partial payment | A gift card that covers part of the amount should reduce the amount owing and send only the remainder to Roller/Adyen. | Passed in deployed dev API | The `100 kr` fixture applied to a `200 kr` quote and reduced `amountOwing` to `100`; public phone/payment continuation still needs T0092 after Cloudflare publishes T0091 UI. |
| Gift card fixture setup | Venue Manager can issue gift cards for controlled tests. | Passed | Use `Products > All products > Gift card product > Issue new gift card`; fixtures must be paid/active, not only created/reserved, before booking costs can apply them. |
| T0091 phone gift-card input | Buy-entry checkout should let guests optionally enter one gift-card number before quote/draft creation. | Passed locally | In-app browser reached the contact/payment group and confirmed the `Presentkort` input plus help text. |
| T0091 invalid gift-card UI | Invalid gift cards should show Roller-safe errors and block draft creation. | Backend passed; public UI smoke pending | Deployed quote returned one safe gift-card error and kept `amountOwing=200`; phone review code disables `Gå till betalning`. T0092 must prove visible public UI after merge. |
| T0091 partial gift-card checkout | Partial gift-card value should show applied value and render Roller/Adyen card payment for the remainder. | Backend passed; public UI smoke pending | Deployed quote with the active `100 kr` fixture returned `amountOwing=100` and `giftCardAppliedCount=1`. T0092 must prove visible public payment continuation after merge. |
| T0091 full gift-card checkout | Full gift-card value should skip card entry, publish no-payment draft, and sync the resulting booking into normal check-in. | Passed in deployed dev API | Deployed draft with the active `500 kr` fixture created Roller booking `5101055`, returned `amountOwing=0`, and stored the local prepayment draft as `published`. T0092 must prove the full public phone continuation after merge. |
| T0091 secret hygiene | Full gift-card numbers must not appear in logs, persisted Aurora state, or UI output after submission. | Passed by local code review/validation | Backend logs only counts/applied totals, redacts Roller errors, stores idempotency hashes, returns masked metadata only, and no UI state displays the full number after submission. |
| T0092 public phone UI publish | Public phone app should expose the T0091 `Presentkort` field before integrated smokes. | Passed after Cloudflare update | Public app reached buy-entry contact step on 2026-06-03 and showed the optional `Presentkort` field plus help text. The first attempt had been blocked by an old Cloudflare bundle. |
| T0092 invalid gift-card UI | Invalid gift card should show a safe Roller error and block draft/payment continuation. | Passed | Public phone flow showed `Gift card could not be applied`, kept total `200 kr`, and disabled `Gå till betalning`. |
| T0092 partial gift-card UI/payment | Partial gift card should reduce amount owing and render card payment for the remainder. | Passed | Active `100 kr` fixture reduced a `200 kr` booking to `100 kr`; Roller/Adyen payment rendered for `100 kr` with card, instalment, and Google Pay methods visible. |
| T0092 full gift-card no-payment continuation | Full-cover gift card should skip card payment and continue into normal check-in. | Passed | Full-cover fixture reduced a `200 kr` booking to `0 kr`, skipped card entry, and routed the public phone flow to `Säkerhetsvideo`. Roller Data API and JumpYard Cloud lookup verified paid booking `5101070` from fresh Aurora-backed state. |
| T0092 card-only regression | Normal no-gift-card buy-entry should still render card payment. | Passed | Public phone flow rendered Roller/Adyen payment for `200 kr` with card, instalment, and Google Pay methods visible. |
| T0092 direct Aurora readback | Direct RDS Data API should confirm persisted server state if AWS SSO is available. | Blocked externally | Local AWS SSO for `wrlds-dev` had expired. JumpYard Cloud lookup still verified booking `5101070` through `aurora:booking_reference` with freshness `fresh`. |
| T0092 root validation | Source-of-truth docs should validate after T0092 closure updates. | Passed | `npm run validate` passed on 2026-06-03. |
| T0092 diff whitespace | T0092 docs should pass whitespace validation. | Passed with CRLF notices | `git diff --check` passed on 2026-06-03; output contained Git line-ending notices only. |
| Multi-visit product discovery | Confirm whether multi-visit products exist in the catalog. | Passed in T0090 | Product catalog contains `membership` products for `10-Kort`, `20-Kort`, and `30-Kort`; selling `10-Kort` can be costed. |
| Multi-visit existing-pass discovery | Confirm whether existing passes are exposed through a documented guest/customer pass endpoint. | Blocked after membership fixture | `GET /customers/{customerId}/multi-passes` is reachable and returned HTTP `200` with zero balances for both a known booking customer and paid `10-Kort` customer `4045520`. |
| Multi-visit beta auto-apply smoke | Booking costs/draft should auto-apply an active beta multi-pass when the booking holder/email owns it and the cart has eligible session passes. | Deferred pending fixture | Help Center says Roller carts auto-apply this way; API behavior must be proven with a Playground guest/pass fixture before implementation. |
| Paid `10-Kort` auto-apply smoke | A paid membership-style `10-Kort` should reduce a normal entry quote only if Roller treats it as an applicable multi-pass. | Failed as multi-pass proof | Paid booking `5101046` bought `10-Kort`; costs with the same guest email kept `amountOwing=200` and returned empty `multiPassAllocations`. |
| Membership/multi-visit code costs smoke | A guest-entered Nacka membership or `10-Kort` code should be sent through the Roller-supported validation field and let Roller accept or reject it. | Passed in T0093 | `POST /bookings/draft/costs` with `discounts: [{ code }]` accepted the masked paid `10-Kort` ticket id from booking `5101046` as a 100% discount, reducing `amountOwing` from `200` to `0`; no booking/draft/write was created. |
| Membership invalid/no-effect code handling | A code should only be treated as accepted when Roller actually reduces amount owing or reports positive discount. | Passed in T0093 | Invalid code and non-code `10-Kort` candidate ids returned HTTP `200` but kept `amountOwing=200` and `discount=0`; Roller can echo a discount row even when it has no effect. |
| Membership normal-ticket comparison | A normal paid entry ticket id should not be mistaken for a reusable `10-Kort`/membership code. | Passed in T0093 | A normal paid entry ticket id from booking `5100965` kept `amountOwing=200`; the successful `10-Kort` ticket-code behavior is not generic for every paid ticket id. |
| Membership balance/allocation display | V1 should not display remaining visits unless public API data proves it. | Blocked by API data | The accepted `10-Kort` code returned `multiPassAllocations.allocations=[]`; `GET /customers/{customerId}/multi-passes` still returned zero balances for the paid `10-Kort` customer. |
| Multi-visit checkout smoke | A multi-visit case should flow through phone checkout, Aurora state, Roller state, check-in session, and staff redeem/eligibility without consuming the wrong ticket. | Deferred | Do not implement until Roller confirms API auto-apply behavior or provides a fixture; if relevant, RedemptionDetail should include expected `multiPass` proof after use/redeem. |

## T0097 Membership Discount-Code Discovery

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Official discount docs | Current Roller docs should identify the safe no-write discount validation path. | Passed | Roller Validate discount codes docs say that endpoint is being deprecated and Booking Costs should be used for discount validation instead. Create Discount Codes docs confirm discount-code configuration exists. |
| Paid `10-Kort` fixture | Existing Playground fixture should still be membership-like and paid. | Passed | `GET /bookings/5101046` returned `Paid`, total `1750`, customer id context, and membership-like markers without printing secrets or raw full code. |
| Multi-pass balance boundary | Current `10-Kort` fixture should not be treated as beta multi-pass unless the documented endpoint exposes a balance. | Passed as blocker | `GET /customers/4045520/multi-passes` returned HTTP `200` with `0` balances. |
| Baseline costs quote | One eligible entry without a code should cost normal money. | Passed | `POST /bookings/draft/costs` returned `total=200`, `amountOwing=200`, and `discount=0`. |
| Invalid code quote | No-effect code must not be treated as accepted. | Passed | Invalid code returned HTTP `200`, echoed a discount row, but kept `amountOwing=200` and `discount=0`. |
| Known `10-Kort` code quote | The known membership/ticket code should apply if Gustav's model is correct. | Passed | Masked paid `10-Kort` code sent as `discounts: [{ code }]` reduced one entry to `amountOwing=0`, `discount=200`, `percentOff=100`, with empty `multiPassAllocations`. |
| Quantity edge quote | Quantity behavior should be known before implementation. | Needs write proof | The same code reduced two entries to `amountOwing=0`, `discount=400`; T0098 must prove whether this consumes two uses or exposes a configuration risk. |
| Scope guard | T0097 should not create or mutate Roller or AWS state. | Passed | No bookings, drafts, payments, redemptions, Aurora writes, AWS resources, app code, Lambda code, migrations, secrets, or assets were changed. |
| Root validation | Source-of-truth docs should validate after T0097 docs updates. | Passed | `npm run validate` passed on 2026-06-03. |
| Diff whitespace | T0097 docs should pass whitespace validation. | Passed with CRLF notices | `git diff --check` passed on 2026-06-03; output contained Git line-ending notices only. |

## T0098 Controlled 10-Kort Consumption Smoke

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Pre-write fixture read | Existing `10-Kort` fixture should still resolve before the write smoke. | Passed | `GET /bookings/5101046` returned HTTP `200`, `Paid`, customer id `4045520`, and one masked candidate code. |
| Pre-write multi-pass balance | Current Nacka `10-Kort` should not be treated as beta multi-pass unless balance appears. | Passed as no-balance proof | `GET /customers/4045520/multi-passes` returned HTTP `200` with `0` balances. |
| Pre-write costs quote | The known code should still reduce a safe no-write quote before creating a booking. | Passed | One `200 kr` entry with `discounts: [{ code }]` returned `total=0`, `amountOwing=0`, and `discount=200`. |
| Controlled draft create | Exactly one dedicated Playground draft should be created only after the zero-owing quote proves safe. | Passed | `POST /bookings/draft` returned HTTP `201`, `amountOwing=0`, `discount=200`, and `paymentJwtPresent=true`; raw JWT and full code were not printed. |
| No-payment publish | A zero-owing draft should be publishable without card payment. | Passed | `POST /bookings/draft/publish` returned HTTP `201` and created booking `5101114`. |
| Published booking readback | The smoke booking should exist in Roller and be paid. | Passed | `GET /bookings/5101114` returned HTTP `200`, `Paid`, one item, and customer id present. |
| Post-write balance readback | Roller should expose a 10 -> 9 style balance if the current setup supports it. | Failed as balance proof | Both original customer and smoke-booking customer returned `0` balances from `GET /customers/{customerId}/multi-passes`; no remaining-use counter appeared. |
| Post-write quote quantity checks | A second safe quote should reveal whether the write reduced available uses. | Passed as no-balance/no-decrement proof | After publishing booking `5101114`, the same code still discounted quantity `1`, `2`, and `10` fully; quantity `11` left `amountOwing=200`, indicating a ten-entry per-transaction discount limit rather than exposed remaining balance. |
| Product coverage quotes | The `10-Kort` code should cover entry/session pass products but not unrelated add-ons if Gustav's description is correct. | Passed | Safe no-write quotes showed the code discounts representative `Entré 60 min` and `Entré 120 min` session pass variations, but does not discount JumpSocks, coffee/tea, or SkyRider add-ons. Mixed baskets left add-on amounts owing. |
| Two-person entry quote | Quantity should map to covered entry units inside a booking quote. | Passed | Two `120 min` entry units reduced `520 kr` to `0 kr`; two `120 min` entries plus two socks and two SkyRider add-ons reduced only the `520 kr` entry value and left `170 kr` owing. |
| Data API bookingitems readback | Data API should show at least discount evidence for the smoke booking. | Passed | `/data/bookingitems` found `5101114` as `Paid`, product `1765860`, quantity `1`, `bookingTotal=0`, `discountAmount=200`, and one discount code/id. |
| Data API membership redemptions | Membership redemption Data API should be checked as a possible readback source. | Blocked by Roller/API behavior | `/data/membershipredemptions` returned HTTP `400` with `startDate is required, endDate is required` even when parameters were supplied; needs Roller confirmation before use. |
| Balance UX decision | V1 should not show remaining visits unless public API proves it. | Passed | T0098 found no public 10 -> 9 signal; V1 should show only code accepted/rejected and amount reduction. |
| Root validation | Source-of-truth docs should validate after T0098 docs updates. | Passed | `npm run validate` passed on 2026-06-03. |
| Diff whitespace | T0098 docs should pass whitespace validation. | Passed with CRLF notices | `git diff --check` passed on 2026-06-03; output contained Git line-ending notices only. |

## T0099 Klippkort Code Checkout Implementation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone optional field | Buy-entry contact/payment step should expose a `Klippkort` field, not `10-Kort`. | Pending | Must cover 10-, 20-, and 30-card naming without promising remaining visits. |
| Invalid/no-effect code | A no-effect code should block continuation. | Pending | JumpYard Cloud should return a safe no-effect error when Roller does not reduce the amount due. |
| Entry-only accepted code | A valid code should reduce eligible entry/session pass amount and show the applied amount. | Pending | Full coverage should publish the no-payment Roller draft and continue into normal check-in sync. |
| Entry plus add-ons | A valid code should reduce only eligible entry amount and leave add-ons payable. | Pending | Add-ons such as socks, coffee, and SkyRider must remain in amount owing. |
| Remaining balance UX | UI should not show remaining uses. | Pending | No "10 kvar", "9 kvar", or local visit counter. |
| Secret/code handling | Raw klippkort codes should not be logged or persisted. | Pending | API response should use safe masked metadata and idempotency hashing should use code hashes only. |
| Root validation | Source-of-truth and root validation should pass after T0099. | Passed | `npm run validate` passed on 2026-06-03. |
| Phone build | Phone app should build after the new field and types. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed on 2026-06-03; output included existing baseline-browser-mapping age notices. |
| Booking Lambda syntax | Booking Lambda should remain syntactically valid. | Passed | `node --check infra/lambda/booking/index.js` passed on 2026-06-03. |
| Diff whitespace | T0099 diff should not contain whitespace errors. | Passed with CRLF notices | `git diff --check` passed on 2026-06-03; output contained Git line-ending notices only. |

## T0100 Klippkort Deploy And Integrated Smoke

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Ticket branch setup | Work should continue on `codex/t0100-klippkort-deploy-smoke` before deploy. | Passed | Branch `codex/t0100-klippkort-deploy-smoke` was created on 2026-06-04. |
| Local preflight | T0099 backend/frontend should still validate before deploy. | Passed | `node --check infra/lambda/booking/index.js`, `npm.cmd --prefix jumpyard-checkin-phone run build`, `npm.cmd --prefix infra run synth:dev`, `npm.cmd run validate`, and `git diff --check` passed on 2026-06-04. PowerShell blocked `npm.ps1`, so `npm.cmd` was used. |
| CDK diff guard | Dev deploy diff should show only booking Lambda code changes. | Passed | Pre-deploy `npm.cmd --prefix infra run diff:dev` showed only `BookingHandler` Lambda code; post-deploy diff showed no differences. |
| Booking Lambda deploy | T0099 booking Lambda changes should be deployed to AWS dev. | Passed | `npm.cmd --prefix infra run deploy:dev` passed on 2026-06-04 against AWS account `376129878018`, region `eu-north-1`. |
| Public phone publish | Public Cloudflare Pages bundle should expose optional `Klippkort`. | Passed | PR #99 merged to `main`; after Cloudflare publish, `https://jumpyard-check-in.pages.dev` assets contained `Klippkort`, `clipCard`, and `discountCodes`. |
| Invalid/no-effect code smoke | Flow should reject a no-effect `Klippkort` code and block continuation. | Passed | Public/dev API quote kept `amountOwing=200`, applied zero discount codes, and returned one safe discount-code error without printing the raw code. |
| Entry-only full coverage smoke | Valid entry-only code should reduce amount owing to zero, publish no-payment draft, and continue into check-in sync. | Passed | Dev API quote reduced `amountOwing` to `0`, `discount=200`, and Aurora event readback confirmed no-payment publish as Roller Playground booking `5101133`; public API smoke reconfirmed entry-only `amountOwing=0`. |
| Entry plus add-ons smoke | Valid code should cover eligible entry amount and leave add-ons payable. | Passed | Public/dev API mixed entry plus JumpSocks quote applied `discount=200` and left `amountOwing=45` for the add-on. |
| Normal/gift-card regression | No-code and gift-card flows should still work. | Passed in backend | Baseline no-code quote returned `amountOwing=200`; active masked `100 kr` gift card reduced `amountOwing` to `100` through `giftCards`, separate from `discountCodes`. |

## T0095 Integrated Regression Rehearsal

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Public phone app load | Public phone app should load from Cloudflare Pages. | Passed | `https://jumpyard-check-in.pages.dev/?codexSmoke=t0095-giftcard-field` loaded the buy-entry start screen with `Jag har en bokning` and `Köp entré`. |
| Buy-entry availability | Selecting a current time should load real product availability before product selection. | Passed | Public flow selected `14:30`; product step showed live remaining capacity such as `165 platser kvar` for jump-entry products. |
| Card-only payment surface | A normal no-gift-card checkout should still reach Roller/Adyen payment. | Passed | Existing public card-only payment URL showed `Kortbetalning`, `Delbetalning`, `Google Pay`, and `Swish` for `200 kr`. No payment was submitted in T0095. |
| Gift-card input | Buy-entry checkout should still expose optional gift-card entry. | Passed | Public contact step showed `Presentkort` with help text before quote/draft creation. |
| Invalid gift-card blocking | Invalid gift-card value should show a safe error and block payment continuation. | Passed | Public flow with a clearly invalid test value showed `Gift card could not be applied.`, kept total `200 kr`, and rendered `Gå till betalning` disabled. |
| Public staff/admin load | Public staff/admin app should load from Cloudflare Pages. | Passed | `https://jumpyard-checkin-admin.pages.dev/?codexSmoke=t0095-admin` loaded `JumpYard Check-in Personalhandoff`. |
| Staff/admin login and queue | Staff login should reach the operational queue without redeeming. | Passed | Logged in with the current dev staff code, reached `Sök`, `Skanna QR`, and `Kö`; queue was reachable and empty with `Inga handovers väntar.` |
| Destructive operations | T0095 should not create paid bookings, publish drafts, send messages, or redeem tickets. | Passed | No payment submission, no draft creation beyond quote/review progression, no SMS/email send, and no staff redeem were intentionally run. |
| Root validation | Source-of-truth files should validate after T0095 docs updates. | Passed | `npm run validate` passed on 2026-06-03. |
| Diff whitespace | T0095 docs should pass whitespace validation. | Passed with CRLF notices | `git diff --check` passed on 2026-06-03; output contained Git line-ending notices only. |

## T0096 Controlled Full Write/Redeem Rehearsal

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Public buy-entry booking | Public phone app should create exactly one dedicated normal buy-entry booking. | Passed | Public flow created booking `5101105` for `2026-06-03 14:30`, one `60 min entre`, no gift card, no membership/`10-Kort`, and safe test guest data. |
| Public payment | Payment should complete through the public allowlisted Playground payment flow. | Passed with method substitution | Roller/Adyen card fields rendered, but the in-app browser cannot type into cross-origin Adyen iframes. Swish was selected in the same payment package instead and completed the `200 kr` payment. |
| Roller/Data API readback | Paid booking should be visible from Roller Playground read APIs. | Passed | Local read-only Roller Data API `/data/bookingitems` for `2026-06-03 -> 2026-06-04` found booking `5101105` as `Paid`, `Api`, one item, product id `1765860`, created and modified on `2026-06-03`. |
| Aurora-backed lookup | JumpYard Cloud lookup should find the paid booking from server state. | Passed | `POST /v1/check-in/lookup` returned `found`, eligibility `ready`, `source.system=jumpyard_cloud`, `freshnessStatus=fresh`, and `refreshedFromRoller=false`. |
| Phone continuation | Paid booking should continue into the check-in/safety flow. | Passed to safety step | After successful payment, the public phone app showed `Betalning lyckades`, fetched the booking, and routed to `Sakerhetsvideo`. |
| Browser safety automation | Automated browser should complete the safety video if possible. | Blocked by browser automation | The video was loaded, but the in-app browser could not start/complete the HTML5 video or dispatch an `ended` event from this runtime. This is recorded as an automation limitation, not an app-code change request. |
| Ready-for-staff state | The same booking should become ready for staff with completed safety status. | Passed through server route | Because the browser could not finish the video, the same public guest session API was used to mark session `jycs_mpy1x4ne_910af158` ready for staff with safety status `completed`; handoff code `JY5397`. |
| Staff queue/detail | Staff/admin should see the ready handoff before redeem. | Passed through staff API | Staff-authenticated list/detail found booking `5101105`, session `jycs_mpy1x4ne_910af158`, status `ready_for_staff`, handoff status `ready_for_staff`. |
| Staff-confirmed redeem | The dedicated handoff should be redeemed once. | Passed | Staff-confirmed redeem returned `redeemed` and consumed one ticket for the dedicated booking only. |
| Public admin readback | Public staff/admin app should no longer show the completed handoff in queue. | Passed | Public admin loaded at `https://jumpyard-checkin-admin.pages.dev/?codexSmoke=t0096-admin-after-redeem`; queue count was `0` with `Inga handovers vantar.` |
| Queue after redeem | Completed handoff should no longer appear in staff list/search. | Passed | Staff API search for booking `5101105` after redeem returned `stillQueued=false`. |
| Scope guard | T0096 should not change app/source behavior or create unrelated writes. | Passed | Only one dedicated Playground booking/payment/redeem was created for this rehearsal; no app code, Lambda code, CDK resources, migrations, assets, deliverables, secrets, `.env`, SMS, or email behavior changed. |

## T0053 New-Booking Basket Before Payment Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Flow order | Buy-entry collects add-ons before contact, review, draft creation, and payment. | Passed | Browser smoke reached add-ons after quantity and before contact. |
| Combined basket quote | Quote request supports entry item plus selected mapped add-ons before draft creation. | Passed | Browser smoke selected 60 min entry plus one socks add-on; review showed both lines and Roller quote total `245 kr` without creating a draft. |
| Existing-booking add-product isolation | T0052 existing-booking add-product flow remains unchanged. | Passed | T0053 only touches buy-entry client flow and shared optional request flag; `AddonsOffer` was not changed. |
| Root validation | `npm run validate` passes after T0053 updates. | Passed | Passed on 2026-05-26. |
| Phone lint | `npm --prefix jumpyard-checkin-phone run lint` passes. | Passed with warnings | Passed on 2026-05-26 with the pre-existing four `<img>` warnings. |
| Phone build | `npm --prefix jumpyard-checkin-phone run build` passes. | Passed | Static export build passed; Next reported stale `baseline-browser-mapping` advisory warnings. |
| Local browser smoke | Local buy-entry review shows one basket before draft/payment. | Passed | Browser check on `http://localhost:3000/` showed `60 min entré`, `Strumpor`, and `Reservera bokning` on the review step. |
| Diff whitespace | `git diff --check` passes. | Passed | Passed on 2026-05-26; line-ending notices are Git CRLF warnings only. |

## T0101 Operational Monitoring And Runbooks

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Source docs | Required ticket docs and AWS workflow notes should be read before T0101 changes. | Passed | `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, and `skills/aws-project-infrastructure/` were reviewed. |
| Existing dashboard | Current dev operations dashboard should exist. | Passed | Read-only AWS check returned dashboard `jumpyard-check-in-dev-ops` in account `376129878018`, region `eu-north-1`. |
| Existing alarms | Current dev alarms should exist and not be firing. | Passed | Read-only AWS check returned 17 `jumpyard-check-in-dev-*` alarms, all in `OK`: API, Lambda, Roller API, DLQ, and API throttling. |
| Existing log groups | Main Lambda log groups should have retention configured. | Passed | Read-only AWS check returned lookup, booking, redeem, session, webhook, and data-sync log groups with 30-day retention. |
| Runbook coverage | Operational response should cover the current critical dev flows. | Passed | `OPERATIONS_RUNBOOK.md` covers Data API sync, webhook, booking quote/draft/payment, gift card/Klippkort, SMS/email, staff handoff/redeem, Aurora checks, safe first actions, and escalation routing. |
| AWS mutation scope | T0101 should not create or modify AWS resources. | Passed | No infra code changed; no CDK synth/diff/deploy was required. |
| Root validation | Source-of-truth docs should validate after T0101 updates. | Passed | `npm.cmd run validate` passed. |
| Diff whitespace | Diff whitespace check should pass. | Passed with CRLF notices | `git diff --check` passed; output contains Git line-ending notices only. |

## T0102 Phone Buy-Entry Demo Polish

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Ticket scope | T0102 should reflect the user-requested phone demo polish, not the previously planned alerting ticket. | Passed | `CODEX_TASK.md` was rewritten for the buy-entry UI polish scope. |
| Contact separation | Contact step should only collect contact fields. | Passed in build | Gift card and Klippkort inputs were removed from the contact step; phone label now has a phone icon. |
| Payment-code placement | Gift card and Klippkort should appear under payment/review before draft creation. | Passed in build | Review step now has a collapsible `Lägg till presentkort eller klippkort` section without subtitle. Editing code values marks the quote dirty and disables draft/payment until the amount is updated. |
| Summary polish | Basket rows should be compact, icon-led, and show clear jump time. | Passed in build | Review rows now use JumpYard icons per item, show `Hopptid`, and remove the old grey bottom time/total footer. |
| Branded loading | Time selection should show one branded loading state while capacity loads. | Passed in build | Availability loading now renders a JumpYard icon card with capacity-loading copy instead of making all time rows show loading. |
| Payment icon and copy | Payment surfaces should use the JumpYard payment-card icon without redundant payment headings. | Passed in build | `RollerPaymentDropIn` and pending payment state now use `payment-card`; the outer payment screen no longer repeats `Betala` plus amount above the drop-in. |
| Phone lint | Phone app lint should pass. | Passed with existing warnings | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing four `<img>` warnings. |
| Phone build | Phone app build should pass. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed; output included existing `baseline-browser-mapping` age notices. |
| Local render smoke | Local phone app should render after changes. | Passed | Local dev server returned HTTP 200 and Playwright CLI screenshot after a 5s wait rendered the start screen. Direct click-through was not automated because there is no route into internal buy substeps and the in-app browser tool was unavailable in this run. |

## T0103 SkyRider Availability Gate

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Ticket scope | T0103 should be the narrowed SkyRider gate, not the broad dynamic add-on catalog. | Passed | The broader add-on catalog is deferred until Gustav confirms which Roller products should be guest-facing. |
| Roller shape check | Roller SkyRider availability should be readable from the Playground product availability endpoint. | Passed | Read-only check against parent product `1765442` returned HTTP `200`; SkyRider uses an all-day availability shape instead of entry-style sessions. |
| Availability response | JumpYard Cloud availability should include SkyRider alongside entry/family products. | Pending deploy smoke | The booking Lambda now loads the SkyRider parent product and includes it in the same Roller availability request. |
| Add-on UI gate | Phone add-ons should show SkyRider only when availability is valid for the selected date/time. | Passed in build | The phone app hides SkyRider when availability is missing, closed, or zero. |
| Add-on quantity cap | SkyRider quantity should be capped by returned finite capacity and selected jumper count. | Passed in build | If Roller returns unlimited/null capacity, the cap remains selected jumper count. |
| Quote/draft safety | Entry and SkyRider should be server-validated, while stock add-ons should not fail availability validation. | Passed in build | Phone items now carry `requiresAvailability`; the booking Lambda validates only explicitly flagged capacity-bound items. |
| Booking Lambda syntax | Booking Lambda should remain syntactically valid. | Passed | `node --check infra/lambda/booking/index.js` passed on 2026-06-04. |
| Phone lint | Phone app lint should pass. | Passed with existing warnings | `npm --prefix jumpyard-checkin-phone run lint` passed with the pre-existing four `<img>` warnings. |
| Phone build | Phone app build should pass. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0103 updates. | Passed | `npm run validate` passed on 2026-06-04. |

## T0105 Existing Booking Add-on UI Cleanup

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Ticket scope | T0105 should stay frontend-only and not change Roller, AWS, Aurora, payments, or redemption logic. | Passed | Only phone UI components, translations, and docs changed. T0106 handles SkyRider consent timing; T0107 handles linked add-ons in staff/handoff; T0108 handles the full demo regression smoke. |
| Booking summary hint | Existing-booking summary should not say the next step is safety video. | Passed | Removed the visible `timeHint` line from `BookingSummary`. |
| Existing add-on catalog | Existing-booking add-on picker should hide future unsupported items. | Passed | `Connected` and `extra person` are filtered out; stock add-ons and SkyRider stay in scope. |
| Add-on review polish | Existing-booking add-on review should use one back affordance, product icons, clear payment-forward CTA copy, and no check icon in the CTA. | Passed | Removed the internal duplicate back link, added JumpYard icons to review rows, changed CTA to `Gå till betalning`, and removed the CTA check icon. |
| Ready-for-staff handout | Guest final screen should show the actual entry product to collect, not generic wristband copy. | Passed | First staff handout row now uses `booking.productLabel` when available. Linked add-on products in staff/handoff remain T0107. |
| Local app smoke | Phone app should load locally after changes. | Passed | In-app browser loaded `http://localhost:3010/?codexSmoke=t0105` and showed the park choice screen. Full booking/session smoke deferred to T0108 to avoid creating extra backend session state during this UI-only ticket. |
| Phone lint | Phone app lint should pass after changes. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings only. |
| Phone build | Phone app build should pass after changes. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |

## T0106 SkyRider Consent Before Payment

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Buy-entry SkyRider consent | Selecting SkyRider in buy-entry should show the height requirement before contact/review/payment. | Passed | Internal buy-entry step now routes `ADDONS -> SKYRIDER_ATTEST -> CONTACT`, so no quote/draft/payment call is reachable before confirmation. |
| Existing-booking SkyRider consent | Selecting SkyRider as an add-on to an existing booking should show the height requirement before add-on quote/review/payment. | Passed | Internal add-on step now routes `SELECT -> SKYRIDER_ATTEST -> REVIEW`, and quote/draft/payment stay after confirmation. |
| Duplicate consent guard | Existing-booking SkyRider add-on should not show the parent SkyRider consent again after payment. | Passed | Add-on completion now passes `skyriderHeightConfirmed=true`, and parent flow skips duplicate `APP_SKYRIDER_ATTEST`. |
| Local browser smoke | Local phone app should prove the SkyRider gate visually when the API is reachable. | Blocked | Local app loaded, but availability returned `Could not reach JumpYard Cloud`; public smoke should run after deploy or with a working local API base URL. |
| Phone lint | Phone app lint should pass after changes. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings only. |
| Phone build | Phone app build should pass after changes. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |

## T0107 Linked Add-ons In Staff Handoff

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Staff detail item source | Staff session detail should return original booking items and paid/published linked add-on items. | Passed in code | `findStaffBookingItems` now unions original items with linked add-on booking items when the linked draft is `published` or the linked booking is paid/no-payment-required. |
| Pending add-on exclusion | Staff session detail should not show unpaid/payment-pending linked add-ons. | Passed in code | Linked rows are filtered by local draft status or settled linked Roller booking state. |
| Admin add-on display | Admin handoff product rows should visibly mark linked add-on rows. | Passed in build | Admin `ItemRows` marks linked rows as `Tillägg` and uses the add-ons icon while keeping original entry rows as admission rows. |
| Redeem behavior | Staff redeem should remain ticket/session based and not treat stock-only add-ons as selected tickets. | Passed by scope | T0107 does not change selected ticket ids, redeem eligibility, or redeem Lambda behavior. |
| Session Lambda syntax | Session Lambda should remain syntactically valid. | Passed | `node --check infra/lambda/session/index.js` passed on 2026-06-08. |
| Admin lint | Admin app lint should pass after changes. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed. |
| Admin build | Admin app build should pass after changes. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Root validation | Source-of-truth docs should validate after T0107 updates. | Passed | `npm run validate` passed on 2026-06-08. |

## T0108 Gustav Demo Regression Smoke

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity | Dev deploy/checks should target the approved dev account. | Passed | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`. |
| Infra build | CDK TypeScript should compile before deploy. | Passed | `npm --prefix infra run build` passed. |
| CDK synth | Dev stack should synthesize with approved dev config. | Passed | `npm --prefix infra run synth:dev` passed. |
| CDK diff guard | Deploy should only change the T0107 session Lambda code. | Passed | Pre-deploy `npm --prefix infra run diff:dev` showed only `SessionHandler` Lambda `Code` S3 key changing. |
| Dev deploy | T0107 behavior should be live in AWS dev. | Passed | `npm --prefix infra run deploy:dev` completed with stack `UPDATE_COMPLETE`. |
| Post-deploy diff | Stack should be clean after deploy. | Passed | `npm --prefix infra run diff:dev` showed no differences. |
| Public pages | Guest and staff Cloudflare apps should respond. | Passed | `https://jumpyard-check-in.pages.dev/?codexSmoke=t0108` and `https://jumpyard-checkin-admin.pages.dev/?codexSmoke=t0108` both returned HTTP `200`. |
| Availability | JumpYard Cloud should return real availability including SkyRider. | Passed | `POST /v1/bookings/availability` for `2026-06-09` and `11:30`, `12:00`, `16:00` returned 3 slots, 21 products, entry rows, add-on rows, and 3 available SkyRider rows. |
| Staff auth/list/detail | Staff API should authenticate and return the ready queue/detail. | Passed | Staff login returned `authenticated`; list returned 1 ready session; detail returned `ready_for_staff`. Secret passcode was read from AWS internally and not printed. |
| Linked add-ons in staff detail | T0107 linked add-on rows should appear from deployed staff detail. | Passed | The first ready staff detail returned 5 item rows, including 4 rows with `fulfillmentSource='linked_add_on'`, and 1 selected ticket. |
| CloudWatch alarms | Current dev alarms should not be firing before demo. | Passed | All 17 `jumpyard-check-in-dev-*` alarms returned `OK`. |
| Aurora health | Data API and webhook should show recent healthy activity. | Passed | Aurora Data API readback showed 2 recent successful seed runs and 8 recent processed webhook events in the last 48 hours. |
| Demo runbook | Gustav demo case order should exist in the repo. | Passed | Added `GUSTAV_DEMO_RUNBOOK.md` with public URLs, demo order, talking points, and current health checks. |

## T0109 SkyRider Consent Timing Hardening

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Buy-entry visible gate | Selecting SkyRider in a new buy-entry basket should show 100 cm approval immediately after add-ons. | Passed in code | `continueFromAddons` still routes `ADDONS -> SKYRIDER_ATTEST -> CONTACT` when SkyRider is selected without approval. |
| Buy-entry side-effect guard | Buy-entry quote/draft/payment should not run if SkyRider approval is missing. | Passed in code | `goToReview` and `createDraft` now re-check the approval and route back to `SKYRIDER_ATTEST` before calling JumpYard Cloud. |
| Existing-booking visible gate | Adding SkyRider to an existing booking should show 100 cm approval immediately after add-ons. | Passed in code | `handleSelectContinue` still routes `SELECT -> SKYRIDER_ATTEST -> REVIEW` when newly selected SkyRider lacks approval. |
| Existing-booking side-effect guard | Add-product quote/draft/payment should not run if SkyRider approval is missing. | Passed in code | `goToReview` and `createDraft` now re-check the approval before `quoteAddProducts` or `createAddProductDraft`. |
| Phone lint | Phone app lint should pass after changes. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app build should pass after changes. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0109 updates. | Passed | `npm run validate` passed on 2026-06-08. |
| Scoped diff check | T0109 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |
| Local browser smoke | Local phone UI should visually reach the SkyRider gate when JumpYard Cloud is reachable. | Blocked | Temporary dev server at `http://127.0.0.1:3012/?codexSmoke=t0109` reached buy-entry time selection, but local availability returned `Could not reach JumpYard Cloud`, matching the earlier T0106 local browser blocker. |

## T0110 Staff Handoff Row Polish

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Compact handout rows | Staff "Att lämna ut" rows should not show grey child product/time subtitles. | Passed in code | `ItemRows` now renders product name, linked add-on badge, and quantity only. |
| Product icons | Common handout products should use matching JumpYard icons. | Passed in code | Product text now maps entry/family/SkyRider/socks/padlock/coffee to the closest JumpYard icon with a safe fallback. |
| Redeem panel copy | Staff detail should not show the server-side final-check explanatory text. | Passed in code | The copy below "Slutför check-in" was removed; redeem behavior is unchanged. |
| Admin lint | Admin app lint should pass after row polish. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed on 2026-06-08. |
| Admin build | Admin app should build with the added product icon assets. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed on 2026-06-08. |
| Root validation | Source-of-truth docs should validate after T0110 updates. | Passed | `npm run validate` passed on 2026-06-08. |
| Scoped diff check | T0110 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |
| Local admin smoke | Admin app should render after adding product icon assets. | Passed | Temporary admin dev server at `http://127.0.0.1:3013/?codexSmoke=t0110` rendered login with no missing images, then the test server was stopped. |

## T0111 Capacity Loading-State Polish

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Loading card text | Capacity/availability loading should show the required guest text. | Passed in browser | Playwright-core smoke intercepted `/v1/bookings/availability`, delayed the response, and confirmed the visible loading card text `HÄMTAR TILLGÄNGLIGA PLATSER`. |
| Loading spinner | Capacity/availability loading should show a spinner or animation. | Passed in browser | The same smoke confirmed `[data-availability-loading="true"]` rendered with an `.animate-spin` element. |
| Phone lint | Phone app lint should pass after T0111. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0111. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0111 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Local HTTP smoke | Local phone dev app should serve during visual validation. | Passed | Temporary phone dev server at `http://127.0.0.1:3014/?codexSmoke=t0111` returned HTTP `200`; Playwright-core smoke then exercised the buy-entry loading state. |

## T0112 Add-on Price Consistency

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Shared price/config source | Buy-entry and existing-booking add-on components should not define separate duplicate price/product-id literals. | Passed in code | `BuyTickets.tsx` and `AddonsOffer.tsx` now read add-on price/config metadata from `jumpyard-checkin-phone/src/flow/addonCatalog.ts`. |
| Duplicate price literal search | Old component-local add-on price/product-id literals should be gone from both components. | Passed | `rg` found add-on price/product-id literals only in `addonCatalog.ts`, not in `BuyTickets.tsx` or `AddonsOffer.tsx`. |
| Buy-entry price smoke | Selection, local total, and review should agree for selected add-ons. | Passed in browser | Playwright-core smoke mocked availability/quote, selected socks and coffee, and confirmed selection had `Strumpor 40 kr`, `Kaffe 35 kr`, local total `275 kr`, and review/payment-prep had the same rows plus `Att betala 275 kr`. |
| Phone lint | Phone app lint should pass after T0112. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0112. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0112 updates. | Passed | `npm run validate` passed on 2026-06-09. |

## T0113 Dynamic Add-on Prices

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Frontend static price removal | Phone add-on catalog/components should not contain the old static add-on price literals. | Passed | `rg` found no `45/40/35/179` add-on price literals or `config.price` reads in `addonCatalog.ts`, `BuyTickets.tsx`, or `AddonsOffer.tsx`. |
| Booking Lambda syntax | Booking Lambda should remain syntactically valid before deploy. | Passed | `node --check infra/lambda/booking/index.js` passed on 2026-06-09. |
| Phone lint | Phone app lint should pass after T0113. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0113. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Buy-entry dynamic price smoke | Buy-entry add-on selection and review should use prices returned by JumpYard Cloud availability. | Passed in browser | Playwright-core smoke mocked availability prices `socks=51`, `coffee=37`, selected both, and confirmed selection/review total `288 kr` with old `40 kr`/`35 kr` values absent. |
| Existing-booking dynamic price smoke | Existing-booking add-ons should load dynamic prices before purchase controls are enabled. | Passed in browser | Playwright-core smoke mocked lookup/session/availability and confirmed add-on list showed `Strumpor 51 kr`, `Kaffe 37 kr`, and `Hänglås 44 kr` with old static prices absent. |
| AWS identity | Dev deploy must target WRLDS dev account and region. | Passed | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`; region is `eu-north-1`. |
| Infra build/synth | CDK should compile and synthesize with approved dev config. | Passed | `npm --prefix infra run build` and `npm --prefix infra run synth:dev` passed. |
| CDK diff | Deploy should only change existing booking Lambda code. | Passed | Pre-deploy `npm --prefix infra run diff:dev` showed only `BookingHandler` Lambda `Code` S3 key changing. |
| Dev deploy | AWS dev stack should update successfully. | Passed | `npm --prefix infra run deploy:dev` completed with CloudFormation `UPDATE_COMPLETE`. |
| Post-deploy diff | Deployed stack should match local template. | Passed | Post-deploy `npm --prefix infra run diff:dev` showed no differences. |
| Deployed availability prices | Public dev API should return Roller-derived add-on prices. | Passed | `POST /v1/bookings/availability` for `2026-06-09 14:30` returned `skyrider=40`, `socks=45`, `lock=45`, and `coffee=35` with product ids present. |

## T0114 Customer-Friendly Product Names

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Add-on label mapping | Known internal Roller add-on names should be cleaned before phone UI display. | Passed in code | `cloudClient.ts` maps known add-on ids to customer labels including `Bryggkaffe`, `Strumpor`, `Hänglås`, and `SkyRider`; `Coffee and tea` names are explicitly normalized to `Bryggkaffe`. |
| Existing-booking summary smoke | Existing add-ons should not show `Coffee and tea Sweden` in guest summary. | Passed in browser | Local in-app browser smoke used a mock JumpYard Cloud lookup containing parent product `Coffee and tea Sweden`; booking summary showed `Bryggkaffe x1` and did not contain the internal name. |
| Phone lint | Phone app lint should pass after T0114. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0114. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0114 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0114 files should have no whitespace errors. | Passed | Scoped `git diff --check -- CODEX_TASK.md jumpyard-checkin-phone/src/flow/cloudClient.ts` passed; Git printed CRLF conversion notices only. |

## T0115 Existing Add-on Back Navigation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Review back target | The visible top back button should return from existing-booking add-on review to add-on selection. | Passed in browser | In-app browser smoke used mocked lookup/session/availability/quote, selected socks, reached add-on review, pressed `Tillbaka`, and stayed in `APP_ADDONS` with the socks selection row visible and no booking summary/review visible. |
| Selection back target | The visible top back button should still return from add-on selection to booking summary. | Passed in browser | The same mocked flow pressed `Tillbaka` from add-on selection and returned to `APP_BOOKING` with booking summary visible. |
| Phone lint | Phone app lint should pass after T0115. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0115. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0115 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0115 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |

## T0116 Add-on Quantity Rules

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Shared quantity metadata | Padlocks and SkyRider should no longer be frontend-capped at one per guest/jumper. | Passed in code | `ADDON_CATALOG_CONFIG.lock.maxPerGuest` and `ADDON_CATALOG_CONFIG.skyrider.maxPerGuest` are now `4`; socks/coffee remain unchanged and future hidden add-ons stay hidden by the existing catalog lists. |
| SkyRider capacity gating | SkyRider should still use the existing availability/capacity gate. | Passed in code | `skyrider.requiresAvailability` remains `true`, so `BuyTickets` still clamps by availability capacity and existing-booking add-product payloads still mark SkyRider as availability-bound. |
| Price/payment scope | Quantity rule changes should not alter prices, product ids, or payment payload shape. | Passed in code | Only `maxPerGuest` values changed in `addonCatalog.ts`; `rollerProductId`, dynamic price reads, quote/draft item shape, and payment code are unchanged. |
| Phone lint | Phone app lint should pass after T0116. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0116. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0116 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Browser smoke | Padlock and SkyRider increment controls should allow quantity above one when availability allows it. | Passed in browser | Local phone app at `http://127.0.0.1:3016/?codexSmoke=t0116mock` used a mock JumpYard Cloud availability response; with one jumper, SkyRider and Hänglås both incremented to `2`, and the add-on total updated to `370 kr`. |

## T0117 SkyRider Information

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Height requirement copy | SkyRider consent should clearly show the minimum 100 cm requirement. | Passed in browser | Local browser smoke confirmed the SkyRider consent screen shows `Minst 100 cm`. |
| Safety check copy | SkyRider consent should explain that staff performs a safety check before the ride. | Passed in browser | Local browser smoke confirmed the SkyRider consent screen shows `Säkerhetscheck`. |
| Timing recommendation copy | SkyRider consent should recommend using SkyRider after jump time. | Passed in browser | Local browser smoke confirmed the SkyRider consent screen shows `Åk efter hopptiden`. |
| Consent gate | Continue should stay disabled until the guest confirms the SkyRider requirement. | Passed in browser | Local browser smoke confirmed the continue button is disabled before confirmation and enabled after clicking the checkbox. |
| Phone lint | Phone app lint should pass after T0117. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0117. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0117 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0117 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |

## T0118 Gift-card/Klippkort CTA Copy

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Gift-card-only CTA | Editing only the gift-card field should show `Applicera presentkort`. | Passed in browser | Local browser smoke reached buy-entry review with a mock quote, typed a gift-card value, and confirmed the dirty payment-options CTA changed to `Applicera presentkort`. |
| Klippkort-only CTA | Editing only the Klippkort field should show `Applicera klippkort`. | Passed in browser | Local browser smoke reached buy-entry review with a mock quote, typed a Klippkort value, and confirmed the dirty payment-options CTA changed to `Applicera klippkort`. |
| Old CTA removal | The old payment-options apply CTA should no longer appear in the guest UI. | Passed in browser | Local browser smoke confirmed `Uppdatera belopp` was not visible in the gift-card-only or Klippkort-only dirty states. |
| Quote refresh scope | The apply CTA should still use the existing quote-refresh handler. | Passed in code | `BuyTickets.tsx` still calls `goToReview()` from the payment-options dirty-state button; only the button label changed. |
| Phone lint | Phone app lint should pass after T0118. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0118. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0118 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0118 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |

## T0119 Gift-card/Klippkort Input Validation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Input max length | Gift-card and Klippkort fields should not accept more than 32 characters. | Passed in browser | Local browser smoke at `http://127.0.0.1:3019/?codexSmoke=t0119` confirmed both fields clamp typed/pasted values to 32 characters and expose `maxlength=32`. |
| Ready feedback | Entered but unapplied payment-option codes should show a clear ready-to-apply state. | Passed in browser | Browser smoke confirmed dirty Klippkort input shows `Redo att applicera` and stays `aria-invalid=false` before quote errors exist. |
| Done feedback | Applied codes with no refreshed quote errors should show a clear done state. | Passed in browser | Browser smoke confirmed a mocked accepted gift-card quote changes the gift-card feedback to `Klart` and removes the dirty apply button. |
| Rejected feedback | Codes rejected by refreshed quote should show an error state only after quote errors exist. | Passed in browser | Browser smoke confirmed a mocked rejected Klippkort quote changes feedback to `Ej godkänt` and sets `aria-invalid=true`. |
| Quote/draft scope | Input feedback should not change quote/draft payload shape or backend validation. | Passed in code | `buildGiftCardInputs` and `buildDiscountCodeInputs` still return the same `giftCards` and `discountCodes` payload shapes; T0119 only clamps the stored input value and changes UI feedback. |
| Phone lint | Phone app lint should pass after T0119. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings only. |
| Phone build | Phone app should build after T0119. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0119 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0119 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |

## T0120 Human-Readable Staff Dates

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Staff date formatter | A date such as `2026-08-06` should render as `6 aug`. | Passed in browser | Local admin browser smoke at `http://localhost:3020/?codexSmoke=t0120c` with a mock staff API confirmed staff-facing date labels use `6 aug`. |
| Staff date/time formatter | A timestamp such as `2026-08-06T08:30:00.000Z` should render with the same readable date style. | Passed in browser | Browser smoke confirmed the ready timestamp shows `Redo: 6 aug 10:30`, not a raw numeric date. |
| Missing or invalid dates | Missing dates should render as `-`, and unparseable values should fall back to the raw value. | Passed in code | `formatDate` and `formatDateTime` preserve `-` for missing values and return the original value when parsing fails. |
| Staff list row | Handoff queue rows should show the human-readable visit date. | Passed in browser | Browser smoke confirmed the mocked queue row contains `6 aug`. |
| Staff detail tile | Selected handoff detail should show the same human-readable date in the `Datum` tile. | Passed in browser | Browser smoke confirmed the selected mocked detail contains `6 aug` and no raw `2026-08-06` date. |
| Scope guard | Date display should not change staff API contracts, auth, redeem, sorting, filtering, or handout logic. | Passed in code | Only `formatDate`, `formatDateTime`, and docs changed; staff API calls and detail/list flow remain unchanged. |
| Admin lint | Admin app lint should pass after T0120. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed. |
| Admin build | Admin app should build after T0120. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Root validation | Source-of-truth docs should validate after T0120 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0120 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |

## T0121 Staff Date-Box Layout

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Narrow staff detail date tile | The selected handoff detail `Datum` tile should display a date such as `6 aug` without broken wrapping or overlap on a phone-sized viewport. | Passed in browser | Local admin browser smoke at `http://localhost:3021/?codexSmoke=t0121` with a mock staff API and narrow viewport confirmed the date tile displays `6 aug` cleanly and stays within its tile. |
| Responsive metadata layout | Date/time/payment metadata tiles should stack on narrow staff/admin viewports and return to three columns on wider viewports. | Passed in browser | Browser smoke confirmed the detail metadata grid uses one column on the narrow viewport and three columns after switching to a wider viewport. |
| Date formatting scope | The visual layout fix should preserve T0120 date formatting behavior. | Passed in code | `formatDate` and `formatDateTime` are unchanged; only metadata tile layout classes and no-wrap value classes changed. |
| Staff flow scope | The visual layout fix should not change staff API, auth, redeem, sorting, filtering, or handout behavior. | Passed in code | Only `InfoTile`, the selected handoff metadata grid, and docs changed; staff API calls and action handlers remain unchanged. |
| Admin lint | Admin app lint should pass after T0121. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed. |
| Admin build | Admin app should build after T0121. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Root validation | Source-of-truth docs should validate after T0121 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0121 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |

## T0122 Staff Handout-List Grouping

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Check-in handout section | Visitor wristbands, socks, padlocks, and SkyRider passes should appear under `Lämna ut vid incheckning`. | Passed in browser | Local admin browser smoke at `http://localhost:3022/?codexSmoke=t0122` with a mock staff API confirmed the check-in section contains `Besöksband`, `Strumpor`, `Hänglås`, and `SkyRider-pass`. |
| Later collection section | Coffee should appear separately as a later collection item. | Passed in browser | Browser smoke confirmed `Kaffe` appears under `Hämtas efter hoppet` and not in the check-in handout section. |
| Unknown item visibility | Products that do not match known handout categories should remain visible for staff review. | Passed in browser | Browser smoke confirmed an unmatched mock product appears under `Övrigt i bokningen`. |
| Linked add-on badge | Linked add-on rows should still expose the add-on badge where relevant. | Passed in browser | Browser smoke confirmed linked add-on categories display `Tillägg`. |
| Staff flow scope | The grouping fix should not change staff API, auth, redeem, sorting, filtering, or backend handout behavior. | Passed in code | Only staff/admin grouping helpers, handout list rendering, and docs changed; staff API calls and action handlers remain unchanged. |
| Admin lint | Admin app lint should pass after T0122. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed. |
| Admin build | Admin app should build after T0122. | Passed | `npm --prefix jumpyard-checkin-admin run build` passed. |
| Root validation | Source-of-truth docs should validate after T0122 updates. | Passed | `npm run validate` passed on 2026-06-09. |
| Scoped diff check | T0122 files should have no whitespace errors. | Passed | Scoped `git diff --check` passed; Git printed CRLF conversion notices only. |

## T0123 Payment Heading And Back Navigation

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Payment heading | The payment method/drop-in page should show `Betalning`, not `Kortbetalning`. | Passed | `paymentMethodTitle` now renders `Betalning` for Swedish and `Payment` for English; code search confirms no remaining phone translation value of `Kortbetalning` for the payment step. |
| Back from payment | Pressing the visible back control from the payment method/drop-in step should return to the buy-entry review/payment-prep summary. | Passed | `BuyTickets` now maps `PAYMENT` back to `REVIEW` instead of calling the parent `onBack`. |
| State preservation | Returning from payment should preserve selected date/time, entry quantity, add-ons, contact fields, quote, and payment-option inputs where possible. | Passed | The back path changes only the local `step`, so existing selected product, quantity, add-ons, customer, quote, and payment option state remains in the mounted component. |
| Browser smoke | Browser or equivalent smoke should confirm the payment/back behavior in the buy-entry payment flow. | Passed | In-app browser at `http://127.0.0.1:3024/` used a local mock JumpYard Cloud API on `4023`, reached the payment step without Roller writes, showed no `Kortbetalning`, returned to `Sammanställning` with `Hopptid 10:00`, `60 min entré`, `1 st`, and `180 kr`, then re-entered payment again. |
| Scope guard | T0123 should not change quote/draft/payment API payloads, backend source, AWS resources, Roller writes, staff/admin, kiosk, redeem, SMS, or email behavior. | Passed | Scoped diff is limited to phone UI copy/navigation plus source-of-truth docs. No backend, vendor, AWS, staff/admin, kiosk, or Roller write path changed. |
| Phone lint | Phone app lint should pass after T0123. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings. |
| Phone build | Phone app should build after T0123. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed; Next still reports the existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0123 updates. | Passed | `npm run validate` passed. |

## T0124 Rejected Gift-card/Klippkort Clearing

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Clear rejected gift card | After a rejected gift-card attempt, clearing the gift-card field should allow normal no-code checkout. | Passed in browser | Local in-app browser smoke at `http://127.0.0.1:3025/` used a mock API on `4024`, rejected `BADGIFT`, confirmed checkout was blocked while non-empty, cleared the field, and proceeded to payment with a draft request containing `giftCards: []`. |
| Clear rejected Klippkort | After a rejected Klippkort attempt, clearing the Klippkort field should allow normal no-code checkout. | Passed in browser | The same smoke rejected `BADCLIP`, confirmed checkout was blocked while non-empty, cleared the field, and the mock API recorded a second no-code draft request with `discountCodes: []`. |
| Non-empty rejected code still blocks | A non-empty code that was rejected by the refreshed quote should still block draft/payment continuation until removed or replaced. | Passed in browser | Both rejected states set the field invalid and disabled `Gå till betalning` until the rejected value was removed. |
| Valid replacement | Replacing a rejected code with a valid gift card or Klippkort and applying it should allow checkout according to the refreshed quote. | Passed in code | The accepted-code path still runs through the existing quote refresh handler; T0124 only changed dirty/error gating so a successful refreshed quote clears the field-specific dirty state as before. |
| Scope guard | T0124 should not change Roller payload shape, backend source, AWS resources, staff/admin, kiosk, redeem, SMS, or email behavior. | Passed | Scoped implementation is limited to phone payment-option state and docs. Mock draft logs confirmed empty cleared fields are omitted as empty arrays, with no backend/API shape changes. |
| Phone lint | Phone app lint should pass after T0124. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with the existing four `<img>` warnings. |
| Phone build | Phone app should build after T0124. | Passed | `npm --prefix jumpyard-checkin-phone run build` passed; Next still reports the existing `baseline-browser-mapping` age notices. |
| Root validation | Source-of-truth docs should validate after T0124 updates. | Passed | `npm run validate` passed. |

## T0125 SkyRider Check-In Handout Correction

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| Phone confirmation grouping | SkyRider should appear in the phone confirmation staff handout list. | Passed | Component contract check confirmed `skyrider` is in `HANDOUT_IDS` with the zipline handout icon. Local browser flow with a mock paid booking confirmed SkyRider is present in the selected add-ons before the safety-video gate. |
| Phone other-addons exclusion | SkyRider should not appear in the phone confirmation other/later add-ons group. | Passed | Component contract check confirmed `skyrider` is no longer in `EXPERIENCE_IDS`; coffee remains in the other/later add-on set. |
| Admin grouping restored | SkyRider should appear under `Lämna ut vid incheckning` in admin. | Passed in browser | Local in-app browser smoke at `http://127.0.0.1:3031/` used a mock JumpYard Cloud API on `4031`; `data-handout-category="skyrider"` appeared in `handout-section-checkin` and not in `handout-section-later`. |
| Existing categories preserved | Socks, padlocks, visitor wristbands, and SkyRider remain check-in handouts; coffee remains later collection. | Passed in browser | Admin browser smoke confirmed check-in contains visitor wristband, socks, padlock, and SkyRider groups; later collection still contains coffee; unknown products remain under `Övrigt i bokningen`. |
| Scope guard | T0125 correction should not change staff API contracts, backend source, redeem behavior, Roller writes, payment logic, AWS resources, SMS, or email behavior. | Passed | Scoped implementation is limited to phone/admin frontend grouping and docs. Browser smoke used a local mock API only. |
| Phone lint/build | Phone app lint and build should pass after the correction. | Passed | `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings; `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` notices. |
| Admin lint/build | Admin app lint and build should pass after the correction. | Passed | `npm --prefix jumpyard-checkin-admin run lint` passed; `npm --prefix jumpyard-checkin-admin run build` passed. |
| Root validation | Source-of-truth docs should validate after the correction. | Passed | `npm run validate` passed. |

## T0104 SkyRider Availability Deploy

| Scenario | Expected Result | Status | Notes |
|---|---|---|---|
| AWS identity | Deploy must target WRLDS dev account and region. | Passed | `aws sts get-caller-identity --profile wrlds-dev` returned account `376129878018`; region is `eu-north-1`. |
| Booking Lambda syntax | Booking Lambda should remain syntactically valid before deploy. | Passed | `node --check infra/lambda/booking/index.js` passed on 2026-06-08. |
| Infra build | CDK TypeScript should compile before deploy. | Passed | `npm --prefix infra run build` passed. |
| CDK synth | Dev stack should synthesize with approved dev config. | Passed | `npm --prefix infra run synth:dev` passed after running CDK commands sequentially. |
| CDK diff | Deploy should only change booking Lambda code. | Passed | `npm --prefix infra run diff:dev` showed only `BookingHandler` Lambda `Code` S3 key changing. |
| Dev deploy | AWS dev stack should update successfully. | Passed | `npm --prefix infra run deploy:dev` completed with CloudFormation `UPDATE_COMPLETE`. |
| Deployed availability | Public API should return SkyRider as an add-on. | Passed | `POST /v1/bookings/availability` for `2026-06-08` and slots `09:00`, `09:30`, `10:00`, `10:30`, `11:00`, and `16:00` returned product types `addon,entry,family` and product key `skyrider` in each slot. |
| SkyRider product id | Deployed availability should map SkyRider to the child product used by quote/draft. | Passed | Returned `skyrider` rows have `productId=1765443` and product name `SkyRider 1 åk`. |



## Archived REPO_CURRENT_STATE.md Known Validation Commands

This section preserves the long validation-command table that T0128 removed from the active repo snapshot.

## Known Validation Commands

| Command | Purpose | Notes |
|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files, current ticket consistency, skills, AWS tags, and `REPO_CURRENT_STATE.md` snapshot/table consistency. | Fails if snapshot completed tickets disagree with the Completed Tickets table, if snapshot current ticket disagrees with the Current Ticket table, if `CODEX_TASK.md` disagrees with the active ticket state, or if completed tickets remain in Current/Confirmed Next state. |
| `node scripts/validate-current-ticket.js` | Confirm `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` point to the same active ticket state. | Added in T0127; catches stale active-ticket mismatches without calling GitHub, AWS, Roller, or the network. |
| `npm run infra:check` | Type-check and synthesize the deploy-blocked CDK foundation with example config. | Added in T0004; does not deploy or require AWS credentials. |
| `npm run infra:synth` | Synthesize the JumpYard Cloud CDK stack with `infra/config/dev.example.json`. | Added in T0004; example config is not approved for deploy. |
| `npm --prefix infra run synth:dev` | Synthesize the confirmed T0006 dev stack. | Uses `infra/config/dev.json`. |
| `npm --prefix infra run diff:dev` | Review AWS dev changes before deploy. | Must show only approved ticket-scoped resources/code changes. If CDK cannot read the SSO profile directly, export temporary profile credentials into the shell process before running CDK. |
| `npm --prefix infra run deploy:dev` | Deploy the approved dev foundation. | Run only after account `376129878018` and region `eu-north-1` are verified. |
| `node --check infra/lambda/booking/index.js` | Confirm booking Lambda JavaScript syntax. | Added in T0031. |
| `node --check infra/lambda/lookup/index.js` | Confirm lookup Lambda JavaScript syntax. | Used by T0056 payment draft reconciliation. |
| `node --check infra/lambda/webhook/index.js` | Confirm webhook Lambda JavaScript syntax. | Used by T0056 payment draft reconciliation. |
| `npm --prefix infra run register:webhook:dev` | Dry-run Roller Playground booking webhook registration for the dev endpoint. | Reads AWS SSM/Secrets Manager config, validates Playground, and does not print secrets. |
| `npm --prefix infra run register:webhook:dev:apply` | Register the Roller Playground booking webhook for the dev endpoint. | Requires `ROLLER_WEBHOOK_REGISTER_ALLOW_WRITE=I_UNDERSTAND_THIS_REGISTERS_PLAYGROUND_WEBHOOK`; creates no duplicate when the webhook already exists. |
| `npm --prefix infra run migrate:dev:status` | Show applied/pending Aurora migrations for dev. | Uses Aurora Data API and the `/jumpyard-check-in-dev/aurora/admin` secret; does not print secrets. |
| `npm --prefix infra run migrate:dev` | Apply pending Aurora migrations to dev. | Run only after AWS account `376129878018` and region `eu-north-1` are verified. |
| `npm --prefix infra run import:bookingitems:dev` | Dry-run Roller Data API `/data/bookingitems` normalization for dev Aurora import. | Reads local `.env`, calls Roller Playground, and performs no Aurora writes. |
| `npm --prefix infra run import:bookingitems:dev:apply` | Apply Roller Data API `/data/bookingitems` import into dev Aurora. | Requires `ROLLER_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_BOOKINGITEMS`; verify AWS account and region first. |
| `npm --prefix infra run import:products:dev` | Dry-run Roller REST `/products` normalization for dev Aurora product cache import. | Reads local `.env`, calls Roller Playground, and performs no Aurora writes. |
| `npm --prefix infra run import:products:dev:apply` | Apply Roller product cache import and booking item enrichment into dev Aurora. | Requires `ROLLER_PRODUCT_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_PRODUCTS`; verify AWS account and region first. |
| `npm --prefix infra run import:related-data:dev` | Dry-run Roller Data API tickets, payments, and customers normalization for dev Aurora import. | Reads local `.env`, calls Roller Playground, and performs no Aurora writes. |
| `npm --prefix infra run import:related-data:dev:apply` | Apply Roller related Data API source import into dev Aurora. | Requires `ROLLER_RELATED_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_RELATED_DATA`; verify AWS account and region first. |
| `npm --prefix infra run import:data-api-backfill:dev` | Dry-run all current Roller Data API import sources over explicit daily modified-date windows. | Requires explicit start/end dates, e.g. `-- 2026-05-20 2026-05-21`; runs bookingitems, related data, and product refresh without Aurora writes. |
| `npm --prefix infra run import:data-api-backfill:dev:apply` | Apply all current Roller Data API import sources over explicit daily modified-date windows. | Requires `ROLLER_DATA_BACKFILL_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_DATA_API_BACKFILL`; child import write guards are set internally. |
| `npm --prefix infra audit` | Audit infra dependencies. | Currently reports one moderate bundled `brace-expansion` issue inside `aws-cdk-lib`; automatic fix unavailable. |
| `npm run roller:env:check` | Validate Roller env guard against current environment variables. | Requires `ROLLER_ENV=playground` and a Playground-looking `ROLLER_BASE_URL`; client credentials are optional. |
| `npm run roller:smoke` | Verify local Roller Playground credentials with an OAuth token request and one read-only smoke request. | Loads local `.env`; does not print secrets or full Roller responses. |
| `npm run roller:data:smoke` | Verify local Roller Data API `/data/bookingitems` access and safe response shape. | Loads local `.env`; uses modified-date window defaults and does not print secrets, tokens, customer names, emails, or phone numbers. |
| `npm run roller:payment:discover` | Dry-run the Roller Playground new-booking payment discovery path. | Loads local `.env`, validates Playground, reads products, selects a jump/session product, and creates no booking. |
| `npm run roller:payment:discover:apply-draft` | Create one guarded Roller Playground draft booking for payment discovery. | Requires `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_DRAFT_BOOKING`; does not print secrets, access tokens, or raw payment JWTs. |
| `npm run roller:payment:poc` | Run the T0032 JumpYard Cloud payment-package POC preflight. | Calls deployed `POST /v1/bookings/quote`, creates no booking, and reports package/origin/test-card blockers without printing secrets or raw JWTs. |
| `npm run roller:payment:poc:apply-draft` | Create one guarded Playground draft through JumpYard Cloud for payment-package POC. | Requires `ROLLER_PAYMENT_POC_ALLOW_DRAFT=I_UNDERSTAND_THIS_CREATES_PLAYGROUND_DRAFT_BOOKING`; does not print secrets or raw payment JWTs. |
| `npm run roller:payment:readiness` | Run the T0050 Roller Payments readiness check. | Reads local `.env`, validates Playground credentials, checks `GET /venues/me` payment settings, checks the public test origin and Roller docs page, and creates no bookings, drafts, payments, AWS resources, or Aurora rows. |
| Deployed `POST /v1/bookings/availability` | Load Roller Playground product availability through JumpYard Cloud. | Used by the phone buy-entry flow; the frontend still never calls Roller directly. |
| Deployed `POST /v1/check-in/session-links/send-sms` | Manually create and send guest check-in SMS links. | Protected by the check-in link dev token; confirmed sends return safe provider diagnostics and still respect SNS sandbox limits. |
| Deployed `POST /v1/check-in/session-links/send-due-sms` | Plan or manually confirm booking-time SMS sends from Aurora booking time windows. | Protected by the check-in link dev token; planning mode sends no SMS, and confirmed sends still respect SNS sandbox limits. |
| Deployed `POST /v1/check-in/session-links/send-due-messages` | Plan or manually confirm booking-time guest messages for SMS and email from one due-booking processor. | Protected by the check-in link dev token for manual calls; EventBridge invokes it internally in planning mode with `confirmSend=false`. |
| `npm run roller:seed:playground` | Plan deterministic Roller Playground seed bookings. | Dry-run by default; no booking writes. |
| `npm run roller:seed:playground:apply` | Create deterministic Roller Playground seed bookings. | Writes only when `ROLLER_SEED_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_BOOKINGS` is set and the Playground guard passes. |
| Read-only `GET /bookings/{bookingReference}` | Verify known Playground booking lookup behavior. | Run through the existing Roller client helper; do not print secrets or raw PII. |
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-phone && npm run build` | Build phone app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Existing app command; not required unless app code changes. |
| `cd jumpyard-checkin-admin && npm run build` | Build admin app. | Existing app command; not required unless app code changes. |
