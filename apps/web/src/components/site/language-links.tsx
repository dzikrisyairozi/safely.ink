'use client';

import { usePathname } from 'next/navigation';
import { LANGUAGE_LABELS } from '@repo/i18n/core';
import { cn } from '@repo/ui/lib/utils';
import { LOCALES, localePath, type Locale } from '@/lib/site';

const LOCALE_PREFIX = new RegExp(`^/(${LOCALES.join('|')})(?=/|$)`);

// Plain links rather than a dropdown, so crawlers find every language version.
export function LanguageLinks({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const rest = usePathname().replace(LOCALE_PREFIX, '') || '/';

  return (
    <nav aria-label={label} className="flex items-center font-mono text-xs">
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && (
            <span aria-hidden className="px-1 text-muted-foreground/50">
              /
            </span>
          )}
          <a
            href={localePath(l, rest)}
            hrefLang={l}
            lang={l}
            title={LANGUAGE_LABELS[l].label}
            aria-current={l === locale ? 'true' : undefined}
            onClick={() => {
              // Remembered so that `/` opens in this language next time.
              document.cookie = `NEXT_LOCALE=${l};path=/;max-age=31536000;samesite=lax`;
            }}
            className={cn(
              'rounded px-1 py-1 uppercase tracking-wider transition-colors',
              l === locale
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LANGUAGE_LABELS[l].flag}
          </a>
        </span>
      ))}
    </nav>
  );
}
