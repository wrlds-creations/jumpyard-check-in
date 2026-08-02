const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const EMPTY_RESULT = { columnMetadata: [], records: [] };
const IAM_ROUTES = [
  'POST /v1/check-in/session-links',
  'POST /v1/check-in/session-links/send-sms',
  'POST /v1/check-in/session-links/send-email',
  'POST /v1/check-in/session-links/send-due-sms',
  'POST /v1/check-in/session-links/send-due-messages',
  'POST /v1/check-in/redeem',
];

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

            if (property === 'RDSDataClient') {
              return state.onRdsSend(call);
            }

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
    consoleCalls: [],
    networkCalls: [],
    onRdsSend: options.onRdsSend ?? (() => EMPTY_RESULT),
  };
  const module = { exports: {} };
  const primeStaffAuth = options.primeStaffAuth
    ? `
module.exports.__t0193ServiceAuth = {
  primeStaffAuthConfig(config) {
    cachedStaffAuthConfig = config;
    cachedStaffAuthConfigExpiresAt = Date.now() + 60 * 60 * 1000;
  },
};`
    : '';
  const quietConsole = Object.fromEntries(
    ['error', 'info', 'log', 'warn'].map((level) => [
      level,
      (...args) => state.consoleCalls.push({ args, level }),
    ]),
  );
  const sandbox = {
    AbortController,
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console: quietConsole,
    exports: module.exports,
    fetch: async (...args) => {
      state.networkCalls.push(args);
      throw new Error(`Unexpected network call in ${relativePath}.`);
    },
    module,
    process: { env: { ...(options.environment ?? {}) } },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule(moduleId, state);
      if (relativePath === 'infra/lambda/session/index.js' && moduleId === './email-template') {
        return require(path.join(path.dirname(absolutePath), 'email-template.js'));
      }
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) in ${relativePath}.`);
    },
    setTimeout,
  };

  vm.runInNewContext(`${source}\n${primeStaffAuth}`, sandbox, { filename: absolutePath });
  assert.equal(typeof module.exports.handler, 'function', `${relativePath} must export a handler.`);

  return {
    handler: module.exports.handler,
    internals: module.exports.__t0193ServiceAuth ?? {},
    state,
  };
}

function httpEvent(routeKey, rawPath, body = {}, headers = {}) {
  const method = routeKey.split(' ', 1)[0];
  return {
    body: JSON.stringify(body),
    headers,
    pathParameters: rawPath.includes('/sessions/session-1') ? { checkinSessionId: 'session-1' } : undefined,
    rawPath,
    requestContext: { http: { method, path: rawPath } },
    routeKey,
  };
}

function parsedBody(response) {
  assert.equal(typeof response?.body, 'string');
  return JSON.parse(response.body);
}

function assertResponse(response, statusCode, code, label) {
  assert.equal(response.statusCode, statusCode, `${label} returned the wrong HTTP status.`);
  assert.equal(parsedBody(response).error?.code, code, `${label} returned the wrong safe error code.`);
}

function assertNoCalls(state, label) {
  assert.deepEqual(state.awsCalls, [], `${label} reached AWS before its trust boundary completed.`);
  assert.deepEqual(state.networkCalls, [], `${label} reached a provider or Roller before its trust boundary completed.`);
}

function primeStaffConfig(loaded, signingMaterial) {
  assert.equal(typeof loaded.internals.primeStaffAuthConfig, 'function');
  loaded.internals.primeStaffAuthConfig({
    displayName: 'T0193 Validator',
    passcode: crypto.randomBytes(24).toString('base64url'),
    signingSecret: signingMaterial,
    tokenTtlMinutes: 5,
  });
}

function staffToken(
  signingMaterial,
  signatureMaterial = signingMaterial,
  expiresAtSeconds = Math.floor(Date.now() / 1000) + 300,
) {
  const payload = Buffer.from(
    JSON.stringify({
      displayName: 'T0193 Validator',
      exp: expiresAtSeconds,
      iat: Math.floor(Date.now() / 1000),
      scope: 'staff',
      sub: 'jumpyard-staff',
      v: 1,
    }),
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', signatureMaterial).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

async function validateInternalSessionLinkRoutes() {
  const serviceToken = crypto.randomBytes(32).toString('base64url');
  const wrongToken = crypto.randomBytes(32).toString('base64url');
  const loaded = loadLambda('infra/lambda/session/index.js', {
    environment: {
      CHECKIN_LINK_DEV_TOKEN: serviceToken,
      JUMPYARD_EMERGENCY_STOP: 'false',
    },
  });
  const routes = [
    ['POST /v1/check-in/session-links', '/v1/check-in/session-links', 'identifier_required'],
    ['POST /v1/check-in/session-links/send-sms', '/v1/check-in/session-links/send-sms', 'identifier_required'],
    ['POST /v1/check-in/session-links/send-email', '/v1/check-in/session-links/send-email', 'identifier_required'],
    ['POST /v1/check-in/session-links/send-due-sms', '/v1/check-in/session-links/send-due-sms', 'base_url_invalid'],
    [
      'POST /v1/check-in/session-links/send-due-messages',
      '/v1/check-in/session-links/send-due-messages',
      'base_url_invalid',
    ],
  ];

  for (const [routeKey, rawPath, validCredentialCode] of routes) {
    const missing = await loaded.handler(httpEvent(routeKey, rawPath));
    assertResponse(missing, 401, 'checkin_link_token_required', `${routeKey} missing credential`);

    const wrong = await loaded.handler(
      httpEvent(routeKey, rawPath, {}, { 'x-jumpyard-link-token': wrongToken }),
    );
    assertResponse(wrong, 401, 'checkin_link_token_invalid', `${routeKey} wrong credential`);

    const accepted = await loaded.handler(
      httpEvent(routeKey, rawPath, {}, { 'x-jumpyard-link-token': serviceToken }),
    );
    assertResponse(accepted, 400, validCredentialCode, `${routeKey} accepted credential`);
  }

  assertNoCalls(loaded.state, 'Internal session-link routes');
}

async function validateLegacyRedeemRoute() {
  const serviceToken = crypto.randomBytes(32).toString('base64url');
  const wrongToken = crypto.randomBytes(32).toString('base64url');
  const loaded = loadLambda('infra/lambda/redeem/index.js', {
    environment: {
      DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:t0193-test',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:t0193-test',
      JUMPYARD_EMERGENCY_STOP: 'false',
      REDEEM_DEV_TOKEN: serviceToken,
    },
  });
  const routeKey = 'POST /v1/check-in/redeem';
  const rawPath = '/v1/check-in/redeem';
  const planOnlyBody = {
    confirmRedeem: false,
    idempotencyKey: 't0193-plan-only',
    identifier: 't0193-booking',
  };

  const missing = await loaded.handler(httpEvent(routeKey, rawPath, planOnlyBody));
  assertResponse(missing, 403, 'redeem_token_required', 'Legacy redeem missing credential');
  assertNoCalls(loaded.state, 'Legacy redeem missing credential');

  const wrong = await loaded.handler(
    httpEvent(routeKey, rawPath, planOnlyBody, { 'x-jumpyard-redeem-token': wrongToken }),
  );
  assertResponse(wrong, 403, 'redeem_token_invalid', 'Legacy redeem wrong credential');
  assertNoCalls(loaded.state, 'Legacy redeem wrong credential');

  const accepted = await loaded.handler(
    httpEvent(routeKey, rawPath, planOnlyBody, { 'x-jumpyard-redeem-token': serviceToken }),
  );
  assertResponse(accepted, 404, 'booking_not_found', 'Legacy redeem accepted credential');
  assert.equal(loaded.state.awsCalls.length, 1, 'Accepted legacy credential must reach one stubbed booking read.');
  assert.equal(loaded.state.awsCalls[0].client, 'RDSDataClient');
  assert.match(loaded.state.awsCalls[0].input?.sql ?? '', /FROM jumpyard\.roller_bookings/);
  assert.deepEqual(loaded.state.networkCalls, [], 'Legacy plan-only validation must not reach Roller.');
}

async function validateStaffSessionRoutes() {
  const signingMaterial = crypto.randomBytes(32).toString('base64url');
  const acceptedToken = staffToken(signingMaterial);
  const expiredToken = staffToken(signingMaterial, signingMaterial, Math.floor(Date.now() / 1000) - 1);
  const forgedToken = staffToken(signingMaterial, crypto.randomBytes(32).toString('base64url'));
  const loaded = loadLambda('infra/lambda/session/index.js', {
    environment: {
      DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:t0193-test',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:t0193-test',
      JUMPYARD_EMERGENCY_STOP: 'false',
    },
    primeStaffAuth: true,
  });
  primeStaffConfig(loaded, signingMaterial);
  const routes = [
    ['GET /v1/staff/check-in/sessions', '/v1/staff/check-in/sessions', 200, null],
    [
      'GET /v1/staff/check-in/sessions/{checkinSessionId}',
      '/v1/staff/check-in/sessions/session-1',
      404,
      'session_not_found',
    ],
  ];

  for (const [routeKey, rawPath] of routes) {
    const missing = await loaded.handler(httpEvent(routeKey, rawPath));
    assertResponse(missing, 403, 'staff_auth_token_required', `${routeKey} missing credential`);

    const forged = await loaded.handler(
      httpEvent(routeKey, rawPath, {}, { authorization: `Bearer ${forgedToken}` }),
    );
    assertResponse(forged, 403, 'staff_auth_token_invalid', `${routeKey} forged credential`);
  }

  const expired = await loaded.handler(
    httpEvent(routes[0][0], routes[0][1], {}, { authorization: `Bearer ${expiredToken}` }),
  );
  assertResponse(expired, 401, 'staff_auth_token_expired', 'Staff list expired credential');
  assertNoCalls(loaded.state, 'Staff list/detail rejected credentials');

  for (const [routeKey, rawPath, expectedStatus, expectedCode] of routes) {
    const accepted = await loaded.handler(
      httpEvent(routeKey, rawPath, {}, { authorization: `Bearer ${acceptedToken}` }),
    );
    assert.equal(accepted.statusCode, expectedStatus, `${routeKey} rejected a valid staff credential.`);
    if (expectedCode) assert.equal(parsedBody(accepted).error?.code, expectedCode);
  }

  assert.equal(loaded.state.awsCalls.length, 2, 'Valid staff list/detail credentials must reach only stubbed reads.');
  assert.equal(loaded.state.awsCalls.every((call) => call.client === 'RDSDataClient'), true);
  assert.deepEqual(loaded.state.networkCalls, [], 'Staff list/detail validation must not reach Roller.');
}

async function validateStaffRedeemRoute() {
  const signingMaterial = crypto.randomBytes(32).toString('base64url');
  const acceptedToken = staffToken(signingMaterial);
  const expiredToken = staffToken(signingMaterial, signingMaterial, Math.floor(Date.now() / 1000) - 1);
  const forgedToken = staffToken(signingMaterial, crypto.randomBytes(32).toString('base64url'));
  const loaded = loadLambda('infra/lambda/redeem/index.js', {
    environment: {
      DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:t0193-test',
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:t0193-test',
      JUMPYARD_EMERGENCY_STOP: 'false',
    },
    primeStaffAuth: true,
  });
  primeStaffConfig(loaded, signingMaterial);
  const routeKey = 'POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem';
  const rawPath = '/v1/staff/check-in/sessions/session-1/redeem';
  const body = {
    confirmRedeem: true,
    idempotencyKey: 't0193-staff-redeem',
  };

  const missing = await loaded.handler(httpEvent(routeKey, rawPath, body));
  assertResponse(missing, 403, 'staff_auth_token_required', 'Staff redeem missing credential');

  const forged = await loaded.handler(
    httpEvent(routeKey, rawPath, body, { authorization: `Bearer ${forgedToken}` }),
  );
  assertResponse(forged, 403, 'staff_auth_token_invalid', 'Staff redeem forged credential');

  const expired = await loaded.handler(
    httpEvent(routeKey, rawPath, body, { authorization: `Bearer ${expiredToken}` }),
  );
  assertResponse(expired, 401, 'staff_auth_token_expired', 'Staff redeem expired credential');
  assertNoCalls(loaded.state, 'Staff redeem rejected credentials');

  const accepted = await loaded.handler(
    httpEvent(routeKey, rawPath, body, { authorization: `Bearer ${acceptedToken}` }),
  );
  assertResponse(accepted, 404, 'session_not_found', 'Staff redeem accepted credential');
  assert.equal(loaded.state.awsCalls.length, 1, 'Valid staff redeem credential must reach one stubbed session read.');
  assert.equal(loaded.state.awsCalls[0].client, 'RDSDataClient');
  assert.deepEqual(loaded.state.networkCalls, [], 'Staff redeem validation must not reach Roller.');
}

async function validateWebhookRoutes() {
  const webhookToken = crypto.randomBytes(32).toString('base64url');
  const wrongToken = crypto.randomBytes(32).toString('base64url');
  const loaded = loadLambda('infra/lambda/webhook/index.js', {
    environment: {
      ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
      JUMPYARD_EMERGENCY_STOP: 'false',
      WEBHOOK_DEV_TOKEN: webhookToken,
    },
  });
  const paths = ['/v1/roller/webhooks/bookings', '/v1/roller/webhooks/redemptions'];

  for (const rawPath of paths) {
    const routeKey = `POST ${rawPath}`;
    const missing = await loaded.handler(httpEvent(routeKey, rawPath));
    assertResponse(missing, 200, 'webhook_token_required', `${routeKey} missing credential`);
    assert.equal(parsedBody(missing).status, 'ignored_unauthorized');

    const wrong = await loaded.handler(
      httpEvent(routeKey, rawPath, {}, { 'x-roller-apikey': wrongToken }),
    );
    assertResponse(wrong, 200, 'webhook_token_invalid', `${routeKey} wrong credential`);
    assert.equal(parsedBody(wrong).status, 'ignored_unauthorized');

    const accepted = await loaded.handler(
      httpEvent(routeKey, rawPath, {}, { 'x-roller-apikey': webhookToken }),
    );
    assert.equal(accepted.statusCode, 200);
    assert.equal(parsedBody(accepted).status, 'ignored_disabled');
    assert.equal(parsedBody(accepted).webhook?.reason, 'roller_webhook_processing_disabled');
  }

  assertNoCalls(loaded.state, 'Disabled webhook boundary');
}

function renderedOutput(response, consoleCalls) {
  return [
    response.headers?.['x-correlation-id'] ?? '',
    response.body ?? '',
    ...consoleCalls.flatMap((call) => call.args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))),
  ].join('\n');
}

async function validateCorrelationIdHardening() {
  const signingMaterial = crypto.randomBytes(32).toString('base64url');
  const loaded = loadLambda('infra/lambda/session/index.js', {
    environment: {
      ENABLE_STAFF_AUTH: 'true',
      JUMPYARD_EMERGENCY_STOP: 'false',
    },
    primeStaffAuth: true,
  });
  primeStaffConfig(loaded, signingMaterial);
  const routeKey = 'POST /v1/staff/auth/login';
  const rawPath = '/v1/staff/auth/login';
  const unsafeCases = [
    {
      bodyCorrelationId: `overlong-${'a'.repeat(96)}`,
      forbiddenFragments: ['overlong-'],
      label: 'overlong body correlation id',
    },
    {
      bodyCorrelationId: 'guest@example.com\r\nforged-log-line',
      forbiddenFragments: ['guest@example.com', 'forged-log-line'],
      label: 'PII/log-injection body correlation id',
    },
    {
      forbiddenFragments: ['header-overlong-'],
      headerCorrelationId: `header-overlong-${'b'.repeat(96)}`,
      label: 'overlong header correlation id',
    },
    {
      forbiddenFragments: ['header@example.com', 'injected-header-line'],
      headerCorrelationId: 'header@example.com\r\ninjected-header-line',
      label: 'PII/log-injection header correlation id',
    },
  ];

  for (const testCase of unsafeCases) {
    const beforeLogs = loaded.state.consoleCalls.length;
    const body = {
      passcode: 'intentionally-wrong',
      ...(testCase.bodyCorrelationId ? { correlationId: testCase.bodyCorrelationId } : {}),
    };
    const headers = testCase.headerCorrelationId
      ? { 'x-correlation-id': testCase.headerCorrelationId }
      : {};
    const response = await loaded.handler(httpEvent(routeKey, rawPath, body, headers));
    assertResponse(response, 403, 'staff_passcode_invalid', testCase.label);

    const responseCorrelationId = parsedBody(response).correlationId;
    assert.match(responseCorrelationId, /^jy_[a-z0-9]+_[a-f0-9-]+$/, `${testCase.label} must get a safe generated id.`);
    assert.equal(response.headers['x-correlation-id'], responseCorrelationId);

    const output = renderedOutput(response, loaded.state.consoleCalls.slice(beforeLogs));
    for (const fragment of testCase.forbiddenFragments) {
      assert.equal(output.includes(fragment), false, `${testCase.label} leaked ${fragment}.`);
    }
  }

  const safeHeaderId = 'staff-login/header.v1';
  const beforeHeaderLogs = loaded.state.consoleCalls.length;
  const safeHeaderResponse = await loaded.handler(
    httpEvent(routeKey, rawPath, { passcode: 'intentionally-wrong' }, { 'x-correlation-id': safeHeaderId }),
  );
  assertResponse(safeHeaderResponse, 403, 'staff_passcode_invalid', 'Safe header correlation id');
  assert.equal(safeHeaderResponse.headers['x-correlation-id'], safeHeaderId);
  assert.equal(parsedBody(safeHeaderResponse).correlationId, safeHeaderId);
  assert.equal(
    renderedOutput(safeHeaderResponse, loaded.state.consoleCalls.slice(beforeHeaderLogs)).includes(safeHeaderId),
    true,
    'A safe header correlation id must remain available in the structured login log.',
  );

  const safeBodyId = 'staff.login:body-01';
  const beforeBodyLogs = loaded.state.consoleCalls.length;
  const safeBodyResponse = await loaded.handler(
    httpEvent(
      routeKey,
      rawPath,
      { correlationId: safeBodyId, passcode: 'intentionally-wrong' },
      { 'x-correlation-id': safeHeaderId },
    ),
  );
  assertResponse(safeBodyResponse, 403, 'staff_passcode_invalid', 'Safe body correlation id');
  assert.equal(safeBodyResponse.headers['x-correlation-id'], safeBodyId);
  assert.equal(parsedBody(safeBodyResponse).correlationId, safeBodyId);
  assert.equal(
    renderedOutput(safeBodyResponse, loaded.state.consoleCalls.slice(beforeBodyLogs)).includes(safeBodyId),
    true,
    'A safe body correlation id must remain available in the structured login log.',
  );

  assertNoCalls(loaded.state, 'Staff login correlation-id validation');
}

function validateSharedCorrelationIdPolicy() {
  const handlers = ['booking', 'lookup', 'redeem', 'session', 'webhook'];
  const normalizedBodies = handlers.map((handler) => {
    const relativePath = `infra/lambda/${handler}/index.js`;
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    const match = source.match(/function normalizeCorrelationId\(value\) \{([\s\S]*?)\n\}/);
    assert.ok(match, `${relativePath} must define the shared correlation-id normalizer.`);
    assert.equal(
      match[1].includes("/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/"),
      true,
      `${relativePath} must enforce the 96-character allowlist.`,
    );
    assert.ok(
      (source.match(/normalizeCorrelationId\(/g) ?? []).length >= 2,
      `${relativePath} must call, not merely define, the correlation-id normalizer.`,
    );
    return match[1].replace(/\s+/g, ' ').trim();
  });

  assert.equal(
    new Set(normalizedBodies).size,
    1,
    'All five API handlers must keep the same correlation-id normalization implementation.',
  );
}

function validateIamCatalog() {
  const stackSource = fs.readFileSync(path.join(ROOT, 'infra/lib/jumpyard-cloud-stack.ts'), 'utf8');
  const catalogMatch = stackSource.match(
    /const API_ROUTE_PROTECTION_CATALOG = \[([\s\S]*?)\]\s+as const satisfies readonly ApiRouteProtection\[\];/,
  );
  assert.ok(catalogMatch, 'The stack must expose one readable API route protection catalog.');

  const catalogEntries = [...catalogMatch[1].matchAll(/\{([\s\S]*?)\}/g)].map((match) => match[1]);
  const protectedRoutes = catalogEntries
    .filter((entry) => /trustClass:\s*'(internal_ops|legacy_dev_only)'/.test(entry))
    .map((entry) => {
      const routeKey = entry.match(/routeKey:\s*'([^']+)'/)?.[1];
      assert.ok(routeKey, 'Every protected catalog entry must have a route key.');
      assert.match(entry, /authorizationType:\s*'AWS_IAM'/, `${routeKey} must not be anonymous.`);
      return routeKey;
    })
    .sort();

  assert.deepEqual(protectedRoutes, [...IAM_ROUTES].sort(), 'The IAM route catalog changed unexpectedly.');
  assert.match(
    stackSource,
    /new apigatewayv2\.CfnRoute\([\s\S]*?authorizationType:\s*protection\.authorizationType/,
    'The route catalog authorization must be applied to each API Gateway route.',
  );
}

async function main() {
  await validateInternalSessionLinkRoutes();
  await validateLegacyRedeemRoute();
  await validateStaffSessionRoutes();
  await validateStaffRedeemRoute();
  await validateWebhookRoutes();
  await validateCorrelationIdHardening();
  validateSharedCorrelationIdPolicy();
  validateIamCatalog();

  console.log('[pass] internal session-link routes require both IAM catalog protection and the app service token');
  console.log('[pass] legacy plan-only redeem and all staff routes reject missing/forged credentials before side effects');
  console.log('[pass] authenticated webhook delivery reaches only the disabled-processing boundary');
  console.log('[pass] valid credentials reach stubbed read/validation branches without real AWS or Roller calls');
  console.log('[pass] staff login rejects unsafe correlation ids and all five handlers share the 96-character allowlist');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
