import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The emulator tests share one Firestore and one bucket, and each file
    // clears them between tests.
    fileParallelism: false,
    env: { STORAGE_BUCKET: 'demo-safely-ink.appspot.com' },
  },
});
