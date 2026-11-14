import * as THREE from 'three/webgpu';
import { clamp, exp, float, instancedBufferAttribute, length, max, min, mix, pow, smoothstep, step, uniform, uv, vec3 } from 'three/tsl';
import { markBloom } from '../post';
import { FX_MAX_HDR } from '../materials/vfx';

/**
 * Hệ hạt GPU dùng chung (M4-5): mọi hạt của game (linh quang, tia lửa, bụi, sương) nằm trong HAI
 * `Sprite` instanced, mỗi cái MỘT draw call: `glow` cộng sáng có bloom, `dust` hòa trộn thường có sương.
 *
 * Quỹ đạo tính hoàn toàn trong vertex shader từ dữ liệu lúc sinh (vị trí, vận tốc, lực cản, trọng lực,
 * thời điểm sinh, tuổi thọ, cỡ đầu/cuối, màu), nên CPU chỉ ghi vài float khi sinh hạt rồi thôi: không
 * mô phỏng từng khung, không cấp phát. Bộ đệm là vòng tròn: hạt mới đè lên hạt cũ nhất, nên số hạt
 * sống KHÔNG BAO GIỜ vượt ngân sách của preset (art bible/skill tsl-shaders-vfx: 5.000 Thấp, 20.000 Cao).
 */

/** Ngân sách hạt theo preset chất lượng (tổng hai lớp). */
export const PARTICLE_BUDGET: Record<string, number> = { low: 5000, medium: 12000, high: 20000 };
/** Tỉ lệ ngân sách cho lớp cộng sáng; phần còn lại cho bụi/sương. */
const GLOW_SHARE = 0.6;
const MAX_TOTAL = 20000;

export type ParticleLayer = 'glow' | 'dust';

const uTime = uniform(0);

class Layer {
  readonly cap: number;
  /** Số ô đang dùng theo preset (≤ cap). Bộ đệm vòng chỉ chạy trong [0, limit). */
  limit: number;
  next = 0;
  readonly sprite: THREE.Sprite;
  /** x,y,z vị trí sinh; w thời điểm sinh (giây, theo đồng hồ của hệ). */
  private readonly a0: THREE.InstancedBufferAttribute;
  /** x,y,z vận tốc đầu; w tuổi thọ. */
  private readonly a1: THREE.InstancedBufferAttribute;
  /** x cỡ đầu, y cỡ cuối, z trọng lực (m/s², dương = rơi), w lực cản (1/s). */
  private readonly a2: THREE.InstancedBufferAttribute;
  /** r,g,b màu tuyến tính, a độ trong lớn nhất. */
  private readonly a3: THREE.InstancedBufferAttribute;
  private dirtyLo = Infinity;
  private dirtyHi = -1;

  constructor(cap: number, glow: boolean) {
    this.cap = cap;
    this.limit = cap;
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.a0 = mk();
    this.a1 = mk();
    this.a2 = mk();
    this.a3 = mk();
    // Mọi ô bắt đầu "đã chết" (sinh ở thời điểm rất xa trong quá khứ, tuổi thọ 0).
    for (let i = 0; i < cap; i++) this.a0.array[i * 4 + 3] = -1e6;

    const p0 = instancedBufferAttribute(this.a0);
    const p1 = instancedBufferAttribute(this.a1);
    const p2 = instancedBufferAttribute(this.a2);
    const p3 = instancedBufferAttribute(this.a3);
    const t = uTime.sub(p0.w);
    const life = max(p1.w, 1e-3);
    const alive = step(0, t).mul(step(t, p1.w));
    const k = clamp(t.div(life), 0, 1);
    // Lực cản tuyến tính: quãng đi = v·(1 − e^(−d·t))/d; trọng lực cộng riêng.
    const d = max(p2.w, 1e-3);
    const drift = float(1).sub(exp(d.negate().mul(t))).div(d);
    const pos = p0.xyz.add(p1.xyz.mul(drift)).sub(vec3(0, p2.z.mul(t).mul(t).mul(0.5), 0));

    const mat = new THREE.SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: !glow,
    });
    mat.positionNode = pos;
    mat.scaleNode = mix(p2.x, p2.y, k).mul(alive);
    // Đĩa tròn mềm; hiện nhanh, tắt dần.
    const r = length(uv().sub(0.5)).mul(2);
    const disc = glow ? pow(float(1).sub(smoothstep(0, 1, r)), 1.6) : float(1).sub(smoothstep(0.35, 1, r));
    const fade = smoothstep(0, 0.08, k).mul(pow(float(1).sub(k), glow ? 1.2 : 1.6));
    mat.colorNode = glow ? min(p3.xyz.mul(float(1.6).sub(k.mul(0.6))), FX_MAX_HDR) : p3.xyz;
    mat.opacityNode = p3.w.mul(disc).mul(fade).mul(alive);
    mat.name = glow ? 'fx-particles-glow' : 'fx-particles-dust';
    if (glow) markBloom(mat, 0.5);

    this.sprite = new THREE.Sprite(mat);
    this.sprite.count = cap;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = glow ? 2 : 1;
    this.sprite.name = mat.name;
  }

  emit(now: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, grav: number, drag: number, c: THREE.Color, alpha: number): void {
    const i = this.next;
    this.next = (i + 1) % this.limit;
    const o = i * 4;
    const a0 = this.a0.array as Float32Array;
    const a1 = this.a1.array as Float32Array;
    const a2 = this.a2.array as Float32Array;
    const a3 = this.a3.array as Float32Array;
    a0[o] = x;
    a0[o + 1] = y;
    a0[o + 2] = z;
    a0[o + 3] = now;
    a1[o] = vx;
    a1[o + 1] = vy;
    a1[o + 2] = vz;
    a1[o + 3] = life;
    a2[o] = s0;
    a2[o + 1] = s1;
    a2[o + 2] = grav;
    a2[o + 3] = drag;
    a3[o] = c.r;
    a3[o + 1] = c.g;
    a3[o + 2] = c.b;
    a3[o + 3] = alpha;
    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
  }

  /** Đẩy phần bộ đệm vừa ghi lên GPU (chỉ đoạn đã đổi). */
  flush(): void {
    if (this.dirtyHi < 0) return;
    const start = this.dirtyLo * 4;
    const count = (this.dirtyHi - this.dirtyLo + 1) * 4;
    for (const a of [this.a0, this.a1, this.a2, this.a3]) {
      a.clearUpdateRanges();
      a.addUpdateRange(start, count);
      a.needsUpdate = true;
    }
    this.dirtyLo = Infinity;
    this.dirtyHi = -1;
  }

  setLimit(n: number, now: number): void {
    const lim = Math.max(64, Math.min(this.cap, Math.floor(n)));
    if (lim === this.limit) return;
    // Giảm ngân sách: giết các ô ngoài giới hạn mới để số hạt sống không vượt.
    if (lim < this.limit) {
      const a0 = this.a0.array as Float32Array;
      for (let i = lim; i < this.limit; i++) a0[i * 4 + 3] = -1e6;
      if (this.dirtyLo > lim) this.dirtyLo = lim;
      this.dirtyHi = Math.max(this.dirtyHi, this.limit - 1);
    }
    this.limit = lim;
    this.next %= lim;
    this.sprite.count = lim;
    void now;
  }

  /** Số hạt còn sống (đếm trên CPU; chỉ dùng cho đo đạc/kiểm thử). */
  alive(now: number): number {
    const a0 = this.a0.array as Float32Array;
    const a1 = this.a1.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.limit; i++) {
      const t = now - a0[i * 4 + 3];
      if (t >= 0 && t <= a1[i * 4 + 3]) n++;
    }
    return n;
  }
}

const _c = new THREE.Color();

/** Hệ hạt duy nhất của game (sống qua các lần đổi room như `FxPool`). */
export class Particles {
  readonly glow = new Layer(Math.round(MAX_TOTAL * GLOW_SHARE), true);
  readonly dust = new Layer(MAX_TOTAL - Math.round(MAX_TOTAL * GLOW_SHARE), false);
  /** Đồng hồ riêng (giây). */
  now = 0;
  private budget = PARTICLE_BUDGET.medium;

  /** Ngân sách theo preset (`low`/`medium`/`high`). */
  setQuality(q: string): void {
    this.budget = PARTICLE_BUDGET[q] ?? PARTICLE_BUDGET.medium;
    this.glow.setLimit(this.budget * GLOW_SHARE, this.now);
    this.dust.setLimit(this.budget * (1 - GLOW_SHARE), this.now);
  }

  get limit(): number {
    return this.budget;
  }

  attach(parent: THREE.Object3D): void {
    parent.add(this.dust.sprite, this.glow.sprite);
  }

  detach(): void {
    this.glow.sprite.removeFromParent();
    this.dust.sprite.removeFromParent();
  }

  /**
   * Sinh một hạt. `color`: hex sRGB. `grav` m/s² (dương = rơi xuống), `drag` 1/s.
   * `s0`/`s1` cỡ (m) lúc sinh/lúc tắt.
   */
  emit(layer: ParticleLayer, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: number, alpha = 1, grav = 0, drag = 0): void {
    _c.setHex(color);
    (layer === 'glow' ? this.glow : this.dust).emit(this.now, x, y, z, vx, vy, vz, life, s0, s1, grav, drag, _c, alpha);
  }

  update(dt: number): void {
    this.now += dt;
    uTime.value = this.now;
    this.glow.flush();
    this.dust.flush();
  }

  /** Số hạt đang sống (đo đạc). */
  aliveCount(): { glow: number; dust: number; total: number; budget: number } {
    const glow = this.glow.alive(this.now);
    const dust = this.dust.alive(this.now);
    return { glow, dust, total: glow + dust, budget: this.budget };
  }
}

export const PARTICLES = new Particles();
