'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import type { SessionIssue } from '@/flow/cloudClient';

interface SafetyAttestProps {
    buyEntryFlow?: boolean;
    isSubmitting?: boolean;
    submitError?: SessionIssue | null;
    /** #331: notice shown while an approved purchase waits for ROLLER's paid confirmation. */
    statusNotice?: string | null;
    statusState?: 'idle' | 'checking' | 'waiting' | 'delayed';
    retryAction?: { label: string; onClick: () => void } | null;
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

const SAFETY_RULE_ICONS: Record<SafetyRuleKey, JumpyardIconName> = {
    onePerTrampoline: 'trampoline-jump',
    avoidEdgePadding: 'no-edge-bounce',
    landOnBackOrBottom: 'foam-pit-landing',
    tricksWithinAbility: 'safe-tricks',
    noRunning: 'no-running',
};

const AGE_BULLETS = ['adultInArea35', 'adultInVenue610', 'canJumpAlone11'] as const;

export const SafetyAttest = ({
    buyEntryFlow = false,
    isSubmitting = false,
    submitError = null,
    statusNotice = null,
    statusState = 'idle',
    retryAction = null,
    onComplete,
}: SafetyAttestProps) => {
    const { t } = useTranslation();
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const title = buyEntryFlow ? t.safetyAttest.buyTitle : t.safetyAttest.title;
    const description = buyEntryFlow ? t.safetyAttest.buyDescription : t.safetyAttest.description;

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
                {!buyEntryFlow && <JumpyardIcon name="safety-check" className="w-8 h-8" />}
                <h1 className="text-xl font-black italic uppercase text-foreground">{title}</h1>
            </div>
            <p className="text-foreground text-xs mb-3 text-center">{description}</p>

            <div className="w-full flex flex-col gap-2 mb-4">
                <h2 className="mb-0.5 text-foreground text-xs font-black italic uppercase tracking-wider">
                    {t.safetyAttest.safetyRulesTitle}
                </h2>
                {/* Age rules — single checkbox covering all three brackets */}
                <button
                    onClick={() => toggle(AGE_KEY)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                        ageChecked
                            ? 'bg-white border-primary shadow-sm'
                            : 'bg-white border-border hover:border-primary/50'
                    }`}
                >
                    <div
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${
                            ageChecked ? 'bg-primary border-primary' : 'border-muted'
                        }`}
                    >
                        {ageChecked && <span className="text-white text-xs font-black">✓</span>}
                    </div>
                    <JumpyardIcon name="age-limit" className="mt-0.5 w-7 h-7 flex-shrink-0" />
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <p className="text-foreground text-sm font-bold italic">
                            {t.safetyAttest.ageRulesTitle}
                        </p>
                        <ul className="flex flex-col gap-1 text-foreground text-xs leading-snug">
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
                {/* Safety rules — one checkbox per rule */}
                {SAFETY_RULE_KEYS.map(key => {
                    const icon = SAFETY_RULE_ICONS[key];
                    const isChecked = !!checked[key];
                    return (
                        <button
                            key={key}
                            onClick={() => toggle(key)}
                            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                                isChecked
                                    ? 'bg-white border-primary shadow-sm'
                                    : 'bg-white border-border hover:border-primary/50'
                            }`}
                        >
                            <div
                                className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${
                                    isChecked ? 'bg-primary border-primary' : 'border-muted'
                                }`}
                            >
                                {isChecked && <span className="text-white text-xs font-black">✓</span>}
                            </div>
                            <JumpyardIcon name={icon} className="w-7 h-7 flex-shrink-0" />
                            <p className="text-foreground text-sm font-bold italic">{t.safetyAttest.rules[key]}</p>
                        </button>
                    );
                })}
            </div>

            {allChecked && (
                <p className="text-foreground text-xs text-center mb-2">{t.safetyAttest.finalAttest}</p>
            )}

            {statusNotice && (
                <div
                    className="w-full mb-3 rounded-xl border border-border bg-white px-3 py-3 text-left"
                    data-testid="paid-confirmation-notice"
                    data-paid-confirmation-state={statusState}
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex items-start gap-2">
                        {statusState !== 'delayed' && (
                            <span
                                className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
                                aria-hidden="true"
                            />
                        )}
                        <p className="text-xs font-bold text-foreground">{statusNotice}</p>
                    </div>
                    {retryAction && (
                        <button
                            type="button"
                            onClick={retryAction.onClick}
                            disabled={isSubmitting}
                            data-testid="paid-confirmation-retry"
                            className="mt-3 w-full rounded-xl border border-primary bg-white py-3 text-sm font-black italic uppercase text-primary transition-all disabled:opacity-40"
                        >
                            {retryAction.label}
                        </button>
                    )}
                </div>
            )}

            {submitError && (
                <div
                    className="w-full mb-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-left"
                    data-testid="ready-for-staff-error"
                >
                    <p className="text-xs font-bold text-foreground">{t.safetyAttest.readyForStaffFailed}</p>
                </div>
            )}

            <button
                onClick={() => onComplete(new Date().toISOString())}
                disabled={!allChecked || isSubmitting || retryAction !== null}
                aria-busy={isSubmitting}
                data-testid="ready-for-staff-submit"
                data-ready-for-staff-state={
                    isSubmitting ? 'submitting' : submitError ? submitError : statusState === 'delayed' ? 'delayed' : 'idle'
                }
                className="w-full bg-primary hover:bg-surface hover:text-primary hover:border-primary border border-transparent text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40 shadow-sm"
            >
                {isSubmitting ? t.safetyAttest.readyForStaffProcessing : t.safetyAttest.cta}
            </button>
        </motion.div>
    );
};
