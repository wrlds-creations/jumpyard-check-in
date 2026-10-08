import type { JumpyardIconName } from '@/components/JumpyardIcon';
import type { BookingContentRow } from './packageContents';
import type { Addon, AddonId, BandColourCount, GuestCafeItem } from './types';

/**
 * #491 (workshop 2026-10-07): the completion page names three places to collect things.
 * - socks: the sock station, where guests take their socks themselves;
 * - bands: the wristband desk, where staff hand out entry bands (with colour), SkyRider bands and padlocks;
 * - later: the café, where the guest shows the number for coffee, the water bottle and pizza.
 * Cloud's café lines (GH-453) replace the phone's own café rows when Cloud sent them.
 */
export type PickupGroupKey = 'socks' | 'bands' | 'later' | 'other';

export interface PickupItem {
  icon: JumpyardIconName;
  label: string;
  /** For café rows: what is still left to collect. */
  qty: number;
  /** GH-453: café quantity already handed out today (from Cloud). */
  collected?: number;
  detail?: string;
  testId?: string;
  /** GH-459: which band colour(s) to take for this row. */
  bandColours?: BandColourCount[];
}

export interface PickupGroup { key: PickupGroupKey; title: string; items: PickupItem[] }

export const PICKUP_PLACE_BY_ADDON: Record<AddonId, PickupGroupKey> = {
  socks: 'socks',
  connected: 'bands',
  lock: 'bands',
  skyrider: 'bands',
  coffee: 'later',
  water_bottle: 'later',
  extra_person: 'other',
};

const ADDON_ICONS: Record<AddonId, JumpyardIconName> = {
  connected: 'connected-band',
  socks: 'grip-socks',
  water_bottle: 'water-bottle',
  lock: 'padlock',
  skyrider: 'zipline',
  coffee: 'drink-cup',
  extra_person: 'add-guest',
};

/** Icons for Cloud's café kinds; water belongs to the café since #491. */
export const CAFE_ICONS: Record<string, JumpyardIconName> = {
  coffee: 'drink-cup',
  pizza: 'combo-pizza',
  water: 'water-bottle',
  cafe: 'drink-cup',
};

export function toCafeRow(item: GuestCafeItem): PickupItem {
  return {
    icon: CAFE_ICONS[item.kind] ?? 'drink-cup',
    label: item.name,
    qty: item.remaining,
    collected: item.collected,
    detail: item.detail ?? undefined,
  };
}

export const GROUP_ORDER: PickupGroupKey[] = ['socks', 'bands', 'later', 'other'];

export function buildPickupGroups({
  contentRows,
  selectedAddons,
  cloudCafe,
  labels,
}: {
  contentRows: BookingContentRow[];
  selectedAddons: Addon[];
  /** GH-453: Cloud's café list; null when Cloud did not send one. */
  cloudCafe: GuestCafeItem[] | null;
  labels: { connectedBands: string; later: string; other: string };
}): PickupGroup[] {
  const items: Record<PickupGroupKey, PickupItem[]> = { socks: [], bands: [], later: [], other: [] };

  for (const row of contentRows) {
    if (row.collection === 'checkin') {
      items.bands.push({ icon: 'visitor-wristband', label: row.label, qty: row.quantity, detail: row.detail,
        testId: 'ready-entry-ticket-type', bandColours: row.bandColours });
    } else {
      items.later.push({ icon: 'combo-pizza', label: row.label, qty: row.quantity, detail: row.detail });
    }
  }

  for (const addon of selectedAddons) {
    const place = PICKUP_PLACE_BY_ADDON[addon.id] ?? 'other';
    items[place].push({
      icon: ADDON_ICONS[addon.id] ?? 'gift-card',
      label: addon.id === 'connected' ? labels.connectedBands : addon.label,
      qty: addon.qty,
    });
  }

  if (cloudCafe) {
    const phoneWater = items.later.filter((item) => item.icon === 'water-bottle');
    // A Cloud from before #491 kept water at the entrance and leaves it out of its café list;
    // the bottle is still shown at the café so it never disappears from the page.
    const keepPhoneWater = !cloudCafe.some((item) => item.kind === 'water') ? phoneWater : [];
    items.later = [...cloudCafe.map(toCafeRow), ...keepPhoneWater];
  }

  const titles: Record<PickupGroupKey, string> = { socks: '', bands: '', later: labels.later, other: labels.other };
  return GROUP_ORDER
    .filter((key) => items[key].length > 0)
    .map((key) => ({ key, title: titles[key], items: items[key] }));
}
