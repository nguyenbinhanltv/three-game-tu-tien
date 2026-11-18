import * as THREE from 'three/webgpu';
import {
  abs,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  color,
  float,
  fract,
  fwidth,
  instancedBufferAttribute,
  max,
  min,
  mix,
  positionGeometry,
  select,
  smoothstep,
  step,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { fitFactor } from '../core/screenFit';

/**
 * Thanh máu trên đầu quái/người, gom vào **một** `InstancedMesh` (1 draw call cho mọi thanh).
 *
 * Mỗi khung gọi `begin()`, `push()` cho từng thanh đang hiện, rồi `end()`. Vị trí, độ rộng, máu, đoạn trễ,
 * loại và độ mờ đi qua hai thuộc tính instance; shader tự quay mặt thanh về camera (billboard trong
 * view space) và vẽ hình: đầu vát, viền đồng thau, gradient, mép sáng, vạch chia, đoạn trễ nhạt.
 * Thay cho 2 sprite/thanh trước đây (2 draw call mỗi thanh).
 */

export const BAR_ENEMY = 0;
export const BAR_ALLY = 1;
export const BAR_BOSS = 2;

/** Đủ cho mọi quái trong bán kính hiển thị và 50 người chơi; vượt quá thì các thanh push sau bị bỏ. */
const CAPACITY = 256;

// Màu viết theo sRGB, lấy từ bảng màu tâm trạng (docs/art-bible.md mục 4), đẩy sáng/tối cho hai đầu
// gradient. `color()` đổi sang linear. Đậm hơn thanh DOM một nấc vì chuỗi hậu kỳ của cảnh nâng sáng.
const C = {
  ink: color('#0e141c'), // nền: mực lam đêm (air_night tối hơn)
  bronze: color('#c9a45e'), // wood_bronze #AE8B49 sáng hơn cho viền mảnh
  sun: color('#f2c47e'), // air_sun_dawn: mép sáng
  mist: color('#dce6df'), // air_mist: đoạn trễ
  enemyTop: color('#c4493a'), // son đỏ wood_cinnabar sáng
  enemyBot: color('#4a1612'), // son đỏ tối
  bossTop: color('#c94a3c'),
  bossBot: color('#3a1f4c'), // chìm vào spirit_demonic
  allyTop: color('#86bd68'), // cỏ nắng leaf_grass
  allyBot: color('#1c4630'), // lá
};

export class HeadBars {
  readonly mesh: THREE.InstancedMesh;
  private a = new Float32Array(CAPACITY * 4);
  private b = new Float32Array(CAPACITY * 4);
  private attrA: THREE.InstancedBufferAttribute;
  private attrB: THREE.InstancedBufferAttribute;
  private n = 0;
  /** Camera hiện tại (vị trí, FOV dọc, cao khung nhìn px) để kẹp kích thước trên màn hình (P2-E4). */
  private cam = { x: 0, y: 0, z: 0, fov: 55, vh: 0 };

  constructor() {
    this.attrA = new THREE.InstancedBufferAttribute(this.a, 4);
    this.attrB = new THREE.InstancedBufferAttribute(this.b, 4);
    const A = instancedBufferAttribute(this.attrA, 'vec4'); // tâm xyz (thế giới), rộng
    const B = instancedBufferAttribute(this.attrB, 'vec4'); // máu, đoạn trễ, loại, độ mờ

    const w = A.w;
    // Chiều cao (m) theo độ rộng: rộng 1,5 → 0,165; boss rộng 3 → 0,24.
    const h = float(0.09).add(w.mul(0.05));
    const kind = B.z;
    const isBoss = step(1.5, kind);
    const isAlly = step(0.5, kind).mul(float(1).sub(isBoss));

    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    // Billboard: lấy tâm trong view space rồi cộng góc của quad theo trục màn hình.
    const viewCenter = cameraViewMatrix.mul(vec4(A.xyz, 1)).xyz;
    const corner = positionGeometry.xy; // PlaneGeometry 1×1: −0,5..0,5
    mat.vertexNode = cameraProjectionMatrix.mul(vec4(viewCenter.add(vec3(corner.x.mul(w), corner.y.mul(h), 0)), 1));

    // ----- hình -----
    const px = uv().x.mul(w);
    const py = uv().y.mul(h);
    const half = h.mul(0.5);
    const dy = abs(py.sub(half));
    // Khoảng cách có dấu tới viền lục giác đầu vát (dương bên trong), theo mét.
    const sdOuter = min(min(px, w.sub(px)).sub(dy.mul(0.9)), half.sub(dy));
    const aa = max(fwidth(sdOuter), 1e-4);
    const outer = smoothstep(aa.negate(), aa, sdOuter);
    const border = h.mul(0.16);
    const inner = smoothstep(border.sub(aa), border.add(aa), sdOuter);

    // ----- phần trong: máu, đoạn trễ, nền -----
    const t = uv().x;
    const hp = B.x;
    const trail = max(B.y, hp);
    const ft = max(fwidth(t), 1e-5);
    const inHp = float(1).sub(smoothstep(hp.sub(ft), hp.add(ft), t));
    const inTrail = float(1).sub(smoothstep(trail.sub(ft), trail.add(ft), t)).mul(float(1).sub(inHp));
    // Gradient dọc: trên sáng, dưới tối (uv.y = 1 ở trên).
    const vy = clamp(py.sub(border).div(max(h.sub(border.mul(2)), 1e-4)), 0, 1);
    const topCol = select(isBoss.greaterThan(0.5), C.bossTop, select(isAlly.greaterThan(0.5), C.allyTop, C.enemyTop));
    const botCol = select(isBoss.greaterThan(0.5), C.bossBot, select(isAlly.greaterThan(0.5), C.allyBot, C.enemyBot));
    const grad = mix(botCol, topCol, vy.mul(vy.mul(-0.6).add(1.6)));
    // Mép sáng: dải mảnh ở trên cùng phần máu.
    const rim = smoothstep(0.72, 0.9, vy);
    const lit = grad.add(C.sun.mul(rim.mul(0.3)));
    // Mép đầu thanh máu sáng lên một chút để đọc được chỗ máu dừng.
    const lead = float(1).sub(smoothstep(0, max(ft.mul(3), 0.012), hp.sub(t)));
    const fill = mix(lit, C.sun, lead.mul(0.5).mul(step(0.001, hp)));
    const trailCol = C.mist.mul(vy.mul(0.18).add(0.82));
    const bg = C.ink.add(vec3(0.004, 0.005, 0.006).mul(float(1).sub(vy)));
    const base = mix(mix(bg, fill, inHp), trailCol, inTrail);

    // Vạch chia: thường 4 đoạn, boss 10 đoạn; chỉ khắc trên phần có máu/đoạn trễ.
    const segs = select(isBoss.greaterThan(0.5), float(10), float(4));
    const st = t.mul(segs);
    const tickW = ft.mul(segs).mul(1.2);
    const tick = float(1).sub(smoothstep(0, tickW, abs(fract(st.add(0.5)).sub(0.5))));
    const tickMask = tick.mul(step(0.5, st)).mul(step(st, segs.sub(0.5))).mul(inHp.add(inTrail));
    const ticked = mix(base, C.ink, tickMask.mul(0.55));

    // Viền đồng thau giữa mép ngoài và phần trong; viền trên sáng hơn viền dưới.
    const frame = C.bronze.mul(vy.mul(0.5).add(0.55));
    mat.colorNode = mix(frame, ticked, inner);
    mat.opacityNode = outer.mul(B.w).mul(mix(float(0.9), float(1), inner));

    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.raycast = () => {};
  }

  begin(): void {
    this.n = 0;
  }

  /** Đặt camera cho khung này; `vh` = 0 thì không kẹp. */
  setView(x: number, y: number, z: number, fovDeg: number, viewH: number): void {
    const c = this.cam;
    c.x = x;
    c.y = y;
    c.z = z;
    c.fov = fovDeg;
    c.vh = viewH;
  }

  /**
   * Thêm một thanh. `x,y,z`: tâm thanh trong thế giới; `width` (m); `hp`, `trail`: 0..1;
   * `kind`: BAR_ENEMY | BAR_ALLY | BAR_BOSS; `alpha`: 0..1.
   */
  push(x: number, y: number, z: number, width: number, hp: number, trail: number, kind: number, alpha = 1): void {
    if (this.n >= CAPACITY) return;
    const c = this.cam;
    if (c.vh > 0) {
      // Thanh máu không to khổng lồ khi camera sát, cũng không bé tí khi xa: rộng trên màn hình trong [min, max] px.
      const boss = kind >= 1.5;
      const d = Math.hypot(x - c.x, y - c.y, z - c.z);
      width *= fitFactor(width, d, c.fov, c.vh, boss ? 100 : 44, boss ? 300 : 120);
    }
    const i = this.n++ * 4;
    this.a[i] = x;
    this.a[i + 1] = y;
    this.a[i + 2] = z;
    this.a[i + 3] = width;
    this.b[i] = hp;
    this.b[i + 1] = trail;
    this.b[i + 2] = kind;
    this.b[i + 3] = alpha;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (!this.n) return;
    const len = this.n * 4;
    this.attrA.clearUpdateRanges();
    this.attrA.addUpdateRange(0, len);
    this.attrA.needsUpdate = true;
    this.attrB.clearUpdateRanges();
    this.attrB.addUpdateRange(0, len);
    this.attrB.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

