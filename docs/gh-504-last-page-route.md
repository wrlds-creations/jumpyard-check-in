# GH-504: the phone's last page is a route in three steps

Issue #504 turns the phone's last page into a route the guest follows in order: socks, then bands and extras, then jump. Love asked for it on 2026-10-09 ("det första du gör är att hämta dina strumpor och när du har gjort det … hämtar band"). A colleague found the old page, three place headings with full lists, too much to take in. From three sketches Love picked "A lättare". Variant B, with one sentence per step and no lists, was rejected. On 2026-10-12 Love picked the step 2 title, confirmed the printed sign's link and sent the water icon. Decision D0249; kiosk #187 is the counterpart.

## The page

1. **The hero is unchanged:** "Du är incheckad", the check-in time, "Ditt nummer" and the number. Since #519 the jump time follows the number (see [The jump time](#the-jump-time-519)).
2. **The heading depends on where the guest is.**
   - **On site:** "Gör så här nu" ("What to do now").
   - **Elsewhere:** "När ni kommer till JumpYard" ("When you arrive at JumpYard"). The red line "Gå förbi kassan, direkt till steg 1." that first stood under it was removed on 2026-10-12 at Love's request ("det blir bara konstigt").
3. **Numbered steps.** Only steps with something to collect are shown, numbered from 1. Step 1 is red, and a black line joins the numbers.
   - "Hämta strumpor" ("Get your socks"), with the tag "Strumpstationen".
   - "Hämta band och tillbehör" ("Get bands and extras"), with the tag "Bandutlämningen · Visa numret". The title is "Hämta band" with bands only, and "Hämta tillbehör" without bands.
   - "Hoppa!" ("Jump!").
4. **Chips.** Each shows an icon, a red count and one word: Strumpor, Hänglås, SkyRider, Connected, Vatten, Pizza, or otherwise the product name. Entry bands get one chip per Cloud band colour, merging rows of that colour. The chip carries the swatch and the colour name. A band without a colour is "Band" ("Wristband").
5. **The café** follows the route under a red rule: "Caféet · När ni vill · Visa numret". It uses the same chips. GH-453's progress stays: "Kvar i caféet" when part is collected, "Allt i caféet är hämtat" when everything is, and a collected chip says "Hämtat".
6. **The footer:** "Kvitto skickat till din e-post" (after a payment), "Gör en ny bokning" and "Nummer från …". The day line is black now; the page has no grey.
7. **The ended day** ("Besöket är avslutat") is unchanged.

## On site

The guest counts as on site when either of these opened the page:

- **The printed sign.** Its link is `https://checkin.jumpyard.se/?skylt=nacka` (approved on 2026-10-06, confirmed by Love on 2026-10-12). `skylt` stays in the URL.
- **The kiosk's "Lappen i mobilen" link.** That link carries one token only, because the kiosk web and APK accept nothing else (kiosk D0048). So Cloud's session start returns `arrival: "kiosk"` when the token's channel is `kiosk_phone`.

`flow/arrival.ts` remembers "on site" in `sessionStorage` (`jumpyard.onSite.v1`) for the Stockholm day. A reload or "Gör en ny bokning" keeps it, and the next day starts away again. The email link and a plain visit show "När ni kommer till JumpYard". That is still true for a guest already standing in the lobby.

## The jump time (#519)

Love asked for it on 2026-10-13, after a live phone purchase of "2 timmar för 1": the last page did not say when to jump, while the kiosk's does (kiosk #141). Decision D0254.

- **The line:** "Hopptid 15:00–16:30" ("Jump time 15:00–16:30") under the number, white bold italic in the red hero, in both the on-site and the at-home variant. The hero grows 32 px.
- **The time:** `getJumpTime` from `flow/jumpTime.ts`, the same as the booking page (D0241):
  - ROLLER's start and end for entries and family tickets;
  - the start plus the longest admission for a package;
  - "2 timmar för 1" reads start to start + 120 minutes.
- **Where the times come from:** every path already carries them.
  - A phone purchase gets Cloud's provisional booking (D0231). Its draft item ends at the start plus the product length (`buildProductDisplayItem`).
  - A booking opened from home or on site comes through the lookup or the session link (email, sign, kiosk link), with ROLLER's item times.
  - The kiosk's "Lappen i mobilen" QR opens this same page through the session link, so it shows the same line as the kiosk's own hero.
- **Missing data:** without a start there is no line, and without an end only the start shows. The ended day shows no time.
- **Mixed lengths:** a jumpyard.se booking that mixes lengths (for example 60 + 90 min) shows its first row's time, as the booking page and the kiosk do.
- **Preview:** `/preview/sista-sidan` gains `deal` (bought on site), `deal-hemma` (opened at home) and `kiosk-lank` (the kiosk's link, 90 min at 15:00).

## Water

Live ROLLER sells "JumpYard Vatten" (Cold Drinks, 970411), which is plain water. "Vattenflaska" was only our own copy, and is now "Vatten" ("Water") in:

- the add-on step, whose line reads "Ta med egen flaska eller köp här" ("Bring your own bottle or buy here");
- the summary;
- the last page;
- the staff app;
- Cloud's catalog label.

Love's own bottle drawing is `water.png` in phone and staff app, with the inside filled white so it never tints on grey or red. Every water mapping uses it. `water-bottle.png` stays in the folder, unused by water.

## Files

- **Phone:**
  - `components/PhoneCompletion.tsx` and `.module.css` render the route (`buildCompletionChips`, `bandsStepTitle`);
  - `flow/pickupPlaces.ts` gives each row a `kind`;
  - `flow/arrival.ts`;
  - `app/page.tsx` reads `skylt` and Cloud's `arrival`;
  - `flow/cloudClient.ts`, `components/ConfirmationScreen.tsx`;
  - the water copy in `context/LanguageContext.tsx`;
  - the water icon in `addonCatalog.ts`, `AddonChoices.tsx`, `BookingSummary.tsx` and `JumpyardIcon.tsx`;
  - the development-only preview `/preview/sista-sidan` (eight cases in SV/EN, eleven since #519).
- **Cloud:**
  - `infra/lambda/session/index.js` `handleStartSession` returns `arrival` on all four success paths of a `kiosk_phone` link;
  - `infra/lambda/booking/index.js` changes the catalog label.
  - No ROLLER call, migration or AWS resource change.
- **Staff app:** the water label and icon.

## Validation

- **Phone:**
  - every `test:*` script passes, including `test:completion` (route, steps, titles, chip merging, café, arrival) and `test:guest-typography` (roles, no grey);
  - `tsc` and lint (two existing `<img>` warnings);
  - `next build --webpack`.
- **Root:** `validate:gh484-kiosk-phone-link` asserts `arrival: "kiosk"` for the kiosk link and none for an email link. `validate:gh367-combo-contents` follows the chips. Locally, 77 of 79 `npm run validate` steps pass. The two failures are `validate:history-archives` (CRLF size) and `validate:t0194-staff-identity-frontend` (the node_modules junction). Both are known Windows-only failures in files this change does not touch.
- **Staff app:** its three test files pass (96 tests).
- **Visual:** at 375×812 and 320 px in SV/EN, no case scrolls sideways. The sock, band and jump steps sit above an iPhone's fold.
