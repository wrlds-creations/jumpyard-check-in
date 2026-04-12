'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Ruler } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SkyRiderAttestProps {
    onComplete: () => void;
    onBack: () => void;
}

export const SkyRiderAttest = ({ onComplete, onBack }: SkyRiderAttestProps) => {
    const { t } = useTranslation();
    const [confirmed, setConfirmed] = useState(false);

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <button onClick={onBack} className="self-start flex items-center gap-1 text-zinc-500 hover:text-white text-xs font-bold italic uppercase tracking-wider mb-3">
                <ArrowLeft size={14} /> {t.common.back}
            </button>

            <Ruler className="text-primary mb-1" size={32} />
            <h1 className="text-xl font-black italic uppercase text-white mb-0.5">{t.skyrider.title}</h1>
            <p className="text-zinc-500 text-xs mb-4 max-w-sm">{t.skyrider.description}</p>

            <button
                onClick={() => setConfirmed(c => !c)}
                className={`w-full text-left p-4 rounded-2xl border-2 mb-4 transition-all ${
                    confirmed
                        ? 'bg-primary/20 border-primary'
                        : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'
                }`}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center mt-0.5 ${
                            confirmed ? 'bg-primary border-primary' : 'border-zinc-600'
                        }`}
                    >
                        {confirmed && <span className="text-white font-black text-xs">✓</span>}
                    </div>
                    <p className="text-white font-bold italic text-sm">{t.skyrider.confirmCheckbox}</p>
                </div>
            </button>

            <button
                onClick={onComplete}
                disabled={!confirmed}
                className="w-full bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40"
            >
                {t.common.continue}
            </button>
        </motion.div>
    );
};
