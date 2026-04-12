'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Search, X } from 'lucide-react';

export const BookingCheck = ({ onSuccess, onBack }: { onSuccess: (data: any) => void, onBack: () => void }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState('');

    // Fake Scan Logic (Demo)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 's') {
                e.preventDefault();
                setScanning(true); // Start scanner UI

                // Sequence: Scanning -> Locked -> Success -> Callback
                setTimeout(() => {
                    setCode('QR_FAMILY_123'); // "Read" code

                    setTimeout(() => {
                        onSuccess({
                            id: 'DEMO_FAM_123',
                            jumpers: 4,
                            product: 'Family Package',
                            startTime: '14:00',
                            guestName: 'Demo Family'
                        });
                        setScanning(false);
                    }, 500);
                }, 1500);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSuccess]);

    const handleSearch = async () => {
        if (!code) return;
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`http://localhost:8080/api/roller/booking/${code}`);
            const data = await res.json();

            if (data.success) {
                onSuccess(data.booking);
            } else {
                setError(data.message || 'Booking not found');
            }
        } catch (err) {
            setError('Connection Error. Ensure Backend is running. Try "QR_123_FAMILY".');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            className="w-full max-w-lg mx-auto bg-slate-900/80 p-10 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-xl relative overflow-hidden"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
        >
            {/* SCANNER OVERLAY */}
            {scanning && (
                <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
                    <div className="relative w-full h-1 bg-red-600/50 shadow-[0_0_20px_rgba(255,0,0,0.8)]">
                        <motion.div
                            className="w-full h-full bg-red-500"
                            animate={{ y: [-150, 150, -150] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        />
                    </div>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, repeat: Infinity, repeatType: "reverse" }}
                        className="mt-8 text-red-500 font-mono text-xl font-bold tracking-widest uppercase"
                    >
                        Acquiring Target...
                    </motion.div>
                </div>
            )}

            <div className="flex justify-between items-center mb-10">
                <h2 className="text-4xl font-bold text-white tracking-tight">Check-In</h2>
                <button onClick={onBack} className="p-3 hover:bg-white/10 rounded-full transition-colors group">
                    <X className="text-slate-400 group-hover:text-white w-8 h-8" />
                </button>
            </div>

            <p className="text-slate-400 mb-8 text-lg font-light">Scan your QR code or manually enter your Booking ID to locate your session.</p>

            <div className="relative mb-8 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <QrCode className="text-primary w-8 h-8 opacity-70 group-focus-within:opacity-100 transition-opacity" />
                </div>
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="SCAN QR CODE..."
                    className="w-full bg-slate-950 text-white text-3xl py-6 pl-16 pr-4 rounded-2xl border-2 border-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all placeholder:text-slate-700 font-mono tracking-widest uppercase"
                />
            </div>

            {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-red-200">
                    {error}
                </motion.div>
            )}

            <button
                onClick={handleSearch}
                disabled={loading || !code}
                className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-6 rounded-2xl transition-all flex items-center justify-center gap-3 text-2xl shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_40px_rgba(37,99,235,0.6)] disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
            >
                {loading ? (
                    <span className="flex items-center gap-2"><div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Searching...</span>
                ) : (
                    <><Search className="w-6 h-6" /> Find Booking</>
                )}
            </button>

            <div className="mt-6 text-center">
                <span className="text-sm text-slate-600 font-mono">DEBUG: Try "QR_123_FAMILY"</span>
            </div>
        </motion.div>
    );
};
