export type RequiredAddon = 'socks' | 'water_bottle';

export interface AddonChoiceState {
  id: string;
  quantity: number;
  included: number;
  available: boolean;
}

export function hasAddonPurchase(entry: AddonChoiceState | undefined): boolean {
  return Boolean(entry && (entry.included > 0 || (entry.available && entry.quantity > 0)));
}

export function getMissingAddonChoices(
  entries: readonly AddonChoiceState[],
  own: Record<RequiredAddon, boolean>,
): RequiredAddon[] {
  return (['socks', 'water_bottle'] as const).filter((id) => {
    const entry = entries.find((item) => item.id === id);
    return !own[id] && !hasAddonPurchase(entry);
  });
}
