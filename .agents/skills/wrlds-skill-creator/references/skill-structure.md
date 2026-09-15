# WRLDS skill packaging

Active repository skills belong in .agents/skills/<name>. Optional module catalogs remain under modules/<module>/.agents/skills until selected for a project. Module packages mirror repository-relative paths so their internal references survive installation.

Use a short capability/trigger description and only the resources that improve the actual workflow. Keep detailed reference knowledge outside the entrypoint. agents/openai.yaml is optional metadata; retain existing fields and keep the invocation name aligned when renaming.

Run node scripts/wrlds/validate.js in the repository and test any executable helper. Use matching and nonmatching requests to review routing, and inspect native discovery in a fresh session when changing placement. Avoid word-count thresholds and tests that merely repeat generated wording.
