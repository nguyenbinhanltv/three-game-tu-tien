// E3-A/E3-N: Vân Hải Phù Đảo đạt bộ kiểm level, đúng số liệu thiết kế (5 vùng cấp 20–23, 12 tinh anh), địa hình đảo nổi nhất quán với dữ liệu.
import { describe, expect, it } from 'vitest';
import { polyArea, TELE_FREE, TELE_PADS, terrainOf } from '@dtl/shared';
import { campCoverage, COVER_BY_LEVEL } from './coverage';
import { LEVELS } from './index';
import { checkLevel } from './levelcheck';

const lv = LEVELS.van_hai;
const tr = terrainOf(lv);

describe('van_hai', () => {
  it('đạt checkLevel', () => expect(checkLevel(lv)).toEqual([]));

  it('đúng số liệu thiết kế', () => {
    const zones = lv.zones ?? [];
    const camps = lv.camps ?? [];
    expect(zones.map((z) => z.id)).toEqual(['tung_dai_dao', 'thach_quy_dao', 'kinh_ho_dao', 'loi_van_dao', 'kinh_ngu_dai']);
    expect(Math.min(...zones.map((z) => z.lvMin))).toBe(20);
    expect(Math.max(...zones.map((z) => z.lvMax))).toBe(23);
    expect(lv.spawns.filter((s) => s.mon.startsWith('elite_')).reduce((a, s) => a + s.count, 0)).toBe(12);
    const normal = camps.reduce((a, c) => a + c.count, 0);
    const km2 = zones.reduce((a, z) => a + polyArea(z.poly), 0) / 1e6;
    expect(normal / km2).toBeGreaterThanOrEqual(100);
    expect(normal / km2).toBeLessThanOrEqual(140);
  });

  it('chuẩn độ phủ của level là chuẩn bản đồ mới (p95 ≤ 65, max ≤ 85)', () => {
    expect(COVER_BY_LEVEL.van_hai).toEqual({ p95: 65, max: 85 });
    const cv = campCoverage(lv);
    expect(cv.max).toBeLessThanOrEqual(85);
    expect(cv.p95).toBeLessThanOrEqual(65);
  });

  it('địa hình đảo: mỗi vùng là một đảo, quanh đảo là sàn mây, mỗi vùng có cầu nối về hub', () => {
    const d = tr.def;
    expect(d.islands!.length).toBeGreaterThanOrEqual(9); // hub + 5 vùng + 3 đảo nhỏ
    expect(d.fakeIslands!.length).toBeGreaterThanOrEqual(3);
    expect(d.voidFloor).toBe(60);
    for (const c of lv.camps ?? []) {
      expect(tr.heightAt(c.x, c.z)).toBeGreaterThan(d.voidFloor! + 40); // quái đứng trên đảo, không trên sàn mây
    }
    // đồ thị cầu liên thông: mọi đảo vùng với tới hub
    const isl = d.islands!;
    const near = (x: number, z: number) => isl.findIndex((i) => Math.hypot(i.x - x, i.z - z) <= i.r + 1);
    const adj = new Map<number, Set<number>>();
    for (const b of d.bridges!) {
      const a = near(b.ax, b.az);
      const c = near(b.bx, b.bz);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(c).toBeGreaterThanOrEqual(0);
      (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(c);
      (adj.get(c) ?? adj.set(c, new Set()).get(c)!).add(a);
    }
    const seen = new Set<number>([0]);
    const q = [0];
    while (q.length) for (const n of adj.get(q.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), q.push(n));
    for (let i = 0; i <= 5; i++) expect(seen.has(i)).toBe(true); // hub + năm vùng
  });

  it('đảo giả không có mặt đứng: tâm mỗi đảo giả là sàn mây', () => {
    for (const f of tr.def.fakeIslands!) {
      expect(tr.heightAt(f.x, f.z)).toBeCloseTo(tr.def.voidFloor!, 3);
      expect(f.y).toBeGreaterThan(tr.def.voidFloor! + 40);
    }
  });

  it('trận vh_: mỗi vùng một trận, hub có trận, không mở sẵn; q2_ket_dan mở trận hub', () => {
    const pads = TELE_PADS.filter((p) => p.level === 'van_hai');
    expect(pads.every((p) => p.id.startsWith('vh_tp_'))).toBe(true);
    expect(pads.some((p) => p.id === 'vh_tp_hub' && p.zone === '')).toBe(true);
    for (const z of lv.zones ?? []) expect(pads.filter((p) => p.zone === z.id)).toHaveLength(1);
    expect(TELE_FREE.some((id) => id.startsWith('vh_'))).toBe(false);
  });

  it('điểm vào là Phù Đảo Các, đứng được trên đảo', () => {
    const s = lv.spawn as { x: number; z: number };
    expect(Math.hypot(s.x - 1024, s.z - 1024)).toBeLessThan(40);
    expect(tr.heightAt(s.x, s.z)).toBeGreaterThan(tr.def.voidFloor! + 40);
  });
});
