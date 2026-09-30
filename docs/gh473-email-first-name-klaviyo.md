# Email-first new purchases with a Klaviyo lookup — issue #473

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/473. Decision: D0234 (recorded by #460, PR #474; [#460 evidence](gh460-default-contact-values.md)). Branch `codex/gh-473-email-first-name-klaviyo` from `origin/main` `efc1eea`. Love and Gustav approved the binary design on 2026-09-30. The kiosk follows in kiosk #150.

## Status

- Implemented and verified locally. Nothing is committed, deployed or created in AWS.
- No Klaviyo, ROLLER, AWS or Cloudflare call was made; all tests use synthetic data.
- The Cloud contract is in [JUMPYARD_CLOUD_CONTRACT.md](../JUMPYARD_CLOUD_CONTRACT.md#email-first-new-purchase-contact-473-d0234-implemented-not-yet-released), the secret in [AWS_RESOURCES.md](../AWS_RESOURCES.md) and the checks in [TEST_PLAN.md](../TEST_PLAN.md).

## What changes

**Cloud (`infra/lambda/booking`).**
- `contact-lookup.js` holds the email-first rules: the mode check, the exact Klaviyo request, response classification, the phone and address mapping, placeholders and the cached key.
- `index.js` resolves an email-first contact after the idempotency reservation and before any ROLLER call. An uncertain answer returns `409 contact_details_required` and marks the reservation failed.
- A four-field customer takes the unchanged path.
- Quotes replace a partial customer with the synthetic quote customer.
- An email-first draft that ROLLER rejects returns error codes without provider messages.

**Infrastructure.**
- `contactLookup.klaviyoEnabled` and `timeoutMs` default to off and 1500 ms. The lookup is enabled only in `park-test-full-flow-rehearsal.json`; config guards refuse it in dev and in every other park-test profile.
- Every park-test profile creates the empty, retained secret `/jumpyard-check-in-park-test/klaviyo/profiles-read`. Only the full-flow Booking role may read it.
- Booking receives `ENABLE_GH473_KLAVIYO_CONTACT_LOOKUP`, `GH473_KLAVIYO_LOOKUP_TIMEOUT_MS` and `KLAVIYO_PROFILES_READ_SECRET_ARN`.

**Phone (`jumpyard-checkin-phone`).**
- The contact step shows first name and email plus the optional email choice (D0225). Last name and phone stay hidden.
- On `contact_details_required`, a short notice ("Vi behöver lite fler uppgifter" / "We need a little more information") reveals last name and phone and focuses the last name. Email, basket and codes stay. The next Continue sends all four fields with a new idempotency key.
- A `customer_required` answer to an email-first draft also reveals the two fields. Only a Cloud without #473 gives it, for example after a backend rollback while the public phone stays new.
- A saved purchase with only first name and email is valid. A saved last name or phone resumes the four-field form, without the notice. Active draft and payment recovery keep their identity.
- The booking name is the first name alone for email-first purchases. Quotes never carry a partial customer.
- The development-only `/preview/contact` shows both states in SV/EN with synthetic answers, and the production export keeps it a not-found page.

## Synthesized infrastructure change

Local synth compared with untouched `origin/main`:
- **Release profile `park-test-full-flow-rehearsal`.** 208 → 209 resources. Added `KlaviyoProfilesReadSecret` (no `SecretString`/`GenerateSecretString`, `Retain`, ten WRLDS tags). Changed the `BookingHandlerServiceRoleDefaultPolicy` (one statement: `secretsmanager:GetSecretValue` and `DescribeSecret` on that secret) and `BookingHandler` (code plus the three variables). Nothing else changed.
- **Closed `park-test`.** Adds the secret without a grant; Booking gets `false` and an empty ARN.
- **Dev.** Booking code and the `false`/empty variables only; no secret.

## Validation (2026-09-30, local)

- `npm run validate:gh473-contact-lookup`: Cloud 24/24 and phone 14/14. The Cloud tests cover found (complete and partial), not found, several profiles, HTTP 4xx/5xx, timeouts, network errors, malformed answers, a missing, empty or invalid key, a disabled lookup, exact Klaviyo requests, exact ROLLER payloads, the stored contact, no contact values in responses, logs or events, the four-field path, the idempotency hash, the email choice and quotes.
- Every step of the root `validate` chain was also run separately. All pass except the two local-only failures below, which fail identically on untouched `origin/main` `efc1eea`:
  - `validate:history-archives`: `PROJECT_CONTEXT.md` is over 12,000 characters with CRLF line endings.
  - `validate:t0194-staff-identity-frontend`: the admin Turbopack build refuses the `node_modules` junction.
- `npm run infra:check` passes, including the new config guards and synth checks. `validate:t0193-api-protection` and `validate:t0194-staff-identity-infra` now expect 209 release resources.
- Phone: every `src/flow`, component and preview test passes. Lint has no errors (four existing `<img>` warnings), `tsc --noEmit` is clean, and the production build with the Park API passes the mock-boundary verifier (`/preview/contact` exports the not-found page).

## Open risks for Park acceptance

- **Partial address.** ROLLER's draft customer takes `address` as one object. Sending only the fields Klaviyo has (often just `postcode`) may replace ROLLER address fields that Klaviyo lacks. Verify with an owned alias that has a full ROLLER address.
- **Postcode only.** Only `location.zip` → `postcode` is copied, as D0234 approves. Klaviyo can derive `city` and `country` from IP, so those are never read. Park acceptance should confirm that a known alias's `zip` equals its ROLLER postcode and that sending `address` with only `postcode` leaves any other ROLLER address fields intact.
- **Phone format.** A `+46` number becomes the national `0…` form, matching what the phone app sends. A ROLLER value stored with spaces or dashes is replaced by the compact form; other countries stay E.164.
- **Email case.** The lookup lower-cases the email; Park should confirm that a known alias typed in a different case is still found.
- **Customer-bound codes.** Apply in email-first mode prices with the synthetic quote customer. If a member or clip-card code ever depends on the customer, Apply feedback could differ from the draft.
- **Payment token.** ROLLER's payment JWT is returned to the browser as before. Check its payload keys once in Park for customer fields.
- **Not found overwrites.** An email that ROLLER knows but Klaviyo does not still gets placeholders (accepted in D0234).

## Rollout

1. Love reviews `/preview/contact` on localhost.
2. Reviewed PR (`Refs #473`), then the immutable release.
3. Protected Park plan: only the secret, the Booking policy and Booking.
4. Love stores the key.
5. Park acceptance with owned aliases, including the risks above and the lookup latency from `booking.contact_lookup` logs.
6. Public promotion.

At closeout, `PROJECT_CONTEXT.md` Must know and `REPO_CURRENT_STATE.md` need the released facts. `PROJECT_CONTEXT.md` has only about 37 characters of headroom.
