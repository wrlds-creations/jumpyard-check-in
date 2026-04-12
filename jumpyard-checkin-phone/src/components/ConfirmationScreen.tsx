'use client';
import { motion } from 'framer-motion';
import { CheckCircle, QrCode, Package, AlertCircle } from 'lucide-react';

interface Player {
    id: number;
    name: string;
    photo: string | null;
}

interface ConfirmationScreenProps {
    booking: any;
    upsellCount: number;
    socksCount?: number;
    players: Player[];
    isMobile: boolean;
    onReset: () => void;
}

export const ConfirmationScreen = ({ booking, upsellCount, socksCount = 0, players, isMobile, onReset }: ConfirmationScreenProps) => {
    const pickupCode = booking?.id ? booking.id.toString().substring(0, 4).toUpperCase() : 'A1B2';

    return (
        <motion.div
            className="w-full max-w-lg mx-auto flex flex-col items-center justify-center px-4 py-3 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <div className="bg-white/5 p-5 rounded-2xl border border-zinc-800 w-full">

                <div className="flex flex-col items-center mb-4 border-b border-zinc-800 pb-4">
                    <CheckCircle className="text-success mb-2" size={56} />
                    <h1 className="text-2xl font-black italic uppercase text-white mb-0.5">You're Checked In!</h1>
                    <p className="text-zinc-500 text-sm">Your booking is ready. Head to the entrance.</p>

                    <div className="mt-4 bg-black/50 p-4 rounded-xl border border-primary/50 flex flex-col items-center">
                        <QrCode className="text-white mb-2" size={100} />
                        <p className="text-[11px] text-zinc-400 uppercase tracking-widest mb-0.5">Pickup Code</p>
                        <p className="text-2xl font-black tracking-widest text-primary">{pickupCode}</p>
                    </div>
                </div>

                <div className="bg-black/40 rounded-xl p-3 text-left border border-zinc-800 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="text-primary" size={18} />
                        <h2 className="text-sm font-bold italic uppercase text-white">Staff Handout Needed</h2>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 text-center">
                            <p className="text-zinc-500 uppercase text-[10px] font-bold mb-0.5">Wristbands</p>
                            <p className="text-2xl font-black text-white">{booking?.jumpers || 1}</p>
                        </div>

                        <div className={`p-2.5 rounded-lg border text-center ${socksCount > 0 ? 'bg-primary/20 border-primary/50' : 'bg-zinc-900/80 border-zinc-800'}`}>
                            <p className="text-zinc-500 uppercase text-[10px] font-bold mb-0.5">Socks</p>
                            <p className={`text-2xl font-black ${socksCount > 0 ? 'text-primary' : 'text-zinc-600'}`}>
                                {socksCount}
                            </p>
                        </div>

                        <div className={`p-2.5 rounded-lg border text-center ${upsellCount > 0 ? 'bg-purple-500/20 border-purple-500/50' : 'bg-zinc-900/80 border-zinc-800'}`}>
                            <p className="text-zinc-500 uppercase text-[10px] font-bold mb-0.5">CE-band</p>
                            <p className={`text-2xl font-black ${upsellCount > 0 ? 'text-purple-400' : 'text-zinc-600'}`}>
                                {upsellCount}
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={onReset}
                    className="w-full bg-primary hover:bg-white hover:text-black text-white font-black italic uppercase text-lg py-4 rounded-xl transition-all"
                >
                    {isMobile ? 'View Receipt' : 'Complete & Next Guest'}
                </button>
            </div>
        </motion.div>
    );
};
