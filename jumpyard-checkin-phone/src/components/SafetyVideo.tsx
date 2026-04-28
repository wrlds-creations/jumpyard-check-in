'use client';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from '@/components/JumpyardIcon';

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
            className="w-full max-w-md mx-auto flex flex-col px-4 py-3"
            style={{ minHeight: 'calc(100dvh - 140px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-0.5">
                    <JumpyardIcon name="safety-check" className="w-8 h-8" />
                    <h1 className="text-xl font-black italic uppercase text-foreground">{t.safetyVideo.title}</h1>
                </div>
                <p className="text-muted text-xs mb-2">{t.safetyVideo.description}</p>
            </div>

            <div className="flex-1 flex items-center justify-center">
                <div className="w-full max-w-[260px] mx-auto aspect-[9/16] bg-black border border-border shadow-sm rounded-2xl relative overflow-hidden">
                    <video
                        ref={videoRef}
                        src="/safety-video.mp4"
                        playsInline
                        preload="metadata"
                        onTimeUpdate={handleTimeUpdate}
                        onEnded={handleEnded}
                        className="absolute inset-0 w-full h-full object-cover"
                    />

                    {/* Flame mark — top-left corner */}
                    <img
                        src="/jumpyard_logo_splash.png"
                        alt=""
                        className="absolute top-2 left-2 w-7 h-7 object-contain z-10 opacity-80"
                    />

                    {/* Play overlay */}
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
            </div>

            {/* Sticky CTA area */}
            <div className="pt-3 mt-auto">
                <button
                    onClick={() => onComplete(new Date().toISOString())}
                    disabled={!done}
                    className="w-full bg-primary hover:bg-surface hover:text-primary hover:border-primary border border-transparent text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40 shadow-sm"
                >
                    {done ? t.safetyVideo.done : t.safetyVideo.watchFull}
                </button>
            </div>
        </motion.div>
    );
};
