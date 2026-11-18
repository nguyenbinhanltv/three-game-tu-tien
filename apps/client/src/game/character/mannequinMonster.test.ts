import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MONSTER } from '@dtl/content';
import { AssetCache, type Manifest } from '../assets';
import { nodeGltfLoader } from '../gltfTestLoader';
import { MQ_CLIPS, MQ_MOVES, MQ_ZOMBIE_CLIPS, MQ_ZOMBIE_MOVES, MQ_SHIELD_CLIPS, pelvisScaledClips } from './mannequinMonster';
import { MONSTER_SKINS, MonsterSkins } from './monsterSkins';
import { SkinnedMonster } from './skinned';
import type { AnimState } from './view';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const IDS = ['mon_tan_chung', 'mon_giac_kiem_trong_binh', 'elite_hoi_giac_cu_thu', 'boss_tan_hoa_kiem_co', 'boss_kim_da_ma_hau', 'boss_thu_khich_duc_chu'];
const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });

function cache(): AssetCache {
  return new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      return nodeGltfLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
}

describe('quái hai chân Mannequin (DV-2 đợt 2)', () => {
  it('ba quái khai `mannequin`, không IK chân, có level và đủ dữ liệu', () => {
    for (const id of IDS) {
      const s = MONSTER_SKINS[id];
      expect(s?.mannequin, id).toBe(true);
      expect(s.legs).toBe('none');
      expect(s.level).toBe('bac_hoang');
      expect(MONSTER.get(id), id).toBeTruthy();
      expect(MANIFEST.assets[id], id).toBeTruthy();
    }
  });

  it('pelvisScaledClips nhân kênh pelvis.position, không sửa clip gốc', () => {
    const mk = (y: number) => {
      const g = new THREE.Group();
      const p = new THREE.Object3D();
      p.name = 'pelvis';
      p.position.set(0, y, 0);
      g.add(p);
      return g;
    };
    const clip = new THREE.AnimationClip('c', 1, [new THREE.VectorKeyframeTrack('pelvis.position', [0, 1], [0, 1, 0, 0, 2, 0]), new THREE.VectorKeyframeTrack('pelvis.quaternion', [0], [0, 0, 0, 1])]);
    const out = pelvisScaledClips(mk(2), mk(1), [clip]);
    expect(Array.from(out[0].tracks[0].values)).toEqual([0, 2, 0, 0, 4, 0]);
    expect(Array.from(clip.tracks[0].values)).toEqual([0, 1, 0, 0, 2, 0]);
    expect(Array.from(out[0].tracks[1].values)).toEqual([0, 0, 0, 1]);
  });

  it('dựng thật từ GLB đã build: mọi clip trong ClipMap/moves có trong thư viện UAL, chạy được các trạng thái', async () => {
    const c = cache();
    const skins = new MonsterSkins(c, false);
    for (const id of IDS) skins.preloadLazy('bac_hoang');
    for (const id of IDS) for (let i = 0; i < 400 && skins.pending(MONSTER.get(id)!); i++) await new Promise((r) => setTimeout(r, 10));
    for (const id of IDS) {
      const s = MONSTER_SKINS[id];
      const m = skins.create(MONSTER.get(id)!);
      expect(m, id).toBeInstanceOf(SkinnedMonster);
      // chạy đứng, chạy, đánh, trúng đòn, chết: không ném lỗi
      const sm = m as SkinnedMonster;
      for (const a of [anim(), anim({ speed: 4 }), anim({ speed: 0, dead: false })]) for (let i = 0; i < 20; i++) sm.update(1 / 60, a);
      sm.attack();
      for (let i = 0; i < 30; i++) sm.update(1 / 60, anim());
      for (let i = 0; i < 20; i++) sm.update(1 / 60, anim());
      for (let i = 0; i < 60; i++) sm.update(1 / 60, anim({ dead: true }));
      expect(s.moves).toBeTruthy();
      if (s.weapon) {
        // Kiếm rời là mesh con của `inner`, mỗi khung chép ma trận xương cổ tay phải (`dtl_sword`).
        const hand = sm.rig.getObjectByName('dtl_sword');
        expect(hand, id).toBeTruthy();
        const blade = sm.root.children[0].children.find((c) => (c as THREE.Mesh).isMesh && !(c as THREE.SkinnedMesh).isSkinnedMesh);
        expect(blade, id).toBeTruthy();
        expect(blade!.matrixAutoUpdate).toBe(false);
      }
      sm.dispose();
    }
    skins.dispose();
  });

  it('tên clip trong bảng đều là clip UAL có thật trong thư viện build', async () => {
    const c = cache();
    const lib = await c.acquire('anim_ual_native');
    const names = new Set(lib.animations.map((a) => a.name));
    const used = new Set<string>();
    for (const map of [MQ_CLIPS, MQ_ZOMBIE_CLIPS, MQ_SHIELD_CLIPS]) for (const v of Object.values(map)) used.add(v);
    for (const mv of [MQ_MOVES, MQ_ZOMBIE_MOVES]) for (const m of Object.values(mv)) used.add(m!.clip);
    for (const n of used) expect(names.has(n), n).toBe(true);
    lib.release();
  });
});
