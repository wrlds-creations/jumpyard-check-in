'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Zap } from 'lucide-react';
import type { ConnectedProfile } from '@/flow/types';
import { useTranslation } from '@/context/LanguageContext';

interface ConnectedProfilesProps {
    count: number;
    onContinue: (profiles: ConnectedProfile[]) => void;
    onBack: () => void;
}

const ICONS = ['🦊', '🐯', '🐼', '🐸', '🐙', '🦖', '🦁', '🐵'];

export const ConnectedProfiles = ({ count, onContinue, onBack }: ConnectedProfilesProps) => {
    const { t } = useTranslation();
    const slots = Math.max(1, count);
    const [profiles, setProfiles] = useState<ConnectedProfile[]>(
        Array.from({ length: slots }, (_, i) => ({ id: i + 1, name: '', icon: ICONS[i % ICONS.length] }))
    );

    const update = (idx: number, patch: Partial<ConnectedProfile>) => {
        setProfiles(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    };

    const filledCount = profiles.filter(p => p.name.trim().length > 0).length;
    const canContinue = filledCount === slots;

    return (
        <motion.div
            className="w-full max-w-md mx-auto flex flex-col items-center px-4 py-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <button onClick={onBack} className="self-start flex items-center gap-1 text-muted hover:text-foreground text-xs font-bold italic uppercase tracking-wider mb-3">
                <ArrowLeft size={14} /> {t.common.back}
            </button>

            <div className="flex items-center gap-2 mb-0.5">
                <Zap className="text-primary" size={22} />
                <h1 className="text-xl font-black italic uppercase text-foreground">{t.connected.title}</h1>
            </div>
            <p className="text-muted text-xs mb-3 text-center">{t.connected.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 w-full mb-4">
                {profiles.map((p, idx) => (
                    <div key={p.id} className="bg-surface border border-border rounded-xl p-3 shadow-sm">
                        <p className="text-muted uppercase text-[11px] font-bold italic mb-2">{t.connected.profile} {idx + 1}</p>

                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-10 h-10 rounded-full bg-white border border-border flex items-center justify-center text-lg shadow-sm">
                                {p.icon}
                            </div>
                            <div className="flex-1 flex flex-wrap gap-1">
                                {ICONS.map(ic => (
                                    <button
                                        key={ic}
                                        onClick={() => update(idx, { icon: ic })}
                                        className={`w-7 h-7 rounded-full text-sm flex items-center justify-center transition-all ${
                                            p.icon === ic ? 'bg-primary text-white scale-110 shadow-sm' : 'bg-surface-strong hover:bg-border text-foreground opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        {ic}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <input
                            type="text"
                            value={p.name}
                            onChange={e => update(idx, { name: e.target.value })}
                            placeholder={t.connected.namePlaceholder}
                            className="w-full bg-white border border-border text-foreground text-sm py-2.5 px-3 rounded-lg outline-none focus:border-primary transition-colors"
                        />
                    </div>
                ))}
            </div>

            <button
                onClick={() => onContinue(profiles)}
                disabled={!canContinue}
                className="w-full bg-primary hover:bg-white hover:text-primary hover:border-primary border border-transparent text-white font-black italic uppercase text-lg py-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {t.connected.confirm} ({filledCount})
            </button>
        </motion.div>
    );
};
