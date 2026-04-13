'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Ruler } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SkyRiderAttestProps {
    onComplete: () => void;
}

export const SkyRiderAttest = ({ onComplete }: SkyRiderAttestProps) => {
    const { t } = useTranslation();
    const [confirmed, setConfirmed] = useState(false);

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <Ruler className="text-primary mb-1" size={32} />
            <h1 className="text-xl font-black italic uppercase text-foreground mb-0.5">{t.skyrider.title}</h1>
            <p className="text-muted text-xs mb-4 max-w-sm">{t.skyrider.description}</p>

            <button
                onClick={() => setConfirmed(c => !c)}
                className={`w-full text-left p-4 rounded-2xl border-2 mb-4 transition-all shadow-sm ${
                    confirmed
                        ? 'bg-primary/5 border-primary'
                        : 'bg-surface border-border hover:border-primary'
                }`}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center mt-0.5 ${
                            confirmed ? 'bg-primary border-primary' : 'border-muted'
                        }`}
                    >
                        {confirmed && <span className="text-white font-black text-xs">✓</span>}
                    </div>
                    <p className="text-foreground font-bold italic text-sm">{t.skyrider.confirmCheckbox}</p>
                </div>
            </button>

            <button
                onClick={onComplete}
                disabled={!confirmed}
                className="w-full bg-primary hover:bg-surface hover:text-primary hover:border-primary border border-transparent text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40 shadow-sm"
            >
                {t.common.continue}
            </button>
        </motion.div>
    );
};
