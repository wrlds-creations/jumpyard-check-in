# One code field on the phone's payment step

Scope: [issue #510](https://github.com/wrlds-creations/jumpyard-check-in/issues/510), decision D0251. Kiosk counterpart: [kiosk #191](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/191) (D0062).

## Why

On 2026-10-12, after testing #505 and kiosk #188 live, Love asked why the guest has to choose Rabattkod, Medlem or Presentkort: "hade det inte räckt att bara ha … det du skriver in appliceras på antingen rabattkort, medlem eller presentkort?" Love then said "ja bygg det på localhost".

## Behaviour

1. **No chooser.** "Vad vill du använda?" and its three segments are gone. The panel "Rabattkod, medlem eller presentkort" has one field:
   - placeholder "Kod eller kortnummer" ("Code or card number");
   - label "Kod" ("Code");
   - "Klistra in" in the empty field's action slot (#505).

   The issue proposed "Skriv eller klistra in koden". At 375 px it was cut off next to "Klistra in" and repeated the button, so the shorter text also says that card numbers go here.
2. **The value sets the type.** Every typed edit and every paste runs the shared shape rules in `paymentCodeShape.ts`, byte-identical to the kiosk copy:
   - exactly 10 digits is a gift card;
   - digits, a separator and digits is a membership number, sent as a discount code;
   - anything else is a discount code or clip card.

   Typing in one kind clears the other, as before. The normal text keyboard stays, because codes can contain letters.
3. **Automatic check.** A typed complete gift card (10 digits) or membership number (9 + 9) owes one automatic check, the same way a pasted one does (`decidePastedCodeCheck`, D0250).
   - With a ready contact, it is checked at once.
   - Otherwise it is checked once the contact is ready and has settled for 0.8 s.
   - A discount code waits for Applicera, Enter or Continue.
   - A further edit replaces the pending check.
4. **Hints.**
   - The empty field keeps "Gäller även klippkort."
   - While the field holds digits that are not yet a whole gift card or membership number, the hint is the kiosk's: "Presentkort har 10 siffror. Medlemskort har ett bindestreck." ("Gift cards have 10 digits. Membership numbers have a hyphen.").
5. **Titles.** The result names the type: "Presentkortet är godkänt", "Medlemskortet är godkänt" or "Koden är godkänd", with the matching rejection titles.

## Call budget

Unchanged. The type is decided on the phone with no call. A typed complete number costs the one quote an Applicera tap would cost. Continue reuses that quote as before (#421). Nothing changes in Cloud, ROLLER or the request payloads.

## Known edge

A discount or clip card code of exactly 10 digits is now tried as a gift card and rejected. The issue leaves out a second try as the other kind (non-goal). Revisit with the kiosk if such a code turns up.

## Localhost preview

`/preview/klistra-in` (from #505) gains typed frames. Each one enters its text one character at a time through React's input event.

The fixture:
- the gift card covers up to 866 kr;
- the member number takes 30 % off the entries;
- the made-up code `SOMMAR25` takes 25 % off the entries;
- everything else is rejected.

| Id | Shows |
|---|---|
| `tom` | one field, "Kod eller kortnummer" and "Klistra in" |
| `presentkort` | a pasted gift card, checked at once |
| `medlem-skrivet` | a typed membership number, checked at once (−66 kr) |
| `rabattkod` | `SOMMAR25` typed and Applicera (−55 kr) |
| `fel-kod` | `VINTER10` typed and Applicera: rejected |
| `siffror` | `400012` typed and the shape hint |
| `medlem`, `fore-kontakt`, `fallback` | the #505 frames |

## Validation (2026-10-12, localhost)

- **`npm run test:payment-options`: 87 tests passed.**
  - The payment-option harness runs the real `typePaymentCode` and `updatePaymentOptionValue` handlers: type routing, clearing the other kind, the pending check for complete numbers only, and waiting for the contact.
  - The paste suite pins the field's `onChange` to `typePaymentCode` and the SV/EN copy, and checks that the chooser keys are gone.
  - The preview fixture covers `SOMMAR25`.
- **All 20 phone `test:*` suites passed:** 512 tests, 0 failures.
- **Static checks.** `npx tsc --noEmit` passed. `npm run lint` found 0 errors, only the 5 existing `<img>` warnings in unchanged files.
- **Production build.** `npx next build --webpack` and `node scripts/verify-production-mock-boundary.mjs` passed. The export holds the new copy, and none of the preview numbers or the chooser question.
- **Headless Edge at 375 × 812, SV and EN.** The six review frames showed:
  - no chooser;
  - the placeholder fits next to "Klistra in";
  - gift card −269 kr (0 kr to pay), membership −66 kr, `SOMMAR25` −55 kr;
  - `VINTER10` rejected, and the shape hint while digits are typed.

## Rollout

Frontend only, through the Park release and the public promotion, after Love approves on localhost. Afterwards, on an iPhone:

- type a membership number;
- paste a gift card number;
- type a discount code.
