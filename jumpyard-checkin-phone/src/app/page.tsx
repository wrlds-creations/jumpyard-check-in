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
    isPrePaymentBuyFlowRecovery,
    readBuyFlowRecovery,
    startBuyFlowRecoveryCleanup,
    writeBuyFlowRecovery,
    type BuyFlowRecoverySnapshot,
} from '@/flow/buyFlowRecovery';
import { ParkChoice } from '@/components/ParkChoice';
import { BookingLookup } from '@/components/BookingLookup';
import { BuyTickets, type BuyTicketsStep } from '@/components/BuyTickets';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { ExitFlowDialog } from '@/components/ExitFlowDialog';
import { getExitFlowMode, hasReachedSafety } from '@/flow/exitFlowPolicy';
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
        case 'APP_SAFETY_VIDEO': return ctx.paymentTotal > 0 ? 'APP_PAYMENT' : prePaymentBack(ctx);
        case 'APP_SAFETY_ATTEST': return 'APP_SAFETY_VIDEO';
        default: return null;
    }
}

type BuyRecoveryStatus = 'checking' | 'failed' | 'unsafe';
const VENUE_TIME_ZONE = 'Europe/Stockholm';

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

function writeSafetyRecovery(state: FlowState, ctx: FlowContext) {
    if (!isBuyEntryRecoveryState(state) || !ctx.buyEntryFlow || !ctx.booking) return;

    writeBuyFlowRecovery({
        bookingReference: ctx.booking.id,
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
}: {
    status: BuyRecoveryStatus;
    onRestart: () => void;
    onRetry: () => void;
}) {
    const { t } = useTranslation();
    const checking = status === 'checking';
    const unsafe = status === 'unsafe';

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
                            aria-label={t.common.loading}
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
                            {t.buyRecovery.failedTitle}
                        </h2>
                        <p className="mt-2 text-sm text-muted">
                            {unsafe ? t.buyRecovery.unsafeDescription : t.buyRecovery.failedDescription}
                        </p>
                        <div className="mt-4 flex flex-col gap-2">
                            {!unsafe && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                >
                                    <RefreshCw size={16} /> {t.buyRecovery.retry}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onRestart}
                                className="w-full bg-white hover:bg-surface border border-border text-foreground font-black italic uppercase text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                <RotateCcw size={16} /> {t.buyRecovery.startOver}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
}

function ProgressBar({ state, buyEntryFlow }: { state: FlowState; buyEntryFlow: boolean }) {
    const { t } = useTranslation();
    if (state === 'APP_MOBILE' || state === 'KIOSK_CHOICE' || state === 'KIOSK_LOOKUP' || state === 'KIOSK_BUY') return null;

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
    const { t } = useTranslation();

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
    const [buyStep, setBuyStep] = useState<BuyTicketsStep>('TIMESLOT');
    const [exitDialogOpen, setExitDialogOpen] = useState(false);
    const [safetyExitLocked, setSafetyExitLocked] = useState(false);
    const [buyRecoverySnapshot, setBuyRecoverySnapshot] = useState<BuyFlowRecoverySnapshot | null>(null);
    const [buyRecoveryStatus, setBuyRecoveryStatus] = useState<BuyRecoveryStatus | null>(null);
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
        { paymentApproved = false }: { paymentApproved?: boolean } = {}
    ): Promise<() => void> => {
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
            setBuyRecoveryStatus(null);
            return () => {
                setState(targetState);
                scrollToTop();
            };
        };

        if (!booking.paid) {
            if (paymentApproved) return continueIntoSafetyAwaitingConfirmation();

            setCtx({ ...ctx, ...bookingPatch });
            return () => {
                setState('APP_BOOKING');
                scrollToTop();
            };
        }

        try {
            const checkinSession = await startCheckInSession(booking, 'safety');
            const resumeState = getResumeState(checkinSession);
            const nextCtx = { ...ctx, ...bookingPatch, checkinSession };

            setAlreadyCheckedIn(isCompletedSession(checkinSession));
            setCtx(nextCtx);
            setBuyRecoveryStatus(null);
            return () => {
                setState(resumeState ?? targetState);
                scrollToTop();
            };
        } catch (error) {
            if (error instanceof CloudSessionError && error.reason === 'already_redeemed') {
                setAlreadyCheckedIn(true);
                setCtx({ ...ctx, ...bookingPatch, checkinSession: null });
                return () => {
                    setState('APP_PRESENT');
                    scrollToTop();
                };
            }

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

    const handlePaidNewBookingReady = async (
        booking: Booking,
        recoveryTargetState: FlowState | null = null,
        paymentApproved = false
    ) => {
        const continueToPreparedState = await preparePaidNewBooking(booking, recoveryTargetState, { paymentApproved });
        continueToPreparedState();
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

    const resumeBuyFlowRecovery = async (snapshot: BuyFlowRecoverySnapshot | null = buyRecoverySnapshot) => {
        if (!snapshot) return;

        const identifier = getBuyFlowRecoveryIdentifier(snapshot);
        if (!identifier) {
            setBuyRecoveryStatus('unsafe');
            scrollToTop();
            return;
        }

        setBuyRecoveryStatus('checking');
        setSessionStartError(null);
        try {
            const booking = await lookupBooking(identifier);
            await handlePaidNewBookingReady(
                booking,
                getBuyFlowRecoveryTargetState(snapshot),
                snapshot.draftState?.paymentApproved === true
            );
        } catch {
            setBuyRecoveryStatus('failed');
            scrollToTop();
        }
    };

    const resetToStart = () => {
        clearBuyFlowRecovery();
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
                routeAlreadyCheckedIn();
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
        if (state !== 'KIOSK_CHOICE' || linkToken || buyRecoveryStatus !== null) return;
        const snapshot = readBuyFlowRecovery();
        if (!snapshot) return;

        setBuyRecoverySnapshot(snapshot);
        if (isPrePaymentBuyFlowRecovery(snapshot)) {
            setBuyRecoveryStatus(null);
            setState('KIOSK_BUY');
            scrollToTop();
            return;
        }

        void resumeBuyFlowRecovery(snapshot);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, linkToken, buyRecoveryStatus]);

    useEffect(() => {
        writeSafetyRecovery(state, ctx);
    }, [ctx, state]);

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
        if (state !== 'APP_ADDONS') setAddonsStep('SELECT');
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
        if (state !== 'APP_MOBILE') return;
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
    }, [state]);

    const backState = getBackState(state, ctx);
    const addonsHandlesBack = state === 'APP_ADDONS' && addonsStep !== 'SELECT' && addonsStep !== 'APPROVED';
    const matchingAddonsPrefetch = getMatchingAddonsPrefetch(ctx.booking);
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
            <ProgressBar state={state} buyEntryFlow={ctx.buyEntryFlow} />

            <div className={`w-full max-w-md min-w-0 px-4 h-8 items-center justify-between ${state === 'KIOSK_BUY' ? 'hidden' : 'flex'}`}>
                {(backState || addonsHandlesBack) && (
                    <button
                        onClick={() => {
                            if (addonsHandlesBack) {
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

                    {state === 'KIOSK_CHOICE' && buyRecoveryStatus && (
                        <BuyRecoveryCard
                            key="buy-recovery"
                            status={buyRecoveryStatus}
                            onRetry={() => void resumeBuyFlowRecovery()}
                            onRestart={restartAfterBuyRecovery}
                        />
                    )}

                    {state === 'KIOSK_CHOICE' && !buyRecoveryStatus && (
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
                            onBookingReady={booking => {
                                return preparePaidNewBooking(booking, null, { paymentApproved: true });
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
