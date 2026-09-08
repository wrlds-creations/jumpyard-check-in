'use strict';

const { withPackageContents } = require('./package-contents');
const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const admissionTypes = new Set(['membership', 'partypackage', 'pass', 'recurringpass',
  'recurringsession', 'recurringsessions', 'sessionpass', 'standardpass']);
const nonPhysicalTypes = new Set(['fee', 'giftcard']);
// Match GH-338's exact payment classification for both original and linked goods.
// In particular, a zero balance cannot override an explicit Unpaid/PartiallyPaid.
function paidBookingSql(alias) {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid SQL alias');
  const tokens = ['payment_status', 'booking_status'].map((column) =>
    `regexp_replace(lower(COALESCE(${alias}.${column}, '')), '[^a-z]', '', 'g')`);
  return `${alias}.is_tombstoned = false
    AND lower(COALESCE(${alias}.booking_status, '')) NOT IN ('cancelled', 'deleted', 'draft', 'refunded')
    AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[${tokens.join(', ')}]) payment_token
      WHERE payment_token IN ('partiallypaid', 'partialpayment', 'partial', 'pendingpayment', 'pending',
        'awaitingpayment', 'paymentpending', 'unpaid', 'notpaid', 'overdue'))
    AND (${alias}.amount_owing_cents IS NULL OR ${alias}.amount_owing_cents <= 0)
    AND (${alias}.amount_owing_cents = 0 OR EXISTS (
      SELECT 1 FROM unnest(ARRAY[${tokens.join(', ')}]) payment_token
      WHERE payment_token IN ('paid', 'paidinfull', 'fullypaid', 'nopaymentrequired')))`;
}
const json = (value, fallback) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
};

// A label only places an explicitly purchased line at a counter. It never adds an
// entitlement. Package contents come exclusively from the shared verified mapping.
function classifyItem(item) {
  const types = [item.summary?.type, item.summary?.productType, item.summary?.subType,
    item.summary?.productSubType, item.summary?.parentType].map(key);
  const label = `${item.productName || ''} ${item.parentProductName || ''}`.toLowerCase();
  if (types.some((type) => nonPhysicalTypes.has(type))) return null;
  if (types.some((type) => admissionTypes.has(type))) return 'admission';
  if (/coffee|kaffe|cappuccino|latte|espresso/.test(label)) return 'coffee';
  if (/pizza/.test(label)) return 'pizza';
  if (/sock|strump/.test(label)) return 'socks';
  if (/water|vatten/.test(label)) return 'water';
  if (/padlock|hänglås|lock/.test(label)) return 'padlock';
  if (/skyrider/.test(label)) return 'skyrider';
  if (types.some((type) => ['food', 'foodbeverage', 'beverage'].includes(type))) return 'cafe';
  return 'other';
}

function buildManifest(items, visitDate) {
  return items.flatMap((raw) => {
    if (!raw.bookingItemId || !Number.isSafeInteger(raw.quantity) || raw.quantity < 1 ||
        (raw.bookingDate && raw.bookingDate !== visitDate)) return [];
    const item = withPackageContents(raw);
    const kind = classifyItem(item);
    if (!kind) return [];
    const productName = item.productName?.trim();
    const displayName = (!productName || /^(antal|quantity|qty)$/i.test(productName))
      ? item.parentProductName?.trim() || productName || 'Produkt'
      : productName;
    const parts = item.packageContents || [{ kind, quantity: item.quantity,
      collection: ['coffee', 'pizza', 'cafe'].includes(kind) ? 'later' : 'checkin' }];
    return parts.filter((part) => part.kind !== 'admission' || raw.selectedUnits !== 0).map((part) => ({
      id: `${item.rollerUniqueId}:${item.bookingItemId}:${visitDate}:${item.packageContents ? part.kind : 'purchased'}`,
      sourceBookingId: item.rollerUniqueId,
      bookingItemId: item.bookingItemId,
      productId: item.productId,
      area: part.collection === 'later' ? 'cafe' : 'entrance',
      kind: part.kind,
      name: part.kind === 'admission' ? 'Besöksband'
        : item.packageContents && part.kind === 'pizza' ? 'Pizza' : displayName,
      detail: part.kind === 'admission'
        ? [...new Set([part.durationMinutes ? `${part.durationMinutes} min` : null,
          item.parentProductName, item.productName].filter(Boolean))].join(' · ') || null
        : item.parentProductName && item.parentProductName !== displayName ? item.parentProductName : null,
      quantity: part.quantity,
      ...(part.kind === 'admission' && Number.isSafeInteger(raw.selectedUnits)
        ? { sessionLimit: Math.min(part.quantity, raw.selectedUnits * (item.packageContents ? 2 : 1)) } : {}),
    }));
  });
}

function createHandoutStore({ executeStatement, mappedRows, stringParameter }) {
  const p = stringParameter;
  async function readManifest(session, venueId) {
    const result = await executeStatement(`SELECT item.roller_unique_id, item.booking_item_id,
      item.product_id, COALESCE(item.parent_product_id, catalog.summary ->> 'parentProductId') AS parent_product_id,
      COALESCE(item.product_name, catalog.summary ->> 'name') AS product_name,
      COALESCE(item.parent_product_name, catalog.summary ->> 'parentProductName') AS parent_product_name,
      item.quantity, item.booking_date::text AS booking_date,
      (SELECT count(*) FROM jumpyard.roller_booking_tickets ticket
        WHERE ticket.roller_unique_id = :bookingId
          AND (ticket.booking_item_id = item.booking_item_id OR ticket.booking_item_key = item.booking_item_key)
          AND ticket.ticket_id IN (SELECT jsonb_array_elements_text(CAST(:selectedTickets AS jsonb))))::int AS selected_units,
      (COALESCE(catalog.summary, '{}'::jsonb) || item.item_summary)::text AS summary
      FROM jumpyard.roller_booking_items item
      JOIN jumpyard.roller_bookings booking USING (roller_unique_id)
      LEFT JOIN LATERAL (SELECT pc.summary FROM jumpyard.product_catalog_cache pc
        WHERE pc.roller_env = booking.roller_env AND pc.summary ->> 'id' = item.product_id
        ORDER BY pc.fetched_at DESC LIMIT 1) catalog ON true
      WHERE booking.venue_id = :venueId AND ${paidBookingSql('booking')}
        AND (item.roller_unique_id = :bookingId OR EXISTS (
          SELECT 1 FROM jumpyard.booking_links link WHERE link.original_roller_unique_id = :bookingId
            AND link.linked_roller_unique_id = item.roller_unique_id AND link.link_type = 'add_product_draft'))
      ORDER BY item.booking_item_id`, [p('venueId', venueId), p('bookingId', session.rollerUniqueId),
      p('selectedTickets', JSON.stringify(session.selectedTicketIds || []))]);
    return buildManifest(mappedRows(result).map((row) => ({
      rollerUniqueId: row.roller_unique_id, bookingItemId: row.booking_item_id,
      productId: row.product_id, parentProductId: row.parent_product_id,
      productName: row.product_name, parentProductName: row.parent_product_name,
      quantity: Number(row.quantity), bookingDate: row.booking_date, summary: json(row.summary, {}),
      selectedUnits: Number(row.selected_units),
    })), session.visitDate);
  }
  async function readState(session, venueId) {
    const manifest = await readManifest(session, venueId);
    const parameters = [p('bookingId', session.rollerUniqueId), p('visitDate', session.visitDate), p('venueId', venueId)];
    const result = await executeStatement(`SELECT
      COALESCE((SELECT jsonb_agg(jsonb_build_object('area', c.area, 'actorId', c.actor_id,
        'actorName', c.actor_name, 'expiresAt', c.expires_at, 'revision', c.revision,
        'selection', c.selection, 'pendingOperation', c.pending_operation, 'checkinSessionId', c.checkin_session_id))
        FROM jumpyard.staff_handout_claims c WHERE c.roller_unique_id = :bookingId
          AND c.visit_date = CAST(:visitDate AS date) AND c.venue_id = :venueId), '[]'::jsonb)::text AS claims,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('operationId', op.operation_id, 'area', op.area,
        'actorId', op.actor_id, 'actorName', op.actor_name, 'items', op.items, 'completedAt', op.completed_at,
        'checkinSessionId', op.checkin_session_id)
        ORDER BY op.completed_at) FROM jumpyard.staff_handout_operations op
        WHERE op.roller_unique_id = :bookingId AND op.visit_date = CAST(:visitDate AS date)
          AND op.status = 'completed' AND EXISTS (SELECT 1 FROM jumpyard.roller_bookings b
            WHERE b.roller_unique_id = op.roller_unique_id AND b.venue_id = :venueId)), '[]'::jsonb)::text AS receipts`, parameters);
    const row = mappedRows(result)[0] || {};
    const receipts = json(row.receipts, []);
    return {
      claims: json(row.claims, []), receipts,
      items: manifest.map((item) => {
        const count = (rows) => rows.reduce((total, receipt) => total +
          receipt.items.reduce((sum, line) => sum + (line.id === item.id ? line.quantity : 0), 0), 0);
        const collected = count(receipts);
        return { ...item, collected, available: Math.max(0, Math.min(item.quantity - collected,
          item.sessionLimit === undefined ? item.quantity : item.sessionLimit - count(receipts.filter((receipt) => receipt.checkinSessionId === session.checkinSessionId)))) };
      }),
    };
  }
  return { readManifest, readState };
}

module.exports = { buildManifest, classifyItem, createHandoutStore, paidBookingSql };
