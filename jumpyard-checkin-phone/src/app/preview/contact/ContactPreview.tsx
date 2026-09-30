'use client';

// #473 localhost review: the real contact step of a new purchase in its two states. The
// development transport answers every request; no request reaches Cloud, Klaviyo, ROLLER or a
// payment provider, and Continue never creates a booking.

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { LanguageProvider, useTranslation, type Language } from '@/context/LanguageContext';
import { FlowMotion, FlowTransition } from '@/components/FlowTransition';
import { BuyTickets } from '@/components/BuyTickets';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ExitFlowDialog } from '@/components/ExitFlowDialog';
import { BUY_FLOW_RECOVERY_MAX_AGE_MS, clearBuyFlowRecovery, type BuyFlowRecoverySnapshot } from '@/flow/buyFlowRecovery';
import { installContactTransport } from './contactTransport';
import styles from './preview.module.css';

type StateKey = 'email-first' | 'details';
const STATES: { key: StateKey; title: string; note: string }[] = [
    { key: 'email-first', title: 'Förnamn + e-post', note: 'Standard. Känd kund fylls i från Klaviyo, ny kund får platshållare. Gästen ser inget av det.' },
    { key: 'details', title: 'Cloud är osäker', note: 'Flera profiler, fel, timeout eller saknad nyckel: gästen fyller i efternamn och telefon.' },
];
const SCREENS = [
    { key: '844', width: 390, height: 844, label: '390 × 844' },
    { key: '667', width: 375, height: 667, label: '375 × 667 · SE' },
] as const;
type ScreenKey = (typeof SCREENS)[number]['key'];

function isStateKey(value: string | null): value is StateKey {
    return STATES.some((state) => state.key === value);
}

/** Opens the real ticket purchase on its contact step through its own pre-payment recovery path. */
function contactSnapshot(): BuyFlowRecoverySnapshot {
    const now = Date.now();
    return {
        version: 1,
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + BUY_FLOW_RECOVERY_MAX_AGE_MS).toISOString(),
        lastObservedAt: new Date(now).toISOString(),
        currentFlowStep: 'CONTACT',
        bookingReference: null,
        draftUniqueId: null,
        selectedStartTime: '17:00',
        selectedProduct: { key: 'entry-60', productId: '1020', label: '60 min', startTime: '17:00', durationMinutes: 60, type: 'entry', unitPrice: 200 },
        jumperCount: 2,
        quantity: 2,
        addonQty: { socks: 2 },
        contact: { firstName: 'Alex', lastName: '', email: 'alex@example.invalid', phone: '' },
        draftState: null,
    };
}

export default function ContactPreview() {
    return <LanguageProvider><Root /></LanguageProvider>;
}

function Root() {
    const [mode, setMode] = useState<{ full: true; state: StateKey; lang: Language } | { full: false } | null>(null);
    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const state = query.get('state');
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
        setMode(query.has('full') && isStateKey(state)
            ? { full: true, state, lang: query.get('lang') === 'en' ? 'en' : 'sv' }
            : { full: false });
    }, []);
    if (!mode) return <p>Öppnar lokal förhandsvisning…</p>;
    return mode.full ? <Frame state={mode.state} lang={mode.lang} /> : <Harness />;
}

function Frame({ state, lang }: { state: StateKey; lang: Language }) {
    const { setLang } = useTranslation();
    const [ready, setReady] = useState(false);
    const [run, setRun] = useState(0);
    const [snapshot, setSnapshot] = useState<BuyFlowRecoverySnapshot | null>(null);
    const [exitOpen, setExitOpen] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const autoSubmitted = useRef(false);

    useEffect(() => {
        const restore = installContactTransport();
        clearBuyFlowRecovery();
        setLang(lang);
        // Mount guest components only after the development transport is installed.
        setSnapshot(contactSnapshot());
        setReady(true);
        return restore;
        // The transport and the query-driven language are set exactly once per frame.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The uncertain state is reached the real way: Continue once, and the synthetic Cloud
    // answers contact_details_required.
    useEffect(() => {
        if (state !== 'details' || !ready) return;
        autoSubmitted.current = false;
        const timer = window.setInterval(() => {
            const button = document.querySelector<HTMLButtonElement>('[data-testid=buy-contact-continue]');
            if (autoSubmitted.current || !button || button.disabled || !document.querySelector('[data-contact-mode=email-first]')) return;
            autoSubmitted.current = true;
            window.clearInterval(timer);
            button.click();
        }, 250);
        return () => window.clearInterval(timer);
    }, [ready, run, state]);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 3200);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const restart = () => {
        clearBuyFlowRecovery();
        setExitOpen(false);
        setSnapshot(contactSnapshot());
        setRun((value) => value + 1);
    };
    // Continue stops before Cloud, except the one press that shows Cloud's uncertain answer.
    const stopBeforeCloud = (event: MouseEvent) => {
        const button = (event.target as HTMLElement).closest('button');
        if (!button?.matches('[data-testid=buy-contact-continue]') || button.disabled) return;
        const contactMode = document.querySelector('[data-contact-mode]')?.getAttribute('data-contact-mode');
        if (state === 'details' && contactMode === 'email-first') return;
        event.preventDefault();
        event.stopPropagation();
        setNotice(contactMode === 'details'
            ? 'Nu skickas förnamn, efternamn, e-post och telefon. Ingen Klaviyo-uppslagning; bokningen skapas som i dag.'
            : 'Här slår Cloud upp e-posten i Klaviyo och skapar bokningen. Förhandsvisningen stannar här.');
    };
    if (!ready) return <p>Öppnar lokal förhandsvisning…</p>;

    return (
        <FlowMotion>
            <main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground" onClickCapture={stopBeforeCloud}>
                <div className="phone-flow max-w-lg z-10 w-full min-w-0 flex flex-col items-center">
                    <LanguageToggle compact className="absolute top-2 right-2 z-20" />
                    <FlowTransition resetDocumentScroll variant="slide" screenKey={`${run}`} className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">
                        {snapshot && (
                            <BuyTickets key={run} recoverySnapshot={snapshot} onBack={restart} inlineExitVisible
                                onRequestExit={() => setExitOpen(true)} onBookingReady={async () => () => undefined} />
                        )}
                    </FlowTransition>
                    <ExitFlowDialog open={exitOpen} onClose={() => setExitOpen(false)} onConfirm={restart} />
                </div>
                {notice && <p className={styles.toast} role="status">{notice}</p>}
                {/* The development badge would cover the Back disc in the review frames. */}
                <style>{'nextjs-portal { display: none !important; }'}</style>
            </main>
        </FlowMotion>
    );
}

function Harness() {
    const [lang, setLanguage] = useState<Language>('sv');
    const [screen, setScreen] = useState<ScreenKey>('844');
    const [nonce, setNonce] = useState(0);
    const [scale, setScale] = useState(0.7);
    const frames = useRef<HTMLDivElement>(null);
    const bar = useRef<HTMLElement>(null);
    const size = SCREENS.find((option) => option.key === screen) ?? SCREENS[0];

    useEffect(() => {
        const container = frames.current;
        const header = bar.current;
        if (!container || !header) return;
        const compute = () => {
            const byWidth = (container.clientWidth - 48 - 28) / (2 * size.width);
            const byHeight = (window.innerHeight - header.offsetHeight - 90) / size.height;
            setScale(Math.max(0.4, Math.min(1, byWidth, byHeight)));
        };
        const observer = new ResizeObserver(compute);
        observer.observe(container);
        observer.observe(header);
        return () => observer.disconnect();
    }, [size.width, size.height]);

    return (
        <div className={styles.harness}>
            <header className={styles.bar} ref={bar}>
                <div>
                    <p className={styles.eyebrow}>LOCALHOST · TELEFON · #473</p>
                    <h1>Köp med förnamn och e-post</h1>
                    <p className={styles.note}>Riktiga kontaktsteget med testdata. Inga köp och inga anrop till Cloud, Klaviyo eller ROLLER. Varje telefon går att trycka i.</p>
                </div>
                <div className={styles.control}>
                    <span>Språk</span>
                    <div className={styles.seg}>
                        {(['sv', 'en'] as const).map((option) => (
                            <button key={option} type="button" aria-pressed={lang === option} onClick={() => setLanguage(option)}>{option.toUpperCase()}</button>
                        ))}
                    </div>
                </div>
                <div className={styles.control}>
                    <span>Skärm</span>
                    <div className={styles.seg}>
                        {SCREENS.map((option) => (
                            <button key={option.key} type="button" aria-pressed={screen === option.key} onClick={() => setScreen(option.key)}>{option.label}</button>
                        ))}
                    </div>
                </div>
                <button type="button" className={styles.reset} onClick={() => setNonce((value) => value + 1)}>Börja om</button>
            </header>
            <div className={styles.frames} ref={frames}>
                {STATES.map((state) => {
                    const url = `?full=1&state=${state.key}&lang=${lang}`;
                    return (
                        <figure key={state.key} style={{ width: size.width * scale }}>
                            <figcaption>
                                <span className={styles.caption}><span>{state.title}</span><a href={url} target="_blank" rel="noreferrer">Helskärm ↗</a></span>
                                <small>{state.note}</small>
                            </figcaption>
                            <div className={styles.screen} style={{ width: size.width * scale, height: size.height * scale }}>
                                <iframe key={`${state.key}-${lang}-${nonce}`} title={state.title} src={url} width={size.width} height={size.height} style={{ transform: `scale(${scale})` }} />
                            </div>
                        </figure>
                    );
                })}
            </div>
        </div>
    );
}
