-- GH-403: lookup settlement audit inserts use ON CONFLICT (event_id) DO NOTHING.
-- The conflict key must be readable; event contents remain write-only.
-- Keep applied migrations unchanged and match the webhook precedent in 0016.
GRANT SELECT (event_id) ON jumpyard.event_log TO jumpyard_lookup_runtime;
