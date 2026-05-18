# Project Context

This file is the living project memory for Codex and WRLDS. Confirmed facts belong here. Unknowns remain `TBD`; do not replace them with assumptions from chat history.

## Project Identity

- Project name: `JumpYard Check-in`
- Repository: `wrlds-creations/jumpyard-check-in`
- Client-facing name: `JumpYard Next Check-in`
- Internal codename: `JumpYard Check-in`
- Project type: `Web app suite`
- Current phase: `Prototype / MVP validation`

## Client And Billing Metadata

- Client: `JumpYard`
- Billing entity: `TBD`
- Cost center: `JumpYard`
- WRLDS owner: `TBD`
- Client owner: `TBD`
- Commercial model: `TBD`

## Business Objective

- Primary objective: Support faster JumpYard guest check-in across phone, kiosk, and staff redemption workflows.
- Success metrics: `TBD`
- Business risks: Integration with real JumpYard/JY Cloud systems, device/browser reliability in parks, and operational handoff accuracy.

## Users And Roles

- Primary users: JumpYard guests using phone or kiosk check-in.
- Admin users: JumpYard staff redeeming completed check-ins and handing out physical items.
- Internal WRLDS users: Product and engineering team members building and validating the flow.
- External stakeholders: JumpYard product and operations stakeholders.
- Role permissions summary: Guest flows are unauthenticated in the current prototype; staff admin auth is `TBD`.

## Scope

- In scope: Phone check-in app, kiosk check-in app, staff admin redemption PWA, mock flow clients, static assets, and local validation workflow.
- Current milestone scope: MVP/prototype UX and flow validation.
- Future scope: Real booking, payment, wristband, Connected band, and JY Cloud integrations.

## Non-Goals

- Explicit non-goals: Native mobile apps, React Native, BLE firmware, and production AWS infrastructure unless added through a scoped ticket.
- Out-of-scope platforms or workflows: `TBD`

## Product Requirements

- Core user flows: Booking lookup, buy tickets, booking summary, safety video, safety attestations, SkyRider attestation, add-ons, payment, QR/code presentation, success/print handoff, extension flow, and staff redemption.
- Required screens or surfaces: Phone app, kiosk app, admin app.
- Performance requirements: `TBD`
- Offline requirements: `TBD`
- Accessibility requirements: `TBD`

## Technical Stack

- Languages: TypeScript, TSX, CSS.
- Frameworks: Next.js 16, React 19, Tailwind CSS 4.
- Package manager: npm with per-app `package-lock.json` files.
- Runtime versions: Node.js 20 is used in existing Dockerfiles; local required version is `TBD`.
- Architecture notes: Three separate Next.js apps in one repository, each with its own package manifest and build scripts.

## Frontend

- Frontend type: Next.js App Router web apps.
- Platforms: Browser-based phone, kiosk, and staff/admin surfaces.
- UI system: Custom JumpYard-branded components using Tailwind CSS, framer-motion, and lucide-react.
- Navigation model: Flow-state driven screens in `src/flow` and `src/components` for phone/kiosk; single admin surface for staff redemption.
- Design source: Existing in-repo implementation and JumpYard brand assets; external design source is `TBD`.

## Backend

- Backend type: Mock/local adapters in the current repo.
- API style: `TBD`
- Services: `src/flow/mockClient.ts` for phone/kiosk and `src/lib/adminApi.ts` for admin.
- Background jobs: `TBD`
- Local development approach: Run the relevant Next.js app with `npm run dev` from its app directory.

## AWS Account And Environments

- AWS account owner: `TBD`
- AWS account ID: `TBD`
- Regions: `TBD`
- Environments: `local`, with `development`, `staging`, and `production` still `TBD`
- Deployment model: Admin app currently documents Cloudflare Pages; phone/kiosk deployment model is `TBD`.
- Required WRLDS tags: See `AWS_RESOURCES.md` and `references/aws-tagging-standard.md`.

## Data Model

- Main entities: Booking, guest/profile, add-on, waiver/safety attestation, payment handoff, redemption/handout item.
- Data ownership: `TBD`
- Data retention: `TBD`
- Data import/export requirements: `TBD`

## Auth And Permissions

- Auth provider: `TBD`
- Sign-in methods: `TBD`
- Roles: Guest and staff/admin.
- Permission boundaries: Staff redemption permissions are `TBD`.
- Account lifecycle: `TBD`

## Hardware And Sensors

- Hardware involved: Kiosk devices and staff scanning device/browser are expected; exact hardware is `TBD`.
- Sensor protocols: QR/barcode scanning for admin uses `@zxing/browser`.
- BLE requirements: Not applicable unless later scoped.
- Firmware assumptions: Not applicable.
- Calibration requirements: Not applicable.

## External Integrations

- APIs: Real JumpYard/JY Cloud booking, payment, and redemption APIs are `TBD`.
- Webhooks: `TBD`
- Third-party services: Cloudflare tunnel is available for phone/admin dev scripts; Cloudflare Pages is documented for admin.
- Credentials and secret handling: No secrets should be committed; real credential handling is `TBD`.

## Analytics And Tracking

- Analytics tools: `TBD`
- Events to track: `TBD`
- Privacy constraints: `TBD`
- Reporting requirements: `TBD`

## Commands

Run commands from each app directory.

| Area | Install | Development | Test | Lint | Build | Deploy |
|---|---|---|---|---|---|---|
| Phone | `npm install` | `npm run dev` | `TBD` | `npm run lint` | `npm run build` | `TBD` |
| Kiosk | `npm install` | `npm run dev` | `TBD` | `npm run lint` | `npm run build` | `TBD` |
| Admin | `npm install` | `npm run dev` | `TBD` | `npm run lint` | `npm run build` | Cloudflare Pages, details `TBD` |
| Root workflow | No install required | Not applicable | `TBD` | Not applicable | Not applicable | Not applicable |

## Environments

- Local: Per-app Next.js dev servers.
- Development: `TBD`
- Staging: `TBD`
- Production: `TBD`

## Definition Of Done

- Functional criteria: Ticket acceptance criteria pass for the relevant app flow.
- Review criteria: Small, reviewable diff; unrelated work recorded in `FOLLOWUPS.md`.
- Validation criteria: Relevant lint/build/manual checks run or explicitly marked not run.
- Documentation criteria: Update project context, decisions, repo state, AWS resources, or followups when facts change.

## Testing Requirements

- Automated tests: No dedicated test suite is currently documented.
- Manual tests: Verify affected phone, kiosk, or admin flow in browser.
- Device or browser coverage: Phone viewport, kiosk viewport, and staff/admin browser coverage are `TBD`.
- Infrastructure validation: Use `npm run validate` for workflow files; AWS validation is required before AWS work.

## Security And Privacy

- Data classification: Expected `confidential` once real customer/booking data is integrated; currently `TBD`.
- Secrets handling: Do not commit secrets; use environment-specific secret handling when integrations are added.
- PII or sensitive data: Booking and guest data may include PII when real integrations are added.
- Compliance considerations: `TBD`

## Cost And Billing Considerations

- Cost constraints: `TBD`
- Expected AWS cost drivers: `TBD`
- Budget alerts: `TBD`
- Exportability requirements: `TBD`

## Open Questions

| Question | Why It Matters | Owner | Status |
|---|---|---|---|
| What are the production deployment targets for phone and kiosk? | Affects build config, Docker/static export strategy, and CI/CD. | `TBD` | `Open` |
| Which real JumpYard/JY Cloud APIs replace the mock clients? | Determines data contracts, auth, error handling, and test strategy. | `TBD` | `Open` |
| What staff authentication model is required for admin redemption? | Affects security, permissions, and deployment readiness. | `TBD` | `Open` |
| Which browsers/devices must be supported in parks? | Affects kiosk/phone QA and UI constraints. | `TBD` | `Open` |
