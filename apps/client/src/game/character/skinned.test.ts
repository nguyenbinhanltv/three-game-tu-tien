import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { MONSTER } from '@dtl/content';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../core/assets';
import { MonsterModel } from '../core/models';
import { MONSTER_SKINS, MonsterSkins } from './monsterSkins';
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
  // Trùng tên plugin KTX2 của three để thay nó tại chỗ (xem gltfTestLoader.ts): tên khác thì KTX2Loader thật chạy trước và lỗi trong Node.
  loader.register(() => ({
    name: 'KHR_texture_basisu',
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
  // Skin E-0 (12 quái bản đồ mở rộng) chưa có dòng trong monsters.json cho tới E-2/E-3/E-4: bỏ qua.
  const ids = Object.keys(MONSTER_SKINS).map((id) => MONSTER.get(id)).filter((d): d is NonNullable<typeof d> => !!d);
  for (let i = 0; i < 200 && ids.some((d) => skins.pending(d)); i++) await new Promise((r) => setTimeout(r, 10));
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

/** Skin của 12 quái E-0 (docs/e0-mon): chưa có dòng trong monsters.json cho tới khi E-2/E-3/E-4 thêm quái, nên các vòng lặp theo dữ liệu bỏ qua. */
const E0_PENDING = Object.keys(MONSTER_SKINS).filter((id) => id.startsWith('mon_') && !MONSTER.get(id));
const LIVE_SKINS = Object.entries(MONSTER_SKINS).filter(([id]) => MONSTER.get(id));

describe('sói có xương (mon_soi_xam thật)', () => {
  it('quái trong bảng dùng model mới theo scale dữ liệu, quái khác vẫn model khối', async () => {
    const { skins } = await wolfSkins();
    for (const [id] of LIVE_SKINS) {
      expect(MONSTER.get(id), id).toBeDefined();
      const m = skins.create(MONSTER.get(id)!);
      expect(m, id).toBeInstanceOf(SkinnedMonster);
      expect(m.root.scale.x).toBeCloseTo(MONSTER.get(id)!.scale);
      m.dispose();
    }
    // Từ khi Hàn Giao có model xương, mọi quái trong dữ liệu đều có skin; quái mới thêm chưa có skin vẫn phải về model khối.
    const other = [...MONSTER.values()].find((d) => !MONSTER_SKINS[d.id]) ?? { ...MONSTER.get('mon_soi_xam')!, id: 'mon_chua_co_skin' };
    expect(skins.create(other)).toBeInstanceOf(MonsterModel);
    skins.dispose();
  });

  it('12 skin E-0 đều nạp lười theo màn, không vào gói tải đầu, đủ clip trong GLB', () => {
    const e0 = Object.entries(MONSTER_SKINS).filter(([id, s]) => id.startsWith('mon_') && ['doan_mach', 'van_hai', 'thien_khuyet'].includes(s.level ?? ''));
    expect(e0.length).toBe(12);
    // Quái đã có dòng trong monsters.json (E2-A thêm bản tạm của Đoạn Mạch, E2-B hoàn thiện) hoặc còn chờ: đủ 12 skin, không thừa id lạ.
    expect(E0_PENDING.every((id) => e0.some(([k]) => k === id))).toBe(true);
    for (const [id, s] of e0) {
      expect(s.lazy, id).toBe(true);
      const anims = (MANIFEST.assets[s.asset] as { animations?: string[] }).animations ?? [];
      for (const st of ['idle', 'run', 'attack', 'hit', 'death'] as const) expect(anims, `${id}.${st}`).toContain(s.clips[st]);
    }
  });

  it('12 skin E-0 dựng được SkinnedMonster từ GLB thật (preloadLazy theo màn), có xương, cast → guard, giải phóng sạch', async () => {
    const disposed: string[] = [];
    const cache = new AssetCache({ base: '', fetchManifest: async () => MANIFEST, load: async (url) => loadReal(url, disposed) });
    const skins = new MonsterSkins(cache, false);
    skins.preload();
    expect(cache.stats().loaded + cache.stats().loading).toBeLessThanOrEqual(LIVE_SKINS.length); // lazy: preload không kéo skin E-0
    const e0 = Object.entries(MONSTER_SKINS).filter(([id, s]) => id.startsWith('mon_') && ['doan_mach', 'van_hai', 'thien_khuyet'].includes(s.level ?? ''));
    const base = MONSTER.get('mon_soi_xam')!;
    const defs = e0.map(([id]) => ({ ...base, id }));
    for (const level of new Set(e0.map(([, s]) => s.level!))) skins.preloadLazy(level);
    for (let i = 0; i < 1500 && defs.some((d) => skins.pending(d)); i++) await new Promise((r) => setTimeout(r, 20));
    for (const d of defs) {
      const skin = MONSTER_SKINS[d.id];
      const m = skins.create(d);
      expect(m, d.id).toBeInstanceOf(SkinnedMonster);
      const sm = m as SkinnedMonster;
      let skeletons = 0;
      sm.root.traverse((o) => ((o as THREE.SkinnedMesh).skeleton ? skeletons++ : 0));
      expect(skeletons, `${d.id}: có skeleton`).toBeGreaterThan(0);
      run(sm, anim({ speed: skin.refSpeed }), 0.3);
      expect(sm.actionOf(skin.clips.run!)?.isRunning(), `${d.id}: run`).toBe(true);
      if (skin.clips.cast) {
        run(sm, anim({ combat: true, casting: true }), 0.4);
        expect(sm.state, `${d.id}: cast`).toBe('cast');
        expect(sm.actionOf(skin.clips.cast)?.isRunning(), `${d.id}: ${skin.clips.cast}`).toBe(true);
        expect(skin.clips.cast).toBe('guard');
      }
      sm.dispose();
    }
    skins.dispose();
    expect(cache.stats()).toEqual({ loaded: 0, loading: 0, refs: 0 });
  }, 120_000);

  it('mọi clip khai báo trong bảng đều có trong GLB (đủ idle/run/attack/hit/death)', () => {
    for (const [id, s] of Object.entries(MONSTER_SKINS)) {
      if (s.mannequin) continue; // clip UAL nằm ở anim_ual_native, kiểm ở mannequinMonster.test.ts
      const anims = (MANIFEST.assets[s.asset] as { animations?: string[] }).animations ?? [];
      for (const st of ['idle', 'run', 'attack', 'hit', 'death'] as const) expect(s.clips[st], `${id}.${st}`).toBeDefined();
      for (const clip of Object.values(s.clips)) expect(anims, `${id}: ${clip}`).toContain(clip);
    }
  });

  it('Kiếm Linh dùng chung model và texture Hỏa Vân Hồ, đổi bảng màu bằng shader', async () => {
    const { skins } = await wolfSkins();
    const [fox, spirit] = ['mon_hoa_van_ho', 'mon_kiem_linh'].map((id) => {
      const m = skins.create(MONSTER.get(id)!);
      let mat!: THREE.MeshStandardNodeMaterial;
      m.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) mat = (o as THREE.Mesh).material as THREE.MeshStandardNodeMaterial;
      });
      m.dispose();
      return mat;
    });
    expect(MONSTER_SKINS.mon_kiem_linh.asset).toBe(MONSTER_SKINS.mon_hoa_van_ho.asset);
    expect(spirit).not.toBe(fox);
    expect(spirit.map).toBe(fox.map);
    expect(spirit.colorNode).toBeTruthy();
    expect(spirit.emissiveNode).toBeTruthy();
    expect(fox.colorNode).toBeFalsy();
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

  it('ma trận xương chỉ tính lại khi mixer chạy (không tính thừa mỗi khung)', async () => {
    const { skins } = await wolfSkins();
    const w = skins.create(MONSTER.get('mon_soi_xam')!) as SkinnedMonster;
    let sk: THREE.Skeleton | undefined;
    w.root.traverse((o) => (sk ??= (o as THREE.SkinnedMesh).skeleton));
    expect(sk).toBeDefined();
    const spy = vi.spyOn(THREE.Skeleton.prototype, 'update');
    sk!.update();
    expect(spy).toHaveBeenCalledTimes(1);
    // Bộ xương chưa đổi: lần vẽ sau (khung sau, pass bóng) không tính lại.
    sk!.update();
    sk!.update();
    expect(spy).toHaveBeenCalledTimes(1);
    const before = Array.from(sk!.boneMatrices);
    // LOD2: mixer chỉ chạy khi gộp đủ dt; chưa chạy thì vẫn không tính lại.
    w.setViewDistance(200);
    w.update(1 / 60, anim({ speed: 6 }));
    sk!.update();
    expect(spy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) w.update(1 / 60, anim({ speed: 6 }));
    sk!.update();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(Array.from(sk!.boneMatrices)).not.toEqual(before);
    spy.mockRestore();
    // Cây con GLB tĩnh: không compose lại ma trận cục bộ mỗi khung; root/inner vẫn tự cập nhật.
    let meshes = 0;
    w.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshes++;
        expect(o.matrixAutoUpdate).toBe(false);
      }
    });
    expect(meshes).toBeGreaterThan(0);
    expect(w.root.matrixAutoUpdate).toBe(true);
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
    // Mỗi asset trong bảng giữ đúng một handle mẫu.
    // Kiếm rời của quái (DV-2 đợt 3, `weapon`) cũng là một handle mẫu.
    const assetCount = new Set(LIVE_SKINS.flatMap(([, s]) => (s.weapon ? [s.asset, s.weapon.asset] : [s.asset]))).size;
    // Quái Mannequin (DV-2 đợt 2) giữ thêm một handle: thư viện clip UAL dùng chung.
    const libs = LIVE_SKINS.some(([, s]) => s.mannequin) ? 1 : 0;
    expect(cache.stats()).toEqual({ loaded: assetCount + libs, loading: 0, refs: assetCount + libs });
    skins.dispose();
    expect(cache.stats()).toEqual({ loaded: 0, loading: 0, refs: 0 });
    const weapons = new Set(LIVE_SKINS.flatMap(([, s]) => (s.weapon ? [s.weapon.asset] : []))).size; // kiếm rời: một lưới
    expect(disposed.filter((d) => d === 'geometry').length).toBe(3 * (assetCount - weapons) + weapons); // 3 mức LOD mỗi asset
    expect(disposed).toContain('texture');
  });

  it('nạp lỗi thì dùng model khối', async () => {
    const { skins } = await wolfSkins([], true);
    expect(skins.pending(MONSTER.get('mon_soi_xam')!)).toBe(false);
    expect(skins.create(MONSTER.get('mon_soi_xam')!)).toBeInstanceOf(MonsterModel);
    skins.dispose();
  });
});
