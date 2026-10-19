# #547 A finished guest is checked in at once

Decision: [D0265](../DECISIONS.md). It revises D0263 (#541): the red "Behöver personal" box and "Checka in" are gone.

On 2026-10-15 Love decided that the guest's last screen on the phone or kiosk means "Incheckad" for staff, no matter what. The fast path stays off (kiosk #157/#181), so ROLLER still needs 61–85 s to create a kiosk booking after the payment (10 purchases measured on 2026-10-15). Staff now hand out at once instead of waiting for ROLLER.

## Staff app

- **Incheckad at once.** A session that is `ready_for_staff` with completed safety is under "Incheckade" as "Incheckad HH:MM", whatever its `bookingSyncStatus` and whether Cloud has redeemed it in ROLLER yet (`stageOf` in `flow.ts`).
  - The time is when the guest became ready (`readyForStaffAt`), before and after Cloud's redemption, so the row never jumps. Cloud's redeem time stands in only without it.
  - "Incheckade" sorts by the same time.
- **No "Bekräftas", "Redo", "Checka in" or red box.** A group whose automatic check-in failed is "Incheckad" too; the monitor chat catches failures with its own watchdog check. `needsStaff`, the urgent list and `handleCheckIn` are removed.
- **Goods while ROLLER is not ready.** The folded-out row shows the purchase's goods from Cloud's provisional lines (see Cloud below), like any other goods: bands with colour and duration, socks, and the "Caféet: …" line. The café lists the group under "Kvar att hämta".
- **"Lämna ut" works at once.**
  - The device keeps the press while the detail's `bookingSyncStatus` is not `confirmed`, or when Cloud answers `booking_sync_pending`. It stores the chosen lines by kind and product for the operating day (`remembered.ts`).
  - The store is the browser tab's `sessionStorage` (key `jumpyard_staff_remembered_handouts_v1`), as T0194 requires for staff browser state, so a press survives a reload but not a closed tab. It holds the session id, the counter and the product lines: no guest or staff names.
  - The device shows the goods as handed out at once: a check per line and "Utlämnat HH:MM · <staff signed in here>", the same name Cloud records when it confirms the press. A café press moves the row to "Utlämnat".
  - When the board shows ROLLER's booking (`bookingSyncStatus = confirmed`), the device reads the detail and sends the same handout as a tap. That is a selection of the matching final lines (the group's bands whole, other goods up to the pressed number), then its confirmation.
  - A band handout checks the group in, in ROLLER, if Cloud has not done so yet (`needsAdmission`, D0217). It uses Cloud's automatic check-in key, so the two never redeem twice.
  - A failure retries with backoff from 3 s up to 30 s, 20 tries in about eight minutes. A colleague's live claim waits. Goods handed out elsewhere, a changed booking or another day end the press.
  - An ended staff session keeps the press for the next login. "Byt personal" keeps it too, because the goods were handed out; this is the one staff browser state besides the counter choice (#541) that outlives a logout. The operator's own taps wait for a confirmation in progress.
  - Only this device knows the press until Cloud has it, about 80 s after a kiosk payment.

## Cloud

- **Provisional lines.** `provisionalManifest` (`shared/staff-handout.js`, byte-identical in the session and redeem packages) turns a paid draft's `items_summary` into the same handout lines as `buildManifest`. The lines get synthetic ids (`<booking>:provisional:<n>:…`) and `provisional: true`. Cloud's own purchase types (`entry`, `family`, `deal`) count as admissions on these lines only.
  - **Board** (`staff-board.js`): when a session's `bookingSyncStatus` is not `confirmed`, two drafts add their lines. One is the paid new-booking draft of a booking that has no ROLLER items. The others are approved kiosk add-on drafts that are still `pending` or `needs_staff`. `counts.admission`, `bandColours`, `cafeQuantity` and `cafeRemaining` include them.
    - Since #582 (D0282), the new-booking draft also stands in while the session has no ROLLER tickets yet, and that booking's own ROLLER lines wait meanwhile.
  - **Detail**: the same lines join `handout.items` (collected 0) until the booking is confirmed. A kiosk purchase past the 75 s window (`needs_staff`) lists its draft too.
  - The handout write path is unchanged. Cloud still refuses a handout with `booking_sync_pending` until ROLLER confirms, so a provisional id is never confirmed.
- **Kiosk add-on check-in.** `confirmKioskAddProductReconciliation` returns the sessions it updated and calls `requestAutoCheckin(…, 'kiosk_add_on_confirmed')`, as new kiosk and phone purchases do.
  - An add-on that ROLLER confirms after the window, through the webhook, is picked up by the board's `refreshLinkedAddOnEffectiveSyncState`. It now admits the sessions it moves to `confirmed`, with the same trigger.
  - Since #563 (D0279), the Booking Lambda releases such a group from the paid-booking signal, without a staff read; the board refresh stays the safety net.
  - Evidence for the gap: Love's socks test at 13:04 on 2026-10-15. Session `jycs_mv9floeu_59c30243` stayed `ready_for_staff`.

## Calls

- No extra calls while a group waits: the device watches the board it already polls.
- Per kept press, once ROLLER is done: one detail read, one selection and one confirmation. A retry repeats them.
- The board query reads the drafts only for sessions that are not confirmed.
- The release changes the Session, Booking and Redeem Lambda code; the Redeem Lambda only carries the shared module. No migration, route or permission changes.

## Not included

- The fast path (kiosk #157/#181), ROLLER settings, the kiosk UI and #544.
- A kept press lives on the device that pressed it. Another device sees the goods as left until Cloud has the handout.
- The watchdog for "ready but not redeemed after 5 minutes" belongs to the monitor chat.

## Validation

- `npm run validate:gh547-ready-is-checked-in` (part of `npm run validate`) drives the real Lambdas with a scripted Aurora, Lambda and ROLLER. It checks:
  - a confirmed kiosk add-on invokes the automatic check-in for its sessions, and an add-on confirmed after the window does so from the board refresh;
  - provisional lines for an entry, socks, coffee and the Weekday Combo, with band colours, and no change to ROLLER's own lines;
  - the board's counts and café totals for a pending purchase, and the detail's lines for `pending` and `needs_staff` but not `confirmed`;
  - a band handout that redeems the group in ROLLER with `staff-redeem:<id>` when Cloud has not, and only hands out when Cloud has.
- `npm run validate:gh345-staff-handout` runs `staffExperience.test.mjs`. It covers:
  - a pending kiosk group under "Incheckade" with its goods and "Lämna ut", at the entrance and in the café;
  - no red box or "Checka in", and the ready time;
  - a kept press shown as handed out before and after ROLLER confirms, and its selection of the final lines;
  - its confirmation after `booking_sync_pending`, the resume, colleague, done and logout cases, and the day's storage.
- Also `validate:gh456-auto-checkin`, `validate:gh289-handoff-linked-addons`, `validate:gh285-kiosk-addon-terminal`, `validate:kiosk-payment-reconciliation` and `validate:t0194-staff-identity-frontend`. In `jumpyard-checkin-admin`: `npx tsc --noEmit`, `npm run lint` and `npx next build`.
- Love approved the screenshots of a kiosk group right after payment, still pending in ROLLER: the entrance at 432 px and the café at 1280 px, from a local fake Cloud with no AWS or ROLLER calls.

## After release

- **Motorola or tablet:** reload the app, then make a kiosk purchase. The group shows under "Incheckade" within seconds, with its goods. Press "Lämna ut" at once. About a minute later, open the same number on another phone: it shows "Utlämnat" there too.
- **Kiosk add-on:** buy socks at the kiosk for a group that has checked in. The group ends checked in in ROLLER within about two minutes; the monitor reads it.
- **Café computer:** a kiosk purchase with coffee shows under "Kvar att hämta" at once.
