-- GH-488 (D0243): kiosk pairing registry. A kiosk installation, identified by the opaque id that
-- its capability proves, claims one server-owned kiosk name (for example nacka-k3) after an
-- allowlisted staff PIN proof. The name, not the kiosk, binds the payment terminal through the
-- provider secret. No terminal identifier, capability, PIN, staff name or guest data is stored.
CREATE TABLE IF NOT EXISTS jumpyard.kiosk_installations (
  installation_id text PRIMARY KEY,
  venue_id text NOT NULL,
  kiosk_name_id text NOT NULL,
  status text NOT NULL,
  paired_at timestamptz NOT NULL DEFAULT now(),
  paired_by_staff_identity_id text NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  last_seen_at timestamptz,
  wrapper_version text,
  web_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiosk_installations_id_check CHECK (installation_id ~ '^ki_[a-f0-9]{24}$'),
  CONSTRAINT kiosk_installations_name_check CHECK (kiosk_name_id ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  CONSTRAINT kiosk_installations_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT kiosk_installations_revoked_check CHECK ((status = 'active') = (revoked_at IS NULL)),
  CONSTRAINT kiosk_installations_reason_check CHECK (
    (status = 'active' AND revoked_reason IS NULL)
    OR (status = 'revoked' AND revoked_reason IN ('replaced', 'renamed'))
  ),
  CONSTRAINT kiosk_installations_staff_check CHECK (length(paired_by_staff_identity_id) BETWEEN 1 AND 128),
  CONSTRAINT kiosk_installations_versions_check CHECK (
    (wrapper_version IS NULL OR wrapper_version ~ '^[A-Za-z0-9._-]{1,32}$')
    AND (web_version IS NULL OR web_version ~ '^[A-Za-z0-9._-]{1,64}$')
  )
);

-- One active installation per kiosk name and venue; a replacement revokes the previous holder
-- in the same statement that activates the new one.
CREATE UNIQUE INDEX IF NOT EXISTS kiosk_installations_one_active_name
  ON jumpyard.kiosk_installations (venue_id, kiosk_name_id)
  WHERE status = 'active';

REVOKE ALL ON jumpyard.kiosk_installations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON jumpyard.kiosk_installations TO jumpyard_booking_runtime;
