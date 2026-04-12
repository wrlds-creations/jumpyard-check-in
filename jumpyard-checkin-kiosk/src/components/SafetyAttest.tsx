'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SafetyAttestProps {
    onComplete: (attestedAt: string) => void;
    onBack: () => void;
}

export const SafetyAttest = ({ onComplete, onBack }: SafetyAttestProps) => {
    const { t } = useTranslation();
    const [confirmed, setConfirmed] = useState(false);

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <button onClick={onBack} className="self-start flex items-center gap-1 text-zinc-500 hover:text-white text-xs font-bold italic uppercase tracking-wider mb-3">
                <ArrowLeft size={14} /> {t.common.back}
            </button>

            <ShieldCheck className="text-primary mb-1" size={28} />
            <h1 className="text-xl font-black italic uppercase text-white mb-3">{t.safetyAttest.title}</h1>

            <button
                onClick={() => setConfirmed(c => !c)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-3 mb-4 ${
                    confirmed
                        ? 'bg-primary/20 border-primary'
                        : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'
                }`}
            >
                <CheckCircle2 className={`flex-shrink-0 ${confirmed ? 'text-primary' : 'text-zinc-600'}`} size={24} />
                <p className="text-white font-bold italic text-sm">{t.safetyAttest.attestStatement}</p>
            </button>

            <button
                onClick={() => onComplete(new Date().toISOString())}
                disabled={!confirmed}
                className="w-full bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40"
            >
                {t.safetyAttest.cta}
            </button>
        </motion.div>
    );
};
