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
import { initialContext, initialState, nextState } from '@/flow/machine';
import { validateToken } from '@/flow/mockClient';
import type { ConnectedProfile, FlowContext, FlowState } from '@/flow/types';

// Visual progress bar groups safety-video + safety-attest into one step,
// and collapses connected/skyrider into the extras column.
const STEP_ORDER: FlowState[] = [
    'APP_BOOKING',
    'APP_SAFETY_VIDEO',
    'APP_ADDONS',
    'APP_PAYMENT',
    'APP_CONFIRM',
    'APP_PRESENT',
];

function getStepIndex(state: FlowState): number {
    if (state === 'APP_SAFETY_ATTEST') return STEP_ORDER.indexOf('APP_SAFETY_VIDEO');
    if (state === 'APP_SKYRIDER_ATTEST' || state === 'APP_CONNECTED')
        return STEP_ORDER.indexOf('APP_ADDONS');
    if (state === 'APP_PRESENT') return STEP_ORDER.indexOf('APP_CONFIRM') + 1;
    const idx = STEP_ORDER.indexOf(state);
    return idx === -1 ? 0 : idx;
}

function getBackState(state: FlowState, ctx: FlowContext): FlowState | null {
    switch (state) {
        case 'APP_SAFETY_VIDEO': return 'APP_BOOKING';
        case 'APP_SAFETY_ATTEST': return 'APP_SAFETY_VIDEO';
        case 'APP_ADDONS': return 'APP_SAFETY_ATTEST';
        case 'APP_SKYRIDER_ATTEST': return 'APP_ADDONS';
        case 'APP_CONNECTED': return ctx.skyriderSelected ? 'APP_SKYRIDER_ATTEST' : 'APP_ADDONS';
        case 'APP_PAYMENT': return ctx.connectedSelected ? 'APP_CONNECTED' : ctx.skyriderSelected ? 'APP_SKYRIDER_ATTEST' : 'APP_ADDONS';
        default: return null;
    }
}

function ProgressBar({ state }: { state: FlowState }) {
    const { t } = useTranslation();
    if (state === 'APP_MOBILE') return null;

    const labels = [t.progress.booking, t.progress.safety, t.progress.extras, t.progress.payment, t.progress.done];
    const current = getStepIndex(state);
    const pct = labels.length > 1 ? (current / (labels.length - 1)) * 100 : 0;

    return (
        <div className="w-full max-w-md mx-auto mb-3 px-4">
            {/* Track + circles */}
            <div className="relative flex items-center justify-between" style={{ height: 28 }}>
                {/* Grey baseline — spans between first and last circle centers */}
                <div className="absolute top-1/2 left-[14px] right-[14px] h-0.5 -translate-y-1/2 bg-surface-strong" />
                {/* Active overlay */}
                <div
                    className="absolute top-1/2 left-[14px] h-0.5 -translate-y-1/2 bg-primary transition-all duration-500"
                    style={{ width: `calc(${pct}% - ${pct > 0 ? 28 * pct / 100 : 0}px)` }}
                />
                {/* Circles */}
                {labels.map((_, i) => (
                    <div
                        key={i}
                        className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black italic transition-all duration-300 ${
                            i < current
                                ? 'bg-primary text-white'
                                : i === current
                                ? 'bg-primary text-white ring-4 ring-primary/20'
                                : 'bg-surface-strong text-muted'
                        }`}
                    >
                        {i < current ? '✓' : i + 1}
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
    const token = searchParams.get('token') ?? searchParams.get('bookingRef');
    const { t } = useTranslation();

    const [state, setState] = useState<FlowState>(() => initialState('sms'));
    const [ctx, setCtx] = useState<FlowContext>(() => ({ ...initialContext('sms'), token }));

    const scrollToTop = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    };

    const advance = (patch: Partial<FlowContext> = {}) => {
        const newCtx = { ...ctx, ...patch };
        setCtx(newCtx);
        setState(nextState(state, newCtx, null));
        scrollToTop();
    };

    useEffect(() => {
        scrollToTop();
    }, [state]);

    useEffect(() => {
        if (state !== 'APP_MOBILE') return;
        let alive = true;
        validateToken(token ?? 'MOCK123').then(booking => {
            if (!alive) return;
            advance({ booking, existingAddons: booking.existingAddons ?? [] });
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    return (
        <div className="z-10 w-full max-w-lg flex flex-col items-center">
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
                            <img src="/logo.png" alt="JumpYard" className="w-40 mb-6" />
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-muted text-sm">
                                {t.common.loading}
                            </p>
                        </motion.div>
                    )}

                    {state === 'APP_BOOKING' && ctx.booking && (
                        <BookingSummary key="booking" booking={ctx.booking} onContinue={() => advance()} />
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
                            onComplete={attestedAt => advance({ safetyAttestedAt: attestedAt })}
                        />
                    )}

                    {state === 'APP_ADDONS' && ctx.booking && (
                        <AddonsOffer
                            key="addons"
                            guestCount={ctx.booking.jumpers}
                            existingAddons={ctx.existingAddons}
                            onContinue={({ selectedAddons, addonsTotal, skyriderSelected, connectedSelected }) =>
                                advance({
                                    selectedAddons,
                                    addonsTotal,
                                    skyriderSelected,
                                    connectedSelected,
                                    paymentTotal: addonsTotal,
                                })
                            }
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
                            onPaid={() => advance({ paymentCompleted: true })}
                        />
                    )}

                    {(state === 'APP_CONFIRM' || state === 'APP_PRESENT') && ctx.booking && (
                        <ConfirmationScreen
                            key="confirm"
                            booking={ctx.booking}
                            jumperCount={ctx.booking.jumpers}
                            selectedAddons={ctx.selectedAddons}
                            onDone={() => window.location.reload()}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
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
