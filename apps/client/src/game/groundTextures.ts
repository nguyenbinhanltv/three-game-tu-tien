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
  dispose(): void;
}

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
export async function loadGroundTextures(base: string, signal?: { aborted: boolean }): Promise<GroundTextures> {
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
  const tex = arrayTexture(albedo, size, manifest.layers.length, true);
  const nor = arrayTexture(normal, nsize, manifest.layers.length, false);
  return {
    albedo: tex,
    normal: nor,
    mask,
    dispose() {
      tex.dispose();
      nor.dispose();
      mask.dispose();
      maskBmp.close();
    },
  };
}
