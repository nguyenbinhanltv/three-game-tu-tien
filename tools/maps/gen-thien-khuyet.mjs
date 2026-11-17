// Sinh dữ liệu bản đồ Thiên Khuyết Cổ Thành (E4-A), tất định theo seed:
//   packages/content/data/levels/thien_khuyet.terrain.json  (TerrainDef)
//   packages/content/data/levels/thien_khuyet.json          (LevelDef: zones, camps, spawns, pois, nodes, spawn)
//   packages/shared/src/props.thienkhuyet.ts                (prop bày)
//   packages/shared/src/teleport.thienkhuyet.ts             (trận truyền tống tk_*)
// Chạy: node tools/maps/gen-thien-khuyet.mjs   (rồi pnpm content:check, pnpm map:report --level thien_khuyet)
// Tọa độ trong bảng là offset (m) so với Ngoại Thành Trạm (0, 0); +x đông, +z nam. Thế giới 2048 m, trạm ở (1024, 1024).
// Vùng chơi 1,5 × 1,5 km lệch về phía bắc (Điện Tiền Quảng Trường ở z = -640). Quái trong bảng MIX/ELITES là CHỖ ĐỨNG TẠM
// (mẫu quái Đoạn Mạch/Vân Hải) tới khi E4-B có quái riêng: đổi id ở đó (không đổi vị trí vì thứ tự random không phụ thuộc id).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = 1024;
const SEED = 20261117;
const PLAY = { cx: C + 20, cz: C - 140, half: 760 };
const BOX = { x0: -690, x1: 730, z0: -850, z1: 570 }; // vùng chia cho các vùng săn (offset), cách chân vách >= 40 m
const R_IN = 75; // Ngoại Thành Trạm an toàn

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
  { id: 'dai_lo_den_troi', c: [60, -280], w: 262, lv: [24, 25], color: '#3F7F8F', camps: 12 },
  { id: 'lam_sao_vien', c: [-380, -40], w: 205, lv: [24, 25], color: '#2F5E88', camps: 12 },
  { id: 'binh_khi_kho', c: [420, -90], w: 205, lv: [25, 26], color: '#8A6A3E', camps: 13 },
  { id: 'dien_tien_quang_truong', c: [20, -640], w: 215, lv: [26, 27], color: '#9A8C6A', camps: 14 },
  { id: 'mo_dao', c: [-60, 420], w: 175, lv: [24, 26], color: '#5A4A7A', camps: 9 },
];
const inBox = (x, z) => x >= BOX.x0 && x <= BOX.x1 && z >= BOX.z0 && z <= BOX.z1;
const cellOf = (x, z) => {
  if (!inBox(x, z) || Math.hypot(x, z) < R_IN) return null;
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
const PADS = [
  { id: 'tk_tp_tram', zone: '', off: [0, -38] },
  { id: 'tk_tp_dai_lo', zone: 'dai_lo_den_troi', off: [-34, -190] },
  { id: 'tk_tp_lam_sao', zone: 'lam_sao_vien', off: [-290, -30] },
  { id: 'tk_tp_binh_khi', zone: 'binh_khi_kho', off: [320, -60] },
  { id: 'tk_tp_dien_tien', zone: 'dien_tien_quang_truong', off: [-40, -560] },
  { id: 'tk_tp_mo_dao', zone: 'mo_dao', off: [-60, 290] },
];
for (const p of PADS) if (p.zone && zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('trận ngoài vùng: ' + p.id);

// ---- điểm đáng chú ý ----
const POIS = [
  { id: 'hang_tru_khac_van', zone: 'dai_lo_den_troi', off: [120, -340] },
  { id: 'tinh_bai_dai', zone: 'lam_sao_vien', off: [-410, -70] },
  { id: 'kho_giao', zone: 'binh_khi_kho', off: [440, -120] },
  { id: 'cong_than_tang_dien', zone: 'dien_tien_quang_truong', off: [20, -780] },
  { id: 'co_thanh_that_lo', zone: 'mo_dao', off: [-60, 480] },
];
for (const p of POIS) if (zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('poi ngoài vùng: ' + p.id);
const BOSS = { off: [-60, 480] }; // Thiên Khuyết Thủ Linh (E4-B): đấu trường trống, chưa đặt quái

// ---- prop (asset PROP_LIB co_thanh + vài prop Vân Lam sẵn có làm đệm) ----
const LIB_COLL = {
  prop_tru_da_khac_van: [[0, 0, 1.4]],
  prop_dai_tinh_bai: [[0, 0, 3.8]],
  prop_cong_thanh_vo: [[-8, 0, 4.5], [8, 0, 4.5]],
  prop_tuong_da_vo_si: [[-3.3, 0, 2.8], [0, 0, 2.8], [3.3, 0, 2.8]],
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
// Ngoại Thành Trạm: Cổng Thành Vỡ phía bắc, đèn trời, Ngưng Đan Lô là lò đan, bia
addProp('prop_cong_thanh_vo', 0, -100, 0, 1);
for (const [x, z] of [[-14, -22], [14, -22], [-24, 16], [24, 16], [0, -56], [-30, -60], [30, -60]]) addProp(LAMP, x, z, 0, 1);
addProp('prop_ngung_dan_lo', 14, 10, 0.6, 1);
addProp('prop_bia_da', -16, 12, 0.2, 1);
// Đại Lộ Đèn Trời: hai hàng trụ đá khắc vân, đèn xen giữa, dọc trục (0,-130) → (20,-560)
const AV = (z) => [(20 * (-z - 100)) / 460, z]; // trục đại lộ theo z (x trôi 0 → 20)
const AVZ = [];
for (let z = -140; z >= -560; z -= 42) AVZ.push(z);
AVZ.forEach((z, i) => {
  const [ax] = AV(z);
  for (const side of [-1, 1]) {
    addProp(COL, ax + side * 13, z, side > 0 ? 0.2 : -0.2, 1);
    addProp(LAMP, ax + side * 9, z - 21, 0, 1);
  }
  if (i % 3 === 1) addProp('prop_bia_da', ax + 6 * (i % 2 ? 1 : -1), z + 8, 0.4, 1);
});
// Điện Tiền Quảng Trường: tượng đá võ sĩ nghiêng đổ ở quanh quảng trường
for (const [x, z, y] of [[-70, -590, 0.4], [105, -600, -0.5], [-95, -690, 1.1], [130, -680, 2.4]]) addProp('prop_tuong_da_vo_si', x, z, y, 1);
for (const [x, z] of [[-30, -620], [60, -630], [10, -700], [-60, -740], [95, -740]]) addProp(LAMP, x, z, 0, 1);
// POI
const around = {
  hang_tru_khac_van: [COL, COL, COL, COL, COL, COL, LAMP, LAMP],
  tinh_bai_dai: [LAMP, LAMP, LAMP, LAMP, 'prop_da_dung', 'prop_da_dung', 'prop_bia_da'],
  kho_giao: ['prop_kiem_gay', 'prop_kiem_gay', 'prop_kiem_gay', 'prop_kiem_gay', 'prop_bia_da', COL, LAMP],
  cong_than_tang_dien: [LAMP, LAMP, LAMP, LAMP, COL, COL],
  co_thanh_that_lo: [COL, 'prop_cay_goc_kho', 'prop_cay_goc_kho', 'prop_kiem_gay', 'prop_kiem_gay', 'prop_bia_da', LAMP, LAMP],
};
for (const p of POIS) {
  if (p.id === 'tinh_bai_dai') addProp('prop_dai_tinh_bai', p.off[0], p.off[1], 0, 1);
  if (p.id === 'cong_than_tang_dien') {
    addProp('prop_cong_thanh_vo', p.off[0], p.off[1], 0, 1);
    addProp('prop_tuong_da_vo_si', p.off[0] - 30, p.off[1] + 14, 0.3, 1);
    addProp('prop_tuong_da_vo_si', p.off[0] + 30, p.off[1] + 14, -0.3, 1);
    // đèn trước cổng và hai trụ ngoài rìa (trong 14 m của điểm, tránh vòng va chạm hai trụ cổng)
    [[-5, 10, LAMP], [5, 10, LAMP], [-12, 7, LAMP], [12, 7, LAMP], [-13, -5, COL], [13, -5, COL]].forEach(([dx, dz, id]) => addProp(id, p.off[0] + dx, p.off[1] + dz, 0, 1));
    continue;
  }
  ring(p, around[p.id], p.id === 'tinh_bai_dai' ? 10 : 5, 4);
}
addProp('prop_kiem_gay', 232, -52, 0.9, 1);

// ---- tinh anh (chỗ đứng tạm, xem đầu tệp) ----
const ELITES = [
  { zone: 'dai_lo_den_troi', mon: 'elite_ho_mach_khoi_tuong', n: 2 },
  { zone: 'lam_sao_vien', mon: 'elite_van_hac_vuong', n: 2 },
  { zone: 'binh_khi_kho', mon: 'elite_liet_cot_bao', n: 3 },
  { zone: 'dien_tien_quang_truong', mon: 'elite_kinh_dien_ma_quan', n: 3 },
  { zone: 'mo_dao', mon: 'elite_liet_cot_bao', n: 2 },
];

const keep = [];
for (const p of PADS) keep.push({ x: p.off[0], z: p.off[1], r: 10 });
for (const p of POIS) keep.push({ x: p.off[0], z: p.off[1], r: 16 });
keep.push({ x: 0, z: 0, r: R_IN });
keep.push({ x: BOSS.off[0], z: BOSS.off[1], r: 38 });
for (const z of AVZ) keep.push({ x: AV(z)[0], z, r: 2 });
for (const [x, z] of [[-70, -590], [105, -600], [-95, -690], [130, -680]]) keep.push({ x, z, r: 6 });

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

// ---- camp (rải điểm xa nhất như Đoạn Mạch) ----
const TARGET_CAMPS = 64;
const TARGET_DENSITY = 120;
const CAMP_R = 30;
const MIX = {
  dai_lo_den_troi: [['mon_khai_mach_khoi_loi', 1]], // Thạch Tượng Võ Sĩ (tạm)
  lam_sao_vien: [['mon_van_hac', 1]], // Dạ Minh Lộc (tạm)
  binh_khi_kho: [['mon_mach_thuong_ho_ve', 0.5], ['mon_kinh_linh', 0.5]], // Chiến Ma + Cốt Vệ (tạm)
  dien_tien_quang_truong: [['mon_khai_mach_khoi_loi', 0.4], ['mon_mach_thuong_ho_ve', 0.3], ['mon_kinh_linh', 0.3]],
  mo_dao: [['mon_mach_thuong_ho_ve', 1]], // Cốt Vệ Kiếm Thủ (tạm)
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
    if (Math.hypot(x - BOSS.off[0], z - BOSS.off[1]) < 38) continue; // đấu trường trống không tính độ phủ
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
      const x = lx * c - lz * sn - 30;
      const z = lx * sn + lz * c - 140;
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
for (let k = 0; camps.length < TARGET_CAMPS + 16; k++) {
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

// ---- tài nguyên (tạm: linh thảo; Thiên Khuyết chưa có nguyên liệu riêng) ----
const nodes = [
  { item: 'itm_linh_thao', x: W(-200), z: W(200), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(250), z: W(-420), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(-480), z: W(-300), radius: 60, count: 5, respawn: 60 },
];

// ---- địa hình ----
const flat = (id, off, y, flatR, outerR, extra = {}) => ({ id, x: W(off[0]), z: W(off[1]), y, flatR, outerR, round: true, ...extra });
const Y = 80;
const feats = [flat('tram', [0, 0], Y, 62, 175, { detail: 0.3 })];
for (let z = -100, i = 0; z >= -560; z -= 34, i++) feats.push(flat(`dl_${i}`, AV(z), Y, 22, 70));
feats.push(flat('quang_truong', [20, -650], Y, 120, 200, { detail: 0.6 }));
for (const p of PADS.slice(1)) feats.push(flat('pad_' + p.zone, p.off, Y, 26, 90));
for (const p of POIS) feats.push(flat('poi_' + p.id, p.off, Y, 24, 70));
feats.push(flat('boss', BOSS.off, Y - 2, 44, 120, { detail: 1.5 }));
const terrain = {
  id: 'thien_khuyet',
  seed: SEED,
  size: 2048,
  margin: 24,
  natural: { freq: 0.0018, baseOct: 4, ridgeOct: 3, level: Y, baseAmp: 9, ridgeAmp: 38, maskFreq: 0.0012, maskOct: 2, maskLo: -0.5, maskHi: 0.25, edge: { amp: 120, r0: 300, r1: 20 } },
  features: feats,
  play: { cx: PLAY.cx, cz: PLAY.cz, half: PLAY.half, wallH: 260 },
  colliders,
};

const level = {
  id: 'thien_khuyet',
  spawn: { x: C, z: C + 12 },
  zones: ZONES.map((z) => ({ id: z.id, lvMin: z.lv[0], lvMax: z.lv[1], color: z.color, music: 'wild', poly: z.poly })),
  pois: POIS.map((p) => ({ id: p.id, zone: p.zone, x: W(p.off[0]), z: W(p.off[1]), beamH: 80 })),
  camps,
  spawns,
  nodes,
};

const out = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
out('packages/content/data/levels/thien_khuyet.terrain.json', JSON.stringify(terrain, null, 2) + '\n');
out('packages/content/data/levels/thien_khuyet.json', JSON.stringify(level, null, 2) + '\n');
const propLines = props.map((p) => `  { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${p.s} },`);
out(
  'packages/shared/src/props.thienkhuyet.ts',
  `// Prop bày của Thiên Khuyết Cổ Thành (E4-A). SINH BẰNG tools/maps/gen-thien-khuyet.mjs: sửa ở đó rồi chạy lại.
// Va chạm của cổng/tượng/trụ nằm ở \`terrain.colliders\` (thien_khuyet.terrain.json), tính từ PROP_LIB theo vị trí và xoay.
import type { HandProp } from './props';

export const THIEN_KHUYET_PROPS: readonly HandProp[] = [
${propLines.join('\n')}
];
`,
);
const padLines = PADS.map((p) => `  { id: '${p.id}', level: 'thien_khuyet', face: { x: ${C}, z: ${C} }, zone: '${p.zone}', x: ${W(p.off[0])}, z: ${W(p.off[1])} },`);
out(
  'packages/shared/src/teleport.thienkhuyet.ts',
  `// Truyền Tống Trận của Thiên Khuyết Cổ Thành (E4-A, tiền tố tk_). SINH BẰNG tools/maps/gen-thien-khuyet.mjs.
import type { TelePad } from './teleport';

/** Trận trạm (tk_tp_tram) mở khóa sau nhiệm vụ chương 3 (E4-H: unlockTele) hoặc "/gm tele tk_tp_tram"; tới nơi thì trận tự mở. Các trận vùng mở khi chạm. */
export const THIEN_KHUYET_PADS: readonly TelePad[] = [
${padLines.join('\n')}
];
`,
);
console.log(`camps ${camps.length}, quái thường ${camps.reduce((a, c) => a + c.count, 0)} (${(camps.reduce((a, c) => a + c.count, 0) / hunted).toFixed(0)}/km²), tinh anh ${spawns.length}, prop ${props.length}, collider ${colliders.length}`);
