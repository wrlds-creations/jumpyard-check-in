ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD COLUMN IF NOT EXISTS flow_type text NOT NULL DEFAULT 'new_booking',
  ADD COLUMN IF NOT EXISTS original_booking_reference text,
  ADD COLUMN IF NOT EXISTS original_roller_unique_id text,
  ADD COLUMN IF NOT EXISTS add_on_group_id text;

ALTER TABLE jumpyard.prepayment_booking_drafts
  DROP CONSTRAINT IF EXISTS prepayment_booking_drafts_flow_type_check;

ALTER TABLE jumpyard.prepayment_booking_drafts
  ADD CONSTRAINT prepayment_booking_drafts_flow_type_check CHECK (
    flow_type IN ('new_booking', 'add_product')
  );

CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_flow_type_idx
  ON jumpyard.prepayment_booking_drafts (flow_type);

CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_original_booking_reference_idx
  ON jumpyard.prepayment_booking_drafts (original_booking_reference);

CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_original_roller_unique_id_idx
  ON jumpyard.prepayment_booking_drafts (original_roller_unique_id);

CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_add_on_group_id_idx
  ON jumpyard.prepayment_booking_drafts (add_on_group_id);
