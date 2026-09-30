'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';
import { FlowMotion, FlowTransition } from '@/components/FlowTransition';
import { ParkChoice } from '@/components/ParkChoice';
import { BookingLookup } from '@/components/BookingLookup';
import { BookingSummary } from '@/components/BookingSummary';
import { BuyTickets } from '@/components/BuyTickets';
import { AddonsOffer, type AddonsOfferStep } from '@/components/AddonsOffer';
import { SafetyVideo } from '@/components/SafetyVideo';
import { ConfirmationScreen } from '@/components/ConfirmationScreen';
import { LanguageToggle } from '@/components/LanguageToggle';
import { PhonePaymentConfirmation } from '@/components/PhonePaymentConfirmation';
import { ExitFlowDialog } from '@/components/ExitFlowDialog';
import { FlowNav } from '@/components/FlowNav';
import type { JumpyardIconName } from '@/components/JumpyardIcon';
import type { Booking, CheckInSession } from '@/flow/types';
import type { AddonBackRule } from '@/flow/addonPaymentNavigation';
import { clearBuyFlowRecovery } from '@/flow/buyFlowRecovery';
import { installLocalTransport } from './localTransport';
import { PreviewPayment, PreviewProgress } from './PreviewPayment';
import styles from './preview.module.css';

// #458 localhost preview: real guest screens in the approved order (Love 2026-09-30), with local
// stand-ins for card payment and ROLLER. Buy: … → review → safety → contact → payment → number.
// Existing booking: add-ons → review → safety → add-on payment → number; without add-ons: add-ons →
// safety → number. The guest is done at the approved payment; ROLLER confirms in the background.
// Nothing reaches Park, Live or ROLLER.
type Screen = 'home' | 'lookup' | 'booking' | 'addons' | 'addon-pay' | 'safety' | 'buy' | 'safety-buy' | 'pay' | 'paid' | 'done';
const SCREENS: Screen[] = ['home', 'lookup', 'booking', 'addons', 'addon-pay', 'safety', 'buy', 'safety-buy', 'pay', 'paid', 'done'];
const BUY_SCREENS: Screen[] = ['buy', 'safety-buy', 'pay', 'paid'];
const BOOKING: Booking = { id: 'DEMO', guestAccessToken: 'local-fixture-only', jumpers: 2, time: '17:00', endTime: '18:00', durationMinutes: 60, products: 1, paid: true, guestName: 'Alex', lastName: 'Test', productLabel: '60 min', productType: 'entry', existingAddons: [{ id: 'socks', qty: 2, label: 'Hoppsockor', price: 49 }] };
const SESSION: CheckInSession = { checkinSessionId: 'local-preview', status: 'ready_for_staff', handoffStatus: 'ready_for_staff', handoffCode: '0042', safetyStatus: 'completed' };
const BUY_ICONS: JumpyardIconName[] = ['admission-ticket', 'addons-bag', 'safety-check', 'payment-card', 'success-check'];
const BOOKING_ICONS: JumpyardIconName[] = ['booking-card', 'addons-bag', 'safety-check', 'payment-card', 'success-check'];
// BuyTickets stays mounted behind the payment stand-in; its body-portal Back/Exit must not float over it.
// The Next dev badge would sit on top of the guest's Back button in the phone frame.
const PREVIEW_GLOBAL_CSS = 'body[data-preview-buy-hidden="true"] [data-testid="flow-nav"]:has([data-testid="buy-exit-flow-open"]) { display: none; } nextjs-portal { display: none !important; }';

export default function FlowPreview() {
    return <LanguageProvider><Preview /></LanguageProvider>;
}

function seekFilmToEnd() {
    const video = document.querySelector<HTMLVideoElement>('.safety-film video');
    if (!video) return;
    // Preview shortcut only: muted playback is allowed without a tap inside this frame. The screen
    // still waits for the playback controller's genuine end event before it shows the approval.
    video.muted = true;
    const seek = () => { if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - 0.6); };
    if (!video.paused && video.readyState >= 3) { seek(); return; }
    video.addEventListener('playing', seek, { once: true });
    document.querySelector<HTMLButtonElement>('.safety-film button')?.click();
}

function Preview() {
    const { lang, setLang, t } = useTranslation();
    const [screen, setScreen] = useState<Screen>('home');
    const [ready, setReady] = useState(false);
    const [delay, setDelay] = useState(0);
    const [fail, setFail] = useState(false);
    const [full, setFull] = useState(false);
    const [exitOpen, setExitOpen] = useState(false);
    const [scale, setScale] = useState(0.4);
    const [amount, setAmount] = useState('200 kr');
    const [addonsStep, setAddonsStep] = useState<AddonsOfferStep>('SELECT');
    const [addonsBackRule, setAddonsBackRule] = useState<AddonBackRule>('page');
    const [addonsBackRequest, setAddonsBackRequest] = useState(0);
    const [approving, setApproving] = useState(false);
    const [buyKey, setBuyKey] = useState(0);
    const viewport = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    const settings = useRef({ delay: 0, fail: false });
    const timers = useRef<number[]>([]);

    const clearTimers = () => { timers.current.forEach(id => window.clearTimeout(id)); timers.current = []; };
    const later = (ms: number, action: () => void) => { timers.current.push(window.setTimeout(action, ms)); };
    const go = (next: Screen) => {
        clearTimers();
        setApproving(false);
        setExitOpen(false);
        if (!BUY_SCREENS.includes(next)) setBuyKey(key => key + 1);
        setScreen(next);
    };

    useEffect(() => () => clearTimers(), []);
    // BuyTickets stays mounted behind the payment stand-in so "Ändra uppgifter" returns to its contact step.
    useEffect(() => {
        document.body.dataset.previewBuyHidden = String(BUY_SCREENS.includes(screen) && screen !== 'buy');
        return () => { delete document.body.dataset.previewBuyHidden; };
    }, [screen]);
    useEffect(() => { settings.current = { delay, fail }; }, [delay, fail]);
    useEffect(() => {
        const restore = installLocalTransport({ delay: () => settings.current.delay, fail: () => settings.current.fail });
        clearBuyFlowRecovery();
        const query = new URLSearchParams(location.search);
        // Mount guest components only after the development transport is installed.
        setFull(query.has('full'));
        if (SCREENS.includes(query.get('screen') as Screen)) setScreen(query.get('screen') as Screen);
        if (query.get('lang') === 'en' || query.get('lang') === 'sv') setLang(query.get('lang') as 'sv' | 'en');
        setReady(true);
        return restore;
    }, [setLang]);
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
            if (SCREENS.includes(event.data.screen)) go(event.data.screen);
            if (typeof event.data.delay === 'number') setDelay(Math.max(0, Math.min(5000, event.data.delay)));
            if (typeof event.data.fail === 'boolean') setFail(event.data.fail);
            if (event.data.lang === 'sv' || event.data.lang === 'en') setLang(event.data.lang);
            if (event.data.seekEnd) seekFilmToEnd();
            if (event.data.reset) { clearBuyFlowRecovery(); go('home'); setLang('sv'); }
        };
        window.addEventListener('message', receive);
        return () => window.removeEventListener('message', receive);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    useEffect(() => {
        frame.current?.contentWindow?.postMessage({ type: 'local-flow-preview', delay, fail, lang }, location.origin);
    }, [delay, fail, lang]);
    // Done at the approved payment (Love 2026-09-30): the real phone needs about a second for Cloud's
    // provisional number, then shows it; ROLLER confirms in the background without the guest.
    useEffect(() => {
        if (screen !== 'paid') return;
        const id = window.setTimeout(() => setScreen('done'), 900);
        return () => window.clearTimeout(id);
    }, [screen]);

    const post = (message: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ type: 'local-flow-preview', ...message }, location.origin);
    const navigate = (next: Screen) => { if (frame.current) post({ screen: next }); else go(next); };
    const reset = () => {
        clearBuyFlowRecovery(); go('home'); setLang('sv');
        post({ reset: true });
    };
    const approveSafety = () => {
        // Stands in for ready-for-staff on an existing booking: a short busy state, then the number.
        setApproving(true);
        later(900, () => { setApproving(false); setScreen('done'); });
    };
    const capturePayment = (event: MouseEvent) => {
        const button = (event.target as HTMLElement).closest('button');
        if (!button || button.disabled) return;
        if (button.matches('[data-testid=buy-contact-continue]')) {
            // The real button creates the ROLLER draft; the preview shows its payment stand-in instead.
            const total = button.closest('.phone-buy-flow')?.querySelector('.text-2xl.text-primary')?.textContent?.trim();
            event.preventDefault(); event.stopPropagation();
            setAmount(total || '200 kr');
            go('pay');
        } else if (button.matches('[data-testid=ready-for-staff-submit]') && button.closest('[data-add-product-status]')) {
            // Existing booking: the approval would create the add-on draft and open the card payment.
            event.preventDefault(); event.stopPropagation();
            go('addon-pay');
        } else if (button.closest('[data-testid=addons-review]')) {
            // The review now continues to safety; remember its total for the payment stand-in.
            const total = button.closest('[data-testid=addons-review]')?.querySelector('.text-xl.text-primary')?.textContent?.trim();
            if (total) setAmount(total);
        }
    };
    if (!ready) return <p>Öppnar lokal förhandsvisning…</p>;

    const buyLabels = [t.buyProgress.entry, t.buyProgress.addons, t.buyProgress.safety, t.buyProgress.payment, t.buyProgress.done];
    const bookingLabels = [t.progress.booking, t.progress.extras, t.progress.safety, t.progress.payment, t.progress.done];
    const bookingProgress = ({ booking: 0, addons: addonsStep === 'SAFETY' ? 2 : 1, safety: 2, 'addon-pay': 3 } as Partial<Record<Screen, number>>)[screen];
    const inBuyPath = BUY_SCREENS.includes(screen);

    const app = <FlowMotion><main className="phone-flow-shell relative flex min-h-dvh w-full min-w-0 flex-col items-center overflow-x-hidden p-3 pt-3 bg-background text-foreground" onClickCapture={capturePayment}>
        <style>{PREVIEW_GLOBAL_CSS}</style>
        <div className="phone-flow max-w-lg z-10 w-full min-w-0 flex flex-col items-center" data-preview-screen={screen}>
            {screen !== 'done' && <LanguageToggle compact={screen !== 'home'} className="absolute top-2 right-2 z-20" />}
            {bookingProgress !== undefined && (
                <div className="w-full max-w-md min-w-0 mx-auto mb-3 px-4"><PreviewProgress labels={bookingLabels} icons={BOOKING_ICONS} current={bookingProgress} /></div>
            )}
            <FlowTransition resetDocumentScroll variant={screen === 'home' ? 'fade' : 'slide'} screenKey={screen} className="phone-flow-content relative flex w-full max-w-full min-w-0 items-center justify-center">
                {screen === 'home' && <ParkChoice onSelect={choice => go(choice === 'BUY' ? 'buy' : 'lookup')} />}
                {screen === 'lookup' && <BookingLookup onBack={reset} onSuccess={async () => {
                    // Exercise the second, session-routing wait without a real session call.
                    await new Promise(resolve => setTimeout(resolve, settings.current.delay));
                    go('booking');
                }} />}
                {screen === 'booking' && <BookingSummary booking={BOOKING} onContinue={() => go('addons')} />}
                {screen === 'addons' && <AddonsOffer booking={BOOKING} guestCount={2} existingAddons={BOOKING.existingAddons!} safetyBeforePayment backRequest={addonsBackRequest}
                    onStepChange={setAddonsStep} onBackRuleChange={setAddonsBackRule} onContinue={() => go('safety')} onPendingDone={reset} />}
                {/* The safety approval came before this payment, so an approved add-on goes straight to the number. */}
                {screen === 'addon-pay' && (
                    <div className="w-full max-w-md min-w-0 mx-auto px-4">
                        <PreviewPayment language={lang} amountLabel={amount} onApproved={() => go('done')} onEdit={() => go('addons')} />
                    </div>
                )}
                {screen === 'safety' && <SafetyVideo key="booking" isSubmitting={approving} onApprove={approveSafety} />}
                {inBuyPath && (
                    // display: contents keeps BuyTickets a direct flex child, as on the real page.
                    <div className={screen === 'buy' ? 'contents' : 'hidden'} hidden={screen !== 'buy'}>
                        <BuyTickets key={buyKey} safetyBeforePayment onBack={reset} inlineExitVisible onRequestExit={() => setExitOpen(true)} onBookingReady={async () => () => { go('done'); }} />
                    </div>
                )}
                {screen === 'safety-buy' && (
                    <div className="phone-buy-flow w-full max-w-md min-w-0 mx-auto px-4">
                        <PreviewProgress labels={buyLabels} icons={BUY_ICONS} current={2} />
                        {/* Shortcut for design review; the real path runs through BuyTickets' own safety step. */}
                        <SafetyVideo key="buy" buyEntryFlow onApprove={() => go('pay')} />
                        <FlowNav onBack={() => go('buy')} onExit={() => setExitOpen(true)} />
                    </div>
                )}
                {(screen === 'pay' || screen === 'paid') && (
                    <div className="w-full max-w-md min-w-0 mx-auto px-4">
                        <PreviewProgress labels={buyLabels} icons={BUY_ICONS} current={3} />
                        {screen === 'pay'
                            ? <PreviewPayment language={lang} amountLabel={amount} onApproved={() => go('paid')} onEdit={() => setScreen('buy')} />
                            : <div className="w-full px-2 py-5"><PhonePaymentConfirmation language={lang} amountLabel={amount}
                                preparationState="preparing"
                                onContinueToSafety={() => undefined} /></div>}
                        {screen === 'pay' && <FlowNav onBack={() => setScreen('buy')} />}
                    </div>
                )}
                {screen === 'done' && <ConfirmationScreen booking={BOOKING} checkinSession={SESSION} jumperCount={2} selectedAddons={[]} channel="park-qr" onStartOver={reset} />}
            </FlowTransition>
            {['lookup', 'booking'].includes(screen) && <FlowNav onBack={() => go('home')} onExit={() => setExitOpen(true)} />}
            {/* As on the page: the add-on offer owns Back inside its own steps (review, safety), hidden during payment. */}
            {screen === 'addons' && <FlowNav
                onBack={addonsBackRule === 'hidden' ? null : addonsBackRule === 'select' ? () => setAddonsBackRequest(request => request + 1) : () => go('booking')}
                onExit={() => setExitOpen(true)} />}
            {/* Existing booking without add-ons: Back to the add-ons, no Exit (unchanged, D0194). */}
            {screen === 'safety' && <FlowNav onBack={() => go('addons')} />}
            {/* Before the add-on payment is sent, Back returns to the add-on selection, as on the page. */}
            {screen === 'addon-pay' && <FlowNav onBack={() => go('addons')} />}
            <ExitFlowDialog open={exitOpen} onClose={() => setExitOpen(false)} onConfirm={reset} />
        </div>
    </main></FlowMotion>;

    if (full) return app;
    return <div className={styles.shell}>
        <aside className={styles.controls}>
            <p className={styles.eyebrow}>LOCALHOST · TELEFON · #458</p><h1>Säkerhet före betalning</h1>
            <p>Riktiga skärmar i den nya ordningen. Betalning och ROLLER är lokala ersättare: inga köp, inga anrop till Park, Live eller ROLLER.</p>
            <button onClick={reset}>Börja om / nästa gäst</button>
            <p className={styles.group}>Köp entré</p>
            <button onClick={() => navigate('buy')}>1. Välj tid och biljett</button>
            <button onClick={() => navigate('safety-buy')}>2. Säkerhet (film + godkännande)</button>
            <button onClick={() => navigate('pay')}>3. Betalning (lokal ersättare)</button>
            <button onClick={() => navigate('done')}>4. Klar: nummer och QR direkt</button>
            <p className={styles.group}>Befintlig bokning</p>
            <button onClick={() => navigate('lookup')}>Sök bokning (skriv DEMO)</button>
            <button onClick={() => navigate('safety')}>Säkerhet utan tilläggsköp</button>
            <p className={styles.group}>Filmen</p>
            <button onClick={() => post({ seekEnd: true })}>Spola filmen till slutet (ljud av)</button>
            <label>Väntetid för testdata<select value={delay} onChange={e => setDelay(Number(e.target.value))}><option value={0}>Direkt</option><option value={1500}>1,5 sekunder</option><option value={5000}>5 sekunder</option></select></label>
            <label><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} /> Simulera nätverksfel</label>
            <button onClick={() => setLang(lang === 'sv' ? 'en' : 'sv')}>Byt språk · {lang.toUpperCase()}</button>
            <a href="?full=1" target="_blank" rel="noreferrer">Öppna utan testpanelen</a>
            <small>390 × 844. Godkännandet visas först när filmen har spelats klart. Tillbaka och Avsluta finns före betalningen. Befintlig bokning med tillägg: säkerhet efter tilläggen och före betalningen.</small>
        </aside>
        <div className={styles.viewport} ref={viewport}><div style={{ width: 390 * scale, height: 844 * scale }}><iframe ref={frame} title="Lokal telefonförhandsvisning" src="?full=1" className={styles.frame} style={{ transform: `scale(${scale})`, border: 0 }} onLoad={() => post({ delay, fail, lang })} /></div></div>
    </div>;
}
