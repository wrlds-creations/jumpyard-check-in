'use client';
import { motion } from 'framer-motion';

export const IdleScreen = ({ onStart }: { onStart: () => void }) => {
    return (
        <motion.div
            className="flex flex-col items-center justify-center text-center cursor-pointer w-full h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            onClick={onStart}
        >
            <motion.div
                animate={{
                    scale: [1, 1.05, 1],
                    filter: [
                        "drop-shadow(0 0 50px rgba(255, 0, 0, 0.6))",
                        "drop-shadow(0 0 100px rgba(255, 0, 0, 0.9))",
                        "drop-shadow(0 0 50px rgba(255, 0, 0, 0.6))"
                    ]
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mb-8 relative p-10 bg-white/5 rounded-full border border-white/10 backdrop-blur-sm"
            >        {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/jumpyard_logo.png"
                    alt="JumpYard Logo"
                    className="w-72 h-auto drop-shadow-2xl"
                />
            </motion.div>

            <motion.div
                animate={{ opacity: [0.5, 1, 0.5], y: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
            >
                <p className="text-3xl font-black italic tracking-wider text-white uppercase mb-1">
                    Start Adventure
                </p>
                <p className="text-sm text-zinc-400 tracking-[0.5em] font-bold">TOUCH SCREEN TO BEGIN</p>
            </motion.div>
        </motion.div >
    );
};
