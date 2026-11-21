import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AssetCache, assetKey, capTextures, type Manifest } from './assets';

const level = (side: number) => ({ data: new Uint8Array(4), width: side, height: side });

/** Texture nén có chuỗi mip 4096 → 1 (như KTX2 ETC1S đã chuyển mã). */
function compressed(side = 4096): THREE.CompressedTexture {
  const mips = [];
  for (let s = side; s >= 1; s >>= 1) mips.push(level(s));
  return new THREE.CompressedTexture(mips as unknown as ImageData[], side, side, THREE.RGBA_S3TC_DXT5_Format);
}

/** Normal map đã giải RGBA8 (`plainDataTexture`): mức 0 trong `image`, các mức còn lại giữ tạm ở `userData.dtlMips`. */
function plain(side = 4096): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(4), side, side);
  const rest = [];
  for (let s = side >> 1; s >= 1; s >>= 1) rest.push(level(s));
  tex.userData.dtlMips = rest;
  return tex;
}

function model(): { scene: THREE.Group; mat: THREE.MeshStandardMaterial } {
  const mat = new THREE.MeshStandardMaterial({ map: compressed(), roughnessMap: compressed(), normalMap: plain() });
  mat.metalnessMap = mat.roughnessMap; // một texture dùng ở hai slot chỉ thu nhỏ một lần
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), mat));
  return { scene, mat };
}

const sideOf = (t: THREE.Texture | null) => (t!.image as { width: number }).width;

describe('capTextures (N-7)', () => {
  it('bỏ mức mip lớn hơn trần; normal theo trần riêng; không còn mip giữ tạm', () => {
    const { scene, mat } = model();
    expect(capTextures(scene, 1024, 512)).toBe(3);
    expect(sideOf(mat.map)).toBe(1024);
    const mips = (mat.map as THREE.CompressedTexture).mipmaps!;
    expect(mips[0]!.width).toBe(1024);
    expect(mips).toHaveLength(11);
    expect(sideOf(mat.roughnessMap)).toBe(1024);
    expect(sideOf(mat.normalMap)).toBe(512);
    expect(mat.normalMap!.userData.dtlMips).toBeUndefined();
  });

  it('không trần: giữ nguyên cỡ, chỉ dọn mip giữ tạm', () => {
    const { scene, mat } = model();
    expect(capTextures(scene)).toBe(0);
    expect(sideOf(mat.map)).toBe(4096);
    expect(sideOf(mat.normalMap)).toBe(4096);
    expect(mat.normalMap!.userData.dtlMips).toBeUndefined();
  });

  it('texture đã nhỏ hơn trần thì không đổi', () => {
    const mat = new THREE.MeshStandardMaterial({ map: compressed(512), normalMap: plain(512) });
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), mat));
    expect(capTextures(scene, 1024, 1024)).toBe(0);
    expect(sideOf(mat.map)).toBe(512);
  });
});

describe('AssetCache.acquire với trần texture', () => {
  it('assetKey: không trần là id, có trần là khóa riêng', () => {
    expect(assetKey('a')).toBe('a');
    expect(assetKey('a', { maxTexture: Infinity, maxNormal: Infinity })).toBe('a');
    expect(assetKey('a', { maxTexture: 1024, maxNormal: 512 })).toBe('a@1024n512');
    expect(assetKey('a', { maxTexture: 1024 })).toBe('a@1024n1024');
  });

  it('bản có trần và bản đầy đủ là hai bản nạp riêng, handle giữ id gốc, release độc lập', async () => {
    let loads = 0;
    const made: THREE.MeshStandardMaterial[] = [];
    const manifest = { version: 1, assets: { a: { file: 'a.glb', bytes: 10 } } } as unknown as Manifest;
    const cache = new AssetCache({
      base: '/',
      fetchManifest: async () => manifest,
      load: async () => {
        loads++;
        const m = model();
        made.push(m.mat);
        return { scene: m.scene, animations: [] } as unknown as GLTF;
      },
    });
    const full = await cache.acquire('a');
    const small = await cache.acquire('a', { maxTexture: 1024, maxNormal: 512 });
    const small2 = await cache.acquire('a', { maxTexture: 1024, maxNormal: 512 });
    expect(loads).toBe(2);
    expect(full.id).toBe('a');
    expect(small.id).toBe('a');
    expect(sideOf(made[0]!.map)).toBe(4096);
    expect(sideOf(made[1]!.map)).toBe(1024);
    expect(sideOf(made[1]!.normalMap)).toBe(512);
    expect(cache.stats()).toMatchObject({ loaded: 2, refs: 3 });
    small.release();
    full.release();
    expect(cache.stats()).toMatchObject({ loaded: 1, refs: 1 });
    small2.release();
    expect(cache.stats()).toMatchObject({ loaded: 0, refs: 0 });
  });
});
