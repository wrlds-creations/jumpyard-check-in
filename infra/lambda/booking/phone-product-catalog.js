'use strict';

// This optional eligibility check must not consume the whole availability request.
const PUBLIC_CHECKOUT_CATALOG_TIMEOUT_MS = 2000;

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
  const abort = new AbortController();
  let timeout;
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(() => {
      abort.abort();
      resolve({ body: null, ok: false, skipped: false, status: 0, timedOut: true });
    }, PUBLIC_CHECKOUT_CATALOG_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, {
          method: 'GET',
          signal: abort.signal,
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
      })(),
      deadline,
    ]);
  } catch {
    return {
      body: null,
      ok: false,
      skipped: false,
      status: 0,
    };
  } finally {
    clearTimeout(timeout);
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

// GH-501 (D0248): entries sell at the kassa's drop-in price. ROLLER's availability lists only the
// web variant per slot, so the drop-in product is the cached Drop-In sibling under the same parent
// priced exactly web + step (Gustav, 2026-10-09: +20 kr per entry, +60 kr per family entry).
const DROP_IN_PRICE_STEP_CENTS = Object.freeze({ entry: 2000, family: 6000 });

function isDropInVariantName(name) {
  return /\bdrop[-\s]?in\b/i.test(String(name ?? ''));
}

function dropInPriceStepCents(type) {
  return Object.prototype.hasOwnProperty.call(DROP_IN_PRICE_STEP_CENTS, type) ? DROP_IN_PRICE_STEP_CENTS[type] : null;
}

// The one cached Drop-In variant priced at web + step; none or several matches return null.
function findDropInSibling(dropInVariants, webPriceCents, stepCents) {
  if (!Array.isArray(dropInVariants) || !Number.isInteger(webPriceCents) || !Number.isInteger(stepCents)) return null;
  const matches = dropInVariants.filter((variant) =>
    stringOrNull(variant?.productId) &&
    isDropInVariantName(variant?.productName) &&
    Number(variant?.priceCents) === webPriceCents + stepCents);
  return matches.length === 1 ? matches[0] : null;
}

// A Drop-In variant is bookable in a slot only when it pairs with the web variant ROLLER allocates there.
function pairDropInWithSlot(parent, session, dropInPriceCents, stepCents) {
  if (!session || !Number.isInteger(stepCents)) return null;
  const web = selectMappedAvailabilityProduct(parent, session);
  if (!web || isDropInVariantName(web.name)) return null;
  const webCost = web.cost === null || web.cost === undefined || web.cost === '' ? NaN : Number(web.cost);
  if (!Number.isFinite(webCost)) return null;
  const webPriceCents = Math.round(webCost * 100);
  if (Number(dropInPriceCents) !== webPriceCents + stepCents) return null;
  return { webPriceCents, webProductId: String(web.id) };
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
};
