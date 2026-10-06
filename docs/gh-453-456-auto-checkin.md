# Automatic check-in and one number all day (#453, #456)

Decided by Love and JumpYard's product owner on 2026-10-06 (D0229, D0230):

- A completed check-in counts as checked in, wherever it happens: at home through the email link, on the phone on site, or at the kiosk.
- Cloud admits it in ROLLER itself. Staff no longer check guests in.
- A staff phone stays at the entrance, but only to keep an overview and to double-check a number.
- Kassan is the backup.

## Guest rules

| Situation | What happens |
|---|---|
| Check-in from 120 min before the start until the session ends | The check-in completes and Cloud admits automatically. The phone shows "Du är incheckad" and the number. |
| Check-in before the window | `checkin_too_early`. The booking page shows "Incheckningen öppnar HH:MM" and "Två timmar före ert pass." |
| Check-in after the session has ended | `checkin_too_late`. The booking page shows "Er hopptid är slut" and "Gå till kassan så hjälper vi er." |
| Late, but inside the session | The check-in works and the band colour is unchanged. Staff can see the check-in time. |
| Reopen the same day after admission | `session_completed`: the same number, plus what is left at the café. |
| Another day | "Besöket är avslutat" and no number to use. |
| Phone purchase | Offers only the next three half-hour slots, so the slot is always inside the window. |

The phone shows only the number. The `JY_HANDOFF:<code>:<sessionId>` payload stays in Cloud, the staff app and the kiosk slip. `SHOW_PHONE_QR` in `PhoneCompletion.tsx` brings the QR back on the phone.

## How Cloud admits

1. **Triggers.** The Session Lambda fires after ready-for-staff and after a safety-attested ready. The Booking Lambda fires after `confirmPhoneProvisionalHandoff` and `confirmKioskReconciliation`. Each one invokes the Redeem Lambda asynchronously with `{ source: "jumpyard.auto-checkin", detail: { checkinSessionId, correlationId, trigger } }`. The function name comes from `AUTO_CHECKIN_FUNCTION_NAME`, and `grantInvoke` sits on the stack.
2. **What the Redeem Lambda checks.** It admits only when all of these hold:
   - the session is `ready_for_staff` with completed safety;
   - `bookingSyncStatus` is `confirmed`;
   - no staff claim is active;
   - the visit day is today, and the time is no later than the session end plus 30 minutes.

   Otherwise it does nothing: the other trigger, or staff, takes over.
3. **Redemption.** It goes through the internal redeem route with the staff key `staff-redeem:<checkinSessionId>`, so staff and the system can never redeem twice. The #333 receipts and the ROLLER ticket-state recovery apply. The actor is `system:auto-checkin`, display name `automatiskt`, and the board shows "Incheckad HH:MM · automatiskt".
4. **Failures.**
   - A ROLLER outage (5xx or 429) throws, so Lambda retries asynchronously: three attempts in total.
   - A rejection or the last failure sets `session_summary.autoCheckin.status = needs_staff`, and the board shows "Behöver personal".
   - Write gates and the emergency stop block admission as they block staff.
   - The deploy config switch `autoCheckin.redeem` sets `AUTO_CHECKIN_REDEEM` on the Redeem Lambda; `off` stops automatic admission and leaves staff "Checka in". Nacka deploys with it on from 2026-10-06 (D0242). Change it only in `park-test-full-flow-rehearsal.json` through a reviewed deploy, never on the Lambda by hand, or Park verification reports drift.

Phones and kiosks never poll. The only ROLLER traffic is the existing redemption and its refresh.

## Guest texts (Love, 2026-10-06, D0241)

Short words that say exactly what to do, each next step a banner the guest cannot miss, and no dashes in the sentences. The phone and the kiosk use the same words.

| Place | Swedish | English |
|---|---|---|
| Black banner | HÄMTA PÅ PLATS / Innan ni hoppar: | COLLECT ON SITE / Before you jump: |
| Red banner | HÄMTA I CAFÉET / Efter hoppet. Visa numret. | COLLECT AT THE CAFÉ / After jumping. Show your number. |
| Red banner, something collected | KVAR I CAFÉET / Visa numret. | LEFT AT THE CAFÉ / Show your number. |
| Grey banner | ALLT I CAFÉET ÄR HÄMTAT | EVERYTHING AT THE CAFÉ IS COLLECTED |
| Too early (black box) | INCHECKNINGEN ÖPPNAR 12:00 / Två timmar före ert pass. | YOU CAN CHECK IN FROM 12:00 / Two hours before your session. |
| Too late (black box) | ER HOPPTID ÄR SLUT / Gå till kassan så hjälper vi er. | YOUR JUMP TIME HAS ENDED / Go to the front desk and we will help you. |
| Very bottom, small | NUMMER FRÅN LÖRDAG 17 OKTOBER | NUMBER FROM SATURDAY 17 OCTOBER |

- "På plats" tells a guest who checked in at home that things are collected on arrival. Nobody calls the place "stationen", so no text names it.
- The email's third step reads "Klart! Ni är incheckade / Hämta band och strumpor på plats när ni kommer."
- The booking page shows the jump itself, the start plus the longest admission length (`flow/jumpTime.ts`). A Weekday Combo reads 14:00–15:00 and 60 min, not ROLLER's 14:00–16:00 package span.
- The time range ("14:00–15:00") keeps its en dash, because it is a range, not a sentence.

## Phone

- The completion view shows the number large, the check-in time, the "Hämta på plats" banner with what to take, and the café banner with Cloud's café lines: what is collected and what is left.
- The saved visit `jumpyard.savedVisit.v1` holds today's booking reference, number and booking snapshot, never the guest access token. A reload goes straight to the number, then refreshes through the ordinary lookup. The next day the saved visit is dropped.
- Window answers show a notice on the booking page instead of a start button.

## Kiosk phone link (#484, D0240)

When a kiosk check-in gets its number, the kiosk asks ready-for-staff for a phone link (`phoneLink: true`). Cloud answers with `checkinLink { url, expiresAt }`, and the kiosk shows it as a small QR beside the print button ("Lappen i mobilen / Skanna med kameran", kiosk #162).

- **The link.** `https://checkin.jumpyard.se/?jy_token=<token>`, channel `kiosk_phone`, stored as a hash.
  - Valid until midnight of the visit day.
  - At most five per booking and day.
  - It resolves, and grants guest access, like the email link, so the phone opens the same completion: the number all day, what to collect on site and at the café.
  - Add-ons can be bought on the phone.
- **Purchases.** The link is minted on the temporary draft booking. `confirmKioskReconciliation` moves it to the real booking in the same statement, before the automatic check-in trigger. A scan in between gets `booking_not_fresh`, and the phone shows "Vi hämtar din lapp…" for up to about a minute.
- **Exposure.** The QR is only on the kiosk screen, for about a minute, and only for the guest. The printed slip has no link (kiosk D0047/D0048).

## Open items

- **The T-120 email schedule is paused (D0237).** Home check-in depends on the email. Turning it on for 2026-10-17 is Love's decision and needs its own reviewed change. The email copy is already updated.
- **The email subject** still reads "Checka in nu – gå direkt in kl. HH:MM" (#392). Remove that dash in the same reviewed change that turns the email back on.
- **The kiosk** shows the same banners, window notices and café lines (kiosk #141, #162, kiosk D0049).
- **Early redemption** may affect ROLLER refunds or rebookings. Watch the 2026-10-17 test, and see the #481 refund note.

## Verification

- `npm run validate:gh456-auto-checkin`. It covers the window module, the Redeem Lambda's admission, guards, retries and receipts, and the Session Lambda's too-early, too-late, same-day completed and dispatch paths. It also checks the wiring of the triggers, the IAM, the board label and the contract.
- `npm --prefix jumpyard-checkin-phone run test:completion`, which includes the saved visit and the window notice.
- The full phone suite, `infra:synth`, and admin `tsc`.
- The local design preview at `/preview/heladagen` (development only).
