import * as THREE from 'three/webgpu';
import { attribute, cos, float, length, mix, positionLocal, sin, smoothstep, time, uniform, vec2, vec3 } from 'three/tsl';
import { hash01, SECT } from '@dtl/shared';

/**
 * Đàn chim lượn trên tông môn (Chân Cảnh M4): hai đàn bay vòng tròn ngược chiều ở độ cao 8–15 m (một đàn trên đại lộ, một trên ao sen: chỗ người chơi qua lại nhiều), vỗ cánh. Một InstancedMesh (1 draw call, ~70 tam giác/con),
 * toàn bộ chuyển động tính trong shader từ thuộc tính instance (tâm, bán kính, tốc độ, pha) — không việc CPU mỗi khung ngoài một uniform vị trí người chơi.
 * Camera chéo nhìn từ ~16 m cao: chim bay trong tầm nhìn có thể che người, nên con nào lại gần người (< 3,5 m trên mặt phẳng) thì thu nhỏ về 0 (từ 8 m trở ra đủ cỡ).
 * Không đổ bóng, không va chạm. Tắt bằng `?birds=0`.
 */

interface Flock {
  cx: number;
  cz: number;
  r: number;
  w: number;
  y: number;
  n: number;
}
/** Tương đối tâm tông môn. `w` > 0 ngược chiều kim đồng hồ. */
export const BIRD_FLOCKS: Flock[] = [
  { cx: 0, cz: 40, r: 11, w: 0.4, y: 9, n: 4 },
  { cx: -50, cz: 52, r: 10, w: -0.38, y: 8, n: 3 },
];

/** Thân + hai cánh dạng chữ V dẹt: mũi +z, sải cánh ±x; `wing` (thuộc tính) = 0 ở thân, 1 ở mút cánh (để vỗ). Sải ~1,1 m. */
function birdGeometry(): THREE.BufferGeometry {
  const v: number[] = [];
  const wing: number[] = [];
  const tri = (a: [number, number, number, number], b: [number, number, number, number], c: [number, number, number, number]) => {
    for (const p of [a, b, c]) {
      v.push(p[0], p[1], p[2]);
      wing.push(p[3]);
    }
  };
  // thân
  tri([0, 0, 0.32, 0], [-0.06, 0, -0.18, 0], [0.06, 0, -0.18, 0]);
  // cánh trái/phải: tam giác gốc cánh trước → mút → gốc cánh sau (mút lùi nhẹ ra sau)
  tri([-0.05, 0, 0.12, 0], [-0.55, 0, -0.12, 1], [-0.05, 0, -0.12, 0]);
  tri([0.05, 0, 0.12, 0], [0.05, 0, -0.12, 0], [0.55, 0, -0.12, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      v.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  return g;
}

export class LacKiemBirds {
  readonly mesh: THREE.InstancedMesh;
  private readonly focus = uniform(new THREE.Vector3());
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.MeshBasicNodeMaterial;
  readonly count: number;

  constructor() {
    const items: { cx: number; cz: number; r: number; w: number; y: number; ph: number; sc: number }[] = [];
    BIRD_FLOCKS.forEach((f, fi) => {
      for (let i = 0; i < f.n; i++)
        items.push({
          cx: SECT.x + f.cx,
          cz: SECT.z + f.cz,
          r: f.r + (hash01(fi, i, 1) - 0.5) * 9,
          w: f.w * (0.92 + hash01(fi, i, 2) * 0.16),
          y: SECT.y + f.y + (hash01(fi, i, 3) - 0.5) * 5,
          ph: hash01(fi, i, 4) * Math.PI * 2,
          sc: 1.2 + hash01(fi, i, 5) * 0.5,
        });
    });
    this.count = items.length;
    this.geo = birdGeometry();
    // vec4 (tâm x, tâm z, bán kính, tốc độ góc) và vec4 (độ cao, pha, cỡ, 0): thuộc tính instance
    const a = new Float32Array(items.length * 4);
    const b = new Float32Array(items.length * 4);
    items.forEach((it, i) => {
      a.set([it.cx, it.cz, it.r, it.w], i * 4);
      b.set([it.y, it.ph, it.sc, 0], i * 4);
    });
    this.geo.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
    this.geo.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));

    const A = attribute('aA', 'vec4');
    const B = attribute('aB', 'vec4');
    const wing = attribute('aWing', 'float');
    const ang = B.y.add(time.mul(A.w));
    const dirSign = A.w.sign();
    const centre = vec2(A.x, A.y);
    const pos2 = centre.add(vec2(cos(ang), sin(ang)).mul(A.z));
    // tiếp tuyến chuyển động (đơn vị)
    const fwd = vec2(sin(ang).negate(), cos(ang)).mul(dirSign);
    const right = vec2(fwd.y.negate(), fwd.x);
    // vỗ cánh + nghiêng mình vào trong vòng bay + lượn nhẹ lên xuống
    const flap = sin(time.mul(9).add(B.y.mul(3)))
      .mul(wing)
      .mul(0.3);
    const bank = dirSign.mul(0.25);
    const lx = positionLocal.x;
    const ly = positionLocal.y.add(flap).add(lx.abs().mul(bank).mul(0.0)).add(lx.mul(bank).mul(0.3));
    const lz = positionLocal.z;
    const near = smoothstep(3.5, 8, length(pos2.sub(vec2(this.focus.x, this.focus.z)))); // thu nhỏ khi gần người chơi
    const s = B.z.mul(near);
    const wx = pos2.x.add(right.x.mul(lx.mul(s)).add(fwd.x.mul(lz.mul(s))));
    const wz = pos2.y.add(right.y.mul(lx.mul(s)).add(fwd.y.mul(lz.mul(s))));
    const wy = B.x.add(sin(time.mul(0.7).add(B.y)).mul(0.8)).add(ly.mul(s));
    this.mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    this.mat.positionNode = vec3(wx, wy, wz);
    this.mat.colorNode = mix(vec3(0.1, 0.11, 0.13), vec3(0.28, 0.3, 0.33), wing.mul(0.6)).mul(float(1));
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(2, this.count));
    // InstancedMesh khởi tạo ma trận bằng 0 (suy biến): đặt đơn vị, vị trí thật tính trong shader
    const id = new THREE.Matrix4();
    for (let i = 0; i < this.mesh.count; i++) this.mesh.setMatrixAt(i, id);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.name = 'lac-kiem-birds';
    this.mesh.frustumCulled = false; // vị trí tính trong shader: hộp bao của hình gốc không đúng
    this.mesh.matrixAutoUpdate = false;
  }

  /** Mỗi khung: vị trí người chơi (thu nhỏ chim đang bay gần). */
  update(x: number, y: number, z: number): void {
    (this.focus.value as THREE.Vector3).set(x, y, z);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
