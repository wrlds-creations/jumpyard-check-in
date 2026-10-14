# Test Plan

## Simpler sign-in: no admin code and any staff PIN (#542)

Run `npm run validate:t0194-staff-identity-backend`, `validate:t0194-staff-identity-infra`, `validate:gh483-kiosk-staff-resolution` and `validate:gh488-kiosk-pairing` (all part of `npm run validate`). They check that:
- `111111` and `123456` can be created, reset and used for PIN login, kiosk pairing and kiosk payment resolution;
- a PIN already in use is still refused with `409 staff_pin_unavailable`;
- the admin user pool synthesizes `MfaConfiguration: OFF` with no `EnabledMfas`.

The Park plan may change only the admin user pool's MFA setting and the Session Lambda code. After release, follow [the notes](docs/gh-542-simpler-signin.md#after-release).

## Webhook retry timing and kiosk confirmation sources (#346)

Run `npm run validate:gh346-webhook-retry` (part of `npm run validate`). It loads the real webhook worker and checks five things:
- A failed record becomes visible again after 60, 120, 240 or 480 s, set by its receive count, and is released at once on the fifth delivery.
- It is still reported as a batch failure, including when rescheduling fails.
- A processed record keeps its visibility.
- A ROLLER request carries a timeout signal, and a hang fails as `roller_request_timeout`.
- A kiosk confirmation that is not confirmed carries only a safe reason code.

It also loads the Booking Lambda's kiosk confirmation check. Rows from the automatic check-in's final refresh count as authoritative. A kiosk snapshot, the nightly sync and a tombstone do not, and the other checks still apply. Source assertions pin one message group, one worker, batch size 1, 12-minute visibility and five deliveries.

Also run `validate:t0197-webhook-reconciliation`, `validate:gh282-kiosk-handoff-repair`, `validate:kiosk-payment-reconciliation`, `validate:gh456-auto-checkin` and `validate:gh483-kiosk-staff-resolution`.

After release, a kiosk card purchase on Park leaves `webhook-processing-failures` and `webhook-queue-stale` OK, and the processor log shows no `kiosk_confirmation_failed`. [Notes](docs/gh-346-webhook-retry.md).

## The booking role no longer reads guest profiles (#538)

Run `npm --prefix infra run validate:t0195-least-privilege` (part of `npm run infra:check`). It applies every migration's `GRANT` and `REVOKE` in order, asserts that `jumpyard_booking_runtime` has no `SELECT` on `jumpyard.guest_profiles`, and still checks every Booking Lambda statement against the remaining grants. Without migration 0027 it fails on the new assertion; with a booking statement that reads `guest_profiles` it fails grant coverage. CI's database job applies every migration, `0027` included, to PostgreSQL. After the Park run with `apply_migrations=true`, the migration status lists `0027` as applied, and an add-on quote and draft still work with no `permission denied` in the booking logs.

## The socks reminder (#533, kiosk #215)

Run `npm --prefix jumpyard-checkin-phone run test:socks-reminder` (also part of the root `validate`). `socksReminder.test.mjs` runs the real `BuyTickets` and `AddonsOffer` handlers: the reminder on leaving Entré and the add-on step without socks; "Lägg till strumpor" staying on the step with the socks block called to attention; "Vi har egna" continuing as Continue does, with and without other add-ons; at most once per visit; and never with chosen or included socks, unsellable socks or a loading or failed catalog. It also renders the dialog and checks its copy in SV and EN. Run `test:safety-video`, `test:workshop-flow` and `test:flow-nav`, which follow the new handlers, the other phone suites, lint and `tsc`. In the development-only `/preview/addons?full=1&scenario=buy2|booking0|booking`, check SV and EN at 375x812: Back to Entré, Fortsätt without socks, the reminder, "Lägg till strumpor" (the socks block pulses and its + is focused), then Fortsätt again goes on; "Vi har egna" opens Tillägg; `booking` (2 pairs included) never asks. After release, on an iPhone, continuing without socks shows the reminder in a purchase and in an existing booking, and both choices work. [Notes](docs/gh-533-socks-reminder.md).

## An add-on never changes the ROLLER guest (#532)

Run `npm run validate:gh532-addon-roller-guest` (part of `npm run validate`). It runs the real add-on quote and draft handlers against a stand-in ROLLER. For original bookings titled with the owner's name, a double first name, an email-first first name, "Add-on for <ref>", a staff title and "JumpYard booking", the draft carries the guest exactly as `GET /guests/{customerId}` returns it, with no marketing flag, and keeps the name "Add-on for <ref>". A client customer never reaches ROLLER. An incomplete guest, a 404 or a missing customer id stops before any write, and a failed read is a 502. The quote sends the placeholder customer without a guest read. `email-marketing-integration.test.js`, `validate-gh327-kiosk-terminal-binding.test.js` and `validate-gh488-kiosk-pairing.test.js` cover the payload builder and the kiosk add-on draft. After release, Love buys one add-on on a test booking, and a read-only ROLLER check shows the guest's names, email, phone and marketing flags unchanged. [Notes](docs/gh532-addon-roller-guest.md).

## The safety film starts by itself, muted (#530, kiosk #212)

Run `npm --prefix jumpyard-checkin-phone run test:safety-video`. `safetyPlayback.test.mjs` covers the muted automatic start reaching the approval, a muted tap, and a refused start (async, synchronous and after a language switch) ending at the poster's play button. `SafetyScreen.test.mjs` pins the mount rule, `muted` + `playsInline`, the poster with its spinner and that no sound control is left. Run the other phone suites, lint, `tsc` and `next build --webpack`. In the development-only `/preview/flow?full=1&screen=safety-buy|safety`, check SV and EN at 375x812 in a browser that requires a tap for sound: the film plays by itself with no control on it, and Back, Exit and the approval after the end are unchanged. After release, on an iPhone, the film starts by itself in a purchase and in an existing booking with an add-on. [Notes](docs/gh-530-safety-video-autoplay.md).

## Kiosk reconciliation expected misses (#531)

Run `npm run validate:gh531-kiosk-expected-miss` (part of `npm run validate`). It loads the real Booking Lambda with scripted ROLLER answers and checks four things. Waiting 404s before ROLLER creates the booking emit `RollerApiExpectedMissCount` and no `RollerApiErrorCount`. A reconciliation that runs out of its 16 attempts still emits one error. A 5xx, 401, 429 or 400 during the wait stays an error. A 404 elsewhere is still an error, and the alarms still read only `RollerApiErrorCount`. Also run `validate:gh481-kiosk-publish-with-payment`, `validate:kiosk-payment-reconciliation`, `validate:gh340-server-errors` and `validate:gh335-alarm-routing`. After release, a kiosk card purchase on Park leaves `roller-api-errors` OK. [Notes](docs/gh-531-kiosk-expected-miss.md).

## A 0 kr purchase goes straight to the last page (#524, kiosk #206)

Run `npm --prefix jumpyard-checkin-phone run test:payment-confirmation`. Its `purchasePreparationFlow.test.mjs` runs the real `createDraft` and `resolvePaidDraftBooking` with the page's `onBookingReady`: a 0 kr draft stays on the contact step and opens the last page with one lookup and one session start, never the "Bokning klar" card; a session Cloud could not make ready is marked ready by the page, never the safety film; a refused ready call is retried after 2 s and 4 s, and one that keeps failing shows the card; three failed lookups open the card with "Hämta bokningen igen", whose retry is one more lookup and no new draft; the waiting purchase is saved as pending. `test:payment-options`, `test:phone-contact`, `test:flow-nav` and `test:completion` pin the busy button, the locks, the kept spacer and "Kvittot är skickat till din e-post". Run the other phone suites, lint, `tsc` and `next build --webpack`. On localhost, the real page `/?park=1` at 375x812 with a browser-only stand-in for Cloud shows, in SV and EN: a 100 % code brings "Att betala" to 0 kr, "Slutför bokning" turns busy with Back, Exit and the fields locked, the last page opens with the new receipt line, a forced lookup failure shows the retry card, and a session start that is not ready with a first ready call refused still goes straight to the last page without the film. After release, on an iPhone, a purchase with a 100 % code or a gift card that covers everything goes straight to the last page, without the film a second time. [Notes](docs/gh524-zero-kr-last-page.md).

## Back from payment keeps the contact step editable (#518)

Run `npm --prefix jumpyard-checkin-phone run test:payment-options` (part of `npm run validate`). The payment-option harness runs the real `BuyTickets` handlers: Back from payment keeps the draft and an unchanged Continue makes no call; a changed first name, email, email choice, typed code or removed code drops the kept draft, and Continue creates one fresh draft with the new values; Back stays shut while a payment runs. `emailMarketingConsent.test.mjs` pins the email choice handler. After release, Love goes to payment on an iPhone, taps "Tillbaka", adds a code and sees the lower price on "Betalning". [Notes](docs/gh-518-back-from-payment-edit.md).

## The jump time on the last page (#519)

Run `npm --prefix jumpyard-checkin-phone run test:completion`: "Hopptid" / "Jump time" under the number, the deal's 120 minutes, a 90-minute entry, the kiosk link on site, a package's longest admission, no line without a start or on an ended day. Run `npm run validate:gh367-combo-contents`: the time from Cloud's provisional purchase, a lookup and a session-link resume. Run the other phone suites, lint and `tsc`. In the development-only `/preview/sista-sidan`, check `deal`, `deal-hemma`, `kiosk-lank`, `plats`, `hemma` and `slut` in SV/EN at 375x812. After release, from Monday to Thursday, buy "2 timmar för 1" on a phone, open an existing booking, and scan the kiosk's "Lappen i mobilen": each last page shows the booked start and end, the kiosk link the same as the kiosk. [Notes](docs/gh-504-last-page-route.md#the-jump-time-519).

## The "2 timmar för 1" deal (#514, kiosk #195)

Run these checks:

- `npm run validate:gh514-deal`, which runs the real availability, validation and quote handlers. It covers Drop-In prices from the one existing read, a hidden deal when it is unlisted, the catalog fails, there is no session or it is renamed, rejected mismatched tiers and the quote id;
- `validate:gh501-dropin-entry-prices`, `validate:gh339-catalog-resilience` and `validate:gh459-band-colours`;
- the phone `test:product-visibility`, `test:workshop-flow` and `test:completion`, the kiosk `test:product-visibility`, and lint and `tsc` in both repos.

In the development-only `/preview/workshop`, check the phone frames `hopptid`, `antal-deal`, `kontakt-deal` and `klar-deal` at 375x812, and the kiosk states `jump`, `quantity-deal` and `contact-deal` at 1080x1920, in SV and EN. The deal comes first with "Passa på" and "Betala för 60 min". The summary line reads "2 timmar för 1". The completion shows one band per jumper for start + 120 minutes.

After release, on a Monday to Thursday:

- buy the deal on a phone and on the kiosk at the kassa price;
- check the band colour and the staff handout;
- check that Friday to Sunday shows no deal. [Notes](docs/gh-514-deal-2-for-1.md).

## One code field on the phone (#510)

Run `npm --prefix jumpyard-checkin-phone run test:payment-options` (part of `npm run validate`). The payment-option harness runs the real `typePaymentCode` and `updatePaymentOptionValue` handlers: the type follows the value, the other kind is cleared, only a whole gift card or membership number owes the one automatic check, and a number typed before the contact waits for it. The paste suite pins the field's typed edit and the SV/EN copy and checks that the chooser keys are gone. In the development-only `/preview/klistra-in`, check the frames `tom`, `presentkort`, `medlem-skrivet`, `rabattkod`, `fel-kod` and `siffror` in SV/EN at 375x812: no chooser, the placeholder fits next to "Klistra in", and each status names the type. After release, Love types a membership number, pastes a gift card number and types a discount code on an iPhone. [Notes](docs/gh-510-one-code-field.md).

## Paste codes on the phone (#505)

Run `npm --prefix jumpyard-checkin-phone run test:payment-options` (part of `npm run validate`). It covers the shared type rules (byte-identical to kiosk #188), the paste helper and the real `BuyTickets` paste handlers and check effect: one automatic check per pasted value, the 0.8 s pause after the contact becomes valid, no check per keystroke, and Applicera, Enter, a typed edit or Continue taking over. It also pins the normal keyboard, the black hint line, the SV/EN copy and the preview fixture. Run `test:production-mock-boundary`, the other phone suites, lint, `tsc` and the production build with its mock-boundary verifier. In the development-only `/preview/klistra-in`, check the frames `tom`, `presentkort`, `medlem`, `fore-kontakt` and `fallback` in SV/EN at 375x812. After release, Love pastes the gift card number from the ROLLER email on an iPhone, through Safari's paste prompt and with a long press, and on an Android phone with and without clipboard permission. [Notes](docs/gh-505-paste-payment-codes.md).

## Guest typography (#498)

Run `npm --prefix jumpyard-checkin-phone run test:guest-typography` (part of `npm run validate`). It pins the one upright Acumin face without an oblique range, the role axes (heading 60/900/-12 upright, button 65/900 italic, small button 65/800 italic, body 100 with wght 400/700), the role rules, the site weights and the completion hero's line boxes. `npm run validate:t0194-staff-identity-frontend` must still pass (the staff app keeps the shared system stack, D0159/D0247). On localhost check `/preview/workshop` at 375x812, 390x664 and 360x640 in SV and EN: no overflow, headings upright and buttons oblique. Love confirms it live on an iPhone.

## Start-page heading (#495)

Run `npm --prefix jumpyard-checkin-phone run test:logo-hop`, which also pins the "Redo att" / "hoppa?" copy in SV and EN and the red accent. Then check by hand on a phone that the start page reads "REDO ATT HOPPA?" on one line, with HOPPA? in red, and "READY TO JUMP?" in English.

## Start-page logo flip (#492)

Run `npm --prefix jumpyard-checkin-phone run test:logo-hop`. It covers the logo becoming ready only after the image has loaded and the fade has finished, cached and broken images, the room rule, one 360° turn after a 0.8 s beat, transform-only animation, and reduced motion. Then check by hand on a phone, in Safari and in Chrome. On the start page the logo should wait a beat, flip once and land. Switching SV/EN should not replay it. Both buttons should work during the flip. With reduced motion on, the logo should stand still.

## Workshop purchase flow (#491)

Run `npm --prefix jumpyard-checkin-phone run test:workshop-flow` (slot spots and the clock, Continue reuse, 90 minutes first, socks as the JumpSocks line, no summary step, Back from contact to the film), `test:completion` (the three places as light headings, water in the café, the receipt line, the parked saved visit and the way back on the first screen), `test:safety-video` (an earlier approval shows at once), `test:payment-confirmation` (an external payment return lands on the number with Cloud's provisional session), `test:payment-recovery`, `npm run validate:gh318-phone-addon-choices` (one JumpSocks title and text for the quantity step and an existing booking's add-on step), `validate:gh345-staff-handout` (water is a café line, byte-identical copies) and `validate:gh456-auto-checkin` (the guest visit lists water in the café and leaves `cafe` out without ROLLER items), plus phone lint, `tsc` and the production build. In the development-only `/preview/workshop` check every frame in SV/EN at 375x812: the first screen with and without a saved visit, start times with the clock, "om 18 min", 34 left, "Få platser kvar" and "Fullt", 90 min first with its red outline in entry and family, "JumpSocks" under the jumpers, the bottle "Rekommenderas" without socks, safety right after the add-ons, contact with "Att betala" open, Kontakt → Back → Säkerhet with the approval at once, and both completions (Weekday Combo; water and coffee). The production export keeps `/preview/workshop` a not-found page. After release, buy on a phone at Nacka with a card and with an external payment method: the clock and slot counts match the phone and ROLLER, a full slot cannot be chosen, the number appears at once with the receipt line, Back from contact does not ask for a rewatch, "Gör en ny bokning" offers the way back, and the staff café tab lists the water bottle. [Notes](docs/gh-491-workshop-flow.md).

## Safety before an existing booking's summary (#520, kiosk #202)

Run `npm --prefix jumpyard-checkin-phone run test:safety-video`. Its `addonSafetyOrder.test.mjs` runs the real `AddonsOffer` handlers: add-ons, film, summary and payment with one quote; Back from the summary to the film and from the film to the add-ons; an earlier approval straight to the summary; a late or failed quote; SkyRider first; a declined payment; nothing to pay; the old order; and the progress column. Also run `test:flow-transitions` (SkyRider), the other phone suites, lint, `tsc` and `next build --webpack`. In the development-only `/preview/flow?full=1&screen=booking`, check SV and EN at 375x812: +1 water, Fortsätt, the film, the approval with "Räknar pris…", the summary under Betalning, Back to the film with the approval at once, Back to the add-ons, Fortsätt straight to the summary, then the payment stand-in. After release, on an iPhone at Nacka, an existing booking plus an extra water bottle shows the film before the summary. [Notes](docs/gh-520-safety-before-addon-summary.md).

## One JumpSocks block (#515, kiosk #197)

Run `npm --prefix jumpyard-checkin-phone run test:workshop-flow` and the other phone suites, plus lint and `tsc`. The new test checks three things: the booking's add-on step renders the purchase's `SocksQuantity` with `included`, the add-on list has no socks, and the parents are red in both languages. In the development-only `/preview/addons`, check `booking` (2 pairs included) and `booking0` (none) in SV and EN at 390×844 and 375×667. The socks block comes first, then water and the shelf, and Continue works without socks. After release, check in a Nacka booking on a phone and see the same block as on the purchase's quantity step. [Notes](docs/gh-515-jumpsocks-block.md).

## The last page as a route (#504, kiosk #187)

Run `npm --prefix jumpyard-checkin-phone run test:completion`: steps 1 to n, only places with something to collect, the step 2 titles, one chip per band colour, the café progress, the receipt in the footer, `skylt` and `arrival`. Also run `test:guest-typography` (roles, no grey), `test:workshop-flow` and `npm run validate:gh484-kiosk-phone-link` (`arrival: "kiosk"` only for the kiosk link), plus phone lint, `tsc` and the production build. In the development-only `/preview/sista-sidan`, check all eight cases in SV/EN at 375x812: on site, at home, bands only, two colours, the café partly and fully collected, Weekday Combo and the ended day. After release, at Nacka:

- open the sign's link and see "Gör så här nu";
- open the email link and see "När ni kommer till JumpYard";
- scan the kiosk's "Lappen i mobilen" and see "Gör så här nu";
- check that the staff app and the add-on step say "Vatten" with the new icon. [Notes](docs/gh-504-last-page-route.md).

## Safety before payment (#458, kiosk #143)

Run `npm run validate:gh458-safety-before-payment` and `validate:gh331-paid-booking-confirmation`, the phone suites `test:safety-video`, `test:paid-confirmation`, `test:payment-confirmation`, `test:payment-recovery`, `test:payment-options`, `test:flow-nav`, `test:exit-flow` and `test:language-toggle`, and in the kiosk repo `test:safety-video`, `test:kiosk-terminal-payment`, `test:kiosk-terminal-presentation`, `test:kiosk-ux`, `test:exit-flow` and `test:kiosk-timeslot-and-draft-recovery`. Add lint, typecheck and builds. In the development flow previews check design A at phone widths and 1080x1920 in SV/EN: the approval appears only after the real end of the film, Back from safety returns to the review (on a new purchase to the add-ons, since #491 has no review step), and the progress bar shows Safety before Payment. On Park, buy on a phone: the number and QR appear at the approved payment without a safety step. The staff app shows "Bokningen bekräftas" until ROLLER's paid booking is attached, then allows the handout. On an existing booking, add-ons, safety, add-on payment and the number follow in that order; without add-ons, safety leads straight to the number. Reload at contact and during payment, and check that a declined payment leaves no ready visit. Run the kiosk path with the P400: the number appears right after card approval, before the ROLLER sync. [Contract and evidence](docs/gh458-safety-before-payment.md).

## Phone email-first contact (#473)

Run `npm run validate:gh473-contact-lookup`. It covers the Cloud lookup outcomes, the exact Klaviyo request, exact ROLLER payloads, idempotency, logs and responses without contact values, and the quote customer. On the phone it covers the form, the fallback, recovery and the client payloads. Also run `validate:gh409-phone-policy`, `validate:gh437-email-marketing`, `validate:gh327-kiosk-terminal-binding`, the phone payment-recovery and payment-options suites, lint, typecheck, the production build with its mock-boundary verifier, and `npm run infra:check`.

In the development-only `/preview/contact`, check both states in SV/EN at 390x844 and 375x667:
- By default the form shows first name and email only.
- After the synthetic `contact_details_required` answer, the notice, last name (focused) and phone appear. Email, basket and codes stay, and Continue needs both new fields.
- The production export keeps `/preview/contact` a not-found page.

Park acceptance follows the protected release and Love storing the key. Use owned aliases and synthetic values only:
- A known alias keeps its ROLLER and Klaviyo name, phone and postcode. Compare the full ROLLER address before and after, because ROLLER may replace address fields that the partial `address` does not carry.
- A new alias gets `Gäst` and `0700000000`.
- No key, a wrong key or a forced timeout shows the full form.
- Record the `booking.contact_lookup` latency from CloudWatch Logs, and check that the payment JWT payload keys carry no customer fields.

## Phone add-ons without ticks (#457)

Run `npm run validate:gh318-phone-addon-choices` with `npm --prefix jumpyard-checkin-phone run test:addon-back`, `test:product-visibility`, `test:flow-nav` and `test:payment-recovery`. In the development-only `/preview/addons` check buying for 2 jumpers, a booking with socks included and a family of 4 in SV/EN at 390x844 and 375x667: all five add-ons visible without scrolling, no own-item tick, Continue works with nothing selected, SkyRider still opens its attestation and the total sits between the Back/Exit buttons. The production export must keep `/preview/addons` a not-found page. Check an iPhone in Safari on Park.

## Phone Back/Exit (#441)

Run `npm --prefix jumpyard-checkin-phone run test:flow-nav` with `test:exit-flow`, `test:addon-back` and `test:language-toggle`. In the development flow preview check the round Back/Exit buttons at 320-430 px in SV/EN, that the last ticket card scrolls clear of them, that they hide while a text field has focus and behind the exit dialog, and that Exit still opens the confirmation. Check an iPhone in Safari on Park for toolbar and keyboard behavior.

## Phone email marketing (#437)

Kiosk new purchases follow the same rule (#444): `npm run validate:gh437-email-marketing` also covers kiosk checked/unchecked drafts, kiosk consent acceptance, the kiosk evidence source and add-on isolation, and `validate:kiosk-terminal-backend` checks that the cost payload drops marketing flags.

`npm run validate:gh437-email-marketing` runs synthetic consent/worker/handler tests and phone choice contracts; `npm run validate` includes it through `prevalidate`. Also run phone payment-option, purchase-preparation, contact and payment-recovery suites, lint, typecheck and production build, plus `npm run infra:check`. Verify that the switch stays hidden until the email field is opened, starts off, switches on only for a complete email, locks once the draft exists, optional continuation, keyboard focus, email-change reset and separate privacy link at mobile widths in both languages using synthetic preview transport. No provider write or payment is part of these checks.

Local tests do not prove ROLLER omission semantics, paid-only guest-update propagation, suppression protection or concurrent profile preservation. A separately approved September 23 unpaid draft preserved all returned fields for the owned subscribed ROLLER guest when both marketing flags were omitted; immediate and delayed preference readbacks passed. Love's subsequent screenshot confirms unchanged basic Klaviyo channel status; the other provider gates remain outstanding. Use separately approved owned test data for further writes and obtain the connector contract before rollout. Under D0225 a checked choice travels with the draft and no profile approves the after-payment worker (locked by `scripts/validate-gh437-delivery-gate.test.js`). Before public promotion, verify with fresh owned addresses on the Park phone origin that checked becomes Subscribed and unchecked stays unsubscribed. [Detailed evidence and release gates](docs/gh-437-phone-email-marketing.md).

## Automatic check-in and one number all day (#453, #456)

Run `npm run validate:gh456-auto-checkin` and `npm --prefix jumpyard-checkin-phone run test:completion`, plus `infra:synth`, the full phone suite, the gh333, gh345 and gh392 validators, and admin `tsc`.

- **Window:** check the window edges (start − 120, session end, another day), and that missing times never block.
- **Automatic admission:** check admission once with the staff key and the `automatiskt` actor, and that nothing is admitted while the booking sync is pending, staff hold a claim, the session is not ready or it is another day.
- **Failures and kill switches:** outages retry at most three times; a rejection or the last failure marks needs-staff; `AUTO_CHECKIN_REDEEM=off` and the emergency stop block admission. The Park config deploys `autoCheckin.redeem: true` (D0242).
- **Texts (D0241):** the on-site and café banners, the window boxes, the number's day at the bottom and the email's step 3 have the agreed words, no dashes in sentences and no "stationen" (SV and EN). A Weekday Combo's booking page reads 14:00–15:00 and 60 min.
- **Same number all day:** a reopen after admission returns `session_completed` the same day. The phone shows the number with no QR code, Cloud's café lines and what is left, the ended day, and the window notices in SV and EN.
- **Saved visit:** it keeps no guest access token and is dropped the next day.

Park, with a real same-day booking:
1. Check in at home via the email link inside the window. The board shows "Incheckad HH:MM · automatiskt".
2. Buy at the kiosk and on the phone. Both are admitted after ROLLER confirms.
3. Try to check in too early, and late within the session.
4. Reload after admission. The same number shows.
5. Make a partial café pickup, reload, and check the remaining quantity.

See [behaviour and verification](docs/gh-453-456-auto-checkin.md).

**Kiosk phone link (#484, D0240).** Run `npm run validate:gh484-kiosk-phone-link` and `test:completion` (`kioskPhoneLink.test.mjs`). It checks:
- the link is minted only with `phoneLink: true`, is hashed, opens `checkin.jumpyard.se`, expires at midnight and is capped;
- it resolves like the email link;
- reconciliation moves a purchase's link;
- the phone waits on `booking_not_fresh`.

On Park, scan the kiosk QR after a kiosk check-in and after a kiosk purchase. The phone shows the same number.

## Phone completion (#432)

Run `npm --prefix jumpyard-checkin-phone run test:completion` plus the completed-booking/package-content regressions. Check SV/EN, 320–430px, zero-prefixed and long codes, missing/completed sessions, handoff day, Combo/café groups, QR modal focus/close and supplied safe reset. The production export must hide `/preview/completion`; verify rendered QR payload identity using synthetic data. Physical handset/scanner acceptance remains distinct from local browser and static publication checks. See [evidence](docs/gh432-phone-completion.md).

## Kiosk installation binding (#327)

Run `npm run validate:gh327-kiosk-terminal-binding` for both draft handlers and profile authorization. Set `GH327_DATABASE_TEST=true` for the disposable PostgreSQL concurrency/role test (local port 55327, CI port 55435). [Contract, rollout and physical acceptance](docs/gh-327-kiosk-terminal-binding.md) distinguish automated checks from the completed attended V210/P400 payment and reset evidence.

## Kiosk pairing (#488)

Run `npm run validate:gh488-kiosk-pairing`. It covers the kiosk name directory, paired terminal resolution, the not-paired refusal, status, the allowlist, taken names, replace, unresolved-payment blocks and the PIN proof without a staff session. Set `GH488_DATABASE_TEST=true` for the disposable PostgreSQL case (local port 55488, CI port 55435). The T0193/T0194 validators assert 30 routes and 215 resources. Physical check on 2026-10-12: pair each Nacka kiosk with an allowlisted PIN and cancel one purchase on its own terminal with the red X.

## Kiosk publish with the terminal payment (#481)

Run `npm run validate:gh481-kiosk-publish-with-payment` and `npm run validate:kiosk-payment-reconciliation`. Set `GH481_DATABASE_TEST=true` for the disposable PostgreSQL case (local port 55481, CI port 55435). Physical acceptance is a supervised P400 purchase on Park. The booking is confirmed within seconds. At least 2 minutes later the ROLLER booking has exactly one payment and nothing owing, and the payment can be refunded through "Refund via gateway (Adyen)" in Venue Manager. See [the note](docs/gh-481-kiosk-publish-with-payment.md).

## Staff resolution of an uncertain kiosk payment (#483)

Run `npm run validate:gh483-kiosk-staff-resolution`. It covers the ROLLER evidence rules, every refusal, the "paid" attachment, the PIN proof (no session, shared limiter, operator role) and malformed requests. Set `GH483_DATABASE_TEST=true` for the disposable PostgreSQL case (local port 55483, CI port 55435): the guarded release under the booking runtime role, its audit row, the immediate takeover of both kiosk claims, and refusal for recent, approved, foreign-kiosk and already-booked attempts. Physical acceptance is done together with kiosk #160 on the P400: disconnect the terminal, then reconnect and retry, plus one staff release. See [the note](docs/gh-483-kiosk-staff-resolution.md).

Use this file to define active validation for the current project or milestone. Historical validation evidence was moved to [docs/history/validation-log.md](docs/history/validation-log.md) during T0128.

## Current Root Validation

### Localized safety media (#343)

- `npm --prefix jumpyard-checkin-phone run test:safety-video`: media hashes, fast-start atom order, per-language size budgets, playback recovery and stale/denied language-play attempts.
- After the phone production build, run `node scripts/verify-safety-video-browser.mjs` from `jumpyard-checkin-phone` with an existing Playwright installation (`PLAYWRIGHT_MODULE` can identify its entry file). The isolated temporary fixture uses real production-mode components and exported styles/media; it is never published. It measures first frames at 10 Mbps/100 ms RTT (five samples), a slow-network case, cached return requests, rapid language changes, full viewing, pause/failure recovery, saved preference and StrictMode, at 320/390 px. `SAFETY_BROWSER_OUTPUT` selects the evidence directory.
- Record first-run outliers and any missed timing target. Physical Safari/PWA, Android, actual hosted cache headers and shared park Wi-Fi remain distinct post-promotion checks.

| Command | Purpose | Expected Result |
|---|---|---|
| `npm run validate:gh409-phone-policy` | Test required phone on the four-field draft path, supplied contact payload, placeholder ingestion/SMS refusal and phone lookup rejection; verify phone form/recovery/copy (email-first since #473). Paired `validate-gh327-kiosk-terminal-binding.test.js` verifies direct draft creation without customer reads and retained payment reservations. | Synthetic-only pass. [Provider and browser limits](docs/gh409-no-phone-contact.md) remain explicit. |
| `npm run validate:gh392-prearrival-email` | T-120/late-booking planning, the 2026-09-28 Stockholm date lock and the 2026-09-25 Love-only proof day, supported-product filter, own phone/kiosk purchase and started check-in exclusion, multi-page scheduled runs with time budget, read-only operator route, booking-bound links, four-hour sessions, arrival copy and delivery reservation. Optional `GH392_PSQL` runs only against the disposable local cluster on port 55492. | Deterministic synthetic checks pass; the product SQL was also run read-only against the Park cache. Real delivery is observed on 2026-09-28. |
| `npm run validate:gh353-klarna-policy` | Exercise the real phone component and installed Roller SDK offline: both purchase kinds exclude Klarna in fresh session requests, preserve device exclusions and old payment returns, and reject replacement attempts while payment is unresolved. | 13 tests pass; provider-side exclusion and handset visibility still need post-promotion verification. |
| `node scripts/validate-current-ticket.js` | Confirm `CODEX_TASK.md` is a static resolver for `codex/gh-<issue>-<slug>` and the workflow requires `gh issue view`. | Passes locally without network access. |
| `node scripts/validate-followups.js` | Confirm operational follow-ups and queue state are owned by GitHub Project drafts rather than mutable Markdown ledgers. | Passes locally without network access. |
| `node scripts/validate-history-archives.js` | Confirm required history and migration records exist, active docs link them, completed legacy tickets remain intact, and roadmap Markdown contains only Project policy, guardrails, external gates, and a migration pointer. | Passes locally without network access. |
| `node scripts/validate-github-project-migration.js` | Confirm the immutable migration record contains 29 unique Project drafts, exact-once ownership for 37 draft followups, all 40 legacy backlog IDs, 7 gates owning 8 followups, and 2 completed archive rows. | Passes locally without network access; live Project state and the default-repository setting are checked separately. |
| `node scripts/validate-t0177-contact-lookup.js` | Confirm T0177 identifier inference, phone normalization, same-day scoping, and nearest-upcoming match selection. | Passes locally without network access. |
| `node scripts/validate-t0192-request-item-dates.js` | Confirm all full-flow new-booking and add-on quote/draft routes reject missing, malformed, mixed, or out-of-window request-item dates before AWS, Roller, or idempotency side effects. | Passes locally without network or AWS access. |
| `node scripts/validate-t0193-api-protection.js` | Synthesize and verify the exact 21-route auth/trust/rate catalog, dependencies, metadata, T0197 baseline plus exact nine-resource T0200 email-readiness delta, and absence of unapproved edge resources. | Passes locally without AWS mutation. |
| `node scripts/validate-t0193-capacity.js` | Prove the shared-IP 120-guests/20-minutes and two-second arrival-burst model has no false throttles while abuse is bounded and route-isolated. | Passes deterministically without network traffic. |
| `node scripts/validate-t0193-guest-access.js` | Verify hash-only booking-bound guest proof, lifetime/cap/cooldown/link reuse, phone propagation/URL cleanup/retry, and protected session/add-on paths. | Passes locally without real guest data or downstream writes. |
| `node scripts/validate-t0193-payload-limits.js` | Verify decoded plain/base64 payload ceilings for all five handlers before AWS/network work. | Passes locally; API routes return 413 and webhook intake preserves safe acknowledgement. |
| `node scripts/validate-t0193-service-auth.js` | Verify IAM catalog plus internal, legacy, staff, webhook, expired-token, and safe-correlation application boundaries. | Passes locally without AWS/network writes. |
| `node scripts/validate-t0194-staff-identity-backend.js` | Verify six-digit PIN parsing, keyed lookup and scrypt verification, uniform failure/limiter behavior, hash-only opaque session lifecycle, exact credential revalidation across PIN-reset/login races, admin authorization/mutations, individual invalidation, venue/role boundaries including the initial PIN redeem session SQL filter, and named redeem audit before side effects. | Passes locally with fake AWS clients and no network or AWS mutation. |
| `node scripts/validate-t0194-staff-identity-frontend.js` | Build PIN and legacy staff bundles and verify the PIN-only root, separate admin PKCE flow, callback cleanup, create/reset/enable/disable UX, session limits, cross-tab logout, storage, CSP, mobile overflow source contracts, the shared phone font stack, solid-black normal copy, callback headers, stable session-keyed queue refreshes, persistent activity throttling, in-flight/pending coalescing, stale query/session suppression, and fast session-transition recovery. | Both static production builds and all focused assertions pass without credentials or deploy. |
| `node scripts/validate-t0194-staff-identity-infra.js` | Synthesize dev and park-test and verify the retained PIN-login route, opaque staff-session route, four JWT admin routes, the T0195/T0197 baseline plus exact nine-resource T0200 email-readiness delta, five Cognito/JWT resources, admin MFA off (#542) plus the explicit eight-character admin password policy, secret repurposing/grants, URLs, and no device/edge resources. | Passes locally without creating AWS resources. |
| `npm --prefix infra run validate:t0194-staff-identity-ops` | Prove the admin-only account CLI's account/environment/venue/`staff_admin` boundary, dry-run/write guard, masking, deterministic ids, fail-closed Cognito administrator replacement, and rejection of all PIN arguments without calling AWS. | Reports no AWS calls and no writes in self-test mode. |
| `node scripts/validate-t0195-data-lifecycle.js` | Prove the explicit table inventory, forward-only migration, deterministic plan digest, bounded/idempotent transaction, safe mutation order, aggregate evidence, and synthetic 24-hour/30-day/90-day cases. | Passes locally without a database connection, PII, or mutation. |
| `npm --prefix infra run validate:t0195-least-privilege` | Synthesize park-test and prove per-handler database identities/grants, denied tables/operations, retained secrets/backups, removed unused IAM, bounded secret/config caches, and expiry-sensitive reads. | Passes locally without AWS calls or writes. |
| `npm run validate:gh403-lookup-audit` | Check the narrow lookup audit grant and both production audit paths. Set `GH403_DATABASE_TEST=true` for PostgreSQL before/after failure, duplicate suppression and denied-content/write tests; `GH403_PGPORT=55403` locally or `55435` in CI. | Native checks require the disposable loopback database with all migrations; CI runs them explicitly. Synthetic rows and temporary grants roll back. |
| `node scripts/validate-t0195-pin-pepper-lifecycle.js` | Prove version-gated PIN login, locked/recounted `AWSPENDING` re-enrollment, exact mutation limits, fail-closed database fence before promotion, stale-write rejection after lock waits, all-session invalidation, cache bounds, secret-safe CLI guards, and unchanged PIN-only staff UX. | Passes with source assertions/fake clients/self-tests and no AWS or secret mutation. |
| `node scripts/validate-t0195-phone-local-contact.js` | Functionally prove device-clock 12-hour expiry, active deletion, immutable expiry, minute observation checkpoints, future/rollback rejection, and a non-extending module-scoped monotonic deadline across remount; source checks cover storage/custom/page-show/visibility wiring. | Passes deterministically without a browser deploy or real contact data. Full browser closure/offline execution and unobserved adversarial device-clock rollback are not claimed. |
| `node scripts/validate-t0195-aurora-recovery.js` | Prove plan-only default, fresh-only create actions, delayed guarded cleanup, exact per-action approvals, source/restore/writer/cluster/tag/isolation ownership, real AWS CLI Data API field mapping, post-restore Data API activation, exact same-run resume, run/state-bound isolated migration targeting, aggregate verification, lifecycle receipt-to-database matching, and explicit cleanup boundaries. | Passes locally without AWS calls, snapshots, restores, migrations, or deletion. |
| `node scripts/validate-t0196-booking-index.js` | Prove exact Live/Nacka activation, Playground preservation, future-visit retention, related-row filtering, one-request-per-second plus bounded provider retry, page/window limits, schedule/concurrency/freshness resources, narrow conflict-key grants, signed refund support, and guarded operator boundaries. | Passes locally with fake provider responses and no AWS, Roller, Aurora, or message mutation. |
| `npm --prefix infra run validate:t0196-booking-index-ops` | Prove deterministic 53-window planning, date bounds, mutually exclusive modes, and no AWS/Router/write work in self-test mode. | Reports no AWS calls, no Roller calls, and no writes. |
| `node scripts/validate-t0197-webhook-reconciliation.js` | Prove exact auth/Live guards, intake without Roller REST, safe invalid/duplicate/failure handling, venue/retention, pacing/retry, authoritative out-of-order behavior, processed no-op, FIFO/DLQ/recovery infrastructure, and narrow migrations. | Passes deterministically with fake AWS/Roller calls and no network mutation. |
| `npm --prefix infra run validate:t0197-webhook-reconciliation-ops` | Prove the operator defaults to read-only, requires mutually exclusive guarded smoke/replay modes, masks identifiers, and parses the exact Roller registration shape. | Reports no AWS calls, Roller calls, or writes in self-test mode. |
| `node scripts/validate-t0199-production-domains.js` | Prove the exact two `.se` production web origins, live-read empty Pages projects/CNAME targets, owner-applied public DNS, active SSL, zero deployments, Cloudflare-first associations, exact CORS/callback contract, no custom API hostname or traffic cutover, fail-closed malformed/duplicate/deployed/association/park-test/API-expansion cases, and the unchanged park-test baseline. | Passes locally without DNS, Cloudflare, AWS, network, deployment, messaging, or production writes; live DNS/SSL/Cloudflare readback is recorded separately. |
| `node scripts/validate-t0200-email-sender.js` | Prove the exact `jumpyard.se`/Nacka sender contract across every park-test profile, unchanged dev sender, closed application/schedule gates, configuration-set/DKIM/telemetry/runtime wiring, Swedish copy, DNS handoff, and controlled-send checkpoint. | Passes locally without AWS, DNS, email, recipient, application-send, SMS, or production mutation. |
| `node scripts/send-t0200-controlled-email.js --self-test` | Prove the exact-two recipient-hash allowlist, double write confirmation, safe masking, non-booking test message, single post-introduction CTA contract, and fail-closed configuration-set restoration path. | Reports no AWS calls and no sends in self-test mode. Live use defaults to read-only preflight and requires separately approved `--apply`. |
| `npm --prefix infra run validate:config-guards` | Reject altered park-test email domain, configuration set, From, display name, and Reply-To while preserving all existing environment and Live-write negative cases. | Passes locally without AWS or network access. |
| `npm --prefix infra run validate:park-test-synth` | Synthesize dev and every park-test profile; prove one fail-closed SES domain/configuration-set/event destination, exact DKIM outputs, suppression/TLS/alarms, no park-test send IAM permission, exact Lambda email environment, unchanged dev identity, and all existing gate profiles. | Passes locally without AWS mutation. |
| `npm run validate` | Run root workflow/current-ticket/followup/history/tag checks, T0193/T0194 regressions, all T0195 lifecycle/security/recovery validators, T0196 booking-index validation, T0197 webhook reconciliation validation, T0198 delivery controls, T0199 domains, and T0200 email sender readiness. | Passes locally without changing AWS, Roller, credentials, data, snapshots, DNS, Cloudflare, SMS, email, or production. |
| `git diff --check` | Check the current working diff for whitespace errors. | Passes; CRLF conversion warnings are acceptable if the command exits 0. |
| `npm run validate:gh339-catalog-resilience` | Prove independent product refresh, fresh-price omission diagnostics, optional catalog failure isolation, bounded response-body waits and unchanged authoritative time-slot availability. | 27 scenarios pass with synthetic AWS/HTTP responses; no live calls. |
| `npm run validate:gh501-dropin-entry-prices` | Prove the drop-in pairing helpers and run the real availability, quote validation and quote handlers with synthetic Nacka variants: every entry slot returns its Drop-In sibling (web + 20 kr, family + 60 kr), an unpaired tier keeps the web price with a key-only warning, wrong-tier, mispriced and non-entry Drop-In ids are rejected, web ids, capacity and unknown products keep their results, Combo and add-ons are unchanged, and ROLLER calls stay one availability read per request and per validated item. | 9 unit tests and 6 handler checks pass; no live calls. |

## Discount And Gift-Card Feedback (#407)

Verify standalone Apply stays on Contact with updated quote/price and no draft, including partial/full coverage. Check duplicate Apply, Apply versus Continue, late responses, request retry, contact requirements and a fresh quote on Continue. Kiosk parity belongs to kiosk #99.

- Run `npm --prefix jumpyard-checkin-phone run test:payment-options` (also included in `npm run validate`). Synthetic tests exercise the actual input/quote handlers for initial entry, positive/negative/no-effect evidence, edits/removal, one code type at a time (type switch and cross-clearing), Continue rechecking a rejected code and continuing without it, contact/basket changes, late responses, separate code payloads, and paid/free continuation.
- Regress `test:payment-recovery`, `test:payment-confirmation`, and `test:addon-back`; run phone lint, TypeScript/build and `npm run infra:check`.
- Inspect the production export against a loopback-only synthetic API at 320/390px in Swedish and English. Verify discoverable labels, neutral new-code feedback, rejection, accepted amount, edit/removal invalidation and a late response after Back. Real code values, ROLLER business writes and deployment are excluded.

## Application Validation

`npm run validate:gh330-addon-payment-back` verifies the add-on Back rule per payment state (allowed before submission and after a confirmed refusal, hidden while submitted, unresolved or approved, no Back on the safety video after a completed payment), the page-level hiding, the retired-checkout guard and add-on recovery replacement/late-result cases without any provider call. Back during a slow add-on payment and after approval on a handset remains a post-promotion check.

`npm run validate:gh367-combo-contents` verifies exact Weekday Combo response projection, package scaling, separate admission/pizza rows in Swedish and English, guest resume, mixed/linked purchases, deferred staff fulfillment and unchanged provider item/ticket authority. Synthetic browser fixtures verify mobile layout; a published handset flow remains a post-promotion check.

`npm run validate:gh459-band-colours` verifies JumpYard's Nacka band colour scheme (#459, D0233): every row of the delivered end-time chart, Gustav's three examples, no colour before 10:00, after 20:00 or off the half-hour grid, the Combo's 60 minutes, admission-only classification shared with the staff handout, the guest lookup, resume, phone and kiosk purchase handoffs (a phone-bought Combo carries its bands and later pizza), the staff manifest/board projections, byte-identical Lambda copies and that every Park configuration names only the scheme's venue. `test:completion`, the phone package-content tests (including a phone-bought Combo through the real finalize mapping) and `validate:gh345-staff-handout` cover the SV/EN swatches and staff rows. A Park booking check remains after promotion.

The deployed T0194 runtime baseline remains covered by its four focused validators, `npm run validate`, `npm run infra:check`, dependency/migration self-tests, admin TypeScript/lint/build checks, synth, reviewed deploy diffs, mobile evidence, repeated-login correction, automated queue-request stability/race checks, exact Pages readback, and complete live account lifecycle. Historical evidence is in [docs/history/validation-log.md](docs/history/validation-log.md) and [docs/t0194-staff-identity.md](docs/t0194-staff-identity.md). GitHub-native planning changes require separate live readback of the linked Project; the immutable mapping is in [docs/history/github-project-migration-2026-07-14.md](docs/history/github-project-migration-2026-07-14.md).

Issue #194's repository implementation is merged. Love separately approved the 2026-07-14 snapshot/restore/migration/cleanup checkpoints and the later source migrations, CDK rollout, regression, and lifecycle dry-run. T0196 park-test is deployed through migration `0014` with the morning index baseline. T0197 is deployed through migration `0016` with the 187-resource stack, exact Roller registration readback, durable FIFO worker/recovery/replay, authenticated normalized-update proof, empty queues/DLQ, clean diff, and zero drift. Aggregate evidence is in the validation log, AWS inventory, [T0196 runbook](docs/t0196-booking-index-morning-seed.md), and [T0197 record](docs/t0197-webhook-reconciliation.md). Natural Roller delivery observation, lifecycle apply, complete post-provisioning restore proof, snapshot deletion, secret changes, guest-message enabling, and production remain separately gated.

## Workflow 0.2 changes

Run node scripts/wrlds/validate.js, node --test scripts/wrlds/tests/*.test.js, and git diff --check. Retain product/domain checks for affected files. Historical results above retain their original dates. New evidence: docs/history/workflow-0.2-adoption.md.
