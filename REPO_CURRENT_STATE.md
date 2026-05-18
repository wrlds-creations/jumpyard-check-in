# Repo Current State

Use this file as the living snapshot of what actually exists in the repository. Update it after completed tickets, audits, meaningful dependency changes, or workflow changes.

## Snapshot

- Date: 2026-05-18
- Current branch: `main` in the local workspace at the time the workflow files were added.
- Current phase: Prototype / MVP validation.
- Last completed ticket: Adopt WRLDS Codex workflow files.
- Next recommended ticket: Decide and document deployment strategy for phone and kiosk.

## Completed Tickets

| Ticket | Summary | Completed On | Notes |
|---|---|---|---|
| `workflow-adoption` | Added WRLDS Codex workflow files, validation scripts, relevant local skills, root project documentation, and project-specific phone/kiosk READMEs. | 2026-05-18 | App behavior intentionally unchanged. |

## Current Structure

```text
.
|-- jumpyard-checkin-phone/
|   |-- src/app/
|   |-- src/components/
|   |-- src/context/
|   |-- src/flow/
|   |-- public/
|   |-- package.json
|   `-- next.config.ts
|-- jumpyard-checkin-kiosk/
|   |-- src/app/
|   |-- src/components/
|   |-- src/context/
|   |-- src/flow/
|   |-- public/
|   |-- package.json
|   `-- next.config.ts
|-- jumpyard-checkin-admin/
|   |-- src/app/
|   |-- src/lib/
|   |-- public/
|   |-- package.json
|   `-- next.config.ts
|-- skills/
|-- references/
|-- scripts/
|-- .github/
|-- AGENTS.md
|-- PROJECT_CONTEXT.md
|-- DECISIONS.md
|-- CODEX_TASK.md
|-- REPO_CURRENT_STATE.md
|-- FOLLOWUPS.md
|-- TEST_PLAN.md
`-- AWS_RESOURCES.md
```

## Dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| `next` | App framework | Phone/kiosk use `16.0.8`; admin uses `^16.2.4`. |
| `react`, `react-dom` | UI runtime | All apps use React `19.2.1`. |
| `tailwindcss`, `@tailwindcss/postcss` | Styling | All apps use Tailwind CSS 4. |
| `framer-motion` | UI animation | Used in all apps. |
| `lucide-react` | Icons | Used in all apps. |
| `@zxing/browser` | Browser scanning | Admin app only. |
| `concurrently` | Dev tunnel helper | Phone and admin app dev scripts. |

## Scripts And Commands

| Command | Purpose | Last Known Result |
|---|---|---|
| `npm run validate` | Validate root WRLDS workflow files and skills. | Passed on 2026-05-18. |
| `cd jumpyard-checkin-phone && npm run lint` | Lint phone app. | Not run for workflow adoption. |
| `cd jumpyard-checkin-phone && npm run build` | Build/export phone app. | Not run for workflow adoption. |
| `cd jumpyard-checkin-kiosk && npm run lint` | Lint kiosk app. | Not run for workflow adoption. |
| `cd jumpyard-checkin-kiosk && npm run build` | Build kiosk app. | Not run for workflow adoption. |
| `cd jumpyard-checkin-admin && npm run lint` | Lint admin app. | Not run for workflow adoption. |
| `cd jumpyard-checkin-admin && npm run build` | Build/export admin app. | Not run for workflow adoption. |

## Validation Status

- Build: Not run for app directories during workflow adoption.
- Tests: No dedicated test suite documented.
- Lint: Not run for app directories during workflow adoption.
- Root workflow validation: Passed on 2026-05-18 with `npm run validate`.
- Manual verification: Not performed for app UI during workflow adoption.

## Known Issues Summary

- Phone and kiosk Dockerfiles expect `.next/standalone`, but phone uses static export and kiosk does not currently set `output: "standalone"`.
- Real JumpYard/JY Cloud integration contracts are not documented.
- Staff admin authentication requirements are not documented.

## Open Questions

- What deployment target should phone and kiosk use?
- Should this repo become an npm workspace, or remain three independent app directories?
- Which app validation commands should PRs run by default?
