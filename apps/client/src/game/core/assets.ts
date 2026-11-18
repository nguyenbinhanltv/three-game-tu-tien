import * as THREE from 'three/webgpu';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { HiresCandidate } from '../hires/policy';
import { derivedOf } from '../../render/materials/derived';
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
 *   (`pos` + `setViewer`), hoặc theo `priority` (tính như khoảng cách, mét) số nhỏ trước.
 * - `prefetch` (M6-1) tải trước byte của GLB qua cùng hàng đợi mà chưa parse (chưa cần renderer):
 *   gọi lúc bắt đầu kết nối để mạng chạy song song với lúc CPU dựng thế giới; `acquire` sau đó
 *   parse từ byte đã có.
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
  /** Bậc texture cao tải nền (Cao/Cực cao), xem `game/hires/`. */
  hires?: ManifestHires[];
}

/** Texture bậc cao của một vật liệu (tệp KTX2 rời, `pnpm assets:hires`). */
export interface ManifestHires {
  mat: string;
  slots: string[];
  file: string;
  width: number;
  height: number;
  bytes: number;
  gpuBytes: number;
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
  /**
   * Ưu tiên khi không có `pos`, cùng đơn vị với khoảng cách tới người xem (mét): số nhỏ nạp trước.
   * Mặc định 0 (như thứ ngay cạnh người chơi).
   */
  priority?: number;
}

/** Tiến độ nạp theo byte (kích thước lấy từ manifest), cộng dồn mọi asset đã yêu cầu. */
interface AssetProgress {
  loaded: number;
  total: number;
}

interface AssetCacheStats {
  /** Số asset có bản gốc trong bộ nhớ. */
  loaded: number;
  /** Số asset đang chờ hoặc đang nạp. */
  loading: number;
  /** Tổng số handle chưa release. */
  refs: number;
}

type LoadFn = (url: string, onBytes?: (loaded: number) => void) => Promise<GLTF>;
type FetchFn = (url: string, onBytes: (loaded: number) => void) => Promise<ArrayBuffer>;
type ParseFn = (data: ArrayBuffer, url: string) => Promise<GLTF>;

export interface HiresApplied {
  tex: THREE.Texture;
  gpuBytes: number;
  swaps: { mat: THREE.Material; slot: string; old: THREE.Texture }[];
}

interface Entry {
  id: string;
  refs: number;
  gltf: GLTF | null;
  promise: Promise<GLTF>;
  /** Bản sao đang dùng (để biết asset ở gần người xem không). */
  handles: Set<THREE.Object3D>;
  /** Bản đang vẽ do nơi dùng tự clone từ bản mẫu (quái/nhân vật), khai báo bằng `trackInstance`. */
  tracked: Set<WeakRef<THREE.Object3D>>;
  /** Texture bậc cao đã thay, theo tệp. */
  hires: Map<string, HiresApplied>;
}

interface Job {
  id: string;
  pos?: { x: number; z: number };
  priority: number;
  run: () => Promise<void>;
}

/** Tải cả file, báo số byte đã về theo từng đoạn (cho thanh tiến độ). */
async function fetchBytes(url: string, onBytes: (loaded: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  if (!res.body) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded);
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out.buffer;
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

type Ktx2Config = Record<'astcSupported' | 'astcHDRSupported' | 'etc1Supported' | 'etc2Supported' | 'dxtSupported' | 'bptcSupported' | 'pvrtcSupported', boolean>;
type Ktx2Internals = { workerConfig: Ktx2Config | null; _createTexture(buffer: ArrayBuffer, config?: object): Promise<THREE.Texture> };

/** Tệp KTX2 mã hóa UASTC (pipeline dùng cho normal map): vkFormat 0 (Basis) và supercompression khác BasisLZ (1 = ETC1S). */
export function isUastcKtx2(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 48) return false;
  const v = new DataView(buffer);
  return v.getUint32(12, true) === 0 && v.getUint32(44, true) !== 1;
}

/**
 * three trả texture RGBA8 đã giải mã dưới dạng `CompressedTexture` (định dạng RGBA, mip rời). Backend WebGPU r178 xử lý mọi
 * `CompressedTexture` như texture nén khối và lỗi khi tra kích thước khối của RGBA, nên đổi sang `DataTexture` thường:
 * giữ mức 0, để GPU sinh mip (normal map không cần mip tính sẵn).
 */
function plainDataTexture(src: THREE.Texture): THREE.Texture {
  const level0 = (src as THREE.CompressedTexture).mipmaps?.[0] as { data: Uint8Array; width: number; height: number } | undefined;
  if (!(src as THREE.CompressedTexture).isCompressedTexture || src.format !== THREE.RGBAFormat || !level0) return src;
  const tex = new THREE.DataTexture(level0.data, level0.width, level0.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = src.colorSpace;
  tex.premultiplyAlpha = src.premultiplyAlpha;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  src.dispose();
  return tex;
}

/**
 * three cảnh báo "Multiple active KTX2 loaders" trong `KTX2Loader.init()` khi đã có một loader khác hoạt động. `init()` chạy đồng bộ
 * ở đầu `_createTexture` lần đầu của mỗi loader (không phải trong constructor), nên chặn riêng lời cảnh báo đó trong phần đồng bộ
 * của lời gọi. Ở game loader phụ là chủ ý (2 worker, chỉ cho normal map trên WebGPU); mọi cảnh báo khác vẫn đi qua.
 */
function quietSecondLoader<T>(call: () => T): T {
  const warn = console.warn;
  console.warn = (...a: unknown[]) => {
    if (!String(a[0]).includes('Multiple active KTX2 loaders')) warn(...a);
  };
  try {
    return call();
  } finally {
    console.warn = warn;
  }
}

/**
 * KTX2Loader của game. Pipeline nén normal map bằng UASTC, mọi thứ khác bằng ETC1S (tools/asset-pipeline/src/ktx.ts).
 * UASTC chỉ giữ được chất lượng khi GPU nhận ASTC hoặc BC7; nếu không, three chuyển mã xuống BC1/ETC (5-6 bit mỗi kênh),
 * vỡ khối thấy rõ trên pháp tuyến. Backend WebGPU của three r178 không tạo được texture BC7 (chỉ BC1–3, ETC2, ASTC), nên trên
 * WebGPU desktop normal map đi qua `plain`: loader phụ tắt hết định dạng nén, giải ra RGBA8 kèm mip có sẵn trong tệp.
 * Texture ETC1S (màu, ORM, emissive) vẫn nén (BC1/BC3 trên WebGPU, BC7 trên WebGL2). Khi three hỗ trợ BC7 trên WebGPU thì bỏ nhánh này.
 */
export class GameKtx2Loader extends KTX2Loader {
  private plain: KTX2Loader | null = null;

  constructor(private libs: THREE.LoadingManager) {
    super(libs);
  }

  /** Gọi sau `detectSupportAsync`: quyết định normal map (UASTC) nén hay giải ra RGBA8. */
  configure(): void {
    const cfg = (this as unknown as Ktx2Internals).workerConfig;
    const keepsQuality = !!cfg && (cfg.astcSupported || cfg.bptcSupported);
    if (keepsQuality || this.plain) return;
    const plain = new KTX2Loader(this.libs).setTranscoderPath('/libs/').setWorkerLimit(2);
    (plain as unknown as Ktx2Internals).workerConfig = {
      astcSupported: false,
      astcHDRSupported: false,
      etc1Supported: false,
      etc2Supported: false,
      dxtSupported: false,
      bptcSupported: false,
      pvrtcSupported: false,
    };
    this.plain = plain;
  }

  /** true khi normal map đang giải ra RGBA8 (F3/bench đọc để giải thích số bộ nhớ texture). */
  get uastcUncompressed(): boolean {
    return this.plain !== null;
  }

  // Ghi đè phương thức nội bộ của three (r178): điểm duy nhất mọi tệp KTX2 đi qua, cả khi nạp qua GLTFLoader.
  async _createTexture(buffer: ArrayBuffer, config: object = {}): Promise<THREE.Texture> {
    const base = (KTX2Loader.prototype as unknown as Ktx2Internals)._createTexture;
    if (!this.plain) return base.call(this, buffer, config);
    const plain = isUastcKtx2(buffer) ? (this.plain as unknown as Ktx2Internals) : null;
    // Có loader phụ thì loader nào `init()` sau sẽ in cảnh báo, nên bọc cả hai đường.
    if (plain) return plainDataTexture(await quietSecondLoader(() => plain._createTexture(buffer, config)));
    return quietSecondLoader(() => base.call(this, buffer, config));
  }

  override dispose(): this {
    this.plain?.dispose();
    this.plain = null;
    super.dispose();
    return this;
  }
}

/** KTX2Loader dùng transcoder cục bộ; cần `detectKtx2Support(ktx2, renderer)` trước khi parse texture. */
export function createKtx2Loader(manager = localLibsManager()): GameKtx2Loader {
  return new GameKtx2Loader(manager).setTranscoderPath('/libs/') as GameKtx2Loader;
}

/**
 * Dò định dạng nén GPU hỗ trợ (gọi một lần cho mỗi renderer, trước khi parse texture KTX2) rồi chọn đường cho normal map.
 * Kết quả trên desktop: WebGL2 → BC7 cho mọi texture; WebGPU → BC1/BC3 cho màu/ORM, RGBA8 cho normal map.
 * Máy không có định dạng nén nào thì three tự giải mọi thứ ra RGBA8, nên asset vẫn nạp được.
 */
export async function detectKtx2Support(ktx2: KTX2Loader, renderer: THREE.WebGPURenderer): Promise<KTX2Loader> {
  await ktx2.detectSupportAsync(renderer);
  if (ktx2 instanceof GameKtx2Loader) ktx2.configure();
  return ktx2;
}

/** GLTFLoader có Meshopt + KTX2 (cấu hình chung cho game và trang xem asset). */
export function createGltfLoader(ktx2: KTX2Loader): GLTFLoader {
  return new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}

/** Thay texture bậc cao vào vật liệu cùng tên (`meta.mat`) trong cây `root`; null nếu không có vật liệu/slot nào khớp. */
export function swapHiresTexture(root: THREE.Object3D, meta: { mat: string; slots: string[]; gpuBytes: number }, tex: THREE.Texture): HiresApplied | null {
  const swaps: HiresApplied['swaps'] = [];
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) {
      if (mat.name !== meta.mat || swaps.some((s) => s.mat === mat)) continue;
      for (const slot of meta.slots) {
        const old = (mat as unknown as Record<string, THREE.Texture | null>)[slot];
        if (!old || !old.isTexture) continue;
        tex.colorSpace = old.colorSpace;
        tex.wrapS = old.wrapS;
        tex.wrapT = old.wrapT;
        tex.anisotropy = old.anisotropy;
        tex.channel = old.channel;
        (mat as unknown as Record<string, THREE.Texture>)[slot] = tex;
        // Material dẫn xuất (adoptGltfMaterials chép tham chiếu texture) đang vẽ thay cho material gốc: đổi cả chúng.
        for (const d of derivedOf(mat)) {
          const dm = d as unknown as Record<string, THREE.Texture | null>;
          if (dm[slot] === old) {
            dm[slot] = tex;
            d.needsUpdate = true;
          }
        }
        swaps.push({ mat, slot, old });
      }
      if (swaps.some((s) => s.mat === mat)) mat.needsUpdate = true;
    }
  });
  return swaps.length === 0 ? null : { tex, gpuBytes: meta.gpuBytes, swaps };
}

/** Trả texture cũ vào vật liệu và dispose texture bậc cao. */
export function revertHiresApplied(a: HiresApplied): void {
  for (const s of a.swaps) {
    (s.mat as unknown as Record<string, THREE.Texture>)[s.slot] = s.old;
    s.mat.needsUpdate = true;
    // Material dẫn xuất (kể cả cái tạo sau khi đã áp dụng, chép texture bậc cao) về texture cũ trước khi dispose.
    for (const d of derivedOf(s.mat)) {
      const dm = d as unknown as Record<string, THREE.Texture | null>;
      if (dm[s.slot] === a.tex) {
        dm[s.slot] = s.old;
        d.needsUpdate = true;
      }
    }
  }
  a.tex.dispose();
}

/** Dispose geometry, material và texture trong material của một cây object. */
function disposeObject(root: THREE.Object3D): void {
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
  private manifestValue: Manifest | null = null;
  /** Tăng mỗi lần `revertHires`: việc tải đang chạy dở thấy epoch đổi thì bỏ kết quả. */
  private hiresEpoch = 0;
  private ktx2: KTX2Loader | null = null;
  private loader: GLTFLoader | null = null;
  /** Byte GLB đã/đang tải trước theo URL (`prefetch`), `null` nếu lỗi; xóa khi đã parse. */
  private raw = new Map<string, Promise<ArrayBuffer | null>>();

  /**
   * `load`/`fetchBytes`/`parse`/`manifest` thay được để test; mặc định fetch từ `assetBaseUrl()`.
   * `concurrency`: số GLB tải song song (mặc định 2). Mạng là nút thắt lúc tải đầu: ít luồng thì thứ
   * cần trước (nhân vật mình) về sớm thay vì chia băng thông đều với mọi thứ khác.
   */
  constructor(
    private opts: {
      base?: string;
      concurrency?: number;
      load?: LoadFn;
      fetchBytes?: FetchFn;
      parse?: ParseFn;
      fetchManifest?: () => Promise<Manifest>;
      /** Thay được để test: nạp một tệp KTX2 rời (bậc texture cao). */
      loadTexture?: (url: string) => Promise<THREE.Texture>;
    } = {},
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
    await detectKtx2Support(this.ktx2, renderer);
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
      this.manifest = fetchManifest()
        .then((m) => {
          this.manifestValue = m;
          return m;
        })
        .catch((e) => {
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
      const entry: Entry = { id, refs: 0, gltf: null, promise: null as unknown as Promise<GLTF>, handles: new Set(), tracked: new Set(), hires: new Map() };
      entry.promise = this.getManifest()
        .then((m) => {
          const a = m.assets[id];
          if (!a) throw new Error(`asset "${id}" không có trong manifest`);
          const url = this.base + a.file;
          const p = this.bytes.get(id) ?? { loaded: 0, total: a.bytes };
          this.bytes.set(id, p);
          const onBytes = (n: number) => (p.loaded = Math.min(n, p.total));
          const pre = this.raw.get(url);
          let job: Promise<GLTF>;
          if (pre) {
            // Đã tải trước (hoặc đang chờ trong hàng): nâng ưu tiên, parse khi byte về; tải trước lỗi thì tải lại.
            this.bump(id, opts);
            job = pre.then((buf) => {
              this.raw.delete(url);
              return buf ? this.parse(buf, url) : this.enqueue(id, opts, () => this.load(url, onBytes));
            });
          } else {
            job = this.enqueue(id, opts, () => this.load(url, onBytes));
          }
          return job.then(
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

  /**
   * Tải trước byte của asset (chưa parse, chưa giữ handle) theo cùng hàng đợi ưu tiên. Không làm gì nếu
   * asset đã/đang nạp. Lỗi chỉ cảnh báo: `acquire` sau đó tự tải lại. Byte tải trước giữ tới khi `acquire`.
   */
  prefetch(id: string, opts: AcquireOptions = {}): void {
    if (this.entries.has(id)) return;
    this.getManifest().then(
      (m) => {
        const a = m.assets[id];
        if (!a || this.entries.has(id)) return;
        const url = this.base + a.file;
        if (this.raw.has(url)) return this.bump(id, opts);
        const p = { loaded: 0, total: a.bytes };
        this.bytes.set(id, p);
        const fetchFn = this.opts.fetchBytes ?? fetchBytes;
        this.raw.set(
          url,
          this.enqueue(id, opts, () => fetchFn(url, (n) => (p.loaded = Math.min(n, p.total)))).then(
            (data) => {
              p.loaded = p.total;
              return data;
            },
            (e) => {
              console.warn(`[asset] tải trước ${id} lỗi, sẽ thử lại khi cần:`, e);
              p.loaded = 0;
              return null;
            },
          ),
        );
      },
      () => undefined,
    );
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
    this.raw.clear();
    this.ktx2?.dispose();
    this.ktx2 = null;
    this.loader = null;
  }

  // ---------- Bậc texture cao (tải nền, Cao/Cực cao) ----------

  /** Texture bậc cao chưa thay của các asset đang có bản sao, kèm khoảng cách tới người xem (m). */
  hiresCandidates(): HiresCandidate[] {
    const m = this.manifestValue;
    if (!m) return [];
    const out: HiresCandidate[] = [];
    for (const e of this.entries.values()) {
      const list = m.assets[e.id]?.hires;
      if (!e.gltf || !list?.length || e.handles.size === 0) continue;
      const todo = list.filter((h) => !e.hires.has(h.file));
      if (todo.length === 0) continue;
      const dist = this.entryDist(e);
      for (const h of todo) {
        out.push({ key: `${e.id}#${h.file}`, assetId: e.id, dist, file: h.file, width: h.width, bytes: h.bytes, gpuBytes: h.gpuBytes });
      }
    }
    return out;
  }

  /** Tổng bộ nhớ GPU thêm của texture bậc cao đang áp dụng (byte). */
  hiresMemory(): number {
    let n = 0;
    for (const e of this.entries.values()) for (const a of e.hires.values()) n += a.gpuBytes;
    return n;
  }

  /**
   * Tải tệp bậc cao và thay vào vật liệu cùng tên của asset. `ok`: đã thay; `stale`: bị hủy giữa chừng (revert/hạ trần/asset bỏ),
   * thử lại được sau; `none`: không thay được (thiếu vật liệu/slot khớp), đừng thử lại.
   */
  async applyHires(c: { assetId: string; file: string; width?: number }, maxSide = Infinity): Promise<'ok' | 'stale' | 'none'> {
    const e = this.entries.get(c.assetId);
    const meta = this.manifestValue?.assets[c.assetId]?.hires?.find((h) => h.file === c.file);
    if (!e?.gltf || !meta) return 'none';
    if (e.hires.has(c.file)) return 'ok';
    const url = this.base + c.file;
    const epoch = this.hiresEpoch;
    const tex = await (this.opts.loadTexture ? this.opts.loadTexture(url) : this.loadKtxTexture(url));
    // Đã revert (hạ preset) hoặc asset bỏ đi trong lúc tải: bỏ texture; cạnh vượt trần mới (Cực cao → Cao) cũng bỏ.
    if (this.entries.get(c.assetId) !== e || !e.gltf || epoch !== this.hiresEpoch || meta.width > maxSide) {
      tex.dispose();
      return 'stale';
    }
    const applied = swapHiresTexture(e.gltf.scene, meta, tex);
    if (!applied) {
      tex.dispose();
      return 'none';
    }
    e.hires.set(c.file, applied);
    return 'ok';
  }

  /** Các texture bậc cao đang áp dụng, kèm khoảng cách bản sao gần nhất (cho việc đuổi khi chạm trần bộ nhớ). */
  hiresApplied(): { key: string; dist: number; gpuBytes: number }[] {
    const out: { key: string; dist: number; gpuBytes: number }[] = [];
    for (const e of this.entries.values()) {
      if (e.hires.size === 0) continue;
      const dist = this.entryDist(e);
      for (const [file, a] of e.hires) out.push({ key: `${e.id}#${file}`, dist, gpuBytes: a.gpuBytes });
    }
    return out;
  }

  /** Trả một tệp đã áp dụng (khóa `<asset>#<tệp>`) về texture GLB. */
  revertHiresFile(key: string): void {
    const i = key.indexOf('#');
    const e = this.entries.get(key.slice(0, i));
    const file = key.slice(i + 1);
    const a = e?.hires.get(file);
    if (!e || !a) return;
    revertHiresApplied(a);
    e.hires.delete(file);
  }

  /**
   * Khai báo một bản đang vẽ của asset `id` (nơi dùng tự `clone` từ handle mẫu không nằm trong cảnh: quái, nhân vật), để thứ tự
   * "gần camera trước" của texture bậc cao dùng đúng vị trí con quái chứ không phải bản mẫu ở gốc tọa độ. Giữ yếu (WeakRef);
   * bản chưa gắn vào cảnh hoặc đã gỡ thì không tính. Trả hàm bỏ khai báo.
   */
  trackInstance(id: string, obj: THREE.Object3D): () => void {
    const e = this.entries.get(id);
    if (!e) return () => undefined;
    const ref = new WeakRef(obj);
    e.tracked.add(ref);
    return () => e.tracked.delete(ref);
  }

  private static inScene(o: THREE.Object3D): boolean {
    let p: THREE.Object3D | null = o;
    while (p.parent) p = p.parent;
    return (p as THREE.Scene).isScene === true;
  }

  /** Khoảng cách (m, mặt phẳng) từ người xem tới bản gần nhất đang nằm trong cảnh; Infinity nếu không có. */
  private entryDist(e: Entry): number {
    const v = new THREE.Vector3();
    let dist = Infinity;
    const visit = (o: THREE.Object3D) => {
      if (!AssetCache.inScene(o)) return; // bản mẫu tách rời, bản chưa gắn hoặc đã gỡ
      o.getWorldPosition(v);
      dist = Math.min(dist, Math.hypot(v.x - this.viewer.x, v.z - this.viewer.z));
    };
    for (const h of e.handles) visit(h);
    for (const ref of e.tracked) {
      const o = ref.deref();
      if (o) visit(o);
      else e.tracked.delete(ref);
    }
    return dist;
  }

  /** Trả mọi texture bậc cao về bản trong GLB (hạ preset, mạng chậm): giải phóng bộ nhớ GPU. */
  revertHires(): void {
    this.hiresEpoch++;
    for (const e of this.entries.values()) this.revertEntryHires(e);
  }

  private revertEntryHires(e: Entry): void {
    for (const a of e.hires.values()) revertHiresApplied(a);
    e.hires.clear();
  }

  private loadKtxTexture(url: string): Promise<THREE.Texture> {
    if (!this.ktx2) this.ktx2 = createKtx2Loader();
    return this.ktx2.loadAsync(url);
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
    e.handles.add(scene);
    return {
      id: e.id,
      scene,
      animations: gltf.animations,
      release: () => {
        if (released) return;
        released = true;
        scene.removeFromParent();
        e.refs--;
        e.handles.delete(scene);
        if (e.refs <= 0 && this.entries.get(e.id) === e) {
          this.entries.delete(e.id);
          this.revertEntryHires(e);
          disposeObject(gltf.scene);
        }
      },
    };
  }

  /** Xếp một việc tải vào hàng; `run` chạy khi tới lượt (chiếm một luồng tới khi xong). */
  private enqueue<T>(id: string, opts: AcquireOptions, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ id, pos: opts.pos, priority: opts.priority ?? 0, run: () => run().then(resolve, reject) });
      this.schedulePump();
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

  private pumpQueued = false;

  /**
   * Chọn việc ở cuối lượt microtask: mọi yêu cầu xếp cùng lượt (ví dụ các callback cùng chờ manifest)
   * được xếp hạng cùng nhau, việc xếp trước không chiếm luồng của việc ưu tiên hơn xếp ngay sau.
   */
  private schedulePump(): void {
    if (this.pumpQueued) return;
    this.pumpQueued = true;
    queueMicrotask(() => {
      this.pumpQueued = false;
      this.pump();
    });
  }

  private pump(): void {
    const max = this.opts.concurrency ?? 2;
    while (this.active < max && this.queue.length > 0) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.rank(this.queue[i]) < this.rank(this.queue[best])) best = i;
      const job = this.queue.splice(best, 1)[0];
      this.active++;
      job
        .run()
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  private gltfLoader(): GLTFLoader {
    if (!this.loader) {
      if (!this.ktx2) this.ktx2 = createKtx2Loader();
      this.loader = createGltfLoader(this.ktx2);
    }
    return this.loader;
  }

  private load(url: string, onBytes: (n: number) => void): Promise<GLTF> {
    if (this.opts.load) return this.opts.load(url, onBytes);
    return this.gltfLoader().loadAsync(url, (ev) => onBytes(ev.loaded));
  }

  private parse(data: ArrayBuffer, url: string): Promise<GLTF> {
    if (this.opts.parse) return this.opts.parse(data, url);
    return this.gltfLoader().parseAsync(data, url.slice(0, url.lastIndexOf('/') + 1));
  }
}

/** Cache dùng chung của game (một trang, một cache; renderer gắn qua `attach`). */
export const assets = new AssetCache();
