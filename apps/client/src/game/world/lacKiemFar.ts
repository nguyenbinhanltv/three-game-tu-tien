import * as THREE from 'three/webgpu';
import { float, length, mix, positionWorld, smoothstep, texture, time, uniform, vec2, vec3 } from 'three/tsl';
import { hash01, playDist, SECT } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Lớp cảnh xa của Lạc Kiếm Tông (POLISH-1; chỉ để nhìn, không va chạm, tất định): đồi xa trước đây là một mặt địa hình mượt không cây không đá.
 *  - cụm tùng xa (một `InstancedMesh`, thân + hai tầng tán nón) mọc theo mật độ nhiễu trên sườn đồi 480–1500 m quanh tông môn;
 *  - gờ đá lộ ra trên sườn dốc (khối góc cạnh dẹt, nghiêng theo dốc), sẫm hơn đất;
 *  - ba lớp sương dải ở các độ cao khác nhau (vành phẳng, nhiễu trôi chậm, mờ ở mép trong) tạo tầng sâu giữa các dãy đồi, lấy màu sương của cảnh.
 */

const TREES = 1800;
const ROCKS = 900;
/** Chỉ rải NGOÀI vùng chơi (khung 2,2 × 2,2 km quanh tông môn, `playDist` ≤ PLAY_HALF) cộng đệm: cây/đá cảnh xa không có va chạm nên không được nằm nơi đi lại. */
export const FAR_MIN_PLAY_DIST = 1160;
const R1 = 2300;

/** Điểm ứng viên ngoài vùng chơi và trong thế giới 4096 m; null nếu rơi vào vùng chơi/ngoài bản đồ. */
export function farCandidate(i: number, salt: number): { x: number; z: number } | null {
  const a = hash01(i, 1, salt) * Math.PI * 2;
  const r = 900 + Math.sqrt(hash01(i, 2, salt)) * (R1 - 900);
  const x = SECT.x + Math.cos(a) * r;
  const z = SECT.z + Math.sin(a) * r;
  if (x < 20 || z < 20 || x > 4076 || z > 4076) return null;
  if (playDist(x, z) < FAR_MIN_PLAY_DIST) return null;
  return { x, z };
}

function ringPoint(i: number, salt: number): { x: number; z: number } | null {
  return farCandidate(i, salt);
}

/** Độ dốc (0 phẳng → 1 đứng) tại điểm, lấy mẫu 6 m. */
function slopeAt(x: number, z: number): number {
  const dx = heightAt(x + 6, z) - heightAt(x - 6, z);
  const dz = heightAt(x, z + 6) - heightAt(x, z - 6);
  return Math.min(1, Math.hypot(dx, dz) / 12);
}

function mergeGeos(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of parts) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

export class LacKiemFar {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly mistTint = uniform(new THREE.Color(0.8, 0.86, 0.94));
  private readonly fogRef: () => THREE.Color | null;

  constructor(fogRef: () => THREE.Color | null) {
    this.group.name = 'lac-kiem-far';
    this.fogRef = fogRef;
    this.buildTrees();
    this.buildRocks();
    this.buildMist();
  }

  private buildTrees(): void {
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
    trunk.translate(0, 2.5, 0);
    parts.push(trunk);
    for (let k = 0; k < 2; k++) {
      const c = new THREE.ConeGeometry(5.2 - k * 1.6, 9, 6);
      c.translate(0, 8 + k * 5.5, 0);
      parts.push(c);
    }
    const geo = mergeGeos(parts);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const dummy = new THREE.Object3D();
    let guard = 0;
    const density = (x: number, z: number): number => hash01(Math.floor(x / 110), Math.floor(z / 110), 4101);
    while (mats.length < TREES && guard++ < TREES * 12) {
      const p = ringPoint(guard, 4001);
      if (!p) continue;
      const s = slopeAt(p.x, p.z);
      // cụm: ô 110 m có mật độ riêng; tránh sườn quá dốc (đá lộ)
      if (s > 0.55 || hash01(guard, 3, 4003) > density(p.x, p.z) * 1.1) continue;
      const y = heightAt(p.x, p.z);
      dummy.position.set(p.x, y - 0.4, p.z);
      dummy.rotation.set(0, hash01(guard, 4, 4005) * 6.28, 0);
      const sc = 1.0 + hash01(guard, 5, 4007) * 0.9;
      dummy.scale.set(sc * (0.85 + hash01(guard, 6, 4009) * 0.3), sc * (0.9 + hash01(guard, 7, 4011) * 0.5), sc);
      dummy.updateMatrix();
      mats.push(dummy.matrix.clone());
      cols.push(new THREE.Color().setHSL(0.33 + hash01(guard, 8, 4013) * 0.05, 0.3, 0.1 + hash01(guard, 9, 4015) * 0.07));
    }
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, cols[i]!);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'lkfar-trees';
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private buildRocks(): void {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const wp = positionWorld;
    const grain = texture(getCloudNoise(), wp.xz.mul(0.35).add(wp.y.mul(0.2))).g;
    mat.colorNode = mix(vec3(0.3, 0.32, 0.34), vec3(0.52, 0.5, 0.46), grain);
    const list: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    let guard = 0;
    while (list.length < ROCKS && guard++ < ROCKS * 30) {
      const p = ringPoint(guard, 4101);
      if (!p) continue;
      if (slopeAt(p.x, p.z) < 0.3) continue;
      const y = heightAt(p.x, p.z);
      dummy.position.set(p.x, y + 0.5, p.z);
      dummy.rotation.set((hash01(guard, 3, 4103) - 0.5) * 0.6, hash01(guard, 4, 4105) * 6.28, (hash01(guard, 5, 4107) - 0.5) * 0.6);
      const sc = 4 + hash01(guard, 6, 4109) * 7;
      dummy.scale.set(
        sc * (1.0 + hash01(guard, 7, 4111)),
        sc * (0.35 + hash01(guard, 8, 4113) * 0.35),
        sc * (0.8 + hash01(guard, 9, 4115) * 0.8),
      );
      dummy.updateMatrix();
      list.push(dummy.matrix.clone());
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'lkfar-rocks';
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private buildMist(): void {
    const nzt = getCloudNoise();
    // [độ cao so với tông môn, bán kính trong, độ mờ]
    for (const [dy, r0, op] of [
      [14, 300, 0.4],
      [48, 420, 0.34],
      [96, 600, 0.28],
    ] as const) {
      const geo = new THREE.RingGeometry(r0, 2400, 96, 1).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const w = positionWorld.xz;
      const wind = vec2(time.mul(0.004 + dy * 0.00004), time.mul(-0.002));
      const a = texture(
        nzt,
        w
          .mul(1 / 700)
          .add(wind)
          .add(dy * 0.013),
      ).a;
      const b = texture(nzt, w.mul(1 / 260).sub(wind.mul(1.6))).g;
      const dens = smoothstep(0.42, 0.78, a.mul(0.7).add(b.mul(0.4)));
      const rr = length(w.sub(vec2(SECT.x, SECT.z)));
      mat.colorNode = mix(this.mistTint, vec3(1, 1, 1), b.mul(0.35));
      mat.opacityNode = dens.mul(smoothstep(r0, r0 + 200, rr)).mul(float(op));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(SECT.x, SECT.y + dy, SECT.z);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      mesh.name = 'lkfar-mist';
      this.group.add(mesh);
      this.disposables.push(geo, mat);
    }
  }

  update(): void {
    const c = this.fogRef();
    if (c) (this.mistTint.value as THREE.Color).copy(c).multiplyScalar(1.15);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
