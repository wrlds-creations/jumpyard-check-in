'use client';

// #457 localhost review: the real add-on step on both phone paths, in the scenarios Love asked
// for. Every request is answered by the development fixture transport; nothing reaches Cloud,
// ROLLER or a payment provider, and Continue stops before any draft or payment.

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { LanguageProvider, useTranslation, type Language } from '@/context/LanguageContext';
import { FlowMotion, FlowTransition } from '@/components/FlowTransition';
import { BuyTickets } from '@/components/BuyTickets';
import { AddonsOffer } from '@/components/AddonsOffer';
import { FlowNav } from '@/components/FlowNav';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ExitFlowDialog } from '@/components/ExitFlowDialog';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import type { Booking } from '@/flow/types';
import { BUY_FLOW_RECOVERY_MAX_AGE_MS, clearBuyFlowRecovery, type BuyFlowRecoverySnapshot } from '@/flow/buyFlowRecovery';
import { installLocalTransport } from '../flow/localTransport';
import styles from './preview.module.css';

type ScenarioKey = 'buy2' | 'booking' | 'family4';
const SCENARIOS: { key: ScenarioKey; title: string; note: string }[] = [
    { key: 'buy2', title: 'Köp entré · 2 hoppare', note: 'Ny gäst som köper i parken, 60 min × 2' },
    { key: 'booking', title: 'Bokning · strumpor redan köpta', note: '2 hoppare, 2 par hoppsockor ingår' },
    { key: 'family4', title: 'Familj · 4 hoppare', note: 'Familjebiljett 60 min' },
];
const SCREENS = [
    { key: '844', width: 390, height: 844, label: '390 × 844' },
    { key: '667', width: 375, height: 667, label: '375 × 667 · SE' },
] as const;
type ScreenKey = (typeof SCREENS)[number]['key'];

const BOOKING: Booking = { id: 'DEMO', guestAccessToken: 'local-fixture-only', jumpers: 2, time: '17:00', endTime: '18:00', durationMinutes: 60, products: 1, paid: true, guestName: 'Alex', lastName: 'Test', productLabel: '60 min', productType: 'entry', existingAddons: [{ id: 'socks', qty: 2, label: 'Hoppsockor', price: 49 }] };
const BOOKING_STEP_ICONS: JumpyardIconName[] = ['booking-card', 'addons-bag', 'payment-card', 'safety-check', 'success-check'];

function isScenario(value: string | null): value is ScenarioKey {
    return SCENARIOS.some((scenario) => scenario.key === value);
}

/** Opens the real ticket purchase on its add-on step through its own pre-payment recovery path. */
function buySnapshot(scenario: 'buy2' | 'family4'): BuyFlowRecoverySnapshot {
    const now = Date.now();
    const family = scenario === 'family4';
    return {
        version: 1,
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + BUY_FLOW_RECOVERY_MAX_AGE_MS).toISOString(),
        lastObservedAt: new Date(now).toISOString(),
        currentFlowStep: 'ADDONS',
        bookingReference: null,
        draftUniqueId: null,
        selectedStartTime: '17:00',
        selectedProduct: { key: family ? 'family-60' : 'entry-60', productId: family ? '1030' : '1020', label: '60 min', startTime: '17:00', durationMinutes: 60, type: family ? 'family' : 'entry', unitPrice: family ? 600 : 200 },
        jumperCount: family ? 4 : 2,
        quantity: family ? 1 : 2,
        draftState: null,
    };
}

export default function AddonsPreview() {
    return <LanguageProvider><Root /></LanguageProvider>;
}

function Root() {
    const [mode, setMode] = useState<{ full: true; scenario: ScenarioKey; lang: Language } | { full: false } | null>(null);
    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const scenario = query.get('scenario');
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
        setMode(query.has('full') && isScenario(scenario)
            ? { full: true, scenario, lang: query.get('lang') === 'en' ? 'en' : 'sv' }
            : { full: false });
    }, []);
    if (!mode) return <p>Öppnar lokal förhandsvisning…</p>;
    return mode.full ? <Frame scenario={mode.scenario} lang={mode.lang} /> : <Harness />;
}

/** Copy of the page progress bar at the add-on step, which the booking path shows above AddonsOffer. */
function BookingProgress() {
    const { t } = useTranslation();
    const labels = [t.progress.booking, t.progress.extras, t.progress.payment, t.progress.safety, t.progress.done];
    return (
        <div className="w-full max-w-md min-w-0 mx-auto mb-3 px-4">
            <div className="relative">
                <div className="absolute top-4 left-[10%] right-[10%] h-0.5 bg-surface-strong" />
                <div className="absolute top-4 left-[10%] h-0.5 bg-primary transition-all duration-500" style={{ width: 'calc(20%)' }} />
                <div className="relative z-10 grid" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
                    {labels.map((label, i) => (
                        <div key={label} className="flex min-w-0 flex-col items-center gap-1">
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${
                                i < 1 ? 'bg-white border-primary shadow-sm' : i === 1 ? 'bg-white border-primary shadow-sm ring-4 ring-primary/15' : 'bg-surface border-border opacity-45'}`}>
                                <JumpyardIcon name={BOOKING_STEP_ICONS[i]} className="w-6 h-6" />
                            </div>
                            <span className={`block w-full min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[9px] font-bold italic uppercase tracking-wider transition-colors ${
                                i <= 1 ? 'text-foreground' : 'text-muted'}`}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Frame({ scenario, lang }: { scenario: ScenarioKey; lang: Language }) {
    const { setLang } = useTranslation();
    const [ready, setReady] = useState(false);
    const [run, setRun] = useState(0);
    const [snapshot, setSnapshot] = useState<BuyFlowRecoverySnapshot | null>(null);
    const [continued, setContinued] = useState(false);
    const [exitOpen, setExitOpen] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        const restore = installLocalTransport({ delay: () => 0, fail: () => false });
        clearBuyFlowRecovery();
        setLang(lang);
        // Mount guest components only after the development transport is installed.
        setSnapshot(scenario === 'booking' ? null : buySnapshot(scenario));
        setReady(true);
        return restore;
        // The transport and the query-driven language are set exactly once per frame.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 2600);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const restart = () => {
        clearBuyFlowRecovery();
        setExitOpen(false);
        setContinued(false);
        setSnapshot(scenario === 'booking' ? null : buySnapshot(scenario));
        setRun((value) => value + 1);
    };
    // The purchase stops before any quote, draft or payment request.
    const stopAtPayment = (event: MouseEvent) => {
        const button = (event.target as HTMLElement).closest('button');
        if (button?.matches('[data-testid=buy-contact-continue]') && !button.disabled) {
            event.preventDefault();
            event.stopPropagation();
            setNotice('Här startar betalningen i riktiga flödet. Den är avstängd i förhandsvisningen.');
        }
    };
    if (!ready) return <p>Öppnar lokal förhandsvisning…</p>;

    return (
        <FlowMotion>
            <main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground" onClickCapture={stopAtPayment}>
                <div className="phone-flow max-w-lg z-10 w-full min-w-0 flex flex-col items-center">
                    <LanguageToggle compact className="absolute top-2 right-2 z-20" />
                    {scenario === 'booking' && !continued && <BookingProgress />}
                    <FlowTransition resetDocumentScroll variant="slide" screenKey={`${run}:${continued}`} className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">
                        {scenario !== 'booking' && snapshot && (
                            <BuyTickets key={run} recoverySnapshot={snapshot} onBack={restart} inlineExitVisible
                                onRequestExit={() => setExitOpen(true)} onBookingReady={async () => () => undefined} />
                        )}
                        {scenario === 'booking' && !continued && (
                            <AddonsOffer key={run} booking={BOOKING} guestCount={2} existingAddons={BOOKING.existingAddons!}
                                onContinue={() => setContinued(true)} onPendingDone={restart} />
                        )}
                        {scenario === 'booking' && continued && (
                            <div className={styles.next}>
                                <p className={styles.eyebrow}>FÖRHANDSVISNING</p>
                                <h2>Fortsätt gick igenom</h2>
                                <p>Inget kryss behövdes. I riktiga flödet går gästen nu vidare till säkerhetsfilmen.</p>
                                <button type="button" onClick={restart}>Tillbaka till tillägg</button>
                            </div>
                        )}
                    </FlowTransition>
                    {scenario === 'booking' && !continued && (
                        <FlowNav onBack={() => setNotice('Tillbaka går till bokningssammanfattningen i riktiga flödet.')} onExit={() => setExitOpen(true)} />
                    )}
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
    const [scale, setScale] = useState(0.6);
    const frames = useRef<HTMLDivElement>(null);
    const bar = useRef<HTMLElement>(null);
    const size = SCREENS.find((option) => option.key === screen) ?? SCREENS[0];
    const kioskUrl = 'http://127.0.0.1:3062/preview/addons';

    useEffect(() => {
        const container = frames.current;
        const header = bar.current;
        if (!container || !header) return;
        const compute = () => {
            const byWidth = (container.clientWidth - 48 - 2 * 28) / (3 * size.width);
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
                    <p className={styles.eyebrow}>LOCALHOST · TELEFON · #457</p>
                    <h1>Tillägg utan kryss (Hylla)</h1>
                    <p className={styles.note}>Riktiga skärmar med testdata. Inga köp eller anrop till parken. Varje telefon går att trycka i.</p>
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
                <a className={styles.link} href={kioskUrl} target="_blank" rel="noreferrer">Kiosken (#144) ↗</a>
            </header>
            <div className={styles.frames} ref={frames}>
                {SCENARIOS.map((scenario) => {
                    const url = `?full=1&scenario=${scenario.key}&lang=${lang}`;
                    return (
                        <figure key={scenario.key} style={{ width: size.width * scale }}>
                            <figcaption>
                                <span className={styles.caption}><span>{scenario.title}</span><a href={url} target="_blank" rel="noreferrer">Helskärm ↗</a></span>
                                <small>{scenario.note}</small>
                            </figcaption>
                            <div className={styles.screen} style={{ width: size.width * scale, height: size.height * scale }}>
                                <iframe key={`${scenario.key}-${lang}-${nonce}`} title={scenario.title} src={url} width={size.width} height={size.height} style={{ transform: `scale(${scale})` }} />
                            </div>
                        </figure>
                    );
                })}
            </div>
        </div>
    );
}
