# GH-224 shared kiosk terminal backend

Status: implementation prepared for protected park-test release; physical proof and terminal mapping remain separate gates.

Date: 2026-08-07

Issue: [#224](https://github.com/wrlds-creations/jumpyard-check-in/issues/224)

Kiosk rollout coordinator: [jumpyard-check-in-kiosk#15](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/15)

## Purpose

The kiosk repository contains the ROLLER card-present browser flow, but its copied infrastructure snapshot is older than the deployed shared JumpYard Cloud stack. GH-224 ports only the terminal-facing backend delta onto CJ's current mainline so routine release cannot remove newer database roles, webhook processing, email/Cognito resources, or deployment controls.

## Server contract

1. `POST /v1/bookings/draft` accepts `channel: "kiosk"` and the non-physical alias `primary`.
2. JumpYard Cloud resolves that alias from `paymentTerminals` inside the existing ROLLER credentials secret. The opaque value is sent only to ROLLER as `paymentTerminal` and is redacted from errors.
3. The handler repeats ROLLER draft-cost calculation, creates the terminal-bound draft, and requires exact amount plus SEK evidence in the response/payment JWT.
4. Aurora stores a random `jytp_...` attempt id and monotonic safe state on the existing prepayment draft. It never stores the payment JWT, terminal reference, card data, receipt, or processor details.
5. `POST /v1/bookings/draft/finalize` records the sanitized browser outcome. An approved outcome calls ROLLER publish and confirms the resulting paid booking through authoritative readback before local reconciliation.

## Deployment boundary

- Migration `0018_kiosk_terminal_payment_attempts.sql` is forward-only and adds three columns, two checks, and one partial unique index to `prepayment_booking_drafts`.
- The CDK delta adds one existing-BookingHandler API route with the established `guest_write` protection and throttling profile.
- Routine park-test rollout must merge first, build one immutable release artifact from `main`, show the protected read-only plan, and apply migration 0018 only with the explicit deployment input.
- The ROLLER secret currently has no `paymentTerminals.primary` mapping. The path therefore remains fail-closed after code deployment until an approved opaque value is supplied without printing or committing it.

## Explicit exclusions

No kiosk UI, Android, scanner, printer, terminal onboarding/networking, real draft, payment, booking, publish, refund, redemption, guest message, production change, or physical validation belongs to GH-224. The controlled physical test remains a later kiosk issue after server configuration and terminal readiness are confirmed.
