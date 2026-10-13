import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // Placeholders so the Firebase SDK initialises; tests never reach the network.
    env: {
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-policy-police.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-policy-police',
      VITE_FIREBASE_APP_ID: 'test-app-id',
      VITE_API_URL: 'http://api.test',
    },
    setupFiles: ['./src/test-setup.ts'],
  },
});
