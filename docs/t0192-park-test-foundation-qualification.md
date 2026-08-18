# T0192 Park-Test Foundation Qualification

> Current-role update, 2026-08-18: D0189/[issue #264](https://github.com/wrlds-creations/jumpyard-check-in/issues/264) keeps this qualified technical `park-test` foundation unchanged but approves it as Nacka's sharp pilot-production backend. References below to a later separate production backend are historical and are superseded for the single-park pilot. See [the current contract](gh-264-nacka-pilot-production.md).

## Plain-Language Outcome

The existing park-test environment is now qualified as the sole Live-backed pre-production foundation for the remaining Sprint 3 work. T0192 repaired the missing request-item date protection, deployed T0190's corrected master-stop and venue model as one coherent change, disabled an inapplicable Playground-only schedule, reconciled the repository with the already deployed CORS interface, and proved the resulting stack through live inventory, diff, deploy, readback, negative testing, rollback review, and drift detection.

This is a qualified pre-production foundation, not production approval. The current Nacka full-flow window remains deliberately available for the approved dates while webhook processing, broad imports, and JumpYard-owned guest SMS/email remain closed. T0193-T0204 still own the controls and rehearsal work required before T0205 may receive separate production approval.

## Implemented Hardening

### Request-item operating dates

`BookingHandler` now checks every submitted item date when T0176 full-flow is active:

- new-booking quote;
- new-booking draft/payment start;
- existing-booking add-on quote; and
- existing-booking add-on draft/payment start.

The check runs after normal request-shape validation but before AWS configuration reads, Roller calls, original-booking lookup, or idempotency reservation. Missing or malformed allowlist configuration fails closed with `t0176_full_flow_config_error`; any missing, malformed, mixed, or out-of-window item date blocks the complete request with `t0176_full_flow_item_date_not_allowed`.

The focused dependency-free validator proves both allowed and blocked cases across all four routes and confirms that non-full-flow park-test smokes and dev remain independently controlled.

### Playground-only daily sync

The existing `jumpyard-check-in-park-test-data-api-daily-sync` rule was enabled even though its Lambda accepts only Roller Playground configuration. Live evidence showed exactly three failed invocations per day because EventBridge retried the fail-closed configuration rejection twice. The data-sync error alarm entered `ALARM` shortly after 04:00 Stockholm time and returned to `OK` after the evaluation window every day reviewed.

T0192 now synthesizes this existing rule as:

- `ENABLED` for `roller.environment=playground`; and
- `DISABLED` for Live-backed park-test profiles.

No Live booking import had occurred through this rule. T0196 retains ownership of designing, approving, implementing, and enabling the real Live morning seed.

### Existing CORS interface reconciliation

The first live diff correctly stopped because the deployed API and deployed CloudFormation template contained the existing kiosk origin while repository park-test profiles did not. Removing that origin would have changed a separate workstream.

All park-test profiles now preserve the already deployed interface list:

- `https://jumpyard-check-in-park-test.pages.dev`;
- `https://jumpyard-checkin-admin-park-test.pages.dev`; and
- `https://jumpyard-check-in-kiosk.pages.dev`.

This is interface-contract preservation only. T0192 did not implement, deploy, or otherwise broaden kiosk functionality.

## AWS Qualification Evidence

| Check | Result |
|---|---|
| Identity | Account `376129878018`, region `eu-north-1`, SSO role session for Love |
| Stack | `jumpyard-check-in-park-test-stack`, `UPDATE_COMPLETE` |
| Inventory | 134 deployed resources and 134 synthesized resources; no incomplete resources |
| Drift | Post-deploy CloudFormation drift detection `IN_SYNC`, 0 drifted resources |
| Tags | 61 resources returned by Resource Groups Tagging API; 0 mismatches against all 10 required WRLDS tags |
| Aurora | Available, PostgreSQL `16.13`, encrypted, deletion protection on, Data API on, 7-day backup retention, snapshot tags copied, Serverless v2 `0.5-2.0` ACU |
| Secrets | Six environment-scoped secret references found; values were never read or printed |
| Alarms | 17 alarms present and all `OK` after deploy |
| Resource delta | No resource additions, removals, replacements, IAM changes, venue/date widening, webhook activation, or guest-send activation |
| Cost delta | No new persistent resource; disabling the erroneous schedule removes its recurring failed invocations |

Cost Explorer does not currently expose `WRLDS:Environment=park-test` as a usable cost-allocation tag, so the empty tagged cost query is not treated as evidence of zero cost. Cost attribution and budget ownership remain an explicit follow-up.

The CloudFormation stack itself has termination protection off. Aurora has deletion protection and retained data safeguards, but stack-level protection and immutable artifact rollback remain deployment-safety follow-up work.

## Reviewed Deploy

Command:

```powershell
npm --prefix infra run deploy:park-test-full-flow-rehearsal
```

The final reviewed change set updated existing resources only:

- `LookupHandler`, `BookingHandler`, `RedeemHandler`, `SessionHandler`, and `WebhookHandler`: reviewed code assets plus coherent `JUMPYARD_EMERGENCY_STOP=true -> false` transition;
- `DataSyncHandler`: the same coherent environment transition; and
- `DailyDataApiSyncRule`: `ENABLED -> DISABLED` plus corrected Playground-only description.

The stack reached `UPDATE_COMPLETE` at `2026-07-13T13:36:02Z`. The post-deploy full-flow CDK diff reported no differences.

## Runtime Readback

Readback confirmed:

- booking: master stop released, draft/payment/add-on/full-flow gates on, exact venue `50871`, and 94 allowed dates from `2026-06-29` through `2026-09-30`;
- lookup: assisted lookup and post-payment refresh on for the same dates/venue; narrower historical smoke/settlement modes off;
- redeem: write/full-flow gates on for the same dates/venue; historical redeem smoke off;
- session: staff/full-flow on, frontend-only mode off, guest sends off;
- webhook processing off;
- daily data sync rule disabled;
- all three existing API CORS origins preserved; and
- all 17 alarms still `OK`.

A deployed negative quote using item date `2026-10-01` returned HTTP `403` and `t0176_full_flow_item_date_not_allowed`. The gate executes before Roller configuration/token access, so this proof created no Roller booking, quote, draft, payment, redemption, webhook, import, SMS, email, or Aurora write.

## Rollback Evidence

The containment rollback remains:

```powershell
npm --prefix infra run deploy:park-test
```

The normal profile synthesizes the same 134 resources, keeps the daily sync rule disabled and existing CORS origins intact, sets the master stop to `true`, and turns booking drafts, assisted lookup, post-payment refresh, staff auth, redeem writes, full-flow, webhook processing, and guest sends off. Its live template diff contains only those expected Lambda environment transitions; it adds, removes, or replaces no resource.

This is a tested containment/config rollback path. Versioned artifact promotion and previous-code rollback remain T0198 work.

## Remaining Scoped Work

- T0193: route and abuse protection.
- T0194: production-intent personal staff identity.
- T0195: retention, least privilege, secret rotation, backup/restore policy.
- T0196: approved Live initial backfill and scheduled morning seed.
- T0197: webhook processing and reconciliation.
- T0198: controlled artifact delivery and code rollback.
- T0199: production domain readiness without traffic cutover.
- T0200-T0202: sender readiness, automatic T-30 delivery, alarm routing, and operations.
- T0203: remaining approved phone/admin feedback closeout.
- T0204: complete pre-production rehearsal and GO/NO-GO.
- T0205: separately approved production foundation and cutover only after GO.

## Result

T0192 is complete on 2026-07-13. Park-test is qualified to receive the next scoped Sprint 3 ticket, with no new AWS resource and no production, Roller-write smoke, webhook, message, Cloudflare, DNS, or broader venue/date change introduced by this ticket.
