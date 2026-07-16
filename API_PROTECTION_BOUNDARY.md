# JumpYard API Protection Boundary

This file is the source of truth for the route trust boundary first designed in T0062 and implemented for dev/park-test infrastructure and the deployed park-test runtime in T0193.

## Current Status

- Implementation ticket: `T0193`, completed 2026-07-13.
- Deployed target: existing park-test API `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com`.
- Inventory: 21 explicit routes, 6 `AWS_IAM` and 15 explicit `NONE` at API Gateway.
- Stage fallback: rate 50 requests/second, burst 150, detailed metrics enabled.
- Every route has an explicit trust class, handler, authorization type, route-specific rate/burst setting, and stage dependency in one CDK catalog.
- Application-layer guest, staff, service, legacy, and webhook credentials remain required behind the route boundary. T0197 changes webhook processing behind the existing route; it adds no public route or edge resource.
- No WAF, CloudFront, custom domain, authorizer resource, or other AWS resource was added in T0193.

`NONE` means that API Gateway does not require AWS signing. It does not mean that the route is trusted without application validation. Guest browsers, staff browsers, and Roller cannot use AWS IAM signing, so those routes enforce the appropriate opaque guest proof, staff token, webhook token, payload rules, idempotency, and business gates in Lambda.

## Boundary Classes

| Class | Caller and rule |
|---|---|
| `guest_public` | Guest browser entry/read route. Strict payload/date/venue/business validation and a bounded route bucket apply; successful scoped lookup may issue guest proof. |
| `guest_token` | Guest route that requires an opaque link/guest credential bound to the booking or session before scoped data or side effects. |
| `guest_write` | Guest write route. Requires strict validation and idempotency; existing-booking writes also require bound guest proof. |
| `staff_auth_entry` | Temporary staff login entry. Public at Gateway, isolated low route bucket, safe logs, and server-side passcode verification; T0194 replaces the shared identity model. |
| `staff_protected` | Requires the short-lived server-verified staff token before protected reads or redeem work. |
| `internal_ops` | Requires AWS IAM signing at Gateway and the existing service token in Lambda. Not callable as a normal browser endpoint. |
| `roller_webhook` | Public only so Roller can deliver. Requires the exact registered `x-roller-apikey` token, persists/enqueues safe metadata before HTTP `200`, and performs authoritative reconciliation asynchronously. |
| `legacy_dev_only` | Lower-level direct redeem route. Requires AWS IAM plus the existing service/dev token; normal product flow does not use it. |

## Implemented Route Inventory

Rates are requests per second followed by burst capacity. They are aggregate per-route API Gateway buckets, not per-IP limits.

| Route | Trust class | Gateway auth | Required application proof/control | Rate / burst |
|---|---|---|---|---:|
| `POST /v1/check-in/lookup` | `guest_public` | `NONE` | Scoped identifier/date/venue validation; successful lookup issues hash-only stored guest proof | 25 / 80 |
| `POST /v1/staff/auth/login` | `staff_auth_entry` | `NONE` | Existing AWS-stored passcode, safe correlation/logging | 2 / 10 |
| `POST /v1/check-in/session-links` | `internal_ops` | `AWS_IAM` | Check-in-link service token | 1 / 5 |
| `POST /v1/check-in/session-links/send-sms` | `internal_ops` | `AWS_IAM` | Service token plus existing send confirmation/provider gates | 1 / 5 |
| `POST /v1/check-in/session-links/send-email` | `internal_ops` | `AWS_IAM` | Service token plus existing send confirmation/provider gates | 1 / 5 |
| `POST /v1/check-in/session-links/send-due-sms` | `internal_ops` | `AWS_IAM` | Service token plus existing schedule/send gates | 1 / 5 |
| `POST /v1/check-in/session-links/send-due-messages` | `internal_ops` | `AWS_IAM` | Service token plus existing schedule/send gates | 1 / 5 |
| `POST /v1/check-in/session-links/resolve` | `guest_token` | `NONE` | Valid opaque link, allowed channel, expiry/consumed checks, atomic 5-second cooldown | 40 / 100 |
| `POST /v1/check-in/sessions` | `guest_token` | `NONE` | Bearer guest proof bound to booking plus idempotency key | 40 / 100 |
| `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff` | `guest_token` | `NONE` | Bearer guest proof bound to active session/booking | 40 / 100 |
| `GET /v1/staff/check-in/sessions` | `staff_protected` | `NONE` | Valid unexpired staff token | 20 / 50 |
| `GET /v1/staff/check-in/sessions/{checkinSessionId}` | `staff_protected` | `NONE` | Valid unexpired staff token | 20 / 50 |
| `POST /v1/check-in/redeem` | `legacy_dev_only` | `AWS_IAM` | Redeem service/dev token for plan and confirm paths | 1 / 5 |
| `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem` | `staff_protected` | `NONE` | Valid unexpired staff token, final Roller refresh, eligibility/idempotency/audit | 5 / 20 |
| `POST /v1/bookings/quote` | `guest_public` | `NONE` | Strict item/date/venue validation; no write | 10 / 40 |
| `POST /v1/bookings/draft` | `guest_write` | `NONE` | Strict validation, confirm flag, idempotency, payment-package-only handling | 5 / 20 |
| `POST /v1/bookings/availability` | `guest_public` | `NONE` | Strict request/date/venue validation; no write | 20 / 60 |
| `POST /v1/bookings/{bookingReference}/add-products/quote` | `guest_token` | `NONE` | Bearer guest proof bound to path booking plus strict validation | 10 / 40 |
| `POST /v1/bookings/{bookingReference}/add-products` | `guest_write` | `NONE` | Bound guest proof, strict validation, confirm flag, idempotency | 5 / 20 |
| `POST /v1/roller/webhooks/bookings` | `roller_webhook` | `NONE` | Exact registered Roller token; safe metadata dedupe plus durable FIFO enqueue; async Live/Nacka reconciliation | 10 / 50 |
| `POST /v1/roller/webhooks/redemptions` | `roller_webhook` | `NONE` | Registered token and safe acknowledgement; T0197 accepts only supported booking signals, so redemption events are not enriched | 10 / 50 |

## Guest Credential Rules

- A successful scoped lookup issues a cryptographically random 32-byte opaque value and stores only SHA-256 in `jumpyard.checkin_tokens`.
- Guest access expires after at most 60 minutes and is bound to one booking.
- Existing active credentials are not evicted. Manual lookup prunes expired/consumed rows and applies a steady-state soft cap of 64 active `guest_access` credentials per booking.
- SMS/email/manual/dev link resolution reuses the already opaque raw link value after a valid open rather than creating a new credential on every resolve.
- Link guest access never outlives the original link expiry; consumed, expired, or wrong-channel/wrong-class rows fail closed.
- Resolve cooldown is atomically enforced for five seconds. Link-open audit refresh is bounded to five minutes.
- The phone holds proof in memory, sends it as Bearer authorization, immediately removes token query parameters from the URL, and performs only bounded transient retry.

T0195 owns final retention/purge and any stronger concurrent-cap serialization.

## Request And Error Boundary

| Handler | Decoded body ceiling | Oversized behavior |
|---|---:|---|
| Lookup | 8 KiB | HTTP `413 payload_too_large` |
| Booking | 64 KiB | HTTP `413 payload_too_large` |
| Session/staff/link | 32 KiB | HTTP `413 payload_too_large` |
| Legacy/staff redeem | 32 KiB | HTTP `413 payload_too_large` |
| Webhook | 256 KiB | Safe HTTP `200` invalid/ignored acknowledgement |

Plain and base64 API Gateway bodies use the same decoded limit. Correlation ids must match `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$`; unsafe caller values are neither echoed nor logged. Authentication and payload failures use structured safe envelopes and run before downstream work covered by the relevant route guard.

## Traffic Model

The default 50/150 stage setting is a fallback. Explicit route buckets are intentionally higher in aggregate and isolated from each other. This lets legitimate lookup, session, add-on, staff, and preflight traffic coexist behind one park Wi-Fi public IP while sensitive internal/login/write paths remain narrow.

The deterministic acceptance model covers 120 guests over 20 minutes, including 40 devices in the first two seconds and mixed guest/staff/payment activity, with zero modeled protection-caused `429` responses. A synthetic high-rate abuse case is throttled without consuming unrelated route buckets.

This model protects JumpYard Cloud. It is not the upstream Roller one-request-per-second governor; `FU-013`, T0196, and T0204 retain that dependency.

## Edge Boundary

No per-IP limiter is used because many legitimate guests share the park's public IP. T0193 also does not attach WAF: the current API is API Gateway HTTP API, and a CloudFront layer would be bypassable while the default `execute-api` endpoint remains reachable. T0199 approves only the guest and staff/admin web origins and deliberately adds no API custom hostname. Therefore a future production generated API endpoint must remain enabled and no non-bypassable edge claim is allowed unless another approved Issue first creates an alternative custom API topology. Route credentials, payload ceilings, idempotency, route buckets, and observability remain the enforceable boundary.

## Remaining Ticket Ownership

- T0194: personal staff identity, roles, MFA/session/revoke policy, named actor audit.
- T0195: token/data lifecycle, least privilege, rotation, backup/restore.
- T0197: completed park-test Roller booking webhook verification, durable processing, replay, and reconciliation; natural delivery observation remains bounded follow-up evidence.
- T0205 or another approved production Issue: deploy the approved artifact to T0199's empty physical web targets, apply exact CORS, and either preserve the generated API endpoint under T0199's no-custom-hostname contract or separately approve a custom API/default-endpoint/edge topology.
- T0202: security/traffic alarm routing and operational thresholds.

Detailed implementation, validation, deployment, and rollback evidence is in [docs/t0193-api-protection.md](docs/t0193-api-protection.md).
