import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SET } from '@dtl/content';
import type { EquipSlot } from '@dtl/shared';
import type { BodyFit, FitBone, TubeFit } from './bodyFit';
import { boneKey } from './ikpose';

/**
 * Phụ kiện hình dáng cho 4 bộ trang bị (Lạc Kiếm Môn Phục, Huyền Giáp Hộ Pháp, Đan Tâm Y Bát, Hàn Giao Lân): vai giáp,
 * hộ uyển, đai lưng, ống ủng, ngọc bội, vây lưng, dải lụa và tua. Dựng bằng mesh thủ tục (không Tripo, không tải thêm
 * file), mỗi món hiện theo ô đã mặc (`accessoryCode`), món lẻ cũng hiện.
 *
 * Cách gắn: mọi phần cứng được dựng ở hệ thế giới của tư thế idle (số đo thân ở `bodyFit.ts`, nên vừa cả nam lẫn nữ), gắn
 * cứng vào một xương và gộp thành đúng một `SkinnedMesh` dùng chung bộ xương của thân (2 draw call: vải, cứng), nên
 * theo xương miễn phí, LOD xa tự ẩn cùng mesh thân. Dải lụa và tua là mesh riêng (tối đa 2) lắc theo vận tốc.
 * Mọi kích thước tính từ số đo thân + khe hở nhỏ để không xuyên mesh áo lúc chạy, chém, ngự kiếm.
 */

export type Kind = 'cloth' | 'hard';

/** Phần cứng gắn một xương. */
export interface Part {
  bone: FitBone;
  kind: Kind;
  geo: THREE.BufferGeometry;
}

/** Dải lụa/tua: mesh riêng, hạt trục quay `pivot` (hệ idle), lắc quanh trục X ra sau theo tốc độ. */
export interface Ribbon {
  bone: FitBone;
  geo: THREE.BufferGeometry;
  pivot: THREE.Vector3;
  /** Hệ số lắc (rad mỗi m/s). */
  gain: number;
}

export interface BuiltAccessories {
  parts: Part[];
  ribbons: Ribbon[];
  /**
   * Hình học đã gộp theo vật liệu, đã gắn skinIndex/skinWeight (thứ tự xương giống nhau giữa mọi bản sao `cloneSkinned`).
   * Tạo lười ở lần gắn đầu tiên rồi dùng chung cho mọi người chơi cùng đồ; chủ cache giải phóng bằng `disposeAccessories`.
   */
  merged?: Partial<Record<Kind, THREE.BufferGeometry>>;
}

/** Giải phóng mọi hình học của một bản dựng (phần cứng, dải lụa, bản gộp). */
export function disposeAccessories(b: BuiltAccessories | null | undefined): void {
  if (!b) return;
  for (const p of b.parts) p.geo.dispose();
  for (const r of b.ribbons) r.geo.dispose();
  for (const g of Object.values(b.merged ?? {})) g?.dispose();
  b.merged = undefined;
}

// ---------- tiện ích hình học ----------

const lin = (hex: string) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
const UP = new THREE.Vector3(0, 1, 0);

interface PutOpts {
  pos?: THREE.Vector3;
  /** Trục +Y của hình gốc quay về hướng này. */
  dir?: THREE.Vector3;
  scale?: THREE.Vector3 | number;
}

/** Bake hình gốc: biến đổi, bỏ UV, gắn màu đỉnh (tuyến tính). */
function put(src: THREE.BufferGeometry, hex: string, o: PutOpts = {}): THREE.BufferGeometry {
  const g = src;
  // Hình không có chỉ số (khối đa diện) thêm chỉ số tuần tự để gộp được với hình có chỉ số.
  if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
  const q = new THREE.Quaternion();
  if (o.dir) q.setFromUnitVectors(UP, o.dir.clone().normalize());
  const sc = typeof o.scale === 'number' ? new THREE.Vector3(o.scale, o.scale, o.scale) : (o.scale ?? new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(new THREE.Matrix4().compose(o.pos ?? new THREE.Vector3(), q, sc));
  g.deleteAttribute('uv');
  const c = lin(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Chỏm cầu (cực +Y): `theta` là nửa góc mở. */
const capGeo = (theta: number, wSeg = 12, hSeg = 4) => new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, theta);
const sphereGeo = (seg = 8) => new THREE.SphereGeometry(1, seg, Math.max(3, seg >> 1));
const tubeGeo = (rTop: number, rBot: number, h: number, seg = 16, open = true) => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
const ringGeo = (r: number, tube: number, seg = 16) => new THREE.TorusGeometry(r, tube, 5, seg).rotateX(Math.PI / 2);
const boxGeo = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

/**
 * Dải elip quanh thân tại độ cao `y` (đai): nửa rộng `rx`, nửa sâu trước/sau khác nhau, cao `h`, hơi loe xuống theo `flare`.
 */
function bandGeo(cx: number, cz: number, rx: number, zFront: number, zBack: number, y: number, h: number, flare = 0, seg = 28): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const sn = Math.sin(a);
    const rz = sn >= 0 ? zFront : zBack;
    for (const [dy, f] of [[h / 2, 0], [-h / 2, flare]] as const) {
      pos.push(cx + (rx + f) * Math.cos(a), y + dy, cz + (rz + (rz >= 0 ? f : -f)) * sn);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Dải thẳng rũ xuống từ gốc (0,0,0): rộng `w`, dài `len`, đuôi nhọn/vát; mặt phẳng XY, hướng ra sau là -Z. */
function stripGeo(w: number, len: number, tip: 'flat' | 'v' | 'point' = 'v', seg = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  // Hàng cuối của 'v' (đuôi én) là 3 đỉnh (trái, giữa lùi lên, phải) thay vì 2.
  const rows = tip === 'v' ? seg : seg + 1;
  for (let i = 0; i < rows; i++) {
    const t = i / seg;
    // Hơi thu nhỏ về đuôi (tua mảnh hơn ở đuôi) và cong nhẹ về sau.
    const hw = (w / 2) * (1 - (tip === 'point' ? 0.85 : 0.18) * t);
    pos.push(-hw, -len * t, -0.012 * t, hw, -len * t, -0.012 * t);
  }
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  if (tip === 'v') {
    const hw = (w / 2) * 0.82;
    const m = pos.length / 3;
    pos.push(-hw, -len, -0.012, 0, -len * 0.86, -0.012, hw, -len, -0.012);
    const p0 = (rows - 1) * 2;
    idx.push(p0, m, m + 1, p0, m + 1, p0 + 1, p0 + 1, m + 1, m + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- bảng màu theo bộ ----------

interface Pal {
  /** Vải chính, vải phụ, kim loại/giáp, viền, ngọc/nổi bật. */
  cloth: string;
  cloth2: string;
  hard: string;
  trim: string;
  gem: string;
}

function paletteOf(setId: string): Pal {
  const look = SET.get(setId)?.look;
  const hex = look?.hex ?? '#888888';
  const trim = look?.trim ?? '#cccccc';
  switch (setId) {
    case 'set_lac_kiem':
      return { cloth: trim, cloth2: hex, hard: '#aeb9c4', trim: '#c9d3dc', gem: '#5fae9a' };
    case 'set_huyen_giap':
      return { cloth: '#23252b', cloth2: '#3a3126', hard: '#33363e', trim, gem: '#b0412f' };
    case 'set_dan_tam':
      return { cloth: hex, cloth2: '#2f5446', hard: '#8c6a3c', trim, gem: '#62b79c' };
    case 'set_liet_mach':
      return { cloth: hex, cloth2: '#efe6cf', hard: '#b07a3c', trim, gem: '#5fb89c' };
    case 'set_dia_giap':
      return { cloth: '#3b2a1f', cloth2: hex, hard: '#7a5a3c', trim, gem: '#d98a2b' };
    case 'set_phuc_mach':
      return { cloth: hex, cloth2: '#34503a', hard: '#9a8a52', trim, gem: '#8fe3b4' };
    case 'set_kinh_quang':
      return { cloth: hex, cloth2: '#f1f5fb', hard: '#a9bbd2', trim, gem: '#9fe6ff' };
    case 'set_van_kinh':
      return { cloth: '#3e4a59', cloth2: hex, hard: '#97a6b8', trim, gem: '#8fc8ff' };
    case 'set_luu_ly':
      return { cloth: hex, cloth2: '#e8f1e4', hard: '#8fd3c8', trim, gem: '#7df5e0' };
    default:
      return { cloth: hex, cloth2: '#1d5d6c', hard: '#4aa3b4', trim, gem: '#bfe9f0' };
  }
}

// ---------- dựng từng món ----------

interface Ctx {
  fit: BodyFit;
  pal: Pal;
  parts: Part[];
  ribbons: Ribbon[];
  h: number;
}

const add = (c: Ctx, bone: FitBone, kind: Kind, geo: THREE.BufferGeometry) => c.parts.push({ bone, kind, geo });
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Chỏm vai: lớp `layers` xếp chồng quanh khớp vai, cực hướng lên-ra ngoài, có viền. */
function pauldron(c: Ctx, s: 1 | -1, o: { r: number; facets: number; layers: { k: number; theta: number; lift: number; color: string; kind: Kind }[]; rim: string; rimKind: Kind; stud?: string; spikes?: string; scales?: { color: string; tiers: [number, number, number][] } }): void {
  const sh = c.fit.shoulder[s];
  const bone: FitBone = s === 1 ? 'leftarm' : 'rightarm';
  const u = V(s * 0.72, 0.69, -0.02).normalize();
  const R = o.r;
  for (const L of o.layers) {
    const centre = sh.center.clone().addScaledVector(u, L.lift * R).add(V(0, -0.004, 0));
    const g = put(capGeo(L.theta, o.facets, 3), L.color, { pos: centre, dir: u, scale: R * L.k });
    add(c, bone, L.kind, g);
  }
  // Viền ở mép lớp ngoài cùng.
  const base = o.layers[0];
  const rr = Math.sin(base.theta) * R * base.k;
  const rimC = sh.center.clone().addScaledVector(u, (base.lift + Math.cos(base.theta) * base.k) * R).add(V(0, -0.004, 0));
  add(c, bone, o.rimKind, put(ringGeo(rr, 0.006 * c.h * 1.3, o.facets * 2), o.rim, { pos: rimC, dir: u, scale: 1 }).rotateX(0));
  if (o.scales) {
    // Vảy chồng: mỗi tầng một vòng vảy lục giác nhọn (góc cực θ, số vảy n, cỡ k·R) nghiêng xuống phía mép như ngói.
    const base = o.layers[0];
    const c0 = sh.center.clone().addScaledVector(u, base.lift * R).add(V(0, -0.004, 0));
    const e1 = new THREE.Vector3().crossVectors(u, V(0, 0, 1)).normalize();
    const e2 = new THREE.Vector3().crossVectors(u, e1).normalize();
    for (const [theta, n, k] of o.scales.tiers) {
      for (let i = 0; i < n; i++) {
        const phi = (i / n) * Math.PI * 2 + theta * 3;
        const tang = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
        const d = u.clone().multiplyScalar(Math.cos(theta)).addScaledVector(tang, Math.sin(theta));
        const down = tang.clone().multiplyScalar(Math.cos(theta)).addScaledVector(u, -Math.sin(theta));
        const w = k * R;
        const pos = c0.clone().addScaledVector(d, R * base.k + 0.002);
        add(c, bone, 'hard', put(new THREE.ConeGeometry(w, w * 0.55, 5, 1, true), o.scales.color, { pos, dir: d.clone().addScaledVector(down, 0.5) }));
      }
    }
  }
  if (o.stud) {
    const top = sh.center.clone().addScaledVector(u, (o.layers[o.layers.length - 1].lift + o.layers[o.layers.length - 1].k) * R + 0.004);
    add(c, bone, 'hard', put(sphereGeo(6), o.stud, { pos: top, scale: 0.012 * c.h }));
  }
  if (o.spikes) {
    for (let i = -1; i <= 1; i++) {
      const d = u.clone().applyAxisAngle(V(0, 0, 1), (-s * i * 0.42)).applyAxisAngle(V(0, 1, 0), i * 0.0);
      const p = sh.center.clone().addScaledVector(d, R * 1.02);
      add(c, bone, 'hard', put(new THREE.ConeGeometry(0.02 * c.h, 0.1 * c.h, 5), o.spikes, { pos: p.addScaledVector(d, 0.035 * c.h), dir: d }));
    }
  }
}

/** Vòng quanh trục `axis` tại `at`, bán kính `r` (cho đinh tán, vòng khảm). */
function around(at: THREE.Vector3, axis: THREE.Vector3, out: THREE.Vector3, r: number, deg: number): THREE.Vector3 {
  const side = new THREE.Vector3().crossVectors(axis, out).normalize();
  const a = (deg * Math.PI) / 180;
  return at.clone().addScaledVector(out, Math.cos(a) * r).addScaledVector(side, Math.sin(a) * r);
}

/**
 * Hộ uyển: ống côn ôm cẳng tay (rộng ở khuỷu, thon ở cổ tay), mép khuỷu loe vát, hai vòng viền + vòng khảm giữa, hàng đinh
 * tán và tấm dày nổi ở mặt ngoài (mặt ngoài dày hơn mặt trong, phá đối xứng trụ).
 */
function bracer(c: Ctx, s: 1 | -1, o: { len: number; kind: Kind; color: string; rim: string; gem?: string; plate?: string }): void {
  const f: TubeFit = c.fit.forearm[s];
  const bone: FitBone = s === 1 ? 'leftforearm' : 'rightforearm';
  const h = c.h;
  const r = f.radius + 0.005 * h;
  const rE = r * 0.96;
  const rW = r * 0.8;
  const len = o.len * h;
  const centre = f.center.clone().addScaledVector(f.axis, 0.012);
  const elbow = centre.clone().addScaledVector(f.axis, -len / 2);
  const wrist = centre.clone().addScaledVector(f.axis, len / 2);
  const rAt = (t: number) => rE + (rW - rE) * t;
  const up = f.axis.clone().negate();
  add(c, bone, o.kind, put(tubeGeo(rE, rW, len, 14), o.color, { pos: centre, dir: up }));
  // Mép khuỷu loe vát.
  add(c, bone, o.kind, put(tubeGeo(rE * 1.1, rE * 0.99, 0.016 * h, 14), o.color, { pos: elbow.clone().addScaledVector(f.axis, 0.006 * h), dir: up }));
  add(c, bone, 'hard', put(ringGeo(rE * 1.1, 0.0042 * h, 14), o.rim, { pos: elbow.clone().addScaledVector(f.axis, -0.002 * h), dir: f.axis }));
  add(c, bone, 'hard', put(ringGeo(rW + 0.0015, 0.0042 * h, 16), o.rim, { pos: wrist, dir: f.axis }));
  // Vòng khảm giữa (khắc nổi, màu viền).
  add(c, bone, 'hard', put(ringGeo(rAt(0.55) + 0.0012, 0.0028 * h, 16), o.rim, { pos: centre.clone().addScaledVector(f.axis, len * 0.05), dir: f.axis }));
  const out = V(s, 0, 0).addScaledVector(f.axis, -f.axis.x * s).normalize();
  // Hàng đinh tán ở nửa ngoài, gần khuỷu.
  for (const deg of [-52, -26, 0, 26, 52]) {
    add(c, bone, 'hard', put(new THREE.OctahedronGeometry(1), o.rim, { pos: around(elbow.clone().addScaledVector(f.axis, len * 0.22), f.axis, out, rAt(0.22) + 0.0018, deg), scale: 0.0042 * h }));
  }
  // Tấm dày nổi mặt ngoài, vát về cổ tay.
  const plate = put(boxGeo(0.026 * h, len * 0.7, 0.007 * h), o.plate ?? o.rim, { pos: centre.clone().addScaledVector(out, rAt(0.45) + 0.004 * h).addScaledVector(f.axis, -len * 0.04), dir: up });
  add(c, bone, 'hard', plate);
  if (o.gem) add(c, bone, 'hard', put(sphereGeo(6), o.gem, { pos: centre.clone().addScaledVector(out, rAt(0.45) + 0.009 * h).addScaledVector(f.axis, -len * 0.04), scale: V(0.01, 0.01, 0.007).multiplyScalar(h) }));
}

/**
 * Ống ủng: ống côn thon xuống mắt cá, mép trên loe vát, hai vòng viền, hàng đinh tán phía trước và lưỡi gà (tấm dày ở mặt
 * trước, mặt sau mỏng).
 */
function cuff(c: Ctx, s: 1 | -1, o: { len: number; kind: Kind; color: string; rim: string; flare: number; plate?: string }): void {
  const f = c.fit.shin[s];
  const bone: FitBone = s === 1 ? 'leftleg' : 'rightleg';
  const h = c.h;
  // Ủng ôm ống chân: số đo bắp chân lấy từ đỉnh xương cẳng chân nhưng chặn trên (đỉnh gắn xương cẳng chân gồm cả vạt áo
  // nên đo ra to như cái xô), thon dần xuống mắt cá, cổ ủng loe nhẹ, cao tới quá nửa ống chân.
  const from = c.fit.bones[s === 1 ? 'leftleg' : 'rightleg'].pos;
  const to = c.fit.bones[s === 1 ? 'leftfoot' : 'rightfoot'].pos;
  const axis = f.axis;
  const legLen = to.clone().sub(from).length();
  const tBot = 0.97;
  const tTop = Math.max(0.45, tBot - Math.min(0.55, (o.len * 1.9 * h) / legLen));
  const at = (t: number) => from.clone().lerp(to, t);
  const rCalf = Math.min(f.radius, 0.056 * h) + 0.003 * h;
  const rUp = rCalf + o.flare * 0.6;
  const rDn = rCalf * 0.74;
  const top = at(tTop);
  const bot = at(tBot);
  const len = top.distanceTo(bot);
  const mid = top.clone().lerp(bot, 0.5);
  const up = axis.clone().negate();
  const rAt = (t: number) => rUp + (rDn - rUp) * t;
  add(c, bone, o.kind, put(tubeGeo(rUp, rDn, len, 12), o.color, { pos: mid, dir: up }));
  add(c, bone, o.kind, put(tubeGeo(rUp * 1.08, rUp * 0.99, 0.012 * h, 12), o.color, { pos: top.clone().addScaledVector(axis, 0.004 * h), dir: up }));
  add(c, bone, 'hard', put(ringGeo(rUp * 1.08, 0.0035 * h, 12), o.rim, { pos: top.clone().addScaledVector(axis, -0.001 * h), dir: axis }));
  add(c, bone, 'hard', put(ringGeo(rDn + 0.001, 0.0035 * h, 12), o.rim, { pos: bot, dir: axis }));
  const front = V(0, 0, 1);
  for (const deg of [-30, 0, 30]) {
    add(c, bone, 'hard', put(new THREE.OctahedronGeometry(1), o.rim, { pos: around(top.clone().addScaledVector(axis, len * 0.2), axis, front, rAt(0.2) + 0.001, deg), scale: 0.0036 * h }));
  }
  add(c, bone, 'hard', put(boxGeo(0.02 * h, len * 0.72, 0.005 * h), o.plate ?? o.rim, { pos: mid.clone().addScaledVector(front, rAt(0.5) + 0.002 * h), dir: up }));
}

/** Đai lưng: dải ôm eo + 2 viền + khóa trước. */
function belt(c: Ctx, o: { h: number; color: string; rim: string; buckle: string; gem: string; wide?: boolean }): void {
  const w = c.fit.waist;
  const k = 0.011 * c.h;
  const hh = o.h * c.h;
  add(c, 'spine', 'cloth', put(bandGeo(w.cx, w.cz, w.rx + k, w.zFront + k, w.zBack - k, w.y, hh, 0.006), o.color));
  for (const d of [-1, 1]) {
    add(c, 'spine', 'hard', put(bandGeo(w.cx, w.cz, w.rx + k + 0.003, w.zFront + k + 0.003, w.zBack - k - 0.003, w.y + d * hh * 0.5, 0.008 * c.h, 0, 28), o.rim));
  }
  const front = V(w.cx, w.y, w.zFront + k + 0.004);
  add(c, 'spine', 'hard', put(boxGeo((o.wide ? 0.07 : 0.05) * c.h, hh * 1.15, 0.014 * c.h), o.buckle, { pos: front }));
  add(c, 'spine', 'hard', put(sphereGeo(7), o.gem, { pos: front.clone().add(V(0, 0, 0.009 * c.h)), scale: V(0.013, 0.013, 0.008).multiplyScalar(c.h) }));
}

/** Dải lụa sau lưng (2 đuôi) bám đai, treo sau vạt áo. */
function backTails(c: Ctx, o: { w: number; len: number; color: string; stripe: string; tip: 'flat' | 'v' | 'point'; gain: number }): void {
  const w = c.fit.waist;
  const sk = c.fit.skirt;
  const z = Math.min(sk.zBack, w.zBack) - 0.016 * c.h;
  const geos: THREE.BufferGeometry[] = [];
  for (const dx of [-1, 1]) {
    const x = w.cx + dx * 0.04 * c.h;
    geos.push(put(stripGeo(o.w * c.h, o.len * c.h, o.tip), o.color, { pos: V(x, w.y - 0.012, z) }));
    geos.push(put(stripGeo(o.w * c.h * 0.22, o.len * c.h * 0.97, o.tip), o.stripe, { pos: V(x, w.y - 0.012, z - 0.003) }));
  }
  c.ribbons.push({ bone: 'spine', geo: mergeGeometries(geos, false)!, pivot: V(w.cx, w.y, z), gain: o.gain });
}

/** Tua/hồ lô treo bên hông trái: dây + vật treo. */
function hipCharm(c: Ctx, o: { cord: string; item: 'tassel' | 'gourd' | 'jade'; color: string; accent: string; gain: number }): void {
  const w = c.fit.waist;
  const sk = c.fit.skirt;
  const x = sk.cx + sk.rx + 0.012 * c.h;
  const z = sk.cz + 0.03 * c.h;
  const y0 = w.y - 0.012;
  const geos: THREE.BufferGeometry[] = [put(stripGeo(0.012 * c.h, 0.1 * c.h, 'flat', 1), o.cord, { pos: V(x, y0, z) })];
  const yEnd = y0 - 0.1 * c.h;
  if (o.item === 'gourd') {
    geos.push(put(sphereGeo(8), o.color, { pos: V(x, yEnd - 0.022 * c.h, z), scale: 0.022 * c.h }));
    geos.push(put(sphereGeo(8), o.color, { pos: V(x, yEnd - 0.056 * c.h, z), scale: 0.03 * c.h }));
    geos.push(put(ringGeo(0.011 * c.h, 0.003 * c.h, 8), o.accent, { pos: V(x, yEnd - 0.036 * c.h, z) }));
    geos.push(put(stripGeo(0.016 * c.h, 0.07 * c.h, 'v', 2), o.accent, { pos: V(x, yEnd - 0.084 * c.h, z) }));
  } else if (o.item === 'jade') {
    geos.push(put(new THREE.CylinderGeometry(0.026 * c.h, 0.026 * c.h, 0.008 * c.h, 14).rotateX(Math.PI / 2), o.color, { pos: V(x, yEnd - 0.026 * c.h, z) }));
    geos.push(put(stripGeo(0.016 * c.h, 0.1 * c.h, 'v', 3), o.accent, { pos: V(x, yEnd - 0.052 * c.h, z) }));
  } else {
    geos.push(put(sphereGeo(7), o.accent, { pos: V(x, yEnd - 0.012 * c.h, z), scale: 0.014 * c.h }));
    geos.push(put(stripGeo(0.026 * c.h, 0.13 * c.h, 'v', 3), o.color, { pos: V(x, yEnd - 0.018 * c.h, z) }));
  }
  c.ribbons.push({ bone: 'spine', geo: mergeGeometries(geos, false)!, pivot: V(x, y0, z), gain: o.gain });
}

/** Ngọc bội đeo ngực: dây chữ V + đĩa ngọc viền vàng. */
function pendant(c: Ctx, o: { cord: string; jade: string; rim: string }): void {
  const ch = c.fit.chest;
  const z = ch.zFront + 0.016 * c.h;
  const y = ch.y - 0.05 * c.h;
  const neckY = c.fit.bones.neck.pos.y - 0.025 * c.h;
  const x0 = 0.05 * c.h;
  for (const s of [-1, 1]) {
    const a = V(ch.cx + s * x0, neckY, z - 0.012 * c.h);
    const b = V(ch.cx, y + 0.02 * c.h, z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const d = b.clone().sub(a);
    add(c, 'spine2', 'cloth', put(boxGeo(0.004 * c.h, d.length(), 0.004 * c.h), o.cord, { pos: mid, dir: d }));
  }
  const p = V(ch.cx, y, z);
  add(c, 'spine2', 'hard', put(new THREE.CylinderGeometry(0.03 * c.h, 0.03 * c.h, 0.008 * c.h, 16).rotateX(Math.PI / 2), o.jade, { pos: p }));
  add(c, 'spine2', 'hard', put(new THREE.TorusGeometry(0.031 * c.h, 0.0045 * c.h, 5, 18), o.rim, { pos: p.clone().add(V(0, 0, 0.002)) }));
}

/** Vây lưng: 3 gai băng dọc cột sống trên. */
function dorsal(c: Ctx, o: { color: string }): void {
  const ch = c.fit.chest;
  const z = Math.min(ch.zBack, c.fit.waist.zBack + 0.02) - 0.004 * c.h;
  for (let i = 0; i < 3; i++) {
    const y = ch.y - (0.05 + i * 0.075) * c.h;
    const len = (0.12 - i * 0.02) * c.h;
    const d = V(0, 0.45, -1).normalize();
    add(c, 'spine1', 'hard', put(new THREE.ConeGeometry(0.024 * c.h, len, 5), o.color, { pos: V(ch.cx, y, z).addScaledVector(d, len * 0.4), dir: d }));
  }
}

/** Vòng đeo bàn tay (nhẫn lớn): dải mảnh ôm bàn tay trái ngay sau khớp ngón, có ngọc ở mu tay. */
function handBand(c: Ctx, o: { color: string; gem: string }): void {
  const f = c.fit.forearm[1];
  const hand = c.fit.bones.lefthand.pos;
  const p = hand.clone().addScaledVector(f.axis, 0.03 * c.h);
  const r = 0.036 * c.h;
  add(c, 'lefthand', 'hard', put(ringGeo(r, 0.0065 * c.h, 14), o.color, { pos: p, dir: f.axis }));
  const out = V(1, 0, 0).addScaledVector(f.axis, -f.axis.x).normalize();
  add(c, 'lefthand', 'hard', put(sphereGeo(6), o.gem, { pos: p.clone().addScaledVector(out, r + 0.003), scale: 0.01 * c.h }));
}

type Builder = (c: Ctx) => void;

/** Bán kính vai dùng cho vai giáp: kẹp để tay áo rộng (nữ) không làm vai giáp quá to. */
const shR = (c: Ctx, s: 1 | -1, k: number) => Math.min(c.fit.shoulder[s].radius, 0.095 * c.h) * k;

const BUILDERS: Record<string, Partial<Record<EquipSlot, Builder>>> = {
  // Lạc Kiếm Môn Phục: ngà + lam đậm, bạc. Tinh tế, thanh thoát.
  set_lac_kiem: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        const r = shR(c, s, 1.22);
        pauldron(c, s, { r, facets: 12, rim: c.pal.hard, rimKind: 'hard', layers: [{ k: 1, theta: 1.2, lift: 0, color: c.pal.cloth, kind: 'cloth' }, { k: 0.72, theta: 1.05, lift: 0.2, color: c.pal.cloth2, kind: 'cloth' }] });
      }
      backTails(c, { w: 0.075, len: 0.36, color: c.pal.cloth, stripe: c.pal.cloth2, tip: 'v', gain: 0.07 });
    },
    bracer: (c) => {
      for (const s of [1, -1] as const) bracer(c, s, { len: 0.085, kind: 'cloth', color: c.pal.cloth, rim: c.pal.hard, gem: c.pal.gem });
    },
    belt: (c) => {
      belt(c, { h: 0.055, color: c.pal.cloth, rim: c.pal.hard, buckle: c.pal.hard, gem: c.pal.gem });
      hipCharm(c, { cord: c.pal.cloth2, item: 'jade', color: c.pal.gem, accent: c.pal.cloth, gain: 0.05 });
    },
    boots: (c) => {
      for (const s of [1, -1] as const) cuff(c, s, { len: 0.065, kind: 'cloth', color: c.pal.cloth, rim: c.pal.hard, flare: 0.003 });
    },
  },
  // Huyền Giáp Hộ Pháp: đen thép, viền vàng, nặng và góc cạnh.
  set_huyen_giap: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        const r = shR(c, s, 1.3);
        pauldron(c, s, { r, facets: 6, rim: c.pal.trim, rimKind: 'hard', stud: c.pal.trim, scales: { color: '#454953', tiers: [[0.42, 6, 0.26], [0.78, 9, 0.28], [1.1, 12, 0.29]] }, layers: [{ k: 1, theta: 1.3, lift: 0, color: c.pal.hard, kind: 'hard' }, { k: 0.8, theta: 1.0, lift: 0.28, color: c.pal.hard, kind: 'hard' }, { k: 0.5, theta: 0.8, lift: 0.5, color: c.pal.cloth, kind: 'hard' }] });
      }
      backTails(c, { w: 0.09, len: 0.34, color: c.pal.cloth, stripe: c.pal.trim, tip: 'flat', gain: 0.045 });
    },
    bracer: (c) => {
      for (const s of [1, -1] as const) bracer(c, s, { len: 0.12, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, plate: c.pal.cloth, gem: c.pal.gem });
    },
    belt: (c) => {
      belt(c, { h: 0.075, color: c.pal.cloth, rim: c.pal.trim, buckle: c.pal.trim, gem: c.pal.gem, wide: true });
    },
    boots: (c) => {
      for (const s of [1, -1] as const) cuff(c, s, { len: 0.14, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, flare: 0.012, plate: c.pal.cloth });
    },
  },
  // Đan Tâm Y Bát: xanh ngọc, vàng nhạt, ngọc bội, hồ lô thuốc; mềm mại.
  set_dan_tam: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        const r = shR(c, s, 1.25);
        pauldron(c, s, { r, facets: 12, rim: c.pal.trim, rimKind: 'hard', layers: [{ k: 1, theta: 1.35, lift: 0, color: c.pal.cloth, kind: 'cloth' }, { k: 0.68, theta: 1.1, lift: 0.18, color: c.pal.cloth2, kind: 'cloth' }] });
      }
      backTails(c, { w: 0.075, len: 0.34, color: c.pal.cloth, stripe: c.pal.trim, tip: 'point', gain: 0.07 });
    },
    jade: (c) => pendant(c, { cord: c.pal.trim, jade: c.pal.gem, rim: c.pal.trim }),
    belt: (c) => {
      belt(c, { h: 0.05, color: c.pal.cloth2, rim: c.pal.trim, buckle: c.pal.trim, gem: c.pal.gem });
      hipCharm(c, { cord: c.pal.trim, item: 'gourd', color: c.pal.hard, accent: c.pal.trim, gain: 0.05 });
    },
  },
  // Liệt Mạch Kiếm Y (bậc 2, kiếm tu): cát vàng + ngà, một vai giáp đồng lệch phải, hộ uyển đồng, ủng cao chỉ ngọc lam, ngọc nhỏ ở đai.
  set_liet_mach: {
    robe: (c) => {
      const r = shR(c, -1, 1.3);
      pauldron(c, -1, { r, facets: 8, rim: c.pal.trim, rimKind: 'hard', stud: c.pal.gem, layers: [{ k: 1, theta: 1.25, lift: 0, color: c.pal.hard, kind: 'hard' }, { k: 0.7, theta: 1.0, lift: 0.26, color: c.pal.hard, kind: 'hard' }] });
      pauldron(c, 1, { r: shR(c, 1, 1.05), facets: 12, rim: c.pal.hard, rimKind: 'hard', layers: [{ k: 1, theta: 1.2, lift: 0, color: c.pal.cloth2, kind: 'cloth' }] });
      backTails(c, { w: 0.07, len: 0.38, color: c.pal.cloth2, stripe: c.pal.trim, tip: 'v', gain: 0.07 });
    },
    bracer: (c) => {
      for (const s of [1, -1] as const) bracer(c, s, { len: 0.1, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, plate: c.pal.cloth2, gem: c.pal.gem });
    },
    belt: (c) => {
      belt(c, { h: 0.058, color: c.pal.trim, rim: c.pal.hard, buckle: c.pal.hard, gem: c.pal.gem });
      hipCharm(c, { cord: c.pal.trim, item: 'jade', color: c.pal.gem, accent: c.pal.cloth2, gain: 0.05 });
    },
    boots: (c) => {
      for (const s of [1, -1] as const) cuff(c, s, { len: 0.1, kind: 'cloth', color: c.pal.cloth, rim: c.pal.gem, flare: 0.006, plate: c.pal.trim });
    },
  },
  // Địa Long Hộ Giáp (bậc 2, hộ pháp): nâu đất, vảy đá, viền đồng vàng, nặng và rộng.
  set_dia_giap: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        const r = shR(c, s, 1.34);
        pauldron(c, s, { r, facets: 5, rim: c.pal.trim, rimKind: 'hard', stud: c.pal.gem, scales: { color: '#5d4430', tiers: [[0.45, 5, 0.27], [0.82, 8, 0.29], [1.12, 11, 0.3]] }, layers: [{ k: 1, theta: 1.3, lift: 0, color: c.pal.hard, kind: 'hard' }, { k: 0.78, theta: 1.0, lift: 0.3, color: c.pal.cloth2, kind: 'hard' }] });
      }
      backTails(c, { w: 0.09, len: 0.32, color: c.pal.cloth, stripe: c.pal.trim, tip: 'flat', gain: 0.04 });
    },
    bracer: (c) => {
      for (const s of [1, -1] as const) bracer(c, s, { len: 0.13, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, plate: c.pal.cloth, gem: c.pal.gem });
    },
    belt: (c) => {
      belt(c, { h: 0.08, color: c.pal.cloth, rim: c.pal.trim, buckle: c.pal.trim, gem: c.pal.gem, wide: true });
    },
    boots: (c) => {
      for (const s of [1, -1] as const) cuff(c, s, { len: 0.15, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, flare: 0.014, plate: c.pal.cloth });
    },
  },
  // Phục Mạch Đan Bào (bậc 2, đan sư): xanh rêu, ngà nhạt, ngọc bội, túi thuốc, vòng ngọc ở tay; mềm.
  set_phuc_mach: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        const r = shR(c, s, 1.2);
        pauldron(c, s, { r, facets: 12, rim: c.pal.trim, rimKind: 'hard', layers: [{ k: 1, theta: 1.35, lift: 0, color: c.pal.cloth, kind: 'cloth' }, { k: 0.66, theta: 1.1, lift: 0.18, color: c.pal.cloth2, kind: 'cloth' }] });
      }
      backTails(c, { w: 0.08, len: 0.4, color: c.pal.cloth, stripe: c.pal.trim, tip: 'point', gain: 0.075 });
    },
    jade: (c) => pendant(c, { cord: c.pal.trim, jade: c.pal.gem, rim: c.pal.hard }),
    belt: (c) => {
      belt(c, { h: 0.05, color: c.pal.cloth2, rim: c.pal.trim, buckle: c.pal.hard, gem: c.pal.gem });
      hipCharm(c, { cord: c.pal.trim, item: 'gourd', color: c.pal.cloth2, accent: c.pal.gem, gain: 0.05 });
    },
    ring: (c) => handBand(c, { color: c.pal.hard, gem: c.pal.gem }),
  },
  // Kính Quang Kiếm Y (bậc 3, kiếm tu): bạc trắng như mặt gương, vai tròn bóng, mảnh gương nhỏ ở đai, ủng bạc.
  set_kinh_quang: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        pauldron(c, s, { r: shR(c, s, s < 0 ? 1.28 : 1.1), facets: 10, rim: c.pal.trim, rimKind: 'hard', stud: c.pal.gem, layers: [{ k: 1, theta: 1.3, lift: 0, color: c.pal.hard, kind: 'hard' }, { k: 0.66, theta: 1.05, lift: 0.22, color: c.pal.cloth2, kind: 'hard' }] });
      }
      backTails(c, { w: 0.065, len: 0.44, color: c.pal.cloth2, stripe: c.pal.trim, tip: 'v', gain: 0.08 });
    },
    bracer: (c) => {
      for (const s of [1, -1] as const) bracer(c, s, { len: 0.11, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, plate: c.pal.cloth2, gem: c.pal.gem });
    },
    belt: (c) => {
      belt(c, { h: 0.056, color: c.pal.hard, rim: c.pal.trim, buckle: c.pal.cloth2, gem: c.pal.gem });
      hipCharm(c, { cord: c.pal.trim, item: 'jade', color: c.pal.cloth2, accent: c.pal.gem, gain: 0.05 });
    },
    boots: (c) => {
      for (const s of [1, -1] as const) cuff(c, s, { len: 0.12, kind: 'hard', color: c.pal.hard, rim: c.pal.gem, flare: 0.008, plate: c.pal.cloth2 });
    },
  },
  // Vân Kình Thiết Giáp (bậc 3, hộ pháp): xám thép lam, vai ba lớp đội mây, đai thiết bản rộng, ủng thiết.
  set_van_kinh: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        pauldron(c, s, { r: shR(c, s, 1.38), facets: 6, rim: c.pal.trim, rimKind: 'hard', stud: c.pal.gem, scales: { color: '#56667a', tiers: [[0.45, 6, 0.27], [0.82, 9, 0.29], [1.12, 12, 0.3]] }, layers: [{ k: 1, theta: 1.3, lift: 0, color: c.pal.hard, kind: 'hard' }, { k: 0.8, theta: 1.0, lift: 0.3, color: c.pal.cloth2, kind: 'hard' }, { k: 0.5, theta: 0.8, lift: 0.52, color: c.pal.trim, kind: 'hard' }] });
      }
      backTails(c, { w: 0.095, len: 0.34, color: c.pal.cloth, stripe: c.pal.trim, tip: 'flat', gain: 0.04 });
    },
    bracer: (c) => {
      for (const s of [1, -1] as const) bracer(c, s, { len: 0.14, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, plate: c.pal.cloth, gem: c.pal.gem });
    },
    belt: (c) => {
      belt(c, { h: 0.085, color: c.pal.cloth, rim: c.pal.trim, buckle: c.pal.hard, gem: c.pal.gem, wide: true });
    },
    boots: (c) => {
      for (const s of [1, -1] as const) cuff(c, s, { len: 0.16, kind: 'hard', color: c.pal.hard, rim: c.pal.trim, flare: 0.016, plate: c.pal.cloth });
    },
  },
  // Lưu Ly Đan Y (bậc 3, đan sư): xanh ngọc, ngà, ngọc bội giọt nước, bình thuốc lưu ly ở đai, vòng ngọc ở tay; mềm.
  set_luu_ly: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        pauldron(c, s, { r: shR(c, s, 1.22), facets: 12, rim: c.pal.trim, rimKind: 'hard', layers: [{ k: 1, theta: 1.38, lift: 0, color: c.pal.cloth, kind: 'cloth' }, { k: 0.68, theta: 1.12, lift: 0.2, color: c.pal.cloth2, kind: 'cloth' }] });
      }
      backTails(c, { w: 0.085, len: 0.44, color: c.pal.cloth, stripe: c.pal.trim, tip: 'point', gain: 0.08 });
    },
    jade: (c) => pendant(c, { cord: c.pal.trim, jade: c.pal.gem, rim: c.pal.hard }),
    belt: (c) => {
      belt(c, { h: 0.05, color: c.pal.cloth2, rim: c.pal.trim, buckle: c.pal.hard, gem: c.pal.gem });
      hipCharm(c, { cord: c.pal.trim, item: 'gourd', color: c.pal.gem, accent: c.pal.cloth2, gain: 0.05 });
    },
    ring: (c) => handBand(c, { color: c.pal.hard, gem: c.pal.gem }),
  },
  // Hàn Giao Lân: lam băng, vảy, gai.
  set_han_giao: {
    robe: (c) => {
      for (const s of [1, -1] as const) {
        const r = shR(c, s, 1.28);
        pauldron(c, s, { r, facets: 7, rim: c.pal.trim, rimKind: 'hard', spikes: c.pal.gem, scales: { color: c.pal.hard, tiers: [[0.5, 6, 0.24], [0.9, 10, 0.27]] }, layers: [{ k: 1, theta: 1.25, lift: 0, color: c.pal.cloth, kind: 'hard' }, { k: 0.8, theta: 1.05, lift: 0.22, color: c.pal.hard, kind: 'hard' }, { k: 0.58, theta: 0.9, lift: 0.4, color: c.pal.cloth2, kind: 'hard' }] });
      }
      dorsal(c, { color: c.pal.gem });
    },
    ring: (c) => handBand(c, { color: c.pal.hard, gem: c.pal.gem }),
  },
};

/** Ô nào của bộ nào có phụ kiện (cho test và tài liệu). */
export function accessorySlots(setId: string): EquipSlot[] {
  return Object.keys(BUILDERS[setId] ?? {}) as EquipSlot[];
}

/** Dựng hình học phụ kiện (hệ idle, chưa gắn xương). `bySlot`: id bộ theo ô (`parseAccessoryCode`). */
export function buildAccessories(fit: BodyFit, bySlot: Partial<Record<EquipSlot, string>>): BuiltAccessories {
  const out: BuiltAccessories = { parts: [], ribbons: [] };
  for (const [slot, setId] of Object.entries(bySlot) as [EquipSlot, string][]) {
    const b = BUILDERS[setId]?.[slot];
    if (!b) continue;
    b({ fit, pal: paletteOf(setId), parts: out.parts, ribbons: out.ribbons, h: fit.h });
  }
  return out;
}

// ---------- gắn vào thân ----------

/** Vật liệu dùng chung (vải, cứng) cho mọi người chơi. */
export interface AccessoryMaterials {
  cloth: THREE.Material;
  hard: THREE.Material;
}

/** Phụ kiện đang gắn vào một bản sao nhân vật. */
export interface AttachedAccessories {
  /** Cập nhật lắc dải lụa; gọi sau khi mixer đã cập nhật xương. `speed`: m/s. */
  update(dt: number, speed: number, boneWorld: (b: FitBone) => THREE.Matrix4 | null): void;
  /** LOD xa: ẩn dải lụa (mesh cứng ẩn theo LOD0 của thân). */
  setNear(near: boolean): void;
  /** Dải lụa cần thêm vào `inner` của nhân vật. */
  readonly objects: THREE.Object3D[];
  dispose(): void;
}

/** Gộp phần cứng theo vật liệu: về hệ cục bộ của mesh thân, gắn cứng vào xương (chỉ số theo `boneIndex`). */
function mergeByKind(fit: BodyFit, built: BuiltAccessories, boneIndex: Map<string, number>): Partial<Record<Kind, THREE.BufferGeometry>> {
  const toMesh = fit.meshToScene.clone().invert();

  const byKind: Record<Kind, THREE.BufferGeometry[]> = { cloth: [], hard: [] };
  for (const p of built.parts) {
    const bi = boneIndex.get(p.bone);
    if (bi === undefined) continue;
    const g = p.geo.clone();
    // Hệ idle → hệ nghỉ của xương (đỉnh skin gắn cứng), rồi sang hệ cục bộ của mesh thân.
    const bf = fit.bones[p.bone];
    g.applyMatrix4(toMesh.clone().multiply(bf.rest.clone().multiply(bf.posed.clone().invert())));
    const n = g.getAttribute('position').count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi;
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    byKind[p.kind].push(g);
  }
  const out: Partial<Record<Kind, THREE.BufferGeometry>> = {};
  for (const kind of ['cloth', 'hard'] as Kind[]) {
    if (!byKind[kind].length) continue;
    const geo = mergeGeometries(byKind[kind], false);
    for (const g of byKind[kind]) g.dispose();
    if (geo) out[kind] = geo;
  }
  return out;
}

/** Gộp phần cứng theo vật liệu thành `SkinnedMesh` gắn vào cùng cha với mesh LOD0 của `scene` (bản sao đã clone). */
export function attachAccessories(scene: THREE.Object3D, fit: BodyFit, built: BuiltAccessories, mats: AccessoryMaterials): { meshes: THREE.SkinnedMesh[]; ribbons: AttachedRibbons | null } {
  let base: THREE.SkinnedMesh | null = null;
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && !base && !(o.userData.lod > 0)) base = m;
  });
  const lod0 = base as THREE.SkinnedMesh | null;
  if (!lod0) return { meshes: [], ribbons: null };
  const boneIndex = new Map<string, number>();
  lod0.skeleton.bones.forEach((b, i) => boneIndex.set(boneKey(b.name), i));
  const merged = (built.merged ??= mergeByKind(fit, built, boneIndex));
  const meshes: THREE.SkinnedMesh[] = [];
  for (const kind of ['cloth', 'hard'] as Kind[]) {
    const geo = merged[kind];
    if (!geo) continue;
    const mesh = new THREE.SkinnedMesh(geo, kind === 'cloth' ? mats.cloth : mats.hard);
    mesh.name = `acc_${kind}`;
    mesh.position.copy(lod0.position);
    mesh.quaternion.copy(lod0.quaternion);
    mesh.scale.copy(lod0.scale);
    lod0.parent!.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(lod0.skeleton, lod0.bindMatrix.clone());
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.userData.noShadow = true;
    meshes.push(mesh);
  }
  return { meshes, ribbons: built.ribbons.length ? new AttachedRibbons(fit, built.ribbons, mats.cloth) : null };
}

/** Dải lụa lắc: mỗi dải một lò xo góc quanh trục X (ra sau khi chạy), gắn xương theo chuyển động từ tư thế idle. */
export class AttachedRibbons {
  readonly objects: THREE.Mesh[] = [];
  private ang: number[] = [];
  private vel: number[] = [];
  private t = 0;
  private restInv: THREE.Matrix4[] = [];
  private _m = new THREE.Matrix4();
  private _r = new THREE.Matrix4();
  private _pv = new THREE.Matrix4();

  constructor(
    fit: BodyFit,
    private list: Ribbon[],
    material: THREE.Material,
  ) {
    for (const r of list) {
      const mesh = new THREE.Mesh(r.geo, material);
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      this.objects.push(mesh);
      this.ang.push(0);
      this.vel.push(0);
      this.restInv.push(fit.bones[r.bone].posed.clone().invert());
    }
  }

  setNear(near: boolean): void {
    for (const o of this.objects) o.visible = near;
  }

  update(dt: number, speed: number, boneWorld: (b: FitBone) => THREE.Matrix4 | null): void {
    this.t += dt;
    const step = Math.min(dt, 1 / 30);
    for (let i = 0; i < this.list.length; i++) {
      const r = this.list[i];
      const bw = boneWorld(r.bone);
      if (!bw) continue;
      // Lò xo: góc đích theo vận tốc (gió thổi ngược hướng chạy) + dao động nhẹ lúc đứng.
      const target = Math.min(0.36, speed * r.gain * 1.5) + 0.03 * Math.sin(this.t * 1.7 + i);
      const acc = 90 * (target - this.ang[i]) - 7 * this.vel[i];
      this.vel[i] += acc * step;
      this.ang[i] = Math.max(0, Math.min(0.7, this.ang[i] + this.vel[i] * step));
      const p = r.pivot;
      // M = xươngHiệnTại · xươngIdle⁻¹ · T(pivot) · Rx(góc) · T(−pivot)
      this._pv.makeTranslation(p.x, p.y, p.z).multiply(this._r.makeRotationX(this.ang[i])).multiply(this._m.makeTranslation(-p.x, -p.y, -p.z));
      this.objects[i].matrix.copy(bw).multiply(this.restInv[i]).multiply(this._pv);
      this.objects[i].matrixWorldNeedsUpdate = true;
    }
  }

  dispose(): void {
    for (const r of this.list) r.geo.dispose();
  }
}

/** Tạo bộ vật liệu dùng chung; `make` là nhà máy material (để test không cần GPU). */
export function createAccessoryMaterials(make: (p: { roughness: number; metalness: number }) => THREE.Material): AccessoryMaterials {
  return { cloth: make({ roughness: 0.82, metalness: 0 }), hard: make({ roughness: 0.38, metalness: 0.6 }) };
}
