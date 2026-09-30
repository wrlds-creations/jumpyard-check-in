/**
 * #458 (D0231): the guest approves the short safety rules before payment. The approval
 * travels with the purchase draft, so Cloud can make the paid session ready for staff
 * (number and QR) without another safety step. The version names the rules and the
 * attestation sentence Love approved on 2026-09-30; Cloud rejects any other version.
 */
export const SAFETY_ATTESTATION_COPY_VERSION = 'safety-rules-2026-09-30-v1';

export interface SafetyAttestation {
  attestedAt: string;
  copyVersion: typeof SAFETY_ATTESTATION_COPY_VERSION;
  locale: 'sv' | 'en';
}

/** Absent or unreadable approval sends nothing, which keeps the old order on the server. */
export function buildSafetyAttestation(
  attestedAt: string | null | undefined,
  locale: 'sv' | 'en',
): SafetyAttestation | undefined {
  const time = attestedAt ? Date.parse(attestedAt) : Number.NaN;
  if (!Number.isFinite(time)) return undefined;
  return { attestedAt: new Date(time).toISOString(), copyVersion: SAFETY_ATTESTATION_COPY_VERSION, locale };
}
