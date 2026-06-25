# CODEX_TASK.md

## Ticket ID
NO_ACTIVE_TICKET

## Status
No active ticket

## Goal
None.

## Result
T0167 is completed. The phone PWA now sends `sendConfirmations: true` for both new-booking drafts and existing-booking add-on drafts, the booking Lambda logs the safe confirmation flag in draft success events, and payment-complete copy tells guests that Roller sends the confirmation/receipt to the booking email. Validation passed. No paid Live smoke was run in T0167; actual Roller email delivery remains planned for the next controlled paid PWA transaction, expected on 2026-06-26 after deployment. Next ticket is T0168 frontend redeem rehearsal.
