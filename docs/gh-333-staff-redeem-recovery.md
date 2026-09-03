# Resumable staff redeem after Roller acceptance (#333)

Approved issue: [#333](https://github.com/wrlds-creations/jumpyard-check-in/issues/333).

Branch: `codex/gh-333-resumable-staff-redeem` from `origin/main` at
`9f26211` (PR #355 merged).

## Problem

Staff redeem ran the final Roller refresh (token, booking, catalog, venue), then
`POST /redemptions`, then five local writes, and only then answered the staff app. The
handler had the 10 s default timeout while cold starts measured up to 7.65 s before the
redemption call. When time ran out or a write failed after Roller had accepted, the
session stayed `ready_for_staff`, the staff app showed an error, and every retry either met
Roller's `409` (already redeemed) or the local already-redeemed block. Nothing could finish
the session, so it stayed in the Handoff queue. The 2026-08-26 13:16 UTC sequence
`409 -> 200 -> 409` shows the retry pattern in production.

## Behavior (approved by Love on 2026-09-03)

Roller's redemption remains the only decision. Local bookkeeping is a receipt of it:

1. Right after Roller answers OK, one SQL statement marks the tickets, completes the
   idempotency key and completes the check-in session. The staff app gets its green result
   as soon as that receipt exists.
2. Attempt and event bookkeeping run after the receipt. A failure there is logged
   (category and code only) and does not undo the completed redeem.
3. The staff app uses one stable idempotency key per session, `staff-redeem:<sessionId>`.
   A repeated press or a second device is the same operation:
   - key already `succeeded`: complete locally, no second Roller redemption
     (`recovered: "local_receipt"`);
   - key `in_progress` and fresh: `409 redeem_in_progress` with `retryAfterSeconds`;
   - key `in_progress` but stale (older than 30 s, past the handler timeout) or `failed`:
     the retry takes it over and resumes;
   - a different request behind the same key: `409 idempotency_key_reused`.
4. Roller's per-ticket redemption state from the final refresh is authoritative. If every
   selected ticket is already redeemed there, the check-in completes locally
   (`recovered: "roller_ticket_status"`) without a second `POST /redemptions`. After a Roller
   `409`, one booking recheck decides the same way; any other `409` stays `rejected`.
5. The staff wrapper checks for an existing receipt before invoking the redeem path, so a
   retry never re-runs the Roller refresh when the receipt already exists.
6. The redeem Lambda timeout is 25 s (API Gateway allows 30 s), so a slow refresh no longer
   cuts off the receipt. This is a safety margin, not the fix.

The staff app shows "Incheckad: N biljetter (redan inlösta i ROLLER, sessionen slutförd)"
for a recovered result and a wait-and-retry message for `redeem_in_progress`. No generic
`409` is ever shown as a completed check-in.

## Code

- `infra/lambda/redeem/index.js`: `finalizeRedeemLocally` (atomic receipt),
  `reserveIdempotencyKey` + `claimExistingIdempotencyKey` (replay/resume/busy),
  `findSucceededRedeemReceipt` (wrapper receipt check by key only; the redeem runtime role
  may only insert into `checkin_attempts`), `getRollerTicketRedeemStates` with
  `redeemStatus` carried on normalized tickets, `finalizeRecoveredRedeem`,
  `recordRedeemBookkeeping`, and the reordered success/409 paths.
- `infra/lib/jumpyard-cloud-stack.ts`: `RedeemHandler` timeout 25 s.
- `jumpyard-checkin-admin/src/app/page.tsx`, `src/lib/adminApi.ts`: stable key,
  `recovered` in the result, `redeem_in_progress` handling.
- `JUMPYARD_CLOUD_CONTRACT.md`: staff redeem rules for the receipt, `recovered`,
  `redeem_in_progress` and `idempotency_key_reused`.
- `scripts/validate-gh333-staff-redeem-recovery.js`: runs the handler against scripted
  Roller and Aurora responses for every path above, plus source contracts.

No migration, database grant, IAM, secret, route, gate, payment, kiosk or guest-flow change.

## Validation before merge

Run from the repository root:

```powershell
npm run validate:gh333-staff-redeem-recovery
npm run validate
npm run infra:check
```

Run from `jumpyard-checkin-admin`:

```powershell
npm run lint
npm exec tsc -- --noEmit --project tsconfig.json
npm run build
```

Results on 2026-09-03:

- `validate:gh333-staff-redeem-recovery`: 10 scenario groups passed (receipt before
  bookkeeping, replay without Roller, busy key, stale-key resume from Roller state, Roller
  409 rejected vs. completed after recheck, foreign request behind the same key, bookkeeping
  failure after the receipt, receipt lookup and ticket-state rules, source contracts);
- repository `npm run validate` including all existing redeem, staff-identity, kiosk and
  least-privilege validators: passed;
- `npm run infra:check` (CDK build, synth and infra validators): passed;
- admin ESLint, TypeScript and production build: passed.

## Manual verification still required

A normal staff check-in on Park after the protected promotion (green result, session
leaves the queue). The failure path is exercised only by the validator; no Roller
redemption is provoked twice on purpose.

## Merge and protected rollout evidence

Pending. Record the PR, merged SHA, release run, artifact digest, protected Park promotion
(the CDK plan changes only the existing `RedeemHandler`) and the admin promotion here after
the protected workflows have run.
