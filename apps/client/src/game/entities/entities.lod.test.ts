import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { APPEARANCE } from '@dtl/content';
import { AssetCache, type Manifest } from '../core/assets';
import { PlayerSkins, type SkinnedPlayer } from '../character/playerSkins';
import { NpcSkins } from '../character/npcSkins';
import { MonsterSkins } from '../character/monsterSkins';
import type { SkinnedCharacter } from '../character/skinned';
import { groundAt, MS_IDLE } from '@dtl/shared';
import type { EntityManager as EM, PState, WorldView } from './entities';
import { nodeGltfLoader } from '../core/gltfTestLoader';

// M3-9: LOD theo camera đi qua EntityManager.update thật (không chỉ setView). Node không có canvas: thay bằng canvas giả
// đủ cho nhãn tên (makeLabel) và dấu nhiệm vụ.
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;

function stubCanvas(): void {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })),
    set: (t, k, v) => ((t[k] = v), true),
  });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

function testCache(): AssetCache {
  return new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = nodeGltfLoader();
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
}

async function skins(): Promise<PlayerSkins> {
  const cache = testCache();
  const s = new PlayerSkins(cache, false);
  s.preload();
  const look = { g: 'm', dye: APPEARANCE.defaultDye };
  for (let i = 0; i < 100 && s.pending(look); i++) await new Promise((r) => setTimeout(r, 10));
  return s;
}

const player = (name: string, x: number, z: number): PState => ({
  name,
  x,
  y: 0,
  z,
  yaw: 0,
  vy: 0,
  gr: true,
  fl: 0,
  lv: 1,
  hp: 100,
  mhp: 100,
  mp: 10,
  mmp: 10,
  seq: 0,
  wp: '',
  g: 'm',
  dye: APPEARANCE.defaultDye,
});

let EntityManager: typeof EM;
beforeAll(async () => {
  stubCanvas();
  ({ EntityManager } = await import('./entities'));
});

describe('EntityManager: LOD theo camera (M3-9)', () => {
  it('người chơi ngoài khung nhìn không chạy mixer qua EntityManager.update; người trong khung vẫn chạy', async () => {
    const em = new EntityManager(new THREE.Scene(), 'me', 'kiem_trung');
    (em as unknown as { playerSkins: PlayerSkins }).playerSkins = await skins();
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 9000);
    cam.position.set(0, 2, 8);
    cam.lookAt(0, 1, 0);
    cam.updateMatrixWorld();
    em.camera = cam;
    const view: WorldView = {
      level: 'kiem_trung',
      players: new Map([
        ['me', player('Minh', 0, 0)],
        ['front', player('Truoc', 1, -4)],
        // Sau lưng camera: ngoài khung nhìn.
        ['behind', player('Sau', 0, 30)],
      ]),
      monsters: new Map(),
      nodes: new Map(),
    };
    const local = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, airborne: false };
    for (let i = 0; i < 3; i++) em.update(1 / 60, view, local, '', 1);
    const model = (sid: string) => em.players.get(sid)!.model as SkinnedPlayer;
    expect(model('behind').constructor.name).toBe('SkinnedPlayer');
    const behind = model('behind').actionOf('idle')!;
    const front = model('front').actionOf('idle')!;
    const tb = behind.time;
    const tf = front.time;
    for (let i = 0; i < 30; i++) em.update(1 / 60, view, local, '', 1);
    expect(behind.time).toBe(tb);
    expect(front.time).toBeGreaterThan(tf + 0.3);
    // Gần camera, trong suất: LOD0 có bóng; sau lưng: nhóm trong ẩn, không đổ bóng.
    expect(model('front').lod).toBe(0);
    expect(em.lodStats().offscreen).toBe(1);
    let shadowBehind = false;
    model('behind').root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible && (o as THREE.Mesh).castShadow) shadowBehind = true;
    });
    expect(shadowBehind).toBe(false);
    em.dispose();
  });

  it('NPC và quái có xương cũng đi qua suất LOD: ngoài khung nhìn không chạy mixer', async () => {
    const em = new EntityManager(new THREE.Scene(), 'me', 'van_lam');
    const cache = testCache();
    const npcSkins = new NpcSkins(cache, false);
    npcSkins.preload();
    const monSkins = new MonsterSkins(cache, false);
    monSkins.preload();
    for (let i = 0; i < 500 && ['npc_chuong_mon', 'npc_duoc_su', 'npc_thiet_lao'].some((id) => npcSkins.pending(id)); i++)
      await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 50));
    Object.assign(em as unknown as Record<string, unknown>, { npcSkins, skins: monSkins });
    // Camera giữa sân nhìn về Chính điện (-z): chưởng môn trước mặt; dược sư, Thiết lão ở hai bên ngoài khung nhìn.
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 9000);
    const gy = groundAt(2048, 2100);
    cam.position.set(2048, gy + 2, 2100);
    cam.lookAt(2048, gy + 1, 2030);
    cam.updateMatrixWorld();
    em.camera = cam;
    const mon = (x: number, z: number) => ({ t: 'mon_soi_xam', x, y: groundAt(x, z), z, yaw: 0, hp: 50, mhp: 50, lv: 1, st: MS_IDLE });
    const view: WorldView = {
      level: 'van_lam',
      players: new Map([['me', player('Minh', 2048, 2095)]]),
      monsters: new Map([
        ['m_front', mon(2048, 2080)],
        ['m_behind', mon(2048, 2140)],
      ]),
      nodes: new Map(),
    };
    const local = { x: 2048, y: groundAt(2048, 2095), z: 2095, yaw: 0, speed: 0, airborne: false };
    for (let i = 0; i < 3; i++) em.update(1 / 60, view, local, '', 1);
    const npc = (id: string) => em.npcs.find((n) => n.id === id)!.model as unknown as SkinnedCharacter;
    const monster = (id: string) => em.monsters.get(id)!.model as unknown as SkinnedCharacter;
    const cases = [
      { m: npc('npc_chuong_mon'), moves: true },
      { m: npc('npc_duoc_su'), moves: false },
      { m: npc('npc_thiet_lao'), moves: false },
      { m: monster('m_front'), moves: true },
      { m: monster('m_behind'), moves: false },
    ];
    for (const c of cases) expect(c.m.actionOf, 'model có xương').toBeTypeOf('function');
    const t0 = cases.map((c) => c.m.actionOf('idle')!.time);
    for (let i = 0; i < 30; i++) em.update(1 / 60, view, local, '', 1);
    cases.forEach((c, i) => {
      const t = c.m.actionOf('idle')!.time;
      // Clip idle lặp: t0 có thể sát cuối clip (phụ thuộc thời gian nạp), nên đo phần tiến lên theo modulo độ dài clip.
      const dur = c.m.actionOf('idle')!.getClip().duration;
      if (c.moves) expect((t - t0[i] + dur) % dur).toBeGreaterThan(0);
      else expect(t).toBe(t0[i]);
    });
    em.dispose();
  });

  it('nhãn NPC ẩn trong cắt cảnh và hiện lại khi hết cảnh', () => {
    const em = new EntityManager(new THREE.Scene(), 'me', 'van_lam');
    const view: WorldView = { level: 'van_lam', players: new Map([['me', player('Minh', 0, 0)]]), monsters: new Map(), nodes: new Map() };
    const local = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, airborne: false };
    expect(em.npcs.length).toBeGreaterThan(0);
    em.tagsHidden = true;
    em.update(1 / 60, view, local, '', 1);
    expect(em.npcs.every((n) => !n.label.visible)).toBe(true);
    em.tagsHidden = false;
    em.update(1 / 60, view, local, '', 1);
    expect(em.npcs.every((n) => n.label.visible)).toBe(true);
    em.dispose();
  });
});
