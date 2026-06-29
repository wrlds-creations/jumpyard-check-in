# CODEX_TASK.md

## Ticket ID
NO_ACTIVE_TICKET

## Status
No active ticket

## Goal
None.

## Result
T0168 is completed locally and ready to merge. It found a local backend cause and fixed it without Roller writes, AWS deploy, payments, redeem, webhook processing, or visitor traffic. The phone UI was already correctly hiding unpriced/unmappable add-ons; the BookingHandler only exposed the known Nacka Live add-on ids/prices while the T0162 existing-booking add-on smoke gate was open. The Live phone add-on catalog is now a read-only mapping separate from existing-booking add-on write gates, so new-booking availability can return SkyRider, socks, lock, and coffee while write gates remain closed. The next ticket is T0169 post-payment booking sync.
