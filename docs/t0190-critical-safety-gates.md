# T0190 Critical Safety Gates

## Plain-Language Outcome

T0190 makes two cloud safety rules dependable before Sprint 3 adds staging and production capabilities:

1. A booking is inside the Nacka lane only when the configured approved venue exists, the booking itself contains venue evidence, and both values are exactly `50871`.
2. The emergency stop is a master breaker. When it is active, no smoke, rehearsal, allowlist, or full-flow flag can bypass it.

The useful analogy is a building with a main breaker and several locked rooms. Turning off the main breaker does not unlock any room; each room still needs its own approved key. Turning the main breaker on cuts power to every room regardless of which keys are present.

Issue #230 and D0179 later added one narrow assisted-lookup exception: when ROLLER omits venue from booking detail, the authenticated Live API account may supply the missing evidence through `GET /venues/me`. The configured venue and provider identity must both equal `50871`; an explicit booking venue still takes precedence and a mismatch remains blocked. Add-on and redeem gates are unchanged.

## Why The Old Model Was Unsafe

| Finding | Old behavior | Corrected behavior |
|---|---|---|
| Missing venue evidence | Lookup, add-on, and redeem checks rejected only a known wrong venue. A missing venue could pass, and lookup could substitute the configured venue as if it had been observed. | Missing configured venue, missing booking venue, and wrong venue all fail closed. |
| Emergency-stop bypass | Payment/add-on, staff, redeem, and full-flow flags could bypass `JUMPYARD_EMERGENCY_STOP=true`; lookup ignored the stop entirely. | Only the exact value `false` releases the stop. Missing or any other value remains stopped. |
| Stop released without narrow gate | Some write gates became broadly enabled as soon as the emergency stop was off. | Park-test still requires the exact payment/add-on/staff/redeem/full-flow gate, allowlist, date, and venue rules. |
| Final redeem refresh | The final Roller refresh did not carry authoritative venue evidence into the Aurora booking row used by the second redeem gate check. | Redeem normalization and upsert now persist the observed venue so the post-refresh gate can reject missing or changed venue evidence. |

## Runtime Boundary

When the emergency stop is active, T0190 blocks:

- all booking Lambda operations, including availability, quote, new draft/payment start, add-on quote, and add-on draft;
- all park-test lookup modes before local/Live booking data is read or reconciled;
- staff login, list, and detail routes, including use of an already-issued staff token;
- every confirmed Roller redemption path; and
- webhook processing and real SMS/email sends, which were already stopped and now also treat missing stop config as stopped.

Guest-local session start/ready, link resolution, message dry-run planning, and redeem planning remain available because they do not call Roller writes, expose staff data, or send a real guest message. An already-issued Roller/Adyen payment session cannot be revoked by a later Lambda config change; the stop prevents new sessions.

## Config Model

- Normal closed `infra/config/park-test.json` keeps `emergencyStop=true`.
- Reviewed active park-test profiles use `emergencyStop=false` so they can operate under the new runtime model.
- Config validation permits `false` only when a recognized scoped approval is present and all existing allowlist/date/venue/write dependencies pass.
- A reviewed profile with `emergencyStop=true` remains a valid safely stopped state.

This changes repository configuration and future synthesized Lambda environment values. It does not change AWS by itself.

## Deployment State

T0190 performs no AWS deploy. The currently deployed Nacka full-flow window therefore remains on the previous Lambda code and the previous `JUMPYARD_EMERGENCY_STOP=true` plus scoped-bypass model, so the running phone/admin test apps are unchanged.

A later deploy of T0190 must be separately approved and reviewed as one coherent code-and-config change. Deploying only the new Lambda code while retaining the old `true` full-flow environment would intentionally stop the current park-test flow.

Confirmed park-test metadata remains:

- account `376129878018`, region `eu-north-1`, environment `park-test`;
- client `JumpYard`, project `jumpyard-check-in`, owner/creator `love`;
- repository `wrlds-creations/jumpyard-check-in`, managed by `cdk`;
- data classification `confidential`, exportable `true`, cost center `unassigned`.

## Explicitly Excluded

- AWS deploy, resource creation, secret change, Roller call, payment, redemption, webhook processing, or guest message
- wider venue/date scope, staging, or production environment creation
- API protection, production staff identity, booking seed/backfill, production webhook processing, and T-30 messaging
- kiosk, print/terminal, JumpyBoard, AirHive, or activity-data work

## Validation Evidence

The dependency-free `scripts/validate-t0190-safety-gates.js` executes the Lambda gate functions in an isolated VM with stubbed AWS clients. It proves:

- venue `50871` passes while wrong, missing, and unconfigured venue fail in lookup, add-on, and redeem;
- final Roller redeem normalization carries venue evidence;
- active or missing emergency-stop config blocks lookup, booking operations, staff access, messaging, webhook processing, and redeem even when all old override flags are on;
- releasing the stop still requires the exact narrow park-test mode; and
- dev behavior remains independently controlled by its normal base feature flags.

Local validation also includes TypeScript build, config guards, all dev/park-test synth profiles, repository validators, handler syntax checks, and `git diff --check`.

## Out-Of-Scope Finding

`FU-096` records a separate high-priority date-gate gap: new-booking quote/draft does not yet enforce the T0176 operating-date list, and add-on requests do not validate submitted item dates. T0190 does not silently widen into that fix.

## Result

T0190 is complete in the repository on 2026-07-10. No deployed runtime behavior changed, and the next ticket remains T0191 only after its own plain-language explanation and approval.
