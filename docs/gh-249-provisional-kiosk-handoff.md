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
