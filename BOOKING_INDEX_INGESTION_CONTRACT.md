# Booking Index Ingestion Contract

This file defines the Sprint 1 ingestion contract for keeping JumpYard Cloud's booking index useful without making Roller less authoritative.

T0005 is a contract ticket only. It does not implement jobs, webhooks, database migrations, API endpoints, Roller writes, or AWS deployment.

## Source Materials

- `PROJECT_CONTEXT.md`
- `DECISIONS.md`
- `JUMPYARD_CLOUD_CONTRACT.md`
- `C:\Users\lovea\Desktop\dev\Jumpyard_Next\jumpyard-processes\editor\src\data\pilotFlow.ts`
- `ROLLER Rest API - Reference from website.pdf`
- `Roller_Response_v1_260414.pdf`
- `Roller_Response_v2_260423.pdf`
- `Roller_Response_v3_260429.pdf`

## Confirmed Pattern

JumpYard Cloud should keep an operational booking index with three ingestion paths:

```text
Initial Data API backfill -> Aurora booking snapshot baseline
Daily Data API modified-date sync -> incremental Aurora upserts
Roller booking webhook -> same-day change signal
Live REST lookup -> authoritative refresh before critical actions
```

Roller remains the source of truth. The local booking index is a speed, UX, support, and resilience layer. It must never be used as the final authority before a write such as ticket redemption, booking creation, add-on booking creation, or payment-related operations.

## Ingestion Goals

| Goal | Why |
|---|---|
| Preload expected guests | Staff and guests should not depend on a live Roller read for every normal lookup during peak arrival. |
| Keep same-day updates fresh | New, updated, paid, and cancelled bookings after the morning seed must become searchable quickly. |
| Support SMS and pre-check-in | SMS/token jobs need booking context and customer contact data before guests open the phone flow. |
| Preserve auditability | Support needs to see which source last updated a booking and when. |
| Reduce Roller load | Data API seed and webhooks reduce repeated live REST polling. |
| Fail safely | When index freshness is uncertain, JumpYard Cloud should refresh from Roller or route to staff. |

## Non-Goals

- Do not replace Roller as the booking source of truth.
- Do not implement daily seed code in T0005.
- Do not implement webhook handlers in T0005.
- Do not implement database migrations in T0005.
- Do not store full raw Roller payloads unless a later retention/PII ticket approves it.
- Do not call Roller writes from ingestion jobs.
- Do not deploy AWS resources.

## Data Flow Overview

```text
Roller Data API
  -> daily seed run
  -> normalize bookings, tickets, products, payments, customers
  -> upsert Aurora / Roller Snapshot
  -> upsert minimal Aurora / Operational State
  -> write sync metrics and event log

Roller booking webhook
  -> verify and dedupe intake
  -> store normalized event record
  -> normalize directly if payload is complete
  -> otherwise enqueue enrichment
  -> optional Get Detail of Booking refresh
  -> optional customer/guest detail refresh when contact data is needed
  -> upsert snapshot and operational state

Phone/admin/staff live lookup
  -> read local index first when useful
  -> refresh from Roller when missing, stale, or check-in-critical
  -> upsert refreshed snapshot
  -> return normalized JumpYard response
```

## Source Priority

When multiple sources update the same booking, apply this precedence:

| Source | Use | Authority |
|---|---|---|
| Live `GET /bookings/{id}` | Critical guest/staff action confirmation and enrichment. | Highest for current booking state. |
| Complete booking webhook payload | Same-day created, updated, paid, or cancelled booking detail. | High if payload includes needed fields and is newer than local record. |
| Webhook enrichment `GET /bookings/{id}` | Authoritative detail after a webhook signal. | High. |
| Daily Data API seed | Baseline expected guests, tickets, payments, customers. | Baseline only; should not overwrite newer webhook/live observations. |
| Local operational state | Safety, tokens, handoff, local status. | Authoritative only for JumpYard-owned pilot state. |

Rules:

- Compare Roller modified/updated timestamps when available.
- If timestamps are unavailable, use received order but never let an older seed overwrite a newer webhook/live update.
- Cancelled/deleted bookings should be tombstoned or status-marked, not hard deleted during the same operating day.
- Payment and ticket status from Roller must overwrite local stale status when newer.
- JumpYard-owned fields must not be overwritten by Roller seed data.

## Data API Backfill And Daily Sync Contract

### Purpose

The initial backfill builds the local Aurora baseline. The daily sync then keeps it current by importing Roller records modified since the previous sync.

ROLLER Data API `startDate` and `endDate` are modified-date windows. They are not a direct query for all visits on a given `bookingDate`. Returned `bookingDate` values are used by JumpYard Cloud for local visit-date filtering after records have been imported.

Default daily cadence:

```text
01:00-07:00 Europe/Stockholm daily, outside business hours
```

Initial backfill window:

```text
TBD approved historical/future window, for example 12 months back plus relevant future bookings
```

Daily incremental window:

```text
previous successful sync modified-date window -> current sync end
```

The exact backfill range remains configurable because operational needs, API limits, and data retention policy must be approved before large imports.

### Roller Inputs

The editor flow and Roller response material identify these Data API endpoints as the daily seed sources:

| Endpoint | Purpose | T0005 Confidence |
|---|---|---|
| Get bookings / `/data/bookingitems` | Booking item baseline and lookup keys. | Confirmed in T0011 with `startDate`, `endDate`, `pageNumber`, `pageSize`. |
| Get tickets | Ticket ids, ticket holder context, membership status, redeem readiness context. | Confirmed pattern, exact query params TBD. |
| Get payments | Payment ledger/status context for check-in and support. | Confirmed pattern, exact query params TBD. |
| Get customers | Customer/contact cache for SMS readiness. | Confirmed pattern, exact query params TBD. |

Do not use Get attendance for the expected-guest seed. Attendance is for actual arrivals/redeem reconciliation, not for building the morning list of expected guests.

### Seed Run State

Each seed run should create a `booking_seed_runs` row before work starts.

Required fields:

| Field | Purpose |
|---|---|
| `run_id` | Internal id for the seed attempt. |
| `roller_env` | `playground`, later `prod` only when approved. |
| `venue_id` | JumpYard venue/environment identifier. |
| `date_range_start` | First booking date included. |
| `date_range_end` | Last booking date included. |
| `status` | `pending`, `running`, `succeeded`, `partial`, `failed`. |
| `started_at` | Seed start timestamp. |
| `finished_at` | Seed finish timestamp. |
| `source_counts` | Counts per source endpoint. |
| `upsert_counts` | Rows inserted/updated/skipped. |
| `error_summary` | Safe, non-secret error summary. |

The backfill/sync job must be idempotent for the same environment, venue, endpoint, and modified-date range.

### T0011 Data API Findings

`npm run roller:data:smoke` confirmed Playground access to `GET /data/bookingitems` using current local credentials.

Observed modified-date window:

```text
2026-05-20 -> 2026-05-21
```

Observed safe response summary:

| Field | Value |
|---|---|
| Response shape | Object with `currentPage`, `totalPages`, `totalItems`, `itemsPerPage`, `items` |
| Pages fetched | `1` |
| Records returned | `9` |
| Seed booking references found | `5032210`, `5032211`, `5032212`, `5032213`, `5032214`, `5032215` |
| Booking dates returned | `2026-05-21`, `2026-05-22` |
| Modified date range | `2026-05-20T09:05:03Z -> 2026-05-20T09:05:05Z` |

Safe sample fields included `bookingReference`, `bookingUniqueId`, `bookingItemId`, `productId`, `bookingCustomerId`, `sessionStart`, `sessionEnd`, `bookingName`, `bookingNotes`, `bookingFeeAmount`, `bookingTotal`, `bookingPosNotes`, `bookingDate`, `bookingEndDate`, `bookingStatus`, `bookingLocation`, `quantity`, `groupSize`, `createdDate`, and `bookingCreatedDate`.

### T0012 Bookingitems Import Findings

T0012 added a dev importer:

```text
npm --prefix infra run import:bookingitems:dev
npm --prefix infra run import:bookingitems:dev:apply
```

The dry-run command fetches and normalizes records without AWS writes. The apply command writes only when:

```text
ROLLER_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_BOOKINGITEMS
```

Applied import result for modified-date window `2026-05-20 -> 2026-05-21`:

| Target | Result |
|---|---|
| Data API records read | `9` |
| `jumpyard.roller_bookings` matched after import | `6` |
| `jumpyard.roller_booking_items` matched after import | `9` |
| Skipped records | `0` |
| Latest seed run status | `succeeded` |

The importer stores normalized operational fields and safe summaries only. It does not print or store raw Roller payloads, customer names, emails, phone numbers, or booking notes.

### T0013 Product Catalog Import Findings

T0013 added a dev product cache importer:

```text
npm --prefix infra run import:products:dev
npm --prefix infra run import:products:dev:apply
```

The dry-run command reads Roller REST `/products`, flattens top-level products and child/variation products, and performs no Aurora writes. The apply command writes only when:

```text
ROLLER_PRODUCT_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_PRODUCTS
```

Applied import result:

| Target | Result |
|---|---|
| Roller top-level products read | `96` |
| Flattened product/variation rows | `491` |
| `jumpyard.product_catalog_cache` matched after import | `491` |
| `jumpyard.roller_booking_items` rows enriched with names | `9` |

The importer stores normalized product catalog summaries only. It enriches booking item rows from product IDs and avoids booking free-text fields for product display.

### T0014 Related Data API Import Findings

T0014 added a dev migration and importer:

```text
npm --prefix infra run migrate:dev
npm --prefix infra run import:related-data:dev
npm --prefix infra run import:related-data:dev:apply
```

The import reads Roller Data API endpoints:

| Endpoint | Purpose | T0014 seed-window result |
|---|---|---|
| `/data/tickets` | Ticket ids for future ticket-level redemption. | `6` records |
| `/data/bookingpayments` | Payment rows for reconciliation. | `0` records |
| `/data/customers` | Structured customer contact data for SMS/check-in readiness. | `6` records |

The apply command writes only when:

```text
ROLLER_RELATED_IMPORT_ALLOW_WRITE=I_UNDERSTAND_THIS_WRITES_DEV_AURORA_RELATED_DATA
```

Applied import result for modified-date window `2026-05-20 -> 2026-05-21`:

| Target | Result |
|---|---|
| `jumpyard.roller_booking_tickets` matched after import | `6` |
| `jumpyard.roller_booking_payments` matched after import | `0` |
| `jumpyard.guest_profiles` matched after import | `6` |

Email and phone are stored as explicit structured fields with hash/masked companion fields. Customer names, addresses, booking notes, raw payloads, secrets, and tokens are not printed or intentionally stored in T0014.

### Seed Upsert Targets

| Target | Source | Required Behavior |
|---|---|---|
| `roller_bookings` | Get bookings plus booking detail where available. | Upsert by `roller_unique_id`; keep `booking_reference` unique where present. |
| `roller_booking_items` | Get bookings / Get tickets. | Upsert by `booking_item_id` where available; otherwise deterministic hash from booking + product + session. |
| `roller_booking_tickets` | `/data/tickets`. | Upsert by `ticket_id` and link to existing booking/item rows where possible. |
| `roller_booking_payments` | `/data/bookingpayments`. | Upsert by `booking_payment_id` or deterministic payment transaction key. Empty pages are valid. |
| `guest_profiles` | `/data/customers`. | Upsert structured email/phone contact data with masked/hash fields and safe context only. |
| `product_catalog_cache` | Roller REST `/products`. | Keep cached product names/types for display and normalization, then enrich `roller_booking_items` by `product_id`. |
| `event_log` | Seed job itself. | Append run started, completed, partial, failed events. |

### Seed Failure Rules

- A failed seed must not clear or delete the previous successful snapshot.
- A partial seed should mark incomplete source endpoints and keep stale existing records visible with a stale flag.
- Retry transient endpoint failures with backoff.
- If an endpoint repeatedly fails, record the failure and continue with sources that succeeded when safe.
- The phone lookup flow should treat records from a failed or stale seed as requiring live refresh before check-in decisions.

## Booking Webhook Contract

### Purpose

Booking webhooks are the same-day change signal. They should catch bookings created, updated, paid, cancelled, or otherwise changed after the morning seed.

Roller response v2 indicates that a correctly configured booking webhook can contain booking-level data equivalent to Get Detail of a Booking, and payment records can be included when configured with payments included.

T0015 implements the first deployed dev intake endpoint:

```text
POST https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings
```

It stores only normalized event metadata and a payload hash in Aurora. It does not call Roller, mutate booking snapshots, register webhooks, or store raw payloads.

### Intake Steps

1. Receive webhook at JumpYard Cloud.
2. Validate the request using the best Roller-supported verification method. T0015 uses a dev-only shared token until the official production auth header/signature is confirmed.
3. Compute an idempotency key:
   - Prefer Roller webhook event id if provided.
   - Otherwise use a stable hash of event type, booking identifier, payload hash, and received timestamp bucket.
4. Insert or ignore duplicate into `roller_webhook_events`.
5. Store only normalized event metadata by default.
6. Enqueue enrichment when payload is incomplete, suspicious, or missing contact/payment detail needed for the flow.

### Webhook Event State

`roller_webhook_events` should track:

| Field | Purpose |
|---|---|
| `event_id_or_hash` | Idempotency key. |
| `event_type` | Created, Updated, Cancelled, Paid, or Roller-provided event name. |
| `booking_reference` | Booking reference when present. |
| `roller_unique_id` | Unique id when present. |
| `payload_hash` | Hash for audit without storing raw payload by default. |
| `received_at` | Intake timestamp. |
| `status` | `received`, `normalized`, `pending_enrichment`, `processed`, `failed`, `ignored_duplicate`. |
| `error_summary` | Safe, non-secret failure reason. |

### Enrichment Rules

Use booking webhook payload directly when it is complete enough for the update. Enqueue enrichment when:

- The event lacks booking detail.
- The event lacks payment data needed for payment status.
- The event lacks customer/contact data needed for SMS or support.
- The event ordering is ambiguous.
- The event appears to contradict a newer local live lookup.

Enrichment reads:

| Read | When |
|---|---|
| `GET /bookings/{uniqueId or bookingReference}` | Authoritative booking state after webhook when needed. |
| Get customer/guest detail | Only when customer contact is missing and needed for SMS/readiness. |

### T0015 Intake Findings

Roller webhook documentation added during T0015 confirms:

| Finding | Impact |
|---|---|
| Booking webhook events are `Created`, `Updated`, and `Cancelled`. | Intake should accept these event names and also tolerate route-level fallback names while Playground payload shape is confirmed. |
| Webhooks are delivered by HTTP `POST` to a secure HTTPS endpoint. | Dev endpoint is API Gateway HTTPS and accepts only `POST`. |
| Endpoint should store or queue quickly, ideally under 1 second and within 10 seconds. | T0015 performs only token verification, JSON parsing, idempotent metadata insert, and event-log insert in the request path. |
| Roller does not guarantee event ordering. | Future enrichment must compare timestamps/freshness and must not assume create arrives before update/redemption. |
| Roller retries on `500`, `503`, and `504`. | T0015 returns HTTP `500` only for server/config/database failures that should be retried. |
| Receiving webhook events does not count toward the API call limit. | Webhook intake can reduce same-day polling pressure once registered. |

T0015 deployed smoke result:

| Case | Result |
|---|---|
| Missing token | HTTP `200`, `ignored_unauthorized`, no persistence. |
| First authorized event | HTTP `200`, `accepted`, inserted `roller_webhook_events` row. |
| Duplicate authorized event | HTTP `200`, `duplicate`, no duplicate row. |

### Webhook Failure Rules

- Duplicate webhooks must be ignored safely.
- Failed enrichment should remain retryable through SQS/EventBridge.
- Repeated enrichment failures should move to DLQ and create an operational event.
- If webhook verification support is unclear, deployment must not expose production webhook intake until verification is confirmed.

## Live Lookup Refresh Contract

### Purpose

Live REST lookup confirms the state that matters during a guest/staff action.

Use live lookup when:

- The booking is missing from the local index.
- The local index is stale.
- The user is about to redeem tickets.
- The flow is about to create/link an add-on booking.
- Payment status is unclear.
- A previous seed/webhook run failed or was partial.

Primary endpoint:

```text
GET /bookings/{uniqueId or bookingReference}
```

Fallback endpoint:

```text
GET /bookings
```

Use fallback search only when the guest lacks a precise QR/code/booking reference or direct lookup fails in a way that search can safely resolve.

### Freshness Labels

JumpYard Cloud should label booking index records with a freshness state:

| Freshness | Meaning | Behavior |
|---|---|---|
| `fresh` | Recently confirmed from webhook/live or current successful seed. | Can support display and low-risk lookup. |
| `stale` | Older than configured threshold or after partial/failed sync. | Display with caution; refresh before critical action. |
| `missing` | Not in index. | Use live lookup before declaring not found. |
| `conflict` | Sources disagree or ordering is unclear. | Route to live refresh or staff. |

The exact freshness threshold is implementation-specific, but check-in/redeem must always use a live or just-refreshed state.

## Aurora Model Additions

T0003 defined the broad Aurora model. T0005 adds ingestion-specific fields and indexes.

### `roller_bookings`

Required indexes:

- Unique `roller_unique_id`
- Unique or indexed `booking_reference`
- Indexed `booking_date`
- Indexed `payment_status`
- Indexed `last_seen_from_roller_at`
- Indexed `freshness_status`

Additional fields:

- `source_last_updated_by`
- `source_last_updated_at`
- `roller_modified_at`
- `freshness_status`
- `is_tombstoned`
- `payload_hash`

### `roller_booking_tickets`

Required indexes:

- Unique `ticket_id`
- Indexed `roller_unique_id`
- Indexed `booking_item_id`
- Indexed `redeem_status_last_seen`

### `guest_profiles`

Store minimal contact data:

- `roller_customer_id`
- `email_hash` or masked email where possible
- `contact_number_hash` or masked number where possible
- `sms_ready`
- `latest_booking_context`
- `last_seen_from_roller_at`

Do not store richer guest/customer profile data unless a later ticket approves it.

### `sync_runs`

Use `sync_runs` or `booking_seed_runs` to track all ingestion attempts:

- daily seed
- webhook enrichment
- live refresh
- reconciliation jobs

### `booking_events`

Append events for:

- seed started/completed/partial/failed
- webhook received/processed/failed
- live refresh started/completed/failed
- conflict detected
- stale booking used for display

## API Behavior Impact

### Lookup Endpoint

Future `POST /v1/check-in/lookup` should:

1. Try direct local index lookup by booking reference, QR/code, or unique id.
2. If missing or stale, refresh with `GET /bookings/{id}`.
3. If still not found and search is safe, use `GET /bookings` fallback.
4. Upsert the refreshed normalized result.
5. Return a normalized JumpYard response, not raw Roller payload.

### Redeem Endpoint

Future `POST /v1/check-in/redeem` should:

1. Require a current booking detail refresh or equivalent just-refreshed state.
2. Resolve ticket ids from local state only after confirming freshness.
3. Use Roller `POST /redemptions` from server-side code only.
4. Update check-in attempt audit and await webhook/reconciliation for counters where needed.

### SMS Jobs

Future SMS/token jobs should:

1. Read the booking index and operational state.
2. Send only for eligible upcoming bookings.
3. Skip or flag records with missing/unsafe contact data.
4. Avoid calling Roller live for every SMS candidate.

## Observability

Minimum metrics/events:

| Metric/Event | Purpose |
|---|---|
| Last successful daily seed time | Know if the morning baseline is valid. |
| Seed duration and record counts | Detect slow or incomplete seed jobs. |
| Webhook received/processed/failed counts | Detect intake and enrichment problems. |
| Webhook lag | Measure time from event receipt to snapshot update. |
| Live refresh count and failure rate | Detect over-dependence on live Roller reads. |
| Stale lookup count | Detect stale or insufficient ingestion. |
| Conflict count | Detect source ordering/schema problems. |
| DLQ depth | Detect failed async processing. |

## Security And PII Rules

- Roller credentials stay in AWS Secrets Manager.
- Do not log Roller access tokens or secrets.
- Do not expose raw Roller payloads to the phone app.
- Store raw webhook/Data API payloads only if a later ticket approves retention and PII policy.
- Prefer hashes/masked values for email and phone lookup where practical.
- Keep S3 raw payload retention short if raw payload storage is approved.
- Webhook verification method must be confirmed before production webhook exposure.

## Implementation Sequence

Recommended next implementation steps after T0014:

1. `T0015 Booking webhook intake`
   - Implement safe dev webhook intake and idempotency. Completed in T0015.
2. `T0016 Lookup Aurora-first`
   - Use Aurora first for display, then live REST refresh when missing, stale, or check-in-critical.
3. `T0017 Phone lookup display from Aurora`
   - Let the phone flow consume Aurora display data once Aurora-first lookup is in place.
4. `T0018 Webhook enrichment and registration`
   - Register the Playground booking webhook and process received events into booking snapshot updates outside the request path.

## Open Questions

| Question | Needed For | Status |
|---|---|---|
| Exact Data API query params/date filters for Get tickets, Get payments, and Get customers. | Related source ingestion. | Resolved for T0014 seed window; all three endpoints accepted `startDate`, `endDate`, `pageNumber`, and `pageSize`. |
| Whether Playground exposes Data API credentials/scopes separately from REST API credentials. | Data API implementation. | Resolved for `/data/bookingitems`; current Playground credentials work. |
| Exact webhook production auth header/signature/verification mechanism. | Webhook production safety. | Open |
| Exact webhook event id field and nested payload fields in Playground deliveries. | Idempotency and normalization. | Open |
| Whether to enable IP allowlisting for Roller EMEA webhook source IPs. | Production hardening. | Open |
| Whether booking webhook payload with payments is sufficient in all same-day cases or still needs detail refresh for safety. | Webhook enrichment strategy. | Partly confirmed |
| Which customer/guest endpoint should be used when contact data is missing in a late booking. | SMS readiness. | Open |
| Operational retention period for normalized booking snapshot, event log, and sync runs. | Data retention and cost. | Open |
