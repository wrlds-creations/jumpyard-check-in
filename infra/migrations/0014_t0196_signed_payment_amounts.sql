-- T0196: Roller uses negative payment amounts for refunds/credits. Preserve the
-- signed operational amount instead of rejecting or misrepresenting it.

ALTER TABLE jumpyard.roller_booking_payments
DROP CONSTRAINT IF EXISTS roller_booking_payments_amount_nonnegative;
