'use client';
import { motion } from 'framer-motion';
import { Ticket, CalendarCheck } from 'lucide-react';

export const StepSelection = ({ onSelect }: { onSelect: (choice: 'BOOKING' | 'BUY') => void }) => {
    return (
        <motion.div
            className="w-full max-w-4xl mx-auto flex flex-col items-center"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
        >
            <h1 className="text-6xl font-black italic tracking-tighter text-white mb-16 uppercase">
                Choose <span className="text-primary">Action</span>
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                <button
                    onClick={() => onSelect('BOOKING')}
                    className="group relative bg-secondary hover:bg-zinc-800 p-12 rounded-3xl border-2 border-zinc-700 hover:border-primary transition-all text-left flex flex-col justify-between h-80 overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500">
                        <CalendarCheck size={120} className="text-white group-hover:text-primary" />
                    </div>

                    <div className="relative z-10">
                        <CalendarCheck size={48} className="text-primary mb-6" />
                        <h2 className="text-4xl font-black italic text-white mb-2 uppercase">I Have A<br />Booking</h2>
                        <p className="text-zinc-400 font-medium">Scan QR or enter code</p>
                    </div>
                </button>

                <button
                    onClick={() => onSelect('BUY')}
                    className="group relative bg-white hover:bg-zinc-200 p-12 rounded-3xl border-2 border-white hover:border-primary transition-all text-left flex flex-col justify-between h-80 overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
                        <Ticket size={120} className="text-black" />
                    </div>

                    <div className="relative z-10">
                        <Ticket size={48} className="text-black mb-6" />
                        <h2 className="text-4xl font-black italic text-black mb-2 uppercase">Buy<br />Tickets</h2>
                        <p className="text-zinc-600 font-medium">Drop-in entry pass</p>
                    </div>
                </button>
            </div>
        </motion.div>
    );
};
