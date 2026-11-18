// Sinh dữ liệu bản đồ Bắc Hoang Tẫn Nguyên (DV-1, chương 5), tất định theo seed:
//   packages/content/data/levels/bac_hoang.terrain.json  (TerrainDef)
//   packages/content/data/levels/bac_hoang.json          (LevelDef: zones, camps, spawns, pois, spots, nodes, spawn)
//   packages/shared/src/props.bachoang.ts                (prop bày)
//   packages/shared/src/teleport.bachoang.ts             (trận truyền tống bh_*)
// Chạy: node tools/maps/gen-bac-hoang.mjs   (rồi pnpm content:check, pnpm map:report --level bac_hoang)
// Tọa độ trong bảng là offset (m) so với TÂM bản đồ (1024, 1024); +x đông, +z nam, Bắc là -z (docs/DIVUC_DESIGN.md mục 4.1).
// Vọng Bắc Trạm ở (0, +520), Giới Khích chạy nam → bắc dọc trục x = 0 từ Khích Giai (z = -40) tới Trấn Giới Đài (z = -600).
// Quái trong bảng MIX/ELITES là CHỖ ĐỨNG TẠM (quái chương 4 có sẵn) tới khi DV-2/DV3-B có quái Dị Vực: đổi id ở đó (vị trí không đổi).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = 1024;
const SEED = 20261118;
const PLAY = { cx: C, cz: C - 90, half: 760 };
const BOX = { x0: -720, x1: 720, z0: -810, z1: 630 }; // vùng chia cho các vùng săn (offset), cách chân vách >= 40 m
const TRAM = [0, 520]; // Vọng Bắc Trạm (an toàn)
const R_IN = 75;
// Cấp thiết kế 28–31 (zone.lv ở bảng ZONES), nhưng MAX_LEVEL hiện là 28 (thang 29–32 là DV1-D): kẹp ở đây, bỏ kẹp khi DV1-D nâng trần.
const LV_CAP = 28;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(SEED);
const W = (o) => Math.round(C + o);

// ---- vùng: ô Voronoi có trọng số (power diagram) quanh tâm thiết kế, cắt bởi hộp chơi và đĩa trạm ----
const ZONES = [
  { id: 'han_hoi_nguyen', c: [300, 260], w: 215, lv: [28, 28], color: '#8C8580', camps: 11 },
  { id: 'kho_loc_lam', c: [-320, 220], w: 205, lv: [28, 29], color: '#6B7A6A', camps: 11 },
  { id: 'khich_giai', c: [0, -40], w: 185, lv: [29, 29], color: '#6B3FA0', camps: 9 },
  { id: 'xich_tan_binh', c: [340, -330], w: 215, lv: [29, 30], color: '#C4412B', camps: 12 },
  { id: 'kim_da_ngoai_uyen', c: [-340, -340], w: 215, lv: [30, 31], color: '#B8923A', camps: 12 },
  { id: 'tran_gioi_dai', c: [0, -600], w: 175, lv: [31, 31], color: '#241634', camps: 8 },
];
for (const z of ZONES) z.lvDesign = [...z.lv];
for (const z of ZONES) z.lv = z.lv.map((v) => Math.min(v, LV_CAP));
const inBox = (x, z) => x >= BOX.x0 && x <= BOX.x1 && z >= BOX.z0 && z <= BOX.z1;
const cellOf = (x, z) => {
  if (!inBox(x, z) || Math.hypot(x - TRAM[0], z - TRAM[1]) < R_IN) return null;
  let best = null;
  let bd = Infinity;
  for (const zn of ZONES) {
    const d = (x - zn.c[0]) ** 2 + (z - zn.c[1]) ** 2 - zn.w ** 2;
    if (d < bd) {
      bd = d;
      best = zn;
    }
  }
  return best;
};
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1;
  let md = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    const d = Math.abs(dz * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > md) {
      md = d;
      idx = i;
    }
  }
  if (md > eps) return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
  return [a, b];
}
for (const zn of ZONES) {
  const pts = [];
  const N = 120;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let lo = 0;
    let hi = 1;
    for (let r = 3; r < 1600; r += 3) {
      const cz = cellOf(zn.c[0] + dx * r, zn.c[1] + dz * r);
      if (cz === zn) lo = r;
      else {
        hi = r;
        break;
      }
    }
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      if (cellOf(zn.c[0] + dx * m, zn.c[1] + dz * m) === zn) lo = m;
      else hi = m;
    }
    pts.push([zn.c[0] + dx * lo, zn.c[1] + dz * lo]);
  }
  const h = pts.length >> 1;
  zn.off = [...rdp(pts.slice(0, h + 1), 1.6).slice(0, -1), ...rdp([...pts.slice(h), pts[0]], 1.6).slice(0, -1)];
  zn.poly = zn.off.map(([x, z]) => [W(x), W(z)]);
}
const inPolyOff = (poly, x, z) => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
};
const distEdge = (poly, x, z) => {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    m = Math.min(m, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return m;
};
const zoneOfOffset = (x, z, margin = 0) => {
  for (const zn of ZONES) if (inPolyOff(zn.off, x, z) && (margin <= 0 || distEdge(zn.off, x, z) >= margin)) return zn;
  return null;
};
const polyAreaOf = (poly) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0)) / 2;
for (const z of ZONES) console.log(z.id, 'diện tích', (polyAreaOf(z.off) / 1e6).toFixed(3), 'km²', z.off.length, 'đỉnh');

// ---- trận truyền tống ----
// Ba vùng bắc: trận cách Trấn Giới Bia gần nhất 12–18 m (docs/DIVUC_DESIGN.md 4.3). Trận trạm bh_tp_tram nhận khách từ Ngoại Thành Trạm (Thiên Khuyết).
const PADS = [
  { id: 'bh_tp_tram', zone: '', off: [0, 486] },
  { id: 'bh_tp_han_hoi', zone: 'han_hoi_nguyen', off: [180, 330] },
  { id: 'bh_tp_kho_loc', zone: 'kho_loc_lam', off: [-190, 330] },
  { id: 'bh_tp_khich_giai', zone: 'khich_giai', off: [-60, 60] },
  { id: 'bh_tp_xich_tan', zone: 'xich_tan_binh', off: [300, -284] },
  { id: 'bh_tp_kim_da', zone: 'kim_da_ngoai_uyen', off: [-300, -284] },
  { id: 'bh_tp_tran_gioi', zone: 'tran_gioi_dai', off: [0, -516] },
];
for (const p of PADS) if (p.zone && zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('trận ngoài vùng: ' + p.id);

// ---- Trấn Giới Bia (chỉ vị trí; cơ chế giới áp/thắp bia là DV3-C): hai ở Xích Tẫn Bình, hai ở Kim Dạ Ngoại Uyển, một ở Trấn Giới Đài ----
const STELES = [
  { id: 'tran_gioi_bia_1', zone: 'xich_tan_binh', off: [300, -300] },
  { id: 'tran_gioi_bia_2', zone: 'xich_tan_binh', off: [410, -250] },
  { id: 'tran_gioi_bia_3', zone: 'kim_da_ngoai_uyen', off: [-300, -300] },
  { id: 'tran_gioi_bia_4', zone: 'kim_da_ngoai_uyen', off: [-410, -250] },
  { id: 'tran_gioi_bia_5', zone: 'tran_gioi_dai', off: [0, -530] },
];
for (const b of STELES) if (zoneOfOffset(b.off[0], b.off[1])?.id !== b.zone) throw new Error('bia ngoài vùng: ' + b.id);
for (const p of PADS) {
  const bs = STELES.filter((b) => b.zone === p.zone);
  if (bs.length && !bs.some((b) => { const d = Math.hypot(b.off[0] - p.off[0], b.off[1] - p.off[1]); return d >= 12 && d <= 18; })) throw new Error('trận không cách bia 12–18 m: ' + p.id);
}

// ---- điểm đáng chú ý (mỗi vùng một điểm) ----
const POIS = [
  { id: 'diet_mach_khau', zone: 'han_hoi_nguyen', off: [350, 230] },
  { id: 'tan_mach_nhan', zone: 'kho_loc_lam', off: [-340, 190] },
  { id: 'gioi_khich', zone: 'khich_giai', off: [0, -150] },
  { id: 'cong_xich_tan_khich', zone: 'xich_tan_binh', off: [350, -400] },
  { id: 'cong_kim_da_cung', zone: 'kim_da_ngoai_uyen', off: [-350, -410] },
  { id: 'tran_gioi_bia', zone: 'tran_gioi_dai', off: [60, -470] },
];
for (const p of POIS) if (zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('poi ngoài vùng: ' + p.id);
const BOSS = { off: [0, -90] }; // Tam Thủ Ngục Khuyển gác miệng nam Giới Khích
const BOSS2 = { off: [0, -650] }; // chỗ để dành cho Thủ Khích Dực Chủ (DV3-D): chưa có quái, chỉ giữ trống đấu trường

// ---- Giới Khích: khe chạy nam → bắc dọc trục giữa, hơi lượn (offset x theo z) ----
const RIFT_Z0 = -190;
const RIFT_Z1 = -590;
const RX = (z) => 18 * Math.sin((z + 190) / 70) * Math.min(1, (RIFT_Z0 - z) / 40);

// ---- prop (chỉ dùng asset sẵn có; kiến trúc dị vực là DV3-I) ----
const LIB_COLL = {
  prop_tru_da_khac_van: [[0, 0, 1.4]],
  prop_cay_goc_kho: [[0, 0, 0.9]],
  prop_da_dung: [[0, 0, 1.2]],
};
const props = [];
const colliders = [];
const addProp = (id, ox, oz, yaw, s = 1) => {
  const p = { id, x: W(ox), z: W(oz), yaw: Math.round(yaw * 100) / 100, s: Math.round(s * 100) / 100 };
  props.push(p);
  const cs = Math.cos(p.yaw);
  const sn = Math.sin(p.yaw);
  for (const [lx, lz, r] of LIB_COLL[id] ?? []) colliders.push({ x: Math.round((p.x + (lx * cs + lz * sn) * p.s) * 100) / 100, z: Math.round((p.z + (-lx * sn + lz * cs) * p.s) * 100) / 100, r: Math.round(r * p.s * 100) / 100 });
};
const ring = (p, ids, rMin, spread) =>
  ids.forEach((id, i) => {
    const a = (i / ids.length) * Math.PI * 2 + R() * 0.5;
    const r = rMin + R() * spread;
    addProp(id, p.off[0] + Math.cos(a) * r, p.off[1] + Math.sin(a) * r, R() * Math.PI * 2, 0.9 + R() * 0.25);
  });
const LAMP = 'prop_den_long_troi';
const COL = 'prop_tru_da_khac_van';
const ROCK = 'prop_da_dung';
const STUMP = 'prop_cay_goc_kho';
const SWORD = 'prop_kiem_gay';
const STONE = 'prop_bia_da';
// Vọng Bắc Trạm: đèn, lò đan, bia tàn niệm
for (const [x, z] of [[-14, -20], [14, -20], [-26, 14], [26, 14], [0, -50]]) addProp(LAMP, TRAM[0] + x, TRAM[1] + z, 0, 1);
addProp('prop_ngung_dan_lo', TRAM[0] + 14, TRAM[1] + 10, 0.6, 1);
addProp(STONE, TRAM[0] - 16, TRAM[1] + 12, 0.2, 1);
// hai bên Giới Khích: trụ gãy và kiếm gãy dọc mép khe, đá lộ; xác định theo seed
for (let z = RIFT_Z0 - 30; z >= RIFT_Z1 + 20; z -= 48) {
  const rx = RX(z);
  for (const side of [-1, 1]) {
    const off = 36 + R() * 14;
    addProp(R() < 0.45 ? COL : R() < 0.5 ? ROCK : SWORD, rx + side * off, z + (R() - 0.5) * 16, R() * Math.PI * 2, 0.9 + R() * 0.3);
  }
}
// POI
const around = {
  diet_mach_khau: [ROCK, ROCK, STUMP, STUMP, SWORD, STONE, LAMP],
  tan_mach_nhan: [STUMP, STUMP, STUMP, STUMP, ROCK, STONE, LAMP, LAMP],
  gioi_khich: [COL, COL, ROCK, ROCK, SWORD, SWORD, LAMP, LAMP],
  cong_xich_tan_khich: [COL, COL, COL, ROCK, ROCK, SWORD, LAMP, LAMP],
  cong_kim_da_cung: [COL, COL, COL, ROCK, SWORD, SWORD, LAMP, LAMP],
  tran_gioi_bia: [COL, COL, ROCK, ROCK, SWORD, STONE, LAMP, LAMP],
};
for (const p of POIS) ring(p, around[p.id], 5, 5);
// Trấn Giới Bia: bia đá cao + đèn quanh
for (const b of STELES) {
  addProp(STONE, b.off[0], b.off[1], R() * 0.4, 1.3);
  [[-5, 5], [5, 5]].forEach(([dx, dz]) => addProp(LAMP, b.off[0] + dx, b.off[1] + dz, 0, 1));
}

// ---- tinh anh (chỗ đứng tạm, xem đầu tệp): 13 con (2/2/2/2/3/2) ----
const ELITES = [
  { zone: 'han_hoi_nguyen', mon: 'elite_cot_kiem_thong_linh', n: 2 },
  { zone: 'kho_loc_lam', mon: 'elite_da_minh_loc_vuong', n: 2 },
  { zone: 'khich_giai', mon: 'elite_cot_kiem_thong_linh', n: 2 },
  { zone: 'xich_tan_binh', mon: 'elite_thach_tuong_dai_tuong', n: 2 },
  { zone: 'kim_da_ngoai_uyen', mon: 'elite_thach_tuong_dai_tuong', n: 3 },
  { zone: 'tran_gioi_dai', mon: 'elite_cot_kiem_thong_linh', n: 2 },
];

const keep = [];
for (const p of PADS) keep.push({ x: p.off[0], z: p.off[1], r: 10 });
for (const p of POIS) keep.push({ x: p.off[0], z: p.off[1], r: 16 });
keep.push({ x: TRAM[0], z: TRAM[1], r: R_IN });
keep.push({ x: BOSS.off[0], z: BOSS.off[1], r: 38 });
keep.push({ x: BOSS2.off[0], z: BOSS2.off[1], r: 38 });
for (const b of STELES) keep.push({ x: b.off[0], z: b.off[1], r: 10 });
for (let z = RIFT_Z0; z >= RIFT_Z1; z -= 24) keep.push({ x: RX(z), z, r: 16 }); // lòng khe không đặt bãi quái

const spawns = [];
const eliteAt = [];
for (const e of ELITES) {
  const zn = ZONES.find((z) => z.id === e.zone);
  for (let i = 0; i < e.n; i++) {
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 500; k++) {
      const x = BOX.x0 + R() * (BOX.x1 - BOX.x0);
      const z = BOX.z0 + R() * (BOX.z1 - BOX.z0);
      if (zoneOfOffset(x, z, 30) !== zn) continue;
      if (keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 40)) continue;
      const d = Math.min(...eliteAt.map((q) => Math.hypot(q.x - x, q.z - z)), 9999);
      if (d > bestD) {
        bestD = d;
        best = [x, z];
      }
    }
    eliteAt.push({ x: best[0], z: best[1] });
    spawns.push({ mon: e.mon, x: W(best[0]), z: W(best[1]), radius: 10, count: 1, levelMin: zn.lv[1], levelMax: zn.lv[1], respawn: 240 });
    keep.push({ x: best[0], z: best[1], r: 10 });
  }
}

// ---- boss ngoài trời: Tam Thủ Ngục Khuyển (DV-B) gác miệng nam Giới Khích, hồi sinh 30 phút ----
spawns.push({ mon: 'boss_tam_thu_nguc_khuyen', x: W(BOSS.off[0]), z: W(BOSS.off[1]), radius: 6, count: 1, levelMin: Math.min(29, LV_CAP), levelMax: Math.min(29, LV_CAP), respawn: 1800 });

// ---- camp (rải điểm xa nhất như Đoạn Mạch) ----
const TARGET_CAMPS = 66;
const TARGET_DENSITY = 120;
const CAMP_R = 30;
const MIX = {
  han_hoi_nguyen: [['mon_co_thanh_chien_ma', 1]], // đứng chỗ Liệt Hỏa Ma Ngưu (DV-2)
  kho_loc_lam: [['mon_da_minh_loc', 0.6], ['mon_co_thanh_chien_ma', 0.4]], // U Ảnh Cốt Lộc ← Dạ Minh Lộc
  khich_giai: [['mon_da_minh_loc', 0.5], ['mon_cot_ve_kiem_thu', 0.5]],
  xich_tan_binh: [['mon_cot_ve_kiem_thu', 0.5], ['mon_co_thanh_chien_ma', 0.5]],
  kim_da_ngoai_uyen: [['mon_cot_ve_kiem_thu', 0.5], ['mon_da_minh_loc', 0.5]],
  tran_gioi_dai: [['mon_cot_ve_kiem_thu', 1]],
};
const pick = (list) => {
  let t = R();
  for (const [m, w] of list) if ((t -= w) <= 0) return m;
  return list[list.length - 1][0];
};
const need = [];
const cand = [];
for (let x = BOX.x0; x <= BOX.x1; x += 10)
  for (let z = BOX.z0; z <= BOX.z1; z += 10) {
    const zn = zoneOfOffset(x, z);
    if (!zn) continue;
    if (Math.hypot(x - BOSS.off[0], z - BOSS.off[1]) < 38 || Math.hypot(x - BOSS2.off[0], z - BOSS2.off[1]) < 38) continue; // đấu trường trống không tính độ phủ
    need.push([x, z, 9999]);
    if (zoneOfOffset(x, z, 8) === zn && !keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + CAMP_R + 6)) cand.push([x, z, zn]);
  }
const needC = need.filter((q) => Math.round(q[0] / 10) % 2 === 0 && Math.round(q[1] / 10) % 2 === 0);
const candC = cand.filter((c) => Math.round(c[0] / 10) % 2 === 0 && Math.round(c[1] / 10) % 2 === 0);
const dEdge = (x, z, c) => Math.max(0, Math.hypot(c.ox - x, c.oz - z) - CAMP_R);
const worstOf = (list) => {
  let m = 0;
  for (const q of needC) {
    let b = Infinity;
    for (const c of list) b = Math.min(b, dEdge(q[0], q[1], c));
    if (b > m) m = b;
  }
  return m;
};
const mkCamp = (x, z, zn) => {
  const lv = zn.lv[0] + (zn.lv[1] > zn.lv[0] && R() < 0.5 ? 1 : 0);
  return { id: '', zone: zn.id, mon: pick(MIX[zn.id]), x: W(x), z: W(z), count: 3, radius: CAMP_R, levelMin: lv, levelMax: Math.min(zn.lv[1], lv + (zn.lv[1] > lv ? 1 : 0)), respawn: 45, ox: x, oz: z };
};
function lattice(sp, th, ox, oz) {
  const out = [];
  const c = Math.cos(th);
  const sn = Math.sin(th);
  for (let i = -14; i <= 14; i++)
    for (let j = -14; j <= 14; j++) {
      const lx = (i + (j % 2 ? 0.5 : 0)) * sp + ox;
      const lz = j * sp * 0.866 + oz;
      const x = lx * c - lz * sn;
      const z = lx * sn + lz * c - 90;
      if (x < BOX.x0 - 60 || x > BOX.x1 + 60 || z < BOX.z0 - 60 || z > BOX.z1 + 60) continue;
      let best = null;
      let bd = 70;
      for (const q of candC) {
        const d = Math.hypot(q[0] - x, q[1] - z);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      if (!best || out.some((o) => Math.hypot(o.ox - best[0], o.oz - best[1]) < CAMP_R * 1.3)) continue;
      out.push(mkCamp(best[0], best[1], best[2]));
    }
  return out;
}
let bestSet = null;
let bestScore = Infinity;
for (let sp = 170; sp <= 225; sp += 5)
  for (let th = 0; th < 60; th += 10)
    for (let ox = 0; ox < sp; ox += sp / 4)
      for (let oz = 0; oz < sp * 0.866; oz += (sp * 0.866) / 4) {
        const set = lattice(sp, (th * Math.PI) / 180, ox, oz);
        if (set.length > TARGET_CAMPS) continue;
        const w = worstOf(set);
        if (w < bestScore) {
          bestScore = w;
          bestSet = set;
        }
      }
const camps = bestSet;
console.log('lưới:', camps.length, 'cụm, điểm xa nhất (lưới thô)', bestScore.toFixed(1), 'm');
const relocate = () => {
  for (let i = 0; i < camps.length; i++) {
    const others = camps.filter((_, j) => j !== i);
    const om = needC.map((q) => Math.min(...others.map((c) => dEdge(q[0], q[1], c)), 9999));
    const cost = (x, z) => {
      let f = 0;
      for (let k = 0; k < needC.length; k++) {
        const d = Math.min(om[k], Math.max(0, Math.hypot(needC[k][0] - x, needC[k][1] - z) - CAMP_R));
        if (d > 40) f += (d - 40) ** 4;
      }
      return f;
    };
    let best = null;
    let bf = cost(camps[i].ox, camps[i].oz);
    for (const [x, z, zn] of candC) {
      if (Math.hypot(x - camps[i].ox, z - camps[i].oz) > 90) continue;
      if (others.some((c) => Math.hypot(c.ox - x, c.oz - z) < CAMP_R * 1.3)) continue;
      const f = cost(x, z);
      if (f < bf) {
        bf = f;
        best = [x, z, zn];
      }
    }
    if (best) {
      const nc = mkCamp(best[0], best[1], best[2]);
      Object.assign(camps[i], { zone: nc.zone, mon: nc.mon, x: nc.x, z: nc.z, ox: nc.ox, oz: nc.oz, levelMin: nc.levelMin, levelMax: nc.levelMax });
    }
  }
};
for (let r = 0; r < 8; r++) relocate();
const worstFine = () => {
  let w = null;
  let m = 0;
  for (const q of need) {
    let b = Infinity;
    for (const c of camps) b = Math.min(b, dEdge(q[0], q[1], c));
    if (b > m) {
      m = b;
      w = q;
    }
  }
  return { w, m };
};
for (let k = 0; camps.length < TARGET_CAMPS + 24; k++) {
  const { w, m } = worstFine();
  if (m <= 66) break;
  let best = null;
  let bd = Infinity;
  for (const q of cand) {
    if (camps.some((c) => Math.hypot(c.ox - q[0], c.oz - q[1]) < CAMP_R * 1.3)) continue;
    const d = Math.hypot(q[0] - w[0], q[1] - w[1]);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  if (!best) break;
  camps.push(mkCamp(best[0], best[1], best[2]));
  for (let r = 0; r < 2; r++) relocate();
}
console.log('sau tối ưu vị trí:', camps.length, 'cụm, điểm xa nhất (lưới mịn)', worstFine().m.toFixed(1), 'm');
const hunted = ZONES.reduce((a, z) => a + polyAreaOf(z.off), 0) / 1e6;
let total = camps.reduce((a, c) => a + c.count, 0);
for (const c of camps) {
  if (total / hunted >= TARGET_DENSITY) break;
  c.count = 4;
  total++;
}
const zc = new Map();
for (const c of camps) {
  const n = (zc.get(c.zone) ?? 0) + 1;
  zc.set(c.zone, n);
  c.id = `c_${c.zone}_${String(n).padStart(2, '0')}`;
}
for (const c of camps) {
  delete c.ox;
  delete c.oz;
}

// ---- tài nguyên (tạm: linh thảo; Bắc Hoang chưa có nguyên liệu riêng) ----
const nodes = [
  { item: 'itm_linh_thao', x: W(-230), z: W(260), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(240), z: W(150), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(-470), z: W(-420), radius: 60, count: 5, respawn: 60 },
];

// ---- địa hình: hoang nguyên tro, trạm/trận/điểm/bia phẳng, đấu trường boss, khe Giới Khích là lòng máng lõm có nếp gấp ----
const flat = (id, off, y, flatR, outerR, extra = {}) => ({ id, x: W(off[0]), z: W(off[1]), y, flatR, outerR, round: true, ...extra });
const Y = 72;
const feats = [flat('tram', TRAM, Y, 62, 175, { detail: 0.3 })];
for (const p of PADS.slice(1)) feats.push(flat('pad_' + p.zone, p.off, Y, 26, 90));
for (const p of POIS) feats.push(flat('poi_' + p.id, p.off, Y, 24, 70));
for (const b of STELES) feats.push(flat(b.id, b.off, Y, 14, 50));
feats.push(flat('boss', BOSS.off, Y - 2, 44, 120, { detail: 1.2 }));
feats.push(flat('boss_thu_khich', BOSS2.off, Y - 4, 44, 120, { detail: 1.2 }));
for (let z = RIFT_Z0, i = 0; z >= RIFT_Z1; z -= 30, i++) feats.push(flat(`khe_${i}`, [RX(z), z], Y - 14, 10, 56, { detail: 1.5, relief: { amp: 3, freq: 0.05, crease: true } }));
const terrain = {
  id: 'bac_hoang',
  seed: SEED,
  size: 2048,
  margin: 24,
  natural: { freq: 0.0016, baseOct: 4, ridgeOct: 3, level: Y, baseAmp: 7, ridgeAmp: 30, maskFreq: 0.0011, maskOct: 2, maskLo: -0.5, maskHi: 0.25, edge: { amp: 120, r0: 300, r1: 20 } },
  features: feats,
  play: { cx: PLAY.cx, cz: PLAY.cz, half: PLAY.half, wallH: 260 },
  colliders,
};

const level = {
  id: 'bac_hoang',
  minLevel: 28, // DIVUC: chương 5 từ Hóa Thần; server kiểm ở requestLevel
  spawn: { x: W(TRAM[0]), z: W(TRAM[1] + 12) },
  zones: ZONES.map((z) => ({ id: z.id, lvMin: z.lv[0], lvMax: z.lv[1], color: z.color, music: 'wild', poly: z.poly })),
  pois: POIS.map((p) => ({ id: p.id, zone: p.zone, x: W(p.off[0]), z: W(p.off[1]), beamH: 80 })),
  // Cổng vào Xích Tẫn Khích (DV-3D), cách poi cong_xich_tan_khich 18 m về phía tâm bản đồ.
  portals: [{ x: W(337), z: W(-387), r: 12, to: 'xich_tan_khich' }],
  // Vị trí năm Trấn Giới Bia (cơ chế giới áp/thắp bia là DV3-C; nhiệm vụ `touch` dùng các điểm này).
  spots: STELES.map((b) => ({ id: b.id, zone: b.zone, x: W(b.off[0]), z: W(b.off[1]) })),
  camps,
  spawns,
  nodes,
};

const out = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
out('packages/content/data/levels/bac_hoang.terrain.json', JSON.stringify(terrain, null, 2) + '\n');
out('packages/content/data/levels/bac_hoang.json', JSON.stringify(level, null, 2) + '\n');
const propLines = props.map((p) => `  { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${p.s} },`);
out(
  'packages/shared/src/props.bachoang.ts',
  `// Prop bày của Bắc Hoang Tẫn Nguyên (DV-1). SINH BẰNG tools/maps/gen-bac-hoang.mjs: sửa ở đó rồi chạy lại.
// Va chạm của trụ/đá/gốc cây nằm ở \`terrain.colliders\` (bac_hoang.terrain.json), tính từ PROP_LIB theo vị trí và xoay.
import type { HandProp } from './props';

export const BAC_HOANG_PROPS: readonly HandProp[] = [
${propLines.join('\n')}
];
`,
);
const padLines = PADS.map((p) => `  { id: '${p.id}', level: 'bac_hoang', face: { x: ${C}, z: ${C - 200} }, zone: '${p.zone}', x: ${W(p.off[0])}, z: ${W(p.off[1])} },`);
out(
  'packages/shared/src/teleport.bachoang.ts',
  `// Truyền Tống Trận của Bắc Hoang Tẫn Nguyên (DV-1, tiền tố bh_). SINH BẰNG tools/maps/gen-bac-hoang.mjs.
import type { TelePad } from './teleport';

/** Trận trạm (bh_tp_tram) không mở sẵn: mở khi nhận nhiệm vụ q5_bac_hanh (DV3-H) hoặc "/gm tele bh_tp_tram" rồi truyền tống từ Ngoại Thành Trạm (Thiên Khuyết); tới nơi thì trận tự mở. Các trận vùng mở khi chạm. */
export const BAC_HOANG_PADS: readonly TelePad[] = [
${padLines.join('\n')}
];
`,
);
console.log(`camps ${camps.length}, quái thường ${camps.reduce((a, c) => a + c.count, 0)} (${(camps.reduce((a, c) => a + c.count, 0) / hunted).toFixed(0)}/km²), tinh anh+boss ${spawns.length}, prop ${props.length}, collider ${colliders.length}`);
