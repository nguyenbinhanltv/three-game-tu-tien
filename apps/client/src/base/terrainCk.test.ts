import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVEL_ASSETS } from '@dtl/content';

// TN-7 mỹ thuật vòng 3: bộ texture Codex `terrain-ck` đủ tám lớp theo đúng thứ tự `GROUND_LAYER`, ba texture riêng cho kiến trúc/cảnh, file tồn tại,
// nằm trong ngân sách tải (nạp lười theo level, không vào tải đầu) và level `cuu_kieu` trỏ đúng bộ này.
const DIR = path.resolve(__dirname, '../../public/terrain-ck');
const LAYERS = ['grass', 'dirt', 'forest', 'rock', 'cliff', 'sand', 'paving', 'gravel'];

describe('bộ texture terrain-ck (Thiên Lộ Giới)', () => {
  const man = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')) as {
    size: number;
    layers: { layer: string; a: string; n: string }[];
    extras: Record<string, string>;
  };

  it('tám lớp đúng thứ tự, mọi file tồn tại', () => {
    expect(man.layers.map((l) => l.layer)).toEqual(LAYERS);
    for (const l of man.layers) for (const f of [l.a, l.n]) expect(existsSync(path.join(DIR, f)), f).toBe(true);
  });

  it('có đá xây, thẻ lá và nước chảy; tổng dung lượng dưới 4 MB', () => {
    for (const k of ['masonry', 'leaf', 'water']) expect(existsSync(path.join(DIR, man.extras[k] ?? '__thiếu__')), k).toBe(true);
    const files = [...man.layers.flatMap((l) => [l.a, l.n]), ...Object.values(man.extras), 'manifest.json'];
    const total = files.reduce((n, f) => n + statSync(path.join(DIR, f)).size, 0);
    expect(total).toBeLessThan(4 * 1024 * 1024);
  });

  it('level cuu_kieu dùng bộ terrain-ck', () => {
    const g = LEVEL_ASSETS.cuu_kieu?.ground;
    expect(g && g.set).toBe('terrain-ck');
  });
});
