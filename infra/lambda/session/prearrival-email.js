'use strict';

// GH-392: preparation and delivery orchestration. Dependencies own side effects.
const POLICY = Object.freeze({
  name: 'prearrival_email_v1',
  venueId: '50871',
  leadMinutes: 120,
  rateMinutes: 5,
  checkinBaseUrl: 'https://checkin.jumpyard.se/',
  timezone: 'Europe/Stockholm',
});
// Love confirmed the single Nacka test day on 2026-09-25. Delivery needs both the current
// Stockholm day and the booking's visit date to equal it; no configuration can widen it.
// Love also asked for one controlled end-to-end proof on 2026-09-25, limited to bookings
// whose booking contact is Love's own love@ or love+tag@wrlds.com address.
const ROLLOUT = Object.freeze({ visitDate: '2026-09-28', proofDate: '2026-09-25' });
const PROOF_RECIPIENT = /^love(\+[a-z0-9._-]{1,40})?@wrlds\.com$/i;
// Love, 2026-09-25: only bookings the phone and staff flow can handle. A booking needs one
// admission line, and every line must be admission, a phone add-on or a café product.
// Parties, party food, punch cards, gift cards, memberships, groups, PT, extensions and
// merchandise stop the email. Ids are ROLLER Live Nacka parent (or product) ids.
const SUPPORTED_PRODUCTS = Object.freeze({
  admission: Object.freeze([
    '1189805', '1189823', '1189771', // Entré 60/90/120 min, including Drop-In
    '1189814', '1189832', '1189794', // Entré 60/90/120 min - Familj
    '1242135', '1242136', // Weekday Combo
  ]),
  addOns: Object.freeze(['970335', '970337', '970333']), // SkyRider, JumpSocks, Hänglås
  cafe: Object.freeze([
    '970363', '1027668', // Cold Drinks (includes JumpYard Vatten), Cold Drinks 2
    '970346', '1065933', '970461', '970488', '970441', '970540', // coffee, ice cream, food, sweets, pizza
  ]),
});
const PAGE_SIZE = 25;
const stringParameter = (name, value) => ({ name, value: value == null ? { isNull: true } : { stringValue: value } });
const stockholmDay = new Intl.DateTimeFormat('en-CA', { timeZone: POLICY.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });

function isRolloutDay(instant) {
  const millis = typeof instant === 'number' ? instant : Date.parse(instant);
  if (!Number.isFinite(millis)) return false;
  const day = stockholmDay.format(new Date(millis));
  return day === ROLLOUT.visitDate || day === ROLLOUT.proofDate;
}

// The visit must be on the rollout day; on the proof day only Love's own address qualifies.
function isRolloutVisit(visitDate, email) {
  if (visitDate === ROLLOUT.visitDate) return true;
  return visitDate === ROLLOUT.proofDate && typeof email === 'string' && PROOF_RECIPIENT.test(email.trim());
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function normalizePreparation(body, clock = new Date()) {
  // A request flag or a general send environment flag cannot activate this policy.
  if (body.confirmSend !== undefined && typeof body.confirmSend !== 'boolean') return { error: 'prearrival_rollout_not_approved' };
  if (body.dryRun !== undefined && body.dryRun !== true) return { error: 'prearrival_rollout_not_approved' };
  if (body.confirmSend === true && body.dryRun === true) return { error: 'prearrival_rollout_not_approved' };
  if (body.confirmSend === true && body.now !== undefined) return { error: 'prearrival_clock_invalid' };
  for (const field of ['email', 'baseUrl', 'emailBaseUrl', 'checkinBaseUrl', 'channels', 'leadMinutes', 'venueId', 'windowStartAt', 'windowEndAt']) {
    if (body[field] !== undefined) return { error: 'prearrival_policy_override_rejected' };
  }
  const cursor = body.cursor;
  if (cursor !== undefined && (!cursor || typeof cursor !== 'object' || Array.isArray(cursor))) return { error: 'prearrival_cursor_invalid' };
  const asOf = parseTimestamp(cursor?.asOf ?? body.now ?? clock.toISOString());
  if (!asOf || (cursor && body.now !== undefined && parseTimestamp(body.now) !== asOf)) return { error: 'prearrival_clock_invalid' };
  const endAt = new Date(Date.parse(asOf) + POLICY.leadMinutes * 60_000).toISOString();
  let afterStartAt = null;
  let afterId = null;
  if (cursor) {
    afterStartAt = parseTimestamp(cursor.afterStartAt);
    afterId = cursor.afterId;
    if (!afterStartAt || Date.parse(afterStartAt) <= Date.parse(asOf) || Date.parse(afterStartAt) > Date.parse(endAt)
      || typeof afterId !== 'string' || !afterId.trim() || afterId.length > 256 || /[\r\n\x00]/.test(afterId)) {
      return { error: 'prearrival_cursor_invalid' };
    }
  }
  return { asOf, endAt, afterStartAt, afterId, confirmSend: body.confirmSend === true };
}

function classifyCandidate(row, context, decision, asOf) {
  const booking = context?.booking;
  const start = Date.parse(row.booking_start_at);
  const now = Date.parse(asOf);
  if (row.venue_id !== POLICY.venueId || booking?.venueId !== POLICY.venueId) return 'wrong_venue';
  if (row.roller_env !== 'live' || booking.rollerEnv !== 'live') return 'wrong_environment';
  if (!Number.isFinite(start) || start <= now || start > now + POLICY.leadMinutes * 60_000) return 'outside_due_window';
  if (booking.rollerUniqueId !== row.roller_unique_id || booking.bookingDate !== row.booking_date
    || String(booking.startTime).slice(0, 8) !== String(row.start_time).slice(0, 8)) return 'booking_changed';
  if (booking.isTombstoned || ['cancelled', 'deleted', 'draft'].includes(String(booking.bookingStatus).toLowerCase())) return 'inactive_booking';
  if (booking.freshnessStatus !== 'fresh') return 'stale_booking';
  if (!decision?.canStart) return 'booking_not_eligible';
  if (row.product_support !== 'supported') return 'unsupported_products';
  // Love, 2026-09-25: guests who bought in our phone/kiosk flow or already started
  // check-in are in the flow; never tell them to check in. Unknown values fail closed.
  if (row.own_flow_purchase !== false) return 'own_flow_purchase';
  if (row.checkin_started !== false) return 'checkin_already_started';
  if (row.email_already_sent === true) return 'already_sent';
  // A recorded failed/ambiguous attempt must never become an automatic second message.
  if (row.email_attempt_exists === true) return 'previous_attempt_requires_review';
  if (!row.email) return 'booking_contact_missing';
  if (typeof row.email !== 'string' || row.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) return 'booking_contact_invalid';
  return 'eligible_pending_live_checks';
}

const sqlIdList = (ids) => ids.map((id) => {
  if (!/^\d+$/.test(id)) throw new Error('Invalid product id');
  return `'${id}'`;
}).join(', ');
const lineMatches = (ids) => `(COALESCE(line.parent_product_id IN (${sqlIdList(ids)}), false)
      OR COALESCE(line.product_id IN (${sqlIdList(ids)}), false))`;
const PRODUCT_SUPPORT_SQL = `(SELECT CASE
    WHEN count(*) = 0 THEN 'no_items'
    WHEN bool_and(${lineMatches([...SUPPORTED_PRODUCTS.admission, ...SUPPORTED_PRODUCTS.addOns, ...SUPPORTED_PRODUCTS.cafe])})
      AND bool_or(${lineMatches(SUPPORTED_PRODUCTS.admission)}) THEN 'supported'
    ELSE 'unsupported' END
  FROM jumpyard.roller_booking_items line
  WHERE line.roller_unique_id = b.roller_unique_id)`;

const PAGE_QUERY = `WITH due AS (
  SELECT b.*, ((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm') AS booking_start_at
  FROM jumpyard.roller_bookings b
  WHERE b.venue_id = :venueId AND b.roller_env = 'live'
    AND b.booking_date IS NOT NULL AND b.start_time IS NOT NULL
    AND ((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm') > CAST(:asOf AS timestamptz)
    AND ((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm') <= CAST(:endAt AS timestamptz)
    AND (CAST(:afterStartAt AS timestamptz) IS NULL OR
      (((b.booking_date + b.start_time) AT TIME ZONE 'Europe/Stockholm'), b.roller_unique_id)
        > (CAST(:afterStartAt AS timestamptz), CAST(:afterId AS text)))
  ORDER BY booking_start_at, b.roller_unique_id
  LIMIT ${PAGE_SIZE + 1}
)
SELECT b.roller_unique_id, b.venue_id, b.roller_env,
  b.normalized_summary ->> 'bookingCustomerId' AS booking_customer_id,
  b.booking_date::text AS booking_date, b.start_time::text AS start_time,
  b.booking_start_at::text AS booking_start_at, contact.email,
  ${PRODUCT_SUPPORT_SQL} AS product_support,
  EXISTS (SELECT 1 FROM jumpyard.prepayment_booking_drafts draft
    WHERE draft.roller_draft_unique_id = b.roller_unique_id) AS own_flow_purchase,
  EXISTS (SELECT 1 FROM jumpyard.checkin_sessions started
    WHERE started.roller_unique_id = b.roller_unique_id) AS checkin_started,
  EXISTS (SELECT 1 FROM jumpyard.email_deliveries delivery
    WHERE delivery.roller_unique_id = b.roller_unique_id
      AND delivery.message_template = :messageTemplate AND delivery.dry_run IS FALSE
      AND delivery.status = 'sent'
      AND (delivery.created_at AT TIME ZONE 'Europe/Stockholm')::date = b.booking_date) AS email_already_sent,
  EXISTS (SELECT 1 FROM jumpyard.email_deliveries delivery
    WHERE delivery.roller_unique_id = b.roller_unique_id
      AND delivery.message_template = :messageTemplate AND delivery.dry_run IS FALSE
      AND (delivery.created_at AT TIME ZONE 'Europe/Stockholm')::date = b.booking_date) AS email_attempt_exists
FROM due b
LEFT JOIN jumpyard.guest_profiles contact
  ON contact.roller_customer_id = b.normalized_summary ->> 'bookingCustomerId'
ORDER BY b.booking_start_at, b.roller_unique_id`;

async function preparePrearrivalEmailPage(body, dependencies) {
  const request = normalizePreparation(body, dependencies.clock?.() ?? new Date());
  if (request.error) return { statusCode: 409, body: { status: 'blocked', error: { code: request.error } } };
  if (request.confirmSend && (!dependencies.authorizeRollout || !dependencies.authorizeRollout())) {
    return { statusCode: 409, body: { status: 'blocked', error: { code: 'prearrival_rollout_not_approved' } } };
  }
  if (request.confirmSend && !isRolloutDay(request.asOf)) {
    return { statusCode: 409, body: { status: 'blocked', error: { code: 'prearrival_outside_rollout_date' } } };
  }
  if (dependencies.environment !== 'park-test') return { statusCode: 409, body: { status: 'blocked', error: { code: 'prearrival_environment_invalid' } } };
  const rows = dependencies.mappedRows(await dependencies.executeStatement(PAGE_QUERY, [
    stringParameter('venueId', POLICY.venueId),
    stringParameter('asOf', request.asOf),
    stringParameter('endAt', request.endAt),
    stringParameter('afterStartAt', request.afterStartAt),
    stringParameter('afterId', request.afterId),
    stringParameter('messageTemplate', 'checkin_email_v1'),
  ]));
  const page = rows.slice(0, PAGE_SIZE);
  const counts = {};
  let lateEligible = 0;
  for (const row of page) {
    // A recorded message or attempt never sends again, so skip the per-booking context read.
    const context = row.email_attempt_exists === true ? null : await dependencies.getBookingContext(row.roller_unique_id);
    const decision = context ? dependencies.evaluateStartContext(context, { expectedDate: row.booking_date, ticketIds: [] }) : null;
    let reason = row.email_attempt_exists === true
      ? (row.email_already_sent === true ? 'already_sent' : 'previous_attempt_requires_review')
      : context ? classifyCandidate(row, context, decision, request.asOf) : 'booking_not_found';
    if (reason === 'eligible_pending_live_checks' && Date.parse(row.booking_start_at) - Date.parse(request.asOf) < 115 * 60_000) lateEligible++;
    if (request.confirmSend && reason === 'eligible_pending_live_checks') {
      if (!isRolloutVisit(row.booking_date, row.email)) reason = 'outside_rollout_date';
      // Unsent rows stay unreserved and are picked up by the next five-minute run.
      else if (dependencies.hasTimeLeft && !dependencies.hasTimeLeft()) reason = 'deferred_to_next_run';
      else if (!dependencies.authorizeRollout()) reason = 'rollout_stopped';
      else {
        try { reason = await dependencies.deliver(row); }
        catch { reason = 'delivery_requires_review'; }
        if (!['sent', 'already_attempted', 'booking_changed', 'outside_due_window', 'rollout_stopped', 'delivery_requires_review'].includes(reason)) reason = 'delivery_requires_review';
      }
    }
    counts[reason] = (counts[reason] || 0) + 1;
  }
  const hasMore = rows.length > PAGE_SIZE;
  const last = page[page.length - 1];
  return {
    statusCode: 200,
    body: {
      status: request.confirmSend ? 'prearrival_email_processed' : 'prearrival_email_prepared',
      policy: POLICY,
      dryRun: !request.confirmSend,
      sendsEnabled: request.confirmSend,
      asOf: request.asOf,
      windowEndAt: request.endAt,
      summary: { examined: page.length, counts, lateEligible },
      hasMore,
      // Private authenticated continuation only; never log it or include it in public evidence.
      nextCursor: hasMore ? { asOf: request.asOf, afterStartAt: new Date(last.booking_start_at).toISOString(), afterId: last.roller_unique_id } : null,
      rolloutVisitDate: ROLLOUT.visitDate,
    },
  };
}

// Scheduled runs walk every page with one fixed asOf until done or the time budget ends.
// Remaining rows are not reserved, so the next run re-plans them before their start.
async function processPrearrivalEmailRun(body, dependencies) {
  const totals = {};
  let examined = 0;
  let lateEligible = 0;
  let pages = 0;
  let request = body;
  let result;
  for (;;) {
    result = await preparePrearrivalEmailPage(request, dependencies);
    if (result.statusCode !== 200) return result;
    pages++;
    examined += result.body.summary.examined;
    lateEligible += result.body.summary.lateEligible;
    for (const [reason, count] of Object.entries(result.body.summary.counts)) totals[reason] = (totals[reason] || 0) + count;
    if (!result.body.hasMore || (dependencies.hasTimeLeft && !dependencies.hasTimeLeft())) break;
    request = { ...body, cursor: result.body.nextCursor };
  }
  const { nextCursor, hasMore, summary, ...rest } = result.body;
  return { statusCode: 200, body: { ...rest, pages, complete: !hasMore, summary: { examined, counts: totals, lateEligible } } };
}

module.exports = { POLICY, ROLLOUT, SUPPORTED_PRODUCTS, PAGE_SIZE, PAGE_QUERY, isRolloutDay, isRolloutVisit, normalizePreparation, classifyCandidate, preparePrearrivalEmailPage, processPrearrivalEmailRun };
