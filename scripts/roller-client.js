const fs = require('fs');
const path = require('path');

const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])(play|playground)([.\-_/]|$)/i;
const DEFAULT_SMOKE_PATH = '/products';

class RollerConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RollerConfigError';
  }
}

function readRollerConfig(env = process.env) {
  return {
    env: env.ROLLER_ENV ?? '',
    baseUrl: env.ROLLER_BASE_URL ?? '',
    clientId: env.ROLLER_CLIENT_ID ?? '',
    clientSecret: env.ROLLER_CLIENT_SECRET ?? '',
  };
}

function loadLocalEnv(filePath = path.join(process.cwd(), '.env'), env = process.env) {
  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = value;
    }
  }

  return true;
}

function normalizeUrl(rawBaseUrl) {
  try {
    return new URL(rawBaseUrl);
  } catch {
    throw new RollerConfigError('ROLLER_BASE_URL must be a valid URL.');
  }
}

function validateRollerEnvironment(config = readRollerConfig()) {
  const errors = [];
  const warnings = [];

  if (config.env !== 'playground') {
    errors.push('ROLLER_ENV must be exactly "playground".');
  }

  if (!config.baseUrl) {
    errors.push('ROLLER_BASE_URL is required.');
  }

  let parsedBaseUrl = null;
  if (config.baseUrl) {
    try {
      parsedBaseUrl = normalizeUrl(config.baseUrl);
      const searchableUrl = `${parsedBaseUrl.hostname}${parsedBaseUrl.pathname}`;

      if (!/^https?:$/.test(parsedBaseUrl.protocol)) {
        errors.push('ROLLER_BASE_URL must use http or https.');
      }

      if (PRODUCTION_URL_MARKER.test(searchableUrl)) {
        errors.push('ROLLER_BASE_URL looks like production/live and is not allowed.');
      }

      if (!PLAYGROUND_URL_MARKER.test(searchableUrl)) {
        errors.push('ROLLER_BASE_URL must clearly point to a playground environment.');
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (!config.clientId.trim()) {
    warnings.push('ROLLER_CLIENT_ID is not set; credential smoke tests will be skipped.');
  }

  if (!config.clientSecret.trim()) {
    warnings.push('ROLLER_CLIENT_SECRET is not set; credential smoke tests will be skipped.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    safeConfig: {
      env: config.env,
      baseUrl: parsedBaseUrl ? parsedBaseUrl.toString() : config.baseUrl,
      hasClientId: Boolean(config.clientId.trim()),
      hasClientSecret: Boolean(config.clientSecret.trim()),
    },
  };
}

function validateRollerSmokeConfig(config = readRollerConfig()) {
  const validation = validateRollerEnvironment(config);
  const errors = [...validation.errors];

  if (!config.clientId.trim()) {
    errors.push('ROLLER_CLIENT_ID is required for the Roller smoke test.');
  }

  if (!config.clientSecret.trim()) {
    errors.push('ROLLER_CLIENT_SECRET is required for the Roller smoke test.');
  }

  return {
    ...validation,
    ok: errors.length === 0,
    errors,
  };
}

function buildRollerUrl(baseUrl, endpointPath) {
  if (!endpointPath.startsWith('/')) {
    throw new RollerConfigError('Roller endpoint paths must start with "/".');
  }

  const parsedBaseUrl = normalizeUrl(baseUrl);
  const basePath = parsedBaseUrl.pathname.replace(/\/$/, '');
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

function createRollerClient(env = process.env) {
  const config = readRollerConfig(env);
  const validation = validateRollerEnvironment(config);

  if (!validation.ok) {
    throw new RollerConfigError(validation.errors.join(' '));
  }

  return {
    config: validation.safeConfig,
    async requestToken() {
      return requestRollerAccessToken(config);
    },
    async readSmokeResource(endpointPath = DEFAULT_SMOKE_PATH) {
      const token = await requestRollerAccessToken(config);
      return requestRollerRead(config, token, endpointPath);
    },
  };
}

async function requestRollerAccessToken(config) {
  const smokeValidation = validateRollerSmokeConfig(config);

  if (!smokeValidation.ok) {
    throw new RollerConfigError(smokeValidation.errors.join(' '));
  }

  const tokenUrl = buildRollerUrl(config.baseUrl, '/token');
  const response = await fetch(tokenUrl, {
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
    throw new Error(`Roller token request failed with HTTP ${response.status}.`);
  }

  const tokenResponse = await response.json();
  const accessToken = tokenResponse.access_token ?? tokenResponse.accessToken;

  if (!accessToken) {
    throw new Error('Roller token response did not include an access token.');
  }

  return {
    accessToken,
    tokenType: tokenResponse.token_type ?? tokenResponse.tokenType ?? 'Bearer',
    expiresIn: tokenResponse.expires_in ?? tokenResponse.expiresIn ?? null,
  };
}

async function requestRollerRead(config, token, endpointPath = DEFAULT_SMOKE_PATH) {
  const readUrl = buildRollerUrl(config.baseUrl, endpointPath);
  const authorizationScheme = token.tokenType || 'Bearer';
  const response = await fetch(readUrl, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${authorizationScheme} ${token.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Roller read-only smoke request failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  let summary = { type: 'text', length: text.length };

  if (contentType.includes('application/json') && text) {
    const parsed = JSON.parse(text);
    summary = Array.isArray(parsed)
      ? { type: 'json-array', count: parsed.length }
      : { type: 'json', keys: Object.keys(parsed).slice(0, 10) };
  }

  return {
    endpointPath,
    status: response.status,
    contentType,
    summary,
  };
}

module.exports = {
  DEFAULT_SMOKE_PATH,
  RollerConfigError,
  buildRollerUrl,
  createRollerClient,
  loadLocalEnv,
  readRollerConfig,
  requestRollerAccessToken,
  requestRollerRead,
  validateRollerEnvironment,
  validateRollerSmokeConfig,
};
