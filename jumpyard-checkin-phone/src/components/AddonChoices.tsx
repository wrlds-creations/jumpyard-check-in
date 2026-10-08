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

type FirstRow = 'socks' | 'water_bottle';

interface Props {
  entries: AddonChoice[];
  onQuantity: (id: AddonId, quantity: number) => void;
  /** #491: a new purchase picks socks on the quantity step, so it shows only the bottle row here. */
  rows?: readonly FirstRow[];
}

// #457 (Hylla): socks and water come first as compact rows, the optional add-ons follow as a
// three-tile shelf. Every item is an ordinary offer, so Continue never asks for a tick.
const SHELF_ORDER: AddonId[] = ['skyrider', 'lock', 'coffee'];
const FIRST_ROWS: readonly FirstRow[] = ['socks', 'water_bottle'];

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

export function AddonChoices({ entries, onQuantity, rows = FIRST_ROWS }: Props) {
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
    if (entry.id === 'socks') return fill(copy.perPair, { price });
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

  return (
    <div ref={root} className="addon-shop" data-testid="addon-choice-choices">
      {process.env.NEXT_PUBLIC_PHONE_ADDON_PREVIEW === 'true' && <p className="addon-shop-preview">{copy.preview}</p>}
      <h2 className="addon-shop-group">{rows.includes('socks') ? copy.firstGroup : copy.firstGroupBottle}</h2>
      {(['socks', 'water_bottle'] as const).filter((id) => rows.includes(id)).map((id) => {
        const socks = id === 'socks';
        // Keep the offer visible even when the catalog cannot sell this item.
        const entry = entries.find((item) => item.id === id) ?? {
          id, label: socks ? t.addons.products.socksLabel : t.addons.products.waterBottleLabel,
          icon: socks ? 'grip-socks' : 'water-bottle', price: null,
          description: '', unit: t.addons.each, quantity: 0, included: 0, max: 0, available: false,
        } satisfies AddonChoice;
        const meta = rowMeta(entry);
        const titleId = `${uid}-${id}-title`;
        const noteId = `${uid}-${id}-note`;
        return (
          <section key={id} className="addon-shop-row" data-selected={hasAddonPurchase(entry)}
            aria-labelledby={titleId} aria-describedby={noteId} data-testid={`addon-choice-${id}`}>
            {/* #491 (workshop 2026-10-07): the bottle is recommended, in the Sky Rider tip's style. */}
            {!socks && entry.available && <span className="addon-shop-note addon-shop-row-tag">{copy.waterRecommended}</span>}
            <div className="addon-shop-row-main">
              <span className="addon-shop-icon-wrap">
                <JumpyardIcon name={entry.icon} className="addon-shop-icon" />
                {hasAddonPurchase(entry) && <JumpyardIcon name="success-check" className="addon-shop-badge" />}
              </span>
              <div className="addon-shop-text">
                <h3 id={titleId}>{socks ? copy.socksTitle : copy.bottleTitle}</h3>
                {meta.map((line) => <p key={line} className="addon-shop-meta">{line}</p>)}
              </div>
              {stepper(entry)}
            </div>
            <p id={noteId} className="addon-shop-row-note">
              {!entry.available ? copy.unavailableRequired : socks ? copy.socksBenefit : copy.bottleEnvironment}
            </p>
          </section>
        );
      })}
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
              {entry.id === 'skyrider' && entry.available && <span className="addon-shop-note">{copy.recommended}</span>}
              {added > 0 && <span className="addon-shop-tile-count">
                <span aria-hidden="true">×{added}</span>
                <span className="addon-shop-sr">{fill(copy.chosen, { count: added })}</span>
              </span>}
              <JumpyardIcon name={entry.icon} className="addon-shop-tile-icon" />
              <h3 id={nameId}>{entry.label}</h3>
              {fact && <p className="addon-shop-tile-fact">{fact}</p>}
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
