import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

// Both are inlined at build time and fall back to localhost in development.
// A production build without them would ship localhost links.
const requiredInProduction = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL'];

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/ui', '@repo/tailwind-config', '@repo/i18n'],
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const missing = requiredInProduction.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
  }
  return nextConfig;
}
