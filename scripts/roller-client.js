const PRODUCTION_URL_MARKER = /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i;
const PLAYGROUND_URL_MARKER = /(^|[.\-_/])playground([.\-_/]|$)/i;

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

  if (!config.clientId) {
    warnings.push('ROLLER_CLIENT_ID is not set; credential smoke tests will be skipped.');
  }

  if (!config.clientSecret) {
    warnings.push('ROLLER_CLIENT_SECRET is not set; credential smoke tests will be skipped.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    safeConfig: {
      env: config.env,
      baseUrl: parsedBaseUrl ? parsedBaseUrl.toString() : config.baseUrl,
      hasClientId: Boolean(config.clientId),
      hasClientSecret: Boolean(config.clientSecret),
    },
  };
}

function createRollerClient(env = process.env) {
  const config = readRollerConfig(env);
  const validation = validateRollerEnvironment(config);

  if (!validation.ok) {
    throw new RollerConfigError(validation.errors.join(' '));
  }

  return {
    config: validation.safeConfig,
    request() {
      throw new Error('Roller API calls are not implemented yet.');
    },
  };
}

module.exports = {
  RollerConfigError,
  createRollerClient,
  readRollerConfig,
  validateRollerEnvironment,
};
