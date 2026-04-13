'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertTriangle, Ban, Gem } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SafetyAttestProps {
    onComplete: (attestedAt: string) => void;
}

const RULE_KEYS = ['onePerTrampoline', 'followStaff', 'noFlips', 'removeJewelry'] as const;
type RuleKey = (typeof RULE_KEYS)[number];

const RULE_ICONS: Record<RuleKey, typeof AlertTriangle> = {
    onePerTrampoline: AlertTriangle,
    followStaff: ShieldCheck,
    noFlips: Ban,
    removeJewelry: Gem,
};

export const SafetyAttest = ({ onComplete }: SafetyAttestProps) => {
    const { t } = useTranslation();
    const [checked, setChecked] = useState<Record<string, boolean>>({});

    const toggle = (key: string) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));
    const allChecked = RULE_KEYS.every(k => checked[k]);

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <ShieldCheck className="text-primary mb-1" size={28} />
            <h1 className="text-xl font-black italic uppercase text-foreground mb-0.5">{t.safetyAttest.title}</h1>
            <p className="text-muted text-xs mb-3 text-center">{t.safetyAttest.description}</p>

            <div className="w-full flex flex-col gap-2 mb-4">
                {RULE_KEYS.map(key => {
                    const Icon = RULE_ICONS[key];
                    const isChecked = !!checked[key];
                    return (
                        <button
                            key={key}
                            onClick={() => toggle(key)}
                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                                isChecked
                                    ? 'bg-primary/5 border-primary'
                                    : 'bg-surface border-border hover:border-primary/50'
                            }`}
                        >
                            <div
                                className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${
                                    isChecked ? 'bg-primary border-primary' : 'border-muted'
                                }`}
                            >
                                {isChecked && <span className="text-white text-xs font-black">✓</span>}
                            </div>
                            <Icon size={16} className={`flex-shrink-0 ${isChecked ? 'text-primary' : 'text-muted'}`} />
                            <p className="text-foreground text-sm font-bold italic">{t.safetyAttest.rules[key]}</p>
                        </button>
                    );
                })}
            </div>

            <button
                onClick={() => onComplete(new Date().toISOString())}
                disabled={!allChecked}
                className="w-full bg-primary hover:bg-surface hover:text-primary hover:border-primary border border-transparent text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40 shadow-sm"
            >
                {t.safetyAttest.cta}
            </button>
        </motion.div>
    );
};
