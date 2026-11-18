import { LEVELS } from '@dtl/content';
import { scatterVanHai } from './vanHaiScatter';
import { scatterThienKhuyet } from './thienKhuyetArt';
export { scatterVanHai };
import { padsOfLevel, propsOf, terrainOf, COLLIDERS, DUNGEON_EXIT, featureWeight, FOREST, HAND_PROPS, hash01, heightAt, ISLAND_R, KIEM_TRUNG, LAKE, PORTAL_PAD, SECT, SUOI, VACH, VALLEY, WATER_Y, WORLD_SIZE } from '@dtl/shared';

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
  /** Tỉ lệ chiều cao thêm (cây: 0,9–1,12); không có thì bằng 1. */
  sy?: number;
  /** Sắc độ nhẹ theo từng cây: nhân vào màu (cây). */
  tint?: [number, number, number];
  /** Nghiêng quanh trục ngang (rad) sau khi xoay `yaw`: cột đổ, tượng nghiêng (E4-I). */
  lean?: number;
}

interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Vùng cấm đặt prop: lõi spawn quái (R30), vòng NPC (≥4 m), spawn người, cổng, đảo Hàn Giao, lõi Kiếm Trủng, node hái. */
const KEEP_CLEAR: Circle[] = [
  // Tâm mỗi bãi quái (M-1): chừa 5 m để prop không nằm giữa chỗ đứng của cụm.
  ...(LEVELS.van_lam.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: 5 })),
  ...LEVELS.van_lam.spawns.filter((sp) => sp.radius > 4).map((sp) => ({ x: sp.x, z: sp.z, r: 6 })),
  { x: 2048, z: 2030, r: 6 },
  { x: 2004, z: 2064, r: 6 },
  { x: 2092, z: 2064, r: 6 },
  { x: 2048, z: 2088, r: 8 },
  { x: PORTAL_PAD.x, z: PORTAL_PAD.z, r: 24 },
  { x: LAKE.x, z: LAKE.z, r: ISLAND_R + 6 },
  { x: KIEM_TRUNG.x, z: KIEM_TRUNG.z, r: 28 },
  { x: DUNGEON_EXIT.x, z: DUNGEON_EXIT.z - 20, r: 14 },
  // Điểm hái thảo dược.
  ...LEVELS.van_lam.nodes.map((n) => ({ x: n.x, z: n.z, r: 8 })),
];

/** Lối đi: sân tông môn theo trục cổng–điện, sơn đạo dọc x=2048 (rộng 7,5 m, chừa thêm hai bên), đường xuống thung lũng, lối lên cổng bí cảnh. */
function onPath(x: number, z: number): boolean {
  if (Math.abs(x - SECT.x) < 14 && z > 2000 && z < 2140) return true;
  if (Math.abs(x - SECT.x) < 9 && z >= 2136 && z < 2400) return true;
  if (Math.abs(x - SECT.x) < 8 && z >= 2400 && z < 2500) return true;
  if (Math.abs(x - PORTAL_PAD.x) < 8 && z > PORTAL_PAD.z - 20 && z < SECT.z - 95) return true;
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
  scatter('prop_thong_co', 4, 2048, 2250, 90, { gap: 16, slope: 7, maxH: 200 });
  scatter('prop_da_dung', 6, 2110, 2230, 70, { gap: 7, slope: 8, maxH: 200 }, 2, 14);
  scatter('prop_da_nam', 12, 2110, 2230, 70, { gap: 5, slope: 7, maxH: 200 }, 4, 12);
  scatter('prop_duong_xi', 40, 2048, 2250, 80, { gap: 2.5, slope: 6, s: [0.9, 1.3], maxH: 200 }, 7, 7);
  // --- 03 Thanh Khê: đảo prop ở rìa, đồng cỏ giữa để trống ---
  scatter('prop_thong_co', 6, VALLEY.x, VALLEY.z, 150, { gap: 22, slope: 5 }, 3, 50);
  scatter('prop_da_nam', 12, VALLEY.x, VALLEY.z, 150, { gap: 5, slope: 5 }, 5, 18);
  scatter('prop_da_dung', 4, VALLEY.x, VALLEY.z, 150, { gap: 8, slope: 6 }, 2, 14);
  for (const z of [2420, 2450, 2480]) {
    const x = 2048 + (z % 120 < 60 ? 11 : -11);
    out.push({ id: 'prop_bia_da', x, y: heightAt(x, z), z, yaw: hash01(z, 1, 66) * 6, s: 1 });
  }
  // --- 04 Rừng Linh Thảo: cổ thụ rìa, trúc thành khóm, dương xỉ dưới tán ---
  scatter('prop_co_thu', 6, FOREST.x, FOREST.z, 170, { gap: 40, slope: 5, s: [0.9, 1.1], pad: 3 });
  scatter('prop_truc', 95, FOREST.x, FOREST.z, 160, { gap: 1.6, slope: 5, s: [0.9, 1.25], pad: 1 }, 16, 6);
  scatter('prop_duong_xi', 120, FOREST.x, FOREST.z, 160, { gap: 2.2, slope: 5, s: [0.9, 1.3] }, 20, 8);
  scatter('prop_da_nam', 10, FOREST.x, FOREST.z, 160, { gap: 5, slope: 5 }, 4, 12);
  scatter('prop_da_dung', 4, FOREST.x, FOREST.z, 170, { gap: 8, slope: 6 }, 2, 14);
  // --- 04b Suối Thanh Khê: đá phiến bên dòng, dương xỉ, thông lẻ ---
  scatter('prop_da_phien', 10, SUOI.x, SUOI.z, 140, { gap: 8, slope: 6 }, 4, 14);
  scatter('prop_duong_xi', 40, SUOI.x, SUOI.z, 140, { gap: 2.2, slope: 5, s: [0.9, 1.3] }, 10, 8);
  scatter('prop_thong_co', 4, SUOI.x, SUOI.z, 150, { gap: 20, slope: 6 }, 2, 40);
  scatter('prop_da_nam', 8, SUOI.x, SUOI.z, 140, { gap: 5, slope: 6 }, 3, 14);
  // --- 04c Vách Đá Ngọc: đá dựng và đá phiến trên cao nguyên, thông cheo leo ---
  scatter('prop_da_dung', 12, VACH.x, VACH.z, 140, { minH: 60, maxH: 400, gap: 8, slope: 10, pad: 2 }, 4, 18);
  scatter('prop_da_phien', 8, VACH.x, VACH.z, 140, { minH: 60, maxH: 400, gap: 6, slope: 8 }, 3, 14);
  scatter('prop_thong_co', 4, VACH.x, VACH.z, 150, { minH: 60, maxH: 400, gap: 20, slope: 9 }, 2, 40);
  // --- 05 Hồ Sương Mù: đá phiến, lau sát bờ, bờ cao thì thông ---
  // Bãi ven hồ (dải phẳng) cách tâm ~150–215 m, xa hơn là sườn núi dốc.
  const shore = { minH: WATER_Y + 1.3, maxH: WATER_Y + 6, ring: [155, 210] as [number, number] };
  scatter('prop_da_phien', 20, LAKE.x, LAKE.z, 230, { ...shore, gap: 8, slope: 5 }, 8, 18);
  scatter('prop_da_nam', 8, LAKE.x, LAKE.z, 230, { ...shore, gap: 6, slope: 6 }, 4, 14);
  scatter('prop_da_dung', 3, LAKE.x, LAKE.z, 235, { minH: WATER_Y + 3, maxH: WATER_Y + 30, gap: 8, slope: 9 }, 1, 12);
  scatter('prop_lau', 70, LAKE.x, LAKE.z, 230, { minH: WATER_Y + 0.4, maxH: WATER_Y + 4, gap: 1.6, slope: 4, s: [0.9, 1.25], ring: [150, 205] }, 14, 6);
  scatter('prop_thong_co', 4, LAKE.x, LAKE.z, 240, { minH: WATER_Y + 8, maxH: 110, gap: 18, slope: 8 });
  // --- 06 Kiếm Trủng: kiếm gãy thay vòng kiếm thủ tục, bia ngoài vòng, đá dựng/phiến ---
  out.push(...KIEM_GAY);
  for (const [dx, dz] of [[-58, 40], [58, 40], [-72, -18], [72, -18], [-34, -64], [34, -64]] as const) {
    const x = KIEM_TRUNG.x + dx;
    const z = KIEM_TRUNG.z + dz;
    out.push({ id: 'prop_bia_da', x, y: heightAt(x, z), z, yaw: Math.atan2(-dx, -dz), s: 1 });
  }
  scatter('prop_da_dung', 8, KIEM_TRUNG.x, KIEM_TRUNG.z, 110, { minH: 0, gap: 10, slope: 12, pad: 4 }, 2, 14);
  scatter('prop_da_phien', 12, KIEM_TRUNG.x, KIEM_TRUNG.z, 110, { minH: 0, gap: 6, slope: 8 }, 3, 14);
  scatterTrees(out);
  return out;
}

/** Loài cây (P2-A4b): mọi prop id ở đây dùng impostor khi xa. */
export const TREE_IDS = ['prop_co_thu', 'prop_thong_co', 'prop_soi_nui', 'prop_anh_dao', 'prop_phong_do'] as const;
/** Tỉ lệ cơ sở theo loài (1 = đúng kích thước asset): cổ thụ to, anh đào nhỏ. */
const TREE_SCALE: Record<string, [number, number]> = {
  prop_co_thu: [0.8, 1.05],
  prop_thong_co: [0.85, 1.25],
  prop_soi_nui: [0.8, 1.2],
  prop_anh_dao: [0.85, 1.2],
  prop_phong_do: [0.85, 1.2],
};
/** `?trees=legacy` (hoặc 0) về cây thủ tục cũ của terrain để so ảnh trước/sau. */
export const LEGACY_TREES = typeof location !== 'undefined' && ['0', 'legacy'].includes(new URLSearchParams(location.search).get('trees') ?? '');
const TREE_CELL = 24;

/**
 * Rải cây Tripo thay cây thủ tục (quả cầu xanh/cam, anh đào cầu hồng, nón thông) của terrain: cùng lưới ô và cùng
 * bảng mật độ theo khu như `buildVegetation`, nhưng ô 24 m (cây Tripo to gấp ~2 lần) và chọn loài theo khu:
 * sân tông môn anh đào/thông; rừng Linh Thảo sồi/phong/cổ thụ; thung lũng Thanh Khê sồi/anh đào/thông; hồ sồi/phong/thông.
 */
function scatterTrees(out: PropInstance[]): void {
  if (LEGACY_TREES) return;
  const big = out.filter((p) => p.id === 'prop_co_thu' || p.id === 'prop_thong_co');
  const n = WORLD_SIZE / TREE_CELL;
  for (let gz = 0; gz < n; gz++) {
    for (let gx = 0; gx < n; gx++) {
     // Lượt 1 chỉ cho rừng Linh Thảo: thêm một cây ứng viên mỗi ô (mật độ cao hơn, cây gần nhau hơn).
     for (let pass = 0; pass < 2; pass++) {
      const off = pass * 1009;
      const r1 = hash01(gx, gz, 211 + off);
      const r2 = hash01(gx, gz, 223 + off);
      const r3 = hash01(gx, gz, 237 + off);
      const r4 = hash01(gx, gz, 253 + off);
      const r5 = hash01(gx, gz, 269 + off);
      const x = (gx + 0.12 + r1 * 0.76) * TREE_CELL;
      const z = (gz + 0.12 + r2 * 0.76) * TREE_CELL;
      const h = heightAt(x, z);
      if (h < WATER_Y + 1.4 || h > 285) continue;
      if (featureWeight(PORTAL_PAD, x, z) > 0.85 || featureWeight(KIEM_TRUNG, x, z) > 0.25) continue;
      const wSect = featureWeight(SECT, x, z);
      const wForest = featureWeight(FOREST, x, z);
      const wValley = featureWeight(VALLEY, x, z);
      const wLake = featureWeight(LAKE, x, z);
      const wSuoi = featureWeight(SUOI, x, z);
      if (pass === 1 && (wForest <= 0.12 || wSect > 0.8)) continue;
      const slope = Math.abs(heightAt(x + 3, z) - h) + Math.abs(heightAt(x, z + 3) - h);
      if (slope > 5.5) continue;
      let id: (typeof TREE_IDS)[number];
      if (wSect > 0.8) {
        // Trong tông môn: hàng anh đào/thông quanh rìa sân, không mọc giữa sân.
        const d = Math.hypot(x - SECT.x, z - SECT.z);
        if (d < 62 || d > 108 || r3 > 0.62 || Math.abs(x - SECT.x) < 9) continue;
        id = r5 < 0.72 ? 'prop_anh_dao' : 'prop_thong_co';
      } else {
        let density = 0.3;
        // Rừng: lõi dày, rìa (wForest 0,12–0,3) thưa hơn nhưng vẫn có cây; lượt 1 thêm cây ở cả hai.
        if (wForest > 0.12) density = (wForest > 0.3 ? 0.8 : 0.4) * (pass ? 0.5 : 1);
        else if (wValley > 0.4 || wSuoi > 0.4) density = 0.2;
        else if (wLake > 0.3) density = 0.2;
        if (h > 200) density *= 0.5;
        if (r3 > density * 0.9) continue;
        const high = h > 150;
        if (wForest > 0.12) id = high || r5 > 0.81 ? 'prop_thong_co' : r5 < 0.5 ? 'prop_soi_nui' : r5 < 0.74 ? 'prop_phong_do' : 'prop_co_thu';
        else if (wValley > 0.4 || wSuoi > 0.4) id = r5 < 0.58 ? 'prop_soi_nui' : r5 < 0.72 ? 'prop_anh_dao' : r5 < 0.8 ? 'prop_phong_do' : 'prop_thong_co';
        else if (wLake > 0.3) id = r5 < 0.42 ? 'prop_soi_nui' : r5 < 0.62 ? 'prop_thong_co' : r5 < 0.8 ? 'prop_phong_do' : 'prop_anh_dao';
        else if (high || r4 > 0.55) id = 'prop_thong_co';
        else id = r5 < 0.74 ? 'prop_soi_nui' : r5 < 0.88 ? 'prop_phong_do' : 'prop_anh_dao';
      }
      if (onPath(x, z)) continue;
      let bad = false;
      for (const c of KEEP_CLEAR) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) bad = true;
      for (const c of COLLIDERS) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 5) ** 2) bad = true;
      for (const b of big) if ((x - b.x) ** 2 + (z - b.z) ** 2 < (7 * b.s + 5) ** 2) bad = true;
      if (bad) continue;
      const [s0, s1] = TREE_SCALE[id];
      const sc = s0 + hash01(gx, gz, 281 + off) * (s1 - s0);
      // Sắc độ nhẹ: sáng/tối và lệch ấm–lạnh vài phần trăm, để rừng không đơn điệu.
      const b = 0.88 + hash01(gx, gz, 293 + off) * 0.2;
      const w = (hash01(gx, gz, 307 + off) - 0.5) * 0.12;
      let tint: [number, number, number] = [b * (1 + w), b, b * (1 - w)];
      if (id === 'prop_phong_do') {
        // Phong đỏ (đã giảm bão hòa ở texture, meta import.grade): thêm biến thể sáng và độ cam theo từng cây.
        const orange = hash01(gx, gz, 347 + off);
        tint = [b * (1.02 - orange * 0.06), b * (0.95 + orange * 0.3), b * (0.95 + orange * 0.1)];
      }
      out.push({
        id,
        x,
        y: h - 0.15 * sc,
        z,
        yaw: hash01(gx, gz, 317 + off) * Math.PI * 2,
        s: sc,
        sy: 0.92 + hash01(gx, gz, 331 + off) * 0.2,
        tint,
      });
     }
    }
  }
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
export function allProps(level = 'van_lam'): PropInstance[] {
  if (level === 'van_lam' || level === 'kiem_trung') return (cache ??= build());
  // Bản đồ mở rộng (E2-A): prop đặt tay của level (`propsOf`), cao độ theo địa hình riêng; Đoạn Mạch (E2-I) thêm đá và cây khô rải tự động.
  let list = levelCache.get(level);
  if (!list) {
    const tr = terrainOf(level);
    list = propsOf(level).map((h) => ({ id: h.id, x: h.x, y: tr.heightAt(h.x, h.z), z: h.z, yaw: h.yaw, s: h.s }));
    if (level === 'doan_mach') list.push(...scatterDoanMach(list));
    if (level === 'van_hai') list.push(...scatterVanHai(list));
    if (level === 'thien_khuyet') list.push(...scatterTk(list));
    levelCache.set(level, list);
  }
  return list;
}
const levelCache = new Map<string, PropInstance[]>();

/**
 * Đá và cây khô rải ở Đoạn Mạch Cổ Cốc (E2-I): lưới ô 24 m, xác định, chỉ để tô cảnh (không va chạm, như prop rải của Vân Lam).
 * Dùng lại GLB đã có (đá Vân Lam nhuộm ấm, `prop_cay_goc_kho` của PROP_LIB); tránh tâm cụm quái, tinh anh, trạm, điểm nhấn, điểm hái.
 */
const DM_ROCKS = ['prop_da_nam', 'prop_da_dung', 'prop_da_phien'] as const;
export function scatterDoanMach(placed: readonly PropInstance[]): PropInstance[] {
  const L = LEVELS.doan_mach;
  const tr = terrainOf('doan_mach');
  const clear: Circle[] = [
    { x: L.spawn?.x ?? 1024, z: L.spawn?.z ?? 1036, r: 46 },
    ...(L.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: 6 })),
    ...L.spawns.filter((sp) => sp.radius > 4).map((sp) => ({ x: sp.x, z: sp.z, r: sp.radius + 4 })),
    ...(L.pois ?? []).map((p) => ({ x: p.x, z: p.z, r: 12 })),
    ...L.nodes.map((n) => ({ x: n.x, z: n.z, r: 6 })),
    ...placed.map((p) => ({ x: p.x, z: p.z, r: 4 })),
  ];
  const b = tr.playBounds;
  const out: PropInstance[] = [];
  const CELL = 24;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const r0 = hash01(gx, gz, 4711);
      const x = (gx + 0.12 + hash01(gx, gz, 4723) * 0.76) * CELL;
      const z = (gz + 0.12 + hash01(gx, gz, 4733) * 0.76) * CELL;
      if (x < b.x0 + 8 || x > b.x1 - 8 || z < b.z0 + 8 || z > b.z1 - 8) continue;
      // Đám đá/cây khô theo nhiễu: thưa ở chỗ trống, dày hơn dọc sườn.
      const n = 0.5 + (hash01(Math.floor(gx / 3), Math.floor(gz / 3), 4751) - 0.5) * 0.9;
      const rock = r0 < 0.16 * (0.4 + n);
      const tree = !rock && r0 > 1 - 0.045 * (0.2 + n * 1.3);
      if (!rock && !tree) continue;
      const h = tr.heightAt(x, z);
      const slope = Math.abs(tr.heightAt(x + 3, z) - h) + Math.abs(tr.heightAt(x, z + 3) - h);
      if (slope > (tree ? 4 : 7)) continue;
      let bad = false;
      for (const c of clear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) bad = true;
      for (const c of tr.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 3) ** 2) bad = true;
      if (bad) continue;
      const k = hash01(gx, gz, 4783);
      const warm = 0.92 + hash01(gx, gz, 4793) * 0.16;
      if (tree) {
        out.push({ id: 'prop_cay_goc_kho', x, y: h - 0.1, z, yaw: k * Math.PI * 2, s: 0.8 + hash01(gx, gz, 4799) * 0.45, sy: 0.92 + k * 0.2, tint: [warm * 1.04, warm * 0.96, warm * 0.86] });
      } else {
        const id = DM_ROCKS[Math.floor(hash01(gx, gz, 4801) * DM_ROCKS.length)];
        out.push({ id, x, y: h - 0.1, z, yaw: k * Math.PI * 2, s: 0.7 + hash01(gx, gz, 4799) * 0.9, tint: [warm * 1.12, warm * 0.94, warm * 0.78] });
      }
    }
  }
  return out;
}

/** Đá vỡ, cột đổ, tượng nghiêng ở Thiên Khuyết (E4-I): vòng cấm như Đoạn Mạch, phần tính ở `thienKhuyetArt.ts`. */
function scatterTk(placed: readonly PropInstance[]): PropInstance[] {
  const L = LEVELS.thien_khuyet;
  const tr = terrainOf('thien_khuyet');
  const clear: Circle[] = [
    { x: L.spawn?.x ?? 1024, z: L.spawn?.z ?? 1036, r: 60 },
    ...(L.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: 6 })),
    ...L.spawns.filter((sp) => sp.radius > 4).map((sp) => ({ x: sp.x, z: sp.z, r: sp.radius + 4 })),
    ...(L.pois ?? []).map((p) => ({ x: p.x, z: p.z, r: 14 })),
    ...L.nodes.map((n) => ({ x: n.x, z: n.z, r: 6 })),
    ...placed.map((p) => ({ x: p.x, z: p.z, r: 5 })),
  ];
  return scatterThienKhuyet({ def: tr.def, bounds: tr.playBounds, heightAt: (x, z) => tr.heightAt(x, z), clear, colliders: tr.colliders }).map((r) => ({
    id: r.id,
    x: r.x,
    y: tr.heightAt(r.x, r.z) - r.sink,
    z: r.z,
    yaw: r.yaw,
    s: r.s,
    lean: r.lean,
    tint: r.tint,
  }));
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
