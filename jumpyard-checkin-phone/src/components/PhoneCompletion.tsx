'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BandColours } from './BandColours';
import { JumpyardIcon, type JumpyardIconName } from './JumpyardIcon';
import { QrCode } from './QrCode';
import type { Language } from '@/context/LanguageContext';
import type { BandColourCount, Channel } from '@/flow/types';
import styles from './PhoneCompletion.module.css';

export interface CompletionItem {
    icon: JumpyardIconName;
    label: string;
    /** For café rows: what is still left to collect. */
    qty: number;
    /** GH-453: café quantity already handed out today (from Cloud). */
    collected?: number;
    detail?: string;
    testId?: string;
    /** GH-459: which band colour(s) to take for this row. */
    bandColours?: BandColourCount[];
}
export interface CompletionGroup { key: string; title: string; items: CompletionItem[] }
/** GH-453/GH-456: a completed check-in is checked in all visit day; after the day the visit is over. */
export type CompletionPresence = 'arrived' | 'ended';
export interface PhoneCompletionProps {
    lang: Language;
    onLanguageChange: (lang: Language) => void;
    handoffCode: string;
    handoffPayload: string;
    handoffDay?: string | null;
    sessionId?: string;
    handoffStatus?: string | null;
    channel?: Channel;
    presence?: CompletionPresence;
    /** When the guest became checked in (ISO time or HH:MM). */
    checkedInAt?: string | null;
    /** Visit day as words, shown when the visit is over. */
    visitDayLabel?: string | null;
    items: CompletionItem[];
    groups: CompletionGroup[];
    onStartOver?: () => void;
}

// GH-456 (Love and Gustav, 2026-10-06): the number is enough, so the phone shows no QR code.
// The JY_HANDOFF payload stays in Cloud and the staff app; flip this to bring the code back.
export const SHOW_PHONE_QR = false;

// Love, 2026-10-06: short words that say exactly what to do, in steps that jump out; no dashes.
const COPY = {
    sv: {
        arrived: 'Du är incheckad', ended: 'Besöket är avslutat', since: 'Sedan', number: 'Ditt nummer',
        instruction: 'Numret gäller hela dagen.',
        endedText: (code: string, day: string) => `Nummer ${code} gällde bara ${day}.`,
        station: 'Gå till stationen', stationHint: 'Ta det här:',
        cafeLater: 'Hämta i caféet', cafeLaterHint: 'Efter hoppet. Visa numret.',
        cafeLeft: 'Kvar i caféet', cafeLeftHint: 'Visa numret.',
        cafeDone: 'Allt i caféet är hämtat', collected: 'Hämtat',
        another: 'Gör en ny bokning', qr: 'Förstora QR-kod', close: 'Stäng', enlarged: 'Visa för personalen', issued: 'Nummer från',
    },
    en: {
        arrived: 'You are checked in', ended: 'Your visit is over', since: 'Since', number: 'Your number',
        instruction: 'Your number works all day.',
        endedText: (code: string, day: string) => `Number ${code} was only valid on ${day}.`,
        station: 'Go to the station', stationHint: 'Take this:',
        cafeLater: 'Collect at the café', cafeLaterHint: 'After jumping. Show your number.',
        cafeLeft: 'Left at the café', cafeLeftHint: 'Show your number.',
        cafeDone: 'Everything at the café is collected', collected: 'Collected',
        another: 'Make a new booking', qr: 'Enlarge QR code', close: 'Close', enlarged: 'Show to our staff', issued: 'Number issued',
    },
};

const STOCKHOLM_CLOCK = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });

/** "13:45" from an ISO time; an HH:MM value passes through. */
export function formatCheckedInAt(value?: string | null) {
    if (!value) return null;
    if (/^\d{1,2}:\d{2}$/.test(value)) return value;
    const time = new Date(value);
    return Number.isNaN(time.getTime()) ? null : STOCKHOLM_CLOCK.format(time);
}

/** Render only after the existing session is ready. This view never redeems or resets automatically. */
export function PhoneCompletion({ lang, onLanguageChange, handoffCode, handoffPayload, handoffDay, sessionId,
    handoffStatus, channel = 'park-qr', presence = 'arrived', checkedInAt, visitDayLabel, items, groups, onStartOver }: PhoneCompletionProps) {
    const [largeQr, setLargeQr] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const dialogTitle = useId();
    const t = COPY[lang];
    const since = formatCheckedInAt(checkedInAt);
    useEffect(() => {
        if (largeQr && dialog.current && !dialog.current.open) dialog.current.showModal();
    }, [largeQr]);
    const renderItems = (rows: CompletionItem[], cafe = false) => rows.map((item, index) => {
        const done = cafe && item.qty <= 0;
        return <li key={`${item.label}-${index}`} data-collected={done ? 'true' : undefined}>
            <JumpyardIcon name={item.icon} className={styles.itemIcon} />
            <span className={styles.itemLabel}><span data-testid={item.testId}>{item.label}</span>
                {item.detail && <span className={styles.itemDetail}>{item.detail}</span>}
                {cafe && !done && !!item.collected && <span className={styles.itemCollected}>{t.collected}: {item.collected}</span>}
                <BandColours colours={item.bandColours} lang={lang} total={item.qty} /></span>
            {done ? <span className={styles.collectedMark}>{t.collected}</span> : <strong className={styles.quantity}>{item.qty}</strong>}
        </li>;
    });
    const cafeStep = (group: CompletionGroup) => {
        if (group.items.every(item => item.qty <= 0)) return { tone: 'done', title: t.cafeDone, hint: null };
        return group.items.some(item => (item.collected ?? 0) > 0)
            ? { tone: 'cafe', title: t.cafeLeft, hint: t.cafeLeftHint }
            : { tone: 'cafe', title: t.cafeLater, hint: t.cafeLaterHint };
    };
    // Love, 2026-10-06: each next step is a big banner the guest cannot miss.
    const step = (icon: JumpyardIconName, title: string, hint: string | null, tone: string, testId: string) =>
        <h2 className={styles.step} data-tone={tone} data-testid={testId}>
            <span className={styles.stepIcon}><JumpyardIcon name={icon} className={styles.stepIconImage} /></span>
            <span className={styles.stepText}><span className={styles.stepTitle}>{title}</span>
                {hint && <span className={styles.stepHint}>{hint}</span>}</span>
        </h2>;

    return <section className={styles.screen} data-phone-completion="true" data-testid="confirmation-screen" lang={lang}
        data-checkin-session-id={sessionId ?? ''} data-handoff-code={handoffCode} data-handoff-status={handoffStatus ?? ''}
        data-already-checked-in="false" data-confirmation-channel={channel} data-presence={presence}>
        <header className={styles.hero} data-ended={presence === 'ended' ? 'true' : undefined}
            data-qr={SHOW_PHONE_QR ? undefined : 'false'}>
            <button type="button" className={styles.language} aria-label={lang === 'sv' ? 'Switch to English' : 'Byt till svenska'}
                onClick={() => onLanguageChange(lang === 'sv' ? 'en' : 'sv')}>{lang.toUpperCase()}</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {presence === 'arrived' && <img src="/jumpyard-next-icons/success-check-on-red.png" className={styles.check} alt="" />}
            <h1>{t[presence]}</h1>
            {presence === 'arrived' && since && <p className={styles.since} data-testid="checked-in-at">{t.since} {since}</p>}
            {presence === 'arrived' && <><p className={styles.numberLabel}>{t.number}</p>
                <strong className={styles.number} data-long={handoffCode.length > 4} data-testid="ready-entry-number">{handoffCode}</strong></>}
        </header>
        {presence === 'ended' ? <section className={styles.ended} data-testid="visit-ended">
            <p>{t.endedText(handoffCode, visitDayLabel ?? handoffDay ?? '')}</p>
        </section> : <>
            <section className={styles.handoff} aria-label={t.enlarged} data-testid="ready-entry-handoff-card"
                data-qr={SHOW_PHONE_QR ? undefined : 'false'}>
                {SHOW_PHONE_QR && <button type="button" className={styles.qrButton} onClick={() => setLargeQr(true)} aria-label={t.qr} aria-haspopup="dialog">
                    <QrCode value={handoffPayload} className={styles.qr} testId="ready-entry-handoff-qr" />
                </button>}
                <p className={styles.instruction} data-testid="confirmation-subtitle">{t.instruction}</p>
                {handoffDay && <p className={styles.issued}>{t.issued} {handoffDay}</p>}
            </section>
            <section className={styles.pickup} aria-label={t.station}>
                {step('addons-bag', t.station, t.stationHint, 'station', 'step-station')}
                <ul>{renderItems(items)}</ul>
                {groups.map(group => {
                    const cafe = group.key === 'later' ? cafeStep(group) : null;
                    return <section key={group.key} data-testid={`confirmation-${group.key}`}>
                        {cafe ? step('drink-cup', cafe.title, cafe.hint, cafe.tone, 'step-cafe')
                            : <h2 className={styles.laterTitle}>{group.title}</h2>}
                        <ul>{renderItems(group.items, group.key === 'later')}</ul>
                    </section>;
                })}
            </section>
        </>}
        {onStartOver && <footer className={styles.footer}><button type="button" onClick={onStartOver}
            data-testid="confirmation-start-over">{t.another}</button></footer>}
        {SHOW_PHONE_QR && largeQr && <dialog className={styles.dialog} ref={dialog} aria-labelledby={dialogTitle}
            onClose={() => setLargeQr(false)} onCancel={() => setLargeQr(false)}>
            <h2 id={dialogTitle}>{t.enlarged}</h2><strong data-long={handoffCode.length > 4}>{handoffCode}</strong>
            <QrCode value={handoffPayload} className={styles.enlargedQr} />
            <form method="dialog"><button autoFocus type="submit">{t.close}</button></form>
        </dialog>}
    </section>;
}
