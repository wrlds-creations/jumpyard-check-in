const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const handlerPath = path.join(__dirname, '..', 'infra', 'lambda', 'data-sync', 'index.js');
const handlerSource = fs.readFileSync(handlerPath, 'utf8');
const dataSources = ['/data/bookingitems', '/data/tickets', '/data/bookingpayments', '/data/customers'];
const product = { id: '970338', name: 'JumpSocks', parentProductId: '970337', price: 49 };

for (const failingSource of dataSources) {
  test(`product refresh survives an early ${failingSource} failure`, async () => {
    const harness = createHarness({ failingSource });
    await assert.rejects(harness.run, /failed with HTTP 400/);

    assert.equal(harness.requests.filter((request) => request.path === '/products').length, 1);
    const productCommit = harness.events.indexOf('commit:transaction-1');
    assert.ok(productCommit >= 0, 'the product transaction must already be committed');
    assert.ok(productCommit < harness.events.indexOf(`request:${failingSource}`));
    assert.equal(harness.events.some((event) => event.startsWith('rollback:')), false);
    const failedRun = harness.logs.find((entry) => entry.status === 'failed' && entry.productCache);
    assert.equal(failedRun.productCache.committed, true);
    assert.equal(failedRun.productCache.status, 'committed');
    assert.equal(failedRun.productCache.upserts, 1);
    assert.equal(harness.logs.find((entry) => 'BookingIndexSyncSuccess' in entry).BookingIndexSyncSuccess, 0);
  });
}

test('normal refresh keeps one product read, 24-hour prices and paced requests', async () => {
  const harness = createHarness();
  const result = await harness.run();

  assert.equal(result.status, 'succeeded');
  assert.equal(result.productCache.committed, true);
  assert.equal(harness.requests.filter((request) => request.path === '/products').length, 1);
  assert.deepEqual(harness.requests.map((request) => request.path), ['/token', '/products', ...dataSources]);
  for (let index = 1; index < harness.requests.length; index += 1) {
    assert.ok(harness.requests[index].at - harness.requests[index - 1].at >= 1000);
  }
  const productWrite = harness.statements.find((input) => /INSERT INTO jumpyard.product_catalog_cache/.test(input.sql));
  const parameters = Object.fromEntries(productWrite.parameters.map((parameter) => [parameter.name, parameter.value.stringValue]));
  assert.equal(JSON.parse(parameters.summary).priceCents, 4900);
  assert.ok(Math.abs(Date.parse(parameters.expiresAt) - Date.parse(parameters.fetchedAt) - 86_400_000) <= 10);
  assert.equal(harness.events.filter((event) => event.startsWith('commit:')).length, 2);
  assert.ok(harness.events.indexOf('commit:transaction-1') < harness.events.indexOf('request:/data/bookingitems'));
  assert.doesNotMatch(JSON.stringify(harness.logs), /synthetic-client-secret|synthetic-access-token/);
});

test('later booking transaction failure cannot roll back the refreshed product cache', async () => {
  const harness = createHarness({ failBookingWrite: true });
  await assert.rejects(harness.run, /simulated booking write failure/);

  assert.ok(harness.events.includes('commit:transaction-1'));
  assert.ok(harness.events.includes('rollback:transaction-2'));
  assert.equal(harness.events.includes('rollback:transaction-1'), false);
  assert.equal(harness.logs.find((entry) => entry.status === 'failed' && entry.productCache).productCache.committed, true);
});

test('product provider failure keeps bounded retries and explicit failed-refresh diagnosis', async () => {
  const harness = createHarness({ productStatus: 503 });
  await assert.rejects(harness.run, /Roller product read failed with HTTP 503/);

  assert.equal(harness.requests.filter((request) => request.path === '/products').length, 4);
  assert.equal(harness.requests.some((request) => dataSources.includes(request.path)), false);
  assert.equal(harness.events.some((event) => event.startsWith('commit:')), false);
  const failure = harness.logs.find((entry) => entry.event === 'product_cache_refresh_failed');
  assert.equal(failure.phase, 'fetch');
  assert.equal(failure.status, 'failed');
  assert.equal(harness.logs.find((entry) => entry.status === 'failed' && entry.productCache).productCache.committed, false);
});

test('product persistence failure rolls back only its transaction and reports its phase', async () => {
  const harness = createHarness({ failProductWrite: true });
  await assert.rejects(harness.run, /simulated product write failure/);

  assert.deepEqual(harness.events.filter((event) => /^(commit|rollback):/.test(event)), ['rollback:transaction-1']);
  assert.equal(harness.requests.some((request) => dataSources.includes(request.path)), false);
  assert.equal(harness.logs.find((entry) => entry.event === 'product_cache_refresh_failed').phase, 'persist');
});

test('empty product response neither renews cached prices nor hides the missing refresh', async () => {
  const harness = createHarness({ products: [] });
  const result = await harness.run();

  assert.equal(result.status, 'succeeded', 'preserve the existing booking-sync behavior for an empty catalog');
  assert.equal(result.productCache.status, 'empty');
  assert.equal(result.productCache.committed, false);
  assert.equal(harness.statements.some((input) => /INSERT INTO jumpyard.product_catalog_cache/.test(input.sql)), false);
  assert.equal(harness.logs.find((entry) => entry.event === 'product_cache_refresh_empty').status, 'empty');
});

test('explicit skipProducts does not fetch or renew the product cache', async () => {
  const harness = createHarness({ skipProducts: true });
  const result = await harness.run();

  assert.equal(result.productCache.status, 'skipped');
  assert.equal(harness.requests.some((request) => request.path === '/products'), false);
  assert.equal(harness.statements.some((input) => /INSERT INTO jumpyard.product_catalog_cache/.test(input.sql)), false);
});

function createHarness(options = {}) {
  const events = [];
  const requests = [];
  const statements = [];
  const logs = [];
  let clockMs = 10_000;
  let transactionCount = 0;
  class BeginTransactionCommand { constructor(input) { this.input = input; } }
  class CommitTransactionCommand { constructor(input) { this.input = input; } }
  class ExecuteStatementCommand { constructor(input) { this.input = input; } }
  class RollbackTransactionCommand { constructor(input) { this.input = input; } }
  class RDSDataClient {
    async send(command) {
      const input = command.input;
      if (command instanceof BeginTransactionCommand) return { transactionId: `transaction-${++transactionCount}` };
      if (command instanceof CommitTransactionCommand) { events.push(`commit:${input.transactionId}`); return {}; }
      if (command instanceof RollbackTransactionCommand) { events.push(`rollback:${input.transactionId}`); return {}; }
      assert.ok(command instanceof ExecuteStatementCommand, 'unexpected AWS operation');
      statements.push(input);
      if (options.failProductWrite && /INSERT INTO jumpyard.product_catalog_cache/.test(input.sql)) {
        throw new Error('simulated product write failure');
      }
      if (options.failBookingWrite && /UPDATE jumpyard.roller_booking_items AS item/.test(input.sql)) {
        throw new Error('simulated booking write failure');
      }
      return { records: [], columnMetadata: [], numberOfRecordsUpdated: 1 };
    }
  }
  class GetSecretValueCommand { constructor(input) { this.input = input; } }
  class SecretsManagerClient {
    async send() { return { SecretString: JSON.stringify({ clientId: 'synthetic-client', clientSecret: 'synthetic-client-secret' }) }; }
  }
  class GetParameterCommand { constructor(input) { this.input = input; } }
  class SSMClient {
    async send(command) {
      return { Parameter: { Value: command.input.Name === 'test-env' ? 'playground' : 'https://api.play.roller.app' } };
    }
  }
  const modules = {
    '@aws-sdk/client-rds-data': { BeginTransactionCommand, CommitTransactionCommand, ExecuteStatementCommand, RDSDataClient, RollbackTransactionCommand },
    '@aws-sdk/client-secrets-manager': { GetSecretValueCommand, SecretsManagerClient },
    '@aws-sdk/client-ssm': { GetParameterCommand, SSMClient },
  };
  const capture = (message) => logs.push(JSON.parse(message));
  const sandbox = {
    exports: {},
    URL,
    setTimeout: () => { throw new Error('Unexpected real timer'); },
    require: (name) => {
      if (name === 'crypto') return require('node:crypto');
      assert.ok(modules[name], `Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: { info: capture, error: capture, log: capture, warn: capture },
    process: { env: {
      DATABASE_CLUSTER_ARN: 'synthetic-cluster', DATABASE_SECRET_ARN: 'synthetic-database-secret',
      ROLLER_CREDENTIALS_SECRET_ARN: 'synthetic-roller-secret', ROLLER_ENV_PARAMETER_NAME: 'test-env',
      ROLLER_BASE_URL_PARAMETER_NAME: 'test-base-url', ROLLER_DATA_SYNC_VENUE_ID: '50871',
      JUMPYARD_ENVIRONMENT: 'dev', RESOURCE_PREFIX: 'test',
    } },
  };
  vm.runInNewContext(handlerSource, sandbox, { filename: handlerPath });
  sandbox.exports.__test.setHooks({
    now: () => clockMs,
    sleep: async (milliseconds) => { clockMs += milliseconds; },
    fetch: async (url) => {
      const endpoint = new URL(url).pathname;
      requests.push({ path: endpoint, at: clockMs });
      events.push(`request:${endpoint}`);
      if (endpoint === '/token') return response(200, { access_token: 'synthetic-access-token' });
      if (endpoint === '/products') return response(options.productStatus || 200, options.products || [product]);
      assert.ok(dataSources.includes(endpoint), `Unexpected HTTP endpoint: ${endpoint}`);
      if (endpoint === options.failingSource) return response(400, {});
      return response(200, { items: [], totalItems: 0, totalPages: 1 });
    },
  });
  return {
    events, requests, statements, logs,
    run: () => sandbox.exports.handler({ startDate: '2026-09-03', endDate: '2026-09-04', skipProducts: options.skipProducts }),
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}
