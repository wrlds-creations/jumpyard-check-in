-- T0195: handler-specific login roles. Passwords are deliberately absent here.
-- The retained Secrets Manager credentials are bound by the deploy-time custom
-- resource only after this migration has completed successfully.

REVOKE ALL PRIVILEGES ON SCHEMA jumpyard FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE jumpyard_cloud FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA jumpyard FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA jumpyard FROM PUBLIC;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'jumpyard_booking_runtime',
    'jumpyard_data_sync_runtime',
    'jumpyard_lookup_runtime',
    'jumpyard_lifecycle_runtime',
    'jumpyard_redeem_runtime',
    'jumpyard_session_runtime',
    'jumpyard_webhook_runtime'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL',
        role_name
      );
    ELSE
      EXECUTE format(
        'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
        role_name
      );
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA jumpyard FROM %I', role_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA jumpyard FROM %I', role_name);
    EXECUTE format('GRANT CONNECT ON DATABASE jumpyard_cloud TO %I', role_name);
    EXECUTE format('GRANT USAGE ON SCHEMA jumpyard TO %I', role_name);
  END LOOP;
END
$$;

GRANT SELECT ON
  jumpyard.roller_bookings,
  jumpyard.roller_booking_tickets,
  jumpyard.prepayment_booking_drafts,
  jumpyard.guest_profiles,
  jumpyard.product_catalog_cache,
  jumpyard.checkin_tokens,
  jumpyard.idempotency_records
TO jumpyard_booking_runtime;
GRANT INSERT, UPDATE ON jumpyard.prepayment_booking_drafts, jumpyard.idempotency_records
TO jumpyard_booking_runtime;
GRANT INSERT ON jumpyard.booking_links, jumpyard.event_log
TO jumpyard_booking_runtime;

GRANT SELECT, INSERT, UPDATE ON
  jumpyard.booking_seed_runs,
  jumpyard.roller_bookings,
  jumpyard.roller_booking_items,
  jumpyard.product_catalog_cache
TO jumpyard_data_sync_runtime;
GRANT INSERT, UPDATE ON
  jumpyard.roller_booking_tickets,
  jumpyard.roller_booking_payments,
  jumpyard.guest_profiles
TO jumpyard_data_sync_runtime;

GRANT SELECT, INSERT, UPDATE ON
  jumpyard.roller_bookings,
  jumpyard.roller_booking_items,
  jumpyard.roller_booking_tickets
TO jumpyard_lookup_runtime;
GRANT SELECT ON jumpyard.product_catalog_cache TO jumpyard_lookup_runtime;
GRANT SELECT, UPDATE ON jumpyard.prepayment_booking_drafts, jumpyard.booking_links
TO jumpyard_lookup_runtime;
GRANT SELECT, INSERT, DELETE ON jumpyard.checkin_tokens TO jumpyard_lookup_runtime;
GRANT INSERT ON jumpyard.event_log TO jumpyard_lookup_runtime;

GRANT SELECT ON
  jumpyard.checkin_sessions,
  jumpyard.roller_bookings,
  jumpyard.roller_booking_items,
  jumpyard.roller_booking_tickets,
  jumpyard.product_catalog_cache,
  jumpyard.staff_identities,
  jumpyard.staff_auth_sessions,
  jumpyard.idempotency_records
TO jumpyard_redeem_runtime;
GRANT INSERT, UPDATE ON
  jumpyard.roller_bookings,
  jumpyard.roller_booking_items,
  jumpyard.roller_booking_tickets,
  jumpyard.idempotency_records
TO jumpyard_redeem_runtime;
GRANT UPDATE ON jumpyard.checkin_sessions, jumpyard.staff_auth_sessions
TO jumpyard_redeem_runtime;
GRANT INSERT ON jumpyard.checkin_attempts, jumpyard.event_log
TO jumpyard_redeem_runtime;

GRANT SELECT ON
  jumpyard.roller_bookings,
  jumpyard.roller_booking_items,
  jumpyard.roller_booking_tickets,
  jumpyard.product_catalog_cache,
  jumpyard.guest_profiles,
  jumpyard.prepayment_booking_drafts,
  jumpyard.booking_links,
  jumpyard.checkin_sessions,
  jumpyard.checkin_tokens,
  jumpyard.sms_deliveries,
  jumpyard.email_deliveries,
  jumpyard.idempotency_records,
  jumpyard.staff_identities,
  jumpyard.staff_auth_sessions,
  jumpyard.staff_pin_auth_limits
TO jumpyard_session_runtime;
GRANT INSERT, UPDATE ON
  jumpyard.checkin_sessions,
  jumpyard.checkin_tokens,
  jumpyard.idempotency_records,
  jumpyard.staff_identities,
  jumpyard.staff_auth_sessions,
  jumpyard.staff_pin_auth_limits
TO jumpyard_session_runtime;
GRANT INSERT ON jumpyard.sms_deliveries, jumpyard.email_deliveries, jumpyard.event_log
TO jumpyard_session_runtime;

GRANT SELECT, INSERT, UPDATE ON
  jumpyard.roller_webhook_events,
  jumpyard.roller_bookings,
  jumpyard.roller_booking_items,
  jumpyard.roller_booking_tickets,
  jumpyard.guest_profiles,
  jumpyard.prepayment_booking_drafts,
  jumpyard.booking_links
TO jumpyard_webhook_runtime;
GRANT INSERT ON jumpyard.event_log TO jumpyard_webhook_runtime;

GRANT SELECT ON
  jumpyard.product_catalog_cache,
  jumpyard.checkin_tokens,
  jumpyard.idempotency_records,
  jumpyard.staff_auth_sessions,
  jumpyard.staff_pin_auth_limits,
  jumpyard.prepayment_booking_drafts,
  jumpyard.guest_profiles,
  jumpyard.handoff_sessions,
  jumpyard.roller_booking_tickets,
  jumpyard.roller_booking_payments,
  jumpyard.checkin_sessions,
  jumpyard.roller_booking_items,
  jumpyard.roller_bookings,
  jumpyard.staff_identities,
  jumpyard.checkin_attempts,
  jumpyard.sms_deliveries,
  jumpyard.email_deliveries,
  jumpyard.roller_webhook_events,
  jumpyard.booking_seed_runs,
  jumpyard.booking_links,
  jumpyard.event_log,
  jumpyard.data_lifecycle_runs
TO jumpyard_lifecycle_runtime;
GRANT DELETE ON
  jumpyard.product_catalog_cache,
  jumpyard.checkin_tokens,
  jumpyard.idempotency_records,
  jumpyard.staff_auth_sessions,
  jumpyard.staff_pin_auth_limits,
  jumpyard.prepayment_booking_drafts,
  jumpyard.guest_profiles,
  jumpyard.handoff_sessions,
  jumpyard.roller_booking_tickets,
  jumpyard.roller_booking_payments,
  jumpyard.checkin_sessions,
  jumpyard.roller_booking_items,
  jumpyard.roller_bookings,
  jumpyard.checkin_attempts,
  jumpyard.sms_deliveries,
  jumpyard.email_deliveries,
  jumpyard.roller_webhook_events,
  jumpyard.booking_seed_runs,
  jumpyard.booking_links,
  jumpyard.event_log,
  jumpyard.data_lifecycle_runs
TO jumpyard_lifecycle_runtime;
GRANT UPDATE ON
  jumpyard.prepayment_booking_drafts,
  jumpyard.checkin_attempts,
  jumpyard.sms_deliveries,
  jumpyard.email_deliveries,
  jumpyard.roller_webhook_events,
  jumpyard.booking_seed_runs,
  jumpyard.booking_links,
  jumpyard.event_log,
  jumpyard.staff_identities,
  jumpyard.staff_auth_sessions,
  jumpyard.data_lifecycle_runs
TO jumpyard_lifecycle_runtime;
GRANT INSERT ON jumpyard.data_lifecycle_runs TO jumpyard_lifecycle_runtime;

-- Explicit denied surfaces: runtime roles receive no schema_migrations or
-- data_lifecycle_runs privileges, no CREATE on the schema, and no role/database
-- administration capability. Future migrations must extend only the role that
-- owns a new table operation.
