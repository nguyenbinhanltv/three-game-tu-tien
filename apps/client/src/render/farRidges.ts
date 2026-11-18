import * as THREE from 'three/webgpu';
import { clamp, dot, float, mix, normalize, positionLocal, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { skyParams } from './sky';

/**
 * Phông xa kiểu sơn thủy (MAP-1): ba lớp dãy núi vòng quanh bản đồ, mỗi lớp xa hơn thì nhạt và xanh hơn, chân núi chìm trong
 * mây (gradient về màu chân trời). Một mặt vòng một mesh (3 draw call), không ánh sáng thật: màu = màu lớp nhân độ sáng của
 * chân trời hiện tại (đêm tối theo, sáng sớm ấm theo) rồi hòa vào `skyParams.horizon`, nên khớp mọi mood.
 * Không bị sương của `scene.fogNode` (xa hơn tầm sương), không ghi độ sâu, vẽ ngay sau bầu trời.
 */

interface Layer {
  radius: number;
  /** Cao đỉnh (m) so với `base`. */
  amp: number;
  /** Cao độ chân. */
  base: number;
  /** Màu đá núi (sRGB) và mức hòa về màu chân trời (0..1). */
  color: number;
  haze: number;
  seed: number;
  freq: number;
}

const LAYERS: Layer[] = [
  { radius: 1700, amp: 520, base: -140, color: 0x4f8f86, haze: 0.38, seed: 3, freq: 7 },
  { radius: 2500, amp: 700, base: -160, color: 0x5f86a6, haze: 0.58, seed: 11, freq: 9 },
  { radius: 3400, amp: 900, base: -180, color: 0x7f9fc2, haze: 0.76, seed: 29, freq: 11 },
];

function hash(i: number, seed: number): number {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Nhiễu 1D tuần hoàn theo góc (chu kỳ `period` ô): nội suy smoothstep. */
function noise1(t: number, period: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(((i % period) + period) % period, seed);
  const b = hash((((i + 1) % period) + period) % period, seed);
  return a + (b - a) * s;
}

/** Đường sống núi: nhiều tầng, đỉnh nhọn (|1 - 2n|) chồng nền thoải. */
function ridge(a: number, layer: Layer): number {
  const t = (a / (Math.PI * 2)) * layer.freq;
  let h = 0.45 * noise1(t, layer.freq, layer.seed);
  h += 0.3 * (1 - Math.abs(1 - 2 * noise1(t * 2.3, layer.freq * 2, layer.seed + 1)));
  h += 0.18 * (1 - Math.abs(1 - 2 * noise1(t * 5.1, Math.round(layer.freq * 5.1), layer.seed + 2)));
  h += 0.07 * noise1(t * 11, layer.freq * 11, layer.seed + 3);
  return Math.pow(h, 1.25);
}

const SEGS = 360;

function ringGeometry(layer: Layer): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    const x = Math.cos(a) * layer.radius;
    const z = Math.sin(a) * layer.radius;
    const top = layer.base + layer.amp * ridge(a, layer);
    pos.push(x, layer.base, z, x, top, z);
    uvs.push(i / SEGS, 0, i / SEGS, 1);
  }
  for (let i = 0; i < SEGS; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function ridgeMaterial(layer: Layer): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false, depthWrite: false });
  const rock = uniform(new THREE.Color(layer.color));
  const horizon = skyParams.horizon;
  const lum = dot(horizon, vec3(0.3, 0.59, 0.11));
  const lit = clamp(lum.mul(1.7), 0.1, 1);
  const v = uv().y;
  // Đỉnh đậm hơn (đá), chân mờ vào mây; phía mặt trời ngả sắc ấm nhẹ.
  const dir = normalize(vec3(positionLocal.x, 0, positionLocal.z));
  const sun = clamp(dot(dir, normalize(vec3(skyParams.sunDir.x, 0, skyParams.sunDir.z))), 0, 1).pow(4);
  const body = mix(rock.mul(lit), skyParams.glow.mul(lit), sun.mul(0.28));
  const haze = clamp(
    float(layer.haze).add(
      float(1)
        .sub(smoothstep(0, 0.7, v))
        .pow(1.4)
        .mul(0.55),
    ),
    0,
    0.97,
  );
  mat.colorNode = mix(body, horizon, haze);
  return mat;
}

export class FarRidges {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(cx: number, cz: number) {
    this.group.name = 'farRidges';
    LAYERS.forEach((layer, i) => {
      const geo = ringGeometry(layer);
      const mat = ridgeMaterial(layer);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, 0, cz);
      mesh.frustumCulled = false;
      mesh.renderOrder = -7 - i; // ngay sau vòm trời (-10); không ghi độ sâu nên lớp xa (i lớn) phải vẽ trước
      this.group.add(mesh);
      this.disposables.push(geo, mat);
    });
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
