'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, QrCode, Package, ShoppingBag } from 'lucide-react';
import { commitCheckin } from '@/flow/mockClient';
import { useTranslation } from '@/context/LanguageContext';
import type { Addon } from '@/flow/types';

interface ConfirmationScreenProps {
    booking: any;
    jumperCount: number;
    selectedAddons: Addon[];
    onDone: () => void;
}

// Physical items that staff hand out
const HANDOUT_IDS = new Set(['socks', 'connected', 'lock']);
// Non-physical / experience addons
const EXPERIENCE_IDS = new Set(['skyrider', 'coffee', 'extra_person']);

export const ConfirmationScreen = ({ booking, jumperCount, selectedAddons, onDone }: ConfirmationScreenProps) => {
    const { t } = useTranslation();
    const [qrPayload, setQrPayload] = useState('');
    const [shortCode, setShortCode] = useState('');

    useEffect(() => {
        let alive = true;
        if (booking?.id) {
            commitCheckin(booking.id).then(result => {
                if (!alive) return;
                setQrPayload(result.qrPayload);
                setShortCode(result.shortCode);
            });
        }
        return () => { alive = false; };
    }, [booking?.id]);

    const handoutItems: { label: string; qty: number }[] = [
        { label: t.confirm.wristbands, qty: jumperCount },
    ];
    for (const addon of selectedAddons) {
        if (HANDOUT_IDS.has(addon.id)) {
            const label = addon.id === 'connected' ? t.confirm.connectedBands : addon.label;
            handoutItems.push({ label, qty: addon.qty });
        }
    }

    const experienceItems = selectedAddons.filter(a => EXPERIENCE_IDS.has(a.id));

    return (
        <motion.div
            className="w-full max-w-lg mx-auto flex flex-col items-center justify-center px-4 py-3 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <div className="bg-surface p-5 rounded-2xl border border-border w-full shadow-sm text-foreground">

                <div className="flex flex-col items-center mb-4 border-b border-border pb-4">
                    <CheckCircle className="text-success mb-2" size={56} />
                    <h1 className="text-2xl font-black italic uppercase text-foreground mb-0.5">{t.confirm.title}</h1>
                    <p className="text-muted text-sm">{t.confirm.subtitle}</p>

                    <div className="mt-4 bg-white p-4 rounded-xl border border-border shadow-sm flex flex-col items-center">
                        <QrCode className="text-foreground mb-2" size={100} />
                        <p className="text-[11px] text-muted uppercase tracking-widest mb-0.5">{t.confirm.pickupCode}</p>
                        <p className="text-2xl font-black tracking-widest text-primary">
                            {shortCode || '----'}
                        </p>
                        <p className="text-[10px] text-muted font-mono mt-1 break-all max-w-[160px]">
                            {qrPayload || '…'}
                        </p>
                    </div>

                    {shortCode && (
                        <div className="mt-3 bg-surface-strong border border-border rounded-lg px-4 py-2">
                            <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">{t.confirm.backupLabel}</p>
                            <p className="text-xl font-black tracking-[0.3em] text-primary font-mono">{shortCode}</p>
                        </div>
                    )}
                </div>

                <div className="bg-surface-strong rounded-xl p-3 text-left border border-border mb-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="text-primary" size={18} />
                        <h2 className="text-sm font-bold italic uppercase text-foreground">{t.confirm.staffHandout}</h2>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        {handoutItems.map((item, i) => (
                            <div key={i} className="flex justify-between items-center bg-white px-3 py-2 rounded-lg border border-border shadow-sm">
                                <span className="text-foreground text-sm font-bold italic">{item.label}</span>
                                <span className="text-xl font-black text-primary">{item.qty}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {experienceItems.length > 0 && (
                    <div className="bg-surface-strong rounded-xl p-3 text-left border border-border mb-3">
                        <div className="flex items-center gap-2 mb-2">
                            <ShoppingBag className="text-muted" size={16} />
                            <h2 className="text-xs font-bold italic uppercase text-muted">{t.confirm.otherAddons}</h2>
                        </div>
                        <div className="flex flex-col gap-1">
                            {experienceItems.map(item => (
                                <div key={item.id} className="flex justify-between items-center px-3 py-1.5">
                                    <span className="text-foreground text-sm">{item.label} x{item.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-col items-center gap-3 mt-1">
                    <img
                        src="/jumpyard_logo_splash.png"
                        alt=""
                        className="w-8 h-8 object-contain opacity-60"
                    />
                    <button
                        onClick={onDone}
                        className="text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider transition-colors"
                    >
                        {t.confirm.done}
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
