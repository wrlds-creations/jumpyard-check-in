-- T0196: PostgreSQL ON CONFLICT needs SELECT on target columns that participate
-- in conflict detection or a conflict condition. Keep this narrower than a
-- table-level SELECT so the data-sync principal cannot browse related-data rows.

GRANT SELECT (ticket_id)
ON jumpyard.roller_booking_tickets
TO jumpyard_data_sync_runtime;

GRANT SELECT (payment_key)
ON jumpyard.roller_booking_payments
TO jumpyard_data_sync_runtime;

GRANT SELECT (guest_profile_id, last_seen_from_roller_at)
ON jumpyard.guest_profiles
TO jumpyard_data_sync_runtime;
