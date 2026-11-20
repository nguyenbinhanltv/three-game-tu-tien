import * as THREE from 'three/webgpu';
import { float, mix, normalWorld, positionWorld, smoothstep, texture, vec3, vertexColor } from 'three/tsl';
import { hash01 } from '@dtl/shared';
import { heightAt, levelTerrain } from '../../base/levelCtx';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Vách đá thật của Đoạn Mạch (POLISH-1; chỉ để nhìn, KHÔNG va chạm, tất định): GLB `arch_doan_mach` (Blender) là các cụm phiến sa thạch tầng dày mỏng không đều,
 * cột đá gãy bậc và đá viền hồ. Client chọn điểm trên sườn DỐC (pháp tuyến y thấp) quanh và NGOÀI vùng chơi, đặt mỗi cụm sát vách (mặt hướng ra theo pháp tuyến ngang,
 * chân lún vào đất), gộp thành một `InstancedMesh` mỗi biến thể. Không đặt ở nơi đi lại: chỉ sườn dốc ≥ ~48° cách mọi điểm cấm (`exclusions`) và đệm.
 */

export const DM_ORIGIN_MARGIN = 260;
const SEED = 20261121;
const MAX_SLABS = 420;
const MAX_SPIRES = 36;

export interface CliffSpot {
  x: number;
  z: number;
  /** Hướng ra khỏi vách (đơn vị, ngang). */
  nx: number;
  nz: number;
  /** Pháp tuyến thật của vách: thành phần dọc `ny` và độ dài phần ngang `hn` (nx, nz là hướng ngang đơn vị). */
  ny: number;
  hn: number;
  kind: 'slab' | 'spire' | 'boulder';
  variant: number;
  s: number;
}

function normalAt(x: number, z: number, e = 4): { x: number; y: number; z: number } {
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const l = Math.hypot(gx, 1, gz);
  return { x: -gx / l, y: 1 / l, z: -gz / l };
}

/** Điểm đặt cụm đá vách. `free(x, z)` loại chỗ cấm (nơi đi lại). Hàm thuần theo địa hình để test. */
export function cliffSpots(free: (x: number, z: number) => boolean): CliffSpot[] {
  const t = levelTerrain();
  const b = t.playBounds;
  const m = DM_ORIGIN_MARGIN;
  const x0 = Math.max(30, b.x0 - m);
  const x1 = Math.min(t.def.size - 30, b.x1 + m);
  const z0 = Math.max(30, b.z0 - m);
  const z1 = Math.min(t.def.size - 30, b.z1 + m);
  const slabs: CliffSpot[] = [];
  const spires: CliffSpot[] = [];
  let i = 0;
  for (let gx = x0; gx < x1; gx += 14) {
    for (let gz = z0; gz < z1; gz += 14) {
      i++;
      const x = gx + (hash01(i, 1, SEED) - 0.5) * 14;
      const z = gz + (hash01(i, 2, SEED) - 0.5) * 14;
      const n = normalAt(x, z);
      if (n.y > 0.62 || n.y < 0.05) continue; // chỉ sườn dốc (≥ ~51°), không phải vách đứng tuyệt đối (lưới thô)
      const hl = Math.hypot(n.x, n.z);
      if (hl < 0.3) continue;
      if (!free(x, z)) continue;
      const nx = n.x / hl;
      const nz = n.z / hl;
      // vách thật: trước mặt 28 m phải thấp hơn ≥ 16 m (không đặt cụm lớn ở sườn thoải đi lại được)
      if (heightAt(x, z) - heightAt(x + nx * 28, z + nz * 28) < 16) continue;
      // mật độ theo mảng lớn nên cụm đá không phủ đều
      const dens = 0.5 + 0.5 * Math.sin(x * 0.019 + Math.sin(z * 0.013) * 1.6) * Math.sin(z * 0.017 - x * 0.006 + 0.8);
      if (hash01(i, 3, SEED) > 0.7 + dens * 0.6) continue;
      const big = hash01(i, 4, SEED);
      const spire = hash01(i, 5, SEED) < 0.16;
      (spire ? spires : slabs).push({
        x,
        z,
        nx,
        nz,
        ny: n.y,
        hn: hl,
        kind: spire ? 'spire' : 'slab',
        variant: spire ? Math.floor(hash01(i, 6, SEED) * 3) : Math.floor(hash01(i, 6, SEED) * 6),
        s: spire ? 1.6 + big * 1.0 : 2.0 + big * 1.4,
      });
    }
  }
  // giữ MAX theo thứ tự băm (không lấy một vùng liền)
  const trim = <T>(a: T[], max: number): T[] => {
    const arr = a.slice();
    while (arr.length > max) arr.splice(Math.floor(hash01(arr.length, 9, SEED) * arr.length), 1);
    return arr;
  };
  return [...trim(slabs, MAX_SLABS), ...trim(spires, MAX_SPIRES)];
}

/**
 * Vật liệu đá vách thay cho glTF `_cliff`: màu đỉnh (Blender: sa thạch đỏ nâu + vỉa vàng + rêu) nhân hạt đá mịn + nhiễu mảng theo toạ độ thế giới, mặt đứng sẫm hơn,
 * mặt ngửa ngả xanh rêu theo nhiễu; nhám cao.
 */
export function dmMaterialFor(name: string): THREE.Material | null {
  if (!name.endsWith('_cliff')) return null;
  const nz = getCloudNoise();
  const wp = positionWorld;
  const fine = texture(nz, wp.xz.mul(1.5).add(wp.y.mul(1.2))).g;
  const speck = texture(nz, wp.xy.mul(6.0).add(wp.z.mul(3.0))).b;
  const patch = texture(nz, wp.xz.mul(0.07).add(wp.y.mul(0.05))).a;
  const up = smoothstep(0.5, 0.95, normalWorld.y);
  const base = vertexColor()
    .mul(float(0.7).add(fine.mul(0.45)).add(speck.mul(0.18)))
    .mul(float(0.85).add(patch.mul(0.3)));
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.94, metalness: 0, name });
  m.colorNode = mix(base, base.mul(vec3(0.86, 1.04, 0.8)), up.mul(0.4));
  return m;
}

/** Nối từng mesh của GLB với (biến thể, ma trận gốc) rồi dựng InstancedMesh theo biến thể. Trả về nhóm đã dựng. */
export function buildCliffGroup(root: THREE.Object3D, spots: readonly CliffSpot[], shadows: boolean): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out = new THREE.Group();
  out.name = 'doan-mach-cliffs';
  const fwd = new THREE.Vector3(0, 0, 1);
  const nrm = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const meshes: { mesh: THREE.Mesh; variant: string; base: THREE.Matrix4 }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let n: THREE.Object3D | null = mesh;
    let variant = '';
    while (n && n !== root) {
      const mt = /^dm_([a-z]+)(\d+)/.exec(n.name);
      if (mt) {
        variant = `${mt[1]}${mt[2]}`;
        break;
      }
      n = n.parent;
    }
    if (!variant) return;
    meshes.push({ mesh, variant, base: new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld) });
  });
  for (const { mesh, variant, base } of meshes) {
    const mine = spots.filter((s) => `${s.kind}${s.variant}` === variant);
    if (!mine.length) continue;
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mine.length);
    mine.forEach((s, i) => {
      // local +z → hướng ra (nx, nz); xoay quanh y
      // local +z → pháp tuyến THẬT của vách (nghiêng theo dốc): cụm tựa sát mặt vách, chân/lưng chôn vào đất dọc pháp tuyến
      nrm.set(s.nx * s.hn, s.ny, s.nz * s.hn).normalize();
      q.setFromUnitVectors(fwd, nrm);
      const sink = 0.45 * s.s;
      m.compose(
        new THREE.Vector3(s.x - nrm.x * sink, heightAt(s.x, s.z) - nrm.y * sink, s.z - nrm.z * sink),
        q,
        new THREE.Vector3(s.s, s.s, s.s),
      );
      im.setMatrixAt(i, tmp.multiplyMatrices(m, base));
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = shadows;
    im.frustumCulled = false;
    im.name = `dm-${variant}`;
    out.add(im);
  }
  return out;
}
