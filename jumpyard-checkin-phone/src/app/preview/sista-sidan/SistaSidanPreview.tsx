'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LanguageProvider, useTranslation, type Language } from '@/context/LanguageContext';
import { FlowMotion } from '@/components/FlowTransition';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import type { Addon, Booking, CheckInSession, GuestCafeItem } from '@/flow/types';
import { stockholmToday } from '@/flow/phoneCompletion';
import { PREVIEW_BAND_COLOURS as BAND } from '../completion/bandFixtures';
import styles from '../workshop/preview.module.css';

// #504 localhost review (Love, 2026-10-12, "A lättare"): the real last page, one frame per case, in
// Swedish and English at 375 x 812. Bookings, numbers and café lines are local examples. Nothing reaches
// Park, Live or ROLLER, and no booking, payment or session is created. #519 (Love, 2026-10-13): the hero
// shows the jump time under the number. The first two frames are the "2 timmar för 1" deal, and the third
// is the page the kiosk's "Lappen i mobilen" QR opens (the same last page, on site).
type FrameId = 'deal' | 'deal-hemma' | 'kiosk-lank' | 'plats' | 'hemma' | 'bara-band' | 'blandat' | 'cafe-delvis' | 'cafe-klart' | 'combo' | 'slut';

const FRAMES: { id: FrameId; sv: string; en: string }[] = [
    { id: 'deal', sv: '2 timmar för 1, köpt på plats (skylten): hopptid 15:00–17:00', en: '2 hours for 1, bought on site (the sign): jump time 15:00–17:00' },
    { id: 'deal-hemma', sv: '2 timmar för 1, öppnad hemma (mejllänken)', en: '2 hours for 1, opened at home (the email link)' },
    { id: 'kiosk-lank', sv: 'Kioskens "Lappen i mobilen": 90 min, hopptid 15:00–16:30', en: 'The kiosk\'s "Lappen i mobilen": 90 min, jump time 15:00–16:30' },
    { id: 'plats', sv: 'På plats (skylten): strumpor, band och tillbehör, vatten och kaffe', en: 'On site (the sign): socks, bands and extras, water and coffee' },
    { id: 'hemma', sv: 'Hemma (mejllänken): samma köp, gå förbi kassan', en: 'At home (the email link): the same purchase, skip the till' },
    { id: 'bara-band', sv: 'Bara band: inga strumpor, inga tillägg', en: 'Bands only: no socks, no extras' },
    { id: 'blandat', sv: 'Två bandfärger, strumpor och hänglås', en: 'Two band colours, socks and padlocks' },
    { id: 'cafe-delvis', sv: 'Caféet delvis hämtat', en: 'The café partly collected' },
    { id: 'cafe-klart', sv: 'Allt i caféet hämtat', en: 'Everything at the café collected' },
    { id: 'combo', sv: 'Weekday Combo: band och pizza', en: 'Weekday Combo: bands and pizza' },
    { id: 'slut', sv: 'Dagen efter: besöket är avslutat', en: 'The day after: the visit is over' },
];

const PREVIEW_CSS = 'nextjs-portal { display: none !important; }';

interface Case { booking: Booking; addons: Addon[]; session: CheckInSession; onSite: boolean; receiptSent: boolean; channel: 'park-qr' | 'sms' }

function entry(lang: Language, minutes: number, jumpers: number, endTime: keyof typeof BAND, extra: Partial<Booking> = {}): Booking {
    return { id: 'DEMO504', jumpers, time: '14:00', endTime, durationMinutes: minutes, products: 1, paid: true, productType: 'entry',
        productLabel: lang === 'sv' ? `${minutes} min entré` : `${minutes} min entry`, bandColours: [{ ...BAND[endTime], quantity: jumpers }], ...extra };
}

/** #519: two "2 timmar för 1" tickets at 15:00, 120 minutes each, so both bands are for 17:00 (GH-514). */
function deal(): Booking {
    return { id: 'DEMO519', jumpers: 2, time: '15:00', endTime: '17:00', durationMinutes: 120, products: 1, paid: true, productType: 'deal',
        productLabel: '2 timmar för 1', bandColours: [{ ...BAND['17:00'], quantity: 2 }] };
}

function session(extra: Partial<CheckInSession> = {}): CheckInSession {
    return { checkinSessionId: 'local-preview-504-not-a-real-session', status: 'ready_for_staff', handoffStatus: 'ready_for_staff',
        handoffCode: '0042', handoffDay: stockholmToday(), checkedInAt: '13:52', safetyStatus: 'completed', cafe: null, ...extra };
}

const cafeLine = (id: string, kind: string, name: string, quantity: number, collected: number): GuestCafeItem =>
    ({ id, kind, name, detail: null, quantity, collected, remaining: quantity - collected });

function exampleCase(frame: FrameId, lang: Language): Case {
    const sv = lang === 'sv';
    const shopping: Addon[] = [
        { id: 'socks', label: sv ? 'Strumpor' : 'Socks', qty: 2, price: 49 },
        { id: 'lock', label: sv ? 'Hänglås' : 'Padlock', qty: 1, price: 45 },
        { id: 'skyrider', label: 'SkyRider', qty: 1, price: 40 },
        { id: 'water_bottle', label: sv ? 'Vatten' : 'Water', qty: 1, price: 20 },
        { id: 'coffee', label: 'Bryggkaffe', qty: 2, price: 35 },
    ];
    const base = { onSite: true, receiptSent: true, channel: 'park-qr' as const };
    const socks: Addon[] = [{ id: 'socks', label: sv ? 'Strumpor' : 'Socks', qty: 2, price: 49 }];
    switch (frame) {
        case 'deal':
            return { ...base, booking: deal(), addons: socks, session: session({ checkedInAt: '14:41' }) };
        case 'deal-hemma':
            return { ...base, onSite: false, receiptSent: false, channel: 'sms', booking: deal(), addons: socks, session: session({ checkedInAt: '13:20' }) };
        case 'kiosk-lank':
            // The kiosk link is a guest link (channel sms) that Cloud marks as on site (`arrival: 'kiosk'`); the guest paid at the kiosk.
            return { ...base, receiptSent: false, channel: 'sms', booking: entry(lang, 90, 2, '16:30', { time: '15:00' }), addons: socks,
                session: session({ checkedInAt: '14:52' }) };
        case 'hemma':
            return { ...base, onSite: false, receiptSent: false, channel: 'sms', booking: entry(lang, 90, 2, '15:30'), addons: shopping, session: session() };
        case 'bara-band':
            return { ...base, booking: entry(lang, 60, 1, '15:00', { endTime: '15:00' }), addons: [], session: session() };
        case 'blandat':
            return { ...base, booking: entry(lang, 90, 3, '13:00', { time: '11:30', bandColours: [{ ...BAND['13:00'], quantity: 2 }, { ...BAND['12:30'], quantity: 1 }] }),
                addons: [{ id: 'socks', label: sv ? 'Strumpor' : 'Socks', qty: 3, price: 49 }, { id: 'lock', label: sv ? 'Hänglås' : 'Padlock', qty: 2, price: 45 }],
                session: session() };
        case 'cafe-delvis':
            return { ...base, receiptSent: false, booking: entry(lang, 90, 2, '15:30'), addons: shopping,
                session: session({ cafe: [cafeLine('water-1', 'water', 'JumpYard Vatten', 1, 1), cafeLine('coffee-1', 'coffee', 'Bryggkaffe', 2, 1)] }) };
        case 'cafe-klart':
            return { ...base, receiptSent: false, booking: entry(lang, 90, 2, '15:30'), addons: shopping,
                session: session({ cafe: [cafeLine('water-1', 'water', 'JumpYard Vatten', 1, 1), cafeLine('coffee-1', 'coffee', 'Bryggkaffe', 2, 2)] }) };
        case 'combo':
            return { ...base, addons: [], session: session(), booking: {
                id: 'DEMO504', jumpers: 2, time: '14:00', endTime: '15:00', durationMinutes: 60, products: 1, paid: true,
                productLabel: 'Weekday Combo', productType: 'combo', bandColours: [{ ...BAND['15:00'], quantity: 2 }],
                admissionItems: [{ label: 'Weekday Combo', quantity: 2, durationMinutes: 60, bandColour: BAND['15:00'], packageContents: [
                    { kind: 'admission', quantity: 2, collection: 'checkin', durationMinutes: 60 },
                    { kind: 'pizza', quantity: 1, collection: 'later' },
                ] }] } };
        case 'slut':
            return { ...base, receiptSent: false, booking: entry(lang, 90, 2, '15:30'), addons: shopping,
                session: session({ status: 'redeemed', handoffDay: '2026-10-11' }) };
        default:
            return { ...base, booking: entry(lang, 90, 2, '15:30'), addons: shopping, session: session() };
    }
}

export default function SistaSidanPreview() {
    return <LanguageProvider><Preview /></LanguageProvider>;
}

function Preview() {
    const [mode, setMode] = useState<{ frame: FrameId | null; ready: boolean }>({ frame: null, ready: false });
    const { setLang } = useTranslation();
    const languageApplied = useRef(false);

    useEffect(() => {
        const frame = FRAMES.find((candidate) => candidate.id === new URLSearchParams(window.location.search).get('frame'))?.id ?? null;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
        setMode({ frame, ready: true });
    }, []);

    // The frame's language comes from the query once; the guest's own toggle works after that.
    useEffect(() => {
        if (languageApplied.current) return;
        languageApplied.current = true;
        const lang = new URLSearchParams(window.location.search).get('lang');
        if (lang === 'sv' || lang === 'en') setLang(lang);
    }, [setLang]);

    if (!mode.ready) return <p className={styles.loading}>Öppnar lokal förhandsvisning…</p>;
    if (mode.frame) return <FrameScreen frame={mode.frame} />;
    return <Overview />;
}

function PhoneShell({ children }: { children: ReactNode }) {
    return <FlowMotion>
        <style>{PREVIEW_CSS}</style>
        <main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground">
            <div className="phone-flow z-10 w-full max-w-lg min-w-0 flex flex-col items-center">
                <div className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">{children}</div>
            </div>
        </main>
    </FlowMotion>;
}

function FrameScreen({ frame }: { frame: FrameId }) {
    const { lang } = useTranslation();
    const example = exampleCase(frame, lang);
    return <PhoneShell>
        <ConfirmationScreen booking={example.booking} checkinSession={example.session} jumperCount={example.booking.jumpers}
            selectedAddons={example.addons} channel={example.channel} receiptSent={example.receiptSent} onSite={example.onSite}
            onStartOver={example.channel === 'park-qr' ? () => undefined : undefined} />
    </PhoneShell>;
}

function Overview() {
    const { lang } = useTranslation();
    const sv = lang === 'sv';
    const langs: Language[] = ['sv', 'en'];
    return <div className={styles.page}>
        <header className={styles.header}>
            <p className={styles.kicker}>LOKAL FÖRHANDSVISNING · #504 · #519</p>
            <h1>{sv ? 'Sista sidan: väg i tre steg.' : 'The last page: a route in three steps.'}</h1>
            <p>{sv ? 'Riktiga sidan med lokala exempel. Inget når Park, Live eller ROLLER.' : 'The real page with local examples. Nothing reaches Park, Live or ROLLER.'}</p>
        </header>
        {langs.map((frameLang) => <section key={frameLang} className={styles.row} aria-label={frameLang === 'sv' ? 'Svenska' : 'English'}>
            <h2>{frameLang === 'sv' ? 'Svenska' : 'English'}</h2>
            <div className={styles.grid}>
                {FRAMES.map((frame, index) => <figure key={frame.id} className={styles.frame}>
                    <div className={styles.phone}>
                        <iframe title={`${index + 1}. ${frame[frameLang]}`} src={`?frame=${frame.id}&lang=${frameLang}`} loading="lazy" />
                    </div>
                    <figcaption><b>{index + 1}.</b> {frame[frameLang]} <a href={`?frame=${frame.id}&lang=${frameLang}`} target="_blank" rel="noreferrer">{sv ? 'Öppna' : 'Open'}</a></figcaption>
                </figure>)}
            </div>
        </section>)}
    </div>;
}
