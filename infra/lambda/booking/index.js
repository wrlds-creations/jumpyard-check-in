const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const MAX_BOOKING_ITEMS = 10;
const MAX_AVAILABILITY_SLOTS = 6;
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const VENUE_TIME_ZONE = 'Europe/Stockholm';

const PHONE_BOOKING_PRODUCTS = [
  { key: 'E60', parentName: 'Entré 60 min', label: '60 min entré', type: 'entry', durationMinutes: 60, jumpersPerUnit: 1 },
  { key: 'E90', parentName: 'Entré 90 min', label: '90 min entré', type: 'entry', durationMinutes: 90, jumpersPerUnit: 1 },
  { key: 'E120', parentName: 'Entré 120 min', label: '120 min entré', type: 'entry', durationMinutes: 120, jumpersPerUnit: 1 },
  { key: 'F60', parentName: 'Entré 60 min - Familj', label: '60 min familj', type: 'family', durationMinutes: 60, jumpersPerUnit: 4 },
  { key: 'F90', parentName: 'Entré 90 min - Familj', label: '90 min familj', type: 'family', durationMinutes: 90, jumpersPerUnit: 4 },
  { key: 'F120', parentName: 'Entré 120 min - Familj', label: '120 min familj', type: 'family', durationMinutes: 120, jumpersPerUnit: 4 },
];

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

    const body = parseBody(event);
    correlationId = stringOrNull(body.correlationId) || correlationId;

    if (isAddProductQuoteRoute(routeKey, event)) {
      return handleAddProductQuote(event, body, correlationId);
    }

    if (isAddProductDraftRoute(routeKey, event)) {
      return handleAddProductDraft(event, body, correlationId);
    }

    if (isAvailabilityRoute(routeKey, event)) {
      return handleAvailability(body, correlationId);
    }

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

async function handleAvailability(body, correlationId) {
  const request = normalizeAvailabilityRequest(body);
  const validationError = validateAvailabilityRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const config = await getRollerConfig();
  const token = await getRollerAccessToken(config);
  const parentProducts = await loadPhoneBookingParentProducts(config.env);
  const missingParents = PHONE_BOOKING_PRODUCTS.filter((product) => !parentProducts.some((parent) => parent.key === product.key));

  if (missingParents.length > 0) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'phone_products_missing',
        message: `Product cache is missing ${missingParents[0].parentName}. Refresh the Roller product cache before booking creation.`,
      },
    });
  }

  const parentProductIds = parentProducts.map((product) => product.parentProductId);
  const rollerResult = await getRollerJson(
    config,
    token,
    `/product-availability?${new URLSearchParams({
      Date: request.date,
      ProductIds: parentProductIds.join(','),
    }).toString()}`,
  );

  if (!rollerResult.ok) {
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.availability_failed',
      payload: {
        endpoint: 'GET /product-availability',
        rollerStatus: rollerResult.status,
      },
      subjectRef: request.date,
      summary: `Roller availability failed with HTTP ${rollerResult.status}.`,
    });

    return jsonResponse(rollerResult.status === 409 ? 409 : 502, correlationId, {
      status: rollerResult.status === 409 ? 'rejected' : 'roller_error',
      error: {
        code: 'roller_availability_failed',
        message: `Roller availability failed with HTTP ${rollerResult.status}.`,
      },
      roller: {
        statusCode: rollerResult.status,
        error: summarizeRollerError(rollerResult.body),
      },
    });
  }

  const availability = buildPhoneAvailability(request, parentProducts, rollerResult.body);
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.availability_succeeded',
    payload: {
      endpoint: 'GET /product-availability',
      date: request.date,
      requestedSlots: request.startTimes.length,
      rollerEnvironment: config.env,
      availableProductCount: availability.products.filter((product) => product.available).length,
    },
    subjectRef: request.date,
    summary: 'Roller Playground product availability read succeeded.',
  });

  return jsonResponse(200, correlationId, {
    status: 'available',
    availability,
    source: {
      system: 'roller',
      environment: config.env,
      endpoint: 'GET /product-availability',
      wroteBooking: false,
    },
  });
}

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
  const availabilityError = request.requireAvailability ? await validateItemsAvailable(config, token, request.items) : null;
  if (availabilityError) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: availabilityError,
    });
  }

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
  const availabilityError = request.requireAvailability ? await validateItemsAvailable(config, token, request.items) : null;
  if (availabilityError) {
    await completeIdempotencyKey(request.idempotencyKey, 'failed', availabilityError.code);
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: availabilityError,
    });
  }

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
  const prepaymentDraft = await persistPrepaymentDraft({
    config,
    draft,
    externalId: payload.externalId,
    idempotencyKey: request.idempotencyKey,
    jwtSummary,
    paymentConfig,
    request,
  });
  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `roller_draft:${draft.uniqueId ?? payload.externalId}`);
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.draft_succeeded',
    payload: {
      endpoint: 'POST /bookings/draft',
      itemCount: request.items.length,
      paymentJwtPresent: jwtSummary.present,
      prepaymentDraftId: prepaymentDraft.prepaymentDraftId,
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
    prepayment: prepaymentDraft,
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

async function handleAddProductQuote(event, body, correlationId) {
  const bookingReference = getBookingReferenceFromPath(event);
  if (!bookingReference) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: {
        code: 'booking_reference_required',
        message: 'bookingReference is required in the add-products path.',
      },
    });
  }

  const request = normalizeAddProductQuoteRequest(body, bookingReference);
  const validationError = validateQuoteRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const config = await getRollerConfig();
  const token = await getRollerAccessToken(config);
  const original = await resolveOriginalBookingContext(config, token, bookingReference);
  if (!original.ok) {
    return jsonResponse(original.statusCode, correlationId, {
      status: original.status,
      error: original.error,
    });
  }

  const customerResult = resolveAddProductCustomer(request, original);
  if (!customerResult.ok) {
    return jsonResponse(customerResult.statusCode, correlationId, {
      status: customerResult.status,
      error: customerResult.error,
    });
  }
  request.customer = customerResult.customer;

  const availabilityError = request.requireAvailability ? await validateItemsAvailable(config, token, request.items) : null;
  if (availabilityError) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: availabilityError,
    });
  }

  const payload = buildRollerBookingPayload(request, {
    customer: request.customer,
    externalIdPrefix: 'JY-AQ',
  });
  const rollerResult = await postRollerJson(config, token, '/bookings/draft/costs', payload);

  if (!rollerResult.ok) {
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.add_product_quote_failed',
      payload: {
        endpoint: 'POST /bookings/draft/costs',
        itemCount: request.items.length,
        originalBookingReference: original.bookingReference,
        rollerStatus: rollerResult.status,
      },
      subjectRef: original.bookingReference,
      summary: `Roller add-product quote failed with HTTP ${rollerResult.status}.`,
    });

    return jsonResponse(rollerResult.status === 409 ? 409 : 502, correlationId, {
      status: rollerResult.status === 409 ? 'rejected' : 'roller_error',
      error: {
        code: 'roller_add_product_quote_failed',
        message: `Roller add-product quote failed with HTTP ${rollerResult.status}.`,
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
    eventType: 'booking.add_product_quote_succeeded',
    payload: {
      endpoint: 'POST /bookings/draft/costs',
      itemCount: request.items.length,
      originalBookingReference: original.bookingReference,
      originalRollerUniqueId: original.rollerUniqueId,
      rollerEnvironment: config.env,
      total: costs.total,
      amountOwing: costs.amountOwing,
    },
    subjectRef: original.bookingReference,
    summary: 'Roller Playground add-product quote succeeded.',
  });

  return jsonResponse(200, correlationId, {
    status: 'quoted',
    quote: {
      externalId: payload.externalId,
      costs,
      itemCount: request.items.length,
      expiresAt: null,
    },
    addOn: {
      originalBookingReference: original.bookingReference,
      originalRollerUniqueId: original.rollerUniqueId,
      mode: 'separate_draft_booking',
    },
    source: {
      system: 'roller',
      environment: config.env,
      endpoint: 'POST /bookings/draft/costs',
      wroteBooking: false,
    },
  });
}

async function handleAddProductDraft(event, body, correlationId) {
  const bookingReference = getBookingReferenceFromPath(event);
  if (!bookingReference) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: {
        code: 'booking_reference_required',
        message: 'bookingReference is required in the add-products path.',
      },
    });
  }

  const request = normalizeAddProductDraftRequest(event, body, bookingReference);
  const validationError = validateAddProductDraftRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      error: validationError,
    });
  }

  const config = await getRollerConfig();
  const token = await getRollerAccessToken(config);
  const original = await resolveOriginalBookingContext(config, token, bookingReference);
  if (!original.ok) {
    return jsonResponse(original.statusCode, correlationId, {
      status: original.status,
      error: original.error,
    });
  }

  const customerResult = resolveAddProductCustomer(request, original);
  if (!customerResult.ok) {
    return jsonResponse(customerResult.statusCode, correlationId, {
      status: customerResult.status,
      error: customerResult.error,
    });
  }
  request.customer = customerResult.customer;

  const requestHash = hashJson({
    customer: maskCustomerForHash(request.customer),
    items: request.items,
    operation: 'booking_add_product_draft_create',
    originalBookingReference: original.bookingReference,
    originalRollerUniqueId: original.rollerUniqueId,
    sendConfirmations: request.sendConfirmations,
    customerPaysFees: request.customerPaysFees,
  });
  const idempotency = await reserveIdempotencyKey('booking_add_product_draft_create', request.idempotencyKey, requestHash);
  if (!idempotency.ok) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: idempotency.code,
        message: idempotency.message,
      },
      idempotency: {
        status: idempotency.status,
        resultRef: stringOrNull(idempotency.resultRef),
      },
    });
  }

  const availabilityError = request.requireAvailability ? await validateItemsAvailable(config, token, request.items) : null;
  if (availabilityError) {
    await completeIdempotencyKey(request.idempotencyKey, 'failed', availabilityError.code);
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: availabilityError,
    });
  }

  const addOnGroupId = `jyao_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
  request.addOnGroupId = addOnGroupId;
  request.originalBookingReference = original.bookingReference;
  request.originalRollerUniqueId = original.rollerUniqueId;

  const payload = buildRollerBookingPayload(request, {
    customer: request.customer,
    externalIdPrefix: 'JY-AD',
  });
  const rollerResult = await postRollerJson(config, token, '/bookings/draft', payload);

  if (!rollerResult.ok) {
    await completeIdempotencyKey(request.idempotencyKey, 'failed', `roller_http_${rollerResult.status}`);
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.add_product_draft_failed',
      payload: {
        endpoint: 'POST /bookings/draft',
        itemCount: request.items.length,
        originalBookingReference: original.bookingReference,
        rollerStatus: rollerResult.status,
      },
      subjectRef: original.bookingReference,
      summary: `Roller add-product draft creation failed with HTTP ${rollerResult.status}.`,
    });

    return jsonResponse(rollerResult.status === 409 ? 409 : 502, correlationId, {
      status: rollerResult.status === 409 ? 'rejected' : 'roller_error',
      error: {
        code: 'roller_add_product_draft_failed',
        message: `Roller add-product draft creation failed with HTTP ${rollerResult.status}.`,
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
  const prepaymentDraft = await persistPrepaymentDraft({
    config,
    draft,
    externalId: payload.externalId,
    idempotencyKey: request.idempotencyKey,
    jwtSummary,
    paymentConfig,
    request,
  });
  const link = await persistAddOnBookingLink({
    addOnGroupId,
    draft,
    original,
    prepaymentDraft,
  });

  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `add_on_draft:${draft.uniqueId ?? payload.externalId}`);
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.add_product_draft_succeeded',
    payload: {
      addOnGroupId,
      endpoint: 'POST /bookings/draft',
      itemCount: request.items.length,
      paymentJwtPresent: jwtSummary.present,
      prepaymentDraftId: prepaymentDraft.prepaymentDraftId,
      originalBookingReference: original.bookingReference,
      originalRollerUniqueId: original.rollerUniqueId,
      rollerDraftUniqueId: draft.uniqueId,
      rollerEnvironment: config.env,
      total: draft.costs.total,
      amountOwing: draft.costs.amountOwing,
    },
    subjectRef: original.bookingReference,
    summary: 'Roller Playground add-product draft booking created and linked.',
  });

  return jsonResponse(201, correlationId, {
    status: 'add_product_draft_created',
    draft,
    addOn: {
      addOnGroupId,
      originalBookingReference: original.bookingReference,
      originalRollerUniqueId: original.rollerUniqueId,
      link,
      mode: 'separate_draft_booking',
    },
    prepayment: prepaymentDraft,
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
    requireAvailability: body.requireAvailability === true,
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
    requireAvailability: body.requireAvailability === true,
    sendConfirmations: body.sendConfirmations === true,
    venueId: stringOrNull(body.venueId),
  };
}

function normalizeAddProductQuoteRequest(body, bookingReference) {
  const request = normalizeQuoteRequest(body);
  request.flowType = 'add_product';
  request.originalBookingReference = bookingReference;
  request.name = request.name || `Add-on for ${bookingReference}`;
  request.comments = request.comments || `JumpYard add-product quote for original booking ${bookingReference}`;
  return request;
}

function normalizeAddProductDraftRequest(event, body, bookingReference) {
  return {
    capacityReservationId: stringOrNull(body.capacityReservationId),
    comments: stringOrNull(body.comments) || `JumpYard add-product draft for original booking ${bookingReference}`,
    companyId: numberOrNull(body.companyId),
    confirmDraft: body.confirmDraft === true,
    correlationId: stringOrNull(body.correlationId),
    customer: body.customer ? normalizeCustomer(body.customer, false) : null,
    customerPaysFees: body.customerPaysFees === true,
    discounts: normalizeDiscounts(body.discounts, body.discountCodes),
    externalId: stringOrNull(body.externalId),
    flowType: 'add_product',
    giftCards: normalizeGiftCards(body.giftCards),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    items: normalizeItems(body.items),
    name: stringOrNull(body.name) || `Add-on for ${bookingReference}`,
    originalBookingReference: bookingReference,
    requireAvailability: body.requireAvailability === true,
    sendConfirmations: body.sendConfirmations === true,
    venueId: stringOrNull(body.venueId),
  };
}

function normalizeAvailabilityRequest(body) {
  const startTimes = Array.isArray(body.startTimes)
    ? body.startTimes.map(stringOrNull).filter(Boolean).slice(0, MAX_AVAILABILITY_SLOTS)
    : getNextHalfHourSlots(3);

  return {
    date: stringOrNull(body.date) || getVenueToday(),
    startTimes,
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

function validateAddProductDraftRequest(request) {
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

  if (hasAnyCustomerField(request.customer)) {
    const customerError = validateCustomer(request.customer);
    if (customerError) return customerError;
  }

  return validateItems(request.items);
}

function validateAvailabilityRequest(request) {
  if (!isIsoDate(request.date)) {
    return {
      code: 'availability_date_invalid',
      message: 'date must use yyyy-mm-dd format.',
    };
  }

  if (!Array.isArray(request.startTimes) || request.startTimes.length === 0) {
    return {
      code: 'availability_start_times_required',
      message: 'At least one start time is required.',
    };
  }

  for (const startTime of request.startTimes) {
    if (!isTime(startTime)) {
      return {
        code: 'availability_start_time_invalid',
        message: 'Each start time must use HH:mm format.',
      };
    }
  }

  return null;
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
  emitRollerApiMetric({
    method: 'POST',
    operation: rollerOperationFromEndpointPath(endpointPath, 'POST'),
    status: response.status,
    ok: response.ok,
  });
  const text = await response.text();
  const body = parseJsonOrNull(text);

  return {
    body,
    ok: response.ok,
    status: response.status,
  };
}

async function getRollerJson(config, token, endpointPath) {
  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });
  emitRollerApiMetric({
    method: 'GET',
    operation: rollerOperationFromEndpointPath(endpointPath, 'GET'),
    status: response.status,
    ok: response.ok,
  });
  const text = await response.text();
  const body = parseJsonOrNull(text);

  return {
    body,
    ok: response.ok,
    status: response.status,
  };
}

async function resolveOriginalBookingContext(config, token, bookingReference) {
  const normalizedReference = stringOrNull(bookingReference);
  const [localBooking, rollerResult] = await Promise.all([
    findLocalOriginalBooking(normalizedReference),
    getRollerJson(config, token, `/bookings/${encodeURIComponent(normalizedReference)}`),
  ]);

  if (rollerResult.status === 404) {
    return {
      ok: false,
      status: 'not_found',
      statusCode: 404,
      error: {
        code: 'original_booking_not_found',
        message: `Original booking ${normalizedReference} was not found in Roller Playground.`,
      },
    };
  }

  if (!rollerResult.ok) {
    return {
      ok: false,
      status: 'roller_error',
      statusCode: rollerResult.status === 409 ? 409 : 502,
      error: {
        code: 'roller_original_booking_lookup_failed',
        message: `Roller original booking lookup failed with HTTP ${rollerResult.status}.`,
      },
      roller: {
        statusCode: rollerResult.status,
        error: summarizeRollerError(rollerResult.body),
      },
    };
  }

  const original = normalizeOriginalBookingContext(rollerResult.body, normalizedReference, localBooking);
  if (!original.bookingReference || !original.rollerUniqueId) {
    return {
      ok: false,
      status: 'roller_error',
      statusCode: 502,
      error: {
        code: 'roller_original_booking_incomplete',
        message: 'Roller original booking lookup did not return both bookingReference and uniqueId.',
      },
    };
  }

  if (!isOriginalBookingEligibleForAddProduct(original)) {
    return {
      ok: false,
      status: 'blocked',
      statusCode: 409,
      error: {
        code: 'original_booking_not_eligible',
        message: `Original booking ${original.bookingReference} cannot receive add-products in its current status.`,
      },
    };
  }

  const localCustomer = await findLocalOriginalBookingCustomer(
    original.rollerUniqueId,
    original.bookingReference,
    original.rollerCustomerId,
  );
  original.customer = mergeOriginalBookingCustomer(original.customer, localCustomer, original.bookingName);

  return {
    ok: true,
    ...original,
  };
}

async function findLocalOriginalBooking(bookingReference) {
  if (!bookingReference) return null;

  const result = await executeStatement(
    `SELECT
       roller_unique_id,
       booking_reference,
       booking_status,
       payment_status,
       booking_date::text AS booking_date,
       start_time::text AS start_time,
       normalized_summary ->> 'bookingCustomerId' AS booking_customer_id,
       freshness_status
     FROM jumpyard.roller_bookings
     WHERE booking_reference = :bookingReference
     LIMIT 1`,
    [stringParameter('bookingReference', bookingReference)],
  );

  return firstMappedRow(result);
}

async function findLocalOriginalBookingCustomer(rollerUniqueId, bookingReference, rollerCustomerId) {
  if (!rollerUniqueId && !bookingReference && !rollerCustomerId) return null;

  const result = await executeStatement(
    `WITH contact_candidate AS (
       SELECT
         0 AS priority,
         CAST(:rollerCustomerId AS text) AS roller_customer_id
       WHERE CAST(:rollerCustomerId AS text) IS NOT NULL
       UNION ALL
       SELECT
         1 AS priority,
         ticket.roller_customer_id
       FROM jumpyard.roller_booking_tickets AS ticket
       WHERE ticket.roller_unique_id = :rollerUniqueId
         AND ticket.roller_customer_id IS NOT NULL
       UNION ALL
       SELECT
         2 AS priority,
         booking.normalized_summary ->> 'bookingCustomerId' AS roller_customer_id
       FROM jumpyard.roller_bookings AS booking
       WHERE (booking.roller_unique_id = :rollerUniqueId OR booking.booking_reference = :bookingReference)
         AND booking.normalized_summary ->> 'bookingCustomerId' IS NOT NULL
     ),
     contact_source AS (
       SELECT
         0 AS priority,
         draft.customer_email AS email,
         draft.customer_phone AS phone,
         draft.updated_at
       FROM jumpyard.prepayment_booking_drafts AS draft
       WHERE draft.roller_draft_unique_id = :rollerUniqueId
         AND (draft.customer_email IS NOT NULL OR draft.customer_phone IS NOT NULL)
       UNION ALL
       SELECT
         contact_candidate.priority + 1 AS priority,
         gp.email,
         gp.contact_number AS phone,
         gp.updated_at
       FROM contact_candidate
       INNER JOIN jumpyard.guest_profiles AS gp
         ON gp.roller_customer_id = contact_candidate.roller_customer_id
       WHERE gp.email IS NOT NULL
          OR gp.contact_number IS NOT NULL
     )
     SELECT
       email,
       phone
     FROM contact_source
     ORDER BY priority ASC, updated_at DESC
     LIMIT 5`,
    [
      stringParameter('rollerUniqueId', rollerUniqueId),
      stringParameter('bookingReference', bookingReference),
      stringParameter('rollerCustomerId', rollerCustomerId),
    ],
  );

  const rows = mappedRows(result);
  if (rows.length === 0) return null;

  return rows.reduce(
    (contact, row) => ({
      email: contact.email || stringOrNull(row.email),
      phone: contact.phone || stringOrNull(row.phone),
    }),
    { email: null, phone: null },
  );
}

function normalizeOriginalBookingContext(body, bookingReference, localBooking) {
  const booking = body?.booking && typeof body.booking === 'object' ? body.booking : body;
  const items = Array.isArray(booking?.items) ? booking.items : [];
  const firstItem = items[0] ?? {};

  return {
    bookingName: stringOrNull(booking?.name ?? booking?.bookingName ?? booking?.title),
    bookingDate: stringOrNull(booking?.bookingDate ?? firstItem.bookingDate ?? localBooking?.booking_date),
    bookingReference:
      stringOrNull(booking?.bookingReference ?? booking?.reference ?? booking?.bookingId) ||
      stringOrNull(localBooking?.booking_reference) ||
      bookingReference,
    bookingStatus: stringOrNull(booking?.status ?? booking?.bookingStatus ?? localBooking?.booking_status),
    customer: normalizeOriginalBookingCustomer(booking),
    localFreshnessStatus: stringOrNull(localBooking?.freshness_status),
    paymentStatus: stringOrNull(booking?.paymentStatus ?? booking?.status ?? booking?.bookingStatus ?? localBooking?.payment_status),
    rollerCustomerId: stringOrNull(booking?.customerId ?? booking?.customer?.id ?? localBooking?.booking_customer_id),
    rollerUniqueId: stringOrNull(booking?.uniqueId ?? booking?.id ?? booking?.bookingUniqueId ?? localBooking?.roller_unique_id),
    startTime: stringOrNull(booking?.startTime ?? firstItem.startTime ?? firstItem.sessionStartTime ?? localBooking?.start_time),
  };
}

function normalizeOriginalBookingCustomer(booking) {
  const candidates = [
    booking?.customer,
    booking?.bookingCustomer,
    booking?.bookingHolder,
    booking?.guest,
    booking?.contact,
    booking?.primaryContact,
    booking?.holder,
    booking?.customerDetails,
    Array.isArray(booking?.contacts) ? booking.contacts[0] : null,
    booking,
  ].filter(isPlainObject);

  const customer = {
    email: null,
    firstName: null,
    lastName: null,
    phone: null,
  };
  let fullName = null;

  for (const candidate of candidates) {
    customer.firstName =
      customer.firstName || firstObjectString(candidate, ['firstName', 'first_name', 'givenName', 'given_name']);
    customer.lastName =
      customer.lastName || firstObjectString(candidate, ['lastName', 'last_name', 'familyName', 'family_name', 'surname']);
    customer.email = customer.email || firstObjectString(candidate, ['email', 'emailAddress', 'email_address']);
    customer.phone =
      customer.phone ||
      firstObjectString(candidate, ['phone', 'phoneNumber', 'phone_number', 'mobile', 'mobilePhone', 'contactNumber']);
    fullName =
      fullName ||
      firstObjectString(candidate, ['fullName', 'full_name', 'customerName', 'bookingHolderName', 'name', 'bookingName']);
  }

  const nameParts = splitCustomerName(fullName);
  return {
    email: customer.email,
    firstName: customer.firstName || nameParts.firstName,
    lastName: customer.lastName || nameParts.lastName,
    phone: customer.phone,
  };
}

function mergeOriginalBookingCustomer(primary, fallback, fallbackName) {
  const nameParts = splitCustomerName(fallbackName);

  return {
    email: stringOrNull(primary?.email) || stringOrNull(fallback?.email),
    firstName: stringOrNull(primary?.firstName) || nameParts.firstName,
    lastName: stringOrNull(primary?.lastName) || nameParts.lastName,
    phone: stringOrNull(primary?.phone) || stringOrNull(fallback?.phone),
  };
}

function resolveAddProductCustomer(request, original) {
  const customer = hasAnyCustomerField(request.customer) ? request.customer : original.customer;
  const customerError = validateCustomer(customer);
  if (customerError) {
    return {
      ok: false,
      status: 'blocked',
      statusCode: 409,
      error: {
        code: 'original_booking_contact_unresolved',
        message:
          'Original booking contact could not be resolved server-side. Refresh Roller customer data or ask staff before creating add-products.',
      },
    };
  }

  return {
    customer,
    ok: true,
  };
}

function isOriginalBookingEligibleForAddProduct(original) {
  const statusValues = [original.bookingStatus, original.paymentStatus]
    .map((value) => stringOrNull(value)?.toLowerCase())
    .filter(Boolean);

  return !statusValues.some((status) => ['cancelled', 'canceled', 'deleted', 'draft'].includes(status));
}

async function loadPhoneBookingParentProducts(rollerEnv) {
  const result = await executeStatement(
    `SELECT DISTINCT
       summary ->> 'parentProductId' AS parent_product_id,
       summary ->> 'parentProductName' AS parent_product_name,
       summary ->> 'id' AS id,
       summary ->> 'name' AS name
     FROM jumpyard.product_catalog_cache
     WHERE roller_env = :rollerEnv
       AND (
         summary ->> 'parentProductName' IN (
           'Entré 60 min',
           'Entré 90 min',
           'Entré 120 min',
           'Entré 60 min - Familj',
           'Entré 90 min - Familj',
           'Entré 120 min - Familj'
         )
         OR summary ->> 'name' IN (
           'Entré 60 min',
           'Entré 90 min',
           'Entré 120 min',
           'Entré 60 min - Familj',
           'Entré 90 min - Familj',
           'Entré 120 min - Familj'
         )
       )`,
    [stringParameter('rollerEnv', rollerEnv)],
  );
  const rows = mappedRows(result);

  return PHONE_BOOKING_PRODUCTS.map((product) => {
    const row = rows.find((candidate) => candidate.parent_product_name === product.parentName || candidate.name === product.parentName);
    const parentProductId = stringOrNull(row?.parent_product_id) || stringOrNull(row?.id);
    if (!parentProductId) return null;

    return {
      ...product,
      parentProductId,
    };
  }).filter(Boolean);
}

async function validateItemsAvailable(config, token, items) {
  const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  const productParents = await loadParentProductsForChildIds(config.env, productIds);
  const parentsByProductId = new Map(productParents.map((product) => [String(product.productId), product]));

  for (const item of items) {
    const productParent = parentsByProductId.get(String(item.productId));
    if (!productParent?.parentProductId) {
      return {
        code: 'availability_product_missing',
        message: `Product ${item.productId} is not present in the local Roller product cache.`,
      };
    }

    const rollerResult = await getRollerJson(
      config,
      token,
      `/product-availability?${new URLSearchParams({
        Date: item.bookingDate,
        ProductIds: productParent.parentProductId,
      }).toString()}`,
    );

    if (!rollerResult.ok) {
      return {
        code: 'roller_availability_failed',
        message: `Roller availability failed with HTTP ${rollerResult.status}.`,
      };
    }

    const parent = Array.isArray(rollerResult.body)
      ? rollerResult.body.find((candidate) => String(candidate.parentProductId ?? candidate.id) === productParent.parentProductId)
      : null;
    const session = findSessionForProduct(parent, String(item.productId), item.startTime);
    const capacity = getSessionCapacityRemaining(session);
    const onlineSalesOpen = session?.onlineSalesOpen !== false;

    if (!session || !onlineSalesOpen || (capacity !== null && capacity < item.quantity)) {
      return {
        code: 'capacity_unavailable',
        message: `Product ${item.productId} is not available for ${item.bookingDate} ${item.startTime}.`,
      };
    }
  }

  return null;
}

async function loadParentProductsForChildIds(rollerEnv, productIds) {
  if (productIds.length === 0) return [];

  const clauses = productIds.map((_, index) => `summary ->> 'id' = :productId${index}`).join(' OR ');
  const result = await executeStatement(
    `SELECT
       summary ->> 'id' AS product_id,
       COALESCE(NULLIF(summary ->> 'parentProductId', ''), summary ->> 'id') AS parent_product_id
     FROM jumpyard.product_catalog_cache
     WHERE roller_env = :rollerEnv
       AND (${clauses})`,
    [
      stringParameter('rollerEnv', rollerEnv),
      ...productIds.map((productId, index) => stringParameter(`productId${index}`, String(productId))),
    ],
  );

  return mappedRows(result).map((row) => ({
    parentProductId: stringOrNull(row.parent_product_id),
    productId: stringOrNull(row.product_id),
  }));
}

function buildPhoneAvailability(request, parentProducts, rollerBody) {
  const rollerProducts = Array.isArray(rollerBody) ? rollerBody : [];
  const products = [];
  const slots = request.startTimes.map((startTime) => ({
    date: request.date,
    startTime,
    products: parentProducts.map((definition) => {
      const parent = rollerProducts.find((candidate) => String(candidate.parentProductId ?? candidate.id) === definition.parentProductId);
      const session = findSessionForParent(parent, startTime);
      const selectedProduct = selectAvailabilityProduct(parent, session);
      const capacityRemaining = getSessionCapacityRemaining(session);
      const onlineSalesOpen = session?.onlineSalesOpen !== false;
      const available = Boolean(session && selectedProduct && onlineSalesOpen && (capacityRemaining === null || capacityRemaining > 0));
      const unitPrice = numberOrNull(selectedProduct?.cost);
      const product = {
        available,
        capacityRemaining,
        durationMinutes: definition.durationMinutes,
        endTime: stringOrNull(session?.endTime),
        jumpersPerUnit: definition.jumpersPerUnit,
        key: definition.key,
        label: definition.label,
        onlineSalesOpen,
        parentProductId: definition.parentProductId,
        productId: stringOrNull(selectedProduct?.id),
        productName: stringOrNull(selectedProduct?.name),
        startTime,
        type: definition.type,
        unitPrice,
        unitPriceCents: unitPrice === null ? null : Math.round(unitPrice * 100),
      };
      products.push(product);
      return product;
    }),
  }));

  return {
    date: request.date,
    products,
    slots,
  };
}

function findSessionForParent(parent, startTime) {
  if (!parent || typeof parent !== 'object') return null;

  const direct = Array.isArray(parent.sessions) ? parent.sessions : [];
  const directMatch = direct.find((session) => stringOrNull(session?.startTime) === startTime);
  if (directMatch) return directMatch;

  const products = Array.isArray(parent.products) ? parent.products : [];
  for (const product of products) {
    const availabilities = Array.isArray(product?.availabilities) ? product.availabilities : [];
    for (const availability of availabilities) {
      const sessions = Array.isArray(availability?.sessions) ? availability.sessions : [];
      const match = sessions.find((session) => stringOrNull(session?.startTime) === startTime);
      if (match) return match;
    }
  }

  return null;
}

function findSessionForProduct(parent, productId, startTime) {
  const session = findSessionForParent(parent, startTime);
  if (!session) return null;

  const allocations = Array.isArray(session.allocations) ? session.allocations : [];
  if (allocations.length === 0) return session;

  return allocations.some((allocation) => String(allocation?.productId ?? '') === productId) ? session : null;
}

function selectAvailabilityProduct(parent, session) {
  const products = Array.isArray(parent?.products) ? parent.products : [];
  if (products.length === 0) return null;

  const allocationProductId = Array.isArray(session?.allocations)
    ? stringOrNull(session.allocations.find((allocation) => allocation?.productId)?.productId)
    : null;
  const matching = allocationProductId ? products.find((product) => String(product?.id) === allocationProductId) : null;
  if (matching) return matching;

  return products.find((product) => product?.isSuspended !== true) ?? products[0];
}

function getSessionCapacityRemaining(session) {
  if (!session) return 0;

  const candidates = [
    numberOrNull(session.capacityRemaining),
    numberOrNull(session.ticketCapacityRemaining),
    numberOrNull(session.resourceCapacityRemaining),
    ...(
      Array.isArray(session.allocations)
        ? session.allocations.flatMap((allocation) => [
            numberOrNull(allocation?.bookableCapacityRemaining),
            numberOrNull(allocation?.capacityRemaining),
          ])
        : []
    ),
  ].filter((value) => value !== null);

  if (candidates.length === 0) return null;
  return Math.min(...candidates);
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
  emitRollerApiMetric({ method: 'GET', operation: 'get_venue_detail', status: response.status, ok: response.ok });
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

async function persistPrepaymentDraft({ config, draft, externalId, idempotencyKey, jwtSummary, paymentConfig, request }) {
  const prepaymentDraftId = `jypd_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
  const firstItem = request.items[0] ?? {};
  const flowType = request.flowType === 'add_product' ? 'add_product' : 'new_booking';
  const totalCents = centsFromAmount(draft.costs.total);
  const amountOwingCents = centsFromAmount(draft.costs.amountOwing);
  const email = request.customer.email;
  const phone = request.customer.phone;
  const itemsSummary = request.items.map((item) => ({
    bookingDate: item.bookingDate,
    productId: item.productId,
    quantity: item.quantity,
    startTime: item.startTime,
  }));

  await executeStatement(
    `INSERT INTO jumpyard.prepayment_booking_drafts (
       prepayment_draft_id,
       roller_draft_unique_id,
       roller_capacity_reservation_id,
       external_id,
       idempotency_key,
       flow_type,
       original_booking_reference,
       original_roller_unique_id,
       add_on_group_id,
       status,
       roller_env,
       booking_date,
       start_time,
       total_cents,
       amount_owing_cents,
       currency,
       customer_email,
       customer_email_hash,
       customer_email_masked,
       customer_phone,
       customer_phone_hash,
       customer_phone_masked,
       item_count,
       items_summary,
       payment_jwt_present,
       payment_config_available,
       expires_at
     )
     VALUES (
       :prepaymentDraftId,
       :rollerDraftUniqueId,
       :rollerCapacityReservationId,
       :externalId,
       :idempotencyKey,
       :flowType,
       :originalBookingReference,
       :originalRollerUniqueId,
       :addOnGroupId,
       'payment_pending',
       :rollerEnv,
       CAST(:bookingDate AS date),
       CAST(:startTime AS time),
       :totalCents,
       :amountOwingCents,
       :currency,
       :customerEmail,
       :customerEmailHash,
       :customerEmailMasked,
       :customerPhone,
       :customerPhoneHash,
       :customerPhoneMasked,
       :itemCount,
       CAST(:itemsSummary AS jsonb),
       :paymentJwtPresent,
       :paymentConfigAvailable,
       now() + interval '30 minutes'
     )
     ON CONFLICT (idempotency_key) DO UPDATE SET
       roller_draft_unique_id = EXCLUDED.roller_draft_unique_id,
       roller_capacity_reservation_id = EXCLUDED.roller_capacity_reservation_id,
       flow_type = EXCLUDED.flow_type,
       original_booking_reference = EXCLUDED.original_booking_reference,
       original_roller_unique_id = EXCLUDED.original_roller_unique_id,
       add_on_group_id = EXCLUDED.add_on_group_id,
       status = EXCLUDED.status,
       total_cents = EXCLUDED.total_cents,
       amount_owing_cents = EXCLUDED.amount_owing_cents,
       items_summary = EXCLUDED.items_summary,
       payment_jwt_present = EXCLUDED.payment_jwt_present,
       payment_config_available = EXCLUDED.payment_config_available,
       updated_at = now()`,
    [
      stringParameter('prepaymentDraftId', prepaymentDraftId),
      stringParameter('rollerDraftUniqueId', draft.uniqueId),
      stringParameter('rollerCapacityReservationId', draft.capacityReservationId),
      stringParameter('externalId', externalId),
      stringParameter('idempotencyKey', idempotencyKey),
      stringParameter('flowType', flowType),
      stringParameter('originalBookingReference', request.originalBookingReference),
      stringParameter('originalRollerUniqueId', request.originalRollerUniqueId),
      stringParameter('addOnGroupId', request.addOnGroupId),
      stringParameter('rollerEnv', config.env),
      stringParameter('bookingDate', firstItem.bookingDate),
      stringParameter('startTime', firstItem.startTime),
      integerParameter('totalCents', totalCents),
      integerParameter('amountOwingCents', amountOwingCents),
      stringParameter('currency', 'SEK'),
      stringParameter('customerEmail', email),
      stringParameter('customerEmailHash', hashString(email.toLowerCase())),
      stringParameter('customerEmailMasked', maskEmail(email)),
      stringParameter('customerPhone', phone),
      stringParameter('customerPhoneHash', hashString(phone)),
      stringParameter('customerPhoneMasked', maskPhone(phone)),
      integerParameter('itemCount', request.items.length),
      stringParameter('itemsSummary', JSON.stringify(itemsSummary)),
      booleanParameter('paymentJwtPresent', jwtSummary.present === true),
      booleanParameter('paymentConfigAvailable', paymentConfig?.available === true),
    ],
  );

  return {
    amountOwing: draft.costs.amountOwing,
    amountOwingCents,
    addOnGroupId: request.addOnGroupId ?? null,
    expiresAt: null,
    flowType,
    originalBookingReference: request.originalBookingReference ?? null,
    originalRollerUniqueId: request.originalRollerUniqueId ?? null,
    paymentBlockedReason: 'payment_dropin_not_configured',
    prepaymentDraftId,
    rollerDraftUniqueId: draft.uniqueId,
    status: 'payment_pending',
    total: draft.costs.total,
    totalCents,
  };
}

async function persistAddOnBookingLink({ addOnGroupId, draft, original, prepaymentDraft }) {
  const linkId = `jyl_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
  const result = await executeStatement(
    `INSERT INTO jumpyard.booking_links (
       link_id,
       link_type,
       original_roller_unique_id,
       original_booking_reference,
       linked_roller_unique_id,
       linked_booking_reference,
       add_on_group_id,
       status
     )
     VALUES (
       :linkId,
       'add_product_draft',
       :originalRollerUniqueId,
       :originalBookingReference,
       :linkedRollerUniqueId,
       :linkedBookingReference,
       :addOnGroupId,
       'payment_pending'
     )
     RETURNING
       link_id,
       link_type,
       original_roller_unique_id,
       original_booking_reference,
       linked_roller_unique_id,
       linked_booking_reference,
       add_on_group_id,
       status,
       created_at::text AS created_at`,
    [
      stringParameter('linkId', linkId),
      stringParameter('originalRollerUniqueId', original.rollerUniqueId),
      stringParameter('originalBookingReference', original.bookingReference),
      stringParameter('linkedRollerUniqueId', draft.uniqueId || prepaymentDraft.rollerDraftUniqueId),
      stringParameter('linkedBookingReference', draft.bookingReference),
      stringParameter('addOnGroupId', addOnGroupId),
    ],
  );
  const row = firstMappedRow(result);

  return {
    addOnGroupId: stringOrNull(row?.add_on_group_id),
    createdAt: stringOrNull(row?.created_at),
    linkId: stringOrNull(row?.link_id),
    linkType: stringOrNull(row?.link_type),
    linkedBookingReference: stringOrNull(row?.linked_booking_reference),
    linkedRollerUniqueId: stringOrNull(row?.linked_roller_unique_id),
    originalBookingReference: stringOrNull(row?.original_booking_reference),
    originalRollerUniqueId: stringOrNull(row?.original_roller_unique_id),
    status: stringOrNull(row?.status),
  };
}

function centsFromAmount(amount) {
  const parsed = numberOrNull(amount);
  return parsed === null ? null : Math.round(parsed * 100);
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
      Handler: sanitizeMetricValue(process.env.JUMPYARD_HANDLER || 'booking'),
      Operation: sanitizeMetricValue(operation || 'unknown'),
      Method: sanitizeMetricValue(method || 'UNKNOWN'),
      StatusCode: statusCode,
      Ok: Boolean(ok),
      ...metricValues,
    }),
  );
}

function rollerOperationFromEndpointPath(endpointPath, method) {
  const path = String(endpointPath || '').split('?')[0];
  if (path === '/bookings/draft/costs') return 'create_draft_costs';
  if (path === '/bookings/draft') return method === 'POST' ? 'create_draft_booking' : 'get_draft_booking';
  if (path === '/product-availability') return 'get_product_availability';
  if (path === '/venues/me') return 'get_venue_detail';
  if (/^\/bookings\/[^/]+$/.test(path)) return 'get_booking_detail';
  return method === 'POST' ? 'roller_post' : 'roller_get';
}

function sanitizeMetricValue(value) {
  const sanitized = String(value).replace(/[^A-Za-z0-9_.:/-]/g, '_').slice(0, 100);
  return sanitized || 'unknown';
}

function isQuoteRoute(routeKey, event) {
  return routeKey === 'POST /v1/bookings/quote' || event?.rawPath === '/v1/bookings/quote';
}

function isDraftRoute(routeKey, event) {
  return routeKey === 'POST /v1/bookings/draft' || event?.rawPath === '/v1/bookings/draft';
}

function isAvailabilityRoute(routeKey, event) {
  return routeKey === 'POST /v1/bookings/availability' || event?.rawPath === '/v1/bookings/availability';
}

function isAddProductQuoteRoute(routeKey, event) {
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'POST /v1/bookings/{bookingReference}/add-products/quote' ||
    /^POST\s+\/v1\/bookings\/[^/]+\/add-products\/quote$/.test(routeKey) ||
    /^\/v1\/bookings\/[^/]+\/add-products\/quote$/.test(rawPath)
  );
}

function isAddProductDraftRoute(routeKey, event) {
  const rawPath = event?.rawPath ?? '';
  return (
    routeKey === 'POST /v1/bookings/{bookingReference}/add-products' ||
    /^POST\s+\/v1\/bookings\/[^/]+\/add-products$/.test(routeKey) ||
    /^\/v1\/bookings\/[^/]+\/add-products$/.test(rawPath)
  );
}

function getBookingReferenceFromPath(event) {
  const pathParameters = event?.pathParameters ?? {};
  const fromParameters = stringOrNull(
    pathParameters.bookingReference ?? pathParameters.bookingreference ?? pathParameters.booking_reference,
  );
  if (fromParameters) return fromParameters;

  const match = /^\/v1\/bookings\/([^/]+)\/add-products(?:\/quote)?$/.exec(event?.rawPath ?? '');
  return match ? stringOrNull(decodeURIComponent(match[1])) : null;
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

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstObjectString(object, keys) {
  if (!isPlainObject(object)) return null;

  for (const key of keys) {
    const value = stringOrNull(object[key]);
    if (value) return value;
  }

  return null;
}

function splitCustomerName(value) {
  const name = stringOrNull(value);
  if (!name) return { firstName: null, lastName: null };

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: null, lastName: null };

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function hasAnyCustomerField(customer) {
  if (!isPlainObject(customer)) return false;
  return ['firstName', 'lastName', 'email', 'phone'].some((field) => Boolean(stringOrNull(customer[field])));
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

function integerParameter(name, value) {
  return value === null || value === undefined
    ? { name, value: { isNull: true } }
    : { name, value: { longValue: Number(value) } };
}

function booleanParameter(name, value) {
  return { name, value: { booleanValue: value === true } };
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

function maskEmail(email) {
  const [local = '', domain = ''] = String(email ?? '').split('@');
  if (!local || !domain) return null;
  const visibleLocal = local.length <= 2 ? local[0] : `${local[0]}${'*'.repeat(Math.min(6, local.length - 2))}${local.at(-1)}`;
  return `${visibleLocal}@${domain}`;
}

function maskPhone(phone) {
  const normalized = String(phone ?? '').replace(/\s+/g, '');
  if (normalized.length <= 4) return normalized || null;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function getVenueToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: VENUE_TIME_ZONE,
    year: 'numeric',
  }).format(new Date());
}

function getNextHalfHourSlots(count) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: VENUE_TIME_ZONE,
  }).formatToParts(new Date());
  const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const start = Math.ceil((hours * 60 + minutes) / 30) * 30;
  const slots = [];

  for (let minutesFromMidnight = start; slots.length < count && minutesFromMidnight < 24 * 60; minutesFromMidnight += 30) {
    slots.push(formatMinutesAsTime(minutesFromMidnight));
  }

  return slots;
}

function formatMinutesAsTime(minutesFromMidnight) {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
