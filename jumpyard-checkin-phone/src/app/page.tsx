'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, RefreshCw, RotateCcw, X } from 'lucide-react';
import { BookingSummary } from '@/components/BookingSummary';
import { SafetyVideo } from '@/components/SafetyVideo';
import { SafetyAttest } from '@/components/SafetyAttest';
import {
    AddonsOffer,
    type AddonsAvailabilityPrefetch,
    type AddonsOfferResult,
    type AddonsOfferStep,
} from '@/components/AddonsOffer';
import { SkyRiderAttest } from '@/components/SkyRiderAttest';
import { ConnectedProfiles } from '@/components/ConnectedProfiles';
import { PaymentView } from '@/components/PaymentView';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';
import { detectChannel, initialContext, initialState, nextState } from '@/flow/machine';
import type { Branch } from '@/flow/machine';
import {
    CloudBookingError,
    CloudSessionError,
    getNewBookingAvailability,
    lookupBooking,
    markSessionReadyForStaff,
    resolveCheckInSessionLink,
    startCheckInSession,
    type SessionIssue,
} from '@/flow/cloudClient';
import type { Booking, CheckInSession, ConnectedProfile, FlowContext, FlowState } from '@/flow/types';
import {
    clearBuyFlowRecovery,
    getBuyFlowRecoveryIdentifier,
    getBuyFlowRecoveryTargetState,
    hasCompletedBuyFlowRecovery,
    isPrePaymentBuyFlowRecovery,
    readBuyFlowRecovery,
    startBuyFlowRecoveryCleanup,
    writeBuyFlowRecovery,
    type BuyFlowRecoverySnapshot,
} from '@/flow/buyFlowRecovery';
import { ParkChoice } from '@/components/ParkChoice';
import { BookingLookup } from '@/components/BookingLookup';
import { BuyTickets, type BuyTicketsStep } from '@/components/BuyTickets';
import { RollerPaymentDropIn, type RollerPaymentResultSummary } from '@/components/RollerPaymentDropIn';
import { PhonePaymentConfirmation } from '@/components/PhonePaymentConfirmation';
import { resolvePurchasePreparation, runPurchasePreparationRequest } from '@/flow/purchasePreparation';
import {
    approvePaymentRecovery,
    clearPaymentRecoveryAfterCompletion,
    consumePaymentRedirect,
    getPaymentRedirect,
    hasPaymentRedirect,
    readPaymentRecovery,
    withNoActivePaymentRecovery,
    type PaymentRecoveryRecord,
} from '@/flow/paymentRecovery';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { ExitFlowDialog } from '@/components/ExitFlowDialog';
import { LanguageToggle } from '@/components/LanguageToggle';
import { getExitFlowMode, hasReachedSafety, isStartState } from '@/flow/exitFlowPolicy';
import { getFlowBackAction, type AddonBackRule } from '@/flow/addonPaymentNavigation';
import {
    getApprovedPurchaseIdentifier,
    getPaidConfirmationRetryDelay,
    isApprovedPurchaseAwaitingConfirmation,
    resolvePaidConfirmation,
    type PaidConfirmationUiState,
} from '@/flow/paidBookingConfirmation';

// Visual progress bar groups safety-video + safety-attest into one step,
// and collapses connected/skyrider into the extras column.
// Safety comes AFTER payment in the new flow (midcheck 2026-04-16).
const STEP_ORDER: FlowState[] = [
    'APP_BOOKING',
    'APP_ADDONS',
    'APP_PAYMENT',
    'APP_SAFETY_VIDEO',
    'APP_CONFIRM',
    'APP_PRESENT',
];

const STEP_ICONS: JumpyardIconName[] = [
    'booking-card',
    'addons-bag',
    'payment-card',
    'safety-check',
    'success-check',
];

const BUY_ENTRY_STEP_ICONS: JumpyardIconName[] = [
    'admission-ticket',
    'addons-bag',
    'payment-card',
    'safety-check',
    'success-check',
];

function getStepIndex(state: FlowState): number {
    if (state === 'APP_SAFETY_ATTEST') return STEP_ORDER.indexOf('APP_SAFETY_VIDEO');
    if (state === 'APP_SKYRIDER_ATTEST' || state === 'APP_CONNECTED')
        return STEP_ORDER.indexOf('APP_ADDONS');
    if (state === 'APP_PRESENT') return STEP_ORDER.indexOf('APP_CONFIRM');
    const idx = STEP_ORDER.indexOf(state);
    return idx === -1 ? 0 : idx;
}

function getBuyEntryStepIndex(state: FlowState): number {
    if (state === 'APP_CONFIRM' || state === 'APP_PRESENT') return 4;
    if (state === 'APP_SAFETY_VIDEO' || state === 'APP_SAFETY_ATTEST') return 3;
    if (state === 'APP_PAYMENT') return 2;
    return 0;
}

function prePaymentBack(ctx: FlowContext): FlowState {
    if (ctx.connectedSelected) return 'APP_CONNECTED';
    if (ctx.skyriderSelected && !ctx.skyriderHeightConfirmed) return 'APP_SKYRIDER_ATTEST';
    return 'APP_ADDONS';
}

function getBackState(state: FlowState, ctx: FlowContext): FlowState | null {
    switch (state) {
        case 'KIOSK_LOOKUP': return 'KIOSK_CHOICE';
        case 'KIOSK_BUY': return null; // BuyTickets handles its own internal back
        case 'APP_BOOKING': return ctx.channel === 'park-qr' ? 'KIOSK_CHOICE' : null;
        case 'APP_ADDONS': return 'APP_BOOKING';
        case 'APP_SKYRIDER_ATTEST': return 'APP_ADDONS';
        case 'APP_CONNECTED': return ctx.skyriderSelected && !ctx.skyriderHeightConfirmed ? 'APP_SKYRIDER_ATTEST' : 'APP_ADDONS';
        case 'APP_PAYMENT': return prePaymentBack(ctx);
        case 'APP_SAFETY_VIDEO':
            // #330: a completed payment never offers a way back into the purchase screens.
            if (ctx.paymentCompleted) return null;
            return ctx.paymentTotal > 0 ? 'APP_PAYMENT' : prePaymentBack(ctx);
        case 'APP_SAFETY_ATTEST': return 'APP_SAFETY_VIDEO';
        default: return null;
    }
}

type BuyRecoveryStatus = 'checking' | 'failed' | 'unsafe'
    | 'completed-unavailable'
    | 'payment-return' | 'payment-unknown' | 'payment-checking' | 'payment-failed' | 'payment-approved';
const VENUE_TIME_ZONE = 'Europe/Stockholm';

function recoveryMatchesBooking(record: PaymentRecoveryRecord, snapshot: BuyFlowRecoverySnapshot | null) {
    return record.kind === 'new_booking' && Boolean(snapshot && [
        snapshot.bookingReference, snapshot.draftUniqueId,
        snapshot.draftState?.bookingReference, snapshot.draftState?.uniqueId,
    ].includes(record.bookingIdentifier));
}

function recoveryMatchesDraft(record: PaymentRecoveryRecord, snapshot: BuyFlowRecoverySnapshot | null) {
    const attemptId = snapshot?.draftState?.prepaymentDraftId
        ?? snapshot?.draftUniqueId ?? snapshot?.draftState?.uniqueId ?? snapshot?.bookingReference;
    return recoveryMatchesBooking(record, snapshot) && attemptId === record.attemptId;
}

function sameBuyRecoverySnapshot(expected: BuyFlowRecoverySnapshot | null, current: BuyFlowRecoverySnapshot | null) {
    if (!expected || !current) return expected === current;
    // Observation checkpoints may change on read; the saved purchase itself must not.
    const { lastObservedAt: expectedObservation, ...expectedPurchase } = expected;
    const { lastObservedAt: currentObservation, ...currentPurchase } = current;
    void expectedObservation;
    void currentObservation;
    return JSON.stringify(expectedPurchase) === JSON.stringify(currentPurchase);
}

function recoveryAmount(snapshot: BuyFlowRecoverySnapshot | null, language: 'sv' | 'en') {
    const amount = snapshot?.draftState?.amountOwing;
    return typeof amount === 'number' && Number.isFinite(amount)
        ? new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-GB', { style: 'currency', currency: 'SEK' }).format(amount)
        : '—';
}

async function returnedSessionMatches(record: PaymentRecoveryRecord) {
    const redirect = getPaymentRedirect();
    if (!redirect || !record.sessionHash) return false;
    try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(redirect.sessionId));
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        return hash === record.sessionHash;
    } catch {
        return false;
    }
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

function getAddonsAvailabilityTarget(booking: Booking) {
    const bookingDate = booking.date ?? getVenueToday();
    const bookingStartTime = normalizeStartTime(booking.time) ?? '09:00';
    return {
        bookingDate,
        bookingStartTime,
        key: `${bookingDate}|${bookingStartTime}`,
    };
}

function isBuyEntryRecoveryState(state: FlowState): state is 'APP_SAFETY_VIDEO' | 'APP_SAFETY_ATTEST' | 'APP_CONFIRM' | 'APP_PRESENT' {
    return state === 'APP_SAFETY_VIDEO' || state === 'APP_SAFETY_ATTEST' || state === 'APP_CONFIRM' || state === 'APP_PRESENT';
}

function writeSafetyRecovery(state: FlowState, ctx: FlowContext, alreadyCheckedIn = false) {
    if (!isBuyEntryRecoveryState(state) || !ctx.buyEntryFlow || !ctx.booking) return;

    const confirmedCompletion = ctx.paymentCompleted && ctx.booking.paid
        ? state === 'APP_PRESENT' && (alreadyCheckedIn || (ctx.checkinSession && isCompletedSession(ctx.checkinSession)))
            ? 'completed' as const
            : state === 'APP_CONFIRM' && ctx.checkinSession && isReadyForStaffSession(ctx.checkinSession)
                ? 'ready_for_staff' as const : null
        : null;
    writeBuyFlowRecovery({
        bookingReference: ctx.booking.id,
        completion: confirmedCompletion ? { bookingIdentifier: ctx.booking.id, status: confirmedCompletion } : null,
        currentFlowStep: state,
        draftState: {
            amountOwing: ctx.booking.amountOwing ?? 0,
            bookingReference: ctx.booking.id,
            paymentApproved: true,
            paymentRequired: false,
            prepaymentDraftId: null,
            status: ctx.booking.paymentStatus ?? 'paid',
            uniqueId: ctx.booking.rollerUniqueId ?? null,
        },
        draftUniqueId: ctx.booking.rollerUniqueId ?? null,
        jumperCount: ctx.booking.jumpers,
        selectedProduct: {
            durationMinutes: ctx.baseDurationMinutes || ctx.booking.durationMinutes || null,
            label: ctx.baseProductLabel ?? ctx.booking.productLabel ?? null,
            productId: ctx.baseProductId,
            startTime: ctx.booking.time,
            type: ctx.baseProductType ?? ctx.booking.productType ?? null,
            unitPrice: ctx.baseUnitPrice || null,
        },
        selectedStartTime: ctx.booking.time,
    });
}

function BuyRecoveryCard({
    status,
    onRestart,
    onRetry,
    canRetry = true,
}: {
    status: BuyRecoveryStatus;
    onRestart: () => void;
    onRetry: () => void;
    canRetry?: boolean;
}) {
    const { t } = useTranslation();
    const checking = status === 'checking' || status === 'payment-checking';
    const unsafe = status === 'unsafe';
    const unknownPayment = status === 'payment-unknown' || status === 'payment-checking';
    const failedPayment = status === 'payment-failed';
    const completedUnavailable = status === 'completed-unavailable';

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-md min-w-0 px-4"
            data-buy-recovery-card="true"
            data-buy-recovery-status={status}
        >
            <div className="bg-surface border border-border rounded-2xl p-5 text-center shadow-sm">
                {checking ? (
                    <div className="flex min-h-[180px] items-center justify-center">
                        <div
                            className="relative h-20 w-20"
                            role="status"
                            aria-label={unknownPayment ? t.buy.paymentChecking : t.common.loading}
                        >
                            <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                            <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white border border-border shadow-sm">
                                <JumpyardIcon name="jump" className="h-12 w-12 animate-pulse" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white border border-border">
                            <AlertCircle size={26} className="text-primary" />
                        </div>
                        <h2 className="text-xl font-black italic uppercase text-foreground">
                            {unknownPayment ? t.buy.paymentRecoveryTitle : failedPayment ? t.buy.paymentFailedTitle
                                : completedUnavailable ? t.buyRecovery.completedUnavailableTitle : t.buyRecovery.failedTitle}
                        </h2>
                        <p className="mt-2 text-sm text-muted">
                            {unknownPayment ? t.buy.paymentRecoveryDescription
                                : failedPayment ? t.buy.paymentFailedDesc
                                    : completedUnavailable ? t.buyRecovery.completedUnavailableDescription
                                        : unsafe ? t.buyRecovery.unsafeDescription : t.buyRecovery.failedDescription}
                        </p>
                        <div className="mt-4 flex flex-col gap-2">
                            {!unsafe && canRetry && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                >
                                    <RefreshCw size={16} /> {unknownPayment ? t.buy.paymentCheckStatus
                                        : failedPayment ? t.buy.paymentRetryMethod : t.buyRecovery.retry}
                                </button>
                            )}
                            {(failedPayment || completedUnavailable) && <button
                                type="button"
                                onClick={onRestart}
                                className="w-full bg-white hover:bg-surface border border-border text-foreground font-black italic uppercase text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                <RotateCcw size={16} /> {completedUnavailable ? t.confirm.done : t.buyRecovery.startOver}
                            </button>}
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
}

// #350: the language control shares the top line with the progress bar; states
// without a progress bar keep the navigation row clear of it instead.
function hasProgressBar(state: FlowState) {
    return state !== 'APP_MOBILE' && state !== 'KIOSK_CHOICE' && state !== 'KIOSK_LOOKUP' && state !== 'KIOSK_BUY';
}

function ProgressBar({ state, buyEntryFlow }: { state: FlowState; buyEntryFlow: boolean }) {
    const { t } = useTranslation();
    if (!hasProgressBar(state)) return null;

    const labels = buyEntryFlow
        ? [
            t.buyProgress.entry,
            t.buyProgress.addons,
            t.buyProgress.payment,
            t.buyProgress.safety,
            t.buyProgress.done,
        ]
        : [t.progress.booking, t.progress.extras, t.progress.payment, t.progress.safety, t.progress.done];
    const icons = buyEntryFlow ? BUY_ENTRY_STEP_ICONS : STEP_ICONS;
    const current = buyEntryFlow ? getBuyEntryStepIndex(state) : getStepIndex(state);
    const pct = labels.length > 1 ? (current / (labels.length - 1)) * 100 : 0;
    const gridTemplateColumns = `repeat(${labels.length}, minmax(0, 1fr))`;

    return (
        <div className="w-full max-w-md min-w-0 mx-auto mb-3 px-4">
            <div className="relative">
                <div className="absolute top-4 left-[10%] right-[10%] h-0.5 bg-surface-strong" />
                <div
                    className="absolute top-4 left-[10%] h-0.5 bg-primary transition-all duration-500"
                    style={{ width: `calc(${pct * 0.8}%)` }}
                />
                <div className="relative z-10 grid" style={{ gridTemplateColumns }}>
                    {labels.map((label, i) => (
                        <div
                            key={i}
                            className="flex min-w-0 flex-col items-center gap-1"
                        >
                            <div
                                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${
                                    i < current
                                        ? 'bg-white border-primary shadow-sm'
                                        : i === current
                                        ? 'bg-white border-primary shadow-sm ring-4 ring-primary/15'
                                        : 'bg-surface border-border opacity-45'
                                }`}
                            >
                                <JumpyardIcon name={icons[i]} className="w-6 h-6" />
                            </div>
                            <span
                                className={`block w-full min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[9px] font-bold italic uppercase tracking-wider transition-colors ${
                                    i <= current ? 'text-foreground' : 'text-muted'
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

function CheckInFlow() {
    const searchParams = useSearchParams();
    const [linkToken] = useState(() => searchParams.get('jy_token') ?? searchParams.get('token'));
    const [token] = useState(() => linkToken ?? searchParams.get('bookingRef'));
    const { t, lang } = useTranslation();

    const params = new URLSearchParams(searchParams.toString());
    const channel = detectChannel(params);
    // Phone app is never used as actual kiosk — treat bare URL as park-qr
    const effectiveChannel = channel === 'kiosk' ? 'park-qr' as const : channel;

    const [state, setState] = useState<FlowState>(() => initialState(effectiveChannel));
    const [ctx, setCtx] = useState<FlowContext>(() => ({ ...initialContext(effectiveChannel), token }));
    const [isStartingSession, setIsStartingSession] = useState(false);
    const [sessionStartError, setSessionStartError] = useState<SessionIssue | null>(null);
    const [isMarkingReadyForStaff, setIsMarkingReadyForStaff] = useState(false);
    const [readyForStaffError, setReadyForStaffError] = useState<SessionIssue | null>(null);
    const [paidConfirmationState, setPaidConfirmationState] = useState<PaidConfirmationUiState>('idle');
    const paidConfirmationRunRef = useRef(0);
    const pendingSafetyAttestedAtRef = useRef<string | null>(null);
    const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
    const [addonsStep, setAddonsStep] = useState<AddonsOfferStep>('SELECT');
    const [addonsBackRequest, setAddonsBackRequest] = useState(0);
    const [addonsBackRule, setAddonsBackRule] = useState<AddonBackRule>('page');
    const [buyStep, setBuyStep] = useState<BuyTicketsStep>('TIMESLOT');
    const [exitDialogOpen, setExitDialogOpen] = useState(false);
    const [safetyExitLocked, setSafetyExitLocked] = useState(false);
    const [buyRecoverySnapshot, setBuyRecoverySnapshot] = useState<BuyFlowRecoverySnapshot | null>(null);
    const [buyRecoveryStatus, setBuyRecoveryStatus] = useState<BuyRecoveryStatus | null>(null);
    const [recoveryGateReady, setRecoveryGateReady] = useState(false);
    const [recoveryReturnRecord, setRecoveryReturnRecord] = useState<PaymentRecoveryRecord | null>(null);
    const [activeReturnAttempt, setActiveReturnAttempt] = useState<PaymentRecoveryRecord | null>(null);
    const [recoveryContinuePending, setRecoveryContinuePending] = useState(false);
    const [recoverySyncFailed, setRecoverySyncFailed] = useState(false);
    const [recoveryReadyForSafety, setRecoveryReadyForSafety] = useState(false);
    const recoveryRunRef = useRef(0);
    const recoveryPreparingRef = useRef(false);
    const recoveryCheckingRef = useRef(false);
    const recoveryContinuationRef = useRef<(() => void | Promise<void>) | null>(null);
    const recoveryContinueRequestedRef = useRef(false);
    const recoveryPreparationAbortRef = useRef<AbortController | null>(null);
    const recoveryApprovalRef = useRef<{ key: string; run: number } | null>(null);

    useEffect(() => () => {
        recoveryRunRef.current += 1;
        recoveryPreparationAbortRef.current?.abort();
    }, []);
    const addonsAvailabilityPrefetchRef = useRef<AddonsAvailabilityPrefetch | null>(null);
    const guestResumeStepWriteRef = useRef<string | null>(null);
    const [addonsAvailabilityPrefetch, setAddonsAvailabilityPrefetch] = useState<AddonsAvailabilityPrefetch | null>(null);

    useEffect(() => startBuyFlowRecoveryCleanup(), []);

    useEffect(() => {
        if (!linkToken || typeof window === 'undefined') return;

        const url = new URL(window.location.href);
        const hadSensitiveToken = url.searchParams.has('jy_token') || url.searchParams.has('token');
        if (!hadSensitiveToken) return;

        url.searchParams.delete('jy_token');
        url.searchParams.delete('token');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }, [linkToken]);

    const scrollToTop = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    };

    const delay = (milliseconds: number) =>
        new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

    const advance = (patch: Partial<FlowContext> = {}, branch: Branch = null) => {
        const newCtx = { ...ctx, ...patch };
        setCtx(newCtx);
        setState(nextState(state, newCtx, branch));
        scrollToTop();
    };

    const routeFromSessionResume = (
        checkinSession: CheckInSession,
        patch: Partial<FlowContext> = {},
        fallback: 'advance' | 'booking-summary' = 'advance'
    ) => {
        const resumeState = getResumeState(checkinSession);
        const nextCtx = { ...ctx, ...patch, checkinSession };

        if (!resumeState) {
            setAlreadyCheckedIn(false);
            if (fallback === 'booking-summary') {
                setCtx(nextCtx);
                setState('APP_BOOKING');
                scrollToTop();
                return;
            }

            advance({ ...patch, checkinSession });
            return;
        }

        setAlreadyCheckedIn(isCompletedSession(checkinSession));
        setCtx(nextCtx);
        setState(resumeState);
        scrollToTop();
    };

    const routeAlreadyCheckedIn = (patch: Partial<FlowContext> = {}) => {
        setAlreadyCheckedIn(true);
        setCtx({ ...ctx, ...patch, checkinSession: null });
        setState('APP_PRESENT');
        scrollToTop();
    };

    const getMatchingAddonsPrefetch = (booking: Booking | null) => {
        if (!booking || !addonsAvailabilityPrefetch) return null;
        return addonsAvailabilityPrefetch.key === getAddonsAvailabilityTarget(booking).key ? addonsAvailabilityPrefetch : null;
    };

    const prefetchAddonsAvailability = (booking: Booking) => {
        const target = getAddonsAvailabilityTarget(booking);
        const current = addonsAvailabilityPrefetchRef.current;
        if (current?.key === target.key) return current;

        const request = getNewBookingAvailability([target.bookingStartTime], target.bookingDate);
        const prefetch: AddonsAvailabilityPrefetch = {
            availability: null,
            error: null,
            key: target.key,
            promise: request,
        };

        addonsAvailabilityPrefetchRef.current = prefetch;
        setAddonsAvailabilityPrefetch(prefetch);

        request
            .then((availability) => {
                if (addonsAvailabilityPrefetchRef.current?.key !== target.key) return;
                const ready: AddonsAvailabilityPrefetch = {
                    availability,
                    error: null,
                    key: target.key,
                    promise: request,
                };
                addonsAvailabilityPrefetchRef.current = ready;
                setAddonsAvailabilityPrefetch(ready);
            })
            .catch((error) => {
                if (addonsAvailabilityPrefetchRef.current?.key !== target.key) return;
                const failed: AddonsAvailabilityPrefetch = {
                    availability: null,
                    error: error instanceof CloudBookingError ? error.message : t.buy.availabilityFailed,
                    key: target.key,
                    promise: null,
                };
                addonsAvailabilityPrefetchRef.current = failed;
                setAddonsAvailabilityPrefetch(failed);
            });

        return prefetch;
    };

    const handleExistingBookingFound = async (booking: Booking) => {
        const bookingAddons = booking.existingAddons ?? [];
        const bookingPatch = {
            booking,
            checkinSession: null,
            existingAddons: bookingAddons,
            selectedAddons: bookingAddons,
        };

        setAlreadyCheckedIn(false);
        setSessionStartError(null);

        if (!booking.paid) {
            advance(bookingPatch);
            return;
        }

        prefetchAddonsAvailability(booking);

        try {
            const checkinSession = await startCheckInSession(booking);
            routeFromSessionResume(checkinSession, bookingPatch, 'booking-summary');
        } catch (error) {
            if (error instanceof CloudSessionError && error.reason === 'already_redeemed') {
                routeAlreadyCheckedIn(bookingPatch);
                return;
            }

            advance(bookingPatch);
        }
    };

    const preparePaidNewBooking = async (
        booking: Booking,
        recoveryTargetState: FlowState | null = null,
        { paymentApproved = false, preserveRecoveryConfirmation = false, completedRecovery = false, isCurrent = () => true, signal }: {
            paymentApproved?: boolean;
            preserveRecoveryConfirmation?: boolean;
            completedRecovery?: boolean;
            isCurrent?: () => boolean;
            signal?: AbortSignal;
        } = {}
    ): Promise<() => void> => {
        if (!isCurrent()) return () => undefined;
        const continuePreparedPurchase = (next: FlowState) => async () => {
            if (!isCurrent()) return;
            const run = recoveryRunRef.current;
            const payment = readPaymentRecovery();
            if (payment?.kind === 'new_booking' && payment.outcome === 'approved'
                && (payment.bookingIdentifier === booking.rollerUniqueId || payment.bookingIdentifier === booking.id)) {
                if (!await clearPaymentRecoveryAfterCompletion(payment.attemptId)) throw new Error('Purchase recovery remains active');
            }
            if (run !== recoveryRunRef.current) return;
            setBuyRecoveryStatus(null);
            setState(next);
            scrollToTop();
        };
        const bookingAddons = booking.existingAddons ?? [];
        const bookingPatch: Partial<FlowContext> = {
            booking,
            buyEntryFlow: true,
            checkinSession: null,
            existingAddons: bookingAddons,
            selectedAddons: bookingAddons,
            addonsTotal: 0,
            paymentTotal: 0,
            paymentCompleted: true,
            baseProductId: booking.rollerUniqueId ?? booking.id,
            baseProductLabel: booking.productLabel ?? null,
            baseProductType: booking.productType ?? null,
            baseDurationMinutes: booking.durationMinutes ?? 0,
            baseUnitPrice: 0,
            baseQuantity: booking.jumpers,
            baseTotal: 0,
        };

        setAlreadyCheckedIn(false);
        setSessionStartError(null);

        const targetState =
            recoveryTargetState === 'APP_SAFETY_ATTEST' ? 'APP_SAFETY_ATTEST' : 'APP_SAFETY_VIDEO';
        // #331: ROLLER can confirm an approved payment a little later than the card approval.
        // An approved purchase then continues into safety without a session; the paid state
        // is confirmed once more before the staff handoff instead of polling ROLLER here.
        const continueIntoSafetyAwaitingConfirmation = () => {
            setCtx({ ...ctx, ...bookingPatch, checkinSession: null });
            if (!preserveRecoveryConfirmation) setBuyRecoveryStatus(null);
            return continuePreparedPurchase(targetState);
        };

        if (completedRecovery && !booking.paid) throw new Error('The completed booking could not be restored');
        if (!booking.paid) {
            if (paymentApproved) return continueIntoSafetyAwaitingConfirmation();

            setCtx({ ...ctx, ...bookingPatch });
            return () => {
                setState('APP_BOOKING');
                scrollToTop();
            };
        }

        try {
            const checkinSession = paymentApproved
                ? await runPurchasePreparationRequest(
                    (requestSignal) => startCheckInSession(booking, 'safety', { signal: requestSignal }),
                    { signal, isCurrent, timeoutMs: 35_000 },
                )
                : await startCheckInSession(booking, 'safety');
            if (!isCurrent()) return () => undefined;
            const resumeState = getResumeState(checkinSession);
            if (completedRecovery && resumeState !== 'APP_CONFIRM' && resumeState !== 'APP_PRESENT') {
                throw new Error('The completed handoff could not be restored');
            }
            const nextCtx = { ...ctx, ...bookingPatch, checkinSession };

            setAlreadyCheckedIn(isCompletedSession(checkinSession));
            setCtx(nextCtx);
            if (!preserveRecoveryConfirmation) setBuyRecoveryStatus(null);
            return continuePreparedPurchase(resumeState ?? targetState);
        } catch (error) {
            if (!isCurrent()) return () => undefined;
            if (error instanceof CloudSessionError && error.reason === 'already_redeemed') {
                setAlreadyCheckedIn(true);
                setCtx({ ...ctx, ...bookingPatch, checkinSession: null });
                return continuePreparedPurchase('APP_PRESENT');
            }

            if (completedRecovery) throw error;
            // An approved purchase keeps its safety path; the session is retried before the handoff.
            if (paymentApproved) return continueIntoSafetyAwaitingConfirmation();

            setSessionStartError(error instanceof CloudSessionError ? error.reason : 'session_failed');
            setCtx({ ...ctx, ...bookingPatch, buyEntryFlow: false });
            return () => {
                setState('APP_BOOKING');
                scrollToTop();
            };
        }
    };

    const getAddonsFlowPatch = (result: AddonsOfferResult): Partial<FlowContext> => ({
        selectedAddons: result.selectedAddons,
        addonsTotal: result.addonsTotal,
        skyriderSelected: result.skyriderSelected,
        skyriderHeightConfirmed: result.skyriderHeightConfirmed ?? false,
        connectedSelected: result.connectedSelected,
        paymentCompleted: result.paymentHandled ? true : ctx.paymentCompleted,
        paymentTotal: result.paymentHandled ? 0 : (ctx.baseTotal || 0) + result.addonsTotal,
    });

    const preparePaidAddonsForSafety = (result: AddonsOfferResult) => {
        const booking = ctx.booking;
        if (!booking) return;

        const patch = getAddonsFlowPatch(result);
        setCtx((current) => ({ ...current, ...patch }));
        setSafetyExitLocked(true);

        if (ctx.checkinSession?.guestResumeStep === 'safety') return;
        const checkinSessionId = ctx.checkinSession?.checkinSessionId ?? `booking:${booking.id}`;
        if (guestResumeStepWriteRef.current === checkinSessionId) return;
        guestResumeStepWriteRef.current = checkinSessionId;

        startCheckInSession(booking, 'safety')
            .then((checkinSession) => {
                setCtx((current) => current.booking?.id === booking.id
                    ? { ...current, checkinSession }
                    : current);
            })
            .catch(() => {
                if (guestResumeStepWriteRef.current === checkinSessionId) {
                    guestResumeStepWriteRef.current = null;
                }
            });
    };

    const recoveryStillCurrent = (record: PaymentRecoveryRecord | null, snapshot: BuyFlowRecoverySnapshot) => {
        const current = readPaymentRecovery();
        const saved = readBuyFlowRecovery();
        if (record) return Boolean(current && current.attemptId === record.attemptId
            && current.createdAt === record.createdAt && recoveryMatchesBooking(current, saved)
            && recoveryMatchesBooking(current, snapshot));
        const identifier = getBuyFlowRecoveryIdentifier(snapshot);
        return !current && Boolean(identifier && identifier === getBuyFlowRecoveryIdentifier(saved));
    };

    const revealRecoveredPurchase = async (
        record: PaymentRecoveryRecord | null,
        snapshot: BuyFlowRecoverySnapshot,
        continuation: () => void | Promise<void>,
    ) => {
        if (!recoveryStillCurrent(record, snapshot)) return;
        const run = recoveryRunRef.current;
        // Preserve the safety recovery before the approved payment marker is released.
        writeBuyFlowRecovery({ ...snapshot, currentFlowStep: 'APP_SAFETY_VIDEO' });
        try {
            await continuation();
            if (run !== recoveryRunRef.current) return;
            recoveryContinuationRef.current = null;
            setRecoveryReturnRecord(null);
        } catch {
            if (run !== recoveryRunRef.current || !recoveryStillCurrent(record, snapshot)) return;
            recoveryContinuationRef.current = null;
            setRecoveryReadyForSafety(false);
            setRecoverySyncFailed(true);
        } finally {
            if (run === recoveryRunRef.current) {
                recoveryContinueRequestedRef.current = false;
                setRecoveryContinuePending(false);
            }
        }
    };

    const prepareRecoveredPurchase = async (
        record: PaymentRecoveryRecord | null,
        snapshot: BuyFlowRecoverySnapshot,
        knownBooking?: Booking,
    ) => {
        if (recoveryPreparingRef.current || !recoveryStillCurrent(record, snapshot)) return;
        const identifier = record?.bookingIdentifier ?? getBuyFlowRecoveryIdentifier(snapshot);
        if (!identifier) return;
        recoveryPreparingRef.current = true;
        recoveryPreparationAbortRef.current?.abort();
        const preparation = new AbortController();
        recoveryPreparationAbortRef.current = preparation;
        const run = recoveryRunRef.current;
        const current = () => !preparation.signal.aborted && run === recoveryRunRef.current && recoveryStillCurrent(record, snapshot);
        setRecoveryReadyForSafety(false);
        setRecoverySyncFailed(false);
        try {
            const confirmation = knownBooking
                ? { status: 'paid' as const, booking: knownBooking }
                : await resolvePurchasePreparation(lookupBooking, identifier, { signal: preparation.signal, isCurrent: current });
            if (!current()) return;
            if (confirmation.status === 'unavailable') throw new Error('Booking confirmation unavailable');
            const booking = confirmation.booking;
            if (booking.rollerUniqueId !== identifier && booking.id !== identifier) throw new Error('Booking identity mismatch');
            const continuation = await preparePaidNewBooking(booking, getBuyFlowRecoveryTargetState(snapshot), {
                paymentApproved: true,
                preserveRecoveryConfirmation: true,
                isCurrent: current,
                signal: preparation.signal,
            });
            if (!current()) return;
            recoveryContinuationRef.current = continuation;
            setRecoveryReadyForSafety(true);
        } catch {
            if (!current()) return;
            recoveryContinueRequestedRef.current = false;
            setRecoveryContinuePending(false);
            setRecoverySyncFailed(true);
        } finally {
            if (run === recoveryRunRef.current) recoveryPreparingRef.current = false;
        }
    };

    const showApprovedRecovery = (
        record: PaymentRecoveryRecord | null,
        snapshot: BuyFlowRecoverySnapshot,
        knownBooking?: Booking,
    ) => {
        if (!snapshot.draftState || !recoveryStillCurrent(record, snapshot)) return;
        const approvalKey = JSON.stringify([getBuyFlowRecoveryIdentifier(snapshot), record?.attemptId, record?.createdAt]);
        if (recoveryApprovalRef.current?.key === approvalKey && recoveryApprovalRef.current.run === recoveryRunRef.current) return;
        const approved: BuyFlowRecoverySnapshot = {
            ...snapshot,
            currentFlowStep: 'PAYMENT',
            draftState: { ...snapshot.draftState, paymentApproved: true },
        };
        writeBuyFlowRecovery(approved);
        const saved = readBuyFlowRecovery();
        if (!saved) { setBuyRecoveryStatus('payment-unknown'); return; }
        recoveryRunRef.current += 1;
        recoveryApprovalRef.current = { key: approvalKey, run: recoveryRunRef.current };
        recoveryPreparationAbortRef.current?.abort();
        recoveryPreparingRef.current = false;
        recoveryContinuationRef.current = null;
        recoveryContinueRequestedRef.current = false;
        setBuyRecoverySnapshot(saved);
        setRecoveryReturnRecord(record);
        setRecoveryContinuePending(false);
        setRecoveryReadyForSafety(false);
        setBuyRecoveryStatus('payment-approved');
        void prepareRecoveredPurchase(record, saved, knownBooking);
    };

    const handlePaymentReturnResult = (record: PaymentRecoveryRecord, result: RollerPaymentResultSummary) => {
        const latest = readPaymentRecovery();
        const snapshot = readBuyFlowRecovery();
        if (!latest || latest.attemptId !== record.attemptId || latest.createdAt !== record.createdAt
            || !snapshot || !recoveryMatchesDraft(latest, snapshot)) return;
        if ((latest.outcome === 'approved' && result.status !== 'approved')
            || (latest.outcome === 'failed' && result.status !== 'failed')) return;
        setRecoveryReturnRecord(latest);
        setBuyRecoverySnapshot(snapshot);
        if (result.status === 'approved' && latest.outcome === 'approved') {
            showApprovedRecovery(latest, snapshot);
        } else if (result.status === 'failed' && latest.outcome === 'failed') {
            setBuyRecoveryStatus('payment-failed');
        } else {
            setBuyRecoveryStatus('payment-unknown');
        }
    };

    const checkRecoveryPayment = async () => {
        if (recoveryCheckingRef.current) return;
        const record = readPaymentRecovery();
        const snapshot = readBuyFlowRecovery();
        if (!snapshot || (record && (record.kind !== 'new_booking' || !recoveryMatchesDraft(record, snapshot)))
            || (record?.attemptId ?? null) !== (recoveryReturnRecord?.attemptId ?? null)
            || (record && record.createdAt !== recoveryReturnRecord?.createdAt)
            || !recoveryStillCurrent(record, snapshot)) {
            setBuyRecoveryStatus('payment-unknown');
            return;
        }
        const identifier = record?.bookingIdentifier ?? getBuyFlowRecoveryIdentifier(snapshot);
        if (!identifier) return;
        recoveryCheckingRef.current = true;
        const run = ++recoveryRunRef.current;
        setBuyRecoveryStatus('payment-checking');
        try {
            // One explicit status check, always against the original purchase.
            const booking = await lookupBooking(identifier);
            if (run !== recoveryRunRef.current || !recoveryStillCurrent(record, snapshot)) return;
            if (!booking.paid || (booking.rollerUniqueId !== identifier && booking.id !== identifier)) {
                setBuyRecoveryStatus('payment-unknown');
                return;
            }
            if (record && !await approvePaymentRecovery(record.attemptId)) {
                if (run === recoveryRunRef.current) setBuyRecoveryStatus('payment-unknown');
                return;
            }
            if (run !== recoveryRunRef.current || !recoveryStillCurrent(record, snapshot)) return;
            showApprovedRecovery(record ? readPaymentRecovery() : null, snapshot, booking);
        } catch {
            if (run === recoveryRunRef.current) setBuyRecoveryStatus('payment-unknown');
        } finally {
            recoveryCheckingRef.current = false;
        }
    };

    const retryFailedPayment = async () => {
        const record = readPaymentRecovery();
        const snapshot = readBuyFlowRecovery();
        if (hasPaymentRedirect() || !record || record.outcome !== 'failed' || !snapshot || !recoveryMatchesDraft(record, snapshot)
            || record.attemptId !== recoveryReturnRecord?.attemptId || record.createdAt !== recoveryReturnRecord.createdAt) {
            setBuyRecoveryStatus('payment-unknown');
            return;
        }
        const retry: BuyFlowRecoverySnapshot = {
            ...snapshot,
            currentFlowStep: 'CONTACT',
            bookingReference: null,
            draftUniqueId: null,
            draftState: null,
        };
        // Availability/price is refreshed by BuyTickets; no draft is created by this action.
        let saved: BuyFlowRecoverySnapshot | null = null;
        if (!await clearPaymentRecoveryAfterCompletion(record.attemptId, () => {
            writeBuyFlowRecovery(retry);
            saved = readBuyFlowRecovery();
            return Boolean(saved && isPrePaymentBuyFlowRecovery(saved));
        })) return;
        recoveryRunRef.current += 1;
        recoveryContinuationRef.current = null;
        setRecoveryReturnRecord(null);
        setActiveReturnAttempt(null);
        setBuyRecoverySnapshot(saved);
        setBuyRecoveryStatus(null);
        setState('KIOSK_BUY');
        scrollToTop();
    };

    const continueRecoveredPurchase = () => {
        const snapshot = buyRecoverySnapshot;
        if (!snapshot || !recoveryStillCurrent(recoveryReturnRecord, snapshot)) return;
        const continuation = recoveryContinuationRef.current;
        if (!continuation || recoveryContinueRequestedRef.current) return;
        recoveryContinueRequestedRef.current = true;
        setRecoveryContinuePending(true);
        void revealRecoveredPurchase(recoveryReturnRecord, snapshot, continuation);
    };

    const resumeBuyFlowRecovery = async (snapshot: BuyFlowRecoverySnapshot | null = buyRecoverySnapshot) => {
        if (!snapshot) return;

        // Restoring a finished booking cannot take over a different checkout, or forget
        // an unresolved payment this page already observed just because its data expired.
        if (readPaymentRecovery() || hasPaymentRedirect() || recoveryReturnRecord) {
            await checkRecoveryPayment();
            return;
        }

        const identifier = getBuyFlowRecoveryIdentifier(snapshot);
        if (!identifier) {
            setBuyRecoveryStatus('unsafe');
            scrollToTop();
            return;
        }

        setBuyRecoveryStatus('checking');
        setSessionStartError(null);
        const run = ++recoveryRunRef.current;
        const current = () => run === recoveryRunRef.current
            && sameBuyRecoverySnapshot(snapshot, readBuyFlowRecovery())
            && readPaymentRecovery() === null && !hasPaymentRedirect();
        try {
            const booking = await lookupBooking(identifier);
            if (!current()) return;
            if (booking.rollerUniqueId !== identifier && booking.id !== identifier) throw new Error('Booking identity mismatch');
            const continuation = await preparePaidNewBooking(booking, getBuyFlowRecoveryTargetState(snapshot), {
                paymentApproved: snapshot.draftState?.paymentApproved === true,
                completedRecovery: hasCompletedBuyFlowRecovery(snapshot),
                isCurrent: current,
            });
            if (current()) continuation();
        } catch {
            if (!current()) return;
            setBuyRecoveryStatus(hasCompletedBuyFlowRecovery(snapshot) ? 'completed-unavailable'
                : snapshot.draftState?.paymentApproved ? 'payment-unknown' : 'failed');
            scrollToTop();
        }
    };

    const resetToStart = async () => {
        const payment = readPaymentRecovery();
        const savedPurchase = readBuyFlowRecovery();
        const savedIdentifier = getBuyFlowRecoveryIdentifier(savedPurchase);
        const purchaseAtConfirmation = state === 'APP_PRESENT'
            || (state === 'APP_CONFIRM' && ctx.checkinSession && isReadyForStaffSession(ctx.checkinSession));
        const completionExit = purchaseAtConfirmation && ctx.booking;
        const completedOwnPurchase = completionExit && ctx.paymentCompleted && ctx.booking
            && (ctx.booking.id === savedIdentifier || ctx.booking.rollerUniqueId === savedIdentifier);
        const completedSavedPurchase = buyRecoveryStatus === 'completed-unavailable' && !recoveryReturnRecord
            && sameBuyRecoverySnapshot(buyRecoverySnapshot, savedPurchase)
            && hasCompletedBuyFlowRecovery(savedPurchase);
        const approvedPurchaseUnfinished = savedPurchase?.draftState?.paymentApproved === true
            && !completedOwnPurchase && !completedSavedPurchase;
        const paymentUncertain = payment?.outcome === 'pending' || payment?.outcome === 'unknown'
            || hasPaymentRedirect() || buyRecoveryStatus === 'payment-unknown'
            || buyRecoveryStatus === 'payment-checking' || buyRecoveryStatus === 'payment-return'
            || (buyRecoveryStatus === 'completed-unavailable' && !completedSavedPurchase)
            || (completionExit && savedPurchase && !completedOwnPurchase)
            || approvedPurchaseUnfinished;
        if (paymentUncertain) {
            setRecoveryReturnRecord(payment);
            setBuyRecoverySnapshot(savedPurchase);
            setBuyRecoveryStatus('payment-unknown');
            setState('KIOSK_CHOICE');
            setExitDialogOpen(false);
            return;
        }
        if (payment && (payment.outcome !== 'failed'
            || !recoveryMatchesDraft(payment, savedPurchase)
            || (recoveryReturnRecord && (payment.attemptId !== recoveryReturnRecord.attemptId
                || payment.createdAt !== recoveryReturnRecord.createdAt)))) return;
        const clearCurrentPurchase = () => {
            const latestPurchase = readBuyFlowRecovery();
            if (hasPaymentRedirect() || !sameBuyRecoverySnapshot(savedPurchase, latestPurchase)) return false;
            if (completedSavedPurchase && !hasCompletedBuyFlowRecovery(latestPurchase)) return false;
            // Invalidate a pending lookup before releasing the saved purchase.
            recoveryRunRef.current += 1;
            clearBuyFlowRecovery();
            return true;
        };
        const cleared = payment
            ? await clearPaymentRecoveryAfterCompletion(payment.attemptId, clearCurrentPurchase)
            : completedSavedPurchase ? await withNoActivePaymentRecovery(clearCurrentPurchase)
                : completionExit ? await withNoActivePaymentRecovery(clearCurrentPurchase, { allowLegacyOwnership: true })
                    : clearCurrentPurchase();
        if (!cleared) {
            setRecoveryReturnRecord(readPaymentRecovery());
            setBuyRecoverySnapshot(readBuyFlowRecovery());
            setBuyRecoveryStatus('payment-unknown');
            setState('KIOSK_CHOICE');
            setExitDialogOpen(false);
            return;
        }
        recoveryPreparingRef.current = false;
        recoveryPreparationAbortRef.current?.abort();
        recoveryApprovalRef.current = null;
        recoveryContinuationRef.current = null;
        recoveryContinueRequestedRef.current = false;
        setRecoveryReturnRecord(null);
        setActiveReturnAttempt(null);
        setRecoveryContinuePending(false);
        setRecoverySyncFailed(false);
        setRecoveryReadyForSafety(false);
        setBuyRecoverySnapshot(null);
        setBuyRecoveryStatus(null);
        setAlreadyCheckedIn(false);
        setSessionStartError(null);
        setReadyForStaffError(null);
        setIsStartingSession(false);
        setIsMarkingReadyForStaff(false);
        paidConfirmationRunRef.current += 1;
        pendingSafetyAttestedAtRef.current = null;
        setPaidConfirmationState('idle');
        setAddonsStep('SELECT');
        setAddonsBackRequest(0);
        setBuyStep('TIMESLOT');
        setExitDialogOpen(false);
        setSafetyExitLocked(false);
        addonsAvailabilityPrefetchRef.current = null;
        setAddonsAvailabilityPrefetch(null);
        guestResumeStepWriteRef.current = null;
        setCtx({ ...initialContext(effectiveChannel), token: null });
        setState('KIOSK_CHOICE');
        scrollToTop();
    };

    const restartAfterBuyRecovery = resetToStart;

    const startExistingBookingCheckIn = async () => {
        if (!ctx.booking || isStartingSession) return;

        prefetchAddonsAvailability(ctx.booking);

        if (ctx.checkinSession) {
            routeFromSessionResume(ctx.checkinSession);
            return;
        }

        setIsStartingSession(true);
        setSessionStartError(null);
        try {
            const checkinSession = await startCheckInSession(ctx.booking);
            routeFromSessionResume(checkinSession);
        } catch (error) {
            if (error instanceof CloudSessionError && error.reason === 'already_redeemed') {
                routeAlreadyCheckedIn();
                return;
            }

            setSessionStartError(error instanceof CloudSessionError ? error.reason : 'session_failed');
            scrollToTop();
        } finally {
            setIsStartingSession(false);
        }
    };

    const confirmApprovedPurchaseAndReadyForStaff = async (
        attestedAt: string,
        { manualRetry = false }: { manualRetry?: boolean } = {}
    ) => {
        const booking = ctx.booking;
        const identifier = getApprovedPurchaseIdentifier(booking);
        if (!booking || !identifier) {
            setReadyForStaffError('session_failed');
            return;
        }

        const run = paidConfirmationRunRef.current + 1;
        paidConfirmationRunRef.current = run;
        const isCurrentRun = () => paidConfirmationRunRef.current === run;

        pendingSafetyAttestedAtRef.current = attestedAt;
        setIsMarkingReadyForStaff(true);
        setReadyForStaffError(null);
        setPaidConfirmationState('checking');
        let confirmedBooking: Booking | null = null;
        try {
            for (let retryIndex = 0; ; retryIndex += 1) {
                const confirmation = await resolvePaidConfirmation(lookupBooking, identifier, { wait: delay });
                if (!isCurrentRun()) return;

                if (confirmation.status === 'unavailable') {
                    setPaidConfirmationState('idle');
                    setReadyForStaffError('network_error');
                    scrollToTop();
                    return;
                }

                if (confirmation.status === 'paid') {
                    confirmedBooking = confirmation.booking;
                    const checkinSession = await startCheckInSession(confirmation.booking, 'safety');
                    const readySession = await markSessionReadyForStaff(checkinSession, 'completed');
                    if (!isCurrentRun()) return;
                    pendingSafetyAttestedAtRef.current = null;
                    setPaidConfirmationState('idle');
                    const confirmedAddons = confirmation.booking.existingAddons ?? [];
                    advance({
                        booking: confirmation.booking,
                        checkinSession: readySession,
                        existingAddons: confirmedAddons,
                        selectedAddons: confirmedAddons,
                        safetyAttestedAt: attestedAt,
                    });
                    return;
                }

                // Still unpaid in ROLLER: sparse, bounded waits instead of polling. A manual retry
                // is a single check so the guest cannot restart a burst of lookups.
                const retryDelay = manualRetry ? null : getPaidConfirmationRetryDelay(retryIndex);
                if (retryDelay === null) {
                    setPaidConfirmationState('delayed');
                    return;
                }
                setPaidConfirmationState('waiting');
                await delay(retryDelay);
                if (!isCurrentRun()) return;
            }
        } catch (error) {
            if (!isCurrentRun()) return;
            if (error instanceof CloudSessionError && error.reason === 'already_redeemed') {
                pendingSafetyAttestedAtRef.current = null;
                setPaidConfirmationState('idle');
                routeAlreadyCheckedIn(confirmedBooking ? { booking: confirmedBooking } : {});
                return;
            }

            setPaidConfirmationState('idle');
            setReadyForStaffError(error instanceof CloudSessionError ? error.reason : 'session_failed');
            scrollToTop();
        } finally {
            if (isCurrentRun()) setIsMarkingReadyForStaff(false);
        }
    };

    const retryApprovedPurchaseConfirmation = () => {
        if (isMarkingReadyForStaff) return;
        const attestedAt = pendingSafetyAttestedAtRef.current ?? new Date().toISOString();
        void confirmApprovedPurchaseAndReadyForStaff(attestedAt, { manualRetry: true });
    };

    const completeSafetyAndReadyForStaff = async (attestedAt: string) => {
        if (isMarkingReadyForStaff) return;
        if (!ctx.checkinSession) {
            if (isApprovedPurchaseAwaitingConfirmation(ctx)) {
                await confirmApprovedPurchaseAndReadyForStaff(attestedAt);
                return;
            }
            setReadyForStaffError('session_failed');
            return;
        }

        setIsMarkingReadyForStaff(true);
        setReadyForStaffError(null);
        try {
            const checkinSession = await markSessionReadyForStaff(ctx.checkinSession, 'completed');
            advance({ safetyAttestedAt: attestedAt, checkinSession });
        } catch (error) {
            setReadyForStaffError(error instanceof CloudSessionError ? error.reason : 'session_failed');
            scrollToTop();
        } finally {
            setIsMarkingReadyForStaff(false);
        }
    };

    useEffect(() => {
        scrollToTop();
    }, [state]);

    useEffect(() => {
        if (recoveryGateReady && state !== 'KIOSK_CHOICE') return;
        if (buyRecoveryStatus !== null) return;
        const snapshot = readBuyFlowRecovery();
        const record = readPaymentRecovery();
        const returned = hasPaymentRedirect();
        setRecoveryGateReady(true);
        setBuyRecoverySnapshot(snapshot);

        // A terminal/claimed record does not prove that an arbitrary URL belongs
        // to it. Check the stored session hash before removing a duplicate return.
        if (returned && record && (record.returnConsumed || record.outcome === 'approved' || record.outcome === 'failed')) {
            setState('KIOSK_CHOICE');
            setRecoveryReturnRecord(record);
            setBuyRecoveryStatus('payment-checking');
            const run = ++recoveryRunRef.current;
            void returnedSessionMatches(record).then(matches => {
                const latest = readPaymentRecovery();
                if (run !== recoveryRunRef.current || !latest || latest.attemptId !== record.attemptId
                    || latest.createdAt !== record.createdAt || latest.sessionHash !== record.sessionHash) return;
                if (!matches) { setBuyRecoveryStatus('payment-unknown'); return; }
                consumePaymentRedirect();
                setBuyRecoveryStatus(null);
            }).catch(() => {
                if (run === recoveryRunRef.current) setBuyRecoveryStatus('payment-unknown');
            });
            return;
        }

        const savedSafety = Boolean(snapshot && snapshot.draftState?.paymentApproved
            && isBuyEntryRecoveryState(snapshot.currentFlowStep as FlowState));
        // This purchase has already crossed into its saved safety flow. Its approved
        // payment marker must not block a later, separately purchased add-on.
        if (record?.outcome === 'approved' && savedSafety && recoveryMatchesBooking(record, snapshot)) {
            const run = ++recoveryRunRef.current;
            setRecoveryReturnRecord(record);
            setBuyRecoveryStatus('payment-checking');
            void clearPaymentRecoveryAfterCompletion(record.attemptId).then(cleared => {
                if (run !== recoveryRunRef.current) return;
                if (!cleared) { setBuyRecoveryStatus('payment-unknown'); return; }
                setRecoveryReturnRecord(null);
                setBuyRecoveryStatus(null);
            });
            return;
        } else if (record || returned) {
            setState('KIOSK_CHOICE');
            setRecoveryReturnRecord(record);
            if (!record || !snapshot || !recoveryMatchesDraft(record, snapshot)) {
                setBuyRecoveryStatus('payment-unknown');
                return;
            }
            if (record.outcome === 'approved') {
                showApprovedRecovery(record, snapshot);
                return;
            }
            if (record.outcome === 'failed') {
                setBuyRecoveryStatus('payment-failed');
                return;
            }
            if (returned && !record.returnConsumed) {
                setActiveReturnAttempt(record);
                setBuyRecoveryStatus('payment-return');
                return;
            }
            setBuyRecoveryStatus('payment-unknown');
            return;
        }

        if (state !== 'KIOSK_CHOICE' || linkToken || !snapshot) return;
        // Legacy payment snapshots cannot prove a declined payment. Preserve their
        // original identifier for a later paid-status check instead of offering a new purchase.
        if (snapshot.currentFlowStep === 'PAYMENT' || snapshot.currentFlowStep === 'PENDING') {
            setRecoveryReturnRecord(null);
            setBuyRecoveryStatus('payment-unknown');
            return;
        }

        if (isPrePaymentBuyFlowRecovery(snapshot)) {
            setBuyRecoveryStatus(null);
            setState('KIOSK_BUY');
            scrollToTop();
            return;
        }

        void resumeBuyFlowRecovery(snapshot);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, linkToken, buyRecoveryStatus, recoveryGateReady]);

    useEffect(() => {
        writeSafetyRecovery(state, ctx, alreadyCheckedIn);
    }, [ctx, state, alreadyCheckedIn]);

    useEffect(() => {
        if (
            state !== 'APP_SAFETY_VIDEO' ||
            !ctx.booking ||
            !ctx.checkinSession ||
            ctx.checkinSession.guestResumeStep === 'safety'
        ) return;

        const checkinSessionId = ctx.checkinSession.checkinSessionId;
        if (guestResumeStepWriteRef.current === checkinSessionId) return;
        guestResumeStepWriteRef.current = checkinSessionId;

        startCheckInSession(ctx.booking, 'safety')
            .then((checkinSession) => {
                setCtx((current) => current.checkinSession?.checkinSessionId === checkinSessionId
                    ? { ...current, checkinSession }
                    : current);
            })
            .catch(() => {
                if (guestResumeStepWriteRef.current === checkinSessionId) {
                    guestResumeStepWriteRef.current = null;
                }
            });
    }, [ctx.booking, ctx.checkinSession, state]);

    useEffect(() => {
        if (state !== 'APP_ADDONS') {
            setAddonsStep('SELECT');
            setAddonsBackRule('page');
        }
    }, [state]);

    useEffect(() => {
        if (state !== 'KIOSK_BUY') setBuyStep('TIMESLOT');
    }, [state]);

    useEffect(() => {
        // Leaving the safety attestation cancels any pending paid confirmation so a stale
        // check cannot advance the flow later.
        if (state === 'APP_SAFETY_ATTEST') return;
        paidConfirmationRunRef.current += 1;
        pendingSafetyAttestedAtRef.current = null;
        setPaidConfirmationState('idle');
        setIsMarkingReadyForStaff(false);
    }, [state]);

    useEffect(() => {
        if (hasReachedSafety(state, ctx.checkinSession)) setSafetyExitLocked(true);
    }, [ctx.checkinSession, state]);

    useEffect(() => {
        if (state !== 'APP_MOBILE' || !recoveryGateReady) return;
        let alive = true;
        if (!linkToken) {
            setState('KIOSK_LOOKUP');
            return () => {
                alive = false;
            };
        }

        setSessionStartError(null);
        resolveCheckInSessionLink(linkToken)
            .then(({ booking, checkinSession }) => {
                if (!alive) return;
                setAlreadyCheckedIn(false);
                const bookingAddons = booking.existingAddons ?? [];
                if (booking.paid) prefetchAddonsAvailability(booking);
                routeFromSessionResume(
                    checkinSession,
                    { booking, checkinSession, existingAddons: bookingAddons, selectedAddons: bookingAddons },
                    'booking-summary'
                );
            })
            .catch(error => {
                if (!alive) return;
                setSessionStartError(error instanceof CloudSessionError ? error.reason : 'session_failed');
                setState('KIOSK_LOOKUP');
                scrollToTop();
            });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, recoveryGateReady]);

    const backState = getBackState(state, ctx);
    // #330: the add-on offer decides whether Back is offered during its own payment.
    const flowBackAction = getFlowBackAction({ state, backState, addonsBackRule });
    const matchingAddonsPrefetch = getMatchingAddonsPrefetch(ctx.booking);
    const showingBuyPaymentRecovery = state === 'KIOSK_CHOICE'
        && Boolean(buyRecoverySnapshot && buyRecoveryStatus?.startsWith('payment-')
            && (!recoveryReturnRecord || recoveryMatchesDraft(recoveryReturnRecord, buyRecoverySnapshot)));
    const showingCompletedBuyRecovery = state === 'KIOSK_CHOICE'
        && (buyRecoveryStatus === 'completed-unavailable' || buyRecoveryStatus === 'checking')
        && !recoveryReturnRecord && hasCompletedBuyFlowRecovery(buyRecoverySnapshot);
    const progressState: FlowState = showingCompletedBuyRecovery ? 'APP_CONFIRM' : showingBuyPaymentRecovery ? 'APP_PAYMENT' : state;
    const exitFlowMode = getExitFlowMode({
        addonsStep,
        buyStep,
        paymentCompleted: ctx.paymentCompleted,
        safetyLocked: safetyExitLocked,
        session: ctx.checkinSession,
        state,
    });

    return (
        <div
            className="phone-flow z-10 w-full max-w-lg min-w-0 flex flex-col items-center"
            data-flow-state={state}
            data-checkin-session-id={ctx.checkinSession?.checkinSessionId ?? ''}
            data-checkin-session-status={ctx.checkinSession?.status ?? ''}
            data-handoff-status={ctx.checkinSession?.handoffStatus ?? ''}
            data-handoff-code={ctx.checkinSession?.handoffCode ?? ''}
            data-already-checked-in={String(alreadyCheckedIn)}
        >
            <LanguageToggle compact={!isStartState(progressState)} className="absolute top-2 right-2 z-20" />
            <ProgressBar
                state={progressState}
                buyEntryFlow={ctx.buyEntryFlow || showingBuyPaymentRecovery || showingCompletedBuyRecovery}
            />

            <div className={`w-full max-w-md min-w-0 px-4 h-8 items-center justify-between ${state === 'KIOSK_BUY' ? 'hidden' : 'flex'} ${hasProgressBar(progressState) ? '' : 'pr-10'}`}>
                {flowBackAction && (
                    <button
                        onClick={() => {
                            if (flowBackAction === 'addons') {
                                setAddonsBackRequest((request) => request + 1);
                                scrollToTop();
                                return;
                            }
                            setState(backState!);
                            scrollToTop();
                        }}
                        className="flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
                    >
                        <ArrowLeft size={14} /> {t.common.back}
                    </button>
                )}
                {exitFlowMode === 'confirm' && (
                    <button
                        className="ml-auto flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
                        data-testid="exit-flow-open"
                        onClick={() => setExitDialogOpen(true)}
                        type="button"
                    >
                        {t.common.exit} <X size={14} />
                    </button>
                )}
            </div>

            <ExitFlowDialog
                open={exitDialogOpen && exitFlowMode === 'confirm'}
                onClose={() => setExitDialogOpen(false)}
                onConfirm={resetToStart}
            />

            <div className="phone-flow-content w-full max-w-full min-w-0 flex items-center justify-center relative">
                {state === 'KIOSK_CHOICE' && activeReturnAttempt
                    && (buyRecoveryStatus === 'payment-return' || buyRecoveryStatus === 'payment-unknown' || buyRecoveryStatus === 'payment-checking') && (
                    <div className="w-full max-w-md px-4" hidden={buyRecoveryStatus !== 'payment-return'}>
                        <RollerPaymentDropIn
                            amountLabel={recoveryAmount(buyRecoverySnapshot, lang)}
                            attemptId={activeReturnAttempt.attemptId}
                            bookingIdentifier={activeReturnAttempt.bookingIdentifier}
                            kind={activeReturnAttempt.kind}
                            returnAttempt={activeReturnAttempt}
                            paymentSession={{ jwtPresent: false, config: activeReturnAttempt.config }}
                            onApproved={result => handlePaymentReturnResult(activeReturnAttempt, result)}
                            onFailed={result => handlePaymentReturnResult(activeReturnAttempt, result)}
                        />
                    </div>
                )}
                <AnimatePresence mode="wait">
                    {state === 'APP_MOBILE' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            key="mobile"
                            className="flex w-full max-w-full min-w-0 flex-col items-center justify-center text-foreground"
                            style={{ minHeight: 'calc(100dvh - 60px)' }}
                        >
                            <img src="/jumpyard_logo.png" alt="JumpYard" className="w-40 mb-6" />
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-muted text-sm">
                                {t.common.loading}
                            </p>
                        </motion.div>
                    )}

                    {state === 'KIOSK_CHOICE' && !recoveryGateReady && (
                        <BuyRecoveryCard key="recovery-loading" status="checking" onRetry={() => undefined} onRestart={() => undefined} />
                    )}

                    {state === 'KIOSK_CHOICE' && buyRecoveryStatus === 'payment-approved' && (
                        <div key="recovered-payment-approved" className="w-full max-w-md px-4 py-5">
                            <PhonePaymentConfirmation
                                language={lang}
                                amountLabel={recoveryAmount(buyRecoverySnapshot, lang)}
                                preparationState={recoverySyncFailed ? 'delayed' : recoveryReadyForSafety ? 'ready' : 'preparing'}
                                onRetryPreparation={() => {
                                    if (buyRecoverySnapshot) void prepareRecoveredPurchase(recoveryReturnRecord, buyRecoverySnapshot);
                                }}
                                isContinuing={recoveryContinuePending}
                                onContinueToSafety={continueRecoveredPurchase}
                            />
                        </div>
                    )}

                    {state === 'KIOSK_CHOICE' && buyRecoveryStatus
                        && buyRecoveryStatus !== 'payment-return' && buyRecoveryStatus !== 'payment-approved' && (
                        <BuyRecoveryCard
                            key="buy-recovery"
                            status={buyRecoveryStatus}
                            canRetry={buyRecoveryStatus !== 'payment-unknown' || Boolean(
                                recoveryReturnRecord
                                    ? recoveryMatchesDraft(recoveryReturnRecord, buyRecoverySnapshot)
                                    : getBuyFlowRecoveryIdentifier(buyRecoverySnapshot)
                            )}
                            onRetry={() => {
                                if (buyRecoveryStatus === 'payment-failed') retryFailedPayment();
                                else if (buyRecoveryStatus === 'payment-unknown'
                                    && (recoveryReturnRecord || !(buyRecoverySnapshot?.draftState?.paymentApproved
                                        && isBuyEntryRecoveryState(buyRecoverySnapshot.currentFlowStep as FlowState)))) void checkRecoveryPayment();
                                else void resumeBuyFlowRecovery();
                            }}
                            onRestart={restartAfterBuyRecovery}
                        />
                    )}

                    {state === 'KIOSK_CHOICE' && recoveryGateReady && !buyRecoveryStatus && (
                        <ParkChoice
                            key="park-choice"
                            onSelect={choice => advance({}, choice === 'BOOKING' ? 'booking' : 'buy')}
                        />
                    )}

                    {state === 'KIOSK_LOOKUP' && (
                        <BookingLookup
                            key="park-lookup"
                            onSuccess={booking => {
                                void handleExistingBookingFound(booking);
                            }}
                            onBack={() => { setState('KIOSK_CHOICE'); scrollToTop(); }}
                        />
                    )}

                    {state === 'KIOSK_BUY' && (
                        <BuyTickets
                            key="park-buy"
                            recoverySnapshot={
                                isPrePaymentBuyFlowRecovery(buyRecoverySnapshot) ? buyRecoverySnapshot : null
                            }
                            onBack={() => {
                                resetToStart();
                            }}
                            inlineExitVisible={exitFlowMode === 'confirm'}
                            onRequestExit={() => setExitDialogOpen(true)}
                            onStepChange={setBuyStep}
                            onBookingReady={(booking, preparation) => {
                                return preparePaidNewBooking(booking, null, { ...preparation, paymentApproved: true });
                            }}
                        />
                    )}

                    {state === 'APP_BOOKING' && ctx.booking && (
                        <BookingSummary
                            key="booking"
                            booking={ctx.booking}
                            isStartingSession={isStartingSession}
                            sessionStartError={sessionStartError}
                            onContinue={startExistingBookingCheckIn}
                        />
                    )}

                    {state === 'APP_SAFETY_VIDEO' && (
                        <SafetyVideo
                            key="safety-video"
                            buyEntryFlow={ctx.buyEntryFlow}
                            onComplete={seenAt => advance({ safetyVideoSeenAt: seenAt })}
                        />
                    )}

                    {state === 'APP_SAFETY_ATTEST' && (
                        <SafetyAttest
                            key="safety-attest"
                            buyEntryFlow={ctx.buyEntryFlow}
                            isSubmitting={isMarkingReadyForStaff}
                            submitError={readyForStaffError}
                            statusNotice={
                                paidConfirmationState === 'checking' || paidConfirmationState === 'waiting'
                                    ? t.safetyAttest.paymentConfirmationWaiting
                                    : paidConfirmationState === 'delayed'
                                        ? t.safetyAttest.paymentConfirmationDelayed
                                        : null
                            }
                            statusState={paidConfirmationState}
                            retryAction={
                                paidConfirmationState === 'delayed'
                                    ? {
                                        label: t.safetyAttest.paymentConfirmationRetry,
                                        onClick: retryApprovedPurchaseConfirmation,
                                    }
                                    : null
                            }
                            onComplete={completeSafetyAndReadyForStaff}
                        />
                    )}

                    {state === 'APP_ADDONS' && ctx.booking && (
                        <AddonsOffer
                            backRequest={addonsBackRequest}
                            key="addons"
                            booking={ctx.booking}
                            guestCount={ctx.booking.jumpers}
                            existingAddons={ctx.existingAddons}
                            prefetchedAvailability={matchingAddonsPrefetch}
                            onStepChange={setAddonsStep}
                            onBackRuleChange={setAddonsBackRule}
                            onPaymentApproved={preparePaidAddonsForSafety}
                            onContinue={(result) => advance(getAddonsFlowPatch(result))}
                            onPendingDone={() => {
                                setAlreadyCheckedIn(false);
                                setCtx({ ...initialContext(effectiveChannel), token: null });
                                setState('KIOSK_CHOICE');
                                scrollToTop();
                            }}
                        />
                    )}

                    {state === 'APP_SKYRIDER_ATTEST' && (
                        <SkyRiderAttest
                            key="skyrider"
                            onComplete={() => advance({ skyriderHeightConfirmed: true })}
                        />
                    )}

                    {state === 'APP_CONNECTED' && (
                        <ConnectedProfiles
                            key="connected"
                            count={ctx.selectedAddons.find(a => a.id === 'connected')?.qty ?? 1}
                            onContinue={(profiles: ConnectedProfile[]) => advance({ connectedProfiles: profiles })}
                        />
                    )}

                    {state === 'APP_PAYMENT' && ctx.booking && (
                        <PaymentView
                            key="payment"
                            bookingId={ctx.booking.id}
                            total={ctx.paymentTotal}
                            items={ctx.selectedAddons}
                            baseProduct={ctx.baseTotal > 0 ? {
                                label: ctx.baseProductLabel!,
                                quantity: ctx.baseQuantity,
                                unitPrice: ctx.baseUnitPrice,
                                total: ctx.baseTotal,
                            } : null}
                            onPaid={() => advance({ paymentCompleted: true })}
                        />
                    )}

                    {(state === 'APP_CONFIRM' || state === 'APP_PRESENT') && ctx.booking && (
                        <ConfirmationScreen
                            key="confirm"
                            booking={ctx.booking}
                            checkinSession={ctx.checkinSession}
                            jumperCount={ctx.booking.jumpers}
                            selectedAddons={ctx.selectedAddons}
                            channel={ctx.channel}
                            alreadyCheckedIn={alreadyCheckedIn}
                            onStartOver={ctx.channel === 'park-qr' ? resetToStart : undefined}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function getResumeState(session: CheckInSession): FlowState | null {
    if (isCompletedSession(session)) return 'APP_PRESENT';
    if (isReadyForStaffSession(session)) return 'APP_CONFIRM';
    if (session.guestResumeStep === 'safety') return 'APP_SAFETY_VIDEO';
    return null;
}

function isReadyForStaffSession(session: CheckInSession) {
    const status = `${session.status ?? ''}`.toLowerCase();
    const handoffStatus = `${session.handoffStatus ?? ''}`.toLowerCase();

    return status === 'ready_for_staff' || handoffStatus === 'ready_for_staff';
}

function isCompletedSession(session: CheckInSession) {
    const status = `${session.status ?? ''}`.toLowerCase();
    const handoffStatus = `${session.handoffStatus ?? ''}`.toLowerCase();

    return status === 'redeemed' || status === 'completed' || handoffStatus === 'completed';
}

export default function Home() {
    return (
        <LanguageProvider>
            <main className="phone-flow-shell flex min-h-dvh w-full max-w-full min-w-0 flex-col items-center justify-start overflow-x-hidden p-3 pt-3 relative text-foreground bg-background selection:bg-primary selection:text-white">
                <Suspense
                    fallback={
                        <div className="text-foreground z-10 flex flex-col justify-center items-center h-full w-full">
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    }
                >
                    <CheckInFlow />
                </Suspense>
            </main>
        </LanguageProvider>
    );
}
