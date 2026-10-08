'use client';
import type { Ref } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import type { SessionIssue } from '@/flow/cloudClient';

// #458: the single safety approval shown under the docked film once it has played to the end. The
// rules are short readable lines; the one action carries the attestation sentence. The docked film
// itself is the replay control.

export type SafetyApprovalStatus = 'idle' | 'checking' | 'waiting' | 'delayed';

export interface SafetyApprovalProps {
    /** Tighter type and spacing for short screens (small phones, browser toolbars). */
    compact?: boolean;
    headingRef?: Ref<HTMLHeadingElement>;
    isSubmitting?: boolean;
    submitError?: SessionIssue | null;
    /** #331: notice shown while an approved purchase waits for ROLLER's paid confirmation. */
    statusNotice?: string | null;
    statusState?: SafetyApprovalStatus;
    retryAction?: { label: string; onClick: () => void } | null;
    onApprove: () => void;
}

const SAFETY_RULES: { key: SafetyRuleKey; icon: JumpyardIconName }[] = [
    { key: 'ageRules', icon: 'age-limit' },
    { key: 'onePerTrampoline', icon: 'trampoline-jump' },
    { key: 'avoidEdgePadding', icon: 'no-edge-bounce' },
    { key: 'landOnBackOrBottom', icon: 'foam-pit-landing' },
    { key: 'tricksWithinAbility', icon: 'safe-tricks' },
    { key: 'noRunning', icon: 'no-running' },
];
type SafetyRuleKey = 'ageRules' | 'onePerTrampoline' | 'avoidEdgePadding' | 'landOnBackOrBottom' | 'tricksWithinAbility' | 'noRunning';

export function SafetyApproval({
    compact = false,
    headingRef,
    isSubmitting = false,
    submitError = null,
    statusNotice = null,
    statusState = 'idle',
    retryAction = null,
    onApprove,
}: SafetyApprovalProps) {
    const { t } = useTranslation();

    return (
        <div
            className="px-0.5"
            data-testid="safety-approval"
            data-compact={String(compact)}
        >
            <h2
                ref={headingRef}
                tabIndex={-1}
                className={`flex items-center text-[11px] font-black italic uppercase tracking-wider text-foreground ${compact ? 'min-h-6' : 'min-h-7'}`}
            >
                {t.safetyAttest.safetyRulesTitle}
            </h2>

            <ul className={`flex flex-col rounded-2xl border border-border bg-white ${compact ? 'mt-1 gap-1 px-2.5 py-2' : 'mt-1.5 gap-1.5 px-3 py-2.5'}`}>
                {SAFETY_RULES.map(({ key, icon }) => {
                    const rule = t.safetyAttest.shortRules[key];
                    return (
                        <li key={key} className={`flex items-center font-bold italic text-foreground ${compact ? 'gap-2 text-[12px] leading-tight' : 'gap-2.5 text-[13px] leading-snug'}`}>
                            <JumpyardIcon name={icon} className={`flex-shrink-0 ${compact ? 'h-5 w-5' : 'h-6 w-6'}`} />
                            {Array.isArray(rule)
                                ? <span className="flex min-w-0 flex-col">{rule.map(line => <span key={line}>{line}</span>)}</span>
                                : <span className="min-w-0">{rule}</span>}
                        </li>
                    );
                })}
            </ul>

            <button
                type="button"
                onClick={onApprove}
                disabled={isSubmitting || retryAction !== null}
                aria-busy={isSubmitting}
                data-testid="ready-for-staff-submit"
                data-ready-for-staff-state={
                    isSubmitting ? 'submitting' : submitError ? submitError : statusState === 'delayed' ? 'delayed' : 'idle'
                }
                className={`flex w-full items-center gap-3 rounded-2xl border border-transparent bg-primary text-left text-white shadow-sm transition-all active:scale-[0.98] ${compact ? 'mt-2 px-3.5 py-2.5' : 'mt-3 px-4 py-3'} ${isSubmitting ? 'cursor-wait' : 'disabled:opacity-40'}`}
            >
                {isSubmitting && <Loader2 size={22} aria-hidden="true" className="flex-shrink-0 animate-spin motion-reduce:animate-none" />}
                <span className="min-w-0">
                    <span className={`type-button block font-black italic uppercase leading-tight ${compact ? 'text-base' : 'text-lg'}`}>
                        {isSubmitting ? t.safetyAttest.readyForStaffProcessing : t.safetyAttest.attestLead}
                    </span>
                    {!isSubmitting && (
                        <span className={`mt-0.5 block font-bold ${compact ? 'text-[12px] leading-tight' : 'text-[13px] leading-snug'}`}>{t.safetyAttest.attestRest}</span>
                    )}
                </span>
            </button>

            {statusNotice && (
                <div
                    className="mt-3 w-full rounded-xl border border-border bg-white px-3 py-3 text-left"
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
                    className="mt-3 w-full rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-left"
                    data-testid="ready-for-staff-error"
                >
                    <p className="text-xs font-bold text-foreground">{t.safetyAttest.readyForStaffFailed}</p>
                </div>
            )}
        </div>
    );
}
