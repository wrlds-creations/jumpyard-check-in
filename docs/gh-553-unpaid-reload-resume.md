# A reload before Pay goes back to payment (#553)

Issue [#553](https://github.com/wrlds-creations/jumpyard-check-in/issues/553), branch `codex/gh-553-unpaid-reload-resume`, base `origin/main` at `425a4a4`. Decision `D0270`.

## Cause

On 2026-10-15 at 14:37, a tester on `checkin.jumpyard.se` bought "2 timmar för 1" for 220 kr (draft `jypd_583995929ec44b7581`). The tester opened the card form without pressing Pay, went to the iPhone home screen and reopened Chrome. The page had reloaded and showed "Vi kan inte bekräfta betalningen ännu" with only "Kontrollera betalningen".

- No money was taken. ROLLER had no booking for the draft at 14:51, nor at 15:08 after the draft expired. The phone never reported an approved payment, and its two status checks at 14:40 got "not found".
- As soon as the card form mounts, the drop-in saves a 12-hour payment record with a protected `prepared` proof.
- The reload gate treated every pending record as unresolved, without looking at the proof. "Kontrollera betalningen" only asks whether the booking exists, so an attempt that was never paid stayed "unknown" for 12 hours, with no way out.
- Two more paths ended the same way:
  - The 30-second result timer after Pay hid the bank's 3-D Secure/BankID approval when it took longer.
  - A form that never loaded also ended as unknown.

## Behaviour

- **Reload before Pay.** A `prepared` proof means the payment was never sent: the SDK only submits after the hook has written `submitted`. Under a fresh, protected payment lease, the page drops that attempt and rewrites the saved purchase to the contact step, keeping basket, contact and safety approval. "Gå till betalning" then makes a new draft. These keep the unresolved card:
  - a checkout still open in another tab, which holds the lease;
  - a provider return in the URL;
  - any later phase;
  - a record without Web Locks, which has no proof.

  A never-paid add-on attempt is dropped, and the gate runs again.
- **After Pay.**
  - The bank's approval stays on screen. The result wait is ten minutes instead of 30 seconds.
  - The proof records `submittedAt`.
  - An unresolved result moves from `BuyTickets` to the page's recovery card, the same card as after a reload.
- **Form never ready.** A load timeout or setup error before the form became ready marks the attempt failed (`failUnstartedPaymentRecovery`). The guest sees the existing "Betalningen stoppades" with "Välj ett annat betalsätt".
- **Start over.**
  - The card checks the original purchase once by itself at the restart time: Pay + 3 minutes, or created + 30 minutes for a proof without a Pay time.
  - If Cloud answers "not found", the card shows "Vi hittar ingen betalning" with "Börja om".
  - "Börja om" checks once more. A paid booking continues as before. A not-found answer drops the attempt (`abandonUnresolvedPaymentRecovery`) and continues on the contact step.
  - An unavailable check never offers a restart.

New copy:

| Swedish | English |
|---|---|
| Betala inte igen ännu. Vi kollar om betalningen gick igenom. Syns den inte inom några minuter kan du börja om. | Do not pay again yet. We are checking whether the payment went through. If it does not show within a few minutes, you can start over. |
| Vi hittar ingen betalning | We cannot find a payment |
| Köpet blev inte klart. Börja om och betala igen. Ser du ändå en dragning hjälper vi dig på plats. | The purchase was not completed. Start over and pay again. If you still see a charge, we will help you on site. |

## Calls and limits

- A reload before Pay makes no call.
- An unresolved purchase makes one automatic lookup at its restart time, plus one behind "Börja om".
- The dropped draft stays unpaid in ROLLER and expires after 30 minutes. Its capacity hold is ROLLER's, as when a guest leaves "Betalning" today.
- Cloud, ROLLER, the kiosk and add-on payment recovery are unchanged.
- The #396 Exit/dismissal work (local, not merged) is separate.

## Changed areas

- `jumpyard-checkin-phone/src/flow/paymentRecovery.ts`
- `jumpyard-checkin-phone/src/components/RollerPaymentDropIn.tsx`
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`
- `jumpyard-checkin-phone/src/app/page.tsx`
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`
- The tests `paymentRecovery.test.mjs`, `phonePaymentRecovery.test.mjs` and `pagePaymentRecovery.test.mjs`
- `DECISIONS.md`, `TEST_PLAN.md` and this note

## Validation

- `npm --prefix jumpyard-checkin-phone run test:payment-recovery` passed 147 tests, 10 of them new.
- These phone suites passed: `test:payment-confirmation`, `test:exit-flow`, `test:addon-back`, `test:paid-confirmation`, `test:payment-methods`, `test:workshop-flow`, `test:flow-transitions`, `test:completion`, `test:language-toggle` and `test:payment-options`.
- These root validators passed: `validate:gh458-safety-before-payment`, `validate:gh338-exact-payment-status`, `validate:t0195-phone-local-contact`, `validate:gh305-cross-device-safety-resume`, `validate:gh330-addon-payment-back` and `validate:gh331-paid-booking-confirmation`.
- `tsc --noEmit` passed. Lint had 0 errors and the 5 existing image warnings. `next build --webpack` passed, as did the production mock-boundary check.
- Screenshots were taken on localhost at 375x812, using a stand-in for Cloud and saved data made by the app's own modules. They show the four states listed in `TEST_PLAN.md`. Love approved them, the three minutes and the texts on 2026-10-15 ("ok!").
- `validate:history-archives` fails on the untouched `PROJECT_CONTEXT.md` (its narrative check), as it does on `origin/main`. This issue does not touch that file.

After release, Love's iPhone test: open the card form, reload the page or leave Chrome until iOS reloads it, and land on "Din kontakt".
