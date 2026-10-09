'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DROP_IN_PRICE_STEP_CENTS,
  LIVE_PHONE_BOOKING_PRODUCTS,
  LIVE_PUBLIC_CHECKOUT_CATALOG,
  dropInPriceStepCents,
  fetchPublicCheckoutCatalog,
  filterPhoneProductsByPublicCatalog,
  findDropInSibling,
  isDropInVariantName,
  isPhoneAvailabilityProductAvailable,
  pairDropInWithSlot,
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

// GH-501: Nacka Entré 60 min variants as cached on 2026-10-09 (web and Drop-In siblings).
const E60_DROP_INS = [
  { productId: '1407467', productName: 'Biljetter (Drop-In - 169 kr)', priceCents: 16900 },
  { productId: '1189810', productName: 'Biljetter (Drop-In - 190 kr)', priceCents: 19000 },
  { productId: '1189811', productName: 'Biljetter (Drop-In - 200 kr)', priceCents: 20000 },
  { productId: '1189812', productName: 'Biljetter (Drop-In - 220 kr)', priceCents: 22000 },
  { productId: '1407468', productName: 'Biljetter (Drop-In - 239 kr)', priceCents: 23900 },
  { productId: '1189813', productName: 'Biljetter (Drop-In - 240 kr)', priceCents: 24000 },
];

test('recognises only Drop-In variant names and the confirmed price steps', () => {
  assert.equal(isDropInVariantName('Biljetter (Drop-In - 220 kr)'), true);
  assert.equal(isDropInVariantName('Biljetter (dropin - 220 kr)'), true);
  assert.equal(isDropInVariantName('Biljetter (220 kr)'), false);
  assert.equal(isDropInVariantName('Dropinsats'), false);
  assert.equal(isDropInVariantName(null), false);
  assert.deepEqual({ ...DROP_IN_PRICE_STEP_CENTS }, { entry: 2000, family: 6000 });
  assert.equal(dropInPriceStepCents('entry'), 2000);
  assert.equal(dropInPriceStepCents('family'), 6000);
  assert.equal(dropInPriceStepCents('combo'), null);
  assert.equal(dropInPriceStepCents('toString'), null);
});

test('pairs each web price with the one Drop-In sibling at web + step, never by equal price', () => {
  assert.equal(findDropInSibling(E60_DROP_INS, 18000, 2000).productId, '1189811');
  assert.equal(findDropInSibling(E60_DROP_INS, 20000, 2000).productId, '1189812');
  assert.equal(findDropInSibling(E60_DROP_INS, 22000, 2000).productId, '1189813');
  assert.equal(findDropInSibling(E60_DROP_INS, 14900, 2000).productId, '1407467');
  assert.equal(findDropInSibling(E60_DROP_INS, 25000, 2000), null, 'a web price without a pair keeps the web variant');
  assert.equal(findDropInSibling(E60_DROP_INS, 20000, null), null);
  assert.equal(findDropInSibling(undefined, 20000, 2000), null);
  const duplicated = [...E60_DROP_INS, { productId: '9999999', productName: 'Biljetter (Drop-In - 220 kr)', priceCents: 22000 }];
  assert.equal(findDropInSibling(duplicated, 20000, 2000), null, 'an ambiguous pair keeps the web variant');
  const webNamed = [{ productId: '1189809', productName: 'Biljetter (220 kr)', priceCents: 22000 }];
  assert.equal(findDropInSibling(webNamed, 20000, 2000), null, 'a web variant is never a Drop-In sibling');
  const family = [{ productId: '1189822', productName: 'Biljetter (Drop-In - 720 kr)', priceCents: 72000 }];
  assert.equal(findDropInSibling(family, 66000, 6000).productId, '1189822');
  assert.equal(findDropInSibling(family, 66000, 2000), null, 'a family entry uses its own step');
});

test('accepts a Drop-In id only in the slot whose allocated web variant it pairs with', () => {
  const parent = {
    parentProductId: '1189805',
    products: [
      { id: '1189807', name: 'Biljetter (180 kr)', cost: 180 },
      { id: '1189808', name: 'Biljetter (200 kr)', cost: 200 },
      { id: '1189809', name: 'Biljetter (220 kr)', cost: 220 },
    ],
  };
  const morning = { startTime: '10:00', allocations: [{ productId: '1189808' }] };
  const afternoon = { startTime: '13:00', allocations: [{ productId: '1189809' }] };

  assert.deepEqual(pairDropInWithSlot(parent, afternoon, 24000, 2000), { webPriceCents: 22000, webProductId: '1189809' });
  assert.deepEqual(pairDropInWithSlot(parent, morning, 22000, 2000), { webPriceCents: 20000, webProductId: '1189808' });
  assert.equal(pairDropInWithSlot(parent, afternoon, 22000, 2000), null, 'a cheaper tier is rejected at a peak slot');
  assert.equal(pairDropInWithSlot(parent, morning, 24000, 2000), null);
  assert.equal(pairDropInWithSlot(parent, null, 24000, 2000), null);
  assert.equal(pairDropInWithSlot(parent, afternoon, 24000, null), null);
  const dropInAllocated = {
    parentProductId: '1189805',
    products: [{ id: '1189813', name: 'Biljetter (Drop-In - 240 kr)', cost: 240 }],
  };
  assert.equal(
    pairDropInWithSlot(dropInAllocated, { startTime: '13:00', allocations: [{ productId: '1189813' }] }, 26000, 2000),
    null,
    'a Drop-In allocation is never stepped up again',
  );
  const noCost = { parentProductId: '1189805', products: [{ id: '1189809', name: 'Biljetter (220 kr)', cost: null }] };
  assert.equal(pairDropInWithSlot(noCost, afternoon, 2000, 2000), null);
});
