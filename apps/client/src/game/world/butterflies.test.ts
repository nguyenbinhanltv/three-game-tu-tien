import { describe, expect, it } from 'vitest';
import {
  BUTTERFLY_LEVELS,
  BUTTERFLY_MAX,
  BUTTERFLY_QUALITY,
  butterflyGeometry,
  hash2,
  spotsNear,
  wingPixels,
  wingTexel,
} from './butterflies';

describe('bướm trang trí (DV-C)', () => {
  it('lưới một con: 8 tam giác, hai cánh đối xứng qua bản lề', () => {
    const g = butterflyGeometry();
    expect(g.getIndex()!.count / 3).toBe(8);
    const p = g.getAttribute('position');
    let minX = 0;
    let maxX = 0;
    for (let i = 0; i < p.count; i++) {
      minX = Math.min(minX, p.getX(i));
      maxX = Math.max(maxX, p.getX(i));
      expect(p.getY(i)).toBe(0);
    }
    expect([minX, maxX]).toEqual([-1, 1]);
  });

  it('hoa văn cánh: trong suốt ở góc, đặc ở giữa cánh, thân tối sát bản lề', () => {
    expect(wingTexel(0.98, 0.02)[2]).toBe(0);
    expect(wingTexel(0.45, 0.65)[2]).toBe(1);
    const body = wingTexel(0.02, 0.5);
    expect(body[2]).toBe(1);
    expect(body[0]).toBeLessThan(0.2);
    const px = wingPixels(32);
    expect(px.length).toBe(32 * 32 * 4);
    let solid = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 127) solid++;
    // Cánh phủ 25–60% ô vuông: đủ thấy, không thành tấm chữ nhật.
    expect(solid / (32 * 32)).toBeGreaterThan(0.25);
    expect(solid / (32 * 32)).toBeLessThan(0.7);
  });

  it('băm xác định, trong [0, 1)', () => {
    for (let i = -50; i < 50; i += 7) {
      const h = hash2(i, i * 3 + 1, 2);
      expect(h).toBe(hash2(i, i * 3 + 1, 2));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('rải theo ô: xác định, gần nhất trước, không quá giới hạn, bỏ chỗ không hợp', () => {
    const cfg = BUTTERFLY_LEVELS.van_lam;
    const all = () => true;
    const a = spotsNear(2048, 2400, cfg, 48, all);
    const b = spotsNear(2048, 2400, cfg, 48, all);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(6);
    expect(a.length).toBeLessThanOrEqual(48);
    for (let i = 1; i < a.length; i++) expect(a[i].d2).toBeGreaterThanOrEqual(a[i - 1].d2);
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
    // Mọi con trong tầm 20 m + nửa ô.
    for (const s of a) expect(Math.sqrt(s.d2)).toBeLessThan(32);
    expect(spotsNear(2048, 2400, cfg, 5, all)).toHaveLength(5);
    expect(spotsNear(2048, 2400, cfg, 48, () => false)).toHaveLength(0);
    // Đi 1 m thì đàn gần như không đổi (không nhấp nháy khi di chuyển).
    const c = spotsNear(2049, 2400, cfg, 48, all);
    const keep = c.filter((s) => a.some((t) => t.id === s.id)).length;
    expect(keep / Math.max(a.length, c.length)).toBeGreaterThan(0.7);
  });

  it('ngân sách: tối đa 48 con, mọi preset không vượt', () => {
    expect(BUTTERFLY_MAX).toBe(48);
    for (const n of Object.values(BUTTERFLY_QUALITY)) expect(n).toBeLessThanOrEqual(BUTTERFLY_MAX);
    for (const cfg of Object.values(BUTTERFLY_LEVELS)) {
      expect(cfg.palette).toHaveLength(4);
      expect(cfg.density).toBeGreaterThan(0);
      expect(cfg.density).toBeLessThanOrEqual(0.5);
    }
  });
});
