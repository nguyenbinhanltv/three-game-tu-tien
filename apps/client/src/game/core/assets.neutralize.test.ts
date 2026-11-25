import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { neutralizeFreedTexture } from './assets';

describe('neutralizeFreedTexture', () => {
  it('texture nén đã bỏ bản CPU: thay bằng một khối 4×4 hợp lệ (nạp lại không lỗi writeTexture)', () => {
    const t = new THREE.CompressedTexture(
      [{ data: null as unknown as Uint8Array, width: 512, height: 512 }],
      512,
      512,
      THREE.RGBA_ASTC_4x4_Format,
    );
    t.userData.dtlFreed = true;
    neutralizeFreedTexture(t);
    const m = t.mipmaps![0] as { data: Uint8Array; width: number; height: number };
    expect(t.mipmaps).toHaveLength(1);
    expect(m.data).toBeInstanceOf(Uint8Array);
    expect(m.data.length).toBe(16);
    expect([m.width, m.height, t.image.width, t.image.height]).toEqual([4, 4, 4, 4]);
  });

  it('DXT1/ETC1 dùng khối 8 byte', () => {
    for (const fmt of [THREE.RGBA_S3TC_DXT1_Format, THREE.RGB_ETC1_Format]) {
      const t = new THREE.CompressedTexture([{ data: null as unknown as Uint8Array, width: 64, height: 64 }], 64, 64, fmt);
      t.userData.dtlFreed = true;
      neutralizeFreedTexture(t);
      expect((t.mipmaps![0] as { data: Uint8Array }).data.length).toBe(8);
    }
  });

  it('DataTexture đã bỏ bản CPU: 1×1 RGBA', () => {
    const t = new THREE.DataTexture(null as unknown as Uint8Array, 256, 256);
    t.userData.dtlFreed = true;
    neutralizeFreedTexture(t);
    expect((t.image.data as Uint8Array).length).toBe(4);
    expect([t.image.width, t.image.height]).toEqual([1, 1]);
  });

  it('texture chưa bỏ bản CPU: giữ nguyên', () => {
    const data = new Uint8Array(64);
    const t = new THREE.DataTexture(data, 4, 4);
    neutralizeFreedTexture(t);
    expect(t.image.data).toBe(data);
    expect(t.image.width).toBe(4);
  });
});
