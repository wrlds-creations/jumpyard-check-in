'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Coffee, Footprints, Lock, Minus, Plus, UserPlus, Wind, Zap } from 'lucide-react';
import type { Addon, AddonId } from '@/flow/types';
import { useTranslation } from '@/context/LanguageContext';

interface AddonsOfferProps {
    guestCount: number;
    existingAddons: Addon[];
    onContinue: (result: {
        selectedAddons: Addon[];
        addonsTotal: number;
        skyriderSelected: boolean;
        connectedSelected: boolean;
    }) => void;
}

interface CatalogEntry {
    id: AddonId;
    label: string;
    price: number;
    unit: string;
    description: string;
    mode: 'counter';
    maxPerGuest: number;
    Icon: typeof Zap;
}

function Counter({ value, onChange, max, min = 0 }: { value: number; onChange: (n: number) => void; max: number; min?: number }) {
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => onChange(Math.max(min, value - 1))}
                className="w-9 h-9 rounded-full bg-surface hover:bg-border border border-border text-foreground flex items-center justify-center disabled:opacity-30 disabled:bg-surface-strong"
                disabled={value <= min}
            >
                <Minus size={16} />
            </button>
            <span className="text-xl font-black italic text-foreground w-7 text-center">{value}</span>
            <button
                onClick={() => onChange(Math.min(max, value + 1))}
                className="w-9 h-9 rounded-full bg-primary hover:bg-surface border border-transparent hover:border-primary hover:text-primary text-white flex items-center justify-center disabled:opacity-30 disabled:hover:bg-primary disabled:hover:text-white"
                disabled={value >= max}
            >
                <Plus size={16} />
            </button>
        </div>
    );
}

export const AddonsOffer = ({ guestCount, existingAddons, onContinue }: AddonsOfferProps) => {
    const { t } = useTranslation();
    const CATALOG: CatalogEntry[] = [
        { id: 'skyrider', label: t.addons.products.skyriderLabel, price: 45, unit: t.addons.perJumper, description: t.addons.products.skyriderDesc, mode: 'counter', maxPerGuest: 1, Icon: Wind },
        { id: 'connected', label: t.addons.products.connectedLabel, price: 40, unit: t.addons.perJumper, description: t.addons.products.connectedDesc, mode: 'counter', maxPerGuest: 1, Icon: Zap },
        { id: 'socks', label: t.addons.products.socksLabel, price: 40, unit: t.addons.each, description: t.addons.products.socksDesc, mode: 'counter', maxPerGuest: 4, Icon: Footprints },
        { id: 'coffee', label: t.addons.products.coffeeLabel, price: 35, unit: t.addons.each, description: t.addons.products.coffeeDesc, mode: 'counter', maxPerGuest: 4, Icon: Coffee },
        { id: 'extra_person', label: t.addons.products.extraPersonLabel, price: 179, unit: t.addons.perPerson, description: t.addons.products.extraPersonDesc, mode: 'counter', maxPerGuest: 4, Icon: UserPlus },
        { id: 'lock', label: t.addons.products.lockLabel, price: 40, unit: t.addons.each, description: t.addons.products.lockDesc, mode: 'counter', maxPerGuest: 1, Icon: Lock },
    ];

    const minQty = useMemo(() => {
        const base: Record<AddonId, number> = { skyrider: 0, connected: 0, coffee: 0, extra_person: 0, lock: 0, socks: 0 };
        for (const a of existingAddons) {
            if (a.id in base) base[a.id] = a.qty;
        }
        return base;
    }, [existingAddons]);

    const [qty, setQty] = useState<Record<AddonId, number>>(() => ({ ...minQty }));

    const setOne = (id: AddonId, n: number) => setQty(q => ({ ...q, [id]: Math.max(minQty[id], n) }));

    const selectedAddons: Addon[] = useMemo(
        () =>
            CATALOG.filter(e => qty[e.id] > 0).map(e => ({
                id: e.id,
                label: e.label,
                price: e.price,
                qty: qty[e.id],
            })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [qty, t]
    );

    const addonsTotal = useMemo(
        () => CATALOG.reduce((sum, e) => {
            const newQty = Math.max(0, qty[e.id] - minQty[e.id]);
            return sum + e.price * newQty;
        }, 0),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [qty, minQty]
    );

    const handleContinue = () => {
        onContinue({
            selectedAddons,
            addonsTotal,
            skyriderSelected: qty.skyrider > 0,
            connectedSelected: qty.connected > 0,
        });
    };

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col px-4 py-3"
            style={{ maxHeight: 'calc(100dvh - 120px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <div className="text-center">
                <h1 className="text-xl font-black italic uppercase text-foreground">{t.addons.title}</h1>
                <p className="text-muted text-xs mt-0.5">{t.addons.description}</p>
                <p className="text-muted text-[10px] mb-3">{CATALOG.length} {t.addons.scrollHint}</p>
            </div>

            {existingAddons.length > 0 && (
                <div className="w-full mb-2">
                    <p className="text-[11px] text-muted uppercase font-bold italic tracking-widest mb-1">{t.addons.alreadyInBooking}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {existingAddons.map((a, i) => (
                            <span
                                key={i}
                                className="px-2.5 py-0.5 rounded-full bg-surface-strong border border-border text-foreground text-xs italic"
                            >
                                {a.label} x {a.qty}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
                <div className="w-full flex flex-col gap-1.5">
                    {CATALOG.map(entry => {
                        const Icon = entry.Icon;
                        const value = qty[entry.id];
                        const max = Math.max(1, guestCount * entry.maxPerGuest);
                        const locked = minQty[entry.id];
                        const isHighlighted = entry.id === 'connected' || entry.id === 'skyrider';

                        return (
                            <div
                                key={entry.id}
                                className={`w-full border rounded-xl p-2.5 shadow-sm ${
                                    isHighlighted
                                        ? 'bg-primary/5 border-primary/30'
                                        : 'bg-surface border-border'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                        <Icon className={`flex-shrink-0 ${isHighlighted ? 'text-primary' : 'text-muted'}`} size={18} />
                                        <div className="min-w-0">
                                            <p className="text-foreground font-bold italic text-sm">{entry.label}</p>
                                            <p className="text-muted text-[11px]">
                                                {entry.price} {t.common.currency} · {entry.unit}
                                            </p>
                                            {entry.id === 'connected' && (
                                                <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold italic uppercase tracking-wide">{t.addons.connectedValueProp}</span>
                                            )}
                                            {locked > 0 && (
                                                <span className="text-[10px] text-success font-bold italic">{t.addons.alreadyInBooking} ({locked})</span>
                                            )}
                                        </div>
                                    </div>
                                    <Counter value={value} onChange={n => setOne(entry.id, n)} max={max} min={locked} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="pt-3 border-t border-border mt-3">
                <div className="w-full flex items-center justify-between bg-surface-strong border border-border rounded-xl px-4 py-2.5 mb-3">
                    <p className="text-muted uppercase text-xs font-bold italic tracking-wider">{t.addons.total}</p>
                    <p className="text-2xl font-black italic text-primary">{addonsTotal} {t.common.currency}</p>
                </div>

                <button
                    onClick={handleContinue}
                    className="w-full bg-primary hover:bg-surface hover:text-primary border border-transparent hover:border-primary text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-sm"
                >
                    {t.common.continue}
                </button>
            </div>
        </motion.div>
    );
};
