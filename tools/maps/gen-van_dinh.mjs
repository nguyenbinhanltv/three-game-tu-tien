// Sinh dữ liệu bản đồ Vấn Đỉnh Âm Dương Giới (TN-3, chương 6), tất định theo seed:
//   packages/content/data/levels/van_dinh.terrain.json  (TerrainDef)
//   packages/content/data/levels/van_dinh.json          (LevelDef: zones, camps, spawns, pois, spots, nodes, spawn)
//   packages/shared/src/props.vandinh.ts                (prop bày)
//   packages/shared/src/teleport.vandinh.ts             (trận truyền tống vd_*)
// Chạy: node tools/maps/gen-van_dinh.mjs   (rồi pnpm content:check, pnpm map:report --level van_dinh)
// Một level, hai nửa: phía TÂY là mặt Âm Hư (cấp 32–39), phía ĐÔNG là mặt Dương Thực (cấp 40–43), nối nhau bằng cặp Chuyển Diện Trận Đài
// (hai Truyền Tống Trận vd_chuyen_am / vd_chuyen_duong ở Bậc Đỉnh và rừng Đồng Khô). Không có trạng thái "mặt" theo người chơi: mặt là vị trí.
// Tọa độ trong bảng là offset (m) so với TÂM bản đồ (1024, 1024); +x đông, +z nam, Bắc là -z. Cổng Giới (trại) ở (0, +560).
// Mood hai mặt, ngoại lệ art bible và ánh sáng riêng mỗi mặt: PR VFX/ánh sáng (tools/maps/van_dinh.palette.json là bảng màu nháp).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = 1024;
const SEED = 20261122;
const PLAY = { cx: C, cz: C, half: 760 };
const BOX = { x0: -700, x1: 700, z0: -700, z1: 700 }; // vùng chia cho các vùng săn (offset), cách chân vách >= 60 m
const TRAM = [0, 560]; // Cổng Giới (trại an toàn)
const R_IN = 75;

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

// ---- vùng: ô Voronoi có trọng số (power diagram). Tây = Âm Hư, đông = Dương Thực. Dòng đi: Cổng Giới → Hồ Hư Ảnh → Rừng Rễ Treo → Bậc Đỉnh (Âm),
// qua Chuyển Diện sang Rừng Đồng Khô → Giới Trì (Dương). `lv` là cấp thiết kế của vùng. ----
const ZONES = [
  { id: 'cong_gioi', c: [0, 440], w: 150, lv: [32, 32], color: '#AEB4C8', camps: 4 },
  { id: 'ho_hu_anh', c: [-300, 230], w: 210, lv: [33, 35], color: '#4A6A8C', camps: 10 },
  { id: 'rung_re_treo', c: [-330, -230], w: 215, lv: [36, 37], color: '#2B2540', camps: 11 },
  { id: 'bac_dinh', c: [0, -470], w: 190, lv: [38, 39], color: '#8A8FA6', camps: 9 },
  { id: 'rung_dong_kho', c: [330, -230], w: 215, lv: [40, 41], color: '#8E4A32', camps: 11 },
  { id: 'gioi_tri', c: [300, 230], w: 205, lv: [42, 43], color: '#B8893C', camps: 9 },
];
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
const polyAreaOf = (poly) =>
  Math.abs(
    poly.reduce((a, p, i) => {
      const q = poly[(i + 1) % poly.length];
      return a + (p[0] * q[1] - q[0] * p[1]);
    }, 0),
  ) / 2;
for (const z of ZONES) console.log(z.id, 'diện tích', (polyAreaOf(z.off) / 1e6).toFixed(3), 'km²', z.off.length, 'đỉnh');

// ---- trận truyền tống: trạm, hai trận mỗi nửa gần chỗ đi vào, và cặp Chuyển Diện Trận Đài ở ranh giới ----
const PADS = [
  { id: 'vd_tp_tram', zone: '', off: [0, 524] },
  { id: 'vd_tp_cong_gioi', zone: 'cong_gioi', off: [-20, 440] },
  { id: 'vd_tp_ho_hu_anh', zone: 'ho_hu_anh', off: [-250, 215] },
  { id: 'vd_tp_rung_re_treo', zone: 'rung_re_treo', off: [-290, -185] },
  { id: 'vd_chuyen_am', zone: 'bac_dinh', off: [-85, -445] },
  { id: 'vd_chuyen_duong', zone: 'rung_dong_kho', off: [190, -400] },
  { id: 'vd_tp_gioi_tri', zone: 'gioi_tri', off: [255, 190] },
];
for (const p of PADS) if (p.zone && zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('trận ngoài vùng: ' + p.id);

// ---- Ảnh Bia (ba bia mặt Âm; nhiệm vụ `touch`) ----
const BIA = [
  { id: 'anh_bia_1', zone: 'ho_hu_anh', off: [-330, 290] },
  { id: 'anh_bia_2', zone: 'rung_re_treo', off: [-390, -200] },
  { id: 'anh_bia_3', zone: 'bac_dinh', off: [-60, -520] },
];
for (const b of BIA) if (zoneOfOffset(b.off[0], b.off[1])?.id !== b.zone) throw new Error('bia ngoài vùng: ' + b.id);

// ---- điểm đáng chú ý (mỗi vùng một điểm) ----
const POIS = [
  { id: 'cong_gioi_dai', zone: 'cong_gioi', off: [60, 400] },
  { id: 'ho_guong_nuoc', zone: 'ho_hu_anh', off: [-370, 180] },
  { id: 'goc_re_co', zone: 'rung_re_treo', off: [-300, -300] },
  { id: 'dinh_vo_danh', zone: 'bac_dinh', off: [0, -560] },
  { id: 'cat_dong_nong', zone: 'rung_dong_kho', off: [400, -300] },
  { id: 'gioi_tri_cua', zone: 'gioi_tri', off: [360, 280] },
];
for (const p of POIS) if (zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('poi ngoài vùng: ' + p.id);
const BOSS = { off: [-150, -600] }; // Hư Ảnh Chủ (mặt Âm) ở Bậc Đỉnh, nửa tây
const BOSS2 = { off: [420, -420] }; // Đỉnh Linh (mặt Dương) ở rừng Đồng Khô
const BOSS3 = { off: [440, 360] }; // sân trống trước cổng Giới Trì (cổng phó bản đặt ở PR phó bản)
const BOSS4 = { off: [150, -520] }; // sân trống quanh Chuyển Diện phía đông

// ---- prop (chỉ dùng asset sẵn có; kiến trúc hai mặt: PR sau) ----
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
  for (const [lx, lz, r] of LIB_COLL[id] ?? [])
    colliders.push({
      x: Math.round((p.x + (lx * cs + lz * sn) * p.s) * 100) / 100,
      z: Math.round((p.z + (-lx * sn + lz * cs) * p.s) * 100) / 100,
      r: Math.round(r * p.s * 100) / 100,
    });
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
// Cổng Giới: đèn, lò đan, bia
for (const [x, z] of [
  [-14, -20],
  [14, -20],
  [-26, 14],
  [26, 14],
  [0, -50],
])
  addProp(LAMP, TRAM[0] + x, TRAM[1] + z, 0, 1);
addProp('prop_ngung_dan_lo', TRAM[0] + 14, TRAM[1] + 10, 0.6, 1);
addProp(STONE, TRAM[0] - 16, TRAM[1] + 12, 0.2, 1);
// Giới Tuyến: dải trụ đá và đèn dọc trục x = 0 (ranh giới hai nửa), chừa lối ở các đầu; xác định theo seed
for (let z = -380; z <= 380; z += 44) {
  addProp(R() < 0.55 ? COL : LAMP, (R() - 0.5) * 16, z + (R() - 0.5) * 12, R() * Math.PI * 2, 0.9 + R() * 0.3);
}
const around = {
  cong_gioi_dai: [COL, ROCK, STONE, LAMP, LAMP],
  ho_guong_nuoc: [ROCK, ROCK, STONE, STUMP, LAMP, LAMP],
  goc_re_co: [STUMP, STUMP, STUMP, STUMP, ROCK, STONE, LAMP],
  dinh_vo_danh: [COL, COL, COL, ROCK, ROCK, STONE, LAMP, LAMP],
  cat_dong_nong: [ROCK, ROCK, SWORD, SWORD, STUMP, STONE, LAMP],
  gioi_tri_cua: [COL, COL, ROCK, ROCK, STONE, LAMP, LAMP],
};
for (const p of POIS) ring(p, around[p.id], 5, 5);
// Ảnh Bia: bia đá cao + đèn quanh
for (const b of BIA) {
  addProp(STONE, b.off[0], b.off[1], R() * 0.4, 1.3);
  [
    [-5, 5],
    [5, 5],
  ].forEach(([dx, dz]) => addProp(LAMP, b.off[0] + dx, b.off[1] + dz, 0, 1));
}
// Chuyển Diện Trận Đài: hai bệ đối xứng, trụ đá và đèn quanh
for (const p of PADS.filter((q) => q.id.startsWith('vd_chuyen_'))) {
  [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
  ].forEach(([dx, dz]) => addProp(COL, p.off[0] + dx * 1.6, p.off[1] + dz * 1.6, 0, 0.8));
  addProp(LAMP, p.off[0], p.off[1] - 9, 0, 1);
}

// ---- tinh anh: Ảnh Hạc Vương (Hồ Hư Ảnh), Hư Ảnh Nhân (Rừng Rễ Treo, Bậc Đỉnh), Sa Tướng (Đồng Khô, Giới Trì) ----
const ELITES = [
  { zone: 'cong_gioi', mon: 'elite_anh_hac_vuong', n: 2 },
  { zone: 'ho_hu_anh', mon: 'elite_anh_hac_vuong', n: 2 },
  { zone: 'rung_re_treo', mon: 'elite_hu_anh_nhan', n: 2 },
  { zone: 'bac_dinh', mon: 'elite_hu_anh_nhan', n: 2 },
  { zone: 'rung_dong_kho', mon: 'elite_sa_tuong', n: 2 },
  { zone: 'gioi_tri', mon: 'elite_sa_tuong', n: 2 },
];

const keep = [];
for (const p of PADS) keep.push({ x: p.off[0], z: p.off[1], r: 10 });
for (const p of POIS) keep.push({ x: p.off[0], z: p.off[1], r: 16 });
keep.push({ x: TRAM[0], z: TRAM[1], r: R_IN });
for (const b of [BOSS, BOSS2, BOSS3, BOSS4]) keep.push({ x: b.off[0], z: b.off[1], r: 38 });
for (const b of BIA) keep.push({ x: b.off[0], z: b.off[1], r: 10 });
for (let z = -380; z <= 380; z += 24) keep.push({ x: 0, z, r: 14 }); // Giới Tuyến không đặt bãi quái

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

// ---- boss ngoài trời, hồi sinh 30 phút ----
spawns.push({
  mon: 'boss_hu_anh_chu',
  x: W(BOSS.off[0]),
  z: W(BOSS.off[1]),
  radius: 6,
  count: 1,
  levelMin: 39,
  levelMax: 39,
  respawn: 1800,
});
spawns.push({
  mon: 'boss_dinh_linh',
  x: W(BOSS2.off[0]),
  z: W(BOSS2.off[1]),
  radius: 6,
  count: 1,
  levelMin: 43,
  levelMax: 43,
  respawn: 1800,
});

// ---- camp (rải điểm xa nhất như Đoạn Mạch) ----
const TARGET_CAMPS = 60;
const TARGET_DENSITY = 120;
const CAMP_R = 30;
const MIX = {
  cong_gioi: [['mon_anh_hac', 1]],
  ho_hu_anh: [
    ['mon_anh_hac', 0.5],
    ['mon_bong_re', 0.5],
  ],
  rung_re_treo: [
    ['mon_bong_re', 0.5],
    ['mon_hu_anh_ve', 0.5],
  ],
  bac_dinh: [
    ['mon_hu_anh_ve', 0.5],
    ['mon_quy_ho', 0.5],
  ],
  rung_dong_kho: [
    ['mon_sa_no', 0.5],
    ['mon_kim_van_thu', 0.5],
  ],
  gioi_tri: [
    ['mon_dong_giap_khoi', 0.5],
    ['mon_hoa_dieu', 0.5],
  ],
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
    if ([BOSS, BOSS2, BOSS3, BOSS4].some((b) => Math.hypot(x - b.off[0], z - b.off[1]) < 38)) continue; // đấu trường trống không tính độ phủ
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
  return {
    id: '',
    zone: zn.id,
    mon: pick(MIX[zn.id]),
    x: W(x),
    z: W(z),
    count: 3,
    radius: CAMP_R,
    levelMin: lv,
    levelMax: Math.min(zn.lv[1], lv + (zn.lv[1] > lv ? 1 : 0)),
    respawn: 45,
    ox: x,
    oz: z,
  };
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
      Object.assign(camps[i], {
        zone: nc.zone,
        mon: nc.mon,
        x: nc.x,
        z: nc.z,
        ox: nc.ox,
        oz: nc.oz,
        levelMin: nc.levelMin,
        levelMax: nc.levelMax,
      });
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

// ---- tài nguyên (tạm: linh thảo; chương 6 chưa có nguyên liệu hái riêng) ----
const nodes = [
  { item: 'itm_linh_thao', x: W(-250), z: W(270), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(-340), z: W(-290), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(300), z: W(180), radius: 60, count: 5, respawn: 60 },
];

// ---- địa hình: vùng đá tro lạnh, trạm/trận/điểm/bia phẳng, ba sân boss ----
const flat = (id, off, y, flatR, outerR, extra = {}) => ({ id, x: W(off[0]), z: W(off[1]), y, flatR, outerR, round: true, ...extra });
const Y = 72;
const feats = [flat('tram', TRAM, Y, 62, 175, { detail: 0.3 })];
for (const p of PADS.slice(1)) feats.push(flat('pad_' + p.id.replace('vd_', ''), p.off, Y, 26, 90));
for (const p of POIS) feats.push(flat('poi_' + p.id, p.off, Y, 24, 70));
for (const b of BIA) feats.push(flat(b.id, b.off, Y, 14, 50));
[BOSS, BOSS2, BOSS3, BOSS4].forEach((b, i) => feats.push(flat('san_' + i, b.off, Y - 2, 44, 120, { detail: 1.2 })));
const terrain = {
  id: 'van_dinh',
  seed: SEED,
  size: 2048,
  margin: 24,
  natural: {
    freq: 0.0016,
    baseOct: 4,
    ridgeOct: 3,
    level: Y,
    baseAmp: 7,
    ridgeAmp: 26,
    maskFreq: 0.0011,
    maskOct: 2,
    maskLo: -0.5,
    maskHi: 0.25,
    edge: { amp: 120, r0: 300, r1: 20 },
  },
  features: feats,
  play: { cx: PLAY.cx, cz: PLAY.cz, half: PLAY.half, wallH: 260 },
  colliders,
};

const level = {
  id: 'van_dinh',
  minLevel: 32, // chương 6 từ Anh Biến sơ kỳ; server kiểm ở requestLevel
  spawn: { x: W(TRAM[0]), z: W(TRAM[1] + 12) },
  zones: ZONES.map((z) => ({ id: z.id, lvMin: z.lv[0], lvMax: z.lv[1], color: z.color, music: 'wild', poly: z.poly })),
  pois: POIS.map((p) => ({ id: p.id, zone: p.zone, x: W(p.off[0]), z: W(p.off[1]), beamH: 80 })),
  // Cổng vào Giới Trì Động Phủ, cách điểm gioi_tri_cua 18 m về phía tâm bản đồ.
  portals: [{ x: W(346), z: W(269), r: 12, to: 'gioi_tri' }],
  spots: BIA.map((b) => ({ id: b.id, zone: b.zone, x: W(b.off[0]), z: W(b.off[1]) })),
  camps,
  spawns,
  nodes,
};

const out = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
out('packages/content/data/levels/van_dinh.terrain.json', JSON.stringify(terrain, null, 2) + '\n');
out('packages/content/data/levels/van_dinh.json', JSON.stringify(level, null, 2) + '\n');
const propLines = props.map((p) => `  { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${p.s} },`);
out(
  'packages/shared/src/props.vandinh.ts',
  `// Prop bày của Vấn Đỉnh Âm Dương Giới (TN-3). SINH BẰNG tools/maps/gen-van_dinh.mjs: sửa ở đó rồi chạy lại.
// Va chạm của trụ/đá/gốc cây nằm ở \`terrain.colliders\` (van_dinh.terrain.json), tính từ PROP_LIB theo vị trí và xoay.
import type { HandProp } from './props.types';

export const VAN_DINH_PROPS: readonly HandProp[] = [
${propLines.join('\n')}
];
`,
);
const padLines = PADS.map(
  (p) => `  { id: '${p.id}', level: 'van_dinh', face: { x: ${C}, z: ${C} }, zone: '${p.zone}', x: ${W(p.off[0])}, z: ${W(p.off[1])} },`,
);
out(
  'packages/shared/src/teleport.vandinh.ts',
  `// Truyền Tống Trận của Vấn Đỉnh Âm Dương Giới (TN-3, tiền tố vd_). SINH BẰNG tools/maps/gen-van_dinh.mjs.
// vd_tp_tram nhận khách từ ngoài (mở bằng nhiệm vụ chương 6 hoặc "/gm tele vd_tp_tram"). vd_chuyen_am và vd_chuyen_duong là cặp
// Chuyển Diện Trận Đài nối mặt Âm Hư (tây) với mặt Dương Thực (đông); cả hai mở bằng cách đứng lên bệ, như mọi trận khác.
import type { TelePad } from './teleport.types';

export const VAN_DINH_PADS: readonly TelePad[] = [
${padLines.join('\n')}
];
`,
);
console.log(
  `camps ${camps.length}, quái thường ${camps.reduce((a, c) => a + c.count, 0)} (${(camps.reduce((a, c) => a + c.count, 0) / hunted).toFixed(0)}/km²), tinh anh+boss ${spawns.length}, prop ${props.length}, collider ${colliders.length}`,
);
