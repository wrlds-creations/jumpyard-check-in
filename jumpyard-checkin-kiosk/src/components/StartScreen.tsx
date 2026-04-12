'use client';
import { motion } from 'framer-motion';
import { Smartphone, QrCode, Monitor } from 'lucide-react';
import type { Channel } from '@/flow/types';

interface StartScreenProps {
    channel: Channel;
    onContinue: () => void;
}

export const StartScreen = ({ channel, onContinue }: StartScreenProps) => {
    const label = channel === 'park-qr' ? 'Park QR' : channel === 'sms' ? 'SMS Link' : 'Kiosk';
    const Icon = channel === 'park-qr' ? QrCode : channel === 'sms' ? Smartphone : Monitor;

    return (
        <motion.div
            className="w-full max-w-lg mx-auto flex flex-col items-center justify-center text-center px-4 py-3"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
        >
            <div className="mb-6 p-8 bg-white/5 rounded-full border border-white/10 backdrop-blur-sm">
                <Icon size={80} className="text-primary" />
            </div>

            <p className="text-xs text-zinc-400 uppercase tracking-[0.5em] font-bold italic mb-1">{label} Entry</p>
            <h1 className="text-4xl font-black italic uppercase text-white mb-2">Welcome</h1>
            <p className="text-base text-zinc-400 mb-8 max-w-md">
                Same check-in flow, whichever way you arrived.
            </p>

            <button
                onClick={onContinue}
                className="bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-xl px-12 py-5 rounded-2xl transition-all shadow-[0_0_30px_rgba(227,24,55,0.3)]"
            >
                Start
            </button>
        </motion.div>
    );
};
