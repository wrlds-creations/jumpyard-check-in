'use client';

import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import { useTranslation } from '@/context/LanguageContext';

interface SocksQuantityProps {
  /** Every pair on the order: what the booking already has plus what is added now. */
  quantity: number;
  /** #515: pairs an existing booking already has; the stepper never goes below them. */
  included?: number;
  /** Price per pair from Cloud's availability; null when socks cannot be sold here. */
  price: number | null;
  available: boolean;
  max: number;
  onQuantity: (quantity: number) => void;
}

/**
 * #491 (workshop 2026-10-07): socks are chosen next to "Antal hoppare", in the approved Hylla row
 * style (#457). The count is the same JumpSocks purchase line the add-on step used, so the quote,
 * the draft and the price are unchanged. Nothing is preselected.
 * #515 (Love, 2026-10-12): an existing booking's add-on step shows this same block, so every guest
 * reads one rule, and its parents are red.
 */
export function SocksQuantity({ quantity, included = 0, price, available, max, onQuantity }: SocksQuantityProps) {
  const { t, lang } = useTranslation();
  const copy = t.addons.choices;
  const uid = useId();
  const sellable = available && price !== null;
  const money = (value: number) => `${new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 2 }).format(value)} ${t.common.currency}`;
  const perPair = sellable ? copy.perPair.replace('{price}', money(price)) : '';
  const added = Math.max(0, quantity - included);
  const titleId = `${uid}-socks-title`;
  const noteId = `${uid}-socks-note`;

  return (
    <div className="addon-shop buy-socks" data-testid="buy-socks-quantity">
      <section className="addon-shop-row" data-selected={sellable && quantity > 0}
        aria-labelledby={titleId} aria-describedby={noteId}>
        {/* The title ("JumpSocks") has its own line above the price and the stepper. */}
        <div className="buy-socks-main">
          <span className="addon-shop-icon-wrap buy-socks-icon">
            <JumpyardIcon name="grip-socks" className="addon-shop-icon" />
            {included > 0 && <JumpyardIcon name="success-check" className="addon-shop-badge" />}
          </span>
          <h3 id={titleId} className="buy-socks-title">{copy.socksTitle}</h3>
          <p className="addon-shop-meta buy-socks-meta">
            {included > 0 && <span className="buy-socks-included">{copy.included.replace('{count}', String(included))}</span>}
            {included > 0 && perPair ? copy.extraPrice.replace('{price}', perPair) : perPair}
          </p>
          <div className="addon-shop-stepper buy-socks-stepper" role="group" aria-label={`${copy.quantity}: ${copy.socksTitle}`}>
            <button type="button" aria-label={`${copy.remove}: ${copy.socksTitle}`}
              data-testid="buy-socks-decrement" disabled={quantity <= included}
              onClick={() => onQuantity(Math.max(included, quantity - 1))}>
              <Minus aria-hidden="true" />
            </button>
            <output aria-label={`${copy.quantity}: ${copy.socksTitle}`} data-active={added > 0}
              data-testid="buy-socks-count">
              {added}
            </output>
            <button type="button" aria-label={`${copy.add}: ${copy.socksTitle}`}
              data-testid="buy-socks-increment" disabled={!sellable || quantity >= max}
              onClick={() => onQuantity(Math.min(max, quantity + 1))}>
              <Plus aria-hidden="true" />
            </button>
          </div>
        </div>
        <p id={noteId} className="addon-shop-row-note">
          {sellable ? <SocksRule text={copy.socksBenefit} parents={copy.socksParents} /> : copy.unavailableRequired}
        </p>
      </section>
    </div>
  );
}

/** #515: the rule with its parents in red, so a glance shows that adults in the trampoline area wear socks too. */
function SocksRule({ text, parents }: { text: string; parents: string }) {
  const at = text.indexOf(parents);
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<strong className="socks-rule-parents">{parents}</strong>{text.slice(at + parents.length)}</>;
}
