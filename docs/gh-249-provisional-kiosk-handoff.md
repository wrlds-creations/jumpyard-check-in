# Issue #249: provisional kiosk handoff

## Outcome

A kiosk terminal payment that is already durably recorded as approved no longer has to wait for ROLLER booking visibility before the guest continues through safety. JumpYard Cloud creates an idempotent provisional operational session and returns the usual JumpYard handoff payload.

ROLLER remains authoritative for the booking and tickets. The provisional state never grants redeem authority.

## State boundary

```text
terminal approved
  -> provisional local booking/session (bookingSyncStatus=pending)
  -> guest completes safety
  -> JY_HANDOFF code/QR can be shown or printed
  -> ROLLER reconciliation supplies booking and ticket ids
  -> session becomes bookingSyncStatus=confirmed
  -> staff redeem is enabled
```

If reconciliation exhausts its bounded attempts, the state becomes `needs_staff`. The guest is not invited to pay again.

## Safety properties

- The provisional state is created only from the existing approved terminal-attempt path.
- Repeated status/finalize requests reuse the same provisional booking, guest token, and session.
- The public response contains safe normalized booking data and the existing high-entropy attempt token; it does not expose terminal configuration or provider credentials.
- Staff queue/detail clearly identifies a booking still being synchronized.
- Staff redeem rejects any session whose `bookingSyncStatus` is not `confirmed`.
- Authoritative reconciliation atomically replaces the provisional session link and selected ticket ids before enabling redeem.

## Validation

- `npm run validate:kiosk-terminal-backend`
- `npm run validate:kiosk-payment-reconciliation`
- `node --check infra/lambda/booking/index.js`
- `node --check infra/lambda/booking/kiosk-terminal-contract.js`
- `node --check infra/lambda/session/index.js`
- `node --check infra/lambda/redeem/index.js`
- Admin app lint and production build

Physical kiosk validation is owned by the paired kiosk issue and still requires the approved APK against the real Nacka terminal.

## Park-test rollout evidence

- Implementation PR: [#251](https://github.com/wrlds-creations/jumpyard-check-in/pull/251)
- Merge commit: `5bc18a03e7e4843c1606617bdf8aa94146044bd4`
- Immutable release: [32113533632](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32113533632), artifact digest `sha256:66c96f8c30f8c5551ba391e2a1a338adca46f872463cdf33be940fc00db1ccfd`
- Protected promotion: [32114023750](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32114023750)
- Reviewed plan: 202 resources before and after, with no additions or removals
- Migration `0020 provisional kiosk handoff`: applied
- Final readback: exact release template deployed, stack `UPDATE_COMPLETE`, drift `IN_SYNC`, zero alarms in `ALARM`, empty queues, and exact phone/admin Cloudflare release checks passed

The remaining non-automated evidence is the supervised physical P400 flow in the paired kiosk repository. No automated release step submitted a payment or created a ROLLER booking.
