# GH-532: an add-on never changes the ROLLER guest

Issue #532. On 2026-10-13 Love asked whether an add-on bought at check-in, a ROLLER booking named "Add-on for <bookingReference>", can rename the ROLLER customer behind that email ("vi skriver inte över något namn då eller?"). Love approved the fix the same day ("ok kör, bygg #532"). Decision D0260.

## What changes

1. **The add-on draft** sends the original booking's ROLLER guest exactly as `GET /guests/{customerId}` returns it: first name, last name, email and phone. Nothing is trimmed, reformatted or filled in, so ROLLER's email match finds the guest unchanged.
2. **No marketing flags** on any add-on payload. Add-ons used to send `acceptMarketingSms: false`.
3. **The add-on quote** prices with Cloud's placeholder quote customer, as email-first new purchases already do, and reads no guest.
4. **A client `customer` is ignored** on both add-on routes. Phone and kiosk already send none.
5. **Unchanged:** the booking keeps its name "Add-on for <bookingReference>", so staff can find it in ROLLER. Payment, publish, linking and the phone and kiosk UI are also unchanged.
6. **When the guest can't be used:** a guest without a customer id, a ROLLER 404, or an empty first name, last name, email or phone returns `409 original_booking_contact_unresolved` before any ROLLER write, as before. A failed guest read (any other HTTP error) returns `502 roller_original_guest_lookup_failed`. Phone and kiosk show their existing draft error.

## Why names could change

- **ROLLER overwrites on match.** ROLLER matches a draft's customer on email and overwrites that guest's supplied fields when the draft is created (#460).
- **No names in booking detail.** ROLLER booking detail (`models/BookingDetail.yaml`, confirmed by a read-only Live read on 2026-10-13) holds the title (`name`) and `customerId`, but no owner names. The only names inside it are `items[].tickets[].ticketHolderName`.
- **Cloud used the title as a name.** It split the title into first and last name and took email and phone from Aurora copies, then from guest detail, but never took the guest's names. Web titles default to the owner's name, so those were right. Every other title was not:

| Original booking title | ROLLER guest | Add-on sent before #532 |
|---|---|---|
| "Anna Svensson" | Anna / Svensson | Anna / Svensson, plus `acceptMarketingSms: false` |
| "Anna Maria Svensson" | Anna Maria / Svensson | Anna / Maria Svensson |
| "Anna Maria" (email-first: title = typed first name) | Anna Maria / Svensson | Anna / Maria |
| "Anna" (email-first) | Anna / Svensson | refused: 409 |
| "Add-on for 170000000" (an add-on booking opened by its own number) | Anna / Svensson | Add-on / for 170000000 |
| "Kalas Elsa 7 år" (title set by staff) | Anna / Svensson | Kalas / Elsa 7 år |

A client-supplied `customer` was also forwarded as is, so a request could write another email's guest.

**Live data, read-only, 2026-10-13:**
- All 32 add-on drafts so far (19 paid) had sent the same names and email that ROLLER holds now.
- Love's three test add-ons were checked with 7 ROLLER calls (1 token and 6 GET).
- 53 of 5,317 synced Nacka guests have a space in their first name.
- All 19 paid add-on bookings can be opened by their own number.

**Klaviyo was considered and not used.** Klaviyo is a copy of ROLLER, so its delays and formats would be written into ROLLER. It needs the email first, and it can answer uncertain.

## Calls

- **Add-on quote:** `GET /bookings/{ref}` and `POST /bookings/draft/costs`, with no guest read. The Aurora contact query is gone.
- **Add-on draft:** `GET /bookings/{ref}` and `GET /guests/{customerId}` (one read per add-on purchase), then the existing costs check for kiosk and `POST /bookings/draft`.

## Code

- **`infra/lambda/booking/index.js`:**
  - `resolveAddProductGuestCustomer` is the only add-on customer source.
  - `handleAddProductQuote` uses `buildQuoteCustomer`.
  - `normalizeAddProductDraftRequest` drops the client customer.
  - `buildRollerBookingPayload` strips both marketing flags from every payload, then sets `acceptMarketing: true` only for a valid new-purchase choice.
  - Removed: the title split (`normalizeOriginalBookingCustomer`, `mergeOriginalBookingCustomer`, `splitCustomerName` and their helpers) and the Aurora contact query (`findLocalOriginalBookingCustomer`).
- **Follow-up:** the booking database role kept a now unused `SELECT` on `jumpyard.guest_profiles` (migration 0011). #538 revokes it with migration 0027.

## Validation

- `npm run validate:gh532-addon-roller-guest` runs the real quote and draft handlers against a stand-in ROLLER. For every title above, the draft carries the guest exactly with no flags, and the booking keeps "Add-on for <ref>". The validator also covers these cases:
  - a client customer never reaches ROLLER;
  - formatted values and the placeholder phone are sent as held;
  - an incomplete guest, a 404 or a missing customer id stops before any write;
  - a failed read is a 502;
  - the quote reads no guest and sends the placeholder customer;
  - any SQL fails the test.
- On `origin/main` before the change, 12 of its 13 tests fail.
- Updated suites:
  - `email-marketing-integration.test.js`: add-ons carry no flag.
  - `validate-gh327-kiosk-terminal-binding.test.js` and `validate-gh488-kiosk-pairing.test.js`: the kiosk add-on draft reads the guest, and a guest without a phone is a 409.
- After release, Love buys one add-on on a test booking, and a read-only check shows the ROLLER guest unchanged.
