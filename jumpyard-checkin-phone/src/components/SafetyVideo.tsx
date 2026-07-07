'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface SafetyVideoProps {
    onComplete: (seenAt: string) => void;
    buyEntryFlow?: boolean;
}

export const SafetyVideo = ({ onComplete, buyEntryFlow = false }: SafetyVideoProps) => {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playing, setPlaying] = useState(false);
    const [done, setDone] = useState(false);
    const [progress, setProgress] = useState(0);
    const [videoWidth, setVideoWidth] = useState(320);
    const title = buyEntryFlow ? t.safetyVideo.buyTitle : t.safetyVideo.title;
    const description = buyEntryFlow ? t.safetyVideo.buyDescription : t.safetyVideo.description;
    const doneLabel = buyEntryFlow ? t.safetyVideo.buyDone : t.safetyVideo.done;

    useEffect(() => {
        const updateVideoSize = () => {
            const widthLimit = Math.min(window.innerWidth - 24, 382);
            const heightLimit = window.innerHeight - 122;
            const widthByHeight = heightLimit * 9 / 16;
            setVideoWidth(Math.max(220, Math.floor(Math.min(widthLimit, widthByHeight))));
        };

        updateVideoSize();
        window.addEventListener('resize', updateVideoSize);
        return () => window.removeEventListener('resize', updateVideoSize);
    }, []);

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
        setPlaying(false);
        setProgress(100);
    };

    const handleReplay = () => {
        const video = videoRef.current;
        setDone(false);
        setProgress(0);
        setPlaying(true);
        if (video) {
            video.currentTime = 0;
            void video.play();
        }
    };

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex min-h-0 flex-col items-center justify-center px-3 py-1"
            style={{ minHeight: 'calc(100dvh - 118px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <div className="flex w-full flex-1 items-center justify-center">
                <div
                    className="relative mx-auto aspect-[9/16] max-w-full overflow-hidden rounded-2xl border border-border bg-black shadow-sm"
                    style={{ width: `${videoWidth}px` }}
                >
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

                    {!playing && !done && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 px-5 text-center">
                            <h1 className="text-2xl font-black italic uppercase leading-tight text-primary">
                                {title}
                            </h1>
                            <span className="mt-3 rounded-full bg-white px-3 py-1 text-[11px] font-black italic uppercase tracking-wider text-primary">
                                {t.safetyVideo.durationBadge}
                            </span>
                            <p className="mt-2 max-w-[17rem] text-sm font-black italic uppercase leading-tight text-white">
                                {description}
                            </p>
                            <button
                                onClick={handlePlay}
                                aria-label={t.safetyVideo.play}
                                className="mt-5 flex h-16 w-16 items-center justify-center rounded-full border border-transparent bg-primary text-white shadow-md transition-all active:scale-[0.96]"
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

                    {done && (
                        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4">
                        <button
                            onClick={() => onComplete(new Date().toISOString())}
                            className="w-full rounded-2xl border border-transparent bg-primary py-4 text-base font-black italic uppercase text-white shadow-sm transition-all active:scale-[0.98]"
                        >
                            {doneLabel}
                        </button>
                        <button
                            onClick={handleReplay}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/95 py-3 text-sm font-black italic uppercase text-foreground transition-all active:scale-[0.98]"
                        >
                            <RotateCcw size={16} /> {t.safetyVideo.replay}
                        </button>
                    </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
