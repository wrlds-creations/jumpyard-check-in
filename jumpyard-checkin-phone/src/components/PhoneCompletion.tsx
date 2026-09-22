'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { JumpyardIcon, type JumpyardIconName } from './JumpyardIcon';
import { QrCode } from './QrCode';
import type { Language } from '@/context/LanguageContext';
import type { Channel } from '@/flow/types';
import styles from './PhoneCompletion.module.css';

export interface CompletionItem {
    icon: JumpyardIconName;
    label: string;
    qty: number;
    detail?: string;
    testId?: string;
}
export interface CompletionGroup { key: string; title: string; items: CompletionItem[] }
export interface PhoneCompletionProps {
    lang: Language;
    onLanguageChange: (lang: Language) => void;
    handoffCode: string;
    handoffPayload: string;
    handoffDay?: string | null;
    sessionId?: string;
    handoffStatus?: string | null;
    channel?: Channel;
    items: CompletionItem[];
    groups: CompletionGroup[];
    onStartOver?: () => void;
}

const COPY = {
    sv: {
        title: 'Du är incheckad', number: 'Ditt nummer',
        instruction: 'Visa numret eller QR-koden för personalen när du hämtar dina armband.',
        remoteInstruction: 'Visa numret eller QR-koden för personalen när du kommer till parken.',
        pickup: 'Att hämta ut', another: 'Gör en ny bokning', qr: 'Förstora QR-kod', close: 'Stäng',
        cafe: 'Samma nummer och QR-kod gäller även i caféet.', enlarged: 'Visa för personalen', issued: 'Nummer från',
    },
    en: {
        title: 'You are checked in', number: 'Your number',
        instruction: 'Show your number or QR code to our staff when collecting your wristbands.',
        remoteInstruction: 'Show your number or QR code to our staff when you arrive at the park.',
        pickup: 'To collect', another: 'Make a new booking', qr: 'Enlarge QR code', close: 'Close',
        cafe: 'Use the same number and QR code at the café.', enlarged: 'Show to our staff', issued: 'Number issued',
    },
};

/** Render only after the existing session is ready. This view never redeems or resets automatically. */
export function PhoneCompletion({ lang, onLanguageChange, handoffCode, handoffPayload, handoffDay, sessionId,
    handoffStatus, channel = 'park-qr', items, groups, onStartOver }: PhoneCompletionProps) {
    const [largeQr, setLargeQr] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const dialogTitle = useId();
    const t = COPY[lang];
    useEffect(() => {
        if (largeQr && dialog.current && !dialog.current.open) dialog.current.showModal();
    }, [largeQr]);
    const renderItems = (rows: CompletionItem[]) => rows.map((item, index) => <li key={`${item.label}-${index}`}>
        <JumpyardIcon name={item.icon} className={styles.itemIcon} />
        <span className={styles.itemLabel}><span data-testid={item.testId}>{item.label}</span>
            {item.detail && <span className={styles.itemDetail}>{item.detail}</span>}</span>
        <strong className={styles.quantity}>{item.qty}</strong>
    </li>);

    return <section className={styles.screen} data-phone-completion="true" data-testid="confirmation-screen" lang={lang}
        data-checkin-session-id={sessionId ?? ''} data-handoff-code={handoffCode} data-handoff-status={handoffStatus ?? ''}
        data-already-checked-in="false" data-confirmation-channel={channel}>
        <header className={styles.hero}>
            <button type="button" className={styles.language} aria-label={lang === 'sv' ? 'Switch to English' : 'Byt till svenska'}
                onClick={() => onLanguageChange(lang === 'sv' ? 'en' : 'sv')}>{lang.toUpperCase()}</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jumpyard-next-icons/success-check-on-red.png" className={styles.check} alt="" />
            <h1>{t.title}</h1><p className={styles.numberLabel}>{t.number}</p>
            <strong className={styles.number} data-long={handoffCode.length > 4} data-testid="ready-entry-number">{handoffCode}</strong>
        </header>
        <section className={styles.handoff} aria-label={t.enlarged} data-testid="ready-entry-handoff-card">
            <button type="button" className={styles.qrButton} onClick={() => setLargeQr(true)} aria-label={t.qr} aria-haspopup="dialog">
                <QrCode value={handoffPayload} className={styles.qr} testId="ready-entry-handoff-qr" />
            </button>
            <p className={styles.instruction} data-testid="confirmation-subtitle">{channel === 'sms' ? t.remoteInstruction : t.instruction}</p>
            {handoffDay && <p className={styles.issued}>{t.issued} {handoffDay}</p>}
        </section>
        <section className={styles.pickup} aria-label={t.pickup}>
            <h2><JumpyardIcon name="addons-bag" className={styles.bag} />{t.pickup}</h2>
            <ul>{renderItems(items)}</ul>
            {groups.map(group => <section key={group.key} data-testid={`confirmation-${group.key}`}>
                <h2 className={styles.laterTitle}>{group.title}</h2><ul>{renderItems(group.items)}</ul>
                {group.key === 'later' && <p className={styles.cafeNote}>{t.cafe}</p>}
            </section>)}
        </section>
        {onStartOver && <footer className={styles.footer}><button type="button" onClick={onStartOver}
            data-testid="confirmation-start-over">{t.another}</button></footer>}
        {largeQr && <dialog className={styles.dialog} ref={dialog} aria-labelledby={dialogTitle}
            onClose={() => setLargeQr(false)} onCancel={() => setLargeQr(false)}>
            <h2 id={dialogTitle}>{t.enlarged}</h2><strong data-long={handoffCode.length > 4}>{handoffCode}</strong>
            <QrCode value={handoffPayload} className={styles.enlargedQr} />
            <form method="dialog"><button autoFocus type="submit">{t.close}</button></form>
        </dialog>}
    </section>;
}
