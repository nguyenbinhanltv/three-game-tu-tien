// pnpm colliders:bake — ghi packages/content/data/colliders/<level>.inst.json từ hàm rải prop của client (xem apps/client/src/game/world/colliderBake.ts).
import { spawnSync } from 'node:child_process';
const r = spawnSync('pnpm', ['--filter', '@dtl/client', 'exec', 'vitest', 'run', 'src/game/world/colliderBake.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DTL_BAKE_COLLIDERS: '1' },
});
process.exit(r.status ?? 1);
