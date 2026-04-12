'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { submitPayment } from '@/flow/mockClient';
import { useTranslation } from '@/context/LanguageContext';

interface PaymentViewProps {
    bookingId: string;
    total: number;
    onPaid: () => void;
    onBack: () => void;
}

export const PaymentView = ({ bookingId, total, onPaid, onBack }: PaymentViewProps) => {
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
            <button onClick={onBack} disabled={processing} className="self-start flex items-center gap-1 text-zinc-500 hover:text-white text-xs font-bold italic uppercase tracking-wider mb-3 disabled:opacity-40">
                <ArrowLeft size={14} /> {t.common.back}
            </button>

            <CreditCard className="text-primary mb-1" size={32} />
            <h1 className="text-xl font-black italic uppercase text-white mb-0.5">{t.payment.title}</h1>
            <p className="text-zinc-500 text-xs mb-4 text-center">{t.payment.description}</p>

            <div className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 mb-4">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-3 mb-3">
                    <p className="text-zinc-500 uppercase text-xs font-bold italic">{t.payment.booking}</p>
                    <p className="text-white font-mono tracking-wider">{bookingId}</p>
                </div>
                <div className="flex justify-between items-center">
                    <p className="text-zinc-500 uppercase text-xs font-bold italic">{t.payment.total}</p>
                    <p className="text-4xl font-black italic text-primary">{total} {t.common.currency}</p>
                </div>
            </div>

            <button
                onClick={handlePay}
                disabled={processing}
                className="w-full bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-60 flex items-center justify-center gap-3"
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
        </motion.div>
    );
};
