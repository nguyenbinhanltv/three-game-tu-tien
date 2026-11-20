import * as THREE from 'three/webgpu';
import { float, length, mix, positionWorld, smoothstep, texture, time, uniform, vec2, vec3, vertexColor } from 'three/tsl';
import { hash01 } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Lớp núi xa Bắc Hoang (POLISH-1, kiểu sơn thủy nhiều lớp; chỉ để nhìn, không va chạm, tất định): vách nền ngoài vùng chơi trước đây là mảng xanh phẳng không chi tiết.
 * Dựng ở dải đất NGOÀI khung chơi (`playBounds` + đệm) và trong bản đồ:
 *  - ~150 đỉnh nhọn lởm chởm (nón lục giác chia 5 tầng, đỉnh bị xô lệch) màu đá lam xám, đỉnh phủ tuyết (màu đỉnh gradient), vách dựng đứng;
 *  - ba lớp sương chân núi (vành phẳng nhiễu trôi chậm, mờ ở mép trong), màu sương lấy từ cảnh theo thời điểm.
 * Hai draw call cho đỉnh + ba cho sương.
 */

const PEAKS = 150;
const MARGIN = 40;

export interface Peak {
  x: number;
  z: number;
  h: number;
  r: number;
}

/** Điểm ứng viên: ngoài `bounds` (đệm MARGIN) và trong thế giới `size` (chừa `edge`). null nếu không hợp lệ. */
export function peakCandidate(i: number, bounds: { x0: number; z0: number; x1: number; z1: number }, size: number): Peak | null {
  const edge = 30;
  const x = edge + hash01(i, 1, 6101) * (size - 2 * edge);
  const z = edge + hash01(i, 2, 6101) * (size - 2 * edge);
  if (x > bounds.x0 - MARGIN && x < bounds.x1 + MARGIN && z > bounds.z0 - MARGIN && z < bounds.z1 + MARGIN) return null;
  return { x, z, h: 70 + hash01(i, 3, 6101) * 150, r: 36 + hash01(i, 4, 6101) * 50 };
}

export class BhFar {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly mistTint = uniform(new THREE.Color(0.7, 0.75, 0.85));
  private readonly fogRef: () => THREE.Color | null;

  constructor(fogRef: () => THREE.Color | null) {
    this.group.name = 'bh-far';
    this.fogRef = fogRef;
    const T = levelTerrain();
    this.buildPeaks(T.playBounds, T.def.size);
    this.buildMist(T.playBounds);
  }

  private buildPeaks(bounds: { x0: number; z0: number; x1: number; z1: number }, size: number): void {
    // một mẫu đỉnh: nón lục giác 5 tầng, đỉnh xô lệch + răng cưa; màu đỉnh: đá lam xám → tuyết ở 55% chiều cao trở lên
    const SEG = 7;
    const ROWS = 5;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r <= ROWS; r++) {
      const q = r / ROWS;
      const rad = (1 - q) ** 0.85;
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2;
        const jit = 1 + (hash01(r, j, 6201) - 0.5) * 0.55 * (1 - q * 0.4);
        const x = Math.cos(a) * rad * jit + (r === ROWS ? 0 : (hash01(r, j, 6203) - 0.5) * 0.12);
        const z = Math.sin(a) * rad * jit + (r === ROWS ? 0 : (hash01(r, j, 6205) - 0.5) * 0.12);
        const y = q + (hash01(r, j, 6207) - 0.5) * 0.08;
        pos.push(x, y, z);
        const snow = THREE.MathUtils.smoothstep(q, 0.5, 0.68) * (0.75 + hash01(r, j, 6209) * 0.25);
        const rock = 0.5 + hash01(r, j, 6211) * 0.25;
        col.push(0.3 * rock * (1 - snow) + 0.9 * snow, 0.34 * rock * (1 - snow) + 0.92 * snow, 0.44 * rock * (1 - snow) + 0.98 * snow);
      }
      if (r > 0) {
        const a0 = (r - 1) * SEG;
        const a1 = r * SEG;
        for (let j = 0; j < SEG; j++) {
          const k = (j + 1) % SEG;
          idx.push(a0 + j, a0 + k, a1 + j, a0 + k, a1 + k, a1 + j);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const wp = positionWorld;
    const grain = texture(getCloudNoise(), wp.xz.mul(0.05).add(wp.y.mul(0.03))).g;
    mat.colorNode = vertexColor().mul(float(0.8).add(grain.mul(0.4)));
    // đỉnh tuyết còn hắt chút sáng cực quang ban đêm (không tối thành mảng phẳng)
    mat.emissiveNode = vertexColor().mul(0.1);
    const mats: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let i = 1; i < PEAKS * 12 && mats.length < PEAKS; i++) {
      const p = peakCandidate(i, bounds, size);
      if (!p) continue;
      const y = heightAt(p.x, p.z);
      dummy.position.set(p.x, y - 6, p.z);
      dummy.rotation.set(0, hash01(i, 5, 6101) * 6.28, 0);
      dummy.scale.set(p.r, p.h, p.r * (0.7 + hash01(i, 6, 6101) * 0.5));
      dummy.updateMatrix();
      mats.push(dummy.matrix.clone());
    }
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = 'bhfar-peaks';
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  private buildMist(bounds: { x0: number; z0: number; x1: number; z1: number }): void {
    const nzt = getCloudNoise();
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cz = (bounds.z0 + bounds.z1) / 2;
    const half = (bounds.x1 - bounds.x0) / 2;
    for (const [dy, op] of [
      [30, 0.34],
      [75, 0.28],
      [130, 0.22],
    ] as const) {
      const geo = new THREE.RingGeometry(half * 0.82, half * 2.2, 96, 1).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const w = positionWorld.xz;
      const wind = vec2(time.mul(0.005 + dy * 0.00005), time.mul(-0.0025));
      const a = texture(
        nzt,
        w
          .mul(1 / 600)
          .add(wind)
          .add(dy * 0.017),
      ).a;
      const b = texture(nzt, w.mul(1 / 230).sub(wind.mul(1.6))).g;
      const dens = smoothstep(0.42, 0.78, a.mul(0.7).add(b.mul(0.4)));
      const rr = length(w.sub(vec2(cx, cz)));
      mat.colorNode = mix(this.mistTint, vec3(1, 1, 1), b.mul(0.3));
      mat.opacityNode = dens.mul(smoothstep(half * 0.82, half * 1.0, rr)).mul(float(op));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, heightAt(cx, cz) + dy, cz);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      mesh.name = 'bhfar-mist';
      this.group.add(mesh);
      this.disposables.push(geo, mat);
    }
  }

  update(): void {
    const c = this.fogRef();
    if (c) (this.mistTint.value as THREE.Color).copy(c).multiplyScalar(1.2);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
