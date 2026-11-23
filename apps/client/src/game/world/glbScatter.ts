import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type AssetCache, type AssetHandle } from '../core/assets';
import { adoptGltfMaterials } from '../../render/materials/world';
import { withSightFade } from './occlusion';
import { bakeGeometry } from './props';

/**
 * Rải prop GLB có sẵn của kit (đá PBR, đèn đá, bia, tre…) chỉ để nhìn: mỗi (asset × vật liệu) một InstancedMesh duy nhất (các mảnh cùng vật liệu
 * gộp lại), vật liệu bọc `withSightFade` (mờ khi che người/mục tiêu). Không va chạm, không đụng server. Kích thước chuẩn hóa theo `h`
 * (cạnh dài nhất của hộp bao, m) vì GLB của kit lượng tử hóa vị trí.
 */
export interface GlbPlace {
  x: number;
  z: number;
  yaw: number;
  /** Cạnh dài nhất sau khi co giãn (m). */
  h: number;
  /** Nghiêng quanh X/Z (rad), mặc định 0. */
  rx?: number;
  rz?: number;
  /** Chôn xuống đất (m), mặc định 0. */
  sink?: number;
}

export class GlbScatter {
  readonly group = new THREE.Group();
  private handles: AssetHandle[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private disposed = false;
  /** Tam giác một bản đặt, cộng dồn theo số bản (để đo ngân sách). */
  tris = 0;

  constructor(
    private readonly cache: AssetCache,
    private readonly ground: (x: number, z: number) => number,
  ) {
    this.group.name = 'glb-scatter';
  }

  async add(id: string, places: readonly GlbPlace[]): Promise<void> {
    if (!places.length) return;
    let handle: AssetHandle;
    try {
      handle = await this.cache.acquire(id, { priority: 60 });
    } catch {
      return; // thiếu asset: bỏ qua, cảnh vẫn dựng được phần còn lại
    }
    if (this.disposed) {
      handle.release();
      return;
    }
    this.handles.push(handle);
    const root = handle.scene;
    const owned = adoptGltfMaterials(root, withSightFade);
    this.mats.push(...owned);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const dim = Math.max(size.x, size.y, size.z, 1e-6);
    const center = box.getCenter(new THREE.Vector3());
    // đưa gốc về chân giữa hộp bao
    const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const rel = new THREE.Matrix4().multiplyMatrices(toOrigin, m.matrixWorld);
      const list = byMat.get(m.material) ?? [];
      list.push(bakeGeometry(m.geometry, rel));
      byMat.set(m.material, list);
    });
    const mw = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const [mat, parts] of byMat) {
      let geo: THREE.BufferGeometry | null = null;
      try {
        geo = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
      } catch {
        geo = null;
      }
      if (!geo) {
        for (const p of parts) p.dispose();
        continue;
      }
      if (parts.length > 1) for (const p of parts) p.dispose();
      this.geos.push(geo);
      const im = new THREE.InstancedMesh(geo, mat, places.length);
      places.forEach((p, i) => {
        e.set(p.rx ?? 0, p.yaw, p.rz ?? 0, 'YXZ');
        q.setFromEuler(e);
        const k = p.h / dim;
        mw.compose(v.set(p.x, this.ground(p.x, p.z) - (p.sink ?? 0), p.z), q, s.set(k, k, k));
        im.setMatrixAt(i, mw);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      im.name = `glb-${id}`;
      this.tris += (geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3) * places.length;
      this.group.add(im);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const c of this.group.children) (c as THREE.InstancedMesh).dispose();
    for (const h of this.handles) h.release();
    this.handles = [];
  }
}
