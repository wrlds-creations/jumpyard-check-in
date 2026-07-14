# GitHub Project Migration - 2026-07-14

## Purpose

This one-time record maps the reconciled Markdown queue and follow-up ledger to the private [JumpYard Check-in Project](https://github.com/orgs/wrlds-creations/projects/5). GitHub Project drafts and repository issues are now the operational source of truth. This file is historical evidence and ID mapping, not a second backlog.

Migration issue: [#192](https://github.com/wrlds-creations/jumpyard-check-in/issues/192)

Template reference: `wrlds-creations/wrlds-template@954c66cd311b`

Source mainline: `775804f` after merged PR #191

GitHub issue #192 and legacy ticket T0192 are unrelated. The `#` and `T` prefixes must always be preserved.

## Reconciliation Summary

| Measure | Count |
|---|---:|
| Completed legacy tickets reviewed but not migrated | 192 |
| Open legacy `FU-*` rows reconciled | 47 |
| Remaining Sprint/production-readiness outcomes migrated | 11 |
| Independent later/parked outcomes migrated | 18 |
| Unapproved Project drafts created | 29 |
| Approved migration issue added to the Project | 1 |
| Initial Project items after migration | 30 |
| Canonical durable external gates retained in repository docs | 7 |
| Legacy follow-ups archived during migration | 2 |

The 47 open follow-ups reconcile as follows: 18 became independent drafts; 19 were folded into the 11 Sprint/production-readiness drafts; eight legacy IDs are represented by seven canonical external gates; `FU-092` was archived as completed by T0169; and `FU-099` was completed by this migration. Every follow-up ID has exactly one canonical disposition. Other drafts express dependencies through their outcome text rather than claiming the same Legacy ID.

## Draft Mapping

| Legacy references | Project draft | Status | Priority | Work type | Track | Owner | Project item ID |
|---|---|---|---|---|---|---|---|
| `T0195, FU-021, FU-058` | [Apply data retention, secret rotation, backup and restore](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979564) | Backlog | P1 | Implementation | Cross-cutting | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz2w` |
| `T0196, FU-013, FU-015, FU-022` | [Build the booking index and scheduled morning seed](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979658) | Blocked | P1 | Implementation | Cloud/API | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyxz8o` |
| `T0197, FU-020, FU-032` | [Prove Roller webhook processing and reconciliation](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979656) | Blocked | P1 | Implementation | Cloud/API | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyxz8g` |
| `T0198, FU-059, FU-091, FU-095` | [Add controlled CI/CD and versioned rollback](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979657) | Blocked | P1 | Implementation | Operations | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyxz8k` |
| `T0199, FU-057` | [Prepare production domains, TLS, CORS and routing](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979662) | Blocked | P1 | Implementation | Operations | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz84` |
| `T0200, FU-070` | [Prepare production-capable SMS and email senders](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979659) | Blocked | P1 | Implementation | Operations | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz8s` |
| `T0201, FU-049` | [Send automatic T-30 check-in links](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979674) | Blocked | P1 | Implementation | Cloud/API | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyxz9o` |
| `T0202, FU-056, FU-068, FU-098` | [Add monitoring and production-intent operations](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979677) | Blocked | P1 | Implementation | Operations | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz90` |
| `T0203` | [Close remaining approved phone/admin feedback](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979681) | Blocked | P2 | UI/UX | Cross-cutting | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz-E` |
| `T0204, FU-060, FU-088` | [Rehearse the full park-test chain and decide GO/NO-GO](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979683) | Blocked | P1 | Rehearsal | Cross-cutting | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz-M` |
| `T0205, FU-055` | [Create production and execute controlled cutover](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979679) | Blocked | P1 | Release | Cross-cutting | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz98` |
| `TBD-02, FU-010` | [Decide which Roller products must be ticket/session products](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979698) | Backlog | P1 | Decision | Cloud/API | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz_I` |
| `TBD-03, FU-011` | [Confirm Roller redemption response cases](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979916) | Backlog | P2 | Investigation | Cloud/API | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0Mw` |
| `TBD-05, FU-014` | [Define availability display for jump-entry products](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979696) | Backlog | P2 | Decision | Phone | Shared | `PVTI_lADOBXiXg84BdXuJzgyxz_A` |
| `TBD-07, FU-018` | [Resolve the aws-cdk brace-expansion advisory](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979700) | Backlog | P2 | Maintenance | Operations | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyxz_Q` |
| `TBD-11, FU-026` | [Add an already-redeemed Playground seed scenario](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979703) | Backlog | P2 | Implementation | Cloud/API | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyxz_c` |
| `TBD-12, FU-027` | [Replace the temporary phone operating-date fallback](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979930) | Backlog | P1 | Implementation | Cross-cutting | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0No` |
| `TBD-13, FU-029` | [Decide whether to ingest gift-card state](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979947) | Backlog | P3 | Decision | Cloud/API | Shared | `PVTI_lADOBXiXg84BdXuJzgyx0Os` |
| `TBD-16, FU-035` | [Decide whether to send a Roller redemption device name](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979956) | Backlog | P2 | Decision | Cloud/API | Shared | `PVTI_lADOBXiXg84BdXuJzgyx0PQ` |
| `TBD-17, FU-037` | [Define check-in session expiry, resume and cleanup](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979969) | Backlog | P2 | Decision | Cloud/API | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0QE` |
| `TBD-18, FU-038` | [Define the safety-completion gate before redeem](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979978) | Backlog | P1 | Decision | Cross-cutting | Love | `PVTI_lADOBXiXg84BdXuJzgyx0Qo` |
| `TBD-19, FU-041` | [Replace raw handoff session IDs with short-lived proof](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212979992) | Backlog | P1 | Implementation | Cross-cutting | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0Rg` |
| `TBD-20, FU-043` | [Upgrade the phone framework security baseline](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212980002) | Backlog | P1 | Maintenance | Phone | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0SI` |
| `TBD-21, FU-086` | [Resolve the phone QR dependency advisories](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212980013) | Backlog | P2 | Maintenance | Phone | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0S0` |
| `TBD-22, FU-044` | [Move phone add-on mappings to a server-owned catalog](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212980032) | Backlog | P1 | Implementation | Cloud/API | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0UA` |
| `TBD-26, FU-051` | [Persist payment redirect and 3DS return state](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212980050) | Backlog | P1 | Investigation | Phone | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0VI` |
| `Park-05, FU-066` | [Choose a reliable post-redeem verification source](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212980070) | Parked | P2 | Decision | Cross-cutting | Shared | `PVTI_lADOBXiXg84BdXuJzgyx0WY` |
| `Park-12, FU-084` | [Polish phone summary icons and copy](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212980094) | Parked | P2 | UI/UX | Phone | Shared | `PVTI_lADOBXiXg84BdXuJzgyx0X4` |
| `FU-093` | [Rename ticket-numbered runtime gates](https://github.com/orgs/wrlds-creations/projects/5?pane=issue&itemId=212980120) | Parked | P2 | Maintenance | Operations | WRLDS | `PVTI_lADOBXiXg84BdXuJzgyx0Zg` |

Each draft body preserves the desired outcome, context, dependencies, risk, scope boundary, validation expectation, external gates, explicit unapproved state, legacy references, and migration source.

## Reconciled Legacy Rows Without Independent Drafts

| Legacy reference | Disposition |
|---|---|
| `TBD-01, FU-009` | Retained as durable external Gate-01 because Roller/Josh/Joao/Pabel evidence is required before implementation scope exists. |
| `TBD-04, FU-013` | Folded into the booking-index/morning-seed and complete-rehearsal drafts; no duplicate item created. |
| `FU-045, FU-063, FU-069` | Retained as three durable sender/provider gates and referenced by the sender-readiness draft. |
| `Park-09, FU-071, FU-094` | Reconciled into one durable payment-method/Apple Pay external gate. |
| `Park-10, FU-072` | Retained as the Adyen postal-code UX external gate. |
| `Park-11, FU-081` | Retained as the multi-visit product/V1 behavior external gate; it depends on the separate technical source evidence but owns a product decision. |
| `FU-092` | Archived as completed by T0169's implemented and Live-proven draft-backed post-payment sync. |
| `FU-099` | Archived as completed by issue #192 after stale owners were reconciled: FU-066/FU-084 became drafts, FU-088 joined the rehearsal draft, and FU-092 was archived. |

## Durable External Gates

| Gate | Legacy references | Owner | Disposition |
|---|---|---|---|
| Roller remaining-balance API evidence | `Gate-01, FU-009` | Josh / Joao / Pabel | Technical source-contract gate: obtain provider evidence for an authoritative Nacka remaining-balance API/fixture; never infer or locally calculate it. |
| SMS production access and consent inputs | `Gate-02, FU-045` | Love / AWS Support | Keep until volume, countries, copy, consent, opt-out/support, sender goal, public URL, and support-request approval exist. |
| SES production domain and sending access | `Gate-03, FU-063` | Love / AWS Support / DNS owner | Keep until final from-domain/address, DNS, production access, and deliverability ownership exist. |
| SMS Sender ID/display approval | `Gate-04, FU-069` | Love / AWS Support | Keep until provider approval/setup and handset display are confirmed. |
| Payment-method enablement and Apple Pay failure evidence | `Gate-05, Park-09, FU-071, FU-094` | Pabel / Roller / Adyen | Keep until Swish/Apple Pay coexistence and the merchant-validation/session failure are explained; card remains fallback. |
| Adyen postal-code UX decision | `Gate-06, Park-10, FU-072` | Pabel / Roller | Keep until Roller/Adyen confirms whether Swedish postal-code collection can or should change. |
| Multi-visit product and V1 behavior approval | `Gate-07, Park-11, FU-081` | Love / JumpYard / Josh / Joao / Pabel | Product-boundary gate after technical source evidence: approve whether code-only validation is permanent V1 behavior; never display remaining visits before approval and an authoritative source. |

## Duplicate And Coverage Check

- All 29 draft titles are unique and the Project contains exactly 29 drafts plus issue #192.
- All drafts contain Status, Priority, Work Type, Track, Owner, and Legacy ID values.
- The 47 open follow-up rows are fully accounted for by draft fields, durable gates, or archive entries.
- Each of the 47 formerly open follow-up IDs has exactly one canonical owner: one draft, one durable gate, or one archive row. Dependent outcomes do not duplicate Legacy ID ownership.
- No completed ticket was converted into a GitHub Issue or Project draft.
- Historical commits and legacy IDs were not rewritten or renumbered.
