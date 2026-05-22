CREATE TABLE IF NOT EXISTS jumpyard.sms_deliveries (
  sms_delivery_id text PRIMARY KEY,
  roller_unique_id text REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE SET NULL,
  booking_reference text,
  token_hash text REFERENCES jumpyard.checkin_tokens (token_hash) ON DELETE SET NULL,
  provider text NOT NULL,
  destination_hash text,
  destination_masked text,
  message_template text NOT NULL DEFAULT 'checkin_link_v1',
  status text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  provider_message_id text,
  error_code text,
  error_summary text,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_deliveries_status_check CHECK (status IN ('planned', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS sms_deliveries_roller_unique_id_idx ON jumpyard.sms_deliveries (roller_unique_id);
CREATE INDEX IF NOT EXISTS sms_deliveries_booking_reference_idx ON jumpyard.sms_deliveries (booking_reference);
CREATE INDEX IF NOT EXISTS sms_deliveries_token_hash_idx ON jumpyard.sms_deliveries (token_hash);
CREATE INDEX IF NOT EXISTS sms_deliveries_status_idx ON jumpyard.sms_deliveries (status);
CREATE INDEX IF NOT EXISTS sms_deliveries_created_at_idx ON jumpyard.sms_deliveries (created_at);
