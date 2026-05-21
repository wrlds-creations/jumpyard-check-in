const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const MAX_REDEEM_TICKETS = 10;
const DEFAULT_REDEMPTION_DEVICE = 'JumpYard Cloud Dev';
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedToken = null;

exports.handler = async (event) => {
  let correlationId = getHeader(event, 'x-correlation-id') || createCorrelationId();

  try {
    const request = parseRequest(event);
    correlationId = request.correlationId || correlationId;

    const requestError = validateRequest(request);
    if (requestError) {
      return jsonResponse(400, correlationId, {
        status: 'invalid_request',
        error: requestError,
      });
    }

    const redeemContext = await getRedeemContext(request.identifier);
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

    if (!isRollerRedeemWriteEnabled()) {
      await persistCheckinAttempt({
        booking: redeemContext.booking,
        correlationId,
        errorCode: 'redeem_write_disabled',
        idempotencyKey: request.idempotencyKey,
        selectedTicketIds: decision.selectedTicketIds,
        status: 'write_disabled',
      });

      return jsonResponse(409, correlationId, {
        status: 'blocked',
        error: {
          code: 'redeem_write_disabled',
          message: 'Roller redemption writes are disabled for this JumpYard Cloud environment.',
        },
        redeemPlan: buildRedeemPlan(redeemContext, decision, false),
      });
    }

    const requestHash = hashJson({
      bookingReference: redeemContext.booking.bookingReference,
      redemptionDevice: request.redemptionDevice,
      redemptionDate: request.redemptionDate,
      ticketIds: decision.selectedTicketIds,
    });
    const idempotency = await reserveIdempotencyKey(request.idempotencyKey, requestHash);
    if (!idempotency.ok) {
      return jsonResponse(409, correlationId, {
        status: 'blocked',
        error: {
          code: 'idempotency_key_reused',
          message: 'The supplied idempotency key has already been used for a redeem operation.',
        },
      });
    }

    const config = await getRollerConfig();
    const token = await getRollerAccessToken(config);
    const rollerResult = await redeemRollerTickets(config, token, decision.selectedTicketIds, request);

    if (rollerResult.ok) {
      await persistCheckinAttempt({
        booking: redeemContext.booking,
        correlationId,
        errorCode: null,
        idempotencyKey: request.idempotencyKey,
        rollerResponseRef: `roller_redemptions:http_${rollerResult.status}`,
        selectedTicketIds: decision.selectedTicketIds,
        status: 'redeemed',
      });
      await markTicketsRedeemed(decision.selectedTicketIds);
      await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `redeemed:${redeemContext.booking.bookingReference}`);
      await writeEventLog({
        booking: redeemContext.booking,
        correlationId,
        eventType: 'checkin.redeem_succeeded',
        payload: {
          ticketCount: decision.selectedTicketIds.length,
        },
        summary: 'Redeem completed through Roller Playground.',
      });

      return jsonResponse(200, correlationId, {
        status: 'redeemed',
        redeemedTicketIds: decision.selectedTicketIds,
        roller: {
          statusCode: rollerResult.status,
        },
      });
    }

    await persistCheckinAttempt({
      booking: redeemContext.booking,
      correlationId,
      errorCode: 'roller_redeem_rejected',
      idempotencyKey: request.idempotencyKey,
      rollerResponseRef: `roller_redemptions:http_${rollerResult.status}`,
      selectedTicketIds: decision.selectedTicketIds,
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

function parseRequest(event) {
  if (!event || !event.body) return {};

  let body = event.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

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
      correlationId: stringOrNull(parsed.correlationId) || stringOrNull(getHeader(event, 'x-correlation-id')),
      expectedDate: stringOrNull(parsed.expectedDate),
      identifier,
      idempotencyKey,
      redemptionDate: stringOrNull(parsed.redemptionDate),
      redemptionDevice: stringOrNull(parsed.redemptionDevice) || DEFAULT_REDEMPTION_DEVICE,
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

async function getRedeemContext(identifier) {
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
       b.last_seen_from_roller_at::text AS last_seen_from_roller_at,
       COALESCE(
         json_agg(
           json_build_object(
             'ticketId', t.ticket_id,
             'bookingItemId', t.booking_item_id,
             'productId', t.product_id,
             'bookingDate', t.booking_date::text,
             'redeemStatusLastSeen', t.redeem_status_last_seen,
             'lastSeenFromRollerAt', t.last_seen_from_roller_at::text
           )
           ORDER BY t.ticket_id
         ) FILTER (WHERE t.ticket_id IS NOT NULL),
         '[]'::json
       )::text AS tickets_json
     FROM jumpyard.roller_bookings AS b
     LEFT JOIN jumpyard.roller_booking_tickets AS t
       ON t.roller_unique_id = b.roller_unique_id
     WHERE b.booking_reference = :identifier
        OR b.roller_unique_id = :identifier
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
       b.is_tombstoned,
       b.last_seen_from_roller_at
     LIMIT 1`,
    [stringParameter('identifier', identifier)],
  );
  const row = firstMappedRow(result);
  if (!row) return null;

  const tickets = parseJsonArray(row.tickets_json).map((ticket) => ({
    bookingDate: stringOrNull(ticket.bookingDate),
    bookingItemId: stringOrNull(ticket.bookingItemId),
    lastSeenFromRollerAt: stringOrNull(ticket.lastSeenFromRollerAt),
    productId: stringOrNull(ticket.productId),
    redeemStatusLastSeen: stringOrNull(ticket.redeemStatusLastSeen),
    ticketId: stringOrNull(ticket.ticketId),
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
    },
    tickets,
  };
}

function evaluateRedeemContext(context, request) {
  const booking = context.booking;
  const selectedTickets = selectTickets(context.tickets, request.ticketIds);
  const selectedTicketIds = selectedTickets.map((ticket) => ticket.ticketId).filter(Boolean);

  if (booking.isTombstoned || isInactiveBookingStatus(booking.bookingStatus)) {
    return blocked('booking_not_active', 'The booking is cancelled, deleted, or otherwise inactive.', selectedTicketIds);
  }

  if (booking.freshnessStatus !== 'fresh') {
    return blocked('booking_not_fresh', 'The local booking snapshot is not fresh enough for redemption.', selectedTicketIds);
  }

  if (!isPaymentComplete(booking)) {
    return blocked('payment_required', 'The booking is not fully paid and cannot be redeemed yet.', selectedTicketIds);
  }

  if (request.expectedDate && !bookingMatchesExpectedDate(booking, context.tickets, request.expectedDate)) {
    return blocked('wrong_date', 'The booking is not valid for the expected check-in date.', selectedTicketIds);
  }

  if (request.ticketIds.length > 0 && selectedTickets.length !== request.ticketIds.length) {
    return blocked('unknown_ticket', 'One or more requested ticket ids were not found on the booking.', selectedTicketIds);
  }

  if (selectedTicketIds.length === 0) {
    return blocked('no_redeemable_tickets', 'The booking does not have local ticket ids to redeem.', selectedTicketIds);
  }

  if (selectedTicketIds.length > MAX_REDEEM_TICKETS) {
    return blocked('too_many_tickets', `Roller accepts at most ${MAX_REDEEM_TICKETS} ticket redemptions per call.`, selectedTicketIds);
  }

  const locallyUsedTicket = selectedTickets.find((ticket) => isUsedRedeemStatus(ticket.redeemStatusLastSeen));
  if (locallyUsedTicket) {
    return blocked('already_redeemed', 'At least one selected ticket is already marked redeemed locally.', selectedTicketIds);
  }

  return {
    canRedeem: true,
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

function blocked(reason, message, selectedTicketIds) {
  return {
    canRedeem: false,
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
  return normalized.includes('redeem') || normalized.includes('used') || normalized.includes('exhausted');
}

function isRollerRedeemWriteEnabled() {
  return process.env.ENABLE_ROLLER_REDEEM_WRITES === 'true';
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
    ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('requestHash', requestHash),
      stringParameter('expiresAt', expiresAt),
    ],
  );

  return {
    ok: Number(result.numberOfRecordsUpdated ?? 0) === 1,
  };
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
  if (cachedRollerConfig) return cachedRollerConfig;

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

  if (config.env !== 'playground') {
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
    if (PRODUCTION_URL_MARKER.test(searchableUrl)) {
      errors.push('Roller base URL looks like production/live.');
    }
    if (!PLAYGROUND_URL_MARKER.test(searchableUrl)) {
      errors.push('Roller base URL must point to Playground.');
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

async function redeemRollerTickets(config, token, ticketIds, request) {
  const payload = {
    tickets: ticketIds.map((ticketId) => ({
      ticketId,
      ...(request.redemptionDate ? { redemptionDate: request.redemptionDate } : {}),
    })),
    redemptionDevice: request.redemptionDevice,
  };

  const response = await fetch(buildRollerUrl(config.baseUrl, '/redemptions'), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
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

  if (error.code === 'redeem_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'redeem_config_error',
      message: 'JumpYard Cloud redeem configuration is incomplete or unsafe.',
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
      message: 'JumpYard Cloud could not authenticate with Roller Playground.',
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
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify({
      correlationId,
      ...payload,
    }),
  };
}
