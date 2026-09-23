// This is a pending choice, never a ROLLER customer flag or payment confirmation.
export const EMAIL_MARKETING_COPY_VERSION = 'phone-email-2026-09-23-v3';
export const EMAIL_MARKETING_PRIVACY_URL = 'https://jumpyard.se/dataskyddspolicy/';

export interface PendingEmailMarketingConsent {
  granted: true;
  copyVersion: typeof EMAIL_MARKETING_COPY_VERSION;
  locale: 'sv' | 'en';
}

export function pendingEmailMarketingConsent(
  checked: boolean,
  locale: 'sv' | 'en'
): PendingEmailMarketingConsent | undefined {
  return checked ? { granted: true, copyVersion: EMAIL_MARKETING_COPY_VERSION, locale } : undefined;
}
