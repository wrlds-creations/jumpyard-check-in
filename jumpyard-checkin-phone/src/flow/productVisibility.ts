import type { BuyFlowRecoveryProduct } from './buyFlowRecovery';
import type { NewBookingAvailabilitySlot, NewBookingProduct } from './cloudClient';

export type BaseBookingProduct = NewBookingProduct & {
  type: 'entry' | 'family' | 'combo';
};

export interface VisibleBookingProductSections {
  combo: BaseBookingProduct[];
  entry: BaseBookingProduct[];
  family: BaseBookingProduct[];
  total: number;
}

export function getMaxBookingProductQuantity(product: NewBookingProduct | null) {
  if (!product?.available) return 0;
  if (product.capacityRemaining === null) return 10;

  const unitCapacity = Math.floor(product.capacityRemaining / Math.max(1, product.jumpersPerUnit));

  return Math.max(0, Math.min(10, unitCapacity));
}

export function isBaseBookingProduct(product: NewBookingProduct): product is BaseBookingProduct {
  return product.type === 'entry' || product.type === 'family' || product.type === 'combo';
}

export function isPurchasableBookingProduct(product: NewBookingProduct): product is BaseBookingProduct {
  return (
    isBaseBookingProduct(product) &&
    typeof product.productId === 'string' &&
    product.productId.trim().length > 0 &&
    getMaxBookingProductQuantity(product) > 0
  );
}

export function getVisibleBookingProductSections(
  slot: NewBookingAvailabilitySlot | null
): VisibleBookingProductSections {
  const visibleProducts = slot?.products.filter(isPurchasableBookingProduct) ?? [];

  return {
    combo: visibleProducts.filter((product) => product.type === 'combo'),
    entry: visibleProducts.filter((product) => product.type === 'entry'),
    family: visibleProducts.filter((product) => product.type === 'family'),
    total: visibleProducts.length,
  };
}

export function findRecoveredBookingProduct(
  slot: NewBookingAvailabilitySlot | null,
  recovered: BuyFlowRecoveryProduct | null
) {
  if (!slot || !recovered) return null;
  const candidates = slot.products.filter(isPurchasableBookingProduct);

  if (recovered.productId) {
    const byProductId = candidates.find((product) => product.productId === recovered.productId);
    if (byProductId) return byProductId;
  }

  if (recovered.key) {
    const byKey = candidates.find((product) => product.key === recovered.key);
    if (byKey) return byKey;
  }

  return (
    candidates.find(
      (product) =>
        product.type === recovered.type &&
        product.startTime === recovered.startTime &&
        product.durationMinutes === recovered.durationMinutes
    ) ?? null
  );
}
