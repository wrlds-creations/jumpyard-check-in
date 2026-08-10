# Issue #230: Assisted lookup when ROLLER omits booking venue

## Outcome

JumpYard Cloud can complete an approved Nacka assisted lookup when ROLLER Live returns a valid booking without a venue field. The venue safety gate remains fail-closed.

## Root cause

The controlled kiosk QR lookup reached `POST /v1/check-in/lookup`, refreshed the booking from ROLLER, and received valid booking items for the approved operating date. ROLLER booking detail did not include venue, while the previous scope gate required venue to exist in that response or the normalized booking. The request was therefore blocked before session creation.

The Aurora booking snapshot already held Nacka venue metadata, but it lacked the display-name evidence required for the local fast path. JumpYard Cloud correctly refreshed from ROLLER rather than treating the cache as authoritative.

## Safety rule

For park-test assisted lookup:

1. An explicit venue in ROLLER booking detail or the normalized booking remains authoritative.
2. If that venue is missing, JumpYard Cloud calls authenticated ROLLER Live `GET /venues/me`.
3. The fallback is accepted only when the returned venue exactly matches configured Nacka venue `50871`.
4. Missing configuration, provider failure, malformed identity, a different provider venue, a non-Live provider environment, or an explicit conflicting booking venue remains blocked.
5. Booking operating-date checks are unchanged.

This is a server-side lookup correction. It does not change the kiosk APK, QR format, payment, printing, redemption, venue/date scope, AWS topology, secrets, or provider permissions.

## Validation

- `node scripts/validate-assisted-lookup-venue.js`
- `node scripts/validate-t0190-safety-gates.js`
- `node scripts/validate-t0201-controlled-t30-email.js`
- full repository validation
- infrastructure build/check and park-test full-flow synth
- read-only CDK diff proving only the lookup Lambda asset changes

## Rollout evidence

- PR #231 merged as `ae6391324fe71b8f6a8184250ee6b8c04210c80b`.
- Immutable release run `31374270132` built the exact merge commit.
- Protected park-test promotion run `31374686605` reviewed a 202-to-202-resource plan changing only the existing lookup Lambda code asset and CDK metadata; migrations remained off.
- Final verification passed exact-artifact AWS and Cloudflare readback, `UPDATE_COMPLETE`, `IN_SYNC` drift, zero active alarms, empty queues, migrations through `0018`, and healthy public endpoints.
- A sanitized deployed API probe returned HTTP 200 with `status=found` and `eligibility=ready`.
- On the physical Android kiosk, the controlled paid ROLLER booking was found, the no-payable-add-on path skipped payment, safety completed, and the ready-for-entry handoff screen rendered.

The controlled booking reference, QR payload, guest identity, access proof, and session identifiers are intentionally absent from repository evidence. Native receipt printing is separate kiosk issue #20 and is not an acceptance condition for this shared lookup correction.
