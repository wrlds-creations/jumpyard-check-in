# Wait for the paid booking after phone payment confirmation (#331)

Approved issue: [#331](https://github.com/wrlds-creations/jumpyard-check-in/issues/331).

Branch: `codex/gh-331-wait-for-paid-booking` from `origin/main` at
`fa5668a75bb6ce6dd0ee4d7b47f7bcbfb2fbcf20`.

## Problem

ROLLER marks an approved phone (ecommerce) payment as paid slightly after the card
approval. The phone looked the booking up exactly once, right at approval, and
accepted whatever came back. When ROLLER had not caught up yet, the lookup answered
`payment_required`, the approved purchase was routed to the existing-booking summary
with an unpaid badge and a disabled button, and the guest never reached safety or the
staff QR without reloading the page. The kiosk already guarded against this; the phone
did not.

## Guest behavior (option B, approved by Love on 2026-09-02)

The paid confirmation is needed only before the staff handoff, so the safety steps are
used as the buffer instead of a waiting screen:

1. Approval still shows **Betalningen är klar** with the single continue action from
   #324. One lookup runs in the background, exactly as before.
2. `paid=true`: unchanged. The check-in session is prepared and the guest continues to
   the safety video.
3. `paid=false` (ROLLER not caught up): the guest still continues to the safety video
   and rules, without a session. Nothing is polled while the guest watches and reads.
4. When the rules are confirmed, the phone checks the booking once more. `paid=true`
   creates the session with `guestResumeStep=safety`, marks it ready for staff and
   shows the QR. `paid=false` shows **Betalningen är genomförd. Vi väntar på att
   bokningssystemet bekräftar bokningen…** and re-checks after 15 s, 30 s and 60 s.
5. After those three checks the notice becomes **Bokningen är ännu inte bekräftad.
   Betala inte igen. Försök igen om en stund eller visa den här skärmen för
   personalen.** with a single-check **Kontrollera igen** button. The main button stays
   disabled so a guest cannot restart a burst of lookups.

An approved purchase never lands on the unpaid booking summary. That summary remains
the path for existing bookings looked up by reference and for drafts that were never
paid.

## API-call budget

| Situation | Lookups per purchase |
|---|---|
| ROLLER already paid at approval (normal) | 1 |
| ROLLER paid within the safety steps | 2 |
| ROLLER still unpaid after the rules | 2 + at most 3 scheduled + manual single checks |

A lookup that fails (network or 5xx) is retried at most three times, two seconds apart,
before the guest sees the existing sync-error card or the ready-for-staff error with a
manual retry. A lookup that succeeds but reports an unpaid booking is never treated as a
failure. No `setInterval` polling exists; every wait is an explicit, bounded delay that
is cancelled when the guest leaves the rules screen or starts over.

## Recovery and identity

- The same purchase identity (ROLLER unique id, otherwise booking reference) is used
  for every check. The phone never creates another payment, draft or booking here.
- The localStorage recovery snapshot is written with `paymentApproved=true` at
  approval, as before. A reload during the video or rules re-runs the same lookup and
  returns to the saved step: with a session when ROLLER is paid, otherwise into the
  same awaiting mode. Reload never restarts the purchase.
- Guest access tokens are minted per lookup and stay in memory only; nothing new is
  stored in the browser.
- Session-start errors for an approved purchase (for example a `payment_required`
  race between lookup and session refresh) keep the safety path; the session is retried
  before the handoff. `already_redeemed` still routes to the completed screen.
- Cross-device resume of a purchase that has no session yet goes through booking lookup
  instead of `guestResumeStep`; Love confirmed device switching is not a target for
  this flow.

## Code

- `jumpyard-checkin-phone/src/flow/paidBookingConfirmation.ts`: pure decision logic
  (paid vs awaiting, bounded lookup retries, the 15/30/60 s schedule, awaiting-mode
  detection, purchase identifier).
- `jumpyard-checkin-phone/src/components/BuyTickets.tsx`: approval uses one bounded
  lookup and passes the result on whether or not it is paid.
- `jumpyard-checkin-phone/src/app/page.tsx`: approved-but-unpaid purchases continue
  into safety without a session; the rules step confirms the paid state, creates the
  session and the handoff; a run token cancels stale checks; recovery passes
  `paymentApproved` from the snapshot.
- `jumpyard-checkin-phone/src/components/SafetyAttest.tsx`: waiting/delayed notice and
  the single-check retry action.
- `jumpyard-checkin-phone/src/context/LanguageContext.tsx`: three new `safetyAttest`
  strings in Swedish and English.

No backend, ROLLER package, kiosk, staff/Handoff, AWS or contract changes.

## Validation before merge

Run from `jumpyard-checkin-phone`:

```powershell
npm run test:paid-confirmation
npm run test:payment-confirmation
npm run test:exit-flow
npm run test:product-visibility
npm exec tsc -- --noEmit --project tsconfig.json
npm run lint
npm run build
```

Run from the repository root:

```powershell
npm run validate
```

Results on 2026-09-02:

- paid confirmation: 9 passed (logic sequences `payment_required -> paid`, permanent
  pending, bounded lookup failures, awaiting-mode detection, plus source contracts);
- payment confirmation and preview: 18 passed;
- exit flow: 5 passed;
- product visibility: 5 passed;
- TypeScript: passed;
- ESLint: zero errors, four existing bitmap `<img>` warnings;
- optimized production build: passed;
- repository `npm run validate` including the new
  `validate:gh331-paid-booking-confirmation`: passed.

## Manual verification

Love completed one real phone purchase on `https://checkin.jumpyard.se` on
2026-09-03 after the public promotion below and reported that it went through.
Whether ROLLER was slow enough to show the waiting notice at the rules step is not
known; the slow-network case was intentionally not exercised.

## Merge and protected rollout evidence

- Implementation PR: [#348](https://github.com/wrlds-creations/jumpyard-check-in/pull/348)
- Merged source: `a42559bacc6d848a227a898380de2e194d433dc7`
- Immutable release: [run 33726425874](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33726425874)
- Artifact: `park-test-release-a42559bacc6d848a227a898380de2e194d433dc7` (ID 9882266385)
- Artifact digest: `sha256:ebe3e5d06a3eda172bea54a1d3e968846dde4decee710167da68cd23f896f4a7`
- Protected Park promotion and verification: [run 33726874693](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33726874693).
  Plan: identical CloudFormation template `b227888a…`, 202 resources, nothing added,
  changed or removed; `apply_migrations=false` with no pending migration. Deployments:
  phone `a41f61d2` on `jumpyard-check-in-park-test`, admin `fa2bee85` on
  `jumpyard-checkin-admin-park-test`. Post-deploy checks: stack `IN_SYNC`, zero alarms
  in ALARM, empty queues, exact Cloudflare commit readback.
- Protected public promotion and verification: [run 33727273329](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33727273329).
  Deployments: phone `86a4efa3` on `jumpyard-check-in-production`, admin `b1c7598d` on
  `jumpyard-checkin-admin-production`. Checks: guest domain HTTP 200 with the exact Park
  API target (10 assets), Apple Pay association HTTP 200, staff domain routes HTTP 200
  with exact Park API and Cognito targets.
- Independent live check after promotion: the #331 bundle marker was present on
  `https://checkin.jumpyard.se`, `https://jumpyard-check-in-production.pages.dev` and
  `https://jumpyard-check-in-park-test.pages.dev`; `https://staff-checkin.jumpyard.se`
  returned HTTP 200.

The same immutable artifact passed release validation, Park deployment and public
promotion. No migration was applied and the backend stayed at `ebc7598`.

Later the same day, PR #349 (#334, admin heartbeat) was promoted as `bee28ed` through
Park [run 33732205303](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33732205303)
and public [run 33732520551](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33732520551).
That build includes this change unchanged; see
[docs/gh-334-staff-heartbeat.md](gh-334-staff-heartbeat.md).
