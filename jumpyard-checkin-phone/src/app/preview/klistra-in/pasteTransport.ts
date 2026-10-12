import type { NewBookingAvailability, NewBookingQuote } from '@/flow/cloudClient';
import { makeAvailability } from '../flow/localTransport';

/** #505 development fixture. Answers availability and quotes locally; drafts and every other API
 * request are refused. Nothing reaches Cloud, ROLLER or a payment provider. */

// The 60-minute entry at its drop-in price (#501), so the numbers match Love's live check on
// 2026-10-12: a membership number took 30 % (66 kr) off the 220 kr entry and the socks kept full price.
const ENTRY_60_PRICE = 220;
export const PREVIEW_GIFT_CARD_BALANCE = 866;
export const PREVIEW_MEMBER_ENTRY_DISCOUNT = 0.3;
// #510: one made-up discount code with letters takes 25 % off the entries, as in the kiosk preview.
export const PREVIEW_DISCOUNT_CODE = 'SOMMAR25';
export const PREVIEW_CODE_ENTRY_DISCOUNT = 0.25;
const GIFT_CARD_NUMBER = /^\d{10}$/;
const MEMBER_NUMBER = /^\d+-\d+$/;

export function makePasteAvailability(times: string[], date?: string): NewBookingAvailability {
    const availability = makeAvailability(times, date);
    return {
        ...availability,
        slots: availability.slots.map((slot) => ({
            ...slot,
            products: slot.products.map((product) => product.key === 'entry-60'
                ? { ...product, unitPrice: ENTRY_60_PRICE, unitPriceCents: ENTRY_60_PRICE * 100 }
                : product),
        })),
    };
}

interface QuoteBody {
    items?: { productId?: number; quantity?: number }[];
    giftCards?: { giftCardNumber?: string }[];
    discountCodes?: string[];
}

/** A gift card covers the basket up to its balance; a membership number gives 30 % off the
 * entries only and SOMMAR25 25 %; any other code or card is rejected, as ROLLER answers an unknown one. */
export function quotePastePreview(body: QuoteBody): NewBookingQuote {
    const products = new Map(makePasteAvailability(['17:00']).slots[0].products.map((product) => [Number(product.productId), product]));
    const items = Array.isArray(body.items) ? body.items : [];
    const lineTotal = (item: { productId?: number; quantity?: number }) =>
        (products.get(Number(item.productId))?.unitPrice ?? 0) * Math.max(0, Number(item.quantity) || 0);
    const total = items.reduce((sum, item) => sum + lineTotal(item), 0);
    const entries = items
        .filter((item) => ['entry', 'family'].includes(products.get(Number(item.productId))?.type ?? ''))
        .reduce((sum, item) => sum + lineTotal(item), 0);

    const codes = Array.isArray(body.discountCodes) ? body.discountCodes.map(String) : [];
    const accepted = codes.length > 0 && (MEMBER_NUMBER.test(codes[0]) || codes[0] === PREVIEW_DISCOUNT_CODE);
    const share = codes[0] === PREVIEW_DISCOUNT_CODE ? PREVIEW_CODE_ENTRY_DISCOUNT : PREVIEW_MEMBER_ENTRY_DISCOUNT;
    const discount = accepted ? Math.round(entries * share) : 0;
    const afterDiscount = total - discount;

    const cards = Array.isArray(body.giftCards) ? body.giftCards.map((card) => String(card?.giftCardNumber ?? '')) : [];
    const card = cards.length > 0 && GIFT_CARD_NUMBER.test(cards[0]);
    const covered = card ? Math.min(PREVIEW_GIFT_CARD_BALANCE, afterDiscount) : 0;

    return {
        externalId: 'local-preview-quote',
        costs: { total: afterDiscount, amountOwing: afterDiscount - covered, discount },
        discountCodes: {
            requestedCount: codes.length,
            appliedCount: accepted ? 1 : 0,
            totalApplied: discount,
            applied: accepted ? [{ amountDeducted: discount, maskedCode: `••••${codes[0].slice(-4)}` }] : [],
            errors: codes.length > 0 && !accepted ? [{ code: 'discount_code_not_applied', message: 'Klippkortskoden kunde inte användas.' }] : [],
        },
        giftCards: {
            requestedCount: cards.length,
            appliedCount: card ? 1 : 0,
            totalApplied: covered,
            applied: card ? [{ amountDeducted: covered, maskedNumber: `••••••${cards[0].slice(-4)}` }] : [],
            errors: cards.length > 0 && !card ? [{ code: 'gift_card_not_found', message: 'Presentkortet kunde inte användas.' }] : [],
        },
        itemCount: items.length,
        expiresAt: null,
    };
}

export function installPasteTransport(options: { delayMs?: number } = {}) {
    if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
        throw new Error('Local preview requires a development server on localhost.');
    }
    const original = window.fetch;
    const delayMs = options.delayMs ?? 400;
    window.fetch = async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin === location.origin && !url.pathname.startsWith('/v1/')) return original(input, init);
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        // A short wait, so "Kontrollerar…" shows as it does against Cloud.
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (url.pathname === '/v1/bookings/availability') {
            return Response.json({ status: 'available', availability: makePasteAvailability(body.startTimes || ['17:00'], body.date) });
        }
        if (url.pathname === '/v1/bookings/quote' && Array.isArray(body.items)) {
            return Response.json({ status: 'quoted', quote: quotePastePreview(body) });
        }
        return Response.json({ status: 'blocked', error: { code: 'local_preview_only', message: 'Förhandsvisningen skapar inga bokningar.' } }, { status: 409 });
    };
    return () => { window.fetch = original; };
}
