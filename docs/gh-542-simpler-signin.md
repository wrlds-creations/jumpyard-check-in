# Issue #542: no admin code and any six-digit staff PIN

Issue [#542](https://github.com/wrlds-creations/jumpyard-check-in/issues/542), decision D0264.

## What changes

- **Admin sign-in.** Administrators sign in at `/admin` with email and password only. The existing admin user pool goes from MFA required (TOTP) to MFA off, with no enabled factor. Cognito no longer asks for the authenticator code.
- **Staff PINs.** Any six-digit PIN is accepted, such as `111111` or `123456`. This holds on create and reset in admin, and at PIN login, kiosk pairing and kiosk payment resolution.

## Why

On 2026-10-14 Love set up shared station accounts, one account and PIN per device (for example "Entré Telefon 1" and "Café Datorn"). The admin form refused `111111` with "Choose a less predictable six-digit PIN." Love decided: "Koden ska bort helt och jag alla pin ska vara tillåtna."

Love accepted these risks knowingly on 2026-10-14:
- a leaked admin password alone opens `/admin`;
- codes such as `123456` can be guessed quickly from the public staff page.

## Change (D0264)

1. **Admin user pool** (`infra/lib/jumpyard-cloud-stack.ts`). `mfa: cognito.Mfa.OFF` replaces `Mfa.REQUIRED` with `mfaSecondFactor: { otp: true }`. The template gets `MfaConfiguration: OFF` and no `EnabledMfas`.
2. **Session Lambda** (`infra/lambda/session/index.js`). `isTrivialStaffPin` and both of its uses are removed.
   - `validateNewStaffPin` (create and reset) checks only for six digits. The error `staff_pin_too_simple` no longer exists.
   - `authenticateStaffPin` (PIN login, GH-488 kiosk pairing and GH-483 kiosk resolution) no longer counts a simple PIN as a failed attempt before the lookup.

**Unchanged:**
- Six digits, and one PIN per park. The keyed lookup's unique index still refuses a PIN in use with `409 staff_pin_unavailable` ("That PIN is already in use. Choose another PIN.").
- The keyed lookup, the scrypt verification and the source and venue failure limiter (20 and 25 failures).
- The pool, app client, domain, managed login, users, password policy (eight characters with upper- and lowercase and a digit), Essentials tier and deletion protection.
- The admin and staff apps. There is no frontend change and no migration.

## The AWS change is in place

- CloudFormation documents `MfaConfiguration` and `EnabledMfas` as "Update requires: No interruption". For `EnabledMfas` it says that to disable all MFAs, you set `MfaConfiguration` to `OFF` and remove `EnabledMfas`. That is this template change.
- Cognito's MFA guide says an existing pool can turn MFA off (`UpdateUserPool` or `SetUserPoolMfaConfig`). With MFA off, a correct username and password signs the user in.
- Read-only checks on 2026-10-14, in account `376129878018`/`eu-north-1`. Nothing was deployed.
  - The live pool `eu-north-1_rmaqadThL` reports MFA `ON`, TOTP enabled and one user.
  - `cdk diff --method template` with `park-test-full-flow-rehearsal.json` shows no differences for unchanged `main`. This branch changes only `AdminUserPoolD0AF18CF` and the `SessionHandler3CE835D7` code. The pool is modified in place: `EnabledMfas` is removed and `MfaConfiguration` goes from `ON` to `OFF`.
  - `scripts/compare-cloudformation-templates.js` against the deployed template keeps 218 resources, with none added or removed. Locally, `CDKMetadata` also differs, but only by the Node.js version.
- The administrator's registered authenticator stays stored in Cognito, but nothing asks for it.
- The ops CLI's `replace-admin-account` exists to recover from a lost authenticator. It is not needed while MFA is off, and its enable step still expects TOTP. An administrator who forgets the password uses Cognito's email reset.

## Validation

- `validate:t0194-staff-identity-backend`:
  - `111111` and `123456` are created and both sign in as their own account;
  - a reset to `222222` signs in;
  - a PIN in use is refused with 409 on create and on reset.
  - Against the old Session Lambda, the new case fails with 400 on create.
- `validate:gh483-kiosk-staff-resolution` and `validate:gh488-kiosk-pairing`: a simple PIN resolves a kiosk payment (`111111`) and pairs a kiosk (`123456`) without a failed attempt. Both cases fail against the old Session Lambda.
- `validate:t0194-staff-identity-infra`: `MfaConfiguration` is `OFF`, with no `EnabledMfas`.

## After release

Park only. In the Park plan, this issue changes only the admin user pool's MFA setting and the Session Lambda code.

1. Love signs in at `/admin` with email and password and is not asked for a code.
2. Love creates an account with a simple PIN such as `111111` and signs in with it on a staff phone.

## Remaining risks (accepted)

- A leaked admin password alone opens `/admin`. Cognito's temporary lockout after repeated wrong passwords still applies.
- A simple PIN can be guessed quickly from the public staff page. The source and venue limiter still blocks after 20 and 25 failures.
- A second factor can return later. For example, a passkey can satisfy MFA on the Essentials tier.
