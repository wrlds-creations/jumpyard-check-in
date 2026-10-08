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
            <img src="/jumpyard_logo.png" alt="JumpYard" className="w-36 mb-8" />

            <h1 className="text-xl font-black italic uppercase text-foreground mb-6 text-center">
                {t.choice.title}
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
                        <h2 className="text-lg font-black italic uppercase leading-tight">
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
                        <h2 className="text-lg font-black italic uppercase leading-tight">
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
