'use client';

import { useEffect, useId, useRef, type RefObject } from 'react';
import { Minus, Plus } from 'lucide-react';
import { JumpyardIcon, type JumpyardIconName } from '@/components/JumpyardIcon';
import { useTranslation } from '@/context/LanguageContext';
import type { AddonId } from '@/flow/types';
import { hasAddonPurchase } from '@/flow/addonChoices';

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

interface Props {
  entries: AddonChoice[];
  onQuantity: (id: AddonId, quantity: number) => void;
}

// #457 (Hylla): water comes first as a compact row, the optional add-ons follow as a three-tile
// shelf. Every item is an ordinary offer, so Continue never asks for a tick.
// #515: socks are never a row here. A purchase picks them on the quantity step and an existing
// booking above this list, both in SocksQuantity.
const SHELF_ORDER: AddonId[] = ['skyrider', 'lock', 'coffee'];

function shelfEntries(entries: readonly AddonChoice[]) {
  const optional = entries.filter((entry) => entry.id !== 'socks' && entry.id !== 'water_bottle');
  return [
    ...SHELF_ORDER.flatMap((id) => optional.filter((entry) => entry.id === id)),
    ...optional.filter((entry) => !SHELF_ORDER.includes(entry.id)),
  ];
}

/** Fades the bottom edge of the list while more of it sits below the fold. */
function useScrollFade(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const list = root.current;
    const scroller = list?.closest<HTMLElement>('.addon-shop-scroll');
    if (!list || !scroller) return;
    const update = () => {
      if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1) scroller.dataset.overflow = 'true';
      else delete scroller.dataset.overflow;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(list);
    scroller.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', update);
      delete scroller.dataset.overflow;
    };
  }, [root]);
}

export function AddonChoices({ entries, onQuantity }: Props) {
  const { t, lang } = useTranslation();
  const copy = t.addons.choices;
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  useScrollFade(root);
  const money = (value: number) => `${new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 2 }).format(value)}\u00a0${t.common.currency}`;
  const fill = (text: string, values: Record<string, string | number>) =>
    text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
  const sellable = (entry: AddonChoice) => entry.available && entry.price !== null;

  const unitPrice = (entry: AddonChoice) => {
    const price = money(entry.price ?? 0);
    if (entry.unit === t.addons.perJumper) return fill(copy.perJumper, { price });
    if (entry.unit === t.addons.each) return fill(copy.perEach, { price });
    return `${price} ${entry.unit}`;
  };

  // Rows show the price and what the booking already includes; the stepper shows what is added now.
  const rowMeta = (entry: AddonChoice) => [
    ...(entry.included > 0 ? [fill(copy.included, { count: entry.included })] : []),
    ...(!sellable(entry) ? [] : entry.included > 0 ? [fill(copy.extraPrice, { price: unitPrice(entry) })] : [unitPrice(entry)]),
  ];

  const stepper = (entry: AddonChoice, className = 'addon-shop-stepper', showCount = true) => (
    <div className={className} role="group" aria-label={`${copy.quantity}: ${entry.label}`}>
      <button type="button" aria-label={`${copy.remove}: ${entry.label}`}
        data-testid={`addon-choice-${entry.id}-decrement`}
        disabled={entry.quantity <= entry.included}
        onClick={() => onQuantity(entry.id, Math.max(entry.included, entry.quantity - 1))}>
        <Minus aria-hidden="true" />
      </button>
      {showCount && <output aria-label={`${copy.quantity}: ${entry.label}`} data-active={entry.quantity > entry.included}>
        {Math.max(0, entry.quantity - entry.included)}
      </output>}
      <button type="button" aria-label={`${copy.add}: ${entry.label}`}
        data-testid={`addon-choice-${entry.id}-increment`}
        disabled={!entry.available || entry.quantity >= entry.max}
        onClick={() => onQuantity(entry.id, Math.min(entry.max, entry.quantity + 1))}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );

  // Keep the water offer visible even when the catalog cannot sell it.
  const water = entries.find((item) => item.id === 'water_bottle') ?? {
    id: 'water_bottle', label: t.addons.products.waterBottleLabel, icon: 'water', price: null,
    description: '', unit: t.addons.each, quantity: 0, included: 0, max: 0, available: false,
  } satisfies AddonChoice;
  const waterTitleId = `${uid}-water_bottle-title`;
  const waterNoteId = `${uid}-water_bottle-note`;

  return (
    <div ref={root} className="addon-shop" data-testid="addon-choice-choices">
      {process.env.NEXT_PUBLIC_PHONE_ADDON_PREVIEW === 'true' && <p className="addon-shop-preview">{copy.preview}</p>}
      <h2 className="addon-shop-group">{copy.firstGroupBottle}</h2>
      <section className="addon-shop-row" data-selected={hasAddonPurchase(water)}
        aria-labelledby={waterTitleId} aria-describedby={waterNoteId} data-testid="addon-choice-water_bottle">
        {/* #491 (workshop 2026-10-07): the water is recommended, as a small red label on the row's top border. */}
        {water.available && <span className="addon-shop-note addon-shop-row-tag">{copy.waterRecommended}</span>}
        <div className="addon-shop-row-main">
          <span className="addon-shop-icon-wrap">
            <JumpyardIcon name={water.icon} className="addon-shop-icon" />
            {hasAddonPurchase(water) && <JumpyardIcon name="success-check" className="addon-shop-badge" />}
          </span>
          <div className="addon-shop-text">
            <h3 id={waterTitleId}>{copy.bottleTitle}</h3>
            {rowMeta(water).map((line) => <p key={line} className="addon-shop-meta">{line}</p>)}
          </div>
          {stepper(water)}
        </div>
        <p id={waterNoteId} className="addon-shop-row-note">
          {water.available ? copy.bottleEnvironment : copy.unavailableRequired}
        </p>
      </section>
      <h2 className="addon-shop-group addon-shop-group-optional">{copy.optionalGroup}</h2>
      <div className="addon-shop-shelf">
        {shelfEntries(entries).map((entry) => {
          const added = Math.max(0, entry.quantity - entry.included);
          const sell = entry.id === 'lock' ? copy.lockBenefit : entry.id === 'coffee' ? copy.coffeeBenefit : entry.id === 'skyrider' ? copy.skyRiderBenefit : entry.description;
          const fact = entry.id === 'lock' ? copy.lockFact : entry.id === 'coffee' ? copy.coffeeFact : entry.id === 'skyrider' ? copy.skyRiderFact : '';
          const nameId = `${uid}-${entry.id}-name`;
          const sellId = `${uid}-${entry.id}-sell`;
          return (
            <section key={entry.id} className="addon-shop-tile" data-selected={entry.quantity > entry.included}
              aria-labelledby={nameId} aria-describedby={sell ? sellId : undefined} data-testid={`addon-choice-${entry.id}`}>
              {added > 0 && <span className="addon-shop-tile-count">
                <span aria-hidden="true">×{added}</span>
                <span className="addon-shop-sr">{fill(copy.chosen, { count: added })}</span>
              </span>}
              <JumpyardIcon name={entry.icon} className="addon-shop-tile-icon" />
              <h3 id={nameId}>{entry.label}</h3>
              {fact && <p className="addon-shop-tile-fact">{fact}</p>}
              {/* #548 (Love, 2026-10-15): SkyRider's label is its rule, a must and not a tip. */}
              {entry.id === 'skyrider' && entry.available && <p className="addon-shop-tile-rule">{copy.skyRiderRule}</p>}
              <p className="addon-shop-tile-price">
                {sellable(entry) ? unitPrice(entry) : t.addons.unsupported}
                {entry.included > 0 && <span className="addon-shop-tile-included">{fill(copy.included, { count: entry.included })}</span>}
              </p>
              {stepper(entry, 'addon-shop-stepper addon-shop-tile-stepper', false)}
              {sell && <p id={sellId} className="addon-shop-sr">{sell}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
