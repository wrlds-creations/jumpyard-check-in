'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { JumpyardIcon, type JumpyardIconName } from './JumpyardIcon';
import { QrCode } from './QrCode';
import type { Language } from '@/context/LanguageContext';
import type { Channel } from '@/flow/types';
import { bandSwatchBackground } from '@/flow/bandColours';
import type { PickupGroup, PickupItem, PickupKind } from '@/flow/pickupPlaces';
import styles from './PhoneCompletion.module.css';

/** #491: one row to collect; the group says where (sock station, wristband desk, café). */
export type CompletionItem = PickupItem;
export type CompletionGroup = PickupGroup;
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
    /** #491: the places to collect things, in the order the guest meets them. */
    groups: CompletionGroup[];
    /** #491: the guest just paid, so ROLLER emails the receipt. */
    receiptSent?: boolean;
    /** #504: the guest is at JumpYard (the sign link or the kiosk's phone link), so the route says "now". */
    onSite?: boolean;
    /** #519: the booked jump, "15:00–16:30" (flow/jumpTime.ts), shown under the number like the kiosk's (kiosk #141). */
    jumpTime?: string | null;
    onStartOver?: () => void;
}

// GH-456 (Love and Gustav, 2026-10-06): the number is enough, so the phone shows no QR code.
// The JY_HANDOFF payload stays in Cloud and the staff app; flip this to bring the code back.
export const SHOW_PHONE_QR = false;

// #504 (Love, 2026-10-09 to 2026-10-12, "A lättare"): under the number, the page is a route the guest
// follows in order: 1 socks, 2 bands and accessories, 3 jump. Each step is a small place tag, a title
// and chips (icon, count, one word); the café comes after the route, whenever the guest likes. On site
// it says "now"; otherwise it says what to do on arrival, past the till. No grey and no sentences.
const COPY = {
    sv: {
        arrived: 'Du är incheckad', ended: 'Besöket är avslutat', since: 'Sedan', number: 'Ditt nummer', jumpTime: 'Hopptid',
        endedText: (code: string, day: string) => `Nummer ${code} gällde bara ${day}.`,
        pickup: 'Här hämtar ni',
        route: 'Gör så här nu', routeHome: 'När ni kommer till JumpYard',
        socksTag: 'Strumpstationen', socks: 'Hämta strumpor',
        bandsTag: 'Bandutlämningen · Visa numret', bands: 'Hämta band', bandsExtras: 'Hämta band och tillbehör', extras: 'Hämta tillbehör',
        jump: 'Hoppa!',
        cafe: 'Caféet', cafeTag: 'När ni vill · Visa numret', cafeLeft: 'Kvar i caféet', cafeDone: 'Allt i caféet är hämtat',
        collected: 'Hämtat', band: 'Band',
        words: { admission: 'Band', socks: 'Strumpor', lock: 'Hänglås', skyrider: 'SkyRider', connected: 'Connected', water: 'Vatten', pizza: 'Pizza' },
        // #524 (Love 2026-10-13): "Det måste finnas ett verb där".
        receipt: 'Kvittot är skickat till din e-post',
        another: 'Gör en ny bokning', qr: 'Förstora QR-kod', close: 'Stäng', enlarged: 'Visa för personalen', issued: 'Nummer från',
    },
    en: {
        arrived: 'You are checked in', ended: 'Your visit is over', since: 'Since', number: 'Your number', jumpTime: 'Jump time',
        endedText: (code: string, day: string) => `Number ${code} was only valid on ${day}.`,
        pickup: 'Where to collect',
        route: 'What to do now', routeHome: 'When you arrive at JumpYard',
        socksTag: 'Sock station', socks: 'Get your socks',
        bandsTag: 'Wristband desk · Show your number', bands: 'Get your bands', bandsExtras: 'Get bands and extras', extras: 'Get your extras',
        jump: 'Jump!',
        cafe: 'The café', cafeTag: 'Whenever you like · Show your number', cafeLeft: 'Left at the café', cafeDone: 'Everything at the café is collected',
        collected: 'Collected', band: 'Wristband',
        words: { admission: 'Wristband', socks: 'Socks', lock: 'Padlock', skyrider: 'SkyRider', connected: 'Connected', water: 'Water', pizza: 'Pizza' },
        receipt: 'Your receipt has been sent to your email',
        another: 'Make a new booking', qr: 'Enlarge QR code', close: 'Close', enlarged: 'Show to our staff', issued: 'Number from',
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

/** "lördag 17 oktober" for the visit day "2026-10-17"; null for anything else. */
export function formatNumberDay(day: string | null | undefined, lang: Language) {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const date = new Date(`${day}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(lang === 'sv' ? 'sv-SE' : 'en-GB',
        { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }).format(date);
}

/** #504: one chip: an icon, a count (or "Hämtat") and one word, with the band colour for entry bands. */
export interface CompletionChip {
    key: string;
    icon: JumpyardIconName;
    qty: number;
    word: string;
    swatch?: string[];
    colourId?: string;
    collected?: boolean;
    testId?: string;
}

/**
 * #504: the chips of one place. Entry bands are handed out by colour, so rows of the same colour
 * become one chip (2 × 90 min and 1 × 60 min ending at the same time are 3 of that band). A band
 * without a colour from Cloud is a plain "Band". Everything else keeps its order, with its one word.
 */
export function buildCompletionChips(items: PickupItem[], lang: Language): CompletionChip[] {
    const words = COPY[lang].words;
    const bands = new Map<string, CompletionChip>();
    const rest: CompletionChip[] = [];
    const addBand = (key: string, qty: number, word: string, swatch?: string[], colourId?: string) => {
        if (qty <= 0) return;
        const chip = bands.get(key);
        if (chip) chip.qty += qty;
        else bands.set(key, { key, icon: 'visitor-wristband', qty, word, swatch, colourId, testId: 'ready-entry-ticket-type' });
    };
    items.forEach((item, index) => {
        if (item.kind === 'admission') {
            let coloured = 0;
            for (const colour of item.bandColours ?? []) {
                addBand(`band-${colour.id}`, colour.quantity, colour.name[lang], colour.swatch, colour.id);
                coloured += colour.quantity;
            }
            addBand('band', item.qty - coloured, words.admission);
            return;
        }
        rest.push({ key: `${item.kind ?? 'item'}-${index}`, icon: item.icon, qty: item.qty,
            word: item.kind ? words[item.kind as Exclude<PickupKind, 'admission'>] : item.label,
            collected: item.qty <= 0 && (item.collected ?? 0) > 0 ? true : undefined });
    });
    return [...bands.values(), ...rest];
}

/** #504: "Hämta band" with bands only, "Hämta band och tillbehör" with padlocks, SkyRider or Connected too. */
export function bandsStepTitle(items: PickupItem[], lang: Language) {
    const t = COPY[lang];
    const bands = items.some((item) => item.kind === 'admission');
    const extras = items.some((item) => item.kind !== 'admission');
    return bands && extras ? t.bandsExtras : bands ? t.bands : t.extras;
}

/** Render only after the existing session is ready. This view never redeems or resets automatically. */
export function PhoneCompletion({ lang, onLanguageChange, handoffCode, handoffPayload, handoffDay, sessionId,
    handoffStatus, channel = 'park-qr', presence = 'arrived', checkedInAt, visitDayLabel, groups, receiptSent = false,
    onSite = false, jumpTime = null, onStartOver }: PhoneCompletionProps) {
    const [largeQr, setLargeQr] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const dialogTitle = useId();
    const t = COPY[lang];
    const since = formatCheckedInAt(checkedInAt);
    const numberDay = presence === 'arrived' ? formatNumberDay(handoffDay, lang) : null;
    useEffect(() => {
        if (largeQr && dialog.current && !dialog.current.open) dialog.current.showModal();
    }, [largeQr]);

    const renderChips = (items: PickupItem[]) => <ul className={styles.chips}>
        {buildCompletionChips(items, lang).map((chip) => <li key={chip.key} className={styles.chip}
            data-collected={chip.collected ? 'true' : undefined} data-band-colour={chip.colourId}>
            <span className={styles.chipTop}>
                <JumpyardIcon name={chip.icon} className={styles.chipIcon} />
                {chip.collected ? <span className={styles.chipCollected}>{t.collected}</span>
                    : <strong className={styles.chipCount}>{chip.qty}</strong>}
            </span>
            <span className={styles.chipWord} data-testid={chip.testId}>
                {chip.swatch && <span className={styles.swatch} style={{ background: bandSwatchBackground(chip.swatch) }} aria-hidden="true" />}
                {chip.word}
            </span>
        </li>)}
    </ul>;

    const steps = groups.filter((group) => group.key === 'socks' || group.key === 'bands');
    const cafe = groups.find((group) => group.key === 'later');
    const others = groups.filter((group) => group.key === 'other');
    const cafeDone = Boolean(cafe && cafe.items.every((item) => item.qty <= 0));
    const cafeTitle = !cafe ? '' : cafeDone ? t.cafeDone
        : cafe.items.some((item) => (item.collected ?? 0) > 0) ? t.cafeLeft : t.cafe;

    return <section className={styles.screen} data-phone-completion="true" data-testid="confirmation-screen" lang={lang}
        data-checkin-session-id={sessionId ?? ''} data-handoff-code={handoffCode} data-handoff-status={handoffStatus ?? ''}
        data-already-checked-in="false" data-confirmation-channel={channel} data-presence={presence}
        data-on-site={presence === 'arrived' ? String(onSite) : undefined}>
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
            {/* #519 (Love, 2026-10-13): when the jump starts and ends, as on the kiosk's last page. */}
            {presence === 'arrived' && jumpTime && <p className={styles.jumpTime} data-testid="completion-jump-time">{t.jumpTime} {jumpTime}</p>}
        </header>
        {presence === 'ended' ? <section className={styles.ended} data-testid="visit-ended">
            <p>{t.endedText(handoffCode, visitDayLabel ?? handoffDay ?? '')}</p>
        </section> : <>
            {SHOW_PHONE_QR && <section className={styles.handoff} aria-label={t.enlarged} data-testid="ready-entry-handoff-card">
                <button type="button" className={styles.qrButton} onClick={() => setLargeQr(true)} aria-label={t.qr} aria-haspopup="dialog">
                    <QrCode value={handoffPayload} className={styles.qr} testId="ready-entry-handoff-qr" />
                </button>
            </section>}
            <section className={styles.route} aria-label={t.pickup}>
                <h2 className={styles.routeTitle} data-testid="route-heading">{onSite ? t.route : t.routeHome}</h2>
                <ol className={styles.steps}>
                    {steps.map((group, index) => <li key={group.key} className={styles.step} data-step={group.key}
                        data-first={index === 0 ? 'true' : undefined} data-testid={`confirmation-${group.key}`}>
                        <span className={styles.dot} aria-hidden="true">{index + 1}</span>
                        <div className={styles.stepBody}>
                            <p className={styles.tag}>{group.key === 'socks' ? t.socksTag : t.bandsTag}</p>
                            <h3 className={styles.stepTitle} data-testid={`step-${group.key}`}>
                                {group.key === 'socks' ? t.socks : bandsStepTitle(group.items, lang)}</h3>
                            {renderChips(group.items)}
                        </div>
                    </li>)}
                    <li className={styles.step} data-step="jump" data-first={steps.length === 0 ? 'true' : undefined}>
                        <span className={styles.dot} aria-hidden="true">{steps.length + 1}</span>
                        <div className={styles.stepBody}><h3 className={styles.stepTitle} data-testid="step-jump">{t.jump}</h3></div>
                    </li>
                </ol>
            </section>
            {cafe && <section className={styles.cafe} data-testid="confirmation-later" data-tone={cafeDone ? 'done' : 'cafe'}>
                <h2 className={styles.cafeHead} data-testid="step-cafe">
                    <span className={styles.cafeTitle}>{cafeTitle}</span>
                    {!cafeDone && <span className={styles.cafeTag}>{t.cafeTag}</span>}
                </h2>
                {renderChips(cafe.items)}
            </section>}
            {others.map((group) => <section key={group.key} className={styles.other} data-testid={`confirmation-${group.key}`}>
                <h2 className={styles.otherTitle}>{group.title}</h2>
                {renderChips(group.items)}
            </section>)}
        </>}
        {(onStartOver || numberDay || (presence === 'arrived' && receiptSent)) && <footer className={styles.footer}>
            {presence === 'arrived' && receiptSent && <p className={styles.receipt} data-testid="receipt-sent">
                <JumpyardIcon name="email-confirmed" className={styles.receiptIcon} /><span>{t.receipt}</span>
            </p>}
            {onStartOver && <button type="button" onClick={onStartOver} data-testid="confirmation-start-over">{t.another}</button>}
            {numberDay && <p className={styles.issued} data-testid="number-issued" data-day={handoffDay ?? undefined}>{t.issued} {numberDay}</p>}
        </footer>}
        {SHOW_PHONE_QR && largeQr && <dialog className={styles.dialog} ref={dialog} aria-labelledby={dialogTitle}
            onClose={() => setLargeQr(false)} onCancel={() => setLargeQr(false)}>
            <h2 id={dialogTitle}>{t.enlarged}</h2><strong data-long={handoffCode.length > 4}>{handoffCode}</strong>
            <QrCode value={handoffPayload} className={styles.enlargedQr} />
            <form method="dialog"><button autoFocus type="submit">{t.close}</button></form>
        </dialog>}
    </section>;
}
