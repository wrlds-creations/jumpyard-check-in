---
name: wrlds-skill-creator
description: Create or revise reusable WRLDS skills with precise triggers and project-specific operational knowledge.
---

# WRLDS skill authoring

Use the built-in skill-creator for general authoring when available. Add WRLDS-specific knowledge that changes decisions: real contracts, workflow boundaries and tested resources. Avoid duplicating the built-in manual or generic coding advice.

- Use a distinct lowercase hyphenated name and matching folder. Active repo skills live in .agents/skills.
- Put the capability and actual trigger in the description. Do not list every tool, implementation step or adjacent domain.
- Describe outcomes and constraints; prescribe a sequence only for a concrete correctness or safety dependency.
- Route to substantial conditional references. A simple skill does not need more files.
- Preserve existing metadata and invocation policy. agents/openai.yaml is optional; when present its prompt must use the correct skill name.
- Retain exact protocol and operational invariants. Existing authorization remains valid; a skill does not independently authorize unrelated external actions.

See [structure guidance](references/skill-structure.md) when packaging resources. Run the workflow skill validator and meaningful script checks. Try representative matching and nonmatching requests; passing frontmatter checks does not prove routing quality.
