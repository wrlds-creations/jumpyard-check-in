'use client';

import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { useTranslation } from '@/context/LanguageContext';
import type { AddonId } from '@/flow/types';
import {
  getMissingAddonChoices,
  getRecommendedSocksToAdd,
  hasAddonPurchase,
  type RequiredAddon,
} from '@/flow/addonChoices';

export interface AddonChoice {
  id: AddonId;
  label: string;
  description: string;
  icon: JumpyardIconName;
  price: number | null;
  unit: string;
  quantity: number;
  included: number;
  max: number;
  available: boolean;
}

export interface AddonChoicesHandle {
  validate: () => boolean;
}

interface Props {
  ref?: Ref<AddonChoicesHandle>;
  entries: AddonChoice[];
  guestCount: number;
  ownSocks: boolean;
  ownBottle: boolean;
  onQuantity: (id: AddonId, quantity: number) => void;
  onOwnSocks: (checked: boolean) => void;
  onOwnBottle: (checked: boolean) => void;
}

export function AddonChoices({ ref, entries, guestCount, ownSocks, ownBottle, onQuantity, onOwnSocks, onOwnBottle }: Props) {
  const { t, lang } = useTranslation();
  const copy = t.addons.choices;
  const [attempted, setAttempted] = useState(false);
  const cards = useRef<Partial<Record<RequiredAddon, HTMLElement | null>>>({});
  const missing = getMissingAddonChoices(entries, { socks: ownSocks, water_bottle: ownBottle });
  const money = (value: number) => `${new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 2 }).format(value)} ${t.common.currency}`;
  const countText = (text: string, count: number) => text.replace('{count}', String(count));
  const visibleSocks = Math.min(Math.max(0, guestCount), 5);

  useImperativeHandle(ref, () => ({
    validate() {
      setAttempted(true);
      if (!missing.length) return true;
      cards.current[missing[0]]?.focus();
      return false;
    },
  }));

  const stepper = (entry: AddonChoice) => (
    <div className="addon-shop-stepper" role="group" aria-label={`${copy.quantity}: ${entry.label}`}>
      <button type="button" aria-label={`${copy.remove}: ${entry.label}`}
        data-testid={`addon-choice-${entry.id}-decrement`}
        disabled={entry.quantity <= entry.included}
        onClick={() => onQuantity(entry.id, Math.max(entry.included, entry.quantity - 1))}>
        <Minus aria-hidden="true" />
      </button>
      <output aria-label={`${copy.quantity}: ${entry.label}`}>{Math.max(0, entry.quantity - entry.included)}</output>
      <button type="button" aria-label={`${copy.add}: ${entry.label}`}
        data-testid={`addon-choice-${entry.id}-increment`}
        disabled={!entry.available || entry.quantity >= entry.max}
        onClick={() => onQuantity(entry.id, Math.min(entry.max, entry.quantity + 1))}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );

  const included = (entry: AddonChoice) => entry.included > 0 && (
    <p className="addon-shop-included"><Check aria-hidden="true" />{countText(copy.included, entry.included)}</p>
  );

  return (
    <div className="addon-shop" data-testid="addon-choice-choices">
      {process.env.NEXT_PUBLIC_PHONE_ADDON_PREVIEW === 'true' && <p className="addon-shop-preview">{copy.preview}</p>}
      {(['socks', 'water_bottle'] as const).map((id) => {
        const socks = id === 'socks';
        // Keep the decision visible even when the catalog cannot sell this item.
        const entry = entries.find((item) => item.id === id) ?? {
          id, label: socks ? t.addons.products.socksLabel : t.addons.products.waterBottleLabel,
          icon: socks ? 'grip-socks' : 'water-bottle', price: null,
          description: '', unit: t.addons.each, quantity: 0, included: 0, max: 0, available: false,
        } satisfies AddonChoice;
        const own = socks ? ownSocks : ownBottle;
        const confirm = socks ? onOwnSocks : onOwnBottle;
        const hasError = attempted && missing.includes(id);
        const resolved = !missing.includes(id);
        const recommended = socks ? getRecommendedSocksToAdd(guestCount, entry.quantity, entry.max) : 0;
        const errorId = `addon-choice-${id}-error`;
        return (
          <section key={id} ref={(node) => { cards.current[id] = node; }} tabIndex={-1}
            aria-labelledby={`addon-choice-${id}-title`} aria-describedby={hasError ? errorId : undefined}
            className="addon-shop-required" data-invalid={hasError} data-resolved={resolved}
            data-testid={`addon-choice-${id}`}>
            <header className="addon-shop-card-heading">
              <JumpyardIcon name={entry.icon} className="addon-shop-icon" />
              <div>
                <h3 id={`addon-choice-${id}-title`}>{socks ? copy.socksTitle : copy.bottleTitle}</h3>
                {entry.price !== null && entry.available && <p className="addon-shop-price">{money(entry.price)} {socks ? copy.perPair : t.addons.eachLong}</p>}
              </div>
            </header>
            <p className="addon-shop-description">{socks ? copy.socksBenefit : copy.bottleBenefit}</p>
            {!socks && <p className="addon-shop-environment">{copy.bottleEnvironment}</p>}
            {included(entry)}
            {!entry.available && <p className="addon-shop-unavailable">{copy.unavailableRequired}</p>}
            <div className="addon-shop-purchase">
              <div className="addon-shop-purchase-copy">
                {socks && <div className="addon-shop-recommendation">
                  <span className="addon-shop-socks" aria-hidden="true">
                    {Array.from({ length: visibleSocks }, (_, index) => (
                      <JumpyardIcon key={index} name="grip-socks" className="addon-shop-sock-icon" />
                    ))}
                    {guestCount > visibleSocks && <span>+{guestCount - visibleSocks}</span>}
                  </span>
                  <p>{guestCount === 1 ? copy.socksRecommendationOne : countText(copy.socksRecommendation, guestCount)}</p>
                </div>}
                {entry.available && ((socks && recommended > 0) || (!socks && entry.quantity === entry.included)) && (
                  <button type="button" className="addon-shop-add" data-testid={`addon-choice-${id}-recommend`}
                    disabled={entry.quantity >= entry.max}
                    onClick={() => onQuantity(id, Math.min(entry.max, entry.quantity + (socks ? recommended : 1)))}>
                    <Plus aria-hidden="true" />{socks ? (recommended === 1 ? copy.addSocksOne : countText(copy.addSocks, recommended)) : copy.addBottle}
                  </button>
                )}
              </div>
              {stepper(entry)}
            </div>
            {!hasAddonPurchase(entry) && <label className="addon-shop-own" data-checked={own}>
              <input type="checkbox" checked={own} onChange={(event) => confirm(event.target.checked)} />
              <span>{socks ? copy.ownSocks : copy.ownBottle}</span>
            </label>}
            {hasError && <p id={errorId} role="alert" className="addon-shop-error"><JumpyardIcon name="warning-transparent" className="addon-shop-warning-icon" />{socks ? copy.socksRequired : copy.bottleRequired}</p>}
          </section>
        );
      })}
      {entries.filter((entry) => entry.id !== 'socks' && entry.id !== 'water_bottle').map((entry) => (
        <section key={entry.id} className="addon-shop-optional" data-selected={entry.quantity > entry.included}
          aria-label={entry.label} data-testid={`addon-choice-${entry.id}`}>
          <header className="addon-shop-card-heading">
            <JumpyardIcon name={entry.icon} className="addon-shop-icon" />
            <div>
              <h3>{entry.label}</h3>
              <p className="addon-shop-price">{entry.available && entry.price !== null ? `${money(entry.price)} ${entry.unit === t.addons.each ? t.addons.eachLong : entry.unit}` : t.addons.unsupported}</p>
            </div>
          </header>
          {stepper(entry)}
          <p className="addon-shop-description">{entry.id === 'lock' ? copy.lockBenefit : entry.id === 'coffee' ? copy.coffeeBenefit : entry.id === 'skyrider' ? copy.skyRiderBenefit : entry.description}</p>
          {entry.id === 'skyrider' && entry.available && <p className="addon-shop-note">
            <span className="addon-shop-recommended">{copy.recommended}</span>
          </p>}
          {included(entry)}
        </section>
      ))}
    </div>
  );
}
