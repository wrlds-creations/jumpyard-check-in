CREATE TABLE IF NOT EXISTS jumpyard.roller_bookings (
  roller_unique_id text PRIMARY KEY,
  booking_reference text NOT NULL UNIQUE,
  roller_env text NOT NULL,
  venue_id text,
  booking_status text,
  payment_status text,
  amount_owing_cents integer,
  total_cents integer,
  currency text,
  booking_date date,
  start_time time,
  end_time time,
  source_last_updated_by text NOT NULL DEFAULT 'unknown',
  source_last_updated_at timestamptz NOT NULL DEFAULT now(),
  roller_modified_at timestamptz,
  last_seen_from_roller_at timestamptz,
  freshness_status text NOT NULL DEFAULT 'stale',
  is_tombstoned boolean NOT NULL DEFAULT false,
  payload_hash text,
  normalized_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roller_bookings_freshness_status_check CHECK (freshness_status IN ('fresh', 'stale', 'missing', 'conflict')),
  CONSTRAINT roller_bookings_amount_owing_nonnegative CHECK (amount_owing_cents IS NULL OR amount_owing_cents >= 0),
  CONSTRAINT roller_bookings_total_nonnegative CHECK (total_cents IS NULL OR total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS roller_bookings_booking_date_idx ON jumpyard.roller_bookings (booking_date);
CREATE INDEX IF NOT EXISTS roller_bookings_payment_status_idx ON jumpyard.roller_bookings (payment_status);
CREATE INDEX IF NOT EXISTS roller_bookings_last_seen_idx ON jumpyard.roller_bookings (last_seen_from_roller_at);
CREATE INDEX IF NOT EXISTS roller_bookings_freshness_status_idx ON jumpyard.roller_bookings (freshness_status);
CREATE INDEX IF NOT EXISTS roller_bookings_roller_modified_idx ON jumpyard.roller_bookings (roller_modified_at);
CREATE INDEX IF NOT EXISTS roller_bookings_source_last_updated_idx ON jumpyard.roller_bookings (source_last_updated_at);
CREATE INDEX IF NOT EXISTS roller_bookings_tombstoned_idx ON jumpyard.roller_bookings (is_tombstoned);

CREATE TABLE IF NOT EXISTS jumpyard.roller_booking_items (
  booking_item_key text PRIMARY KEY,
  roller_unique_id text NOT NULL REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE CASCADE,
  booking_item_id text,
  product_id text,
  parent_product_id text,
  product_name text,
  parent_product_name text,
  quantity integer NOT NULL DEFAULT 1,
  booking_date date,
  start_time time,
  end_time time,
  item_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roller_booking_items_quantity_positive CHECK (quantity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS roller_booking_items_booking_item_id_unique_idx ON jumpyard.roller_booking_items (booking_item_id) WHERE booking_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS roller_booking_items_roller_unique_id_idx ON jumpyard.roller_booking_items (roller_unique_id);
CREATE INDEX IF NOT EXISTS roller_booking_items_product_id_idx ON jumpyard.roller_booking_items (product_id);
CREATE INDEX IF NOT EXISTS roller_booking_items_booking_date_start_idx ON jumpyard.roller_booking_items (booking_date, start_time);

CREATE TABLE IF NOT EXISTS jumpyard.roller_booking_tickets (
  ticket_id text PRIMARY KEY,
  roller_unique_id text NOT NULL REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE CASCADE,
  booking_item_key text REFERENCES jumpyard.roller_booking_items (booking_item_key) ON DELETE SET NULL,
  booking_item_id text,
  ticket_holder_name_masked text,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  membership_status text,
  redeem_status_last_seen text,
  last_seen_from_roller_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roller_booking_tickets_roller_unique_id_idx ON jumpyard.roller_booking_tickets (roller_unique_id);
CREATE INDEX IF NOT EXISTS roller_booking_tickets_booking_item_id_idx ON jumpyard.roller_booking_tickets (booking_item_id);
CREATE INDEX IF NOT EXISTS roller_booking_tickets_redeem_status_idx ON jumpyard.roller_booking_tickets (redeem_status_last_seen);

CREATE TABLE IF NOT EXISTS jumpyard.roller_booking_payments (
  payment_key text PRIMARY KEY,
  roller_unique_id text NOT NULL REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE CASCADE,
  booking_payment_id text,
  payment_method text,
  payment_status text,
  amount_cents integer,
  currency text,
  created_date timestamptz,
  payment_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roller_booking_payments_amount_nonnegative CHECK (amount_cents IS NULL OR amount_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS roller_booking_payments_booking_payment_id_unique_idx ON jumpyard.roller_booking_payments (booking_payment_id) WHERE booking_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS roller_booking_payments_roller_unique_id_idx ON jumpyard.roller_booking_payments (roller_unique_id);
CREATE INDEX IF NOT EXISTS roller_booking_payments_payment_status_idx ON jumpyard.roller_booking_payments (payment_status);

CREATE TABLE IF NOT EXISTS jumpyard.guest_profiles (
  guest_profile_id text PRIMARY KEY,
  roller_customer_id text UNIQUE,
  email_hash text,
  email_masked text,
  contact_number_hash text,
  contact_number_masked text,
  sms_ready boolean NOT NULL DEFAULT false,
  latest_booking_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_from_roller_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_profiles_email_hash_idx ON jumpyard.guest_profiles (email_hash);
CREATE INDEX IF NOT EXISTS guest_profiles_contact_number_hash_idx ON jumpyard.guest_profiles (contact_number_hash);
CREATE INDEX IF NOT EXISTS guest_profiles_sms_ready_idx ON jumpyard.guest_profiles (sms_ready);

CREATE TABLE IF NOT EXISTS jumpyard.checkin_tokens (
  token_hash text PRIMARY KEY,
  roller_unique_id text REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE SET NULL,
  channel text NOT NULL,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  opened_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkin_tokens_roller_unique_id_idx ON jumpyard.checkin_tokens (roller_unique_id);
CREATE INDEX IF NOT EXISTS checkin_tokens_expires_at_idx ON jumpyard.checkin_tokens (expires_at);

CREATE TABLE IF NOT EXISTS jumpyard.checkin_attempts (
  attempt_id text PRIMARY KEY,
  correlation_id text NOT NULL,
  roller_unique_id text REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE SET NULL,
  booking_reference text,
  selected_ticket_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL,
  error_code text,
  roller_response_ref text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkin_attempts_correlation_id_idx ON jumpyard.checkin_attempts (correlation_id);
CREATE INDEX IF NOT EXISTS checkin_attempts_roller_unique_id_idx ON jumpyard.checkin_attempts (roller_unique_id);
CREATE INDEX IF NOT EXISTS checkin_attempts_booking_reference_idx ON jumpyard.checkin_attempts (booking_reference);
CREATE INDEX IF NOT EXISTS checkin_attempts_created_at_idx ON jumpyard.checkin_attempts (created_at);

CREATE TABLE IF NOT EXISTS jumpyard.handoff_sessions (
  handoff_code text PRIMARY KEY,
  roller_unique_id text REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE SET NULL,
  booking_reference text,
  safety_status text NOT NULL DEFAULT 'unknown',
  staff_status text NOT NULL DEFAULT 'pending',
  band_pairing_status text NOT NULL DEFAULT 'not_started',
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS handoff_sessions_roller_unique_id_idx ON jumpyard.handoff_sessions (roller_unique_id);
CREATE INDEX IF NOT EXISTS handoff_sessions_booking_reference_idx ON jumpyard.handoff_sessions (booking_reference);
CREATE INDEX IF NOT EXISTS handoff_sessions_expires_at_idx ON jumpyard.handoff_sessions (expires_at);

CREATE TABLE IF NOT EXISTS jumpyard.booking_links (
  link_id text PRIMARY KEY,
  link_type text NOT NULL,
  original_roller_unique_id text NOT NULL,
  original_booking_reference text,
  linked_roller_unique_id text NOT NULL,
  linked_booking_reference text,
  add_on_group_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_links_original_roller_unique_id_idx ON jumpyard.booking_links (original_roller_unique_id);
CREATE INDEX IF NOT EXISTS booking_links_linked_roller_unique_id_idx ON jumpyard.booking_links (linked_roller_unique_id);
CREATE INDEX IF NOT EXISTS booking_links_add_on_group_id_idx ON jumpyard.booking_links (add_on_group_id);

CREATE TABLE IF NOT EXISTS jumpyard.idempotency_records (
  idempotency_key text PRIMARY KEY,
  operation text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL,
  result_ref text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idempotency_records_operation_idx ON jumpyard.idempotency_records (operation);
CREATE INDEX IF NOT EXISTS idempotency_records_expires_at_idx ON jumpyard.idempotency_records (expires_at);

CREATE TABLE IF NOT EXISTS jumpyard.product_catalog_cache (
  cache_key text PRIMARY KEY,
  venue_id text,
  roller_env text NOT NULL,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz,
  product_hash text NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS product_catalog_cache_venue_env_idx ON jumpyard.product_catalog_cache (venue_id, roller_env);
CREATE INDEX IF NOT EXISTS product_catalog_cache_expires_at_idx ON jumpyard.product_catalog_cache (expires_at);

CREATE TABLE IF NOT EXISTS jumpyard.roller_webhook_events (
  event_id_or_hash text PRIMARY KEY,
  event_type text NOT NULL,
  booking_reference text,
  roller_unique_id text,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'received',
  error_summary text,
  enrichment_attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  CONSTRAINT roller_webhook_events_enrichment_attempts_nonnegative CHECK (enrichment_attempts >= 0)
);

CREATE INDEX IF NOT EXISTS roller_webhook_events_status_received_idx ON jumpyard.roller_webhook_events (status, received_at);
CREATE INDEX IF NOT EXISTS roller_webhook_events_booking_reference_idx ON jumpyard.roller_webhook_events (booking_reference);
CREATE INDEX IF NOT EXISTS roller_webhook_events_roller_unique_id_idx ON jumpyard.roller_webhook_events (roller_unique_id);

CREATE TABLE IF NOT EXISTS jumpyard.booking_seed_runs (
  run_id text PRIMARY KEY,
  roller_env text NOT NULL,
  venue_id text,
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  status text NOT NULL,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  upsert_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT booking_seed_runs_date_range_check CHECK (date_range_end >= date_range_start)
);

CREATE INDEX IF NOT EXISTS booking_seed_runs_env_venue_date_idx ON jumpyard.booking_seed_runs (roller_env, venue_id, date_range_start, date_range_end);
CREATE INDEX IF NOT EXISTS booking_seed_runs_status_idx ON jumpyard.booking_seed_runs (status);
CREATE INDEX IF NOT EXISTS booking_seed_runs_started_at_idx ON jumpyard.booking_seed_runs (started_at);

CREATE TABLE IF NOT EXISTS jumpyard.event_log (
  event_id text PRIMARY KEY,
  correlation_id text,
  event_type text NOT NULL,
  subject_ref text,
  summary text,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_log_correlation_id_idx ON jumpyard.event_log (correlation_id);
CREATE INDEX IF NOT EXISTS event_log_event_type_created_idx ON jumpyard.event_log (event_type, created_at);
CREATE INDEX IF NOT EXISTS event_log_subject_ref_idx ON jumpyard.event_log (subject_ref);
