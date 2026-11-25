import { describe, expect, it } from 'vitest';
import { validateMonVfxCard, type MonVfxCard } from './vfxcard';

const card = (zone: MonVfxCard['zone'], move = 'sweep'): MonVfxCard => ({
  monId: 'boss_x',
  move,
  idea: 'ý tưởng đủ dài để qua kiểm tra',
  element: 'thuy',
  palette: { core: '000000', body: '3f86b8', rim: 'ffffff', accent: 'ff1f3d' },
  shapeLang: ['arc'],
  zone,
  timing: { anticipationMs: 1500, impactMs: 140, lingerMs: 800 },
  readability: 'đọc rõ ở camera chéo 52 độ',
  budget: { drawCalls: 8, particles: 200, screenCover: 0.3, overdraw: 4 },
});
const mon = (w?: number) => ({ exists: () => true, move: () => ({ r: 18, delay: 1.5, shape: 'cone' as const, w }) });

describe('validateMonVfxCard: nửa góc / bề rộng', () => {
  it('khớp server thì qua', () => {
    expect(validateMonVfxCard(card({ shape: 'cone', r: 18, w: 40, at: 'forward' }), mon(40))).toEqual([]);
  });
  it('thiếu zone.w khi server có thì báo lỗi', () => {
    expect(validateMonVfxCard(card({ shape: 'cone', r: 18, at: 'forward' }), mon(40)).join()).toMatch(/zone\.w thiếu/);
  });
  it('lệch server thì báo lỗi', () => {
    expect(validateMonVfxCard(card({ shape: 'cone', r: 18, w: 30, at: 'forward' }), mon(40)).join()).toMatch(/zone\.w 30 ≠ server 40/);
  });
});
