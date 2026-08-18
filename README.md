# JumpYard Check-in

JumpYard Check-in contains three Next.js apps for the JumpYard Next check-in flow:

- `jumpyard-checkin-phone/`: guest-facing phone flow for booking lookup, safety video, attestations, add-ons, payment handoff, QR/code presentation, and extension flows.
- `jumpyard-checkin-kiosk/`: in-park kiosk flow for check-in and handout support.
- `jumpyard-checkin-admin/`: staff PWA for redeeming completed check-ins and handing out wristbands, Connected bands, socks, and other physical items.

The current Sprint 3 workstream covers the phone app, the admin app, and their required JumpYard Cloud backend. Operational planning lives in the private [JumpYard Check-in GitHub Project](https://github.com/orgs/wrlds-creations/projects/5). The kiosk folder is maintained as a separate implementation workstream. JumpyBoard/AirHive and activity-data implementation belongs to a separate Connected Experience project/folder.

The complete Sprint 3 target also covers the background pilot-production chain: approved initial booking backfill, scheduled morning seed, Roller webhook updates and reconciliation, minimal normalized booking state in Aurora, and a separately gated transactional email with a secure check-in link 30 minutes before the selected booking time. The existing technically named `park-test` backend is Nacka's approved pilot production; general guest messaging remains closed.

## WRLDS Workflow

This repository follows the GitHub-native WRLDS Codex workflow from `wrlds-template@954c66cd311b`.

```text
Project draft issue -> approved repository issue -> branch -> PR -> main
```

- GitHub Project drafts own unapproved ideas and follow-ups.
- GitHub Issues own approved implementation scope.
- GitHub Project fields own priority, status, work type, track, and owner.
- New branches use `codex/gh-<issue-number>-<slug>`.
- `CODEX_TASK.md` is a static resolver that loads the issue from the branch name.
- Repository Markdown owns durable project facts, decisions, external gates, guardrails, and useful legacy history.
- Use `AWS_RESOURCES.md` and `skills/aws-project-infrastructure/` before AWS work.
- Use `references/github-collaboration-workflow.md` and `skills/github-collaboration/` for Project, issue, branch, PR, migration, or integration work.
- Local development stays local. Reviewed `main` commits automatically create immutable Park artifacts but deploy nothing. A read-only plan and protected approval precede Park verification and the separate public Nacka phone/admin promotion; rollback never rebuilds.

New work does not receive a manual `T####` ID. Existing T/FU/TBD/Gate IDs remain legacy references in the migration record and history.

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

The `infra/` CDK app has deployed `dev` and `park-test` environments. `infra/config/dev.example.json` remains synth-only. Never deploy from the example config. Park-test routine releases use `.github/workflows/release.yml` and `.github/workflows/deploy-park-test.yml`; direct local CDK/Wrangler commands are emergency-only and require a separately explicit approved Issue.

## Deployment Notes

- `jumpyard-checkin-phone` is configured for static export with unoptimized images.
- `jumpyard-checkin-admin` is configured for static export and Cloudflare Pages.
- `jumpyard-checkin-kiosk` currently uses the default Next.js config.
- Dev and Park-test Cloudflare Pages targets exist for phone/admin. T0199 created the public Pages projects for `checkin.jumpyard.se` and `staff-checkin.jumpyard.se`; DNS/TLS are active, the guest origin serves an earlier selected Park artifact, and the first staff artifact is pending. Both public origins use the existing Park API under issue #264. See [the Nacka pilot-production contract](docs/gh-264-nacka-pilot-production.md).
- Kiosk deployment is owned by the separate kiosk workstream.
- Park verification release and rollback instructions are in `docs/t0198-controlled-cicd.md`; the same immutable outputs have a separate protected public phone/admin promotion. New multi-park infrastructure is deliberately absent.

## Project Documentation

- `PROJECT_CONTEXT.md`: confirmed project facts and open questions.
- `DECISIONS.md`: architecture, scope, data, security, deployment, and maintainability decisions.
- `REPO_CURRENT_STATE.md`: latest merged mainline snapshot and known validation state, not active branch progress.
- `CODEX_TASK.md`: static GitHub issue resolver.
- `FOLLOWUPS.md`: policy and durable external-gate pointer; operational follow-ups are Project drafts.
- `TEST_PLAN.md`: manual and automated test plan.
- `AWS_RESOURCES.md`: AWS inventory and required WRLDS metadata.
- `config/production-domains.json`: canonical Nacka pilot-production web-domain and Park-backend contract.
- `docs/roadmap/backlog.md`: linked Project policy, durable guardrails, external gates, and migration pointer.
- `docs/history/`: completed legacy tickets, validation evidence, resolved follow-ups, and the one-time Project migration record.
