import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { NPCS as ALL_NPCS } from '@dtl/content';

/** NPC dựng ở Vân Lam. NPC của level khác (Hứa lão ở Đoạn Mạch) có model riêng do E2-H nhập. */
const NPCS = ALL_NPCS.filter((n) => (n.level ?? 'van_lam') === 'van_lam');
import { AssetCache, type Manifest } from '../core/assets';
import { Humanoid } from '../core/models';
import { NPC_SKINS, NpcSkins } from './npcSkins';
import { SkinnedCharacter } from './skinned';
import type { AnimState } from './view';
import { nodeGltfLoader } from '../core/gltfTestLoader';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const STAND: AnimState = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false };

async function skins(fail = false, legacy = false) {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      if (fail) throw new Error('mạng lỗi');
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = nodeGltfLoader();
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
  const s = new NpcSkins(cache, legacy);
  s.preload();
  for (let i = 0; i < 200 && NPCS.some((n) => s.pending(n.id)); i++) await new Promise((r) => setTimeout(r, 10));
  return s;
}

/** Chiều cao khai báo trong meta.json (import.size.height). */
const HEIGHT: Record<string, number> = {
  npc_duoc_su: 1.65,
  npc_thiet_lao: 1.7,
  npc_chuong_mon: 1.75,
  npc_mieu_cong: 1.7,
  npc_hai_duoc: 1.65,
  npc_tieu_khe: 1.75,
};

describe('model NPC (M3-6)', () => {
  it('mọi NPC trong npcs.json có asset trong bảng và trong manifest', () => {
    for (const n of NPCS) {
      const s = NPC_SKINS[n.id]!;
      expect(s, n.id).toBeDefined();
      expect(MANIFEST.assets[s.asset], s.asset).toBeDefined();
    }
  });

  it('nạp xong thì dựng model có xương đúng chiều cao, đủ 5 clip, idle đang phát (không T-pose)', async () => {
    const s = await skins();
    for (const n of NPCS) {
      const m = s.create(n.id, n.color) as SkinnedCharacter;
      expect(m, n.id).toBeInstanceOf(SkinnedCharacter);
      expect(m.height).toBeCloseTo(HEIGHT[n.id]!, 1);
      expect(m.state).toBe('idle');
      for (let t = 0; t < 1; t += 1 / 30) m.update(1 / 30, STAND);
      expect(m.state).toBe('idle');
      expect(m.actionOf('idle')?.isRunning()).toBe(true);
      // Bảng clip riêng của SkinnedCharacter (tên clip → AnimationClip).
      const names = (m as unknown as { clips: Map<string, THREE.AnimationClip> }).clips;
      for (const c of ['idle', 'run', 'heavy_chop', 'hit_light', 'death']) expect(names.has(c), `${n.id}/${c}`).toBe(true);
      m.dispose();
    }
    s.dispose();
  });

  it('nạp lỗi hoặc ?models=legacy thì dùng model khối', async () => {
    for (const s of [await skins(true), await skins(false, true)]) {
      for (const n of NPCS) {
        expect(s.pending(n.id)).toBe(false);
        const m = s.create(n.id, n.color);
        expect(m).toBeInstanceOf(Humanoid);
        m.dispose();
      }
      s.dispose();
    }
  });
});
