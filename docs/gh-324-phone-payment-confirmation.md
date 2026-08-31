# Phone payment confirmation (#324)

Approved issue: [#324](https://github.com/wrlds-creations/jumpyard-check-in/issues/324).

Branch: `codex/gh-324-phone-payment-confirmation` from `origin/main` at
`530ea0f3a903405397355962030421105442b115`.

## Guest behavior

Both real phone ecommerce paths now use the same approved confirmation:

- new entry;
- paid add-ons on an existing booking.

Only a definitive approved result shows **Betalningen är klar**, the confirmed
amount, the existing receipt icon, **Kvittot skickas via e-post.** and one
**Till säkerhetsgenomgången** action. The confirmation has no timer and remains
until the guest presses the action. Processing, declined, failed and unknown
results never show success or receipt copy.

## Safety and recovery contract

The guest button controls only visible navigation. It does not control payment
finalization or create another payment, booking or session.

- New-entry approval immediately starts the existing idempotent booking lookup,
  recovery write and provisional check-in-session preparation. The prepared
  transition is held until the guest continues. Closing or changing device while
  the confirmation is visible still resumes from the server-owned safety stage.
- Existing-booking add-on approval immediately stores the paid selection in flow
  context and idempotently persists `guestResumeStep=safety` on the existing
  check-in session. The guest remains on confirmation until continuing.
- A repeated provider callback is ignored locally. Existing Cloud idempotency
  remains the mutation authority. Zero-payment, completed, redeemed and recovery
  paths keep their prior behavior.

No backend, Roller package, payment-result classification, email delivery, AWS,
kiosk or staff/Handoff contract changes in this issue.

## Presentation

- `PhonePaymentConfirmation.tsx` is presentation-only and contains no timer,
  network, storage or payment logic.
- `receipt.png` is the approved transparent kiosk receipt asset, reused without
  modification.
- `/preview/payment` remains development-only and cannot expose its interactive
  fixtures in a production build.

## Validation before merge

Run from `jumpyard-checkin-phone`:

```powershell
npm run test:payment-confirmation
npm run test:exit-flow
npm run test:product-visibility
npm exec tsc -- --noEmit
npm run lint
npm run build
```

Results on 2026-08-31:

- payment confirmation and preview: 18 passed;
- exit flow: 5 passed;
- product visibility: 5 passed;
- TypeScript: passed;
- ESLint: zero errors, four existing bitmap `<img>` warnings;
- optimized production build: passed.

## Merge and protected rollout evidence

- Implementation PR: [#325](https://github.com/wrlds-creations/jumpyard-check-in/pull/325)
- Merged source: `9dafe028bf93a25cd60f41b2c49a10e8836501d1`
- Immutable release: [run 33379287364](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33379287364)
- Artifact: `park-test-release-9dafe028bf93a25cd60f41b2c49a10e8836501d1`
- Artifact digest: `c2903f41b4fc570098c2d66559c63526337c8dc28b5873c5046e17657c474ef2`
- Protected Park promotion and verification: [run 33379950137](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33379950137)
- Protected public promotion and verification: [run 33380307052](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33380307052)
- Public target: [https://checkin.jumpyard.se](https://checkin.jumpyard.se), independently returned HTTP 200 after promotion.

The same immutable artifact passed release validation, Park deployment and
public promotion. No migration was applied. The protected workflows verified
the exact Cloudflare commit, public prerequisites, domains and live HTTP target.

Physical phone validation remains required. Test one new entry and one add-on
purchase, confirm that the approved screen remains until the button is pressed,
verify the receipt email, and verify safety/resume without another payment.
