# GH-515: one JumpSocks block for purchase and check-in

Issue #515 gives every phone guest the same socks message. On 2026-10-12 Love asked whether checking in an existing booking uses the same add-on page as a purchase, and how socks become clear for everyone, including parents who are in the trampoline area but do not jump. Love approved points 1, 2, 3 and 5 of the proposal and rejected point 4. Decision D0253; kiosk #197 is the counterpart.

## What the guest sees

1. **Purchase:** unchanged. The quantity step shows the JumpSocks block under "Antal hoppare".
2. **Existing booking:** the add-on step opens with the same JumpSocks block. Below it comes the purchase's own list: water under "Ta med egen flaska eller köp här", then VALFRITT.
3. **Pairs already in the booking:** the block shows "N ingår" and "Extra … kr/par", with a check on the icon. The stepper counts extra pairs from 0 and never goes below what the booking has.
4. **The rule:** "Halkfria strumpor är obligatoriska i JumpYard och måste bäras av alla i trampolinområdet, även icke-hoppande föräldrar." The last part is red and bold, in SV and EN.
5. **Nothing is preselected.**

## Not in this issue

- Point 4: no line on the last page when no socks are bought.
- Sock sizes, a parent ticket, and Cloud or ROLLER changes.

## Outside the code (point 5)

- A print-ready A4 sign for the sock station with the same sentence, in SV and EN.
- The greeting yarders say the same sentence.

## Code

- `SocksQuantity` takes `included`. It shows the included line and the extra price, and it renders the rule with `socksParents` in `<strong className="socks-rule-parents">`.
- `AddonsOffer` renders `SocksQuantity` above `AddonChoices`, and `AddonChoices` gets every entry except socks.
- `AddonChoices` has no socks row and no `rows` prop, so `BuyTickets` no longer passes one.
- Copy: `socksParents` is added and `firstGroup` is removed.
- Preview: `/preview/addons` gains the frame `booking0`, a booking without socks.

## Validation

- `test:workshop-flow` (the new #515 test) and every phone suite, plus `tsc` and lint.
- Localhost: `/preview/addons?full=1&scenario=booking|booking0&lang=sv|en` at 390×844 and 375×667, and the purchase quantity step in `/preview/flow`.
