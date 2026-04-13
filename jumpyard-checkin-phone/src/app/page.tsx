'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { BookingSummary } from '@/components/BookingSummary';
import { SafetyVideo } from '@/components/SafetyVideo';
import { SafetyAttest } from '@/components/SafetyAttest';
import { AddonsOffer } from '@/components/AddonsOffer';
import { SkyRiderAttest } from '@/components/SkyRiderAttest';
import { ConnectedProfiles } from '@/components/ConnectedProfiles';
import { PaymentView } from '@/components/PaymentView';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { PresentCode } from '@/components/PresentCode';
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

function ProgressBar({ state }: { state: FlowState }) {
    const { t } = useTranslation();
    if (state === 'APP_MOBILE') return null;

    const labels = [t.progress.booking, t.progress.safety, t.progress.extras, t.progress.payment, t.progress.done];
    const current = getStepIndex(state);

    return (
        <div className="w-full max-w-lg mb-2 px-2">
            <div className="flex gap-1 items-center">
                {labels.map((label, i) => (
                    <div key={i} className="flex items-center flex-1">
                        <div className="flex flex-col items-center flex-1">
                            <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black italic transition-all duration-300 ${
                                    i < current
                                        ? 'bg-primary text-white'
                                        : i === current
                                        ? 'bg-primary text-white scale-110'
                                        : 'bg-surface-strong text-muted'
                                }`}
                            >
                                {i < current ? '✓' : i + 1}
                            </div>
                            <span
                                className={`text-[10px] font-bold italic uppercase tracking-wide mt-1 transition-colors ${
                                    i <= current ? 'text-foreground' : 'text-muted'
                                }`}
                            >
                                {label}
                            </span>
                        </div>
                        {i < labels.length - 1 && (
                            <div
                                className={`h-0.5 flex-1 mx-1 mb-4 transition-all duration-500 ${
                                    i < current ? 'bg-primary' : 'bg-surface-strong'
                                }`}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function CheckInFlow() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') ?? searchParams.get('bookingRef');
    const { t, lang, toggleLang } = useTranslation();

    const [state, setState] = useState<FlowState>(() => initialState('sms'));
    const [ctx, setCtx] = useState<FlowContext>(() => ({ ...initialContext('sms'), token }));

    const advance = (patch: Partial<FlowContext> = {}) => {
        const newCtx = { ...ctx, ...patch };
        setCtx(newCtx);
        setState(nextState(state, newCtx, null));
    };

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

            <div className="w-full flex items-center justify-center relative">
                <AnimatePresence mode="wait">
                    {state === 'APP_MOBILE' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            key="mobile"
                            className="flex flex-col items-center justify-center text-foreground relative w-full h-full"
                        >
                            <button
                                onClick={toggleLang}
                                className="absolute top-0 right-0 px-2.5 py-1 rounded-full bg-surface border border-border text-foreground font-bold italic uppercase text-[10px] tracking-widest hover:border-primary transition-colors cursor-pointer"
                            >
                                {lang === 'sv' ? 'EN' : 'SV'}
                            </button>
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-xl font-bold uppercase italic tracking-widest">{t.common.loading}</p>
                            <p className="text-muted mt-2">
                                {t.lookup.scanning} {token ?? 'MOCK123'}
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
                            onBack={() => setState('APP_BOOKING')}
                        />
                    )}

                    {state === 'APP_SAFETY_ATTEST' && (
                        <SafetyAttest
                            key="safety-attest"
                            onComplete={attestedAt => advance({ safetyAttestedAt: attestedAt })}
                            onBack={() => setState('APP_SAFETY_VIDEO')}
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
                            onBack={() => setState('APP_SAFETY_ATTEST')}
                        />
                    )}

                    {state === 'APP_SKYRIDER_ATTEST' && (
                        <SkyRiderAttest
                            key="skyrider"
                            onComplete={() => advance({ skyriderHeightConfirmed: true })}
                            onBack={() => setState('APP_ADDONS')}
                        />
                    )}

                    {state === 'APP_CONNECTED' && (
                        <ConnectedProfiles
                            key="connected"
                            count={ctx.selectedAddons.find(a => a.id === 'connected')?.qty ?? 1}
                            onContinue={(profiles: ConnectedProfile[]) => advance({ connectedProfiles: profiles })}
                            onBack={() => setState(ctx.skyriderSelected ? 'APP_SKYRIDER_ATTEST' : 'APP_ADDONS')}
                        />
                    )}

                    {state === 'APP_PAYMENT' && ctx.booking && (
                        <PaymentView
                            key="payment"
                            bookingId={ctx.booking.id}
                            total={ctx.paymentTotal}
                            onPaid={() => advance({ paymentCompleted: true })}
                            onBack={() =>
                                setState(
                                    ctx.connectedSelected
                                        ? 'APP_CONNECTED'
                                        : ctx.skyriderSelected
                                        ? 'APP_SKYRIDER_ATTEST'
                                        : 'APP_ADDONS'
                                )
                            }
                        />
                    )}

                    {state === 'APP_CONFIRM' && ctx.booking && (
                        <ConfirmationScreen
                            key="confirm"
                            booking={ctx.booking}
                            upsellCount={ctx.connectedProfiles.length}
                            socksCount={ctx.selectedAddons.find(a => a.id === 'socks')?.qty ?? 0}
                            players={ctx.connectedProfiles.map(p => ({
                                id: p.id,
                                name: p.name,
                                photo: null,
                            }))}
                            isMobile={true}
                            onReset={() => advance()}
                        />
                    )}

                    {state === 'APP_PRESENT' && ctx.booking && (
                        <PresentCode
                            key="present"
                            bookingId={ctx.booking.id}
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
