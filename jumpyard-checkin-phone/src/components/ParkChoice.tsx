'use client';
import { FlowScreen } from '@/components/FlowTransition';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from '@/components/JumpyardIcon';

interface ParkChoiceProps {
    onSelect: (choice: 'BOOKING' | 'BUY') => void;
    /** #491 round 1: today's saved number, offered as the way back after "Gör en ny bokning". */
    savedVisitCode?: string | null;
    onResumeSavedVisit?: () => void;
}

// #492 (Love 2026-10-08): the logo jumps once with a flip. It is marked ready only when it has loaded
// (even before React listened) and the start page is fully visible, after any FlowTransition fade; the
// stylesheet then waits a short beat. The jump fits the room above the logo: first lower, then a smaller
// logo while it turns, so it never reaches the top edge. Only a screen too short for both stands still.
const MAX_JUMP_PX = 72;
const MIN_JUMP_PX = 24;
const MIN_FLIP_SCALE = 0.75;
const TOP_MARGIN_PX = 8;

const readyToJump = (logo: HTMLImageElement | null) => {
    if (!logo?.complete || !logo.naturalWidth) return;
    requestAnimationFrame(() => {
        const entrance = logo.closest('[data-flow-transition]')?.getAnimations() ?? [];
        void Promise.allSettled(entrance.map(animation => animation.finished)).then(() => {
            const scene = logo.parentElement;
            if (!scene || scene.dataset.ready) return;
            // Turning, the logo reaches half its diagonal (times its size) above its centre.
            const { top, width, height } = logo.getBoundingClientRect();
            const radius = Math.hypot(width, height) / 2;
            const room = top + height / 2 - TOP_MARGIN_PX;
            const jump = Math.max(MIN_JUMP_PX, Math.min(MAX_JUMP_PX, room - radius));
            const scale = Math.min(1, (room - jump) / radius);
            if (scale < MIN_FLIP_SCALE) return;
            scene.style.setProperty('--park-choice-jump', `${Math.floor(jump)}px`);
            scene.style.setProperty('--park-choice-flip-scale', `${Math.floor(scale * 100) / 100}`);
            scene.dataset.ready = 'true';
        });
    });
};

export const ParkChoice = ({ onSelect, savedVisitCode = null, onResumeSavedVisit }: ParkChoiceProps) => {
    const { t } = useTranslation();

    return (
        <FlowScreen
            className="w-full max-w-md min-w-0 mx-auto flex flex-col items-center justify-center px-4"
            style={{ minHeight: 'calc(100dvh - 60px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <span className="park-choice-logo mb-8">
                <img
                    ref={readyToJump}
                    src="/jumpyard_logo.png"
                    alt="JumpYard"
                    className="w-36"
                    onLoad={event => readyToJump(event.currentTarget)}
                />
            </span>

            {/* #495 (Love 2026-10-08): "Redo att hoppa?" replaces "Vad vill du göra?", in JumpYard's own Acumin. */}
            <h1 className="park-choice-title uppercase text-foreground mb-6 text-center">
                {t.choice.title} <span className="text-primary">{t.choice.titleAccent}</span>
            </h1>

            <div className="w-full max-w-full min-w-0 flex flex-col gap-3">
                <button
                    onClick={() => onSelect('BOOKING')}
                    className="w-full min-w-0 bg-primary text-white p-5 rounded-2xl text-left flex items-center gap-4 transition-all active:scale-[0.98]"
                >
                    <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                        <JumpyardIcon name="booking-confirmed-on-red-white-calendar" className="w-10 h-10" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="type-button text-lg font-black italic uppercase leading-tight">
                            {t.choice.haveBooking}
                        </h2>
                    </div>
                </button>

                <button
                    onClick={() => onSelect('BUY')}
                    className="w-full min-w-0 bg-foreground border border-foreground text-white p-5 rounded-2xl text-left flex items-center gap-4 transition-all active:scale-[0.98]"
                >
                    <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                        <JumpyardIcon name="admission-ticket-red-white-flame" className="w-10 h-10" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="type-button text-lg font-black italic uppercase leading-tight">
                            {t.choice.buyTickets}
                        </h2>
                    </div>
                </button>
            </div>

            {/* #491 round 1 (Love 2026-10-08): a guest who tapped "Gör en ny bokning" by mistake gets back to
                today's number in one tap. Only shown while today's visit is saved on this phone. */}
            {savedVisitCode && onResumeSavedVisit && (
                <button
                    type="button"
                    onClick={onResumeSavedVisit}
                    data-testid="park-choice-saved-visit"
                    className="mt-6 inline-flex min-h-11 max-w-full items-center gap-2 px-2 text-sm font-extrabold italic text-foreground"
                >
                    <JumpyardIcon name="success-check" className="h-5 w-5 flex-shrink-0" />
                    <span className="whitespace-nowrap underline decoration-primary/60 decoration-2 underline-offset-4">
                        {t.choice.backToCheckin} <span aria-hidden="true">·</span>{' '}
                        <span className="font-black text-primary tabular-nums">{savedVisitCode}</span>
                    </span>
                </button>
            )}
        </FlowScreen>
    );
};
