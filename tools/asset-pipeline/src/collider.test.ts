import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './config.js';
import { buildLib, inferShapes, type Probe } from './collider.js';

const probe = (w: number, d: number, h: number, base = w): Probe => ({
  all: { lo: [-w / 2, 0, -d / 2], hi: [w / 2, h, d / 2] },
  base: { lo: [-base / 2, 0, -base / 2], hi: [base / 2, 0.5, base / 2] },
});

describe('collider.ts: luật suy hình từ hộp bao', () => {
  it('cây: chỉ thân (trụ ở đáy, cao 60%), tán xuyên được', () => {
    const [s] = inferShapes('prop_co_thu', probe(27, 22, 18, 3));
    expect(s).toMatchObject({ k: 'cyl', r: 0.9, y0: 0, y1: 10.8 });
  });
  it('đồ thấp < 0,6 m, quá nhỏ và cỏ cây thấp: bỏ qua', () => {
    expect(inferShapes('prop_x', probe(2, 2, 0.5))).toEqual([]);
    expect(inferShapes('prop_x', probe(0.3, 0.3, 1.8))).toEqual([]);
    expect(inferShapes('prop_duong_xi', probe(1.1, 0.5, 0.8))).toEqual([]);
  });
  it('cột/bia gần vuông và cao: trụ; khối đặc dẹt: hộp, đỉnh đứng được nếu ≤ 1,2 m', () => {
    expect(inferShapes('prop_bia', probe(1.2, 1.1, 2.4))[0]).toMatchObject({ k: 'cyl' });
    expect(inferShapes('prop_phien', probe(2.9, 3, 0.83))[0]).toMatchObject({ k: 'box', walk: true });
    expect(inferShapes('prop_ranh', probe(3.2, 0.2, 1.6))[0]).toMatchObject({ k: 'box', walk: false });
  });
});

describe('lib.json khớp GLB đã build', () => {
  it('chạy `pnpm colliders:lib` nếu asset hoặc overrides đổi', async () => {
    const cur = fs.readFileSync(path.join(ROOT, 'packages/content/data/colliders/lib.json'), 'utf8').replace(/\r/g, '');
    const next = JSON.stringify(await buildLib(), null, 1) + '\n';
    expect(cur).toBe(next);
  }, 60_000);
});
