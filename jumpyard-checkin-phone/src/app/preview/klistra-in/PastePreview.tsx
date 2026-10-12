'use client';

// #505 localhost review: the real contact step of a new purchase with "Klistra in". The development
// transport answers availability and quotes; no request reaches Cloud or ROLLER, and Continue never
// creates a booking. Each frame simulates the phone's clipboard (?clip= overrides it), so the review
// looks the same on every computer; ?clip=real uses this computer's own clipboard.
// #510: one field without a type chooser; the typed frames enter their text one character at a time.

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { LanguageProvider, useTranslation, type Language } from '@/context/LanguageContext';
import { FlowMotion, FlowTransition } from '@/components/FlowTransition';
import { BuyTickets } from '@/components/BuyTickets';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ExitFlowDialog } from '@/components/ExitFlowDialog';
import { BUY_FLOW_RECOVERY_MAX_AGE_MS, clearBuyFlowRecovery, type BuyFlowRecoverySnapshot } from '@/flow/buyFlowRecovery';
import { installPasteTransport, PREVIEW_DISCOUNT_CODE } from './pasteTransport';
import styles from './preview.module.css';

type FrameKey = 'tom' | 'presentkort' | 'medlem-skrivet' | 'rabattkod' | 'fel-kod' | 'siffror' | 'medlem' | 'fore-kontakt' | 'fallback';
type Clip = { mode: 'text'; text: string } | { mode: 'denied' } | { mode: 'missing' } | { mode: 'real' };
interface FrameSpec {
    key: FrameKey;
    title: string;
    note: string;
    clip: string;
    contact: boolean;
    paste: boolean;
    /** #510: typed into the field one character at a time instead of pasted. */
    type?: string;
    /** Taps Applicera after typing. */
    apply?: boolean;
    scroll: 'codes' | 'top';
}

// Synthetic numbers in ROLLER's email shapes, with the leading "#" a copy brings along.
const GIFT_CARD_COPY = '#4000123456';
const MEMBER_COPY = '#178000001-602000001';
const MEMBER_TYPED = '178000001-602000001';
const FRAMES: FrameSpec[] = [
    { key: 'tom', title: 'Tomt fält', note: 'Ett fält utan typväljare. Klistra in står där Applicera står så fort fältet har text. Här läser knappen datorns egna urklipp.', clip: 'real', contact: true, paste: false, scroll: 'codes' },
    { key: 'presentkort', title: 'Presentkort, inklistrat', note: `Urklipp "${GIFT_CARD_COPY}": 10 siffror blir ett presentkort, numret kontrolleras direkt och täcker allt.`, clip: GIFT_CARD_COPY, contact: true, paste: true, scroll: 'codes' },
    { key: 'medlem-skrivet', title: 'Medlemskort, skrivet', note: `Skrivet "${MEMBER_TYPED}": siffror, bindestreck, siffror blir ett medlemskort och kontrolleras direkt.`, clip: 'real', contact: true, paste: false, type: MEMBER_TYPED, scroll: 'codes' },
    { key: 'rabattkod', title: 'Rabattkod', note: `Skrivet "${PREVIEW_DISCOUNT_CODE}" och Applicera: allt annat är en rabattkod eller ett klippkort.`, clip: 'real', contact: true, paste: false, type: PREVIEW_DISCOUNT_CODE, apply: true, scroll: 'codes' },
    { key: 'fel-kod', title: 'Fel kod', note: 'Skrivet "VINTER10" och Applicera: en kod som inte finns ger "Koden kunde inte användas".', clip: 'real', contact: true, paste: false, type: 'VINTER10', apply: true, scroll: 'codes' },
    { key: 'siffror', title: 'Siffror på väg', note: 'Medan siffrorna inte är ett helt nummer säger raden hur presentkort och medlemskort ser ut.', clip: 'real', contact: true, paste: false, type: '400012', scroll: 'codes' },
    { key: 'medlem', title: 'Medlemskort, inklistrat', note: `Urklipp "${MEMBER_COPY}": 30 % på entrén och strumporna till fullpris.`, clip: MEMBER_COPY, contact: true, paste: true, scroll: 'codes' },
    { key: 'fore-kontakt', title: 'Före namn och e-post', note: 'Numret väntar och kontrolleras en gång när namn och e-post är ifyllda. Fyll i dem och se.', clip: GIFT_CARD_COPY, contact: false, paste: true, scroll: 'top' },
    { key: 'fallback', title: 'Urklipp nekas', note: 'Telefonen ger inte urklippet: fältet får fokus och en rad förklarar hur man klistrar in.', clip: 'denied', contact: true, paste: true, scroll: 'codes' },
];
// The harness shows at most five phones per row.
const FRAMES_PER_ROW = 5;

/** Types like a guest: each character through React's own input event, a moment apart. */
async function typeIntoField(input: HTMLInputElement, text: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    for (let length = 1; length <= text.length; length += 1) {
        setValue?.call(input, text.slice(0, length));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 60));
    }
}

function findFrame(key: string | null) {
    return FRAMES.find((frame) => frame.key === key) ?? null;
}

function parseClip(value: string): Clip {
    if (value === 'denied' || value === 'missing' || value === 'real') return { mode: value };
    return { mode: 'text', text: value };
}

/** Preview only: stands in for navigator.clipboard, which a review frame cannot fill by itself. */
function installPreviewClipboard(clip: Clip) {
    if (clip.mode === 'real') return () => undefined;
    const own = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const value = clip.mode === 'missing' ? undefined : {
        readText: () => clip.mode === 'text'
            ? Promise.resolve(clip.text)
            : Promise.reject(new DOMException('Read permission denied.', 'NotAllowedError')),
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
    return () => {
        if (own) Object.defineProperty(navigator, 'clipboard', own);
        else Reflect.deleteProperty(navigator, 'clipboard');
    };
}

/** Opens the real ticket purchase on its contact step through its own pre-payment recovery path:
 * one 60-minute entry at 17:00 (220 kr) and one pair of socks (49 kr). */
function contactSnapshot(withContact: boolean): BuyFlowRecoverySnapshot {
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
        selectedProduct: { key: 'entry-60', productId: '1020', label: '60 min', startTime: '17:00', durationMinutes: 60, type: 'entry', unitPrice: 220 },
        jumperCount: 1,
        quantity: 1,
        addonQty: { socks: 1 },
        contact: withContact
            ? { firstName: 'Alex', lastName: '', email: 'alex@example.invalid', phone: '' }
            : { firstName: '', lastName: '', email: '', phone: '' },
        draftState: null,
    };
}

export default function PastePreview() {
    return <LanguageProvider><Root /></LanguageProvider>;
}

function Root() {
    const [mode, setMode] = useState<{ frame: FrameSpec; lang: Language; clip: Clip } | { frame: null } | null>(null);
    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const frame = findFrame(query.get('frame'));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- The preview query is read once on the client.
        setMode(frame
            ? { frame, lang: query.get('lang') === 'en' ? 'en' : 'sv', clip: parseClip(query.get('clip') ?? frame.clip) }
            : { frame: null });
    }, []);
    if (!mode) return <p>Öppnar lokal förhandsvisning…</p>;
    return mode.frame ? <Frame frame={mode.frame} lang={mode.lang} clip={mode.clip} /> : <Harness />;
}

function Frame({ frame, lang, clip }: { frame: FrameSpec; lang: Language; clip: Clip }) {
    const { setLang } = useTranslation();
    const [ready, setReady] = useState(false);
    const [run, setRun] = useState(0);
    const [snapshot, setSnapshot] = useState<BuyFlowRecoverySnapshot | null>(null);
    const [exitOpen, setExitOpen] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        const restoreFetch = installPasteTransport();
        const restoreClipboard = installPreviewClipboard(clip);
        clearBuyFlowRecovery();
        setLang(lang);
        // Mount guest components only after the development transport is installed.
        setSnapshot(contactSnapshot(frame.contact));
        setReady(true);
        return () => {
            restoreClipboard();
            restoreFetch();
        };
        // The transport, the clipboard and the query-driven language are set exactly once per frame.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The frame's own taps, the way a guest makes them: open the code section, then "Klistra in" once
    // or (#510) type the text and, for a code, tap Applicera.
    useEffect(() => {
        if (!ready) return;
        let pasted = !frame.paste;
        let typed = frame.type === undefined;
        let cancelled = false;
        const later: number[] = [];
        const place = () => {
            const section = document.querySelector('[data-testid=payment-options]');
            if (frame.scroll === 'top' || !section) window.scrollTo({ top: 0 });
            else window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 12 });
        };
        const settle = () => later.push(window.setTimeout(place, 150), window.setTimeout(place, 1200));
        const timer = window.setInterval(() => {
            const toggle = document.querySelector<HTMLButtonElement>('[data-testid=payment-options-toggle]');
            if (!toggle) return;
            const input = document.querySelector<HTMLInputElement>('[data-testid=payment-code-input]');
            if (!input) {
                toggle.click();
                return;
            }
            if (!pasted) {
                const paste = document.querySelector<HTMLButtonElement>('[data-testid=payment-code-paste]');
                if (!paste || paste.disabled) return;
                pasted = true;
                paste.click();
            }
            window.clearInterval(timer);
            if (!typed && frame.type !== undefined) {
                typed = true;
                place();
                void typeIntoField(input, frame.type).then(() => {
                    if (cancelled) return;
                    if (frame.apply) document.querySelector<HTMLButtonElement>('[data-testid=payment-code-apply]')?.click();
                    settle();
                });
                return;
            }
            // Again once the check has answered and the section has grown.
            settle();
        }, 250);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            later.forEach((id) => window.clearTimeout(id));
        };
    }, [frame.apply, frame.paste, frame.scroll, frame.type, ready, run]);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 3200);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const restart = () => {
        clearBuyFlowRecovery();
        setExitOpen(false);
        setSnapshot(contactSnapshot(frame.contact));
        setRun((value) => value + 1);
    };
    // Continue stops before Cloud: the preview creates no booking.
    const stopBeforeCloud = (event: MouseEvent) => {
        const button = (event.target as HTMLElement).closest('button');
        if (!button?.matches('[data-testid=buy-contact-continue]') || button.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        setNotice('Här skapas bokningen, med koden. Förhandsvisningen stannar här.');
    };
    if (!ready) return <p>Öppnar lokal förhandsvisning…</p>;

    return (
        <FlowMotion>
            <main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground" onClickCapture={stopBeforeCloud}>
                <div className="phone-flow max-w-lg z-10 w-full min-w-0 flex flex-col items-center">
                    <LanguageToggle compact className="absolute top-2 right-2 z-20" />
                    <FlowTransition resetDocumentScroll variant="slide" screenKey={`${run}`} className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">
                        {snapshot && (
                            <BuyTickets key={run} recoverySnapshot={snapshot} slotTimes={['17:00', '17:30', '18:00']} onBack={restart} inlineExitVisible
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
    const [nonce, setNonce] = useState(0);
    const [scale, setScale] = useState(0.6);
    const frames = useRef<HTMLDivElement>(null);
    const bar = useRef<HTMLElement>(null);
    const width = 375;
    const height = 812;

    useEffect(() => {
        const container = frames.current;
        const header = bar.current;
        if (!container || !header) return;
        const compute = () => {
            const perRow = Math.min(FRAMES.length, FRAMES_PER_ROW);
            const byWidth = (container.clientWidth - 48 - (perRow - 1) * 24) / (perRow * width);
            const byHeight = (window.innerHeight - header.offsetHeight - 110) / height;
            setScale(Math.max(0.4, Math.min(1, byWidth, byHeight)));
        };
        const observer = new ResizeObserver(compute);
        observer.observe(container);
        observer.observe(header);
        return () => observer.disconnect();
    }, []);

    return (
        <div className={styles.harness}>
            <header className={styles.bar} ref={bar}>
                <div>
                    <p className={styles.eyebrow}>LOCALHOST · TELEFON · #505 + #510</p>
                    <h1>Ett kodfält: skriv eller klistra in</h1>
                    <p className={styles.note}>Riktiga kontaktsteget med testdata: en entré 60 min (220 kr) och strumpor (49 kr). Ingen typväljare: numret avgör om det är presentkort, medlemskort eller rabattkod. Inga köp och inga anrop till Cloud eller ROLLER. Varje telefon går att trycka i.</p>
                </div>
                <div className={styles.control}>
                    <span>Språk</span>
                    <div className={styles.seg}>
                        {(['sv', 'en'] as const).map((option) => (
                            <button key={option} type="button" aria-pressed={lang === option} onClick={() => setLanguage(option)}>{option.toUpperCase()}</button>
                        ))}
                    </div>
                </div>
                <button type="button" className={styles.reset} onClick={() => setNonce((value) => value + 1)}>Börja om</button>
            </header>
            <div className={styles.frames} ref={frames} style={{ flexWrap: 'wrap' }}>
                {FRAMES.map((frame) => {
                    const url = `?frame=${frame.key}&lang=${lang}`;
                    return (
                        <figure key={frame.key} style={{ width: width * scale }}>
                            <figcaption>
                                <span className={styles.caption}><span>{frame.title}</span><a href={url} target="_blank" rel="noreferrer">Helskärm ↗</a></span>
                                <small>{frame.note}</small>
                            </figcaption>
                            <div className={styles.screen} style={{ width: width * scale, height: height * scale }}>
                                <iframe key={`${frame.key}-${lang}-${nonce}`} title={frame.title} src={url} width={width} height={height}
                                    allow="clipboard-read; clipboard-write" style={{ transform: `scale(${scale})` }} />
                            </div>
                        </figure>
                    );
                })}
            </div>
        </div>
    );
}
