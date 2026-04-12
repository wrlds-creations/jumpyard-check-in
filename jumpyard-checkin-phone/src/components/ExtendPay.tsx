'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Smartphone } from 'lucide-react';
import { submitExtensionPayment } from '@/flow/mockClient';
import { useTranslation } from '@/context/LanguageContext';

interface ExtendPayProps {
    bookingId: string;
    amount: number;
    onPaid: (qrToken: string) => void;
    onBack: () => void;
}

type Method = 'swish' | 'card';

export const ExtendPay = ({ bookingId, amount, onPaid, onBack }: ExtendPayProps) => {
    const { t } = useTranslation();
    const [method, setMethod] = useState<Method>('swish');
    const [processing, setProcessing] = useState(false);

    const handlePay = async () => {
        setProcessing(true);
        try {
            const { qrToken } = await submitExtensionPayment(bookingId, amount);
            onPaid(qrToken);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <h1 className="text-3xl font-black italic uppercase text-white mb-2">{t.extend.pay.title}</h1>
            <p className="text-zinc-400 mb-6 text-center">{t.extend.pay.subtitle} {amount} {t.common.currency}.</p>

            <div className="w-full grid grid-cols-2 gap-3 mb-6">
                <button
                    onClick={() => setMethod('swish')}
                    className={`p-5 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                        method === 'swish' ? 'bg-primary/20 border-primary' : 'bg-zinc-900 border-zinc-700'
                    }`}
                >
                    <Smartphone size={28} className={method === 'swish' ? 'text-primary' : 'text-zinc-500'} />
                    <span className="text-white font-bold uppercase text-sm">{t.extend.pay.swish}</span>
                </button>
                <button
                    onClick={() => setMethod('card')}
                    className={`p-5 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                        method === 'card' ? 'bg-primary/20 border-primary' : 'bg-zinc-900 border-zinc-700'
                    }`}
                >
                    <CreditCard size={28} className={method === 'card' ? 'text-primary' : 'text-zinc-500'} />
                    <span className="text-white font-bold uppercase text-sm">{t.extend.pay.card}</span>
                </button>
            </div>

            <div className="flex w-full gap-3">
                <button
                    onClick={onBack}
                    disabled={processing}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase py-4 rounded-2xl transition-all disabled:opacity-40"
                >
                    {t.common.back}
                </button>
                <button
                    onClick={handlePay}
                    disabled={processing}
                    className="flex-[2] bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-60 flex items-center justify-center gap-3"
                >
                    {processing ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {t.common.processing}
                        </>
                    ) : (
                        `${t.extend.view.cta} ${amount} ${t.common.currency}`
                    )}
                </button>
            </div>
        </motion.div>
    );
};
