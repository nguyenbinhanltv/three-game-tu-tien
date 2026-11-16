// E2-A: Đoạn Mạch Cổ Cốc đạt bộ kiểm level, đúng số liệu thiết kế (60 cụm, 12 tinh anh, 1 boss, 5 vùng cấp 16–19), địa hình đi được.
import { describe, expect, it } from 'vitest';
import { polyArea, terrainOf, TELE_PADS, TELE_FREE, WATER_Y } from '@dtl/shared';
import { LEVELS } from './index';
import { checkLevel } from './levelcheck';

const lv = LEVELS.doan_mach;

describe('doan_mach', () => {
  it('đạt checkLevel', () => expect(checkLevel(lv)).toEqual([]));

  it('đúng số liệu thiết kế', () => {
    const zones = lv.zones ?? [];
    const camps = lv.camps ?? [];
    expect(zones).toHaveLength(5);
    expect(Math.min(...zones.map((z) => z.lvMin))).toBe(16);
    expect(Math.max(...zones.map((z) => z.lvMax))).toBe(19);
    expect(camps).toHaveLength(60);
    expect(lv.spawns.filter((s) => s.mon.startsWith('elite_')).reduce((a, s) => a + s.count, 0)).toBe(12);
    expect(lv.spawns.filter((s) => s.mon.startsWith('boss_')).map((s) => s.mon)).toEqual(['boss_dia_mach_long']);
    const normal = camps.reduce((a, c) => a + c.count + (c.ranged ? 1 : 0), 0);
    const km2 = zones.reduce((a, z) => a + polyArea(z.poly), 0) / 1e6;
    expect(km2).toBeGreaterThan(1.6);
    expect(km2).toBeLessThan(2.2);
    expect(normal / km2).toBeGreaterThanOrEqual(100);
    expect(normal / km2).toBeLessThanOrEqual(140);
  });

  it('địa hình khô: không nước, mọi chỗ trong vùng chơi cao hơn mặt nước chuẩn', () => {
    const tr = terrainOf(lv);
    expect(tr.def.water).toBeUndefined();
    const b = tr.playBounds;
    let min = Infinity;
    for (let x = b.x0; x <= b.x1; x += 16) for (let z = b.z0; z <= b.z1; z += 16) min = Math.min(min, tr.heightAt(x, z));
    expect(min).toBeGreaterThan(WATER_Y + 5);
  });

  it('trận dm_: mỗi vùng một trận, trạm có trận, tiền tố dm_, không mở sẵn cho mọi người', () => {
    const pads = TELE_PADS.filter((p) => p.level === 'doan_mach');
    expect(pads.map((p) => p.id).every((id) => id.startsWith('dm_tp_'))).toBe(true);
    expect(pads.some((p) => p.id === 'dm_tp_tram' && p.zone === '')).toBe(true);
    for (const z of lv.zones ?? []) expect(pads.filter((p) => p.zone === z.id)).toHaveLength(1);
    expect(TELE_FREE.some((id) => id.startsWith('dm_'))).toBe(false);
    expect(TELE_PADS.some((p) => p.id === 'tp_thien_mach' && p.level === 'van_lam')).toBe(true);
  });

  it('điểm vào là trạm, trong vùng chơi', () => {
    const tr = terrainOf(lv);
    const s = lv.spawn as { x: number; z: number };
    expect(Math.hypot(s.x - 1024, s.z - 1024)).toBeLessThan(40);
    expect(tr.playDist(s.x, s.z)).toBeLessThan(100);
  });
});
