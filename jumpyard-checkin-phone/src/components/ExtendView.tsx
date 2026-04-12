'use client';
import { motion } from 'framer-motion';
import { Clock, Sparkles } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface ExtendViewProps {
    currentEnd: string;
    newEnd: string;
    price: number;
    onContinue: () => void;
}

export const ExtendView = ({ currentEnd, newEnd, price, onContinue }: ExtendViewProps) => {
    const { t } = useTranslation();
    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center p-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <Sparkles className="text-primary mb-4" size={56} />
            <h1 className="text-3xl font-black italic uppercase text-white mb-2">{t.extend.view.title}</h1>
            <p className="text-zinc-400 mb-6">{t.extend.view.subtitle}</p>

            <div className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-6 mb-4">
                <div className="flex justify-between items-center pb-4 mb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2 text-zinc-400 text-sm uppercase font-bold tracking-wider">
                        <Clock size={16} /> {t.extend.view.currentEnd}
                    </div>
                    <p className="text-xl font-black text-white">{currentEnd}</p>
                </div>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-primary text-sm uppercase font-bold tracking-wider">
                        <Clock size={16} /> {t.extend.view.newEnd}
                    </div>
                    <p className="text-2xl font-black text-primary">{newEnd}</p>
                </div>
            </div>

            <div className="w-full flex items-center justify-between bg-black/40 border border-zinc-800 rounded-2xl px-6 py-4 mb-6">
                <p className="text-zinc-400 uppercase text-sm font-bold tracking-wider">{t.extend.view.price}</p>
                <p className="text-3xl font-black text-primary">{price} {t.common.currency}</p>
            </div>

            <button
                onClick={onContinue}
                className="w-full bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-xl py-5 rounded-2xl transition-all"
            >
                {t.extend.view.cta} {price} {t.common.currency}
            </button>
        </motion.div>
    );
};
