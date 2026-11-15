import * as THREE from 'three/webgpu';
import {
  abs,
  atan,
  color,
  exp,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  normalView,
  positionLocal,
  pow,
  smoothstep,
  step,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { groundAt } from '@dtl/shared';
import { markBloom } from '../post';
import { FX_MAX_HDR } from '../materials/vfx';
import { hash21, seededRandom, vnoise, type N } from './common';
import type { Particles } from './particles';

/**
 * Mưa kiếm (M4-2, Thiên Kiếm Vũ): kiếm thật từ trời cắm xuống, vệt sao chổi, vết nứt trên đất, vòng
 * chấn động, rồi kiếm và vết nứt tan theo nhiễu.
 *
 * Bốn lưới instanced dùng chung cho MỌI trận mưa kiếm đang chạy (4 draw call bất kể số kiếm), material
 * tạo một lần lúc nạp module (và một lần nữa khi GLB phi kiếm nạp xong), không cấp phát material khi phát:
 * - kiếm: lưới `prop_phi_kiem` (qua AssetCache, `useModel`); trước khi nạp xong dùng lưới kiếm đơn
 *   giản dựng bằng code. PBR + viền linh quang + tan theo nhiễu có mép cháy sáng (alphaTest);
 * - vệt sao chổi: hai tấm chéo dựng đứng, cộng sáng, sáng ở đầu tắt dần về đuôi;
 * - vết nứt: tấm ngang, tia nứt vẽ trong fragment, nóng sáng lúc đầu rồi nguội thành mực, tan theo nhiễu;
 * - vòng chấn động: tấm ngang, vòng lan ra có nhiễu, cộng sáng.
 *
 * Vị trí, độ trễ, độ nghiêng của từng thanh kiếm lấy từ seed của server (`FxMsg.sd`), nên mọi client
 * thấy cùng một trận mưa. Chỉ là lớp hình: sát thương đã do server tính lúc phát FX.
 */

/** Số kiếm mỗi lần (như bản cũ). */
export const RAIN_SWORDS = 12;
/** Chiều dài kiếm rơi (m). */
const SWORD_LEN = 3.0;
const FALL_H = 16;
const FALL_T = 0.3;
const MAX_DELAY = 0.35;
const STUCK_T = 0.5;
const DISSOLVE_T = 0.45;
const CRACK_T = 1.6;
const SHOCK_T = 0.5;
const AREA_T = 0.9;

const uRain = uniform(new THREE.Color(0x9fe0ff));

/**
 * Bọc lưới vào `InstancedBufferGeometry` (dùng chung thuộc tính, không chép dữ liệu) để điều khiển số
 * instance được vẽ bằng `instanceCount`.
 *
 * Lý do: `InstanceNode` của three r178 cấp UBO ma trận theo `InstancedMesh.count` LÚC DỰNG NODE (mỗi
 * pass/renderer dựng riêng). Nếu hạ `count` theo số ô đang dùng thì node dựng khi chỉ có 1 ô sẽ có UBO
 * 1 ma trận và mọi instance sau đó đọc chung ma trận ấy (mọi thanh kiếm chồng một chỗ). Nên `count`
 * giữ cố định bằng sức chứa, còn số vẽ thật đi qua `geometry.instanceCount` (renderer ưu tiên nó).
 */
export function instancedGeometry(src: THREE.BufferGeometry): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setIndex(src.index);
  for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.getAttribute(k));
  g.instanceCount = 0;
  return g;
}

/** Lưới instanced có cấp phát ô; ô trống có ma trận 0 (không vẽ gì). */
class InstSet {
  readonly mesh: THREE.InstancedMesh;
  readonly attr: THREE.InstancedBufferAttribute;
  private used: boolean[];
  private dirty = false;
  /** Số khung còn phải vẽ ấm (1 instance ma trận 0) để biên dịch shader trước lần dùng đầu. */
  warm = 0;
  private static readonly ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly cap: number, attr: THREE.InstancedBufferAttribute) {
    // `count` giữ bằng sức chứa (xem `instancedGeometry`); số vẽ thật là `geometry.instanceCount`.
    this.mesh = new THREE.InstancedMesh(instancedGeometry(geo), mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.attr = attr;
    this.used = new Array(cap).fill(false);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, InstSet.ZERO);
  }

  acquire(): number {
    const i = this.used.indexOf(false);
    if (i < 0) return -1;
    this.used[i] = true;
    this.dirty = true;
    return i;
  }

  release(i: number): void {
    if (i < 0) return;
    this.used[i] = false;
    this.mesh.setMatrixAt(i, InstSet.ZERO);
    this.dirty = true;
  }

  set(i: number, m: THREE.Matrix4, x: number, y: number, z: number, w: number): void {
    if (i < 0) return;
    this.mesh.setMatrixAt(i, m);
    this.attr.setXYZW(i, x, y, z, w);
    this.dirty = true;
  }

  sync(): void {
    if (!this.dirty && this.warm <= 0) return;
    this.dirty = this.warm > 0;
    const hi = this.used.lastIndexOf(true) + 1;
    // Vẽ ấm: một instance ma trận 0 (không thấy gì) để renderer dựng pipeline lúc đang tải.
    const n = this.warm > 0 ? Math.max(hi, 1) : hi;
    if (this.warm > 0) this.warm--;
    (this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, hi) * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attr.clearUpdateRanges();
    this.attr.addUpdateRange(0, Math.max(1, hi) * 4);
    this.attr.needsUpdate = true;
  }

  get active(): number {
    let n = 0;
    for (const u of this.used) if (u) n++;
    return n;
  }
}

const instAttr = (cap: number) => {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  return a;
};

// ---------- kiếm ----------

/** Lưới kiếm dự phòng (chuôi ở y = 0, mũi ở y = 1) khi GLB chưa nạp xong. */
function fallbackSwordGeometry(): THREE.BufferGeometry {
  const blade = new THREE.CylinderGeometry(0.012, 0.035, 0.74, 4, 1);
  blade.rotateY(Math.PI / 4);
  blade.scale(1, 1, 0.3);
  blade.translate(0, 0.6, 0);
  const tip = new THREE.ConeGeometry(0.012, 0.06, 4);
  tip.rotateY(Math.PI / 4);
  tip.scale(1, 1, 0.3);
  tip.translate(0, 1.0, 0);
  const guard = new THREE.BoxGeometry(0.12, 0.025, 0.035);
  guard.translate(0, 0.22, 0);
  const grip = new THREE.CylinderGeometry(0.014, 0.014, 0.18, 6);
  grip.translate(0, 0.12, 0);
  const pommel = new THREE.SphereGeometry(0.022, 6, 4);
  pommel.translate(0, 0.025, 0);
  const parts = [blade, tip, guard, grip, pommel].map((g) => g.toNonIndexed());
  const n = parts.reduce((s, g) => s + g.getAttribute('position').count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

const SWORD_CAP = 48;
/** x = ngưỡng tan 0..1,05, y = độ linh quang, z = seed. */
const SWORD_ATTR = instAttr(SWORD_CAP);

/** Material kiếm (PBR + linh quang + tan theo nhiễu). `src`: material gốc của GLB để lấy texture. */
function swordMaterial(src?: THREE.MeshStandardMaterial): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.38, metalness: 0.65 });
  if (src) {
    m.map = src.map;
    m.normalMap = src.normalMap;
    m.roughnessMap = src.roughnessMap;
    m.metalnessMap = src.metalnessMap;
    m.roughness = src.roughness;
    m.metalness = src.metalness;
    m.color.copy(src.color);
  } else {
    m.color.setHex(0xc9d6de);
  }
  const f = instancedBufferAttribute(SWORD_ATTR) as N;
  const dis = f.x;
  // Nhiễu tan theo thân kiếm (tọa độ lưới: dọc thân y 0..1).
  const n = vnoise(vec2(positionLocal.x.add(positionLocal.z).mul(16).add(f.z), positionLocal.y.mul(9).add(f.z.mul(0.37))));
  m.opacityNode = step(dis, n);
  m.alphaTest = 0.5;
  const burn = float(1).sub(smoothstep(dis, dis.add(0.08), n)).mul(step(0.01, dis));
  const rim = pow(float(1).sub(abs(normalView.z)), 2);
  const spirit = vec3(uRain);
  m.emissiveNode = min(spirit.mul(f.y.mul(rim.mul(1.8).add(0.55)).add(burn.mul(2.2))), FX_MAX_HDR);
  m.name = 'fx-rain-sword';
  markBloom(m, 0.6);
  return m;
}

// ---------- vệt sao chổi ----------

/** Hai tấm chéo dựng đứng, y 0 (đầu, ở mũi kiếm) → 1 (đuôi); uv.y theo chiều dài, uv.x ngang. */
function cometGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const pos = new Float32Array([...(a.getAttribute('position').array as Float32Array), ...(b.getAttribute('position').array as Float32Array)]);
  const uvs = new Float32Array([...(a.getAttribute('uv').array as Float32Array), ...(b.getAttribute('uv').array as Float32Array)]);
  const nor = new Float32Array([...(a.getAttribute('normal').array as Float32Array), ...(b.getAttribute('normal').array as Float32Array)]);
  const ia = Array.from(a.index!.array);
  const idx = [...ia, ...ia.map((i) => i + 4)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  a.dispose();
  b.dispose();
  return g;
}

const COMET_CAP = 48;
/** x = độ trong, y = seed. */
const COMET_ATTR = instAttr(COMET_CAP);

function cometMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  m.forceSinglePass = true;
  const f = instancedBufferAttribute(COMET_ATTR) as N;
  const st = uv();
  const along = st.y; // 0 ở đầu (mũi kiếm, đáy tấm), 1 ở đuôi
  const x = abs(st.x.sub(0.5)).mul(2);
  const core = exp(x.mul(x).mul(-14));
  const tail = pow(float(1).sub(along), 1.8);
  const head = exp(along.mul(along).mul(-220));
  const streak = vnoise(vec2(st.x.mul(5).add(f.y), along.mul(6).add(time.mul(9)))).mul(0.5).add(0.6);
  const lum = core.mul(tail).mul(streak).add(head.mul(core).mul(1.5));
  m.colorNode = min(mix(vec3(uRain), vec3(1, 1, 1), head.mul(0.6)).mul(lum.mul(1.6)), FX_MAX_HDR);
  m.opacityNode = f.x.mul(min(lum, 1));
  m.name = 'fx-rain-comet';
  markBloom(m, 0.5);
  return m;
}

// ---------- vết nứt + vòng chấn động (tấm ngang) ----------

function flatGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2, 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

const CRACK_CAP = 48;
/** x = tiến độ 0..1, y = seed, z = độ trong. */
const CRACK_ATTR = instAttr(CRACK_CAP);
/** Màu mực của vết nứt nguội: đá tối ngả lam (art bible `stone_dark`, tối hơn). */
const CRACK_INK = new THREE.Color(0x24262a);

function crackMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: true });
  m.forceSinglePass = true;
  const f = instancedBufferAttribute(CRACK_ATTR) as N;
  const k = f.x;
  const seed = f.y;
  const p = uv().sub(0.5).mul(2);
  const r = length(p);
  const rays = 7;
  const wob = vnoise(vec2(r.mul(3.5), seed)).sub(0.5).mul(0.7);
  const ang = atan(p.y, p.x).div(Math.PI * 2).mul(rays).add(seed).add(wob);
  const cell = floor(ang);
  const rayLen = hash21(vec2(cell, seed)).mul(0.5).add(0.45);
  const dist = abs(fract(ang).sub(0.5)).mul(r).mul((Math.PI * 2) / rays);
  const w = float(0.05).mul(max(float(1).sub(r.div(rayLen)), 0)).add(0.006);
  const line = float(1).sub(smoothstep(w.mul(0.45), w, dist)).mul(step(r, rayLen));
  const crater = float(1).sub(smoothstep(0.08, 0.2, r));
  const mask = max(line, crater.mul(0.85));
  // Tan theo nhiễu ở nửa sau.
  const dk = smoothstep(0.45, 1, k).mul(1.1);
  const alive = smoothstep(dk.sub(0.06), dk, vnoise(p.mul(5).add(seed)));
  const heat = float(1).sub(smoothstep(0, 0.4, k)).mul(float(1).sub(r.mul(0.8)));
  m.colorNode = min(mix(color(CRACK_INK), vec3(uRain).mul(2.2), heat), FX_MAX_HDR);
  m.opacityNode = f.z.mul(mask).mul(alive).mul(smoothstep(0, 0.04, k));
  m.name = 'fx-rain-crack';
  markBloom(m, 0.2);
  return m;
}

const SHOCK_CAP = 64;
/** x = tiến độ 0..1, y = độ trong, z = độ dày vòng, w = seed. */
const SHOCK_ATTR = instAttr(SHOCK_CAP);

function shockMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  m.forceSinglePass = true;
  const f = instancedBufferAttribute(SHOCK_ATTR) as N;
  const k = f.x;
  const p = uv().sub(0.5).mul(2);
  const r = length(p);
  const R = float(1).sub(pow(float(1).sub(k), 2.2));
  const d = r.sub(R).div(f.z);
  const ring = exp(d.mul(d).negate());
  // Vòng vỡ theo nhiễu góc cho khỏi giống vòng compa.
  const brk = vnoise(vec2(atan(p.y, p.x).mul(4).add(f.w), k.mul(3))).mul(0.6).add(0.55);
  m.colorNode = min(vec3(uRain).mul(1.7), FX_MAX_HDR);
  m.opacityNode = f.y.mul(ring).mul(brk).mul(pow(float(1).sub(k), 1.4)).mul(step(r, 1));
  m.name = 'fx-rain-shock';
  markBloom(m, 0.45);
  return m;
}

// ---------- điều phối ----------

interface Drop {
  x: number;
  z: number;
  gy: number;
  delay: number;
  yaw: number;
  tilt: number;
  seed: number;
  /** Đã xin ô kiếm/sao chổi (dù có được hay không). */
  acquired: boolean;
  sword: number;
  comet: number;
  impacted: boolean;
  /** Thời điểm cắm xuống (giây, theo đồng hồ trận). */
  hitAt: number;
  crack: number;
  shock: number;
}

interface Rain {
  t: number;
  cx: number;
  cy: number;
  cz: number;
  r: number;
  area: number;
  drops: Drop[];
  /** Hạt của người khác giảm một nửa. */
  pScale: number;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** Vị trí từng thanh kiếm theo seed (dùng chung cho client và kiểm thử: cùng seed thì cùng chỗ). */
export function rainLayout(seed: number, cx: number, cz: number, r: number, n = RAIN_SWORDS): { x: number; z: number; delay: number; yaw: number; tilt: number; seed: number }[] {
  const rnd = seededRandom(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * r * 0.9;
    out.push({
      x: cx + Math.cos(a) * rr,
      z: cz + Math.sin(a) * rr,
      delay: rnd() * MAX_DELAY,
      yaw: rnd() * Math.PI * 2,
      tilt: (rnd() - 0.5) * 0.3,
      seed: rnd() * 50,
    });
  }
  return out;
}

export class SwordRainFx {
  readonly group = new THREE.Group();
  private swords: InstSet;
  private comets: InstSet;
  private cracks: InstSet;
  private shocks: InstSet;
  private rains: Rain[] = [];
  private modelSet = false;

  constructor(private particles: Particles) {
    this.swords = new InstSet(fallbackSwordGeometry(), swordMaterial(), SWORD_CAP, SWORD_ATTR);
    this.comets = new InstSet(cometGeometry(), cometMaterial(), COMET_CAP, COMET_ATTR);
    const flat = flatGeometry();
    this.cracks = new InstSet(flat, crackMaterial(), CRACK_CAP, CRACK_ATTR);
    this.shocks = new InstSet(flat, shockMaterial(), SHOCK_CAP, SHOCK_ATTR);
    this.cracks.mesh.renderOrder = -1;
    this.group.add(this.cracks.mesh, this.swords.mesh, this.comets.mesh, this.shocks.mesh);
  }

  /**
   * Dùng lưới GLB `prop_phi_kiem` (chuôi ở y = 0, mũi ở y ≈ 1). Gọi một lần khi AssetCache nạp xong;
   * material mới tạo một lần ở đây, không phải lúc phát hiệu ứng.
   */
  useModel(root: THREE.Object3D): boolean {
    if (this.modelSet) return true;
    let best: THREE.Mesh | null = null;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (!best || m.geometry.getAttribute('position').count > best.geometry.getAttribute('position').count)) best = m;
    });
    const mesh = best as THREE.Mesh | null;
    if (!mesh) return false;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const old = this.swords.mesh;
    const ig = instancedGeometry(geo);
    ig.instanceCount = (old.geometry as THREE.InstancedBufferGeometry).instanceCount;
    old.geometry.dispose();
    (old.material as THREE.Material).dispose();
    old.geometry = ig;
    old.material = swordMaterial(src);
    this.swords.warm = 3;
    this.modelSet = true;
    return true;
  }

  /**
   * Vẽ ấm mọi lưới mưa kiếm vài khung (không thấy gì) để biên dịch shader trước lần dùng đầu; tránh khựng
   * khi Thiên Kiếm Vũ phát lần đầu (WebGL2 đo được khoảng 0,2 giây).
   */
  prewarm(frames = 3): void {
    for (const s of [this.swords, this.comets, this.cracks, this.shocks]) s.warm = frames;
  }

  /** Phát một trận mưa kiếm tại (cx, cz), bán kính r. `mine` = của mình (đủ hạt). */
  play(cx: number, cy: number, cz: number, r: number, color: number, seed: number, mine = true): void {
    uRain.value.setHex(color);
    const area = this.shocks.acquire();
    const drops: Drop[] = rainLayout(seed, cx, cz, r).map((d) => ({
      ...d,
      gy: groundAt(d.x, d.z),
      sword: -1,
      comet: -1,
      acquired: false,
      impacted: false,
      hitAt: 0,
      crack: -1,
      shock: -1,
    }));
    this.rains.push({ t: 0, cx, cy, cz, r, area, drops, pScale: mine ? 1 : 0.5 });
  }

  update(dt: number): void {
    for (let i = this.rains.length - 1; i >= 0; i--) {
      const R = this.rains[i];
      R.t += dt;
      if (this.step(R)) {
        this.shocks.release(R.area);
        this.rains.splice(i, 1);
      }
    }
    this.swords.sync();
    this.comets.sync();
    this.cracks.sync();
    this.shocks.sync();
  }

  /** Cập nhật một trận; trả true khi xong hết. */
  private step(R: Rain): boolean {
    let done = true;
    // Vòng lớn quanh vùng chiêu (như bản cũ: 0,9 giây).
    if (R.area >= 0) {
      const k = Math.min(1, R.t / AREA_T);
      if (k < 1) {
        done = false;
        _m.compose(_p.set(R.cx, R.cy + 0.25, R.cz), _q.identity(), _s.set(R.r * 1.05, 1, R.r * 1.05));
        this.shocks.set(R.area, _m, 0.25 + k * 0.75, 0.55, 0.05, 3.1);
      } else {
        this.shocks.release(R.area);
        R.area = -1;
      }
    }
    for (const d of R.drops) {
      const t = R.t - d.delay;
      if (t < 0) {
        done = false;
        continue;
      }
      // Rơi.
      if (!d.impacted) {
        // Xin ô đúng một lần cho mỗi thanh kiếm. Hết ô (nhiều trận chồng nhau) thì thanh đó không vẽ
        // thành phần ấy, nhưng không bao giờ xin lại: xin lại sẽ ghi đè và làm rơi ô đang giữ.
        if (!d.acquired) {
          d.acquired = true;
          d.sword = this.swords.acquire();
          d.comet = this.comets.acquire();
        }
        const k = Math.min(1, t / FALL_T);
        const tipY = d.gy - 0.55 + FALL_H * (1 - k * k);
        this.placeSword(d, tipY, 0, 1);
        if (d.comet >= 0) {
          _q.setFromEuler(_e.set(d.tilt, d.yaw, 0, 'YXZ'));
          _m.compose(_p.set(d.x, tipY, d.z), _q, _s.set(0.55, 4 + k * 4, 0.55));
          this.comets.set(d.comet, _m, 0.9, d.seed, 0, 0);
        }
        if (k >= 1) this.impact(R, d, t);
        done = false;
        continue;
      }
      const s = R.t - d.hitAt;
      // Vệt sao chổi tắt nhanh sau khi cắm.
      if (d.comet >= 0) {
        const a = 1 - s / 0.12;
        if (a <= 0) {
          this.comets.release(d.comet);
          d.comet = -1;
        } else {
          _q.setFromEuler(_e.set(d.tilt, d.yaw, 0, 'YXZ'));
          _m.compose(_p.set(d.x, d.gy - 0.55, d.z), _q, _s.set(0.55, 8 * a, 0.55));
          this.comets.set(d.comet, _m, 0.9 * a, d.seed, 0, 0);
        }
      }
      // Kiếm cắm đứng, linh quang nguội dần, rồi tan theo nhiễu.
      if (d.sword >= 0) {
        const dis = s < STUCK_T ? 0 : Math.min(1.06, ((s - STUCK_T) / DISSOLVE_T) * 1.06);
        if (dis >= 1.06) {
          this.swords.release(d.sword);
          d.sword = -1;
        } else {
          const glow = Math.max(0.35, 1 - s * 1.6);
          this.placeSword(d, d.gy - 0.55, dis, glow);
          if (dis > 0 && Math.random() < 0.5 * R.pScale) {
            // Tàn linh quang bay lên từ mép tan.
            this.particles.emit('glow', d.x + (Math.random() - 0.5) * 0.2, d.gy + Math.random() * SWORD_LEN * 0.8, d.z + (Math.random() - 0.5) * 0.2, 0, 1.2, 0, 0.6, 0.08, 0.02, 0xcff3ff, 0.9, -0.5, 1.5);
          }
        }
      }
      if (d.crack >= 0) {
        const k = s / CRACK_T;
        if (k >= 1) {
          this.cracks.release(d.crack);
          d.crack = -1;
        } else {
          _m.compose(_p.set(d.x, d.gy + 0.06, d.z), _q.setFromAxisAngle(_s.set(0, 1, 0), d.yaw), _s.set(1.7, 1, 1.7));
          this.cracks.set(d.crack, _m, k, d.seed, 0.95, 0);
        }
      }
      if (d.shock >= 0) {
        const k = s / SHOCK_T;
        if (k >= 1) {
          this.shocks.release(d.shock);
          d.shock = -1;
        } else {
          _m.compose(_p.set(d.x, d.gy + 0.12, d.z), _q.identity(), _s.set(2.2, 1, 2.2));
          this.shocks.set(d.shock, _m, k, 0.6, 0.07, d.seed);
        }
      }
      if (d.sword >= 0 || d.comet >= 0 || d.crack >= 0 || d.shock >= 0) done = false;
    }
    return done;
  }

  private placeSword(d: Drop, tipY: number, dis: number, glow: number): void {
    if (d.sword < 0) return;
    // Mũi chúc xuống: lật lưới (chuôi y = 0, mũi y = 1) rồi đặt chuôi phía trên mũi.
    _q.setFromEuler(_e.set(Math.PI + d.tilt, d.yaw, 0, 'YXZ'));
    _p.set(0, SWORD_LEN, 0).applyQuaternion(_q).negate();
    _p.x += d.x;
    _p.y += tipY;
    _p.z += d.z;
    _m.compose(_p, _q, _s.setScalar(SWORD_LEN));
    this.swords.set(d.sword, _m, dis, glow, d.seed, 0);
  }

  private impact(R: Rain, d: Drop, t: number): void {
    d.impacted = true;
    d.hitAt = R.t - (t - FALL_T);
    d.crack = this.cracks.acquire();
    d.shock = this.shocks.acquire();
    const P = this.particles;
    const n = Math.round(10 * R.pScale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 5;
      P.emit('glow', d.x, d.gy + 0.2, d.z, Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp, 0.35 + Math.random() * 0.25, 0.12, 0.03, 0xcff3ff, 1, 14, 2.5);
    }
    const nd = Math.round(6 * R.pScale);
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2;
      P.emit('dust', d.x, d.gy + 0.25, d.z, Math.cos(a) * sp, 0.6 + Math.random() * 0.8, Math.sin(a) * sp, 0.9 + Math.random() * 0.5, 0.4, 1.3, 0xbdb6a4, 0.28, -0.2, 2.2);
    }
  }

  /** Số instance đang dùng (đo đạc/kiểm thử). */
  stats(): { rains: number; swords: number; comets: number; cracks: number; shocks: number } {
    return { rains: this.rains.length, swords: this.swords.active, comets: this.comets.active, cracks: this.cracks.active, shocks: this.shocks.active };
  }

  /** Bỏ mọi trận đang chạy (đổi room). Lưới và material giữ lại cho lần sau. */
  clear(): void {
    for (const R of this.rains) {
      this.shocks.release(R.area);
      for (const d of R.drops) {
        this.swords.release(d.sword);
        this.comets.release(d.comet);
        this.cracks.release(d.crack);
        this.shocks.release(d.shock);
      }
    }
    this.rains.length = 0;
    this.update(0);
  }
}
