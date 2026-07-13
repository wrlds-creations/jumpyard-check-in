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
| `npm run validate` | Run root workflow, current-ticket, followup, history-archive, skill, and AWS tag validators. | Passes locally without changing AWS, Roller, app behavior, credentials, SMS, or email. |
| `git diff --check` | Check the current working diff for whitespace errors. | Passes; CRLF conversion warnings are acceptable if the command exits 0. |

## Application Validation

Phone, admin, kiosk, backend, AWS, Roller, payment, SMS, and email validation commands remain documented in the relevant source-of-truth runbooks and historical evidence. T0128 is documentation/tooling-only and does not require app builds or deployed smokes unless a later scoped ticket changes application behavior.
