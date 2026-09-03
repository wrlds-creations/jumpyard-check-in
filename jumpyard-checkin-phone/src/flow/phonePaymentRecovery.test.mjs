import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const componentFile = path.join(sourceRoot, 'components/RollerPaymentDropIn.tsx');
const sdkEntry = require.resolve('@roller/ecom-payments');
const config = Object.freeze({
  available: true,
  apiUrl: 'https://payment.invalid/',
  configurationId: 'synthetic-config',
  integrationId: 'synthetic-integration',
});
const syntheticRedirect = 'synthetic-return-payload-not-for-storage';
const redirectUrl = `https://phone.invalid/?sessionId=original-session&redirectResult=${syntheticRedirect}&lang=sv#booking`;

function paymentSession(reference) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
  return {
    jwt: `${encode({})}.${encode({
      merchantReference: reference,
      customer: { locale: 'sv-SE', countryCode: 'SE' },
      amount: 100,
      currency: 'SEK',
    })}.synthetic-signature`,
    jwtPresent: true,
    config,
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const found = find(child, predicate);
    if (found) return found;
  }
}

// Execute the real component and installed SDK. Only React's rendering host,
// Adyen's UI and HTTP are replaced; no provider or cloud call can leave this VM.
function createOfflineLockManager() {
  const held = new Set();
  return {
    async request(name, options, callback) {
      if (held.has(name)) {
        assert.equal(options.ifAvailable, true, 'Payment ownership must not wait behind another checkout');
        return callback(null);
      }
      held.add(name);
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { held.delete(name); }
    },
  };
}

function createHarness(t, { url = 'https://phone.invalid/?lang=sv#booking', redirectResult, bootstrapGate, checkoutGate, sessionGate,
  lockManager = createOfflineLockManager(), localStorage: sharedLocalStorage, initialNow = Date.now() } = {}) {
  const modules = new Map();
  const records = {
    requests: [],
    unexpectedRequests: [],
    sessions: [],
    checkouts: [],
    submissions: [],
    paymentAuthorizations: [],
    paymentRejections: [],
    mounts: [],
    writes: [],
    callbacks: [],
    locks: [],
  };
  const timers = new Map();
  const eventListeners = new Map();
  const views = new Set();
  const pendingDigests = new Set();
  let now = initialNow;
  let nextTimerId = 0;
  let rendering = null;

  function storage(area) {
    const data = new Map();
    return {
      get length() { return data.size; },
      key: index => [...data.keys()][index] ?? null,
      getItem: key => data.get(key) ?? null,
      setItem(key, value) {
        records.writes.push({ area, key, value: String(value) });
        data.set(key, String(value));
      },
      removeItem: key => data.delete(key),
      clear: () => data.clear(),
    };
  }

  const win = {
    location: new URL(url),
    localStorage: sharedLocalStorage ?? storage('local'),
    sessionStorage: storage('session'),
    screen: { colorDepth: 24, height: 800, width: 400 },
    history: {
      state: { existingRouterState: 'preserved' },
      replaceState(state, _title, next) {
        this.state = state;
        win.location = new URL(next, win.location);
      },
    },
    addEventListener(name, callback) {
      if (!eventListeners.has(name)) eventListeners.set(name, new Set());
      eventListeners.get(name).add(callback);
    },
    removeEventListener: (name, callback) => eventListeners.get(name)?.delete(callback),
    dispatchEvent(event) {
      eventListeners.get(event.type)?.forEach(callback => callback(event));
      return true;
    },
  };
  win.self = win;
  win.top = win;

  function setTimer(callback, delay = 0) {
    const id = ++nextTimerId;
    timers.set(id, { callback, at: now + delay });
    return id;
  }
  const clearTimer = id => timers.delete(id);
  win.setTimeout = setTimer;
  win.clearTimeout = clearTimer;

  const response = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  const navigator = { language: 'sv-SE', userAgent: 'offline-phone-payment-regression', locks: lockManager };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Headers,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    window: win,
    navigator,
    crypto: {
      randomUUID: () => webcrypto.randomUUID(),
      getRandomValues: value => webcrypto.getRandomValues(value),
      subtle: { digest(...args) {
        const result = webcrypto.subtle.digest(...args);
        pendingDigests.add(result);
        void result.finally(() => pendingDigests.delete(result));
        return result;
      } },
    },
    atob: value => Buffer.from(value, 'base64').toString('utf8'),
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    Date: class extends Date { static now() { return now; } },
    performance: { now: () => now },
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    fetch: async (target, options = {}) => {
      const request = { url: new URL(target), method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
      records.requests.push(request);
      if (request.url.origin === config.apiUrl.slice(0, -1)) {
        if (request.url.pathname === '/integration/synthetic-integration/configuration/synthetic-config/ecom' && request.method === 'GET') {
          if (bootstrapGate) await bootstrapGate;
          return response({ provider: 1, paymentMethods: [], clientKey: 'synthetic-client-key', isTestEnvironment: true });
        }
        if (request.url.pathname === '/payment/session' && request.method === 'POST') {
          records.sessions.push(request.body);
          if (sessionGate) await sessionGate;
          return response({ isValid: true, session: { id: `new-session-${records.sessions.length}`, data: 'synthetic-session-data' } });
        }
      }
      records.unexpectedRequests.push(`${request.method} ${request.url.origin}${request.url.pathname}`);
      throw new Error('Unregistered offline HTTP request');
    },
  });

  const depsChanged = (previous, next) => !previous || !next || previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]));
  const hooks = {
    useState(initial) {
      const view = rendering;
      const index = view.cursor++;
      if (!(index in view.slots)) view.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [view.slots[index], value => {
        if (!view.mounted) return;
        const next = typeof value === 'function' ? value(view.slots[index]) : value;
        if (!Object.is(next, view.slots[index])) {
          view.slots[index] = next;
          view.dirty = true;
        }
      }];
    },
    useRef(initial) {
      const view = rendering;
      const index = view.cursor++;
      if (!(index in view.slots)) view.slots[index] = { current: initial };
      return view.slots[index];
    },
    useEffect(effect, deps) {
      const view = rendering;
      const index = view.cursor++;
      if (depsChanged(view.slots[index], deps)) {
        view.effects.push(() => {
          view.cleanups.get(index)?.();
          view.cleanups.delete(index);
          const cleanup = effect();
          if (typeof cleanup === 'function') view.cleanups.set(index, cleanup);
        });
      }
      view.slots[index] = deps;
    },
    useMemo(factory, deps) {
      const view = rendering;
      const index = view.cursor++;
      if (depsChanged(view.slots[index]?.deps, deps)) view.slots[index] = { deps, value: factory() };
      return view.slots[index].value;
    },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
  };
  const labels = new Proxy({}, { get: (_object, name) => String(name) });
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const stubs = new Map([
    ['react', hooks],
    ['react/jsx-runtime', { jsx, jsxs: jsx, Fragment: 'fragment' }],
    ['lucide-react', { Loader2: () => null }],
    ['@/context/LanguageContext', { useTranslation: () => ({ t: { buy: labels, buyRecovery: labels, common: labels } }) }],
    ['@adyen/adyen-web', { __esModule: true, default: async configuration => {
      const checkout = { configuration, element: { setStatus() {}, unmount() {} } };
      records.checkouts.push(checkout);
      if (checkoutGate) await checkoutGate;
      return {
        submitDetails(details) {
          records.submissions.push({ sessionId: configuration.session.id, details });
          if (redirectResult) configuration.onPaymentCompleted({ resultCode: redirectResult }, checkout.element);
        },
        create(type, options) {
          assert.equal(type, 'dropin');
          checkout.options = options;
          return {
            mount(selector) {
              records.mounts.push({ selector, sessionId: configuration.session.id });
              options.onReady?.();
              return checkout.element;
            },
          };
        },
      };
    } }],
    ['@paypal/paypal-js', { loadScript: () => { throw new Error('PayPal is outside this Adyen return fixture'); } }],
  ]);

  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const moduleRecord = { exports: {} };
    modules.set(filename, moduleRecord);
    const javascript = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        allowJs: true,
      },
    }).outputText;
    const localRequire = specifier => {
      if (stubs.has(specifier)) return stubs.get(specifier);
      if (specifier === '@roller/ecom-payments') return load(sdkEntry);
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        const base = specifier.startsWith('@/') ? path.join(sourceRoot, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        const target = ['', '.ts', '.tsx', '.js'].map(extension => base + extension).find(candidate => fs.existsSync(candidate));
        assert.ok(target, `Unresolved offline test import: ${specifier}`);
        return load(target);
      }
      throw new Error(`Unexpected offline test import: ${specifier}`);
    };
    const factory = new vm.Script(`(function(require, module, exports) {\n${javascript}\n})`, { filename }).runInContext(context);
    factory(localRequire, moduleRecord, moduleRecord.exports);
    return moduleRecord.exports;
  }

  const Component = load(componentFile).RollerPaymentDropIn;
  function mount(props) {
    const identity = props.identity ?? `view-${views.size + 1}`;
    const view = {
      slots: [], cursor: 0, cleanups: new Map(), effects: [], dirty: true, mounted: true,
      props: {
        amountLabel: '100 kr',
        attemptId: identity,
        bookingIdentifier: `booking:${identity}`,
        kind: 'new_booking',
        onApproved: result => records.callbacks.push({ identity, kind: 'approved', result }),
        onFailed: result => records.callbacks.push({ identity, kind: 'failed', result }),
        onNavigationLockChange: locked => records.locks.push({ identity, locked }),
        ...props,
      },
      render(next = {}) {
        Object.assign(view.props, next);
        view.cursor = 0;
        view.effects = [];
        view.dirty = false;
        rendering = view;
        view.tree = Component(view.props);
        rendering = null;
        view.effects.forEach(effect => effect());
        return view.tree;
      },
      unmount() {
        view.mounted = false;
        view.cleanups.forEach(cleanup => cleanup());
        view.cleanups.clear();
        views.delete(view);
      },
      status: () => find(view.tree, element => element.props?.['data-roller-payment-status'])?.props['data-roller-payment-status'],
    };
    views.add(view);
    view.render();
    return view;
  }

  async function settle() {
    for (let pass = 0; pass < 12; pass++) {
      await new Promise(resolve => setImmediate(resolve));
      // Real SHA runs on Node's worker pool and may outlast a fixed number of event-loop passes.
      await Promise.allSettled([...pendingDigests]);
      for (const view of views) if (view.dirty) view.render();
    }
    assert.ok([...views].every(view => !view.dirty), 'Hook updates must settle');
  }

  t.after(() => {
    for (const view of views) view.unmount();
    assert.deepEqual(records.unexpectedRequests, [], 'Every HTTP effect must use an explicit offline response');
  });

  return {
    load,
    mount,
    settle,
    records,
    window: win,
    navigator,
    complete(index, resultCode, extra = {}) {
      const checkout = records.checkouts[index];
      assert.ok(checkout, 'A provider checkout must exist before a callback is delivered');
      checkout.configuration.onPaymentCompleted({ resultCode, ...extra }, checkout.element);
    },
    ready(index) {
      records.checkouts[index].options.onReady();
    },
    beforeSubmit(index) {
      const checkout = records.checkouts[index];
      checkout.configuration.beforeSubmit({ paymentMethod: { type: 'scheme' } }, checkout.element, {
        resolve() { records.paymentAuthorizations.push({ index, navigationLocked: records.locks.at(-1)?.locked }); },
        reject() { records.paymentRejections.push(index); },
      });
    },
    async advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        timers.delete(id);
        timer.callback();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

async function originalReturn(harness, { attemptId = 'original-attempt', sessionId = 'original-session' } = {}) {
  const recovery = harness.load(path.join(sourceRoot, 'flow/paymentRecovery.ts'));
  const record = recovery.beginPaymentRecovery({
    attemptId,
    bookingIdentifier: 'original-booking',
    kind: 'new_booking',
    config,
  });
  assert.ok(record, 'The original purchase must be durably recoverable before leaving for payment');
  assert.equal(await recovery.bindPaymentRecoverySession(attemptId, sessionId), true);
  const returnAttempt = recovery.readPaymentRecovery();
  const props = {
    identity: attemptId,
    attemptId,
    bookingIdentifier: returnAttempt.bookingIdentifier,
    kind: returnAttempt.kind,
    returnAttempt,
    paymentSession: { jwtPresent: false, config: returnAttempt.config },
  };
  return { props, recovery };
}

test('a clean checkout creates one session with its own JWT and mounts payment methods', async t => {
  const harness = createHarness(t);
  const session = paymentSession('clean-original');
  const view = harness.mount({ identity: 'clean', paymentSession: session });
  await harness.settle();
  assert.equal(harness.records.submissions.length, 0);
  assert.equal(harness.records.sessions.length, 1);
  assert.equal(harness.records.sessions[0].jwt, session.jwt);
  assert.equal(harness.records.mounts.length, 1);
  assert.equal(view.status(), 'ready');
  assert.equal(harness.records.callbacks.length, 0);
  assert.ok(harness.records.writes.every(write => !write.value.includes(session.jwt)), 'The raw payment JWT is response-only');
});

test('unmount ignores a late approval from the disposed checkout', async t => {
  const harness = createHarness(t);
  const view = harness.mount({ identity: 'disposed', paymentSession: paymentSession('disposed-original') });
  await harness.settle();
  view.unmount();
  harness.complete(0, 'Authorised');
  await harness.settle();
  assert.deepEqual(harness.records.callbacks, []);
});

test('a return without matching recovery cannot be applied to a fresh draft', async t => {
  const harness = createHarness(t, { url: redirectUrl, redirectResult: 'Cancelled' });
  harness.mount({ identity: 'unrelated-new-purchase', paymentSession: paymentSession('unrelated-new-purchase') });
  await harness.settle();
  assert.equal(harness.records.submissions.length, 0, 'An unbound return cannot be submitted against a new purchase');
  assert.equal(harness.records.sessions.length, 0, 'An unresolved earlier payment must not create a replacement payment');
  assert.equal(harness.records.mounts.length, 0);
  assert.equal(harness.records.callbacks.length, 1, 'The parent needs an unresolved outcome for its recovery screen');
  assert.ok(harness.records.callbacks.every(callback => callback.result.status === 'unknown'));
});

test('an ordinary rerender preserves the active session and uses the current parent callback', async t => {
  const harness = createHarness(t);
  const view = harness.mount({ identity: 'stable', paymentSession: paymentSession('stable-original') });
  await harness.settle();
  const updated = [];
  view.render({ onApproved: result => updated.push(result.status) });
  await harness.settle();
  harness.complete(0, 'Authorised');
  await harness.settle();
  assert.equal(harness.records.sessions.length, 1);
  assert.equal(harness.records.mounts.length, 1);
  assert.deepEqual(updated, ['approved']);
  assert.equal(harness.records.callbacks.length, 0);
});

test('returning from contact editing before submitting payment leaves the same purchase usable', async t => {
  const harness = createHarness(t);
  const props = { identity: 'not-submitted', paymentSession: paymentSession('not-submitted-original') };
  const previous = harness.mount(props);
  await harness.settle();
  assert.equal(previous.status(), 'ready');
  previous.unmount();
  const current = harness.mount(props);
  await harness.settle();
  assert.equal(current.status(), 'ready', 'Backing out before payment submission must not strand the checkout');
  assert.equal(harness.records.submissions.length, 0);
  assert.equal(harness.records.callbacks.length, 0);
});

test('editing the basket after a clean exit from unsubmitted payment can start the changed purchase', async t => {
  const harness = createHarness(t);
  const previous = harness.mount({ identity: 'old-basket', paymentSession: paymentSession('old-basket') });
  await harness.settle();
  previous.unmount();
  const current = harness.mount({ identity: 'changed-basket', paymentSession: paymentSession('changed-basket') });
  await harness.settle();
  assert.equal(current.status(), 'ready');
  assert.equal(harness.records.sessions.length, 2);
  assert.equal(harness.records.mounts.length, 2);
  assert.equal(harness.records.callbacks.length, 0);
});

test('the real SDK submit hook locks navigation before releasing payment and preserves recovery on exit', async t => {
  const harness = createHarness(t);
  const view = harness.mount({ identity: 'submitted', paymentSession: paymentSession('submitted-original') });
  const recovery = harness.load(path.join(sourceRoot, 'flow/paymentRecovery.ts'));
  await harness.settle();
  harness.beforeSubmit(0);
  await harness.settle();
  assert.deepEqual(harness.records.paymentAuthorizations, [{ index: 0, navigationLocked: true }]);
  assert.equal(view.status(), 'received');
  view.unmount();
  assert.equal(recovery.readPaymentRecovery().attemptId, 'submitted');
  const replacement = harness.mount({ identity: 'replacement', paymentSession: paymentSession('replacement') });
  await harness.settle();
  assert.equal(replacement.status(), 'unknown');
  assert.equal(harness.records.sessions.length, 1, 'A submitted purchase cannot silently open another payment');
});

for (const departure of ['pagehide', 'beforeunload', 'provider return URL']) {
  test(`${departure} preserves recovery even if the submit callback was not observed`, async t => {
    const harness = createHarness(t);
    const view = harness.mount({ identity: 'departing', paymentSession: paymentSession('departing-original') });
    const recovery = harness.load(path.join(sourceRoot, 'flow/paymentRecovery.ts'));
    await harness.settle();
    if (departure === 'provider return URL') harness.window.location = new URL(redirectUrl);
    else harness.window.dispatchEvent({ type: departure });
    view.unmount();
    assert.equal(recovery.readPaymentRecovery().attemptId, 'departing');
    assert.equal(recovery.readPaymentRecovery().outcome, 'pending');
  });
}

test('a disposed SDK submit hook cannot release payment for the previous purchase', async t => {
  const harness = createHarness(t);
  const previous = harness.mount({ identity: 'disposed-before-submit', paymentSession: paymentSession('disposed-before-submit') });
  await harness.settle();
  previous.unmount();
  const current = harness.mount({ identity: 'current-basket', paymentSession: paymentSession('current-basket') });
  await harness.settle();
  harness.beforeSubmit(0);
  await harness.settle();
  assert.deepEqual(harness.records.paymentAuthorizations, [], 'Rejecting the SDK hook is insufficient: its catch continues to resolve');
  assert.equal(current.status(), 'ready');
  assert.equal(harness.records.callbacks.length, 0);
});

test('late ready callbacks cannot undo submission or the unknown timeout', async t => {
  const harness = createHarness(t);
  const view = harness.mount({ identity: 'waiting-for-result', paymentSession: paymentSession('waiting-for-result') });
  await harness.settle();
  harness.beforeSubmit(0);
  await harness.settle();
  harness.ready(0);
  await harness.settle();
  assert.equal(view.status(), 'received');
  await harness.advance(30_000);
  assert.equal(view.status(), 'unknown');
  harness.ready(0);
  await harness.settle();
  assert.equal(view.status(), 'unknown');
  assert.equal(harness.records.locks.at(-1)?.locked, true);
  harness.complete(0, 'Authorised');
  await harness.settle();
  assert.equal(view.status(), 'approved', 'A definitive result still resolves the same waiting purchase');
});

for (const delayed of ['bootstrap', 'session', 'checkout']) {
  test(`delayed ${delayed} cannot reopen payment after the unknown timeout`, async t => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const harness = createHarness(t, { [`${delayed}Gate`]: gate });
    const view = harness.mount({ identity: `delayed-${delayed}`, paymentSession: paymentSession(`delayed-${delayed}`) });
    await harness.settle();
    await harness.advance(30_000);
    assert.equal(view.status(), 'unknown');
    release();
    await harness.settle();
    assert.equal(view.status(), 'unknown');
    assert.equal(harness.records.locks.at(-1)?.locked, true);
    assert.equal(harness.records.sessions.length, delayed === 'bootstrap' ? 0 : 1);
    if (delayed === 'checkout') {
      assert.equal(find(view.tree, element => element.props?.id === 'roller-payment-container').props.hidden, true);
      harness.beforeSubmit(0);
      await harness.settle();
      assert.deepEqual(harness.records.paymentAuthorizations, []);
    } else {
      assert.equal(harness.records.mounts.length, 0);
    }
  });
}

for (const [providerResult, expected] of [
  ['Authorised', 'approved'],
  ['Cancelled', 'failed'],
  ['Refused', 'failed'],
  ['Error', 'failed'],
  ['PresentToShopper', 'unknown'],
]) {
  test(`${providerResult} is classified as ${expected} without opening another payment`, async t => {
    const harness = createHarness(t);
    const view = harness.mount({ identity: 'classification', paymentSession: paymentSession('classification-original') });
    await harness.settle();
    harness.complete(0, providerResult, { pspReference: 'synthetic-provider-detail-not-for-storage' });
    await harness.settle();
    assert.equal(harness.records.callbacks.length, 1);
    assert.equal(harness.records.callbacks[0].result.status, expected);
    assert.equal(harness.records.sessions.length, 1);
    assert.equal(harness.records.mounts.length, 1);
    assert.equal(view.status(), expected);
    assert.equal(harness.records.locks.at(-1)?.locked, expected !== 'failed');
    assert.ok(harness.records.writes.every(write => !write.value.includes('synthetic-provider-detail-not-for-storage')));
  });
}

test('the original cancellation is processed without minting or storing a new JWT', async t => {
  const harness = createHarness(t, { url: redirectUrl, redirectResult: 'Cancelled' });
  const { props, recovery } = await originalReturn(harness);
  const view = harness.mount(props);
  await harness.settle();
  assert.equal(harness.records.submissions.length, 1);
  assert.equal(harness.records.submissions[0].sessionId, 'original-session');
  assert.equal(harness.records.submissions[0].details.details.redirectResult, syntheticRedirect);
  assert.equal(harness.records.sessions.length, 0);
  assert.equal(harness.records.mounts.length, 0);
  assert.equal(harness.records.callbacks.length, 1);
  assert.equal(harness.records.callbacks[0].result.status, 'failed');
  assert.equal(view.status(), 'failed');
  assert.equal(recovery.readPaymentRecovery().outcome, 'failed');
  assert.equal(recovery.readPaymentRecovery().returnConsumed, true);
  assert.equal(harness.window.location.searchParams.has('redirectResult'), false);
  assert.equal(harness.window.location.searchParams.has('sessionId'), false);
  assert.equal(harness.window.location.searchParams.get('lang'), 'sv');
  assert.equal(harness.window.location.hash, '#booking');
  assert.deepEqual(harness.window.history.state, { existingRouterState: 'preserved' });
  assert.ok(harness.records.writes.every(write => !write.value.includes(syntheticRedirect)));
  assert.ok(harness.records.writes.every(write => !write.value.includes('original-session')), 'Only the session hash belongs in JumpYard recovery');
});

test('cancelled return then an explicit new 10:00 purchase mounts its own payment methods', async t => {
  const harness = createHarness(t, { url: redirectUrl, redirectResult: 'Cancelled' });
  const { props, recovery } = await originalReturn(harness);
  const previous = harness.mount(props);
  await harness.settle();
  assert.equal(recovery.readPaymentRecovery().outcome, 'failed');
  previous.unmount();
  assert.equal(await recovery.clearPaymentRecoveryAfterCompletion(props.attemptId), true);
  const nextSession = paymentSession('new-10:00-same-basket');
  const current = harness.mount({ identity: 'new-10:00-same-basket', paymentSession: nextSession });
  await harness.settle();
  assert.equal(harness.records.submissions.length, 1, 'The previous redirect must never be submitted for the new purchase');
  assert.equal(harness.records.sessions.length, 1);
  assert.equal(harness.records.sessions[0].jwt, nextSession.jwt);
  assert.equal(harness.records.mounts.length, 1);
  assert.equal(current.status(), 'ready');
  assert.equal(harness.records.callbacks.length, 1, 'Only the original attempt received the cancellation');
  harness.complete(0, 'Authorised');
  await harness.settle();
  assert.equal(harness.records.callbacks.length, 1, 'A late approval from the disposed attempt cannot approve the new purchase');
  assert.equal(current.status(), 'ready');
  assert.equal(recovery.readPaymentRecovery().attemptId, 'new-10:00-same-basket');
  assert.equal(recovery.readPaymentRecovery().outcome, 'pending');
});

test('browser back cannot submit a consumed cancellation again', async t => {
  const harness = createHarness(t, { url: redirectUrl, redirectResult: 'Cancelled' });
  const { props, recovery } = await originalReturn(harness);
  const previous = harness.mount(props);
  await harness.settle();
  previous.unmount();
  harness.window.location = new URL(redirectUrl);
  harness.mount({ ...props, returnAttempt: recovery.readPaymentRecovery() });
  await harness.settle();
  assert.equal(harness.records.submissions.length, 1);
  assert.equal(harness.records.sessions.length, 0);
  assert.equal(harness.records.mounts.length, 0);
  assert.equal(recovery.readPaymentRecovery().outcome, 'failed');
});

for (const [providerResult, expected] of [
  ['Authorised', 'approved'],
  ['Pending', 'unknown'],
  ['Received', 'unknown'],
  ['Error', 'unknown'],
]) {
  test(`a ${providerResult} return stays on the original purchase with outcome ${expected}`, async t => {
    const harness = createHarness(t, { url: redirectUrl, redirectResult: providerResult });
    const { props, recovery } = await originalReturn(harness);
    harness.mount(props);
    await harness.settle();
    assert.equal(harness.records.submissions.length, 1);
    assert.equal(harness.records.sessions.length, 0);
    assert.equal(harness.records.mounts.length, 0);
    assert.equal(harness.records.callbacks.length, 1);
    assert.equal(harness.records.callbacks[0].identity, props.attemptId);
    assert.equal(harness.records.callbacks[0].result.status, expected);
    assert.equal(recovery.readPaymentRecovery().attemptId, props.attemptId);
    assert.equal(recovery.readPaymentRecovery().outcome, expected);
  });
}

test('a delayed return remains unknown without another payment and can be resolved for its original attempt', async t => {
  const harness = createHarness(t, { url: redirectUrl });
  const { props, recovery } = await originalReturn(harness);
  harness.mount(props);
  await harness.settle();
  assert.equal(harness.records.submissions.length, 1);
  assert.equal(harness.records.callbacks.length, 0, 'Resolving handleRedirect is not evidence that submitDetails has finished');
  await harness.advance(30_000);
  assert.equal(harness.records.sessions.length, 0);
  assert.equal(harness.records.mounts.length, 0);
  assert.equal(recovery.readPaymentRecovery().attemptId, props.attemptId);
  assert.equal(recovery.readPaymentRecovery().outcome, 'unknown');
  assert.equal(harness.records.callbacks.at(-1)?.result.status, 'unknown');
  harness.complete(0, 'Authorised');
  await harness.settle();
  assert.equal(harness.records.callbacks.at(-1)?.result.status, 'approved');
  assert.equal(recovery.readPaymentRecovery().outcome, 'approved');
  assert.equal(harness.records.sessions.length, 0);
});

for (const unavailable of ['mismatched session', 'expired recovery']) {
  test(`${unavailable} cannot submit the redirect or initialize a new payment`, async t => {
    const harness = createHarness(t, { url: redirectUrl, redirectResult: 'Authorised' });
    const { props, recovery } = await originalReturn(harness, unavailable === 'mismatched session' ? { sessionId: 'different-original-session' } : {});
    if (unavailable === 'expired recovery') await harness.advance(recovery.PAYMENT_RECOVERY_MAX_AGE_MS + 1);
    harness.mount(props);
    await harness.settle();
    assert.equal(harness.records.submissions.length, 0);
    assert.equal(harness.records.sessions.length, 0);
    assert.equal(harness.records.mounts.length, 0);
    assert.equal(harness.records.callbacks.length, 1, 'Unavailable recovery must report uncertainty rather than silently stall');
    assert.ok(harness.records.callbacks.every(callback => callback.result.status === 'unknown'));
  });
}
