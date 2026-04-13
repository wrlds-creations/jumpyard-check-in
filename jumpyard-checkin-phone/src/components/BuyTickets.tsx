'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Mail, Phone, Ticket } from 'lucide-react';
import { buyWalkIn } from '@/flow/mockClient';
import type { Booking } from '@/flow/types';
import { useTranslation } from '@/context/LanguageContext';

interface BuyTicketsProps {
    onComplete: (booking: Booking, contact: { email: string | null; phone: string | null }) => void;
    onBack: () => void;
}

interface Product {
    id: string;
    name: string;
    price: number;
    jumpersPerUnit: number;
    note?: string;
}

type Step = 'PRODUCT' | 'QUANTITY' | 'CONTACT';

export const BuyTickets = ({ onComplete, onBack }: BuyTicketsProps) => {
    const { t } = useTranslation();
    const PRODUCTS: Product[] = [
        { id: '1H', name: t.buy.product1h, price: 179, jumpersPerUnit: 1 },
        { id: '2H', name: t.buy.product2h, price: 249, jumpersPerUnit: 1 },
        { id: 'FAM', name: t.buy.productFamily, price: 599, jumpersPerUnit: 4, note: t.buy.productFamilyNote },
    ];
    const [step, setStep] = useState<Step>('PRODUCT');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product);
        setQuantity(1);
        setStep('QUANTITY');
    };

    const goToContact = () => setStep('CONTACT');

    const contactValid = email.includes('@') || phone.replace(/\D/g, '').length >= 6;

    const handleConfirm = async () => {
        if (!selectedProduct || !contactValid) return;
        setSubmitting(true);
        try {
            const jumpers = selectedProduct.jumpersPerUnit * quantity;
            const booking = await buyWalkIn(jumpers, email || null, phone || null);
            onComplete(booking, { email: email || null, phone: phone || null });
        } finally {
            setSubmitting(false);
        }
    };

    const backFromStep = () => {
        if (step === 'CONTACT') setStep('QUANTITY');
        else if (step === 'QUANTITY') setStep('PRODUCT');
        else onBack();
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

            {step === 'PRODUCT' && (
                <>
                    <h2 className="text-xl font-black italic text-foreground uppercase mb-4 text-center">
                        {t.buy.selectTicket}
                    </h2>
                    <div className="flex flex-col gap-3">
                        {PRODUCTS.map(product => (
                            <button
                                key={product.id}
                                onClick={() => handleProductSelect(product)}
                                className="bg-surface border border-border p-4 rounded-2xl text-left flex items-center gap-4 transition-all active:scale-[0.98]"
                            >
                                <div className="w-10 h-10 rounded-xl bg-surface-strong flex items-center justify-center flex-shrink-0">
                                    <Ticket size={20} className="text-muted" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-base font-black italic text-foreground uppercase">{product.name}</h3>
                                    {product.note && <p className="text-muted text-xs">{product.note}</p>}
                                </div>
                                <div className="text-lg font-black italic text-primary">
                                    {product.price} <span className="text-xs font-normal text-muted">{t.common.currency}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {step === 'QUANTITY' && selectedProduct && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-surface border border-border p-5 rounded-2xl text-center"
                >
                    <h2 className="text-xl font-black italic text-foreground uppercase mb-1">{t.buy.howMany}</h2>
                    <p className="text-muted text-xs mb-5">
                        {selectedProduct.id === 'FAM' ? t.buy.howManyFamilies : t.buy.howManyJumpers}
                    </p>

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
                            {selectedProduct.price * quantity} {t.common.currency}
                        </span>
                    </div>

                    <button
                        onClick={goToContact}
                        className="w-full bg-primary hover:bg-primary/90 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {t.common.continue} <Check size={18} />
                    </button>
                </motion.div>
            )}

            {step === 'CONTACT' && selectedProduct && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-surface border border-border p-5 rounded-2xl"
                >
                    <h2 className="text-xl font-black italic text-foreground uppercase mb-1 text-center">{t.buy.contactTitle}</h2>
                    <p className="text-muted text-xs mb-4 text-center">{t.buy.contactDesc}</p>

                    <label className="block mb-3">
                        <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                            <Mail size={11} /> {t.buy.emailLabel}
                        </span>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder={t.buy.emailPlaceholder}
                            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                        />
                    </label>

                    <label className="block mb-5">
                        <span className="text-[10px] text-muted uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                            <Phone size={11} /> {t.buy.phoneLabel}
                        </span>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder={t.buy.phonePlaceholder}
                            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all"
                        />
                    </label>

                    <button
                        onClick={handleConfirm}
                        disabled={!contactValid || submitting}
                        className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {submitting ? t.buy.creating : t.buy.confirmCreate} {!submitting && <Check size={18} />}
                    </button>
                </motion.div>
            )}
        </motion.div>
    );
};
