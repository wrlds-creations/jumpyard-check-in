'use client';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SafetyVideoProps {
    onComplete: (seenAt: string) => void;
}

export const SafetyVideo = ({ onComplete }: SafetyVideoProps) => {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [done, setDone] = useState(false);
    const [progress, setProgress] = useState(0);

    const handlePlay = () => {
        setPlaying(true);
        videoRef.current?.play();
    };

    const handleTimeUpdate = () => {
        const v = videoRef.current;
        if (!v || !v.duration) return;
        setProgress((v.currentTime / v.duration) * 100);
    };

    const handleEnded = () => {
        setDone(true);
        setProgress(100);
    };

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

            <div className="w-full max-w-[280px] mx-auto aspect-[9/16] bg-black border border-border shadow-sm rounded-2xl relative overflow-hidden mb-4">
                <video
                    ref={videoRef}
                    src="/safety-video.mp4"
                    playsInline
                    preload="metadata"
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleEnded}
                    className="absolute inset-0 w-full h-full object-cover"
                />

                {/* Play overlay — shown before playing */}
                {!playing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-10">
                        <button
                            onClick={handlePlay}
                            className="w-16 h-16 rounded-full bg-primary hover:bg-surface text-white hover:text-primary hover:border-primary border border-transparent flex items-center justify-center transition-all shadow-md"
                        >
                            <Play size={32} className="ml-0.5" />
                        </button>
                    </div>
                )}

                {/* Bottom progress bar */}
                <div
                    className="absolute bottom-0 left-0 h-1 bg-primary z-20 transition-all"
                    style={{ width: `${progress}%` }}
                />
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
