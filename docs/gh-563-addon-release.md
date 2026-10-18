# Issue #563: a kiosk add-on checks its group in without the staff app

Issue [#563](https://github.com/wrlds-creations/jumpyard-check-in/issues/563), decision D0278.

## What happened

During the test weekend at Nacka on Saturday 2026-10-17, six groups bought an add-on on their existing booking at the kiosk and stayed unredeemed in ROLLER until a staff device read the list: 09:54, 13:15, 13:50, 13:54, 15:16 and 16:56. The longest wait was 13 minutes (0115, 13:15 to 13:28). Guests were not blocked, because the staff app lists a finished group as "Incheckad" (D0265).

The first case, read-only from Park:
- Session `jycs_mvc3mzzy_ebee4cf2`, a pre-booked group of 2, bought 2 pairs of socks for 98 kr. The card was approved at 09:54:05 (draft `jypd_7d0476c3f4b24407bc`). The session became `ready_for_staff` with `bookingSyncStatus: pending`.
- ROLLER created the paid add-on booking about a minute later. The webhook confirmed the draft at 09:54:59 (`confirmed_by_webhook`), wrote the booking and its items, and published the link.
- The session stayed `pending` until the next staff list read at 10:04 ran the board refresh. It then became `confirmed` and was redeemed by `system:auto-checkin` at 10:04:09.

## Why

- The Booking Lambda's reconciliation worker reads ROLLER back every 5 s for 75 s. When the webhook confirms the add-on first, the worker's next check finds the draft confirmed and stops. Only the worker's own readback (`confirmKioskAddProductReconciliation`) updated the linked session and started the automatic check-in.
- The webhook updates the draft and the link, but its database role has no grant on check-in sessions.
- `refreshLinkedAddOnEffectiveSyncState` in the Session Lambda corrects the session, but only on staff reads: the sessions list, the ready list and the detail.

## Change (D0278)

The Booking Lambda gets `releaseConfirmedKioskAddOn(rollerUniqueId, correlationId, trigger)`. In one statement it:
1. reads the add-on's draft only if it is a `card_present`, `add_product` draft with an add-on group, `approved` or `reconciled`, and `confirmed`;
2. computes the group's add-on state with the worker's own `linkedAddOnEffectiveSyncCte`: another add-on of the same booking and day that is still `pending` keeps the group `pending`, one that needs staff gives `needs_staff`, and otherwise it is `confirmed`;
3. updates the sessions of that booking and visit day that are `guest_in_progress`, `ready_for_staff` or `staff_in_progress` and whose state changes, with `linkedAddOnSyncSource: confirmed_add_on_draft`.

It then starts the automatic check-in (`kiosk_add_on_confirmed`) only for the sessions it moved to `confirmed`, and writes `booking.kiosk_add_on_released` with the session counts and the trigger. A failure is logged as `booking.kiosk_add_on_release_failed` and never thrown.

It is called from two places:
- **The paid-booking signal.** Lookup and webhook already send `jumpyard.phone-email-marketing` to the Booking Lambda for every settled booking (named for #437; #458 also confirms a phone purchase with it). The release runs after the phone confirmation, with trigger `paid_booking_signal`. This covers a webhook inside or after the worker's window.
- **The worker's early stop.** When the worker finds its add-on already confirmed, at its first check or between two readbacks, it releases the group before it stops (trigger `reconciliation_worker`).

Only a changed session is admitted, so the signal, the worker and the board refresh never all start it. A replayed signal, for example from ROLLER's later `Updated` webhook, changes nothing. The Redeem Lambda's own checks (ready, safety, `confirmed`, visit day, window, staff claim, the shared key `staff-redeem:<id>`) are unchanged.

**No ROLLER call.** The release reads only Cloud's draft and session rows, which the webhook or lookup has already written.

**Unchanged:**
- the webhook and Lookup Lambdas, IAM, environment variables and migrations: the Booking role already updates sessions (migration 0020) and invokes the Redeem Lambda (`AUTO_CHECKIN_FUNCTION_NAME`);
- the worker's own confirmation and the staff resolution (#483), which still call `confirmKioskAddProductReconciliation`;
- the board refresh on staff reads, which stays the safety net.

## Rejected options

- **The webhook updates the session itself.** Its role has no grant on `checkin_sessions` and no invoke on the Redeem Lambda, so it needs a migration and IAM. The Booking role already has both.
- **A new event from the webhook to the Session Lambda.** It needs a new invoke grant and environment variable for the same result.
- **A timer that refreshes add-ons.** It polls, and the paid-booking signal already arrives within a second of the confirmation.

## Validation

- `npm run validate:gh563-addon-release` (part of `npm run validate`), with a scripted Aurora, Lambda and ROLLER:
  - the paid-booking signal releases the group and starts its check-in, with no ROLLER call;
  - an unchanged, failing or missing release starts nothing and never fails the signal;
  - the worker that finds its add-on confirmed releases the group, at its first check or between readbacks, with no readback or publish;
  - the release keeps the worker's guards and effective state, reads neither `booking_links` (the Booking role cannot) nor ROLLER, and the board refresh stays.
- With `GH563_DATABASE_TEST=true` (CI's "Staff handout database" job), against PostgreSQL with all migrations and each Lambda's own role:
  - the webhook's real draft reconciliation leaves the session `pending`;
  - its paid-booking signal makes it `confirmed`, and the Redeem Lambda redeems it from that invoke alone, with no staff read;
  - a replayed signal admits nobody twice;
  - `needs_staff` stays `needs_staff`, a pending sibling keeps the group `pending`, and an unconfirmed add-on or another booking changes nothing;
  - the worker's own confirmation behaves as before, and the signal after it admits nobody twice.
- Locally the PostgreSQL test ran against PGlite 0.5.8 (PostgreSQL 18.3) in the session scratchpad. Without the change, it fails at the first check: the session stays `pending` with `kiosk_terminal_add_product`, as on Saturday.
- These validators also pass: `validate:gh547-ready-is-checked-in`, `validate:gh456-auto-checkin`, `validate:gh289-handoff-linked-addons`, `validate:gh285-kiosk-addon-terminal`, `validate:kiosk-payment-reconciliation`, `validate:gh458-safety-before-payment`, `validate:gh346-webhook-retry`, `validate:t0197-webhook-reconciliation`, `validate:gh282-kiosk-handoff-repair`, `validate:gh483-kiosk-staff-resolution`, `validate:gh481-kiosk-publish-with-payment`, `validate:gh531-kiosk-expected-miss`, `validate:gh532-addon-roller-guest`, `validate:t0195-least-privilege`, `validate:gh340-server-errors`, `validate:kiosk-terminal-backend`, `validate:gh527-zero-kr-venue` and `validate:gh549-group-size`.

## After release

The Park plan may change only the Booking Lambda code. Release outside test-day opening hours.

- **Love's kiosk test, with the staff app closed.** Check in a booking at the kiosk and buy an add-on, for example socks. The group is checked in in ROLLER within about a minute, before anyone opens the staff app.
- **Park read.** The session ends `redeemed`, with `linkedAddOnSyncSource` either `confirmed_add_on_draft` (released by the signal or the worker) or `kiosk_terminal_add_product` (the worker read ROLLER first). `checkin.auto_checkin_completed` shows trigger `kiosk_add_on_confirmed`, and `booking.kiosk_add_on_released` appears when the webhook confirmed first. The monitor's `[stuck]` watch stays quiet.

## Remaining risks

- If the paid-booking signal is lost (its dispatch is logged as `marketing.email_dispatch_failed`) after the worker's window, the group waits for the next staff read, as before.
- One more Data API statement runs per paid-booking signal. For a booking that is no kiosk add-on, it changes nothing.
