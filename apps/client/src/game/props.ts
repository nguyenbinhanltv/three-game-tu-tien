import * as THREE from 'three/webgpu';
import { type AssetCache, type AssetHandle, assets } from './assets';
import { adoptGltfMaterials } from '../render/materials/world';
import { allProps, type PropInstance } from './propScatter';

/**
 * Lớp prop Tripo (P2-A4): mọi instance rải ở `propScatter.ts` gom thành ô 128 m × asset, mỗi ô-asset là một
 * `InstancedMesh` cho từng mức LOD (cùng một `instanceMatrix`, chỉ hiện một mức theo khoảng cách tới camera). Không
 * thêm draw call ngoài tầm nhìn: ô xa hơn `range` bị ẩn; ô trong tầm mới kích hoạt nạp asset (hàng đợi AssetCache ưu
 * tiên theo khoảng cách). Asset nạp lười sau khung đầu, không nằm trong tải đầu.
 */

interface PropCfg {
  /** Khoảng cách vẽ tối đa (m). */
  range: number;
  /** Ngưỡng chuyển LOD0→1, 1→2 (m). */
  lod: [number, number];
  /** Bỏ ở preset Thấp. */
  decor?: boolean;
  /** Đổ bóng (chỉ khi preset có bóng). */
  shadow?: boolean;
}

export const PROP_CFG: Record<string, PropCfg> = {
  prop_co_thu: { range: 520, lod: [90, 220], shadow: true },
  prop_thong_co: { range: 460, lod: [80, 200], shadow: true },
  prop_truc: { range: 220, lod: [40, 100], decor: true },
  prop_da_dung: { range: 300, lod: [60, 140] },
  prop_da_nam: { range: 240, lod: [45, 110] },
  prop_da_phien: { range: 200, lod: [35, 90] },
  prop_den_da: { range: 260, lod: [40, 110] },
  prop_bia_da: { range: 200, lod: [35, 90] },
  prop_tuong_canh: { range: 220, lod: [40, 100] },
  prop_lu_huong: { range: 220, lod: [40, 100] },
  prop_kiem_gay: { range: 260, lod: [45, 120] },
  prop_duong_xi: { range: 120, lod: [20, 55], decor: true },
  prop_lau: { range: 150, lod: [25, 70], decor: true },
};

const CHUNK = 128;
/** Ô trong phạm vi này (cộng đệm) mới nạp asset, để mạng có thời gian trước khi ô vào tầm vẽ. */
const LOAD_MARGIN = 80;

interface LodMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Hình học nướng ra (bản sao không thuộc AssetHandle): phải tự dispose. */
  owned?: boolean;
}

interface Template {
  handle: AssetHandle;
  mats: THREE.MeshStandardNodeMaterial[];
  /** lods[k] = các mesh của mức k. */
  lods: LodMesh[][];
}

interface Cell {
  id: string;
  items: PropInstance[];
  cx: number;
  cz: number;
  /** Bán kính bao ô (để trừ vào khoảng cách). */
  radius: number;
  matrices: THREE.InstancedBufferAttribute | null;
  /** meshes[k] = InstancedMesh các mesh của mức k. */
  meshes: THREE.InstancedMesh[][] | null;
  level: number;
}

const IDENTITY = new THREE.Matrix4();

/**
 * Bản sao hình học với ma trận nút nướng vào đỉnh. Pipeline lượng tử hóa vị trí về int16 chuẩn hóa (KHR_mesh_quantization,
 * nút giữ tỉ lệ + dịch chuyển để giải lượng tử): phải đổi vị trí/pháp tuyến sang float trước, nếu không `applyMatrix4`
 * kẹp giá trị về [-1, 1] và prop bị bẹp.
 */
export function bakeGeometry(src: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const g = src.clone();
  for (const name of ['position', 'normal']) {
    const a = g.getAttribute(name);
    if (!a) continue;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      f[i * 3] = a.getX(i);
      f[i * 3 + 1] = a.getY(i);
      f[i * 3 + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(f, 3));
  }
  g.applyMatrix4(matrix);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class PropLayer {
  readonly group = new THREE.Group();
  private cells: Cell[] = [];
  private templates = new Map<string, Template | 'loading' | 'failed'>();
  private quality = 'medium';
  private shadows = false;
  private acc = 1;
  private disposed = false;
  /** Số InstancedMesh đang hiện (đo draw call). */
  visibleMeshes = 0;

  constructor(
    private cache: AssetCache = assets,
    instances: readonly PropInstance[] = allProps(),
  ) {
    this.group.name = 'props';
    const buckets = new Map<string, Cell>();
    for (const p of instances) {
      if (!PROP_CFG[p.id]) continue;
      const k = `${p.id}|${Math.floor(p.x / CHUNK)}|${Math.floor(p.z / CHUNK)}`;
      let c = buckets.get(k);
      if (!c) {
        c = { id: p.id, items: [], cx: 0, cz: 0, radius: 0, matrices: null, meshes: null, level: -1 };
        buckets.set(k, c);
      }
      c.items.push(p);
    }
    for (const c of buckets.values()) {
      let sx = 0;
      let sz = 0;
      for (const p of c.items) {
        sx += p.x;
        sz += p.z;
      }
      c.cx = sx / c.items.length;
      c.cz = sz / c.items.length;
      for (const p of c.items) c.radius = Math.max(c.radius, Math.hypot(p.x - c.cx, p.z - c.cz) + 12 * p.s);
      this.cells.push(c);
    }
  }

  /** Số liệu cho gỡ lỗi/bench: asset đã nạp/lỗi, ô đang hiện. */
  stats(): { templates: Record<string, string>; cells: number; shown: number; visibleMeshes: number; instances: number } {
    const templates: Record<string, string> = {};
    for (const [k, v] of this.templates) templates[k] = typeof v === 'string' ? v : 'ready';
    return { templates, cells: this.cells.length, shown: this.cells.filter((c) => c.level >= 0).length, visibleMeshes: this.visibleMeshes, instances: this.count };
  }

  get count(): number {
    return this.cells.reduce((n, c) => n + c.items.length, 0);
  }

  setQuality(q: string, shadows: boolean): void {
    this.quality = q;
    this.shadows = shadows;
    this.acc = 1; // cập nhật ngay khung kế
    for (const c of this.cells) if (c.meshes) for (const lv of c.meshes) for (const m of lv) m.castShadow = shadows && !!PROP_CFG[c.id].shadow;
  }

  private rangeScale(): number {
    return this.quality === 'low' ? 0.55 : this.quality === 'high' ? 1.15 : 1;
  }

  /** Gọi mỗi khung: chọn ô trong tầm, nạp asset, đặt mức LOD. Việc nặng chạy ~4 lần/giây. */
  update(dt: number, camX: number, camZ: number): void {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const scale = this.rangeScale();
    let vis = 0;
    for (const c of this.cells) {
      const cfg = PROP_CFG[c.id];
      const d = Math.max(0, Math.hypot(c.cx - camX, c.cz - camZ) - c.radius);
      const range = cfg.range * scale;
      const off = (cfg.decor && this.quality === 'low') || d > range;
      if (off) {
        if (c.meshes) this.setLevel(c, -1);
        if (!cfg.decor || this.quality !== 'low') this.ensureTemplate(c, d < range + LOAD_MARGIN);
        continue;
      }
      const t = this.ensureTemplate(c, true);
      if (!t) continue;
      if (!c.meshes) this.buildCell(c, t);
      const dc = Math.hypot(c.cx - camX, c.cz - camZ);
      const lv = dc < cfg.lod[0] * scale ? 0 : dc < cfg.lod[1] * scale ? 1 : 2;
      this.setLevel(c, Math.min(lv, t.lods.length - 1));
      if (c.meshes && c.level >= 0) vis += c.meshes[c.level].length;
    }
    this.visibleMeshes = vis;
  }

  private ensureTemplate(c: Cell, want: boolean): Template | null {
    const t = this.templates.get(c.id);
    if (t && typeof t !== 'string') return t;
    if (!want || t) return null;
    this.templates.set(c.id, 'loading');
    this.cache
      .acquire(c.id, { pos: { x: c.cx, z: c.cz } })
      .then((handle) => {
        if (this.disposed) {
          handle.release();
          return;
        }
        this.templates.set(c.id, this.templateOf(handle));
        this.acc = 1;
      })
      .catch((e) => {
        console.warn(`[props] không nạp được ${c.id}, bỏ qua`, e);
        this.templates.set(c.id, 'failed');
      });
    return null;
  }

  private templateOf(handle: AssetHandle): Template {
    const mats = adoptGltfMaterials(handle.scene);
    handle.scene.updateMatrixWorld(true);
    const lods: LodMesh[][] = [];
    handle.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const k = (m.userData.lod as number | undefined) ?? 0;
      // Ma trận instance áp trước ma trận nút: nút không phải đơn vị thì nướng vào bản sao hình học.
      const baked = !m.matrixWorld.equals(IDENTITY);
      const geometry = baked ? bakeGeometry(m.geometry, m.matrixWorld) : m.geometry;
      (lods[k] ??= []).push({ geometry, material: m.material as THREE.Material, owned: baked });
    });
    for (let k = 0; k < lods.length; k++) lods[k] ??= lods[Math.max(0, k - 1)] ?? [];
    return { handle, mats, lods: lods.length ? lods : [[]] };
  }

  private buildCell(c: Cell, t: Template): void {
    // WebGPU không vẽ InstancedMesh chỉ có 1 instance (mat4 đơn trong uniform buffer): nhân đôi thành 2 instance trùng khít.
    const n = Math.max(2, c.items.length);
    const arr = new Float32Array(n * 16);
    for (let i = 0; i < n; i++) {
      const p = c.items[Math.min(i, c.items.length - 1)];
      _q.setFromAxisAngle(_up, p.yaw);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.s, p.s, p.s));
      _m.toArray(arr, i * 16);
    }
    c.matrices = new THREE.InstancedBufferAttribute(arr, 16);
    const shadow = this.shadows && !!PROP_CFG[c.id].shadow;
    c.meshes = t.lods.map((meshes) =>
      meshes.map((lm) => {
        const im = new THREE.InstancedMesh(lm.geometry, lm.material, n);
        // Mỗi InstancedMesh một bản ma trận riêng (vài chục byte): dùng chung một thuộc tính giữa các mesh làm WebGPU vẽ lệch.
        im.instanceMatrix = new THREE.InstancedBufferAttribute(arr.slice(), 16);
        im.matrixAutoUpdate = false;
        im.castShadow = shadow;
        im.receiveShadow = this.shadows;
        im.visible = false;
        im.frustumCulled = true;
        this.group.add(im);
        return im;
      }),
    );
  }

  private setLevel(c: Cell, level: number): void {
    if (!c.meshes || c.level === level) return;
    c.level = level;
    c.meshes.forEach((lv, k) => {
      for (const m of lv) m.visible = k === level;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    for (const c of this.cells) {
      if (c.meshes) for (const lv of c.meshes) for (const m of lv) m.dispose();
    }
    for (const t of this.templates.values()) {
      if (typeof t === 'string') continue;
      for (const m of t.mats) m.dispose();
      // `lods[k] ??= lods[k - 1]` có thể dùng chung mảng: gom vào Set trước khi dispose hình học đã nướng.
      const owned = new Set<THREE.BufferGeometry>();
      for (const lv of t.lods) for (const lm of lv) if (lm.owned) owned.add(lm.geometry);
      for (const g of owned) g.dispose();
      t.handle.release();
    }
    this.templates.clear();
    this.cells = [];
  }
}
