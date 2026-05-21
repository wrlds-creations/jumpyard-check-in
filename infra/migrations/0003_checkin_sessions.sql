CREATE TABLE IF NOT EXISTS jumpyard.checkin_sessions (
  checkin_session_id text PRIMARY KEY,
  roller_unique_id text NOT NULL REFERENCES jumpyard.roller_bookings (roller_unique_id) ON DELETE CASCADE,
  booking_reference text NOT NULL,
  visit_date date,
  status text NOT NULL DEFAULT 'guest_in_progress',
  safety_status text NOT NULL DEFAULT 'not_started',
  handoff_code text UNIQUE,
  handoff_status text NOT NULL DEFAULT 'not_ready',
  selected_ticket_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_lookup_ref text,
  idempotency_key text,
  expires_at timestamptz NOT NULL,
  ready_for_staff_at timestamptz,
  completed_at timestamptz,
  session_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkin_sessions_status_check CHECK (
    status IN (
      'guest_in_progress',
      'ready_for_staff',
      'staff_in_progress',
      'redeemed',
      'blocked',
      'cancelled',
      'expired'
    )
  ),
  CONSTRAINT checkin_sessions_safety_status_check CHECK (
    safety_status IN (
      'not_started',
      'in_progress',
      'completed',
      'requires_staff',
      'skipped'
    )
  ),
  CONSTRAINT checkin_sessions_handoff_status_check CHECK (
    handoff_status IN (
      'not_ready',
      'ready_for_staff',
      'claimed',
      'completed',
      'cancelled',
      'expired'
    )
  ),
  CONSTRAINT checkin_sessions_selected_ticket_ids_array_check CHECK (jsonb_typeof(selected_ticket_ids) = 'array')
);

CREATE INDEX IF NOT EXISTS checkin_sessions_roller_unique_id_idx ON jumpyard.checkin_sessions (roller_unique_id);
CREATE INDEX IF NOT EXISTS checkin_sessions_booking_reference_idx ON jumpyard.checkin_sessions (booking_reference);
CREATE INDEX IF NOT EXISTS checkin_sessions_visit_date_idx ON jumpyard.checkin_sessions (visit_date);
CREATE INDEX IF NOT EXISTS checkin_sessions_status_idx ON jumpyard.checkin_sessions (status);
CREATE INDEX IF NOT EXISTS checkin_sessions_handoff_status_idx ON jumpyard.checkin_sessions (handoff_status);
CREATE INDEX IF NOT EXISTS checkin_sessions_expires_at_idx ON jumpyard.checkin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS checkin_sessions_created_at_idx ON jumpyard.checkin_sessions (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS checkin_sessions_active_booking_visit_unique_idx
  ON jumpyard.checkin_sessions (roller_unique_id, COALESCE(visit_date, DATE '1900-01-01'))
  WHERE status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress');
