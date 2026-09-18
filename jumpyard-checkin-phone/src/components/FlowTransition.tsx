'use client';

import { Component, createContext, forwardRef, useContext, useRef, useSyncExternalStore, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, MotionConfig, motion, type HTMLMotionProps } from 'framer-motion';
import { captureFlowSnapshot, type FlowSnapshot } from './flowSnapshot';

const FlowMotionContext = createContext(false);

/** A single presentation owner: business screens change immediately, never wait
 * for an outgoing component (or retain its payment effects/actions). */
export function FlowMotion({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
    return enabled
        ? <FlowMotionContext.Provider value={true}><MotionConfig reducedMotion="always" transition={{ duration: 0 }}>{children}</MotionConfig></FlowMotionContext.Provider>
        : <>{children}</>;
}

// Keep the legacy non-kiosk channel untouched, but eliminate independently
// staged entrances/exits inside the coordinated journey.
export const FlowScreen = forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(function FlowScreen(props, ref) {
    const coordinated = useContext(FlowMotionContext);
    return <motion.div {...props} ref={ref} initial={coordinated ? false : props.initial} exit={coordinated ? undefined : props.exit} />;
});

export function FlowPresence({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
    return enabled ? <>{children}</> : <AnimatePresence mode="wait">{children}</AnimatePresence>;
}

export function StableLoadingRegion({ loading, fallback, enabled = true, children }: { loading: boolean; fallback: ReactNode; enabled?: boolean; children: ReactNode }) {
    if (!enabled) return <>{loading ? fallback : children}</>;
    return <div className="relative" aria-busy={loading}>
        {loading && <div className="absolute inset-0 z-10 flex items-center justify-center" role="status">{fallback}</div>}
        <div className={loading ? 'invisible' : undefined} inert={loading}>{children}</div>
    </div>;
}

interface FlowTransitionProps extends HTMLAttributes<HTMLDivElement> {
    screenKey: string;
    enabled?: boolean;
    resetDocumentScroll?: boolean;
    focusHeading?: boolean;
    variant?: 'slide' | 'fade';
}

interface BoundaryProps {
    root: RefObject<HTMLDivElement | null>;
    screenKey: string;
    enabled?: boolean;
    resetDocumentScroll?: boolean;
    focusHeading?: boolean;
    variant?: 'slide' | 'fade';
    children: ReactNode;
}

// React's before-mutation snapshot lifecycle is needed here: a layout-effect
// cleanup would already see mutated/removed children. No extra DOM wrapper.
class TransitionLifecycle extends Component<BoundaryProps & { reduced: boolean }> {
    private animations: Animation[] = [];
    private snapshot: FlowSnapshot | null = null;
    private cleanupTimer: ReturnType<typeof setTimeout> | undefined;

    private clearPresentation = () => {
        clearTimeout(this.cleanupTimer);
        this.animations.forEach(animation => animation.cancel());
        this.animations = [];
        this.snapshot?.layer.remove();
        this.snapshot = null;
    };

    getSnapshotBeforeUpdate(previous: BoundaryProps): FlowSnapshot | null {
        const element = this.props.root.current;
        if (previous.screenKey === this.props.screenKey || this.props.enabled === false || this.props.reduced || !element || typeof element.animate !== 'function') return null;
        try { return captureFlowSnapshot(element); } catch { return null; }
    }

    componentDidUpdate(previous: BoundaryProps, _state: unknown, snapshot: FlowSnapshot | null) {
        if (previous.screenKey === this.props.screenKey) {
            if (this.props.reduced || this.props.enabled === false) this.clearPresentation();
            return;
        }
        this.clearPresentation();
        const element = this.props.root.current;
        if (this.props.enabled === false || !element) return;

        if (this.props.resetDocumentScroll) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const heading = this.props.focusHeading === false ? null : element.querySelector<HTMLElement>('h1, h2');
        if (heading) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
        }

        if (this.props.reduced || typeof element.animate !== 'function') return;
        try {
            this.snapshot = snapshot;
            if (snapshot) {
                element.ownerDocument.body.appendChild(snapshot.layer);
                snapshot.restoreScroll();
                this.animations.push(snapshot.layer.animate(
                    [{ opacity: 1 }, { opacity: 0 }],
                    { duration: this.props.variant === 'fade' ? 240 : 180, easing: 'ease-out', fill: 'forwards' },
                ));
            }
            this.animations.push(element.animate(
                this.props.variant === 'fade'
                    ? [{ opacity: snapshot ? 0 : 0.15 }, { opacity: 1 }]
                    : [{ opacity: snapshot ? 0 : 0.15, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
                { duration: 240, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
            ));
            // A cleanup timer only: never gates navigation or business state.
            this.cleanupTimer = setTimeout(this.clearPresentation, 240);
        } catch {
            this.clearPresentation();
        }
    }

    componentWillUnmount() { this.clearPresentation(); }
    render() { return this.props.children; }
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(notify: () => void) {
    const query = window.matchMedia(reducedMotionQuery);
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
}
const readReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;
const serverReducedMotion = () => true;

export function FlowTransitionBoundary(props: BoundaryProps) {
    const reduced = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverReducedMotion);
    return <TransitionLifecycle {...props} reduced={Boolean(reduced)} />;
}

export function FlowTransition({ screenKey, enabled = true, resetDocumentScroll = false, focusHeading = true, variant = 'slide', children, ...props }: FlowTransitionProps) {
    const root = useRef<HTMLDivElement>(null);
    return <FlowTransitionBoundary root={root} screenKey={screenKey} enabled={enabled} resetDocumentScroll={resetDocumentScroll} focusHeading={focusHeading} variant={variant}>
        <div {...props} ref={root} data-flow-transition={enabled ? screenKey : undefined}>{children}</div>
    </FlowTransitionBoundary>;
}
