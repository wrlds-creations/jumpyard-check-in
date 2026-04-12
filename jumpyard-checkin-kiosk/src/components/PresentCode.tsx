'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QrCode } from 'lucide-react';
import { commitCheckin } from '@/flow/mockClient';

interface PresentCodeProps {
    bookingId: string;
    onDone: () => void;
}

export const PresentCode = ({ bookingId, onDone }: PresentCodeProps) => {
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
            className="w-full max-w-md mx-auto flex flex-col items-center text-center px-4 py-3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <p className="text-[11px] text-zinc-400 uppercase tracking-[0.4em] font-bold italic mb-1">Show this at the entrance</p>
            <h1 className="text-2xl font-black italic uppercase text-white mb-4">Ready For Park</h1>

            <div className="bg-white p-8 rounded-2xl mb-4 shadow-[0_0_60px_rgba(255,255,255,0.15)]">
                <QrCode size={160} className="text-black" />
                <p className="text-[10px] text-zinc-500 font-mono mt-2 break-all max-w-[160px]">
                    {qrPayload || '…'}
                </p>
            </div>

            <div className="bg-zinc-900 border border-primary/50 rounded-xl px-8 py-3 mb-4">
                <p className="text-[11px] text-zinc-400 uppercase tracking-[0.3em] font-bold italic mb-1">Backup code</p>
                <p className="text-3xl font-black tracking-[0.3em] text-primary font-mono">
                    {shortCode || '----'}
                </p>
            </div>

            <p className="text-zinc-500 mb-4 text-sm">Show the QR code or backup code to staff for band pairing.</p>

            <button
                onClick={onDone}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold italic uppercase px-8 py-3 rounded-xl transition-all"
            >
                Start Over
            </button>
        </motion.div>
    );
};
