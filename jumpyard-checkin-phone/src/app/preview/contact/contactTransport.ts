import { makeAvailability } from '../flow/localTransport';

/** GH-473 development fixture. Answers availability, quotes and the email-first draft locally;
 * every other API request is refused. Nothing reaches Cloud, Klaviyo, ROLLER or a payment provider. */
export function installContactTransport() {
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
        throw new Error('Local preview requires a development server on localhost.');
    }
    const original = window.fetch;
    const prices = new Map(makeAvailability(['17:00']).slots[0].products.map((product) => [Number(product.productId), product.unitPrice ?? 0]));
    window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin === location.origin && !url.pathname.startsWith('/v1/')) return original(input, init);
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        if (url.pathname === '/v1/bookings/availability') {
            return Response.json({ status: 'available', availability: makeAvailability(body.startTimes || ['17:00'], body.date) });
        }
        if (url.pathname === '/v1/bookings/quote' && Array.isArray(body.items)) {
            const total = body.items.reduce((sum: number, item: { productId: number; quantity: number }) =>
                sum + (prices.get(Number(item.productId)) ?? 0) * Math.max(0, Number(item.quantity) || 0), 0);
            return Response.json({ status: 'quoted', quote: { externalId: 'local-preview-quote', costs: { total, amountOwing: total }, itemCount: body.items.length, expiresAt: null } });
        }
        if (url.pathname === '/v1/bookings/draft' && !body.customer?.lastName && !body.customer?.phone) {
            // The synthetic Cloud answer when the Klaviyo lookup is uncertain.
            return Response.json({ status: 'blocked', error: { code: 'contact_details_required', message: 'Last name and phone are required to complete this purchase.' } }, { status: 409 });
        }
        return Response.json({ status: 'blocked', error: { code: 'local_preview_only', message: 'Förhandsvisningen skapar inga bokningar.' } }, { status: 409 });
    };
    return () => { window.fetch = original; };
}
