// Sinh dữ liệu bản đồ Đoạn Mạch Cổ Cốc (E2-A), tất định theo seed:
//   packages/content/data/levels/doan_mach.terrain.json  (TerrainDef)
//   packages/content/data/levels/doan_mach.json          (LevelDef: zones, camps, spawns, pois, nodes, spawn)
//   packages/shared/src/props.doanmach.ts                (prop bày + va chạm)
//   packages/shared/src/teleport.doanmach.ts             (trận truyền tống dm_*)
// Chạy: node tools/maps/gen-doan-mach.mjs   (rồi pnpm content:check, pnpm map:report --level doan_mach)
// Tọa độ trong bảng là offset (m) so với trạm trung tâm (0, 0); +x đông, +z nam. Thế giới 2048 m, trạm ở (1024, 1024).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = 1024;
const SEED = 20261116;
const HALF = 780; // nửa cạnh vùng chơi (ô vuông bo tròn); chân vách ở HALF - 10
const R_OUT = 700; // biên ngoài các vùng (chuẩn 4 quanh trạm), cách chân vách 70 m
const R_IN = 75; // trạm an toàn: không có quái trong bán kính này

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
const rint = (a, b) => a + Math.floor(R() * (b - a + 1));
const W = (o) => Math.round(C + o); // offset → tọa độ thế giới
const norm4 = (x, z) => Math.sqrt(Math.sqrt(x ** 4 + z ** 4));
const deg = (d) => (d * Math.PI) / 180;

// ---- vùng: hình quạt quanh trạm, biên uốn lượn (khoét đĩa trạm), biên ngoài là ô vuông bo tròn chuẩn 4 ----
// Năm tia biên (độ, z hướng nam): giữa các vùng. Tia thứ k uốn theo r: B(k, r) = góc gốc + sóng.
const BASE = [14, 66, 145, 233, 313];
const wob = (k, r) => 8 * Math.sin(r / 110 + k * 1.7) + 4.5 * Math.sin(r / 47 + k * 0.9);
const B = (k, r) => BASE[k % 5] + (k >= 5 ? 360 : 0) + wob(k % 5, r);
const ZONES = [
  { id: 'sa_thach_pha', k: 0, lv: [16, 17], color: '#A8763E', camps: 11, padR: 280, floor: 84 },
  { id: 'hoang_sa_huyet', k: 1, lv: [18, 19], color: '#D2B27A', camps: 12, padR: 300, floor: 70 },
  { id: 'cuu_mo_khu', k: 2, lv: [18, 19], color: '#8A4B2A', camps: 15, padR: 300, floor: 76 },
  { id: 'tuyet_bich', k: 3, lv: [19, 19], color: '#2B5552', camps: 10, padR: 430, floor: 92 },
  { id: 'kho_ha_dao', k: 4, lv: [17, 18], color: '#B58B4C', camps: 12, padR: 330, floor: 66 },
];
// vùng k nằm giữa tia k và tia k+1 (vùng cuối nối tia 4 với tia 0 + 360)
const edgeA = (z, r) => B(z.k, r);
const edgeB = (z, r) => B(z.k + 1, r);
const polarDeg = (r, d) => [r * Math.cos(deg(d)), r * Math.sin(deg(d))];
const outerPt = (a, r) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = r / Math.sqrt(Math.sqrt(c ** 4 + s ** 4));
  return [k * c, k * s];
};
/** Đường biên theo tia: từ R_IN ra tới khi chạm biên ngoài. */
function curve(angleAt) {
  const pts = [];
  let r = R_IN;
  for (; ; r += 20) {
    const p = polarDeg(r, angleAt(r));
    if (norm4(p[0], p[1]) > R_OUT) break;
    pts.push(p);
  }
  let lo = r - 20;
  let hi = r;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    const p = polarDeg(m, angleAt(m));
    if (norm4(p[0], p[1]) > R_OUT) hi = m;
    else lo = m;
  }
  pts.push(polarDeg(lo, angleAt(lo)));
  return pts;
}
for (const z of ZONES) {
  const cA = curve((r) => edgeA(z, r));
  const cB = curve((r) => edgeB(z, r));
  const poly = [];
  // đĩa trạm: cung từ tia A tới tia B
  const aIn0 = edgeA(z, R_IN);
  const aIn1 = edgeB(z, R_IN);
  for (let d = aIn0; d < aIn1; d += 10) poly.push(polarDeg(R_IN, d));
  poly.push(...cB);
  // cung ngoài từ cuối tia B quay về cuối tia A
  const lastA = cA[cA.length - 1];
  const lastB = cB[cB.length - 1];
  const angB = Math.atan2(lastB[1], lastB[0]);
  let angA = Math.atan2(lastA[1], lastA[0]);
  while (angA > angB) angA -= 2 * Math.PI;
  for (let t = angB - deg(4); t > angA; t -= deg(4)) poly.push(outerPt(t, R_OUT));
  poly.push(...cA.slice().reverse());
  z.poly = poly.map(([x, zz]) => [W(x), W(zz)]);
  z.midAt = (r) => (edgeA(z, r) + edgeB(z, r)) / 2;
}
const zoneOfOffset = (x, z) => {
  const r = Math.hypot(x, z);
  if (r < R_IN + 28 || norm4(x, z) > R_OUT - 30) return null;
  const a = (Math.atan2(z, x) * 180) / Math.PI;
  for (const zn of ZONES) {
    const a0 = edgeA(zn, r);
    const a1 = edgeB(zn, r);
    let aa = a;
    while (aa < a0) aa += 360;
    while (aa >= a0 + 360) aa -= 360;
    if (aa < a1) {
      // cách hai tia biên ≥ 22 m
      if (r * Math.sin(deg(aa - a0)) < 22 || r * Math.sin(deg(a1 - aa)) < 22) return null;
      return zn;
    }
  }
  return null;
};

// ---- trận truyền tống ----
const polar = (r, a) => [r * Math.cos(deg(a)), r * Math.sin(deg(a))];
const PADS = [{ id: 'dm_tp_tram', zone: '', off: [0, -38] }];
for (const z of ZONES) PADS.push({ id: 'dm_tp_' + z.id.replace(/_pha$|_dao$|_huyet$|_khu$/, ''), zone: z.id, off: polar(z.padR, z.midAt(z.padR)) });
// id gọn: dm_tp_sa_thach, dm_tp_kho_ha, dm_tp_hoang_sa, dm_tp_cuu_mo, dm_tp_tuyet_bich
PADS.find((p) => p.zone === 'tuyet_bich').id = 'dm_tp_tuyet_bich';

// ---- điểm đáng chú ý ----
const POIS = [
  { id: 'mach_tinh_tru', zone: 'sa_thach_pha', off: [255, 175] },
  { id: 'cau_da_gay', zone: 'kho_ha_dao', off: [480, -50] },
  { id: 'ho_sa_lun', zone: 'hoang_sa_huyet', off: [-70, 500] },
  { id: 'cong_mo', zone: 'cuu_mo_khu', off: [-440, -80] },
  { id: 'vach_dut_mach', zone: 'tuyet_bich', off: [20, -540] },
];
// Prop sẵn có làm chỗ đứng cho đến khi PROP_LIB (#118) vào (xem docs/e2-map/README.md, bảng "Chỗ để PROP_LIB").
const POI_KIT = {
  mach_tinh_tru: ['prop_da_dung', 'prop_da_dung', 'prop_da_nam', 'prop_da_phien', 'prop_da_phien', 'prop_den_da', 'prop_da_nam', 'prop_linh_thao'],
  cau_da_gay: ['prop_da_phien', 'prop_da_phien', 'prop_kiem_gay', 'prop_da_nam', 'prop_da_dung', 'prop_da_phien', 'prop_den_da', 'prop_duong_xi'],
  ho_sa_lun: ['prop_da_nam', 'prop_da_nam', 'prop_da_phien', 'prop_duong_xi', 'prop_kiem_gay', 'prop_da_dung', 'prop_da_phien', 'prop_bia_da'],
  cong_mo: ['prop_lo_dan', 'prop_lau', 'prop_da_dung', 'prop_den_da', 'prop_da_nam', 'prop_da_phien', 'prop_kiem_gay', 'prop_den_da'],
  vach_dut_mach: ['prop_bia_da', 'prop_da_dung', 'prop_da_dung', 'prop_da_nam', 'prop_kiem_gay', 'prop_da_phien', 'prop_da_phien', 'prop_den_da'],
};
const COLL_R = { prop_da_dung: 1.2, prop_da_nam: 1.0, prop_bia_da: 0.9, prop_lau: 1.4, prop_lo_dan: 1.0 };
const props = [];
const addProp = (id, ox, oz, yaw, s = 1) => {
  const p = { id, x: W(ox), z: W(oz), yaw: Math.round(yaw * 100) / 100, s };
  if (COLL_R[id]) p.r = COLL_R[id] * s;
  props.push(p);
};
for (const p of POIS) {
  const kit = POI_KIT[p.id];
  kit.forEach((id, i) => {
    const a = (i / kit.length) * Math.PI * 2 + R() * 0.5;
    const r = 4.5 + R() * 6;
    addProp(id, p.off[0] + Math.cos(a) * r, p.off[1] + Math.sin(a) * r, R() * Math.PI * 2, 0.9 + R() * 0.3);
  });
}
// Trạm Hạ Khuyết: đèn, lò đan nhỏ, bia
addProp('prop_lo_dan', 14, 8, 0.6, 1);
addProp('prop_lau', -16, 10, -0.4, 1);
addProp('prop_bia_da', 0, 22, 0, 1);
for (const [x, z] of [[-12, -22], [12, -22], [-22, 14], [22, 14], [0, -8]]) addProp('prop_den_da', x, z, 0, 1);

// ---- tinh anh / boss ----
const ELITES = [
  { zone: 'sa_thach_pha', mon: 'elite_liet_cot_bao', n: 2 },
  { zone: 'kho_ha_dao', mon: 'elite_ho_mach_khoi_tuong', n: 2 },
  { zone: 'hoang_sa_huyet', mon: 'elite_xich_sa_ngo_cong', n: 3 },
  { zone: 'cuu_mo_khu', mon: 'elite_ho_mach_khoi_tuong', n: 2 },
  { zone: 'cuu_mo_khu', mon: 'elite_liet_cot_bao', n: 1 },
  { zone: 'tuyet_bich', mon: 'elite_xich_sa_ngo_cong', n: 2 },
];
const BOSS = { off: [30, -620] };

// ---- vật cản dùng khi đặt camp ----
const keep = []; // {x,z,r}: vùng cấm camp (cách tâm camp ≥ r + camp.radius)
for (const p of PADS) keep.push({ x: p.off[0], z: p.off[1], r: 10 });
for (const p of POIS) keep.push({ x: p.off[0], z: p.off[1], r: 22 });
keep.push({ x: 0, z: 0, r: R_IN });
keep.push({ x: BOSS.off[0], z: BOSS.off[1], r: 45 });

// tinh anh: đặt trước, rải đều theo vùng, xa trạm
const spawns = [];
const eliteAt = [];
for (const e of ELITES) {
  const zn = ZONES.find((z) => z.id === e.zone);
  for (let i = 0; i < e.n; i++) {
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 400; k++) {
      const r = 200 + R() * 440;
      const a = edgeA(zn, r) + 12 + R() * (edgeB(zn, r) - edgeA(zn, r) - 24);
      const [x, z] = polar(r, a);
      if (zoneOfOffset(x, z) !== zn || norm4(x, z) > R_OUT - 50) continue;
      if (keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 40)) continue;
      const d = Math.min(...eliteAt.map((q) => Math.hypot(q.x - x, q.z - z)), 9999);
      if (d > bestD) {
        bestD = d;
        best = [x, z];
      }
    }
    eliteAt.push({ x: best[0], z: best[1] });
    const lvMax = zn.lv[1];
    spawns.push({ mon: e.mon, x: W(best[0]), z: W(best[1]), radius: 10, count: 1, levelMin: lvMax, levelMax: lvMax, respawn: 240 });
    keep.push({ x: best[0], z: best[1], r: 28 });
  }
}
spawns.push({ mon: 'boss_dia_mach_long', x: W(BOSS.off[0]), z: W(BOSS.off[1]), radius: 6, count: 1, levelMin: 19, levelMax: 19, respawn: 1800 });

// ---- camp ----
const MIX = {
  sa_thach_pha: { mons: [['mon_thach_giap_te', 1]], ranged: null },
  kho_ha_dao: { mons: [['mon_thach_giap_te', 0.5], ['mon_khai_mach_khoi_loi', 0.5]], ranged: null },
  hoang_sa_huyet: { mons: [['mon_ngo_cong_au', 0.7], ['mon_thach_giap_te', 0.3]], ranged: null },
  cuu_mo_khu: { mons: [['mon_khai_mach_khoi_loi', 0.5], ['mon_mach_thuong_ho_ve', 0.5]], ranged: ['mon_ngo_cong_au', 0.3] },
  tuyet_bich: { mons: [['mon_thach_giap_te', 0.5], ['mon_ngo_cong_au', 0.5]], ranged: null },
};
const pick = (list) => {
  let t = R();
  for (const [m, w] of list) {
    if ((t -= w) <= 0) return m;
  }
  return list[list.length - 1][0];
};
const camps = [];
for (const zn of ZONES) {
  const mix = MIX[zn.id];
  const placed = [];
  for (let i = 0; i < zn.camps; i++) {
    const radius = rint(26, 30);
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 600; k++) {
      const r = R_IN + 40 + R() * (R_OUT - R_IN - 90);
      const a = edgeA(zn, r) + R() * (edgeB(zn, r) - edgeA(zn, r));
      const [x, z] = polar(r, a);
      if (zoneOfOffset(x, z) !== zn) continue;
      if (keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + radius + 6)) continue;
      // không chồng bãi khác
      const dmin = Math.min(...camps.map((c) => Math.hypot(c.ox - x, c.oz - z) - c.radius), 9999);
      if (dmin < radius + 4) continue;
      const d = Math.min(...placed.map((q) => Math.hypot(q[0] - x, q[1] - z)), 9999);
      if (d > bestD) {
        bestD = d;
        best = [x, z];
      }
    }
    if (!best) continue;
    placed.push(best);
    const lv = zn.lv[0] + (zn.lv[1] > zn.lv[0] && Math.hypot(...best) > 380 ? 1 : 0);
    const camp = {
      id: `c_${zn.id}_${String(placed.length).padStart(2, '0')}`,
      zone: zn.id,
      mon: pick(mix.mons),
      x: W(best[0]),
      z: W(best[1]),
      count: R() < 0.75 ? 4 : 3,
      radius,
      levelMin: lv,
      levelMax: Math.min(zn.lv[1], lv + (zn.lv[1] > lv ? 1 : 0)),
      respawn: 45,
      ox: best[0],
      oz: best[1],
    };
    if (mix.ranged && R() < mix.ranged[1]) camp.ranged = mix.ranged[0];
    camps.push(camp);
  }
}
for (const c of camps) {
  delete c.ox;
  delete c.oz;
}
// camp thuộc cấp: Sa Thạch Pha 16–17 gần trạm 16, xa 17

// ---- tài nguyên (tạm, itm_linh_thao đến khi E2-F có Hoàng Sa Thảo) ----
const nodes = [
  { item: 'itm_linh_thao', x: W(-60), z: W(430), radius: 70, count: 6, respawn: 60 },
  { item: 'itm_linh_thao', x: W(300), z: W(-30), radius: 70, count: 6, respawn: 60 },
  { item: 'itm_linh_thao', x: W(-380), z: W(-170), radius: 60, count: 5, respawn: 60 },
];

// ---- địa hình ----
const flat = (id, off, y, flatR, outerR, extra = {}) => ({ id, x: W(off[0]), z: W(off[1]), y, flatR, outerR, round: true, ...extra });
// Lòng sông cạn: mỗi vùng một dải đĩa phẳng nối nhau dọc đường giữa vùng (uốn nhẹ), thấp hơn cao nguyên 40 m trở lên → hẻm đá.
const chain = [];
for (const z of ZONES) {
  for (let r = R_IN + 40, i = 0; r <= R_OUT - 70; r += 56, i++) {
    const a = z.midAt(r) + 6 * Math.sin(r / 80 + z.k * 2.3);
    const [x, zz] = polar(r, a);
    chain.push(flat(`rb_${z.id}_${i}`, [x, zz], z.floor - r * 0.012, 52, 120));
  }
}
const padOf = (zone) => PADS.find((p) => p.zone === zone);
const terrain = {
  id: 'doan_mach',
  seed: 20261116,
  size: 2048,
  margin: 24,
  natural: { freq: 0.0021, baseOct: 4, ridgeOct: 3, level: 128, baseAmp: 16, ridgeAmp: 70, maskFreq: 0.0013, maskOct: 2, maskLo: -0.5, maskHi: 0.2, edge: { amp: 120, r0: 300, r1: 20 } },
  features: [
    ...chain,
    flat('tram', [0, 0], 80, 62, 175, { detail: 0.3 }),
    ...ZONES.map((z) => flat('pad_' + z.id, padOf(z.id).off, z.floor - z.padR * 0.012, 28, 95)),
    ...POIS.map((p) => flat('poi_' + p.id, p.off, ZONES.find((z) => z.id === p.zone).floor - Math.hypot(...p.off) * 0.012, 20, 55)),
    flat('boss', BOSS.off, ZONES.find((z) => z.id === 'tuyet_bich').floor - 7, 42, 120, { detail: 2 }),
  ],
  play: { cx: C, cz: C, half: HALF, wallH: 260 },
  colliders: props.filter((p) => p.r).map((p) => ({ x: p.x, z: p.z, r: Math.round(p.r * 100) / 100 })),
};

const level = {
  id: 'doan_mach',
  spawn: { x: C, z: C + 12 },
  zones: ZONES.map((z) => ({ id: z.id, lvMin: z.lv[0], lvMax: z.lv[1], color: z.color, music: 'wild', poly: z.poly })),
  pois: POIS.map((p) => ({ id: p.id, zone: p.zone, x: W(p.off[0]), z: W(p.off[1]), beamH: 80 })),
  camps,
  spawns,
  nodes,
};

const out = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
out('packages/content/data/levels/doan_mach.terrain.json', JSON.stringify(terrain, null, 2) + '\n');
out('packages/content/data/levels/doan_mach.json', JSON.stringify(level, null, 2) + '\n');

const propLines = props.map((p) => `  { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${Math.round(p.s * 100) / 100}${p.r ? `, r: ${Math.round(p.r * 100) / 100}` : ''} },`);
out(
  'packages/shared/src/props.doanmach.ts',
  `// Prop bày của Đoạn Mạch Cổ Cốc (E2-A). SINH BẰNG tools/maps/gen-doan-mach.mjs: sửa ở đó rồi chạy lại.
// Dùng asset sẵn có làm chỗ đứng; khi PROP_LIB (#118) vào thì thay theo docs/e2-map/README.md.
import type { HandProp } from './props';

export const DOAN_MACH_PROPS: readonly HandProp[] = [
${propLines.join('\n')}
];
`,
);
const padLines = PADS.map((p) => `  { id: '${p.id}', level: 'doan_mach', face: { x: ${C}, z: ${C} }, zone: '${p.zone}', x: ${W(p.off[0])}, z: ${W(p.off[1])} },`);
out(
  'packages/shared/src/teleport.doanmach.ts',
  `// Truyền Tống Trận của Đoạn Mạch Cổ Cốc (E2-A, tiền tố dm_). SINH BẰNG tools/maps/gen-doan-mach.mjs.
import type { TelePad } from './teleport';

/** Trận trạm (dm_tp_tram) tự mở khi tới nơi; mở khóa lần đầu bằng nhiệm vụ (E2-H) hoặc "/gm tele dm_tp_tram". */
export const DOAN_MACH_PADS: readonly TelePad[] = [
${padLines.join('\n')}
];
`,
);

const normal = camps.reduce((a, c) => a + c.count + (c.ranged ? 1 : 0), 0);
console.log(`camps ${camps.length}, quái thường ${normal}, tinh anh ${spawns.length - 1}, prop ${props.length}`);
