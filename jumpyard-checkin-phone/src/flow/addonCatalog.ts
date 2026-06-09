import type { AddonId } from './types';

export interface AddonCatalogConfig {
  icon: string;
  maxPerGuest: number;
  price: number;
  requiresAvailability: boolean;
  rollerProductId: number | null;
}

export const ADDON_CATALOG_CONFIG: Record<AddonId, AddonCatalogConfig> = {
  skyrider: {
    icon: 'zipline',
    maxPerGuest: 1,
    price: 45,
    requiresAvailability: true,
    rollerProductId: 1765443,
  },
  connected: {
    icon: 'connected-band',
    maxPerGuest: 1,
    price: 40,
    requiresAvailability: false,
    rollerProductId: null,
  },
  coffee: {
    icon: 'drink-cup',
    maxPerGuest: 4,
    price: 35,
    requiresAvailability: false,
    rollerProductId: 1765452,
  },
  extra_person: {
    icon: 'add-guest',
    maxPerGuest: 4,
    price: 179,
    requiresAvailability: true,
    rollerProductId: null,
  },
  lock: {
    icon: 'padlock',
    maxPerGuest: 1,
    price: 40,
    requiresAvailability: false,
    rollerProductId: 1765441,
  },
  socks: {
    icon: 'grip-socks',
    maxPerGuest: 4,
    price: 40,
    requiresAvailability: false,
    rollerProductId: 1765445,
  },
};

export const BUY_ENTRY_ADDON_IDS: AddonId[] = ['skyrider', 'socks', 'lock', 'coffee'];

export const EXISTING_BOOKING_ADDON_IDS: AddonId[] = [
  'skyrider',
  'connected',
  'socks',
  'coffee',
  'extra_person',
  'lock',
];

export const HIDDEN_EXISTING_BOOKING_ADDONS = new Set<AddonId>(['connected', 'extra_person']);
