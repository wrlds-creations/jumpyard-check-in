'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    ShieldCheck,
    AlertTriangle,
    Ban,
    Footprints,
    Gauge,
    Target,
    Users,
} from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SafetyAttestProps {
    onComplete: (attestedAt: string) => void;
}

const AGE_KEY = 'ageRules';

const SAFETY_RULE_KEYS = [
    'onePerTrampoline',
    'avoidEdgePadding',
    'landOnBackOrBottom',
    'tricksWithinAbility',
    'noRunning',
] as const;
type SafetyRuleKey = (typeof SAFETY_RULE_KEYS)[number];

const ALL_KEYS = [AGE_KEY, ...SAFETY_RULE_KEYS] as const;

const SAFETY_RULE_ICONS: Record<SafetyRuleKey, typeof AlertTriangle> = {
    onePerTrampoline: AlertTriangle,
    avoidEdgePadding: Ban,
    landOnBackOrBottom: Target,
    tricksWithinAbility: Gauge,
    noRunning: Footprints,
};

const AGE_BULLETS = ['adultInArea35', 'adultInVenue610', 'canJumpAlone11'] as const;

export const SafetyAttest = ({ onComplete }: SafetyAttestProps) => {
    const { t } = useTranslation();
    const [checked, setChecked] = useState<Record<string, boolean>>({});

    const toggle = (key: string) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));
    const allChecked = ALL_KEYS.every(k => checked[k]);

    const ageChecked = !!checked[AGE_KEY];

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <div className="flex items-center gap-2 mb-0.5">
                <ShieldCheck className="text-primary" size={22} />
                <h1 className="text-xl font-black italic uppercase text-foreground">{t.safetyAttest.title}</h1>
            </div>
            <p className="text-muted text-xs mb-3 text-center">{t.safetyAttest.description}</p>

            <div className="w-full flex flex-col gap-2 mb-4">
                {/* Age rules — single checkbox covering all three brackets */}
                <button
                    onClick={() => toggle(AGE_KEY)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                        ageChecked
                            ? 'bg-primary/5 border-primary'
                            : 'bg-surface border-border hover:border-primary/50'
                    }`}
                >
                    <div
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${
                            ageChecked ? 'bg-primary border-primary' : 'border-muted'
                        }`}
                    >
                        {ageChecked && <span className="text-white text-xs font-black">✓</span>}
                    </div>
                    <Users
                        size={16}
                        className={`mt-0.5 flex-shrink-0 ${ageChecked ? 'text-primary' : 'text-muted'}`}
                    />
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <p className="text-foreground text-sm font-bold italic">
                            {t.safetyAttest.ageRulesTitle}
                        </p>
                        <ul className="flex flex-col gap-1 text-muted text-xs leading-snug">
                            {AGE_BULLETS.map(bulletKey => (
                                <li key={bulletKey} className="flex gap-1.5">
                                    <span className="text-primary">•</span>
                                    <span>{t.safetyAttest.ageRules[bulletKey]}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </button>

                {/* Safety rules section header */}
                <h2 className="mt-2 mb-0.5 text-foreground text-xs font-black italic uppercase tracking-wider">
                    {t.safetyAttest.safetyRulesTitle}
                </h2>

                {/* Safety rules — one checkbox per rule */}
                {SAFETY_RULE_KEYS.map(key => {
                    const Icon = SAFETY_RULE_ICONS[key];
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

            {allChecked && (
                <p className="text-muted text-xs text-center mb-2">{t.safetyAttest.finalAttest}</p>
            )}

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
