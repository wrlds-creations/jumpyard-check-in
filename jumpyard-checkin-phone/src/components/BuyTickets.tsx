'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, ChevronDown, Minus, Phone, Plus, RefreshCw } from 'lucide-react';
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
import type { Addon, AddonId, Booking } from '@/flow/types';
import { ADDON_CATALOG_CONFIG, BUY_ENTRY_ADDON_IDS } from '@/flow/addonCatalog';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { RollerPaymentDropIn } from '@/components/RollerPaymentDropIn';
import { SkyRiderAttest } from '@/components/SkyRiderAttest';

interface BuyTicketsProps {
  onBack: () => void;
  onBookingReady: (booking: Booking) => void;
}

type Step = 'TIMESLOT' | 'PRODUCT' | 'QUANTITY' | 'ADDONS' | 'SKYRIDER_ATTEST' | 'CONTACT' | 'REVIEW' | 'PAYMENT' | 'PENDING';

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
  price: number;
  unit: string;
  maxPerGuest: number;
  icon: JumpyardIconName;
  rollerProductId: number;
  requiresAvailability: boolean;
}

type AddonQuantityMap = Record<AddonId, number>;

const createEmptyAddonQty = (): AddonQuantityMap => ({
  skyrider: 0,
  connected: 0,
  coffee: 0,
  extra_person: 0,
  lock: 0,
  socks: 0,
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

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value)} kr`;
}

function buildGiftCardInputs(value: string): NewBookingGiftCardInput[] {
  const giftCardNumber = value.trim();
  return giftCardNumber ? [{ giftCardNumber }] : [];
}

function buildDiscountCodeInputs(value: string): NewBookingDiscountCodeInput[] {
  const code = value.trim();
  return code ? [{ code }] : [];
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

function buildProductLabelMap(
  selectedProduct: NewBookingProduct | null,
  buyAddons: BuyAddonEntry[]
) {
  const labels = new Map<string, string>();
  if (selectedProduct?.productId !== null && selectedProduct?.productId !== undefined) {
    labels.set(String(selectedProduct.productId), selectedProduct.label);
  }
  for (const addon of buyAddons) {
    labels.set(String(addon.rollerProductId), addon.label);
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

function getMaxQuantity(product: NewBookingProduct | null) {
  if (!product?.available) return 0;
  if (product.capacityRemaining === null) return 10;

  const unitCapacity =
    product.type === 'family'
      ? Math.floor(product.capacityRemaining / Math.max(1, product.jumpersPerUnit))
      : product.capacityRemaining;

  return Math.max(0, Math.min(10, unitCapacity));
}

function getCapacityRemaining(product: NewBookingProduct | null) {
  if (!product?.available) return 0;
  return product.capacityRemaining;
}

function getCapacityLabel(product: NewBookingProduct | null, spotsAvailable: string, spotsLeft: string) {
  const capacityRemaining = getCapacityRemaining(product);
  return capacityRemaining === null ? spotsAvailable : `${capacityRemaining} ${spotsLeft}`;
}

function getJumperCount(product: NewBookingProduct | null, nextQuantity: number) {
  return product?.type === 'family'
    ? nextQuantity * Math.max(1, product.jumpersPerUnit)
    : nextQuantity;
}

function getAddonMaxQuantity(
  addon: BuyAddonEntry,
  addonAvailability: NewBookingProduct | null,
  jumperCount: number
) {
  const baseMax = Math.max(1, jumperCount * addon.maxPerGuest);
  if (!addon.requiresAvailability) return baseMax;
  if (!addonAvailability?.available || !addonAvailability.productId) return 0;
  if (addonAvailability.capacityRemaining === null) return baseMax;
  return Math.max(0, Math.min(baseMax, addonAvailability.capacityRemaining));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  return value.replace(/\D/g, '').length >= 6;
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
  }
}

function getAddonUnit(id: AddonId, labels: ReturnType<typeof useTranslation>['t']['addons']) {
  if (id === 'skyrider' || id === 'connected') return labels.perJumper;
  if (id === 'extra_person') return labels.perPerson;
  return labels.each;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBuyProgressIndex(step: Step) {
  if (step === 'ADDONS' || step === 'SKYRIDER_ATTEST') return 1;
  if (step === 'CONTACT' || step === 'REVIEW' || step === 'PAYMENT' || step === 'PENDING') return 2;
  return 0;
}

function AvailabilityLoadingCard({ selectedTime }: { selectedTime: string | null }) {
  const { t } = useTranslation();

  return (
    <div
      className="bg-surface border border-border rounded-2xl p-6 text-center"
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

function BuyEntryProgress({ step }: { step: Step }) {
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

export const BuyTickets = ({ onBack, onBookingReady }: BuyTicketsProps) => {
  const { t } = useTranslation();
  const slots = useMemo(() => generateSlots(), []);

  const [step, setStep] = useState<Step>('TIMESLOT');
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
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);
  const [paymentInputsDirty, setPaymentInputsDirty] = useState(false);
  const [skyriderConsentConfirmed, setSkyriderConsentConfirmed] = useState(false);
  const [quote, setQuote] = useState<NewBookingQuote | null>(null);
  const [draft, setDraft] = useState<NewBookingDraftResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentSyncing, setPaymentSyncing] = useState(false);
  const [paymentSyncError, setPaymentSyncError] = useState<string | null>(null);

  const selectedSlot = availability?.slots.find((slot) => slot.startTime === selectedTime) ?? null;
  const entryProducts = selectedSlot?.products.filter((product) => product.type === 'entry') ?? [];
  const familyProducts = selectedSlot?.products.filter((product) => product.type === 'family') ?? [];
  const maxQuantity = getMaxQuantity(selectedProduct);
  const jumperCount = getJumperCount(selectedProduct, quantity);
  const buyAddons = useMemo<BuyAddonEntry[]>(
    () =>
      BUY_ENTRY_ADDON_IDS.map((id) => {
        const config = ADDON_CATALOG_CONFIG[id];
        return {
          id,
          icon: config.icon as JumpyardIconName,
          label: getAddonLabel(id, t.addons.products),
          maxPerGuest: config.maxPerGuest,
          price: config.price,
          requiresAvailability: config.requiresAvailability,
          rollerProductId: config.rollerProductId,
          unit: getAddonUnit(id, t.addons),
        };
      }).filter((addon): addon is BuyAddonEntry => addon.rollerProductId !== null),
    [t]
  );
  const addonAvailabilityById = new Map<AddonId, NewBookingProduct>();
  for (const product of selectedSlot?.products ?? []) {
    if (product.type === 'addon') {
      addonAvailabilityById.set(product.key as AddonId, product);
    }
  }
  const getBuyAddonMax = (addon: BuyAddonEntry, nextJumperCount = jumperCount) =>
    getAddonMaxQuantity(addon, addonAvailabilityById.get(addon.id) ?? null, nextJumperCount);
  const visibleBuyAddons = buyAddons.filter((addon) => getBuyAddonMax(addon) > 0);
  const selectedAddons: Addon[] = buyAddons
    .filter((addon) => addonQty[addon.id] > 0 && getBuyAddonMax(addon) > 0)
    .map((addon) => ({
      id: addon.id,
      label: addon.label,
      price: addon.price,
      qty: Math.min(addonQty[addon.id], getBuyAddonMax(addon)),
      requiresAvailability: addon.requiresAvailability,
      rollerProductId: addon.rollerProductId,
    }));
  const addonsTotal = selectedAddons.reduce((total, addon) => total + addon.price * addon.qty, 0);
  const skyriderSelected = selectedAddons.some((addon) => addon.id === 'skyrider');
  const entryTotal = (selectedProduct?.unitPrice ?? 0) * quantity;
  const basketEstimateTotal = entryTotal + addonsTotal;
  const shouldPrecheckBasketAvailability = selectedProduct !== null;
  const giftCardInputs = buildGiftCardInputs(giftCardNumber);
  const discountCodeInputs = buildDiscountCodeInputs(clipCardCode);
  const productLabels = buildProductLabelMap(selectedProduct, buyAddons);
  const giftCardErrors = quote?.giftCards?.errors ?? [];
  const discountCodeErrors = quote?.discountCodes?.errors ?? [];
  const paymentInputsHaveValues = Boolean(giftCardNumber.trim() || clipCardCode.trim());
  const paymentInputsBlockingErrors =
    !paymentInputsDirty && (giftCardErrors.length > 0 || discountCodeErrors.length > 0);
  const giftCardAppliedAmount = getGiftCardAppliedAmount(quote);
  const discountCodeAppliedAmount = getDiscountCodeAppliedAmount(quote);
  const draftAmountOwing = getDraftAmountOwing(draft);
  const noPaymentRequired = draftAmountOwing !== null && draftAmountOwing <= 0;
  const basketLines = [
    ...(selectedProduct
      ? [
          {
            key: 'entry',
            label: selectedProduct.label,
            qty: quantity,
            total: entryTotal,
            icon: 'admission-ticket' as JumpyardIconName,
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
    isValidEmail(email) &&
    isValidPhone(phone);

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
    setQuote(null);
    setDraft(null);
    setPaymentSyncError(null);
    setGiftCardNumber('');
    setClipCardCode('');
    setPaymentOptionsOpen(false);
    setPaymentInputsDirty(false);
    setSkyriderConsentConfirmed(false);
  };

  const handleProductSelect = (product: NewBookingProduct) => {
    const max = getMaxQuantity(product);
    if (max <= 0) return;
    setSelectedProduct(product);
    setQuantity(1);
    setAddonQty(createEmptyAddonQty());
    setQuote(null);
    setDraft(null);
    setPaymentSyncError(null);
    setSkyriderConsentConfirmed(false);
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
    setQuote(null);
    setDraft(null);
    setPaymentSyncError(null);
    setSkyriderConsentConfirmed(false);
  };

  const updateGiftCardNumber = (value: string) => {
    setGiftCardNumber(value);
    setSubmitError(null);
    setDraft(null);
    setPaymentSyncError(null);
    if (quote) setPaymentInputsDirty(true);
  };

  const updateClipCardCode = (value: string) => {
    setClipCardCode(value);
    setSubmitError(null);
    setDraft(null);
    setPaymentSyncError(null);
    if (quote) setPaymentInputsDirty(true);
  };

  const setOneAddon = (id: AddonId, nextQty: number) => {
    setSubmitError(null);
    setQuote(null);
    setDraft(null);
    setPaymentSyncError(null);
    const addon = buyAddons.find((entry) => entry.id === id);
    const max = addon ? getBuyAddonMax(addon) : 0;
    if (id === 'skyrider') setSkyriderConsentConfirmed(false);
    setAddonQty((current) => ({ ...current, [id]: Math.max(0, Math.min(max, nextQty)) }));
  };

  const needsSkyRiderConsent = () => skyriderSelected && !skyriderConsentConfirmed;

  const continueFromAddons = () => {
    if (needsSkyRiderConsent()) {
      setStep('SKYRIDER_ATTEST');
      return;
    }

    setStep('CONTACT');
  };

  const buildCustomer = (): NewBookingCustomer => ({
    email: email.trim(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
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

  const goToReview = async () => {
    if (!selectedProduct || !customerValid || submitting) return;
    if (needsSkyRiderConsent()) {
      setStep('SKYRIDER_ATTEST');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await quoteNewBooking(
        buildCustomer(),
        buildItems(),
        shouldPrecheckBasketAvailability,
        giftCardInputs,
        discountCodeInputs
      );
      setQuote(result);
      setPaymentInputsDirty(false);
      setStep('REVIEW');
    } catch (error) {
      setSubmitError(formatBuyFlowError(error, t.buy, productLabels, t.buy.quoteFailed));
    } finally {
      setSubmitting(false);
    }
  };

  const createDraft = async () => {
    if (!selectedProduct || !quote || submitting) return;
    if (needsSkyRiderConsent()) {
      setStep('SKYRIDER_ATTEST');
      return;
    }
    if (paymentInputsDirty) {
      setSubmitError(t.buy.paymentOptionsUpdateRequired);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const itemKey = basketLines.map((line) => `${line.key}-${line.qty}`).join(':');
      if (paymentInputsBlockingErrors) return;

      const result = await createDraftBooking(
        buildCustomer(),
        buildItems(),
        `phone-draft:${selectedProduct.productId}:${selectedProduct.startTime}:${itemKey}:${Date.now().toString(36)}`,
        shouldPrecheckBasketAvailability,
        giftCardInputs,
        discountCodeInputs
      );
      setDraft(result);
      setPaymentSyncError(null);
      if (getDraftAmountOwing(result) !== null && getDraftAmountOwing(result)! <= 0) {
        setStep('PENDING');
        void resolvePaidDraftBooking(result);
        return;
      }
      setStep(canStartPayment(result) ? 'PAYMENT' : 'PENDING');
    } catch (error) {
      setSubmitError(formatBuyFlowError(error, t.buy, productLabels, t.buy.draftFailed));
    } finally {
      setSubmitting(false);
    }
  };

  const resolvePaidDraftBooking = async (draftOverride?: NewBookingDraftResult) => {
    const activeDraft = draftOverride ?? draft;
    const identifier = activeDraft?.draft.bookingReference ?? activeDraft?.draft.uniqueId;
    if (!identifier || paymentSyncing) return;

    setPaymentSyncing(true);
    setPaymentSyncError(null);
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const booking = await lookupBooking(identifier);
          onBookingReady(booking);
          return;
        } catch {
          await wait(2000);
        }
      }

      setPaymentSyncError(t.buy.paymentSyncFailed);
    } finally {
      setPaymentSyncing(false);
    }
  };

  const backFromStep = () => {
    if (step === 'PAYMENT' || step === 'PENDING') {
      onBack();
      return;
    }
    if (step === 'REVIEW') setStep('CONTACT');
    else if (step === 'CONTACT') setStep('ADDONS');
    else if (step === 'SKYRIDER_ATTEST') setStep('ADDONS');
    else if (step === 'ADDONS') setStep('QUANTITY');
    else if (step === 'QUANTITY') setStep('PRODUCT');
    else if (step === 'PRODUCT') setStep('TIMESLOT');
    else onBack();
  };

  const renderProductCard = (product: NewBookingProduct) => {
    const max = getMaxQuantity(product);
    const available = product.available && max > 0 && product.productId !== null;
    return (
      <button
        key={product.key}
        onClick={() => available && handleProductSelect(product)}
        disabled={!available}
        className={`p-3.5 rounded-xl text-left flex items-center gap-3 transition-all border ${
          available
            ? 'bg-white border-border active:scale-[0.98]'
            : 'bg-surface-strong border-border opacity-50 cursor-not-allowed'
        }`}
      >
        <JumpyardIcon name="admission-ticket" className="w-9 h-9 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-black italic uppercase ${available ? 'text-foreground' : 'text-muted'}`}>
            {product.label}
          </p>
          <p className={`text-[10px] font-bold italic uppercase tracking-wider mt-0.5 ${
            available ? 'text-muted' : 'text-muted/70'
          }`}>
            {available
              ? getCapacityLabel(product, t.buy.spotsAvailable, t.buy.spotsLeft)
              : t.buy.spotsFull}
          </p>
        </div>
        <p className={`text-base font-black italic ${available ? 'text-primary' : 'text-muted/60'}`}>
          {formatMoney(product.unitPrice)}
        </p>
      </button>
    );
  };

  return (
    <motion.div
      className="w-full max-w-md mx-auto px-4"
      data-prepayment-status={draft?.prepayment?.status ?? ''}
      data-prepayment-draft-id={draft?.prepayment?.prepaymentDraftId ?? ''}
      data-payment-syncing={String(paymentSyncing)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <BuyEntryProgress step={step} />

      <button
        onClick={backFromStep}
        className="mb-4 flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
      >
        <ArrowLeft size={14} /> {t.common.back}
      </button>

      {step === 'TIMESLOT' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">
            {t.buy.selectTime}
          </h2>
          <p className="text-muted text-xs mb-4 text-center">{t.buy.selectTimeDesc}</p>

          {availabilityError && (
            <div className="mb-4 bg-white border border-danger/25 rounded-xl p-3 text-sm text-foreground flex gap-2">
              <AlertCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
              <span>{availabilityError}</span>
            </div>
          )}

          {loadingAvailability ? (
            <AvailabilityLoadingCard selectedTime={selectedTime} />
          ) : (
            <>
              <div className="flex flex-col gap-2 mb-5">
                {slots.map((time) => {
                  const isSelected = selectedTime === time;
                  return (
                    <button
                      key={time}
                      onClick={() => handleTimeSelect(time)}
                      className={`w-full p-3.5 rounded-xl text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-primary text-white border-2 border-primary'
                          : 'bg-white border border-border active:scale-[0.98]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={isSelected ? 'rounded-md bg-white' : ''}>
                          <JumpyardIcon name="time" className="w-7 h-7" />
                        </span>
                        <span className={`text-lg font-black italic ${isSelected ? 'text-white' : 'text-foreground'}`}>
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
                {t.common.continue} <Check size={18} />
              </button>
            </>
          )}

          {availabilityError && (
            <button
              onClick={() => selectedTime && void loadAvailability([selectedTime])}
              disabled={loadingAvailability}
              className="mt-3 w-full bg-white border border-border text-foreground font-black italic uppercase text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={15} /> {t.buy.retryAvailability}
            </button>
          )}
        </motion.div>
      )}

      {step === 'PRODUCT' && (
        <>
          <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">
            {t.buy.selectTicket}
          </h2>
          {selectedTime && (
            <p className="text-muted text-xs mb-4 text-center flex items-center justify-center gap-1.5">
              <JumpyardIcon name="time" className="w-5 h-5" /> {selectedTime}
            </p>
          )}

          <div className="mb-3">
            <p className="text-[10px] text-muted uppercase font-bold italic tracking-widest mb-2 px-1">{t.buy.sectionEntry}</p>
            <div className="flex flex-col gap-2">{entryProducts.map(renderProductCard)}</div>
          </div>

          <div>
            <p className="text-[10px] text-muted uppercase font-bold italic tracking-widest mb-2 px-1">{t.buy.sectionFamily}</p>
            <div className="flex flex-col gap-2">{familyProducts.map(renderProductCard)}</div>
          </div>
        </>
      )}

      {step === 'QUANTITY' && selectedProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full bg-surface border border-border p-5 rounded-2xl text-center">
            <div className="bg-white border border-border rounded-xl px-3 py-2 mb-4 inline-flex items-center gap-2">
              <JumpyardIcon name="admission-ticket" className="w-6 h-6" />
              <span className="text-sm font-bold italic text-foreground">{selectedProduct.label}</span>
              {selectedProduct.type === 'family' && (
                <span className="text-[10px] text-muted">· {t.buy.familyNote}</span>
              )}
            </div>

            <h2 className="text-xl font-black italic text-foreground uppercase mb-1">
              {selectedProduct.type === 'family' ? t.buy.quantityPackages : t.buy.quantityJumpers}
            </h2>
            <p className="text-muted text-xs mb-4 flex items-center justify-center gap-1">
              <JumpyardIcon name="time" className="w-5 h-5" /> {selectedProduct.startTime}
            </p>

            <div className="flex items-center justify-center gap-6 mb-2">
              <button
                onClick={() => updateQuantity(quantity - 1)}
                disabled={quantity <= 1}
                className="w-12 h-12 rounded-full bg-surface-strong border border-border flex items-center justify-center text-foreground text-xl font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Minus size={20} />
              </button>
              <span className="text-4xl font-black italic text-foreground w-16 text-center">{quantity}</span>
              <button
                onClick={() => updateQuantity(quantity + 1)}
                disabled={quantity >= maxQuantity}
                className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={20} />
              </button>
            </div>
            <p className="text-[10px] text-muted uppercase font-bold italic tracking-wider mb-5">
              {maxQuantity > 0
                ? `${getCapacityLabel(selectedProduct, t.buy.spotsAvailable, t.buy.spotsLeft)} · ${
                    t.buy.maxReached
                  } ${maxQuantity}`
                : t.buy.spotsFull}
            </p>

            <div className="bg-white border border-border p-3 rounded-xl mb-5 flex justify-between items-center px-4">
              <span className="text-muted text-sm font-bold italic uppercase">{t.buy.total}</span>
              <span className="text-xl font-black italic text-primary">
                {formatMoney((selectedProduct.unitPrice ?? 0) * quantity)}
              </span>
            </div>

            <button
              onClick={() => setStep('ADDONS')}
              className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {t.common.continue} <Check size={18} />
            </button>
          </div>
        </motion.div>
      )}

      {step === 'ADDONS' && selectedProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex flex-col"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="text-center mb-3">
            <h2 className="text-xl font-black italic text-foreground uppercase mb-1">{t.addons.title}</h2>
            <p className="text-muted text-xs">{t.addons.description}</p>
          </div>

          <div className="flex-1 flex flex-col gap-2 mb-4">
            {visibleBuyAddons.map((addon) => {
              const value = addonQty[addon.id];
              const max = getBuyAddonMax(addon);

              return (
                <div
                  key={addon.id}
                  className="bg-white border border-border rounded-xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <JumpyardIcon name={addon.icon} className="w-9 h-9 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-black italic text-foreground uppercase truncate">{addon.label}</p>
                      <p className="text-[11px] text-muted">
                        {formatMoney(addon.price)} - {addon.unit}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOneAddon(addon.id, value - 1)}
                      disabled={value <= 0}
                      className="w-9 h-9 rounded-full bg-surface-strong border border-border flex items-center justify-center text-foreground disabled:opacity-30"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="text-xl font-black italic text-foreground w-7 text-center">{value}</span>
                    <button
                      onClick={() => setOneAddon(addon.id, Math.min(max, value + 1))}
                      disabled={value >= max}
                      className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-30"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-border p-3 rounded-xl mb-4 flex justify-between items-center px-4">
            <span className="text-muted text-sm font-bold italic uppercase">{t.buy.total}</span>
            <span className="text-xl font-black italic text-primary">{formatMoney(basketEstimateTotal)}</span>
          </div>

          <button
            onClick={continueFromAddons}
            className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {t.common.continue} <Check size={18} />
          </button>
        </motion.div>
      )}

      {step === 'SKYRIDER_ATTEST' && (
        <SkyRiderAttest
          onComplete={() => {
            setSkyriderConsentConfirmed(true);
            setStep('CONTACT');
          }}
        />
      )}

      {step === 'CONTACT' && selectedProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex flex-col items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full bg-surface border border-border p-5 rounded-2xl">
            <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">{t.buy.contactTitle}</h2>
            <p className="text-muted text-xs mb-5 text-center">{t.buy.contactDesc}</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <label>
                <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest block mb-1">
                  {t.buy.firstNameLabel}
                </span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  className="w-full bg-white border border-border rounded-xl px-3 py-3 text-base text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                />
              </label>
              <label>
                <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest block mb-1">
                  {t.buy.lastNameLabel}
                </span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  className="w-full bg-white border border-border rounded-xl px-3 py-3 text-base text-foreground focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                />
              </label>
            </div>

            <label className="block mb-3">
              <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                <JumpyardIcon name="email-confirmed" className="w-5 h-5" /> {t.buy.emailLabel}
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t.buy.emailPlaceholder}
                autoComplete="email"
                className="w-full bg-white border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/40 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
              />
            </label>

            <label className="block mb-5">
              <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                <Phone size={14} className="text-primary" /> {t.buy.phoneLabel}
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={t.buy.phonePlaceholder}
                autoComplete="tel"
                className="w-full bg-white border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/40 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
              />
            </label>

            {submitError && (
              <p className="mb-4 text-sm text-danger font-bold italic">{submitError}</p>
            )}

            <button
              onClick={goToReview}
              disabled={!customerValid || submitting}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {submitting ? t.buy.quoting : t.common.continue} {!submitting && <Check size={18} />}
            </button>
          </div>
        </motion.div>
      )}

      {step === 'REVIEW' && selectedProduct && quote && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full bg-surface border border-border p-5 rounded-2xl">
            <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">{t.buy.reviewTitle}</h2>
            <p className="text-muted text-xs mb-5 text-center">{t.buy.reviewDesc}</p>

            <div className="bg-white border border-border rounded-xl p-3 mb-4">
              <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold italic uppercase text-muted">
                <JumpyardIcon name="time" className="h-5 w-5" />
                <span>{t.buy.jumpTimeLabel} {selectedProduct.startTime}</span>
              </div>
              <div className="space-y-2">
                {basketLines.map((line) => (
                  <div key={line.key} className="flex items-center gap-2 rounded-lg bg-surface/60 px-2.5 py-2">
                    <JumpyardIcon name={line.icon} className="h-7 w-7 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black italic uppercase text-foreground">{line.label}</p>
                      <p className="text-[11px] text-muted">{line.qty} st</p>
                    </div>
                    <span className="text-sm font-black italic text-foreground">{formatMoney(line.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-border rounded-xl mb-4 overflow-hidden">
              <button
                type="button"
                onClick={() => setPaymentOptionsOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <JumpyardIcon name="payment-card" className="h-8 w-8 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-black italic uppercase text-foreground">{t.buy.paymentOptionsTitle}</p>
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  className={`flex-shrink-0 text-muted transition-transform ${
                    paymentOptionsOpen || paymentInputsHaveValues ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {(paymentOptionsOpen || paymentInputsHaveValues) && (
                <div className="border-t border-border p-3">
                  <label className="block mb-3">
                    <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                      <JumpyardIcon name="presentkort" className="h-5 w-5" /> {t.buy.giftCardLabel}
                    </span>
                    <input
                      type="text"
                      value={giftCardNumber}
                      onChange={(event) => updateGiftCardNumber(event.target.value)}
                      placeholder={t.buy.giftCardPlaceholder}
                      autoComplete="off"
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/40 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                    />
                    <p className="mt-1 text-[11px] text-muted">{t.buy.giftCardHelp}</p>
                  </label>

                  <label className="block">
                    <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                      <JumpyardIcon name="points-star" className="h-5 w-5" /> {t.buy.clipCardLabel}
                    </span>
                    <input
                      type="text"
                      value={clipCardCode}
                      onChange={(event) => updateClipCardCode(event.target.value)}
                      placeholder={t.buy.clipCardPlaceholder}
                      autoComplete="off"
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/40 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                    />
                    <p className="mt-1 text-[11px] text-muted">{t.buy.clipCardHelp}</p>
                  </label>

                  {paymentInputsDirty && (
                    <button
                      type="button"
                      onClick={() => void goToReview()}
                      disabled={submitting}
                      className="mt-3 w-full bg-foreground text-white font-black italic uppercase text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]"
                    >
                      {submitting ? t.buy.quoting : t.buy.paymentOptionsUpdate}
                    </button>
                  )}
                </div>
              )}
            </div>

            {!paymentInputsDirty && giftCardNumber.trim() && (
              <div
                className={`bg-white border rounded-xl p-3 mb-4 ${
                  giftCardErrors.length > 0 ? 'border-danger/30' : 'border-border'
                }`}
              >
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted font-bold italic uppercase">{t.buy.giftCardLabel}</span>
                  <span className={`font-black ${giftCardErrors.length > 0 ? 'text-danger' : 'text-primary'}`}>
                    {giftCardErrors.length > 0
                      ? t.buy.giftCardRejected
                      : giftCardAppliedAmount !== null && giftCardAppliedAmount > 0
                        ? `-${formatMoney(giftCardAppliedAmount)}`
                        : t.buy.giftCardApplied}
                  </span>
                </div>
                {giftCardErrors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {giftCardErrors.map((error, index) => (
                      <p key={`${error.code ?? 'gift-card'}-${index}`} className="text-sm text-danger font-bold">
                        {error.message || t.buy.giftCardErrorFallback}
                      </p>
                    ))}
                    <p className="text-xs text-muted">{t.buy.giftCardFixHint}</p>
                  </div>
                )}
              </div>
            )}

            {!paymentInputsDirty && clipCardCode.trim() && (
              <div
                className={`bg-white border rounded-xl p-3 mb-4 ${
                  discountCodeErrors.length > 0 ? 'border-danger/30' : 'border-border'
                }`}
              >
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted font-bold italic uppercase">{t.buy.clipCardLabel}</span>
                  <span className={`font-black ${discountCodeErrors.length > 0 ? 'text-danger' : 'text-primary'}`}>
                    {discountCodeErrors.length > 0
                      ? t.buy.clipCardRejected
                      : discountCodeAppliedAmount !== null && discountCodeAppliedAmount > 0
                        ? `-${formatMoney(discountCodeAppliedAmount)}`
                        : t.buy.clipCardApplied}
                  </span>
                </div>
                {discountCodeErrors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {discountCodeErrors.map((error, index) => (
                      <p key={`${error.code ?? 'clip-card'}-${index}`} className="text-sm text-danger font-bold">
                        {error.message || t.buy.clipCardErrorFallback}
                      </p>
                    ))}
                    <p className="text-xs text-muted">{t.buy.clipCardFixHint}</p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-border p-3 rounded-xl mb-5 px-4">
              <div className="flex justify-between items-center">
                <span className="text-muted text-sm font-bold italic uppercase">{t.buy.toPay}</span>
                <span className="text-xl font-black italic text-primary">{formatMoney(quote.costs.amountOwing)}</span>
              </div>
              {quote.costs.total !== null && quote.costs.amountOwing !== null && quote.costs.total !== quote.costs.amountOwing && (
                <div className="mt-1 flex justify-between gap-3 text-[11px] text-muted">
                  <span>{t.buy.originalTotal}</span>
                  <span>{formatMoney(quote.costs.total)}</span>
                </div>
              )}
            </div>

            {submitError && <p className="mb-4 text-sm text-danger font-bold italic">{submitError}</p>}

            <button
              onClick={() => void createDraft()}
              disabled={submitting || paymentInputsDirty || paymentInputsBlockingErrors}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {submitting ? t.buy.creating : t.buy.createDraft} {!submitting && <Check size={18} />}
            </button>
          </div>
        </motion.div>
      )}

      {step === 'PAYMENT' && draft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full flex items-center justify-center"
          style={{ minHeight: 'calc(100dvh - 160px)' }}
        >
          <div className="w-full bg-surface border border-border p-5 rounded-2xl">
            <RollerPaymentDropIn
              amountLabel={formatMoney(draft.prepayment?.amountOwing ?? draft.draft.costs.amountOwing)}
              paymentSession={draft.paymentSession}
              onApproved={() => {
                void resolvePaidDraftBooking();
              }}
              onFailed={() => undefined}
            />

            {paymentSyncing && (
              <p className="mt-4 text-xs text-muted font-bold italic uppercase">{t.buy.paymentSyncing}</p>
            )}

            {paymentSyncError && (
              <>
                <p className="mt-4 text-sm text-danger font-bold italic">{paymentSyncError}</p>
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
        </motion.div>
      )}

      {step === 'PENDING' && draft && (
        <motion.div
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
        </motion.div>
      )}
    </motion.div>
  );
};
