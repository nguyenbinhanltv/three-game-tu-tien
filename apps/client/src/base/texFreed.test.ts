import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { markCpuFreed, neutralizeFreedTexture } from './texFreed';

describe('neutralizeFreedTexture', () => {
  it('texture nén đã bỏ bản CPU: thay bằng một khối 4×4 hợp lệ (nạp lại không lỗi writeTexture)', () => {
    const t = new THREE.CompressedTexture(
      [{ data: null as unknown as Uint8Array, width: 512, height: 512 }],
      512,
      512,
      THREE.RGBA_ASTC_4x4_Format,
    );
    markCpuFreed(t);
    neutralizeFreedTexture(t);
    const m = t.mipmaps![0] as { data: Uint8Array; width: number; height: number };
    expect(t.mipmaps).toHaveLength(1);
    expect(m.data).toBeInstanceOf(Uint8Array);
    expect(m.data.length).toBe(576);
    expect([m.width, m.height, t.image.width, t.image.height]).toEqual([24, 24, 24, 24]);
  });

  it('mip 24×24 chia hết mọi khối nén 4/6/8/12: vùng ghi của three không vượt texture', () => {
    for (const blk of [4, 6, 8, 12]) {
      const m = 24;
      expect(Math.ceil(m / blk) * blk).toBeLessThanOrEqual(m);
    }
  });

  it('mảng mặt đất (DataArrayTexture) đã bỏ bản CPU: 1×1 giữ số lớp', () => {
    const t = new THREE.DataArrayTexture(null as unknown as BufferSource as Uint8Array<ArrayBuffer>, 2048, 2048, 8);
    markCpuFreed(t);
    neutralizeFreedTexture(t);
    const im = t.image as { data: Uint8Array; width: number; height: number; depth: number };
    expect([im.width, im.height, im.depth]).toEqual([1, 1, 8]);
    expect(im.data.length).toBeGreaterThanOrEqual(4 * 8);
  });

  it('DataTexture đã bỏ bản CPU: 1×1 RGBA', () => {
    const t = new THREE.DataTexture(null as unknown as Uint8Array, 256, 256);
    markCpuFreed(t);
    neutralizeFreedTexture(t);
    expect((t.image.data as Uint8Array).length).toBeGreaterThanOrEqual(4);
    expect([t.image.width, t.image.height]).toEqual([1, 1]);
  });

  it('không đổi Source dùng chung với bản sao còn sống (Texture.clone)', () => {
    const t = new THREE.DataTexture(null as unknown as Uint8Array, 256, 256);
    const live = t.clone();
    markCpuFreed(t);
    neutralizeFreedTexture(t);
    expect(live.image.width).toBe(256);
    expect(t.image.width).toBe(1);
  });

  it('texture chưa bỏ bản CPU: giữ nguyên', () => {
    const data = new Uint8Array(64);
    const t = new THREE.DataTexture(data, 4, 4);
    neutralizeFreedTexture(t);
    expect(t.image.data).toBe(data);
    expect(t.image.width).toBe(4);
  });
});
