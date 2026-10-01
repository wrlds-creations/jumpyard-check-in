'use client';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { FlowScreen } from '@/components/FlowTransition';
import { AlertCircle, Loader2, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';
import { createSafetyPlayback, type SafetyPlaybackState } from '@/flow/safetyPlayback';
import { SAFETY_COVER, SAFETY_MEDIA } from '@/flow/safetyMedia';
import { SafetyApproval, type SafetyApprovalProps } from '@/components/SafetyApproval';

// #458: one safety screen. The film plays first; only a genuine end of playback reveals the single
// approval on the same screen: the finished film docks to the top and the approval appears under it
// (variant A, chosen by Love 2026-09-30). The layout is fixed from the first frame and only
// transform and opacity animate. Before and after playback a blurred still covers the film's own
// captions, with the title at the foot of the film like a poster (variant B, Love 2026-10-01).
interface SafetyVideoProps extends Omit<SafetyApprovalProps, 'headingRef' | 'onApprove'> {
    buyEntryFlow?: boolean;
    /** Called once playback has genuinely reached the end. */
    onWatched?: (videoSeenAt: string) => void;
    onApprove: (attestedAt: string) => void;
}

const MAX_VIDEO_WIDTH = 382;
const PANEL_GAP = 12;
const MIN_DOCK_SCALE = 0.3;
// Below this stage height (small phones, or Safari with its toolbars) the approval uses tighter type.
const COMPACT_STAGE_HEIGHT = 600;

export const SafetyVideo = (props: SafetyVideoProps) => {
    const { lang } = useTranslation();
    // Carry only playback intent across language changes, never viewing progress.
    const continuePlaying = useRef(false);
    return <LocalizedSafetyVideo key={lang} {...props} continuePlaying={continuePlaying} />;
};

function LocalizedSafetyVideo({
    buyEntryFlow = false,
    continuePlaying,
    onWatched,
    onApprove,
    ...approvalProps
}: SafetyVideoProps & { continuePlaying: RefObject<boolean> }) {
    const { t, lang } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const playbackRef = useRef<ReturnType<typeof createSafetyPlayback> | null>(null);
    const onWatchedRef = useRef(onWatched);
    const [playback, setPlayback] = useState<SafetyPlaybackState>({ phase: 'idle', progress: 0 });
    const [box, setBox] = useState({ width: 0, height: 0, panel: 0 });
    const { phase, progress } = playback;
    const done = phase === 'done';
    const title = buyEntryFlow ? t.safetyVideo.buyTitle : t.safetyVideo.title;
    const description = buyEntryFlow ? t.safetyVideo.buyDescription : t.safetyVideo.description;
    const durationLabel = t.safetyVideo.durationBadge.replace('{seconds}', String(SAFETY_MEDIA[lang].durationSeconds));
    // The Swedish compound breaks after "Säkerhets" on a narrow film instead of being clipped.
    const coverTitle = title.replace('Säkerhetsgenomgång', 'Säkerhets\u00ADgenomgång');

    useLayoutEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        // React StrictMode replays effect setup after cleanup on the same node.
        if (!video.getAttribute('src')) video.src = SAFETY_MEDIA[lang].src;
        const controller = createSafetyPlayback(video, state => {
            continuePlaying.current = state.phase === 'playing' || state.phase === 'loading';
            // Only the playback controller's genuine end reveals the approval.
            if (state.phase === 'done') onWatchedRef.current?.(new Date().toISOString());
            setPlayback(state);
        });
        playbackRef.current = controller;
        // A keyed element isolates all events/promises from the previous language.
        // Request playback immediately after a language click; browsers that block
        // sound outside a direct gesture retain an explicit Resume action.
        if (continuePlaying.current) controller.start({ automatic: true });
        return () => {
            playbackRef.current = null;
            controller.dispose();
            // Removing a video alone can leave its transfer/decoder alive.
            video.removeAttribute('src');
            video.load();
        };
    }, [continuePlaying, lang]);

    useLayoutEffect(() => {
        const stage = stageRef.current;
        // The approval itself, not its wrapper, so overflow padding never feeds back into the geometry.
        const panel = panelRef.current?.firstElementChild as HTMLElement | null | undefined;
        if (!stage || !panel) return;
        const measure = () => setBox(previous => {
            const next = { width: stage.clientWidth, height: stage.clientHeight, panel: panel.offsetHeight };
            return next.width === previous.width && next.height === previous.height && next.panel === previous.panel ? previous : next;
        });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(stage);
        observer.observe(panel);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        onWatchedRef.current = onWatched;
    }, [onWatched]);

    const handlePlay = () => playbackRef.current?.start();
    const approve = () => onApprove(new Date().toISOString());

    // The film uses the whole stage while it plays. The approval space is reserved from the start,
    // so revealing it never moves the layout.
    const measured = box.height > 0;
    const width = measured ? Math.max(180, Math.floor(Math.min(box.width, MAX_VIDEO_WIDTH, box.height * 9 / 16))) : 320;
    const height = Math.round(width * 16 / 9);
    const playOffset = measured ? Math.max(0, (box.height - height) / 2) : 0;
    const dockScale = measured
        ? Math.min(1, Math.max(MIN_DOCK_SCALE, (box.height - box.panel - PANEL_GAP) / height))
        : 1;
    // Normally the approval sits at the bottom of the stage. When even the compact approval cannot
    // share a short stage with the smallest docked film, it starts right under the film and the page
    // scrolls it into view once.
    const dockTop = Math.max(box.height - box.panel, Math.ceil(height * dockScale) + PANEL_GAP);
    const dockOverflows = measured && dockTop + box.panel > box.height;
    const compact = measured && box.height < COMPACT_STAGE_HEIGHT;
    const docked = done;
    // The blurred still covers the film's own captions wherever our controls sit on top of it.
    const coverVisible = phase === 'idle' || phase === 'loading' || done;
    // The poster title follows the film width so its longest line never clips on small phones.
    const coverTitleSize = Math.max(16, Math.min(30, Math.floor((width - 40) / 8.2)));
    // Matching transform lists interpolate cleanly between playing and docked.
    const frameTransform = docked ? `translateY(0px) scale(${dockScale})` : `translateY(${playOffset}px) scale(1)`;

    useEffect(() => {
        if (!done) return;
        headingRef.current?.focus({ preventScroll: true });
        if (docked && dockOverflows) panelRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, [done, docked, dockOverflows]);

    return (
        <FlowScreen
            className="safety-screen mx-auto flex w-full max-w-md min-h-0 flex-col pb-1"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            data-safety-phase={phase}
        >
            <div ref={stageRef} className="safety-stage relative w-full flex-1">
                <div
                    className="safety-film absolute inset-x-0 top-0 z-10 mx-auto overflow-hidden rounded-2xl bg-black shadow-[0_16px_36px_-16px_rgba(0,0,0,0.6)]"
                    style={{ width, height, transform: frameTransform }}
                    data-docked={String(docked)}
                >
                    <video
                        ref={videoRef}
                        src={SAFETY_MEDIA[lang].src}
                        lang={lang}
                        aria-label={t.safetyVideo.title}
                        playsInline
                        preload="auto"
                        className="absolute inset-0 w-full h-full object-cover"
                    />

                    <img
                        src={SAFETY_COVER}
                        alt=""
                        aria-hidden="true"
                        className="safety-cover absolute inset-0 h-full w-full object-cover"
                        data-visible={String(coverVisible)}
                    />

                    {/* Flame mark — top-left corner */}
                    <img
                        src="/jumpyard_logo_splash.png"
                        alt=""
                        className="absolute top-2 left-2 w-7 h-7 object-contain z-10 opacity-80"
                    />

                    {phase === 'idle' && (
                        <div className="absolute inset-0 z-20 flex flex-col bg-gradient-to-t from-black/75 via-black/15 to-transparent px-5 pb-6 pt-3 text-left">
                            <span className="self-end rounded-full bg-white px-2.5 py-1 text-[10px] font-black italic uppercase tracking-wider text-primary">
                                {durationLabel}
                            </span>
                            <div className="flex flex-1 items-center justify-center">
                                <button
                                    type="button"
                                    onClick={handlePlay}
                                    aria-label={t.safetyVideo.play}
                                    className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-primary shadow-lg transition-transform active:scale-[0.96]"
                                >
                                    <Play size={34} fill="currentColor" className="ml-1" />
                                </button>
                            </div>
                            <h1 className="font-black italic uppercase leading-[0.95] text-white" style={{ fontSize: coverTitleSize }}>{coverTitle}</h1>
                            <p className="mt-2 max-w-[16rem] text-[13px] font-bold italic leading-snug text-white/90">{description}</p>
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

                    {docked && (
                        <button
                            type="button"
                            onClick={handlePlay}
                            aria-label={t.safetyVideo.replay}
                            className="absolute inset-0 z-30 flex items-center justify-center bg-black/25"
                        >
                            <span className="grid h-28 w-28 place-items-center rounded-full bg-white/95 text-foreground shadow-lg">
                                <RotateCcw size={48} strokeWidth={2.5} aria-hidden="true" />
                            </span>
                        </button>
                    )}
                </div>

                <div
                    ref={panelRef}
                    className="safety-approval absolute inset-x-0"
                    // The overflow padding keeps the approval clear of the Back/Exit buttons after scrolling.
                    style={docked && dockOverflows ? { top: dockTop, paddingBottom: 112 } : { bottom: 0 }}
                    data-visible={String(done)}
                    aria-hidden={!done}
                    inert={!done}
                >
                    <SafetyApproval {...approvalProps} compact={compact} headingRef={headingRef} onApprove={approve} />
                </div>
            </div>
        </FlowScreen>
    );
}
