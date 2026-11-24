import * as THREE from 'three/webgpu';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { HiresCandidate } from '../hires/policy';
import { derivedOf } from '../../render/materials/derived';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import basisJsUrl from 'three/addons/libs/basis/basis_transcoder.js?url';
import basisWasmUrl from 'three/addons/libs/basis/basis_transcoder.wasm?url';
import { logger } from '../../base/log';
import { FLAGS } from '../../base/flags';
import { ASSET_BASE } from '../../base/assetBase';

const assetLog = logger('asset');

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
interface ManifestHires {
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
  /**
   * Cạnh texture tối đa của bản nạp này (N-7: model nhân vật của người khác); thiếu = giữ nguyên tệp. Bản có trần là một bản nạp riêng
   * (khóa `id@…`), bỏ các mức mip lớn hơn trần ngay sau khi parse nên không lên GPU và không giữ trong RAM.
   */
  maxTexture?: number;
  /** Trần riêng cho normal map (trên WebGPU giải ra RGBA8, tốn gấp 4–8 lần texture nén); thiếu = `maxTexture`. */
  maxNormal?: number;
}

/** Khóa bản nạp trong `AssetCache`: id, thêm hậu tố khi có trần texture. */
export function assetKey(id: string, o: AcquireOptions = {}): string {
  const t = o.maxTexture ?? Infinity;
  const n = o.maxNormal ?? t;
  return Number.isFinite(t) || Number.isFinite(n) ? `${id}@${t}n${n}` : id;
}

type MipLevel = { data: Uint8Array; width: number; height: number };

/** Thu RGBA8 về cạnh ≤ `cap` bằng lọc hộp (trung bình khối k×k, k = lũy thừa 2 nhỏ nhất đủ thu). */
export function boxDown(src: MipLevel, cap: number): MipLevel {
  let k = 1;
  while (Math.max(src.width, src.height) / k > cap) k *= 2;
  if (k === 1) return src;
  const w = src.width / k;
  const h = src.height / k;
  const out = new Uint8Array(w * h * 4);
  const n = k * k;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) sum += src.data[((y * k + dy) * src.width + x * k + dx) * 4 + c]!;
        out[(y * w + x) * 4 + c] = Math.round(sum / n);
      }
  return { data: out, width: w, height: h };
}

/**
 * Áp trần cạnh texture cho mọi vật liệu trong `root` (gọi một lần ngay sau khi parse, trước lần vẽ đầu): texture nén bỏ các mức mip
 * đầu; normal map đã giải RGBA8 (`plainDataTexture`) đổi sang mức mip có sẵn trong tệp. Luôn bỏ các mức mip giữ tạm. Trả số texture đã thu nhỏ.
 */
export function capTextures(root: THREE.Object3D, maxTexture = Infinity, maxNormal = maxTexture): number {
  const seen = new Set<THREE.Texture>();
  let shrunk = 0;
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) {
      for (const [slot, v] of Object.entries(mat)) {
        const tex = v as THREE.Texture | null;
        if (!tex || !tex.isTexture || seen.has(tex)) continue;
        seen.add(tex);
        const cap = slot === 'normalMap' ? maxNormal : maxTexture;
        const spare = tex.userData.dtlMips as MipLevel[] | undefined;
        delete tex.userData.dtlMips;
        const mips = (tex as THREE.CompressedTexture).isCompressedTexture
          ? ((tex as THREE.CompressedTexture).mipmaps as MipLevel[] | undefined)
          : undefined;
        if (mips && mips.length > 1) {
          let k = 0;
          while (k < mips.length - 1 && Math.max(mips[k]!.width, mips[k]!.height) > cap) k++;
          if (k === 0) continue;
          mips.splice(0, k);
          const img = tex.image as { width: number; height: number };
          img.width = mips[0]!.width;
          img.height = mips[0]!.height;
        } else if (spare?.length) {
          const img = tex.image as MipLevel;
          if (Math.max(img.width, img.height) <= cap) continue;
          const lv = spare.find((m) => Math.max(m.width, m.height) <= cap) ?? spare[spare.length - 1]!;
          // Mức mip có sẵn không phải lúc nào cũng là Uint8Array dùng được (UASTC giải RGBA8 trên WebGPU: `data` rỗng): khi đó lọc hộp từ mức 0.
          const ok = lv.data instanceof Uint8Array && lv.data.length === lv.width * lv.height * 4;
          tex.image = ok ? { data: lv.data, width: lv.width, height: lv.height } : boxDown(img as MipLevel, cap);
        } else continue;
        tex.needsUpdate = true;
        shrunk++;
      }
    }
  });
  return shrunk;
}

/**
 * Chân Cảnh O4′ (heap JS): bản sao texture phía CPU (normal map RGBA8 `DataTexture`, mip KTX2 của `CompressedTexture`) vẫn nằm trong heap sau khi đã lên GPU:
 * đo `heap3` ở rừng Vân Lam ≈ 188 MB trên ~290 texture. Gắn `onUpdate` (three gọi sau lần tải lên GPU đầu tiên, như `groundTextures`) để bỏ dữ liệu CPU.
 * An toàn vì mỗi texture chỉ tải lên một lần (một renderer; lùi WebGL2 nạp lại cả trang) và bản gốc trong cache bị parse lại khi nạp lại asset.
 * `?keeptex=1` giữ nguyên để đối chứng.
 */
export function freeTexturesAfterUpload(root: THREE.Object3D): number {
  const seen = new Set<THREE.Texture>();
  const groups = new Map<unknown, THREE.Texture[]>();
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(mat)) {
        const tex = v as THREE.Texture | null;
        if (!tex || !tex.isTexture || seen.has(tex)) continue;
        seen.add(tex);
        // GLTFLoader tạo nhiều `Texture` (khác sampler/kênh) dùng chung một `Source`/mip: chỉ bỏ dữ liệu khi MỌI texture dùng chung đã lên GPU,
        // nếu không texture lên sau ghi dữ liệu rỗng (`writeTexture` lỗi).
        const key = tex.source ?? tex;
        const g = groups.get(key);
        if (g) g.push(tex);
        else groups.set(key, [tex]);
      }
    }
  });
  for (const group of groups.values()) {
    let pending = group.length;
    for (const tex of group) {
      const prev = tex.onUpdate;
      tex.onUpdate = (t) => {
        prev?.(t);
        tex.onUpdate = prev;
        if (--pending === 0) for (const x of group) freeCpuCopy(x);
      };
    }
  }
  return seen.size;
}

function freeCpuCopy(t: THREE.Texture): void {
  const c = t as THREE.CompressedTexture;
  if (c.isCompressedTexture) {
    for (const m of c.mipmaps ?? []) (m as { data: unknown }).data = null;
  } else if ((t as THREE.DataTexture).isDataTexture) {
    (t.image as { data: unknown }).data = null;
  }
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
  /** Khóa trong `entries` (`assetKey`): id, hoặc `id@…` cho bản có trần texture. */
  key: string;
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
  return `${ASSET_BASE}assets/`;
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

type Ktx2Config = Record<
  'astcSupported' | 'astcHDRSupported' | 'etc1Supported' | 'etc2Supported' | 'dxtSupported' | 'bptcSupported' | 'pvrtcSupported',
  boolean
>;
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
  // Các mức mip nhỏ hơn có sẵn trong tệp: giữ tạm tới `capTextures` (ngay sau khi parse) để bản có trần texture dùng, không phải lọc ảnh.
  const rest = (src as THREE.CompressedTexture).mipmaps?.slice(1) ?? [];
  if (rest.length) tex.userData.dtlMips = rest;
  tex.needsUpdate = true;
  src.dispose();
  return tex;
}

/**
 * three cảnh báo "Multiple active KTX2 loaders" trong `KTX2Loader.init()` khi đã có một loader khác hoạt động. `init()` chạy đồng bộ
 * ở đầu `_createTexture` lần đầu của mỗi loader (không phải trong constructor), nên chặn riêng lời cảnh báo đó trong phần đồng bộ
 * của lời gọi. Ở game loader phụ là chủ ý (2 worker, chỉ cho normal map trên WebGPU); mọi cảnh báo khác vẫn đi qua.
 */
/* eslint-disable no-console -- vá tạm console.warn để chặn đúng một cảnh báo của three, không phải log của game */
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
/* eslint-enable no-console */

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
export function swapHiresTexture(
  root: THREE.Object3D,
  meta: { mat: string; slots: string[]; gpuBytes: number },
  tex: THREE.Texture,
): HiresApplied | null {
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
    const key = assetKey(id, opts);
    let e = this.entries.get(key);
    if (!e) {
      const entry: Entry = {
        id,
        key,
        refs: 0,
        gltf: null,
        promise: null as unknown as Promise<GLTF>,
        handles: new Set(),
        tracked: new Set(),
        hires: new Map(),
      };
      entry.promise = this.getManifest()
        .then((m) => {
          const a = m.assets[id];
          if (!a) throw new Error(`asset "${id}" không có trong manifest`);
          const url = this.base + a.file;
          const p = this.bytes.get(key) ?? { loaded: 0, total: a.bytes };
          this.bytes.set(key, p);
          const onBytes = (n: number) => (p.loaded = Math.min(n, p.total));
          const pre = this.raw.get(url);
          let job: Promise<GLTF>;
          if (pre) {
            // Đã tải trước (hoặc đang chờ trong hàng): nâng ưu tiên, parse khi byte về; tải trước lỗi thì tải lại.
            this.bump(id, opts);
            job = pre.then((buf) => {
              this.raw.delete(url);
              return buf ? this.parse(buf, url) : this.enqueue(key, opts, () => this.load(url, onBytes));
            });
          } else {
            job = this.enqueue(key, opts, () => this.load(url, onBytes));
          }
          return job.then(
            (g) => {
              p.loaded = p.total;
              return g;
            },
            (err) => {
              this.bytes.delete(key);
              throw err;
            },
          );
        })
        .then((g) => {
          // Trần texture của bản nạp này; bản không trần cũng đi qua để bỏ các mức mip giữ tạm.
          capTextures(g.scene, opts.maxTexture, opts.maxNormal ?? opts.maxTexture);
          // Chỉ kiến trúc: nhân vật/quái/prop dùng `Texture.clone()` về sau (nhuộm màu, bộ trang phục) và clone chép chung mip với bản gốc nên không được bỏ dữ liệu.
          if (!FLAGS.keepTex && /^(arch|mon|elite|boss)_|^prop_(?!kiem|phi_kiem)/.test(id)) freeTexturesAfterUpload(g.scene);
          // Chỉ giữ cảnh và clip: `parser` của GLTFLoader còn nắm nguyên byte GLB + ảnh KTX2 nhúng (10–13 MB mỗi model nhân vật bậc cao).
          const slim = { scene: g.scene, animations: g.animations } as GLTF;
          entry.gltf = slim;
          return slim;
        });
      e = entry;
      this.entries.set(key, e);
    } else if (!e.gltf) {
      this.bump(key, opts);
    }
    e.refs++;
    let gltf: GLTF;
    try {
      gltf = await e.promise;
    } catch (err) {
      e.refs--;
      if (this.entries.get(key) === e) this.entries.delete(key);
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
              assetLog.warn(`tải trước ${id} lỗi, sẽ thử lại khi cần:`, e);
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
        if (e.refs <= 0 && this.entries.get(e.key) === e) {
          this.entries.delete(e.key);
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
      for (let i = 1; i < this.queue.length; i++) if (this.rank(this.queue[i]!) < this.rank(this.queue[best]!)) best = i;
      const job = this.queue.splice(best, 1)[0]!;
      this.active++;
      job.run().finally(() => {
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
