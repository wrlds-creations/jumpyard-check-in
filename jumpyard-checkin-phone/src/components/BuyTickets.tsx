'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, CreditCard, Minus, Plus, RefreshCw } from 'lucide-react';
import {
  CloudBookingError,
  createDraftBooking,
  getNewBookingAvailability,
  lookupBooking,
  quoteNewBooking,
  type NewBookingAvailability,
  type NewBookingCustomer,
  type NewBookingDraftResult,
  type NewBookingItemRequest,
  type NewBookingProduct,
  type NewBookingQuote,
} from '@/flow/cloudClient';
import type { Addon, AddonId, Booking } from '@/flow/types';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { RollerPaymentDropIn } from '@/components/RollerPaymentDropIn';

interface BuyTicketsProps {
  onBack: () => void;
  onBookingReady: (booking: Booking) => void;
}

type Step = 'TIMESLOT' | 'PRODUCT' | 'QUANTITY' | 'ADDONS' | 'CONTACT' | 'REVIEW' | 'PAYMENT' | 'PENDING';

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

const BUY_ADDON_PRODUCTS: Record<AddonId, { rollerProductId: number | null; requiresAvailability: boolean }> = {
  skyrider: { rollerProductId: 1765443, requiresAvailability: true },
  connected: { rollerProductId: null, requiresAvailability: false },
  coffee: { rollerProductId: 1765452, requiresAvailability: false },
  extra_person: { rollerProductId: null, requiresAvailability: true },
  lock: { rollerProductId: 1765441, requiresAvailability: false },
  socks: { rollerProductId: 1765445, requiresAvailability: false },
};

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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      [
        { id: 'skyrider', label: t.addons.products.skyriderLabel, price: 45, unit: t.addons.perJumper, maxPerGuest: 1, icon: 'zipline', ...BUY_ADDON_PRODUCTS.skyrider },
        { id: 'socks', label: t.addons.products.socksLabel, price: 40, unit: t.addons.each, maxPerGuest: 4, icon: 'grip-socks', ...BUY_ADDON_PRODUCTS.socks },
        { id: 'lock', label: t.addons.products.lockLabel, price: 40, unit: t.addons.each, maxPerGuest: 1, icon: 'padlock', ...BUY_ADDON_PRODUCTS.lock },
        { id: 'coffee', label: t.addons.products.coffeeLabel, price: 35, unit: t.addons.each, maxPerGuest: 4, icon: 'drink-cup', ...BUY_ADDON_PRODUCTS.coffee },
      ].filter((addon): addon is BuyAddonEntry => addon.rollerProductId !== null),
    [t]
  );
  const selectedAddons: Addon[] = useMemo(
    () =>
      buyAddons.filter((addon) => addonQty[addon.id] > 0).map((addon) => ({
        id: addon.id,
        label: addon.label,
        price: addon.price,
        qty: addonQty[addon.id],
        requiresAvailability: addon.requiresAvailability,
        rollerProductId: addon.rollerProductId,
      })),
    [addonQty, buyAddons]
  );
  const addonsTotal = selectedAddons.reduce((total, addon) => total + addon.price * addon.qty, 0);
  const entryTotal = (selectedProduct?.unitPrice ?? 0) * quantity;
  const basketEstimateTotal = entryTotal + addonsTotal;
  const shouldPrecheckBasketAvailability = selectedAddons.every((addon) => addon.requiresAvailability === true);
  const basketLines = [
    ...(selectedProduct
      ? [
          {
            key: 'entry',
            label: selectedProduct.label,
            qty: quantity,
            total: entryTotal,
          },
        ]
      : []),
    ...selectedAddons.map((addon) => ({
      key: addon.id,
      label: addon.label,
      qty: addon.qty,
      total: addon.price * addon.qty,
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
    setStep('QUANTITY');
  };

  const updateQuantity = (nextQuantity: number) => {
    const clampedQuantity = Math.max(1, Math.min(maxQuantity || 1, nextQuantity));
    const nextJumperCount = getJumperCount(selectedProduct, clampedQuantity);
    setQuantity(clampedQuantity);
    setAddonQty((current) => {
      const next = { ...current };
      for (const addon of buyAddons) {
        next[addon.id] = Math.min(next[addon.id], Math.max(1, nextJumperCount * addon.maxPerGuest));
      }
      return next;
    });
    setQuote(null);
    setDraft(null);
    setPaymentSyncError(null);
  };

  const setOneAddon = (id: AddonId, nextQty: number) => {
    setSubmitError(null);
    setQuote(null);
    setDraft(null);
    setPaymentSyncError(null);
    setAddonQty((current) => ({ ...current, [id]: Math.max(0, nextQty) }));
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
        startTime: selectedProduct.startTime,
      },
      ...selectedAddons.map((addon) => ({
        bookingDate: availability.date,
        productId: Number(addon.rollerProductId),
        quantity: addon.qty,
        startTime: selectedProduct.startTime,
      })),
    ];
  };

  const goToReview = async () => {
    if (!selectedProduct || !customerValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await quoteNewBooking(buildCustomer(), buildItems(), shouldPrecheckBasketAvailability);
      setQuote(result);
      setStep('REVIEW');
    } catch (error) {
      setSubmitError(error instanceof CloudBookingError ? error.message : t.buy.quoteFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const createDraft = async () => {
    if (!selectedProduct || !quote || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const itemKey = basketLines.map((line) => `${line.key}-${line.qty}`).join(':');
      const result = await createDraftBooking(
        buildCustomer(),
        buildItems(),
        `phone-draft:${selectedProduct.productId}:${selectedProduct.startTime}:${itemKey}:${Date.now().toString(36)}`,
        shouldPrecheckBasketAvailability
      );
      setDraft(result);
      setPaymentSyncError(null);
      setStep(canStartPayment(result) ? 'PAYMENT' : 'PENDING');
    } catch (error) {
      setSubmitError(error instanceof CloudBookingError ? error.message : t.buy.draftFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const resolvePaidDraftBooking = async () => {
    const identifier = draft?.draft.uniqueId ?? draft?.draft.bookingReference;
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

          <div className="flex flex-col gap-2 mb-5">
            {slots.map((time) => {
              const anyAvailable = !loadingAvailability;
              const isSelected = selectedTime === time;
              return (
                <button
                  key={time}
                  onClick={() => anyAvailable && handleTimeSelect(time)}
                  disabled={!anyAvailable}
                  className={`w-full p-3.5 rounded-xl text-left flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-primary text-white border-2 border-primary'
                      : anyAvailable
                      ? 'bg-white border border-border active:scale-[0.98]'
                      : 'bg-surface-strong border border-border opacity-50 cursor-not-allowed'
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
                  {loadingAvailability ? (
                    <span className={`text-[10px] font-bold italic uppercase tracking-wider ${isSelected ? 'text-white/70' : 'text-muted'}`}>
                      {t.common.loading}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => selectedTime && void loadAvailability([selectedTime])}
            disabled={
              !selectedTime ||
              loadingAvailability
            }
            className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loadingAvailability ? t.common.loading : t.common.continue} <Check size={18} />
          </button>

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
            {buyAddons.map((addon) => {
              const value = addonQty[addon.id];
              const max = Math.max(1, jumperCount * addon.maxPerGuest);

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
            onClick={() => setStep('CONTACT')}
            className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {t.common.continue} <Check size={18} />
          </button>
        </motion.div>
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
              <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest block mb-1">
                {t.buy.phoneLabel}
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

            <div className="bg-white border border-border rounded-xl p-4 mb-4">
              <div className="space-y-2 mb-3">
                {basketLines.map((line) => (
                  <div key={line.key} className="flex justify-between gap-3 text-sm font-bold text-foreground">
                    <span>{line.label}</span>
                    <span>{line.qty} st - {formatMoney(line.total)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between gap-3 text-xs text-muted border-t border-border pt-3">
                <span>{selectedProduct.startTime}</span>
                <span>{formatMoney(quote.costs.total)}</span>
              </div>
            </div>

            <div className="bg-white border border-border p-3 rounded-xl mb-5 flex justify-between items-center px-4">
              <span className="text-muted text-sm font-bold italic uppercase">{t.buy.total}</span>
              <span className="text-xl font-black italic text-primary">{formatMoney(quote.costs.amountOwing)}</span>
            </div>

            {submitError && <p className="mb-4 text-sm text-danger font-bold italic">{submitError}</p>}

            <button
              onClick={() => void createDraft()}
              disabled={submitting}
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
          <div className="w-full bg-surface border border-border p-5 rounded-2xl text-center">
            <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.buy.paymentTitle}</h2>
            <p className="text-muted text-sm mb-5">
              {formatMoney(draft.prepayment?.amountOwing ?? draft.draft.costs.amountOwing)}
            </p>

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
              <CreditCard size={28} className="text-primary" />
            </div>
            <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.buy.pendingTitle}</h2>
            <p className="text-muted text-sm mb-5">{t.buy.pendingDesc}</p>

            <div className="bg-white border border-border rounded-xl p-4 mb-5 text-left">
              <div className="flex justify-between gap-3 text-sm mb-2">
                <span className="text-muted font-bold italic uppercase">{t.buy.total}</span>
                <span className="font-black text-primary">{formatMoney(draft.prepayment?.amountOwing ?? draft.draft.costs.amountOwing)}</span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted">{t.buy.draftStatus}</span>
                <span className="font-bold text-foreground">{t.buy.paymentPending}</span>
              </div>
            </div>

            <button
              onClick={onBack}
              className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all active:scale-[0.98]"
            >
              {t.common.done}
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
