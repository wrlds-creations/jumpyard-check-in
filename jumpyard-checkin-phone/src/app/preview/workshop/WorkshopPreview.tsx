'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LanguageProvider, useTranslation, type Language } from '@/context/LanguageContext';
import { FlowMotion } from '@/components/FlowTransition';
import { ParkChoice } from '@/components/ParkChoice';
import { BuyTickets } from '@/components/BuyTickets';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PhonePaymentConfirmation } from '@/components/PhonePaymentConfirmation';
import type { JumpyardIconName } from '@/components/JumpyardIcon';
import type { Addon, Booking, CheckInSession } from '@/flow/types';
import { clearBuyFlowRecovery, type BuyFlowRecoverySnapshot } from '@/flow/buyFlowRecovery';
import { stockholmToday } from '@/flow/phoneCompletion';
import { installLocalTransport } from '../flow/localTransport';
import { PreviewPayment, PreviewProgress } from '../flow/PreviewPayment';
import { PREVIEW_BAND_COLOURS as BAND } from '../completion/bandFixtures';
import styles from './preview.module.css';

// #491 localhost review (workshop 2026-10-07): the real phone screens in the new order, one frame per
// changed state, in Swedish and English at 375 x 812. Start times, products and prices come from the
// local fixture in ../flow/localTransport.ts; payment is a local stand-in. Nothing reaches Park, Live
// or ROLLER, and no booking, payment or session is created.
type FrameId = 'start' | 'start-sparad' | 'starttid' | 'starttid-vald' | 'hopptid' | 'antal' | 'tillagg' | 'sakerhet'
    | 'kontakt' | 'sakerhet-tillbaka' | 'betalning' | 'klar-cafe' | 'klar-combo';

const FRAMES: { id: FrameId; sv: string; en: string }[] = [
    { id: 'start', sv: 'Startsidan utan sparad incheckning', en: 'Start page without a saved check-in' },
    { id: 'start-sparad', sv: 'Startsidan efter Gör en ny bokning: vägen tillbaka till 0042', en: 'Start page after Make a new booking: the way back to 0042' },
    { id: 'starttid', sv: 'Starttid: klockan, när varje tid börjar, platser kvar, få kvar och fullt', en: 'Start time: the clock, how soon each time starts, spots left, few left and full' },
    { id: 'starttid-vald', sv: 'Starttid: vald tid med få platser kvar', en: 'Start time: chosen time with few spots left' },
    { id: 'hopptid', sv: 'Hopptid: 90 min först och tydligast, även för familj', en: 'Jump time: 90 min first and strongest, family too' },
    { id: 'antal', sv: 'Antal hoppare och JumpSocks', en: 'Jumpers and JumpSocks' },
    { id: 'tillagg', sv: 'Tillägg: vattenflaskan Rekommenderas, inga strumpor', en: 'Add-ons: water bottle Recommended, no socks' },
    { id: 'sakerhet', sv: 'Säkerhet efter tilläggen, första gången', en: 'Safety after the add-ons, first time' },
    { id: 'kontakt', sv: 'Din kontakt med sammanställningen öppen', en: 'Your contact with the summary open' },
    { id: 'sakerhet-tillbaka', sv: 'Tillbaka från kontakt: godkännandet direkt, filmen kan spelas igen', en: 'Back from contact: the approval at once, the film can replay' },
    { id: 'betalning', sv: 'Betalning (lokal ersättare), klicka Godkänn', en: 'Payment (local stand-in), press Approve' },
    { id: 'klar-cafe', sv: 'Efter betalning: kvitto och tre ställen, vatten och kaffe i caféet', en: 'After payment: receipt and three places, water and coffee at the café' },
    { id: 'klar-combo', sv: 'Efter betalning: Weekday Combo, band och pizza', en: 'After payment: Weekday Combo, bands and pizza' },
];

const SLOT_TIMES = ['14:00', '14:30', '15:00'] as const;
// The local fixture's clock, so "om 18 min" matches the fixture's start times.
const PREVIEW_CLOCK = '13:42';
const PREVIEW_CSS = 'nextjs-portal { display: none !important; }';
const BUY_ICONS: JumpyardIconName[] = ['admission-ticket', 'addons-bag', 'safety-check', 'payment-card', 'success-check'];

// The 90-minute entry from the local fixture (id 1021, 230 kr).
const ENTRY_90 = { key: 'entry-90', productId: '1021', label: '90 min', startTime: '14:00', durationMinutes: 90, type: 'entry' as const, unitPrice: 230 };

function snapshot(step: BuyFlowRecoverySnapshot['currentFlowStep'], extra: Partial<BuyFlowRecoverySnapshot> = {}): BuyFlowRecoverySnapshot {
    const now = new Date().toISOString();
    return {
        version: 1, updatedAt: now, expiresAt: now, lastObservedAt: now, currentFlowStep: step, bookingReference: null,
        draftUniqueId: null, selectedStartTime: '14:00', selectedProduct: null, jumperCount: null, draftState: null, ...extra,
    };
}

function buySnapshot(frame: FrameId): BuyFlowRecoverySnapshot | null {
    const chosen = { selectedProduct: ENTRY_90, quantity: 2, jumperCount: 2 };
    switch (frame) {
        case 'starttid-vald': return snapshot('TIMESLOT', { selectedStartTime: '14:30' });
        case 'hopptid': return snapshot('PRODUCT');
        case 'antal': return snapshot('QUANTITY', { ...chosen, addonQty: { socks: 2 } });
        case 'tillagg': return snapshot('ADDONS', { ...chosen, addonQty: { socks: 2 } });
        // A purchase saved on the removed summary step opens safety, the step that follows the add-ons now.
        case 'sakerhet': return snapshot('REVIEW', { ...chosen, addonQty: { socks: 2, water_bottle: 1, coffee: 2 } });
        // What the guest sees on arrival: empty fields, the order open under them. The back frame starts
        // here too and taps Back once.
        case 'kontakt':
        case 'sakerhet-tillbaka': return snapshot('CONTACT', {
            ...chosen, addonQty: { socks: 2, water_bottle: 1, coffee: 2 }, safetyAttestedAt: new Date().toISOString(),
        });
        default: return null;
    }
}

function completionBooking(frame: 'klar-cafe' | 'klar-combo', lang: Language): { booking: Booking; addons: Addon[] } {
    if (frame === 'klar-combo') {
        return { addons: [], booking: {
            id: 'DEMO491', jumpers: 2, time: '14:00', endTime: '15:00', durationMinutes: 60, products: 1, paid: true,
            productLabel: 'Weekday Combo', productType: 'combo', bandColours: [{ ...BAND['15:00'], quantity: 2 }],
            admissionItems: [{ label: 'Weekday Combo', quantity: 2, durationMinutes: 60, bandColour: BAND['15:00'], packageContents: [
                { kind: 'admission', quantity: 2, collection: 'checkin', durationMinutes: 60 },
                { kind: 'pizza', quantity: 1, collection: 'later' },
            ] }],
        } };
    }
    const sv = lang === 'sv';
    return {
        booking: { id: 'DEMO491', jumpers: 2, time: '14:00', endTime: '15:30', durationMinutes: 90, products: 1, paid: true,
            productLabel: sv ? '90 min entré' : '90 min entry', productType: 'entry', bandColours: [{ ...BAND['15:30'], quantity: 2 }] },
        addons: [
            { id: 'socks', label: sv ? 'Strumpor' : 'Socks', qty: 2, price: 49 },
            { id: 'lock', label: sv ? 'Hänglås' : 'Padlock', qty: 1, price: 45 },
            { id: 'skyrider', label: 'SkyRider', qty: 1, price: 40 },
            { id: 'water_bottle', label: sv ? 'Vattenflaska' : 'Water bottle', qty: 1, price: 20 },
            { id: 'coffee', label: sv ? 'Bryggkaffe' : 'Filter coffee', qty: 2, price: 35 },
        ],
    };
}

function completionSession(): CheckInSession {
    // A fresh purchase: ready, today's number, and no café list from Cloud yet (the phone groups its own items).
    return { checkinSessionId: 'local-preview-491-not-a-real-session', status: 'ready_for_staff', handoffStatus: 'ready_for_staff',
        handoffCode: '0042', handoffDay: stockholmToday(), checkedInAt: '13:52', safetyStatus: 'completed', cafe: null };
}

export default function WorkshopPreview() {
    return <LanguageProvider><Preview /></LanguageProvider>;
}

function Preview() {
    const [mode, setMode] = useState<{ frame: FrameId | null; ready: boolean }>({ frame: null, ready: false });
    const { setLang } = useTranslation();
    const languageApplied = useRef(false);

    // The transport is installed once, before any guest screen mounts, and stays for the frame's life.
    // (A dependency on setLang would remove it for a moment on every language change.)
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const frame = FRAMES.find((candidate) => candidate.id === query.get('frame'))?.id ?? null;
        if (!frame) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
            setMode({ frame: null, ready: true });
            return;
        }
        const restore = installLocalTransport({ delay: () => 0, fail: () => false });
        clearBuyFlowRecovery();
        setMode({ frame, ready: true });
        return () => {
            restore();
            clearBuyFlowRecovery();
        };
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

function PhoneShell({ children, toggle = 'compact' }: { children: ReactNode; toggle?: 'full' | 'compact' | 'none' }) {
    return <FlowMotion>
        <style>{PREVIEW_CSS}</style>
        <main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground">
            <div className="phone-flow z-10 w-full max-w-lg min-w-0 flex flex-col items-center">
                {toggle !== 'none' && <LanguageToggle compact={toggle === 'compact'} className="absolute top-2 right-2 z-20" />}
                <div className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">{children}</div>
            </div>
        </main>
    </FlowMotion>;
}

function FrameScreen({ frame }: { frame: FrameId }) {
    const { lang, t } = useTranslation();
    const [snapshotForFrame] = useState(() => buySnapshot(frame));
    const [paid, setPaid] = useState<'pay' | 'preparing' | 'done'>('pay');
    const [resumed, setResumed] = useState(false);

    // Kontakt -> Back -> Säkerhet: once the contact step shows, tap the real Back button once.
    useEffect(() => {
        if (frame !== 'sakerhet-tillbaka') return;
        const timer = window.setInterval(() => {
            if (!document.querySelector('[data-testid="buy-contact-continue"]')) return;
            document.querySelector<HTMLButtonElement>('[data-testid="flow-back"]')?.click();
            window.clearInterval(timer);
        }, 200);
        return () => window.clearInterval(timer);
    }, [frame]);

    useEffect(() => {
        if (paid !== 'preparing') return;
        // The real phone needs about a second for Cloud's provisional number, then shows it.
        const id = window.setTimeout(() => setPaid('done'), 900);
        return () => window.clearTimeout(id);
    }, [paid]);

    if ((frame === 'start' || frame === 'start-sparad') && !resumed) {
        return <PhoneShell toggle="full"><ParkChoice onSelect={() => undefined}
            savedVisitCode={frame === 'start-sparad' ? '0042' : null}
            onResumeSavedVisit={frame === 'start-sparad' ? () => setResumed(true) : undefined} /></PhoneShell>;
    }

    if (frame === 'klar-cafe' || frame === 'klar-combo' || resumed || (frame === 'betalning' && paid === 'done')) {
        const { booking, addons } = completionBooking(frame === 'klar-combo' ? 'klar-combo' : 'klar-cafe', lang);
        return <PhoneShell toggle="none">
            <ConfirmationScreen booking={booking} checkinSession={completionSession()} jumperCount={booking.jumpers}
                selectedAddons={addons} channel="park-qr" receiptSent onStartOver={() => undefined} />
        </PhoneShell>;
    }

    if (frame === 'betalning') {
        const labels = [t.buyProgress.entry, t.buyProgress.addons, t.buyProgress.safety, t.buyProgress.payment, t.buyProgress.done];
        return <PhoneShell>
            <div className="w-full max-w-md min-w-0 mx-auto px-4">
                <PreviewProgress labels={labels} icons={BUY_ICONS} current={3} />
                {paid === 'pay'
                    ? <PreviewPayment language={lang} amountLabel="648 kr" onApproved={() => setPaid('preparing')} onEdit={() => undefined} />
                    : <div className="w-full px-2 py-5"><PhonePaymentConfirmation language={lang} amountLabel="648 kr"
                        preparationState="preparing" onContinueToSafety={() => undefined} /></div>}
            </div>
        </PhoneShell>;
    }

    return <PhoneShell>
        <BuyTickets key={frame} slotTimes={SLOT_TIMES} clockNow={PREVIEW_CLOCK} recoverySnapshot={snapshotForFrame} safetyBeforePayment
            inlineExitVisible onRequestExit={() => undefined} onBack={() => undefined} onBookingReady={async () => () => undefined} />
    </PhoneShell>;
}

function Overview() {
    const { lang, setLang } = useTranslation();
    const [langs, setLangs] = useState<Language[]>(['sv', 'en']);
    const sv = lang === 'sv';
    return <div className={styles.page}>
        <header className={styles.header}>
            <p className={styles.kicker}>LOKAL FÖRHANDSVISNING · #491 · WORKSHOP 7/10</p>
            <h1>{sv ? 'Enklare köpflöde i mobilen.' : 'A simpler phone purchase.'}</h1>
            <p>{sv
                ? 'Riktiga skärmar i den nya ordningen, med Loves ändringar från 8/10: vägen tillbaka till numret, klockan på starttid, 90 min först, JumpSocks vid antal hoppare, tillbaka från kontakt till säkerheten och lätta rubriker på slutsidan. Testdata och lokal betalning, inga anrop till Park, Live eller ROLLER.'
                : 'Real screens in the new order, with Love\'s changes from 8 October: the way back to the number, the clock on start time, 90 min first, JumpSocks with the jumpers, back from contact to safety and light headings on the completion page. Test data and a local payment, no calls to Park, Live or ROLLER.'}</p>
            <div className={styles.controls}>
                {(['sv', 'en'] as const).map((value) => <button key={value} type="button" aria-pressed={langs.length === 1 && langs[0] === value}
                    onClick={() => { setLangs([value]); setLang(value); }}>{value === 'sv' ? 'Svenska' : 'English'}</button>)}
                <button type="button" aria-pressed={langs.length === 2} onClick={() => setLangs(['sv', 'en'])}>{sv ? 'Båda' : 'Both'}</button>
                <a href="/preview/flow" target="_blank" rel="noreferrer">{sv ? 'Klicka igenom hela flödet' : 'Click through the whole flow'}</a>
            </div>
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
