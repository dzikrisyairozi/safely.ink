import type { NextConfig } from 'next';
import createMDX from '@next/mdx';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

// Both are inlined at build time and fall back to localhost in development.
// A production build without them would ship localhost links.
const requiredInProduction = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL'];

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/ui', '@repo/tailwind-config', '@repo/i18n'],
};

// Articles are MDX files imported by the blog pages, never routes themselves.
// Turbopack takes remark plugins by name.
const withMDX = createMDX({ options: { remarkPlugins: ['remark-gfm'] } });

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const missing = requiredInProduction.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
  }
  return withMDX(nextConfig);
}
