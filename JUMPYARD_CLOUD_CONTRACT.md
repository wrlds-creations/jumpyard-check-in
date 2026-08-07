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
| Check-in link token | JumpYard Cloud | Token hash, channel, expiry/opened/consumed timestamps | Raw token is response-only and must not be stored. |
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

- Webhook processing is idempotent and treats arrival order as untrusted.
- Public intake authenticates, validates, deduplicates, stores normalized event metadata, and durably enqueues before HTTP `200`; it does not call Roller REST.
- Raw webhook payloads are prohibited. Persist only stable identifiers/hash, supported event type, safe status/attempt/timestamp fields, and bounded error summaries.
- One serialized worker uses current `GET /bookings/{identifier}` as authoritative and never writes to Roller. In Live park-test it also verifies the credential venue is Nacka `50871` and applies the T0196 30-day-past plus all-future boundary.
- Duplicate/processed event ids are no-ops. FIFO retry/DLQ, guarded replay, five-minute recovery, T0196 morning seed, and critical live confirmation cover failure and missed delivery.
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
| Create draft booking | `POST /bookings/draft` | Write | Confirmed | T0030 confirmed Playground HTTP `201` with cost fields and a present `paymentJwt`. Recommended path for new booking/payment flow. Holds capacity through draft timer. |
| Roller Payments custom checkout | Roller Payments library + returned `paymentJwt` | Frontend payment package | Confirmed, public smoke pending | Official docs describe passing the draft-booking JWT to Roller's payment library and Adyen drop-in. Pabel confirmed API authorization when API keys can be generated, `paymentSettings` from `GET /venues/me`, Adyen Visa test card ending `1142`, and allowlisting for `https://jumpyard-check-in.pages.dev`; public browser payment smokes are still pending. |
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

### QR Handoff Payload

Implemented in T0028 for the phone and staff/admin apps.

The guest confirmation QR represents a JumpYard Cloud handoff pointer:

```text
JY_HANDOFF:<handoffCode>:<checkinSessionId>
```

Rules:

- `handoffCode` is the short staff backup code shown to the guest.
- `checkinSessionId` is the server-owned session id used by the admin app to open the exact session detail.
- The payload must not include Roller credentials, Roller tokens, redeem tokens, customer contact data, or a direct redeem command.
- Scanning or pasting the payload in the admin app opens the JumpYard Cloud session detail only.
- Final redemption still goes through `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem` and still requires staff confirmation plus the server-side final Roller refresh.

### Check-in Session Links

Implemented in T0038 as the foundation for SMS/deep-link entry.

```text
POST /v1/check-in/session-links
POST /v1/check-in/session-links/send-sms
POST /v1/check-in/session-links/send-due-sms
POST /v1/check-in/session-links/resolve
```

Rules:

- Link creation is protected by a dev token until a production staff/internal auth model exists.
- The raw link token is generated by JumpYard Cloud, returned only in the creation response, and never persisted.
- Aurora stores `SHA-256(rawToken)` in `jumpyard.checkin_tokens` with channel, expiry, opened, and consumed timestamps.
- Resolving a valid token marks it opened and starts or resumes the linked JumpYard Cloud check-in session.
- Successful token resolution returns the server-owned check-in session plus a safe Aurora booking summary so the phone app can render the correct resume state.
- The phone app treats `jy_token` as the SMS/deep-link entry parameter and calls JumpYard Cloud before showing booking summary, QR confirmation, or already checked-in state.
- Resolving a link does not call Roller and does not redeem tickets.
- Booking references remain lookup identifiers, not sufficient authority for SMS/deep-link session resume.
- Invalid or expired links should fall back to manual booking lookup without exposing raw token details.
- Production should revisit whether this payload should become a signed or short-lived token after staff/admin authentication is selected.

### SMS Session Link Sending

Implemented in T0039 as the first provider-backed sending foundation.

```text
POST /v1/check-in/session-links/send-sms
```

Rules:

- Sending is protected by the same dev token as link creation until staff/internal auth exists.
- Dry-run is the default. A request must set `confirmSend=true` before JumpYard Cloud calls AWS SNS.
- The endpoint creates a T0038 check-in token internally, stores only the token hash, and never returns the raw token or full URL.
- `jumpyard.sms_deliveries` records provider, delivery status, masked/hash destination, booking reference, Roller unique id, token hash, and safe error metadata.
- The endpoint may use structured contact data from `jumpyard.guest_profiles` or a dev-supplied `phoneNumber`; responses return masked destination only.
- The endpoint does not call Roller, redeem tickets, or mutate bookings.
- T0041 confirmed AWS SNS accepts one protected dev send. The current dev SMS base URL is `http://localhost:3000/`, so real guest use still needs a public/mobile-reachable app URL before SMS links are useful on phones.
- T0042 confirmed AWS SNS provider acceptance is not the same as delivery. Dev SNS delivery status logs are enabled, and the diagnostic send failed at provider delivery with `Sandboxed account unable to send to number.` The AWS account is currently in SNS SMS sandbox mode, so real SMS delivery requires sandbox phone verification or sandbox exit.
- T0043 verified one masked test phone in SNS sandbox and confirmed a protected JumpYard Cloud SMS reached provider status `SUCCESS` with `Message has been accepted by phone.` The account still remains sandboxed, so unverified numbers will continue to be blocked until sandbox exit.
- T0044 confirmed the local phone app can open `?jy_token=...`, resolve it through JumpYard Cloud, and reach booking summary with a server-owned `guest_in_progress` session. A public/mobile-reachable app URL is still needed before real guest phone links can open outside the developer machine.

### Booking-Time SMS Trigger

Implemented in T0045 as the protected manual trigger foundation before scheduling.

```text
POST /v1/check-in/session-links/send-due-sms
```

Rules:

- The trigger is protected by the same dev token as the existing SMS send endpoint until staff/internal auth exists.
- Planning mode is the default. Without `confirmSend=true`, the endpoint returns due candidates and sends no SMS.
- Default timing is a `30` minute lead with a `10` minute window in `Europe/Stockholm`; dev tests may pass explicit `windowStartAt` and `windowEndAt`.
- The endpoint reads Aurora `roller_bookings`, `roller_booking_tickets`, and `guest_profiles` only. It does not call Roller.
- Candidates must be fresh, active, SMS-ready, and pass the existing check-in session eligibility rules before a real send is attempted.
- Confirmed sends reuse `POST /v1/check-in/session-links/send-sms` behavior internally, including hashed check-in tokens, idempotency, `jumpyard.sms_deliveries`, and AWS SNS.
- Recent real sends for the same booking/template are skipped to avoid duplicate reminders.
- The endpoint caps each run to a small batch and returns only safe booking metadata plus masked destinations.
- T0046 schedules this trigger through EventBridge for dev, but the scheduled config keeps `confirmSend=false` until public/mobile URL, consent, sandbox exit or verified-recipient policy, and production SMS rules are confirmed.
- T0049 adds a separate confirmed scheduled-send guard: EventBridge confirmed sends require an explicit approval phrase and a public HTTPS check-in base URL before any SMS provider call can happen.

### Scheduled Booking-Time SMS Processing

Implemented in T0046 as the internal AWS scheduler for the T0045 trigger.

```text
EventBridge -> jumpyard-check-in-dev-stack-session
```

Rules:

- The schedule is an internal AWS invocation, not a public API endpoint.
- Dev rule `jumpyard-check-in-dev-booking-time-sms-schedule` runs every 5 minutes.
- The scheduled payload uses the configured `checkinBaseUrl`, `leadMinutes=30`, `windowMinutes=10`, `limit=10`, approval field, and `confirmSend=false` in dev.
- Because `confirmSend=false`, scheduled runs plan candidates and send no SMS.
- The public HTTP endpoint `POST /v1/check-in/session-links/send-due-sms` remains protected by the check-in link dev token.
- Enabling unattended real SMS requires `confirmSend=true`, `confirmedSendApproval=I_APPROVE_CONFIRMED_SCHEDULED_SMS_SENDS`, and a public HTTPS `checkinBaseUrl`; CDK config and Lambda runtime both block scheduled confirmed sends without those safeguards.

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
- The phone app may call this endpoint immediately after a paid lookup to resume an existing active session before showing the booking summary.
- If no resumable final state is returned, the phone app keeps the booking summary and continues the normal guest-side check-in flow.
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

### `POST /v1/staff/auth/login`

Authenticates staff/admin for the pilot handoff app and returns a short-lived staff token.

Implemented in T0047 for dev.

Rules:

- Validate the submitted passcode against AWS Secrets Manager secret `/jumpyard-check-in-dev/staff/auth`.
- Return a short-lived bearer-style staff token, expiry, and safe staff display metadata.
- Do not return, log, or persist the stored passcode.
- Treat this as a pilot/dev auth slice, not final production SSO/Cognito.

### `GET /v1/staff/check-in/sessions`

Returns ready-for-staff sessions for the staff/admin surface.

Implemented in T0026 for dev and protected by T0047 staff auth.

Rules:

- Requires a valid T0047 staff token.
- Read from Aurora only.
- Return sessions with `handoff_status='ready_for_staff'` and `status='ready_for_staff'`.
- Return booking reference, handoff code, visit date, safety status, selected ticket count, booking status, payment status, and summary counts.
- Do not return guest email, phone, free-text names, addresses, or booking notes.
- Do not call Roller.
- Do not redeem tickets.
- Do not mutate session state.

### `GET /v1/staff/check-in/sessions/{checkinSessionId}`

Returns detail for one ready-for-staff session.

Implemented in T0026 for dev and protected by T0047 staff auth.

Rules:

- Requires a valid T0047 staff token.
- Read from Aurora only.
- Return session state, booking summary, selected ticket ids, booking items, and ticket summaries.
- Include product names and parent product names when present in the local product cache/imported item rows.
- Mark which tickets are selected for the check-in session.
- Do not expose contact PII.
- Do not call Roller or redeem tickets.

### `POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem`

Staff/admin-confirmed endpoint that performs final redemption for a check-in session.

Implemented in T0027 for dev and protected by T0047 staff auth for the normal admin flow.

Rules:

- Requires a valid T0047 staff token for the staff/admin route.
- Resolves the session to booking and ticket ids server-side.
- Requires the session to be `ready_for_staff` with `handoff_status='ready_for_staff'`.
- Requires completed safety status for the first implementation.
- Performs the T0021 final live Roller refresh before write.
- Re-runs eligibility against the refreshed data.
- Uses idempotency to prevent duplicate redemption attempts.
- Calls Roller `POST /redemptions` only after all checks pass.
- Updates `checkin_attempts`, ticket local state, handoff/session state, and event log.
- This replaces any direct phone call to the protected T0021 dev redeem path.
- The lower-level direct redeem dev token remains only for controlled internal/dev testing outside the normal staff handoff UI.

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

### `POST /v1/bookings/availability`

Returns the safe availability options used by the phone buy-entry flow. The phone app must call this JumpYard Cloud endpoint, not Roller directly.

Request:

```json
{
  "date": "2026-05-22",
  "startTimes": ["10:00", "10:30", "11:00"]
}
```

Response:

```json
{
  "status": "available",
  "date": "2026-05-22",
  "startTimes": [
    {
      "startTime": "10:00",
      "products": [
        {
          "code": "E60",
          "name": "Entré 60 min",
          "productId": 1765860,
          "durationMinutes": 60,
          "unitPrice": 200,
          "currency": "SEK",
          "capacityRemaining": 153
        },
        {
          "code": "socks",
          "name": "JumpSocks",
          "productId": 1765445,
          "durationMinutes": 0,
          "unitPrice": 45,
          "currency": "SEK",
          "capacityRemaining": null
        }
      ]
    }
  ],
  "source": {
    "system": "roller",
    "environment": "playground",
    "endpoint": "GET /product-availability"
  }
}
```

Availability rules:

- Use Roller `GET /product-availability` server-side.
- Query parent product ids for the relevant phone jump-entry products and return only the normalized product/time/capacity fields needed by the phone flow.
- T0113 also returns mapped stock add-ons such as socks, padlock, and coffee as `type='addon'` rows with product ids and `unitPrice` derived from `jumpyard.product_catalog_cache`.
- Capacity-gated add-ons such as SkyRider still derive availability and price from Roller `GET /product-availability`.
- Capacity must be checked again before quote and before draft creation because availability can change between screen steps.
- Frontend quantity controls must be capped by the returned capacity, but server-side quote/draft validation remains authoritative.

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
  "quote": {
    "externalId": "JY-Q-...",
    "costs": {
      "total": 260,
      "amountOwing": 260,
      "tax": 14.72
    },
    "itemCount": 1,
    "expiresAt": null
  },
  "source": {
    "system": "roller",
    "environment": "playground",
    "endpoint": "POST /bookings/draft/costs",
    "wroteBooking": false
  }
}
```

Quote rules:

- Use Roller `POST /bookings/draft/costs`.
- T0031 implemented this in the deployed booking Lambda.
- Quote returns normalized `bookingCosts` fields and must not return a Roller booking id.
- Use `/product-availability` before quote when the selected product is session/capacity constrained.
- T0033 implemented server-side availability re-check before quote.
- Product list prices are display hints only; final price comes from Booking Costs.
- T0033 phone pre-payment flow should expose availability/capacity only through JumpYard Cloud. The phone app must not call Roller `/product-availability` directly.
- T0113 removes static phone add-on prices; buy-entry and existing-booking add-on selection prices come from the JumpYard Cloud availability response before quote/draft/payment.

### `POST /v1/bookings/draft`

Creates a draft booking for a new booking flow.

Request:

```json
{
  "confirmDraft": true,
  "idempotencyKey": "client-or-server-generated-key",
  "customer": {
    "firstName": "Guest",
    "lastName": "Guest",
    "email": "guest@example.com",
    "phone": "+46000000000"
  },
  "items": [
    {
      "productId": 1765836,
      "quantity": 1,
      "bookingDate": "2026-05-22",
      "startTime": "10:00"
    }
  ]
}
```

Draft rules:

- Use Roller `POST /bookings/draft`.
- T0031 implemented this in the deployed booking Lambda.
- `confirmDraft=true` and an idempotency key are required because this creates a Roller Playground draft booking.
- First name, last name, email, and phone are required for the current server contract.
- For the phone buy-entry path, `items[]` may contain the core entry product plus selected mapped add-ons so the guest pays once for the combined basket.
- Draft creation holds capacity through Roller's draft timer.
- Return the draft unique id, normalized costs, payment config from `GET /venues/me`, and the raw `paymentJwt` only in the API response.
- Do not log, print, or persist the raw `paymentJwt`.
- T0033 persists safe draft metadata to `jumpyard.prepayment_booking_drafts`, including `payment_jwt_present` and `payment_config_available` flags, but no raw `paymentJwt` value.
- For the kiosk card-present path, the client adds `channel: "kiosk"` and `paymentTerminalAlias: "primary"`. JumpYard Cloud resolves the alias from `paymentTerminals` in the existing server-side ROLLER secret and sends the opaque `paymentTerminal` only to ROLLER.
- The kiosk response contains a safe payment-attempt id plus the ROLLER payment API origin and currency, never the terminal reference. JumpYard Cloud re-quotes server-side and requires exact amount plus SEK evidence before returning the terminal-bound JWT.
- If amount owing is zero, use `POST /bookings/draft/publish`.
- Payment implementation must first confirm how Roller's returned `paymentJwt` is used, which fake/test card numbers are supported in Playground, and whether the payment component can run inside the JumpYard PWA without a hosted payment-link detour.

### `POST /v1/bookings/draft/finalize`

Records a sanitized ROLLER terminal result for one server-owned kiosk payment attempt. `approved` calls ROLLER draft publish and then reads the booking back; only a settled authoritative booking returns `booking_confirmed`. `failed`, `cancelled`, and `unknown` update only monotonic safe attempt state.

Required fields are `prepaymentDraftId`, `paymentAttemptId`, `rollerDraftUniqueId`, `outcome`, and an idempotency key. All identifiers must match one `card_present` new-booking row. The endpoint accepts no card data, receipt data, processor reference, terminal id, or raw payment JWT. A late non-approved result cannot downgrade an approved or reconciled attempt.

T0030 discovery result:

- Local dry-run command: `npm run roller:payment:discover`.
- Guarded Playground draft command: `npm run roller:payment:discover:apply-draft` plus `ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_PLAYGROUND_DRAFT_BOOKING`.
- Guarded apply created draft unique id `bcb88005-ae64-4617-ba7a-b02b095a86c2` in Playground for a fake customer and did not process payment.
- The draft response returned HTTP `201`, total `260`, amount owing `260`, and a present three-part `paymentJwt`.
- The script summarizes only safe identifiers and JWT shape; it never prints the raw JWT, access token, client secret, or customer PII beyond fake-domain metadata.
- Roller Payments via API docs confirm the intended custom checkout sequence: get venue payment configuration, bootstrap Roller's payment library, create a draft booking, pass the returned JWT to `setupPayment`, let Adyen drop-in collect payment, then use payment result and booking-created webhook for success handling.
- T0050 captured Pabel's payment-readiness answer: API-key access authorizes Roller Payments via API, `GET /venues/me` provides `paymentSettings`, the public test origin must be allowlisted, and Adyen's Visa test card ending `1142` should be used from official docs. The readiness script checks Roller's version-history docs page because the docs root is a navigation entry.

T0031 deployed endpoint result:

- `POST /v1/bookings/quote` returned HTTP `200`, total `260`, amount owing `260`, tax `14.72`, and `wroteBooking=false` for product `1765836`.
- `POST /v1/bookings/draft` returned HTTP `201`, draft unique id `2c1abf4f-944c-4122-a4ff-da8440c46321`, total `260`, amount owing `260`, `paymentJwtPresent=true`, `paymentJwt` part count `3`, and available payment config.
- T0031 writes only safe `jumpyard.idempotency_records` and `jumpyard.event_log` rows; it does not persist raw payment JWTs.

T0032 POC harness result:

- `npm run roller:payment:poc` calls the deployed JumpYard Cloud quote endpoint and creates no Roller booking.
- `npm run roller:payment:poc:apply-draft` is guarded by `ROLLER_PAYMENT_POC_ALLOW_DRAFT=I_UNDERSTAND_THIS_CREATES_PLAYGROUND_DRAFT_BOOKING`.
- The harness reports only safe fields such as total, amount owing, draft unique id, JWT presence/part count, venue payment config availability, package URL host, and public origin host.
- Full browser payment is now unblocked by Pabel's `https://jumpyard-check-in.pages.dev` allowlist confirmation; public payment smokes still need to run after the current phone flow is deployed.

T0051 phone payment execution result:

- The phone buy-entry flow vendors Roller's approved `@roller/ecom-payments` package `v217` from the official Version History download.
- The frontend still calls JumpYard Cloud for availability, quote, and draft creation. It does not receive Roller client credentials and does not call general Roller REST APIs.
- The raw draft `paymentJwt` is used only in memory by the payment component and remains out of Aurora, logs, source, and visible DOM text.
- The component bootstraps the Roller package with `paymentSession.config` from `GET /venues/me.paymentSettings`, renders the Adyen drop-in into the buy-entry payment step, and handles approved/failed/received callbacks.
- After approved payment, the phone app resolves the draft booking through JumpYard Cloud lookup so the normal check-in session path can continue. If the booking-created webhook or Roller lookup has not caught up yet, the UI shows a retryable sync state.
- T0052 reuses the same payment component for add-product drafts.

T0053 new-booking basket result:

- The phone buy-entry flow now collects add-ons before contact, review, draft creation, and payment.
- New bookings create one Roller draft containing the entry product plus selected mapped add-ons, then start one payment for that combined basket.
- The flow order is `time -> entry product/quantity -> add-ons -> contact -> review -> one draft -> one payment`.
- Stock add-ons such as socks, padlock, and coffee are included in the same draft payload with `requireAvailability=false`; the core entry product is still gated by the availability screen before selection.
- Existing-booking add-products remain a separate linked add-on draft path and are not changed by T0053.

T0033 phone pre-payment result:

- `POST /v1/bookings/availability` is deployed and returns normalized Roller Playground availability for phone jump-entry products.
- The phone app buy-entry path now selects one of the next three half-hour start times, caps quantity by server-returned capacity, collects first name, last name, email, and phone, quotes through JumpYard Cloud, creates a guarded Roller Playground draft, and stops at payment pending.
- `jumpyard.prepayment_booking_drafts` stores safe draft state, totals, selected item summary, guest email/phone plus masked/hash fields, and JWT/config presence flags.
- Raw `paymentJwt` values remain response-only for future payment package/drop-in work and are not persisted in Aurora.

T0035 phone add-product result:

- The existing-booking add-ons screen calls JumpYard Cloud add-product quote/draft endpoints instead of the old local/mock payment path.
- The phone app collects first name, last name, email, and phone before creating an add-on draft because Roller draft booking requires customer fields.
- Mapped Playground add-ons are currently JumpSocks `1765445`, Hänglås `1765441`, Bryggkaffe `1765452`, and SkyRider `1765443`; unmapped products are blocked in the phone UI until a server-owned catalog exists.
- T0052 phone add-product payment execution reuses the T0051 Roller payment package/drop-in when the separate add-on draft returns a response-only `paymentJwt` and venue payment config.
- Missing JWT/config/package setup still stops at the safe payment-pending fallback.
- Approved add-product payment continues the original booking's check-in flow and bypasses the old local/mock `APP_PAYMENT` screen.
- Stock-only selections such as socks-only or padlock-only create separate linked add-on drafts. They must not be routed into safety, QR, or ticket redemption as standalone check-in bookings.

### `POST /v1/bookings/{bookingReference}/add-products/quote`

Calculates an existing-booking product addition before changing the original booking.

Request:

```json
{
  "requireAvailability": true,
  "items": [
    {
      "productId": 1765860,
      "quantity": 1,
      "bookingDate": "2026-05-22",
      "startTime": "11:00"
    }
  ]
}
```

Response:

```json
{
  "status": "quoted",
  "quote": {
    "externalId": "JY-AQ-...",
    "costs": {
      "total": 200,
      "amountOwing": 200
    },
    "itemCount": 1
  },
  "addOn": {
    "originalBookingReference": "5032210",
    "originalRollerUniqueId": "82eed927-963c-49fd-9602-4ad6361d0c5a",
    "mode": "separate_draft_booking"
  },
  "source": {
    "system": "roller",
    "environment": "playground",
    "endpoint": "POST /bookings/draft/costs",
    "wroteBooking": false
  }
}
```

Rules:

- Lookup booking detail through Roller first and block cancelled, deleted, or draft originals.
- For SkyRider or other session products, run availability check first when `requireAvailability=true`.
- Use Roller `POST /bookings/draft/costs` on the add-on booking payload to show final price impact.
- Do not call `PUT /bookings/{uniqueId}` as the primary pilot path.
- Quote mode must not create a Roller draft booking or Aurora booking link.
- T0034 implements this in the deployed booking Lambda.

### `POST /v1/bookings/{bookingReference}/add-products`

Adds products to an existing booking after user confirmation.

Request:

```json
{
  "confirmDraft": true,
  "idempotencyKey": "client-or-server-generated-key",
  "customer": {
    "firstName": "Guest",
    "lastName": "Guest",
    "email": "guest@example.com",
    "phone": "+46000000000"
  },
  "items": [
    {
      "productId": 1765860,
      "quantity": 1,
      "bookingDate": "2026-05-22",
      "startTime": "11:00"
    }
  ]
}
```

Response:

```json
{
  "status": "add_product_draft_created",
  "draft": {
    "uniqueId": "18e85e91-9a53-4afd-a951-75d1a41eaf9f",
    "bookingReference": null,
    "costs": {
      "total": 200,
      "amountOwing": 200
    }
  },
  "addOn": {
    "addOnGroupId": "jyao_...",
    "originalBookingReference": "5032210",
    "mode": "separate_draft_booking"
  },
  "prepayment": {
    "flowType": "add_product",
    "status": "payment_pending"
  }
}
```

Rules:

- Primary pilot pattern: create a separate add-on booking in Roller for the selected products.
- Link the original booking and add-on booking in JumpYard Cloud using the original `rollerUniqueId`, original `bookingReference`, add-on `rollerUniqueId`, add-on `bookingReference`, and an internal `addOnGroupId`.
- T0034 stores that link in `jumpyard.booking_links` with `link_type='add_product_draft'` and stores add-product draft metadata in `jumpyard.prepayment_booking_drafts` with `flow_type='add_product'`.
- `confirmDraft=true`, customer fields, and an idempotency key are required because the route creates a Roller Playground draft booking.
- Raw `paymentJwt` values remain response-only and are not persisted in Aurora.
- Keep the guest inside the JumpYard PWA/check-in flow as much as possible by using the new booking/payment path instead of same-booking hosted payment link.
- Do not use same-booking `PUT /bookings/{uniqueId}` plus payment link as the primary pilot path.
- Same-booking update remains a future option only if Roller confirms a reliable return path and JumpYard explicitly chooses that UX.
- Stock/add-on products cannot be redeemed through the same ticket-level API path unless configured as ticket/session products.
- T0052 phone UI renders the Roller payment drop-in for add-product drafts when JWT/config are present, keeps the payment-pending fallback when blocked, and continues the original booking's check-in path only after the payment component reports an approved payment.
- T0054 confirms the public payment package can complete at least Swish in Roller Playground. Booking `5063382` was returned as `Paid`/`canCheckIn=true` by JumpYard Cloud after the public Swish smoke.
- Card collection must remain inside Roller's approved payment package. The current Playground custom-checkout configuration does not expose a `scheme`/card method, so JumpYard must not add its own card form. Roller/Adyen configuration must expose `scheme` before the Adyen Visa test card ending `1142` can be tested.

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

Current implementation has progressed through `T0054` merged to main and `T0055` phone-flow continuation in progress. The old T0040 payment placeholder is superseded by the T0050+ payment sequence.

Near-term sequence:

1. `T0026 Staff/admin handoff list/detail`: completed locally and deployed to dev; staff can inspect ready handoffs.
2. `T0027 Staff-confirmed redeem from session`: completed locally; staff can confirm redeem from a server-owned session after final Roller refresh.
3. `T0028 QR/handoff code polish`: completed locally; phone QR uses `JY_HANDOFF:<handoffCode>:<checkinSessionId>`, and admin can scan/paste the payload or search by short code.
4. `T0029 Phone session resume`: completed locally; paid lookup starts/resumes the server session, ready handoffs resume directly from search to the QR screen, completed/redeemed sessions show already checked in, and guest-in-progress sessions continue normally.
5. `T0030 New booking/payment discovery spike`: completed locally; `POST /bookings/draft` and `paymentJwt` are confirmed, while payment package, test cards, and domain allowlisting remain prerequisites.
6. `T0031 Server-side booking quote/draft`: completed and deployed to dev; JumpYard Cloud quotes costs and creates confirmed draft bookings while keeping Roller credentials server-side.
7. `T0032 Payment package proof-of-concept`: completed locally as a safe harness; quote/draft can be exercised through JumpYard Cloud, but the payment drop-in is still externally blocked by package, allowlist, and test-card prerequisites.
8. `T0033 Phone create-booking pre-payment flow`: completed and deployed to dev; phone buy-entry reaches a Roller Playground draft and payment-pending state through JumpYard Cloud without rendering payment UI.
9. `T0034 Existing-booking add-product draft step 1`: completed and deployed to dev; JumpYard Cloud can quote and create a separate linked add-on draft for an existing booking.
10. `T0035 Phone add-product UI wiring`: completed locally; the phone existing-booking flow can quote mapped add-ons, create a separate linked add-on draft, and stop at payment pending.
11. `T0036 Data API backfill and sync foundation`: completed locally; a dry-run-first orchestrator runs bookingitems, related Data API sources, and product refresh over explicit daily modified-date windows.
12. `T0037 Scheduled daily Data API sync`: completed in dev AWS; EventBridge invokes a dedicated data-sync Lambda daily, imports the previous modified-date window, refreshes products, and records health in `jumpyard.booking_seed_runs`.
13. `T0038 SMS token/session link foundation`: create secure JumpYard Cloud links that start or resume check-in sessions without using raw booking numbers as authority.
14. `T0039 SMS sending`: integrate the selected SMS provider and send check-in links from server-owned booking/session state.
15. `T0040 Roller payment package/drop-in integration`: old placeholder; superseded by T0050-T0053.
16. `T0041 Controlled SMS live smoke`: completed; sent one confirmed dev SMS through JumpYard Cloud and verified the Aurora audit trail.
17. `T0042 SMS delivery diagnostics`: completed; configured SNS delivery status logs and identified SNS sandbox as the delivery blocker.
18. `T0043 SNS sandbox phone verification`: completed; verified the test phone in SNS sandbox and proved one real SMS delivery path.
19. `T0044 Phone SMS link resume`: completed and deployed to dev; phone links with `jy_token` resolve through JumpYard Cloud and route from server session state.
20. `T0045 Booking-time SMS trigger`: completed in dev foundation; protected endpoint plans due booking reminders and sends only with explicit confirmation while respecting SNS sandbox limits.
21. `T0046 Scheduled booking-time SMS processing`: completed in dev AWS; EventBridge invokes the T0045 due-SMS processor every 5 minutes, running dev planning mode by default.
22. `T0047 Staff auth replacement`: completed; replaces the normal admin temporary redeem-code flow with staff login and short-lived staff tokens for staff list/detail/redeem.
23. `T0048 Staff operations polish`: completed; admin handoff now uses JumpYard phone-app visual assets, the documented system sans-serif font stack, mobile-first layout, larger tap targets, and selected-detail-first behavior on phone-sized screens without changing backend contracts.
24. `T0049 Confirmed scheduled SMS sends`: completed and deployed; confirmed scheduled SMS remains disabled by default and requires a public HTTPS base URL plus explicit approval phrase.
25. `T0050 Payment readiness/bootstrap`: completed and merged; documents the T0040 replacement, captures Pabel's answers, and adds safe readiness validation.
26. `T0051 New-booking payment execution`: completed and merged; integrates the Roller payment package/drop-in for new booking drafts, with public browser payment smoke pending allowlist confirmation.
27. `T0052 Add-product payment execution`: completed and merged; reuses the proven payment execution path for separate linked add-product drafts.
28. `T0053 New-booking basket before payment`: completed and merged; moves add-ons before contact/review/payment so one Roller draft/payment covers entry plus selected add-ons.
29. `T0054 Public payment method smoke`: completed and merged; confirms public Swish payment works, documents the missing card/scheme blocker, and keeps card collection inside Roller's approved package.
30. `T0055 New-booking paid continuation`: current phone-flow ticket; after paid new booking, route into safety/QR instead of repeating add-ons/payment, and add a buy-entry progress indicator.
31. `T0056 Staff production readiness`: later separate ticket for production staff identity, roles, MFA/session policy, and audit ownership.

## Open Contract Questions

- How should published add-on bookings update `jumpyard.booking_links.linked_booking_reference` after payment/publish completes?
- Should add-on product ids come from a server-owned add-on catalog endpoint before production/multi-venue rollout?
- Which tenders work in the new add-on booking checkout flow: gift card, membership code, multi-visit value?
- Will Roller/Adyen enable the `scheme` card method for Playground custom checkout so the Adyen Visa test card ending `1142` can be tested on `https://jumpyard-check-in.pages.dev`?
- What exact response shape should JumpYard expect from `POST /redemptions` for partial success/failure?
- Which webhook event id should be used for idempotent webhook processing?
- Which production Data API schedule, timezone, and backfill range should JumpYard use for the live morning booking seed?
- Which products must be reconfigured from stock/add-on to ticket/session products if JumpYard wants API-driven redemption?
- What is the preferred availability-display pattern for core jump-entry products and durations?
- What AWS account, region, environment name, owner, data classification, exportability, and cost center should be used for the first dev deploy?
