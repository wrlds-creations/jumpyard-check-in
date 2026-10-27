-- GH-598: the T0195 lifecycle statements pick their candidates with FOR UPDATE SKIP LOCKED.
-- PostgreSQL requires UPDATE privilege on at least one column of every row-locked table, and the
-- lifecycle role only held DELETE on these eleven tables, so every apply failed with
-- "permission denied" and rolled back. One column per table is enough for the row lock. The
-- lifecycle SQL never updates these columns; each is either overwritten by its writer or read by
-- no runtime decision. Forward-only; no row is changed.

GRANT UPDATE (product_hash) ON jumpyard.product_catalog_cache TO jumpyard_lifecycle_runtime;
GRANT UPDATE (created_at) ON jumpyard.checkin_tokens TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.idempotency_records TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.staff_pin_auth_limits TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.guest_profiles TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.handoff_sessions TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.roller_booking_tickets TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.roller_booking_payments TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.checkin_sessions TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.roller_booking_items TO jumpyard_lifecycle_runtime;
GRANT UPDATE (updated_at) ON jumpyard.roller_bookings TO jumpyard_lifecycle_runtime;
