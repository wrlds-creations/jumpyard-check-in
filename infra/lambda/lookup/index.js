const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const ROLLER_PLAYGROUND_BASE_URL = 'https://api.play.roller.app';
const ROLLER_LIVE_BASE_URL = 'https://api.roller.app';
const PRODUCT_CACHE_TTL_MS = 15 * 60 * 1000;

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedToken = null;
let cachedProducts = null;

exports.handler = async (event) => {
  let correlationId = createCorrelationId();
  let parkTestAccess = { ok: true, mode: 'not_park_test' };

  try {
    const request = parseRequest(event);
    correlationId = request.correlationId || correlationId;

    if (!request.identifier) {
      return jsonResponse(400, correlationId, {
        status: 'invalid_request',
        error: {
          code: 'identifier_required',
          message: 'identifier is required.',
        },
      });
    }

    if (isParkTestEnvironment()) {
      parkTestAccess = await validateParkTestLookupAccess(request.identifier);
      if (!parkTestAccess.ok) {
        return jsonResponse(parkTestAccess.statusCode, correlationId, {
          status: 'blocked',
          error: {
            code: parkTestAccess.code,
            message: parkTestAccess.message,
          },
        });
      }
    }

    const localResult = await getLocalBooking(request);
    if (localResult.status === 'found' && shouldUseLocalBooking(localResult.booking)) {
      const parkTestScope = validateParkTestBookingScope(parkTestAccess, request, null, localResult.booking);
      if (!parkTestScope.ok) {
        return jsonResponse(parkTestScope.statusCode, correlationId, {
          status: 'blocked',
          error: {
            code: parkTestScope.code,
            message: parkTestScope.message,
          },
        });
      }

      await reconcilePrepaymentDraftFromPaidBooking(localResult.booking, 'aurora_local_lookup');
      const eligibility = evaluateEligibility(localResult.booking, request);

      return jsonResponse(200, correlationId, {
        status: 'found',
        booking: localResult.booking,
        eligibility,
        source: {
          system: 'jumpyard_cloud',
          environment: localResult.metadata.rollerEnv,
          lookupPath: localResult.metadata.lookupPath,
          freshnessStatus: localResult.metadata.freshnessStatus,
          refreshedFromRoller: false,
        },
      });
    }

    const config = await getRollerConfig();
    const token = await getRollerAccessToken(config);
    const bookingResult = await getBookingDetail(config, token, request.identifier);

    if (bookingResult.status === 404) {
      return jsonResponse(404, correlationId, {
        status: 'not_found',
        error: {
          code: 'booking_not_found',
          message: 'No Roller booking was found for the supplied identifier.',
        },
      });
    }

    if (!bookingResult.ok) {
      return jsonResponse(502, correlationId, {
        status: 'roller_error',
        error: {
          code: 'roller_lookup_failed',
          message: `Roller lookup failed with HTTP ${bookingResult.status}.`,
        },
      });
    }

    const products = await getProductCatalogBestEffort(config, token);
    const booking = normalizeBooking(bookingResult.body, products);
    const parkTestScope = validateParkTestBookingScope(parkTestAccess, request, bookingResult.body, booking);
    if (!parkTestScope.ok) {
      return jsonResponse(parkTestScope.statusCode, correlationId, {
        status: 'blocked',
        error: {
          code: parkTestScope.code,
          message: parkTestScope.message,
        },
      });
    }

    await upsertLiveBooking(booking, config.env, parkTestScope.venueId ?? request.venueId);
    await reconcilePrepaymentDraftFromPaidBooking(booking, 'roller_live_lookup');
    const eligibility = evaluateEligibility(booking, request);

    return jsonResponse(200, correlationId, {
      status: 'found',
      booking,
      eligibility,
      source: {
        system: 'roller',
        environment: config.env,
        lookupPath: 'GET /bookings/{identifier}',
        localLookupStatus: localResult.status,
        productCatalog: products.status,
        refreshedFromRoller: true,
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
    const identifier = String(parsed.identifier ?? '').trim();

    return {
      venueId: parsed.venueId ? String(parsed.venueId).trim() : null,
      identifier,
      identifierType: parsed.identifierType ? String(parsed.identifierType).trim() : inferIdentifierType(identifier),
      expectedDate: parsed.expectedDate ? String(parsed.expectedDate).trim() : null,
      expectedStartTime: parsed.expectedStartTime ? String(parsed.expectedStartTime).trim() : null,
      correlationId: parsed.correlationId ? String(parsed.correlationId).trim() : null,
    };
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'invalid_json';
    throw error;
  }
}

function inferIdentifierType(identifier) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
    return 'rollerUniqueId';
  }

  if (/^\d{5,12}$/.test(identifier)) {
    return 'bookingReference';
  }

  return 'unknown';
}

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

async function getLocalBooking(request) {
  const bookingRow = await findLocalBookingRow(request.identifier);
  if (!bookingRow) {
    return { status: 'missing', booking: null, metadata: { lookupPath: 'aurora:missing' } };
  }

  const items = await findLocalBookingItems(bookingRow.rollerUniqueId);
  const booking = normalizeLocalBooking(bookingRow, items);

  return {
    status: bookingRow.freshnessStatus === 'fresh' ? 'found' : 'stale',
    booking,
    metadata: {
      freshnessStatus: bookingRow.freshnessStatus,
      lookupPath: bookingRow.lookupPath,
      rollerEnv: bookingRow.rollerEnv,
    },
  };
}

async function findLocalBookingRow(identifier) {
  const result = await executeStatement(
    `SELECT
       b.roller_unique_id,
       b.booking_reference,
       b.roller_env,
       b.venue_id,
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
       CASE
         WHEN b.booking_reference = :identifier THEN 'aurora:booking_reference'
         WHEN b.roller_unique_id = :identifier THEN 'aurora:roller_unique_id'
         ELSE 'aurora:ticket_id'
       END AS lookup_path
     FROM jumpyard.roller_bookings AS b
     WHERE b.booking_reference = :identifier
        OR b.roller_unique_id = :identifier
        OR EXISTS (
          SELECT 1
          FROM jumpyard.roller_booking_tickets AS t
          WHERE t.roller_unique_id = b.roller_unique_id
            AND t.ticket_id = :identifier
        )
     ORDER BY b.source_last_updated_at DESC
     LIMIT 1`,
    [stringParameter('identifier', identifier)],
  );

  const row = firstMappedRow(result);
  if (!row) return null;

  return {
    amountOwingCents: numberOrNull(row.amount_owing_cents),
    bookingDate: stringOrNull(row.booking_date),
    bookingReference: stringOrNull(row.booking_reference),
    bookingStatus: stringOrNull(row.booking_status),
    endTime: stringOrNull(row.end_time),
    freshnessStatus: stringOrNull(row.freshness_status) || 'stale',
    isTombstoned: Boolean(row.is_tombstoned),
    lastSeenFromRollerAt: stringOrNull(row.last_seen_from_roller_at),
    lookupPath: stringOrNull(row.lookup_path) || 'aurora',
    paymentStatus: stringOrNull(row.payment_status),
    rollerEnv: stringOrNull(row.roller_env),
    rollerUniqueId: stringOrNull(row.roller_unique_id),
    startTime: stringOrNull(row.start_time),
    totalCents: numberOrNull(row.total_cents),
    venueId: stringOrNull(row.venue_id),
  };
}

async function findLocalBookingItems(rollerUniqueId) {
  const result = await executeStatement(
    `SELECT
       i.booking_item_key,
       i.booking_item_id,
       i.product_id,
       i.parent_product_id,
       i.product_name,
       i.parent_product_name,
       COALESCE(product.summary ->> 'productType', product.summary ->> 'productSubType', product.summary ->> 'parentType') AS product_type,
       i.quantity,
       i.booking_date::text AS booking_date,
       i.start_time::text AS start_time,
       i.end_time::text AS end_time,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'ticketId', t.ticket_id,
             'name', null,
             'ticketHolderName', t.ticket_holder_name_masked,
             'locations', t.locations
           )
           ORDER BY t.ticket_id
         ) FILTER (WHERE t.ticket_id IS NOT NULL),
         '[]'::jsonb
       )::text AS tickets_json
     FROM jumpyard.roller_booking_items AS i
     LEFT JOIN jumpyard.roller_bookings AS b
       ON b.roller_unique_id = i.roller_unique_id
     LEFT JOIN jumpyard.product_catalog_cache AS product
       ON product.roller_env = b.roller_env
      AND product.venue_id = b.venue_id
      AND product.summary ->> 'id' = i.product_id
     LEFT JOIN jumpyard.roller_booking_tickets AS t
       ON t.roller_unique_id = i.roller_unique_id
      AND (
        t.booking_item_key = i.booking_item_key
        OR (t.booking_item_id IS NOT NULL AND t.booking_item_id = i.booking_item_id)
      )
     WHERE i.roller_unique_id = :rollerUniqueId
     GROUP BY
       i.booking_item_key,
       i.booking_item_id,
       i.product_id,
       i.parent_product_id,
       i.product_name,
       i.parent_product_name,
       product.summary,
       i.quantity,
       i.booking_date,
       i.start_time,
       i.end_time
     ORDER BY i.booking_date NULLS LAST, i.start_time NULLS LAST, i.product_name NULLS LAST`,
    [stringParameter('rollerUniqueId', rollerUniqueId)],
  );

  return mappedRows(result).map((row) => ({
    bookingItemId: stringOrNull(row.booking_item_id),
    bookingItemKey: stringOrNull(row.booking_item_key),
    productId: numberOrNull(row.product_id),
    productName: stringOrNull(row.product_name),
    parentProductId: numberOrNull(row.parent_product_id),
    parentProductName: stringOrNull(row.parent_product_name),
    productType: stringOrNull(row.product_type),
    quantity: numberOrNull(row.quantity),
    bookingDate: stringOrNull(row.booking_date),
    startTime: stringOrNull(row.start_time),
    endTime: stringOrNull(row.end_time),
    tickets: parseJsonArray(row.tickets_json),
  }));
}

function normalizeLocalBooking(bookingRow, items) {
  return {
    bookingReference: bookingRow.bookingReference,
    rollerUniqueId: bookingRow.rollerUniqueId,
    externalId: null,
    status: bookingRow.bookingStatus,
    paymentStatus: bookingRow.paymentStatus ?? bookingRow.bookingStatus,
    venueId: bookingRow.venueId,
    isTombstoned: bookingRow.isTombstoned,
    total: centsToCurrency(bookingRow.totalCents),
    amountOwing: centsToCurrency(bookingRow.amountOwingCents),
    createdDate: null,
    customerId: null,
    items: items.length > 0 ? items : [fallbackLocalItem(bookingRow)].filter(Boolean),
  };
}

function fallbackLocalItem(bookingRow) {
  if (!bookingRow.bookingDate && !bookingRow.startTime && !bookingRow.endTime) return null;

  return {
    bookingItemId: null,
    productId: null,
    productName: null,
    parentProductId: null,
    parentProductName: null,
    productType: null,
    quantity: null,
    bookingDate: bookingRow.bookingDate,
    startTime: bookingRow.startTime,
    endTime: bookingRow.endTime,
    tickets: [],
  };
}

function shouldUseLocalBooking(booking) {
  if (!booking || booking.isTombstoned) return false;

  const paymentStatus = String(booking.paymentStatus ?? booking.status ?? '').trim();
  if (!paymentStatus && booking.amountOwing === null) return false;

  return true;
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
    error.code = 'lookup_config_error';
    throw error;
  }

  const response = await ssmClient.send(new GetParameterCommand({ Name: name }));
  return String(response.Parameter?.Value ?? '').trim();
}

async function readSecret(secretId) {
  if (!secretId) {
    const error = new Error('Missing Roller credentials secret environment variable.');
    error.code = 'lookup_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Roller credentials secret has no string value.');
    error.code = 'lookup_config_error';
    throw error;
  }

  return JSON.parse(secretString);
}

function validateRollerConfig(config) {
  const errors = [];
  let parsedBaseUrl = null;
  const liveLookupGateEnabled = isParkTestRollerLiveLookupRuntimeEnabled();

  if (!liveLookupGateEnabled && config.env !== 'playground') {
    errors.push('Roller environment must be playground.');
  }

  if (liveLookupGateEnabled && config.env !== 'live') {
    errors.push('Roller environment must be live for the active park-test lookup gate.');
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
    if (liveLookupGateEnabled) {
      if (parsedBaseUrl.origin !== ROLLER_LIVE_BASE_URL || parsedBaseUrl.pathname !== '/') {
        errors.push(`Roller base URL must be ${ROLLER_LIVE_BASE_URL} for the active park-test lookup gate.`);
      }
    } else {
      if (PRODUCTION_URL_MARKER.test(searchableUrl)) {
        errors.push('Roller base URL looks like production/live.');
      }
      if (!PLAYGROUND_URL_MARKER.test(searchableUrl) || parsedBaseUrl.origin !== ROLLER_PLAYGROUND_BASE_URL) {
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
    error.code = 'lookup_config_error';
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

function normalizeBooking(booking, products) {
  const items = Array.isArray(booking.items) ? booking.items : [];

  return {
    bookingReference: stringOrNull(booking.bookingReference ?? booking.reference),
    rollerUniqueId: stringOrNull(booking.uniqueId ?? booking.id),
    externalId: stringOrNull(booking.externalId),
    status: stringOrNull(booking.status ?? booking.bookingStatus),
    paymentStatus: stringOrNull(booking.paymentStatus ?? booking.status ?? booking.bookingStatus),
    venueId: stringOrNull(booking.venueId ?? booking.venue?.id),
    total: numberOrNull(booking.total ?? booking.costs?.total),
    amountOwing: numberOrNull(booking.amountOwing ?? booking.remainder ?? booking.costs?.amountOwing),
    createdDate: stringOrNull(booking.createdDate),
    customerId: null,
    items: items.map((item) => normalizeBookingItem(item, products.byId)),
  };
}

function normalizeBookingItem(item, productById) {
  const productId = item.productId != null ? String(item.productId) : null;
  const product = productId ? productById.get(productId) : null;
  const tickets = Array.isArray(item.tickets) ? item.tickets : [];

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
      name: null,
      ticketHolderName: null,
      locations: Array.isArray(ticket.locations) ? ticket.locations : [],
    })),
  };
}

function isParkTestEnvironment() {
  return process.env.JUMPYARD_ENVIRONMENT === 'park-test';
}

async function validateParkTestLookupAccess(identifier) {
  if (isParkTestLiveLookupGateEnabled() && isParkTestLiveLookupIdentifierAllowed(identifier)) {
    return { ok: true, mode: 'explicit_live_lookup_gate' };
  }

  if (isT0169PostPaymentSyncEnabled()) {
    const draft = await findPostPaymentSyncDraft(identifier);
    if (draft) {
      return { ok: true, mode: 'post_payment_sync', draft };
    }
  }

  if (isT0171AssistedLookupEnabled()) {
    if (!isAssistedLookupIdentifierShapeAllowed(identifier)) {
      return {
        ok: false,
        statusCode: 403,
        code: 'live_lookup_not_allowed',
        message: 'Only booking references or Roller booking ids are approved for assisted park-test lookup.',
      };
    }

    return { ok: true, mode: 'assisted_lookup' };
  }

  if (!isParkTestLiveLookupGateEnabled() && !isT0169PostPaymentSyncEnabled()) {
    return {
      ok: false,
      statusCode: 409,
      code: 'live_lookup_disabled',
      message: 'Live lookup is disabled for park-test.',
    };
  }

  return {
    ok: false,
    statusCode: 403,
    code: 'live_lookup_not_allowed',
    message: 'This booking identifier is not approved for the active park-test Live lookup gate.',
  };
}

function validateParkTestBookingScope(access, request, rollerBooking, booking) {
  if (!isParkTestEnvironment() || access?.mode !== 'assisted_lookup') {
    return { ok: true, venueId: request.venueId };
  }

  const allowedDates = getT0171AssistedLookupAllowedOperatingDates();
  const bookingDates = getBookingOperatingDates(booking);

  if (allowedDates.length === 0) {
    return {
      ok: false,
      statusCode: 500,
      code: 'lookup_config_error',
      message: 'Assisted park-test lookup has no approved operating dates.',
    };
  }

  if (bookingDates.length === 0 || bookingDates.some((date) => !allowedDates.includes(date))) {
    return {
      ok: false,
      statusCode: 403,
      code: 'live_lookup_not_allowed',
      message: 'This booking is outside the approved park-test operating date.',
    };
  }

  const approvedVenueId = getT0171AssistedLookupVenueId();
  const rollerVenueId = extractVenueId(rollerBooking) || stringOrNull(booking?.venueId);

  if (approvedVenueId && rollerVenueId && rollerVenueId !== approvedVenueId) {
    return {
      ok: false,
      statusCode: 403,
      code: 'live_lookup_not_allowed',
      message: 'This booking is outside the approved park-test venue.',
    };
  }

  return { ok: true, venueId: rollerVenueId || approvedVenueId || request.venueId };
}

function isT0160LiveLookupSmokeEnabled() {
  return isParkTestEnvironment() && process.env.ENABLE_T0160_LIVE_LOOKUP_SMOKE === 'true';
}

function isT0165LinkedAddOnSettlementEnabled() {
  return isParkTestEnvironment() && process.env.ENABLE_T0165_LINKED_ADDON_SETTLEMENT === 'true';
}

function isT0169PostPaymentSyncEnabled() {
  return isParkTestEnvironment() && process.env.ENABLE_T0169_POST_PAYMENT_SYNC === 'true';
}

function isT0171AssistedLookupEnabled() {
  return isParkTestEnvironment() && process.env.ENABLE_T0171_ASSISTED_LOOKUP === 'true';
}

function isParkTestLiveLookupGateEnabled() {
  return isT0160LiveLookupSmokeEnabled() || isT0165LinkedAddOnSettlementEnabled() || isT0171AssistedLookupEnabled();
}

function isParkTestRollerLiveLookupRuntimeEnabled() {
  return isParkTestLiveLookupGateEnabled() || isT0169PostPaymentSyncEnabled();
}

function isParkTestLiveLookupIdentifierAllowed(identifier) {
  return (
    isT0160LiveLookupSmokeIdentifierAllowed(identifier) ||
    isT0165LinkedAddOnSettlementIdentifierAllowed(identifier)
  );
}

function isAssistedLookupIdentifierShapeAllowed(identifier) {
  const normalized = String(identifier ?? '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }

  return /^[1-9]\d{5,8}$/.test(normalized);
}

function getT0171AssistedLookupAllowedOperatingDates() {
  return String(process.env.T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES || '')
    .split(',')
    .map((value) => normalizeDate(value))
    .filter(Boolean);
}

function getT0171AssistedLookupVenueId() {
  return stringOrNull(process.env.T0171_ASSISTED_LOOKUP_VENUE_ID);
}

function getBookingOperatingDates(booking) {
  const items = Array.isArray(booking?.items) ? booking.items : [];
  const dates = items.map((item) => normalizeDate(item.bookingDate)).filter(Boolean);
  return Array.from(new Set(dates)).sort();
}

function normalizeDate(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
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
      item.venueId,
      item.venueID,
      item.locationId,
      item.locationID,
      item.venue?.id,
      item.venue?.venueId,
      item.location?.id,
    );
  }

  const value = candidates.map((candidate) => stringOrNull(candidate)).find(Boolean);
  return value ?? null;
}

function isT0160LiveLookupSmokeIdentifierAllowed(identifier) {
  const allowed = String(process.env.T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowed.length === 0) return false;
  return allowed.includes(String(identifier ?? '').trim());
}

function isT0165LinkedAddOnSettlementIdentifierAllowed(identifier) {
  const allowed = String(process.env.T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowed.length === 0) return false;
  return allowed.includes(String(identifier ?? '').trim());
}

async function findPostPaymentSyncDraft(identifier) {
  const normalized = String(identifier ?? '').trim();
  if (!normalized) return null;

  const result = await executeStatement(
    `SELECT
       prepayment_draft_id,
       roller_draft_unique_id,
       status,
       flow_type,
       roller_env,
       created_at::text AS created_at,
       expires_at::text AS expires_at
     FROM jumpyard.prepayment_booking_drafts
     WHERE roller_draft_unique_id = :identifier
       AND flow_type = 'new_booking'
       AND roller_env = 'live'
       AND status IN ('payment_pending', 'payment_blocked', 'published')
       AND created_at >= now() - interval '24 hours'
     ORDER BY created_at DESC
     LIMIT 1`,
    [stringParameter('identifier', normalized)],
  );

  const row = firstMappedRow(result);
  if (!row) return null;

  return {
    createdAt: stringOrNull(row.created_at),
    expiresAt: stringOrNull(row.expires_at),
    flowType: stringOrNull(row.flow_type),
    prepaymentDraftId: stringOrNull(row.prepayment_draft_id),
    rollerDraftUniqueId: stringOrNull(row.roller_draft_unique_id),
    rollerEnv: stringOrNull(row.roller_env),
    status: stringOrNull(row.status),
  };
}

async function upsertLiveBooking(booking, rollerEnv, venueId) {
  if (!booking.rollerUniqueId || !booking.bookingReference) return;

  const bookingDates = booking.items.map((item) => item.bookingDate).filter(Boolean);
  const startTimes = booking.items.map((item) => item.startTime).filter(Boolean);
  const endTimes = booking.items.map((item) => item.endTime).filter(Boolean);
  const payloadHash = hashJson({
    bookingReference: booking.bookingReference,
    itemCount: booking.items.length,
    paymentStatus: booking.paymentStatus,
    source: 'roller_live_lookup',
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
      'roller_live_lookup',
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
          externalId: booking.externalId,
          itemCount: booking.items.length,
          source: 'roller_live_lookup',
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
          source: 'roller_live_lookup',
        }),
      ),
    ],
  );

  return bookingItemKey;
}

async function upsertLiveTicket(rollerUniqueId, bookingItemKey, item, ticket) {
  if (!ticket.ticketId) return;

  await executeStatement(
    `INSERT INTO jumpyard.roller_booking_tickets (
      ticket_id,
      roller_unique_id,
      booking_item_key,
      booking_item_id,
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
      stringParameter('locations', JSON.stringify(Array.isArray(ticket.locations) ? ticket.locations : [])),
      stringParameter('productId', item.productId),
      stringParameter('bookingDate', item.bookingDate),
      stringParameter(
        'ticketSummary',
        JSON.stringify({
          source: 'roller_live_lookup',
        }),
      ),
    ],
  );
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

  const updatedLinks = await reconcileLinkedAddOnBookingLinks(booking, source);
  for (const link of updatedLinks) {
    await recordBookingLinkPublishedEvent(booking, link, source);
  }

  return updatedDrafts;
}

async function reconcileLinkedAddOnBookingLinks(booking, source) {
  if (!booking?.rollerUniqueId || !booking.bookingReference || !isPaymentSettled(booking)) return [];

  const result = await executeStatement(
    `UPDATE jumpyard.booking_links
     SET status = 'published',
         linked_booking_reference = COALESCE(NULLIF(linked_booking_reference, ''), :bookingReference)
     WHERE linked_roller_unique_id = :rollerUniqueId
       AND link_type = 'add_product_draft'
       AND status IN ('payment_pending', 'payment_blocked')
     RETURNING
       link_id,
       link_type,
       original_booking_reference,
       original_roller_unique_id,
       linked_booking_reference,
       linked_roller_unique_id,
       add_on_group_id,
       status`,
    [
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
    ],
  );

  return mappedRows(result).map((row) => ({
    addOnGroupId: stringOrNull(row.add_on_group_id),
    linkId: stringOrNull(row.link_id),
    linkType: stringOrNull(row.link_type),
    linkedBookingReference: stringOrNull(row.linked_booking_reference),
    linkedRollerUniqueId: stringOrNull(row.linked_roller_unique_id),
    originalBookingReference: stringOrNull(row.original_booking_reference),
    originalRollerUniqueId: stringOrNull(row.original_roller_unique_id),
    source,
    status: stringOrNull(row.status),
  }));
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

async function recordBookingLinkPublishedEvent(booking, link, source) {
  const linkId = stringOrNull(link.linkId);
  if (!linkId) return;

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
      'booking_link.published',
      :subjectRef,
      :summary,
      CAST(:eventPayload AS jsonb)
    )
    ON CONFLICT (event_id) DO NOTHING`,
    [
      stringParameter('eventId', `booking-link-published:${linkId}`),
      stringParameter('correlationId', createCorrelationId()),
      stringParameter('subjectRef', link.originalBookingReference || booking.bookingReference || booking.rollerUniqueId),
      stringParameter('summary', 'Marked linked add-on booking link as published after paid Roller booking confirmation.'),
      stringParameter(
        'eventPayload',
        JSON.stringify({
          addOnGroupId: link.addOnGroupId,
          linkId,
          linkedBookingReference: link.linkedBookingReference,
          linkedRollerUniqueId: link.linkedRollerUniqueId,
          originalBookingReference: link.originalBookingReference,
          originalRollerUniqueId: link.originalRollerUniqueId,
          rollerBookingReference: booking.bookingReference,
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

function evaluateEligibility(booking, request) {
  const allItems = booking.items ?? [];
  const dates = [...new Set(allItems.map((item) => item.bookingDate).filter(Boolean))];
  const hasExpectedDateMismatch = Boolean(request.expectedDate) && !dates.includes(request.expectedDate);
  const amountOwing = Number(booking.amountOwing ?? 0);
  const status = String(booking.status ?? '').toLowerCase();
  const redeemableTicketCount = allItems.reduce((total, item) => total + (item.tickets?.length ?? 0), 0);

  if (hasExpectedDateMismatch) {
    return {
      canCheckIn: false,
      reason: 'wrong_date',
      requiresStaff: true,
      redeemableTicketCount,
      expectedDate: request.expectedDate,
      bookingDates: dates,
    };
  }

  if (amountOwing > 0 || status.includes('pending')) {
    return {
      canCheckIn: false,
      reason: 'payment_required',
      requiresStaff: true,
      redeemableTicketCount,
      amountOwing,
    };
  }

  if (redeemableTicketCount === 0) {
    return {
      canCheckIn: false,
      reason: 'no_redeemable_tickets',
      requiresStaff: true,
      redeemableTicketCount,
    };
  }

  return {
    canCheckIn: true,
    reason: 'ready',
    requiresStaff: false,
    redeemableTicketCount,
  };
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
      Handler: sanitizeMetricValue(process.env.JUMPYARD_HANDLER || 'lookup'),
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

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
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

function centsToCurrency(cents) {
  if (cents === null || cents === undefined) return null;
  return Math.round(Number(cents)) / 100;
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

function hashJson(value) {
  return hashString(JSON.stringify(value));
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

function classifyError(error) {
  if (error.code === 'invalid_json') {
    return {
      statusCode: 400,
      status: 'invalid_request',
      code: 'invalid_json',
      message: error.message,
    };
  }

  if (error.code === 'lookup_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'lookup_config_error',
      message: 'JumpYard Cloud lookup configuration is incomplete or unsafe.',
    };
  }

  if (error.code === 'database_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'database_config_error',
      message: 'JumpYard Cloud lookup database configuration is incomplete.',
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
    code: 'lookup_failed',
    message: 'JumpYard Cloud lookup failed.',
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
