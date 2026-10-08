'use client';

import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { JumpyardIcon } from '@/components/JumpyardIcon';
import { useTranslation } from '@/context/LanguageContext';

interface SocksQuantityProps {
  quantity: number;
  /** Price per pair from Cloud's availability; null when socks cannot be sold here. */
  price: number | null;
  available: boolean;
  max: number;
  onQuantity: (quantity: number) => void;
}

/**
 * #491 (workshop 2026-10-07): socks are chosen next to "Antal hoppare", in the approved Hylla row
 * style (#457). The count is the same JumpSocks purchase line the add-on step used, so the quote,
 * the draft and the price are unchanged. Nothing is preselected. Title and text are the add-on
 * step's own socks copy, so the two places always say the same.
 */
export function SocksQuantity({ quantity, price, available, max, onQuantity }: SocksQuantityProps) {
  const { t, lang } = useTranslation();
  const copy = t.addons.choices;
  const uid = useId();
  const sellable = available && price !== null;
  const money = (value: number) => `${new Intl.NumberFormat(lang === 'sv' ? 'sv-SE' : 'en-GB', { maximumFractionDigits: 2 }).format(value)} ${t.common.currency}`;
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
          </span>
          <h3 id={titleId} className="buy-socks-title">{copy.socksTitle}</h3>
          <p className="addon-shop-meta buy-socks-meta">{sellable ? copy.perPair.replace('{price}', money(price)) : ''}</p>
          <div className="addon-shop-stepper buy-socks-stepper" role="group" aria-label={`${copy.quantity}: ${copy.socksTitle}`}>
            <button type="button" aria-label={`${copy.remove}: ${copy.socksTitle}`}
              data-testid="buy-socks-decrement" disabled={quantity <= 0}
              onClick={() => onQuantity(Math.max(0, quantity - 1))}>
              <Minus aria-hidden="true" />
            </button>
            <output aria-label={`${copy.quantity}: ${copy.socksTitle}`} data-active={quantity > 0}
              data-testid="buy-socks-count">
              {quantity}
            </output>
            <button type="button" aria-label={`${copy.add}: ${copy.socksTitle}`}
              data-testid="buy-socks-increment" disabled={!sellable || quantity >= max}
              onClick={() => onQuantity(Math.min(max, quantity + 1))}>
              <Plus aria-hidden="true" />
            </button>
          </div>
        </div>
        <p id={noteId} className="addon-shop-row-note">
          {sellable ? copy.socksBenefit : copy.unavailableRequired}
        </p>
      </section>
    </div>
  );
}
