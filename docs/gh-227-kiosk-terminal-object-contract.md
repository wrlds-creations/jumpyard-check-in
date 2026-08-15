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

Code must reach park-test through the immutable release and protected promotion workflow. The existing secret mapping must then be migrated from the legacy string to the object without printing either identifier. Until both steps are complete, the path remains fail-closed. A later Love-supervised physical attempt is the only approved way to prove that the terminal receives the payment request; no automated test may start a real card-present payment.
