'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LanguageProvider, useTranslation, type Language } from '@/context/LanguageContext';
import { FlowMotion } from '@/components/FlowTransition';
import { BuyTickets } from '@/components/BuyTickets';
import { LanguageToggle } from '@/components/LanguageToggle';
import { clearBuyFlowRecovery, type BuyFlowRecoverySnapshot } from '@/flow/buyFlowRecovery';
import { makeAvailability } from '../flow/localTransport';
import styles from '../workshop/preview.module.css';

// GH-557 localhost review: the real phone screens for a purchase up to 10 minutes after the start. Start times and
// prices come from the local fixture; a local stand-in answers Cloud. At 14:11 it refuses the 14:00 session as
// ROLLER does once it closes, 10 minutes after the start. GH-567 adds a full 14:00, which stays as "Fullt", and one
// ROLLER has closed with places left, which is gone. Nothing reaches Park, Live or ROLLER.
type FrameId = 'starttid' | 'fullt' | 'stangd' | 'starttid-vald' | 'tiden-har-borjat' | 'ny-tid' | 'tillbaka-kontakt';

const FRAMES: { id: FrameId; clock: string; sv: string; en: string }[] = [
    { id: 'starttid', clock: '14:04', sv: 'Klockan 14:04: 14:00 har precis börjat och kan köpas', en: '14:04: 14:00 has just started and can be bought' },
    { id: 'fullt', clock: '14:04', sv: 'Klockan 14:04: 14:00 har precis börjat och är full', en: '14:04: 14:00 has just started and is full' },
    { id: 'stangd', clock: '14:06', sv: 'Klockan 14:06: ROLLER har stängt 14:00 med platser kvar', en: '14:06: ROLLER has closed 14:00 with places left' },
    { id: 'starttid-vald', clock: '14:04', sv: 'Klockan 14:04: 14:00 vald', en: '14:04: 14:00 chosen' },
    { id: 'tiden-har-borjat', clock: '14:11', sv: 'Klockan 14:11 på kontaktsidan: ROLLER har stängt 14:00', en: '14:11 on the contact page: ROLLER has closed 14:00' },
    { id: 'ny-tid', clock: '14:11', sv: 'Välj ny tid: nya tider, köpet ligger kvar', en: 'Choose a new time: new times, the purchase is kept' },
    { id: 'tillbaka-kontakt', clock: '14:11', sv: 'Ny tid 14:30: tillbaka på kontaktsidan med samma val', en: 'New time 14:30: back on the contact page with the same choices' },
];

const PREVIEW_CSS = 'nextjs-portal { display: none !important; }';
// The session ROLLER has closed by 14:11 (10 minutes after its start).
const CLOSED_AT_1411 = '14:00';
// Spots per start time in this preview.
const SPOTS: Record<string, number> = { '14:00': 34, '14:30': 40, '15:00': 6, '15:30': 22 };
// GH-567: how ROLLER lists the 14:00 session: full while it still sells it, or closed with its places kept.
const STARTED_SESSION: Partial<Record<FrameId, { available: boolean; capacityRemaining: number; onlineSalesOpen: boolean }>> = {
    fullt: { available: false, capacityRemaining: 0, onlineSalesOpen: true },
    stangd: { available: false, capacityRemaining: SPOTS['14:00'], onlineSalesOpen: false },
};
// The 90-minute entry from the local fixture (id 1021, 230 kr).
const ENTRY_90 = { key: 'entry-90', productId: '1021', label: '90 min', startTime: '14:00', durationMinutes: 90, type: 'entry' as const, unitPrice: 230 };

function snapshot(step: BuyFlowRecoverySnapshot['currentFlowStep'], extra: Partial<BuyFlowRecoverySnapshot> = {}): BuyFlowRecoverySnapshot {
    const now = new Date().toISOString();
    return {
        version: 1, updatedAt: now, expiresAt: now, lastObservedAt: now, currentFlowStep: step, bookingReference: null,
        draftUniqueId: null, selectedStartTime: '14:00', selectedProduct: null, jumperCount: null, draftState: null, ...extra,
    };
}

function frameSnapshot(frame: FrameId): BuyFlowRecoverySnapshot | null {
    if (frame === 'starttid' || frame === 'fullt' || frame === 'stangd') return null;
    if (frame === 'starttid-vald') return snapshot('TIMESLOT');
    // The guest chose 14:00 before it closed and reached the contact page with two jumpers, socks and water.
    return snapshot('CONTACT', {
        selectedProduct: ENTRY_90, quantity: 2, jumperCount: 2, addonQty: { socks: 2, water_bottle: 1 },
        contact: { firstName: 'Alex', lastName: '', email: 'alex@example.com', phone: '' },
        safetyAttestedAt: new Date().toISOString(),
    });
}

/** Development fixture only: availability, quotes and the 14:00 refusal; no draft, payment or provider request. */
function installStartedSessionTransport(frame: FrameId, clock: string) {
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
        throw new Error('Local preview requires a development server on localhost.');
    }
    const original = window.fetch;
    window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin === location.origin && !url.pathname.startsWith('/v1/')) return original(input, init);
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        if (url.pathname === '/v1/bookings/availability') {
            const times: string[] = body.startTimes || [];
            const availability = makeAvailability(times, body.date);
            availability.slots = availability.slots.map((slot) => ({
                ...slot,
                products: slot.products.map((product) => product.type === 'addon' ? product : {
                    ...product, available: true, capacityRemaining: SPOTS[slot.startTime] ?? 30, onlineSalesOpen: true,
                    ...(slot.startTime === CLOSED_AT_1411 ? STARTED_SESSION[frame] : undefined),
                }),
            }));
            return Response.json({ status: 'available', availability });
        }
        if (url.pathname === '/v1/bookings/quote' && Array.isArray(body.items)) {
            const closed = clock >= '14:10' && body.items.find((item: { startTime: string }) => item.startTime === CLOSED_AT_1411);
            if (closed) {
                return Response.json({ status: 'blocked', error: { code: 'session_started',
                    message: `Product ${closed.productId} is not available for ${closed.bookingDate} ${closed.startTime}.` } }, { status: 409 });
            }
            const prices = new Map(makeAvailability(['14:30']).slots[0].products.map((product) => [Number(product.productId), product.unitPrice]));
            const total = body.items.reduce((sum: number, item: { productId: number; quantity: number }) => sum + (prices.get(item.productId) ?? 0) * item.quantity, 0);
            return Response.json({ status: 'quoted', quote: { externalId: 'local-preview-557', costs: { total, amountOwing: total }, itemCount: body.items.length, expiresAt: null } });
        }
        return Response.json({ status: 'blocked', error: { code: 'local_preview_only', message: 'Förhandsvisningen skapar inga köp.' } }, { status: 409 });
    };
    return () => { window.fetch = original; };
}

export default function StartedSessionPreview() {
    return <LanguageProvider><Preview /></LanguageProvider>;
}

function Preview() {
    const [frame, setFrame] = useState<{ id: FrameId | null; ready: boolean }>({ id: null, ready: false });
    const { setLang } = useTranslation();
    const languageApplied = useRef(false);

    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        const found = FRAMES.find((candidate) => candidate.id === query.get('frame')) ?? null;
        if (!found) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
            setFrame({ id: null, ready: true });
            return;
        }
        const restore = installStartedSessionTransport(found.id, found.clock);
        clearBuyFlowRecovery();
        setFrame({ id: found.id, ready: true });
        return () => {
            restore();
            clearBuyFlowRecovery();
        };
    }, []);

    useEffect(() => {
        if (languageApplied.current) return;
        languageApplied.current = true;
        const lang = new URLSearchParams(window.location.search).get('lang');
        if (lang === 'sv' || lang === 'en') setLang(lang);
    }, [setLang]);

    if (!frame.ready) return <p className={styles.loading}>Öppnar lokal förhandsvisning…</p>;
    if (frame.id) return <FrameScreen frame={frame.id} />;
    return <Overview />;
}

function PhoneShell({ children }: { children: ReactNode }) {
    return <FlowMotion>
        <style>{PREVIEW_CSS}</style>
        <main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground">
            <div className="phone-flow z-10 w-full max-w-lg min-w-0 flex flex-col items-center">
                <LanguageToggle compact className="absolute top-2 right-2 z-20" />
                <div className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">{children}</div>
            </div>
        </main>
    </FlowMotion>;
}

function click(selector: string) {
    const element = document.querySelector<HTMLButtonElement>(selector);
    if (!element || element.disabled) return false;
    element.click();
    return true;
}

function FrameScreen({ frame }: { frame: FrameId }) {
    const clock = FRAMES.find((candidate) => candidate.id === frame)!.clock;
    const [snapshotForFrame] = useState(() => frameSnapshot(frame));

    // The later frames press the real buttons: "Till betalning", then "Välj ny tid", then 14:30 and Continue.
    useEffect(() => {
        if (frame !== 'tiden-har-borjat' && frame !== 'ny-tid' && frame !== 'tillbaka-kontakt') return;
        const steps = ['[data-testid="buy-contact-continue"]'];
        if (frame !== 'tiden-har-borjat') steps.push('[data-testid="session-started-new-time"]');
        if (frame === 'tillbaka-kontakt') steps.push('button[data-slot-started="false"]', '[data-testid="buy-timeslot-continue"]');
        let index = 0;
        const timer = window.setInterval(() => {
            if (index >= steps.length) {
                window.clearInterval(timer);
                return;
            }
            if (click(steps[index])) index += 1;
        }, 400);
        return () => window.clearInterval(timer);
    }, [frame]);

    return <PhoneShell>
        <BuyTickets key={frame} clockNow={clock} recoverySnapshot={snapshotForFrame} safetyBeforePayment
            inlineExitVisible onRequestExit={() => undefined} onBack={() => undefined} onBookingReady={async () => () => undefined} />
    </PhoneShell>;
}

function Overview() {
    const { lang, setLang } = useTranslation();
    const [langs, setLangs] = useState<Language[]>(['sv', 'en']);
    const sv = lang === 'sv';
    return <div className={styles.page}>
        <header className={styles.header}>
            <p className={styles.kicker}>LOKAL FÖRHANDSVISNING · #557 · #567</p>
            <h1>{sv ? 'Köp upp till 10 min efter start.' : 'Buy up to 10 minutes after the start.'}</h1>
            <p>{sv
                ? 'Riktiga skärmar med en lokal ersättare för Cloud. Klockan 14:11 nekar den 14:00, som ROLLER gör 10 minuter efter start. Inga anrop till Park, Live eller ROLLER.'
                : 'Real screens with a local stand-in for Cloud. At 14:11 it refuses 14:00, as ROLLER does 10 minutes after the start. No calls to Park, Live or ROLLER.'}</p>
            <div className={styles.controls}>
                {(['sv', 'en'] as const).map((value) => <button key={value} type="button" aria-pressed={langs.length === 1 && langs[0] === value}
                    onClick={() => { setLangs([value]); setLang(value); }}>{value === 'sv' ? 'Svenska' : 'English'}</button>)}
                <button type="button" aria-pressed={langs.length === 2} onClick={() => setLangs(['sv', 'en'])}>{sv ? 'Båda' : 'Both'}</button>
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
