'use client';
import { motion } from 'framer-motion';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import type { SessionIssue } from '@/flow/cloudClient';
import type { Addon, Booking } from '@/flow/types';
import { getBookingContentRows, packageContentCopy } from '@/flow/packageContents';

interface BookingSummaryProps {
    booking: Booking;
    onContinue: () => void;
    isStartingSession?: boolean;
    sessionStartError?: SessionIssue | null;
}

const ADDON_ICONS: Record<Addon['id'], JumpyardIconName> = {
    skyrider: 'zipline',
    connected: 'connected-band',
    coffee: 'drink-cup',
    extra_person: 'add-guest',
    lock: 'padlock',
    socks: 'grip-socks',
    water_bottle: 'water-bottle',
};

export const BookingSummary = ({ booking, onContinue, isStartingSession = false, sessionStartError = null }: BookingSummaryProps) => {
    const { t, lang } = useTranslation();

    const existingAddons: Addon[] = booking?.existingAddons ?? [];
    const canStartCheckIn = Boolean(booking?.paid);
    // GH-338: a partially paid booking is settled at the register, not through the phone.
    const checkInAtRegister = booking?.paymentState === 'partially_paid';
    const productQuantity = Math.max(1, Number(booking?.jumpers || booking?.products || 1));
    const productLabel = getBookingProductLabel(booking, t.booking.product);
    const contentRows = getBookingContentRows(booking, productLabel, productQuantity, lang);

    const timeDisplay = booking?.endTime
        ? `${booking.time}–${booking.endTime}`
        : booking?.time || '14:00';

    const durationDisplay = booking?.durationMinutes
        ? `${booking.durationMinutes} min`
        : null;

    const guestDisplay = [booking?.guestName, booking?.lastName].filter(Boolean).join(' ');

    return (
        <motion.div
            data-testid="booking-summary"
            data-booking-reference={booking.id}
            data-lookup-source-system={booking.lookupSource?.system ?? ''}
            data-lookup-source-freshness={booking.lookupSource?.freshnessStatus ?? ''}
            data-lookup-refreshed-from-roller={String(Boolean(booking.lookupSource?.refreshedFromRoller))}
            data-payment-status={booking.paymentStatus ?? ''}
            data-amount-owing={booking.amountOwing ?? ''}
            className="w-full max-w-md min-w-0 mx-auto flex flex-col items-center justify-center px-4 py-3 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <h1 className="text-xl font-black italic uppercase text-foreground">{t.booking.title}</h1>
            {guestDisplay && (
                <p className="text-base font-bold italic text-foreground opacity-90 mt-0.5">{guestDisplay}</p>
            )}

            <div className="mt-4 w-full max-w-full min-w-0 text-left mb-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="min-w-0 bg-white p-2.5 rounded-xl border border-border shadow-sm">
                        <JumpyardIcon name="time" className="w-6 h-6 mb-0.5" />
                        <p className="text-foreground font-bold italic text-sm">{timeDisplay}</p>
                        {durationDisplay && <p className="text-primary text-[11px] font-bold italic">{durationDisplay}</p>}
                        <p className="text-foreground text-[10px] uppercase">{t.booking.time}</p>
                    </div>
                    <div className="min-w-0 bg-white p-2.5 rounded-xl border border-border shadow-sm">
                        <JumpyardIcon name="admission-ticket" className="w-6 h-6 mb-0.5" />
                        <p className="text-foreground font-bold italic text-lg">{productQuantity}</p>
                        <p className="text-foreground text-[10px] uppercase">{t.booking.tickets}</p>
                    </div>
                </div>

                <div className="mb-3 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                    {contentRows.map((item) => <div key={item.key} className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-3" data-booking-content={item.kind}>
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <JumpyardIcon name={item.kind === 'pizza' ? 'combo-pizza' : booking.admissionItems?.length ? 'visitor-wristband' : 'admission-ticket'} className="w-8 h-8 flex-shrink-0" />
                            <span className="min-w-0 break-words text-sm font-bold italic text-foreground">
                                {item.label}
                                {item.detail && <span className="block text-[11px] uppercase text-primary">{item.detail}</span>}
                                {item.collection === 'later' && <span className="block text-xs font-normal not-italic">{packageContentCopy[lang].later}</span>}
                            </span>
                        </div>
                        <span className="shrink-0 text-lg font-black italic text-primary">x{item.quantity}</span>
                    </div>)}
                    {existingAddons.length > 0 ? (
                        existingAddons.map((addon) => (
                            <div key={addon.id} className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-3 last:border-b-0">
                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                    <JumpyardIcon name={ADDON_ICONS[addon.id]} className="w-8 h-8 flex-shrink-0" />
                                    <span className="min-w-0 break-words text-sm font-bold italic text-foreground">{addon.label}</span>
                                </div>
                                <span className="shrink-0 text-lg font-black italic text-primary">x{addon.qty}</span>
                            </div>
                        ))
                    ) : !booking.admissionItems?.length && (
                        <div className="flex min-w-0 items-center gap-2.5 px-3 py-3">
                            <JumpyardIcon name="addons-bag" className="w-8 h-8 flex-shrink-0" />
                            <span className="text-sm font-bold italic text-foreground">{t.booking.none}</span>
                        </div>
                    )}
                </div>

                <div className={`flex min-w-0 items-center gap-2.5 p-2.5 rounded-xl border mb-3 ${
                    booking?.paid
                        ? 'bg-success/10 border-success/30'
                        : 'bg-amber-50 border-amber-200'
                }`}>
                    {booking?.paid
                        ? <JumpyardIcon name="success-check" className="w-8 h-8 flex-shrink-0" />
                        : <JumpyardIcon name="payment-card" className="w-8 h-8 flex-shrink-0" />
                    }
                    <div className="min-w-0">
                        <p className={`font-bold italic uppercase text-[11px] ${booking?.paid ? 'text-success' : 'text-amber-600'}`}>
                            {t.payment.title}
                        </p>
                        <p className="text-foreground text-sm italic">
                            {booking?.paid ? t.booking.paidInFull : checkInAtRegister ? t.booking.partiallyPaid : t.booking.notPaid}
                        </p>
                    </div>
                </div>

                <div className="flex min-w-0 justify-between gap-3 items-center border-t border-border pt-3">
                    <p className="shrink-0 text-foreground font-bold italic uppercase tracking-wider text-[11px]">{t.booking.ref}</p>
                    <p className="min-w-0 break-all text-right text-foreground font-black italic tracking-wider text-sm">{booking?.id || 'TEST1234'}</p>
                </div>
            </div>

            {canStartCheckIn && (
                <p className="mb-2 text-center text-xs font-bold italic text-foreground">{t.booking.subtitle}</p>
            )}

            <button
                data-testid="booking-start-checkin"
                data-session-start-state={isStartingSession ? 'starting' : sessionStartError ? 'error' : 'idle'}
                onClick={onContinue}
                disabled={!canStartCheckIn || isStartingSession}
                className="w-full bg-primary hover:bg-surface hover:text-primary border border-transparent hover:border-primary text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-sm disabled:bg-surface-strong disabled:text-muted disabled:border-border disabled:cursor-not-allowed"
            >
                {isStartingSession
                    ? t.booking.startingSession
                    : canStartCheckIn
                        ? t.booking.cta
                        : checkInAtRegister
                            ? t.booking.checkInAtRegisterCta
                            : t.booking.paymentRequiredCta}
            </button>
            {sessionStartError && (
                <p data-testid="booking-start-error" className="text-amber-700 text-[11px] text-center mt-2">
                    {getSessionStartErrorText(sessionStartError, t)}
                </p>
            )}
            {!canStartCheckIn && (
                <p data-testid="booking-payment-hint" className="text-foreground text-[11px] text-center mt-2">
                    {checkInAtRegister ? t.booking.checkInAtRegisterHint : t.booking.paymentRequiredHint}
                </p>
            )}
        </motion.div>
    );
};

function getSessionStartErrorText(error: SessionIssue, t: ReturnType<typeof useTranslation>['t']) {
    if (error === 'payment_required') return t.booking.sessionPaymentRequired;
    if (error === 'wrong_date') return t.booking.sessionWrongDate;
    if (error === 'already_redeemed') return t.booking.sessionAlreadyRedeemed;
    if (error === 'booking_not_fresh') return t.booking.sessionNotFresh;
    return t.booking.sessionStartFailed;
}

function getBookingProductLabel(booking: Booking, fallback: string) {
    const productLabel = booking.productLabel?.trim();
    if (productLabel) return productLabel;

    const durationLabel = booking.durationMinutes && booking.durationMinutes > 0
        ? `${booking.durationMinutes} min`
        : '';
    if (durationLabel && booking.productType === 'family') return `${durationLabel} familj`;
    if (durationLabel) return `${durationLabel} entré`;

    return fallback;
}
