import type { NewBookingAvailability, NewBookingProduct } from '@/flow/cloudClient';

/** Development fixture only. Every API call is handled locally or rejected;
 * the original fetch is used only for assets on this localhost origin. */
export function installLocalTransport(options: { delay: () => number; fail: () => boolean }) {
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
        throw new Error('Local preview requires a development server on localhost.');
    }
    const original = window.fetch;
    window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin === location.origin && !url.pathname.startsWith('/v1/')) return original(input, init);
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        await new Promise(resolve => setTimeout(resolve, options.delay()));
        if (options.fail()) return Response.json({ status: 'internal_error', error: { code: 'preview_unavailable', message: 'Tillfälligt fel i den lokala förhandsvisningen.' } }, { status: 503 });
        if (url.pathname === '/v1/bookings/availability') {
            return Response.json({ status: 'available', availability: makeAvailability(body.startTimes || ['17:00'], body.date) });
        }
        if (url.pathname === '/v1/check-in/lookup') {
            return Response.json({ status: 'found', eligibility: { canCheckIn: true, reason: 'ready' }, guestAccess: { token: 'local-fixture-only', expiresAt: null }, booking: {
                bookingReference: 'DEMO', rollerUniqueId: null, customer: { firstName: 'Alex', lastName: 'Test' },
                status: 'confirmed', paymentStatus: 'paid', amountOwing: 0,
                items: [{ productName: '60 min', parentProductName: 'Entré', productType: 'session', quantity: 2, bookingDate: new Date().toLocaleDateString('sv-SE'), startTime: '17:00', endTime: '18:00', tickets: [] }],
            } });
        }
        if (url.pathname === '/v1/bookings/DEMO/add-products/quote' && Array.isArray(body.items)) {
            const prices = new Map(makeAvailability(['17:00']).slots[0].products.map(product => [Number(product.productId), product.unitPrice]));
            if (body.items.every((item: { productId: number; quantity: number }) => prices.has(item.productId) && Number.isInteger(item.quantity) && item.quantity > 0)) {
                const total = body.items.reduce((sum: number, item: { productId: number; quantity: number }) => sum + prices.get(item.productId)! * item.quantity, 0);
                return Response.json({ status: 'quoted', quote: { externalId: 'local-preview-quote', costs: { total, amountOwing: total } } });
            }
        }
        // No draft, payment, session, provider, email or production request.
        return Response.json({ status: 'blocked', error: { code: 'local_preview_only', message: 'Använd förhandsvisningens simulerade betalning.' } }, { status: 409 });
    };
    return () => { window.fetch = original; };
}

export function makeAvailability(times: string[], date = new Date().toLocaleDateString('sv-SE')): NewBookingAvailability {
    const product = (time: string, key: string, type: NewBookingProduct['type'], price: number, duration = 60, jumpers = 1, id = 1001): NewBookingProduct => ({
        available: true, capacityRemaining: 100, durationMinutes: duration, endTime: null, jumpersPerUnit: jumpers,
        key, label: type === 'addon' ? key : `${duration} min`, onlineSalesOpen: true, parentProductId: '1000',
        productId: String(id), productName: key, requiresAvailability: true, startTime: time, type, unitPrice: price, unitPriceCents: price * 100,
    });
    return { date, slots: times.map(time => ({ date, startTime: time, products: [
        product(time, 'combo', 'combo', 450, 60, 2, 1010),
        ...[60, 90, 120].map((duration, i) => product(time, `entry-${duration}`, 'entry', 200 + i * 30, duration, 1, 1020 + i)),
        ...[60, 90, 120].map((duration, i) => product(time, `family-${duration}`, 'family', 600 + i * 90, duration, 4, 1030 + i)),
        ...[['socks',49,1765445], ['water_bottle',20,1040], ['skyrider',40,1765443], ['lock',45,1765441], ['coffee',35,1765452]].map(([key, price, id]) => ({ ...product(time, String(key), 'addon', Number(price), 0, 1, Number(id)), requiresAvailability: key === 'skyrider' })),
    ] })) };
}
