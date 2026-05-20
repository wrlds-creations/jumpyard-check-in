const crypto = require('crypto');
const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');

const DATABASE_NAME = 'jumpyard_cloud';
const DEV_TOKEN_HEADERS = ['x-jumpyard-webhook-token', 'x-api-key', 'x-roller-api-key'];
const MAX_BODY_BYTES = 256 * 1024;

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});

let cachedWebhookToken = null;

exports.handler = async (event) => {
  const correlationId = getHeader(event, 'x-correlation-id') || createCorrelationId();

  try {
    const request = parseWebhookRequest(event);
    const auth = await verifyWebhookToken(event);

    if (!auth.ok) {
      return jsonResponse(200, correlationId, {
        status: 'ignored_unauthorized',
        error: {
          code: auth.code,
          message: 'Webhook request was ignored because it was not authorized.',
        },
      });
    }

    const intake = normalizeWebhookEvent(event, request);
    const writeResult = await persistWebhookEvent(intake, auth.mode);

    return jsonResponse(200, correlationId, {
      status: writeResult.inserted ? 'accepted' : 'duplicate',
      webhook: {
        eventId: intake.eventId,
        eventType: intake.eventType,
        bookingReference: intake.bookingReference,
        rollerUniqueId: intake.rollerUniqueId,
        duplicate: !writeResult.inserted,
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

function parseWebhookRequest(event) {
  if (!event || event.requestContext?.http?.method !== 'POST') {
    const error = new Error('Webhook endpoint only accepts POST.');
    error.code = 'method_not_allowed';
    throw error;
  }

  const rawBody = getRawBody(event);
  const bodyBytes = Buffer.byteLength(rawBody, 'utf8');

  if (bodyBytes > MAX_BODY_BYTES) {
    const error = new Error('Webhook body is too large.');
    error.code = 'payload_too_large';
    throw error;
  }

  let parsedBody = null;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      const error = new Error('Webhook body must be valid JSON.');
      error.code = 'invalid_json';
      throw error;
    }
  }

  return {
    rawBody,
    parsedBody,
    bodyBytes,
  };
}

function getRawBody(event) {
  if (!event.body) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : String(event.body);
}

async function verifyWebhookToken(event) {
  const providedToken = getWebhookAuthToken(event);

  if (!providedToken) {
    return { ok: false, code: 'webhook_token_required', mode: 'none' };
  }

  const expectedToken = await getWebhookToken();
  if (!safeEquals(providedToken, expectedToken)) {
    return { ok: false, code: 'webhook_token_invalid', mode: 'dev_token' };
  }

  return { ok: true, code: null, mode: 'dev_token' };
}

function getWebhookAuthToken(event) {
  for (const header of DEV_TOKEN_HEADERS) {
    const value = getHeader(event, header);
    if (value) return value;
  }

  const authorization = getHeader(event, 'authorization');
  if (authorization) {
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  return null;
}

async function getWebhookToken() {
  if (process.env.WEBHOOK_DEV_TOKEN) {
    return process.env.WEBHOOK_DEV_TOKEN;
  }

  if (cachedWebhookToken) return cachedWebhookToken;

  const secretId = process.env.WEBHOOK_DEV_TOKEN_SECRET_ARN;
  if (!secretId) {
    const error = new Error('Webhook dev token secret is not configured.');
    error.code = 'webhook_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Webhook dev token secret has no string value.');
    error.code = 'webhook_config_error';
    throw error;
  }

  try {
    const parsed = JSON.parse(secretString);
    cachedWebhookToken = String(parsed.token ?? parsed.webhookToken ?? '').trim();
  } catch {
    cachedWebhookToken = secretString.trim();
  }

  if (!cachedWebhookToken) {
    const error = new Error('Webhook dev token is empty.');
    error.code = 'webhook_config_error';
    throw error;
  }

  return cachedWebhookToken;
}

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeWebhookEvent(event, request) {
  const parsedBody = isRecord(request.parsedBody) ? request.parsedBody : {};
  const routeEventType = inferRouteEventType(event);
  const eventType = firstString(
    [
      parsedBody.eventType,
      parsedBody.type,
      parsedBody.trigger,
      parsedBody.action,
      parsedBody.eventName,
      routeEventType,
    ],
    routeEventType,
  );
  const explicitEventId = firstString([
    getHeader(event, 'x-roller-event-id'),
    getHeader(event, 'roller-event-id'),
    parsedBody.eventId,
    parsedBody.id,
    parsedBody.webhookEventId,
  ]);
  const eventId = explicitEventId || `hash:${hashString(`${event.rawPath ?? event.routeKey ?? ''}:${request.rawBody}`)}`;
  const bookingReference = firstString(findNestedValues(parsedBody, ['bookingReference', 'bookingId', 'reference']));
  const rollerUniqueId = firstString(findNestedValues(parsedBody, ['bookingUniqueId', 'uniqueId', 'rollerUniqueId']));
  const payloadHash = hashString(request.rawBody || JSON.stringify(parsedBody));

  return {
    bookingReference,
    eventId,
    eventType,
    payloadHash,
    rollerUniqueId,
    summary: {
      authMode: 'dev_token',
      bodyBytes: request.bodyBytes,
      hasBookingReference: Boolean(bookingReference),
      hasRollerUniqueId: Boolean(rollerUniqueId),
      routeKey: event.routeKey ?? null,
      source: 'roller_webhook',
    },
  };
}

function inferRouteEventType(event) {
  const rawPath = String(event.rawPath ?? event.routeKey ?? '').toLowerCase();
  if (rawPath.includes('redemptions')) return 'roller.redemption';
  if (rawPath.includes('bookings')) return 'roller.booking';
  return 'roller.webhook';
}

function findNestedValues(value, keys, depth = 0) {
  if (depth > 4 || !isRecord(value)) return [];

  const matches = [];
  for (const [key, nestedValue] of Object.entries(value)) {
    if (keys.includes(key) && nestedValue !== undefined && nestedValue !== null && nestedValue !== '') {
      matches.push(nestedValue);
    }

    if (isRecord(nestedValue)) {
      matches.push(...findNestedValues(nestedValue, keys, depth + 1));
    }
  }

  return matches;
}

async function persistWebhookEvent(intake, authMode) {
  const insertEvent = await executeStatement(
    `INSERT INTO jumpyard.roller_webhook_events (
      event_id_or_hash,
      event_type,
      booking_reference,
      roller_unique_id,
      payload_hash,
      status
    )
    VALUES (
      :eventId,
      :eventType,
      :bookingReference,
      :rollerUniqueId,
      :payloadHash,
      'received'
    )
    ON CONFLICT (event_id_or_hash) DO NOTHING
    RETURNING event_id_or_hash`,
    [
      stringParameter('eventId', intake.eventId),
      stringParameter('eventType', intake.eventType),
      stringParameter('bookingReference', intake.bookingReference),
      stringParameter('rollerUniqueId', intake.rollerUniqueId),
      stringParameter('payloadHash', intake.payloadHash),
    ],
  );

  const inserted = (insertEvent.records ?? []).length > 0;

  if (inserted) {
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
        :eventLogId,
        :correlationId,
        'roller_webhook.received',
        :subjectRef,
        :summary,
        CAST(:eventPayload AS jsonb)
      )
      ON CONFLICT (event_id) DO NOTHING`,
      [
        stringParameter('eventLogId', `webhook:${intake.eventId}`),
        stringParameter('correlationId', null),
        stringParameter('subjectRef', intake.bookingReference || intake.rollerUniqueId || intake.eventId),
        stringParameter('summary', `Received ${intake.eventType} webhook via ${authMode}.`),
        stringParameter('eventPayload', JSON.stringify(intake.summary)),
      ],
    );
  }

  return { inserted };
}

async function executeStatement(sql, parameters) {
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
      parameters,
      resourceArn,
      secretArn,
      sql,
    }),
  );
}

function getHeader(event, name) {
  const headers = event?.headers ?? {};
  const target = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value !== undefined && value !== null) {
      return String(value);
    }
  }

  return null;
}

function stringParameter(name, value) {
  return value === null || value === undefined
    ? { name, value: { isNull: true } }
    : { name, value: { stringValue: String(value) } };
}

function firstString(values, fallback = null) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }

  return fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function classifyError(error) {
  if (error.code === 'method_not_allowed') {
    return {
      statusCode: 200,
      status: 'invalid_request',
      code: 'method_not_allowed',
      message: 'Webhook request was ignored because it did not use POST.',
    };
  }

  if (error.code === 'invalid_json' || error.code === 'payload_too_large') {
    return {
      statusCode: 200,
      status: 'invalid_request',
      code: error.code,
      message: 'Webhook request was ignored because its body could not be accepted.',
    };
  }

  if (error.code === 'webhook_config_error' || error.code === 'database_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: error.code,
      message: 'JumpYard Cloud webhook configuration is incomplete.',
    };
  }

  return {
    statusCode: 500,
    status: 'internal_error',
    code: 'webhook_intake_failed',
    message: 'JumpYard Cloud webhook intake failed.',
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
