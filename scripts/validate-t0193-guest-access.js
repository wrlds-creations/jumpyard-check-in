const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const DATABASE_ENV = {
  DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:test',
  DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:test',
  JUMPYARD_EMERGENCY_STOP: 'false',
};

function awsField(value) {
  if (value === null || value === undefined) return { isNull: true };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { longValue: value };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: String(value) };
}

function rowResult(row) {
  const entries = Object.entries(row);
  return {
    columnMetadata: entries.map(([name]) => ({ name })),
    records: [entries.map(([, value]) => awsField(value))],
  };
}

function emptyResult() {
  return { columnMetadata: [], records: [] };
}

function fakeAwsModule(moduleId, state, onRdsSend) {
  if (moduleId === '@aws-sdk/client-rds-data') {
    return {
      ExecuteStatementCommand: class ExecuteStatementCommand {
        constructor(input) {
          this.input = input;
        }
      },
      RDSDataClient: class RDSDataClient {
        async send(command) {
          state.rdsCalls.push(command.input);
          return onRdsSend(command.input, state.rdsCalls.length);
        }
      },
    };
  }

  return new Proxy(
    {},
    {
      get(_target, property) {
        return class FakeAwsClientOrCommand {
          constructor(input) {
            this.input = input;
          }

          async send(command) {
            state.otherAwsCalls.push({ command: command?.input ?? null, property: String(property) });
            throw new Error(`Unexpected ${moduleId} call through ${String(property)} during T0193 validation.`);
          }
        };
      },
    },
  );
}

function loadLambda(relativePath, options = {}) {
  const absolutePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const state = { otherAwsCalls: [], rdsCalls: [] };
  const module = { exports: {} };
  const internalNames = options.internalNames ?? [];
  const onRdsSend = options.onRdsSend ?? (() => {
    throw new Error(`Unexpected RDS call in ${relativePath}.`);
  });
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async () => {
      throw new Error(`Unexpected network call in ${relativePath}.`);
    },
    module,
    exports: module.exports,
    process: { env: { ...DATABASE_ENV, ...(options.environment ?? {}) } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule(moduleId, state, onRdsSend);
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) in ${relativePath}.`);
    },
    setTimeout,
  };

  vm.runInNewContext(
    `${source}\nmodule.exports.__t0193GuestAccess = { ${internalNames.join(', ')} };`,
    sandbox,
    { filename: absolutePath },
  );

  return {
    handler: module.exports.handler,
    internals: module.exports.__t0193GuestAccess,
    source,
    state,
  };
}

function responseBody(response) {
  return JSON.parse(response.body);
}

function assertDenied(response, statusCode, code) {
  assert.equal(response.statusCode, statusCode);
  const body = responseBody(response);
  assert.equal(body.error?.code, code);
  assert.equal(body.error?.message?.includes('Valid guest access is required'), true);
}

function sessionEvent(routeKey, rawPath, body, authorization = null) {
  return {
    routeKey,
    rawPath,
    headers: authorization ? { authorization } : {},
    body: JSON.stringify(body),
  };
}

function bookingEvent(routeKey, rawPath, bookingReference, body, authorization = null) {
  return {
    routeKey,
    rawPath,
    pathParameters: { bookingReference },
    headers: authorization ? { authorization } : {},
    body: JSON.stringify(body),
  };
}

function addProductBody(overrides = {}) {
  return {
    items: [
      {
        bookingDate: '2026-07-13',
        productId: 970338,
        quantity: 1,
        startTime: '10:00',
      },
    ],
    requireAvailability: false,
    ...overrides,
  };
}

async function validateLookupIssuesHashedGuestProof() {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  let activeTokens = 0;
  const loaded = loadLambda('infra/lambda/lookup/index.js', {
    internalNames: ['createGuestAccessToken'],
    onRdsSend(input) {
      assert.match(input.sql, /WITH pruned AS/);
      assert.match(input.sql, /DELETE FROM jumpyard\.checkin_tokens/);
      assert.match(input.sql, /consumed_at IS NOT NULL OR expires_at <= now\(\)/);
      assert.match(input.sql, /INSERT INTO jumpyard\.checkin_tokens/);
      assert.match(input.sql, /active_count < :activeTokenLimit/);
      assert.doesNotMatch(input.sql, /OFFSET\s+\d+/);

      const parameters = new Map(input.parameters.map((parameter) => [parameter.name, parameter.value]));
      assert.equal(parameters.get('activeTokenLimit').longValue, 64);
      const beforeInsert = activeTokens;
      if (activeTokens < 64) activeTokens += 1;
      return rowResult({
        active_count: beforeInsert,
        expires_at: beforeInsert < 64 ? expiresAt : null,
      });
    },
  });

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const result = await loaded.internals.createGuestAccessToken('roller-1');
    assert.equal(typeof result.token, 'string');
    assert.ok(result.token.length >= 40, 'Guest access must carry at least 32 random bytes.');
    assert.equal(result.expiresAt, expiresAt);

    const insertCall = loaded.state.rdsCalls[attempt];
    const parameters = new Map(insertCall.parameters.map((parameter) => [parameter.name, parameter.value]));
    assert.equal(parameters.get('rollerUniqueId').stringValue, 'roller-1');
    assert.equal(parameters.get('channel').stringValue, 'guest_access');
    assert.equal(
      parameters.get('tokenHash').stringValue,
      crypto.createHash('sha256').update(result.token).digest('hex'),
    );
    assert.equal(JSON.stringify(insertCall).includes(result.token), false, 'Only the token hash may be stored.');
  }

  await assert.rejects(
    () => loaded.internals.createGuestAccessToken('roller-1'),
    (error) => error?.code === 'guest_access_rate_limited',
  );
  assert.equal(loaded.state.rdsCalls.length, 65);
  assert.equal(activeTokens, 64, 'Issuance limits must not evict or exceed the modeled active proof bound.');
  assert.equal(loaded.state.otherAwsCalls.length, 0);
}

async function validateSessionLinkReusesOpenedProof() {
  const loaded = loadLambda('infra/lambda/session/index.js', {
    internalNames: ['getLinkGuestAccessExpiresAt', 'shouldAuditSessionLinkOpen', 'verifyGuestAccessToken'],
    onRdsSend(input) {
      assert.match(input.sql, /ct\.channel = :channel/);
      assert.match(input.sql, /ct\.channel IN \('sms', 'email', 'manual', 'dev'\)/);
      assert.match(input.sql, /ct\.opened_at > now\(\) - INTERVAL '60 minutes'/);
      assert.match(input.sql, /ct\.expires_at > now\(\)/);
      return rowResult({ booking_reference: '123456', roller_unique_id: 'roller-link-1' });
    },
  });

  const verified = await loaded.internals.verifyGuestAccessToken({ headers: { authorization: 'Bearer opened-link-token' } });
  assert.equal(verified.ok, true);
  assert.equal(verified.rollerUniqueId, 'roller-link-1');

  const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const originalLinkBound = loaded.internals.getLinkGuestAccessExpiresAt(tenMinutesFromNow);
  assert.ok(Date.parse(originalLinkBound) <= Date.parse(tenMinutesFromNow));

  const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const guestWindowBound = loaded.internals.getLinkGuestAccessExpiresAt(threeHoursFromNow);
  assert.ok(Date.parse(guestWindowBound) <= Date.now() + 60 * 60 * 1000 + 1000);
  assert.ok(Date.parse(guestWindowBound) >= Date.now() + 59 * 60 * 1000);

  const resolveStart = loaded.source.indexOf('async function handleResolveSessionLink');
  const resolveEnd = loaded.source.indexOf('async function expireOldSessions', resolveStart);
  const resolveSource = loaded.source.slice(resolveStart, resolveEnd);
  assert.match(resolveSource, /token: request\.token/);
  assert.doesNotMatch(resolveSource, /issueGuestAccessToken|INSERT INTO jumpyard\.checkin_tokens/);
  assert.match(loaded.source, /SET opened_at = now\(\)/);
  assert.match(loaded.source, /LINK_RESOLVE_COOLDOWN_SECONDS = 5/);
  assert.match(loaded.source, /opened_at <= now\(\) - INTERVAL '\$\{LINK_RESOLVE_COOLDOWN_SECONDS\} seconds'/);
  assert.match(loaded.source, /AND channel IN \('sms', 'email', 'manual', 'dev'\)/);
  assert.match(loaded.source, /AND consumed_at IS NULL/);
  assert.match(loaded.source, /AND expires_at > now\(\)/);
  assert.match(resolveSource, /checkin_link_rate_limited/);
  assert.equal(loaded.internals.shouldAuditSessionLinkOpen(null), true);
  assert.equal(loaded.internals.shouldAuditSessionLinkOpen(new Date().toISOString()), false);
  assert.equal(loaded.state.otherAwsCalls.length, 0);
}

async function validateSessionGuardsRunBeforeSideEffects() {
  const noAws = loadLambda('infra/lambda/session/index.js');
  const missingStart = await noAws.handler(
    sessionEvent('POST /v1/check-in/sessions', '/v1/check-in/sessions', {
      idempotencyKey: 'start-1',
      rollerUniqueId: 'roller-1',
    }),
  );
  assertDenied(missingStart, 401, 'guest_access_required');

  const missingReady = await noAws.handler(
    sessionEvent(
      'POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff',
      '/v1/check-in/sessions/session-1/ready-for-staff',
      { idempotencyKey: 'ready-1', safetyStatus: 'completed' },
    ),
  );
  assertDenied(missingReady, 401, 'guest_access_required');
  assert.equal(noAws.state.rdsCalls.length, 0);
  assert.equal(noAws.state.otherAwsCalls.length, 0);

  const invalid = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(input) {
      assert.match(input.sql, /FROM jumpyard\.checkin_tokens/);
      assert.match(input.sql, /ct\.channel = :channel/);
      assert.match(input.sql, /ct\.expires_at > now\(\)/);
      return emptyResult();
    },
  });
  const invalidStart = await invalid.handler(
    sessionEvent(
      'POST /v1/check-in/sessions',
      '/v1/check-in/sessions',
      { idempotencyKey: 'start-2', rollerUniqueId: 'roller-1' },
      'Bearer invalid-guest-token',
    ),
  );
  assertDenied(invalidStart, 403, 'guest_access_denied');
  assert.equal(invalid.state.rdsCalls.length, 1);

  const mismatch = loadLambda('infra/lambda/session/index.js', {
    onRdsSend() {
      return rowResult({ booking_reference: '123456', roller_unique_id: 'roller-1' });
    },
  });
  const mismatchStart = await mismatch.handler(
    sessionEvent(
      'POST /v1/check-in/sessions',
      '/v1/check-in/sessions',
      { idempotencyKey: 'start-3', rollerUniqueId: 'roller-2' },
      'Bearer valid-for-another-booking',
    ),
  );
  assertDenied(mismatchStart, 403, 'guest_access_denied');
  assert.equal(mismatch.state.rdsCalls.length, 1, 'Identifier mismatch must stop before booking/session reads or writes.');
}

async function validateGuestAuthFailuresUseSafeEnvelopes() {
  const session = loadLambda('infra/lambda/session/index.js', {
    onRdsSend() {
      const error = new Error('simulated database outage');
      error.code = 'database_config_error';
      throw error;
    },
  });
  const sessionResponse = await session.handler(
    sessionEvent(
      'POST /v1/check-in/sessions',
      '/v1/check-in/sessions',
      { idempotencyKey: 'start-db-failure', rollerUniqueId: 'roller-1' },
      'Bearer valid-shaped-token',
    ),
  );
  assert.equal(sessionResponse.statusCode, 500);
  assert.equal(responseBody(sessionResponse).error?.code, 'database_config_error');

  const booking = loadLambda('infra/lambda/booking/index.js', {
    onRdsSend() {
      const error = new Error('simulated database outage');
      error.code = 'database_config_error';
      throw error;
    },
  });
  const bookingResponse = await booking.handler(
    bookingEvent(
      'POST /v1/bookings/{bookingReference}/add-products/quote',
      '/v1/bookings/123456/add-products/quote',
      '123456',
      addProductBody(),
      'Bearer valid-shaped-token',
    ),
  );
  assert.equal(bookingResponse.statusCode, 500);
  assert.equal(responseBody(bookingResponse).error?.code, 'database_config_error');
}

async function validateReadyGuardMatchesSessionOwner() {
  const loaded = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(input, callNumber) {
      if (callNumber === 1) {
        return rowResult({ booking_reference: '123456', roller_unique_id: 'roller-1' });
      }
      if (callNumber === 2) {
        assert.match(input.sql, /FROM jumpyard\.checkin_sessions/);
        return rowResult({
          booking_reference: '999999',
          checkin_session_id: 'session-2',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          roller_unique_id: 'roller-2',
          selected_ticket_ids: '[]',
          status: 'guest_in_progress',
        });
      }
      throw new Error('Ready mismatch reached an unexpected database operation.');
    },
  });

  const response = await loaded.handler(
    sessionEvent(
      'POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff',
      '/v1/check-in/sessions/session-2/ready-for-staff',
      { idempotencyKey: 'ready-2', safetyStatus: 'completed' },
      'Bearer valid-for-roller-1',
    ),
  );
  assertDenied(response, 403, 'guest_access_denied');
  assert.equal(loaded.state.rdsCalls.length, 2);
  assert.equal(
    loaded.state.rdsCalls.some((call) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(call.sql)),
    false,
    'Owner mismatch must stop before session mutation.',
  );
}

async function validateGuestProofCannotBeUsedAsSessionLink() {
  const loaded = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(input) {
      assert.match(input.sql, /FROM jumpyard\.checkin_tokens AS ct/);
      return rowResult({
        booking_reference: '123456',
        channel: 'guest_access',
        consumed_at: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        opened_at: null,
        roller_unique_id: 'roller-1',
        token_hash: 'hash',
      });
    },
  });

  const response = await loaded.handler(
    sessionEvent('POST /v1/check-in/session-links/resolve', '/v1/check-in/session-links/resolve', {
      token: 'raw-guest-access-token',
    }),
  );
  assert.equal(response.statusCode, 404);
  assert.equal(responseBody(response).error?.code, 'checkin_link_not_found');
  assert.equal(loaded.state.rdsCalls.length, 1, 'Guest proof must be rejected before link-open/session side effects.');
}

async function validateExpiredAndConsumedLinksFailClosed() {
  for (const scenario of [
    {
      expectedCode: 'checkin_link_consumed',
      row: {
        booking_reference: '123456',
        channel: 'sms',
        consumed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        opened_at: null,
        roller_unique_id: 'roller-1',
        token_hash: 'hash-consumed',
      },
    },
    {
      expectedCode: 'checkin_link_expired',
      row: {
        booking_reference: '123456',
        channel: 'email',
        consumed_at: null,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        opened_at: null,
        roller_unique_id: 'roller-1',
        token_hash: 'hash-expired',
      },
    },
  ]) {
    const loaded = loadLambda('infra/lambda/session/index.js', {
      onRdsSend() {
        return rowResult(scenario.row);
      },
    });
    const response = await loaded.handler(
      sessionEvent('POST /v1/check-in/session-links/resolve', '/v1/check-in/session-links/resolve', {
        token: `raw-${scenario.expectedCode}`,
      }),
    );
    assert.equal(response.statusCode, 409);
    assert.equal(responseBody(response).error?.code, scenario.expectedCode);
    assert.equal(loaded.state.rdsCalls.length, 1, 'Invalid links must stop before open/session writes.');
  }
}

async function validateAddProductGuardsRunBeforeRoller() {
  const noAws = loadLambda('infra/lambda/booking/index.js', {
    environment: { ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true' },
  });
  const quote = await noAws.handler(
    bookingEvent(
      'POST /v1/bookings/{bookingReference}/add-products/quote',
      '/v1/bookings/123456/add-products/quote',
      '123456',
      addProductBody(),
    ),
  );
  assertDenied(quote, 401, 'guest_access_required');

  const draft = await noAws.handler(
    bookingEvent(
      'POST /v1/bookings/{bookingReference}/add-products',
      '/v1/bookings/123456/add-products',
      '123456',
      addProductBody({ confirmDraft: true, idempotencyKey: 'add-product-1' }),
    ),
  );
  assertDenied(draft, 401, 'guest_access_required');
  assert.equal(noAws.state.rdsCalls.length, 0);
  assert.equal(noAws.state.otherAwsCalls.length, 0);

  const mismatch = loadLambda('infra/lambda/booking/index.js', {
    onRdsSend(input) {
      assert.match(input.sql, /FROM jumpyard\.checkin_tokens/);
      assert.match(input.sql, /ct\.channel IN \('sms', 'email', 'manual', 'dev'\)/);
      assert.match(input.sql, /ct\.opened_at > now\(\) - INTERVAL '60 minutes'/);
      return rowResult({ booking_reference: '999999', roller_unique_id: 'roller-9' });
    },
  });
  const mismatchQuote = await mismatch.handler(
    bookingEvent(
      'POST /v1/bookings/{bookingReference}/add-products/quote',
      '/v1/bookings/123456/add-products/quote',
      '123456',
      addProductBody(),
      'Bearer valid-for-another-booking',
    ),
  );
  assertDenied(mismatchQuote, 403, 'guest_access_denied');
  assert.equal(mismatch.state.rdsCalls.length, 1, 'Add-product mismatch must stop before Roller configuration or calls.');
  assert.equal(mismatch.state.otherAwsCalls.length, 0);
}

function validatePhonePropagation() {
  const client = fs.readFileSync(path.join(ROOT, 'jumpyard-checkin-phone/src/flow/cloudClient.ts'), 'utf8');
  const page = fs.readFileSync(path.join(ROOT, 'jumpyard-checkin-phone/src/app/page.tsx'), 'utf8');
  const types = fs.readFileSync(path.join(ROOT, 'jumpyard-checkin-phone/src/flow/types.ts'), 'utf8');
  const authorizationHeaders = client.match(/authorization:\s*`Bearer \$\{/g) ?? [];

  assert.equal(authorizationHeaders.length, 4, 'Phone client must authorize session start, ready, add-on quote, and add-on write.');
  assert.match(client, /body\.guestAccess\?\.token/);
  assert.match(client, /toBooking\(body\.booking, 'ready', body\.source, body\.guestAccess\)/);
  assert.match(client, /checkin_link_rate_limited/);
  assert.match(client, /catch \{\s*await delay\(500\)/);
  assert.match(client, /result\.response\.status >= 500/);
  assert.match(client, /await delay\(retryAfterSeconds \* 1000\)/);
  assert.equal((types.match(/guestAccessToken\?: string;/g) ?? []).length, 2);
  assert.match(page, /url\.searchParams\.delete\('jy_token'\)/);
  assert.match(page, /url\.searchParams\.delete\('token'\)/);
  assert.match(page, /window\.history\.replaceState/);
  assert.doesNotMatch(page, /(?:localStorage|sessionStorage)\.setItem\([^\n]*(?:jy_token|guestAccessToken)/);
}

async function main() {
  await validateLookupIssuesHashedGuestProof();
  await validateSessionLinkReusesOpenedProof();
  await validateSessionGuardsRunBeforeSideEffects();
  await validateGuestAuthFailuresUseSafeEnvelopes();
  await validateReadyGuardMatchesSessionOwner();
  await validateGuestProofCannotBeUsedAsSessionLink();
  await validateExpiredAndConsumedLinksFailClosed();
  await validateAddProductGuardsRunBeforeRoller();
  validatePhonePropagation();

  console.log('[pass] lookup stores only hashed 32-byte proofs and applies a non-evicting 64-token steady-state soft cap');
  console.log('[pass] link resolve reuses its opened hash with a five-second per-token cooldown and bounded 60-minute window');
  console.log('[pass] session start, ready-for-staff, and add-product operations reject missing/mismatched proof before side effects');
  console.log('[pass] guest-auth dependency failures return classified safe API envelopes');
  console.log('[pass] wrong-class, expired, and consumed credentials fail closed before session-link side effects');
  console.log('[pass] phone keeps guest proof in memory, scrubs magic-link URL parameters, and protects all guest operations');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
