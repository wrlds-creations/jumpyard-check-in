import type { Language } from '@/context/LanguageContext';
import { bandSwatchBackground } from '@/flow/bandColours';
import type { BandColourCount } from '@/flow/types';
import styles from './BandColours.module.css';

const COPY = { sv: 'Bandfärg', en: 'Band colour' };

/** GH-459: the band colour(s) for one admission row. Renders nothing without a colour. */
export function BandColours({ colours, lang, total }: { colours?: BandColourCount[]; lang: Language; total?: number }) {
    if (!colours?.length) return null;
    // A count is shown when the row's bands are not all this one colour.
    const counted = colours.length > 1 || (total !== undefined && colours[0].quantity !== total);
    return <span className={styles.bands} data-testid="band-colours">
        <span className={styles.hidden}>{COPY[lang]}: </span>
        {colours.map((colour) => <span key={colour.id} className={styles.band} data-band-colour={colour.id}>
            <span className={styles.swatch} style={{ background: bandSwatchBackground(colour.swatch) }} aria-hidden="true" />
            <span>{counted ? `${colour.quantity} × ` : ''}{colour.name[lang]}</span>
        </span>)}
    </span>;
}
