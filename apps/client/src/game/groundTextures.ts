import * as THREE from 'three/webgpu';

/** Chỉ số lớp trong texture mảng; khớp thứ tự LAYERS ở tools/asset-pipeline/src/terrain-textures.ts. */
export const GROUND_LAYER = { grass: 0, dirt: 1, forest: 2, rock: 3, cliff: 4, sand: 5, paving: 6, gravel: 7 } as const;

export interface GroundTextures {
  /** Albedo sRGB, mảng 8 lớp. */
  albedo: THREE.DataArrayTexture;
  /** R,G = pháp tuyến (z dựng lại ở shader), B = độ nhám. */
  normal: THREE.DataArrayTexture;
  /** R đường mòn, G sân lát đá, B cát, A nhiễu vĩ mô (groundMask.ts). */
  mask: THREE.Texture;
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
  mask: string;
  layers: { layer: string; a: string; n: string }[];
}

async function decode(url: string, size: number): Promise<Uint8ClampedArray> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = new OffscreenCanvas(size, size);
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, size, size);
  bmp.close();
  return g.getImageData(0, 0, size, size).data;
}

interface MaskRec {
  tex: THREE.Texture;
  dispose(): void;
}

/** Mặt nạ vùng: `manifest` = ảnh tính sẵn lúc build; `neutral` = 1 texel (không đường mòn/sân lát/cát, nhiễu vĩ mô trung bình). */
async function makeMask(base: string, manifest: Manifest, kind: GroundMaskKind): Promise<MaskRec> {
  if (kind === 'neutral') {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 128]), 1, 1, THREE.RGBAFormat);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return { tex: t, dispose: () => t.dispose() };
  }
  // Mặt nạ tính sẵn lúc build (groundMask.ts). Dùng thẳng ImageBitmap (không qua canvas) để không bị nhân alpha vào RGB.
  const maskRes = await fetch(`${base}terrain/${manifest.mask}`);
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
  t.needsUpdate = true;
  return t;
}

/**
 * Nạp bộ texture mặt đất (WebP, ~4 MB) sau khi game đã chạy, không nằm trong tải đầu. Giải mã từng lớp
 * một (nhường khung hình giữa các lớp) rồi ghép vào 2 texture mảng, nên shader địa hình chỉ tốn 2 slot
 * texture. VRAM: albedo 8 × 1024² × 4 B + mip ≈ 43 MB, pháp tuyến 8 × 512² ≈ 11 MB.
 */
export async function loadGroundTextures(base: string, signal?: { aborted: boolean }, kind: GroundMaskKind = 'manifest'): Promise<GroundTextures> {
  const manifest = (await (await fetch(`${base}terrain/manifest.json`)).json()) as Manifest;
  const size = manifest.size;
  // Pháp tuyến/độ nhám tải ở nửa độ phân giải (chi tiết vi mô mềm hơn chút, đổi lấy ~32 MB VRAM: ngân sách texture 512 MB).
  const nsize = size >> 1;
  const layerBytes = size * size * 4;
  const nLayerBytes = nsize * nsize * 4;
  const albedo = new Uint8Array(layerBytes * manifest.layers.length);
  const normal = new Uint8Array(nLayerBytes * manifest.layers.length);
  for (let i = 0; i < manifest.layers.length; i++) {
    const L = manifest.layers[i];
    const [a, n] = await Promise.all([decode(`${base}terrain/${L.a}`, size), decode(`${base}terrain/${L.n}`, nsize)]);
    albedo.set(a, i * layerBytes);
    normal.set(n, i * nLayerBytes);
    if (signal?.aborted) throw new Error('aborted');
    await new Promise((r) => setTimeout(r, 0));
  }
  let cur = await makeMask(base, manifest, kind);
  const tex = arrayTexture(albedo, size, manifest.layers.length, true);
  const nor = arrayTexture(normal, nsize, manifest.layers.length, false);
  const out: GroundTextures = {
    albedo: tex,
    normal: nor,
    mask: cur.tex,
    maskKind: kind,
    async prepareMask(next) {
      if (next === out.maskKind) return () => undefined;
      const fresh = await makeMask(base, manifest, next);
      return () => {
        cur.dispose();
        cur = fresh;
        out.mask = fresh.tex;
        out.maskKind = next;
      };
    },
    dispose() {
      tex.dispose();
      nor.dispose();
      cur.dispose();
    },
  };
  return out;
}
