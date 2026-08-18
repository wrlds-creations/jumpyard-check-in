'use strict';

const LIVE_PUBLIC_CHECKOUT_CATALOG = Object.freeze({
  baseUrl: 'https://api.roller.app',
  cellId: 'e',
  checkoutOrigin: 'https://boka-nackaforum.jumpyard.se',
  checkoutSlug: 'boka',
  originId: '1',
  venueSlug: 'jumpyardnackaforum',
});

const LIVE_PHONE_BOOKING_PRODUCTS = Object.freeze([
  Object.freeze({
    key: 'COMBO60',
    parentProductId: '1242135',
    productIds: Object.freeze(['1242136']),
    publicCatalogRequired: true,
  }),
]);

async function fetchPublicCheckoutCatalog(rollerEnv, fetchImpl = globalThis.fetch) {
  if (rollerEnv !== 'live') {
    return {
      body: null,
      ok: true,
      skipped: true,
      status: 204,
    };
  }

  const catalog = LIVE_PUBLIC_CHECKOUT_CATALOG;
  const url = new URL(`/api/checkout/${catalog.checkoutSlug}/products`, catalog.baseUrl);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        origin: catalog.checkoutOrigin,
        referer: `${catalog.checkoutOrigin}/`,
        'x-api-key': catalog.venueSlug,
        'x-cell-id': catalog.cellId,
        'x-checkout-slug': catalog.checkoutSlug,
        'x-origin-id': catalog.originId,
      },
    });
    const text = await response.text();
    const body = parseJsonOrNull(text);

    return {
      body,
      ok: response.ok && Array.isArray(body),
      skipped: false,
      status: response.status,
    };
  } catch {
    return {
      body: null,
      ok: false,
      skipped: false,
      status: 0,
    };
  }
}

function filterPhoneProductsByPublicCatalog(rollerEnv, products, catalogBody) {
  if (rollerEnv !== 'live') return products;

  const publicParentIds = new Set(
    (Array.isArray(catalogBody) ? catalogBody : [])
      .map((product) => stringOrNull(product?.id ?? product?.parentProductId))
      .filter(Boolean),
  );

  return products.filter((product) => {
    if (product.publicCatalogRequired !== true) return true;
    return publicParentIds.has(String(product.parentProductId));
  });
}

function selectMappedAvailabilityProduct(parent, session, allowedProductIds = []) {
  const products = Array.isArray(parent?.products) ? parent.products : [];
  if (products.length === 0) return null;

  const allowedIds = new Set(
    (Array.isArray(allowedProductIds) ? allowedProductIds : [])
      .map(stringOrNull)
      .filter(Boolean),
  );
  const eligibleProducts = allowedIds.size > 0
    ? products.filter((product) => allowedIds.has(String(product?.id)))
    : products;
  if (eligibleProducts.length === 0) return null;

  const allocationProductId = Array.isArray(session?.allocations)
    ? stringOrNull(session.allocations.find((allocation) => allocation?.productId)?.productId)
    : null;
  const matching = allocationProductId
    ? eligibleProducts.find((product) => String(product?.id) === allocationProductId)
    : null;
  if (matching) return matching;
  if (allocationProductId && allowedIds.size > 0) return null;

  return eligibleProducts.find((product) => product?.isSuspended !== true) ?? eligibleProducts[0];
}

function isPhoneAvailabilityProductAvailable(session, selectedProduct, capacityRemaining) {
  const onlineSalesOpen = session?.onlineSalesOpen !== false;
  return Boolean(
    session &&
      selectedProduct &&
      onlineSalesOpen &&
      (capacityRemaining === null || capacityRemaining > 0),
  );
}

function parseJsonOrNull(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

module.exports = {
  LIVE_PHONE_BOOKING_PRODUCTS,
  LIVE_PUBLIC_CHECKOUT_CATALOG,
  fetchPublicCheckoutCatalog,
  filterPhoneProductsByPublicCatalog,
  isPhoneAvailabilityProductAvailable,
  selectMappedAvailabilityProduct,
};
