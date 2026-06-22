const crypto = require('crypto');
const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');

const DATABASE_NAME = 'jumpyard_cloud';
const DEV_TOKEN_HEADERS = [
  'x-jumpyard-webhook-token',
  'x-api-key',
  'x-roller-api-key',
  'x-roller-apikey',
  'apikey',
  'api-key',
  'roller-api-key',
];
const MAX_BODY_BYTES = 256 * 1024;
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const PRODUCT_CACHE_TTL_MS = 15 * 60 * 1000;
const RETRYABLE_DUPLICATE_STATUSES = new Set(['received', 'failed']);
const SOURCE_WEBHOOK_GUEST_PROFILE = 'roller_webhook_booking_detail';
const SOURCE_WEBHOOK_GUEST_DETAIL = 'roller_webhook_guest_detail';

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedWebhookToken = null;
let cachedRollerConfig = null;
let cachedToken = null;
let cachedProducts = null;

exports.handler = async (event) => {
  const correlationId = getHeader(event, 'x-correlation-id') || createCorrelationId();

  try {
    const request = parseWebhookRequest(event);
    const auth = await verifyWebhookToken(event);

    if (!auth.ok) {
      logUnauthorizedWebhook(event, request, auth.code);
      return jsonResponse(200, correlationId, {
        status: 'ignored_unauthorized',
        error: {
          code: auth.code,
          message: 'Webhook request was ignored because it was not authorized.',
        },
      });
    }

    if (!isRollerWebhookProcessingEnabled()) {
      return jsonResponse(200, correlationId, {
        status: 'ignored_disabled',
        webhook: {
          reason: 'roller_webhook_processing_disabled',
        },
      });
    }

    const intake = normalizeWebhookEvent(event, request);
    const writeResult = await persistWebhookEvent(intake, auth.mode, correlationId);

    if (!writeResult.inserted && !RETRYABLE_DUPLICATE_STATUSES.has(writeResult.status)) {
      return jsonResponse(200, correlationId, {
        status: 'duplicate',
        webhook: {
          eventId: intake.eventId,
          eventType: intake.eventType,
          bookingReference: intake.bookingReference,
          rollerUniqueId: intake.rollerUniqueId,
          duplicate: true,
        },
      });
    }

    const enrichment = await enrichWebhookEvent(intake, correlationId);

    return jsonResponse(200, correlationId, {
      status: 'accepted',
      webhook: {
        eventId: intake.eventId,
        eventType: intake.eventType,
        bookingReference: intake.bookingReference,
        rollerUniqueId: intake.rollerUniqueId,
        duplicate: false,
        enrichment,
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
    return authorization.replace(/^(Bearer|ApiKey|Token)\s+/i, '').trim();
  }

  return null;
}

function logUnauthorizedWebhook(event, request, code) {
  const headerNames = Object.keys(event?.headers ?? {})
    .map((header) => header.toLowerCase())
    .sort();
  const parsedBody = isRecord(request.parsedBody) ? request.parsedBody : {};

  console.warn(
    JSON.stringify({
      bodyBytes: request.bodyBytes,
      bodyTopLevelKeys: Object.keys(parsedBody).slice(0, 12),
      code,
      headerNames,
      method: event?.requestContext?.http?.method ?? null,
      path: event?.rawPath ?? null,
      status: 'ignored_unauthorized',
    }),
  );
}

function isRollerWebhookProcessingEnabled() {
  return process.env.ENABLE_ROLLER_WEBHOOK_PROCESSING === 'true' && !isEmergencyStopEnabled();
}

function isEmergencyStopEnabled() {
  return process.env.JUMPYARD_EMERGENCY_STOP === 'true';
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
  const eventType = normalizeRollerWebhookEventType(firstString(
    [
      parsedBody.eventType,
      parsedBody.type,
      parsedBody.trigger,
      parsedBody.action,
      parsedBody.eventName,
      routeEventType,
    ],
    routeEventType,
  ));
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

function normalizeRollerWebhookEventType(value) {
  const normalizedValue = String(value ?? '').trim();
  const lowerValue = normalizedValue.toLowerCase();

  if (lowerValue === '1' || lowerValue === 'created') return 'Created';
  if (lowerValue === '2' || lowerValue === 'updated') return 'Updated';
  if (lowerValue === '3' || lowerValue === 'cancelled' || lowerValue === 'canceled') return 'Cancelled';

  return normalizedValue || 'roller.webhook';
}

function findNestedValues(value, keys, depth = 0) {
  if (depth > 5) return [];

  if (Array.isArray(value)) {
    return value.flatMap((nestedValue) => findNestedValues(nestedValue, keys, depth + 1));
  }

  if (!isRecord(value)) return [];

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

async function persistWebhookEvent(intake, authMode, correlationId) {
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
        stringParameter('correlationId', correlationId),
        stringParameter('subjectRef', intake.bookingReference || intake.rollerUniqueId || intake.eventId),
        stringParameter('summary', `Received ${intake.eventType} webhook via ${authMode}.`),
        stringParameter('eventPayload', JSON.stringify(intake.summary)),
      ],
    );
  }

  if (inserted) {
    return { inserted, status: 'received' };
  }

  const existingEvent = await executeStatement(
    `SELECT status
     FROM jumpyard.roller_webhook_events
     WHERE event_id_or_hash = :eventId
     LIMIT 1`,
    [stringParameter('eventId', intake.eventId)],
  );

  const existingStatus = existingEvent.records?.[0]?.[0]?.stringValue ?? 'duplicate';
  return { inserted, status: existingStatus };
}

async function enrichWebhookEvent(intake, correlationId) {
  const identifier = intake.rollerUniqueId || intake.bookingReference;

  if (!identifier) {
    await markWebhookEventPending(intake.eventId, 'missing_booking_identifier');
    return {
      status: 'pending_enrichment',
      updatedBooking: false,
      reason: 'missing_booking_identifier',
    };
  }

  try {
    const config = await getRollerConfig();
    const token = await getRollerAccessToken(config);
    const bookingResult = await getBookingDetail(config, token, identifier);

    if (bookingResult.status === 404) {
      await updateWebhookEventStatus(intake.eventId, 'processed', 'booking_detail_not_found_for_enrichment', true);
      return {
        status: 'booking_not_found',
        updatedBooking: false,
        lookupPath: 'GET /bookings/{identifier}',
      };
    }

    if (!bookingResult.ok) {
      const error = new Error(`Roller booking detail failed with HTTP ${bookingResult.status}.`);
      error.code = 'roller_lookup_error';
      throw error;
    }

    const products = await getProductCatalogBestEffort(config, token);
    const booking = normalizeBooking(bookingResult.body, products);
    const guestDetail = await enrichGuestProfileFromGuestDetailBestEffort(config, token, booking);
    if (!booking.bookingReference || !booking.rollerUniqueId) {
      const error = new Error('Roller booking detail did not include required booking identifiers.');
      error.code = 'roller_lookup_error';
      throw error;
    }

    await upsertWebhookBooking(booking, config.env, null);
    const guestProfile = await upsertWebhookGuestProfile(booking);
    await reconcilePrepaymentDraftFromPaidBooking(booking, 'roller_webhook_enrichment');
    await updateWebhookEventStatus(intake.eventId, 'processed', null, true);
    await persistEnrichmentEventLog(intake, correlationId, booking, products.status, guestProfile);

    return {
      status: 'processed',
      updatedBooking: Boolean(booking.bookingReference && booking.rollerUniqueId),
      bookingReference: booking.bookingReference,
      rollerUniqueId: booking.rollerUniqueId,
      itemCount: booking.items.length,
      ticketCount: booking.items.reduce((total, item) => total + (item.tickets?.length ?? 0), 0),
      guestProfileUpdated: guestProfile.updated,
      guestNamePresent: guestProfile.namePresent,
      guestDetailStatus: guestDetail.status,
      productCatalog: products.status,
      lookupPath: guestDetail.used ? 'GET /bookings/{identifier} + GET /guests/{guestId}' : 'GET /bookings/{identifier}',
    };
  } catch (error) {
    await updateWebhookEventStatus(intake.eventId, 'failed', safeErrorSummary(error), false).catch(() => {});
    throw error;
  }
}

async function markWebhookEventPending(eventId, errorSummary) {
  await executeStatement(
    `UPDATE jumpyard.roller_webhook_events
     SET status = 'pending_enrichment',
         error_summary = :errorSummary
     WHERE event_id_or_hash = :eventId`,
    [stringParameter('eventId', eventId), stringParameter('errorSummary', errorSummary)],
  );
}

async function updateWebhookEventStatus(eventId, status, errorSummary, processed) {
  await executeStatement(
    `UPDATE jumpyard.roller_webhook_events
     SET status = :status,
         error_summary = :errorSummary,
         enrichment_attempts = enrichment_attempts + 1,
         processed_at = CASE WHEN :processed THEN now() ELSE processed_at END
     WHERE event_id_or_hash = :eventId`,
    [
      stringParameter('eventId', eventId),
      stringParameter('status', status),
      stringParameter('errorSummary', errorSummary),
      { name: 'processed', value: { booleanValue: Boolean(processed) } },
    ],
  );
}

async function persistEnrichmentEventLog(intake, correlationId, booking, productCatalogStatus, guestProfile) {
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
      'roller_webhook.enriched',
      :subjectRef,
      :summary,
      CAST(:eventPayload AS jsonb)
    )
    ON CONFLICT (event_id) DO NOTHING`,
    [
      stringParameter('eventLogId', `webhook-enriched:${intake.eventId}`),
      stringParameter('correlationId', correlationId),
      stringParameter('subjectRef', booking.bookingReference || booking.rollerUniqueId || intake.eventId),
      stringParameter('summary', `Enriched ${intake.eventType} webhook from Roller booking detail.`),
      stringParameter(
        'eventPayload',
        JSON.stringify({
          bookingReference: booking.bookingReference,
          guestNamePresent: Boolean(guestProfile?.namePresent),
          guestProfileUpdated: Boolean(guestProfile?.updated),
          itemCount: booking.items.length,
          productCatalog: productCatalogStatus,
          rollerUniqueId: booking.rollerUniqueId,
          source: 'roller_webhook_enrichment',
        }),
      ),
    ],
  );
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
    error.code = 'webhook_config_error';
    throw error;
  }

  const response = await ssmClient.send(new GetParameterCommand({ Name: name }));
  return String(response.Parameter?.Value ?? '').trim();
}

async function readSecret(secretId) {
  if (!secretId) {
    const error = new Error('Missing Roller credentials secret environment variable.');
    error.code = 'webhook_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Roller credentials secret has no string value.');
    error.code = 'webhook_config_error';
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
    error.code = 'webhook_config_error';
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
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function getGuestDetail(config, token, guestId) {
  const response = await fetch(buildRollerUrl(config.baseUrl, `/guests/${encodeURIComponent(guestId)}`), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });
  emitRollerApiMetric({ method: 'GET', operation: 'get_guest_detail', status: response.status, ok: response.ok });

  if (response.status === 404) {
    return { ok: false, status: 404, body: null };
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function getProductCatalogBestEffort(config, token) {
  if (cachedProducts && cachedProducts.expiresAt > Date.now()) {
    return cachedProducts;
  }

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
      status: 'available',
      byId,
      expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS,
    };
  } catch {
    cachedProducts = {
      status: 'unavailable',
      byId: new Map(),
      expiresAt: Date.now() + 60_000,
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
      type: product.type ?? product.productType ?? product.productSubType ?? null,
      parentType: parent?.type ?? product.parentProductType ?? null,
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

async function enrichGuestProfileFromGuestDetailBestEffort(config, token, booking) {
  if (!booking?.customerId || !needsGuestDetailFallback(booking.guestProfile)) {
    return { status: 'not_needed', used: false };
  }

  try {
    const result = await getGuestDetail(config, token, booking.customerId);
    if (result.status === 404) return { status: 'not_found', used: true };
    if (!result.ok) return { status: 'unavailable', used: true };

    const profile = normalizeGuestDetailProfile(result.body, booking);
    if (!profile) return { status: 'no_profile_fields', used: true };

    booking.guestProfile = mergeGuestProfiles(booking.guestProfile, profile, booking);
    booking.customerId = booking.guestProfile?.rollerCustomerId ?? booking.customerId;

    return { status: 'available', used: true };
  } catch {
    return { status: 'unavailable', used: true };
  }
}

function needsGuestDetailFallback(profile) {
  return !(
    profile?.firstName &&
    profile?.lastName &&
    (profile.email || profile.contactNumber)
  );
}

function normalizeBooking(booking, products) {
  const items = Array.isArray(booking.items) ? booking.items : [];
  const guestProfile = normalizeBookingGuestProfile(booking);
  const bookingCustomerId = guestProfile?.rollerCustomerId ?? stringOrNull(booking.customerId);

  return {
    bookingReference: stringOrNull(booking.bookingReference ?? booking.reference),
    rollerUniqueId: stringOrNull(booking.uniqueId ?? booking.id),
    externalId: stringOrNull(booking.externalId),
    status: stringOrNull(booking.status ?? booking.bookingStatus),
    paymentStatus: stringOrNull(booking.paymentStatus ?? booking.status ?? booking.bookingStatus),
    total: numberOrNull(booking.total ?? booking.costs?.total),
    amountOwing: numberOrNull(booking.amountOwing ?? booking.remainder ?? booking.costs?.amountOwing),
    createdDate: stringOrNull(booking.createdDate),
    customerId: bookingCustomerId,
    guestProfile,
    items: items.map((item) => normalizeBookingItem(item, products.byId, bookingCustomerId)),
  };
}

function normalizeBookingItem(item, productById, bookingCustomerId) {
  const productId = item.productId != null ? String(item.productId) : null;
  const product = productId ? productById.get(productId) : null;
  const tickets = Array.isArray(item.tickets) ? item.tickets : [];
  const itemCustomerId = stringOrNull(item.customerId ?? item.rollerCustomerId ?? item.bookingCustomerId) ?? bookingCustomerId;

  return {
    bookingItemId: stringOrNull(item.bookingItemId ?? item.id),
    productId: numberOrNull(item.productId),
    productName: stringOrNull(item.productName ?? product?.name),
    parentProductId: numberOrNull(item.parentProductId ?? product?.parentProductId),
    parentProductName: stringOrNull(item.parentProductName ?? product?.parentProductName),
    productType: stringOrNull(product?.type ?? product?.parentType),
    quantity: numberOrNull(item.quantity),
    bookingDate: stringOrNull(item.bookingDate),
    startTime: stringOrNull(item.startTime ?? item.sessionStartTime),
    endTime: stringOrNull(item.endTime ?? item.sessionEndTime),
    tickets: tickets.map((ticket) => ({
      ticketId: stringOrNull(ticket.ticketId ?? ticket.id),
      customerId:
        stringOrNull(ticket.customerId ?? ticket.rollerCustomerId ?? ticket.bookingCustomerId ?? ticket.guestId) ??
        itemCustomerId,
      ticketHolderName: stringOrNull(ticket.ticketHolderName ?? ticket.name),
      locations: Array.isArray(ticket.locations) ? ticket.locations : [],
    })),
  };
}

function normalizeBookingGuestProfile(booking) {
  const customer = firstRecord([
    booking.customer,
    booking.bookingCustomer,
    booking.bookingHolder,
    booking.bookingOwner,
    booking.primaryContact,
    booking.contact,
    booking.contacts,
    booking.guest,
    booking.guestDetails,
    booking.customerDetails,
    booking.customers,
  ]);
  const structuredFullName = stringOrNull(
    customer?.name ??
      customer?.fullName ??
      customer?.displayName ??
      booking.customerName ??
      booking.bookingCustomerName ??
      booking.bookingHolderName,
  );
  const splitFullName = splitPersonName(structuredFullName);
  const rollerCustomerId = stringOrNull(
    booking.customerId ??
      customer?.customerId ??
      customer?.id ??
      customer?.uniqueId ??
      customer?.rollerCustomerId ??
      customer?.guestId,
  );
  const firstName = stringOrNull(
    customer?.firstName ?? customer?.givenName ?? customer?.forename ?? booking.customerFirstName ?? splitFullName.firstName,
  );
  const lastName = stringOrNull(
    customer?.lastName ?? customer?.surname ?? customer?.familyName ?? booking.customerLastName ?? splitFullName.lastName,
  );
  const email = normalizeEmail(customer?.email ?? customer?.emailAddress ?? booking.customerEmail ?? booking.email);
  const contactNumber = normalizePhone(
    customer?.phone ??
      customer?.phoneNumber ??
      customer?.contactNumber ??
      customer?.mobile ??
      customer?.mobileNumber ??
      booking.customerPhone ??
      booking.phone,
  );

  if (!rollerCustomerId && !email && !contactNumber) return null;

  return {
    contactNumber,
    contactNumberHash: contactNumber ? hashString(contactNumber) : null,
    contactNumberMasked: maskPhone(contactNumber),
    email,
    emailHash: email ? hashString(email) : null,
    emailMasked: maskEmail(email),
    firstName,
    guestProfileId: rollerCustomerId
      ? `roller_customer:${rollerCustomerId}`
      : `contact:${hashString(`${email || ''}:${contactNumber || ''}`)}`,
    lastName,
    latestBookingContext: compactObject({
      bookingReference: stringOrNull(booking.bookingReference ?? booking.reference),
      createdDate: stringOrNull(booking.createdDate),
      firstName,
      lastName,
      source: SOURCE_WEBHOOK_GUEST_PROFILE,
    }),
    rollerCustomerId,
    smsReady: Boolean(contactNumber),
  };
}

function normalizeGuestDetailProfile(body, booking) {
  const guest = firstRecord([body?.guest, body?.customer, body?.data, body]);
  if (!isRecord(guest)) return null;

  const rollerCustomerId = stringOrNull(
    guest.guestId ?? guest.customerId ?? guest.id ?? guest.rollerCustomerId ?? booking.customerId,
  );
  const firstName = stringOrNull(guest.firstName ?? guest.givenName ?? guest.forename);
  const lastName = stringOrNull(guest.lastName ?? guest.surname ?? guest.familyName);
  const email = normalizeEmail(guest.email ?? guest.emailAddress);
  const contactNumber = normalizePhone(guest.phone ?? guest.phoneNumber ?? guest.contactNumber ?? guest.mobile ?? guest.mobileNumber);

  if (!rollerCustomerId && !email && !contactNumber) return null;

  return {
    contactNumber,
    contactNumberHash: contactNumber ? hashString(contactNumber) : null,
    contactNumberMasked: maskPhone(contactNumber),
    email,
    emailHash: email ? hashString(email) : null,
    emailMasked: maskEmail(email),
    firstName,
    guestProfileId: rollerCustomerId
      ? `roller_customer:${rollerCustomerId}`
      : `contact:${hashString(`${email || ''}:${contactNumber || ''}`)}`,
    lastName,
    latestBookingContext: compactObject({
      bookingReference: booking.bookingReference,
      firstName,
      lastName,
      source: SOURCE_WEBHOOK_GUEST_DETAIL,
    }),
    rollerCustomerId,
    smsReady: Boolean(contactNumber),
  };
}

function mergeGuestProfiles(primary, fallback, booking) {
  if (!primary) return fallback;

  const rollerCustomerId = primary.rollerCustomerId ?? fallback.rollerCustomerId;
  const email = primary.email ?? fallback.email;
  const contactNumber = primary.contactNumber ?? fallback.contactNumber;
  const firstName = primary.firstName ?? fallback.firstName;
  const lastName = primary.lastName ?? fallback.lastName;
  const guestProfileId = rollerCustomerId
    ? `roller_customer:${rollerCustomerId}`
    : primary.guestProfileId ?? fallback.guestProfileId;

  return {
    ...primary,
    contactNumber,
    contactNumberHash: contactNumber ? hashString(contactNumber) : null,
    contactNumberMasked: maskPhone(contactNumber),
    email,
    emailHash: email ? hashString(email) : null,
    emailMasked: maskEmail(email),
    firstName,
    guestProfileId,
    lastName,
    latestBookingContext: compactObject({
      ...(primary.latestBookingContext ?? {}),
      ...(fallback.latestBookingContext ?? {}),
      bookingReference: booking.bookingReference,
      firstName,
      lastName,
    }),
    rollerCustomerId,
    smsReady: Boolean(primary.smsReady || fallback.smsReady || contactNumber),
  };
}

function firstRecord(values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstRecord(value);
      if (isRecord(nested) && Object.keys(nested).length > 0) return nested;
    }
    if (isRecord(value)) return value;
  }
  return {};
}

function splitPersonName(value) {
  const parts = stringOrNull(value)
    ?.trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts || parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function upsertWebhookBooking(booking, rollerEnv, venueId) {
  if (!booking.rollerUniqueId || !booking.bookingReference) return;

  const bookingDates = booking.items.map((item) => item.bookingDate).filter(Boolean);
  const startTimes = booking.items.map((item) => item.startTime).filter(Boolean);
  const endTimes = booking.items.map((item) => item.endTime).filter(Boolean);
  const payloadHash = hashJson({
    bookingReference: booking.bookingReference,
    itemCount: booking.items.length,
    paymentStatus: booking.paymentStatus,
    source: 'roller_webhook_enrichment',
    status: booking.status,
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
      'roller_webhook_enrichment',
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
      venue_id = COALESCE(EXCLUDED.venue_id, jumpyard.roller_bookings.venue_id),
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
      stringParameter('venueId', venueId),
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
          bookingCustomerId: booking.customerId,
          customerEmailPresent: Boolean(booking.guestProfile?.email),
          customerNamePresent: Boolean(booking.guestProfile?.firstName || booking.guestProfile?.lastName),
          customerPhonePresent: Boolean(booking.guestProfile?.contactNumber),
          externalId: booking.externalId,
          itemCount: booking.items.length,
          source: 'roller_webhook_enrichment',
        }),
      ),
    ],
  );

  for (const item of booking.items) {
    const bookingItemKey = await upsertWebhookBookingItem(booking.rollerUniqueId, item);

    for (const ticket of item.tickets ?? []) {
      await upsertWebhookTicket(booking.rollerUniqueId, bookingItemKey, item, ticket);
    }
  }
}

async function upsertWebhookBookingItem(rollerUniqueId, item) {
  const bookingItemKey = localBookingItemKey(rollerUniqueId, item);

  await executeStatement(
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
    ON CONFLICT (booking_item_key) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_item_id = EXCLUDED.booking_item_id,
      product_id = EXCLUDED.product_id,
      parent_product_id = EXCLUDED.parent_product_id,
      product_name = COALESCE(EXCLUDED.product_name, jumpyard.roller_booking_items.product_name),
      parent_product_name = COALESCE(EXCLUDED.parent_product_name, jumpyard.roller_booking_items.parent_product_name),
      quantity = EXCLUDED.quantity,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      item_summary = EXCLUDED.item_summary,
      updated_at = now()`,
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
          source: 'roller_webhook_enrichment',
        }),
      ),
    ],
  );

  return bookingItemKey;
}

async function upsertWebhookTicket(rollerUniqueId, bookingItemKey, item, ticket) {
  if (!ticket.ticketId) return;

  await executeStatement(
    `INSERT INTO jumpyard.roller_booking_tickets (
      ticket_id,
      roller_unique_id,
      booking_item_key,
      booking_item_id,
      roller_customer_id,
      ticket_holder_name_masked,
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
      :rollerCustomerId,
      NULL,
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
      roller_customer_id = COALESCE(EXCLUDED.roller_customer_id, jumpyard.roller_booking_tickets.roller_customer_id),
      locations = EXCLUDED.locations,
      last_seen_from_roller_at = now(),
      product_id = EXCLUDED.product_id,
      booking_date = EXCLUDED.booking_date,
      ticket_summary = EXCLUDED.ticket_summary,
      updated_at = now()`,
    [
      stringParameter('ticketId', ticket.ticketId),
      stringParameter('rollerUniqueId', rollerUniqueId),
      stringParameter('bookingItemKey', bookingItemKey),
      stringParameter('bookingItemId', item.bookingItemId),
      stringParameter('rollerCustomerId', ticket.customerId),
      stringParameter('locations', JSON.stringify(Array.isArray(ticket.locations) ? ticket.locations : [])),
      stringParameter('productId', item.productId),
      stringParameter('bookingDate', item.bookingDate),
      stringParameter(
        'ticketSummary',
        JSON.stringify({
          source: 'roller_webhook_enrichment',
        }),
      ),
    ],
  );
}

async function upsertWebhookGuestProfile(booking) {
  const profile = booking?.guestProfile;
  if (!profile?.guestProfileId) {
    return { updated: false, namePresent: false, contactPresent: false };
  }

  const result = await executeStatement(
    `INSERT INTO jumpyard.guest_profiles (
      guest_profile_id,
      roller_customer_id,
      email,
      email_hash,
      email_masked,
      contact_number,
      contact_number_hash,
      contact_number_masked,
      sms_ready,
      contact_source,
      latest_booking_context,
      last_seen_from_roller_at
    )
    VALUES (
      :guestProfileId,
      :rollerCustomerId,
      :email,
      :emailHash,
      :emailMasked,
      :contactNumber,
      :contactNumberHash,
      :contactNumberMasked,
      :smsReady,
      :contactSource,
      CAST(:latestBookingContext AS jsonb),
      now()
    )
    ON CONFLICT (guest_profile_id) DO UPDATE SET
      roller_customer_id = COALESCE(EXCLUDED.roller_customer_id, jumpyard.guest_profiles.roller_customer_id),
      email = COALESCE(EXCLUDED.email, jumpyard.guest_profiles.email),
      email_hash = COALESCE(EXCLUDED.email_hash, jumpyard.guest_profiles.email_hash),
      email_masked = COALESCE(EXCLUDED.email_masked, jumpyard.guest_profiles.email_masked),
      contact_number = COALESCE(EXCLUDED.contact_number, jumpyard.guest_profiles.contact_number),
      contact_number_hash = COALESCE(EXCLUDED.contact_number_hash, jumpyard.guest_profiles.contact_number_hash),
      contact_number_masked = COALESCE(EXCLUDED.contact_number_masked, jumpyard.guest_profiles.contact_number_masked),
      sms_ready = jumpyard.guest_profiles.sms_ready OR EXCLUDED.sms_ready,
      contact_source = EXCLUDED.contact_source,
      latest_booking_context = jumpyard.guest_profiles.latest_booking_context || EXCLUDED.latest_booking_context,
      last_seen_from_roller_at = EXCLUDED.last_seen_from_roller_at,
      updated_at = now()
    RETURNING guest_profile_id`,
    [
      stringParameter('guestProfileId', profile.guestProfileId),
      stringParameter('rollerCustomerId', profile.rollerCustomerId),
      stringParameter('email', profile.email),
      stringParameter('emailHash', profile.emailHash),
      stringParameter('emailMasked', profile.emailMasked),
      stringParameter('contactNumber', profile.contactNumber),
      stringParameter('contactNumberHash', profile.contactNumberHash),
      stringParameter('contactNumberMasked', profile.contactNumberMasked),
      { name: 'smsReady', value: { booleanValue: Boolean(profile.smsReady) } },
      stringParameter('contactSource', SOURCE_WEBHOOK_GUEST_PROFILE),
      stringParameter('latestBookingContext', JSON.stringify(profile.latestBookingContext)),
    ],
  );

  return {
    updated: (result.records?.length ?? 0) > 0,
    namePresent: Boolean(profile.firstName || profile.lastName),
    contactPresent: Boolean(profile.email || profile.contactNumber),
  };
}

async function reconcilePrepaymentDraftFromPaidBooking(booking, source) {
  if (!booking?.rollerUniqueId || !booking.bookingReference || !isPaymentSettled(booking)) return [];

  const result = await executeStatement(
    `UPDATE jumpyard.prepayment_booking_drafts
     SET status = 'published',
         amount_owing_cents = COALESCE(:amountOwingCents, 0),
         total_cents = COALESCE(:totalCents, total_cents),
         updated_at = now()
     WHERE roller_draft_unique_id = :rollerUniqueId
       AND status IN ('payment_pending', 'payment_blocked')
     RETURNING prepayment_draft_id, flow_type`,
    [
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      intParameter('amountOwingCents', currencyToCents(booking.amountOwing)),
      intParameter('totalCents', currencyToCents(booking.total)),
    ],
  );

  const updatedDrafts = mappedRows(result);
  for (const draft of updatedDrafts) {
    await recordPrepaymentDraftPublishedEvent(booking, draft, source);
  }

  return updatedDrafts;
}

async function recordPrepaymentDraftPublishedEvent(booking, draft, source) {
  const draftId = stringOrNull(draft.prepayment_draft_id);
  if (!draftId) return;

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
      'prepayment_draft.published',
      :subjectRef,
      :summary,
      CAST(:eventPayload AS jsonb)
    )
    ON CONFLICT (event_id) DO NOTHING`,
    [
      stringParameter('eventId', `prepayment-draft-published:${draftId}`),
      stringParameter('correlationId', createCorrelationId()),
      stringParameter('subjectRef', booking.bookingReference || booking.rollerUniqueId),
      stringParameter('summary', 'Marked pre-payment draft as published after paid Roller booking confirmation.'),
      stringParameter(
        'eventPayload',
        JSON.stringify({
          bookingReference: booking.bookingReference,
          flowType: stringOrNull(draft.flow_type),
          prepaymentDraftId: draftId,
          rollerUniqueId: booking.rollerUniqueId,
          source,
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
      Handler: sanitizeMetricValue(process.env.JUMPYARD_HANDLER || 'webhook'),
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
      includeResultMetadata: true,
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

function intParameter(name, value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? { name, value: { isNull: true } }
    : { name, value: { longValue: Number(value) } };
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

function firstString(values, fallback = null) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }

  return fallback;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function currencyToCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function normalizeEmail(value) {
  const email = stringOrNull(value)?.trim().toLowerCase();
  return email && email.includes('@') ? email : null;
}

function normalizePhone(value) {
  const phone = stringOrNull(value)?.replace(/[^\d+]/g, '');
  return phone || null;
}

function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = String(email).split('@');
  if (!name || !domain) return '***';
  return `${name.slice(0, 2)}***@${domain.slice(0, 1)}***`;
}

function maskPhone(phone) {
  if (!phone) return null;
  const value = String(phone);
  if (value.length <= 4) return '****';
  return `${value.slice(0, 3)}*****${value.slice(-4)}`;
}

function minOrNull(values) {
  const sorted = values.filter(Boolean).sort();
  return sorted[0] ?? null;
}

function maxOrNull(values) {
  const sorted = values.filter(Boolean).sort();
  return sorted[sorted.length - 1] ?? null;
}

function hashJson(value) {
  return hashString(JSON.stringify(value));
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ''),
  );
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function isTombstoned(status) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'deleted';
}

function isPaymentSettled(booking) {
  const status = String(booking.paymentStatus ?? booking.status ?? '').toLowerCase().replace(/\s+/g, '');
  if (status.includes('pending') || status.includes('unpaid') || status.includes('partial')) return false;

  const amountOwing = numberOrNull(booking.amountOwing);
  if (amountOwing !== null && amountOwing > 0) return false;

  return status === 'paid' || status === 'paidinfull' || status === 'nopaymentrequired';
}

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function safeErrorSummary(error) {
  const code = error?.code ? String(error.code) : 'webhook_enrichment_failed';
  const message = error?.message ? String(error.message) : 'Webhook enrichment failed.';
  return `${code}: ${message}`.slice(0, 500);
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

  if (error.code === 'roller_token_error' || error.code === 'roller_lookup_error') {
    return {
      statusCode: 500,
      status: 'enrichment_failed',
      code: error.code,
      message: 'JumpYard Cloud webhook enrichment failed and Roller should retry the delivery.',
    };
  }

  return {
    statusCode: 500,
    status: 'enrichment_failed',
    code: 'webhook_enrichment_failed',
    message: 'JumpYard Cloud webhook enrichment failed and Roller should retry the delivery.',
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
