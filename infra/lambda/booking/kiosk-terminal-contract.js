const KIOSK_PAYMENT_CURRENCY = 'SEK';

function normalizePaymentTerminalMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([alias, reference]) => [String(alias).trim(), typeof reference === 'string' ? reference.trim() : ''])
      .filter(([alias, reference]) => alias && reference),
  );
}

function resolveKioskPaymentTerminal(config, request) {
  if (request.channel !== 'kiosk') return { enabled: false, paymentTerminal: null };
  const alias = typeof request.paymentTerminalAlias === 'string' ? request.paymentTerminalAlias.trim() : '';
  const paymentTerminal = alias ? config.paymentTerminals?.[alias] : null;
  if (!alias || !paymentTerminal) {
    return {
      enabled: true,
      error: {
        code: 'kiosk_payment_terminal_not_configured',
        message: 'The requested kiosk payment terminal is not configured.',
      },
      paymentTerminal: null,
    };
  }
  return { enabled: true, paymentTerminal };
}

function buildKioskQuotePayload(draftPayload) {
  if (!draftPayload || typeof draftPayload !== 'object' || Array.isArray(draftPayload)) return {};
  const { paymentTerminal: _paymentTerminal, ...quotePayload } = draftPayload;
  return quotePayload;
}

function verifyKioskDraftPayment({ draftBody, paymentJwt, quoteBody }) {
  const draftAmountCents = amountToCents(readAmountOwing(draftBody));
  const quoteAmountCents = amountToCents(readAmountOwing(quoteBody));
  if (draftAmountCents === null || quoteAmountCents === null || draftAmountCents !== quoteAmountCents) {
    return {
      ok: false,
      error: {
        code: 'kiosk_payment_amount_mismatch',
        message: 'ROLLER draft amount did not match the server-side quote.',
      },
    };
  }

  const jwtPayload = parseJwtPayload(paymentJwt);
  const currencies = [
    findNamedScalar(quoteBody, ['currency', 'currencyCode']),
    findNamedScalar(draftBody, ['currency', 'currencyCode']),
    findNamedScalar(jwtPayload, ['currency', 'currencyCode']),
  ].filter((value) => typeof value === 'string' && value.trim());
  if (currencies.length === 0 || currencies.some((value) => value.trim().toUpperCase() !== KIOSK_PAYMENT_CURRENCY)) {
    return {
      ok: false,
      error: {
        code: 'kiosk_payment_currency_mismatch',
        message: 'ROLLER terminal payment currency was not the configured kiosk currency.',
      },
    };
  }

  if (!jwtPayload || typeof jwtPayload.merchantReference !== 'string' || !jwtPayload.merchantReference.trim()) {
    return {
      ok: false,
      error: {
        code: 'kiosk_payment_jwt_invalid',
        message: 'ROLLER did not return a usable terminal payment token.',
      },
    };
  }

  return { amountOwingCents: draftAmountCents, currency: KIOSK_PAYMENT_CURRENCY, ok: true };
}

function normalizeTerminalOutcome(value) {
  return ['approved', 'failed', 'cancelled', 'unknown'].includes(value) ? value : null;
}

function normalizeBookingReadback(body) {
  const booking = body?.booking && typeof body.booking === 'object' ? body.booking : body;
  const costs = booking?.costs && typeof booking.costs === 'object' ? booking.costs : booking;
  const amountOwing = finiteNumber(costs?.amountOwing ?? booking?.amountOwing ?? booking?.remainder);
  const paymentStatus = stringOrNull(booking?.paymentStatus ?? booking?.status ?? booking?.bookingStatus);
  const unsafeStatus = /pending|unpaid|partial|cancel|fail|draft/i.test(paymentStatus ?? '');
  return {
    bookingReference: stringOrNull(booking?.bookingReference ?? booking?.reference ?? booking?.bookingId),
    confirmed: amountOwing !== null && amountOwing <= 0 && !unsafeStatus,
    paymentStatus,
    rollerUniqueId: stringOrNull(booking?.uniqueId ?? booking?.id ?? booking?.bookingUniqueId),
  };
}

function readAmountOwing(body) {
  const costs = body?.costs && typeof body.costs === 'object'
    ? body.costs
    : body?.bookingCosts && typeof body.bookingCosts === 'object'
      ? body.bookingCosts
      : body;
  return finiteNumber(costs?.amountOwing);
}

function parseJwtPayload(jwt) {
  if (typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function findNamedScalar(value, names, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  for (const [key, child] of Object.entries(value)) {
    if (names.includes(key) && (typeof child === 'string' || typeof child === 'number')) return String(child);
  }
  for (const child of Object.values(value)) {
    const found = findNamedScalar(child, names, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function amountToCents(value) {
  const amount = finiteNumber(value);
  return amount === null ? null : Math.round(amount * 100);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim() || null;
}

module.exports = {
  buildKioskQuotePayload,
  KIOSK_PAYMENT_CURRENCY,
  normalizeBookingReadback,
  normalizePaymentTerminalMap,
  normalizeTerminalOutcome,
  resolveKioskPaymentTerminal,
  verifyKioskDraftPayment,
};
