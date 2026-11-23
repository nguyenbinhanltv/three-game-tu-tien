import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type AssetCache, type AssetHandle } from '../core/assets';
import { adoptGltfMaterials } from '../../render/materials/world';
import { hash01 } from '@dtl/shared';
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

  /** `material`: thay mọi vật liệu của asset bằng vật liệu này (vd. đá PBR của kit); mảnh thiếu màu đỉnh được thêm màu xám trung tính. */
  async add(id: string, places: readonly GlbPlace[], material?: THREE.Material): Promise<void> {
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
    // Prop của kit có node anh em `<tên>_lod1/_lod2` (`userData.lod = k`) trong cùng file: chỉ lấy LOD0, nếu không các mảnh chồng nhau (z-fight) và tam giác nhân ~1,6.
    const isExtraLod = (o: THREE.Object3D): boolean => {
      for (let n: THREE.Object3D | null = o; n; n = n.parent) if (typeof n.userData.lod === 'number' && n.userData.lod > 0) return true;
      return false;
    };
    const box = new THREE.Box3();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !isExtraLod(m)) box.expandByObject(m);
    });
    const size = box.getSize(new THREE.Vector3());
    const dim = Math.max(size.x, size.y, size.z, 1e-6);
    const center = box.getCenter(new THREE.Vector3());
    // đưa gốc về chân giữa hộp bao
    const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || isExtraLod(m)) return;
      const rel = new THREE.Matrix4().multiplyMatrices(toOrigin, m.matrixWorld);
      const g = bakeGeometry(m.geometry, rel);
      if (material) {
        // vật liệu thay thế chỉ cần position/normal/color (float): bỏ uv… và đồng bộ màu đỉnh để các mảnh gộp được
        const n = g.getAttribute('position').count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.fill(0.52 + 0.1 * hash01(i, 3, 9), i * 3, i * 3 + 3); // xám trung tính: sắc đá do texture PBR, bỏ màu đỉnh gốc (ngả cam/rêu)
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      }
      const key = material ?? m.material;
      const list = byMat.get(key) ?? [];
      list.push(g);
      byMat.set(key, list);
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
