# GH-603: a wrongly shaped booking number shows not found on the phone

Issue [#603](https://github.com/wrlds-creations/jumpyard-check-in/issues/603), decision D0292. It is the phone side of kiosk #249 (kiosk D0089).

## What happened

On Park, Cloud's Lookup refuses an identifier it does not look up with `403 live_lookup_not_allowed`, before calling ROLLER. Only an email, a ROLLER QR UUID or a booking number of 6–9 digits that does not start with 0 is looked up, so `12345` and every 10-digit number are refused. A booking outside today or the park gets the same code.

The phone mapped only `booking_not_found` to not found. A refused number showed "Något gick fel vid sökningen.", which reads like a system error although the guest only mistyped.

## What changes

- **Search page.** `createLookupError` maps `live_lookup_not_allowed` to `not_found`. The guest sees the existing answer at once: "Vi hittade ingen bokning idag." and "Kontrollera uppgiften eller hämta personal." ("We couldn't find a booking today." / "Check the details or call staff."). The search makes one request, as before, and is never retried.
- **Cloud's code stays on the error.** `CloudLookupError.code` carries Cloud's error code.
- **Payment recovery is unchanged.** `checkRecoveryPayment` (D0270) offers "Börja om" only when Cloud answers its own not found, not on a refusal. Cloud's assisted lookup answers the same 403 for a booking whose venue it cannot confirm, and that booking may be paid, so a refusal keeps the unresolved-payment card.
- **Preview.** The `/preview/flow` fixture answers like Park: DEMO is found, `987654321` gets ROLLER's 404 and anything else Cloud's 403. It used to find every identifier, which hid this answer.

**Unchanged:** ROLLER failures, configuration errors, other 5xx, emergency stop, disabled lookup, rate limit, a lost connection, the phone-number refusal, wrong date, payment required and kalas keep their answers. The phone keeps no copy of Cloud's shape rule. There is no Cloud, kiosk, ROLLER or AWS change.

## Validation

- `npm run validate:gh603-lookup-shape` is part of `npm run validate`. It runs the real phone client, search page and copy against Cloud's Park answers, and the preview fixture through the real client. It checks that:
  - Cloud's 403 for `12345`, a 10-digit number, another park or another date is not found, with one request and Cloud's code kept;
  - ROLLER's 404 is not found as before, and a booking for today is still found;
  - ROLLER's 502, Cloud's 500, a gateway 503, an empty 504, emergency stop, disabled lookup, rate limit and a lost connection keep their answers, and the phone refusal stays `phone_lookup_disabled`;
  - the guest reads the not-found texts in Swedish and English, and the generic or connection texts for errors.
- `test:payment-recovery` checks that a refusal never offers "Börja om" or gives the payment up, while ROLLER's 404 still offers it.
- On the previous code, four of the six new lookup tests fail. The recovery test fails when only the client is new, so the page change is needed.
- Screenshots at 375 px: the real search page with Cloud's 403 for `12345` showed "Något gick fel vid sökningen." before and shows "Vi hittade ingen bokning idag." after.

## After release

It is a frontend change: the release, the protected Park deploy and the public phone promotion.

- **Love's test.** On the phone, type `12345` on "Hitta din bokning": "Vi hittade ingen bokning idag." comes at once. Type `987654321`: the same answer as before. Look up a real booking for today: it is found.
