'use client';

import { Fragment } from 'react';
import { useTranslation, type Language } from '@/context/LanguageContext';

// #350: tiny guest language control in the bold italic heading style, meant for
// the top-right corner beside the progress bar. Both choices stay visible, so a
// flag or code is never the only cue, and each option carries its own-language name.
const OPTIONS: { code: Language; short: string; name: string }[] = [
  { code: 'sv', short: 'SV', name: 'Svenska' },
  { code: 'en', short: 'EN', name: 'English' },
];

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t.common.language}
      data-testid="language-toggle"
      className={`flex items-center text-[9px] font-bold italic uppercase leading-none tracking-wide ${className}`}
    >
      {OPTIONS.map((option, index) => {
        const active = option.code === lang;
        return (
          <Fragment key={option.code}>
            {index > 0 && (
              <span aria-hidden="true" className="text-surface-strong">
                /
              </span>
            )}
            <button
              type="button"
              lang={option.code}
              aria-label={option.name}
              aria-pressed={active}
              data-testid={`language-option-${option.code}`}
              onClick={() => setLang(option.code)}
              className={`flex h-6 items-center rounded-sm px-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active ? 'text-foreground' : 'text-muted hover:text-foreground'
              }`}
            >
              {option.short}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
