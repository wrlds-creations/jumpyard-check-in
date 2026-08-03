# T0201 controlled T-30 email

Issue #216 implements the first automatic park-test check-in email without opening general guest delivery.

## Safety boundary

The normal `park-test.json` profile remains closed. The protected release profile may run the scheduler every five minutes, but the session Lambda cannot send unless the existing retained check-in-link secret contains one valid, enabled nested `t0201Control` tuple with all of the following:

- SHA-256 of one Roller booking identifier;
- venue `50871`;
- one booking start timestamp with an explicit UTC offset;
- SHA-256 of the normalized email stored for that booking;
- the exact T0201 schema, approval, and nonce.

The raw booking identifier and raw email address are hashed locally by the operator. They are not written to source, CloudFormation, GitHub, or the control secret. The recipient is always resolved from the retained booking contact; the schedule has no recipient override.

Missing, malformed, stale, early, ambiguous, or mismatched control state returns a fail-closed 409 application response without calling SES. SMS remains outside this path and receives no new IAM permission.

## Send sequence

1. EventBridge invokes the email-only processor every five minutes.
2. The processor considers bookings starting 25–30 minutes later. It never sends earlier than T-30 and performs no stale catch-up.
3. The booking identifier hash, Nacka venue, exact start timestamp, and recipient hash must all match once.
4. The session Lambda synchronously asks the existing lookup Lambda to refresh that booking from Roller Live. The same Roller credentials must live-confirm Nacka `50871` through `/venues/me`; the booking detail must still report the same identifier, date/time, active state, and settled payment, and any venue field present in booking detail must not contradict Nacka. Missing or mismatched venue identity fails closed.
5. The final email boundary rechecks the complete tuple before reserving a stable booking/start/channel idempotency key and calling SES.
6. Overlapping schedules, EventBridge retries, Lambda retries, provider ambiguity, and restarts reuse the same key. A replay is blocked rather than risking a second message.

The check-in link continues to use `https://jumpyard-check-in-park-test.pages.dev/` for this proof. `https://checkin.jumpyard.se/` is not selected by T0201 and remains a separate domain/payment/Apple Pay readiness decision.

## First controlled proof attempt

The 2026-08-03 proof armed one exact hash-only tuple and reached both the scheduled session Lambda and the authoritative Roller lookup during the bounded T-30 window. Identifier, schedule, active state, and settled payment all matched, but no email delivery row was created because Roller booking detail omitted every venue/location field and the original verifier required one there. A separate safe structural read confirmed that the same Roller credentials returned Nacka `50871` from `/venues/me`. The control was disarmed after the window; aggregate evidence remained zero sent, zero failed, zero queued, and zero active alarms.

The corrected verifier therefore requires a fresh `/venues/me` Nacka identity on every controlled authoritative refresh. A booking-detail venue field is optional only when absent; if present, it must also equal Nacka. No send is possible when either source contradicts Nacka or when credential venue identity is missing or unavailable.

## Arming one agreed booking

Do not arm the control until Love has separately confirmed the exact Roller booking, start time, and recipient. Use process-local environment variables so raw values are not command arguments or tool output:

```powershell
$env:T0201_BOOKING_IDENTIFIER = '<agreed Roller booking identifier>'
$env:T0201_BOOKING_START_AT = '<ISO 8601 timestamp with offset>'
$env:T0201_RECIPIENT_EMAIL = '<agreed booking email>'
node infra/node_modules/ts-node/dist/bin.js --prefer-ts-exts infra/scripts/t0201-controlled-t30-email.ts --profile wrlds-dev
```

The first command is a redacted dry-run. After reviewing the exact booking time and AWS target, the separately approved apply is:

```powershell
node infra/node_modules/ts-node/dist/bin.js --prefer-ts-exts infra/scripts/t0201-controlled-t30-email.ts --profile wrlds-dev --approval I_APPROVE_T0201_SINGLE_BOOKING_CONTROL_UPDATE --apply
```

Clear the process-local values immediately afterwards:

```powershell
Remove-Item Env:T0201_BOOKING_IDENTIFIER
Remove-Item Env:T0201_BOOKING_START_AT
Remove-Item Env:T0201_RECIPIENT_EMAIL
```

Disarm without supplying any raw values:

```powershell
node infra/node_modules/ts-node/dist/bin.js --prefer-ts-exts infra/scripts/t0201-controlled-t30-email.ts --profile wrlds-dev --disarm
node infra/node_modules/ts-node/dist/bin.js --prefer-ts-exts infra/scripts/t0201-controlled-t30-email.ts --profile wrlds-dev --disarm --approval I_APPROVE_T0201_SINGLE_BOOKING_CONTROL_UPDATE --apply
```

## Proof and rollback

Before the real proof, verify the protected release/deployment run, CloudFormation plan, SES/DKIM/configuration-set state, empty failed-event queues, healthy alarms, exact secret metadata, and the agreed booking tuple. Do not print secret values, booking identifiers, full email addresses, or generated check-in URLs.

Safe evidence is limited to timestamps, booleans, counts, masked destination, delivery status, provider-message-id presence, alarm state, and workflow run IDs. Disarm after the result is known. Rollback or re-promotion uses the immutable protected park-test workflow; local CDK deployment is not part of this runbook.

The steady controlled posture adds no secret container and up to 288 scheduled Lambda invocations per day. Reusing the existing retained secret also keeps immutable rollback and re-promotion from orphaning a newly named secret. The project AWS-cost follow-up should confirm measured spend before broader rollout.
