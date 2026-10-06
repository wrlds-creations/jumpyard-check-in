'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { BookingSummary } from '@/components/BookingSummary';
import { PhoneCompletion, type CompletionGroup, type CompletionItem, type CompletionPresence } from '@/components/PhoneCompletion';
import type { SessionIssue } from '@/flow/cloudClient';
import type { Booking } from '@/flow/types';
import { LanguageProvider, useTranslation, type Language } from '@/context/LanguageContext';
import { PREVIEW_BAND_COLOURS as BAND } from '../completion/bandFixtures';
import styles from './preview.module.css';

// GH-453/GH-456 (decided with Gustav 2026-10-06): one booking (Sat 17 Oct 14:00–15:00, Weekday Combo
// for two, 2 socks, 2 coffee) through the visit day. A completed check-in counts as checked in, the
// phone shows only the number, and check-in opens two hours before the start. Example data only.
type Cafe = 'none' | 'pizza' | 'all';
interface Frame {
    id: string; sv: string; en: string; tags: string[];
    kind: 'completion' | 'window';
    presence?: CompletionPresence; checkedInAt?: string; cafe?: Cafe; issue?: SessionIssue;
}
const FRAMES: Frame[] = [
    { id: 'hemma', sv: 'Incheckad hemma via mejllänken, 12:10', en: 'Checked in at home via the email link, 12:10', tags: ['#456', '#453'],
        kind: 'completion', presence: 'arrived', checkedInAt: '12:10', cafe: 'none' },
    { id: 'igen', sv: 'Öppnad igen 16:30, pizzan hämtad', en: 'Reopened at 16:30, pizza collected', tags: ['#453'],
        kind: 'completion', presence: 'arrived', checkedInAt: '12:10', cafe: 'pizza' },
    { id: 'allt', sv: '17:10, allt i caféet hämtat', en: '17:10, everything at the café collected', tags: ['#453'],
        kind: 'completion', presence: 'arrived', checkedInAt: '12:10', cafe: 'all' },
    { id: 'tidigt', sv: 'Försöker checka in 11:30: för tidigt', en: 'Tries to check in at 11:30: too early', tags: ['#456'],
        kind: 'window', issue: 'checkin_too_early' },
    { id: 'sent', sv: 'Försöker checka in 15:10: passet är slut', en: 'Tries to check in at 15:10: the session has ended', tags: ['#456'],
        kind: 'window', issue: 'checkin_too_late' },
    { id: 'dagen-efter', sv: 'Dagen efter', en: 'The day after', tags: ['#453'],
        kind: 'completion', presence: 'ended' },
];

const LABELS = {
    sv: { band: 'Besöksband 60 min', socks: 'Strumpor', pizza: 'Pizza att dela', coffee: 'Kaffe', day: 'lördag 17 oktober' },
    en: { band: 'Wristband 60 min', socks: 'Jump socks', pizza: 'Pizza to share', coffee: 'Coffee', day: 'Saturday 17 October' },
};

const PREVIEW_BOOKING: Booking = {
    id: 'DESIGN-PREVIEW', jumpers: 2, products: 1, paid: true, time: '14:00', endTime: '15:00', durationMinutes: 60,
    productLabel: 'Weekday Combo', productType: 'combo', bandColours: [{ ...BAND['15:00'], quantity: 2 }],
    admissionItems: [{ label: 'Weekday Combo', quantity: 1, bandColour: BAND['15:00'], packageContents: [
        { kind: 'admission', quantity: 2, collection: 'checkin', durationMinutes: 60 },
        { kind: 'pizza', quantity: 1, collection: 'later' },
    ] }],
};

function stationItems(lang: Language): CompletionItem[] {
    const l = LABELS[lang];
    return [
        { icon: 'visitor-wristband', label: l.band, qty: 2, detail: 'Weekday Combo', bandColours: [{ ...BAND['15:00'], quantity: 2 }] },
        { icon: 'grip-socks', label: l.socks, qty: 2 },
    ];
}

function cafeGroup(lang: Language, cafe: Cafe): CompletionGroup {
    const l = LABELS[lang];
    const pizzaCollected = cafe === 'none' ? 0 : 1;
    const coffeeCollected = cafe === 'all' ? 2 : 0;
    return { key: 'later', title: '', items: [
        { icon: 'combo-pizza', label: l.pizza, qty: 1 - pizzaCollected, collected: pizzaCollected, detail: 'Weekday Combo' },
        { icon: 'drink-cup', label: l.coffee, qty: 2 - coffeeCollected, collected: coffeeCollected },
    ] };
}

export default function DayPreview() { return <LanguageProvider><Preview /></LanguageProvider>; }

function Preview() {
    const { lang, setLang } = useTranslation();
    const [width, setWidth] = useState(390);
    const [only, setOnly] = useState<string | null>(null);
    // ?full=1&frame=hemma opens one frame as a full phone screen (for a real phone).
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const frame = query.get('frame');
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
        if (query.get('full') === '1' && FRAMES.some(candidate => candidate.id === frame)) setOnly(frame);
    }, []);
    const frames = only ? FRAMES.filter(frame => frame.id === only) : FRAMES;

    const renderFrame = (frame: Frame) => {
        if (frame.kind === 'window') return <BookingSummary booking={PREVIEW_BOOKING} onContinue={() => undefined}
            sessionStartError={frame.issue ?? null} />;
        return <PhoneCompletion lang={lang} onLanguageChange={setLang} handoffCode="0427"
            handoffPayload="JY_HANDOFF:0427:local-design-preview-not-a-real-session" sessionId="local-design-preview"
            handoffStatus="ready_for_staff" channel="sms" presence={frame.presence} checkedInAt={frame.checkedInAt}
            handoffDay="2026-10-17" visitDayLabel={LABELS[lang].day}
            items={stationItems(lang)} groups={[cafeGroup(lang, frame.cafe ?? 'none')]}
            onStartOver={() => undefined} />;
    };

    return <div className={styles.page} data-full={only ? 'true' : undefined}>
        {!only && <header className={styles.header}>
            <p className={styles.kicker}>LOKAL FÖRHANDSVISNING · #453 + #456</p>
            <h1>{lang === 'sv' ? 'Incheckad är incheckad. Samma nummer hela dagen.' : 'Checked in is checked in. One number all day.'}</h1>
            <p>{lang === 'sv'
                ? 'En bokning lördag 17 okt 14:00–15:00 (Weekday Combo för två, 2 strumpor, 2 kaffe). Incheckning går från 12:00 till 15:00, och Cloud checkar in i ROLLER automatiskt. Exempeldata, numret fungerar inte.'
                : 'One booking on Sat 17 Oct 14:00–15:00 (Weekday Combo for two, 2 socks, 2 coffee). Check-in is open 12:00–15:00 and Cloud admits in ROLLER automatically. Example data, the number does not work.'}</p>
            <div className={styles.controls}>
                <div role="group" aria-label="Språk">{(['sv', 'en'] as const).map(value =>
                    <button type="button" key={value} aria-pressed={lang === value} onClick={() => setLang(value)}>{value.toUpperCase()}</button>)}</div>
                <div role="group" aria-label="Telefonbredd">{[320, 390, 430].map(value =>
                    <button type="button" key={value} aria-pressed={width === value} onClick={() => setWidth(value)}>{value} px</button>)}</div>
            </div>
        </header>}
        <div className={styles.grid}>
            {frames.map((frame, index) => <figure key={frame.id} className={styles.frame} data-frame={frame.id}
                style={{ '--phone-width': `${width}px` } as CSSProperties}>
                {!only && <figcaption><span className={styles.step}>{index + 1}</span>{frame[lang]}
                    <span className={styles.tags}>{frame.tags.map(tag => <span key={tag}>{tag}</span>)}</span></figcaption>}
                <div className={styles.viewport} lang={lang}>
                    {renderFrame(frame)}
                </div>
            </figure>)}
        </div>
    </div>;
}
