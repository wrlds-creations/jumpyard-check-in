'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SafetyVideoProps {
    onComplete: (seenAt: string) => void;
    onBack: () => void;
}

const MOCK_VIDEO_SECONDS = 6;

export const SafetyVideo = ({ onComplete, onBack }: SafetyVideoProps) => {
    const { t } = useTranslation();
    const [playing, setPlaying] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!playing) return;
        const interval = setInterval(() => {
            setElapsed(e => {
                if (e + 1 >= MOCK_VIDEO_SECONDS) {
                    clearInterval(interval);
                    return MOCK_VIDEO_SECONDS;
                }
                return e + 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [playing]);

    const done = elapsed >= MOCK_VIDEO_SECONDS;
    const progress = Math.min(100, (elapsed / MOCK_VIDEO_SECONDS) * 100);

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <button onClick={onBack} className="self-start flex items-center gap-1 text-zinc-500 hover:text-white text-xs font-bold italic uppercase tracking-wider mb-3">
                <ArrowLeft size={14} /> {t.common.back}
            </button>

            <ShieldCheck className="text-primary mb-1" size={28} />
            <h1 className="text-xl font-black italic uppercase text-white mb-0.5">{t.safetyVideo.title}</h1>
            <p className="text-zinc-500 text-xs mb-3">{t.safetyVideo.description}</p>

            <div className="w-full max-w-[220px] mx-auto aspect-[9/16] bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-4 relative overflow-hidden">
                {!playing ? (
                    <button
                        onClick={() => setPlaying(true)}
                        className="w-16 h-16 rounded-full bg-primary hover:bg-white hover:text-black text-white flex items-center justify-center transition-all"
                    >
                        <Play size={32} />
                    </button>
                ) : (
                    <div className="text-white text-center">
                        <div className="text-4xl font-black italic mb-1">{MOCK_VIDEO_SECONDS - elapsed}s</div>
                        <p className="text-zinc-400 text-xs uppercase tracking-wider">{t.safetyVideo.playing}</p>
                    </div>
                )}
                <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>

            <button
                onClick={() => onComplete(new Date().toISOString())}
                disabled={!done}
                className="w-full bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40"
            >
                {done ? t.safetyVideo.done : t.safetyVideo.watchFull}
            </button>
        </motion.div>
    );
};
