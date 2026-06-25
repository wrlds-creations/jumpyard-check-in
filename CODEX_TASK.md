# CODEX_TASK.md

## Ticket ID
T0162

## Status
In closeout - contact-resolution blocker documented

## Goal
Prove one controlled existing-booking add-on path for a Roller Live Nacka booking in park-test.

## Scope
- Use the user-provided Roller Live booking reference `166490323` for Love WRLDS at 11:00 on 2026-06-25 as the only approved original booking.
- Keep the original Roller booking unmodified; create only a separate linked add-on draft/payment path.
- Open only the scoped T0162 add-on smoke gate and exact lookup gate needed for this booking, then close them again.
- Keep redeem, webhook processing, staff auth, SMS, email, broad booking export/Data API indexing, and normal visitor traffic disabled.
- Do not print secrets, raw payment JWTs, full guest PII, card data, or broad Live booking data.

## Validation
- `npm --prefix infra run build`
- `npm --prefix infra run validate:config-guards`
- `npm --prefix infra run validate:park-test-synth`
- CDK diff/deploy/readback for the scoped T0162 gate when AWS SSO is available.
- Controlled API smoke for lookup, add-on availability, add-on quote, add-on draft, Aurora safe rows, and closed-gate rollback.

## Result
T0162 opened the scoped gate, proved lookup for booking `166490323`, proved Live add-on availability for Nacka at 2026-06-25 11:00, then stopped safely at add-product quote because JumpYard Cloud could not resolve required customer email/phone from the original booking, local prepayment draft state, or guest profiles. The T0162 gates were closed again with `park-test.json`; lookup and add-product quote now fail closed. The agreed next ticket is T0163, a Live existing-booking contact resolver investigation, before retrying the add-on payment smoke in T0164.
