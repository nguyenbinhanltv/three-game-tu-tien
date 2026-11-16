// Sinh dữ liệu bản đồ Vân Hải Phù Đảo (E3-A + E3-N), tất định theo seed:
//   packages/content/data/levels/van_hai.terrain.json  (TerrainDef: đảo nổi, cầu xích, đảo giả, sàn mây)
//   packages/content/data/levels/van_hai.json          (LevelDef: zones, camps, spawns, pois, nodes, spawn)
//   packages/shared/src/props.vanhai.ts                (prop bày + va chạm)
//   packages/shared/src/teleport.vanhai.ts             (trận truyền tống vh_*)
// Chạy: node tools/maps/gen-van-hai.mjs   (rồi pnpm content:check, pnpm map:report --level van_hai)
// Tọa độ trong bảng là offset (m) so với Phù Đảo Các (0, 0); +x đông, +z nam. Thế giới 2048 m, Phù Đảo Các ở (1024, 1024).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = 1024;
const SEED = Number(process.env.SEED ?? 20261117);
const HALF = 860;
const FLOOR = 60; // sàn mây (m): đi bộ được, rơi xuống đây không chết
const EDGE = 12; // dải mép đảo: vách dốc đứng bo tròn (không leo được từ sàn mây; lên lại bằng thang mây `thang_*` hoặc ngự kiếm)

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
const deg = (d) => (d * Math.PI) / 180;
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

// ---- đảo ----
const HUB = { id: 'phu_dao_cac', off: [0, 0], r: 85, y: 124 };
const ZONES = [
  { id: 'tung_dai_dao', off: [-360, 168], r: 207, y: 126, lv: [20, 21], color: '#5E8F6E', camps: 6 },
  { id: 'thach_quy_dao', off: [396, 108], r: 207, y: 122, lv: [21, 22], color: '#8C8F7A', camps: 6 },
  { id: 'kinh_ho_dao', off: [60, 492], r: 207, y: 128, lv: [21, 22], color: '#5FA3B3', camps: 6 },
  { id: 'loi_van_dao', off: [528, -420], r: 207, y: 132, lv: [22, 23], color: '#B7A24E', camps: 6 },
  { id: 'kinh_ngu_dai', off: [-456, -456], r: 207, y: 130, lv: [23, 23], color: '#4D6F9E', camps: 6 },
];
// đảo nhỏ: không quái, chỉ hái thuốc (đi bằng ngự kiếm); đảo giả: chỉ để vẽ, bước lên là rơi
const SMALL = [
  { id: 'tieu_dao_1', off: [-144, -288], r: 40, y: 136 },
  { id: 'tieu_dao_2', off: [96, -312], r: 36, y: 140 },
  { id: 'tieu_dao_3', off: [-456, 564], r: 42, y: 134 },
];
const FAKE = [
  { id: 'gia_1', off: [210, -168], r: 40, y: 128 },
  { id: 'gia_2', off: [-696, -24], r: 46, y: 130 },
  { id: 'gia_3', off: [396, 672], r: 38, y: 126 },
  { id: 'gia_4', off: [-204, 732], r: 40, y: 132 },
];
const ISLE = { [HUB.id]: HUB };
for (const z of ZONES) ISLE[z.id] = z;
// cầu xích: [từ, tới]
const LINKS = [
  [HUB.id, 'tung_dai_dao'],
  [HUB.id, 'thach_quy_dao'],
  [HUB.id, 'kinh_ho_dao'],
  ['thach_quy_dao', 'loi_van_dao'],
  ['tung_dai_dao', 'kinh_ngu_dai'],
];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
{
  const all = [HUB, ...ZONES, ...SMALL, ...FAKE];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const gap = dist(all[i].off, all[j].off) - all[i].r - all[j].r - EDGE;
      if (gap < 0) throw new Error(`đảo chồng nhau: ${all[i].id} ${all[j].id} (${gap.toFixed(0)} m)`);
    }
}

const bridges = LINKS.map(([a, b], i) => {
  const A = ISLE[a];
  const B = ISLE[b];
  const d = dist(A.off, B.off);
  const ux = (B.off[0] - A.off[0]) / d;
  const uz = (B.off[1] - A.off[1]) / d;
  const ar = A.r - 6;
  const br = B.r - 6;
  const len = d - ar - br;
  return {
    id: `cau_${a}_${b}`,
    ax: W(A.off[0] + ux * ar),
    az: W(A.off[1] + uz * ar),
    ay: A.y,
    bx: W(B.off[0] - ux * br),
    bz: W(B.off[1] - uz * br),
    by: B.y,
    halfW: 2.6,
    sag: Math.round(Math.min(5, 0.8 + len * 0.025) * 10) / 10,
  };
});

// ---- đa giác vùng = mặt đảo phẳng (bán kính r - 4, 28 đỉnh) ----
const polyOf = (z) => {
  const poly = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const [x, zz] = polar(z.r - 4, a);
    poly.push([W(z.off[0] + x), W(z.off[1] + zz)]);
  }
  return poly;
};
for (const z of ZONES) z.poly = polyOf(z);
const hubAngle = (z) => Math.atan2(HUB.off[1] - z.off[1], HUB.off[0] - z.off[0]);

// ---- trận truyền tống ----
const PADS = [{ id: 'vh_tp_hub', zone: '', off: [0, -38] }];
const PAD_IDS = { tung_dai_dao: 'vh_tp_tung_dai', thach_quy_dao: 'vh_tp_thach_quy', kinh_ho_dao: 'vh_tp_kinh_ho', loi_van_dao: 'vh_tp_loi_van', kinh_ngu_dai: 'vh_tp_kinh_ngu' };
for (const z of ZONES) {
  const [px, pz] = polar(60, hubAngle(z) + (z.id === 'kinh_ngu_dai' || z.id === 'loi_van_dao' ? deg(35) : 0));
  PADS.push({ id: PAD_IDS[z.id], zone: z.id, off: [z.off[0] + px, z.off[1] + pz] });
}

// ---- điểm đáng chú ý (mỗi vùng một) ----
const POI_DEF = {
  tung_dai_dao: { id: 'phu_dao_dinh', ang: 120 },
  thach_quy_dao: { id: 'cau_xich_may', ang: -110 },
  kinh_ho_dao: { id: 'kinh_ho_dai', ang: 130 },
  loi_van_dao: { id: 'dinh_sam', ang: -120 },
  kinh_ngu_dai: { id: 'vuc_kinh_ngu', ang: -100 },
};
const POIS = ZONES.map((z) => {
  const d = POI_DEF[z.id];
  const [x, zz] = polar(100, hubAngle(z) + deg(d.ang));
  return { id: d.id, zone: z.id, off: [z.off[0] + x, z.off[1] + zz] };
});
const POI_KIT = {
  phu_dao_dinh: { center: ['prop_phu_dao_dinh', 0.4, 1.2], around: ['prop_tung_phu_dao', 'prop_tung_phu_dao', 'prop_tung_phu_dao', 'prop_tung_phu_dao', 'prop_da_troi', 'prop_den_da'] },
  cau_xich_may: { center: ['prop_phu_dao_dinh', 1.2, 1], around: ['prop_da_troi', 'prop_da_troi', 'prop_da_troi', 'prop_tung_phu_dao', 'prop_tung_phu_dao', 'prop_den_da', 'prop_den_da'] },
  kinh_ho_dai: { center: ['prop_kinh_ho_dai', 0, 1.2], around: ['prop_anh_ngoc_kinh', 'prop_anh_ngoc_kinh', 'prop_anh_ngoc_kinh', 'prop_da_troi', 'prop_da_troi', 'prop_den_da'] },
  dinh_sam: { center: null, around: ['prop_da_troi', 'prop_da_troi', 'prop_da_troi', 'prop_da_troi', 'prop_da_troi', 'prop_den_da', 'prop_tung_phu_dao'] },
  vuc_kinh_ngu: { center: null, around: ['prop_da_troi', 'prop_da_troi', 'prop_da_troi', 'prop_phu_dao_dinh', 'prop_phu_dao_dinh', 'prop_den_da', 'prop_den_da'] },
};
const COLL_R = { prop_tung_phu_dao: 0.8, prop_kinh_ho_dai: 2.8 };
const props = [];
const addProp = (id, ox, oz, yaw, s = 1) => {
  const p = { id, x: W(ox), z: W(oz), yaw: Math.round(yaw * 100) / 100, s: Math.round(s * 100) / 100 };
  if (COLL_R[id]) p.r = Math.round(COLL_R[id] * s * 100) / 100;
  props.push(p);
};
for (const p of POIS) {
  const kit = POI_KIT[p.id];
  if (kit.center) addProp(kit.center[0], p.off[0], p.off[1], kit.center[1], kit.center[2]);
  const rMin = kit.center ? 8 : 5;
  kit.around.forEach((id, i) => {
    const a = (i / kit.around.length) * Math.PI * 2 + R() * 0.5;
    const r = rMin + R() * 4;
    addProp(id, p.off[0] + Math.cos(a) * r, p.off[1] + Math.sin(a) * r, R() * Math.PI * 2, id === 'prop_da_troi' ? 0.9 + R() * 0.5 : 0.9 + R() * 0.3);
  });
}
// Phù Đảo Các: đình ở giữa, đèn đá, ảnh ngọc kính, đá trôi quanh mép (không va chạm)
addProp('prop_phu_dao_dinh', 42, 34, Math.PI, 1.3); // lệch khỏi trục điểm sinh: camera sau lưng người mới vào không kẹt trong mái đình
for (const [x, z] of [[-14, -24], [14, -24], [-26, 14], [26, 14], [0, -10]]) addProp('prop_den_da', x, z, 0, 1);
addProp('prop_anh_ngoc_kinh', -10, 20, 0, 1);
addProp('prop_anh_ngoc_kinh', 12, 22, 0.8, 1);
for (let i = 0; i < 5; i++) {
  const a = deg(20 + i * 72);
  addProp('prop_da_troi', Math.cos(a) * 66, Math.sin(a) * 66, R() * 6, 1.2);
}

// ---- tinh anh ----
const ELITES = [
  { zone: 'tung_dai_dao', mon: 'elite_liet_cot_bao', n: 2 },
  { zone: 'thach_quy_dao', mon: 'elite_ho_mach_khoi_tuong', n: 3 },
  { zone: 'kinh_ho_dao', mon: 'elite_xich_sa_ngo_cong', n: 2 },
  { zone: 'loi_van_dao', mon: 'elite_liet_cot_bao', n: 3 },
  { zone: 'kinh_ngu_dai', mon: 'elite_ho_mach_khoi_tuong', n: 2 },
];
const keep = []; // {x,z,r}
for (const p of PADS) keep.push({ x: p.off[0], z: p.off[1], r: 0 });
for (const p of POIS) keep.push({ x: p.off[0], z: p.off[1], r: 10 });
keep.push({ x: 0, z: 0, r: HUB.r });
for (const z of ZONES) {
  // đầu cầu: giữ trống 22 m quanh chỗ đường lên đảo
  const a = hubAngle(z);
  const [bx, bz] = polar(z.r - 6, a);
  keep.push({ x: z.off[0] + bx, z: z.off[1] + bz, r: 0 });
}
for (const l of LINKS) {
  const A = ISLE[l[0]];
  const B = ISLE[l[1]];
  const d = dist(A.off, B.off);
  const ux = (B.off[0] - A.off[0]) / d;
  const uz = (B.off[1] - A.off[1]) / d;
  keep.push({ x: B.off[0] - ux * (B.r - 6), z: B.off[1] - uz * (B.r - 6), r: 0 });
  keep.push({ x: A.off[0] + ux * (A.r - 6), z: A.off[1] + uz * (A.r - 6), r: 0 });
}
const spawns = [];
const eliteAt = [];
for (const e of ELITES) {
  const zn = ZONES.find((z) => z.id === e.zone);
  for (let i = 0; i < e.n; i++) {
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 500; k++) {
      const a = R() * Math.PI * 2;
      const r = zn.r - 85 + R() * 40;
      const x = zn.off[0] + Math.cos(a) * r;
      const z = zn.off[1] + Math.sin(a) * r;
      if (keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 40)) continue;
      const d = Math.min(...eliteAt.map((q) => Math.hypot(q.x - x, q.z - z)), 9999);
      if (d > bestD) {
        bestD = d;
        best = [x, z];
      }
    }
    eliteAt.push({ x: best[0], z: best[1] });
    spawns.push({ mon: e.mon, x: W(best[0]), z: W(best[1]), radius: 10, count: 1, levelMin: zn.lv[1], levelMax: zn.lv[1], respawn: 240 });
  }
}
// Kình Ngư Đài: boss Vân Hải Kình Vương bay quanh biển mây phía trên đảo (E3-B thêm sau); giữ trống tâm đảo làm đấu trường.
keep.push({ x: ZONES[4].off[0], z: ZONES[4].off[1], r: 0 });

// ---- cụm quái ----
const CAMP_R = 30;
const MIX = {
  tung_dai_dao: [['mon_ngo_cong_au', 0.5], ['mon_thach_giap_te', 0.5]],
  thach_quy_dao: [['mon_thach_giap_te', 0.6], ['mon_mach_thuong_ho_ve', 0.4]],
  kinh_ho_dao: [['mon_khai_mach_khoi_loi', 0.6], ['mon_mach_thuong_ho_ve', 0.4]],
  loi_van_dao: [['mon_khai_mach_khoi_loi', 0.5], ['mon_ngo_cong_au', 0.5]],
  kinh_ngu_dai: [['mon_mach_thuong_ho_ve', 0.5], ['mon_ngo_cong_au', 0.5]],
};
const pick = (list) => {
  let t = R();
  for (const [m, w] of list) if ((t -= w) <= 0) return m;
  return list[list.length - 1][0];
};
const dEdge = (x, z, c) => Math.max(0, Math.hypot(c[0] - x, c[1] - z) - CAMP_R);
const camps = [];
const inPoly = (poly, x, z) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
for (const zn of ZONES) {
  // Điểm cần phủ: lưới 12 m căn theo tọa độ thế giới trong đa giác vùng (đúng như coverage.ts); ứng viên đặt cụm ở lưới 8 m.
  const need = [];
  const cand = [];
  const STEP_N = 12;
  const cx = W(zn.off[0]);
  const cz = W(zn.off[1]);
  for (let x = Math.floor((cx - zn.r) / STEP_N) * STEP_N; x <= cx + zn.r; x += STEP_N)
    for (let z = Math.floor((cz - zn.r) / STEP_N) * STEP_N; z <= cz + zn.r; z += STEP_N) if (inPoly(zn.poly, x, z)) need.push([x - C, z - C]);
  for (let x = -zn.r; x <= zn.r; x += 4)
    for (let z = -zn.r; z <= zn.r; z += 4) {
      const wx = zn.off[0] + x;
      const wz = zn.off[1] + z;
      if (Math.hypot(x, z) <= zn.r - 14 && !keep.some((q) => Math.hypot(q.x - wx, q.z - wz) < q.r + CAMP_R + 6) && !eliteAt.some((q) => Math.hypot(q.x - wx, q.z - wz) < 16)) cand.push([wx, wz]);
    }
  // Mục tiêu: p95 của khoảng cách tới mép cụm gần nhất (+ nhẹ theo điểm xa nhất), ủ nhiệt.
  const cost = (set) => {
    const ds = new Float64Array(need.length);
    for (let k = 0; k < need.length; k++) {
      let b = 9999;
      for (const c of set) b = Math.min(b, Math.hypot(c[0] - need[k][0], c[1] - need[k][1]) - CAMP_R);
      ds[k] = Math.max(0, b);
    }
    ds.sort();
    return [ds[Math.floor(ds.length * 0.95)] + 0.03 * ds[ds.length - 1] + (ds[ds.length - 1] > 83 ? 3 * (ds[ds.length - 1] - 83) : 0), ds[ds.length - 1]];
  };
  let best = null;
  for (let rs = 0; rs < 30; rs++) {
    let set = [];
    for (let i = 0; i < zn.camps; i++) set.push(cand[Math.floor(R() * cand.length)]);
    let [f] = cost(set);
    let bestLocal = { set, f };
    const ITER = 14000;
    for (let it = 0; it < ITER; it++) {
      const T = 2.5 * (1 - it / ITER) + 0.02;
      const i = Math.floor(R() * set.length);
      const far = R() < 0.1;
      let q;
      for (let tries = 0; tries < 8 && !q; tries++) {
        const c = cand[Math.floor(R() * cand.length)];
        if (far || Math.hypot(c[0] - set[i][0], c[1] - set[i][1]) < 22) q = c;
      }
      if (!q || set.some((c, j) => j !== i && Math.hypot(c[0] - q[0], c[1] - q[1]) < CAMP_R * 1.3)) continue;
      const next = set.slice();
      next[i] = q;
      const [f2] = cost(next);
      if (f2 <= f || R() < Math.exp((f - f2) / T)) {
        set = next;
        f = f2;
        if (f < bestLocal.f) bestLocal = { set, f };
      }
    }
    if (!best || bestLocal.f < best.f) best = bestLocal;
  }
  const [bf, m] = cost(best.set);
  console.log(`${zn.id}: ${best.set.length} cụm, điểm xa nhất ${m.toFixed(0)} m, mục tiêu ${bf.toFixed(1)}`);
  best.set.forEach((c, i) => {
    const lv = zn.lv[0] + (zn.lv[1] > zn.lv[0] && Math.hypot(c[0] - HUB.off[0], c[1] - HUB.off[1]) > Math.hypot(zn.off[0] - HUB.off[0], zn.off[1] - HUB.off[1]) ? 1 : 0);
    camps.push({ id: `c_${zn.id}_${String(i + 1).padStart(2, '0')}`, zone: zn.id, mon: pick(MIX[zn.id]), x: W(c[0]), z: W(c[1]), count: 3, radius: CAMP_R, levelMin: lv, levelMax: lv, respawn: 45 });
  });
}
const polyAreaOf = (poly) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0)) / 2;
const areaKm2 = ZONES.reduce((a, z) => a + polyAreaOf(z.poly), 0) / 1e6;
const TARGET_DENSITY = 122;
let total = camps.reduce((a, c) => a + c.count, 0);
for (const c of camps) {
  if (total / areaKm2 >= TARGET_DENSITY) break;
  c.count = 4;
  total++;
}

// ---- tài nguyên: linh thảo trên đảo nhỏ (đi bằng ngự kiếm) ----
const nodes = SMALL.map((s) => ({ item: 'itm_linh_thao', x: W(s.off[0]), z: W(s.off[1]), radius: Math.round(s.r * 0.5), count: 4, respawn: 60 }));

// ---- thang mây (Thăng Vân Đài): mỗi đảo vùng và hub một bậc dốc từ sàn mây lên mép đảo (vì mép đảo là vách đứng) ----
{
  const RUN = 79;
  const lim = HALF - 24;
  const segDist = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(ax + dx * t - px, az + dz * t - pz);
  };
  const obstacles = [...camps.map((c) => [c.x - C, c.z - C]), ...PADS.map((p) => p.off), ...POIS.map((p) => p.off), ...eliteAt.map((e) => [e.x, e.z])];
  for (const I of [HUB, ...ZONES]) {
    let best = null;
    for (let a = 0; a < 360; a += 15) {
      const th = deg(a);
      const dir = [Math.cos(th), Math.sin(th)];
      const E = [I.off[0] + dir[0] * (I.r - 6), I.off[1] + dir[1] * (I.r - 6)];
      const S = [I.off[0] + dir[0] * (I.r + 10 + RUN), I.off[1] + dir[1] * (I.r + 10 + RUN)];
      if (Math.abs(S[0]) > lim || Math.abs(S[1]) > lim) continue;
      let ok = true;
      for (const O of [HUB, ...ZONES, ...SMALL])
        if (O !== I && segDist(O.off[0], O.off[1], S[0], S[1], E[0], E[1]) < O.r + EDGE + 14) ok = false;
      for (const b of bridges) if (Math.min(segDist(b.ax - C, b.az - C, S[0], S[1], E[0], E[1]), segDist(b.bx - C, b.bz - C, S[0], S[1], E[0], E[1])) < 30) ok = false;
      if (!ok) continue;
      const score = Math.min(...obstacles.map((o) => Math.hypot(o[0] - E[0], o[1] - E[1])));
      if (!best || score > best.score) best = { E, S, score };
    }
    if (!best) throw new Error('không đặt được thang mây cho ' + I.id);
    bridges.push({ id: 'thang_' + I.id, ax: W(best.S[0]), az: W(best.S[1]), ay: FLOOR, bx: W(best.E[0]), bz: W(best.E[1]), by: I.y, halfW: 2.6, sag: 0 });
  }
}

// ---- địa hình ----
// E3-I: nhấp nhô mặt đảo (nhạt dần về rìa) và hồ gương nông của Kính Hồ Đảo (chỗ đặt: tránh cụm, tinh anh, trận, điểm đáng chú ý, đầu cầu).
const RELIEF = { phu_dao_cac: [1.2, 0.025], tung_dai_dao: [2.4, 0.01], thach_quy_dao: [3.0, 0.014, true], kinh_ho_dao: [0.7, 0.012], loi_van_dao: [3.0, 0.016, true], kinh_ngu_dai: [2.0, 0.008], tieu_dao_1: [0.8, 0.03], tieu_dao_2: [0.8, 0.03], tieu_dao_3: [0.8, 0.03] };
const PONDS = [{ x: 1239, z: 1572, r: 30, depth: 1 }, { x: 1133, z: 1620, r: 22, depth: 1 }, { x: 1139, z: 1521, r: 18, depth: 1 }];
const features = [
  ...[HUB, ...ZONES, ...SMALL].map((i) => ({ id: 'isl_' + i.id, x: W(i.off[0]), z: W(i.off[1]), y: i.y, flatR: i.r, outerR: i.r + EDGE, round: true, detail: i.id.startsWith('tieu') ? 0.4 : 1.1, relief: RELIEF[i.id] ? { amp: RELIEF[i.id][0], freq: RELIEF[i.id][1], ...(RELIEF[i.id][2] ? { crease: true } : {}) } : undefined })),
  ...PADS.map((p) => ({ id: 'pad_' + p.id, x: W(p.off[0]), z: W(p.off[1]), y: (ZONES.find((z) => z.id === p.zone) ?? HUB).y, flatR: 8, outerR: 22, round: true })),
  ...POIS.map((p) => ({ id: 'poi_' + p.id, x: W(p.off[0]), z: W(p.off[1]), y: ZONES.find((z) => z.id === p.zone).y, flatR: 14, outerR: 30, round: true })),
];
const islandDef = (i) => ({ x: W(i.off[0]), z: W(i.off[1]), r: i.r, edge: EDGE, y: i.y });
const terrain = {
  id: 'van_hai',
  seed: SEED,
  size: 2048,
  margin: 24,
  natural: { freq: 0.002, baseOct: 1, ridgeOct: 1, level: FLOOR, baseAmp: 0, ridgeAmp: 0, maskFreq: 0.001, maskOct: 1, maskLo: 0, maskHi: 1 },
  islands: [HUB, ...ZONES, ...SMALL].map(islandDef),
  fakeIslands: FAKE.map(islandDef),
  voidFloor: FLOOR,
  bridges,
  ponds: PONDS,
  features,
  play: { cx: C, cz: C, half: HALF, wallH: 150 },
  colliders: props.filter((p) => p.r).map((p) => ({ x: p.x, z: p.z, r: Math.round(p.r * 100) / 100 })),
};

const level = {
  id: 'van_hai',
  spawn: { x: C, z: C + 12 },
  zones: ZONES.map((z) => ({ id: z.id, lvMin: z.lv[0], lvMax: z.lv[1], color: z.color, music: 'wild', poly: z.poly })),
  pois: POIS.map((p) => ({ id: p.id, zone: p.zone, x: W(p.off[0]), z: W(p.off[1]), beamH: 90 })),
  camps,
  spawns,
  nodes,
};

const out = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
out('packages/content/data/levels/van_hai.terrain.json', JSON.stringify(terrain, null, 2) + '\n');
out('packages/content/data/levels/van_hai.json', JSON.stringify(level, null, 2) + '\n');
const propLines = props.map((p) => `  { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${p.s}${p.r ? `, r: ${p.r}` : ''} },`);
out(
  'packages/shared/src/props.vanhai.ts',
  `// Prop bày của Vân Hải Phù Đảo (E3-A). SINH BẰNG tools/maps/gen-van-hai.mjs: sửa ở đó rồi chạy lại.
import type { HandProp } from './props';

export const VAN_HAI_PROPS: readonly HandProp[] = [
${propLines.join('\n')}
];
`,
);
const padLines = PADS.map((p) => `  { id: '${p.id}', level: 'van_hai', face: { x: ${C}, z: ${C} }, zone: '${p.zone}', x: ${W(p.off[0])}, z: ${W(p.off[1])} },`);
out(
  'packages/shared/src/teleport.vanhai.ts',
  `// Truyền Tống Trận của Vân Hải Phù Đảo (E3-A, tiền tố vh_). SINH BẰNG tools/maps/gen-van-hai.mjs.
import type { TelePad } from './teleport';

/** Trận hub (vh_tp_hub) mở khóa sau nhiệm vụ q2_ket_dan (unlockTele) hoặc "/gm tele vh_tp_hub"; tới nơi thì trận tự mở. Các trận đảo mở khi chạm. */
export const VAN_HAI_PADS: readonly TelePad[] = [
${padLines.join('\n')}
];
`,
);
console.log(`diện tích săn ${areaKm2.toFixed(3)} km², camps ${camps.length}, quái thường ${camps.reduce((a, c) => a + c.count, 0)} (${(camps.reduce((a, c) => a + c.count, 0) / areaKm2).toFixed(1)}/km²), tinh anh ${spawns.length}, prop ${props.length}, cầu ${bridges.length}`);
