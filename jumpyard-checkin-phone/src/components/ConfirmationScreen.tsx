'use client';
import { motion } from 'framer-motion';
import { CheckCircle, QrCode, Package, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/context/LanguageContext';

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
    const { t } = useTranslation();
    const pickupCode = booking?.id ? booking.id.toString().substring(0, 4).toUpperCase() : 'A1B2';

    return (
        <motion.div
            className="w-full max-w-lg mx-auto flex flex-col items-center justify-center px-4 py-3 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <div className="bg-surface p-5 rounded-2xl border border-border w-full shadow-sm text-foreground">

                <div className="flex flex-col items-center mb-4 border-b border-border pb-4">
                    <CheckCircle className="text-success mb-2" size={56} />
                    <h1 className="text-2xl font-black italic uppercase text-foreground mb-0.5">{t.confirm.title}</h1>
                    <p className="text-muted text-sm">{t.confirm.subtitle}</p>

                    <div className="mt-4 bg-white p-4 rounded-xl border border-border shadow-sm flex flex-col items-center">
                        <QrCode className="text-foreground mb-2" size={100} />
                        <p className="text-[11px] text-muted uppercase tracking-widest mb-0.5">{t.confirm.pickupCode}</p>
                        <p className="text-2xl font-black tracking-widest text-primary">{pickupCode}</p>
                    </div>
                </div>

                <div className="bg-surface-strong rounded-xl p-3 text-left border border-border mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="text-primary" size={18} />
                        <h2 className="text-sm font-bold italic uppercase text-foreground">{t.confirm.staffHandout}</h2>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white p-2.5 rounded-lg border border-border shadow-sm text-center">
                            <p className="text-muted uppercase text-[10px] font-bold mb-0.5">{t.confirm.wristbands}</p>
                            <p className="text-2xl font-black text-foreground">{booking?.jumpers || 1}</p>
                        </div>

                        <div className={`p-2.5 rounded-lg border shadow-sm text-center ${socksCount > 0 ? 'bg-primary/5 border-primary/30' : 'bg-white border-border'}`}>
                            <p className="text-muted uppercase text-[10px] font-bold mb-0.5">{t.addons.products.socksLabel}</p>
                            <p className={`text-2xl font-black ${socksCount > 0 ? 'text-primary' : 'text-muted'}`}>
                                {socksCount}
                            </p>
                        </div>

                        <div className={`p-2.5 rounded-lg border shadow-sm text-center ${upsellCount > 0 ? 'bg-primary/5 border-primary/30' : 'bg-white border-border'}`}>
                            <p className="text-muted uppercase text-[10px] font-bold mb-0.5">{t.confirm.connectedBands}</p>
                            <p className={`text-2xl font-black ${upsellCount > 0 ? 'text-primary' : 'text-muted'}`}>
                                {upsellCount}
                            </p>
                        </div>
                    </div>
                </div>

                <p className="text-muted text-xs text-center mb-3">{t.confirm.nextStepHint}</p>

                <button
                    onClick={onReset}
                    className="w-full bg-primary hover:bg-white hover:text-primary hover:border-primary border border-transparent text-white font-black italic uppercase text-lg py-4 rounded-xl transition-all"
                >
                    {isMobile ? t.confirm.showEntryCode : t.confirm.complete}
                </button>
            </div>
        </motion.div>
    );
};
