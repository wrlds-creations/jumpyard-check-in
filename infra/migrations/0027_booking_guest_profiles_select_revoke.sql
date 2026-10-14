-- GH-538: since #532 (D0260) an add-on reads its customer from ROLLER, and no booking Lambda statement
-- reads jumpyard.guest_profiles any more. Remove the SELECT that 0011 granted for the old contact query.
REVOKE SELECT ON jumpyard.guest_profiles FROM jumpyard_booking_runtime;
