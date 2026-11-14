import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { MONSTER } from '@dtl/content';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../assets';
import { MonsterModel } from '../models';
import { MonsterSkins } from './monsterSkins';
import { lodLevel, mixerInterval, SkinnedMonster } from './skinned';
import { baseState, clipFor } from './states';
import { type AnimState, legacyModelsRequested } from './view';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;

const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });

/** Parse GLB thật trong node (thay texture bằng Texture rỗng vì node không giải mã ảnh); đếm dispose. */
async function loadReal(file: string, disposed: string[]): Promise<GLTF> {
  const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, file));
  const loader = createGltfLoader(createKtx2Loader());
  loader.register(() => ({
    name: 'test_stub_texture',
    loadTexture: () => {
      const t = new THREE.Texture();
      t.addEventListener('dispose', () => disposed.push('texture'));
      return Promise.resolve(t);
    },
  }));
  const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.addEventListener('dispose', () => disposed.push('geometry'));
  });
  return gltf;
}

async function wolfSkins(disposed: string[] = [], fail = false) {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      if (fail) throw new Error('mạng lỗi');
      return loadReal(url, disposed);
    },
  });
  const skins = new MonsterSkins(cache, false);
  skins.preload();
  for (let i = 0; i < 50 && skins.pending(MONSTER.get('mon_soi_xam')!); i++) await new Promise((r) => setTimeout(r, 10));
  return { cache, skins };
}

/** Chạy n khung 1/60 giây. */
function run(m: SkinnedMonster, a: AnimState, sec: number) {
  for (let t = 0; t < sec; t += 1 / 60) m.update(1 / 60, a);
}

describe('máy trạng thái', () => {
  it('ưu tiên chết > thiền > bay > trên không > niệm chú > di chuyển > đứng', () => {
    expect(baseState(anim({ dead: true, flying: true, speed: 9 }), 2.5)).toBe('death');
    expect(baseState(anim({ meditating: true, flying: true }), 2.5)).toBe('meditate');
    expect(baseState(anim({ flying: true, speed: 9 }), 2.5)).toBe('fly');
    expect(baseState(anim({ airborne: true, speed: 9 }), 2.5)).toBe('jump');
    expect(baseState(anim({ casting: true }), 2.5)).toBe('cast');
    expect(baseState(anim({ speed: 1 }), 2.5)).toBe('walk');
    expect(baseState(anim({ speed: 5 }), 2.5)).toBe('run');
    expect(baseState(anim({ speed: 0.1, combat: true }), 2.5)).toBe('combatIdle');
    expect(baseState(anim(), 2.5)).toBe('idle');
  });

  it('clip thiếu thì lùi theo chuỗi', () => {
    const map = { idle: 'idle', run: 'run' };
    const has = (c: string) => c === 'idle' || c === 'run';
    expect(clipFor('walk', map, has)).toBe('run');
    expect(clipFor('cast', map, has)).toBe('idle');
    expect(clipFor('fly', map, has)).toBe('idle');
    expect(clipFor('attack', map, has)).toBeNull();
  });

  it('?models=legacy', () => {
    expect(legacyModelsRequested('?mute=1&models=legacy')).toBe(true);
    expect(legacyModelsRequested('?mute=1')).toBe(false);
  });

  it('mixer: LOD0 mỗi khung, LOD1 ≤15 Hz, LOD2 thưa hơn, ngoài khung nhìn không chạy', () => {
    expect(mixerInterval(0, true, true)).toBe(0);
    expect(mixerInterval(0, false, true)).toBe(0);
    expect(mixerInterval(0)).toBeLessThanOrEqual(1 / 60);
    expect(mixerInterval(1)).toBeGreaterThanOrEqual(1 / 15);
    expect(mixerInterval(2)).toBeGreaterThan(mixerInterval(1));
    expect(mixerInterval(0, false)).toBe(Infinity);
  });

  it('LOD theo khoảng cách camera, hết suất LOD0 thì tối thiểu LOD1', () => {
    expect(lodLevel(5, [22, 55], true, 3)).toBe(0);
    expect(lodLevel(5, [22, 55], false, 3)).toBe(1);
    expect(lodLevel(30, [22, 55], true, 3)).toBe(1);
    expect(lodLevel(80, [22, 55], false, 3)).toBe(2);
    expect(lodLevel(80, [22, 55], true, 1)).toBe(0);
  });
});

describe('sói có xương (mon_soi_xam thật)', () => {
  it('ba loài sói dùng model mới, quái khác vẫn model khối', async () => {
    const { skins } = await wolfSkins();
    for (const id of ['mon_soi_xam', 'mon_yeu_lang', 'mon_u_minh_lang']) {
      const m = skins.create(MONSTER.get(id)!);
      expect(m).toBeInstanceOf(SkinnedMonster);
      expect(m.root.scale.x).toBeCloseTo(MONSTER.get(id)!.scale);
      m.dispose();
    }
    const other = [...MONSTER.values()].find((d) => d.model !== 'wolf')!;
    expect(skins.create(other)).toBeInstanceOf(MonsterModel);
    skins.dispose();
  });

  it('tông màu riêng mỗi loài, dùng chung texture', async () => {
    const { skins } = await wolfSkins();
    const mats = ['mon_soi_xam', 'mon_yeu_lang', 'mon_u_minh_lang'].map((id) => {
      const m = skins.create(MONSTER.get(id)!);
      let mat!: THREE.MeshStandardNodeMaterial;
      m.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) mat = (o as THREE.Mesh).material as THREE.MeshStandardNodeMaterial;
      });
      m.dispose();
      return mat;
    });
    expect(new Set(mats).size).toBe(3);
    expect(mats[1].map).toBe(mats[0].map);
    expect(mats[1].color.getHex()).not.toBe(mats[0].color.getHex());
    skins.dispose();
  });

  it('đi/chạy theo tốc độ, cắn và trúng đòn rồi trở về, chết thì nằm lại', async () => {
    const { skins } = await wolfSkins();
    const w = skins.create(MONSTER.get('mon_soi_xam')!) as SkinnedMonster;
    expect(w.state).toBe('idle');
    run(w, anim({ speed: 5 }), 0.5);
    expect(w.state).toBe('run');
    const runAct = w.actionOf('run')!;
    expect(runAct.timeScale).toBeCloseTo(2, 1); // 5 m/s / 2,5 m/s
    run(w, anim({ speed: 1 }), 0.5);
    expect(w.state).toBe('walk');
    expect(runAct.timeScale).toBeLessThan(1); // đi = clip chạy phát chậm

    w.attack();
    run(w, anim({ combat: true }), 0.3);
    expect(w.state).toBe('attack');
    // Trúng đòn lúc đang cắn: không cắt ngang.
    w.hitReact({});
    expect(w.state).toBe('attack');
    run(w, anim({ combat: true }), 0.8);
    expect(w.state).toBe('combatIdle');

    w.hitReact({ delay: 0.1 });
    expect(w.state).toBe('combatIdle');
    run(w, anim({ combat: true }), 0.15);
    expect(w.state).toBe('hit');
    run(w, anim(), 0.6);
    expect(w.state).toBe('idle');

    run(w, anim({ dead: true }), 2);
    expect(w.state).toBe('death');
    w.attack();
    expect(w.state).toBe('death');
    const death = w.actionOf('death')!;
    expect(death.time).toBeCloseTo(death.getClip().duration, 2);
    run(w, anim(), 0.5);
    expect(w.state).toBe('idle');
    w.dispose();
    skins.dispose();
  });

  it('hit-stop làm animation khựng', async () => {
    const { skins } = await wolfSkins();
    const w = skins.create(MONSTER.get('mon_soi_xam')!) as SkinnedMonster;
    run(w, anim({ speed: 5 }), 0.3);
    const act = w.actionOf('run')!;
    w.hit.hitStop(0.1);
    const t0 = act.time;
    w.update(0.05, anim({ speed: 5 }));
    expect(act.time).toBe(t0);
    w.dispose();
    skins.dispose();
  });

  it('LOD và tần số mixer theo khoảng cách', async () => {
    const { skins } = await wolfSkins();
    const w = skins.create(MONSTER.get('mon_soi_xam')!) as SkinnedMonster;
    const visibleLods = () => {
      const lv: number[] = [];
      w.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.visible) lv.push(o.userData.lod ?? 0);
      });
      return lv;
    };
    expect(visibleLods()).toEqual([0]);
    w.setViewDistance(40);
    expect(visibleLods()).toEqual([1]);
    w.setViewDistance(200);
    expect(visibleLods()).toEqual([2]);
    // Xa: mixer chỉ chạy khi gộp đủ dt.
    const act = w.actionOf('idle')!;
    const t0 = act.time;
    w.update(1 / 60, anim());
    expect(act.time).toBe(t0);
    for (let i = 0; i < 8; i++) w.update(1 / 60, anim());
    expect(act.time).toBeGreaterThan(t0);
    w.dispose();
    skins.dispose();
  });

  it('vào/ra không rò: bản sao chỉ giữ skeleton riêng, dispose hết thì AssetCache giải phóng bản gốc', async () => {
    const disposed: string[] = [];
    const { cache, skins } = await wolfSkins(disposed);
    const skeletons: string[] = [];
    for (let i = 0; i < 20; i++) {
      const w = skins.create(MONSTER.get('mon_yeu_lang')!) as SkinnedMonster;
      w.root.traverse((o) => {
        const sk = (o as THREE.SkinnedMesh).skeleton;
        if (!sk) return;
        const orig = sk.dispose.bind(sk);
        sk.dispose = () => {
          skeletons.push('sk');
          orig();
        };
      });
      run(w, anim({ speed: 4 }), 0.1);
      w.dispose();
    }
    expect(skeletons.length).toBeGreaterThanOrEqual(20);
    expect(disposed).toEqual([]); // geometry/texture dùng chung chưa bị đụng
    expect(cache.stats()).toEqual({ loaded: 1, loading: 0, refs: 1 });
    skins.dispose();
    expect(cache.stats()).toEqual({ loaded: 0, loading: 0, refs: 0 });
    expect(disposed.filter((d) => d === 'geometry').length).toBe(3);
    expect(disposed).toContain('texture');
  });

  it('nạp lỗi thì dùng model khối', async () => {
    const { skins } = await wolfSkins([], true);
    expect(skins.pending(MONSTER.get('mon_soi_xam')!)).toBe(false);
    expect(skins.create(MONSTER.get('mon_soi_xam')!)).toBeInstanceOf(MonsterModel);
    skins.dispose();
  });
});
