'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LIVE_PHONE_BOOKING_PRODUCTS,
  LIVE_PUBLIC_CHECKOUT_CATALOG,
  fetchPublicCheckoutCatalog,
  filterPhoneProductsByPublicCatalog,
  isPhoneAvailabilityProductAvailable,
  selectMappedAvailabilityProduct,
} = require('./phone-product-catalog');

test('maps COMBO60 only to the current Weekday Combo parent and child', () => {
  assert.deepEqual(LIVE_PHONE_BOOKING_PRODUCTS, [
    {
      key: 'COMBO60',
      parentProductId: '1242135',
      productIds: ['1242136'],
      publicCatalogRequired: true,
    },
  ]);
});

test('reads the public checkout catalog with public venue routing and no authorization header', async () => {
  let request = null;
  const result = await fetchPublicCheckoutCatalog('live', async (url, options) => {
    request = { options, url: String(url) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: 1242135, name: 'Weekday Combo' }]),
    };
  });

  assert.equal(request.url, 'https://api.roller.app/api/checkout/boka/products');
  assert.equal(request.options.headers['x-api-key'], LIVE_PUBLIC_CHECKOUT_CATALOG.venueSlug);
  assert.equal(request.options.headers['x-cell-id'], LIVE_PUBLIC_CHECKOUT_CATALOG.cellId);
  assert.equal(request.options.headers['x-checkout-slug'], LIVE_PUBLIC_CHECKOUT_CATALOG.checkoutSlug);
  assert.equal(request.options.headers['x-origin-id'], LIVE_PUBLIC_CHECKOUT_CATALOG.originId);
  assert.equal('authorization' in request.options.headers, false);
  assert.equal(result.ok, true);
});

test('treats catalog request and response-shape failures as retryable provider failures', async () => {
  const unavailable = await fetchPublicCheckoutCatalog('live', async () => {
    throw new Error('network unavailable');
  });
  const invalid = await fetchPublicCheckoutCatalog('live', async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: 1242135 }),
  }));

  assert.deepEqual(unavailable, { body: null, ok: false, skipped: false, status: 0 });
  assert.equal(invalid.ok, false);
});

test('omits a catalog-hidden combo without hiding valid entry products', () => {
  const products = [
    {
      key: 'COMBO60',
      parentProductId: '1242135',
      publicCatalogRequired: true,
      type: 'combo',
    },
    { key: 'E60', parentProductId: '1189805', type: 'entry' },
  ];

  assert.deepEqual(
    filterPhoneProductsByPublicCatalog('live', products, [{ id: 1189805, name: 'Entré 60 min' }]),
    [products[1]],
  );
  assert.deepEqual(
    filterPhoneProductsByPublicCatalog('live', products, [{ id: 1242135, name: 'Weekday Combo' }]),
    products,
  );
  assert.deepEqual(filterPhoneProductsByPublicCatalog('playground', products, []), products);
});

test('selects the mapped Weekday Combo child and rejects an old or unexpected child', () => {
  const session = { allocations: [{ productId: 1242136 }], onlineSalesOpen: true };
  const current = { cost: 450, id: 1242136, isSuspended: false, name: 'Weekday Combo' };
  const old = { cost: 510, id: 1318780, isSuspended: false, name: 'ComboDeal (510 kr)' };

  assert.equal(selectMappedAvailabilityProduct({ products: [old, current] }, session, ['1242136']), current);
  assert.equal(
    selectMappedAvailabilityProduct(
      { products: [old] },
      { allocations: [{ productId: 1318780 }], onlineSalesOpen: true },
      ['1242136'],
    ),
    null,
  );
});

test('shows the combo only when a mapped weekday session is sellable', () => {
  const product = { cost: 450, id: 1242136 };

  assert.equal(isPhoneAvailabilityProductAvailable(null, product, 162), false);
  assert.equal(
    isPhoneAvailabilityProductAvailable({ onlineSalesOpen: false }, product, 162),
    false,
  );
  assert.equal(isPhoneAvailabilityProductAvailable({ onlineSalesOpen: true }, product, 0), false);
  assert.equal(isPhoneAvailabilityProductAvailable({ onlineSalesOpen: true }, product, 162), true);
});
