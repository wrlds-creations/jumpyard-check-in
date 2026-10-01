import type { BandColour, BandColourCount } from './types';

// GH-459: JumpYard Cloud owns the band colour scheme. The phone only validates and shows
// what Cloud sent; anything malformed is dropped, so an unknown band shows no colour.
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export function normalizeBandColour(value: unknown): BandColour | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { id, name, swatch, endTime } = value as Record<string, unknown>;
  const names = name && typeof name === 'object' ? name as Record<string, unknown> : null;
  const sv = typeof names?.sv === 'string' ? names.sv.trim() : '';
  const en = typeof names?.en === 'string' ? names.en.trim() : '';
  if (typeof id !== 'string' || !id || !sv || !en || !Array.isArray(swatch) || swatch.length < 1 || swatch.length > 2
    || !swatch.every((colour) => typeof colour === 'string' && HEX_COLOUR.test(colour))) return undefined;
  return { id, name: { sv, en }, swatch: [...swatch], ...(typeof endTime === 'string' ? { endTime } : {}) };
}

/** One entry per colour, in first-seen order; entries without a colour are left out. */
export function groupBandColours(entries: { bandColour?: BandColour; quantity: number }[]): BandColourCount[] {
  const groups = new Map<string, BandColourCount>();
  for (const { bandColour, quantity } of entries) {
    if (!bandColour || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
    const group = groups.get(bandColour.id);
    if (group) group.quantity += quantity;
    else groups.set(bandColour.id, { ...bandColour, quantity });
  }
  return [...groups.values()];
}

/** A two-tone band is drawn as two halves. */
export function bandSwatchBackground(swatch: string[]) {
  const colours = swatch.filter((colour) => HEX_COLOUR.test(colour));
  if (colours.length === 2) return `linear-gradient(90deg, ${colours[0]} 50%, ${colours[1]} 50%)`;
  return colours[0] ?? 'transparent';
}
