import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from './assets';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');

function manifestOf(...ids: string[]): Manifest {
  const assets: Manifest['assets'] = {};
  for (const id of ids) assets[id] = { id, file: `${id}.abc.glb`, bytes: 1, triangles: 1, skinned: false, ktx2: false, lods: [] };
  return { version: 1, assets };
}

/** GLTF giả: một mesh LOD0 + một mesh LOD1, có texture. Đếm số resource bị dispose. */
function fakeGltf(disposed: string[]): GLTF {
  const tex = new THREE.Texture();
  tex.addEventListener('dispose', () => disposed.push('texture'));
  const mat = new THREE.MeshStandardMaterial({ map: tex });
  mat.addEventListener('dispose', () => disposed.push('material'));
  const geo = new THREE.BoxGeometry();
  geo.addEventListener('dispose', () => disposed.push('geometry'));
  const scene = new THREE.Group();
  const lod0 = new THREE.Mesh(geo, mat);
  const lod1 = new THREE.Mesh(geo, mat);
  lod1.userData.lod = 1;
  scene.add(lod0, lod1);
  return { scene, scenes: [scene], animations: [], cameras: [], asset: {}, parser: null as never, userData: {} };
}

describe('AssetCache', () => {
  it('nạp một lần cho nhiều handle, dispose khi handle cuối release', async () => {
    const disposed: string[] = [];
    const urls: string[] = [];
    const cache = new AssetCache({
      base: '/a/',
      fetchManifest: async () => manifestOf('arch_x'),
      load: async (url) => {
        urls.push(url);
        return fakeGltf(disposed);
      },
    });
    const [h1, h2] = await Promise.all([cache.acquire('arch_x'), cache.acquire('arch_x')]);
    expect(urls).toEqual(['/a/arch_x.abc.glb']);
    expect(h1.scene).not.toBe(h2.scene);
    // Bản sao dùng chung geometry với nhau.
    expect((h1.scene.children[0] as THREE.Mesh).geometry).toBe((h2.scene.children[0] as THREE.Mesh).geometry);
    expect(cache.stats()).toEqual({ loaded: 1, loading: 0, refs: 2 });

    const parent = new THREE.Group();
    parent.add(h1.scene);
    h1.release();
    h1.release(); // release hai lần không trừ thêm
    expect(h1.scene.parent).toBeNull();
    expect(disposed).toEqual([]);
    expect(cache.stats().refs).toBe(1);

    h2.release();
    expect(disposed.sort()).toEqual(['geometry', 'material', 'texture']);
    expect(cache.stats()).toEqual({ loaded: 0, loading: 0, refs: 0 });

    // Nạp lại sau khi đã giải phóng.
    const h3 = await cache.acquire('arch_x');
    expect(urls.length).toBe(2);
    h3.release();
  });

  it('chỉ hiện LOD0 trong bản sao', async () => {
    const cache = new AssetCache({ fetchManifest: async () => manifestOf('prop_a'), load: async () => fakeGltf([]) });
    const h = await cache.acquire('prop_a');
    expect(h.scene.children.map((c) => c.visible)).toEqual([true, false]);
    h.release();
  });

  it('asset thiếu trong manifest thì reject và không để lại mục treo', async () => {
    const cache = new AssetCache({ fetchManifest: async () => manifestOf(), load: async () => fakeGltf([]) });
    await expect(cache.acquire('arch_none')).rejects.toThrow(/arch_none/);
    expect(cache.stats()).toEqual({ loaded: 0, loading: 0, refs: 0 });
  });

  it('nạp lỗi thì reject, lần sau thử lại', async () => {
    let fail = true;
    const cache = new AssetCache({
      fetchManifest: async () => manifestOf('arch_x'),
      load: async () => {
        if (fail) throw new Error('mạng');
        return fakeGltf([]);
      },
    });
    await expect(cache.acquire('arch_x')).rejects.toThrow('mạng');
    expect(cache.stats().refs).toBe(0);
    fail = false;
    const h = await cache.acquire('arch_x');
    h.release();
  });

  it('xếp hàng theo khoảng cách tới người xem', async () => {
    const order: string[] = [];
    let unblock!: () => void;
    const gate = new Promise<void>((r) => (unblock = r));
    const cache = new AssetCache({
      base: '',
      concurrency: 1,
      fetchManifest: async () => manifestOf('first', 'far', 'near', 'mid'),
      load: async (url) => {
        order.push(url.split('.')[0]);
        if (url.startsWith('first')) await gate;
        return fakeGltf([]);
      },
    });
    cache.setViewer(100, 100);
    const all = [
      cache.acquire('first'),
      cache.acquire('far', { pos: { x: 900, z: 900 } }),
      cache.acquire('near', { pos: { x: 110, z: 100 } }),
      cache.acquire('mid', { pos: { x: 300, z: 100 } }),
    ];
    await new Promise((r) => setTimeout(r, 0));
    unblock();
    const hs = await Promise.all(all);
    expect(order).toEqual(['first', 'near', 'mid', 'far']);
    for (const h of hs) h.release();
  });

  it('parse được arch_sect thật (meshopt + quantize) bằng loader chung', async () => {
    const m = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
    const a = m.assets.arch_sect;
    expect(a).toBeDefined();
    const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, a.file));
    const loader = createGltfLoader(createKtx2Loader());
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await loader.parseAsync(ab, '');
    let tris = 0;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (o.userData.lod ?? 0) > 0) return;
      const g = mesh.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    expect(tris).toBe(a.triangles);
  });
});
