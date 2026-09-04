'use client';
import { useTranslation } from '@/context/LanguageContext';
import { JumpyardIcon } from './JumpyardIcon';
import type { PackageContent } from '@/flow/types';
import { getPackageContentLabel, packageContentCopy } from '@/flow/packageContents';

export function PackageContentRows({ contents }: { contents: PackageContent[] }) {
  const { lang } = useTranslation();
  if (!contents.length) return null;
  const copy = packageContentCopy[lang];
  return (
    <div className="border-t border-border px-3 py-2 text-left" data-testid="package-contents">
      <p className="mb-1 text-[11px] font-bold uppercase text-foreground">{copy.included}</p>
      {contents.map((item) => (
        <div key={item.kind} className="flex min-w-0 items-center gap-2 py-1.5" data-package-content={item.kind}>
          <JumpyardIcon name={item.kind === 'pizza' ? 'combo-pizza' : 'visitor-wristband'} className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words font-bold italic">{getPackageContentLabel(item, lang)}</p>
            {item.collection === 'later' && <p className="text-xs">{copy.later}</p>}
          </div>
          <span className="shrink-0 font-black text-primary">x{item.quantity}</span>
        </div>
      ))}
    </div>
  );
}
