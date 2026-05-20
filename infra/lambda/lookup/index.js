const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const crypto = require('crypto');

const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const PRODUCT_CACHE_TTL_MS = 15 * 60 * 1000;

const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedToken = null;
let cachedProducts = null;

exports.handler = async (event) => {
  const request = parseRequest(event);
  const correlationId = request.correlationId || createCorrelationId();

  try {
    if (!request.identifier) {
      return jsonResponse(400, correlationId, {
        status: 'invalid_request',
        error: {
          code: 'identifier_required',
          message: 'identifier is required.',
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
          message: 'No Roller Playground booking was found for the supplied identifier.',
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
    const eligibility = evaluateEligibility(booking, request);

    return jsonResponse(200, correlationId, {
      status: 'found',
      booking,
      eligibility,
      source: {
        system: 'roller',
        environment: config.env,
        lookupPath: 'GET /bookings/{identifier}',
        productCatalog: products.status,
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
    total: numberOrNull(booking.total ?? booking.costs?.total),
    amountOwing: numberOrNull(booking.amountOwing ?? booking.remainder ?? booking.costs?.amountOwing),
    createdDate: stringOrNull(booking.createdDate),
    customerId: stringOrNull(booking.customerId),
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
      name: stringOrNull(ticket.name),
      ticketHolderName: stringOrNull(ticket.ticketHolderName),
      locations: Array.isArray(ticket.locations) ? ticket.locations : [],
    })),
  };
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

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
