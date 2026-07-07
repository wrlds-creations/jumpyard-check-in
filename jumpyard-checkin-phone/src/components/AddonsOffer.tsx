'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Check, CreditCard, Minus, Plus } from 'lucide-react';
import {
    CloudBookingError,
    createAddProductDraft,
    getNewBookingAvailability,
    quoteAddProducts,
    type AddProductDraftResult,
    type NewBookingAvailability,
    type NewBookingItemRequest,
    type NewBookingProduct,
    type NewBookingQuote,
} from '@/flow/cloudClient';
import type { Addon, AddonId, Booking } from '@/flow/types';
import {
    ADDON_CATALOG_CONFIG,
    EXISTING_BOOKING_ADDON_IDS,
    HIDDEN_EXISTING_BOOKING_ADDONS,
} from '@/flow/addonCatalog';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { RollerPaymentDropIn } from '@/components/RollerPaymentDropIn';
import { SkyRiderAttest } from '@/components/SkyRiderAttest';

interface AddonsOfferProps {
    backRequest?: number;
    booking: Booking;
    guestCount: number;
    existingAddons: Addon[];
    prefetchedAvailability?: AddonsAvailabilityPrefetch | null;
    onStepChange?: (step: AddonsOfferStep) => void;
    onContinue: (result: {
        selectedAddons: Addon[];
        addonsTotal: number;
        skyriderSelected: boolean;
        skyriderHeightConfirmed?: boolean;
        connectedSelected: boolean;
        paymentHandled?: boolean;
    }) => void;
    onPendingDone: () => void;
}

export interface AddonsAvailabilityPrefetch {
    key: string;
    availability: NewBookingAvailability | null;
    error: string | null;
    promise: Promise<NewBookingAvailability> | null;
}

interface CatalogEntry {
    id: AddonId;
    label: string;
    price: number | null;
    unit: string;
    description: string;
    maxPerGuest: number;
    icon: JumpyardIconName;
    rollerProductId: number | null;
    requiresAvailability: boolean;
}

export type AddonsOfferStep = 'SELECT' | 'SKYRIDER_ATTEST' | 'REVIEW' | 'PAYMENT' | 'APPROVED' | 'PENDING';

const VENUE_TIME_ZONE = 'Europe/Stockholm';

function Counter({
    disabled = false,
    max,
    min = 0,
    onChange,
    testId,
    value,
}: {
    disabled?: boolean;
    max: number;
    min?: number;
    onChange: (n: number) => void;
    testId?: string;
    value: number;
}) {
    return (
        <div className="flex items-center gap-2">
            <button
                data-testid={testId ? `${testId}-decrement` : undefined}
                onClick={() => onChange(Math.max(min, value - 1))}
                className="w-9 h-9 rounded-full bg-surface hover:bg-border border border-border text-foreground flex items-center justify-center disabled:opacity-30 disabled:bg-surface-strong"
                disabled={disabled || value <= min}
            >
                <Minus size={16} />
            </button>
            <span className="text-xl font-black italic text-foreground w-7 text-center">{value}</span>
            <button
                data-testid={testId ? `${testId}-increment` : undefined}
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

function formatAddonPriceLabel(
    value: number | null | undefined,
    unit: string,
    eachUnit: string,
    eachLongUnit: string
) {
    const unitLabel = unit === eachUnit ? eachLongUnit : unit;
    return `${formatMoney(value)} ${unitLabel}`;
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

function getAddonDescription(id: AddonId, products: ReturnType<typeof useTranslation>['t']['addons']['products']) {
    switch (id) {
        case 'skyrider':
            return products.skyriderDesc;
        case 'connected':
            return products.connectedDesc;
        case 'coffee':
            return products.coffeeDesc;
        case 'extra_person':
            return products.extraPersonDesc;
        case 'lock':
            return products.lockDesc;
        case 'socks':
            return products.socksDesc;
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

function getDynamicAddonProduct(products: NewBookingProduct[], id: AddonId) {
    return products.find((product) => product.type === 'addon' && product.key === id) ?? null;
}

function getSlotAddonProducts(availability: NewBookingAvailability, startTime: string) {
    const slot = availability.slots.find((entry) => entry.startTime === startTime) ?? availability.slots[0] ?? null;
    return slot?.products.filter((product) => product.type === 'addon') ?? [];
}

function getAvailabilityPrefetchKey(bookingDate: string, bookingStartTime: string) {
    return `${bookingDate}|${bookingStartTime}`;
}

function isPricedCatalogEntry(entry: CatalogEntry): entry is CatalogEntry & { price: number; rollerProductId: number } {
    return entry.price !== null && entry.rollerProductId !== null;
}

export const AddonsOffer = ({
    backRequest = 0,
    booking,
    guestCount,
    existingAddons,
    prefetchedAvailability = null,
    onContinue,
    onPendingDone,
    onStepChange,
}: AddonsOfferProps) => {
    const { t } = useTranslation();
    const bookingDate = booking.date ?? getVenueToday();
    const bookingStartTime = normalizeStartTime(booking.time) ?? '09:00';
    const prefetchKey = getAvailabilityPrefetchKey(bookingDate, bookingStartTime);
    const matchingPrefetch = prefetchedAvailability?.key === prefetchKey ? prefetchedAvailability : null;
    const [catalogProducts, setCatalogProducts] = useState<NewBookingProduct[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const prefetched = matchingPrefetch && !matchingPrefetch.error ? matchingPrefetch : null;

        if (prefetched?.availability) {
            setCatalogProducts(getSlotAddonProducts(prefetched.availability, bookingStartTime));
            setCatalogError(null);
            setCatalogLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setCatalogLoading(true);
        setCatalogError(null);
        const availabilityRequest = prefetched?.promise ?? getNewBookingAvailability([bookingStartTime], bookingDate);
        availabilityRequest
            .then((availability) => {
                if (cancelled) return;
                setCatalogProducts(getSlotAddonProducts(availability, bookingStartTime));
            })
            .catch((error) => {
                if (cancelled) return;
                setCatalogProducts([]);
                setCatalogError(error instanceof CloudBookingError ? error.message : t.buy.availabilityFailed);
            })
            .finally(() => {
                if (!cancelled) setCatalogLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        bookingDate,
        bookingStartTime,
        matchingPrefetch,
        t.buy.availabilityFailed,
    ]);

    const catalog = useMemo<CatalogEntry[]>(
        () => {
            const entries: CatalogEntry[] = EXISTING_BOOKING_ADDON_IDS.map((id) => {
                const config = ADDON_CATALOG_CONFIG[id];
                const dynamicProduct = getDynamicAddonProduct(catalogProducts, id);
                return {
                    id,
                    description: getAddonDescription(id, t.addons.products),
                    icon: config.icon as JumpyardIconName,
                    label: getAddonLabel(id, t.addons.products),
                    maxPerGuest: config.maxPerGuest,
                    price: dynamicProduct?.unitPrice ?? null,
                    requiresAvailability: config.requiresAvailability,
                    rollerProductId: numberProductId(dynamicProduct?.productId) ?? config.rollerProductId,
                    unit: getAddonUnit(id, t.addons),
                };
            });
            return entries.filter((entry) => !HIDDEN_EXISTING_BOOKING_ADDONS.has(entry.id));
        },
        [catalogProducts, t]
    );

    const catalogById = useMemo(
        () => new Map(catalog.map((entry) => [entry.id, entry])),
        [catalog]
    );

    const minQty = useMemo(() => {
        const base: Record<AddonId, number> = { skyrider: 0, connected: 0, coffee: 0, extra_person: 0, lock: 0, socks: 0 };
        for (const addon of existingAddons) {
            if (addon.id in base) base[addon.id] = addon.qty;
        }
        return base;
    }, [existingAddons]);

    const [step, setStep] = useState<AddonsOfferStep>('SELECT');
    const [qty, setQty] = useState<Record<AddonId, number>>(() => getRecommendedAddonQty(minQty));
    const [quote, setQuote] = useState<NewBookingQuote | null>(null);
    const [draft, setDraft] = useState<AddProductDraftResult | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [skyriderConsentConfirmed, setSkyriderConsentConfirmed] = useState(false);
    const [alreadyHasApprovedSocks, setAlreadyHasApprovedSocks] = useState(false);
    const handledBackRequest = useRef(backRequest);

    const returnToSelect = useCallback(() => {
        setSubmitError(null);
        setQuote(null);
        setDraft(null);
        setStep('SELECT');
    }, []);

    useEffect(() => {
        onStepChange?.(step);
    }, [onStepChange, step]);

    useEffect(() => () => {
        onStepChange?.('SELECT');
    }, [onStepChange]);

    useEffect(() => {
        if (backRequest === handledBackRequest.current) return;
        handledBackRequest.current = backRequest;
        if (step === 'SELECT' || step === 'APPROVED') return;
        returnToSelect();
    }, [backRequest, returnToSelect, step]);

    useEffect(() => {
        setQty((current) => {
            let changed = false;
            const next = { ...current };

            for (const id of Object.keys(minQty) as AddonId[]) {
                if (next[id] < minQty[id]) {
                    next[id] = minQty[id];
                    changed = true;
                }
            }

            return changed ? next : current;
        });
    }, [minQty]);

    const setOne = (id: AddonId, nextQty: number) => {
        setSubmitError(null);
        setQuote(null);
        setDraft(null);
        if (id === 'skyrider') setSkyriderConsentConfirmed(false);
        if (id === 'socks' && nextQty > minQty.socks) setAlreadyHasApprovedSocks(false);
        setQty((current) => ({ ...current, [id]: Math.max(minQty[id], nextQty) }));
    };

    const setSocksConfirmation = (checked: boolean) => {
        setAlreadyHasApprovedSocks(checked);
        setSubmitError(null);
        setQuote(null);
        setDraft(null);
        if (checked) {
            setQty((current) => ({ ...current, socks: minQty.socks }));
        }
    };

    const selectedAddons: Addon[] = useMemo(
        () =>
            catalog.flatMap((entry) => {
                if (qty[entry.id] <= 0 || !isPricedCatalogEntry(entry)) return [];

                return [{
                    id: entry.id,
                    label: entry.label,
                    price: entry.price,
                    qty: qty[entry.id],
                    requiresAvailability: entry.requiresAvailability,
                    rollerProductId: entry.rollerProductId,
                }];
            }),
        [catalog, qty]
    );

    const addedAddons: Addon[] = useMemo(
        () =>
            catalog.flatMap((entry) => {
                if (qty[entry.id] <= minQty[entry.id] || !isPricedCatalogEntry(entry)) return [];

                return [{
                    id: entry.id,
                    label: entry.label,
                    price: entry.price,
                    qty: qty[entry.id] - minQty[entry.id],
                    requiresAvailability: entry.requiresAvailability,
                    rollerProductId: entry.rollerProductId,
                }];
            }),
        [catalog, minQty, qty]
    );

    const addonsTotal = useMemo(
        () => addedAddons.reduce((sum, addon) => sum + addon.price * addon.qty, 0),
        [addedAddons]
    );
    const socksEntry = catalogById.get('socks') ?? null;
    const otherCatalogEntries = catalog.filter((entry) => entry.id !== 'socks');
    const socksQty = qty.socks;
    const socksRecommendedVisibleCount = Math.min(Math.max(0, guestCount), 5);
    const socksRecommendationProgress = Math.min(100, Math.round((socksQty / Math.max(1, guestCount)) * 100));
    const showSocksConfirmation = minQty.socks === 0;
    const addedSkyrider = addedAddons.some((addon) => addon.id === 'skyrider');
    const needsSkyRiderConsent = (confirmed = skyriderConsentConfirmed) =>
        addedSkyrider && !confirmed;

    const buildItems = (): NewBookingItemRequest[] => {
        const bookingDate = booking.date ?? getVenueToday();
        const startTime = normalizeStartTime(booking.time) ?? '09:00';

        return addedAddons
            .filter((addon) => addon.rollerProductId)
            .map((addon) => ({
                bookingDate,
                productId: Number(addon.rollerProductId),
                quantity: addon.qty,
                requiresAvailability: addon.requiresAvailability === true,
                startTime,
            }));
    };

    const requireAvailability = addedAddons.some((addon) => addon.requiresAvailability === true);

    const completeAddons = (paymentHandled = false) => {
        onContinue({
            selectedAddons,
            addonsTotal,
            skyriderSelected: addedSkyrider,
            skyriderHeightConfirmed: addedSkyrider ? skyriderConsentConfirmed : false,
            connectedSelected: qty.connected > 0,
            paymentHandled,
        });
    };

    const handleSelectContinue = () => {
        if (catalogLoading) return;
        if (catalogError) {
            setSubmitError(catalogError);
            return;
        }

        if (addedAddons.length === 0) {
            completeAddons(false);
            return;
        }

        if (buildItems().length !== addedAddons.length) {
            setSubmitError(t.addons.unsupportedSelection);
            return;
        }

        if (needsSkyRiderConsent()) {
            setStep('SKYRIDER_ATTEST');
            return;
        }

        void goToReview();
    };

    const goToReview = async (skyriderConsentOverride = skyriderConsentConfirmed) => {
        if (submitting) return;
        if (needsSkyRiderConsent(skyriderConsentOverride)) {
            setStep('SKYRIDER_ATTEST');
            return;
        }
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
        if (needsSkyRiderConsent()) {
            setStep('SKYRIDER_ATTEST');
            return;
        }
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

    return (
        <motion.div
            className="w-full max-w-md min-w-0 mx-auto flex flex-col px-4 py-3"
            data-add-product-status={draft?.prepayment?.status ?? ''}
            data-add-product-draft-id={draft?.prepayment?.prepaymentDraftId ?? ''}
            data-add-product-flow-type={draft?.prepayment?.flowType ?? ''}
            style={{ maxHeight: 'calc(100dvh - 120px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            {step === 'PAYMENT' && draft && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full max-w-full min-w-0 flex items-center justify-center"
                    style={{ minHeight: 'calc(100dvh - 160px)' }}
                >
                    <div className="w-full bg-white border border-border p-5 rounded-2xl text-center">
                        <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.addons.paymentTitle}</h2>
                        <p className="text-foreground text-sm mb-5">
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
                        <p className="text-foreground text-xs mt-0.5">{t.addons.description}</p>
                    </div>

                    {(submitError || catalogError) && (
                        <div className="mb-3 bg-white border border-danger/25 rounded-xl p-3 text-sm text-foreground flex gap-2">
                            <AlertCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
                            <span>{submitError || catalogError}</span>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto -mx-1 px-1">
                        {catalogLoading ? (
                            <AddonsLoadingCard label={t.addons.loading} />
                        ) : (
                        <div className="w-full max-w-full min-w-0 flex flex-col gap-1.5">
                            {socksEntry && (
                                <section className={`bg-white border border-border rounded-xl p-3 ${!isPricedCatalogEntry(socksEntry) ? 'opacity-60' : ''}`}>
                                    <div className="flex items-start gap-3">
                                        <JumpyardIcon name={socksEntry.icon} className="w-9 h-9 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-black italic text-foreground uppercase">
                                                {t.addons.socksSectionTitle}
                                            </h3>
                                            <p className="mt-1 text-[11px] text-foreground">{t.addons.socksHelp}</p>
                                            {!isPricedCatalogEntry(socksEntry) && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-white border border-border text-foreground text-[9px] font-bold italic uppercase tracking-wide">{t.addons.unsupported}</span>
                                            )}
                                            {minQty.socks > 0 && (
                                                <span className="mt-1 block text-[10px] text-success font-bold italic">
                                                    {t.addons.alreadyInBooking} ({minQty.socks})
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {!alreadyHasApprovedSocks && (
                                        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] font-black italic uppercase tracking-wider text-foreground">
                                                    {t.addons.socksRecommendedCount}
                                                </span>
                                                <span className="rounded-full bg-white px-3 py-1 text-sm font-black italic text-primary shadow-sm">
                                                    {guestCount}
                                                </span>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-3">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1">
                                                    {Array.from({ length: socksRecommendedVisibleCount }).map((_, index) => (
                                                        <JumpyardIcon key={index} name="grip-socks" className="h-5 w-5" />
                                                    ))}
                                                    {guestCount > socksRecommendedVisibleCount && (
                                                            <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-black italic text-foreground shadow-sm">
                                                                +{guestCount - socksRecommendedVisibleCount}
                                                            </span>
                                                        )}
                                                </div>
                                                <span className="shrink-0 text-[11px] font-black italic text-foreground">
                                                    {t.addons.socksSelectedCount} {socksQty}/{guestCount}
                                                </span>
                                            </div>
                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10">
                                                <div
                                                    className="h-full rounded-full bg-primary transition-all"
                                                    style={{ width: `${socksRecommendationProgress}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {!alreadyHasApprovedSocks && (
                                        <div className="mt-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-bold italic text-foreground">
                                                    {formatAddonPriceLabel(socksEntry.price, socksEntry.unit, t.addons.each, t.addons.eachLong)}
                                                </p>
                                            </div>
                                            <Counter
                                                value={socksQty}
                                                onChange={(nextQty) => setOne('socks', nextQty)}
                                                max={Math.max(1, guestCount * socksEntry.maxPerGuest)}
                                                min={minQty.socks}
                                                disabled={!isPricedCatalogEntry(socksEntry)}
                                                testId="addon-option-socks"
                                            />
                                        </div>
                                    )}

                                    {showSocksConfirmation && (
                                        <label className="mt-3 flex min-w-0 items-start gap-2 rounded-lg border border-border bg-white px-3 py-2 text-left">
                                            <input
                                                type="checkbox"
                                                checked={alreadyHasApprovedSocks}
                                                onChange={(event) => setSocksConfirmation(event.target.checked)}
                                                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                            />
                                            <span className="min-w-0 break-words text-xs font-bold italic text-foreground">
                                                {t.addons.socksAlreadyHave}
                                            </span>
                                        </label>
                                    )}
                                </section>
                            )}

                            {otherCatalogEntries.map((entry) => {
                                const value = qty[entry.id];
                                const max = Math.max(1, guestCount * entry.maxPerGuest);
                                const locked = minQty[entry.id];
                                const isHighlighted = entry.id === 'connected';
                                const isEnabled = isPricedCatalogEntry(entry) && !catalogLoading;

                                return (
                                    <div
                                        key={entry.id}
                                        data-testid={`addon-option-${entry.id}`}
                                        className={`w-full border rounded-xl p-2.5 shadow-sm ${
                                            isHighlighted
                                                ? 'bg-primary/5 border-primary/30'
                                                : 'bg-white border-border'
                                        } ${!isEnabled ? 'opacity-60' : ''}`}
                                    >
                                        <div className="flex min-w-0 items-center justify-between gap-3">
                                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                <JumpyardIcon name={entry.icon} className="w-8 h-8 flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="truncate text-foreground font-bold italic text-sm">{entry.label}</p>
                                                    <p className="text-foreground text-[11px]">
                                                        {formatAddonPriceLabel(entry.price, entry.unit, t.addons.each, t.addons.eachLong)}
                                                    </p>
                                                    {!isEnabled && (
                                                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full bg-white border border-border text-foreground text-[9px] font-bold italic uppercase tracking-wide">{t.addons.unsupported}</span>
                                                    )}
                                                    {entry.id === 'connected' && isEnabled && (
                                                        <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold italic uppercase tracking-wide">{t.addons.connectedValueProp}</span>
                                                    )}
                                                    {locked > 0 && (
                                                        <span className="text-[10px] text-success font-bold italic">{t.addons.alreadyInBooking} ({locked})</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Counter
                                                value={value}
                                                onChange={(nextQty) => setOne(entry.id, nextQty)}
                                                max={max}
                                                min={locked}
                                                disabled={!isEnabled}
                                                testId={`addon-option-${entry.id}`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        )}
                    </div>

                    <div className="pt-3 border-t border-border mt-3">
                        <div className="w-full flex items-center justify-between bg-white border border-border rounded-xl px-4 py-2.5 mb-3">
                            <p className="text-foreground uppercase text-xs font-bold italic tracking-wider">{t.addons.total}</p>
                            <p className="text-2xl font-black italic text-primary">{addonsTotal} {t.common.currency}</p>
                        </div>

                        <button
                            data-testid="addons-select-continue"
                            onClick={handleSelectContinue}
                            disabled={submitting || catalogLoading}
                            className="w-full bg-primary hover:bg-surface hover:text-primary border border-transparent hover:border-primary text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-sm disabled:opacity-40 disabled:hover:bg-primary disabled:hover:text-white disabled:hover:border-transparent"
                        >
                            {catalogLoading ? t.buy.loadingAvailabilityTitle : submitting ? t.buy.quoting : t.common.continue}
                        </button>
                    </div>
                </>
            )}

            {step === 'SKYRIDER_ATTEST' && (
                <SkyRiderAttest
                    onComplete={() => {
                        setSkyriderConsentConfirmed(true);
                        setStep('SELECT');
                        void goToReview(true);
                    }}
                />
            )}

            {step === 'REVIEW' && quote && (
                <motion.div data-testid="addons-review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-full min-w-0 px-2 py-5">
                    <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">{t.addons.reviewTitle}</h2>
                    <p className="text-foreground text-xs mb-5 text-center">{t.addons.reviewDesc}</p>

                    <div className="overflow-hidden rounded-2xl border border-border bg-white mb-4">
                        {addedAddons.map((addon) => {
                            const entry = catalogById.get(addon.id);
                            return (
                                <div key={addon.id} className="flex min-w-0 justify-between items-center gap-3 border-b border-border px-3 py-3 text-sm font-bold text-foreground last:border-b-0">
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <JumpyardIcon name={entry?.icon ?? 'addons-bag'} className="w-7 h-7 flex-shrink-0" />
                                        <span className="min-w-0">
                                            <span className="block truncate">{addon.label} x{addon.qty}</span>
                                            <span className="block text-[11px] font-normal text-foreground">
                                                {formatAddonPriceLabel(addon.price, entry?.unit ?? t.addons.each, t.addons.each, t.addons.eachLong)}
                                            </span>
                                        </span>
                                    </div>
                                    <span className="flex-shrink-0 text-primary font-black italic">{formatMoney(addon.price * addon.qty)}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="bg-white border border-border p-3 rounded-xl mb-5 flex justify-between items-center px-4">
                        <span className="text-foreground text-sm font-bold italic uppercase">{t.buy.total}</span>
                        <span className="text-xl font-black italic text-primary">{formatMoney(quote.costs.amountOwing)}</span>
                    </div>

                    {submitError && <p className="mb-4 text-sm text-danger font-bold italic">{submitError}</p>}

                    <button
                        onClick={() => void createDraft()}
                        disabled={submitting}
                        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {submitting ? t.buy.creating : t.addons.createDraft}
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
                    <div className="w-full bg-white border border-border p-5 rounded-2xl text-center">
                        <div className="w-14 h-14 rounded-full bg-success/10 border border-success/25 mx-auto mb-4 flex items-center justify-center">
                            <Check size={30} className="text-success" />
                        </div>
                        <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.addons.paymentApprovedTitle}</h2>
                        <p className="text-foreground text-sm">{t.addons.paymentApprovedDesc}</p>
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
                    <div className="w-full bg-white border border-border p-5 rounded-2xl text-center">
                        <div className="w-14 h-14 rounded-full bg-white border border-border mx-auto mb-4 flex items-center justify-center">
                            <CreditCard size={28} className="text-primary" />
                        </div>
                        <h2 className="text-xl font-black italic text-foreground uppercase mb-2">{t.addons.pendingTitle}</h2>
                        <p className="text-foreground text-sm mb-5">{t.addons.pendingDesc}</p>

                        <div className="bg-white border border-border rounded-xl p-4 mb-5 text-left">
                            <div className="flex justify-between gap-3 text-sm mb-2">
                                <span className="text-foreground font-bold italic uppercase">{t.buy.total}</span>
                                <span className="font-black text-primary">{formatMoney(draft.prepayment?.amountOwing ?? draft.draft.costs.amountOwing)}</span>
                            </div>
                            <div className="flex justify-between gap-3 text-xs">
                                <span className="text-foreground">{t.buy.draftStatus}</span>
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

function getRecommendedAddonQty(minQty: Record<AddonId, number>): Record<AddonId, number> {
    return {
        ...minQty,
        socks: minQty.socks,
    };
}

function AddonsLoadingCard({ label }: { label: string }) {
    return (
        <div className="w-full min-h-[260px] rounded-2xl border border-border bg-white p-6 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="relative mb-4 flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-primary/15 border-t-primary animate-spin" />
                <JumpyardIcon name="addons-bag" className="h-11 w-11" />
            </div>
            <p className="text-sm font-black italic uppercase text-foreground">{label}</p>
        </div>
    );
}
