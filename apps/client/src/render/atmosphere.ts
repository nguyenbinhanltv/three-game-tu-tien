import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraProjectionMatrix,
  clamp,
  exp,
  float,
  Fn,
  length,
  luminance,
  mix,
  modelViewMatrix,
  output,
  positionView,
  positionWorld,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { WATER_Y } from '@dtl/shared';
import { DEPTH_DESATURATE, type GradingPreset } from './grading';
import { markBloom } from './post';
import { applySkyPreset } from './sky';

/**
 * Bầu không khí: sương theo khoảng cách + theo độ cao, giảm bão hòa theo độ sâu, màu đèn/trời theo
 * preset chỉnh màu. Sương là một `scene.fogNode` dùng chung nên áp cho mọi material có `fog: true`
 * (địa hình, kiến trúc, nhân vật, quái), thay cho `FogExp2` phẳng mà `env.ts` đặt.
 */
export const fogParams = {
  color: uniform(new THREE.Color(0xd6e4de)),
  density: uniform(0.0011),
  /** Đáy lớp sương dày (m): thung lũng, mặt hồ. */
  base: uniform(WATER_Y - 6),
  /** Bề dày lớp sương dày (m) phía trên `base`. */
  top: uniform(40),
  /** Hệ số nhân mật độ ở đáy lớp; 1 = tắt sương theo độ cao (preset Thấp). */
  boost: uniform(1.8),
  desatStart: uniform(DEPTH_DESATURATE.start),
  desatEnd: uniform(DEPTH_DESATURATE.end),
  desatAmount: uniform(DEPTH_DESATURATE.amount),
};

let heightFogBoost = 1.8;

const atmosphereFog = Fn(() => {
  const c = output.rgb;
  const dist = positionView.length();
  // Xa thì nhạt màu, ngả về độ sáng (núi xa như nét mực loang), rồi mới hòa vào sương.
  const k = smoothstep(fogParams.desatStart, fogParams.desatEnd, dist).mul(fogParams.desatAmount);
  const desat = mix(c, vec3(luminance(c)), k);
  // Sương theo độ cao: điểm càng thấp (gần đáy lớp) thì mật độ càng lớn.
  const h = clamp(fogParams.base.add(fogParams.top).sub(positionWorld.y).div(fogParams.top), 0, 1);
  const dens = fogParams.density.mul(float(1).add(fogParams.boost.sub(1).mul(h)));
  const f = float(1).sub(exp(dens.mul(dist).pow(2).negate()));
  return vec4(mix(desat, fogParams.color, f), output.a);
});

export interface EnvLike {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
}

/** Áp preset chỉnh màu cho đèn, trời, sương. Gọi lại khi đổi thời điểm trong ngày. */
export function applyAtmosphere(scene: THREE.Scene, env: EnvLike, p: GradingPreset, name: string): void {
  scene.fogNode = atmosphereFog();
  fogParams.color.value.setHex(p.fogColor);
  fogParams.density.value = p.fogDensity;
  fogParams.top.value = p.heightFogTop;
  heightFogBoost = p.heightFogBoost;
  (scene.background as THREE.Color | null)?.setHex?.(p.fogColor);

  env.sun.color.setHex(p.sunColor);
  env.sun.intensity = p.sunIntensity;
  env.hemi.color.setHex(p.skyColor);
  env.hemi.intensity = 1.25 * p.skyIntensity;
  haloParams.intensity.value = HALO_INTENSITY[name] ?? HALO_INTENSITY.day;

  // Vòm trời (render/sky.ts): chân trời trùng màu sương để không lộ mép, quầng nắng theo sắc vùng sáng.
  applySkyPreset(name, p.fogColor, p.highlightTint, p.sunColor);
}

/** Bật/tắt sương theo độ cao (preset Thấp tắt). */
export function setHeightFog(on: boolean): void {
  fogParams.boost.value = on ? heightFogBoost : 1;
}

// ---------- quầng sáng giả quanh đèn ----------

const HALO_INTENSITY: Record<string, number> = { dawn: 0.5, day: 0.3, night: 0.9 };

export const haloParams = {
  color: uniform(new THREE.Color(0xffc985)),
  /** Cường độ: ban ngày nhẹ, đêm rõ. */
  intensity: uniform(0.35),
};

/**
 * Quầng sáng giả (billboard cộng sáng) quanh các đèn: một mesh, một draw call cho mọi đèn.
 * Không đổ sáng thật lên cảnh; mờ dần theo khoảng cách thay cho sương (vì cộng sáng + sương sẽ sáng sai).
 */
export function createLanternHalos(points: readonly { x: number; y: number; z: number }[], size = 2.4): THREE.Mesh {
  const n = points.length;
  const center = new Float32Array(n * 4 * 3);
  const uvs = new Float32Array(n * 4 * 2);
  const index: number[] = [];
  const corners = [0, 0, 1, 0, 1, 1, 0, 1];
  points.forEach((p, i) => {
    for (let k = 0; k < 4; k++) {
      center.set([p.x, p.y, p.z], (i * 4 + k) * 3);
      uvs.set([corners[k * 2], corners[k * 2 + 1]], (i * 4 + k) * 2);
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(center, 3));
  geo.setAttribute('center', new THREE.BufferAttribute(center, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 4 * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const mv = modelViewMatrix.mul(vec4(attribute('center', 'vec3'), 1));
  const off = uv().sub(0.5).mul(size);
  // Kéo quầng về phía camera một chút để không bị khối đèn cắt.
  mat.vertexNode = cameraProjectionMatrix.mul(vec4(mv.x.add(off.x), mv.y.add(off.y), mv.z.add(0.6), 1));
  const d = length(uv().sub(0.5)).mul(2);
  const fade = float(1).sub(smoothstep(60, 220, length(mv.xyz)));
  mat.colorNode = haloParams.color;
  mat.opacityNode = clamp(float(1).sub(d), 0, 1).pow(2).mul(haloParams.intensity).mul(fade);
  markBloom(mat, 0.8);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lantern-halos';
  mesh.renderOrder = 5;
  return mesh;
}
