ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD COLUMN IF NOT EXISTS payment_channel text NOT NULL DEFAULT 'ecommerce',
  ADD COLUMN IF NOT EXISTS payment_attempt_id text,
  ADD COLUMN IF NOT EXISTS payment_attempt_status text;

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_payment_channel_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_payment_channel_check CHECK (
    payment_channel IN ('ecommerce', 'card_present')
  );

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_payment_attempt_status_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_payment_attempt_status_check CHECK (
    payment_attempt_status IS NULL
    OR payment_attempt_status IN ('created', 'approved', 'failed', 'cancelled', 'unknown', 'reconciled')
  );

CREATE UNIQUE INDEX IF NOT EXISTS prepayment_booking_drafts_payment_attempt_id_idx
  ON jumpyard.prepayment_booking_drafts (payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;
