# T0177 Park-Test Guest Contact Lookup

## Goal

Let visitors find today's Nacka booking by booking reference, email, or phone through JumpYard Cloud, without frontend Roller calls, broad same-day imports, Roller writes, webhook processing, SMS, or email side effects.

## Result

Implemented and deployed T0177 on 2026-06-30 through the existing park-test full-flow rehearsal posture.

The phone lookup input now accepts booking reference, email, or phone and no longer uppercases the entered value. JumpYard Cloud infers the identifier type server-side, so the public client cannot choose its own lookup mode.

For email and phone lookup, `LookupHandler` now:

- uses Roller REST `GET /bookings?date&keywords` with the requested Europe/Stockholm operating date;
- verifies each search hit through `GET /bookings/{identifier}`;
- filters to JumpYard Nacka Forum venue `50871` and the exact lookup date;
- scopes the normalized booking response and Aurora snapshot to items on that lookup date;
- returns `not_found` when no booking exists for that date/contact;
- chooses the nearest upcoming start time when multiple valid bookings match today, falling back to the earliest valid start time if none are upcoming;
- keeps raw email and phone out of the public booking response and local normalized summary.

The T0176 full-flow AWS gate posture remains open after this deploy. No new AWS resources were created.

## Validation

- `node --check infra/lambda/lookup/index.js`
- `node scripts/validate-t0177-contact-lookup.js`
- `npm --prefix jumpyard-checkin-phone run lint` passed with existing `<img>` warnings only.
- AWS preflight confirmed account `376129878018` and region `eu-north-1`.
- `npm --prefix infra run synth:park-test-full-flow-rehearsal` passed with existing CDK notice `37949`.
- `npm --prefix infra run diff:park-test-full-flow-rehearsal` showed only `LookupHandler` Lambda code/S3Key changing.
- `npm --prefix infra run deploy:park-test-full-flow-rehearsal` reached `UPDATE_COMPLETE`.
- Lambda readback confirmed `LookupHandler` last modified `2026-06-30T08:57:15.000+0000`, `ENABLE_T0171_ASSISTED_LOOKUP=true`, `ENABLE_T0169_POST_PAYMENT_SYNC=true`, venue `50871`, dates `2026-06-29` through `2026-07-05`, and `JUMPYARD_EMERGENCY_STOP=true`.
- Public negative email smoke for `2026-06-30` returned HTTP `404` with `booking_not_found`, not `live_lookup_not_allowed`.
- Public negative phone smoke for `2026-06-30` returned HTTP `404` with `booking_not_found`, not `live_lookup_not_allowed`.
- `npm run validate` passed.
- `npm run infra:check` passed with existing CDK notice `37949`.
- `npm --prefix jumpyard-checkin-phone run build` passed with existing `baseline-browser-mapping` notices.
- `git diff --check` passed with existing CRLF normalization warnings only.

## Not Done

No real visitor/contact positive smoke was run in this ticket because no user-approved real email or phone value was provided during the implementation turn.

T0177 did not create AWS resources, add migrations, broaden venue/date scope, import same-day bookings, write Roller drafts/payments/redemptions, process webhooks, send SMS/email, print secrets, print raw payment JWTs, or expose raw contact PII in the public response.
