#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('./roller-client');

const DEFAULT_API_BASE_URL = 'https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com';
const DEFAULT_PRODUCT_ID = 1765836;
const DRAFT_CONFIRMATION = 'I_UNDERSTAND_THIS_CREATES_PLAYGROUND_DRAFT_BOOKING';

function parseArgs(argv) {
  const args = {
    applyDraft: false,
    json: false,
    requireReady: false,
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

    if (arg === '--require-ready') {
      args.requireReady = true;
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

function timestampId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function readConfig(env = process.env) {
  const apiBaseUrl =
    env.JUMPYARD_CLOUD_API_BASE_URL ||
    env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL ||
    DEFAULT_API_BASE_URL;
  const productId = Number(env.ROLLER_PAYMENT_POC_PRODUCT_ID || DEFAULT_PRODUCT_ID);
  const quantity = Number(env.ROLLER_PAYMENT_POC_QUANTITY || 1);

  return {
    apiBaseUrl,
    bookingDate: env.ROLLER_PAYMENT_POC_BOOKING_DATE || toIsoDate(new Date()),
    packageUrl: env.ROLLER_PAYMENT_PACKAGE_URL || '',
    productId,
    publicOrigin: env.ROLLER_PAYMENT_PUBLIC_ORIGIN || '',
    quantity,
    startTime: env.ROLLER_PAYMENT_POC_START_TIME || '10:00',
    testCardConfirmed: env.ROLLER_PAYMENT_TEST_CARD_CONFIRMED === 'true',
  };
}

function validateConfig(config) {
  const errors = [];

  validateHttpUrl(config.apiBaseUrl, 'JUMPYARD_CLOUD_API_BASE_URL', errors);

  if (!Number.isInteger(config.productId) || config.productId <= 0) {
    errors.push('ROLLER_PAYMENT_POC_PRODUCT_ID must be a positive integer.');
  }

  if (!Number.isInteger(config.quantity) || config.quantity <= 0) {
    errors.push('ROLLER_PAYMENT_POC_QUANTITY must be a positive integer.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.bookingDate)) {
    errors.push('ROLLER_PAYMENT_POC_BOOKING_DATE must use yyyy-mm-dd format.');
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.startTime)) {
    errors.push('ROLLER_PAYMENT_POC_START_TIME must use HH:mm format.');
  }

  return errors;
}

function validateHttpUrl(value, name, errors) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push(`${name} must use http or https.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

function validateApplyMode(args) {
  if (!args.applyDraft) return;

  if (process.env.ROLLER_PAYMENT_POC_ALLOW_DRAFT !== DRAFT_CONFIRMATION) {
    throw new Error(
      `Draft mode is blocked. Set ROLLER_PAYMENT_POC_ALLOW_DRAFT=${DRAFT_CONFIRMATION} only when you intend to create a Playground draft booking through JumpYard Cloud.`,
    );
  }
}

function apiUrl(baseUrl, path) {
  const parsed = new URL(baseUrl);
  const basePath = parsed.pathname.replace(/\/$/, '');
  return new URL(`${basePath}${path}`, parsed.origin).toString();
}

function buildQuotePayload(config) {
  return {
    correlationId: `t0032_quote_${timestampId()}`,
    name: 'JumpYard T0032 payment package POC',
    comments: 'T0032 quote-only payment package POC. No Roller booking is created by this request.',
    items: [
      {
        productId: config.productId,
        quantity: config.quantity,
        bookingDate: config.bookingDate,
        startTime: config.startTime,
      },
    ],
    customerPaysFees: false,
    sendConfirmations: false,
  };
}

function buildDraftPayload(config) {
  const suffix = timestampId();

  return {
    ...buildQuotePayload(config),
    correlationId: `t0032_draft_${suffix}`,
    externalId: `JY-T0032-POC-${suffix}`.slice(0, 64),
    idempotencyKey: `t0032-payment-poc-${suffix}`,
    confirmDraft: true,
    comments:
      'T0032 guarded payment package POC. Creates a Roller Playground draft booking but does not process payment.',
    customer: {
      firstName: 'T0032',
      lastName: 'Payment',
      email: 't0032.payment@example.invalid',
      phone: '+46700000032',
      acceptMarketing: false,
      acceptMarketingSms: false,
    },
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
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

async function runQuote(config) {
  const result = await postJson(apiUrl(config.apiBaseUrl, '/v1/bookings/quote'), buildQuotePayload(config));

  return {
    ok: result.ok,
    statusCode: result.status,
    status: stringOrNull(result.body?.status),
    total: numberOrNull(result.body?.quote?.costs?.total),
    amountOwing: numberOrNull(result.body?.quote?.costs?.amountOwing),
    tax: numberOrNull(result.body?.quote?.costs?.tax),
    wroteBooking: result.body?.source?.wroteBooking === true,
    error: summarizeError(result.body),
  };
}

async function runDraft(config) {
  const result = await postJson(apiUrl(config.apiBaseUrl, '/v1/bookings/draft'), buildDraftPayload(config));
  const paymentSession = result.body?.paymentSession ?? {};
  const paymentConfig = paymentSession.config ?? {};

  return {
    ok: result.ok,
    statusCode: result.status,
    status: stringOrNull(result.body?.status),
    draftUniqueId: stringOrNull(result.body?.draft?.uniqueId),
    total: numberOrNull(result.body?.draft?.costs?.total),
    amountOwing: numberOrNull(result.body?.draft?.costs?.amountOwing),
    paymentJwt: {
      present: paymentSession.jwtPresent === true,
      partCount: numberOrNull(paymentSession.jwtSummary?.partCount),
      payloadKeys: Array.isArray(paymentSession.jwtSummary?.payloadKeys)
        ? paymentSession.jwtSummary.payloadKeys.slice(0, 20)
        : [],
      expiresAt: stringOrNull(paymentSession.jwtSummary?.expiresAt),
    },
    paymentConfig: {
      available: paymentConfig.available === true,
      apiUrlHost: hostOrNull(paymentConfig.apiUrl),
      configurationIdPresent: Boolean(paymentConfig.configurationId),
      integrationIdPresent: Boolean(paymentConfig.integrationId),
      lookupStatusCode: numberOrNull(paymentConfig.lookupStatusCode),
    },
    error: summarizeError(result.body),
  };
}

async function checkPaymentPackage(config) {
  if (!config.packageUrl) {
    const vendoredPackagePath = path.join(
      __dirname,
      '..',
      'jumpyard-checkin-phone',
      'vendor',
      'ecom-payments',
      'package.json',
    );

    if (fs.existsSync(vendoredPackagePath)) {
      const packageJson = parseJsonOrNull(fs.readFileSync(vendoredPackagePath, 'utf8')) ?? {};

      return {
        configured: true,
        name: stringOrNull(packageJson.name),
        ready: true,
        source: 'vendored',
        status: 'vendored_package_available',
        version: stringOrNull(packageJson.version),
      };
    }

    return {
      configured: false,
      ready: false,
      status: 'missing_package_url',
      message: 'Set ROLLER_PAYMENT_PACKAGE_URL after Roller provides the approved payment package/download URL.',
    };
  }

  let parsed;
  try {
    parsed = new URL(config.packageUrl);
  } catch {
    return {
      configured: true,
      ready: false,
      status: 'invalid_package_url',
      message: 'ROLLER_PAYMENT_PACKAGE_URL must be a valid URL.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      configured: true,
      ready: false,
      status: 'insecure_package_url',
      host: parsed.hostname,
      message: 'ROLLER_PAYMENT_PACKAGE_URL must use HTTPS.',
    };
  }

  try {
    const response = await fetch(parsed, {
      method: 'HEAD',
      headers: { accept: '*/*' },
    });

    return {
      configured: true,
      contentLength: response.headers.get('content-length'),
      contentType: response.headers.get('content-type'),
      host: parsed.hostname,
      ready: response.ok,
      status: response.ok ? 'package_accessible' : `http_${response.status}`,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      configured: true,
      host: parsed.hostname,
      ready: false,
      status: 'package_check_failed',
      message: error.message,
    };
  }
}

function checkPublicOrigin(config) {
  if (!config.publicOrigin) {
    return {
      configured: false,
      ready: false,
      status: 'missing_public_origin',
      message: 'Set ROLLER_PAYMENT_PUBLIC_ORIGIN after Roller allowlists the public HTTPS test origin.',
    };
  }

  let parsed;
  try {
    parsed = new URL(config.publicOrigin);
  } catch {
    return {
      configured: true,
      ready: false,
      status: 'invalid_public_origin',
      message: 'ROLLER_PAYMENT_PUBLIC_ORIGIN must be a valid URL origin.',
    };
  }

  const localHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  const hasPath = parsed.pathname && parsed.pathname !== '/';

  return {
    configured: true,
    host: parsed.hostname,
    ready: parsed.protocol === 'https:' && !localHost && !hasPath,
    status:
      parsed.protocol !== 'https:'
        ? 'origin_must_be_https'
        : localHost
          ? 'origin_must_be_public'
          : hasPath
            ? 'origin_must_not_include_path'
            : 'public_https_origin_configured',
  };
}

function summarizePrerequisites({ packageCheck, publicOriginCheck, testCardConfirmed }) {
  const blockers = [];

  if (!packageCheck.ready) blockers.push('approved_payment_package');
  if (!publicOriginCheck.ready) blockers.push('public_https_allowlisted_origin');
  if (!testCardConfirmed) blockers.push('roller_fake_or_test_card_details');

  return {
    blocked: blockers.length > 0,
    blockers,
  };
}

function summarizeError(body) {
  if (!body?.error) return null;

  return {
    code: stringOrNull(body.error.code),
    message: stringOrNull(body.error.message),
  };
}

function parseJsonOrNull(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hostOrNull(value) {
  if (!value) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
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

function safeConfigSummary(config) {
  return {
    apiBaseUrlHost: hostOrNull(config.apiBaseUrl),
    bookingDate: config.bookingDate,
    packageUrlHost: hostOrNull(config.packageUrl),
    productId: config.productId,
    publicOriginHost: hostOrNull(config.publicOrigin),
    quantity: config.quantity,
    startTime: config.startTime,
    testCardConfirmed: config.testCardConfirmed,
  };
}

function printHumanResult(result) {
  console.log('JumpYard payment package POC completed.');
  console.log(`- status: ${result.status}`);
  console.log(`- apiBaseUrlHost: ${result.config.apiBaseUrlHost}`);
  console.log(`- product: ${result.config.productId} x ${result.config.quantity}`);
  console.log(`- bookingDate: ${result.config.bookingDate} ${result.config.startTime}`);
  console.log(`- quote: HTTP ${result.quote.statusCode}, total ${result.quote.total}, amount owing ${result.quote.amountOwing}`);

  if (result.draft) {
    console.log(`- draft: HTTP ${result.draft.statusCode}, unique id ${result.draft.draftUniqueId}`);
    console.log(`- draftPaymentJwtPresent: ${result.draft.paymentJwt.present}`);
    console.log(`- draftPaymentJwtPartCount: ${result.draft.paymentJwt.partCount ?? 'n/a'}`);
    console.log(`- venuePaymentConfigAvailable: ${result.draft.paymentConfig.available}`);
  } else {
    console.log(
      `- draft: not created; use --apply-draft with ROLLER_PAYMENT_POC_ALLOW_DRAFT=${DRAFT_CONFIRMATION} to create one Playground draft`,
    );
  }

  console.log(`- paymentPackage: ${result.paymentPackage.status}`);
  console.log(`- publicOrigin: ${result.publicOrigin.status}`);
  console.log(`- testCardConfirmed: ${result.config.testCardConfirmed}`);

  if (result.prerequisites.blocked) {
    console.log(`- blockers: ${result.prerequisites.blockers.join(', ')}`);
    return;
  }

  console.log('- blockers: none');
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  validateApplyMode(args);

  const config = readConfig();
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const [quote, paymentPackage, publicOrigin] = await Promise.all([
    runQuote(config),
    checkPaymentPackage(config),
    Promise.resolve(checkPublicOrigin(config)),
  ]);

  let draft = null;
  if (args.applyDraft) {
    draft = await runDraft(config);
  }

  const prerequisites = summarizePrerequisites({
    packageCheck: paymentPackage,
    publicOriginCheck: publicOrigin,
    testCardConfirmed: config.testCardConfirmed,
  });
  const result = {
    status:
      quote.ok && (!draft || draft.ok) && !prerequisites.blocked
        ? 'ready_for_browser_payment_test'
        : quote.ok && (!draft || draft.ok)
          ? 'blocked_prerequisites'
          : 'failed',
    config: safeConfigSummary(config),
    quote,
    draft,
    paymentPackage,
    publicOrigin,
    prerequisites,
  };

  if (!quote.ok || (draft && !draft.ok) || (args.requireReady && prerequisites.blocked)) {
    process.exitCode = 1;
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }
}

main().catch((error) => {
  console.error(`JumpYard payment package POC failed: ${error.message}`);
  console.error('No Roller secrets, access tokens, or raw payment JWTs were printed.');
  process.exit(1);
});
