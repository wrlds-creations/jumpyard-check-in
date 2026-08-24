const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const { InvokeCommand, LambdaClient } = require('@aws-sdk/client-lambda');
const crypto = require('crypto');
const {
  buildKioskQuotePayload,
  KIOSK_PAYMENT_CURRENCY,
  normalizeDraftFinalizeAction,
  normalizeBookingReadback,
  normalizePaymentTerminalMap,
  normalizeTerminalOutcome,
  publicKioskPaymentStatus,
  redactPaymentTerminalValues,
  resolveKioskPaymentTerminal,
  verifyKioskDraftPayment,
} = require('./kiosk-terminal-contract');
const {
  LIVE_PHONE_BOOKING_PRODUCTS,
  fetchPublicCheckoutCatalog,
  filterPhoneProductsByPublicCatalog,
  isPhoneAvailabilityProductAvailable,
  selectMappedAvailabilityProduct,
} = require('./phone-product-catalog');

const DATABASE_NAME = 'jumpyard_cloud';
const MAX_BOOKING_ITEMS = 10;
const MAX_AVAILABILITY_SLOTS = 6;
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const ROLLER_LIVE_BASE_URL = 'https://api.roller.app';
const VENUE_TIME_ZONE = 'Europe/Stockholm';
const GUEST_ACCESS_CHANNEL = 'guest_access';
const GUEST_ACCESS_LINK_WINDOW_MINUTES = 60;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const PROVIDER_CONFIG_CACHE_MS = 5 * 60 * 1000;
const KIOSK_RECONCILIATION_SOURCE = 'jumpyard.kiosk-payment-reconciliation';
const KIOSK_AUTHORITATIVE_CONFIRMATION_SOURCE = 'jumpyard.kiosk-authoritative-confirmation';
const KIOSK_PUBLISH_SETTLEMENT_DELAY_MS = 10_000;
const KIOSK_PUBLISH_RETRY_OFFSETS_MS = [
  10_000,
  15_000,
  20_000,
  25_000,
  30_000,
  35_000,
  40_000,
  45_000,
];
const KIOSK_RECONCILIATION_OFFSETS_MS = [
  0,
  5_000,
  10_000,
  15_000,
  20_000,
  25_000,
  30_000,
  35_000,
  40_000,
  45_000,
  50_000,
  55_000,
  60_000,
  65_000,
  70_000,
  75_000,
];

const PHONE_BOOKING_PRODUCTS = [
  {
    key: 'COMBO60',
    parentName: 'Weekday Combo',
    label: 'Weekday Combo',
    type: 'combo',
    durationMinutes: 60,
    jumpersPerUnit: 2,
    publicCatalogRequired: true,
  },
  { key: 'E60', parentName: 'Entré 60 min', label: '60 min entré', type: 'entry', durationMinutes: 60, jumpersPerUnit: 1 },
  { key: 'E90', parentName: 'Entré 90 min', label: '90 min entré', type: 'entry', durationMinutes: 90, jumpersPerUnit: 1 },
  { key: 'E120', parentName: 'Entré 120 min', label: '120 min entré', type: 'entry', durationMinutes: 120, jumpersPerUnit: 1 },
  { key: 'F60', parentName: 'Entré 60 min - Familj', label: '60 min familj', type: 'family', durationMinutes: 60, jumpersPerUnit: 4 },
  { key: 'F90', parentName: 'Entré 90 min - Familj', label: '90 min familj', type: 'family', durationMinutes: 90, jumpersPerUnit: 4 },
  { key: 'F120', parentName: 'Entré 120 min - Familj', label: '120 min familj', type: 'family', durationMinutes: 120, jumpersPerUnit: 4 },
];

const PHONE_ADDON_PRODUCTS = [
  {
    key: 'skyrider',
    parentName: 'SkyRider',
    label: 'SkyRider',
    type: 'addon',
    durationMinutes: 0,
    jumpersPerUnit: 1,
    requiresAvailability: true,
  },
  {
    key: 'socks',
    productId: '1765445',
    label: 'JumpSocks',
    type: 'addon',
    durationMinutes: 0,
    jumpersPerUnit: 1,
    requiresAvailability: false,
  },
  {
    key: 'water_bottle',
    parentName: 'Jumpy Vattenflaska',
    label: 'Vattenflaska',
    type: 'addon',
    durationMinutes: 0,
    jumpersPerUnit: 1,
    requiresAvailability: false,
  },
  {
    key: 'lock',
    productId: '1765441',
    label: 'Hänglås',
    type: 'addon',
    durationMinutes: 0,
    jumpersPerUnit: 1,
    requiresAvailability: false,
  },
  {
    key: 'coffee',
    productId: '1765452',
    label: 'Bryggkaffe',
    type: 'addon',
    durationMinutes: 0,
    jumpersPerUnit: 1,
    requiresAvailability: false,
  },
];

const T0159_LIVE_PAYMENT_SMOKE_PRODUCTS = [
  { key: 'E60', parentProductId: '1189805' },
  { key: 'E90', parentProductId: '1189823' },
  { key: 'E120', parentProductId: '1189771' },
  { key: 'F60', parentProductId: '1189814' },
  { key: 'F90', parentProductId: '1189832' },
  { key: 'F120', parentProductId: '1189794' },
];

const T0162_LIVE_ADDON_SMOKE_PRODUCTS = [
  { key: 'E60', parentProductId: '1189805' },
  { key: 'E90', parentProductId: '1189823' },
  { key: 'E120', parentProductId: '1189771' },
  { key: 'F60', parentProductId: '1189814' },
  { key: 'F90', parentProductId: '1189832' },
  { key: 'F120', parentProductId: '1189794' },
];

const LIVE_PHONE_ADDON_PRODUCTS = [
  {
    key: 'skyrider',
    parentProductId: '970335',
    parentProductName: 'SkyRider',
    productId: '970335',
    productName: 'SkyRider',
    availabilityProductIds: ['970336'],
    priceCents: null,
  },
  {
    key: 'socks',
    parentProductId: '970337',
    parentProductName: 'JumpSocks',
    productId: '970338',
    productName: 'Antal',
  },
  {
    key: 'water_bottle',
    parentProductId: '970508',
    parentProductName: 'Merchandise',
    productId: '1324123',
    productName: 'Jumpy Vattenflaska',
  },
  {
    key: 'lock',
    parentProductId: '970333',
    parentProductName: 'Lock',
    productId: '970334',
    productName: 'Lock',
  },
  {
    key: 'coffee',
    parentProductId: '970346',
    parentProductName: 'Coffee',
    productId: '970352',
    productName: 'Coffee',
  },
];

const rdsClient = new RDSDataClient({});
const lambdaClient = new LambdaClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedRollerConfigExpiresAt = 0;
let cachedToken = null;
let cachedVenuePaymentConfig = null;
let cachedVenuePaymentConfigExpiresAt = 0;

exports.handler = async (event) => {
  let correlationId = normalizeCorrelationId(getHeader(event, 'x-correlation-id')) || createCorrelationId();
  let routeKey = 'unknown';

  try {
    routeKey = event?.routeKey || `${event?.requestContext?.http?.method ?? ''} ${event?.rawPath ?? ''}`.trim();

    const body = parseBody(event);
    correlationId = normalizeCorrelationId(body.correlationId) || correlationId;

    if (isKioskReconciliationEvent(event)) {
      correlationId = normalizeCorrelationId(event?.detail?.correlationId) || correlationId;
      return await handleKioskPaymentReconciliation(event.detail, correlationId);
    }

    if (isKioskAuthoritativeConfirmationEvent(event)) {
      correlationId = normalizeCorrelationId(event?.detail?.correlationId) || correlationId;
      return await handleKioskAuthoritativeConfirmation(event.detail, correlationId);
    }

    if (isDraftFinalizeRoute(routeKey, event)) {
      return await handleDraftFinalize(event, body, correlationId);
    }

    if (isEmergencyStopEnabled()) {
      return safetyGateBlockedResponse(
        correlationId,
        'emergency_stop_active',
        'Park-test booking operations are disabled while the JumpYard emergency stop is active.',
      );
    }

    if (isAddProductQuoteRoute(routeKey, event)) {
      return await handleAddProductQuote(event, body, correlationId);
    }

    if (isAddProductDraftRoute(routeKey, event)) {
      return await handleAddProductDraft(event, body, correlationId);
    }

    if (isAvailabilityRoute(routeKey, event)) {
      return await handleAvailability(body, correlationId);
    }

    if (isQuoteRoute(routeKey, event)) {
      return await handleQuote(event, body, correlationId);
    }

    if (isDraftRoute(routeKey, event)) {
      return await handleDraft(event, body, correlationId);
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
    emitSafeBookingOperationFailure({ correlationId, error, routeKey });
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
  const [loadedParentProducts, addonProducts, publicCatalogResult] = await Promise.all([
    loadPhoneBookingParentProducts(config.env),
    loadPhoneAddonProducts(config.env),
    fetchPublicCheckoutCatalog(config.env),
  ]);

  if (!publicCatalogResult.ok) {
    emitRollerApiMetric({
      method: 'GET',
      operation: 'get_public_checkout_products',
      status: publicCatalogResult.status,
      ok: false,
    });
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.public_catalog_failed',
      payload: {
        endpoint: 'GET /api/checkout/boka/products',
        rollerStatus: publicCatalogResult.status,
      },
      subjectRef: request.date,
      summary: `Roller public checkout catalog failed with HTTP ${publicCatalogResult.status || 'network_error'}.`,
    });

    return jsonResponse(502, correlationId, {
      status: 'roller_error',
      error: {
        code: 'roller_public_catalog_failed',
        message: 'Roller public checkout catalog could not be verified. Try again.',
      },
      roller: {
        statusCode: publicCatalogResult.status,
      },
    });
  }

  if (!publicCatalogResult.skipped) {
    emitRollerApiMetric({
      method: 'GET',
      operation: 'get_public_checkout_products',
      status: publicCatalogResult.status,
      ok: true,
    });
  }

  const parentProducts = filterPhoneProductsByPublicCatalog(
    config.env,
    loadedParentProducts,
    publicCatalogResult.body,
  );
  const requiredProducts = getRequiredPhoneBookingProducts();
  const missingParents = requiredProducts.filter((product) => !parentProducts.some((parent) => parent.key === product.key));

  if (missingParents.length > 0) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: {
        code: 'phone_products_missing',
        message: `Product cache is missing ${missingParents[0].parentName}. Refresh the Roller product cache before booking creation.`,
      },
    });
  }

  const availabilityProducts = [
    ...parentProducts,
    ...addonProducts.filter((product) => product.requiresAvailability === true),
  ];
  const phoneProducts = [...parentProducts, ...addonProducts];
  const parentProductIds = [...new Set(availabilityProducts.map((product) => product.parentProductId))];
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
        error: summarizeRollerError(rollerResult.body, request),
      },
    });
  }

  const availability = buildPhoneAvailability(request, phoneProducts, rollerResult.body);
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
      catalogEndpoint: publicCatalogResult.skipped ? null : 'GET /api/checkout/boka/products',
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

  const fullFlowItemGate = validateT0176FullFlowRequestItemDates(request.items);
  if (!fullFlowItemGate.ok) {
    return parkTestGateBlockedResponse(correlationId, fullFlowItemGate);
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
  const giftCards = normalizeGiftCardSummary(rollerResult.body, request);
  const discountCodes = normalizeDiscountCodeSummary(rollerResult.body, request);
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.quote_succeeded',
    payload: {
      endpoint: 'POST /bookings/draft/costs',
      discountCodeAppliedCount: discountCodes.appliedCount,
      discountCodeErrorCount: discountCodes.errors.length,
      discountCodeRequestedCount: discountCodes.requestedCount,
      giftCardAppliedCount: giftCards.appliedCount,
      giftCardErrorCount: giftCards.errors.length,
      giftCardRequestedCount: giftCards.requestedCount,
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
      discountCodes,
      giftCards,
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

  const fullFlowItemGate = validateT0176FullFlowRequestItemDates(request.items);
  if (!fullFlowItemGate.ok) {
    return parkTestGateBlockedResponse(correlationId, fullFlowItemGate);
  }

  if (!isNewBookingDraftWriteEnabled()) {
    return safetyGateBlockedResponse(correlationId, 'roller_booking_draft_writes_disabled');
  }

  const requestHash = hashJson({
    channel: request.channel,
    customer: maskCustomerForHash(request.customer),
    discounts: hashDiscountsForHash(request.discounts),
    giftCards: hashGiftCardsForHash(request.giftCards),
    items: request.items,
    operation: 'booking_draft_create',
    paymentTerminalAlias: request.paymentTerminalAlias,
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
  const terminalSelection = resolveKioskPaymentTerminal(config, request);
  if (terminalSelection.error) {
    await completeIdempotencyKey(request.idempotencyKey, 'failed', terminalSelection.error.code);
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: terminalSelection.error,
    });
  }
  request.paymentTerminal = terminalSelection.paymentTerminal;
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
  let kioskQuoteResult = null;
  if (terminalSelection.enabled) {
    const kioskQuotePayload = buildKioskQuotePayload(payload);
    kioskQuoteResult = await postRollerJson(config, token, '/bookings/draft/costs', kioskQuotePayload);
    if (!kioskQuoteResult.ok) {
      await completeIdempotencyKey(request.idempotencyKey, 'failed', `roller_quote_http_${kioskQuoteResult.status}`);
      return jsonResponse(kioskQuoteResult.status === 409 ? 409 : 502, correlationId, {
        status: kioskQuoteResult.status === 409 ? 'rejected' : 'roller_error',
        error: {
          code: 'roller_kiosk_quote_failed',
          message: `ROLLER kiosk quote failed with HTTP ${kioskQuoteResult.status}.`,
        },
      });
    }
  }
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
        error: summarizeRollerError(rollerResult.body, request),
      },
    });
  }

  let draft = normalizeDraftResponse(rollerResult.body, request.items.length, request);
  if (terminalSelection.enabled) {
    const verification = verifyKioskDraftPayment({
      draftBody: rollerResult.body,
      paymentJwt: rollerResult.body?.paymentJwt,
      quoteBody: kioskQuoteResult.body,
    });
    if (!verification.ok) {
      await completeIdempotencyKey(request.idempotencyKey, 'failed', verification.error.code);
      await writeBookingEventLog({
        correlationId,
        eventType: 'booking.kiosk_terminal_contract_failed',
        payload: {
          endpoint: 'POST /bookings/draft',
          itemCount: request.items.length,
          reason: verification.error.code,
        },
        subjectRef: draft.uniqueId || payload.externalId,
        summary: 'ROLLER kiosk terminal draft failed amount or currency verification.',
      });
      return jsonResponse(502, correlationId, {
        status: 'roller_error',
        error: verification.error,
      });
    }
  }
  const giftCards = draft.giftCards;
  const discountCodes = draft.discountCodes;
  let noPaymentPublish = null;
  if (isZeroAmount(draft.costs.amountOwing) && (request.giftCards.length > 0 || request.discounts.length > 0)) {
    noPaymentPublish = await publishNoPaymentDraft(config, token, draft.uniqueId);
    if (!noPaymentPublish.ok) {
      await completeIdempotencyKey(request.idempotencyKey, 'failed', `roller_publish_http_${noPaymentPublish.status}`);
      await writeBookingEventLog({
        correlationId,
        eventType: 'booking.draft_publish_failed',
        payload: {
          endpoint: 'POST /bookings/draft/publish',
          discountCodeAppliedCount: discountCodes.appliedCount,
          discountCodeRequestedCount: discountCodes.requestedCount,
          giftCardAppliedCount: giftCards.appliedCount,
          giftCardRequestedCount: giftCards.requestedCount,
          itemCount: request.items.length,
          rollerEnvironment: config.env,
          rollerStatus: noPaymentPublish.status,
          rollerDraftUniqueId: draft.uniqueId,
        },
        subjectRef: draft.uniqueId || payload.externalId,
        summary: `Roller no-payment draft publish failed with HTTP ${noPaymentPublish.status}.`,
      });

      return jsonResponse(noPaymentPublish.status === 409 ? 409 : 502, correlationId, {
        status: noPaymentPublish.status === 409 ? 'rejected' : 'roller_error',
        error: {
          code: 'roller_draft_publish_failed',
          message: `Roller no-payment draft publish failed with HTTP ${noPaymentPublish.status}.`,
        },
        roller: {
          statusCode: noPaymentPublish.status,
          error: summarizeRollerError(noPaymentPublish.body, request),
        },
      });
    }

    draft = {
      ...draft,
      uniqueId: stringOrNull(noPaymentPublish.body?.uniqueId) || draft.uniqueId,
      bookingReference: stringOrNull(noPaymentPublish.body?.bookingReference) || draft.bookingReference,
    };
  }
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
    status: noPaymentPublish?.ok ? 'published' : 'payment_pending',
  });
  await completeIdempotencyKey(request.idempotencyKey, 'succeeded', `roller_draft:${draft.uniqueId ?? payload.externalId}`);
  if (noPaymentPublish?.ok) {
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.draft_published_no_payment',
      payload: {
        endpoint: 'POST /bookings/draft/publish',
        discountCodeAppliedCount: discountCodes.appliedCount,
        discountCodeRequestedCount: discountCodes.requestedCount,
        giftCardAppliedCount: giftCards.appliedCount,
        giftCardRequestedCount: giftCards.requestedCount,
        itemCount: request.items.length,
        prepaymentDraftId: prepaymentDraft.prepaymentDraftId,
        rollerBookingReference: draft.bookingReference,
        rollerEnvironment: config.env,
        rollerDraftUniqueId: draft.uniqueId,
        sendConfirmations: request.sendConfirmations === true,
      },
      subjectRef: draft.uniqueId || payload.externalId,
      summary: 'Roller Playground no-payment draft booking published.',
    });
  }
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.draft_succeeded',
    payload: {
      endpoint: 'POST /bookings/draft',
      discountCodeAppliedCount: discountCodes.appliedCount,
      discountCodeErrorCount: discountCodes.errors.length,
      discountCodeRequestedCount: discountCodes.requestedCount,
      giftCardAppliedCount: giftCards.appliedCount,
      giftCardErrorCount: giftCards.errors.length,
      giftCardRequestedCount: giftCards.requestedCount,
      itemCount: request.items.length,
      paymentJwtPresent: jwtSummary.present,
      paymentChannel: terminalSelection.enabled ? 'card_present' : 'ecommerce',
      prepaymentDraftId: prepaymentDraft.prepaymentDraftId,
      rollerEnvironment: config.env,
      rollerDraftUniqueId: draft.uniqueId,
      sendConfirmations: request.sendConfirmations === true,
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
      terminal: terminalSelection.enabled
        ? {
            apiUrl: paymentConfig.apiUrl,
            available: Boolean(paymentConfig.apiUrl && jwtSummary.present),
            currency: KIOSK_PAYMENT_CURRENCY,
          }
        : undefined,
    },
    source: {
      system: 'roller',
      environment: config.env,
      endpoint: 'POST /bookings/draft',
      wroteBooking: true,
    },
  });
}

async function handleDraftFinalize(event, body, correlationId) {
  const request = {
    action: normalizeDraftFinalizeAction(body.action),
    idempotencyKey: stringOrNull(body.idempotencyKey) || stringOrNull(getHeader(event, 'x-idempotency-key')),
    outcome: normalizeTerminalOutcome(body.outcome),
    paymentAttemptId: stringOrNull(body.paymentAttemptId),
    prepaymentDraftId: stringOrNull(body.prepaymentDraftId),
    rollerDraftUniqueId: stringOrNull(body.rollerDraftUniqueId),
  };
  const validationError = validateDraftFinalizeRequest(request);
  if (validationError) {
    return jsonResponse(400, correlationId, { status: 'invalid_request', error: validationError });
  }

  const prepayment = await findKioskPrepaymentAttempt(request);
  if (!prepayment) {
    return jsonResponse(404, correlationId, {
      status: 'blocked',
      error: {
        code: 'kiosk_payment_attempt_not_found',
        message: 'The kiosk payment attempt was not found.',
      },
    });
  }

  if (request.action === 'status') {
    return jsonResponse(200, correlationId, publicKioskPaymentStatus(prepayment));
  }

  if (prepayment.roller_draft_unique_id !== request.rollerDraftUniqueId) {
    return jsonResponse(404, correlationId, {
      status: 'blocked',
      error: {
        code: 'kiosk_payment_attempt_not_found',
        message: 'The kiosk payment attempt was not found.',
      },
    });
  }

  if (request.outcome !== 'approved') {
    const recorded = await recordKioskTerminalOutcome(request, request.outcome);
    emitKioskTerminalOutcomeMetric(request.outcome);
    return jsonResponse(200, correlationId, {
      ...publicKioskPaymentStatus(recorded ?? prepayment),
      result: 'terminal_result_recorded',
    });
  }

  const recorded = await recordKioskTerminalOutcome(request, 'approved');
  emitKioskTerminalOutcomeMetric('approved');
  if (recorded?.booking_confirmation_status === 'confirmed' || recorded?.status === 'published') {
    return jsonResponse(200, correlationId, publicKioskPaymentStatus(await findKioskPrepaymentAttempt(request)));
  }

  if (prepayment.flow_type === 'new_booking') {
    try {
      await ensureProvisionalKioskHandoff(request);
    } catch (error) {
      await writeBookingEventLog({
        correlationId,
        eventType: 'booking.kiosk_provisional_handoff_failed',
        payload: { failureClass: error?.name || 'unknown' },
        subjectRef: request.prepaymentDraftId,
        summary: 'Approved kiosk payment could not create its provisional handoff session.',
      });
    }
  }

  const draftWritesEnabled = prepayment.flow_type === 'add_product'
    ? isAddProductDraftWriteEnabled()
    : isNewBookingDraftWriteEnabled();
  if (isEmergencyStopEnabled() || !draftWritesEnabled) {
    const blocked = await markKioskReconciliationNeedsStaff(
      request,
      isEmergencyStopEnabled() ? 'emergency_stop_active' : 'roller_booking_draft_writes_disabled',
    );
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.kiosk_terminal_reconciliation_blocked',
      payload: {
        reason: isEmergencyStopEnabled() ? 'emergency_stop_active' : 'roller_booking_draft_writes_disabled',
      },
      subjectRef: request.prepaymentDraftId,
      summary: 'Kiosk payment was approved but automatic booking reconciliation is blocked.',
    });
    emitKioskReconciliationMetric('needs_staff', 0, 0);
    return jsonResponse(202, correlationId, publicKioskPaymentStatus(await findKioskPrepaymentAttempt(request)));
  }

  try {
    await queueKioskPaymentReconciliation(request, correlationId);
  } catch (error) {
    const failureClass = kioskReconciliationDispatchFailureClass(error);
    const blocked = await markKioskReconciliationNeedsStaff(request, 'background_dispatch_failed');
    await writeBookingEventLog({
      correlationId,
      eventType: 'booking.kiosk_terminal_reconciliation_dispatch_failed',
      payload: { failureClass },
      subjectRef: request.prepaymentDraftId,
      summary: 'Kiosk payment was approved but background reconciliation could not be dispatched.',
    });
    emitKioskReconciliationDispatchFailureMetric(failureClass);
    emitKioskReconciliationMetric('needs_staff', 0, 0);
    return jsonResponse(202, correlationId, publicKioskPaymentStatus(await findKioskPrepaymentAttempt(request)));
  }

  emitKioskReconciliationMetric('pending', 0, 0);
  return jsonResponse(202, correlationId, publicKioskPaymentStatus(await findKioskPrepaymentAttempt(request)));
}

function validateDraftFinalizeRequest(request) {
  if (!request.action) {
    return { code: 'draft_finalize_action_invalid', message: 'A supported finalize action is required.' };
  }
  if (!/^jypd_[a-f0-9]{18}$/.test(request.prepaymentDraftId ?? '')) {
    return { code: 'prepayment_draft_id_invalid', message: 'A valid prepayment draft id is required.' };
  }
  if (!/^jytp_[a-f0-9]{18}$/.test(request.paymentAttemptId ?? '')) {
    return { code: 'payment_attempt_id_invalid', message: 'A valid payment attempt id is required.' };
  }
  if (request.action === 'status') return null;
  if (!request.idempotencyKey) {
    return { code: 'idempotency_key_required', message: 'An idempotency key is required.' };
  }
  if (!request.outcome) {
    return { code: 'terminal_outcome_invalid', message: 'A supported terminal outcome is required.' };
  }
  if (!request.rollerDraftUniqueId || request.rollerDraftUniqueId.length > 128) {
    return { code: 'roller_draft_id_invalid', message: 'A valid ROLLER draft id is required.' };
  }
  return null;
}

async function findKioskPrepaymentAttempt(request) {
  const result = await executeStatement(
    `SELECT
       draft.prepayment_draft_id,
       draft.roller_draft_unique_id,
       draft.payment_attempt_id,
       draft.payment_attempt_status,
       draft.status,
       draft.flow_type,
       draft.add_on_group_id,
       draft.booking_confirmation_status,
       draft.roller_booking_reference,
       draft.roller_env,
       draft.booking_date::text AS booking_date,
       draft.start_time::text AS start_time,
       draft.total_cents,
       draft.currency,
       draft.customer_first_name,
       draft.customer_last_name,
       draft.items_summary::text AS items_summary,
       draft.payment_approved_at::text AS payment_approved_at,
       draft.reconciliation_started_at::text AS reconciliation_started_at,
       draft.reconciliation_claimed_at::text AS reconciliation_claimed_at,
       draft.reconciliation_last_attempt_at::text AS reconciliation_last_attempt_at,
       draft.reconciliation_completed_at::text AS reconciliation_completed_at,
       draft.reconciliation_attempt_count,
       draft.reconciliation_last_result,
       draft.publish_attempted_at::text AS publish_attempted_at,
       draft.publish_http_status,
       session.checkin_session_id,
       session.roller_unique_id AS confirmed_roller_unique_id,
       session.booking_reference AS confirmed_booking_reference,
       session.status AS session_status,
       session.safety_status,
       session.handoff_code,
       session.handoff_status,
       session.selected_ticket_ids::text AS selected_ticket_ids,
       session.session_summary ->> 'bookingSyncStatus' AS session_booking_sync_status,
       session.expires_at::text AS session_expires_at,
       session.expires_at::text AS guest_access_expires_at
      FROM jumpyard.prepayment_booking_drafts AS draft
     LEFT JOIN LATERAL (
       SELECT cs.*
       FROM jumpyard.checkin_sessions AS cs
       WHERE cs.source_lookup_ref = draft.prepayment_draft_id
         AND cs.session_summary ->> 'paymentAttemptId' = draft.payment_attempt_id
       ORDER BY cs.created_at DESC
       LIMIT 1
      ) AS session ON true
      WHERE draft.prepayment_draft_id = :prepaymentDraftId
        AND draft.payment_attempt_id = :paymentAttemptId
        AND draft.payment_channel = 'card_present'
        AND draft.flow_type IN ('new_booking', 'add_product')
      LIMIT 1`,
    [
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return firstMappedRow(result) ?? null;
}

async function ensureProvisionalKioskHandoff(request) {
  const draft = await findKioskPrepaymentAttempt(request);
  if (!draft || draft.payment_attempt_status !== 'approved') return null;

  const checkinSessionId = `jycs_${request.paymentAttemptId.replace(/^jytp_/, '')}`;
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const venueId =
    stringOrNull(process.env.T0176_FULL_FLOW_VENUE_ID) ||
    stringOrNull(process.env.ROLLER_DATA_SYNC_VENUE_ID) ||
    stringOrNull(process.env.STAFF_IDENTITY_VENUE_ID);
  const sessionSummary = {
    bookingSyncStatus: 'pending',
    paymentAttemptId: request.paymentAttemptId,
    paymentStatus: 'approved',
    prepaymentDraftId: request.prepaymentDraftId,
    source: 'kiosk_terminal_approved',
  };

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
         currency,
         booking_date,
         start_time,
         source_last_updated_by,
         freshness_status,
         normalized_summary
       )
       VALUES (
         :rollerDraftUniqueId,
         :rollerDraftUniqueId,
         :rollerEnv,
         :venueId,
         'payment_approved_booking_syncing',
         'paid',
         0,
         :totalCents,
         :currency,
         CAST(:bookingDate AS date),
         CAST(:startTime AS time),
         'kiosk_terminal_approved',
         'stale',
         CAST(:bookingSummary AS jsonb)
       )
       ON CONFLICT (roller_unique_id) DO NOTHING`,
    [
      stringParameter('rollerDraftUniqueId', draft.roller_draft_unique_id),
      stringParameter('rollerEnv', draft.roller_env),
      stringParameter('venueId', venueId),
      integerParameter('totalCents', Number(draft.total_cents ?? 0)),
      stringParameter('currency', draft.currency || KIOSK_PAYMENT_CURRENCY),
      stringParameter('bookingDate', draft.booking_date),
      stringParameter('startTime', draft.start_time),
      stringParameter('bookingSummary', JSON.stringify({
        bookingSyncStatus: 'pending',
        customerFirstName: draft.customer_first_name,
        customerLastName: draft.customer_last_name,
        items: Array.isArray(parseJsonOrNull(draft.items_summary)) ? parseJsonOrNull(draft.items_summary) : [],
        paymentAttemptId: request.paymentAttemptId,
        prepaymentDraftId: request.prepaymentDraftId,
      })),
    ],
  );

  await executeStatement(
    `INSERT INTO jumpyard.checkin_tokens (
         token_hash,
         roller_unique_id,
         channel,
         expires_at
       )
       VALUES (
         :tokenHash,
         :rollerDraftUniqueId,
         :guestAccessChannel,
         CAST(:expiresAt AS timestamptz)
       )
       ON CONFLICT (token_hash) DO UPDATE SET
         expires_at = GREATEST(jumpyard.checkin_tokens.expires_at, EXCLUDED.expires_at)`,
    [
      stringParameter('tokenHash', hashString(request.paymentAttemptId)),
      stringParameter('rollerDraftUniqueId', draft.roller_draft_unique_id),
      stringParameter('guestAccessChannel', GUEST_ACCESS_CHANNEL),
      stringParameter('expiresAt', expiresAt),
    ],
  );

  await executeStatement(
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
       :rollerDraftUniqueId,
       :rollerDraftUniqueId,
       CAST(:bookingDate AS date),
       'guest_in_progress',
       'not_started',
       'not_ready',
       '[]'::jsonb,
       :prepaymentDraftId,
       :sessionIdempotencyKey,
       CAST(:expiresAt AS timestamptz),
       CAST(:sessionSummary AS jsonb)
     )
     ON CONFLICT (checkin_session_id) DO UPDATE SET
       expires_at = GREATEST(jumpyard.checkin_sessions.expires_at, EXCLUDED.expires_at),
       updated_at = now(),
       session_summary = jumpyard.checkin_sessions.session_summary || EXCLUDED.session_summary
    RETURNING checkin_session_id`,
    [
      stringParameter('rollerDraftUniqueId', draft.roller_draft_unique_id),
      stringParameter('bookingDate', draft.booking_date),
      stringParameter('expiresAt', expiresAt),
      stringParameter('checkinSessionId', checkinSessionId),
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('sessionIdempotencyKey', `kiosk-provisional-session:${request.paymentAttemptId}`),
      stringParameter('sessionSummary', JSON.stringify(sessionSummary)),
    ],
  );

  return checkinSessionId;
}

function linkedAddOnEffectiveSyncCte(sourceCte) {
  if (sourceCte !== 'updated_draft' && sourceCte !== 'confirmed_draft') {
    throw new Error('Unsupported linked add-on sync source.');
  }
  return `effective_sync AS (
    SELECT
      target.original_roller_unique_id,
      target.booking_date,
      CASE
        WHEN target.booking_confirmation_status = 'pending' OR EXISTS (
          SELECT 1
          FROM jumpyard.prepayment_booking_drafts AS candidate
          WHERE candidate.prepayment_draft_id <> target.prepayment_draft_id
            AND candidate.original_roller_unique_id = target.original_roller_unique_id
            AND candidate.booking_date IS NOT DISTINCT FROM target.booking_date
            AND candidate.flow_type = 'add_product'
            AND candidate.payment_channel = 'card_present'
            AND candidate.payment_attempt_status IN ('approved', 'reconciled')
            AND candidate.booking_confirmation_status = 'pending'
        ) THEN 'pending'
        WHEN target.booking_confirmation_status = 'needs_staff' OR EXISTS (
          SELECT 1
          FROM jumpyard.prepayment_booking_drafts AS candidate
          WHERE candidate.prepayment_draft_id <> target.prepayment_draft_id
            AND candidate.original_roller_unique_id = target.original_roller_unique_id
            AND candidate.booking_date IS NOT DISTINCT FROM target.booking_date
            AND candidate.flow_type = 'add_product'
            AND candidate.payment_channel = 'card_present'
            AND candidate.payment_attempt_status IN ('approved', 'reconciled')
            AND candidate.booking_confirmation_status = 'needs_staff'
        ) THEN 'needs_staff'
        ELSE 'confirmed'
      END AS booking_sync_status
    FROM ${sourceCte} AS target
    WHERE target.flow_type = 'add_product'
      AND target.payment_attempt_status IN ('approved', 'reconciled')
  )`;
}

async function recordKioskTerminalOutcome(request, outcome) {
  const status = outcome === 'failed' ? 'failed' : outcome === 'cancelled' ? 'cancelled' : 'payment_pending';
  const confirmationStatus = outcome === 'approved'
    ? 'pending'
    : outcome === 'unknown'
      ? 'needs_staff'
      : 'failed';
  const result = await executeStatement(
    `WITH updated_draft AS (
       UPDATE jumpyard.prepayment_booking_drafts
       SET payment_attempt_status = CASE
             WHEN payment_attempt_status = 'reconciled' THEN payment_attempt_status
             WHEN payment_attempt_status = 'approved' AND :outcome <> 'approved' THEN payment_attempt_status
             ELSE :outcome
           END,
           status = CASE
             WHEN status = 'published' THEN status
             WHEN payment_attempt_status = 'approved' AND :outcome <> 'approved' THEN status
             ELSE :status
           END,
           booking_confirmation_status = CASE
             WHEN status = 'published' OR payment_attempt_status = 'reconciled' THEN 'confirmed'
             WHEN payment_attempt_status = 'approved' THEN booking_confirmation_status
             ELSE :confirmationStatus
           END,
           payment_approved_at = CASE
             WHEN :outcome = 'approved' THEN COALESCE(payment_approved_at, now())
             ELSE payment_approved_at
           END,
           updated_at = now()
       WHERE prepayment_draft_id = :prepaymentDraftId
         AND payment_attempt_id = :paymentAttemptId
       RETURNING
         prepayment_draft_id,
         roller_draft_unique_id,
         flow_type,
         original_roller_unique_id,
         booking_date,
         payment_attempt_id,
         payment_attempt_status,
         status,
         booking_confirmation_status,
         roller_booking_reference
     ), ${linkedAddOnEffectiveSyncCte('updated_draft')}, updated_session AS (
       UPDATE jumpyard.checkin_sessions AS session
       SET updated_at = now(),
           session_summary = session.session_summary || jsonb_build_object(
             'bookingSyncStatus', sync.booking_sync_status,
             'linkedAddOnSyncSource', 'kiosk_terminal_add_product'
           )
       FROM effective_sync AS sync
       WHERE session.roller_unique_id = sync.original_roller_unique_id
         AND session.visit_date IS NOT DISTINCT FROM sync.booking_date
         AND session.status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
       RETURNING session.checkin_session_id
     )
     SELECT
       updated_draft.*,
       (SELECT count(*) FROM updated_session)::int AS linked_add_on_session_count
     FROM updated_draft`,
    [
      stringParameter('outcome', outcome),
      stringParameter('status', status),
      stringParameter('confirmationStatus', confirmationStatus),
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return firstMappedRow(result) ?? null;
}

async function queueKioskPaymentReconciliation(request, correlationId) {
  const functionName = stringOrNull(process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!functionName) throw new Error('Kiosk reconciliation function is not configured.');

  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          source: KIOSK_RECONCILIATION_SOURCE,
          detail: {
            correlationId,
            paymentAttemptId: request.paymentAttemptId,
            prepaymentDraftId: request.prepaymentDraftId,
          },
        }),
      ),
    }),
  );
  if (response.StatusCode !== 202) throw new Error('Kiosk reconciliation dispatch was not accepted.');
}

function kioskReconciliationDispatchFailureClass(error) {
  const name = stringOrNull(error?.name);
  const allowlistedNames = new Set([
    'AccessDeniedException',
    'InvalidParameterValueException',
    'RecursiveInvocationException',
    'ResourceNotFoundException',
    'ServiceException',
    'TooManyRequestsException',
  ]);
  if (name && allowlistedNames.has(name)) return name;
  return 'unknown';
}

async function handleKioskPaymentReconciliation(detail, correlationId) {
  const request = {
    paymentAttemptId: stringOrNull(detail?.paymentAttemptId),
    prepaymentDraftId: stringOrNull(detail?.prepaymentDraftId),
  };
  if (
    !/^jypd_[a-f0-9]{18}$/.test(request.prepaymentDraftId ?? '') ||
    !/^jytp_[a-f0-9]{18}$/.test(request.paymentAttemptId ?? '')
  ) {
    return { status: 'invalid_reconciliation_request' };
  }

  const existing = await findKioskPrepaymentAttempt(request);
  if (!existing || !['approved', 'reconciled'].includes(existing.payment_attempt_status)) {
    return { status: publicKioskPaymentStatus(existing).status };
  }
  if (existing.booking_confirmation_status === 'confirmed' || existing.status === 'published') {
    if (existing.flow_type === 'add_product') {
      return { status: publicKioskPaymentStatus(existing).status };
    }
    if (isKioskHandoffAuthoritativelyAttached(existing)) return { status: 'confirmed' };
    return repairKioskHandoffFromAuthoritativeStorage(request, correlationId, 'reconciliation_worker_resume');
  }
  if (existing.payment_attempt_status !== 'approved') {
    return { status: publicKioskPaymentStatus(existing).status };
  }
  const draftWritesEnabled = existing.flow_type === 'add_product'
    ? isAddProductDraftWriteEnabled()
    : isNewBookingDraftWriteEnabled();
  if (isEmergencyStopEnabled() || !draftWritesEnabled) {
    await markKioskReconciliationNeedsStaff(
      request,
      isEmergencyStopEnabled() ? 'emergency_stop_active' : 'roller_booking_draft_writes_disabled',
    );
    emitKioskReconciliationMetric('needs_staff', 0, 0);
    return { status: 'needs_staff' };
  }

  const claimed = await claimKioskReconciliation(request);
  if (!claimed) return { status: 'already_claimed' };

  const startedAt = Date.now();
  const approvedAt = Date.parse(claimed.payment_approved_at ?? '') || startedAt;
  let config;
  let token;
  try {
    config = await getRollerConfig();
    token = await getRollerAccessToken(config);
  } catch {
    await markKioskReconciliationNeedsStaff(request, 'provider_setup_failed');
    emitKioskReconciliationMetric('needs_staff', 0, Date.now() - startedAt);
    return { status: 'needs_staff' };
  }
  const readbackIdentifiers = [claimed.roller_draft_unique_id];
  let publishReadback = null;
  let publishSequenceClaimed = false;
  let publishRetryAllowed = false;

  for (let index = 0; index < KIOSK_RECONCILIATION_OFFSETS_MS.length; index += 1) {
    const offsetMs = KIOSK_RECONCILIATION_OFFSETS_MS[index];
    const waitMs = startedAt + offsetMs - Date.now();
    if (waitMs > 0) await wait(waitMs);

    const current = await findKioskPrepaymentAttempt(request);
    if (current?.booking_confirmation_status === 'confirmed' || current?.status === 'published') {
      if (current.flow_type === 'add_product') {
        return { status: publicKioskPaymentStatus(current).status };
      }
      if (isKioskHandoffAuthoritativelyAttached(current)) return { status: 'confirmed' };
      return repairKioskHandoffFromAuthoritativeStorage(request, correlationId, 'reconciliation_worker_race');
    }
    if (current?.payment_attempt_status !== 'approved') {
      return { status: publicKioskPaymentStatus(current).status };
    }

    // Claim one bounded publish sequence immediately before its first provider
    // write. A duplicate worker can never start another sequence for the same
    // approved payment attempt.
    if (!publishSequenceClaimed && offsetMs >= KIOSK_PUBLISH_SETTLEMENT_DELAY_MS) {
      publishSequenceClaimed = true;
      publishRetryAllowed = await claimKioskPublishAttempt(request);
    }

    // A definitive HTTP 409 means ROLLER rejected the publish while the
    // terminal payment was still settling. Retry only that explicit conflict;
    // a transport-ambiguous response or any other status permanently stops
    // provider writes and leaves the worker on authoritative readback.
    if (publishRetryAllowed && KIOSK_PUBLISH_RETRY_OFFSETS_MS.includes(offsetMs)) {
      try {
        const publishResult = await publishNoPaymentDraft(config, token, claimed.roller_draft_unique_id);
        const retryableConflict = publishResult.status === 409;
        const resultCode = publishResult.ok
          ? 'accepted'
          : retryableConflict
            ? 'provider_conflict_retryable'
            : 'provider_rejected';
        publishRetryAllowed = retryableConflict;
        await recordKioskPublishResult(request, publishResult.status, resultCode);
        emitKioskPublishMetric(publishResult.status, resultCode);
        if (publishResult.ok) {
          const candidate = normalizeBookingReadback(publishResult.body, {
            requireTickets: existing.flow_type !== 'add_product',
          });
          if (candidate?.rollerUniqueId && !readbackIdentifiers.includes(candidate.rollerUniqueId)) {
            readbackIdentifiers.push(candidate.rollerUniqueId);
          }
          if (candidate?.bookingReference && !readbackIdentifiers.includes(candidate.bookingReference)) {
            readbackIdentifiers.push(candidate.bookingReference);
          }
          if (candidate?.confirmed) publishReadback = candidate;
        }
      } catch {
        publishRetryAllowed = false;
        await recordKioskPublishResult(request, 0, 'transport_unknown');
        emitKioskPublishMetric(0, 'transport_unknown');
      }
    }

    await recordKioskReconciliationAttempt(request, 'readback_pending');
    let readback = publishReadback;
    publishReadback = null;
    for (const identifier of readbackIdentifiers) {
      if (readback) break;
      try {
        const result = await getRollerJson(config, token, `/bookings/${encodeURIComponent(identifier)}`);
        const candidate = result.ok
          ? normalizeBookingReadback(result.body, {
              requireTickets: existing.flow_type !== 'add_product',
            })
          : null;
        if (candidate?.confirmed) readback = candidate;
      } catch {
        // A provider transport failure is ambiguous. The same approved attempt is
        // read again; no new payment or publish request is created.
      }
    }

    if (readback) {
      await persistKioskReconciliationBookingSnapshot(existing, readback);
      const confirmed = existing.flow_type === 'add_product'
        ? await confirmKioskAddProductReconciliation(request, readback)
        : await confirmKioskReconciliation(request, readback);
      const attachmentComplete = existing.flow_type === 'add_product'
        ? Boolean(confirmed?.add_on_group_id)
        : Number(confirmed?.attached_session_count) === 1 && Number(confirmed?.attached_token_count) === 1;
      if (!confirmed || !attachmentComplete) {
        await markKioskReconciliationNeedsStaff(
          request,
          existing.flow_type === 'add_product'
            ? 'authoritative_add_product_identity_missing'
            : 'authoritative_handoff_attachment_missing',
        );
        emitKioskReconciliationMetric('needs_staff', index + 1, Date.now() - startedAt);
        return { status: 'needs_staff' };
      }
      await writeBookingEventLog({
        correlationId,
        eventType: 'booking.kiosk_terminal_reconciled',
        payload: {
          attemptCount: Number(confirmed?.reconciliation_attempt_count ?? index + 1),
          elapsedMs: Date.now() - startedAt,
          paymentChannel: 'card_present',
        },
        subjectRef: request.prepaymentDraftId,
        summary: 'ROLLER kiosk terminal payment and booking were reconciled.',
      });
      emitKioskReconciliationMetric(
        'confirmed',
        Number(confirmed?.reconciliation_attempt_count ?? index + 1),
        Date.now() - approvedAt,
      );
      return { status: 'confirmed' };
    }

    emitKioskReconciliationMetric('pending', index + 1, Date.now() - startedAt);
  }

  await markKioskReconciliationNeedsStaff(request, 'confirmation_timeout');
  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.kiosk_terminal_reconciliation_exhausted',
    payload: {
      attemptCount: KIOSK_RECONCILIATION_OFFSETS_MS.length,
      elapsedMs: Date.now() - startedAt,
    },
    subjectRef: request.prepaymentDraftId,
    summary: 'Kiosk payment was approved but booking confirmation exceeded the bounded retry window.',
  });
  emitKioskReconciliationMetric(
    'needs_staff',
    KIOSK_RECONCILIATION_OFFSETS_MS.length,
    Date.now() - startedAt,
  );
  return { status: 'needs_staff' };
}

async function handleKioskAuthoritativeConfirmation(detail, correlationId) {
  const request = {
    bookingReference: stringOrNull(detail?.bookingReference),
    externalId: stringOrNull(detail?.externalId),
    paymentAttemptId: stringOrNull(detail?.paymentAttemptId),
    prepaymentDraftId: stringOrNull(detail?.prepaymentDraftId),
    rollerUniqueId: stringOrNull(detail?.rollerUniqueId),
  };
  if (
    !/^jypd_[a-f0-9]{18}$/.test(request.prepaymentDraftId ?? '') ||
    !/^jytp_[a-f0-9]{18}$/.test(request.paymentAttemptId ?? '') ||
    !request.externalId ||
    request.externalId.length > 64 ||
    !request.rollerUniqueId ||
    request.rollerUniqueId.length > 128 ||
    !request.bookingReference ||
    request.bookingReference.length > 128
  ) {
    return { status: 'invalid_authoritative_confirmation_request' };
  }

  return repairKioskHandoffFromAuthoritativeStorage(
    request,
    correlationId,
    stringOrNull(detail?.trigger) || 'authoritative_confirmation',
  );
}

async function repairKioskHandoffFromAuthoritativeStorage(request, correlationId, trigger) {
  const candidates = await findKioskAuthoritativeConfirmationCandidates(request);
  const reason = validateKioskAuthoritativeConfirmationCandidates(candidates, request);
  if (reason) {
    await markKioskReconciliationNeedsStaff(request, reason);
    emitKioskReconciliationMetric('needs_staff', 0, 0);
    return { status: 'needs_staff', reason };
  }

  const candidate = candidates[0];
  const readback = {
    bookingReference: candidate.booking_reference,
    rollerUniqueId: candidate.roller_unique_id,
    ticketIds: parseJsonOrNull(candidate.ticket_ids) ?? [],
  };
  const confirmed = await confirmKioskReconciliation(request, readback);
  if (!confirmed || Number(confirmed.attached_session_count) !== 1 || Number(confirmed.attached_token_count) !== 1) {
    await markKioskReconciliationNeedsStaff(request, 'authoritative_handoff_attachment_missing');
    emitKioskReconciliationMetric('needs_staff', 0, 0);
    return { status: 'needs_staff', reason: 'authoritative_handoff_attachment_missing' };
  }

  await writeBookingEventLog({
    correlationId,
    eventType: 'booking.kiosk_handoff_authoritatively_attached',
    payload: {
      paymentChannel: 'card_present',
      trigger: String(trigger ?? 'authoritative_confirmation').slice(0, 64),
    },
    subjectRef: request.prepaymentDraftId,
    summary: 'A paid ROLLER booking was authoritatively attached to its existing kiosk Handoff session.',
  });
  emitKioskReconciliationMetric('confirmed', Number(confirmed.reconciliation_attempt_count ?? 0), 0);
  return { status: 'confirmed' };
}

async function findKioskAuthoritativeConfirmationCandidates(request) {
  const result = await executeStatement(
    `SELECT
       draft.prepayment_draft_id,
       draft.payment_attempt_id,
       draft.payment_attempt_status,
       draft.external_id,
       draft.roller_env AS draft_roller_env,
       draft.booking_date::text AS draft_booking_date,
       draft.total_cents AS draft_total_cents,
       draft.currency AS draft_currency,
       booking.roller_unique_id,
       booking.booking_reference,
       booking.roller_env AS booking_roller_env,
       booking.venue_id,
       booking.booking_status,
       booking.payment_status,
       booking.amount_owing_cents,
       booking.total_cents AS booking_total_cents,
       booking.currency AS booking_currency,
       booking.booking_date::text AS booking_date,
       booking.source_last_updated_by,
       booking.last_seen_from_roller_at::text AS last_seen_from_roller_at,
       booking.freshness_status,
       booking.is_tombstoned,
       booking.normalized_summary ->> 'externalId' AS booking_external_id,
       COALESCE((
         SELECT jsonb_agg(ticket.ticket_id ORDER BY ticket.ticket_id)
         FROM jumpyard.roller_booking_tickets AS ticket
         WHERE ticket.roller_unique_id = booking.roller_unique_id
       ), '[]'::jsonb)::text AS ticket_ids
     FROM jumpyard.prepayment_booking_drafts AS draft
     JOIN jumpyard.roller_bookings AS booking
       ON booking.roller_env = draft.roller_env
      AND booking.normalized_summary ->> 'externalId' = draft.external_id
     WHERE draft.prepayment_draft_id = :prepaymentDraftId
       AND draft.payment_attempt_id = :paymentAttemptId
       AND draft.payment_channel = 'card_present'
       AND draft.flow_type = 'new_booking'
       AND draft.payment_attempt_status IN ('approved', 'reconciled')
     ORDER BY booking.last_seen_from_roller_at DESC NULLS LAST
     LIMIT 2`,
    [
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return mappedRows(result);
}

function validateKioskAuthoritativeConfirmationCandidates(candidates, request) {
  if (candidates.length === 0) return 'authoritative_booking_not_found';
  if (candidates.length !== 1) return 'authoritative_booking_ambiguous';

  const candidate = candidates[0];
  const ticketIds = parseJsonOrNull(candidate.ticket_ids);
  const expectedVenueId =
    stringOrNull(process.env.T0176_FULL_FLOW_VENUE_ID) ||
    stringOrNull(process.env.ROLLER_DATA_SYNC_VENUE_ID) ||
    stringOrNull(process.env.STAFF_IDENTITY_VENUE_ID);
  const paymentStatus = stringOrNull(candidate.payment_status);
  const bookingStatus = stringOrNull(candidate.booking_status);
  const unsafeStatus = /pending|unpaid|partial|cancel|fail|draft/i.test(`${paymentStatus ?? ''} ${bookingStatus ?? ''}`);

  if (request.externalId && candidate.external_id !== request.externalId) return 'authoritative_external_id_mismatch';
  if (request.rollerUniqueId && candidate.roller_unique_id !== request.rollerUniqueId) {
    return 'authoritative_booking_id_mismatch';
  }
  if (request.bookingReference && candidate.booking_reference !== request.bookingReference) {
    return 'authoritative_booking_reference_mismatch';
  }
  if (!candidate.external_id || candidate.booking_external_id !== candidate.external_id) {
    return 'authoritative_external_id_mismatch';
  }
  if (candidate.booking_roller_env !== candidate.draft_roller_env) return 'authoritative_environment_mismatch';
  if (!expectedVenueId) return 'authoritative_venue_configuration_missing';
  if (candidate.venue_id !== expectedVenueId) return 'authoritative_venue_mismatch';
  if (
    !candidate.booking_date ||
    !candidate.draft_booking_date ||
    candidate.booking_date !== candidate.draft_booking_date
  ) {
    return 'authoritative_booking_date_mismatch';
  }
  if (
    candidate.booking_total_cents === null ||
    candidate.booking_total_cents === undefined ||
    candidate.draft_total_cents === null ||
    candidate.draft_total_cents === undefined ||
    Number(candidate.booking_total_cents) !== Number(candidate.draft_total_cents)
  ) {
    return 'authoritative_total_mismatch';
  }
  if (
    candidate.booking_currency &&
    candidate.draft_currency &&
    candidate.booking_currency !== candidate.draft_currency
  ) {
    return 'authoritative_currency_mismatch';
  }
  if (
    candidate.amount_owing_cents === null ||
    candidate.amount_owing_cents === undefined ||
    Number(candidate.amount_owing_cents) !== 0 ||
    !paymentStatus ||
    unsafeStatus
  ) {
    return 'authoritative_payment_not_settled';
  }
  if (candidate.is_tombstoned || candidate.freshness_status !== 'fresh' || !candidate.last_seen_from_roller_at) {
    return 'authoritative_booking_not_fresh';
  }
  if (!['roller_live_lookup', 'roller_webhook_enrichment'].includes(candidate.source_last_updated_by)) {
    return 'authoritative_source_invalid';
  }
  if (!Array.isArray(ticketIds) || ticketIds.length === 0 || ticketIds.some((ticketId) => !stringOrNull(ticketId))) {
    return 'authoritative_tickets_missing';
  }
  return null;
}

function isKioskHandoffAuthoritativelyAttached(row) {
  const ticketIds = parseJsonOrNull(row?.selected_ticket_ids);
  return Boolean(
    stringOrNull(row?.checkin_session_id) &&
    stringOrNull(row?.confirmed_roller_unique_id) &&
    stringOrNull(row?.confirmed_booking_reference) &&
    stringOrNull(row?.session_booking_sync_status) === 'confirmed' &&
    Array.isArray(ticketIds) &&
    ticketIds.length > 0
  );
}

async function claimKioskReconciliation(request) {
  const result = await executeStatement(
    `UPDATE jumpyard.prepayment_booking_drafts
     SET reconciliation_started_at = COALESCE(reconciliation_started_at, now()),
         reconciliation_claimed_at = now(),
         booking_confirmation_status = 'pending',
         updated_at = now()
     WHERE prepayment_draft_id = :prepaymentDraftId
       AND payment_attempt_id = :paymentAttemptId
       AND payment_attempt_status = 'approved'
       AND booking_confirmation_status = 'pending'
       AND (
         reconciliation_claimed_at IS NULL
         OR reconciliation_claimed_at < now() - interval '3 minutes'
       )
     RETURNING roller_draft_unique_id, payment_approved_at::text AS payment_approved_at`,
    [
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return firstMappedRow(result) ?? null;
}

async function claimKioskPublishAttempt(request) {
  const result = await executeStatement(
    `UPDATE jumpyard.prepayment_booking_drafts
     SET publish_attempted_at = now(),
         reconciliation_last_result = 'publish_dispatched',
         updated_at = now()
     WHERE prepayment_draft_id = :prepaymentDraftId
       AND payment_attempt_id = :paymentAttemptId
       AND payment_attempt_status = 'approved'
       AND publish_attempted_at IS NULL
     RETURNING prepayment_draft_id`,
    [
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return Boolean(firstMappedRow(result));
}

async function recordKioskPublishResult(request, statusCode, resultCode) {
  await executeStatement(
    `UPDATE jumpyard.prepayment_booking_drafts
     SET publish_http_status = :statusCode,
         reconciliation_last_result = :resultCode,
         updated_at = now()
     WHERE prepayment_draft_id = :prepaymentDraftId
       AND payment_attempt_id = :paymentAttemptId`,
    [
      integerParameter('statusCode', statusCode),
      stringParameter('resultCode', resultCode),
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
}

async function recordKioskReconciliationAttempt(request, resultCode) {
  await executeStatement(
    `UPDATE jumpyard.prepayment_booking_drafts
     SET reconciliation_attempt_count = reconciliation_attempt_count + 1,
         reconciliation_last_attempt_at = now(),
         reconciliation_last_result = :resultCode,
         updated_at = now()
     WHERE prepayment_draft_id = :prepaymentDraftId
       AND payment_attempt_id = :paymentAttemptId
       AND payment_attempt_status = 'approved'`,
    [
      stringParameter('resultCode', resultCode),
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
}

async function confirmKioskReconciliation(request, readback) {
  const result = await executeStatement(
    `WITH eligible AS (
       SELECT draft.reconciliation_attempt_count
       FROM jumpyard.prepayment_booking_drafts AS draft
       WHERE draft.prepayment_draft_id = :prepaymentDraftId
         AND draft.payment_attempt_id = :paymentAttemptId
         AND draft.payment_channel = 'card_present'
         AND draft.flow_type = 'new_booking'
         AND draft.payment_attempt_status IN ('approved', 'reconciled')
         AND (
           SELECT count(*)
           FROM jumpyard.checkin_sessions AS session
           WHERE session.source_lookup_ref = draft.prepayment_draft_id
             AND session.session_summary ->> 'paymentAttemptId' = draft.payment_attempt_id
         ) = 1
         AND (
           SELECT count(*)
           FROM jumpyard.checkin_tokens AS token
           WHERE token.token_hash = :guestAccessTokenHash
         ) = 1
     ), confirmed AS (
       UPDATE jumpyard.prepayment_booking_drafts
       SET status = 'published',
           payment_attempt_status = 'reconciled',
           booking_confirmation_status = 'confirmed',
           roller_booking_reference = :bookingReference,
           amount_owing_cents = 0,
           reconciliation_completed_at = COALESCE(reconciliation_completed_at, now()),
           reconciliation_last_result = 'confirmed',
           updated_at = now()
       WHERE prepayment_draft_id = :prepaymentDraftId
         AND payment_attempt_id = :paymentAttemptId
         AND payment_attempt_status IN ('approved', 'reconciled')
         AND EXISTS (SELECT 1 FROM eligible)
       RETURNING reconciliation_attempt_count
     ), attached_session AS (
       UPDATE jumpyard.checkin_sessions
       SET roller_unique_id = :rollerUniqueId,
           booking_reference = :bookingReference,
           selected_ticket_ids = CAST(:selectedTicketIds AS jsonb),
           updated_at = now(),
           session_summary = session_summary || CAST(:sessionSummary AS jsonb)
        WHERE source_lookup_ref = :prepaymentDraftId
          AND session_summary ->> 'paymentAttemptId' = :paymentAttemptId
          AND EXISTS (SELECT 1 FROM confirmed)
        RETURNING checkin_session_id
     ), attached_guest_access AS (
       UPDATE jumpyard.checkin_tokens
        SET roller_unique_id = :rollerUniqueId
        WHERE token_hash = :guestAccessTokenHash
          AND EXISTS (SELECT 1 FROM confirmed)
        RETURNING token_hash
     )
     SELECT
       reconciliation_attempt_count,
       (SELECT count(*) FROM attached_session) AS attached_session_count,
       (SELECT count(*) FROM attached_guest_access) AS attached_token_count
     FROM confirmed`,
    [
      stringParameter('bookingReference', readback.bookingReference),
      stringParameter('rollerUniqueId', readback.rollerUniqueId),
      stringParameter('guestAccessTokenHash', hashString(request.paymentAttemptId)),
      stringParameter('selectedTicketIds', JSON.stringify(readback.ticketIds)),
      stringParameter('sessionSummary', JSON.stringify({
        bookingSyncStatus: 'confirmed',
        rollerBookingReference: readback.bookingReference,
        rollerUniqueId: readback.rollerUniqueId,
        ticketCount: readback.ticketIds.length,
      })),
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return firstMappedRow(result) ?? null;
}

async function confirmKioskAddProductReconciliation(request, readback) {
  const result = await executeStatement(
    `WITH confirmed_draft AS (
       UPDATE jumpyard.prepayment_booking_drafts AS draft
       SET status = 'published',
           payment_attempt_status = 'reconciled',
           booking_confirmation_status = 'confirmed',
           roller_booking_reference = :bookingReference,
           amount_owing_cents = 0,
           reconciliation_completed_at = COALESCE(draft.reconciliation_completed_at, now()),
           reconciliation_last_result = 'confirmed',
           updated_at = now()
       WHERE draft.prepayment_draft_id = :prepaymentDraftId
         AND draft.payment_attempt_id = :paymentAttemptId
         AND draft.payment_channel = 'card_present'
         AND draft.flow_type = 'add_product'
         AND draft.add_on_group_id IS NOT NULL
         AND draft.payment_attempt_status IN ('approved', 'reconciled')
       RETURNING
         draft.prepayment_draft_id,
         draft.reconciliation_attempt_count,
         draft.add_on_group_id,
         draft.roller_draft_unique_id,
         draft.flow_type,
         draft.original_roller_unique_id,
         draft.booking_date,
         draft.payment_attempt_status,
         draft.booking_confirmation_status
     ), ${linkedAddOnEffectiveSyncCte('confirmed_draft')}, updated_session AS (
       UPDATE jumpyard.checkin_sessions AS session
       SET updated_at = now(),
           session_summary = session.session_summary || jsonb_build_object(
             'bookingSyncStatus', sync.booking_sync_status,
             'linkedAddOnSyncSource', 'kiosk_terminal_add_product'
           )
       FROM effective_sync AS sync
       WHERE session.roller_unique_id = sync.original_roller_unique_id
         AND session.visit_date IS NOT DISTINCT FROM sync.booking_date
         AND session.status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
       RETURNING session.checkin_session_id
     )
     SELECT
       confirmed_draft.*,
       (SELECT count(*) FROM updated_session)::int AS linked_add_on_session_count
     FROM confirmed_draft`,
    [
      stringParameter('bookingReference', readback.bookingReference),
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return firstMappedRow(result) ?? null;
}

async function persistKioskReconciliationBookingSnapshot(existing, readback) {
  const enrichedItems = await enrichKioskReadbackItems(existing, readback.items);

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
       currency,
       booking_date,
       start_time,
       source_last_updated_by,
       last_seen_from_roller_at,
       freshness_status,
       normalized_summary
     )
     VALUES (
       :rollerUniqueId,
       :bookingReference,
       :rollerEnv,
       :venueId,
       'confirmed',
       :paymentStatus,
       0,
       :totalCents,
       :currency,
       CAST(:bookingDate AS date),
       CAST(:startTime AS time),
       'kiosk_payment_reconciliation',
       now(),
       'fresh',
       CAST(:normalizedSummary AS jsonb)
     )
     ON CONFLICT (roller_unique_id) DO UPDATE SET
       booking_reference = EXCLUDED.booking_reference,
       booking_status = EXCLUDED.booking_status,
       payment_status = EXCLUDED.payment_status,
       amount_owing_cents = EXCLUDED.amount_owing_cents,
       source_last_updated_by = EXCLUDED.source_last_updated_by,
       source_last_updated_at = now(),
       last_seen_from_roller_at = EXCLUDED.last_seen_from_roller_at,
       freshness_status = EXCLUDED.freshness_status,
       normalized_summary = jumpyard.roller_bookings.normalized_summary || EXCLUDED.normalized_summary,
       updated_at = now()`,
    [
      stringParameter('rollerUniqueId', readback.rollerUniqueId),
      stringParameter('bookingReference', readback.bookingReference),
      stringParameter('rollerEnv', existing.roller_env),
      stringParameter(
        'venueId',
        stringOrNull(process.env.T0176_FULL_FLOW_VENUE_ID) ||
          stringOrNull(process.env.ROLLER_DATA_SYNC_VENUE_ID) ||
          stringOrNull(process.env.STAFF_IDENTITY_VENUE_ID),
      ),
      stringParameter('paymentStatus', readback.paymentStatus || 'paid'),
      integerParameter('totalCents', Number(existing.total_cents ?? 0)),
      stringParameter('currency', existing.currency || KIOSK_PAYMENT_CURRENCY),
      stringParameter('bookingDate', existing.booking_date),
      stringParameter('startTime', existing.start_time),
      stringParameter('normalizedSummary', JSON.stringify({
        bookingSyncStatus: 'confirmed',
        paymentAttemptId: existing.payment_attempt_id,
        prepaymentDraftId: existing.prepayment_draft_id,
      })),
    ],
  );

  for (const item of enrichedItems) {
    const bookingItemKey = `jybi_${hashString(`${readback.rollerUniqueId}:${item.bookingItemId || item.itemIndex}`).slice(0, 32)}`;
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
         product_id = EXCLUDED.product_id,
         parent_product_id = EXCLUDED.parent_product_id,
         product_name = EXCLUDED.product_name,
         parent_product_name = EXCLUDED.parent_product_name,
         quantity = EXCLUDED.quantity,
         booking_date = EXCLUDED.booking_date,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         item_summary = EXCLUDED.item_summary,
         updated_at = now()`,
      [
        stringParameter('bookingItemKey', bookingItemKey),
        stringParameter('rollerUniqueId', readback.rollerUniqueId),
        stringParameter('bookingItemId', item.bookingItemId),
        stringParameter('productId', item.productId),
        stringParameter('parentProductId', item.parentProductId),
        stringParameter('productName', item.productName),
        stringParameter('parentProductName', item.parentProductName),
        integerParameter('quantity', Math.max(1, Math.floor(Number(item.quantity ?? 1)))),
        stringParameter('bookingDate', item.bookingDate || existing.booking_date),
        stringParameter('startTime', item.startTime || existing.start_time),
        stringParameter('endTime', item.endTime),
        stringParameter('itemSummary', JSON.stringify(item)),
      ],
    );

    for (const ticket of item.tickets) {
      await executeStatement(
        `INSERT INTO jumpyard.roller_booking_tickets (
           ticket_id,
           roller_unique_id,
           booking_item_key,
           booking_item_id,
           redeem_status_last_seen,
           last_seen_from_roller_at
         )
         VALUES (
           :ticketId,
           :rollerUniqueId,
           :bookingItemKey,
           :bookingItemId,
           :redeemStatus,
           now()
         )
         ON CONFLICT (ticket_id) DO UPDATE SET
           roller_unique_id = EXCLUDED.roller_unique_id,
           booking_item_key = EXCLUDED.booking_item_key,
           booking_item_id = EXCLUDED.booking_item_id,
           redeem_status_last_seen = EXCLUDED.redeem_status_last_seen,
           last_seen_from_roller_at = EXCLUDED.last_seen_from_roller_at,
           updated_at = now()`,
        [
          stringParameter('ticketId', ticket.ticketId),
          stringParameter('rollerUniqueId', readback.rollerUniqueId),
          stringParameter('bookingItemKey', bookingItemKey),
          stringParameter('bookingItemId', item.bookingItemId),
          stringParameter('redeemStatus', ticket.redeemStatus),
        ],
      );
    }
  }
}

async function markKioskReconciliationNeedsStaff(request, reason) {
  const result = await executeStatement(
    `WITH updated_draft AS (
       UPDATE jumpyard.prepayment_booking_drafts
       SET booking_confirmation_status = CASE
             WHEN booking_confirmation_status = 'confirmed' THEN booking_confirmation_status
             ELSE 'needs_staff'
           END,
           reconciliation_last_result = CASE
             WHEN booking_confirmation_status = 'confirmed' THEN reconciliation_last_result
             ELSE :reason
           END,
           updated_at = now()
       WHERE prepayment_draft_id = :prepaymentDraftId
         AND payment_attempt_id = :paymentAttemptId
       RETURNING
         prepayment_draft_id,
         payment_attempt_id,
         flow_type,
         original_roller_unique_id,
         booking_date,
         payment_attempt_status,
         status,
         booking_confirmation_status,
         roller_booking_reference
     ), ${linkedAddOnEffectiveSyncCte('updated_draft')}, updated_provisional_session AS (
       UPDATE jumpyard.checkin_sessions AS session
       SET updated_at = now(),
           session_summary = session.session_summary || jsonb_build_object(
             'bookingSyncStatus', 'needs_staff',
             'reconciliationReason', :reason
           )
       FROM updated_draft AS draft
       WHERE session.source_lookup_ref = draft.prepayment_draft_id
         AND session.session_summary ->> 'paymentAttemptId' = draft.payment_attempt_id
         AND draft.booking_confirmation_status <> 'confirmed'
         AND COALESCE(session.session_summary ->> 'bookingSyncStatus', '') <> 'confirmed'
       RETURNING session.checkin_session_id
     ), updated_linked_session AS (
       UPDATE jumpyard.checkin_sessions AS session
       SET updated_at = now(),
           session_summary = session.session_summary || jsonb_build_object(
             'bookingSyncStatus', sync.booking_sync_status,
             'linkedAddOnSyncSource', 'kiosk_terminal_add_product',
             'reconciliationReason', :reason
           )
       FROM effective_sync AS sync
       WHERE session.roller_unique_id = sync.original_roller_unique_id
         AND session.visit_date IS NOT DISTINCT FROM sync.booking_date
         AND session.status IN ('guest_in_progress', 'ready_for_staff', 'staff_in_progress')
       RETURNING session.checkin_session_id
     )
     SELECT
       updated_draft.*,
       (SELECT count(*) FROM updated_provisional_session)::int AS provisional_session_count,
       (SELECT count(*) FROM updated_linked_session)::int AS linked_add_on_session_count
     FROM updated_draft`,
    [
      stringParameter('reason', reason),
      stringParameter('prepaymentDraftId', request.prepaymentDraftId),
      stringParameter('paymentAttemptId', request.paymentAttemptId),
    ],
  );
  return firstMappedRow(result) ?? null;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
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

  const fullFlowItemGate = validateT0176FullFlowRequestItemDates(request.items);
  if (!fullFlowItemGate.ok) {
    return parkTestGateBlockedResponse(correlationId, fullFlowItemGate);
  }

  const smokeGate = validateT0162AddOnSmokeAccess(bookingReference);
  if (!smokeGate.ok) {
    return parkTestGateBlockedResponse(correlationId, smokeGate);
  }

  const guestAccess = await verifyGuestAccessForBooking(event, bookingReference);
  if (!guestAccess.ok) {
    return guestAccessErrorResponse(correlationId, guestAccess);
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
  const fullFlowGate = validateT0176FullFlowOriginalBookingAccess(original);
  if (!fullFlowGate.ok) {
    return parkTestGateBlockedResponse(correlationId, fullFlowGate);
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
    summary: 'Roller add-product quote succeeded.',
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

  const fullFlowItemGate = validateT0176FullFlowRequestItemDates(request.items);
  if (!fullFlowItemGate.ok) {
    return parkTestGateBlockedResponse(correlationId, fullFlowItemGate);
  }

  const smokeGate = validateT0162AddOnSmokeAccess(bookingReference);
  if (!smokeGate.ok) {
    return parkTestGateBlockedResponse(correlationId, smokeGate);
  }

  if (!isAddProductDraftWriteEnabled()) {
    return safetyGateBlockedResponse(correlationId, 'roller_booking_draft_writes_disabled');
  }

  const guestAccess = await verifyGuestAccessForBooking(event, bookingReference);
  if (!guestAccess.ok) {
    return guestAccessErrorResponse(correlationId, guestAccess);
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
  const fullFlowGate = validateT0176FullFlowOriginalBookingAccess(original);
  if (!fullFlowGate.ok) {
    return parkTestGateBlockedResponse(correlationId, fullFlowGate);
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
    channel: request.channel,
    customer: maskCustomerForHash(request.customer),
    discounts: hashDiscountsForHash(request.discounts),
    giftCards: hashGiftCardsForHash(request.giftCards),
    items: request.items,
    operation: 'booking_add_product_draft_create',
    originalBookingReference: original.bookingReference,
    originalRollerUniqueId: original.rollerUniqueId,
    paymentTerminalAlias: request.paymentTerminalAlias,
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

  const terminalSelection = resolveKioskPaymentTerminal(config, request);
  if (terminalSelection.error) {
    await completeIdempotencyKey(request.idempotencyKey, 'failed', terminalSelection.error.code);
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      error: terminalSelection.error,
    });
  }
  request.paymentTerminal = terminalSelection.paymentTerminal;

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
  let kioskQuoteResult = null;
  if (terminalSelection.enabled) {
    const kioskQuotePayload = buildKioskQuotePayload(payload);
    kioskQuoteResult = await postRollerJson(config, token, '/bookings/draft/costs', kioskQuotePayload);
    if (!kioskQuoteResult.ok) {
      await completeIdempotencyKey(request.idempotencyKey, 'failed', `roller_quote_http_${kioskQuoteResult.status}`);
      return jsonResponse(kioskQuoteResult.status === 409 ? 409 : 502, correlationId, {
        status: kioskQuoteResult.status === 409 ? 'rejected' : 'roller_error',
        error: {
          code: 'roller_kiosk_add_product_quote_failed',
          message: `ROLLER kiosk add-product quote failed with HTTP ${kioskQuoteResult.status}.`,
        },
      });
    }
  }
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
        error: summarizeRollerError(rollerResult.body, request),
      },
    });
  }

  const draft = normalizeDraftResponse(rollerResult.body, request.items.length, request);
  if (terminalSelection.enabled) {
    const verification = verifyKioskDraftPayment({
      draftBody: rollerResult.body,
      paymentJwt: rollerResult.body?.paymentJwt,
      quoteBody: kioskQuoteResult.body,
    });
    if (!verification.ok) {
      await completeIdempotencyKey(request.idempotencyKey, 'failed', verification.error.code);
      await writeBookingEventLog({
        correlationId,
        eventType: 'booking.kiosk_add_product_terminal_contract_failed',
        payload: {
          endpoint: 'POST /bookings/draft',
          itemCount: request.items.length,
          reason: verification.error.code,
        },
        subjectRef: draft.uniqueId || payload.externalId,
        summary: 'ROLLER kiosk add-product terminal draft failed amount or currency verification.',
      });
      return jsonResponse(502, correlationId, {
        status: 'roller_error',
        error: verification.error,
      });
    }
  }
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
      paymentChannel: terminalSelection.enabled ? 'card_present' : 'ecommerce',
      prepaymentDraftId: prepaymentDraft.prepaymentDraftId,
      originalBookingReference: original.bookingReference,
      originalRollerUniqueId: original.rollerUniqueId,
      rollerDraftUniqueId: draft.uniqueId,
      rollerEnvironment: config.env,
      sendConfirmations: request.sendConfirmations === true,
      total: draft.costs.total,
      amountOwing: draft.costs.amountOwing,
    },
    subjectRef: original.bookingReference,
    summary: 'Roller add-product draft booking created and linked.',
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
      terminal: terminalSelection.enabled
        ? {
            apiUrl: paymentConfig.apiUrl,
            available: Boolean(paymentConfig.apiUrl && jwtSummary.present),
            currency: KIOSK_PAYMENT_CURRENCY,
          }
        : undefined,
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
    channel: body.channel === 'kiosk' ? 'kiosk' : body.channel ? 'unsupported' : null,
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
    paymentTerminalAlias: stringOrNull(body.paymentTerminalAlias),
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
    channel: body.channel === 'kiosk' ? 'kiosk' : body.channel ? 'unsupported' : null,
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
    paymentTerminalAlias: stringOrNull(body.paymentTerminalAlias),
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
    requiresAvailability: item?.requiresAvailability === true,
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

function hashGiftCardsForHash(giftCards) {
  return giftCards.map((giftCard) => ({
    giftCardNumberHash: hashString(giftCard.giftCardNumber),
  }));
}

function hashDiscountsForHash(discounts) {
  return discounts.map((discount) => ({
    amount: discount.amount,
    codeHash: discount.code ? hashString(discount.code) : null,
    percentage: discount.percentage,
  }));
}

function normalizeDiscountCodeSummary(body, request) {
  const requestedCodes = Array.isArray(request?.discounts)
    ? request.discounts.map((discount) => stringOrNull(discount?.code)).filter(Boolean)
    : [];
  const costs = extractCostsObject(body);
  const totalApplied = numberOrNull(costs.discount) ?? 0;
  const applied = requestedCodes.length > 0 && totalApplied > 0
    ? [
        {
          amountDeducted: totalApplied,
          maskedCode: maskDiscountCode(requestedCodes[0]),
        },
      ]
    : [];
  const errors = requestedCodes.length > 0 && totalApplied <= 0
    ? [
        {
          code: 'discount_code_not_applied',
          message: 'Klippkortskoden kunde inte användas.',
        },
      ]
    : [];

  return {
    requestedCount: requestedCodes.length,
    appliedCount: applied.length,
    totalApplied: totalApplied > 0 ? totalApplied : 0,
    applied,
    errors,
  };
}

function normalizeGiftCardSummary(body, request) {
  const requestedGiftCards = Array.isArray(request?.giftCards) ? request.giftCards : [];
  const costs = extractCostsObject(body);
  const appliedSource = asArray(body?.giftCards).length > 0 ? asArray(body?.giftCards) : asArray(costs.giftCards);
  const errorsSource = [...asArray(body?.giftCardErrors), ...asArray(costs.giftCardErrors)];
  const applied = appliedSource
    .map((giftCard) => {
      const amountDeducted = numberOrNull(
        giftCard?.amountDeducted ??
          giftCard?.amountDeducuted ??
          giftCard?.amountDeductedFromBooking ??
          giftCard?.amount
      );
      const maskedNumber = maskGiftCardNumber(
        stringOrNull(giftCard?.giftCardNumber ?? giftCard?.number ?? giftCard?.transactionId)
      );

      return {
        amountDeducted,
        maskedNumber,
      };
    })
    .filter((giftCard) => giftCard.amountDeducted !== null || giftCard.maskedNumber !== null);

  const directTotalApplied = applied.reduce(
    (total, giftCard) => total + (giftCard.amountDeducted !== null ? giftCard.amountDeducted : 0),
    0,
  );
  const inferredTotalApplied =
    requestedGiftCards.length > 0 && errorsSource.length === 0 && directTotalApplied === 0
      ? inferGiftCardAppliedAmount(costs)
      : null;

  return {
    requestedCount: requestedGiftCards.length,
    appliedCount: applied.length,
    totalApplied: directTotalApplied > 0 ? directTotalApplied : inferredTotalApplied,
    applied,
    errors: errorsSource.map((error) => normalizeGiftCardError(error, requestedGiftCards)),
  };
}

function extractCostsObject(body) {
  if (body?.costs && typeof body.costs === 'object') return body.costs;
  if (body?.bookingCosts && typeof body.bookingCosts === 'object') return body.bookingCosts;
  return body && typeof body === 'object' ? body : {};
}

function inferGiftCardAppliedAmount(costs) {
  const total = numberOrNull(costs.total);
  const amountOwing = numberOrNull(costs.amountOwing);
  const discount = numberOrNull(costs.discount) ?? 0;
  if (total === null || amountOwing === null) return null;

  return Math.max(0, total - amountOwing - discount);
}

function isZeroAmount(value) {
  return value !== null && Number.isFinite(value) && Math.abs(value) < 0.01;
}

function normalizeGiftCardError(error, requestedGiftCards) {
  const message =
    stringOrNull(error?.message ?? error?.error ?? error?.title ?? error?.name) ||
    'Gift card could not be applied.';

  return {
    code: stringOrNull(error?.code ?? error?.errorCode),
    message: redactGiftCardSecrets(message, requestedGiftCards),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function maskGiftCardNumber(value) {
  const normalized = stringOrNull(value);
  if (!normalized) return null;
  const compact = normalized.replace(/\s/g, '');
  const last4 = compact.slice(-4);
  return last4 ? `**** ${last4}` : '****';
}

function maskDiscountCode(value) {
  const normalized = stringOrNull(value);
  if (!normalized) return null;
  const compact = normalized.replace(/\s/g, '');
  const last4 = compact.slice(-4);
  return last4 ? `**** ${last4}` : '****';
}

function redactGiftCardSecrets(value, requestedGiftCards) {
  let redacted = stringOrNull(value) || '';
  for (const giftCard of requestedGiftCards) {
    const giftCardNumber = stringOrNull(giftCard?.giftCardNumber);
    if (!giftCardNumber) continue;
    redacted = redacted.split(giftCardNumber).join(maskGiftCardNumber(giftCardNumber));
  }
  return redacted;
}

function redactDiscountCodeSecrets(value, requestedDiscounts) {
  let redacted = stringOrNull(value) || '';
  for (const discount of requestedDiscounts) {
    const code = stringOrNull(discount?.code);
    if (!code) continue;
    redacted = redacted.split(code).join(maskDiscountCode(code));
  }
  return redacted;
}

function redactPaymentInputSecrets(value, requestOrGiftCards = []) {
  const requestedGiftCards = Array.isArray(requestOrGiftCards)
    ? requestOrGiftCards
    : Array.isArray(requestOrGiftCards?.giftCards)
      ? requestOrGiftCards.giftCards
      : [];
  const requestedDiscounts = Array.isArray(requestOrGiftCards?.discounts) ? requestOrGiftCards.discounts : [];
  let redacted = redactDiscountCodeSecrets(redactGiftCardSecrets(value, requestedGiftCards), requestedDiscounts);
  return Array.isArray(requestOrGiftCards)
    ? redacted
    : redactPaymentTerminalValues(redacted, requestOrGiftCards?.paymentTerminal);
}

function validateQuoteRequest(request) {
  return validateItems(request.items);
}

function isEmergencyStopEnabled() {
  return process.env.JUMPYARD_EMERGENCY_STOP !== 'false';
}

function isParkTestEnvironment() {
  return process.env.JUMPYARD_ENVIRONMENT === 'park-test';
}

function isNewBookingDraftWriteEnabled() {
  if (process.env.ENABLE_ROLLER_BOOKING_DRAFT_WRITES !== 'true' || isEmergencyStopEnabled()) return false;
  if (!isParkTestEnvironment()) return true;
  return isT0159LivePaymentSmokeEnabled() || isT0176FullFlowRehearsalEnabled();
}

function isAddProductDraftWriteEnabled() {
  if (process.env.ENABLE_ROLLER_BOOKING_DRAFT_WRITES !== 'true' || isEmergencyStopEnabled()) return false;
  if (!isParkTestEnvironment()) return true;
  return isT0162LiveAddOnSmokeEnabled() || isT0176FullFlowRehearsalEnabled();
}

function isT0159LivePaymentSmokeEnabled() {
  return (
    process.env.JUMPYARD_ENVIRONMENT === 'park-test' &&
    process.env.ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES === 'true'
  );
}

function isT0162LiveAddOnSmokeEnabled() {
  return (
    process.env.JUMPYARD_ENVIRONMENT === 'park-test' &&
    process.env.ENABLE_T0162_LIVE_ADDON_SMOKE === 'true'
  );
}

function isT0176FullFlowRehearsalEnabled() {
  return (
    process.env.JUMPYARD_ENVIRONMENT === 'park-test' &&
    process.env.ENABLE_T0176_FULL_FLOW_REHEARSAL === 'true'
  );
}

function validateT0162AddOnSmokeAccess(identifier) {
  if (process.env.JUMPYARD_ENVIRONMENT !== 'park-test') {
    return { ok: true };
  }

  if (isT0176FullFlowRehearsalEnabled()) {
    return { ok: true };
  }

  if (!isT0162LiveAddOnSmokeEnabled()) {
    return {
      ok: false,
      code: 'live_addon_smoke_disabled',
      message: 'Live add-product access is disabled in park-test outside the scoped T0162 smoke.',
      statusCode: 409,
    };
  }

  if (!isT0162LiveAddOnSmokeIdentifierAllowed(identifier)) {
    return {
      ok: false,
      code: 'live_addon_booking_not_allowed',
      message: 'This booking identifier is not approved for the T0162 Live add-on smoke.',
      statusCode: 403,
    };
  }

  return { ok: true };
}

function validateT0176FullFlowOriginalBookingAccess(original) {
  if (!isT0176FullFlowRehearsalEnabled()) return { ok: true };

  const allowedDates = parseCsvValues(process.env.T0176_FULL_FLOW_ALLOWED_OPERATING_DATES);
  const bookingDate = normalizeDate(original?.bookingDate);
  if (allowedDates.length === 0 || !bookingDate || !allowedDates.includes(bookingDate)) {
    return {
      ok: false,
      code: 't0176_full_flow_booking_not_allowed',
      message: 'This booking is outside the approved T0176 full-flow test operating date.',
      statusCode: 403,
    };
  }

  const approvedVenueId = stringOrNull(process.env.T0176_FULL_FLOW_VENUE_ID);
  const bookingVenueId = stringOrNull(original?.venueId);
  if (!approvedVenueId) {
    return {
      ok: false,
      code: 't0176_full_flow_config_error',
      message: 'The T0176 full-flow rehearsal has no approved venue.',
      statusCode: 500,
    };
  }

  if (!bookingVenueId || approvedVenueId !== bookingVenueId) {
    return {
      ok: false,
      code: 't0176_full_flow_booking_not_allowed',
      message: 'This booking is outside the approved T0176 full-flow test venue.',
      statusCode: 403,
    };
  }

  return { ok: true };
}

function validateT0176FullFlowRequestItemDates(items) {
  if (!isT0176FullFlowRehearsalEnabled()) return { ok: true };

  const allowedDates = parseCsvValues(process.env.T0176_FULL_FLOW_ALLOWED_OPERATING_DATES);
  if (allowedDates.length === 0 || allowedDates.some((date) => !isIsoDate(date))) {
    return {
      ok: false,
      code: 't0176_full_flow_config_error',
      message: 'The T0176 full-flow rehearsal has no valid approved operating dates.',
      statusCode: 500,
    };
  }

  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.some((item) => !isIsoDate(item?.bookingDate) || !allowedDates.includes(item.bookingDate))
  ) {
    return {
      ok: false,
      code: 't0176_full_flow_item_date_not_allowed',
      message: 'One or more booking items are outside the approved T0176 full-flow test operating dates.',
      statusCode: 403,
    };
  }

  return { ok: true };
}

function parseCsvValues(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeDate(value) {
  const raw = stringOrNull(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isT0162LiveAddOnSmokeIdentifierAllowed(identifier) {
  const normalized = stringOrNull(identifier);
  if (!normalized) return false;

  const allowed = String(process.env.T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return allowed.includes(normalized);
}

function parkTestGateBlockedResponse(correlationId, gate) {
  return jsonResponse(gate.statusCode, correlationId, {
    status: 'blocked',
    error: {
      code: gate.code,
      message: gate.message,
    },
  });
}

function safetyGateBlockedResponse(
  correlationId,
  code,
  message = 'This JumpYard Cloud environment is not enabled for Roller booking draft writes.',
) {
  return jsonResponse(409, correlationId, {
    status: 'blocked',
    error: {
      code,
      message,
    },
  });
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

  if (request.channel === 'unsupported') {
    return {
      code: 'payment_channel_invalid',
      message: 'Unsupported booking payment channel.',
    };
  }

  if (request.channel === 'kiosk' && !request.paymentTerminalAlias) {
    return {
      code: 'payment_terminal_alias_required',
      message: 'Kiosk draft creation requires a payment terminal alias.',
    };
  }

  if (request.channel !== 'kiosk' && request.paymentTerminalAlias) {
    return {
      code: 'payment_terminal_alias_not_allowed',
      message: 'A payment terminal alias is only allowed for the kiosk channel.',
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

  if (request.channel === 'unsupported') {
    return {
      code: 'payment_channel_invalid',
      message: 'Unsupported booking payment channel.',
    };
  }

  if (request.channel === 'kiosk' && !request.paymentTerminalAlias) {
    return {
      code: 'payment_terminal_alias_required',
      message: 'Kiosk draft creation requires a payment terminal alias.',
    };
  }

  if (request.channel !== 'kiosk' && request.paymentTerminalAlias) {
    return {
      code: 'payment_terminal_alias_not_allowed',
      message: 'A payment terminal alias is only allowed for the kiosk channel.',
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
  if (request.paymentTerminal) payload.paymentTerminal = request.paymentTerminal;

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
    paymentTerminals: normalizePaymentTerminalMap(secret.paymentTerminals ?? secret.kioskPaymentTerminals),
  };

  validateRollerConfig(config);
  cachedRollerConfig = config;
  cachedRollerConfigExpiresAt = now + PROVIDER_CONFIG_CACHE_MS;
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
  const livePaymentSmokeEnabled = isT0159LivePaymentSmokeEnabled();
  const liveAddOnSmokeEnabled = isT0162LiveAddOnSmokeEnabled();
  const fullFlowRehearsalEnabled = isT0176FullFlowRehearsalEnabled();
  const liveSmokeEnabled = livePaymentSmokeEnabled || liveAddOnSmokeEnabled || fullFlowRehearsalEnabled;

  if (liveSmokeEnabled) {
    if (config.env !== 'live') {
      errors.push('Roller environment must be live for the scoped park-test Live smoke/rehearsal.');
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
    if (liveSmokeEnabled) {
      if (parsedBaseUrl.origin !== ROLLER_LIVE_BASE_URL || parsedBaseUrl.pathname !== '/') {
        errors.push(`Roller base URL must be ${ROLLER_LIVE_BASE_URL} for the scoped park-test Live smoke/rehearsal.`);
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

async function publishNoPaymentDraft(config, token, rollerDraftUniqueId) {
  if (!rollerDraftUniqueId) {
    return {
      body: null,
      ok: false,
      status: 400,
    };
  }

  return postRollerJson(config, token, '/bookings/draft/publish', {
    uniqueId: rollerDraftUniqueId,
  });
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
        message: `Original booking ${normalizedReference} was not found in Roller.`,
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

  if (validateCustomer(original.customer)) {
    const rollerGuestCustomer = await resolveOriginalBookingCustomerFromGuestDetail(config, token, rollerResult.body);
    original.customer = mergeOriginalBookingCustomer(original.customer, rollerGuestCustomer, original.bookingName);
  }

  return {
    ok: true,
    ...original,
  };
}

async function resolveOriginalBookingCustomerFromGuestDetail(config, token, bookingBody) {
  const candidates = collectOriginalBookingGuestCandidates(bookingBody).slice(0, 8);

  for (const candidate of candidates) {
    const result = await getRollerJson(config, token, `/guests/${encodeURIComponent(candidate)}`);
    if (!result.ok) continue;

    const customer = normalizeOriginalBookingGuestDetailCustomer(result.body);
    if (!validateCustomer(customer)) return customer;
  }

  return null;
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
       venue_id,
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
    venueId: extractVenueId(booking) || stringOrNull(localBooking?.venue_id),
  };
}

function extractVenueId(booking) {
  const candidates = [
    booking?.venueId,
    booking?.venueID,
    booking?.venue_id,
    booking?.venue?.id,
    booking?.venue?.venueId,
    booking?.venue?.venueID,
    ...(Array.isArray(booking?.items)
      ? booking.items.flatMap((item) => [
          item?.venueId,
          item?.venueID,
          item?.venue_id,
          item?.venue?.id,
          item?.venue?.venueId,
          item?.venue?.venueID,
        ])
      : []),
  ];
  return candidates.map(stringOrNull).find(Boolean) ?? null;
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

function normalizeOriginalBookingGuestDetailCustomer(body) {
  const guest = firstPlainObject([
    body?.guest,
    body?.customer,
    body?.data,
    body,
  ]);
  return normalizeOriginalBookingCustomer(guest);
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

function collectOriginalBookingGuestCandidates(value) {
  const candidates = [];
  collectOriginalBookingGuestCandidatesInto(value, candidates, 0);
  return [...new Set(candidates)];
}

function collectOriginalBookingGuestCandidatesInto(value, candidates, depth) {
  if (depth > 10) return;

  if (Array.isArray(value)) {
    for (const item of value) collectOriginalBookingGuestCandidatesInto(item, candidates, depth + 1);
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (isOriginalBookingGuestCandidateKey(key)) {
      const candidate = stringOrNull(child);
      if (candidate && /^[A-Za-z0-9-]{3,80}$/.test(candidate)) candidates.push(candidate);
    }
    collectOriginalBookingGuestCandidatesInto(child, candidates, depth + 1);
  }
}

function isOriginalBookingGuestCandidateKey(key) {
  return ['bookingcustomerid', 'customerid', 'guestid', 'rollercustomerid'].includes(
    String(key || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
  );
}

function firstPlainObject(values) {
  for (const value of values) {
    if (isPlainObject(value)) return value;
  }
  return null;
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
       AND COALESCE(expires_at, fetched_at + interval '24 hours') > now()
       AND (
         summary ->> 'parentProductName' IN (
           'Entré 60 min',
           'Entré 90 min',
           'Entré 120 min',
           'Weekday Combo',
           'Entré 60 min - Familj',
           'Entré 90 min - Familj',
           'Entré 120 min - Familj'
         )
         OR summary ->> 'name' IN (
           'Entré 60 min',
           'Entré 90 min',
           'Entré 120 min',
           'Weekday Combo',
           'Entré 60 min - Familj',
           'Entré 90 min - Familj',
           'Entré 120 min - Familj'
         )
       )`,
    [stringParameter('rollerEnv', rollerEnv)],
  );
  const rows = mappedRows(result);
  const liveFallbackProducts = getLiveSmokeBookingProductFallbacks(rollerEnv);
  const fallbackRows = liveFallbackProducts.length > 0
    ? liveFallbackProducts
        .filter((product) => !rows.some((row) => row.parent_product_id === product.parentProductId || row.id === product.productId))
        .map((product) => ({
          parent_product_id: product.parentProductId,
          parent_product_name: null,
          id: product.productId,
          name: null,
          smoke_key: product.key,
        }))
    : [];
  const candidateRows = [...rows, ...fallbackRows];

  return PHONE_BOOKING_PRODUCTS.map((product) => {
    const liveMapping = liveFallbackProducts.find((candidate) => candidate.key === product.key);
    const row = candidateRows.find(
      (candidate) =>
        candidate.parent_product_name === product.parentName ||
        candidate.name === product.parentName ||
        candidate.smoke_key === product.key,
    );
    const parentProductId = stringOrNull(row?.parent_product_id) || stringOrNull(row?.id);
    if (!parentProductId) return null;

    return {
      ...product,
      availabilityProductIds: liveMapping?.productIds,
      parentProductId,
    };
  }).filter(Boolean);
}

function getRequiredPhoneBookingProducts() {
  return PHONE_BOOKING_PRODUCTS.filter((product) => product.type !== 'combo');
}

function getLiveSmokeBookingProductFallbacks(rollerEnv) {
  if (rollerEnv !== 'live') return [];
  const products = [];
  if (isT0159LivePaymentSmokeEnabled()) products.push(...T0159_LIVE_PAYMENT_SMOKE_PRODUCTS);
  if (isT0162LiveAddOnSmokeEnabled()) products.push(...T0162_LIVE_ADDON_SMOKE_PRODUCTS);
  if (isT0176FullFlowRehearsalEnabled()) products.push(...T0159_LIVE_PAYMENT_SMOKE_PRODUCTS);
  products.push(...LIVE_PHONE_BOOKING_PRODUCTS);
  return products;
}

function getLivePhoneAddonFallbacks(rollerEnv) {
  if (rollerEnv !== 'live') return [];
  return LIVE_PHONE_ADDON_PRODUCTS;
}

async function loadPhoneAddonProducts(rollerEnv) {
  const clauses = [];
  const parameters = [stringParameter('rollerEnv', rollerEnv)];

  PHONE_ADDON_PRODUCTS.forEach((product, index) => {
    if (product.productId) {
      clauses.push(`summary ->> 'id' = :addonProductId${index}`);
      parameters.push(stringParameter(`addonProductId${index}`, product.productId));
    }

    if (product.parentName) {
      clauses.push(`summary ->> 'parentProductName' = :addonParentName${index}`);
      clauses.push(`summary ->> 'name' = :addonParentName${index}`);
      parameters.push(stringParameter(`addonParentName${index}`, product.parentName));
    }
  });

  if (clauses.length === 0) return [];

  const result = await executeStatement(
    `SELECT DISTINCT
       summary ->> 'parentProductId' AS parent_product_id,
       summary ->> 'parentProductName' AS parent_product_name,
       summary ->> 'id' AS id,
       summary ->> 'name' AS name,
       summary ->> 'priceCents' AS price_cents
     FROM jumpyard.product_catalog_cache
     WHERE roller_env = :rollerEnv
       AND COALESCE(expires_at, fetched_at + interval '24 hours') > now()
       AND (${clauses.join(' OR ')})`,
    parameters,
  );
  const rows = mappedRows(result);
  return mapPhoneAddonProducts(rows, rollerEnv);
}

function mapPhoneAddonProducts(rows, rollerEnv) {
  const liveAddonFallbacks = getLivePhoneAddonFallbacks(rollerEnv);
  const fallbackRows = liveAddonFallbacks.length > 0
    ? liveAddonFallbacks
        .filter((product) => !rows.some((row) => row.id === product.productId || row.parent_product_id === product.parentProductId))
        .map((product) => ({
          parent_product_id: product.parentProductId,
          parent_product_name: product.parentProductName,
          id: product.productId,
          name: product.productName,
          price_cents: product.priceCents,
          smoke_key: product.key,
        }))
    : [];
  const candidateRows = [...rows, ...fallbackRows];

  return PHONE_ADDON_PRODUCTS.map((product) => {
    const row = candidateRows.find(
      (candidate) =>
        (product.productId && candidate.id === product.productId) ||
        (product.parentName && (candidate.parent_product_name === product.parentName || candidate.name === product.parentName)) ||
        candidate.smoke_key === product.key,
    );
    const productId = stringOrNull(row?.id) || stringOrNull(product.productId);
    const parentProductId = stringOrNull(row?.parent_product_id) || stringOrNull(row?.id);
    const unitPriceCents = numberOrNull(row?.price_cents);

    if (product.requiresAvailability === true && !parentProductId) return null;
    if (product.requiresAvailability !== true && (!productId || unitPriceCents === null)) return null;

    return {
      ...product,
      parentProductId: parentProductId || productId,
      productId,
      productName: stringOrNull(row?.name) || product.label,
      unitPrice: unitPriceCents === null ? null : unitPriceCents / 100,
      unitPriceCents,
    };
  }).filter(Boolean);
}

async function validateItemsAvailable(config, token, items) {
  const hasExplicitItemFlags = items.some((item) => item.requiresAvailability === true || item.requiresAvailability === false);
  const itemsToValidate = hasExplicitItemFlags ? items.filter((item) => item.requiresAvailability === true) : items;
  if (itemsToValidate.length === 0) return null;

  const productIds = [...new Set(itemsToValidate.map((item) => item.productId).filter(Boolean))];
  const productParents = await loadParentProductsForChildIds(config.env, productIds);
  const parentsByProductId = new Map(productParents.map((product) => [String(product.productId), product]));
  const liveAvailabilityParentsByItemKey = await loadLivePaymentSmokeParentsFromAvailability(
    config,
    token,
    itemsToValidate,
    parentsByProductId,
  );

  for (const item of itemsToValidate) {
    const liveAvailabilityParent = liveAvailabilityParentsByItemKey.get(liveAvailabilityItemKey(item));
    const productParent = parentsByProductId.get(String(item.productId)) || liveAvailabilityParent;
    if (!productParent?.parentProductId) {
      return {
        code: 'availability_product_missing',
        message: `Product ${item.productId} is not present in the local Roller product cache.`,
      };
    }

    const parent = productParent.availabilityParent || await loadAvailabilityParentForProduct(config, token, item, productParent.parentProductId);
    if (parent?.error) return parent.error;

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

async function loadAvailabilityParentForProduct(config, token, item, parentProductId) {
  const rollerResult = await getRollerJson(
    config,
    token,
    `/product-availability?${new URLSearchParams({
      Date: item.bookingDate,
      ProductIds: parentProductId,
    }).toString()}`,
  );

  if (!rollerResult.ok) {
    return {
      error: {
        code: 'roller_availability_failed',
        message: `Roller availability failed with HTTP ${rollerResult.status}.`,
      },
    };
  }

  return Array.isArray(rollerResult.body)
    ? rollerResult.body.find((candidate) => String(candidate.parentProductId ?? candidate.id) === parentProductId)
    : null;
}

async function loadLivePaymentSmokeParentsFromAvailability(config, token, items, parentsByProductId) {
  const result = new Map();
  if (config.env !== 'live' || (!isT0159LivePaymentSmokeEnabled() && !isT0176FullFlowRehearsalEnabled())) {
    return result;
  }

  const missingItems = items.filter((item) => !parentsByProductId.has(String(item.productId)));
  if (missingItems.length === 0) return result;

  const parentProducts = await loadPhoneBookingParentProducts(config.env);
  const allowedParents = parentProducts.filter(
    (product) =>
      (product.type === 'entry' || product.type === 'family' || product.type === 'combo') &&
      product.parentProductId,
  );
  const allowedParentIds = new Set(allowedParents.map((product) => String(product.parentProductId)));
  if (allowedParentIds.size === 0) return result;

  const itemsByDate = new Map();
  for (const item of missingItems) {
    const date = stringOrNull(item.bookingDate);
    if (!date) continue;
    const existing = itemsByDate.get(date) || [];
    existing.push(item);
    itemsByDate.set(date, existing);
  }

  for (const [date, dateItems] of itemsByDate.entries()) {
    const rollerResult = await getRollerJson(
      config,
      token,
      `/product-availability?${new URLSearchParams({
        Date: date,
        ProductIds: [...allowedParentIds].join(','),
      }).toString()}`,
    );
    if (!rollerResult.ok || !Array.isArray(rollerResult.body)) continue;

    for (const item of dateItems) {
      const productId = String(item.productId);
      const parent = rollerResult.body.find((candidate) => {
        const parentProductId = String(candidate?.parentProductId ?? candidate?.id ?? '');
        return (
          allowedParentIds.has(parentProductId) &&
          findAvailabilityProduct(candidate, productId) &&
          findSessionForProduct(candidate, productId, item.startTime)
        );
      });
      const parentProductId = stringOrNull(parent?.parentProductId ?? parent?.id);
      if (!parent || !parentProductId) continue;

      result.set(liveAvailabilityItemKey(item), {
        availabilityParent: parent,
        parentProductId,
        productId,
      });
    }
  }

  return result;
}

function liveAvailabilityItemKey(item) {
  return `${item.productId}|${item.bookingDate}|${item.startTime}`;
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
       AND COALESCE(expires_at, fetched_at + interval '24 hours') > now()
       AND (${clauses})`,
    [
      stringParameter('rollerEnv', rollerEnv),
      ...productIds.map((productId, index) => stringParameter(`productId${index}`, String(productId))),
    ],
  );

  const rows = mappedRows(result).map((row) => ({
    parentProductId: stringOrNull(row.parent_product_id),
    productId: stringOrNull(row.product_id),
  }));
  if (rollerEnv !== 'live') return rows;

  const existingIds = new Set(rows.map((row) => row.productId));
  const requestedProductIds = productIds.map(String);
  const liveBookingFallbackRows = getLiveSmokeBookingProductFallbacks(rollerEnv)
    .flatMap((product) => [
      stringOrNull(product.productId),
      ...(Array.isArray(product.productIds) ? product.productIds.map(stringOrNull) : []),
    ].filter(Boolean).map((productId) => ({
      parentProductId: product.parentProductId,
      productId,
    })))
    .filter((product) => requestedProductIds.includes(product.productId) && !existingIds.has(product.productId));
  const liveAddonFallbackRows = getLivePhoneAddonFallbacks(rollerEnv)
    .flatMap((product) => [
      stringOrNull(product.productId),
      ...(Array.isArray(product.availabilityProductIds) ? product.availabilityProductIds.map(stringOrNull) : []),
    ].filter(Boolean).map((productId) => ({
      parentProductId: product.parentProductId,
      productId,
    })))
    .filter((product) => requestedProductIds.includes(product.productId) && !existingIds.has(product.productId));

  return [...rows, ...liveBookingFallbackRows, ...liveAddonFallbackRows];
}

function buildPhoneAvailability(request, parentProducts, rollerBody) {
  const rollerProducts = Array.isArray(rollerBody) ? rollerBody : [];
  const products = [];
  const slots = request.startTimes.map((startTime) => ({
    date: request.date,
    startTime,
    products: parentProducts.map((definition) => {
      if (definition.requiresAvailability === false) {
        const unitPrice = numberOrNull(definition.unitPrice);
        const unitPriceCents = numberOrNull(definition.unitPriceCents);
        const product = {
          available: Boolean(definition.productId && unitPrice !== null),
          capacityRemaining: null,
          durationMinutes: definition.durationMinutes,
          endTime: null,
          jumpersPerUnit: definition.jumpersPerUnit,
          key: definition.key,
          label: definition.label,
          onlineSalesOpen: Boolean(definition.productId && unitPrice !== null),
          parentProductId: definition.parentProductId,
          productId: stringOrNull(definition.productId),
          productName: stringOrNull(definition.productName),
          requiresAvailability: false,
          startTime,
          type: definition.type,
          unitPrice,
          unitPriceCents: unitPriceCents ?? (unitPrice === null ? null : Math.round(unitPrice * 100)),
        };
        products.push(product);
        return product;
      }

      const parent = rollerProducts.find((candidate) => String(candidate.parentProductId ?? candidate.id) === definition.parentProductId);
      const session = findSessionForParent(parent, startTime);
      const selectedProduct = selectMappedAvailabilityProduct(
        parent,
        session,
        definition.availabilityProductIds,
      );
      const capacityRemaining = getSessionCapacityRemaining(session);
      const onlineSalesOpen = session?.onlineSalesOpen !== false;
      const available = isPhoneAvailabilityProductAvailable(session, selectedProduct, capacityRemaining);
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
        requiresAvailability: true,
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

  const parentAvailabilities = Array.isArray(parent.availabilities) ? parent.availabilities : [];
  const parentAllDayAvailability = parentAvailabilities.find((availability) => {
    const sessions = Array.isArray(availability?.sessions) ? availability.sessions : [];
    return sessions.length === 0;
  });
  if (parentAllDayAvailability) {
    return {
      ...parentAllDayAvailability,
      startTime,
    };
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

function findAvailabilityProduct(parent, productId) {
  const products = Array.isArray(parent?.products) ? parent.products : [];
  return products.find((product) => String(product?.id ?? '') === productId) || null;
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
  const now = Date.now();
  if (cachedVenuePaymentConfig && cachedVenuePaymentConfigExpiresAt > now) {
    return cachedVenuePaymentConfig;
  }

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
    cachedVenuePaymentConfigExpiresAt = now + PROVIDER_CONFIG_CACHE_MS;
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
  cachedVenuePaymentConfigExpiresAt = now + PROVIDER_CONFIG_CACHE_MS;

  return cachedVenuePaymentConfig;
}

function normalizeDraftResponse(body, itemCount, request = null) {
  return {
    uniqueId: stringOrNull(body?.uniqueId),
    capacityReservationId: stringOrNull(body?.capacityReservationId),
    bookingReference: stringOrNull(body?.bookingReference),
    costs: normalizeCosts(body),
    discountCodes: normalizeDiscountCodeSummary(body, request),
    giftCards: normalizeGiftCardSummary(body, request),
    itemCount,
  };
}

function normalizeCosts(body) {
  const costs = extractCostsObject(body);

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

async function loadProductDisplayMetadata(rollerEnv, productIds) {
  const uniqueProductIds = [...new Set(productIds.map(stringOrNull).filter(Boolean))];
  if (uniqueProductIds.length === 0) return new Map();

  const placeholders = uniqueProductIds.map((_, index) => `:displayProductId${index}`).join(', ');
  const result = await executeStatement(
    `SELECT DISTINCT ON (summary ->> 'id')
       summary ->> 'id' AS product_id,
       summary::text AS product_summary
     FROM jumpyard.product_catalog_cache
     WHERE roller_env = :rollerEnv
       AND summary ->> 'id' IN (${placeholders})
     ORDER BY summary ->> 'id', fetched_at DESC`,
    [
      stringParameter('rollerEnv', rollerEnv),
      ...uniqueProductIds.map((productId, index) => stringParameter(`displayProductId${index}`, productId)),
    ],
  );

  return new Map(
    mappedRows(result)
      .map((row) => [stringOrNull(row.product_id), parseJsonOrNull(row.product_summary)])
      .filter(([productId, summary]) => productId && summary && typeof summary === 'object' && !Array.isArray(summary)),
  );
}

function findConfiguredProductDisplay(metadata, productId) {
  const normalizedNames = [metadata?.parentProductName, metadata?.name]
    .map((value) => stringOrNull(value)?.toLowerCase())
    .filter(Boolean);
  const definitions = [...PHONE_BOOKING_PRODUCTS, ...PHONE_ADDON_PRODUCTS];
  return definitions.find((definition) => {
    const definitionNames = [definition.parentName, definition.label]
      .map((value) => stringOrNull(value)?.toLowerCase())
      .filter(Boolean);
    return (
      (definition.productId && String(definition.productId) === String(productId)) ||
      definitionNames.some((name) => normalizedNames.includes(name))
    );
  }) ?? null;
}

function addMinutesToClock(startTime, durationMinutes) {
  const match = stringOrNull(startTime)?.match(/^(\d{1,2}):(\d{2})/);
  const duration = numberOrNull(durationMinutes);
  if (!match || duration === null || duration <= 0) return null;
  const minutes = (Number(match[1]) * 60 + Number(match[2]) + Math.round(duration)) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function buildProductDisplayItem(item, metadata = {}, provisional = null) {
  const productId = stringOrNull(item?.productId ?? provisional?.productId ?? metadata?.id);
  const definition = findConfiguredProductDisplay(metadata, productId);
  const durationMinutes =
    numberOrNull(item?.durationMinutes) ??
    numberOrNull(metadata?.durationMinutes) ??
    numberOrNull(provisional?.durationMinutes) ??
    numberOrNull(definition?.durationMinutes);
  const startTime = stringOrNull(item?.startTime ?? provisional?.startTime);

  return {
    ...item,
    bookingDate: stringOrNull(item?.bookingDate ?? provisional?.bookingDate),
    durationMinutes,
    endTime:
      stringOrNull(item?.endTime ?? metadata?.endTime ?? provisional?.endTime) ||
      addMinutesToClock(startTime, durationMinutes),
    parentProductId: stringOrNull(
      item?.parentProductId ?? metadata?.parentProductId ?? provisional?.parentProductId,
    ),
    parentProductName: stringOrNull(
      item?.parentProductName ?? metadata?.parentProductName ?? provisional?.parentProductName ?? definition?.parentName,
    ),
    parentType: stringOrNull(item?.parentType ?? metadata?.parentType ?? provisional?.parentType),
    productId,
    productName: stringOrNull(
      item?.productName ?? metadata?.name ?? provisional?.productName ?? definition?.label,
    ),
    productSubType: stringOrNull(
      item?.productSubType ?? metadata?.productSubType ?? provisional?.productSubType,
    ),
    productType: stringOrNull(
      item?.productType ?? metadata?.productType ?? provisional?.productType ?? definition?.type,
    ),
    quantity: numberOrNull(item?.quantity ?? provisional?.quantity) ?? 1,
    startTime,
  };
}

async function buildPrepaymentItemsSummary(rollerEnv, items) {
  const metadataByProductId = await loadProductDisplayMetadata(
    rollerEnv,
    items.map((item) => item.productId),
  );
  return items.map((item) => buildProductDisplayItem(item, metadataByProductId.get(String(item.productId))));
}

async function enrichKioskReadbackItems(existing, items) {
  const parsedItemsSummary = parseJsonOrNull(existing.items_summary);
  const provisionalItems = Array.isArray(parsedItemsSummary) ? parsedItemsSummary : [];
  const metadataByProductId = await loadProductDisplayMetadata(
    existing.roller_env,
    items.map((item) => item.productId),
  );

  return items.map((item, index) => {
    const provisional = provisionalItems.find((candidate) =>
      String(candidate?.productId ?? '') === String(item?.productId ?? '') &&
      (!candidate?.bookingDate || !item?.bookingDate || candidate.bookingDate === item.bookingDate) &&
      (!candidate?.startTime || !item?.startTime || candidate.startTime === item.startTime)
    ) ?? provisionalItems[index] ?? null;
    return buildProductDisplayItem(
      item,
      metadataByProductId.get(String(item.productId)),
      provisional,
    );
  });
}

async function persistPrepaymentDraft({
  config,
  draft,
  externalId,
  idempotencyKey,
  jwtSummary,
  paymentConfig,
  request,
  status = 'payment_pending',
}) {
  const prepaymentDraftId = `jypd_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
  const firstItem = request.items[0] ?? {};
  const flowType = request.flowType === 'add_product' ? 'add_product' : 'new_booking';
  const paymentChannel = request.channel === 'kiosk' ? 'card_present' : 'ecommerce';
  const paymentAttemptId = paymentChannel === 'card_present'
    ? `jytp_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`
    : null;
  const totalCents = centsFromAmount(draft.costs.total);
  const amountOwingCents = centsFromAmount(draft.costs.amountOwing);
  const email = request.customer.email;
  const phone = request.customer.phone;
  const itemsSummary = await buildPrepaymentItemsSummary(config.env, request.items);

  const persisted = await executeStatement(
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
       payment_channel,
       payment_attempt_id,
       payment_attempt_status,
       booking_confirmation_status,
       roller_env,
       booking_date,
       start_time,
       total_cents,
       amount_owing_cents,
       currency,
       customer_email,
       customer_email_hash,
       customer_email_masked,
       customer_first_name,
       customer_last_name,
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
       :status,
       :paymentChannel,
       :paymentAttemptId,
       :paymentAttemptStatus,
       :bookingConfirmationStatus,
       :rollerEnv,
       CAST(:bookingDate AS date),
       CAST(:startTime AS time),
       :totalCents,
       :amountOwingCents,
       :currency,
       :customerEmail,
       :customerEmailHash,
       :customerEmailMasked,
       :customerFirstName,
       :customerLastName,
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
       payment_channel = EXCLUDED.payment_channel,
       payment_attempt_id = COALESCE(jumpyard.prepayment_booking_drafts.payment_attempt_id, EXCLUDED.payment_attempt_id),
       payment_attempt_status = COALESCE(jumpyard.prepayment_booking_drafts.payment_attempt_status, EXCLUDED.payment_attempt_status),
       booking_confirmation_status = COALESCE(
         jumpyard.prepayment_booking_drafts.booking_confirmation_status,
         EXCLUDED.booking_confirmation_status
       ),
       total_cents = EXCLUDED.total_cents,
       amount_owing_cents = EXCLUDED.amount_owing_cents,
       customer_first_name = EXCLUDED.customer_first_name,
       customer_last_name = EXCLUDED.customer_last_name,
       items_summary = EXCLUDED.items_summary,
       payment_jwt_present = EXCLUDED.payment_jwt_present,
       payment_config_available = EXCLUDED.payment_config_available,
       updated_at = now()
     RETURNING prepayment_draft_id, payment_attempt_id`,
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
      stringParameter('status', status),
      stringParameter('paymentChannel', paymentChannel),
      stringParameter('paymentAttemptId', paymentAttemptId),
      stringParameter('paymentAttemptStatus', paymentAttemptId ? 'created' : null),
      stringParameter('bookingConfirmationStatus', paymentAttemptId ? 'pending' : null),
      stringParameter('rollerEnv', config.env),
      stringParameter('bookingDate', firstItem.bookingDate),
      stringParameter('startTime', firstItem.startTime),
      integerParameter('totalCents', totalCents),
      integerParameter('amountOwingCents', amountOwingCents),
      stringParameter('currency', 'SEK'),
      stringParameter('customerEmail', email),
      stringParameter('customerEmailHash', hashString(email.toLowerCase())),
      stringParameter('customerEmailMasked', maskEmail(email)),
      stringParameter('customerFirstName', request.customer.firstName),
      stringParameter('customerLastName', request.customer.lastName),
      stringParameter('customerPhone', phone),
      stringParameter('customerPhoneHash', hashString(phone)),
      stringParameter('customerPhoneMasked', maskPhone(phone)),
      integerParameter('itemCount', request.items.length),
      stringParameter('itemsSummary', JSON.stringify(itemsSummary)),
      booleanParameter('paymentJwtPresent', jwtSummary.present === true),
      booleanParameter('paymentConfigAvailable', paymentConfig?.available === true),
    ],
  );
  const persistedRow = firstMappedRow(persisted);

  return {
    amountOwing: draft.costs.amountOwing,
    amountOwingCents,
    addOnGroupId: request.addOnGroupId ?? null,
    expiresAt: null,
    flowType,
    originalBookingReference: request.originalBookingReference ?? null,
    originalRollerUniqueId: request.originalRollerUniqueId ?? null,
    paymentAttemptId: stringOrNull(persistedRow?.payment_attempt_id),
    paymentBlockedReason:
      status === 'published'
        ? null
        : paymentChannel === 'card_present'
          ? null
          : 'payment_dropin_not_configured',
    paymentChannel,
    prepaymentDraftId: stringOrNull(persistedRow?.prepayment_draft_id) || prepaymentDraftId,
    rollerDraftUniqueId: draft.uniqueId,
    status,
    total: draft.costs.total,
    totalCents,
  };
}

async function persistAddOnBookingLink({ addOnGroupId, draft, original, prepaymentDraft }) {
  const linkId = `jyl_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
  const linkedRollerUniqueId = draft.uniqueId || prepaymentDraft.rollerDraftUniqueId;
  const linkedBookingReference = draft.bookingReference ?? null;
  await executeStatement(
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
     )`,
    [
      stringParameter('linkId', linkId),
      stringParameter('originalRollerUniqueId', original.rollerUniqueId),
      stringParameter('originalBookingReference', original.bookingReference),
      stringParameter('linkedRollerUniqueId', linkedRollerUniqueId),
      stringParameter('linkedBookingReference', linkedBookingReference),
      stringParameter('addOnGroupId', addOnGroupId),
    ],
  );

  return {
    addOnGroupId,
    createdAt: null,
    linkId,
    linkType: 'add_product_draft',
    linkedBookingReference,
    linkedRollerUniqueId,
    originalBookingReference: original.bookingReference,
    originalRollerUniqueId: original.rollerUniqueId,
    status: 'payment_pending',
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

async function verifyGuestAccessForBooking(event, bookingReference) {
  const credential = getGuestAccessCredential(event);
  if (!credential.present) {
    return { ok: false, statusCode: 401 };
  }

  if (!credential.token) {
    return { ok: false, statusCode: 403 };
  }

  const result = await executeStatement(
    `SELECT
       ct.roller_unique_id,
       b.booking_reference
     FROM jumpyard.checkin_tokens AS ct
     LEFT JOIN jumpyard.roller_bookings AS b
       ON b.roller_unique_id = ct.roller_unique_id
     WHERE ct.token_hash = :tokenHash
       AND ct.consumed_at IS NULL
       AND ct.expires_at > now()
       AND (
         ct.channel = :channel
         OR (
           ct.channel IN ('sms', 'email', 'manual', 'dev')
           AND ct.opened_at > now() - INTERVAL '${GUEST_ACCESS_LINK_WINDOW_MINUTES} minutes'
         )
       )
     LIMIT 1`,
    [
      stringParameter('tokenHash', hashString(credential.token)),
      stringParameter('channel', GUEST_ACCESS_CHANNEL),
    ],
  );
  const row = firstMappedRow(result);
  const normalizedReference = stringOrNull(bookingReference);
  const authorized = Boolean(
    normalizedReference &&
      (normalizedReference === stringOrNull(row?.booking_reference) ||
        normalizedReference === stringOrNull(row?.roller_unique_id)),
  );

  return authorized ? { ok: true } : { ok: false, statusCode: 403 };
}

function getGuestAccessCredential(event) {
  const authorization = getHeader(event, 'authorization');
  if (!authorization) {
    return { present: false, token: null };
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return {
    present: true,
    token: stringOrNull(match?.[1]),
  };
}

function guestAccessErrorResponse(correlationId, auth) {
  const statusCode = auth?.statusCode === 401 ? 401 : 403;
  return jsonResponse(statusCode, correlationId, {
    status: statusCode === 401 ? 'unauthorized' : 'forbidden',
    error: {
      code: statusCode === 401 ? 'guest_access_required' : 'guest_access_denied',
      message: 'Valid guest access is required for this booking operation.',
    },
  });
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

  if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    const error = new Error('Request body exceeds the allowed size.');
    error.code = 'payload_too_large';
    throw error;
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

function summarizeRollerError(body, requestOrGiftCards = []) {
  if (!body || typeof body !== 'object') {
    return {
      code: null,
      message: null,
    };
  }

  const errors = Array.isArray(body.errors)
    ? body.errors.map((error) => ({
        code: stringOrNull(error.code),
        message: redactPaymentInputSecrets(stringOrNull(error.message), requestOrGiftCards),
        name: stringOrNull(error.name),
      }))
    : [];

  return {
    code: stringOrNull(body.code ?? body.errorCode),
    message: redactPaymentInputSecrets(stringOrNull(body.message ?? body.error ?? body.title), requestOrGiftCards),
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

function emitKioskReconciliationMetric(state, attemptCount, elapsedMs) {
  const metrics = [
    { Name: 'KioskReconciliationStateCount', Unit: 'Count' },
    { Name: 'KioskReconciliationAttemptCount', Unit: 'Count' },
  ];
  const values = {
    KioskReconciliationStateCount: 1,
    KioskReconciliationAttemptCount: Math.max(0, Number(attemptCount) || 0),
  };
  if (state === 'confirmed') {
    metrics.push({ Name: 'KioskApprovalToBookingLatency', Unit: 'Milliseconds' });
    values.KioskApprovalToBookingLatency = Math.max(0, Number(elapsedMs) || 0);
  }

  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'JumpYard/Cloud',
            Dimensions: [['Environment', 'Handler', 'State']],
            Metrics: metrics,
          },
        ],
      },
      Environment: sanitizeMetricValue(process.env.RESOURCE_PREFIX || 'unknown'),
      Handler: 'booking',
      State: sanitizeMetricValue(state || 'unknown'),
      ...values,
    }),
  );
}

function emitKioskTerminalOutcomeMetric(outcome) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'JumpYard/Cloud',
            Dimensions: [['Environment', 'Handler', 'Outcome']],
            Metrics: [{ Name: 'KioskTerminalOutcomeCount', Unit: 'Count' }],
          },
        ],
      },
      Environment: sanitizeMetricValue(process.env.RESOURCE_PREFIX || 'unknown'),
      Handler: 'booking',
      Outcome: sanitizeMetricValue(outcome || 'unknown'),
      KioskTerminalOutcomeCount: 1,
    }),
  );
}

function emitKioskReconciliationDispatchFailureMetric(failureClass) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'JumpYard/Cloud',
            Dimensions: [['Environment', 'Handler', 'FailureClass']],
            Metrics: [{ Name: 'KioskReconciliationDispatchFailureCount', Unit: 'Count' }],
          },
        ],
      },
      Environment: sanitizeMetricValue(process.env.RESOURCE_PREFIX || 'unknown'),
      Handler: 'booking',
      FailureClass: sanitizeMetricValue(failureClass || 'unknown'),
      KioskReconciliationDispatchFailureCount: 1,
    }),
  );
}

function emitKioskPublishMetric(statusCode, result) {
  const isConflict = Number(statusCode) === 409;
  const metrics = [{ Name: 'KioskPublishAttemptCount', Unit: 'Count' }];
  const values = { KioskPublishAttemptCount: 1 };
  if (isConflict) {
    metrics.push({ Name: 'KioskPublishConflictCount', Unit: 'Count' });
    values.KioskPublishConflictCount = 1;
  }
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'JumpYard/Cloud',
            Dimensions: [['Environment', 'Handler', 'Result']],
            Metrics: metrics,
          },
        ],
      },
      Environment: sanitizeMetricValue(process.env.RESOURCE_PREFIX || 'unknown'),
      Handler: 'booking',
      Result: sanitizeMetricValue(result || 'unknown'),
      ...values,
    }),
  );
}

function emitSafeBookingOperationFailure({ correlationId, error, routeKey }) {
  const operation = routeKey === 'POST /v1/bookings/{bookingReference}/add-products'
    ? 'add_product_draft'
    : routeKey === 'POST /v1/bookings/{bookingReference}/add-products/quote'
      ? 'add_product_quote'
      : routeKey === 'POST /v1/bookings/draft/finalize'
        ? 'draft_finalize'
        : 'other';
  const allowedFailureClasses = new Set([
    'BadRequestException',
    'DatabaseError',
    'Error',
    'ServiceException',
    'TimeoutError',
    'TypeError',
    'ValidationException',
  ]);
  const candidate = stringOrNull(error?.name);
  const failureClass = candidate && allowedFailureClasses.has(candidate) ? candidate : 'unknown';

  console.error(JSON.stringify({
    correlationId,
    eventType: 'booking.operation_failed',
    failureClass,
    operation,
  }));
}

function rollerOperationFromEndpointPath(endpointPath, method) {
  const path = String(endpointPath || '').split('?')[0];
  if (path === '/bookings/draft/costs') return 'create_draft_costs';
  if (path === '/bookings/draft/publish') return 'publish_draft_booking';
  if (path === '/bookings/draft') return method === 'POST' ? 'create_draft_booking' : 'get_draft_booking';
  if (path === '/product-availability') return 'get_product_availability';
  if (path === '/venues/me') return 'get_venue_detail';
  if (/^\/bookings\/[^/]+$/.test(path)) return 'get_booking_detail';
  if (/^\/guests\/[^/]+$/.test(path)) return 'get_guest_detail';
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

function isDraftFinalizeRoute(routeKey, event) {
  return (
    routeKey === 'POST /v1/bookings/draft/finalize' ||
    event?.rawPath === '/v1/bookings/draft/finalize'
  );
}

function isKioskReconciliationEvent(event) {
  return event?.source === KIOSK_RECONCILIATION_SOURCE && event?.detail?.trigger !== 'http';
}

function isKioskAuthoritativeConfirmationEvent(event) {
  return event?.source === KIOSK_AUTHORITATIVE_CONFIRMATION_SOURCE && event?.detail?.trigger !== 'http';
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

function normalizeCorrelationId(value) {
  const normalized = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/.test(normalized) ? normalized : null;
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

exports.__test = {
  mapPhoneAddonProducts,
};
