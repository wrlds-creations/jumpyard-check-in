'use strict';
const { buildManifest, paidBookingSql } = require('./staff-handout');

function createStaffBoard({ executeStatement, mappedRows, stringParameter, mapSession }) {
  const p = stringParameter;
  async function list({ day, search, cursor, venueId, bookingId = null, todayOnly = false }) {
    const result = await executeStatement(`WITH board AS (
      SELECT b.roller_unique_id, b.booking_reference, b.booking_date::text AS booking_date,
        CASE WHEN CAST(:todayOnly AS boolean) AND :search ~ '^[0-9]{4}$'
          THEN json_build_array(b.roller_unique_id, cs.checkin_session_id)::text
          ELSE b.roller_unique_id END AS board_cursor,
        b.start_time::text AS start_time, b.end_time::text AS end_time,
        b.booking_status, b.payment_status, b.freshness_status, b.amount_owing_cents, b.total_cents,
        COALESCE(cs.checkin_session_id, 'booking:' || b.roller_unique_id) AS checkin_session_id,
        COALESCE(cs.visit_date, b.booking_date)::text AS visit_date,
        COALESCE(cs.status, 'upcoming') AS status, cs.safety_status, cs.handoff_code,
        cs.handoff_day::text AS handoff_day, cs.handoff_status,
        COALESCE(cs.session_summary ->> 'bookingSyncStatus', 'confirmed') AS booking_sync_status,
        cs.selected_ticket_ids::text AS selected_ticket_ids,
        cs.expires_at::text AS expires_at, cs.ready_for_staff_at::text AS ready_for_staff_at,
        cs.completed_at::text AS completed_at, cs.created_at::text AS created_at, cs.updated_at::text AS updated_at,
        COALESCE(NULLIF(b.normalized_summary ->> 'bookingName', ''), NULLIF(b.normalized_summary ->> 'name', ''),
          NULLIF(trim(concat_ws(' ', identity.first_name, identity.last_name)), ''),
          NULLIF(trim(concat_ws(' ', b.normalized_summary ->> 'customerFirstName', b.normalized_summary ->> 'customerLastName')), '')) AS guest_name,
        identity.email_masked AS guest_email_masked, identity.phone_masked AS guest_phone_masked,
        (SELECT count(*) FROM jumpyard.roller_booking_items i WHERE i.roller_unique_id = b.roller_unique_id)::int AS item_count,
        (SELECT count(*) FROM jumpyard.roller_booking_tickets t WHERE t.roller_unique_id = b.roller_unique_id)::int AS ticket_count,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('rollerUniqueId', i.roller_unique_id, 'bookingItemId', i.booking_item_id,
          'productId', i.product_id, 'parentProductId', i.parent_product_id, 'productName', i.product_name,
          'parentProductName', i.parent_product_name, 'quantity', i.quantity, 'bookingDate', i.booking_date,
          'selectedUnits', CASE WHEN cs.checkin_session_id IS NULL THEN NULL ELSE
            (SELECT count(*) FROM jumpyard.roller_booking_tickets t WHERE t.roller_unique_id = b.roller_unique_id
              AND (t.booking_item_id = i.booking_item_id OR t.booking_item_key = i.booking_item_key)
              AND t.ticket_id IN (SELECT jsonb_array_elements_text(cs.selected_ticket_ids))) END,
          'summary', COALESCE(catalog.summary, '{}'::jsonb) || i.item_summary))
          FROM (SELECT b.roller_unique_id UNION
            SELECT link.linked_roller_unique_id FROM jumpyard.booking_links link
              WHERE link.original_roller_unique_id = b.roller_unique_id AND link.link_type = 'add_product_draft') source
          JOIN jumpyard.roller_bookings purchased ON purchased.roller_unique_id = source.roller_unique_id
          JOIN jumpyard.roller_booking_items i ON i.roller_unique_id = purchased.roller_unique_id
          LEFT JOIN LATERAL (SELECT pc.summary FROM jumpyard.product_catalog_cache pc WHERE pc.roller_env = purchased.roller_env
            AND pc.summary ->> 'id' = i.product_id ORDER BY pc.fetched_at DESC LIMIT 1) catalog ON true
          WHERE purchased.venue_id = :venueId AND ${paidBookingSql('purchased')}), '[]'::jsonb)::text AS handout_catalog,
        COALESCE((SELECT jsonb_object_agg(totals.id, totals.quantity) FROM (
          SELECT item ->> 'id' AS id, sum((item ->> 'quantity')::int) AS quantity
          FROM jumpyard.staff_handout_operations op CROSS JOIN LATERAL jsonb_array_elements(op.items) item
          WHERE op.roller_unique_id = b.roller_unique_id AND op.visit_date = b.booking_date AND op.status = 'completed'
          GROUP BY item ->> 'id') totals), '{}'::jsonb)::text AS collected_items,
        (cs.session_summary -> 'staffActor')::text AS checked_in_by,
        (SELECT jsonb_build_object('checkinSessionId', done.checkin_session_id,
          'handoffCode', done.handoff_code, 'handoffDay', done.handoff_day,
          'completedAt', done.completed_at, 'checkedInBy', done.session_summary -> 'staffActor',
          'status', 'redeemed', 'handoffStatus', 'completed')::text
          FROM jumpyard.checkin_sessions done WHERE done.roller_unique_id = b.roller_unique_id
            AND done.visit_date = b.booking_date AND done.status = 'redeemed'
          ORDER BY done.completed_at DESC NULLS LAST, done.created_at DESC LIMIT 1) AS cafe_session,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('actorId', c.actor_id, 'actorName', c.actor_name,
          'area', c.area, 'expiresAt', c.expires_at, 'pendingOperation', c.pending_operation,
          'checkinSessionId', c.checkin_session_id)) FROM jumpyard.staff_handout_claims c
          WHERE c.roller_unique_id = b.roller_unique_id AND c.visit_date = cs.visit_date
            AND c.actor_id IS NOT NULL AND (c.expires_at > now() OR c.pending_operation IS NOT NULL)), '[]'::jsonb)::text AS claims
      FROM jumpyard.roller_bookings b
      LEFT JOIN LATERAL (SELECT s.* FROM jumpyard.checkin_sessions s
        WHERE s.roller_unique_id = b.roller_unique_id AND s.visit_date = b.booking_date
          AND (NOT CAST(:todayOnly AS boolean) OR CAST(:search AS text) IS NULL OR :search !~ '^[0-9]{4}$' OR s.handoff_code = :search)
        ORDER BY CASE WHEN lower(s.handoff_code) = :search AND (CAST(:todayOnly AS boolean) OR s.handoff_day = CAST(:day AS date) OR s.handoff_day IS NULL)
          THEN 0 ELSE 1 END, s.created_at DESC, s.checkin_session_id DESC
        LIMIT CASE WHEN CAST(:todayOnly AS boolean) AND :search ~ '^[0-9]{4}$' THEN NULL ELSE 1 END) cs ON true
      LEFT JOIN LATERAL (
        SELECT first_name, last_name, email_masked, phone_masked FROM (
          SELECT 0 AS priority, d.customer_first_name AS first_name, d.customer_last_name AS last_name,
            d.customer_email_masked AS email_masked, d.customer_phone_masked AS phone_masked
          FROM jumpyard.prepayment_booking_drafts d WHERE d.roller_draft_unique_id = b.roller_unique_id
          UNION ALL
          SELECT 1, gp.latest_booking_context ->> 'firstName', gp.latest_booking_context ->> 'lastName',
            gp.email_masked, gp.contact_number_masked FROM jumpyard.guest_profiles gp
          WHERE gp.roller_customer_id = b.normalized_summary ->> 'bookingCustomerId'
            OR EXISTS (SELECT 1 FROM jumpyard.roller_booking_tickets t WHERE t.roller_unique_id = b.roller_unique_id
              AND t.roller_customer_id = gp.roller_customer_id)
        ) contacts ORDER BY priority LIMIT 1
      ) identity ON true
      WHERE b.venue_id = :venueId AND b.is_tombstoned = false
        AND (NOT CAST(:todayOnly AS boolean) OR b.booking_date = CAST(:day AS date))
        AND lower(COALESCE(b.booking_status, '')) NOT IN ('deleted', 'cancelled', 'draft')
        AND (CAST(:bookingId AS text) IS NULL OR b.roller_unique_id = :bookingId)
        AND ((CAST(:bookingId AS text) IS NOT NULL) OR b.booking_date = CAST(:day AS date)
          OR (:search ~ '^jy[0-9]+$' AND lower(cs.handoff_code) = :search)
          OR (:search ~ '^[0-9]{4}$' AND cs.handoff_day = CAST(:day AS date)))
    ) SELECT * FROM board
      WHERE (CAST(:cursor AS text) IS NULL OR board_cursor > :cursor)
        AND (CAST(:search AS text) IS NULL OR CASE WHEN :search ~ '^[0-9]{4}$'
        THEN handoff_code = :search AND (CAST(:todayOnly AS boolean) OR CAST(handoff_day AS date) = CAST(:day AS date))
        ELSE position(:search IN lower(concat_ws(' ', booking_reference, roller_unique_id, handoff_code, guest_name,
          guest_email_masked, guest_phone_masked))) > 0
          OR EXISTS (SELECT 1 FROM jumpyard.roller_booking_tickets t WHERE t.roller_unique_id = board.roller_unique_id
            AND (lower(t.ticket_id) = :search OR lower(t.custom_ticket_id) = :search)) END)
      ORDER BY board_cursor LIMIT 101`, [p('day', day), p('search', search), p('cursor', cursor), p('todayOnly', String(todayOnly)),
      p('venueId', venueId), p('bookingId', bookingId)]);
    const rows = mappedRows(result);
    return { sessions: rows.slice(0, 100).map((row) => {
      const manifest = buildManifest(parse(row.handout_catalog, []), row.visit_date);
      const items = manifest.filter((item) => item.area === 'cafe');
      const collected = parse(row.collected_items, {});
      const session = mapSession(row);
      return { ...session, counts: { ...session.counts,
        admission: manifest.filter((item) => item.kind === 'admission').reduce((sum, item) => sum + (item.sessionLimit ?? item.quantity), 0) },
        cafeQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        cafeRemaining: items.reduce((sum, item) => sum + Math.max(0, item.quantity - (collected[item.id] || 0)), 0),
        cafeSession: parse(row.cafe_session, null),
        checkedInBy: parse(row.checked_in_by, null), claims: parse(row.claims, []) };
    }),
      nextCursor: rows.length > 100 ? rows[99].board_cursor : null,
      operatingDay: day };
  }
  return { list };
}
function parse(value, fallback) {
  try { return JSON.parse(value) || fallback; } catch { return fallback; }
}
module.exports = { createStaffBoard };
