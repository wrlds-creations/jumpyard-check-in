'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard } from 'lucide-react';
import { submitPayment } from '@/flow/mockClient';
import { useTranslation } from '@/context/LanguageContext';
import type { Addon } from '@/flow/types';

interface PaymentViewProps {
    bookingId: string;
    total: number;
    items: Addon[];
    onPaid: () => void;
}

export const PaymentView = ({ bookingId, total, items, onPaid }: PaymentViewProps) => {
    const { t } = useTranslation();
    const [processing, setProcessing] = useState(false);

    const handlePay = async () => {
        setProcessing(true);
        try {
            await submitPayment(bookingId, total);
            onPaid();
        } finally {
            setProcessing(false);
        }
    };

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <CreditCard className="text-primary mb-1" size={32} />
            <h1 className="text-xl font-black italic uppercase text-foreground mb-0.5">{t.payment.title}</h1>
            <p className="text-muted text-xs mb-4 text-center">{t.payment.description}</p>

            <div className="w-full bg-surface border border-border shadow-sm text-foreground rounded-xl p-4 mb-4">
                <div className="flex justify-between items-center border-b border-border pb-3 mb-3">
                    <p className="text-muted uppercase text-xs font-bold italic">{t.payment.booking}</p>
                    <p className="text-foreground font-mono tracking-wider">{bookingId}</p>
                </div>

                {items.length > 0 && (
                    <div className="border-b border-border pb-3 mb-3">
                        <p className="text-muted uppercase text-xs font-bold italic mb-2">{t.payment.items}</p>
                        {items.map(item => (
                            <div key={item.id} className="flex justify-between items-center py-1">
                                <span className="text-foreground text-sm">{item.label} x{item.qty}</span>
                                <span className="text-foreground text-sm font-bold">{item.price * item.qty} {t.common.currency}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-between items-center">
                    <p className="text-muted uppercase text-xs font-bold italic">{t.payment.total}</p>
                    <p className="text-4xl font-black italic text-primary">{total} {t.common.currency}</p>
                </div>
            </div>

            <button
                onClick={handlePay}
                disabled={processing}
                className="w-full bg-primary hover:bg-surface hover:text-primary text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all border border-transparent hover:border-primary disabled:opacity-60 flex items-center justify-center gap-3 shadow-sm"
            >
                {processing ? (
                    <>
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.common.processing}
                    </>
                ) : (
                    `${t.payment.pay} ${total} ${t.common.currency}`
                )}
            </button>

            <p className="text-muted text-[11px] text-center mt-2">{t.payment.afterPaymentHint}</p>
        </motion.div>
    );
};
