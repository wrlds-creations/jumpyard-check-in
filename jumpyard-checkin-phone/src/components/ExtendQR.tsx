'use client';
import { motion } from 'framer-motion';
import { QrCode } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface ExtendQRProps {
    qrToken: string;
    newEnd: string;
}

export const ExtendQR = ({ qrToken, newEnd }: ExtendQRProps) => {
    const { t } = useTranslation();
    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center text-center p-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <p className="text-sm text-zinc-400 uppercase tracking-[0.4em] font-bold mb-3">{t.extend.qr.eyebrow}</p>
            <h1 className="text-3xl font-black italic uppercase text-white mb-2">{t.extend.qr.title}</h1>
            <p className="text-zinc-400 mb-6">
                {t.extend.qr.newEndPrefix} <span className="text-white font-bold">{newEnd}</span>
            </p>

            <div className="bg-white p-8 rounded-3xl mb-6 shadow-[0_0_60px_rgba(255,255,255,0.2)]">
                <QrCode size={200} className="text-black" />
                <p className="text-[10px] text-zinc-500 font-mono mt-3 break-all max-w-[200px]">{qrToken}</p>
            </div>

            <div className="bg-zinc-900 border border-primary/50 rounded-2xl px-6 py-4 text-left">
                <p className="text-xs text-zinc-400 uppercase tracking-[0.3em] font-bold mb-2">{t.extend.qr.nextStepLabel}</p>
                <p className="text-white font-bold">{t.extend.qr.nextStepText}</p>
            </div>
        </motion.div>
    );
};
