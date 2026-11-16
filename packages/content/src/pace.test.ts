// E2-J: giữ nhịp chương 2 trong CI. Chạy thật `sim.ts` (pnpm sim:progress) và kiểm:
//  - sim không báo LỖI nào (mọi ngưỡng cân bằng của sim đạt, kể cả Đan Hỏa Kiếp, kinh tế, TTK);
//  - dòng `[pace2]`: Trúc Cơ (cấp 16) → độ kiếp Kết Đan cho cả ba công pháp nằm trong 4 giờ ±12%;
//  - nhịp Ngưng Khí 1 → 15 vẫn 3–4 giờ (không bị chương 2 làm lệch).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('nhịp chương 2 (sim:progress)', () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'src/sim.ts'], { cwd: root, encoding: 'utf8', timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
  const out = run.stdout ?? '';

  it('sim chạy hết, không có dòng LỖI', () => {
    expect(run.error).toBeUndefined();
    expect(run.stderr ?? '').not.toMatch(/LỖI/);
    expect(run.status).toBe(0);
  });

  it('chương 2 ≈ 4 giờ ±12% cho cả ba công pháp', () => {
    const m = /\[pace2\]([^\n]*)/.exec(out);
    expect(m).not.toBeNull();
    const hours = [...m![1].matchAll(/(\w+)=([\d.]+)/g)].filter(([, k]) => k !== 'target' && k !== 'tol').map(([, k, v]) => [k, Number(v)] as const);
    expect(hours.map(([k]) => k).sort()).toEqual(['bat_dong_kim_than', 'lac_kiem_quyet', 'thanh_moc_dan_kinh']);
    for (const [k, h] of hours) {
      expect(h, k).toBeGreaterThanOrEqual(4 * 0.88);
      expect(h, k).toBeLessThanOrEqual(4 * 1.12);
    }
  });

  it('Ngưng Khí 1 → 15 vẫn 3–4 giờ cho cả ba công pháp', () => {
    const m = /Kiếm tu ([\d.]+) giờ, Hộ pháp ([\d.]+) giờ, Đan sư ([\d.]+) giờ/.exec(out);
    expect(m).not.toBeNull();
    for (const v of m!.slice(1, 4).map(Number)) {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(4);
    }
  });
}, 300_000);
