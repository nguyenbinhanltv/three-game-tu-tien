import os from 'node:os';
import { defineConfig } from 'vitest/config';

// Máy dev thường chạy nhiều worker song song (mỗi worktree một bộ test), nên:
//  - hạn test/hook rộng hơn mặc định 5 s/10 s: `await import('./sim')` trong beforeAll mất ~3 s lúc rảnh
//    nhưng vượt 10 s khi CPU bận;
//  - giới hạn số tiến trình test để không tự tranh CPU với chính mình.
export default defineConfig({
  test: {
    // `*.slow.test.ts` (chạy cả sim.ts, ~1–4 phút) chỉ chạy qua `pnpm test:slow` (vitest.slow.config.ts) và bước CI riêng.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.slow.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 30_000,
    minWorkers: 1,
    maxWorkers: Math.max(2, Math.min(4, Math.floor(os.availableParallelism() / 2))),
  },
});
