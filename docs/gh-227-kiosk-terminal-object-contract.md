# Issue #227 ROLLER Kiosk Terminal Object Contract

## Outcome

The shared booking backend now models ROLLER's `paymentTerminal` property as a server-owned object rather than a string.

```json
{
  "deviceId": "configured-kiosk-device-id",
  "terminalId": "configured-terminal-id",
  "promptForTip": false
}
```

The real identifiers remain in the existing park-test ROLLER credentials secret. They are intentionally absent from source, validation output, logs, and GitHub evidence.

## Provider Evidence

The corrected physical attempt on 2026-08-13 passed ROLLER Booking Costs with HTTP 200 and then received HTTP 400 from Create Draft Booking. No payment, publish, or terminal request followed. ROLLER support inspected its logs and confirmed that the API expected an object instead of the string sent by the deployed handler.

ROLLER then supplied the object contract:

- `deviceId`: caller-owned kiosk/POS device identifier;
- `terminalId`: ROLLER terminal identifier;
- `amount`: optional and defaults to the booking remainder;
- `promptForTip`: optional and defaults to false.

## Implementation Boundary

- The secret-backed alias must contain both `deviceId` and `terminalId`; a legacy string or incomplete object fails closed.
- The handler forces `promptForTip: false`.
- The handler omits `amount`, allowing ROLLER to use the complete booking remainder already verified against the server-side quote.
- Booking Costs receives a derived payload without `paymentTerminal`.
- Create Draft Booking receives the normalized object.
- Provider error summaries redact both identifiers.
- Phone ecommerce requests remain unchanged because they do not select a kiosk terminal alias.

## Rollout Boundary

PR [#236](https://github.com/wrlds-creations/jumpyard-check-in/pull/236) merged as `506cbcb45ea20bfc1272db1e64c7bf4d35dec908`. Immutable release run [31876150698](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31876150698) built that exact commit, and protected promotion run [31876392673](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/31876392673) applied a 202-to-202-resource plan changing only the Booking Lambda and CDK metadata, with migrations disabled. AWS/CDK and Cloudflare deployment completed. The final verification step reported only the pre-existing cost-center tag drift owned by issue #233; direct readback confirmed `UPDATE_COMPLETE`, an active and successfully updated Booking Lambda, zero active park-test alarms, and empty queues.

After explicit approval, the existing park-test credentials secret was migrated in place from a legacy terminal string to the complete object. Guarded readback confirmed the approved caller `deviceId`, preserved masked `terminalId`, `promptForTip=false`, and absent `amount` without exposing either operational identifier. No payment or ROLLER draft was started.

The only remaining proof is a Love-supervised physical attempt showing that Create Draft succeeds and the intended terminal receives exactly one request. No automated test may start a real card-present payment, and an ambiguous result must not be retried until its status is known.
