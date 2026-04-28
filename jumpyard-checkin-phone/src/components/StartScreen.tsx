'use client';
import { motion } from 'framer-motion';
import type { Channel } from '@/flow/types';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';

interface StartScreenProps {
    channel: Channel;
    onContinue: () => void;
}

export const StartScreen = ({ channel, onContinue }: StartScreenProps) => {
    const label = channel === 'park-qr' ? 'Park QR' : channel === 'sms' ? 'SMS Link' : 'Kiosk';
    const icon: JumpyardIconName = channel === 'park-qr' ? 'scan-frame' : channel === 'sms' ? 'booking-card' : 'booking-confirmed';

    return (
        <motion.div
            className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center text-center p-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
        >
            <div className="mb-10 p-10 bg-white/5 rounded-full border border-white/10 backdrop-blur-sm">
                <JumpyardIcon name={icon} className="w-32 h-32" />
            </div>

            <p className="text-sm text-zinc-400 uppercase tracking-[0.5em] font-bold mb-3">{label} Entry</p>
            <h1 className="text-5xl font-black italic uppercase text-white mb-4">Welcome</h1>
            <p className="text-xl text-zinc-400 mb-12 max-w-xl">
                Same check-in flow, whichever way you arrived.
            </p>

            <button
                onClick={onContinue}
                className="bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-2xl px-16 py-6 rounded-2xl transition-all shadow-[0_0_30px_rgba(227,24,55,0.3)]"
            >
                Start
            </button>
        </motion.div>
    );
};
