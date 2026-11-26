import * as THREE from 'three/webgpu';
import { markCpuFreed, neutralizeFreedTexture } from './texFreed';

/** Chỉ số lớp trong texture mảng; khớp thứ tự LAYERS ở tools/asset-pipeline/src/terrain-textures.ts. */
export const GROUND_LAYER = { grass: 0, dirt: 1, forest: 2, rock: 3, cliff: 4, sand: 5, paving: 6, gravel: 7 } as const;

export interface GroundTextures {
  /** Albedo sRGB, mảng 8 lớp. */
  albedo: THREE.DataArrayTexture;
  /** R,G = pháp tuyến (z dựng lại ở shader), B = độ nhám. */
  normal: THREE.DataArrayTexture;
  /** R đường mòn, G sân lát đá, B cát, A nhiễu vĩ mô (groundMask.ts). */
  mask: THREE.Texture;
  /** Thư mục bộ texture (`public/<set>/`): `terrain` (Vân Lam), `terrain-ochre` (Đoạn Mạch, E2-I). */
  set: string;
  /** Loại mặt nạ đang dùng (`manifest`: vẽ riêng cho Vân Lam; `neutral`: phẳng cho level chưa có mặt nạ riêng). */
  maskKind: GroundMaskKind;
  /**
   * Đổi mặt nạ (E1-D, đổi level) theo hai pha, vì mặt nạ cũ còn được địa hình cũ vẽ cho tới khi level cũ bị gỡ: `prepareMask` nạp mặt nạ mới
   * (chưa đụng cái cũ) và trả hàm `commit`; gọi `commit()` sau khi gỡ địa hình cũ mới giải phóng mặt nạ cũ rồi dựng `Terrain` mới + `setGround`.
   * Giải phóng mặt nạ khi cảnh còn dùng thì WebGPU báo "ImageBitmap has been detached".
   */
  prepareMask(kind: GroundMaskKind): Promise<() => void>;
  dispose(): void;
}

export type GroundMaskKind = 'manifest' | 'neutral';

interface Manifest {
  size: number;
  /** Bộ không có mặt nạ riêng (ochre) thì để trống: dùng `neutral`. */
  mask?: string;
  /** `a`/`n`: tên file trong thư mục bộ; lớp trùng nội dung với bộ gốc ghi `../terrain/<file>` (X14, không chép hai bản). */
  layers: { layer: string; a: string; n: string }[];
}

/**
 * B9 (texture Vân Lam ≤ 450 MB): cạnh albedo tối đa của mảng mặt đất. Bộ 2K `terrain-lk` (8 lớp) chiếm ~180 MB albedo + 45 MB pháp tuyến. Ô lặp 6 m (đồng) / 2,4 m (lát đá):
 * ở 1536 là 3,9 mm / 1,6 mm mỗi texel, còn mịn hơn điểm ảnh màn hình 1080p ở camera chéo (~11–14 mm) và 4K (~5–7 mm); cắt từ 2048 xuống 1536 bớt ~78 MB VRAM (albedo 179 → 101 MB), pháp tuyến giữ 1024.
 * B9 lần hai (Cực cao ≤ 480 MB @1080p): 1536 → 1280 (albedo 8 lớp 101 → 70 MB, −31 MB); ô 6 m → 4,7 mm/texel, ô lát đá 2,4 m → 1,9 mm, vẫn mịn hơn điểm ảnh 1080p (~11–14 mm) và 4K (~5–7 mm).
 */
export const GROUND_ALBEDO_MAX = 1280;

/**
 * B9 (Cực cao ≤ 512 MB): cạnh tối đa của mảng pháp tuyến/độ nhám mặt đất (8 lớp RGBA8 + mip). 1024 → 768: 45 → 25 MB (−20 MB); ô lặp 6 m → 7,8 mm/texel, vẫn nhỏ hơn điểm ảnh 1080p (~11–14 mm).
 * Bộ 1024² (pháp tuyến 512) không đổi.
 */
export const GROUND_NORMAL_MAX = 768;

async function decode(url: string, size: number): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(size, size);
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high'; // thu nhỏ 2048 → 1536 (B9): lọc chất lượng cao, không để răng cưa
  g.drawImage(bmp, 0, 0, size, size);
  bmp.close();
  return g.getImageData(0, 0, size, size).data;
}

interface MaskRec {
  tex: THREE.Texture;
  dispose(): void;
}

/** Mặt nạ vùng: `manifest` = ảnh tính sẵn lúc build; `neutral` = 1 texel (không đường mòn/sân lát/cát, nhiễu vĩ mô trung bình). */
async function makeMask(base: string, set: string, manifest: Manifest, kind: GroundMaskKind): Promise<MaskRec> {
  if (kind === 'neutral' || !manifest.mask) {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 128]), 1, 1, THREE.RGBAFormat);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return { tex: t, dispose: () => t.dispose() };
  }
  // Mặt nạ tính sẵn lúc build (groundMask.ts). Dùng thẳng ImageBitmap (không qua canvas) để không bị nhân alpha vào RGB.
  const maskRes = await fetch(`${base}${set}/${manifest.mask}`);
  if (!maskRes.ok) throw new Error(`mask: ${maskRes.status}`);
  const maskBmp = await createImageBitmap(await maskRes.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const mask = new THREE.Texture(maskBmp);
  mask.format = THREE.RGBAFormat;
  mask.colorSpace = THREE.NoColorSpace;
  mask.flipY = false;
  mask.premultiplyAlpha = false;
  mask.wrapS = mask.wrapT = THREE.RepeatWrapping;
  mask.magFilter = mask.minFilter = THREE.LinearFilter;
  mask.generateMipmaps = false;
  mask.needsUpdate = true;
  return {
    tex: mask,
    dispose() {
      mask.dispose();
      maskBmp.close();
    },
  };
}

function arrayTexture(data: Uint8Array, size: number, layers: number, srgb: boolean): THREE.DataArrayTexture {
  const t = new THREE.DataArrayTexture(data as Uint8Array<ArrayBuffer>, size, size, layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  // Sau khi đã tải lên GPU thì bỏ mảng nguồn khỏi heap JS (mảng màu 2K ~134 MB): three chỉ cần `image.data` lúc upload.
  t.onUpdate = () => {
    (t.image as { data: unknown }).data = null;
    markCpuFreed(t);
    t.onUpdate = null;
  };
  t.needsUpdate = true;
  return t;
}

/**
 * Nạp bộ texture mặt đất (WebP, ~4 MB) sau khi game đã chạy, không nằm trong tải đầu. Giải mã từng lớp
 * một (nhường khung hình giữa các lớp) rồi ghép vào 2 texture mảng, nên shader địa hình chỉ tốn 2 slot
 * texture. VRAM: albedo 8 × 1024² × 4 B + mip ≈ 43 MB, pháp tuyến 8 × 512² ≈ 11 MB.
 */
/**
 * Bộ texture mặt đất thật sự nạp theo preset: bộ 2K `terrain-lk` (Vân Lam/Kiếm Trủng, MAP-1 bản B) chỉ ở Cao/Cực cao; Thấp/Vừa dùng bộ gốc
 * 1024² `terrain` (cùng mặt nạ), để máy yếu không gánh ~180 MB VRAM + bản sao heap của bản 2K.
 */
export function resolveGroundSet(set: string, quality: string): string {
  return set === 'terrain-lk' && quality !== 'high' && quality !== 'ultra' ? 'terrain' : set;
}

export async function loadGroundTextures(
  base: string,
  signal?: { aborted: boolean },
  kind: GroundMaskKind = 'manifest',
  set = 'terrain',
): Promise<GroundTextures> {
  const manifest = (await (await fetch(`${base}${set}/manifest.json`)).json()) as Manifest;
  const size = Math.min(manifest.size, GROUND_ALBEDO_MAX);
  // Pháp tuyến/độ nhám tải ở nửa độ phân giải (chi tiết vi mô mềm hơn chút, đổi lấy ~32 MB VRAM: ngân sách texture 512 MB).
  const nsize = Math.min(manifest.size >> 1, GROUND_NORMAL_MAX);
  const layerBytes = size * size * 4;
  const nLayerBytes = nsize * nsize * 4;
  const albedo = new Uint8Array(layerBytes * manifest.layers.length);
  const normal = new Uint8Array(nLayerBytes * manifest.layers.length);
  for (let i = 0; i < manifest.layers.length; i++) {
    const L = manifest.layers[i]!;
    const [a, n] = await Promise.all([decode(`${base}${set}/${L.a}`, size), decode(`${base}${set}/${L.n}`, nsize)]);
    albedo.set(a, i * layerBytes);
    normal.set(n, i * nLayerBytes);
    if (signal?.aborted) throw new Error('aborted');
    await new Promise((r) => setTimeout(r, 0));
  }
  let cur = await makeMask(base, set, manifest, kind);
  const tex = arrayTexture(albedo, size, manifest.layers.length, true);
  const nor = arrayTexture(normal, nsize, manifest.layers.length, false);
  const out: GroundTextures = {
    albedo: tex,
    normal: nor,
    set,
    mask: cur.tex,
    maskKind: kind,
    async prepareMask(next) {
      if (next === out.maskKind) return () => undefined;
      const fresh = await makeMask(base, set, manifest, next);
      return () => {
        cur.dispose();
        cur = fresh;
        out.mask = fresh.tex;
        out.maskKind = next;
      };
    },
    dispose() {
      neutralizeFreedTexture(tex);
      neutralizeFreedTexture(nor);
      tex.dispose();
      nor.dispose();
      cur.dispose();
    },
  };
  return out;
}
