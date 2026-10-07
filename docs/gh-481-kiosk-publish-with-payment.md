# Issue #481 — Publish Kiosk Terminal Payments With The Payment

## Outcome

An approved P400 payment becomes a confirmed ROLLER booking within seconds. JumpYard Cloud publishes the ROLLER draft together with the approved terminal payment, as ROLLER support prescribed on 2026-10-05. Decision: D0238, which revises the publish rule of D0182 (#239). Kiosk counterpart: wrlds-creations/jumpyard-check-in-kiosk#157.

## Why the booking took about 51 seconds

- ROLLER creates a card-present booking from its payment notification. It holds that notification for about 45–75 s as duplicate protection, because the flow was designed for online checkout.
- `POST /bookings/draft/publish` without a payment returns 409: a draft can only be published when nothing is owing. The 2026-08-17 trace for #239 showed eight such 409s between +10 and +45 s, and `GET /bookings/{id}` returned 404 until ROLLER's own booking appeared at +50.6 s.
- Including `payment` (ROLLER's PaymentCreate model: required `id`, `paymentType`, `amount`) publishes the draft at once. The published draft no longer exists, so the later notification does not create a second booking.

## Refund fix (2026-10-07)

The supervised P400 purchase on 2026-10-06 confirmed booking 176778138 1.25 s after approval. The booking could not be refunded through ROLLER's gateway, though: "Refund via gateway (Adyen)" offered no payment and said "Refund payment does not exist". The kiosk side was paused the same day (kiosk #165).

ROLLER support (2026-10-07) prescribed adding `MerchantId` to the publish `payment`, echoed unchanged from the terminal response's `PaymentResult.PaymentAcquirerData.MerchantID`. That field links the payment to its gateway transaction.

- The kiosk sends `terminalMerchantId` with the approved finalize, next to `terminalTransactionId`. ROLLER's terminal package already exposes it as `merchantId`.
- Cloud stores it as `terminal_merchant_id` (migration `0026`), under the same first-value and installation-bound rules.
- The fast path requires both values. Without the merchant account, Cloud keeps the old readback path, so a refundable booking is never traded for speed.
- Acceptance: a P400 purchase is confirmed within seconds and can then be refunded through "Refund via gateway (Adyen)" in Venue Manager.

## Flow

```text
P400 approves -> ROLLER terminal package reports { status, transactionId (Adyen PSP reference) }
kiosk -> POST /v1/bookings/draft/finalize { outcome: approved, terminalTransactionId }
Cloud  -> store approval; keep the first transaction id if the draft is installation-bound
       -> HTTP 202 pending (provisional handoff as before)
worker -> claim the single publish for this attempt
       -> POST /bookings/draft/publish { uniqueId, payment: { id, paymentType: "CreditCard", amount, MerchantId } }
       -> readback GET /bookings/{id} -> confirmed
       any other answer or transport ambiguity: no further provider writes; readback continues
       until ROLLER's notification creates the booking, or needs_staff after 75 s
```

## Guards

- Only an approval carries the id. A missing or malformed id (`^[A-Za-z0-9]{8,64}$`) is ignored and never blocks recording the approval.
- `kiosk_installation_id` is stored at draft creation only when the installation capability was verified (#327). Drafts created through the temporary `primary` alias never store an id, and Cloud never publishes them. This matters because Cloud now tells ROLLER that a payment exists on the kiosk's report.
- `amount` is the amount owing verified at draft creation (exact quote and SEK checks), never a client value.
- `publish_attempted_at` allows exactly one publish per attempt, across duplicate workers and retries. A payment can therefore not be recorded twice by Cloud.
- The first stored id is never overwritten. It is not returned by any API, not logged, and is cleared by the 30-day lifecycle together with the other provider identifiers.
- Migration `0024_kiosk_terminal_payment_publish.sql` adds the two nullable columns with format checks. No new AWS resource, route, secret or configuration.

## API calls per kiosk purchase

| | Publish | Readback |
|---|---|---|
| Before (#239) | 8, all rejected | about 11 |
| With the payment | 1 | 0–1 |
| Fallback (no id, rejected publish) | 0–1 | about 11, as before |

## Validation

- `npm run validate:gh481-kiosk-publish-with-payment`: worker success, a publish response that already carries the booking, 409, other rejection, transport ambiguity, exhaustion, no id, legacy alias, no verified amount, duplicate worker, add-on flow, finalize parsing, and draft persistence. The PostgreSQL case runs in CI against all migrations, through the restricted booking runtime role.
- `npm run validate:kiosk-payment-reconciliation` and `npm run validate:t0195-data-lifecycle`.

## Rollout and acceptance

1. Merge, then promote the release through the protected Park workflow with migrations enabled (`0024`).
2. Publish kiosk #157 to Pages. Until then Cloud receives no id and behaves as before.
3. Supervised P400 purchase. Expected: `publish_http_status` 2xx, booking confirmed within seconds. At least 2 minutes later, the ROLLER booking still has exactly one payment and nothing owing.

## Open questions for ROLLER

- Is the Adyen PSP reference the `id` ROLLER expects?
- Can the delayed notification still add a second payment record to the published booking?
- Can a payment recorded this way be refunded to the card from ROLLER?
