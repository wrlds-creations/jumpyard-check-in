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
            className="w-full max-w-3xl mx-auto px-4"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
        >
            <button
                onClick={backFromStep}
                className="mb-4 flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors uppercase text-xs font-bold italic tracking-wider"
            >
                <ArrowLeft size={14} /> {t.common.back}
            </button>

            {step === 'PRODUCT' && (
                <>
                    <h2 className="text-3xl font-black italic text-white uppercase mb-5 text-center">
                        {t.buy.selectTicket}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {PRODUCTS.map(product => (
                            <button
                                key={product.id}
                                onClick={() => handleProductSelect(product)}
                                className="bg-secondary p-5 rounded-2xl border-2 border-zinc-700 hover:border-primary transition-all text-center group hover:-translate-y-1"
                            >
                                <Ticket size={32} className="mx-auto mb-3 text-zinc-500 group-hover:text-primary transition-colors" />
                                <h3 className="text-xl font-black italic text-white uppercase mb-1">{product.name}</h3>
                                {product.note && <p className="text-zinc-400 text-xs mb-2">{product.note}</p>}
                                <div className="text-2xl font-bold italic text-white">
                                    {product.price} <span className="text-xs font-normal text-zinc-500">SEK</span>
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
                    className="max-w-md mx-auto bg-secondary p-6 rounded-2xl border border-zinc-700 text-center"
                >
                    <h2 className="text-2xl font-black italic text-white uppercase mb-1">{t.buy.howMany}</h2>
                    <p className="text-zinc-400 text-sm mb-5 max-w-xs mx-auto">
                        {selectedProduct.id === 'FAM' ? t.buy.howManyFamilies : t.buy.howManyJumpers}
                    </p>

                    <div className="flex items-center justify-center gap-6 mb-5">
                        <button
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="w-14 h-14 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white text-2xl font-bold transition-colors"
                        >
                            -
                        </button>
                        <span className="text-5xl font-black italic text-white w-20">{quantity}</span>
                        <button
                            onClick={() => setQuantity(quantity + 1)}
                            className="w-14 h-14 rounded-full bg-white text-black hover:bg-zinc-200 flex items-center justify-center text-2xl font-bold transition-colors"
                        >
                            +
                        </button>
                    </div>

                    <div className="bg-black/30 p-3 rounded-xl mb-5 flex justify-between items-center px-5 border border-zinc-800">
                        <span className="text-zinc-400 text-sm font-bold italic uppercase">{t.buy.total}</span>
                        <span className="text-2xl font-black italic text-primary">
                            {selectedProduct.price * quantity} {t.common.currency}
                        </span>
                    </div>

                    <button
                        onClick={goToContact}
                        className="w-full bg-primary hover:bg-red-600 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3"
                    >
                        {t.common.continue} <Check />
                    </button>
                </motion.div>
            )}

            {step === 'CONTACT' && selectedProduct && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="max-w-md mx-auto bg-secondary p-6 rounded-2xl border border-zinc-700"
                >
                    <h2 className="text-2xl font-black italic text-white uppercase mb-1 text-center">{t.buy.contactTitle}</h2>
                    <p className="text-zinc-400 mb-4 text-center text-xs">{t.buy.contactDesc}</p>

                    <label className="block mb-3">
                        <span className="text-[11px] text-zinc-500 uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                            <Mail size={12} /> {t.buy.emailLabel}
                        </span>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder={t.buy.emailPlaceholder}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:border-primary outline-none"
                        />
                    </label>

                    <label className="block mb-5">
                        <span className="text-[11px] text-zinc-500 uppercase font-bold italic tracking-widest flex items-center gap-1.5 mb-1">
                            <Phone size={12} /> {t.buy.phoneLabel}
                        </span>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder={t.buy.phonePlaceholder}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:border-primary outline-none"
                        />
                    </label>

                    <button
                        onClick={handleConfirm}
                        disabled={!contactValid || submitting}
                        className="w-full bg-primary hover:bg-red-600 disabled:opacity-40 text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3"
                    >
                        {submitting ? t.buy.creating : t.buy.confirmCreate} {!submitting && <Check />}
                    </button>
                </motion.div>
            )}
        </motion.div>
    );
};
