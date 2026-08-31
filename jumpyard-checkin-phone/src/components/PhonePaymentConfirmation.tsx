'use client';

import { JumpyardIcon } from './JumpyardIcon';
import styles from './PhonePaymentConfirmation.module.css';

export type PhonePaymentLanguage = 'sv' | 'en';

const COPY = {
  sv: {
    title: 'Betalningen är klar',
    amount: 'Betalt',
    receipt: 'Kvittot skickas via e-post.',
    continue: 'Till säkerhetsgenomgången',
  },
  en: {
    title: 'Payment complete',
    amount: 'Paid',
    receipt: 'Your receipt will be emailed.',
    continue: 'Continue to safety briefing',
  },
};

interface PhonePaymentConfirmationProps {
  language: PhonePaymentLanguage;
  // The caller supplies the confirmed, formatted amount. No price calculation here.
  amountLabel: string;
  isContinuing?: boolean;
  onContinueToSafety: () => void;
}

/** Presentation only. Does not finalize payments, save sessions or navigate on a timer. */
export function PhonePaymentConfirmation({
  language, amountLabel, isContinuing = false, onContinueToSafety,
}: PhonePaymentConfirmationProps) {
  const copy = COPY[language];

  return (
    <section className={styles.confirmation} lang={language} aria-labelledby="phone-payment-title">
      <div className={styles.message} role="status" aria-live="polite" aria-atomic="true">
        <JumpyardIcon name="success-check" className={styles.icon} />
        <h1 id="phone-payment-title" className={styles.title}>{copy.title}</h1>
        <p className={styles.amount} aria-label={`${copy.amount} ${amountLabel}`}>{amountLabel}</p>
        <p className={styles.receipt}>
          <JumpyardIcon name="receipt" className={styles.receiptIcon} />
          <span>{copy.receipt}</span>
        </p>
      </div>
      <button
        type="button"
        className={styles.continueButton}
        disabled={isContinuing}
        aria-busy={isContinuing}
        onClick={onContinueToSafety}
      >
        {copy.continue}
      </button>
    </section>
  );
}
