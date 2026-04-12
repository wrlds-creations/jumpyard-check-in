'use client';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Printer } from 'lucide-react';

export const SuccessPrint = ({ onReset }: { onReset: () => void }) => {

    useEffect(() => {
        const timer = setTimeout(onReset, 8000);
        return () => clearTimeout(timer);
    }, [onReset]);

    return (
        <motion.div
            className="flex flex-col items-center justify-center text-center w-full"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
        >
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="text-success mb-6 relative"
            >
                <div className="absolute inset-0 bg-success/30 blur-3xl rounded-full" />
                <CheckCircle size={100} className="relative z-10" />
            </motion.div>

            <h2 className="text-4xl font-black italic text-white mb-2 uppercase">You're In!</h2>
            <p className="text-xl text-slate-300 mb-8 italic">
                Go beat Mount Everest! Tracking is enabled.
            </p>

            <div className="flex items-center gap-3 text-slate-500 animate-pulse bg-slate-900/50 px-5 py-3 rounded-xl border border-slate-800">
                <Printer size={24} />
                <span className="text-base font-mono uppercase tracking-widest">Printing Bracelet...</span>
            </div>
        </motion.div>
    );
};
