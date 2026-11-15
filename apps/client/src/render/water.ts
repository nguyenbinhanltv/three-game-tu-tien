import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  dot,
  float,
  Fn,
  length,
  max,
  mix,
  normalize,
  pow,
  positionWorld,
  reflect,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { heightAt, LAKE, LAKE_WATER_R, WATER_Y } from '@dtl/shared';
import { getCloudNoise, getWaterNormals } from './noiseTex';
import { skyParams } from './sky';

/**
 * Mặt hồ sương (Hàn Giao) bằng TSL, không SSR:
 *  - màu thân nước theo độ sâu thật của đáy hồ (nước nông → nước ngọc → nước sâu, bảng màu art bible);
 *  - phản chiếu trời giả theo Fresnel: gradient trời + quầng nắng + vệt nắng bóng, hướng mặt trời lấy từ `skyParams`;
 *  - sóng nhỏ: hai bản đồ pháp tuyến cuộn ngược chiều, nhỏ dần theo khoảng cách để không lấp lánh;
 *  - bọt mép theo độ sâu (nhiễu làm đứt đoạn, nhịp sóng vỗ nhẹ), mép nước mờ dần chứ không cắt gắt;
 *  - sương mỏng trên mặt hồ: một/hai đĩa cộng nhiễu cuộn, mờ khi camera sát hoặc ngang tầm.
 * Độ sâu đọc từ texture 8 bit nướng một lần từ `heightAt` quanh hồ (~3,5 m/ô).
 * Mức chi tiết: 0 (Thấp) một lớp sóng, không sương; 1 (Vừa) hai lớp sóng + bọt nhiễu + một lớp sương;
 * 2 (Cao) thêm khúc xạ giả (lệch tra độ sâu theo sóng) + vân sáng đáy + hai lớp sương.
 */
const GRID = 256;
const HALF = LAKE_WATER_R + 24;
const D_MIN = -6;
const D_MAX = 20;

let depthTex: THREE.DataTexture | null = null;

function getDepthTexture(): THREE.DataTexture {
  if (depthTex) return depthTex;
  const data = new Uint8Array(GRID * GRID * 4);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = LAKE.x - HALF + ((i + 0.5) / GRID) * HALF * 2;
      const z = LAKE.z - HALF + ((j + 0.5) / GRID) * HALF * 2;
      const d = WATER_Y - heightAt(x, z);
      const k = (j * GRID + i) * 4;
      data[k] = (Math.max(D_MIN, Math.min(D_MAX, d)) - D_MIN) / (D_MAX - D_MIN) * 255;
      data[k + 3] = 255;
    }
  }
  depthTex = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat);
  depthTex.wrapS = depthTex.wrapT = THREE.ClampToEdgeWrapping;
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.generateMipmaps = false;
  depthTex.colorSpace = THREE.NoColorSpace;
  depthTex.needsUpdate = true;
  return depthTex;
}

export const waterParams = {
  shallow: uniform(new THREE.Color(0x4fb3aa)),
  mid: uniform(new THREE.Color(0x1c7f8c)),
  deep: uniform(new THREE.Color(0x0a3644)),
  foam: uniform(new THREE.Color(0xe9f3ee)),
};

/** Độ sâu (m) tại điểm thế giới `p` (xz); âm = trên cạn. `offset` lệch uv để giả khúc xạ. */
type TNode = ReturnType<typeof float>;
const depthAt = (tex: THREE.Texture, p: TNode, offset?: TNode) => {
  let uvn = p.sub(vec2(LAKE.x - HALF, LAKE.z - HALF)).div(HALF * 2);
  if (offset) uvn = uvn.add(offset);
  return texture(tex, uvn).r.mul(D_MAX - D_MIN).add(D_MIN);
};

function waterMaterial(level: 0 | 1 | 2): THREE.MeshBasicNodeMaterial {
  const dTex = getDepthTexture();
  const nTex = getWaterNormals();
  const cTex = getCloudNoise();
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const shaded = Fn(() => {
    const p = positionWorld.xz;
    const toCam = cameraPosition.sub(positionWorld);
    const dist = length(toCam);
    const V = toCam.div(dist);
    const t = time;

    // Sóng nhỏ: pháp tuyến từ hai lớp cuộn ngược chiều, nhỏ dần ở xa.
    const far = float(1).sub(smoothstep(60, 420, dist).mul(0.75));
    const n1 = texture(nTex, p.mul(0.05).add(vec2(t.mul(0.011), t.mul(0.007)))).rg.sub(0.5).mul(2);
    let nxz = n1.mul(0.55);
    if (level >= 1) {
      const n2 = texture(nTex, p.mul(0.13).add(vec2(t.mul(-0.016), t.mul(0.012)).add(0.37))).rg.sub(0.5).mul(2);
      nxz = nxz.add(n2.mul(0.32));
    }
    const N = normalize(vec3(nxz.x.mul(far), 1, nxz.y.mul(far)));

    // Độ sâu đáy; ở mức Cao lệch tra cứu theo pháp tuyến để đáy "rung" như qua mặt nước.
    const depth = level >= 2 ? depthAt(dTex, p, nxz.mul(0.0028)) : depthAt(dTex, p);
    const d0 = depthAt(dTex, p);

    // Thân nước theo độ sâu.
    const body0 = mix(waterParams.shallow, waterParams.mid, smoothstep(0.1, 2.2, depth));
    const body = mix(body0, waterParams.deep, smoothstep(2.5, 11, depth)).toVar();
    // Ánh nắng khuếch tán lên thân nước (mặt trời thấp thì tối hơn), pha chút sương nền.
    const sunTerm = clamp(dot(N, skyParams.sunDir), 0, 1);
    body.assign(body.mul(float(0.7).add(sunTerm.mul(0.4))));
    body.assign(mix(body, skyParams.horizon, 0.02));
    if (level >= 2) {
      // Vân sáng dưới đáy nông (caustics).
      const c1 = texture(nTex, p.mul(0.34).add(vec2(t.mul(0.03), t.mul(-0.022)))).b;
      const c2 = texture(nTex, p.mul(0.29).add(vec2(t.mul(-0.025), t.mul(0.018)).add(0.5))).b;
      const veins = smoothstep(0.62, 0.92, float(1).sub(c1.sub(c2).abs().mul(4.2)));
      body.addAssign(waterParams.shallow.mul(veins).mul(float(1).sub(smoothstep(0.3, 4.5, d0))).mul(0.32));
    }

    // Phản chiếu trời + vệt nắng.
    const R = reflect(V.negate(), N);
    const ry = max(R.y, 0);
    const sky = mix(skyParams.horizon, skyParams.top, pow(smoothstep(0, 0.75, ry), 0.55));
    const sd = max(dot(R, skyParams.sunDir), 0);
    const glint = pow(sd, 220).mul(3.2).add(pow(sd, 18).mul(0.22));
    const refl = sky.add(skyParams.sunColor.mul(glint));

    // Fresnel (Schlick) có nâng nhẹ để hồ lên màu trời ở góc nhìn thấp.
    const cosT = clamp(dot(N, V), 0, 1);
    const fres = clamp(float(0.03).add(pow(float(1).sub(cosT), 4).mul(0.97)).mul(1.1).add(0.03), 0, 1);
    const col = mix(body, refl, fres).toVar();

    // Bọt mép: đứt đoạn theo nhiễu, nhịp sóng vỗ nhẹ.
    const breakup = level >= 1 ? texture(cTex, p.mul(0.07).add(vec2(t.mul(0.004), 0))).b : float(0.5);
    const breakup2 = level >= 1 ? texture(cTex, p.mul(0.19).add(vec2(0, t.mul(-0.006)))).g : float(0.5);
    const lap = sin(t.mul(0.9).add(breakup.mul(9))).mul(0.14);
    const edge = float(1).sub(smoothstep(0.02, 0.95, d0.add(breakup2.sub(0.5).mul(0.9)).add(lap)));
    const foam = clamp(edge.mul(smoothstep(0.28, 0.6, breakup.mul(0.55).add(breakup2.mul(0.6)))), 0, 1)
      .add(float(1).sub(smoothstep(0.0, 0.22, d0)).mul(0.55))
      .clamp(0, 1);
    col.assign(mix(col, waterParams.foam.mul(mix(1, 1.15, sunTerm)), foam.mul(0.85)));

    // Độ trong: nông thì trong, sâu và góc thấp thì đục; mép gặp bờ mờ dần.
    const a0 = mix(0.62, 0.97, smoothstep(0.0, 4.5, d0));
    const alpha = max(max(a0, fres.mul(0.92)), foam).mul(smoothstep(-0.15, 0.3, d0));
    return vec4(col, alpha);
  })();
  mat.colorNode = shaded.rgb;
  mat.opacityNode = shaded.a;
  return mat;
}

function mistMaterial(heightOffset: number, seed: number, strength: number): THREE.MeshBasicNodeMaterial {
  const dTex = getDepthTexture();
  const cTex = getCloudNoise();
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const py = WATER_Y + heightOffset;
  const shaded = Fn(() => {
    const p = positionWorld.xz;
    const t = time;
    const q = p.mul(1 / 240).add(vec2(t.mul(0.006 + seed * 0.003), t.mul(-0.0045)).add(seed));
    const a = texture(cTex, q).r;
    const b = texture(cTex, q.mul(2.9).add(vec2(0.4, 0.2))).g;
    const dens = smoothstep(0.38, 0.78, a.mul(0.65).add(b.mul(0.35)));
    const r = length(p.sub(vec2(LAKE.x, LAKE.z))).div(LAKE_WATER_R);
    const edge = float(1).sub(smoothstep(0.55, 1.0, r));
    // Sương bám mặt nước hơn là bờ cạn.
    const wet = smoothstep(-1, 5, depthAt(dTex, p));
    const toCam = positionWorld.sub(cameraPosition);
    const near = smoothstep(70, 300, length(toCam));
    const level = smoothstep(0.6, 3.5, cameraPosition.y.sub(py).abs()).mul(float(1).sub(smoothstep(25, 110, cameraPosition.y.sub(py)).mul(0.8)));
    const warm = pow(max(dot(normalize(vec3(toCam.x, 0.001, toCam.z)), skyParams.sunDir.mul(vec3(1, 0, 1)).normalize().negate()), 0), 3);
    const col = mix(mix(skyParams.horizon, vec3(1), 0.35), skyParams.glow.add(0.2), warm.mul(0.45));
    return vec4(col, dens.mul(edge).mul(wet).mul(near).mul(level).mul(strength));
  })();
  mat.colorNode = shaded.rgb;
  mat.opacityNode = shaded.a;
  return mat;
}

export class Lake {
  group = new THREE.Group();
  water: THREE.Mesh;
  private mists: THREE.Mesh[] = [];
  private mats: (THREE.MeshBasicNodeMaterial | null)[] = [null, null, null];
  private level: 0 | 1 | 2 = 1;

  constructor() {
    const geo = new THREE.CircleGeometry(LAKE_WATER_R, 96);
    geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, this.material(1));
    this.water.position.set(LAKE.x, WATER_Y, LAKE.z);
    this.water.renderOrder = -6; // dưới mọi VFX (0) và mực (-2): hiệu ứng trên hồ không bị nước phủ
    this.water.name = 'lake-water';
    this.group.add(this.water);

    const mgeo = new THREE.CircleGeometry(LAKE_WATER_R * 1.04, 64);
    mgeo.rotateX(-Math.PI / 2);
    [
      { y: 2.2, seed: 0, s: 0.3 },
      { y: 6.5, seed: 0.6, s: 0.2 },
    ].forEach((m, i) => {
      const mesh = new THREE.Mesh(mgeo, mistMaterial(m.y, m.seed, m.s));
      mesh.position.set(LAKE.x, WATER_Y + m.y, LAKE.z);
      mesh.renderOrder = -5 + i;
      mesh.frustumCulled = false;
      mesh.name = `lake-mist-${i}`;
      this.mists.push(mesh);
      this.group.add(mesh);
    });
    this.group.name = 'lake';
    this.setQuality('medium');
  }

  private material(level: 0 | 1 | 2): THREE.MeshBasicNodeMaterial {
    return (this.mats[level] ??= waterMaterial(level));
  }

  setQuality(preset: string): void {
    this.level = preset === 'low' ? 0 : preset === 'high' ? 2 : 1;
    this.water.material = this.material(this.level);
    const n = this.level === 0 ? 0 : this.level === 1 ? 1 : 2;
    this.mists.forEach((m, i) => (m.visible = i < n));
  }

  /** Mặt nước nhấp nhô rất nhẹ. */
  update(t: number): void {
    this.water.position.y = WATER_Y + Math.sin(t * 0.6) * 0.04;
  }

  dispose(): void {
    for (const m of this.mats) m?.dispose();
    for (const m of this.mists) (m.material as THREE.Material).dispose();
    this.water.geometry.dispose();
    this.mists[0]?.geometry.dispose();
    depthTex?.dispose();
    depthTex = null;
  }
}
