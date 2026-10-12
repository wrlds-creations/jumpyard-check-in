# Paste gift cards, membership numbers and codes on the phone

Scope: [issue #505](https://github.com/wrlds-creations/jumpyard-check-in/issues/505), decision D0250. Kiosk counterpart: [kiosk #188](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/188).

## Why

On the phone, the gift card or membership number sits in a ROLLER email on the same phone, and a phone cannot scan its own screen. Love, 2026-10-09 and 2026-10-12: "det kan inte bara vara sifferknappar för ibland är det bokstäver väl också. Men klistrinknappar blev väl viktigt." So the normal keyboard stays and a paste action is the main help.

## Behaviour

The contact step keeps the Rabattkod / Medlem / Presentkort chooser and the one code field from #407 (D0221).

1. **Klistra in.** While the field is empty, its inline action slot shows "Klistra in" ("Paste") in Applicera's small bold italic red. With text in the field, the slot shows Applicera as before.
   - A tap calls `navigator.clipboard.readText()` inside the tap. iOS shows its own paste prompt, and Android may ask for permission once.
   - Without the API, without permission, after a dismissed prompt or with nothing usable on the clipboard, the field gets focus and the line "Håll in i fältet och välj Klistra in." ("Press and hold in the field and choose Paste.") shows until the field has a value. Without the API the focus happens inside the tap, so iOS can raise the keyboard.
2. **Long press.** A paste into the field itself (`onPaste`) runs the same flow and replaces the default insert with the cleaned value.
3. **Type rules.** `paymentCodeShape.ts` is byte-identical to the kiosk copy. A leading `#`, spaces and control characters go. Exactly 10 digits is Presentkort. Digits, a separator and digits is Medlem, stored with a hyphen. Anything else keeps the chosen type, which is Rabattkod by default. The shape wins over the chosen type.
4. **Fill and check.** The chooser switches, the section opens and the field takes the clean number. Then the number is checked like Applicera, once:
   - at once when the contact (first name and email, or all four fields after Cloud's request) is valid;
   - otherwise once the contact is valid and has not changed for 0.8 s. Meanwhile the kiosk's line "Fyll i förnamn och e-post så kollar vi kortet." shows ("…så kollar vi koden." for a discount code). The pause keeps a half-typed email such as `anna@x.s` from using up the check.
   - A typed edit, Applicera, Enter or Continue takes over from the pending check. After the one automatic check, later checks happen through Applicera or Continue, as before. Contact edits never start another automatic check.
5. **Long text.** Text longer than the field's 32 characters is cut, shows "Max 32 tecken" and is not checked by itself.
6. **Hints.** The hint line under the field is black (`text-foreground`) instead of grey, which also covers the existing hints in that line.

`src/flow/paymentCodePaste.ts` holds the pure parts: what a paste fills in, and when the pending number is checked (`decidePastedCodeCheck`). `BuyTickets` clears the pending number before it calls Applicera's handler from a timer, so a number cannot be checked automatically twice.

## Call budget

Unchanged. A pasted number costs at most the one quote that an Applicera tap would cost, and only once per paste. Continue reuses that quote as before (#421). Nothing changes in Cloud, ROLLER, the request payloads or the kiosk.

## Localhost preview

The development-only `/preview/klistra-in` renders the real `BuyTickets` contact step through its pre-payment recovery path, with one 60-minute entry at the 220 kr drop-in price and one pair of socks at 49 kr.
- A local fetch transport answers availability and quotes. A 10-digit gift card covers the basket up to 866 kr. A membership number takes 30 % off the entries only (−66 kr, 203 kr to pay), as in Love's live check on 2026-10-12. Anything else is rejected.
- Drafts and every other API call are refused, Continue stops before Cloud, and the transport refuses to run outside development or off localhost.
- Each frame simulates the clipboard: `tom`, `presentkort`, `medlem`, `fore-kontakt` and `fallback`. `?clip=<text>`, `?clip=denied`, `?clip=missing` or `?clip=real` override it. `tom` uses the computer's own clipboard.
- The production export keeps the route a not-found page (`verify-production-mock-boundary.mjs`, `test:production-mock-boundary`).

## Validation

Run on 2026-10-12 in the `codex/gh-505-paste-payment-codes` worktree:

- `npm run test:payment-options`: 86 tests passed. That is 57 existing, 6 shared shape, 17 paste and 6 preview fixture tests.
- All 20 phone `test:*` scripts passed: 505 tests, 0 failures.
- `npx tsc --noEmit` passed.
- `npm run lint` passed with 0 errors and the 5 existing `<img>` warnings in unchanged files.
- `npx next build --webpack` passed, and `node scripts/verify-production-mock-boundary.mjs` passed. The export holds the new copy and none of the preview code or synthetic numbers.
- Root `npm run validate`, step by step: 58 of 76 steps passed, including `validate:gh407-payment-options`, `validate:gh318-phone-addon-choices`, `validate:gh347-production-mock-boundary` and `validate:template`. 17 steps need the root, infra or admin dependencies that this worktree does not have. `validate:history-archives` fails only in a Windows checkout: `PROJECT_CONTEXT.md`, which #505 does not change, is 11,928 characters in git but 12,043 with CRLF endings. `node scripts/wrlds/validate.js` and `git diff --check` passed.
- Headless Edge at 375x812 in SV and EN went through all five frames. It also checked a long-press paste event, a rejected code, a missing clipboard API, a long text, and a paste before contact followed by typing. That last check made exactly one quote request, and a later email edit made none.

## Open questions

- Should a copied sentence with one number in it (for example "Presentkortsnummer: 4000123456") pick out that number? Today it is filled in as a code, cut to 32 characters, and not checked. Any change belongs in the shared shape rules together with the kiosk.

## Rollout

Frontend only, through the Park release and the public promotion, after Love approves on localhost. After release, Love pastes the gift card number from the email on an iPhone.
