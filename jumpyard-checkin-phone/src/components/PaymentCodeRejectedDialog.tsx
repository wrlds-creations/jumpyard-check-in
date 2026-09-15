'use client';

import { JumpyardIcon } from '@/components/JumpyardIcon';

interface PaymentCodeRejectedDialogProps {
  open: boolean;
  title: string;
  description: string;
  continueLabel: string;
  editLabel: string;
  onContinueWithout: () => void;
  onEdit: () => void;
}

// Shown when Continue finds that the entered code cannot be used. The guest
// either proceeds at the regular price or goes back to change the code.
export function PaymentCodeRejectedDialog({
  open,
  title,
  description,
  continueLabel,
  editLabel,
  onContinueWithout,
  onEdit,
}: PaymentCodeRejectedDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onEdit();
      }}
    >
      <div
        aria-describedby="payment-code-dialog-description"
        aria-labelledby="payment-code-dialog-title"
        aria-modal="true"
        className="payment-code-dialog w-full max-w-sm rounded-2xl border border-border bg-white p-5 shadow-xl"
        data-testid="payment-code-dialog"
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <JumpyardIcon name="warning" className="h-10 w-10 flex-shrink-0" />
          <div className="min-w-0">
            <h2 id="payment-code-dialog-title" className="text-xl font-black italic uppercase leading-tight text-foreground">
              {title}
            </h2>
            <p id="payment-code-dialog-description" className="mt-2 text-sm text-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            autoFocus
            className="w-full rounded-xl bg-primary py-3 text-sm font-black italic uppercase text-white transition-colors hover:bg-primary/90"
            data-testid="payment-code-dialog-continue"
            onClick={onContinueWithout}
            type="button"
          >
            {continueLabel}
          </button>
          <button
            className="w-full rounded-xl border border-border bg-white py-3 text-sm font-black italic uppercase text-foreground transition-colors hover:bg-surface"
            data-testid="payment-code-dialog-edit"
            onClick={onEdit}
            type="button"
          >
            {editLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
