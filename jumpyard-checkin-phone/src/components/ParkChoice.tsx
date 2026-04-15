'use client';
import { motion } from 'framer-motion';
import { CalendarCheck, ShoppingBag } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface ParkChoiceProps {
    onSelect: (choice: 'BOOKING' | 'BUY') => void;
}

export const ParkChoice = ({ onSelect }: ParkChoiceProps) => {
    const { t } = useTranslation();

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center justify-center px-4"
            style={{ minHeight: 'calc(100dvh - 60px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <img src="/jumpyard_logo.png" alt="JumpYard" className="w-36 mb-8" />

            <h1 className="text-xl font-black italic uppercase text-foreground mb-6 text-center">
                {t.choice.title}
            </h1>

            <div className="w-full flex flex-col gap-3">
                <button
                    onClick={() => onSelect('BOOKING')}
                    className="w-full bg-primary text-white p-5 rounded-2xl text-left flex items-start gap-4 transition-all active:scale-[0.98]"
                >
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CalendarCheck size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black italic uppercase leading-tight">
                            {t.choice.haveBooking}
                        </h2>
                        <p className="text-white/70 text-xs mt-1">
                            {t.choice.haveBookingDesc}
                        </p>
                    </div>
                </button>

                <button
                    onClick={() => onSelect('BUY')}
                    className="w-full bg-surface border border-border text-foreground p-5 rounded-2xl text-left flex items-start gap-4 transition-all active:scale-[0.98]"
                >
                    <div className="w-10 h-10 rounded-xl bg-surface-strong flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ShoppingBag size={22} className="text-muted" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black italic uppercase leading-tight">
                            {t.choice.buyTickets}
                        </h2>
                        <p className="text-muted text-xs mt-1">
                            {t.choice.buyTicketsDesc}
                        </p>
                    </div>
                </button>
            </div>
        </motion.div>
    );
};
