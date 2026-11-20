import * as THREE from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  mix,
  normalWorld,
  normalize,
  positionLocal,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { getCloudNoise } from './noiseTex';
import { skyParams } from './sky';

/**
 * Phông xa kiểu sơn thủy (MAP-1): ba lớp dãy núi vòng quanh bản đồ, mỗi lớp xa hơn thì nhạt và xanh hơn, chân núi chìm trong
 * mây (gradient về màu chân trời). Một mặt vòng một mesh (3 draw call), không ánh sáng thật: màu = màu lớp nhân độ sáng của
 * chân trời hiện tại (đêm tối theo, sáng sớm ấm theo) rồi hòa vào `skyParams.horizon`, nên khớp mọi mood.
 * Không bị sương của `scene.fogNode` (xa hơn tầm sương), không ghi độ sâu, vẽ ngay sau bầu trời.
 */

export interface RidgeLayer {
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
  /** Số mũ của đường sống núi (mặc định 1,25): lớn hơn = đỉnh nhọn sắc, thung sâu (kiểu sơn thủy). */
  sharp?: number;
}

const LAYERS: RidgeLayer[] = [
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
function ridge(a: number, layer: RidgeLayer): number {
  const t = (a / (Math.PI * 2)) * layer.freq;
  let h = 0.45 * noise1(t, layer.freq, layer.seed);
  h += 0.3 * (1 - Math.abs(1 - 2 * noise1(t * 2.3, layer.freq * 2, layer.seed + 1)));
  h += 0.18 * (1 - Math.abs(1 - 2 * noise1(t * 5.1, Math.round(layer.freq * 5.1), layer.seed + 2)));
  h += 0.07 * noise1(t * 11, layer.freq * 11, layer.seed + 3);
  return Math.pow(h, layer.sharp ?? 1.25);
}

const SEGS = 360;
const ROWS = 12;

/** Nhiễu 2D tuần hoàn theo góc (cột) và không tuần hoàn theo hàng. */
function noise2(t: number, v: number, period: number, seed: number): number {
  const i = Math.floor(t);
  const j = Math.floor(v);
  const fx = t - i;
  const fy = v - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash((((a % period) + period) % period) * 977 + b * 131, seed);
  const a0 = h(i, j) + (h(i + 1, j) - h(i, j)) * sx;
  const a1 = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
  return a0 + (a1 - a0) * sy;
}

/**
 * Mặt núi có chiều sâu: lưới SEGS × ROWS, mỗi hàng dịch ra/vào theo nhiễu (mỏm đá, hốc, gờ), càng cao càng gồ ghề, nên đường sống
 * và mặt núi có khối thật (shader tô sáng tối theo pháp tuyến hướng nắng) thay vì một tấm phẳng.
 */
function ringGeometry(layer: RidgeLayer): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    const top = layer.base + layer.amp * ridge(a, layer);
    for (let j = 0; j <= ROWS; j++) {
      const t = j / ROWS;
      const period = Math.round(layer.freq * 7);
      const tt = (i / SEGS) * period;
      // Mỏm/hốc: nhiễu hai tần số, biên độ tăng dần theo độ cao; gờ ngang (tầng đá) theo hàng.
      const crag =
        (noise2(tt, t * 5, period, layer.seed + 5) - 0.5) * 2 + 0.5 * (noise2(tt * 3.1, t * 11, period * 4, layer.seed + 9) - 0.5) * 2;
      const ledge = Math.sin(t * 16 + noise2(tt, 0, period, layer.seed + 2) * 6) * 0.04;
      const r = layer.radius + (crag * 0.075 + ledge) * layer.radius * 0.25 * Math.pow(t, 0.8) * (layer.amp / 600);
      const y = layer.base + (top - layer.base) * Math.pow(t, 0.92);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uvs.push(i / SEGS, t);
    }
  }
  const stride = ROWS + 1;
  for (let i = 0; i < SEGS; i++)
    for (let j = 0; j < ROWS; j++) {
      const a = i * stride + j;
      const b = a + stride;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function ridgeMaterial(layer: RidgeLayer): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false, depthWrite: false });
  const rock = uniform(new THREE.Color(layer.color));
  const horizon = skyParams.horizon;
  const noise = getCloudNoise();
  const lum = dot(horizon, vec3(0.3, 0.59, 0.11));
  const lit = clamp(lum.mul(1.7), 0.1, 1);
  const u = uv();
  const v = u.y;
  // Sáng tối theo pháp tuyến hướng nắng (mặt quay về mặt trời sáng, mặt khuất tối và lam hơn): cho núi có khối.
  const nrm = normalize(normalWorld);
  const sunDir = normalize(skyParams.sunDir);
  const lam = clamp(dot(nrm, sunDir).mul(0.5).add(0.5), 0, 1);
  // Vân đá: tầng ngang (theo độ cao + nhiễu) và khe dọc (nhiễu kéo dài theo chiều cao).
  const n1 = texture(noise, vec2(u.x.mul(layer.freq * 5), v.mul(1.4))).g;
  const strata = sin(v.mul(46).add(n1.mul(5)))
    .mul(0.5)
    .add(0.5);
  const fissure = texture(noise, vec2(u.x.mul(layer.freq * 26), v.mul(0.9))).a;
  const detail = float(0.78).add(strata.mul(0.22)).sub(float(1).sub(fissure).mul(0.28));
  const cold = vec3(0.78, 0.9, 1.08);
  const shade = mix(cold.mul(0.62), vec3(1.08, 1.0, 0.9), lam);
  const dir = normalize(vec3(positionLocal.x, 0, positionLocal.z));
  const sun = clamp(dot(dir, normalize(vec3(skyParams.sunDir.x, 0, skyParams.sunDir.z))), 0, 1).pow(4);
  const body = mix(rock.mul(lit).mul(shade).mul(detail), skyParams.glow.mul(lit), sun.mul(0.22));
  // Chân núi chìm trong mây; mây cuộn giữa sườn trôi chậm theo nhiễu.
  const drift = texture(noise, vec2(u.x.mul(layer.freq * 3).add(time.mul(0.004)), v.mul(2.2))).a;
  const rolling = smoothstep(0.45, 0.85, drift)
    .mul(float(1).sub(smoothstep(0.25, 0.75, v)))
    .mul(0.5);
  const haze = clamp(
    float(layer.haze)
      .add(
        float(1)
          .sub(smoothstep(0, 0.7, v))
          .pow(1.4)
          .mul(0.5),
      )
      .add(rolling),
    0,
    0.97,
  );
  mat.colorNode = mix(body, horizon, haze);
  return mat;
}

export class FarRidges {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(cx: number, cz: number, layers: RidgeLayer[] = LAYERS) {
    this.group.name = 'farRidges';
    layers.forEach((layer, i) => {
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
