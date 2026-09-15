---
name: codex-repo-audit
description: Audit WRLDS repository instructions and workflow readiness when a workflow review or upgrade is requested.
---

# Repository workflow audit

Evaluate whether the actual repository supports its intended workflow. Check authority conflicts, unnecessary triggers, native skill discovery, current commands, task identity, module selection, completion evidence and upgrade safety. Use the configured GitHub repo and observed branch state rather than assuming the local folder is current mainline.

Inspect relevant instructions and validator implementation before interpreting a green check. Distinguish file existence, tested behavior and unverified operational claims. Check AWS only when applicable and preserve project-specific constraints.

Report prioritized findings with evidence and concrete corrections. A read-only audit does not authorize applying its recommendations.
