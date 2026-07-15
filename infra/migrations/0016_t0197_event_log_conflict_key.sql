-- T0197 webhook audit inserts use ON CONFLICT (event_id) DO NOTHING.
-- PostgreSQL requires the conflict-key column to be readable while the
-- restricted runtime still has no access to event payload or subject columns.
GRANT SELECT (event_id) ON jumpyard.event_log TO jumpyard_webhook_runtime;
