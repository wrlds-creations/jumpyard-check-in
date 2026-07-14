CREATE TABLE IF NOT EXISTS jumpyard.staff_identities (
  staff_identity_id text PRIMARY KEY,
  identity_provider text NOT NULL,
  provider_subject text NOT NULL,
  given_name text,
  family_name text,
  display_name text NOT NULL,
  role text NOT NULL,
  environment text NOT NULL,
  venue_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  tokens_valid_after timestamptz NOT NULL DEFAULT now(),
  pin_lookup_hash text,
  pin_verifier text,
  pin_changed_at timestamptz,
  mfa_replacement_pending_at timestamptz,
  mfa_replacement_email_hash text,
  mfa_replacement_previous_subject text,
  mfa_replacement_candidate_subject text,
  mfa_replacement_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_identities_provider_check CHECK (identity_provider IN ('cognito', 'local_pin')),
  CONSTRAINT staff_identities_role_check CHECK (role IN ('staff_reader', 'staff_operator', 'staff_admin')),
  CONSTRAINT staff_identities_active_revoke_check CHECK (active = true OR revoked_at IS NOT NULL),
  CONSTRAINT staff_identities_local_pin_check CHECK (
    (
      identity_provider = 'local_pin'
      AND given_name IS NOT NULL
      AND length(btrim(given_name)) BETWEEN 1 AND 80
      AND family_name IS NOT NULL
      AND length(btrim(family_name)) BETWEEN 1 AND 80
      AND pin_lookup_hash ~ '^[a-f0-9]{64}$'
      AND pin_verifier ~ '^scrypt-v1[$][0-9]+[$][0-9]+[$][0-9]+[$][A-Za-z0-9_-]+[$][A-Za-z0-9_-]+$'
      AND pin_changed_at IS NOT NULL
      AND role IN ('staff_reader', 'staff_operator')
    )
    OR (
      identity_provider = 'cognito'
      AND pin_lookup_hash IS NULL
      AND pin_verifier IS NULL
      AND pin_changed_at IS NULL
      AND role = 'staff_admin'
    )
  ),
  CONSTRAINT staff_identities_mfa_replacement_check CHECK (
    (
      mfa_replacement_pending_at IS NULL
      AND mfa_replacement_email_hash IS NULL
      AND mfa_replacement_previous_subject IS NULL
      AND mfa_replacement_candidate_subject IS NULL
      AND mfa_replacement_reason IS NULL
    )
    OR (
      identity_provider = 'cognito'
      AND mfa_replacement_pending_at IS NOT NULL
      AND mfa_replacement_email_hash ~ '^[a-f0-9]{64}$'
      AND mfa_replacement_previous_subject IS NOT NULL
      AND mfa_replacement_reason = 'lost_or_compromised_totp'
      AND active = false
      AND revoked_at IS NOT NULL
    )
  ),
  CONSTRAINT staff_identities_provider_subject_unique UNIQUE (identity_provider, provider_subject, environment)
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_identities_pin_scope_unique_idx
  ON jumpyard.staff_identities (environment, venue_id, pin_lookup_hash)
  WHERE identity_provider = 'local_pin' AND pin_lookup_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS staff_identities_scope_active_idx
  ON jumpyard.staff_identities (environment, venue_id, active);

CREATE INDEX IF NOT EXISTS staff_identities_role_active_idx
  ON jumpyard.staff_identities (role, active);

CREATE TABLE IF NOT EXISTS jumpyard.staff_auth_sessions (
  staff_session_id text PRIMARY KEY,
  staff_identity_id text NOT NULL REFERENCES jumpyard.staff_identities (staff_identity_id) ON DELETE RESTRICT,
  identity_provider text NOT NULL,
  provider_session_hash text NOT NULL UNIQUE,
  client_id text NOT NULL,
  environment text NOT NULL,
  venue_id text NOT NULL,
  role_snapshot text NOT NULL,
  display_name_snapshot text NOT NULL,
  auth_time timestamptz NOT NULL,
  token_issued_at timestamptz NOT NULL,
  token_expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_auth_sessions_provider_check CHECK (identity_provider IN ('cognito', 'local_pin')),
  CONSTRAINT staff_auth_sessions_role_check CHECK (role_snapshot IN ('staff_reader', 'staff_operator', 'staff_admin')),
  CONSTRAINT staff_auth_sessions_hash_check CHECK (provider_session_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT staff_auth_sessions_idle_absolute_check CHECK (idle_expires_at <= absolute_expires_at),
  CONSTRAINT staff_auth_sessions_auth_absolute_check CHECK (auth_time < absolute_expires_at),
  CONSTRAINT staff_auth_sessions_revoke_reason_check CHECK (
    (revoked_at IS NULL AND revoke_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS staff_auth_sessions_identity_idx
  ON jumpyard.staff_auth_sessions (staff_identity_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS staff_auth_sessions_one_active_pin_idx
  ON jumpyard.staff_auth_sessions (staff_identity_id)
  WHERE identity_provider = 'local_pin' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_auth_sessions_active_expiry_idx
  ON jumpyard.staff_auth_sessions (idle_expires_at, absolute_expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_auth_sessions_scope_idx
  ON jumpyard.staff_auth_sessions (environment, venue_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jumpyard.staff_pin_auth_limits (
  environment text NOT NULL,
  venue_id text NOT NULL,
  scope_type text NOT NULL,
  scope_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  failure_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, venue_id, scope_type, scope_hash),
  CONSTRAINT staff_pin_auth_limits_scope_check CHECK (scope_type IN ('source', 'venue')),
  CONSTRAINT staff_pin_auth_limits_hash_check CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT staff_pin_auth_limits_count_check CHECK (failure_count >= 0)
);

CREATE INDEX IF NOT EXISTS staff_pin_auth_limits_expiry_idx
  ON jumpyard.staff_pin_auth_limits (updated_at);

CREATE OR REPLACE FUNCTION jumpyard.invalidate_staff_identity_sessions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     OR OLD.active IS DISTINCT FROM NEW.active
     OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at
     OR OLD.tokens_valid_after IS DISTINCT FROM NEW.tokens_valid_after
     OR OLD.pin_lookup_hash IS DISTINCT FROM NEW.pin_lookup_hash
     OR OLD.pin_verifier IS DISTINCT FROM NEW.pin_verifier THEN
    NEW.tokens_valid_after := GREATEST(NEW.tokens_valid_after, now());

    UPDATE jumpyard.staff_auth_sessions
    SET revoked_at = COALESCE(revoked_at, now()),
        revoke_reason = COALESCE(revoke_reason, 'identity_changed'),
        updated_at = now()
    WHERE staff_identity_id = OLD.staff_identity_id
      AND revoked_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_identities_invalidate_sessions_trigger ON jumpyard.staff_identities;

CREATE TRIGGER staff_identities_invalidate_sessions_trigger
BEFORE UPDATE OF role, active, revoked_at, tokens_valid_after, pin_lookup_hash, pin_verifier
ON jumpyard.staff_identities
FOR EACH ROW
EXECUTE FUNCTION jumpyard.invalidate_staff_identity_sessions();
