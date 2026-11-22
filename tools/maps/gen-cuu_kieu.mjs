// Sinh dữ liệu bản đồ Thiên Lộ Giới (TN-7, chương 7 cuối Đạp Thiên Cửu Kiều), tất định theo seed:
//   packages/content/data/levels/cuu_kieu.terrain.json  (TerrainDef)
//   packages/content/data/levels/cuu_kieu.json          (LevelDef: zones, camps, spawns, pois, spots, nodes, spawn)
//   packages/shared/src/props.cuukieu.ts                (prop bày)
//   packages/shared/src/teleport.cuukieu.ts             (trận truyền tống ck_*)
// Chạy: node tools/maps/gen-cuu_kieu.mjs   (rồi pnpm colliders:bake -- cuu_kieu, pnpm content:check, pnpm map:report --level cuu_kieu)
// Một level nhỏ (~1,3 km, cấp 44–47): cao nguyên cỏ xanh trên biển mây, con đường đá trắng dẫn về phía chín cây cầu. Bốn vùng: Kiều Đầu (trại,
// cầu 1–3 mở ở đây), Đường Mây (tây) và Bia Lộ (đông) là chỗ cày cấp, Bậc Cuối (bắc) là sân cuối, nơi cầu 9 mở ra và đặt boss thế giới Kiều Thủ.
// Chín phòng cầu (`kieu_1…kieu_9`) là level riêng, làm ở các PR sau. Tọa độ trong bảng là offset (m) so với TÂM bản đồ (1024, 1024); +x đông, +z nam,
// Bắc là -z. Kiều Đầu (trại) ở (0, +500). Concept: artifact tn7/concept (Codex), mỹ thuật chi tiết và mood riêng ở PR VFX/ánh sáng.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = 1024;
const SEED = 20261123;
const PLAY = { cx: C, cz: C, half: 660 };
const BOX = { x0: -600, x1: 600, z0: -600, z1: 600 }; // vùng chia cho các vùng săn (offset), cách chân vách >= 60 m
const TRAM = [0, 500]; // Kiều Đầu (trại an toàn)
const R_IN = 70;

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
/** Toạ độ thế giới chính xác 0,01 m (để hình vẽ khớp va chạm đã ghi vào terrain.colliders). */
const Wp = (o) => Math.round((C + o) * 100) / 100;

// ---- vùng: ô Voronoi có trọng số (power diagram). Dòng đi: Kiều Đầu (trại) → Đường Mây (tây) → Bia Lộ (đông) → Bậc Cuối (bắc). `lv` là cấp thiết kế. ----
const ZONES = [
  { id: 'kieu_dau', c: [0, 400], w: 150, lv: [44, 44], color: '#E8EEF0', camps: 6 },
  { id: 'duong_may', c: [-300, 60], w: 240, lv: [44, 45], color: '#7FB08C', camps: 15 },
  { id: 'bia_lo', c: [300, 60], w: 240, lv: [45, 46], color: '#B8A878', camps: 15 },
  { id: 'bac_cuoi', c: [0, -400], w: 250, lv: [46, 47], color: '#C9D4D6', camps: 14 },
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

// ---- trận truyền tống: trạm, mỗi vùng một trận ----
const PADS = [
  { id: 'ck_tp_tram', zone: '', off: [0, 470] },
  { id: 'ck_tp_kieu_dau', zone: 'kieu_dau', off: [-30, 390] },
  { id: 'ck_tp_duong_may', zone: 'duong_may', off: [-300, 70] },
  { id: 'ck_tp_bia_lo', zone: 'bia_lo', off: [300, 70] },
  { id: 'ck_tp_bac_cuoi', zone: 'bac_cuoi', off: [-60, -380] },
];
for (const p of PADS) if (p.zone && zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('trận ngoài vùng: ' + p.id);

// ---- Bia Lộ (ba bia dọc đường; nhiệm vụ `touch`; chín bia tiến độ cầu ở Kiều Đầu làm ở PR sau) ----
const BIA = [
  { id: 'bia_lo_1', zone: 'duong_may', off: [-330, 140] },
  { id: 'bia_lo_2', zone: 'bia_lo', off: [340, 120] },
  { id: 'bia_lo_3', zone: 'bac_cuoi', off: [60, -440] },
];
for (const b of BIA) if (zoneOfOffset(b.off[0], b.off[1])?.id !== b.zone) throw new Error('bia ngoài vùng: ' + b.id);

// ---- điểm đáng chú ý (mỗi vùng một điểm) ----
const POIS = [
  { id: 'kieu_dau_cong', zone: 'kieu_dau', off: [40, 420] },
  { id: 'may_dai', zone: 'duong_may', off: [-380, 20] },
  { id: 'bia_lo_chinh', zone: 'bia_lo', off: [380, 10] },
  { id: 'bac_cuoi_dai', zone: 'bac_cuoi', off: [0, -520] },
];
for (const p of POIS) if (zoneOfOffset(p.off[0], p.off[1])?.id !== p.zone) throw new Error('poi ngoài vùng: ' + p.id);
const BOSS = { off: [-170, -470] }; // Kiều Thủ, sân trống ở Bậc Cuối
const BOSSES = [BOSS];

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
// Kiều Đầu: đèn, lò đan, bia
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
const around = {
  kieu_dau_cong: [COL, COL, ROCK, STONE, LAMP, LAMP],
  may_dai: [ROCK, ROCK, STONE, STUMP, LAMP, LAMP],
  bia_lo_chinh: [COL, ROCK, ROCK, STONE, STONE, LAMP, LAMP],
  bac_cuoi_dai: [COL, COL, COL, ROCK, ROCK, STONE, LAMP, LAMP],
};
for (const p of POIS) ring(p, around[p.id], 5, 5);
// Bia Lộ: bia đá cao + đèn quanh
for (const b of BIA) {
  addProp(STONE, b.off[0], b.off[1], R() * 0.4, 1.3);
  [
    [-5, 5],
    [5, 5],
  ].forEach(([dx, dz]) => addProp(LAMP, b.off[0] + dx, b.off[1] + dz, 0, 1));
}

// ---- tinh anh: Mây Lang Vương (Đường Mây, Bia Lộ), Lộ Thạch Tướng (Bia Lộ, Bậc Cuối) ----
const ELITES = [
  { zone: 'kieu_dau', mon: 'elite_may_lang_vuong', n: 2 },
  { zone: 'duong_may', mon: 'elite_may_lang_vuong', n: 2 },
  { zone: 'bia_lo', mon: 'elite_lo_thach_tuong', n: 2 },
  { zone: 'bac_cuoi', mon: 'elite_lo_thach_tuong', n: 2 },
];

// ---- đường lát đá (mỹ thuật TN-7): đường cong từ cổng Kiều Đầu lên Bậc Cuối, lấy mẫu Catmull-Rom mỗi ~8 m. Client dựng mặt đường + lan can theo
// các điểm này (`apps/client/src/game/world/ckWonders.ts`); camp, cây, prop né đường. ----
const ROAD_CTRL = [
  [0, 436],
  [-6, 398],
  [-90, 300],
  [-125, 190],
  [-85, 80],
  [20, -10],
  [105, -110],
  [95, -230],
  [30, -340],
  [-15, -430],
  [0, -520],
  [0, -580],
];
const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map(
    (k) =>
      0.5 *
      (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
  );
};
const ROAD = [];
for (let i = 0; i < ROAD_CTRL.length - 1; i++) {
  const [p0, p1, p2, p3] = [
    ROAD_CTRL[Math.max(0, i - 1)],
    ROAD_CTRL[i],
    ROAD_CTRL[i + 1],
    ROAD_CTRL[Math.min(ROAD_CTRL.length - 1, i + 2)],
  ];
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = Math.max(2, Math.round(len / 8));
  for (let k = 0; k < n; k++) ROAD.push(catmull(p0, p1, p2, p3, k / n));
}
ROAD.push(ROAD_CTRL[ROAD_CTRL.length - 1]);
const ROAD_HALF = 4.5;
const roadDist = (x, z) => {
  let m = Infinity;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const [ax, az] = ROAD[i];
    const [bx, bz] = ROAD[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    m = Math.min(m, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return m;
};
// Kiều Đầu (hub): cổng vòm đá ở đầu đường, đình có mái bên tây, rạp vải bên đông (client dựng; va chạm trụ ghi vào terrain.colliders).
const HUB = {
  gate: { off: [0, 436], yaw: 0 },
  pavilion: { off: [-36, 466], yaw: 0.35 },
  tent: { off: [30, 478], yaw: -0.3 },
};
// Chuỗi chín nhịp cầu vòm: mười điểm hạ cánh uốn lượn ra ngoài rìa phía bắc (Bậc Cuối là điểm vào), cao dần. Chỉ để nhìn (mỗi cầu là một phòng riêng).
const SPAN = [];
{
  // Chín nhịp dài 60 m trên một cung bán kính 380 m: nhịp đầu đi thẳng về phía bắc từ điểm cuối đường, rồi uốn dần sang đông (vẫn trong bản đồ 2048 m).
  let x = 0;
  let z = -586;
  let phi = 0;
  for (let k = 0; k <= 9; k++) {
    SPAN.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round((72 + 4.2 * k) * 10) / 10]);
    x += Math.sin(phi) * 60;
    z -= Math.cos(phi) * 60;
    phi += 60 / 380;
  }
}
// Khung đường mỗi 4,5 m [x, z, yaw, mở]: lan can đặt hai bên ở các khung đóng; khung "mở" là lối băng ngang (đầu, cuối, và hai khung mỗi 45 m) để đường không chia đôi bản đồ.
const RAIL = [];
{
  let carry = 0;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const [ax, az] = ROAD[i];
    const [bx, bz] = ROAD[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let sdist = carry; sdist < len; sdist += 4.5) {
      const t = sdist / len;
      RAIL.push([
        Math.round((ax + (bx - ax) * t) * 100) / 100,
        Math.round((az + (bz - az) * t) * 100) / 100,
        Math.round(yaw * 1000) / 1000,
        0,
      ]);
      carry = sdist + 4.5 - len;
    }
  }
  RAIL.forEach((f, i) => {
    if (i < 3 || RAIL.length - i <= 3 || i % 10 === 5 || i % 10 === 6) f[3] = 1;
  });
}

const keep = [];
for (const p of PADS) keep.push({ x: p.off[0], z: p.off[1], r: 10 });
for (const p of POIS) keep.push({ x: p.off[0], z: p.off[1], r: 16 });
keep.push({ x: TRAM[0], z: TRAM[1], r: R_IN });
for (const b of BOSSES) keep.push({ x: b.off[0], z: b.off[1], r: 38 });
for (const b of BIA) keep.push({ x: b.off[0], z: b.off[1], r: 10 });
for (const [x, z] of ROAD.filter((_, i) => i % 2 === 0)) keep.push({ x, z, r: ROAD_HALF + 8 });
for (const h of Object.values(HUB)) keep.push({ x: h.off[0], z: h.off[1], r: 18 });

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
  mon: 'boss_kieu_thu',
  x: W(BOSS.off[0]),
  z: W(BOSS.off[1]),
  radius: 6,
  count: 1,
  levelMin: 47,
  levelMax: 47,
  respawn: 1800,
});

// ---- camp (rải điểm xa nhất như Đoạn Mạch) ----
const TARGET_CAMPS = 40;
const TARGET_DENSITY = 130;
const CAMP_R = 30;
const MIX = {
  kieu_dau: [['mon_may_lang', 1]],
  duong_may: [
    ['mon_lo_thach_ve', 0.35],
    ['mon_may_lang', 0.35],
    ['mon_lo_xa', 0.3],
  ],
  bia_lo: [
    ['mon_bia_linh', 0.35],
    ['mon_may_ho', 0.35],
    ['mon_lo_thach_ve', 0.3],
  ],
  bac_cuoi: [
    ['mon_thien_lo_su', 0.4],
    ['mon_bia_linh', 0.3],
    ['mon_may_ho', 0.3],
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
    if (BOSSES.some((b) => Math.hypot(x - b.off[0], z - b.off[1]) < 38)) continue; // đấu trường trống không tính độ phủ
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

// ---- cây cổ thụ, cây vừa, cỏ lau (RNG riêng để không đổi bố cục cụm quái). Cây có va chạm; cỏ lau chỉ để nhìn. ----
const R2 = rng(SEED + 7);
const nearKeep = (x, z, pad) => keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + pad) || roadDist(x, z) < ROAD_HALF + 10;
const TREES = [];
const placeTrees = (n, sMin, sMax, rColl, minGap, edgeBias) => {
  for (let k = 0; k < 4000 && n > 0; k++) {
    const x = BOX.x0 + 40 + R2() * (BOX.x1 - BOX.x0 - 80);
    const z = BOX.z0 + 40 + R2() * (BOX.z1 - BOX.z0 - 80);
    if (!zoneOfOffset(x, z, 12)) continue;
    if (nearKeep(x, z, 6) || TREES.some((t) => Math.hypot(t[0] - x, t[1] - z) < minGap)) continue;
    if (edgeBias && Math.max(Math.abs(x), Math.abs(z)) < 380 && R2() < 0.75) continue; // thưa ở giữa, dày ở rìa
    const s = Math.round((sMin + R2() * (sMax - sMin)) * 100) / 100;
    TREES.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, s, Math.round(R2() * 628) / 100, rColl]);
    n--;
  }
};
placeTrees(8, 1.7, 2.2, 1.6, 70, false);
placeTrees(22, 1.05, 1.5, 1.6, 48, false);
placeTrees(100, 0.55, 0.95, 0.7, 20, true);
for (const t of TREES)
  colliders.push({ x: Math.round((C + t[0]) * 100) / 100, z: Math.round((C + t[1]) * 100) / 100, r: Math.round(t[4] * t[2] * 100) / 100 });
// Đá tảng rêu phủ: tạo hình cho đồng cỏ; có va chạm (bán kính ~ 1,3 × tỉ lệ).
const ROCKS = [];
for (let k = 0; k < 6000 && ROCKS.length < 64; k++) {
  const x = BOX.x0 + 30 + R2() * (BOX.x1 - BOX.x0 - 60);
  const z = BOX.z0 + 30 + R2() * (BOX.z1 - BOX.z0 - 60);
  if (!zoneOfOffset(x, z, 10) || nearKeep(x, z, 4) || roadDist(x, z) < ROAD_HALF + 7) continue;
  if (TREES.some((t) => Math.hypot(t[0] - x, t[1] - z) < 6) || ROCKS.some((r) => Math.hypot(r[0] - x, r[1] - z) < 20)) continue;
  const sc = Math.round((0.9 + R2() * 2.3) * 100) / 100;
  ROCKS.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, sc, Math.round(R2() * 628) / 100]);
  colliders.push({ x: Math.round((C + x) * 100) / 100, z: Math.round((C + z) * 100) / 100, r: Math.round(1.25 * sc * 100) / 100 });
}
// Lan can hai bên đường: một vòng va chạm nhỏ ở mỗi trụ (chừa các khung "mở").
for (const [fx, fz, yaw, open] of RAIL) {
  if (open) continue;
  for (const side of [-1, 1]) {
    const off = ROAD_HALF + 0.35;
    colliders.push({
      x: Math.round((C + fx + Math.cos(yaw) * off * side) * 100) / 100,
      z: Math.round((C + fz - Math.sin(yaw) * off * side) * 100) / 100,
      r: 0.55,
    });
  }
}
const REEDS = [];
for (let k = 0; k < 6000 && REEDS.length < 150; k++) {
  const x = BOX.x0 + 20 + R2() * (BOX.x1 - BOX.x0 - 40);
  const z = BOX.z0 + 20 + R2() * (BOX.z1 - BOX.z0 - 40);
  const d = roadDist(x, z);
  const rim = Math.max(Math.abs(x), Math.abs(z));
  if (!zoneOfOffset(x, z, 8) || (nearKeep(x, z, 2) && d >= ROAD_HALF + 10)) continue;
  if (!((d > ROAD_HALF + 4 && d < 45) || rim > 540)) continue;
  if (TREES.some((t) => Math.hypot(t[0] - x, t[1] - z) < 8)) continue;
  if (REEDS.some((r) => Math.hypot(r[0] - x, r[1] - z) < 16)) continue;
  REEDS.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round((5 + R2() * 5) * 10) / 10]);
}
// Va chạm hub: bốn trụ đình, hai trụ cổng vòm (khớp ckWonders.ts: trụ đình ±5,6 × ±3,6 quay theo yaw; trụ cổng ±6,4 m).
const hubColl = (h, pts, r) => {
  const cs = Math.cos(h.yaw);
  const sn = Math.sin(h.yaw);
  for (const [lx, lz] of pts)
    colliders.push({
      x: Math.round((C + h.off[0] + lx * cs + lz * sn) * 100) / 100,
      z: Math.round((C + h.off[1] - lx * sn + lz * cs) * 100) / 100,
      r,
    });
};
hubColl(
  HUB.pavilion,
  [
    [-5.6, -3.6],
    [5.6, -3.6],
    [-5.6, 3.6],
    [5.6, 3.6],
  ],
  0.8,
);
hubColl(
  HUB.gate,
  [
    [-6.4, 0],
    [6.4, 0],
  ],
  1.5,
);
console.log('cây', TREES.length, 'đá', ROCKS.length, 'khung lan can', RAIL.length, 'cỏ lau', REEDS.length, 'điểm đường', ROAD.length);

// ---- tài nguyên (tạm: linh thảo; chương 7 chưa có nguyên liệu hái riêng) ----
const nodes = [
  { item: 'itm_linh_thao', x: W(-280), z: W(120), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(300), z: W(100), radius: 60, count: 5, respawn: 60 },
  { item: 'itm_linh_thao', x: W(-100), z: W(-380), radius: 60, count: 5, respawn: 60 },
];

// ---- địa hình: vùng đá tro lạnh, trạm/trận/điểm/bia phẳng, ba sân boss ----
const flat = (id, off, y, flatR, outerR, extra = {}) => ({ id, x: W(off[0]), z: W(off[1]), y, flatR, outerR, round: true, ...extra });
const Y = 70;
const feats = [flat('tram', TRAM, Y, 62, 175, { detail: 0.3 })];
for (const p of PADS.slice(1)) feats.push(flat('pad_' + p.id.replace('ck_', ''), p.off, Y, 26, 90));
for (const p of POIS) feats.push(flat('poi_' + p.id, p.off, Y, 24, 70));
for (const b of BIA) feats.push(flat(b.id, b.off, Y, 14, 50));
BOSSES.forEach((b, i) => feats.push(flat('san_' + i, b.off, Y - 2, 44, 120, { detail: 1.2 })));
// Va chạm: bia đá (r 1,3) ở ba Bia Lộ; còn lại do trụ/đá/gốc cây theo PROP_LIB.
const wc = (x, z, r) =>
  colliders.push({ x: Math.round((C + x) * 100) / 100, z: Math.round((C + z) * 100) / 100, r: Math.round(r * 100) / 100 });
for (const b of BIA) wc(b.off[0], b.off[1], 1.3);
const terrain = {
  id: 'cuu_kieu',
  seed: SEED,
  size: 2048,
  margin: 24,
  natural: {
    freq: 0.0016,
    baseOct: 4,
    ridgeOct: 3,
    level: Y,
    baseAmp: 15,
    ridgeAmp: 44,
    maskFreq: 0.0011,
    maskOct: 2,
    maskLo: -0.35,
    maskHi: 0.25,
    edge: { amp: 45, r0: 260, r1: 30 },
  },
  features: feats,
  // Vách gồ ghề có bậc (mỹ thuật TN-3): chân vách lùi theo nhiễu, dốc dài 130 m chia 5 bậc.
  // Rìa cao nguyên tụt xuống biển mây (wallH ÂM): ngoài chân rìa đất rơi 210 m, biển mây thấp (`seaY`) phủ phía dưới, núi viền xa dựng bằng `natural.edge`.
  seaY: 4,
  play: { cx: PLAY.cx, cz: PLAY.cz, half: PLAY.half, wallH: -210, rough: { amp: 45, freq: 0.007, ramp: 80, steps: 2 } },
  colliders,
};

const level = {
  id: 'cuu_kieu',
  minLevel: 44, // chương 7 từ Dương Thực sơ kỳ (sau kiếp 43→44); server kiểm ở requestLevel
  spawn: { x: W(TRAM[0]), z: W(TRAM[1] + 12) },
  zones: ZONES.map((z) => ({ id: z.id, lvMin: z.lv[0], lvMax: z.lv[1], color: z.color, music: 'wild', poly: z.poly })),
  pois: POIS.map((p) => ({ id: p.id, zone: p.zone, x: W(p.off[0]), z: W(p.off[1]), beamH: 30 })),
  spots: BIA.map((b) => ({ id: b.id, zone: b.zone, x: W(b.off[0]), z: W(b.off[1]) })),
  camps,
  spawns,
  nodes,
};

const out = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
out('packages/content/data/levels/cuu_kieu.terrain.json', JSON.stringify(terrain, null, 2) + '\n');
out('packages/content/data/levels/cuu_kieu.json', JSON.stringify(level, null, 2) + '\n');
const art = (name, rows) =>
  `export const ${name} = [\n${rows.map((r) => '  ' + JSON.stringify(r).replace(/,/g, ', ')).join(',\n')},\n] as const;`;
const roadW = ROAD.map(([x, z]) => [Math.round((C + x) * 10) / 10, Math.round((C + z) * 10) / 10]);
out(
  'packages/shared/src/cuukieu.art.ts',
  `// Dữ liệu mỹ thuật Thiên Lộ Giới (TN-7): đường lát đá, cây, cỏ lau, chuỗi cầu, hub. SINH BẰNG tools/maps/gen-cuu_kieu.mjs: sửa ở đó rồi chạy lại.\n// Tọa độ thế giới (m). Chỉ để dựng hình ở client (va chạm cây/trụ đã nằm trong terrain.colliders).\n\n/** Đường tim mặt đường (x, z), cách nhau ~8 m; nửa bề rộng ${ROAD_HALF} m. */\n${art('CUU_KIEU_ROAD', roadW)}\nexport const CUU_KIEU_ROAD_HALF = ${ROAD_HALF};\n\n/** Cây: [x, z, tỉ lệ, xoay, bán kính va chạm tại tỉ lệ 1]; tỉ lệ ≥ 1 là cổ thụ. */\n${art(
    'CUU_KIEU_TREES',
    TREES.map((t) => [Wp(t[0]), Wp(t[1]), t[2], t[3], t[4]]),
  )}\n\n/** Khung đường mỗi 4,5 m: [x, z, yaw, mở]; lan can ở khung đóng (0), khung mở (1) là lối băng ngang. */\n${art(
    'CUU_KIEU_RAIL',
    RAIL.map((f) => [Wp(f[0]), Wp(f[1]), f[2], f[3]]),
  )}\n\n/** Đá tảng: [x, z, tỉ lệ, xoay]; va chạm bán kính ~1,25 × tỉ lệ. */\n${art(
    'CUU_KIEU_ROCKS',
    ROCKS.map((r) => [Wp(r[0]), Wp(r[1]), r[2], r[3]]),
  )}\n\n/** Bụi cỏ lau trắng: [x, z, bán kính]. */\n${art(
    'CUU_KIEU_REEDS',
    REEDS.map((r) => [Wp(r[0]), Wp(r[1]), r[2]]),
  )}\n\n/** Mười điểm hạ cánh của chín nhịp cầu vòm (x, z, độ cao mặt cầu); nhịp k nối điểm k−1 với điểm k. */\n${art(
    'CUU_KIEU_SPAN',
    SPAN.map((p) => [Wp(p[0]), Wp(p[1]), p[2]]),
  )}\n\n/** Hub Kiều Đầu: cổng vòm ở đầu đường, đình có mái, rạp vải. */\nexport const CUU_KIEU_HUB = {\n  gate: { x: ${W(HUB.gate.off[0])}, z: ${W(HUB.gate.off[1])}, yaw: ${HUB.gate.yaw} },\n  pavilion: { x: ${W(HUB.pavilion.off[0])}, z: ${W(HUB.pavilion.off[1])}, yaw: ${HUB.pavilion.yaw} },\n  tent: { x: ${W(HUB.tent.off[0])}, z: ${W(HUB.tent.off[1])}, yaw: ${HUB.tent.yaw} },\n} as const;\n`,
);
const propLines = props.map((p) => `  { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${p.s} },`);
out(
  'packages/shared/src/props.cuukieu.ts',
  `// Prop bày của Thiên Lộ Giới (TN-7). SINH BẰNG tools/maps/gen-cuu_kieu.mjs: sửa ở đó rồi chạy lại.
// Va chạm của trụ/đá/gốc cây nằm ở \`terrain.colliders\` (cuu_kieu.terrain.json), tính từ PROP_LIB theo vị trí và xoay.
import type { HandProp } from './props.types';

export const CUU_KIEU_PROPS: readonly HandProp[] = [
${propLines.join('\n')}
];
`,
);
const padLines = PADS.map(
  (p) => `  { id: '${p.id}', level: 'cuu_kieu', face: { x: ${C}, z: ${C} }, zone: '${p.zone}', x: ${W(p.off[0])}, z: ${W(p.off[1])} },`,
);
out(
  'packages/shared/src/teleport.cuukieu.ts',
  `// Truyền Tống Trận của Thiên Lộ Giới (TN-7, tiền tố ck_). SINH BẰNG tools/maps/gen-cuu_kieu.mjs.
// ck_tp_tram nhận khách từ ngoài (mở bằng nhiệm vụ chương 7 hoặc "/gm tele ck_tp_tram"); mỗi vùng còn lại một trận, mở khi đứng lên bệ.
import type { TelePad } from './teleport.types';

export const CUU_KIEU_PADS: readonly TelePad[] = [
${padLines.join('\n')}
];
`,
);
console.log(
  `camps ${camps.length}, quái thường ${camps.reduce((a, c) => a + c.count, 0)} (${(camps.reduce((a, c) => a + c.count, 0) / hunted).toFixed(0)}/km²), tinh anh+boss ${spawns.length}, prop ${props.length}, collider ${colliders.length}`,
);
