'use client';

import { useState, useSyncExternalStore } from 'react';
import { SafetyVideo } from '@/components/SafetyVideo';
import { LanguageProvider, useTranslation } from '@/context/LanguageContext';

function Preview() {
  const { lang, toggleLang } = useTranslation();
  const [completed, setCompleted] = useState(false);
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="flex justify-between p-3 text-sm">
        <span>Lokal förhandsvisning</span>
        <button type="button" onClick={toggleLang}>{lang === 'sv' ? 'EN' : 'SV'}</button>
      </div>
      {completed
        ? <p role="status" className="p-6">{lang === 'sv' ? 'Videon är sedd. Nästa steg: säkerhetsregler.' : 'Video watched. Next step: safety rules.'}</p>
        : <SafetyVideo onComplete={() => setCompleted(true)} />}
    </main>
  );
}

const subscribe = () => () => {};

export default function SafetyVideoPreview() {
  // The stored language is browser-local, so mount the fixture provider on the client.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;
  return <LanguageProvider><Preview /></LanguageProvider>;
}
