import { LEVELS } from '@dtl/content';
import { fbm, hash01, padsOfLevel, terrainOf } from '@dtl/shared';
import type { PropInstance } from './propScatter';
import { vanHaiArt } from './vanHaiArt';

/**
 * Rải cảnh Vân Hải theo bản sắc từng đảo (E3-A, viết lại ở E3-I): lưới ô 13 m lệch ngẫu nhiên, xác định, chỉ để tô cảnh (không va chạm), mọc THÀNH ĐÁM theo
 * nhiễu chứ không đều ô. Mỗi đảo một bộ prop và sắc độ (xem `vanHaiArt`): Tùng Đài rừng tùng + dương xỉ, Thạch Quy đá tảng và trụ khắc vân, Kính Hồ tre/anh đào
 * quanh hồ gương, Lôi Vân đá phiến sẫm + cây cháy + kiếm gãy, Kình Ngư đá trắng xương + tùng gió. Chỉ trên mặt đảo (không sàn mây, không đường cầu),
 * tránh lối mòn, tâm cụm quái, tinh anh, trận, điểm đáng chú ý, điểm hái và prop đặt tay.
 */
interface Circle {
  x: number;
  z: number;
  r: number;
}
type Pick = { id: string; s: number; sy?: number; tint?: [number, number, number] };
const ROCKS3 = ['prop_da_troi', 'prop_da_dung', 'prop_da_phien'] as const;

/** Chọn prop cho một ô: `g` nhiễu đám (−0,6..0,6), `rock` độ lộ đá, `pw` bờ hồ, `near` khoảng cách tới mép hồ gần nhất, `r` xác suất, `k` ngẫu nhiên cỡ. */
export function vhPick(kind: string, g: number, rock: number, pw: number, near: number, r: number, k: number): Pick | null {
  const sc = (lo: number, hi: number) => lo + k * (hi - lo);
  switch (kind) {
    case 'tung_dai_dao': {
      const grove = Math.max(0, g * 2 + 0.25);
      if (r < 0.1 * grove)
        return {
          id: k < 0.82 ? 'prop_tung_phu_dao' : 'prop_thong_co',
          s: sc(0.8, 1.5),
          sy: 0.92 + k * 0.25,
          tint: [0.86 + k * 0.1, 0.96, 0.82 + k * 0.1],
        };
      if (r < 0.1 * grove + 0.07 * (g > -0.1 ? 1 : 0.2)) return { id: 'prop_duong_xi', s: sc(0.8, 1.6), tint: [0.8, 0.95, 0.78] };
      if (r < 0.1 * grove + 0.1 + rock * 0.05) return { id: 'prop_duong_xi', s: sc(0.9, 1.5), tint: [0.78, 0.92, 0.76] };
      return null;
    }
    case 'thach_quy_dao': {
      const field = rock * 0.28 + Math.max(0, g) * 0.12;
      if (r < field)
        return { id: ROCKS3[Math.floor(k * 2.99)]!, s: sc(0.45, 1.5) * (g > 0.12 ? 1.3 : 1), sy: 0.8 + k * 0.4, tint: [1.08, 1.0, 0.88] };
      if (r < field + 0.004) return { id: 'prop_tru_da_khac_van', s: sc(0.9, 1.3), tint: [1, 0.97, 0.9] };
      if (r < field + 0.007) return { id: 'prop_bia_da', s: sc(0.9, 1.2), tint: [0.95, 0.93, 0.88] };
      if (r < field + 0.02) return { id: 'prop_tung_phu_dao', s: sc(0.7, 1.1), tint: [0.95, 0.92, 0.78] };
      return null;
    }
    case 'kinh_ho_dao': {
      if (pw > 0.04 && r < 0.32 * Math.min(1, pw * 3))
        return { id: k < 0.55 ? 'prop_truc' : 'prop_duong_xi', s: sc(0.8, 1.5), tint: [0.86, 1, 0.9] };
      if (near < 52 && r < 0.05) return { id: 'prop_anh_dao', s: sc(0.8, 1.25), tint: [1, 0.96, 0.98] };
      if (pw > 0.02 && r > 0.93) return { id: 'prop_duong_xi', s: sc(0.8, 1.3), tint: [0.84, 0.97, 0.9] };
      if (r > 0.985) return { id: 'prop_truc', s: sc(0.8, 1.2), tint: [0.86, 1, 0.9] };
      return null;
    }
    case 'loi_van_dao': {
      const f = 0.05 + rock * 0.32;
      if (r < f) return { id: k < 0.7 ? 'prop_da_phien' : 'prop_da_dung', s: sc(0.4, 1.1), sy: 1 + k * 1.1, tint: [0.5, 0.52, 0.6] };
      if (r < f + 0.045) return { id: 'prop_cay_goc_kho', s: sc(0.8, 1.35), tint: [0.62, 0.64, 0.7] };
      if (r < f + 0.058) return { id: 'prop_kiem_gay', s: sc(1, 2.2), tint: [0.8, 0.82, 0.9] };
      if (r < f + 0.064) return { id: 'prop_tru_da_khac_van', s: sc(0.9, 1.3), tint: [0.5, 0.52, 0.6] };
      return null;
    }
    case 'kinh_ngu_dai': {
      if (r < 0.04 + rock * 0.2)
        return { id: k < 0.6 ? 'prop_da_phien' : 'prop_da_troi', s: sc(0.4, 1.1), sy: 0.9 + k * 0.7, tint: [1.0, 1.08, 1.2] };
      if (r < 0.1 + rock * 0.2 && g > 0) return { id: 'prop_soi_nui', s: sc(0.8, 1.4), tint: [0.9, 1, 1] };
      if (r < 0.125 + rock * 0.2) return { id: 'prop_tung_phu_dao', s: sc(0.7, 1.1), tint: [0.8, 0.95, 0.95] };
      if (r > 0.996) return { id: 'prop_tru_da_khac_van', s: sc(0.9, 1.2), tint: [1.15, 1.12, 1.05] };
      return null;
    }
    case 'tieu_dao':
      if (r < 0.06) return { id: 'prop_tung_phu_dao', s: sc(0.7, 1.1) };
      if (r < 0.12) return { id: 'prop_duong_xi', s: sc(0.8, 1.4) };
      if (r < 0.16) return { id: 'prop_duong_xi', s: sc(0.8, 1.3) };
      return null;
    default: // hub: anh đào lẻ ở rìa
      if (r < 0.04) return { id: 'prop_anh_dao', s: sc(0.8, 1.1) };
      return null;
  }
}

export function scatterVanHai(placed: readonly PropInstance[]): PropInstance[] {
  const L = LEVELS.van_hai!;
  const tr = terrainOf('van_hai');
  const art = vanHaiArt(tr.def);
  const clear: Circle[] = [
    { x: L.spawn?.x ?? 1024, z: L.spawn?.z ?? 1036, r: 40 },
    ...(L.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: 6 })),
    ...L.spawns.filter((sp) => sp.radius > 4).map((sp) => ({ x: sp.x, z: sp.z, r: sp.radius + 4 })),
    ...(L.pois ?? []).map((p) => ({ x: p.x, z: p.z, r: 14 })),
    ...L.nodes.map((n) => ({ x: n.x, z: n.z, r: 6 })),
    ...padsOfLevel('van_hai').map((p) => ({ x: p.x, z: p.z, r: 8 })),
    ...(tr.def.bridges ?? []).flatMap((b) => [0, 0.5, 1].map((t) => ({ x: b.ax + (b.bx - b.ax) * t, z: b.az + (b.bz - b.az) * t, r: 12 }))),
    // tâm mỗi đảo vùng: chỗ đứng/chụp ảnh, không đặt cây (gốc cây đá sát camera nhìn như khối phẳng thô)
    ...(L.zones ?? []).map((z) => ({
      x: z.poly.reduce((a, q) => a + q[0], 0) / z.poly.length,
      z: z.poly.reduce((a, q) => a + q[1], 0) / z.poly.length,
      r: 22,
    })),
    ...placed.map((p) => ({ x: p.x, z: p.z, r: 3.5 })),
  ];
  const floor = tr.def.voidFloor ?? 0;
  const out: PropInstance[] = [];
  const CELL = 13;
  const b = tr.playBounds;
  const seed = tr.def.seed;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const x = (gx + 0.1 + hash01(gx, gz, 5723) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 5733) * 0.8) * CELL;
      const isl = art.islandAt(x, z);
      if (!isl) continue;
      const d = Math.hypot(x - isl.x, z - isl.z);
      if (d > isl.r - 7) continue; // chừa rìa đảo trống để thấy mép
      const h = tr.heightAt(x, z);
      if (h < floor + 40) continue; // sàn mây và chân đảo: không rải
      const slope = Math.abs(tr.heightAt(x + 3, z) - h) + Math.abs(tr.heightAt(x, z + 3) - h);
      if (slope > 3.4) continue;
      if (art.trailW(isl, x, z) > 0.04) continue;
      const pw = art.pondW(x, z);
      if (pw > 0.55) continue; // lòng hồ
      const g = fbm(x * 0.03 + 5, z * 0.03 - 11, 2, seed + 9100);
      const rock = art.rockW(isl, x, z, slope / 1.5);
      let near = 1e9;
      for (const p of art.ponds) near = Math.min(near, Math.hypot(x - p.x, z - p.z) - p.r);
      const pick = vhPick(isl.kind, g, rock, pw, near, hash01(gx, gz, 5711), hash01(gx, gz, 5799));
      if (!pick) continue;
      let bad = false;
      for (const c of clear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) bad = true;
      for (const c of tr.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 3) ** 2) bad = true;
      if (bad) continue;
      const k = hash01(gx, gz, 5783);
      out.push({
        id: pick.id,
        x,
        y: h - 0.1,
        z,
        yaw: k * Math.PI * 2,
        s: pick.s,
        ...(pick.sy ? { sy: pick.sy } : {}),
        ...(pick.tint ? { tint: pick.tint } : {}),
      });
    }
  }
  return out;
}
