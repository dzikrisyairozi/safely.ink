'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Script from 'next/script';
import { useTranslation } from '@repo/i18n';

const KEY = 'analytics-consent';
// Sent by the footer's "Analytics settings" link to show the banner again.
const REOPEN = 'analytics-settings';
type Choice = 'granted' | 'denied';

/** Cookie strings that delete every _ga cookie, wherever GA may have set it. */
export function expiredGaCookies(cookie: string, host: string) {
  const names = cookie
    .split(';')
    .map((pair) => pair.split('=')[0]!.trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'));
  const labels = host.split('.');
  const domains = labels
    .slice(0, -1)
    .map((_, i) => `.${labels.slice(i).join('.')}`);
  return names.flatMap((name) => [
    `${name}=; max-age=0; path=/`,
    ...domains.map((domain) => `${name}=; max-age=0; path=/; domain=${domain}`),
  ]);
}

function withdraw() {
  const { gtag } = window as { gtag?: (...args: unknown[]) => void };
  gtag?.('consent', 'update', { analytics_storage: 'denied' });
  for (const cookie of expiredGaCookies(document.cookie, location.hostname)) {
    document.cookie = cookie;
  }
}

function stored(): Choice | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Google Analytics 4, loaded only after the visitor accepts: before that no
 * Google script runs and nothing is sent. Consent Mode v2 keeps every ads
 * signal denied either way.
 */
export function Analytics({ gaId }: { gaId: string }) {
  const { t } = useTranslation('web');
  // undefined on the server and during hydration, so the banner never flashes.
  const saved = useSyncExternalStore(
    () => () => {},
    stored,
    () => undefined,
  );
  // null once the visitor reopens the banner from the footer.
  const [decided, setDecided] = useState<Choice | null>();
  const choice = decided === undefined ? saved : decided;

  useEffect(() => {
    const reopen = () => setDecided(null);
    window.addEventListener(REOPEN, reopen);
    return () => window.removeEventListener(REOPEN, reopen);
  }, []);

  const decide = (value: Choice) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {}
    if (value === 'denied') withdraw();
    setDecided(value);
  };

  return (
    <>
      {choice === 'granted' && (
        <>
          <Script id="ga-consent" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});gtag('js',new Date());gtag('config','${gaId}');`}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
        </>
      )}
      {choice === null && (
        <div
          role="region"
          aria-label={t('consent.label')}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-lg border border-border bg-background p-4 text-sm shadow-lg sm:flex-row sm:items-center"
        >
          <p className="flex-1 text-muted-foreground">{t('consent.text')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide('denied')}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
            >
              {t('consent.decline')}
            </button>
            <button
              type="button"
              onClick={() => decide('granted')}
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/85"
            >
              {t('consent.accept')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Footer link that lets a visitor change their analytics choice. */
export function AnalyticsSettings({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(REOPEN))}
      className="text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
    </button>
  );
}
