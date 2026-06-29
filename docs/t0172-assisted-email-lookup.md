# T0172 Assisted Email Lookup

## Goal

Investigate whether the park-test PWA can safely look up an existing Roller Live booking by guest email when the visitor does not know their booking code.

## Result

T0172 is a safe blocker, not a runtime unlock.

The first park-test flow should not add public email lookup unless Roller confirms a narrow supported API contract for `email -> booking` lookup. The current approved path remains:

```mermaid
flowchart LR
  Guest["Visitor lacks booking code"]
  Staff["Staff searches Roller Venue Manager by email"]
  Code["Staff finds booking code"]
  PWA["Guest/staff enters booking code in PWA"]
  T0171["T0171 code/date/Nacka lookup"]

  Guest --> Staff --> Code --> PWA --> T0171
```

## Findings

| Source | Finding | T0172 Impact |
|---|---|---|
| Roller Rest API booking detail docs | `GET /bookings/{identifier}` is documented for a specific booking by unique id or booking reference. | This supports T0171 booking-code lookup, not email search. |
| Roller Rest API guest detail docs | `GET /guests/{id}` is documented for a specific guest id. | This supports contact resolution after a booking exposes `customerId`; it does not find bookings from email. |
| Roller API overview | Data API and Rest API serve different use cases; Rest API supports real-time workflows. | Email lookup must be a Rest API-like real-time path to be safe for the PWA. |
| Roller Data API overview | Data API is for periodic export, is not real time, and does not allow querying specific records. | Data API is not an acceptable T0172 email lookup path. It would push us toward broad guest-data import. |
| Roller Venue Manager Academy | Venue Manager can find bookings by name, booking ID, email, or phone. | Staff can use Roller UI as the assisted fallback, but UI capability is not a public API contract. |

References:

- https://docs.roller.app/docs/rest-api/olt8a8nxs75ev-get-detail-of-a-booking
- https://docs.roller.app/docs/rest-api/ee8wtxgbkc0ut-get-guest-detail
- https://mysupport.roller.software/hc/en-us/articles/360001653455-API-overview
- https://mysupport.roller.software/hc/en-us/articles/360001653475-Data-API
- https://academy.roller.software/vm-basics/bookings-in-the-vm

## Decision

Do not implement public guest email lookup in T0172.

Reasons:

- A public email lookup can become a guest-data enumeration surface if it returns whether an email has a booking.
- A safe lookup needs a documented Roller endpoint that can be constrained to Nacka, approved operating dates, and exact match behavior.
- Data API import would be the wrong tool for this ticket because it is broad, periodic, and not real-time.
- Using undocumented endpoints in the park-test PWA would make rollback/support harder on test day.

## Park-Test Operating Fallback

If a visitor does not know their booking code:

1. Staff searches in Roller Venue Manager by email.
2. Staff reads the booking code from Roller.
3. The visitor or staff enters that booking code into the park-test PWA.
4. T0171 handles the server-side Nacka/date-scoped lookup and Aurora snapshot.

This keeps email and broader PII inside authenticated Roller staff tooling instead of the public guest endpoint.

## Future Unlock

A later ticket can implement assisted email lookup only if Roller confirms a supported endpoint or contract with these constraints:

- exact email input;
- Nacka venue only;
- approved operating date window only;
- no public list of matching guests/bookings;
- ambiguous matches fail closed;
- generic public error text;
- audit event without printing full email;
- no payment, add-on write, redeem, webhook, SMS, or email side effects.

## Scope Safety

T0172 did not:

- call Roller Live APIs;
- call AWS or Aurora;
- create drafts, bookings, payments, refunds, redemptions, or webhooks;
- enable staff auth, webhook processing, SMS, email, add-on writes, or visitor traffic;
- expose public PII;
- change Lambda runtime behavior.

## Validation

Passed on 2026-06-29:

```powershell
npm run validate
git diff --check
```

`git diff --check` printed CRLF normalization warnings only.
