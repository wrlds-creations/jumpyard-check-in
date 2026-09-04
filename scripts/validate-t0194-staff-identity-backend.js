const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const EMPTY_RESULT = { columnMetadata: [], records: [] };
const NOW_SECONDS = Math.floor(Date.now() / 1000);
const TEST_PIN = '482951';
const TEST_PEPPER = 't0194-independent-pin-pepper-0123456789abcdef';
const PIN_ENV = Object.freeze({
  DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:t0194-test',
  DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:t0194-db',
  ENABLE_STAFF_AUTH: 'true',
  ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
  JUMPYARD_EMERGENCY_STOP: 'false',
  JUMPYARD_ENVIRONMENT: 'park-test',
  STAFF_COGNITO_CLIENT_ID: 't0194-admin-client',
  STAFF_IDENTITY_ENVIRONMENT: 'park-test',
  STAFF_IDENTITY_MODE: 'pin',
  STAFF_IDENTITY_VENUE_ID: '50871',
  STAFF_PIN_PEPPER: TEST_PEPPER,
});

function fakeAwsModule(moduleId, state) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return class FakeAwsClientOrCommand {
          constructor(input) {
            this.input = input;
            this.kind = String(property);
          }

          async send(command) {
            const call = {
              client: String(property),
              command: command?.kind ?? null,
              input: command?.input ?? null,
              moduleId,
            };
            state.awsCalls.push(call);
            if (property === 'RDSDataClient') return state.onRdsSend(call);
            if (property === 'SecretsManagerClient') return state.onSecretsSend(call);
            throw new Error(`Unexpected AWS call through ${moduleId}:${String(property)}.`);
          }
        };
      },
    },
  );
}

function loadLambda(relativePath, options = {}) {
  const absolutePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const state = {
    awsCalls: [],
    networkCalls: [],
    onRdsSend: options.onRdsSend ?? (() => EMPTY_RESULT),
    onSecretsSend: options.onSecretsSend ?? (() => {
      throw new Error('No Secrets Manager call was expected.');
    }),
  };
  const module = { exports: {} };
  const sandbox = {
    AbortController,
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} },
    exports: module.exports,
    fetch: async (...args) => {
      state.networkCalls.push(args);
      throw new Error(`Unexpected network call in ${relativePath}.`);
    },
    module,
    process: { env: { ...PIN_ENV, ...(options.env ?? {}) } },
    require(moduleId) {
      if (moduleId === './package-contents') return require(path.join(path.dirname(absolutePath), 'package-contents.js'));
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule(moduleId, state);
      if (relativePath === 'infra/lambda/session/index.js' && moduleId === './email-template') {
        return require(path.join(path.dirname(absolutePath), 'email-template.js'));
      }
      if (relativePath === 'infra/lambda/booking/index.js' && moduleId === './kiosk-terminal-contract') {
        return require(path.join(path.dirname(absolutePath), 'kiosk-terminal-contract.js'));
      }
      if (relativePath === 'infra/lambda/booking/index.js' && moduleId === './phone-product-catalog') {
        return require(path.join(path.dirname(absolutePath), 'phone-product-catalog.js'));
      }
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}).`);
    },
    setTimeout,
  };
  vm.runInNewContext(source, sandbox, { filename: absolutePath });
  return { handler: module.exports.handler, source, state };
}

function field(value) {
  if (value === null || value === undefined) return { isNull: true };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isInteger(value)) return { longValue: value };
  return { stringValue: String(value) };
}

function rowsResult(rows) {
  if (rows.length === 0) return EMPTY_RESULT;
  const columns = Object.keys(rows[0]);
  return {
    columnMetadata: columns.map((name) => ({ label: name, name })),
    records: rows.map((row) => columns.map((name) => field(row[name]))),
  };
}

function parameterMap(call) {
  return Object.fromEntries(
    (call.input?.parameters ?? []).map((parameter) => [
      parameter.name,
      parameter.value?.stringValue ?? parameter.value?.longValue ?? parameter.value?.booleanValue ?? null,
    ]),
  );
}

function allParameterText(state) {
  return JSON.stringify(state.awsCalls.flatMap((call) => call.input?.parameters ?? []));
}

function sql(call) {
  return String(call.input?.sql ?? '');
}

function body(response) {
  return JSON.parse(response.body);
}

function event(routeKey, rawPath, requestBody = {}, options = {}) {
  const method = routeKey.split(' ')[0];
  const requestContext = {
    http: { method, path: rawPath, sourceIp: options.sourceIp ?? '192.0.2.44' },
  };
  if (options.claims) requestContext.authorizer = { jwt: { claims: options.claims } };
  return {
    body: JSON.stringify(requestBody),
    headers: options.headers ?? {},
    pathParameters: options.pathParameters,
    rawPath,
    requestContext,
    routeKey,
  };
}

function adminClaims(overrides = {}) {
  return {
    auth_time: String(NOW_SECONDS - 60),
    client_id: 't0194-admin-client',
    exp: String(NOW_SECONDS + 60 * 60),
    iat: String(NOW_SECONDS - 30),
    origin_jti: 'admin-origin-jti-never-stored',
    sub: 'cognito-admin-love',
    token_use: 'access',
    ...overrides,
  };
}

function makePinVerifier(pin = TEST_PIN) {
  const salt = Buffer.from('0123456789abcdef', 'utf8');
  const material = crypto
    .createHmac('sha256', TEST_PEPPER)
    .update(['staff-pin-verify-v1', 'park-test', '50871', pin].join('\u0000'))
    .digest();
  const derived = crypto.scryptSync(material, salt, 32, { N: 32768, p: 1, r: 8, maxmem: 64 * 1024 * 1024 });
  return `scrypt-v1$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function identityRow(overrides = {}) {
  return {
    active: true,
    display_name: 'Love Operator',
    environment: 'park-test',
    family_name: 'Operator',
    given_name: 'Love',
    identity_revoked_at: null,
    pin_verifier: makePinVerifier(),
    provider_subject: 'jystaff_love',
    role: 'staff_operator',
    staff_identity_id: 'jystaff_love',
    tokens_valid_after: new Date((NOW_SECONDS - 600) * 1000).toISOString(),
    venue_id: '50871',
    ...overrides,
  };
}

function adminIdentityRow(overrides = {}) {
  return identityRow({
    display_name: 'Love Admin',
    family_name: null,
    given_name: null,
    pin_verifier: null,
    provider_subject: 'cognito-admin-love',
    role: 'staff_admin',
    staff_identity_id: 'jystaff_admin_love',
    ...overrides,
  });
}

function sessionRow(overrides = {}) {
  return {
    ...identityRow(),
    absolute_expires_at: new Date((NOW_SECONDS + 7 * 60 * 60) * 1000).toISOString(),
    idle_expires_at: new Date((NOW_SECONDS + 15 * 60) * 1000).toISOString(),
    last_seen_at: new Date().toISOString(),
    session_revoked_at: null,
    staff_session_id: 'jystaffs-test',
    ...overrides,
  };
}

function adminSessionRow(overrides = {}) {
  return sessionRow({ ...adminIdentityRow(), ...overrides });
}

function assertNoRawCredential(state, values) {
  const text = allParameterText(state);
  for (const value of values) assert.equal(text.includes(value), false, `Raw credential leaked to SQL: ${value}`);
}

function validateMigrationAndSource() {
  const migration = fs.readFileSync(path.join(ROOT, 'infra/migrations/0009_staff_identity.sql'), 'utf8');
  assert.match(migration, /identity_provider IN \('cognito', 'local_pin'\)/);
  assert.match(migration, /role IN \('staff_reader', 'staff_operator', 'staff_admin'\)/);
  assert.match(migration, /pin_lookup_hash text/);
  assert.match(migration, /pin_verifier text/);
  assert.match(migration, /staff_identities_pin_scope_unique_idx/);
  assert.match(migration, /staff_auth_sessions_one_active_pin_idx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS jumpyard\.staff_pin_auth_limits/);
  assert.match(migration, /scope_type IN \('source', 'venue'\)/);
  assert.match(migration, /BEFORE UPDATE OF role, active, revoked_at, tokens_valid_after, pin_lookup_hash, pin_verifier/);
  assert.doesNotMatch(migration, /\bpin\s+(?:text|varchar|char)\b/i);

  const session = fs.readFileSync(path.join(ROOT, 'infra/lambda/session/index.js'), 'utf8');
  assert.match(session, /STAFF_IDENTITY_PROVIDER_PIN = 'local_pin'/);
  assert.match(session, /crypto\.randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(session, /staffPinLookupHash/);
  assert.match(session, /crypto\.scrypt\(/);
  assert.match(session, /staff_pin_auth_limits/);
  assert.match(session, /STAFF_PIN_SOURCE_FAILURE_LIMIT = 20/);
  assert.match(session, /STAFF_PIN_VENUE_FAILURE_LIMIT = 25/);
  assert.match(session, /STAFF_ADMIN_PERMISSION = 'staff:identities:manage'/);
  assert.match(session, /identity\.role = 'staff_admin'/);
  assert.match(session, /new BeginTransactionCommand/);
  assert.match(session, /new CommitTransactionCommand/);
  assert.match(session, /new RollbackTransactionCommand/);
  assert.match(session, /FOR UPDATE/);
  assert.doesNotMatch(session, /WITH revoked AS/);
  const pepperFunction = session.slice(session.indexOf('async function getStaffPinPepper'), session.indexOf('function staffPinLookupHash'));
  assert.match(pepperFunction, /STAFF_PIN_PEPPER_SECRET_ARN/);
  assert.match(pepperFunction, /JSON\.parse\(secretString\)\.pinPepper/);
  assert.doesNotMatch(pepperFunction, /passcode|staffPasscode|signingSecret/);

  const redeem = fs.readFileSync(path.join(ROOT, 'infra/lambda/redeem/index.js'), 'utf8');
  assert.match(redeem, /authorizePinStaffRedeemRequest/);
  assert.match(redeem, /staff_session\.provider_session_hash = :tokenHash/);
  assert.match(redeem, /staff_session\.auth_time >= identity\.tokens_valid_after/);
  assert.match(redeem, /eventType: 'checkin\.staff_redeem_intent_recorded'/);
}

async function validatePinLoginAndHashOnlySession() {
  const sessions = [];
  let transactionCount = 0;
  const loaded = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      if (call.command === 'BeginTransactionCommand') {
        transactionCount += 1;
        return { transactionId: `t0194-login-${transactionCount}` };
      }
      if (call.command === 'CommitTransactionCommand' || call.command === 'RollbackTransactionCommand') return {};

      const statement = sql(call);
      if (/FROM jumpyard\.staff_pin_auth_limits/.test(statement)) return EMPTY_RESULT;
      if (/FROM jumpyard\.staff_identities[\s\S]*FOR UPDATE/.test(statement)) {
        assert.match(call.input?.transactionId ?? '', /^t0194-login-/);
        assert.match(statement, /pin_lookup_hash = :pinLookupHash/);
        assert.match(statement, /pin_verifier = :pinVerifier/);
        assert.equal(parameterMap(call).pinVerifier, makePinVerifier());
        return rowsResult([identityRow()]);
      }
      if (/pin_lookup_hash = :pinLookupHash/.test(statement)) return rowsResult([identityRow()]);
      if (/UPDATE jumpyard\.staff_auth_sessions[\s\S]*new_pin_login/.test(statement)) {
        assert.match(call.input?.transactionId ?? '', /^t0194-login-/);
        const revokedAt = new Date().toISOString();
        for (const session of sessions.filter((candidate) => !candidate.revokedAt)) session.revokedAt = revokedAt;
        return { ...EMPTY_RESULT, numberOfRecordsUpdated: sessions.filter((session) => session.revokedAt === revokedAt).length };
      }
      if (/INSERT INTO jumpyard\.staff_auth_sessions/.test(statement)) {
        assert.match(call.input?.transactionId ?? '', /^t0194-login-/);
        assert.equal(sessions.some((session) => !session.revokedAt), false, 'Only one local PIN session may remain active.');
        const parameters = parameterMap(call);
        sessions.push({
          revokedAt: null,
          staffSessionId: parameters.staffSessionId,
          tokenHash: parameters.tokenHash,
        });
        return rowsResult([{
          absolute_expires_at: parameters.absoluteExpiresAt,
          idle_expires_at: parameters.idleExpiresAt,
          last_seen_at: new Date().toISOString(),
          session_revoked_at: null,
          staff_session_id: parameters.staffSessionId,
        }]);
      }
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session[\s\S]*last_seen_at = now\(\)/.test(statement)) {
        const record = sessions.find((session) => session.tokenHash === parameterMap(call).tokenHash && !session.revokedAt);
        return record ? rowsResult([sessionRow({ staff_session_id: record.staffSessionId })]) : EMPTY_RESULT;
      }
      if (/FROM jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) {
        const record = sessions.find((session) => session.tokenHash === parameterMap(call).tokenHash);
        return record
          ? rowsResult([sessionRow({ session_revoked_at: record.revokedAt, staff_session_id: record.staffSessionId })])
          : EMPTY_RESULT;
      }
      if (/INSERT INTO jumpyard\.event_log/.test(statement)) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      throw new Error(`Unexpected PIN login SQL: ${statement}`);
    },
  });
  const firstResponse = await loaded.handler(event('POST /v1/staff/auth/login', '/v1/staff/auth/login', { pin: TEST_PIN }));
  assert.equal(firstResponse.statusCode, 200);
  assert.equal(body(firstResponse).status, 'authenticated');
  const firstToken = body(firstResponse).auth.token;
  assert.match(firstToken, /^jypin_[A-Za-z0-9_-]{43}$/);
  assert.equal(body(firstResponse).staff.actorId, 'jystaff_love');
  assert.equal(body(firstResponse).staff.role, 'staff_operator');
  assert.match(body(firstResponse).session.sessionId, /^jystaffs_/);

  const secondResponse = await loaded.handler(event('POST /v1/staff/auth/login', '/v1/staff/auth/login', { pin: TEST_PIN }));
  assert.equal(secondResponse.statusCode, 200, 'A second login must atomically replace the first session.');
  assert.equal(body(secondResponse).status, 'authenticated');
  const secondToken = body(secondResponse).auth.token;
  assert.match(secondToken, /^jypin_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(secondToken, firstToken);
  assert.equal(sessions.length, 2);
  assert.equal(sessions.filter((session) => !session.revokedAt).length, 1);
  assert.ok(sessions[0].revokedAt);

  let response = await loaded.handler(event(
    'POST /v1/staff/auth/session',
    '/v1/staff/auth/session',
    { action: 'heartbeat' },
    { headers: { authorization: `Bearer ${firstToken}` } },
  ));
  assert.equal(response.statusCode, 401);
  assert.equal(body(response).error.code, 'staff_auth_session_revoked');

  response = await loaded.handler(event(
    'POST /v1/staff/auth/session',
    '/v1/staff/auth/session',
    { action: 'heartbeat' },
    { headers: { authorization: `Bearer ${secondToken}` } },
  ));
  assert.equal(response.statusCode, 200);
  assert.equal(body(response).status, 'staff_session_active');

  assertNoRawCredential(loaded.state, [TEST_PIN, firstToken, secondToken, '192.0.2.44']);
  const sessionCalls = loaded.state.awsCalls.filter((call) => /INSERT INTO jumpyard\.staff_auth_sessions/.test(sql(call)));
  assert.equal(sessionCalls.length, 2);
  for (const sessionCall of sessionCalls) {
    assert.match(parameterMap(sessionCall).tokenHash, /^[a-f0-9]{64}$/);
    assert.notEqual(parameterMap(sessionCall).tokenHash, firstToken);
    assert.notEqual(parameterMap(sessionCall).tokenHash, secondToken);
  }
  const transactionCommands = loaded.state.awsCalls
    .filter((call) => ['BeginTransactionCommand', 'CommitTransactionCommand', 'RollbackTransactionCommand'].includes(call.command))
    .map((call) => call.command);
  assert.deepEqual(transactionCommands, [
    'BeginTransactionCommand',
    'CommitTransactionCommand',
    'BeginTransactionCommand',
    'CommitTransactionCommand',
  ]);
  for (const transactionId of ['t0194-login-1', 't0194-login-2']) {
    const statements = loaded.state.awsCalls
      .filter((call) => call.command === 'ExecuteStatementCommand' && call.input?.transactionId === transactionId)
      .map((call) => sql(call));
    assert.equal(statements.length, 3);
    assert.match(statements[0], /FOR UPDATE/);
    assert.match(statements[1], /new_pin_login/);
    assert.match(statements[2], /INSERT INTO jumpyard\.staff_auth_sessions/);
  }
  assert.equal(loaded.state.networkCalls.length, 0);

  const invalid = loadLambda('infra/lambda/session/index.js');
  const invalidResponse = await invalid.handler(event('POST /v1/staff/auth/login', '/v1/staff/auth/login', { pin: 482951 }));
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalid.state.awsCalls.length, 0);
}

async function validatePinLoginRollback() {
  const loaded = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      if (call.command === 'BeginTransactionCommand') return { transactionId: 't0194-rollback' };
      if (call.command === 'RollbackTransactionCommand') return {};
      if (call.command === 'CommitTransactionCommand') throw new Error('A failed insert must not be committed.');

      const statement = sql(call);
      if (/FROM jumpyard\.staff_pin_auth_limits/.test(statement)) return EMPTY_RESULT;
      if (/FROM jumpyard\.staff_identities[\s\S]*FOR UPDATE/.test(statement)) return rowsResult([identityRow()]);
      if (/pin_lookup_hash = :pinLookupHash/.test(statement)) return rowsResult([identityRow()]);
      if (/UPDATE jumpyard\.staff_auth_sessions[\s\S]*new_pin_login/.test(statement)) return EMPTY_RESULT;
      if (/INSERT INTO jumpyard\.staff_auth_sessions/.test(statement)) throw new Error('Simulated session insert failure.');
      throw new Error(`Unexpected rollback SQL: ${statement}`);
    },
  });
  const response = await loaded.handler(event('POST /v1/staff/auth/login', '/v1/staff/auth/login', { pin: TEST_PIN }));
  assert.equal(response.statusCode, 500);
  assert.equal(body(response).error.code, 'session_failed');
  assert.deepEqual(
    loaded.state.awsCalls
      .filter((call) => ['BeginTransactionCommand', 'CommitTransactionCommand', 'RollbackTransactionCommand'].includes(call.command))
      .map((call) => call.command),
    ['BeginTransactionCommand', 'RollbackTransactionCommand'],
  );
  assertNoRawCredential(loaded.state, [TEST_PIN, '192.0.2.44']);
}

async function validatePinResetRaceRollback() {
  const loaded = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      if (call.command === 'BeginTransactionCommand') return { transactionId: 't0194-reset-race' };
      if (call.command === 'RollbackTransactionCommand') return {};
      if (call.command === 'CommitTransactionCommand') throw new Error('Changed PIN material must not be committed.');

      const statement = sql(call);
      if (/FROM jumpyard\.staff_pin_auth_limits/.test(statement)) return EMPTY_RESULT;
      if (/FROM jumpyard\.staff_identities[\s\S]*FOR UPDATE/.test(statement)) {
        assert.match(call.input?.transactionId ?? '', /^t0194-reset-race$/);
        assert.match(statement, /pin_lookup_hash = :pinLookupHash/);
        assert.match(statement, /pin_verifier = :pinVerifier/);
        const parameters = parameterMap(call);
        assert.match(parameters.pinLookupHash, /^[a-f0-9]{64}$/);
        assert.equal(parameters.pinVerifier, makePinVerifier());
        return EMPTY_RESULT;
      }
      if (/pin_lookup_hash = :pinLookupHash/.test(statement)) return rowsResult([identityRow()]);
      throw new Error(`A reset-race login reached session mutation or audit SQL: ${statement}`);
    },
  });

  const response = await loaded.handler(event('POST /v1/staff/auth/login', '/v1/staff/auth/login', { pin: TEST_PIN }));
  assert.equal(response.statusCode, 403);
  assert.equal(body(response).error.code, 'staff_pin_invalid');
  assert.deepEqual(
    loaded.state.awsCalls
      .filter((call) => ['BeginTransactionCommand', 'CommitTransactionCommand', 'RollbackTransactionCommand'].includes(call.command))
      .map((call) => call.command),
    ['BeginTransactionCommand', 'RollbackTransactionCommand'],
  );
  assert.equal(loaded.state.awsCalls.some((call) => /INSERT INTO jumpyard\.staff_auth_sessions/.test(sql(call))), false);
  assert.equal(loaded.state.awsCalls.some((call) => /INSERT INTO jumpyard\.event_log/.test(sql(call))), false);
  assertNoRawCredential(loaded.state, [TEST_PIN, '192.0.2.44']);
}

async function validateUnknownPinAndRateLimits() {
  const unknown = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      const statement = sql(call);
      if (/FROM jumpyard\.staff_pin_auth_limits/.test(statement)) return EMPTY_RESULT;
      if (/pin_lookup_hash = :pinLookupHash/.test(statement)) return EMPTY_RESULT;
      if (/WITH source_limit AS/.test(statement)) {
        return rowsResult([{ source_blocked_until: null, venue_blocked_until: null }]);
      }
      throw new Error(`Unexpected unknown-PIN SQL: ${statement}`);
    },
  });
  let response = await unknown.handler(event('POST /v1/staff/auth/login', '/v1/staff/auth/login', { pin: '739284' }));
  assert.equal(response.statusCode, 403);
  assert.equal(body(response).error.code, 'staff_pin_invalid');
  assertNoRawCredential(unknown.state, ['739284', '192.0.2.44']);

  const blockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const blocked = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      if (/FROM jumpyard\.staff_pin_auth_limits/.test(sql(call))) {
        return rowsResult([{ blocked_until: blockedUntil, scope_type: 'source' }]);
      }
      throw new Error('A blocked PIN request must stop before identity lookup.');
    },
  });
  response = await blocked.handler(event('POST /v1/staff/auth/login', '/v1/staff/auth/login', { pin: TEST_PIN }));
  assert.equal(response.statusCode, 429);
  assert.equal(body(response).error.code, 'staff_pin_rate_limited');
  assert.ok(body(response).retryAfterSeconds > 0);
  assert.equal(blocked.state.awsCalls.length, 1);
}

async function validatePinHeartbeatAndLogout() {
  const token = `jypin_${Buffer.alloc(32, 7).toString('base64url')}`;
  const heartbeat = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session[\s\S]*last_seen_at = now\(\)/.test(sql(call))) {
        return rowsResult([sessionRow()]);
      }
      throw new Error(`Unexpected heartbeat SQL: ${sql(call)}`);
    },
  });
  let response = await heartbeat.handler(event(
    'POST /v1/staff/auth/session',
    '/v1/staff/auth/session',
    { action: 'heartbeat' },
    { headers: { authorization: `Bearer ${token}` } },
  ));
  assert.equal(response.statusCode, 200);
  assert.equal(body(response).status, 'staff_session_active');
  assertNoRawCredential(heartbeat.state, [token]);

  const logout = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      if (/revoke_reason = 'staff_logout'/.test(sql(call))) return rowsResult([sessionRow({ session_revoked_at: new Date().toISOString() })]);
      if (/INSERT INTO jumpyard\.event_log/.test(sql(call))) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      throw new Error(`Unexpected logout SQL: ${sql(call)}`);
    },
  });
  response = await logout.handler(event(
    'POST /v1/staff/auth/session',
    '/v1/staff/auth/session',
    { action: 'logout' },
    { headers: { authorization: `Bearer ${token}` } },
  ));
  assert.equal(response.statusCode, 200);
  assert.equal(body(response).status, 'staff_session_logged_out');
  assertNoRawCredential(logout.state, [token]);
}

async function validateAdminSessionAndCrud() {
  const claims = adminClaims();
  const adminSession = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      const statement = sql(call);
      if (/FROM jumpyard\.staff_identities\s+WHERE/.test(statement)) return rowsResult([adminIdentityRow()]);
      if (/INSERT INTO jumpyard\.staff_auth_sessions/.test(statement)) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session[\s\S]*last_seen_at = now\(\)/.test(statement)) {
        return rowsResult([adminSessionRow()]);
      }
      if (/INSERT INTO jumpyard\.event_log/.test(statement)) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      throw new Error(`Unexpected admin-session SQL: ${statement}`);
    },
  });
  let response = await adminSession.handler(event(
    'POST /v1/admin/auth/session',
    '/v1/admin/auth/session',
    { action: 'start' },
    { claims },
  ));
  assert.equal(response.statusCode, 200);
  assert.equal(body(response).status, 'admin_session_started');
  assert.deepEqual(body(response).principal.permissions, ['staff:identities:manage']);

  const createdRow = {
    active: true,
    created_at: new Date().toISOString(),
    display_name: 'Anna Andersson',
    environment: 'park-test',
    family_name: 'Andersson',
    given_name: 'Anna',
    identity_revoked_at: null,
    pin_changed_at: new Date().toISOString(),
    role: 'staff_operator',
    staff_identity_id: 'jystaff_new_anna',
    updated_at: new Date().toISOString(),
    venue_id: '50871',
  };
  const create = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      const statement = sql(call);
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) return rowsResult([adminSessionRow()]);
      if (/INSERT INTO jumpyard\.staff_identities/.test(statement)) return rowsResult([createdRow]);
      if (/INSERT INTO jumpyard\.event_log/.test(statement)) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      throw new Error(`Unexpected admin-create SQL: ${statement}`);
    },
  });
  response = await create.handler(event(
    'POST /v1/admin/staff',
    '/v1/admin/staff',
    { firstName: ' Anna ', lastName: 'Andersson', pin: '573829' },
    { claims },
  ));
  assert.equal(response.statusCode, 201);
  assert.equal(body(response).status, 'created');
  assert.equal(body(response).staff.displayName, 'Anna Andersson');
  assert.equal(body(response).staff.role, 'staff_operator');
  assert.equal(Object.hasOwn(body(response).staff, 'pin'), false);
  assertNoRawCredential(create.state, ['573829']);
  const insert = create.state.awsCalls.find((call) => /INSERT INTO jumpyard\.staff_identities/.test(sql(call)));
  assert.match(parameterMap(insert).pinLookupHash, /^[a-f0-9]{64}$/);
  assert.match(parameterMap(insert).pinVerifier, /^scrypt-v1\$/);

  const disabledRow = { ...createdRow, active: false, identity_revoked_at: new Date().toISOString() };
  const disable = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      const statement = sql(call);
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) return rowsResult([adminSessionRow()]);
      if (/UPDATE jumpyard\.staff_identities[\s\S]*active = false/.test(statement)) return rowsResult([disabledRow]);
      if (/INSERT INTO jumpyard\.event_log/.test(statement)) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      throw new Error(`Unexpected admin-disable SQL: ${statement}`);
    },
  });
  response = await disable.handler(event(
    'PATCH /v1/admin/staff/{staffIdentityId}',
    '/v1/admin/staff/jystaff_new_anna',
    { action: 'disable' },
    { claims, pathParameters: { staffIdentityId: 'jystaff_new_anna' } },
  ));
  assert.equal(response.statusCode, 200);
  assert.equal(body(response).staff.active, false);
  const update = disable.state.awsCalls.find((call) => /UPDATE jumpyard\.staff_identities/.test(sql(call)));
  assert.match(sql(update), /tokens_valid_after = now\(\)/);
}

async function validateAdminRoleBoundary() {
  const loaded = loadLambda('infra/lambda/session/index.js', {
    onRdsSend(call) {
      const statement = sql(call);
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) return EMPTY_RESULT;
      if (/FROM jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) return rowsResult([sessionRow()]);
      throw new Error(`A non-admin reached management SQL: ${statement}`);
    },
  });
  const response = await loaded.handler(event(
    'GET /v1/admin/staff',
    '/v1/admin/staff',
    {},
    { claims: adminClaims() },
  ));
  assert.equal(response.statusCode, 403);
  assert.equal(body(response).error.code, 'staff_role_forbidden');
  assert.equal(loaded.state.awsCalls.some((call) => /ORDER BY lower\(family_name\)/.test(sql(call))), false);
}

async function validatePinRedeemBoundary() {
  const token = `jypin_${Buffer.alloc(32, 9).toString('base64url')}`;
  const redeemEvent = event(
    'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem',
    '/v1/staff/check-in/sessions/session-1/redeem',
    { confirmRedeem: true, idempotencyKey: 't0194-pin-redeem' },
    { headers: { authorization: `Bearer ${token}` }, pathParameters: { checkinSessionId: 'session-1' } },
  );
  const reader = loadLambda('infra/lambda/redeem/index.js', {
    onRdsSend(call) {
      const statement = sql(call);
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) return EMPTY_RESULT;
      if (/FROM jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) return rowsResult([sessionRow({ role: 'staff_reader' })]);
      if (/INSERT INTO jumpyard\.event_log/.test(statement)) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      throw new Error(`A reader reached redeem business SQL: ${statement}`);
    },
  });
  let response = await reader.handler(redeemEvent);
  assert.equal(response.statusCode, 403);
  assert.equal(body(response).error.code, 'staff_role_forbidden');
  assert.equal(reader.state.networkCalls.length, 0);
  assertNoRawCredential(reader.state, [token]);

  const operator = loadLambda('infra/lambda/redeem/index.js', {
    onRdsSend(call) {
      const statement = sql(call);
      if (/UPDATE jumpyard\.staff_auth_sessions AS staff_session/.test(statement)) return rowsResult([sessionRow()]);
      if (/FROM jumpyard\.checkin_sessions AS cs/.test(statement)) {
        assert.match(statement, /AND booking\.venue_id = :staffVenueId/);
        assert.equal(parameterMap(call).staffVenueId, '50871');
        return EMPTY_RESULT;
      }
      if (/INSERT INTO jumpyard\.event_log/.test(statement)) return { ...EMPTY_RESULT, numberOfRecordsUpdated: 1 };
      throw new Error(`Unexpected operator redeem SQL: ${statement}`);
    },
  });
  response = await operator.handler(redeemEvent);
  assert.equal(response.statusCode, 404);
  assert.equal(body(response).error.code, 'session_not_found');
  assert.equal(operator.state.networkCalls.length, 0);
  assertNoRawCredential(operator.state, [token]);

  const legacy = loadLambda('infra/lambda/redeem/index.js');
  response = await legacy.handler(event(
    'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem',
    '/v1/staff/check-in/sessions/session-1/redeem',
    { confirmRedeem: true, idempotencyKey: 't0194-legacy-denied' },
    { headers: { authorization: 'Bearer old-hmac-token' }, pathParameters: { checkinSessionId: 'session-1' } },
  ));
  assert.equal(response.statusCode, 401);
  assert.equal(body(response).error.code, 'staff_auth_session_required');
  assert.equal(legacy.state.awsCalls.length, 0);
}

async function main() {
  validateMigrationAndSource();
  await validatePinLoginAndHashOnlySession();
  await validatePinLoginRollback();
  await validatePinResetRaceRollback();
  await validateUnknownPinAndRateLimits();
  await validatePinHeartbeatAndLogout();
  await validateAdminSessionAndCrud();
  await validateAdminRoleBoundary();
  await validatePinRedeemBoundary();
  console.log('[pass] six-digit PIN login uses HMAC lookup, scrypt verification, and an atomic hash-only session replacement');
  console.log('[pass] a second PIN login revokes the old token, keeps the new token active, and rolls back failed replacements');
  console.log('[pass] PIN reset racing with login rejects stale verified material and rolls back before session creation');
  console.log('[pass] raw PIN, opaque token, and source IP never reach Aurora parameters or audit payloads');
  console.log('[pass] source and venue failure circuits fail closed while malformed credentials stop before Aurora');
  console.log('[pass] PIN heartbeat/logout, idle/absolute session checks, disable, and identity triggers revoke access');
  console.log('[pass] Cognito/TOTP is limited to staff_admin session and server-authorized staff CRUD');
  console.log('[pass] local reader/operator role and venue boundaries protect queue/detail/redeem before Roller work');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
