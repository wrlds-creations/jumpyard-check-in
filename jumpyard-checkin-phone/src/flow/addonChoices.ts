export interface AddonChoiceState {
  id: string;
  quantity: number;
  included: number;
  available: boolean;
}

// #457: a purchase only marks the offer as covered; nothing on the add-on step is required.
export function hasAddonPurchase(entry: AddonChoiceState | undefined): boolean {
  return Boolean(entry && (entry.included > 0 || (entry.available && entry.quantity > 0)));
}
