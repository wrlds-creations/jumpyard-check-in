# #441 Phone Back/Exit buttons

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/441 (paired kiosk: https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/128)

## Design

On 2026-09-23 Love compared the shipped grey text row with localhost variants (round buttons at the top, black text, text under the content, round buttons in the bottom corners) and chose the bottom-corner round buttons for phone and kiosk. `FlowNav` renders a thick chevron (Back) and the JumpYard `home.png` icon (Exit) in 48 px white discs fixed to the bottom-left/right with safe-area padding and a soft fade. It portals to `document.body` so framer-motion transforms cannot break the fixed position, keeps an in-flow 96 px spacer, and hides (inert, transparent) while a text field has focus or an `aria-modal` dialog is open. BuyTickets keeps its own guarded instance; the page renders one after the flow content outside the purchase and completion states. Visibility rules, test ids and the exit confirmation are unchanged.

## Local validation

- `test:flow-nav` 4/4, `test:exit-flow` 5/5, `test:addon-back` 11/11, `test:language-toggle` 6/6, plus payment-confirmation 55, paid-confirmation 9, payment-recovery 137, safety-video 18, flow-transitions 21, completion 14, payment-options 57, phone-contact 5, email-marketing 5, payment-methods 13, product-visibility 5 and production-mock-boundary 8, all passing.
- ESLint on the changed files: no errors (two existing `<img>` warnings). TypeScript clean. `next build --webpack` and the production mock boundary check passed.
- Headless Edge at 320x640, 375x812 and 430x932 (SV/EN) on the development flow preview: Back 56x56 px hit area bottom-left and Exit bottom-right on time, ticket list, add-ons, contact and booking lookup; the last ticket card ends above the buttons after scrolling; buttons hidden while a contact field has focus and while the exit dialog is open; Back returns from the ticket step to the time step; Exit opens the confirmation.

Not yet verified: a physical iPhone/Android browser on Park. Rollout evidence follows after the protected release.
