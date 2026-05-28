# JumpYard API Protection Boundary

This file is the T0062 source-of-truth design for how JumpYard Cloud routes should be protected before staging/live exposure.

## Status

- Ticket: `T0062`
- Scope: documentation and route-boundary design only
- AWS resources changed: none
- App behavior changed: none
- Current dev baseline: explicit CORS origins, API Gateway stage throttling at rate `25` requests/second and burst `50`, API access logs without bodies, CloudWatch alarms/dashboard, and app-level staff/dev/webhook tokens on selected routes
- Current API Gateway route auth: all routes still use `AuthorizationType=NONE`; protection is currently enforced by CORS, stage throttling, request validation, app-level tokens, staff tokens, webhook tokens, and Lambda business rules

## Boundary Classes

| Class | Meaning | Live posture |
|---|---|---|
| `guest_public` | Browser/mobile guest route that must be reachable without a staff login. | Keep public, but bound with strict CORS, route-specific throttling, WAF or equivalent edge controls, payload validation, idempotency for writes, and no sensitive data in errors. |
| `guest_token` | Guest route that should be reached through an opaque JumpYard token or server-owned session id. | Keep public only for token/session resolution; never trust booking reference alone as authority. |
| `guest_write` | Guest route that can create Roller/JumpYard state. | Keep public only with strict validation, idempotency, lower route-specific limits, payment/session context where applicable, and server-side Roller credentials only. |
| `staff_auth_entry` | Staff login or identity bootstrap route. | Public entrypoint, but heavily rate-limited and WAF-protected; replace dev passcode model before live if final staff identity is ready. |
| `staff_protected` | Staff/admin route that must require a short-lived staff token or production identity. | Require staff identity at the API boundary before staging/live. |
| `internal_ops` | Operational route for scheduled jobs, admin tooling, or controlled dev actions. | Do not leave generally public for staging/live; protect with IAM, an internal authorizer, private automation, or remove the public route. |
| `roller_webhook` | External route called by Roller. | Allow only Roller-authenticated delivery, optional Roller IP allowlisting, fast acknowledge, idempotency, and async enrichment if latency requires it. |
| `legacy_dev_only` | Route useful for lower-level dev testing but not for normal product flow. | Remove, disable, or lock behind internal-only protection before staging/live. |

## Route Inventory

| Route | Class | Current dev guard | Target staging/live boundary |
|---|---|---|---|
| `POST /v1/check-in/lookup` | `guest_public` | CORS allow-list, stage throttle, request validation, Aurora-first lookup, Roller refresh only when needed. | Public guest lookup can remain open, but add route-specific rate limits, WAF or equivalent edge rules, abuse detection for repeated misses, and no full PII in responses/logs. |
| `POST /v1/bookings/availability` | `guest_public` | CORS allow-list, stage throttle, server-side Roller availability call, no writes. | Public, but route-specific limits and optional short cache should protect Roller capacity endpoints from bursts. |
| `POST /v1/bookings/quote` | `guest_public` | CORS allow-list, stage throttle, server-side Roller cost quote, no booking creation. | Public, but lower route-specific limits than static reads; validate items and session times server-side. |
| `POST /v1/bookings/draft` | `guest_write` | Requires `confirmDraft=true`, idempotency key, server-side Roller draft creation, response-only payment JWT. | Public checkout write, but require idempotency, strict payload validation, WAF/edge controls, lower write limits, and safe payment-package-only JWT handling. |
| `POST /v1/bookings/{bookingReference}/add-products/quote` | `guest_public` | CORS allow-list, stage throttle, server-side add-product quote, no booking creation. | Public only after a valid original booking/session context; route-specific limits and validation must prevent enumeration by booking reference. |
| `POST /v1/bookings/{bookingReference}/add-products` | `guest_write` | Creates separate linked add-product draft with idempotency and server-side Roller credentials. | Public write only after valid session/original-booking context, strict validation, idempotency, lower write limits, and payment-package-only JWT handling. |
| `POST /v1/check-in/session-links/resolve` | `guest_token` | Public opaque `jy_token` resolution, token hash lookup, session start/resume. | Keep public, but only accept opaque token; rate-limit tightly and avoid exposing whether a booking exists beyond safe token states. |
| `POST /v1/check-in/sessions` | `guest_token` | Starts/resumes server-owned session from booking context. | Require valid lookup/session context and keep guest route bounded; do not treat raw booking reference as proof of authority. |
| `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff` | `guest_token` | Marks session ready after guest safety flow; no Roller write. | Require matching active guest session context and route-specific limits; no direct public state mutation without session proof. |
| `POST /v1/staff/auth/login` | `staff_auth_entry` | AWS-stored passcode, short-lived staff token, secret refresh cache. | Keep only as a temporary staff identity entrypoint; add brute-force protections, low route limit, WAF/edge rules, and replace with production identity if approved. |
| `GET /v1/staff/check-in/sessions` | `staff_protected` | Requires JumpYard staff token. | Require API-boundary staff identity or authorizer before staging/live. |
| `GET /v1/staff/check-in/sessions/{checkinSessionId}` | `staff_protected` | Requires JumpYard staff token. | Require API-boundary staff identity or authorizer before staging/live. |
| `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem` | `staff_protected` | Requires JumpYard staff token, final Roller refresh, eligibility filter, Roller Playground write. | Require strong staff identity, role/audit ownership, lower write limits, final Roller refresh, and clear rollback/support process. |
| `POST /v1/check-in/session-links` | `internal_ops` | Protected by check-in link dev token. | Move behind internal admin/automation protection; do not expose as a general public browser route. |
| `POST /v1/check-in/session-links/send-sms` | `internal_ops` | Protected by check-in link dev token and explicit `confirmSend`. | Internal/staff/automation only; require provider readiness, consent policy, audit, and route-specific send limits before live. |
| `POST /v1/check-in/session-links/send-email` | `internal_ops` | Protected by check-in link dev token, dry-run first, and SES sender config gate for confirmed sends. | Internal/staff/automation only; require verified sender/domain, consent policy, audit, and route-specific send limits before live. |
| `POST /v1/check-in/session-links/send-due-sms` | `internal_ops` | Protected by check-in link dev token; EventBridge schedule uses planning mode. | Prefer internal EventBridge invocation instead of public route; if retained, require internal-only auth and no guest browser access. |
| `POST /v1/check-in/redeem` | `legacy_dev_only` | Lower-level direct dev path requires dev redeem token for writes. | Remove, disable, or lock behind internal-only protection before staging/live; normal flow should use staff session redeem. |
| `POST /v1/roller/webhooks/bookings` | `roller_webhook` | Validates `x-roller-apikey`, stores idempotent event metadata, refreshes from Roller. | Confirm production webhook auth/signature, optionally allowlist Roller EMEA IP ranges, keep fast acknowledge, and move enrichment async if needed. |
| `POST /v1/roller/webhooks/redemptions` | `roller_webhook` | Route exists for webhook handler; production payload semantics still need confirmation before relying on it. | Same webhook boundary as booking events; do not expose guest/staff semantics on this path. |

## Target Protection Model

1. Guest routes stay reachable from the phone PWA, but they are not unbounded.
   They need strict CORS, route-specific throttling, WAF or equivalent edge controls, payload size checks, idempotency for writes, and no secret/PII leaks.

2. Staff routes should not rely only on frontend routing.
   The current T0047 staff token is useful for dev, but staging/live should add an API-boundary identity decision: a Lambda/JWT authorizer, Cognito/SSO, or another approved staff identity layer.

3. Internal operations routes should not be general public endpoints.
   SMS creation, due-SMS processing, and direct lower-level redeem should move behind internal automation or stronger admin-only auth before staging/live.

4. Webhook routes are public internet routes for Roller only.
   They need Roller-authenticated delivery, idempotency, fast acknowledgement, and optional IP allowlisting. If enrichment latency grows, the request handler should store/queue and return quickly.

5. WAF needs an implementation check before coding.
   The current API is an API Gateway HTTP API. If AWS WAF cannot be attached directly to the chosen endpoint shape, use CloudFront/custom domain in front of the API or equivalent edge controls plus authorizers and route limits.

## Route-Specific Limit Direction

| Group | Direction |
|---|---|
| Low-risk read routes | Higher than write routes, but still bounded to protect Roller calls. |
| Booking writes and add-product writes | Lower limits, idempotency required, and alarm on spikes. |
| Staff auth login | Very low per-IP/per-route limit and brute-force monitoring. |
| Staff redeem | Low write limit, staff identity required, and explicit audit. |
| SMS/email send routes | Low send limits, consent/sandbox/sender production provider gates, and delivery alarms. |
| Webhooks | Separate limits so Roller retries are not blocked by guest traffic. |

## T0062 Outcome

T0062 does not implement these controls. It labels every current API door and defines which lock belongs on each door before a later ticket changes infrastructure. The next implementation ticket can now modify CDK with less guesswork.
