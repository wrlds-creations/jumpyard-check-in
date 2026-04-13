'use client';
import { motion } from 'framer-motion';
import { Calendar, Users, ShoppingBag, CheckCircle, Clock } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface BookingSummaryProps {
    booking: any;
    onContinue: () => void;
}

export const BookingSummary = ({ booking, onContinue }: BookingSummaryProps) => {
    const { t } = useTranslation();

    const addonLabels = booking?.existingAddons?.length
        ? booking.existingAddons.map((a: any) => `${a.label} x${a.qty}`).join(', ')
        : t.booking.none;

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
            <p className="text-muted text-xs mt-1 mb-3">{t.booking.subtitle}</p>

            <button
                onClick={onContinue}
                className="w-full bg-primary hover:bg-surface hover:text-primary border border-transparent hover:border-primary text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-sm mb-4"
            >
                {t.booking.cta}
            </button>

            <div className="bg-surface border border-border w-full rounded-2xl p-4 text-left shadow-sm">
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white p-2.5 rounded-xl border border-border shadow-sm">
                        <Clock className="text-muted mb-0.5" size={14} />
                        <p className="text-foreground font-bold italic text-sm">{timeDisplay}</p>
                        {durationDisplay && <p className="text-primary text-[11px] font-bold italic">{durationDisplay}</p>}
                        <p className="text-muted text-[10px] uppercase">{t.booking.time}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-border shadow-sm">
                        <Users className="text-muted mb-0.5" size={14} />
                        <p className="text-foreground font-bold italic text-lg">{booking?.jumpers || 1}</p>
                        <p className="text-muted text-[10px] uppercase">{t.booking.jumpers}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-border col-span-2 shadow-sm">
                        <ShoppingBag className="text-muted mb-0.5" size={14} />
                        <p className="text-foreground font-bold italic text-sm">{addonLabels}</p>
                        <p className="text-muted text-[10px] uppercase">{t.booking.addons}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 bg-success/10 p-2.5 rounded-xl border border-success/30 mb-3">
                    <CheckCircle className="text-success flex-shrink-0" size={16} />
                    <div>
                        <p className="text-success font-bold italic uppercase text-[11px]">{t.payment.title}</p>
                        <p className="text-foreground text-sm italic">{booking?.paid ? t.booking.paidInFull : t.booking.notPaid}</p>
                    </div>
                </div>

                <div className="flex justify-between items-center border-t border-border pt-3">
                    <p className="text-muted font-bold italic uppercase tracking-wider text-[11px]">{t.booking.ref}</p>
                    <p className="text-muted font-black italic tracking-wider text-sm">{booking?.id || 'TEST1234'}</p>
                </div>
            </div>
        </motion.div>
    );
};
