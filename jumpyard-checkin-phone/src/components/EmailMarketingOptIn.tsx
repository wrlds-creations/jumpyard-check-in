'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import styles from './EmailMarketingOptIn.module.css';

export interface EmailMarketingOptInCopy {
  label: string;
  help: string;
  privacy: string;
  active: string;
  needEmail: string;
}

interface EmailMarketingOptInProps {
  checked: boolean;
  email: string;
  emailValid: boolean;
  disabled: boolean;
  privacyUrl: string;
  copy: EmailMarketingOptInCopy;
  onCheckedChange: (checked: boolean) => void;
  onNeedEmail: () => void;
}

type Status = 'active' | 'ask';

// "Ja tack! Mejla mig ..." reads as a short answer plus the details. The words and
// their order stay exactly the approved consent copy; only the type size differs.
const LEAD = /^([^!]{1,24}!)\s+(.+)$/u;

const SPARK_ANGLES = [0, 52, 104, 156, 208, 260, 312];

// Squash, jump and land: the gift bounces like a guest on a trampoline.
const HOP: Keyframe[] = [
  { transform: 'translateY(0) scale(1, 1) rotate(0deg)', easing: 'ease-out' },
  { transform: 'translateY(2px) scale(1.1, 0.88) rotate(0deg)', offset: 0.14, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
  { transform: 'translateY(-11px) scale(0.93, 1.09) rotate(-9deg)', offset: 0.46, easing: 'ease-in' },
  { transform: 'translateY(1px) scale(1.07, 0.93) rotate(0deg)', offset: 0.74, easing: 'ease-out' },
  { transform: 'translateY(0) scale(1, 1) rotate(0deg)' },
];

const INVITE_HOP: Keyframe[] = [
  { transform: 'translateY(0) rotate(0deg)' },
  { transform: 'translateY(-6px) rotate(-7deg)', offset: 0.35 },
  { transform: 'translateY(0) rotate(4deg)', offset: 0.65 },
  { transform: 'translateY(0) rotate(0deg)' },
];

const KNOB_PEEK: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(6px)', offset: 0.4 },
  { transform: 'translateX(0)' },
];

const SHAKE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-3px)' },
  { transform: 'translateX(2px)' },
  { transform: 'translateX(0)' },
];

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Optional marketing choice for the email above it. It starts off, can only be
 * switched on for a complete address and never blocks or changes the booking. */
export function EmailMarketingOptIn({
  checked,
  email,
  emailValid,
  disabled,
  privacyUrl,
  copy,
  onCheckedChange,
  onNeedEmail,
}: EmailMarketingOptInProps) {
  const id = useId();
  const leadId = `${id}-lead`;
  const bodyId = `${id}-body`;
  const helpId = `${id}-help`;
  const tileRef = useRef<HTMLLabelElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const knobRef = useRef<HTMLSpanElement>(null);
  const sparksRef = useRef<HTMLSpanElement>(null);
  const invited = useRef(false);
  const [askForEmail, setAskForEmail] = useState(false);
  const lead = LEAD.exec(copy.label);

  const status: Status | null = checked ? 'active' : askForEmail && !emailValid ? 'ask' : null;
  // Keep the last message while the status row closes, so it never blinks out.
  const [shownStatus, setShownStatus] = useState<Status>('active');
  if (status && status !== shownStatus) setShownStatus(status);

  // One quiet invitation once the guest pauses on a complete address.
  useEffect(() => {
    if (!emailValid || checked || disabled || invited.current) return;
    const timer = window.setTimeout(() => {
      invited.current = true;
      if (prefersReducedMotion()) return;
      iconRef.current?.animate(INVITE_HOP, { duration: 560, easing: 'ease-out' });
      knobRef.current?.animate(KNOB_PEEK, { duration: 560, easing: 'ease-in-out' });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [email, emailValid, checked, disabled]);

  const celebrate = () => {
    if (prefersReducedMotion()) return;
    iconRef.current?.animate(HOP, { duration: 620, delay: 60 });
    sparksRef.current?.querySelectorAll('i').forEach((spark, index) => {
      const angle = SPARK_ANGLES[index];
      spark.animate(
        [
          { opacity: 0, transform: `rotate(${angle}deg) translateY(-16px) scaleY(0.3)` },
          { opacity: 1, transform: `rotate(${angle}deg) translateY(-25px) scaleY(1)`, offset: 0.45 },
          { opacity: 0, transform: `rotate(${angle}deg) translateY(-31px) scaleY(0.4)` },
        ],
        { duration: 520, delay: 230, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
      );
    });
  };

  const toggle = (next: boolean) => {
    if (next && !emailValid) {
      setAskForEmail(true);
      if (!prefersReducedMotion()) tileRef.current?.animate(SHAKE, { duration: 380, easing: 'ease-in-out' });
      onNeedEmail();
      return;
    }
    setAskForEmail(false);
    if (next) celebrate();
    onCheckedChange(next);
  };

  return (
    <div className={styles.root} data-checked={checked} data-disabled={disabled}>
      <label ref={tileRef} className={styles.tile}>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => toggle(event.target.checked)}
          disabled={disabled}
          aria-labelledby={lead ? `${leadId} ${bodyId}` : bodyId}
          aria-describedby={helpId}
          data-testid="email-marketing-consent"
          className={`sr-only ${styles.input}`}
        />
        <span className={styles.art} aria-hidden="true">
          <span ref={iconRef} className={styles.icon}>
            <JumpyardIcon name="reward-gift" className="h-full w-full" />
          </span>
          <span ref={sparksRef} className={styles.sparks}>
            {SPARK_ANGLES.map((angle) => <i key={angle} />)}
          </span>
        </span>
        {lead && <span id={leadId} className={styles.lead}>{lead[1]}</span>}
        <span id={bodyId} className={lead ? styles.body : styles.whole}>{lead ? lead[2] : copy.label}</span>
        <span className={styles.statusWrap} data-open={status !== null} aria-hidden="true">
          <span className={styles.status}>
            <span className={styles.statusInner}>
              {shownStatus === 'active' ? (
                <>
                  <span className={styles.chip}><Check size={12} strokeWidth={4} />{copy.active}</span>
                  <span className={styles.email}>{email}</span>
                </>
              ) : (
                <span className={styles.ask}>{copy.needEmail}</span>
              )}
            </span>
          </span>
        </span>
        <span className="sr-only" aria-live="polite">{status === 'ask' ? copy.needEmail : ''}</span>
        <span className={styles.switch} aria-hidden="true">
          <span ref={knobRef} className={styles.knob}>
            <Check size={14} strokeWidth={3.5} />
          </span>
        </span>
      </label>
      <p id={helpId} className={styles.help}>
        {copy.help}{' '}
        <a href={privacyUrl} target="_blank" rel="noopener noreferrer">{copy.privacy}</a>
      </p>
    </div>
  );
}
