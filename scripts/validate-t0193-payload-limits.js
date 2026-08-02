const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

const CASES = [
  {
    name: 'lookup',
    relativePath: 'infra/lambda/lookup/index.js',
    maxBytes: 8 * 1024,
    event(body, isBase64Encoded) {
      return httpEvent('POST /v1/check-in/lookup', '/v1/check-in/lookup', body, isBase64Encoded);
    },
  },
  {
    name: 'booking',
    relativePath: 'infra/lambda/booking/index.js',
    maxBytes: 64 * 1024,
    event(body, isBase64Encoded) {
      return httpEvent('POST /v1/bookings/quote', '/v1/bookings/quote', body, isBase64Encoded);
    },
  },
  {
    name: 'session',
    relativePath: 'infra/lambda/session/index.js',
    maxBytes: 32 * 1024,
    event(body, isBase64Encoded) {
      return httpEvent('POST /v1/check-in/sessions', '/v1/check-in/sessions', body, isBase64Encoded);
    },
  },
  {
    name: 'redeem',
    relativePath: 'infra/lambda/redeem/index.js',
    maxBytes: 32 * 1024,
    event(body, isBase64Encoded) {
      return httpEvent('POST /v1/check-in/redeem', '/v1/check-in/redeem', body, isBase64Encoded);
    },
  },
  {
    name: 'staff redeem',
    relativePath: 'infra/lambda/redeem/index.js',
    maxBytes: 32 * 1024,
    environment: { JUMPYARD_EMERGENCY_STOP: 'false' },
    event(body, isBase64Encoded) {
      return {
        ...httpEvent(
          'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem',
          '/v1/staff/check-in/sessions/session-1/redeem',
          body,
          isBase64Encoded,
        ),
        pathParameters: { checkinSessionId: 'session-1' },
      };
    },
  },
  {
    name: 'webhook',
    relativePath: 'infra/lambda/webhook/index.js',
    maxBytes: 256 * 1024,
    webhook: true,
    event(body, isBase64Encoded) {
      return httpEvent(
        'POST /v1/roller/webhooks/bookings',
        '/v1/roller/webhooks/bookings',
        body,
        isBase64Encoded,
      );
    },
  },
];

function httpEvent(routeKey, rawPath, body, isBase64Encoded) {
  return {
    body,
    headers: { 'x-correlation-id': 't0193-payload-validation' },
    isBase64Encoded,
    rawPath,
    requestContext: { http: { method: 'POST', path: rawPath } },
    routeKey,
  };
}

function fakeAwsModule(moduleId, state) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return class FakeAwsClientOrCommand {
          constructor(input) {
            this.input = input;
          }

          async send(command) {
            state.awsCalls.push({
              command: command?.input ?? null,
              moduleId,
              property: String(property),
            });
            throw new Error(`Unexpected AWS call through ${moduleId}:${String(property)}.`);
          }
        };
      },
    },
  );
}

function loadLambda(testCase) {
  const absolutePath = path.join(ROOT, testCase.relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const state = { awsCalls: [], networkCalls: [] };
  const module = { exports: {} };
  const sandbox = {
    AbortController,
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async (...args) => {
      state.networkCalls.push(args);
      throw new Error(`Unexpected network call in ${testCase.relativePath}.`);
    },
    module,
    exports: module.exports,
    process: { env: { ...(testCase.environment ?? {}) } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule(moduleId, state);
      if (testCase.relativePath === 'infra/lambda/session/index.js' && moduleId === './email-template') {
        return require(path.join(path.dirname(absolutePath), 'email-template.js'));
      }
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) in ${testCase.relativePath}.`);
    },
    setTimeout,
  };

  vm.runInNewContext(source, sandbox, { filename: absolutePath });

  assert.equal(typeof module.exports.handler, 'function', `${testCase.name} must export a Lambda handler.`);
  return { handler: module.exports.handler, state };
}

function oversizedJson(maxBytes) {
  const body = JSON.stringify({ padding: 'x'.repeat(maxBytes) });
  assert.ok(Buffer.byteLength(body, 'utf8') > maxBytes, 'Fixture must exceed the configured byte ceiling.');
  return body;
}

function parseResponseBody(response, label) {
  assert.equal(typeof response?.body, 'string', `${label} must return a JSON response body.`);
  return JSON.parse(response.body);
}

function assertNoSideEffects(testCase, state) {
  assert.deepEqual(state.awsCalls, [], `${testCase.name} must reject oversized payloads before AWS side effects.`);
  assert.deepEqual(
    state.networkCalls,
    [],
    `${testCase.name} must reject oversized payloads before network side effects.`,
  );
}

async function validateCase(testCase) {
  const loaded = loadLambda(testCase);
  const plainBody = oversizedJson(testCase.maxBytes);
  const encodings = [
    { name: 'plain', body: plainBody, isBase64Encoded: false },
    { name: 'base64', body: Buffer.from(plainBody, 'utf8').toString('base64'), isBase64Encoded: true },
  ];

  for (const encoding of encodings) {
    const label = `${testCase.name} ${encoding.name}`;
    const response = await loaded.handler(testCase.event(encoding.body, encoding.isBase64Encoded));
    const body = parseResponseBody(response, label);

    assert.equal(response.statusCode, testCase.webhook ? 200 : 413, `${label} returned an unsafe status code.`);
    assert.equal(body.status, 'invalid_request', `${label} must use the safe invalid-request envelope.`);
    assert.equal(body.error?.code, 'payload_too_large', `${label} must report the payload ceiling.`);
    if (testCase.webhook) {
      assert.match(body.error?.message ?? '', /ignored/i, `${label} must acknowledge and ignore invalid delivery.`);
    }

    assertNoSideEffects(testCase, loaded.state);
  }
}

async function main() {
  for (const testCase of CASES) {
    await validateCase(testCase);
  }

  console.log('[pass] T0193 enforces 8/64/32/32/256 KiB request-body ceilings across all five Lambdas');
  console.log('[pass] legacy and staff redeem entry points share the decoded 32 KiB request-body ceiling');
  console.log('[pass] plain and base64 oversized payloads fail safely before AWS or network side effects');
  console.log('[pass] webhook invalid delivery is acknowledged with HTTP 200 while other APIs return HTTP 413');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
