import { COLLIDERS, DUNGEON_EXIT, FOREST, HAND_PROPS, hash01, heightAt, ISLAND_R, KIEM_TRUNG, LAKE, PORTAL_PAD, SECT, VALLEY, WATER_Y } from '@dtl/shared';

/**
 * Bố cục prop Tripo theo brief level-dressing (P2-A1, thực hiện P2-A4). Hoàn toàn xác định (hash theo chỉ số), không
 * dùng Math.random: mọi máy cho cùng một cảnh. Prop điểm nhấn đặt tay ở `HAND_PROPS` (shared); phần còn lại rải theo
 * cụm quanh tâm từng khu, tránh: nước, vách dốc, va chạm, lối đi, vòng tiếp cận NPC, lõi spawn quái, lõi trận đấu.
 */
export interface PropInstance {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
}

interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Vùng cấm đặt prop: lõi spawn quái (R30), vòng NPC (≥4 m), spawn người, cổng, đảo Hàn Giao, lõi Kiếm Trủng, node hái. */
const KEEP_CLEAR: Circle[] = [
  { x: 2048, z: 2455, r: 32 },
  { x: 1870, z: 2650, r: 32 },
  { x: 2240, z: 2770, r: 32 },
  { x: 2550, z: 2210, r: 32 },
  { x: 2830, z: 2080, r: 32 },
  { x: 2810, z: 2370, r: 32 },
  { x: 2048, z: 2030, r: 6 },
  { x: 2004, z: 2064, r: 6 },
  { x: 2092, z: 2064, r: 6 },
  { x: 2048, z: 2088, r: 8 },
  { x: PORTAL_PAD.x, z: PORTAL_PAD.z, r: 24 },
  { x: LAKE.x, z: LAKE.z, r: ISLAND_R + 6 },
  { x: KIEM_TRUNG.x, z: KIEM_TRUNG.z, r: 28 },
  { x: DUNGEON_EXIT.x, z: DUNGEON_EXIT.z - 20, r: 14 },
  { x: 2060, z: 2600, r: 24 },
  { x: 2620, z: 2300, r: 22 },
  { x: 2760, z: 2220, r: 22 },
];

/** Lối đi: sân tông môn theo trục cổng–điện, sơn đạo dọc x=2048 (rộng 7,5 m, chừa thêm hai bên), đường xuống thung lũng. */
function onPath(x: number, z: number): boolean {
  if (Math.abs(x - SECT.x) < 14 && z > 2000 && z < 2140) return true;
  if (Math.abs(x - SECT.x) < 9 && z >= 2136 && z < 2400) return true;
  if (Math.abs(x - SECT.x) < 8 && z >= 2400 && z < 2640) return true;
  if (Math.abs(x - KIEM_TRUNG.x) < 9 && z > KIEM_TRUNG.z + 20 && z < KIEM_TRUNG.z + 90) return true;
  return false;
}

interface Opts {
  minH?: number;
  maxH?: number;
  /** Chênh cao tối đa quanh điểm đặt trong 3 m. */
  slope?: number;
  /** Khoảng cách tối thiểu tới prop đã đặt cùng nhóm. */
  gap?: number;
  s?: [number, number];
  /** Lấy tâm cụm/điểm trên vành khuyên [r0, r1] quanh tâm thay vì đều trong đĩa (bờ hồ). */
  ring?: [number, number];
  /** Cách mép collider thêm (m). */
  pad?: number;
}

function build(): PropInstance[] {
  const out: PropInstance[] = [];
  for (const h of HAND_PROPS) out.push({ id: h.id, x: h.x, y: heightAt(h.x, h.z), z: h.z, yaw: h.yaw, s: h.s });
  const seeds = new Map<string, number>();

  /** Rải `n` prop `id` trong đĩa (cx, cz, R); `clusters` > 0 thì gom thành cụm bán kính `cr`. */
  function scatter(id: string, n: number, cx: number, cz: number, R: number, o: Opts = {}, clusters = 0, cr = 0): void {
    const seed = (seeds.get(id) ?? 0) + 1;
    seeds.set(id, seed);
    const sk = 7919 * seed + id.length * 131;
    const centers: Circle[] = [];
    for (let k = 0; k < clusters; k++) {
      const a = hash01(k, 1, sk) * Math.PI * 2;
      const r = o.ring ? o.ring[0] + hash01(k, 2, sk) * (o.ring[1] - o.ring[0]) : Math.sqrt(hash01(k, 2, sk)) * R;
      centers.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, r: cr });
    }
    const mine: PropInstance[] = [];
    for (let t = 0; mine.length < n && t < n * 80; t++) {
      let x: number;
      let z: number;
      if (centers.length) {
        const c = centers[t % centers.length];
        const a = hash01(t, 3, sk) * Math.PI * 2;
        const r = Math.sqrt(hash01(t, 4, sk)) * c.r;
        x = c.x + Math.cos(a) * r;
        z = c.z + Math.sin(a) * r;
      } else {
        const a = hash01(t, 5, sk) * Math.PI * 2;
        const r = o.ring ? o.ring[0] + hash01(t, 6, sk) * (o.ring[1] - o.ring[0]) : Math.sqrt(hash01(t, 6, sk)) * R;
        x = cx + Math.cos(a) * r;
        z = cz + Math.sin(a) * r;
      }
      const h = heightAt(x, z);
      if (h < (o.minH ?? WATER_Y + 1.5) || h > (o.maxH ?? 300)) continue;
      if (Math.abs(heightAt(x + 3, z) - h) + Math.abs(heightAt(x, z + 3) - h) > (o.slope ?? 3.2)) continue;
      if (onPath(x, z)) continue;
      let bad = false;
      for (const c of KEEP_CLEAR) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) bad = true;
      for (const c of COLLIDERS) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 2 + (o.pad ?? 0)) ** 2) bad = true;
      const g = o.gap ?? 2;
      for (const m of mine) if ((x - m.x) ** 2 + (z - m.z) ** 2 < g * g) bad = true;
      if (bad) continue;
      const [s0, s1] = o.s ?? [0.85, 1.15];
      mine.push({ id, x, y: h, z, yaw: hash01(t, 7, sk) * Math.PI * 2, s: s0 + hash01(t, 8, sk) * (s1 - s0) });
    }
    out.push(...mine);
  }

  // --- 01 Lạc Kiếm Tông: thông và đá nằm ở rìa sân, không giữa sân ---
  const flat = { minH: SECT.y - 6, maxH: SECT.y + 6, slope: 5 };
  scatter('prop_thong_co', 3, SECT.x, SECT.z, 100, { ...flat, gap: 18, pad: 6 });
  scatter('prop_da_nam', 5, SECT.x, SECT.z, 100, { ...flat, gap: 6, pad: 4 }, 2, 8);
  // --- 02 Sơn đạo: sườn quanh đường núi ---
  scatter('prop_thong_co', 4, 2048, 2300, 110, { gap: 16, slope: 7, maxH: 200 });
  scatter('prop_da_dung', 6, 2110, 2250, 80, { gap: 7, slope: 8, maxH: 200 }, 2, 14);
  scatter('prop_da_nam', 12, 2110, 2250, 80, { gap: 5, slope: 7, maxH: 200 }, 4, 12);
  scatter('prop_duong_xi', 40, 2048, 2290, 90, { gap: 2.5, slope: 6, s: [0.9, 1.3], maxH: 200 }, 7, 7);
  // --- 03 Thanh Khê: đảo prop ở rìa, đồng cỏ giữa để trống ---
  scatter('prop_thong_co', 8, VALLEY.x, VALLEY.z, 380, { gap: 22, slope: 5 }, 3, 120);
  scatter('prop_da_nam', 18, VALLEY.x, VALLEY.z, 380, { gap: 5, slope: 5 }, 6, 22);
  scatter('prop_da_dung', 4, VALLEY.x, VALLEY.z, 380, { gap: 8, slope: 6 }, 2, 16);
  for (const z of [2480, 2560, 2630]) {
    const x = 2048 + (z % 120 < 60 ? 11 : -11);
    out.push({ id: 'prop_bia_da', x, y: heightAt(x, z), z, yaw: hash01(z, 1, 66) * 6, s: 1 });
  }
  // --- 04 Rừng Linh Thảo: cổ thụ rìa, trúc thành khóm, dương xỉ dưới tán ---
  scatter('prop_co_thu', 6, FOREST.x, FOREST.z, 420, { gap: 40, slope: 5, s: [0.9, 1.1], pad: 3 });
  scatter('prop_truc', 100, FOREST.x, FOREST.z, 400, { gap: 1.6, slope: 5, s: [0.9, 1.25], pad: 1 }, 20, 6);
  scatter('prop_duong_xi', 140, FOREST.x, FOREST.z, 400, { gap: 2.2, slope: 5, s: [0.9, 1.3] }, 28, 8);
  scatter('prop_da_nam', 15, FOREST.x, FOREST.z, 400, { gap: 5, slope: 5 }, 5, 14);
  scatter('prop_da_dung', 6, FOREST.x, FOREST.z, 420, { gap: 8, slope: 6 }, 2, 16);
  // --- 05 Hồ Sương Mù: đá phiến, lau sát bờ, bờ cao thì thông ---
  // Bờ hồ cách tâm ~225–250 m (xa hơn là sườn núi dốc), nên rải trong đĩa R≈285.
  const shore = { minH: WATER_Y + 1.3, maxH: WATER_Y + 6, ring: [205, 262] as [number, number] };
  scatter('prop_da_phien', 24, LAKE.x, LAKE.z, 285, { ...shore, gap: 8, slope: 5 }, 8, 18);
  scatter('prop_da_nam', 10, LAKE.x, LAKE.z, 285, { ...shore, gap: 6, slope: 6 }, 4, 14);
  scatter('prop_da_dung', 3, LAKE.x, LAKE.z, 290, { minH: WATER_Y + 3, maxH: WATER_Y + 30, gap: 8, slope: 9 }, 1, 12);
  scatter('prop_lau', 90, LAKE.x, LAKE.z, 270, { minH: WATER_Y + 0.4, maxH: WATER_Y + 2.4, gap: 1.6, slope: 4, s: [0.9, 1.25], ring: [200, 250] }, 18, 6);
  scatter('prop_thong_co', 4, LAKE.x, LAKE.z, 300, { minH: WATER_Y + 8, maxH: 110, gap: 18, slope: 8 });
  // --- 06 Kiếm Trủng: kiếm gãy thay vòng kiếm thủ tục, bia ngoài vòng, đá dựng/phiến ---
  out.push(...KIEM_GAY);
  for (const [dx, dz] of [[-58, 40], [58, 40], [-72, -18], [72, -18], [-34, -64], [34, -64]] as const) {
    const x = KIEM_TRUNG.x + dx;
    const z = KIEM_TRUNG.z + dz;
    out.push({ id: 'prop_bia_da', x, y: heightAt(x, z), z, yaw: Math.atan2(-dx, -dz), s: 1 });
  }
  scatter('prop_da_dung', 8, KIEM_TRUNG.x, KIEM_TRUNG.z, 110, { minH: 0, gap: 10, slope: 12, pad: 4 }, 2, 14);
  scatter('prop_da_phien', 12, KIEM_TRUNG.x, KIEM_TRUNG.z, 110, { minH: 0, gap: 6, slope: 8 }, 3, 14);
  return out;
}

/** 46 kiếm gãy Kiếm Trủng, vị trí như vòng kiếm thủ tục cũ (cùng hash), chừa cửa nam và khu giữa để đánh. */
export const KIEM_GAY: readonly PropInstance[] = (() => {
  const out: PropInstance[] = [];
  for (let i = 0; i < 46; i++) {
    const a = hash01(i, 3, 4401) * Math.PI * 2;
    const r = 30 + hash01(i, 5, 4401) * 62;
    const x = KIEM_TRUNG.x + Math.cos(a) * r;
    const z = KIEM_TRUNG.z + Math.sin(a) * r;
    if (Math.abs(x - KIEM_TRUNG.x) < 9 && z > KIEM_TRUNG.z + 20) continue;
    out.push({ id: 'prop_kiem_gay', x, y: heightAt(x, z), z, yaw: hash01(i, 11, 4401) * 6, s: 1.1 + hash01(i, 7, 4401) * 1.1 });
  }
  return out;
})();

let cache: PropInstance[] | null = null;
/** Mọi instance prop (điểm nhấn + rải). Tính một lần. */
export function allProps(): PropInstance[] {
  return (cache ??= build());
}

/** Lưới tra nhanh "gần cây lớn": terrain bỏ cây thủ tục quanh cổ thụ/thông Tripo để không chồng lên nhau. */
let treeGrid: Map<string, Circle[]> | null = null;
const TREE_R: Record<string, number> = { prop_co_thu: 9, prop_thong_co: 7 };
export function nearPropTree(x: number, z: number): boolean {
  if (!treeGrid) {
    treeGrid = new Map();
    for (const p of allProps()) {
      const r = TREE_R[p.id];
      if (!r) continue;
      const k = `${Math.floor(p.x / 32)},${Math.floor(p.z / 32)}`;
      const list = treeGrid.get(k) ?? [];
      list.push({ x: p.x, z: p.z, r: r * p.s });
      treeGrid.set(k, list);
    }
  }
  const gx = Math.floor(x / 32);
  const gz = Math.floor(z / 32);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      for (const c of treeGrid.get(`${gx + i},${gz + j}`) ?? []) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    }
  }
  return false;
}
