'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { PhonePaymentConfirmation, type PhonePaymentLanguage } from '@/components/PhonePaymentConfirmation';
import styles from './preview.module.css';

type PreviewState = 'processing' | 'approved' | 'declined' | 'unknown' | 'safety';
type PurchasePath = 'entry' | 'addon';

const ICONS: JumpyardIconName[] = ['admission-ticket', 'addons-bag', 'payment-card', 'safety-check', 'success-check'];
const STATES: PreviewState[] = ['processing', 'approved', 'declined', 'unknown'];
const COPY = {
  sv: {
    preview: 'Lokal förhandsvisning', disclaimer: 'Inga riktiga betalningar',
    controls: 'Testa andra lägen', play: 'Spela godkänt flöde',
    path: 'Köp', entry: 'Ny entré · 200 kr', addon: 'Tillägg · 20 kr', state: 'Visa läge',
    names: ['Pågår', 'Godkänt', 'Nekat', 'Besked saknas'],
    steps: ['Entré', 'Tillägg', 'Betalning', 'Säkerhet', 'Klar'], booking: 'Bokning', progress: 'Din bokning',
    processing: 'Betalning pågår', waiting: 'Inväntar betalningsbesked',
    declined: 'Betalningen nekades', declinedBody: 'Ingen betalning godkändes.',
    unknown: 'Vi saknar betalningsbesked', unknownBody: 'Betala inte igen. Be personalen om hjälp.',
    safety: 'Dags för säkerhetsgenomgång', safetyNote: 'Simulerat nästa steg. Här börjar säkerhetsgenomgången i det riktiga flödet.',
  },
  en: {
    preview: 'Local preview', disclaimer: 'No real payments',
    controls: 'Test other states', play: 'Play approved flow',
    path: 'Purchase', entry: 'New entry · SEK 200', addon: 'Add-on · SEK 20', state: 'Show state',
    names: ['Processing', 'Approved', 'Declined', 'Result missing'],
    steps: ['Entry', 'Add-ons', 'Payment', 'Safety', 'Done'], booking: 'Booking', progress: 'Your booking',
    processing: 'Payment in progress', waiting: 'Waiting for payment result',
    declined: 'Payment declined', declinedBody: 'No payment was approved.',
    unknown: 'Payment result missing', unknownBody: 'Do not pay again. Please ask a member of staff for help.',
    safety: 'Time for your safety briefing', safetyNote: 'Simulated next step. The safety briefing starts here in the real flow.',
  },
};

/** Local fixtures only: no live payment components, network, storage or customer data. */
export default function PhonePaymentPreview() {
  const [language, setLanguage] = useState<PhonePaymentLanguage>('sv');
  const [path, setPath] = useState<PurchasePath>('entry');
  const [state, setState] = useState<PreviewState>('approved');
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTitle = useRef<HTMLHeadingElement>(null);
  const copy = COPY[language];
  const amountLabel = new Intl.NumberFormat(language === 'sv' ? 'sv-SE' : 'en-GB', {
    style: 'currency', currency: 'SEK', maximumFractionDigits: 0,
  }).format(path === 'entry' ? 200 : 20);

  const stopPlayback = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  };
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (state === 'safety') safetyTitle.current?.focus({ preventScroll: true });
  }, [state]);

  const show = (next: PreviewState) => { stopPlayback(); setState(next); };
  const play = () => {
    stopPlayback();
    setPlaying(true);
    setState('processing');
    // Illustrative demo delay only, never a real payment or synchronization deadline.
    timer.current = setTimeout(() => {
      timer.current = null;
      setPlaying(false);
      setState('approved');
      // No automatic transition to safety. Only the guest's button can continue.
    }, 1800);
  };
  const currentStep = state === 'safety' ? 3 : 2;
  const labels = copy.steps.map((label, index) => index === 0 && path === 'addon' ? copy.booking : label);

  return (
    <div className={styles.preview} lang={language}>
      <header className={styles.toolbar} aria-label={copy.preview}>
        <div className={styles.demoLabel}><strong>{copy.preview}</strong><span>{copy.disclaimer}</span></div>
        <button className={styles.play} type="button" onClick={play} disabled={playing}><Play size={16} aria-hidden="true" />{copy.play}</button>
        <details className={styles.settings}>
          <summary>{copy.controls}</summary>
          <div className={styles.controls}>
            <label>{copy.path}<select aria-label={copy.path} value={path} onChange={e => { setPath(e.target.value as PurchasePath); show('approved'); }}><option value="entry">{copy.entry}</option><option value="addon">{copy.addon}</option></select></label>
            <label>{copy.state}<select aria-label={copy.state} value={state} onChange={e => show(e.target.value as PreviewState)}>{STATES.map((value, index) => <option value={value} key={value}>{copy.names[index]}</option>)}<option value="safety" disabled>{copy.steps[3]}</option></select></label>
            <label>Språk / Language<select aria-label="Språk / Language" value={language} onChange={e => { stopPlayback(); setLanguage(e.target.value as PhonePaymentLanguage); }}><option value="sv">Svenska</option><option value="en">English</option></select></label>
          </div>
        </details>
      </header>

      <div className={styles.guest} data-preview-guest="true" data-preview-state={state}>
        <nav className={styles.progress} aria-label={copy.progress}>
          <div className={styles.track}><div style={{ width: `${currentStep / 4 * 100}%` }} /></div>
          <ol className={styles.steps}>
            {labels.map((label, index) => (
              <li key={label} data-step={index < currentStep ? 'complete' : index === currentStep ? 'current' : 'future'} aria-current={index === currentStep ? 'step' : undefined}>
                <div className={styles.node}><JumpyardIcon name={index === 0 && path === 'addon' ? 'booking-card' : ICONS[index]} className={styles.progressIcon} /></div>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </nav>

        <main className={styles.stage}>
          {state === 'approved' ? (
            <PhonePaymentConfirmation language={language} amountLabel={amountLabel} onContinueToSafety={() => show('safety')} />
          ) : state === 'safety' ? (
            <section className={styles.message} aria-labelledby="preview-safety-title">
              <JumpyardIcon name="safety-check" className={styles.messageIcon} />
              <h1 ref={safetyTitle} tabIndex={-1} id="preview-safety-title">{copy.safety}</h1>
              <p className={styles.simulationNote}>{copy.safetyNote}</p>
            </section>
          ) : (
            <section className={styles.message} role="status" aria-live="polite" aria-atomic="true">
              <JumpyardIcon name={state === 'processing' ? 'payment-card' : 'warning-transparent'} className={styles.messageIcon} />
              <h1>{state === 'processing' ? copy.processing : state === 'declined' ? copy.declined : copy.unknown}</h1>
              {state === 'processing' ? <><p className={styles.pendingAmount}>{amountLabel}</p><p className={styles.waiting}><Loader2 className={styles.spinner} aria-hidden="true" />{copy.waiting}</p></> : <p>{state === 'declined' ? copy.declinedBody : copy.unknownBody}</p>}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
