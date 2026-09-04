'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import { createSafetyPlayback, type SafetyPlaybackState } from '@/flow/safetyPlayback';

interface SafetyVideoProps {
    onComplete: (seenAt: string) => void;
    buyEntryFlow?: boolean;
}

export const SafetyVideo = ({ onComplete, buyEntryFlow = false }: SafetyVideoProps) => {
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const playbackRef = useRef<ReturnType<typeof createSafetyPlayback> | null>(null);
    const [playback, setPlayback] = useState<SafetyPlaybackState>({ phase: 'idle', progress: 0 });
    const { phase, progress } = playback;
    const done = phase === 'done';
    const [videoWidth, setVideoWidth] = useState(320);
    const title = buyEntryFlow ? t.safetyVideo.buyTitle : t.safetyVideo.title;
    const description = buyEntryFlow ? t.safetyVideo.buyDescription : t.safetyVideo.description;
    const doneLabel = buyEntryFlow ? t.safetyVideo.buyDone : t.safetyVideo.done;

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const controller = createSafetyPlayback(video, setPlayback);
        playbackRef.current = controller;
        return () => {
            playbackRef.current = null;
            controller.dispose();
        };
    }, []);

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

    const handlePlay = () => playbackRef.current?.start();

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
                        src="/safety-video.mp4?v=343"
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 w-full h-full object-cover"
                    />

                    {/* Flame mark — top-left corner */}
                    <img
                        src="/jumpyard_logo_splash.png"
                        alt=""
                        className="absolute top-2 left-2 w-7 h-7 object-contain z-10 opacity-80"
                    />

                    {phase === 'idle' && (
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
                                type="button"
                                onClick={handlePlay}
                                aria-label={t.safetyVideo.play}
                                className="mt-5 flex h-16 w-16 items-center justify-center rounded-full border border-transparent bg-primary text-white shadow-md transition-all active:scale-[0.96]"
                            >
                                <Play size={32} className="ml-0.5" />
                            </button>
                        </div>
                    )}

                    {(phase === 'loading' || phase === 'error' || phase === 'paused') && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 px-5 py-4 text-center text-white">
                            <div role={phase === 'error' ? 'alert' : 'status'} aria-live="polite" aria-atomic="true">
                                {phase === 'loading'
                                    ? <Loader2 size={36} aria-hidden="true" className="mx-auto mb-4 animate-spin motion-reduce:animate-none" />
                                    : phase === 'error' && <AlertCircle size={36} aria-hidden="true" className="mx-auto mb-4" />}
                                <h2 className="text-xl font-black italic leading-tight">
                                    {phase === 'loading' ? t.safetyVideo.loading : phase === 'error' ? t.safetyVideo.errorTitle : t.safetyVideo.paused}
                                </h2>
                                {phase === 'error' && <p className="mt-3 text-sm leading-relaxed">{t.safetyVideo.errorDescription}</p>}
                            </div>
                            {phase !== 'loading' && (
                                <button type="button" onClick={handlePlay} className="mt-5 min-h-12 w-full rounded-2xl bg-primary px-4 py-3 text-base font-black italic uppercase text-white">
                                    {phase === 'error' ? t.safetyVideo.retry : t.safetyVideo.resume}
                                </button>
                            )}
                            {phase === 'error' && <p className="mt-4 text-sm leading-relaxed">{t.safetyVideo.staffHelp}</p>}
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
                            type="button"
                            onClick={() => onComplete(new Date().toISOString())}
                            className="w-full rounded-2xl border border-transparent bg-primary py-4 text-base font-black italic uppercase text-white shadow-sm transition-all active:scale-[0.98]"
                        >
                            {doneLabel}
                        </button>
                        <button
                            type="button"
                            onClick={handlePlay}
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
