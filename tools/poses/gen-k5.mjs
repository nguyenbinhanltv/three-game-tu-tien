// K-5: sinh pose chiêu theo cấu trúc 9 khung (tấn công) / 7 khung (niệm, hộ thể, hồi phục) và ba ngôn ngữ động tác
// (kiếm tu `kt`, hộ pháp `hp`, đan sư `ds`). Spec: docs/AUDIT_AND_ROADMAP.md mục 7.1; tóm tắt + số đo: docs/k5-poses/README.md.
//   node tools/poses/gen-k5.mjs        ghi packages/content/data/poses/*.json
// Dữ liệu pose vẫn là JSON viết tay được; bộ sinh chỉ giữ cho các pose cùng một cấu trúc và số đo khớp bảng.
// Thời gian lấy từ `skills.json` / `methods.json` (windup = hitAt[0], recovery), không viết cứng.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'packages/content/data/poses');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/content/data', f), 'utf8'));
const SKILLS = rd('skills.json');
const MSK = rd('methods.json').skills;
const SK = new Map([...SKILLS, ...MSK].map((s) => [s.id, s]));

/** Từ lúc mũi kiếm bắt đầu vung tới khung trúng (giây): mũi kiếm đi ≥ 1,2 m trong khoảng này (tối đa 0,08 s). */
export const TRAVEL = 0.07;
const r3 = (n) => Math.round(n * 1000) / 1000;
const v3 = (a) => a.map(r3);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k);
const lerp = (a, b, u) => a.map((x, i) => x + (b[i] - x) * u);
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((x) => x / l);
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
/** Hướng: nội suy rồi chuẩn hóa; gần ngược nhau thì đi qua hướng lên. */
const nlerp = (a, b, u) => {
  const l = lerp(norm(a), norm(b), u);
  return Math.hypot(...l) < 0.2 ? norm(lerp(norm(a), [0, 1, 0], 0.5)) : norm(l);
};
/** Ngoại suy hướng vượt quá `b` thêm `k` lần (b − a). */
const nextra = (a, b, k) => norm(add(norm(b), mul(sub(norm(b), norm(a)), k)));

// ---- Thế thủ (trùng kiem_thu, khung 0) ----
const GUARD = {
  hipsPos: [0, -0.06, 0],
  hipsRot: [0, 15, 0],
  spine: [6, -12, 0],
  head: [0, -4, 0],
  handR: [-0.12, 0.24, 0.36],
  elbowR: [-0.6, -0.7, -0.2],
  sword: [0.2, 0.55, 0.8],
  edge: [0, -0.8, 0.55],
  handL: [0.1, 0.3, 0.22],
  elbowL: [0.6, -0.6, -0.3],
  footR: [-0.12, 0, 0.16],
  footL: [0.15, 0, -0.14],
};

// ---- Ba giọng (số theo bảng ở docs/AUDIT_AND_ROADMAP.md 7.1) ----
const VOICES = {
  // Nhanh, thẳng, xa.
  kt: {
    drop: 0.09, // hạ hông ở khung 3 so với thủ thế (0,06–0,10)
    hipY5: -0.12,
    hipZ5: 0.2, // hông xông tới khi trúng
    twist: 40, // xoay hông tối đa (35–45°)
    hold: 0.05,
    over: 0.15,
    reachZ: 0.77, // tay phải ≥ 0,75 m trước (so với hông lúc nghỉ)
    reachY: 0.38,
    footR5: [-0.12, 0, 0.54], // chân trước bước tới 0,38 m (0,3–0,45)
    footL5: [0.15, 0, -0.14],
    handL3: [0.08, 0.34, 0.12],
    handL5: [0.36, 0.46, -0.3], // kiếm chỉ, đối trọng sau lưng
    elbowL5: [0.8, 0.3, -0.7],
    spine3: 6,
    spine5: 14,
  },
  // VFX-V1: Kiếm Khí Trảm và Phi Kiếm (đòn thường) của kiếm tu, cường điệu trong dải của `kt` (hạ hông và xoay hông ở mức trần,
  // xông tới xa hơn, quá đà tối đa, ngả người ra sau lúc tụ khí): tụ khí rõ → vung nhanh → theo đà. Thời điểm hit không đổi.
  kx: {
    drop: 0.1,
    hipY5: -0.14,
    hipZ5: 0.2,
    twist: 45,
    hold: 0.05,
    over: 0.155,
    reachZ: 0.92,
    reachY: 0.38,
    footR5: [-0.12, 0, 0.6],
    footL5: [0.15, 0, -0.14],
    handL3: [0.08, 0.34, 0.12],
    handL5: [0.36, 0.46, -0.3],
    elbowL5: [0.8, 0.3, -0.7],
    spine3: 8,
    spine5: 20,
    lean: -0.1, // trọng tâm ngả ra sau ở khung 2 (tụ khí)
  },
  // Nặng, thấp, gần.
  hp: {
    drop: 0.19, // 0,16–0,22
    hipY5: -0.25,
    hipZ5: 0.08,
    twist: 23, // 15–25°, nhưng khung 3 phải xoay ngược ≥ 20°
    hold: 0.08,
    over: 0.05, // dừng gắt
    reachZ: 0.52, // 0,45–0,6, ngang hông
    reachY: 0.0,
    footR5: [-0.26, 0, 0.1], // hai chân bám đất, rộng hơn vai 0,15 m (vai 0,36 → 0,52)
    footL5: [0.26, 0, -0.1],
    handL3: [0.07, 0.32, 0.27],
    handL5: [0.07, 0.32, 0.27], // nắm quyền che ngực
    elbowL5: [0.7, -0.6, -0.1],
    spine3: 12,
    spine5: 16,
  },
  // Tròn, mềm, tay áo.
  ds: {
    drop: 0.035, // 0,02–0,05
    hipY5: -0.09,
    hipZ5: 0.0,
    twist: 26, // 20–30°
    hold: 0.06,
    over: 0.1, // theo cung tròn
    reachZ: 0.58, // 0,5–0,65, cao ngang vai
    reachY: 0.36,
    footR5: [-0.14, 0, 0.18],
    footL5: [0.15, 0, -0.34], // chân sau lùi 0,2 m
    handL3: [0.05, 0.34, 0.26],
    handL5: [0.06, 0.38, 0.3], // ấn quyết trước ngực
    elbowL5: [0.8, -0.4, -0.2],
    spine3: 5,
    spine5: 9,
    lift: 0.45, // mũi kiếm hất lên (tay ở ngang vai, kiếm không chúc xuống sát thân)
  },
};

// ---- Kiểu vung (hình học đòn, không phụ thuộc giọng). `dir` là chiều xoay hông khi vung. ----
const SWINGS = {
  // Đòn 1: chém ngang từ phải sang trái.
  d1: {
    dir: 1,
    load: { hand: [-0.46, 0.3, 0.06], sword: [-0.7, 0.15, -0.6], edge: [-0.6, 0, 0.7], elbow: [-0.3, -0.8, -0.5], head: -22 },
    strike: { x: -0.1, dy: 0, sword: [0.55, 0.08, 0.83], edge: [0.83, 0, -0.55], elbow: [-0.5, -0.8, -0.2], head: 20 },
  },
  // Đòn 2: hất ngược từ dưới trái lên phải.
  d2: {
    dir: -1,
    load: { hand: [0.06, 0.12, 0.3], sword: [0.8, -0.3, 0.55], edge: [0.5, 0.6, -0.6], elbow: [0.3, -0.9, 0.2], head: 22 },
    strike: { x: -0.32, dy: 0.08, sword: [-0.6, 0.55, 0.6], edge: [-0.6, -0.1, -0.8], elbow: [-0.9, -0.3, -0.4], head: -18 },
  },
  // Đòn 3: bổ từ trên xuống (đẩy lùi).
  d3: {
    dir: 1,
    load: { hand: [-0.22, 0.86, -0.08], sword: [-0.15, 0.8, -0.6], edge: [0.5, 0.5, 0.7], elbow: [-0.8, 0.1, -0.4], head: -14 },
    strike: { x: -0.1, dy: 0, sword: [0.02, -0.35, 0.94], edge: [0, -0.94, -0.35], elbow: [-0.4, -0.9, 0], head: 6 },
  },
  // Kiếm Khí Trảm: bổ dọc từ trên cao sau lưng.
  kkt: {
    dir: -1,
    load: { hand: [-0.34, 0.72, -0.05], sword: [-0.3, 0.6, -0.75], edge: [0.4, 0.5, 0.75], elbow: [-0.8, 0.1, -0.4], head: 24 },
    strike: { x: -0.1, dy: 0, sword: [0.5, -0.4, 0.78], edge: [0.6, -0.7, 0.1], elbow: [-0.4, -0.9, 0], head: -10 },
  },
  // Chém xoáy hạ từ trên cao (Thiên Kiếm Vũ).
  vu: {
    dir: 1,
    load: { hand: [-0.2, 0.94, 0.06], sword: [0, 1, 0.1], edge: [0, 0, 1], elbow: [-0.9, 0, -0.3], head: -28 },
    strike: { x: -0.16, dy: 0.02, sword: [0, -0.3, 0.95], edge: [0, -0.95, -0.3], elbow: [-0.4, -0.9, -0.1], head: 6 },
  },
  // Kiếm Ảnh (Phi Kiếm Truy Hồn): đâm thẳng, lao tới.
  anh: {
    dir: -1,
    load: { hand: [-0.3, 0.5, -0.35], sword: [0.25, 0.45, 0.85], edge: [0.5, 0.8, 0], elbow: [-0.8, -0.2, -0.5], head: 20 },
    strike: { x: -0.1, dy: 0, sword: [0, 0.04, 1], edge: [0.9, 0.3, 0], elbow: [-0.5, -0.9, 0], head: -14 },
  },
  // Vạn Kiếm Quy Tông: giơ kiếm trời rồi bổ xuống.
  van: {
    dir: 1,
    load: { hand: [-0.12, 1.0, 0.06], sword: [0, 1, 0.05], edge: [0, 0, 1], elbow: [-0.9, 0, -0.3], head: -32 },
    strike: { x: -0.12, dy: 0.02, sword: [0, -0.3, 1], edge: [0, -1, -0.3], elbow: [-0.4, -0.9, -0.1], head: 8 },
  },
};

// Tầm với theo người tham chiếu (khớp validatePose ở packages/shared/src/pose.ts): vai (±0,18; 0,45; 0), tay 0,54 m, nới 3%.
const SHOULDER = [0.18, 0.45, 0];
const ARM = 0.54 * 1.03 - 0.004;
const LIFT = 0.06;
/** Kẹp cổ tay về trong tầm với và chỉnh lưỡi kiếm vuông góc với mũi (tránh sword/edge song song sau khi trộn khung). */
function fit(f) {
  const o = { ...f };
  for (const [n, side] of [['handR', -1], ['handL', 1]]) {
    if (!o[n]) continue;
    const s = [SHOULDER[0] * side + o.hipsPos[0], SHOULDER[1] + o.hipsPos[1], SHOULDER[2] + o.hipsPos[2]];
    const d = sub(o[n], s);
    const reach = ARM + (o[n][1] > s[1] ? LIFT - 0.004 : 0);
    const l = Math.hypot(...d);
    if (l > reach) o[n] = add(s, mul(d, reach / l));
  }
  if (o.sword && o.edge) {
    const sw = norm(o.sword);
    let e = sub(o.edge, mul(sw, dot(o.edge, sw)));
    if (Math.hypot(...e) < 0.3) e = sub([0, 1, 0], mul(sw, sw[1]));
    if (Math.hypot(...e) < 0.3) e = sub([1, 0, 0], mul(sw, sw[0]));
    // Giữ hướng lưỡi gần bản gốc: chỉ chỉnh khi quá song song.
    if (Math.abs(dot(norm(o.edge), sw)) > 0.9) o.edge = norm(e);
  }
  return o;
}

/** Số học dùng chung cho một tập khung: khung nào có trường thì ghi, không có thì để key giữ giá trị trước. */
function keyOf(t, f0, ease) {
  const f = fit(f0);
  const k = { t: r3(t) };
  if (ease) k.ease = ease;
  const hips = {};
  if (f.hipsPos) hips.pos = v3(f.hipsPos);
  if (f.hipsRot) hips.rot = v3(f.hipsRot);
  if (hips.pos || hips.rot) k.hips = hips;
  for (const n of ['spine', 'head', 'handR', 'elbowR', 'sword', 'edge', 'handL', 'elbowL', 'footR', 'footL', 'kneeR', 'kneeL']) if (f[n]) k[n] = v3(f[n]);
  return k;
}

/** Trộn hai khung đầy đủ (số lerp, hướng nlerp). */
function mix(a, b, u) {
  const out = {};
  for (const n of Object.keys(a)) {
    if (b[n] === undefined) {
      out[n] = a[n];
      continue;
    }
    out[n] = ['sword', 'edge', 'elbowR', 'elbowL', 'kneeR', 'kneeL'].includes(n) ? nlerp(a[n], b[n], u) : lerp(a[n], b[n], u);
  }
  return out;
}

/** Vượt quá `b` thêm `k` lần (b − a) so với `a`. */
function overshoot(a, b, k, arc) {
  const out = { ...b };
  for (const n of ['hipsPos', 'hipsRot', 'spine', 'head', 'handR', 'handL', 'footR', 'footL']) {
    if (a[n] && b[n]) out[n] = add(b[n], mul(sub(b[n], a[n]), k));
  }
  for (const n of ['sword', 'edge']) if (a[n] && b[n]) out[n] = nextra(a[n], b[n], k);
  // Đan sư: quá đà theo cung tròn, tay vẽ thêm một đường vòng lên cao và ra ngoài.
  if (arc) out.handR = add(out.handR, [-0.05, 0.06, 0]);
  return out;
}

/**
 * Dựng khung khóa. `f3` là khung tụ lực (đã có hạ hông/xoay), `f5` khung trúng. `swing` = true: đủ 9 khung (có quá đà và thu kiếm).
 * Mốc: F1 0; F4 = hitAt − TRAVEL; F3 = F4 − hold (giữ đứng hình); F2 = 35% của F4; F5 = hitAt; F6 = +0,06 s;
 * F7 = hitAt + 35% recovery; F8 = hitAt + 75% recovery; F9 = hitAt + recovery.
 */
function frames({ w, rec, voice, f3, f5, nine, arc }) {
  const V = VOICES[voice];
  const t4 = w - TRAVEL;
  const t3 = t4 - V.hold;
  const t2 = 0.35 * t4;
  // Khung 2: dồn trọng tâm về chân sau, nửa đường tới khung 3.
  const f2 = mix(GUARD, f3, 0.5);
  f2.hipsPos = add(f2.hipsPos, [0, 0, V.lean ?? -0.02]);
  // Khung 4: như khung 3, hơi sâu thêm (hít vào) để không phải "đóng băng" hẳn.
  const f4 = { ...f3, hipsPos: add(f3.hipsPos, [0, -0.008, 0]), handR: add(f3.handR, [0, 0, -0.01]) };
  const ks = [keyOf(0, GUARD), keyOf(t2, f2, 'inOut'), keyOf(t3, f3, 'inOut'), keyOf(t4, f4, 'linear'), keyOf(w, f5, 'quartOut')];
  if (nine) {
    const f6 = overshoot(f4, f5, V.over, arc);
    const t6 = w + 0.06;
    ks.push(keyOf(t6, f6, 'out'));
    ks.push(keyOf(w + 0.35 * rec, mix(f6, GUARD, 0.55), 'out'));
    ks.push(keyOf(w + 0.75 * rec, mix(f6, GUARD, 0.88), 'inOut'));
  } else {
    ks.push(keyOf(w + 0.35 * rec, mix(f5, GUARD, 0.55), 'out'));
  }
  ks.push(keyOf(w + rec, GUARD, 'inOut'));
  return ks;
}

/** Khung tụ lực và khung trúng của một đòn chém, theo giọng. */
function swingFrames(swingId, voice, over) {
  const S = SWINGS[swingId];
  const V = VOICES[voice];
  const T = V.twist;
  const rot3 = 15 + S.dir * 0.4 * T;
  const rot5 = rot3 - S.dir * T;
  const dropAdj = -(V.drop - 0.08) * 0.9;
  const y3 = -0.06 - V.drop;
  const f3 = {
    hipsPos: [0, y3, -0.03],
    hipsRot: [0, rot3, 0],
    spine: [V.spine3 - 4, -12 + S.dir * 0.55 * T, 0],
    head: [0, S.load.head, 0],
    handR: add(S.load.hand, [0, dropAdj, 0]),
    elbowR: S.load.elbow,
    sword: S.load.sword,
    edge: S.load.edge,
    handL: V.handL3,
    elbowL: GUARD.elbowL,
    footR: voice === 'hp' ? [-0.26, 0, 0.1] : voice === 'ds' ? [-0.14, 0, 0.1] : GUARD.footR,
    footL: voice === 'hp' ? [0.26, 0, -0.1] : voice === 'ds' ? [0.15, 0, -0.2] : GUARD.footL,
  };
  const f5 = {
    hipsPos: [0, V.hipY5, V.hipZ5],
    hipsRot: [0, rot5, 0],
    spine: [V.spine5, f3.spine[1] - S.dir * 0.65 * T, 0],
    head: [0, S.strike.head, 0],
    handR: [S.strike.x, V.reachY + S.strike.dy + (over?.dy ?? 0), V.reachZ + (over?.dz ?? 0)],
    elbowR: S.strike.elbow,
    sword: norm([S.strike.sword[0], S.strike.sword[1] + (V.lift ?? 0), S.strike.sword[2]]),
    edge: S.strike.edge,
    handL: V.handL5,
    elbowL: V.elbowL5,
    footR: V.footR5,
    footL: V.footL5,
  };
  return { f3, f5 };
}

const POSES = [];
function emit(id, skillId, hitAt, nine, frs) {
  const s = SK.get(skillId);
  const w = hitAt;
  const rec = s.recovery;
  if (!(rec > 0)) throw new Error(`${skillId}: thiếu recovery`);
  POSES.push({ id, duration: r3(w + rec), loop: false, hit: [r3(w), r3(w + 0.16)], keys: frs(w, rec) });
  void nine;
}

// ---- Đòn thường: 3 đòn × 3 giọng ----
const BASIC = SK.get('skl_phi_kiem');
const SUF = { kt: '', kx: '', hp: '_hp', ds: '_ds' };
/** Giọng thực dùng cho chiêu mẫu VFX-V1: kiếm tu dùng bản cường điệu `kx`. */
const VX = { kt: 'kx', hp: 'hp', ds: 'ds' };
for (const voice of ['kt', 'hp', 'ds']) {
  BASIC.combo.hits.forEach((h, i) => {
    const id = `phi_kiem${i === 0 ? '' : `_${i + 1}`}${SUF[voice]}`;
    const { f3, f5 } = swingFrames(['d1', 'd2', 'd3'][i], VX[voice]);
    emit(id, 'skl_phi_kiem', h.hitAt, true, (w, rec) => frames({ w, rec, voice: VX[voice], f3, f5, nine: true, arc: voice === 'ds' }));
  });
}
// ---- Kiếm Khí Trảm ×3 giọng ----
for (const voice of ['kt', 'hp', 'ds']) {
  const { f3, f5 } = swingFrames('kkt', VX[voice]);
  emit(`kiem_khi_tram${SUF[voice]}`, 'skl_kiem_khi_tram', SK.get('skl_kiem_khi_tram').hitAt[0], true, (w, rec) => frames({ w, rec, voice: VX[voice], f3, f5, nine: true, arc: voice === 'ds' }));
}
// ---- Chiêu tấn công khác (một giọng, theo công pháp của chiêu hoặc kiếm tu cho chiêu gốc) ----
for (const [id, skill, swing] of [
  ['thien_kiem_vu', 'skl_thien_kiem_vu', 'vu'],
  ['kiem_anh', 'skl_phi_kiem_truy_hon', 'anh'],
  ['van_kiem', 'skl_van_kiem_quy_tong', 'van'],
]) {
  const { f3, f5 } = swingFrames(swing, 'kt');
  emit(id, skill, SK.get(skill).hitAt[0], true, (w, rec) => frames({ w, rec, voice: 'kt', f3, f5, nine: true }));
}

// ---- Chiêu 7 khung: niệm, hộ thể, hồi phục (cử chỉ hai tay) ----
const GEST = {
  // Lôi Đình Nhất Kiếm (niệm 1,5 s): giơ kiếm lên rồi bổ xuống, nặng tay.
  loi_dinh: {
    skill: 'skl_loi_dinh_nhat_kiem',
    voice: 'kt',
    f3: { hipsPos: [0, -0.15, -0.03], hipsRot: [0, 4, 0], spine: [-16, 0, 0], head: [-10, 0, 0], handR: [-0.1, 0.94, -0.06], elbowR: [-0.9, 0.2, -0.2], sword: [0, 0.3, -0.95], edge: [0, 0.95, 0.3], handL: [0.04, 0.92, -0.04], elbowL: [0.9, 0.2, -0.2], footR: GUARD.footR, footL: GUARD.footL },
    f5: { hipsPos: [0, -0.2, 0.1], hipsRot: [0, 4, 0], spine: [26, 0, 0], head: [-6, 0, 0], handR: [-0.08, 0.2, 0.44], elbowR: [-0.6, -0.8, 0], sword: [0, -0.4, 0.92], edge: [0, -0.92, -0.4], handL: [0.02, 0.22, 0.42], elbowL: [0.6, -0.8, 0], footR: [-0.14, 0, 0.34], footL: [0.15, 0, -0.2] },
  },
  // Linh Khí Hộ Thể: khép tay trước ngực rồi mở ra hai bên.
  ho_the: {
    skill: 'skl_linh_khi_ho_the',
    voice: 'kt',
    f3: { hipsPos: [0, -0.14, 0], hipsRot: [0, 0, 0], spine: [6, 0, 0], head: [10, 0, 0], handR: [-0.03, 0.46, 0.24], elbowR: [-1, -0.3, 0], handL: [0.03, 0.46, 0.24], elbowL: [1, -0.3, 0], sword: [0, 1, 0.05], edge: [1, 0, 0], footR: [-0.15, 0, 0.04], footL: [0.15, 0, -0.04] },
    f5: { hipsPos: [0, -0.1, 0], hipsRot: [0, 0, 0], spine: [-6, 0, 0], head: [-6, 0, 0], handR: [-0.6, 0.36, 0.14], elbowR: [-0.3, -1, -0.3], handL: [0.6, 0.36, 0.14], elbowL: [0.3, -1, -0.3], sword: [-0.6, 0.2, 0.75], edge: [0, -1, 0], footR: [-0.15, 0, 0.04], footL: [0.15, 0, -0.04] },
  },
  // Hồi Nguyên Thuật: cúi xuống thu linh khí rồi nâng hai tay lên.
  hoi_nguyen: {
    skill: 'skl_hoi_nguyen_thuat',
    voice: 'kt',
    f3: { hipsPos: [0, -0.14, 0], hipsRot: [0, 0, 0], spine: [8, 0, 0], head: [20, 0, 0], handR: [-0.07, 0.1, 0.24], elbowR: [-0.8, -0.6, -0.2], handL: [0.07, 0.1, 0.24], elbowL: [0.8, -0.6, -0.2], sword: [0, -1, 0.15], edge: [0, 0, 1], footR: [-0.15, 0, 0.04], footL: [0.15, 0, -0.04] },
    f5: { hipsPos: [0, -0.04, 0], hipsRot: [0, 0, 0], spine: [-6, 0, 0], head: [-12, 0, 0], handR: [-0.1, 0.52, 0.3], elbowR: [-0.8, -0.2, -0.2], handL: [0.1, 0.52, 0.3], elbowL: [0.8, -0.2, -0.2], sword: [0.1, 0.9, 0.3], edge: [1, 0, 0], footR: [-0.15, 0, 0.04], footL: [0.15, 0, -0.04] },
  },
  // Trấn Sơn Ấn (hộ pháp): hạ thấp, dậm chân, ấn một chưởng ra trước.
  tran_son: {
    skill: 'skl_tran_son_an',
    voice: 'hp',
    f3: { hipsPos: [0, -0.25, -0.02], hipsRot: [0, 0, 0], spine: [10, 0, 0], head: [6, 0, 0], handR: [-0.2, 0.12, 0.14], elbowR: [-0.8, -0.5, -0.4], sword: [0, -1, 0.2], edge: [0, 0, 1], handL: [0.1, 0.3, 0.22], elbowL: [0.7, -0.5, -0.3], footR: [-0.29, 0.12, 0.06], footL: [0.29, 0, -0.06], kneeR: [-0.5, 0.4, 0.7], kneeL: [0.5, 0, 0.7] },
    f5: { hipsPos: [0, -0.24, 0.06], hipsRot: [0, 0, 0], spine: [14, 0, 0], head: [0, 0, 0], handR: [-0.14, 0.1, 0.4], elbowR: [-0.5, -0.9, -0.1], handL: [0.12, 0.3, 0.5], elbowL: [0.4, -0.9, -0.1], footR: [-0.29, 0, 0.12], footL: [0.29, 0, -0.06] },
  },
  // Kim Cương Bất Hoại (hộ pháp): gồng khí, hai tay đẩy ra hai bên, trụ vững.
  kim_cuong: {
    skill: 'skl_kim_cuong_bat_hoai',
    voice: 'hp',
    f3: { hipsPos: [0, -0.25, 0], hipsRot: [0, 0, 0], spine: [10, 0, 0], head: [6, 0, 0], handR: [0.06, 0.4, 0.3], elbowR: [-0.6, 0.2, -0.2], handL: [-0.06, 0.38, 0.3], elbowL: [0.6, 0.2, -0.2], sword: [0, -1, 0.2], edge: [0, 0, 1], footR: [-0.27, 0, 0.04], footL: [0.27, 0, -0.04] },
    f5: { hipsPos: [0, -0.24, 0], hipsRot: [0, 0, 0], spine: [-4, 0, 0], head: [-8, 0, 0], handR: [-0.5, 0.36, 0.14], elbowR: [-1, -0.3, -0.2], handL: [0.5, 0.36, 0.14], elbowL: [1, -0.3, -0.2], footR: [-0.27, 0, 0.06], footL: [0.27, 0, -0.06] },
  },
  // Hồi Xuân Quyết (đan sư): uốn người, tay áo vẽ vòng, tung linh khí.
  xuan_phong: {
    skill: 'skl_hoi_xuan_quyet',
    voice: 'ds',
    f3: { hipsPos: [0, -0.095, 0], hipsRot: [0, -10, 0], spine: [8, -14, 0], head: [10, 0, 0], handR: [-0.1, 0.1, 0.34], elbowR: [-0.8, -0.6, -0.2], sword: [0, -1, 0.15], edge: [0, 0, 1], handL: [0.05, 0.34, 0.26], elbowL: [0.8, -0.6, -0.2], footR: [-0.15, 0, 0.04], footL: [0.15, 0, -0.14] },
    f5: { hipsPos: [0, -0.07, 0], hipsRot: [0, 12, 0], spine: [-8, 16, 0], head: [-18, 0, 0], handR: [-0.5, 0.64, 0.24], elbowR: [-1, 0.2, -0.2], handL: [0.06, 0.38, 0.3], elbowL: [0.8, -0.4, -0.2], footR: [-0.14, 0, 0.1], footL: [0.15, 0, -0.34] },
  },
  // Hồi Thiên Đan Lộ (đan sư): chắp tay cúi, rồi dâng hai tay lên trời.
  hoi_thien: {
    skill: 'skl_hoi_thien_dan_lo',
    voice: 'ds',
    f3: { hipsPos: [0, -0.1, 0], hipsRot: [0, 0, 0], spine: [12, 0, 0], head: [18, 0, 0], handR: [-0.1, 0.2, 0.36], elbowR: [-0.7, -0.6, -0.1], handL: [0.1, 0.2, 0.36], elbowL: [0.7, -0.6, -0.1], sword: [0, -1, 0.15], edge: [0, 0, 1], footR: [-0.16, 0, 0.12], footL: [0.18, 0, -0.18] },
    f5: { hipsPos: [0, -0.08, 0], hipsRot: [0, 0, 0], spine: [-10, 0, 0], head: [-26, 0, 0], handR: [-0.16, 0.86, 0.2], elbowR: [-0.8, 0, -0.1], handL: [0.16, 0.86, 0.2], elbowL: [0.8, 0, -0.1], footR: [-0.14, 0, 0.14], footL: [0.18, 0, -0.34] },
  },
};
/** VFX-V2: cường điệu cử chỉ của các chiêu cơ bản Kiếm tu (thân/hông/đầu lệch khỏi thế thủ nhiều hơn `k` lần; tay giữ nguyên để không vượt tầm). */
const AMP = { loi_dinh: 1.35, ho_the: 1.5, hoi_nguyen: 1.3 };
function amplify(f, k) {
  const o = { ...f };
  o.hipsPos = [f.hipsPos[0], GUARD.hipsPos[1] + (f.hipsPos[1] - GUARD.hipsPos[1]) * k, f.hipsPos[2]];
  o.spine = [GUARD.spine[0] + (f.spine[0] - GUARD.spine[0]) * k, f.spine[1], f.spine[2]];
  o.head = [GUARD.head[0] + (f.head[0] - GUARD.head[0]) * k, f.head[1], f.head[2]];
  return o;
}
for (const [id, g] of Object.entries(GEST)) {
  const k = AMP[id] ?? 1;
  const f3 = k === 1 ? { ...GUARD, ...g.f3 } : amplify({ ...GUARD, ...g.f3 }, k);
  const f5 = k === 1 ? { ...GUARD, ...g.f5 } : amplify({ ...GUARD, ...g.f5 }, k);
  emit(id, g.skill, SK.get(g.skill).hitAt[0], false, (w, rec) => frames({ w, rec, voice: g.voice, f3, f5, nine: false }));
}

// ---- E2-G: pose chiêu bậc 2–3 (Lạc Kiếm / Kim Thân / Đan Kinh). Mỗi chiêu một pose, một giọng (của công pháp chiêu). ----
// Kiểu vung mới: Hoành Kiếm Phá Mạch quét ngang thật rộng từ sau lưng.
SWINGS.hoanh = {
  dir: 1,
  load: { hand: [-0.55, 0.34, -0.16], sword: [-0.85, 0.1, -0.5], edge: [-0.5, 0, 0.85], elbow: [-0.2, -0.7, -0.7], head: -26 },
  strike: { x: 0.02, dy: 0, sword: [0.7, 0.05, 0.71], edge: [0.71, 0, -0.7], elbow: [-0.6, -0.8, -0.1], head: 24 },
};
// Thuấn Di Trảm: thuấn di rồi chém xuống dứt khoát (nhịp rất ngắn).
SWINGS.thuan = {
  dir: -1,
  load: { hand: [-0.3, 0.82, -0.1], sword: [-0.2, 0.7, -0.68], edge: [0.4, 0.5, 0.75], elbow: [-0.8, 0.1, -0.4], head: 12 },
  strike: { x: -0.1, dy: 0, sword: [0.1, -0.5, 0.86], edge: [0.5, -0.8, 0.2], elbow: [-0.4, -0.9, 0], head: -8 },
};
for (const [id, skill, swing, voice] of [
  ['hoanh_kiem', 'skl_hoanh_kiem_pha_mach', 'hoanh', 'kt'],
  ['thuan_di_tram', 'skl_thuan_di_tram', 'thuan', 'kt'],
  ['thien_kiem_hoa_hinh', 'skl_thien_kiem_hoa_hinh', 'van', 'kt'],
  ['thiet_quyen', 'skl_thiet_quyen_chan_dia', 'd3', 'hp'],
  ['dan_hoa', 'skl_dan_hoa_phong_tran', 'anh', 'ds'],
]) {
  const { f3, f5 } = swingFrames(swing, voice);
  emit(id, skill, SK.get(skill).hitAt[0], true, (w, rec) => frames({ w, rec, voice, f3, f5, nine: true, arc: voice === 'ds' }));
}

// Kiếm Vũ Tam Điệp: ba nhát liền trong một GCD (đòn 1 chém ngang, đòn 2 hất ngược, đòn 3 bổ xuống), mốc theo `hitAt` của chiêu.
{
  const s = SK.get('skl_kiem_vu_tam_diep');
  const segs = ['d1', 'd2', 'd3'].map((sw) => swingFrames(sw, 'kt'));
  const ks = [keyOf(0, GUARD)];
  s.hitAt.forEach((h, i) => {
    const { f3, f5 } = segs[i];
    const prev = i === 0 ? 0 : s.hitAt[i - 1];
    ks.push(keyOf(r3(prev + (h - prev) * 0.45), f3, 'inOut'));
    ks.push(keyOf(h - 0.04, { ...f3, hipsPos: add(f3.hipsPos, [0, -0.008, 0]) }, 'linear'));
    ks.push(keyOf(h, f5, 'quartOut'));
    // Nhát cuối đi quá đà rồi về thế; hai nhát đầu nối thẳng sang nhát sau.
    if (i === s.hitAt.length - 1) ks.push(keyOf(h + 0.06, overshoot(f3, f5, VOICES.kt.over), 'out'));
  });
  ks.push(keyOf(s.hitAt[s.hitAt.length - 1] + s.recovery, GUARD, 'inOut'));
  POSES.push({ id: 'kiem_vu', duration: r3(s.hitAt[s.hitAt.length - 1] + s.recovery), loop: false, hit: [r3(s.hitAt[0]), r3(s.hitAt[0] + 0.16)], keys: ks });
}

// Cử chỉ hai tay (7 khung). `mk` tạo cặp khung (tụ lực → ra chiêu) từ mẫu: ép xuống, nâng lên, mở hai bên, đẩy ra trước, ấn quyết.
const L0 = { footR: GUARD.footR, footL: GUARD.footL };
const WIDE = { footR: [-0.27, 0, 0.05], footL: [0.27, 0, -0.05] };
const SOFT = { footR: [-0.16, 0, 0.12], footL: [0.18, 0, -0.2] };
const hands = (a, b, y, z, ex = 0.8) => ({ handR: [-a, y, z], handL: [a, y, z], elbowR: [-ex, -0.5, -0.2], elbowL: [ex, -0.5, -0.2], ...b });
const TPL = {
  // Ấn hai tay xuống đất.
  press: (v) => ({ f3: { ...v.pose, spine: [4, 0, 0], head: [8, 0, 0], ...hands(0.1, {}, 0.5, 0.22) }, f5: { ...v.pose, hipsPos: [0, v.pose.hipsPos[1] - 0.04, 0.04], spine: [18, 0, 0], head: [14, 0, 0], ...hands(0.14, {}, 0.1, 0.42, 0.5) } }),
  // Nâng hai tay lên cao.
  raise: (v) => ({ f3: { ...v.pose, spine: [10, 0, 0], head: [16, 0, 0], ...hands(0.1, {}, 0.18, 0.3) }, f5: { ...v.pose, spine: [-10, 0, 0], head: [-24, 0, 0], ...hands(0.16, {}, 0.88, 0.18, 0.7) } }),
  // Khép tay trước ngực rồi mở ra hai bên.
  open: (v) => ({ f3: { ...v.pose, spine: [6, 0, 0], head: [8, 0, 0], ...hands(0.04, {}, 0.46, 0.24, 1) }, f5: { ...v.pose, spine: [-6, 0, 0], head: [-8, 0, 0], ...hands(0.6, {}, 0.38, 0.12, 0.3) } }),
  // Gồng khí rồi đẩy hai chưởng ra trước.
  thrust: (v) => ({ f3: { ...v.pose, spine: [8, 0, 0], head: [6, 0, 0], ...hands(0.1, {}, 0.36, 0.14, 0.9) }, f5: { ...v.pose, hipsPos: [0, v.pose.hipsPos[1] - 0.02, 0.1], spine: [16, 0, 0], head: [-4, 0, 0], ...hands(0.12, {}, 0.4, 0.5, 0.45) } }),
  // Tay áo vung vòng (đan sư): một tay quét ngang.
  sweep: (v) => ({ f3: { ...v.pose, hipsRot: [0, -12, 0], spine: [6, -14, 0], head: [10, 0, 0], handR: [-0.3, 0.2, 0.14], elbowR: [-0.7, -0.6, -0.4], handL: [0.06, 0.34, 0.26], elbowL: [0.8, -0.6, -0.2] }, f5: { ...v.pose, hipsRot: [0, 14, 0], spine: [-8, 16, 0], head: [-16, 0, 0], handR: [-0.55, 0.62, 0.3], elbowR: [-1, 0.1, -0.3], handL: [0.06, 0.38, 0.3], elbowL: [0.8, -0.4, -0.2] } }),
  // Chắp tay cúi đầu rồi dang tay đón.
  vow: (v) => ({ f3: { ...v.pose, spine: [14, 0, 0], head: [20, 0, 0], ...hands(0.03, {}, 0.38, 0.28, 1) }, f5: { ...v.pose, spine: [-6, 0, 0], head: [-14, 0, 0], ...hands(0.55, {}, 0.6, 0.2, 0.4) } }),
};
const VOICE_POSE = {
  kt: { pose: { hipsPos: [0, -0.15, 0], hipsRot: [0, 0, 0], ...L0, sword: [0, 1, 0.05], edge: [1, 0, 0] } },
  hp: { pose: { hipsPos: [0, -0.25, 0], hipsRot: [0, 0, 0], ...WIDE, sword: [0, -1, 0.2], edge: [0, 0, 1] } },
  ds: { pose: { hipsPos: [0, -0.1, 0], hipsRot: [0, 0, 0], ...SOFT, sword: [0, -1, 0.15], edge: [0, 0, 1] } },
};
for (const [id, skill, voice, tpl] of [
  ['kiem_dan', 'skl_kiem_dan_ban_menh', 'kt', 'thrust'],
  ['phan_anh_kiem_anh', 'skl_phan_anh_kiem_anh', 'kt', 'vow'],
  ['kim_chung', 'skl_kim_chung_tran', 'hp', 'thrust'],
  ['son_nhac', 'skl_son_nhac_hoa_than', 'hp', 'raise'],
  ['anh_thiet_than', 'skl_anh_thiet_than', 'hp', 'open'],
  ['thuan_di_ho_the', 'skl_thuan_di_ho_the', 'hp', 'press'],
  ['thien_kim_phap_tuong', 'skl_thien_kim_phap_tuong', 'hp', 'raise'],
  ['moc_linh', 'skl_moc_linh_tran', 'ds', 'press'],
  ['duoc_vu', 'skl_duoc_vu', 'ds', 'sweep'],
  ['ngung_dan', 'skl_ngung_dan_ho_the', 'ds', 'open'],
  ['anh_duoc_hoa_than', 'skl_anh_duoc_hoa_than', 'ds', 'vow'],
  ['thuan_di_cuu_vien', 'skl_thuan_di_cuu_vien', 'ds', 'raise'],
  ['thien_dan_phap_gioi', 'skl_thien_dan_phap_gioi', 'ds', 'raise'],
]) {
  const g = TPL[tpl](VOICE_POSE[voice]);
  const f3 = { ...GUARD, ...g.f3 };
  const f5 = { ...GUARD, ...g.f5 };
  emit(id, skill, SK.get(skill).hitAt[0], false, (w, rec) => frames({ w, rec, voice, f3, f5, nine: false }));
}

/** Một khóa một dòng cho dễ đọc diff. */
function fmt(p) {
  const head = `{\n  "id": ${JSON.stringify(p.id)},\n  "duration": ${p.duration},\n  "loop": false,\n  "hit": ${JSON.stringify(p.hit)},\n  "keys": [\n`;
  const body = p.keys.map((k) => '    ' + JSON.stringify(k).replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/\}$/g, ' }')).join(',\n');
  return head + body + '\n  ]\n}\n';
}
const only = new Set(process.argv.slice(2));
for (const p of POSES) {
  if (only.size && !only.has(p.id)) continue;
  fs.writeFileSync(path.join(OUT, `${p.id}.json`), fmt(p));
}
console.log(`đã ghi ${POSES.length} pose: ${POSES.map((p) => p.id).join(', ')}`);
