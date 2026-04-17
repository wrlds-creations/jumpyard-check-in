'use client';
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Clock, Mail, Ticket, Users } from 'lucide-react';
import { buyWalkIn, getCapacityForSlots, type ProductId, type SlotCapacity } from '@/flow/mockClient';
import type { Booking } from '@/flow/types';
import { useTranslation } from '@/context/LanguageContext';

interface ProductInfo {
    id: ProductId;
    label: string;
    type: 'entry' | 'family';
    durationMinutes: number;
    unitPrice: number;
    jumpersPerUnit: number;
}

interface BuyTicketsProps {
    onComplete: (
        booking: Booking,
        contact: { email: string | null; phone: string | null },
        product: { id: string; label: string; type: 'entry' | 'family'; durationMinutes: number; unitPrice: number; quantity: number; total: number }
    ) => void;
    onBack: () => void;
}

type Step = 'TIMESLOT' | 'PRODUCT' | 'QUANTITY' | 'CONTACT';

function generateSlots(): string[] {
    const now = new Date();
    const startMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
    const slots: string[] = [];
    for (let m = startMin; m <= startMin + 120 && slots.length < 5; m += 30) {
        const h = Math.floor(m / 60);
        if (h >= 22) break;
        slots.push(`${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    return slots;
}

export const BuyTickets = ({ onComplete, onBack }: BuyTicketsProps) => {
    const { t } = useTranslation();

    const PRODUCTS: ProductInfo[] = [
        { id: 'E60',  label: t.buy.entry60,  type: 'entry',  durationMinutes: 60,  unitPrice: 200, jumpersPerUnit: 1 },
        { id: 'E90',  label: t.buy.entry90,  type: 'entry',  durationMinutes: 90,  unitPrice: 230, jumpersPerUnit: 1 },
        { id: 'E120', label: t.buy.entry120, type: 'entry',  durationMinutes: 120, unitPrice: 280, jumpersPerUnit: 1 },
        { id: 'F60',  label: t.buy.family60,  type: 'family', durationMinutes: 60,  unitPrice: 540, jumpersPerUnit: 4 },
        { id: 'F90',  label: t.buy.family90,  type: 'family', durationMinutes: 90,  unitPrice: 690, jumpersPerUnit: 4 },
        { id: 'F120', label: t.buy.family120, type: 'family', durationMinutes: 120, unitPrice: 840, jumpersPerUnit: 4 },
    ];

    const entryProducts = PRODUCTS.filter(p => p.type === 'entry');
    const familyProducts = PRODUCTS.filter(p => p.type === 'family');

    const [step, setStep] = useState<Step>('TIMESLOT');
    const [selectedProduct, setSelectedProduct] = useState<ProductInfo | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [capacities, setCapacities] = useState<Record<string, SlotCapacity>>({});

    const slots = useMemo(() => generateSlots(), []);

    // Fetch capacity for ALL slots on mount — per-product capacity needs to
    // render inline on the TIMESLOT step so guests can compare durations
    // across times before they commit.
    useEffect(() => {
        let active = true;
        getCapacityForSlots(slots).then(results => {
            if (!active) return;
            const map: Record<string, SlotCapacity> = {};
            for (const r of results) map[r.time] = r;
            setCapacities(map);
        });
        return () => { active = false; };
    }, [slots]);

    const slotCapacity = selectedTime ? capacities[selectedTime] ?? null : null;

    const handleTimeSelect = (time: string) => {
        // Changing time resets downstream picks so product capacity reflects the new slot.
        setSelectedTime(time);
        setSelectedProduct(null);
        setQuantity(1);
    };

    const handleProductSelect = (product: ProductInfo) => {
        setSelectedProduct(product);
        setQuantity(1);
        setStep('QUANTITY');
    };

    const goToProduct = () => setStep('PRODUCT');
    const goToContact = () => setStep('CONTACT');

    const contactValid = email.includes('@');

    const doConfirm = async (skipContact: boolean) => {
        if (!selectedProduct || !selectedTime) return;
        if (!skipContact && !contactValid) return;
        setSubmitting(true);
        try {
            const jumpers = selectedProduct.jumpersPerUnit * quantity;
            const total = selectedProduct.unitPrice * quantity;
            const contactEmail = skipContact ? null : (email || null);
            const booking = await buyWalkIn(
                jumpers,
                contactEmail,
                null,
                { id: selectedProduct.id, label: selectedProduct.label, type: selectedProduct.type, durationMinutes: selectedProduct.durationMinutes },
                selectedTime
            );
            onComplete(
                booking,
                { email: contactEmail, phone: null },
                { id: selectedProduct.id, label: selectedProduct.label, type: selectedProduct.type, durationMinutes: selectedProduct.durationMinutes, unitPrice: selectedProduct.unitPrice, quantity, total }
            );
        } finally {
            setSubmitting(false);
        }
    };

    const backFromStep = () => {
        if (step === 'CONTACT') setStep('QUANTITY');
        else if (step === 'QUANTITY') setStep('PRODUCT');
        else if (step === 'PRODUCT') setStep('TIMESLOT');
        else onBack();
    };

    const renderProductCard = (product: ProductInfo) => {
        const seats = slotCapacity ? slotCapacity.remainingSeats[product.id] : undefined;
        const available = seats === undefined ? true : seats > 0;
        return (
            <button
                key={product.id}
                onClick={() => available && handleProductSelect(product)}
                disabled={!available}
                className={`p-3.5 rounded-xl text-left flex items-center gap-3 transition-all border ${
                    available
                        ? 'bg-white border-border active:scale-[0.98]'
                        : 'bg-surface-strong border-border opacity-50 cursor-not-allowed'
                }`}
            >
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-black italic uppercase ${available ? 'text-foreground' : 'text-muted'}`}>
                        {product.label}
                    </p>
                    {seats !== undefined && (
                        <p className={`text-[10px] font-bold italic uppercase tracking-wider mt-0.5 ${
                            available ? 'text-muted' : 'text-muted/70'
                        }`}>
                            {available ? `${seats} ${t.buy.spotsLeft}` : t.buy.spotsFull}
                        </p>
                    )}
                </div>
                <p className={`text-base font-black italic ${available ? 'text-primary' : 'text-muted/60'}`}>
                    {product.unitPrice} <span className="text-[10px] font-normal text-muted">{t.common.currency}</span>
                </p>
            </button>
        );
    };

    return (
        <motion.div
            className="w-full max-w-md mx-auto px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <button
                onClick={backFromStep}
                className="mb-4 flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider"
            >
                <ArrowLeft size={14} /> {t.common.back}
            </button>

            {step === 'TIMESLOT' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">
                        {t.buy.selectTime}
                    </h2>
                    <p className="text-muted text-xs mb-4 text-center">{t.buy.selectTimeDesc}</p>

                    <div className="flex flex-col gap-2 mb-5">
                        {slots.map(time => {
                            const cap = capacities[time];
                            const loaded = !!cap;
                            const anyAvailable = !loaded || cap.availableProducts.length > 0;
                            const isSelected = selectedTime === time;
                            return (
                                <button
                                    key={time}
                                    onClick={() => anyAvailable && handleTimeSelect(time)}
                                    disabled={!anyAvailable}
                                    className={`w-full p-3.5 rounded-xl text-left flex items-center justify-between transition-all ${
                                        isSelected
                                            ? 'bg-primary text-white border-2 border-primary'
                                            : anyAvailable
                                            ? 'bg-white border border-border active:scale-[0.98]'
                                            : 'bg-surface-strong border border-border opacity-50 cursor-not-allowed'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Clock size={16} className={isSelected ? 'text-white' : 'text-muted'} />
                                        <span className={`text-lg font-black italic ${isSelected ? 'text-white' : 'text-foreground'}`}>
                                            {time}
                                        </span>
                                    </div>
                                    {loaded && !anyAvailable ? (
                                        <span className={`text-[10px] font-bold italic uppercase tracking-wider ${isSelected ? 'text-white/70' : 'text-muted'}`}>
                                            {t.buy.spotsFull}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={goToProduct}
                        disabled={!selectedTime}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                    >
                        {t.common.continue} <Check size={18} />
                    </button>
                </motion.div>
            )}

            {step === 'PRODUCT' && (
                <>
                    <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">
                        {t.buy.selectTicket}
                    </h2>
                    {selectedTime && (
                        <p className="text-muted text-xs mb-4 text-center flex items-center justify-center gap-1.5">
                            <Clock size={12} /> {selectedTime}
                        </p>
                    )}
                    {!selectedTime && <div className="mb-4" />}

                    <div className="mb-3">
                        <p className="text-[10px] text-muted uppercase font-bold italic tracking-widest mb-2 px-1">{t.buy.sectionEntry}</p>
                        <div className="flex flex-col gap-2">
                            {entryProducts.map(renderProductCard)}
                        </div>
                    </div>

                    <div>
                        <p className="text-[10px] text-muted uppercase font-bold italic tracking-widest mb-2 px-1">{t.buy.sectionFamily}</p>
                        <div className="flex flex-col gap-2">
                            {familyProducts.map(renderProductCard)}
                        </div>
                    </div>
                </>
            )}

            {step === 'QUANTITY' && selectedProduct && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full flex items-center justify-center"
                    style={{ minHeight: 'calc(100dvh - 160px)' }}
                >
                <div className="w-full bg-surface border border-border p-5 rounded-2xl text-center">
                    <div className="bg-white border border-border rounded-xl px-3 py-2 mb-4 inline-flex items-center gap-2">
                        <Ticket size={14} className="text-primary" />
                        <span className="text-sm font-bold italic text-foreground">{selectedProduct.label}</span>
                        {selectedProduct.type === 'family' && (
                            <span className="text-[10px] text-muted">· {t.buy.familyNote}</span>
                        )}
                    </div>

                    <h2 className="text-xl font-black italic text-foreground uppercase mb-1">
                        {selectedProduct.type === 'family' ? t.buy.quantityPackages : t.buy.quantityJumpers}
                    </h2>
                    {selectedProduct.type === 'family' && (
                        <p className="text-muted text-xs mb-4 flex items-center justify-center gap-1">
                            <Users size={12} /> {t.buy.familyNote}
                        </p>
                    )}
                    {selectedProduct.type === 'entry' && <div className="mb-4" />}

                    <div className="flex items-center justify-center gap-6 mb-5">
                        <button
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="w-12 h-12 rounded-full bg-surface-strong border border-border flex items-center justify-center text-foreground text-xl font-bold transition-colors"
                        >
                            -
                        </button>
                        <span className="text-4xl font-black italic text-foreground w-16 text-center">{quantity}</span>
                        <button
                            onClick={() => setQuantity(quantity + 1)}
                            className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold transition-colors"
                        >
                            +
                        </button>
                    </div>

                    <div className="bg-white border border-border p-3 rounded-xl mb-5 flex justify-between items-center px-4">
                        <span className="text-muted text-sm font-bold italic uppercase">{t.buy.total}</span>
                        <span className="text-xl font-black italic text-primary">
                            {selectedProduct.unitPrice * quantity} {t.common.currency}
                        </span>
                    </div>

                    <button
                        onClick={goToContact}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {t.common.continue} <Check size={18} />
                    </button>
                </div>
                </motion.div>
            )}

            {step === 'CONTACT' && selectedProduct && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full flex flex-col items-center justify-center"
                    style={{ minHeight: 'calc(100dvh - 160px)' }}
                >
                    <div className="w-full bg-surface border border-border p-5 rounded-2xl">
                        <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">{t.buy.contactTitle}</h2>
                        <p className="text-muted text-xs mb-5 text-center">{t.buy.contactDesc}</p>

                        <label className="block mb-5">
                            <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                                <Mail size={11} /> {t.buy.emailLabel}
                            </span>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder={t.buy.emailPlaceholder}
                                autoComplete="email"
                                className="w-full bg-white border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/40 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                            />
                        </label>

                        <button
                            onClick={() => doConfirm(false)}
                            disabled={!contactValid || submitting}
                            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                            {submitting ? t.buy.creating : t.buy.confirmCreate} {!submitting && <Check size={18} />}
                        </button>
                    </div>

                    <button
                        onClick={() => doConfirm(true)}
                        disabled={submitting}
                        className="mt-4 text-muted/50 hover:text-muted text-xs font-medium transition-colors"
                    >
                        {t.buy.skipContact}
                    </button>
                </motion.div>
            )}
        </motion.div>
    );
};
