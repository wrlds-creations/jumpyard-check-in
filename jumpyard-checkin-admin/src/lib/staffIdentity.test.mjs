import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const sources = Object.fromEntries(['adminApi', 'staffIdentity'].map((name) => [name, ts.transpileModule(read(`./${name}.ts`), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText]));
const INITIAL_TIME = Date.parse('2026-09-03T08:00:00.000Z');
const MINUTE = 60_000;
const plain = (value) => JSON.parse(JSON.stringify(value));
const iso = (time) => new Date(time).toISOString();
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(now = INITIAL_TIME, id = 'one') {
  return {
    identityMode: 'pin',
    auth: { token: `synthetic-token-${id}`, tokenType: 'Bearer', expiresAt: iso(now + 8 * 60 * MINUTE) },
    lastActivityAt: iso(now),
    lastHeartbeatAt: iso(now - 5 * MINUTE),
    session: { sessionId: `session-${id}`, idleExpiresAt: iso(now + 15 * MINUTE), absoluteExpiresAt: iso(now + 8 * 60 * MINUTE) },
    staff: { actorId: `actor-${id}`, displayName: 'Test Operator', environment: 'test', venueId: 'synthetic-venue', role: 'staff_operator', permissions: ['staff:sessions:read', 'staff:sessions:redeem'] },
  };
}

function response(status, body, textOverride) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => textOverride === undefined ? JSON.stringify(body) : textOverride,
  };
}

function activeResponse(auth, now = INITIAL_TIME) {
  return response(200, {
    status: 'staff_session_active',
    principal: auth.staff,
    session: { ...auth.session, idleExpiresAt: iso(now + 15 * MINUTE) },
  });
}

function broadcastHub() {
  const channels = new Set();
  const messages = [];
  return {
    messages,
    Channel: class {
      constructor(name) { this.name = name; this.listeners = new Set(); channels.add(this); }
      addEventListener(_event, callback) { this.listeners.add(callback); }
      removeEventListener(_event, callback) { this.listeners.delete(callback); }
      close() { channels.delete(this); }
      postMessage(data) {
        messages.push(plain(data));
        for (const channel of channels) {
          if (channel !== this && channel.name === this.name) {
            for (const callback of channel.listeners) callback({ data });
          }
        }
      }
    },
  };
}

// Execute the actual production modules, not a rewritten model. Every transport,
// timer and browser storage operation stays inside this isolated test harness.
function browser({ fetch: fetchImplementation, storage = new Map(), hub = broadcastHub(), random = 0 } = {}) {
  let now = INITIAL_TIME;
  let sequence = 0;
  const timers = new Map();
  const calls = [];
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const setTimeout = (callback, delay) => {
    const id = ++sequence;
    timers.set(id, { at: now + delay, callback });
    return id;
  };
  const window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    BroadcastChannel: hub.Channel,
  };
  const context = vm.createContext({
    window,
    Date: FakeDate,
    Math: Object.assign(Object.create(Math), { random: () => random }),
    Error,
    TypeError,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout: (id) => timers.delete(id),
    process: { env: { NEXT_PUBLIC_JUMPYARD_STAFF_IDENTITY_MODE: 'pin', NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL: 'https://heartbeat.test.invalid' } },
    fetch: async (url, options) => {
      assert.equal(url, 'https://heartbeat.test.invalid/v1/staff/auth/session');
      calls.push({ url, options });
      if (!fetchImplementation) throw new Error('Unexpected network call in isolated heartbeat test.');
      return fetchImplementation(url, options);
    },
  });
  const modules = new Map();
  const load = (name) => {
    if (modules.has(name)) return modules.get(name).exports;
    const loadedModule = { exports: {} };
    modules.set(name, loadedModule);
    const evaluate = vm.runInContext(`(function(require, module, exports) { ${sources[name]}\n})`, context, { filename: `${name}.ts` });
    evaluate((specifier) => {
      assert.equal(specifier, '@/lib/adminApi');
      return load('adminApi');
    }, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  };
  return {
    identity: load('staffIdentity'),
    api: load('adminApi'),
    calls,
    storage,
    hub,
    timers,
    now: () => now,
    advance(ms) {
      const until = now + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = until;
    },
  };
}

function assertUnextended(actual, original) {
  assert.equal(actual.auth.token, original.auth.token);
  assert.equal(actual.auth.expiresAt, original.auth.expiresAt);
  assert.equal(actual.lastActivityAt, original.lastActivityAt);
  assert.equal(actual.lastHeartbeatAt, original.lastHeartbeatAt);
  assert.deepEqual(plain(actual.session), original.session);
  assert.deepEqual(plain(actual.staff), original.staff);
}

for (const [name, implementation] of [
  ['network disconnect', async () => { throw new TypeError('Synthetic network failure'); }],
  ['response-body disconnect', async () => ({ ...response(200, {}), text: async () => { throw new TypeError('Synthetic body failure'); } })],
  ...[408, 429, 500, 502, 503, 504, 599].flatMap((status) => [
    [`HTTP ${status} JSON`, async () => response(status, { error: { code: 'temporarily_unavailable' } })],
    [`HTTP ${status} empty body`, async () => response(status, undefined, '')],
    [`HTTP ${status} HTML`, async () => response(status, undefined, '<html>Temporary gateway error</html>')],
  ]),
]) {
  test(`${name} preserves the still-valid identity with a bounded retry`, async () => {
    const b = browser({ fetch: implementation });
    const auth = fixture();
    b.identity.storeStaffAuth(auth);
    const result = await b.identity.heartbeatStaffAuth(auth);
    assertUnextended(result, auth);
    assert.equal(result.heartbeatRetryCount, 1);
    assert.equal(Date.parse(result.heartbeatRetryAt) - b.now(), 30_000);
    assert.deepEqual(plain(b.identity.readStoredStaffAuth()), plain(result));
    assert.equal(b.identity.isStaffHeartbeatDue(result), false);
    assert.equal(b.calls.length, 1);
    assert.equal(b.timers.size, 0);
    assert.deepEqual(b.hub.messages, []);
  });
}

for (const status of [401, 403]) {
  for (const bodyKind of ['json', 'empty', 'html', 'body never finishes']) {
    test(`HTTP ${status}, ${bodyKind}, remains a definitive authentication failure`, async () => {
      let bodyReads = 0;
      const b = browser({ fetch: async () => ({
        ...response(status, { error: { code: 'staff_auth_session_invalid' } }),
        text: async () => {
          bodyReads += 1;
          if (bodyKind === 'body never finishes') return new Promise(() => {});
          return bodyKind === 'empty' ? '' : bodyKind === 'html' ? '<html>Denied</html>' : '{}';
        },
      }) });
      const auth = fixture();
      b.identity.storeStaffAuth(auth);
      await assert.rejects(b.identity.heartbeatStaffAuth(auth), (error) => error instanceof b.api.StaffApiError && error.status === status);
      assert.equal(bodyReads, 0, 'Known auth rejection must not wait for an unreadable body.');
      assert.equal(b.identity.readStoredStaffAuth().heartbeatRetryAt, undefined);
      assert.equal(b.timers.size, 0);
    });
  }
}

test('an explicit authentication failure code is not retried even with HTTP 503', async () => {
  const b = browser({ fetch: async () => response(503, { error: { code: 'staff_auth_session_revoked' } }) });
  const auth = fixture();
  b.identity.storeStaffAuth(auth);
  await assert.rejects(b.identity.heartbeatStaffAuth(auth), (error) => error.isAuthenticationFailure === true);
  assert.equal(b.identity.readStoredStaffAuth().heartbeatRetryAt, undefined);
});

for (const body of ['', '<html>Not a session</html>', 'null', '{}']) {
  test(`an invalid successful response (${JSON.stringify(body)}) is not accepted as a session`, async () => {
    const b = browser({ fetch: async () => response(200, undefined, body) });
    const auth = fixture();
    b.identity.storeStaffAuth(auth);
    await assert.rejects(b.identity.heartbeatStaffAuth(auth));
    assert.deepEqual(plain(b.identity.readStoredStaffAuth()), auth);
  });
}

for (const stage of ['fetch', 'response body']) {
  test(`a hanging ${stage} is aborted after 15 seconds and can retry`, async () => {
    let aborted = false;
    const b = browser({ fetch: async (_url, { signal }) => {
      const waitForAbort = () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted test request', 'AbortError'));
        }, { once: true });
      });
      return stage === 'fetch' ? waitForAbort() : { ...response(200, {}), text: waitForAbort };
    } });
    const auth = fixture();
    b.identity.storeStaffAuth(auth);
    const pending = b.identity.heartbeatStaffAuth(auth);
    await flush();
    b.advance(14_999);
    assert.equal(aborted, false);
    b.advance(1);
    const result = await pending;
    assert.equal(aborted, true);
    assert.equal(result.heartbeatRetryCount, 1);
    assertUnextended(result, auth);
    assert.equal(b.timers.size, 0);
  });
}

test('simultaneous resume, timer and visibility calls share one request', async () => {
  const operation = deferred();
  const b = browser({ fetch: () => operation.promise });
  const auth = fixture();
  b.identity.storeStaffAuth(auth);
  const pending = Array.from({ length: 20 }, () => b.identity.heartbeatStaffAuth(auth));
  await flush();
  assert.equal(b.calls.length, 1);
  operation.resolve(activeResponse(auth));
  const results = await Promise.all(pending);
  assert.equal(results.length, 20);
  for (const result of results) assert.equal(result.session.sessionId, auth.session.sessionId);
  assert.equal(b.calls.length, 1);
  assert.equal(b.timers.size, 0);
});

test('backoff survives repeated callers and reload, escalates to its cap, then resets on recovery', async () => {
  let recover = false;
  const b = browser({ fetch: async () => recover ? activeResponse(auth, b.now()) : response(503, {}) });
  const auth = fixture();
  b.identity.storeStaffAuth(auth);
  let current = auth;
  for (const [index, delay] of [30_000, 60_000, 120_000, 120_000].entries()) {
    current = await b.identity.heartbeatStaffAuth(current);
    assert.equal(Date.parse(current.heartbeatRetryAt) - b.now(), delay);
    assert.equal(b.calls.length, index + 1);
    for (let duplicate = 0; duplicate < 20; duplicate += 1) await b.identity.heartbeatStaffAuth(current);
    assert.equal(b.calls.length, index + 1);
    b.advance(delay - 1);
    assert.equal(b.identity.isStaffHeartbeatDue(current), false);
    b.advance(1);
    assert.equal(b.identity.isStaffHeartbeatDue(current), true);
  }
  const reloaded = browser({ storage: b.storage });
  // The reload uses an earlier clock, so the persisted future retry still blocks I/O.
  await reloaded.identity.heartbeatStaffAuth(reloaded.identity.readStoredStaffAuth());
  assert.equal(reloaded.calls.length, 0);
  recover = true;
  const result = await b.identity.heartbeatStaffAuth(current);
  assert.equal(b.calls.length, 5);
  assert.equal(result.heartbeatRetryAt, undefined);
  assert.equal(result.heartbeatRetryCount, undefined);
  assert.equal(result.lastHeartbeatAt, iso(b.now()));
  assert.equal(result.lastActivityAt, auth.lastActivityAt);
  assert.equal(result.session.absoluteExpiresAt, auth.session.absoluteExpiresAt);
  assert.equal(b.identity.isStaffHeartbeatDue(result), false);
});

test('jitter stays within the documented 20 percent bound', async () => {
  const b = browser({ fetch: async () => response(429, {}), random: 0.99999 });
  b.identity.storeStaffAuth(fixture());
  let current = b.identity.readStoredStaffAuth();
  for (const baseDelay of [30_000, 60_000, 120_000, 120_000]) {
    current = await b.identity.heartbeatStaffAuth(current);
    const delay = Date.parse(current.heartbeatRetryAt) - b.now();
    assert.ok(delay >= baseDelay && delay <= baseDelay * 1.2);
    b.advance(delay);
  }
});

for (const expiry of ['local idle', 'server idle', 'absolute', 'token']) {
  test(`${expiry} expiry still blocks a retry without a new request`, async () => {
    const b = browser({ fetch: async () => response(503, {}) });
    const auth = fixture();
    if (expiry === 'local idle') auth.lastActivityAt = iso(INITIAL_TIME - 15 * MINUTE + 20_000);
    if (expiry === 'server idle') auth.session.idleExpiresAt = iso(INITIAL_TIME + 20_000);
    if (expiry === 'absolute') auth.session.absoluteExpiresAt = iso(INITIAL_TIME + 20_000);
    if (expiry === 'token') auth.auth.expiresAt = iso(INITIAL_TIME + 20_000);
    b.identity.storeStaffAuth(auth);
    const retry = await b.identity.heartbeatStaffAuth(auth);
    b.advance(20_000);
    assert.notEqual(b.identity.getStaffSessionExpiryReason(retry), null);
    await assert.rejects(b.identity.heartbeatStaffAuth(retry));
    assert.equal(b.calls.length, 1);
    assertUnextended(b.identity.readStoredStaffAuth(), auth);
  });
}

for (const outcome of ['success', 'transient failure', 'authentication failure']) {
  for (const change of ['logout', 'new session', 'new token', 'expiry']) {
    test(`late ${outcome} cannot resurrect or overwrite ${change}`, async () => {
      const operation = deferred();
      const b = browser({ fetch: () => operation.promise });
      const auth = fixture();
      if (change === 'expiry') auth.lastActivityAt = iso(INITIAL_TIME - 15 * MINUTE + 1000);
      b.identity.storeStaffAuth(auth);
      const pending = b.identity.heartbeatStaffAuth(auth);
      await flush();
      if (change === 'logout') b.identity.clearStaffAuthStorage();
      if (change === 'new session') b.identity.storeStaffAuth(fixture(INITIAL_TIME, 'two'));
      if (change === 'new token') b.identity.storeStaffAuth({ ...auth, auth: { ...auth.auth, token: 'synthetic-replacement-token' } });
      if (change === 'expiry') b.advance(1000);
      const before = plain(b.identity.readStoredStaffAuth());
      operation.resolve(outcome === 'success' ? activeResponse(auth, b.now()) : response(outcome === 'transient failure' ? 503 : 401, {}));
      await assert.rejects(pending);
      assert.deepEqual(plain(b.identity.readStoredStaffAuth()), before);
      assert.deepEqual(b.hub.messages, []);
    });
  }
}

test('an old session failure cannot release the replacement session single-flight guard', async () => {
  const first = deferred();
  const second = deferred();
  let count = 0;
  const b = browser({ fetch: () => (++count === 1 ? first.promise : second.promise) });
  const auth = fixture();
  b.identity.storeStaffAuth(auth);
  const oldPending = b.identity.heartbeatStaffAuth(auth);
  await flush();
  const replacement = { ...auth, auth: { ...auth.auth, token: 'synthetic-replacement-token' } };
  b.identity.storeStaffAuth(replacement);
  const newPending = b.identity.heartbeatStaffAuth(replacement);
  await flush();
  first.resolve(response(401, {}));
  await assert.rejects(oldPending);
  const duplicate = b.identity.heartbeatStaffAuth(replacement);
  await flush();
  assert.equal(b.calls.length, 2);
  second.resolve(activeResponse(replacement));
  await Promise.all([newPending, duplicate]);
  assert.equal(b.identity.readStoredStaffAuth().auth.token, replacement.auth.token);
});

test('successful heartbeat preserves activity recorded while its response was pending', async () => {
  const operation = deferred();
  const b = browser({ fetch: () => operation.promise });
  const auth = fixture();
  b.identity.storeStaffAuth(auth);
  const pending = b.identity.heartbeatStaffAuth(auth);
  await flush();
  b.advance(1000);
  b.identity.markStaffActivity(auth, new Date(b.now()));
  operation.resolve(activeResponse(auth, b.now()));
  const result = await pending;
  assert.equal(result.lastActivityAt, iso(b.now()));
  assert.equal(result.lastHeartbeatAt, iso(b.now()));
});

for (const mismatch of ['actor', 'venue', 'environment', 'session', 'permissions']) {
  test(`heartbeat rejects a response with mismatched ${mismatch}`, async () => {
    const auth = fixture();
    const other = plain(auth);
    if (mismatch === 'actor') other.staff.actorId = 'other-actor';
    if (mismatch === 'venue') other.staff.venueId = 'other-venue';
    if (mismatch === 'environment') other.staff.environment = 'other-environment';
    if (mismatch === 'session') other.session.sessionId = 'other-session';
    if (mismatch === 'permissions') other.staff.permissions = ['staff:identities:manage'];
    const b = browser({ fetch: async () => activeResponse(other) });
    b.identity.storeStaffAuth(auth);
    await assert.rejects(b.identity.heartbeatStaffAuth(auth));
    assert.deepEqual(plain(b.identity.readStoredStaffAuth()), auth);
  });
}

test('a successful response cannot lengthen the absolute session deadline', async () => {
  const auth = fixture();
  const extended = plain(auth);
  extended.session.absoluteExpiresAt = iso(INITIAL_TIME + 24 * 60 * MINUTE);
  const b = browser({ fetch: async () => activeResponse(extended) });
  b.identity.storeStaffAuth(auth);
  const result = await b.identity.heartbeatStaffAuth(auth);
  assert.equal(result.session.absoluteExpiresAt, auth.session.absoluteExpiresAt);
  assert.equal(result.auth.expiresAt, auth.auth.expiresAt);
});

test('parallel tabs keep independent bounded retries; only explicit logout broadcasts', async () => {
  const hub = broadcastHub();
  const left = browser({ hub, fetch: async () => response(503, {}) });
  const right = browser({ hub, fetch: async () => response(429, {}) });
  const auth = fixture();
  left.identity.storeStaffAuth(auth);
  right.identity.storeStaffAuth(auth);
  const channelLeft = left.identity.openStaffLogoutChannel(() => left.identity.clearStaffAuthStorage());
  const channelRight = right.identity.openStaffLogoutChannel(() => right.identity.clearStaffAuthStorage());
  const leftRetry = await left.identity.heartbeatStaffAuth(auth);
  assert.deepEqual(plain(right.identity.readStoredStaffAuth()), auth);
  const rightRetry = await right.identity.heartbeatStaffAuth(auth);
  await Promise.all(Array.from({ length: 20 }, () => Promise.all([
    left.identity.heartbeatStaffAuth(leftRetry), right.identity.heartbeatStaffAuth(rightRetry),
  ])));
  assert.equal(left.calls.length, 1);
  assert.equal(right.calls.length, 1);
  assert.deepEqual(hub.messages, []);
  left.identity.clearStaffAuthStorage();
  channelLeft.broadcast();
  assert.equal(left.identity.readStoredStaffAuth(), null);
  assert.equal(right.identity.readStoredStaffAuth(), null);
  assert.deepEqual(hub.messages, [{ type: 'staff_logout', version: 2 }]);
  channelLeft.close();
  channelRight.close();
});

for (const outcome of ['success', 'failure', 'timeout']) {
  test(`delayed logout ${outcome} never clears a newer login`, async () => {
    const operation = deferred();
    const b = browser({ fetch: () => operation.promise });
    const auth = fixture();
    b.identity.storeStaffAuth(auth);
    const pending = b.identity.endStaffAuth(auth);
    await flush();
    // The page clears immediately, then the next operator can log in while the
    // old, bounded logout request still settles in the background.
    b.identity.clearStaffAuthStorage();
    const replacement = fixture(INITIAL_TIME, 'two');
    b.identity.storeStaffAuth(replacement);
    if (outcome === 'timeout') b.advance(2500);
    else operation.resolve(response(outcome === 'failure' ? 503 : 200, {
      status: 'staff_session_logged_out', session: auth.session,
    }));
    await pending;
    assert.deepEqual(plain(b.identity.readStoredStaffAuth()), replacement);
    assert.equal(b.timers.size, 0);
    if (outcome === 'timeout') {
      operation.resolve(response(200, { status: 'staff_session_logged_out', session: auth.session }));
      await flush();
      assert.deepEqual(plain(b.identity.readStoredStaffAuth()), replacement);
    }
  });
}

test('logout still clears its own identity even when the server is unavailable', async () => {
  const b = browser({ fetch: async () => response(503, {}) });
  const auth = fixture();
  b.identity.storeStaffAuth(auth);
  await b.identity.endStaffAuth(auth);
  assert.equal(b.identity.readStoredStaffAuth(), null);
});

test('the actual page identity guard rejects replacement tokens even when actor and session IDs match', () => {
  const page = read('../app/page.tsx');
  const start = page.indexOf('function isSameStaffSession(');
  const end = page.indexOf('\nfunction staffAuthSessionKey(', start);
  assert.ok(start >= 0 && end > start, 'The tested guard must come from the production page.');
  const source = ts.transpileModule(page.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const isSameStaffSession = vm.runInNewContext(`${source}\nisSameStaffSession;`);
  const auth = fixture();
  assert.equal(isSameStaffSession(plain(auth), auth), true);
  assert.equal(isSameStaffSession(null, auth), false);
  assert.equal(isSameStaffSession({ ...auth, auth: { ...auth.auth, token: 'synthetic-replacement-token' } }, auth), false);
  assert.equal(isSameStaffSession({ ...auth, staff: { ...auth.staff, actorId: 'other-actor' } }, auth), false);
  assert.equal(isSameStaffSession({ ...auth, session: { ...auth.session, sessionId: 'other-session' } }, auth), false);
  assert.equal(isSameStaffSession({ ...auth, identityMode: 'legacy' }, auth), false);
  const legacy = { ...auth, identityMode: 'legacy' };
  assert.equal(isSameStaffSession(plain(legacy), legacy), true);
  assert.equal(isSameStaffSession({ ...legacy, auth: { ...legacy.auth, token: 'other-legacy-token' } }, legacy), false);
});

test('both resume callbacks verify the stored identity before changing UI or clearing storage', () => {
  const page = read('../app/page.tsx');
  const start = page.indexOf('void (storedAuth.identityMode === "pin" ? heartbeatStaffAuth(storedAuth)');
  const end = page.indexOf('\n    }, 0);', start);
  assert.ok(start >= 0 && end > start);
  const resume = page.slice(start, end);
  const guard = 'if (!isSameStaffSession(readStoredStaffAuth(), storedAuth)) return;';
  const callbacks = [
    [resume.slice(0, resume.indexOf('.catch(')), 'setCurrentAuth(activeAuth);'],
    [resume.slice(resume.indexOf('.catch(')), 'clearStaffAuthStorage();'],
  ];
  for (const [callback, mutation] of callbacks) {
    assert.ok(callback.indexOf(guard) >= 0, 'Every resume outcome must retain the replacement-session guard.');
    assert.ok(callback.indexOf(guard) < callback.indexOf(mutation), 'Identity must be checked before the callback changes state.');
  }
});

test('startup/resume and periodic page checks both use the resilient heartbeat entrypoint', () => {
  const page = read('../app/page.tsx');
  assert.match(page, /storedAuth\.identityMode === "pin" \? heartbeatStaffAuth\(storedAuth\)/);
  assert.match(page, /void heartbeatStaffAuth\(currentAuth\)/);
  assert.match(page, /!isStaffHeartbeatDue\(currentAuth\) \|\| heartbeatInFlightRef\.current/);
  assert.match(page, /isSameStaffSession\(authRef\.current, currentAuth\)\) void terminateStaffSession\(\)/);
  assert.match(page, /lifecycleGeneration !== lifecycleGenerationRef\.current/);
  assert.doesNotMatch(read('./staffIdentity.ts'), /localStorage/);
});
