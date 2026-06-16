'use client';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
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
    const qrPayload = handoffCode
        ? `JY_HANDOFF:${handoffCode}:${checkinSession?.checkinSessionId ?? booking.id}`
        : `JY_SESSION:${checkinSession?.checkinSessionId ?? booking.id}`;

    const entryHandoutLabel = t.confirm.wristbands;
    const handoutItems: { label: string; qty: number; icon: JumpyardIconName }[] = [
        { label: entryHandoutLabel, qty: jumperCount, icon: 'admission-ticket' },
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

                    {completed ? (
                        <div
                            className="mt-4 bg-success/10 p-4 rounded-xl border border-success/30 shadow-sm flex flex-col items-center"
                            data-testid="already-checked-in-card"
                        >
                            <p className="text-[11px] text-muted uppercase tracking-widest mb-0.5">{t.booking.ref}</p>
                            <p className="text-2xl font-black tracking-widest text-success">{booking.id}</p>
                            <p className="text-xs text-foreground mt-2">{t.confirm.alreadyCheckedInHelp}</p>
                        </div>
                    ) : (
                        <div
                            className="mt-4 bg-white p-4 rounded-xl border border-border shadow-sm flex flex-col items-center"
                            data-testid="handoff-qr-card"
                            data-qr-payload={qrPayload}
                        >
                            <QrCode value={qrPayload} className="w-36 h-36 mb-2" testId="handoff-qr-code" />
                            <p className="text-[11px] text-muted uppercase tracking-widest mb-0.5">{t.confirm.pickupCode}</p>
                            <p className="text-2xl font-black tracking-widest text-primary">
                                {handoffCode || '----'}
                            </p>
                        </div>
                    )}

                </div>

                {!completed && (
                    <div className="bg-surface-strong rounded-xl p-3 text-left border border-border mb-3">
                        <div className="flex items-center gap-2 mb-2">
                            <JumpyardIcon name="visitor-wristband" className="w-7 h-7" />
                            <h2 className="text-sm font-bold italic uppercase text-foreground">{t.confirm.staffHandout}</h2>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            {handoutItems.map((item, i) => (
                                <div key={i} className="flex justify-between items-center gap-3 bg-white px-3 py-2 rounded-lg border border-border shadow-sm">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <JumpyardIcon name={item.icon} className="w-8 h-8 flex-shrink-0" />
                                        <span className="text-foreground text-sm font-bold italic truncate">{item.label}</span>
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

                {!completed && onStartOver && (
                    <button
                        type="button"
                        onClick={onStartOver}
                        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm font-black italic uppercase text-foreground transition-all active:scale-[0.98]"
                        data-testid="confirmation-start-over"
                    >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        {t.confirm.done}
                    </button>
                )}
            </div>
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
