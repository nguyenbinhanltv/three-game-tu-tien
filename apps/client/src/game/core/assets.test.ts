import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { AssetCache, type Manifest } from './assets';
import { nodeGltfLoader } from './gltfTestLoader';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');

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

  it('progress cộng byte theo manifest và theo onBytes của loader', async () => {
    const m = manifestOf('arch_a', 'arch_b');
    m.assets.arch_a!.bytes = 100;
    m.assets.arch_b!.bytes = 300;
    let finishB: (() => void) | null = null;
    const cache = new AssetCache({
      fetchManifest: async () => m,
      load: (url, onBytes) => {
        if (url.includes('arch_a')) return Promise.resolve(fakeGltf([]));
        onBytes?.(120);
        return new Promise<GLTF>((r) => (finishB = () => r(fakeGltf([]))));
      },
    });
    expect(cache.progress()).toEqual({ loaded: 0, total: 0 });
    const a = await cache.acquire('arch_a');
    const pb = cache.acquire('arch_b');
    await new Promise((r) => setTimeout(r, 0));
    expect(cache.progress()).toEqual({ loaded: 220, total: 400 });
    finishB!();
    const b = await pb;
    expect(cache.progress()).toEqual({ loaded: 400, total: 400 });
    a.release();
    b.release();
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
        order.push(url.split('.')[0]!);
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

  it('prefetch tải byte theo ưu tiên, acquire parse từ byte đã có (không tải lại)', async () => {
    const fetched: string[] = [];
    const parsed: string[] = [];
    const loaded: string[] = [];
    let unblock!: () => void;
    const gate = new Promise<void>((r) => (unblock = r));
    const m = manifestOf('first', 'chr', 'arch', 'mon', 'fx');
    m.assets.chr!.bytes = 50;
    const cache = new AssetCache({
      base: '',
      concurrency: 1,
      fetchManifest: async () => m,
      fetchBytes: async (url, onBytes) => {
        fetched.push(url.split('.')[0]!);
        if (url.startsWith('first')) await gate;
        onBytes(50);
        return new ArrayBuffer(8);
      },
      parse: async (_d, url) => {
        parsed.push(url.split('.')[0]!);
        return fakeGltf([]);
      },
      load: async (url) => {
        loaded.push(url.split('.')[0]!);
        return fakeGltf([]);
      },
    });
    cache.setViewer(0, 0);
    cache.prefetch('first');
    cache.prefetch('fx', { priority: 400 });
    cache.prefetch('mon', { priority: 120 });
    cache.prefetch('arch', { pos: { x: 40, z: 0 } });
    cache.prefetch('chr', { priority: 0 });
    cache.prefetch('chr'); // gọi lại không xếp hàng thêm
    await new Promise((r) => setTimeout(r, 0));
    // `chr` đang chờ trong hàng: acquire nâng ưu tiên và nhận byte của lần tải trước.
    const hChr = cache.acquire('chr', { priority: 0 });
    unblock();
    const h = await hChr;
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched).toEqual(['first', 'chr', 'arch', 'mon', 'fx']);
    expect(parsed).toEqual(['chr']);
    expect(loaded).toEqual([]);
    expect(cache.progress().loaded).toBeGreaterThanOrEqual(50);
    // Asset đã tải trước: acquire chỉ parse.
    const hMon = await cache.acquire('mon');
    expect(parsed).toEqual(['chr', 'mon']);
    expect(fetched.filter((f) => f === 'mon')).toHaveLength(1);
    // Asset đã có bản gốc: prefetch không làm gì.
    cache.prefetch('chr');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched.filter((f) => f === 'chr')).toHaveLength(1);
    h.release();
    hMon.release();
  });

  it('yêu cầu xếp cùng lượt được xếp hạng cùng nhau (việc xếp trước không chiếm luồng)', async () => {
    const order: string[] = [];
    const cache = new AssetCache({
      base: '',
      concurrency: 1,
      fetchManifest: async () => manifestOf('fx', 'chr'),
      load: async (url) => {
        order.push(url.split('.')[0]!);
        return fakeGltf([]);
      },
    });
    const hs = await Promise.all([cache.acquire('fx', { priority: 400 }), cache.acquire('chr', { priority: 0 })]);
    expect(order).toEqual(['chr', 'fx']);
    for (const h of hs) h.release();
  });

  it('prefetch lỗi thì acquire tự tải lại bằng loader', async () => {
    const loaded: string[] = [];
    const cache = new AssetCache({
      base: '',
      fetchManifest: async () => manifestOf('chr'),
      fetchBytes: async () => {
        throw new Error('mạng');
      },
      parse: async () => {
        throw new Error('không được parse');
      },
      load: async (url) => {
        loaded.push(url);
        return fakeGltf([]);
      },
    });
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      cache.prefetch('chr');
      await new Promise((r) => setTimeout(r, 0));
      const h = await cache.acquire('chr');
      expect(loaded).toEqual(['chr.abc.glb']);
      h.release();
    } finally {
      console.warn = warn;
    }
  });

  it('prefetch asset không có trong manifest thì bỏ qua', async () => {
    const fetched: string[] = [];
    const cache = new AssetCache({
      fetchManifest: async () => manifestOf(),
      fetchBytes: async (url) => {
        fetched.push(url);
        return new ArrayBuffer(0);
      },
    });
    cache.prefetch('nope');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetched).toEqual([]);
    expect(cache.stats()).toEqual({ loaded: 0, loading: 0, refs: 0 });
  });

  it('parse được arch_sect thật (meshopt + quantize) bằng loader chung', async () => {
    const m = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
    const a = m.assets.arch_sect!;
    expect(a).toBeDefined();
    const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, a.file));
    const loader = nodeGltfLoader();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await loader.parseAsync(ab, '');
    let tris = 0;
    const mats = new Set<THREE.MeshStandardMaterial>();
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (o.userData.lod ?? 0) > 0) return;
      const g = mesh.geometry;
      tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
      expect(g.attributes.color).toBeDefined();
      mats.add(mesh.material as THREE.MeshStandardMaterial);
    });
    expect(tris).toBe(a.triangles);
    // Vật liệu PBR theo chất liệu (M2-9): màu đỉnh nhân texture chi tiết lặp theo KHR_texture_transform.
    const tile = [...mats].find((m) => m.name === 'arch_sect_tile');
    expect(tile?.vertexColors).toBe(true);
    expect(tile?.map?.repeat.x).toBeGreaterThan(1);
    expect([...mats].some((m) => m.metalness > 0)).toBe(true);
  });
});

describe('boxDown', () => {
  it('thu RGBA8 2×2 về 1×1 bằng trung bình, giữ nguyên khi đã đủ nhỏ', async () => {
    const { boxDown } = await import('./assets');
    const d = new Uint8Array([0, 0, 0, 255, 100, 200, 50, 255, 100, 0, 0, 255, 200, 200, 250, 255]);
    const r = boxDown({ data: d, width: 2, height: 2 }, 1);
    expect([r.width, r.height]).toEqual([1, 1]);
    expect([...r.data]).toEqual([100, 100, 75, 255]);
    expect(boxDown({ data: d, width: 2, height: 2 }, 4).data).toBe(d);
  });
});
