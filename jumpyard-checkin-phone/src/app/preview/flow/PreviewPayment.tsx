'use client';

import { useState } from 'react';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import type { Language } from '@/context/LanguageContext';

// Development fixture only: a clearly labelled stand-in for ROLLER's card payment. It never loads
// the payment SDK, never creates a draft and never sends anything to Park, Live or ROLLER.

const COPY = {
    sv: {
        label: 'Lokal testbetalning',
        note: 'Här visas ROLLER:s kortbetalning i det riktiga flödet. Inget riktigt köp görs.',
        toPay: 'Att betala',
        approve: 'Godkänn betalning',
        decline: 'Neka betalning',
        declinedTitle: 'Betalningen nekades',
        declinedBody: 'Ingen betalning drogs. Försök igen eller ändra dina uppgifter.',
        retry: 'Försök igen',
        edit: 'Ändra uppgifter',
    },
    en: {
        label: 'Local test payment',
        note: 'ROLLER’s card payment appears here in the real flow. No real purchase is made.',
        toPay: 'To pay',
        approve: 'Approve payment',
        decline: 'Decline payment',
        declinedTitle: 'Payment declined',
        declinedBody: 'No payment was taken. Try again or change your details.',
        retry: 'Try again',
        edit: 'Change details',
    },
};

export function PreviewProgress({ labels, icons, current }: { labels: string[]; icons: JumpyardIconName[]; current: number }) {
    const pct = labels.length > 1 ? (current / (labels.length - 1)) * 100 : 0;
    return (
        <div className="w-full mb-3" data-preview-progress={current}>
            <div className="relative">
                <div className="absolute top-4 left-[10%] right-[10%] h-0.5 bg-surface-strong" />
                <div className="absolute top-4 left-[10%] h-0.5 bg-primary transition-all duration-500" style={{ width: `calc(${pct * 0.8}%)` }} />
                <div className="relative z-10 grid" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
                    {labels.map((label, index) => (
                        <div key={label} className="flex min-w-0 flex-col items-center gap-1">
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center ${index < current
                                ? 'bg-white border-primary shadow-sm'
                                : index === current ? 'bg-white border-primary shadow-sm ring-4 ring-primary/15' : 'bg-surface border-border opacity-45'}`}>
                                <JumpyardIcon name={icons[index]} className="w-6 h-6" />
                            </div>
                            <span className={`w-full whitespace-nowrap text-center text-[8px] font-bold italic uppercase leading-tight ${index <= current ? 'text-foreground' : 'text-muted'}`}>
                                {label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function PreviewPayment({ language, amountLabel, onApproved, onEdit }: {
    language: Language;
    amountLabel: string;
    onApproved: () => void;
    onEdit: () => void;
}) {
    const copy = COPY[language];
    const [declined, setDeclined] = useState(false);

    return (
        <section className="w-full px-2 py-4" data-preview-payment={declined ? 'declined' : 'ready'} lang={language}>
            <div className="rounded-2xl border-2 border-dashed border-primary/60 bg-white p-4">
                <p className="text-[11px] font-black italic uppercase tracking-wider text-primary">{copy.label}</p>
                <p className="mt-1 text-sm leading-snug text-foreground">{copy.note}</p>
                {declined ? (
                    <div className="mt-5 text-center" role="alert">
                        <JumpyardIcon name="warning-transparent" className="mx-auto h-14 w-14" />
                        <h2 className="mt-3 text-xl font-black italic uppercase text-foreground">{copy.declinedTitle}</h2>
                        <p className="mt-2 text-sm text-foreground">{copy.declinedBody}</p>
                        <button type="button" onClick={() => setDeclined(false)} className="mt-5 w-full rounded-2xl bg-primary py-4 text-base font-black italic uppercase text-white">
                            {copy.retry}
                        </button>
                        <button type="button" onClick={onEdit} className="mt-2 w-full rounded-2xl border border-border bg-white py-3 text-sm font-black italic uppercase text-foreground">
                            {copy.edit}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border px-4 py-4">
                            <span className="flex items-center gap-2 text-lg font-black italic uppercase text-foreground">
                                <JumpyardIcon name="payment-card" className="h-7 w-7" />{copy.toPay}
                            </span>
                            <span className="text-2xl font-black italic text-primary">{amountLabel}</span>
                        </div>
                        <button type="button" data-testid="preview-payment-approve" onClick={onApproved} className="mt-4 w-full rounded-2xl bg-primary py-4 text-lg font-black italic uppercase text-white active:scale-[0.98]">
                            {copy.approve}
                        </button>
                        <button type="button" data-testid="preview-payment-decline" onClick={() => setDeclined(true)} className="mt-2 w-full rounded-2xl border border-border bg-white py-3 text-sm font-black italic uppercase text-foreground">
                            {copy.decline}
                        </button>
                    </>
                )}
            </div>
        </section>
    );
}
