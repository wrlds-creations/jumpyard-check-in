/** A short-lived, inert visual copy. Never retains React components/effects. */
export interface FlowSnapshot {
    layer: HTMLDivElement;
    restoreScroll: () => void;
}

function stripIdentity(element: Element) {
    for (const attribute of Array.from(element.attributes)) {
        if (['id', 'name', 'for', 'autofocus', 'data-testid'].includes(attribute.name) || attribute.name.startsWith('on')) {
            element.removeAttribute(attribute.name);
        }
    }
}

export function captureFlowSnapshot(element: HTMLDivElement): FlowSnapshot | null {
    // Payment provider frames must never be copied/reloaded by presentation.
    if (element.querySelector('iframe, object, embed')) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const document = element.ownerDocument;
    const window = document.defaultView;
    if (!window) return null;
    const copy = element.cloneNode(true) as HTMLDivElement;
    const originals = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))];
    const copies = [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))];
    const scroll: Array<{ element: HTMLElement; top: number; left: number }> = [];

    // One layout read for the stage; no per-frame layout or React rendering.
    for (let index = 0; index < copies.length; index++) {
        const node = copies[index];
        const source = originals[index];
        stripIdentity(node);
        if (source.scrollTop || source.scrollLeft) scroll.push({ element: node, top: source.scrollTop, left: source.scrollLeft });
        if (node.matches('script, link, style, audio, source, track')) { node.remove(); continue; }
        if (node.matches('video, canvas')) {
            // Freeze already-rendered pixels, without mounting another player.
            const canvas = document.createElement('canvas');
            const size = source.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(size.width));
            canvas.height = Math.max(1, Math.round(size.height));
            canvas.className = node.className;
            canvas.style.cssText = node.style.cssText;
            canvas.style.width = `${size.width}px`;
            canvas.style.height = `${size.height}px`;
            try { canvas.getContext('2d')?.drawImage(source as HTMLVideoElement | HTMLCanvasElement, 0, 0, canvas.width, canvas.height); } catch { /* No decoded frame: retain an empty, equally-sized surface. */ }
            node.replaceWith(canvas);
        }
    }

    const layer = document.createElement('div');
    layer.className = 'flow-transition-snapshot';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    Object.assign(layer.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
        pointerEvents: 'none', overflow: 'hidden', zIndex: '40',
    });
    // Preserve contextual selectors (e.g. .kiosk-flow), without duplicating
    // their layout or any siblings. The copied stage keeps its measured frame.
    let context: HTMLElement = copy;
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const shell = ancestor.cloneNode(false) as HTMLElement;
        stripIdentity(shell);
        shell.style.setProperty('display', 'contents', 'important');
        shell.appendChild(context);
        context = shell;
    }
    Object.assign(copy.style, {
        width: `${rect.width}px`, height: `${rect.height}px`, minHeight: '0',
        maxHeight: 'none', margin: '0', flexShrink: '0', transform: 'none',
        opacity: window.getComputedStyle(element).opacity,
    });
    layer.appendChild(context);
    return { layer, restoreScroll: () => scroll.forEach(item => { item.element.scrollTop = item.top; item.element.scrollLeft = item.left; }) };
}
