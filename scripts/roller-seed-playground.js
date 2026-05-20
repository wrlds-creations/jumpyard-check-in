#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const {
  RollerConfigError,
  buildRollerUrl,
  loadLocalEnv,
  readRollerConfig,
  requestRollerAccessToken,
  validateRollerSmokeConfig,
} = require('./roller-client');

const WRITE_CONFIRMATION = 'I_UNDERSTAND_THIS_WRITES_PLAYGROUND_BOOKINGS';

const PRODUCT_MATCHERS = {
  jumpSession: [/entr/i, /session/i, /jump/i, /maxi/i, /1\s*tim/i, /60\s*min/i, /120\s*min/i],
  skyRider: [/skyrider/i, /sky\s*rider/i],
  socks: [/jumpsocks/i, /sock/i, /strump/i],
  padlock: [/hanglas/i, /padlock/i, /\block\b/i],
  coffee: [/coffee/i, /kaffe/i, /tea/i],
  connected: [/connected/i],
};

const SCENARIO_DEFINITIONS = [
  {
    id: 't0008-paid-ready',
    label: 'Paid-ready lookup booking',
    dateOffsetDays: 1,
    startTime: '10:00',
    targetState: 'paid_ready',
    guest: {
      firstName: 'T0008 Paid',
      lastName: 'Ready',
      email: 't0008.paid-ready@example.invalid',
      phone: '+46700000001',
    },
    requestedProducts: [
      { role: 'jumpSession', quantity: 2 },
      { role: 'socks', quantity: 2 },
    ],
  },
  {
    id: 't0008-pending-payment',
    label: 'Pending-payment lookup booking',
    dateOffsetDays: 1,
    startTime: '11:00',
    targetState: 'pending_payment',
    guest: {
      firstName: 'T0008 Pending',
      lastName: 'Payment',
      email: 't0008.pending-payment@example.invalid',
      phone: '+46700000002',
    },
    requestedProducts: [{ role: 'jumpSession', quantity: 1 }],
  },
  {
    id: 't0008-wrong-date',
    label: 'Wrong-date lookup booking',
    dateOffsetDays: 2,
    startTime: '12:00',
    targetState: 'wrong_date',
    guest: {
      firstName: 'T0008 Wrong',
      lastName: 'Date',
      email: 't0008.wrong-date@example.invalid',
      phone: '+46700000003',
    },
    requestedProducts: [{ role: 'jumpSession', quantity: 1 }],
  },
  {
    id: 't0008-skyrider-addon',
    label: 'SkyRider add-on booking',
    dateOffsetDays: 1,
    startTime: '13:00',
    targetState: 'skyrider_addon',
    guest: {
      firstName: 'T0008 Sky',
      lastName: 'Rider',
      email: 't0008.skyrider@example.invalid',
      phone: '+46700000004',
    },
    requestedProducts: [
      { role: 'jumpSession', quantity: 1 },
      { role: 'skyRider', quantity: 1 },
    ],
  },
  {
    id: 't0008-linked-addon-original',
    label: 'Original booking for linked add-on flow',
    dateOffsetDays: 1,
    startTime: '14:00',
    targetState: 'linked_addon_original',
    guest: {
      firstName: 'T0008 Addon',
      lastName: 'Original',
      email: 't0008.addon-original@example.invalid',
      phone: '+46700000005',
    },
    requestedProducts: [{ role: 'jumpSession', quantity: 1 }],
  },
  {
    id: 't0008-linked-addon-extra',
    label: 'Separate add-on booking to link in JumpYard Cloud',
    dateOffsetDays: 1,
    startTime: '14:00',
    targetState: 'linked_addon_extra',
    linksToScenarioId: 't0008-linked-addon-original',
    guest: {
      firstName: 'T0008 Addon',
      lastName: 'Extra',
      email: 't0008.addon-extra@example.invalid',
      phone: '+46700000006',
    },
    requestedProducts: [
      { role: 'padlock', quantity: 1 },
      { role: 'coffee', quantity: 1 },
    ],
  },
];

function parseArgs(argv) {
  const args = {
    apply: false,
    json: false,
    outputPath: null,
    payloadFile: null,
    scenarioId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--apply') {
      args.apply = true;
      continue;
    }

    if (arg === '--json') {
      args.json = true;
      continue;
    }

    if (arg === '--output') {
      args.outputPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--payload-file') {
      args.payloadFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--scenario') {
      args.scenarioId = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
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

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getSeedBaseDate() {
  if (process.env.ROLLER_SEED_DATE) {
    const parsed = new Date(`${process.env.ROLLER_SEED_DATE}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('ROLLER_SEED_DATE must be YYYY-MM-DD when set.');
    }
    return parsed;
  }

  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
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

function productMatches(product, matchers) {
  const searchable = normalizeSearchText(
    [product.name, product.parentProductName, product.type, product.parentType].filter(Boolean).join(' '),
  );
  return matchers.some((matcher) => matcher.test(searchable));
}

function productScore(product, role) {
  const searchable = normalizeSearchText(
    [product.name, product.parentProductName, product.type, product.parentType].filter(Boolean).join(' '),
  );
  const type = normalizeSearchText(product.type);
  const parentType = normalizeSearchText(product.parentType);
  let score = 0;

  if (!product.isVariation) return -100;

  if (role === 'jumpSession') {
    if (/addon/.test(type) || /addon/.test(parentType)) return -100;
    if (/sock|hanglas|coffee|kaffe|tea|skyrider/.test(searchable)) return -100;
    if (/sessionpass/.test(type) || /sessionpass/.test(parentType)) score += 60;
    if (/entr/.test(searchable)) score += 30;
    if (/120\s*min/.test(searchable)) score += 25;
    if (/60\s*min/.test(searchable)) score += 20;
    if (/biljett/.test(searchable)) score += 10;
  }

  if (role === 'skyRider') {
    if (!/skyrider|sky\s*rider/.test(searchable)) return -100;
    if (/1\s*ak|1\s*ride/.test(searchable)) score += 20;
  }

  if (role === 'socks') {
    if (!/jumpsocks|sock|strump/.test(searchable)) return -100;
    if (/antal/.test(searchable)) score += 10;
  }

  if (role === 'padlock') {
    if (!/hanglas|padlock|\block\b/.test(searchable)) return -100;
    if (/hanglas/.test(searchable)) score += 20;
  }

  if (role === 'coffee') {
    if (!/coffee|kaffe|tea/.test(searchable)) return -100;
    if (/bryggkaffe|latte|te\b/.test(searchable)) score += 10;
  }

  if (product.id) score += 1;
  return score;
}

function findProductCandidates(products, role) {
  const matchers = PRODUCT_MATCHERS[role] ?? [];
  return products
    .filter((product) => productMatches(product, matchers))
    .map((product) => ({ product, score: productScore(product, role) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.product)
    .slice(0, 5);
}

function buildProductIndex(products) {
  return Object.fromEntries(
    Object.keys(PRODUCT_MATCHERS).map((role) => [role, findProductCandidates(products, role)]),
  );
}

function buildExternalId(scenarioId, bookingDate) {
  return `JY-${scenarioId.toUpperCase()}-${bookingDate.replace(/-/g, '')}`.slice(0, 64);
}

function buildBookingPayload(scenario) {
  const items = scenario.products
    .filter((product) => product.selectedProduct)
    .map((product) => ({
      productId: Number(product.selectedProduct.id),
      quantity: product.quantity,
      bookingDate: scenario.bookingDate,
      startTime: scenario.startTime,
    }));

  const payload = {
    externalId: buildExternalId(scenario.id, scenario.bookingDate),
    name: `JumpYard seed ${scenario.id}`,
    comments: `T0008 deterministic Playground seed. Scenario: ${scenario.targetState}.`,
    customer: {
      firstName: scenario.guest.firstName,
      lastName: scenario.guest.lastName,
      email: scenario.guest.email,
      phone: scenario.guest.phone,
      acceptMarketing: false,
      acceptMarketingSms: false,
    },
    items,
    sendConfirmations: false,
    customerPaysFees: false,
  };

  if (scenario.targetState === 'paid_ready') {
    const amount = scenario.products.reduce((total, product) => {
      const price = Number(product.selectedProduct?.price ?? 0);
      return total + price * product.quantity;
    }, 0);

    if (amount > 0) {
      payload.payments = [
        {
          id: `${payload.externalId}-PAY`.slice(0, 64),
          paymentType: 'Other',
          amount,
          transactionDate: `${scenario.bookingDate}T08:00:00.000Z`,
        },
      ];
    }
  }

  return payload;
}

function buildScenarioPlan(products, scenarioId = null) {
  const baseDate = getSeedBaseDate();
  const productIndex = buildProductIndex(products);
  const selectedDefinitions = scenarioId
    ? SCENARIO_DEFINITIONS.filter((scenario) => scenario.id === scenarioId)
    : SCENARIO_DEFINITIONS;

  if (scenarioId && selectedDefinitions.length === 0) {
    throw new Error(`Unknown seed scenario: ${scenarioId}`);
  }

  return selectedDefinitions.map((scenario) => {
    const bookingDate = toIsoDate(addDays(baseDate, scenario.dateOffsetDays));
    const productsForScenario = scenario.requestedProducts.map((requestedProduct) => {
      const candidates = productIndex[requestedProduct.role] ?? [];
      const primaryCandidate = candidates[0] ?? null;

      return {
        role: requestedProduct.role,
        quantity: requestedProduct.quantity,
        selectedProduct: primaryCandidate,
        candidateCount: candidates.length,
        candidates,
      };
    });

    return {
      id: scenario.id,
      label: scenario.label,
      bookingDate,
      startTime: scenario.startTime,
      targetState: scenario.targetState,
      linksToScenarioId: scenario.linksToScenarioId ?? null,
      guest: scenario.guest,
      products: productsForScenario,
      bookingPayload: buildBookingPayload({
        ...scenario,
        bookingDate,
        products: productsForScenario,
      }),
    };
  });
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

function safeBookingSummary(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') {
    return { type: typeof responseBody };
  }

  return {
    bookingReference: responseBody.bookingReference ?? responseBody.reference ?? null,
    uniqueId: responseBody.uniqueId ?? responseBody.id ?? null,
    capacityReservationId: responseBody.capacityReservationId ?? null,
    status: responseBody.status ?? responseBody.bookingStatus ?? null,
    paymentStatus: responseBody.paymentStatus ?? null,
    costs: responseBody.costs
      ? {
          total: responseBody.costs.total ?? null,
          amountOwing: responseBody.costs.amountOwing ?? null,
        }
      : null,
    paymentJwtPresent: Boolean(responseBody.paymentJwt),
    keys: Object.keys(responseBody).slice(0, 12),
  };
}

async function postBookingPayload(config, token, endpointPath, payload) {
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
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { textLength: text.length };
    }
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object'
        ? body.message ?? body.error ?? body.title ?? JSON.stringify(Object.keys(body).slice(0, 8))
        : `HTTP ${response.status}`;
    throw new Error(`Roller booking write failed with HTTP ${response.status}: ${message}`);
  }

  return {
    status: response.status,
    request: {
      externalId: payload.externalId ?? null,
      itemCount: Array.isArray(payload.items) ? payload.items.length : null,
    },
    summary: safeBookingSummary(body),
  };
}

function readPayloadFile(payloadFile) {
  const resolvedPath = path.resolve(process.cwd(), payloadFile);
  const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const payloads = Array.isArray(parsed) ? parsed : parsed.bookings ?? parsed.payloads;

  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw new Error('Payload file must be an array, or contain bookings[]/payloads[].');
  }

  return payloads;
}

function validateApplyMode(args) {
  if (!args.apply) return;

  if (process.env.ROLLER_SEED_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(
      `Apply mode is blocked. Set ROLLER_SEED_ALLOW_WRITE=${WRITE_CONFIRMATION} only when you intend to write Playground bookings.`,
    );
  }
}

function getApplyPayloads(scenarios, args) {
  if (args.payloadFile) {
    return readPayloadFile(args.payloadFile);
  }

  const missingProducts = scenarios.flatMap((scenario) =>
    scenario.products
      .filter((product) => !product.selectedProduct)
      .map((product) => `${scenario.id}:${product.role}`),
  );

  if (missingProducts.length > 0) {
    throw new Error(`Cannot write bookings because product mappings are missing: ${missingProducts.join(', ')}`);
  }

  return scenarios.map((scenario) => scenario.bookingPayload);
}

function adaptPayloadForEndpoint(payload, endpointPath) {
  if (endpointPath !== '/bookings/draft') {
    return payload;
  }

  const { payments, ...draftPayload } = payload;
  return draftPayload;
}

function formatSelectedProduct(product) {
  if (!product.selectedProduct) return 'NO MATCH';

  const selected = product.selectedProduct;
  const parent = selected.parentProductName ? ` from ${selected.parentProductName}` : '';
  return `${selected.name} [${selected.id}]${parent}`;
}

function printHumanResult(result) {
  console.log('Roller Playground seed preflight passed.');
  console.log(`- env: ${result.env}`);
  console.log(`- baseUrl: ${result.baseUrl}`);
  console.log(`- productCount: ${result.productCount}`);
  console.log(`- scenarioCount: ${result.scenarios.length}`);

  for (const scenario of result.scenarios) {
    console.log(`- ${scenario.id}: ${scenario.bookingDate} ${scenario.startTime} (${scenario.targetState})`);
    console.log(`  - externalId: ${scenario.bookingPayload.externalId}`);
    for (const product of scenario.products) {
      console.log(`  - ${product.role} x${product.quantity}: ${formatSelectedProduct(product)}`);
    }
  }

  console.log(`- writeMode: ${result.writeMode}`);
  if (result.writeNote) {
    console.log(`- writeNote: ${result.writeNote}`);
  }
  for (const write of result.writes) {
    if (write.error) {
      console.log(`- write ${write.request.externalId}: FAILED ${write.error}`);
      continue;
    }

    console.log(
      `- write ${write.request.externalId}: HTTP ${write.status}, bookingReference=${write.summary.bookingReference}, uniqueId=${write.summary.uniqueId}`,
    );
  }
}

async function main() {
  loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  const config = readRollerConfig();
  const validation = validateRollerSmokeConfig(config);

  if (!validation.ok) {
    throw new RollerConfigError(validation.errors.join(' '));
  }

  validateApplyMode(args);

  const token = await requestRollerAccessToken(config);
  const products = await requestProducts(config, token);
  const scenarios = buildScenarioPlan(products, args.scenarioId);

  const result = {
    env: validation.safeConfig.env,
    baseUrl: validation.safeConfig.baseUrl,
    productCount: products.length,
    scenarios,
    writeMode: args.apply ? 'apply' : 'dry-run',
    writeNote: args.apply
      ? null
      : `No bookings were created. Use --apply with ROLLER_SEED_ALLOW_WRITE=${WRITE_CONFIRMATION} only when you intend to write Playground bookings.`,
    writes: [],
    writeErrorCount: 0,
  };

  if (args.apply) {
    const endpointPath = process.env.ROLLER_SEED_WRITE_ENDPOINT || '/bookings';
    const allowedWriteEndpoints = new Set(['/bookings', '/bookings/draft']);

    if (!allowedWriteEndpoints.has(endpointPath)) {
      throw new Error(`ROLLER_SEED_WRITE_ENDPOINT is not allowed for T0008: ${endpointPath}`);
    }

    const payloads = getApplyPayloads(scenarios, args);
    for (const payload of payloads) {
      try {
        const writeResult = await postBookingPayload(config, token, endpointPath, adaptPayloadForEndpoint(payload, endpointPath));
        result.writes.push(writeResult);
      } catch (error) {
        result.writeErrorCount += 1;
        result.writes.push({
          status: null,
          request: {
            externalId: payload.externalId ?? null,
            itemCount: Array.isArray(payload.items) ? payload.items.length : null,
          },
          error: error.message,
        });
      }
    }

    if (result.writeErrorCount > 0) {
      result.writeNote = `${result.writeErrorCount} Playground booking write(s) failed. No secrets were printed.`;
    }
  }

  if (args.outputPath) {
    const resolvedOutputPath = path.resolve(process.cwd(), args.outputPath);
    fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }

  if (result.writeErrorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  if (error instanceof RollerConfigError) {
    console.error(`Roller Playground seed blocked by configuration: ${error.message}`);
    process.exit(1);
  }

  console.error(`Roller Playground seed failed: ${error.message}`);
  console.error('No secrets were printed.');
  process.exit(1);
});
