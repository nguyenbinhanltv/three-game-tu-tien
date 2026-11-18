import * as THREE from 'three/webgpu';
import { abs, cos, float, instancedBufferAttribute, mix, positionGeometry, sin, texture, time, uniform, uniformArray, uv, vec3 } from 'three/tsl';
import { beaconParams } from '../../render/atmosphere';
import { heightAt, inLakeWater, levelTerrain } from '../core/levelCtx';

/**
 * Bướm mạch (DV-C): sinh vật trang trí bay quanh người chơi ở các bản đồ ngoài trời. Chỉ là hình ở client, server
 * không biết, không va chạm, không chọn được.
 *
 * - **Một lưới instanced, một draw call** cho cả đàn (tối đa 48 con, 8 tam giác mỗi con). Vị trí, hướng, pha vỗ, cỡ,
 *   màu đi qua hai thuộc tính instance; vỗ cánh tính trong vertex shader (TSL) nên CPU chỉ cập nhật đường bay.
 * - **Thủ tục hoàn toàn**: hình cánh và hoa văn sinh bằng công thức (`wingTexel`) thành một `DataTexture` 64², cắt
 *   alpha (không blend). Không dùng asset ngoài, không cần ghi công.
 * - **Rải xác định theo ô 8 m** quanh người chơi (`spotsNear`): cùng chỗ thì ai cũng thấy đàn ở cùng điểm; ô nào có bướm
 *   phụ thuộc hạt giống, không ngẫu nhiên theo phiên. Không mọc trên nước, dốc đứng, sàn mây, đỉnh tuyết.
 * - Vật liệu không nhận đèn (màu nhân hệ số sáng theo thời điểm, vẫn chịu sương). Ban đêm thưa đi, trừ level `glow`: bướm
 *   phát sáng nhẹ, cộng tối đa 0,6 nên xa trần HDR.
 *
 * `?bf=0` tắt để so ảnh/số đo. Mật độ và bảng màu theo level ở `BUTTERFLY_LEVELS`.
 */

interface ButterflyLevel {
  /** Xác suất một ô 8 m có một đàn (0–1). */
  density: number;
  /** Số con mỗi đàn: từ `min` tới `max`. */
  flock: [number, number];
  /** Màu cánh (sRGB), tối đa 4; mỗi con chọn một màu theo hạt giống. */
  palette: [string, string, string, string];
  /** Bướm phát sáng nhẹ ban đêm và không thưa đi (bản đồ đêm). */
  glow?: boolean;
}

/** Level không có trong bảng thì không có bướm (phó bản trong hang/điện, sân độ kiếp). */
export const BUTTERFLY_LEVELS: Record<string, ButterflyLevel> = {
  // Ngọc lam của mạch, ngà, hồng hoa đào, vàng nắng sớm (art bible: spirit_jade, attire_ivory, leaf_blossom, air_sun_dawn).
  van_lam: { density: 0.3, flock: [2, 4], palette: ['#7fe3d0', '#e6ddcb', '#e9b4c0', '#f2c47e'] },
  kiem_trung: { density: 0.3, flock: [2, 4], palette: ['#7fe3d0', '#e6ddcb', '#e9b4c0', '#f2c47e'] },
  // Hẻm đá khô: thưa, màu đất son và rơm.
  doan_mach: { density: 0.12, flock: [1, 3], palette: ['#d9a25a', '#e6ddcb', '#c97b4a', '#f2c47e'] },
  // Đảo mây: trắng, lam nhạt.
  van_hai: { density: 0.22, flock: [2, 4], palette: ['#f1f5f4', '#bfe3ee', '#cfe0f7', '#e9b4c0'] },
  // Thành đêm: ít, phát sáng nhạt.
  thien_khuyet: { density: 0.12, flock: [1, 3], palette: ['#cff3ff', '#b9c8ff', '#7fe3d0', '#f2e6b8'], glow: true },
};

export const BUTTERFLY_MAX = 48;
/** Số con tối đa theo preset chất lượng. */
export const BUTTERFLY_QUALITY: Record<string, number> = { low: 16, medium: 32, high: 48, ultra: 48 };
const CELL = 8;
/** Bán kính (ô) quét quanh người chơi: 2 ô = 16–20 m (xa hơn thì con bướm chỉ còn vài điểm ảnh, tốn instance vô ích). */
const REACH = 2;
/** Sải cánh một bên (m). Bướm thật nhỏ hơn nhiều; 0,32 m để còn đọc ra hình ở khoảng cách camera 8–16 m. */
const WING = 0.32;
const TEX = 64;

/** Băm số nguyên → [0, 1), xác định. */
export function hash2(x: number, z: number, k: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(k | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Một điểm ảnh của cánh phải (u từ bản lề ra đầu cánh, v từ sau ra trước), trả [độ sáng, viền tối, alpha] trong 0–1.
 * Hình: cánh trước (elip lớn, chếch lên) hợp với cánh sau (elip nhỏ, chếch xuống) và thân mảnh sát bản lề.
 */
export function wingTexel(u: number, v: number): [number, number, number] {
  const ell = (cx: number, cy: number, rx: number, ry: number, rot: number): number => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const dx = u - cx;
    const dy = v - cy;
    const px = (dx * c + dy * s) / rx;
    const py = (-dx * s + dy * c) / ry;
    return Math.sqrt(px * px + py * py); // < 1 là trong elip
  };
  const fore = ell(0.44, 0.66, 0.5, 0.27, 0.42);
  const hind = ell(0.34, 0.3, 0.36, 0.25, -0.5);
  const body = Math.abs(u) < 0.07 && v > 0.14 && v < 0.9;
  const d = Math.min(fore, hind);
  if (d >= 1 && !body) return [0, 0, 0];
  if (body) return [0.12, 1, 1];
  // Viền tối ở mép, gân tỏa từ bản lề, hai đốm sáng ở cánh trước.
  const edge = Math.min(1, Math.max(0, (d - 0.74) / 0.2));
  const ang = Math.atan2(v - 0.5, u + 0.02);
  const vein = Math.pow(Math.abs(Math.sin(ang * 9)), 14) * Math.min(1, u * 2.2) * 0.5;
  const spot = Math.max(0, 1 - Math.hypot(u - 0.66, v - 0.74) / 0.09) + Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.86) / 0.06);
  const lum = Math.min(1, 0.72 + 0.28 * (1 - d) + 0.5 * spot);
  return [lum, Math.min(1, edge + vein), 1];
}

export function wingPixels(size = TEX): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [lum, edge, a] = wingTexel((x + 0.5) / size, (y + 0.5) / size);
      const o = (y * size + x) * 4;
      data[o] = Math.round(lum * 255);
      data[o + 1] = Math.round(edge * 255);
      data[o + 2] = 0;
      data[o + 3] = Math.round(a * 255);
    }
  return data;
}

/**
 * Lưới một con bướm ở tư thế mở phẳng: hai cánh, mỗi cánh hai đoạn theo chiều sải (để đầu cánh cong hơn gốc khi vỗ).
 * position.x = ±khoảng cách tới bản lề (0–1), position.z = dọc thân (−0,5–0,5, đầu ở +Z), y = 0. 8 tam giác.
 */
export function butterflyGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= 2; i++)
      for (let j = 0; j <= 1; j++) {
        const u = i / 2;
        pos.push(side * u, 0, j - 0.5);
        uvs.push(u, j);
      }
    for (let i = 0; i < 2; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

interface Spot {
  /** Khóa ổn định của một con (ô + thứ tự trong đàn). */
  id: number;
  x: number;
  z: number;
  /** Hạt giống 0–1 của con này (pha, bán kính lượn, màu). */
  seed: number;
  d2: number;
}

/** Chỗ này có hợp cho bướm không: trong vùng chơi, không nước, không dốc đứng, không sàn mây/vách đảo, không đỉnh tuyết. */
function suitable(x: number, z: number): boolean {
  const t = levelTerrain();
  const b = t.playBounds;
  if (x < b.x0 + 8 || x > b.x1 - 8 || z < b.z0 + 8 || z > b.z1 - 8) return false;
  if (inLakeWater(x, z)) return false;
  const h = heightAt(x, z);
  if (h > 235) return false;
  if (t.def.islands && h < (t.def.voidFloor ?? 0) + 40) return false;
  const slope = Math.max(Math.abs(heightAt(x + 2, z) - h), Math.abs(heightAt(x, z + 2) - h)) / 2;
  return slope < 0.55;
}

/**
 * Các con bướm nên có quanh (fx, fz), gần nhất trước, tối đa `limit`. Xác định theo ô: không phụ thuộc thứ tự gọi hay
 * phiên chơi. `ok` kiểm chỗ hợp lệ (mặc định `suitable`; test truyền hàm riêng). `cache` nhớ kết quả kiểm theo ô.
 */
export function spotsNear(fx: number, fz: number, cfg: ButterflyLevel, limit: number, ok: (x: number, z: number) => boolean = suitable, cache?: Map<number, boolean>): Spot[] {
  const cx = Math.floor(fx / CELL);
  const cz = Math.floor(fz / CELL);
  const out: Spot[] = [];
  for (let i = cx - REACH; i <= cx + REACH; i++)
    for (let j = cz - REACH; j <= cz + REACH; j++) {
      if (hash2(i, j, 1) >= cfg.density) continue;
      const x = (i + 0.2 + 0.6 * hash2(i, j, 2)) * CELL;
      const z = (j + 0.2 + 0.6 * hash2(i, j, 3)) * CELL;
      const key = i * 65537 + j;
      let good = cache?.get(key);
      if (good === undefined) {
        good = ok(x, z);
        cache?.set(key, good);
      }
      if (!good) continue;
      const n = cfg.flock[0] + Math.floor(hash2(i, j, 4) * (cfg.flock[1] - cfg.flock[0] + 1));
      const d2 = (x - fx) * (x - fx) + (z - fz) * (z - fz);
      for (let k = 0; k < n; k++) out.push({ id: key * 8 + k, x, z, seed: hash2(i, j, 10 + k), d2 });
    }
  out.sort((a, b) => a.d2 - b.d2 || a.id - b.id);
  return out.length > limit ? out.slice(0, limit) : out;
}

interface Fly {
  id: number;
  hx: number;
  hz: number;
  seed: number;
  /** 0 → 1 khi xuất hiện, về 0 khi rời tầm rồi nhả ô. */
  fade: number;
  leaving: boolean;
  /** Độ lệch do né người chơi (m), tắt dần. */
  ox: number;
  oz: number;
  x: number;
  y: number;
  z: number;
  ground: number;
  yaw: number;
}

const _tint = new THREE.Color();

export class Butterflies {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private readonly material: THREE.MeshBasicNodeMaterial;
  private readonly tex: THREE.DataTexture;
  /** xyz + hướng bay (rad). */
  private readonly a0 = new THREE.InstancedBufferAttribute(new Float32Array(BUTTERFLY_MAX * 4), 4);
  /** pha vỗ, cỡ (đã nhân độ mờ dần), chỉ số màu, nhịp vỗ. */
  private readonly a1 = new THREE.InstancedBufferAttribute(new Float32Array(BUTTERFLY_MAX * 4), 4);
  private readonly colors: THREE.Vector3[] = [];
  /** Độ sáng theo thời điểm (vật liệu không nhận đèn: cả đàn sáng đều, không nhấp nháy theo mặt cánh). */
  private readonly light = uniform(1);
  private readonly glow = uniform(0);
  private readonly flies: Fly[] = [];
  private readonly okCache = new Map<number, boolean>();
  private cap = BUTTERFLY_QUALITY.medium;
  private clock = 0;
  private scanIn = 0;
  private frame = 0;

  constructor(private readonly cfg: ButterflyLevel) {
    // Cùng cách với cỏ (grass.ts): InstancedBufferGeometry + Mesh thường, dữ liệu từng con ở thuộc tính instance.
    const one = butterflyGeometry();
    for (const k of ['position', 'uv']) this.geometry.setAttribute(k, one.getAttribute(k));
    this.geometry.setIndex(one.getIndex());
    this.geometry.setAttribute('iPose', this.a0);
    this.geometry.setAttribute('iLook', this.a1);
    this.geometry.instanceCount = 0;
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this.tex = new THREE.DataTexture(wingPixels(), TEX, TEX, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.generateMipmaps = true;
    this.tex.needsUpdate = true;
    for (const c of cfg.palette) {
      _tint.set(c);
      this.colors.push(new THREE.Vector3(_tint.r, _tint.g, _tint.b));
    }
    type N = ReturnType<typeof float>;
    const P0: N = instancedBufferAttribute(this.a0, 'vec4') as unknown as N;
    const P1: N = instancedBufferAttribute(this.a1, 'vec4') as unknown as N;
    const pal = uniformArray(this.colors, 'vec3');
    const g = positionGeometry;
    const side = g.x.sign();
    const d = abs(g.x);
    // Vỗ: cánh quay quanh trục thân quanh góc dựng ~35° (nhìn ngang vẫn thấy mặt cánh, không thành một vệt mảnh); đầu cánh
    // trễ pha và cong hơn gốc. Thỉnh thoảng lướt (biên độ nhỏ lại).
    const beat = time.mul(P1.w.mul(15)).add(P1.x);
    const glide = sin(time.mul(0.7).add(P1.x.mul(1.7))).mul(0.5).add(0.5);
    const ang = sin(beat.sub(d.mul(0.9))).mul(mix(float(1.05), float(0.35), glide.mul(glide))).add(0.62).mul(d.mul(0.35).add(0.75));
    const size = P1.y.mul(WING);
    const lx = side.mul(d).mul(cos(ang)).mul(size);
    const ly = d.mul(sin(ang)).mul(size);
    const lz = g.z.mul(size).mul(1.25);
    const cy = cos(P0.w);
    const sy = sin(P0.w);
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.positionNode = vec3(P0.x.add(lx.mul(cy)).add(lz.mul(sy)), P0.y.add(ly), P0.z.sub(lx.mul(sy)).add(lz.mul(cy)));
    const t = texture(this.tex, uv());
    const tint = pal.element(P1.z.toInt());
    const base = mix(tint.mul(t.r), vec3(0.05, 0.045, 0.05), t.g);
    m.colorNode = base.mul(this.light).add(tint.mul(t.r).mul(float(1).sub(t.g)).mul(this.glow));
    m.opacityNode = t.a;
    m.alphaTest = 0.5;
    this.material = m;
    this.mesh = new THREE.Mesh(this.geometry, m);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = 'butterflies';
  }

  setQuality(q: string): void {
    this.cap = BUTTERFLY_QUALITY[q] ?? BUTTERFLY_QUALITY.medium;
  }

  /** Số con đang vẽ (bảng F3, test). */
  get count(): number {
    return this.geometry.instanceCount;
  }

  /** `focus`: chân người chơi. Gọi mỗi khung. */
  update(dt: number, focus: { x: number; y: number; z: number }): void {
    if (dt <= 0) return;
    const step = Math.min(dt, 0.1);
    this.clock += step;
    this.frame++;
    const night = Math.min(1, Math.max(0, (beaconParams.intensity.value - 0.5) / 0.5));
    this.glow.value = this.cfg.glow ? 0.6 * night : 0;
    this.light.value = 1 - 0.55 * night;
    this.scanIn -= step;
    if (this.scanIn <= 0) {
      this.scanIn = 0.75;
      this.rescan(focus, this.cfg.glow ? this.cap : Math.round(this.cap * (1 - 0.65 * night)));
    }
    const a0 = this.a0.array as Float32Array;
    const a1 = this.a1.array as Float32Array;
    let n = 0;
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      f.fade = Math.min(1, Math.max(0, f.fade + (f.leaving ? -step : step) / 0.7));
      if (f.leaving && f.fade <= 0) {
        this.flies.splice(i, 1);
        continue;
      }
    }
    for (let i = 0; i < this.flies.length && n < BUTTERFLY_MAX; i++) {
      const f = this.flies[i];
      const s = f.seed;
      const t = this.clock * (0.32 + 0.22 * s) + s * 40;
      const r = 1.4 + 1.8 * s;
      // Đường lượn Lissajous quanh điểm đàn + nhấp nhô; mỗi con một tần số nên không bay thành hàng.
      let x = f.hx + Math.cos(t * 1.0 + s * 9) * r + Math.sin(t * 2.3 + s * 5) * 0.6;
      let z = f.hz + Math.sin(t * 1.37 + s * 4) * r * 0.85 + Math.cos(t * 1.9 + s * 7) * 0.6;
      // Né người chơi: tới gần 3 m thì dạt ra, rồi từ từ quay lại.
      const px = x + f.ox - focus.x;
      const pz = z + f.oz - focus.z;
      const pd = Math.hypot(px, pz);
      if (pd < 3 && pd > 1e-3) {
        const push = ((3 - pd) / 3) * 9 * step;
        f.ox += (px / pd) * push;
        f.oz += (pz / pd) * push;
      }
      const decay = Math.exp(-step * 0.5);
      f.ox *= decay;
      f.oz *= decay;
      x += f.ox;
      z += f.oz;
      // Độ cao mặt đất: mỗi con cập nhật một lần trong 4 khung (so le), giữa các lần thì giữ.
      if ((this.frame + i) % 4 === 0 || f.ground === -1e9) f.ground = heightAt(x, z);
      const y = f.ground + 0.9 + 0.55 * Math.sin(t * 2.1 + s * 3) + 0.5 * s;
      const vx = x - f.x;
      const vz = z - f.z;
      if (vx * vx + vz * vz > 1e-8) {
        const want = Math.atan2(vx, vz);
        let dy = want - f.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        f.yaw += dy * Math.min(1, step * 6);
      }
      f.x = x;
      f.y = y;
      f.z = z;
      const o = n * 4;
      a0[o] = x;
      a0[o + 1] = y;
      a0[o + 2] = z;
      a0[o + 3] = f.yaw;
      a1[o] = s * 62.8;
      a1[o + 1] = (0.75 + 0.5 * ((s * 7.13) % 1)) * f.fade;
      a1[o + 2] = Math.min(3, Math.floor(((s * 3.77) % 1) * 4));
      a1[o + 3] = 0.8 + 0.4 * ((s * 5.31) % 1);
      n++;
    }
    this.geometry.instanceCount = n;
    if (n > 0) {
      this.a0.needsUpdate = true;
      this.a1.needsUpdate = true;
    }
  }

  private rescan(focus: { x: number; z: number }, limit: number): void {
    if (this.okCache.size > 600) this.okCache.clear();
    const want = spotsNear(focus.x, focus.z, this.cfg, limit, suitable, this.okCache);
    const ids = new Set(want.map((w) => w.id));
    for (const f of this.flies) f.leaving = !ids.has(f.id);
    const have = new Set(this.flies.map((f) => f.id));
    for (const w of want) {
      if (have.has(w.id) || this.flies.length >= BUTTERFLY_MAX) continue;
      this.flies.push({ id: w.id, hx: w.x, hz: w.z, seed: w.seed, fade: 0, leaving: false, ox: 0, oz: 0, x: w.x, y: 0, z: w.z, ground: -1e9, yaw: w.seed * 6.28 });
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}
