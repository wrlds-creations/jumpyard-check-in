'use client';

import { Fragment } from 'react';
import { useTranslation, type Language } from '@/context/LanguageContext';

// #350: tiny guest language control in the bold italic heading style, meant for
// the top-right corner beside the progress bar. The start screen shows both
// languages with the active one marked; inside the flow only the language the
// guest can switch to is shown. Every option carries an understandable name.
const OPTIONS: { code: Language; short: string; name: string }[] = [
  { code: 'sv', short: 'SV', name: 'Svenska' },
  { code: 'en', short: 'EN', name: 'English' },
];

const TEXT_STYLE = 'text-[9px] font-bold italic uppercase leading-none tracking-wide';
const BUTTON_STYLE =
  'flex h-6 items-center rounded-sm px-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function LanguageToggle({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { lang, setLang, t } = useTranslation();

  if (compact) {
    const target = OPTIONS.find(option => option.code !== lang) ?? OPTIONS[0];
    return (
      <div data-testid="language-toggle" className={`flex items-center ${TEXT_STYLE} ${className}`}>
        <button
          type="button"
          aria-label={`${t.common.switchLanguage} ${target.name}`}
          data-testid={`language-option-${target.code}`}
          onClick={() => setLang(target.code)}
          className={`${BUTTON_STYLE} text-muted hover:text-foreground`}
        >
          {target.short}
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t.common.language}
      data-testid="language-toggle"
      className={`flex items-center ${TEXT_STYLE} ${className}`}
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
              className={`${BUTTON_STYLE} ${active ? 'text-foreground' : 'text-muted hover:text-foreground'}`}
            >
              {option.short}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
