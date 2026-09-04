'use client';

import { JumpyardIcon } from './JumpyardIcon';
import styles from './PhonePaymentConfirmation.module.css';

export type PhonePaymentLanguage = 'sv' | 'en';
export type PhonePaymentPreparationState = 'preparing' | 'ready' | 'delayed';

const COPY = {
  sv: {
    title: 'Betalningen är klar',
    amount: 'Betalt',
    receipt: 'Kvittot skickas via e-post.',
    continue: 'Till säkerhetsgenomgången',
    continuing: 'Fortsätter …',
    preparing: 'Vi slutför ditt köp …',
    delayed: 'Det tar lite längre tid',
    delayedHelp: 'Bokningen är inte redo ännu. Betala inte igen. Kontrollera igen om en stund eller be personalen om hjälp.',
    retry: 'Kontrollera igen',
  },
  en: {
    title: 'Payment complete',
    amount: 'Paid',
    receipt: 'Your receipt will be emailed.',
    continue: 'Continue to safety briefing',
    continuing: 'Continuing …',
    preparing: 'We’re completing your purchase …',
    delayed: 'This is taking a little longer',
    delayedHelp: 'Your booking is not ready yet. Do not pay again. Check again in a moment or ask a member of staff for help.',
    retry: 'Check again',
  },
};

interface PhonePaymentConfirmationProps {
  language: PhonePaymentLanguage;
  // The caller supplies the confirmed, formatted amount. No price calculation here.
  amountLabel: string;
  preparationState?: PhonePaymentPreparationState;
  onRetryPreparation?: () => void;
  isContinuing?: boolean;
  onContinueToSafety: () => void;
}

/** Presentation only. Does not finalize payments, save sessions or navigate on a timer. */
export function PhonePaymentConfirmation({
  language, amountLabel, preparationState = 'ready', onRetryPreparation,
  isContinuing = false, onContinueToSafety,
}: PhonePaymentConfirmationProps) {
  const copy = COPY[language];

  if (preparationState !== 'ready') {
    const preparing = preparationState === 'preparing';
    return (
      <section className={styles.confirmation} lang={language} aria-labelledby="phone-payment-title">
        <div className={styles.message} role="status" aria-live="polite" aria-atomic="true">
          {preparing
            ? <span className={styles.spinner} aria-hidden="true" />
            : <JumpyardIcon name="time" className={styles.icon} />}
          <h1 id="phone-payment-title" className={styles.title}>{preparing ? copy.preparing : copy.delayed}</h1>
          {!preparing && <p className={styles.help}>{copy.delayedHelp}</p>}
        </div>
        {!preparing && onRetryPreparation && (
          <button type="button" className={styles.continueButton} onClick={onRetryPreparation}>
            {copy.retry}
          </button>
        )}
      </section>
    );
  }

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
        {isContinuing && <span className={`${styles.spinner} ${styles.buttonSpinner}`} aria-hidden="true" />}
        <span aria-live="polite">{isContinuing ? copy.continuing : copy.continue}</span>
      </button>
    </section>
  );
}
