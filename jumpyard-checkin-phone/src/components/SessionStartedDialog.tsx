'use client';

import { useEffect } from 'react';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import { useTranslation } from '@/context/LanguageContext';

interface SessionStartedDialogProps {
  open: boolean;
  /** "Välj ny tid": the time step with fresh times; the rest of the purchase is kept. Escape or a tap outside does the same. */
  onChooseNewTime: () => void;
}

/**
 * GH-557 (D0273): ROLLER stopped selling the chosen time after it began, about 10 minutes after the start.
 * The phone's dialog recipe with the time icon, one heading, one line and one red button.
 */
export function SessionStartedDialog({ open, onChooseNewTime }: SessionStartedDialogProps) {
  const { t } = useTranslation();
  const copy = t.sessionStarted;

  useEffect(() => {
    if (!open) return;
    const chooseOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onChooseNewTime();
    };
    document.addEventListener('keydown', chooseOnEscape);
    return () => document.removeEventListener('keydown', chooseOnEscape);
  }, [onChooseNewTime, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onChooseNewTime();
      }}
    >
      <div
        aria-describedby="session-started-text"
        aria-labelledby="session-started-title"
        aria-modal="true"
        className="session-started w-full max-w-sm rounded-2xl border border-border bg-white px-5 pb-5 pt-6 text-center shadow-xl"
        data-testid="session-started"
        role="dialog"
      >
        <JumpyardIcon name="time" className="mx-auto h-16 w-16" />
        <h2 id="session-started-title" className="mt-4 text-balance text-2xl font-black uppercase text-foreground">
          {copy.title}
        </h2>
        <p id="session-started-text" className="mt-2 text-sm font-bold text-foreground">
          {copy.text}
        </p>

        <button
          autoFocus
          className="mt-6 w-full rounded-2xl bg-primary py-4 text-lg font-black italic uppercase text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
          data-testid="session-started-new-time"
          onClick={onChooseNewTime}
          type="button"
        >
          {copy.chooseNewTime}
        </button>
      </div>
    </div>
  );
}
