'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { IdleScreen } from '@/components/IdleScreen';
import { StartScreen } from '@/components/StartScreen';
import { StepSelection } from '@/components/StepSelection';
import { BookingCheck } from '@/components/BookingCheck';
import { BuyTickets } from '@/components/BuyTickets';
import { BookingSummary } from '@/components/BookingSummary';
import { SafetyVideo } from '@/components/SafetyVideo';
import { SafetyAttest } from '@/components/SafetyAttest';
import { AddonsOffer } from '@/components/AddonsOffer';
import { SkyRiderAttest } from '@/components/SkyRiderAttest';
import { ConnectedProfiles } from '@/components/ConnectedProfiles';
import { PaymentView } from '@/components/PaymentView';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { SuccessPrint } from '@/components/SuccessPrint';
import { PresentCode } from '@/components/PresentCode';
import { detectChannel, initialContext, initialState, nextState } from '@/flow/machine';
import type { Booking, ConnectedProfile, FlowContext, FlowState } from '@/flow/types';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';

function LanguageToggle() {
    const { lang, toggleLang } = useTranslation();
    return (
        <button
            onClick={toggleLang}
            className="absolute top-4 right-4 z-30 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-700 text-white font-bold italic uppercase text-[10px] tracking-widest hover:border-primary transition-colors"
        >
            {lang === 'sv' ? 'EN' : 'SV'}
        </button>
    );
}

function CheckInFlow() {
    const searchParams = useSearchParams();
    const channel = detectChannel(new URLSearchParams(searchParams.toString()));

    const [state, setState] = useState<FlowState>(() => initialState(channel));
    const [ctx, setCtx] = useState<FlowContext>(() => initialContext(channel));

    const advance = (patch: Partial<FlowContext> = {}, branch: 'booking' | 'buy' | null = null) => {
        const newCtx = { ...ctx, ...patch };
        setCtx(newCtx);
        setState(nextState(state, newCtx, branch));
    };

    const reset = () => {
        setCtx(initialContext(channel));
        setState(initialState(channel));
    };

    const setBookingAndAdvance = (booking: Booking) =>
        advance({ booking, existingAddons: booking.existingAddons ?? [] });

    return (
        <div className="z-10 w-full max-w-7xl flex items-center justify-center relative">
            {(state === 'IDLE' || state === 'APP_START') && <LanguageToggle />}
            <AnimatePresence mode="wait">
                {state === 'IDLE' && (
                    <IdleScreen key="idle" onStart={() => setState('APP_START')} />
                )}

                {state === 'APP_START' && (
                    <StartScreen key="start" channel={ctx.channel} onContinue={() => advance()} />
                )}

                {state === 'KIOSK_ENTRY' && (
                    <StepSelection
                        key="kiosk-entry"
                        onSelect={choice => advance({}, choice === 'BOOKING' ? 'booking' : 'buy')}
                    />
                )}

                {state === 'KIOSK_CHOICE' && (
                    <StepSelection
                        key="choice"
                        onSelect={choice => advance({}, choice === 'BOOKING' ? 'booking' : 'buy')}
                    />
                )}

                {state === 'KIOSK_LOOKUP' && (
                    <BookingCheck
                        key="lookup"
                        onSuccess={setBookingAndAdvance}
                        onBack={() => setState('KIOSK_CHOICE')}
                    />
                )}

                {state === 'KIOSK_BUY' && (
                    <BuyTickets
                        key="buy"
                        onComplete={(booking, contact) =>
                            advance({
                                booking,
                                existingAddons: booking.existingAddons ?? [],
                                guestContactEmail: contact.email,
                                guestContactPhone: contact.phone,
                            })
                        }
                        onBack={() => setState('KIOSK_CHOICE')}
                    />
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
                        socksCount={0}
                        players={ctx.connectedProfiles.map(p => ({ id: p.id, name: p.name, photo: null }))}
                        isMobile={false}
                        onReset={() => advance()}
                    />
                )}

                {state === 'KIOSK_PRINT' && (
                    <SuccessPrint key="print" onReset={() => advance()} />
                )}

                {state === 'APP_PRESENT' && ctx.booking && (
                    <PresentCode key="present" bookingId={ctx.booking.id} onDone={reset} />
                )}
            </AnimatePresence>
        </div>
    );
}

export default function Home() {
    return (
        <LanguageProvider>
            <main className="flex min-h-screen flex-col items-center justify-center p-4 overflow-hidden relative text-white bg-black selection:bg-primary selection:text-white">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black z-0" />
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:50px_50px] pointer-events-none" />

                <Suspense
                    fallback={
                        <div className="text-white z-10 flex flex-col justify-center items-center h-full">
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    }
                >
                    <CheckInFlow />
                </Suspense>

                <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none z-20">
                    <p className="text-zinc-800 font-bold uppercase tracking-[0.5em] text-xs">JumpYard Check-In Kiosk</p>
                </div>
            </main>
        </LanguageProvider>
    );
}
