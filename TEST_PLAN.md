# Test Plan

Use this file to define the tests required for the current project or milestone. Keep it specific to what was built. Leave irrelevant sections as `Not applicable` instead of deleting them.

## Test Scope

- Feature or milestone: `WRLDS workflow adoption`
- Date: 2026-05-18
- Tester: `Codex`
- Environments: Local repository
- Devices or browsers: Not applicable for workflow adoption

## Web

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Phone app smoke test | Main flow renders in browser. | `Not run` | Not changed in workflow adoption. |
| Kiosk app smoke test | Kiosk flow renders in browser. | `Not run` | Not changed in workflow adoption. |
| Admin app smoke test | Admin redemption surface renders in browser. | `Not run` | Not changed in workflow adoption. |

## Mobile

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Phone viewport check | Guest flow fits supported phone viewport. | `Not run` | Device/browser matrix is `TBD`. |

## Backend

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Mock client flow check | Mock clients return expected data for changed flow. | `Not run` | No backend changes in workflow adoption. |

## AWS Infrastructure

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Root AWS tag validation | `npm run validate:aws` passes. | `Passed` | Passed via `npm run validate` on 2026-05-18. |

## BLE And Hardware

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| BLE validation | Not applicable. | `Not applicable` | No BLE requirements currently scoped. |

## Data Flows

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Booking lookup flow | Lookup uses expected mock/real adapter behavior. | `Not run` | Real integration contract is `TBD`. |
| Admin redemption flow | Staff can redeem a completed check-in. | `Not run` | Admin auth and real API are `TBD`. |

## Manual Testing

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Root workflow docs review | Docs accurately describe current repo state and open questions. | `Not run` | Requires human project owner review. |

## Automated Testing

| Command | Purpose | Result | Notes |
|---|---|---|---|
| `npm run validate` | Validate workflow files, skills, and AWS tag references. | `Passed` | Passed on 2026-05-18. |
| `cd jumpyard-checkin-phone && npm run lint` | Phone lint. | `Not run` | Not changed in workflow adoption. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Kiosk lint. | `Not run` | Not changed in workflow adoption. |
| `cd jumpyard-checkin-admin && npm run lint` | Admin lint. | `Not run` | Not changed in workflow adoption. |

## Sign-Off

- Blocking issues: None known for workflow adoption.
- Non-blocking issues: Deployment, auth, integration, and PR validation questions remain open.
- Release recommendation: Workflow files can be reviewed independently from app changes.
