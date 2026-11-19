import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  clamp,
  cross,
  dot,
  exp,
  float,
  length,
  mix,
  normalize,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { heightAt } from '../base/levelCtx';
import { skyParams } from './sky';

/**
 * Tia sáng xuyên mây (MAP-1 Lạc Kiếm): các dải sáng dài chạy dọc hướng nắng, hạ từ tầng mây xuống núi và sân tông.
 * Một `InstancedMesh` (một draw call). Mỗi dải là một tấm phẳng quay quanh trục của nó về phía camera (cylindrical
 * billboard) nên nhìn từ mọi phía vẫn là một dải sáng mềm. Shader TSL không texture: mép mờ hai bên, tắt dần ở chân
 * và đỉnh, lung linh chậm; đậm hơn khi nhìn về phía mặt trời, mờ đi khi ở sát camera (không thành bức tường sáng).
 * Cộng sáng, không ghi độ sâu, bỏ sương, không vào bloom. Cường độ theo mood (`godRayParams`, đặt ở `tuneAtmosphere`).
 */
export const godRayParams = { intensity: uniform(0.6) };

/** Cường độ theo mood: bình minh/hoàng hôn rõ nhất, trưa nhẹ, đêm chỉ còn vệt trăng. Mood khác = 0 (ẩn). */
export const GOD_RAY_INTENSITY: Record<string, number> = {
  lk_dawn: 1,
  lk_day: 0.5,
  lk_dusk: 1.15,
  lk_night: 0.22,
  tk_dawn: 1,
  tk: 0.6,
  tk_dusk: 1.2,
  tk_night: 0.3,
  kt: 0.85,
  pm: 0.55,
  kn: 0.5,
  tt: 0.4,
  dm_dawn: 1.1,
  dm_day: 0.55,
  dm_dusk: 1.3,
  dm_night: 0.2,
  vh_dawn: 1.1,
  vh_day: 0.55,
  vh_dusk: 1.2,
  vh_night: 0.3,
};

export interface GodRayArea {
  x: number;
  z: number;
  /** Bán kính rải (m). */
  r: number;
  count: number;
}

const MAX_OPACITY = 0.3;
/** Nhân chung sau các hệ số mờ (mép, chân/đỉnh, lung linh, hướng nhìn, xa/gần) vốn nhân nhau còn ~5–15%. */
const OPACITY_GAIN = 1.6;

/** Xorshift32 nhỏ, cho vị trí cố định theo seed (cùng kết quả mỗi lần dựng). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function rayMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const center = attribute('iCenter', 'vec3');
  const prm = attribute('iParams', 'vec4'); // x = dài, y = rộng, z = pha, w = độ mạnh riêng
  // Trục dải: hướng nắng nhưng dựng dốc hơn (nắng thấp thì dải nằm ngang, trông như tấm sáng phẳng); chân ở center, đỉnh ở center + axis * dài.
  const axis = normalize(skyParams.sunDir.mul(vec3(0.5, 0.3, 0.5)).add(vec3(0, 0.85, 0)));
  const t = uv().y;
  const toCam = cameraPosition.sub(center);
  const side = normalize(cross(axis, toCam));
  const widthK = float(0.55).add(t.mul(0.45)); // loe dần lên cao
  const world = center.add(axis.mul(prm.x.mul(t))).add(side.mul(prm.y.mul(widthK).mul(uv().x.sub(0.5))));
  mat.positionNode = world;

  const across = uv().x.sub(0.5).abs().mul(2); // 0 giữa dải, 1 ở mép
  // Mép Gauss (không có cạnh cứng), chân và đỉnh tắt hẳn về 0 nên không lộ đầu tấm phẳng.
  const edge = exp(across.mul(across).mul(-5));
  const along = smoothstep(0, 0.4, t).mul(float(1).sub(smoothstep(0.4, 1, t)));
  const shimmer = sin(time.mul(0.3).add(prm.z).add(t.mul(2.4)))
    .mul(0.5)
    .add(0.5)
    .mul(0.4)
    .add(0.6);
  // Chỉ hiện khi nhìn về phía mặt trời (hướng nhìn gần hướng nắng thật); quay đi thì tắt.
  const viewDir = normalize(center.add(axis.mul(prm.x.mul(0.4))).sub(cameraPosition));
  const facing = smoothstep(0.3, 0.92, dot(viewDir, skyParams.sunDir));
  const dist = length(toCam);
  const nearFade = smoothstep(30, 140, dist);
  const farFade = float(1).sub(smoothstep(900, 1800, dist).mul(0.6));
  mat.opacityNode = clamp(
    edge.mul(along).mul(shimmer).mul(facing).mul(nearFade).mul(farFade).mul(prm.w).mul(godRayParams.intensity).mul(OPACITY_GAIN),
    0,
    MAX_OPACITY,
  );
  // Sắc nắng ấm pha sắc vùng sáng; hơi trắng ở lõi để dải trông như ánh sáng chứ không như sương nhuộm.
  mat.colorNode = mix(skyParams.glow, skyParams.sunColor, 0.5).mul(1.15).add(vec3(0.06));
  return mat;
}

export class GodRays {
  readonly mesh: THREE.InstancedMesh;

  constructor(area: GodRayArea, seed = 20261119) {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    const n = Math.max(1, area.count);
    const center = new Float32Array(n * 3);
    const params = new Float32Array(n * 4);
    const rand = rng(seed);
    for (let i = 0; i < area.count; i++) {
      // Rải đều theo diện tích (căn bậc hai), lệch ngẫu nhiên: chùm tia tụ quanh tông môn và núi lân cận.
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * area.r;
      const x = area.x + Math.cos(a) * rr;
      const z = area.z + Math.sin(a) * rr;
      center.set([x, heightAt(x, z) - 6, z], i * 3);
      const len = 120 + rand() * 160;
      const wid = 5 + rand() * 12;
      params.set([len, wid, rand() * 6.28, 0.45 + rand() * 0.55], i * 4);
    }
    geo.setAttribute('iCenter', new THREE.InstancedBufferAttribute(center, 3));
    geo.setAttribute('iParams', new THREE.InstancedBufferAttribute(params, 4));
    this.mesh = new THREE.InstancedMesh(geo, rayMaterial(), n);
    this.mesh.count = area.count;
    // InstancedMesh khởi tạo ma trận toàn số 0 (thu thành điểm); vị trí đã nằm trong thuộc tính nên dùng ma trận đơn vị.
    const id = new THREE.Matrix4();
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, id);
    this.mesh.name = 'god-rays';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
