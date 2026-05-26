#!/usr/bin/env node
const {
  buildRollerUrl,
  loadLocalEnv,
  readRollerConfig,
  requestRollerAccessToken,
  validateRollerSmokeConfig,
} = require('./roller-client');

const DEFAULT_API_BASE_URL = 'https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com';
const DEFAULT_PACKAGE_DOCS_URL = 'https://docs.roller.app/docs/roller-payments/egj77d29eagwv-version-history';
const DEFAULT_PUBLIC_ORIGIN = 'https://jumpyard-check-in.pages.dev';
const DEFAULT_TEST_CARD_LAST4 = '1142';

function parseArgs(argv) {
  const args = {
    json: false,
    requireReady: false,
  };

  for (const arg of argv) {
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

function readConfig(env = process.env) {
  return {
    allowlistConfirmed: env.ROLLER_PAYMENT_ALLOWLIST_CONFIRMED === 'true',
    apiBaseUrl:
      env.JUMPYARD_CLOUD_API_BASE_URL ||
      env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL ||
      DEFAULT_API_BASE_URL,
    packageDocsUrl: env.ROLLER_PAYMENT_PACKAGE_DOCS_URL || DEFAULT_PACKAGE_DOCS_URL,
    publicOrigin: env.ROLLER_PAYMENT_PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN,
    roller: readRollerConfig(env),
    testCardLast4: env.ROLLER_PAYMENT_TEST_CARD_LAST4 || DEFAULT_TEST_CARD_LAST4,
  };
}

function validateConfig(config) {
  const errors = [];
  const rollerValidation = validateRollerSmokeConfig(config.roller);
  errors.push(...rollerValidation.errors);

  validateHttpsUrl(config.packageDocsUrl, 'ROLLER_PAYMENT_PACKAGE_DOCS_URL', errors);
  validateHttpsUrl(config.publicOrigin, 'ROLLER_PAYMENT_PUBLIC_ORIGIN', errors);
  validateHttpUrl(config.apiBaseUrl, 'JUMPYARD_CLOUD_API_BASE_URL', errors);

  if (!/^\d{4}$/.test(config.testCardLast4)) {
    errors.push('ROLLER_PAYMENT_TEST_CARD_LAST4 must be exactly four digits.');
  }

  return errors;
}

function validateHttpsUrl(value, name, errors) {
  try {
    const parsed = new URL(value);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

    if (parsed.protocol !== 'https:') {
      errors.push(`${name} must use https.`);
    }

    if (name === 'ROLLER_PAYMENT_PUBLIC_ORIGIN' && isLocal) {
      errors.push(`${name} must be a public HTTPS origin, not localhost.`);
    }

    if (name === 'ROLLER_PAYMENT_PUBLIC_ORIGIN' && parsed.pathname !== '/') {
      errors.push(`${name} must be an origin only, with no path.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
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

async function getVenuePaymentSettings(config) {
  const token = await requestRollerAccessToken(config.roller);
  const response = await fetch(buildRollerUrl(config.roller.baseUrl, '/venues/me'), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });
  const text = await response.text();
  const body = parseJsonOrNull(text);
  const settings = body && typeof body === 'object' ? body.paymentSettings : null;

  return {
    ok: response.ok,
    statusCode: response.status,
    paymentSettings: summarizePaymentSettings(settings),
  };
}

async function checkUrl(url, accept = 'text/html,application/json;q=0.9,*/*;q=0.8') {
  const parsed = new URL(url);

  try {
    const response = await fetch(parsed, {
      method: 'GET',
      headers: { accept },
    });
    const text = await response.text();

    return {
      contentType: response.headers.get('content-type'),
      host: parsed.hostname,
      ok: response.ok,
      statusCode: response.status,
      title: extractTitle(text),
    };
  } catch (error) {
    return {
      contentType: null,
      host: parsed.hostname,
      ok: false,
      statusCode: null,
      title: null,
      error: error.message,
    };
  }
}

function summarizePaymentSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return {
      apiUrlHost: null,
      available: false,
      configurationIdPresent: false,
      integrationIdPresent: false,
      keys: [],
      present: false,
    };
  }

  return {
    apiUrlHost: hostOrNull(settings.apiUrl),
    available: Boolean(settings.integrationId && settings.configurationId && settings.apiUrl),
    configurationIdPresent: Boolean(settings.configurationId),
    integrationIdPresent: Boolean(settings.integrationId),
    keys: Object.keys(settings).sort().slice(0, 20),
    present: true,
  };
}

function summarizePrerequisites({ config, packageDocs, publicOrigin, venue }) {
  const blockers = [];

  if (!venue.ok) blockers.push('roller_venues_me_access');
  if (!venue.paymentSettings.available) blockers.push('venue_payment_settings');
  if (!packageDocs.ok) blockers.push('roller_payment_docs_access');
  if (!publicOrigin.ok) blockers.push('public_origin_reachable');
  if (!config.allowlistConfirmed) blockers.push('public_origin_allowlist_confirmation');
  if (config.testCardLast4 !== DEFAULT_TEST_CARD_LAST4) blockers.push('adyen_test_card_ending_1142');

  return {
    blocked: blockers.length > 0,
    blockers,
  };
}

function safeConfigSummary(config) {
  return {
    allowlistConfirmed: config.allowlistConfirmed,
    apiBaseUrlHost: hostOrNull(config.apiBaseUrl),
    packageDocsHost: hostOrNull(config.packageDocsUrl),
    publicOriginHost: hostOrNull(config.publicOrigin),
    rollerBaseUrlHost: hostOrNull(config.roller.baseUrl),
    rollerEnv: config.roller.env,
    testCardLast4: config.testCardLast4,
  };
}

function hostOrNull(value) {
  if (!value) return null;

  try {
    return new URL(value).hostname;
  } catch {
    return null;
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

function extractTitle(text) {
  const match = String(text || '').match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function printHumanResult(result) {
  console.log('JumpYard payment readiness completed.');
  console.log(`- status: ${result.status}`);
  console.log(`- rollerEnv: ${result.config.rollerEnv}`);
  console.log(
    `- venuePaymentSettings: HTTP ${result.venue.statusCode}, available ${result.venue.paymentSettings.available}`,
  );
  console.log(
    `- paymentSettingsKeys: ${result.venue.paymentSettings.keys.join(', ') || 'none'}`,
  );
  console.log(`- publicOrigin: ${result.config.publicOriginHost}, HTTP ${result.publicOrigin.statusCode}`);
  console.log(`- allowlistConfirmed: ${result.config.allowlistConfirmed}`);
  console.log(`- packageDocs: ${result.config.packageDocsHost}, HTTP ${result.packageDocs.statusCode}`);
  console.log(`- testCard: Adyen Visa ending ${result.config.testCardLast4}`);

  if (result.prerequisites.blocked) {
    console.log(`- blockers: ${result.prerequisites.blockers.join(', ')}`);
    return;
  }

  console.log('- blockers: none');
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const [venue, publicOrigin, packageDocs] = await Promise.all([
    getVenuePaymentSettings(config),
    checkUrl(config.publicOrigin),
    checkUrl(config.packageDocsUrl),
  ]);
  const prerequisites = summarizePrerequisites({
    config,
    packageDocs,
    publicOrigin,
    venue,
  });
  const result = {
    status: prerequisites.blocked ? 'pending_payment_prerequisites' : 'ready_for_payment_implementation',
    config: safeConfigSummary(config),
    packageDocs,
    publicOrigin,
    prerequisites,
    venue,
  };

  if (args.requireReady && prerequisites.blocked) {
    process.exitCode = 1;
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }
}

main().catch((error) => {
  console.error(`JumpYard payment readiness failed: ${error.message}`);
  console.error('No Roller secrets, access tokens, raw payment JWTs, or full card numbers were printed.');
  process.exit(1);
});
