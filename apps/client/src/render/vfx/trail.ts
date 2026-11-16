import * as THREE from 'three/webgpu';
import { abs, exp, float, min, mix, pow, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import { groundAt, PF_DEAD, PF_FLYING, PF_MEDITATING } from '@dtl/shared';
import { vnoise, type FxUniforms } from './common';
import type { Particles } from './particles';
import type { FxKind, FxMesh } from '../materials/vfx';
import { BladeRibbon } from './bladeTrail';

/**
 * Vệt và hạt theo nhân vật (M4-5). Chỉ là lớp hình, không đổi luật hay thời điểm:
 * - Vệt sáng phi kiếm khi ngự kiếm: dải quay về camera bám theo lịch sử vị trí phi kiếm (`trail`, cộng
 *   sáng, bloom), kèm tia linh quang rơi dọc đường bay và sương cuộn dưới chân (art bible mục 7).
 * - Hạt linh quang nhỏ quanh thanh kiếm sau lưng khi cầm kiếm; bừng một chùm khi ra đòn.
 * - Bụi khi chạy: mỗi bước chân trên đất một nhúm bụi.
 *
 * Hạt đi qua hệ hạt dùng chung (`Particles`, 2 draw call, bộ đệm vòng theo ngân sách preset); mỗi dải
 * vệt là một `FxMesh` lấy từ pool với lưới cấp sẵn (tối đa `MAX_RIBBONS` dải cho người gần nhất).
 * Hiệu ứng của người khác giảm một nửa số hạt; ở xa hơn `NEAR` thì không sinh hạt.
 */

/** Số điểm lịch sử của một dải vệt. */
const RIB_PTS = 24;
/** Khoảng lấy mẫu lịch sử (giây): dải dài khoảng 0,5 giây đường bay. */
const RIB_DT = 1 / 48;
/** Dải vệt sống cùng lúc toàn cảnh (phi kiếm + vệt kiếm), K-6 nâng 8 → 12. */
export const MAX_RIBBONS = 12;
const NEAR = 70;

const C_SWORD = 0xcff3ff; // spirit_sword
const C_SWORD_DEEP = 0x8fdcff;
const C_MIST = 0xdce6df; // air_mist
const C_DUST = 0xb9b29a; // giữa stone_light và leaf_dry

/** Node màu/độ trong cho dải vệt (`fxA.z` = seed). `uv.x`: 0 ở đầu (phi kiếm) → 1 ở đuôi. */
export function trailNodes(U: FxUniforms) {
  const st = uv();
  const u = st.x;
  const x = abs(st.y.sub(0.5)).mul(2);
  const one = float(1);
  const core = exp(x.mul(x).mul(-10));
  const tail = pow(one.sub(u), 1.6);
  const flow = vnoise(vec2(u.mul(9).sub(time.mul(6)).add(U.a.z), st.y.mul(3))).mul(0.45).add(0.65);
  const lum = core.mul(tail).mul(flow);
  const c = mix(U.color, vec3(1, 1, 1), core.mul(one.sub(u)).mul(0.5));
  return {
    color: min(c.mul(lum.mul(1.5).add(0.15)), U.maxHdr),
    opacity: U.opacity.mul(min(lum.mul(1.3), 1)).mul(smoothstep(0, 0.04, u)),
  };
}

/** Dải vệt: lưới cấp sẵn, dựng lại mỗi khung quay về camera. */
class Ribbon {
  readonly geo = new THREE.BufferGeometry();
  private readonly pos = new THREE.BufferAttribute(new Float32Array(RIB_PTS * 2 * 3), 3);
  /** Lịch sử vị trí (x,y,z), [0] là mới nhất. */
  readonly hist = new Float32Array(RIB_PTS * 3);
  n = 0;
  acc = 0;
  mesh: FxMesh | null = null;
  owner = '';
  fade = 0;

  constructor() {
    const uvs = new Float32Array(RIB_PTS * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < RIB_PTS; i++) {
      const u = i / (RIB_PTS - 1);
      uvs.set([u, 0, u, 1], i * 4);
      if (i < RIB_PTS - 1) {
        const v = i * 2;
        idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    // Pháp tuyến hằng (dải tự phát sáng; node material mặc định vẫn đọc).
    this.geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(RIB_PTS * 2 * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  }

  reset(x: number, y: number, z: number): void {
    for (let i = 0; i < RIB_PTS; i++) this.hist.set([x, y, z], i * 3);
    this.n = 1;
    this.acc = 0;
  }

  /** Đầu dải luôn ở vị trí hiện tại; lịch sử dịch theo nhịp `RIB_DT`. */
  push(x: number, y: number, z: number, dt: number): void {
    const h = this.hist;
    this.acc += dt;
    while (this.acc >= RIB_DT) {
      this.acc -= RIB_DT;
      h.copyWithin(3, 0, (RIB_PTS - 1) * 3);
      if (this.n < RIB_PTS) this.n++;
    }
    h[0] = x;
    h[1] = y;
    h[2] = z;
  }

  build(cam: THREE.Vector3, width: number): void {
    const h = this.hist;
    const P = this.pos.array as Float32Array;
    for (let i = 0; i < RIB_PTS; i++) {
      const j = Math.min(i, this.n - 1);
      const a = Math.max(0, j - 1) * 3;
      const b = Math.min(this.n - 1, j + 1) * 3;
      const tx = h[a] - h[b];
      const ty = h[a + 1] - h[b + 1];
      const tz = h[a + 2] - h[b + 2];
      const px = h[j * 3];
      const py = h[j * 3 + 1];
      const pz = h[j * 3 + 2];
      const vx = cam.x - px;
      const vy = cam.y - py;
      const vz = cam.z - pz;
      let sx = ty * vz - tz * vy;
      let sy = tz * vx - tx * vz;
      let sz = tx * vy - ty * vx;
      const l = Math.hypot(sx, sy, sz);
      // Đứng yên (không có tiếp tuyến): dải co về một điểm.
      const w = l > 1e-5 ? (width * (1 - (i / RIB_PTS) * 0.6)) / l : 0;
      sx *= w;
      sy *= w;
      sz *= w;
      P.set([px - sx, py - sy, pz - sz, px + sx, py + sy, pz + sz], i * 6);
    }
    this.pos.needsUpdate = true;
  }
}

/** Nhân vật mà `Trails` đọc (khớp cấu trúc với `PlayerVis` trong game/entities.ts). */
export interface TrailActor {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  fl: number;
  /** Model không có trường nào thì bỏ hiệu ứng tương ứng (xem `CharacterView` trong game/character/view.ts). */
  model: {
    /** Số bước chân đã bước (tăng mỗi lần chân chạm đất khi chạy). */
    readonly steps?: number;
    /** Số lần ra đòn. */
    readonly attacks?: number;
    readonly hasSword?: boolean;
    readonly grounded?: boolean;
    root: { scale: { x: number } };
  };
}

/** Nguồn lưới hiệu ứng (Vfx): lấy/trả `FxMesh` từ pool dùng chung. */
export interface FxSource {
  fx(geo: THREE.BufferGeometry, color: number, opacity: number, kind: FxKind): FxMesh;
  drop(m: FxMesh): void;
}

interface ActorState {
  steps: number;
  attacks: number;
  mote: number;
  spark: number;
  mist: number;
  seen: number;
}

const _cam = new THREE.Vector3();

export class Trails {
  private ribbons: Ribbon[] = [];
  /** Vệt kiếm bám mũi kiếm (K-6): dùng chung hạn mức `MAX_RIBBONS` với vệt phi kiếm. */
  private blades: { r: BladeRibbon; mesh: FxMesh | null }[] = [];
  private state = new Map<string, ActorState>();
  private frame = 0;

  constructor(
    private src: FxSource,
    private particles: Particles,
  ) {
    for (let i = 0; i < MAX_RIBBONS; i++) this.ribbons.push(new Ribbon());
  }

  private usedRibbons(): number {
    let n = 0;
    for (const r of this.ribbons) if (r.mesh) n++;
    for (const b of this.blades) if (b.mesh) n++;
    return n;
  }

  /**
   * Mở một vệt kiếm cho `owner` (lấy dải còn trống, null nếu đã đủ `MAX_RIBBONS`). Gọi `push` mỗi khung trong cửa sổ
   * lấy mẫu rồi `finish`; dải tự tan sau `BLADE_LIFE` giây và trả về pool.
   */
  openBlade(owner: string, color: number): BladeRibbon | null {
    if (this.usedRibbons() >= MAX_RIBBONS) return null;
    let b = this.blades.find((q) => !q.mesh);
    if (!b) {
      b = { r: new BladeRibbon(), mesh: null };
      this.blades.push(b);
    }
    b.r.reset(owner);
    b.mesh = this.src.fx(b.r.geo, color, 0.9, 'trail');
    b.mesh.fxA.z = Math.random() * 40;
    return b.r;
  }

  /** Già đi các vệt kiếm; vệt hết mẫu thì trả về pool. */
  private updateBlades(dt: number): void {
    for (const b of this.blades) {
      if (!b.mesh) continue;
      const n = b.r.step(dt);
      if (n === 0 && !b.r.sampling) {
        this.src.drop(b.mesh);
        b.mesh = null;
        b.r.owner = '';
        continue;
      }
      b.mesh.visible = b.r.build() > 0;
    }
  }

  update(dt: number, actors: Map<string, TrailActor>, mySid: string, camera: THREE.Camera): void {
    this.frame++;
    camera.getWorldPosition(_cam);
    const P = this.particles;
    for (const [id, a] of actors) {
      const mine = id === mySid;
      const dist = Math.hypot(a.x - _cam.x, a.z - _cam.z);
      let st = this.state.get(id);
      if (!st) {
        st = { steps: a.model.steps ?? 0, attacks: a.model.attacks ?? 0, mote: Math.random(), spark: 0, mist: 0, seen: 0 };
        this.state.set(id, st);
      }
      st.seen = this.frame;
      const dead = (a.fl & PF_DEAD) !== 0;
      const flying = (a.fl & PF_FLYING) !== 0 && !dead;
      const s = a.model.root.scale.x;
      const cy = Math.cos(a.yaw);
      const sy = Math.sin(a.yaw);
      // Người khác: một nửa số hạt (skill tsl-shaders-vfx); xa quá thì không sinh.
      const pk = dist > NEAR ? 0 : mine ? 1 : 0.5;

      // ----- ngự kiếm: dải vệt + tia linh quang + sương dưới chân -----
      if (flying) {
        // Đuôi phi kiếm (chuôi): gốc nhân vật + (0, −0,1, −0,9) xoay theo hướng mặt.
        const hx = a.x + sy * -0.9 * s;
        const hy = a.y - 0.1 * s;
        const hz = a.z + cy * -0.9 * s;
        if (dist < 140) this.ribbonFor(id, hx, hy, hz, dt);
        if (pk > 0) {
          const fast = Math.min(1, a.speed / 12);
          st.spark += dt * 26 * pk * (0.3 + fast);
          while (st.spark >= 1) {
            st.spark -= 1;
            P.emit('glow', hx + (Math.random() - 0.5) * 0.5, hy + (Math.random() - 0.5) * 0.2, hz + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, -0.4 - Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 0.45 + Math.random() * 0.3, 0.09, 0.02, Math.random() < 0.6 ? C_SWORD : C_SWORD_DEEP, 0.9, 0.6, 1.5);
          }
          st.mist += dt * 7 * pk;
          while (st.mist >= 1) {
            st.mist -= 1;
            P.emit('dust', a.x + (Math.random() - 0.5) * 0.8, hy - 0.15, a.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0.15, (Math.random() - 0.5) * 0.8, 1.1 + Math.random() * 0.5, 0.5, 2.0, C_MIST, 0.22, -0.05, 1.2);
          }
        }
      }

      // ----- cầm kiếm: linh quang quanh thanh kiếm sau lưng, bừng khi ra đòn -----
      const holding = !!a.model.hasSword && !flying && !dead && (a.fl & PF_MEDITATING) === 0;
      const atk = (a.model.attacks ?? 0) - st.attacks;
      st.attacks = a.model.attacks ?? 0;
      if (holding && pk > 0) {
        const bx = a.x + (cy * 0.14 + sy * -0.26) * s;
        const by = a.y + 1.2 * s;
        const bz = a.z + (-sy * 0.14 + cy * -0.26) * s;
        st.mote += dt * 2.5 * pk;
        let burst = atk > 0 ? Math.round(8 * pk) : 0;
        while (st.mote >= 1 || burst > 0) {
          if (burst > 0) burst--;
          else st.mote -= 1;
          P.emit('glow', bx + (Math.random() - 0.5) * 0.35, by + (Math.random() - 0.5) * 0.7, bz + (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.25, 0.25 + Math.random() * 0.35, (Math.random() - 0.5) * 0.25, 0.9 + Math.random() * 0.6, 0.05, 0.015, C_SWORD, 0.8, -0.05, 0.6);
        }
      }

      // ----- bụi khi chạy -----
      const steps = (a.model.steps ?? 0) - st.steps;
      st.steps = a.model.steps ?? 0;
      if (steps > 0 && pk > 0 && a.model.grounded && !flying && a.speed > 3.5 && Math.random() < pk) {
        const side = ((a.model.steps ?? 0) & 1) === 0 ? 0.11 : -0.11;
        const fx = a.x + cy * side * s;
        const fz = a.z - sy * side * s;
        const gy = Math.max(a.y, groundAt(fx, fz));
        for (let i = 0; i < 3; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 0.4 + Math.random() * 0.6;
          // Bụi bị hất về sau một chút.
          P.emit('dust', fx, gy + 0.08, fz, Math.cos(ang) * sp - sy * 0.6, 0.35 + Math.random() * 0.3, Math.sin(ang) * sp - cy * 0.6, 0.6 + Math.random() * 0.3, 0.22, 0.85, C_DUST, 0.32, -0.1, 2.5);
        }
      }
    }

    // Dải vệt: chủ không còn bay (hoặc đã rời đi) thì mờ dần rồi trả về pool.
    for (const r of this.ribbons) {
      if (!r.mesh) continue;
      const a = actors.get(r.owner);
      const live = a && (a.fl & PF_FLYING) !== 0 && (a.fl & PF_DEAD) === 0 && this.state.get(r.owner)?.seen === this.frame;
      if (live) r.fade = Math.min(1, r.fade + dt * 6);
      else {
        r.fade -= dt * 4;
        // Không còn chủ: đầu dải đứng yên, đuôi đuổi kịp.
        r.push(r.hist[0], r.hist[1], r.hist[2], dt);
      }
      if (r.fade <= 0) {
        this.src.drop(r.mesh);
        r.mesh = null;
        r.owner = '';
        continue;
      }
      r.build(_cam, 0.32);
      r.mesh.fxOpacity = 0.85 * r.fade;
    }
    this.updateBlades(dt);
    for (const [id, st] of this.state) if (st.seen !== this.frame) this.state.delete(id);
  }

  private ribbonFor(id: string, x: number, y: number, z: number, dt: number): void {
    let r = this.ribbons.find((q) => q.owner === id && q.mesh);
    if (!r) {
      r = this.ribbons.find((q) => !q.mesh);
      if (!r || this.usedRibbons() >= MAX_RIBBONS) return;
      r.owner = id;
      r.fade = 0;
      r.reset(x, y, z);
      r.mesh = this.src.fx(r.geo, C_SWORD, 0, 'trail');
      r.mesh.fxA.z = Math.random() * 40;
    }
    r.push(x, y, z, dt);
  }

  /** Số dải đang dùng (đo đạc). */
  get ribbonCount(): number {
    return this.ribbons.filter((r) => r.mesh).length;
  }

  dispose(): void {
    for (const r of this.ribbons) {
      if (r.mesh) this.src.drop(r.mesh);
      r.mesh = null;
      r.owner = '';
    }
    for (const b of this.blades) {
      if (b.mesh) this.src.drop(b.mesh);
      b.mesh = null;
      b.r.owner = '';
      b.r.sampling = false;
    }
    this.state.clear();
  }
}
