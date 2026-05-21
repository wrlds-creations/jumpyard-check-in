# JumpYard Cloud Contract

This file defines the first Sprint 1 contract for the phone-first JumpYard check-in flows. It is a planning and implementation boundary document; it does not create AWS resources and it does not implement Roller writes.

## Source Materials

- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `REPO_CURRENT_STATE.md`
- `C:\Users\lovea\Desktop\dev\Jumpyard_Next\jumpyard-processes\editor\index.html`
- `C:\Users\lovea\Desktop\dev\Jumpyard_Next\jumpyard-processes\editor\src\data\pilotFlow.ts`
- `C:\Users\lovea\Desktop\dev\Jumpyard_Next\jumpyard-processes\editor\src\App.tsx`
- `Roller_Response_v1_260414.pdf`
- `Roller_Response_v2_260423.pdf`
- `Roller_Response_v3_260429.pdf`
- `ROLLER Rest API - Reference from website.pdf`

## Core Architecture

Production architecture:

```text
phone app -> JumpYard Cloud API -> Roller API
```

The phone app must never call Roller directly. JumpYard Cloud owns credential handling, Roller rate-limit control, idempotency, audit logging, normalized API responses, and pilot operational state.

## Flow Scope

T0003 defines contracts for three target flows:

| Flow | Goal | Primary Roller Pattern | T0003 Status |
|---|---|---|---|
| `F1` | Create a new booking | `POST /bookings/draft/costs`, `POST /bookings/draft`, payment/publish path | Contract only |
| `F2` | Create booking and check in | New booking flow, then `GET /bookings/{uniqueId or bookingReference}`, then `POST /redemptions` | Contract only |
| `F3` | Check in existing booking and add product | `GET /bookings/{id}`, optional availability, create a separate linked add-on booking, then connect it to the original booking in JumpYard Cloud | Contract only |

## Data Ownership

| Data | Source Of Truth | JumpYard Cloud Stores | Notes |
|---|---|---|---|
| Booking record | Roller | Roller ids, normalized short-lived snapshot, audit references | Do not treat cache as truth. |
| Booking payment status | Roller | Last observed status and audit trail | Payment collection is Roller-owned. |
| Ticket redemption state | Roller | Check-in attempts and redemption results | Check-in is ticket-level, not booking-level. |
| Product catalog | Roller | Cache with TTL | `/products` should be cached and used sparingly. |
| Product/session availability | Roller | Last checked availability where useful | SkyRider needs availability before add. |
| Safety status | JumpYard Cloud | Yes | Pilot operational state. |
| Check-in session status | JumpYard Cloud | Yes | Server-owned guest progress through lookup, safety, add-ons, payment handoff, and staff confirmation. |
| Handoff code/status | JumpYard Cloud | Yes | Used for staff handoff. |
| Internal audit events | JumpYard Cloud | Yes | Correlation id, operation, outcome, timestamps. |
| Roller credentials | AWS Secrets Manager | Secret reference only | Never expose to frontend or logs. |

## Booking Data Ingestion Strategy

Implementation-ready ingestion detail is documented in `BOOKING_INDEX_INGESTION_CONTRACT.md`.

JumpYard Cloud should not depend only on live lookups at check-in time. The scalable pattern is:

```text
Daily Data API seed -> Aurora Roller Snapshot + operational booking index
Booking webhook -> same-day change updates
Live REST lookup -> on-demand confirmation/enrichment
```

### Daily Seed

Use Roller's Data API each morning to pull the current operational booking set into JumpYard Cloud's Aurora-backed Roller Snapshot.

Purpose:

- Preload today's and near-future bookings before guests arrive.
- Reduce peak-time dependency on live Roller REST lookup.
- Build local indexes in Aurora for fast lookup by booking reference, ticket id, name/email/phone where appropriate.
- Support staff dashboards and handoff state without polling Roller for every screen.

Rules:

- Roller remains source of truth.
- The local seed is an operational index, not the authoritative booking record.
- Store Roller ids, booking date/time, product/ticket summaries, payment status, and lookup keys needed for check-in.
- Avoid storing unnecessary PII; mask or minimize contact fields where possible.
- Reconcile daily seed records with webhook/live lookup results using `rollerUniqueId` and `bookingReference`.
- Align the seed with the editor flow's `job-daily` operation: `Get bookings / Get tickets / Get payments / Get customers` into `Aurora / Roller Snapshot` and `Aurora / Operativ state`.

### Booking Webhook

Use Roller booking webhooks as the same-day change signal.

Purpose:

- Update JumpYard Cloud when bookings are created, changed, paid, cancelled, or otherwise modified after the morning seed.
- Keep the local booking index fresh without frequent polling.
- Receive booking-level detail equivalent to Get Detail of a Booking when configured correctly, including payments when `include.payments` is enabled.

Rules:

- Webhook processing must be idempotent.
- Store raw webhook payloads only if a later ticket explicitly approves retention/PII policy.
- Prefer a normalized event record plus a normalized booking index update.
- If a webhook payload is incomplete or suspicious, schedule a live REST lookup to confirm.
- Align webhook processing with the editor flow's `Booking webhook intake` and `Webhook enrichment`: webhook is the signal, `Get detail of a booking` is the authoritative enrichment read, and customer detail is fetched only when needed for late booking contact/SMS readiness.

### Live REST Lookup

Use live REST lookup for check-in-critical confirmation.

Purpose:

- Confirm the booking state at the moment of check-in.
- Resolve booking reference to ticket ids before redemption.
- Handle bookings that are missing from seed/webhook due to timing, errors, or configuration gaps.

Rules:

- Primary path: `GET /bookings/{uniqueId or bookingReference}`.
- Fallback path: `GET /bookings` search when the guest cannot show a booking reference or QR/code.
- Live lookup should update the local normalized booking snapshot.
- When Roller is unavailable or rate-limited, route to staff handoff rather than guessing.

## Roller Endpoint Map

| Capability | Roller Endpoint | Read/Write | Confidence | Notes |
|---|---|---|---|---|
| Product catalog | `GET /products` | Read | Confirmed | Returned 96 products in Playground. Cache this data. Includes add-ons that the Manager UI may not show in the same product list. |
| Availability | `GET /product-availability` | Read | Confirmed endpoint | Required before adding SkyRider or other session/capacity products. Simple stock/add-ons such as socks/lockers/coffee do not need this check per Roller response. |
| Booking search fallback | `GET /bookings` | Read | Confirmed | Requires at least one query param. Supports `keywords`, `date`, `startTime`, `productIds`, `locationIds`. Use when guest lacks QR/code. |
| Booking detail | `GET /bookings/{uniqueId}` | Read | Confirmed | Booking reference is also accepted in Playground. Authoritative live lookup for existing booking flow. |
| New booking cost | `POST /bookings/draft/costs` | Write-like calculation | Confirmed | Use for final pre-payment basket calculation. It applies pricing/discount logic better than product list display. |
| Create draft booking | `POST /bookings/draft` | Write | Confirmed | Recommended path for new booking/payment flow. Holds capacity through draft timer. |
| Publish zero-owing draft | `POST /bookings/draft/publish` | Write | Confirmed | Use when no payment remains due, such as full gift-card coverage. |
| Create booking | `POST /bookings` | Write | Confirmed endpoint | Available, but draft booking is preferred for payment-led phone flow. |
| Update existing booking | `PUT /bookings/{uniqueId}` | Write | Confirmed but not primary for pilot add-products | Adds/removes products and preserves same booking code, but payment-link UX can break return to the JumpYard PWA/check-in flow. |
| Existing booking payment link | `POST /bookings/{uniqueId}/payments/links` | Write | Confirmed but not primary for pilot add-products | Supported by Roller, but not selected as the primary pilot pattern because it sends the guest to a separate hosted payment link and return-to-PWA behavior is not reliable enough. |
| Cancel payment link | `DELETE /bookings/{uniqueId}/payments/links/{paymentLinkId}` | Write | Confirmed but deferred | Cleanup path if hosted payment is used in a future same-booking update path. |
| Linked add-on booking | `POST /bookings/draft/costs`, `POST /bookings/draft`, payment/publish path | Write | Selected pilot pattern | Create the add-ons as a separate Roller booking and link original booking + add-on booking inside JumpYard Cloud. |
| Redeem tickets | `POST /redemptions` | Write | Confirmed endpoint | Ticket-level redemption. Max 10 unique ticket IDs per call per reference PDF. |
| Booking webhook | Webhooks API | Receive | Confirmed | Can carry booking-level detail equivalent to booking detail when configured correctly, including payments with `include.payments`. |
| Redemption webhook | Webhooks API | Receive | Confirmed pattern | Use to maintain live checked-in counters for session-based products. Stock/add-on products are excluded. |

## Playground Test Data Strategy

The normal phone check-in flow should not contain a public demo button that creates fake bookings. Test-data creation should be separated from guest-facing check-in so production UX and production safety rules stay clean.

Recommended approach:

1. Build an internal seed tool first.
   - A local/admin-only command or protected internal endpoint creates deterministic Playground bookings through JumpYard Cloud.
   - It can create 5-10 fake bookings with known names, times, products, and payment states.
   - It must be blocked outside Playground.
2. Add a lightweight admin view only if the script becomes painful.
   - The admin view can trigger the same protected seed action and list known test bookings.
   - It should never live inside the public phone check-in flow.
3. Use fixture scenarios rather than random data.
   - Paid booking ready for check-in.
   - Pending payment booking.
   - Wrong date/time booking.
   - Already redeemed booking.
   - Booking with SkyRider/add-product scenario.
   - Booking with stock/add-on product that must be routed correctly.

Implementation rules:

- Test data must be created through JumpYard Cloud, not directly from the phone app.
- Seed commands must require `ROLLER_ENV=playground` and reject production/live URLs.
- Fake guest data should be clearly fake and deterministic.
- Seed output should print booking references and unique ids, never secrets or tokens.
- If Roller Playground booking creation requires fields that are hard to provide manually, the seed tool should encode those required fields once so repeated testing is easy.

## JumpYard Cloud API V1

These are the first server-owned contracts that the phone app should target. Exact HTTP paths can change before implementation, but frontend must target JumpYard Cloud concepts, not Roller concepts.

### Check-in Session and Staff Handoff Boundary

T0022 separates phone progress from final Roller redemption.

The guest phone app can:

- lookup a booking through JumpYard Cloud
- start or resume a JumpYard Cloud check-in session
- complete guest-side steps such as safety, add-ons, and payment when those are implemented
- show that staff help or staff confirmation is needed

The guest phone app cannot:

- hold `ROLLER_CLIENT_SECRET`, Roller tokens, the T0021 dev redeem token, or any future production redeem secret
- call Roller directly
- directly execute the final `POST /redemptions` write

JumpYard Cloud owns:

- `checkin_session_id`
- session status
- selected ticket scope
- safety status
- handoff code/status
- idempotency keys
- check-in attempts and event-log audit
- final live Roller refresh before redeem

For the pilot, final redeem should be triggered by staff/admin or a trusted server-side confirmation step, not by a public phone-only button.

### `POST /v1/check-in/lookup`

Looks up and normalizes an existing booking for the phone check-in flow.

Request:

```json
{
  "venueId": "jumpyard-venue-id",
  "identifier": "5001370",
  "identifierType": "bookingReference",
  "expectedDate": "2026-05-19",
  "expectedStartTime": "15:30",
  "correlationId": "optional-client-generated-id"
}
```

Response:

```json
{
  "correlationId": "jy_...",
  "status": "found",
  "booking": {
    "bookingReference": "5001370",
    "rollerUniqueId": "dbba266d-0951-4706-9adf-6c9d05edffbf",
    "paymentStatus": "PendingPayment",
    "total": 260,
    "amountOwing": 260,
    "items": [
      {
        "bookingItemId": 7174485,
        "productId": 1765836,
        "productName": "Biljetter (260 kr)",
        "parentProductId": 1765835,
        "parentProductName": "Entre 120 min",
        "quantity": 1,
        "bookingDate": "2026-05-19",
        "startTime": "15:30",
        "endTime": "17:30",
        "tickets": [
          {
            "ticketId": "5001370-21265504",
            "status": "unknown-from-current-response",
            "locations": [137454]
          }
        ]
      }
    ]
  },
  "eligibility": {
    "canCheckIn": false,
    "reason": "payment_required",
    "requiresStaff": true
  }
}
```

Lookup rules:

- Try Aurora first by booking reference, Roller unique id, or known ticket id.
- If Aurora has a fresh, usable record, return that normalized snapshot for display.
- If Aurora is missing, stale, tombstoned, or payment state is unclear, call `GET /bookings/{identifier}`.
- If direct live lookup fails, use `GET /bookings` with supported filters in a later fallback ticket.
- Upsert successful live lookup refreshes back into Aurora.
- Normalize Roller errors into stable JumpYard error codes.
- Do not return raw Roller payloads to the phone app.
- Do not persist full PII unless a later ticket explicitly approves it.

### `POST /v1/check-in/sessions`

Starts or resumes a server-owned check-in session after a successful lookup.

Implemented in T0023 for dev.

Request:

```json
{
  "correlationId": "jy_...",
  "bookingReference": "5001370",
  "rollerUniqueId": "dbba266d-0951-4706-9adf-6c9d05edffbf",
  "sourceLookupId": "optional-lookup-attempt-id",
  "idempotencyKey": "client-or-server-generated-key"
}
```

Response:

```json
{
  "correlationId": "jy_...",
  "status": "session_started",
  "session": {
    "checkinSessionId": "jy_session_...",
    "status": "guest_in_progress",
    "handoffStatus": "not_ready",
    "expiresAt": "2026-05-21T12:15:00Z"
  }
}
```

Session rules:

- Create or resume one active operational session for the booking and visit date.
- The phone app must call this endpoint before advancing from booking summary into the guest-side check-in flow.
- Read booking/ticket context from Aurora only.
- Store only server-owned state needed for the flow.
- Do not redeem tickets from this endpoint.
- Do not call Roller from this endpoint.
- Do not expose dev/prod redeem secrets to the phone app.
- Use idempotency so repeated taps do not create duplicate active sessions.
- Route ambiguous, unpaid, wrong-date, or already-redeemed states to staff/status screens instead of forcing redemption.

### `POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff`

Marks a guest-side session as ready for staff or server confirmation.

Implemented in T0023 for dev.

Rules:

- Used after guest-side steps are complete enough for pilot handoff.
- Generates or refreshes a handoff code/status for staff/admin surfaces.
- Does not call Roller.
- Does not redeem tickets.
- Records an event-log row for audit.

### `GET /v1/staff/check-in/sessions`

Returns ready-for-staff sessions for the staff/admin surface.

Implemented in T0026 for dev.

Rules:

- Read from Aurora only.
- Return sessions with `handoff_status='ready_for_staff'` and `status='ready_for_staff'`.
- Return booking reference, handoff code, visit date, safety status, selected ticket count, booking status, payment status, and summary counts.
- Do not return guest email, phone, free-text names, addresses, or booking notes.
- Do not call Roller.
- Do not redeem tickets.
- Do not mutate session state.

### `GET /v1/staff/check-in/sessions/{checkinSessionId}`

Returns detail for one ready-for-staff session.

Implemented in T0026 for dev.

Rules:

- Read from Aurora only.
- Return session state, booking summary, selected ticket ids, booking items, and ticket summaries.
- Include product names and parent product names when present in the local product cache/imported item rows.
- Mark which tickets are selected for the check-in session.
- Do not expose contact PII.
- Do not call Roller or redeem tickets.

### `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`

Staff/admin-confirmed endpoint that performs final redemption for a check-in session.

Implemented in T0027 for dev.

Rules:

- Requires the temporary dev redeem token until staff/admin auth exists.
- Resolves the session to booking and ticket ids server-side.
- Requires the session to be `ready_for_staff` with `handoff_status='ready_for_staff'`.
- Requires completed safety status for the first implementation.
- Performs the T0021 final live Roller refresh before write.
- Re-runs eligibility against the refreshed data.
- Uses idempotency to prevent duplicate redemption attempts.
- Calls Roller `POST /redemptions` only after all checks pass.
- Updates `checkin_attempts`, ticket local state, handoff/session state, and event log.
- This replaces any direct phone call to the protected T0021 dev redeem path.
- The temporary dev code must be manually entered for dev testing and must not be stored in source, browser env, localStorage, or sessionStorage.

### `POST /v1/check-in/redeem`

Redeems selected tickets after lookup and validation. After T0022 this is treated as an internal/staff-confirmed operation shape, not as a public guest-phone endpoint.

Request:

```json
{
  "correlationId": "jy_...",
  "bookingReference": "5001370",
  "rollerUniqueId": "dbba266d-0951-4706-9adf-6c9d05edffbf",
  "ticketIds": ["5001370-21265504"],
  "idempotencyKey": "client-or-server-generated-key"
}
```

Response:

```json
{
  "correlationId": "jy_...",
  "status": "redeemed",
  "redeemedTicketIds": ["5001370-21265504"],
  "handoff": {
    "handoffCode": "TBD",
    "status": "ready_for_staff"
  }
}
```

Redeem rules:

- Require an idempotency key.
- Require staff/admin auth, a trusted server confirmation, or the dev-only T0021 token when running controlled backend tests.
- Re-fetch or verify booking state before write when the previous lookup is stale.
- Do not redeem unpaid, wrong-date, already-invalid, or ambiguous partial groups in v1.
- Route partial groups to staff unless a later ticket explicitly implements ticket selection.
- Call Roller `POST /redemptions` only from JumpYard Cloud.
- Never put the T0021 dev redeem token in browser env, browser storage, app source, or public phone network calls.
- Log every attempt and result.

### `POST /v1/bookings/quote`

Calculates price and availability for a new booking or product addition before committing a write.

Request:

```json
{
  "venueId": "jumpyard-venue-id",
  "flow": "new_booking",
  "date": "2026-05-19",
  "startTime": "15:30",
  "items": [
    {
      "productId": 1765836,
      "quantity": 1
    }
  ],
  "discountCodes": []
}
```

Response:

```json
{
  "status": "quoted",
  "quoteId": "jy_quote_...",
  "total": 260,
  "amountOwing": 260,
  "expiresAt": "2026-05-19T13:30:00Z"
}
```

Quote rules:

- Use Roller `POST /bookings/draft/costs`.
- Use `/product-availability` before quote when the selected product is session/capacity constrained.
- Product list prices are display hints only; final price comes from Booking Costs.

### `POST /v1/bookings/draft`

Creates a draft booking for a new booking flow.

Request:

```json
{
  "quoteId": "jy_quote_...",
  "customer": {
    "firstName": "Guest",
    "lastName": "Guest",
    "email": "optional@example.com",
    "phone": "+46000000000"
  },
  "idempotencyKey": "client-or-server-generated-key"
}
```

Draft rules:

- Use Roller `POST /bookings/draft`.
- Either email or phone is required; name alone is not enough according to Roller response.
- Draft creation holds capacity through Roller's draft timer.
- If amount owing is zero, use `POST /bookings/draft/publish`.
- Payment SDK/domain allow-listing is a separate implementation concern.

### `POST /v1/bookings/{bookingReference}/add-products/quote`

Calculates an existing-booking product addition before changing the original booking.

Rules:

- Lookup booking detail first.
- For SkyRider or other session products, run availability check first.
- Use Booking Costs on the add-on booking payload to show final price impact.
- Do not call `PUT /bookings/{uniqueId}` as the primary pilot path.
- Prepare a separate add-on booking draft that can be linked to the original booking in JumpYard Cloud.

### `POST /v1/bookings/{bookingReference}/add-products`

Adds products to an existing booking after user confirmation.

Rules:

- Primary pilot pattern: create a separate add-on booking in Roller for the selected products.
- Link the original booking and add-on booking in JumpYard Cloud using the original `rollerUniqueId`, original `bookingReference`, add-on `rollerUniqueId`, add-on `bookingReference`, and an internal `addOnGroupId`.
- Keep the guest inside the JumpYard PWA/check-in flow as much as possible by using the new booking/payment path instead of same-booking hosted payment link.
- Do not use same-booking `PUT /bookings/{uniqueId}` plus payment link as the primary pilot path.
- Same-booking update remains a future option only if Roller confirms a reliable return path and JumpYard explicitly chooses that UX.
- Stock/add-on products cannot be redeemed through the same ticket-level API path unless configured as ticket/session products.

## Error Contract

| Code | Meaning | Phone Behavior |
|---|---|---|
| `booking_not_found` | Roller could not find a matching booking. | Show staff handoff. |
| `wrong_date_or_time` | Booking does not match expected session. | Show staff handoff. |
| `payment_required` | Booking exists but amount remains owing. | Route to payment or staff depending flow. |
| `already_redeemed` | Tickets are already used or invalid. | Show staff handoff. |
| `partial_group_not_supported` | Guest selected a partial group in v1. | Show staff handoff. |
| `redeem_confirmation_required` | Guest-side session is ready but final redeem requires staff/server confirmation. | Show staff handoff or staff-ready state. |
| `roller_rate_limited` | Roller API call could not run within rate limit. | Retry or show staff handoff. |
| `roller_unavailable` | Roller API timeout/error. | Show staff handoff. |
| `unsafe_environment` | Roller config is not Playground-safe in dev. | Block operation. |

## Proposed AWS Target

No AWS resources are created by T0003. This is the proposed target shape for future tickets.

| Component | AWS Service | Purpose |
|---|---|---|
| Public API | API Gateway HTTP API | Phone app entrypoint to JumpYard Cloud. |
| API handlers | Lambda, TypeScript | Lookup, quote, draft booking, add product, redeem. |
| Roller secret storage | Secrets Manager | Store Roller client id/secret per environment. |
| Non-secret config | SSM Parameter Store or Lambda env | Roller base URL, environment, venue ids. |
| Primary operational database | Aurora PostgreSQL | Roller snapshot, operational state, events, connected pilot state. |
| Raw payload storage | S3 | Optional raw Roller payloads, exports, and later analysis dumps. |
| Session/cache/rate state | Redis, optional in v1 | Short-lived tokens, sessions, and rate-limit state if needed. |
| Event/audit logs | CloudWatch Logs plus Aurora event records | Debuggability and support trail. |
| Rate-limit control | SQS/EventBridge worker plus Aurora/Redis state | Respect Roller one-call-per-second credential limit. |
| Webhook receiver | API Gateway + Lambda | Booking and redemption webhooks. |
| Async events | EventBridge or SQS | Decouple webhook processing and reconciliation. |
| Deployment | CDK TypeScript and GitHub Actions OIDC | Repeatable infrastructure with WRLDS tags. |

## Aurora Data Model V1

Prefer a small operational model that stores Roller ids and JumpYard state rather than copying all Roller data.

| Table | Purpose | Required Fields | Retention |
|---|---|---|---|
| `roller_bookings` | Latest normalized booking snapshot from seed, webhook enrichment, or live refresh. | `roller_unique_id`, `booking_reference`, `booking_date`, `start_time`, `payment_status`, `amount_owing`, `source`, `last_seen_from_roller_at` | Operational retention TBD |
| `roller_booking_items` | Normalized booking item/product rows. | `roller_unique_id`, `booking_item_id`, `product_id`, `parent_product_id`, `quantity`, `booking_date`, `start_time`, `end_time` | Match booking retention |
| `roller_booking_tickets` | Ticket ids and redeem readiness context. | `ticket_id`, `roller_unique_id`, `booking_item_id`, `ticket_holder_name`, `locations`, `membership_status`, `redeem_status_last_seen` | Match booking retention |
| `roller_booking_payments` | Payment rows or payment summary needed for check-in/payment decisions. | `roller_unique_id`, `booking_payment_id`, `payment_method`, `total`, `created_date` | Match booking retention |
| `guest_profiles` | Minimal local contact/profile state for SMS, connected profiles, and late booking enrichment. | `guest_profile_id`, `roller_customer_id`, `email`, `contact_number`, `sms_ready`, `latest_booking_context` | Minimize PII |
| `checkin_sessions` | Server-owned guest check-in progress and final handoff context. | `checkin_session_id`, `roller_unique_id`, `booking_reference`, `visit_date`, `status`, `selected_ticket_ids`, `handoff_status`, `expires_at`, `created_at`, `updated_at` | Short operational retention |
| `checkin_tokens` | SMS/link/open tokens. | `token_hash`, `roller_unique_id`, `channel`, `expires_at`, `sent_at`, `opened_at` | Short TTL |
| `checkin_attempts` | Check-in/redeem attempt audit. | `correlation_id`, `roller_unique_id`, `booking_reference`, `selected_ticket_ids`, `status`, `error_code`, `created_at` | Audit retention TBD |
| `handoff_sessions` | Staff handoff and connected band handoff state. | `handoff_code`, `roller_unique_id`, `safety_status`, `staff_status`, `band_pairing_status`, `created_at` | Short operational retention |
| `booking_links` | Internal link between original bookings and add-on bookings created during check-in. | `link_id`, `link_type`, `original_roller_unique_id`, `original_booking_reference`, `linked_roller_unique_id`, `linked_booking_reference`, `created_at` | Match booking retention |
| `idempotency_records` | Write protection for create/update/redeem/payment-link operations. | `idempotency_key`, `operation`, `request_hash`, `status`, `result_ref`, `created_at`, `expires_at` | Short TTL |
| `product_catalog_cache` | Cached Roller products and pricing metadata. | `venue_id`, `roller_env`, `fetched_at`, `product_hash`, `summary` | TTL |
| `roller_webhook_events` | Idempotent webhook intake and enrichment status. | `event_id_or_hash`, `event_type`, `booking_reference`, `roller_unique_id`, `payload_hash`, `processed_at`, `status` | Event retention TBD |
| `booking_seed_runs` | Daily seed run tracking. | `run_id`, `date_range`, `status`, `records_read`, `records_updated`, `started_at`, `finished_at` | Operational retention TBD |
| `event_log` | Append-only business/observability events. | `event_id`, `correlation_id`, `event_type`, `subject_ref`, `created_at`, `summary` | Audit retention TBD |

PII rules:

- Store the minimum PII needed for operations.
- Prefer Roller ids, ticket ids, and masked contact details.
- Do not store raw Roller access tokens.
- Do not log Roller secrets.
- Do not expose full Roller payloads to the phone app.

## Rate Limit Strategy

Roller imposes a one-call-per-second rate limit per credential set. AWS scaling does not remove this external limit.

Rules:

- Cache `/products`.
- Use booking and redemption webhooks where possible to reduce polling.
- Reuse OAuth tokens; do not request a token per API call.
- Serialize Roller writes such as draft booking creation, add-on booking creation, publish/payment operations, and redemption.
- Protect synchronous lookup with throttling and clear staff fallback when Roller is slow or unavailable.
- Load-test the chosen throttling design before pilot traffic.

## Implementation Sequence

Current implementation has progressed through `T0027`. The next recommended ticket is `T0028 QR/handoff lookup polish`, which should improve how staff locates sessions now that the first redeem path exists.

Near-term sequence:

1. `T0026 Staff/admin handoff list/detail`: completed locally and deployed to dev; staff can inspect ready handoffs.
2. `T0027 Staff-confirmed redeem from session`: completed locally; staff can confirm redeem from a server-owned session after final Roller refresh.
3. `T0028 QR/handoff code polish`: improve how staff locates the ready session, including QR/handoff-code handling if needed.
4. `T0029 Staff auth plan/implementation`: replace the temporary dev redeem code with the selected staff/admin authentication model.

## Open Contract Questions

- What is the best Roller field or internal JumpYard field for marking an add-on booking as linked to an original booking?
- Which tenders work in the new add-on booking checkout flow: gift card, membership code, multi-visit value?
- What exact response shape should JumpYard expect from `POST /redemptions` for partial success/failure?
- Which webhook event id should be used for idempotent webhook processing?
- Which Data API export endpoint, credentials, and date range should JumpYard use for the morning booking seed?
- Which products must be reconfigured from stock/add-on to ticket/session products if JumpYard wants API-driven redemption?
- What is the preferred availability-display pattern for core jump-entry products and durations?
- What AWS account, region, environment name, owner, data classification, exportability, and cost center should be used for the first dev deploy?
