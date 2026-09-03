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

## Manual verification

Love ran two ordinary staff check-ins on `https://staff-checkin.jumpyard.se` after the
public promotion, for two separate bookings (10:00 and 12:00 sessions). Read-only Aurora
readback with the redeem runtime role: idempotency keys
`staff-redeem:jycs_mtlc5a9u_f33b4b2e` and `staff-redeem:jycs_mtldd8a7_9d068f9f` are
`succeeded` with `result_ref` `redeemed:174064124` and `redeemed:174057721`; both
sessions are `redeemed` / `completed`, and each `completed_at` equals its key's
`updated_at` (11:19:51 and 11:19:58 UTC), which is the atomic receipt. The redeem Lambda
log since the rollout holds exactly those two invocations, 4.6 s cold (410 ms init) and
2.1 s warm, with no error, warning or `checkin.redeem_bookkeeping_failed` entry. The
failure paths stay covered by the validator only; no Roller redemption was provoked twice
on purpose.

## Merge and protected rollout evidence

- Implementation PR: [#357](https://github.com/wrlds-creations/jumpyard-check-in/pull/357),
  squash-merged as `77faea776e7c9a3504a9f8a1e421923939d31caa` after merging `origin/main`
  (PR #355/#356, #351) into the branch. CI: Repository, Infrastructure, Phone, Admin green.
- Immutable release: [run 33740994168](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33740994168),
  artifact `park-test-release-77faea776e7c9a3504a9f8a1e421923939d31caa` (ID 9887870049),
  digest `sha256:71cf8dc857fb8265ebd0d5904e7c15cd6ef0291694c25653a49d3a109855bf49`.
- Protected Park promotion: [run 33741484703](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33741484703),
  `intent=promote`, `apply_migrations=false`, approved in GitHub as LoveWRLDS after Love's
  chat consent. Plan: current template `b227888a…` to release template `0791f5bb…`, 202
  resources, added none, removed none, changed `RedeemHandler3A94EE00` only; parameters,
  outputs, rules, conditions and mappings unchanged. CloudFormation reported
  `UPDATE_COMPLETE` for `RedeemHandler` at 09:58:12 UTC (30 s deployment). Pages: phone
  `11e6209e` on `jumpyard-check-in-park-test`, admin `bf7951e8` on
  `jumpyard-checkin-admin-park-test`. The workflow's post-deploy checks (template equality,
  `IN_SYNC` drift, zero alarms, empty queues, exact Cloudflare readback) passed.
- Live Lambda readback after the promotion: `jumpyard-check-in-park-test-stack-redeem`
  timeout 25 s, `LastModified` 2026-09-03T09:58:06Z, `CodeSha256`
  `ADTHfo51qvQGF8eqcIFeTpwB8Er1X2C9wBSSPGjYZB8=`, state `Active`, last update
  `Successful`.
- Protected public promotion: [run 33741950790](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33741950790),
  same artifact digest verified. Pages: phone `28928844` on `jumpyard-check-in-production`,
  admin `1074a639` on `jumpyard-checkin-admin-production`. Independent check: the admin
  chunk served by `https://staff-checkin.jumpyard.se` contained the stable key, the
  recovered message and the `redeem_in_progress` handling; `https://checkin.jumpyard.se`
  byte-matched the Park and production deployments of the same artifact.

Minutes later PR #358 (#351 correction) merged as `409aa58` and was promoted through Park
[run 33742197982](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33742197982)
and public [run 33742546868](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33742546868).
That build retains this change unchanged: the redeem Lambda code and timeout are the same,
and the staff domain still served the #333 admin chunk after that promotion. See
[docs/gh-351-phone-payment-recovery.md](gh-351-phone-payment-recovery.md).
