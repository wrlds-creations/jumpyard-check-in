// #353: Anders has removed Klarna from the phone checkout product scope.
// Roller ECOM's IEcomPaymentRequest already carries this exclusion list to
// payment/session (the SDK uses it for unavailable Apple Pay). Apply it only
// at our fresh-session HTTP boundary, never to a submitted payment's return.
export function excludeKlarnaFromPaymentSession(data: unknown, adyenProvider: number): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid payment session request');
  }
  const request = data as Record<string, unknown>;
  if (request.provider !== adyenProvider) return data;

  const excluded = request.unsupportedPaymentMethods ?? [];
  if (!Array.isArray(excluded) || excluded.some(method => typeof method !== 'string')) {
    throw new Error('Invalid payment method exclusions');
  }
  return {
    ...request,
    unsupportedPaymentMethods: [...new Set([...excluded, 'klarna', 'klarna_account', 'klarna_paynow'])],
  };
}
