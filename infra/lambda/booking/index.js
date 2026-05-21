const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const MAX_BOOKING_ITEMS = 10;
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedToken = null;
let cachedVenuePaymentConfig = null;

exports.handler = async (event) => {
  let correlationId = getHeader(event, 'x-correlation-id') || createCorrelationId();

  try {
    const routeKey = event?.routeKey || `${event?.requestContext?.http?.method ?? ''} ${event?.rawPath ?? ''}`.trim();

    if (isAddProductRoute(routeKey, event)) {
      return jsonResponse(501, correlationId, {
        status: 'not_implemented',
        error: {
          code: 'add_product_booking_deferred',
          message: 'Add-product booking endpoints are deferred; T0031 implements new-booking quote and draft only.',
        },
      });
    }

    const body = parseBody(event);
    correlationId = stringOrNull(body.correlationId) || correlationId;

    if (isQuoteRoute(routeKey, event)) {
      return handleQuote(event, body, correlationId);
    }

    if (isDraftRoute(routeKey, event)) {
      return handleDraft(event, body, correlationId);
    }

    return jsonResponse(404, correlationId, {
      status: 'not_found',
      error: {
        code: 'route_not_found',
        message: 'No JumpYard Cloud booking route matched the request.',
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

async function handleQuote(event, body, correlationId) {
  const request = normalizeQuoteRequest(body);
  const validationError = validateQuoteRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const config = await getRollerConfig();
  const token = await getRollerAccessToken(config);
  const payload = buildRollerBookingPayload(request, {
    customer: request.customer || buildQuoteCustomer(),
    externalIdPrefix: 'JY-Q',
  });
  const rollerResult = await postRollerJson(config, token, '/bookings/draft/costs', payload);

  if (!rollerResult.ok) {
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.quote_failed',
      payload: {
        endpoint: 'POST /bookings/draft/costs',
        itemCount: request.items.length,
        rollerStatus: rollerResult.status,
      },
      subjectRef: payload.externalId,
      summary: `Roller quote failed with HTTP ${rollerResult.status}.`,
    });

    return jsonResponse(rollerResult.status === 409 ? 409 : 502, correlationId, {
      status: rollerResult.status === 409 ? 'rejected' : 'roller_error',
      error: {
        code: 'roller_quote_failed',
        message: `Roller quote failed with HTTP ${rollerResult.status}.`,
      },
      roller: {
        statusCode: rollerResult.status,
        error: summarizeRollerError(rollerResult.body),
      },
    });
  }

  const costs = normalizeCosts(rollerResult.body);
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.quote_succeeded',
    payload: {
      endpoint: 'POST /bookings/draft/costs',
      itemCount: request.items.length,
      rollerEnvironment: config.env,
      total: costs.total,
      amountOwing: costs.amountOwing,
    },
    subjectRef: payload.externalId,
    summary: 'Roller Playground booking quote succeeded.',
  });

  return jsonResponse(200, correlationId, {
    status: 'quoted',
    quote: {
      externalId: payload.externalId,
      costs,
      itemCount: request.items.length,
      expiresAt: null,
    },
    source: {
      system: 'roller',
      environment: config.env,
      endpoint: 'POST /bookings/draft/costs',
      wroteBooking: false,
    },
  });
}

async function handleDraft(event, body, correlationId) {
  const request = normalizeDraftRequest(event, body);
  const validationError = validateDraftRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const requestHash = hashJson({
    customer: maskCustomerForHash(request.customer),
    items: request.items,
    operation: 'booking_draft_create',
    sendConfirmations: request.sendConfirmations,
    customerPaysFees: request.customerPaysFees,
  });
  const idempotency = await reserveIdempotencyKey('booking_draft_create', request.idempotencyKey, requestHash);
  if (!idempotency.ok) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: idempotency.code,
        message: idempotency.message,
      },
      idempotency: {
        status: idempotency.status,
        resultRef: idempotency.resultRef,
      },
    });
  }

  const config = await getRollerConfig();
  const token = await getRollerAccessToken(config);
  const payload = buildRollerBookingPayload(request, {
    customer: request.customer,
    externalIdPrefix: 'JY-D',
  });
  const rollerResult = await postRollerJson(config, token, '/bookings/draft', payload);

  if (!rollerResult.ok) {
    await completeIdempotencyKey(request.idempotencyKey, 'failed', `roller_http_${rollerResult.status}`);
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.draft_failed',
      payload: {
        endpoint: 'POST /bookings/draft',
        itemCount: request.items.length,
        rollerStatus: rollerResult.status,
      },
      subjectRef: payload.externalId,
      summary: `Roller draft creation failed with HTTP ${rollerResult.status}.`,
    });

    return jsonResponse(rollerResult.status === 409 ? 409 : 502, correlationId, {
      status: rollerResult.status === 409 ? 'rejected' : 'roller_error',
      error: {
        code: 'roller_draft_failed',
        message: `Roller draft creation failed with HTTP ${rollerResult.status}.`,
      },
      roller: {
        statusCode: rollerResult.status,
        error: summarizeRollerError(rollerResult.body),
      },
    });
  }

  const draft = normalizeDraftResponse(rollerResult.body, request.items.length);
  const paymentConfig = await getVenuePaymentConfig(config, token);
  const jwtSummary = summarizeJwt(rollerResult.body?.paymentJwt);
  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `roller_draft:${draft.uniqueId ?? payload.externalId}`);
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.draft_succeeded',
    payload: {
      endpoint: 'POST /bookings/draft',
      itemCount: request.items.length,
      paymentJwtPresent: jwtSummary.present,
      rollerEnvironment: config.env,
      rollerDraftUniqueId: draft.uniqueId,
      total: draft.costs.total,
      amountOwing: draft.costs.amountOwing,
    },
    subjectRef: draft.uniqueId || payload.externalId,
    summary: 'Roller Playground draft booking created.',
  });

  return jsonResponse(201, correlationId, {
    status: 'draft_created',
    draft,
    paymentSession: {
      jwt: rollerResult.body?.paymentJwt ?? null,
      jwtPresent: jwtSummary.present,
      jwtSummary,
      config: paymentConfig,
    },
    source: {
      system: 'roller',
      environment: config.env,
      endpoint: 'POST /bookings/draft',
      wroteBooking: true,
    },
  });
}

function normalizeQuoteRequest(body) {
  return {
    capacityReservationId: stringOrNull(body.capacityReservationId),
    comments: stringOrNull(body.comments),
    companyId: numberOrNull(body.companyId),
    correlationId: stringOrNull(body.correlationId),
    customer: body.customer ? normalizeCustomer(body.customer, false) : null,
    customerPaysFees: body.customerPaysFees === true,
    discounts: normalizeDiscounts(body.discounts, body.discountCodes),
    externalId: stringOrNull(body.externalId),
    giftCards: normalizeGiftCards(body.giftCards),
    items: normalizeItems(body.items),
    name: stringOrNull(body.name),
    sendConfirmations: false,
    venueId: stringOrNull(body.venueId),
  };
}

function normalizeDraftRequest(event, body) {
  return {
    capacityReservationId: stringOrNull(body.capacityReservationId),
    comments: stringOrNull(body.comments),
    companyId: numberOrNull(body.companyId),
    confirmDraft: body.confirmDraft === true,
    correlationId: stringOrNull(body.correlationId),
    customer: normalizeCustomer(body.customer, true),
    customerPaysFees: body.customerPaysFees === true,
    discounts: normalizeDiscounts(body.discounts, body.discountCodes),
    externalId: stringOrNull(body.externalId),
    giftCards: normalizeGiftCards(body.giftCards),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    items: normalizeItems(body.items),
    name: stringOrNull(body.name),
    sendConfirmations: body.sendConfirmations === true,
    venueId: stringOrNull(body.venueId),
  };
}

function normalizeCustomer(value, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return required ? {} : null;
  }

  return {
    acceptMarketing: value.acceptMarketing === true,
    acceptMarketingSms: value.acceptMarketingSms === true,
    email: stringOrNull(value.email),
    firstName: stringOrNull(value.firstName),
    lastName: stringOrNull(value.lastName),
    phone: stringOrNull(value.phone),
  };
}

function normalizeItems(value) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => ({
    bookingDate: stringOrNull(item?.bookingDate),
    partyPackageInclusions: normalizePartyPackageInclusions(item?.partyPackageInclusions),
    priceOverride: numberOrNull(item?.priceOverride),
    productId: numberOrNull(item?.productId),
    quantity: numberOrNull(item?.quantity),
    startTime: stringOrNull(item?.startTime),
    tickets: normalizeTickets(item?.tickets),
  }));
}

function normalizeTickets(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((ticket) => ({
      id: stringOrNull(ticket?.id),
      name: stringOrNull(ticket?.name),
    }))
    .filter((ticket) => ticket.id || ticket.name);
}

function normalizePartyPackageInclusions(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((inclusion) => ({
      productId: numberOrNull(inclusion?.productId),
      quantity: numberOrNull(inclusion?.quantity),
    }))
    .filter((inclusion) => inclusion.productId && inclusion.quantity);
}

function normalizeDiscounts(discounts, discountCodes) {
  if (Array.isArray(discounts)) {
    return discounts
      .map((discount) => ({
        amount: numberOrNull(discount?.amount),
        code: stringOrNull(discount?.code),
        percentage: numberOrNull(discount?.percentage),
      }))
      .filter((discount) => discount.code || discount.amount !== null || discount.percentage !== null);
  }

  if (!Array.isArray(discountCodes)) return [];

  return discountCodes.map(stringOrNull).filter(Boolean).map((code) => ({ code }));
}

function normalizeGiftCards(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((giftCard) => ({
      giftCardNumber: stringOrNull(giftCard?.giftCardNumber),
    }))
    .filter((giftCard) => giftCard.giftCardNumber);
}

function validateQuoteRequest(request) {
  return validateItems(request.items);
}

function validateDraftRequest(request) {
  if (!request.idempotencyKey) {
    return {
      code: 'idempotency_key_required',
      message: 'idempotencyKey or x-idempotency-key is required.',
    };
  }

  if (!request.confirmDraft) {
    return {
      code: 'confirm_draft_required',
      message: 'confirmDraft=true is required before creating a Roller Playground draft booking.',
    };
  }

  const customerError = validateCustomer(request.customer);
  if (customerError) return customerError;

  return validateItems(request.items);
}

function validateCustomer(customer) {
  const requiredFields = ['firstName', 'lastName', 'email', 'phone'];
  const missing = requiredFields.filter((field) => !customer?.[field]);
  if (missing.length > 0) {
    return {
      code: 'customer_required',
      message: `customer.${missing[0]} is required for Roller draft booking creation.`,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return {
      code: 'customer_email_invalid',
      message: 'customer.email must be a valid email address.',
    };
  }

  return null;
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      code: 'items_required',
      message: 'At least one booking item is required.',
    };
  }

  if (items.length > MAX_BOOKING_ITEMS) {
    return {
      code: 'too_many_items',
      message: `At most ${MAX_BOOKING_ITEMS} booking items are accepted per request.`,
    };
  }

  for (const item of items) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      return {
        code: 'product_id_invalid',
        message: 'Each item.productId must be a positive Roller product variation id.',
      };
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return {
        code: 'quantity_invalid',
        message: 'Each item.quantity must be a positive integer.',
      };
    }

    if (!isIsoDate(item.bookingDate)) {
      return {
        code: 'booking_date_invalid',
        message: 'Each item.bookingDate must use yyyy-mm-dd format.',
      };
    }

    if (!isTime(item.startTime)) {
      return {
        code: 'start_time_invalid',
        message: 'Each item.startTime must use HH:mm format.',
      };
    }
  }

  return null;
}

function buildRollerBookingPayload(request, { customer, externalIdPrefix }) {
  const externalId = (request.externalId || createExternalId(externalIdPrefix)).slice(0, 64);
  const payload = {
    externalId,
    name: request.name || 'JumpYard booking',
    customer,
    items: request.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      bookingDate: item.bookingDate,
      startTime: item.startTime,
      ...(item.priceOverride !== null ? { priceOverride: item.priceOverride } : {}),
      ...(item.tickets.length > 0 ? { tickets: item.tickets } : {}),
      ...(item.partyPackageInclusions.length > 0 ? { partyPackageInclusions: item.partyPackageInclusions } : {}),
    })),
    sendConfirmations: request.sendConfirmations === true,
    customerPaysFees: request.customerPaysFees === true,
  };

  if (request.comments) payload.comments = request.comments;
  if (request.capacityReservationId) payload.capacityReservationId = request.capacityReservationId;
  if (request.companyId !== null) payload.companyId = request.companyId;
  if (request.discounts.length > 0) payload.discounts = request.discounts;
  if (request.giftCards.length > 0) payload.giftCards = request.giftCards;

  return payload;
}

function buildQuoteCustomer() {
  return {
    firstName: 'JumpYard',
    lastName: 'Quote',
    email: 'jumpyard.quote@example.invalid',
    phone: '+46700000000',
    acceptMarketing: false,
    acceptMarketingSms: false,
  };
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
    error.code = 'booking_config_error';
    throw error;
  }

  const response = await ssmClient.send(new GetParameterCommand({ Name: name }));
  return String(response.Parameter?.Value ?? '').trim();
}

async function readSecret(secretId) {
  if (!secretId) {
    const error = new Error('Missing Roller credentials secret environment variable.');
    error.code = 'booking_config_error';
    throw error;
  }

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  const secretString = response.SecretString;
  if (!secretString) {
    const error = new Error('Roller credentials secret has no string value.');
    error.code = 'booking_config_error';
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
    error.code = 'booking_config_error';
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

async function postRollerJson(config, token, endpointPath, payload) {
  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
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

async function getVenuePaymentConfig(config, token) {
  if (cachedVenuePaymentConfig) return cachedVenuePaymentConfig;

  const response = await fetch(buildRollerUrl(config.baseUrl, '/venues/me'), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });
  const text = await response.text();
  const body = parseJsonOrNull(text);

  if (!response.ok) {
    cachedVenuePaymentConfig = {
      available: false,
      apiUrl: null,
      configurationId: null,
      integrationId: null,
      lookupStatusCode: response.status,
    };
    return cachedVenuePaymentConfig;
  }

  const settings = body?.paymentSettings ?? {};
  cachedVenuePaymentConfig = {
    available: Boolean(settings.integrationId && settings.configurationId && settings.apiUrl),
    apiUrl: stringOrNull(settings.apiUrl),
    configurationId: stringOrNull(settings.configurationId),
    integrationId: stringOrNull(settings.integrationId),
    lookupStatusCode: response.status,
  };

  return cachedVenuePaymentConfig;
}

function normalizeDraftResponse(body, itemCount) {
  return {
    uniqueId: stringOrNull(body?.uniqueId),
    capacityReservationId: stringOrNull(body?.capacityReservationId),
    bookingReference: stringOrNull(body?.bookingReference),
    costs: normalizeCosts(body),
    itemCount,
  };
}

function normalizeCosts(body) {
  const costs =
    body?.costs && typeof body.costs === 'object'
      ? body.costs
      : body?.bookingCosts && typeof body.bookingCosts === 'object'
        ? body.bookingCosts
        : body ?? {};

  return {
    total: numberOrNull(costs.total),
    totalIgnoringDeposit: numberOrNull(costs.totalIgnoringDeposit),
    totalExcludingFees: numberOrNull(costs.totalExcludingFees),
    amountOwing: numberOrNull(costs.amountOwing),
    tax: numberOrNull(costs.tax),
    taxExclusive: numberOrNull(costs.taxExclusive),
    transactionFee: numberOrNull(costs.transactionFee),
    cardFee: numberOrNull(costs.cardFee),
    fees: numberOrNull(costs.fees),
    feeTax: numberOrNull(costs.feeTax),
    subTotal: numberOrNull(costs.subTotal),
    subTotalTax: numberOrNull(costs.subTotalTax),
    discount: numberOrNull(costs.discount),
  };
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
    `SELECT operation, request_hash, status, result_ref
     FROM jumpyard.idempotency_records
     WHERE idempotency_key = :idempotencyKey
     LIMIT 1`,
    [stringParameter('idempotencyKey', idempotencyKey)],
  );
  const existing = firstMappedRow(existingResult);
  const sameRequest = existing?.operation === operation && existing?.request_hash === requestHash;

  if (sameRequest) {
    return {
      ok: false,
      code: 'idempotency_key_reused',
      message: 'The supplied idempotency key has already been used for this draft request.',
      resultRef: stringOrNull(existing?.result_ref),
      status: stringOrNull(existing?.status),
    };
  }

  return {
    ok: false,
    code: 'idempotency_key_conflict',
    message: 'The supplied idempotency key has already been used for a different draft request.',
    resultRef: stringOrNull(existing?.result_ref),
    status: stringOrNull(existing?.status),
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

async function writeBookingEventLog({ correlationId, eventType, payload, subjectRef, summary }) {
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

function parseJsonOrNull(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarizeRollerError(body) {
  if (!body || typeof body !== 'object') {
    return {
      code: null,
      message: null,
    };
  }

  const errors = Array.isArray(body.errors)
    ? body.errors.map((error) => ({
        code: stringOrNull(error.code),
        message: stringOrNull(error.message),
        name: stringOrNull(error.name),
      }))
    : [];

  return {
    code: stringOrNull(body.code ?? body.errorCode),
    message: stringOrNull(body.message ?? body.error ?? body.title),
    errors,
  };
}

function summarizeJwt(jwt) {
  if (!jwt || typeof jwt !== 'string') {
    return {
      present: false,
    };
  }

  const parts = jwt.split('.');
  const header = parts.length >= 1 ? parseJwtPart(parts[0]) : null;
  const payload = parts.length >= 2 ? parseJwtPart(parts[1]) : null;
  const expiresAt = payload?.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null;

  return {
    present: true,
    partCount: parts.length,
    headerKeys: header ? Object.keys(header).slice(0, 10) : [],
    payloadKeys: payload ? Object.keys(payload).slice(0, 20) : [],
    expiresAt,
  };
}

function parseJwtPart(part) {
  try {
    const normalized = String(part).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function buildRollerUrl(baseUrl, endpointPath) {
  const parsedBaseUrl = new URL(baseUrl);
  const basePath = parsedBaseUrl.pathname.replace(/\/$/, '');
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

function isQuoteRoute(routeKey, event) {
  return routeKey === 'POST /v1/bookings/quote' || event?.rawPath === '/v1/bookings/quote';
}

function isDraftRoute(routeKey, event) {
  return routeKey === 'POST /v1/bookings/draft' || event?.rawPath === '/v1/bookings/draft';
}

function isAddProductRoute(routeKey, event) {
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'POST /v1/bookings/{bookingReference}/add-products/quote' ||
    routeKey === 'POST /v1/bookings/{bookingReference}/add-products' ||
    /^\/v1\/bookings\/[^/]+\/add-products(\/quote)?$/.test(rawPath)
  );
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

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function createExternalId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${prefix}-${timestamp}-${crypto.randomUUID().slice(0, 8)}`;
}

function hashJson(value) {
  return hashString(JSON.stringify(value));
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function maskCustomerForHash(customer) {
  return {
    emailHash: hashString(customer.email.toLowerCase()),
    firstName: customer.firstName,
    lastName: customer.lastName,
    phoneHash: hashString(customer.phone),
  };
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''));
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

  if (error.code === 'booking_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'booking_config_error',
      message: 'JumpYard Cloud booking configuration is incomplete or unsafe.',
    };
  }

  if (error.code === 'database_config_error') {
    return {
      statusCode: 500,
      status: 'config_error',
      code: 'database_config_error',
      message: 'JumpYard Cloud booking database configuration is incomplete.',
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
    code: 'booking_failed',
    message: 'JumpYard Cloud booking operation failed.',
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
