import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, type Manifest } from '../assets';
import { ByteBucket, FrameIdle, type HiresCandidate, hiresPolicy, networkAllows, pickNext } from './policy';
import { HiresStreamer } from './streamer';

const MB = 1048576;
const cand = (key: string, dist: number, width = 2048, gpu = 10 * MB, bytes = MB): HiresCandidate => ({ key, assetId: key, dist, file: key, width, bytes, gpuBytes: gpu });

describe('hiresPolicy', () => {
  it('Thấp/Vừa tắt, Cao tầng 1, Cực cao tầng 2', () => {
    expect(hiresPolicy('low', {}).tier).toBe(0);
    expect(hiresPolicy('medium', {}).tier).toBe(0);
    expect(hiresPolicy('high', {}).tier).toBe(1);
    expect(hiresPolicy('ultra', {}).tier).toBe(2);
    expect(hiresPolicy('ultra', {}).maxSide).toBe(4096);
  });
  it('máy ≤ 4 GB hoặc mạng chậm thì tắt', () => {
    expect(hiresPolicy('ultra', { deviceMemory: 4 }).tier).toBe(0);
    expect(hiresPolicy('high', { effectiveType: '3g' }).tier).toBe(0);
    expect(hiresPolicy('high', { saveData: true }).tier).toBe(0);
    expect(networkAllows({ downlink: 0.5 })).toBe(false);
    expect(networkAllows({ downlink: 10, effectiveType: '4g' })).toBe(true);
  });
  it('trần bộ nhớ theo deviceMemory', () => {
    expect(hiresPolicy('high', { deviceMemory: 6 }).memCap).toBeLessThan(hiresPolicy('high', { deviceMemory: 8 }).memCap);
    expect(hiresPolicy('ultra', {}).memCap).toBeLessThanOrEqual(180 * MB);
  });
});

describe('pickNext', () => {
  const pol = hiresPolicy('high', {});
  it('chọn gần camera nhất, bỏ qua đã làm, quá cạnh và quá bộ nhớ', () => {
    const list = [cand('a', 50), cand('b', 10), cand('c', 5, 4096), cand('d', 7, 2048, 200 * MB)];
    expect(pickNext(list, pol, 0, new Set())?.key).toBe('b');
    expect(pickNext(list, pol, 0, new Set(['b']))?.key).toBe('a');
    expect(pickNext(list, pol, pol.memCap - 5 * MB, new Set())).toBeNull();
  });
});

describe('ByteBucket / FrameIdle', () => {
  it('xô byte: nạp theo giây, trần 2 giây, trừ được âm', () => {
    const b = new ByteBucket(MB);
    expect(b.canStart()).toBe(false);
    b.refill(10);
    b.spend(5 * MB);
    expect(b.canStart()).toBe(false); // 2 MB - 5 MB
    b.refill(4);
    expect(b.canStart()).toBe(true);
  });
  it('rảnh khi trung bình khung thấp và đủ mẫu', () => {
    const f = new FrameIdle(22);
    for (let i = 0; i < 5; i++) f.push(8);
    expect(f.idle()).toBe(false);
    for (let i = 0; i < 30; i++) f.push(8);
    expect(f.idle()).toBe(true);
    for (let i = 0; i < 30; i++) f.push(40);
    expect(f.idle()).toBe(false);
  });
});

describe('HiresStreamer', () => {
  function setup(quality: { v: string }) {
    const applied: string[] = [];
    let mem = 0;
    let reverts = 0;
    let t = 0;
    const cands = [cand('far', 100), cand('near', 5)];
    const host = {
      hiresCandidates: () => cands.filter((c) => !applied.includes(c.key)),
      hiresMemory: () => mem,
      applyHires: async (c: HiresCandidate) => {
        applied.push(c.key);
        mem += c.gpuBytes;
        return true;
      },
      revertHires: () => {
        reverts++;
        applied.length = 0;
        mem = 0;
      },
    };
    const s = new HiresStreamer(host, { quality: () => quality.v, nav: () => ({}), ready: () => true, now: () => t });
    return { s, applied, advance: (ms: number) => (t += ms), reverts: () => reverts };
  }
  it('không tải ở Vừa; tải gần trước ở Cao; hạ về Vừa thì trả texture', async () => {
    const q = { v: 'medium' };
    const { s, applied, advance, reverts } = setup(q);
    for (let i = 0; i < 6; i++) {
      advance(500);
      await s.tick();
    }
    expect(applied).toEqual([]);
    q.v = 'high';
    for (let i = 0; i < 12; i++) {
      advance(500);
      await s.tick();
    }
    expect(applied[0]).toBe('near');
    expect(applied).toContain('far');
    q.v = 'medium';
    advance(500);
    await s.tick();
    expect(applied).toEqual([]);
    expect(reverts()).toBeGreaterThan(0);
  });
  it('mạng chậm thì dừng 30 s', async () => {
    const q = { v: 'high' };
    let t = 0;
    const applied: string[] = [];
    const host = {
      hiresCandidates: () => [cand('x', 1, 2048, MB, 2 * MB), cand('y', 2, 2048, MB, 2 * MB)].filter((c) => !applied.includes(c.key)),
      hiresMemory: () => 0,
      applyHires: async (c: HiresCandidate) => {
        t += 20000; // 2 MB trong 20 s = 100 KB/s
        applied.push(c.key);
        return true;
      },
      revertHires: () => undefined,
    };
    const s = new HiresStreamer(host, { quality: () => q.v, nav: () => ({}), ready: () => true, now: () => t });
    for (let i = 0; i < 6; i++) {
      t += 500;
      await s.tick();
    }
    expect(applied).toEqual(['x']);
    t += 31000;
    for (let i = 0; i < 6; i++) {
      t += 500;
      await s.tick();
    }
    expect(applied).toEqual(['x', 'y']);
  });
});

describe('AssetCache.applyHires', () => {
  it('thay texture của vật liệu cùng tên, trả lại khi revert, dispose khi release', async () => {
    const disposed: string[] = [];
    const old = new THREE.Texture();
    old.colorSpace = THREE.SRGBColorSpace;
    old.addEventListener('dispose', () => disposed.push('old'));
    const mat = new THREE.MeshStandardMaterial({ map: old });
    mat.name = 'm1';
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
    const manifest: Manifest = {
      version: 1,
      assets: { boss_x: { id: 'boss_x', file: 'boss_x.glb', bytes: 1, triangles: 1, skinned: false, ktx2: false, lods: [], hires: [{ mat: 'm1', slots: ['map', 'normalMap'], file: 'hi/boss_x.map.ktx2', width: 2048, height: 2048, bytes: 10, gpuBytes: 5 * MB }] } },
    };
    const hi = new THREE.Texture();
    hi.addEventListener('dispose', () => disposed.push('hi'));
    const cache = new AssetCache({
      base: '/a/',
      fetchManifest: async () => manifest,
      load: async () => ({ scene, scenes: [scene], animations: [], cameras: [], asset: {}, parser: null as never, userData: {} }),
      loadTexture: async () => hi,
    });
    const h = await cache.acquire('boss_x');
    const [c] = cache.hiresCandidates();
    expect(c.file).toBe('hi/boss_x.map.ktx2');
    expect(await cache.applyHires(c)).toBe(true);
    expect(mat.map).toBe(hi);
    expect(hi.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(mat.normalMap).toBeNull();
    expect(cache.hiresMemory()).toBe(5 * MB);
    expect(cache.hiresCandidates()).toHaveLength(0);
    cache.revertHires();
    expect(mat.map).toBe(old);
    expect(disposed).toContain('hi');
    expect(cache.hiresMemory()).toBe(0);
    h.release();
  });
});
