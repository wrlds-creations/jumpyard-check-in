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

## Current Repository Shape

- `jumpyard-checkin-phone/`: guest-facing phone check-in web app.
- `jumpyard-checkin-kiosk/`: in-park kiosk check-in web app.
- `jumpyard-checkin-admin/`: staff PWA for redemption and handoff workflows.

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
| What exact Roller Playground credentials and API scopes are available? | Needed for T0001 connectivity spike. | `TBD` | `Open` |
| Where will the JumpYard Cloud/server API run during Sprint 1? | Determines local/server architecture and deployment path. | `TBD` | `Open` |
| Which booking lookup fields should the check-in app use first? | Defines the first Roller integration contract. | `TBD` | `Open` |
