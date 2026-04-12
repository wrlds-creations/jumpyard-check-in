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
            <h1 className="text-xl font-black italic uppercase text-white">{t.booking.title}</h1>
            {guestDisplay && (
                <p className="text-base font-bold italic text-zinc-300 mt-0.5">{guestDisplay}</p>
            )}
            <p className="text-zinc-500 text-xs mt-1 mb-3">{t.booking.subtitle}</p>

            <button
                onClick={onContinue}
                className="w-full bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-[0_0_30px_rgba(227,24,55,0.3)] mb-4"
            >
                {t.booking.cta}
            </button>

            <div className="bg-zinc-900/80 border border-zinc-800 w-full rounded-2xl p-4 text-left">
                <div className="flex justify-between items-center mb-3 border-b border-zinc-800 pb-2">
                    <p className="text-zinc-500 font-bold italic uppercase tracking-wider text-[11px]">{t.booking.ref}</p>
                    <p className="text-primary font-black italic tracking-wider">{booking?.id || 'TEST1234'}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-black/60 p-2.5 rounded-xl border border-zinc-800">
                        <Clock className="text-zinc-600 mb-0.5" size={14} />
                        <p className="text-white font-bold italic text-sm">{timeDisplay}</p>
                        {durationDisplay && <p className="text-primary text-[11px] font-bold italic">{durationDisplay}</p>}
                        <p className="text-zinc-600 text-[10px] uppercase">{t.booking.time}</p>
                    </div>
                    <div className="bg-black/60 p-2.5 rounded-xl border border-zinc-800">
                        <Users className="text-zinc-600 mb-0.5" size={14} />
                        <p className="text-white font-bold italic text-lg">{booking?.jumpers || 1}</p>
                        <p className="text-zinc-600 text-[10px] uppercase">{t.booking.jumpers}</p>
                    </div>
                    <div className="bg-black/60 p-2.5 rounded-xl border border-zinc-800 col-span-2">
                        <ShoppingBag className="text-zinc-600 mb-0.5" size={14} />
                        <p className="text-white font-bold italic text-sm">{addonLabels}</p>
                        <p className="text-zinc-600 text-[10px] uppercase">{t.booking.addons}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 bg-success/10 p-2.5 rounded-xl border border-success/30">
                    <CheckCircle className="text-success flex-shrink-0" size={16} />
                    <div>
                        <p className="text-success font-bold italic uppercase text-[11px]">{t.payment.title}</p>
                        <p className="text-white text-sm italic">{booking?.paid ? t.booking.paidInFull : t.booking.notPaid}</p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
