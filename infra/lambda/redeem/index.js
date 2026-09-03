const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const MAX_REDEEM_TICKETS = 10;
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const REDEEMABLE_PRODUCT_KEYS = new Set([
  'membership',
  'partypackage',
  'pass',
  'recurringpass',
  'recurringsession',
  'recurringsessions',
  'sessionpass',
  'standardpass',
]);
const NON_REDEEMABLE_PRODUCT_KEYS = new Set([
  'addon',
  'addproduct',
  'beverage',
  'fee',
  'food',
  'foodbeverage',
  'giftcard',
  'merchandise',
  'retail',
  'stock',
  'stockproduct',
]);
const REDEEM_TOKEN_HEADERS = [
  'x-jumpyard-redeem-token',
  'x-api-key',
  'api-key',
];
const STAFF_AUTH_HEADERS = ['x-jumpyard-staff-token', 'authorization'];
const DEFAULT_STAFF_AUTH_TTL_MINUTES = 12 * 60;
const STAFF_AUTH_CONFIG_CACHE_MS = 30 * 1000;
const STAFF_IDENTITY_MODE_COGNITO = 'cognito';
const STAFF_IDENTITY_MODE_PIN = 'pin';
const STAFF_IDENTITY_PROVIDER_COGNITO = 'cognito';
const STAFF_IDENTITY_PROVIDER_PIN = 'local_pin';
const STAFF_PIN_CLIENT_ID = 'jumpyard-pin-v1';
const STAFF_ROLE_OPERATOR = 'staff_operator';
const STAFF_REDEEM_PERMISSION = 'staff:sessions:redeem';
const STAFF_SESSION_IDLE_MINUTES = 15;
const STAFF_SESSION_ABSOLUTE_HOURS = 8;
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const ROLLER_LIVE_BASE_URL = 'https://api.roller.app';
const NACKA_PILOT_VENUE_ID = '50871';
const PRODUCT_CACHE_TTL_MS = 15 * 60 * 1000;
const PROVIDER_CONFIG_CACHE_MS = 5 * 60 * 1000;
const ROLLER_VENUE_IDENTITY_DELAY_MS = 1000;
const SHARED_TOKEN_CACHE_MS = 60 * 1000;
// #333: an in-progress redeem reservation older than this cannot belong to a live execution
// (the handler timeout is shorter), so a retry may take it over and resume.
const REDEEM_IN_PROGRESS_RESUME_AFTER_SECONDS = 30;
const REDEEM_IN_PROGRESS_RETRY_AFTER_SECONDS = 5;

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedRollerConfigExpiresAt = 0;
let cachedToken = null;
let cachedRedeemDevToken = null;
let cachedRedeemDevTokenExpiresAt = 0;
let cachedStaffAuthConfig = null;
let cachedStaffAuthConfigExpiresAt = 0;
let cachedProducts = null;
let hooks = {
  executeStatement: (command) => rdsClient.send(command),
};

exports.handler = async (event) => {
  let correlationId = normalizeCorrelationId(getHeader(event, 'x-correlation-id')) || createCorrelationId();
  const trustedStaffActor = event?.__jumpyardTrustedStaffRedeem === true
    ? event.__jumpyardTrustedStaffActor
    : null;
  const trustedStaffVenueId = stringOrNull(trustedStaffActor?.venueId);

  try {
    if (isStaffSessionRedeemRoute(event)) {
      if (isEmergencyStopEnabled()) {
        return emergencyStopBlockedResponse(correlationId);
      }
      return await handleStaffSessionRedeem(event, correlationId);
    }

    const request = parseRequest(event);
    correlationId = normalizeCorrelationId(request.correlationId) || correlationId;

    const requestError = validateRequest(request);
    if (requestError) {
      return jsonResponse(400, correlationId, {
        status: 'invalid_request',
        error: requestError,
      });
    }

    if (request.confirmRedeem && isEmergencyStopEnabled()) {
      return emergencyStopBlockedResponse(correlationId);
    }

    if (!event.__jumpyardTrustedStaffRedeem) {
      const auth = await verifyRedeemDevToken(event);
      if (!auth.ok) {
        return jsonResponse(403, correlationId, {
          status: 'forbidden',
          error: {
            code: auth.code,
            message: 'The internal redeem route requires the JumpYard service token.',
          },
        });
      }
    }

    const redeemContext = await getRedeemContext(request.identifier, trustedStaffVenueId);
    if (!redeemContext) {
      return jsonResponse(404, correlationId, {
        status: 'not_found',
        error: {
          code: 'booking_not_found',
          message: 'No local JumpYard Cloud booking snapshot was found for the supplied identifier.',
        },
      });
    }

    const decision = evaluateRedeemContext(redeemContext, request);
    if (!decision.canRedeem) {
      await persistCheckinAttempt({
        booking: redeemContext.booking,
        correlationId,
        errorCode: decision.reason,
        idempotencyKey: request.idempotencyKey,
        selectedTicketIds: decision.selectedTicketIds,
        status: 'blocked',
      });
      await writeEventLog({
        booking: redeemContext.booking,
        correlationId,
        eventType: 'checkin.redeem_blocked',
        payload: {
          reason: decision.reason,
          ticketCount: decision.selectedTicketIds.length,
        },
        summary: `Redeem blocked: ${decision.reason}`,
      });

      return jsonResponse(409, correlationId, {
        status: 'blocked',
        error: {
          code: decision.reason,
          message: decision.message,
        },
        redeemPlan: buildRedeemPlan(redeemContext, decision, false),
      });
    }

    if (!request.confirmRedeem) {
      await persistCheckinAttempt({
        booking: redeemContext.booking,
        correlationId,
        errorCode: null,
        idempotencyKey: request.idempotencyKey,
        selectedTicketIds: decision.selectedTicketIds,
        status: 'planned',
      });
      await writeEventLog({
        booking: redeemContext.booking,
        correlationId,
        eventType: 'checkin.redeem_planned',
        payload: {
          ticketCount: decision.selectedTicketIds.length,
        },
        summary: 'Redeem planned without Roller write.',
      });

      return jsonResponse(200, correlationId, {
        status: 'planned',
        redeemPlan: buildRedeemPlan(redeemContext, decision, false),
      });
    }

    const writeGate = evaluateRedeemWriteGate(redeemContext, request, decision);
    if (!writeGate.enabled) {
      await persistCheckinAttempt({
        booking: redeemContext.booking,
        correlationId,
        errorCode: writeGate.reason,
        idempotencyKey: request.idempotencyKey,
        selectedTicketIds: decision.selectedTicketIds,
        status: 'write_disabled',
      });

      return jsonResponse(409, correlationId, {
        status: 'blocked',
        error: {
          code: writeGate.reason,
          message: writeGate.message,
        },
        redeemPlan: buildRedeemPlan(redeemContext, decision, false),
      });
    }

    const config = await getRollerConfig();
    const token = await getRollerAccessToken(config);
    const refreshResult = await refreshRedeemContextFromRoller(
      config,
      token,
      redeemContext,
      request,
      trustedStaffVenueId,
    );
    if (!refreshResult.ok) {
      await persistCheckinAttempt({
        booking: redeemContext.booking,
        correlationId,
        errorCode: refreshResult.reason,
        idempotencyKey: request.idempotencyKey,
        selectedTicketIds: decision.selectedTicketIds,
        status: 'blocked',
      });
      await writeEventLog({
        booking: redeemContext.booking,
        correlationId,
        eventType: 'checkin.redeem_blocked_after_refresh',
        payload: {
          reason: refreshResult.reason,
          ticketCount: decision.selectedTicketIds.length,
        },
        summary: `Redeem blocked after Roller refresh: ${refreshResult.reason}`,
      });

      return jsonResponse(refreshResult.statusCode, correlationId, {
        status: 'blocked',
        error: {
          code: refreshResult.reason,
          message: refreshResult.message,
        },
        redeemPlan: buildRedeemPlan(redeemContext, decision, false),
      });
    }

    const refreshedContext = refreshResult.context;
    const refreshedDecision = evaluateRedeemContext(refreshedContext, request);
    if (!refreshedDecision.canRedeem) {
      await persistCheckinAttempt({
        booking: refreshedContext.booking,
        correlationId,
        errorCode: refreshedDecision.reason,
        idempotencyKey: request.idempotencyKey,
        selectedTicketIds: refreshedDecision.selectedTicketIds,
        status: 'blocked',
      });
      await writeEventLog({
        booking: refreshedContext.booking,
        correlationId,
        eventType: 'checkin.redeem_blocked_after_refresh',
        payload: {
          reason: refreshedDecision.reason,
          ticketCount: refreshedDecision.selectedTicketIds.length,
        },
        summary: `Redeem blocked after Roller refresh: ${refreshedDecision.reason}`,
      });

      return jsonResponse(409, correlationId, {
        status: 'blocked',
        error: {
          code: refreshedDecision.reason,
          message: refreshedDecision.message,
        },
        redeemPlan: buildRedeemPlan(refreshedContext, refreshedDecision, false),
      });
    }

    const refreshedWriteGate = evaluateRedeemWriteGate(refreshedContext, request, refreshedDecision);
    if (!refreshedWriteGate.enabled) {
      await persistCheckinAttempt({
        booking: refreshedContext.booking,
        correlationId,
        errorCode: refreshedWriteGate.reason,
        idempotencyKey: request.idempotencyKey,
        selectedTicketIds: refreshedDecision.selectedTicketIds,
        status: 'write_disabled',
      });

      return jsonResponse(409, correlationId, {
        status: 'blocked',
        error: {
          code: refreshedWriteGate.reason,
          message: refreshedWriteGate.message,
        },
        redeemPlan: buildRedeemPlan(refreshedContext, refreshedDecision, false),
      });
    }

    const requestHash = hashJson({
      bookingReference: refreshedContext.booking.bookingReference,
      redemptionDevice: request.redemptionDevice,
      redemptionDate: request.redemptionDate,
      ticketIds: refreshedDecision.selectedTicketIds,
    });
    if (trustedStaffActor) {
      await writeEventLog({
        booking: refreshedContext.booking,
        correlationId,
        eventType: 'checkin.staff_redeem_intent_recorded',
        payload: {
          ...staffAuditPayload(trustedStaffActor),
          phase: 'pre_idempotency',
          ticketCount: refreshedDecision.selectedTicketIds.length,
        },
        summary: 'Named staff redeem intent recorded before idempotency reservation.',
      });
    }

    const idempotency = await reserveIdempotencyKey(request.idempotencyKey, requestHash);
    if (!idempotency.ok) {
      return idempotencyConflictResponse(correlationId, idempotency);
    }

    const finalizeInput = {
      actor: trustedStaffActor,
      booking: refreshedContext.booking,
      checkinSessionId: event?.__jumpyardTrustedStaffRedeem === true
        ? stringOrNull(event.__jumpyardTrustedStaffSessionId)
        : null,
      correlationId,
      idempotencyKey: request.idempotencyKey,
      ticketIds: refreshedDecision.selectedTicketIds,
    };

    // #333: a replayed key means Roller already accepted exactly this redemption earlier and
    // only the local bookkeeping may be missing. Finish it without touching Roller again.
    if (idempotency.mode === 'replay') {
      return finalizeRecoveredRedeem(finalizeInput, 'local_receipt', null);
    }

    // #333: Roller's per-ticket state is authoritative. When every selected ticket is already
    // redeemed there (a previous attempt died after Roller's OK, or another channel redeemed
    // them), complete the local check-in instead of asking Roller to redeem again.
    const rollerTicketStates = getRollerTicketRedeemStates(
      refreshResult.rollerBooking,
      refreshedDecision.selectedTicketIds,
    );
    if (rollerTicketStates.allRedeemed) {
      return finalizeRecoveredRedeem(finalizeInput, 'roller_ticket_status', null);
    }

    const rollerResult = await redeemRollerTickets(config, token, refreshedDecision.selectedTicketIds, request);

    if (rollerResult.ok) {
      // #333: the durable receipt (tickets, idempotency key and the staff session) is written in
      // one statement right after Roller's OK and before any other bookkeeping, so a timeout or
      // database error later can never leave a Roller-redeemed guest without a completed session.
      const finalizedSession = await finalizeRedeemLocally({
        ...finalizeInput,
        resultRef: `redeemed:${refreshedContext.booking.bookingReference}`,
      });
      await recordRedeemBookkeeping({
        booking: refreshedContext.booking,
        correlationId,
        eventType: 'checkin.redeem_succeeded',
        idempotencyKey: request.idempotencyKey,
        payload: {
          ...(trustedStaffActor ? staffAuditPayload(trustedStaffActor) : {}),
          ticketCount: refreshedDecision.selectedTicketIds.length,
          refreshedFromRoller: true,
        },
        rollerResponseRef: `roller_redemptions:http_${rollerResult.status}`,
        selectedTicketIds: refreshedDecision.selectedTicketIds,
        summary: 'Redeem completed through Roller.',
      });

      return jsonResponse(200, correlationId, {
        status: 'redeemed',
        redeemedTicketIds: refreshedDecision.selectedTicketIds,
        roller: {
          statusCode: rollerResult.status,
        },
        ...(finalizedSession ? { session: buildStaffRedeemSessionResponse(finalizedSession) } : {}),
      });
    }

    if (rollerResult.status === 409) {
      // #333: a 409 may mean "already redeemed", but only Roller's ticket state decides.
      // Any other conflict stays rejected below.
      const recheck = await getBookingDetail(config, token, refreshedContext.booking.rollerUniqueId);
      const recheckStates = recheck.ok
        ? getRollerTicketRedeemStates(
          normalizeBooking(recheck.body, refreshResult.products),
          refreshedDecision.selectedTicketIds,
        )
        : { allRedeemed: false, states: {} };
      if (recheckStates.allRedeemed) {
        return finalizeRecoveredRedeem(finalizeInput, 'roller_ticket_status', rollerResult.status);
      }
    }

    await persistCheckinAttempt({
      booking: refreshedContext.booking,
      correlationId,
      errorCode: 'roller_redeem_rejected',
      idempotencyKey: request.idempotencyKey,
      rollerResponseRef: `roller_redemptions:http_${rollerResult.status}`,
      selectedTicketIds: refreshedDecision.selectedTicketIds,
      status: 'roller_rejected',
    });
    await completeIdempotencyKey(request.idempotencyKey, 'failed', `roller_http_${rollerResult.status}`);

    return jsonResponse(rollerResult.status === 409 ? 409 : 502, correlationId, {
      status: rollerResult.status === 409 ? 'rejected' : 'roller_error',
      error: {
        code: 'roller_redeem_rejected',
        message: `Roller redemption failed with HTTP ${rollerResult.status}.`,
      },
      roller: {
        statusCode: rollerResult.status,
        errors: sanitizeRollerErrors(rollerResult.body),
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

async function handleStaffSessionRedeem(event, correlationId) {
  const body = parseOptionalJsonBody(event);
  correlationId = normalizeCorrelationId(body.correlationId) || correlationId;

  const request = normalizeStaffSessionRedeemRequest(event, body);
  const requestError = validateStaffSessionRedeemRequest(request);
  if (requestError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: requestError,
    });
  }

  const auth = await authorizeStaffRedeemRequest(event);
  if (!auth.ok) {
    if (auth.staff) {
      await writeEventLog({
        booking: { bookingReference: request.checkinSessionId },
        correlationId,
        eventType: 'checkin.staff_redeem_blocked',
        payload: {
          checkinSessionId: request.checkinSessionId,
          reason: auth.code,
          ...staffAuditPayload(auth.staff),
        },
        summary: `Staff redeem blocked: ${auth.code}`,
      });
    }
    return staffAuthErrorResponse(correlationId, auth);
  }

  const session = await getStaffRedeemSession(
    request.checkinSessionId,
    stringOrNull(auth.staff?.venueId),
  );
  if (!session) {
    if (stringOrNull(auth.staff?.staffIdentityId)) {
      await writeEventLog({
        booking: { bookingReference: request.checkinSessionId },
        correlationId,
        eventType: 'checkin.staff_redeem_blocked',
        payload: {
          checkinSessionId: request.checkinSessionId,
          reason: 'session_not_found',
          ...staffAuditPayload(auth.staff),
        },
        summary: 'Staff redeem blocked: session_not_found',
      });
    }
    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'session_not_found',
        message: 'No JumpYard Cloud check-in session was found for the supplied id.',
      },
    });
  }

  const sessionDecision = evaluateStaffRedeemSession(session);
  if (!sessionDecision.canRedeem) {
    await writeEventLog({
      booking: session,
      correlationId,
      eventType: 'checkin.staff_redeem_blocked',
      payload: {
        checkinSessionId: session.checkinSessionId,
        reason: sessionDecision.reason,
        ...staffAuditPayload(auth.staff),
        ticketCount: session.selectedTicketIds.length,
      },
      summary: `Staff redeem blocked: ${sessionDecision.reason}`,
    });

    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: sessionDecision.reason,
        message: sessionDecision.message,
      },
      session: buildStaffRedeemSessionResponse(session),
    });
  }

  // #333: if Roller already accepted this session's redemption earlier (the previous attempt
  // died before the local bookkeeping finished), complete it locally without another Roller call.
  const receipt = await findSucceededRedeemReceipt({
    idempotencyKey: request.idempotencyKey,
    ticketIds: session.selectedTicketIds,
  });
  if (receipt) {
    const recoveredSession = await finalizeRedeemLocally({
      actor: auth.staff,
      checkinSessionId: session.checkinSessionId,
      idempotencyKey: request.idempotencyKey,
      resultRef: `recovered:${receipt.source}:${session.bookingReference}`,
      ticketIds: session.selectedTicketIds,
    });
    await writeEventLog({
      booking: recoveredSession ?? session,
      correlationId,
      eventType: 'checkin.staff_redeem_recovered',
      payload: {
        checkinSessionId: session.checkinSessionId,
        recovered: receipt.source,
        ...staffAuditPayload(auth.staff),
        ticketCount: session.selectedTicketIds.length,
      },
      summary: `Staff-confirmed check-in session completed from ${receipt.source}.`,
    });

    return jsonResponse(200, correlationId, {
      status: 'redeemed',
      recovered: receipt.source,
      redeemedTicketIds: session.selectedTicketIds,
      roller: { statusCode: null },
      session: buildStaffRedeemSessionResponse(recoveredSession ?? session),
    });
  }

  const redeemEvent = {
    ...event,
    body: JSON.stringify({
      bookingReference: session.bookingReference,
      confirmRedeem: true,
      correlationId,
      expectedDate: session.visitDate,
      idempotencyKey: request.idempotencyKey,
      redemptionDate: request.redemptionDate,
      redemptionDevice: request.redemptionDevice,
      rollerUniqueId: session.rollerUniqueId,
      ticketIds: session.selectedTicketIds,
    }),
    __jumpyardTrustedStaffActor: auth.staff,
    __jumpyardTrustedStaffRedeem: true,
    __jumpyardTrustedStaffSessionId: session.checkinSessionId,
    pathParameters: {},
    rawPath: '/v1/check-in/redeem',
    routeKey: 'POST /v1/check-in/redeem',
  };

  const redeemResponse = await exports.handler(redeemEvent);
  const redeemBody = parseJsonOrNull(redeemResponse.body) ?? {};

  if (redeemResponse.statusCode === 200 && redeemBody.status === 'redeemed') {
    // #333: the inner handler normally completes the session inside its durable receipt; the
    // idempotent fallback below only runs when that did not happen.
    const completedSession = redeemBody.session?.status === 'redeemed'
      ? { ...session, ...redeemBody.session }
      : await markStaffSessionRedeemed({
        actor: auth.staff,
        checkinSessionId: session.checkinSessionId,
        redeemedTicketIds: redeemBody.redeemedTicketIds ?? session.selectedTicketIds,
      });
    await writeEventLog({
      booking: completedSession,
      correlationId,
      eventType: 'checkin.staff_redeem_completed',
      payload: {
        checkinSessionId: completedSession.checkinSessionId,
        ...(redeemBody.recovered ? { recovered: redeemBody.recovered } : {}),
        ...staffAuditPayload(auth.staff),
        ticketCount: completedSession.selectedTicketIds.length,
      },
      summary: 'Staff-confirmed check-in session redeemed.',
    });

    return jsonResponse(200, correlationId, {
      status: 'redeemed',
      ...(redeemBody.recovered ? { recovered: redeemBody.recovered } : {}),
      redeemedTicketIds: redeemBody.redeemedTicketIds ?? session.selectedTicketIds,
      roller: redeemBody.roller,
      session: buildStaffRedeemSessionResponse(completedSession),
    });
  }

  await writeEventLog({
    booking: session,
    correlationId,
    eventType: 'checkin.staff_redeem_blocked',
    payload: {
      checkinSessionId: session.checkinSessionId,
      reason: stringOrNull(redeemBody?.error?.code) || stringOrNull(redeemBody.status) || 'redeem_not_completed',
      ...staffAuditPayload(auth.staff),
      ticketCount: session.selectedTicketIds.length,
    },
    summary: 'Staff-confirmed check-in session redeem did not complete.',
  });

  return jsonResponse(redeemResponse.statusCode ?? 500, correlationId, {
    ...redeemBody,
    session: buildStaffRedeemSessionResponse(session),
  });
}

function parseRequest(event) {
  const body = getDecodedRequestBody(event);
  if (body === null) return {};

  try {
    const parsed = JSON.parse(body);
    const bookingReference = stringOrNull(parsed.bookingReference);
    const rollerUniqueId = stringOrNull(parsed.rollerUniqueId);
    const identifier = stringOrNull(parsed.identifier) || bookingReference || rollerUniqueId;
    const idempotencyKey = stringOrNull(parsed.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key'));
    const rawTicketIds = Array.isArray(parsed.ticketIds) ? parsed.ticketIds.map(stringOrNull).filter(Boolean) : [];

    return {
      bookingReference,
      confirmRedeem: parsed.confirmRedeem === true,
      correlationId:
        normalizeCorrelationId(parsed.correlationId) || normalizeCorrelationId(getHeader(event, 'x-correlation-id')),
      expectedDate: stringOrNull(parsed.expectedDate),
      identifier,
      idempotencyKey,
      redemptionDate: stringOrNull(parsed.redemptionDate),
      redemptionDevice: stringOrNull(parsed.redemptionDevice),
      rollerUniqueId,
      ticketIds: rawTicketIds,
      ticketIdsContainDuplicates: new Set(rawTicketIds).size !== rawTicketIds.length,
    };
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'invalid_json';
    throw error;
  }
}

function validateRequest(request) {
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
      message: 'ticketIds must be unique per redeem request.',
    };
  }

  if (request.ticketIds.length > MAX_REDEEM_TICKETS) {
    return {
      code: 'too_many_tickets',
      message: `Roller accepts at most ${MAX_REDEEM_TICKETS} ticket redemptions per call.`,
    };
  }

  return null;
}

function parseOptionalJsonBody(event) {
  const body = getDecodedRequestBody(event);
  if (body === null) return {};

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'invalid_json';
    throw error;
  }
}

function getDecodedRequestBody(event) {
  if (!event || !event.body) return null;

  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    const error = new Error('Request body exceeds the allowed size.');
    error.code = 'payload_too_large';
    throw error;
  }

  return body;
}

function normalizeStaffSessionRedeemRequest(event, body) {
  return {
    checkinSessionId:
      stringOrNull(event?.pathParameters?.checkinSessionId) ||
      extractStaffRedeemSessionIdFromPath(event?.rawPath) ||
      stringOrNull(body.checkinSessionId),
    confirmRedeem: body.confirmRedeem === true,
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    redemptionDate: stringOrNull(body.redemptionDate),
    redemptionDevice: stringOrNull(body.redemptionDevice),
  };
}

function validateStaffSessionRedeemRequest(request) {
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

  if (!request.confirmRedeem) {
    return {
      code: 'confirm_redeem_required',
      message: 'confirmRedeem=true is required for staff-confirmed redeem.',
    };
  }

  return null;
}

async function getStaffRedeemSession(checkinSessionId, staffVenueId = null) {
  const staffVenueClause = staffVenueId ? 'AND booking.venue_id = :staffVenueId' : '';
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
       COALESCE(cs.session_summary ->> 'bookingSyncStatus', 'confirmed') AS booking_sync_status,
       cs.selected_ticket_ids::text AS selected_ticket_ids,
       cs.expires_at::text AS expires_at,
       cs.ready_for_staff_at::text AS ready_for_staff_at,
       cs.completed_at::text AS completed_at,
       cs.updated_at::text AS updated_at
     FROM jumpyard.checkin_sessions AS cs
     LEFT JOIN jumpyard.roller_bookings AS booking
       ON booking.roller_unique_id = cs.roller_unique_id
     WHERE cs.checkin_session_id = :checkinSessionId
       ${staffVenueClause}
     LIMIT 1`,
    [
      stringParameter('checkinSessionId', checkinSessionId),
      ...(staffVenueId ? [stringParameter('staffVenueId', staffVenueId)] : []),
    ],
  );

  return mapStaffRedeemSessionRow(firstMappedRow(result));
}

function evaluateStaffRedeemSession(session) {
  if (session.bookingSyncStatus !== 'confirmed') {
    return {
      canRedeem: false,
      reason: 'booking_sync_pending',
      message: 'Payment is approved, but the ROLLER booking and tickets are still syncing.',
    };
  }

  if (isExpired(session.expiresAt)) {
    return {
      canRedeem: false,
      reason: 'session_expired',
      message: 'The check-in session has expired and cannot be redeemed.',
    };
  }

  if (session.status === 'redeemed' || session.handoffStatus === 'completed') {
    return {
      canRedeem: false,
      reason: 'session_already_completed',
      message: 'The check-in session is already completed.',
    };
  }

  if (session.status !== 'ready_for_staff' || session.handoffStatus !== 'ready_for_staff') {
    return {
      canRedeem: false,
      reason: 'session_not_ready_for_staff',
      message: 'The check-in session is not ready for staff confirmation.',
    };
  }

  if (session.safetyStatus !== 'completed') {
    return {
      canRedeem: false,
      reason: 'safety_not_completed',
      message: 'The safety step must be completed before staff-confirmed redeem.',
    };
  }

  if (!session.bookingReference || !session.rollerUniqueId) {
    return {
      canRedeem: false,
      reason: 'session_missing_booking_context',
      message: 'The check-in session is missing booking context.',
    };
  }

  if (session.selectedTicketIds.length === 0) {
    return {
      canRedeem: false,
      reason: 'no_redeemable_tickets',
      message: 'The check-in session has no selected tickets to redeem.',
    };
  }

  if (session.selectedTicketIds.length > MAX_REDEEM_TICKETS) {
    return {
      canRedeem: false,
      reason: 'too_many_tickets',
      message: `Roller accepts at most ${MAX_REDEEM_TICKETS} ticket redemptions per call.`,
    };
  }

  return {
    canRedeem: true,
    reason: 'ready',
    message: null,
  };
}

async function markStaffSessionRedeemed({ actor, checkinSessionId, redeemedTicketIds }) {
  const staffActor = staffAuditPayload(actor);
  const result = await executeStatement(
    `UPDATE jumpyard.checkin_sessions
     SET
       status = 'redeemed',
       handoff_status = 'completed',
       completed_at = COALESCE(completed_at, now()),
       updated_at = now(),
       session_summary = jsonb_set(
         jsonb_set(
           CASE
             WHEN session_summary ? 'staffActor' THEN session_summary
             ELSE jsonb_set(session_summary, '{staffActor}', CAST(:staffActor AS jsonb), true)
           END,
           '{redeemedBy}',
           COALESCE(session_summary -> 'redeemedBy', '"staff_session_redeem_api"'::jsonb),
           true
         ),
         '{redeemedTicketCount}',
         COALESCE(session_summary -> 'redeemedTicketCount', CAST(:redeemedTicketCount AS jsonb)),
         true
       )
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
       updated_at::text AS updated_at`,
    [
      stringParameter('checkinSessionId', checkinSessionId),
      stringParameter('staffActor', JSON.stringify(staffActor)),
      stringParameter(
        'redeemedTicketCount',
        JSON.stringify(Array.isArray(redeemedTicketIds) ? redeemedTicketIds.length : 0),
      ),
    ],
  );

  return mapStaffRedeemSessionRow(firstMappedRow(result));
}

function mapStaffRedeemSessionRow(row) {
  if (!row) return null;

  return {
    bookingReference: stringOrNull(row.booking_reference),
    bookingSyncStatus: stringOrNull(row.booking_sync_status) || 'confirmed',
    checkinSessionId: stringOrNull(row.checkin_session_id),
    completedAt: stringOrNull(row.completed_at),
    expiresAt: stringOrNull(row.expires_at),
    handoffCode: stringOrNull(row.handoff_code),
    handoffStatus: stringOrNull(row.handoff_status),
    readyForStaffAt: stringOrNull(row.ready_for_staff_at),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    safetyStatus: stringOrNull(row.safety_status),
    selectedTicketIds: parseJsonArray(row.selected_ticket_ids).map(stringOrNull).filter(Boolean),
    status: stringOrNull(row.status),
    updatedAt: stringOrNull(row.updated_at),
    visitDate: stringOrNull(row.visit_date),
  };
}

function buildStaffRedeemSessionResponse(session) {
  if (!session) return null;

  return {
    bookingReference: session.bookingReference,
    checkinSessionId: session.checkinSessionId,
    completedAt: session.completedAt,
    handoffCode: session.handoffCode,
    handoffStatus: session.handoffStatus,
    rollerUniqueId: session.rollerUniqueId,
    safetyStatus: session.safetyStatus,
    selectedTicketIds: session.selectedTicketIds,
    status: session.status,
    visitDate: session.visitDate,
  };
}

async function getRedeemContext(identifier, staffVenueId = null) {
  const staffVenueClause = staffVenueId ? 'AND b.venue_id = :staffVenueId' : '';
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
       b.venue_id,
       b.start_time::text AS start_time,
       b.end_time::text AS end_time,
       b.freshness_status,
       b.is_tombstoned,
       b.last_seen_from_roller_at::text AS last_seen_from_roller_at,
       COALESCE(
         json_agg(
           json_build_object(
             'ticketId', t.ticket_id,
             'bookingItemId', t.booking_item_id,
             'productId', t.product_id,
             'bookingDate', t.booking_date::text,
             'redeemStatusLastSeen', t.redeem_status_last_seen,
             'lastSeenFromRollerAt', t.last_seen_from_roller_at::text,
             'ticketProductType', t.ticket_summary ->> 'productType',
             'ticketProductSubType', t.ticket_summary ->> 'productSubType',
             'ticketSource', t.ticket_summary ->> 'source',
             'itemProductType', item.item_summary ->> 'productType',
             'itemProductSubType', item.item_summary ->> 'productSubType',
             'itemParentType', item.item_summary ->> 'parentType',
             'productCatalogType', product.summary ->> 'productType',
             'productCatalogSubType', product.summary ->> 'productSubType',
             'productCatalogParentType', product.summary ->> 'parentType',
             'productName', COALESCE(item.product_name, product.summary ->> 'name'),
             'parentProductName', COALESCE(item.parent_product_name, product.summary ->> 'parentProductName')
           )
           ORDER BY t.ticket_id
         ) FILTER (WHERE t.ticket_id IS NOT NULL),
         '[]'::json
       )::text AS tickets_json
     FROM jumpyard.roller_bookings AS b
     LEFT JOIN jumpyard.roller_booking_tickets AS t
       ON t.roller_unique_id = b.roller_unique_id
     LEFT JOIN jumpyard.roller_booking_items AS item
       ON item.roller_unique_id = b.roller_unique_id
      AND (
        item.booking_item_key = t.booking_item_key
        OR (t.booking_item_id IS NOT NULL AND item.booking_item_id = t.booking_item_id)
        OR (
          t.booking_item_key IS NULL
          AND t.booking_item_id IS NULL
          AND t.product_id IS NOT NULL
          AND item.product_id = t.product_id
        )
      )
     LEFT JOIN LATERAL (
       SELECT pc.summary
       FROM jumpyard.product_catalog_cache AS pc
       WHERE pc.roller_env = b.roller_env
         AND pc.summary ->> 'id' = COALESCE(NULLIF(t.product_id, ''), NULLIF(item.product_id, ''))
         AND COALESCE(pc.expires_at, pc.fetched_at + interval '24 hours') > now()
       ORDER BY pc.fetched_at DESC
       LIMIT 1
     ) AS product ON true
     WHERE (b.booking_reference = :identifier
        OR b.roller_unique_id = :identifier)
       ${staffVenueClause}
     GROUP BY
       b.roller_unique_id,
       b.booking_reference,
       b.roller_env,
       b.booking_status,
       b.payment_status,
       b.amount_owing_cents,
       b.total_cents,
       b.booking_date,
       b.venue_id,
       b.start_time,
       b.end_time,
       b.freshness_status,
       b.is_tombstoned,
       b.last_seen_from_roller_at
     LIMIT 1`,
    [
      stringParameter('identifier', identifier),
      ...(staffVenueId ? [stringParameter('staffVenueId', staffVenueId)] : []),
    ],
  );
  const row = firstMappedRow(result);
  if (!row) return null;

  const tickets = parseJsonArray(row.tickets_json).map((ticket) => ({
    bookingDate: stringOrNull(ticket.bookingDate),
    bookingItemId: stringOrNull(ticket.bookingItemId),
    lastSeenFromRollerAt: stringOrNull(ticket.lastSeenFromRollerAt),
    parentProductName: stringOrNull(ticket.parentProductName),
    productId: stringOrNull(ticket.productId),
    productCatalogParentType: stringOrNull(ticket.productCatalogParentType),
    productCatalogSubType: stringOrNull(ticket.productCatalogSubType),
    productCatalogType: stringOrNull(ticket.productCatalogType),
    productName: stringOrNull(ticket.productName),
    redeemStatusLastSeen: stringOrNull(ticket.redeemStatusLastSeen),
    ticketId: stringOrNull(ticket.ticketId),
    ticketProductSubType: stringOrNull(ticket.ticketProductSubType),
    ticketProductType: stringOrNull(ticket.ticketProductType),
    ticketSource: stringOrNull(ticket.ticketSource),
    itemParentType: stringOrNull(ticket.itemParentType),
    itemProductSubType: stringOrNull(ticket.itemProductSubType),
    itemProductType: stringOrNull(ticket.itemProductType),
  }));

  return {
    booking: {
      amountOwingCents: numberOrNull(row.amount_owing_cents),
      bookingDate: stringOrNull(row.booking_date),
      bookingReference: stringOrNull(row.booking_reference),
      bookingStatus: stringOrNull(row.booking_status),
      endTime: stringOrNull(row.end_time),
      freshnessStatus: stringOrNull(row.freshness_status),
      isTombstoned: Boolean(row.is_tombstoned),
      lastSeenFromRollerAt: stringOrNull(row.last_seen_from_roller_at),
      paymentStatus: stringOrNull(row.payment_status),
      rollerEnv: stringOrNull(row.roller_env),
      rollerUniqueId: stringOrNull(row.roller_unique_id),
      startTime: stringOrNull(row.start_time),
      totalCents: numberOrNull(row.total_cents),
      venueId: stringOrNull(row.venue_id),
    },
    tickets,
  };
}

function evaluateRedeemContext(context, request) {
  const booking = context.booking;
  const selectedTickets = selectTickets(context.tickets, request.ticketIds);
  const { excludedTickets, redeemableTickets } = splitRedeemableTickets(selectedTickets);
  const selectedTicketIds = redeemableTickets.map((ticket) => ticket.ticketId).filter(Boolean);

  if (booking.isTombstoned || isInactiveBookingStatus(booking.bookingStatus)) {
    return blocked('booking_not_active', 'The booking is cancelled, deleted, or otherwise inactive.', selectedTicketIds, excludedTickets);
  }

  if (booking.freshnessStatus !== 'fresh') {
    return blocked('booking_not_fresh', 'The local booking snapshot is not fresh enough for redemption.', selectedTicketIds, excludedTickets);
  }

  if (!isPaymentComplete(booking)) {
    return blocked('payment_required', 'The booking is not fully paid and cannot be redeemed yet.', selectedTicketIds, excludedTickets);
  }

  if (request.expectedDate && !bookingMatchesExpectedDate(booking, context.tickets, request.expectedDate)) {
    return blocked('wrong_date', 'The booking is not valid for the expected check-in date.', selectedTicketIds, excludedTickets);
  }

  if (request.ticketIds.length > 0 && selectedTickets.length !== request.ticketIds.length) {
    return blocked('unknown_ticket', 'One or more requested ticket ids were not found on the booking.', selectedTicketIds, excludedTickets);
  }

  if (selectedTicketIds.length === 0) {
    return blocked('no_redeemable_tickets', 'The booking does not have local redeemable ticket ids.', selectedTicketIds, excludedTickets);
  }

  if (selectedTicketIds.length > MAX_REDEEM_TICKETS) {
    return blocked(
      'too_many_tickets',
      `Roller accepts at most ${MAX_REDEEM_TICKETS} ticket redemptions per call.`,
      selectedTicketIds,
      excludedTickets,
    );
  }

  const locallyUsedTicket = redeemableTickets.find((ticket) => isUsedRedeemStatus(ticket.redeemStatusLastSeen));
  if (locallyUsedTicket) {
    return blocked(
      'already_redeemed',
      'At least one selected ticket is already marked redeemed locally.',
      selectedTicketIds,
      excludedTickets,
    );
  }

  return {
    canRedeem: true,
    excludedTicketIds: excludedTickets.map((ticket) => ticket.ticketId).filter(Boolean),
    message: null,
    reason: 'ready',
    selectedTicketIds,
  };
}

function selectTickets(tickets, requestedTicketIds) {
  if (requestedTicketIds.length === 0) return tickets;
  const requested = new Set(requestedTicketIds);
  return tickets.filter((ticket) => requested.has(ticket.ticketId));
}

function splitRedeemableTickets(tickets) {
  const redeemableTickets = [];
  const excludedTickets = [];

  for (const ticket of tickets) {
    const eligibility = getTicketRedeemEligibility(ticket);
    if (eligibility.redeemable) {
      redeemableTickets.push(ticket);
    } else {
      excludedTickets.push({
        ...ticket,
        redeemEligibilityReason: eligibility.reason,
      });
    }
  }

  return { excludedTickets, redeemableTickets };
}

function getTicketRedeemEligibility(ticket) {
  const markers = [
    ticket.ticketProductType,
    ticket.ticketProductSubType,
    ticket.itemProductType,
    ticket.itemProductSubType,
    ticket.itemParentType,
    ticket.productCatalogType,
    ticket.productCatalogSubType,
    ticket.productCatalogParentType,
  ].map(productKey).filter(Boolean);

  const nonRedeemableMarker = markers.find((marker) => NON_REDEEMABLE_PRODUCT_KEYS.has(marker));
  if (nonRedeemableMarker) {
    return { reason: `non_redeemable_product_type:${nonRedeemableMarker}`, redeemable: false };
  }

  if (isT0166LiveRedeemSmokeTicketAllowed(ticket.ticketId)) {
    return { reason: 't0166_allowlisted_ticket', redeemable: true };
  }

  if (markers.some((marker) => REDEEMABLE_PRODUCT_KEYS.has(marker))) {
    return { reason: 'redeemable_product_type', redeemable: true };
  }

  const sourceKey = productKey(ticket.ticketSource);
  if (sourceKey?.includes('dataapi') && sourceKey.includes('tickets')) {
    return { reason: 'data_api_ticket_source', redeemable: true };
  }

  return { reason: 'unknown_product_type', redeemable: false };
}

function productKey(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  return normalized || null;
}

function blocked(reason, message, selectedTicketIds, excludedTickets = []) {
  return {
    canRedeem: false,
    excludedTicketIds: excludedTickets.map((ticket) => ticket.ticketId).filter(Boolean),
    message,
    reason,
    selectedTicketIds,
  };
}

function buildRedeemPlan(context, decision, rollerWrite) {
  return {
    bookingReference: context.booking.bookingReference,
    canRedeem: decision.canRedeem,
    freshnessStatus: context.booking.freshnessStatus,
    maxTicketsPerRollerCall: MAX_REDEEM_TICKETS,
    reason: decision.reason,
    requiresConfirmation: !rollerWrite,
    rollerWrite,
    excludedTicketIds: decision.excludedTicketIds ?? [],
    excludedTicketCount: (decision.excludedTicketIds ?? []).length,
    selectedTicketIds: decision.selectedTicketIds,
    ticketCount: decision.selectedTicketIds.length,
  };
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

function evaluateRedeemWriteGate(context, request, decision) {
  const disabled = (reason, message) => ({
    enabled: false,
    message,
    reason,
  });

  if (process.env.ENABLE_ROLLER_REDEEM_WRITES !== 'true') {
    return disabled(
      'redeem_write_disabled',
      'Roller redemption writes are disabled for this JumpYard Cloud environment.',
    );
  }

  if (isEmergencyStopEnabled()) {
    return disabled(
      'emergency_stop_active',
      'Roller redemption writes are disabled while the JumpYard emergency stop is active.',
    );
  }

  if (process.env.JUMPYARD_ENVIRONMENT === 'park-test') {
    if (isT0166LiveRedeemSmokeRuntimeEnabled()) {
      if (!isT0166LiveRedeemAllowed(context, request, decision)) {
        return disabled(
          't0166_live_redeem_not_allowed',
          'This controlled Live redeem smoke only allows the approved booking and ticket identifiers.',
        );
      }

      return {
        enabled: true,
        message: null,
        reason: 't0166_live_redeem_smoke_enabled',
      };
    }

    if (isT0176FullFlowRehearsalEnabled()) {
      if (!isT0176FullFlowRedeemAllowed(context, request)) {
        return disabled(
          't0176_full_flow_redeem_not_allowed',
          'This T0176 full-flow rehearsal only allows the approved park-test date and venue.',
        );
      }

      return {
        enabled: true,
        message: null,
        reason: 't0176_full_flow_rehearsal_enabled',
      };
    }

    return disabled(
      'park_test_redeem_not_approved',
      'Park-test redemption requires an approved scoped redeem or full-flow gate.',
    );
  }

  return {
    enabled: true,
    message: null,
    reason: 'enabled',
  };
}

function isEmergencyStopEnabled() {
  return process.env.JUMPYARD_EMERGENCY_STOP !== 'false';
}

function isT0176FullFlowRehearsalEnabled() {
  return (
    process.env.JUMPYARD_ENVIRONMENT === 'park-test' &&
    process.env.ENABLE_T0176_FULL_FLOW_REHEARSAL === 'true' &&
    process.env.ENABLE_ROLLER_REDEEM_WRITES === 'true'
  );
}

function isT0176FullFlowRedeemAllowed(context, request) {
  const allowedDates = getT0176FullFlowAllowedOperatingDates();
  if (allowedDates.length === 0) return false;

  const requestedDate = normalizeDate(request?.expectedDate);
  const bookingDate = normalizeDate(context?.booking?.bookingDate);
  const ticketDates = (context?.tickets ?? []).map((ticket) => normalizeDate(ticket?.bookingDate)).filter(Boolean);
  const candidateDates = Array.from(new Set([requestedDate, bookingDate, ...ticketDates].filter(Boolean)));
  if (candidateDates.length === 0 || candidateDates.some((date) => !allowedDates.includes(date))) return false;

  const approvedVenueId = stringOrNull(process.env.T0176_FULL_FLOW_VENUE_ID);
  const bookingVenueId = stringOrNull(context?.booking?.venueId);
  if (!approvedVenueId || !bookingVenueId || approvedVenueId !== bookingVenueId) return false;

  return true;
}

function emergencyStopBlockedResponse(correlationId) {
  return jsonResponse(409, correlationId, {
    status: 'blocked',
    error: {
      code: 'emergency_stop_active',
      message: 'Roller redemption is disabled while the JumpYard emergency stop is active.',
    },
  });
}

function getT0176FullFlowAllowedOperatingDates() {
  return String(process.env.T0176_FULL_FLOW_ALLOWED_OPERATING_DATES || '')
    .split(',')
    .map((value) => normalizeDate(value))
    .filter(Boolean);
}

function isT0166LiveRedeemAllowed(context, request, decision) {
  const allowed = parseIdentifierSet(process.env.T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS);
  if (allowed.size === 0) return false;

  const bookingIdentifiers = [
    request.identifier,
    request.bookingReference,
    request.rollerUniqueId,
    context?.booking?.bookingReference,
    context?.booking?.rollerUniqueId,
  ].map(normalizeIdentifier).filter(Boolean);
  const selectedTicketIds = (decision?.selectedTicketIds ?? []).map(normalizeIdentifier).filter(Boolean);
  const bookingAllowed = bookingIdentifiers.some((identifier) => allowed.has(identifier));
  const ticketsAllowed = selectedTicketIds.length > 0 && selectedTicketIds.every((ticketId) => allowed.has(ticketId));

  return bookingAllowed && ticketsAllowed;
}

function isT0166LiveRedeemSmokeTicketAllowed(ticketId) {
  if (!isT0166LiveRedeemSmokeRuntimeEnabled()) return false;
  const normalizedTicketId = normalizeIdentifier(ticketId);
  if (!normalizedTicketId) return false;
  return parseIdentifierSet(process.env.T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS).has(normalizedTicketId);
}

function parseIdentifierSet(value) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map(normalizeIdentifier)
      .filter(Boolean),
  );
}

function normalizeIdentifier(value) {
  return stringOrNull(value)?.toLowerCase() ?? null;
}

async function verifyRedeemDevToken(event) {
  const providedToken = getRedeemAuthToken(event);
  if (!providedToken) {
    return { ok: false, code: 'redeem_token_required' };
  }

  const expectedToken = await getRedeemDevToken();
  if (!safeEquals(providedToken, expectedToken)) {
    return { ok: false, code: 'redeem_token_invalid' };
  }

  return { ok: true, code: null };
}

function getRedeemAuthToken(event) {
  for (const header of REDEEM_TOKEN_HEADERS) {
    const value = getHeader(event, header);
    if (value) return value;
  }

  const authorization = getHeader(event, 'authorization');
  if (authorization) {
    return authorization.replace(/^(Bearer|ApiKey|Token)\s+/i, '').trim();
  }

  return null;
}

async function getRedeemDevToken() {
  if (process.env.REDEEM_DEV_TOKEN) {
    return process.env.REDEEM_DEV_TOKEN;
  }

  const now = Date.now();
  if (cachedRedeemDevToken && cachedRedeemDevTokenExpiresAt > now) return cachedRedeemDevToken;

  const secretId = process.env.REDEEM_DEV_TOKEN_SECRET_ARN;
  if (!secretId) {
    const error = new Error('Redeem dev token secret is not configured.');
    error.code = 'redeem_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Redeem dev token secret has no string value.');
    error.code = 'redeem_config_error';
    throw error;
  }

  try {
    const parsed = JSON.parse(secretString);
    cachedRedeemDevToken = String(parsed.token ?? parsed.redeemToken ?? '').trim();
  } catch {
    cachedRedeemDevToken = secretString.trim();
  }

  if (!cachedRedeemDevToken) {
    const error = new Error('Redeem dev token is empty.');
    error.code = 'redeem_config_error';
    throw error;
  }

  cachedRedeemDevTokenExpiresAt = now + SHARED_TOKEN_CACHE_MS;

  return cachedRedeemDevToken;
}

function isCognitoStaffIdentityMode() {
  return String(process.env.STAFF_IDENTITY_MODE ?? '').trim().toLowerCase() === STAFF_IDENTITY_MODE_COGNITO;
}

function isPinStaffIdentityMode() {
  return String(process.env.STAFF_IDENTITY_MODE ?? '').trim().toLowerCase() === STAFF_IDENTITY_MODE_PIN;
}

function validateCognitoStaffGate() {
  const clientId = stringOrNull(process.env.STAFF_COGNITO_CLIENT_ID);
  const environment = stringOrNull(process.env.STAFF_IDENTITY_ENVIRONMENT);
  const venueId = stringOrNull(process.env.STAFF_IDENTITY_VENUE_ID);
  const runtimeEnvironment = stringOrNull(process.env.JUMPYARD_ENVIRONMENT);
  if (process.env.ENABLE_STAFF_AUTH !== 'true' || isEmergencyStopEnabled()) {
    return {
      ok: false,
      code: 'staff_auth_disabled',
      statusCode: 409,
      message: 'Staff authentication is disabled for this JumpYard Cloud environment.',
    };
  }
  if (!clientId || !environment || !venueId || !runtimeEnvironment || runtimeEnvironment !== environment) {
    return {
      ok: false,
      code: 'staff_identity_config_error',
      statusCode: 500,
      message: 'JumpYard Cloud staff identity configuration is incomplete or inconsistent.',
    };
  }
  return { ok: true, clientId, environment, venueId };
}

function getTrustedCognitoStaffClaims(event) {
  const gate = validateCognitoStaffGate();
  if (!gate.ok) return gate;

  const rawClaims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!rawClaims || typeof rawClaims !== 'object' || Array.isArray(rawClaims)) {
    return {
      ok: false,
      code: 'staff_identity_claims_required',
      statusCode: 401,
      message: 'A trusted staff access token is required.',
    };
  }

  const subject = boundedClaim(rawClaims.sub, 160);
  const clientId = boundedClaim(rawClaims.client_id, 256);
  const tokenUse = boundedClaim(rawClaims.token_use, 32);
  const originJti = boundedClaim(rawClaims.origin_jti, 256);
  const authTime = integerClaim(rawClaims.auth_time);
  const issuedAt = integerClaim(rawClaims.iat);
  const expiresAt = integerClaim(rawClaims.exp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !subject ||
    !clientId ||
    !originJti ||
    tokenUse !== 'access' ||
    authTime === null ||
    issuedAt === null ||
    expiresAt === null ||
    authTime > issuedAt ||
    authTime > nowSeconds + 60 ||
    issuedAt > nowSeconds + 60 ||
    expiresAt <= nowSeconds
  ) {
    return {
      ok: false,
      code: expiresAt !== null && expiresAt <= nowSeconds ? 'staff_auth_token_expired' : 'staff_identity_claims_invalid',
      statusCode: 401,
      message: expiresAt !== null && expiresAt <= nowSeconds
        ? 'Staff authentication has expired.'
        : 'The staff access token claims are invalid.',
    };
  }
  if (clientId !== gate.clientId) {
    return {
      ok: false,
      code: 'staff_identity_audience_invalid',
      statusCode: 401,
      message: 'The staff access token is not intended for this application.',
    };
  }

  const absoluteExpiresAtSeconds = authTime + STAFF_SESSION_ABSOLUTE_HOURS * 60 * 60;
  if (absoluteExpiresAtSeconds <= nowSeconds) {
    return {
      ok: false,
      code: 'staff_auth_session_absolute_expired',
      statusCode: 401,
      message: 'The staff authentication session has reached its maximum duration.',
    };
  }

  return {
    ok: true,
    claims: {
      authTime: new Date(authTime * 1000).toISOString(),
      clientId,
      environment: gate.environment,
      issuedAt: new Date(issuedAt * 1000).toISOString(),
      providerSessionHash: hashString(`${gate.environment}:${clientId}:${originJti}`),
      subject,
      tokenExpiresAt: new Date(expiresAt * 1000).toISOString(),
      venueId: gate.venueId,
    },
  };
}

function validatePinStaffGate() {
  const environment = stringOrNull(process.env.STAFF_IDENTITY_ENVIRONMENT);
  const venueId = stringOrNull(process.env.STAFF_IDENTITY_VENUE_ID);
  const runtimeEnvironment = stringOrNull(process.env.JUMPYARD_ENVIRONMENT);
  if (process.env.ENABLE_STAFF_AUTH !== 'true' || isEmergencyStopEnabled()) {
    return staffAuthFailure(409, 'staff_auth_disabled', 'Staff authentication is disabled for this JumpYard Cloud environment.');
  }
  if (!environment || !venueId || !runtimeEnvironment || environment !== runtimeEnvironment) {
    return staffAuthFailure(500, 'staff_identity_config_error', 'JumpYard Cloud staff identity configuration is incomplete or inconsistent.');
  }
  return { ok: true, environment, venueId };
}

async function authorizePinStaffRedeemRequest(event) {
  const gate = validatePinStaffGate();
  if (!gate.ok) return gate;
  const tokenResult = getLocalPinSessionToken(event);
  if (!tokenResult.ok) return tokenResult;
  const result = await executeStatement(
    `UPDATE jumpyard.staff_auth_sessions AS staff_session
     SET
       role_snapshot = identity.role,
       display_name_snapshot = identity.display_name,
       last_seen_at = now(),
       idle_expires_at = LEAST(staff_session.absolute_expires_at, now() + interval '${STAFF_SESSION_IDLE_MINUTES} minutes'),
       updated_at = now()
     FROM jumpyard.staff_identities AS identity
     WHERE staff_session.provider_session_hash = :tokenHash
       AND staff_session.staff_identity_id = identity.staff_identity_id
       AND staff_session.identity_provider = :identityProvider
       AND staff_session.client_id = :clientId
       AND staff_session.environment = :environment
       AND staff_session.venue_id = :venueId
       AND staff_session.revoked_at IS NULL
       AND staff_session.idle_expires_at > now()
       AND staff_session.absolute_expires_at > now()
       AND identity.identity_provider = :identityProvider
       AND identity.environment = :environment
       AND identity.venue_id = :venueId
       AND identity.active = true
       AND identity.revoked_at IS NULL
       AND staff_session.auth_time >= identity.tokens_valid_after
       AND identity.role = 'staff_operator'
     RETURNING
       staff_session.staff_session_id,
       identity.staff_identity_id,
       identity.provider_subject,
       identity.display_name,
       identity.role,
       identity.environment,
       identity.venue_id`,
    pinSessionParameters(tokenResult.tokenHash, gate),
  );
  const row = firstMappedRow(result);
  if (row) {
    return { ok: true, code: 'authorized', staff: mapCognitoStaffPrincipal(row) };
  }
  return classifyPinStaffRedeemAuthorizationFailure(tokenResult.tokenHash, gate);
}

async function classifyPinStaffRedeemAuthorizationFailure(tokenHash, gate) {
  const result = await executeStatement(
    `SELECT
       staff_session.staff_session_id,
       staff_session.idle_expires_at::text AS idle_expires_at,
       staff_session.absolute_expires_at::text AS absolute_expires_at,
       staff_session.revoked_at::text AS session_revoked_at,
       identity.staff_identity_id,
       identity.provider_subject,
       identity.display_name,
       identity.role,
       identity.environment,
       identity.venue_id,
       identity.active,
       identity.revoked_at::text AS identity_revoked_at,
       identity.tokens_valid_after::text AS tokens_valid_after
     FROM jumpyard.staff_auth_sessions AS staff_session
     INNER JOIN jumpyard.staff_identities AS identity
       ON identity.staff_identity_id = staff_session.staff_identity_id
     WHERE staff_session.provider_session_hash = :tokenHash
       AND staff_session.identity_provider = :identityProvider
       AND staff_session.client_id = :clientId
       AND staff_session.environment = :environment
       AND staff_session.venue_id = :venueId
     LIMIT 1`,
    pinSessionParameters(tokenHash, gate),
  );
  const row = firstMappedRow(result);
  if (!row) return staffAuthFailure(401, 'staff_auth_session_required', 'Staff authentication is required.');
  if (
    row.active !== true ||
    stringOrNull(row.identity_revoked_at) ||
    stringOrNull(row.environment) !== gate.environment ||
    stringOrNull(row.venue_id) !== gate.venueId
  ) {
    return {
      ...staffAuthFailure(403, 'staff_identity_not_authorized', 'This personal staff account is not active for the selected park.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (stringOrNull(row.session_revoked_at)) {
    return {
      ...staffAuthFailure(401, 'staff_auth_session_revoked', 'The staff authentication session has been revoked.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (isTimestampPast(row.absolute_expires_at)) {
    return {
      ...staffAuthFailure(401, 'staff_auth_session_absolute_expired', 'The staff authentication session reached its maximum duration.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (isTimestampPast(row.idle_expires_at)) {
    return {
      ...staffAuthFailure(401, 'staff_auth_session_idle_expired', 'The staff authentication session expired after inactivity.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (stringOrNull(row.role) !== STAFF_ROLE_OPERATOR) {
    return {
      ...staffAuthFailure(403, 'staff_role_forbidden', 'This staff account cannot redeem tickets.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  return {
    ...staffAuthFailure(401, 'staff_auth_session_invalid', 'The staff authentication session is no longer valid.'),
    staff: mapCognitoStaffPrincipal(row),
  };
}

function getLocalPinSessionToken(event) {
  const token = getStaffAuthToken(event);
  if (!token || !/^jypin_[A-Za-z0-9_-]{43}$/.test(token)) {
    return staffAuthFailure(401, 'staff_auth_session_required', 'Staff authentication is required.');
  }
  return { ok: true, tokenHash: hashString(token) };
}

function pinSessionParameters(tokenHash, gate) {
  return [
    stringParameter('tokenHash', tokenHash),
    stringParameter('identityProvider', STAFF_IDENTITY_PROVIDER_PIN),
    stringParameter('clientId', STAFF_PIN_CLIENT_ID),
    stringParameter('environment', gate.environment),
    stringParameter('venueId', gate.venueId),
  ];
}

async function authorizeStaffRedeemRequest(event) {
  if (isPinStaffIdentityMode()) return authorizePinStaffRedeemRequest(event);
  if (!isCognitoStaffIdentityMode()) return verifyStaffAuthToken(event);

  const claimsResult = getTrustedCognitoStaffClaims(event);
  if (!claimsResult.ok) return claimsResult;
  const claims = claimsResult.claims;
  const result = await executeStatement(
    `UPDATE jumpyard.staff_auth_sessions AS staff_session
     SET
       role_snapshot = identity.role,
       display_name_snapshot = identity.display_name,
       token_issued_at = CAST(:tokenIssuedAt AS timestamptz),
       token_expires_at = CAST(:tokenExpiresAt AS timestamptz),
       last_seen_at = now(),
       idle_expires_at = LEAST(staff_session.absolute_expires_at, now() + interval '${STAFF_SESSION_IDLE_MINUTES} minutes'),
       updated_at = now()
     FROM jumpyard.staff_identities AS identity
     WHERE staff_session.provider_session_hash = :providerSessionHash
       AND staff_session.staff_identity_id = identity.staff_identity_id
       AND staff_session.identity_provider = :identityProvider
       AND staff_session.client_id = :clientId
       AND staff_session.environment = :environment
       AND staff_session.venue_id = :venueId
       AND staff_session.auth_time = CAST(:authTime AS timestamptz)
       AND staff_session.revoked_at IS NULL
       AND staff_session.idle_expires_at > now()
       AND staff_session.absolute_expires_at > now()
       AND identity.identity_provider = :identityProvider
       AND identity.provider_subject = :providerSubject
       AND identity.environment = :environment
       AND identity.venue_id = :venueId
       AND identity.active = true
       AND identity.revoked_at IS NULL
       AND CAST(:tokenIssuedAt AS timestamptz) >= identity.tokens_valid_after
       AND identity.role = 'staff_operator'
     RETURNING
       staff_session.staff_session_id,
       identity.staff_identity_id,
       identity.provider_subject,
       identity.display_name,
       identity.role,
       identity.environment,
       identity.venue_id`,
    staffAuthorizationParameters(claims),
  );
  const row = firstMappedRow(result);
  if (row) {
    return {
      ok: true,
      code: 'authorized',
      staff: mapCognitoStaffPrincipal(row),
    };
  }

  return classifyStaffRedeemAuthorizationFailure(claims);
}

async function classifyStaffRedeemAuthorizationFailure(claims) {
  const result = await executeStatement(
    `SELECT
       staff_session.staff_session_id,
       staff_session.idle_expires_at::text AS idle_expires_at,
       staff_session.absolute_expires_at::text AS absolute_expires_at,
       staff_session.revoked_at::text AS session_revoked_at,
       identity.staff_identity_id,
       identity.provider_subject,
       identity.display_name,
       identity.role,
       identity.environment,
       identity.venue_id,
       identity.active,
       identity.revoked_at::text AS identity_revoked_at,
       identity.tokens_valid_after::text AS tokens_valid_after
     FROM jumpyard.staff_auth_sessions AS staff_session
     INNER JOIN jumpyard.staff_identities AS identity
       ON identity.staff_identity_id = staff_session.staff_identity_id
     WHERE staff_session.provider_session_hash = :providerSessionHash
       AND staff_session.identity_provider = :identityProvider
       AND staff_session.client_id = :clientId
       AND staff_session.environment = :environment
       AND staff_session.venue_id = :venueId
       AND identity.identity_provider = :identityProvider
       AND identity.provider_subject = :providerSubject
     LIMIT 1`,
    staffSessionLookupParameters(claims),
  );
  const row = firstMappedRow(result);
  if (!row) {
    return staffAuthFailure(401, 'staff_auth_session_required', 'Start a personal staff session before redeeming.');
  }
  if (
    row.active !== true ||
    stringOrNull(row.identity_revoked_at) ||
    stringOrNull(row.environment) !== claims.environment ||
    stringOrNull(row.venue_id) !== claims.venueId
  ) {
    return {
      ...staffAuthFailure(403, 'staff_identity_not_authorized', 'This personal staff account is not active for the selected park.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (Date.parse(claims.issuedAt) < Date.parse(String(row.tokens_valid_after ?? ''))) {
    return {
      ...staffAuthFailure(401, 'staff_auth_token_revoked', 'The staff access token was issued before the latest identity change.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (stringOrNull(row.session_revoked_at)) {
    return {
      ...staffAuthFailure(401, 'staff_auth_session_revoked', 'The staff authentication session has been revoked.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (isTimestampPast(row.absolute_expires_at)) {
    return {
      ...staffAuthFailure(401, 'staff_auth_session_absolute_expired', 'The staff authentication session reached its maximum duration.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (isTimestampPast(row.idle_expires_at)) {
    return {
      ...staffAuthFailure(401, 'staff_auth_session_idle_expired', 'The staff authentication session expired after inactivity.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  if (stringOrNull(row.role) !== STAFF_ROLE_OPERATOR) {
    return {
      ...staffAuthFailure(403, 'staff_role_forbidden', 'This staff account cannot redeem tickets.'),
      staff: mapCognitoStaffPrincipal(row),
    };
  }
  return {
    ...staffAuthFailure(401, 'staff_auth_session_invalid', 'The staff authentication session is no longer valid.'),
    staff: mapCognitoStaffPrincipal(row),
  };
}

function staffSessionLookupParameters(claims) {
  return [
    stringParameter('identityProvider', STAFF_IDENTITY_PROVIDER_COGNITO),
    stringParameter('providerSessionHash', claims.providerSessionHash),
    stringParameter('providerSubject', claims.subject),
    stringParameter('clientId', claims.clientId),
    stringParameter('environment', claims.environment),
    stringParameter('venueId', claims.venueId),
  ];
}

function staffAuthorizationParameters(claims) {
  return [
    ...staffSessionLookupParameters(claims),
    stringParameter('authTime', claims.authTime),
    stringParameter('tokenIssuedAt', claims.issuedAt),
    stringParameter('tokenExpiresAt', claims.tokenExpiresAt),
  ];
}

function mapCognitoStaffPrincipal(row) {
  return {
    actorId: stringOrNull(row.provider_subject),
    displayName: stringOrNull(row.display_name) || 'JumpYard Staff',
    environment: stringOrNull(row.environment),
    permissions: ['staff:sessions:read', STAFF_REDEEM_PERMISSION],
    role: stringOrNull(row.role),
    sessionId: stringOrNull(row.staff_session_id),
    staffIdentityId: stringOrNull(row.staff_identity_id),
    venueId: stringOrNull(row.venue_id),
  };
}

function staffAuthFailure(statusCode, code, message) {
  return { ok: false, statusCode, code, message };
}

function boundedClaim(value, maxLength) {
  const normalized = stringOrNull(value);
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function integerClaim(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isTimestampPast(value) {
  const timestamp = Date.parse(String(value ?? ''));
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function staffAuthErrorResponse(correlationId, auth) {
  const statusCode = auth.statusCode ?? (auth.code === 'staff_auth_token_expired' ? 401 : 403);
  return jsonResponse(statusCode, correlationId, {
    status: statusCode === 409 ? 'blocked' : statusCode >= 500 ? 'internal_error' : 'forbidden',
    error: {
      code: auth.code,
      message: auth.message ?? (
        auth.code === 'staff_auth_token_expired'
          ? 'Staff authentication has expired.'
          : 'Staff authentication is required for staff-confirmed redeem.'
      ),
    },
  });
}

function staffAuditPayload(staff) {
  return {
    actorId: stringOrNull(staff?.staffIdentityId) || stringOrNull(staff?.actorId) || 'legacy:jumpyard-staff',
    displayName: stringOrNull(staff?.displayName) || 'JumpYard Staff',
    environment: stringOrNull(staff?.environment) || stringOrNull(process.env.JUMPYARD_ENVIRONMENT),
    role: stringOrNull(staff?.role) || STAFF_ROLE_OPERATOR,
    staffSessionId: stringOrNull(staff?.sessionId),
    venueId: stringOrNull(staff?.venueId),
  };
}

async function getStaffAuthConfig() {
  const now = Date.now();
  if (cachedStaffAuthConfig && cachedStaffAuthConfigExpiresAt > now) return cachedStaffAuthConfig;

  const secretId = process.env.STAFF_AUTH_SECRET_ARN;
  if (!secretId) {
    const error = new Error('Staff auth secret is not configured.');
    error.code = 'staff_auth_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Staff auth secret has no string value.');
    error.code = 'staff_auth_config_error';
    throw error;
  }

  let parsed = {};
  try {
    parsed = JSON.parse(secretString);
  } catch {
    parsed = { passcode: secretString };
  }

  const passcode = stringOrNull(parsed.passcode) || stringOrNull(parsed.staffPasscode) || stringOrNull(parsed.token);
  if (!passcode) {
    const error = new Error('Staff auth passcode is empty.');
    error.code = 'staff_auth_config_error';
    throw error;
  }

  cachedStaffAuthConfig = {
    displayName: stringOrNull(parsed.displayName) || 'JumpYard Staff',
    passcode,
    signingSecret: stringOrNull(parsed.signingSecret) || passcode,
    tokenTtlMinutes: readStaffTokenTtlMinutes(parsed.tokenTtlMinutes),
  };
  cachedStaffAuthConfigExpiresAt = now + STAFF_AUTH_CONFIG_CACHE_MS;

  return cachedStaffAuthConfig;
}

async function verifyStaffAuthToken(event) {
  if (isCognitoStaffIdentityMode()) {
    return staffAuthFailure(401, 'staff_legacy_token_disabled', 'Legacy staff tokens are disabled for this environment.');
  }

  const token = getStaffAuthToken(event);
  if (!token) {
    return { ok: false, code: 'staff_auth_token_required' };
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return { ok: false, code: 'staff_auth_token_invalid' };
  }

  const config = await getStaffAuthConfig();
  const expectedSignature = signStaffAuthPayload(encodedPayload, config.signingSecret);
  if (!safeEquals(providedSignature, expectedSignature)) {
    return { ok: false, code: 'staff_auth_token_invalid' };
  }

  const payload = parseJsonOrNull(Buffer.from(encodedPayload, 'base64url').toString('utf8')) ?? {};
  if (payload.scope !== 'staff' || payload.sub !== 'jumpyard-staff') {
    return { ok: false, code: 'staff_auth_token_invalid' };
  }

  if (numberOrNull(payload.exp) === null || numberOrNull(payload.exp) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, code: 'staff_auth_token_expired' };
  }

  return {
    ok: true,
    code: 'authorized',
    staff: {
      displayName: stringOrNull(payload.displayName) || config.displayName,
    },
  };
}

function getStaffAuthToken(event) {
  for (const headerName of STAFF_AUTH_HEADERS) {
    const value = getHeader(event, headerName);
    if (!value) continue;

    const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
    return bearerMatch ? bearerMatch[1].trim() : value;
  }

  return null;
}

function signStaffAuthPayload(encodedPayload, signingSecret) {
  return crypto.createHmac('sha256', signingSecret).update(encodedPayload).digest('base64url');
}

function readStaffTokenTtlMinutes(value) {
  const parsed = numberOrNull(value);
  if (parsed === null) return DEFAULT_STAFF_AUTH_TTL_MINUTES;
  return Math.min(Math.max(Math.floor(parsed), 5), 24 * 60);
}

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function refreshRedeemContextFromRoller(config, token, existingContext, request, staffVenueId = null) {
  const identifier = existingContext.booking.rollerUniqueId || existingContext.booking.bookingReference || request.identifier;
  const bookingResult = await getBookingDetail(config, token, identifier);

  if (bookingResult.status === 404) {
    return {
      ok: false,
      statusCode: 409,
      reason: 'booking_not_found_after_refresh',
      message: 'Roller Playground no longer has this booking at final redeem refresh.',
    };
  }

  if (!bookingResult.ok) {
    return {
      ok: false,
      statusCode: 502,
      reason: 'roller_refresh_failed',
      message: `Final Roller refresh failed with HTTP ${bookingResult.status}.`,
    };
  }

  const products = await getProductCatalogBestEffort(config, token);
  const booking = normalizeBooking(bookingResult.body, products);
  if (!booking.bookingReference || !booking.rollerUniqueId) {
    return {
      ok: false,
      statusCode: 502,
      reason: 'roller_refresh_invalid',
      message: 'Final Roller refresh did not return required booking identifiers.',
    };
  }

  const verifiedVenue = await resolveVerifiedRedeemVenue(config, token, booking.venueId, staffVenueId);
  if (!verifiedVenue.ok) {
    return {
      ok: false,
      statusCode: 403,
      reason: 'staff_venue_mismatch',
      message: 'The refreshed booking does not belong to the staff member\'s approved venue.',
    };
  }
  booking.venueId = verifiedVenue.venueId;

  await upsertLiveBooking(booking, config.env);
  const refreshedContext = await getRedeemContext(booking.rollerUniqueId, staffVenueId);

  if (!refreshedContext) {
    return {
      ok: false,
      statusCode: 502,
      reason: 'booking_refresh_not_persisted',
      message: 'Final Roller refresh could not be read back from JumpYard Cloud.',
    };
  }

  return {
    ok: true,
    context: refreshedContext,
    products,
    rollerBooking: booking,
  };
}

async function resolveVerifiedRedeemVenue(config, token, bookingVenueId, staffVenueId) {
  const normalizedBookingVenueId = stringOrNull(bookingVenueId);
  const normalizedStaffVenueId = stringOrNull(staffVenueId);
  if (!normalizedStaffVenueId) return { ok: true, venueId: normalizedBookingVenueId };

  // Explicit booking venue remains authoritative and must match the authorized staff venue.
  if (normalizedBookingVenueId) {
    return {
      ok: normalizedBookingVenueId === normalizedStaffVenueId,
      venueId: normalizedBookingVenueId,
    };
  }

  // Reuse the D0179 Live fallback only for the exact, internally consistent Nacka pilot scope.
  const configuredStaffVenueId = stringOrNull(process.env.STAFF_IDENTITY_VENUE_ID);
  const configuredFullFlowVenueId = stringOrNull(process.env.T0176_FULL_FLOW_VENUE_ID);
  if (
    normalizedStaffVenueId !== NACKA_PILOT_VENUE_ID ||
    configuredStaffVenueId !== NACKA_PILOT_VENUE_ID ||
    configuredFullFlowVenueId !== NACKA_PILOT_VENUE_ID
  ) {
    return { ok: false, venueId: null };
  }

  const verifiedVenueId = await getVerifiedRollerVenueId(
    config,
    token,
    NACKA_PILOT_VENUE_ID,
  );
  return {
    ok: verifiedVenueId === normalizedStaffVenueId,
    venueId: verifiedVenueId,
  };
}

async function getVerifiedRollerVenueId(config, token, expectedVenueId) {
  if (String(config?.env).toLowerCase() !== 'live' || !stringOrNull(expectedVenueId)) return null;

  // Keep the venue-identity request outside the preceding Roller request window.
  await new Promise((resolve) => setTimeout(resolve, ROLLER_VENUE_IDENTITY_DELAY_MS));
  try {
    const response = await fetch(buildRollerUrl(config.baseUrl, '/venues/me'), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      },
    });
    emitRollerApiMetric({ method: 'GET', operation: 'get_venue_identity', status: response.status, ok: response.ok });
    if (!response.ok) return null;

    const text = await response.text();
    const body = parseJsonOrNull(text);
    const venueId = extractRollerVenueIdentity(body);
    return venueId === stringOrNull(expectedVenueId) ? venueId : null;
  } catch {
    return null;
  }
}

function extractRollerVenueIdentity(body) {
  for (const candidate of [body?.venue, body?.data, body]) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const venueId = stringOrNull(candidate.id ?? candidate.venueId ?? candidate.venueID);
    if (venueId) return venueId;
  }
  return null;
}

async function reserveIdempotencyKey(idempotencyKey, requestHash) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const result = await executeStatement(
    `INSERT INTO jumpyard.idempotency_records (
      idempotency_key,
      operation,
      request_hash,
      status,
      expires_at
    )
    VALUES (
      :idempotencyKey,
      'redeem',
      :requestHash,
      'in_progress',
      CAST(:expiresAt AS timestamptz)
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      operation = EXCLUDED.operation,
      request_hash = EXCLUDED.request_hash,
      status = EXCLUDED.status,
      result_ref = NULL,
      expires_at = EXCLUDED.expires_at,
      created_at = now(),
      updated_at = now()
    WHERE jumpyard.idempotency_records.expires_at <= now()`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('requestHash', requestHash),
      stringParameter('expiresAt', expiresAt),
    ],
  );

  if (Number(result.numberOfRecordsUpdated ?? 0) === 1) {
    return { ok: true, mode: 'reserved' };
  }

  return claimExistingIdempotencyKey(idempotencyKey, requestHash);
}

/**
 * #333: the same key with the same request is a retry of one redeem operation, never a new one.
 * A succeeded record is replayed, a stale in-progress record (the earlier execution died) is
 * resumed, a failed record may be retried, and a live in-progress record on another device is
 * reported as busy. A different request behind the same key is still rejected.
 */
async function claimExistingIdempotencyKey(idempotencyKey, requestHash) {
  const existing = firstMappedRow(await executeStatement(
    `SELECT
       status,
       request_hash,
       result_ref,
       (updated_at < now() - make_interval(secs => :resumeAfterSeconds)) AS stale
     FROM jumpyard.idempotency_records
     WHERE idempotency_key = :idempotencyKey
       AND operation = 'redeem'
     LIMIT 1`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      intParameter('resumeAfterSeconds', REDEEM_IN_PROGRESS_RESUME_AFTER_SECONDS),
    ],
  ));

  if (!existing || stringOrNull(existing.request_hash) !== requestHash) {
    return { ok: false, mode: 'conflict', reason: 'idempotency_key_reused' };
  }

  const status = stringOrNull(existing.status);
  if (status === 'succeeded') {
    return { ok: true, mode: 'replay', resultRef: stringOrNull(existing.result_ref) };
  }

  if (status === 'in_progress' && existing.stale !== true) {
    return { ok: false, mode: 'in_progress', reason: 'redeem_in_progress' };
  }

  const claimed = await executeStatement(
    `UPDATE jumpyard.idempotency_records
     SET status = 'in_progress',
         result_ref = NULL,
         updated_at = now()
     WHERE idempotency_key = :idempotencyKey
       AND operation = 'redeem'
       AND request_hash = :requestHash
       AND (
         status = 'failed'
         OR (status = 'in_progress' AND updated_at < now() - make_interval(secs => :resumeAfterSeconds))
       )`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('requestHash', requestHash),
      intParameter('resumeAfterSeconds', REDEEM_IN_PROGRESS_RESUME_AFTER_SECONDS),
    ],
  );

  if (Number(claimed.numberOfRecordsUpdated ?? 0) !== 1) {
    return { ok: false, mode: 'in_progress', reason: 'redeem_in_progress' };
  }

  return { ok: true, mode: status === 'failed' ? 'retry_after_failure' : 'resumed' };
}

function idempotencyConflictResponse(correlationId, idempotency) {
  if (idempotency.reason === 'redeem_in_progress') {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'redeem_in_progress',
        message: 'This check-in is already being completed. Wait a few seconds and try again.',
      },
      retryAfterSeconds: REDEEM_IN_PROGRESS_RETRY_AFTER_SECONDS,
    });
  }

  return jsonResponse(409, correlationId, {
    status: 'blocked',
    error: {
      code: 'idempotency_key_reused',
      message: 'The supplied idempotency key has already been used for a redeem operation.',
    },
  });
}

/**
 * #333: evidence that Roller already accepted this redemption: the same stable key completed
 * earlier. Older random keys have no receipt and fall through to Roller's own ticket state.
 * (The redeem runtime role may only insert into checkin_attempts, so attempts are not read.)
 */
async function findSucceededRedeemReceipt({ idempotencyKey, ticketIds }) {
  const selected = (Array.isArray(ticketIds) ? ticketIds : []).filter(Boolean);
  if (selected.length === 0 || !idempotencyKey) return null;

  const keyRow = firstMappedRow(await executeStatement(
    `SELECT status
     FROM jumpyard.idempotency_records
     WHERE idempotency_key = :idempotencyKey
       AND operation = 'redeem'
       AND status = 'succeeded'
     LIMIT 1`,
    [stringParameter('idempotencyKey', idempotencyKey)],
  ));

  return keyRow ? { source: 'local_receipt', via: 'idempotency_key' } : null;
}

/**
 * #333: the durable receipt. Tickets, the idempotency key and (for staff redeem) the check-in
 * session are completed in one statement, so they can never be left half-done.
 */
async function finalizeRedeemLocally({ actor, checkinSessionId, idempotencyKey, resultRef, ticketIds }) {
  const selected = (Array.isArray(ticketIds) ? ticketIds : []).filter(Boolean);
  const parameters = [
    stringParameter('ticketIds', JSON.stringify(selected)),
    stringParameter('idempotencyKey', idempotencyKey),
    stringParameter('resultRef', resultRef),
  ];
  const ticketAndKeyCtes = `
    WITH marked_tickets AS (
      UPDATE jumpyard.roller_booking_tickets
      SET redeem_status_last_seen = 'redeemed',
          last_seen_from_roller_at = now(),
          updated_at = now()
      WHERE ticket_id IN (SELECT jsonb_array_elements_text(CAST(:ticketIds AS jsonb)))
      RETURNING ticket_id
    ),
    completed_key AS (
      UPDATE jumpyard.idempotency_records
      SET status = 'succeeded',
          result_ref = :resultRef,
          updated_at = now()
      WHERE idempotency_key = :idempotencyKey
        AND operation = 'redeem'
      RETURNING idempotency_key
    )`;

  if (!checkinSessionId) {
    await executeStatement(
      `${ticketAndKeyCtes}
       SELECT
         (SELECT count(*) FROM marked_tickets) AS marked_tickets,
         (SELECT count(*) FROM completed_key) AS completed_keys`,
      parameters,
    );
    return null;
  }

  const result = await executeStatement(
    `${ticketAndKeyCtes}
     UPDATE jumpyard.checkin_sessions
     SET
       status = 'redeemed',
       handoff_status = 'completed',
       completed_at = COALESCE(completed_at, now()),
       updated_at = now(),
       session_summary = jsonb_set(
         jsonb_set(
           CASE
             WHEN session_summary ? 'staffActor' THEN session_summary
             ELSE jsonb_set(session_summary, '{staffActor}', CAST(:staffActor AS jsonb), true)
           END,
           '{redeemedBy}',
           COALESCE(session_summary -> 'redeemedBy', '"staff_session_redeem_api"'::jsonb),
           true
         ),
         '{redeemedTicketCount}',
         COALESCE(session_summary -> 'redeemedTicketCount', CAST(:redeemedTicketCount AS jsonb)),
         true
       )
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
       updated_at::text AS updated_at`,
    [
      ...parameters,
      stringParameter('checkinSessionId', checkinSessionId),
      stringParameter('staffActor', JSON.stringify(staffAuditPayload(actor))),
      stringParameter('redeemedTicketCount', JSON.stringify(selected.length)),
    ],
  );

  return mapStaffRedeemSessionRow(firstMappedRow(result));
}

/** #333: attempt/event bookkeeping after the receipt is durable; a failure here must not undo it. */
async function recordRedeemBookkeeping({
  booking,
  correlationId,
  eventType,
  idempotencyKey,
  payload,
  rollerResponseRef,
  selectedTicketIds,
  summary,
}) {
  try {
    await persistCheckinAttempt({
      booking,
      correlationId,
      errorCode: null,
      idempotencyKey,
      rollerResponseRef,
      selectedTicketIds,
      status: 'redeemed',
    });
    await writeEventLog({ booking, correlationId, eventType, payload, summary });
  } catch (error) {
    console.warn(JSON.stringify({
      correlationId,
      eventType: 'checkin.redeem_bookkeeping_failed',
      failureClass: error?.name || 'Error',
      failureCode: stringOrNull(error?.code),
    }));
  }
}

async function finalizeRecoveredRedeem(input, recovered, rollerStatusCode) {
  const finalizedSession = await finalizeRedeemLocally({
    ...input,
    resultRef: `recovered:${recovered}:${input.booking.bookingReference}`,
  });
  await recordRedeemBookkeeping({
    booking: input.booking,
    correlationId: input.correlationId,
    eventType: 'checkin.redeem_recovered',
    idempotencyKey: input.idempotencyKey,
    payload: {
      ...(input.actor ? staffAuditPayload(input.actor) : {}),
      recovered,
      rollerStatusCode,
      ticketCount: input.ticketIds.length,
    },
    rollerResponseRef: rollerStatusCode === null ? `recovered:${recovered}` : `roller_redemptions:http_${rollerStatusCode}`,
    selectedTicketIds: input.ticketIds,
    summary: `Redeem completed locally from ${recovered}.`,
  });

  return jsonResponse(200, input.correlationId, {
    status: 'redeemed',
    recovered,
    redeemedTicketIds: input.ticketIds,
    roller: {
      statusCode: rollerStatusCode,
    },
    ...(finalizedSession ? { session: buildStaffRedeemSessionResponse(finalizedSession) } : {}),
  });
}

async function completeIdempotencyKey(idempotencyKey, status, resultRef) {
  await executeStatement(
    `UPDATE jumpyard.idempotency_records
     SET status = :status,
         result_ref = :resultRef,
         updated_at = now()
     WHERE idempotency_key = :idempotencyKey
       AND operation = 'redeem'`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('resultRef', resultRef),
      stringParameter('status', status),
    ],
  );
}

async function persistCheckinAttempt({
  booking,
  correlationId,
  errorCode,
  idempotencyKey,
  rollerResponseRef = null,
  selectedTicketIds,
  status,
}) {
  const attemptId = `redeem_attempt:${hashString(`${correlationId}:${status}:${Date.now()}:${crypto.randomUUID()}`)}`;

  await executeStatement(
    `INSERT INTO jumpyard.checkin_attempts (
      attempt_id,
      correlation_id,
      roller_unique_id,
      booking_reference,
      selected_ticket_ids,
      status,
      error_code,
      roller_response_ref,
      idempotency_key
    )
    VALUES (
      :attemptId,
      :correlationId,
      :rollerUniqueId,
      :bookingReference,
      CAST(:selectedTicketIds AS jsonb),
      :status,
      :errorCode,
      :rollerResponseRef,
      :idempotencyKey
    )`,
    [
      stringParameter('attemptId', attemptId),
      stringParameter('correlationId', correlationId),
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      stringParameter('selectedTicketIds', JSON.stringify(selectedTicketIds)),
      stringParameter('status', status),
      stringParameter('errorCode', errorCode),
      stringParameter('rollerResponseRef', rollerResponseRef),
      stringParameter('idempotencyKey', idempotencyKey),
    ],
  );
}

async function writeEventLog({ booking, correlationId, eventType, payload, summary }) {
  const eventId = `${eventType}:${hashString(`${correlationId}:${Date.now()}:${crypto.randomUUID()}`)}`;

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
      stringParameter('eventId', eventId),
      stringParameter('correlationId', correlationId),
      stringParameter('eventType', eventType),
      stringParameter('subjectRef', booking.bookingReference),
      stringParameter('summary', summary),
      stringParameter('eventPayload', JSON.stringify(payload ?? {})),
    ],
  );
}

async function markTicketsRedeemed(ticketIds) {
  for (const ticketId of ticketIds) {
    await executeStatement(
      `UPDATE jumpyard.roller_booking_tickets
       SET redeem_status_last_seen = 'redeemed',
           last_seen_from_roller_at = now(),
           updated_at = now()
       WHERE ticket_id = :ticketId`,
      [stringParameter('ticketId', ticketId)],
    );
  }
}

async function getRollerConfig() {
  const now = Date.now();
  if (cachedRollerConfig && cachedRollerConfigExpiresAt > now) return cachedRollerConfig;

  const [envParameter, baseUrlParameter, secret] = await Promise.all([
    readParameter(process.env.ROLLER_ENV_PARAMETER_NAME),
    readParameter(process.env.ROLLER_BASE_URL_PARAMETER_NAME),
    readSecret(process.env.ROLLER_CREDENTIALS_SECRET_ARN),
  ]);

  const config = {
    env: envParameter,
    baseUrl: baseUrlParameter,
    clientId: String(secret.clientId ?? secret.client_id ?? '').trim(),
    clientSecret: String(secret.clientSecret ?? secret.client_secret ?? '').trim(),
  };

  validateRollerConfig(config);
  cachedRollerConfig = config;
  cachedRollerConfigExpiresAt = now + PROVIDER_CONFIG_CACHE_MS;
  return config;
}

async function readParameter(name) {
  if (!name) {
    const error = new Error('Missing Roller SSM parameter environment variable.');
    error.code = 'redeem_config_error';
    throw error;
  }

  const response = await ssmClient.send(new GetParameterCommand({ Name: name }));
  return String(response.Parameter?.Value ?? '').trim();
}

async function readSecret(secretId) {
  if (!secretId) {
    const error = new Error('Missing Roller credentials secret environment variable.');
    error.code = 'redeem_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Roller credentials secret has no string value.');
    error.code = 'redeem_config_error';
    throw error;
  }

  return JSON.parse(secretString);
}

function validateRollerConfig(config) {
  const errors = [];
  let parsedBaseUrl = null;
  const liveRedeemSmokeEnabled = isT0166LiveRedeemSmokeRuntimeEnabled();
  const fullFlowRehearsalEnabled = isT0176FullFlowRehearsalEnabled();
  const liveRedeemEnabled = liveRedeemSmokeEnabled || fullFlowRehearsalEnabled;

  if (liveRedeemEnabled) {
    if (config.env !== 'live') {
      errors.push('Park-test Live redeem requires Roller environment live.');
    }
  } else if (config.env !== 'playground') {
    errors.push('Roller environment must be playground.');
  }

  try {
    parsedBaseUrl = new URL(config.baseUrl);
  } catch {
    errors.push('Roller base URL must be valid.');
  }

  if (parsedBaseUrl) {
    const searchableUrl = `${parsedBaseUrl.hostname}${parsedBaseUrl.pathname}`;
    if (parsedBaseUrl.protocol !== 'https:') {
      errors.push('Roller base URL must use https.');
    }
    if (liveRedeemEnabled) {
      if (parsedBaseUrl.origin !== ROLLER_LIVE_BASE_URL || parsedBaseUrl.pathname !== '/') {
        errors.push(`Park-test Live redeem requires Roller base URL ${ROLLER_LIVE_BASE_URL}.`);
      }
    } else {
      if (PRODUCTION_URL_MARKER.test(searchableUrl)) {
        errors.push('Roller base URL looks like production/live.');
      }
      if (!PLAYGROUND_URL_MARKER.test(searchableUrl)) {
        errors.push('Roller base URL must point to Playground.');
      }
    }
  }

  if (!config.clientId || config.clientId === 'SET_IN_AWS_ONLY') {
    errors.push('Roller client id is not configured.');
  }

  if (!config.clientSecret) {
    errors.push('Roller client secret is not configured.');
  }

  if (errors.length > 0) {
    const error = new Error(errors.join(' '));
    error.code = 'redeem_config_error';
    throw error;
  }
}

function isT0166LiveRedeemSmokeRuntimeEnabled() {
  return (
    process.env.JUMPYARD_ENVIRONMENT === 'park-test' &&
    process.env.ENABLE_T0166_LIVE_REDEEM_SMOKE === 'true' &&
    process.env.ENABLE_ROLLER_REDEEM_WRITES === 'true' &&
    parseIdentifierSet(process.env.T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS).size > 0
  );
}

async function getRollerAccessToken(config) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken;
  }

  const response = await fetch(buildRollerUrl(config.baseUrl, '/token'), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  emitRollerApiMetric({ method: 'POST', operation: 'oauth_token', status: response.status, ok: response.ok });

  if (!response.ok) {
    const error = new Error(`Roller token request failed with HTTP ${response.status}.`);
    error.code = 'roller_token_error';
    throw error;
  }

  const body = await response.json();
  const accessToken = body.access_token ?? body.accessToken;
  if (!accessToken) {
    const error = new Error('Roller token response did not include an access token.');
    error.code = 'roller_token_error';
    throw error;
  }

  cachedToken = {
    accessToken,
    tokenType: body.token_type ?? body.tokenType ?? 'Bearer',
    expiresAt: Date.now() + Number(body.expires_in ?? body.expiresIn ?? 300) * 1000,
  };

  return cachedToken;
}

async function getBookingDetail(config, token, identifier) {
  const response = await fetch(buildRollerUrl(config.baseUrl, `/bookings/${encodeURIComponent(identifier)}`), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });
  emitRollerApiMetric({ method: 'GET', operation: 'get_booking_detail', status: response.status, ok: response.ok });

  if (response.status === 404) {
    return { ok: false, status: 404, body: null };
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return {
    body,
    ok: response.ok,
    status: response.status,
  };
}

async function getProductCatalogBestEffort(config, token) {
  if (cachedProducts && cachedProducts.expiresAt > Date.now()) return cachedProducts;

  try {
    const response = await fetch(buildRollerUrl(config.baseUrl, '/products'), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      },
    });
    emitRollerApiMetric({ method: 'GET', operation: 'list_products', status: response.status, ok: response.ok });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.json();
    const products = Array.isArray(body) ? body : body.items ?? body.products ?? body.data;
    const byId = new Map();

    if (Array.isArray(products)) {
      for (const product of flattenProducts(products)) {
        if (product.id) byId.set(String(product.id), product);
      }
    }

    cachedProducts = {
      byId,
      expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS,
      status: 'available',
    };
  } catch {
    cachedProducts = {
      byId: new Map(),
      expiresAt: Date.now() + 60_000,
      status: 'unavailable',
    };
  }

  return cachedProducts;
}

function flattenProducts(products, parent = null) {
  const flattened = [];

  for (const product of products) {
    const normalized = {
      id: String(product.id ?? product.productId ?? product.parentProductId ?? ''),
      name: product.name ?? product.productName ?? product.title ?? null,
      parentProductId: product.parentProductId ? String(product.parentProductId) : parent?.id ?? null,
      parentProductName: product.parentProductName ?? parent?.name ?? null,
      parentType: parent?.type ?? product.parentProductType ?? null,
      type: product.type ?? product.productType ?? product.productSubType ?? null,
    };

    if (normalized.id || normalized.name) {
      flattened.push(normalized);
    }

    const childCollections = [product.products, product.variations, product.productVariations].filter(Array.isArray);
    for (const children of childCollections) {
      flattened.push(...flattenProducts(children, normalized));
    }
  }

  return flattened;
}

function normalizeBooking(booking, products) {
  const items = Array.isArray(booking?.items) ? booking.items : [];

  return {
    amountOwing: numberOrNull(booking?.amountOwing ?? booking?.remainder ?? booking?.costs?.amountOwing),
    bookingReference: stringOrNull(booking?.bookingReference ?? booking?.reference),
    externalId: stringOrNull(booking?.externalId),
    items: items.map((item) => normalizeBookingItem(item, products.byId)),
    paymentStatus: stringOrNull(booking?.paymentStatus ?? booking?.status ?? booking?.bookingStatus),
    rollerUniqueId: stringOrNull(booking?.uniqueId ?? booking?.id),
    status: stringOrNull(booking?.status ?? booking?.bookingStatus),
    total: numberOrNull(booking?.total ?? booking?.costs?.total),
    venueId: extractVenueId(booking),
  };
}

function extractVenueId(booking) {
  if (!booking || typeof booking !== 'object') return null;

  const candidates = [
    booking.venueId,
    booking.venueID,
    booking.locationId,
    booking.locationID,
    booking.siteId,
    booking.siteID,
    booking.venue?.id,
    booking.venue?.venueId,
    booking.location?.id,
  ];

  const items = Array.isArray(booking.items) ? booking.items : [];
  for (const item of items) {
    candidates.push(
      item?.venueId,
      item?.venueID,
      item?.locationId,
      item?.locationID,
      item?.venue?.id,
      item?.venue?.venueId,
      item?.location?.id,
    );
  }

  return candidates.map((candidate) => stringOrNull(candidate)).find(Boolean) ?? null;
}

function normalizeBookingItem(item, productById) {
  const productId = item?.productId != null ? String(item.productId) : null;
  const product = productId ? productById.get(productId) : null;
  const tickets = Array.isArray(item?.tickets) ? item.tickets : [];

  return {
    bookingDate: stringOrNull(item?.bookingDate),
    bookingItemId: stringOrNull(item?.bookingItemId ?? item?.id),
    endTime: stringOrNull(item?.endTime ?? item?.sessionEndTime),
    parentProductId: numberOrNull(item?.parentProductId ?? product?.parentProductId),
    parentProductName: stringOrNull(item?.parentProductName ?? product?.parentProductName),
    productId: numberOrNull(item?.productId),
    productName: stringOrNull(item?.productName ?? product?.name),
    productType: stringOrNull(item?.productType ?? item?.productSubType ?? product?.type ?? product?.parentType),
    quantity: numberOrNull(item?.quantity),
    startTime: stringOrNull(item?.startTime ?? item?.sessionStartTime),
    tickets: tickets.map((ticket) => ({
      locations: Array.isArray(ticket?.locations) ? ticket.locations : [],
      // #333: Roller's own per-ticket redemption state, used only to recognise an already
      // redeemed ticket set; it is never written back as local truth by the refresh itself.
      redeemStatus: stringOrNull(ticket?.redeemStatus ?? ticket?.status),
      ticketId: stringOrNull(ticket?.ticketId ?? ticket?.id),
    })),
  };
}

function getRollerTicketRedeemStates(rollerBooking, ticketIds) {
  const states = {};
  for (const item of rollerBooking?.items ?? []) {
    for (const ticket of item?.tickets ?? []) {
      if (ticket?.ticketId) states[ticket.ticketId] = stringOrNull(ticket.redeemStatus);
    }
  }

  const selected = Array.isArray(ticketIds) ? ticketIds.filter(Boolean) : [];
  const allRedeemed =
    selected.length > 0 &&
    selected.every((ticketId) => Object.prototype.hasOwnProperty.call(states, ticketId) && isUsedRedeemStatus(states[ticketId]));

  return {
    allRedeemed,
    states: Object.fromEntries(selected.map((ticketId) => [ticketId, states[ticketId] ?? null])),
  };
}

async function upsertLiveBooking(booking, rollerEnv) {
  if (!booking.rollerUniqueId || !booking.bookingReference) return;

  const bookingDates = booking.items.map((item) => item.bookingDate).filter(Boolean);
  const startTimes = booking.items.map((item) => item.startTime).filter(Boolean);
  const endTimes = booking.items.map((item) => item.endTime).filter(Boolean);
  const payloadHash = hashJson({
    bookingReference: booking.bookingReference,
    itemCount: booking.items.length,
    paymentStatus: booking.paymentStatus,
    source: 'roller_redeem_final_refresh',
    status: booking.status,
    venueId: booking.venueId,
  });

  await executeStatement(
    `INSERT INTO jumpyard.roller_bookings (
      roller_unique_id,
      booking_reference,
      roller_env,
      venue_id,
      booking_status,
      payment_status,
      amount_owing_cents,
      total_cents,
      booking_date,
      start_time,
      end_time,
      source_last_updated_by,
      source_last_updated_at,
      roller_modified_at,
      last_seen_from_roller_at,
      freshness_status,
      is_tombstoned,
      payload_hash,
      normalized_summary
    )
    VALUES (
      :rollerUniqueId,
      :bookingReference,
      :rollerEnv,
      :venueId,
      :bookingStatus,
      :paymentStatus,
      :amountOwingCents,
      :totalCents,
      CAST(:bookingDate AS date),
      CAST(:startTime AS time),
      CAST(:endTime AS time),
      'roller_redeem_final_refresh',
      now(),
      NULL,
      now(),
      'fresh',
      :isTombstoned,
      :payloadHash,
      CAST(:normalizedSummary AS jsonb)
    )
    ON CONFLICT (roller_unique_id) DO UPDATE SET
      booking_reference = EXCLUDED.booking_reference,
      roller_env = EXCLUDED.roller_env,
      venue_id = EXCLUDED.venue_id,
      booking_status = EXCLUDED.booking_status,
      payment_status = EXCLUDED.payment_status,
      amount_owing_cents = EXCLUDED.amount_owing_cents,
      total_cents = EXCLUDED.total_cents,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      source_last_updated_by = EXCLUDED.source_last_updated_by,
      source_last_updated_at = now(),
      last_seen_from_roller_at = now(),
      freshness_status = 'fresh',
      is_tombstoned = EXCLUDED.is_tombstoned,
      payload_hash = EXCLUDED.payload_hash,
      normalized_summary = EXCLUDED.normalized_summary,
      updated_at = now()`,
    [
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      stringParameter('rollerEnv', rollerEnv),
      stringParameter('venueId', booking.venueId),
      stringParameter('bookingStatus', booking.status),
      stringParameter('paymentStatus', booking.paymentStatus),
      intParameter('amountOwingCents', currencyToCents(booking.amountOwing)),
      intParameter('totalCents', currencyToCents(booking.total)),
      stringParameter('bookingDate', minOrNull(bookingDates)),
      stringParameter('startTime', minOrNull(startTimes)),
      stringParameter('endTime', maxOrNull(endTimes)),
      { name: 'isTombstoned', value: { booleanValue: isTombstoned(booking.status) } },
      stringParameter('payloadHash', payloadHash),
      stringParameter(
        'normalizedSummary',
        JSON.stringify({
          externalId: booking.externalId,
          itemCount: booking.items.length,
          source: 'roller_redeem_final_refresh',
          venueId: booking.venueId,
        }),
      ),
    ],
  );

  for (const item of booking.items) {
    const bookingItemKey = await upsertLiveBookingItem(booking.rollerUniqueId, item);

    for (const ticket of item.tickets ?? []) {
      await upsertLiveTicket(booking.rollerUniqueId, bookingItemKey, item, ticket);
    }
  }
}

async function upsertLiveBookingItem(rollerUniqueId, item) {
  const bookingItemKey = localBookingItemKey(rollerUniqueId, item);
  const hasBookingItemId = Boolean(stringOrNull(item.bookingItemId));
  const conflictClause = hasBookingItemId
    ? `ON CONFLICT (booking_item_id) WHERE booking_item_id IS NOT NULL DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      product_id = EXCLUDED.product_id,
      parent_product_id = COALESCE(EXCLUDED.parent_product_id, jumpyard.roller_booking_items.parent_product_id),
      product_name = COALESCE(EXCLUDED.product_name, jumpyard.roller_booking_items.product_name),
      parent_product_name = COALESCE(EXCLUDED.parent_product_name, jumpyard.roller_booking_items.parent_product_name),
      quantity = EXCLUDED.quantity,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      item_summary = COALESCE(jumpyard.roller_booking_items.item_summary, '{}'::jsonb)
        || jsonb_strip_nulls(EXCLUDED.item_summary),
      updated_at = now()
    WHERE jumpyard.roller_booking_items.roller_unique_id = EXCLUDED.roller_unique_id`
    : `ON CONFLICT (booking_item_key) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_item_id = EXCLUDED.booking_item_id,
      product_id = EXCLUDED.product_id,
      parent_product_id = COALESCE(EXCLUDED.parent_product_id, jumpyard.roller_booking_items.parent_product_id),
      product_name = COALESCE(EXCLUDED.product_name, jumpyard.roller_booking_items.product_name),
      parent_product_name = COALESCE(EXCLUDED.parent_product_name, jumpyard.roller_booking_items.parent_product_name),
      quantity = EXCLUDED.quantity,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      item_summary = COALESCE(jumpyard.roller_booking_items.item_summary, '{}'::jsonb)
        || jsonb_strip_nulls(EXCLUDED.item_summary),
      updated_at = now()`;

  const result = await executeStatement(
    `INSERT INTO jumpyard.roller_booking_items (
      booking_item_key,
      roller_unique_id,
      booking_item_id,
      product_id,
      parent_product_id,
      product_name,
      parent_product_name,
      quantity,
      booking_date,
      start_time,
      end_time,
      item_summary
    )
    VALUES (
      :bookingItemKey,
      :rollerUniqueId,
      :bookingItemId,
      :productId,
      :parentProductId,
      :productName,
      :parentProductName,
      :quantity,
      CAST(:bookingDate AS date),
      CAST(:startTime AS time),
      CAST(:endTime AS time),
      CAST(:itemSummary AS jsonb)
    )
    ${conflictClause}
    RETURNING booking_item_key`,
    [
      stringParameter('bookingItemKey', bookingItemKey),
      stringParameter('rollerUniqueId', rollerUniqueId),
      stringParameter('bookingItemId', item.bookingItemId),
      stringParameter('productId', item.productId),
      stringParameter('parentProductId', item.parentProductId),
      stringParameter('productName', item.productName),
      stringParameter('parentProductName', item.parentProductName),
      intParameter('quantity', item.quantity ?? 1),
      stringParameter('bookingDate', item.bookingDate),
      stringParameter('startTime', item.startTime),
      stringParameter('endTime', item.endTime),
      stringParameter(
        'itemSummary',
        JSON.stringify({
          productType: item.productType,
          source: 'roller_redeem_final_refresh',
        }),
      ),
    ],
  );

  const persistedBookingItemKey = result.records?.[0]?.[0]?.stringValue ?? null;
  if (!persistedBookingItemKey) {
    const error = new Error('Roller booking item id is already owned by another booking.');
    error.code = 'redeem_booking_item_identity_conflict';
    throw error;
  }

  return persistedBookingItemKey;
}

async function upsertLiveTicket(rollerUniqueId, bookingItemKey, item, ticket) {
  if (!ticket.ticketId) return;

  await executeStatement(
    `INSERT INTO jumpyard.roller_booking_tickets (
      ticket_id,
      roller_unique_id,
      booking_item_key,
      booking_item_id,
      locations,
      last_seen_from_roller_at,
      product_id,
      booking_date,
      ticket_summary
    )
    VALUES (
      :ticketId,
      :rollerUniqueId,
      :bookingItemKey,
      :bookingItemId,
      CAST(:locations AS jsonb),
      now(),
      :productId,
      CAST(:bookingDate AS date),
      CAST(:ticketSummary AS jsonb)
    )
    ON CONFLICT (ticket_id) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_item_key = EXCLUDED.booking_item_key,
      booking_item_id = EXCLUDED.booking_item_id,
      locations = EXCLUDED.locations,
      last_seen_from_roller_at = now(),
      product_id = EXCLUDED.product_id,
      booking_date = EXCLUDED.booking_date,
      ticket_summary = COALESCE(jumpyard.roller_booking_tickets.ticket_summary, '{}'::jsonb)
        || jsonb_strip_nulls(EXCLUDED.ticket_summary),
      updated_at = now()`,
    [
      stringParameter('ticketId', ticket.ticketId),
      stringParameter('rollerUniqueId', rollerUniqueId),
      stringParameter('bookingItemKey', bookingItemKey),
      stringParameter('bookingItemId', item.bookingItemId),
      stringParameter('locations', JSON.stringify(Array.isArray(ticket.locations) ? ticket.locations : [])),
      stringParameter('productId', item.productId),
      stringParameter('bookingDate', item.bookingDate),
      stringParameter(
        'ticketSummary',
        JSON.stringify({
          source: 'roller_redeem_final_refresh',
        }),
      ),
    ],
  );
}

function localBookingItemKey(rollerUniqueId, item) {
  const keySource =
    item.bookingItemId ||
    `${rollerUniqueId}:${item.productId ?? 'unknown'}:${item.bookingDate ?? ''}:${item.startTime ?? ''}`;
  return `bookingitem:${hashString(keySource)}`;
}

async function redeemRollerTickets(config, token, ticketIds, request) {
  const payload = {
    tickets: ticketIds.map((ticketId) => ({
      ticketId,
      ...(request.redemptionDate ? { redemptionDate: request.redemptionDate } : {}),
    })),
  };

  if (request.redemptionDevice) {
    payload.redemptionDevice = request.redemptionDevice;
  }

  const response = await fetch(buildRollerUrl(config.baseUrl, '/redemptions'), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  emitRollerApiMetric({ method: 'POST', operation: 'redeem_tickets', status: response.status, ok: response.ok });
  const text = await response.text();
  const body = parseJsonOrNull(text);

  return {
    body,
    ok: response.ok,
    status: response.status,
  };
}

function sanitizeRollerErrors(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  return errors.map((error) => ({
    message: stringOrNull(error.message),
    name: stringOrNull(error.name),
    ticketId: stringOrNull(error.ticketId),
  }));
}

function buildRollerUrl(baseUrl, endpointPath) {
  const parsedBaseUrl = new URL(baseUrl);
  const basePath = parsedBaseUrl.pathname.replace(/\/$/, '');
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

function emitRollerApiMetric({ method, operation, status, ok }) {
  const statusCode = Number.isInteger(status) ? status : 0;
  const metricValues = {
    RollerApiCallCount: 1,
  };
  const metrics = [{ Name: 'RollerApiCallCount', Unit: 'Count' }];

  if (!ok) {
    metricValues.RollerApiErrorCount = 1;
    metrics.push({ Name: 'RollerApiErrorCount', Unit: 'Count' });
  }

  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'JumpYard/Cloud',
            Dimensions: [
              ['Environment'],
              ['Environment', 'Handler'],
              ['Environment', 'Handler', 'Operation', 'Method'],
            ],
            Metrics: metrics,
          },
        ],
      },
      Environment: sanitizeMetricValue(process.env.RESOURCE_PREFIX || 'unknown'),
      Handler: sanitizeMetricValue(process.env.JUMPYARD_HANDLER || 'redeem'),
      Operation: sanitizeMetricValue(operation || 'unknown'),
      Method: sanitizeMetricValue(method || 'UNKNOWN'),
      StatusCode: statusCode,
      Ok: Boolean(ok),
      ...metricValues,
    }),
  );
}

function sanitizeMetricValue(value) {
  const sanitized = String(value).replace(/[^A-Za-z0-9_.:/-]/g, '_').slice(0, 100);
  return sanitized || 'unknown';
}

function isStaffSessionRedeemRoute(event) {
  const routeKey = event?.routeKey;
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem' ||
    (event?.requestContext?.http?.method === 'POST' &&
      /^\/v1\/staff\/check-in\/sessions\/[^/]+\/redeem$/.test(rawPath))
  );
}

function extractStaffRedeemSessionIdFromPath(rawPath) {
  const match = String(rawPath ?? '').match(/^\/v1\/staff\/check-in\/sessions\/([^/]+)\/redeem$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function executeStatement(sql, parameters = []) {
  const resourceArn = process.env.DATABASE_CLUSTER_ARN;
  const secretArn = process.env.DATABASE_SECRET_ARN;

  if (!resourceArn || !secretArn) {
    const error = new Error('Database environment is not configured.');
    error.code = 'database_config_error';
    throw error;
  }

  return hooks.executeStatement(
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

function normalizeDate(value) {
  const raw = stringOrNull(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
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

function intParameter(name, value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? { name, value: { isNull: true } }
    : { name, value: { longValue: Number(value) } };
}

function currencyToCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function minOrNull(values) {
  const sorted = values.filter(Boolean).sort();
  return sorted[0] ?? null;
}

function maxOrNull(values) {
  const sorted = values.filter(Boolean).sort();
  return sorted[sorted.length - 1] ?? null;
}

function isTombstoned(status) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'deleted';
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return Date.parse(expiresAt) <= Date.now();
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

function parseJsonOrNull(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeCorrelationId(value) {
  const normalized = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/.test(normalized) ? normalized : null;
}

function hashJson(value) {
  return hashString(JSON.stringify(value));
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function classifyError(error) {
  if (error.code === 'payload_too_large') {
    return {
      statusCode: 413,
      status: 'invalid_request',
      code: 'payload_too_large',
      message: 'Request body exceeds the allowed size.',
    };
  }

  if (error.code === 'invalid_json') {
    return {
      statusCode: 400,
      status: 'invalid_request',
      code: 'invalid_json',
      message: error.message,
    };
  }

  if (error.code === 'redeem_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'redeem_config_error',
      message: 'JumpYard Cloud redeem configuration is incomplete or unsafe.',
    };
  }

  if (error.code === 'staff_auth_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'staff_auth_config_error',
      message: 'JumpYard Cloud staff authentication configuration is incomplete.',
    };
  }

  if (error.code === 'database_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'database_config_error',
      message: 'JumpYard Cloud redeem database configuration is incomplete.',
    };
  }

  if (error.code === 'roller_token_error') {
    return {
      statusCode: 502,
      status: 'roller_error',
      code: 'roller_token_failed',
      message: 'JumpYard Cloud could not authenticate with Roller.',
    };
  }

  return {
    statusCode: 500,
    status: 'internal_error',
    code: 'redeem_failed',
    message: 'JumpYard Cloud redeem failed.',
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

exports.__test = {
  claimExistingIdempotencyKey,
  finalizeRedeemLocally,
  findSucceededRedeemReceipt,
  getRollerTicketRedeemStates,
  normalizeBooking,
  reserveIdempotencyKey,
  upsertLiveBooking,
  upsertLiveBookingItem,
  reset() {
    hooks = {
      executeStatement: (command) => rdsClient.send(command),
    };
  },
  setHooks(overrides) {
    hooks = { ...hooks, ...overrides };
  },
};
