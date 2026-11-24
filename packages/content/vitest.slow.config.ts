import { defineConfig } from 'vitest/config';

// Chỉ các test chậm (`*.slow.test.ts`, vd. pace chạy sim.ts); hạn rộng vì máy bận có thể mất vài phút.
export default defineConfig({
  test: {
    include: ['src/**/*.slow.test.ts'],
    testTimeout: 660_000,
    hookTimeout: 660_000,
    teardownTimeout: 30_000,
  },
});
