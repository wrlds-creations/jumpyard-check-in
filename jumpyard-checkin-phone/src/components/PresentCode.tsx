'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QrCode } from 'lucide-react';
import { commitCheckin } from '@/flow/mockClient';
import { useTranslation } from '@/context/LanguageContext';

interface PresentCodeProps {
    bookingId: string;
    onDone: () => void;
}

export const PresentCode = ({ bookingId, onDone }: PresentCodeProps) => {
    const { t } = useTranslation();
    const [qrPayload, setQrPayload] = useState<string>('');
    const [shortCode, setShortCode] = useState<string>('');

    useEffect(() => {
        let alive = true;
        commitCheckin(bookingId).then(result => {
            if (!alive) return;
            setQrPayload(result.qrPayload);
            setShortCode(result.shortCode);
        });
        return () => {
            alive = false;
        };
    }, [bookingId]);

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center text-center px-4 py-3 text-foreground"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <p className="text-[11px] text-muted uppercase tracking-[0.4em] font-bold italic mb-1">{t.present.eyebrow}</p>
            <h1 className="text-2xl font-black italic uppercase text-foreground mb-4">{t.present.title}</h1>

            <div className="bg-white p-8 rounded-2xl mb-4 border border-border shadow-sm">
                <QrCode size={160} className="text-black" />
                <p className="text-[10px] text-muted font-mono mt-2 break-all max-w-[160px]">
                    {qrPayload || '…'}
                </p>
            </div>

            <div className="bg-surface border border-border rounded-xl px-8 py-3 mb-4">
                <p className="text-[11px] text-muted uppercase tracking-[0.3em] font-bold italic mb-1">{t.present.backupLabel}</p>
                <p className="text-3xl font-black tracking-[0.3em] text-primary font-mono">
                    {shortCode || '----'}
                </p>
            </div>

            <p className="text-muted mb-4 text-sm">{t.present.instruction}</p>

            <button
                onClick={onDone}
                className="bg-surface-strong hover:bg-border text-foreground font-bold italic uppercase px-8 py-3 rounded-xl transition-all border border-transparent hover:border-border"
            >
                {t.common.done}
            </button>
        </motion.div>
    );
};
