// E4-A: Thiên Khuyết Cổ Thành đạt bộ kiểm level, đúng số liệu thiết kế (5 vùng cấp 24–27, 12 tinh anh, một boss Thủ Linh ở Mộ Đạo), địa hình đi được.
import { describe, expect, it } from 'vitest';
import { polyArea, terrainOf, TELE_PADS, TELE_FREE, WATER_Y } from '@dtl/shared';
import { campCoverage, COVER_BY_LEVEL } from './coverage';
import { LEVELS } from './index';
import { checkLevel } from './levelcheck';

const lv = LEVELS.thien_khuyet;

describe('thien_khuyet', () => {
  it('đạt checkLevel', () => expect(checkLevel(lv)).toEqual([]));

  it('đúng số liệu thiết kế', () => {
    const zones = lv.zones ?? [];
    const camps = lv.camps ?? [];
    expect(zones).toHaveLength(5);
    expect(Math.min(...zones.map((z) => z.lvMin))).toBe(24);
    expect(Math.max(...zones.map((z) => z.lvMax))).toBe(27);
    expect(camps.length).toBeGreaterThanOrEqual(60);
    expect(camps.length).toBeLessThanOrEqual(90);
    expect(lv.spawns.filter((s) => s.mon.startsWith('elite_')).reduce((a, s) => a + s.count, 0)).toBe(12);
    const boss = lv.spawns.filter((s) => s.mon.startsWith('boss_')); // Thiên Khuyết Thủ Linh (E4-B)
    expect(boss).toHaveLength(1);
    expect(boss[0]).toMatchObject({ mon: 'boss_thien_khuyet_thu_linh', x: 964, z: 1504, respawn: 1800 });
    const normal = camps.reduce((a, c) => a + c.count + (c.ranged ? 1 : 0), 0);
    const km2 = zones.reduce((a, z) => a + polyArea(z.poly), 0) / 1e6;
    expect(km2).toBeGreaterThan(1.7);
    expect(km2).toBeLessThan(2.3);
    expect(normal / km2).toBeGreaterThanOrEqual(100);
    expect(normal / km2).toBeLessThanOrEqual(140);
  });

  it('độ phủ cụm đạt chuẩn level (p95 và điểm xa nhất tới mép cụm)', () => {
    const cv = campCoverage(lv);
    expect(cv.p95).toBeLessThanOrEqual(COVER_BY_LEVEL.thien_khuyet.p95);
    expect(cv.max).toBeLessThanOrEqual(COVER_BY_LEVEL.thien_khuyet.max);
    expect(cv.within).toBeGreaterThan(0.97); // ≥ 97 % điểm ≤ 70 m
  });

  it('Đại Lộ Đèn Trời phẳng từ trạm tới quảng trường (đi một mạch)', () => {
    const tr = terrainOf(lv);
    for (let z = 1024 - 100; z >= 1024 - 560; z -= 20) {
      const x = 1024 + (20 * (1024 - z - 100)) / 460;
      expect(Math.abs(tr.heightAt(x, z) - 80)).toBeLessThan(2.5);
    }
  });

  it('địa hình khô: không nước, mọi chỗ trong vùng chơi cao hơn mặt nước chuẩn', () => {
    const tr = terrainOf(lv);
    expect(tr.def.water).toBeUndefined();
    const b = tr.playBounds;
    let min = Infinity;
    for (let x = b.x0; x <= b.x1; x += 16) for (let z = b.z0; z <= b.z1; z += 16) min = Math.min(min, tr.heightAt(x, z));
    expect(min).toBeGreaterThan(WATER_Y + 5);
  });

  it('trận tk_: mỗi vùng một trận, trạm có trận, tiền tố tk_, không mở sẵn cho mọi người', () => {
    const pads = TELE_PADS.filter((p) => p.level === 'thien_khuyet');
    expect(pads.map((p) => p.id).every((id) => id.startsWith('tk_tp_'))).toBe(true);
    expect(pads.some((p) => p.id === 'tk_tp_tram' && p.zone === '')).toBe(true);
    for (const z of lv.zones ?? []) expect(pads.filter((p) => p.zone === z.id)).toHaveLength(1);
    expect(TELE_FREE.some((id) => id.startsWith('tk_'))).toBe(false);
  });

  it('điểm vào là trạm, trong vùng chơi', () => {
    const tr = terrainOf(lv);
    const s = lv.spawn as { x: number; z: number };
    expect(Math.hypot(s.x - 1024, s.z - 1024)).toBeLessThan(40);
    expect(tr.playDist(s.x, s.z)).toBeLessThan(200); // vùng chơi lệch 140 m về phía bắc so với trạm
  });
});
