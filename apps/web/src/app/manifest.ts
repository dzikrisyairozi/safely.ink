import type { MetadataRoute } from 'next';
import { SITE_NAME } from '@/lib/site';
import en from '@/i18n/locales/en.json';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: en.meta.description,
    start_url: '/',
    display: 'standalone',
    // Paper and ink from @repo/tailwind-config.
    background_color: '#faf7f0',
    theme_color: '#14182b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
