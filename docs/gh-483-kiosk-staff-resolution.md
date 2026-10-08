# Issue #483: Staff Resolve An Uncertain Kiosk Payment

## Outcome

A staff member can release a stuck kiosk payment at the kiosk, with their personal PIN and without a developer. Cloud decides only on ROLLER evidence. Decision: D0239, the operator recovery interface D0220 anticipated. Kiosk counterpart: wrlds-creations/jumpyard-check-in-kiosk#160.

## Why

On 2026-10-06 a P400 without Wi-Fi rejected the payment request at once, and no card was charged. The kiosk still reported `unknown`, so D0220 kept the installation and terminal locked. A developer had to record `failed` through the finalize API and clear the kiosk storage over adb. Kiosk #160 now treats that direct terminal rejection as a definite "no payment". This issue covers every remaining uncertain result.

On 2026-10-08 it happened again on Nacka K2 with the P630: an Amex card was declined at once, and the kiosk again showed "Vi saknar betalningsbesked". The developer release used this issue's guarded statement and found that its audit insert could not run as the booking role (see Guards). Love then asked to ship #483 and #160 at once.

## Flow

```text
staff taps "Personal" on the kiosk, enters their PIN
kiosk -> POST /v1/staff/kiosk-payments/resolve { action: inspect, staffPin, attempt ids, kiosk identity }
Session Lambda: PIN rules and limiter as at login, operator role, no session
             -> Booking Lambda { action, attempt ids, kiosk identity, staffIdentityId }
Booking Lambda: paired (or legacy-profile) installation + its own attempt -> GET /bookings/{draft} (once)
             -> inspect | no_payment | paid, audited in event_log
```

| Staff choice | Allowed only when | Effect |
|---|---|---|
| Ingen betalning | The attempt is `created`/`unknown`, not published, has no booking reference, ROLLER answers 404, the local cache knows no booking, and the draft is at least 5 min old | `failed` + audit in one guarded statement; the next draft takes over both kiosk claims |
| Betalningen gick igenom | ROLLER returns a confirmed paid booking for the draft (zero owing, safe status, tickets) | Approved on that evidence, then the D0190 snapshot and attachment; the kiosk continues to completion |
| Anything else | | `409` with the reason; the kiosk stays locked |

The 5-minute wait covers the terminal's own timeout (about 135 s) plus ROLLER's delay in turning a late payment into a booking (about 45–75 s). In the incident itself the kiosk no longer needs staff (#160).

## Guards

- **The PIN proves the person for one request.** A kiosk PIN login would replace the employee's session on their staff device (D0160) and leave a staff token on a public screen, so this route does neither. Failures count against the same source and venue limiter as login.
- **The PIN stays in the Session Lambda.** It is never forwarded, stored or logged. The Booking Lambda receives only the pseudonymous staff identity id.
- **A kiosk can only reach its own attempt.** The request needs the kiosk's capability; the attempt must be bound to that installation. A kiosk paired by name (#488, D0243) is proven through its active pairing and sends no profile; an unpaired kiosk still needs its authorized legacy profile.
- **Nothing is marked paid on the staff member's word.** "Paid" makes no publish or payment write to ROLLER.
- **No PII in responses.** The response holds the state, amount, ROLLER classification and allowed actions. Guest names appear only in the existing confirmed `provisionalHandoff` that the kiosk already receives.
- **The release is atomic.** It re-checks every guard in SQL, so a concurrent approval, webhook booking or publish turns it into a no-op. The audit row is written in the same statement without `RETURNING`: the booking role may insert into `event_log` but not read it, which the first version (with `RETURNING event_id`) violated on Park. A failed audit insert still fails the whole release.

## API calls per resolution

One ROLLER `GET` per request: usually two in total (inspect, then the decision).

## Validation

- `npm run validate:gh483-kiosk-staff-resolution`: 32 cases, including a paired kiosk without a profile. The PostgreSQL case runs the release as `jumpyard_booking_runtime` in CI on the existing disposable service (port 55435); there was no local PostgreSQL.
- `npm run infra:check`: route catalog (31 routes, 218 resources together with #488), capacity model, least privilege and staff identity infrastructure.
- Existing suites unchanged: T0194 staff identity, #327 terminal binding, #481 publish, kiosk reconciliation, #282 handoff repair, #340 server errors.

## Rollout

1. Merge, then promote through the protected Park workflow. There is no migration, secret or configuration change. The plan should show one new route (integration, route, permission), the Session Lambda's new environment variable, timeout and invoke grant, and code for both Lambdas.
2. Publish kiosk #160.
3. Physical P400 test together with kiosk #160: disconnect the terminal, then reconnect and retry, plus one staff release.
