# T0151 Park-Test Database Migrations

## Summary

T0151 applied the existing committed SQL migrations in `infra/migrations/` to the dedicated park-test Aurora database.

Target:

- AWS account: `376129878018`
- AWS region: `eu-north-1`
- Environment: `park-test`
- Stack: `jumpyard-check-in-park-test-stack`
- Cluster: `jumpyard-check-in-park-test-aurora`
- Database: `jumpyard_cloud`
- Resource ARN: `arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora`
- Secret metadata used: `/jumpyard-check-in-park-test/aurora/admin`

No secret values were printed.

## Scope Boundary

T0151 did not populate Roller Live credentials, call Roller Live, run imports, connect frontend traffic, register webhooks, create drafts or payments, redeem tickets, send SMS, send email, change app behavior, or change dev database state.

Dev database access in this ticket was read-only verification of `jumpyard.schema_migrations`.

## Preflight

- `aws sts get-caller-identity --profile wrlds-dev --output json` confirmed account `376129878018` and assumed role `AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love`.
- `jumpyard-check-in-park-test-stack` was `CREATE_COMPLETE`.
- `jumpyard-check-in-dev-stack` was `UPDATE_COMPLETE`.
- Park-test Aurora was `available`, engine `aurora-postgresql 16.13`, database `jumpyard_cloud`, encrypted, deletion-protected, and Data API enabled.
- Park-test stack tags matched the required WRLDS metadata:
  - `WRLDS:Client=JumpYard`
  - `WRLDS:Project=jumpyard-check-in`
  - `WRLDS:Environment=park-test`
  - `WRLDS:Owner=love`
  - `WRLDS:Repository=wrlds-creations/jumpyard-check-in`
  - `WRLDS:ManagedBy=cdk`
  - `WRLDS:DataClassification=confidential`
  - `WRLDS:Exportable=true`
  - `WRLDS:CostCenter=unassigned`
  - `WRLDS:CreatedBy=love`
- Before migration, park-test had `0` `jumpyard` schemas and `0` `jumpyard` tables.
- Before migration, dev had migrations `0001` through `0008` applied.

## Migration Command

Run from `infra/`:

```powershell
npx ts-node --prefer-ts-exts scripts/run-migrations.ts --config ./config/park-test.json --profile wrlds-dev
```

Result: all pending migrations applied successfully.

| Version | Name | Result |
|---|---|---|
| `0001` | `initial schema` | Applied |
| `0002` | `related data sources` | Applied |
| `0003` | `checkin sessions` | Applied |
| `0004` | `prepayment booking drafts` | Applied |
| `0005` | `add product draft links` | Applied |
| `0006` | `sms deliveries` | Applied |
| `0007` | `email deliveries` | Applied |
| `0008` | `prepayment draft customer names` | Applied |

## Verification

Migration status:

```powershell
npx ts-node --prefer-ts-exts scripts/run-migrations.ts --config ./config/park-test.json --profile wrlds-dev --status
```

Result: `0001` through `0008` were `applied`.

Read-only Aurora Data API checks confirmed:

- Park-test `jumpyard.schema_migrations` contains the same `0001` through `0008` versions and checksums as dev.
- Park-test has 19 `jumpyard` tables:
  - `booking_links`
  - `booking_seed_runs`
  - `checkin_attempts`
  - `checkin_sessions`
  - `checkin_tokens`
  - `email_deliveries`
  - `event_log`
  - `guest_profiles`
  - `handoff_sessions`
  - `idempotency_records`
  - `prepayment_booking_drafts`
  - `product_catalog_cache`
  - `roller_booking_items`
  - `roller_booking_payments`
  - `roller_booking_tickets`
  - `roller_bookings`
  - `roller_webhook_events`
  - `schema_migrations`
  - `sms_deliveries`
- `prepayment_booking_drafts` includes the `customer_first_name` and `customer_last_name` columns from migration `0008`.
- Park-test row counts remained `0` for `roller_bookings`, `guest_profiles`, `prepayment_booking_drafts`, and `roller_webhook_events`.
- Dev `jumpyard.schema_migrations` remained `0001` through `0008` with the same checksums before and after T0151.
- Park-test Aurora remained `available` after migration.

## Rollback Notes

There is no ticket-scoped SQL down-migration path. Because park-test still has no frontend traffic, no Roller Live credentials, no Live calls, no webhooks, and no visitor data, the safest rollback before Live gates open is to stop future park-test gates, restore the park-test Aurora cluster from an RDS snapshot or point-in-time recovery, or recreate the park-test database and rerun the committed migrations.

Do not manually edit dev or reuse dev database resources for rollback.

## Next Step

Proceed to T0152 for separate park-test secret references and explicit live-write gates. T0152 must still not print secret values, call Roller Live, or perform Live writes.
