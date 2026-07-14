-- T0195 / GitHub Issue #194
--
-- This migration is intentionally forward-only. It adds the state needed to
-- anonymize deactivated staff identities without breaking audit continuity,
-- records aggregate-only lifecycle evidence, and adds indexes used by the
-- bounded lifecycle runner. It does not delete or anonymize existing rows.

ALTER TABLE jumpyard.staff_identities
  ADD COLUMN IF NOT EXISTS audit_subject_id text,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

UPDATE jumpyard.staff_identities
SET audit_subject_id = 'staff_' || md5(staff_identity_id)
WHERE audit_subject_id IS NULL;

UPDATE jumpyard.staff_identities
SET deactivated_at = COALESCE(revoked_at, updated_at, now())
WHERE active = false
  AND deactivated_at IS NULL;

ALTER TABLE jumpyard.staff_identities
  ALTER COLUMN audit_subject_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_identities_audit_subject_unique_idx
  ON jumpyard.staff_identities (audit_subject_id);

CREATE OR REPLACE FUNCTION jumpyard.assign_staff_identity_audit_subject()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.audit_subject_id := COALESCE(
    NEW.audit_subject_id,
    'staff_' || md5(NEW.staff_identity_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_identities_audit_subject_trigger
  ON jumpyard.staff_identities;

CREATE TRIGGER staff_identities_audit_subject_trigger
BEFORE INSERT OR UPDATE OF staff_identity_id
ON jumpyard.staff_identities
FOR EACH ROW
EXECUTE FUNCTION jumpyard.assign_staff_identity_audit_subject();

CREATE INDEX IF NOT EXISTS staff_identities_deactivated_idx
  ON jumpyard.staff_identities (deactivated_at)
  WHERE active = false AND anonymized_at IS NULL;

ALTER TABLE jumpyard.staff_identities
  DROP CONSTRAINT IF EXISTS staff_identities_local_pin_check;

ALTER TABLE jumpyard.staff_identities
  ADD CONSTRAINT staff_identities_local_pin_check CHECK (
    (
      identity_provider = 'local_pin'
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
          AND role IN ('staff_reader', 'staff_operator')
        )
        OR (
          anonymized_at IS NOT NULL
          AND active = false
          AND pin_lookup_hash IS NULL
          AND pin_verifier IS NULL
          AND pin_changed_at IS NULL
          AND role IN ('staff_reader', 'staff_operator')
        )
      )
    )
    OR (
      identity_provider = 'cognito'
      AND pin_lookup_hash IS NULL
      AND pin_verifier IS NULL
      AND pin_changed_at IS NULL
      AND role = 'staff_admin'
    )
  );

ALTER TABLE jumpyard.staff_identities
  ADD CONSTRAINT staff_identities_deactivation_lifecycle_check CHECK (
    (active = true AND deactivated_at IS NULL AND anonymized_at IS NULL)
    OR (active = false AND deactivated_at IS NOT NULL)
  );

ALTER TABLE jumpyard.staff_identities
  ADD CONSTRAINT staff_identities_anonymized_shape_check CHECK (
    anonymized_at IS NULL
    OR (
      active = false
      AND revoked_at IS NOT NULL
      AND given_name IS NULL
      AND family_name IS NULL
      AND display_name = 'Former staff'
      AND provider_subject = 'anonymized:' || audit_subject_id
      AND pin_lookup_hash IS NULL
      AND pin_verifier IS NULL
      AND pin_changed_at IS NULL
      AND mfa_replacement_pending_at IS NULL
      AND mfa_replacement_email_hash IS NULL
      AND mfa_replacement_previous_subject IS NULL
      AND mfa_replacement_candidate_subject IS NULL
      AND mfa_replacement_reason IS NULL
    )
  );

CREATE OR REPLACE FUNCTION jumpyard.track_staff_identity_deactivation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.active = false THEN
      NEW.deactivated_at := COALESCE(NEW.deactivated_at, NEW.revoked_at, now());
    ELSE
      NEW.deactivated_at := NULL;
    END IF;
  ELSIF OLD.active = true AND NEW.active = false THEN
    NEW.deactivated_at := COALESCE(NEW.deactivated_at, NEW.revoked_at, now());
  ELSIF OLD.active = false AND NEW.active = true THEN
    IF OLD.anonymized_at IS NOT NULL THEN
      RAISE EXCEPTION 'An anonymized staff identity cannot be reactivated';
    END IF;
    NEW.deactivated_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_identities_deactivation_lifecycle_trigger
  ON jumpyard.staff_identities;

DROP TRIGGER IF EXISTS staff_identities_deactivation_lifecycle_insert_trigger
  ON jumpyard.staff_identities;

CREATE TRIGGER staff_identities_deactivation_lifecycle_insert_trigger
BEFORE INSERT
ON jumpyard.staff_identities
FOR EACH ROW
EXECUTE FUNCTION jumpyard.track_staff_identity_deactivation();

CREATE TRIGGER staff_identities_deactivation_lifecycle_trigger
BEFORE UPDATE OF active, revoked_at
ON jumpyard.staff_identities
FOR EACH ROW
EXECUTE FUNCTION jumpyard.track_staff_identity_deactivation();

CREATE TABLE IF NOT EXISTS jumpyard.data_lifecycle_runs (
  run_id text PRIMARY KEY,
  policy_version text NOT NULL,
  environment text NOT NULL,
  cluster_identifier text NOT NULL,
  cluster_arn text NOT NULL,
  reference_at timestamptz NOT NULL,
  status text NOT NULL,
  batch_size integer NOT NULL,
  max_mutations integer NOT NULL,
  plan_digest text NOT NULL,
  policy_definition_digest text NOT NULL,
  eligible_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  planned_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_total integer,
  affected_counts_digest text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT data_lifecycle_runs_status_check CHECK (status IN ('applying', 'completed')),
  CONSTRAINT data_lifecycle_runs_batch_size_check CHECK (batch_size BETWEEN 1 AND 500),
  CONSTRAINT data_lifecycle_runs_max_mutations_check CHECK (max_mutations BETWEEN 1 AND 5000),
  CONSTRAINT data_lifecycle_runs_plan_digest_check CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT data_lifecycle_runs_policy_definition_digest_check CHECK (
    policy_definition_digest ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT data_lifecycle_runs_cluster_identifier_check CHECK (
    cluster_identifier ~ '^[A-Za-z][A-Za-z0-9-]{0,62}$'
  ),
  CONSTRAINT data_lifecycle_runs_cluster_arn_check CHECK (
    cluster_arn ~ '^arn:aws:rds:[a-z0-9-]+:[0-9]{12}:cluster:[A-Za-z][A-Za-z0-9-]{0,62}$'
    AND cluster_arn LIKE ('%:cluster:' || cluster_identifier)
  ),
  CONSTRAINT data_lifecycle_runs_eligible_counts_object_check CHECK (jsonb_typeof(eligible_counts) = 'object'),
  CONSTRAINT data_lifecycle_runs_planned_counts_object_check CHECK (jsonb_typeof(planned_counts) = 'object'),
  CONSTRAINT data_lifecycle_runs_affected_counts_object_check CHECK (jsonb_typeof(affected_counts) = 'object'),
  CONSTRAINT data_lifecycle_runs_affected_total_check CHECK (
    affected_total IS NULL OR (affected_total >= 0 AND affected_total <= max_mutations)
  ),
  CONSTRAINT data_lifecycle_runs_affected_counts_digest_check CHECK (
    affected_counts_digest IS NULL OR affected_counts_digest ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT data_lifecycle_runs_finish_check CHECK (
    (
      status = 'applying'
      AND finished_at IS NULL
      AND affected_total IS NULL
      AND affected_counts_digest IS NULL
    )
    OR (
      status = 'completed'
      AND finished_at IS NOT NULL
      AND affected_total IS NOT NULL
      AND affected_counts_digest IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS data_lifecycle_runs_finished_at_idx
  ON jumpyard.data_lifecycle_runs (finished_at);

CREATE INDEX IF NOT EXISTS staff_auth_sessions_lifecycle_expiry_idx
  ON jumpyard.staff_auth_sessions (
    LEAST(
      token_expires_at,
      idle_expires_at,
      absolute_expires_at,
      COALESCE(revoked_at, 'infinity'::timestamptz)
    )
  );

CREATE INDEX IF NOT EXISTS guest_profiles_lifecycle_clock_idx
  ON jumpyard.guest_profiles (
    GREATEST(
      COALESCE(last_seen_from_roller_at, '-infinity'::timestamptz),
      updated_at
    )
  );

CREATE INDEX IF NOT EXISTS handoff_sessions_lifecycle_clock_idx
  ON jumpyard.handoff_sessions (COALESCE(completed_at, expires_at));

CREATE INDEX IF NOT EXISTS booking_links_created_at_idx
  ON jumpyard.booking_links (created_at);

CREATE INDEX IF NOT EXISTS roller_webhook_events_received_at_idx
  ON jumpyard.roller_webhook_events (received_at);

CREATE INDEX IF NOT EXISTS booking_seed_runs_lifecycle_clock_idx
  ON jumpyard.booking_seed_runs (COALESCE(finished_at, started_at));

CREATE INDEX IF NOT EXISTS event_log_created_at_idx
  ON jumpyard.event_log (created_at);

CREATE INDEX IF NOT EXISTS email_deliveries_created_at_idx
  ON jumpyard.email_deliveries (created_at);

CREATE INDEX IF NOT EXISTS prepayment_booking_drafts_expires_at_idx
  ON jumpyard.prepayment_booking_drafts (expires_at);
