# Issue #596: an email ROLLER refuses at Pay

Issue [#596](https://github.com/wrlds-creations/jumpyard-check-in/issues/596), decision D0288. Kiosk companion: [kiosk #247](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/247) (kiosk D0088).

## What happened

Monday 2026-10-26 at Nacka, 11:16:29–11:17:16: one email-first kiosk guest pressed "Gå till betalning" seven times and got the generic "Vi kunde inte reservera bokningen." each time.
- Every attempt failed at the kiosk cost check in `handleDraft`: ROLLER's `POST /bookings/draft/costs` answered 409, and each idempotency record ended `failed` / `roller_quote_http_409`. The request hash was the same every time.
- The guest's price quote seconds earlier (`/v1/bookings/quote`, the synthetic quote customer, `sendConfirmations: false`) returned 200 for the same items.
- The cost check carried the resolved customer (D0234: the typed first name and email, `Gäst`, `0700000000`; Klaviyo answered `not_found`) and `sendConfirmations: true`.
- Cloud logged no ROLLER reason and did not return one, so the cause was unknown. Other email-first guests bought at the same time.

## Reproduction (2026-10-26, Park)

**Quotes.** 12:13–12:15 CET, through `POST /v1/bookings/quote`, which prices with a complete customer and returns ROLLER's error summary. Customer `Test` / `Gäst` / `0700000000` with synthetic addresses; product 1407468 (60 min entré, Drop-In), one ticket at 13:00, `requireAvailability: false`. Nine quotes and two availability reads; nothing was created.

| Email shape | Example | ROLLER |
|---|---|---|
| Plain, dot inside | `jy596.ok@example.com` | 200, 239 kr |
| Dot just before `@` | `jy596.@example.com` | 409 |
| Two dots in a row | `jy596..x@example.com` | 409 |
| Dot first | `.jy596@example.com` | 409 |
| One-letter ending | `jy596@example.c` | 409 |
| Digit in the ending | `jy596@example.c0m` | 409 |
| Hyphen before `@` | `jy596-@example.com` | 200 |
| Apostrophe | `o'jy596@example.com` | 200 |
| Underscore | `jy596_x@example.com` | 200 |

Every 409 had the same body: `{"errors":[{"message":"A valid booking owner email is required"}]}`, with no error name or code. The synthetic quote customer `jumpyard.quote@example.invalid` (a seven-letter ending) is accepted on every quote. The refusal does not depend on `sendConfirmations`: the quote path always sends `false`.

**Test kiosk.** Love bought on the test kiosk at the office at 12:13:42 with a gmail address that had three dots before the `@`. The kiosk showed "Vi kunde inte reservera bokningen.", the terminal never started, and the idempotency record ended `failed` / `roller_quote_http_409`, exactly as at Nacka.

**Cause.** Cloud's email check (`LOOKUP_EMAIL`, `isValidEmailFormat`) and the phone and kiosk copies accepted any of `.!#$%&'*+/=?^_`{|}~-` and dots in any place before the `@`, and any letters or digits after the last dot. ROLLER refuses a dot first, last or twice in a row before the `@`, and an ending that is not at least two letters.

The five refused 409s at 12:13–12:15 counted as `RollerApiErrorCount` and may show on the dashboard alarm `roller-api-errors`; they came from this reproduction, not from a guest.

## Change (D0288)

1. **One email rule, ROLLER's.** Cloud `LOOKUP_EMAIL` (`infra/lambda/booking/contact-lookup.js`), the phone `isValidEmail` and the kiosk `isValidEmail` accept `atom(.atom)*@label(.label)*.letters{2,}`. The email-first draft answers anything else with `400 invalid_email` before the reservation, Klaviyo or ROLLER (D0271), and the clients show "Kontrollera e-postadressen". A dot first, two dots in a row, a dot next to the `@` or a hyphen right after it shows the message while the guest types; a one-letter or numeric ending once the guest leaves the field.
2. **ROLLER's reason is kept.** When the kiosk cost check fails, on the new-booking path and the add-on path, Cloud now:
   - logs one line with codes and counts only (`booking.kiosk_quote_failed` or `booking.kiosk_add_product_quote_failed`: `providerStatusCode`, `reason`, `reasons`);
   - writes the event with ROLLER's error names and messages (`rollerErrors`, `rollerReason`);
   - returns the same summary under `roller.error`, as the draft-failure path does.
   The draft failures (`booking.draft_failed`, `booking.add_product_draft_failed`) get the same fields.
   - Known messages become codes (`booking_owner_email_invalid`, `booking_owner_phone_required`, `capacity_exceeded`, else `other`).
   - Every customer value a message repeats becomes `[guest]`: any address-like word, the customer's names, and numbers with the customer's phone or postcode digits.
   - This replaces GH-473's codes-only summary for email-first drafts, which had dropped ROLLER's only clue (the message has no name or code).
3. **A clear guest message.** A 409 whose message names the booking owner email answers `invalid_email` on the new-purchase cost check and draft; every other refusal keeps its code (`roller_kiosk_quote_failed`, `roller_draft_failed`). The phone and the kiosk show "Kontrollera e-postadressen" on the email field and "Vi kunde inte använda e-postadressen. Rätta den och försök igen." above the price. "Gå till betalning" waits until the address changes, so the guest cannot repeat the same refusal. An add-on keeps its code: its customer is the booking's ROLLER guest (D0260), which the guest at the kiosk cannot change.
4. **Kiosk #247.** A red blinking caret in the kiosk's own text fields; a tap places it, a press and hold lifts it with a loupe and dragging moves it, and the keys act at it. See the kiosk repository's `docs/gh-247-text-cursor.md`.

**ROLLER calls.** None added. A refused address no longer reaches ROLLER at all, and a refusal can no longer be repeated with the same address.

## Validation

- `npm run validate:gh596-roller-email-refusal`: the real Booking Lambda with a scripted ROLLER. The Nacka shape is refused with `400 invalid_email` before any reservation or ROLLER call. A ROLLER email refusal at the kiosk cost check gives `409 invalid_email`, keeps `roller_quote_http_409`, writes `booking.kiosk_quote_failed` with the reason, logs codes only and reserves no kiosk claim. Messages that repeat the contact are redacted. Other refusals and outages keep their codes, and the add-on path keeps its code and logs the reason.
- `npm run validate:gh473-contact-lookup`: the accepted and refused tables from the reproduction for Cloud and the phone, ROLLER's email refusal on the draft (email-first and four fields), and the redacted draft summary.
- The phone's `test:contact-details` and the kiosk's `test:contact-details`, `test:phone-contact`, `test:kiosk-keyboard` and `test:payment-options`.

## After release

- On the kiosk, after Pages and a restart: type `anna..svensson@gmail.com`. "Kontrollera e-postadressen" shows at once and "Gå till betalning" stays off. Tap between the dots, press backspace once, and the message goes.
- `anna@gmail.c` shows the message once the guest leaves the field.
- On the phone, the same two addresses behave the same way.
- If ROLLER ever refuses an address that passes the rule, the Booking log line `booking.kiosk_quote_failed` (or `booking.draft_failed`) names the reason, and the guest sees the email message instead of the generic error.
