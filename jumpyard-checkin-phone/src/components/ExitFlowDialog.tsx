'use client';

import { X } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

interface ExitFlowDialogProps {
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}

export function ExitFlowDialog({ onClose, onConfirm, open }: ExitFlowDialogProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="exit-flow-title"
        aria-describedby="exit-flow-description"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-border bg-white p-5 shadow-xl"
        data-testid="exit-flow-dialog"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="exit-flow-title" className="text-xl font-black italic uppercase text-foreground">
              {t.exitFlow.title}
            </h2>
            <p id="exit-flow-description" className="mt-2 text-sm text-muted">
              {t.exitFlow.description}
            </p>
          </div>
          <button
            aria-label={t.exitFlow.stay}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            className="w-full rounded-xl bg-primary py-3 text-sm font-black italic uppercase text-white transition-colors hover:bg-primary/90"
            data-testid="exit-flow-confirm"
            onClick={onConfirm}
            type="button"
          >
            {t.exitFlow.confirm}
          </button>
          <button
            className="w-full rounded-xl border border-border bg-white py-3 text-sm font-black italic uppercase text-foreground transition-colors hover:bg-surface"
            onClick={onClose}
            type="button"
          >
            {t.exitFlow.stay}
          </button>
        </div>
      </div>
    </div>
  );
}
