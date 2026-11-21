// E2-J: giữ nhịp chương 2 trong CI. Chạy thật `sim.ts` (pnpm sim:progress) và kiểm:
//  - sim không báo LỖI nào (mọi ngưỡng cân bằng của sim đạt, kể cả Đan Hỏa Kiếp, kinh tế, TTK);
//  - dòng `[pace2]`: Trúc Cơ (cấp 16) → độ kiếp Kết Đan cho cả ba công pháp nằm trong 4 giờ ±12%;
//  - nhịp Ngưng Khí 1 → 15 vẫn 3–4 giờ (không bị chương 2 làm lệch).
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { at } from '@dtl/shared';
import { METHODS } from './index';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Hạn cho một lần chạy sim: ~1 phút lúc máy rảnh, hơn 4 phút khi nhiều worker khác đang chiếm CPU. */
const SIM_TIMEOUT = 600_000;

// Mọi công pháp trong dữ liệu (TN-2 thêm Dẫn Hồn Kinh): nhịp phải giữ cho từng cái, không viết cứng danh sách.
const METHOD_IDS = METHODS.map((m) => m.id).sort();

describe('nhịp chương 2 + 3 (sim:progress)', () => {
  const run: { error?: Error; status: number | null; stderr: string } = { status: null, stderr: '' };
  let out = '';

  // Chạy không chặn vòng lặp sự kiện (không dùng spawnSync) để tiến trình test vẫn trả lời vitest trong lúc chờ.
  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const child = execFile(
          process.execPath,
          ['--import', 'tsx', 'src/sim.ts'],
          { cwd: root, encoding: 'utf8', timeout: SIM_TIMEOUT, maxBuffer: 64 * 1024 * 1024 },
          (error, stdout, stderr) => {
            // Mã thoát khác 0 để phép thử `status` báo; chỉ coi là lỗi chạy khi không khởi động được hoặc hết hạn.
            if (error && (child.exitCode === null || error.killed)) run.error = error;
            run.status = child.exitCode;
            run.stderr = stderr ?? '';
            out = stdout ?? '';
            resolve();
          },
        );
      }),
    SIM_TIMEOUT + 30_000,
  );

  it('sim chạy hết, không có dòng LỖI', () => {
    expect(run.error).toBeUndefined();
    expect(run.stderr).not.toMatch(/LỖI/);
    expect(run.status).toBe(0);
  });

  it('chương 2 ≈ 4 giờ ±12% cho cả ba công pháp', () => {
    const m = /\[pace2\]([^\n]*)/.exec(out);
    expect(m).not.toBeNull();
    const hours = [...at(m!, 1).matchAll(/(\w+)=([\d.]+)/g)]
      .filter(([, k]) => k !== 'target' && k !== 'tol')
      .map(([, k, v]) => [k, Number(v)] as const);
    expect(hours.map(([k]) => k).sort()).toEqual(METHOD_IDS);
    for (const [k, h] of hours) {
      expect(h, k).toBeGreaterThanOrEqual(4 * 0.88);
      expect(h, k).toBeLessThanOrEqual(4 * 1.12);
    }
  });

  it('chương 3 (Kết Đan → độ kiếp Nguyên Anh) ≈ 6 giờ ±12% cho cả ba công pháp (E3-J)', () => {
    const m = /\[pace3\]([^\n]*)/.exec(out);
    expect(m).not.toBeNull();
    const hours = [...at(m!, 1).matchAll(/(\w+)=([\d.]+)/g)]
      .filter(([, k]) => k !== 'target' && k !== 'tol')
      .map(([, k, v]) => [k, Number(v)] as const);
    expect(hours.map(([k]) => k).sort()).toEqual(METHOD_IDS);
    for (const [k, h] of hours) {
      expect(h, k).toBeGreaterThanOrEqual(6 * 0.88);
      expect(h, k).toBeLessThanOrEqual(6 * 1.12);
    }
  });

  it('chương 4 (Nguyên Anh → độ kiếp Hóa Thần) ≈ 8 giờ ±12% cho cả ba công pháp (E4-J)', () => {
    const m = /\[pace4\]([^\n]*)/.exec(out);
    expect(m).not.toBeNull();
    const hours = [...at(m!, 1).matchAll(/(\w+)=([\d.]+)/g)]
      .filter(([, k]) => k !== 'target' && k !== 'tol')
      .map(([, k, v]) => [k, Number(v)] as const);
    expect(hours.map(([k]) => k).sort()).toEqual(METHOD_IDS);
    for (const [k, h] of hours) {
      expect(h, k).toBeGreaterThanOrEqual(8 * 0.88);
      expect(h, k).toBeLessThanOrEqual(8 * 1.12);
    }
  });

  it('Ngưng Khí 1 → 15 vẫn 3–4 giờ cho cả ba công pháp', () => {
    const m =
      /Kiếm tu ([\d.]+) giờ, Thể tu ([\d.]+) giờ, Đan sư ([\d.]+) giờ, Hồn tu ([\d.]+) giờ, Đao tu ([\d.]+) giờ, Cổ Thần ([\d.]+) giờ, Cổ tu ([\d.]+) giờ/.exec(
        out,
      );
    expect(m).not.toBeNull();
    for (const v of m!.slice(1, 8).map(Number)) {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(4);
    }
  });
});
