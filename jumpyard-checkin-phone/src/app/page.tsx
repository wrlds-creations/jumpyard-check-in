'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { BookingSummary } from '@/components/BookingSummary';
import { SafetyVideo } from '@/components/SafetyVideo';
import { SafetyAttest } from '@/components/SafetyAttest';
import { AddonsOffer } from '@/components/AddonsOffer';
import { SkyRiderAttest } from '@/components/SkyRiderAttest';
import { ConnectedProfiles } from '@/components/ConnectedProfiles';
import { PaymentView } from '@/components/PaymentView';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';
import { detectChannel, initialContext, initialState, nextState } from '@/flow/machine';
import type { Branch } from '@/flow/machine';
import { CloudSessionError, markSessionReadyForStaff, resolveCheckInSessionLink, startCheckInSession, type SessionIssue } from '@/flow/cloudClient';
import type { Booking, CheckInSession, ConnectedProfile, FlowContext, FlowState } from '@/flow/types';
import { ParkChoice } from '@/components/ParkChoice';
import { BookingLookup } from '@/components/BookingLookup';
import { BuyTickets } from '@/components/BuyTickets';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';

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

function getStepIndex(state: FlowState): number {
    if (state === 'APP_SAFETY_ATTEST') return STEP_ORDER.indexOf('APP_SAFETY_VIDEO');
    if (state === 'APP_SKYRIDER_ATTEST' || state === 'APP_CONNECTED')
        return STEP_ORDER.indexOf('APP_ADDONS');
    if (state === 'APP_PRESENT') return STEP_ORDER.indexOf('APP_CONFIRM');
    const idx = STEP_ORDER.indexOf(state);
    return idx === -1 ? 0 : idx;
}

function prePaymentBack(ctx: FlowContext): FlowState {
    if (ctx.connectedSelected) return 'APP_CONNECTED';
    if (ctx.skyriderSelected) return 'APP_SKYRIDER_ATTEST';
    return 'APP_ADDONS';
}

function getBackState(state: FlowState, ctx: FlowContext): FlowState | null {
    switch (state) {
        case 'KIOSK_LOOKUP': return 'KIOSK_CHOICE';
        case 'KIOSK_BUY': return null; // BuyTickets handles its own internal back
        case 'APP_BOOKING': return ctx.channel === 'park-qr' ? 'KIOSK_CHOICE' : null;
        case 'APP_ADDONS': return 'APP_BOOKING';
        case 'APP_SKYRIDER_ATTEST': return 'APP_ADDONS';
        case 'APP_CONNECTED': return ctx.skyriderSelected ? 'APP_SKYRIDER_ATTEST' : 'APP_ADDONS';
        case 'APP_PAYMENT': return prePaymentBack(ctx);
        case 'APP_SAFETY_VIDEO': return ctx.paymentTotal > 0 ? 'APP_PAYMENT' : prePaymentBack(ctx);
        case 'APP_SAFETY_ATTEST': return 'APP_SAFETY_VIDEO';
        default: return null;
    }
}

function ProgressBar({ state }: { state: FlowState }) {
    const { t } = useTranslation();
    if (state === 'APP_MOBILE' || state === 'KIOSK_CHOICE' || state === 'KIOSK_LOOKUP' || state === 'KIOSK_BUY') return null;

    const labels = [t.progress.booking, t.progress.extras, t.progress.payment, t.progress.safety, t.progress.done];
    const current = getStepIndex(state);
    const pct = labels.length > 1 ? (current / (labels.length - 1)) * 100 : 0;

    return (
        <div className="w-full max-w-md mx-auto mb-3 px-4">
            {/* Track + circles */}
            <div className="relative flex items-center justify-between" style={{ height: 32 }}>
                {/* Grey baseline — spans between first and last circle centers */}
                <div className="absolute top-1/2 left-[16px] right-[16px] h-0.5 -translate-y-1/2 bg-surface-strong" />
                {/* Active overlay */}
                <div
                    className="absolute top-1/2 left-[16px] h-0.5 -translate-y-1/2 bg-primary transition-all duration-500"
                    style={{ width: `calc(${pct}% - ${pct > 0 ? 32 * pct / 100 : 0}px)` }}
                />
                {/* Circles */}
                {labels.map((_, i) => (
                    <div
                        key={i}
                        className={`relative z-10 w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${
                            i < current
                                ? 'bg-white border-primary shadow-sm'
                                : i === current
                                ? 'bg-white border-primary shadow-sm ring-4 ring-primary/15'
                                : 'bg-surface border-border opacity-45'
                        }`}
                    >
                        <JumpyardIcon name={STEP_ICONS[i]} className="w-6 h-6" />
                    </div>
                ))}
            </div>
            {/* Labels row — separate so they don't affect circle/line alignment */}
            <div className="flex justify-between mt-1">
                {labels.map((label, i) => (
                    <span
                        key={i}
                        className={`text-[9px] font-bold italic uppercase tracking-wider text-center transition-colors ${
                            i <= current ? 'text-foreground' : 'text-muted'
                        }`}
                        style={{ width: 28 }}
                    >
                        {label}
                    </span>
                ))}
            </div>
        </div>
    );
}

function CheckInFlow() {
    const searchParams = useSearchParams();
    const linkToken = searchParams.get('jy_token') ?? searchParams.get('token');
    const token = linkToken ?? searchParams.get('bookingRef');
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
    const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);

    const scrollToTop = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    };

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

    const handleExistingBookingFound = async (booking: Booking) => {
        const bookingPatch = { booking, checkinSession: null, existingAddons: booking.existingAddons ?? [] };

        setAlreadyCheckedIn(false);
        setSessionStartError(null);

        if (!booking.paid) {
            advance(bookingPatch);
            return;
        }

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

    const startExistingBookingCheckIn = async () => {
        if (!ctx.booking || isStartingSession) return;

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

    const completeSafetyAndReadyForStaff = async (attestedAt: string) => {
        if (isMarkingReadyForStaff) return;
        if (!ctx.checkinSession) {
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
                routeFromSessionResume(
                    checkinSession,
                    { booking, checkinSession, existingAddons: booking.existingAddons ?? [] },
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

    return (
        <div
            className="z-10 w-full max-w-lg flex flex-col items-center"
            data-flow-state={state}
            data-checkin-session-id={ctx.checkinSession?.checkinSessionId ?? ''}
            data-checkin-session-status={ctx.checkinSession?.status ?? ''}
            data-handoff-status={ctx.checkinSession?.handoffStatus ?? ''}
            data-handoff-code={ctx.checkinSession?.handoffCode ?? ''}
            data-already-checked-in={String(alreadyCheckedIn)}
        >
            <ProgressBar state={state} />

            <div className="w-full max-w-md px-4 h-8 flex items-center">
                {getBackState(state, ctx) && (
                    <button
                        onClick={() => { setState(getBackState(state, ctx)!); scrollToTop(); }}
                        className="flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
                    >
                        <ArrowLeft size={14} /> {t.common.back}
                    </button>
                )}
            </div>

            <div className="w-full flex items-center justify-center relative">
                <AnimatePresence mode="wait">
                    {state === 'APP_MOBILE' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            key="mobile"
                            className="flex flex-col items-center justify-center text-foreground w-full"
                            style={{ minHeight: 'calc(100dvh - 60px)' }}
                        >
                            <img src="/jumpyard_logo.png" alt="JumpYard" className="w-40 mb-6" />
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-muted text-sm">
                                {t.common.loading}
                            </p>
                        </motion.div>
                    )}

                    {state === 'KIOSK_CHOICE' && (
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
                            onBack={() => { setState('KIOSK_CHOICE'); scrollToTop(); }}
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
                            onComplete={seenAt => advance({ safetyVideoSeenAt: seenAt })}
                        />
                    )}

                    {state === 'APP_SAFETY_ATTEST' && (
                        <SafetyAttest
                            key="safety-attest"
                            isSubmitting={isMarkingReadyForStaff}
                            submitError={readyForStaffError}
                            onComplete={completeSafetyAndReadyForStaff}
                        />
                    )}

                    {state === 'APP_ADDONS' && ctx.booking && (
                        <AddonsOffer
                            key="addons"
                            booking={ctx.booking}
                            guestCount={ctx.booking.jumpers}
                            existingAddons={ctx.existingAddons}
                            onContinue={({ selectedAddons, addonsTotal, skyriderSelected, connectedSelected }) =>
                                advance({
                                    selectedAddons,
                                    addonsTotal,
                                    skyriderSelected,
                                    connectedSelected,
                                    paymentTotal: (ctx.baseTotal || 0) + addonsTotal,
                                })
                            }
                            onPendingDone={() => {
                                setAlreadyCheckedIn(false);
                                setCtx({ ...initialContext(effectiveChannel), token });
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
                            alreadyCheckedIn={alreadyCheckedIn}
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
            <main className="flex min-h-screen flex-col items-center justify-start pt-3 p-3 overflow-hidden relative text-foreground bg-background selection:bg-primary selection:text-white">
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
