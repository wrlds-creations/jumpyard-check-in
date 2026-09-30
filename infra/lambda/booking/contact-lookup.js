'use strict';

// GH-473/D0234: contact resolution for a new-purchase draft whose customer holds only a first name
// and an email. Before any ROLLER call, Cloud asks Klaviyo for the one profile with that exact email.
// - Exactly one profile: Klaviyo's first name, last name, phone and address fields. A field Klaviyo
//   does not have gets its placeholder; a missing address is omitted.
// - No profile: the typed first name, last name `Gäst` and phone `0700000000`, without an address.
// - Anything else is uncertain (several profiles, an HTTP error, a timeout, no usable key, a disabled
//   lookup or an unexpected answer): no draft is created and the guest is asked for last name and phone.
// Klaviyo values only travel inside the ROLLER customer. They are never logged or returned to a client.

const KLAVIYO_PROFILES_URL = 'https://a.klaviyo.com/api/profiles';
const KLAVIYO_REVISION = '2026-07-15';
const KLAVIYO_PROFILE_FIELDS = 'email,first_name,last_name,phone_number,location';
const CONTACT_DETAILS_REQUIRED = 'contact_details_required';
const PLACEHOLDER_LAST_NAME = 'Gäst';
const PLACEHOLDER_PHONE = '0700000000';
const DEFAULT_TIMEOUT_MS = 1500;
const API_KEY_CACHE_MS = 5 * 60 * 1000;
const MISSING_API_KEY_CACHE_MS = 60 * 1000;
// Lower-case RFC 5322 atext and a plain domain: nothing that can change the filter expression.
const LOOKUP_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
// Klaviyo private keys start with pk_ and may contain further underscores.
const API_KEY = /^pk_[A-Za-z0-9_-]{8,250}$/;
// D0234: only the postcode is copied. Klaviyo can derive city/country from IP, so they are never read.
const ADDRESS_FIELDS = [['zip', 'postcode']];

class MalformedProfile extends Error {}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 'email_first' only for a first name and an email with neither last name nor phone. Every other
 * shape keeps the unchanged four-field contract ('full'), including its validation errors.
 */
function draftContactMode(customer) {
  const present = (field) => text(customer?.[field]) !== null;
  return present('firstName') && present('email') && !present('lastName') && !present('phone')
    ? 'email_first'
    : 'full';
}

function lookupEmail(value) {
  const email = text(value)?.toLowerCase() ?? null;
  return email && email.length <= 254 && LOOKUP_EMAIL.test(email) ? email : null;
}

function buildProfileLookupUrl(email) {
  return `${KLAVIYO_PROFILES_URL}?filter=${encodeURIComponent(`equals(email,"${email}")`)}` +
    `&fields[profile]=${KLAVIYO_PROFILE_FIELDS}`;
}

/** Accepts the plain key or {"apiKey":"pk_..."}; anything else is not a usable key. */
function parseApiKey(secretString) {
  let candidate = text(secretString);
  if (candidate?.startsWith('{')) {
    try {
      const parsed = JSON.parse(candidate);
      candidate = isPlainObject(parsed) ? text(parsed.apiKey) : null;
    } catch {
      candidate = null;
    }
  }
  return candidate && API_KEY.test(candidate) ? candidate : null;
}

async function readApiKey(secretId, readSecretString) {
  if (!text(secretId)) return { ok: false, reason: 'key_unconfigured' };
  let secretString;
  try {
    secretString = await readSecretString(secretId);
  } catch (error) {
    // The CDK secret starts empty: until a value is stored it has no current version.
    return { ok: false, reason: error?.name === 'ResourceNotFoundException' ? 'key_missing' : 'key_unavailable' };
  }
  if (!text(secretString)) return { ok: false, reason: 'key_missing' };
  const key = parseApiKey(secretString);
  return key ? { ok: true, key } : { ok: false, reason: 'key_invalid' };
}

/** One read per container and cache period. A rejected key is dropped so a replacement applies at once. */
function createApiKeyProvider({ secretId, readSecretString, now = Date.now }) {
  let cached = null;
  return {
    async get() {
      const time = now();
      if (cached && cached.expiresAt > time) return cached.result;
      let result;
      try {
        result = await readApiKey(typeof secretId === 'function' ? secretId() : secretId, readSecretString);
      } catch {
        result = { ok: false, reason: 'key_unavailable' };
      }
      cached = { result, expiresAt: time + (result.ok ? API_KEY_CACHE_MS : MISSING_API_KEY_CACHE_MS) };
      return result;
    },
    reset() {
      cached = null;
    },
  };
}

/** Swedish numbers return to the national form the phone app sends; other countries keep E.164. */
function rollerPhone(value) {
  const compact = String(value ?? '').replace(/[\s()-]/g, '');
  const swedish = /^\+46(?:0)?([1-9]\d{5,11})$/.exec(compact);
  if (swedish) return `0${swedish[1]}`;
  return /^\+[1-9]\d{6,14}$/.test(compact) ? compact : null;
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new MalformedProfile();
  return text(value);
}

function optionalPhone(value) {
  const phone = optionalText(value);
  if (phone === null) return null;
  const converted = rollerPhone(phone);
  if (!converted) throw new MalformedProfile();
  return converted;
}

function optionalAddress(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) throw new MalformedProfile();
  const address = {};
  for (const [from, to] of ADDRESS_FIELDS) {
    const field = optionalText(value[from]);
    if (field) address[to] = field;
  }
  return Object.keys(address).length > 0 ? address : null;
}

function readProfile(entry, email) {
  if (!isPlainObject(entry) || entry.type !== 'profile' || !isPlainObject(entry.attributes)) {
    throw new MalformedProfile();
  }
  const attributes = entry.attributes;
  if (typeof attributes.email !== 'string') throw new MalformedProfile();
  if (attributes.email.trim().toLowerCase() !== email) return null;
  return {
    firstName: optionalText(attributes.first_name),
    lastName: optionalText(attributes.last_name),
    phone: optionalPhone(attributes.phone_number),
    address: optionalAddress(attributes.location),
  };
}

function uncertain(reason) {
  return { outcome: 'uncertain', reason };
}

function classifyProfiles(body, email) {
  if (!isPlainObject(body) || !Array.isArray(body.data)) return uncertain('malformed');
  const next = isPlainObject(body.links) ? body.links.next : undefined;
  if (next !== undefined && next !== null && typeof next !== 'string') return uncertain('malformed');
  if (body.data.length > 1 || (body.data.length === 1 && next)) return uncertain('multiple');
  if (body.data.length === 0) return next ? uncertain('malformed') : { outcome: 'not_found' };
  try {
    const profile = readProfile(body.data[0], email);
    return profile ? { outcome: 'found', profile } : uncertain('email_mismatch');
  } catch (error) {
    if (error instanceof MalformedProfile) return uncertain('malformed');
    throw error;
  }
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

async function discardBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // The connection pool recovers on its own; the outcome is already decided.
  }
}

async function fetchProfiles(email, apiKey, { timeoutMs, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(buildProfileLookupUrl(email), {
      method: 'GET',
      headers: {
        accept: 'application/vnd.api+json',
        authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
      },
      redirect: 'error',
      // One budget for connection, headers and body. Node's global fetch keeps the connection alive.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return uncertain(isTimeout(error) ? 'timeout' : 'network');
  }
  if (!response?.ok) {
    await discardBody(response);
    return uncertain(Number.isInteger(response?.status) ? `http_${response.status}` : 'malformed');
  }
  let body;
  try {
    body = await response.json();
  } catch (error) {
    return uncertain(isTimeout(error) ? 'timeout' : 'malformed');
  }
  return classifyProfiles(body, email);
}

function knownCustomer(typed, profile) {
  return {
    ...typed,
    firstName: profile.firstName || typed.firstName,
    lastName: profile.lastName || PLACEHOLDER_LAST_NAME,
    phone: profile.phone || PLACEHOLDER_PHONE,
    ...(profile.address ? { address: profile.address } : {}),
  };
}

function unknownCustomer(typed) {
  return { ...typed, lastName: PLACEHOLDER_LAST_NAME, phone: PLACEHOLDER_PHONE };
}

/**
 * Resolves an email-first customer. Returns { ok: true, outcome, customer, latencyMs } for a found or
 * unknown email, otherwise { ok: false, outcome: 'uncertain', reason, latencyMs }. Never throws.
 */
async function resolveEmailFirstCustomer(customer, {
  enabled, timeoutMs = DEFAULT_TIMEOUT_MS, apiKeys, fetchImpl, now = Date.now,
}) {
  const result = (reason, latencyMs = null) => ({ ok: false, outcome: 'uncertain', reason, latencyMs });
  if (!enabled) return result('disabled');
  const email = lookupEmail(customer?.email);
  if (!email) return result('email_unsupported');
  let apiKey;
  try {
    apiKey = await apiKeys.get();
  } catch {
    apiKey = { ok: false, reason: 'key_unavailable' };
  }
  if (!apiKey?.ok) return result(apiKey?.reason || 'key_unavailable');

  const startedAt = now();
  let answer;
  try {
    answer = await fetchProfiles(email, apiKey.key, { timeoutMs, fetchImpl });
  } catch {
    answer = uncertain('malformed');
  }
  const latencyMs = Math.max(0, now() - startedAt);
  if (answer.reason === 'http_401' || answer.reason === 'http_403') apiKeys.reset();
  if (answer.outcome === 'found') {
    return { ok: true, outcome: 'found', customer: knownCustomer(customer, answer.profile), latencyMs };
  }
  if (answer.outcome === 'not_found') {
    return { ok: true, outcome: 'not_found', customer: unknownCustomer(customer), latencyMs };
  }
  return result(answer.reason, latencyMs);
}

/** The only lookup detail that may be logged: found, not_found or uncertain:<reason>. */
function describeOutcome(result) {
  return result?.outcome === 'uncertain' ? `uncertain:${result.reason}` : String(result?.outcome ?? 'unknown');
}

module.exports = {
  CONTACT_DETAILS_REQUIRED,
  DEFAULT_TIMEOUT_MS,
  KLAVIYO_REVISION,
  PLACEHOLDER_LAST_NAME,
  PLACEHOLDER_PHONE,
  buildProfileLookupUrl,
  classifyProfiles,
  createApiKeyProvider,
  describeOutcome,
  draftContactMode,
  parseApiKey,
  resolveEmailFirstCustomer,
  rollerPhone,
};
