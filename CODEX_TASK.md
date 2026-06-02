# CODEX_TASK.md

## Ticket ID
T0088

## Goal
Add real-time guest-name enrichment for Roller webhook-created/updated bookings so staff-admin can show and search guest names before the daily Data API customer import has run.

## Dependencies
- T0087 completed and merged.
- Roller booking webhook enrichment already fetches `GET /bookings/{identifier}`.
- Official Roller Rest API docs confirm read-only `GET /guests/{guestId}` where `guestId` is formerly/equivalent to `customerId`.
- T0083 staff-admin identity/search already reads names from `jumpyard.guest_profiles.latest_booking_context`.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- infra/lambda/webhook/index.js

## Do not touch
- Staff/admin UI behavior
- Guest phone UI behavior
- Other JumpYard Cloud Lambda code
- Aurora migrations
- Data API importer behavior
- Roller write API paths
- Payment behavior
- SMS/email behavior
- Package dependencies
- Assets
- Deliverables
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Extend webhook booking-detail normalization to extract structured guest identity when Roller returns it:
   - Roller customer id
   - first name
   - last name
   - email
   - phone/contact number

2. If booking detail only returns a Roller customer/guest id, use one safe read-only fallback:
   - call `GET /guests/{guestId}` once
   - only for Playground webhook enrichment
   - only when booking detail lacks first/last/contact data
   - never print raw names, emails, or phone numbers

3. Upsert webhook-derived guest identity into `jumpyard.guest_profiles`:
   - use `roller_customer:<id>` when a Roller customer id is present
   - fall back to existing contact-hash profile id only when email or phone exists
   - store first/last name in `latest_booking_context`
   - keep email/phone masking and hashing consistent with existing import behavior
   - never print raw names, emails, or phone numbers in Lambda responses or validation output

4. Connect webhook-enriched bookings/tickets to guest profiles:
   - include `bookingCustomerId` in the booking normalized summary when available
   - write `roller_customer_id` to webhook-enriched ticket rows when available
   - preserve existing Data API importer behavior

5. Keep webhook behavior safe:
   - do not call any Roller write endpoint
   - keep the existing `GET /bookings/{identifier}` enrichment path
   - use only the documented read-only `GET /guests/{guestId}` fallback when needed
   - do not change webhook registration
   - do not add new Aurora migrations

6. Document the T0088 behavior, validation, and remaining limitations.

## Non-goals
- Do not change staff/admin UI.
- Do not change phone UI.
- Do not add new Roller Data API imports.
- Do not create a guest-name lookup button or admin manual refresh.
- Do not store raw Roller payloads.
- Do not expose full email or phone in public guest UI.
- Do not create staging/live resources.
- Do not enable guest messaging production unlock.
- Do not change SMS/email sending behavior.

## Acceptance criteria
- Webhook enrichment can update `guest_profiles` from Roller booking detail customer fields.
- Webhook enrichment can update `guest_profiles` from documented Roller guest detail when booking detail only has a customer/guest id.
- Webhook-enriched booking summaries include `bookingCustomerId` when available.
- Webhook-enriched tickets include `roller_customer_id` when available.
- Lambda response and logs expose only safe booleans/statuses for guest enrichment.
- No staff/admin UI, phone UI, payment, SMS/email, package, asset, or production config behavior changes.
- Root validation passes.

## Manual verification
Trigger a safe Roller Playground booking webhook enrichment for a booking with customer first/last name. Confirm:
- webhook response reports guest profile status without raw PII
- `jumpyard.guest_profiles.latest_booking_context` contains first/last name
- `jumpyard.roller_bookings.normalized_summary` contains `bookingCustomerId`
- staff search can find the handoff by stored name after the booking is ready for staff

## Automated validation
Run:
- node --check infra/lambda/webhook/index.js
- npm --prefix infra run synth:dev
- npm run validate
- git diff --check
