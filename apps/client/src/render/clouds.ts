import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  float,
  Fn,
  length,
  mix,
  normalize,
  positionWorld,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { FOREST, heightAt, LAKE, VALLEY, WORLD_SIZE } from '@dtl/shared';
import { getCloudNoise } from './noiseTex';
import { skyParams } from './sky';

/**
 * Biển mây dưới núi (Vân Lam): vài mặt phẳng mây nằm ngang theo camera, nhiễu cuộn trong không gian thế
 * giới nên không trượt khi camera đi. Mỗi lớp một độ cao và một tốc độ trôi riêng nên đứng trên đỉnh thấy
 * parallax. Chỉ vẽ mặt TRÊN: người ở thung lũng nhìn lên không thấy "trần mây", chỉ thấy khi ở trên lớp
 * mây (sân tông môn, đỉnh núi, ngự kiếm).
 *
 * Mây chỉ dày ở nơi đất nằm thấp hơn lớp mây (đất cao chạm lớp mây thì mỏng dần, đỉnh núi nhô khỏi mây),
 * và tắt quanh các khu chơi chính (thung lũng, rừng, hồ) để nhìn rõ mặt đất. Hai thông tin đó nướng một lần
 * vào texture RG thô 16 m/ô. Màu mây ăn theo sương (xa thì hòa vào sương qua `scene.fogNode`) và ánh nắng.
 */
const GRID = 256;
const LAYERS = [
  { y: 96, alpha: 0.95, scale: 1 / 420, speed: 1.0, seed: 0 },
  { y: 108, alpha: 0.8, scale: 1 / 340, speed: 1.6, seed: 0.37 },
  { y: 121, alpha: 0.62, scale: 1 / 280, speed: 2.4, seed: 0.71 },
] as const;

let worldTex: THREE.DataTexture | null = null;
let hMin = 0;
let hMax = 1;

/** R = độ cao đất (chuẩn hóa theo khoảng min..max), G = hệ số che các khu chơi (0 trong khu, 1 ở ngoài). */
function getWorldMask(): THREE.DataTexture {
  if (worldTex) return worldTex;
  const hs = new Float32Array(GRID * GRID);
  hMin = Infinity;
  hMax = -Infinity;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const h = heightAt(((i + 0.5) / GRID) * WORLD_SIZE, ((j + 0.5) / GRID) * WORLD_SIZE);
      hs[j * GRID + i] = h;
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }
  const data = new Uint8Array(GRID * GRID * 4);
  // [khu, bắt đầu hòa, hết hòa] theo tỉ lệ outerR: tâm khu hoàn toàn không mây.
  const zones: [typeof VALLEY, number, number][] = [
    [VALLEY, 0.3, 0.8],
    [FOREST, 0.5, 1.0],
    [LAKE, 0.62, 1.12],
  ];
  const ss = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = ((i + 0.5) / GRID) * WORLD_SIZE;
      const z = ((j + 0.5) / GRID) * WORLD_SIZE;
      let m = 1;
      for (const [f, a, b] of zones) m = Math.min(m, ss(f.outerR * a, f.outerR * b, Math.hypot(x - f.x, z - f.z)));
      const k = (j * GRID + i) * 4;
      data[k] = ((hs[j * GRID + i] - hMin) / (hMax - hMin)) * 255;
      data[k + 1] = m * 255;
      data[k + 3] = 255;
    }
  }
  worldTex = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat);
  worldTex.wrapS = worldTex.wrapT = THREE.ClampToEdgeWrapping;
  worldTex.magFilter = worldTex.minFilter = THREE.LinearFilter;
  worldTex.generateMipmaps = false;
  worldTex.colorSpace = THREE.NoColorSpace;
  worldTex.needsUpdate = true;
  return worldTex;
}

export const cloudParams = {
  /** Sắc đáy mây (phần khuất nắng): lạnh, trùng bóng ngọc lam. */
  shade: uniform(new THREE.Color(0x7d99a3)),
  /** Hệ số bật/tắt toàn bộ (preset). */
  enabled: uniform(1),
};

function layerMaterial(layer: (typeof LAYERS)[number]): THREE.MeshBasicNodeMaterial {
  const noise = getCloudNoise();
  const world = getWorldMask();
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide });
  const range = Math.max(1, hMax - hMin);
  const ly = float(layer.y);
  const shaded = Fn(() => {
    const p = positionWorld.xz;
    const t = time.mul(layer.speed);
    const drift = vec2(t.mul(0.9), t.mul(0.35)).add(layer.seed * 40);
    const q = p.add(drift.mul(1.0)).mul(layer.scale);
    // Hai tầng nhiễu: khối lớn quyết định hình, khối nhỏ làm mép xù.
    const big = texture(noise, q).r;
    const mid = texture(noise, q.mul(2.7).add(vec2(0.31, 0.77))).g;
    const fine = texture(noise, q.mul(7.3).add(vec2(0.62, 0.15))).b;
    const body = big.mul(0.62).add(mid.mul(0.28)).add(fine.mul(0.1));
    const dens = smoothstep(0.4, 0.66, body);

    // Mặt nạ theo đất: đất thấp hơn lớp mây thì dày, đất chạm lớp mây thì tan; tắt quanh khu chơi.
    const wuv = p.div(WORLD_SIZE);
    const w = texture(world, wuv);
    const ground = w.r.mul(range).add(hMin);
    const thick = smoothstep(-2, 26, ly.sub(ground));
    const zone = w.g;

    // Tắt dần khi camera tới sát lớp mây (không bị "đâm" mây gắt) và ở xa quá.
    const dy = cameraPosition.y.sub(ly);
    const above = smoothstep(2, 14, dy);
    const near = smoothstep(18, 90, length(positionWorld.sub(cameraPosition)));

    // Tự đổ bóng: lấy mẫu lùi về phía mặt trời; chỗ mây dày hơn phía nắng thì tối.
    const sunXZ = normalize(vec3(skyParams.sunDir.x, 0.0001, skyParams.sunDir.z)).xz;
    const q2 = q.add(sunXZ.mul(34 * layer.scale));
    const big2 = texture(noise, q2).r;
    const lit = clamp(float(0.62).add(big.sub(big2).mul(7)).add(fine.sub(0.5).mul(0.3)), 0, 1);

    const sunUp = clamp(skyParams.sunDir.y.mul(2.2).add(0.35), 0.35, 1);
    const litCol = mix(vec3(1), skyParams.glow, 0.3).mul(sunUp.mul(0.3).add(0.95));
    const shadeCol = cloudParams.shade;
    // Mép mây (mật độ thấp) sáng hơn, lõi dày hơi xám.
    const col = mix(shadeCol, litCol, lit).mul(mix(1.08, 0.96, dens));
    const a = dens.mul(thick).mul(zone).mul(above).mul(near).mul(layer.alpha).mul(cloudParams.enabled);
    return vec4(col, a);
  })();
  mat.colorNode = shaded.rgb;
  mat.opacityNode = shaded.a;
  return mat;
}

export class CloudSea {
  group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.rotateX(-Math.PI / 2);
    LAYERS.forEach((l, i) => {
      const m = new THREE.Mesh(geo, layerMaterial(l));
      m.scale.set(7000, 1, 7000);
      m.position.y = l.y;
      m.frustumCulled = false;
      // Trước mọi VFX (renderOrder 0, mực -2) để VFX không bị mây phủ lên; lớp cao vẽ sau lớp thấp.
      m.renderOrder = -9 + i;
      m.name = `cloud-sea-${i}`;
      this.meshes.push(m);
      this.group.add(m);
    });
    this.group.name = 'cloud-sea';
    this.setQuality('medium');
  }

  /** Thấp: 1 lớp; Vừa: 2 lớp; Cao: 3 lớp. */
  setQuality(preset: string): void {
    const n = preset === 'low' ? 1 : preset === 'high' ? 3 : 2;
    this.meshes.forEach((m, i) => (m.visible = i < n));
  }

  /** Mặt phẳng bám camera theo x,z (nhiễu tính theo tọa độ thế giới nên không trượt). */
  update(camera: THREE.Camera): void {
    this.group.position.set(camera.position.x, 0, camera.position.z);
  }

  dispose(): void {
    for (const m of this.meshes) (m.material as THREE.Material).dispose();
    this.meshes[0]?.geometry.dispose();
    worldTex?.dispose();
    worldTex = null;
  }
}
