# CODEX_TASK.md

## Ticket ID

`NO_ACTIVE_TICKET`

## Title

No Active Ticket

## Status

None

## Goal

Keep the repository in a clean handoff state after T0194. Explain T0195 in plain language and obtain Love's approval before activating implementation.

## Scope

- No implementation ticket is active.
- T0194 is complete and archived.
- T0195 remains planned and may start only after its required explanation and explicit approval.

## Allowed Areas

- None until a new ticket is explained, approved, and activated.

## Explicit Exclusions

- Any implementation, AWS mutation, deploy, Roller action, messaging, or scope expansion before the next ticket is approved.

## Validation Plan

- Before activating T0195, verify that source-of-truth files still show no active ticket and present its purpose, boundary, risk/cost, dependencies, verification, and remaining data/security decisions in plain language.

## Result

T0194 completed on 2026-07-14. Park-test ordinary staff now use personal six-digit PIN-only login with server-owned hash-only sessions, while administrators use Cognito password plus TOTP to create, reset, disable, and enable staff. Migration `0009`, the rotated PIN pepper, five Cognito/JWT resources, 26-route API, mobile-safe request-stable admin Pages build, guessing protection, role/venue authorization, reset-race credential revalidation, venue-isolated redeem lookup, named credential-free audit, logout, reset, duplicate/trivial-PIN rejection, disable/re-enable, and non-write redeem authorization are deployed and verified. A live second-login collision was corrected with row-locked transactional session replacement; repeated login, old-session replacement, denied disabled login, restored enabled login, and final logout all passed live. A separate activity-driven queue-request amplification was corrected with stable session keys, a persistent activity throttle, coalesced refreshes, stale-response suppression, and fast session-transition recovery. Love accepted the final deployed result and chose closeout without an additional post-fix manual traffic smoke. Detailed evidence is in `docs/t0194-staff-identity.md` and `docs/history/validation-log.md`. No production resource, automatic guest message, broad import, webhook processing, or real Roller write was introduced by T0194. No ticket is currently active.
