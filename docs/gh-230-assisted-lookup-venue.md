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

Physical kiosk QR lookup and the remainder of the no-payment check-in/print flow remain rollout evidence after protected park-test deployment.
