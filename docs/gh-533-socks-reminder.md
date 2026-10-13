# GH-533: a friendly socks reminder

Issue #533 adds a friendly pop-up when a guest continues without any JumpSocks. On 2026-10-13 Love asked: "går man vidare och inte har fyllt in någon strumpor alls så får man upp en snäll pop-up ... som bara säger typ du glömmer inte strumpor med en glad smiley eller något". On placement: "Om du har en bokning så ska den komma efter tillägg. Och har du köpt ... så ska den komma mellan entré och tillägg." Decision D0261; kiosk #215 is the counterpart (kiosk D0073).

## What the guest sees

1. **Purchase:** a family picks 2 jumpers and no socks on Entré, the quantity step where socks are chosen (#491), and taps Fortsätt. The reminder opens: the brand socks icon, "GLÖM INTE STRUMPORNA! 😊" ("DON'T FORGET YOUR SOCKS! 😊"), a red "Lägg till strumpor" ("Add socks") and a black-outlined "Vi har egna" ("We have our own"). Back and Exit step aside while it is open.
2. **Existing booking:** a guest whose booking has no socks taps Fortsätt on Tillägg without adding a pair, with or without other add-ons. The same reminder opens. A booking with socks ("✓ 1 ingår") never sees it.
3. **"Lägg till strumpor"** (or a tap outside, or Escape) closes it on the same step. The JumpSocks block comes into view, its + is focused and its border pulses red twice; nothing is added by itself.
4. **"Vi har egna"** continues exactly as Fortsätt does: to Tillägg in a purchase; to the safety film, or with add-ons to the film and then the summary (#520), on a booking.
5. **At most once per visit:** a second Fortsätt without socks goes on. The page keeps the answer, so Back from the safety film to Tillägg does not ask again. A new guest (Exit, the start screen) starts afresh.
6. **Never** when socks are chosen or already in the booking, or where socks cannot be sold (no price in the catalog).
7. **Unchanged:** nothing blocks Fortsätt (D0232), and the socks block, prices, quotes, drafts and the socks product are as before.

## Code

- `src/flow/socksReminder.ts`: `shouldRemindAboutSocks({ socksAvailable, socksQuantity, socksIncluded, answered })`, the one rule for both steps.
- `SocksReminderDialog`: the phone dialog recipe (`PaymentCodeRejectedDialog`), `role="dialog"` with `aria-modal`, so `FlowNav` hides Back and Exit. The heading balances its two lines, so the smiley ends the title.
- `BuyTickets`: `continueFromQuantity` on Entré's Fortsätt (`buy-quantity-continue`), `addSocksFromReminder` and `continueWithOwnSocks`.
- `AddonsOffer`: `handleSelectContinue` asks first; the old body is `continueFromSelect`, which "Vi har egna" also runs. The `socksReminderShown` and `onSocksReminderShown` props connect it to `FlowContext.socksReminderShown`, which `initialContext` resets for every visit.
- Both components render the dialog after their step root, outside its transition picture.
- `SocksQuantity` takes `attention`: each new value scrolls the block into view (`nearest`), focuses its + and sets `data-attention`, whose CSS pulses only the border colour and shadow. A block mounted later does not replay an earlier value.
- The phone has no own-socks tick (D0232), so "Vi har egna" is remembered only for the visit, in component and page state. No new API calls.

## Validation

- `test:socks-reminder` (new, in the root `validate`): `socksReminder.test.mjs` runs the real handlers of both steps and renders the dialog. `addonSafetyOrder.test.mjs`, `workshopFlow.test.mjs` and `FlowNav.test.mjs` follow the new handlers and props.
- Every phone suite, `tsc` and lint pass. Locally, the root `validate` passes except `validate:history-archives` (CRLF length on Windows) and the admin Turbopack build in `validate:t0194-staff-identity-frontend` (junctioned `node_modules`), both unrelated and known.
- Localhost, headless Edge over CDP with real touch taps at 375x812, `/preview/addons?full=1&scenario=buy2|booking0|booking&lang=sv|en`. Purchase: Back to Entré, Fortsätt without socks, the reminder. "Lägg till strumpor" stays on Entré with the + focused, and the next Fortsätt opens Tillägg without a second reminder. "Vi har egna" opens Tillägg. Booking without socks: the reminder on Fortsätt. Booking with 2 pairs: no reminder. Love approved the screenshots on 2026-10-13: "ok kör, commit, PR och release för båda".
- After release: on an iPhone, continuing without socks shows the reminder in a purchase and in an existing booking, and both choices work.
