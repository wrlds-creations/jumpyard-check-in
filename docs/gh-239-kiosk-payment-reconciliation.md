# Issue #239 — Kiosk Payment Reconciliation

## Outcome

A definitive P400 approval becomes durable JumpYard Cloud state before ROLLER booking publication or readback. The kiosk receives `pending` immediately and may continue to safety. Booking confirmation continues in the existing Booking Lambda even if the browser or APK closes.

The kiosk must still wait for `confirmed` before final handoff or receipt/QR printing. That UI gate belongs to the paired kiosk issue `jumpyard-check-in-kiosk#36`.

## Flow

```text
ROLLER payment package reports approved
                 |
                 v
POST /v1/bookings/draft/finalize  action=result
                 |
                 +-- atomically preserve approved state
                 |
                 +-- async invoke existing Booking Lambda
                 |
                 `-- HTTP 202 { status: pending }

background reconciliation
  1. claim one worker for the approved attempt
  2. claim at most one POST /bookings/draft/publish attempt
  3. allow 10 seconds for the approved terminal payment to settle on the draft
  4. inspect publish response and authoritative GET /bookings/{id}
  5. retry readback at absolute 5-second offsets from 0 through 75 seconds
  6. confirmed paid booking -> confirmed
     exhausted/blocked/provider setup failure -> needs_staff

signed booking webhook or later lookup
  `-- may confirm the same approved record without creating another payment
```

The bounded window is 75 seconds from worker start, not a sum of successively longer sleeps. Booking Lambda timeout is 120 seconds. The 10-second settlement delay is based on the supervised 2026-08-17 P400 trace: an immediate publish returned HTTP 409 while the same approved booking became visible 51.635 seconds later. A publish transport error remains ambiguous, so the worker does not publish a second time; it continues readback because ROLLER can automatically create the booking.

## Public status contract

The existing finalize route is reused. No new public route is created.

Request:

```json
{
  "action": "status",
  "prepaymentDraftId": "<server-owned opaque id>",
  "paymentAttemptId": "<server-owned opaque id>"
}
```

Response fields are limited to:

```json
{
  "status": "pending | confirmed | failed | needs_staff",
  "payment": { "status": "approved | reconciled | failed | cancelled | unknown" },
  "booking": {
    "status": "pending | confirmed | failed | needs_staff",
    "bookingReference": "<present only after confirmation>"
  }
}
```

The two high-entropy ids are issued by JumpYard Cloud as the existing guest capability. The response contains no JWT, terminal identifier, card data, customer data, provider error, or credential.

## State rules

| Evidence | Safe state | Retry rule |
|---|---|---|
| Terminal result not definitive | `needs_staff` for `unknown`, otherwise `failed` | Never infer approval and never start a replacement charge automatically. |
| Definitive terminal approval stored | `pending` | The same attempt may be polled/reloaded; it cannot regress to cancelled, unknown, or unpaid. |
| Paid ROLLER booking read back, webhook-confirmed, or lookup-confirmed | `confirmed` | Terminal state becomes reconciled and cannot regress. |
| Reconciliation blocked or bounded window exhausted | `needs_staff` | Staff handles recovery; a later authoritative webhook/lookup may still move it to confirmed. |

Database claims make duplicate callbacks and workers harmless: one payment-attempt id is unique, one worker owns the active reconciliation window, and `publish_attempted_at` permits only one publish call. Late failed/cancelled/unknown results cannot overwrite approval. Existing ROLLER webhook/lookup updates are monotonic and may only complete the record.

## AWS and deployment boundary

- Existing resources only: Booking, Lookup and Webhook Lambdas plus Aurora.
- Existing API route only: `POST /v1/bookings/draft/finalize`.
- Booking Lambda timeout: 120 seconds.
- Self-invoke IAM is scoped to the exact Booking Lambda ARN.
- Migration: `0019_kiosk_payment_reconciliation.sql`.
- No direct Adyen integration, new queue, new Lambda, schedule, secret, frontend behavior, or production resource.
- Routine deployment must use the immutable GitHub artifact and protected park-test workflow with migrations explicitly enabled.

## Validation

Before review:

```text
npm run validate
npm run infra:check
npm --prefix infra run synth:park-test
git diff --check
```

After merge and protected deployment, prove with redacted evidence that migration `0019` is applied, the selected/deployed templates match, the stack is healthy, and a supervised P400 approval returns `pending` promptly then becomes `confirmed` without the kiosk remaining open. Do not repeat an ambiguous or already approved payment attempt.
