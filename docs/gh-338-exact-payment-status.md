# Exact payment status: partially paid bookings go to the register (#338)

Approved issue: [#338](https://github.com/wrlds-creations/jumpyard-check-in/issues/338).

Branch: `codex/gh-338-exact-payment-status` from `origin/main` at `24d0a2c` (PR #360 merged).

## Problem

Roller reports payment status as words. The values stored in the Park cache on 2026-09-03
were `Paid`, `PendingPayment`, `PartiallyPaid`, `Cancelled` and `NoPaymentRequired`. Three
JumpYard Cloud gates decided "paid" by substring matching, and `PartiallyPaid` contains
`paid`:

- the lookup eligibility blocked only a positive amount owing or a status containing
  `pending`, so `PartiallyPaid` with a missing amount owing was `ready`;
- the check-in session start and the staff redeem treated any status containing `paid`
  as complete when the amount owing was missing.

Roller often omits the amount owing (6,006 of 17,363 `Paid` rows had none). Read-only
readback on 2026-09-03:

| Status in cache | Rows without amount owing | Rows total | Today or future |
|---|---|---|---|
| PartiallyPaid | 21 | 36 | 0 without amount, 5 with |
| PendingPayment | 6 | 97 | 0 without amount, 6 with |

No such booking was due today or later, and no incident is known. The phone and kiosk
short-circuit on `reason: "ready"`, so the lookup decision alone could let a partially
paid group through all three gates. Love's context: partially paid bookings cannot be
created through this platform; they are group and company bookings that are settled at
the register.

## Behavior (approved by Love on 2026-09-03)

1. One exact rule, kept identical in the lookup, session and redeem Lambdas: only the
   explicit statuses `Paid`, `PaidInFull` and `NoPaymentRequired` count as paid;
   `PartiallyPaid`, `PendingPayment` and `Unpaid` are classified by their own exact tokens
   (case, spaces, underscores and hyphens ignored); a positive amount owing is always
   unpaid; an explicit zero amount owing settles a booking only when no unsettled status
   is present; a missing amount owing is never evidence of payment.
2. The lookup returns `eligibility.paymentState` (`paid`, `partially_paid`, `pending`,
   `unpaid` or `unknown`). `partially_paid`, `pending` and `unpaid` keep the existing
   `reason: "payment_required"`, so the kiosk continues to show its staff message without
   any change. `unknown` (for example `Cancelled` without an amount) keeps today's lookup
   behavior; the session start still blocks such bookings as inactive.
3. The phone shows a partially paid booking as "Delvis betald" with the hint "Den här
   bokningen behöver checkas in i kassan." and a disabled "Checka in i kassan" action.
   English: "This booking needs to be checked in at the register." An unsettled state from
   JumpYard Cloud always overrides the phone's local paid heuristic.
4. The session start and staff redeem gates apply the same rule as a safety net, so a
   partially paid booking is `payment_required` even if a client skipped the lookup answer.
5. Prepayment-draft and linked add-on settlement in the lookup still require an explicit
   paid status; a zero or missing amount alone never settles a draft.

Roller remains authoritative for the final redemption. No booking, payment, migration,
grant, IAM, secret, route, gate, kiosk or multi-park change.

## Code

- `infra/lambda/lookup/index.js`, `infra/lambda/session/index.js`,
  `infra/lambda/redeem/index.js`: the marked `GH-338 payment-state classification` block
  (`classifyPaymentState`, `isUnsettledPaymentState`), used by `evaluateEligibility`,
  `isPaymentSettled` and both `isPaymentComplete` gates.
- `jumpyard-checkin-phone/src/flow/cloudClient.ts`, `src/flow/types.ts`,
  `src/components/BookingSummary.tsx`, `src/context/LanguageContext.tsx`: `paymentState`
  on the booking and the register message.
- `JUMPYARD_CLOUD_CONTRACT.md`: the exact rule, `eligibility.paymentState` and the
  `payment_required` row.
- `scripts/validate-gh338-exact-payment-status.js`: loads the three Lambdas in a sandbox
  and checks the identical block, every classification case, the lookup eligibility and
  settlement rules, the session and redeem gates, and the phone, contract and package
  wiring.

The webhook Lambda keeps its own settlement helper; it already excludes partial and unpaid
statuses and requires an exact paid token, and it is not a check-in gate.

## Validation before merge

Run from the repository root:

```powershell
npm run validate:gh338-exact-payment-status
npm run validate
npm run infra:check
```

Run from `jumpyard-checkin-phone`:

```powershell
npm run lint
npm exec tsc -- --noEmit --project tsconfig.json
npm run build
```

Results on 2026-09-03:

- `validate:gh338-exact-payment-status`: 21 checks passed (identical block, no substring
  matching, 21 classification cases in each Lambda, lookup eligibility and settlement,
  session and redeem gates, phone, contract and package wiring);
- repository `npm run validate` including every existing lookup, session, redeem, kiosk and
  least-privilege validator: passed;
- `npm run infra:check` (CDK build, synth and infra validators): passed;
- phone ESLint (0 errors, 4 pre-existing warnings), TypeScript and production build: passed.

## Manual verification

A normal paid booking must still check in unchanged on the phone and at the staff app after
the protected promotion. A partially paid booking is not provoked on purpose; the register
path is covered by the validator and can be confirmed on Park if a real `PartiallyPaid`
booking is looked up.

## Merge and protected rollout evidence

Pending. Record the PR, merged SHA, release run, artifact digest, protected Park promotion
(the CDK plan changes `LookupHandler`, `SessionHandler` and `RedeemHandler` code only) and
the public promotion here after the protected workflows have run.
