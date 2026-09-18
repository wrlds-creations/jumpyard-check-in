'use client';
import { PackageContentRows } from '@/components/PackageContentRows';
import { scalePackageContents } from '@/flow/packageContents';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlowScreen, StableLoadingRegion, FlowTransitionBoundary } from '@/components/FlowTransition';
import { AlertCircle, ArrowLeft, Check, ChevronDown, Minus, Plus, RefreshCw, X } from 'lucide-react';
import {
  CloudBookingError,
  createDraftBooking,
  getNewBookingAvailability,
  lookupBooking,
  quoteNewBooking,
  type NewBookingAvailability,
  type NewBookingCustomer,
  type NewBookingDiscountCodeInput,
  type NewBookingDraftResult,
  type NewBookingGiftCardInput,
  type NewBookingItemRequest,
  type NewBookingProduct,
  type NewBookingQuote,
} from '@/flow/cloudClient';
import { getPaymentOptionInputState, type PaymentOptionInputState } from '@/flow/paymentOptionFeedback';
import { PaymentCodeRejectedDialog } from '@/components/PaymentCodeRejectedDialog';
import type { Addon, AddonId, Booking } from '@/flow/types';
import { ADDON_CATALOG_CONFIG, BUY_ENTRY_ADDON_IDS } from '@/flow/addonCatalog';
import { resolvePaidConfirmation } from '@/flow/paidBookingConfirmation';
import {
  findRecoveredBookingProduct,
  getMaxBookingProductQuantity,
  getVisibleBookingProductSections,
  isPurchasableBookingProduct,
} from '@/flow/productVisibility';
import {
  clearBuyFlowRecovery,
  isPrePaymentBuyFlowRecovery,
  readBuyFlowRecovery,
  writeBuyFlowRecovery,
  type BuyFlowRecoveryAddonQty,
  type BuyFlowRecoveryBuyStep,
  type BuyFlowRecoveryContact,
  type BuyFlowRecoveryProduct,
  type BuyFlowRecoverySnapshot,
  type BuyFlowRecoveryStep,
} from '@/flow/buyFlowRecovery';
import {
  approvePaymentRecovery,
  clearPaymentRecoveryAfterCompletion,
  readPaymentRecovery,
} from '@/flow/paymentRecovery';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { RollerPaymentDropIn } from '@/components/RollerPaymentDropIn';
import { SkyRiderAttest } from '@/components/SkyRiderAttest';
import { AddonChoices, type AddonChoicesHandle } from '@/components/AddonChoices';
import { PhonePaymentConfirmation } from '@/components/PhonePaymentConfirmation';
import { resolvePurchasePreparation } from '@/flow/purchasePreparation';

interface BuyTicketsProps {
  recoverySnapshot?: BuyFlowRecoverySnapshot | null;
  inlineExitVisible?: boolean;
  onBack: () => void;
  onBookingReady: (booking: Booking, preparation?: { signal: AbortSignal; isCurrent: () => boolean }) => Promise<() => void | Promise<void>>;
  onRequestExit?: () => void;
  onStepChange?: (step: BuyTicketsStep) => void;
}

export type BuyTicketsStep = BuyFlowRecoveryBuyStep | 'PAYMENT' | 'APPROVED' | 'PENDING';

const BUY_PROGRESS_ICONS: JumpyardIconName[] = [
  'admission-ticket',
  'addons-bag',
  'payment-card',
  'safety-check',
  'success-check',
];

interface BuyAddonEntry {
  id: AddonId;
  label: string;
  price: number | null;
  unit: string;
  maxPerGuest: number;
  icon: JumpyardIconName;
  rollerProductId: number | null;
  requiresAvailability: boolean;
}

type AddonQuantityMap = Record<AddonId, number>;
// Membership codes are redeemed through the existing discountCodes payload until a membership route exists.
type PaymentOptionType = 'discount' | 'member' | 'giftCard';

const PAYMENT_OPTION_CODE_MAX_LENGTH = 32;
const PAYMENT_OPTION_TYPES: PaymentOptionType[] = ['discount', 'member', 'giftCard'];
const PAYMENT_OPTION_TYPE_ICONS: Record<PaymentOptionType, 'points-star' | 'profile' | 'presentkort'> = {
  discount: 'points-star',
  member: 'profile',
  giftCard: 'presentkort',
};
const SOCKS_UNLIMITED_MAX = Number.MAX_SAFE_INTEGER;
const PAYMENT_OPTION_GROUP_CLASS =
  'flex items-stretch overflow-hidden rounded-xl border bg-surface transition-all focus-within:ring-2 focus-within:ring-primary/10';

const createEmptyAddonQty = (): AddonQuantityMap => ({
  skyrider: 0,
  connected: 0,
  coffee: 0,
  extra_person: 0,
  lock: 0,
  socks: 0,
  water_bottle: 0,
});

function generateSlots(): string[] {
  const now = new Date();
  const startMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
  const slots: string[] = [];

  for (let minutes = startMin; slots.length < 3 && minutes < 24 * 60; minutes += 30) {
    const hours = Math.floor(minutes / 60);
    slots.push(`${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }

  return slots;
}

function formatTodayDate(lang: 'sv' | 'en') {
  return new Intl.DateTimeFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Stockholm',
  }).format(new Date());
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)} kr`;
}

function formatBasketLineLabel(label: string) {
  return label.replace(/\s*\u00C2?\u00B7\s*/g, ' ');
}

function buildGiftCardInputs(value: string): NewBookingGiftCardInput[] {
  const giftCardNumber = value.trim();
  return giftCardNumber ? [{ giftCardNumber }] : [];
}

function buildDiscountCodeInputs(value: string): NewBookingDiscountCodeInput[] {
  const code = value.trim();
  return code ? [{ code }] : [];
}

function clampPaymentOptionCode(value: string) {
  return value.slice(0, PAYMENT_OPTION_CODE_MAX_LENGTH);
}

function getPaymentOptionGroupClass(state: PaymentOptionInputState) {
  if (state === 'rejected') return `${PAYMENT_OPTION_GROUP_CLASS} border-danger/40 focus-within:border-danger focus-within:ring-danger/10`;
  if (state === 'applied') return `${PAYMENT_OPTION_GROUP_CLASS} border-primary/40 bg-primary/5`;
  return `${PAYMENT_OPTION_GROUP_CLASS} border-border focus-within:border-primary`;
}

function getGiftCardAppliedAmount(quote: NewBookingQuote | null) {
  if (!quote?.giftCards || quote.giftCards.requestedCount === 0 || quote.giftCards.errors.length > 0) return null;
  if (quote.giftCards.totalApplied !== null) return quote.giftCards.totalApplied;
  if (quote.costs.total === null || quote.costs.amountOwing === null) return null;
  return Math.max(0, quote.costs.total - quote.costs.amountOwing);
}

function getDiscountCodeAppliedAmount(quote: NewBookingQuote | null) {
  if (!quote?.discountCodes || quote.discountCodes.requestedCount === 0 || quote.discountCodes.errors.length > 0) return null;
  if (quote.discountCodes.totalApplied !== null) return quote.discountCodes.totalApplied;
  return quote.costs.discount ?? null;
}

function hasPaymentOptionQuoteErrors(quote: NewBookingQuote) {
  return (quote.giftCards?.errors.length ?? 0) > 0 || (quote.discountCodes?.errors.length ?? 0) > 0;
}

function buildProductLabelMap(
  selectedProduct: NewBookingProduct | null,
  buyAddons: BuyAddonEntry[]
) {
  const labels = new Map<string, string>();
  if (selectedProduct?.productId !== null && selectedProduct?.productId !== undefined) {
    labels.set(String(selectedProduct.productId), selectedProduct.label);
  }
  for (const addon of buyAddons) {
    if (addon.rollerProductId !== null) labels.set(String(addon.rollerProductId), addon.label);
  }
  return labels;
}

function formatBuyFlowError(
  error: unknown,
  labels: ReturnType<typeof useTranslation>['t']['buy'],
  productLabels: Map<string, string>,
  fallback: string
) {
  if (!(error instanceof CloudBookingError)) return fallback;
  if (error.code === 'customer_phone_preservation_unverified') return error.code;

  const productUnavailable = /^Product\s+(\d+)\s+is not available for\s+([\d-]+)\s+([\d:]+)\.?$/i.exec(error.message);
  if (productUnavailable) {
    const productLabel = productLabels.get(productUnavailable[1]) ?? labels.unavailableProductFallback;
    const startTime = productUnavailable[3].slice(0, 5);
    return `${productLabel} ${labels.unavailableProductPrefix} ${startTime}. ${labels.unavailableProductAction}`;
  }

  return error.message;
}

function getDraftAmountOwing(draft: NewBookingDraftResult | null) {
  return draft?.prepayment?.amountOwing ?? draft?.draft.costs.amountOwing ?? null;
}

function getDraftPaymentAttemptId(draft: NewBookingDraftResult | null) {
  return draft?.prepayment?.prepaymentDraftId ?? draft?.draft.uniqueId ?? draft?.draft.bookingReference ?? '';
}

function getDraftRecoveryStep(step: BuyTicketsStep, paymentApprovedForSync: boolean): BuyFlowRecoveryStep {
  if (step === 'PENDING') return 'PENDING';
  if (paymentApprovedForSync) return 'PAYMENT';
  return 'PAYMENT';
}

function writeDraftRecovery(
  currentFlowStep: BuyFlowRecoveryStep,
  draft: NewBookingDraftResult | null,
  selectedProduct: NewBookingProduct | null,
  selectedTime: string | null,
  jumperCount: number,
  paymentApproved: boolean
) {
  if (!draft || !selectedProduct || !selectedTime) return;

  const amountOwing = getDraftAmountOwing(draft);
  const bookingReference = draft.draft.bookingReference ?? null;
  const uniqueId = draft.draft.uniqueId ?? null;
  const previous = readBuyFlowRecovery();

  writeBuyFlowRecovery({
    addonQty: previous?.addonQty,
    alreadyHasApprovedSocks: previous?.alreadyHasApprovedSocks,
    alreadyHasWaterBottle: previous?.alreadyHasWaterBottle,
    bookingReference,
    contact: previous?.contact,
    currentFlowStep,
    draftState: {
      amountOwing,
      bookingReference,
      paymentApproved,
      paymentRequired: amountOwing === null || amountOwing > 0,
      prepaymentDraftId: draft.prepayment?.prepaymentDraftId ?? null,
      status: draft.prepayment?.status ?? null,
      uniqueId,
    },
    draftUniqueId: uniqueId,
    jumperCount,
    paymentOptionsHadValues: previous?.paymentOptionsHadValues,
    quantity: previous?.quantity,
    selectedProduct: {
      durationMinutes: selectedProduct.durationMinutes,
      key: selectedProduct.key,
      label: selectedProduct.label,
      productId: selectedProduct.productId,
      startTime: selectedProduct.startTime,
      type: selectedProduct.type === 'family' || selectedProduct.type === 'combo' ? selectedProduct.type : 'entry',
      unitPrice: selectedProduct.unitPrice,
    },
    selectedStartTime: selectedTime,
    skyriderConsentConfirmed: previous?.skyriderConsentConfirmed,
  });
}

function getCapacityRemaining(product: NewBookingProduct | null) {
  if (!product?.available) return 0;
  return product.capacityRemaining;
}

function getCapacityLabel(product: NewBookingProduct | null, spotsAvailable: string, spotsLeft: string) {
  const capacityRemaining = getCapacityRemaining(product);
  return capacityRemaining === null ? spotsAvailable : `${capacityRemaining} ${spotsLeft}`;
}

function getProductDurationLabel(product: NewBookingProduct | null) {
  const duration = product?.label.match(/\b\d+\s*min\b/i)?.[0];
  if (duration) return duration.replace(/\s+/, ' ');
  if (product?.durationMinutes && product.durationMinutes > 0) return `${product.durationMinutes} min`;
  return product?.label ?? '';
}

function getProductIconName(product: NewBookingProduct | null): JumpyardIconName {
  if (product?.type === 'combo') return 'combo-pizza';
  if (product?.type === 'family') return 'group';
  return 'admission-ticket';
}

function getProductCardTitle(product: NewBookingProduct) {
  return product.type === 'combo' ? product.label : getProductDurationLabel(product);
}

function getProductSectionLabel(
  product: NewBookingProduct | null,
  labels: ReturnType<typeof useTranslation>['t']['buy']
) {
  if (product?.type === 'combo') return labels.sectionCombo;
  if (product?.type === 'family') return labels.sectionFamily;
  return labels.sectionEntry;
}

function getProductUnitBadgeLabel(
  product: NewBookingProduct,
  labels: ReturnType<typeof useTranslation>['t']['buy']
) {
  if (product.type === 'combo') return labels.comboPackageNote;
  if (product.type === 'family') return labels.familyNote;
  return labels.perPersonNote;
}

function getQuantityTitle(
  product: NewBookingProduct,
  labels: ReturnType<typeof useTranslation>['t']['buy']
) {
  if (product.type === 'combo') return labels.quantityComboPackages;
  if (product.type === 'family') return labels.quantityPackages;
  return labels.quantityJumpers;
}

function getBasketProductLabel(
  product: NewBookingProduct,
  labels: ReturnType<typeof useTranslation>['t']['buy']
) {
  if (product.type === 'combo') return product.label;
  return `${getProductDurationLabel(product)} · ${getProductSectionLabel(product, labels)}`;
}

function getComboInclusions(labels: ReturnType<typeof useTranslation>['t']['buy']) {
  return [
    { icon: 'combo-two-people' as JumpyardIconName, label: labels.comboPeople },
    { icon: 'combo-60-min' as JumpyardIconName, label: labels.comboDuration },
    { icon: 'combo-pizza' as JumpyardIconName, label: labels.comboPizza },
  ];
}

function getJumperCount(product: NewBookingProduct | null, nextQuantity: number) {
  return product ? nextQuantity * Math.max(1, product.jumpersPerUnit) : nextQuantity;
}

function getAddonMaxQuantity(
  addon: BuyAddonEntry,
  addonAvailability: NewBookingProduct | null,
  jumperCount: number
) {
  if (addon.id === 'socks') return SOCKS_UNLIMITED_MAX;
  const baseMax = Math.max(1, jumperCount * addon.maxPerGuest);
  if (!addon.requiresAvailability) return baseMax;
  if (!addonAvailability?.available || !addonAvailability.productId) return 0;
  if (addonAvailability.capacityRemaining === null) return baseMax;
  return Math.max(0, Math.min(baseMax, addonAvailability.capacityRemaining));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function canStartPayment(draft: NewBookingDraftResult) {
  const config = draft.paymentSession.config;
  return Boolean(
    draft.paymentSession.jwt?.trim() &&
      draft.paymentSession.jwtPresent &&
      config?.available &&
      config.apiUrl &&
      config.configurationId &&
      config.integrationId
  );
}

function getAddonLabel(id: AddonId, products: ReturnType<typeof useTranslation>['t']['addons']['products']) {
  switch (id) {
    case 'skyrider':
      return products.skyriderLabel;
    case 'connected':
      return products.connectedLabel;
    case 'coffee':
      return products.coffeeLabel;
    case 'extra_person':
      return products.extraPersonLabel;
    case 'lock':
      return products.lockLabel;
    case 'socks':
      return products.socksLabel;
    case 'water_bottle':
      return products.waterBottleLabel;
  }
}

function getAddonUnit(id: AddonId, labels: ReturnType<typeof useTranslation>['t']['addons']) {
  if (id === 'skyrider' || id === 'connected') return labels.perJumper;
  if (id === 'extra_person') return labels.perPerson;
  return labels.each;
}

function numberProductId(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isKnownBuyAddonId(value: string): value is AddonId {
  return BUY_ENTRY_ADDON_IDS.includes(value as AddonId);
}

function getDynamicAddonProduct(slot: NewBookingAvailability['slots'][number] | null, id: AddonId) {
  return slot?.products.find((product) => product.type === 'addon' && product.key === id) ?? null;
}

function getAddonAvailabilityById(slot: NewBookingAvailability['slots'][number] | null) {
  const byId = new Map<AddonId, NewBookingProduct>();
  for (const product of slot?.products ?? []) {
    if (product.type === 'addon' && isKnownBuyAddonId(product.key)) {
      byId.set(product.key, product);
    }
  }
  return byId;
}

function getBuyAddonEntriesForSlot(
  slot: NewBookingAvailability['slots'][number] | null,
  labels: ReturnType<typeof useTranslation>['t']['addons'],
): BuyAddonEntry[] {
  return BUY_ENTRY_ADDON_IDS.map((id) => {
    const config = ADDON_CATALOG_CONFIG[id];
    const dynamicProduct = getDynamicAddonProduct(slot, id);
    return {
      id,
      icon: config.icon as JumpyardIconName,
      label: getAddonLabel(id, labels.products),
      maxPerGuest: config.maxPerGuest,
      price: dynamicProduct?.unitPrice ?? null,
      requiresAvailability: config.requiresAvailability,
      rollerProductId: numberProductId(dynamicProduct?.productId) ?? config.rollerProductId,
      unit: getAddonUnit(id, labels),
    };
  });
}

function isPricedAddon(addon: BuyAddonEntry): addon is BuyAddonEntry & { price: number; rollerProductId: number } {
  return addon.price !== null && addon.rollerProductId !== null;
}

function toRecoveryProduct(product: NewBookingProduct): BuyFlowRecoveryProduct {
  return {
    durationMinutes: product.durationMinutes,
    key: product.key,
    label: product.label,
    productId: product.productId,
    startTime: product.startTime,
    type: product.type === 'family' || product.type === 'combo' ? product.type : 'entry',
    unitPrice: product.unitPrice,
  };
}

function getRecoveredQuantity(snapshot: BuyFlowRecoverySnapshot, product: NewBookingProduct) {
  if (snapshot.quantity && snapshot.quantity > 0) return snapshot.quantity;
  if (!snapshot.jumperCount || snapshot.jumperCount <= 0) return 1;
  if (product.jumpersPerUnit > 1) {
    return Math.ceil(snapshot.jumperCount / Math.max(1, product.jumpersPerUnit));
  }
  return snapshot.jumperCount;
}

function clampRecoveredAddonQty(
  recovered: BuyFlowRecoveryAddonQty | undefined,
  slot: NewBookingAvailability['slots'][number] | null,
  buyAddons: BuyAddonEntry[],
  jumperCount: number
) {
  const addonAvailabilityById = getAddonAvailabilityById(slot);
  const next = createEmptyAddonQty();

  for (const addon of buyAddons) {
    const rawQty = recovered?.[addon.id] ?? 0;
    const qty = Number.isInteger(rawQty) ? rawQty : 0;
    const max = getAddonMaxQuantity(addon, addonAvailabilityById.get(addon.id) ?? null, jumperCount);
    if (qty > 0 && max > 0 && isPricedAddon(addon)) {
      next[addon.id] = Math.min(qty, max);
    }
  }

  return next;
}

function getSelectedAddonsForState(
  addonQty: AddonQuantityMap,
  slot: NewBookingAvailability['slots'][number] | null,
  buyAddons: BuyAddonEntry[],
  jumperCount: number
) {
  const addonAvailabilityById = getAddonAvailabilityById(slot);
  return buyAddons.flatMap((addon): Addon[] => {
    const max = getAddonMaxQuantity(addon, addonAvailabilityById.get(addon.id) ?? null, jumperCount);
    const qty = Math.min(addonQty[addon.id], max);
    if (qty <= 0 || !isPricedAddon(addon)) return [];

    return [
      {
        id: addon.id,
        label: addon.label,
        price: addon.price,
        qty,
        requiresAvailability: addon.requiresAvailability,
        rollerProductId: addon.rollerProductId,
      },
    ];
  });
}

function buildItemsForState(
  availability: NewBookingAvailability,
  product: NewBookingProduct,
  quantity: number,
  selectedAddons: Addon[]
): NewBookingItemRequest[] {
  const productId = Number(product.productId);
  if (!Number.isInteger(productId) || productId <= 0) return [];

  return [
    {
      bookingDate: availability.date,
      productId,
      quantity,
      requiresAvailability: true,
      startTime: product.startTime,
    },
    ...selectedAddons.flatMap((addon) => {
      const addonProductId = Number(addon.rollerProductId);
      if (!Number.isInteger(addonProductId) || addonProductId <= 0) return [];
      return [
        {
          bookingDate: availability.date,
          productId: addonProductId,
          quantity: addon.qty,
          requiresAvailability: addon.requiresAvailability === true,
          startTime: product.startTime,
        },
      ];
    }),
  ];
}

function hasSavedPaymentOptions(snapshot: BuyFlowRecoverySnapshot) {
  return snapshot.paymentOptionsHadValues === true;
}

function getSafeContact(contact: BuyFlowRecoveryContact | null | undefined): BuyFlowRecoveryContact {
  return {
    email: contact?.email ?? '',
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    phone: contact?.phone ?? '',
  };
}

function isValidRecoveredCustomer(contact: BuyFlowRecoveryContact) {
  return (
    contact.firstName.trim().length > 0 &&
    contact.lastName.trim().length > 0 &&
    isValidEmail(contact.email)
  );
}

function toRecoveredCustomer(contact: BuyFlowRecoveryContact): NewBookingCustomer {
  return {
    email: contact.email.trim(),
    firstName: contact.firstName.trim(),
    lastName: contact.lastName.trim(),
    phone: contact.phone.trim() || undefined,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBuyProgressIndex(step: BuyTicketsStep) {
  if (step === 'ADDONS' || step === 'SKYRIDER_ATTEST') return 1;
  if (step === 'CONTACT' || step === 'REVIEW' || step === 'PAYMENT' || step === 'APPROVED' || step === 'PENDING') return 2;
  return 0;
}

function isBuyStep(step: BuyTicketsStep): step is BuyFlowRecoveryBuyStep {
  return step !== 'PAYMENT' && step !== 'APPROVED' && step !== 'PENDING';
}

function toRecoveryAddonQty(addonQty: AddonQuantityMap): BuyFlowRecoveryAddonQty {
  const next: BuyFlowRecoveryAddonQty = {};
  for (const id of BUY_ENTRY_ADDON_IDS) {
    if (addonQty[id] > 0) next[id] = addonQty[id];
  }
  return next;
}

function AvailabilityLoadingCard({ selectedTime }: { selectedTime: string | null }) {
  const { t } = useTranslation();

  return (
    <div
      className="bg-white border border-border rounded-2xl p-6 text-center"
      role="status"
      aria-live="polite"
      data-availability-loading="true"
    >
      <div className="relative mx-auto mb-4 h-20 w-20">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white border border-border shadow-sm">
          <JumpyardIcon name="jump" className="h-12 w-12 animate-pulse" />
        </div>
      </div>
      <h3 className="text-lg font-black italic uppercase text-foreground">
        {t.buy.loadingAvailabilityTitle}
      </h3>
      <p className="mt-2 text-sm text-muted">
        {selectedTime ? `${t.buy.loadingAvailabilityDesc} ${selectedTime}` : t.buy.loadingAvailabilityGeneric}
      </p>
    </div>
  );
}

function BuyEntryProgress({ step }: { step: BuyTicketsStep }) {
  const { t } = useTranslation();
  const labels = [
    t.buyProgress.entry,
    t.buyProgress.addons,
    t.buyProgress.payment,
    t.buyProgress.safety,
    t.buyProgress.done,
  ];
  const current = getBuyProgressIndex(step);
  const pct = labels.length > 1 ? (current / (labels.length - 1)) * 100 : 0;
  const gridTemplateColumns = `repeat(${labels.length}, minmax(0, 1fr))`;

  return (
    <div className="w-full mb-3" data-buy-progress-step={step}>
      <div className="relative">
        <div className="absolute top-4 left-[10%] right-[10%] h-0.5 bg-surface-strong" />
        <div
          className="absolute top-4 left-[10%] h-0.5 bg-primary transition-all duration-500"
          style={{ width: `calc(${pct * 0.8}%)` }}
        />
        <div className="relative z-10 grid" style={{ gridTemplateColumns }}>
          {labels.map((label, index) => (
            <div key={label} className="flex min-w-0 flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${
                  index < current
                    ? 'bg-white border-primary shadow-sm'
                    : index === current
                      ? 'bg-white border-primary shadow-sm ring-4 ring-primary/15'
                      : 'bg-surface border-border opacity-45'
                }`}
              >
                <JumpyardIcon name={BUY_PROGRESS_ICONS[index]} className="w-6 h-6" />
              </div>
              <span
                className={`w-full whitespace-nowrap text-center text-[8px] font-bold italic uppercase leading-tight transition-colors ${
                  index <= current ? 'text-foreground' : 'text-muted'
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const BuyTickets = ({
  recoverySnapshot = null,
  inlineExitVisible = false,
  onBack,
  onBookingReady,
  onRequestExit,
  onStepChange,
}: BuyTicketsProps) => {
  const { lang, t } = useTranslation();
  const slots = useMemo(() => generateSlots(), []);
  const restoringPrePaymentRef = useRef(false);
  const restoredSnapshotUpdatedAtRef = useRef<string | null>(null);
  const todayLabel = useMemo(
    () => `${t.buy.selectTimeToday}, ${formatTodayDate(lang)}`,
    [lang, t.buy.selectTimeToday]
  );

  const [step, setStep] = useState<BuyTicketsStep>('TIMESLOT');
  const [availability, setAvailability] = useState<NewBookingAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<NewBookingProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addonQty, setAddonQty] = useState<AddonQuantityMap>(() => createEmptyAddonQty());
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [giftCardNumber, setGiftCardNumber] = useState('');
  const [clipCardCode, setClipCardCode] = useState('');
  const [paymentOptionType, setPaymentOptionType] = useState<PaymentOptionType>('discount');
  const [codeRejectedDialogOpen, setCodeRejectedDialogOpen] = useState(false);
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);
  const [checkoutBreakdownOpen, setCheckoutBreakdownOpen] = useState(false);
  const [skyriderConsentConfirmed, setSkyriderConsentConfirmed] = useState(false);
  const [alreadyHasApprovedSocks, setAlreadyHasApprovedSocks] = useState(false);
  const [alreadyHasWaterBottle, setAlreadyHasWaterBottle] = useState(false);
  const addonChoicesRef = useRef<AddonChoicesHandle>(null);
  const [quote, setQuote] = useState<NewBookingQuote | null>(null);
  const [draft, setDraft] = useState<NewBookingDraftResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const displayedSubmitError = submitError === 'customer_phone_preservation_unverified'
    ? t.buy.contactVerificationFailed
    : submitError;
  const [paymentSyncing, setPaymentSyncing] = useState(false);
  const [paymentSyncError, setPaymentSyncError] = useState<string | null>(null);
  const [paymentApprovedForSync, setPaymentApprovedForSync] = useState(false);
  const [paymentNavigationLocked, setPaymentNavigationLocked] = useState(false);
  const [paymentContinuePending, setPaymentContinuePending] = useState(false);
  const [paymentReadyForSafety, setPaymentReadyForSafety] = useState(false);
  const [paymentFailure, setPaymentFailure] = useState<'failed' | 'unknown' | null>(null);
  const [paymentStatusChecking, setPaymentStatusChecking] = useState(false);
  const paymentStatusCheckingRef = useRef(false);
  const activePaymentAttemptRef = useRef<string | null>(null);
  const paymentResolutionStartedRef = useRef(false);
  const paymentContinuationRef = useRef<(() => void | Promise<void>) | null>(null);
  const paymentContinueRequestedRef = useRef(false);
  const paymentPreparationAbortRef = useRef<AbortController | null>(null);
  const quoteRequestVersionRef = useRef(0);
  const appliedQuoteRef = useRef<NewBookingQuote | null>(null);
  const quoteOperationInFlightRef = useRef(false);
  const [applyingCodes, setApplyingCodes] = useState(false);
  const invalidateQuote = useCallback(() => {
    quoteRequestVersionRef.current += 1;
    appliedQuoteRef.current = null;
    setQuote(null);
    return quoteRequestVersionRef.current;
  }, []);

  useEffect(() => () => {
    quoteRequestVersionRef.current += 1;
    appliedQuoteRef.current = null;
  }, []);

  useEffect(() => {
    activePaymentAttemptRef.current = getDraftPaymentAttemptId(draft);
    return () => {
      activePaymentAttemptRef.current = null;
    };
  }, [draft]);

  useEffect(() => () => paymentPreparationAbortRef.current?.abort(), []);

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  useEffect(() => () => {
    onStepChange?.('TIMESLOT');
  }, [onStepChange]);

  const selectedSlot = availability?.slots.find((slot) => slot.startTime === selectedTime) ?? null;
  const visibleProductSections = getVisibleBookingProductSections(selectedSlot);
  const comboProducts = visibleProductSections.combo;
  const entryProducts = visibleProductSections.entry;
  const familyProducts = visibleProductSections.family;
  const maxQuantity = getMaxBookingProductQuantity(selectedProduct);
  const jumperCount = getJumperCount(selectedProduct, quantity);
  const selectedPackageContents = scalePackageContents(selectedProduct?.packageContents, quantity);
  const buyAddons = useMemo<BuyAddonEntry[]>(
    () => getBuyAddonEntriesForSlot(selectedSlot, t.addons),
    [selectedSlot, t.addons]
  );
  const addonAvailabilityById = useMemo(() => getAddonAvailabilityById(selectedSlot), [selectedSlot]);
  const getBuyAddonMax = (addon: BuyAddonEntry, nextJumperCount = jumperCount) =>
    getAddonMaxQuantity(addon, addonAvailabilityById.get(addon.id) ?? null, nextJumperCount);
  const selectedAddons: Addon[] = buyAddons.flatMap((addon) => {
    if (addonQty[addon.id] <= 0 || getBuyAddonMax(addon) <= 0 || !isPricedAddon(addon)) return [];

    return [
      {
        id: addon.id,
        label: addon.label,
        price: addon.price,
        qty: Math.min(addonQty[addon.id], getBuyAddonMax(addon)),
        requiresAvailability: addon.requiresAvailability,
        rollerProductId: addon.rollerProductId,
      },
    ];
  });
  const addonsTotal = selectedAddons.reduce((total, addon) => total + addon.price * addon.qty, 0);
  const skyriderSelected = selectedAddons.some((addon) => addon.id === 'skyrider');
  const entryTotal = (selectedProduct?.unitPrice ?? 0) * quantity;
  const basketEstimateTotal = entryTotal + addonsTotal;
  const shouldPrecheckBasketAvailability = selectedProduct !== null;
  const giftCardInputs = buildGiftCardInputs(giftCardNumber);
  const discountCodeInputs = buildDiscountCodeInputs(clipCardCode);
  const productLabels = buildProductLabelMap(selectedProduct, buyAddons);
  const selectedProductDurationLabel = getProductDurationLabel(selectedProduct);
  const giftCardAppliedAmount = getGiftCardAppliedAmount(quote);
  const discountCodeAppliedAmount = getDiscountCodeAppliedAmount(quote);
  const giftCardInputState = getPaymentOptionInputState(giftCardNumber, quote?.giftCards, giftCardAppliedAmount);
  const clipCardInputState = getPaymentOptionInputState(clipCardCode, quote?.discountCodes, discountCodeAppliedAmount);
  const paymentOptionValue = paymentOptionType === 'giftCard' ? giftCardNumber : clipCardCode;
  const paymentOptionState = paymentOptionType === 'giftCard' ? giftCardInputState : clipCardInputState;
  const paymentOptionAppliedAmount = paymentOptionType === 'giftCard' ? giftCardAppliedAmount : discountCodeAppliedAmount;
  const paymentOptionFieldLabel =
    paymentOptionType === 'giftCard'
      ? t.buy.giftCardLabel
      : paymentOptionType === 'member'
        ? t.buy.memberCodeLabel
        : t.buy.clipCardLabel;
  const paymentOptionPlaceholder =
    paymentOptionType === 'giftCard'
      ? t.buy.giftCardPlaceholder
      : paymentOptionType === 'member'
        ? t.buy.memberCodePlaceholder
        : t.buy.clipCardPlaceholder;
  const paymentInputsHaveValues = Boolean(giftCardNumber.trim() || clipCardCode.trim());
  const paymentInputsBlockingErrors = giftCardInputState === 'rejected' || clipCardInputState === 'rejected';
  const draftAmountOwing = getDraftAmountOwing(draft);
  const noPaymentRequired = draftAmountOwing !== null && draftAmountOwing <= 0;
  const showPaymentSyncCard = paymentApprovedForSync || paymentSyncing || Boolean(paymentSyncError);
  const backNavigationLocked =
    step === 'APPROVED' ||
    (step === 'PAYMENT' && (paymentNavigationLocked || paymentApprovedForSync || paymentSyncing || paymentFailure === 'unknown'));
  const checkoutAmount = draftAmountOwing ?? quote?.costs.amountOwing ?? basketEstimateTotal;
  const checkoutTotal = quote?.costs.total ?? basketEstimateTotal;
  const checkoutLocked = submitting || Boolean(draft) || showPaymentSyncCard;

  const clearPaymentSyncState = () => {
    paymentPreparationAbortRef.current?.abort();
    setPaymentReadyForSafety(false);
    setPaymentSyncError(null);
    setPaymentApprovedForSync(false);
    setPaymentNavigationLocked(false);
    setPaymentContinuePending(false);
    setPaymentFailure(null);
    paymentResolutionStartedRef.current = false;
    paymentContinuationRef.current = null;
    paymentContinueRequestedRef.current = false;
  };

  useEffect(() => {
    if (!isPrePaymentBuyFlowRecovery(recoverySnapshot)) return;
    if (restoredSnapshotUpdatedAtRef.current === recoverySnapshot.updatedAt) return;

    let alive = true;
    restoringPrePaymentRef.current = true;

    const restorePrePaymentSnapshot = async () => {
      const savedContact = getSafeContact(recoverySnapshot.contact);
      const savedStartTime = recoverySnapshot.selectedStartTime;

      setLoadingAvailability(Boolean(savedStartTime));
      setAvailabilityError(null);
      setSubmitError(null);
      invalidateQuote();
      setDraft(null);
      setPaymentSyncing(false);
      setPaymentSyncError(null);
      setPaymentApprovedForSync(false);
      setGiftCardNumber('');
      setClipCardCode('');
      setPaymentOptionType('discount');
      setPaymentOptionsOpen(hasSavedPaymentOptions(recoverySnapshot));
      setFirstName(savedContact.firstName);
      setLastName(savedContact.lastName);
      setEmail(savedContact.email);
      setPhone(savedContact.phone);

      if (!savedStartTime) {
        setSelectedTime(null);
        setSelectedProduct(null);
        setQuantity(1);
        setAddonQty(createEmptyAddonQty());
        setAlreadyHasApprovedSocks(false);
        setAlreadyHasWaterBottle(false);
        setSkyriderConsentConfirmed(false);
        setLoadingAvailability(false);
        restoringPrePaymentRef.current = false;
        restoredSnapshotUpdatedAtRef.current = recoverySnapshot.updatedAt;
        setStep('TIMESLOT');
        return;
      }

      try {
        const freshAvailability = await getNewBookingAvailability([savedStartTime]);
        if (!alive) return;

        const freshSlot = freshAvailability.slots.find((slot) => slot.startTime === savedStartTime) ?? null;
        setAvailability(freshAvailability);
        setSelectedTime(savedStartTime);

        if (!freshSlot) {
          setSelectedProduct(null);
          setQuantity(1);
          setAddonQty(createEmptyAddonQty());
          setAlreadyHasApprovedSocks(false);
          setAlreadyHasWaterBottle(false);
          setSkyriderConsentConfirmed(false);
          setStep('TIMESLOT');
          return;
        }

        const recoveredProduct = findRecoveredBookingProduct(freshSlot, recoverySnapshot.selectedProduct);
        if (!recoveredProduct) {
          setSelectedProduct(null);
          setQuantity(1);
          setAddonQty(createEmptyAddonQty());
          setAlreadyHasApprovedSocks(false);
          setAlreadyHasWaterBottle(false);
          setSkyriderConsentConfirmed(false);
          setStep(recoverySnapshot.currentFlowStep === 'TIMESLOT' ? 'TIMESLOT' : 'PRODUCT');
          return;
        }

        const recoveredQuantity = Math.max(
          1,
          Math.min(
            getMaxBookingProductQuantity(recoveredProduct) || 1,
            getRecoveredQuantity(recoverySnapshot, recoveredProduct)
          )
        );
        const recoveredJumperCount = getJumperCount(recoveredProduct, recoveredQuantity);
        const recoveredBuyAddons = getBuyAddonEntriesForSlot(freshSlot, t.addons);
        const recoveredAddonQty = clampRecoveredAddonQty(
          recoverySnapshot.addonQty,
          freshSlot,
          recoveredBuyAddons,
          recoveredJumperCount
        );
        const recoveredSelectedAddons = getSelectedAddonsForState(
          recoveredAddonQty,
          freshSlot,
          recoveredBuyAddons,
          recoveredJumperCount
        );
        const recoveredSkyRiderSelected = recoveredSelectedAddons.some((addon) => addon.id === 'skyrider');
        const recoveredSkyRiderConsent = recoveredSkyRiderSelected && recoverySnapshot.skyriderConsentConfirmed === true;
        const recoveredAlreadyHasSocks =
          recoverySnapshot.alreadyHasApprovedSocks === true;
        const recoveredAlreadyHasWaterBottle =
          recoverySnapshot.alreadyHasWaterBottle === true;
        const recoveredCustomerValid = isValidRecoveredCustomer(savedContact);
        const needsRecoveredSkyRiderConsent = recoveredSkyRiderSelected && !recoveredSkyRiderConsent;

        setSelectedProduct(recoveredProduct);
        setQuantity(recoveredQuantity);
        setAddonQty(recoveredAddonQty);
        setAlreadyHasApprovedSocks(recoveredAlreadyHasSocks);
        setAlreadyHasWaterBottle(recoveredAlreadyHasWaterBottle);
        setSkyriderConsentConfirmed(recoveredSkyRiderConsent);

        if (recoverySnapshot.currentFlowStep === 'TIMESLOT') {
          setStep('TIMESLOT');
          return;
        }
        if (recoverySnapshot.currentFlowStep === 'PRODUCT') {
          setStep('PRODUCT');
          return;
        }
        if (recoverySnapshot.currentFlowStep === 'QUANTITY') {
          setStep('QUANTITY');
          return;
        }
        if (recoverySnapshot.currentFlowStep === 'ADDONS') {
          setStep('ADDONS');
          return;
        }
        if (recoverySnapshot.currentFlowStep === 'SKYRIDER_ATTEST') {
          setStep(needsRecoveredSkyRiderConsent ? 'SKYRIDER_ATTEST' : 'REVIEW');
          return;
        }
        if (recoverySnapshot.currentFlowStep === 'CONTACT') {
          setStep(needsRecoveredSkyRiderConsent ? 'SKYRIDER_ATTEST' : 'CONTACT');
          return;
        }
        if (recoverySnapshot.currentFlowStep === 'REVIEW') {
          setStep(needsRecoveredSkyRiderConsent ? 'SKYRIDER_ATTEST' : 'REVIEW');
          return;
        }

        if (
          needsRecoveredSkyRiderConsent ||
          !recoveredCustomerValid ||
          hasSavedPaymentOptions(recoverySnapshot)
        ) {
          setStep(needsRecoveredSkyRiderConsent ? 'SKYRIDER_ATTEST' : 'CONTACT');
          return;
        }

        const recoveredItems = buildItemsForState(
          freshAvailability,
          recoveredProduct,
          recoveredQuantity,
          recoveredSelectedAddons
        );
        if (recoveredItems.length === 0) {
          setStep('CONTACT');
          return;
        }

        try {
          const recoveredQuote = await quoteNewBooking(toRecoveredCustomer(savedContact), recoveredItems, true);
          if (!alive) return;
          setQuote(recoveredQuote);
          setStep('REVIEW');
        } catch (error) {
          if (!alive) return;
          const productLabelsForRestore = buildProductLabelMap(recoveredProduct, recoveredBuyAddons);
          setSubmitError(formatBuyFlowError(error, t.buy, productLabelsForRestore, t.buy.quoteFailed));
          setStep('CONTACT');
        }
      } catch (error) {
        if (!alive) return;
        setAvailabilityError(
          error instanceof CloudBookingError ? error.message : t.buy.availabilityFailed
        );
        setSelectedProduct(null);
        setQuantity(1);
        setAddonQty(createEmptyAddonQty());
        setAlreadyHasApprovedSocks(false);
        setAlreadyHasWaterBottle(false);
        setSkyriderConsentConfirmed(false);
        setStep('TIMESLOT');
      } finally {
        if (alive) {
          setLoadingAvailability(false);
          restoringPrePaymentRef.current = false;
          restoredSnapshotUpdatedAtRef.current = recoverySnapshot.updatedAt;
        }
      }
    };

    void restorePrePaymentSnapshot();

    return () => {
      alive = false;
      restoringPrePaymentRef.current = false;
    };
  }, [invalidateQuote, recoverySnapshot, t.addons, t.buy]);

  useEffect(() => {
    if (draft || restoringPrePaymentRef.current || !isBuyStep(step)) return;
    if (!selectedTime && !selectedProduct && step === 'TIMESLOT') return;

    writeBuyFlowRecovery({
      addonQty: toRecoveryAddonQty(addonQty),
      alreadyHasApprovedSocks,
      alreadyHasWaterBottle,
      bookingReference: null,
      contact: {
        email,
        firstName,
        lastName,
        phone,
      },
      currentFlowStep: step,
      draftState: null,
      draftUniqueId: null,
      jumperCount: selectedProduct ? jumperCount : null,
      paymentOptionsHadValues: paymentInputsHaveValues,
      quantity: selectedProduct ? quantity : null,
      selectedProduct: selectedProduct ? toRecoveryProduct(selectedProduct) : null,
      selectedStartTime: selectedTime,
      skyriderConsentConfirmed,
    });
  }, [
    addonQty,
    alreadyHasApprovedSocks,
    alreadyHasWaterBottle,
    draft,
    email,
    firstName,
    jumperCount,
    lastName,
    paymentInputsHaveValues,
    phone,
    quantity,
    selectedProduct,
    selectedTime,
    skyriderConsentConfirmed,
    step,
  ]);

  useEffect(() => {
    if (!draft) return;
    writeDraftRecovery(
      getDraftRecoveryStep(step, paymentApprovedForSync),
      draft,
      selectedProduct,
      selectedTime,
      jumperCount,
      paymentApprovedForSync || noPaymentRequired
    );
  }, [draft, jumperCount, noPaymentRequired, paymentApprovedForSync, selectedProduct, selectedTime, step]);

  const basketLines = [
    ...(selectedProduct
      ? [
          {
            key: 'entry',
            label: getBasketProductLabel(selectedProduct, t.buy),
            qty: quantity,
            total: entryTotal,
            icon: getProductIconName(selectedProduct),
          },
        ]
      : []),
    ...selectedAddons.map((addon) => ({
      key: addon.id,
      label: addon.label,
      qty: addon.qty,
      total: addon.price * addon.qty,
      icon: buyAddons.find((entry) => entry.id === addon.id)?.icon ?? ('addons-bag' as JumpyardIconName),
    })),
  ];
  const customerValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    isValidEmail(email);
  const paymentOptionStatus =
    paymentOptionState === 'applied'
      ? {
          tone: 'accepted' as const,
          title: paymentOptionType === 'giftCard' ? t.buy.giftCardAcceptedTitle : t.buy.paymentCodeAcceptedTitle,
          detail: `-${formatMoney(paymentOptionAppliedAmount)} ${t.buy.paymentCodeAcceptedDetail}`,
        }
      : paymentOptionState === 'rejected'
        ? {
            tone: 'rejected' as const,
            title: paymentOptionType === 'giftCard' ? t.buy.giftCardRejectedTitle : t.buy.paymentCodeRejectedTitle,
            detail: t.buy.paymentCodeRejectedDetail,
          }
        : null;
  const paymentOptionHint =
    paymentOptionState === 'ready'
      ? !customerValid
        ? t.buy.paymentOptionsContactRequired
        : paymentOptionValue.length >= PAYMENT_OPTION_CODE_MAX_LENGTH
          ? t.buy.paymentCodeMaxLength
          : t.buy.paymentCodeCheckedOnContinue
      : paymentOptionState === 'empty' && paymentOptionType === 'discount'
        ? t.buy.paymentOptionClipCardHint
        : null;

  const loadAvailability = async (requestedSlots = selectedTime ? [selectedTime] : slots) => {
    if (requestedSlots.length === 0) return;
    setLoadingAvailability(true);
    setAvailabilityError(null);
    try {
      const result = await getNewBookingAvailability(requestedSlots);
      setAvailability(result);
      setStep('PRODUCT');
    } catch (error) {
      setAvailabilityError(
        error instanceof CloudBookingError ? error.message : t.buy.availabilityFailed
      );
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    setAvailability(null);
    setAvailabilityError(null);
    setSelectedProduct(null);
    setQuantity(1);
    setAddonQty(createEmptyAddonQty());
    invalidateQuote();
    setDraft(null);
    clearPaymentSyncState();
    setGiftCardNumber('');
    setClipCardCode('');
    setPaymentOptionType('discount');
    setPaymentOptionsOpen(false);
    setSkyriderConsentConfirmed(false);
    setAlreadyHasApprovedSocks(false);
    setAlreadyHasWaterBottle(false);
  };

  const handleProductSelect = (product: NewBookingProduct) => {
    const max = getMaxBookingProductQuantity(product);
    if (max <= 0) return;
    setSelectedProduct(product);
    setQuantity(1);
    setAddonQty(createEmptyAddonQty());
    invalidateQuote();
    setDraft(null);
    clearPaymentSyncState();
    setSkyriderConsentConfirmed(false);
    setAlreadyHasApprovedSocks(false);
    setAlreadyHasWaterBottle(false);
    setStep('QUANTITY');
  };

  const updateQuantity = (nextQuantity: number) => {
    const clampedQuantity = Math.max(1, Math.min(maxQuantity || 1, nextQuantity));
    const nextJumperCount = getJumperCount(selectedProduct, clampedQuantity);
    setQuantity(clampedQuantity);
    setAddonQty((current) => {
      const next = { ...current };
      for (const addon of buyAddons) {
        next[addon.id] = Math.min(next[addon.id], getBuyAddonMax(addon, nextJumperCount));
      }
      return next;
    });
    invalidateQuote();
    setDraft(null);
    clearPaymentSyncState();
    setSkyriderConsentConfirmed(false);
  };

  const updateContact = (setValue: (value: string) => void, value: string) => {
    setValue(value);
    setSubmitError(null);
    invalidateQuote();
  };

  // One code at a time: entering either type clears the other field.
  const updateGiftCardNumber = (value: string) => {
    setGiftCardNumber(clampPaymentOptionCode(value));
    setClipCardCode('');
    setSubmitError(null);
    setDraft(null);
    clearPaymentSyncState();
    invalidateQuote();
  };

  const updateClipCardCode = (value: string) => {
    setClipCardCode(clampPaymentOptionCode(value));
    setGiftCardNumber('');
    setSubmitError(null);
    setDraft(null);
    clearPaymentSyncState();
    invalidateQuote();
  };

  const updatePaymentOptionValue = (value: string) => {
    if (paymentOptionType === 'giftCard') updateGiftCardNumber(value);
    else updateClipCardCode(value);
  };

  const removePaymentOption = () => updatePaymentOptionValue('');

  const selectPaymentOptionType = (type: PaymentOptionType) => {
    if (type === paymentOptionType) return;
    setPaymentOptionType(type);
    if (paymentInputsHaveValues) updatePaymentOptionValue('');
  };

  const setOneAddon = (id: AddonId, nextQty: number) => {
    setSubmitError(null);
    invalidateQuote();
    setDraft(null);
    clearPaymentSyncState();
    const addon = buyAddons.find((entry) => entry.id === id);
    const max = addon ? getBuyAddonMax(addon) : 0;
    if (id === 'skyrider') setSkyriderConsentConfirmed(false);
    setAddonQty((current) => ({ ...current, [id]: Math.max(0, Math.min(max, nextQty)) }));
  };

  const setSocksConfirmation = (checked: boolean) => {
    setAlreadyHasApprovedSocks(checked);
    setSubmitError(null);
    invalidateQuote();
    setDraft(null);
    clearPaymentSyncState();
  };

  const setWaterBottleConfirmation = (checked: boolean) => {
    setAlreadyHasWaterBottle(checked);
    setSubmitError(null);
    invalidateQuote();
    setDraft(null);
    clearPaymentSyncState();
  };

  const needsSkyRiderConsent = () => skyriderSelected && !skyriderConsentConfirmed;

  const continueFromAddons = () => {
    if (!addonChoicesRef.current?.validate()) return;
    if (needsSkyRiderConsent()) {
      setStep('SKYRIDER_ATTEST');
      return;
    }

    setStep('REVIEW');
  };

  const buildCustomer = (): NewBookingCustomer => ({
    email: email.trim(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim() || undefined,
  });

  const buildItems = (): NewBookingItemRequest[] => {
    if (!selectedProduct || !availability) return [];
    return [
      {
        bookingDate: availability.date,
        productId: Number(selectedProduct.productId),
        quantity,
        requiresAvailability: true,
        startTime: selectedProduct.startTime,
      },
      ...selectedAddons.map((addon) => ({
        bookingDate: availability.date,
        productId: Number(addon.rollerProductId),
        quantity: addon.qty,
        requiresAvailability: addon.requiresAvailability === true,
        startTime: selectedProduct.startTime,
      })),
    ];
  };

  const applyPaymentOptions = async () => {
    if (!selectedProduct || !customerValid || !paymentInputsHaveValues || submitting || draft || quoteOperationInFlightRef.current) return;
    quoteOperationInFlightRef.current = true;
    setApplyingCodes(true);
    setSubmitError(null);
    const requestVersion = invalidateQuote();
    try {
      const quoted = await quoteNewBooking(
        buildCustomer(), buildItems(), shouldPrecheckBasketAvailability, giftCardInputs, discountCodeInputs
      );
      if (quoteRequestVersionRef.current !== requestVersion) return;
      if (!hasPaymentOptionQuoteErrors(quoted)) appliedQuoteRef.current = quoted;
      setQuote(quoted);
    } catch (error) {
      if (quoteRequestVersionRef.current === requestVersion) {
        setSubmitError(formatBuyFlowError(error, t.buy, productLabels, t.buy.paymentOptionsFailed));
      }
    } finally {
      quoteOperationInFlightRef.current = false;
      setApplyingCodes(false);
    }
  };

  const createDraft = async (codes?: { giftCards: NewBookingGiftCardInput[]; discountCodes: NewBookingDiscountCodeInput[] }) => {
    if (draft) {
      setStep('PAYMENT');
      return;
    }
    if (!selectedProduct || !customerValid || submitting || quoteOperationInFlightRef.current) return;
    if (needsSkyRiderConsent()) {
      setStep('SKYRIDER_ATTEST');
      return;
    }
    // A code the current quote already rejected: ask before continuing without it.
    if (!codes && paymentInputsBlockingErrors) {
      setCodeRejectedDialogOpen(true);
      return;
    }
    const giftCards = codes?.giftCards ?? giftCardInputs;
    const discountCodes = codes?.discountCodes ?? discountCodeInputs;
    // Input edits clear this ref synchronously. Keep Apply's price and feedback
    // while the authoritative draft is prepared; only missing/expired quotes need a check.
    const appliedQuote = appliedQuoteRef.current;
    const reusableQuote = !codes && appliedQuote &&
      (!appliedQuote.expiresAt || Date.parse(appliedQuote.expiresAt) > Date.now())
      ? appliedQuote
      : null;
    const requestVersion = reusableQuote ? quoteRequestVersionRef.current : invalidateQuote();
    const quoteIsCurrent = () => quoteRequestVersionRef.current === requestVersion;
    quoteOperationInFlightRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const quoted = reusableQuote ?? await quoteNewBooking(
        buildCustomer(),
        buildItems(),
        shouldPrecheckBasketAvailability,
        giftCards,
        discountCodes
      );
      if (!quoteIsCurrent()) return;
      setQuote(quoted);
      if (hasPaymentOptionQuoteErrors(quoted)) {
        // Continue also applies an unapplied code; a rejected one needs the guest's decision.
        setCodeRejectedDialogOpen(true);
        return;
      }

      const itemKey = basketLines.map((line) => `${line.key}-${line.qty}`).join(':');

      const result = await createDraftBooking(
        buildCustomer(),
        buildItems(),
        `phone-draft:${selectedProduct.productId}:${selectedProduct.startTime}:${itemKey}:${Date.now().toString(36)}`,
        shouldPrecheckBasketAvailability,
        giftCards,
        discountCodes
      );
      setDraft(result);
      clearPaymentSyncState();
      if (getDraftAmountOwing(result) !== null && getDraftAmountOwing(result)! <= 0) {
        setStep('PENDING');
        void resolvePaidDraftBooking(result);
        return;
      }
      setStep(canStartPayment(result) ? 'PAYMENT' : 'PENDING');
    } catch (error) {
      if (quoteIsCurrent()) setSubmitError(formatBuyFlowError(error, t.buy, productLabels, t.buy.draftFailed));
    } finally {
      quoteOperationInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const continueWithoutCode = () => {
    setCodeRejectedDialogOpen(false);
    updatePaymentOptionValue('');
    return createDraft({ giftCards: [], discountCodes: [] });
  };

  const editRejectedCode = () => {
    setCodeRejectedDialogOpen(false);
  };

  const resolvePaidDraftBooking = async (
    draftOverride?: NewBookingDraftResult,
    waitForGuestConfirmation = false,
    confirmedBooking?: Booking
  ) => {
    const activeDraft = draftOverride ?? draft;
    const identifier = activeDraft?.draft.uniqueId ?? activeDraft?.draft.bookingReference;
    if (!identifier || paymentResolutionStartedRef.current) return;

    paymentResolutionStartedRef.current = true;
    paymentPreparationAbortRef.current?.abort();
    const preparation = new AbortController();
    paymentPreparationAbortRef.current = preparation;
    const attemptId = getDraftPaymentAttemptId(activeDraft);
    const isCurrent = () => !preparation.signal.aborted && (!waitForGuestConfirmation || activePaymentAttemptRef.current === attemptId);
    setPaymentSyncing(true);
    setPaymentReadyForSafety(false);
    setPaymentSyncError(null);
    try {
      // #374 waits only for usable booking context. #331 still accepts a successful
      // unpaid response here and confirms payment later, before staff handoff.
      const confirmation = confirmedBooking?.paid === true
        ? { status: 'paid' as const, booking: confirmedBooking }
        : waitForGuestConfirmation
          ? await resolvePurchasePreparation(lookupBooking, identifier, { signal: preparation.signal, isCurrent })
          : await resolvePaidConfirmation(lookupBooking, identifier, { wait });

      if (!isCurrent()) return;

      if (confirmation.status === 'unavailable') {
        paymentResolutionStartedRef.current = false;
        paymentContinueRequestedRef.current = false;
        setPaymentContinuePending(false);
        setPaymentSyncError(t.buy.paymentSyncFailed);
        return;
      }

      const preparedContinuation = await onBookingReady(confirmation.booking, { signal: preparation.signal, isCurrent });
      if (!isCurrent()) return;
      const continueToSafety = async () => {
        if (!isCurrent()) return;
        // Keep PAYMENT recovery while the guest still sees preparation/confirmation.
        // Enter saved safety immediately before navigation and payment-marker release.
        writeDraftRecovery('APP_SAFETY_VIDEO', activeDraft, selectedProduct, selectedTime, jumperCount, true);
        await preparedContinuation();
      };
      if (!waitForGuestConfirmation) {
        await continueToSafety();
        return;
      }

      paymentContinuationRef.current = continueToSafety;
      setPaymentReadyForSafety(true);
    } catch {
      if (!isCurrent()) return;
      paymentResolutionStartedRef.current = false;
      paymentContinueRequestedRef.current = false;
      setPaymentContinuePending(false);
      setPaymentSyncError(t.buy.paymentSyncFailed);
    } finally {
      if (isCurrent()) setPaymentSyncing(false);
    }
  };

  const continueAfterApprovedPayment = async () => {
    const continueToSafety = paymentContinuationRef.current;
    if (!continueToSafety || paymentContinueRequestedRef.current) return;
    paymentContinueRequestedRef.current = true;
    setPaymentContinuePending(true);
    try {
      await continueToSafety();
      paymentContinuationRef.current = null;
    } catch {
      if (paymentPreparationAbortRef.current?.signal.aborted) return;
      paymentContinuationRef.current = null;
      paymentResolutionStartedRef.current = false;
      setPaymentReadyForSafety(false);
      setPaymentSyncError(t.buy.paymentSyncFailed);
    } finally {
      paymentContinueRequestedRef.current = false;
      setPaymentContinuePending(false);
    }
  };

  const clearConfirmedFailedPayment = async (beforeClear?: () => void) => {
    const attemptId = getDraftPaymentAttemptId(draft);
    if (paymentFailure !== 'failed' || !attemptId) return false;
    const recovery = readPaymentRecovery();
    if (!recovery || recovery.attemptId !== attemptId || recovery.outcome !== 'failed') {
      setPaymentFailure('unknown');
      return false;
    }
    return clearPaymentRecoveryAfterCompletion(attemptId, beforeClear);
  };

  const retryFailedPayment = async () => {
    if (!await clearConfirmedFailedPayment(() => {
      const snapshot = readBuyFlowRecovery();
      if (!snapshot) return;
      writeBuyFlowRecovery({
        ...snapshot,
        bookingReference: null,
        currentFlowStep: 'CONTACT',
        draftState: null,
        draftUniqueId: null,
      });
    })) return;
    setDraft(null);
    invalidateQuote();
    setSubmitError(null);
    clearPaymentSyncState();
    setStep('CONTACT');
  };

  const restartFailedPayment = async () => {
    if (!await clearConfirmedFailedPayment(clearBuyFlowRecovery)) return;
    onBack();
  };

  const checkPaymentStatus = async () => {
    const attemptId = getDraftPaymentAttemptId(draft);
    const identifier = draft?.draft.uniqueId ?? draft?.draft.bookingReference;
    if (paymentFailure !== 'unknown' || !identifier || !attemptId || paymentStatusCheckingRef.current) return;

    paymentStatusCheckingRef.current = true;
    setPaymentStatusChecking(true);
    try {
      const booking = await lookupBooking(identifier);
      if (booking.paid !== true || (booking.rollerUniqueId !== identifier && booking.id !== identifier)
        || activePaymentAttemptRef.current !== attemptId || paymentResolutionStartedRef.current) return;
      const recovery = readPaymentRecovery();
      if (recovery && recovery.attemptId !== attemptId) return;

      if (recovery && !await approvePaymentRecovery(attemptId)) return;
      if (activePaymentAttemptRef.current !== attemptId || paymentResolutionStartedRef.current) return;
      const latest = readPaymentRecovery();
      if (recovery && (!latest || latest.attemptId !== attemptId || latest.createdAt !== recovery.createdAt)) return;
      setPaymentFailure(null);
      setPaymentApprovedForSync(true);
      setStep('APPROVED');
      await resolvePaidDraftBooking(undefined, true, booking);
    } catch {
      // An unavailable lookup leaves the original purchase unresolved and recoverable.
    } finally {
      paymentStatusCheckingRef.current = false;
      setPaymentStatusChecking(false);
    }
  };

  const backFromStep = () => {
    if (backNavigationLocked) return;
    if (step === 'CONTACT' && !draft) invalidateQuote();
    if (step === 'PAYMENT') {
      if (paymentFailure === 'failed') {
        retryFailedPayment();
        return;
      }
      setStep('CONTACT');
      return;
    }
    if (step === 'PENDING') {
      clearBuyFlowRecovery();
      onBack();
      return;
    }
    if (step === 'REVIEW') setStep('ADDONS');
    else if (step === 'CONTACT') setStep('REVIEW');
    else if (step === 'SKYRIDER_ATTEST') setStep('ADDONS');
    else if (step === 'ADDONS') setStep('QUANTITY');
    else if (step === 'QUANTITY') setStep('PRODUCT');
    else if (step === 'PRODUCT') setStep('TIMESLOT');
    else {
      clearBuyFlowRecovery();
      onBack();
    }
  };

  const renderProductCard = (product: NewBookingProduct) => {
    const isCombo = product.type === 'combo';
    const available = isPurchasableBookingProduct(product);
    const cardTitle = getProductCardTitle(product);
    const capacityLabel = getCapacityLabel(product, t.buy.spotsAvailable, t.buy.spotsLeft);
    const iconName = getProductIconName(product);
    const ticketUnitLabel = getProductUnitBadgeLabel(product, t.buy);
    const comboInclusions = isCombo ? getComboInclusions(t.buy) : [];
    const showLeadingIcon = product.type !== 'combo';

    return (
      <button
        key={product.key}
        onClick={() => available && handleProductSelect(product)}
        disabled={!available}
        className={`min-w-0 ${isCombo ? 'p-4 rounded-2xl' : 'p-3.5 rounded-xl'} text-left flex items-center gap-3 transition-all border ${
          available
            ? isCombo
              ? 'bg-white border-primary/60 shadow-[0_0_22px_rgba(239,23,66,0.26)] ring-1 ring-primary/25 active:scale-[0.98]'
              : 'bg-white border-border active:scale-[0.98]'
            : 'bg-surface-strong border-border opacity-50 cursor-not-allowed'
        }`}
      >
        {showLeadingIcon && <JumpyardIcon name={iconName} className="w-9 h-9 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          {!isCombo && (
            <p className={`text-lg font-black italic uppercase ${available ? 'text-foreground' : 'text-muted'}`}>
              {cardTitle}
            </p>
          )}
          {isCombo ? (
            <div className="flex flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
                {comboInclusions.map((item, index) => (
                  <Fragment key={item.label}>
                    {index > 0 && (
                      <span className="text-base font-black italic leading-none text-primary" aria-hidden="true">
                        +
                      </span>
                    )}
                    <span
                      className={`flex min-w-0 items-center gap-1.5 text-xs font-black italic uppercase leading-tight ${
                        available ? 'text-foreground' : 'text-muted/70'
                      }`}
                    >
                      <JumpyardIcon name={item.icon} className="h-7 w-7 flex-shrink-0" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </span>
                  </Fragment>
                ))}
              </div>
              <span
                className={`text-[10px] font-normal italic uppercase tracking-wider ${
                  available ? 'text-foreground' : 'text-muted/70'
                }`}
              >
                {available ? capacityLabel : t.buy.spotsFull}
              </span>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black italic uppercase ${
                  available ? 'bg-primary text-white' : 'bg-surface text-muted'
                }`}
              >
                {ticketUnitLabel}
              </span>
              <span
                className={`text-[10px] font-normal italic uppercase tracking-wider ${
                  available ? 'text-foreground' : 'text-muted/70'
                }`}
              >
                {available ? capacityLabel : t.buy.spotsFull}
              </span>
            </div>
          )}
        </div>
        <p className={`shrink-0 text-base font-black italic ${available ? 'text-primary' : 'text-muted/60'}`}>
          {formatMoney(product.unitPrice)}
        </p>
      </button>
    );
  };

  const presentationRef = useRef<HTMLDivElement>(null);

  return (
    <FlowTransitionBoundary root={presentationRef} screenKey={step} resetDocumentScroll>
    <FlowScreen
      ref={presentationRef}
      className="phone-buy-flow w-full max-w-md min-w-0 mx-auto px-4"
      data-prepayment-status={draft?.prepayment?.status ?? ''}
      data-prepayment-draft-id={draft?.prepayment?.prepaymentDraftId ?? ''}
      data-payment-syncing={String(paymentSyncing)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <BuyEntryProgress step={step} />

      <div className="mb-4 flex items-center justify-between">
        {!backNavigationLocked && (
          <button
            onClick={backFromStep}
            className="flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
          >
            <ArrowLeft size={14} /> {t.common.back}
          </button>
        )}
        {inlineExitVisible && onRequestExit && (
          <button
            className="ml-auto flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
            data-testid="buy-exit-flow-open"
            onClick={onRequestExit}
            type="button"
          >
            {t.common.exit} <X size={14} />
          </button>
        )}
      </div>

      {step === 'TIMESLOT' && (
        <FlowScreen initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">
            {t.buy.selectTime}
          </h2>
          <p className="text-foreground text-xs font-black italic uppercase text-center mb-5">{todayLabel}</p>

          {availabilityError && (
            <div className="mb-4 bg-white border border-danger/25 rounded-xl p-3 text-sm text-foreground flex gap-2">
              <AlertCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
              <span>{availabilityError}</span>
            </div>
          )}

          <StableLoadingRegion loading={loadingAvailability} fallback={<AvailabilityLoadingCard selectedTime={selectedTime} />}>
              <div className="flex flex-col gap-3 mb-6">
                {slots.map((time) => {
                  const isSelected = selectedTime === time;
                  return (
                    <button
                      key={time}
                      onClick={() => handleTimeSelect(time)}
                      className={`w-full min-h-[76px] px-5 py-4 rounded-2xl text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-primary text-white border-2 border-primary'
                          : 'bg-white border border-border active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={isSelected ? 'rounded-md bg-white' : ''}>
                          <JumpyardIcon name="time" className="w-9 h-9" />
                        </span>
                        <span className={`text-2xl font-black italic ${isSelected ? 'text-white' : 'text-foreground'}`}>
                          {time}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => selectedTime && void loadAvailability([selectedTime])}
                disabled={!selectedTime}
                className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {t.common.continue}
              </button>
            </StableLoadingRegion>

          {availabilityError && (
            <button
              onClick={() => selectedTime && void loadAvailability([selectedTime])}
              disabled={loadingAvailability}
              className="mt-3 w-full bg-white border border-border text-foreground font-black italic uppercase text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={15} /> {t.buy.retryAvailability}
            </button>
          )}
        </FlowScreen>
      )}

      {step === 'PRODUCT' && (
        <>
          <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">
            {t.buy.selectJumpTime}
          </h2>
          {selectedTime && (
            <p className="text-foreground text-xs mb-4 text-center flex items-center justify-center gap-1.5 uppercase font-black italic">
              <JumpyardIcon name="time" className="w-5 h-5" />
              <span>{t.buy.startTimeLabel} {selectedTime} {t.buy.todaySuffix}</span>
            </p>
          )}

          {comboProducts.length > 0 && (
            <div className="mb-3">
              <p
                className="text-base text-foreground uppercase font-black italic tracking-wide mb-2 px-1"
                style={{ textShadow: '1.4px 1.4px 0 #ef1742' }}
              >
                {t.buy.sectionCombo}
              </p>
              <div className="flex flex-col gap-2">{comboProducts.map(renderProductCard)}</div>
            </div>
          )}

          {entryProducts.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-foreground uppercase font-black italic tracking-wider mb-2 px-1">
                {t.buy.sectionEntry}
              </p>
              <div className="flex flex-col gap-2">{entryProducts.map(renderProductCard)}</div>
            </div>
          )}

          {familyProducts.length > 0 && (
            <div>
              <p className="text-xs text-foreground uppercase font-black italic tracking-wider mb-2 px-1">
                {t.buy.sectionFamily}
              </p>
              <div className="flex flex-col gap-2">{familyProducts.map(renderProductCard)}</div>
            </div>
          )}

          {visibleProductSections.total === 0 && (
            <div className="rounded-2xl border border-border bg-white p-5 text-center">
              <AlertCircle size={28} className="mx-auto mb-2 text-primary" />
              <p className="text-base font-black italic uppercase text-foreground">
                {t.buy.noProductsAvailableTitle}
              </p>
              <p className="mt-1 text-sm text-muted">{t.buy.noProductsAvailableDesc}</p>
              <button
                onClick={() => {
                  setAvailability(null);
                  setSelectedTime(null);
                  setStep('TIMESLOT');
                }}
                className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-black italic uppercase text-white active:scale-[0.98]"
              >
                {t.buy.chooseAnotherTime}
              </button>
            </div>
          )}
        </>
      )}

      {step === 'QUANTITY' && selectedProduct && (
        <FlowScreen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-full min-w-0 flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full px-2 py-5 text-center">
            <div className="max-w-full bg-white border border-border rounded-2xl px-4 py-3 mb-6 inline-flex flex-wrap items-center justify-center gap-3 shadow-sm">
              <JumpyardIcon
                name={getProductIconName(selectedProduct)}
                className="w-8 h-8"
              />
              <span className="text-lg font-black italic uppercase text-foreground">
                {selectedProduct.type === 'combo'
                  ? selectedProduct.label
                  : selectedProduct.type === 'family'
                    ? `${selectedProductDurationLabel} ${t.buy.sectionFamily}`
                    : selectedProductDurationLabel}
              </span>
            </div>

            <h2 className="text-2xl font-black italic text-foreground uppercase mb-2">
              {getQuantityTitle(selectedProduct, t.buy)}
            </h2>
            <PackageContentRows contents={selectedPackageContents} />
            <p className="text-foreground text-sm font-normal italic uppercase mb-6 flex items-center justify-center gap-2">
              <JumpyardIcon name="time" className="w-6 h-6" /> {t.buy.startTimeLabel} {selectedProduct.startTime} {t.buy.todaySuffix}
            </p>

            <div className="flex items-center justify-center gap-7 mb-3">
              <button
                onClick={() => updateQuantity(quantity - 1)}
                disabled={quantity <= 1}
                className="w-14 h-14 rounded-full bg-surface-strong border border-border flex items-center justify-center text-foreground text-xl font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Minus size={20} />
              </button>
              <span className="text-5xl font-black italic text-foreground w-16 text-center">{quantity}</span>
              <button
                onClick={() => updateQuantity(quantity + 1)}
                disabled={quantity >= maxQuantity}
                className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={20} />
              </button>
            </div>
            <p className="text-xs text-foreground uppercase font-normal italic tracking-wider mb-6">
              {maxQuantity > 0
                ? `${getCapacityLabel(selectedProduct, t.buy.spotsAvailable, t.buy.spotsLeft)} · ${
                    t.buy.maxReached
                  } ${maxQuantity}`
                : t.buy.spotsFull}
            </p>

            <div className="bg-white border border-border p-4 rounded-2xl mb-5 flex justify-between items-center px-5">
              <span className="text-foreground text-sm font-black italic uppercase">{t.buy.total}</span>
              <span className="text-xl font-black italic text-primary">
                {formatMoney((selectedProduct.unitPrice ?? 0) * quantity)}
              </span>
            </div>

            <button
              onClick={() => setStep('ADDONS')}
              className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center active:scale-[0.98]"
            >
              {t.common.continue}
            </button>
          </div>
        </FlowScreen>
      )}

      {step === 'ADDONS' && selectedProduct && (
        <FlowScreen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="addon-shop-screen w-full flex flex-col"
        >
          <div className="text-center mb-3">
            <h2 className="text-xl font-black italic text-foreground uppercase mb-1">{t.addons.title}</h2>
          </div>

          <div className="addon-shop-scroll">
            <AddonChoices ref={addonChoicesRef}
              entries={buyAddons.filter((addon) => addon.id === 'socks' || addon.id === 'water_bottle' || (isPricedAddon(addon) && getBuyAddonMax(addon) > 0))
                .map((addon) => ({ ...addon, description: '', quantity: addonQty[addon.id], included: 0,
                  max: getBuyAddonMax(addon), available: isPricedAddon(addon) && getBuyAddonMax(addon) > 0 }))}
              ownSocks={alreadyHasApprovedSocks} ownBottle={alreadyHasWaterBottle}
              onQuantity={setOneAddon} onOwnSocks={setSocksConfirmation} onOwnBottle={setWaterBottleConfirmation} />
          </div>

          <div className="addon-shop-footer">
            <div className="bg-white border border-border p-4 rounded-2xl mb-4 flex justify-between items-center px-5">
              <span className="text-foreground text-sm font-black italic uppercase">{t.buy.total}</span>
              <span className="text-xl font-black italic text-primary">{formatMoney(basketEstimateTotal)}</span>
            </div>

            <button
              data-testid="buy-addons-continue"
              onClick={continueFromAddons}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center active:scale-[0.98]"
            >
              {t.common.continue}
            </button>
          </div>
        </FlowScreen>
      )}

      {step === 'SKYRIDER_ATTEST' && (
        <SkyRiderAttest
          onComplete={() => {
            setSkyriderConsentConfirmed(true);
            setStep('REVIEW');
          }}
        />
      )}

      {step === 'CONTACT' && selectedProduct && (
        <FlowScreen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex flex-col items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full px-2 py-5">
            <h2 className="mb-5 text-center text-xl font-black italic uppercase text-foreground">
              {t.buy.contactTitle}
            </h2>

            <section className="mb-4 rounded-2xl border border-border bg-white p-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <label>
                  <span className="text-[10px] text-foreground uppercase font-black italic tracking-wider block mb-1">
                    {t.buy.firstNameLabel}
                  </span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => updateContact(setFirstName, event.target.value)}
                    autoComplete="given-name"
                    disabled={checkoutLocked}
                    className="w-full bg-white border border-border rounded-xl px-3 py-3 text-base text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:opacity-60"
                  />
                </label>
                <label>
                  <span className="text-[10px] text-foreground uppercase font-black italic tracking-wider block mb-1">
                    {t.buy.lastNameLabel}
                  </span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => updateContact(setLastName, event.target.value)}
                    autoComplete="family-name"
                    disabled={checkoutLocked}
                    className="w-full bg-white border border-border rounded-xl px-3 py-3 text-base text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:opacity-60"
                  />
                </label>
              </div>

              <label className="block mb-3">
                <span className="text-[10px] text-foreground uppercase font-black italic tracking-wider flex items-center gap-1.5 mb-1">
                  <JumpyardIcon name="email-confirmed" className="w-5 h-5" /> {t.buy.emailLabel}
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => updateContact(setEmail, event.target.value)}
                  placeholder={t.buy.emailPlaceholder}
                  autoComplete="email"
                  disabled={checkoutLocked}
                  className="w-full bg-white border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/40 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all disabled:opacity-60"
                />
              </label>

            </section>

            <section className="mb-4 rounded-2xl border-2 border-primary/25 bg-white px-4 shadow-sm">
              <button
                type="button"
                onClick={() => setPaymentOptionsOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 py-4 text-left"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <JumpyardIcon name="presentkort" className="h-8 w-8 flex-shrink-0" />
                  <p className="min-w-0 text-sm font-black italic uppercase leading-tight text-foreground">
                    {t.buy.paymentOptionsTitle}
                  </p>
                </div>
                <ChevronDown
                  size={22}
                  className={`flex-shrink-0 text-foreground transition-transform ${
                    paymentOptionsOpen || paymentInputsHaveValues ? 'rotate-0' : '-rotate-90'
                  }`}
                />
              </button>

              {(paymentOptionsOpen || paymentInputsHaveValues) && (
                <div className="border-t border-primary/15 pb-4 pt-3">
                  <p className="mb-1.5 text-[10px] font-black italic uppercase tracking-wider text-foreground">
                    {t.buy.paymentOptionTypeQuestion}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={t.buy.paymentOptionTypeQuestion}
                    className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1"
                  >
                    {PAYMENT_OPTION_TYPES.map((type) => {
                      const active = paymentOptionType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => selectPaymentOptionType(type)}
                          disabled={checkoutLocked}
                          className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] font-black italic uppercase leading-none tracking-wide transition-all ${
                            active ? 'bg-white text-foreground shadow-sm ring-1 ring-primary/40' : 'text-muted'
                          }`}
                        >
                          <JumpyardIcon
                            name={PAYMENT_OPTION_TYPE_ICONS[type]}
                            className={`h-6 w-6 ${active ? '' : 'opacity-40'}`}
                          />
                          {type === 'giftCard'
                            ? t.buy.paymentOptionTypeGiftCard
                            : type === 'member'
                              ? t.buy.paymentOptionTypeMember
                              : t.buy.paymentOptionTypeDiscount}
                        </button>
                      );
                    })}
                  </div>
                  <div className={getPaymentOptionGroupClass(paymentOptionState)}>
                    <input
                      type="text"
                      value={paymentOptionValue}
                      onChange={(event) => updatePaymentOptionValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void applyPaymentOptions();
                      }}
                      placeholder={paymentOptionPlaceholder}
                      maxLength={PAYMENT_OPTION_CODE_MAX_LENGTH}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={checkoutLocked}
                      aria-label={paymentOptionFieldLabel}
                      aria-describedby={paymentOptionStatus || paymentOptionHint ? 'payment-code-feedback' : undefined}
                      aria-invalid={paymentOptionState === 'rejected'}
                      className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base text-foreground placeholder:text-muted/40 outline-none disabled:opacity-60"
                    />
                    {paymentOptionState === 'applied' ? (
                      <button
                        type="button"
                        onClick={removePaymentOption}
                        disabled={checkoutLocked}
                        aria-label={t.buy.paymentOptionRemove}
                        className="flex items-center px-3 text-foreground disabled:opacity-40"
                      >
                        <X size={18} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void applyPaymentOptions()}
                        disabled={!paymentInputsHaveValues || !customerValid || checkoutLocked || applyingCodes}
                        className="flex items-center whitespace-nowrap px-3 text-[11px] font-black italic uppercase tracking-wider text-primary disabled:opacity-40"
                      >
                        {applyingCodes ? t.buy.paymentOptionsChecking : t.buy.paymentOptionsApply}
                      </button>
                    )}
                  </div>
                  {paymentOptionStatus ? (
                    <div
                      id="payment-code-feedback"
                      className={`mt-2 flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                        paymentOptionStatus.tone === 'accepted'
                          ? 'border-success/30 bg-success/10'
                          : 'border-danger/30 bg-danger/5'
                      }`}
                    >
                      <JumpyardIcon
                        name={paymentOptionStatus.tone === 'accepted' ? 'success-check' : 'warning'}
                        className="h-7 w-7 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-black italic uppercase leading-tight ${
                            paymentOptionStatus.tone === 'accepted' ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {paymentOptionStatus.title}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-foreground">{paymentOptionStatus.detail}</p>
                      </div>
                    </div>
                  ) : paymentOptionHint ? (
                    <p id="payment-code-feedback" className="mt-1 text-[11px] font-bold text-muted">
                      {paymentOptionHint}
                    </p>
                  ) : null}
                  <p role="status" className="sr-only">
                    {applyingCodes
                      ? t.buy.paymentOptionsChecking
                      : paymentOptionStatus
                        ? `${paymentOptionStatus.title}. ${paymentOptionStatus.detail}`
                        : ''}
                  </p>
                </div>
              )}
            </section>

            <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-white">
              <button
                type="button"
                onClick={() => setCheckoutBreakdownOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
              >
                <span className="text-lg font-black italic uppercase text-foreground">{t.buy.toPay}</span>
                <span className="flex items-center gap-2 text-2xl font-black italic leading-none text-primary">
                  {formatMoney(checkoutAmount)}
                  <ChevronDown
                    size={22}
                    className={`text-foreground transition-transform ${checkoutBreakdownOpen ? 'rotate-0' : '-rotate-90'}`}
                  />
                </span>
              </button>
              {checkoutBreakdownOpen && (
                <div className="border-t border-border px-4 py-3">
                  {basketLines.map((line) => (
                    <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_2.5rem_4.5rem] gap-2 py-1.5 text-sm">
                      <span className="min-w-0 break-words font-bold italic uppercase text-foreground">
                        {formatBasketLineLabel(line.label)}
                      </span>
                      <span className="text-center text-xs text-foreground">{line.qty} st</span>
                      <span className="text-right font-black italic text-primary">{formatMoney(line.total)}</span>
                    </div>
                  ))}
                  <PackageContentRows contents={selectedPackageContents} />
                  {checkoutTotal !== null && checkoutAmount !== null && checkoutTotal !== checkoutAmount && (
                    <div className="mt-2 flex justify-between gap-3 border-t border-border pt-2 text-[11px] text-foreground">
                      <span>{t.buy.originalTotal}</span>
                      <span>{formatMoney(checkoutTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {submitError && (
              <p className="mb-4 text-sm text-danger font-bold italic">{displayedSubmitError}</p>
            )}

            <button
              onClick={() => {
                if (draft) {
                  setStep('PAYMENT');
                  return;
                }
                void createDraft();
              }}
              data-testid="buy-contact-continue"
              disabled={!customerValid || submitting || applyingCodes}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center active:scale-[0.98]"
            >
              {submitting ? t.buy.creating : quote && checkoutAmount <= 0 ? t.buy.createDraftFree : t.buy.createDraft}
            </button>
            <PaymentCodeRejectedDialog
              open={codeRejectedDialogOpen}
              title={paymentOptionType === 'giftCard' ? t.buy.giftCardRejectedTitle : t.buy.paymentCodeRejectedTitle}
              description={t.buy.codeRejectedDialogBody}
              continueLabel={t.buy.codeRejectedContinueWithout}
              editLabel={t.buy.codeRejectedEditCode}
              onContinueWithout={() => void continueWithoutCode()}
              onEdit={editRejectedCode}
            />
          </div>
        </FlowScreen>
      )}

      {step === 'REVIEW' && selectedProduct && (
        <FlowScreen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full px-2 py-5">
            <h2 className="mb-6 text-center text-xl font-black italic uppercase text-foreground">
              {t.buy.reviewTitle}
            </h2>

            <div className="mb-5 grid grid-cols-2 items-stretch gap-2.5">
              <div className="flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-border bg-white px-3 py-3 shadow-sm">
                <JumpyardIcon name="time" className="h-8 w-8 flex-shrink-0" />
                <p className="min-w-0 text-sm font-black italic uppercase leading-tight text-foreground">
                  {selectedProduct.startTime} {t.buy.todaySuffix}
                </p>
              </div>
              <div className="flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-border bg-white px-3 py-3 shadow-sm">
                <JumpyardIcon
                  name={selectedProduct.type === 'combo' ? 'combo-60-min' : 'trampoline-jump'}
                  className="h-8 w-8 flex-shrink-0"
                />
                <p className="min-w-0 text-sm font-black italic uppercase leading-tight text-foreground">
                  {selectedProductDurationLabel}
                </p>
              </div>
            </div>

            <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-white">
              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <span className="flex min-w-0 items-center gap-2">
                  <JumpyardIcon name="payment-card" className="h-7 w-7 flex-shrink-0" />
                  <span className="text-lg font-black italic uppercase text-foreground">{t.buy.toPay}</span>
                </span>
                <span className="shrink-0 text-2xl font-black italic leading-none text-primary">
                  {formatMoney(basketEstimateTotal)}
                </span>
              </div>
              <div className="border-t border-border px-4 py-3">
                {basketLines.map((line) => (
                  <div
                    key={line.key}
                    className="grid grid-cols-[minmax(0,1fr)_2.5rem_4.5rem] gap-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0 break-words font-bold italic uppercase text-foreground">
                      {formatBasketLineLabel(line.label)}
                    </span>
                    <span className="text-center text-xs text-foreground">{line.qty} st</span>
                    <span className="text-right font-black italic text-primary">{formatMoney(line.total)}</span>
                  </div>
                ))}
                <PackageContentRows contents={selectedPackageContents} />
              </div>
            </div>

            {submitError && <p className="mb-4 text-sm text-danger font-bold italic">{displayedSubmitError}</p>}

            <button
              onClick={() => {
                setSubmitError(null);
                setStep('CONTACT');
              }}
              className="w-full rounded-2xl bg-primary py-4 text-lg font-black italic uppercase text-white transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.common.continue}
            </button>
          </div>
        </FlowScreen>
      )}

      {step === 'PAYMENT' && draft && (
        <FlowScreen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full px-2 py-5">
            <JumpyardIcon name="payment-card" className="mx-auto mb-2 h-11 w-11" />
            <h2 className="mb-5 text-center text-xl font-black italic uppercase text-foreground">
              {t.buy.paymentMethodTitle}
            </h2>

            {showPaymentSyncCard ? (
              <div
                className={`rounded-xl bg-white p-5 text-center ${paymentSyncError ? 'border border-danger/30' : ''}`}
                data-payment-sync-card="true"
                data-payment-sync-error={paymentSyncError ? 'true' : 'false'}
              >
                {paymentSyncError ? (
                  <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <AlertCircle size={24} />
                  </div>
                ) : (
                  <div className="relative mx-auto mb-4 h-20 w-20" aria-hidden="true">
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white border border-border shadow-sm">
                      <JumpyardIcon name="success-check" className="h-11 w-11" />
                    </div>
                  </div>
                )}
                <h2 className="text-xl font-black italic uppercase text-foreground">
                  {paymentSyncError ? t.buy.paymentSyncFailed : t.buy.paymentSyncing}
                </h2>
                {!paymentSyncError && <p className="mt-2 text-sm text-muted">{t.buy.paymentSyncLoader}</p>}

                {paymentSyncError && (
                  <>
                    <p className="mt-3 text-sm font-bold text-danger">{paymentSyncError}</p>
                    <p className="mt-1 text-xs text-muted">{t.buy.paymentSyncFallback}</p>
                    <button
                      onClick={() => void resolvePaidDraftBooking()}
                      disabled={paymentSyncing}
                      className="mt-3 w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-white font-black italic uppercase text-sm py-3 rounded-xl transition-all active:scale-[0.98]"
                    >
                      {t.buy.paymentRetrySync}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className={paymentFailure === 'unknown' ? 'hidden' : undefined}>
                  <RollerPaymentDropIn
                    key={getDraftPaymentAttemptId(draft)}
                    amountLabel={formatMoney(draft.prepayment?.amountOwing ?? draft.draft.costs.amountOwing)}
                    attemptId={getDraftPaymentAttemptId(draft)}
                    bookingIdentifier={draft.draft.uniqueId ?? draft.draft.bookingReference ?? ''}
                    kind="new_booking"
                    onNavigationLockChange={setPaymentNavigationLocked}
                    paymentSession={draft.paymentSession}
                    onApproved={() => {
                      setPaymentFailure(null);
                      setPaymentApprovedForSync(true);
                      setStep('APPROVED');
                      void resolvePaidDraftBooking(undefined, true);
                    }}
                    onFailed={(result) => setPaymentFailure(result.status === 'failed' ? 'failed' : 'unknown')}
                  />
                </div>
                {paymentFailure === 'unknown' && (
                  <div className="rounded-xl border border-border bg-white p-5 text-center" data-payment-recovery="unknown">
                    <p className="font-black italic text-foreground">{t.buy.paymentRecoveryTitle}</p>
                    <p className="mt-3 text-sm text-muted">{t.buy.paymentRecoveryDescription}</p>
                    <button
                      type="button"
                      onClick={() => void checkPaymentStatus()}
                      disabled={paymentStatusChecking}
                      className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-black italic uppercase text-white disabled:opacity-40"
                    >
                      {paymentStatusChecking ? t.buy.paymentChecking : t.buy.paymentCheckStatus}
                    </button>
                  </div>
                )}
                {paymentFailure === 'failed' && (
                  <div className="mt-4 rounded-xl border border-border bg-white p-4 text-center" data-payment-recovery="failed">
                    <p className="text-sm font-bold text-foreground">{t.buy.paymentFailedTitle}</p>
                    <button
                      type="button"
                      onClick={retryFailedPayment}
                      className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-black italic uppercase text-white"
                    >
                      {t.buy.paymentRetryMethod}
                    </button>
                    <button
                      type="button"
                      onClick={restartFailedPayment}
                      className="mt-3 w-full rounded-xl border border-border py-3 text-sm font-bold text-muted"
                    >
                      {t.buyRecovery.startOver}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </FlowScreen>
      )}

      {step === 'APPROVED' && draft && (
        <FlowScreen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full px-2 py-5">
            <PhonePaymentConfirmation
              language={lang}
              amountLabel={formatMoney(draftAmountOwing)}
              preparationState={paymentSyncError ? 'delayed' : paymentReadyForSafety ? 'ready' : 'preparing'}
              onRetryPreparation={() => void resolvePaidDraftBooking(undefined, true)}
              isContinuing={paymentContinuePending}
              onContinueToSafety={continueAfterApprovedPayment}
            />
          </div>
        </FlowScreen>
      )}

      {step === 'PENDING' && draft && (
        <FlowScreen
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full bg-surface border border-border p-5 rounded-2xl text-center">
            <div className="w-14 h-14 rounded-full bg-white border border-border mx-auto mb-4 flex items-center justify-center">
              {noPaymentRequired ? (
                <Check size={28} className="text-primary" />
              ) : (
                <JumpyardIcon name="payment-card" className="h-10 w-10" />
              )}
            </div>
            <h2 className="text-xl font-black italic text-foreground uppercase mb-2">
              {noPaymentRequired ? t.buy.noPaymentTitle : t.buy.pendingTitle}
            </h2>
            <p className="text-muted text-sm mb-5">
              {noPaymentRequired ? t.buy.noPaymentDesc : t.buy.pendingDesc}
            </p>

            <div className="bg-white border border-border rounded-xl p-4 mb-5 text-left">
              <div className="flex justify-between gap-3 text-sm mb-2">
                <span className="text-muted font-bold italic uppercase">{t.buy.total}</span>
                <span className="font-black text-primary">{formatMoney(draftAmountOwing)}</span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted">{t.buy.draftStatus}</span>
                <span className="font-bold text-foreground">
                  {noPaymentRequired ? t.buy.noPaymentStatus : t.buy.paymentPending}
                </span>
              </div>
            </div>

            {paymentSyncing && (
              <p className="mb-4 text-xs text-muted font-bold italic uppercase">{t.buy.paymentSyncing}</p>
            )}

            {paymentSyncError && (
              <p className="mb-4 text-sm text-danger font-bold italic">{paymentSyncError}</p>
            )}

            <button
              onClick={noPaymentRequired ? () => void resolvePaidDraftBooking() : onBack}
              disabled={noPaymentRequired && paymentSyncing}
              className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all active:scale-[0.98]"
            >
              {noPaymentRequired ? t.buy.paymentRetrySync : t.common.done}
            </button>
          </div>
        </FlowScreen>
      )}
    </FlowScreen>
    </FlowTransitionBoundary>
  );
};
