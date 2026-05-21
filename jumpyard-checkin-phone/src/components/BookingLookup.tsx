'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { CloudLookupError, lookupBooking, type LookupIssue } from '@/flow/cloudClient';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import type { Booking } from '@/flow/types';

interface BookingLookupProps {
    onSuccess: (booking: Booking) => void;
    onBack: () => void;
}

export const BookingLookup = ({ onSuccess }: BookingLookupProps) => {
    const { t } = useTranslation();
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<LookupIssue | null>(null);

    const handleSearch = async () => {
        if (!code.trim()) return;
        setLoading(true);
        setError(null);

        try {
            const booking = await lookupBooking(code.trim());
            onSuccess(booking);
        } catch (lookupError) {
            setError(lookupError instanceof CloudLookupError ? lookupError.reason : 'lookup_failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col justify-center px-4"
            style={{ minHeight: 'calc(100dvh - 120px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <JumpyardIcon name="visit-calendar" className="w-16 h-16 mx-auto mb-2" />
            <h1 className="text-xl font-black italic uppercase text-foreground mb-1 text-center">
                {t.lookup.title}
            </h1>
            <p className="text-muted text-xs text-center mb-6">
                {t.lookup.description}
            </p>

            <div className="mb-4">
                <input
                    data-testid="booking-lookup-input"
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder={t.lookup.placeholder}
                    autoFocus
                    className="w-full bg-white border border-border rounded-xl px-4 py-3.5 text-base text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all tracking-wider uppercase font-bold"
                />
            </div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-4 bg-red-50 border border-red-200 p-3 rounded-xl"
                >
                    <p className="text-sm text-red-700 font-medium">{getLookupErrorTitle(error, t)}</p>
                    <p className="text-xs text-red-500 mt-0.5">{getLookupErrorDescription(error, t)}</p>
                </motion.div>
            )}

            <button
                data-testid="booking-lookup-submit"
                onClick={handleSearch}
                disabled={loading || !code.trim()}
                className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
                {loading ? (
                    <span className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.common.processing}
                    </span>
                ) : (
                    t.lookup.cta
                )}
            </button>
        </motion.div>
    );
};

function getLookupErrorTitle(error: LookupIssue, t: ReturnType<typeof useTranslation>['t']) {
    if (error === 'payment_required') return t.lookup.paymentRequired;
    if (error === 'wrong_date') return t.lookup.wrongDate;
    if (error === 'no_redeemable_tickets') return t.lookup.noRedeemableTickets;
    if (error === 'network_error') return t.lookup.serviceUnavailable;
    if (error === 'not_found') return t.lookup.notFound;
    return t.lookup.lookupFailed;
}

function getLookupErrorDescription(error: LookupIssue, t: ReturnType<typeof useTranslation>['t']) {
    if (error === 'payment_required') return t.lookup.paymentRequiredDesc;
    if (error === 'wrong_date') return t.lookup.wrongDateDesc;
    if (error === 'no_redeemable_tickets') return t.lookup.noRedeemableTicketsDesc;
    if (error === 'network_error') return t.lookup.serviceUnavailableDesc;
    return t.lookup.tryAgain;
}
