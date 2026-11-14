import { describe, expect, it } from 'vitest';
import { FxPool } from '../materials/vfx';
import { SIGIL_CIRCLE, SIGIL_CONE, SIGIL_GEO, SIGIL_PAD, SIGIL_RECT, sigilLayout } from './sigil';
import { SLASH_GEO, slashGeometry, slashPhase } from './slash';

describe('slashPhase', () => {
  it('quét hết cung trong phần đầu, chưa ăn mòn', () => {
    expect(slashPhase(0).head).toBe(0);
    expect(slashPhase(0.35).head).toBeGreaterThanOrEqual(1);
    expect(slashPhase(0.4).erode).toBe(0);
  });
  it('tan hết ở cuối', () => {
    const p = slashPhase(1);
    expect(p.head).toBeGreaterThanOrEqual(1);
    expect(p.erode).toBeGreaterThanOrEqual(1.05);
  });
  it('k âm (lớp mực trễ) chưa hiện', () => {
    expect(slashPhase(-0.05).head).toBe(0);
  });
});

describe('slashGeometry', () => {
  it('có uv, normal, mũi nhọn ở hai đầu', () => {
    const g = slashGeometry(Math.PI / 2, 8, 0.4);
    expect(g.getAttribute('uv').count).toBe(9 * 3);
    expect(g.getAttribute('normal')).toBeTruthy();
    const pos = g.getAttribute('position');
    // Đầu u = 0: mép trong và mép ngoài trùng nhau (độ dày 0).
    expect(pos.getX(0)).toBeCloseTo(pos.getX(2));
    expect(pos.getZ(0)).toBeCloseTo(pos.getZ(2));
    expect(SLASH_GEO.index?.count).toBe(32 * 2 * 6);
  });
});

describe('sigilLayout', () => {
  it('tròn: tấm vuông quanh tâm', () => {
    const l = sigilLayout(SIGIL_CIRCLE, 5, 0);
    expect(l).toEqual({ sx: 10 + 2 * SIGIL_PAD, sz: 10 + 2 * SIGIL_PAD, offset: 0 });
  });
  it('chữ nhật: tâm tấm ở giữa chiều dài', () => {
    const l = sigilLayout(SIGIL_RECT, 9, 2.4);
    expect(l.offset).toBe(4.5);
    expect(l.sx).toBeCloseTo(2.4 + 2 * SIGIL_PAD);
    expect(l.sz).toBeCloseTo(9 + 2 * SIGIL_PAD);
  });
  it('quạt: bề ngang theo nửa góc, phủ hết cung', () => {
    const l = sigilLayout(SIGIL_CONE, 8, Math.PI / 6);
    expect(l.sx).toBeCloseTo(8 + 2 * SIGIL_PAD);
    expect(l.offset).toBe(4);
  });
});

describe('FxPool với kiểu kiếm khí/pháp trận', () => {
  it('lưới tái dùng được reset tham số, không tạo lưới mới', () => {
    const pool = new FxPool(2);
    const a = pool.acquire(SIGIL_GEO, 'sigil', 0xffffff, 1);
    a.fxA.set(1, 2, 3, 4);
    a.fxB.set(5, 6, 7, 8);
    a.renderOrder = -1;
    pool.release(a);
    const b = pool.acquire(SLASH_GEO, 'slash', 0xffffff, 1);
    expect(b).toBe(a);
    expect(b.fxA.toArray()).toEqual([0, 0, 0, 0]);
    expect(b.fxB.toArray()).toEqual([0, 0, 0, 0]);
    expect(b.renderOrder).toBe(0);
    pool.acquire(SLASH_GEO, 'ink', 0, 1);
    expect(pool.created).toBe(2);
  });
});
