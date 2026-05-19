# Project Context

This file is the living project memory for JumpYard Next. Confirmed facts belong here. Unknowns remain `TBD`.

## Project Identity

- Project name: `JumpYard Next`
- Repository: `wrlds-creations/jumpyard-check-in`
- Current application: Existing JumpYard check-in app suite.
- Current phase: `Sprint 1`

## Sprint 1 Focus

Sprint 1 focuses on connecting the existing check-in app to Roller Playground through a server-side layer.

The target architecture is:

```text
check-in app -> JumpYard Cloud/server API -> Roller API
```

## Architecture Principles

- Roller is the source of truth for bookings.
- JumpYard Cloud/server API owns pilot operational state such as safety status, handoff code, and session status.
- The frontend must not call Roller directly in the real architecture.
- Roller credentials must stay server-side.
- Server-side integration should provide controlled logging, retries, error handling, and fallbacks.
- Roller integration must fail closed unless it is explicitly configured for Playground.

## Current Repository Shape

- `jumpyard-checkin-phone/`: guest-facing phone check-in web app.
- `jumpyard-checkin-kiosk/`: in-park kiosk check-in web app.
- `jumpyard-checkin-admin/`: staff PWA for redemption and handoff workflows.

## Delivery Workflow

- Work proceeds one ticket at a time.
- Each ticket should use a dedicated `codex/` branch.
- Local commits are made only when explicitly requested and belong to the current ticket branch.
- `main` is updated through a review/merge step, not by direct commits or direct pushes.
- Ticket commits should include only files that belong to the current ticket.

## Known Stack

- TypeScript
- Next.js
- React
- Tailwind CSS
- npm per app directory

## Current Data Ownership Model

- Booking data: Roller.
- Safety status: JumpYard Cloud/server API.
- Handoff code: JumpYard Cloud/server API.
- Session status: JumpYard Cloud/server API.
- Payment, redemption, and additional operational state: `TBD`

## Roller Playground Configuration

- `ROLLER_ENV` must be `playground`.
- `ROLLER_BASE_URL` must clearly point to a Playground environment. ROLLER's documented Playground base URL is `https://api.play.roller.app`.
- Production/live-looking Roller URLs must be rejected before any client is created.
- `ROLLER_CLIENT_ID` and `ROLLER_CLIENT_SECRET` are optional for basic environment validation during T0001.
- Roller secrets must never be logged or committed.

## Roller Smoke Test

- `npm run roller:smoke` loads local `.env` values and reuses the Playground environment guard.
- The smoke test obtains a short-lived OAuth token through the server-side Roller client and then makes one read-only smoke request.
- The default read endpoint path is `/products`; override with `ROLLER_SMOKE_PATH` only if Roller confirms a different harmless read path.
- The script reports status and response shape only; it does not print credentials, access tokens, or full Roller response payloads.

## Non-Goals For Current Ticket

- Do not implement Roller API calls.
- Do not create backend endpoints.
- Do not create AWS resources.
- Do not modify app functionality.
- Do not add payment logic.
- Do not add redeem logic.

## Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| What exact Roller Playground credentials and API scopes are available? | Needed for T0002 credential smoke test. | `TBD` | `Open` |
| Where will the JumpYard Cloud/server API run during Sprint 1? | Determines local/server architecture and deployment path. | `TBD` | `Open` |
| Which booking lookup fields should the check-in app use first? | Defines the first Roller integration contract. | `TBD` | `Open` |
| What is the confirmed safest Roller read endpoint for smoke tests? | The script defaults to `/products`, but Roller endpoint shape should be confirmed from authenticated docs. | `TBD` | `Open` |
