const crypto = require('crypto');
const {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} = require('@aws-sdk/client-rds-data');
const { GetSecretValueCommand, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');

const DATABASE_NAME = 'jumpyard_cloud';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_PRODUCT_TTL_HOURS = 24;
const DATA_SYNC_SOURCE = 'scheduled_data_api_sync';
const SOURCE_BOOKINGITEMS = 'scheduled_data_api_sync_bookingitems';
const SOURCE_TICKETS = 'scheduled_data_api_sync_tickets';
const SOURCE_PAYMENTS = 'scheduled_data_api_sync_bookingpayments';
const SOURCE_CUSTOMERS = 'scheduled_data_api_sync_customers';
const SOURCE_PRODUCTS = 'scheduled_data_api_sync_products';
const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

let cachedRollerConfig = null;
let cachedToken = null;

exports.handler = async (event = {}) => {
  const startedAt = new Date().toISOString();
  const correlationId = stringOrNull(event.correlationId) || createCorrelationId();
  const sourceWindow = resolveSourceWindow(event);
  const pageSize = positiveInteger(event.pageSize) || positiveInteger(process.env.ROLLER_DATA_SYNC_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const maxPages = positiveInteger(event.maxPages) || positiveInteger(process.env.ROLLER_DATA_SYNC_MAX_PAGES) || DEFAULT_MAX_PAGES;
  const venueId = process.env.JUMPYARD_VENUE_ID || process.env.RESOURCE_PREFIX || 'jumpyard-check-in-dev';
  const runId = `scheduled-data-api:${sourceWindow.startDate}:${sourceWindow.endDate}:${Date.now()}`;
  const context = createDbContext();
  let transactionId = null;

  try {
    const config = await getRollerConfig();
    const token = await getRollerAccessToken(config);

    await insertRun(context, {
      runId,
      rollerEnv: config.env,
      venueId,
      sourceWindow,
    });

    const controls = { maxPages, pageSize, sourceWindow };
    const bookingItemRecords = await fetchDataApiRecords(config, token, '/data/bookingitems', controls);
    const ticketRecords = await fetchDataApiRecords(config, token, '/data/tickets', controls);
    const paymentRecords = await fetchDataApiRecords(config, token, '/data/bookingpayments', controls);
    const customerRecords = await fetchDataApiRecords(config, token, '/data/customers', controls);
    const productRecords = event.skipProducts ? [] : await requestProducts(config, token, '/products');

    const bookingImport = normalizeBookingItems(bookingItemRecords.records);
    const relatedImport = normalizeRelated(ticketRecords.records, paymentRecords.records, customerRecords.records);
    const products = event.skipProducts ? [] : flattenProducts(productRecords, config.env, venueId);

    const begin = await rdsClient.send(
      new BeginTransactionCommand({
        database: DATABASE_NAME,
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
      }),
    );
    transactionId = begin.transactionId;

    if (!transactionId) {
      throw new Error('Could not start Aurora Data API transaction.');
    }

    const upserts = {
      bookingItems: 0,
      bookings: 0,
      customers: 0,
      payments: 0,
      products: 0,
      productEnrichments: 0,
      tickets: 0,
    };

    for (const booking of bookingImport.bookings) {
      upserts.bookings += await upsertBooking(context, booking, config.env, venueId, transactionId);
    }

    for (const item of bookingImport.items) {
      upserts.bookingItems += await upsertBookingItem(context, item, transactionId);
    }

    for (const ticket of relatedImport.tickets) {
      upserts.tickets += await upsertTicket(context, ticket, transactionId);
    }

    for (const payment of relatedImport.payments) {
      upserts.payments += await upsertPayment(context, payment, transactionId);
    }

    for (const customer of relatedImport.customers) {
      upserts.customers += await upsertCustomer(context, customer, transactionId);
    }

    for (const product of products) {
      upserts.products += await upsertProduct(context, product, config.env, venueId, transactionId);
    }

    if (products.length > 0) {
      upserts.productEnrichments = await enrichBookingItems(context, config.env, venueId, transactionId);
    }

    await rdsClient.send(
      new CommitTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );
    transactionId = null;

    const sourceCounts = {
      bookingitems: bookingItemRecords.records.length,
      bookingitemsTotalItems: bookingItemRecords.totalItems,
      customers: customerRecords.records.length,
      customersTotalItems: customerRecords.totalItems,
      payments: paymentRecords.records.length,
      paymentsTotalItems: paymentRecords.totalItems,
      products: products.length,
      skippedBookingitems: bookingImport.skippedRecords,
      skippedCustomers: relatedImport.skippedCustomers,
      skippedPayments: relatedImport.skippedPayments,
      skippedTickets: relatedImport.skippedTickets,
      tickets: ticketRecords.records.length,
      ticketsTotalItems: ticketRecords.totalItems,
    };

    await finishRun(context, runId, 'succeeded', sourceCounts, upserts);

    const summary = {
      correlationId,
      durationMs: Date.now() - Date.parse(startedAt),
      maxPages,
      pageSize,
      runId,
      sourceWindow,
      status: 'succeeded',
      sourceCounts,
      upserts,
    };

    console.info(JSON.stringify(summary));
    return summary;
  } catch (error) {
    if (transactionId) {
      await rdsClient.send(
        new RollbackTransactionCommand({
          resourceArn: context.clusterArn,
          secretArn: context.secretArn,
          transactionId,
        }),
      );
    }

    await safeFinishFailedRun(context, runId, error);
    console.error(
      JSON.stringify({
        correlationId,
        error: safeErrorMessage(error),
        runId,
        sourceWindow,
        status: 'failed',
      }),
    );
    throw error;
  }
};

function resolveSourceWindow(event) {
  const eventStart = stringOrNull(event.startDate);
  const eventEnd = stringOrNull(event.endDate);
  const today = new Date().toISOString().slice(0, 10);
  const startDate = eventStart || addDays(today, -1);
  const endDate = eventEnd || addDays(startDate, 1);

  validateDateWindow(startDate, endDate);
  return { endDate, startDate };
}

function validateDateWindow(startDate, endDate) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error('Data API sync dates must be YYYY-MM-DD.');
  }

  if (endDate <= startDate) {
    throw new Error('Data API sync endDate must be after startDate.');
  }
}

async function fetchDataApiRecords(config, token, endpointPath, controls) {
  const records = [];
  let totalItems = null;
  let totalPages = null;
  let pageNumber = 1;

  while (pageNumber <= controls.maxPages) {
    const url = buildRollerUrl(config.baseUrl, endpointPath);
    url.searchParams.set('startDate', controls.sourceWindow.startDate);
    url.searchParams.set('endDate', controls.sourceWindow.endDate);
    url.searchParams.set('pageNumber', String(pageNumber));
    url.searchParams.set('pageSize', String(controls.pageSize));

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      },
    });
    emitRollerApiMetric({
      method: 'GET',
      operation: rollerOperationFromEndpointPath(endpointPath),
      status: response.status,
      ok: response.ok,
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(`Roller Data API request to ${endpointPath} failed with HTTP ${response.status}.`);
    }

    if (!isRecord(body) || !Array.isArray(body.items)) {
      throw new Error(`Roller Data API response from ${endpointPath} did not include an items array.`);
    }

    records.push(...body.items);
    totalItems = numberOrNull(body.totalItems);
    totalPages = numberOrNull(body.totalPages);

    if (totalPages !== null && pageNumber >= totalPages) break;
    if (body.items.length < controls.pageSize) break;

    pageNumber += 1;
  }

  return { records, totalItems };
}

async function requestProducts(config, token, endpointPath) {
  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });
  emitRollerApiMetric({
    method: 'GET',
    operation: rollerOperationFromEndpointPath(endpointPath),
    status: response.status,
    ok: response.ok,
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Roller product read failed with HTTP ${response.status}.`);
  }

  const products = extractProductArray(body);
  if (!products) {
    throw new Error('Roller product response was not an array or known product wrapper.');
  }

  return products;
}

function normalizeBookingItems(records) {
  const bookingGroups = new Map();
  const items = [];
  let skippedRecords = 0;

  for (const record of records) {
    const rollerUniqueId = stringOrNull(record.bookingUniqueId);
    const bookingReference = stringOrNull(record.bookingReference);

    if (!rollerUniqueId || !bookingReference) {
      skippedRecords += 1;
      continue;
    }

    const group = bookingGroups.get(rollerUniqueId) || [];
    group.push(record);
    bookingGroups.set(rollerUniqueId, group);
    items.push(normalizeBookingItem(record, rollerUniqueId));
  }

  return {
    bookings: [...bookingGroups.entries()].map(([rollerUniqueId, group]) => normalizeBooking(rollerUniqueId, group)),
    items,
    skippedRecords,
  };
}

function normalizeBooking(rollerUniqueId, records) {
  const first = records[0];
  const bookingDates = records.map((record) => stringOrNull(record.bookingDate)).filter(Boolean);
  const startTimes = records.map((record) => timeOrNull(record.sessionStart)).filter(Boolean);
  const endTimes = records.map((record) => timeOrNull(record.sessionEnd)).filter(Boolean);
  const modifiedDates = records.map((record) => timestampOrNull(record.bookingModifiedDate)).filter(Boolean).sort();
  const bookingReference = stringOrNull(first.bookingReference);
  const safeSummary = {
    bookingCompanyId: stringOrNull(first.bookingCompanyId),
    bookingCreatedDate: timestampOrNull(first.bookingCreatedDate),
    bookingCustomerId: stringOrNull(first.bookingCustomerId),
    bookingEndDate: dateOrNull(first.bookingEndDate),
    bookingFeeAmountCents: centsOrNull(first.bookingFeeAmount),
    bookingLocation: stringOrNull(first.bookingLocation),
    itemCount: records.length,
    source: SOURCE_BOOKINGITEMS,
  };

  return {
    bookingDate: minOrNull(bookingDates),
    bookingReference,
    bookingStatus: stringOrNull(first.bookingStatus),
    customerId: stringOrNull(first.bookingCustomerId),
    endTime: maxOrNull(endTimes),
    itemCount: records.length,
    latestModifiedAt: modifiedDates[modifiedDates.length - 1] || null,
    location: stringOrNull(first.bookingLocation),
    payloadHash: hashJson(safeSummary),
    rollerUniqueId,
    startTime: minOrNull(startTimes),
    totalCents: centsOrNull(first.bookingTotal),
  };
}

function normalizeBookingItem(record, rollerUniqueId) {
  const bookingItemId = stringOrNull(record.bookingItemId);
  const productId = stringOrNull(record.productId);
  const bookingDate = dateOrNull(record.bookingDate);
  const startTime = timeOrNull(record.sessionStart);
  const endTime = timeOrNull(record.sessionEnd);
  const quantity = positiveInteger(record.quantity) || 1;
  const keySource = bookingItemId || `${rollerUniqueId}:${productId || 'unknown'}:${bookingDate || ''}:${startTime || ''}`;

  return {
    bookingDate,
    bookingItemId,
    bookingItemKey: `bookingitem:${hashString(keySource)}`,
    endTime,
    itemSummary: {
      barcodeId: stringOrNull(record.barcodeId),
      bookingEndDate: dateOrNull(record.bookingEndDate),
      costCents: centsOrNull(record.cost),
      createdDate: timestampOrNull(record.createdDate),
      deviceId: stringOrNull(record.deviceId),
      discountAmountCents: centsOrNull(record.discountAmount),
      groupSize: positiveInteger(record.groupSize),
      modifierCount: Array.isArray(record.modifiers) ? record.modifiers.length : 0,
      source: SOURCE_BOOKINGITEMS,
    },
    productId,
    quantity,
    rollerUniqueId,
    startTime,
  };
}

function normalizeRelated(ticketRecords, paymentRecords, customerRecords) {
  const tickets = [];
  const payments = [];
  const customers = [];
  let skippedTickets = 0;
  let skippedPayments = 0;
  let skippedCustomers = 0;

  for (const record of ticketRecords) {
    const normalized = normalizeTicket(record);
    if (normalized) tickets.push(normalized);
    else skippedTickets += 1;
  }

  for (const record of paymentRecords) {
    const normalized = normalizePayment(record);
    if (normalized) payments.push(normalized);
    else skippedPayments += 1;
  }

  for (const record of customerRecords) {
    const normalized = normalizeCustomer(record);
    if (normalized) customers.push(normalized);
    else skippedCustomers += 1;
  }

  return { customers, payments, skippedCustomers, skippedPayments, skippedTickets, tickets };
}

function normalizeTicket(record) {
  const ticketId = stringOrNull(record.ticketId);
  const bookingReference = stringOrNull(record.bookingReference);

  if (!ticketId || !bookingReference) return null;

  return {
    bookingDate: dateOrNull(record.bookingDate),
    bookingItemId: stringOrNull(record.bookingItemId),
    bookingReference,
    customTicketId: stringOrNull(record.customTicketId),
    expiryDate: dateOrNull(record.expiryDate),
    productId: stringOrNull(record.productId),
    rollerCustomerId: stringOrNull(record.customerId),
    summary: {
      createdDate: timestampOrNull(record.createdDate),
      hasTicketHolderName: Boolean(stringOrNull(record.name)),
      numberOfRecurringPayments: numberOrNull(record.numberOfRecurringPayments),
      productSubType: stringOrNull(record.productSubType),
      productType: stringOrNull(record.productType),
      recurringPaymentFrequency: stringOrNull(record.recurringPaymentFrequency),
      source: SOURCE_TICKETS,
    },
    ticketId,
  };
}

function normalizePayment(record) {
  const bookingReference = stringOrNull(record.bookingReference);
  const bookingPaymentId = stringOrNull(record.bookingPaymentId);
  const transactionId = stringOrNull(record.transactionId);
  const createdDate = timestampOrNull(record.createdDate);
  const amountCents = centsOrNull(record.total);

  if (!bookingReference) return null;

  return {
    amountCents,
    bookingPaymentId,
    bookingReference,
    createdDate,
    paymentKey: `payment:${hashString(bookingPaymentId || `${bookingReference}:${transactionId || 'no-transaction'}:${createdDate || ''}:${amountCents || ''}`)}`,
    paymentMethod: stringOrNull(record.paymentMethod),
    summary: {
      authorizingStaffId: stringOrNull(record.authorizingStaffId),
      creditCardLast4DigitsPresent: Boolean(stringOrNull(record.creditCardLast4Digits)),
      deviceId: stringOrNull(record.deviceId),
      receiptNumber: stringOrNull(record.receiptNumber),
      source: SOURCE_PAYMENTS,
      staffId: stringOrNull(record.staffId),
      tipCents: centsOrNull(record.tip),
      transactionFeeAmountCents: centsOrNull(record.transactionFeeAmount),
      transactionIdPresent: Boolean(transactionId),
    },
  };
}

function normalizeCustomer(record) {
  const rollerCustomerId = stringOrNull(record.customerId);
  const email = normalizeEmail(record.email);
  const contactNumber = normalizePhone(record.contactNumber);

  if (!rollerCustomerId && !email && !contactNumber) return null;

  return {
    contactNumber,
    contactNumberHash: contactNumber ? hashString(contactNumber) : null,
    contactNumberMasked: maskPhone(contactNumber),
    email,
    emailHash: email ? hashString(email) : null,
    emailMasked: maskEmail(email),
    guestProfileId: rollerCustomerId
      ? `roller_customer:${rollerCustomerId}`
      : `contact:${hashString(`${email || ''}:${contactNumber || ''}`)}`,
    latestBookingContext: {
      acceptMarketing: booleanOrNull(record.acceptMarketing),
      acceptMarketingSms: booleanOrNull(record.acceptMarketingSMS || record.acceptMarketingSms),
      createdDate: timestampOrNull(record.createdDate),
      flagCount: Array.isArray(record.flags) ? record.flags.length : 0,
      firstName: stringOrNull(record.firstName),
      lastName: stringOrNull(record.lastName),
      source: SOURCE_CUSTOMERS,
    },
    modifiedDate: timestampOrNull(record.modifiedDate),
    rollerCustomerId,
    smsReady: Boolean(contactNumber),
  };
}

function flattenProducts(products, rollerEnv, venueId, parent = null) {
  const flattened = [];

  for (const product of products) {
    const id = firstString(product, ['id', 'productId', 'productID', 'variationId']);
    const name = firstString(product, ['name', 'productName', 'title']);
    const productType = firstString(product, ['type', 'productType']);
    const productSubType = firstString(product, ['productSubType', 'subType']);
    const parentProductId = firstString(product, ['parentProductId', 'parentId']) || parent?.id || null;
    const parentProductName = firstString(product, ['parentProductName', 'parentName']) || parent?.name || null;
    const parentType = firstString(product, ['parentProductType', 'parentType']) || parent?.type || null;
    const barcodeId = firstString(product, ['barcodeId', 'barcode', 'sku']);
    const priceCents = centsOrNull(firstKnown(product, ['price', 'cost']));
    const currentParent = {
      id: id || parent?.id || null,
      name: name || parent?.name || null,
      type: productType || parent?.type || null,
    };

    if (id) {
      const summary = {
        barcodeId,
        id,
        isVariation: Boolean(parentProductId || parent),
        name,
        parentProductId,
        parentProductName,
        parentType,
        priceCents,
        productSubType,
        productType,
        source: SOURCE_PRODUCTS,
      };

      flattened.push({
        cacheKey: `roller_product:${rollerEnv}:${venueId}:${id}`,
        id,
        productHash: hashJson(summary),
        summary,
      });
    }

    for (const children of childCollections(product)) {
      flattened.push(...flattenProducts(children, rollerEnv, venueId, currentParent));
    }
  }

  return dedupeProducts(flattened);
}

async function insertRun(context, run) {
  await executeStatement(
    context,
    `INSERT INTO jumpyard.booking_seed_runs (
      run_id, roller_env, venue_id, date_range_start, date_range_end, status, source_counts, upsert_counts
    )
    VALUES (
      :runId,
      :rollerEnv,
      :venueId,
      CAST(:dateRangeStart AS date),
      CAST(:dateRangeEnd AS date),
      'running',
      CAST(:sourceCounts AS jsonb),
      '{}'::jsonb
    )
    ON CONFLICT (run_id) DO UPDATE SET
      status = EXCLUDED.status,
      source_counts = EXCLUDED.source_counts,
      upsert_counts = EXCLUDED.upsert_counts,
      error_summary = NULL,
      started_at = now(),
      finished_at = NULL`,
    [
      stringParameter('runId', run.runId),
      stringParameter('rollerEnv', run.rollerEnv),
      stringParameter('venueId', run.venueId),
      stringParameter('dateRangeStart', run.sourceWindow.startDate),
      stringParameter('dateRangeEnd', run.sourceWindow.endDate),
      stringParameter('sourceCounts', JSON.stringify({ source: DATA_SYNC_SOURCE })),
    ],
  );
}

async function finishRun(context, runId, status, sourceCounts, upsertCounts, errorSummary = null) {
  await executeStatement(
    context,
    `UPDATE jumpyard.booking_seed_runs
     SET status = :status,
         source_counts = CAST(:sourceCounts AS jsonb),
         upsert_counts = CAST(:upsertCounts AS jsonb),
         error_summary = :errorSummary,
         finished_at = now()
     WHERE run_id = :runId`,
    [
      stringParameter('runId', runId),
      stringParameter('status', status),
      stringParameter('sourceCounts', JSON.stringify(sourceCounts)),
      stringParameter('upsertCounts', JSON.stringify(upsertCounts)),
      stringParameter('errorSummary', errorSummary),
    ],
  );
}

async function safeFinishFailedRun(context, runId, error) {
  try {
    await finishRun(
      context,
      runId,
      'failed',
      { source: DATA_SYNC_SOURCE },
      {},
      safeErrorMessage(error).slice(0, 500),
    );
  } catch {
    // The original Lambda failure is more useful than a secondary health-write failure.
  }
}

async function upsertBooking(context, booking, rollerEnv, venueId, transactionId) {
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_bookings (
      roller_unique_id,
      booking_reference,
      roller_env,
      venue_id,
      booking_status,
      payment_status,
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
      :totalCents,
      CAST(:bookingDate AS date),
      CAST(:startTime AS time),
      CAST(:endTime AS time),
      '${DATA_SYNC_SOURCE}',
      now(),
      CAST(:rollerModifiedAt AS timestamptz),
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
      total_cents = EXCLUDED.total_cents,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      source_last_updated_by = EXCLUDED.source_last_updated_by,
      source_last_updated_at = now(),
      roller_modified_at = EXCLUDED.roller_modified_at,
      last_seen_from_roller_at = now(),
      freshness_status = EXCLUDED.freshness_status,
      is_tombstoned = EXCLUDED.is_tombstoned,
      payload_hash = EXCLUDED.payload_hash,
      normalized_summary = EXCLUDED.normalized_summary,
      updated_at = now()
    WHERE jumpyard.roller_bookings.roller_modified_at IS NULL
       OR EXCLUDED.roller_modified_at IS NULL
       OR EXCLUDED.roller_modified_at >= jumpyard.roller_bookings.roller_modified_at`,
    [
      stringParameter('rollerUniqueId', booking.rollerUniqueId),
      stringParameter('bookingReference', booking.bookingReference),
      stringParameter('rollerEnv', rollerEnv),
      stringParameter('venueId', venueId),
      stringParameter('bookingStatus', booking.bookingStatus),
      stringParameter('paymentStatus', booking.bookingStatus),
      intParameter('totalCents', booking.totalCents),
      stringParameter('bookingDate', booking.bookingDate),
      stringParameter('startTime', booking.startTime),
      stringParameter('endTime', booking.endTime),
      stringParameter('rollerModifiedAt', booking.latestModifiedAt),
      boolParameter('isTombstoned', isTombstoned(booking.bookingStatus)),
      stringParameter('payloadHash', booking.payloadHash),
      stringParameter(
        'normalizedSummary',
        JSON.stringify({
          bookingCustomerId: booking.customerId,
          bookingLocation: booking.location,
          itemCount: booking.itemCount,
          source: SOURCE_BOOKINGITEMS,
        }),
      ),
    ],
    transactionId,
  );

  return result.updated;
}

async function upsertBookingItem(context, item, transactionId) {
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_booking_items (
      booking_item_key,
      roller_unique_id,
      booking_item_id,
      product_id,
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
      quantity = EXCLUDED.quantity,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      item_summary = EXCLUDED.item_summary,
      updated_at = now()`,
    [
      stringParameter('bookingItemKey', item.bookingItemKey),
      stringParameter('rollerUniqueId', item.rollerUniqueId),
      stringParameter('bookingItemId', item.bookingItemId),
      stringParameter('productId', item.productId),
      intParameter('quantity', item.quantity),
      stringParameter('bookingDate', item.bookingDate),
      stringParameter('startTime', item.startTime),
      stringParameter('endTime', item.endTime),
      stringParameter('itemSummary', JSON.stringify(item.itemSummary)),
    ],
    transactionId,
  );

  return result.updated;
}

async function upsertTicket(context, ticket, transactionId) {
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_booking_tickets (
      ticket_id,
      roller_unique_id,
      booking_item_key,
      booking_item_id,
      roller_customer_id,
      custom_ticket_id,
      product_id,
      booking_date,
      expiry_date,
      ticket_holder_name_masked,
      locations,
      membership_status,
      last_seen_from_roller_at,
      ticket_summary
    )
    SELECT
      :ticketId,
      booking.roller_unique_id,
      item.booking_item_key,
      :bookingItemId,
      :rollerCustomerId,
      :customTicketId,
      :productId,
      CAST(:bookingDate AS date),
      CAST(:expiryDate AS date),
      NULL,
      '[]'::jsonb,
      NULLIF(:membershipStatus, ''),
      now(),
      CAST(:ticketSummary AS jsonb)
    FROM jumpyard.roller_bookings AS booking
    LEFT JOIN jumpyard.roller_booking_items AS item
      ON item.booking_item_id = :bookingItemId
    WHERE booking.booking_reference = :bookingReference
    ON CONFLICT (ticket_id) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_item_key = EXCLUDED.booking_item_key,
      booking_item_id = EXCLUDED.booking_item_id,
      roller_customer_id = EXCLUDED.roller_customer_id,
      custom_ticket_id = EXCLUDED.custom_ticket_id,
      product_id = EXCLUDED.product_id,
      booking_date = EXCLUDED.booking_date,
      expiry_date = EXCLUDED.expiry_date,
      membership_status = EXCLUDED.membership_status,
      last_seen_from_roller_at = EXCLUDED.last_seen_from_roller_at,
      ticket_summary = EXCLUDED.ticket_summary,
      updated_at = now()`,
    [
      stringParameter('ticketId', ticket.ticketId),
      stringParameter('bookingReference', ticket.bookingReference),
      stringParameter('bookingItemId', ticket.bookingItemId),
      stringParameter('rollerCustomerId', ticket.rollerCustomerId),
      stringParameter('customTicketId', ticket.customTicketId),
      stringParameter('productId', ticket.productId),
      stringParameter('bookingDate', ticket.bookingDate),
      stringParameter('expiryDate', ticket.expiryDate),
      stringParameter('membershipStatus', stringOrNull(ticket.summary.productSubType)),
      stringParameter('ticketSummary', JSON.stringify(ticket.summary)),
    ],
    transactionId,
  );

  return result.updated;
}

async function upsertPayment(context, payment, transactionId) {
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_booking_payments (
      payment_key,
      roller_unique_id,
      booking_payment_id,
      payment_method,
      payment_status,
      amount_cents,
      created_date,
      payment_summary
    )
    SELECT
      :paymentKey,
      booking.roller_unique_id,
      :bookingPaymentId,
      :paymentMethod,
      NULL,
      :amountCents,
      CAST(:createdDate AS timestamptz),
      CAST(:paymentSummary AS jsonb)
    FROM jumpyard.roller_bookings AS booking
    WHERE booking.booking_reference = :bookingReference
    ON CONFLICT (payment_key) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_payment_id = EXCLUDED.booking_payment_id,
      payment_method = EXCLUDED.payment_method,
      amount_cents = EXCLUDED.amount_cents,
      created_date = EXCLUDED.created_date,
      payment_summary = EXCLUDED.payment_summary,
      updated_at = now()`,
    [
      stringParameter('paymentKey', payment.paymentKey),
      stringParameter('bookingReference', payment.bookingReference),
      stringParameter('bookingPaymentId', payment.bookingPaymentId),
      stringParameter('paymentMethod', payment.paymentMethod),
      intParameter('amountCents', payment.amountCents),
      stringParameter('createdDate', payment.createdDate),
      stringParameter('paymentSummary', JSON.stringify(payment.summary)),
    ],
    transactionId,
  );

  return result.updated;
}

async function upsertCustomer(context, customer, transactionId) {
  const result = await executeStatement(
    context,
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
      '${SOURCE_CUSTOMERS}',
      CAST(:latestBookingContext AS jsonb),
      CAST(:lastSeenFromRollerAt AS timestamptz)
    )
    ON CONFLICT (guest_profile_id) DO UPDATE SET
      roller_customer_id = EXCLUDED.roller_customer_id,
      email = EXCLUDED.email,
      email_hash = EXCLUDED.email_hash,
      email_masked = EXCLUDED.email_masked,
      contact_number = EXCLUDED.contact_number,
      contact_number_hash = EXCLUDED.contact_number_hash,
      contact_number_masked = EXCLUDED.contact_number_masked,
      sms_ready = EXCLUDED.sms_ready,
      contact_source = EXCLUDED.contact_source,
      latest_booking_context = EXCLUDED.latest_booking_context,
      last_seen_from_roller_at = EXCLUDED.last_seen_from_roller_at,
      updated_at = now()`,
    [
      stringParameter('guestProfileId', customer.guestProfileId),
      stringParameter('rollerCustomerId', customer.rollerCustomerId),
      stringParameter('email', customer.email),
      stringParameter('emailHash', customer.emailHash),
      stringParameter('emailMasked', customer.emailMasked),
      stringParameter('contactNumber', customer.contactNumber),
      stringParameter('contactNumberHash', customer.contactNumberHash),
      stringParameter('contactNumberMasked', customer.contactNumberMasked),
      boolParameter('smsReady', customer.smsReady),
      stringParameter('latestBookingContext', JSON.stringify(customer.latestBookingContext)),
      stringParameter('lastSeenFromRollerAt', customer.modifiedDate),
    ],
    transactionId,
  );

  return result.updated;
}

async function upsertProduct(context, product, rollerEnv, venueId, transactionId) {
  const fetchedAt = new Date().toISOString();
  const ttlHours = positiveInteger(process.env.ROLLER_PRODUCT_CACHE_TTL_HOURS) || DEFAULT_PRODUCT_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.product_catalog_cache (
      cache_key,
      venue_id,
      roller_env,
      fetched_at,
      expires_at,
      product_hash,
      summary
    )
    VALUES (
      :cacheKey,
      :venueId,
      :rollerEnv,
      CAST(:fetchedAt AS timestamptz),
      CAST(:expiresAt AS timestamptz),
      :productHash,
      CAST(:summary AS jsonb)
    )
    ON CONFLICT (cache_key) DO UPDATE SET
      venue_id = EXCLUDED.venue_id,
      roller_env = EXCLUDED.roller_env,
      fetched_at = EXCLUDED.fetched_at,
      expires_at = EXCLUDED.expires_at,
      product_hash = EXCLUDED.product_hash,
      summary = EXCLUDED.summary`,
    [
      stringParameter('cacheKey', product.cacheKey),
      stringParameter('venueId', venueId),
      stringParameter('rollerEnv', rollerEnv),
      stringParameter('fetchedAt', fetchedAt),
      stringParameter('expiresAt', expiresAt),
      stringParameter('productHash', product.productHash),
      stringParameter('summary', JSON.stringify(product.summary)),
    ],
    transactionId,
  );

  return result.updated;
}

async function enrichBookingItems(context, rollerEnv, venueId, transactionId) {
  const result = await executeStatement(
    context,
    `UPDATE jumpyard.roller_booking_items AS item
     SET product_name = product.summary ->> 'name',
         parent_product_name = NULLIF(product.summary ->> 'parentProductName', ''),
         parent_product_id = NULLIF(product.summary ->> 'parentProductId', ''),
         updated_at = now()
     FROM jumpyard.product_catalog_cache AS product
     WHERE product.roller_env = :rollerEnv
       AND product.venue_id = :venueId
       AND product.summary ->> 'id' = item.product_id
       AND item.product_id IS NOT NULL`,
    [stringParameter('rollerEnv', rollerEnv), stringParameter('venueId', venueId)],
    transactionId,
  );

  return result.updated;
}

async function getRollerConfig() {
  if (cachedRollerConfig) return cachedRollerConfig;

  const [secretResponse, envResponse, baseUrlResponse] = await Promise.all([
    secretsClient.send(new GetSecretValueCommand({ SecretId: requiredEnv('ROLLER_CREDENTIALS_SECRET_ARN') })),
    ssmClient.send(new GetParameterCommand({ Name: requiredEnv('ROLLER_ENV_PARAMETER_NAME') })),
    ssmClient.send(new GetParameterCommand({ Name: requiredEnv('ROLLER_BASE_URL_PARAMETER_NAME') })),
  ]);
  const secret = parseSecret(secretResponse.SecretString);
  const config = {
    baseUrl: stringOrNull(baseUrlResponse.Parameter?.Value) || '',
    clientId: stringOrNull(secret.clientId) || '',
    clientSecret: stringOrNull(secret.clientSecret) || '',
    env: stringOrNull(envResponse.Parameter?.Value) || '',
  };
  const validationErrors = validateRollerConfig(config);

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  cachedRollerConfig = config;
  return cachedRollerConfig;
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
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Roller token request failed with HTTP ${response.status}.`);
  }

  const accessToken = body?.access_token || body?.accessToken;
  if (!accessToken) {
    throw new Error('Roller token response did not include an access token.');
  }

  cachedToken = {
    accessToken,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in || body.expiresIn || 300)) * 1000,
    tokenType: body.token_type || body.tokenType || 'Bearer',
  };

  return cachedToken;
}

function validateRollerConfig(config) {
  const errors = [];

  if (config.env !== 'playground') {
    errors.push('ROLLER_ENV must be exactly "playground".');
  }

  if (!config.clientId.trim()) {
    errors.push('Roller client id is required.');
  }

  if (!config.clientSecret.trim()) {
    errors.push('Roller client secret is required.');
  }

  try {
    const parsedBaseUrl = new URL(config.baseUrl);
    const searchableUrl = `${parsedBaseUrl.hostname}${parsedBaseUrl.pathname}`;

    if (PRODUCTION_URL_MARKER.test(searchableUrl)) {
      errors.push('ROLLER_BASE_URL looks like production/live and is not allowed.');
    }

    if (!PLAYGROUND_URL_MARKER.test(searchableUrl)) {
      errors.push('ROLLER_BASE_URL must clearly point to a playground environment.');
    }
  } catch {
    errors.push('ROLLER_BASE_URL must be a valid URL.');
  }

  return errors;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response from Roller but received HTTP ${response.status}.`);
  }
}

function buildRollerUrl(baseUrl, endpointPath) {
  if (!endpointPath.startsWith('/')) {
    throw new Error('Roller endpoint paths must start with "/".');
  }

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
      Handler: sanitizeMetricValue(process.env.JUMPYARD_HANDLER || 'data-sync'),
      Operation: sanitizeMetricValue(operation || 'unknown'),
      Method: sanitizeMetricValue(method || 'UNKNOWN'),
      StatusCode: statusCode,
      Ok: Boolean(ok),
      ...metricValues,
    }),
  );
}

function rollerOperationFromEndpointPath(endpointPath) {
  const path = String(endpointPath || '').split('?')[0];
  if (path === '/data/bookingitems') return 'data_bookingitems';
  if (path === '/data/tickets') return 'data_tickets';
  if (path === '/data/bookingpayments') return 'data_bookingpayments';
  if (path === '/data/customers') return 'data_customers';
  if (path === '/products') return 'list_products';
  return 'roller_data_api';
}

function sanitizeMetricValue(value) {
  const sanitized = String(value).replace(/[^A-Za-z0-9_.:/-]/g, '_').slice(0, 100);
  return sanitized || 'unknown';
}

async function executeStatement(context, sql, parameters = [], transactionId = undefined) {
  const response = await rdsClient.send(
    new ExecuteStatementCommand({
      database: DATABASE_NAME,
      parameters,
      resourceArn: context.clusterArn,
      secretArn: context.secretArn,
      sql,
      transactionId,
    }),
  );

  return {
    records: response.records || [],
    updated: response.numberOfRecordsUpdated || 0,
  };
}

function createDbContext() {
  return {
    clusterArn: requiredEnv('DATABASE_CLUSTER_ARN'),
    secretArn: requiredEnv('DATABASE_SECRET_ARN'),
  };
}

function parseSecret(secretString) {
  if (!secretString) return {};
  try {
    return JSON.parse(secretString);
  } catch {
    return {};
  }
}

function extractProductArray(body) {
  if (isProductArray(body)) return body;
  if (!isRecord(body)) return null;

  for (const key of ['items', 'products', 'data', 'results']) {
    if (isProductArray(body[key])) return body[key];
  }

  return null;
}

function childCollections(product) {
  return ['products', 'variations', 'productVariations', 'children'].map((key) => product[key]).filter(isProductArray);
}

function dedupeProducts(products) {
  const byId = new Map();

  for (const product of products) {
    byId.set(product.id, product);
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function firstKnown(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }

  return null;
}

function firstString(record, keys) {
  const value = firstKnown(record, keys);
  return value === null ? null : String(value);
}

function minOrNull(values) {
  return values.length > 0 ? [...values].sort()[0] || null : null;
}

function maxOrNull(values) {
  return values.length > 0 ? [...values].sort()[values.length - 1] || null : null;
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

function positiveInteger(value) {
  const parsed = numberOrNull(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function centsOrNull(value) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return Math.round(parsed * 100);
}

function booleanOrNull(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function dateOrNull(value) {
  const text = stringOrNull(value);
  if (!text) return null;
  const date = text.slice(0, 10);
  return isIsoDate(date) ? date : null;
}

function timeOrNull(value) {
  const text = stringOrNull(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

function timestampOrNull(value) {
  const text = stringOrNull(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeEmail(value) {
  const text = stringOrNull(value);
  return text ? text.trim().toLowerCase() : null;
}

function normalizePhone(value) {
  const text = stringOrNull(value);
  return text ? text.trim().replace(/[^\d+]/g, '') : null;
}

function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  if (phone.length <= 4) return '***';
  return `***${phone.slice(-4)}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isProductArray(value) {
  return Array.isArray(value) && value.every(isRecord);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isTombstoned(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'deleted';
}

function hashJson(value) {
  return hashString(JSON.stringify(value));
}

function hashString(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stringParameter(name, value) {
  return value === null ? { name, value: { isNull: true } } : { name, value: { stringValue: value } };
}

function intParameter(name, value) {
  return value === null ? { name, value: { isNull: true } } : { name, value: { longValue: value } };
}

function boolParameter(name, value) {
  return { name, value: { booleanValue: value } };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function createCorrelationId() {
  return `jy_${crypto.randomUUID()}`;
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
