# Test Plan

Use this file to define active validation for the current project or milestone. Historical validation evidence was moved to [docs/history/validation-log.md](docs/history/validation-log.md) during T0128.

## Current Root Validation

| Command | Purpose | Expected Result |
|---|---|---|
| `node scripts/validate-current-ticket.js` | Confirm `CODEX_TASK.md` and `REPO_CURRENT_STATE.md` agree on active ticket state. | Passes locally without network access. |
| `node scripts/validate-followups.js` | Confirm active followups have no duplicate FU ids and no closed rows under `## Open Followups`. | Passes locally without network access. |
| `node scripts/validate-history-archives.js` | Confirm required history/backlog archives exist, are linked from active docs, and preserve completed-ticket history safely. | Passes locally without network access. |
| `node scripts/validate-t0177-contact-lookup.js` | Confirm T0177 identifier inference, phone normalization, same-day scoping, and nearest-upcoming match selection. | Passes locally without network access. |
| `node scripts/validate-t0192-request-item-dates.js` | Confirm all full-flow new-booking and add-on quote/draft routes reject missing, malformed, mixed, or out-of-window request-item dates before AWS, Roller, or idempotency side effects. | Passes locally without network or AWS access. |
| `node scripts/validate-t0193-api-protection.js` | Synthesize and verify the exact 21-route auth/trust/rate catalog, dependencies, metadata, resource count, and absence of unapproved edge resources. | Passes locally without AWS mutation. |
| `node scripts/validate-t0193-capacity.js` | Prove the shared-IP 120-guests/20-minutes and two-second arrival-burst model has no false throttles while abuse is bounded and route-isolated. | Passes deterministically without network traffic. |
| `node scripts/validate-t0193-guest-access.js` | Verify hash-only booking-bound guest proof, lifetime/cap/cooldown/link reuse, phone propagation/URL cleanup/retry, and protected session/add-on paths. | Passes locally without real guest data or downstream writes. |
| `node scripts/validate-t0193-payload-limits.js` | Verify decoded plain/base64 payload ceilings for all five handlers before AWS/network work. | Passes locally; API routes return 413 and webhook intake preserves safe acknowledgement. |
| `node scripts/validate-t0193-service-auth.js` | Verify IAM catalog plus internal, legacy, staff, webhook, expired-token, and safe-correlation application boundaries. | Passes locally without AWS/network writes. |
| `npm run validate` | Run root workflow/current-ticket/followup/history/tag checks plus T0193 capacity, guest, payload, and service-auth regression. | Passes locally without changing AWS, Roller, credentials, SMS, or email. |
| `git diff --check` | Check the current working diff for whitespace errors. | Passes; CRLF conversion warnings are acceptable if the command exits 0. |

## Application Validation

For T0193 application/infrastructure regression, use `npm run infra:check`, a phone production build with the park-test API target, phone `npx tsc --noEmit`, scoped phone lint, and the non-write deployed checks recorded in [docs/t0193-api-protection.md](docs/t0193-api-protection.md). Broader Roller write, payment, redeem, SMS, and email evidence remains in the relevant runbooks and historical validation log; do not repeat real writes without a separately approved ticket.
