'use client';
import { FlowScreen } from '@/components/FlowTransition';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import { QrCode } from '@/components/QrCode';
import type { Addon, Booking, Channel, CheckInSession } from '@/flow/types';
import { getBookingContentRows, packageContentCopy } from '@/flow/packageContents';
import { isPhoneCompletionReady, isVisitDayOver } from '@/flow/phoneCompletion';
import { buildPickupGroups } from '@/flow/pickupPlaces';
import { BandColours } from './BandColours';
import { PhoneCompletion } from './PhoneCompletion';

interface ConfirmationScreenProps {
    booking: Booking;
    checkinSession: CheckInSession | null;
    jumperCount: number;
    selectedAddons: Addon[];
    channel?: Channel;
    alreadyCheckedIn?: boolean;
    /** #491: the guest paid in this flow, so the completion says the receipt was emailed. */
    receiptSent?: boolean;
    onStartOver?: () => void;
}

export const ConfirmationScreen = ({
    booking,
    checkinSession,
    jumperCount,
    selectedAddons,
    channel = 'park-qr',
    alreadyCheckedIn = false,
    receiptSent = false,
    onStartOver,
}: ConfirmationScreenProps) => {
    const { t, lang, setLang } = useTranslation();
    const completed = alreadyCheckedIn || isCompletedSession(checkinSession);
    const subtitle = channel === 'sms'
        ? t.confirm.smsSubtitle
        : channel === 'kiosk'
            ? t.confirm.kioskSubtitle
            : t.confirm.onsiteSubtitle;
    const handoffCode = checkinSession?.handoffCode ?? '';
    const handoffQrValue = buildHandoffPayload(checkinSession, handoffCode);
    const entryTicketLabel = getEntryTicketLabel(booking, t.confirm.entryTicketFallback);

    const contentRows = getBookingContentRows(booking, entryTicketLabel, jumperCount, lang);
    const labels = { connectedBands: t.confirm.connectedBands, later: packageContentCopy[lang].later, other: t.confirm.otherAddons };
    // #491: socks at the sock station, bands (with SkyRider and padlocks) at the wristband desk,
    // coffee, the water bottle and pizza at the café.
    const phoneGroups = buildPickupGroups({ contentRows, selectedAddons, cloudCafe: null, labels });
    const handoutItems = phoneGroups.filter((group) => group.key === 'socks' || group.key === 'bands').flatMap((group) => group.items);
    const experienceGroups = phoneGroups.filter((group) => group.key === 'later' || group.key === 'other');

    if (isPhoneCompletionReady(checkinSession, channel, alreadyCheckedIn)) {
        // GH-453 (D0229): Cloud's café lines (with what is already collected) replace the phone's own grouping.
        const cloudCafe = Array.isArray(checkinSession?.cafe) ? checkinSession.cafe : null;
        const completionGroups = buildPickupGroups({ contentRows, selectedAddons, cloudCafe, labels });
        return <PhoneCompletion key={checkinSession!.checkinSessionId} lang={lang} onLanguageChange={setLang}
            handoffCode={handoffCode} handoffPayload={handoffQrValue} handoffDay={checkinSession?.handoffDay}
            sessionId={checkinSession?.checkinSessionId} handoffStatus={checkinSession?.handoffStatus} channel={channel}
            presence={isVisitDayOver(checkinSession) ? 'ended' : 'arrived'}
            checkedInAt={checkinSession?.checkedInAt ?? checkinSession?.completedAt ?? null}
            visitDayLabel={formatVisitDay(checkinSession?.handoffDay, lang)}
            groups={completionGroups} receiptSent={receiptSent} onStartOver={onStartOver} />;
    }

    return (
        <FlowScreen
            className="w-full max-w-lg min-w-0 mx-auto flex flex-col items-center justify-center px-4 py-3 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            data-testid="confirmation-screen"
            data-checkin-session-id={checkinSession?.checkinSessionId ?? ''}
            data-handoff-code={handoffCode}
            data-handoff-status={checkinSession?.handoffStatus ?? ''}
            data-already-checked-in={String(completed)}
            data-confirmation-channel={channel}
        >
            <div className="w-full max-w-full min-w-0 text-foreground">

                <div className="flex flex-col items-center mb-4 border-b border-border pb-4">
                    <JumpyardIcon name="success-check" className="w-20 h-20 mb-2" />
                    <h1 className="break-words text-2xl font-black italic uppercase text-foreground mb-0.5">
                        {completed ? t.confirm.alreadyCheckedInTitle : t.confirm.title}
                    </h1>
                    <p className="text-foreground text-sm" data-testid="confirmation-subtitle">
                        {completed ? t.confirm.alreadyCheckedInSubtitle : subtitle}
                    </p>

                    {completed && (
                        <div
                            className="mt-4 max-w-full min-w-0 bg-success/10 p-4 rounded-xl border border-success/30 shadow-sm flex flex-col items-center"
                            data-testid="already-checked-in-card"
                        >
                            <p className="text-[11px] text-muted uppercase tracking-widest mb-0.5">{t.booking.ref}</p>
                            <p className="max-w-full break-all text-2xl font-black tracking-widest text-success">{booking.id}</p>
                            <p className="text-xs text-foreground mt-2">{t.confirm.alreadyCheckedInHelp}</p>
                        </div>
                    )}

                </div>

                {handoffQrValue && (
                    <div
                        className="mb-4 border-b border-border pb-4 text-center"
                        data-testid="ready-entry-handoff-card"
                    >
                        <p className="text-[10px] font-black italic uppercase tracking-wider text-primary">
                            {t.confirm.showStaffNote}
                        </p>
                        {handoffCode && <p data-testid="ready-entry-number" className="mt-2 text-5xl font-black tabular-nums tracking-wider">{handoffCode}</p>}
                        <QrCode
                            value={handoffQrValue}
                            className="mx-auto mt-3 h-40 w-40 rounded-xl border border-border bg-white p-2"
                            testId="ready-entry-handoff-qr"
                        />
                        <p className="mx-auto mt-3 max-w-[18rem] text-sm font-bold italic text-foreground">
                            {lang === 'sv' ? 'Visa samma nummer eller QR-kod i entrén och caféet.' : 'Use the same number or QR code at the entrance and café.'}
                        </p>
                        {checkinSession?.handoffDay && <p className="mt-1 text-xs font-medium">{lang === 'sv' ? 'Nummer från' : 'Number issued'} {checkinSession.handoffDay}</p>}
                    </div>
                )}

                {!completed && (
                    <div className="min-w-0 text-left mb-4">
                        <div className="flex items-center gap-2 mb-2">
                            <JumpyardIcon name="addons-bag" className="w-7 h-7" />
                            <h2 className="text-sm font-bold italic uppercase text-foreground">{t.confirm.staffHandout}</h2>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-border bg-white">
                            {handoutItems.map((item, i) => (
                                <div key={i} className="flex min-w-0 justify-between items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <JumpyardIcon name={item.icon} className="w-8 h-8 flex-shrink-0" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block break-words text-sm font-bold italic text-foreground" data-testid={item.testId}>{item.label}</span>
                                            {item.detail && (
                                                <span
                                                    className="block break-words text-[11px] font-black uppercase tracking-wide text-primary"
                                                >
                                                    {item.detail}
                                                </span>
                                            )}
                                            <BandColours colours={item.bandColours} lang={lang} total={item.qty} />
                                        </span>
                                    </div>
                                    <span className="shrink-0 text-xl font-black text-primary">{item.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!completed && experienceGroups.map((group) => (
                    <div key={group.key} className="min-w-0 text-left mb-3" data-testid={`confirmation-${group.key}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <JumpyardIcon name="addons-bag" className="w-6 h-6" />
                            <h2 className="text-xs font-bold italic uppercase text-foreground">{group.title}</h2>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-border bg-white">
                            {group.items.map((item, index) => (
                                <div key={`${item.label}-${index}`} className="flex min-w-0 justify-between items-center gap-2 border-b border-border px-3 py-2.5 last:border-b-0">
                                    <JumpyardIcon name={item.icon} className="w-8 h-8 flex-shrink-0" />
                                    <span className="min-w-0 flex-1 break-words text-foreground text-sm font-bold italic">
                                        {item.label}
                                        {item.detail && <span className="block text-[11px] uppercase text-primary">{item.detail}</span>}
                                    </span>
                                    <span className="shrink-0 text-xl font-black text-primary">{item.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

            </div>

            {onStartOver && (
                <button
                    type="button"
                    onClick={onStartOver}
                    className="mt-4 text-xs font-black italic uppercase text-foreground/70 underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary"
                    data-testid="confirmation-start-over"
                >
                    {t.confirm.done}
                </button>
            )}
        </FlowScreen>
    );
};

function formatVisitDay(day: string | null | undefined, lang: 'sv' | 'en') {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return new Intl.DateTimeFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    }).format(new Date(`${day}T12:00:00Z`));
}

function isCompletedSession(session: CheckInSession | null) {
    const status = `${session?.status ?? ''}`.toLowerCase();
    const handoffStatus = `${session?.handoffStatus ?? ''}`.toLowerCase();

    return (
        status === 'redeemed' ||
        status === 'completed' ||
        handoffStatus === 'completed'
    );
}

function buildHandoffPayload(session: CheckInSession | null, handoffCode: string) {
    if (!session?.checkinSessionId) return '';
    if (handoffCode) return `JY_HANDOFF:${handoffCode}:${session.checkinSessionId}`;
    return `JY_SESSION:${session.checkinSessionId}`;
}

function getEntryTicketLabel(booking: Booking, fallback: string) {
    const productLabel = booking.productLabel?.trim();
    if (productLabel) return productLabel;

    const durationLabel = getDurationLabel(booking);
    if (durationLabel && booking.productType === 'family') return `${durationLabel} familj`;
    if (durationLabel) return `${durationLabel} entré`;

    return fallback;
}

function getDurationLabel(booking: Booking) {
    if (booking.durationMinutes && booking.durationMinutes > 0) return `${booking.durationMinutes} min`;

    const labelMatch = booking.productLabel?.match(/\b(60|90|120)\s*min\b/i);
    return labelMatch ? `${labelMatch[1]} min` : '';
}
