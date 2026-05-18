# Test Plan

Use this file to define validation for the current project or milestone.

## Automated Validation

| Command | Purpose | Result | Notes |
|---|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Passed | Passed on 2026-05-18. |
| `npm run roller:env:check` with safe env | Confirm Playground-looking config is accepted. | Passed | Passed with `ROLLER_ENV=playground` and `ROLLER_BASE_URL=https://api.playground.roller.app`; credentials omitted. |

## Manual Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Source-of-truth document review | A new Codex session can understand Sprint 1 scope and constraints without chat history. | Pending | Review root source-of-truth docs. |
| No app behavior change | Existing check-in app flow remains untouched. | Pending | Confirm changed files stay outside app source/UI. |

## Roller Playground Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Missing env values | `npm run roller:env:check` fails fast without logging secrets. | Passed | Failed as expected for missing `ROLLER_ENV` and `ROLLER_BASE_URL`. |
| Playground-looking base URL | `npm run roller:env:check` passes with `ROLLER_ENV=playground` and a URL containing `playground`. | Passed | Used `https://api.playground.roller.app`. |
| Production/live-looking base URL | `npm run roller:env:check` fails fast when URL contains production/live markers or lacks Playground marker. | Passed | `https://api.live.roller.app` was rejected. |
| Missing credentials behavior | Env validation passes with safe Playground config and missing client credentials, with warnings only. | Passed | T0001 does not require real Roller credentials. |

## Staff Handoff Validation

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Staff handoff flow | Staff can use a server-owned handoff code/session status. | Not started | Future ticket; no redeem logic in `T0001`. |
