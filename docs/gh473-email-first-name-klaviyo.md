# Email-first new purchases with a Klaviyo lookup — issue #473

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/473. Decision: D0234 (recorded by #460, PR #474; [#460 evidence](gh460-default-contact-values.md)). Branch `codex/gh-473-email-first-name-klaviyo` from `origin/main` `efc1eea`. Love and Gustav approved the binary design on 2026-09-30. The kiosk follows in kiosk #150.

## Status

- **Live since 2026-09-30.** The code is in Park Booking, the Park phone and checkin.jumpyard.se. See [Rollout evidence](#rollout-evidence).
- **References.** The Cloud contract is in [JUMPYARD_CLOUD_CONTRACT.md](../JUMPYARD_CLOUD_CONTRACT.md#email-first-new-purchase-contact-473-d0234-released-2026-09-30), the secret in [AWS_RESOURCES.md](../AWS_RESOURCES.md) and the checks in [TEST_PLAN.md](../TEST_PLAN.md).

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

## Rollout evidence

- **Merge.** PR #475 merged as `63f2ee0` (Love approved the preview, then said "kör"). Before merging, the Park address mapping was limited to `zip` → `postcode` and the copy became "Vi behöver lite fler uppgifter".
- **Release and Park.** Release [36733819783](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/36733819783) went to Park run [36734773707](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/36734773707).
  - The reviewed plan went from 208 to 209 resources: `KlaviyoProfilesReadSecret` added (empty, Retain, 10 WRLDS tags); `BookingHandler` (code plus the three variables), its role policy (one statement, `GetSecretValue`/`DescribeSecret` on that secret only) and `CDKMetadata` changed. Nothing was removed and there were no migrations.
  - An independent synth comparison matched the plan.
  - The deploy succeeded. Verification stopped only because `webhook-processor-lambda-throttles` was in ALARM from 15:11:18Z to 15:16:18Z. Booking readback showed the lookup enabled with a 1500 ms timeout, and the open-ended date window was intact.
- **Superseding release.** #458's release 36735226042 (`057340d`, which contains #473) passed Park verification in run 36735979010. Public run 36736885751 then promoted both phone changes to checkin.jumpyard.se. Do not redeploy `63f2ee0` over it.
- **Key.** Love stored the Profiles:Read key with `aws secretsmanager put-secret-value --secret-string file://…`, giving `AWSCURRENT` at 15:19:53Z. No agent read the stored value.
- **Acceptance.** Love's owned aliases on checkin.jumpyard.se, each draft abandoned at payment:

  | Case | `booking.contact_lookup` | ROLLER | Klaviyo |
  |---|---|---|---|
  | Known test alias (Anna Testsson, fiction number, no postcode) | `found`, 266 ms | every guest field unchanged | unchanged |
  | New alias, typed first name | `not_found`, 231 ms | new guest with the typed first name, `Gäst`, `0700000000` | new profile with the same values |
  | Love's web-shop profile (postcode only, no street or city) | `found`, 233 ms | Love confirmed in Venue Manager that name and postcode are unchanged | name, phone and `zip` still present |

  The log lines contained no PII.
- **Not observed live.** The uncertain fallback in production is covered by tests only. A guest with a full ROLLER address (street and city) has not been tested; ROLLER might clear those fields when only `postcode` is sent.
- **Testing note.** The Claude app's built-in browser pane blocks the Park API (`ERR_BLOCKED_BY_CLIENT`) and shows "Could not reach JumpYard Cloud". Test in a normal browser.
