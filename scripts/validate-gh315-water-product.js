const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bookingPath = path.resolve(__dirname, '../infra/lambda/booking/index.js');
const source = fs.readFileSync(bookingPath, 'utf8');
const oldWater = { id: '1324123', name: 'Jumpy Vattenflaska', parent_product_id: '970508', parent_product_name: 'Merchandise', price_cents: '4900' };
const newWater = { id: '970411', name: 'JumpYard Vatten', parent_product_id: '970363', parent_product_name: 'Cold Drinks', price_cents: '2000' };
const item = { productId: 970411, quantity: 2, bookingDate: '2026-08-27', startTime: '15:00', requiresAvailability: false };
const customer = { firstName: 'Test', lastName: 'Guest', email: 'test@example.invalid', phone: '0700000000' };
const plain = (value) => JSON.parse(JSON.stringify(value));

function load() {
  const module = { exports: {} };
  const env = { JUMPYARD_ENVIRONMENT: 'park-test', JUMPYARD_EMERGENCY_STOP: 'false', ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true', ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true', T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: item.bookingDate };
  const failNetwork = () => { throw new Error('Unexpected external call in water product tests'); };
  const aws = new Proxy({}, { get: () => class { constructor(input) { this.input = input; } send() { return failNetwork(); } } });
  vm.runInNewContext(`${source}\nmodule.exports.test = {
    mapPhoneAddonProducts, loadPhoneAddonProducts, buildPhoneAvailability,
    normalizeQuoteRequest, normalizeDraftRequest, normalizeAddProductQuoteRequest, normalizeAddProductDraftRequest,
    validateQuoteRequest, validateDraftRequest, validateAddProductDraftRequest,
    buildRollerBookingPayload, buildProductDisplayItem, normalizeCosts, handleDraftFinalize,
    setStatement(fn) { executeStatement = fn; },
    setRecovery(record, events) {
      findKioskPrepaymentAttempt = async () => record;
      recordKioskTerminalOutcome = async () => { events.push('approved'); record.payment_attempt_status = 'approved'; return record; };
      ensureProvisionalKioskHandoff = async () => { events.push('provisional'); };
      markExistingProvisionalKioskSafetyResume = async () => {};
      queueKioskPaymentReconciliation = async () => { events.push('reconcile'); };
      validateItems = () => { throw new Error('Existing payment recovery must not revalidate the current sale catalog'); };
    }
  };`, {
    module, exports: module.exports, process: { env }, Buffer, URL, URLSearchParams, TextDecoder, TextEncoder,
    console: { log() {}, error() {} }, setTimeout, clearTimeout, fetch: failNetwork,
    require(id) {
      if (id === 'crypto') return crypto;
      if (id.startsWith('@aws-sdk/')) return aws;
      if (id.startsWith('./')) return require(path.join(path.dirname(bookingPath), id));
      throw new Error(`Unexpected module ${id}`);
    },
  }, { filename: bookingPath });
  return { ...module.exports.test, handler: module.exports.handler, env };
}

async function main() {
  const api = load();
  for (const rows of [[oldWater, newWater], [newWater, oldWater]]) {
    const snapshot = plain(rows);
    const water = api.mapPhoneAddonProducts(rows, 'live').filter((product) => product.key === 'water_bottle');
    assert.equal(water.length, 1);
    assert.equal(water[0].productId, '970411');
    assert.equal(water[0].parentProductId, '970363');
    assert.equal(water[0].productName, 'JumpYard Vatten');
    assert.equal(water[0].unitPriceCents, 2000);
    assert.equal(water[0].unitPrice, 20);
    assert.deepEqual(rows, snapshot, 'catalog selection must not rewrite historical cached rows');
    const availability = api.buildPhoneAvailability({ date: item.bookingDate, startTimes: ['15:00', '15:30'] }, water, []);
    assert.equal(availability.slots.length, 2);
    for (const slot of availability.slots) {
      assert.equal(slot.products[0].productId, '970411');
      assert.equal(slot.products[0].unitPriceCents, 2000);
      assert.equal(slot.products[0].available, true);
    }
  }
  console.log('[pass] both cached-row orders offer only the exact new SKU at its provider price');

  for (const rows of [[], [oldWater], [oldWater, { ...newWater, price_cents: null }], [oldWater, { ...newWater, price_cents: '' }], [oldWater, { ...newWater, id: '970412' }], [oldWater, { ...newWater, parent_product_id: 'wrong-parent' }]]) {
    assert.equal(api.mapPhoneAddonProducts(rows, 'live').some((product) => product.key === 'water_bottle'), false);
  }
  assert.equal(api.mapPhoneAddonProducts([{ ...newWater, price_cents: '2100' }], 'live').find((product) => product.key === 'water_bottle').unitPriceCents, 2100);
  assert.equal(api.mapPhoneAddonProducts([oldWater], 'playground').find((product) => product.key === 'water_bottle').productId, '1324123');
  console.log('[pass] missing price/SKU or wrong sibling/parent has no fallback; changed prices and Playground behavior are preserved');

  let reads = 0;
  api.setStatement(async (sql, parameters) => {
    reads += 1;
    assert.match(sql, /COALESCE\(expires_at, fetched_at \+ interval '24 hours'\) > now\(\)/);
    const values = parameters.map((parameter) => parameter.value.stringValue);
    assert.ok(values.includes('970411'));
    assert.ok(!values.includes('1324123'));
    assert.ok(!values.includes('Jumpy Vattenflaska'));
    return {
      columnMetadata: Object.keys(newWater).map((name) => ({ name })),
      records: [Object.values(newWater).map((stringValue) => ({ stringValue }))],
    };
  });
  assert.equal((await api.loadPhoneAddonProducts('live')).find((product) => product.key === 'water_bottle').productId, '970411');
  assert.equal(reads, 1);
  console.log('[pass] live selection reads the existing fresh cache once, without old-name lookup or provider calls');

  for (const channel of [undefined, 'kiosk']) {
    const body = { items: [item], customer, confirmDraft: true, idempotencyKey: 'new-water-test', ...(channel ? { channel, paymentTerminalAlias: 'primary' } : {}) };
    const cases = [
      [api.normalizeQuoteRequest(body), api.validateQuoteRequest],
      [api.normalizeDraftRequest({ headers: {} }, body), api.validateDraftRequest],
      [api.normalizeAddProductQuoteRequest(body, 'test-original'), api.validateQuoteRequest],
      [api.normalizeAddProductDraftRequest({ headers: {} }, body, 'test-original'), api.validateAddProductDraftRequest],
    ];
    for (const [request, validate] of cases) {
      assert.equal(validate(request), null);
      const payload = api.buildRollerBookingPayload(request, { customer, externalIdPrefix: 'JY-TEST' });
      assert.equal(payload.items[0].productId, 970411);
      assert.equal(payload.items[0].quantity, 2);
      assert.equal(validate({ ...request, items: [{ ...item, productId: 1324123 }] })?.code, 'product_no_longer_available');
    }
  }
  for (const route of ['/v1/bookings/quote', '/v1/bookings/draft', '/v1/bookings/test-original/add-products/quote', '/v1/bookings/test-original/add-products']) {
    const result = await api.handler({ routeKey: `POST ${route}`, rawPath: route, headers: {}, body: JSON.stringify({ items: [{ ...item, productId: 1324123 }], customer, confirmDraft: true, idempotencyKey: 'retired-water-test' }) });
    assert.equal(JSON.parse(result.body).error?.code, 'product_no_longer_available', route);
    assert.equal(result.statusCode, 400);
  }
  console.log('[pass] phone/kiosk new-entry and add-on payloads keep exact SKU/quantity; stale old-SKU purchases stop before external work');

  const oldItem = { productId: '1324123', productName: 'Jumpy Vattenflaska', parentProductId: '970508', quantity: 1, unitPriceCents: 4900, totalCents: 4900 };
  const historical = api.buildProductDisplayItem(oldItem, { id: '1324123', name: 'Jumpy Vattenflaska', parentProductId: '970508' });
  for (const [key, value] of Object.entries(oldItem)) assert.equal(historical[key], value);
  assert.equal(api.normalizeCosts({ total: 49, amountOwing: 0 }).total, 49);
  for (const flow of ['new_booking', 'add_product']) {
    const record = { flow_type: flow, status: 'payment_pending', payment_attempt_status: 'pending', booking_confirmation_status: 'pending', roller_draft_unique_id: 'old-draft', items_summary: JSON.stringify([oldItem]), total_cents: 4900 };
    const events = [];
    const recovery = load();
    recovery.setRecovery(record, events);
    const body = { action: 'result', outcome: 'approved', idempotencyKey: 'existing-old-draft', prepaymentDraftId: 'jypd_aaaaaaaaaaaaaaaaaa', paymentAttemptId: 'jytp_bbbbbbbbbbbbbbbbbb', rollerDraftUniqueId: 'old-draft' };
    const approved = await recovery.handleDraftFinalize({ headers: {} }, body, 'test-recovery');
    assert.equal(approved.statusCode, 202);
    assert.ok(events.includes('reconcile'));
    assert.equal(events.includes('provisional'), flow === 'new_booking');
    assert.equal(record.total_cents, 4900);
    assert.deepEqual(JSON.parse(record.items_summary), [oldItem]);
    record.status = 'published'; record.booking_confirmation_status = 'confirmed'; record.payment_attempt_status = 'reconciled';
    const status = await recovery.handleDraftFinalize({ headers: {} }, { ...body, action: 'status' }, 'test-recovery');
    assert.equal(status.statusCode, 200);
    assert.equal(JSON.parse(status.body).status, 'confirmed');
  }
  console.log('[pass] old paid item identity/price and already-started draft approval/status remain unchanged');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
