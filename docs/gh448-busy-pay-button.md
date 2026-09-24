# #448 Phone busy Contact button

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/448 (paired kiosk: https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/135)

## Change
`BuyTickets` Contact button: while `submitting` it keeps full color (`cursor-wait` instead of `disabled:opacity-40`), shows a spinner before "Skapar bokning…" and sets `aria-busy`. It stays disabled, so a second tap cannot submit twice. Incomplete details and code application keep the faded disabled style.

## Local validation
- All phone test scripts pass, including the new `test:phone-contact` case (6/6).
- TypeScript clean, ESLint 0 errors, `next build --webpack` and the production mock boundary check passed; `git diff --check` clean.
- Headless Edge at 375x812 with a booking quote delayed 4 s: opacity 1 (was 0.4), spinner visible, position unchanged, error shown after the simulated failure.

Finding left out of scope: on failure the phone shows the Cloud's own error text (for example "JumpYard Cloud booking request failed."), while the kiosk shows its Swedish fallback.
