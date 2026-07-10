# JumpYard Check-in

JumpYard Check-in contains three Next.js apps for the JumpYard Next check-in flow:

- `jumpyard-checkin-phone/`: guest-facing phone flow for booking lookup, safety video, attestations, add-ons, payment handoff, QR/code presentation, and extension flows.
- `jumpyard-checkin-kiosk/`: in-park kiosk flow for check-in and handout support.
- `jumpyard-checkin-admin/`: staff PWA for redeeming completed check-ins and handing out wristbands, Connected bands, socks, and other physical items.

The current Sprint 3 ticket queue covers the phone app, the admin app, and their required JumpYard Cloud backend. The kiosk folder is maintained as a separate implementation workstream. JumpyBoard/AirHive and activity-data implementation belongs to a separate Connected Experience project/folder.

The complete Sprint 3 target also covers the background production chain: approved initial booking backfill, scheduled morning seed, Roller webhook updates and reconciliation, minimal normalized booking state in Aurora, and automatic SMS plus email with a secure check-in link 30 minutes before the selected booking time. These production capabilities are planned, not currently enabled by the park-test posture.

## WRLDS Workflow

This repository follows the WRLDS Codex workflow from `wrlds-template`.

- Start with `PROJECT_CONTEXT.md`, `DECISIONS.md`, and `REPO_CURRENT_STATE.md`.
- Scope implementation work in `CODEX_TASK.md`.
- Record out-of-scope issues in `FOLLOWUPS.md`.
- Use `AWS_RESOURCES.md` before AWS work.
- Use local `skills/` when a task matches a documented workflow.

## Commands

Run commands from the relevant app directory.

```bash
cd jumpyard-checkin-phone
npm install
npm run dev
npm run lint
npm run build
```

```bash
cd jumpyard-checkin-kiosk
npm install
npm run dev
npm run lint
npm run build
```

```bash
cd jumpyard-checkin-admin
npm install
npm run dev
npm run lint
npm run build
```

Full root workflow validation requires the infrastructure dependencies because the contact-lookup validator imports the deployed lookup handler:

```bash
npm --prefix infra install
npm run validate
```

The individual template, current-ticket, followup, history, skill, AWS-tag, and frontend-target validators use Node.js built-ins and can be run separately for documentation-only work.

JumpYard Cloud infrastructure validation:

```bash
npm install
npm --prefix infra install
npm run infra:check
npm run infra:synth
```

The `infra/` CDK app has deployed `dev` and `park-test` environments. `infra/config/dev.example.json` remains synth-only. Never deploy from the example config, and do not run any deploy without an active ticket, confirmed AWS identity/metadata, reviewed diff, and explicit approval.

## Deployment Notes

- `jumpyard-checkin-phone` is configured for static export with unoptimized images.
- `jumpyard-checkin-admin` is configured for static export and Cloudflare Pages.
- `jumpyard-checkin-kiosk` currently uses the default Next.js config.
- Dev and park-test Cloudflare Pages targets exist for phone/admin. Production phone/admin domains are planned in Sprint 3 and are not yet approved or deployed.
- Kiosk deployment is owned by the separate kiosk workstream.

## Project Documentation

- `PROJECT_CONTEXT.md`: confirmed project facts and open questions.
- `DECISIONS.md`: architecture, scope, data, security, deployment, and maintainability decisions.
- `REPO_CURRENT_STATE.md`: current repo snapshot, commands, validation status, and next recommended ticket.
- `CODEX_TASK.md`: one-ticket task brief.
- `FOLLOWUPS.md`: deferred issues and out-of-scope findings.
- `TEST_PLAN.md`: manual and automated test plan.
- `AWS_RESOURCES.md`: AWS inventory and required WRLDS metadata.
