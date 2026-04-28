'use client';
import { motion } from 'framer-motion';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import type { Booking } from '@/flow/types';

interface BookingSummaryProps {
    booking: Booking;
    onContinue: () => void;
}

export const BookingSummary = ({ booking, onContinue }: BookingSummaryProps) => {
    const { t } = useTranslation();

    const existingAddons: { label: string; qty: number }[] = booking?.existingAddons ?? [];

    const timeDisplay = booking?.endTime
        ? `${booking.time}–${booking.endTime}`
        : booking?.time || '14:00';

    const durationDisplay = booking?.durationMinutes
        ? `${booking.durationMinutes} min`
        : null;

    const guestDisplay = [booking?.guestName, booking?.lastName].filter(Boolean).join(' ');

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center justify-center px-4 py-3 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <h1 className="text-xl font-black italic uppercase text-foreground">{t.booking.title}</h1>
            {guestDisplay && (
                <p className="text-base font-bold italic text-foreground opacity-90 mt-0.5">{guestDisplay}</p>
            )}
            <p className="text-muted text-xs mt-1 mb-1">{t.booking.subtitle}</p>
            <p className="text-muted text-[11px] mb-3 text-center">{t.booking.timeHint}</p>

            <div className="bg-surface border border-border w-full rounded-2xl p-4 text-left shadow-sm mb-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white p-2.5 rounded-xl border border-border shadow-sm">
                        <JumpyardIcon name="time" className="w-6 h-6 mb-0.5" />
                        <p className="text-foreground font-bold italic text-sm">{timeDisplay}</p>
                        {durationDisplay && <p className="text-primary text-[11px] font-bold italic">{durationDisplay}</p>}
                        <p className="text-muted text-[10px] uppercase">{t.booking.time}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-border shadow-sm">
                        <JumpyardIcon name="group" className="w-6 h-6 mb-0.5" />
                        <p className="text-foreground font-bold italic text-lg">{booking?.jumpers || 1}</p>
                        <p className="text-muted text-[10px] uppercase">{t.booking.jumpers}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-border col-span-2 shadow-sm">
                        <JumpyardIcon name="addons-bag" className="w-6 h-6 mb-0.5" />
                        {existingAddons.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                                {existingAddons.map((a, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded-full bg-surface border border-border text-foreground text-xs font-bold italic">
                                        {a.label} x{a.qty}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-foreground font-bold italic text-sm">{t.booking.none}</p>
                        )}
                        <p className="text-muted text-[10px] uppercase mt-1">{t.booking.addons}</p>
                    </div>
                </div>

                {booking?.productLabel && (
                    <div className="bg-white p-2.5 rounded-xl border border-border shadow-sm mb-3">
                        <JumpyardIcon name="admission-ticket" className="w-6 h-6 mb-0.5" />
                        <p className="text-foreground font-bold italic text-sm">{booking.productLabel}</p>
                        <p className="text-muted text-[10px] uppercase">{t.booking.product}</p>
                    </div>
                )}

                <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border mb-3 ${
                    booking?.paid
                        ? 'bg-success/10 border-success/30'
                        : 'bg-amber-50 border-amber-200'
                }`}>
                    {booking?.paid
                        ? <JumpyardIcon name="success-check" className="w-8 h-8 flex-shrink-0" />
                        : <JumpyardIcon name="payment-card" className="w-8 h-8 flex-shrink-0" />
                    }
                    <div>
                        <p className={`font-bold italic uppercase text-[11px] ${booking?.paid ? 'text-success' : 'text-amber-600'}`}>
                            {t.payment.title}
                        </p>
                        <p className="text-foreground text-sm italic">{booking?.paid ? t.booking.paidInFull : t.booking.notPaid}</p>
                    </div>
                </div>

                <div className="flex justify-between items-center border-t border-border pt-3">
                    <p className="text-muted font-bold italic uppercase tracking-wider text-[11px]">{t.booking.ref}</p>
                    <p className="text-muted font-black italic tracking-wider text-sm">{booking?.id || 'TEST1234'}</p>
                </div>
            </div>

            <button
                onClick={onContinue}
                className="w-full bg-primary hover:bg-surface hover:text-primary border border-transparent hover:border-primary text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-sm"
            >
                {t.booking.cta}
            </button>
        </motion.div>
    );
};
