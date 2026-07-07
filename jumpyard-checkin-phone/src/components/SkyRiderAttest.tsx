'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from '@/components/JumpyardIcon';

interface SkyRiderAttestProps {
    onComplete: () => void;
}

export const SkyRiderAttest = ({ onComplete }: SkyRiderAttestProps) => {
    const { t } = useTranslation();
    const [confirmed, setConfirmed] = useState(false);
    const infoItems = [
        { title: t.skyrider.requirementTitle, text: t.skyrider.requirementText },
        { title: t.skyrider.timingTitle, text: t.skyrider.timingText },
    ];

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <JumpyardIcon name="zipline" className="w-16 h-16 mb-1" />
            <h1 className="text-xl font-black italic uppercase text-foreground mb-0.5">{t.skyrider.title}</h1>
            <p className="text-foreground text-xs mb-3 max-w-sm">{t.skyrider.description}</p>

            <div className="w-full space-y-2 mb-4" aria-label={t.skyrider.infoLabel}>
                {infoItems.map((item, index) => (
                    <div key={item.title} className="flex gap-3 rounded-xl border border-border bg-white p-3 text-left shadow-sm">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                            {index + 1}
                        </div>
                        <div>
                            <p className="text-sm font-black italic uppercase text-foreground">{item.title}</p>
                            <p className="mt-0.5 text-xs leading-snug text-foreground">{item.text}</p>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={() => setConfirmed(c => !c)}
                className={`w-full text-left p-4 rounded-2xl border-2 mb-4 transition-all shadow-sm ${
                    confirmed
                        ? 'bg-white border-primary'
                        : 'bg-white border-border hover:border-primary'
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
