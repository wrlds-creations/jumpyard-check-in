'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';
import type { Booking, CheckInSession } from '@/flow/types';
import { PREVIEW_BAND_COLOURS as BAND, PREVIEW_PHONE_COMBO_PURCHASE } from './bandFixtures';
import styles from './completion.module.css';

// GH-459: example bookings with the band colours Cloud sends for their end times.
const EXAMPLES = [
    { id: 'standard', label: '1 × 60 min kl 14:00 med strumpor och vattenflaska (Svart/Röd)' },
    { id: 'combo', label: 'Combo kl 14:00: 2 entréer och 1 pizza (Svart/Röd)' },
    { id: 'buy-combo', label: 'Combo köpt i mobilen kl 12:00: 2 band och 1 pizza (Mörkblå)' },
    { id: 'b90', label: '3 × 90 min kl 11:30, slutar 13:00 (Mörkblå)' },
    { id: 'b120', label: '2 × 120 min kl 13:30, slutar 15:30 (Gul)' },
    { id: 'mixed', label: '2 × 90 min + 1 × 60 min kl 11:30 (Mörkblå och Röd)' },
    { id: 'none', label: '1 × 60 min kl 19:30, slutar 20:30 (ingen färg)' },
] as const;
type Example = typeof EXAMPLES[number]['id'];

function exampleBooking(example: Example, entry: (minutes: number) => string): Booking {
    const base = { id: 'DESIGN-PREVIEW', products: 1, paid: true, productType: 'entry' as const };
    switch (example) {
        case 'buy-combo': return { ...base, ...PREVIEW_PHONE_COMBO_PURCHASE };
        case 'combo': return { ...base, jumpers: 2, time: '14:00', endTime: '15:00', durationMinutes: 60, productLabel: 'Weekday Combo',
            productType: 'combo', bandColours: [{ ...BAND['15:00'], quantity: 2 }],
            admissionItems: [{ label: 'Weekday Combo', quantity: 1, bandColour: BAND['15:00'], packageContents: [
                { kind: 'admission', quantity: 2, collection: 'checkin', durationMinutes: 60 },
                { kind: 'pizza', quantity: 1, collection: 'later' },
            ] }] };
        case 'b90': return { ...base, jumpers: 3, time: '11:30', endTime: '13:00', durationMinutes: 90, productLabel: entry(90),
            bandColours: [{ ...BAND['13:00'], quantity: 3 }] };
        case 'b120': return { ...base, jumpers: 2, time: '13:30', endTime: '15:30', durationMinutes: 120, productLabel: entry(120),
            bandColours: [{ ...BAND['15:30'], quantity: 2 }] };
        case 'mixed': return { ...base, jumpers: 3, time: '11:30', endTime: '13:00', durationMinutes: 90, productLabel: entry(90),
            bandColours: [{ ...BAND['13:00'], quantity: 2 }, { ...BAND['12:30'], quantity: 1 }] };
        case 'none': return { ...base, jumpers: 1, time: '19:30', endTime: '20:30', durationMinutes: 60, productLabel: entry(60) };
        default: return { ...base, jumpers: 1, time: '14:00', endTime: '15:00', durationMinutes: 60, productLabel: entry(60),
            bandColours: [{ ...BAND['15:00'], quantity: 1 }] };
    }
}

const COPY = {
    sv: {
        title: 'Du är incheckad', number: 'Ditt nummer',
        instruction: 'Visa numret eller QR-koden för personalen när du hämtar dina armband.',
        pickup: 'Att hämta ut', later: 'Hämta i caféet',
        entry: '60 min entré', socks: 'Strumpor', water: 'Vattenflaska', pizza: 'Pizza att dela',
        another: 'Gör en ny bokning', qr: 'Förstora QR-kod', close: 'Stäng',
        homeTitle: 'Redo för mer hopp?', homeNote: 'Här börjar en ny bokning i det riktiga flödet.',
        back: 'Tillbaka till slutsidan', cafe: 'Samma nummer och QR-kod gäller även i caféet.',
        enlarged: 'Visa för personalen',
    },
    en: {
        title: 'You are checked in', number: 'Your number',
        instruction: 'Show your number or QR code to our staff when collecting your wristbands.',
        pickup: 'To collect', later: 'Collect at the café',
        entry: '60 min entry', socks: 'Jump socks', water: 'Water bottle', pizza: 'Pizza to share',
        another: 'Make a new booking', qr: 'Enlarge QR code', close: 'Close',
        homeTitle: 'Ready for more jumping?', homeNote: 'A new booking starts here in the real flow.',
        back: 'Back to completion', cafe: 'Use the same number and QR code at the café.',
        enlarged: 'Show to our staff',
    },
};

/** An isolated design experiment. No API, payment, guest storage or live session. */
export default function CompletionPreview() { return <LanguageProvider><Preview /></LanguageProvider>; }
function Preview() {
    const { lang } = useTranslation();
    const [width, setWidth] = useState(390);
    const [example, setExample] = useState<Example>('standard');
    const [home, setHome] = useState(false);
    const [variant, setVariant] = useState('ready');
    const t = COPY[lang];
    // A link such as ?example=b90 opens one example directly.
    useEffect(() => {
        const requested = new URLSearchParams(window.location.search).get('example');
        const match = EXAMPLES.find((candidate) => candidate.id === requested);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
        if (match) setExample(match.id);
    }, []);
    const booking = exampleBooking(example, (minutes) => lang === 'sv' ? `${minutes} min entré` : `${minutes} min entry`);
    const session: CheckInSession = { checkinSessionId: 'local-design-preview-not-a-real-session', status: variant === 'completed' ? 'completed' : 'ready_for_staff',
        handoffStatus: variant === 'completed' ? 'completed' : 'ready_for_staff', handoffCode: variant === 'missing' ? '' : variant === 'legacy' ? 'ABCDEFGHIJKLMN0123456789' : '0001',
        handoffDay: variant === 'dated' ? '2026-09-22' : undefined };

    return <div className={styles.preview}>
        <aside className={styles.tools} aria-label="Förhandsvisningsinställningar">
            <p className={styles.kicker}>LOKAL FÖRHANDSVISNING</p>
            <h2>Kioskens slutsida.<br />Nu i telefonen.</h2>
            <p>Samma röda yta, stora nummer och tydliga lista. QR-koden följer med på skärmen.</p>
            <fieldset><legend>Telefonbredd</legend><div className={styles.widths}>
                {[320, 390, 430].map(value => <button type="button" key={value} aria-pressed={width === value} onClick={() => setWidth(value)}>{value} px</button>)}
            </div></fieldset>
            <label className={styles.selectLabel}>Exempelbokning<select value={example} onChange={event => setExample(event.target.value as Example)}>
                {EXAMPLES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select></label>
            <label className={styles.selectLabel}>Session<select value={variant} onChange={event => setVariant(event.target.value)}>
                <option value="ready">Redo</option><option value="dated">Med utfärdandedatum</option><option value="legacy">Äldre lång kod</option>
                <option value="missing">Nummer saknas</option><option value="completed">Redan incheckad</option><option value="sms">Länk före besöket</option>
            </select></label>
            <p className={styles.note}>Exempeldata för designgranskning. Numret och QR-koden kan inte användas för incheckning.</p>
        </aside>

        <div className={styles.viewport} style={{ '--phone-width': `${width}px` } as CSSProperties} data-testid="phone-preview" lang={lang}>
            {home ? <section className={styles.home}>
                <JumpyardIcon name="trampoline-jump" className={styles.homeIcon} />
                <h1>{t.homeTitle}</h1><p>{t.homeNote}</p>
                <button type="button" onClick={() => setHome(false)}>{t.back}</button>
            </section> : <ConfirmationScreen booking={booking} checkinSession={session} jumperCount={booking.jumpers}
                selectedAddons={example !== 'standard' ? [] : [{ id: 'socks', label: t.socks, qty: 1, price: 45 }, { id: 'water_bottle', label: t.water, qty: 1, price: 20 }]}
                channel={variant === 'sms' ? 'sms' : 'park-qr'} onStartOver={variant === 'sms' ? undefined : () => setHome(true)} />}

        </div>
    </div>;
}
