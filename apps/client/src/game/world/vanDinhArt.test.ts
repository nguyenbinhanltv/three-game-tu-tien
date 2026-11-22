import { describe, expect, it } from 'vitest';
import '@dtl/content';
import { collisionOf, gioiTriPillars, terrainOf, vdGateCircles, vdGateYaw, VD_BIA_R, VD_DINH_R } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { faceBlend, faceTint, scatterVanDinh, scatterWallShoulder, vdMix } from './vanDinhArt';
import { GRADING, mixPreset, moodVariant } from '../../render/grading';

const tr = terrainOf('van_dinh');
const ctx = {
  def: tr.def,
  bounds: tr.playBounds,
  heightAt: (x: number, z: number) => tr.heightAt(x, z),
  clear: [{ x: 1024, z: 1546, r: 90 }],
  colliders: tr.colliders,
};

describe('Vấn Đỉnh: hai mặt (TN-3 mỹ thuật)', () => {
  it('faceBlend: 0 ở mặt Âm (tây), 1 ở mặt Dương (đông), đổi dần quanh Giới Tuyến', () => {
    expect(faceBlend(-300)).toBe(0);
    expect(faceBlend(300)).toBe(1);
    expect(faceBlend(0)).toBeCloseTo(0.5, 5);
    expect(faceBlend(-20)).toBeLessThan(faceBlend(20));
  });

  it('faceTint: mặt Âm ngả lam, mặt Dương ngả vàng đồng và bớt xanh rêu', () => {
    const am: [number, number, number] = [0.5, 0.55, 0.45];
    const du: [number, number, number] = [0.5, 0.55, 0.45];
    faceTint(-300, am);
    faceTint(300, du);
    expect(am[2]).toBeGreaterThan(am[0]);
    expect(du[0]).toBeGreaterThan(du[2]);
    expect(du[1] / du[0]).toBeLessThan(0.55 / 0.5);
  });

  it('bộ mood: tám preset vda_*/vdd_* có thật, khác hẳn nhau và trộn được', () => {
    for (const t of ['dawn', 'day', 'dusk', 'night'] as const) {
      expect(moodVariant('vda_dawn', t)).toBe(`vda_${t}`);
      expect(moodVariant('vdd_dusk', t)).toBe(`vdd_${t}`);
      const a = GRADING[`vda_${t}`];
      const d = GRADING[`vdd_${t}`];
      expect(a.saturation).not.toBe(d.saturation);
      expect(a.fogColor).not.toBe(d.fogColor);
      expect(mixPreset(a, d, 0.5).saturation).toBeCloseTo((a.saturation + d.saturation) / 2, 5);
    }
  });

  it('vdMix: mỗi vùng một bộ đồ khác nhau, hai mặt không dùng chung bảng', () => {
    const south = vdMix(-300, 230);
    const mid = vdMix(-330, -230);
    const north = vdMix(-10 - 50, -470);
    expect(new Set([south, mid, north]).size).toBe(3);
    expect(vdMix(300, 230)).not.toBe(south);
  });

  it('scatterVanDinh: xác định, đủ dày, theo mặt, tránh vòng cấm và Giới Tuyến', () => {
    const a = scatterVanDinh(ctx);
    const b = scatterVanDinh(ctx);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(400);
    expect(a.length).toBeLessThan(4000);
    const cx = tr.def.size / 2;
    const west = a.filter((r) => r.x < cx).length;
    const east = a.length - west;
    expect(west).toBeGreaterThan(100);
    expect(east).toBeGreaterThan(100);
    for (const r of a) {
      expect(Math.hypot(r.x - 1024, r.z - 1546)).toBeGreaterThanOrEqual(90);
      // Giới Tuyến chừa trống, trừ đá tảng chân vách (ở tận mép bắc/nam, xa trục)
      if (r.s < 2.4) expect(Math.abs(r.x - cx)).toBeGreaterThanOrEqual(14);
    }
    // Chân vách: đá tảng lớn (scale ≥ 2,4) dọc ranh vùng chơi để che đường nối vách-nền, không có va chạm (lean < 0,35)
    const base = a.filter((r) => r.s >= 2.4);
    expect(base.length).toBeGreaterThan(60);
    for (const r of base) {
      const edge = Math.min(r.x - tr.playBounds.x0, tr.playBounds.x1 - r.x, r.z - tr.playBounds.z0, tr.playBounds.z1 - r.z);
      expect(edge).toBeLessThanOrEqual(62);
      expect(Math.abs(r.lean)).toBeLessThan(0.35);
    }
    // Lớp chi tiết mặt đất: nhiều vật nhỏ (scale < 1,1); mặt Dương có cỏ khô, mặt Âm không
    const small = a.filter((r) => r.s < 1.1);
    expect(small.length).toBeGreaterThan(800);
    expect(a.filter((r) => r.id === 'prop_duong_xi' && r.x < cx).length).toBe(0);
    expect(a.filter((r) => r.id === 'prop_duong_xi' && r.x > cx).length).toBeGreaterThan(50);
    // Vùng rễ (tây giữa) nhiều rễ cổ; mặt Dương nhiều đá đỏ đồng
    const roots = a.filter((r) => r.id === 'prop_cay_goc_kho' && r.x < cx && r.z < cx - 120 && r.z > cx - 330).length;
    expect(roots).toBeGreaterThan(20);
  });

  it('va chạm của kiến trúc dựng bằng code: vòng ở tâm Đỉnh Vô Danh, ba Ảnh Bia và hai trụ Cổng Giới Trì (server cho đi xuyên nếu thiếu)', () => {
    const L = LEVELS.van_dinh!;
    const has = (x: number, z: number, r: number) =>
      tr.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < 0.05 && Math.abs(c.r - r) < 0.05);
    const dinh = L.pois!.find((p) => p.id === 'dinh_vo_danh')!;
    expect(has(dinh.x, dinh.z, VD_DINH_R)).toBe(true);
    for (const b of L.spots!.filter((q) => q.id.startsWith('anh_bia'))) expect(has(b.x, b.z, VD_BIA_R), b.id).toBe(true);
    const gate = L.pois!.find((p) => p.id === 'gioi_tri_cua')!;
    const pillars = vdGateCircles(gate, vdGateYaw(gate, tr.def.size / 2));
    expect(pillars).toHaveLength(2);
    for (const c of pillars) expect(has(c.x, c.z, c.r), `trụ cổng ${c.x.toFixed(1)}`).toBe(true);
    // hai trụ cách nhau ~12,4 m (như dựng hình) và chừa lối đi giữa (≥ 8 m giữa hai mép)
    expect(Math.hypot(pillars[0]!.x - pillars[1]!.x, pillars[0]!.z - pillars[1]!.z)).toBeCloseTo(12.4, 1);
  });

  it('phó bản gioi_tri: 14 cột đồng quanh sân đều có hình va chạm riêng đúng chỗ dựng hình', () => {
    const center = LEVELS.gioi_tri!.dungeon!.center;
    const want = gioiTriPillars(center);
    expect(want).toHaveLength(14);
    const cyls = collisionOf('gioi_tri').shapes.filter((s) => s.k === 'cyl' && s.tag === 'gioi_tri_cot_dong');
    expect(cyls).toHaveLength(14);
    for (const w of want) expect(cyls.some((s) => s.k === 'cyl' && Math.hypot(s.x - w.x, s.z - w.z) < 0.01 && s.r === w.r)).toBe(true);
    // nằm trong `bound` của phó bản (người chơi/quái tới được) nên phải chặn thật
    const bound = LEVELS.gioi_tri!.dungeon!.bound!;
    for (const w of want) expect(Math.hypot(w.x - center.x, w.z - center.z)).toBeLessThanOrEqual(bound + 0);
  });
});

describe('Vấn Đỉnh: đá vai vách (có va chạm)', () => {
  it('chừa vòng cấm (trạm, nút, cụm quái, trận…) và collider có sẵn một khoảng bằng cỡ khối', () => {
    const L = LEVELS.van_dinh!;
    const clear = [
      { x: 1024, z: 1546, r: 90 },
      ...(L.spots ?? []).map((p) => ({ x: p.x, z: p.z, r: 10 })),
      ...L.nodes.map((n) => ({ x: n.x, z: n.z, r: 6 })),
      ...L.spawns.map((sp) => ({ x: sp.x, z: sp.z, r: sp.radius + 4 })),
    ];
    const rocks = scatterWallShoulder({ ...ctx, clear });
    expect(rocks.length).toBeGreaterThan(20);
    for (const r of rocks) {
      for (const c of clear)
        expect(Math.hypot(r.x - c.x, r.z - c.z), `${r.id}@${r.x},${r.z}`).toBeGreaterThanOrEqual(c.r + r.s * 1.6 + 4 - 1e-6);
      for (const c of ctx.colliders) expect(Math.hypot(r.x - c.x, r.z - c.z)).toBeGreaterThanOrEqual(c.r + r.s * 1.6 + 4 - 1e-6);
    }
  });
});
