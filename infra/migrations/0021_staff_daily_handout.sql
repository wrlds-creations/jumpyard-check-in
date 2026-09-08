-- GH-345. Operational allocation/collection only; ROLLER still owns admission.
-- Additive migration: the previous release may keep reading/writing legacy JY codes.
ALTER TABLE jumpyard.checkin_sessions
  ADD COLUMN handoff_day date,
  ADD COLUMN handoff_venue_id text;
ALTER TABLE jumpyard.checkin_sessions DROP CONSTRAINT checkin_sessions_handoff_code_key;
CREATE UNIQUE INDEX checkin_sessions_legacy_handoff_code_idx
  ON jumpyard.checkin_sessions (handoff_code) WHERE handoff_day IS NULL;
CREATE UNIQUE INDEX checkin_sessions_daily_handoff_code_idx
  ON jumpyard.checkin_sessions (handoff_venue_id, handoff_day, handoff_code)
  WHERE handoff_day IS NOT NULL;
ALTER TABLE jumpyard.checkin_sessions ADD CONSTRAINT checkin_sessions_daily_handoff_check
  CHECK (handoff_day IS NULL OR (handoff_venue_id IS NOT NULL AND handoff_code ~ '^[0-9]{4}$' AND handoff_code <> '0000'));

-- Aggregate high-water marks contain no guest information. Never delete/reset them in
-- booking retention. Restores must not receive traffic until allocation is reconciled.
CREATE TABLE jumpyard.handoff_day_counters (
  venue_id text NOT NULL,
  allocation_day date NOT NULL,
  last_number integer NOT NULL CHECK (last_number BETWEEN 1 AND 9999),
  PRIMARY KEY (venue_id, allocation_day)
);

CREATE FUNCTION jumpyard.ready_staff_session(p_session_id text, p_safety_status text)
RETURNS SETOF jumpyard.checkin_sessions LANGUAGE plpgsql AS $$
DECLARE
  visit jumpyard.checkin_sessions%ROWTYPE;
  park text;
  v_day date;
  allocated integer;
BEGIN
  SELECT * INTO visit FROM jumpyard.checkin_sessions
    WHERE checkin_session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  -- A retry must never reopen a completed/expired session, or consume another number.
  IF visit.status NOT IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
     OR visit.expires_at <= now() THEN
    RETURN NEXT visit; RETURN;
  END IF;
  IF visit.handoff_code IS NULL THEN
    SELECT venue_id INTO park FROM jumpyard.roller_bookings WHERE roller_unique_id = visit.roller_unique_id;
    IF park IS NULL THEN RAISE EXCEPTION 'handoff_venue_required'; END IF;
    v_day := (clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date;
    INSERT INTO jumpyard.handoff_day_counters AS counter (venue_id, allocation_day, last_number)
      VALUES (park, v_day, 1)
      ON CONFLICT (venue_id, allocation_day) DO UPDATE
        SET last_number = counter.last_number + 1 WHERE counter.last_number < 9999
      RETURNING last_number INTO allocated;
    -- Capacity exhaustion never recycles today's numbers. Stable session QR still works.
    IF allocated IS NOT NULL THEN
      visit.handoff_code := lpad(allocated::text, 4, '0');
      visit.handoff_day := v_day;
      visit.handoff_venue_id := park;
    END IF;
  END IF;
  RETURN QUERY UPDATE jumpyard.checkin_sessions SET
    status = 'ready_for_staff', handoff_status = 'ready_for_staff',
    safety_status = COALESCE(p_safety_status, safety_status),
    handoff_code = visit.handoff_code, handoff_day = visit.handoff_day,
    handoff_venue_id = visit.handoff_venue_id,
    ready_for_staff_at = COALESCE(ready_for_staff_at, now()), updated_at = now(),
    expires_at = GREATEST(expires_at, (visit.visit_date + 1)::timestamp AT TIME ZONE 'Europe/Stockholm'),
    session_summary = session_summary || jsonb_build_object(
      'readyForStaffSource', 'checkin_session_api', 'handoffNumberUnavailable', visit.handoff_code IS NULL)
    WHERE checkin_session_id = p_session_id RETURNING *;
END $$;

CREATE TABLE jumpyard.staff_handout_claims (
  roller_unique_id text NOT NULL REFERENCES jumpyard.roller_bookings ON DELETE CASCADE,
  visit_date date NOT NULL,
  area text NOT NULL CHECK (area IN ('entrance', 'cafe')),
  checkin_session_id text NOT NULL REFERENCES jumpyard.checkin_sessions ON DELETE CASCADE,
  venue_id text NOT NULL,
  actor_id text,
  actor_name text,
  expires_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 0,
  selection jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending_operation text,
  PRIMARY KEY (roller_unique_id, visit_date, area)
);
CREATE INDEX staff_handout_claims_actor_idx ON jumpyard.staff_handout_claims (venue_id, actor_id, expires_at);

CREATE TABLE jumpyard.staff_handout_operations (
  operation_id text PRIMARY KEY,
  roller_unique_id text NOT NULL REFERENCES jumpyard.roller_bookings ON DELETE CASCADE,
  visit_date date NOT NULL,
  area text NOT NULL CHECK (area IN ('entrance', 'cafe')),
  checkin_session_id text NOT NULL REFERENCES jumpyard.checkin_sessions ON DELETE CASCADE,
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  items jsonb NOT NULL,
  needs_admission boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX staff_handout_operations_visit_idx ON jumpyard.staff_handout_operations (roller_unique_id, visit_date, area);

-- All state transitions serialize on the visit/area row. Actor advisory locks also
-- prevent one operator from inadvertently taking two guests on different phones.
CREATE FUNCTION jumpyard.change_staff_handout(
  p_session_id text, p_venue text, p_actor text, p_actor_name text, p_area text,
  p_action text, p_revision integer, p_selection jsonb, p_manifest jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  visit jumpyard.checkin_sessions%ROWTYPE;
  claim jumpyard.staff_handout_claims%ROWTYPE;
  other_claim jumpyard.staff_handout_claims%ROWTYPE;
  operation jumpyard.staff_handout_operations%ROWTYPE;
  line jsonb;
  entitlement jsonb;
  chosen jsonb := '[]'::jsonb;
  already integer;
  session_collected integer;
  available integer;
  quantity integer;
  admission boolean := false;
  operation_key text;
BEGIN
  IF p_area NOT IN ('entrance', 'cafe') OR p_action NOT IN ('select', 'release', 'prepare', 'complete')
     OR p_actor IS NULL OR p_actor_name IS NULL THEN RETURN jsonb_build_object('error', 'invalid_handout'); END IF;
  SELECT cs.* INTO visit FROM jumpyard.checkin_sessions cs
    JOIN jumpyard.roller_bookings b USING (roller_unique_id)
    WHERE cs.checkin_session_id = p_session_id AND b.venue_id = p_venue;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'session_not_found'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_venue || ':' || p_actor, 345));
  -- Serialize both counters for one visit, including a catalog area correction.
  PERFORM pg_advisory_xact_lock(hashtextextended(visit.roller_unique_id || ':' || visit.visit_date::text, 345));
  INSERT INTO jumpyard.staff_handout_claims (roller_unique_id, visit_date, area, checkin_session_id, venue_id)
    VALUES (visit.roller_unique_id, visit.visit_date, p_area, p_session_id, p_venue) ON CONFLICT DO NOTHING;
  SELECT * INTO claim FROM jumpyard.staff_handout_claims
    WHERE roller_unique_id = visit.roller_unique_id AND visit_date = visit.visit_date AND area = p_area FOR UPDATE;
  IF p_action IN ('prepare', 'complete') THEN
    SELECT * INTO operation FROM jumpyard.staff_handout_operations
      WHERE operation_id = 'handout:' || p_session_id || ':' || p_area || ':' || p_revision::text
        AND status = 'completed';
    IF FOUND THEN RETURN jsonb_build_object('operationId', operation.operation_id,
      'needsAdmission', operation.needs_admission, 'items', operation.items, 'completed', true); END IF;
  END IF;
  IF claim.actor_id IS NOT NULL AND claim.actor_id <> p_actor AND claim.expires_at > now() THEN
    RETURN jsonb_build_object('error', 'guest_claimed', 'actorName', claim.actor_name);
  END IF;
  IF claim.checkin_session_id <> p_session_id AND
      (claim.pending_operation IS NOT NULL OR (claim.actor_id = p_actor AND claim.expires_at > now())) THEN
    RETURN jsonb_build_object('error', 'handout_resume_required', 'checkinSessionId', claim.checkin_session_id, 'area', p_area);
  END IF;
  IF p_revision IS DISTINCT FROM claim.revision THEN RETURN jsonb_build_object('error', 'handout_changed'); END IF;
  SELECT * INTO other_claim FROM jumpyard.staff_handout_claims
    WHERE venue_id = p_venue AND actor_id = p_actor AND expires_at > now()
      AND (roller_unique_id, visit_date, area) <> (visit.roller_unique_id, visit.visit_date, p_area) LIMIT 1;
  IF FOUND AND p_action <> 'release' THEN
    RETURN jsonb_build_object('error', 'staff_busy', 'checkinSessionId', other_claim.checkin_session_id, 'area', other_claim.area);
  END IF;

  IF claim.pending_operation IS NOT NULL THEN
    SELECT * INTO operation FROM jumpyard.staff_handout_operations WHERE operation_id = claim.pending_operation FOR UPDATE;
    IF p_action NOT IN ('prepare', 'complete') THEN RETURN jsonb_build_object('error', 'handout_confirmation_pending'); END IF;
    -- A timed-out confirmation is resumed as the SAME operation, with its original actor.
    UPDATE jumpyard.staff_handout_claims SET actor_id = p_actor, actor_name = p_actor_name,
      expires_at = now() + interval '3 minutes' WHERE roller_unique_id = visit.roller_unique_id
      AND visit_date = visit.visit_date AND area = p_area;
    IF p_action = 'complete' THEN
      IF operation.needs_admission AND visit.status <> 'redeemed' THEN
        RETURN jsonb_build_object('error', 'admission_not_confirmed');
      END IF;
      UPDATE jumpyard.staff_handout_operations SET status = 'completed', completed_at = now()
        WHERE operation_id = operation.operation_id AND status = 'pending';
      UPDATE jumpyard.staff_handout_claims SET actor_id = NULL, actor_name = NULL, selection = '[]'::jsonb,
        pending_operation = NULL, expires_at = now(), revision = revision + 1
        WHERE roller_unique_id = visit.roller_unique_id AND visit_date = visit.visit_date AND area = p_area;
    END IF;
    RETURN jsonb_build_object('operationId', operation.operation_id, 'needsAdmission', operation.needs_admission,
      'items', operation.items, 'revision', claim.revision, 'completed', p_action = 'complete');
  END IF;
  IF p_action = 'complete' THEN RETURN jsonb_build_object('error', 'handout_changed'); END IF;
  IF p_action = 'release' THEN
    IF claim.actor_id IS DISTINCT FROM p_actor THEN RETURN jsonb_build_object('error', 'claim_not_owned'); END IF;
    UPDATE jumpyard.staff_handout_claims SET actor_id = NULL, actor_name = NULL,
      selection = '[]'::jsonb, expires_at = now(), revision = revision + 1
      WHERE roller_unique_id = visit.roller_unique_id AND visit_date = visit.visit_date AND area = p_area;
    RETURN jsonb_build_object('released', true);
  END IF;
  IF visit.status NOT IN ('ready_for_staff', 'redeemed') OR visit.safety_status <> 'completed'
     OR COALESCE(visit.session_summary ->> 'bookingSyncStatus', 'confirmed') <> 'confirmed'
     OR (visit.status <> 'redeemed' AND visit.expires_at <= now()) THEN
    RETURN jsonb_build_object('error', 'session_not_ready_for_staff');
  END IF;
  IF p_area = 'cafe' AND visit.status <> 'redeemed' THEN RETURN jsonb_build_object('error', 'admission_not_confirmed'); END IF;
  IF p_action = 'prepare' THEN
    IF claim.actor_id IS DISTINCT FROM p_actor THEN RETURN jsonb_build_object('error', 'claim_not_owned'); END IF;
    p_selection := claim.selection;
  END IF;
  IF jsonb_typeof(p_selection) <> 'array' OR jsonb_array_length(p_selection) > 100 THEN
    RETURN jsonb_build_object('error', 'invalid_selection');
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_selection) LOOP
    SELECT value INTO entitlement FROM jsonb_array_elements(p_manifest)
      WHERE value ->> 'id' = line ->> 'id' AND value ->> 'area' = p_area;
    IF NOT FOUND OR (line ->> 'quantity') !~ '^[1-9][0-9]{0,3}$'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(chosen) WHERE value ->> 'id' = line ->> 'id') THEN
      RETURN jsonb_build_object('error', 'invalid_selection');
    END IF;
    quantity := (line ->> 'quantity')::integer;
    -- A renamed/reclassified product can move between counters while a response
    -- is uncertain. Its immutable pending intent still reserves that item.
    SELECT op.* INTO operation FROM jumpyard.staff_handout_operations op
      WHERE op.roller_unique_id = visit.roller_unique_id AND op.visit_date = visit.visit_date
        AND op.status = 'pending' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(op.items) item WHERE item ->> 'id' = line ->> 'id')
      LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('error', 'handout_resume_required',
        'checkinSessionId', operation.checkin_session_id, 'area', operation.area);
    END IF;
    SELECT COALESCE(SUM((item ->> 'quantity')::integer), 0) INTO already
      FROM jumpyard.staff_handout_operations op CROSS JOIN LATERAL jsonb_array_elements(op.items) item
      WHERE op.roller_unique_id = visit.roller_unique_id AND op.visit_date = visit.visit_date
        AND op.status = 'completed' AND item ->> 'id' = line ->> 'id';
    IF quantity > (entitlement ->> 'quantity')::integer - already THEN
      RETURN jsonb_build_object('error', 'quantity_already_collected');
    END IF;
    IF entitlement ->> 'kind' = 'admission' THEN
      admission := true;
      SELECT COALESCE(SUM((item ->> 'quantity')::integer), 0) INTO session_collected
        FROM jumpyard.staff_handout_operations op CROSS JOIN LATERAL jsonb_array_elements(op.items) item
        WHERE op.checkin_session_id = p_session_id AND op.status = 'completed' AND item ->> 'id' = line ->> 'id';
      available := LEAST((entitlement ->> 'quantity')::integer - already,
        COALESCE((entitlement ->> 'sessionLimit')::integer, (entitlement ->> 'quantity')::integer) - session_collected);
      IF quantity <> available THEN
        RETURN jsonb_build_object('error', 'admission_requires_whole_group');
      END IF;
    END IF;
    chosen := chosen || jsonb_build_array(entitlement || jsonb_build_object('quantity', quantity));
  END LOOP;
  IF p_action = 'prepare' THEN
    IF jsonb_array_length(chosen) = 0 THEN RETURN jsonb_build_object('error', 'selection_required'); END IF;
    IF admission AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_manifest) m
      WHERE m ->> 'kind' = 'admission' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(chosen) c WHERE c ->> 'id' = m ->> 'id')) THEN
      RETURN jsonb_build_object('error', 'admission_requires_whole_group');
    END IF;
    operation_key := 'handout:' || p_session_id || ':' || p_area || ':' || claim.revision::text;
    INSERT INTO jumpyard.staff_handout_operations
      (operation_id, roller_unique_id, visit_date, area, checkin_session_id, actor_id, actor_name, items, needs_admission)
      VALUES (operation_key, visit.roller_unique_id, visit.visit_date, p_area, p_session_id,
        p_actor, p_actor_name, chosen, admission);
    UPDATE jumpyard.staff_handout_claims SET pending_operation = operation_key,
      expires_at = now() + interval '3 minutes' WHERE roller_unique_id = visit.roller_unique_id
      AND visit_date = visit.visit_date AND area = p_area;
    RETURN jsonb_build_object('operationId', operation_key, 'needsAdmission', admission,
      'items', chosen, 'revision', claim.revision, 'completed', false);
  END IF;
  UPDATE jumpyard.staff_handout_claims SET actor_id = p_actor, actor_name = p_actor_name,
    checkin_session_id = p_session_id, selection = chosen, revision = revision + 1,
    expires_at = now() + interval '3 minutes' WHERE roller_unique_id = visit.roller_unique_id
    AND visit_date = visit.visit_date AND area = p_area;
  RETURN jsonb_build_object('selected', true, 'revision', claim.revision + 1);
END $$;

REVOKE ALL ON FUNCTION jumpyard.ready_staff_session(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION jumpyard.change_staff_handout(text, text, text, text, text, text, integer, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jumpyard.ready_staff_session(text, text) TO jumpyard_session_runtime;
GRANT SELECT, INSERT, UPDATE ON jumpyard.handoff_day_counters TO jumpyard_session_runtime;
GRANT SELECT ON jumpyard.staff_handout_claims, jumpyard.staff_handout_operations TO jumpyard_session_runtime;
GRANT SELECT, INSERT, UPDATE ON jumpyard.staff_handout_claims, jumpyard.staff_handout_operations TO jumpyard_redeem_runtime;
GRANT EXECUTE ON FUNCTION jumpyard.change_staff_handout(text, text, text, text, text, text, integer, jsonb, jsonb) TO jumpyard_redeem_runtime;
-- Both tables cascade with the existing 30-day booking/session retention. No new job.
GRANT SELECT ON jumpyard.staff_handout_claims, jumpyard.staff_handout_operations TO jumpyard_lifecycle_runtime;
GRANT SELECT ON jumpyard.booking_links, jumpyard.prepayment_booking_drafts TO jumpyard_redeem_runtime;
