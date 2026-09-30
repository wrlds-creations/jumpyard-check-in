# Default contact values in ROLLER and Klaviyo — issue #460

## Question

Can phone and kiosk purchases stop asking for first name, last name and/or phone by sending default values, for example "Standard Standard" and `0700000000`? What happens to an existing ROLLER customer with the same email, and to that customer's Klaviyo profile?

## Method and authorization (2026-09-29)

- **Environment.** Love chose to skip Playground and test on Live Nacka with Love's own test aliases only (called A and B here). No real guest was involved.
- **Test values.** All names were synthetic: "Anna Testsson", "Bertil Testsson" and "Standard Standard". Phone numbers were `070-174 06 05`, from the PTS series reserved for fiction, and the default `0700000000`.
- **Purchases.** Love made the purchases through the public phone app, so each draft was the production Cloud → ROLLER draft.
- **Readback.** The agent read ROLLER with a GET-only script that printed field classifications, never values.
- **Klaviyo.** Love supplied the Klaviyo evidence as screenshots.
- **Direct drafts.** After separate approval ("testa", "kör"), the agent sent two direct drafts to ROLLER for alias A. They had no payment, confirmations were off, and a restore was prepared if needed. ROLLER rejected both and created nothing.

| Step | Action (alias, values) | ROLLER result | Klaviyo result |
|---|---|---|---|
| 1 | A, Anna Testsson, fiction number, email choice ticked, paid (200 SEK) | Guest A created with those values; email marketing true, SMS false | Profile "Anna Testsson" with the fiction number; email Subscribed; SMS never subscribed |
| 2 | B (new email), Bertil Testsson, **same** fiction number, draft abandoned at payment | Guest A unchanged in every field | Separate profile "Bertil Testsson"; email **Suppressed** ("Manually Suppressed from Email Marketing") within seconds |
| 3 | A again, Standard Standard, `0700000000`, no tick, paid (200 SEK) | **Same guest A.** First name, last name and phone overwritten; email consent kept; other fields unchanged | Profile renamed "Standard Standard", phone `+46700000000`; still Subscribed; no new events |
| 4 | A again, Anna Testsson, fiction number, draft abandoned at payment | A restored to the real values: last write wins, and no payment is needed | Profile back to "Anna Testsson" and the fiction number; still Subscribed |
| Test 1 | Direct draft for A with email only (names and phone empty strings) | HTTP 400: `customer.FirstName` and `customer.LastName` required; nothing created; A unchanged | — |
| Test 2 | Direct draft for A with real names and an empty phone | HTTP 409: `Customer.Phone` "The Phone field is required."; nothing created; A unchanged | — |

What guests and staff saw after step 3:
- ROLLER's booking confirmation greeted the guest with "Hej Standard,".
- The staff board shows the name typed for that purchase: `infra/lambda/session/staff-board.js` gives priority to our prepayment draft's name, then the synced guest profile.

## Findings

1. **Matching.** ROLLER matches the draft customer on email only. A new email with an existing guest's phone creates a new guest and leaves the existing one untouched.
2. **Overwrite, not a new customer.** With the same email, ROLLER reuses the existing guest. It overwrites first name, last name and phone with whatever is sent, at draft creation, before and without payment. Email marketing consent is unchanged when the choice is omitted.
3. **Klaviyo follows.** The ROLLER → SmartSegments → Klaviyo sync pushes the changed name and phone to the existing Klaviyo profile within minutes, and pushes them back after a later correction.
4. **Required fields.** ROLLER requires all four fields to be non-empty. Omitted names (400) and an omitted phone (409, both on 2026-09-22 and 2026-09-29) are rejected, as is an empty phone (409, 2026-09-29).
5. **No guest lookup in ROLLER.** ROLLER's public specification (`rollersoftware/public-api-documentation`, SEP release 2026-09-29) offers:
   - `GET`/`PUT /guests/{guestId}`, which needs the id;
   - a booking keyword search (fuzzy, at most the 100 most recent bookings, no exact email or guest-id filter);
   - the Reporting API `/data/customers`, a per-day export by modified date with no email filter.

   The draft customer model has no guest-id field and no option to preserve existing values.

## Side finding for #437

New guest B did not tick the email choice and abandoned the draft at payment. B was nevertheless `User Suppressed` in Klaviyo within seconds, with no guest update from us. This differs from the #437 note that a new guest without the choice stays Never subscribed. The cause is still open: either the abandoned draft or the phone shared with A. Such a guest cannot become a subscriber later without manual unsuppression.

## Decision (D0234, 2026-09-30)

Default values must not be sent without first knowing the real ones. Love and Gustav (JumpYard) approved using Klaviyo data in checkout, and the lookup is binary:

- **Found (exactly one Klaviyo profile).** Send Klaviyo's first name, last name, phone and `location.zip` as `customer.address.postcode`. A field missing from the profile gets its placeholder only. Nothing changes for a known customer.
- **Not found.** Send the guest's typed first name, last name `Gäst` and phone `0700000000`, with no address.
- **Uncertain.** More than one profile, an error, a 1.5 s timeout or a missing key: ask the guest for last name and phone. Never guess.

Klaviyo values are never shown to the guest or logged. The remaining risk is a customer who exists in ROLLER but not in Klaviyo.

Measurements behind the decision (read-only, Love's Profiles:Read key):
- **Exact match.** An exact-email lookup of alias A returned the same first name, last name and phone as ROLLER. The profile has no ROLLER guest id.
- **Postcode.** Love's own web-shop profile has `location.zip` (Swedish format), so the ROLLER postcode reaches Klaviyo.
- **Latency.** Twenty sequential calls from Sweden: found p50 256 ms, max 459 ms (first call); not found p50 251 ms, max 279 ms.

Follow-up issues:
- **wrlds-creations/jumpyard-check-in#473.** Cloud lookup, placeholders, postcode, an empty Secrets Manager secret that Love populates, and the phone form.
- **wrlds-creations/jumpyard-check-in-kiosk#150.** The kiosk form, after Cloud #473.

The #437 side finding (a new, unticked, abandoned guest suppressed in Klaviyo) belongs to #437.

## Provider requests and cleanup

The agent made 22 ROLLER Live calls and 22 Klaviyo reads (1 lookup of alias A, 1 postcode check, 20 latency samples):
- 7 token requests;
- 1 venue read;
- 5 booking reads;
- 7 guest reads;
- 2 draft attempts, both rejected, with no data written.

Love's purchase attempts made the normal app calls.

Left behind, all owned test data:
- 2 paid bookings (…113, …215; Love may refund them in Venue Manager);
- 2 abandoned unpaid drafts;
- Klaviyo profiles A (Subscribed) and B (Suppressed).

Nothing was changed for any real guest.
