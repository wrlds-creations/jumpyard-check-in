const KIOSK_PAYMENT_CURRENCY = 'SEK';

function normalizePaymentTerminalMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([alias, terminal]) => [String(alias).trim(), normalizePaymentTerminal(terminal)])
      .filter(([alias, terminal]) => alias && terminal),
  );
}

function normalizePaymentTerminal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const deviceId = stringOrNull(value.deviceId);
  const terminalId = stringOrNull(value.terminalId);
  if (!deviceId || !terminalId) return null;
  return {
    deviceId,
    terminalId,
    promptForTip: false,
  };
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

function redactPaymentTerminalValues(value, paymentTerminal) {
  let redacted = stringOrNull(value) || '';
  const secrets = typeof paymentTerminal === 'string'
    ? [stringOrNull(paymentTerminal)]
    : [stringOrNull(paymentTerminal?.deviceId), stringOrNull(paymentTerminal?.terminalId)];
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.split(secret).join('[REDACTED_TERMINAL]');
  }
  return redacted;
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

function normalizeDraftFinalizeAction(value) {
  if (value === undefined || value === null || value === '') return 'result';
  return ['result', 'status'].includes(value) ? value : null;
}

function publicKioskPaymentStatus(row) {
  const paymentStatus = stringOrNull(row?.payment_attempt_status);
  const storedConfirmationStatus = stringOrNull(row?.booking_confirmation_status);
  const bookingReference = stringOrNull(row?.roller_booking_reference);
  const confirmed =
    storedConfirmationStatus === 'confirmed' ||
    paymentStatus === 'reconciled' ||
    row?.status === 'published';
  const confirmationStatus = confirmed
    ? 'confirmed'
    : storedConfirmationStatus === 'needs_staff' || paymentStatus === 'unknown'
      ? 'needs_staff'
      : storedConfirmationStatus === 'failed' || ['failed', 'cancelled'].includes(paymentStatus)
        ? 'failed'
        : 'pending';

  const provisionalHandoff = stringOrNull(row?.checkin_session_id)
    ? {
        booking: {
          amountOwing: 0,
          bookingReference: confirmed ? bookingReference : stringOrNull(row?.roller_draft_unique_id),
          customer: {
            firstName: stringOrNull(row?.customer_first_name),
            lastName: stringOrNull(row?.customer_last_name),
          },
          items: normalizeItemsSummary(row?.items_summary),
          paymentStatus: 'paid',
          rollerUniqueId: confirmed
            ? stringOrNull(row?.confirmed_roller_unique_id)
            : stringOrNull(row?.roller_draft_unique_id),
          status: confirmed ? 'confirmed' : 'payment_approved_booking_syncing',
        },
        guestAccess: {
          expiresAt: stringOrNull(row?.guest_access_expires_at),
          token: stringOrNull(row?.payment_attempt_id),
        },
        session: {
          bookingSyncStatus: confirmed ? 'confirmed' : 'pending',
          checkinSessionId: stringOrNull(row?.checkin_session_id),
          expiresAt: stringOrNull(row?.session_expires_at),
          handoffCode: stringOrNull(row?.handoff_code),
          handoffStatus: stringOrNull(row?.handoff_status),
          safetyStatus: stringOrNull(row?.safety_status),
          status: stringOrNull(row?.session_status),
        },
      }
    : null;

  return {
    status: confirmationStatus,
    payment: {
      status: paymentStatus,
    },
    booking: {
      bookingReference: confirmed ? bookingReference : null,
      status: confirmationStatus,
    },
    ...(provisionalHandoff ? { provisionalHandoff } : {}),
  };
}

function normalizeItemsSummary(value) {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? parseJsonArray(value)
      : [];
  return items.map((item) => ({
    bookingDate: stringOrNull(item?.bookingDate),
    durationMinutes: finiteNumber(item?.durationMinutes),
    endTime: stringOrNull(item?.endTime),
    parentProductId: stringOrNull(item?.parentProductId),
    parentProductName: stringOrNull(item?.parentProductName),
    parentType: stringOrNull(item?.parentType),
    productId: stringOrNull(item?.productId),
    productName: stringOrNull(item?.productName),
    productSubType: stringOrNull(item?.productSubType),
    productType: stringOrNull(item?.productType),
    quantity: finiteNumber(item?.quantity) ?? 1,
    startTime: stringOrNull(item?.startTime),
    tickets: [],
  }));
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeBookingReadback(body) {
  const booking = body?.booking && typeof body.booking === 'object' ? body.booking : body;
  const costs = booking?.costs && typeof booking.costs === 'object' ? booking.costs : booking;
  const amountOwing = finiteNumber(costs?.amountOwing ?? booking?.amountOwing ?? booking?.remainder);
  const paymentStatus = stringOrNull(booking?.paymentStatus ?? booking?.status ?? booking?.bookingStatus);
  const unsafeStatus = /pending|unpaid|partial|cancel|fail|draft/i.test(paymentStatus ?? '');
  const items = normalizeReadbackItems(booking);
  const ticketIds = items.flatMap((item) => item.tickets.map((ticket) => ticket.ticketId)).filter(Boolean);
  const bookingReference = stringOrNull(booking?.bookingReference ?? booking?.reference ?? booking?.bookingId);
  const rollerUniqueId = stringOrNull(booking?.uniqueId ?? booking?.id ?? booking?.bookingUniqueId);
  return {
    bookingReference,
    confirmed:
      amountOwing !== null &&
      amountOwing <= 0 &&
      !unsafeStatus &&
      Boolean(bookingReference && rollerUniqueId) &&
      ticketIds.length > 0,
    items,
    paymentStatus,
    rollerUniqueId,
    ticketIds,
  };
}

function normalizeReadbackItems(booking) {
  const rawItems = Array.isArray(booking?.items) ? booking.items : [];
  return rawItems.map((item, itemIndex) => {
    const rawTickets = Array.isArray(item?.tickets)
      ? item.tickets
      : Array.isArray(item?.ticketInstances)
        ? item.ticketInstances
        : [];
    return {
      bookingDate: stringOrNull(item?.bookingDate ?? booking?.bookingDate),
      bookingItemId: stringOrNull(item?.bookingItemId ?? item?.id ?? item?.uniqueId),
      durationMinutes: finiteNumber(item?.durationMinutes ?? item?.duration),
      endTime: stringOrNull(item?.endTime ?? item?.sessionEndTime),
      itemIndex,
      parentProductId: stringOrNull(item?.parentProductId ?? item?.product?.parentProductId),
      parentProductName: stringOrNull(item?.parentProductName ?? item?.product?.parentProductName),
      parentType: stringOrNull(item?.parentType ?? item?.product?.parentType),
      productId: stringOrNull(item?.productId ?? item?.product?.id),
      productName: stringOrNull(item?.productName ?? item?.name ?? item?.product?.name),
      productSubType: stringOrNull(item?.productSubType ?? item?.product?.productSubType),
      productType: stringOrNull(item?.productType ?? item?.product?.productType),
      quantity: finiteNumber(item?.quantity) ?? rawTickets.length ?? 1,
      startTime: stringOrNull(item?.startTime ?? item?.sessionStartTime),
      tickets: rawTickets
        .map((ticket) => ({
          redeemStatus: stringOrNull(ticket?.redeemStatus ?? ticket?.status),
          ticketId: stringOrNull(ticket?.ticketId ?? ticket?.id),
        }))
        .filter((ticket) => ticket.ticketId),
    };
  });
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
  normalizeDraftFinalizeAction,
  normalizeBookingReadback,
  normalizePaymentTerminalMap,
  normalizeTerminalOutcome,
  publicKioskPaymentStatus,
  redactPaymentTerminalValues,
  resolveKioskPaymentTerminal,
  verifyKioskDraftPayment,
};
