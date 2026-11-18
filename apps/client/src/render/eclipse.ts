import * as THREE from 'three/webgpu';
import { clamp, float, length, smoothstep, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { markBloom } from './post';

/**
 * Mặt trời nhật thực của Nhật Thực Kiếp: một đĩa đen che nắng và vành lửa mỏng quanh mép, treo cao phía bắc sân (trên khe Giới Khích).
 * Hai tấm quay về camera (billboard), mỗi tấm một draw call: đĩa tối (pha trộn thường, đọc được trên nền sáng) và vành + quầng (cộng sáng,
 * HDR đỉnh ~2,0 dưới `FX_MAX_HDR`). Không ghi độ sâu, không kiểm độ sâu (như bầu trời: sân kiếp nằm trong lòng chảo có vách cao, đặt trong vách thì bị che hết), bỏ sương.
 * Vì vậy phải đặt ở chỗ nhìn thấy trên vành vách, tránh chồng lên nhân vật.
 * `set(k)`: 0 ẩn, 1 đủ (nhật thực toàn phần). Dựng một lần mỗi lần vào level kiếp, `dispose()` khi rời.
 */
export interface EclipseSun {
  group: THREE.Group;
  set(k: number): void;
  update(cam: THREE.Camera): void;
  dispose(): void;
}

export function buildEclipseSun(x: number, y: number, z: number, radius: number): EclipseSun {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.name = 'eclipse-sun';
  const k = uniform(0);
  const geo = new THREE.PlaneGeometry(2, 2);

  // Đĩa tối: tròn bán kính 0,5 trong tấm (uv 0..1), mép mềm.
  // Đĩa là vật đặc cắt bằng alphaTest (vẽ trong lượt đặc, đầu tiên, nên vách/địa hình vẽ sau đè lên đúng); vành cộng sáng vẽ sau cùng.
  const disc = new THREE.MeshBasicNodeMaterial({ transparent: false, alphaTest: 0.5, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false });
  const d = length(uv().sub(vec2(0.5, 0.5))).mul(2); // 0 tâm … 1 mép tấm
  disc.colorNode = vec3(0.012, 0.006, 0.018);
  disc.opacityNode = float(1).sub(smoothstep(0.5, 0.53, d)).mul(0.97).mul(k);

  // Vành lửa + quầng: sáng nhất ngay ngoài mép đĩa, tan dần ra xa; nhấp nháy chậm.
  const rim = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const out = clamp(d.sub(0.5).div(0.5), 0, 1); // 0 ở mép đĩa … 1 ở mép tấm
  const ring = float(1).sub(smoothstep(0.0, 0.1, out)).mul(smoothstep(0.46, 0.5, d)); // vành sát mép
  const corona = float(1).sub(out).pow(3).mul(smoothstep(0.48, 0.52, d)).mul(0.55);
  const flick = time.mul(1.7).sin().mul(0.08).add(1);
  rim.colorNode = vec3(1.7, 0.62, 0.16).mul(ring.mul(1.2).add(corona)).mul(flick);
  rim.opacityNode = clamp(ring.add(corona), 0, 1).mul(k);
  markBloom(rim, 1);

  const meshes = [disc, rim].map((m, i) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.setScalar(radius * 2.2);
    mesh.frustumCulled = false;
    mesh.renderOrder = -5 + i;
    group.add(mesh);
    return mesh;
  });
  group.visible = false;

  return {
    group,
    set(v) {
      k.value = v;
      group.visible = v > 0.01;
    },
    update(cam) {
      if (!group.visible) return;
      for (const m of meshes) m.quaternion.copy(cam.quaternion);
    },
    dispose() {
      geo.dispose();
      disc.dispose();
      rim.dispose();
    },
  };
}
