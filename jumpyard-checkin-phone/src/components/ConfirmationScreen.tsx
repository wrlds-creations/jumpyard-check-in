'use client';
import { motion } from 'framer-motion';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { QrCode } from '@/components/QrCode';
import type { Addon, Booking, Channel, CheckInSession } from '@/flow/types';

interface ConfirmationScreenProps {
    booking: Booking;
    checkinSession: CheckInSession | null;
    jumperCount: number;
    selectedAddons: Addon[];
    channel?: Channel;
    alreadyCheckedIn?: boolean;
    onStartOver?: () => void;
}

// Items that staff hand out at check-in.
const HANDOUT_IDS = new Set(['socks', 'connected', 'lock', 'skyrider']);
// Non-physical / experience addons
const EXPERIENCE_IDS = new Set(['coffee', 'extra_person']);

const HANDOUT_ICONS: Partial<Record<Addon['id'], JumpyardIconName>> = {
    connected: 'connected-band',
    socks: 'grip-socks',
    lock: 'padlock',
    skyrider: 'zipline',
};

const EXPERIENCE_ICONS: Partial<Record<Addon['id'], JumpyardIconName>> = {
    coffee: 'drink-cup',
    extra_person: 'add-guest',
};

export const ConfirmationScreen = ({
    booking,
    checkinSession,
    jumperCount,
    selectedAddons,
    channel = 'park-qr',
    alreadyCheckedIn = false,
    onStartOver,
}: ConfirmationScreenProps) => {
    const { t } = useTranslation();
    const completed = alreadyCheckedIn || isCompletedSession(checkinSession);
    const subtitle = channel === 'sms'
        ? t.confirm.smsSubtitle
        : channel === 'kiosk'
            ? t.confirm.kioskSubtitle
            : t.confirm.onsiteSubtitle;
    const handoffCode = checkinSession?.handoffCode ?? '';
    const handoffQrValue = buildHandoffPayload(checkinSession, handoffCode);
    const entryTicketLabel = getEntryTicketLabel(booking, t.confirm.entryTicketFallback);

    const handoutItems: { detail?: string; icon: JumpyardIconName; label: string; qty: number; testId?: string }[] = [
        {
            icon: 'visitor-wristband',
            label: entryTicketLabel,
            qty: jumperCount,
            testId: 'ready-entry-ticket-type',
        },
    ];
    for (const addon of selectedAddons) {
        if (HANDOUT_IDS.has(addon.id)) {
            const label = addon.id === 'connected' ? t.confirm.connectedBands : addon.label;
            handoutItems.push({ label, qty: addon.qty, icon: HANDOUT_ICONS[addon.id] ?? 'gift-card' });
        }
    }

    const experienceItems = selectedAddons.filter(a => EXPERIENCE_IDS.has(a.id));

    return (
        <motion.div
            className="w-full max-w-lg mx-auto flex flex-col items-center justify-center px-4 py-3 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            data-testid="confirmation-screen"
            data-checkin-session-id={checkinSession?.checkinSessionId ?? ''}
            data-handoff-code={handoffCode}
            data-handoff-status={checkinSession?.handoffStatus ?? ''}
            data-already-checked-in={String(completed)}
            data-confirmation-channel={channel}
        >
            <div className="bg-surface p-5 rounded-2xl border border-border w-full shadow-sm text-foreground">

                <div className="flex flex-col items-center mb-4 border-b border-border pb-4">
                    <JumpyardIcon name="success-check" className="w-20 h-20 mb-2" />
                    <h1 className="text-2xl font-black italic uppercase text-foreground mb-0.5">
                        {completed ? t.confirm.alreadyCheckedInTitle : t.confirm.title}
                    </h1>
                    <p className="text-muted text-sm" data-testid="confirmation-subtitle">
                        {completed ? t.confirm.alreadyCheckedInSubtitle : subtitle}
                    </p>

                    {completed && (
                        <div
                            className="mt-4 bg-success/10 p-4 rounded-xl border border-success/30 shadow-sm flex flex-col items-center"
                            data-testid="already-checked-in-card"
                        >
                            <p className="text-[11px] text-muted uppercase tracking-widest mb-0.5">{t.booking.ref}</p>
                            <p className="text-2xl font-black tracking-widest text-success">{booking.id}</p>
                            <p className="text-xs text-foreground mt-2">{t.confirm.alreadyCheckedInHelp}</p>
                        </div>
                    )}

                </div>

                {!completed && handoffQrValue && (
                    <div
                        className="mb-3 rounded-xl border border-primary/20 bg-white p-3 text-center shadow-sm"
                        data-testid="ready-entry-handoff-card"
                    >
                        <QrCode
                            value={handoffQrValue}
                            className="mx-auto h-36 w-36 rounded-lg border border-border p-2"
                            testId="ready-entry-handoff-qr"
                        />
                        <p className="mt-2 text-[10px] font-bold italic uppercase tracking-widest text-muted">
                            {t.confirm.handoffTitle}
                        </p>
                        <p className="mt-1 text-xs text-foreground/65">{t.confirm.qrHelp}</p>
                    </div>
                )}

                {!completed && (
                    <div className="bg-surface-strong rounded-xl p-3 text-left border border-border mb-3">
                        <div className="flex items-center gap-2 mb-2">
                            <JumpyardIcon name="addons-bag" className="w-7 h-7" />
                            <h2 className="text-sm font-bold italic uppercase text-foreground">{t.confirm.staffHandout}</h2>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            {handoutItems.map((item, i) => (
                                <div key={i} className="flex justify-between items-center gap-3 bg-white px-3 py-2 rounded-lg border border-border shadow-sm">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <JumpyardIcon name={item.icon} className="w-8 h-8 flex-shrink-0" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-bold italic text-foreground">{item.label}</span>
                                            {item.detail && (
                                                <span
                                                    className="block truncate text-[11px] font-black uppercase tracking-wide text-primary"
                                                    data-testid={item.testId}
                                                >
                                                    {item.detail}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <span className="text-xl font-black text-primary">{item.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!completed && experienceItems.length > 0 && (
                    <div className="bg-surface-strong rounded-xl p-3 text-left border border-border mb-3">
                        <div className="flex items-center gap-2 mb-2">
                            <JumpyardIcon name="addons-bag" className="w-6 h-6" />
                            <h2 className="text-xs font-bold italic uppercase text-muted">{t.confirm.otherAddons}</h2>
                        </div>
                        <div className="flex flex-col gap-1">
                            {experienceItems.map(item => (
                                <div key={item.id} className="flex justify-between items-center gap-2 px-3 py-1.5">
                                    <JumpyardIcon name={EXPERIENCE_ICONS[item.id] ?? 'gift-card'} className="w-6 h-6 flex-shrink-0" />
                                    <span className="text-foreground text-sm flex-1">{item.label} x{item.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {!completed && onStartOver && (
                <button
                    type="button"
                    onClick={onStartOver}
                    className="mt-3 inline-flex w-auto min-w-[190px] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black italic uppercase text-white shadow-sm transition-all active:scale-[0.98]"
                    data-testid="confirmation-start-over"
                >
                    <JumpyardIcon name="add-jump-session" className="h-6 w-6 brightness-0 invert" />
                    {t.confirm.done}
                </button>
            )}
        </motion.div>
    );
};

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
