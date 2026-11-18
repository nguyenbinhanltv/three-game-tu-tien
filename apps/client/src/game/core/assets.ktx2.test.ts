import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createKtx2Loader, isUastcKtx2, type GameKtx2Loader, type Manifest } from './assets';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;

interface Gltf {
  images: { name: string; mimeType: string; bufferView: number }[];
  textures: { extensions?: { KHR_texture_basisu?: { source: number } } }[];
  materials: {
    normalTexture?: { index: number };
    pbrMetallicRoughness?: { baseColorTexture?: { index: number }; metallicRoughnessTexture?: { index: number } };
  }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[];
}

/** Đọc thẳng container GLB (không qua loader): JSON + khối BIN, trả byte của ảnh mà một texture trỏ tới. */
function ktx2Images(id: string) {
  const glb = fs.readFileSync(path.join(PUBLIC_ASSETS, MANIFEST.assets[id]!.file));
  const jsonLen = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf;
  const binStart = 20 + jsonLen + 8;
  const image = (texture: number): ArrayBuffer => {
    const img = gltf.images[gltf.textures[texture]!.extensions!.KHR_texture_basisu!.source]!;
    expect(img.mimeType).toBe('image/ktx2');
    const view = gltf.bufferViews[img.bufferView]!;
    expect(view.buffer).toBe(0);
    const start = binStart + (view.byteOffset ?? 0);
    return new Uint8Array(glb.subarray(start, start + view.byteLength)).buffer;
  };
  const mat = gltf.materials.find((m) => m.normalTexture && m.pbrMetallicRoughness?.baseColorTexture)!;
  return {
    normal: image(mat.normalTexture!.index),
    color: image(mat.pbrMetallicRoughness!.baseColorTexture!.index),
    orm: image(mat.pbrMetallicRoughness!.metallicRoughnessTexture!.index),
  };
}

describe('isUastcKtx2 (chọn đường cho normal map)', () => {
  // Pipeline nén normal map bằng UASTC, mọi thứ khác bằng ETC1S (tools/asset-pipeline/src/ktx.ts): đổi quy ước đó là test này báo.
  for (const id of ['chr_kiem_tu_nam', 'boss_han_giao', 'set_dia_long_ho_giap_nam']) {
    it(`${id}: normal map là UASTC, màu và ORM là ETC1S`, () => {
      const t = ktx2Images(id);
      expect(isUastcKtx2(t.normal)).toBe(true);
      expect(isUastcKtx2(t.color)).toBe(false);
      expect(isUastcKtx2(t.orm)).toBe(false);
    });
  }

  it('buffer ngắn hơn header KTX2 (48 byte) hoặc rỗng thì false, không ném lỗi', () => {
    expect(isUastcKtx2(new ArrayBuffer(0))).toBe(false);
    expect(isUastcKtx2(new ArrayBuffer(47))).toBe(false);
    expect(isUastcKtx2(ktx2Images('chr_kiem_tu_nam').normal.slice(0, 47))).toBe(false);
  });

  it('vkFormat khác 0 (KTX2 không phải Basis) thì false', () => {
    const buf = ktx2Images('chr_kiem_tu_nam').normal.slice(0, 64);
    new DataView(buf).setUint32(12, 37, true); // VK_FORMAT_R8G8B8A8_UNORM
    expect(isUastcKtx2(buf)).toBe(false);
  });
});

describe('GameKtx2Loader.configure (normal map nén hay giải ra RGBA8)', () => {
  const NONE = {
    astcSupported: false,
    astcHDRSupported: false,
    etc1Supported: false,
    etc2Supported: false,
    dxtSupported: false,
    bptcSupported: false,
    pvrtcSupported: false,
  };
  /** Gán `workerConfig` giả thay cho `detectSupportAsync(renderer)`: Node không có GPU. */
  function configured(support: Partial<typeof NONE>): GameKtx2Loader {
    const loader = createKtx2Loader();
    (loader as unknown as { workerConfig: typeof NONE }).workerConfig = { ...NONE, ...support };
    loader.configure();
    return loader;
  }
  const cases: [string, Partial<typeof NONE>, boolean][] = [
    ['chỉ BC1–3 (WebGPU desktop với three r178)', { dxtSupported: true }, true],
    ['BC1–3 + ETC2, không BC7/ASTC', { dxtSupported: true, etc2Supported: true }, true],
    ['không có định dạng nén nào', {}, true],
    ['có BC7 (WebGL2 desktop)', { dxtSupported: true, bptcSupported: true }, false],
    ['có ASTC', { astcSupported: true }, false],
  ];
  for (const [name, support, uncompressed] of cases) {
    it(`${name}: uastcUncompressed = ${uncompressed}`, () => {
      const loader = configured(support);
      expect(loader.uastcUncompressed).toBe(uncompressed);
      loader.dispose();
    });
  }

  it('chưa dò GPU (workerConfig null) thì chưa quyết định; gọi configure hai lần không tạo thêm loader phụ', () => {
    const fresh = createKtx2Loader();
    expect(fresh.uastcUncompressed).toBe(false);
    const loader = configured({ dxtSupported: true });
    const plain = (loader as unknown as { plain: unknown }).plain;
    loader.configure();
    expect((loader as unknown as { plain: unknown }).plain).toBe(plain);
    loader.dispose();
    expect(loader.uastcUncompressed).toBe(false);
    fresh.dispose();
  });
});
