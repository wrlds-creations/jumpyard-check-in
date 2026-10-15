import type { AddonId } from './types';

export interface AddonCatalogConfig {
  icon: string;
  maxPerGuest: number;
  requiresAvailability: boolean;
  rollerProductId: number | null;
}

export const ADDON_CATALOG_CONFIG: Record<AddonId, AddonCatalogConfig> = {
  skyrider: {
    icon: 'zipline',
    maxPerGuest: 4,
    requiresAvailability: true,
    rollerProductId: 1765443,
  },
  connected: {
    icon: 'connected-band',
    maxPerGuest: 1,
    requiresAvailability: false,
    rollerProductId: null,
  },
  coffee: {
    icon: 'drink-cup',
    maxPerGuest: 4,
    requiresAvailability: false,
    rollerProductId: 1765452,
  },
  extra_person: {
    icon: 'add-guest',
    maxPerGuest: 4,
    requiresAvailability: true,
    rollerProductId: null,
  },
  lock: {
    icon: 'padlock',
    maxPerGuest: 4,
    requiresAvailability: false,
    rollerProductId: 1765441,
  },
  socks: {
    icon: 'grip-socks',
    maxPerGuest: 4,
    requiresAvailability: false,
    rollerProductId: 1765445,
  },
  water_bottle: {
    icon: 'water',
    maxPerGuest: 4,
    requiresAvailability: false,
    rollerProductId: null,
  },
};

export const BUY_ENTRY_ADDON_IDS: AddonId[] = ['socks', 'water_bottle', 'skyrider', 'lock', 'coffee'];

/**
 * #549 (D0272): SkyRider, water, coffee and padlocks go up to 99 each, whatever the number of jumpers
 * (the kiosk slip prints at most 99 per line). ROLLER's free SkyRider places still apply; socks keep
 * their own rule.
 */
export const ADDON_MAX_QUANTITY = 99;

export const EXISTING_BOOKING_ADDON_IDS: AddonId[] = [
  'socks',
  'water_bottle',
  'skyrider',
  'connected',
  'coffee',
  'extra_person',
  'lock',
];

export const HIDDEN_EXISTING_BOOKING_ADDONS = new Set<AddonId>(['connected', 'extra_person']);
