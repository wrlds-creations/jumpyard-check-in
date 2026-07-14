const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const recoveryPath = path.join(root, 'jumpyard-checkin-phone', 'src', 'flow', 'buyFlowRecovery.ts');
const pagePath = path.join(root, 'jumpyard-checkin-phone', 'src', 'app', 'page.tsx');
const storageKey = 'jumpyard.buyFlowRecovery.v1';

function loadRecoveryModule(source) {
  const typescript = require(path.join(root, 'jumpyard-checkin-phone', 'node_modules', 'typescript'));
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: recoveryPath,
  });
  const loaded = { exports: {} };
  const evaluate = new Function('exports', 'module', 'require', '__filename', '__dirname', transpiled.outputText);
  evaluate(loaded.exports, loaded, require, recoveryPath, path.dirname(recoveryPath));
  return loaded.exports;
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  removeItem(key) {
    this.values.delete(key);
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

class BrowserWindow extends EventTarget {
  constructor(localStorage) {
    super();
    this.localStorage = localStorage;
    this.performance = globalThis.performance;
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
  }
}

function recoverySnapshot(updatedAt) {
  return {
    version: 1,
    updatedAt,
    currentFlowStep: 'CONTACT',
    bookingReference: null,
    draftUniqueId: null,
    selectedStartTime: '10:00',
    selectedProduct: null,
    jumperCount: null,
    contact: {
      firstName: 'Test',
      lastName: 'Guest',
      email: 'test@example.invalid',
      phone: '+46000000000',
    },
    draftState: null,
  };
}

function recoveryContractSnapshot(updatedTime, lastObservedTime = updatedTime) {
  return {
    ...recoverySnapshot(new Date(updatedTime).toISOString()),
    expiresAt: new Date(updatedTime + (12 * 60 * 60 * 1000)).toISOString(),
    lastObservedAt: new Date(lastObservedTime).toISOString(),
  };
}

async function main() {
  const storage = new MemoryStorage();
  global.window = new BrowserWindow(storage);
  global.document = new EventTarget();

  const recoverySource = fs.readFileSync(recoveryPath, 'utf8');
  let recovery = loadRecoveryModule(recoverySource);
  assert.equal(recovery.BUY_FLOW_RECOVERY_MAX_AGE_MS, 12 * 60 * 60 * 1000);

  const legacyUpdatedTime = Date.now() - 1_000;
  storage.setItem(storageKey, JSON.stringify(recoverySnapshot(new Date(legacyUpdatedTime).toISOString())));
  const migratedLegacy = recovery.readBuyFlowRecovery();
  assert.equal(
    migratedLegacy.expiresAt,
    new Date(legacyUpdatedTime + recovery.BUY_FLOW_RECOVERY_MAX_AGE_MS).toISOString(),
    'legacy recovery state must receive an immutable expiry derived from updatedAt'
  );
  assert.ok(Date.parse(migratedLegacy.lastObservedAt) >= legacyUpdatedTime);
  assert.equal(JSON.parse(storage.getItem(storageKey)).expiresAt, migratedLegacy.expiresAt);

  const tamperedExpiryTime = Date.now() - 1_000;
  const tamperedExpiry = recoveryContractSnapshot(tamperedExpiryTime);
  tamperedExpiry.expiresAt = new Date(
    tamperedExpiryTime + recovery.BUY_FLOW_RECOVERY_MAX_AGE_MS + 1
  ).toISOString();
  storage.setItem(storageKey, JSON.stringify(tamperedExpiry));
  assert.equal(recovery.readBuyFlowRecovery(), null, 'a changed expiry must fail closed');
  assert.equal(storage.getItem(storageKey), null);

  const exactlyExpired = recoverySnapshot(
    new Date(Date.now() - recovery.BUY_FLOW_RECOVERY_MAX_AGE_MS).toISOString()
  );
  storage.setItem(storageKey, JSON.stringify(exactlyExpired));
  assert.equal(recovery.readBuyFlowRecovery(), null);
  assert.equal(storage.getItem(storageKey), null);

  const futureDated = recoverySnapshot(
    new Date(Date.now() + 60 * 60 * 1000).toISOString()
  );
  storage.setItem(storageKey, JSON.stringify(futureDated));
  assert.equal(recovery.readBuyFlowRecovery(), null, 'future timestamps must fail closed');
  assert.equal(storage.getItem(storageKey), null);

  const farFutureDated = recoverySnapshot('9999-12-31T23:59:59.999Z');
  storage.setItem(storageKey, JSON.stringify(farFutureDated));
  assert.equal(recovery.readBuyFlowRecovery(), null, 'far-future timestamps must not overflow cleanup timers');
  assert.equal(storage.getItem(storageKey), null);

  const expiresSoon = recoverySnapshot(
    new Date(Date.now() - recovery.BUY_FLOW_RECOVERY_MAX_AGE_MS + 500).toISOString()
  );
  storage.setItem(storageKey, JSON.stringify(expiresSoon));
  assert.ok(recovery.readBuyFlowRecovery()?.contact?.email);

  const stopCleanup = recovery.startBuyFlowRecoveryCleanup();
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(storage.getItem(storageKey), null, 'active cleanup must remove contact-bearing recovery state');
  stopCleanup();

  const originalDateNow = Date.now;
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const originalPerformance = window.performance;
  const baseTime = Date.parse('2026-07-14T12:00:00.000Z');
  const scheduledDelays = [];
  const scheduledCallbacks = [];
  try {
    window.setTimeout = (callback, delay) => {
      scheduledDelays.push(delay);
      scheduledCallbacks.push(callback);
      return scheduledDelays.length;
    };
    window.clearTimeout = () => undefined;

    recovery = loadRecoveryModule(recoverySource);
    storage.setItem(storageKey, JSON.stringify(recoveryContractSnapshot(baseTime)));
    let nowReadCount = 0;
    Date.now = () => nowReadCount++ < 2
      ? baseTime
      : baseTime - (100 * recovery.BUY_FLOW_RECOVERY_MAX_AGE_MS);
    const stopCappedCleanup = recovery.startBuyFlowRecoveryCleanup();
    assert.ok(
      scheduledDelays[0] <= 60 * 1000,
      'an active page must checkpoint observed time at least once per minute'
    );
    stopCappedCleanup();

    scheduledDelays.length = 0;
    scheduledCallbacks.length = 0;
    recovery = loadRecoveryModule(recoverySource);
    let monotonicTime = 0;
    window.performance = { now: () => monotonicTime };
    Date.now = () => baseTime;
    storage.setItem(storageKey, JSON.stringify(recoveryContractSnapshot(baseTime)));
    const stopPartialRollbackCleanup = recovery.startBuyFlowRecoveryCleanup();
    assert.ok(scheduledDelays.at(-1) <= 60 * 1000);
    const beforeCheckpoint = JSON.parse(storage.getItem(storageKey));
    monotonicTime = 60 * 1000;
    Date.now = () => baseTime + (60 * 1000);
    scheduledCallbacks.at(-1)();
    const afterCheckpoint = JSON.parse(storage.getItem(storageKey));
    assert.equal(afterCheckpoint.updatedAt, beforeCheckpoint.updatedAt, 'checkpoint must not renew updatedAt');
    assert.equal(afterCheckpoint.expiresAt, beforeCheckpoint.expiresAt, 'checkpoint must not renew expiresAt');
    assert.ok(
      Date.parse(afterCheckpoint.lastObservedAt) > Date.parse(beforeCheckpoint.lastObservedAt),
      'the minute checkpoint must advance lastObservedAt'
    );
    stopPartialRollbackCleanup();

    monotonicTime = 6 * 60 * 60 * 1000;
    Date.now = () => baseTime + (5 * 60 * 60 * 1000);
    const stopRemountedCleanup = recovery.startBuyFlowRecoveryCleanup();
    assert.equal(
      scheduledDelays.at(-1),
      60 * 1000,
      'a remount must retain both the module deadline and the minute checkpoint interval'
    );
    monotonicTime = recovery.BUY_FLOW_RECOVERY_MAX_AGE_MS;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(
      storage.getItem(storageKey),
      null,
      'the same snapshot must be deleted at its original monotonic 12-hour deadline'
    );
    stopRemountedCleanup();

    recovery = loadRecoveryModule(recoverySource);
    const observationBaseTime = baseTime + (24 * 60 * 60 * 1000);
    Date.now = () => observationBaseTime + (6 * 60 * 60 * 1000);
    storage.setItem(storageKey, JSON.stringify(recoveryContractSnapshot(observationBaseTime)));
    const observedSnapshot = recovery.readBuyFlowRecovery();
    assert.equal(
      observedSnapshot.lastObservedAt,
      new Date(observationBaseTime + (6 * 60 * 60 * 1000)).toISOString(),
      'lastObservedAt must advance and persist while time moves forward'
    );
    assert.equal(JSON.parse(storage.getItem(storageKey)).lastObservedAt, observedSnapshot.lastObservedAt);

    Date.now = () => observationBaseTime + (5 * 60 * 60 * 1000);
    assert.equal(recovery.readBuyFlowRecovery(), null);
    assert.equal(
      storage.getItem(storageKey),
      null,
      'a clock rollback behind persisted lastObservedAt must fail closed'
    );
  } finally {
    Date.now = originalDateNow;
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
    window.performance = originalPerformance;
  }

  const pageSource = fs.readFileSync(pagePath, 'utf8');
  assert.match(recoverySource, /window\.addEventListener\('pageshow', scheduleCleanup\)/);
  assert.match(recoverySource, /addEventListener\('visibilitychange', scheduleCleanup\)/);
  assert.match(recoverySource, /window\.addEventListener\(STORAGE_UPDATED_EVENT, scheduleCleanup\)/);
  assert.match(recoverySource, /let activeCleanupDeadline: ActiveCleanupDeadline \| null = null/);
  assert.match(recoverySource, /suppliedExpiresTime !== expectedExpiresTime/);
  assert.match(recoverySource, /suppliedLastObservedTime > now/);
  assert.match(pageSource, /useEffect\(\(\) => startBuyFlowRecoveryCleanup\(\), \[\]\)/);

  console.log('[pass] phone recovery contact state expires at 12 hours and is actively removed without reopening the buy flow');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
