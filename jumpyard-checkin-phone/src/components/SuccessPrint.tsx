'use client';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Printer } from 'lucide-react';
import { JumpyardIcon } from '@/components/JumpyardIcon';

export const SuccessPrint = ({ onReset }: { onReset: () => void }) => {

    useEffect(() => {
        // Auto reset after 8 seconds
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
                className="text-success mb-8 relative"
            >
                <div className="absolute inset-0 bg-success/30 blur-3xl rounded-full" />
                <JumpyardIcon name="success-check" className="relative z-10 w-36 h-36" />
            </motion.div>

            <h2 className="text-6xl font-bold text-white mb-4">You&apos;re In!</h2>
            <p className="text-2xl text-slate-300 mb-12">
                Go beat Mount Everest! Tracking is enabled.
            </p>

            <div className="flex items-center gap-4 text-slate-500 animate-pulse bg-slate-900/50 px-6 py-4 rounded-xl border border-slate-800">
                <Printer size={32} />
                <span className="text-xl font-mono uppercase tracking-widest">Printing Bracelet...</span>
            </div>
        </motion.div>
    );
};
