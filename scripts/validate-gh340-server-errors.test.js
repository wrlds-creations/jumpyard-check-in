'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto');
const { createServerDiagnostics } = require('../infra/lambda/lookup/server-diagnostics');

const ROOT = path.resolve(__dirname, '..');
const CANARY = 'DO_NOT_LOG_guest@example.invalid_PIN_123456_JWT_secret';
const CORRELATION = 'caller-secret-123456';
const CONTEXT = { awsRequestId: 'a1b2c3d4-1234-1234-1234-a1b2c3d4e5f6' };
const event = (body, route = 'POST /v1/bookings/lookup', requestId = 'syntheticRequest01=') => ({
  body: JSON.stringify({ correlationId: CORRELATION, ...body }),
  routeKey: route,
  rawPath: route.slice(5),
  requestContext: { requestId, http: { method: 'POST' } },
  headers: { authorization: CANARY, 'x-correlation-id': CORRELATION },
});
const response = (status, body = {}) => ({
  ok: status >= 200 && status < 300, status,
  text: async () => JSON.stringify(body), json: async () => body,
});

function load(name, options = {}) {
  const file = path.join(ROOT, `infra/lambda/${name}/index.js`);
  const logs = [];
  const calls = { aws: 0, provider: 0 };
  const module = { exports: {} };
  const aws = new Proxy({}, { get: (_target, key) => class {
    constructor(input) { this.input = input; }
    async send(command) {
      calls.aws++;
      if (String(key) !== 'RDSDataClient') throw new Error(`Unexpected AWS service in test: ${key}`);
      return options.database ? options.database(command) : { records: [], columnMetadata: [] };
    }
  } });
  const sandbox = vm.createContext({
    module, exports: module.exports, Buffer, TextEncoder, TextDecoder, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout,
    console: Object.fromEntries(['log', 'warn', 'error'].map((level) => [level, (line) => logs.push(JSON.parse(line))])),
    process: { env: {
      JUMPYARD_ENVIRONMENT: 'dev', JUMPYARD_EMERGENCY_STOP: 'false',
      DATABASE_CLUSTER_ARN: 'synthetic-cluster', DATABASE_SECRET_ARN: 'synthetic-secret',
      REDEEM_DEV_TOKEN: CANARY, ...options.env,
    } },
    fetch: async (...args) => {
      calls.provider++;
      if (!options.fetch) throw new Error('Unexpected network request in isolated test');
      return options.fetch(...args);
    },
    require(id) {
      if (id.startsWith('@aws-sdk/')) return aws;
      if (id === 'crypto') return crypto;
      if (id.startsWith('./')) return require(path.join(path.dirname(file), id));
      throw new Error(`Unexpected import in test: ${id}`);
    },
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  vm.runInContext(`
    cachedRollerConfig = { env: 'playground', baseUrl: 'https://synthetic.invalid', clientId: 'synthetic', clientSecret: 'synthetic' };
    cachedRollerConfigExpiresAt = Date.now() + 60000;
    cachedToken = { accessToken: 'synthetic', tokenType: 'Bearer', expiresAt: Date.now() + 60000 };
  `, sandbox);
  if (name === 'lookup' || name === 'redeem') vm.runInContext(`
    getProductCatalogBestEffort = async () => ({ status: 'available', byId: new Map() });
  `, sandbox);
  return { calls, logs, handler: module.exports.handler, run: (code) => vm.runInContext(code, sandbox) };
}

function failure(logs) {
  const failures = logs.filter((entry) => entry.eventType === 'cloud.server_error');
  assert.equal(failures.length, 1, 'one server-error report per failed invocation');
  const output = JSON.stringify(logs);
  for (const forbidden of [CANARY, CORRELATION, 'customerPayload', 'SQL_SECRET', 'providerPayload']) {
    assert.ok(!output.includes(forbidden), `diagnostics leaked ${forbidden}`);
  }
  assert.equal(failures[0].correlationIdHash, crypto.createHash('sha256').update(CORRELATION).digest('hex'));
  assert.equal(failures[0].requestId, 'syntheticRequest01=');
  assert.equal(failures[0].lambdaRequestId, CONTEXT.awsRequestId);
  return failures[0];
}

test('all three standalone Lambda artifacts package identical diagnostics', () => {
  const original = fs.readFileSync(path.join(ROOT, 'infra/lambda/lookup/server-diagnostics.js'));
  for (const name of ['booking', 'redeem']) {
    assert.deepEqual(fs.readFileSync(path.join(ROOT, `infra/lambda/${name}/server-diagnostics.js`)), original);
  }
});

for (const name of ['lookup', 'booking', 'redeem']) {
  test(`${name}: actual handler records database failure and omits hostile error properties`, async () => {
    const app = load(name, { database: async () => {
      const error = new Error(CANARY);
      Object.assign(error, { name: 'DatabaseErrorException', code: CANARY, stack: CANARY, detail: CANARY });
      throw error;
    }, fetch: async () => response(503, { customerPayload: CANARY }) });
    const body = name === 'booking' ? { items: [{ productId: 1, quantity: 1, bookingDate: '2026-09-07', startTime: '10:00' }] }
      : { identifier: '12345', idempotencyKey: 'synthetic-key' };
    const request = event(body, name === 'booking' ? 'POST /v1/bookings/quote' : 'POST /v1/bookings/lookup');
    if (name === 'redeem') request.headers['x-jumpyard-redeem-token'] = CANARY;
    const result = await app.handler(request, CONTEXT);
    assert.equal(result.statusCode, 500);
    const entry = failure(app.logs);
    assert.equal(entry.stage, 'database');
    assert.equal(entry.failureCategory, 'database');
    assert.equal(entry.failureClass, 'DatabaseErrorException');
    assert.equal(entry.handler, name);
    assert.equal(app.calls.aws, 1);
  });

  test(`${name}: invalid JSON remains 400 with no server-error report or external call`, async () => {
    const app = load(name);
    const result = await app.handler({ ...event({}), body: '{' + CANARY }, CONTEXT);
    assert.equal(result.statusCode, 400);
    assert.deepEqual(app.logs, []);
    assert.deepEqual(app.calls, { aws: 0, provider: 0 });
  });
}

for (const status of [429, 500, 503]) {
  test(`lookup: returned provider ${status} maps to one diagnostic for the existing 502`, async () => {
    const app = load('lookup', { fetch: async () => response(status, { providerPayload: CANARY }) });
    const result = await app.handler(event({ identifier: '12345' }), CONTEXT);
    assert.equal(result.statusCode, 502);
    const entry = failure(app.logs);
    assert.equal(entry.failureCategory, 'provider');
    assert.equal(entry.stage, 'get_booking_detail');
    assert.equal(entry.providerStatusCode, status);
    const metric = app.logs.find((entry) => entry.RollerApiCallCount === 1);
    assert.equal(metric.RollerApiErrorCount, 1);
    assert.equal(metric.requestId, entry.requestId);
    assert.equal(metric.diagnosticId, entry.diagnosticId);
    assert.ok(metric._aws.CloudWatchMetrics.every((item) => !JSON.stringify(item.Dimensions).includes('requestId')));
    assert.equal(app.calls.provider, 1);
  });
}

for (const phase of ['fetch', 'body', 'json']) {
  test(`lookup: ${phase} failure retains the provider step and request correlation`, async () => {
    const app = load('lookup', { fetch: async () => {
      if (phase === 'fetch') throw Object.assign(new Error(CANARY), { name: 'TimeoutError' });
      if (phase === 'body') return { ...response(200), text: async () => { throw Object.assign(new Error(CANARY), { name: 'AbortError' }); } };
      return { ...response(200), text: async () => '{' + CANARY };
    } });
    const result = await app.handler(event({ identifier: '12345' }), CONTEXT);
    assert.equal(result.statusCode, 500, 'diagnostics must preserve the original response classification');
    const entry = failure(app.logs);
    assert.equal(entry.stage, 'roller_booking_detail');
    assert.equal(entry.failureCategory, phase === 'json' ? 'invalid_response' : 'timeout');
    assert.equal(app.calls.provider, 1);
  });
}

test('lookup: missing booking stays 404; existing provider metric is unchanged', async () => {
  const app = load('lookup', { fetch: async () => response(404) });
  assert.equal((await app.handler(event({ identifier: '12345' }), CONTEXT)).statusCode, 404);
  assert.equal(app.logs.filter((entry) => entry.eventType === 'cloud.server_error').length, 0);
  assert.equal(app.logs.find((entry) => entry.RollerApiCallCount).RollerApiErrorCount, 1,
    'changing the old 404 metric is separate Project scope');
});

test('lookup: missing database configuration is identified without logging environment values', async () => {
  const app = load('lookup', { env: { DATABASE_CLUSTER_ARN: '' } });
  assert.equal((await app.handler(event({ identifier: '12345' }), CONTEXT)).statusCode, 500);
  const entry = failure(app.logs);
  assert.equal(entry.failureCategory, 'configuration');
  assert.equal(entry.stage, 'database');
  assert.equal(app.calls.aws, 0);
});

test('lookup: failed provider authentication has its own stage and safe numeric status', async () => {
  const app = load('lookup', { fetch: async () => response(401, { providerPayload: CANARY }) });
  app.run('cachedToken = null;');
  assert.equal((await app.handler(event({ identifier: '12345' }), CONTEXT)).statusCode, 502);
  const entry = failure(app.logs);
  assert.equal(entry.stage, 'roller_authentication');
  assert.equal(entry.failureCategory, 'provider');
  assert.equal(entry.providerStatusCode, 401);
  assert.equal(app.calls.provider, 1);
});

test('lookup: 40 overlapping real-handler requests keep failures attached to the right invocation', async () => {
  const app = load('lookup', { fetch: async (url) => {
    await Promise.resolve();
    const identifier = Number(new URL(url).pathname.split('/').pop());
    return response(identifier % 2 === 0 ? 503 : 404, { providerPayload: CANARY });
  } });
  const results = await Promise.all(Array.from({ length: 40 }, (_, index) =>
    app.handler(event({ identifier: String(10000 + index) }, undefined, `burstRequest${index}`), CONTEXT)));
  results.forEach((result, index) => assert.equal(result.statusCode, index % 2 === 0 ? 502 : 404));
  const errors = app.logs.filter((entry) => entry.eventType === 'cloud.server_error');
  assert.equal(errors.length, 20);
  assert.equal(new Set(errors.map((entry) => entry.diagnosticId)).size, 20);
  for (const entry of errors) {
    assert.equal(Number(entry.requestId.replace('burstRequest', '')) % 2, 0);
    assert.equal(entry.providerStatusCode, 503);
    assert.equal(entry.stage, 'get_booking_detail');
  }
  assert.deepEqual(app.calls, { aws: 40, provider: 40 });
});

test('booking: provider quote failure reports operation and preserves calls and response', async () => {
  const app = load('booking', { fetch: async () => response(503, { providerPayload: CANARY }) });
  const result = await app.handler(event({ items: [{ productId: 1, quantity: 1, bookingDate: '2026-09-07', startTime: '10:00' }] }, 'POST /v1/bookings/quote'), CONTEXT);
  assert.equal(result.statusCode, 502);
  const entry = failure(app.logs);
  assert.equal(entry.operation, 'quote');
  assert.equal(entry.stage, 'create_draft_costs');
  assert.equal(entry.failureCategory, 'provider');
  assert.deepEqual(app.calls, { aws: 1, provider: 1 });
});

test('booking: a successful quote adds no server-error report, request or delay', async () => {
  const app = load('booking', { fetch: async () => response(200, { total: 200 }) });
  const result = await app.handler(event({ items: [{ productId: 1, quantity: 1, bookingDate: '2026-09-07', startTime: '10:00' }] }, 'POST /v1/bookings/quote'), CONTEXT);
  assert.equal(result.statusCode, 200);
  assert.equal(app.logs.filter((entry) => entry.eventType === 'cloud.server_error').length, 0);
  assert.deepEqual(app.calls, { aws: 1, provider: 1 });
});

test('caught bookkeeping failure keeps its warning without raw error name/code or correlation', async () => {
  const app = load('redeem', { database: async () => {
    throw { name: CANARY, code: CANARY, message: CANARY, stack: CANARY };
  } });
  await app.run(`diagnostics.wrap(async () => {
    await recordRedeemBookkeeping({ booking: {}, correlationId: '${CORRELATION}', selectedTicketIds: [], payload: {} });
    return { statusCode: 200 };
  })({})`);
  assert.equal(app.logs.length, 1);
  assert.equal(app.logs[0].eventType, 'checkin.redeem_bookkeeping_failed');
  assert.equal(app.logs[0].failureClass, 'unknown');
  assert.ok(!JSON.stringify(app.logs).includes(CANARY));
  assert.ok(!JSON.stringify(app.logs).includes(CORRELATION));
});

test('nested staff redeem logs once even when the inner response is propagated', async () => {
  const logs = [];
  const d = createServerDiagnostics('redeem', (entry) => logs.push(entry));
  const inner = d.wrap(async () => {
    d.response(502, CORRELATION, { status: 'blocked', error: { code: 'roller_refresh_failed' } });
    return { statusCode: 502 };
  });
  const outer = d.wrap(d.step('staff_redeem', async () => inner(event({}), CONTEXT), 'staff_redeem'));
  await outer(event({}), CONTEXT);
  assert.equal(failure(logs).operation, 'staff_redeem');
  assert.equal(logs[0].failureCategory, 'provider');
});

test('parallel dependency failures preserve the actual thrown origin; warm invocations do not inherit it', async () => {
  const logs = [];
  const d = createServerDiagnostics('booking', (entry) => logs.push(entry));
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const database = d.step('database', async () => { await barrier; throw new Error(CANARY); });
  const provider = d.step('roller_read', async () => { d.provider({ operation: 'get_booking_detail', status: 404, ok: false }); });
  const operation = d.wrap(async () => {
    try { await Promise.all([database(), provider()]); }
    catch (error) { d.capture(error); }
    d.response(500, CORRELATION, { status: 'internal_error' });
    return { statusCode: 500 };
  });
  const pending = operation(event({}), CONTEXT);
  release();
  await pending;
  assert.equal(failure(logs).failureCategory, 'database');
  const result = { statusCode: 409, headers: { preserved: true }, body: 'unchanged' };
  assert.equal(await d.wrap(async () => result)(event({}), CONTEXT), result);
  assert.equal(logs.length, 1);
});

test('concurrent invocations keep separate identifiers and the logger cannot fail a business operation', async () => {
  const logs = [];
  const d = createServerDiagnostics('lookup', (entry) => logs.push(entry));
  const fn = d.wrap(async (e) => {
    await Promise.resolve();
    d.response(500, e.body, { status: 'internal_error' });
    return { statusCode: 500 };
  });
  await Promise.all(['requestAAA', 'requestBBB'].map((id) => fn(event({}, undefined, id), CONTEXT)));
  assert.deepEqual(logs.map((entry) => entry.requestId).sort(), ['requestAAA', 'requestBBB']);
  assert.equal(new Set(logs.map((entry) => entry.diagnosticId)).size, 2);
  const brokenLogger = createServerDiagnostics('redeem', () => { throw new Error('logger unavailable'); });
  const result = { statusCode: 502, body: 'original' };
  assert.equal(await brokenLogger.wrap(async () => result)(event({}), CONTEXT), result);
});
