import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, type Manifest } from '../core/assets';
import { adoptGltfMaterials } from '../../render/materials/world';
import { ByteBucket, FrameIdle, type HiresCandidate, hiresPolicy, networkAllows, pickNext, planEviction } from './policy';
import { HiresStreamer } from './streamer';

const MB = 1048576;
const cand = (key: string, dist: number, width = 2048, gpu = 10 * MB, bytes = MB): HiresCandidate => ({
  key,
  assetId: key,
  dist,
  file: key,
  width,
  bytes,
  gpuBytes: gpu,
});

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
        return 'ok' as const;
      },
      hiresApplied: () => [],
      revertHiresFile: () => undefined,
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
        return 'ok' as const;
      },
      hiresApplied: () => [],
      revertHiresFile: () => undefined,
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
      assets: {
        boss_x: {
          id: 'boss_x',
          file: 'boss_x.glb',
          bytes: 1,
          triangles: 1,
          skinned: false,
          ktx2: false,
          lods: [],
          hires: [
            { mat: 'm1', slots: ['map', 'normalMap'], file: 'hi/boss_x.map.ktx2', width: 2048, height: 2048, bytes: 10, gpuBytes: 5 * MB },
          ],
        },
      },
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
    const c = cache.hiresCandidates()[0]!;
    expect(c.file).toBe('hi/boss_x.map.ktx2');
    expect(await cache.applyHires(c)).toBe('ok');
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

describe('planEviction / trần bộ nhớ đầy', () => {
  it('đuổi tệp ở xa nhất để nhường chỗ cho ứng viên gần, không đuổi tệp gần hơn', () => {
    const want = cand('near', 5, 2048, 40 * MB);
    const applied = [
      { key: 'a', dist: 10, gpuBytes: 40 * MB },
      { key: 'b', dist: 80, gpuBytes: 40 * MB },
      { key: 'c', dist: 200, gpuBytes: 40 * MB },
    ];
    // trần 128 MB, đang dùng 120 MB: cần giải phóng ≥ 32 MB → đuổi c (xa nhất), không đụng a, b
    expect(planEviction(want, applied, 120 * MB, 128 * MB)).toEqual(['c']);
    // ứng viên xa hơn mọi tệp đã áp dụng → không đuổi
    expect(planEviction(cand('far', 300, 2048, 40 * MB), applied, 120 * MB, 128 * MB)).toBeNull();
    // đuổi hết vẫn không đủ → null
    expect(planEviction(cand('huge', 5, 2048, 200 * MB), applied, 120 * MB, 128 * MB)).toBeNull();
  });
  it('streamer tải ứng viên gần khi đầy trần bằng cách trả tệp xa', async () => {
    let t = 0;
    const applied = new Map<string, { dist: number; gpu: number }>([
      ['far1', { dist: 150, gpu: 60 * MB }],
      ['far2', { dist: 120, gpu: 60 * MB }],
    ]);
    const reverted: string[] = [];
    const host = {
      hiresCandidates: () => [cand('boss', 6, 2048, 60 * MB)].filter((c) => !applied.has(c.key)),
      hiresMemory: () => [...applied.values()].reduce((a, x) => a + x.gpu, 0),
      applyHires: async (c: HiresCandidate) => {
        applied.set(c.key, { dist: c.dist, gpu: c.gpuBytes });
        return 'ok' as const;
      },
      hiresApplied: () => [...applied].map(([key, v]) => ({ key, dist: v.dist, gpuBytes: v.gpu })),
      revertHiresFile: (k: string) => {
        reverted.push(k);
        applied.delete(k);
      },
      revertHires: () => undefined,
    };
    const s = new HiresStreamer(host, { quality: () => 'high', nav: () => ({}), ready: () => true, now: () => t });
    for (let i = 0; i < 6; i++) {
      t += 500;
      await s.tick();
    }
    expect(reverted).toEqual(['far1']);
    expect(applied.has('boss')).toBe(true);
  });
});

describe('streamer: hủy do revert không làm nhiễm skip', () => {
  it('Cao → Vừa giữa lúc tải → Cao: tệp vẫn được tải lại', async () => {
    const q = { v: 'high' };
    let t = 0;
    let release: (r: 'ok' | 'stale') => void = () => undefined;
    let calls = 0;
    const host = {
      hiresCandidates: () => [cand('x', 1, 2048, MB, 100)],
      hiresMemory: () => 0,
      applyHires: () => {
        calls++;
        return new Promise<'ok' | 'stale'>((res) => (release = res));
      },
      hiresApplied: () => [],
      revertHiresFile: () => undefined,
      revertHires: () => undefined,
    };
    const s = new HiresStreamer(host, { quality: () => q.v, nav: () => ({}), ready: () => true, now: () => t });
    t += 500;
    void s.tick();
    t += 500;
    void s.tick();
    expect(calls).toBe(1);
    q.v = 'medium';
    t += 500;
    await s.tick(); // revert + skip.clear
    release('stale'); // lần tải dở kết thúc sau revert
    await new Promise((r) => setTimeout(r, 0));
    q.v = 'high';
    for (let i = 0; i < 4; i++) {
      t += 500;
      void s.tick(); // lần tải thứ hai treo (promise chưa giải): không await
    }
    expect(calls).toBe(2);
  });
});

function fakeCache(srcMat: THREE.MeshStandardMaterial, hi: THREE.Texture): AssetCache {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), srcMat));
  const manifest: Manifest = {
    version: 1,
    assets: {
      mon_x: {
        id: 'mon_x',
        file: 'mon_x.glb',
        bytes: 1,
        triangles: 1,
        skinned: false,
        ktx2: false,
        lods: [],
        hires: [{ mat: 'm1', slots: ['map'], file: 'hi/mon_x.ktx2', width: 2048, height: 2048, bytes: 1, gpuBytes: MB }],
      },
    },
  };
  return new AssetCache({
    base: '/a/',
    fetchManifest: async () => manifest,
    load: async () => ({ scene, scenes: [scene], animations: [], cameras: [], asset: {}, parser: null as never, userData: {} }),
    loadTexture: async () => hi,
  });
}

describe('AssetCache.applyHires với material dẫn xuất (adoptGltfMaterials)', () => {
  it('material đang vẽ nhận texture mới và được trả lại khi revert, kể cả tạo sau khi áp dụng', async () => {
    const old = new THREE.Texture();
    const src = new THREE.MeshStandardMaterial({ map: old });
    src.name = 'm1';
    const hi = new THREE.Texture();
    const cache = fakeCache(src, hi);
    const h = await cache.acquire('mon_x');
    const before = adoptGltfMaterials(h.scene)[0]!;
    expect(before.map).toBe(old);
    const c = cache.hiresCandidates()[0]!;
    expect(await cache.applyHires(c)).toBe('ok');
    expect(before.map).toBe(hi);
    // material dẫn xuất tạo SAU khi áp dụng chép texture bậc cao từ material gốc; revert cũng phải trả nó
    const h2 = await cache.acquire('mon_x');
    const after = adoptGltfMaterials(h2.scene)[0]!;
    expect(after.map).toBe(hi);
    cache.revertHires();
    expect(before.map).toBe(old);
    expect(after.map).toBe(old);
    expect(src.map).toBe(old);
    h.release();
    h2.release();
  });
  it('revertHiresFile trả đúng một tệp', async () => {
    const old = new THREE.Texture();
    const src = new THREE.MeshStandardMaterial({ map: old });
    src.name = 'm1';
    const cache = fakeCache(src, new THREE.Texture());
    const h = await cache.acquire('mon_x');
    await cache.applyHires(cache.hiresCandidates()[0]!);
    expect(cache.hiresApplied().map((a) => a.key)).toEqual(['mon_x#hi/mon_x.ktx2']);
    cache.revertHiresFile('mon_x#hi/mon_x.ktx2');
    expect(src.map).toBe(old);
    expect(cache.hiresMemory()).toBe(0);
    h.release();
  });
});

describe('AssetCache.trackInstance: khoảng cách theo bản đang vẽ', () => {
  it('handle mẫu tách rời không tính; dist theo bản clone gần nhất; bản gỡ khỏi cảnh thì bỏ; đuổi chạy được', async () => {
    const src = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    src.name = 'm1';
    const cache = fakeCache(src, new THREE.Texture());
    cache.setViewer(0, 0);
    const world = new THREE.Scene();
    const tpl = await cache.acquire('mon_x'); // bản mẫu: không đưa vào cảnh (như MonsterSkins)
    const near = tpl.scene.clone(true);
    const far = tpl.scene.clone(true);
    near.position.set(6, 0, 0);
    far.position.set(300, 0, 0);
    world.add(near, far);
    world.updateMatrixWorld(true);
    expect(cache.hiresCandidates()[0]!.dist).toBe(Infinity); // chưa khai báo: không biết vị trí
    cache.trackInstance('mon_x', near);
    cache.trackInstance('mon_x', far);
    expect(cache.hiresCandidates()[0]!.dist).toBeCloseTo(6);
    world.remove(near);
    expect(cache.hiresCandidates()[0]!.dist).toBeCloseTo(300);
    // đuổi: tệp đã áp dụng ở xa (300 m) nhường chỗ cho ứng viên ở 6 m
    await cache.applyHires(cache.hiresCandidates()[0]!);
    const applied = cache.hiresApplied();
    expect(applied[0]!.dist).toBeCloseTo(300);
    const want = { key: 'k', assetId: 'x', dist: 6, file: 'f', width: 2048, bytes: 1, gpuBytes: MB };
    expect(planEviction(want, applied, 128 * MB, 128 * MB)).toEqual(['mon_x#hi/mon_x.ktx2']);
    tpl.release();
  });
});
