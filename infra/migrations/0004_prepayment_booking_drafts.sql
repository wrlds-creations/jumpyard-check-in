CREATE TABLE IF NOT EXISTS jumpyard.prepayment_booking_drafts (
  prepayment_draft_id text PRIMARY KEY,
  roller_draft_unique_id text UNIQUE,
  roller_capacity_reservation_id text,
  external_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'payment_pending',
  roller_env text NOT NULL,
  booking_date date,
  start_time time,
  total_cents integer,
  amount_owing_cents integer,
  currency text,
  customer_email text,
  customer_email_hash text,
  customer_email_masked text,
  customer_phone text,
  customer_phone_hash text,
  customer_phone_masked text,
  item_count integer NOT NULL DEFAULT 0,
  items_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_jwt_present boolean NOT NULL DEFAULT false,
  payment_config_available boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prepayment_booking_drafts_status_check CHECK (
    status IN (
      'payment_pending',
      'payment_blocked',
      'published',
      'cancelled',
      'expired',
      'failed'
    )
  ),
  CONSTRAINT prepayment_booking_drafts_total_nonnegative CHECK (total_cents IS NULL OR total_cents >= 0),
  CONSTRAINT prepayment_booking_drafts_amount_owing_nonnegative CHECK (amount_owing_cents IS NULL OR amount_owing_cents >= 0),
  CONSTRAINT prepayment_booking_drafts_items_array_check CHECK (jsonb_typeof(items_summary) = 'array')
);

CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_status_idx ON jumpyard.prepayment_booking_drafts (status);
CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_booking_date_start_idx ON jumpyard.prepayment_booking_drafts (booking_date, start_time);
CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_customer_email_hash_idx ON jumpyard.prepayment_booking_drafts (customer_email_hash);
CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_customer_phone_hash_idx ON jumpyard.prepayment_booking_drafts (customer_phone_hash);
CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_created_at_idx ON jumpyard.prepayment_booking_drafts (created_at);
