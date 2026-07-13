# T0193 Park-Test API Protection

## Plain-Language Outcome

Park-test now has a layered lock on every API route without treating a busy shared park Wi-Fi address as an attacker. Guests can still open a check-in link, look up a booking, buy entry, add products, complete safety, and hand over to staff. Sensitive follow-on actions now require a short-lived proof tied to the booking or session, staff routes enforce the existing staff token, Roller webhook routes enforce the registered shared token, and six operational routes additionally require AWS IAM signing before Lambda can run.

The protection was deployed only to the existing park-test stack and matching phone Pages project. It created no AWS resource, did not touch production, did not enable webhook processing or unattended messaging, and did not perform a real Roller booking, payment, add-on, redeem, or guest-message write.

## Implemented Boundary

### Explicit route catalog

CDK now defines all 21 HTTP API routes in one protection catalog. Every route has an explicit handler, trust class, API Gateway authorization type, rate, burst, detailed metrics setting, and stage dependency.

Six service-only routes use `AWS_IAM` at API Gateway and keep their application token as a second lock:

- `POST /v1/check-in/session-links`;
- `POST /v1/check-in/session-links/send-sms`;
- `POST /v1/check-in/session-links/send-email`;
- `POST /v1/check-in/session-links/send-due-sms`;
- `POST /v1/check-in/session-links/send-due-messages`; and
- `POST /v1/check-in/redeem`.

The other 15 routes explicitly use `NONE` at API Gateway because they must be reachable by a guest browser, staff browser, or Roller. They are protected in the application layer according to their caller class rather than left unauthenticated by accident.

### Guest access proof

A successful scoped lookup now returns a 32-byte opaque guest credential. Only its SHA-256 hash is stored in the existing `jumpyard.checkin_tokens` table. The credential lasts at most 60 minutes, is tied to the booking, is carried as a Bearer token in memory, and is required before session start, ready-for-staff, existing-booking add-on quote, or existing-booking add-on write can mutate or expose scoped state.

Opening an SMS, email, manual, or dev check-in link reuses that link's raw opaque value as the guest credential after a valid open. It never extends past the original link expiry. Resolution has an atomic five-second per-token cooldown, and link-open audit refresh is bounded to reduce Aurora/log amplification. The phone captures the token and immediately removes `jy_token`/`token` from the visible URL; it never stores the token in local storage or session storage. One bounded retry handles transient network/5xx failure after URL cleanup.

Manual lookup has a steady-state soft cap of 64 active `guest_access` credentials per booking. Existing valid credentials are not evicted, so one person's repeated lookup cannot invalidate another guest already in progress. Final token retention, purge, and any stricter serialization belong to T0195.

### Staff, webhook, and legacy controls

- Staff list, detail, and redeem continue to require the server-verified short-lived HMAC staff token. Missing, forged, and expired token paths fail before Aurora or Roller work. T0194 still owns personal identity, roles, MFA/session policy, revocation, and named audit ownership.
- Webhook routes require the configured Roller token. Missing or wrong tokens receive an HTTP `200` ignored response so Roller is not driven into a retry storm; the valid token currently reaches only `ignored_disabled` because processing remains off for T0197.
- The lower-level legacy redeem route now requires both AWS IAM and its service/dev token even for plan-only calls. The normal user flow remains the staff-session redeem route.

### Request and log safety

Decoded request-body ceilings are enforced before AWS, Aurora, Roller, or write side effects:

| Handler | Limit |
|---|---:|
| Lookup | 8 KiB |
| Booking/availability/quote/draft/add-on | 64 KiB |
| Session, staff, and link operations | 32 KiB |
| Legacy and staff redeem | 32 KiB |
| Roller webhook | 256 KiB |

Normal oversized API requests return `413 payload_too_large`. Oversized webhook deliveries retain the existing safe HTTP `200` invalid/ignored behavior. Correlation ids are accepted only when they match the bounded safe character allowlist, and auth/login logs contain structured event/correlation fields rather than credentials or submitted payloads.

## Shared-Wi-Fi Capacity Model

Protection is route-based and credential-based, not a simplistic per-IP limiter. API Gateway uses a default fallback of 50 requests/second with burst 150 plus explicit route settings from 1/5 on internal routes up to 40/100 on guest token/session routes.

The deterministic T0193 model passed:

- 120 guest flows over 20 minutes;
- 1,652 modeled HTTP requests including browser preflight requests;
- 702 requests in the busiest five-minute interval;
- 40 devices and 208 guest/preflight requests in the first two seconds;
- mixed lookup, check-in, add-on, payment, and staff activity behind one public IP;
- zero protection-caused modeled `429` responses; and
- a synthetic abusive pattern with 30,912 of 41,400 requests throttled while unrelated route buckets remained available.

These aggregate route buckets are best-effort API protection, not a hard summed global 50 requests/second ceiling. They also do not solve Roller's separate one-request-per-second credential constraint; `FU-013`, T0196, and T0204 retain that upstream capacity work.

## Edge-Control Decision

T0193 did not add WAF or CloudFront. The current endpoint is API Gateway HTTP API, which does not provide the same direct WAF association as the REST API shape. Putting CloudFront in front would remain bypassable while the default `execute-api` endpoint is open. T0199 must decide the custom-domain/origin/default-endpoint topology before an edge layer can be meaningful. This avoided a new resource, cost, false confidence, and shared-IP false positives in T0193.

## Deployment And Readback

| Check | Result |
|---|---|
| AWS target | Account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack` |
| CloudFormation | `UPDATE_COMPLETE`; 134 resources; no resource added, removed, or replaced |
| API route readback | 21 routes: exactly 6 `AWS_IAM`, 15 explicit `NONE` |
| Stage readback | Default rate/burst `50/150`; 21 route-specific settings present |
| Runtime gates | Full flow on for Nacka `50871`, `2026-06-29` through `2026-09-30`; webhook processing `false`; guest-message sends `false` |
| Safe deployed smokes | CORS `204`; unsigned internal `403`; signed internal missing/wrong app proof `401`; signed valid app proof reaches `400 identifier_required`; guest missing proof `401`; staff missing/wrong proof `403`; webhook missing/wrong ignored with `200`; valid webhook token reaches `ignored_disabled`; oversized lookup `413` |
| Post-deploy diff | No differences |
| Phone Pages | Current build deployed to `jumpyard-check-in-park-test`; stable and immutable deployment URLs return HTTP `200` |

The phone deployment generated immutable URL `https://c5b9d4db.jumpyard-check-in-park-test.pages.dev`; the stable URL remains `https://jumpyard-check-in-park-test.pages.dev`.

## Validation

- `npm run validate`
- `npm run infra:check`
- `npm --prefix jumpyard-checkin-phone run build` with the park-test API target
- `npx tsc --noEmit` in `jumpyard-checkin-phone`
- scoped phone lint with the single pre-existing `<img>` warning and zero errors
- `node scripts/validate-t0193-api-protection.js`
- `node scripts/validate-t0193-capacity.js`
- `node scripts/validate-t0193-guest-access.js`
- `node scripts/validate-t0193-payload-limits.js`
- `node scripts/validate-t0193-service-auth.js`
- `npm --prefix infra run diff:park-test-full-flow-rehearsal`
- deployed AWS/Cloudflare readback and non-write smokes described above
- `git diff --check`

## Rollback And Remaining Scope

The immediate containment command remains `npm --prefix infra run deploy:park-test`; it closes the Live full-flow gates while retaining the security controls. A prior phone Pages deployment can be restored through Cloudflare. Reproducible previous-code artifact rollback remains T0198 work.

T0193 deliberately leaves these items for their approved tickets:

- T0194: personal staff identity, roles, MFA/session/revoke policy, and named audit actor;
- T0195: guest-token cleanup/retention, secret rotation, least privilege, backup, and restore;
- T0196/T0204: Roller upstream one-request-per-second workload control and full rehearsal;
- T0197: webhook verification policy, processing, idempotency, replay, and reconciliation;
- T0199/T0205: custom-domain/default-endpoint topology and any meaningful WAF/edge layer; and
- T0202: production alert routing and security/traffic operating thresholds.

## Result

T0193 is complete on 2026-07-13. Park-test and its phone client now use the same layered API protection model, legitimate shared-Wi-Fi arrival waves remain supported, and production remains untouched.
