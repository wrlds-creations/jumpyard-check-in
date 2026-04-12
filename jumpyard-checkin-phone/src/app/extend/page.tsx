'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { ExtendView } from '@/components/ExtendView';
import { ExtendPay } from '@/components/ExtendPay';
import { ExtendQR } from '@/components/ExtendQR';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';
import { validateExtensionToken, type ExtensionInfo } from '@/flow/mockClient';

type ExtState = 'LOADING' | 'VIEW' | 'PAY' | 'QR';

function LanguageToggle() {
    const { lang, toggleLang } = useTranslation();
    return (
        <button
            onClick={toggleLang}
            className="absolute top-4 right-4 z-30 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700 text-white font-bold uppercase text-xs tracking-widest hover:border-primary"
        >
            {lang === 'sv' ? 'EN' : 'SV'}
        </button>
    );
}

function ExtensionFlow() {
    const { t } = useTranslation();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') ?? 'EXT123';

    const [state, setState] = useState<ExtState>('LOADING');
    const [info, setInfo] = useState<ExtensionInfo | null>(null);
    const [qrToken, setQrToken] = useState<string>('');

    useEffect(() => {
        let alive = true;
        validateExtensionToken(token).then(result => {
            if (!alive) return;
            setInfo(result);
            setState('VIEW');
        });
        return () => {
            alive = false;
        };
    }, [token]);

    return (
        <div className="z-10 w-full max-w-lg flex flex-col items-center">
            <div className="w-full min-h-[70vh] flex items-center justify-center relative">
                <AnimatePresence mode="wait">
                    {state === 'LOADING' && (
                        <div key="loading" className="flex flex-col items-center justify-center text-white">
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-xl font-bold uppercase italic tracking-widest">{t.extend.loading}</p>
                        </div>
                    )}

                    {state === 'VIEW' && info && (
                        <ExtendView
                            key="view"
                            currentEnd={info.currentEnd}
                            newEnd={info.newEnd}
                            price={info.price}
                            onContinue={() => setState('PAY')}
                        />
                    )}

                    {state === 'PAY' && info && (
                        <ExtendPay
                            key="pay"
                            bookingId={info.bookingId}
                            amount={info.price}
                            onPaid={token => {
                                setQrToken(token);
                                setState('QR');
                            }}
                            onBack={() => setState('VIEW')}
                        />
                    )}

                    {state === 'QR' && info && (
                        <ExtendQR key="qr" qrToken={qrToken} newEnd={info.newEnd} />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default function ExtendPage() {
    return (
        <LanguageProvider>
            <main className="flex min-h-screen flex-col items-center justify-start pt-8 p-4 overflow-hidden relative text-white bg-black">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black z-0" />
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:50px_50px] pointer-events-none" />
                <LanguageToggle />

                <Suspense
                    fallback={
                        <div className="text-white z-10 flex flex-col justify-center items-center h-full">
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    }
                >
                    <ExtensionFlow />
                </Suspense>
            </main>
        </LanguageProvider>
    );
}
