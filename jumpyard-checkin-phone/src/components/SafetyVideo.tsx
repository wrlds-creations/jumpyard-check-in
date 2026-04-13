'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SafetyVideoProps {
    onComplete: (seenAt: string) => void;
}

const MOCK_VIDEO_SECONDS = 6;

export const SafetyVideo = ({ onComplete }: SafetyVideoProps) => {
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
            <ShieldCheck className="text-primary mb-1" size={28} />
            <h1 className="text-xl font-black italic uppercase text-foreground mb-0.5">{t.safetyVideo.title}</h1>
            <p className="text-muted text-xs mb-3">{t.safetyVideo.description}</p>

            <div className="w-full max-w-[280px] mx-auto aspect-[9/16] bg-surface-strong border border-border shadow-sm rounded-2xl flex flex-col items-center justify-center mb-4 relative overflow-hidden">
                {/* Poster frame overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {!playing ? (
                        <>
                            <ShieldCheck className="text-muted/30 mb-3" size={64} />
                            <p className="text-foreground font-bold italic text-sm mb-1">{t.safetyVideo.title}</p>
                            <p className="text-muted text-[11px] mb-4">~{MOCK_VIDEO_SECONDS} sek</p>
                            <button
                                onClick={() => setPlaying(true)}
                                className="w-14 h-14 rounded-full bg-primary hover:bg-surface text-white hover:text-primary hover:border-primary border border-transparent flex items-center justify-center transition-all shadow-md"
                            >
                                <Play size={28} className="ml-0.5" />
                            </button>
                        </>
                    ) : (
                        <>
                            <ShieldCheck className="text-primary/20 mb-2" size={48} />
                            <p className="text-muted text-xs uppercase tracking-wider mb-1">{t.safetyVideo.playing}</p>
                            <div className="w-24 h-1.5 rounded-full bg-surface overflow-hidden">
                                <div
                                    className="h-full bg-primary rounded-full transition-all duration-1000"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-foreground text-sm font-bold italic mt-2">
                                {MOCK_VIDEO_SECONDS - elapsed}s
                            </p>
                        </>
                    )}
                </div>
                {/* Bottom progress bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>

            <button
                onClick={() => onComplete(new Date().toISOString())}
                disabled={!done}
                className="w-full bg-primary hover:bg-surface hover:text-primary hover:border-primary border border-transparent text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40 shadow-sm"
            >
                {done ? t.safetyVideo.done : t.safetyVideo.watchFull}
            </button>
        </motion.div>
    );
};
