const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');
const { ExecuteStatementCommand, RDSDataClient } = require('@aws-sdk/client-rds-data');
const { InvokeCommand, LambdaClient } = require('@aws-sdk/client-lambda');
const crypto = require('crypto');

const DATABASE_NAME = 'jumpyard_cloud';
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const ROLLER_PLAYGROUND_BASE_URL = 'https://api.play.roller.app';
const ROLLER_LIVE_BASE_URL = 'https://api.roller.app';
const PRODUCT_CACHE_TTL_MS = 15 * 60 * 1000;
const GUEST_ACCESS_CHANNEL = 'guest_access';
const GUEST_ACCESS_TTL_MINUTES = 60;
const MAX_ACTIVE_GUEST_ACCESS_TOKENS_PER_BOOKING = 64;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const TOKEN_BYTES = 32;
const PROVIDER_CONFIG_CACHE_MS = 5 * 60 * 1000;
const T0201_CONTROLLED_T30_EMAIL_APPROVAL = 'T0201_SINGLE_BOOKING_T30_EMAIL_APPROVED';
const T0201_CONTROLLED_VENUE_ID = '50871';
const ROLLER_VENUE_IDENTITY_DELAY_MS = 1000;

const rdsClient = new RDSDataClient({});
const lambdaClient = new LambdaClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedRollerConfigExpiresAt = 0;
let cachedToken = null;
let cachedProducts = null;

exports.handler = async (event) => {
  let correlationId = createCorrelationId();
  let parkTestAccess = { ok: true, mode: 'not_park_test' };

  try {
    if (isT0201ControlledT30EmailRefreshEvent(event)) {
      return await handleT0201ControlledT30EmailRefresh(event, correlationId);
    }

    const request = parseRequest(event);
    correlationId = normalizeCorrelationId(request.correlationId) || correlationId;

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
      parkTestAccess = await validateParkTestLookupAccess(request);
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

    const localResult = shouldTryLocalLookup(request)
      ? await getLocalBooking(request)
      : { status: 'skipped', booking: null, metadata: { lookupPath: 'aurora:skipped_contact_lookup' } };
    if (localResult.status === 'found' && shouldUseLocalBooking(localResult.booking)) {
      const parkTestScope = validateParkTestBookingScope(parkTestAccess, request, null, localResult.booking);
      if (!parkTestScope.ok) {
        return jsonResponse(parkTestScope.statusCode, correlationId, {
          status: parkTestScope.code === 'booking_not_found' ? 'not_found' : 'blocked',
          error: {
            code: parkTestScope.code,
            message: parkTestScope.message,
          },
        });
      }

      const scopedBooking = scopeBookingForLookupDate(localResult.booking, parkTestScope.lookupDate);

      await reconcilePrepaymentDraftFromPaidBooking(scopedBooking, 'aurora_local_lookup', correlationId);
      const eligibility = evaluateEligibility(scopedBooking, request);
      const guestAccess = await createGuestAccessToken(scopedBooking.rollerUniqueId);

      return jsonResponse(200, correlationId, {
        status: 'found',
        booking: scopedBooking,
        eligibility,
        guestAccess,
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
    const products = await getProductCatalogBestEffort(config, token);

    let bookingResult = null;
    let booking = null;
    let lookupPath = 'GET /bookings/{identifier}';
    let searchMatchCount = null;
    let verifiedVenueId = null;

    if (shouldUseRollerBookingSearch(request, parkTestAccess)) {
      const approvedVenueId = getT0171AssistedLookupVenueId();
      if (approvedVenueId) {
        verifiedVenueId = await getVerifiedRollerVenueId(config, token, approvedVenueId);
        // Keep the first booking-search request outside the same Roller request window.
        await waitForRollerRequestPacing();
      }
      const searchResult = await getBookingFromRollerSearch(
        config,
        token,
        products,
        request,
        parkTestAccess,
        verifiedVenueId,
      );
      if (searchResult.status === 'not_found') {
        return jsonResponse(404, correlationId, {
          status: 'not_found',
          error: {
            code: 'booking_not_found',
            message: 'No Roller booking was found for the supplied identifier today.',
          },
        });
      }

      if (searchResult.status === 'scope_error') {
        return jsonResponse(searchResult.scope.statusCode, correlationId, {
          status: 'blocked',
          error: {
            code: searchResult.scope.code,
            message: searchResult.scope.message,
          },
        });
      }

      if (searchResult.status !== 'found') {
        return jsonResponse(502, correlationId, {
          status: 'roller_error',
          error: {
            code: 'roller_lookup_failed',
            message: 'Roller booking search failed.',
          },
        });
      }

      bookingResult = { body: searchResult.rollerBooking };
      booking = searchResult.booking;
      lookupPath = searchResult.lookupPath;
      searchMatchCount = searchResult.matchCount;
    } else {
      const detailResult = await getBookingDetail(config, token, request.identifier);

      if (detailResult.status === 404) {
        return jsonResponse(404, correlationId, {
          status: 'not_found',
          error: {
            code: 'booking_not_found',
            message: 'No Roller booking was found for the supplied identifier.',
          },
        });
      }

      if (!detailResult.ok) {
        return jsonResponse(502, correlationId, {
          status: 'roller_error',
          error: {
            code: 'roller_lookup_failed',
            message: `Roller lookup failed with HTTP ${detailResult.status}.`,
          },
        });
      }

      bookingResult = detailResult;
      booking = normalizeBooking(detailResult.body, products);
      if (needsVerifiedAssistedLookupVenue(parkTestAccess, detailResult.body, booking)) {
        verifiedVenueId = await getVerifiedRollerVenueId(
          config,
          token,
          getT0171AssistedLookupVenueId(),
        );
      }
    }

    if (!bookingResult || !booking) {
      return jsonResponse(404, correlationId, {
        status: 'not_found',
        error: {
          code: 'booking_not_found',
          message: 'No Roller booking was found for the supplied identifier today.',
        },
      });
    }

    const parkTestScope = validateParkTestBookingScope(
      parkTestAccess,
      request,
      bookingResult.body,
      booking,
      verifiedVenueId,
    );
    if (!parkTestScope.ok) {
      return jsonResponse(parkTestScope.statusCode, correlationId, {
        status: parkTestScope.code === 'booking_not_found' ? 'not_found' : 'blocked',
        error: {
          code: parkTestScope.code,
          message: parkTestScope.message,
        },
      });
    }

    const scopedBooking = scopeBookingForLookupDate(booking, parkTestScope.lookupDate);

    await upsertLiveBooking(scopedBooking, config.env, parkTestScope.venueId ?? request.venueId);
    await reconcilePrepaymentDraftFromPaidBooking(scopedBooking, 'roller_live_lookup', correlationId);
    const eligibility = evaluateEligibility(scopedBooking, request);
    const guestAccess = await createGuestAccessToken(scopedBooking.rollerUniqueId);

    return jsonResponse(200, correlationId, {
      status: 'found',
      booking: scopedBooking,
      eligibility,
      guestAccess,
      source: {
        system: 'roller',
        environment: config.env,
        lookupPath,
        localLookupStatus: localResult.status,
        productCatalog: products.status,
        refreshedFromRoller: true,
        searchMatchCount,
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

async function handleT0201ControlledT30EmailRefresh(event, correlationId) {
  const detail = event?.detail ?? {};
  if (
    !isParkTestEnvironment() ||
    isEmergencyStopEnabled() ||
    process.env.ENABLE_T0201_CONTROLLED_T30_EMAIL_REFRESH !== 'true' ||
    stringOrNull(detail.approval) !== T0201_CONTROLLED_T30_EMAIL_APPROVAL
  ) {
    return jsonResponse(409, correlationId, {
      status: 'blocked',
      verification: { ok: false, reason: 't0201_refresh_gate_closed' },
    });
  }

  const identifier = stringOrNull(detail.identifier);
  const expectedIdentifierSha256 = stringOrNull(detail.expectedIdentifierSha256)?.toLowerCase();
  const expectedVenueId = stringOrNull(detail.expectedVenueId);
  const expectedBookingDate = normalizeDate(detail.expectedBookingDate);
  const expectedStartTime = normalizeClockTime(detail.expectedStartTime);
  if (
    !identifier ||
    !/^[a-f0-9]{64}$/.test(expectedIdentifierSha256 ?? '') ||
    expectedVenueId !== '50871' ||
    !expectedBookingDate ||
    !expectedStartTime
  ) {
    return jsonResponse(400, correlationId, {
      status: 'invalid_request',
      verification: { ok: false, reason: 't0201_refresh_request_invalid' },
    });
  }

  const config = await getRollerConfig();
  const token = await getRollerAccessToken(config);
  const detailResult = await getBookingDetail(config, token, identifier);
  if (detailResult.status === 404) {
    return jsonResponse(200, correlationId, {
      status: 'verified',
      verification: { ok: false, reason: 'roller_booking_not_found', refreshedFromRoller: true },
    });
  }
  if (!detailResult.ok || !detailResult.body) {
    const error = new Error('Roller booking refresh failed.');
    error.code = 'roller_lookup_failed';
    throw error;
  }

  const verifiedVenueId = await getVerifiedT0201RollerVenueId(config, token);
  const checks = evaluateT0201ControlledT30RollerBooking(detailResult.body, {
    expectedBookingDate,
    expectedIdentifierSha256,
    expectedStartTime,
    expectedVenueId,
    verifiedVenueId,
  });
  const reason = Object.entries(checks).find(([, passed]) => !passed)?.[0] ?? 'verified';
  const ok = Object.values(checks).every(Boolean);

  if (!ok) {
    console.warn(JSON.stringify({
      checks,
      correlationId,
      event: 't0201_authoritative_booking_refresh_blocked',
      reason,
    }));
  }

  return jsonResponse(200, correlationId, {
    status: 'verified',
    verification: {
      checks,
      ok,
      reason,
      refreshedFromRoller: true,
    },
  });
}

function evaluateT0201ControlledT30RollerBooking(rollerBooking, expected) {
  const booking = normalizeBooking(rollerBooking, { byId: new Map() });
  const identifierMatches = [booking.bookingReference, booking.rollerUniqueId]
    .filter(Boolean)
    .some((value) => hashString(value) === expected.expectedIdentifierSha256);
  const bookingVenueId = extractVenueId(rollerBooking);
  const venueMatches =
    expected.verifiedVenueId === expected.expectedVenueId &&
    (!bookingVenueId || bookingVenueId === expected.expectedVenueId);
  const scheduleMatches = booking.items.some(
    (item) =>
      normalizeDate(item.bookingDate) === expected.expectedBookingDate &&
      normalizeClockTime(item.startTime) === expected.expectedStartTime,
  );
  const status = String(booking.status ?? '').trim().toLowerCase();
  const bookingIsActive = Boolean(status) && !['cancelled', 'deleted', 'draft'].includes(status);

  return {
    bookingIsActive,
    identifierMatches,
    paymentIsSettled: isPaymentSettled(booking),
    scheduleMatches,
    venueMatches,
  };
}

function isT0201ControlledT30EmailRefreshEvent(event) {
  return (
    stringOrNull(event?.source) === 'jumpyard.t0201-controlled-t30-email' &&
    stringOrNull(event?.detail?.trigger) === 'authoritative_booking_refresh'
  );
}

function normalizeClockTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}

function parseRequest(event) {
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
    const parsed = JSON.parse(body);
    const identifier = String(parsed.identifier ?? '').trim();
    const identifierType = inferIdentifierType(identifier);

    const expectedDate = normalizeDate(parsed.expectedDate) || getVenueToday();

    return {
      venueId: parsed.venueId ? String(parsed.venueId).trim() : null,
      identifier,
      identifierType,
      expectedDate,
      expectedStartTime: parsed.expectedStartTime ? String(parsed.expectedStartTime).trim() : null,
      correlationId: normalizeCorrelationId(parsed.correlationId),
    };
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'invalid_json';
    throw error;
  }
}

function inferIdentifierType(identifier) {
  const normalized = String(identifier ?? '').trim();

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'email';
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return 'rollerUniqueId';
  }

  if (isLikelyPhoneIdentifier(normalized)) {
    return 'phone';
  }

  if (/^\d{5,12}$/.test(normalized)) {
    return 'bookingReference';
  }

  return 'unknown';
}

function shouldTryLocalLookup(request) {
  return request.identifierType !== 'email' && request.identifierType !== 'phone';
}

function isLikelyPhoneIdentifier(value) {
  const text = String(value ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^\+|^00/.test(text)) return true;
  if (/^0\d{6,14}$/.test(digits)) return true;
  return /[\s()/-]/.test(text) && digits.length >= 7;
}

function getVenueToday(now = new Date()) {
  return getStockholmNowParts(now).date;
}

function getStockholmNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
  }).formatToParts(now);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(byType.hour);
  const minute = Number(byType.minute);

  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    minuteOfDay: Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null,
  };
}

function createCorrelationId() {
  return `jy_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeCorrelationId(value) {
  const normalized = String(value ?? '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/.test(normalized) ? normalized : null;
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
       b.normalized_summary ->> 'bookingCustomerId' AS booking_customer_id,
       COALESCE(
         NULLIF(b.normalized_summary ->> 'bookingName', ''),
         NULLIF(b.normalized_summary ->> 'name', '')
       ) AS booking_name,
       b.normalized_summary ->> 'customerFirstName' AS customer_first_name,
       b.normalized_summary ->> 'customerLastName' AS customer_last_name,
       b.normalized_summary ->> 'externalId' AS external_id,
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
    bookingCustomerId: stringOrNull(row.booking_customer_id),
    bookingDate: stringOrNull(row.booking_date),
    bookingName: stringOrNull(row.booking_name),
    bookingReference: stringOrNull(row.booking_reference),
    bookingStatus: stringOrNull(row.booking_status),
    customerFirstName: stringOrNull(row.customer_first_name),
    customerLastName: stringOrNull(row.customer_last_name),
    endTime: stringOrNull(row.end_time),
    externalId: stringOrNull(row.external_id),
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
      AND COALESCE(product.expires_at, product.fetched_at + interval '24 hours') > now()
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
    bookingName: bookingRow.bookingName,
    bookingReference: bookingRow.bookingReference,
    rollerUniqueId: bookingRow.rollerUniqueId,
    externalId: bookingRow.externalId,
    status: bookingRow.bookingStatus,
    paymentStatus: bookingRow.paymentStatus ?? bookingRow.bookingStatus,
    venueId: bookingRow.venueId,
    isTombstoned: bookingRow.isTombstoned,
    total: centsToCurrency(bookingRow.totalCents),
    amountOwing: centsToCurrency(bookingRow.amountOwingCents),
    createdDate: null,
    customer: {
      firstName: bookingRow.customerFirstName,
      fullName: bookingRow.bookingName,
      id: bookingRow.bookingCustomerId,
      lastName: bookingRow.customerLastName,
    },
    customerId: bookingRow.bookingCustomerId,
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

  if (isT0171AssistedLookupEnabled() && !hasBookingDisplayName(booking)) return false;

  return true;
}

function hasBookingDisplayName(booking) {
  return Boolean(
    stringOrNull(booking.bookingName) ||
    stringOrNull(booking.customer?.fullName) ||
    stringOrNull(booking.customer?.firstName) ||
    stringOrNull(booking.customer?.lastName),
  );
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

async function waitForRollerRequestPacing() {
  await new Promise((resolve) => setTimeout(resolve, ROLLER_VENUE_IDENTITY_DELAY_MS));
}

async function getVerifiedRollerVenueId(config, token, expectedVenueId) {
  if (String(config.env).toLowerCase() !== 'live' || !stringOrNull(expectedVenueId)) return null;

  // Keep the venue-identity request outside the preceding Roller request window.
  await waitForRollerRequestPacing();
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
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
  const venueId = extractRollerVenueIdentity(body);
  if (venueId !== stringOrNull(expectedVenueId)) return null;
  return venueId;
}

async function getVerifiedT0201RollerVenueId(config, token) {
  return getVerifiedRollerVenueId(config, token, T0201_CONTROLLED_VENUE_ID);
}

function extractRollerVenueIdentity(body) {
  for (const candidate of [body?.venue, body?.data, body]) {
    if (!isPlainObject(candidate)) continue;
    const venueId = stringOrNull(candidate.id ?? candidate.venueId ?? candidate.venueID);
    if (venueId) return venueId;
  }
  return null;
}

function extractT0201RollerVenueIdentity(body) {
  return extractRollerVenueIdentity(body);
}

async function searchBookings(config, token, date, keyword) {
  const url = buildRollerUrl(config.baseUrl, '/bookings');
  url.searchParams.set('date', date);
  url.searchParams.set('keywords', keyword);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });
  emitRollerApiMetric({ method: 'GET', operation: 'search_bookings', status: response.status, ok: response.ok });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function getBookingFromRollerSearch(config, token, products, request, access, verifiedVenueId = null) {
  const lookupDate = access.lookupDate || normalizeDate(request.expectedDate) || getVenueToday();
  const keywords = getSearchKeywordCandidates(request.identifier, request.identifierType);
  const matches = [];
  const seenIdentifiers = new Set();

  for (const keyword of keywords) {
    const searchResult = await searchBookings(config, token, lookupDate, keyword);
    if (!searchResult.ok) {
      return { status: 'roller_error', httpStatus: searchResult.status };
    }

    const searchItems = extractBookingSearchItems(searchResult.body);
    for (const item of searchItems) {
      const detailIdentifier = extractSearchBookingIdentifier(item);
      if (!detailIdentifier || seenIdentifiers.has(detailIdentifier)) continue;
      seenIdentifiers.add(detailIdentifier);

      const detailResult = await getBookingDetail(config, token, detailIdentifier);
      if (detailResult.status === 404) continue;
      if (!detailResult.ok) {
        return { status: 'roller_error', httpStatus: detailResult.status };
      }

      const booking = normalizeBooking(detailResult.body, products);
      const scope = validateParkTestBookingScope(
        access,
        request,
        detailResult.body,
        booking,
        verifiedVenueId,
      );
      if (!scope.ok) {
        if (scope.statusCode >= 500) return { status: 'scope_error', scope };
        continue;
      }

      matches.push({
        booking: scopeBookingForLookupDate(booking, scope.lookupDate),
        lookupPath: 'GET /bookings?date&keywords -> GET /bookings/{identifier}',
        rollerBooking: detailResult.body,
      });
    }
  }

  const selected = selectBestBookingSearchMatch(matches, lookupDate);
  if (!selected) return { status: 'not_found', matchCount: 0 };

  return {
    status: 'found',
    booking: selected.booking,
    lookupPath: selected.lookupPath,
    matchCount: matches.length,
    rollerBooking: selected.rollerBooking,
  };
}

function shouldUseRollerBookingSearch(request, access) {
  return access?.mode === 'assisted_lookup' && (request.identifierType === 'email' || request.identifierType === 'phone');
}

function getSearchKeywordCandidates(identifier, identifierType) {
  const raw = String(identifier ?? '').trim();
  if (!raw) return [];

  if (identifierType === 'email') {
    return [raw.toLowerCase()];
  }

  if (identifierType === 'phone') {
    return uniqueStrings([normalizePhoneForSearch(raw), raw.replace(/\s+/g, ''), raw]);
  }

  return [raw];
}

function normalizePhoneForSearch(value) {
  const text = String(value ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;

  if (text.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+46${digits.slice(1)}`;
  if (digits.startsWith('46')) return `+${digits}`;
  return digits;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => stringOrNull(value)).filter(Boolean)));
}

function extractBookingSearchItems(body) {
  if (Array.isArray(body)) return body;
  if (!isPlainObject(body)) return [];

  for (const key of ['items', 'bookings', 'data', 'results']) {
    if (Array.isArray(body[key])) return body[key];
  }

  return [];
}

function extractSearchBookingIdentifier(item) {
  if (!isPlainObject(item)) return null;

  return firstObjectString(item, [
    'uniqueId',
    'bookingUniqueId',
    'bookingReference',
    'reference',
    'id',
    'bookingId',
  ]);
}

function selectBestBookingSearchMatch(matches, lookupDate, now = new Date()) {
  const candidates = matches
    .map((match, index) => ({
      ...match,
      index,
      startMinute: getBookingStartMinute(match.booking, lookupDate),
    }))
    .filter((match) => match.booking);

  if (candidates.length === 0) return null;

  const nowParts = getStockholmNowParts(now);
  const currentMinute = nowParts.date === lookupDate ? nowParts.minuteOfDay : null;
  const upcoming =
    currentMinute === null ? [] : candidates.filter((match) => match.startMinute !== null && match.startMinute >= currentMinute);
  const sortable = upcoming.length > 0 ? upcoming : candidates;

  sortable.sort((left, right) => {
    const leftMinute = left.startMinute ?? Number.MAX_SAFE_INTEGER;
    const rightMinute = right.startMinute ?? Number.MAX_SAFE_INTEGER;
    if (leftMinute !== rightMinute) return leftMinute - rightMinute;
    return left.index - right.index;
  });

  return sortable[0] ?? null;
}

function getBookingStartMinute(booking, lookupDate) {
  const items = Array.isArray(booking?.items) ? booking.items : [];
  const minutes = items
    .filter((item) => !lookupDate || normalizeDate(item.bookingDate) === lookupDate)
    .map((item) => timeToMinutes(item.startTime))
    .filter((value) => value !== null)
    .sort((left, right) => left - right);

  return minutes[0] ?? null;
}

function timeToMinutes(value) {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
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
  const customer = normalizeBookingCustomer(booking);
  const bookingName = firstObjectString(booking, ['bookingName', 'name', 'title']) || customer.fullName;

  return {
    bookingName,
    bookingReference: stringOrNull(booking.bookingReference ?? booking.reference),
    rollerUniqueId: stringOrNull(booking.uniqueId ?? booking.id),
    externalId: stringOrNull(booking.externalId),
    status: stringOrNull(booking.status ?? booking.bookingStatus),
    paymentStatus: stringOrNull(booking.paymentStatus ?? booking.status ?? booking.bookingStatus),
    venueId: stringOrNull(booking.venueId ?? booking.venue?.id),
    total: numberOrNull(booking.total ?? booking.costs?.total),
    amountOwing: numberOrNull(booking.amountOwing ?? booking.remainder ?? booking.costs?.amountOwing),
    createdDate: stringOrNull(booking.createdDate),
    customer,
    customerId: customer.id,
    items: items.map((item) => normalizeBookingItem(item, products.byId)),
  };
}

function normalizeBookingCustomer(booking) {
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
    fullName: null,
    id: stringOrNull(booking?.customerId ?? booking?.customer?.id),
    lastName: null,
    phone: null,
  };

  for (const candidate of candidates) {
    customer.id =
      customer.id ||
      firstObjectString(candidate, ['customerId', 'customerID']) ||
      (candidate === booking ? null : firstObjectString(candidate, ['id']));
    customer.firstName =
      customer.firstName || firstObjectString(candidate, ['firstName', 'first_name', 'givenName', 'given_name']);
    customer.lastName =
      customer.lastName || firstObjectString(candidate, ['lastName', 'last_name', 'familyName', 'family_name', 'surname']);
    customer.fullName =
      customer.fullName ||
      firstObjectString(candidate, ['fullName', 'full_name', 'customerName', 'bookingHolderName', 'name', 'bookingName']);
  }

  const nameParts = splitCustomerName(customer.fullName);
  customer.firstName = customer.firstName || nameParts.firstName;
  customer.lastName = customer.lastName || nameParts.lastName;
  if (!customer.fullName && (customer.firstName || customer.lastName)) {
    customer.fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
  }

  return customer;
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

function isEmergencyStopEnabled() {
  return process.env.JUMPYARD_EMERGENCY_STOP !== 'false';
}

async function validateParkTestLookupAccess(request) {
  const identifier = request.identifier;

  if (isEmergencyStopEnabled()) {
    return {
      ok: false,
      statusCode: 409,
      code: 'emergency_stop_active',
      message: 'Park-test booking lookup is disabled while the JumpYard emergency stop is active.',
    };
  }

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
    const lookupDate = normalizeDate(request.expectedDate) || getVenueToday();
    const allowedDates = getT0171AssistedLookupAllowedOperatingDates();

    if (allowedDates.length === 0) {
      return {
        ok: false,
        statusCode: 500,
        code: 'lookup_config_error',
        message: 'Assisted park-test lookup has no approved operating dates.',
      };
    }

    if (!lookupDate || !allowedDates.includes(lookupDate)) {
      return {
        ok: false,
        statusCode: 403,
        code: 'live_lookup_not_allowed',
        message: 'Assisted park-test lookup is only approved for the current operating date.',
      };
    }

    if (!isAssistedLookupIdentifierShapeAllowed(identifier, request.identifierType)) {
      return {
        ok: false,
        statusCode: 403,
        code: 'live_lookup_not_allowed',
        message: 'Only booking references, email, or phone are approved for assisted park-test lookup.',
      };
    }

    return { ok: true, lookupDate, mode: 'assisted_lookup' };
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

function needsVerifiedAssistedLookupVenue(access, rollerBooking, booking) {
  return (
    access?.mode === 'assisted_lookup' &&
    !extractVenueId(rollerBooking) &&
    !stringOrNull(booking?.venueId)
  );
}

function validateParkTestBookingScope(access, request, rollerBooking, booking, verifiedVenueId = null) {
  if (!isParkTestEnvironment() || access?.mode !== 'assisted_lookup') {
    return { ok: true, venueId: request.venueId };
  }

  const allowedDates = getT0171AssistedLookupAllowedOperatingDates();
  const bookingDates = getBookingOperatingDates(booking);
  const lookupDate = access.lookupDate || normalizeDate(request.expectedDate) || getVenueToday();

  if (allowedDates.length === 0) {
    return {
      ok: false,
      statusCode: 500,
      code: 'lookup_config_error',
      message: 'Assisted park-test lookup has no approved operating dates.',
    };
  }

  if (!lookupDate || !allowedDates.includes(lookupDate)) {
    return {
      ok: false,
      statusCode: 403,
      code: 'live_lookup_not_allowed',
      message: 'This booking is outside the approved park-test operating date.',
    };
  }

  if (bookingDates.length === 0 || !bookingDates.includes(lookupDate)) {
    return {
      ok: false,
      statusCode: 404,
      code: 'booking_not_found',
      message: 'No approved booking was found for the current operating date.',
    };
  }

  const approvedVenueId = getT0171AssistedLookupVenueId();
  const bookingVenueId = extractVenueId(rollerBooking) || stringOrNull(booking?.venueId);
  const rollerVenueId = bookingVenueId || stringOrNull(verifiedVenueId);

  if (!approvedVenueId) {
    return {
      ok: false,
      statusCode: 500,
      code: 'lookup_config_error',
      message: 'Assisted park-test lookup has no approved venue.',
    };
  }

  if (!rollerVenueId || rollerVenueId !== approvedVenueId) {
    return {
      ok: false,
      statusCode: 403,
      code: 'live_lookup_not_allowed',
      message: 'This booking is outside the approved park-test venue.',
    };
  }

  return { ok: true, lookupDate, venueId: rollerVenueId };
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

function isAssistedLookupIdentifierShapeAllowed(identifier, identifierType = inferIdentifierType(identifier)) {
  const normalized = String(identifier ?? '').trim();
  if (identifierType === 'email' || identifierType === 'phone') return true;

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

function scopeBookingForLookupDate(booking, lookupDate) {
  const date = normalizeDate(lookupDate);
  if (!booking || !date || !Array.isArray(booking.items)) return booking;

  const scopedItems = booking.items.filter((item) => normalizeDate(item.bookingDate) === date);
  if (scopedItems.length === 0) return booking;

  return {
    ...booking,
    items: scopedItems,
  };
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
          bookingCustomerId: booking.customerId,
          bookingName: booking.bookingName,
          customerFirstName: booking.customer?.firstName ?? null,
          customerLastName: booking.customer?.lastName ?? null,
          externalId: booking.externalId,
          itemCount: booking.items.length,
          name: booking.bookingName ?? booking.customer?.fullName ?? null,
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

async function reconcilePrepaymentDraftFromPaidBooking(booking, source, correlationId) {
  if (!booking?.rollerUniqueId || !booking.bookingReference || !isPaymentSettled(booking)) return [];

  const result = await executeStatement(
    `UPDATE jumpyard.prepayment_booking_drafts
     SET status = 'published',
         payment_attempt_status = CASE
           WHEN payment_channel = 'card_present' AND payment_attempt_status = 'approved' THEN 'reconciled'
           ELSE payment_attempt_status
         END,
         booking_confirmation_status = CASE
           WHEN payment_channel = 'card_present' AND payment_attempt_status IN ('approved', 'reconciled') THEN 'confirmed'
           ELSE booking_confirmation_status
         END,
         roller_booking_reference = CASE
           WHEN payment_channel = 'card_present' THEN :bookingReference
           ELSE roller_booking_reference
         END,
         amount_owing_cents = COALESCE(:amountOwingCents, 0),
         total_cents = COALESCE(:totalCents, total_cents),
         reconciliation_completed_at = CASE
           WHEN payment_channel = 'card_present' AND payment_attempt_status IN ('approved', 'reconciled')
             THEN COALESCE(reconciliation_completed_at, now())
           ELSE reconciliation_completed_at
         END,
         reconciliation_last_result = CASE
           WHEN payment_channel = 'card_present' AND payment_attempt_status IN ('approved', 'reconciled')
             THEN 'confirmed_by_lookup'
           ELSE reconciliation_last_result
         END,
         updated_at = now()
     WHERE roller_draft_unique_id = :rollerUniqueId
       AND status IN ('payment_pending', 'payment_blocked')
     RETURNING prepayment_draft_id, flow_type`,
    [
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      intParameter('amountOwingCents', currencyToCents(booking.amountOwing)),
      intParameter('totalCents', currencyToCents(booking.total)),
    ],
  );

  const updatedDrafts = mappedRows(result);
  for (const draft of updatedDrafts) {
    await recordPrepaymentDraftPublishedEvent(booking, draft, source);
  }

  await requestKioskAuthoritativeConfirmation(booking, source, correlationId);

  const updatedLinks = await reconcileLinkedAddOnBookingLinks(booking, source);
  for (const link of updatedLinks) {
    await recordBookingLinkPublishedEvent(booking, link, source);
  }

  return updatedDrafts;
}

async function requestKioskAuthoritativeConfirmation(booking, source, correlationId) {
  const externalId = stringOrNull(booking?.externalId);
  if (!externalId) return null;

  const result = await executeStatement(
    `SELECT prepayment_draft_id, payment_attempt_id
     FROM jumpyard.prepayment_booking_drafts
     WHERE external_id = :externalId
       AND payment_channel = 'card_present'
       AND flow_type = 'new_booking'
       AND payment_attempt_status IN ('approved', 'reconciled')
       AND status IN ('payment_pending', 'payment_blocked', 'published')
     ORDER BY created_at DESC
     LIMIT 2`,
    [stringParameter('externalId', externalId)],
  );
  const candidates = mappedRows(result);
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) {
    const error = new Error('The authoritative kiosk confirmation candidate was ambiguous.');
    error.code = 'kiosk_confirmation_ambiguous';
    throw error;
  }

  const functionName = stringOrNull(process.env.KIOSK_AUTHORITATIVE_CONFIRMATION_FUNCTION_NAME);
  if (!functionName) {
    const error = new Error('The internal kiosk confirmation function is not configured.');
    error.code = 'kiosk_confirmation_configuration_error';
    throw error;
  }
  const candidate = candidates[0];
  const response = await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({
      source: 'jumpyard.kiosk-authoritative-confirmation',
      detail: {
        bookingReference: booking.bookingReference,
        correlationId,
        externalId,
        paymentAttemptId: candidate.payment_attempt_id,
        prepaymentDraftId: candidate.prepayment_draft_id,
        rollerUniqueId: booking.rollerUniqueId,
        trigger: source,
      },
    })),
  }));
  const payload = response.Payload
    ? JSON.parse(Buffer.from(response.Payload).toString('utf8'))
    : null;
  if (response.FunctionError || payload?.status !== 'confirmed') {
    const error = new Error('The authoritative kiosk Handoff attachment did not complete.');
    error.code = 'kiosk_confirmation_failed';
    throw error;
  }
  return payload;
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
  const amountOwing = numberOrNull(booking.amountOwing);
  const payment = classifyPaymentState({
    amountOwing,
    bookingStatus: booking.status,
    paymentStatus: booking.paymentStatus,
  });
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

  if (isUnsettledPaymentState(payment.state)) {
    return {
      canCheckIn: false,
      reason: 'payment_required',
      requiresStaff: true,
      redeemableTicketCount,
      amountOwing: amountOwing ?? 0,
      paymentState: payment.state,
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
    paymentState: payment.state,
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

async function createGuestAccessToken(rollerUniqueId) {
  if (!rollerUniqueId) {
    const error = new Error('A Roller unique id is required before guest access can be issued.');
    error.code = 'guest_access_token_error';
    throw error;
  }

  const expiresAt = new Date(Date.now() + GUEST_ACCESS_TTL_MINUTES * 60 * 1000).toISOString();

  // This is a steady-state safety cap, not a database uniqueness guarantee: concurrent first-time
  // lookups may briefly overshoot it. Never evict a still-valid credential, because doing so would
  // let another caller interrupt an in-progress guest. T0195 owns final retention/purge policy.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = hashString(token);
    const result = await executeStatement(
      `WITH pruned AS (
         DELETE FROM jumpyard.checkin_tokens
         WHERE roller_unique_id = :rollerUniqueId
           AND channel = :channel
           AND (consumed_at IS NOT NULL OR expires_at <= now())
         RETURNING token_hash
       ),
       capacity AS (
         SELECT
           COUNT(*)::int AS active_count,
           (SELECT COUNT(*)::int FROM pruned) AS pruned_count
         FROM jumpyard.checkin_tokens
         WHERE roller_unique_id = :rollerUniqueId
           AND channel = :channel
           AND consumed_at IS NULL
           AND expires_at > now()
       ),
       inserted AS (
         INSERT INTO jumpyard.checkin_tokens (
           token_hash,
           roller_unique_id,
           channel,
           expires_at
         )
         SELECT
           :tokenHash,
           :rollerUniqueId,
           :channel,
           CAST(:expiresAt AS timestamptz)
         FROM capacity
         WHERE active_count < :activeTokenLimit
         ON CONFLICT (token_hash) DO NOTHING
         RETURNING expires_at::text AS expires_at
       )
       SELECT inserted.expires_at, capacity.active_count
       FROM capacity
       LEFT JOIN inserted ON true`,
      [
        stringParameter('tokenHash', tokenHash),
        stringParameter('rollerUniqueId', rollerUniqueId),
        stringParameter('channel', GUEST_ACCESS_CHANNEL),
        stringParameter('expiresAt', expiresAt),
        intParameter('activeTokenLimit', MAX_ACTIVE_GUEST_ACCESS_TOKENS_PER_BOOKING),
      ],
    );
    const row = firstMappedRow(result);
    if (stringOrNull(row?.expires_at)) {
      return {
        expiresAt: stringOrNull(row.expires_at),
        token,
      };
    }

    if ((numberOrNull(row?.active_count) ?? 0) >= MAX_ACTIVE_GUEST_ACCESS_TOKENS_PER_BOOKING) {
      const error = new Error('Too many active guest access credentials exist for this booking.');
      error.code = 'guest_access_rate_limited';
      throw error;
    }
  }

  const error = new Error('Could not allocate a unique guest access token.');
  error.code = 'guest_access_token_error';
  throw error;
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

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

// GH-338 payment-state classification (begin). Keep this block identical in lookup, session and redeem.
const PAID_STATUS_TOKENS = new Set(['paid', 'paidinfull', 'fullypaid', 'nopaymentrequired']);
const PARTIALLY_PAID_STATUS_TOKENS = new Set(['partiallypaid', 'partialpayment', 'partial']);
const PENDING_PAYMENT_STATUS_TOKENS = new Set(['pendingpayment', 'pending', 'awaitingpayment', 'paymentpending']);
const UNPAID_STATUS_TOKENS = new Set(['unpaid', 'notpaid', 'overdue']);

function normalizePaymentStatusToken(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

// Exact token matching only: "PartiallyPaid" and "Unpaid" must never count as paid, and a
// missing amount owing is not evidence of payment. Roller stays authoritative for the final
// redemption; this only decides what JumpYard Cloud lets through before that.
function classifyPaymentState({ amountOwing, bookingStatus, paymentStatus }) {
  const tokens = [paymentStatus, bookingStatus].map(normalizePaymentStatusToken).filter(Boolean);
  const owing = typeof amountOwing === 'number' && Number.isFinite(amountOwing) ? amountOwing : null;
  if (tokens.some((token) => PARTIALLY_PAID_STATUS_TOKENS.has(token))) return { state: 'partially_paid', evidence: 'status' };
  if (tokens.some((token) => PENDING_PAYMENT_STATUS_TOKENS.has(token))) return { state: 'pending', evidence: 'status' };
  if (tokens.some((token) => UNPAID_STATUS_TOKENS.has(token))) return { state: 'unpaid', evidence: 'status' };
  if (owing !== null && owing > 0) return { state: 'unpaid', evidence: 'amount' };
  if (tokens.some((token) => PAID_STATUS_TOKENS.has(token))) return { state: 'paid', evidence: 'status' };
  if (owing === 0) return { state: 'paid', evidence: 'amount' };
  return { state: 'unknown', evidence: 'none' };
}

function isUnsettledPaymentState(state) {
  return state === 'partially_paid' || state === 'pending' || state === 'unpaid';
}
// GH-338 payment-state classification (end).

// Settlement needs an explicit paid status; a zero or missing amount alone never settles a draft.
function isPaymentSettled(booking) {
  const payment = classifyPaymentState({
    amountOwing: numberOrNull(booking.amountOwing),
    bookingStatus: booking.status,
    paymentStatus: booking.paymentStatus,
  });
  return payment.state === 'paid' && payment.evidence === 'status';
}

function classifyError(error) {
  if (error.code === 'guest_access_rate_limited') {
    return {
      statusCode: 429,
      status: 'blocked',
      code: 'guest_access_rate_limited',
      message: 'Too many active guest sessions exist for this booking. Try again later or ask staff for help.',
    };
  }

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

exports._internal = {
  extractRollerVenueIdentity,
  getSearchKeywordCandidates,
  getStockholmNowParts,
  inferIdentifierType,
  needsVerifiedAssistedLookupVenue,
  normalizePhoneForSearch,
  scopeBookingForLookupDate,
  selectBestBookingSearchMatch,
  validateParkTestBookingScope,
};
