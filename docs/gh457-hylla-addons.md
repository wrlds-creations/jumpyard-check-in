# #457 Hylla add-on page without ticks

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/457 (paired kiosk: https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/144)

## Design

Workshop point 4 (2026-09-28): guests must not have to tick that they brought socks or a water bottle. Love chose the Hylla layout from the 2026-09-25 localhost proposal and approved the localhost preview of the real phone and kiosk flows on 2026-09-29 (D0232). `AddonChoices` renders it on both phone paths:

- "Ta med egna eller köp här" / "Bring your own or buy here": socks and water rows with icon, name, price (or "2 ingår" and "Extra 49 kr/par"), 44 px plus/minus (the minus keeps its slot while hidden) and a note line with the approved sentences "Bra grepp. Krävs för alla hoppare." and "Inga engångsmuggar av miljöskäl.". A row with a purchase or an included item gets a red border and a check on its icon.
- "Valfritt" / "Optional": a three-tile shelf in the order SkyRider, Hänglås, Bryggkaffe. SkyRider carries "Vårt tips" / "Our pick" on its border while it is on sale; the selling sentences are the tiles' accessible descriptions, and short facts show on screens at least 740 px tall.
- Continue sits above the nav row and the total between the round Back/Exit buttons. The FlowNav spacer and fade are hidden on this step, and the list fades at its bottom edge only while it scrolls.

Continue never asks for a tick: the own-item checkboxes, `validate()`, the inline warnings and the buy-recovery own-item flags are removed. Sock sizes and #438 are out of scope. Products, prices, the 24-hour cache, included/paid minima, the SkyRider attestation, quotes, drafts, payment and Handoff are unchanged.

## Local validation

- `validate:gh318-phone-addon-choices` 18/18 (rewritten for the new rule), `test:addon-back` 11/11, `test:product-visibility` 5/5, `test:flow-nav` 4/4 and `test:payment-recovery` 137/137, plus flow-transitions 21, language-toggle 6, exit-flow 5, production-mock-boundary 8, completion 14, payment-options 57 and payment-confirmation 55.
- TypeScript clean, ESLint 0 errors (existing `<img>` warnings), `next build --webpack` and the production mock boundary check, which now includes `/preview/addons`, passed; `git diff --check` clean.
- Headless Edge on the development-only `/preview/addons` (fixture transport; every request stayed on 127.0.0.1): buying for 2 jumpers, a booking with 2 pairs of socks included and a family of 4, in SV and EN. All five add-ons are visible without scrolling at 390x844 and 375x667 (tightest: the English booking at 375x667 with 10 px spare), the total is level with the Back/Exit buttons, and nothing overflows sideways. Continue with nothing selected reaches the basket summary (buy) or the next step (booking); SkyRider still opens its attestation and a booking add-on still reaches review.

Not yet verified: a physical iPhone or Android browser on Park.
