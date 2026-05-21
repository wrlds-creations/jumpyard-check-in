const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const ACTIVE_SESSION_STATUSES = ['guest_in_progress', 'ready_for_staff', 'staff_in_progress'];
const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SELECTED_TICKETS = 10;

const rdsClient = new RDSDataClient({});

exports.handler = async (event) => {
  let correlationId = getHeader(event, 'x-correlation-id') || createCorrelationId();

  try {
    const routeKey = event?.routeKey || `${event?.requestContext?.http?.method ?? ''} ${event?.rawPath ?? ''}`.trim();
    const body = parseBody(event);
    correlationId = stringOrNull(body.correlationId) || correlationId;

    if (isStaffSessionListRoute(routeKey, event)) {
      return handleStaffSessionList(event, correlationId);
    }

    if (isStaffSessionDetailRoute(routeKey, event)) {
      return handleStaffSessionDetail(event, correlationId);
    }

    if (isStartSessionRoute(routeKey, event)) {
      return handleStartSession(event, body, correlationId);
    }

    if (isReadyForStaffRoute(routeKey, event)) {
      return handleReadyForStaff(event, body, correlationId);
    }

    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'route_not_found',
        message: 'No JumpYard Cloud check-in session route matched the request.',
      },
    });
  } catch (error) {
    const safeError = classifyError(error);
    return jsonResponse(safeError.statusCode, correlationId, {
      status: safeError.status,
      error: {
        code: safeError.code,
        message: safeError.message,
      },
    });
  }
};

async function handleStartSession(event, body, correlationId) {
  const request = normalizeStartRequest(event, body);
  const validationError = validateStartRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const context = await getBookingContext(request.identifier);
  if (!context) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'booking_not_found',
        message: 'No local JumpYard Cloud booking snapshot was found for the supplied identifier.',
      },
    });
  }

  const decision = evaluateStartContext(context, request);
  if (!decision.canStart) {
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.session_blocked',
      payload: {
        reason: decision.reason,
        ticketCount: decision.selectedTicketIds.length,
      },
      summary: `Check-in session blocked: ${decision.reason}`,
    });

    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: decision.reason,
        message: decision.message,
      },
      sessionPlan: buildSessionPlan(context, decision),
    });
  }

  const requestHash = hashJson({
    bookingReference: context.booking.bookingReference,
    operation: 'checkin_session_start',
    selectedTicketIds: decision.selectedTicketIds,
    visitDate: decision.visitDate,
  });
  const idempotency = await reserveIdempotencyKey('checkin_session_start', request.idempotencyKey, requestHash);
  if (!idempotency.ok) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'idempotency_key_reused',
        message: 'The supplied idempotency key has already been used for a different session request.',
      },
    });
  }

  await expireOldSessions(context.booking.rollerUniqueId, decision.visitDate);
  const existingSession = await findActiveSession(context.booking.rollerUniqueId, decision.visitDate);
  if (existingSession) {
    await writeEventLog({
      booking: context.booking,
      correlationId,
      eventType: 'checkin.session_resumed',
      payload: {
        checkinSessionId: existingSession.checkinSessionId,
        ticketCount: existingSession.selectedTicketIds.length,
      },
      summary: 'Check-in session resumed.',
    });

    return jsonResponse(200, correlationId, {
      status: 'session_resumed',
      session: existingSession,
    });
  }

  const session = await createSession({
    booking: context.booking,
    idempotencyKey: request.idempotencyKey,
    selectedTicketIds: decision.selectedTicketIds,
    sourceLookupRef: request.sourceLookupRef,
    visitDate: decision.visitDate,
  });
  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `checkin_session:${session.checkinSessionId}`);
  await writeEventLog({
    booking: context.booking,
    correlationId,
    eventType: 'checkin.session_started',
    payload: {
      checkinSessionId: session.checkinSessionId,
      ticketCount: session.selectedTicketIds.length,
    },
    summary: 'Check-in session started.',
  });

  return jsonResponse(201, correlationId, {
    status: 'session_started',
    session,
  });
}

async function handleReadyForStaff(event, body, correlationId) {
  const request = normalizeReadyRequest(event, body);
  const validationError = validateReadyRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const session = await findSessionById(request.checkinSessionId);
  if (!session) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'session_not_found',
        message: 'No JumpYard Cloud check-in session was found for the supplied id.',
      },
    });
  }

  if (isExpired(session.expiresAt)) {
    await markSessionExpired(session.checkinSessionId);
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'session_expired',
        message: 'The session has expired and cannot be marked ready for staff.',
      },
      session: {
        ...session,
        handoffStatus: 'expired',
        status: 'expired',
      },
    });
  }

  if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'session_not_active',
        message: 'The session is not active and cannot be marked ready for staff.',
      },
      session,
    });
  }

  const requestHash = hashJson({
    checkinSessionId: request.checkinSessionId,
    operation: 'checkin_session_ready_for_staff',
    safetyStatus: request.safetyStatus,
  });
  const idempotency = await reserveIdempotencyKey('checkin_session_ready_for_staff', request.idempotencyKey, requestHash);
  if (!idempotency.ok) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'idempotency_key_reused',
        message: 'The supplied idempotency key has already been used for a different ready-for-staff request.',
      },
    });
  }

  const handoffCode = session.handoffCode || (await generateUnusedHandoffCode());
  const updatedSession = await markSessionReadyForStaff(session.checkinSessionId, {
    handoffCode,
    safetyStatus: request.safetyStatus,
  });
  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `ready_for_staff:${updatedSession.checkinSessionId}`);
  await writeEventLog({
    booking: updatedSession,
    correlationId,
    eventType: 'checkin.session_ready_for_staff',
    payload: {
      checkinSessionId: updatedSession.checkinSessionId,
      handoffCode: updatedSession.handoffCode,
      ticketCount: updatedSession.selectedTicketIds.length,
    },
    summary: 'Check-in session marked ready for staff.',
  });

  return jsonResponse(200, correlationId, {
    status: 'ready_for_staff',
    session: updatedSession,
  });
}

async function handleStaffSessionList(event, correlationId) {
  const request = normalizeStaffListRequest(event);
  const sessions = await findReadyStaffSessions(request);

  return jsonResponse(200, correlationId, {
    status: 'found',
    sessions,
    meta: {
      count: sessions.length,
      includeExpired: request.includeExpired,
      limit: request.limit,
    },
  });
}

async function handleStaffSessionDetail(event, correlationId) {
  const checkinSessionId =
    stringOrNull(event?.pathParameters?.checkinSessionId) || extractStaffSessionIdFromPath(event?.rawPath);

  if (!checkinSessionId) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: {
        code: 'session_id_required',
        message: 'checkinSessionId is required.',
      },
    });
  }

  const session = await findStaffSessionDetail(checkinSessionId);
  if (!session) {
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'session_not_found',
        message: 'No JumpYard Cloud check-in session was found for the supplied id.',
      },
    });
  }

  return jsonResponse(200, correlationId, {
    status: 'found',
    session,
  });
}

async function expireOldSessions(rollerUniqueId, visitDate) {
  await executeStatement(
    `UPDATE jumpyard.checkin_sessions
     SET status = 'expired',
         handoff_status = 'expired',
         updated_at = now()
     WHERE roller_unique_id = :rollerUniqueId
       AND COALESCE(visit_date, DATE '1900-01-01') = COALESCE(CAST(:visitDate AS date), DATE '1900-01-01')
       AND status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
       AND expires_at <= now()`,
    [stringParameter('rollerUniqueId', rollerUniqueId), stringParameter('visitDate', visitDate)],
  );
}

function normalizeStartRequest(event, body) {
  const bookingReference = stringOrNull(body.bookingReference);
  const rollerUniqueId = stringOrNull(body.rollerUniqueId);
  const identifier = stringOrNull(body.identifier) || bookingReference || rollerUniqueId;
  const rawTicketIds = Array.isArray(body.ticketIds) ? body.ticketIds.map(stringOrNull).filter(Boolean) : [];

  return {
    bookingReference,
    expectedDate: stringOrNull(body.expectedDate) || stringOrNull(body.visitDate),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    identifier,
    rollerUniqueId,
    sourceLookupRef: stringOrNull(body.sourceLookupId) || stringOrNull(body.sourceLookupRef),
    ticketIds: rawTicketIds,
    ticketIdsContainDuplicates: new Set(rawTicketIds).size !== rawTicketIds.length,
  };
}

function normalizeReadyRequest(event, body) {
  return {
    checkinSessionId:
      stringOrNull(event?.pathParameters?.checkinSessionId) ||
      extractSessionIdFromPath(event?.rawPath) ||
      stringOrNull(body.checkinSessionId),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    safetyStatus: normalizeSafetyStatus(body.safetyStatus),
  };
}

function normalizeStaffListRequest(event) {
  const query = event?.queryStringParameters ?? {};
  const limit = Math.min(Math.max(numberOrNull(query.limit) ?? 25, 1), 50);
  const includeExpired = ['1', 'true', 'yes'].includes(String(query.includeExpired ?? '').toLowerCase());

  return {
    includeExpired,
    limit,
  };
}

function validateStartRequest(request) {
  if (!request.identifier) {
    return {
      code: 'identifier_required',
      message: 'bookingReference, rollerUniqueId, or identifier is required.',
    };
  }

  if (!request.idempotencyKey) {
    return {
      code: 'idempotency_key_required',
      message: 'idempotencyKey or x-idempotency-key is required.',
    };
  }

  if (request.ticketIdsContainDuplicates) {
    return {
      code: 'duplicate_ticket_ids',
      message: 'ticketIds must be unique per session request.',
    };
  }

  if (request.ticketIds.length > MAX_SELECTED_TICKETS) {
    return {
      code: 'too_many_tickets',
      message: `At most ${MAX_SELECTED_TICKETS} tickets can be selected for a check-in session.`,
    };
  }

  return null;
}

function validateReadyRequest(request) {
  if (!request.checkinSessionId) {
    return {
      code: 'session_id_required',
      message: 'checkinSessionId is required.',
    };
  }

  if (!request.idempotencyKey) {
    return {
      code: 'idempotency_key_required',
      message: 'idempotencyKey or x-idempotency-key is required.',
    };
  }

  return null;
}

async function getBookingContext(identifier) {
  const result = await executeStatement(
    `SELECT
       b.roller_unique_id,
       b.booking_reference,
       b.roller_env,
       b.booking_status,
       b.payment_status,
       b.amount_owing_cents,
       b.total_cents,
       b.booking_date::text AS booking_date,
       b.start_time::text AS start_time,
       b.end_time::text AS end_time,
       b.freshness_status,
       b.is_tombstoned,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'ticketId', t.ticket_id,
             'bookingItemId', t.booking_item_id,
             'productId', t.product_id,
             'bookingDate', t.booking_date::text,
             'redeemStatusLastSeen', t.redeem_status_last_seen,
             'lastSeenFromRollerAt', t.last_seen_from_roller_at::text
           )
           ORDER BY t.ticket_id
         ) FILTER (WHERE t.ticket_id IS NOT NULL),
         '[]'::jsonb
       )::text AS tickets_json
     FROM jumpyard.roller_bookings AS b
     LEFT JOIN jumpyard.roller_booking_tickets AS t
       ON t.roller_unique_id = b.roller_unique_id
     WHERE b.booking_reference = :identifier
        OR b.roller_unique_id = :identifier
        OR EXISTS (
          SELECT 1
          FROM jumpyard.roller_booking_tickets AS lookup_ticket
          WHERE lookup_ticket.roller_unique_id = b.roller_unique_id
            AND lookup_ticket.ticket_id = :identifier
        )
     GROUP BY
       b.roller_unique_id,
       b.booking_reference,
       b.roller_env,
       b.booking_status,
       b.payment_status,
       b.amount_owing_cents,
       b.total_cents,
       b.booking_date,
       b.start_time,
       b.end_time,
       b.freshness_status,
       b.is_tombstoned
     ORDER BY b.source_last_updated_at DESC
     LIMIT 1`,
    [stringParameter('identifier', identifier)],
  );
  const row = firstMappedRow(result);
  if (!row) return null;

  return {
    booking: {
      amountOwingCents: numberOrNull(row.amount_owing_cents),
      bookingDate: stringOrNull(row.booking_date),
      bookingReference: stringOrNull(row.booking_reference),
      bookingStatus: stringOrNull(row.booking_status),
      endTime: stringOrNull(row.end_time),
      freshnessStatus: stringOrNull(row.freshness_status),
      isTombstoned: Boolean(row.is_tombstoned),
      paymentStatus: stringOrNull(row.payment_status),
      rollerEnv: stringOrNull(row.roller_env),
      rollerUniqueId: stringOrNull(row.roller_unique_id),
      startTime: stringOrNull(row.start_time),
      totalCents: numberOrNull(row.total_cents),
    },
    tickets: parseJsonArray(row.tickets_json).map((ticket) => ({
      bookingDate: stringOrNull(ticket.bookingDate),
      bookingItemId: stringOrNull(ticket.bookingItemId),
      lastSeenFromRollerAt: stringOrNull(ticket.lastSeenFromRollerAt),
      productId: stringOrNull(ticket.productId),
      redeemStatusLastSeen: stringOrNull(ticket.redeemStatusLastSeen),
      ticketId: stringOrNull(ticket.ticketId),
    })),
  };
}

async function findReadyStaffSessions(request) {
  const expiryClause = request.includeExpired ? '' : 'AND cs.expires_at > now()';

  const result = await executeStatement(
    `WITH session_rows AS (
       SELECT
         cs.checkin_session_id,
         cs.roller_unique_id,
         cs.booking_reference,
         cs.visit_date::text AS visit_date,
         cs.status,
         cs.safety_status,
         cs.handoff_code,
         cs.handoff_status,
         cs.selected_ticket_ids::text AS selected_ticket_ids,
         cs.expires_at::text AS expires_at,
         cs.ready_for_staff_at::text AS ready_for_staff_at,
         cs.completed_at::text AS completed_at,
         cs.created_at::text AS created_at,
         cs.updated_at::text AS updated_at,
         b.booking_status,
         b.payment_status,
         b.amount_owing_cents,
         b.total_cents,
         b.booking_date::text AS booking_date,
         b.start_time::text AS start_time,
         b.end_time::text AS end_time,
         b.freshness_status
       FROM jumpyard.checkin_sessions AS cs
       LEFT JOIN jumpyard.roller_bookings AS b
         ON b.roller_unique_id = cs.roller_unique_id
       WHERE cs.handoff_status = 'ready_for_staff'
         AND cs.status = 'ready_for_staff'
         ${expiryClause}
       ORDER BY cs.ready_for_staff_at DESC NULLS LAST, cs.updated_at DESC
       LIMIT ${request.limit}
     )
     SELECT
       session_rows.*,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_items AS item
         WHERE item.roller_unique_id = session_rows.roller_unique_id
       )::int AS item_count,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_tickets AS ticket
         WHERE ticket.roller_unique_id = session_rows.roller_unique_id
       )::int AS ticket_count
     FROM session_rows
     ORDER BY session_rows.ready_for_staff_at DESC NULLS LAST, session_rows.updated_at DESC`,
  );

  return mappedRows(result).map(mapStaffSessionSummaryRow);
}

async function findStaffSessionDetail(checkinSessionId) {
  const result = await executeStatement(
    `SELECT
       cs.checkin_session_id,
       cs.roller_unique_id,
       cs.booking_reference,
       cs.visit_date::text AS visit_date,
       cs.status,
       cs.safety_status,
       cs.handoff_code,
       cs.handoff_status,
       cs.selected_ticket_ids::text AS selected_ticket_ids,
       cs.expires_at::text AS expires_at,
       cs.ready_for_staff_at::text AS ready_for_staff_at,
       cs.completed_at::text AS completed_at,
       cs.created_at::text AS created_at,
       cs.updated_at::text AS updated_at,
       b.booking_status,
       b.payment_status,
       b.amount_owing_cents,
       b.total_cents,
       b.booking_date::text AS booking_date,
       b.start_time::text AS start_time,
       b.end_time::text AS end_time,
       b.freshness_status,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_items AS item
         WHERE item.roller_unique_id = cs.roller_unique_id
       )::int AS item_count,
       (
         SELECT COUNT(*)
         FROM jumpyard.roller_booking_tickets AS ticket
         WHERE ticket.roller_unique_id = cs.roller_unique_id
       )::int AS ticket_count
     FROM jumpyard.checkin_sessions AS cs
     LEFT JOIN jumpyard.roller_bookings AS b
       ON b.roller_unique_id = cs.roller_unique_id
     WHERE cs.checkin_session_id = :checkinSessionId
     LIMIT 1`,
    [stringParameter('checkinSessionId', checkinSessionId)],
  );

  const session = mapStaffSessionSummaryRow(firstMappedRow(result));
  if (!session) return null;

  const items = await findStaffBookingItems(session.rollerUniqueId);
  const tickets = await findStaffBookingTickets(session.rollerUniqueId, session.selectedTicketIds);

  return {
    ...session,
    items,
    tickets,
  };
}

async function findStaffBookingItems(rollerUniqueId) {
  if (!rollerUniqueId) return [];

  const result = await executeStatement(
    `SELECT
       booking_item_key,
       booking_item_id,
       product_id,
       parent_product_id,
       product_name,
       parent_product_name,
       quantity,
       booking_date::text AS booking_date,
       start_time::text AS start_time,
       end_time::text AS end_time,
       item_summary::text AS item_summary
     FROM jumpyard.roller_booking_items
     WHERE roller_unique_id = :rollerUniqueId
     ORDER BY booking_date NULLS LAST, start_time NULLS LAST, product_name NULLS LAST`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );

  return mappedRows(result).map((row) => ({
    bookingDate: stringOrNull(row.booking_date),
    bookingItemId: stringOrNull(row.booking_item_id),
    bookingItemKey: stringOrNull(row.booking_item_key),
    endTime: stringOrNull(row.end_time),
    parentProductId: stringOrNull(row.parent_product_id),
    parentProductName: stringOrNull(row.parent_product_name),
    productId: stringOrNull(row.product_id),
    productName: stringOrNull(row.product_name),
    quantity: numberOrNull(row.quantity) ?? 0,
    startTime: stringOrNull(row.start_time),
    summary: parseJsonObject(row.item_summary),
  }));
}

async function findStaffBookingTickets(rollerUniqueId, selectedTicketIds) {
  if (!rollerUniqueId) return [];

  const selected = new Set(selectedTicketIds);
  const result = await executeStatement(
    `SELECT
       ticket_id,
       custom_ticket_id,
       booking_item_id,
       product_id,
       booking_date::text AS booking_date,
       expiry_date::text AS expiry_date,
       redeem_status_last_seen,
       last_seen_from_roller_at::text AS last_seen_from_roller_at,
       ticket_summary::text AS ticket_summary
     FROM jumpyard.roller_booking_tickets
     WHERE roller_unique_id = :rollerUniqueId
     ORDER BY booking_date NULLS LAST, ticket_id`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );

  return mappedRows(result).map((row) => ({
    bookingDate: stringOrNull(row.booking_date),
    bookingItemId: stringOrNull(row.booking_item_id),
    customTicketId: stringOrNull(row.custom_ticket_id),
    expiryDate: stringOrNull(row.expiry_date),
    lastSeenFromRollerAt: stringOrNull(row.last_seen_from_roller_at),
    productId: stringOrNull(row.product_id),
    redeemStatusLastSeen: stringOrNull(row.redeem_status_last_seen),
    selectedForCheckIn: selected.has(stringOrNull(row.ticket_id)),
    summary: parseJsonObject(row.ticket_summary),
    ticketId: stringOrNull(row.ticket_id),
  }));
}

function evaluateStartContext(context, request) {
  const booking = context.booking;
  const selectedTickets = selectTickets(context.tickets, request.ticketIds);
  const selectedTicketIds = selectedTickets.map((ticket) => ticket.ticketId).filter(Boolean);
  const visitDate = request.expectedDate || booking.bookingDate || selectedTickets.find((ticket) => ticket.bookingDate)?.bookingDate || null;

  if (booking.isTombstoned || isInactiveBookingStatus(booking.bookingStatus)) {
    return blocked('booking_not_active', 'The booking is cancelled, deleted, or otherwise inactive.', selectedTicketIds, visitDate);
  }

  if (booking.freshnessStatus !== 'fresh') {
    return blocked('booking_not_fresh', 'The local booking snapshot is not fresh enough to start check-in.', selectedTicketIds, visitDate);
  }

  if (!isPaymentComplete(booking)) {
    return blocked('payment_required', 'The booking is not fully paid and cannot start check-in yet.', selectedTicketIds, visitDate);
  }

  if (request.expectedDate && !bookingMatchesExpectedDate(booking, context.tickets, request.expectedDate)) {
    return blocked('wrong_date', 'The booking is not valid for the expected check-in date.', selectedTicketIds, visitDate);
  }

  if (request.ticketIds.length > 0 && selectedTickets.length !== request.ticketIds.length) {
    return blocked('unknown_ticket', 'One or more requested ticket ids were not found on the booking.', selectedTicketIds, visitDate);
  }

  if (selectedTicketIds.length === 0) {
    return blocked('no_redeemable_tickets', 'The booking does not have local ticket ids for check-in.', selectedTicketIds, visitDate);
  }

  const usedTicket = selectedTickets.find((ticket) => isUsedRedeemStatus(ticket.redeemStatusLastSeen));
  if (usedTicket) {
    return blocked('already_redeemed', 'At least one selected ticket is already marked redeemed locally.', selectedTicketIds, visitDate);
  }

  return {
    canStart: true,
    message: null,
    reason: 'ready',
    selectedTicketIds,
    visitDate,
  };
}

function selectTickets(tickets, requestedTicketIds) {
  if (requestedTicketIds.length === 0) return tickets;
  const requested = new Set(requestedTicketIds);
  return tickets.filter((ticket) => requested.has(ticket.ticketId));
}

function blocked(reason, message, selectedTicketIds, visitDate) {
  return {
    canStart: false,
    message,
    reason,
    selectedTicketIds,
    visitDate,
  };
}

function buildSessionPlan(context, decision) {
  return {
    bookingReference: context.booking.bookingReference,
    canStartSession: decision.canStart,
    freshnessStatus: context.booking.freshnessStatus,
    reason: decision.reason,
    selectedTicketIds: decision.selectedTicketIds,
    ticketCount: decision.selectedTicketIds.length,
    visitDate: decision.visitDate,
  };
}

async function findActiveSession(rollerUniqueId, visitDate) {
  const result = await executeStatement(
    `SELECT
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at
     FROM jumpyard.checkin_sessions
     WHERE roller_unique_id = :rollerUniqueId
       AND COALESCE(visit_date, DATE '1900-01-01') = COALESCE(CAST(:visitDate AS date), DATE '1900-01-01')
       AND status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
       AND expires_at > now()
     ORDER BY updated_at DESC
     LIMIT 1`,
    [stringParameter('rollerUniqueId', rollerUniqueId), stringParameter('visitDate', visitDate)],
  );

  return mapSessionRow(firstMappedRow(result));
}

async function findSessionById(checkinSessionId) {
  const result = await executeStatement(
    `SELECT
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at
     FROM jumpyard.checkin_sessions
     WHERE checkin_session_id = :checkinSessionId
     LIMIT 1`,
    [stringParameter('checkinSessionId', checkinSessionId)],
  );

  return mapSessionRow(firstMappedRow(result));
}

function mapStaffSessionSummaryRow(row) {
  if (!row) return null;

  const selectedTicketIds = parseJsonArray(row.selected_ticket_ids).map(stringOrNull).filter(Boolean);

  return {
    booking: {
      amountOwingCents: numberOrNull(row.amount_owing_cents),
      bookingDate: stringOrNull(row.booking_date),
      bookingStatus: stringOrNull(row.booking_status),
      endTime: stringOrNull(row.end_time),
      freshnessStatus: stringOrNull(row.freshness_status),
      paymentStatus: stringOrNull(row.payment_status),
      startTime: stringOrNull(row.start_time),
      totalCents: numberOrNull(row.total_cents),
    },
    bookingReference: stringOrNull(row.booking_reference),
    checkinSessionId: stringOrNull(row.checkin_session_id),
    completedAt: stringOrNull(row.completed_at),
    counts: {
      bookingItems: numberOrNull(row.item_count) ?? 0,
      selectedTickets: selectedTicketIds.length,
      tickets: numberOrNull(row.ticket_count) ?? 0,
    },
    createdAt: stringOrNull(row.created_at),
    expiresAt: stringOrNull(row.expires_at),
    handoffCode: stringOrNull(row.handoff_code),
    handoffStatus: stringOrNull(row.handoff_status),
    isExpired: isExpired(row.expires_at),
    readyForStaffAt: stringOrNull(row.ready_for_staff_at),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    safetyStatus: stringOrNull(row.safety_status),
    selectedTicketIds,
    status: stringOrNull(row.status),
    updatedAt: stringOrNull(row.updated_at),
    visitDate: stringOrNull(row.visit_date),
  };
}

async function createSession({ booking, idempotencyKey, selectedTicketIds, sourceLookupRef, visitDate }) {
  const checkinSessionId = createSessionId();
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString();
  const sessionSummary = {
    source: 'checkin_session_api',
    ticketCount: selectedTicketIds.length,
  };

  const result = await executeStatement(
    `INSERT INTO jumpyard.checkin_sessions (
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date,
       status,
       safety_status,
       handoff_status,
       selected_ticket_ids,
       source_lookup_ref,
       idempotency_key,
       expires_at,
       session_summary
     )
     VALUES (
       :checkinSessionId,
       :rollerUniqueId,
       :bookingReference,
       CAST(:visitDate AS date),
       'guest_in_progress',
       'not_started',
       'not_ready',
       CAST(:selectedTicketIds AS jsonb),
       :sourceLookupRef,
       :idempotencyKey,
       CAST(:expiresAt AS timestamptz),
       CAST(:sessionSummary AS jsonb)
     )
     RETURNING
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at`,
    [
      stringParameter('checkinSessionId', checkinSessionId),
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      stringParameter('visitDate', visitDate),
      stringParameter('selectedTicketIds', JSON.stringify(selectedTicketIds)),
      stringParameter('sourceLookupRef', sourceLookupRef),
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('expiresAt', expiresAt),
      stringParameter('sessionSummary', JSON.stringify(sessionSummary)),
    ],
  );

  return mapSessionRow(firstMappedRow(result));
}

async function markSessionReadyForStaff(checkinSessionId, { handoffCode, safetyStatus }) {
  const result = await executeStatement(
    `UPDATE jumpyard.checkin_sessions
     SET
       status = 'ready_for_staff',
       handoff_status = 'ready_for_staff',
       safety_status = COALESCE(:safetyStatus, safety_status),
       handoff_code = COALESCE(handoff_code, :handoffCode),
       ready_for_staff_at = COALESCE(ready_for_staff_at, now()),
       updated_at = now(),
       session_summary = session_summary || CAST(:sessionSummary AS jsonb)
     WHERE checkin_session_id = :checkinSessionId
     RETURNING
       checkin_session_id,
       roller_unique_id,
       booking_reference,
       visit_date::text AS visit_date,
       status,
       safety_status,
       handoff_code,
       handoff_status,
       selected_ticket_ids::text AS selected_ticket_ids,
       expires_at::text AS expires_at,
       ready_for_staff_at::text AS ready_for_staff_at,
       completed_at::text AS completed_at,
       created_at::text AS created_at,
       updated_at::text AS updated_at`,
    [
      stringParameter('checkinSessionId', checkinSessionId),
      stringParameter('handoffCode', handoffCode),
      stringParameter('safetyStatus', safetyStatus),
      stringParameter(
        'sessionSummary',
        JSON.stringify({
          readyForStaffSource: 'checkin_session_api',
        }),
      ),
    ],
  );

  return mapSessionRow(firstMappedRow(result));
}

async function markSessionExpired(checkinSessionId) {
  await executeStatement(
    `UPDATE jumpyard.checkin_sessions
     SET status = 'expired',
         handoff_status = 'expired',
         updated_at = now()
     WHERE checkin_session_id = :checkinSessionId`,
    [stringParameter('checkinSessionId', checkinSessionId)],
  );
}

async function generateUnusedHandoffCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `JY${crypto.randomInt(1000, 10000)}`;
    const result = await executeStatement(
      `SELECT 1 FROM jumpyard.checkin_sessions WHERE handoff_code = :handoffCode LIMIT 1`,
      [stringParameter('handoffCode', code)],
    );
    if ((result.records ?? []).length === 0) return code;
  }

  const error = new Error('Could not allocate a unique handoff code.');
  error.code = 'handoff_code_collision';
  throw error;
}

async function reserveIdempotencyKey(operation, idempotencyKey, requestHash) {
  const insertResult = await executeStatement(
    `INSERT INTO jumpyard.idempotency_records (
       idempotency_key,
       operation,
       request_hash,
       status,
       expires_at
     )
     VALUES (
       :idempotencyKey,
       :operation,
       :requestHash,
       'started',
       now() + interval '2 hours'
     )
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('operation', operation),
      stringParameter('requestHash', requestHash),
    ],
  );

  if ((insertResult.numberOfRecordsUpdated ?? 0) > 0) {
    return { ok: true, replayed: false };
  }

  const existingResult = await executeStatement(
    `SELECT operation, request_hash
     FROM jumpyard.idempotency_records
     WHERE idempotency_key = :idempotencyKey
     LIMIT 1`,
    [stringParameter('idempotencyKey', idempotencyKey)],
  );
  const existing = firstMappedRow(existingResult);

  return {
    ok: existing?.operation === operation && existing?.request_hash === requestHash,
    replayed: true,
  };
}

async function completeIdempotencyKey(idempotencyKey, status, resultRef) {
  await executeStatement(
    `UPDATE jumpyard.idempotency_records
     SET status = :status,
         result_ref = :resultRef,
         updated_at = now()
     WHERE idempotency_key = :idempotencyKey`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('status', status),
      stringParameter('resultRef', resultRef),
    ],
  );
}

async function writeEventLog({ booking, correlationId, eventType, payload, summary }) {
  const subjectRef = booking.checkinSessionId || booking.rollerUniqueId || booking.bookingReference || null;

  await executeStatement(
    `INSERT INTO jumpyard.event_log (
       event_id,
       correlation_id,
       event_type,
       subject_ref,
       summary,
       event_payload
     )
     VALUES (
       :eventId,
       :correlationId,
       :eventType,
       :subjectRef,
       :summary,
       CAST(:eventPayload AS jsonb)
     )`,
    [
      stringParameter('eventId', `evt_${hashString(`${eventType}:${correlationId}:${Date.now()}:${Math.random()}`)}`),
      stringParameter('correlationId', correlationId),
      stringParameter('eventType', eventType),
      stringParameter('subjectRef', subjectRef),
      stringParameter('summary', summary),
      stringParameter('eventPayload', JSON.stringify(payload ?? {})),
    ],
  );
}

function mapSessionRow(row) {
  if (!row) return null;

  return {
    bookingReference: stringOrNull(row.booking_reference),
    checkinSessionId: stringOrNull(row.checkin_session_id),
    completedAt: stringOrNull(row.completed_at),
    createdAt: stringOrNull(row.created_at),
    expiresAt: stringOrNull(row.expires_at),
    handoffCode: stringOrNull(row.handoff_code),
    handoffStatus: stringOrNull(row.handoff_status),
    readyForStaffAt: stringOrNull(row.ready_for_staff_at),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    safetyStatus: stringOrNull(row.safety_status),
    selectedTicketIds: parseJsonArray(row.selected_ticket_ids),
    status: stringOrNull(row.status),
    updatedAt: stringOrNull(row.updated_at),
    visitDate: stringOrNull(row.visit_date),
  };
}

function parseBody(event) {
  if (!event || !event.body) return {};

  let body = event.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'invalid_json';
    throw error;
  }
}

function isStartSessionRoute(routeKey, event) {
  return routeKey === 'POST /v1/check-in/sessions' || event?.rawPath === '/v1/check-in/sessions';
}

function isStaffSessionListRoute(routeKey, event) {
  return (
    routeKey === 'GET /v1/staff/check-in/sessions' ||
    (event?.requestContext?.http?.method === 'GET' && event?.rawPath === '/v1/staff/check-in/sessions')
  );
}

function isStaffSessionDetailRoute(routeKey, event) {
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'GET /v1/staff/check-in/sessions/{checkinSessionId}' ||
    (event?.requestContext?.http?.method === 'GET' && /^\/v1\/staff\/check-in\/sessions\/[^/]+$/.test(rawPath))
  );
}

function isReadyForStaffRoute(routeKey, event) {
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff' ||
    /^\/v1\/check-in\/sessions\/[^/]+\/ready-for-staff$/.test(rawPath)
  );
}

function extractSessionIdFromPath(rawPath) {
  const match = String(rawPath ?? '').match(/^\/v1\/check-in\/sessions\/([^/]+)\/ready-for-staff$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractStaffSessionIdFromPath(rawPath) {
  const match = String(rawPath ?? '').match(/^\/v1\/staff\/check-in\/sessions\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isInactiveBookingStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'deleted' || normalized === 'draft';
}

function isPaymentComplete(booking) {
  if (booking.amountOwingCents !== null && booking.amountOwingCents > 0) return false;

  const status = `${booking.paymentStatus ?? ''} ${booking.bookingStatus ?? ''}`.toLowerCase();
  if (status.includes('pending') || status.includes('draft')) return false;
  if (status.includes('paid') || status.includes('nopaymentrequired')) return true;

  return booking.amountOwingCents === 0;
}

function bookingMatchesExpectedDate(booking, tickets, expectedDate) {
  if (booking.bookingDate === expectedDate) return true;
  return tickets.some((ticket) => ticket.bookingDate === expectedDate);
}

function isUsedRedeemStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  if (!normalized || normalized.includes('unredeemed')) return false;
  return normalized.includes('redeemed') || normalized.includes('used') || normalized.includes('exhausted');
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= Date.now();
}

function normalizeSafetyStatus(value) {
  const normalized = stringOrNull(value);
  if (!normalized) return null;

  const allowed = new Set(['not_started', 'in_progress', 'completed', 'requires_staff', 'skipped']);
  return allowed.has(normalized) ? normalized : 'requires_staff';
}

async function executeStatement(sql, parameters = []) {
  const resourceArn = process.env.DATABASE_CLUSTER_ARN;
  const secretArn = process.env.DATABASE_SECRET_ARN;

  if (!resourceArn || !secretArn) {
    const error = new Error('Database environment is not configured.');
    error.code = 'database_config_error';
    throw error;
  }

  return rdsClient.send(
    new ExecuteStatementCommand({
      database: DATABASE_NAME,
      includeResultMetadata: true,
      parameters,
      resourceArn,
      secretArn,
      sql,
    }),
  );
}

function mappedRows(result) {
  const columns = (result.columnMetadata ?? []).map((column) => column.name);
  return (result.records ?? []).map((record) => {
    const row = {};
    for (let index = 0; index < record.length; index += 1) {
      row[columns[index] ?? String(index)] = fieldToJsValue(record[index]);
    }
    return row;
  });
}

function firstMappedRow(result) {
  return mappedRows(result)[0] ?? null;
}

function fieldToJsValue(field) {
  if (!field || field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return Number(field.longValue);
  if (field.doubleValue !== undefined) return Number(field.doubleValue);
  if (field.booleanValue !== undefined) return Boolean(field.booleanValue);
  if (field.blobValue !== undefined) return field.blobValue;
  if (field.arrayValue !== undefined) return field.arrayValue;
  return null;
}

function getHeader(event, name) {
  const headers = event?.headers ?? {};
  const target = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return null;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim() || null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringParameter(name, value) {
  return value === null || value === undefined
    ? { name, value: { isNull: true } }
    : { name, value: { stringValue: String(value) } };
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function createSessionId() {
  return `jycs_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function hashJson(value) {
  return hashString(JSON.stringify(value));
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function classifyError(error) {
  if (error.code === 'invalid_json') {
    return {
      statusCode: 400,
      status: 'invalid_request',
      code: 'invalid_json',
      message: error.message,
    };
  }

  if (error.code === 'database_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'database_config_error',
      message: 'JumpYard Cloud session database configuration is incomplete.',
    };
  }

  if (error.code === 'handoff_code_collision') {
    return {
      statusCode: 500,
      status: 'internal_error',
      code: 'handoff_code_collision',
      message: 'JumpYard Cloud could not allocate a handoff code.',
    };
  }

  return {
    statusCode: 500,
    status: 'internal_error',
    code: 'session_failed',
    message: 'JumpYard Cloud check-in session operation failed.',
  };
}

function jsonResponse(statusCode, correlationId, payload) {
  return {
    statusCode,
    headers: {
      'access-control-allow-origin': '*',
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify({
      correlationId,
      ...payload,
    }),
  };
}
