'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';
import { FlowMotion, FlowTransition } from '@/components/FlowTransition';
import { ParkChoice } from '@/components/ParkChoice';
import { BookingLookup } from '@/components/BookingLookup';
import { BookingSummary } from '@/components/BookingSummary';
import { BuyTickets } from '@/components/BuyTickets';
import { AddonsOffer } from '@/components/AddonsOffer';
import { SafetyVideo } from '@/components/SafetyVideo';
import { SafetyAttest } from '@/components/SafetyAttest';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PhonePaymentConfirmation } from '@/components/PhonePaymentConfirmation';
import type { Booking, CheckInSession } from '@/flow/types';
import { clearBuyFlowRecovery } from '@/flow/buyFlowRecovery';
import { installLocalTransport } from './localTransport';
import styles from './preview.module.css';

type Screen = 'home' | 'lookup' | 'booking' | 'buy' | 'addons' | 'payment' | 'approved' | 'video' | 'rules' | 'ready';
const SCREENS: Screen[] = ['home','lookup','booking','buy','addons','payment','approved','video','rules','ready'];
const BOOKING: Booking = { id: 'DEMO', guestAccessToken: 'local-fixture-only', jumpers: 2, time: '17:00', endTime: '18:00', durationMinutes: 60, products: 1, paid: true, guestName: 'Alex', lastName: 'Test', productLabel: '60 min', productType: 'entry', existingAddons: [{ id: 'socks', qty: 2, label: 'Hoppsockor', price: 49 }] };
const SESSION: CheckInSession = { checkinSessionId: 'local-preview', status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: '0042', safetyStatus: 'completed' };

export default function FlowPreview() {
    return <LanguageProvider><Preview /></LanguageProvider>;
}

function Preview() {
    const { lang, setLang, t } = useTranslation();
    const [screen, setScreen] = useState<Screen>('home');
    const [ready, setReady] = useState(false);
    const [delay, setDelay] = useState(0);
    const [fail, setFail] = useState(false);
    const [full, setFull] = useState(false);
    const [scale, setScale] = useState(0.4);
    const viewport = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    const settings = useRef({ delay: 0, fail: false });

    useEffect(() => { settings.current = { delay, fail }; }, [delay, fail]);
    useEffect(() => {
        const restore = installLocalTransport({ delay: () => settings.current.delay, fail: () => settings.current.fail });
        clearBuyFlowRecovery();
        const query = new URLSearchParams(location.search);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Mount guest components only after the development transport is installed.
        setFull(query.has('full'));
        if (SCREENS.includes(query.get('screen') as Screen)) setScreen(query.get('screen') as Screen);
        setReady(true);
        return restore;
    }, []);
    useEffect(() => {
        if (!viewport.current) return;
        const observer = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / 390, entry.contentRect.height / 844)));
        observer.observe(viewport.current);
        return () => observer.disconnect();
    }, [ready]);
    useEffect(() => {
        if (!full) return;
        const receive = (event: MessageEvent) => {
            if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'local-flow-preview') return;
            if (SCREENS.includes(event.data.screen)) setScreen(event.data.screen);
            if (typeof event.data.delay === 'number') setDelay(Math.max(0, Math.min(5000, event.data.delay)));
            if (typeof event.data.fail === 'boolean') setFail(event.data.fail);
            if (event.data.lang === 'sv' || event.data.lang === 'en') setLang(event.data.lang);
            if (event.data.reset) { clearBuyFlowRecovery(); setScreen('home'); setLang('sv'); }
        };
        window.addEventListener('message', receive);
        return () => window.removeEventListener('message', receive);
    }, [full, setLang]);
    useEffect(() => {
        if (full) { window.parent.postMessage({ type: 'local-flow-preview-language', lang }, location.origin); return; }
        const receive = (event: MessageEvent) => {
            if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'local-flow-preview-language'
                && (event.data.lang === 'sv' || event.data.lang === 'en')) setLang(event.data.lang);
        };
        window.addEventListener('message', receive);
        return () => window.removeEventListener('message', receive);
    }, [full, lang, setLang]);
    useEffect(() => { frame.current?.contentWindow?.postMessage({ type: 'local-flow-preview', delay, fail, lang }, location.origin); }, [delay, fail, lang]);
    const navigate = (next: Screen) => {
        if (frame.current) frame.current.contentWindow?.postMessage({ type: 'local-flow-preview', screen: next }, location.origin);
        else setScreen(next);
    };
    const reset = () => { clearBuyFlowRecovery(); setScreen('home'); setLang('sv'); frame.current?.contentWindow?.postMessage({ type: 'local-flow-preview', reset: true }, location.origin); };
    const capturePayment = (event: MouseEvent) => {
        const button = (event.target as HTMLElement).closest('button');
        if (button?.matches('[data-testid=buy-contact-continue]') && !button.disabled) {
            event.preventDefault(); event.stopPropagation(); setScreen('payment');
        }
    };
    if (!ready) return <p>Öppnar lokal förhandsvisning…</p>;

    const app = <FlowMotion><main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground" onClickCapture={capturePayment}>
        <div className="phone-flow max-w-lg z-10 w-full min-w-0 flex flex-col items-center"  data-preview-screen={screen}>
            <LanguageToggle compact={screen !== 'home'} className="absolute top-2 right-2 z-20" />
            <div className="flex w-full h-8 items-center justify-between px-4">
                {!['home','payment','approved','video','rules','ready','buy'].includes(screen) && <button onClick={() => setScreen(screen === 'addons' ? 'booking' : 'home')}>{t.common.back}</button>}
                {!['home','payment','approved','video','rules','ready','buy'].includes(screen) && <button className="ml-auto" onClick={reset}>{t.common.exit}</button>}
            </div>
            <FlowTransition resetDocumentScroll variant={screen === 'home' ? 'fade' : 'slide'} screenKey={screen} className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">
                {screen === 'home' && <ParkChoice onSelect={choice => setScreen(choice === 'BUY' ? 'buy' : 'lookup')} />}
                {screen === 'lookup' && <BookingLookup onBack={reset} onSuccess={async () => {
                    // Exercise the second, session-routing wait without a real session call.
                    await new Promise(resolve => setTimeout(resolve, settings.current.delay));
                    setScreen('booking');
                }} />}
                {screen === 'booking' && <BookingSummary booking={BOOKING} onContinue={() => setScreen('addons')} />}
                {screen === 'buy' && <BuyTickets onBack={reset} inlineExitVisible onRequestExit={reset} onBookingReady={async () => () => { setScreen('video'); }} />}
                {screen === 'addons' && <AddonsOffer booking={BOOKING} guestCount={2} existingAddons={BOOKING.existingAddons!} onContinue={() => setScreen('video')} onPendingDone={reset} />}
                {(screen === 'payment' || screen === 'approved') && <PhonePaymentConfirmation preparationState={screen === 'approved' ? 'ready' : 'preparing'} language={lang} amountLabel="200 kr"  onContinueToSafety={() => setScreen('video')} />}
                {screen === 'video' && <SafetyVideo buyEntryFlow onComplete={() => setScreen('rules')} />}
                {screen === 'rules' && <SafetyAttest buyEntryFlow onComplete={() => setScreen('ready')} />}
                {screen === 'ready' && <ConfirmationScreen booking={BOOKING} checkinSession={SESSION} jumperCount={2} selectedAddons={[]} onStartOver={reset} />}
            </FlowTransition>
        </div>
    </main></FlowMotion>;

    if (full) return app;
    return <div className={styles.shell}>
        <aside className={styles.controls}>
            <p className={styles.eyebrow}>LOCALHOST · TELEFON</p><h1>Prova flödet</h1><p>Mjuk övergång · 240 ms</p>
            <p>Riktiga skärmkomponenter med testdata. Inga köp, API-anrop eller utskrifter går till parken. Betalningen är simulerad.</p>
            <button onClick={reset}>Börja om / nästa gäst</button>
            <button onClick={() => navigate('buy')}>Köp entré</button>
            <button onClick={() => navigate('lookup')}>Sök bokning (skriv DEMO)</button>
            <button onClick={() => navigate('payment')}>Visa betalning</button>
            <button onClick={() => navigate('approved')}>Simulera godkänd betalning</button>
            <button onClick={() => navigate('video')}>Visa säkerhetsfilm</button>
            <button onClick={() => navigate('rules')}>Visa säkerhetsregler</button>
            <button onClick={() => navigate('ready')}>Visa klart / nästa gäst</button>
            <label>Väntetid för testdata<select value={delay} onChange={e => setDelay(Number(e.target.value))}><option value={0}>Direkt</option><option value={1500}>1,5 sekunder</option><option value={5000}>5 sekunder</option></select></label>
            <label><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} /> Simulera nätverksfel</label>
            <button onClick={() => setLang(lang === 'sv' ? 'en' : 'sv')}>Byt språk · {lang.toUpperCase()}</button>
            <a href="?full=1" target="_blank" rel="noreferrer">Öppna utan testpanelen</a>
            <small>390 × 844 · Tillbaka och Fortsätt används inne i flödet. Testpanelen låter dig hoppa över betalning och filmen. </small>
        </aside>
        <div className={styles.viewport} ref={viewport}><div style={{ width: 390 * scale, height: 844 * scale }}><iframe ref={frame} title="Lokal telefonförhandsvisning" src="?full=1" className={styles.frame} style={{ transform: `scale(${scale})`, border: 0 }} onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'local-flow-preview', delay, fail, lang }, location.origin)} /></div></div>
    </div>;
}
