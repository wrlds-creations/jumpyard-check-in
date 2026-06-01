'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, CreditCard, Minus, Plus } from 'lucide-react';
import {
    CloudBookingError,
    createAddProductDraft,
    quoteAddProducts,
    type AddProductDraftResult,
    type NewBookingItemRequest,
    type NewBookingQuote,
} from '@/flow/cloudClient';
import type { Addon, AddonId, Booking } from '@/flow/types';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { RollerPaymentDropIn } from '@/components/RollerPaymentDropIn';

interface AddonsOfferProps {
    booking: Booking;
    guestCount: number;
    existingAddons: Addon[];
    onContinue: (result: {
        selectedAddons: Addon[];
        addonsTotal: number;
        skyriderSelected: boolean;
        connectedSelected: boolean;
        paymentHandled?: boolean;
    }) => void;
    onPendingDone: () => void;
}

interface CatalogEntry {
    id: AddonId;
    label: string;
    price: number;
    unit: string;
    description: string;
    maxPerGuest: number;
    icon: JumpyardIconName;
    rollerProductId: number | null;
    requiresAvailability: boolean;
}

type Step = 'SELECT' | 'REVIEW' | 'PAYMENT' | 'APPROVED' | 'PENDING';

const ADDON_PRODUCTS: Record<AddonId, { rollerProductId: number | null; requiresAvailability: boolean }> = {
    skyrider: { rollerProductId: 1765443, requiresAvailability: true },
    connected: { rollerProductId: null, requiresAvailability: false },
    coffee: { rollerProductId: 1765452, requiresAvailability: false },
    extra_person: { rollerProductId: null, requiresAvailability: true },
    lock: { rollerProductId: 1765441, requiresAvailability: false },
    socks: { rollerProductId: 1765445, requiresAvailability: false },
};

const VENUE_TIME_ZONE = 'Europe/Stockholm';

function Counter({
    disabled = false,
    max,
    min = 0,
    onChange,
    value,
}: {
    disabled?: boolean;
    max: number;
    min?: number;
    onChange: (n: number) => void;
    value: number;
}) {
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => onChange(Math.max(min, value - 1))}
                className="w-9 h-9 rounded-full bg-surface hover:bg-border border border-border text-foreground flex items-center justify-center disabled:opacity-30 disabled:bg-surface-strong"
                disabled={disabled || value <= min}
            >
                <Minus size={16} />
            </button>
            <span className="text-xl font-black italic text-foreground w-7 text-center">{value}</span>
            <button
                onClick={() => onChange(Math.min(max, value + 1))}
                className="w-9 h-9 rounded-full bg-primary hover:bg-surface border border-transparent hover:border-primary hover:text-primary text-white flex items-center justify-center disabled:opacity-30 disabled:hover:bg-primary disabled:hover:text-white"
                disabled={disabled || value >= max}
            >
                <Plus size={16} />
            </button>
        </div>
    );
}

function formatMoney(value: number | null | undefined) {
    if (value === null || value === undefined) return '-';
    return `${Math.round(value)} kr`;
}

function getVenueToday() {
    return new Intl.DateTimeFormat('sv-SE', {
        day: '2-digit',
        month: '2-digit',
        timeZone: VENUE_TIME_ZONE,
        year: 'numeric',
    }).format(new Date());
}

function normalizeStartTime(value?: string | null) {
    const match = value?.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function canStartPayment(draft: AddProductDraftResult) {
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

export const AddonsOffer = ({ booking, guestCount, existingAddons, onContinue, onPendingDone }: AddonsOfferProps) => {
    const { t } = useTranslation();
    const catalog = useMemo<CatalogEntry[]>(
        () => [
            { id: 'skyrider', label: t.addons.products.skyriderLabel, price: 45, unit: t.addons.perJumper, description: t.addons.products.skyriderDesc, maxPerGuest: 1, icon: 'zipline', ...ADDON_PRODUCTS.skyrider },
            { id: 'connected', label: t.addons.products.connectedLabel, price: 40, unit: t.addons.perJumper, description: t.addons.products.connectedDesc, maxPerGuest: 1, icon: 'connected-band', ...ADDON_PRODUCTS.connected },
            { id: 'socks', label: t.addons.products.socksLabel, price: 40, unit: t.addons.each, description: t.addons.products.socksDesc, maxPerGuest: 4, icon: 'grip-socks', ...ADDON_PRODUCTS.socks },
            { id: 'coffee', label: t.addons.products.coffeeLabel, price: 35, unit: t.addons.each, description: t.addons.products.coffeeDesc, maxPerGuest: 4, icon: 'drink-cup', ...ADDON_PRODUCTS.coffee },
            { id: 'extra_person', label: t.addons.products.extraPersonLabel, price: 179, unit: t.addons.perPerson, description: t.addons.products.extraPersonDesc, maxPerGuest: 4, icon: 'add-guest', ...ADDON_PRODUCTS.extra_person },
            { id: 'lock', label: t.addons.products.lockLabel, price: 40, unit: t.addons.each, description: t.addons.products.lockDesc, maxPerGuest: 1, icon: 'padlock', ...ADDON_PRODUCTS.lock },
        ],
        [t]
    );

    const minQty = useMemo(() => {
        const base: Record<AddonId, number> = { skyrider: 0, connected: 0, coffee: 0, extra_person: 0, lock: 0, socks: 0 };
        for (const addon of existingAddons) {
            if (addon.id in base) base[addon.id] = addon.qty;
        }
        return base;
    }, [existingAddons]);

    const [step, setStep] = useState<Step>('SELECT');
    const [qty, setQty] = useState<Record<AddonId, number>>(() => ({ ...minQty }));
    const [quote, setQuote] = useState<NewBookingQuote | null>(null);
    const [draft, setDraft] = useState<AddProductDraftResult | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const setOne = (id: AddonId, nextQty: number) => {
        setSubmitError(null);
        setQuote(null);
        setDraft(null);
        setQty((current) => ({ ...current, [id]: Math.max(minQty[id], nextQty) }));
    };

    const selectedAddons: Addon[] = useMemo(
        () =>
            catalog.filter((entry) => qty[entry.id] > 0).map((entry) => ({
                id: entry.id,
                label: entry.label,
                price: entry.price,
                qty: qty[entry.id],
                requiresAvailability: entry.requiresAvailability,
                rollerProductId: entry.rollerProductId,
            })),
        [catalog, qty]
    );

    const addedAddons: Addon[] = useMemo(
        () =>
            catalog.filter((entry) => qty[entry.id] > minQty[entry.id]).map((entry) => ({
                id: entry.id,
                label: entry.label,
                price: entry.price,
                qty: qty[entry.id] - minQty[entry.id],
                requiresAvailability: entry.requiresAvailability,
                rollerProductId: entry.rollerProductId,
            })),
        [catalog, minQty, qty]
    );

    const addonsTotal = useMemo(
        () => addedAddons.reduce((sum, addon) => sum + addon.price * addon.qty, 0),
        [addedAddons]
    );

    const buildItems = (): NewBookingItemRequest[] => {
        const bookingDate = booking.date ?? getVenueToday();
        const startTime = normalizeStartTime(booking.time) ?? '09:00';

        return addedAddons
            .filter((addon) => addon.rollerProductId)
            .map((addon) => ({
                bookingDate,
                productId: Number(addon.rollerProductId),
                quantity: addon.qty,
                startTime,
            }));
    };

    const requireAvailability = addedAddons.length > 0 && addedAddons.every((addon) => addon.requiresAvailability === true);

    const completeAddons = (paymentHandled = false) => {
        onContinue({
            selectedAddons,
            addonsTotal,
            skyriderSelected: qty.skyrider > 0,
            connectedSelected: qty.connected > 0,
            paymentHandled,
        });
    };

    const handleSelectContinue = () => {
        if (addedAddons.length === 0) {
            completeAddons(false);
            return;
        }

        if (buildItems().length !== addedAddons.length) {
            setSubmitError(t.addons.unsupportedSelection);
            return;
        }

        void goToReview();
    };

    const goToReview = async () => {
        if (submitting) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const result = await quoteAddProducts(booking.id, null, buildItems(), requireAvailability);
            setQuote(result);
            setStep('REVIEW');
        } catch (error) {
            setSubmitError(error instanceof CloudBookingError ? error.message : t.addons.quoteFailed);
        } finally {
            setSubmitting(false);
        }
    };

    const createDraft = async () => {
        if (!quote || submitting) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const itemKey = addedAddons.map((addon) => `${addon.id}-${addon.qty}`).join(':');
            const result = await createAddProductDraft(
                booking.id,
                null,
                buildItems(),
                `phone-add-product:${booking.id}:${itemKey}:${Date.now().toString(36)}`,
                requireAvailability
            );
            setDraft(result);
            setStep(canStartPayment(result) ? 'PAYMENT' : 'PENDING');
        } catch (error) {
            setSubmitError(error instanceof CloudBookingError ? error.message : t.addons.draftFailed);
        } finally {
            setSubmitting(false);
        }
    };

    const backFromInternalStep = () => {
        setSubmitError(null);
        if (step === 'PAYMENT' || step === 'APPROVED') setStep('REVIEW');
        else if (step === 'REVIEW') setStep('SELECT');
        else setStep('SELECT');
    };

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col px-4 py-3"
            data-add-product-status={draft?.prepayment?.status ?? ''}
            data-add-product-draft-id={draft?.prepayment?.prepaymentDraftId ?? ''}
            data-add-product-flow-type={draft?.prepayment?.flowType ?? ''}
            style={{ maxHeight: 'calc(100dvh - 120px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            {step !== 'SELECT' && step !== 'PENDING' && (
                <button
                    onClick={backFromInternalStep}
                    className="mb-3 flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
                >
                    <ArrowLeft size={14} /> {t.common.back}
                </button>
            )}

            {step === 'PAYMENT' && draft && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full flex items-center justify-center"
                    style={{ minHeight: 'calc(100dvh - 160px)' }}
                >
                    <div className="w-full bg-surface border border-border p-5 rounded-2xl text-center">
                        <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.addons.paymentTitle}</h2>
                        <p className="text-muted text-sm mb-5">
                            {formatMoney(draft.prepayment?.amountOwing ?? draft.draft.costs.amountOwing)}
                        </p>

                        <RollerPaymentDropIn
                            amountLabel={formatMoney(draft.prepayment?.amountOwing ?? draft.draft.costs.amountOwing)}
                            paymentSession={draft.paymentSession}
                            onApproved={() => {
                                setStep('APPROVED');
                                window.setTimeout(() => completeAddons(true), 1200);
                            }}
                            onFailed={() => undefined}
                        />
                    </div>
                </motion.div>
            )}

            {step === 'SELECT' && (
                <>
                    <div className="text-center">
                        <h1 className="text-xl font-black italic uppercase text-foreground">{t.addons.title}</h1>
                        <p className="text-muted text-xs mt-0.5">{t.addons.description}</p>
                        <p className="text-muted text-[10px] mb-3">{catalog.length} {t.addons.scrollHint}</p>
                    </div>

                    {existingAddons.length > 0 && (
                        <div className="w-full mb-2">
                            <p className="text-[11px] text-muted uppercase font-bold italic tracking-widest mb-1">{t.addons.alreadyInBooking}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {existingAddons.map((addon, index) => (
                                    <span
                                        key={index}
                                        className="px-2.5 py-0.5 rounded-full bg-surface-strong border border-border text-foreground text-xs italic"
                                    >
                                        {addon.label} x {addon.qty}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {submitError && (
                        <div className="mb-3 bg-white border border-danger/25 rounded-xl p-3 text-sm text-foreground flex gap-2">
                            <AlertCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
                            <span>{submitError}</span>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto -mx-1 px-1">
                        <div className="w-full flex flex-col gap-1.5">
                            {catalog.map((entry) => {
                                const value = qty[entry.id];
                                const max = Math.max(1, guestCount * entry.maxPerGuest);
                                const locked = minQty[entry.id];
                                const isHighlighted = entry.id === 'connected' || entry.id === 'skyrider';
                                const isEnabled = entry.rollerProductId !== null;

                                return (
                                    <div
                                        key={entry.id}
                                        className={`w-full border rounded-xl p-2.5 shadow-sm ${
                                            isHighlighted
                                                ? 'bg-primary/5 border-primary/30'
                                                : 'bg-surface border-border'
                                        } ${!isEnabled ? 'opacity-60' : ''}`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                <JumpyardIcon name={entry.icon} className="w-8 h-8 flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-foreground font-bold italic text-sm">{entry.label}</p>
                                                    <p className="text-muted text-[11px]">
                                                        {entry.price} {t.common.currency} - {entry.unit}
                                                    </p>
                                                    {!isEnabled && (
                                                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full bg-surface-strong text-muted text-[9px] font-bold italic uppercase tracking-wide">{t.addons.unsupported}</span>
                                                    )}
                                                    {entry.id === 'connected' && isEnabled && (
                                                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold italic uppercase tracking-wide">{t.addons.connectedValueProp}</span>
                                                    )}
                                                    {locked > 0 && (
                                                        <span className="text-[10px] text-success font-bold italic">{t.addons.alreadyInBooking} ({locked})</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Counter value={value} onChange={(nextQty) => setOne(entry.id, nextQty)} max={max} min={locked} disabled={!isEnabled} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pt-3 border-t border-border mt-3">
                        <div className="w-full flex items-center justify-between bg-surface-strong border border-border rounded-xl px-4 py-2.5 mb-3">
                            <p className="text-muted uppercase text-xs font-bold italic tracking-wider">{t.addons.total}</p>
                            <p className="text-2xl font-black italic text-primary">{addonsTotal} {t.common.currency}</p>
                        </div>

                        <button
                            onClick={handleSelectContinue}
                            disabled={submitting}
                            className="w-full bg-primary hover:bg-surface hover:text-primary border border-transparent hover:border-primary text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-sm disabled:opacity-40 disabled:hover:bg-primary disabled:hover:text-white disabled:hover:border-transparent"
                        >
                            {submitting ? t.buy.quoting : t.common.continue}
                        </button>
                    </div>
                </>
            )}

            {step === 'REVIEW' && quote && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full bg-surface border border-border p-5 rounded-2xl">
                    <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">{t.addons.reviewTitle}</h2>
                    <p className="text-muted text-xs mb-5 text-center">{t.addons.reviewDesc}</p>

                    <div className="bg-white border border-border rounded-xl p-4 mb-4">
                        {addedAddons.map((addon) => (
                            <div key={addon.id} className="flex justify-between gap-3 text-sm font-bold text-foreground py-1">
                                <span>{addon.label}</span>
                                <span>{addon.qty} st</span>
                            </div>
                        ))}
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
                        {submitting ? t.buy.creating : t.addons.createDraft} {!submitting && <Check size={18} />}
                    </button>
                </motion.div>
            )}

            {step === 'APPROVED' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full flex items-center justify-center"
                    style={{ minHeight: 'calc(100dvh - 160px)' }}
                >
                    <div className="w-full bg-surface border border-border p-5 rounded-2xl text-center">
                        <div className="w-14 h-14 rounded-full bg-success/10 border border-success/25 mx-auto mb-4 flex items-center justify-center">
                            <Check size={30} className="text-success" />
                        </div>
                        <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.addons.paymentApprovedTitle}</h2>
                        <p className="text-muted text-sm">{t.addons.paymentApprovedDesc}</p>
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
                        <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.addons.pendingTitle}</h2>
                        <p className="text-muted text-sm mb-5">{t.addons.pendingDesc}</p>

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
                            onClick={onPendingDone}
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
