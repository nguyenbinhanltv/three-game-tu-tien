import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { APPEARANCE } from '@dtl/content';
import { AssetCache, type Manifest } from '../core/assets';
import { PlayerSkins, type SkinnedPlayer } from '../character/playerSkins';
import type { EntityManager as EM, PState, WorldView } from './entities';
import { nodeGltfLoader } from '../core/gltfTestLoader';

// Kiếm riêng theo trang bị đi đúng đường EntityManager: kiếm chưa nạp khi người chơi đổi vũ khí (hoặc vào game lúc mẫu nhân vật
// còn nạp), nạp xong thì model phải được dựng lại với đúng kiếm (lỗi cũ: `pending` tính trước `create` nên không bao giờ dựng lại).
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;

function stubCanvas(): void {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })),
    set: (t, k, v) => ((t[k] = v), true),
  });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

const testCache = () =>
  new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = nodeGltfLoader();
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });

const player = (wp: string): PState => ({
  name: 'Kiem', x: 0, y: 0, z: 0, yaw: 0, vy: 0, gr: true, fl: 0, lv: 15, hp: 100, mhp: 100, mp: 10, mmp: 10, seq: 0, wp, g: 'm', dye: APPEARANCE.defaultDye,
});

let EntityManager: typeof EM;
beforeAll(async () => {
  stubCanvas();
  ({ EntityManager } = await import('./entities'));
});

type SwordInternals = { blade: THREE.Mesh | null };
type SkinsInternals = { swords: Map<string, { mesh: THREE.Mesh } | string> };

async function run(preloadFirst: boolean): Promise<void> {
  const em = new EntityManager(new THREE.Scene(), 'me', 'kiem_trung');
  const skins = new PlayerSkins(testCache(), false);
  (em as unknown as { playerSkins: PlayerSkins }).playerSkins = skins;
  const look = { g: 'm', dye: APPEARANCE.defaultDye };
  skins.preload();
  if (preloadFirst) for (let i = 0; i < 300 && skins.pending(look); i++) await new Promise((r) => setTimeout(r, 10));
  const view: WorldView = { level: 'kiem_trung', players: new Map([['me', player('')]]), monsters: new Map(), nodes: new Map() };
  const local = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, airborne: false };
  em.update(1 / 60, view, local, '', 1);
  // Đổi sang kiếm Thiết (model riêng, chưa nạp).
  view.players.get('me')!.wp = 'itm_thiet_kiem';
  let thiet: THREE.Mesh | null = null;
  for (let i = 0; i < 600 && !thiet; i++) {
    em.update(1 / 60, view, local, '', 1);
    await new Promise((r) => setTimeout(r, 5));
    const s = (skins as unknown as SkinsInternals).swords.get('prop_kiem_thiet');
    const blade = ((em.players.get('me')!.model as unknown as SwordInternals).blade ?? null) as THREE.Mesh | null;
    if (typeof s === 'object' && blade && blade.material === s.mesh.material) thiet = blade;
  }
  expect(thiet, 'model phải đổi sang kiếm Thiết sau khi nạp xong').toBeTruthy();
  expect((em.players.get('me')!.model as SkinnedPlayer).constructor.name).toBe('SkinnedPlayer');
  em.dispose();
}

describe('EntityManager: kiếm riêng theo trang bị', () => {
  it('mẫu nhân vật đã nạp, kiếm Thiết chưa nạp: nạp xong thì dựng lại với kiếm Thiết', () => run(true), 20_000);
  it('vào game lúc mẫu nhân vật còn nạp rồi đổi vũ khí: cuối cùng cầm kiếm Thiết', () => run(false), 20_000);
});
