import { levelId } from '../../base/levelCtx';
import { baseOf } from '../../base/quality';
import * as THREE from 'three/webgpu';
import { type AssetCache, type AssetHandle, assets } from '../core/assets';
import { adoptGltfMaterials } from '../../render/materials/world';
import { allProps, type PropInstance } from './propScatter';
import { ImpostorLayer } from './treeImpostor';
import { withSightFade } from './occlusion';
import { logger } from '../../base/log';

const propsLog = logger('props');

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
  /**
   * Cây (P2-A4b): LOD chọn theo từng cây (khoảng cách tới camera, không theo ô), mesh 3D chỉ ở ô cách camera < `TREE_START`,
   * xa hơn là impostor (`treeImpostor.ts`); mờ khi che giữa camera và nhân vật.
   */
  tree?: boolean;
}

/** Ô cây cách camera dưới ngưỡng này (m, ở preset Vừa) dùng mesh 3D, xa hơn dùng impostor; impostor bỏ ở `TREE_RANGE`. */
const TREE_START = 220;
const TREE_RANGE = 1150;

export const PROP_CFG: Record<string, PropCfg> = {
  prop_co_thu: { range: 520, lod: [55, 125], shadow: true, tree: true },
  prop_thong_co: { range: 460, lod: [45, 110], shadow: true, tree: true },
  prop_soi_nui: { range: 460, lod: [40, 100], shadow: true, tree: true },
  prop_anh_dao: { range: 460, lod: [35, 90], shadow: true, tree: true },
  prop_phong_do: { range: 460, lod: [40, 100], shadow: true, tree: true },
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
  // Đoạn Mạch Cổ Cốc (PROP_LIB, E2-A)
  prop_mach_tinh_tru: { range: 380, lod: [50, 120] },
  prop_tru_nham_do: { range: 420, lod: [60, 140] },
  prop_cau_da_gay: { range: 320, lod: [50, 120] },
  prop_cong_khai_mach: { range: 360, lod: [50, 120] },
  prop_cay_goc_kho: { range: 320, lod: [40, 100] },
  prop_ngung_dan_lo: { range: 150, lod: [25, 70], decor: true },
  // Vân Hải Phù Đảo (PROP_LIB, E3-A)
  prop_phu_dao_dinh: { range: 420, lod: [50, 120] },
  prop_cau_may: { range: 420, lod: [50, 120] },
  prop_kinh_ho_dai: { range: 320, lod: [40, 100] },
  prop_da_troi: { range: 420, lod: [60, 140] },
  prop_tung_phu_dao: { range: 520, lod: [45, 110], shadow: true },
  prop_anh_ngoc_kinh: { range: 150, lod: [25, 70], decor: true },
  // Thiên Khuyết Cổ Thành (PROP_LIB, E4-A)
  prop_tru_da_khac_van: { range: 380, lod: [50, 120] },
  prop_dai_tinh_bai: { range: 360, lod: [50, 120] },
  prop_cong_thanh_vo: { range: 520, lod: [60, 150] },
  prop_tuong_da_vo_si: { range: 420, lod: [60, 140] },
  prop_den_long_troi: { range: 220, lod: [30, 80], decor: true },
};

const CHUNK = 128;
/** Ô trong phạm vi này (cộng đệm) mới nạp asset, để mạng có thời gian trước khi ô vào tầm vẽ. */
const LOAD_MARGIN = 80;

/**
 * Cực cao: hệ số tầm cây/đá/LOD theo bản đồ (Vân Lam, Vân Hải nhiều cây nên thấy rõ nhất; Thiên Khuyết, Bắc Hoang tối,
 * ít cây nên chỉ nhích hơn Cao để khỏi tốn CPU vô ích). Cao là 1,15.
 */
export const ULTRA_RANGE: Record<string, number> = { van_lam: 1.3, van_hai: 1.25, thien_khuyet: 1.2 };
const ULTRA_RANGE_DEFAULT = 1.15;
/** Trần tam giác Cực cao (ngân sách riêng) và ngưỡng điều tiết: vượt `TRI_HIGH` thì co tầm, dưới `TRI_LOW` thì nở lại. */
export const ULTRA_TRI_CAP = 2_500_000;
export const TRI_HIGH = 2_300_000;
export const TRI_LOW = 1_900_000;
const HIGH_SCALE = 1.15;

/** Tầm cây/đá ở Cực cao: hệ số bản đồ × điều tiết, không bao giờ dưới mức Cao. */
export function ultraRangeScale(level: string, govern: number): number {
  return Math.max(HIGH_SCALE, (ULTRA_RANGE[level] ?? ULTRA_RANGE_DEFAULT) * govern);
}

/** Cập nhật hệ số điều tiết theo tải tam giác: co 6% mỗi lần khi > `TRI_HIGH` (tối thiểu 0,6), nở 3% khi < `TRI_LOW`. */
export function governScale(prev: number, tris: number): number {
  if (tris > TRI_HIGH) return Math.max(0.6, prev - 0.06);
  if (tris < TRI_LOW) return Math.min(1, prev + 0.03);
  return prev;
}

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

interface TreeChunk {
  cx: number;
  cz: number;
  items: PropInstance[];
  species: Set<string>;
  /** Ma trận (16 số) và màu (3 số) của từng cây, tính một lần khi cần. */
  mat?: Float32Array;
  col?: Float32Array;
}

/** Một mesh của pool cây: bộ đệm cấp phát một lần, `count` đổi theo số cây đang gán vào mức đó. */
interface TreeSlot {
  im: THREE.InstancedMesh;
  mat: Float32Array;
  col: Float32Array;
}

/** Sức chứa mỗi InstancedMesh của pool (cây gần camera < ~1000 mỗi loài mỗi mức). */
const POOL_CAP = 1024;

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
const _lq = new THREE.Quaternion();
const _lx = new THREE.Vector3(1, 0, 0);
/** Xoay quanh trục đứng theo `yaw`, rồi nghiêng quanh trục ngang cục bộ theo `lean` (cột đổ, tượng nghiêng). */
function setYawLean(q: THREE.Quaternion, p: { yaw: number; lean?: number }): void {
  q.setFromAxisAngle(_up, p.yaw);
  if (p.lean) q.multiply(_lq.setFromAxisAngle(_lx, p.lean));
}

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
  private impostors: ImpostorLayer | null = null;
  /** Cây theo ô 128 m (cùng lưới với ImpostorLayer). */
  private treeChunks = new Map<string, TreeChunk>();
  private treeCount = 0;
  private lastX = 0;
  private lastZ = 0;
  private lastScale = 0;
  private lastVis = 0;
  /** Lần cập nhật trước đã gán đủ cây (không còn chờ asset): mới được bỏ qua khi camera đứng yên. */
  private poolReady = false;
  /** Hệ số điều tiết tầm Cực cao theo tải tam giác (1 = đủ tầm, nhỏ hơn khi gần trần 2,5M). */
  private govern = 1;
  /** pool[id][k] = các InstancedMesh (mỗi mesh của asset ở mức LOD k) dùng chung cho mọi cây loài `id` ở mức k. */
  private pool = new Map<string, TreeSlot[][]>();
  /** Số InstancedMesh đang hiện (đo draw call). */
  visibleMeshes = 0;

  constructor(
    private cache: AssetCache = assets,
    instances: readonly PropInstance[] = allProps(),
  ) {
    this.group.name = 'props';
    const buckets = new Map<string, Cell>();
    const trees: PropInstance[] = [];
    for (const p of instances) {
      if (!PROP_CFG[p.id]) continue;
      if (PROP_CFG[p.id]!.tree) {
        trees.push(p);
        continue;
      }
      const k = `${p.id}|${Math.floor(p.x / CHUNK)}|${Math.floor(p.z / CHUNK)}`;
      let c = buckets.get(k);
      if (!c) {
        c = {
          id: p.id,
          items: [],
          cx: 0,
          cz: 0,
          radius: 0,
          matrices: null,
          meshes: null,
          level: -1,
        };
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
    if (trees.length) {
      for (const p of trees) {
        const k = `${Math.floor(p.x / CHUNK)}|${Math.floor(p.z / CHUNK)}`;
        let ch = this.treeChunks.get(k);
        if (!ch) {
          ch = { cx: (Math.floor(p.x / CHUNK) + 0.5) * CHUNK, cz: (Math.floor(p.z / CHUNK) + 0.5) * CHUNK, items: [], species: new Set() };
          this.treeChunks.set(k, ch);
        }
        ch.items.push(p);
        ch.species.add(p.id);
      }
      this.treeCount = trees.length;
      this.impostors = new ImpostorLayer(trees);
      this.group.add(this.impostors.group);
    }
  }

  /** Số liệu cho gỡ lỗi/bench: asset đã nạp/lỗi, ô đang hiện. */
  stats(): {
    templates: Record<string, string>;
    cells: number;
    shown: number;
    visibleMeshes: number;
    instances: number;
    impostors: number;
  } {
    const templates: Record<string, string> = {};
    for (const [k, v] of this.templates) templates[k] = typeof v === 'string' ? v : 'ready';
    return {
      templates,
      cells: this.cells.length,
      shown: this.cells.filter((c) => c.level >= 0).length,
      visibleMeshes: this.visibleMeshes,
      instances: this.count,
      impostors: this.impostors?.visible ?? 0,
    };
  }

  get count(): number {
    return this.cells.reduce((n, c) => n + c.items.length, this.treeCount);
  }

  setQuality(q: string, shadows: boolean): void {
    this.quality = q;
    this.shadows = shadows;
    this.acc = 1; // cập nhật ngay khung kế
    for (const c of this.cells)
      if (c.meshes) for (const lv of c.meshes) for (const m of lv) m.castShadow = shadows && !!PROP_CFG[c.id]!.shadow;
    this.applyPoolShadows();
  }

  /** Chỉ mức LOD 0 đổ bóng: mức 2 ở xa bóng không thấy rõ, mà pass bóng vẽ cả pool (không cắt theo từng instance). */
  private applyPoolShadows(): void {
    for (const [id, levels] of this.pool) {
      levels.forEach((slots, k) => {
        for (const sl of slots) sl.im.castShadow = this.shadows && !!PROP_CFG[id]!.shadow && k < 1;
      });
    }
  }

  private rangeScale(): number {
    if (this.quality === 'ultra') return ultraRangeScale(levelId(), this.govern);
    const q = baseOf(this.quality);
    return q === 'low' ? 0.55 : q === 'high' ? 1.15 : 1;
  }

  /** Điều tiết cây/đá ở Cực cao theo số tam giác khung vừa vẽ (engine gọi ~10 lần/giây). */
  setTriangleLoad(tris: number): void {
    this.govern = governScale(this.govern, tris);
  }

  /** Gọi mỗi khung: chọn ô trong tầm, nạp asset, đặt mức LOD. Việc nặng chạy ~4 lần/giây. */
  update(dt: number, camX: number, camZ: number): void {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const scale = this.rangeScale();
    let vis = 0;
    for (const c of this.cells) {
      const cfg = PROP_CFG[c.id]!;
      const d = Math.max(0, Math.hypot(c.cx - camX, c.cz - camZ) - c.radius);
      const range = cfg.range * scale;
      const off = (cfg.decor && this.quality === 'low') || d > range;
      if (off) {
        if (c.meshes) this.setLevel(c, -1);
        if (!cfg.decor || this.quality !== 'low') this.ensureTemplate(c.id, c.cx, c.cz, d < range + LOAD_MARGIN);
        continue;
      }
      const t = this.ensureTemplate(c.id, c.cx, c.cz, true);
      if (!t) continue;
      if (!c.meshes) this.buildCell(c, t);
      const dc = Math.hypot(c.cx - camX, c.cz - camZ);
      const lv = dc < cfg.lod[0] * scale ? 0 : dc < cfg.lod[1] * scale ? 1 : 2;
      this.setLevel(c, Math.min(lv, t.lods.length - 1));
      if (c.meshes && c.level >= 0) vis += c.meshes[c.level]!.length;
    }
    if (this.impostors) vis += this.updateTrees(camX, camZ, scale);
    this.visibleMeshes = vis;
  }

  /**
   * Cây gần (ô 128 m có tâm cách camera < `TREE_START`): mỗi cây một mức LOD theo khoảng cách của chính nó, gom vào pool
   * toàn cục (loài × mức) = tối đa 15 InstancedMesh cho cả bản đồ, thay vì một bộ mesh cho mỗi ô. Ô xa hơn do
   * ImpostorLayer vẽ (cùng quy tắc theo ô nên không chồng, không hở). Asset loài nào chưa nạp xong (hoặc lỗi) thì tắt
   * pool và để impostor che cả ở gần. Trả về số mesh đang hiện.
   */
  private updateTrees(camX: number, camZ: number, scale: number): number {
    const start = TREE_START * scale;
    if (this.poolReady && Math.hypot(camX - this.lastX, camZ - this.lastZ) < 2 && scale === this.lastScale) return this.lastVis;
    const near: TreeChunk[] = [];
    let pending = false;
    for (const ch of this.treeChunks.values()) {
      const d = Math.hypot(ch.cx - camX, ch.cz - camZ);
      if (d >= start + LOAD_MARGIN) continue;
      // Chọn theo từng cây (khoảng cách của chính cây < start); ô có tâm trong start + nửa đường chéo ô là ứng viên.
      for (const id of ch.species) if (!this.ensureTemplate(id, ch.cx, ch.cz, true) && d < start + CHUNK * 0.71) pending = true;
      if (d < start + CHUNK * 0.71) near.push(ch);
    }
    this.impostors?.update(camX, camZ, start, TREE_RANGE * scale, pending);
    this.lastX = camX;
    this.lastZ = camZ;
    this.lastScale = scale;
    this.poolReady = !pending;
    // Mọi slot về 0 trước khi gán lại.
    const counts = new Map<TreeSlot, number>();
    for (const levels of this.pool.values()) for (const slots of levels) for (const sl of slots) counts.set(sl, 0);
    if (!pending) {
      for (const ch of near) {
        if (!ch.mat) this.bakeTreeChunk(ch);
        for (let i = 0; i < ch.items.length; i++) {
          const p = ch.items[i]!;
          const levels = this.poolOf(p.id);
          if (!levels) continue;
          const cfg = PROP_CFG[p.id]!;
          const d = Math.hypot(p.x - camX, p.z - camZ);
          if (d >= start) continue;
          const k = Math.min(d < cfg.lod[0] * scale ? 0 : d < cfg.lod[1] * scale ? 1 : 2, levels.length - 1);
          for (const sl of levels[k]!) {
            const n = counts.get(sl) ?? 0;
            if (n >= POOL_CAP) continue;
            sl.mat.set((ch.mat as Float32Array).subarray(i * 16, i * 16 + 16), n * 16);
            sl.col.set((ch.col as Float32Array).subarray(i * 3, i * 3 + 3), n * 3);
            counts.set(sl, n + 1);
          }
        }
      }
    }
    let vis = 0;
    for (const [sl, n] of counts) {
      // WebGPU không vẽ InstancedMesh chỉ có 1 instance: nhân đôi cho tròn 2.
      if (n === 1) {
        sl.mat.copyWithin(16, 0, 16);
        sl.col.copyWithin(3, 0, 3);
      }
      sl.im.count = n === 1 ? 2 : n;
      sl.im.visible = n > 0;
      if (n > 0) {
        (sl.im.instanceMatrix as THREE.InstancedBufferAttribute).addUpdateRange(0, Math.max(n, 2) * 16);
        (sl.im.instanceColor as THREE.InstancedBufferAttribute).addUpdateRange(0, Math.max(n, 2) * 3);
        sl.im.instanceMatrix.needsUpdate = true;
        (sl.im.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
        vis++;
      }
    }
    this.lastVis = vis;
    return vis;
  }

  private bakeTreeChunk(ch: TreeChunk): void {
    ch.mat = new Float32Array(ch.items.length * 16);
    ch.col = new Float32Array(ch.items.length * 3);
    ch.items.forEach((p, i) => {
      setYawLean(_q, p);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.s, p.s * (p.sy ?? 1), p.s));
      _m.toArray(ch.mat as Float32Array, i * 16);
      (ch.col as Float32Array).set(p.tint ?? [1, 1, 1], i * 3);
    });
  }

  /** Pool của loài `id` (dựng lần đầu khi template sẵn sàng); null nếu chưa nạp. */
  private poolOf(id: string): TreeSlot[][] | null {
    const have = this.pool.get(id);
    if (have) return have;
    const t = this.templates.get(id);
    if (!t || typeof t === 'string') return null;
    const shadow = this.shadows && !!PROP_CFG[id]!.shadow;
    // Hình cầu bao rất lớn: ô cây không còn là đơn vị cắt hình, pool luôn nằm quanh camera.
    const sphere = new THREE.Sphere(new THREE.Vector3(2048, 100, 2048), 1e5);
    const levels = t.lods.map((meshes, k) =>
      meshes.map((lm) => {
        const im = new THREE.InstancedMesh(lm.geometry, lm.material, POOL_CAP);
        const mat = new Float32Array(POOL_CAP * 16);
        const col = new Float32Array(POOL_CAP * 3).fill(1);
        im.instanceMatrix = new THREE.InstancedBufferAttribute(mat, 16);
        im.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
        im.boundingSphere = sphere;
        im.matrixAutoUpdate = false;
        im.castShadow = shadow && k < 1;
        im.receiveShadow = this.shadows;
        im.count = 0;
        im.visible = false;
        im.frustumCulled = false;
        this.group.add(im);
        return { im, mat, col };
      }),
    );
    this.pool.set(id, levels);
    return levels;
  }

  private ensureTemplate(id: string, x: number, z: number, want: boolean): Template | null {
    const t = this.templates.get(id);
    if (t && typeof t !== 'string') return t;
    if (!want || t) return null;
    this.templates.set(id, 'loading');
    this.cache
      .acquire(id, { pos: { x, z } })
      .then((handle) => {
        if (this.disposed) {
          handle.release();
          return;
        }
        this.templates.set(id, this.templateOf(handle));
        this.acc = 1;
      })
      .catch((e) => {
        propsLog.warn(`không nạp được ${id}, bỏ qua`, e);
        this.templates.set(id, 'failed');
      });
    return null;
  }

  private templateOf(handle: AssetHandle): Template {
    const mats = adoptGltfMaterials(handle.scene, handle.id && PROP_CFG[handle.id]?.tree ? withSightFade : undefined);
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
    const colArr = new Float32Array(n * 3).fill(1);
    let tinted = false;
    for (let i = 0; i < n; i++) {
      const p = c.items[Math.min(i, c.items.length - 1)]!;
      setYawLean(_q, p);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.s, p.s, p.s));
      _m.toArray(arr, i * 16);
      if (p.tint) {
        tinted = true;
        colArr.set(p.tint, i * 3);
      }
    }
    c.matrices = new THREE.InstancedBufferAttribute(arr, 16);
    const shadow = this.shadows && !!PROP_CFG[c.id]!.shadow;
    c.meshes = t.lods.map((meshes) =>
      meshes.map((lm) => {
        const im = new THREE.InstancedMesh(lm.geometry, lm.material, n);
        // Mỗi InstancedMesh một bản ma trận riêng (vài chục byte): dùng chung một thuộc tính giữa các mesh làm WebGPU vẽ lệch.
        im.instanceMatrix = new THREE.InstancedBufferAttribute(arr.slice(), 16);
        // Sắc độ theo instance (đá vỡ Thiên Khuyết, E4-I): chỉ ô có prop nhuộm mới tốn thêm 12 byte/instance.
        if (tinted) im.instanceColor = new THREE.InstancedBufferAttribute(colArr.slice(), 3);
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
    this.impostors?.dispose();
    this.group.removeFromParent();
    for (const c of this.cells) {
      if (c.meshes) for (const lv of c.meshes) for (const m of lv) m.dispose();
    }
    for (const levels of this.pool.values()) for (const slots of levels) for (const sl of slots) sl.im.dispose();
    this.pool.clear();
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
