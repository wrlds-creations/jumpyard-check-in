-- T0195 / GitHub Issue #194
--
-- A PIN pepper is changed only after a security event and through the guarded
-- re-enrollment workflow. The pepper itself remains in Secrets Manager. This
-- migration stores only non-secret version evidence and the state that makes
-- every pre-rotation local PIN unusable until an administrator sets a new PIN.

ALTER TABLE jumpyard.staff_identities
  ADD COLUMN IF NOT EXISTS pin_pepper_version integer,
  ADD COLUMN IF NOT EXISTS pin_reenrollment_required_at timestamptz;

-- Migration 0009 created the existing secret with version 1. Only enrolled,
-- non-anonymized local identities receive that historical version evidence.
UPDATE jumpyard.staff_identities
SET pin_pepper_version = 1
WHERE identity_provider = 'local_pin'
  AND anonymized_at IS NULL
  AND pin_lookup_hash IS NOT NULL
  AND pin_verifier IS NOT NULL
  AND pin_pepper_version IS NULL;

CREATE TABLE IF NOT EXISTS jumpyard.staff_pin_pepper_state (
  environment text PRIMARY KEY,
  current_version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_pin_pepper_state_version_check CHECK (current_version > 0)
);

-- Every usable environment already has at least its administrator identity.
-- Seed the database-visible fence from the versioned local identities, or
-- version 1 when an environment has not created its first local staff member.
INSERT INTO jumpyard.staff_pin_pepper_state (environment, current_version)
SELECT
  environment,
  COALESCE(
    max(pin_pepper_version) FILTER (
      WHERE identity_provider = 'local_pin'
        AND anonymized_at IS NULL
        AND pin_pepper_version IS NOT NULL
    ),
    1
  )::integer
FROM jumpyard.staff_identities
GROUP BY environment
ON CONFLICT (environment) DO NOTHING;

REVOKE ALL PRIVILEGES ON jumpyard.staff_pin_pepper_state FROM PUBLIC;

ALTER TABLE jumpyard.staff_identities
  DROP CONSTRAINT IF EXISTS staff_identities_local_pin_check;

ALTER TABLE jumpyard.staff_identities
  ADD CONSTRAINT staff_identities_local_pin_check CHECK (
    (
      identity_provider = 'local_pin'
      AND role IN ('staff_reader', 'staff_operator')
      AND (
        (
          anonymized_at IS NULL
          AND given_name IS NOT NULL
          AND length(btrim(given_name)) BETWEEN 1 AND 80
          AND family_name IS NOT NULL
          AND length(btrim(family_name)) BETWEEN 1 AND 80
          AND pin_lookup_hash ~ '^[a-f0-9]{64}$'
          AND pin_verifier ~ '^scrypt-v1[$][0-9]+[$][0-9]+[$][0-9]+[$][A-Za-z0-9_-]+[$][A-Za-z0-9_-]+$'
          AND pin_changed_at IS NOT NULL
          AND pin_pepper_version IS NOT NULL
          AND pin_pepper_version > 0
          AND pin_reenrollment_required_at IS NULL
        )
        OR (
          anonymized_at IS NULL
          AND given_name IS NOT NULL
          AND length(btrim(given_name)) BETWEEN 1 AND 80
          AND family_name IS NOT NULL
          AND length(btrim(family_name)) BETWEEN 1 AND 80
          AND pin_lookup_hash IS NULL
          AND pin_verifier IS NULL
          AND pin_changed_at IS NULL
          AND pin_pepper_version IS NOT NULL
          AND pin_pepper_version > 0
          AND pin_reenrollment_required_at IS NOT NULL
        )
        OR (
          anonymized_at IS NOT NULL
          AND active = false
          AND pin_lookup_hash IS NULL
          AND pin_verifier IS NULL
          AND pin_changed_at IS NULL
          AND pin_pepper_version IS NULL
          AND pin_reenrollment_required_at IS NULL
        )
      )
    )
    OR (
      identity_provider = 'cognito'
      AND pin_lookup_hash IS NULL
      AND pin_verifier IS NULL
      AND pin_changed_at IS NULL
      AND pin_pepper_version IS NULL
      AND pin_reenrollment_required_at IS NULL
      AND role = 'staff_admin'
    )
  );

ALTER TABLE jumpyard.staff_identities
  ADD CONSTRAINT staff_identities_pin_pepper_version_check CHECK (
    pin_pepper_version IS NULL OR pin_pepper_version > 0
  );

CREATE INDEX IF NOT EXISTS staff_identities_pin_reenrollment_idx
  ON jumpyard.staff_identities (
    environment,
    venue_id,
    pin_reenrollment_required_at,
    staff_identity_id
  )
  WHERE identity_provider = 'local_pin'
    AND anonymized_at IS NULL
    AND pin_reenrollment_required_at IS NOT NULL;

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
     OR OLD.pin_verifier IS DISTINCT FROM NEW.pin_verifier
     OR OLD.pin_pepper_version IS DISTINCT FROM NEW.pin_pepper_version
     OR OLD.pin_reenrollment_required_at IS DISTINCT FROM NEW.pin_reenrollment_required_at THEN
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

DROP TRIGGER IF EXISTS staff_identities_invalidate_sessions_trigger
  ON jumpyard.staff_identities;

CREATE TRIGGER staff_identities_invalidate_sessions_trigger
BEFORE UPDATE OF
  role,
  active,
  revoked_at,
  tokens_valid_after,
  pin_lookup_hash,
  pin_verifier,
  pin_pepper_version,
  pin_reenrollment_required_at
ON jumpyard.staff_identities
FOR EACH ROW
EXECUTE FUNCTION jumpyard.invalidate_staff_identity_sessions();

CREATE OR REPLACE FUNCTION jumpyard.enforce_staff_pin_pepper_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, jumpyard
AS $$
DECLARE
  database_version integer;
BEGIN
  IF NEW.identity_provider = 'local_pin'
     AND NEW.anonymized_at IS NULL
     AND NEW.pin_lookup_hash IS NOT NULL THEN
    -- A locking read follows the latest committed row after waiting for a
    -- concurrent promotion; a plain statement-snapshot read could see the
    -- pre-promotion version and admit the stale credential.
    SELECT current_version
    INTO database_version
    FROM jumpyard.staff_pin_pepper_state
    WHERE environment = NEW.environment
    FOR SHARE;

    IF database_version IS NULL OR NEW.pin_pepper_version IS DISTINCT FROM database_version THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'staff_pin_pepper_version_stale';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION jumpyard.enforce_staff_pin_pepper_version() FROM PUBLIC;

DROP TRIGGER IF EXISTS staff_identities_enforce_pin_pepper_version_trigger
  ON jumpyard.staff_identities;

CREATE TRIGGER staff_identities_enforce_pin_pepper_version_trigger
BEFORE INSERT OR UPDATE OF
  identity_provider,
  environment,
  anonymized_at,
  pin_lookup_hash,
  pin_pepper_version
ON jumpyard.staff_identities
FOR EACH ROW
EXECUTE FUNCTION jumpyard.enforce_staff_pin_pepper_version();

COMMENT ON COLUMN jumpyard.staff_identities.pin_pepper_version IS
  'Non-secret version of the pepper used for the current local PIN verifier.';

COMMENT ON COLUMN jumpyard.staff_identities.pin_reenrollment_required_at IS
  'Set when security-driven pepper rotation has made the previous local PIN unusable.';

COMMENT ON TABLE jumpyard.staff_pin_pepper_state IS
  'Non-secret database fence that rejects local PIN credentials derived from a stale pepper version.';
