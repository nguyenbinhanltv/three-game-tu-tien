import * as THREE from 'three/webgpu';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import basisJsUrl from 'three/addons/libs/basis/basis_transcoder.js?url';
import basisWasmUrl from 'three/addons/libs/basis/basis_transcoder.wasm?url';

/**
 * Nạp asset GLB do pipeline (`tools/asset-pipeline`) sinh ra, theo `public/assets/manifest.json`.
 *
 * - Một bản gốc (template) cho mỗi asset id, mỗi lần `acquire` trả về một bản sao dùng chung
 *   geometry/material/texture với bản gốc. Đếm tham chiếu theo id: handle cuối cùng `release`
 *   thì dispose geometry, material và texture của bản gốc (renderer tự giải phóng GPU).
 * - Hàng đợi nạp giới hạn số request song song; yêu cầu gần người xem hơn được nạp trước
 *   (`pos` + `setViewer`), hoặc theo `priority` số nhỏ trước.
 * - Transcoder Basis (KTX2) lấy từ `node_modules/three` qua URL do Vite sinh, phục vụ cùng
 *   origin với bản build; không gọi CDN ngoài. Meshopt decoder nằm sẵn trong JS.
 * - LOD: pipeline để các mức `<tên>_lod<k>` (`userData.lod = k`) cùng file. Bản sao chỉ hiện
 *   LOD0; chọn mức theo khoảng cách là việc M2-9.
 */

/** Một mục trong manifest.json (chỉ những trường client dùng). */
export interface ManifestAsset {
  id: string;
  file: string;
  bytes: number;
  triangles: number;
  skinned: boolean;
  ktx2: boolean;
  lods: { level: number; triangles: number }[];
}

export interface Manifest {
  version: number;
  assets: Record<string, ManifestAsset>;
}

/** Bản sao asset đang dùng. Gọi `release()` đúng một lần khi bỏ khỏi cảnh. */
export interface AssetHandle {
  readonly id: string;
  readonly scene: THREE.Object3D;
  /** Clip dùng chung với bản gốc (không được sửa). */
  readonly animations: readonly THREE.AnimationClip[];
  release(): void;
}

export interface AcquireOptions {
  /** Vị trí asset trong thế giới: gần người xem (`setViewer`) thì nạp trước. */
  pos?: { x: number; z: number };
  /** Ưu tiên khi không có `pos`: số nhỏ nạp trước. Mặc định 0. */
  priority?: number;
}

/** Tiến độ nạp theo byte (kích thước lấy từ manifest), cộng dồn mọi asset đã yêu cầu. */
export interface AssetProgress {
  loaded: number;
  total: number;
}

export interface AssetCacheStats {
  /** Số asset có bản gốc trong bộ nhớ. */
  loaded: number;
  /** Số asset đang chờ hoặc đang nạp. */
  loading: number;
  /** Tổng số handle chưa release. */
  refs: number;
}

type LoadFn = (url: string, onBytes?: (loaded: number) => void) => Promise<GLTF>;

interface Entry {
  id: string;
  refs: number;
  gltf: GLTF | null;
  promise: Promise<GLTF>;
}

interface Job {
  id: string;
  url: string;
  onBytes: (loaded: number) => void;
  pos?: { x: number; z: number };
  priority: number;
  resolve: (g: GLTF) => void;
  reject: (e: unknown) => void;
}

/** URL thư mục asset tĩnh, theo `base` của Vite (CDN đặt qua `base` lúc build). */
export function assetBaseUrl(): string {
  return `${import.meta.env.BASE_URL}assets/`;
}

/** LoadingManager chuyển tên file transcoder Basis sang URL cục bộ do Vite sinh. */
export function localLibsManager(extra: Record<string, string> = {}): THREE.LoadingManager {
  const libs: Record<string, string> = {
    'basis_transcoder.js': basisJsUrl,
    'basis_transcoder.wasm': basisWasmUrl,
    ...extra,
  };
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => libs[url.slice(url.lastIndexOf('/') + 1)] ?? url);
  return manager;
}

/** KTX2Loader dùng transcoder cục bộ; cần `detectSupportAsync(renderer)` trước khi parse texture. */
export function createKtx2Loader(manager = localLibsManager()): KTX2Loader {
  return new KTX2Loader(manager).setTranscoderPath('/libs/');
}

/** GLTFLoader có Meshopt + KTX2 (cấu hình chung cho game và trang xem asset). */
export function createGltfLoader(ktx2: KTX2Loader): GLTFLoader {
  return new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}

/** Dispose geometry, material và texture trong material của một cây object. */
export function disposeObject(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mat);
    const sk = (o as THREE.SkinnedMesh).skeleton;
    if (sk) sk.dispose();
  });
  const texs = new Set<THREE.Texture>();
  for (const mat of mats) {
    for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
  }
  for (const g of geos) g.dispose();
  for (const t of texs) t.dispose();
  for (const mat of mats) mat.dispose();
}

export class AssetCache {
  private entries = new Map<string, Entry>();
  private queue: Job[] = [];
  private active = 0;
  private viewer = { x: 0, z: 0 };
  private bytes = new Map<string, AssetProgress>();
  private manifest: Promise<Manifest> | null = null;
  private ktx2: KTX2Loader | null = null;
  private loader: GLTFLoader | null = null;

  /**
   * `load`/`manifest` thay được để test; mặc định fetch từ `assetBaseUrl()`.
   * `concurrency`: số GLB nạp song song.
   */
  constructor(
    private opts: { base?: string; concurrency?: number; load?: LoadFn; fetchManifest?: () => Promise<Manifest> } = {},
  ) {}

  private get base(): string {
    return this.opts.base ?? assetBaseUrl();
  }

  /**
   * Gắn renderer (mỗi lần tạo renderer mới): KTX2Loader cần biết GPU hỗ trợ định dạng nén nào.
   * Gọi trước `acquire` nếu asset có texture KTX2.
   */
  async attach(renderer: THREE.WebGPURenderer): Promise<void> {
    if (this.opts.load) return;
    if (!this.ktx2) this.ktx2 = createKtx2Loader();
    await this.ktx2.detectSupportAsync(renderer);
  }

  getManifest(): Promise<Manifest> {
    if (!this.manifest) {
      const fetchManifest =
        this.opts.fetchManifest ??
        (async () => {
          // Manifest đổi theo mỗi lần build asset, nên luôn hỏi lại server (GLB thì tên có hash).
          const res = await fetch(`${this.base}manifest.json`, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status} manifest.json`);
          return (await res.json()) as Manifest;
        });
      this.manifest = fetchManifest().catch((e) => {
        this.manifest = null; // lần sau thử lại
        throw e;
      });
    }
    return this.manifest;
  }

  /** Vị trí người xem (camera/người chơi) để xếp hàng nạp theo khoảng cách. */
  setViewer(x: number, z: number): void {
    this.viewer.x = x;
    this.viewer.z = z;
  }

  /** Lấy một bản sao của asset; nạp nếu chưa có. Lỗi (thiếu trong manifest, mạng) thì reject. */
  async acquire(id: string, opts: AcquireOptions = {}): Promise<AssetHandle> {
    let e = this.entries.get(id);
    if (!e) {
      const entry: Entry = { id, refs: 0, gltf: null, promise: null as unknown as Promise<GLTF> };
      entry.promise = this.getManifest()
        .then((m) => {
          const a = m.assets[id];
          if (!a) throw new Error(`asset "${id}" không có trong manifest`);
          const p = { loaded: 0, total: a.bytes };
          this.bytes.set(id, p);
          const onBytes = (n: number) => (p.loaded = Math.min(n, p.total));
          return this.enqueue(id, this.base + a.file, onBytes, opts).then(
            (g) => {
              p.loaded = p.total;
              return g;
            },
            (err) => {
              this.bytes.delete(id);
              throw err;
            },
          );
        })
        .then((g) => {
          entry.gltf = g;
          return g;
        });
      e = entry;
      this.entries.set(id, e);
    } else if (!e.gltf) {
      this.bump(id, opts);
    }
    e.refs++;
    let gltf: GLTF;
    try {
      gltf = await e.promise;
    } catch (err) {
      e.refs--;
      if (this.entries.get(id) === e) this.entries.delete(id);
      throw err;
    }
    return this.instance(e, gltf);
  }

  /** Byte đã nạp / tổng byte của mọi asset từng yêu cầu (cho thanh tiến độ màn tải). */
  progress(): AssetProgress {
    let loaded = 0;
    let total = 0;
    for (const p of this.bytes.values()) {
      loaded += p.loaded;
      total += p.total;
    }
    return { loaded, total };
  }

  stats(): AssetCacheStats {
    let loaded = 0;
    let refs = 0;
    for (const e of this.entries.values()) {
      if (e.gltf) loaded++;
      refs += e.refs;
    }
    return { loaded, loading: this.entries.size - loaded, refs };
  }

  /** Dispose mọi bản gốc đã nạp (dù còn tham chiếu) và KTX2Loader. Dùng khi tắt hẳn trang. */
  disposeAll(): void {
    for (const e of this.entries.values()) if (e.gltf) disposeObject(e.gltf.scene);
    this.entries.clear();
    this.ktx2?.dispose();
    this.ktx2 = null;
    this.loader = null;
  }

  private instance(e: Entry, gltf: GLTF): AssetHandle {
    const src = gltf.scene;
    // Mesh có xương cần SkeletonUtils.clone để bản sao có bộ xương riêng.
    const scene = src.getObjectByProperty('isSkinnedMesh', true) ? cloneSkinned(src) : src.clone(true);
    // Chỉ hiện LOD0 (M2-9 sẽ chọn theo khoảng cách).
    scene.traverse((o) => {
      if (typeof o.userData.lod === 'number' && o.userData.lod > 0) o.visible = false;
    });
    let released = false;
    return {
      id: e.id,
      scene,
      animations: gltf.animations,
      release: () => {
        if (released) return;
        released = true;
        scene.removeFromParent();
        e.refs--;
        if (e.refs <= 0 && this.entries.get(e.id) === e) {
          this.entries.delete(e.id);
          disposeObject(gltf.scene);
        }
      },
    };
  }

  private enqueue(id: string, url: string, onBytes: (n: number) => void, opts: AcquireOptions): Promise<GLTF> {
    return new Promise<GLTF>((resolve, reject) => {
      this.queue.push({ id, url, onBytes, pos: opts.pos, priority: opts.priority ?? 0, resolve, reject });
      this.pump();
    });
  }

  /** Yêu cầu sau cho asset đang chờ: lấy ưu tiên cao hơn của hai lần. */
  private bump(id: string, opts: AcquireOptions): void {
    const j = this.queue.find((q) => q.id === id);
    if (!j) return;
    if (opts.pos && (!j.pos || this.dist(opts.pos) < this.dist(j.pos))) j.pos = opts.pos;
    if (!j.pos && opts.priority !== undefined) j.priority = Math.min(j.priority, opts.priority);
  }

  private dist(p: { x: number; z: number }): number {
    return Math.hypot(p.x - this.viewer.x, p.z - this.viewer.z);
  }

  private rank(j: Job): number {
    return j.pos ? this.dist(j.pos) : j.priority;
  }

  private pump(): void {
    const max = this.opts.concurrency ?? 4;
    while (this.active < max && this.queue.length > 0) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.rank(this.queue[i]) < this.rank(this.queue[best])) best = i;
      const job = this.queue.splice(best, 1)[0];
      this.active++;
      this.load(job.url, job.onBytes)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  private load(url: string, onBytes: (n: number) => void): Promise<GLTF> {
    if (this.opts.load) return this.opts.load(url, onBytes);
    if (!this.loader) {
      if (!this.ktx2) this.ktx2 = createKtx2Loader();
      this.loader = createGltfLoader(this.ktx2);
    }
    return this.loader.loadAsync(url, (ev) => onBytes(ev.loaded));
  }
}

/** Cache dùng chung của game (một trang, một cache; renderer gắn qua `attach`). */
export const assets = new AssetCache();
