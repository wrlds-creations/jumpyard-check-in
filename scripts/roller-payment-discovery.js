#!/usr/bin/env node
const {
  RollerConfigError,
  buildRollerUrl,
  loadLocalEnv,
  readRollerConfig,
  requestRollerAccessToken,
  validateRollerSmokeConfig,
} = require('./roller-client');

const WRITE_CONFIRMATION = 'I_UNDERSTAND_THIS_WRITES_PLAYGROUND_DRAFT_BOOKING';

function parseArgs(argv) {
  const args = {
    applyDraft: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--apply-draft') {
      args.applyDraft = true;
      continue;
    }

    if (arg === '--json') {
      args.json = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function flattenProducts(products, parent = null) {
  const flattened = [];

  for (const product of products) {
    const normalized = {
      id: String(product.id ?? product.productId ?? product.parentProductId ?? ''),
      parentProductId: product.parentProductId ? String(product.parentProductId) : parent?.id ?? null,
      name: product.name ?? product.productName ?? product.title ?? '',
      parentProductName: product.parentProductName ?? parent?.name ?? null,
      type: product.type ?? product.productType ?? product.productSubType ?? null,
      parentType: parent?.type ?? product.parentProductType ?? null,
      isVariation: Boolean(parent),
      price: product.price ?? product.cost ?? null,
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

function productScore(product) {
  const searchable = normalizeSearchText(
    [product.name, product.parentProductName, product.type, product.parentType].filter(Boolean).join(' '),
  );
  const type = normalizeSearchText(product.type);
  const parentType = normalizeSearchText(product.parentType);
  let score = 0;

  if (!product.isVariation) return -100;
  if (/addon/.test(type) || /addon/.test(parentType)) return -100;
  if (/sock|hanglas|coffee|kaffe|tea|skyrider/.test(searchable)) return -100;
  if (/sessionpass/.test(type) || /sessionpass/.test(parentType)) score += 60;
  if (/entr/.test(searchable)) score += 30;
  if (/120\s*min/.test(searchable)) score += 25;
  if (/60\s*min/.test(searchable)) score += 20;
  if (/biljett/.test(searchable)) score += 10;
  if (product.id) score += 1;

  return score;
}

function selectJumpSessionProduct(products) {
  return [...products]
    .map((product) => ({ product, score: productScore(product) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.product)[0] ?? null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function buildDraftPayload(product) {
  const bookingDate = toIsoDate(addDays(new Date(), 1));
  const externalId = `JY-T0030-DRAFT-${timestampId()}`.slice(0, 64);

  return {
    externalId,
    name: 'JumpYard T0030 payment discovery',
    comments: 'T0030 Roller Playground draft booking discovery. No payment is processed by this script.',
    customer: {
      firstName: 'T0030',
      lastName: 'Payment',
      email: 't0030.payment@example.invalid',
      phone: '+46700000030',
      acceptMarketing: false,
      acceptMarketingSms: false,
    },
    items: [
      {
        productId: Number(product.id),
        quantity: 1,
        bookingDate,
        startTime: '10:00',
      },
    ],
    sendConfirmations: false,
    customerPaysFees: false,
  };
}

async function requestProducts(config, token) {
  const response = await fetch(buildRollerUrl(config.baseUrl, '/products'), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Roller product read failed with HTTP ${response.status}.`);
  }

  const body = await response.json();
  const products = Array.isArray(body) ? body : body.items ?? body.products ?? body.data;

  if (!Array.isArray(products)) {
    throw new Error('Roller product response was not an array or known product wrapper.');
  }

  return flattenProducts(products);
}

async function createDraftBooking(config, token, payload) {
  const response = await fetch(buildRollerUrl(config.baseUrl, '/bookings/draft'), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { textLength: text.length };
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: summarizeErrorBody(body),
    };
  }

  return {
    ok: true,
    status: response.status,
    summary: summarizeDraftResponse(body),
  };
}

function summarizeErrorBody(body) {
  if (!body || typeof body !== 'object') return { type: typeof body };

  return {
    code: body.code ?? body.errorCode ?? null,
    message: body.message ?? body.error ?? body.title ?? null,
    keys: Object.keys(body).slice(0, 10),
  };
}

function summarizeDraftResponse(body) {
  if (!body || typeof body !== 'object') return { type: typeof body };

  return {
    uniqueId: body.uniqueId ?? null,
    capacityReservationId: body.capacityReservationId ?? null,
    costs: body.costs
      ? {
          total: body.costs.total ?? null,
          totalIgnoringDeposit: body.costs.totalIgnoringDeposit ?? null,
          totalExcludingFees: body.costs.totalExcludingFees ?? null,
          amountOwing: body.costs.amountOwing ?? null,
          tax: body.costs.tax ?? null,
          transactionFee: body.costs.transactionFee ?? null,
          cardFee: body.costs.cardFee ?? null,
          discount: body.costs.discount ?? null,
        }
      : null,
    paymentJwt: summarizeJwt(body.paymentJwt),
    keys: Object.keys(body).slice(0, 10),
  };
}

function summarizeJwt(jwt) {
  if (!jwt || typeof jwt !== 'string') {
    return {
      present: false,
    };
  }

  const parts = jwt.split('.');
  const summary = {
    present: true,
    partCount: parts.length,
    headerKeys: [],
    payloadKeys: [],
    expiresAt: null,
  };

  if (parts.length >= 2) {
    const header = parseJwtPart(parts[0]);
    const payload = parseJwtPart(parts[1]);
    summary.headerKeys = header ? Object.keys(header).slice(0, 10) : [];
    summary.payloadKeys = payload ? Object.keys(payload).slice(0, 20) : [];

    if (payload && Number.isFinite(Number(payload.exp))) {
      summary.expiresAt = new Date(Number(payload.exp) * 1000).toISOString();
    }
  }

  return summary;
}

function parseJwtPart(part) {
  try {
    const padded = part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function validateApplyMode(args) {
  if (!args.applyDraft) return;

  if (process.env.ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(
      `Draft write mode is blocked. Set ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE=${WRITE_CONFIRMATION} only when you intend to create a Playground draft booking.`,
    );
  }
}

function printHumanResult(result) {
  console.log('Roller payment discovery preflight passed.');
  console.log(`- env: ${result.env}`);
  console.log(`- baseUrl: ${result.baseUrl}`);
  console.log(`- productCount: ${result.productCount}`);
  console.log(`- selectedProduct: ${result.selectedProduct.name} [${result.selectedProduct.id}]`);
  console.log(`- draftBookingDate: ${result.draftPayload.bookingDate}`);
  console.log(`- draftStartTime: ${result.draftPayload.startTime}`);
  console.log(`- writeMode: ${result.writeMode}`);

  if (result.writeNote) {
    console.log(`- writeNote: ${result.writeNote}`);
  }

  if (result.draftWrite) {
    if (!result.draftWrite.ok) {
      console.log(`- draftWrite: HTTP ${result.draftWrite.status}, blocked/failed safely`);
      console.log(`- draftError: ${result.draftWrite.error.message ?? JSON.stringify(result.draftWrite.error.keys)}`);
      return;
    }

    console.log(`- draftWrite: HTTP ${result.draftWrite.status}`);
    console.log(`- draftUniqueId: ${result.draftWrite.summary.uniqueId}`);
    console.log(`- draftTotal: ${result.draftWrite.summary.costs?.total ?? 'unknown'}`);
    console.log(`- draftAmountOwing: ${result.draftWrite.summary.costs?.amountOwing ?? 'unknown'}`);
    console.log(`- paymentJwtPresent: ${result.draftWrite.summary.paymentJwt.present}`);
    console.log(`- paymentJwtPartCount: ${result.draftWrite.summary.paymentJwt.partCount ?? 'n/a'}`);
    console.log(`- paymentJwtPayloadKeys: ${result.draftWrite.summary.paymentJwt.payloadKeys.join(', ') || 'none'}`);
  }
}

async function main() {
  loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  validateApplyMode(args);

  const config = readRollerConfig();
  const validation = validateRollerSmokeConfig(config);

  if (!validation.ok) {
    throw new RollerConfigError(validation.errors.join(' '));
  }

  const token = await requestRollerAccessToken(config);
  const products = await requestProducts(config, token);
  const selectedProduct = selectJumpSessionProduct(products);

  if (!selectedProduct) {
    throw new Error('Could not find a suitable jump/session product for draft booking discovery.');
  }

  const draftPayload = buildDraftPayload(selectedProduct);
  const result = {
    env: validation.safeConfig.env,
    baseUrl: validation.safeConfig.baseUrl,
    productCount: products.length,
    selectedProduct: {
      id: selectedProduct.id,
      name: selectedProduct.name,
      parentProductName: selectedProduct.parentProductName,
      type: selectedProduct.type,
      price: selectedProduct.price,
    },
    draftPayload: {
      externalId: draftPayload.externalId,
      bookingDate: draftPayload.items[0].bookingDate,
      startTime: draftPayload.items[0].startTime,
      itemCount: draftPayload.items.length,
      customerEmailDomain: draftPayload.customer.email.split('@')[1],
    },
    writeMode: args.applyDraft ? 'apply-draft' : 'dry-run',
    writeNote: args.applyDraft
      ? null
      : `No draft booking was created. Use --apply-draft with ROLLER_PAYMENT_DISCOVERY_ALLOW_WRITE=${WRITE_CONFIRMATION} only when you intend to write a Playground draft booking.`,
    draftWrite: null,
  };

  if (args.applyDraft) {
    result.draftWrite = await createDraftBooking(config, token, draftPayload);
    if (!result.draftWrite.ok) {
      process.exitCode = 1;
    }
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }
}

main().catch((error) => {
  if (error instanceof RollerConfigError) {
    console.error(`Roller payment discovery blocked by configuration: ${error.message}`);
    process.exit(1);
  }

  console.error(`Roller payment discovery failed: ${error.message}`);
  console.error('No secrets, access tokens, or raw payment JWTs were printed.');
  process.exit(1);
});
