import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  PURCHASE_PREPARATION_RETRY_DELAYS_MS,
  PURCHASE_PREPARATION_TIMEOUT_MS,
  resolvePurchasePreparation,
  runPurchasePreparationRequest,
} from './purchasePreparation.ts';

const booking = (paid) => ({ id: 'original-purchase', rollerUniqueId: 'original-unique-id', jumpers: 2, time: '11:00', products: 1, paid });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

test('a successful lookup is ready for safety in one request, even before Roller marks it paid', async () => {
  for (const paid of [true, false]) {
    const expected = booking(paid);
    const calls = [];
    const result = await resolvePurchasePreparation(async (identifier, { signal }) => {
      calls.push(identifier);
      assert.equal(signal.aborted, false);
      return expected;
    }, expected.rollerUniqueId, { wait: async () => assert.fail('A returned unpaid booking must not be polled') });
    assert.deepEqual(result, { status: paid ? 'paid' : 'awaiting', booking: expected });
    assert.deepEqual(calls, [expected.rollerUniqueId]);
  }
});

test('two temporary 404s remain preparation until the same booking appears at 20 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let elapsed = 0;
  const outcome = resolvePurchasePreparation(async (identifier) => {
    calls.push({ identifier, elapsed });
    if (calls.length < 3) throw Object.assign(new Error('not_found'), { httpStatus: 404 });
    return booking(false);
  }, 'original-unique-id');
  let completed = false;
  outcome.then(() => { completed = true; });
  await flush();
  assert.equal(completed, false);
  assert.equal(calls.length, 1);
  elapsed = 5_000;
  t.mock.timers.tick(5_000);
  await flush();
  assert.equal(completed, false);
  assert.equal(calls.length, 2);
  elapsed = 20_000;
  t.mock.timers.tick(15_000);
  assert.equal((await outcome).status, 'awaiting');
  assert.deepEqual(calls, [0, 5_000, 20_000].map(elapsed => ({ identifier: 'original-unique-id', elapsed })));
  assert.deepEqual([...PURCHASE_PREPARATION_RETRY_DELAYS_MS], [5_000, 15_000]);
});

test('network and server failures stop after three requests and allow a fresh bounded check of the same purchase', async () => {
  const calls = [];
  const waits = [];
  const lookup = async (identifier) => {
    calls.push(identifier);
    throw Object.assign(new Error(calls.length === 1 ? 'network' : 'server'), { httpStatus: 500 });
  };
  const options = { wait: async ms => { waits.push(ms); } };
  assert.deepEqual(await resolvePurchasePreparation(lookup, 'original-unique-id', options), { status: 'unavailable' });
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [5_000, 15_000]);
  const retried = await resolvePurchasePreparation(async identifier => {
    calls.push(identifier);
    return booking(true);
  }, 'original-unique-id', options);
  assert.equal(retried.status, 'paid');
  assert.deepEqual(calls, Array(4).fill('original-unique-id'));
});

test('a never-settling lookup is aborted at the whole-preparation deadline without overlapping retries', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred();
  let calls = 0;
  let requestSignal;
  const outcome = resolvePurchasePreparation((_identifier, { signal }) => {
    calls += 1;
    requestSignal = signal;
    return pending.promise;
  }, 'original-unique-id');
  await flush();
  t.mock.timers.tick(PURCHASE_PREPARATION_TIMEOUT_MS);
  assert.deepEqual(await outcome, { status: 'unavailable' });
  assert.equal(requestSignal.aborted, true);
  assert.equal(calls, 1);
  pending.resolve(booking(true));
  await flush();
  t.mock.timers.tick(100_000);
  assert.equal(calls, 1);
});

test('the deadline includes earlier lookup time and backoff, rather than resetting per attempt', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred();
  let calls = 0;
  const outcome = resolvePurchasePreparation(async () => {
    calls += 1;
    if (calls === 1) return first.promise;
    throw new Error('temporary');
  }, 'original-unique-id');
  await flush();
  t.mock.timers.tick(30_000);
  first.reject(new Error('temporary'));
  await flush();
  t.mock.timers.tick(5_000);
  await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(10_000);
  assert.deepEqual(await outcome, { status: 'unavailable' });
  t.mock.timers.tick(100_000);
  await flush();
  assert.equal(calls, 2, 'No third lookup may start outside the 45 second window');
});

test('replacement during backoff aborts immediately and clears the pending retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let calls = 0;
  const outcome = resolvePurchasePreparation(async () => {
    calls += 1;
    throw new Error('not_found');
  }, 'original-unique-id', { signal: controller.signal });
  await flush();
  assert.equal(calls, 1);
  controller.abort();
  assert.deepEqual(await outcome, { status: 'unavailable' });
  t.mock.timers.tick(100_000);
  await flush();
  assert.equal(calls, 1);
});

test('stale attempts start no requests and ignore a result which arrived after replacement', async () => {
  let calls = 0;
  const lookup = async () => { calls += 1; return booking(true); };
  assert.deepEqual(await resolvePurchasePreparation(lookup, 'original-unique-id', { isCurrent: () => false }), { status: 'unavailable' });
  assert.equal(calls, 0);

  const pending = deferred();
  let current = true;
  const outcome = resolvePurchasePreparation(() => pending.promise, 'original-unique-id', { isCurrent: () => current });
  await flush();
  current = false;
  pending.resolve(booking(true));
  assert.deepEqual(await outcome, { status: 'unavailable' });
});

test('isCurrent is checked again after the retry wait, without another request for a stale purchase', async () => {
  let current = true;
  let calls = 0;
  const outcome = await resolvePurchasePreparation(async () => {
    calls += 1;
    throw new Error('temporary');
  }, 'original-unique-id', {
    isCurrent: () => current,
    wait: async () => { current = false; },
  });
  assert.deepEqual(outcome, { status: 'unavailable' });
  assert.equal(calls, 1);
});

test('a successful bounded request cleans up its timeout and caller abort listener', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let requestSignal;
  const expected = { checkinSessionId: 'prepared-session' };
  assert.equal(await runPurchasePreparationRequest(async signal => {
    requestSignal = signal;
    return expected;
  }, { signal: controller.signal, timeoutMs: 35_000 }), expected);
  controller.abort();
  t.mock.timers.tick(100_000);
  assert.equal(requestSignal.aborted, false, 'Completed requests retain no timeout or caller cancellation listener');
});

function loadCloudClient(fetch) {
  const file = new URL('./cloudClient.ts', import.meta.url);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    fetch,
    process: { env: { NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL: 'https://cloud.invalid', NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE: '2026-09-04' } },
    require: id => {
      assert.equal(id, './packageContents');
      return { getPackageAdmissionQuantity: () => { throw new Error('No booking body should finish in this abort test'); } };
    },
  });
  return exports;
}

test('real lookup and session clients pass the deadline signal through fetch and an unfinished response body', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const operation of ['lookup', 'session']) {
    let passedSignal;
    let bodyAborted = false;
    const cloud = loadCloudClient(async (_url, options) => {
      passedSignal = options.signal;
      return {
        ok: true,
        text: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
          bodyAborted = true;
          reject(new Error('aborted response body'));
        }, { once: true })),
      };
    });
    const outcome = runPurchasePreparationRequest(signal => operation === 'lookup'
      ? cloud.lookupBooking('original-unique-id', { signal })
      : cloud.startCheckInSession({ ...booking(true), guestAccessToken: 'synthetic-proof' }, 'safety', { signal }),
    { timeoutMs: 35_000 });
    const rejected = assert.rejects(outcome, { name: 'TimeoutError' });
    await flush();
    assert.equal(passedSignal.aborted, false);
    t.mock.timers.tick(35_000);
    await rejected;
    assert.equal(passedSignal.aborted, true);
    assert.equal(bodyAborted, true);
  }
});
