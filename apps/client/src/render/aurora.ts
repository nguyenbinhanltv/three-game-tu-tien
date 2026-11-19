import * as THREE from 'three/webgpu';
import { clamp, float, mix, pow, sin, smoothstep, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { vnoise } from './vfx/common';

/**
 * Cực quang Bắc Hoang (MAP-5 PR2): ba tấm rèm cong treo ở chân trời bắc, tia dọc trôi chậm, chân lục lam → đỉnh tím. Một draw call, cộng sáng, không ghi độ sâu,
 * bỏ sương (phải thấy xuyên sương). Bám camera theo x/z (như bầu trời) nên không bao giờ tiến lại gần. Cường độ theo thời điểm (`setIntensity`):
 * đêm rõ, hoàng hôn/bình minh mờ, ban ngày tắt hẳn (mesh ẩn, không tốn).
 */
const RADIUS = 2600;

export class Aurora {
  readonly mesh: THREE.Mesh;
  private readonly amount = uniform(0);
  private readonly violet = uniform(0);
  private geo: THREE.BufferGeometry;
  private mat: THREE.MeshBasicNodeMaterial;

  constructor() {
    // Cung bắc (−z) rộng ~150°, cao 120→1300 m; tạo bằng ống hở rồi cắt bằng thetaStart/thetaLength.
    this.geo = new THREE.CylinderGeometry(RADIUS, RADIUS, 1180, 96, 1, true, Math.PI - 1.3, 2.6);
    this.geo.translate(0, 120 + 590, 0);
    this.mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const a = uv().x;
    const v = uv().y; // 0 chân → 1 đỉnh
    const wave = vnoise(vec2(a.mul(5), time.mul(0.04)));
    const ray = vnoise(vec2(a.mul(70).add(wave.mul(9)), time.mul(0.1)));
    const fold = vnoise(vec2(a.mul(9).add(time.mul(0.03)), v.mul(1.5)));
    const body = pow(float(1).sub(v), 1.2).mul(smoothstep(0.0, 0.08, v));
    const inten = clamp(ray.mul(0.9).add(0.15).mul(fold.mul(0.9).add(0.35)).mul(body), 0, 1.4);
    const green = vec3(0.1, 1.0, 0.55);
    const teal = vec3(0.1, 0.65, 1.0);
    const purple = vec3(0.65, 0.2, 1.3);
    const low = mix(green, teal, smoothstep(0.0, 0.4, v));
    const col = mix(low, purple, smoothstep(0.3, 0.9, v).add(this.violet).clamp(0, 1));
    const edge = smoothstep(0.0, 0.12, a).mul(smoothstep(1.0, 0.88, a));
    const flick = sin(time.mul(0.7).add(a.mul(11)))
      .mul(0.12)
      .add(0.88);
    this.mat.colorNode = col.mul(1.1);
    this.mat.opacityNode = clamp(inten.mul(edge).mul(flick).mul(this.amount), 0, 1);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'bh-aurora';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
  }

  /** `amount` 0..1 (0 = tắt); `violet` 0..1 ngả tím hơn (bên kia khe). */
  setIntensity(amount: number, violet: number): void {
    this.amount.value = amount;
    this.violet.value = violet;
    this.mesh.visible = amount > 0.01;
  }

  update(camPos: THREE.Vector3): void {
    this.mesh.position.set(camPos.x, camPos.y - 40, camPos.z);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Cường độ cực quang theo thời điểm. */
export const AURORA_BY_TOD = { dawn: 0.25, day: 0, dusk: 0.55, night: 1 } as const;
