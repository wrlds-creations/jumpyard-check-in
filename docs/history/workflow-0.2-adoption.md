# Workflow 0.2 adoption

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/406
Template: wrlds-creations/wrlds-template#8, candidate 0.2.0.
Base: 93ce93c893e896d12ec5d81b0670152b38ace3ba from origin/main.

## Audit and intended changes

Baseline instructions, skills, validators and constraints were inspected before migration. Preserve app code, dependencies, assets, release workflows, infrastructure, SDK pins, inventory values, decisions and history mappings. Move skills once into native discovery and retain inactive domain resources. Merge instruction entrypoints, resolver, workflow validation and issue/PR forms; preserve customized support files and stricter gates. The local preparation involved no secret reads or cloud/device actions.

## Validation

Executed local results follow below. The linked issue and PR carry live publication and CI evidence; review and integration are separate completion criteria.

## Final workflow evidence — 2026-09-15

- Structure/reference validation passed. Portable regression suite: 19 passed, 8 template-only cases skipped intentionally. Template suite: 27/27 passed.
- Actual online issue resolution and matching offline snapshot passed for this repository. Offline output explicitly states unverified current GitHub state.
- Fresh Codex app-server 0.154.0-alpha.6.2: 10 enabled repository skills; no load errors.
- YAML parsed with PyYAML 6.0.3; mandatory issue fields and the new read-only workflow job checked. Remote CI has not run.
- 547 tracked files outside reviewed workflow areas have no Git diff from the approved base; hashes recorded in workflow-0.2-preservation.json. Windows Git text normalization applies.
- Existing package manifests, locks, app/infra code and deployment workflows are unchanged. Historical decisions and gates remain searchable.

### Pilot scenarios

Manual routing/constraint review by the implementing agent: Merge creates a release artifact only. Nacka pilot-production, no rebuild, protected promotion, messaging/lifecycle gates preserved. T0198 validator follows the relocated collaboration skill.

Read-only fact lookup, bounded workflow repair, appropriate domain routing, offline continuation and hard boundaries were checked against baseline documents and actual tools. This is not an independent before/after model experiment. Native discovery does not prove automatic skill selection or quality gains; no speed or token reduction is claimed. No live cloud/device/credential operation was used as a pilot.

### Application validation and limits

Full npm run validate and npm run infra:check passed on 2026-09-15 after installing existing dependencies from unchanged lockfiles. Workflow/archive/migration checks pass, including repair of the pre-existing oversized-context/history gate.

Publication, CI, review, merge and any automatically triggered previews/production builds are still separate pending actions. Existing original checkouts remain untouched.

Archived AGENTS instructions use the filename AGENTS.before-workflow-0.2.md so historical text cannot become an active nested agent instruction.
