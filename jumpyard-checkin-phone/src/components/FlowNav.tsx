'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from '@/components/JumpyardIcon';

// #441: the guest Back/Exit controls are round buttons fixed in the bottom corners, within thumb
// reach on every step, long lists included. A soft fade keeps scrolling content from showing
// through, and an in-flow spacer lets the last content scroll clear of them. They live above the
// flow's stacking context (portal), so they step aside while a text field has focus (keyboard)
// or a modal dialog is open.

interface FlowNavProps {
    onBack?: (() => void) | null;
    onExit?: (() => void) | null;
    exitTestId?: string;
}

const noSubscription = () => () => {};

function isTextField(element: Element | null) {
    if (element instanceof HTMLTextAreaElement) return true;
    return element instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'reset', 'submit'].includes(element.type);
}

function subscribeToFocus(onChange: () => void) {
    document.addEventListener('focusin', onChange);
    document.addEventListener('focusout', onChange);
    return () => {
        document.removeEventListener('focusin', onChange);
        document.removeEventListener('focusout', onChange);
    };
}

function subscribeToDialogs(onChange: () => void) {
    const observer = new MutationObserver(onChange);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => observer.disconnect();
}

function Chevron() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px] text-foreground">
            <path d="M14.5 4.75 7.25 12l7.25 7.25" fill="none" stroke="currentColor" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function FlowNav({ onBack, onExit, exitTestId = 'exit-flow-open' }: FlowNavProps) {
    const { t } = useTranslation();
    const client = useSyncExternalStore(noSubscription, () => true, () => false);
    const typing = useSyncExternalStore(subscribeToFocus, () => isTextField(document.activeElement), () => false);
    const dialogOpen = useSyncExternalStore(subscribeToDialogs, () => Boolean(document.querySelector('[aria-modal="true"]')), () => false);

    if (!onBack && !onExit) return null;
    const hidden = typing || dialogOpen;
    const hit = 'group pointer-events-auto -m-1 rounded-full p-1 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary';
    const disc = 'grid h-12 w-12 place-items-center rounded-full border border-border bg-white shadow-[0_6px_18px_rgba(28,28,30,0.14)] transition-transform group-active:scale-95';

    return (
        <>
            <div aria-hidden="true" className="h-24 w-full shrink-0" data-testid="flow-nav-spacer" />
            {client && createPortal(
                <div
                    className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 transition-opacity duration-200 ${hidden ? 'opacity-0' : 'opacity-100'}`}
                    data-testid="flow-nav"
                    data-hidden={String(hidden)}
                    inert={hidden}
                >
                    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/90 to-background/0" />
                    <div className="relative mx-auto flex w-full max-w-md items-center justify-between px-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
                        {onBack && (
                            <button type="button" aria-label={t.common.back} data-testid="flow-back" onClick={onBack} className={hit}>
                                <span className={disc}><Chevron /></span>
                            </button>
                        )}
                        {onExit && (
                            <button type="button" aria-label={t.common.exit} data-testid={exitTestId} onClick={onExit} className={`ml-auto ${hit}`}>
                                <span className={disc}><JumpyardIcon name="home" className="h-8 w-8" /></span>
                            </button>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
