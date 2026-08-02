-- GitHub issue #212: Roller may report a negative booking-level amount owing
-- for a paid booking. Preserve that signed authoritative value instead of
-- rejecting the complete webhook snapshot or misrepresenting it as zero.

ALTER TABLE jumpyard.roller_bookings
DROP CONSTRAINT IF EXISTS roller_bookings_amount_owing_nonnegative;
