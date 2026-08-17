ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD COLUMN IF NOT EXISTS booking_confirmation_status text,
  ADD COLUMN IF NOT EXISTS roller_booking_reference text,
  ADD COLUMN IF NOT EXISTS payment_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconciliation_last_result text,
  ADD COLUMN IF NOT EXISTS publish_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_http_status integer;

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_booking_confirmation_status_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_booking_confirmation_status_check CHECK (
    booking_confirmation_status IS NULL
    OR booking_confirmation_status IN ('pending', 'confirmed', 'failed', 'needs_staff')
  );

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_reconciliation_attempt_count_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_reconciliation_attempt_count_check CHECK (
    reconciliation_attempt_count >= 0
  );

CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_confirmation_pending_idx
  ON jumpyard.prepayment_booking_drafts (booking_confirmation_status, reconciliation_started_at)
  WHERE payment_channel = 'card_present'
    AND booking_confirmation_status IN ('pending', 'needs_staff');
