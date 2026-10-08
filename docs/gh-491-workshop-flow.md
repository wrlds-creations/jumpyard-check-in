# GH-491: a simpler phone purchase after the 2026-10-07 workshop

Issue #491 bundles the changes from the Nacka workshop on 2026-10-07 (with Mustafa; Love and Gustav went through the recording) into one phone and Cloud change. Love reviewed the localhost preview on 2026-10-08 and asked for six changes, which are included below (review round 1); a second pass the same day changed the socks title and text (round 2). Decision: D0244. Love approves everything on localhost before any commit or deployment.

## The guest's purchase now

1. **Starttid.** Under the title, "Klockan är 13:42" shows the phone's own clock and updates on the minute. Each of the next three half-hour start times says how soon it starts ("om 18 min", "om 1 h 18 min", "startar nu") and its 60-minute spots: "34 platser kvar"; under 10 a red "Få platser kvar" above "6 platser kvar"; at 0 a grey "Fullt", and the time cannot be chosen. The 60-minute entry decides for the whole slot, even when 90 or 120 minutes still have room. A slot without a 60-minute answer stays selectable, as before. The clock icon moved from each slot to the header.
2. **Hopptid.** The entry list leads the page, the Weekday Combo follows (Gustav removes it on 2026-10-12), then family. 90 minutes is first in entry and in family, with a red outline and glow and a filled red "Populärt" label on its top edge.
3. **Antal.** A "JumpSocks" card (the same title in English) sits under "Antal hoppare" with its own stepper, the price per pair and Love's text: "Halkfria strumpor är obligatoriska i JumpYard och måste bäras av alla i trampolinområdet, även icke-hoppande föräldrar." (EN: "Non-slip socks are required at JumpYard and must be worn by everyone in the trampoline area, including parents who aren't jumping."). The title shows in capitals like the other card titles; the text takes three short lines at 375 px. The count starts at 0 (nothing preselected) and is the same JumpSocks purchase line the add-on step used, so price, quote and draft are unchanged. The step's total includes the socks.
4. **Tillägg.** Socks are gone from this step. The water bottle carries "Rekommenderas" (the kiosk's word; EN "Recommended") and keeps today's `water-bottle` icon until Gustav's photo of JumpYard's own bottle arrives. Coffee stays "Bryggkaffe" ("Filter coffee"). An existing booking's add-on step (`AddonsOffer`) still offers socks, because it has no quantity step; its socks row is titled "JumpSocks" too, with the same text (before: "Hoppsockor" / "Grip socks" with "Bra grepp. Krävs för alla som vistas i parken.").
5. **Order.** There is no "Sammanställning" step: add-ons (and the SkyRider attestation) lead to safety, then "Din kontakt" with "Att betala" shown open (start time and every line), then payment. Back from contact returns to the safety film; back from the film returns to the add-ons. The progress bar is unchanged. A purchase saved on the old summary step continues at the step that follows the add-ons.
6. **The film after Back.** A guest who watched the film to the end and approved sees the approval at once when coming back from contact, with the approval's original time kept; the docked film still replays. A guest who has not approved yet keeps today's rule: the approval appears only after a genuine end of playback.
7. **After payment.** An approved payment lands on "Du är incheckad" with the number, also after an external payment page: the return path asks Cloud for the provisional session first (`POST /v1/bookings/draft/finalize`, `action: phone_approved`, D0231), as the in-page card payment already did, and only falls back to the ROLLER lookups when Cloud cannot give it. No "Betalningen är klar" page and no button; the only thing in between is the short "Vi slutför ditt köp …" spinner while Cloud answers. The completion shows "Kvitto skickat till din e-post" with the `email-confirmed` icon when the guest paid in this flow (`ctx.paymentCompleted`).
8. **Three places** replace "Hämta på plats". They are light section headings (small icon, the place in capitals, the hint beside it, a rule under it, red for the café), so they never read as buttons:
   - "Strumpstation" / "Ta själv." (EN "Sock station" / "Help yourself."): socks;
   - "Bandutlämning" / "Visa numret." ("Wristband desk"): entry bands with "Armbandsfärg", SkyRider and padlocks;
   - "Caféet" / "Visa numret." ("The café"): coffee, the water bottle and pizza. The café line no longer says "Efter hoppet", since water is collected there too. "Kvar i caféet" and "Allt i caféet är hämtat" are unchanged.
9. **The way back.** "Gör en ny bokning" keeps today's saved visit (`jumpyard.savedVisit.v1`, now marked `parkedAt`) instead of deleting it. The first screen then shows "Tillbaka till min incheckning · 0042" under the two choices, which reopens the completion; a reload no longer opens the parked visit by itself. Nothing shows without a saved visit of today. Showing a completion saves the visit unparked again.

Requirement 9 of the issue (the Weekday Combo live check on Monday 2026-10-12) is a live check and is not part of this change.

## Request budget

| When | Before | Now |
| --- | --- | --- |
| Start-time step opens | 0 | 1 `POST /v1/bookings/availability` with all shown times |
| Continue to the product step | 1 (the chosen time) | 0 (the loaded answer is reused for 5 minutes) |
| Back to start times and Continue again | 1 | 0 while the answer is fresh |
| A restored purchase | 1 (the saved time) | 1 (the saved time together with the shown times) |

Cloud already accepted up to six start times and reads the whole day from ROLLER in one `GET /product-availability`, so the availability contract and ROLLER calls are unchanged. A read that is still running when the guest presses Continue is awaited, never repeated. A missing, failed or older answer is read again once, for all shown times. Quote and draft still re-check availability, so a slightly older count can never sell a full slot. A guest who opens the start-time step and leaves without continuing now costs one read that did not happen before. The live clock and the way back make no requests.

## Cloud

- `infra/lambda/shared/staff-handout.js`: `CAFE_KINDS` adds `water` to coffee, pizza and other food and drink, so a purchased water bottle ("JumpYard Vatten", "Jumpy Vattenflaska") is a café line (`area: 'cafe'`). Byte-identical copies in `session/` and `redeem/`. The staff café tab, the board's `cafeRemaining` and the guest `visit.cafe` follow from the manifest, so they agree. Existing receipts keep their item ids.
- `infra/lambda/session/index.js` `buildGuestVisit`: café lines come from ROLLER's items. When ROLLER has no items for the booking yet (a phone purchase in the minute before ROLLER confirms it), `visit` leaves `cafe` out and the phone groups the draft's own items, as the kiosk link already did (#484). Before this, a fresh phone purchase got `cafe: []` and its completion showed no café at all (found while building this issue).
- No migration, no new route, no ROLLER call change, no new AWS resource. The contract notes are under "Availability rules" and "`visit`" in [JUMPYARD_CLOUD_CONTRACT.md](../JUMPYARD_CLOUD_CONTRACT.md).

## Phone files

- `components/BuyTickets.tsx`: the clock and "om N min", slot capacity, Continue reuse, 90 minutes first with its outline, the socks row, no summary step, the open summary, Back from contact to the film.
- `flow/slotCapacity.ts` and `flow/slotClock.ts`: the pure slot and clock rules; `flow/productVisibility.ts` `isPopularBookingProduct` and `sortPopularFirst`.
- `components/SocksQuantity.tsx`: the socks row on the quantity step (the title has its own line). It reads the add-on step's socks copy (`addons.choices.socksTitle` and `socksBenefit`), so both steps say the same.
- `components/SafetyVideo.tsx`: `approvedAt` shows an earlier approval at once.
- `components/AddonChoices.tsx`: a `rows` prop (the purchase passes only the bottle) and the "Rekommenderas" tag.
- `flow/pickupPlaces.ts`, `components/ConfirmationScreen.tsx`, `components/PhoneCompletion.tsx` (+ CSS): the three places as light headings, and the receipt line.
- `flow/savedVisit.ts` (`parkSavedVisit`), `components/ParkChoice.tsx` and `app/page.tsx`: the way back; the external return asks Cloud's provisional session first; the receipt flag.
- Copy in `context/LanguageContext.tsx` (SV and EN); the unused summary copy is removed.

## Verification

- Phone: `node --no-warnings --experimental-strip-types --test src/flow/*.test.mjs src/components/*.test.mjs src/app/preview/*/*.test.mjs`, `test:workshop-flow`, `test:completion`, `test:payment-*`, `test:safety-video`, `tsc`, `lint` and `next build --webpack` with its mock-boundary check.
- Cloud: `validate:gh345-staff-handout` (water in the café, byte identity), `validate:gh456-auto-checkin` (a visit with water and coffee; no `cafe` without ROLLER items), `validate:gh318-phone-addon-choices`, and the root validators.
- Localhost review: `/preview/workshop` shows every changed state in SV and EN at 375 x 812 with local fixtures (clock 13:42; spots 34, 6 and full), including the first screen with and without a saved visit and Kontakt → Back → Säkerhet. Nothing reaches Park, Live or ROLLER.
- After approval and release: buy on a phone at Nacka (card and an external payment method), check the clock and the slot counts against ROLLER, the number at once, the receipt line, water in the staff café tab, Back from contact on an iPhone, and "Gör en ny bokning" followed by the way back.

## Release order and counterparts

The Cloud classification ships to Park before the kiosk publishes its own counterpart (kiosk repository issue). Phone and Cloud ship in one Park release; the public phone promotion follows it, so the phone never meets a Cloud that keeps water at the entrance. If Cloud is rolled back alone, the phone still shows a bought bottle in the café.

## Open for Love

- The socks text takes three short lines at 375 px in Swedish and English; two lines need a shorter text.
- The new water-bottle icon waits for Gustav's photo.
