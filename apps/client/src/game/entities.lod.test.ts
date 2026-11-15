import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { APPEARANCE } from '@dtl/content';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from './assets';
import { PlayerSkins, type SkinnedPlayer } from './character/playerSkins';
import type { EntityManager as EM, PState, WorldView } from './entities';

// M3-9: LOD theo camera đi qua EntityManager.update thật (không chỉ setView). Node không có canvas: thay bằng canvas giả
// đủ cho nhãn tên (makeLabel) và dấu nhiệm vụ.
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;

function stubCanvas(): void {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })),
    set: (t, k, v) => ((t[k] = v), true),
  });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

async function skins(): Promise<PlayerSkins> {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = createGltfLoader(createKtx2Loader());
      loader.register(() => ({ name: 'test_stub_texture', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
  const s = new PlayerSkins(cache, false);
  s.preload();
  const look = { g: 'm', dye: APPEARANCE.defaultDye };
  for (let i = 0; i < 100 && s.pending(look); i++) await new Promise((r) => setTimeout(r, 10));
  return s;
}

const player = (name: string, x: number, z: number): PState => ({
  name, x, y: 0, z, yaw: 0, vy: 0, gr: true, fl: 0, lv: 1, hp: 100, mhp: 100, mp: 10, mmp: 10, seq: 0, wp: '', g: 'm', dye: APPEARANCE.defaultDye,
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
});
