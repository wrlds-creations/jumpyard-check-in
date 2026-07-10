# CODEX_TASK.md

## Ticket ID

`NO_ACTIVE_TICKET`

## Title

No active ticket

## Status

None

## Goal

T0190 is complete in the repository. The venue boundary now fails closed and the emergency stop is an unconditional master breaker, with focused behavioral validation.

## Scope

- No implementation or documentation ticket is active.
- Explain T0191 to Love in plain language and obtain approval before activating it.
- Do not deploy T0190 or change the current park-test runtime posture without separate explicit approval and a reviewed coherent code-and-config diff.

## Allowed Areas

- None until the next ticket is explained, approved, and activated.

## Validation Plan

- Define ticket-specific validation when T0191 is activated.

## Result

T0190 made missing, wrong, and unconfigured venue fail closed across park-test lookup, existing-booking add-on, and redeem; persisted authoritative venue during final Roller redeem refresh; made active or missing emergency-stop config block booking operations, park-test lookup, staff access, confirmed redeem, webhook processing, and real guest sends; and preserved the separate narrow approval/allowlist/date/venue gates after the stop is released. Normal closed source config remains stopped while reviewed active profiles release the stop explicitly. No AWS deploy/resource, Roller call/write, payment, redemption, webhook processing, guest message, Cloudflare change, or running app behavior occurred. FU-096 records the separate request-item date-gate finding.
