import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    env: {
      NEXT_PUBLIC_SITE_URL: 'https://safely.test',
      NEXT_PUBLIC_APP_URL: 'https://app.safely.test',
    },
  },
});
