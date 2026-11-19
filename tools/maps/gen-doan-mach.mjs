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
  if (r < R_IN + 8 || norm4(x, z) > R_OUT - 8) return null;
  const a = (Math.atan2(z, x) * 180) / Math.PI;
  for (const zn of ZONES) {
    const a0 = edgeA(zn, r);
    const a1 = edgeB(zn, r);
    let aa = a;
    while (aa < a0) aa += 360;
    while (aa >= a0 + 360) aa -= 360;
    if (aa < a1) {
      // cách hai tia biên ≥ 22 m
      if (r * Math.sin(deg(aa - a0)) < 6 || r * Math.sin(deg(a1 - aa)) < 6) return null;
      return zn;
    }
  }
  return null;
};

// ---- trận truyền tống ----
const polar = (r, a) => [r * Math.cos(deg(a)), r * Math.sin(deg(a))];
const PADS = [{ id: 'dm_tp_tram', zone: '', off: [0, -38] }];
for (const z of ZONES)
  PADS.push({ id: 'dm_tp_' + z.id.replace(/_pha$|_dao$|_huyet$|_khu$/, ''), zone: z.id, off: polar(z.padR, z.midAt(z.padR)) });
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
// Prop: PROP_LIB (#118, packages/shared/src/propLib.ts) cho bản đồ doan_mach + vài prop Vân Lam sẵn có làm đệm.
// Tâm điểm [id, yaw, s] đặt đúng tại điểm; "quanh" rải vòng 6–12 m.
const POI_KIT = {
  mach_tinh_tru: {
    center: ['prop_mach_tinh_tru', 0, 1],
    around: ['prop_tru_nham_do', 'prop_tru_nham_do', 'prop_tru_nham_do', 'prop_da_dung', 'prop_da_nam', 'prop_den_da'],
  },
  cau_da_gay: {
    center: ['prop_cau_da_gay', 0, 1],
    around: ['prop_tru_nham_do', 'prop_tru_nham_do', 'prop_da_nam', 'prop_kiem_gay', 'prop_cay_goc_kho', 'prop_den_da'],
  },
  ho_sa_lun: {
    center: null,
    around: [
      'prop_cay_goc_kho',
      'prop_cay_goc_kho',
      'prop_cay_goc_kho',
      'prop_da_nam',
      'prop_da_nam',
      'prop_kiem_gay',
      'prop_da_phien',
      'prop_bia_da',
    ],
  },
  cong_mo: {
    center: ['prop_cong_khai_mach', 0, 1],
    around: ['prop_lau', 'prop_lau', 'prop_lo_dan', 'prop_den_da', 'prop_den_da', 'prop_da_nam'],
  },
  vach_dut_mach: {
    center: null,
    around: [
      'prop_tru_nham_do',
      'prop_tru_nham_do',
      'prop_tru_nham_do',
      'prop_tru_nham_do',
      'prop_bia_da',
      'prop_kiem_gay',
      'prop_da_dung',
      'prop_cay_goc_kho',
    ],
  },
};
// Bán kính va chạm: PROP_LIB (cột đá 2,8; cổng mỏ 4,4; mạch tinh 1,6; cây khô 0,9) và Vân Lam sẵn có.
const COLL_R = {
  prop_da_dung: 1.2,
  prop_da_nam: 1.0,
  prop_bia_da: 0.9,
  prop_lau: 1.4,
  prop_lo_dan: 1.0,
  prop_tru_nham_do: 2.8,
  prop_cong_khai_mach: 4.4,
  prop_mach_tinh_tru: 1.6,
  prop_cay_goc_kho: 0.9,
};
const props = [];
const addProp = (id, ox, oz, yaw, s = 1) => {
  const p = { id, x: W(ox), z: W(oz), yaw: Math.round(yaw * 100) / 100, s: Math.round(s * 100) / 100 };
  if (COLL_R[id]) p.r = Math.round(COLL_R[id] * s * 100) / 100;
  props.push(p);
};
for (const p of POIS) {
  const kit = POI_KIT[p.id];
  if (kit.center) addProp(kit.center[0], p.off[0], p.off[1], kit.center[1], kit.center[2]);
  const rMin = kit.center ? 9 : 5;
  kit.around.forEach((id, i) => {
    const a = (i / kit.around.length) * Math.PI * 2 + R() * 0.5;
    const r = rMin + R() * 4;
    addProp(id, p.off[0] + Math.cos(a) * r, p.off[1] + Math.sin(a) * r, R() * Math.PI * 2, 0.9 + R() * 0.3);
  });
}
// Trạm Hạ Khuyết: đèn, Ngưng Đan Lô, lều, bia
addProp('prop_ngung_dan_lo', 14, 8, 0.6, 1);
addProp('prop_lau', -16, 10, -0.4, 1);
addProp('prop_bia_da', 0, 22, 0, 1);
for (const [x, z] of [
  [-12, -22],
  [12, -22],
  [-22, 14],
  [22, 14],
  [0, -8],
])
  addProp('prop_den_da', x, z, 0, 1);

// E2-H: hai mảnh kiếm gãy thêm (s2_kiem_gay có 5 điểm; ba mảnh kia nằm sẵn ở các điểm đáng chú ý).
addProp('prop_kiem_gay', 212, 202, 0.7, 1);
addProp('prop_kiem_gay', -418, -62, 2.1, 1);

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
for (const p of POIS) keep.push({ x: p.off[0], z: p.off[1], r: 14 });
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
    keep.push({ x: best[0], z: best[1], r: 10 });
  }
}
spawns.push({
  mon: 'boss_dia_mach_long',
  x: W(BOSS.off[0]),
  z: W(BOSS.off[1]),
  radius: 6,
  count: 1,
  levelMin: 19,
  levelMax: 19,
  respawn: 1800,
});

// ---- camp ----
// Chuẩn độ phủ bản đồ mở rộng (coverage.ts): mọi điểm trong vùng săn cách MÉP cụm gần nhất ≤ 70 m. Rải điểm-xa-nhất toàn cục trên lưới 10 m
// (mỗi bước đặt cụm vào chỗ đang xa mép cụm nào nhất) tới khi mọi điểm ≤ COVER_GOAL; cụm 3 con (một phần 4 con) bán kính 30 để mật độ ~125 quái/km².
const COVER_GOAL = 62;
const TARGET_CAMPS = 72;
const TARGET_DENSITY = 128;
const polyAreaOf = (poly) =>
  Math.abs(
    poly.reduce((a, p, i) => {
      const q = poly[(i + 1) % poly.length];
      return a + (p[0] * q[1] - q[0] * p[1]);
    }, 0),
  ) / 2;
const MARGIN_RAY = 6;
const MARGIN_OUT = 8;
const CAMP_R = 30;
const MIX = {
  sa_thach_pha: { mons: [['mon_thach_giap_te', 1]], ranged: null },
  kho_ha_dao: {
    mons: [
      ['mon_thach_giap_te', 0.5],
      ['mon_khai_mach_khoi_loi', 0.5],
    ],
    ranged: null,
  },
  hoang_sa_huyet: {
    mons: [
      ['mon_ngo_cong_au', 0.7],
      ['mon_thach_giap_te', 0.3],
    ],
    ranged: null,
  },
  cuu_mo_khu: {
    mons: [
      ['mon_khai_mach_khoi_loi', 0.5],
      ['mon_mach_thuong_ho_ve', 0.5],
    ],
    ranged: null,
  },
  tuyet_bich: {
    mons: [
      ['mon_thach_giap_te', 0.5],
      ['mon_ngo_cong_au', 0.5],
    ],
    ranged: null,
  },
};
const pick = (list) => {
  let t = R();
  for (const [m, w] of list) {
    if ((t -= w) <= 0) return m;
  }
  return list[list.length - 1][0];
};
// điểm cần phủ: lưới 10 m trong các vùng (kể cả dải sát biên không đặt được tâm)
const need = [];
const cand = [];
for (let x = -R_OUT; x <= R_OUT; x += 10)
  for (let z = -R_OUT; z <= R_OUT; z += 10) {
    if (norm4(x, z) > R_OUT || Math.hypot(x, z) < R_IN) continue;
    const a = (Math.atan2(z, x) * 180) / Math.PI;
    const r = Math.hypot(x, z);
    let inside = false;
    for (const zn of ZONES) {
      let aa = a;
      const a0 = edgeA(zn, r);
      while (aa < a0) aa += 360;
      while (aa >= a0 + 360) aa -= 360;
      if (aa < edgeB(zn, r)) inside = true;
    }
    if (!inside) continue;
    need.push([x, z, 9999]);
    const zn = zoneOfOffset(x, z);
    if (zn && !keep.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + CAMP_R + 6)) cand.push([x, z, zn]);
  }
const camps = [];
// Lưới thô 20 m cho đo/tối ưu (nhanh): thưa need/cand còn 1/4.
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
  const mix = MIX[zn.id];
  const lv = zn.lv[0] + (zn.lv[1] > zn.lv[0] && Math.hypot(x, z) > 380 ? 1 : 0);
  const camp = {
    id: '',
    zone: zn.id,
    mon: pick(mix.mons),
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
  if (mix.ranged && R() < mix.ranged[1]) camp.ranged = mix.ranged[0];
  return camp;
};
// Lưới lục giác: tìm bước, góc xoay, độ lệch cho ít cụm nhất mà điểm xa nhất nhỏ nhất; mỗi nút dịch về ứng viên hợp lệ gần nhất.
function lattice(sp, th, ox, oz) {
  const out = [];
  const c = Math.cos(th);
  const sn = Math.sin(th);
  for (let i = -12; i <= 12; i++)
    for (let j = -12; j <= 12; j++) {
      const lx = (i + (j % 2 ? 0.5 : 0)) * sp + ox;
      const lz = j * sp * 0.866 + oz;
      const x = lx * c - lz * sn;
      const z = lx * sn + lz * c;
      if (norm4(x, z) > R_OUT + 70) continue;
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
for (let sp = 160; sp <= 215; sp += 5)
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
camps.push(...bestSet);
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
        ranged: nc.ranged,
      });
      if (!nc.ranged) delete camps[i].ranged;
    }
  }
};
for (let r = 0; r < 8; r++) relocate();
// Vá điểm xa nhất (lưới mịn 10 m): thêm cụm tại ứng viên gần nó nhất, tối đa 6 cụm, rồi tối ưu lại.
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
for (let k = 0; camps.length < 75; k++) {
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
// Số con: 3 mỗi cụm, thêm con thứ tư cho tới mật độ mục tiêu.
const areaKm2 = ZONES.reduce((a, z) => a + polyAreaOf(z.poly), 0) / 1e6;
let total = camps.reduce((a, c) => a + c.count + (c.ranged ? 1 : 0), 0);
for (const c of camps) {
  if (total / areaKm2 >= TARGET_DENSITY) break;
  c.count = 4;
  total++;
}
// đánh số lại theo vùng
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

// ---- tài nguyên (tạm, itm_linh_thao đến khi E2-F có Hoàng Sa Thảo) ----
const nodes = [
  { item: 'itm_linh_thao', x: W(-60), z: W(430), radius: 70, count: 6, respawn: 60 },
  { item: 'itm_linh_thao', x: W(300), z: W(-30), radius: 70, count: 6, respawn: 60 },
  { item: 'itm_linh_thao', x: W(-380), z: W(-170), radius: 60, count: 5, respawn: 60 },
  // E2-H: nguyên liệu nhiệm vụ chương 2 (q2_cau_da, s2_cu_tho).
  { item: 'itm_mach_tinh_phien', x: 1420, z: 950, radius: 70, count: 8, respawn: 60 },
  { item: 'itm_hoang_sa_thao', x: 950, z: 1440, radius: 70, count: 8, respawn: 60 },
];
// E2-H: điểm chạm của s2_kiem_gay (đúng chỗ prop_kiem_gay) và người đồng hành của s2_ho_tong. Tên ở i18n `spot.<id>.name`.
const spots = [
  { id: 'kiem_gay_1', zone: 'kho_ha_dao', x: 1495, z: 973 },
  { id: 'kiem_gay_2', zone: 'hoang_sa_huyet', x: 952, z: 1518 },
  { id: 'kiem_gay_3', zone: 'tuyet_bich', x: 1041, z: 477 },
  { id: 'kiem_gay_4', zone: 'sa_thach_pha', x: 1236, z: 1226 },
  { id: 'kiem_gay_5', zone: 'cuu_mo_khu', x: 606, z: 962 },
];
const escorts = [
  {
    id: 'esc_thuong_nhan',
    npc: 'npc_thuong_nhan',
    speed: 4,
    path: [
      [1046, 1050],
      [1180, 990],
      [1338, 922],
      [1488, 976],
    ],
  },
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
  natural: {
    freq: 0.0021,
    baseOct: 4,
    ridgeOct: 3,
    level: 128,
    baseAmp: 16,
    ridgeAmp: 70,
    maskFreq: 0.0013,
    maskOct: 2,
    maskLo: -0.5,
    maskHi: 0.2,
    edge: { amp: 210, r0: 252, r1: 110 }, // MAP-2: vách dựng đứng, chỉ ngoài vùng chơi (mép chơi ở cách rìa thế giới 244 m),
  },
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
  // E2-C: cửa Khai Mạch Cổng (prop_cong_khai_mach ở 584,944) dẫn xuống Phục Mạch Quật.
  portals: [{ x: 584, z: 970, r: 12, to: 'phuc_mach' }],
  zones: ZONES.map((z) => ({ id: z.id, lvMin: z.lv[0], lvMax: z.lv[1], color: z.color, music: 'wild', poly: z.poly })),
  pois: POIS.map((p) => ({ id: p.id, zone: p.zone, x: W(p.off[0]), z: W(p.off[1]), beamH: 80 })),
  camps,
  spawns,
  nodes,
  spots,
  escorts,
};

const out = (rel, text) => fs.writeFileSync(path.join(ROOT, rel), text);
out('packages/content/data/levels/doan_mach.terrain.json', JSON.stringify(terrain, null, 2) + '\n');
out('packages/content/data/levels/doan_mach.json', JSON.stringify(level, null, 2) + '\n');

const propLines = props.map(
  (p) =>
    `  { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${Math.round(p.s * 100) / 100}${p.r ? `, r: ${Math.round(p.r * 100) / 100}` : ''} },`,
);
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
const padLines = PADS.map(
  (p) => `  { id: '${p.id}', level: 'doan_mach', face: { x: ${C}, z: ${C} }, zone: '${p.zone}', x: ${W(p.off[0])}, z: ${W(p.off[1])} },`,
);
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
