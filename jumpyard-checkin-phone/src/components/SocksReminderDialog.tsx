'use client';

import { useEffect } from 'react';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import { useTranslation } from '@/context/LanguageContext';

interface SocksReminderDialogProps {
  open: boolean;
  /** "Lägg till strumpor": closes the reminder at the JumpSocks block. Tapping outside or Escape does the same. */
  onAddSocks: () => void;
  /** "Vi har egna": the guest has approved socks, and the step continues. */
  onOwnSocks: () => void;
}

/**
 * #533 (Love, 2026-10-13): "en snäll pop-up ... du glömmer inte strumpor med en glad smiley". The phone's dialog
 * recipe with the brand socks icon, one heading with the smiley and two buttons, the red one first. Callers render
 * it outside their step's transition root, so a step change never copies it into the outgoing picture.
 */
export function SocksReminderDialog({ open, onAddSocks, onOwnSocks }: SocksReminderDialogProps) {
  const { t } = useTranslation();
  const copy = t.socksReminder;

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onAddSocks();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onAddSocks, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onAddSocks();
      }}
    >
      <div
        aria-labelledby="socks-reminder-title"
        aria-modal="true"
        className="socks-reminder w-full max-w-sm rounded-2xl border border-border bg-white px-5 pb-5 pt-6 text-center shadow-xl"
        data-testid="socks-reminder"
        role="dialog"
      >
        <JumpyardIcon name="grip-socks" className="socks-reminder-icon mx-auto h-20 w-20" />
        <h2 id="socks-reminder-title" className="mt-4 text-balance text-2xl font-black uppercase text-foreground">
          {copy.title}
        </h2>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            autoFocus
            className="w-full rounded-2xl bg-primary py-4 text-lg font-black italic uppercase text-white transition-colors hover:bg-primary/90 active:scale-[0.98]"
            data-testid="socks-reminder-add"
            onClick={onAddSocks}
            type="button"
          >
            {copy.add}
          </button>
          <button
            className="w-full rounded-2xl border-2 border-foreground bg-white py-4 text-lg font-black italic uppercase text-foreground transition-colors hover:bg-surface active:scale-[0.98]"
            data-testid="socks-reminder-own"
            onClick={onOwnSocks}
            type="button"
          >
            {copy.own}
          </button>
        </div>
      </div>
    </div>
  );
}
