import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  clamp,
  exp,
  float,
  Fn,
  length,
  luminance,
  mix,
  modelViewMatrix,
  normalize,
  dot,
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
import { applySkyPreset, skyParams } from './sky';

/**
 * Bầu không khí: sương theo khoảng cách + theo độ cao, giảm bão hòa theo độ sâu, màu đèn/trời theo
 * preset chỉnh màu. Sương là một `scene.fogNode` dùng chung nên áp cho mọi material có `fog: true`
 * (địa hình, kiến trúc, nhân vật, quái), thay cho `FogExp2` phẳng mà `env.ts` đặt.
 */
const fogParams = {
  color: uniform(new THREE.Color(0xd6e4de)),
  density: uniform(0.0011),
  /** Đáy lớp sương dày (m): thung lũng, mặt hồ. */
  base: uniform(WATER_Y - 6),
  /** Bề dày lớp sương dày (m) phía trên `base`. */
  top: uniform(40),
  /** Hệ số nhân mật độ ở đáy lớp; 1 = tắt sương theo độ cao (preset Thấp). */
  boost: uniform(1.8),
  /** Nắng xuyên sương: sương phía mặt trời ngả sắc vùng sáng ấm (cường độ 0 = tắt). */
  glow: uniform(new THREE.Color(0xffd49a)),
  scatter: uniform(0.5),
  /** Sương xa (phối cảnh không khí): mật độ bậc một và khoảng cách bắt đầu (m). 0 = tắt. */
  haze: uniform(0.0012),
  hazeStart: uniform(70),
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
  const near = float(1).sub(exp(dens.mul(dist).pow(2).negate()));
  // Lớp sương xa: bậc một nên núi/rừng ở 200–600 m nhạt dần đều thành từng lớp (bậc hai ở trên gần như chưa ăn tới
  // tầm đó); chỗ thấp dày hơn chỗ cao. Trước `hazeStart` bằng 0 nên tầm chiến đấu không đổi.
  const far = float(1).sub(exp(fogParams.haze.mul(dist.sub(fogParams.hazeStart).max(0)).mul(h.mul(0.5).add(0.5)).negate()));
  const f = float(1).sub(float(1).sub(near).mul(float(1).sub(far)));
  // Tán xạ tới: nhìn về phía mặt trời thì sương ấm vàng, quay lưng thì giữ ngọc lam lạnh.
  const view = normalize(positionWorld.sub(cameraPosition));
  const toSun = dot(view, skyParams.sunDir).max(0).pow(3);
  const fogCol = mix(fogParams.color, fogParams.glow, toSun.mul(fogParams.scatter));
  return vec4(mix(desat, fogCol, f), output.a);
});

/** Viền sáng nhân vật (xem `rimLight` trong render/materials/world.ts). */
export const rimParams = {
  color: uniform(new THREE.Color(0xf2c47e)),
  strength: uniform(0.22),
};

interface EnvLike {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  /** Vector người chơi → mặt trời (Environment.sunDir). */
  sunDir?: THREE.Vector3;
}

/** Hướng nắng giữ phương vị cũ (đông nam), độ cao theo `sunElevationDeg` của preset. */
const SUN_AZIMUTH = Math.atan2(90, 120);
const SUN_DISTANCE = 260;

/** Áp preset chỉnh màu cho đèn, trời, sương. Gọi lại khi đổi thời điểm trong ngày. */
export function applyAtmosphere(scene: THREE.Scene, env: EnvLike, p: GradingPreset, name: string): void {
  scene.fogNode = atmosphereFog();
  tuneAtmosphere(scene, env, p, name);
}

/**
 * Chỉnh lại thông số bầu không khí (sương, nắng, trời) mà KHÔNG dựng lại `fogNode` (không biên dịch lại shader): dùng khi mood đổi dần theo vị trí
 * (Bắc Hoang, DV-3I). `skyTop` ghi đè màu đỉnh trời (đã trộn giữa hai mood).
 */
export function tuneAtmosphere(scene: THREE.Scene, env: EnvLike, p: GradingPreset, name: string, skyTop?: number): void {
  fogParams.color.value.setHex(p.fogColor);
  fogParams.density.value = p.fogDensity;
  fogParams.glow.value.setHex(p.highlightTint);
  fogParams.scatter.value = p.fogScatter ?? 0;
  fogParams.top.value = p.heightFogTop;
  fogParams.haze.value = p.fogHaze ?? 0;
  fogParams.hazeStart.value = p.fogHazeStart ?? 70;
  rimParams.strength.value = p.rim ?? 0;
  // Viền sáng lấy sắc nắng (đêm: sắc trăng), không dùng trắng.
  rimParams.color.value.setHex(p.sunColor);
  heightFogBoost = p.heightFogBoost;
  (scene.background as THREE.Color | null)?.setHex?.(p.fogColor);

  env.sun.color.setHex(p.sunColor);
  env.sun.intensity = p.sunIntensity;
  if (env.sunDir) {
    const el = (p.sunElevationDeg * Math.PI) / 180;
    env.sunDir.set(Math.cos(el) * Math.cos(SUN_AZIMUTH), Math.sin(el), Math.cos(el) * Math.sin(SUN_AZIMUTH)).multiplyScalar(SUN_DISTANCE);
  }
  env.hemi.color.setHex(p.skyColor);
  env.hemi.intensity = 1.25 * p.skyIntensity;
  haloParams.intensity.value = HALO_INTENSITY[name] ?? HALO_INTENSITY.day;
  beaconParams.intensity.value = BEACON_INTENSITY[name] ?? BEACON_INTENSITY.day;

  // Vòm trời (render/sky.ts): chân trời trùng màu sương để không lộ mép, quầng nắng theo sắc vùng sáng.
  applySkyPreset(name, p.fogColor, p.highlightTint, p.sunColor, skyTop);
}

/** Bật/tắt sương theo độ cao (preset Thấp tắt). */
export function setHeightFog(on: boolean): void {
  fogParams.boost.value = on ? heightFogBoost : 1;
}

// ---------- quầng sáng giả quanh đèn ----------

const HALO_INTENSITY: Record<string, number> = {
  dawn: 0.5,
  day: 0.3,
  night: 0.9,
  ochre_dawn: 0.5,
  ochre: 0.3,
  ochre_night: 0.9,
  cloud_dawn: 0.5,
  cloud: 0.3,
  cloud_night: 0.9,
  tk_dawn: 0.6,
  tk: 0.35,
  tk_night: 1.1,
  ash_dawn: 0.5,
  rift: 0.8,
  rift_pit: 0.9,
};

/** Cột linh quang (M-5, render/beacons.ts): yếu ban ngày, rõ ban đêm. */
const BEACON_INTENSITY: Record<string, number> = {
  dawn: 0.5,
  day: 0.3,
  night: 1,
  ochre_dawn: 0.5,
  ochre: 0.3,
  ochre_night: 1,
  cloud_dawn: 0.5,
  cloud: 0.3,
  cloud_night: 1,
  tk_dawn: 0.6,
  tk: 0.35,
  tk_night: 1.1,
  ash_dawn: 0.5,
  rift: 0.55,
  rift_pit: 0.55,
};
export const beaconParams = { intensity: uniform(0.3) };

const haloParams = {
  color: uniform(new THREE.Color(0xffc985)),
  /** Cường độ: ban ngày nhẹ, đêm rõ. */
  intensity: uniform(0.35),
};

/**
 * Quầng sáng giả (billboard cộng sáng) quanh các đèn: một mesh, một draw call cho mọi đèn.
 * Không đổ sáng thật lên cảnh; mờ dần theo khoảng cách thay cho sương (vì cộng sáng + sương sẽ sáng sai).
 */
export function createLanternHalos(
  points: readonly { x: number; y: number; z: number }[],
  size = 2.4,
  tint?: THREE.ColorRepresentation,
): THREE.Mesh {
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
  geo.setAttribute(
    'normal',
    new THREE.BufferAttribute(
      new Float32Array(n * 4 * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  geo.setIndex(index);
  geo.computeBoundingSphere();

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const mv = modelViewMatrix.mul(vec4(attribute('center', 'vec3'), 1));
  const off = uv().sub(0.5).mul(size);
  // Kéo quầng về phía camera một chút để không bị khối đèn cắt.
  mat.vertexNode = cameraProjectionMatrix.mul(vec4(mv.x.add(off.x), mv.y.add(off.y), mv.z.add(0.6), 1));
  const d = length(uv().sub(0.5)).mul(2);
  const fade = float(1).sub(smoothstep(60, 220, length(mv.xyz)));
  const mask = clamp(float(1).sub(d), 0, 1).pow(2).mul(haloParams.intensity).mul(fade);
  // Quầng có màu riêng (tinh thể): nhân màu với mặt nạ tròn để lớp bloom không để lộ ô vuông của tấm billboard.
  mat.colorNode = tint === undefined ? haloParams.color : uniform(new THREE.Color(tint)).mul(mask.mul(1.6));
  mat.opacityNode = mask;
  // Quầng có màu riêng không vào lớp bloom: bloom ghi màu không nhân alpha nên hiện thành ô vuông quanh billboard.
  if (tint === undefined) markBloom(mat, 0.8);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lantern-halos';
  mesh.renderOrder = 5;
  return mesh;
}
